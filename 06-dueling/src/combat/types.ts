export type WeaponId = "longsword" | "rapier";
export type AttackKind = "cut" | "thrust";
/**
 * A phase exists only if it owns a distinct combat invariant. windup:
 * committed but not dangerous, not meetable. strike: meetable in its first
 * PARRYABLE_FRACTION, resolves at its end. recovery: exposed, nothing
 * accepted. Presentation boundaries inside the windup (the AI's telegraph,
 * the rise, the pre-strike stillness) are AttackTimeline marks, not phases.
 */
export type AttackPhase = "windup" | "strike" | "recovery";
export type Zone = "out" | "wide" | "narrow";
export type Intent = "advance" | "retreat" | "void" | "cut" | "thrust" | "parry";

export interface AttackTimings {
  windup: number;
  beat: number;
  strike: number;
  recovery: number;
}

export interface WeaponProfile {
  id: WeaponId;
  name: string;
  /** world px; a strike lands if the gap at strike-end is <= reach */
  reach: number;
  stepDistance: number;
  stepDuration: number;
  /** settle after a step before the next action starts; a parry may still be raised during it */
  stepRecoveryMs: number;
  /** extra windup on AI attacks: the telegraph the player reads */
  telegraphMs: number;
  attacks: Record<AttackKind, AttackTimings>;
  parryWindowMs: number;
  /** how long after a spent parry the next one is available; gates only the parry */
  parryRecoveryMs: number;
  /** added to this weapon's recovery when its attack is parried */
  parriedPenalty: number;
  /** multiplies this weapon's recovery when its attack whiffs */
  whiffRecoveryFactor: number;
  /** sprite playback multiplier: the feel knob */
  animSpeed: number;
  voidDistance: number;
  voidDuration: number;
  identity: string;
}
