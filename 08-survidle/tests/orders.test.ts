import { describe, expect, it } from "vitest";
import { Rng } from "../src/rng";
import { advance } from "../src/sim/advance";
import { calendar } from "../src/sim/calendar";
import { startIntent, type IntentRequest } from "../src/sim/intent";
import { newGame } from "../src/sim/newgame";
import { cellOf, placeAtSpot } from "../src/sim/position";
import { regionState } from "../src/sim/regionstate";
import { catchUp, deserialize, serialize } from "../src/sim/save";
import { beginTask, check, startTask, stopTask } from "../src/sim/tasks";
import { regionAt } from "../src/world/gen";
import {
  addOrder, chooseOrder, keepTarget, moveOrder, orderMet, orderSentence, ordersHere, removeOrder, countWord,
} from "../src/sim/orders";
import { addItem, pile, qty } from "../src/sim/inventory";

const cal = calendar(0);

describe("the order record", () => {
  it("a new region has an empty list and ids start at 1", () => {
    const { state, world } = newGame(3);
    const st = regionState(state, world, state.player.region);
    expect(st.orders).toEqual([]);
    expect(st.nextOrderId).toBe(1);
  });

  it("a save without orders loads with empty lists, and a live intent without an order is manual", () => {
    const { state, world } = newGame(3);
    startIntent(state, world, cal, new Rng(1), { task: "sticks", until: { kind: "once" }, deliver: "leave", where: "nearest" });
    const raw = JSON.parse(serialize(state));
    for (const st of Object.values(raw.state.regions) as Record<string, unknown>[]) {
      delete st.orders;
      delete st.nextOrderId;
    }
    delete raw.state.intent.orderId;
    delete raw.state.intent.windDown;
    const file = deserialize(JSON.stringify(raw))!;
    const st = file.state.regions[file.state.player.region];
    expect(st.orders).toEqual([]);
    expect(st.nextOrderId).toBe(1);
    expect(file.state.intent?.orderId).toBeNull();
    expect(file.state.intent?.windDown).toBe(false);
  });

  it("a manual intent starts with no order and no wind-down", () => {
    const { state, world } = newGame(3);
    startIntent(state, world, cal, new Rng(1), { task: "sticks", until: { kind: "once" }, deliver: "leave", where: "nearest" });
    expect(state.intent?.orderId).toBeNull();
    expect(state.intent?.windDown).toBe(false);
  });

  it("waiting at camp is an option the runner can name but a task no one can start by hand", () => {
    const { state, world } = newGame(3);
    const o = check(state, world, cal, "wait");
    expect(o.ok).toBe(true);
    expect(o.label).toBe("Wait at camp");
    expect(beginTask(state, world, cal, "wait")).toBe(false);
    expect(state.task).toBeNull();
  });
});

describe("the list", () => {
  it("a click appends at the bottom with the next id; up, down and remove edit the list", () => {
    const { state, world } = newGame(3);
    const a = addOrder(state, world, { task: "chop", until: { kind: "forever" }, deliver: "camp", where: "nearest" }, "grind");
    const b = addOrder(state, world, { task: "split", until: { kind: "campHas", qty: 40 }, deliver: "camp", where: "nearest" }, "keep");
    expect(ordersHere(state, world).map((o) => o.id)).toEqual([1, 2]);
    expect(a.kind).toBe("grind");
    expect(b.kind).toBe("keep");
    moveOrder(state, world, b.id, -1);
    expect(ordersHere(state, world).map((o) => o.id)).toEqual([2, 1]);
    moveOrder(state, world, b.id, -1);
    expect(ordersHere(state, world).map((o) => o.id)).toEqual([2, 1]);
    moveOrder(state, world, b.id, 1);
    expect(ordersHere(state, world).map((o) => o.id)).toEqual([1, 2]);
    removeOrder(state, world, a.id);
    expect(ordersHere(state, world).map((o) => o.id)).toEqual([2]);
    // Ids are never reused within a run.
    expect(addOrder(state, world, { task: "sticks", until: { kind: "once" }, deliver: "leave", where: "nearest" }, "job").id).toBe(3);
  });

  it("keep and camp-has need a countable yield; a build cannot be kept and becomes a once job", () => {
    const { state, world } = newGame(3);
    const o = addOrder(state, world, { task: "build", arg: "leanTo", until: { kind: "campHas", qty: 2 }, deliver: "camp", where: "nearest" }, "keep");
    expect(o.kind).toBe("job");
    expect(o.req.until).toEqual({ kind: "once" });
    expect(keepTarget(o)).toBeNull();
    const k = addOrder(state, world, { task: "split", until: { kind: "campHas", qty: 40 }, deliver: "leave", where: "nearest" }, "keep");
    expect(keepTarget(k)).toEqual({ item: "firewood", qty: 40 });
  });

  it("a grind's until is forever whatever the strip said", () => {
    const { state, world } = newGame(3);
    const o = addOrder(state, world, { task: "chop", until: { kind: "times", n: 3 }, deliver: "leave", where: "nearest" }, "grind");
    expect(o.req.until).toEqual({ kind: "forever" });
  });
});

describe("when an order is met", () => {
  it("a keep: unmet under half when idle, unmet until the target once live", () => {
    const { state, world } = newGame(3);
    const camp = pile(state, regionState(state, world, state.player.region).campCell);
    const o = addOrder(state, world, { task: "split", until: { kind: "campHas", qty: 40 }, deliver: "camp", where: "nearest" }, "keep");
    addItem(camp, "firewood", 25);
    expect(orderMet(state, world, o, false)).toBe(true);
    expect(orderMet(state, world, o, true)).toBe(false);
    addItem(camp, "firewood", 15);
    expect(orderMet(state, world, o, true)).toBe(true);
    camp.items.firewood = 19;
    expect(orderMet(state, world, o, false)).toBe(false);
    camp.items.firewood = 20;
    expect(orderMet(state, world, o, false)).toBe(true);
  });

  it("a keep counts the camp pile only, never the pack", () => {
    const { state, world } = newGame(3);
    const o = addOrder(state, world, { task: "split", until: { kind: "campHas", qty: 40 }, deliver: "camp", where: "nearest" }, "keep");
    addItem(state.player.pack, "firewood", 30);
    expect(orderMet(state, world, o, false)).toBe(false);
  });

  it("a grind is never met; jobs are met by their until, and a build by the structure standing", () => {
    const { state, world } = newGame(3);
    const st = regionState(state, world, state.player.region);
    const g = addOrder(state, world, { task: "chop", until: { kind: "forever" }, deliver: "leave", where: "nearest" }, "grind");
    expect(orderMet(state, world, g, false)).toBe(false);
    const once = addOrder(state, world, { task: "sticks", until: { kind: "once" }, deliver: "leave", where: "nearest" }, "job");
    expect(orderMet(state, world, once, false)).toBe(false);
    once.done = 1;
    expect(orderMet(state, world, once, false)).toBe(true);
    const times = addOrder(state, world, { task: "sticks", until: { kind: "times", n: 3 }, deliver: "leave", where: "nearest" }, "job");
    times.done = 2;
    expect(orderMet(state, world, times, false)).toBe(false);
    times.done = 3;
    expect(orderMet(state, world, times, false)).toBe(true);
    const has = addOrder(state, world, { task: "chop", until: { kind: "campHas", qty: 8 }, deliver: "camp", where: "nearest" }, "job");
    addItem(pile(state, st.campCell), "log", 8);
    expect(orderMet(state, world, has, false)).toBe(true);
    const build = addOrder(state, world, { task: "build", arg: "firePit", until: { kind: "once" }, deliver: "leave", where: "nearest" }, "job");
    expect(orderMet(state, world, build, false)).toBe(false);
    st.structures.firePit = true;
    expect(orderMet(state, world, build, false)).toBe(true);
  });
});

describe("what an order says", () => {
  it("reads as the intent sentence with the keep clause", () => {
    const { state, world } = newGame(3);
    const k = addOrder(state, world, { task: "split", until: { kind: "campHas", qty: 40 }, deliver: "camp", where: "nearest" }, "keep");
    expect(orderSentence(state, world, cal, k)).toBe("Split a log, keep camp at 40 kg firewood");
    const g = addOrder(state, world, { task: "chop", until: { kind: "forever" }, deliver: "camp", where: "nearest" }, "grind");
    expect(orderSentence(state, world, cal, g)).toBe("Fell a tree, forever, bringing it to camp");
    const j = addOrder(state, world, { task: "sticks", until: { kind: "times", n: 5 }, deliver: "leave", where: "forest" }, "job");
    j.done = 2;
    expect(orderSentence(state, world, cal, j)).toBe("Gather sticks, 2 of 5 done, at the forest");
    expect(countWord("chop", 14)).toBe("trees");
    expect(countWord("split", 1)).toBe("log");
    expect(countWord("repair", 3)).toBe("times");
  });
});

type G = ReturnType<typeof newGame>;
/** Advances a minute at a time until the predicate holds or the budget runs out. */
function until(g: G, pred: () => boolean, max = 3000): boolean {
  for (let i = 0; i < max; i++) {
    if (pred()) return true;
    advance(g.state, g.world, 1);
  }
  return pred();
}
function req(task: IntentRequest["task"], extra: Partial<IntentRequest> = {}): IntentRequest {
  return { task, until: { kind: "once" }, deliver: "leave", where: "nearest", ...extra };
}
/** A camp with a pit, an axe and a fire drill, standing at the camp cell. */
function campWith(seed: number, camp: Partial<Record<"log" | "firewood" | "driedMeat" | "stick", number>>) {
  const g = newGame(seed);
  const { state, world } = g;
  const st = regionState(state, world, state.player.region);
  st.structures.firePit = true;
  state.player.tools.push({ id: "fireDrill", durability: 100 });
  placeAtSpot(state, world, state.player.region, "camp");
  const p = pile(state, st.campCell);
  for (const [item, n] of Object.entries(camp)) addItem(p, item as "log", n);
  return g;
}

describe("the scheduler", () => {
  it("takes the highest unmet order that can start, and marks the ones it passes over", () => {
    const g = campWith(3, { log: 4, firewood: 10 });
    const { state, world } = g;
    const keep = addOrder(state, world, req("split", { until: { kind: "campHas", qty: 40 }, deliver: "camp" }), "keep");
    const grind = addOrder(state, world, req("chop", { until: { kind: "forever" }, deliver: "camp" }), "grind");
    expect(chooseOrder(state, world, cal)?.id).toBe(keep.id);
    advance(state, world, 1);
    expect(state.intent?.orderId).toBe(keep.id);
    expect(state.task?.id).toBe("split");
    expect(grind.skipped).toBe("");
    // The keep filled: its intent ends, the grind takes over.
    expect(until(g, () => state.intent?.orderId === grind.id)).toBe(true);
    expect(qty(pile(state, regionState(state, world, state.player.region).campCell), "firewood")).toBeGreaterThanOrEqual(40);
    expect(keep.done).toBeGreaterThanOrEqual(2);
    expect(keep.minutes).toBeGreaterThan(0);
  });

  it("a blocked order is skipped with the button's reason, logged once, and the next order runs", () => {
    const g = campWith(3, { firewood: 5 });
    const { state, world } = g;
    const keep = addOrder(state, world, req("split", { until: { kind: "campHas", qty: 40 }, deliver: "camp" }), "keep");
    const sticks = addOrder(state, world, req("sticks", { until: { kind: "forever" } }), "grind");
    advance(state, world, 1);
    expect(keep.skipped).toBe("no logs here");
    expect(state.intent?.orderId).toBe(sticks.id);
    const line = "Split a log, keep camp at 40 kg firewood: no logs here.";
    expect(state.log.filter((e) => e.text === line).length).toBe(1);
    // Skipped again and again, but the line is written once until the reason changes.
    expect(until(g, () => state.task === null)).toBe(true);
    advance(state, world, 5);
    expect(state.log.filter((e) => e.text === line).length).toBe(1);
  });

  it("never switches mid-task, and finishes a pending delivery before it does", () => {
    const g = campWith(3, { firewood: 40 });
    const { state, world } = g;
    const st = regionState(state, world, state.player.region);
    const keep = addOrder(state, world, req("split", { until: { kind: "campHas", qty: 40 }, deliver: "camp" }), "keep");
    // Seed 3's camp sits on forest ground, so "nearest" would fell at camp itself; name the forest spot so a haul is really owed.
    const grind = addOrder(state, world, req("chop", { until: { kind: "forever" }, deliver: "camp", where: "forest" }), "grind");
    // The keep is met; the grind runs and fells a tree at the forest, off camp.
    expect(until(g, () => state.task?.id === "chop")).toBe(true);
    expect(state.intent?.orderId).toBe(grind.id);
    const forest = state.intent!.cell;
    expect(forest).not.toBe(st.campCell);
    // Firewood vanishes mid-felling: the keep is unmet, but the tree is finished first.
    pile(state, st.campCell).items.firewood = 0;
    addItem(pile(state, st.campCell), "log", 2);
    advance(state, world, 1);
    expect(state.task?.id).toBe("chop");
    expect(state.intent?.orderId).toBe(grind.id);
    expect(until(g, () => state.task?.id !== "chop")).toBe(true);
    // The felled logs lie at the forest: the grind winds down and hauls them home before the keep takes over.
    expect(state.intent?.orderId).toBe(grind.id);
    expect(state.intent?.windDown).toBe(true);
    expect(until(g, () => state.intent?.orderId === keep.id, 6000)).toBe(true);
    expect(qty(pile(state, forest), "log")).toBe(0);
    expect(cellOf(state, world)).toBe(st.campCell);
  });

  it("a met job drops off with its done line; a keep stays", () => {
    const g = campWith(3, { log: 2 });
    const { state, world } = g;
    const job = addOrder(state, world, req("split", { until: { kind: "times", n: 2 }, deliver: "camp" }), "job");
    expect(until(g, () => ordersHere(state, world).length === 0)).toBe(true);
    expect(job.done).toBe(2);
    // orderSentence adds "bringing it to camp" for a non-keep order that delivers to camp (Task 2 behaviour).
    expect(state.log.filter((e) => e.text === "Split a log, 2 of 2 done, bringing it to camp: done.").length).toBe(1);
    expect(state.intent).toBeNull();
  });

  it("removing the live order ends its intent at the next free minute; reordering takes effect then too", () => {
    const g = campWith(3, { log: 6 });
    const { state, world } = g;
    const a = addOrder(state, world, req("split", { until: { kind: "forever" } }), "grind");
    const b = addOrder(state, world, req("sticks", { until: { kind: "forever" } }), "grind");
    advance(state, world, 1);
    expect(state.intent?.orderId).toBe(a.id);
    moveOrder(state, world, b.id, -1);
    advance(state, world, 1);
    expect(state.intent?.orderId).toBe(a.id);
    expect(until(g, () => state.intent?.orderId === b.id)).toBe(true);
    removeOrder(state, world, b.id);
    expect(until(g, () => state.intent?.orderId === a.id)).toBe(true);
  });

  it("removing the last order clears its live intent, not just one among several", () => {
    const g = campWith(3, { log: 6 });
    const { state, world } = g;
    // Sticks never run out, unlike split's logs: the intent only ends because the list is empty, not because the work did.
    const a = addOrder(state, world, req("sticks", { until: { kind: "forever" } }), "grind");
    expect(until(g, () => state.intent?.orderId === a.id)).toBe(true);
    removeOrder(state, world, a.id);
    expect(until(g, () => state.intent === null)).toBe(true);
    expect(ordersHere(state, world)).toEqual([]);
  });

  it("nothing to do starts one wait intent that stays live, not a task that ends and restarts it", () => {
    const g = campWith(3, { firewood: 40 });
    const { state, world } = g;
    // Already at target: the only order is met from the first free minute, so there is nothing to run.
    addOrder(state, world, req("split", { until: { kind: "campHas", qty: 40 }, deliver: "camp" }), "keep");
    advance(state, world, 10);
    expect(state.intent?.task).toBe("wait");
    expect(state.log.filter((e) => e.text === "Nothing to do. You wait at camp.").length).toBe(1);
  });

  it("removing the last order while a wait intent is live still clears it", () => {
    const g = campWith(3, { firewood: 40 });
    const { state, world } = g;
    // Already at target: the only order is met from the first free minute, so wait becomes live.
    const keep = addOrder(state, world, req("split", { until: { kind: "campHas", qty: 40 }, deliver: "camp" }), "keep");
    advance(state, world, 3);
    expect(state.intent?.task).toBe("wait");
    removeOrder(state, world, keep.id);
    // The scheduler only runs once the rest step it is mid-way through frees the slot.
    expect(until(g, () => state.intent === null)).toBe(true);
  });

  it("chooseOrder judges the walk to the work too, skipping a route it cannot take", () => {
    const g = campWith(3, { firewood: 40 });
    const { state, world } = g;
    // Two logs is 40 kg, over the 35 kg pack limit: any walk fails, but chop's own check does not mind a full pack.
    addItem(state.player.pack, "log", 2);
    // Seed 3's camp sits on forest ground; name the forest spot so the work cell is off camp and a walk is owed.
    const chop = addOrder(state, world, req("chop", { until: { kind: "forever" }, where: "forest" }), "grind");
    expect(chooseOrder(state, world, cal)).toBeNull();
    expect(chop.skipped).toBe("the pack is too heavy to lift");
  });

  it("a blocked walk to the work silently ends an order's intent, not a logged stop", () => {
    const g = campWith(3, { log: 6 });
    const { state, world } = g;
    // Started directly (bypassing chooseOrder's own walk check) so the failure is workStep's to handle.
    addItem(state.player.pack, "log", 2);
    const chop = addOrder(state, world, req("chop", { until: { kind: "forever" }, where: "forest" }), "grind");
    const before = state.log.length;
    startIntent(state, world, cal, new Rng(1), chop.req, chop.id);
    expect(state.intent).toBeNull();
    expect(state.log.length).toBe(before);
  });

  it("a manual intent is left alone while the region has no orders, and a raw task overrides the list until it ends", () => {
    const g = campWith(3, { log: 6 });
    const { state, world } = g;
    startIntent(state, world, cal, new Rng(1), req("sticks", { until: { kind: "forever" } }));
    advance(state, world, 30);
    expect(state.intent?.orderId).toBeNull();
    expect(state.task?.id).toBe("sticks");
    const a = addOrder(state, world, req("split", { until: { kind: "forever" } }), "grind");
    expect(until(g, () => state.intent?.orderId === a.id)).toBe(true);
    stopTask(state, world);
    beginTask(state, world, cal, "rest");
    advance(state, world, 30);
    expect(state.intent).toBeNull();
    expect(state.task?.id).toBe("rest");
    expect(until(g, () => state.intent?.orderId === a.id)).toBe(true);
  });
});

describe("waiting at camp", () => {
  it("with orders but nothing to do, the runner walks home, rests, and sleeps at camp with the fire lit", () => {
    const g = campWith(3, { firewood: 60, driedMeat: 3 });
    const { state, world } = g;
    const st = regionState(state, world, state.player.region);
    // Off camp, so the wait has to walk. A keep already met is the whole list.
    placeAtSpot(state, world, state.player.region, "heath");
    addOrder(state, world, req("split", { until: { kind: "campHas", qty: 40 }, deliver: "camp" }), "keep");
    advance(state, world, 1);
    expect(state.intent?.task).toBe("wait");
    expect(state.task?.id).toBe("walk");
    expect(state.log.some((e) => e.text === "Nothing to do. You wait at camp.")).toBe(true);
    expect(until(g, () => state.task?.id === "rest")).toBe(true);
    expect(cellOf(state, world)).toBe(st.campCell);
    expect(state.intent?.step).toBe("waiting at camp");
    // A rest task alone never tires the body (it recovers energy); force the
    // sleep need the way a spent day would, and it is served here, by a fire
    // lit from the firewood already at camp.
    state.player.energy = 20;
    expect(until(g, () => state.task?.id === "sleep", 200)).toBe(true);
    expect(cellOf(state, world)).toBe(st.campCell);
    expect(st.fire.lit).toBe(true);
    // The wait is not an order and the list still has the one keep.
    expect(ordersHere(state, world).length).toBe(1);
    expect(state.intent?.orderId).toBeNull();
  });

  it("a keep that becomes unmet takes over from the wait at once", () => {
    const g = campWith(3, { firewood: 60, log: 3 });
    const { state, world } = g;
    const st = regionState(state, world, state.player.region);
    const keep = addOrder(state, world, req("split", { until: { kind: "campHas", qty: 40 }, deliver: "camp" }), "keep");
    advance(state, world, 2);
    expect(state.intent?.task).toBe("wait");
    pile(state, st.campCell).items.firewood = 10;
    expect(until(g, () => state.intent?.orderId === keep.id, 120)).toBe(true);
  });

  it("a region with no orders has no intent of its own", () => {
    const { state, world } = newGame(3);
    advance(state, world, 10);
    expect(state.intent).toBeNull();
  });

  it("waits through the day and sleeps once night falls", () => {
    const g = campWith(3, { firewood: 60 });
    const { state, world } = g;
    const st = regionState(state, world, state.player.region);
    // Already met: the wait starts at once, no order ever runs.
    addOrder(state, world, req("split", { until: { kind: "campHas", qty: 40 }, deliver: "camp" }), "keep");
    expect(until(g, () => calendar(state.minute).isNight && state.task?.id === "sleep", 1500)).toBe(true);
    expect(cellOf(state, world)).toBe(st.campCell);
    expect(state.intent?.task).toBe("wait");
  });
});

describe("a set-up camp", () => {
  it("keeps the fire, the sticks and the felling going for three days, every night at camp", () => {
    // Seed 3's home region has no waterside cell at all, so a stay-at-camp
    // run there dies of thirst regardless of orders; seed 21's camp is on
    // forest ground with a reachable shore, same as the wait-at-camp fixtures.
    const g = campWith(21, { log: 6, firewood: 30, driedMeat: 5 });
    const { state, world } = g;
    const st = regionState(state, world, state.player.region);
    const wood = addOrder(state, world, req("split", { until: { kind: "campHas", qty: 40 }, deliver: "camp" }), "keep");
    const sticks = addOrder(state, world, req("sticks", { until: { kind: "campHas", qty: 30 }, deliver: "camp" }), "keep");
    const trees = addOrder(state, world, req("chop", { until: { kind: "forever" }, deliver: "camp" }), "grind");
    let sleptElsewhere = 0;
    let sleeps = 0;
    let prev: string | undefined;
    for (let m = 0; m < 72 * 60; m++) {
      advance(state, world, 1);
      const id = state.task?.id;
      if (id === "sleep" && prev !== "sleep") {
        sleeps++;
        if (cellOf(state, world) !== st.campCell) sleptElsewhere++;
      }
      prev = id;
    }
    expect(state.dead).toBeNull();
    expect(sleeps).toBeGreaterThanOrEqual(2);
    expect(sleptElsewhere).toBe(0);
    expect(wood.done).toBeGreaterThanOrEqual(1);
    expect(sticks.done).toBeGreaterThanOrEqual(1);
    expect(trees.done).toBeGreaterThanOrEqual(3);
    expect(state.stats.trees).toBe(trees.done);
    // The counters are the completions: minutes in the work, none from walks or hauls.
    expect(trees.minutes).toBeGreaterThan(0);
    expect(qty(pile(state, st.campCell), "log")).toBeGreaterThan(0);
  });
});

describe("orders belong to a camp", () => {
  it("the next region has its own empty list, and the first list resumes on return", () => {
    const g = campWith(3, { log: 6 });
    const { state, world } = g;
    const home = state.player.region;
    const a = addOrder(state, world, req("split", { until: { kind: "forever" } }), "grind");
    advance(state, world, 1);
    expect(state.intent?.orderId).toBe(a.id);
    const nb = regionAt(world, home).neighbours[0].id;
    expect(startTask(state, world, calendar(state.minute), "travel", `region:${nb}`)).toBe(true);
    expect(state.intent).toBeNull();
    expect(until(g, () => state.player.region === nb, 6000)).toBe(true);
    expect(until(g, () => state.task === null, 6000)).toBe(true);
    advance(state, world, 5);
    expect(ordersHere(state, world)).toEqual([]);
    expect(state.intent).toBeNull();
    expect(startTask(state, world, calendar(state.minute), "travel", `region:${home}`)).toBe(true);
    // Home still has the order, so the runner is never truly idle here as it
    // was in the empty-list region: the moment work is blocked, wait fills
    // the slot in the same tick, and task never reads back as null again
    // until the order itself resumes. That resuming is the thing under test.
    expect(until(g, () => state.player.region === home && state.intent?.orderId === a.id, 6000)).toBe(true);
    advance(state, world, 5);
    expect(ordersHere(state, world).map((o) => o.id)).toEqual([a.id]);
    expect(state.intent?.orderId).toBe(a.id);
  });
});

describe("the away report", () => {
  it("summarises every order of the camp you left: what it did, what blocks it, what finished", () => {
    const g = campWith(3, { log: 6, firewood: 10 });
    const { state, world } = g;
    const keep = addOrder(state, world, req("split", { until: { kind: "campHas", qty: 40 }, deliver: "camp" }), "keep");
    addOrder(state, world, req("sticks", { until: { kind: "once" } }), "job");
    addOrder(state, world, req("build", { arg: "cabin", until: { kind: "once" } }), "job");
    const grind = addOrder(state, world, req("chop", { until: { kind: "forever" }, deliver: "camp" }), "grind");
    const away = catchUp(state, world, 4 * 3600);
    expect(away.movedTo).toBeNull();
    expect(away.orders.map((o) => o.label)).toEqual([
      orderSentence(state, world, calendar(state.minute), keep),
      "Gather sticks",
      "log cabin",
      orderSentence(state, world, calendar(state.minute), grind),
    ]);
    const [k, j, c, t] = away.orders;
    expect(k.done).toBe(keep.done);
    expect(k.minutes).toBe(keep.minutes);
    expect(j.gone).toBe(true);
    expect(j.done).toBe(1);
    expect(c.skipped).toBe("missing materials at camp");
    expect(c.done).toBe(0);
    expect(t.task).toBe("chop");
    expect(t.done).toBe(grind.done);
    expect(away.entries.length).toBeGreaterThan(0);
  });

  it("counts only what happened while away", () => {
    const g = campWith(3, { log: 6 });
    const { state, world } = g;
    const grind = addOrder(state, world, req("split", { until: { kind: "forever" } }), "grind");
    advance(state, world, 60);
    const before = grind.done;
    expect(before).toBeGreaterThan(0);
    const away = catchUp(state, world, 1800);
    expect(away.orders[0].done).toBe(grind.done - before);
  });

  it("a save mid-order resumes the same order", () => {
    // 10 logs at 15 min a split outlast the 5 + 120 minutes below; 6 would run
    // dry partway through and the order would fall through to a wait, which
    // is not what this test is checking.
    const g = campWith(3, { log: 10 });
    const { state, world } = g;
    const a = addOrder(state, world, req("split", { until: { kind: "forever" } }), "grind");
    advance(state, world, 5);
    const file = deserialize(serialize(state))!;
    const s2 = file.state;
    expect(s2.intent?.orderId).toBe(a.id);
    catchUp(s2, world, 120);
    expect(s2.intent?.orderId).toBe(a.id);
    expect(regionState(s2, world, s2.player.region).orders[0].done).toBeGreaterThan(a.done);
  });
});
