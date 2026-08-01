import type { WeaponId, WeaponProfile } from "./types";

export const WEAPONS: Record<WeaponId, WeaponProfile> = {
  longsword: {
    id: "longsword",
    name: "Longsword",
    reach: 95,
    stepDistance: 34,
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
    voidDistance: 55,
    voidDuration: 320,
    identity: "The generalist: cuts and thrusts, strong in the bind.",
  },
  rapier: {
    id: "rapier",
    name: "Rapier",
    reach: 115,
    stepDistance: 28,
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
    voidDistance: 55,
    voidDuration: 320,
    identity: "The thrust specialist: fastest clean attack, bad in the bind.",
  },
};

/** Fastest counter a player can throw: thrust with no pretempo (tell-free). */
export function counterTime(w: WeaponProfile): number {
  const t = w.attacks.thrust;
  return t.windup + t.beat + t.strike;
}
