import { describe, expect, it } from "vitest";
import { FOODS } from "../src/sim/items";
import { setUpReference } from "../src/sim/reference";
import { LARGE_GAME, SPECIES_DEFS } from "../src/sim/species";
import { largeGameKcal, runWinter, runYear } from "../src/sim/year";

describe("the year script", () => {
  it("runs a kitted level-20 survivor from 1 April and reports months, the surplus days and the outcome", () => {
    const r = runYear(17, { level: 20, days: 40 });
    expect(r.seed).toBe(17);
    expect(r.level).toBe(20);
    expect(r.outcome.kind === "died" || r.outcome.kind === "reached").toBe(true);
    // 1 April to day 40 crosses 1 May: one month line.
    expect(r.months.length).toBe(1);
    expect(r.months[0].month).toBe(4);
    expect(r.months[0].eatenPerDay).toBeGreaterThanOrEqual(0);
    expect(r.months[0].burnPerDay).toBeGreaterThan(1000);
    expect(typeof r.months[0].stock.firewoodKg).toBe("number");
    expect(r.surplus.hang === null || r.surplus.hang >= 1).toBe(true);
    expect(r.surplus.largeGame === null || r.surplus.largeGame >= 1).toBe(true);
  });

  it("starts a fresh run at level 1 with the arrival kit only", () => {
    const r = runYear(17, { fresh: true, days: 3 });
    expect(r.level).toBe(1);
    expect(r.kitted).toBe(false);
  });

  it("stocks a December camp for the winter gate", () => {
    const r = runWinter(17, 2);
    expect(r.startDoy).toBe(334);
    expect(r.kitted).toBe(true);
    expect(r.stocked).toEqual({ driedMeatKg: 80, fatKg: 20, firewoodKg: 600, logs: 300 });
  });

  // The stock's fat is what the lean ceiling makes necessary: a lean-only
  // larder feeds 1,600 kcal a day whatever it holds, and the stocked camp
  // starved beside 246,000 kcal of dried meat until the fat went in.
  it("stocks the December camp with rendered fat beside the dried meat", () => {
    const r = runWinter(17, 2);
    expect(r.stocked?.fatKg).toBeGreaterThan(0);
  });

  it("names the large game the surplus day is read from", () => {
    expect(LARGE_GAME).toEqual(["deer", "reindeer", "elk"]);
  });

  it("reads one elk kill into killsKcal as raw meat plus fat", () => {
    const ref = setUpReference(17);
    expect(ref.state.stats.kills).toEqual({});
    ref.state.stats.kills.elk = 1;
    const kills = { ...ref.state.stats.kills };
    expect(kills.elk).toBe(1);
    const y = SPECIES_DEFS.elk.yields!;
    expect(largeGameKcal(kills)).toBe(y.meatKg * FOODS.rawMeat.kcalPerKg + (y.fatKg ?? 0) * FOODS.fat.kcalPerKg);
  });
});
