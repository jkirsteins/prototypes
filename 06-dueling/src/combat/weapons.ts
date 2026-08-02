import type { AttackTimings, WeaponId, WeaponProfile } from "./types";

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
    stancePause: 90,
    pretempo: 180,
    attacks: {
      cut:    { windup: 420, beat: 100, strike: 380, recovery: 420 },
      thrust: { windup: 260, beat: 60,  strike: 260, recovery: 300 },
    },
    parryWindow: 260,
    parryCooldown: 340,
    parriedPenalty: 290,
    whiffRecoveryFactor: 2.0,
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
    stancePause: 70,
    pretempo: 140,
    attacks: {
      cut:    { windup: 320, beat: 80, strike: 300, recovery: 400 },
      thrust: { windup: 200, beat: 60, strike: 220, recovery: 260 },
    },
    parryWindow: 200,
    parryCooldown: 400,
    parriedPenalty: 360,
    whiffRecoveryFactor: 3.0,
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

/** Fastest counter a player can throw: thrust with no pretempo (tell-free). */
export function counterTime(w: WeaponProfile): number {
  const t = w.attacks.thrust;
  return t.windup + t.beat + t.strike;
}
