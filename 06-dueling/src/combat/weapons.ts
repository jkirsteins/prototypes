import type { AttackKind, AttackTimings, WeaponId, WeaponProfile } from "./types";

/**
 * All distances are centimeters of real-world scale: the fighter sprite's
 * body reads as a ~175 cm person, so effective reach (body center to point
 * at full extension), step lengths and the void hop are chosen as plausible
 * physical values. The renderer converts at PX_PER_CM (0.5 canvas px per cm).
 * Durations are milliseconds, unchanged by the unit choice.
 */
export const WEAPONS: Record<WeaponId, WeaponProfile> = {
  longsword: {
    id: "longsword",
    name: "Longsword",
    reach: 200,
    stepDistance: 60,
    stepDuration: 260,
    stepRecoveryMs: 90,
    telegraphMs: 180,
    attacks: {
      cut:    { windup: 420, beat: 100, strike: 380, recovery: 420, side: "outside" },
      thrust: { windup: 260, beat: 60,  strike: 260, recovery: 300, side: "inside" },
    },
    heightChangeMs: 300,
    sideChangeMs: 120,
    redirectHeightMs: 380,
    redirectSideMs: 300,
    guardShiftMs: 180,
    parryRiseMs: 220,
    parryRecoveryMs: 340,
    feintRecoveryMs: 160,
    parriedPenalty: 290,
    whiffRecoveryFactor: 2.0,
    bindCapable: true,
    animSpeed: 0.85,
    voidDistance: 100,
    voidDuration: 320,
    identity: "The generalist: cuts and thrusts, strong in the bind.",
  },
  rapier: {
    id: "rapier",
    name: "Rapier",
    reach: 240,
    stepDistance: 50,
    stepDuration: 200,
    stepRecoveryMs: 70,
    telegraphMs: 140,
    attacks: {
      cut:    { windup: 320, beat: 80, strike: 300, recovery: 400, side: "outside" },
      thrust: { windup: 200, beat: 60, strike: 220, recovery: 260, side: "inside" },
    },
    // 270, not 260: at 260 a wrong-stance answer to the rapier thrust
    // lands EXACTLY on the deadline (250+260 = 510 = its meetable end),
    // making the matrix's one documented failure a coin flip on a tick
    // boundary. The failure must fail.
    heightChangeMs: 270,
    sideChangeMs: 100,
    redirectHeightMs: 350,
    redirectSideMs: 220,
    guardShiftMs: 150,
    parryRiseMs: 190,
    parryRecoveryMs: 400,
    feintRecoveryMs: 120,
    parriedPenalty: 360,
    whiffRecoveryFactor: 3.0,
    bindCapable: false,
    animSpeed: 1.15,
    voidDistance: 100,
    voidDuration: 320,
    identity: "The thrust specialist: fastest clean attack, bad in the bind.",
  },
};

/**
 * The strike splits in two equal halves, and the blade can only be met in
 * the first: while it is travelling, not once it has arrived. The renderer
 * gives each half its own frame, so the parryable interval is legible from
 * the animation alone - the moment the sword reaches its delivered pose,
 * the chance to meet it is gone. Keep this in step with the strike frame
 * plan in render/frames.ts (a test asserts they agree).
 */
export const PARRYABLE_FRACTION = 0.5;

/** How long after the strike begins the blade can still be met. */
export function parryableMs(t: AttackTimings): number {
  return t.strike * PARRYABLE_FRACTION;
}

/** Fastest counter a player can throw: thrust with no telegraph (tell-free). */
export function counterTime(w: WeaponProfile): number {
  const t = w.attacks.thrust;
  return t.windup + t.beat + t.strike;
}

/**
 * One attack's boundaries, absolute ms from attack start. Computed once
 * when the attack begins and stored on it, so the walker, the AI and the
 * renderer read the same snapshot instead of each re-deriving boundaries
 * from the live profile - agreement by construction. Never mutated in
 * place: the engine replaces the object atomically when the strike
 * resolves (whiff, parried), the single write site.
 */
export interface AttackTimeline {
  /** The blade starts rising: the windup DuelEvent and the rise cue. */
  riseStart: number;
  /** The rise ends; the pre-strike stillness begins. Presentation mark. */
  riseEnd: number;
  /** The blade starts travelling: swing event, first meetable instant. */
  strikeStart: number;
  /** Last instant a parry can meet the blade. */
  parryableUntil: number;
  /** The strike resolves: hit, parried or whiff. */
  strikeEnd: number;
  /** == strikeEnd, until a cancellation mechanic moves it earlier. */
  recoveryStart: number;
  /** Rewritten at resolution: whiff multiplies, parried adds. */
  recoveryEnd: number;
}

export function attackTimeline(w: WeaponProfile, a: AttackKind, windupBonusMs: number): AttackTimeline {
  const t = w.attacks[a];
  const riseStart = windupBonusMs;
  const riseEnd = riseStart + t.windup;
  const strikeStart = riseEnd + t.beat;
  const strikeEnd = strikeStart + t.strike;
  return {
    riseStart, riseEnd, strikeStart,
    parryableUntil: strikeStart + parryableMs(t),
    strikeEnd,
    recoveryStart: strikeEnd,
    recoveryEnd: strikeEnd + t.recovery,
  };
}
