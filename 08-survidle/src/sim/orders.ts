/**
 * Standing orders: a ranked list per camp of keeps ("keep camp at 40 kg
 * firewood"), grinds ("fell trees forever") and jobs ("build a cabin"). The
 * scheduler below decides which order the live intent serves; the intent
 * runner does everything else, exactly as when the player clicks an intent
 * by hand.
 */
import type { World } from "../world/gen";
import { itemLabel } from "./actions";
import type { Calendar } from "./calendar";
import { pile, qty } from "./inventory";
import { resolveCell, yieldItem } from "./intent";
import { SPOT_WORDS } from "./position";
import { regionState } from "./regionstate";
import { check } from "./tasks";
import type { GameState, IntentRequest, ItemId, Order, OrderKind, StructureId, TaskId } from "./types";

/** The list of the region under foot. */
export function ordersHere(state: GameState, world: World): Order[] {
  return regionState(state, world, state.player.region).orders;
}

export function orderById(state: GameState, world: World, id: number): Order | undefined {
  return ordersHere(state, world).find((o) => o.id === id);
}

/** Appends. A keep or a camp-has without a countable yield is a once job; a grind is always forever. */
export function addOrder(state: GameState, world: World, req: IntentRequest, kind: OrderKind): Order {
  const st = regionState(state, world, state.player.region);
  let k = kind;
  let r = req;
  if ((kind === "keep" || req.until.kind === "campHas") && !yieldItem(req.task, req.arg)) {
    k = "job";
    r = { ...req, until: { kind: "once" } };
  }
  if (kind === "grind") r = { ...req, until: { kind: "forever" } };
  const o: Order = { id: st.nextOrderId++, kind: k, req: r, done: 0, minutes: 0, skipped: "" };
  st.orders.push(o);
  return o;
}

export function removeOrder(state: GameState, world: World, id: number): void {
  const st = regionState(state, world, state.player.region);
  st.orders = st.orders.filter((o) => o.id !== id);
}

/** Moves one rank up (-1) or down (1); a move off either end does nothing. */
export function moveOrder(state: GameState, world: World, id: number, dir: -1 | 1): void {
  const list = ordersHere(state, world);
  const i = list.findIndex((o) => o.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= list.length) return;
  [list[i], list[j]] = [list[j], list[i]];
}

/** The stock a keep holds and its target, or null for any other order. */
export function keepTarget(o: Order): { item: ItemId; qty: number } | null {
  if (o.kind !== "keep" || o.req.until.kind !== "campHas") return null;
  return { item: yieldItem(o.req.task, o.req.arg)!, qty: o.req.until.qty };
}

/**
 * Whether the order asks for nothing right now. A keep is unmet under half
 * its target when idle and until the target once it is the live order, so
 * one low fire does not send the runner home to split a single log. Only
 * the camp pile counts: a keep is a promise about camp.
 */
export function orderMet(state: GameState, world: World, o: Order, live: boolean): boolean {
  const st = regionState(state, world, state.player.region);
  const camp = pile(state, st.campCell);
  const keep = keepTarget(o);
  if (keep) {
    const have = qty(camp, keep.item);
    return live ? have >= keep.qty - 1e-9 : have >= keep.qty / 2 - 1e-9;
  }
  if (o.kind === "grind") return false;
  if (o.req.task === "build" && o.req.arg !== "snare") {
    return st.structures[o.req.arg as Exclude<StructureId, "snare">] === true;
  }
  const u = o.req.until;
  switch (u.kind) {
    case "once": return o.done >= 1;
    case "times": return o.done >= u.n;
    case "campHas": return qty(camp, yieldItem(o.req.task, o.req.arg)!) >= u.qty - 1e-9;
    case "forever": return false;
  }
}

/** "Split a log, keep camp at 40 kg firewood"; "Fell a tree, forever, bringing it to camp". */
export function orderSentence(state: GameState, world: World, cal: Calendar, o: Order): string {
  const { cell } = resolveCell(state, world, o.req.task, o.req.arg, o.req.where);
  const parts = [check(state, world, cal, o.req.task, o.req.arg, cell).label];
  const keep = keepTarget(o);
  const u = o.req.until;
  if (keep) parts.push(`keep camp at ${itemLabel(keep.item, keep.qty)}`);
  else if (u.kind === "times") parts.push(`${o.done} of ${u.n} done`);
  else if (u.kind === "campHas") parts.push(`until camp has ${itemLabel(yieldItem(o.req.task, o.req.arg)!, u.qty)}`);
  else if (u.kind === "forever") parts.push("forever");
  if (!keep && u.kind !== "campHas" && o.req.deliver === "camp" && o.req.task !== "haul") parts.push("bringing it to camp");
  if (typeof o.req.where === "string" && o.req.where !== "nearest") parts.push(`at ${SPOT_WORDS[o.req.where]}`);
  return parts.join(", ");
}

const COUNT_WORDS: Partial<Record<TaskId, [string, string]>> = {
  chop: ["tree", "trees"],
  split: ["log", "logs"],
  sticks: ["bundle", "bundles"],
  bark: ["strip", "strips"],
  stone: ["trip", "trips"],
  berries: ["picking", "pickings"],
  hunt: ["hunt", "hunts"],
  fish: ["cast", "casts"],
  cook: ["meal", "meals"],
  craft: ["piece", "pieces"],
};

/** The word a completion count of this work takes: "14 trees", "1 log", "3 times". */
export function countWord(task: TaskId, n: number): string {
  const w = COUNT_WORDS[task];
  if (!w) return "times";
  return n === 1 ? w[0] : w[1];
}
