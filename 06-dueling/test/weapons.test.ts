import { describe, expect, test } from "vitest";
import { WEAPONS, counterTime } from "../src/combat/weapons";
import type { AttackKind } from "../src/combat/types";

const KINDS: AttackKind[] = ["cut", "thrust"];

describe("weapon identity", () => {
  test("rapier outranges and outpaces the longsword", () => {
    expect(WEAPONS.rapier.reach).toBeGreaterThan(WEAPONS.longsword.reach);
    expect(WEAPONS.rapier.animSpeed).toBeGreaterThan(WEAPONS.longsword.animSpeed);
    expect(WEAPONS.rapier.stepDuration).toBeLessThan(WEAPONS.longsword.stepDuration);
    expect(WEAPONS.rapier.attacks.thrust.windup).toBeLessThan(WEAPONS.longsword.attacks.thrust.windup);
  });
  test("rapier cut is a poor option vs its thrust", () => {
    expect(WEAPONS.rapier.attacks.cut.windup).toBeGreaterThan(WEAPONS.rapier.attacks.thrust.windup);
    expect(WEAPONS.rapier.attacks.cut.recovery).toBeGreaterThan(WEAPONS.rapier.attacks.thrust.recovery);
  });
});

describe("counter-window arithmetic (the doc's tempo economics)", () => {
  // counterTime = fastest player counter (thrust, no pretempo): windup + beat + strike.
  for (const atk of Object.values(WEAPONS)) {
    for (const def of Object.values(WEAPONS)) {
      for (const kind of KINDS) {
        const t = atk.attacks[kind];
        test(`${def.id} thrust counters ${atk.id} whiffed ${kind}`, () => {
          expect(t.recovery * atk.whiffRecoveryFactor).toBeGreaterThan(counterTime(def));
        });
        test(`${def.id} thrust counters ${atk.id} parried ${kind} (dui tempi)`, () => {
          expect(t.recovery + atk.parriedPenalty).toBeGreaterThan(counterTime(def));
        });
        test(`void beats parry: bigger window after ${atk.id} whiffed ${kind}`, () => {
          expect(t.recovery * atk.whiffRecoveryFactor).toBeGreaterThan(t.recovery + atk.parriedPenalty);
        });
      }
    }
  }
});
