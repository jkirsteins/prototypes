import { zoneFor } from "./measure";
import { gapOf } from "./engine";
import type { Duel } from "./engine";
import type { AttackKind, Intent } from "./types";

export type AiMode = 0 | 1 | 2 | 3;

export const AI_REACTION_MS = 180;
export const AI_ATTACK_COOLDOWN_MS = 1400;

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
    return startAttack(ai);
  }

  // Mode 3, the duelist: approach until an extension can land (narrow
  // measure), strike on the shared cooldown, and back off out of danger
  // while the cooldown recovers - approach, strike, retire.
  if (zone !== "narrow") return "advance";
  if (ai.cooldown <= 0) return startAttack(ai);
  return "retreat";
}

function startAttack(ai: AiState): AttackKind {
  const attack = ai.next;
  ai.next = attack === "thrust" ? "cut" : "thrust";
  ai.cooldown = AI_ATTACK_COOLDOWN_MS;
  return attack;
}
