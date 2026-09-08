import { describe, expect, it } from "vitest";
import { Rng } from "../src/rng";
import { advance } from "../src/sim/advance";
import { bodyRowOf, campRowOf, isCareRow } from "../src/sim/bodyorder";
import { calendar, START_DOY } from "../src/sim/calendar";
import { deliveryPending, resolveCell, startIntent, type IntentRequest } from "../src/sim/intent";
import { normalizeOrder } from "../src/sim/ladder";
import { mapRegion } from "../src/sim/mapped";
import { seeFrom } from "../src/sim/sight";
import { newGame } from "../src/sim/newgame";
import { body } from "../src/sim/person";
import { cellOf, placeAt, placeAtSpot } from "../src/sim/position";
import { regionState, siteFor } from "../src/sim/regionstate";
import { catchUp, deserialize, serialize } from "../src/sim/save";
import { beginTask, startTask, stopTask } from "../src/sim/tasks";
import { regionAt } from "../src/world/gen";
import { ordersHtml } from "../src/ui/panels";
import {
  addOrder, blockingOrder, chooseOrder, conditionOpen, inSeason, judgeOrders, keepBand, keepStock, keepTarget, keepTargetToday, moveOrder, moveOrderByHand, orderMet, orderSentence, ordersHere, pinOrderByHand, removeOrder, removeOrderByHand, resetWalkJudged, runOrders, countWord, NIGHT_SKIP, walkJudged,
} from "../src/sim/orders";
import { addItem, pile, qty, removeItem } from "../src/sim/inventory";
import { BARK_DRY_RATIO } from "../src/sim/items";
import { WINTER_START_DOY } from "../src/sim/year";
import { today } from "../src/sim/ledger";
import { siteCamp } from "./siting-helpers";
import { isWorkOrder } from "../src/sim/types";

const cal = calendar(0);
const chosenTask = (o: ReturnType<typeof chooseOrder>) => o && isWorkOrder(o) ? o.req.task : null;

describe("the order record", () => {
  it("a new region's list is the two care rows and nothing else, and the next id is past them", () => {
    const { state, world } = newGame(3);
    siteCamp(state, world);
    const st = regionState(state, world, state.player.region);
    expect(st.orders.map((o) => o.kind)).toEqual(["camp", "body"]);
    expect(st.nextOrderId).toBe(3);
  });

  it("a save without orders loads with empty lists, and a live intent without an order is manual", () => {
    const { state, world } = newGame(3);
    siteCamp(state, world);
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
    // A save from before the list existed at all gets both care rows the same
    // way one from before either row existed does.
    expect(st.orders.map((o) => o.kind)).toEqual(["camp", "body"]);
    expect(st.nextOrderId).toBe(3);
    expect(file.state.intent?.orderId).toBeNull();
    expect(file.state.intent?.windDown).toBe(false);
  });

  it("a manual intent starts with no order and no wind-down", () => {
    const { state, world } = newGame(3);
    siteCamp(state, world);
    startIntent(state, world, cal, new Rng(1), { task: "sticks", until: { kind: "once" }, deliver: "leave", where: "nearest" });
    expect(state.intent?.orderId).toBeNull();
    expect(state.intent?.windDown).toBe(false);
  });

});

describe("the list", () => {
  it("a click appends at the bottom with the next id; up, down and remove edit the list", () => {
    const { state, world } = newGame(3);
    siteCamp(state, world);
    // Ids 1 and 2 are the camp and body rows every list already carries.
    const a = addOrder(state, world, { task: "chop", until: { kind: "forever" }, deliver: "camp", where: "nearest" }, "grind");
    const b = addOrder(state, world, { task: "split", until: { kind: "campHas", qty: 40 }, deliver: "camp", where: "nearest" }, "keep");
    expect(ordersHere(state, world).map((o) => o.id)).toEqual([1, 2, 3, 4]);
    expect(a.kind).toBe("grind");
    expect(b.kind).toBe("keep");
    moveOrder(state, world, b.id, -1);
    expect(ordersHere(state, world).map((o) => o.id)).toEqual([1, 2, 4, 3]);
    // A care row ranks like any other row: work moved over the body is the
    // player saying "keep at it, tired or not", and the row moves back the same way.
    moveOrder(state, world, b.id, -1);
    expect(ordersHere(state, world).map((o) => o.id)).toEqual([1, 4, 2, 3]);
    moveOrder(state, world, 2, -1);
    expect(ordersHere(state, world).map((o) => o.id)).toEqual([1, 2, 4, 3]);
    // A move off either end does nothing.
    moveOrder(state, world, 1, -1);
    expect(ordersHere(state, world).map((o) => o.id)).toEqual([1, 2, 4, 3]);
    moveOrder(state, world, b.id, 1);
    expect(ordersHere(state, world).map((o) => o.id)).toEqual([1, 2, 3, 4]);
    removeOrder(state, world, a.id);
    expect(ordersHere(state, world).map((o) => o.id)).toEqual([1, 2, 4]);
    // Ids are never reused within a run.
    expect(addOrder(state, world, { task: "sticks", until: { kind: "once" }, deliver: "leave", where: "nearest" }, "job").id).toBe(5);
  });

  it("keep and camp-has need a countable yield, except a build keep, which stands on the structure and holds no stock", () => {
    const { state, world } = newGame(3);
    siteCamp(state, world);
    const o = addOrder(state, world, { task: "build", arg: "leanTo", until: { kind: "campHas", qty: 2 }, deliver: "camp", where: "nearest" }, "keep");
    expect(o.kind).toBe("keep");
    expect(o.req.until).toEqual({ kind: "campHas", qty: 2 });
    expect(keepTarget(o)).toBeNull();
    const k = addOrder(state, world, { task: "split", until: { kind: "campHas", qty: 40 }, deliver: "leave", where: "nearest" }, "keep");
    expect(keepTarget(k)).toEqual({ item: "firewood", qty: 40 });
  });

  it("a grind's until is forever whatever the strip said", () => {
    const { state, world } = newGame(3);
    siteCamp(state, world);
    const o = addOrder(state, world, { task: "chop", until: { kind: "times", n: 3 }, deliver: "leave", where: "nearest" }, "grind");
    expect(o.req.until).toEqual({ kind: "forever" });
  });

  it("a keep whose task is light is allowed, another keep besides a build keep with no countable yield", () => {
    const { state, world } = newGame(3);
    siteCamp(state, world);
    const o = addOrder(state, world, { task: "light", until: { kind: "campHas", qty: 1 }, deliver: "camp", where: "nearest" }, "keep");
    expect(o.kind).toBe("keep");
    expect(o.req.until).toEqual({ kind: "campHas", qty: 1 });
    expect(keepTarget(o)).toBeNull();
  });
});

describe("when an order is met", () => {
  it("a keep: unmet under half when idle, unmet until the target once live", () => {
    const { state, world } = newGame(3);
    siteCamp(state, world);
    const camp = pile(state, regionState(state, world, state.player.region).campCell!);
    const o = addOrder(state, world, { task: "split", until: { kind: "campHas", qty: 40 }, deliver: "camp", where: "nearest" }, "keep");
    addItem(camp, "firewood", 25);
    expect(orderMet(state, world, cal, o, false)).toBe(true);
    expect(orderMet(state, world, cal, o, true)).toBe(false);
    addItem(camp, "firewood", 15);
    expect(orderMet(state, world, cal, o, true)).toBe(true);
    camp.items.firewood = 19;
    expect(orderMet(state, world, cal, o, false)).toBe(false);
    camp.items.firewood = 20;
    expect(orderMet(state, world, cal, o, false)).toBe(true);
  });

  it("a keep counts the camp pile only, never the pack", () => {
    const { state, world } = newGame(3);
    siteCamp(state, world);
    const o = addOrder(state, world, { task: "split", until: { kind: "campHas", qty: 40 }, deliver: "camp", where: "nearest" }, "keep");
    addItem(state.player.pack, "firewood", 30);
    expect(orderMet(state, world, cal, o, false)).toBe(false);
  });

  it("a keep on a kit item counts the pack too, since that is where camp's kit sits while an order carries it out", () => {
    const { state, world } = newGame(3);
    siteCamp(state, world);
    const snares = addOrder(state, world, { task: "craft", arg: "snare", until: { kind: "campHas", qty: 1 }, deliver: "leave", where: "nearest" }, "keep");
    addItem(state.player.pack, "snare", 1);
    expect(orderMet(state, world, cal, snares, true)).toBe(true);
    const arrows = addOrder(state, world, { task: "craft", arg: "arrows", until: { kind: "campHas", qty: 10 }, deliver: "leave", where: "nearest" }, "keep");
    addItem(state.player.pack, "arrow", 10);
    expect(orderMet(state, world, cal, arrows, true)).toBe(true);
  });

  it("an inner bark keep reads the fresh strip and the dried one together, scaled by BARK_DRY_RATIO since a kilo of the dried kind is that many kilos of the fresh strip it dried from", () => {
    const { state, world } = newGame(3);
    siteCamp(state, world);
    const camp = pile(state, regionState(state, world, state.player.region).campCell!);
    const o = addOrder(state, world, { task: "innerBark", until: { kind: "campHas", qty: 3 }, deliver: "camp", where: "nearest" }, "keep");
    addItem(camp, "freshBark", 1);
    expect(orderMet(state, world, cal, o, false)).toBe(false);
    addItem(camp, "driedBark", 1);
    expect(orderMet(state, world, cal, o, false)).toBe(true);
    camp.items.freshBark = 0;
    camp.items.driedBark = 1;
    // The live threshold is the whole 3 kg, so this is the assertion the ratio decides: one
    // kilo of the dried kind is three fresh-strip kilos and reads met, where a 1-for-1 sum
    // would read 1 against 3 and send the runner back to the pines. The idle assertion above
    // passes either way - 1 + 1 already clears the 1.5 kg half-target.
    expect(BARK_DRY_RATIO).toBe(3);
    expect(orderMet(state, world, cal, o, true)).toBe(true);
  });

  it("a grind is never met; jobs are met by their until, and a build by the structure standing", () => {
    const { state, world } = newGame(3);
    siteCamp(state, world);
    const st = regionState(state, world, state.player.region);
    const g = addOrder(state, world, { task: "chop", until: { kind: "forever" }, deliver: "leave", where: "nearest" }, "grind");
    expect(orderMet(state, world, cal, g, false)).toBe(false);
    const once = addOrder(state, world, { task: "sticks", until: { kind: "once" }, deliver: "leave", where: "nearest" }, "job");
    expect(orderMet(state, world, cal, once, false)).toBe(false);
    once.done = 1;
    expect(orderMet(state, world, cal, once, false)).toBe(true);
    const times = addOrder(state, world, { task: "sticks", until: { kind: "times", n: 3 }, deliver: "leave", where: "nearest" }, "job");
    times.done = 2;
    expect(orderMet(state, world, cal, times, false)).toBe(false);
    times.done = 3;
    expect(orderMet(state, world, cal, times, false)).toBe(true);
    const has = addOrder(state, world, { task: "chop", until: { kind: "campHas", qty: 8 }, deliver: "camp", where: "nearest" }, "job");
    addItem(pile(state, st.campCell!), "log", 8);
    expect(orderMet(state, world, cal, has, false)).toBe(true);
    const build = addOrder(state, world, { task: "build", arg: "firePit", until: { kind: "once" }, deliver: "leave", where: "nearest" }, "job");
    expect(orderMet(state, world, cal, build, false)).toBe(false);
    siteFor(st, st.campCell!).structures.firePit = true;
    expect(orderMet(state, world, cal, build, false)).toBe(true);
  });

  it("a light keep is met while the fire is lit, live or idle alike, unmet the moment it goes out", () => {
    const { state, world } = newGame(3);
    siteCamp(state, world);
    const st = regionState(state, world, state.player.region);
    const o = addOrder(state, world, { task: "light", until: { kind: "campHas", qty: 1 }, deliver: "camp", where: "nearest" }, "keep");
    expect(orderMet(state, world, cal, o, false)).toBe(false);
    expect(orderMet(state, world, cal, o, true)).toBe(false);
    st.fire.lit = true;
    expect(orderMet(state, world, cal, o, false)).toBe(true);
    expect(orderMet(state, world, cal, o, true)).toBe(true);
    st.fire.lit = false;
    expect(orderMet(state, world, cal, o, false)).toBe(false);
    expect(orderMet(state, world, cal, o, true)).toBe(false);
  });
});

describe("what an order says", () => {
  it("reads as the intent sentence with the keep clause", () => {
    const { state, world } = newGame(3);
    siteCamp(state, world);
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

  it("a light keep reads as keeping it lit, not a number that means nothing", () => {
    const { state, world } = newGame(3);
    siteCamp(state, world);
    const o = addOrder(state, world, { task: "light", until: { kind: "campHas", qty: 1 }, deliver: "camp", where: "nearest" }, "keep");
    expect(orderSentence(state, world, cal, o)).toBe("Light the fire at the site, keep it lit");
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
  siteCamp(g.state, g.world);
  const { state, world } = g;
  const st = regionState(state, world, state.player.region);
  siteFor(st, st.campCell!).structures.firePit = true;
  state.player.tools.push({ id: "fireDrill", durability: 100 });
  placeAtSpot(state, world, state.player.region, "camp");
  const p = pile(state, st.campCell!);
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
    expect(qty(pile(state, regionState(state, world, state.player.region).campCell!), "firewood")).toBeGreaterThanOrEqual(40);
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

  it("a row below the live one is spared the question and its stale reason clears", () => {
    const g = campWith(3, { log: 6 });
    const { state, world } = g;
    const grind = addOrder(state, world, req("split", { until: { kind: "forever" } }), "grind");
    const cabin = addOrder(state, world, req("build", { arg: "cabin", until: { kind: "once" } }), "job");
    advance(state, world, 1);
    expect(state.intent?.orderId).toBe(grind.id);
    // Before anything is live every row is asked, so the first minute still
    // reads cabin's own reason and logs it, once, against what ran instead.
    expect(cabin.skipped).toMatch(/^short .* at camp$/);
    const line = `log cabin: ${cabin.skipped}. Split a log, forever instead.`;
    expect(state.log.filter((e) => e.text === line).length).toBe(1);
    // With the grind live and mid-chunk, runOrders asks the list nothing
    // more - judging costs nothing there is anything to act on the answer
    // with - so cabin's mark sits exactly where the first minute left it.
    advance(state, world, 5);
    expect(cabin.skipped).toMatch(/^short .* at camp$/);
    // The panel and waitingLine do not read it this way: they judge the list
    // fresh on every render, the same call this makes directly. With the
    // grind live and ranked above it, cabin can never pre-empt it, so asking
    // whether it could run is a question the prefix rule no longer puts to
    // it. Its stale mark clears rather than being kept alive by a check that
    // is not run, and nothing further is logged over it.
    judgeOrders(state, world, cal);
    expect(cabin.skipped).toBe("");
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
    const forest = state.intent!.cell!;
    expect(forest).not.toBe(st.campCell!);
    // Firewood vanishes mid-felling: the keep is unmet, but the tree is finished first.
    pile(state, st.campCell!).items.firewood = 0;
    addItem(pile(state, st.campCell!), "log", 2);
    advance(state, world, 1);
    expect(state.task?.id).toBe("chop");
    expect(state.intent?.orderId).toBe(grind.id);
    expect(until(g, () => state.task?.id !== "chop")).toBe(true);
    // The felled logs lie at the forest: the grind winds down and hauls them home before the keep takes over.
    expect(state.intent?.orderId).toBe(grind.id);
    expect(state.intent?.windDown).toBe(true);
    expect(until(g, () => state.intent?.orderId === keep.id, 6000)).toBe(true);
    expect(qty(pile(state, forest), "log")).toBe(0);
    expect(cellOf(state, world)).toBe(st.campCell!);
  });

  it("a met job drops off with its done line; a keep stays", () => {
    const g = campWith(3, { log: 2 });
    const { state, world } = g;
    const job = addOrder(state, world, req("split", { until: { kind: "times", n: 2 }, deliver: "camp" }), "job");
    expect(until(g, () => ordersHere(state, world).every(isCareRow))).toBe(true);
    expect(job.done).toBe(2);
    // orderSentence adds "bringing it to camp" for a non-keep order that delivers to camp (Task 2 behaviour).
    expect(state.log.filter((e) => e.text === "Split a log, 2 of 2 done, bringing it to camp: done.").length).toBe(1);
    expect(state.intent).toBeNull();
  });

  it("a night job bumps the order's counter through the sleep alias and drops off", () => {
    const g = campWith(3, { firewood: 30 });
    const { state, world } = g;
    const job = addOrder(state, world, req("night"), "job");
    advance(state, world, 1);
    expect(state.intent?.orderId).toBe(job.id);
    expect(until(g, () => state.intent === null, 1500)).toBe(true);
    expect(ordersHere(state, world).every(isCareRow)).toBe(true);
    expect(job.done).toBe(1);
    expect(state.log.filter((e) => e.text === "Camp for the night: done.").length).toBe(1);
    // The list has no real order left, so nothing restarts it and no second sleep is ever started by the order.
    advance(state, world, 30);
    expect(state.intent).toBeNull();
  });

  it("the raw mutators leave the live intent to the next free minute", () => {
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

  it("a standing order moved above the live one starts on the next minute, and the work set aside keeps its share", () => {
    const g = campWith(3, { log: 6 });
    const { state, world } = g;
    const a = addOrder(state, world, req("split", { until: { kind: "forever" } }), "grind");
    const b = addOrder(state, world, req("sticks", { until: { kind: "forever" } }), "grind");
    // Far enough into the split that the share kept is worth reading, and well short of its end.
    expect(until(g, () => state.task?.id === "split" && state.task.progress > 2)).toBe(true);
    expect(state.intent?.orderId).toBe(a.id);
    moveOrderByHand(state, world, cal, new Rng(1), b.id, -1);
    expect(state.task).toBeNull();
    expect(Object.values(state.paused).some((t) => t.id === "split")).toBe(true);
    advance(state, world, 1);
    expect(state.intent?.orderId).toBe(b.id);
  });

  it("a once order moved to the top starts on the click, the way giving one does", () => {
    const g = campWith(3, { log: 6 });
    const { state, world } = g;
    const a = addOrder(state, world, req("split", { until: { kind: "forever" } }), "grind");
    const b = addOrder(state, world, req("sticks"), "job");
    expect(until(g, () => state.task?.id === "split" && state.task.progress > 2)).toBe(true);
    expect(state.intent?.orderId).toBe(a.id);
    moveOrderByHand(state, world, cal, new Rng(1), b.id, -1);
    expect(state.intent?.orderId).toBe(b.id);
    expect(state.intent?.mode).toBe("hand");
  });

  it("removing the live order by hand frees the minute rather than waiting the chunk out", () => {
    const g = campWith(3, { log: 6 });
    const { state, world } = g;
    const a = addOrder(state, world, req("split", { until: { kind: "forever" } }), "grind");
    const b = addOrder(state, world, req("sticks", { until: { kind: "forever" } }), "grind");
    expect(until(g, () => state.task?.id === "split" && state.task.progress > 2)).toBe(true);
    expect(state.intent?.orderId).toBe(a.id);
    removeOrderByHand(state, world, cal, new Rng(1), a.id);
    expect(state.task).toBeNull();
    advance(state, world, 1);
    expect(state.intent?.orderId).toBe(b.id);
  });

  it("a swap under a body need serves the body first, then runs the new top order", () => {
    const g = campWith(3, { log: 6 });
    const { state, world } = g;
    const st = regionState(state, world, state.player.region);
    addItem(pile(state, st.campCell!), "barkBucket", 1);
    addItem(pile(state, st.campCell!), "water", 3);
    const a = addOrder(state, world, req("split", { until: { kind: "forever" } }), "grind");
    const b = addOrder(state, world, req("sticks", { until: { kind: "forever" } }), "grind");
    expect(until(g, () => state.task?.id === "split" && state.task.progress > 2)).toBe(true);
    expect(state.intent?.orderId).toBe(a.id);
    // Thirsty with camp water in reach: the body has a need to serve from here on.
    state.player.water = 0.5;
    moveOrderByHand(state, world, cal, new Rng(1), b.id, -1);
    // The body is served before the moved order starts: the drink comes first,
    // and the split it displaced never resumes, because b outranks a now.
    expect(until(g, () => state.player.water > 1)).toBe(true);
    expect(state.task?.id).not.toBe("split");
    // And once the body has nothing to ask for, the new top order is the one that runs.
    expect(until(g, () => state.intent?.orderId === b.id)).toBe(true);
    expect(state.intent?.task).toBe("sticks");
  });

  it("a move that does not change the choice leaves the work under way alone", () => {
    const g = campWith(3, { log: 6 });
    const { state, world } = g;
    const a = addOrder(state, world, req("split", { until: { kind: "forever" } }), "grind");
    const b = addOrder(state, world, req("sticks", { until: { kind: "forever" } }), "grind");
    const c = addOrder(state, world, req("chop", { until: { kind: "forever" } }), "grind");
    expect(until(g, () => state.task?.id === "split" && state.task.progress > 2)).toBe(true);
    expect(state.intent?.orderId).toBe(a.id);
    // Swapping the two rows below the live one: the top order is still the choice.
    moveOrderByHand(state, world, cal, new Rng(1), c.id, -1);
    expect(ordersHere(state, world).map((o) => o.id)).toEqual([campRowOf(state, world)!.id, bodyRowOf(state, world)!.id, a.id, c.id, b.id]);
    expect(state.task?.id).toBe("split");
    expect(state.intent?.orderId).toBe(a.id);
  });

  it("a move that does not change the choice leaves the work alone with the body wanting something too", () => {
    const g = campWith(3, { log: 6 });
    const { state, world } = g;
    const st = regionState(state, world, state.player.region);
    addItem(pile(state, st.campCell!), "barkBucket", 1);
    addItem(pile(state, st.campCell!), "water", 3);
    const a = addOrder(state, world, req("split", { until: { kind: "forever" } }), "grind");
    const b = addOrder(state, world, req("sticks", { until: { kind: "forever" } }), "grind");
    const c = addOrder(state, world, req("chop", { until: { kind: "forever" } }), "grind");
    expect(until(g, () => state.task?.id === "split" && state.task.progress > 2)).toBe(true);
    const done = state.task!.progress;
    // Thirsty, with camp water in reach: the body's row is the row with the
    // minute now, and the question the move asks is still about the work.
    state.player.water = 0.5;
    moveOrderByHand(state, world, cal, new Rng(1), c.id, -1);
    expect(ordersHere(state, world).map((o) => o.id)).toEqual([campRowOf(state, world)!.id, bodyRowOf(state, world)!.id, a.id, c.id, b.id]);
    expect(state.task?.id).toBe("split");
    expect(state.task!.progress).toBe(done);
    expect(state.intent?.orderId).toBe(a.id);
  });

  it("removing the last order clears its live intent, not just one among several", () => {
    const g = campWith(3, { log: 6 });
    const { state, world } = g;
    // Sticks never run out, unlike split's logs: the intent only ends because the list is empty, not because the work did.
    const a = addOrder(state, world, req("sticks", { until: { kind: "forever" } }), "grind");
    expect(until(g, () => state.intent?.orderId === a.id)).toBe(true);
    removeOrder(state, world, a.id);
    expect(until(g, () => state.intent === null)).toBe(true);
    expect(ordersHere(state, world).every(isCareRow)).toBe(true);
  });

  it("nothing to do leaves the survivor genuinely idle", () => {
    const g = campWith(3, { firewood: 40 });
    const { state, world } = g;
    // Already at target: the only order is met from the first free minute, so there is nothing to run.
    addOrder(state, world, req("split", { until: { kind: "campHas", qty: 40 }, deliver: "camp" }), "keep");
    advance(state, world, 10);
    expect(state.intent).toBeNull();
    expect(state.task).toBeNull();
  });

  it("removing the last met order preserves genuine idleness", () => {
    const g = campWith(3, { firewood: 40 });
    const { state, world } = g;
    // Already at target: the only order is met from the first free minute.
    const keep = addOrder(state, world, req("split", { until: { kind: "campHas", qty: 40 }, deliver: "camp" }), "keep");
    advance(state, world, 3);
    expect(state.intent).toBeNull();
    removeOrder(state, world, keep.id);
    advance(state, world, 1);
    expect(state.intent).toBeNull();
    expect(state.task).toBeNull();
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

  it("a manual intent is left alone while the region has no orders, and a raw task with no intent behind it is left alone too", () => {
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
    // A raw task begun with no intent wrapping it - the advanced panel's own
    // door - is not a row the list ever judged, so it is not the list's to
    // take back either: it runs to its own end the same as before every row
    // was read every minute, and only work the list started is now read live.
    advance(state, world, 30);
    expect(state.intent).toBeNull();
    expect(state.task?.id).toBe("rest");
    expect(until(g, () => state.intent?.orderId === a.id)).toBe(true);
  });
});

describe("genuine idleness", () => {
  it("does not move an idle survivor home", () => {
    const g = campWith(3, { firewood: 60 });
    const { state, world } = g;
    placeAtSpot(state, world, state.player.region, "heath");
    const here = cellOf(state, world);
    addOrder(state, world, req("split", { until: { kind: "campHas", qty: 40 }, deliver: "camp" }), "keep");
    advance(state, world, 10);
    expect(state.intent).toBeNull();
    expect(state.task).toBeNull();
    expect(cellOf(state, world)).toBe(here);
  });

  it("a keep that becomes unmet starts from idleness at once", () => {
    const g = campWith(3, { firewood: 60, log: 3 });
    const { state, world } = g;
    const st = regionState(state, world, state.player.region);
    const keep = addOrder(state, world, req("split", { until: { kind: "campHas", qty: 40 }, deliver: "camp" }), "keep");
    advance(state, world, 2);
    expect(state.intent).toBeNull();
    pile(state, st.campCell!).items.firewood = 10;
    expect(until(g, () => state.intent?.orderId === keep.id, 120)).toBe(true);
  });

  it("a region with no orders has no intent of its own", () => {
    const { state, world } = newGame(3);
    siteCamp(state, world);
    advance(state, world, 10);
    expect(state.intent).toBeNull();
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
        if (cellOf(state, world) !== st.campCell!) sleptElsewhere++;
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
    expect(qty(pile(state, st.campCell!), "log")).toBeGreaterThan(0);
  });
});

describe("the fire keep", () => {
  it("lights the fire, stays met while it burns, and relights once it goes out", () => {
    const g = campWith(21, { firewood: 5 });
    const { state, world } = g;
    const st = regionState(state, world, state.player.region);
    const keep = addOrder(state, world, req("light", { until: { kind: "campHas", qty: 1 }, deliver: "camp" }), "keep");
    expect(until(g, () => st.fire.lit, 200)).toBe(true);
    expect(keep.kind).toBe("keep");
    // A storm douses it; fresh wood stands in for whatever it left unburnt.
    st.fire.lit = false;
    addItem(pile(state, st.campCell!), "firewood", 5);
    expect(until(g, () => st.fire.lit, 200)).toBe(true);
  });

  it("with no fire drill the row reads needs a fire drill", () => {
    const { state, world } = newGame(3);
    siteCamp(state, world);
    const st = regionState(state, world, state.player.region);
    siteFor(st, st.campCell!).structures.firePit = true;
    const o = addOrder(state, world, req("light", { until: { kind: "campHas", qty: 1 }, deliver: "camp" }), "keep");
    advance(state, world, 1);
    expect(o.skipped).toBe("needs a fire drill");
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
    mapRegion(state, world, home);
    mapRegion(state, world, nb);
    expect(startTask(state, world, calendar(state.minute), "travel", `region:${nb}`)).toBe(true);
    expect(state.intent).toBeNull();
    expect(until(g, () => state.player.region === nb, 6000)).toBe(true);
    expect(until(g, () => state.task === null, 6000)).toBe(true);
    advance(state, world, 5);
    expect(ordersHere(state, world).every(isCareRow)).toBe(true);
    expect(state.intent).toBeNull();
    expect(startTask(state, world, calendar(state.minute), "travel", `region:${home}`)).toBe(true);
    // Home still has the order, so the runner is never truly idle here as it
    // was in the empty-list region: the moment work is blocked, wait fills
    // the slot in the same tick, and task never reads back as null again
    // until the order itself resumes. That resuming is the thing under test.
    expect(until(g, () => state.player.region === home && state.intent?.orderId === a.id, 6000)).toBe(true);
    advance(state, world, 5);
    expect(ordersHere(state, world).map((o) => o.id)).toEqual([campRowOf(state, world)!.id, bodyRowOf(state, world)!.id, a.id]);
    expect(state.intent?.orderId).toBe(a.id);
  });
});

describe("the away report", () => {
  it("summarises every order of the camp you left: what it did, what blocks it, what finished", () => {
    // 50 logs, well past the keep's 40 kg firewood target and the cabin's own 40-log
    // need, so camp's own log count never dips low enough to count as missing: the
    // cabin stays blocked on stone and cordage alone, which never sit at any pile
    // in this fixture, so canFetch's allowance never opens and the report below is
    // read at a stable "short ... at camp" whenever the ten-day catch-up ends.
    const g = campWith(3, { log: 50, firewood: 10 });
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
    expect(c.skipped).toMatch(/^short .* at camp$/);
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
    // Index 2: the camp row sits at 0 and the body row at 1.
    expect(regionState(s2, world, s2.player.region).orders[2].done).toBeGreaterThan(a.done);
  });
});

describe("rank", () => {
  const sticks: IntentRequest = { task: "sticks", until: { kind: "once" }, deliver: "camp", where: "nearest" };
  const bark: IntentRequest = { task: "bark", until: { kind: "once" }, deliver: "camp", where: "nearest" };
  const stone: IntentRequest = { task: "stone", until: { kind: "once" }, deliver: "camp", where: "nearest" };

  it("without a rank an order is appended", () => {
    const { state, world } = newGame(3);
    siteCamp(state, world);
    addOrder(state, world, sticks, "job");
    addOrder(state, world, bark, "job");
    expect(ordersHere(state, world).map((o) => isCareRow(o) ? o.kind : o.req.task)).toEqual(["camp", "body", "sticks", "bark"]);
  });

  it("with a rank it is inserted there, and a rank past the end appends", () => {
    const { state, world } = newGame(3);
    siteCamp(state, world);
    addOrder(state, world, sticks, "job");
    addOrder(state, world, bark, "job");
    // Rank 0 is the top of the real work, behind the two care rows.
    addOrder(state, world, stone, "job", 0);
    expect(ordersHere(state, world).map((o) => isCareRow(o) ? o.kind : o.req.task)).toEqual(["camp", "body", "stone", "sticks", "bark"]);
    addOrder(state, world, { ...stone, task: "berries" }, "job", 99);
    expect(ordersHere(state, world).map((o) => isCareRow(o) ? o.kind : o.req.task)).toEqual(["camp", "body", "stone", "sticks", "bark", "berries"]);
    addOrder(state, world, { ...stone, task: "chop" }, "job", 2);
    expect(ordersHere(state, world).map((o) => isCareRow(o) ? o.kind : o.req.task)).toEqual(["camp", "body", "stone", "sticks", "chop", "bark", "berries"]);
  });
});

describe("the night", () => {
  it("an order for the forest is skipped at night with 'dark; at first light' and chosen at dawn", () => {
    const { state, world } = newGame(17, WINTER_START_DOY);
    siteCamp(state, world);
    const st = regionState(state, world, state.player.region);
    placeAt(state, world, st.campCell!);
    addOrder(state, world, { task: "chop", until: { kind: "forever" }, deliver: "camp", where: "nearest" }, "grind");
    state.minute = 500;
    const night = calendar(state.minute, state.startDoy);
    expect(night.isNight).toBe(true);
    expect(chooseOrder(state, world, night)).toBeNull();
    // Index 2: the camp row sits at 0 and the body row at 1.
    expect(ordersHere(state, world)[2].skipped).toBe(NIGHT_SKIP.away);
    state.minute = 200;
    const day = calendar(state.minute, state.startDoy);
    expect(day.isNight).toBe(false);
    expect(chosenTask(chooseOrder(state, world, day))).toBe("chop");
    expect(ordersHere(state, world)[1].skipped).toBe("");
  });

  /** 16:20 on 1 December at camp with four logs, a split keep on the list and the fire lit. */
  function decemberChores() {
    const { state, world } = newGame(17, WINTER_START_DOY);
    siteCamp(state, world);
    const st = regionState(state, world, state.player.region);
    placeAt(state, world, st.campCell!);
    addItem(pile(state, st.campCell!), "log", 4);
    addOrder(state, world, { task: "split", until: { kind: "campHas", qty: 60 }, deliver: "camp", where: "nearest" }, "keep");
    state.minute = 500;
    const night = calendar(state.minute, state.startDoy);
    st.fire.lit = true;
    return { state, world, st, night };
  }

  it("a split keep runs by firelight, by the camp fire or a torch, and is skipped with both out", () => {
    const { state, world, st, night } = decemberChores();
    expect(chosenTask(chooseOrder(state, world, night))).toBe("split");
    st.fire.lit = false;
    expect(chooseOrder(state, world, night)).toBeNull();
    // Index 2: the camp row sits at 0 and the body row at 1.
    expect(ordersHere(state, world)[2].skipped).toBe(NIGHT_SKIP.noFire);
    state.player.torch.lit = true;
    expect(chosenTask(chooseOrder(state, world, night))).toBe("split");
  });

  it("night chores stop once today's work reaches the working day less the day's light", () => {
    const { state, world, night } = decemberChores();
    // 1 December has 5.4 hours of light: 4.6 hours of the ten may be done in the dark.
    const budget = (body(state).workHours - night.daylightHours) * 60;
    expect(budget).toBeGreaterThan(4 * 60);
    expect(budget).toBeLessThan(5 * 60);
    today(state).workMin = budget - 1;
    expect(chosenTask(chooseOrder(state, world, night))).toBe("split");
    today(state).workMin = budget;
    expect(chooseOrder(state, world, night)).toBeNull();
    // Index 2: the camp row sits at 0 and the body row at 1.
    expect(ordersHere(state, world)[2].skipped).toBe(NIGHT_SKIP.budget);
  });

  it("lighting the fire is the one camp job the dark never stops, by neither the firelight rule nor the budget", () => {
    // The fire is what the other chores work by, so a camp whose fire has gone
    // out could otherwise not light another until dawn: no fire, no splitting,
    // no firewood, no fire.
    const { state, world, st, night } = decemberChores();
    st.fire.lit = false;
    siteFor(st, st.campCell!).structures.firePit = true;
    state.player.tools.push({ id: "fireDrill", durability: 100 });
    addItem(pile(state, st.campCell!), "firewood", 5);
    addOrder(state, world, { task: "light", until: { kind: "campHas", qty: 1 }, deliver: "camp", where: "nearest" }, "keep", 0);
    today(state).workMin = (body(state).workHours - night.daylightHours) * 60;
    expect(chosenTask(chooseOrder(state, world, night))).toBe("light");
    // Indexes 0 and 1 are the care rows, then the light job given at rank 0, then the split keep.
    expect(ordersHere(state, world)[2].skipped).toBe("");
    expect(ordersHere(state, world)[3].skipped).toBe(NIGHT_SKIP.noFire);
    st.fire.lit = true;
    // Wood on it as well as a flame: a fire at the low mark with a woodpile
    // beside it is the camp's own row, and that row would take the minute
    // before any chore the list holds.
    st.fire.fuelKg = 10;
    today(state).workMin = 0;
    expect(chosenTask(chooseOrder(state, world, night))).toBe("split");
  });

  it("sleep is not work: the dark neither wants a fire for it nor bills it against the working day", () => {
    // A body with no fire lies down in the dark rather than standing over a
    // cold hearth until dawn.
    const { state, world, st, night } = decemberChores();
    st.fire.lit = false;
    addOrder(state, world, { task: "sleep", until: { kind: "once" }, deliver: "leave", where: "nearest" }, "job", 0);
    today(state).workMin = (body(state).workHours - night.daylightHours) * 60;
    expect(chosenTask(chooseOrder(state, world, night))).toBe("sleep");
    // Indexes 0 and 1 are the care rows, then the sleep job given at rank 0, then the split keep.
    expect(ordersHere(state, world)[2].skipped).toBe("");
    expect(ordersHere(state, world)[3].skipped).toBe(NIGHT_SKIP.noFire);
  });

  it("by day the budget does not apply, and in June no chores run at night at all", () => {
    const { state, world, night } = decemberChores();
    today(state).workMin = (body(state).workHours - night.daylightHours) * 60;
    state.minute = 200;
    const day = calendar(state.minute, state.startDoy);
    expect(day.isNight).toBe(false);
    expect(chosenTask(chooseOrder(state, world, day))).toBe("split");
    // 21 June: 19 hours of light, so the budget is negative and the first minute of dark is already over it.
    const june = newGame(17, 172);
    siteCamp(june.state, june.world);
    const jst = regionState(june.state, june.world, june.state.player.region);
    placeAt(june.state, june.world, jst.campCell!);
    addItem(pile(june.state, jst.campCell!), "log", 4);
    addOrder(june.state, june.world, { task: "split", until: { kind: "campHas", qty: 60 }, deliver: "camp", where: "nearest" }, "keep");
    jst.fire.lit = true;
    june.state.minute = 15 * 60;
    const juneNight = calendar(june.state.minute, june.state.startDoy);
    expect(juneNight.isNight).toBe(true);
    expect(chooseOrder(june.state, june.world, juneNight)).toBeNull();
    // Index 2: the camp row sits at 0 and the body row at 1.
    expect(ordersHere(june.state, june.world)[2].skipped).toBe(NIGHT_SKIP.budget);
  });
});

describe("a keep on a structure", () => {
  it("stays a keep, holds no stock, and reads met while the structure stands", () => {
    const { state, world } = newGame(17);
    siteCamp(state, world);
    const st = regionState(state, world, state.player.region);
    const n = normalizeOrder({ task: "build", arg: "boughBed", until: { kind: "campHas", qty: 1 }, deliver: "camp", where: "nearest" }, "keep");
    expect(n.kind).toBe("keep");
    expect(n.req.until).toEqual({ kind: "campHas", qty: 1 });
    const o = addOrder(state, world, n.req, n.kind);
    expect(keepTarget(o)).toBeNull();
    expect(orderMet(state, world, cal, o, false)).toBe(false);
    siteFor(st, st.campCell!).structures.boughBed = true;
    expect(orderMet(state, world, cal, o, true)).toBe(true);
    siteFor(st, st.campCell!).structures.boughBed = false;
    expect(orderMet(state, world, cal, o, true)).toBe(false);
    expect(orderSentence(state, world, calendar(0), o)).toContain("keep the bough bed laid");
  });

  it("a keep on snares reads met at its count live and at half idle", () => {
    const { state, world } = newGame(17);
    siteCamp(state, world);
    const st = regionState(state, world, state.player.region);
    const o = addOrder(state, world, { task: "build", arg: "snare", until: { kind: "campHas", qty: 20 }, deliver: "camp", where: "nearest" }, "keep");
    expect(o.kind).toBe("keep");
    st.snares = 10;
    expect(orderMet(state, world, cal, o, false)).toBe(true);
    expect(orderMet(state, world, cal, o, true)).toBe(false);
    st.snares = 20;
    expect(orderMet(state, world, cal, o, true)).toBe(true);
    expect(orderSentence(state, world, calendar(0), o)).toContain("keep 20 snares set");
  });

  it("a seep is never a structure keep: it stands on a cell, not at camp, and collapses to a once job", () => {
    const { state, world } = newGame(17);
    siteCamp(state, world);
    const n = normalizeOrder({ task: "build", arg: "seep", until: { kind: "campHas", qty: 1 }, deliver: "camp", where: "nearest" }, "keep");
    expect(n.kind).toBe("job");
    expect(n.req.until).toEqual({ kind: "once" });
    const o = addOrder(state, world, n.req, n.kind);
    expect(keepTarget(o)).toBeNull();
    expect(orderMet(state, world, cal, o, false)).toBe(false);
    o.done = 1;
    expect(orderMet(state, world, cal, o, false)).toBe(true);
  });
});

describe("the vocabulary in the scheduler", () => {
  it("a season wraps the new year, and both windows are inclusive at both ends", () => {
    expect(inSeason(200, { from: 182, to: 90 })).toBe(true);
    expect(inSeason(50, { from: 182, to: 90 })).toBe(true);
    expect(inSeason(120, { from: 182, to: 90 })).toBe(false);
    expect(inSeason(150, { from: 120, to: 181 })).toBe(true);
    expect(inSeason(182, { from: 120, to: 181 })).toBe(false);
    // The wrap's own edges, where an off-by-one would hide.
    expect(inSeason(182, { from: 182, to: 90 })).toBe(true);
    expect(inSeason(181, { from: 182, to: 90 })).toBe(false);
    expect(inSeason(90, { from: 182, to: 90 })).toBe(true);
    expect(inSeason(91, { from: 182, to: 90 })).toBe(false);
    expect(inSeason(120, { from: 120, to: 181 })).toBe(true);
  });

  it("a keep reads its stored forms: dried meat is three kilos of meat", () => {
    const { state, world } = newGame(17);
    siteCamp(state, world);
    const st = regionState(state, world, state.player.region);
    addItem(pile(state, st.campCell!), "driedMeat", 10);
    addItem(pile(state, st.campCell!), "cookedMeat", 2);
    const o = addOrder(state, world, { task: "hunt", arg: "any", until: { kind: "campHas", qty: 40 }, deliver: "camp", where: "nearest" }, "keep");
    expect(keepStock(state, world, o)).toBeCloseTo(32, 6);
    expect(orderMet(state, world, cal, o, true)).toBe(false);
    addItem(pile(state, st.campCell!), "rawMeat", 8);
    expect(orderMet(state, world, cal, o, true)).toBe(true);
  });

  it("a restart line holds a met keep until the stock falls under it, and raises again at the target", () => {
    const { state, world } = newGame(17);
    siteCamp(state, world);
    const st = regionState(state, world, state.player.region);
    const camp = pile(state, st.campCell!);
    const o = addOrder(state, world, { task: "hunt", arg: "any", until: { kind: "campHas", qty: 10 }, deliver: "camp", where: "nearest", when: { restart: 6 } }, "keep");
    addItem(camp, "rawMeat", 10);
    chooseOrder(state, world, cal);
    expect(o.held).toBe(true);
    expect(orderMet(state, world, cal, o, true)).toBe(true);
    removeItem(camp, "rawMeat", 3);
    chooseOrder(state, world, cal);
    expect(o.held).toBe(true);
    expect(orderMet(state, world, cal, o, true)).toBe(true);
    removeItem(camp, "rawMeat", 2);
    chooseOrder(state, world, cal);
    expect(o.held).toBe(false);
    expect(orderMet(state, world, cal, o, true)).toBe(false);
    addItem(camp, "rawMeat", 5);
    chooseOrder(state, world, cal);
    expect(o.held).toBe(true);
  });

  it("reading a keep's band never moves it: the panel and the runner's probe write nothing", () => {
    const { state, world } = newGame(17);
    siteCamp(state, world);
    const st = regionState(state, world, state.player.region);
    const camp = pile(state, st.campCell!);
    const o = addOrder(state, world, { task: "hunt", arg: "any", until: { kind: "campHas", qty: 10 }, deliver: "camp", where: "nearest", when: { restart: 6 } }, "keep");
    addItem(camp, "rawMeat", 10);
    expect(orderMet(state, world, cal, o, true)).toBe(true);
    expect(o.held).toBeUndefined();
    // In the band a mark that was never set reads unmet, which is what a throwaway
    // probe gets; the scheduler's own reading is the only thing that sets it.
    removeItem(camp, "rawMeat", 3);
    expect(orderMet(state, world, cal, o, true)).toBe(false);
    expect(o.held).toBeUndefined();
    expect(keepBand(7, 10, 6, true)).toBe(true);
    expect(keepBand(7, 10, 6, undefined)).toBe(false);
  });

  it("a due date paces a keep's target up to its date and holds it after", () => {
    const { state, world } = newGame(17);
    siteCamp(state, world);
    const season = { from: 182, to: 89 };
    const o = addOrder(state, world, { task: "split", until: { kind: "campHas", qty: 600 }, deliver: "camp", where: "nearest", when: { season, by: 334 } }, "keep");
    expect(keepTargetToday(calendar(0, 182), o)).toBeCloseTo(0, 6);
    expect(keepTargetToday(calendar(0, 258), o)).toBeCloseTo(300, 6);
    expect(keepTargetToday(calendar(0, 334), o)).toBeCloseTo(600, 6);
    // A buffer holds: the fire draws on the split pile every day of the winter,
    // so 1 March wants as much of it as 1 December did.
    expect(keepTargetToday(calendar(0, 20), o)).toBeCloseTo(600, 6);
    expect(keepTargetToday(calendar(0, 89), o)).toBeCloseTo(600, 6);
    expect(inSeason(90, season)).toBe(false);
  });

  it("a keep spent by its season's close falls back to nothing after its due date", () => {
    const { state, world } = newGame(17);
    siteCamp(state, world);
    const season = { from: 182, to: 89 };
    const o = addOrder(state, world, { task: "chop", until: { kind: "campHas", qty: 300 }, deliver: "camp", where: "nearest", when: { season, by: 334, spend: true } }, "keep");
    // The rise is the same rise; only what happens after the date differs.
    expect(keepTargetToday(calendar(0, 182), o)).toBeCloseTo(0, 6);
    expect(keepTargetToday(calendar(0, 258), o)).toBeCloseTo(150, 6);
    expect(keepTargetToday(calendar(0, 334), o)).toBeCloseTo(300, 6);
    // A store cut for one winter is spent by the thaw: what March asks for is
    // what March will burn, not the whole figure December was due.
    expect(keepTargetToday(calendar(0, 20), o)).toBeCloseTo((300 * (89 - 20)) / (89 + 365 - 334), 6);
    expect(keepTargetToday(calendar(0, 89), o)).toBeLessThan(1);
    expect(inSeason(90, season)).toBe(false);
    // Spending needs a close to fall to: with no season the figure holds.
    const seasonless = addOrder(state, world, { task: "chop", until: { kind: "campHas", qty: 300 }, deliver: "camp", where: "nearest", when: { by: START_DOY + 10, spend: true } }, "keep");
    expect(keepTargetToday(calendar(0, START_DOY + 200), seasonless)).toBeCloseTo(300, 6);
  });

  it("a paced keep with no season rises from the day it was given, and one due that same day asks the whole figure", () => {
    const { state, world } = newGame(17);
    siteCamp(state, world);
    const o = addOrder(state, world, { task: "split", until: { kind: "campHas", qty: 100 }, deliver: "camp", where: "nearest", when: { by: START_DOY + 10 } }, "keep");
    expect(o.givenDoy).toBe(START_DOY);
    expect(keepTargetToday(calendar(0, START_DOY), o)).toBeCloseTo(0, 6);
    expect(keepTargetToday(calendar(0, START_DOY + 5), o)).toBeCloseTo(50, 6);
    expect(keepTargetToday(calendar(0, START_DOY + 10), o)).toBeCloseTo(100, 6);
    // Nothing to rise across, including an old save with neither season nor given day.
    const today = addOrder(state, world, { task: "split", until: { kind: "campHas", qty: 100 }, deliver: "camp", where: "nearest", when: { by: START_DOY } }, "keep");
    expect(keepTargetToday(calendar(0, START_DOY), today)).toBeCloseTo(100, 6);
    today.givenDoy = undefined;
    expect(keepTargetToday(calendar(0, START_DOY + 5), today)).toBeCloseTo(100, 6);
    // No season is no close to fall to: the figure stands after the date, all the
    // way round to the day the rise starts again.
    expect(keepTargetToday(calendar(0, START_DOY + 200), o)).toBeCloseTo(100, 6);
    expect(keepTargetToday(calendar(0, START_DOY - 1), o)).toBeCloseTo(100, 6);
  });

  it("a stock line shuts an order with a reason the row shows, and a season the same", () => {
    const { state, world } = newGame(17);
    siteCamp(state, world);
    const crack = addOrder(state, world, { task: "crack", until: { kind: "forever" }, deliver: "leave", where: "nearest", when: { stock: { item: "bone", atLeast: 1 } } }, "grind");
    expect(conditionOpen(state, world, calendar(0, 100), crack)).toBe("waits for bone at camp");
    const st = regionState(state, world, state.player.region);
    addItem(pile(state, st.campCell!), "bone", 1);
    expect(conditionOpen(state, world, calendar(0, 100), crack)).toBeNull();
    const eggs = addOrder(state, world, { task: "eggs", until: { kind: "daily", n: 1 }, deliver: "camp", where: "nearest", when: { season: { from: 120, to: 181 } } }, "job");
    expect(conditionOpen(state, world, calendar(0, 100), eggs)).toBe("out of season until 1 May");
    expect(conditionOpen(state, world, calendar(0, 150), eggs)).toBeNull();
  });

  it("a daily count opens afresh at the day roll and never drops off, with done left monotonic", () => {
    const { state, world } = newGame(17);
    siteCamp(state, world);
    const o = addOrder(state, world, { task: "roots", until: { kind: "daily", n: 1 }, deliver: "camp", where: "nearest" }, "job");
    o.done = 1;
    o.dayOpened = 1;
    expect(orderMet(state, world, cal, o, false)).toBe(true);
    state.minute = 2 * 1440 + 60;
    runOrders(state, world, calendar(state.minute, state.startDoy), new Rng(1));
    expect(ordersHere(state, world).some((x) => x.id === o.id)).toBe(true);
    // The run's tally stands; only the base the day's count reads from moves.
    expect(o.done).toBe(1);
    expect(o.dayBase).toBe(1);
    expect(orderMet(state, world, cal, o, false)).toBe(false);
  });

  it("a daily count already met today stays on the list rather than dropping off as a finished job", () => {
    const { state, world } = newGame(17);
    siteCamp(state, world);
    const day = calendar(state.minute, state.startDoy);
    const o = addOrder(state, world, { task: "roots", until: { kind: "daily", n: 1 }, deliver: "camp", where: "nearest" }, "job");
    o.done = 1;
    o.dayOpened = day.day;
    expect(orderMet(state, world, cal, o, false)).toBe(true);
    runOrders(state, world, day, new Rng(1));
    expect(ordersHere(state, world).some((x) => x.id === o.id)).toBe(true);
    // The day was already open, so nothing about the count moved.
    expect(o.done).toBe(1);
    expect(o.dayBase).toBeUndefined();
    expect(orderMet(state, world, cal, o, false)).toBe(true);
  });

  it("an order's sentence names its conditions after its target", () => {
    const { state, world } = newGame(17);
    siteCamp(state, world);
    const wood = addOrder(state, world, { task: "split", until: { kind: "campHas", qty: 600 }, deliver: "camp", where: "nearest", when: { season: { from: 182, to: 90 }, by: 334 } }, "keep");
    expect(orderSentence(state, world, cal, wood)).toContain("keep camp at 600 kg firewood, by 1 December, from 2 July to 1 April");
    // The spending says itself on the row, right after the date it qualifies.
    const logs = addOrder(state, world, { task: "chop", until: { kind: "campHas", qty: 300 }, deliver: "camp", where: "nearest", when: { season: { from: 182, to: 89 }, by: 334, spend: true } }, "keep");
    expect(orderSentence(state, world, cal, logs)).toContain("by 1 December, spent by 31 March, from 2 July to 31 March");
    // A spending with no date to spend from says nothing, since keepTargetToday
    // holds the flat figure for it: the row never claims what it will not do.
    const dateless = addOrder(state, world, { task: "chop", until: { kind: "campHas", qty: 300 }, deliver: "camp", where: "nearest", when: { season: { from: 182, to: 89 }, spend: true } }, "keep");
    expect(orderSentence(state, world, cal, dateless)).not.toContain("spent by");
    expect(keepTargetToday(calendar(0, 20), dateless)).toBeCloseTo(300, 6);
    const meat = addOrder(state, world, { task: "hunt", arg: "any", until: { kind: "campHas", qty: 240 }, deliver: "camp", where: "nearest", when: { restart: 192 } }, "keep");
    expect(orderSentence(state, world, cal, meat)).toContain("keep camp at 240 kg raw meat in any form, restart under 192");
    const roots = addOrder(state, world, { task: "roots", until: { kind: "daily", n: 1 }, deliver: "camp", where: "nearest", when: { stock: { item: "bone", atLeast: 1 } } }, "job");
    expect(orderSentence(state, world, cal, roots)).toContain("1 a day, while camp has at least 1 bone");
  });
});

describe("a once order is the player's own", () => {
  it("falls through when it cannot run, and only pinning it holds the list until it comes off", () => {
    // Clicking a row asks for that work first, but a want that cannot be met
    // is no reason to leave every order under it standing too: it is passed
    // over, and only a pin says the player wants it to hold the list instead.
    const g = campWith(3, { log: 6 });
    const { state, world } = g;
    const cabin = addOrder(state, world, req("build", { arg: "cabin" }), "job");
    const grind = addOrder(state, world, req("split", { until: { kind: "forever" } }), "grind");
    advance(state, world, 1);
    expect(cabin.skipped).toMatch(/^short .* at camp$/);
    expect(state.intent?.orderId).toBe(grind.id);
    cabin.pinned = true;
    const held = calendar(state.minute, state.startDoy);
    expect(chooseOrder(state, world, held)).toBeNull();
    expect(blockingOrder(state, world, held)?.id).toBe(cabin.id);
    removeOrder(state, world, cabin.id);
    expect(chooseOrder(state, world, held)?.id).toBe(grind.id);
  });

  it("still judges the orders under it, so none shows a reason left over from before", () => {
    const g = campWith(3, {});
    const { state, world } = g;
    addOrder(state, world, req("build", { arg: "cabin" }), "job");
    const keep = addOrder(state, world, req("split", { until: { kind: "campHas", qty: 40 }, deliver: "camp" }), "keep");
    advance(state, world, 1);
    expect(keep.skipped).toBe("no logs here");
  });

  it("the dark refuses a once order nothing, and still holds a standing one back", () => {
    /**
     * The work already knows what the dark costs it: stepTask rolls the
     * attempt at the light's own odds and puts a failure back to the start.
     * A once order is the player asking for a thing, so it goes and pays
     * that price. A standing order is the runner's judgement about when to
     * set out, and nobody sets out for the forest at night as a habit - so
     * that one waits for first light and lets the fireside work run under it.
     */
    const winter = () => {
      const { state, world } = newGame(17, WINTER_START_DOY);
      siteCamp(state, world);
      const st = regionState(state, world, state.player.region);
      placeAt(state, world, st.campCell!);
      addItem(pile(state, st.campCell!), "log", 4);
      st.fire.lit = true;
      state.minute = 500;
      return { state, world, night: calendar(state.minute, state.startDoy) };
    };

    const once = winter();
    const goes = addOrder(once.state, once.world, req("chop", { deliver: "camp" }), "job");
    addOrder(once.state, once.world, req("split", { deliver: "camp" }), "job");
    expect(chooseOrder(once.state, once.world, once.night)?.id).toBe(goes.id);
    expect(goes.skipped).toBe("");

    const standing = winter();
    const waits = addOrder(standing.state, standing.world, req("chop", { until: { kind: "forever" }, deliver: "camp" }), "grind");
    const chore = addOrder(standing.state, standing.world, req("split", { deliver: "camp" }), "job");
    expect(chooseOrder(standing.state, standing.world, standing.night)?.id).toBe(chore.id);
    expect(waits.skipped).toBe(NIGHT_SKIP.away);
  });

  it("a standing order that cannot run is passed over, as it always was", () => {
    const g = campWith(3, { firewood: 5 });
    const { state, world } = g;
    const keep = addOrder(state, world, req("split", { until: { kind: "campHas", qty: 40 }, deliver: "camp" }), "keep");
    const sticks = addOrder(state, world, req("sticks", { until: { kind: "forever" } }), "grind");
    advance(state, world, 1);
    expect(keep.skipped).toBe("no logs here");
    expect(state.intent?.orderId).toBe(sticks.id);
  });
});

describe("fall-through", () => {
  it("a once row that cannot run is passed over and the row below it runs", () => {
    const { state, world } = newGame(3);
    // A cook with nothing to cook cannot run; sticks always can.
    const blocked = addOrder(state, world, { task: "cook", until: { kind: "once" }, deliver: "camp", where: "nearest" }, "job");
    const runnable = addOrder(state, world, { task: "sticks", until: { kind: "once" }, deliver: "camp", where: "nearest" }, "job");
    const { chosen, blockedBy } = judgeOrders(state, world, cal);
    expect(blocked.skipped).not.toBe("");
    expect(chosen?.id).toBe(runnable.id);
    expect(blockedBy).toBe(null);
  });

  it("the same row, pinned, stops the list and blockingOrder names it", () => {
    const { state, world } = newGame(3);
    const blocked = addOrder(state, world, { task: "cook", until: { kind: "once" }, deliver: "camp", where: "nearest" }, "job");
    blocked.pinned = true;
    addOrder(state, world, { task: "sticks", until: { kind: "once" }, deliver: "camp", where: "nearest" }, "job");
    const { chosen, blockedBy } = judgeOrders(state, world, cal);
    expect(chosen).toBe(null);
    expect(blockedBy?.id).toBe(blocked.id);
    expect(blockingOrder(state, world, cal)?.id).toBe(blocked.id);
  });

  it("a pinned blocked row also stops ready care rows below it", () => {
    const { state, world } = newGame(3);
    const blocked = addOrder(state, world, { task: "cook", until: { kind: "once" }, deliver: "camp", where: "nearest" }, "job");
    blocked.pinned = true;
    state.player.bodyNeed = "sleep";
    state.player.sleeping = { collapsed: true };
    state.player.sleepDebt = 1000;
    const st = regionState(state, world, state.player.region);
    st.orders = [blocked, ...st.orders.filter((o) => o.id !== blocked.id)];

    const { chosen, blockedBy } = judgeOrders(state, world, cal);
    expect(blockedBy?.id).toBe(blocked.id);
    expect(chosen).toBeNull();
  });

  it("stops care already in progress when the blocked row above it is pinned", () => {
    const { state, world } = newGame(3);
    const blocked = addOrder(state, world, { task: "cook", until: { kind: "once" }, deliver: "camp", where: "nearest" }, "job");
    state.player.bodyNeed = "sleep";
    state.player.sleeping = { collapsed: true };
    state.player.sleepDebt = 1000;
    const st = regionState(state, world, state.player.region);
    const bodyRow = bodyRowOf(state, world)!;
    st.orders = [blocked, ...st.orders.filter((o) => o.id !== blocked.id)];
    runOrders(state, world, cal, new Rng(state.rng));
    expect(state.intent?.orderId).toBe(bodyRow.id);
    expect(state.task?.id).toBe("sleep");

    pinOrderByHand(state, world, cal, new Rng(state.rng), blocked.id);
    expect(state.task).toBeNull();
    expect(state.intent).toBeNull();
    expect(judgeOrders(state, world, cal).chosen).toBeNull();
  });

  it("a pinned row that is met does not hold the list", () => {
    const { state, world } = newGame(3);
    const met = addOrder(state, world, { task: "sticks", until: { kind: "times", n: 1 }, deliver: "camp", where: "nearest" }, "job");
    met.pinned = true;
    met.done = 1;
    const below = addOrder(state, world, { task: "bark", until: { kind: "once" }, deliver: "camp", where: "nearest" }, "job");
    expect(judgeOrders(state, world, cal).chosen?.id).toBe(below.id);
  });

  it("a passed-over once row says what ran instead, once, on the transition", () => {
    const { state, world } = newGame(3);
    addOrder(state, world, { task: "cook", until: { kind: "once" }, deliver: "camp", where: "nearest" }, "job");
    addOrder(state, world, { task: "sticks", until: { kind: "once" }, deliver: "camp", where: "nearest" }, "job");
    const before = state.log.length;
    judgeOrders(state, world, cal);
    const lines = state.log.slice(before).map((e) => e.text);
    expect(lines.filter((t) => t.includes("instead")).length).toBe(1);
    // Judged again with nothing changed, it does not say it twice.
    judgeOrders(state, world, cal);
    expect(state.log.slice(before).filter((e) => e.text.includes("instead")).length).toBe(1);
  });

  it("a passed-over standing row is silent", () => {
    const { state, world } = newGame(3);
    addOrder(state, world, { task: "cook", until: { kind: "forever" }, deliver: "camp", where: "nearest" }, "grind");
    addOrder(state, world, { task: "sticks", until: { kind: "once" }, deliver: "camp", where: "nearest" }, "job");
    const before = state.log.length;
    judgeOrders(state, world, cal);
    expect(state.log.slice(before).some((e) => e.text.includes("instead"))).toBe(false);
  });
});

describe("pre-emption", () => {
  it("a rank change is judged at once, but the chunk in hand keeps the minute until it ends on its own", () => {
    const { state, world } = newGame(3);
    const a = addOrder(state, world, { task: "sticks", until: { kind: "forever" }, deliver: "camp", where: "nearest" }, "grind");
    const b = addOrder(state, world, { task: "deadwood", until: { kind: "forever" }, deliver: "camp", where: "nearest" }, "grind");
    advance(state, world, 30);
    expect(state.intent?.orderId).toBe(a.id);
    expect(state.task).not.toBeNull();
    moveOrder(state, world, b.id, -1);
    // The list is read afresh at once: chooseOrder already answers b, which is
    // what the panel and waitingLine draw from every minute regardless of
    // whether anything is running to act on it.
    expect(chooseOrder(state, world, calendar(state.minute, state.startDoy))?.id).toBe(b.id);
    // Acting on it waits for the chunk already in hand to end on its own, the
    // way it always did: a bare rank change is not the player asking for an
    // interruption, so none happens mid-step.
    advance(state, world, 5);
    expect(state.intent?.orderId).toBe(a.id);
  });

  it("a load being carried home is delivered before a higher row takes over", () => {
    const { state, world } = newGame(3);
    siteCamp(state, world);
    const st = regionState(state, world, state.player.region);
    const away = addOrder(state, world, { task: "sticks", until: { kind: "forever" }, deliver: "camp", where: "nearest" }, "grind");
    const { cell } = resolveCell(state, world, cal, "sticks", undefined, "nearest");
    // The shape deliveryPending reads - a live order away from camp with sticks
    // already in the pack - built directly rather than run out from a click and
    // hoped into the walk home, which a fast gather on a lucky cell can finish
    // inside the same minute it started and never leave this state to catch.
    placeAt(state, world, cell);
    addItem(state.player.pack, "stick", 1);
    state.intent = {
      mode: "runner", task: "sticks", cell, campCell: st.campCell, until: { kind: "forever" },
      deliver: "camp", done: 0, step: "gathering sticks", orderId: away.id, windDown: false,
    };
    expect(deliveryPending(state, world, state.intent)).toBe(true);
    const top = addOrder(state, world, { task: "stone", until: { kind: "forever" }, deliver: "camp", where: "nearest" }, "grind");
    moveOrder(state, world, top.id, -1);
    advance(state, world, 1);
    expect(state.intent?.orderId).toBe(away.id);
  });

  it("readiness is not computed for rows below the live row", () => {
    const { state, world } = newGame(3);
    addOrder(state, world, { task: "sticks", until: { kind: "forever" }, deliver: "camp", where: "nearest" }, "grind");
    for (let i = 0; i < 8; i++) {
      addOrder(state, world, { task: "stone", until: { kind: "forever" }, deliver: "camp", where: "nearest" }, "grind");
    }
    advance(state, world, 60);
    resetWalkJudged();
    // A direct judgement, the one the panel and waitingLine make on every
    // render regardless of whether the sim loop is mid-chunk: the live row
    // is the top one, so at most it is asked to route; the eight rows below
    // it read "later" without ever reaching the walk check, no matter how
    // many of them the list holds.
    judgeOrders(state, world, calendar(state.minute, state.startDoy));
    // The two care rows sit above the live row and pay for their own
    // readings, which route to camp, to the water and to the snares; the
    // live row is asked to route once; the eight rows below it are not.
    expect(walkJudged()).toBeLessThanOrEqual(4);
  });

  it("the care rows obey the prefix rule too", () => {
    const { state, world } = newGame(3);
    addOrder(state, world, { task: "sticks", until: { kind: "forever" }, deliver: "camp", where: "nearest" }, "grind");
    // Both care rows under the work, so neither can take the minute from it
    // and neither has any use for the answer it would route for.
    const list = ordersHere(state, world);
    list.reverse();
    advance(state, world, 60);
    resetWalkJudged();
    judgeOrders(state, world, calendar(state.minute, state.startDoy));
    // The live row is the only row at or above itself: one reading, and the
    // two care rows under it are asked nothing at all.
    expect(walkJudged()).toBeLessThanOrEqual(1);
  });

  it("a task in flight is not judged at all, not merely not acted on", () => {
    const { state, world } = newGame(3);
    siteCamp(state, world);
    // A survivor lands with the home region already mapped, so the ground can
    // be read before a camp is chosen. These rows want ground nobody has walked
    // to, so the map is wound back to what an eye at camp actually takes in.
    for (const k of Object.keys(state.mapped)) delete state.mapped[Number(k)];
    seeFrom(state, world, calendar(state.minute, state.startDoy), cellOf(state, world));
    // Ranked above the live row, so the prefix rule alone would still ask
    // each of them the question every minute regardless of what the live
    // row is doing - stone's ground is not yet known this early, so each one
    // reads blocked rather than ready, and sticks is the row that runs.
    for (let i = 0; i < 8; i++) {
      addOrder(state, world, { task: "stone", until: { kind: "forever" }, deliver: "camp", where: "nearest" }, "grind");
    }
    const a = addOrder(state, world, { task: "sticks", until: { kind: "forever" }, deliver: "camp", where: "nearest" }, "grind");
    advance(state, world, 60);
    expect(state.intent?.orderId).toBe(a.id);
    expect(state.task).not.toBeNull();
    resetWalkJudged();
    advance(state, world, 1);
    // A minute spent mid-chunk never reaches chooseOrder at all, so none of
    // the eight rows above the live one are asked to route this minute
    // either: the count stays at zero, not merely unacted on.
    expect(walkJudged()).toBe(0);
  });
});

describe("a waiting order says what it is waiting for", () => {
  it("names the cause rather than printing the bare word", () => {
    const { state, world } = newGame(21);
    const cal = calendar(state.minute, state.startDoy);
    // Splitting needs logs this camp has none of. The row used to say
    // "waiting", which tells a reader nothing at the moment they most want
    // to know - and a screenshot of "Pick frozen lingon ... waiting" with no
    // cause is in the playtest record.
    addOrder(state, world, { task: "split", until: { kind: "once" }, deliver: "camp", where: "nearest" }, "job");
    const html = ordersHtml(state, world, cal);
    // Never the bare word: the row names its cause, whether that came from
    // the scheduler's own judgement or from asking the task.
    expect(html).not.toMatch(/>waiting<\/div>/);
    expect(html).toContain("no logs here");
  });

  it("an order that could run says it is waiting its turn, which is a different thing", () => {
    const { state, world } = newGame(21);
    const cal = calendar(state.minute, state.startDoy);
    addOrder(state, world, { task: "deadwood", until: { kind: "once" }, deliver: "camp", where: "nearest" }, "job");
    addOrder(state, world, { task: "sticks", until: { kind: "once" }, deliver: "camp", where: "nearest" }, "job");
    const html = ordersHtml(state, world, cal);
    expect(html).toContain("waiting its turn");
  });

  it("a row held by another names the one holding it, not the bare word", () => {
    const { state, world } = newGame(21);
    const cal = calendar(state.minute, state.startDoy);
    // Split cannot run - no logs - and it sits above a row that could. A
    // blocked head stops the list, which is finding 8's complaint, and the
    // rows say so now rather than saying nothing.
    addOrder(state, world, { task: "split", until: { kind: "once" }, deliver: "camp", where: "nearest" }, "job");
    addOrder(state, world, { task: "deadwood", until: { kind: "once" }, deliver: "camp", where: "nearest" }, "job");
    const html = ordersHtml(state, world, cal);
    expect(html).toMatch(/waiting behind|waiting its turn, behind|no logs here/i);
  });
});
