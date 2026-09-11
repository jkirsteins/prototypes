/**
 * The world as cells: the solved arrays (solve.ts) plus a region cache
 * filled a chunk at a time. Terrain, height, discharge and water kind are
 * lookups; the region of a cell is a pure function of the seed and is
 * cached because it costs nine lattice seeds to find.
 */
import type { Terrain } from "../sim/types";
import { FLAG_FORD, FLAG_STREAM, KIND, type SolvedWorld } from "./solve";
import { latitudeAt, regionOfCell, TERRAINS, WORLD_H, WORLD_W } from "./terrain";
import type { RegionDef } from "./gen";

export const CHUNK = 64;

interface Chunk { region: Int32Array }

export interface World {
  seed: number;
  /** Size in cells. */
  w: number;
  h: number;
  solved: SolvedWorld;
  chunks: Map<number, Chunk>;
  /** Region definitions computed so far, by id. */
  regions: Map<number, RegionDef>;
  /** The region the run begins in. */
  start: number;
  /** The shore cell the first boat lands on. */
  startCell: number;
  /** Rings of the lattice the start search walked; the ring limit means the fallback anchor. */
  startRing: number;
}

export interface Cell { x: number; y: number; terrain: Terrain; region: number }

export function newWorld(seed: number, solved: SolvedWorld): World {
  return { seed, w: solved.w, h: solved.h, solved, chunks: new Map(), regions: new Map(), start: -1, startCell: -1, startRing: -1 };
}

function chunkFor(world: World, x: number, y: number): { chunk: Chunk; i: number } {
  const cx = Math.floor(x / CHUNK);
  const cy = Math.floor(y / CHUNK);
  const key = cy * 4096 + cx;
  let chunk = world.chunks.get(key);
  if (!chunk) {
    const region = new Int32Array(CHUNK * CHUNK);
    const x0 = cx * CHUNK;
    const y0 = cy * CHUNK;
    for (let j = 0; j < CHUNK; j++) {
      for (let i = 0; i < CHUNK; i++) {
        const wx = x0 + i;
        const wy = y0 + j;
        region[j * CHUNK + i] = wx < world.w && wy < world.h ? regionOfCell(world.seed, wx, wy) : -1;
      }
    }
    chunk = { region };
    world.chunks.set(key, chunk);
  }
  return { chunk, i: (y - cy * CHUNK) * CHUNK + (x - cx * CHUNK) };
}

export function inWorld(world: World, x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < world.w && y < world.h;
}

export function terrainOf(world: World, x: number, y: number): Terrain {
  if (!inWorld(world, x, y)) return "water";
  return TERRAINS[world.solved.terrain[y * world.w + x]];
}

/** Metres above sea level; the sea's floor is negative, a lake reads its surface. Outside the world is sea level. */
export function heightAt(world: World, x: number, y: number): number {
  if (!inWorld(world, x, y)) return 0;
  return world.solved.height[y * world.w + x];
}

/** Cubic metres a second passing through the cell. */
export function dischargeAt(world: World, x: number, y: number): number {
  if (!inWorld(world, x, y)) return 0;
  return world.solved.discharge[y * world.w + x];
}

/** Moisture in 0..1 for the ground glyph forms. */
export function moistureAt(world: World, x: number, y: number): number {
  if (!inWorld(world, x, y)) return 0;
  return world.solved.moisture[y * world.w + x] / 255;
}

export function streamAt(world: World, idx: number): boolean {
  return (world.solved.flags[idx] & FLAG_STREAM) !== 0;
}

export function fordAt(world: World, idx: number): boolean {
  return (world.solved.flags[idx] & FLAG_FORD) !== 0;
}

export function latitudeOfRow(world: World, y: number): number {
  return latitudeAt(y + 0.5, world.h);
}

export function regionOf(world: World, x: number, y: number): number {
  if (!inWorld(world, x, y)) return -1;
  const { chunk, i } = chunkFor(world, x, y);
  return chunk.region[i];
}

/** Terrain without touching the region cache; the same lookup, kept for callers that read the coarse map. */
export function terrainPeek(world: World, x: number, y: number): Terrain {
  return terrainOf(world, x, y);
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

/** Sea, lake or river for a water cell; null on land. */
export function waterKindOf(world: World, idx: number): "lake" | "sea" | "river" | null {
  const k = world.solved.kind[idx];
  return k === KIND.sea ? "sea" : k === KIND.lake ? "lake" : k === KIND.river ? "river" : null;
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

export { WORLD_H, WORLD_W };
