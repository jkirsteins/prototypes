import { DEATH_ANIM_MS, HIT_STUN_MS, LONGSWORD, attackTimeline } from "./timings";
import type { AttackKind, AttackTimeline } from "./timings";

/**
 * The PoC stand-in for 06's fighter: keys force transitions, elapsed ms
 * advances them. x is centimeters, 0 at screen center; the engine owns
 * position and displacement (clips play in place).
 */

/** Keeps the fighter inside the fixed camera's view (cm). */
export const PISTE_HALF_CM = 400;

export type DuelState =
  | { kind: "ready" }
  | { kind: "step"; dir: 1 | -1; t: number }
  | { kind: "void"; t: number }
  | { kind: "attack"; attack: AttackKind; phase: "windup" | "strike" | "recovery"; elapsedMs: number; timeline: AttackTimeline }
  | { kind: "parry"; t: number }
  | { kind: "hitstun"; t: number }
  | { kind: "bind" }
  | { kind: "unarmed" }
  | { kind: "dead"; t: number };

export interface Duelist {
  x: number;
  facing: 1 | -1;
  state: DuelState;
}

export function createDuelist(): Duelist {
  return { x: 0, facing: 1, state: { kind: "ready" } };
}

export type DuelEvent =
  | "stepFwd" | "stepBack" | "void" | "cut" | "thrust"
  | "parryDown" | "parryUp" | "hitstun" | "bind" | "unarmed"
  | "death" | "reset" | "flip";

export function handleEvent(d: Duelist, e: DuelEvent): void {
  if (e === "reset") { d.state = { kind: "ready" }; return; }
  if (e === "flip") { d.facing = d.facing === 1 ? -1 : 1; return; }
  if (e === "death") { d.state = { kind: "dead", t: 0 }; return; }
  if (e === "parryUp") {
    if (d.state.kind === "parry") d.state = { kind: "ready" };
    return;
  }
  // Everything else only launches from ready - the PoC has no
  // interrupts; states run their course or are reset.
  if (d.state.kind !== "ready") return;
  switch (e) {
    case "stepFwd": d.state = { kind: "step", dir: 1, t: 0 }; break;
    case "stepBack": d.state = { kind: "step", dir: -1, t: 0 }; break;
    case "void": d.state = { kind: "void", t: 0 }; break;
    case "cut": d.state = { kind: "attack", attack: "cut", phase: "windup", elapsedMs: 0, timeline: attackTimeline(LONGSWORD, "cut") }; break;
    case "thrust": d.state = { kind: "attack", attack: "thrust", phase: "windup", elapsedMs: 0, timeline: attackTimeline(LONGSWORD, "thrust") }; break;
    case "parryDown": d.state = { kind: "parry", t: 0 }; break;
    case "hitstun": d.state = { kind: "hitstun", t: 0 }; break;
    case "bind": d.state = { kind: "bind" }; break;
    case "unarmed": d.state = { kind: "unarmed" }; break;
  }
}

const clampX = (x: number): number => Math.min(PISTE_HALF_CM, Math.max(-PISTE_HALF_CM, x));

/** Linear per-tick displacement, exactly 06's fighter.ts pattern. */
export function tick(d: Duelist, dtMs: number): void {
  const s = d.state;
  const w = LONGSWORD;
  switch (s.kind) {
    case "step": {
      const prev = Math.min(s.t, w.stepDurationMs);
      s.t += dtMs;
      const now = Math.min(s.t, w.stepDurationMs);
      d.x = clampX(d.x + ((now - prev) / w.stepDurationMs) * w.stepDistanceCm * s.dir * d.facing);
      if (s.t > w.stepDurationMs) d.state = { kind: "ready" };
      break;
    }
    case "void": {
      const prev = Math.min(s.t, w.voidDurationMs);
      s.t += dtMs;
      const now = Math.min(s.t, w.voidDurationMs);
      d.x = clampX(d.x - ((now - prev) / w.voidDurationMs) * w.voidDistanceCm * d.facing);
      if (s.t > w.voidDurationMs) d.state = { kind: "ready" };
      break;
    }
    case "attack": {
      s.elapsedMs += dtMs;
      const tl = s.timeline;
      if (s.elapsedMs >= tl.recoveryEnd) d.state = { kind: "ready" };
      else if (s.elapsedMs >= tl.recoveryStart) s.phase = "recovery";
      else if (s.elapsedMs >= tl.strikeStart) s.phase = "strike";
      break;
    }
    case "hitstun":
      s.t += dtMs;
      if (s.t > HIT_STUN_MS) d.state = { kind: "ready" };
      break;
    case "dead":
      s.t = Math.min(s.t + dtMs, DEATH_ANIM_MS); // holds the final pose
      break;
    case "parry":
      s.t += dtMs; // held until parryUp; t drives the rise-to-formed pose
      break;
    case "ready": case "bind": case "unarmed":
      break;
  }
}
