/**
 * Terrain as a pure function of seed and coordinates, shaped like the far
 * north of Norway, Sweden and Finland: sea to the north and west with a
 * fjord-cut coast, a fell spine running southwest to northeast inland, and
 * low lake-and-bog country to the east and south. Nothing here is stored;
 * chunks cache what this computes.
 */
import { derive } from "../rng";
import type { Terrain } from "../sim/types";
import { fbm } from "./noise";

/** World size in 300 m cells: about 540 by 390 km. */
export const WORLD_W = 1800;
export const WORLD_H = 1300;

/** Cells between region seeds: regions are about 4 km across. */
export const LATTICE = 14;
export const LATTICE_W = Math.ceil(WORLD_W / LATTICE);
export const LATTICE_H = Math.ceil(WORLD_H / LATTICE);

export const TERRAINS: Terrain[] = ["water", "fell", "rock", "bog", "spruce", "pine", "birch", "meadow"];
export const TERRAIN_INDEX: Record<Terrain, number> = { water: 0, fell: 1, rock: 2, bog: 3, spruce: 4, pine: 5, birch: 6, meadow: 7 };

interface Seeds { coast: number; fjord: number; elev: number; moist: number; lake: number }
const seedCache = new Map<number, Seeds>();
function seedsFor(seed: number): Seeds {
  let s = seedCache.get(seed);
  if (!s) {
    s = { coast: derive(seed, 11), fjord: derive(seed, 12), elev: derive(seed, 13), moist: derive(seed, 14), lake: derive(seed, 15) };
    seedCache.set(seed, s);
  }
  return s;
}

/** Distance in uv space from (u, v) to the fell spine, a segment from the Narvik side to the Alta side. */
function ridgeDistance(u: number, v: number): number {
  // v is scaled so a unit is the same length in both directions.
  const aspect = WORLD_H / WORLD_W;
  const ax = 0.2;
  const ay = 0.88 * aspect;
  const bx = 0.66;
  const by = 0.28 * aspect;
  const px = u;
  const py = v * aspect;
  const dx = bx - ax;
  const dy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

/** Elevation and moisture, both roughly 0..1, and whether the point is sea. */
export function fieldsAt(seed: number, x: number, y: number): { e: number; m: number; sea: boolean; coast: number } {
  const s = seedsFor(seed);
  const u = x / WORLD_W;
  const v = y / WORLD_H;
  // Land rises to the south and east; the coast wanders at two scales.
  const coast = v * 1.25 + u * 0.85 - 0.62
    + 0.30 * (fbm(x / 180, y / 180, s.coast, 3) - 0.5)
    + 0.10 * (fbm(x / 14, y / 14, s.fjord, 3) - 0.5);
  const sea = coast < 0;
  const ridge = Math.exp(-((ridgeDistance(u, v) / 0.075) ** 2));
  let e = 0.42 + 0.48 * ridge + (fbm(x / 11, y / 9, s.elev) - 0.5) * 0.45;
  // The coast itself is low and rocky; inland lakes come from a slower noise.
  if (!sea) e -= 0.12 * Math.exp(-coast / 0.04);
  const lake = fbm(x / 26 + 500, y / 22 + 500, s.lake, 3);
  if (!sea && coast > 0.05 && ridge < 0.5 && lake < 0.31) e = Math.min(e, 0.25);
  let m = fbm(x / 10 + 37, y / 9 + 11, s.moist) + 0.12 * (u - 0.5) - 0.25 * ridge;
  m = Math.max(0, Math.min(1, m));
  return { e, m, sea, coast };
}

export function terrainAt(seed: number, x: number, y: number): Terrain {
  const { e, m, sea } = fieldsAt(seed, x, y);
  if (sea || e < 0.31) return "water";
  if (e > 0.84) return "fell";
  if (e > 0.76) return "rock";
  if (m > 0.62 && e < 0.5) return "bog";
  if (m > 0.52) return "spruce";
  if (m > 0.4) return "pine";
  if (e < 0.5) return "birch";
  return "meadow";
}

function hash2(seed: number, a: number, b: number): number {
  let h = Math.imul(a + 1, 0x27d4eb2d) ^ Math.imul(b + 1, 0x165667b1) ^ Math.imul(seed, 0x9e3779b9);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** The jittered seed point of a lattice cell, in cell coordinates. */
export function latticeSeed(seed: number, lx: number, ly: number): { x: number; y: number } {
  const jx = hash2(seed, lx, ly) - 0.5;
  const jy = hash2(seed, ly * 7919, lx * 104729) - 0.5;
  return {
    x: Math.min(WORLD_W - 1, Math.max(0, (lx + 0.5) * LATTICE + jx * 0.8 * LATTICE)),
    y: Math.min(WORLD_H - 1, Math.max(0, (ly + 0.5) * LATTICE + jy * 0.8 * LATTICE)),
  };
}

/** The region a cell belongs to: the nearest of the nine lattice seeds around it. */
export function regionOfCell(seed: number, x: number, y: number): number {
  const lx0 = Math.floor(x / LATTICE);
  const ly0 = Math.floor(y / LATTICE);
  let best = -1;
  let bestD = Number.POSITIVE_INFINITY;
  for (let ly = ly0 - 1; ly <= ly0 + 1; ly++) {
    if (ly < 0 || ly >= LATTICE_H) continue;
    for (let lx = lx0 - 1; lx <= lx0 + 1; lx++) {
      if (lx < 0 || lx >= LATTICE_W) continue;
      const s = latticeSeed(seed, lx, ly);
      const d = (x + 0.5 - s.x) ** 2 + (y + 0.5 - s.y) ** 2;
      if (d < bestD) {
        bestD = d;
        best = ly * LATTICE_W + lx;
      }
    }
  }
  return best;
}
