import type { Terrain } from "../sim/types";
import { FINE_CHUNK, FINE_CHUNK_LIMIT, type FineChunk, patchAt, type World } from "./cells";
import { fieldsAtPatch, regionAtPatch } from "./fine-terrain";
import type { FineGrid } from "./fine-route";
import { FINE_PER_PARENT, type PatchId, patchId, patchXY, WORLD_FINE_H, WORLD_FINE_W } from "./spatial";
import { TERRAINS } from "./terrain";

const CANOPY_HEIGHT_M: Partial<Record<Terrain, number>> = { spruce: 22, pine: 17, birch: 14 };
const FINE_CHUNKS_W = Math.ceil(WORLD_FINE_W / FINE_CHUNK);

export interface AggregateSource extends FineGrid {
  elevationAt?(patch: PatchId): number;
  regionAt?(patch: PatchId): number;
}

export interface ParentSummary {
  samples: 36;
  terrainCounts: Record<Terrain, number>;
  dominant: Terrain;
  minElevationM: number;
  maxElevationM: number;
  maxObstructionM: number;
  regionCounts: Map<number, number>;
  generation: number;
}

export interface AggregateSummary extends Omit<ParentSummary, "samples"> {
  samples: number;
}

interface SourceCache {
  parents: Map<number, ParentSummary>;
  generation: number;
}

const sourceCaches = new WeakMap<AggregateSource, SourceCache>();

function sourceCache(source: AggregateSource): SourceCache {
  let cache = sourceCaches.get(source);
  if (!cache) {
    cache = { parents: new Map(), generation: 0 };
    sourceCaches.set(source, cache);
  }
  return cache;
}

function isWorld(source: World | AggregateSource): source is World {
  return "fineChunks" in source;
}

function dimensions(source: World | AggregateSource): { w: number; h: number } {
  return isWorld(source) ? { w: WORLD_FINE_W, h: WORLD_FINE_H } : source;
}

function terrainAt(source: World | AggregateSource, patch: PatchId): Terrain {
  return isWorld(source) ? patchAt(source, patch).terrain : source.terrainAt(patch);
}

function elevationAt(source: World | AggregateSource, patch: PatchId): number {
  return isWorld(source) ? fieldsAtPatch(source.seed, patch).elevationM : source.elevationAt?.(patch) ?? 0;
}

function regionAt(source: World | AggregateSource, patch: PatchId): number {
  return isWorld(source) ? regionAtPatch(source.seed, patch) : source.regionAt?.(patch) ?? -1;
}

function emptyTerrainCounts(): Record<Terrain, number> {
  return { water: 0, fell: 0, rock: 0, bog: 0, spruce: 0, pine: 0, birch: 0, meadow: 0 };
}

function dominantTerrain(counts: Record<Terrain, number>): Terrain {
  let dominant = TERRAINS[0];
  for (const terrain of TERRAINS.slice(1)) {
    if (counts[terrain] > counts[dominant]) dominant = terrain;
  }
  return dominant;
}

function obstructionM(terrain: Terrain, elevationM: number): number {
  return elevationM + (CANOPY_HEIGHT_M[terrain] ?? 0);
}

function fineChunkKeyForPatch(patch: PatchId): number {
  const { x, y } = patchXY(patch);
  return Math.floor(y / FINE_CHUNK) * FINE_CHUNKS_W + Math.floor(x / FINE_CHUNK);
}

function parentCache(source: World | AggregateSource, px: number, py: number): Map<number, ParentSummary> {
  if (isWorld(source)) {
    const first = patchId(px * FINE_PER_PARENT, py * FINE_PER_PARENT);
    patchAt(source, first);
    const chunk = source.fineChunks.get(fineChunkKeyForPatch(first));
    if (!chunk) throw new Error("fine chunk was not retained");
    return chunk.parentSummaries;
  }
  return sourceCache(source).parents;
}

function nextGeneration(source: World | AggregateSource): number {
  if (isWorld(source)) return ++source.fineSummaryGeneration;
  return ++sourceCache(source).generation;
}

function parentCacheKey(px: number, py: number): number {
  return py * Math.ceil(WORLD_FINE_W / FINE_PER_PARENT) + px;
}

export function parentSummary(source: World | AggregateSource, px: number, py: number): ParentSummary {
  const { w, h } = dimensions(source);
  const x0 = px * FINE_PER_PARENT;
  const y0 = py * FINE_PER_PARENT;
  if (!Number.isInteger(px) || !Number.isInteger(py) || x0 < 0 || y0 < 0
    || x0 + FINE_PER_PARENT > w || y0 + FINE_PER_PARENT > h) {
    throw new RangeError("parent is outside the fine world");
  }
  const cache = parentCache(source, px, py);
  const key = parentCacheKey(px, py);
  const cached = cache.get(key);
  if (cached) return cached;

  const terrainCounts = emptyTerrainCounts();
  const regionCounts = new Map<number, number>();
  let minElevationM = Number.POSITIVE_INFINITY;
  let maxElevationM = Number.NEGATIVE_INFINITY;
  let maxObstructionM = Number.NEGATIVE_INFINITY;
  for (let y = y0; y < y0 + FINE_PER_PARENT; y++) {
    for (let x = x0; x < x0 + FINE_PER_PARENT; x++) {
      const patch = patchId(x, y);
      const terrain = terrainAt(source, patch);
      const elevationM = elevationAt(source, patch);
      const region = regionAt(source, patch);
      terrainCounts[terrain]++;
      minElevationM = Math.min(minElevationM, elevationM);
      maxElevationM = Math.max(maxElevationM, elevationM);
      maxObstructionM = Math.max(maxObstructionM, obstructionM(terrain, elevationM));
      if (region >= 0) regionCounts.set(region, (regionCounts.get(region) ?? 0) + 1);
    }
  }
  const summary: ParentSummary = {
    samples: 36,
    terrainCounts,
    dominant: dominantTerrain(terrainCounts),
    minElevationM,
    maxElevationM,
    maxObstructionM,
    regionCounts,
    generation: nextGeneration(source),
  };
  cache.set(key, summary);
  return summary;
}

interface SummaryBuilder {
  samples: number;
  terrainCounts: Record<Terrain, number>;
  minElevationM: number;
  maxElevationM: number;
  maxObstructionM: number;
  regionCounts: Map<number, number>;
}

function emptySummary(): SummaryBuilder {
  return {
    samples: 0,
    terrainCounts: emptyTerrainCounts(),
    minElevationM: Number.POSITIVE_INFINITY,
    maxElevationM: Number.NEGATIVE_INFINITY,
    maxObstructionM: Number.NEGATIVE_INFINITY,
    regionCounts: new Map(),
  };
}

function addSummary(target: SummaryBuilder, source: Omit<AggregateSummary, "generation" | "dominant">): void {
  target.samples += source.samples;
  for (const terrain of TERRAINS) target.terrainCounts[terrain] += source.terrainCounts[terrain];
  target.minElevationM = Math.min(target.minElevationM, source.minElevationM);
  target.maxElevationM = Math.max(target.maxElevationM, source.maxElevationM);
  target.maxObstructionM = Math.max(target.maxObstructionM, source.maxObstructionM);
  for (const [region, count] of source.regionCounts) {
    target.regionCounts.set(region, (target.regionCounts.get(region) ?? 0) + count);
  }
}

export function aggregateSummary(source: World | AggregateSource, x0: number, y0: number, size: number): AggregateSummary {
  const { w, h } = dimensions(source);
  if (!Number.isInteger(x0) || !Number.isInteger(y0) || !Number.isInteger(size) || size < 1
    || x0 < 0 || y0 < 0 || x0 >= w || y0 >= h) {
    throw new RangeError("aggregate is outside the fine world");
  }
  const x1 = Math.min(w, x0 + size);
  const y1 = Math.min(h, y0 + size);
  const summary = emptySummary();
  const parentAligned = x0 % FINE_PER_PARENT === 0 && y0 % FINE_PER_PARENT === 0
    && x1 % FINE_PER_PARENT === 0 && y1 % FINE_PER_PARENT === 0;
  if (parentAligned) {
    for (let y = y0; y < y1; y += FINE_PER_PARENT) {
      for (let x = x0; x < x1; x += FINE_PER_PARENT) {
        addSummary(summary, parentSummary(source, x / FINE_PER_PARENT, y / FINE_PER_PARENT));
      }
    }
  } else {
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        const patch = patchId(x, y);
        const terrain = terrainAt(source, patch);
        const elevationM = elevationAt(source, patch);
        const region = regionAt(source, patch);
        summary.samples++;
        summary.terrainCounts[terrain]++;
        summary.minElevationM = Math.min(summary.minElevationM, elevationM);
        summary.maxElevationM = Math.max(summary.maxElevationM, elevationM);
        summary.maxObstructionM = Math.max(summary.maxObstructionM, obstructionM(terrain, elevationM));
        if (region >= 0) summary.regionCounts.set(region, (summary.regionCounts.get(region) ?? 0) + 1);
      }
    }
  }
  return { ...summary, dominant: dominantTerrain(summary.terrainCounts), generation: nextGeneration(source) };
}

function cachedFineChunk(world: World, px: number, py: number): FineChunk | undefined {
  if (px < 0 || py < 0 || px * FINE_PER_PARENT >= WORLD_FINE_W || py * FINE_PER_PARENT >= WORLD_FINE_H) return undefined;
  return world.fineChunks.get(fineChunkKeyForPatch(patchId(px * FINE_PER_PARENT, py * FINE_PER_PARENT)));
}

export function invalidatePatch(world: World, patch: PatchId): void {
  const { x, y } = patchXY(patch);
  const px = Math.floor(x / FINE_PER_PARENT);
  const py = Math.floor(y / FINE_PER_PARENT);
  cachedFineChunk(world, px, py)?.parentSummaries.clear();

  const xOffsets = x % FINE_PER_PARENT === 0 ? [-1] : x % FINE_PER_PARENT === FINE_PER_PARENT - 1 ? [1] : [];
  const yOffsets = y % FINE_PER_PARENT === 0 ? [-1] : y % FINE_PER_PARENT === FINE_PER_PARENT - 1 ? [1] : [];
  for (const dx of xOffsets) cachedFineChunk(world, px + dx, py)?.parentSummaries.delete(parentCacheKey(px + dx, py));
  for (const dy of yOffsets) cachedFineChunk(world, px, py + dy)?.parentSummaries.delete(parentCacheKey(px, py + dy));
  for (const dx of xOffsets) for (const dy of yOffsets) {
    cachedFineChunk(world, px + dx, py + dy)?.parentSummaries.delete(parentCacheKey(px + dx, py + dy));
  }
}

export interface WorldCacheStats {
  fineChunks: number;
  fineChunkLimit: number;
  fineChunkBuilds: number;
  generatedPatches: number;
  parentSummaries: number;
}

export function worldCacheStats(world: World): WorldCacheStats {
  let generatedPatches = 0;
  let parentSummaries = 0;
  for (const chunk of world.fineChunks.values()) {
    generatedPatches += chunk.samples;
    parentSummaries += chunk.parentSummaries.size;
  }
  return {
    fineChunks: world.fineChunks.size,
    fineChunkLimit: FINE_CHUNK_LIMIT,
    fineChunkBuilds: world.fineChunkBuilds,
    generatedPatches,
    parentSummaries,
  };
}
