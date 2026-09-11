import { describe, expect, it } from "vitest";
import { newGame } from "../src/sim/newgame";
import { ensureGround } from "../src/sim/weather";
import { cellOf, placeAt } from "../src/sim/position";
import { mapRegion } from "../src/sim/mapped";
import { survivorRoute, survivorRouteMinutes } from "../src/sim/routing";
import { check, startTask, stepTask } from "../src/sim/tasks";
import { calendar } from "../src/sim/calendar";
import { Rng } from "../src/rng";
import { iceCrossing } from "./world-facts";

/**
 * A walk that only frozen water carries: the home region and one neighbour are
 * mapped and both bear ice, and the target is water out from the neighbour's bank,
 * which a thaw there takes away. Which neighbour and which cell is the world's
 * business, so `iceCrossing` finds them by that rule.
 */
function crossing() {
  const g = newGame(42);
  const home = g.state.player.region;
  const from = cellOf(g.state, g.world);
  const { region: far, target } = iceCrossing(g.world, home, from);
  mapRegion(g.state, g.world, home);
  mapRegion(g.state, g.world, far);
  ensureGround(g.state, g.world, home).iceCm = 20;
  ensureGround(g.state, g.world, far).iceCm = 20;
  return { ...g, from, target, home, far };
}

describe("routes over local ice", () => {
  it.each(["walk", "explore", "searchHome"] as const)("cancels %s before a thawed distant cell makes its duration non-finite", (id) => {
    const { state, world, from, target, far } = crossing();
    expect(startTask(state, world, calendar(0), "walk", `cell:${target}`)).toBe(true);
    const task = state.task!;
    // Resume the same saved walking leg under each route-following task.
    task.id = id;
    if (id !== "walk") task.arg = `region:${far}`;
    task.home = from;
    ensureGround(state, world, far).iceCm = 0;
    stepTask(state, world, calendar(0), new Rng(1), 1);
    expect(Number.isFinite(task.duration)).toBe(true);
    expect(JSON.parse(JSON.stringify(task)).duration).not.toBeNull();
    expect(state.route).toBeNull();
    expect(state.task).toBeNull();
  });

  it("invalidates an ordinary cached crossing when the neighbouring water opens", () => {
    const { state, world, from, target, far } = crossing();
    expect(survivorRoute(state, world, from, target, "safe")).not.toBeNull();
    ensureGround(state, world, far).iceCm = 0;
    expect(survivorRoute(state, world, from, target, "safe")).toBeNull();
    expect(check(state, world, calendar(0), "walk", `cell:${target}`).ok).toBe(false);
    expect(survivorRouteMinutes(state, world, [target], 3, "safe")).toBe(Infinity);
  });

  it("permits explicitly requested thin ice per cell, and refuses open water even then", () => {
    const { state, world, from, target, far } = crossing();
    ensureGround(state, world, far).iceCm = 8;
    expect(survivorRoute(state, world, from, target, "safe")).toBeNull();
    expect(survivorRoute(state, world, from, target, "thin")).not.toBeNull();
    expect(check(state, world, calendar(0), "walk", `cell:${target}:thin`).ok).toBe(true);
    expect(survivorRouteMinutes(state, world, [target], 3, "thin")).toBeCloseTo(7.5);
    state.minute = 60;
    ensureGround(state, world, far).iceCm = 0;
    expect(survivorRoute(state, world, from, target, "thin")).toBeNull();
  });

  it("warns of the maximum crossing risk on remote thin ice, not the safe ice at the player", () => {
    const { state, world, target, far } = crossing();
    ensureGround(state, world, far).iceCm = 8;
    const option = check(state, world, calendar(0), "walk", `cell:${target}:thin`);
    expect(option.ok).toBe(true);
    expect(option.detail).toContain("up to 7% per crossing cell");
  });

  it("stops a saved crossing when ice under the walker no longer permits it", () => {
    const { state, world, from, target, far } = crossing();
    expect(startTask(state, world, calendar(0), "walk", `cell:${target}`)).toBe(true);
    placeAt(state, world, target);
    state.route!.path = [from];
    ensureGround(state, world, far).iceCm = 0;
    stepTask(state, world, calendar(0), new Rng(1), 1);
    expect(state.route).toBeNull();
    expect(state.task).toBeNull();
  });
});
