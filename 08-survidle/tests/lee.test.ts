/**
 * Lee is relative blocking: how much of the wind the upwind ground and the wood
 * standing on it take out before it reaches this cell. The fixtures below are
 * hand-made worlds at a known height, so every ratio in the assertions is one
 * the reader can do in their head: metres of barrier over metres of distance.
 */
import { describe, expect, it } from "vitest";
import { isLee, leeScore } from "../src/sim/shelter";
import { paintWorld, flatWorld } from "./world-fixture";

/** Bearings are where the wind comes from: 0 is north and they run clockwise. */
const NORTH = 0, EAST = 90, SOUTH = 180, WEST = 270;
const W = 21, H = 21;
const HERE = 10 * W + 10;
const west = (cells: number) => HERE - cells;

function meadow(): ReturnType<typeof flatWorld> {
  return flatWorld({ w: W, h: H, terrain: "meadow", heightM: 100 });
}

describe("lee is what the upwind ground and wood block", () => {
  it("reads a ridge only from the side the wind comes from", () => {
    const world = meadow();
    // 30 m of ridge at 300 m is a ratio of 0.1: full shelter by the ground.
    paintWorld(world, [west(1)], "meadow", 130);
    expect(leeScore(world, HERE, WEST)).toEqual({ score: 1, by: "slope", blocking: 0.1 });
    expect(isLee(world, HERE, WEST)).toBe(true);
    // The same ridge is behind the survivor in an east wind and shelters nothing.
    expect(leeScore(world, HERE, EAST).score).toBe(0);
    expect(leeScore(world, HERE, EAST).by).toBe("none");
    expect(isLee(world, HERE, EAST)).toBe(false);
  });

  it("weighs a barrier against its distance, out to 1.5 km", () => {
    const far = meadow();
    // 30 m at 1200 m is 0.025: a quarter of full shelter, which is not lee.
    paintWorld(far, [west(4)], "meadow", 130);
    expect(leeScore(far, HERE, WEST).blocking).toBeCloseTo(0.025, 6);
    expect(leeScore(far, HERE, WEST).score).toBeCloseTo(0.25, 6);
    expect(isLee(far, HERE, WEST)).toBe(false);
    // 120 m at the same 1200 m is 0.1 again: full shelter.
    const tall = meadow();
    paintWorld(tall, [west(4)], "meadow", 220);
    expect(leeScore(tall, HERE, WEST)).toEqual({ score: 1, by: "slope", blocking: 0.1 });
    // Beyond five cells the ground is out of reach whatever it does.
    const beyond = meadow();
    paintWorld(beyond, [west(6)], "meadow", 400);
    expect(leeScore(beyond, HERE, WEST).score).toBe(0);
  });

  it("counts the wood standing on the upwind ground as part of the barrier", () => {
    const pine = meadow();
    paintWorld(pine, [west(1)], "pine");
    // A 17 m pine canopy at 300 m on level ground: 0.057, over the 0.05 line.
    expect(leeScore(pine, HERE, WEST).blocking).toBeCloseTo(17 / 300, 6);
    expect(leeScore(pine, HERE, WEST).by).toBe("wood");
    expect(isLee(pine, HERE, WEST)).toBe(true);
    // A 14 m birch canopy is 0.047 and falls short.
    const birch = meadow();
    paintWorld(birch, [west(1)], "birch");
    expect(leeScore(birch, HERE, WEST).blocking).toBeCloseTo(14 / 300, 6);
    expect(leeScore(birch, HERE, WEST).by).toBe("wood");
    expect(isLee(birch, HERE, WEST)).toBe(false);
  });

  it("keeps rock, fell, water and river out of lee whatever stands upwind", () => {
    for (const terrain of ["rock", "fell", "water", "river"] as const) {
      const world = meadow();
      paintWorld(world, [HERE], terrain);
      paintWorld(world, [west(1)], "spruce", 300);
      expect(leeScore(world, HERE, WEST)).toEqual({ score: 0, by: "none", blocking: 0 });
      expect(isLee(world, HERE, WEST)).toBe(false);
    }
  });

  it("gives a closed spruce canopy full shelter from any wind", () => {
    const world = meadow();
    paintWorld(world, [HERE], "spruce");
    for (const wind of [NORTH, EAST, SOUTH, WEST]) {
      expect(leeScore(world, HERE, wind).score).toBe(1);
      expect(leeScore(world, HERE, wind).by).toBe("canopy");
      expect(isLee(world, HERE, wind)).toBe(true);
    }
  });

  it("does not call a bank lee when it is too low to be one", () => {
    const world = meadow();
    // 5 m at 300 m is 0.017: real ground, no shelter worth the name.
    paintWorld(world, [west(1)], "meadow", 105);
    expect(leeScore(world, HERE, WEST).blocking).toBeCloseTo(5 / 300, 6);
    expect(leeScore(world, HERE, WEST).by).toBe("slope");
    expect(isLee(world, HERE, WEST)).toBe(false);
  });

  it("walks upwind on the eight winds, not on the raw bearing", () => {
    const world = meadow();
    paintWorld(world, [HERE - W], "meadow", 130);
    // 20 degrees rounds to north, 30 to north-east, and only north sees the ridge.
    expect(isLee(world, HERE, 20)).toBe(true);
    expect(isLee(world, HERE, 30)).toBe(false);
    expect(isLee(world, HERE, SOUTH)).toBe(false);
  });
});
