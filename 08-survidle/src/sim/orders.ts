/**
 * Standing orders: a ranked list per camp of keeps ("keep camp at 40 kg
 * firewood"), grinds ("fell trees forever") and jobs ("build a cabin"). The
 * scheduler below decides which order the live intent serves; the intent
 * runner does everything else, exactly as when the player clicks an intent
 * by hand.
 */
import type { Rng } from "../rng";
import type { World } from "../world/gen";
import { itemLabel } from "./actions";
import { KIT_ITEMS } from "./body";
import { body } from "./person";
import { type Calendar, calendar, fmtDoy } from "./calendar";
import { pile, qty } from "./inventory";
import { deliveryPending, intentOption, resolveCell, startIntent, yieldItem } from "./intent";
import { BARK_DRY_RATIO, ITEM_NAMES, MEAT_DRY_RATIO, STRUCTURES } from "./items";
import { normalizeOrder, structureKeep } from "./ladder";
import { today } from "./ledger";
import { log } from "./log";
import { cellOf, SPOT_WORDS } from "./position";
import { regionState } from "./regionstate";
import { check } from "./tasks";
import type { GameState, IntentRequest, ItemId, Order, OrderKind, StructureId, TaskId } from "./types";
import { campWaterCapacity } from "./water";

/** The list of the region under foot. */
export function ordersHere(state: GameState, world: World): Order[] {
  return regionState(state, world, state.player.region).orders;
}

/**
 * Appends, or inserts at `rank` when one is given. The kind and the until
 * are the normalised ones (see normalizeOrder in ladder.ts). This is the
 * raw mutator: the Do panel and the player script go through giveOrder,
 * which reads the ladder's gate first.
 */
export function addOrder(state: GameState, world: World, req: IntentRequest, kind: OrderKind, rank?: number): Order {
  const st = regionState(state, world, state.player.region);
  const n = normalizeOrder(req, kind);
  // The day it was given is the rise's start for a paced keep that names no season.
  const o: Order = { id: st.nextOrderId++, kind: n.kind, req: n.req, done: 0, minutes: 0, skipped: "", givenDoy: calendar(state.minute, state.startDoy).dayOfYear };
  st.orders.splice(rank === undefined ? st.orders.length : Math.min(rank, st.orders.length), 0, o);
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

/** The stock a keep holds and its target, or null for any other order - including "keep it lit" and a keep on a structure, which hold no stock at all. */
export function keepTarget(o: Order): { item: ItemId; qty: number } | null {
  if (o.kind !== "keep" || o.req.until.kind !== "campHas" || o.req.task === "light" || o.req.task === "lightIndoors" || structureKeep(o.req, o.kind)) return null;
  return { item: yieldItem(o.req.task, o.req.arg)!, qty: o.req.until.qty };
}

/**
 * The forms a keep's yield is held in at camp, and what a kilo of each is
 * worth in the keep's own unit. A keep counting the raw item alone can
 * never read met while the cook, the rack and the body take that item the
 * same day, and spends the whole day at the work with the pile it asked
 * for sitting beside it under another name: a strip of inner bark dries
 * into flour's raw material within the hour a lit fire is going, faster
 * than a beginner strips more of it, and a hunt keep whose meat is all on
 * the rack reads nothing at all. The ratio is what a kilo of the form
 * came from, so dried meat is three kilos of the meat it dried from and a
 * cooked fish is one of the raw.
 */
export const KEEP_FORMS: Partial<Record<TaskId, { item: ItemId; ratio: number }[]>> = {
  hunt: [{ item: "cookedMeat", ratio: 1 }, { item: "driedMeat", ratio: MEAT_DRY_RATIO }],
  fish: [{ item: "cookedFish", ratio: 1 }, { item: "oilyFish", ratio: 1 }, { item: "cookedOilyFish", ratio: 1 }],
  roots: [{ item: "cookedRoots", ratio: 1 }],
  innerBark: [{ item: "driedBark", ratio: BARK_DRY_RATIO }, { item: "barkFlour", ratio: BARK_DRY_RATIO }],
};

/** A day-of-year window, inclusive; from past to wraps the new year. */
export function inSeason(doy: number, season: { from: number; to: number }): boolean {
  return season.from <= season.to ? doy >= season.from && doy <= season.to : doy >= season.from || doy <= season.to;
}

/**
 * The stock a keep holds in its own unit: the yield item, its stored forms
 * at their ratios, and, for a kit item (arrow, snare), the pack too - a
 * live order can only be carrying it because that pile is where camp's own
 * kit is while it is in use, so a keep that carries its own stock out must
 * not read itself as unmet the moment it does.
 */
export function keepStock(state: GameState, world: World, o: Order): number {
  const st = regionState(state, world, state.player.region);
  const camp = pile(state, st.campCell);
  const keep = keepTarget(o);
  if (!keep) return 0;
  let have = qty(camp, keep.item) + (KIT_ITEMS.has(keep.item) ? qty(state.player.pack, keep.item) : 0);
  // A form that is the keep's own yield item is already in the sum. No row names
  // one today, and skipping it is what keeps that true whatever a row grows into.
  for (const f of KEEP_FORMS[o.req.task] ?? []) if (f.item !== keep.item) have += qty(camp, f.item) * f.ratio;
  return have;
}

/**
 * A keep's target today. Without a due date it is the whole figure. With
 * one the figure is due in full on that day and the target rises to it
 * evenly from the season's start, or from the day the order was given
 * when it carries no season, so a winter pile is built across the autumn
 * rather than in the week the order is first read. On and after the due
 * date, and for the rest of the wrap back round to the start, the target
 * is the whole figure. The rise starts at nothing, so a paced keep asks
 * for nothing on the first day of its season and the rows under it have
 * that day to themselves.
 */
export function keepTargetToday(cal: Calendar, o: Order): number {
  const keep = keepTarget(o);
  if (!keep) return 0;
  const by = o.req.when?.by;
  if (by === undefined) return keep.qty;
  const from = o.req.when?.season?.from ?? o.givenDoy ?? by;
  const span = (((by - from) % 365) + 365) % 365;
  if (span === 0) return keep.qty;
  const gone = (((cal.dayOfYear - from) % 365) + 365) % 365;
  return keep.qty * Math.min(1, gone / span);
}

/**
 * Why an order's conditions shut it this morning, or null while they hold.
 * The reason is the row's, so it names the season's opening day or the
 * item the order waits on rather than saying only that something is shut.
 */
export function conditionOpen(state: GameState, world: World, cal: Calendar, o: Order): string | null {
  const w = o.req.when;
  if (!w) return null;
  if (w.season && !inSeason(cal.dayOfYear, w.season)) return `out of season until ${fmtDoy(w.season.from)}`;
  if (w.stock) {
    const st = regionState(state, world, state.player.region);
    const have = qty(pile(state, st.campCell), w.stock.item);
    // The tolerance on the line is a hair either side of the figure itself rather than a
    // hair above nothing, or a line drawn at a trace - "any raw meat at all", which is what
    // a drying rack waits for - would be a line the float guard swallows and never shuts.
    if (w.stock.atLeast !== undefined && have < w.stock.atLeast * (1 - 1e-9)) return `waits for ${ITEM_NAMES[w.stock.item]} at camp`;
    if (w.stock.under !== undefined && have >= w.stock.under - 1e-9) return `camp holds ${itemLabel(w.stock.item, w.stock.under)} already`;
  }
  return null;
}

/**
 * A restart line reads as a band rather than a line: the keep is met from
 * the stock reaching the target until it falls under the restart figure,
 * so a keep standing at its target does not turn back on for the first
 * kilo eaten off it. Between the two the last reading stands, which is the
 * one piece of an order's reading that is memory rather than arithmetic:
 * this returns what the mark becomes and writes nothing, so only the
 * scheduler, which owns the list, moves it.
 */
export function keepBand(have: number, target: number, restart: number, held: boolean | undefined): boolean {
  if (have >= target - 1e-9) return true;
  if (have < restart - 1e-9) return false;
  return held === true;
}

/**
 * Whether the order asks for nothing right now, and nothing else: the Do
 * panel draws with it and the reference runner asks it of a throwaway
 * probe, so it reads the world and the order and writes neither. A keep is
 * unmet under half today's target when idle and until the target once it
 * is the live order, so one low fire does not send the runner home to
 * split a single log. The camp pile counts: a keep is a promise about
 * camp. A keep with a restart line reads its band instead, off the mark
 * the scheduler last left on the order.
 */
export function orderMet(state: GameState, world: World, cal: Calendar, o: Order, live: boolean): boolean {
  const st = regionState(state, world, state.player.region);
  const keep = keepTarget(o);
  if (keep) {
    const have = keepStock(state, world, o);
    const target = keepTargetToday(cal, o);
    const restart = o.req.when?.restart;
    if (restart !== undefined) return keepBand(have, target, restart, o.held);
    return live ? have >= target - 1e-9 : have >= target / 2 - 1e-9;
  }
  if (structureKeep(o.req, o.kind)) {
    if (o.req.arg === "snare") {
      const want = o.req.until.kind === "campHas" ? o.req.until.qty : 1;
      return live ? st.structures.snares >= want : st.structures.snares >= want / 2;
    }
    return st.structures[o.req.arg as Exclude<StructureId, "snare" | "seep">] === true;
  }
  if (o.kind === "grind") return false;
  // A seep stands on a cell, not at the camp: its dig is a job done once.
  if (o.req.task === "build" && o.req.arg === "seep") return o.done >= 1;
  if (o.req.task === "build" && o.req.arg !== "snare") {
    return st.structures[o.req.arg as Exclude<StructureId, "snare" | "seep">] === true;
  }
  if (o.req.task === "light" || o.req.task === "lightIndoors") return st.fire.lit;
  const u = o.req.until;
  switch (u.kind) {
    case "once": return o.done >= 1;
    case "times": return o.done >= u.n;
    case "campHas": return qty(pile(state, st.campCell), yieldItem(o.req.task, o.req.arg)!) >= u.qty - 1e-9;
    case "forever": return false;
    case "daily": return o.done - (o.dayBase ?? 0) >= u.n;
  }
}

/** "Split a log, keep camp at 40 kg firewood"; "Fell a tree, forever, bringing it to camp". */
export function orderSentence(state: GameState, world: World, cal: Calendar, o: Order): string {
  const { cell } = resolveCell(state, world, cal, o.req.task, o.req.arg, o.req.where);
  const parts = [check(state, world, cal, o.req.task, o.req.arg, cell).label];
  const keep = keepTarget(o);
  const u = o.req.until;
  // A keep whose stock reads a KEEP_FORMS row says so, or the row would claim to
  // watch the raw item alone while it reads met on the cooked and dried kinds too.
  if (keep) parts.push(`keep camp at ${itemLabel(keep.item, keep.qty)}${KEEP_FORMS[o.req.task] ? " in any form" : ""}`);
  else if (o.kind === "keep" && (o.req.task === "light" || o.req.task === "lightIndoors")) parts.push("keep it lit");
  else if (structureKeep(o.req, o.kind)) parts.push(o.req.arg === "snare" ? `keep ${u.kind === "campHas" ? u.qty : 1} snares set` : `keep the ${STRUCTURES[o.req.arg as StructureId].name} laid`);
  else if (u.kind === "times") parts.push(`${o.done} of ${u.n} done`);
  else if (u.kind === "campHas") parts.push(`until camp has ${itemLabel(yieldItem(o.req.task, o.req.arg)!, u.qty)}`);
  else if (u.kind === "forever") parts.push("forever");
  else if (u.kind === "daily") parts.push(`${u.n} a day`);
  // The conditions read after the target, in the order they bite: what the target
  // is due by, the line it restarts at, the window it runs in, the stock it waits on.
  const w = o.req.when;
  if (w?.by !== undefined) parts.push(`by ${fmtDoy(w.by)}`);
  if (w?.restart !== undefined) parts.push(`restart under ${w.restart}`);
  if (w?.season) parts.push(`from ${fmtDoy(w.season.from)} to ${fmtDoy(w.season.to)}`);
  if (w?.stock?.atLeast !== undefined) parts.push(`while camp has at least ${itemLabel(w.stock.item, w.stock.atLeast)}`);
  if (w?.stock?.under !== undefined) parts.push(`while camp has under ${itemLabel(w.stock.item, w.stock.under)}`);
  if (!keep && u.kind !== "campHas" && o.req.deliver === "camp" && o.req.task !== "haul" && yieldItem(o.req.task, o.req.arg) !== null) parts.push("bringing it to camp");
  if (typeof o.req.where === "string" && o.req.where !== "nearest") parts.push(`at ${SPOT_WORDS[o.req.where]}`);
  return parts.join(", ");
}

const COUNT_WORDS: Partial<Record<TaskId, [string, string]>> = {
  chop: ["tree", "trees"],
  split: ["log", "logs"],
  splitWedges: ["log", "logs"],
  deadwood: ["load", "loads"],
  sticks: ["bundle", "bundles"],
  bark: ["strip", "strips"],
  stone: ["trip", "trips"],
  berries: ["picking", "pickings"],
  eggs: ["nest", "nests"],
  innerBark: ["strip", "strips"],
  grindBark: ["kilo", "kilos"],
  roots: ["dig", "digs"],
  tapSap: ["tap", "taps"],
  seaweed: ["load", "loads"],
  hunt: ["hunt", "hunts"],
  fish: ["cast", "casts"],
  cook: ["meal", "meals"],
  craft: ["piece", "pieces"],
  mend: ["mend", "mends"],
  crack: ["bone", "bones"],
};

/** The word a completion count of this work takes: "14 trees", "1 log", "3 times". */
export function countWord(task: TaskId, n: number): string {
  const w = COUNT_WORDS[task];
  if (!w) return "times";
  return n === 1 ? w[0] : w[1];
}

/**
 * The scheduler's own reading: the met test, and the one thing in it that
 * is memory rather than arithmetic - a restart band's mark, moved here
 * because chooseOrder runs once a minute over the list it owns. Every
 * other caller of orderMet is a reader (the panel drawing a row, the
 * reference runner asking of a probe) and leaves the mark where it is.
 */
function readOrder(state: GameState, world: World, cal: Calendar, o: Order, live: boolean): boolean {
  const restart = o.req.when?.restart;
  if (restart !== undefined && keepTarget(o)) o.held = keepBand(keepStock(state, world, o), keepTargetToday(cal, o), restart, o.held);
  return orderMet(state, world, cal, o, live);
}

/** Sets the skip reason. Logs only the "" to reason transition; one reason replacing another stays quiet. */
function markSkipped(state: GameState, world: World, cal: Calendar, o: Order, why: string): void {
  if (why && !o.skipped) log(state, `${orderSentence(state, world, cal, o)}: ${why}.`, "bad");
  o.skipped = why;
}

/** The tasks that make the light the other camp chores work by. */
const LIGHTING = new Set<TaskId>(["light", "lightIndoors", "lightTorch"]);

/** The reasons the clock gives for skipping an order; the Do panel shows them on the row like any other. */
export const NIGHT_SKIP = {
  away: "dark; at first light",
  noFire: "dark; no fire to work by",
  budget: "the day's work waits for the light",
} as const;

/**
 * Whether the night keeps an order from running now, and why. Nobody sets
 * out for the forest, the shore or the hunt in the dark, so work away from
 * camp waits for first light; the body tier's own walks (thirst, home) are
 * reflexes rather than orders and are not judged here, and a task already
 * under way finishes, since this runs only when the task slot is free. Camp
 * work runs by firelight, the camp fire or a torch in hand, and only while
 * today's work is under the working day less the day's light, so the light
 * hours stay free for the work that needs them: in December that is about
 * four and a half hours of splitting, crafting and cooking in the dark and
 * five and a half of light for the forest; in June the budget is negative
 * and no chores run at night. By day nothing here applies: if nothing away
 * is able to run, the chores run in the light as they always did.
 *
 * Lighting a fire is the one camp job the dark never stops, by neither of
 * the two camp branches: the fire is what the chores work by, so a rule
 * that made lighting it wait for firelight would leave a camp whose fire
 * has gone out unable to light another until dawn, and it is minutes of
 * work rather than a working day, so the budget has no claim on it either.
 * The away branch still applies and never bites for the fire or the fire
 * indoors, which resolve to camp; a torch order given away from camp is
 * caught by it as any away order is.
 */
export function nightSkip(state: GameState, world: World, cal: Calendar, task: TaskId, cell: number): string | null {
  if (!cal.isNight) return null;
  const st = regionState(state, world, state.player.region);
  if (cell !== st.campCell) return NIGHT_SKIP.away;
  if (LIGHTING.has(task)) return null;
  if (!st.fire.lit && !state.player.torch.lit) return NIGHT_SKIP.noFire;
  const budgetMin = (body(state).workHours - cal.daylightHours) * 60;
  if (today(state).workMin >= budgetMin) return NIGHT_SKIP.budget;
  return null;
}

/**
 * Every order, top down, is judged afresh: met, blocked, or able to run.
 * The first able to run is returned, but the rows below it are judged too,
 * so a blocked order never shows a reason left over from before something
 * above it started running. The walk there is judged too, so a route a
 * storm or an overloaded pack has closed is skipped with that reason
 * instead of restarting every minute only to fail at the first step.
 */
export function chooseOrder(state: GameState, world: World, cal: Calendar): Order | null {
  const live = state.intent;
  const liveId = live?.orderId ?? null;
  const here = cellOf(state, world);
  let chosen: Order | null = null;
  for (const o of ordersHere(state, world)) {
    // The live order carrying a load home is still able to run: judging it
    // afresh re-checks legality at the work cell (the shore), where the load
    // just filled there reads as "the vessels are full" every trip, even
    // though nothing is wrong - it is on its way to be poured.
    if (o.id === liveId && live && deliveryPending(state, world, live)) {
      o.skipped = "";
      if (!chosen) chosen = o;
      continue;
    }
    // Shut before met: an order out of season or waiting on a stock says so on
    // its row, rather than showing "met" or whatever reason it was skipped for
    // the last time its conditions let it run.
    const shut = conditionOpen(state, world, cal, o);
    if (shut) {
      markSkipped(state, world, cal, o, shut);
      continue;
    }
    if (readOrder(state, world, cal, o, o.id === liveId)) {
      markSkipped(state, world, cal, o, "");
      continue;
    }
    const keep = keepTarget(o);
    if (keep?.item === "water") {
      const homeSt = regionState(state, world, state.player.region);
      const camp = pile(state, homeSt.campCell);
      const cap = campWaterCapacity(camp, homeSt);
      // cap === 0 means no vessel has ever reached camp yet, not that camp is
      // full: qty + ice (both 0) trivially clears ">= cap - eps" either way, so
      // without this guard a camp with no bucket at all reads as "at capacity"
      // and the keep never gets the chance to run at all, let alone report the
      // truer "needs a vessel".
      if (cap > 0 && cap < keep.qty && qty(camp, "water") + qty(camp, "ice") >= cap - 1e-9) {
        markSkipped(state, world, cal, o, `camp holds ${cap % 1 === 0 ? cap : cap.toFixed(1)} litres; more vessels at camp would hold more`);
        continue;
      }
    }
    const opt = intentOption(state, world, cal, o.req.task, o.req.arg, o.req.where);
    if (!opt.ok) {
      markSkipped(state, world, cal, o, opt.why);
      continue;
    }
    const { cell } = resolveCell(state, world, cal, o.req.task, o.req.arg, o.req.where);
    const night = nightSkip(state, world, cal, o.req.task, cell);
    if (night) {
      markSkipped(state, world, cal, o, night);
      continue;
    }
    if (cell !== here) {
      const w = check(state, world, cal, "walk", `cell:${cell}`);
      if (!w.ok) {
        markSkipped(state, world, cal, o, w.why);
        continue;
      }
    }
    o.skipped = "";
    if (!chosen) chosen = o;
  }
  return chosen;
}

const WAIT: IntentRequest = { task: "wait", until: { kind: "forever" }, deliver: "leave", where: "nearest" };

/**
 * Runs each minute with a free task slot. Met jobs drop off. Then the
 * chosen order becomes the live intent: at once when nothing is owed to
 * camp, after the delivery when something is. With orders but nothing to
 * do, the runner waits at camp, where the nights are safe.
 */
export function runOrders(state: GameState, world: World, cal: Calendar, rng: Rng): void {
  if (state.dead || state.task) return;
  const st = regionState(state, world, state.player.region);
  const live = state.intent;
  for (const o of [...st.orders]) {
    // A daily count is today's alone, and the order stays on the list, since
    // the promise is the count every day rather than once. The day roll moves
    // the base the count is read from rather than zeroing `done`, which stays
    // the run's whole tally for the away report and the row to subtract from.
    if (o.req.until.kind === "daily") {
      if (o.dayOpened !== cal.day) {
        o.dayOpened = cal.day;
        o.dayBase = o.done;
      }
      continue;
    }
    if (o.kind === "job" && readOrder(state, world, cal, o, live?.orderId === o.id)) {
      log(state, `${orderSentence(state, world, cal, o)}: done.`, "good");
      removeOrder(state, world, o.id);
    }
  }
  // A region with no orders has no intent (spec 2.3), whether the list was already
  // empty when this ran (an order removed by hand) or the loop above just emptied
  // it. A manual intent (no orderId) is not this scheduler's to clear, but wait is:
  // startIntent gives it no orderId either, yet it is only ever started by this
  // scheduler and belongs to it just the same. A met job that still owes camp its
  // load winds down instead, so the last order on the list does not leave its
  // bark in the pack at the forest the way one with a neighbour below it never did.
  if (!st.orders.length) {
    if (live && live.orderId !== null && deliveryPending(state, world, live)) live.windDown = true;
    else if (live && (live.orderId !== null || live.task === "wait")) state.intent = null;
    return;
  }
  const chosen = chooseOrder(state, world, cal);
  if (chosen && live?.orderId === chosen.id) return;
  if (!chosen && live?.task === "wait") return;
  if (live && deliveryPending(state, world, live)) {
    live.windDown = true;
    return;
  }
  if (chosen) {
    // chooseOrder just ran the same check and walk check startIntent repeats, so this cannot fail.
    startIntent(state, world, cal, rng, chosen.req, chosen.id);
    return;
  }
  startIntent(state, world, cal, rng, WAIT);
  log(state, "Nothing to do. {You} {wait} at camp.");
}
