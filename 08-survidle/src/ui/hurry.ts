/**
 * Hurrying the work chosen by hand. The sim never learns of it: each frame
 * the hurry says how many extra game minutes the frame carries, and the
 * frame loop adds them to its own. An immediate action (a raw task, a
 * hand-started intent, a once order) runs at up to PEAK on its own; a
 * standing, counted, or care activity goes ahead a pulse at a time when
 * the central speed button is clicked, with the pulse as the cooldown.
 * Everything done while away runs at the one scale.
 *
 * Spec: docs/superpowers/specs/2026-09-05-survidle-hurry-design.md.
 */
import { isWorkIntent, type GameState, type TaskId } from "../sim/types";
import { nextRunnableAfter } from "../sim/orders";
import { calendar } from "../sim/calendar";
import { isCareRow } from "../sim/bodyorder";
import { workSpeed } from "../sim/player";
import { WORK_TASKS } from "../sim/tasks";
import { GAME_MINUTES_PER_REAL_SECOND } from "../units";
import type { World } from "../world/gen";

export type HurryKind = "auto" | "click" | "none";

/** The peak rate of both the automatic and clicked ease-in/out curves. */
export const PEAK = 6;
/** Real seconds one pulse lasts; the next click waits for it. */
export const PULSE_S = 10 / 1.5;
/** Extra game minutes carried by the smooth 1x -> PEAK -> 1x pulse. */
export const PULSE_MIN = (PEAK - 1) * PULSE_S / 2;

export interface HurryState {
  /** The running pulse: the order it was clicked on and how far in it is, in real seconds. */
  pulse: { orderId: number; at: number } | null;
  /** The rate at the end of the last frame, for the clock line; 1 when unhurried. */
  rate: number;
  /** True while adjacent automatic once actions form one uninterrupted speed envelope. */
  autoRun: boolean;
  /** The automatic order seen on the previous frame. */
  autoOrderId: number | null;
  /** Whether that order's run continues into the next once action, as read on the previous frame. */
  autoHasNext: boolean;
}

export function newHurry(): HurryState {
  return { pulse: null, rate: 1, autoRun: false, autoOrderId: null, autoHasNext: false };
}

/** What the work in hand is: chosen in the moment, left running, or nothing to hurry. */
export function hurryKind(state: GameState): HurryKind {
  if (state.dead || state.landing) return "none";
  const it = state.intent;
  if (!it) return state.task ? "auto" : "none";
  if (!isWorkIntent(it)) return state.task && state.task.duration > 0 ? "click" : "none";
  if (it.mode === "runner" && state.player.bodyNeed !== null) return "none";
  if (it.orderId === null || it.until.kind === "once") return "auto";
  return "click";
}

/** Integral of the pulse's smooth sine-squared curve, in pulse-length units. */
function pulseArea(u: number): number {
  const v = Math.max(0, Math.min(1, u));
  return v / 2 - Math.sin(2 * Math.PI * v) / (4 * Math.PI);
}

function pulseRate(at: number): number {
  const u = at / PULSE_S;
  if (u < 0 || u >= 1) return 1;
  return 1 + (PEAK - 1) * Math.sin(Math.PI * u) ** 2;
}

/** Share of the action over which the automatic rate eases in at the start and out at the end. */
const AUTO_EDGE = 0.15;

/**
 * The automatic rate at a share of the action done. It eases in over the
 * first edge unless the run continued from the previous once action, and
 * out over the last unless another once action follows. The frames and the
 * wall-clock estimate both read this one curve, so the bar's seconds cannot
 * drift from the seconds the frames actually take.
 */
export function autoRate(progress: number, continued: boolean, hasNext: boolean): number {
  const p = Math.max(0, Math.min(1, progress));
  const entering = continued ? 1 : Math.min(1, p / AUTO_EDGE);
  const leaving = hasNext ? 1 : Math.min(1, (1 - p) / AUTO_EDGE);
  const envelope = Math.min(
    Math.sin(Math.PI * entering / 2) ** 2,
    Math.sin(Math.PI * leaving / 2) ** 2,
  );
  return 1 + (PEAK - 1) * envelope;
}

/**
 * Advances the hurry by one frame of dtSec and returns the extra game minutes
 * it carries. A pulse ends on its own or the moment its order stops being the
 * one served. Automatic work reads the same curve against task completion,
 * so it reaches 1x before the task disappears instead of dropping afterward.
 */
export function hurryFrame(
  h: HurryState,
  kind: HurryKind,
  liveOrderId: number | null,
  dtSec: number,
  autoProgress = 0,
  autoHasNext = false,
): number {
  let extra = 0;
  if (kind === "auto") {
    const continued = h.autoRun && h.autoOrderId !== liveOrderId;
    h.rate = autoRate(autoProgress, continued, autoHasNext);
    extra += (h.rate - 1) * dtSec;
    h.autoRun = true;
    h.autoOrderId = liveOrderId;
    h.autoHasNext = autoHasNext;
  } else {
    h.autoRun = false;
    h.autoOrderId = null;
    h.autoHasNext = false;
  }
  if (h.pulse && (kind !== "click" || h.pulse.orderId !== liveOrderId)) h.pulse = null;
  if (h.pulse) {
    const a0 = h.pulse.at;
    const a1 = a0 + dtSec;
    extra += (PEAK - 1) * PULSE_S * (pulseArea(a1 / PULSE_S) - pulseArea(a0 / PULSE_S));
    h.pulse = a1 >= PULSE_S ? null : { orderId: h.pulse.orderId, at: a1 };
  }
  if (kind !== "auto") h.rate = h.pulse ? pulseRate(h.pulse.at) : 1;
  return extra;
}

/**
 * Advances hurrying from the live game state. Queue adjacency belongs here,
 * beside the speed-envelope rule, rather than in the browser frame loop.
 */
export function advanceHurry(h: HurryState, state: GameState, world: World, dtSec: number): number {
  const progress = state.task && state.task.duration > 0 ? state.task.progress / state.task.duration : 0;
  const liveId = state.intent?.orderId ?? null;
  const next = liveId === null || progress < 0.85
    ? null
    : nextRunnableAfter(state, world, calendar(state.minute, state.startDoy), liveId);
  const autoHasNext = next !== null && !isCareRow(next) && next.req.until.kind === "once";
  return hurryFrame(h, hurryKind(state), liveId, dtSec, progress, autoHasNext);
}

/**
 * Real seconds for `minutes` of work under the frame loop's arithmetic: the
 * frame's own minutes (the one scale times the speed test aid) plus what the
 * hurry carries, advanced at the body's pace. `rateAt` is the hurry's rate at
 * a share of the action done; the auto curve varies with progress, so this is
 * an integral over the work left rather than a division.
 */
function secondsUnder(minutes: number, startShare: number, duration: number, pace: number, speed: number, rateAt: (share: number) => number): number {
  if (minutes <= 0 || pace <= 0) return 0;
  const steps = 64;
  const dP = minutes / steps;
  let seconds = 0;
  for (let i = 0; i < steps; i++) {
    const share = duration > 0 ? (startShare * duration + (i + 0.5) * dP) / duration : 1;
    seconds += dP / (pace * (GAME_MINUTES_PER_REAL_SECOND * speed + rateAt(share) - 1));
  }
  return seconds;
}

/**
 * The wall clock the running task has left, or null with nothing running.
 * This is what the bar's bracket says, so it must agree with what the frames
 * then do: a once action's auto curve from here to its end, a live pulse's
 * remaining minutes off the front of a counted or standing order, and the
 * body's pace on work the body paces (tasks.ts stepTask).
 */
export function realSecondsLeft(state: GameState, world: World, h: HurryState, speed = 1): number | null {
  const t = state.task;
  if (!t || t.duration <= 0) return null;
  const left = Math.max(0, t.duration - t.progress);
  const pace = WORK_TASKS.has(t.id) ? workSpeed(state, world) : 1;
  const share = t.progress / t.duration;
  const kind = hurryKind(state);
  if (kind === "auto") {
    const continued = h.autoRun && h.autoOrderId !== (state.intent?.orderId ?? null);
    return secondsUnder(left, share, t.duration, pace, speed, (p) => autoRate(p, continued, h.autoHasNext));
  }
  if (kind === "click" && h.pulse) {
    // Walk the rest of the pulse in real time; whatever is left after it runs at the one scale.
    const dt = 0.05;
    let at = h.pulse.at;
    let done = 0;
    let seconds = 0;
    while (at < PULSE_S && done < left) {
      const next = Math.min(PULSE_S, at + dt);
      const carried = (next - at) * GAME_MINUTES_PER_REAL_SECOND * speed + (PEAK - 1) * PULSE_S * (pulseArea(next / PULSE_S) - pulseArea(at / PULSE_S));
      const minutes = pace * carried;
      if (done + minutes >= left) return seconds + (next - at) * ((left - done) / minutes);
      done += minutes;
      seconds += next - at;
      at = next;
    }
    return seconds + secondsUnder(left - done, share, t.duration, pace, speed, () => 1);
  }
  return secondsUnder(left, share, t.duration, pace, speed, () => 1);
}

/**
 * The wall clock an order not yet given would take from its start: the auto
 * curve whole when it will run as a once action, the one scale otherwise.
 * `minutes` is the option's duration, minutes at full speed, so the pace
 * applies here the same way it does on the bar.
 */
export function realSecondsForOrder(state: GameState, world: World, id: TaskId, arg: string | undefined, minutes: number, once: boolean, speed = 1): number {
  const pace = WORK_TASKS.has(id) ? workSpeed(state, world, { id, arg, progress: 0, duration: minutes, repeat: false }) : 1;
  return secondsUnder(minutes, 0, minutes, pace, speed, once ? (p) => autoRate(p, false, false) : () => 1);
}

/** A click on the central speed button starts a pulse unless one is already running. */
export function hurryClick(h: HurryState, kind: HurryKind, liveOrderId: number | null): boolean {
  if (kind !== "click" || liveOrderId === null || h.pulse) return false;
  h.pulse = { orderId: liveOrderId, at: 0 };
  return true;
}

/** How much of the running pulse is left, 0 to 1. */
export function pulseLeft(h: HurryState): number {
  return h.pulse ? 1 - h.pulse.at / PULSE_S : 0;
}
