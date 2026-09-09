import { describe, expect, it } from "vitest";
import { calendar } from "../src/sim/calendar";
import { GOALS } from "../src/sim/goals";
import { addItem } from "../src/sim/inventory";
import { newGame } from "../src/sim/newgame";
import { regionState } from "../src/sim/regionstate";
import { beginTask } from "../src/sim/tasks";
import { goalGuide, goalProgress } from "../src/ui/goalguide";
import { purposeOf, subtabOf } from "../src/ui/purpose";
import { siteCamp } from "./siting-helpers";

describe("goal guidance", () => {
  it("gives every goal one concise route or prompt", () => {
    const { state, world } = newGame(3);
    const cal = calendar(state.minute, state.startDoy);
    for (const goal of GOALS) {
      const guide = goalGuide(goal.id);
      expect(guide.reason.trim()).not.toBe("");
      expect(Boolean(guide.path) && Boolean(guide.prompt)).toBe(false);
      expect(goalProgress(state, world, cal, goal.id).target).toBeGreaterThan(0);
    }
  });

  it("points opening goals at the panes that own their actions", () => {
    expect(goalGuide("site").path).toBe(`${subtabOf("makeCamp")} > ${purposeOf("makeCamp")}`);
    expect(goalGuide("firewood").path).toBe(`${subtabOf("deadwood")} > ${purposeOf("deadwood")}`);
    expect(goalGuide("cook").path).toBe(`${subtabOf("cook")} > ${purposeOf("cook")}`);
  });

  it("turns fire prerequisites into visible progress", () => {
    const { state, world } = newGame(3);
    siteCamp(state, world);
    addItem(state.player.pack, "firewood", 2);
    state.player.tools.push({ id: "fireDrill", durability: 100 });
    const progress = goalProgress(state, world, calendar(state.minute, state.startDoy), "fire");
    expect(progress.target).toBe(3);
    expect(progress.steps.map((step) => [step.label, step.done])).toEqual([
      ["Site", false], ["Fuel", true], ["Ignition", true],
    ]);
  });

  it("shows continuous fire days rather than an inert one-shot", () => {
    const { state, world } = newGame(3);
    siteCamp(state, world);
    const st = regionState(state, world, state.player.region);
    st.fire.lit = true;
    st.fire.litSince = 0;
    state.minute = 36 * 60;
    const progress = goalProgress(state, world, calendar(state.minute, state.startDoy), "keptDays");
    expect(progress.at).toBe(1.5);
    expect(progress.target).toBe(3);
    expect(progress.unit).toBe("days");
  });

  it("shows shelter materials and only keeps the first dusk deadline", () => {
    const { state, world } = newGame(3);
    siteCamp(state, world);
    addItem(state.player.pack, "stick", 12);
    const firstDay = goalProgress(state, world, calendar(state.minute, state.startDoy), "bed");
    expect(firstDay.steps.map((step) => [step.label, step.done])).toEqual([["12 sticks", true], ["Bed", false]]);
    expect(firstDay.deadline).toBe("before dusk");
    expect(beginTask(state, world, calendar(state.minute, state.startDoy), "build", "boughBed")).toBe(true);
    expect(goalProgress(state, world, calendar(state.minute, state.startDoy), "bed").at).toBe(1);
    state.minute = 2 * 1440;
    expect(goalProgress(state, world, calendar(state.minute, state.startDoy), "bed").deadline).toBeUndefined();
  });
});
