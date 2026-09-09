/**
 * The two care rows. The body's row - sleep, food, water, warmth, shelter
 * and coming home before dark - and the camp's - the fire fed, the snares
 * checked - are rows on the order list rather than a tier hidden under it,
 * so where each ranks against the work is the player's to say and is
 * visible while they say it.
 *
 * They are two rows because they are two jobs. A survivor who drops the
 * camp down the list to travel hard is saying nothing about sleep or
 * thirst, and one row would have made him say both at once.
 *
 * Neither row's verdict comes from a target: each asks the need model what
 * it wants, asks for nothing while it wants nothing, and does whatever step
 * that want calls for. Judging a row must never serve it - the panel and
 * the scheduler both judge the list far oftener than a minute turns over,
 * and only the real service, once a minute at most, is allowed to drink,
 * eat or feed a fire on the survivor's behalf.
 */
import type { Rng } from "../rng";
import type { World } from "../world/gen";
import type { Calendar } from "./calendar";
import { bodyStep, campNeed, currentNeed, NEED_ASIDE, NEED_LOG_LINES, NEED_WORDS, peekNeed } from "./body";
import { intentSentence } from "./intent";
import { log } from "./log";
import { regionState } from "./regionstate";
import { isRunning, takeStep } from "./steps";
import { setAside } from "./tasks";
import { isWorkIntent, type CareNeed, type CareOrder, type GameState, type Order, type RegionState, type Verdict } from "./types";

/** Neither row's own task is ever begun as work; their sentences are fixed, since neither carries a target for orderSentence to describe. */
export const BODY_SENTENCE = "Self-care";
export const CAMP_SENTENCE = "Camp maintenance";

export function isBodyRow(o: Order): o is CareOrder & { kind: "body" } {
  return o.kind === "body";
}

export function isCampRow(o: Order): o is CareOrder & { kind: "camp" } {
  return o.kind === "camp";
}

/**
 * A row the scheduler serves from the need model rather than from a
 * request. Everything the two share is asked through this: neither can be
 * struck off, neither takes a pin, neither is work for the list to choose
 * among, neither counts in a rank the player gives their own orders in,
 * and both are drawn apart from the work.
 */
export function isCareRow(o: Order): o is CareOrder {
  return isBodyRow(o) || isCampRow(o);
}

function careRow(st: RegionState, kind: "body" | "camp"): CareOrder {
  return { id: st.nextOrderId++, kind, done: 0, minutes: 0, skipped: "" };
}

/**
 * Puts whichever care row a list is missing at its top, the camp above the
 * body. The camp is what the body rests and sleeps in: the evening by the
 * fire and the night at camp are both spent at a fire somebody has to feed,
 * and a body ranked over the camp would hold the minute from dusk to dawn
 * resting by a fire it never fed, which goes out under it. Feeding it costs
 * no minute at all, so the camp taking its turn first costs the body
 * nothing, and a player who wants it the other way round - the fire left to
 * burn down while a freezing survivor gets warm - says so with the row's
 * own up button. Every list born through regionState carries both rows from
 * that moment on, and a list loaded out of a save is brought up to the same.
 */
export function ensureCareRows(st: RegionState): void {
  const missing: ("camp" | "body")[] = [];
  if (!st.orders.some(isCampRow)) missing.push("camp");
  if (!st.orders.some(isBodyRow)) missing.push("body");
  // Made top down, so a list that is missing both numbers them in the order
  // they will be read in, then put on back to front so the first made ends
  // up at the top.
  const rows = missing.map((k) => careRow(st, k));
  for (const o of rows.reverse()) st.orders.unshift(o);
}

export function bodyRowOf(state: GameState, world: World): (CareOrder & { kind: "body" }) | null {
  return regionState(state, world, state.player.region).orders.find(isBodyRow) ?? null;
}

export function campRowOf(state: GameState, world: World): (CareOrder & { kind: "camp" }) | null {
  return regionState(state, world, state.player.region).orders.find(isCampRow) ?? null;
}

/**
 * A row's reading. Met while nothing is wanted; ready when a want holds and
 * there is something here to do about it; blocked when a want holds and
 * nothing here can answer it - a thirst with no water within reach - which
 * is the moment the row most owes the player a word. The dry read on
 * bodyStep is what keeps this a judgement rather than a service: it asks
 * whether a step would go through without ever taking it.
 */
function judgeNeed(state: GameState, world: World, cal: Calendar, rng: Rng, need: CareNeed | null): Verdict {
  if (!need) return { v: "met" };
  return bodyStep(state, world, cal, rng, need, true) ? { v: "ready" } : { v: "blocked", why: NEED_WORDS[need] };
}

/**
 * The body row's reading. peekNeed is the second thing that keeps it a
 * judgement: it reads the same sticky memory the real service does without
 * ever writing it back (bodyNeed is a signal a task's own finish clears for
 * one minute, not only a cache, and a row read must not close that minute
 * before the scheduler sees it).
 */
export function judgeBodyRow(state: GameState, world: World, cal: Calendar, rng: Rng): Verdict {
  return judgeNeed(state, world, cal, rng, peekNeed(state, world, cal));
}

/** The camp row's reading. The camp's wants are sticky nowhere and written nowhere, so the judging read and the serving read are the same call. */
export function judgeCampRow(state: GameState, world: World, cal: Calendar, rng: Rng): Verdict {
  return judgeNeed(state, world, cal, rng, campNeed(state, world, cal));
}

/**
 * What the log says when a care row goes from met to blocked:
 * NEED_LOG_LINES' sentence for whatever is currently wanted, in the game's
 * own person voice, not NEED_WORDS' fragment - that one is the row's own
 * and reads wrong once it leaves the row. Read fresh with the same dry,
 * non-writing reads the judgements take: the only thing markSkipped is
 * handed at that moment is the row's already-chosen fragment, not the want
 * itself.
 */
export function careLogLine(state: GameState, world: World, cal: Calendar, o: CareOrder): string | null {
  // The camp branch answers nothing today: both camp wants carry their own
  // answerability, so the camp row reads met where it could not act and
  // never goes from met to blocked. It is written for the row rather than
  // for the wants that happen to be on it, so a refusable camp want speaks
  // the day it is added. See NEED_WORDS in body.ts.
  const need = isCampRow(o) ? campNeed(state, world, cal) : peekNeed(state, world, cal);
  return need ? NEED_LOG_LINES[need] : null;
}

/**
 * A care row's minute: whatever step the want calls for, taken under the
 * row's own name.
 *
 * A want answered where the survivor stands - a mouthful from the pack, a
 * pull on the waterskin, a log onto the fire - costs the minute nothing and
 * is taken without disturbing anything: bodyStep does it and hands back no
 * step, and whatever was under way is still under way. Only a want that
 * asks for the survivor's hands or feet claims the row's own care intent,
 * so everything reading "what is he doing" finds the row by name the way it
 * finds any other row that has the minute. The need's concrete step is the
 * whole of that minute.
 */
function serveNeed(state: GameState, world: World, cal: Calendar, rng: Rng, o: CareOrder, need: CareNeed): void {
  const s = bodyStep(state, world, cal, rng, need);
  if (!s) return;
  // A storm step also claims a matching work task through the normal
  // set-aside path, so its progress survives under the care row's name.
  if (isRunning(state, s) && (need !== "storm" || state.intent?.orderId === o.id)) return;
  // A night out is the body's own errand under an order's name: the whole of
  // it is the sleep this row would take anyway, so the step goes under that
  // order rather than taking the night away from it.
  if ((!isWorkIntent(state.intent) || state.intent.task !== "night") && (!state.intent || state.intent.orderId !== o.id)) {
    // Work with no row behind it is not picked up again: the list is what
    // brings work back, and an intent nothing on the list stands for has
    // nothing to bring it back with. So it is said aloud, once, as it goes -
    // a survivor quietly not doing what was asked is the thing the list
    // exists to stop.
    const dropped = isWorkIntent(state.intent) && state.intent.orderId === null ? state.intent : null;
    if (dropped) log(state, `${intentSentence(state, world, cal, dropped)}: set aside, ${NEED_ASIDE[need]}.`, "bad");
    setAside(state, world);
    state.intent = { mode: "care", care: o.kind, need, orderId: o.id, step: s.step };
  }
  if (state.intent?.mode === "care" && state.intent.orderId === o.id) state.intent.need = need;
  takeStep(state, world, cal, s);
}

/**
 * The body row's minute. The need is read the serving way - sticky memory
 * and all, so a body halfway through answering one goes on answering it -
 * and whatever step that need calls for is taken. The sleep is the one step
 * the model rather than the clock ends: a sleep task runs as long as the
 * night is expected to be, and the two can disagree by minutes, so a body
 * past the wake line gets up on that minute instead of lying out an hour it
 * no longer needs.
 */
export function serveBodyRow(state: GameState, world: World, cal: Calendar, rng: Rng, o: CareOrder & { kind: "body" }): void {
  const need = currentNeed(state, world, cal);
  if (need !== "storm" && state.intent?.mode === "care" && state.intent.orderId === o.id && state.intent.need === "storm") {
    // Storm preparation owns no minutes after its need has ended. Keep
    // unfinished shelter work through the ordinary task pause path.
    setAside(state, world);
    state.intent = null;
  }
  if (state.task?.id === "sleep" && need !== "sleep") setAside(state, world);
  if (!need) return;
  serveNeed(state, world, cal, rng, o, need);
}

/** The camp row's minute: a log on the fire, or the walk to the snares. */
export function serveCampRow(state: GameState, world: World, cal: Calendar, rng: Rng, o: CareOrder & { kind: "camp" }): void {
  const need = campNeed(state, world, cal);
  if (!need) return;
  serveNeed(state, world, cal, rng, o, need);
}

/** The right service for whichever care row won the minute. */
export function serveCareRow(state: GameState, world: World, cal: Calendar, rng: Rng, o: CareOrder): void {
  if (isCampRow(o)) serveCampRow(state, world, cal, rng, o);
  else serveBodyRow(state, world, cal, rng, o);
}
