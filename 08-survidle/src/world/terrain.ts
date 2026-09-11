/**
 * The world's shape: a window on the Scandinavian peninsula from 67 N on
 * the top row to 61 N on the bottom, at real scale, with the Atlantic
 * coast and the Scandes on the west and lowland falling east. Everything
 * here is a pure function of seed and position in metres or km. The
 * solve (solve.ts) turns this template into ground; nothing here is
 * stored.
 */
import { derive } from "../rng";
import type { Terrain } from "../sim/types";
import { fbm } from "./noise";

/** World size in 300 m cells: 540 by 667 km. */
export const WORLD_W = 1800;
export const WORLD_H = 2224;
/** The template is drawn in these km regardless of the cell count, so a small test world is the same geography in miniature. */
export const TEMPLATE_W_KM = 540;
export const TEMPLATE_H_KM = 667;
export const LAT_TOP = 67;
export const LAT_BOTTOM = 61;

/** Latitude of a row: 67 N at the top edge, 61 N at the bottom, 111 km a degree at full size. */
export function latitudeAt(y: number, h = WORLD_H): number {
  return LAT_TOP - (LAT_TOP - LAT_BOTTOM) * (y / h);
}

/** Cells between region seeds: regions are about 4 km across. */
export const LATTICE = 14;
export const LATTICE_W = Math.ceil(WORLD_W / LATTICE);
export const LATTICE_H = Math.ceil(WORLD_H / LATTICE);

export const TERRAINS: Terrain[] = ["water", "fell", "rock", "bog", "spruce", "pine", "birch", "meadow", "river"];
export const TERRAIN_INDEX: Record<Terrain, number> = { water: 0, fell: 1, rock: 2, bog: 3, spruce: 4, pine: 5, birch: 6, meadow: 7, river: 8 };

/**
 * The birch line in metres. About 1100 m at 61 N inland and 650 m at 67 N
 * inland, and up to 350 m lower on the outer coast where the oceanic
 * summer is too cool for trees to climb.
 */
export function treelineM(lat: number, coastKm: number): number {
  const inland = coastKm < 0 ? 0 : coastKm > 50 ? 1 : coastKm / 50;
  return 1100 - 75 * (lat - LAT_BOTTOM) - 350 * (1 - inland);
}

/** Where the Atlantic coast line crosses a row, in template km from the west edge: 40 km at the bottom, 280 km at the top. */
const COAST_X0_KM = 40;
const COAST_DRIFT_KM = 240;
/** The coast runs 240 km east over 667 km north; a perpendicular distance is the east-west gap scaled by this. */
const COAST_NORMAL = TEMPLATE_H_KM / Math.sqrt(COAST_DRIFT_KM * COAST_DRIFT_KM + TEMPLATE_H_KM * TEMPLATE_H_KM);

function coastLineKm(v: number): number {
  return COAST_X0_KM + COAST_DRIFT_KM * (1 - v);
}

/** Where the coast line crosses a row, as a share of the world's width. */
export function coastLineU(v: number): number {
  return coastLineKm(v) / TEMPLATE_W_KM;
}

/** Signed distance from the Atlantic coast line in km, positive inland, for a position in 0..1 of the template. */
export function coastKmAt(u: number, v: number): number {
  return (u * TEMPLATE_W_KM - coastLineKm(v)) * COAST_NORMAL;
}

/** The Gulf of Bothnia reaches the east edge between 63 N and 65.5 N, 60 km deep at 64.25 N. */
export function inBothnia(u: number, v: number): boolean {
  const lat = LAT_TOP - (LAT_TOP - LAT_BOTTOM) * v;
  const reach = 1 - Math.abs(lat - 64.25) / 1.25;
  if (reach <= 0) return false;
  return u * TEMPLATE_W_KM > TEMPLATE_W_KM - 60 * reach;
}

/** Litres a second per km2 of catchment: about 50 on the Atlantic side, falling to 12 far inland. */
export function runoffLsKm2(coastKm: number): number {
  const d = coastKm < 0 ? 0 : coastKm;
  return 12 + 38 / (1 + d / 80);
}

interface Seeds { relief: number; islands: number; soil: number; detail: number }
const seedCache = new Map<number, Seeds>();
export function seedsFor(seed: number): Seeds {
  let s = seedCache.get(seed);
  if (!s) {
    s = { relief: derive(seed, 21), islands: derive(seed, 22), soil: derive(seed, 23), detail: derive(seed, 24) };
    seedCache.set(seed, s);
  }
  return s;
}

/** Crest height by latitude: about 1800 m at 61 N, 1500 m at 67 N. */
function crestM(lat: number): number {
  return 1800 - 50 * (lat - LAT_BOTTOM);
}

/** Distance of the crest inland of the coast, and of the plateau foot. */
const CREST_KM = 110;
const PLATEAU_KM = 170;
const PLATEAU_M = 600;
const EAST_EDGE_M = 150;

/**
 * The macro template in metres before erosion: shelf and skerries, the
 * coastal flank, the crest, the plateau and the eastern slope, plus two
 * octaves of relief noise. The two finest octaves are added at 300 m in
 * the upsample, where slope is known.
 */
export function templateHeightM(seed: number, u: number, v: number): number {
  const s = seedsFor(seed);
  const xKm = u * TEMPLATE_W_KM;
  const yKm = v * TEMPLATE_H_KM;
  const d = coastKmAt(u, v);
  const lat = LAT_TOP - (LAT_TOP - LAT_BOTTOM) * v;
  const crest = crestM(lat);
  let base: number;
  if (d < 0) {
    // Shelf: -200 m at 60 km out, -20 m at the shore line.
    const t = d < -60 ? 0 : 1 + d / 60;
    base = -200 + 180 * t;
  } else if (d < CREST_KM) {
    const t = d / CREST_KM;
    base = -20 + (crest + 20) * t * Math.sqrt(t);
  } else if (d < PLATEAU_KM) {
    base = crest - (crest - PLATEAU_M) * (d - CREST_KM) / (PLATEAU_KM - CREST_KM);
  } else {
    const span = TEMPLATE_W_KM - PLATEAU_KM;
    const t = (d - PLATEAU_KM) / span;
    base = PLATEAU_M - (PLATEAU_M - EAST_EDGE_M) * (t > 1 ? 1 : t);
  }
  if (inBothnia(u, v)) base = -30;
  // Relief at 40 km and 10 km. The sea keeps a third of it so the shelf stays sea.
  const relief = 300 * (fbm(xKm / 40, yKm / 40, s.relief, 1) - 0.5) * 2 + 100 * (fbm(xKm / 10 + 7, yKm / 10 + 3, s.relief + 1, 1) - 0.5) * 2;
  let h = base + (d < 0 ? relief / 3 : relief);
  // Skerries: drowned hills within 20 km of the shore, some of which break the surface.
  if (d < 0 && d > -20) h += 90 * (fbm(xKm / 3, yKm / 3, s.islands, 2) - 0.5) * 2 * (1 + d / 20);
  return h;
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
      const dx = x + 0.5 - s.x;
      const dy = y + 0.5 - s.y;
      const d = dx * dx + dy * dy;
      if (d < bestD) {
        bestD = d;
        best = ly * LATTICE_W + lx;
      }
    }
  }
  return best;
}
