import { describe, expect, it } from "vitest";
import { enableHuntAudit, finishHuntAudit, noteHuntAttempt, notePopulationChange } from "../src/sim/hunt-audit";
import { setUpReference } from "../src/sim/reference";

describe("hunt audit", () => {
  it("reconciles a hunted population from explicit ecological flows", () => {
    const { state, world } = setUpReference(19, true);
    enableHuntAudit(state, world);
    const region = state.player.region;
    const cell = world.start;
    notePopulationChange(state, world, region, "elk", "birth", 2);
    notePopulationChange(state, world, region, "elk", "immigration", 1.5);
    notePopulationChange(state, world, region, "elk", "emigration", 0.5);
    notePopulationChange(state, world, region, "elk", "naturalDeath", 1);
    noteHuntAttempt(state, world, { species: "elk", region, cell, populationBefore: 6, odds: 0.4, pressureFactor: 0.75, success: true, minutes: 240 });

    const report = finishHuntAudit(state, world);
    const flow = report.populations.find((x) => x.region === region && x.species === "elk")!;
    expect(flow.births).toBe(2);
    expect(flow.immigration).toBe(1.5);
    expect(flow.emigration).toBe(0.5);
    expect(flow.naturalDeaths).toBe(1);
    expect(flow.huntDeaths).toBe(1);
    expect(report.attempts).toHaveLength(1);
    expect(report.huntMinutes).toBe(240);
  });
});
