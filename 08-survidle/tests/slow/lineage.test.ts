/**
 * The full three-life lineage run: a quarter of a year simulated three times
 * over, which is most of a minute. It sits behind `npm run test:slow` rather
 * than taxing every commit; tests/reference.test.ts keeps the cheap shape
 * checks over the same machinery.
 */
import { describe, expect, it } from "vitest";
import { coastOpen } from "../../src/sim/calendar";
import { runLineage } from "../../src/sim/reference";

describe("the lineage", () => {
  it("runs three lives on seed 17, each landing after a gap and reporting what it found", () => {
    const r = runLineage(17, 250, 3);
    expect(r.seed).toBe(17);
    expect(r.lives.length).toBe(3);
    expect(r.lives[0].index).toBe(1);
    expect(r.lives[0].gapDays).toBe(0);
    expect(r.lives[0].found).toBeNull();
    for (const life of r.lives.slice(1)) {
      expect(life.gapDays).toBeGreaterThanOrEqual(90);
      expect(coastOpen(life.landed.doy)).toBe(true);
      expect(life.found).not.toBeNull();
      expect(life.found!.structures).toContain("firePit");
      expect(typeof life.found!.logs).toBe("number");
    }
    for (const life of r.lives) {
      expect(life.report.surplus.hang === null || life.report.surplus.hang >= 1).toBe(true);
    }
  }, 60000);
});
