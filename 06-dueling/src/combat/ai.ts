import { zoneFor } from "./measure";
import { gapOf } from "./engine";
import type { Duel } from "./engine";
import type { AttackKind, Intent, WeaponProfile } from "./types";

export type AiMode = 0 | 1 | 2 | 3;

export const AI_REACTION_MS = 180;
/**
 * Mode 2 is a drill metronome: a fixed, weapon-independent onset beat to
 * train reads against, in real clock time. It must exceed the slowest
 * attack's whiff commitment for every weapon or the beat silently drifts
 * (an attack scheduled mid-recovery starts late); a test enforces this.
 */
export const DRILL_INTERVAL_MS = 2000;

/**
 * Mode 3's cycle floor. This is a structural guarantee, not a personality
 * knob: the cooldown runs concurrently with the attack, so it only shapes
 * behavior as a floor on the whole attack cycle - and the retire step can
 * only ever fire if that floor outlasts the thrust's worst-case (whiffed)
 * commitment. Deriving it from the weapon keeps the approach-strike-retire
 * pulse alive under any retuning. Personality-driven pacing, when it comes,
 * layers on top as fighter-cognition delays in plain milliseconds.
 */
export function duelistCooldown(w: WeaponProfile): number {
  const t = w.attacks.thrust;
  const whiffCommit = t.windup + t.beat + t.strike + t.recovery * w.whiffRecoveryFactor;
  return whiffCommit + w.stepDuration + w.stancePause;
}

export interface AiState {
  cooldown: number;
  next: AttackKind;
}

export function createAiState(): AiState {
  return { cooldown: 0, next: "thrust" };
}

/** Decides side 1's intent. Deterministic: no rng anywhere. */
export function aiDecide(d: Duel, mode: AiMode, ai: AiState, dt: number): Intent | null {
  if (mode === 0 || d.over) return null;
  const self = d.f[1];
  const opp = d.f[0];

  if (mode === 1) {
    if (opp.state.kind !== "attack") return null;
    // Read the threat, not the motion: neither fighter can move mid-attack,
    // so an attack launched from beyond the attacker's own reach can never
    // land. A fencer does not parry out-of-measure attacks; neither does
    // the dummy.
    if (gapOf(d) > opp.weapon.reach) return null;
    const { phase, t, attack, tell } = opp.state;
    if (phase === "recovery") return null;
    const w = opp.weapon.attacks[attack];
    const pre = tell ? opp.weapon.pretempo : 0;
    // Time since the attack became visible, and time left until the strike lands.
    const elapsed =
      phase === "pretempo" ? t :
      phase === "windup" ? pre + t :
      phase === "beat" ? pre + w.windup + t :
      pre + w.windup + w.beat + t;
    const remaining = pre + w.windup + w.beat + w.strike - elapsed;
    // Needs AI_REACTION_MS of visible attack to react, then times the parry
    // to intercept the lands-instant (not the windup - a parry raised at the
    // windup would expire before a slow cut arrives).
    if (
      elapsed >= AI_REACTION_MS &&
      remaining <= self.weapon.parryWindow * 0.75 &&
      self.state.kind === "idle" &&
      self.parryCd <= 0
    ) {
      return "parry";
    }
    return null;
  }

  // Modes 2 and 3 share the attack cooldown.
  ai.cooldown = Math.max(0, ai.cooldown - dt);
  if (self.state.kind !== "idle") return null;
  if (opp.state.kind === "dead") return null;
  const zone = zoneFor(gapOf(d), self.weapon);

  if (mode === 2) {
    // Attack in place, never step closer.
    if (ai.cooldown > 0 || zone === "out") return null;
    return startAttack(ai, DRILL_INTERVAL_MS);
  }

  // Mode 3, the duelist: approach until an extension can land (narrow
  // measure), strike, and back off out of danger while the weapon-derived
  // patience recovers - approach, strike, retire.
  if (zone !== "narrow") return "advance";
  if (ai.cooldown <= 0) return startAttack(ai, duelistCooldown(self.weapon));
  return "retreat";
}

function startAttack(ai: AiState, cooldown: number): AttackKind {
  const attack = ai.next;
  ai.next = attack === "thrust" ? "cut" : "thrust";
  ai.cooldown = cooldown;
  return attack;
}
