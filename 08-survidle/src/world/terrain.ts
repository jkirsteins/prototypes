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
import { fieldsAtMetric, regionAtPatch, terrainAtPatch } from "./fine-terrain";
import { fbm } from "./noise";
import { PATCH_M, patchId, WORLD_FINE_H, WORLD_FINE_W } from "./spatial";

/** The solved world in 300 m cells: 540 by 667 km. */
export const WORLD_CELL_W = 1800;
export const WORLD_CELL_H = 2224;
/** The authoritative lattice everything in the game addresses: 50 m patches. */
export const WORLD_W = WORLD_FINE_W;
export const WORLD_H = WORLD_FINE_H;
/** The template is drawn in these km regardless of the cell count, so a small test world is the same geography in miniature. */
export const TEMPLATE_W_KM = 540;
export const TEMPLATE_H_KM = 667;
export const LAT_TOP = 67;
export const LAT_BOTTOM = 61;

/** Latitude of a row: 67 N at the top edge, 61 N at the bottom, 111 km a degree at full size. */
export function latitudeAt(y: number, h = WORLD_CELL_H): number {
  return LAT_TOP - (LAT_TOP - LAT_BOTTOM) * (y / h);
}

/** 4.2 km between region seeds, expressed in 50 m patches. */
export const LATTICE = 84;
export const LATTICE_W = Math.ceil(WORLD_W / LATTICE);
export const LATTICE_H = Math.ceil(WORLD_H / LATTICE);

/**
 * Representative mature canopy tops above the generated ground surface, metres.
 *
 * One table: what a ray reads as an obstruction and what a parent summary
 * bounds as its tallest obstruction have to be the same number, or a bound
 * stops bounding the thing it summarises.
 */
export const CANOPY_HEIGHT_M: Partial<Record<Terrain, number>> = { spruce: 22, pine: 17, birch: 14 };

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

interface Seeds { relief: number; islands: number; soil: number; detail: number; basin: number; scour: number }
const seedCache = new Map<number, Seeds>();
export function seedsFor(seed: number): Seeds {
  let s = seedCache.get(seed);
  if (!s) {
    s = { relief: derive(seed, 21), islands: derive(seed, 22), soil: derive(seed, 23), detail: derive(seed, 24), basin: derive(seed, 25), scour: derive(seed, 26) };
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

/** Fields by patch coordinate, for callers that hold patch x and y rather
 * than a metre point. Elevation is normalized against the 1,200 m scale the
 * ground palette and the shelter rules read. */
export function fieldsAt(seed: number, x: number, y: number): { e: number; m: number; sea: boolean; coast: number } {
  const fields = fieldsAtMetric(seed, { xM: (x + 0.5) * PATCH_M, yM: (y + 0.5) * PATCH_M });
  return { e: fields.elevationM / 1200, m: fields.moisture, sea: fields.sea, coast: fields.coast };
}

export function terrainAt(seed: number, x: number, y: number): Terrain {
  return terrainAtPatch(seed, patchId(x, y));
}

/** The region of a patch, by the metric lattice: the region a patch belongs to and the region its parent cell belongs to are the same place. */
export function regionOfCell(seed: number, x: number, y: number): number {
  return regionAtPatch(seed, patchId(x, y));
}
