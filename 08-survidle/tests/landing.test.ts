import { describe, expect, it } from "vitest";
import { knowledgeAt } from "../src/sim/fineknowledge";
import { advance } from "../src/sim/advance";
import { bodyRowOf, campRowOf, isBodyRow, isCampRow, isCareRow } from "../src/sim/bodyorder";
import { calendar, COAST_OPEN_FROM, COAST_OPEN_TO, coastOpen } from "../src/sim/calendar";
import { addItem, assertPileIndexConsistent, herePile, pile, pileCells, qty } from "../src/sim/inventory";
import { spoilPiles } from "../src/sim/camp";
import { setSkillLevel } from "../src/sim/horizon";
import { giveOrder } from "../src/sim/ladder";
import { beginAgain, demoteFog, land, landingCell, landingDate, LANDING_MAX_KM, LANDING_NEAR_KM, landingReachKm, layDownPack, oldCampHint } from "../src/sim/landing";
import { STRUCTURES } from "../src/sim/items";
import { loadGame, saveGame } from "../src/sim/save";
import { isKnown, knownShare } from "../src/sim/mapped";
import { fmtName } from "../src/sim/names";
import { newGame } from "../src/sim/newgame";
import { seeFrom } from "../src/sim/sight";
import { ordersHere } from "../src/sim/orders";
import { die } from "../src/sim/player";
import { cellOf, placeAtSpot } from "../src/sim/position";
import { current } from "../src/sim/record";
import { campSite, DIM, discovery, enterRegion, regionState, siteFor, VISITED } from "../src/sim/regionstate";
import { SKILL_CAP, SKILL_IDS } from "../src/sim/skills";
import { seasonalMean } from "../src/sim/weather";
import { board, glyphsWith } from "./board";
import { campHtml, tombstoneHtml } from "../src/ui/panels";
import { newUiState, resetPanels } from "../src/ui/render";
import { PATCH_KM } from "../src/world/spatial";
import { cellAt, neighbours, regionAt } from "../src/world/gen";
import { siteCamp } from "./siting-helpers";
import { testAtmosphere } from "./weather-helpers";

describe("the gap", () => {
  it("opens the coast a month after the mean crosses zero in spring and closes when it crosses in autumn", () => {
    const spring = [...Array(365).keys()].find((d) => seasonalMean(d) >= 0)!;
    const autumn = [...Array(365).keys()].find((d) => d > 200 && seasonalMean(d) < 0)!;
    expect(COAST_OPEN_FROM).toBe(spring + 30);
    expect(COAST_OPEN_TO).toBe(autumn);
    expect(coastOpen(COAST_OPEN_FROM)).toBe(true);
    expect(coastOpen(COAST_OPEN_TO)).toBe(false);
  });

  it("lands a season after a spring death, and the next May after an autumn one", () => {
    expect(landingDate({ year: 1, doy: 114 })).toEqual({ date: { year: 1, doy: 204 }, gapDays: 90 });
    expect(landingDate({ year: 1, doy: 243 })).toEqual({ date: { year: 2, doy: 125 }, gapDays: 247 });
    expect(landingDate({ year: 1, doy: 292 })).toEqual({ date: { year: 2, doy: 125 }, gapDays: 198 });
  });
});

describe("the landing", () => {
  it("picks a shore cell within 20 km and never in the camp's own country, the same one every time", () => {
    for (const seed of [17, 19, 42, 79]) {
      const { state, world } = newGame(seed);
      siteCamp(state, world);
      const camp = regionState(state, world, state.player.region).campCell!;
      const a = landingCell(world, camp, seed, 2);
      expect(landingCell(world, camp, seed, 2)).toBe(a);
      const c = cellAt(world, a);
      expect(c.terrain).not.toBe("water");
      expect(neighbours(world, a).some((n) => cellAt(world, n).terrain === "water")).toBe(true);
      const cc = cellAt(world, camp);
      const km = Math.hypot(c.x - cc.x, c.y - cc.y) * PATCH_KM;
      expect(km).toBeLessThanOrEqual(20);
      // Arriving already home is not an arrival: the country next door is the
      // floor, at every level of Wayfinding.
      expect(cellAt(world, a).region).not.toBe(cellAt(world, camp).region);
    }
  });

  it("a carried Wayfinding draws the landing in, and never inside the camp's own country", () => {
    // The ceiling falls from the full reach at level 1 to LANDING_NEAR_KM at
    // the cap, and is monotonic in between: more searching is never a worse
    // landing.
    expect(landingReachKm(1)).toBe(LANDING_MAX_KM);
    expect(landingReachKm(SKILL_CAP)).toBe(LANDING_NEAR_KM);
    expect(landingReachKm(SKILL_CAP * 10)).toBe(LANDING_NEAR_KM);
    let last = Number.POSITIVE_INFINITY;
    for (let l = 1; l <= SKILL_CAP; l++) {
      const km = landingReachKm(l);
      expect(km).toBeLessThanOrEqual(last);
      last = km;
    }

    for (const seed of [17, 19, 42, 79]) {
      const { state, world } = newGame(seed);
      siteCamp(state, world);
      const camp = regionState(state, world, state.player.region).campCell!;
      const cc = cellAt(world, camp);
      const kmAt = (levelOfSkill: number) => {
        const cell = landingCell(world, camp, seed, 2, levelOfSkill);
        expect(cellAt(world, cell).region).not.toBe(cc.region);
        const c = cellAt(world, cell);
        return Math.hypot(c.x - cc.x, c.y - cc.y) * PATCH_KM;
      };
      // A practised lineage is never set down further out than an unpractised
      // one could be. The shores a coast actually offers decide the rest.
      expect(kmAt(SKILL_CAP)).toBeLessThanOrEqual(LANDING_MAX_KM);
      expect(kmAt(1)).toBeLessThanOrEqual(LANDING_MAX_KM);
    }
  });

  it("begins again: the pack lies where the body fell, the world has run the gap, the fog is dim, the clock is the landing's", () => {
    const { state, world } = newGame(17);
    siteCamp(state, world);
    const st = regionState(state, world, state.player.region);
    siteFor(st, st.campCell!).structures.firePit = true;
    siteFor(st, st.campCell!).structures.leanTo = true;
    addItem(pile(state, st.campCell!), "firewood", 10);
    advance(state, world, 20 * 1440);
    const deathCell = cellOf(state, world);
    die(state, "froze", regionAt(world, state.player.region).name);
    const packMeat = qty(state.player.pack, "driedMeat");
    state.advanceCarry = 0.5;
    beginAgain(state, world);
    expect(state.landing).not.toBeNull();
    expect(state.landing!.gapDays).toBe(90);
    // An idle body has its own row on the list and looks after itself on it -
    // the water, the food at camp, the fire, the sleep - so it is still alive
    // at 20 days and the explicit die() above is what ends it. The gap runs
    // its 90 days from there.
    expect(state.landing!.date).toEqual({ year: 1, doy: 200 });
    expect(state.minute).toBe(0);
    expect(state.advanceCarry).toBe(0);
    expect(state.startDoy).toBe(200);
    expect(state.year).toBe(1);
    expect(campSite(st)!.structures.leanTo).toBe(true);
    expect(campSite(st)!.structures.firePit).toBe(true);
    expect(qty(pile(state, st.campCell!), "firewood")).toBe(10);
    expect(qty(pile(state, deathCell), "driedMeat")).toBeCloseTo(packMeat, 3);
    for (const id of Object.keys(state.discovered)) expect(discovery(state, Number(id))).toBe(DIM);
    expect(state.survivors).toHaveLength(1);
    expect(state.landing!.name.first.length).toBeGreaterThan(0);
  });

  it("lays down a pack of nothing but perishables where the body fell, and that food still spoils on schedule", () => {
    // The bypass this guards against only shows with no plain items and no
    // tools in the pack: either one calls addItem on its own and happens to
    // reindex the whole pile as a side effect, which is exactly the
    // incidental behaviour that must not be the thing standing between this
    // food and ever spoiling.
    testAtmosphere({ temperatureC: 10 });
    const { state, world } = newGame(21);
    siteCamp(state, world);
    // A real session has built and read the live index countless times
    // before any particular death - a bypass has to stay caught against an
    // index that already exists, not be hidden by the one-time lazy build
    // a state that had never touched a pile before would get for free.
    addItem(pile(state, cellOf(state, world) + 1), "stone", 1);
    pileCells(state, "perishable");
    state.player.tools = [];
    state.player.pack.items = {};
    addItem(state.player.pack, "rawMeat", 3);
    const deathCell = cellOf(state, world);
    die(state, "starved");
    layDownPack(state, world);

    expect(Object.keys(state.player.pack.items)).toHaveLength(0);
    expect(state.player.tools).toHaveLength(0);
    const dropped = pile(state, deathCell);
    expect(qty(dropped, "rawMeat")).toBeCloseTo(3, 6);
    // The exact finding: with no addItem call anywhere in layDownPack's run,
    // nothing would have reindexed this cell, and it would be invisible to
    // every loop that walks the perishable category.
    expect(pileCells(state, "perishable")).toContain(deathCell);
    assertPileIndexConsistent(state);

    // 36 hours (rawMeat's SPOIL_HOURS) of warm spoilage passes must clear it
    // out, the same as it would for any other perishable pile - proving the
    // spoilage loop actually walks this cell rather than the index merely
    // claiming it does.
    spoilPiles(state, world, 36 * 60 + 1, null);
    expect(qty(pile(state, deathCell), "rawMeat")).toBe(0);
    expect(pileCells(state, "perishable")).not.toContain(deathCell);
    assertPileIndexConsistent(state);
  });

  it("reads the old camp from where the survivor built, not from wherever they died", () => {
    const { state, world } = newGame(17);
    siteCamp(state, world);
    const startRegion = state.player.region;
    const st = regionState(state, world, startRegion);
    siteFor(st, st.campCell!).structures.firePit = true;
    st.snares = 2;
    const startName = regionAt(world, startRegion).name;
    const neighbour = regionAt(world, startRegion).neighbours[0].id;
    placeAtSpot(state, world, neighbour, "camp");
    die(state, "froze", regionAt(world, neighbour).name);
    beginAgain(state, world);
    const oldCamp = state.landing!.oldCamp;
    expect(oldCamp).toBe(st.campCell!);
    land(state, world, { first: "Ilze", last: "Berg" });
    expect(state.log[0].text).toContain(`The old camp at ${startName}`);
  });

  it("an heir lands on ground nobody has walked, keeping only what the eye reaches", () => {
    const { state, world } = newGame(17);
    siteCamp(state, world);
    const startRegion = state.player.region;
    advance(state, world, 5 * 1440);
    const walkedBefore = knownShare(state, world, startRegion);
    expect(walkedBefore).toBeGreaterThan(0);
    die(state, "froze", regionAt(world, startRegion).name);
    beginAgain(state, world);
    land(state, world, { first: "Ilze", last: "Berg" });
    // The ancestor's country is gone. The valley the heir stepped into is not
    // handed over either - only the shore they stand on and what can be seen
    // from it, which is `newPerson`'s own look.
    expect(knownShare(state, world, startRegion)).toBeLessThan(walkedBefore);
    expect(isKnown(state, cellOf(state, world))).toBe(true);
    expect(knownShare(state, world, state.player.region)).toBeLessThan(1);
  });

  it("sighting the old camp hands back its country, and every country the lineage stands in", () => {
    const { state, world } = newGame(17);
    siteCamp(state, world);
    const startRegion = state.player.region;
    const st = regionState(state, world, startRegion);
    siteFor(st, st.campCell!).structures.firePit = true;
    die(state, "froze", regionAt(world, startRegion).name);
    beginAgain(state, world);
    land(state, world, { first: "Ilze", last: "Berg" });
    expect(knownShare(state, world, startRegion)).toBeLessThan(1);
    // The camp comes into view: not the ancestor's footsteps back, but the
    // region entire, which is what a journal and a skyline can honestly say.
    seeFrom(state, world, calendar(state.minute, state.startDoy), st.campCell!, false);
    expect(knownShare(state, world, startRegion)).toBe(1);
    expect(knowledgeAt(state.knowledge, regionAt(world, startRegion).cells[0])).toBe("inherited");
  });

  it("lands: a second survivor with a fresh body, the first log line pointing at the old camp", () => {
    const { state, world } = newGame(17);
    siteCamp(state, world);
    advance(state, world, 5 * 1440);
    die(state, "froze", regionAt(world, state.player.region).name);
    beginAgain(state, world);
    land(state, world, { first: "Ilze", last: "Berg" });
    expect(state.landing).toBeNull();
    expect(state.dead).toBeNull();
    expect(state.survivors).toHaveLength(2);
    expect(current(state).name).toEqual({ first: "Ilze", last: "Berg" });
    expect(current(state).index).toBe(2);
    expect(current(state).gapDays).toBe(90);
    expect(state.player.health).toBe(100);
    expect(state.log[0].text).toMatch(/^\d+ July, year 1\. 90 days after .* died\. \{You\} \{land\} at .* The old camp at .* lies \d+ km [a-z-]+\.$/);
  });
});

describe("the dim map", () => {
  it("draws a dim region's ground and name only: no pile, no tooltip for one, until it is visited again", () => {
    document.body.innerHTML = `<div id="map"></div>`;
    resetPanels();
    const { state, world } = newGame(17);
    siteCamp(state, world);
    const cal = calendar(0);
    const ui = newUiState();
    addItem(herePile(state, world), "stone", 2);

    expect(glyphsWith(board(world, state, ui, cal), "pl").length).toBe(1);

    demoteFog(state);
    const dim = board(world, state, ui, cal);
    expect(glyphsWith(dim, "pl").length).toBe(0);
    expect(dim.glyphs.some((g) => g.info.includes("something lies here"))).toBe(false);

    enterRegion(state, world, state.player.region);
    // A real re-entry always comes with a look around (placeAt's seeFrom);
    // enterRegion alone only marks the region. Marking the one patch underfoot
    // is not a stand-in for that any more: a heir's ground is forgotten rather
    // than dimmed, so at the 300 m rung a single known patch leaves its parent
    // unreadable and the pile on it undrawn. The look is what earns the glyph.
    seeFrom(state, world, cal, cellOf(state, world), false);
    expect(glyphsWith(board(world, state, ui, cal), "pl").length).toBe(1);
  });
});

describe("what the heir is told", () => {
  it("quotes the ancestor's journal for what was built, and the tombstone the ancestor's day", () => {
    const { state, world } = newGame(17);
    siteCamp(state, world);
    const st = regionState(state, world, state.player.region);
    placeAtSpot(state, world, state.player.region, "shore");
    siteFor(st, st.campCell!).structures.firePit = true;
    siteFor(st, st.campCell!).structures.dryingRack = true;
    siteFor(st, st.campCell!).racks = 1;
    const rec = current(state);
    rec.events.push({ kind: "built", structure: "firePit", day: 2, date: { year: 1, doy: 91 } });
    rec.events.push({ kind: "built", structure: "dryingRack", day: 9, date: { year: 1, doy: 98 } });
    rec.events.push({ kind: "built", structure: "snare", day: 3, date: { year: 1, doy: 92 } });
    advance(state, world, 20 * 1440);
    die(state, "starved");
    const firstDay = current(state).died!.day;
    beginAgain(state, world);
    land(state, world, { first: "Aino", last: "Berzins" });
    const last = state.log[state.log.length - 1].text;
    expect(last).toMatch(new RegExp(`The journal of ${fmtName(state.survivors[0].name)} lists a fire site, snares and a drying rack at `));
    // The tombstone after the heir dies names the ancestor's day.
    advance(state, world, 3 * 1440);
    die(state, "froze");
    const html = tombstoneHtml(state, world, newUiState());
    expect(html).toContain(`${fmtName(state.survivors[0].name)} lived ${firstDay} days.`);
    // The quarter carry is a rule of the world, learned here rather than by dying twice.
    expect(html).toContain("a quarter of what");
  });

  // A plan is the dead's and the camp is the world's. The ladder gates an order at the
  // moment it is given, so a list left standing is worked at whatever rung wrote it: an
  // heir who inherited it would run its ancestor's seasons and stock lines from birth,
  // and none of that work would be counted as a morning of its own attention.
  it("leaves the heir the world and not the dead's orders", () => {
    const { state, world } = newGame(17);
    siteCamp(state, world);
    for (const s of SKILL_IDS) setSkillLevel(state, s, 20);
    const region = state.player.region;
    const camp = regionState(state, world, region).campCell!;
    addItem(pile(state, camp), "firewood", 40);
    giveOrder(state, world, { task: "roots", until: { kind: "daily", n: 2 }, deliver: "camp", where: "nearest", when: { season: { from: 90, to: 304 } } }, "job");
    giveOrder(state, world, { task: "chop", until: { kind: "campHas", qty: 300 }, deliver: "camp", where: "nearest" }, "keep");
    // The two care rows plus the two given.
    expect(ordersHere(state, world).length).toBe(4);
    advance(state, world, 1440);
    die(state, "starved");
    beginAgain(state, world);
    land(state, world, { first: "Aino", last: "Berzins" });
    // Every old camp is wiped clean; a landing cell in ground never touched
    // before is a fresh region and carries only the two care rows every
    // fresh region does. Neither carries a real order of the dead's.
    for (const st of Object.values(state.regions)) expect(st.orders.every(isCareRow)).toBe(true);
    // The world is still there: the wood the ancestor split is at the old camp for the heir to find.
    expect(qty(pile(state, camp), "firewood")).toBeGreaterThan(0);
    // The heir's own orders are the only work the list ever holds again.
    giveOrder(state, world, { task: "sticks", until: { kind: "campHas", qty: 10 }, deliver: "camp", where: "nearest" }, "keep");
    const work = regionState(state, world, region)
      .orders.filter((o) => !isCareRow(o))
      .map((o) => o.req.task);
    expect(work).toEqual(state.player.region === region ? ["sticks"] : []);
  });

  // A body is not a plan. The heir has thirst, hunger, cold and sleep from the
  // hour it lands, and the two rows that answer them are the only thing on a
  // region's list that no survivor ever chose to put there - so the wipe that
  // takes the dead's work must hand them back, on every region the dead had
  // touched as well as on the fresh ground the boat comes to.
  it("leaves the heir a body row and a camp row in every region", () => {
    const { state, world } = newGame(17);
    const home = state.player.region;
    for (const s of SKILL_IDS) setSkillLevel(state, s, 20);
    giveOrder(state, world, { task: "sticks", until: { kind: "campHas", qty: 10 }, deliver: "camp", where: "nearest" }, "keep");
    advance(state, world, 1440);
    die(state, "starved");
    beginAgain(state, world);
    land(state, world, { first: "Aino", last: "Berzins" });
    const regions = [...new Set([home, state.player.region, ...Object.keys(state.regions).map(Number)])];
    for (const id of regions) {
      const st = regionState(state, world, id);
      expect(st.orders.filter(isBodyRow).length).toBe(1);
      expect(st.orders.filter(isCampRow).length).toBe(1);
    }
    // And they are where a fresh list puts them: the care rows above the work.
    expect(bodyRowOf(state, world)).not.toBe(null);
    expect(campRowOf(state, world)).not.toBe(null);
  });

  // A wipe is a wipe: a build order still sitting at its planned zero has
  // nothing left to want it once every order in the region is gone, so it
  // leaves no more trace than the order itself does. A structure already
  // under way is not a plan, it is ground already broken - the same
  // "structures, the piles, the snares" the heir inherits everywhere else.
  it("clears a still-planned build's site entry on death, and keeps a part-built one", () => {
    const { state, world } = newGame(17);
    siteCamp(state, world);
    const region = state.player.region;
    const st = regionState(state, world, region);
    const camp = st.campCell!;
    giveOrder(state, world, { task: "build", arg: "vedbod", until: { kind: "once" }, deliver: "camp", where: { cell: camp } }, "job");
    giveOrder(state, world, { task: "build", arg: "leanTo", until: { kind: "once" }, deliver: "camp", where: { cell: camp } }, "job");
    // Stands in for real minutes already banked on the lean-to before the survivor died.
    // No advance here: the camp starts with enough of a lean-to's materials in reach that
    // running the clock would let the scheduler actually finish it, which is not this test.
    siteFor(st, camp).build.leanTo = 42;
    die(state, "starved");
    beginAgain(state, world);
    land(state, world, { first: "Aino", last: "Berzins" });
    const site = campSite(regionState(state, world, region))!;
    expect(site.build.vedbod).toBeUndefined();
    expect(site.build.leanTo).toBe(42);
    // campHtml reads the standing survivor's own region; read the old camp's
    // sheet by standing the heir there for the assertion.
    state.player.region = region;
    expect(campHtml(state, world, calendar(state.minute, state.startDoy))).not.toContain("vedbod");
  });

  it("says nothing about the journal when nothing was built, and the first tombstone has no comparison", () => {
    const { state, world } = newGame(17);
    siteCamp(state, world);
    placeAtSpot(state, world, state.player.region, "shore");
    advance(state, world, 2 * 1440);
    die(state, "starved");
    const html = tombstoneHtml(state, world, newUiState());
    expect(html).not.toContain(" lived ");
    beginAgain(state, world);
    land(state, world, { first: "Aino", last: "Berzins" });
    expect(state.log[state.log.length - 1].text).not.toContain("journal");
  });
});

/** A storage saveGame and loadGame can use without a DOM. */
function memoryStorage(): Storage {
  const store = new Map<string, string>();
  return {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  } as unknown as Storage;
}

describe("the way to the old camp", () => {
  /** An ancestor with a camp and a fire site, dead a region over, and the heir landed. */
  function heir() {
    const { state, world } = newGame(17);
    siteCamp(state, world);
    const home = state.player.region;
    const st = regionState(state, world, home);
    siteFor(st, st.campCell!).structures.firePit = true;
    current(state).events.push({ kind: "built", structure: "firePit", day: 2, date: { year: 1, doy: 91 } });
    const neighbour = regionAt(world, home).neighbours[0].id;
    placeAtSpot(state, world, neighbour, "camp");
    die(state, "froze", regionAt(world, neighbour).name);
    beginAgain(state, world);
    land(state, world, { first: "Ilze", last: "Berg" });
    return { state, world, home, camp: st.campCell! };
  }

  it("keeps the old camp on the heir's record, and none on a first survivor's", () => {
    const first = newGame(17);
    expect(current(first.state).oldCamp ?? null).toBeNull();
    expect(oldCampHint(first.state, first.world)).toBeNull();
    const { state, camp } = heir();
    expect(current(state).oldCamp).toBe(camp);
  });

  it("says the landing line's bearing again from wherever the heir stands, until they walk into that country", () => {
    const { state, world, home, camp } = heir();
    // The heir lands in fresh country: the old camp's region is the journal's, not this life's.
    expect(discovery(state, home)).toBe(DIM);
    const h = oldCampHint(state, world)!;
    expect(h).not.toBeNull();
    expect(h.cell).toBe(camp);
    expect(h.region).toBe(home);
    expect(h.name).toBe(regionAt(world, home).name);
    // Read from the landing cell, it is the landing line, word for word.
    expect(state.log[0].text).toContain(`The old camp at ${h.name} lies ${h.km} km ${h.bearing}.`);
    expect(h.built).toBe(`a ${STRUCTURES.firePit.name}`);
    expect(h.ancestor).toBe(fmtName(state.survivors[0].name));
    enterRegion(state, world, home);
    expect(discovery(state, home)).toBe(VISITED);
    expect(oldCampHint(state, world)).toBeNull();
  });

  it("reads an old save's heir back off the world, and leaves an ancestor's record unknown", () => {
    const { state, camp } = heir();
    delete current(state).oldCamp;
    delete state.survivors[0].oldCamp;
    const storage = memoryStorage();
    saveGame(state, storage);
    const loaded = loadGame(storage)!.state;
    expect(current(loaded).oldCamp).toBe(camp);
    expect(loaded.survivors[0].oldCamp).toBeNull();
  });
});
