import { describe, expect, it } from "vitest";
import { Rng } from "../src/rng";
import { advance } from "../src/sim/advance";
import { calendar } from "../src/sim/calendar";
import { intentOption, type IntentRequest, intentSentence, resolveCell, startIntent } from "../src/sim/intent";
import { addItem, herePile, isEmpty, pile, qty } from "../src/sim/inventory";
import { ITEM_KG } from "../src/sim/items";
import { newGame } from "../src/sim/newgame";
import { cellOf, kmBetween, placeAt, placeAtSpot } from "../src/sim/position";
import { regionState } from "../src/sim/regionstate";
import { deserialize, serialize } from "../src/sim/save";
import { check, stepTask, stopTask } from "../src/sim/tasks";
import { takeStep } from "../src/sim/steps";
import type { TaskId } from "../src/sim/types";
import { cellAt, regionAt, spotOf } from "../src/world/gen";

const cal = calendar(0);

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
    const file = deserialize(JSON.stringify(raw))!;
    expect(file.state.intent).toBeNull();
    expect("plan" in file.state).toBe(false);
  });

  it("camping for the night is an option with the bed in its detail", () => {
    const { state, world } = newGame(3);
    const o = check(state, world, cal, "night");
    expect(o.label).toBe("Camp for the night");
    expect(o.ok).toBe(true);
    expect(o.detail).toContain("on bare ground");
  });

  it("night forces its own shape regardless of what was asked: once, and leave it - never a promise to bring anything to camp", () => {
    const { state, world } = newGame(3);
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
  it("nearest ground is the region's spot unless you already stand on it", () => {
    const { state, world } = newGame(3);
    const r = regionAt(world, state.player.region);
    // The starting region's camp happens to sit on forest ground for this seed; stand somewhere that is neither forest nor heath first.
    placeAtSpot(state, world, state.player.region, "heath");
    expect(resolveCell(state, world, "chop", undefined, "nearest").cell).toBe(spotOf(r, "forest")!.cell);
    placeAtSpot(state, world, state.player.region, "forest");
    expect(resolveCell(state, world, "chop", undefined, "nearest").cell).toBe(cellOf(state, world));
    expect(resolveCell(state, world, "berries", undefined, "nearest").cell).toBe(spotOf(r, "heath")!.cell);
  });

  it("a spot that does not suit the work falls back to one that does, and says so", () => {
    const { state, world } = newGame(3);
    const r = regionAt(world, state.player.region);
    // Off forest ground, same reason as above, so the fallback is really tested.
    placeAtSpot(state, world, state.player.region, "heath");
    const res = resolveCell(state, world, "chop", undefined, "outcrop");
    expect(res.cell).toBe(spotOf(r, "forest")!.cell);
    expect(res.note).toContain("the forest");
    // The note reaches the player: it prefixes the first real step, not just the placeholder.
    expect(startIntent(state, world, cal, rng(), req("chop", { where: "heath" }))).toBe(true);
    expect(state.intent?.step).toContain("does not suit");
  });

  it("camp-bound work resolves to camp; crafting stays where the materials are", () => {
    const { state, world } = newGame(3);
    const camp = regionState(state, world, state.player.region).campCell;
    placeAtSpot(state, world, state.player.region, "forest");
    expect(resolveCell(state, world, "split", undefined, "nearest").cell).toBe(camp);
    expect(resolveCell(state, world, "craft", "cordage", "nearest").cell).toBe(camp);
    addItem(state.player.pack, "bark", 3);
    expect(resolveCell(state, world, "craft", "cordage", "nearest").cell).toBe(cellOf(state, world));
  });

  it("the button is judged at the resolved cell, so ground is never the reason", () => {
    const { state, world } = newGame(3);
    const o = intentOption(state, world, cal, "chop", undefined, "nearest");
    expect(o.ok).toBe(true);
    state.player.tools = [];
    expect(intentOption(state, world, cal, "chop", undefined, "nearest").why).toBe("needs an axe");
  });
});

describe("the work tier", () => {
  it("walks to the forest, fells once, and is done", () => {
    const g = newGame(3);
    const { state, world } = g;
    // The starting camp itself sits on forest ground for this seed; stand off it so a walk is really needed.
    placeAtSpot(state, world, state.player.region, "heath");
    expect(startIntent(state, world, cal, rng(), req("chop"))).toBe(true);
    expect(state.task?.id).toBe("walk");
    expect(state.intent?.step).toContain("walking to the forest");
    expect(until(g, () => state.task?.id === "chop")).toBe(true);
    expect(state.intent?.step).toBe("felling a tree at the forest");
    expect(until(g, () => state.intent === null)).toBe(true);
    expect(state.stats.trees).toBe(1);
    expect(state.log.some((e) => e.text === "Fell a tree: done.")).toBe(true);
  });

  it("refuses to start what cannot start, and ends with the button's words when the work runs out", () => {
    const g = newGame(3);
    const { state, world } = g;
    state.player.tools = [];
    expect(startIntent(state, world, cal, rng(), req("chop"))).toBe(false);
    expect(state.intent).toBeNull();
    state.player.tools = [{ id: "axe", durability: 100 }];
    regionState(state, world, state.player.region).wood = 1;
    startIntent(state, world, cal, rng(), req("chop", { until: { kind: "forever" } }));
    expect(until(g, () => state.intent === null)).toBe(true);
    expect(state.stats.trees).toBe(1);
    expect(state.log.some((e) => e.text === "Fell a tree: nothing left worth felling. You stop.")).toBe(true);
  });

  it("N times counts completions of the work only", () => {
    const g = newGame(3);
    const { state, world } = g;
    startIntent(state, world, cal, rng(), req("sticks", { until: { kind: "times", n: 3 } }));
    expect(until(g, () => state.intent === null)).toBe(true);
    expect(qty(state.player.pack, "stick")).toBe(18);
    expect(state.log.some((e) => e.text === "Gather sticks: done.")).toBe(true);
  });

  it("brings a full load to camp and goes back for more, and hauls the rest when it is over", () => {
    const g = newGame(3);
    const { state, world } = g;
    const camp = regionState(state, world, state.player.region).campCell;
    startIntent(state, world, cal, rng(), req("chop", { until: { kind: "times", n: 2 }, deliver: "camp", where: "forest" }));
    expect(until(g, () => state.intent === null, 6000)).toBe(true);
    expect(qty(pile(state, camp), "log")).toBe(8);
    expect(state.stats.trees).toBe(2);
    expect(cellOf(state, world)).toBe(camp);
  });

  it("until camp has N counts the camp pile alone", () => {
    const g = newGame(3);
    const { state, world } = g;
    const camp = regionState(state, world, state.player.region).campCell;
    // deliver defaults to "leave" here, but "until camp has N" forces it to "camp": the promise cannot be kept otherwise.
    startIntent(state, world, cal, rng(), req("chop", { until: { kind: "campHas", qty: 5 }, where: "forest" }));
    expect(state.intent?.until).toEqual({ kind: "campHas", item: "log", qty: 5 });
    expect(state.intent?.deliver).toBe("camp");
    expect(until(g, () => state.intent === null, 8000)).toBe(true);
    expect(qty(pile(state, camp), "log")).toBeGreaterThanOrEqual(5);
    expect(state.stats.trees).toBe(2);
  });

  it("work with no countable yield turns until camp has N into once", () => {
    const { state, world } = newGame(3);
    startIntent(state, world, cal, rng(), req("rest", { until: { kind: "campHas", qty: 5 } }));
    expect(state.intent?.until).toEqual({ kind: "once" });
  });

  it("reads as a sentence", () => {
    const { state, world } = newGame(3);
    startIntent(state, world, cal, rng(), req("chop", { until: { kind: "campHas", qty: 40 }, deliver: "camp" }));
    expect(intentSentence(state, world, cal, state.intent!)).toBe("Fell a tree, until camp has 40 logs, bringing it to camp");
    startIntent(state, world, cal, rng(), req("sticks", { until: { kind: "times", n: 5 } }));
    expect(intentSentence(state, world, cal, state.intent!)).toBe("Gather sticks, 0 of 5 done");
    startIntent(state, world, cal, rng(), req("bark", { until: { kind: "forever" } }));
    expect(intentSentence(state, world, cal, state.intent!)).toBe("Strip bark, forever");
  });

  it("a build fetches what is missing from this region's piles, one load at a time, then builds", () => {
    const g = newGame(3);
    const { state, world } = g;
    const region = state.player.region;
    const camp = regionState(state, world, region).campCell;
    const r = regionAt(world, region);
    const forest = spotOf(r, "forest")!.cell;
    addItem(pile(state, camp), "stick", 8);
    addItem(pile(state, camp), "cordage", 2);
    addItem(pile(state, forest), "log", 4);
    addItem(state.player.pack, "driedMeat", 3);
    // The button agrees with startIntent: fetching counts as a way to start, so it is not greyed out.
    expect(intentOption(state, world, cal, "build", "leanTo", "nearest").ok).toBe(true);
    expect(startIntent(state, world, cal, rng(), req("build", { arg: "leanTo" }))).toBe(true);
    expect(state.intent?.step).toContain("for materials");
    expect(until(g, () => state.intent === null, 8000)).toBe(true);
    expect(regionState(state, world, region).structures.leanTo).toBe(true);
    expect(qty(pile(state, forest), "log")).toBe(0);
    expect(state.log.some((e) => e.text === "lean-to: done.")).toBe(true);
  });

  it("a build with materials nowhere in the region does not start; the button already says why", () => {
    const { state, world } = newGame(3);
    expect(intentOption(state, world, cal, "build", "leanTo", "nearest").why).toBe("missing materials at camp");
    expect(startIntent(state, world, cal, rng(), req("build", { arg: "leanTo" }))).toBe(false);
    expect(state.intent).toBeNull();
  });

  it("a build whose only missing material sits on a pile with no route from camp does not start", () => {
    // Seed 0's starting region has a water cell (impassable, so kmBetween from camp is null)
    // that still carries the region's tag; seed 3's region (used above) has no water at all.
    const { state, world } = newGame(0);
    const region = state.player.region;
    const camp = regionState(state, world, region).campCell;
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
    expect(kmBetween(world, camp, stranded!)).toBeNull();
    addItem(pile(state, camp), "stick", 8);
    addItem(pile(state, camp), "cordage", 2);
    addItem(pile(state, stranded!), "log", 4);
    expect(startIntent(state, world, cal, rng(), req("build", { arg: "leanTo" }))).toBe(false);
    expect(state.intent).toBeNull();
  });

  it("does not spin forever when nothing missing fits in the pack: it ends with the real reason", () => {
    const g = newGame(3);
    const { state, world } = g;
    const region = state.player.region;
    const camp = regionState(state, world, region).campCell;
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
    expect(state.log.some((e) => e.text === "lean-to: missing materials at camp. You stop.")).toBe(true);
  });

  it("a build already finished is never offered a fetch, whatever sits elsewhere in the region", () => {
    const { state, world } = newGame(3);
    const region = state.player.region;
    const r = regionAt(world, region);
    const forest = spotOf(r, "forest")!.cell;
    regionState(state, world, region).structures.leanTo = true;
    addItem(pile(state, forest), "log", 4);
    const o = intentOption(state, world, cal, "build", "leanTo", "nearest");
    expect(o.ok).toBe(false);
    expect(o.why).toBe("already built here");
    expect(startIntent(state, world, cal, rng(), req("build", { arg: "leanTo" }))).toBe(false);
  });

  it("a cabin with no fire pit is never offered a fetch either, even with plenty of logs nearby", () => {
    const { state, world } = newGame(3);
    const region = state.player.region;
    const r = regionAt(world, region);
    const forest = spotOf(r, "forest")!.cell;
    addItem(pile(state, forest), "log", 40);
    const o = intentOption(state, world, cal, "build", "cabin", "nearest");
    expect(o.ok).toBe(false);
    expect(o.why).toBe("build the fire pit first");
  });

  it("the fetch detail names what the nearest pile actually holds, not just the first thing missing", () => {
    const { state, world } = newGame(3);
    const region = state.player.region;
    const camp = regionState(state, world, region).campCell;
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
    const camp = regionState(state, world, state.player.region).campCell;
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
    const { state, world } = g;
    const camp = regionState(state, world, state.player.region).campCell;
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
    const camp = regionState(state, world, state.player.region).campCell;
    state.intent = {
      task: "chop", cell: camp, campCell: camp,
      until: { kind: "forever" }, deliver: "leave", done: 0, step: "", need: "cold",
    };
    const it = state.intent;
    state.player.warmth = 20;
    expect(takeStep(state, world, cal, { id: "rest", step: "resting to warm up" })).toBe(true);
    expect(it.restFromWarmth).toBe(20);
    // Warmth climbs during the rest but stays under WARM_AT, so the need would still read "cold" throughout.
    state.player.warmth = 25;
    for (let m = 0; m < 60; m++) stepTask(state, world, cal, new Rng(1), 1);
    expect(state.task).toBeNull();
    expect(it.coldSpent).toBeFalsy();
  });
});

describe("the haul intent", () => {
  it("loads, walks to camp, drops, walks back, until the pile is bare", () => {
    const g = newGame(3);
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
    const camp = pile(state, regionState(state, world, region).campCell);
    expect(qty(camp, "log")).toBe(3);
    expect(qty(camp, "stick")).toBe(10);
    expect(isEmpty(pile(state, forestCell))).toBe(true);
    expect(state.log.some((e) => e.text === "Haul to camp: done.")).toBe(true);
  });

  it("stopping mid-haul keeps the load on your back and you on the way", () => {
    const g = newGame(3);
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
    expect(startIntent(state, world, cal, rng(), req("haul"))).toBe(false);
  });

  it("refuses to start at camp even with something to haul", () => {
    const { state, world } = newGame(3);
    addItem(herePile(state, world), "log", 1);
    expect(startIntent(state, world, cal, rng(), req("haul"))).toBe(false);
  });
});

describe("saves", () => {
  it("a live intent survives a save and goes on while you are away", () => {
    const g = newGame(3);
    const { state, world } = g;
    startIntent(state, world, cal, rng(), req("sticks", { until: { kind: "forever" } }));
    go(g, 5);
    const file = deserialize(serialize(state))!;
    expect(file.state.intent?.task).toBe("sticks");
    const back = { state: file.state, world };
    go(back, 120);
    expect(back.state.intent).not.toBeNull();
    expect(back.state.intent!.done).toBeGreaterThan(0);
  });
});
