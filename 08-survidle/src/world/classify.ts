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

/** A valley floor is basined once its catchment reaches this. */
const BASIN_MIN_KM2 = 2;
/**
 * Scour depth at the deepest point of a 100 km2 valley, metres. The lake that
 * follows is shallower than the scour, since the flood fills only to the sill
 * and the cross profile is parabolic: the reading it answers to is the 10 to
 * 30 m mean depth of a Nordic valley lake. The square root of the catchment
 * carries the largest valleys toward the few hundred metres of Hornindalsvatnet
 * (514 m) and Mjosa (449 m), and the cap holds them under those.
 */
const BASIN_M = 50;
const BASIN_MAX_DEPTH_M = 300;
const BASIN_MAX_HALF_KM = 2;
/**
 * Wavelength of the noise that decides which stretches of a valley are
 * overdeepened, km. Half of it deepens and half stands as a sill, so 2 km
 * leaves a lake about a kilometre long between rock steps: the spacing of the
 * lake chains that fill a Norwegian valley floor.
 */
const BASIN_WAVE_KM = 2;
/** Scour depth of the hollows on the low plateau, metres: the shallow lake plains of the interior, mean depth under 10 m. */
const SCOUR_M = 30;
/** Wavelength of the plateau scour, km: hollows about a kilometre across, the size of the small lakes that pit a lake plain. */
const SCOUR_WAVE_KM = 2;
/** Ground flatter than this counts as plateau rather than valley side. */
const SCOUR_MAX_SLOPE = 0.01;
/** Below this the ground is coastal flat the sea would take, not plateau. */
const SCOUR_MIN_M = 5;

/**
 * Ice left rock basins as well as troughs, and they are what makes a Nordic
 * landscape a lake landscape. Two scours, both applied in place before the
 * caller re-reads the sea:
 *
 * - Along every drainage line, in every direction, the floor drops where a
 *   slow noise runs high and not at all where it runs low, so overdeepened
 *   stretches sit between undeepened sills. Deeper and wider with the
 *   catchment, on the same parabolic cross profile as the troughs.
 * - On the low plateau, where the ground barely falls to its receiver, a
 *   second noise sinks shallow hollows: the lake plains of the interior.
 */
export function carveBasins(height: Float32Array, w: number, h: number, dir: Uint8Array, count: Uint32Array, seaBefore: Uint8Array, seed: number): void {
  const n = w * h;
  const s = seedsFor(seed);
  const kmPerU = TEMPLATE_W_KM / w;
  const kmPerV = TEMPLATE_H_KM / h;
  const lower = new Float32Array(n);
  for (let c = 0; c < n; c++) {
    if (seaBefore[c]) continue;
    const x = c % w;
    const y = (c - x) / w;
    const xKm = (x + 0.5) * kmPerU;
    const yKm = (y + 0.5) * kmPerV;
    const km2 = count[c] * CELL_KM2;
    if (km2 >= BASIN_MIN_KM2) {
      const b = 2 * (fbm(xKm / BASIN_WAVE_KM + 3, yKm / BASIN_WAVE_KM + 19, s.basin, 1) - 0.5);
      if (b > 0) {
        let depth = BASIN_M * Math.sqrt(km2 / 100) * b;
        if (depth > BASIN_MAX_DEPTH_M) depth = BASIN_MAX_DEPTH_M;
        let halfKm = 0.1 * Math.sqrt(km2);
        if (halfKm > BASIN_MAX_HALF_KM) halfKm = BASIN_MAX_HALF_KM;
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
    }
    if (height[c] <= SCOUR_MIN_M) continue;
    let slope = 0;
    if (dir[c] !== NO_FLOW) {
      const r = receiverOf(c, dir[c], w);
      slope = (height[c] - height[r]) / (DIST8[dir[c]] * CELL_KM * 1000);
    }
    if (slope >= SCOUR_MAX_SLOPE) continue;
    const g = 2 * (fbm(xKm / SCOUR_WAVE_KM + 31, yKm / SCOUR_WAVE_KM + 13, s.scour, 1) - 0.5);
    if (g <= 0) continue;
    const d = SCOUR_M * g;
    if (d > lower[c]) lower[c] = d;
  }
  for (let i = 0; i < n; i++) if (!seaBefore[i]) height[i] -= lower[i];
}

export const KIND = { land: 0, sea: 1, lake: 2, river: 3 } as const;
export const FLAG_STREAM = 1;
export const FLAG_FORD = 2;
/**
 * Mean discharge above this is a river about 10 to 15 m wide at bankfull
 * (Leopold's width relation gives about 11 m for 5 cubic metres a second):
 * its own terrain, a barrier in spring and wadeable at riffles in summer,
 * which is what the ford rule models. At inland runoff that is a catchment
 * of about 400 km2, on the Atlantic side about 100 km2.
 */
export const RIVER_M3S = 5;
/** A brook that runs all year. */
export const STREAM_M3S = 0.02;
/** A river cell dropping faster than this to its receiver is a riffle a walker can ford. */
export const FORD_GRADIENT = 0.005;
/** Slopes above this (20 degrees) shed their soil. */
const STEEP = 0.36;
/** Spruce does not grow within this of the Atlantic, nor north of this latitude. */
const SPRUCE_COAST_KM = 30;
const SPRUCE_LAT_LIMIT = 66;

/**
 * Rank-transforms raw noise values into a uniform 0..1 draw: a band rate
 * compared against a value is a share of cells only when the value being
 * compared is itself uniform, and two octaves of value noise (fbm) are
 * not - they cluster near 0.5. Bins the raw range into `bins` buckets,
 * turns each bucket's count into a cumulative share of all values, and
 * maps every value to the cumulative share up to and including its own
 * bucket. Arithmetic only, so it stays engine-identical like the rest of
 * the solve.
 */
export function uniformise(values: Float32Array, bins = 4096): Float32Array {
  const n = values.length;
  let lo = values[0];
  let hi = values[0];
  for (let i = 1; i < n; i++) {
    const v = values[i];
    if (v < lo) lo = v;
    if (v > hi) hi = v;
  }
  const span = hi - lo || 1;
  const bucketOf = new Uint16Array(n);
  const counts = new Uint32Array(bins);
  for (let i = 0; i < n; i++) {
    let b = Math.floor(((values[i] - lo) / span) * bins);
    if (b < 0) b = 0;
    if (b >= bins) b = bins - 1;
    bucketOf[i] = b;
    counts[b]++;
  }
  const cumulative = new Float32Array(bins);
  let running = 0;
  for (let b = 0; b < bins; b++) {
    running += counts[b];
    cumulative[b] = running / n;
  }
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = cumulative[bucketOf[i]];
  return out;
}

/** Bare rock share by band; the highest applicable rate wins. A rate here
 * is the real share of cells since classify() compares it against the
 * uniformised soil noise, not the raw fbm value. */
function rockRate(coastKm: number, slope: number, underTreeline: number): number {
  let rate = 0.04;
  if (coastKm < 1) rate = 0.30;
  if (slope > STEEP && rate < 0.25) rate = 0.25;
  if (underTreeline >= 0 && underTreeline < 100 && rate < 0.35) rate = 0.35;
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

  // The soil noise must be uniform in 0..1 for a rockRate() rate to be the
  // real share of cells rather than a share of the raw fbm output, which is
  // not uniform. Sample it once for every land cell (not sea, not lake, not
  // a river by discharge), uniformise across that population, and scatter
  // the result back so the main loop below reads it like any other field.
  const isLand = new Uint8Array(n);
  let landCount = 0;
  for (let i = 0; i < n; i++) {
    if (sea[i] || lake[i] || flow[i] >= RIVER_M3S) continue;
    isLand[i] = 1;
    landCount++;
  }
  const rawSoil = new Float32Array(landCount);
  const soilCell = new Int32Array(landCount);
  let sk = 0;
  for (let i = 0; i < n; i++) {
    if (!isLand[i]) continue;
    const x = i % w;
    const y = (i - x) / w;
    rawSoil[sk] = fbm((x + 0.5) * kmPerU / 2 + 11, (y + 0.5) * kmPerV / 2 + 5, s.soil, 2);
    soilCell[sk] = i;
    sk++;
  }
  const uniformSoil = uniformise(rawSoil);
  const soilAt = new Float32Array(n);
  for (let sk2 = 0; sk2 < landCount; sk2++) soilAt[soilCell[sk2]] = uniformSoil[sk2];

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
    const soil = soilAt[i];
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
