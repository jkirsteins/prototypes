import { describe, expect, it } from "vitest";
import { Rng } from "../src/rng";
import { dailyAnimals, densityLabel } from "../src/sim/animals";
import { calendar } from "../src/sim/calendar";
import { newGame } from "../src/sim/newgame";
import { SPECIES } from "../src/sim/types";

describe("animals", () => {
  it("labels density in words", () => {
    expect(densityLabel(0)).toBe("none");
    expect(densityLabel(0.1)).toBe("tracks");
    expect(densityLabel(0.3)).toBe("few");
    expect(densityLabel(0.5)).toBe("some");
    expect(densityLabel(0.9)).toBe("many");
  });

  it("conserves land animals under migration and grows toward capacity in summer", () => {
    const { state, world } = newGame(5);
    const rng = new Rng(1);
    const total = (s: (typeof SPECIES)[number]) => state.regions.reduce((a, r) => a + r.pop[s], 0);
    const before = total("hare");
    const beforeDeer = total("deer");
    // Skip growth by doing one day in November.
    dailyAnimals(state, world, calendar(1440 * 220), rng);
    expect(total("hare")).toBeCloseTo(before, 6);
    expect(total("deer")).toBeCloseTo(beforeDeer, 6);
    // A summer day grows.
    const summerBefore = total("hare");
    dailyAnimals(state, world, calendar(1440 * 90), rng);
    expect(total("hare")).toBeGreaterThan(summerBefore);
  });

  it("never exceeds capacity by much and thins deer in winter", () => {
    const { state, world } = newGame(5);
    const rng = new Rng(2);
    for (let d = 0; d < 120; d++) dailyAnimals(state, world, calendar(1440 * d), rng);
    for (const r of world.regions) {
      for (const s of SPECIES) expect(state.regions[r.id].pop[s]).toBeLessThanOrEqual(r.capacity[s] * 1.05 + 1);
    }
    const deerBefore = state.regions.reduce((a, r) => a + r.pop.deer, 0);
    for (let d = 260; d < 300; d++) dailyAnimals(state, world, calendar(1440 * d), rng);
    expect(state.regions.reduce((a, r) => a + r.pop.deer, 0)).toBeLessThan(deerBefore);
  });
});
