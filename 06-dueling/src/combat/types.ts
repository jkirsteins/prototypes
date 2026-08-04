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
  | "stanceUp" | "stanceDown"
  /** the advantage's second conversion: take the sword (disarming spec) */
  | "disarm"
  /** keyup: lower the held guard (queued while its latch is engaged) */
  | "parryRelease"
  /** horizontal arrows: re-aim a held guard's side at the visible attack */
  | "sideShift"
  /**
   * The bind actions, on the attack keys - during a bind the engine reads
   * cut as press (one pressure pulse) and thrust as yield (one committed
   * yield attempt), so no new bindings exist. Hold is the absence of an
   * intent, not one.
   */
  | "press"
  | "yield";

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

/**
 * One side's part of a bind contact, snapshotted on the entry tick BEFORE
 * the attack and parry states are discarded. Firmness derives from this;
 * it cannot be recomputed later, because the states it reads are gone.
 * Lives here (not in engine.ts) so the fighter's exposed state can carry
 * the pose it was frozen in without an import cycle.
 */
export type BindContact =
  | { kind: "strike"; progress: number } // 0..1 through the travelling half
  /** held-guard's settled clock at contact: how long the covered line had
   *  been effective. A completed guard shift resets it, so a guard that
   *  just corrected a feint reads as freshly set. */
  | { kind: "guard"; settledMs: number };

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
  attacks: Record<AttackKind, AttackTimings>;
  /** the stance's travel between heights; must exceed firmUpMs or the wrong height costs nothing */
  heightChangeMs: number;
  /** the blade's rotation to the other side; with firmUpMs it decides the wrong-side press via guardFormationMs's max */
  sideChangeMs: number;
  /** redirecting an attack's height mid-windup: the larger lie, priced above the side's */
  redirectHeightMs: number;
  /** redirecting an attack's side mid-windup: the disengage's motion */
  redirectSideMs: number;
  /** a formed guard travelling to the other height: cheaper than a cold stance move, dearer than the rotation */
  guardShiftMs: number;
  /**
   * Firming a blade that already RESTS in a line (stance height +
   * guardSide) into an engaged, braced guard: grip, structure, point
   * orientation. The floor of guardFormationMs's max - travels to any
   * OTHER line cost their own time on top. Named for what it is: the
   * sword was never fully down, so there is no "rise" from nothing.
   */
  firmUpMs: number;
  /** how long after a spent parry the next one is available; gates only the parry */
  parryRecoveryMs: number;
  /** recovery after abandoning a windup (a feint): the price of selling a threat */
  feintRecoveryMs: number;
  /** added to this weapon's recovery when its attack is parried */
  parriedPenalty: number;
  /** multiplies this weapon's recovery when its attack whiffs */
  whiffRecoveryFactor: number;
  /**
   * Relative lateral stiffness of the blade: how much sideways force it
   * can exert and receive without buckling (longsword 1.0 is the anchor).
   * A physical property, not a capability flag - whether a CONTACT can be
   * sustained is derived pairwise from both blades' stiffness by
   * contact.canBind, so new swords get their bind combinations from this
   * number alone and never from a table.
   */
  bladeStiffness: number;
  /**
   * In-bind handling properties, physical facts like stiffness - never
   * capabilities. Every in-bind consequence (pulse shape, control speed,
   * yield zones, durations, requirements) is derived pairwise from these
   * in src/combat/bind.ts; no flag, branch or table may shortcut them.
   */
  /** how much force one pressure pulse transmits (longsword 1.0 anchor) */
  bindAuthority: number;
  /** how quickly pressure is applied and recovered from */
  bindHandling: number;
  /** how quickly and precisely the blade yields around a contact */
  rotationalControl: number;
  /** sprite playback multiplier: the feel knob */
  animSpeed: number;
  voidDistance: number;
  voidDuration: number;
  identity: string;
}
