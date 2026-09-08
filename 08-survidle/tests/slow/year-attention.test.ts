/**
 * The attention count carried by a real year report: forty days simulated at
 * level 20, which is half a minute, so it sits behind `npm run test:slow`
 * rather than taxing every commit. tests/year.test.ts keeps the cheap checks
 * over the same report, and tests/reference.test.ts the attention count of a
 * reference run.
 */
import { describe, expect, it } from "vitest";
import { runYear } from "../../src/sim/year";

describe("the year report's attention", () => {
  it("carries the whole run's attention and each month line its own, both mornings of days shapes", () => {
    const r = runYear(17, { level: 20, days: 40 });
    expect(r.attention.days).toBe(r.outcome.day);
    expect(r.attention.mornings).toBeGreaterThanOrEqual(0);
    expect(r.attention.mornings).toBeLessThanOrEqual(r.attention.days);
    expect(r.months.length).toBeGreaterThan(0);
    for (const m of r.months) {
      expect(m.attention.days).toBeGreaterThan(0);
      expect(m.attention.mornings).toBeGreaterThanOrEqual(0);
      expect(m.attention.mornings).toBeLessThanOrEqual(m.attention.days);
    }
  }, 60000);
});
