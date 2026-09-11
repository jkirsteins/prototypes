/**
 * From drainage to discharge and to the glacial shape of the western
 * valleys; and (below) from the solved fields to what each cell is. The
 * rules here are the geology and ecology of the setting, in real units.
 */
import { CELL_KM } from "../units";
import { DIST8, DY8, NO_FLOW, receiverOf } from "./hydro";
import { fbm } from "./noise";
import { coastKmAt, latitudeAt, runoffLsKm2, seedsFor, TEMPLATE_H_KM, TEMPLATE_W_KM, TERRAIN_INDEX, treelineM } from "./terrain";
import type { HydrologyResult } from "./solve";

const CELL_KM2 = CELL_KM * CELL_KM;

/** What each cell adds to the river below it, cubic metres a second: its area times the row's runoff. */
export function runoffWeights(w: number, h: number): Float32Array {
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    const v = (y + 0.5) / h;
    for (let x = 0; x < w; x++) out[y * w + x] = CELL_KM2 * runoffLsKm2(coastKmAt((x + 0.5) / w, v)) / 1000;
  }
  return out;
}

/** Signed coast distance of a cell, km, positive inland. */
export function coastKmOfCell(x: number, y: number, w: number, h: number): number {
  return coastKmAt((x + 0.5) / w, (y + 0.5) / h);
}

const TROUGH_MAX_DEPTH_M = 700;
const TROUGH_MAX_HALF_KM = 4;
const TROUGH_REACH_KM = 150;
const DROWN_REACH_KM = 40;
const DROWN_M = 300;
/** A valley is carved once its catchment reaches this. */
const TROUGH_MIN_KM2 = 5;

/**
 * Ice sat in the western valleys and over-deepened them: along every
 * drainage line that reaches the Atlantic within 150 km, the floor is
 * lowered by a parabolic trough whose depth and width grow with the
 * catchment, and within 40 km of the coast an extra drop drowns it so the
 * sea can enter. Applied in place; the caller re-reads the sea afterwards.
 */
export function carveGlacial(height: Float32Array, w: number, h: number, dir: Uint8Array, count: Uint32Array, order: Int32Array, seaBefore: Uint8Array): void {
  const n = w * h;
  // A cell drains west if its receiver does, or it is Atlantic sea itself.
  // The actual shoreline sits inland of the template coast line (the coastal
  // flank starts below sea level and the relief noise pushes it further), so
  // coastKm below 0 alone matches nothing; 100 catches the real Atlantic
  // shore while staying short of the Bothnian bay, which lies beyond 200 km.
  const drainsWest = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    if (!seaBefore[i]) continue;
    const x = i % w;
    const y = (i - x) / w;
    if (coastKmOfCell(x, y, w, h) < 100) drainsWest[i] = 1;
  }
  for (let k = n - 1; k >= 0; k--) {
    const c = order[k];
    if (dir[c] === NO_FLOW) continue;
    if (drainsWest[receiverOf(c, dir[c], w)]) drainsWest[c] = 1;
  }
  const lower = new Float32Array(n);
  for (let c = 0; c < n; c++) {
    if (seaBefore[c] || !drainsWest[c]) continue;
    const x = c % w;
    const y = (c - x) / w;
    const coastKm = coastKmOfCell(x, y, w, h);
    if (coastKm >= TROUGH_REACH_KM) continue;
    const km2 = count[c] * CELL_KM2;
    if (km2 < TROUGH_MIN_KM2) continue;
    const root = Math.sqrt(km2);
    let depth = 40 * root;
    if (depth > TROUGH_MAX_DEPTH_M) depth = TROUGH_MAX_DEPTH_M;
    if (coastKm < DROWN_REACH_KM) depth += DROWN_M * (1 - coastKm / DROWN_REACH_KM);
    let halfKm = 0.15 * root;
    if (halfKm > TROUGH_MAX_HALF_KM) halfKm = TROUGH_MAX_HALF_KM;
    const halfCells = halfKm / CELL_KM;
    const reach = Math.ceil(halfCells);
    for (let dy = -reach; dy <= reach; dy++) {
      const yy = y + dy;
      if (yy < 0 || yy >= h) continue;
      for (let dx = -reach; dx <= reach; dx++) {
        const xx = x + dx;
        if (xx < 0 || xx >= w) continue;
        const r2 = (dx * dx + dy * dy) / (halfCells * halfCells);
        if (r2 >= 1) continue;
        const d = depth * (1 - r2);
        const j = yy * w + xx;
        if (d > lower[j]) lower[j] = d;
      }
    }
  }
  for (let i = 0; i < n; i++) if (!seaBefore[i]) height[i] -= lower[i];
}

export const KIND = { land: 0, sea: 1, lake: 2, river: 3 } as const;
export const FLAG_STREAM = 1;
export const FLAG_FORD = 2;
/** Mean discharge above this is a river about 50 m wide at bankfull: its own terrain, crossed on ice or at a ford. */
export const RIVER_M3S = 40;
/** A brook that runs all year. */
export const STREAM_M3S = 0.02;
/** A river cell dropping faster than this to its receiver is a riffle a walker can ford. */
export const FORD_GRADIENT = 0.005;
/** Slopes above this (20 degrees) shed their soil. */
const STEEP = 0.36;
/** Spruce does not grow within this of the Atlantic, nor north of this latitude. */
const SPRUCE_COAST_KM = 30;
const SPRUCE_LAT_LIMIT = 66;

/** Bare rock share by band; the highest applicable rate wins. */
function rockRate(coastKm: number, slope: number, underTreeline: number): number {
  // The soil noise is not a uniform 0..1 draw (two octaves of value noise cluster
  // near 0.5), so a rate here is not the resulting rock share; it is set higher
  // than the target share to land on it against the noise's real distribution.
  let rate = 0.15;
  if (coastKm < 1) rate = 0.40;
  if (slope > STEEP && rate < 0.38) rate = 0.38;
  if (underTreeline >= 0 && underTreeline < 100 && rate < 0.45) rate = 0.45;
  return rate;
}

export function classify(hydro: HydrologyResult, seed: number, w: number, h: number): { terrain: Uint8Array; kind: Uint8Array; flags: Uint8Array; moisture: Uint8Array } {
  const n = w * h;
  const s = seedsFor(seed);
  const terrain = new Uint8Array(n);
  const kind = new Uint8Array(n);
  const flags = new Uint8Array(n);
  const moisture = new Uint8Array(n);
  const { height, sea, lake, dir, count, flow } = hydro;
  const kmPerU = TEMPLATE_W_KM / w;
  const kmPerV = TEMPLATE_H_KM / h;
  for (let i = 0; i < n; i++) {
    const x = i % w;
    const y = (i - x) / w;
    if (sea[i]) { kind[i] = KIND.sea; terrain[i] = TERRAIN_INDEX.water; continue; }
    if (lake[i]) { kind[i] = KIND.lake; terrain[i] = TERRAIN_INDEX.water; continue; }
    const q = flow[i];
    // Slope to the receiver, metres per metre; a sink is flat.
    let slope = 0;
    let northFacing = 0.5;
    if (dir[i] !== NO_FLOW) {
      const r = receiverOf(i, dir[i], w);
      slope = (height[i] - height[r]) / (DIST8[dir[i]] * CELL_KM * 1000);
      if (slope < 0) slope = 0;
      const dy = DY8[dir[i]];
      northFacing = dy < 0 ? 1 : dy > 0 ? 0 : 0.5;
    }
    if (q >= RIVER_M3S) {
      kind[i] = KIND.river;
      terrain[i] = TERRAIN_INDEX.river;
      if (slope > FORD_GRADIENT) flags[i] |= FLAG_FORD;
      continue;
    }
    kind[i] = KIND.land;
    if (q >= STREAM_M3S) flags[i] |= FLAG_STREAM;
    const coastKm = coastKmOfCell(x, y, w, h);
    const lat = latitudeAt(y + 0.5, h);
    const treeline = treelineM(lat, coastKm);
    const hm = height[i];
    const s0 = slope < 0.001 ? 0.001 : slope;
    const a = count[i];
    const wetness = a / (a + 200 * s0);
    const p = (runoffLsKm2(coastKm) - 12) / 38;
    const m = 0.5 * p + 0.4 * wetness + 0.1 * northFacing;
    moisture[i] = Math.round((m < 0 ? 0 : m > 1 ? 1 : m) * 255);
    const soil = fbm((x + 0.5) * kmPerU / 2 + 11, (y + 0.5) * kmPerV / 2 + 5, s.soil, 2);
    const underTreeline = treeline - hm;
    if (hm > treeline) { terrain[i] = TERRAIN_INDEX.fell; continue; }
    if (soil < rockRate(coastKm, slope, underTreeline)) { terrain[i] = TERRAIN_INDEX.rock; continue; }
    if (slope < 0.02 && wetness > 0.5 && p > 0.2) { terrain[i] = TERRAIN_INDEX.bog; continue; }
    if (underTreeline < 60 || (coastKm < 3 && soil < 0.5)) { terrain[i] = TERRAIN_INDEX.meadow; continue; }
    const spruceAllowed = coastKm > SPRUCE_COAST_KM && lat < SPRUCE_LAT_LIMIT;
    if (underTreeline < 150 || coastKm < 10 || (m > 0.55 && !spruceAllowed)) { terrain[i] = TERRAIN_INDEX.birch; continue; }
    if (m > 0.55 && spruceAllowed) { terrain[i] = TERRAIN_INDEX.spruce; continue; }
    terrain[i] = TERRAIN_INDEX.pine;
  }
  return { terrain, kind, flags, moisture };
}
