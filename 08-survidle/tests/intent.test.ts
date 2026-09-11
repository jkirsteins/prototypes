import { beforeEach, describe, expect, it } from "vitest";
import { Rng } from "../src/rng";
import { advance } from "../src/sim/advance";
import { calendar } from "../src/sim/calendar";
import { intentOption, type IntentRequest, intentSentence, resolveCell, startIntent } from "../src/sim/intent";
import { addItem, hasTool, herePile, isEmpty, pile, qty } from "../src/sim/inventory";
import { huntEstimate, noteHuntSign } from "../src/sim/hunting";
import { ITEM_KG, SAP_FROM_DOY } from "../src/sim/items";
import { mapRegion } from "../src/sim/mapped";
import { newGame } from "../src/sim/newgame";
import { huntedLand, SPECIES_DEFS } from "../src/sim/species";
import { cellOf, forestCell, heathCell, kmBetween, placeAt, placeAtSpot } from "../src/sim/position";
import { campSite, regionState, siteFor } from "../src/sim/regionstate";
import { readSave, serialize } from "../src/sim/save";
import { check, stepTask, stopTask , isShortAtCamp } from "../src/sim/tasks";
import { setSkillLevel } from "../src/sim/horizon";
import { SKILL_IDS } from "../src/sim/skills";
import { takeStep } from "../src/sim/steps";
import { ICE_SHORE_CM } from "../src/sim/water";
import type { Intent, TaskId } from "../src/sim/types";
import { cellAt, cellIdx, regionAt, spotOf, terrainOf, WORLD_H, WORLD_W, type World } from "../src/world/gen";
import { siteCamp } from "./siting-helpers";
import { dryForestNear, forestKindNear, regionWithSpots } from "./world-facts";
import { testAtmosphere } from "./weather-helpers";
import { ensureGround } from "../src/sim/weather";

beforeEach(() => testAtmosphere());

const cal = calendar(0);

/** No reference seed's home region has a birch cell, so the tap-a-birch provisioning test scans the terrain grid for one directly. */
function findBirchCell(world: World): number {
  for (let y = 0; y < WORLD_H; y += 3) {
    for (let x = 0; x < WORLD_W; x += 3) {
      if (terrainOf(world, x, y) === "birch") return cellIdx(world, x, y);
    }
  }
  throw new Error("no birch cell found anywhere in the world");
}

describe("the intent record", () => {
  it("a new game has no intent", () => {
    const { state } = newGame(3);
    expect(state.intent).toBeNull();
  });

  it("a save that still carries a plan loads with no plan and no intent", () => {
    const { state } = newGame(3);
    const text = serialize(state);
    const raw = JSON.parse(text);
    delete raw.state.intent;
    raw.state.plan = { name: "Haul to camp", steps: [], loop: null, sourceCell: null };
    const file = readSave(JSON.stringify(raw))!;
    expect(file.state.intent).toBeNull();
    expect("plan" in file.state).toBe(false);
  });

  it("camping for the night is an option with the bed in its detail", () => {
    const { state, world } = newGame(3);
    siteCamp(state, world);
    const o = check(state, world, cal, "night");
    expect(o.label).toBe("Camp for the night");
    expect(o.ok).toBe(true);
    expect(o.detail).toContain("on bare ground");
  });

  it("night forces its own shape regardless of what was asked: once, and leave it - never a promise to bring anything to camp", () => {
    const { state, world } = newGame(3);
    siteCamp(state, world);
    expect(startIntent(state, world, cal, new Rng(1), { task: "night", until: { kind: "forever" }, deliver: "camp", where: "nearest" })).toBe(true);
    expect(state.intent?.until).toEqual({ kind: "once" });
    expect(state.intent?.deliver).toBe("leave");
  });
});

type G = ReturnType<typeof newGame>;
const rng = () => new Rng(1);
function go(g: G, minutes: number) {
  advance(g.state, g.world, minutes);
}
/** Advances a minute at a time until the predicate holds or the budget runs out. */
function until(g: G, pred: () => boolean, max = 3000): boolean {
  for (let i = 0; i < max; i++) {
    if (pred()) return true;
    advance(g.state, g.world, 1);
  }
  return pred();
}
function req(task: TaskId, extra: Partial<IntentRequest> = {}): IntentRequest {
  return { task, until: { kind: "once" }, deliver: "leave", where: "nearest", ...extra };
}

describe("where the work is done", () => {
  it("nearest ground is the nearest usable cell, including the one underfoot", () => {
    const { state, world } = newGame(3);
    siteCamp(state, world);
    // The starting region's camp happens to sit on forest ground for this seed; stand somewhere that is neither forest nor heath first.
    placeAtSpot(state, world, state.player.region, "heath");
    expect(cellAt(world, resolveCell(state, world, cal, "chop", undefined, "nearest").cell).terrain).toMatch(/spruce|pine|birch/);
    placeAtSpot(state, world, state.player.region, "forest");
    expect(resolveCell(state, world, cal, "chop", undefined, "nearest").cell).toBe(cellOf(state, world));
    // Berries want heath ground, and heath is bog or meadow.
    expect(heathCell(world, resolveCell(state, world, cal, "berries", undefined, "nearest").cell)).toBe(true);
  });

  it("previews the first walk separately from felling time", () => {
    const { state, world } = newGame(3);
    siteCamp(state, world);
    placeAtSpot(state, world, state.player.region, "heath");
    // Which forest grows within reach is the map's business; the preview is not.
    const kind = forestKindNear(world, state.player.region);
    const o = intentOption(state, world, cal, "chop", kind, "nearest");
    expect(o.duration).toBeGreaterThan(0);
    expect(o.initialWalk).toMatchObject({ destination: `${kind} forest`, nearest: true });
    expect(o.initialWalk!.km).toBeGreaterThan(0);
    expect(o.initialWalk!.minutes).toBeGreaterThan(0);
  });

  it("has no initial walk on usable ground", () => {
    const { state, world } = newGame(3);
    siteCamp(state, world);
    placeAtSpot(state, world, state.player.region, "forest");
    expect(intentOption(state, world, cal, "chop", undefined, "nearest").initialWalk).toBeUndefined();
  });

  it("marks a selected place as explicit", () => {
    const { state, world } = newGame(3);
    siteCamp(state, world);
    placeAtSpot(state, world, state.player.region, "heath");
    const o = intentOption(state, world, cal, "chop", undefined, "forest");
    expect(o.initialWalk).toMatchObject({ destination: "the forest", nearest: false });
  });

  it("a spot that does not suit the work falls back to one that does, and says so", () => {
    const { state, world } = newGame(3);
    // A region that was given both spots: an outcrop to ask for and a forest to
    // fall back to. A region without an outcrop names no spot to refuse.
    const id = regionWithSpots(world, state.player.region, ["outcrop", "forest", "heath"]);
    placeAt(state, world, regionAt(world, id).campCell);
    siteCamp(state, world);
    // Off forest ground, same reason as above, so the fallback is really tested.
    placeAtSpot(state, world, state.player.region, "heath");
    const res = resolveCell(state, world, cal, "chop", undefined, "outcrop");
    // The fallback is the nearest ground that does suit, which need not be the
    // region's named forest; the note is what names the forest.
    expect(forestCell(world, res.cell)).toBe(true);
    expect(res.cell).toBe(resolveCell(state, world, cal, "chop", undefined, "nearest").cell);
    expect(res.note).toContain("the forest");
    // The note reaches the player: it prefixes the first real step, not just the placeholder.
    expect(startIntent(state, world, cal, rng(), req("chop", { where: "heath" }))).toBe(true);
    expect(state.intent?.step).toContain("does not suit");
  });

  it("camp-bound work resolves to camp; crafting stays where the materials are", () => {
    const { state, world } = newGame(3);
    siteCamp(state, world);
    const camp = regionState(state, world, state.player.region).campCell!;
    placeAtSpot(state, world, state.player.region, "forest");
    expect(resolveCell(state, world, cal, "split", undefined, "nearest").cell).toBe(camp);
    expect(resolveCell(state, world, cal, "craft", "cordage", "nearest").cell).toBe(camp);
    addItem(state.player.pack, "bark", 3);
    expect(resolveCell(state, world, cal, "craft", "cordage", "nearest").cell).toBe(cellOf(state, world));
  });

  it("a hunt for anything stays on plausible ground without reading the hidden population", () => {
    // A region with both a heath and a forest named on it, so the hunt has two
    // grounds to weigh against each other.
    const g = newGame(1);
    const { state, world } = g;
    placeAt(state, world, regionAt(world, regionWithSpots(world, state.player.region, ["heath", "forest"])).campCell);
    siteCamp(state, world);
    const r = regionAt(world, state.player.region);
    state.player.tools.push({ id: "bow", durability: 100, litres: 0, frozen: false });
    addItem(state.player.pack, "arrow", 10);
    const heath = spotOf(r, "heath")!.cell;
    placeAt(state, world, heath);
    // Hare and willow grouse keep to the heath: no reason to walk to the forest for a deer this hunter cannot take.
    expect(resolveCell(state, world, cal, "hunt", "any", "nearest").cell).toBe(heath);
    expect(startIntent(state, world, cal, rng(), req("hunt", { arg: "any" }))).toBe(true);
    expect(state.intent!.cell).toBe(heath);
    stopTask(state, world);
    state.intent = null;
    // Standing at camp, a shore cell, with nothing left in the forest or on the shore, the hunt goes to the spot that weighs most, not to the forest.
    placeAtSpot(state, world, state.player.region, "camp");
    const st = regionState(state, world, state.player.region);
    for (const s of huntedLand()) if (SPECIES_DEFS[s].hunt!.spot === "forest" || SPECIES_DEFS[s].hunt!.spot === "shore") st.pop[s] = 0;
    const chosen = resolveCell(state, world, cal, "hunt", "any", "nearest").cell;
    expect(["fell", "bog", "meadow", "spruce", "pine", "birch"]).toContain(cellAt(world, chosen).terrain);
  });

  // A camp sited on a shore where mallard swim read "something is about here"
  // every day of the year and hunted ducks, with seventy-six roe deer standing
  // in the forest two cells off: a level-20 survivor took 26 mallard in 48 days
  // and starved at the lean ceiling. Ground is ranked by the meat a day's
  // hunting on it would bring home, and the value reads the hunter's own odds,
  // so a beginner is not sent after game they cannot take.
  it("a hunt for anything lets hunting skill trade proximity for better ground", () => {
    // The same fixture as the test above, which pins the beginner's half: on a
    // heath full of hare, a level-1 hunter stays put, because the roe deer in
    // the forest are over their head and do not count toward that ground.
    const g = newGame(1);
    const { state, world } = g;
    placeAt(state, world, regionAt(world, regionWithSpots(world, state.player.region, ["heath", "forest"])).campCell);
    siteCamp(state, world);
    const r = regionAt(world, state.player.region);
    state.player.tools.push({ id: "bow", durability: 100, litres: 0, frozen: false });
    addItem(state.player.pack, "arrow", 10);
    const forest = spotOf(r, "forest")!.cell;
    const heath = spotOf(r, "heath")!.cell;
    placeAt(state, world, heath);
    expect(resolveCell(state, world, cal, "hunt", "any", "nearest").cell).toBe(heath);
    // Practice changes what the generic instruction can infer from the ground.
    for (const s of SKILL_IDS) setSkillLevel(state, s, 20);
    const chosen = resolveCell(state, world, cal, "hunt", "any", "nearest").cell;
    expect(cellAt(world, chosen).terrain).toMatch(/spruce|pine|birch/);
    expect(huntEstimate(state, world, cal, forest).kgPerHour).toBeGreaterThan(0);
  });

  it("a named hunt goes to the cell where that animal's fresh sign was found", () => {
    const { state, world } = newGame(3);
    siteCamp(state, world);
    const r = regionAt(world, state.player.region);
    const forest = r.cells.filter((cell) => /spruce|pine|birch/.test(cellAt(world, cell).terrain));
    expect(forest.length).toBeGreaterThan(1);
    placeAt(state, world, forest[0]);
    noteHuntSign(state, forest[1], "deer");

    expect(resolveCell(state, world, cal, "hunt", "deer", "nearest").cell).toBe(forest[1]);
  });

  it("the button is judged at the resolved cell, so ground is never the reason", () => {
    const { state, world } = newGame(3);
    siteCamp(state, world);
    const o = intentOption(state, world, cal, "chop", undefined, "nearest");
    expect(o.ok).toBe(true);
    state.player.tools = [];
    expect(intentOption(state, world, cal, "chop", undefined, "nearest").why).toBe("needs an axe");
  });
});

describe("the work tier", () => {
  it("walks to the forest, fells once, and is done", () => {
    const g = newGame(3);
    siteCamp(g.state, g.world);
    const { state, world } = g;
    // The starting camp itself sits on forest ground for this seed; stand off it so a walk is really needed.
    placeAtSpot(state, world, state.player.region, "heath");
    expect(startIntent(state, world, cal, rng(), req("chop"))).toBe(true);
    expect(state.task?.id).toBe("walk");
    // What the walk is called depends on whether the nearest forest happens to
    // be the region's named one; that it walks, then fells, is the case.
    expect(state.intent?.step).toMatch(/^walking to /);
    expect(until(g, () => state.task?.id === "chop")).toBe(true);
    expect(state.intent?.step).toMatch(/^felling a tree /);
    expect(until(g, () => state.intent === null)).toBe(true);
    expect(state.stats.trees).toBe(1);
    expect(state.log.some((e) => e.text === "Fell any tree: done.")).toBe(true);
  });

  it("refuses to start what cannot start, and ends with the button's words when the work runs out", () => {
    const g = newGame(3);
    siteCamp(g.state, g.world);
    const { state, world } = g;
    state.player.tools = [];
    expect(startIntent(state, world, cal, rng(), req("chop"))).toBe(false);
    expect(state.intent).toBeNull();
    state.player.tools = [{ id: "axe", durability: 100 }];
    regionState(state, world, state.player.region).wood = 1;
    startIntent(state, world, cal, rng(), req("chop", { until: { kind: "forever" } }));
    expect(until(g, () => state.intent === null)).toBe(true);
    expect(state.stats.trees).toBe(1);
    expect(state.log.some((e) => e.text === "Fell any tree: nothing left worth felling. {You} {stop}.")).toBe(true);
  });

  it("N times counts completions of the work only", () => {
    const g = newGame(3);
    siteCamp(g.state, g.world);
    const { state, world } = g;
    startIntent(state, world, cal, rng(), req("sticks", { until: { kind: "times", n: 3 } }));
    expect(until(g, () => state.intent === null)).toBe(true);
    expect(qty(state.player.pack, "stick")).toBe(18);
    expect(state.log.some((e) => e.text === "Gather sticks: done.")).toBe(true);
  });

  it("brings a full load to camp and goes back for more, and hauls the rest when it is over", () => {
    const g = newGame(3);
    siteCamp(g.state, g.world);
    const { state, world } = g;
    const camp = regionState(state, world, state.player.region).campCell!;
    state.player.tools.push({ id: "barkBucket", durability: 100, litres: 3 });
    startIntent(state, world, cal, rng(), req("chop", { until: { kind: "times", n: 2 }, deliver: "camp", where: "forest" }));
    expect(until(g, () => state.intent === null, 6000)).toBe(true);
    expect(qty(pile(state, camp), "log")).toBe(8);
    expect(state.stats.trees).toBe(2);
    expect(cellOf(state, world)).toBe(camp);
  });

  it("until camp has N counts the camp pile alone", () => {
    const g = newGame(3);
    siteCamp(g.state, g.world);
    const { state, world } = g;
    const camp = regionState(state, world, state.player.region).campCell!;
    state.player.tools.push({ id: "barkBucket", durability: 100, litres: 3 });
    // deliver defaults to "leave" here, but "until camp has N" forces it to "camp": the promise cannot be kept otherwise.
    startIntent(state, world, cal, rng(), req("chop", { until: { kind: "campHas", qty: 5 }, where: "forest" }));
    expect(state.intent?.until).toEqual({ kind: "campHas", item: "log", qty: 5 });
    expect(state.intent?.deliver).toBe("camp");
    expect(until(g, () => state.intent === null, 8000)).toBe(true);
    expect(qty(pile(state, camp), "log")).toBeGreaterThanOrEqual(5);
    expect(state.stats.trees).toBe(2);
  });

  it("a gather stops once the shortfall is in the pack, not once it is already home", () => {
    const g = newGame(3);
    const { state, world } = g;
    // Stone is gathered at an outcrop, so the camp has to be in a region that
    // was given one; a region of forest and bog offers nothing to pick up.
    placeAt(state, world, regionAt(world, regionWithSpots(world, state.player.region, ["outcrop"])).campCell);
    siteCamp(state, world);
    mapRegion(state, world, state.player.region);
    const camp = regionState(state, world, state.player.region).campCell!;
    startIntent(state, world, cal, rng(), req("stone", { until: { kind: "campHas", qty: 8 } }));
    expect(until(g, () => state.intent === null, 8000)).toBe(true);
    const total = qty(pile(state, camp), "stone");
    // A gather yields 3 stone a trip at level 1: the third trip crosses 8 and
    // stops there, delivering what is in hand rather than working past it
    // for a fourth trip's worth (a rare flint bonus can add one more).
    expect(total).toBeGreaterThanOrEqual(8);
    expect(total).toBeLessThan(12);
  });

  it("work with no countable yield turns until camp has N into once", () => {
    const { state, world } = newGame(3);
    siteCamp(state, world);
    startIntent(state, world, cal, rng(), req("rest", { until: { kind: "campHas", qty: 5 } }));
    expect(state.intent?.until).toEqual({ kind: "once" });
  });

  it("reads as a sentence", () => {
    const { state, world } = newGame(3);
    siteCamp(state, world);
    startIntent(state, world, cal, rng(), req("chop", { until: { kind: "campHas", qty: 40 }, deliver: "camp" }));
    expect(intentSentence(state, world, cal, state.intent!)).toBe("Fell any tree, until camp has 40 logs, bringing it to camp");
    startIntent(state, world, cal, rng(), req("sticks", { until: { kind: "times", n: 5 } }));
    expect(intentSentence(state, world, cal, state.intent!)).toBe("Gather sticks, 0 of 5 done");
    startIntent(state, world, cal, rng(), req("bark", { until: { kind: "forever" } }));
    expect(intentSentence(state, world, cal, state.intent!)).toBe("Strip bark, forever");
  });

  it("a live light keep never claims to bring the fire to camp", () => {
    const { state, world } = newGame(3);
    siteCamp(state, world);
    const camp = regionState(state, world, state.player.region).campCell!;
    // Built by hand rather than through startIntent: lighting needs a fire site in
    // place, and this test is only about the sentence a light intent reads as.
    const light: Intent = {
      mode: "hand", task: "light", cell: camp, campCell: camp,
      until: { kind: "once" }, deliver: "camp", done: 0,
      step: "lighting the fire", orderId: null, windDown: false,
    };
    expect(intentSentence(state, world, cal, light)).toBe("Light the fire at the site");
  });

  it("a build fetches what is missing from this region's piles, one load at a time, then builds", () => {
    const g = newGame(3);
    siteCamp(g.state, g.world);
    const { state, world } = g;
    const region = state.player.region;
    const camp = regionState(state, world, region).campCell!;
    const r = regionAt(world, region);
    const forest = spotOf(r, "forest")!.cell;
    addItem(pile(state, camp), "stick", 8);
    addItem(pile(state, camp), "cordage", 2);
    addItem(pile(state, forest), "log", 4);
    addItem(state.player.pack, "driedMeat", 3);
    // The button agrees with startIntent: fetching counts as a way to start, so it is not greyed out.
    const option = intentOption(state, world, cal, "build", "leanTo", "nearest");
    expect(option.ok).toBe(true);
    expect(option.initialWalk?.cell).toBe(forest);
    expect(startIntent(state, world, cal, rng(), req("build", { arg: "leanTo" }))).toBe(true);
    expect(state.intent?.step).toContain("walking to the forest");
    expect(until(g, () => state.intent === null, 8000)).toBe(true);
    expect(campSite(regionState(state, world, region))!.structures.leanTo).toBe(true);
    expect(qty(pile(state, forest), "log")).toBe(0);
    expect(state.log.some((e) => e.text === "lean-to: done.")).toBe(true);
  });

  it("a build with materials nowhere in the region does not start; the button already says why", () => {
    const { state, world } = newGame(3);
    siteCamp(state, world);
    // The refusal names what is wanting rather than saying "missing
    // materials" beside a list of what the whole thing costs.
    const why = intentOption(state, world, cal, "build", "leanTo", "nearest").why;
    expect(why).toMatch(/^short /);
    expect(why).toMatch(/ at camp$/);
    expect(isShortAtCamp(why)).toBe(true);
    expect(startIntent(state, world, cal, rng(), req("build", { arg: "leanTo" }))).toBe(false);
    expect(state.intent).toBeNull();
  });

  it("a build whose only missing material sits on a pile with no route from camp does not start", () => {
    // Seed 0's starting region has a water cell (impassable, so kmBetween from camp is null)
    // that still carries the region's tag; seed 3's region (used above) has no water at all.
    const { state, world } = newGame(0);
    siteCamp(state, world);
    const region = state.player.region;
    const camp = regionState(state, world, region).campCell!;
    const cx = camp % world.w;
    const cy = Math.floor(camp / world.w);
    let stranded: number | null = null;
    for (let dy = -80; dy <= 80 && stranded === null; dy++) {
      for (let dx = -80; dx <= 80; dx++) {
        const x = cx + dx;
        const y = cy + dy;
        if (x < 0 || y < 0 || x >= world.w || y >= world.h) continue;
        const c = y * world.w + x;
        if (cellAt(world, c).region !== region || cellAt(world, c).terrain !== "water") continue;
        stranded = c;
        break;
      }
    }
    expect(stranded).not.toBeNull();
    expect(kmBetween(state, world, camp, stranded!)).toBeNull();
    addItem(pile(state, camp), "stick", 8);
    addItem(pile(state, camp), "cordage", 2);
    addItem(pile(state, stranded!), "log", 4);
    expect(startIntent(state, world, cal, rng(), req("build", { arg: "leanTo" }))).toBe(false);
    expect(state.intent).toBeNull();
  });

  it("does not spin forever when nothing missing fits in the pack: it ends with the real reason", () => {
    const g = newGame(3);
    siteCamp(g.state, g.world);
    const { state, world } = g;
    const region = state.player.region;
    const camp = regionState(state, world, region).campCell!;
    const r = regionAt(world, region);
    const forest = spotOf(r, "forest")!.cell;
    // Sticks and cordage are already at camp; only the logs are missing, and they sit at the forest.
    addItem(pile(state, camp), "stick", 8);
    addItem(pile(state, camp), "cordage", 2);
    addItem(pile(state, forest), "log", 4);
    // 34 kg of stone, plus the day's kilo of dried meat, leaves 1 kg of room: not enough for a 20 kg log.
    addItem(state.player.pack, "stone", 34 / ITEM_KG.stone);
    expect(startIntent(state, world, cal, rng(), req("build", { arg: "leanTo" }))).toBe(true);
    expect(until(g, () => state.intent === null, 500)).toBe(true);
    expect(state.log.some((e) => /^lean-to: short .* at camp\. \{You\} \{stop\}\.$/.test(e.text))).toBe(true);
  });

  it("a build already finished is never offered a fetch, whatever sits elsewhere in the region", () => {
    const { state, world } = newGame(3);
    siteCamp(state, world);
    const region = state.player.region;
    const r = regionAt(world, region);
    const forest = spotOf(r, "forest")!.cell;
    const irst = regionState(state, world, region);
    siteFor(irst, irst.campCell!).structures.leanTo = true;
    addItem(pile(state, forest), "log", 4);
    const o = intentOption(state, world, cal, "build", "leanTo", "nearest");
    expect(o.ok).toBe(false);
    expect(o.why).toBe("already built here");
    expect(startIntent(state, world, cal, rng(), req("build", { arg: "leanTo" }))).toBe(false);
  });

  it("a cabin with no fire site is never offered a fetch either, even with plenty of logs nearby", () => {
    const { state, world } = newGame(3);
    siteCamp(state, world);
    const region = state.player.region;
    const r = regionAt(world, region);
    const forest = spotOf(r, "forest")!.cell;
    addItem(pile(state, forest), "log", 40);
    const o = intentOption(state, world, cal, "build", "cabin", "nearest");
    expect(o.ok).toBe(false);
    expect(o.why).toBe("clear the fire site first");
  });

  it("the fetch detail names what the nearest pile actually holds, not just the first thing missing", () => {
    const { state, world } = newGame(3);
    siteCamp(state, world);
    const region = state.player.region;
    const camp = regionState(state, world, region).campCell!;
    const r = regionAt(world, region);
    const forest = spotOf(r, "forest")!.cell;
    const heath = spotOf(r, "heath")!.cell;
    // Cordage is satisfied at camp; sticks and logs are both missing, sitting at different spots.
    addItem(pile(state, camp), "cordage", 2);
    addItem(pile(state, heath), "stick", 8);
    addItem(pile(state, forest), "log", 4);
    // Standing at the forest makes its log pile the nearer source (0 km, against the heath's positive distance).
    placeAtSpot(state, world, region, "forest");
    const o = intentOption(state, world, cal, "build", "leanTo", "nearest");
    expect(o.ok).toBe(true);
    expect(o.detail).toContain("4 logs");
    expect(o.detail).not.toContain("sticks");
  });
});

describe("a camp-bound delivery already at camp", () => {
  it("drops what landed in the pack instead of walking back out with it", () => {
    // Seed 17: bog camp, forest 0.6 km away, so the chop's own cell is not the camp cell.
    const { state, world } = newGame(17);
    siteCamp(state, world);
    const camp = regionState(state, world, state.player.region).campCell!;
    startIntent(state, world, cal, rng(), req("chop", { until: { kind: "forever" }, deliver: "camp" }));
    // The exact scenario the rule must handle: standing at camp already, a log on the
    // back, and nothing at the work cell to explain a delivery leg starting there.
    state.task = null;
    placeAt(state, world, camp);
    addItem(state.player.pack, "log", 1);
    advance(state, world, 1);
    expect(qty(pile(state, camp), "log")).toBe(1);
    expect(qty(state.player.pack, "log")).toBe(0);
  });

  it("split at camp lands its firewood on the camp pile, so campHas can see it and end the intent", () => {
    const g = newGame(3);
    siteCamp(g.state, g.world);
    const { state, world } = g;
    const camp = regionState(state, world, state.player.region).campCell!;
    addItem(pile(state, camp), "log", 3);
    expect(startIntent(state, world, cal, rng(), req("split", { until: { kind: "campHas", qty: 5 } }))).toBe(true);
    expect(until(g, () => state.intent === null, 1500)).toBe(true);
    expect(qty(pile(state, camp), "firewood")).toBe(20);
    expect(qty(pile(state, camp), "log")).toBe(2);
    expect(state.log.some((e) => e.text === "Split a log: done.")).toBe(true);
  });
});

describe("a rest's gain, not just its completion, decides whether cold is spent", () => {
  it("a rest that gains at least a point of warmth is not marked spent, even if the need still reads cold when it ends", () => {
    const { state, world } = newGame(3);
    siteCamp(state, world);
    const camp = regionState(state, world, state.player.region).campCell!;
    state.intent = {
      mode: "runner", task: "chop", cell: camp, campCell: camp,
      until: { kind: "forever" }, deliver: "leave", done: 0, step: "", orderId: null, windDown: false,
    };
    const it = state.intent;
    state.player.bodyNeed = "cold";
    state.player.warmth = 20;
    expect(takeStep(state, world, cal, { id: "rest", step: "resting to warm up" })).toBe(true);
    expect(it.restFromWarmth).toBe(20);
    // Warmth climbs during the rest but stays under WARM_AT, so the need would still read "cold" throughout.
    state.player.warmth = 25;
    for (let m = 0; m < 60; m++) stepTask(state, world, cal, new Rng(1), 1);
    expect(state.task).toBeNull();
    expect(state.player.coldSpent).toBeFalsy();
  });
});

describe("the haul intent", () => {
  it("loads, walks to camp, drops, walks back, until the pile is bare", () => {
    const g = newGame(3);
    siteCamp(g.state, g.world);
    const { state, world } = g;
    const region = state.player.region;
    placeAtSpot(state, world, region, "forest");
    const forestCell = cellOf(state, world);
    addItem(herePile(state, world), "log", 3);
    addItem(herePile(state, world), "stick", 10);
    expect(startIntent(state, world, cal, rng(), req("haul"))).toBe(true);
    expect(state.intent?.deliver).toBe("camp");
    expect(state.task?.id).toBe("walk");
    expect(qty(state.player.pack, "log")).toBe(1);
    expect(until(g, () => state.intent === null, 6000)).toBe(true);
    const camp = pile(state, regionState(state, world, region).campCell!);
    expect(qty(camp, "log")).toBe(3);
    expect(qty(camp, "stick")).toBe(10);
    expect(isEmpty(pile(state, forestCell))).toBe(true);
    expect(state.log.some((e) => e.text === "Haul to camp: done.")).toBe(true);
  });

  it("stopping mid-haul keeps the load on your back and you on the way", () => {
    const g = newGame(3);
    siteCamp(g.state, g.world);
    const { state, world } = g;
    placeAtSpot(state, world, state.player.region, "forest");
    const forestCell = cellOf(state, world);
    addItem(herePile(state, world), "log", 2);
    startIntent(state, world, cal, rng(), req("haul"));
    expect(until(g, () => cellOf(state, world) !== forestCell)).toBe(true);
    stopTask(state, world);
    expect(state.intent).toBeNull();
    expect(qty(state.player.pack, "log")).toBe(1);
    expect(state.route).toBeNull();
    expect(qty(pile(state, forestCell), "log")).toBe(1);
  });

  it("an empty pile is nothing to haul", () => {
    const { state, world } = newGame(3);
    siteCamp(state, world);
    expect(startIntent(state, world, cal, rng(), req("haul"))).toBe(false);
  });

  it("refuses to start at camp even with something to haul", () => {
    const { state, world } = newGame(3);
    siteCamp(state, world);
    addItem(herePile(state, world), "log", 1);
    expect(startIntent(state, world, cal, rng(), req("haul"))).toBe(false);
  });
});

describe("saves", () => {
  it("a live intent survives a save and goes on while you are away", () => {
    const g = newGame(3);
    siteCamp(g.state, g.world);
    const { state, world } = g;
    startIntent(state, world, cal, rng(), req("sticks", { until: { kind: "forever" } }));
    go(g, 5);
    const file = readSave(serialize(state))!;
    expect(file.state.intent?.task).toBe("sticks");
    const back = { state: file.state, world };
    go(back, 120);
    expect(back.state.intent).not.toBeNull();
    expect(back.state.intent!.done).toBeGreaterThan(0);
  });
});

describe("a spare tool at camp", () => {
  it("felling judged from camp with the only axe in the camp pile is able to run, and starting it takes the axe up", () => {
    const { state, world } = newGame(17);
    siteCamp(state, world);
    const st = regionState(state, world, state.player.region);
    placeAt(state, world, st.campCell!);
    state.player.tools = state.player.tools.filter((t) => t.id !== "axe");
    addItem(pile(state, st.campCell!), "axe", 1);
    expect(hasTool(state.player, "axe")).toBe(false);
    expect(intentOption(state, world, cal, "chop", undefined, "nearest").ok).toBe(true);
    const req: IntentRequest = { task: "chop", until: { kind: "forever" }, deliver: "camp", where: "nearest" };
    expect(startIntent(state, world, cal, new Rng(1), req)).toBe(true);
    expect(hasTool(state.player, "axe")).toBe(true);
    expect(qty(pile(state, st.campCell!), "axe")).toBe(0);
  });

  it("a hole fill judged from camp reads only the axe the fill can carry, while the ice-hole task takes the camp one up", () => {
    // provisionKit leaves a fill's kit to the fill task, so the camp pile's
    // axe is never in the hands when the fill reaches the ice: the fill reads
    // the pack and the work cell alone. An iceHole order is provisioned like
    // any other task, so the same axe is in reach from camp and taken up.
    const { state, world } = newGame(17);
    siteCamp(state, world);
    // Camp off the water, so the hole is judged at a cell the survivor is not
    // standing on: every seed's landing camp is itself waterside, where the
    // work cell and the camp cell are one and the question does not arise.
    const forest = dryForestNear(world, state.player.region).cell;
    placeAt(state, world, forest);
    regionState(state, world, state.player.region).campCell = forest;
    state.player.tools = state.player.tools.filter((t) => t.id !== "axe");
    addItem(pile(state, forest), "axe", 1);
    addItem(state.player.pack, "barkBucket", 1);
    ensureGround(state, world, state.player.region).iceCm = ICE_SHORE_CM;
    const fill = intentOption(state, world, cal, "fill", "hole", "nearest");
    expect(fill.ok).toBe(false);
    expect(fill.why).toBe("needs an axe");
    expect(intentOption(state, world, cal, "iceHole", undefined, "nearest").ok).toBe(true);
    const req: IntentRequest = { task: "iceHole", until: { kind: "once" }, deliver: "leave", where: "nearest" };
    expect(startIntent(state, world, cal, new Rng(1), req)).toBe(true);
    expect(hasTool(state.player, "axe")).toBe(true);
    expect(qty(pile(state, forest), "axe")).toBe(0);
  });

  it("judged from the forest with the axe at camp it is not: the tool is only in reach from camp, where setting out takes it up", () => {
    const { state, world } = newGame(17);
    siteCamp(state, world);
    const st = regionState(state, world, state.player.region);
    state.player.tools = state.player.tools.filter((t) => t.id !== "axe");
    addItem(pile(state, st.campCell!), "axe", 1);
    placeAtSpot(state, world, state.player.region, "forest");
    expect(check(state, world, cal, "chop").why).toBe("needs an axe");
  });

  it("a birch tap judged from camp with the only knife in the camp pile is able to run, and starting it takes the knife up", () => {
    const { state, world } = newGame(17, SAP_FROM_DOY);
    siteCamp(state, world);
    const birch = findBirchCell(world);
    const st = regionState(state, world, cellAt(world, birch).region);
    st.campCell = birch;
    placeAt(state, world, birch);
    state.player.tools = state.player.tools.filter((t) => t.id !== "knife");
    addItem(pile(state, birch), "knife", 1);
    expect(hasTool(state.player, "knife")).toBe(false);
    const sapCal = calendar(0, SAP_FROM_DOY);
    expect(intentOption(state, world, sapCal, "tapSap", undefined, "nearest").ok).toBe(true);
    const req: IntentRequest = { task: "tapSap", until: { kind: "once" }, deliver: "leave", where: "nearest" };
    expect(startIntent(state, world, sapCal, new Rng(1), req)).toBe(true);
    expect(hasTool(state.player, "knife")).toBe(true);
    expect(qty(pile(state, birch), "knife")).toBe(0);
  });

  it("a hunt standing at camp with only its arrows in the pack does not unload forever", () => {
    // dropEverything keeps the kit an order carries out with it, so a hunt with a bow can never
    // empty its pack of arrows. Treating that unload as a step taken made the runner take it
    // again the next minute and every minute after: a level-20 camp on seed 19 stood at its own
    // fire for fourteen hours a day "unloading at camp" and starved on day 42 with an elk down
    // and 5,645 kcal a day gathered.
    const { state, world } = newGame(17);
    siteCamp(state, world);
    for (const s of SKILL_IDS) setSkillLevel(state, s, 20);
    const st = regionState(state, world, state.player.region);
    placeAt(state, world, st.campCell!);
    state.player.tools.push({ id: "bow", durability: 100, litres: 0, frozen: false });
    addItem(state.player.pack, "arrow", 10);
    expect(startIntent(state, world, cal, new Rng(1), { task: "hunt", arg: "any", until: { kind: "campHas", qty: 2 }, deliver: "camp", where: "nearest" }, 1)).toBe(true);
    // The work is away from camp and something of the last kill is still lying there, so the
    // delivery branch is the one the runner is in, standing at camp with nothing but its kit.
    const away = regionAt(world, state.player.region).spots.find((sp) => sp.cell !== st.campCell!)!.cell;
    state.intent!.cell = away;
    addItem(pile(state, away), "sinew", 2);
    state.task = null;
    for (let m = 0; m < 120 && state.intent && cellOf(state, world) === st.campCell!; m++) advance(state, world, 1);
    // Either it set out for the rest or the intent gave way to another order: what it must not
    // do is stand at camp calling the same empty unload a step.
    expect(cellOf(state, world) !== st.campCell! || state.intent === null || state.intent.step !== "unloading at camp").toBe(true);
    expect(qty(state.player.pack, "arrow")).toBe(10);
  });

});
