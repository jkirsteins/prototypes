/**
 * Lee is relative blocking: how much of the wind the upwind ground and the wood
 * standing on it take out before it reaches this patch. The fixtures below are
 * one hand-painted chunk at a known height, so every ratio in the assertions is
 * one the reader can do in their head: metres of barrier over metres of
 * distance. The walk is in metres over the refined ground, so a barrier is put
 * at the distance it is meant to stand at rather than at a count of steps.
 */
import { describe, expect, it } from "vitest";
import { isLee, leeScore } from "../src/sim/shelter";
import { PATCH_M, patchId } from "../src/world/spatial";
import { TERRAIN_INDEX } from "../src/world/terrain";
import { type FineFixture, fineFixture } from "./fine-fixture";

/** Bearings are where the wind comes from: 0 is north and they run clockwise. */
const NORTH = 0, EAST = 90, SOUTH = 180, WEST = 270;
const GROUND_M = 100;
/** Room for the whole 1.5 km reach inside the fixture chunk in every direction. */
const HX = 48, HY = 48;
const HERE = patchId(HX, HY);

function meadow(): FineFixture {
  return fineFixture({ terrain: "meadow", heightM: GROUND_M });
}

/** The patch this many metres upwind along a step of the eight winds. */
function upwind(metresOut: number, dx: number, dy: number): { x: number; y: number } {
  const steps = Math.round(metresOut / (PATCH_M * Math.hypot(dx, dy)));
  return { x: HX + dx * steps, y: HY + dy * steps };
}

/** Raise the ground at one patch to this height above sea level. */
function raise(f: FineFixture, at: { x: number; y: number }, heightM: number): void {
  const i = f.at(at.x, at.y);
  f.height[i] = heightM;
  f.world.fineChunks.get(0)!.fine.surface[i] = heightM;
}

function stand(f: FineFixture, at: { x: number; y: number }, terrain: keyof typeof TERRAIN_INDEX): void {
  f.terrain[f.at(at.x, at.y)] = TERRAIN_INDEX[terrain];
}

describe("lee is what the upwind ground and wood block", () => {
  it("reads a ridge only from the side the wind comes from", () => {
    const f = meadow();
    // 30 m of ridge at 300 m is a ratio of 0.1: full shelter by the ground.
    raise(f, upwind(300, -1, 0), GROUND_M + 30);
    expect(leeScore(f.world, HERE, WEST)).toEqual({ score: 1, by: "slope", blocking: 0.1 });
    expect(isLee(f.world, HERE, WEST)).toBe(true);
    // The same ridge is behind the survivor in an east wind and shelters nothing.
    expect(leeScore(f.world, HERE, EAST).score).toBe(0);
    expect(leeScore(f.world, HERE, EAST).by).toBe("none");
    expect(isLee(f.world, HERE, EAST)).toBe(false);
  });

  it("weighs a barrier against its distance, out to 1.5 km", () => {
    const far = meadow();
    // 30 m at 1200 m is 0.025: a quarter of full shelter, which is not lee.
    raise(far, upwind(1200, -1, 0), GROUND_M + 30);
    expect(leeScore(far.world, HERE, WEST).blocking).toBeCloseTo(0.025, 6);
    expect(leeScore(far.world, HERE, WEST).score).toBeCloseTo(0.25, 6);
    expect(isLee(far.world, HERE, WEST)).toBe(false);
    // 120 m at the same 1200 m is 0.1 again: full shelter.
    const tall = meadow();
    raise(tall, upwind(1200, -1, 0), GROUND_M + 120);
    expect(leeScore(tall.world, HERE, WEST)).toEqual({ score: 1, by: "slope", blocking: 0.1 });
    // Past 1.5 km the ground is out of reach whatever it does.
    const beyond = meadow();
    raise(beyond, upwind(1550, -1, 0), GROUND_M + 400);
    expect(leeScore(beyond.world, HERE, WEST).score).toBe(0);
  });

  it("finds the bank a hundred metres upwind that a 300 m step walks past", () => {
    const f = meadow();
    // 12 m of bank at 100 m is 0.12: full shelter from ground no coarse lattice
    // can hold, which is the whole reason the walk counts metres.
    raise(f, upwind(100, -1, 0), GROUND_M + 12);
    expect(leeScore(f.world, HERE, WEST).blocking).toBeCloseTo(0.12, 6);
    expect(isLee(f.world, HERE, WEST)).toBe(true);
  });

  it("counts the wood standing on the upwind ground as part of the barrier", () => {
    const pine = meadow();
    stand(pine, upwind(300, -1, 0), "pine");
    // A 17 m pine canopy at 300 m on level ground: 0.057, over the 0.05 line.
    expect(leeScore(pine.world, HERE, WEST).blocking).toBeCloseTo(17 / 300, 6);
    expect(leeScore(pine.world, HERE, WEST).by).toBe("wood");
    expect(isLee(pine.world, HERE, WEST)).toBe(true);
    // A 14 m birch canopy is 0.047 and falls short.
    const birch = meadow();
    stand(birch, upwind(300, -1, 0), "birch");
    expect(leeScore(birch.world, HERE, WEST).blocking).toBeCloseTo(14 / 300, 6);
    expect(leeScore(birch.world, HERE, WEST).by).toBe("wood");
    expect(isLee(birch.world, HERE, WEST)).toBe(false);
  });

  it("keeps rock, fell, water and river out of lee whatever stands upwind", () => {
    for (const terrain of ["rock", "fell", "water", "river"] as const) {
      const f = meadow();
      stand(f, { x: HX, y: HY }, terrain);
      stand(f, upwind(300, -1, 0), "spruce");
      raise(f, upwind(300, -1, 0), GROUND_M + 200);
      expect(leeScore(f.world, HERE, WEST)).toEqual({ score: 0, by: "none", blocking: 0 });
      expect(isLee(f.world, HERE, WEST)).toBe(false);
    }
  });

  it("gives a closed spruce canopy full shelter from any wind", () => {
    const f = meadow();
    stand(f, { x: HX, y: HY }, "spruce");
    for (const wind of [NORTH, EAST, SOUTH, WEST]) {
      expect(leeScore(f.world, HERE, wind).score).toBe(1);
      expect(leeScore(f.world, HERE, wind).by).toBe("canopy");
      expect(isLee(f.world, HERE, wind)).toBe(true);
    }
  });

  it("does not call a bank lee when it is too low to be one", () => {
    const f = meadow();
    // 5 m at 300 m is 0.017: real ground, no shelter worth the name.
    raise(f, upwind(300, -1, 0), GROUND_M + 5);
    expect(leeScore(f.world, HERE, WEST).blocking).toBeCloseTo(5 / 300, 6);
    expect(leeScore(f.world, HERE, WEST).by).toBe("slope");
    expect(isLee(f.world, HERE, WEST)).toBe(false);
  });

  it("measures a diagonal step at the distance it really stands at", () => {
    const f = meadow();
    // Six steps north-west is 424 m away, not 300: 30 m over it is 0.071, lee
    // but short of full shelter.
    const corner = upwind(424, -1, -1);
    raise(f, corner, GROUND_M + 30);
    const diagonal = leeScore(f.world, HERE, 315);
    expect(diagonal.blocking).toBeCloseTo(30 / (300 * Math.SQRT2), 6);
    expect(diagonal.score).toBeGreaterThan(0.5);
    expect(diagonal.score).toBeLessThan(1);
    expect(diagonal.by).toBe("slope");
    expect(isLee(f.world, HERE, 315)).toBe(true);
    // A cardinal wind can only put ground at a multiple of 50 m, and the same
    // rise at 400 m reads 30 over 400: each barrier is measured at the distance
    // it truly stands at, and the lattice decides which distances exist.
    const cardinal = meadow();
    raise(cardinal, upwind(400, -1, 0), GROUND_M + 30);
    expect(leeScore(cardinal.world, HERE, WEST).blocking).toBeCloseTo(30 / 400, 6);
  });

  it("walks upwind on the eight winds, not on the raw bearing", () => {
    const f = meadow();
    raise(f, upwind(300, 0, -1), GROUND_M + 30);
    // 20 degrees rounds to north, 30 to north-east, and only north sees the ridge.
    expect(isLee(f.world, HERE, 20)).toBe(true);
    expect(isLee(f.world, HERE, 30)).toBe(false);
    expect(isLee(f.world, HERE, SOUTH)).toBe(false);
  });
});
