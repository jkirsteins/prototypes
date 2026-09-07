import { describe, expect, it } from "vitest";
import { Rng } from "../src/rng";
import { calendar } from "../src/sim/calendar";
import { addItem } from "../src/sim/inventory";
import { newGame } from "../src/sim/newgame";
import { placeAtSpot } from "../src/sim/position";
import { regionState } from "../src/sim/regionstate";
import { setUpReference } from "../src/sim/reference";
import { LARGE_GAME } from "../src/sim/species";
import { startTask, stepTask } from "../src/sim/tasks";
import { regionAt } from "../src/world/gen";
import { runWinter, runYear } from "../src/sim/year";

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

  it("starts stats.killsKcal at zero", () => {
    const ref = setUpReference(17);
    expect(ref.state.stats.kills).toEqual({});
    expect(ref.state.stats.killsKcal).toBe(0);
  });

  /** Forces one elk kill by running the hunt task to completion, seed 3's home region having elk. Returns stats.killsKcal after the kill. */
  function killsKcalFromOneElk(startDoy: number): number {
    const { state, world } = newGame(3, startDoy);
    placeAtSpot(state, world, state.player.region, "forest");
    state.player.tools.push({ id: "bow", durability: 100 });
    addItem(state.player.pack, "arrow", 200);
    regionState(state, world, state.player.region).pop.elk = regionAt(world, state.player.region).capacity.elk;
    startTask(state, world, calendar(state.minute, state.startDoy), "hunt", "elk", true);
    const rng = new Rng(9);
    for (let m = 0; m < 240 * 60 && !state.stats.kills.elk; m++) stepTask(state, world, calendar(state.minute, state.startDoy), rng, 1);
    expect(state.stats.kills.elk).toBe(1);
    return state.stats.killsKcal;
  }

  // killsKcal comes from the actual yield of the kill, and an elk's fat is
  // seasonal (fatSeason), so the same kill credits less in a lean month
  // than at peak - a carcass in April is not a carcass in October.
  it("a kill in a lean month credits less into killsKcal than the same kill at peak", () => {
    const lean = killsKcalFromOneElk(90); // 1 April, month 3: fatSeason 0.2
    const peak = killsKcalFromOneElk(273); // 1 October, month 9: fatSeason 1
    expect(lean).toBeGreaterThan(0);
    expect(peak).toBeGreaterThan(lean);
  });
});
