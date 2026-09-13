/**
 * From drainage to discharge and to the glacial shape of the western
 * valleys; and (below) from the solved fields to what each cell is. The
 * rules here are the geology and ecology of the setting, in real units.
 */
import { CELL_KM } from "../units";
import { DIST8, DY8, NO_FLOW, receiverOf } from "./hydro";
import { fbm } from "./noise";
import { FINE_PER_PARENT, PATCH_M } from "./spatial";
import { coastKmAt, latitudeAt, runoffLsKm2, seedsFor, TEMPLATE_H_KM, TEMPLATE_W_KM, TERRAIN_INDEX, treelineM } from "./terrain";
import type { HydrologyResult, SolvedWorld } from "./solve";

const CELL_KM2 = CELL_KM * CELL_KM;

/** What each cell adds to the river below it, cubic metres a second: its area times the row's runoff. */
export function runoffWeights(w: number, h: number): Float32Array {
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) out[y * w + x] = runoffWeightOfCell(x, y, w, h);
  }
  return out;
}

/** What one cell adds to the river below it, cubic metres a second. */
export function runoffWeightOfCell(x: number, y: number, w: number, h: number): number {
  return CELL_KM2 * runoffLsKm2(coastKmOfCell(x, y, w, h)) / 1000;
}

/**
 * Upslope area in cells from a solved discharge: the inverse of the runoff
 * weight, which is how a consumer without the solve's `count` array recovers
 * a catchment. The runoff rate varies across a catchment, so this is the area
 * the discharge implies at the cell's own rate rather than an exact count.
 */
export function upslopeCellsOf(discharge: number, x: number, y: number, w: number, h: number): number {
  const weight = runoffWeightOfCell(x, y, w, h);
  return weight > 0 ? discharge / weight : 0;
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
  const scale = rankScale(values, bins);
  const out = new Float32Array(values.length);
  for (let i = 0; i < values.length; i++) out[i] = uniformAt(scale, values[i]);
  return out;
}

/** The mapping uniformise() builds: a raw value's bucket, and the share of the population up to it. */
export interface RankScale {
  lo: number;
  span: number;
  cumulative: Float32Array;
}

/** The rank transform of a population, kept rather than applied, so a value outside the population can be drawn from the same distribution. */
export function rankScale(values: Float32Array, bins = 4096): RankScale {
  const n = values.length;
  let lo = values[0];
  let hi = values[0];
  for (let i = 1; i < n; i++) {
    const v = values[i];
    if (v < lo) lo = v;
    if (v > hi) hi = v;
  }
  const span = hi - lo || 1;
  const counts = new Uint32Array(bins);
  for (let i = 0; i < n; i++) counts[bucketOf(lo, span, bins, values[i])]++;
  const cumulative = new Float32Array(bins);
  let running = 0;
  for (let b = 0; b < bins; b++) {
    running += counts[b];
    cumulative[b] = running / n;
  }
  return { lo, span, cumulative };
}

function bucketOf(lo: number, span: number, bins: number, value: number): number {
  let b = Math.floor(((value - lo) / span) * bins);
  if (b < 0) b = 0;
  if (b >= bins) b = bins - 1;
  return b;
}

/** Where a raw value falls in the population's distribution, as a uniform 0..1 draw. */
export function uniformAt(scale: RankScale, value: number): number {
  return scale.cumulative[bucketOf(scale.lo, scale.span, scale.cumulative.length, value)];
}

/**
 * The thin-soil noise at a position in template km: two octaves at 2 km, the
 * same field whatever the lattice asking for it. Raw, so a caller comparing
 * it against a rock rate must put it through the rank transform below first.
 */
export function soilNoiseAtKm(seed: number, xKm: number, yKm: number): number {
  return fbm(xKm / 2 + 11, yKm / 2 + 5, seedsFor(seed).soil, 2);
}

/**
 * How many samples the soil rank transform is built from when the solved
 * world is too large to sample every cell: enough that the share of the
 * population below any value is known to a fraction of a percent, which is
 * finer than the rock rates it decides.
 */
const SOIL_SAMPLES = 250_000;

const soilScales = new WeakMap<SolvedWorld, { seed: number; scale: RankScale }>();

/**
 * The rank transform classify() applied to the thin-soil noise, rebuilt from
 * the solved kinds: the same population of land cells, so a consumer at any
 * lattice can draw its own sample from the same distribution and a rock rate
 * stays the share of ground it names. Large worlds are sampled on a stride;
 * a miniature is sampled whole.
 */
export function solvedSoilScale(seed: number, solved: SolvedWorld): RankScale {
  const held = soilScales.get(solved);
  if (held && held.seed === seed) return held.scale;
  const { w, h } = solved;
  const stride = Math.max(1, Math.round(Math.sqrt(w * h / SOIL_SAMPLES)));
  const kmPerU = TEMPLATE_W_KM / w;
  const kmPerV = TEMPLATE_H_KM / h;
  const raw: number[] = [];
  for (let y = 0; y < h; y += stride) {
    for (let x = 0; x < w; x += stride) {
      if (solved.kind[y * w + x] !== KIND.land) continue;
      raw.push(soilNoiseAtKm(seed, (x + 0.5) * kmPerU, (y + 0.5) * kmPerV));
    }
  }
  const scale = rankScale(Float32Array.from(raw));
  soilScales.set(solved, { seed, scale });
  return scale;
}

/** The solved cell's side, metres. */
const CELL_M = CELL_KM * 1000;

/**
 * The length inside the wetness index, metres: a transmissivity over a
 * recharge, about 90 m2/day of till against 500 mm a year. Ground is half
 * saturated where its specific catchment reaches this times the slope, which
 * on a 1 percent fall is 600 m of drainage per metre of contour. (Beven and
 * Kirkby 1979's topographic index in its dimensional form, a / (T sin b).)
 */
const WETNESS_LENGTH_M = 60_000;

/**
 * Specific catchment area in metres: an upslope area, counted in solved
 * cells, over the width of contour it crosses. The pair is what makes the
 * index the same quantity at 300 m and at 50 m - the same drainage crossing
 * a sixth of the width is six times the specific area.
 */
export function specificAreaM(upslopeCells: number, contourM: number): number {
  return upslopeCells * CELL_M * CELL_M / contourM;
}

/** The wetness index at one point: its specific catchment area against slope, with the slope floored so a sink is not infinitely wet. */
export function wetnessOfSpecificArea(specificArea: number, slope: number): number {
  const s0 = slope < 0.001 ? 0.001 : slope;
  return specificArea / (specificArea + WETNESS_LENGTH_M * s0);
}

/**
 * The specific catchment a patch of a cell gathers from its own hillslope,
 * metres, before any cell upstream hands it one. A plane would give half the
 * cell's own 300 m. The ground is not a plane: the refinement's detail
 * octaves, 100 m to 1.2 km, dissect every cell into hollows that gather, and
 * the median specific catchment of a 50 m patch off the drainage network is
 * 450 m - nine patches upslope of the median patch, measured over 81 chunks
 * on each of three seeds. Three times the plane's figure is also what makes
 * the cell average below agree with the fine rung in the mean, within 0.005
 * of index on all three seeds, which is the same number arrived at twice.
 *
 * That a wetness index reads higher on a finer lattice is the ordinary scale
 * dependence of a topographic index (Wolock and Price 1994, "Effects of
 * digital elevation model map scale and data resolution on a topography-based
 * watershed model"), so a coarse rung that has to predict a fine one carries
 * the finer rung's dissection as a length.
 */
const LOCAL_PATH_M = 450;
/** The depth between the six sample points, so the six average to LOCAL_PATH_M. */
const LOCAL_STEP_M = 2 * LOCAL_PATH_M / FINE_PER_PARENT;

/**
 * The wetness of a whole 300 m cell: the mean of the index over the cell's
 * area rather than its value at the outlet, so the coarse rung says what the
 * fine rung measures over the same nine hectares.
 *
 * A cell's D8 catchment does not wet all of it. The water crosses as a thread
 * no wider than the ground resolves it, which is a 50 m patch, so it carries
 * six times the specific area over a sixth of the cell's face and leaves the
 * rest of the cell wet only by its own hillslope: a point L metres down a
 * flow path has L metres of specific catchment, whatever lattice measures it.
 * Averaging over six depths across six columns, the thread one of them, is
 * the same 36 points the fine rung classifies one by one. The index is
 * concave in the area, so the mean of the 36 sits well below the value at the
 * outlet; the outlet value applied to all nine hectares is what made the
 * coarse rung read wetter than its own patches.
 */
export function cellWetness(upslopeCells: number, slope: number): number {
  const inherited = upslopeCells > 1 ? specificAreaM(upslopeCells - 1, PATCH_M) : 0;
  let sum = 0;
  for (let k = 0; k < FINE_PER_PARENT; k++) {
    const local = (k + 0.5) * LOCAL_STEP_M;
    sum += wetnessOfSpecificArea(inherited + local, slope) + (FINE_PER_PARENT - 1) * wetnessOfSpecificArea(local, slope);
  }
  return sum / (FINE_PER_PARENT * FINE_PER_PARENT);
}

/**
 * The wetness of the ground a cell mostly is, which is what decides its
 * class. A class is not an average: the cell has to name one ground for nine
 * hectares, and the honest name is the one most of it would carry at 50 m.
 * The 36 points above are 30 hillslope and 6 thread, so their middle is
 * always a hillslope point at the middle of its path - the index at
 * LOCAL_PATH_M. Measured against the median of the 36 real patches of a
 * parent it is unbiased to 0.008 of index over 81 chunks of seed 42, where
 * the cell's mean sits well above that median, because the thread pulls a
 * mean and cannot pull a majority.
 */
export function typicalWetness(slope: number): number {
  return wetnessOfSpecificArea(LOCAL_PATH_M, slope);
}

/** The precipitation index in 0..1: the row's runoff between the inland 12 and the oceanic 50 litres a second per km2. */
export function precipitationIndex(coastKm: number): number {
  return (runoffLsKm2(coastKm) - 12) / 38;
}

/** Ground moisture in 0..1 from rainfall, wetness and aspect. Moisture is no longer a separate noise. */
export function moistureIndex(p: number, wetness: number, northFacing: number): number {
  return 0.5 * p + 0.4 * wetness + 0.1 * northFacing;
}

/**
 * Which ground spruce takes from pine, and it is the soil, not the rain.
 * Spruce holds fine-textured till, which is the ground that holds water;
 * pine holds the sand, the gravel and the stony ground, which sheds it.
 * The two divide this forest almost evenly - the Swedish inventory puts
 * spruce at about 40 percent of standing volume against pine's 39 and
 * birch's 12 - and the soil draw is rank-uniform after the rank transform,
 * so its median is the till half against the sand and stone half.
 *
 * The line this replaces, moisture above 0.55, was a rainfall line wearing a
 * moisture name. Moisture is half a precipitation index, the runoff gradient
 * holds that index near 0.16 over the interior, and four tenths of a wetness
 * index plus a tenth for aspect cannot make up the rest short of saturation.
 * Only ground within reach of the Atlantic could pass it - and spruce is
 * barred from the 30 km nearest the Atlantic. It banned spruce from the
 * ground spruce holds, and left it under one percent of the land at either
 * rung.
 *
 * The topographic half of a site's moisture is deliberately not in the
 * split. The saturated flat ground is already bog and the thin ground is
 * already rock; what is left between them is separated by what the soil
 * holds, and texture is a field both rungs sample the same way, where a
 * wetness line drawn through the middle of the population is a line neither
 * rung can place to the other's satisfaction.
 */
const SPRUCE_MIN_SOIL = 0.5;

/**
 * What a piece of land below the water is: hydrology section 3's land classes
 * in their order, from the inputs any lattice can compute. The solve calls it
 * per 300 m cell and the fine chunk calls it per 50 m patch, so the rules are
 * stated once and the two lattices differ only in what they measure.
 */
export function landTerrainIndex(hm: number, slope: number, lat: number, coastKm: number, wetness: number, p: number, soil: number): number {
  const treeline = treelineM(lat, coastKm);
  const underTreeline = treeline - hm;
  if (hm > treeline) return TERRAIN_INDEX.fell;
  if (soil < rockRate(coastKm, slope, underTreeline)) return TERRAIN_INDEX.rock;
  if (slope < 0.02 && wetness > 0.5 && p > 0.2) return TERRAIN_INDEX.bog;
  if (underTreeline < 60 || (coastKm < 3 && soil < 0.5)) return TERRAIN_INDEX.meadow;
  const spruceAllowed = coastKm > SPRUCE_COAST_KM && lat < SPRUCE_LAT_LIMIT;
  const spruceSite = soil > SPRUCE_MIN_SOIL;
  if (underTreeline < 150 || coastKm < 10 || (spruceSite && !spruceAllowed)) return TERRAIN_INDEX.birch;
  if (spruceSite) return TERRAIN_INDEX.spruce;
  return TERRAIN_INDEX.pine;
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
    rawSoil[sk] = soilNoiseAtKm(seed, (x + 0.5) * kmPerU, (y + 0.5) * kmPerV);
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
    const wetness = cellWetness(count[i], slope);
    const p = precipitationIndex(coastKm);
    const m = moistureIndex(p, wetness, northFacing);
    moisture[i] = Math.round((m < 0 ? 0 : m > 1 ? 1 : m) * 255);
    terrain[i] = landTerrainIndex(height[i], slope, lat, coastKm, typicalWetness(slope), p, soilAt[i]);
  }
  return { terrain, kind, flags, moisture };
}
