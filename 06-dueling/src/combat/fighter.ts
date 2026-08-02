import { attackTimeline } from "./weapons";
import type { AttackTimeline } from "./weapons";
import type { AttackKind, AttackPhase, Intent, WeaponProfile } from "./types";

export const TICK = 1000 / 60;
export const HIT_STUN_MS = 350;
export const DEATH_ANIM_MS = 900;

export type FighterState =
  | { kind: "idle" }
  | { kind: "step"; dir: 1 | -1; t: number }
  | { kind: "pause"; t: number }
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
  parryCd: number;
}

export type FighterEvent =
  | { type: "strikeEnd"; attack: AttackKind }
  /** The blade begins to travel: the beat-to-strike transition. */
  | { type: "strikeBegin" }
  /** A foot plants: a step or void hop finishing its travel. */
  | { type: "footfall" }
  | { type: "died" };

export function createFighter(x: number, facing: 1 | -1, weapon: WeaponProfile): Fighter {
  return { x, facing, weapon, state: { kind: "idle" }, buffered: null, parryCd: 0 };
}

export function applyIntent(
  f: Fighter,
  intent: Intent,
  opts?: { tell?: boolean },
): "accepted" | "buffered" | "ignored" {
  const k = f.state.kind;
  if (k === "dead" || k === "hitstun") return "ignored";
  if (k === "idle") {
    return startAction(f, intent, opts?.tell ?? false) ? "accepted" : "ignored";
  }
  // A parry answers something happening right now, so it is never queued:
  // a parry that fires when the step finishes would be raised against a
  // blade that has already landed, and would burn the cooldown for nothing.
  // The stance pause between chained steps is short and uncommitted, so a
  // parry may interrupt it; the step itself stays committed.
  if (intent === "parry") {
    if (k !== "pause") return "ignored";
    return startAction(f, intent, false) ? "accepted" : "ignored";
  }
  if (k === "step" || k === "pause") {
    f.buffered = intent; // one-slot buffer, last input wins
    return "buffered";
  }
  return "ignored"; // committed: void, attack, parry
}

function startAction(f: Fighter, intent: Intent, tell: boolean): boolean {
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
        phase: tell ? "pretempo" : "windup",
        elapsedMs: 0,
        timeline: attackTimeline(f.weapon, intent, tell ? f.weapon.pretempo : 0),
        met: false,
      };
      return true;
    case "parry":
      if (f.parryCd > 0) return false;
      f.state = { kind: "parry", t: 0 };
      return true;
  }
}

export function tickFighter(f: Fighter, dt: number): FighterEvent[] {
  const events: FighterEvent[] = [];
  f.parryCd = Math.max(0, f.parryCd - dt);
  const s = f.state;
  switch (s.kind) {
    case "idle":
    case "dead":
      if (s.kind === "dead") s.t += dt;
      break;
    case "step": {
      const w = f.weapon;
      const prev = Math.min(s.t, w.stepDuration);
      s.t += dt;
      const now = Math.min(s.t, w.stepDuration);
      f.x += ((now - prev) / w.stepDuration) * w.stepDistance * s.dir * f.facing;
      if (s.t >= w.stepDuration) {
        f.state = { kind: "pause", t: s.t - w.stepDuration };
        events.push({ type: "footfall" });
      }
      break;
    }
    case "pause":
      s.t += dt;
      if (s.t >= f.weapon.stancePause) {
        f.state = { kind: "idle" };
        flushBuffer(f, events);
      }
      break;
    case "void": {
      const w = f.weapon;
      const prev = Math.min(s.t, w.voidDuration);
      s.t += dt;
      const now = Math.min(s.t, w.voidDuration);
      f.x -= ((now - prev) / w.voidDuration) * w.voidDistance * f.facing;
      if (s.t >= w.voidDuration) {
        f.state = { kind: "idle" };
        events.push({ type: "footfall" });
        flushBuffer(f, events);
      }
      break;
    }
    case "parry":
      s.t += dt;
      if (s.t >= f.weapon.parryWindow) {
        f.state = { kind: "idle" };
        f.parryCd = f.weapon.parryCooldown;
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
      if (s.phase === "pretempo" && s.elapsedMs >= tl.riseStart) s.phase = "windup";
      if (s.phase === "windup" && s.elapsedMs >= tl.riseEnd) s.phase = "beat";
      if (s.phase === "beat" && s.elapsedMs >= tl.strikeStart) {
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
        f.state = { kind: "idle" };
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
    startAction(f, b, false);
  }
}
