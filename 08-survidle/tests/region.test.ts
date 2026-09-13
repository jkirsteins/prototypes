import { describe, expect, it } from "vitest";
import { worldCacheStats } from "../src/world/aggregate";
import { cellAt, cellIdx, FINE_CHUNK, neighbours, regionOf, regionPeek, solvedTerrainAt, terrainOf, terrainOfPatch, terrainPeek, patchAt } from "../src/world/cells";
import { refineChunk } from "../src/world/refine";
import { regionAtPatch } from "../src/world/fine-terrain";
import { latticeOf, regionAt } from "../src/world/gen";
import { PATCH_KM, patchId } from "../src/world/spatial";
import { LATTICE, TERRAINS } from "../src/world/terrain";
import { passable } from "../src/world/route";
import { watersideCell } from "../src/sim/position";
import { rangeNoise } from "../src/world/wildlife";
import { solvedWorld } from "./world-fixture";

describe("fine world and regions", () => {
  it("keeps wildlife range geography at its 25.2 km wavelength", () => {
    // The original field at physical (25.2 km, 50.4 km), now fine coordinates.
    expect(rangeNoise(21, 3, 504, 1008)).toBeCloseTo(0.43757932602117455, 12);
  });

  it("does not invent a camp or named spot in an all-water region", () => {
    const world = solvedWorld(21);
    const region = regionAt(world, regionAtPatch(21, patchId(0, 0)));
    expect(region.landCells).toBe(0);
    expect(region.campCell).toBeNull();
    expect(region.spots).toEqual([]);
  });

  it("sites a camp on a patch with water beside it whenever the region has any", () => {
    const world = solvedWorld(21);
    const region = regionAt(world, regionAtPatch(21, patchId(5400, 2000)));
    expect(region.landCells).toBeGreaterThan(0);
    const beside = region.cells.filter((c) => passable(cellAt(world, c).terrain) && watersideCell(world, c));
    expect(beside.length, "the region has water to camp by").toBeGreaterThan(0);
    // The camp is one of them, and it is the nearest of them to the centroid.
    expect(beside).toContain(region.campCell);
    const distance = (c: number) => Math.hypot(c % world.w - region.cx, Math.floor(c / world.w) - region.cy);
    expect(distance(region.campCell!)).toBeCloseTo(Math.min(...beside.map(distance)), 6);
  });

  it("uses one fine identity across cells, peeks and generated patches", () => {
    const world = solvedWorld(21);
    const id = patchId(6411, 1875);
    expect(cellIdx(world, 6411, 1875)).toBe(id);
    expect(terrainPeek(world, 6411, 1875)).toBe(solvedTerrainAt(world, 6411, 1875));
    expect(regionPeek(world, 6411, 1875)).toBe(regionAtPatch(21, id));
    expect(worldCacheStats(world).generatedPatches).toBe(0);
    const { x, y, terrain, region } = patchAt(world, id);
    expect(cellAt(world, id)).toEqual({ x, y, terrain, region });
    // Both entry points read the refinement's own classification for the
    // patch, so agreeing with each other is not the whole claim.
    const refined = refineChunk(world.seed, world.solved, Math.floor(6411 / FINE_CHUNK), Math.floor(1875 / FINE_CHUNK));
    const classified = TERRAINS[refined.terrain[(1875 % FINE_CHUNK) * FINE_CHUNK + (6411 % FINE_CHUNK)]];
    expect(terrain).toBe(classified);
    expect(terrainOf(world, 6411, 1875)).toBe(classified);
    expect(regionOf(world, 6411, 1875)).toBe(regionAtPatch(21, id));
    expect(neighbours(world, id)).toEqual([id - 1, id + 1, id - 10800, id + 10800]);
  });

  it("constructs the exact region once inside its physical search square", () => {
    const world = solvedWorld(21);
    const id = regionAtPatch(21, patchId(6411, 1875));
    const { lx, ly } = latticeOf(id);
    expect(LATTICE * PATCH_KM).toBeCloseTo(4.2, 8);
    const expected: number[] = [];
    for (let y = (ly - 1) * 84; y < (ly + 2) * 84; y++) {
      for (let x = (lx - 1) * 84; x < (lx + 2) * 84; x++) {
        const patch = patchId(x, y);
        if (regionAtPatch(21, patch) === id) expected.push(patch);
      }
    }
    const region = regionAt(world, id);
    expect([...region.cells].sort((a, b) => a - b)).toEqual(expected);
    expect(region.area).toBeCloseTo(expected.length * 0.0025, 8);
    const counts: Record<string, number> = {};
    for (const patch of expected) {
      const terrain = terrainOfPatch(world, patch);
      counts[terrain] = (counts[terrain] ?? 0) + 1;
    }
    for (const [terrain, fraction] of Object.entries(region.frac)) {
      expect(fraction).toBeCloseTo((counts[terrain] ?? 0) / expected.length, 10);
    }
    const stats = worldCacheStats(world);
    expect(stats.generatedPatches).toBeLessThan(250000);
    expect(stats.parentSummaries).toBeGreaterThan(0);
    expect(regionAt(world, id)).toBe(region);
    expect(worldCacheStats(world)).toEqual(stats);
  });
});
