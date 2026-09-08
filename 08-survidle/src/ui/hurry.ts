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

export type HurryKind = "auto" | "click" | "none";

/** The rate an immediate action climbs to, as a multiple of the one scale. */
export const PEAK = 6;
/** Real seconds the climb takes. */
export const RAMP_S = 2;
/** Real seconds one pulse lasts; the next click waits for it. */
export const PULSE_S = 10 / 1.5;
/** Extra game minutes carried by the smooth 1x -> PEAK -> 1x pulse. */
export const PULSE_MIN = (PEAK - 1) * PULSE_S / 2;

export interface HurryState {
  /** Real seconds the kind has been "auto" without a break. */
  held: number;
  /** The running pulse: the order it was clicked on and how far in it is, in real seconds. */
  pulse: { orderId: number; at: number } | null;
  /** The rate at the end of the last frame, for the clock line; 1 when unhurried. */
  rate: number;
}

export function newHurry(): HurryState {
  return { held: 0, pulse: null, rate: 1 };
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

/** Integral of the auto ramp's ease from 0 to u: raised cosine up to 1, then flat at the peak. */
function rampArea(u: number): number {
  return u <= 1 ? (u - Math.sin(Math.PI * u) / Math.PI) / 2 : 0.5 + (u - 1);
}

/** Integral of the pulse's smooth sine-squared curve, in pulse-length units. */
function pulseArea(u: number): number {
  const v = Math.max(0, Math.min(1, u));
  return v / 2 - Math.sin(2 * Math.PI * v) / (4 * Math.PI);
}

function autoRate(held: number): number {
  const u = held / RAMP_S;
  const ease = u >= 1 ? 1 : (1 - Math.cos(Math.PI * u)) / 2;
  return 1 + (PEAK - 1) * ease;
}

function pulseRate(at: number): number {
  const u = at / PULSE_S;
  if (u < 0 || u >= 1) return 1;
  return 1 + (PEAK - 1) * Math.sin(Math.PI * u) ** 2;
}

/**
 * Advances the hurry by one frame of dtSec and returns the extra game minutes
 * it carries. A pulse ends on its own or the moment its order stops being the
 * one served; the auto ramp restarts from 1 whenever the kind breaks.
 */
export function hurryFrame(h: HurryState, kind: HurryKind, liveOrderId: number | null, dtSec: number): number {
  let extra = 0;
  if (kind === "auto") {
    const t0 = h.held;
    const t1 = t0 + dtSec;
    extra += (PEAK - 1) * RAMP_S * (rampArea(t1 / RAMP_S) - rampArea(t0 / RAMP_S));
    h.held = t1;
  } else {
    h.held = 0;
  }
  if (h.pulse && (kind !== "click" || h.pulse.orderId !== liveOrderId)) h.pulse = null;
  if (h.pulse) {
    const a0 = h.pulse.at;
    const a1 = a0 + dtSec;
    extra += (PEAK - 1) * PULSE_S * (pulseArea(a1 / PULSE_S) - pulseArea(a0 / PULSE_S));
    h.pulse = a1 >= PULSE_S ? null : { orderId: h.pulse.orderId, at: a1 };
  }
  h.rate = kind === "auto" ? autoRate(h.held) : h.pulse ? pulseRate(h.pulse.at) : 1;
  return extra;
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
