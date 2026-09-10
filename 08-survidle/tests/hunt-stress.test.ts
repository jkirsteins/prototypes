import { describe, expect, it } from "vitest";
import { runPersistentHuntStress } from "../src/sim/hunt-stress";

describe("persistent local hunting stress", () => {
  it("accounts for every elk while repeatedly hunting one cell", () => {
    const report = runPersistentHuntStress(79, 30, 3);
    const expected = report.starting + report.births + report.growth + report.immigration
      - report.emigration - report.naturalDeaths - report.predationDeaths - report.kills;
    expect(report.ending).toBeCloseTo(expected, 6);
    expect(report.attempts).toBe(90);
  });
});
