/**
 * The body's row. Sleep, food, water, warmth, shelter and coming home
 * before dark are one row on the order list rather than a tier hidden
 * under it, so where the body ranks against the work is the player's to
 * say and is visible while they say it.
 *
 * The row's verdict comes from the need model, not from a target: it asks
 * for nothing while the body wants nothing, and what it does when it wants
 * something is whatever step that need calls for. Judging the row must
 * never serve it - the panel and the scheduler both judge the list far
 * oftener than a minute turns over, and only the real service, once a
 * minute at most, is allowed to drink, eat or feed a fire on the body's
 * behalf.
 */
import type { Rng } from "../rng";
import type { World } from "../world/gen";
import type { Calendar } from "./calendar";
import { bodyStep, NEED_WORDS, peekNeed } from "./body";
import { regionState } from "./regionstate";
import type { GameState, IntentRequest, Order, RegionState, Verdict } from "./types";

/**
 * The request the row carries. `wait` is the task because the row's minute
 * is the body's own step rather than work: nothing ever begins a task from
 * this request, and the runner intent it would start is the same wait the
 * scheduler already gives the body between orders.
 */
export const BODY_REQ: IntentRequest = { task: "wait", until: { kind: "forever" }, deliver: "leave", where: "nearest" };

/** The row's own task is never begun as work; its sentence is fixed, since it never carries a target for orderSentence to describe. */
export const BODY_SENTENCE = "Look after yourself - sleep, food, water, warmth, shelter, home before dark";

export function isBodyRow(o: Order): boolean {
  return o.kind === "body";
}

/** Adds the row at the top of a region's list. Every list born through regionState or a save's own load carries exactly one from that moment on. */
export function addBodyRow(st: RegionState): Order {
  const o: Order = { id: st.nextOrderId++, kind: "body", req: BODY_REQ, done: 0, minutes: 0, skipped: "" };
  st.orders.unshift(o);
  return o;
}

export function bodyRowOf(state: GameState, world: World): Order | null {
  return regionState(state, world, state.player.region).orders.find(isBodyRow) ?? null;
}

/**
 * The row's reading. Met while the body wants nothing; ready when a need
 * holds and there is something here to do about it; blocked when a need
 * holds and nothing here can answer it - a thirst with no water within
 * reach - which is the moment the row most owes the player a word. Two
 * things keep this a judgement rather than a service: peekNeed reads the
 * same sticky memory the real service does without ever writing it back
 * (bodyNeed is a signal a task's own finish clears for one minute, not only
 * a cache, and a row read must not close that minute before the scheduler
 * sees it), and the dry read on bodyStep asks whether a step would go
 * through without ever taking it.
 */
export function judgeBodyRow(state: GameState, world: World, cal: Calendar, rng: Rng): Verdict {
  const need = peekNeed(state, world, cal);
  if (!need) return { v: "met" };
  return bodyStep(state, world, cal, rng, need, true) ? { v: "ready" } : { v: "blocked", why: NEED_WORDS[need] };
}
