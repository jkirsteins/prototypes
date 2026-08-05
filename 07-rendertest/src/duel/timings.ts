/**
 * 06-dueling's longsword numbers, copied verbatim (see the spec's
 * transplant contract). Distances stay in centimeters like 06's engine;
 * the renderer converts at 0.01 m per cm.
 */

export type AttackKind = "cut" | "thrust";

export interface AttackTimings {
  windup: number; beat: number; strike: number; recovery: number;
}

export interface WeaponTimings {
  reachCm: number;
  stepDistanceCm: number; stepDurationMs: number;
  voidDistanceCm: number; voidDurationMs: number;
  attacks: Record<AttackKind, AttackTimings>;
}

export const LONGSWORD: WeaponTimings = {
  reachCm: 200,
  stepDistanceCm: 60, stepDurationMs: 260,
  voidDistanceCm: 100, voidDurationMs: 320,
  attacks: {
    cut:    { windup: 600, beat: 100, strike: 380, recovery: 420 },
    thrust: { windup: 440, beat: 60,  strike: 260, recovery: 300 },
  },
};

export const PARRYABLE_FRACTION = 0.5;
export const HIT_STUN_MS = 350;
export const DEATH_ANIM_MS = 900;
/** 06's guardShiftMs: the rise-to-formed travel of a parry. */
export const PARRY_FORM_MS = 180;

/** Field-for-field 06's AttackTimeline (weapons.ts). */
export interface AttackTimeline {
  riseStart: number; riseEnd: number; strikeStart: number;
  parryableUntil: number; strikeEnd: number;
  recoveryStart: number; recoveryEnd: number;
}

/** Same math as 06's attackTimeline (weapons.ts:159). */
export function attackTimeline(w: WeaponTimings, a: AttackKind): AttackTimeline {
  const t = w.attacks[a];
  const riseStart = 0;
  const riseEnd = riseStart + t.windup;
  const strikeStart = riseEnd + t.beat;
  const strikeEnd = strikeStart + t.strike;
  return {
    riseStart, riseEnd, strikeStart,
    parryableUntil: strikeStart + t.strike * PARRYABLE_FRACTION,
    strikeEnd,
    recoveryStart: strikeEnd,
    recoveryEnd: strikeEnd + t.recovery,
  };
}
