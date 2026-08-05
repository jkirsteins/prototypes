import { describe, expect, test } from "vitest";
import {
  BULLET_IN_MS, BULLET_OUT_MS, BULLET_TIME_SCALE,
  BULLET_AFTERMATH_SCALE, BULLET_DEEPEN_MS,
  advanceBulletTime, bulletTimeActive, bulletTimeScale, createBulletTime,
} from "../src/ui/bullettime";
import { BIND_ADVANTAGE_MS, createDuel } from "../src/combat/engine";
import { WEAPONS } from "../src/combat/weapons";

/**
 * Bullet time is a presentation-layer wall-clock easing (main.ts scales
 * the accumulator feed by it while a bind runs). The simulation never
 * sees it, so these tests pin only the controller's own contract: the
 * curve in, the curve out, the edge cues, and the depth.
 */
describe("bullet time controller", () => {
  test("the depth keeps a clear slowdown without deadening the tap tempo", () => {
    expect(BULLET_TIME_SCALE).toBeLessThanOrEqual(0.5);
    expect(BULLET_TIME_SCALE).toBeGreaterThan(0);
  });

  test("curves in over BULLET_IN_MS: monotonic, soft at both ends, lands at full depth", () => {
    const bt = createBulletTime();
    expect(bulletTimeScale(bt)).toBe(1);
    const scales: number[] = [];
    for (let t = 0; t < BULLET_IN_MS; t += 16) {
      advanceBulletTime(bt, 16, "bind");
      scales.push(bulletTimeScale(bt));
    }
    for (let i = 1; i < scales.length; i++) expect(scales[i]).toBeLessThanOrEqual(scales[i - 1]);
    // Smoothstep shaping: the first step barely moves, the middle moves fast.
    expect(1 - scales[0]).toBeLessThan(0.01);
    expect(scales[scales.length - 1]).toBeCloseTo(BULLET_TIME_SCALE, 5);
    // Saturates: more time in the bind digs no deeper.
    advanceBulletTime(bt, 1000, "bind");
    expect(bulletTimeScale(bt)).toBeCloseTo(BULLET_TIME_SCALE, 10);
  });

  test("curves out over BULLET_OUT_MS back to real time", () => {
    const bt = createBulletTime();
    advanceBulletTime(bt, BULLET_IN_MS + 100, "bind"); // fully in
    const scales: number[] = [];
    for (let t = 0; t < BULLET_OUT_MS; t += 16) {
      advanceBulletTime(bt, 16, "off");
      scales.push(bulletTimeScale(bt));
    }
    for (let i = 1; i < scales.length; i++) expect(scales[i]).toBeGreaterThanOrEqual(scales[i - 1]);
    advanceBulletTime(bt, 16, "off");
    expect(bulletTimeScale(bt)).toBe(1);
  });

  test("slowed time covers the bind AND its aftermath, and releases on a decided duel", () => {
    // The aftermath - a fighter exposed, or holding the bind advantage -
    // is the kill-or-escape beat the slowdown exists to make readable; an
    // earlier cut released time at resolution and the winner's thrust
    // landed at full speed, unseen.
    expect(bulletTimeActive(null)).toBe(false);
    const d = createDuel(WEAPONS.longsword, WEAPONS.longsword);
    expect(bulletTimeActive(d)).toBe(false);
    d.f[1].state = { kind: "exposed", t: 0, contact: { kind: "guard", settledMs: 0 }, lineSide: "inside" };
    expect(bulletTimeActive(d)).toBe(true); // the loser is still turned out
    d.f[1].state = { kind: "ready" };
    d.f[0].bindAdvantageMs = BIND_ADVANTAGE_MS;
    expect(bulletTimeActive(d)).toBe(true); // the winner's opening still lives
    d.f[0].bindAdvantageMs = 0;
    expect(bulletTimeActive(d)).toBe(false);
    d.f[0].bindAdvantageMs = BIND_ADVANTAGE_MS;
    d.over = true;
    expect(bulletTimeActive(d)).toBe(false); // a decided duel eases out through the death
  });

  test("edges fire exactly once, at the transition, in both directions", () => {
    const bt = createBulletTime();
    expect(advanceBulletTime(bt, 16, "off")).toBe(null);
    expect(advanceBulletTime(bt, 16, "bind")).toBe("enter");
    expect(advanceBulletTime(bt, 16, "bind")).toBe(null);
    expect(advanceBulletTime(bt, 16, "off")).toBe("exit");
    expect(advanceBulletTime(bt, 16, "off")).toBe(null);
    // A bind that ends mid-curve still exits cleanly from wherever it was.
    expect(advanceBulletTime(bt, 16, "bind")).toBe("enter");
    expect(advanceBulletTime(bt, 16, "off")).toBe("exit");
    expect(bulletTimeScale(bt)).toBeLessThanOrEqual(1);
  });

  test("the aftermath deepens the already-running slowdown to its own floor, then releases clean", () => {
    const bt = createBulletTime();
    advanceBulletTime(bt, BULLET_IN_MS + 100, "bind"); // fully in at the bind's floor
    expect(bulletTimeScale(bt)).toBeCloseTo(BULLET_TIME_SCALE, 5);
    advanceBulletTime(bt, BULLET_DEEPEN_MS / 2, "aftermath"); // deepening, mid-curve
    const mid = bulletTimeScale(bt);
    expect(mid).toBeLessThan(BULLET_TIME_SCALE);
    expect(mid).toBeGreaterThan(BULLET_AFTERMATH_SCALE);
    advanceBulletTime(bt, BULLET_DEEPEN_MS, "aftermath"); // fully deep
    expect(bulletTimeScale(bt)).toBeCloseTo(BULLET_AFTERMATH_SCALE, 5);
    // The choice's window: 3x the wall time the bind's floor would give.
    expect(BULLET_TIME_SCALE / BULLET_AFTERMATH_SCALE).toBeCloseTo(3, 5);
    // Exit: the main level eases the scale back to 1 from the deep floor
    // (no pop), and once fully out the depth resets for the next bind.
    advanceBulletTime(bt, 16, "off");
    expect(bulletTimeScale(bt)).toBeLessThan(1);
    advanceBulletTime(bt, BULLET_OUT_MS + 100, "off");
    expect(bulletTimeScale(bt)).toBeCloseTo(1, 5);
    expect(bt.depth).toBe(0);
  });

  test("the bind itself never deepens: only the aftermath does", () => {
    const bt = createBulletTime();
    advanceBulletTime(bt, BULLET_IN_MS + 1000, "bind");
    expect(bt.depth).toBe(0);
    expect(bulletTimeScale(bt)).toBeCloseTo(BULLET_TIME_SCALE, 5);
  });

});
