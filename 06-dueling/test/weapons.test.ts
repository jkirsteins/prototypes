import { describe, expect, test } from "vitest";
import { PARRYABLE_FRACTION, WEAPONS, attackTimeline, counterTime, parryableMs } from "../src/combat/weapons";
import type { AttackKind } from "../src/combat/types";

const KINDS: AttackKind[] = ["cut", "thrust"];

describe("attack timeline snapshot", () => {
  // Every consumer (walker, AI, renderer, engine) reads these marks from
  // one object, so this is the single place their agreement is asserted.
  for (const w of Object.values(WEAPONS)) {
    for (const kind of KINDS) {
      for (const bonus of [0, w.telegraphMs]) {
        test(`${w.id} ${kind} marks are consistent (bonus ${bonus})`, () => {
          const t = w.attacks[kind];
          const tl = attackTimeline(w, kind, bonus);
          expect(tl.riseStart).toBe(bonus);
          expect(tl.riseEnd).toBe(bonus + t.windup);
          expect(tl.strikeStart).toBe(bonus + t.windup + t.beat);
          expect(tl.parryableUntil).toBe(tl.strikeStart + parryableMs(t));
          expect(tl.parryableUntil).toBe(tl.strikeStart + (tl.strikeEnd - tl.strikeStart) * PARRYABLE_FRACTION);
          expect(tl.strikeEnd).toBe(tl.strikeStart + t.strike);
          expect(tl.recoveryStart).toBe(tl.strikeEnd);
          expect(tl.recoveryEnd).toBe(tl.strikeEnd + t.recovery);
        });
      }
    }
  }
});

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
  // counterTime = fastest player counter (thrust, no telegraphMs): windup + beat + strike.
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
