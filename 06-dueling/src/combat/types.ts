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
export type Intent =
  | "advance" | "retreat" | "void" | "cut" | "thrust" | "parry" | "feint"
  | "stanceUp" | "stanceDown";

/**
 * A line is a pair. Height comes from the attacker's held stance at launch;
 * side is declared per attack. The full enum is modelled even where
 * gameplay exposes only part of it: `middle` is currently unreachable by
 * the arrows, and side is coupled to the attack kind - but nothing may
 * infer either from the kind, so an inside cut or a middle stance is a
 * data change, not a new concept.
 */
export type Height = "high" | "middle" | "low";
export type Side = "inside" | "outside";
export interface Line { height: Height; side: Side; }

export interface AttackTimings {
  windup: number;
  beat: number;
  strike: number;
  recovery: number;
  /** which side of the blade the attack travels: declared, never inferred */
  side: Side;
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
  /** the stance's travel between heights; must exceed parryRiseMs or the wrong height costs nothing */
  heightChangeMs: number;
  /** the blade's rotation to the other side; must stay under parryRiseMs so a reactive press is gated by the rise alone */
  sideChangeMs: number;
  /** the guard's travel: visible from the press, effective only after this */
  parryRiseMs: number;
  parryWindowMs: number;
  /** how long after a spent parry the next one is available; gates only the parry */
  parryRecoveryMs: number;
  /** recovery after abandoning a windup (a feint): the price of selling a threat */
  feintRecoveryMs: number;
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
