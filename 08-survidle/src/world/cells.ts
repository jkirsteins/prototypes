/**
 * The world as cells, generated a chunk at a time the first time anything
 * looks at it. Terrain and region are pure functions of the seed, so a chunk
 * is only a cache. Region definitions live in gen.ts and are lazy too.
 */
import type { Terrain } from "../sim/types";
import type { ParentSummary } from "./aggregate";
import { regionAtPatch, terrainAtPatch } from "./fine-terrain";
import { type PatchId, patchXY, WORLD_FINE_H, WORLD_FINE_W } from "./spatial";
import { fieldsAt, regionOfCell, TERRAIN_INDEX, TERRAINS, terrainAt, WORLD_H, WORLD_W } from "./terrain";
import type { RegionDef } from "./gen";

export const CHUNK = 64;
export const FINE_CHUNK = 96;
export const FINE_CHUNK_LIMIT = 64;

interface Chunk { terrain: Uint8Array; region: Int32Array }

export interface FineChunk {
  cx: number;
  cy: number;
  terrain: Uint8Array;
  region: Int32Array;
  samples: number;
  parentSummaries: Map<number, ParentSummary>;
}

export interface World {
  seed: number;
  /** Size in cells. */
  w: number;
  h: number;
  chunks: Map<number, Chunk>;
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
  return {
    seed,
    w: WORLD_W,
    h: WORLD_H,
    chunks: new Map(),
    fineChunks: new Map(),
    fineChunkBuilds: 0,
    fineSummaryGeneration: 0,
    regions: new Map(),
    start: -1,
    startRing: -1,
  };
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

function chunkFor(world: World, x: number, y: number): { chunk: Chunk; i: number } {
  const cx = Math.floor(x / CHUNK);
  const cy = Math.floor(y / CHUNK);
  const key = cy * 4096 + cx;
  let chunk = world.chunks.get(key);
  if (!chunk) {
    const terrain = new Uint8Array(CHUNK * CHUNK);
    const region = new Int32Array(CHUNK * CHUNK);
    const x0 = cx * CHUNK;
    const y0 = cy * CHUNK;
    for (let j = 0; j < CHUNK; j++) {
      for (let i = 0; i < CHUNK; i++) {
        const wx = x0 + i;
        const wy = y0 + j;
        const inside = wx < world.w && wy < world.h;
        terrain[j * CHUNK + i] = inside ? TERRAIN_INDEX[terrainAt(world.seed, wx, wy)] : 0;
        region[j * CHUNK + i] = inside ? regionOfCell(world.seed, wx, wy) : -1;
      }
    }
    chunk = { terrain, region };
    world.chunks.set(key, chunk);
  }
  return { chunk, i: (y - cy * CHUNK) * CHUNK + (x - cx * CHUNK) };
}

export function inWorld(world: World, x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < world.w && y < world.h;
}

export function terrainOf(world: World, x: number, y: number): Terrain {
  if (!inWorld(world, x, y)) return "water";
  const { chunk, i } = chunkFor(world, x, y);
  return TERRAINS[chunk.terrain[i]];
}

export function regionOf(world: World, x: number, y: number): number {
  if (!inWorld(world, x, y)) return -1;
  const { chunk, i } = chunkFor(world, x, y);
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
  if (y === undefined) return terrainAtPatch(world.seed, x);
  if (!inWorld(world, x, y)) return "water";
  const key = Math.floor(y / CHUNK) * 4096 + Math.floor(x / CHUNK);
  const chunk = world.chunks.get(key);
  if (chunk) return TERRAINS[chunk.terrain[(y % CHUNK) * CHUNK + (x % CHUNK)]];
  return terrainAt(world.seed, x, y);
}

export function regionPeek(world: World, x: number, y: number): number {
  if (!inWorld(world, x, y)) return -1;
  const key = Math.floor(y / CHUNK) * 4096 + Math.floor(x / CHUNK);
  const chunk = world.chunks.get(key);
  if (chunk) return chunk.region[(y % CHUNK) * CHUNK + (x % CHUNK)];
  return regionOfCell(world.seed, x, y);
}

export function cellAt(world: World, idx: number): Cell {
  const x = idx % world.w;
  const y = Math.floor(idx / world.w);
  return { x, y, terrain: terrainOf(world, x, y), region: regionOf(world, x, y) };
}

export function cellIdx(world: World, x: number, y: number): number {
  return y * world.w + x;
}

/** Sea or lake for a water cell; null on land. The sea flag is the coast field's sign, so a lake is never salt. */
export function waterKindOf(world: World, idx: number): "lake" | "sea" | null {
  const x = idx % world.w;
  const y = Math.floor(idx / world.w);
  if (terrainOf(world, x, y) !== "water") return null;
  return fieldsAt(world.seed, x, y).sea ? "sea" : "lake";
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
