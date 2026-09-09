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
import { isWorkIntent, type GameState } from "../sim/types";
import { ordersHere } from "../sim/orders";
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
}

export function newHurry(): HurryState {
  return { pulse: null, rate: 1, autoRun: false, autoOrderId: null };
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
    const progress = Math.max(0, Math.min(1, autoProgress));
    const edge = 0.15;
    const continued = h.autoRun && h.autoOrderId !== liveOrderId;
    const entering = continued ? 1 : Math.min(1, progress / edge);
    const leaving = autoHasNext ? 1 : Math.min(1, (1 - progress) / edge);
    const envelope = Math.min(
      Math.sin(Math.PI * entering / 2) ** 2,
      Math.sin(Math.PI * leaving / 2) ** 2,
    );
    h.rate = 1 + (PEAK - 1) * envelope;
    extra += (h.rate - 1) * dtSec;
    h.autoRun = true;
    h.autoOrderId = liveOrderId;
  } else {
    h.autoRun = false;
    h.autoOrderId = null;
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
  const rows = ordersHere(state, world);
  const liveIndex = liveId === null ? -1 : rows.findIndex((order) => order.id === liveId);
  const next = liveIndex < 0 ? undefined : rows[liveIndex + 1];
  const autoHasNext = next !== undefined && "req" in next && next.req.until.kind === "once";
  return hurryFrame(h, hurryKind(state), liveId, dtSec, progress, autoHasNext);
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
