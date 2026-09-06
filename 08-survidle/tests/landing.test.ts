import { describe, expect, it } from "vitest";
import { advance } from "../src/sim/advance";
import { calendar, COAST_OPEN_FROM, COAST_OPEN_TO, coastOpen } from "../src/sim/calendar";
import { addItem, herePile, pile, qty } from "../src/sim/inventory";
import { beginAgain, demoteFog, land, landingCell, landingDate } from "../src/sim/landing";
import { fmtName } from "../src/sim/names";
import { newGame } from "../src/sim/newgame";
import { die } from "../src/sim/player";
import { placeAtSpot } from "../src/sim/position";
import { current } from "../src/sim/record";
import { DIM, discovery, enterRegion, regionState } from "../src/sim/regionstate";
import { seasonalMean } from "../src/sim/weather";
import { mapHtml } from "../src/ui/map";
import { tombstoneHtml } from "../src/ui/panels";
import { newUiState, resetPanels, setPanel } from "../src/ui/render";
import { CELL_KM } from "../src/units";
import { cellAt, neighbours, regionAt } from "../src/world/gen";

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
  it("picks a shore cell 3 to 20 km from the old camp, the same one every time", () => {
    for (const seed of [17, 19, 42, 79]) {
      const { state, world } = newGame(seed);
      const camp = regionState(state, world, state.player.region).campCell;
      const a = landingCell(world, camp, seed, 2);
      expect(landingCell(world, camp, seed, 2)).toBe(a);
      const c = cellAt(world, a);
      expect(c.terrain).not.toBe("water");
      expect(neighbours(world, a).some((n) => cellAt(world, n).terrain === "water")).toBe(true);
      const cc = cellAt(world, camp);
      const km = Math.hypot(c.x - cc.x, c.y - cc.y) * CELL_KM;
      expect(km).toBeGreaterThanOrEqual(3);
      expect(km).toBeLessThanOrEqual(20);
    }
  });

  it("begins again: the pack lies where the body fell, the world has run the gap, the fog is dim, the clock is the landing's", () => {
    const { state, world } = newGame(17);
    const st = regionState(state, world, state.player.region);
    st.structures.firePit = true;
    st.structures.leanTo = true;
    addItem(pile(state, st.campCell), "firewood", 10);
    advance(state, world, 20 * 1440);
    const deathCell = Math.floor(state.player.y) * world.w + Math.floor(state.player.x);
    die(state, "froze", regionAt(world, state.player.region).name);
    const packMeat = qty(state.player.pack, "driedMeat");
    beginAgain(state, world);
    expect(state.landing).not.toBeNull();
    expect(state.landing!.gapDays).toBe(90);
    // An idle body with no orders dies well inside 20 days (here of thirst,
    // since nothing walks it to water), so the explicit die() call above
    // never fires; the gap still runs the 90 days from whenever it fell.
    expect(state.landing!.date).toEqual({ year: 1, doy: 182 });
    expect(state.minute).toBe(0);
    expect(state.startDoy).toBe(182);
    expect(state.year).toBe(1);
    expect(st.structures.leanTo).toBe(true);
    expect(st.structures.firePit).toBe(true);
    expect(qty(pile(state, st.campCell), "firewood")).toBe(10);
    expect(qty(pile(state, deathCell), "driedMeat")).toBeCloseTo(packMeat, 3);
    for (const id of Object.keys(state.discovered)) expect(discovery(state, Number(id))).toBe(DIM);
    expect(state.survivors).toHaveLength(1);
    expect(state.landing!.name.first.length).toBeGreaterThan(0);
  });

  it("reads the old camp from where the survivor built, not from wherever they died", () => {
    const { state, world } = newGame(17);
    const startRegion = state.player.region;
    const st = regionState(state, world, startRegion);
    st.structures.firePit = true;
    st.structures.snares = 2;
    const startName = regionAt(world, startRegion).name;
    const neighbour = regionAt(world, startRegion).neighbours[0].id;
    placeAtSpot(state, world, neighbour, "camp");
    die(state, "froze", regionAt(world, neighbour).name);
    beginAgain(state, world);
    const oldCamp = state.landing!.oldCamp;
    expect(oldCamp).toBe(st.campCell);
    land(state, world, { first: "Ilze", last: "Berg" });
    expect(state.log[0].text).toContain(`The old camp at ${startName}`);
  });

  it("lands: a second survivor with a fresh body, the first log line pointing at the old camp", () => {
    const { state, world } = newGame(17);
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
    expect(state.log[0].text).toMatch(/^\d+ July, year 1\. 90 days after .* died\. You land at .* The old camp at .* lies \d+ km [a-z-]+\.$/);
  });
});

describe("the dim map", () => {
  it("draws a dim region's ground and name only: no pile, no tooltip for one, until it is visited again", () => {
    document.body.innerHTML = `<div id="map"></div>`;
    resetPanels();
    const { state, world } = newGame(17);
    const cal = calendar(0);
    const ui = newUiState();
    addItem(herePile(state, world), "stone", 2);

    setPanel("map", mapHtml(world, state, ui, cal));
    expect(document.querySelectorAll("#map .c.pl").length).toBe(1);

    demoteFog(state);
    setPanel("map", mapHtml(world, state, ui, cal));
    expect(document.querySelectorAll("#map .c.pl").length).toBe(0);
    expect(document.querySelector("#map .c[title*='something lies here']")).toBeNull();

    enterRegion(state, world, state.player.region);
    setPanel("map", mapHtml(world, state, ui, cal));
    expect(document.querySelectorAll("#map .c.pl").length).toBe(1);
  });
});

describe("what the heir is told", () => {
  it("quotes the ancestor's journal for what was built, and the tombstone the ancestor's day", () => {
    const { state, world } = newGame(17);
    const st = regionState(state, world, state.player.region);
    placeAtSpot(state, world, state.player.region, "shore");
    st.structures.firePit = true;
    st.structures.dryingRack = true;
    st.racks = 1;
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
    expect(last).toMatch(new RegExp(`The journal of ${fmtName(state.survivors[0].name)} lists a fire pit, snares and a drying rack at `));
    // The tombstone after the heir dies names the ancestor's day.
    advance(state, world, 3 * 1440);
    die(state, "froze");
    const html = tombstoneHtml(state, world);
    expect(html).toContain(`${fmtName(state.survivors[0].name)} lived ${firstDay} days.`);
  });

  it("says nothing about the journal when nothing was built, and the first tombstone has no comparison", () => {
    const { state, world } = newGame(17);
    placeAtSpot(state, world, state.player.region, "shore");
    advance(state, world, 2 * 1440);
    die(state, "starved");
    const html = tombstoneHtml(state, world);
    expect(html).not.toContain(" lived ");
    beginAgain(state, world);
    land(state, world, { first: "Aino", last: "Berzins" });
    expect(state.log[state.log.length - 1].text).not.toContain("journal");
  });
});
