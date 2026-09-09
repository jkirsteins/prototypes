import { describe, expect, it } from "vitest";
import { advance } from "../src/sim/advance";
import { calendar } from "../src/sim/calendar";
import { GOALS } from "../src/sim/goals";
import { addItem } from "../src/sim/inventory";
import { newGame } from "../src/sim/newgame";
import { placeAt } from "../src/sim/position";
import { regionState, siteFor } from "../src/sim/regionstate";
import { beginTask, check, startTask } from "../src/sim/tasks";
import { goalGuide, goalProgress } from "../src/ui/goalguide";
import { purposeOf, subtabOf } from "../src/ui/purpose";
import { neighbourLandCell, siteCamp } from "./siting-helpers";

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

  it("counts open ground as a ready fire site when a field light is legal", () => {
    const { state, world } = newGame(3);
    state.weather.precip = "none";
    addItem(state.player.pack, "fireDrill", 1);
    addItem(state.player.pack, "firewood", 2);
    const cal = calendar(state.minute, state.startDoy);
    expect(check(state, world, cal, "light").ok).toBe(true);
    expect(goalProgress(state, world, cal, "fire").steps.map((step) => [step.label, step.done])).toEqual([
      ["Site", true], ["Fuel", true], ["Ignition", true],
    ]);
  });

  it("does not count a distant camp fire pit as the current field site", () => {
    const { state, world } = newGame(3);
    const camp = siteCamp(state, world);
    siteFor(regionState(state, world, state.player.region), camp).structures.firePit = true;
    placeAt(state, world, neighbourLandCell(world, camp));
    state.player.pack = { items: {}, stacks: {} };
    state.player.tools = [];
    const cal = calendar(state.minute, state.startDoy);
    expect(check(state, world, cal, "light").ok).toBe(false);
    expect(goalProgress(state, world, cal, "fire").steps[0]).toEqual({ label: "Site", done: false });
  });

  it("counts a real field fire as the fire needed to cook", () => {
    const { state, world } = newGame(3);
    state.weather.precip = "none";
    addItem(state.player.pack, "fireDrill", 1);
    addItem(state.player.pack, "firewood", 2);
    const cal = calendar(state.minute, state.startDoy);
    const duration = check(state, world, cal, "light").duration;
    expect(startTask(state, world, cal, "light")).toBe(true);
    advance(state, world, duration + 1);
    addItem(state.player.pack, "rawMeat", 1);
    const now = calendar(state.minute, state.startDoy);
    expect(check(state, world, now, "cook", "rawMeat").ok).toBe(true);
    expect(goalProgress(state, world, now, "cook").steps.map((step) => [step.label, step.done])).toEqual([
      ["Fire", true], ["Food", true], ["Cook", false],
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
