import { expect, test } from "vitest";
import { TICK } from "../src/combat/fighter";
import { createDuel, tickDuel } from "../src/combat/engine";
import { WEAPONS } from "../src/combat/weapons";
import type { Duel, DuelEvent } from "../src/combat/engine";
import type { Intent } from "../src/combat/types";

/**
 * The threat-latched parry: pressed against a visible attack, the guard
 * latches onto that attack's identity and waits for it - contact, miss,
 * cancellation or the attacker's death ends it. Only the predictive cold
 * press, with nothing to wait for, runs the timed window. The latch never
 * retargets; it holds the line it snapshotted.
 */

function runMs(d: Duel, ms: number, ia: Intent | null = null, ib: Intent | null = null): DuelEvent[] {
  const evs: DuelEvent[] = [];
  for (let t = 0; t < ms; t += TICK) {
    evs.push(...tickDuel(d, ia, ib));
    ia = null;
    ib = null;
  }
  return evs;
}

test("a latched parry outlives its window and meets the slow telegraphed cut", () => {
  const d = createDuel(WEAPONS.longsword, WEAPONS.longsword);
  d.f[0].x = 1000;
  d.f[1].x = 1190;
  // The AI cut shows 700ms of preparation; the player presses at once. The
  // 480ms window would have lapsed at 480 - the latch waits to the arrival.
  let evs = runMs(d, TICK, null, "cut");
  evs = evs.concat(runMs(d, TICK, "parry", null));
  evs = evs.concat(runMs(d, 1400));
  expect(evs.some((e) => e.kind === "parried" && e.side === 1)).toBe(true);
  expect(d.over).toBe(false);
});

test("a cold press has nothing to wait for: it expires on the window and the late attack lands", () => {
  const d = createDuel(WEAPONS.longsword, WEAPONS.longsword);
  d.f[0].x = 1000;
  d.f[1].x = 1190;
  let evs = runMs(d, TICK, "parry", null); // nothing visible: predictive
  evs = evs.concat(runMs(d, WEAPONS.longsword.parryWindowMs + TICK));
  expect(d.f[0].parry).toBe(null); // lapsed at the window
  evs = evs.concat(runMs(d, 2000, null, "cut"));
  expect(evs.some((e) => e.kind === "hit" && e.side === 1)).toBe(true);
});

test("a feint cancellation ends the latched parry at recovery cost: the bait pays", () => {
  const d = createDuel(WEAPONS.longsword, WEAPONS.longsword);
  d.f[0].x = 1000;
  d.f[1].x = 1190;
  runMs(d, TICK, "cut", null); // player attacks: the threat
  runMs(d, 250 - TICK, null, null);
  runMs(d, TICK, null, "parry"); // AI-side press latches onto it
  expect(d.f[1].parry?.targetAttackStartTime).not.toBe(null);
  runMs(d, TICK, "feint", null); // the attack is abandoned
  runMs(d, 2 * TICK);
  expect(d.f[1].parry).toBe(null); // the latched guard fell with its target
  expect(d.f[1].parryRecoveryMs).toBeGreaterThan(0); // at full recovery price
});

test("a whiff releases the latched parry at resolution", () => {
  const d = createDuel(WEAPONS.longsword, WEAPONS.longsword);
  d.f[0].x = 1000;
  d.f[1].x = 1500; // visible but out of reach: the cut will whiff
  runMs(d, TICK, "cut", null);
  runMs(d, TICK, null, "parry");
  const t = WEAPONS.longsword.attacks.cut;
  runMs(d, t.windup + t.beat + t.strike - 3 * TICK);
  expect(d.f[1].parry).not.toBe(null); // still waiting: the attack lives
  const evs = runMs(d, 6 * TICK);
  expect(evs.some((e) => e.kind === "whiff")).toBe(true);
  expect(d.f[1].parry).toBe(null);
  expect(d.f[1].parryRecoveryMs).toBeGreaterThan(0);
});
