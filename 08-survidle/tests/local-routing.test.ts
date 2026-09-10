import { describe, expect, it } from "vitest";
import { newGame } from "../src/sim/newgame";
import { ensureGround } from "../src/sim/weather";
import { cellOf, placeAt } from "../src/sim/position";
import { mapRegion } from "../src/sim/mapped";
import { survivorRoute, survivorRouteMinutes } from "../src/sim/routing";
import { check, startTask, stepTask } from "../src/sim/tasks";
import { calendar } from "../src/sim/calendar";
import { Rng } from "../src/rng";

function crossing() {
  const g = newGame(42);
  expect(g.state.player.region).toBe(5753);
  mapRegion(g.state, g.world, 5753);
  mapRegion(g.state, g.world, 5624);
  ensureGround(g.state, g.world, 5753).iceCm = 20;
  ensureGround(g.state, g.world, 5624).iceCm = 20;
  return { ...g, from: cellOf(g.state, g.world), target: 1099091 };
}

describe("routes over local ice", () => {
  it.each(["walk", "explore", "searchHome"] as const)("cancels %s before a thawed distant cell makes its duration non-finite", (id) => {
    const { state, world, from, target } = crossing();
    expect(startTask(state, world, calendar(0), "walk", `cell:${target}`)).toBe(true);
    const task = state.task!;
    // Resume the same saved walking leg under each route-following task.
    task.id = id;
    if (id !== "walk") task.arg = "region:5624";
    task.home = from;
    ensureGround(state, world, 5624).iceCm = 0;
    stepTask(state, world, calendar(0), new Rng(1), 1);
    expect(Number.isFinite(task.duration)).toBe(true);
    expect(JSON.parse(JSON.stringify(task)).duration).not.toBeNull();
    expect(state.route).toBeNull();
    expect(state.task).toBeNull();
  });

  it("invalidates an ordinary cached crossing when the neighboring lake opens", () => {
    const { state, world, from, target } = crossing();
    expect(survivorRoute(state, world, from, target, "safe")).not.toBeNull();
    ensureGround(state, world, 5624).iceCm = 0;
    expect(survivorRoute(state, world, from, target, "safe")).toBeNull();
    expect(check(state, world, calendar(0), "walk", `cell:${target}`).ok).toBe(false);
    expect(survivorRouteMinutes(state, world, [target], 3, "safe")).toBe(Infinity);
  });

  it("permits explicitly requested thin ice per cell, and refuses open water even then", () => {
    const { state, world, from, target } = crossing();
    ensureGround(state, world, 5624).iceCm = 8;
    expect(survivorRoute(state, world, from, target, "safe")).toBeNull();
    expect(survivorRoute(state, world, from, target, "thin")).not.toBeNull();
    expect(check(state, world, calendar(0), "walk", `cell:${target}:thin`).ok).toBe(true);
    expect(survivorRouteMinutes(state, world, [target], 3, "thin")).toBeCloseTo(7.5);
    state.minute = 60;
    ensureGround(state, world, 5624).iceCm = 0;
    expect(survivorRoute(state, world, from, target, "thin")).toBeNull();
  });

  it("warns of the maximum crossing risk on remote thin ice, not the safe ice at the player", () => {
    const { state, world, target } = crossing();
    ensureGround(state, world, 5624).iceCm = 8;
    const option = check(state, world, calendar(0), "walk", `cell:${target}:thin`);
    expect(option.ok).toBe(true);
    expect(option.detail).toContain("up to 7% per crossing cell");
  });

  it("stops a saved crossing when ice under the walker no longer permits it", () => {
    const { state, world, from, target } = crossing();
    expect(startTask(state, world, calendar(0), "walk", `cell:${target}`)).toBe(true);
    placeAt(state, world, target);
    state.route!.path = [from];
    ensureGround(state, world, 5624).iceCm = 0;
    stepTask(state, world, calendar(0), new Rng(1), 1);
    expect(state.route).toBeNull();
    expect(state.task).toBeNull();
  });
});
