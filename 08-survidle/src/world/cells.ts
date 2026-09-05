/**
 * The world as cells, generated a chunk at a time the first time anything
 * looks at it. Terrain and region are pure functions of the seed, so a chunk
 * is only a cache. Region definitions live in gen.ts and are lazy too.
 */
import type { Terrain } from "../sim/types";
import { fieldsAt, regionOfCell, TERRAIN_INDEX, TERRAINS, terrainAt, WORLD_H, WORLD_W } from "./terrain";
import type { RegionDef } from "./gen";

export const CHUNK = 64;

interface Chunk { terrain: Uint8Array; region: Int32Array }

export interface World {
  seed: number;
  /** Size in cells. */
  w: number;
  h: number;
  chunks: Map<number, Chunk>;
  /** Region definitions computed so far, by id. */
  regions: Map<number, RegionDef>;
  /** The region the run begins in. */
  start: number;
  /** Rings of the lattice the start search walked; 40 means the fallback anchor. */
  startRing: number;
}

export interface Cell { x: number; y: number; terrain: Terrain; region: number }

export function newWorld(seed: number): World {
  return { seed, w: WORLD_W, h: WORLD_H, chunks: new Map(), regions: new Map(), start: -1, startRing: -1 };
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
export function terrainPeek(world: World, x: number, y: number): Terrain {
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
