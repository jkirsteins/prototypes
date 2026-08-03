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
  // Two longswords: the stop is a bind since sustained-bind - the met
    // contact is the guard succeeding, and nobody is hit.
    expect(evs.some((e) => e.kind === "met" && e.side === 1)).toBe(true);
    expect(evs.some((e) => e.kind === "hit")).toBe(false);
  expect(d.over).toBe(false);
});

test("a cold press has no timer: it stands until released, and a tap-release drops it at once", () => {
  const d = createDuel(WEAPONS.longsword, WEAPONS.longsword);
  d.f[0].x = 1000;
  d.f[1].x = 1190;
  runMs(d, TICK, "parry", null); // nothing visible: predictive, unlatched
  runMs(d, 2000);
  expect(d.f[0].parry).not.toBe(null); // no window ever lapses it
  runMs(d, TICK, "parryRelease", null);
  expect(d.f[0].parry).toBe(null); // no latch: the release drops it now
  expect(d.f[0].parryRecoveryMs).toBeGreaterThan(0);
});

test("a feint cancellation ends the latched parry at recovery cost: the bait pays", () => {
  const d = createDuel(WEAPONS.longsword, WEAPONS.longsword);
  d.f[0].x = 1000;
  d.f[1].x = 1190;
  runMs(d, TICK, "cut", null); // player attacks: the threat
  runMs(d, 250 - TICK, null, null);
  runMs(d, TICK, null, "parry"); // AI-side press latches onto it
  expect(d.f[1].parry?.targetAttackStartTime).not.toBe(null);
  runMs(d, TICK, null, "parryRelease"); // a TAP: the release queues on the latch
  expect(d.f[1].parry).not.toBe(null); // still waiting for its attack
  runMs(d, TICK, "feint", null); // the attack is abandoned
  runMs(d, 2 * TICK);
  expect(d.f[1].parry).toBe(null); // the tapped guard fell with its target
  expect(d.f[1].parryRecoveryMs).toBeGreaterThan(0); // at full recovery price
});

test("a HELD key survives the feint: the latch clears and the guard stands", () => {
  const d = createDuel(WEAPONS.longsword, WEAPONS.longsword);
  d.f[0].x = 1000;
  d.f[1].x = 1190;
  runMs(d, TICK, "cut", null);
  runMs(d, 250 - TICK, null, null);
  runMs(d, TICK, null, "parry"); // pressed AND held: no release follows
  runMs(d, TICK, "feint", null);
  runMs(d, 4 * TICK);
  const p = d.f[1].parry;
  expect(p).not.toBe(null); // key-bound: the guard outlives its threat
  expect(p?.targetAttackStartTime).toBe(null); // engagement over, hold continues
});

test("a whiff releases the latched parry at resolution", () => {
  const d = createDuel(WEAPONS.longsword, WEAPONS.longsword);
  d.f[0].x = 1000;
  d.f[1].x = 1500; // visible but out of reach: the cut will whiff
  runMs(d, TICK, "cut", null);
  runMs(d, TICK, null, "parry");
  runMs(d, TICK, null, "parryRelease"); // a tap: release rides the latch
  const t = WEAPONS.longsword.attacks.cut;
  runMs(d, t.windup + t.beat + t.strike - 5 * TICK);
  expect(d.f[1].parry).not.toBe(null); // still waiting: the attack lives
  const evs = runMs(d, 8 * TICK);
  expect(evs.some((e) => e.kind === "whiff")).toBe(true);
  expect(d.f[1].parry).toBe(null);
  expect(d.f[1].parryRecoveryMs).toBeGreaterThan(0);
});
