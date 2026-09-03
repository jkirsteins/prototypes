import { describe, expect, it } from "vitest";
import { Rng } from "../src/rng";
import { calendar } from "../src/sim/calendar";
import { startIntent } from "../src/sim/intent";
import { newGame } from "../src/sim/newgame";
import { regionState } from "../src/sim/regionstate";
import { deserialize, serialize } from "../src/sim/save";
import { beginTask, check } from "../src/sim/tasks";
import { addOrder, keepTarget, moveOrder, orderMet, orderSentence, ordersHere, removeOrder, countWord } from "../src/sim/orders";
import { addItem, pile } from "../src/sim/inventory";

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
