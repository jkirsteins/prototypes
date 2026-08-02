import { attackTimeline } from "./weapons";
import type { AttackTimeline } from "./weapons";
import type { AttackKind, AttackPhase, Intent, WeaponProfile } from "./types";

export const TICK = 1000 / 60;
export const HIT_STUN_MS = 350;
export const DEATH_ANIM_MS = 900;

export type FighterState =
  | { kind: "ready" }
  | { kind: "step"; dir: 1 | -1; t: number }
  | { kind: "void"; t: number }
  | {
      kind: "attack";
      attack: AttackKind;
      phase: AttackPhase;
      /** Absolute ms since attack start: the attack's only clock. */
      elapsedMs: number;
      /** The attack's boundaries, snapshotted at start. See AttackTimeline. */
      timeline: AttackTimeline;
      /** Set by the engine when a defending blade met this one inside the parryable window. */
      met: boolean;
    }
  | { kind: "parry"; t: number }
  | { kind: "hitstun"; t: number }
  | { kind: "dead"; t: number };

export interface Fighter {
  x: number;
  facing: 1 | -1;
  weapon: WeaponProfile;
  state: FighterState;
  buffered: Intent | null;
  /**
   * Settle time left after a step: while > 0, non-parry intents buffer
   * instead of starting, and the buffer flushes when it reaches 0. The
   * same concept as parryRecoveryMs - "time until X is available" is a
   * timer on the fighter, not a state.
   */
  stepRecoveryMs: number;
  /** Time until the next parry is available. Gates only the parry. */
  parryRecoveryMs: number;
}

export type FighterEvent =
  | { type: "strikeEnd"; attack: AttackKind }
  /** The blade begins to travel: the windup-to-strike transition. */
  | { type: "strikeBegin" }
  /** A foot plants: a step or void hop finishing its travel. */
  | { type: "footfall" }
  | { type: "died" };

export function createFighter(x: number, facing: 1 | -1, weapon: WeaponProfile): Fighter {
  return { x, facing, weapon, state: { kind: "ready" }, buffered: null, stepRecoveryMs: 0, parryRecoveryMs: 0 };
}

export function applyIntent(
  f: Fighter,
  intent: Intent,
  opts?: { windupBonusMs?: number },
): "accepted" | "buffered" | "ignored" {
  const k = f.state.kind;
  if (k === "dead" || k === "hitstun") return "ignored";
  if (k === "ready") {
    // A parry answers something happening right now, so it is never queued
    // and the step-recovery timer does not gate it: the settle after a step
    // is short and uncommitted, so a guard may go up during it. Everything
    // else waits the settle out in the one-slot buffer.
    if (intent === "parry") {
      return startAction(f, intent, 0) ? "accepted" : "ignored";
    }
    if (f.stepRecoveryMs > 0) {
      f.buffered = intent; // one-slot buffer, last input wins
      return "buffered";
    }
    return startAction(f, intent, opts?.windupBonusMs ?? 0) ? "accepted" : "ignored";
  }
  // A parry buffered mid-step would fire against a blade that has already
  // landed and burn the cooldown for nothing; the step stays committed.
  if (intent === "parry") return "ignored";
  if (k === "step") {
    f.buffered = intent; // one-slot buffer, last input wins
    return "buffered";
  }
  return "ignored"; // committed: void, attack, parry
}

function startAction(f: Fighter, intent: Intent, windupBonusMs: number): boolean {
  switch (intent) {
    case "advance":
      f.state = { kind: "step", dir: 1, t: 0 };
      return true;
    case "retreat":
      f.state = { kind: "step", dir: -1, t: 0 };
      return true;
    case "void":
      f.state = { kind: "void", t: 0 };
      return true;
    case "cut":
    case "thrust":
      f.state = {
        kind: "attack",
        attack: intent,
        phase: "windup",
        elapsedMs: 0,
        timeline: attackTimeline(f.weapon, intent, windupBonusMs),
        met: false,
      };
      return true;
    case "parry":
      if (f.parryRecoveryMs > 0) return false;
      f.state = { kind: "parry", t: 0 };
      return true;
  }
}

export function tickFighter(f: Fighter, dt: number): FighterEvent[] {
  const events: FighterEvent[] = [];
  const settling = f.stepRecoveryMs > 0;
  f.stepRecoveryMs = Math.max(0, f.stepRecoveryMs - dt);
  f.parryRecoveryMs = Math.max(0, f.parryRecoveryMs - dt);
  const s = f.state;
  switch (s.kind) {
    case "ready":
    case "dead":
      if (s.kind === "dead") s.t += dt;
      // The settle expires only while actually ready: a parry raised during
      // it leaves the buffer in place, exactly as the old pause-interrupt
      // did, and the buffer then waits for the next completed settle.
      else if (settling && f.stepRecoveryMs === 0) flushBuffer(f, events);
      break;
    case "step": {
      const w = f.weapon;
      const prev = Math.min(s.t, w.stepDuration);
      s.t += dt;
      const now = Math.min(s.t, w.stepDuration);
      f.x += ((now - prev) / w.stepDuration) * w.stepDistance * s.dir * f.facing;
      if (s.t >= w.stepDuration) {
        // Carry the overrun into the settle, or the step cycle would gain
        // up to one tick. An oversized dt can spend the whole settle inside
        // this tick, in which case the buffer flushes immediately.
        f.state = { kind: "ready" };
        events.push({ type: "footfall" });
        f.stepRecoveryMs = Math.max(0, w.stepRecoveryMs - (s.t - w.stepDuration));
        if (f.stepRecoveryMs === 0) flushBuffer(f, events);
      }
      break;
    }
    case "void": {
      const w = f.weapon;
      const prev = Math.min(s.t, w.voidDuration);
      s.t += dt;
      const now = Math.min(s.t, w.voidDuration);
      f.x -= ((now - prev) / w.voidDuration) * w.voidDistance * f.facing;
      if (s.t >= w.voidDuration) {
        f.state = { kind: "ready" };
        events.push({ type: "footfall" });
        flushBuffer(f, events);
      }
      break;
    }
    case "parry":
      s.t += dt;
      if (s.t >= f.weapon.parryWindowMs) {
        f.state = { kind: "ready" };
        f.parryRecoveryMs = f.weapon.parryRecoveryMs;
      }
      break;
    case "hitstun":
      s.t += dt;
      if (s.t >= HIT_STUN_MS) {
        f.state = { kind: "dead", t: 0 };
        events.push({ type: "died" });
      }
      break;
    case "attack": {
      // One clock, absolute marks: the phase follows elapsedMs across the
      // timeline, so tick quantisation has nothing to accumulate in. The
      // sequential ifs let a phase shorter than one tick be crossed cleanly.
      const tl = s.timeline;
      s.elapsedMs += dt;
      if (s.phase === "windup" && s.elapsedMs >= tl.strikeStart) {
        s.phase = "strike";
        events.push({ type: "strikeBegin" });
      }
      if (s.phase === "strike" && s.elapsedMs >= tl.strikeEnd) {
        s.phase = "recovery";
        events.push({ type: "strikeEnd", attack: s.attack });
        // Resolution barrier: the engine may replace the timeline (whiff,
        // parried) in response to strikeEnd, so recoveryEnd is not read
        // until the next tick.
      } else if (s.phase === "recovery" && s.elapsedMs >= tl.recoveryEnd) {
        f.state = { kind: "ready" };
        flushBuffer(f, events);
      }
      break;
    }
  }
  return events;
}

function flushBuffer(f: Fighter, _events: FighterEvent[]): void {
  const b = f.buffered;
  f.buffered = null;
  if (b !== null) {
    startAction(f, b, 0);
  }
}
