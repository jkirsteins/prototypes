import { zoneFor } from "./measure";
import { gapOf } from "./engine";
import type { Duel } from "./engine";
import type { AttackKind, Intent } from "./types";

export type AiMode = 0 | 1 | 2;

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

  // mode 2: attack in place, never step closer
  ai.cooldown = Math.max(0, ai.cooldown - dt);
  if (self.state.kind !== "idle" || ai.cooldown > 0) return null;
  if (opp.state.kind === "dead") return null;
  if (zoneFor(gapOf(d), self.weapon) === "out") return null;
  const attack = ai.next;
  ai.next = attack === "thrust" ? "cut" : "thrust";
  ai.cooldown = AI_ATTACK_COOLDOWN_MS;
  return attack;
}
