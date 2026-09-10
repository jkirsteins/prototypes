import { describe, expect, it } from "vitest";
import {
  aggregateSummary,
  type AggregateSource,
  invalidatePatch,
  parentSummary,
  worldCacheStats,
} from "../src/world/aggregate";
import { FINE_CHUNK, FINE_CHUNK_LIMIT, type FineChunk, newWorld, terrainOfPatch } from "../src/world/cells";
import { patchId, WORLD_FINE_W } from "../src/world/spatial";
import type { Terrain } from "../src/sim/types";

const TERRAIN_BY_CHAR: Record<string, Terrain> = { S: "spruce", M: "meadow", R: "rock" };

function fixtureWorld(rows: string[]): AggregateSource {
  const w = rows[0]?.length ?? 0;
  if (w === 0 || rows.some((row) => row.length !== w)) throw new Error("fixture rows must be a non-empty rectangle");
  return {
    w,
    h: rows.length,
    terrainAt(patch) {
      const x = patch % WORLD_FINE_W;
      const y = Math.floor(patch / WORLD_FINE_W);
      const terrain = TERRAIN_BY_CHAR[rows[y]?.[x]];
      if (!terrain) throw new RangeError("fixture patch is outside the grid");
      return terrain;
    },
  };
}

describe("fine terrain aggregates", () => {
  it("derives a 300 m summary from exactly 36 real patches", () => {
    const world = fixtureWorld([
      "SSSSSS", "SSSSSS", "SSMMSS", "SSMMSS", "SSRRSS", "SSRRSS",
    ]);
    const summary = parentSummary(world, 0, 0);
    expect(summary.samples).toBe(36);
    expect(summary.terrainCounts).toMatchObject({ spruce: 28, meadow: 4, rock: 4 });
    expect(summary.dominant).toBe("spruce");
  });

  it("builds larger aligned summaries bottom-up from parent summaries", () => {
    const world = fixtureWorld([
      ...Array.from({ length: 6 }, () => "SSSSSSMMMMMM"),
      ...Array.from({ length: 6 }, () => "RRRRRRSSSSSS"),
    ]);
    const summary = aggregateSummary(world, 0, 0, 12);
    expect(summary.samples).toBe(144);
    expect(summary.terrainCounts).toMatchObject({ spruce: 72, meadow: 36, rock: 36 });
    expect(summary.dominant).toBe("spruce");
  });

  it("summarizes an unaligned fine area without requiring a parent cache", () => {
    const summary = aggregateSummary(fixtureWorld(["SM", "RR"]), 0, 0, 2);
    expect(summary.samples).toBe(4);
    expect(summary.terrainCounts).toMatchObject({ spruce: 1, meadow: 1, rock: 2 });
    expect(summary.dominant).toBe("rock");
  });

  it("invalidates its chunk summaries and only adjacent parent boundary summaries", () => {
    const world = newWorld(21);
    const affected = parentSummary(world, 16, 16);
    const sameChunk = parentSummary(world, 17, 16);
    const acrossBoundary = parentSummary(world, 15, 16);
    const distant = parentSummary(world, 14, 16);
    expect(worldCacheStats(world).parentSummaries).toBe(4);

    invalidatePatch(world, patchId(96, 96));

    expect(worldCacheStats(world).parentSummaries).toBe(1);
    expect(parentSummary(world, 14, 16)).toBe(distant);
    expect(parentSummary(world, 16, 16).generation).toBeGreaterThan(affected.generation);
    expect(parentSummary(world, 17, 16).generation).toBeGreaterThan(sameChunk.generation);
    expect(parentSummary(world, 15, 16).generation).toBeGreaterThan(acrossBoundary.generation);
  });

  it("keeps the least recently used fine chunks within the declared limit", () => {
    const world = newWorld(21);
    terrainOfPatch(world, patchId(0, 0));
    const emptyChunk: Omit<FineChunk, "cx"> = {
      cy: 0,
      terrain: new Uint8Array(FINE_CHUNK * FINE_CHUNK),
      region: new Int32Array(FINE_CHUNK * FINE_CHUNK),
      samples: FINE_CHUNK * FINE_CHUNK,
      parentSummaries: new Map(),
    };
    for (let cx = 1; cx < FINE_CHUNK_LIMIT; cx++) world.fineChunks.set(cx, { ...emptyChunk, cx });
    terrainOfPatch(world, patchId(0, 0));
    const beforeEviction = worldCacheStats(world).fineChunkBuilds;

    terrainOfPatch(world, patchId(FINE_CHUNK_LIMIT * FINE_CHUNK, 0));
    expect(world.fineChunks.size).toBe(FINE_CHUNK_LIMIT);
    terrainOfPatch(world, patchId(0, 0));
    expect(worldCacheStats(world).fineChunkBuilds).toBe(beforeEviction + 1);
  });
});
