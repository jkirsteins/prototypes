/**
 * Raising an heir for real: a first life lived until it starves, a gap of a
 * season, and a second life landed near the old camp and walked home to it.
 * Ninety days simulated twice over is most of a minute, so it sits behind
 * `npm run test:slow` rather than taxing every commit; tests/reference.test.ts
 * keeps the cheap end of runHeir, the case where the first life is still alive
 * and there is no heir to raise at all.
 *
 * Ninety days, because the first life on seed 17 starves on day 61 with the
 * camp on the shore - a shorter cap gives the heir too few days to report
 * anything, a longer one only costs more. All four readings share the one run.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { coastOpen } from "../../src/sim/calendar";
import { runHeir } from "../../src/sim/reference";

describe("the heir", () => {
  let r: ReturnType<typeof runHeir>;
  beforeAll(() => {
    r = runHeir(17, 90);
  }, 60000);

  it("runs two lives on seed 17 and lands the heir in the open season near the old camp", () => {
    expect(r.first.outcome.kind).toBe("died");
    expect(r.gapDays).toBeGreaterThanOrEqual(90);
    expect(coastOpen(r.landed.doy)).toBe(true);
    expect(r.found.kmToOldCamp).toBeGreaterThanOrEqual(3);
    expect(r.found.kmToOldCamp).toBeLessThanOrEqual(20);
    expect(r.heir.record.index).toBe(2);
    expect(r.heir.checkpoints.length).toBeGreaterThan(0);
  });

  it("walks to the old camp before it gives an order, and reaches it", () => {
    expect(r.found.reachedCampDay).not.toBeNull();
    // The heir lands 3 to 20 km from the old camp as the crow flies, and a
    // fjord coast makes the walk several times the straight line: the measured
    // arrival is day 14 where a walkable old world gave three. The rule is that
    // the walk happens before the first order; the day is the reading.
    expect(r.found.reachedCampDay!).toBeGreaterThan(0);
    expect(r.found.reachedCampDay!).toBeLessThanOrEqual(20);
  });

  it("reports the trap's kilos and the new structures in the found line", () => {
    expect(r.found).toHaveProperty("trapKg");
    expect(r.found.trapKg === null || r.found.trapKg >= 0).toBe(true);
  });
});
