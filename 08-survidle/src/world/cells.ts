/**
 * The world as cells, generated a chunk at a time the first time anything
 * looks at it. Terrain and region are pure functions of the seed, so a chunk
 * is only a cache. Region definitions live in gen.ts and are lazy too.
 */
import type { Terrain } from "../sim/types";
import type { ParentSummary } from "./aggregate";
import type { FineGrid } from "./fine-route";
import { fieldsAtPatch, regionAtPatch, terrainAtPatch } from "./fine-terrain";
import { type PatchId, patchId, patchXY, WORLD_FINE_H, WORLD_FINE_W } from "./spatial";
import { TERRAIN_INDEX, TERRAINS, WORLD_H, WORLD_W } from "./terrain";
import type { RegionDef } from "./gen";

export const FINE_CHUNK = 96;
export const FINE_CHUNK_LIMIT = 64;

export interface FineChunk {
  cx: number;
  cy: number;
  terrain: Uint8Array;
  region: Int32Array;
  samples: number;
  parentSummaries: Map<number, ParentSummary>;
}

export interface World extends FineGrid {
  seed: number;
  /** Size in cells. */
  w: number;
  h: number;
  /** Generated 50 m terrain, retained in least-recently-used order. */
  fineChunks: Map<number, FineChunk>;
  fineChunkBuilds: number;
  fineSummaryGeneration: number;
  /** Region definitions computed so far, by id. */
  regions: Map<number, RegionDef>;
  /** The region the run begins in. */
  start: number;
  /** Rings of the lattice the start search walked; 40 means the fallback anchor. */
  startRing: number;
}

export interface Cell { x: number; y: number; terrain: Terrain; region: number }
export interface FinePatch { id: PatchId; x: number; y: number; terrain: Terrain; region: number }

export function newWorld(seed: number): World {
  const world: World = {
    seed,
    w: WORLD_W,
    h: WORLD_H,
    terrainAt: id => terrainOfPatch(world, id),
    fineChunks: new Map(),
    fineChunkBuilds: 0,
    fineSummaryGeneration: 0,
    regions: new Map(),
    start: -1,
    startRing: -1,
  };
  // The routing adapter is behavior, not serializable world data.
  Object.defineProperty(world, "terrainAt", { enumerable: false });
  return world;
}

const FINE_CHUNKS_W = Math.ceil(WORLD_FINE_W / FINE_CHUNK);

function fineChunkKey(cx: number, cy: number): number {
  return cy * FINE_CHUNKS_W + cx;
}

function fineChunkFor(world: World, id: PatchId): { chunk: FineChunk; i: number } {
  const { x, y } = patchXY(id);
  const cx = Math.floor(x / FINE_CHUNK);
  const cy = Math.floor(y / FINE_CHUNK);
  const key = fineChunkKey(cx, cy);
  let chunk = world.fineChunks.get(key);
  if (chunk) {
    world.fineChunks.delete(key);
    world.fineChunks.set(key, chunk);
  } else {
    const terrain = new Uint8Array(FINE_CHUNK * FINE_CHUNK);
    const region = new Int32Array(FINE_CHUNK * FINE_CHUNK);
    region.fill(-1);
    const x0 = cx * FINE_CHUNK;
    const y0 = cy * FINE_CHUNK;
    const x1 = Math.min(x0 + FINE_CHUNK, WORLD_FINE_W);
    const y1 = Math.min(y0 + FINE_CHUNK, WORLD_FINE_H);
    for (let py = y0; py < y1; py++) {
      for (let px = x0; px < x1; px++) {
        const i = (py - y0) * FINE_CHUNK + px - x0;
        const patch = py * WORLD_FINE_W + px;
        terrain[i] = TERRAIN_INDEX[terrainAtPatch(world.seed, patch)];
        region[i] = regionAtPatch(world.seed, patch);
      }
    }
    chunk = {
      cx,
      cy,
      terrain,
      region,
      samples: (x1 - x0) * (y1 - y0),
      parentSummaries: new Map(),
    };
    while (world.fineChunks.size >= FINE_CHUNK_LIMIT) {
      const oldest = world.fineChunks.keys().next().value;
      if (oldest === undefined) break;
      world.fineChunks.delete(oldest);
    }
    world.fineChunks.set(key, chunk);
    world.fineChunkBuilds++;
  }
  return { chunk, i: (y - cy * FINE_CHUNK) * FINE_CHUNK + x - cx * FINE_CHUNK };
}

export function patchAt(world: World, id: PatchId): FinePatch {
  const { x, y } = patchXY(id);
  const { chunk, i } = fineChunkFor(world, id);
  return { id, x, y, terrain: TERRAINS[chunk.terrain[i]], region: chunk.region[i] };
}

export function terrainOfPatch(world: World, id: PatchId): Terrain {
  return patchAt(world, id).terrain;
}

export function inWorld(world: World, x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < world.w && y < world.h;
}

export function terrainOf(world: World, x: number, y: number): Terrain {
  if (!inWorld(world, x, y)) return "water";
  const { chunk, i } = fineChunkFor(world, patchId(x, y));
  return TERRAINS[chunk.terrain[i]];
}

export function regionOf(world: World, x: number, y: number): number {
  if (!inWorld(world, x, y)) return -1;
  const { chunk, i } = fineChunkFor(world, patchId(x, y));
  return chunk.region[i];
}

/**
 * Terrain and region without filling a chunk: for the coarse map, which
 * samples a few cells out of every block and would otherwise generate the
 * whole world to draw one screen.
 */
export function terrainPeek(world: World, patch: PatchId): Terrain;
export function terrainPeek(world: World, x: number, y: number): Terrain;
export function terrainPeek(world: World, x: number, y?: number): Terrain {
  if (y === undefined) { const xy = patchXY(x); return terrainPeek(world, xy.x, xy.y); }
  if (!inWorld(world, x, y)) return "water";
  const chunk = world.fineChunks.get(fineChunkKey(Math.floor(x / FINE_CHUNK), Math.floor(y / FINE_CHUNK)));
  if (chunk) return TERRAINS[chunk.terrain[(y % FINE_CHUNK) * FINE_CHUNK + x % FINE_CHUNK]];
  return terrainAtPatch(world.seed, patchId(x, y));
}

export function regionPeek(world: World, x: number, y: number): number {
  if (!inWorld(world, x, y)) return -1;
  const chunk = world.fineChunks.get(fineChunkKey(Math.floor(x / FINE_CHUNK), Math.floor(y / FINE_CHUNK)));
  if (chunk) return chunk.region[(y % FINE_CHUNK) * FINE_CHUNK + x % FINE_CHUNK];
  return regionAtPatch(world.seed, patchId(x, y));
}

export function cellAt(world: World, idx: number): Cell {
  const x = idx % world.w;
  const y = Math.floor(idx / world.w);
  if (!inWorld(world, x, y)) return { x, y, terrain: "water", region: -1 };
  const { terrain, region } = patchAt(world, idx);
  return { x, y, terrain, region };
}

export function cellIdx(world: World, x: number, y: number): number {
  return y * world.w + x;
}

/** Sea or lake for a water cell; null on land. The sea flag is the coast field's sign, so a lake is never salt. */
export function waterKindOf(world: World, idx: number): "lake" | "sea" | null {
  const x = idx % world.w;
  const y = Math.floor(idx / world.w);
  if (terrainOf(world, x, y) !== "water") return null;
  return fieldsAtPatch(world.seed, idx).sea ? "sea" : "lake";
}

export function neighbours(world: World, idx: number): number[] {
  const x = idx % world.w;
  const y = Math.floor(idx / world.w);
  const out: number[] = [];
  if (x > 0) out.push(idx - 1);
  if (x < world.w - 1) out.push(idx + 1);
  if (y > 0) out.push(idx - world.w);
  if (y < world.h - 1) out.push(idx + world.w);
  return out;
}
