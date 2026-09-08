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
import { bodyAsks, KIT_ITEMS } from "./body";
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
import { check, setAside } from "./tasks";
import type { GameState, IntentRequest, ItemId, Order, OrderKind, StructureId, TaskId, Verdict } from "./types";
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

/**
 * The scheduler decides again, now, because the player has just changed the
 * list. Without this the decision waits for the chunk under way to end, and a
 * chunk is a whole gathering or a walk across the map, so a row dragged to the
 * top sits there doing nothing for as long as the work it displaced had left.
 *
 * A once order chosen starts on the spot, the way clicking one does: it is the
 * player's, and startIntent sets aside whatever was running with its share
 * kept. Anything else only frees the minute, and the choice is made where every
 * other choice is made, in runOrders - so the body still speaks between orders,
 * and a load already on its way to camp is still delivered first, since
 * chooseOrder holds a delivering order as the chosen one and nothing here fires.
 */
function decideAgain(state: GameState, world: World, cal: Calendar, rng: Rng): void {
  const chosen = chooseOrder(state, world, cal);
  if (chosen?.id === (state.intent?.orderId ?? null)) return;
  if (chosen && chosen.req.until.kind === "once") startIntent(state, world, cal, rng, chosen.req, chosen.id);
  else setAside(state, world);
}

/** The door for a rank the player changed. The bare mutator is the scheduler's own. */
export function moveOrderByHand(state: GameState, world: World, cal: Calendar, rng: Rng, id: number, dir: -1 | 1): void {
  moveOrder(state, world, id, dir);
  decideAgain(state, world, cal, rng);
}

/** The door for an order the player struck off. The bare mutator is the scheduler's own. */
export function removeOrderByHand(state: GameState, world: World, cal: Calendar, rng: Rng, id: number): void {
  removeOrder(state, world, id);
  decideAgain(state, world, cal, rng);
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

/** Days from one day of year to another, forward round the year. */
function daysFrom(a: number, b: number): number {
  return (((b - a) % 365) + 365) % 365;
}

/**
 * A keep's target today. Without a due date it is the whole figure. With
 * one the figure is due in full on that day and the target rises to it
 * evenly from the season's start, or from the day the order was given
 * when it carries no season, so a winter pile is built across the autumn
 * rather than in the week the order is first read. The rise starts at
 * nothing, so a paced keep asks for nothing on the first day of its
 * season and the rows under it have that day to themselves. Past the due
 * date the figure is held, all the way round to the rise's own start.
 *
 * Unless the keep says it is spent by the season's close, which only a
 * keep with a season can say: then the target falls back to nothing across
 * the rest of that season, evenly, the mirror of the rise. A store cut for
 * one winter is spent by the thaw, so what is still wanted in March is
 * what March will burn; a camp holding 43 logs on 1 March, with the thaw
 * 24 days off, is asked for the 257 it is short of and buys a week of
 * felling in 65 cm of snow at -20 C for wood the thaw would leave
 * standing. A buffer is the other case and holds: split firewood is drawn
 * on daily and refilled from the store beside it, so 1 March wants as much
 * of it as 1 December, and a buffer that fell froze four camps of thirty
 * that had lived the year with it held.
 */
export function keepTargetToday(cal: Calendar, o: Order): number {
  const keep = keepTarget(o);
  if (!keep) return 0;
  const w = o.req.when;
  if (!w || w.by === undefined) return keep.qty;
  const from = w.season?.from ?? o.givenDoy ?? w.by;
  const rise = daysFrom(from, w.by);
  if (rise === 0) return keep.qty;
  const gone = daysFrom(from, cal.dayOfYear);
  if (gone <= rise) return (keep.qty * gone) / rise;
  if (!w.spend || !w.season) return keep.qty;
  const fall = daysFrom(w.by, w.season.to);
  const since = daysFrom(w.by, cal.dayOfYear);
  return since >= fall ? 0 : keep.qty * (1 - since / fall);
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
  // is due by and whether it is held or spent after, the line it restarts at, the
  // window it runs in, the stock it waits on.
  const w = o.req.when;
  if (w?.by !== undefined) parts.push(`by ${fmtDoy(w.by)}`);
  // The same two things keepTargetToday needs before it will spend anything: a
  // row that names neither is not spending, whatever its when block carries.
  if (w?.spend && w.season && w.by !== undefined) parts.push(`spent by ${fmtDoy(w.season.to)}`);
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

/**
 * Sets the skip reason, and says what is happening instead. Only the ""
 * to reason transition speaks, so a row settled at one reason is quiet.
 *
 * A once row is the player's own request: passing it over is a thing they
 * asked for that is not happening, and the log owes them both halves of
 * it. A standing row is a policy, and a policy being passed over is what
 * the policy means - "keep camp at 40 kg firewood" is silent on the day
 * camp has 40 kg, and a line every time would bury the log.
 */
function markSkipped(state: GameState, world: World, cal: Calendar, o: Order, why: string, instead: Order | null): void {
  if (why && !o.skipped) {
    const asked = o.req.until.kind === "once";
    const tail = asked && instead ? ` ${cap(orderSentence(state, world, cal, instead))} instead.` : "";
    log(state, `${orderSentence(state, world, cal, o)}: ${why}.${tail}`, "bad");
  }
  o.skipped = why;
}

/** First letter up, for a sentence that starts mid-line. */
function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** The tasks that make the light the other camp chores work by. */
const LIGHTING = new Set<TaskId>(["light", "lightIndoors", "lightTorch"]);

/** Lying down is not work: it needs no light and spends none of the working day. */
const RESTING = new Set<TaskId>(["sleep", "rest", "night", "wait"]);

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
 * Lighting a fire and lying down are the camp jobs the dark never stops, by
 * neither of the two camp branches. Sleep, rest and the two waits are not
 * work: a body with no fire lies down in the dark rather than standing over
 * a cold hearth until dawn, and no part of the working day is spent on it.
 * For the fire: it is what the chores work by, so a rule that made lighting
 * it wait for firelight would leave a camp whose fire has gone out unable to
 * light another until dawn, and it is minutes of work rather than a working
 * day, so the budget has no claim on it either.
 * The away branch still applies and never bites for the fire or the fire
 * indoors, which resolve to camp; a torch order given away from camp is
 * caught by it as any away order is.
 */
export function nightSkip(state: GameState, world: World, cal: Calendar, task: TaskId, cell: number): string | null {
  if (!cal.isNight) return null;
  const st = regionState(state, world, state.player.region);
  if (cell !== st.campCell) return NIGHT_SKIP.away;
  if (LIGHTING.has(task) || RESTING.has(task)) return null;
  if (!st.fire.lit && !state.player.torch.lit) return NIGHT_SKIP.noFire;
  const budgetMin = (body(state).workHours - cal.daylightHours) * 60;
  if (today(state).workMin >= budgetMin) return NIGHT_SKIP.budget;
  return null;
}

/**
 * Every order, top down, is judged afresh: met, shut, blocked or ready.
 * The first ready row runs, and the rows below it are judged too, so a row
 * never shows a reason left over from before something above it started.
 *
 * A row that cannot run is passed over. The list is what the survivor does
 * next, not a contract to be completed in order: one order needing a tool
 * that is not made yet must not cost the day the tool would have been made
 * in. A pinned row is the player saying otherwise, and it is the only thing
 * that stops the list.
 */
export function chooseOrder(state: GameState, world: World, cal: Calendar): Order | null {
  return judgeOrders(state, world, cal).chosen;
}

export type Judgement = { chosen: Order | null; blockedBy: Order | null };

/**
 * The judgement itself: the order to run, and the pinned order stopping the
 * list when one is. They are read together because "nothing to run" and
 * "held up by a pin" are different answers - the second names a row the
 * player has to answer, and only a pinned row that could not run is ever
 * that row.
 */
export function judgeOrders(state: GameState, world: World, cal: Calendar): Judgement {
  const liveId = state.intent?.orderId ?? null;
  const rows = ordersHere(state, world);
  // A row at or above the live one could take the minute from it; a row
  // below cannot pre-empt something already running, and does not need to
  // be asked whether it is ready to. With no live row every row is a
  // candidate, the same as an empty camp with nobody yet doing anything.
  const liveIndex = liveId === null ? -1 : rows.findIndex((o) => o.id === liveId);
  // The live row's own verdict decides whether it still guards the rows under
  // it: gating the rest of the list only makes sense while the live row would
  // win the choice outright again this minute. The moment its own reading
  // stops being "ready" - its promise is met, its season has shut, or it is
  // blocked on something missing - there is no work in progress left to
  // pre-empt, and holding the rest of the list behind a row that could not
  // itself be chosen this minute would strand every row under it exactly on
  // the minute the list exists to fill: the one its own answer stops being
  // yes. A camp with many keeps cycles through several such rows a day, and
  // each one has to let go before the row under it is ever asked anything.
  const liveVerdict = liveIndex >= 0 ? judgeRow(state, world, cal, rows[liveIndex], liveId, true) : null;
  const liveOpen = liveIndex < 0 || liveVerdict!.v !== "ready";
  const verdicts = rows.map((o, i) => (i === liveIndex ? liveVerdict! : judgeRow(state, world, cal, o, liveId, liveOpen || i <= liveIndex)));
  // The chosen and blocking rows are found first, over every row's verdict,
  // before any row is marked: a row passed over above the chosen one has to
  // say what is running in its place, and that is only known once the whole
  // list has been read. A pin reaches past "blocked" to "shut" too, since a
  // pinned row waiting on a season is still the row holding the list, not a
  // row quietly out of season. A "later" verdict never wins the list and
  // never holds it: it is not a row that failed to run, it is a row that was
  // never asked, so it can be neither the choice nor the reason for one.
  let chosen: Order | null = null;
  let blockedBy: Order | null = null;
  for (let i = 0; i < rows.length; i++) {
    const v = verdicts[i];
    if (v.v === "ready" && !chosen && !blockedBy) chosen = rows[i];
    if ((v.v === "shut" || v.v === "blocked") && rows[i].pinned && !chosen && !blockedBy) blockedBy = rows[i];
  }
  if (blockedBy) chosen = null;
  // "later" clears a row's skip mark exactly as "met" does: the row was not
  // refused, it was simply not its turn, and waitingLine already reads that
  // as "waiting its turn, behind" the chosen row off the judgement below.
  for (let i = 0; i < rows.length; i++) {
    const v = verdicts[i];
    if (v.v === "shut" || v.v === "blocked") markSkipped(state, world, cal, rows[i], v.why, chosen);
    else markSkipped(state, world, cal, rows[i], "", null);
  }
  return { chosen, blockedBy };
}

/** Rows whose walk has been judged since the counter was last reset. The prefix rule's test reads it; nothing in the game does. */
let walked = 0;
export function walkJudged(): number { return walked; }
export function resetWalkJudged(): void { walked = 0; }

/**
 * One row's reading. The delivery, condition, met, capacity, legality, night
 * and walk checks, in the order they bite. `canTakeIt` says whether this row
 * could take the minute from whatever is live at all; a row that could not
 * skips the expensive half below, since asking a row to route across the map
 * when it has no way to act on the answer is A* spent for nothing.
 */
function judgeRow(state: GameState, world: World, cal: Calendar, o: Order, liveId: number | null, canTakeIt: boolean): Verdict {
  const live = state.intent;
  // A live order carrying a load home is still able to run: judged afresh at
  // the work cell it would read "the vessels are full" every trip, though
  // nothing is wrong - it is on its way to be poured.
  if (o.id === liveId && live && deliveryPending(state, world, live)) return { v: "ready" };
  const shut = conditionOpen(state, world, cal, o);
  if (shut) return { v: "shut", why: shut };
  if (readOrder(state, world, cal, o, o.id === liveId)) return { v: "met" };
  const keep = keepTarget(o);
  if (keep?.item === "water") {
    const homeSt = regionState(state, world, state.player.region);
    const camp = pile(state, homeSt.campCell);
    const cap = campWaterCapacity(camp, homeSt);
    // cap === 0 means no vessel has ever reached camp, not that camp is full.
    if (cap > 0 && cap < keep.qty && qty(camp, "water") + qty(camp, "ice") >= cap - 1e-9) {
      return { v: "shut", why: `camp holds ${cap % 1 === 0 ? cap : cap.toFixed(1)} litres; more vessels at camp would hold more` };
    }
  }
  // Everything below this line is what a row below the live one is spared:
  // intentOption and resolveCell can search the region for a site, and the
  // walk check routes across it, so asking it of every row every minute
  // would put A* in the inner loop of a run that covers hundreds of days.
  // A row here keeps its cheap reads above - the season, the stock, whether
  // its target is met - which is what the panel draws it from; only whether
  // it could actually go to work this minute is a question deferred to the
  // minute it might matter, which is the minute it reaches the prefix.
  if (!canTakeIt) return { v: "later" };
  const opt = intentOption(state, world, cal, o.req.task, o.req.arg, o.req.where);
  if (!opt.ok) return { v: "blocked", why: opt.why };
  const { cell } = resolveCell(state, world, cal, o.req.task, o.req.arg, o.req.where);
  const night = nightSkip(state, world, cal, o.req.task, cell);
  if (night) return { v: "shut", why: night };
  if (cell !== cellOf(state, world)) {
    walked++;
    const w = check(state, world, cal, "walk", `cell:${cell}`);
    if (!w.ok) return { v: "blocked", why: w.why };
  }
  return { v: "ready" };
}

/**
 * The second line of a row that is not the live one. The scheduler already
 * knows why every row is not running, and until now threw all of it away
 * but the refusals: a row it judged able to run got `skipped = ""` and the
 * panel printed the bare word "waiting", which says nothing at all. The
 * commonest reason a row is not running is that another row is, and that
 * is the one the player most needs, since it is the difference between a
 * list working through its ranks and a list stuck.
 *
 * The judgement is passed in rather than taken here: it is one pass over
 * the whole list, and a panel drawing ten rows must not make ten of them.
 */
export function waitingLine(state: GameState, world: World, cal: Calendar, o: Order, judged: Judgement): string {
  if (o.skipped) return o.skipped;
  if (orderMet(state, world, cal, o, false)) return "met";
  const { chosen, blockedBy } = judged;
  if (blockedBy && blockedBy.id !== o.id) return `held up by the pinned "${orderSentence(state, world, cal, blockedBy)}"`;
  if (chosen && chosen.id !== o.id) return `waiting its turn, behind "${orderSentence(state, world, cal, chosen)}"`;
  return "waiting its turn";
}

/**
 * The pinned row holding the list, if one is: the topmost pinned row that
 * cannot run, with nothing above it that can. Nothing else stops the list,
 * so this is always a row the player pinned on purpose and can unpin.
 */
export function blockingOrder(state: GameState, world: World, cal: Calendar): Order | null {
  return judgeOrders(state, world, cal).blockedBy;
}

const WAIT: IntentRequest = { task: "wait", until: { kind: "forever" }, deliver: "leave", where: "nearest" };

/**
 * Runs every minute, task slot free or not: the list is judged afresh each
 * minute so the panel and waitingLine never draw a stale verdict, and a rank
 * or a row the player just changed through the hand doors is read on the
 * very next reading rather than at the end of whatever chunk was already
 * under way. Met jobs drop off on every reading too. But judging is not
 * acting: a chunk of work already in hand keeps the minute until it ends on
 * its own, the way it always did, and only then does the chosen order
 * become the live intent - at once when nothing is owed to camp, after the
 * delivery when something is. With orders but nothing to do, the runner
 * waits at camp, where the nights are safe.
 */
export function runOrders(state: GameState, world: World, cal: Calendar, rng: Rng): void {
  if (state.dead) return;
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
  // Clearing the intent itself waits for the chunk under way to end: a wait
  // intent's own rest or sleep is still that intent's to run to its model's own
  // exit, and reading this every minute must not cut it off mid-step the way
  // it would if this ran only once and happened to land mid-chunk anyway.
  if (!st.orders.length) {
    if (live && live.orderId !== null && deliveryPending(state, world, live)) live.windDown = true;
    else if (state.task) return;
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
    // The chosen row does not take the minute away from a chunk already in
    // hand: it waits for that chunk to end on its own, the way the whole
    // list did before every row was read every minute, and this same
    // judgement is read again the next minute with nothing left to
    // interrupt. A rank or a row change made through moveOrderByHand or
    // removeOrderByHand is the one thing that crosses this line today,
    // because it is the player asking on the spot rather than this reading
    // noticing something on its own - decideAgain is that door, not this
    // one. The body row is the other thing that gets to cross it, once the
    // body is a row, because a body need cannot wait for a tree to come
    // down; that exception belongs here and is not this task's to add.
    if (state.task) return;
    // Between orders the runner is its own, and the body speaks first. An
    // order starts only when the body asks for nothing; while it does, the
    // runner waits and the wait's body tier serves it - the walk home, the
    // fire, the night, the drink - and the order starts once the wait has
    // nothing left to serve. This is the only body turn work chosen by hand
    // ever gets, since a once order carries no body tier of its own.
    const waiting = live?.mode === "runner" && live.task === "wait" ? live : null;
    if (waiting ? waiting.need !== null : bodyAsks(state, world, cal) !== null) {
      if (!waiting) startIntent(state, world, cal, rng, WAIT);
      return;
    }
    // chooseOrder just ran the same check and walk check startIntent repeats, so this cannot fail.
    startIntent(state, world, cal, rng, chosen.req, chosen.id);
    return;
  }
  // Nothing is ready, and a chunk of work is already in hand: it keeps the
  // minute rather than being bumped for a wait nothing asked for.
  if (state.task) return;
  startIntent(state, world, cal, rng, WAIT);
  log(state, "Nothing to do. {You} {wait} at camp.");
}
