/**
 * What the eye reaches from where the survivor stands, and what that
 * opens for walking. Range is what the vantage allows and the canopy
 * cuts short, side by side; the dark takes it away. Marks cells, never
 * regions.
 */
import { CELL_KM } from "../units";
import { regionPeek, terrainOf, type World } from "../world/gen";
import { fieldsAt } from "../world/terrain";
import type { Calendar } from "./calendar";
import { CLEAR_MOR_KM, MAX_OPTICAL_DEPTH, sampleAtmosphere } from "./climate";
import { lightFactor, skyLux, SPOT_LUX, WALK_LUX } from "./light";
import { markKnown } from "./mapped";
import { discoverAvailableOpportunities } from "./opportunity-catalog";
import { body } from "./person";
import { RUNG_LEVEL, skillLevel } from "./skills";
import type { GameState, LocalGroundWeather, Terrain } from "./types";
import { groundAt, localWeather } from "./weather";

/** A standing eye, metres. */
const EYE_HEIGHT_M = 1.7;
/** The geometric horizon: km = this times the square root of the eye's height in metres. */
const HORIZON_KM_PER_SQRT_M = 3.57;
/**
 * Closed spruce lets almost nothing through: the trunks and the dark below
 * them close the view down to the ground the survivor is already standing
 * on, whatever the horizon formula would say. Closed means wood on every
 * side; trees at a lakeshore or a clearing's edge open onto whatever lies
 * that way, and only the wooded sides stay shut.
 */
const SPRUCE_RANGE_CELLS = 0;
/**
 * Pine and birch keep about 150 m of visibility between the trunks -
 * short of a cell's own 300 m width, so it is read as the immediate ring
 * rather than rounded away to nothing. The same edge rule applies.
 */
const FOREST_VISIBILITY_M = 150;
const FOREST_RANGE_CELLS = 1;
/**
 * The coastal spine this world is drawn from rises to about 1200 m; the
 * elevation field is 0..1 (fell opens at 0.84), so this figure turns the
 * field into metres for the ray geometry and a fell vantage's horizon. The
 * field has no sea-level datum - its lowest land reads about 0.3 - so the
 * horizon it gives a fell is generous; the terrain and hydrology spec
 * replaces it with heights in metres and a prominence cap. The one number
 * here worth arguing with.
 */
const FELL_SPINE_M = 1200;
/** Mean Earth radius, metres; enough here to stop an elevated view claiming ground below its geometric horizon. */
const EARTH_RADIUS_M = 6_371_000;
/** Representative mature canopy tops above the generated ground surface. */
const CANOPY_HEIGHT_M: Partial<Record<Terrain, number>> = { spruce: 22, pine: 17, birch: 14 };
/** A bright point source remains distinguishable at 2% transmitted contrast, below the 5% daylight terrain threshold. */
export const CAMPFIRE_CONTRAST_LIMIT = 0.02;
const CAMPFIRE_MAX_OPTICAL_DEPTH = -Math.log(CAMPFIRE_CONTRAST_LIMIT);

/** Terrain is immutable, so the few daylight ranges repeatedly read from one place can share their expensive results. */
const VIEWSHED_CACHE_ENTRIES = 32;
const VIEWSHED_CACHE_CELL_BUDGET = 200_000;
const viewshedCache = new Map<string, ReadonlySet<number>>();
let viewshedCacheCells = 0;

function cachedViewshed(key: string): ReadonlySet<number> | null {
  const cells = viewshedCache.get(key);
  if (!cells) return null;
  // Refresh insertion order, making the first key the least recently used.
  viewshedCache.delete(key);
  viewshedCache.set(key, cells);
  return cells;
}

function retainViewshed(key: string, cells: ReadonlySet<number>): ReadonlySet<number> {
  while (viewshedCache.size && (viewshedCache.size >= VIEWSHED_CACHE_ENTRIES || viewshedCacheCells + cells.size > VIEWSHED_CACHE_CELL_BUDGET)) {
    const oldest = viewshedCache.keys().next().value;
    if (oldest === undefined) break;
    const dropped = viewshedCache.get(oldest);
    viewshedCache.delete(oldest);
    viewshedCacheCells -= dropped?.size ?? 0;
  }
  viewshedCache.set(key, cells);
  viewshedCacheCells += cells.size;
  return cells;
}

/** Cells to the horizon for a vantage this many metres up, floored: reaching a little short of the true line is safer than claiming ground unseen. */
function horizonCells(heightM: number): number {
  return Math.floor((HORIZON_KM_PER_SQRT_M * Math.sqrt(Math.max(0, heightM))) / CELL_KM);
}

/** The elevation field clamped to the span FELL_SPINE_M scales. */
function groundE(world: World, x: number, y: number): number {
  return Math.min(1, Math.max(0, fieldsAt(world.seed, x, y).e));
}

/** Open ground and water: the plain standing-eye horizon. */
const OPEN_RANGE_CELLS = horizonCells(EYE_HEIGHT_M);

function isForest(t: Terrain): boolean {
  return t === "spruce" || t === "pine" || t === "birch";
}

/**
 * Whether a wooded cell touches open ground or water on any side. A cell is
 * 300 m across and a survivor walks it: standing in trees at a lakeshore they
 * go to the edge and look out, so the wood closes only the sides where the
 * next cell is more wood.
 */
function atWoodEdge(world: World, x: number, y: number): boolean {
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= world.w || ny >= world.h) continue;
      if (!isForest(terrainOf(world, nx, ny))) return true;
    }
  }
  return false;
}

/**
 * The vantage's own canopy or height, before light and eyes ever touch it:
 * closed wood shows its ring at most; a wood edge sees out like the open
 * ground beside it.
 */
function vantageBaseCells(world: World, t: Terrain, x: number, y: number): number {
  if (isForest(t) && !atWoodEdge(world, x, y)) return t === "spruce" ? SPRUCE_RANGE_CELLS : FOREST_RANGE_CELLS;
  if (t === "fell" || t === "rock") return horizonCells(groundE(world, x, y) * FELL_SPINE_M);
  return OPEN_RANGE_CELLS;
}

/** Ordinary eyes read the table as written; poor eyes halve it, sharp eyes add half again. */
const SIGHT_REACH_MULT: Record<0 | 1 | 2, number> = { 0: 0.5, 1: 1, 2: 1.5 };

/**
 * What practice at reading the ground is worth: 1 at wayfinding level 1
 * (an untrained eye reads the table as written), rising to 1.5 by
 * RUNG_LEVEL.pace (20) - the last rung on the ladder, and so the level a
 * skill counts as fully practised in this game's own terms, not the
 * skill cap (50) a level rarely reaches. 1.5 is exactly what
 * SIGHT_REACH_MULT above already gives a survivor born sharp-eyed, and no
 * more: practice earns what a gift gives for free, it does not out-earn
 * it. Clamped rather than kept climbing past 20, since nothing on the
 * ladder promises more once a skill is fully practised.
 */
function wayfindingSightMult(state: GameState): number {
  const fullyPractised = RUNG_LEVEL.pace - 1;
  return 1 + 0.5 * Math.min(1, (skillLevel(state, "wayfinding") - 1) / fullyPractised);
}

/**
 * How far the eye reaches from `cell`, in cells: the vantage's own canopy
 * or height, scaled by how much of the dark-to-daylight span the sky light
 * has climbed (SPOT_LUX is what seeing ground at a distance needs, the same
 * figure a hunter's eye wants), scaled again by how good that eye is and by
 * how practised it is at reading what it sees. A nearby flame lights work,
 * not kilometres of terrain. Not
 * exploring-only: a wayfinder notices more of the country on every walk,
 * not only while deliberately sweeping a region.
 */
export function sightRangeCells(state: GameState, world: World, cal: Calendar, cell: number): number {
  const daylight = sightLux(state, world, cal, cell);
  return Math.max(ringCells(daylight), sightReachAtLux(state, world, cell, daylight));
}

/**
 * How far the eye actually reaches from `cell`, with the ring left out.
 *
 * This is the figure for deciding whether a place is worth walking to. The
 * ring is knowledge from standing somewhere, not from sighting: a spruce
 * thicket shows its neighbours because you are among them and nothing else at
 * any distance, and a chooser that could not tell the two apart would rate a
 * thicket one step away over a hilltop, since its worthless single cell came
 * cheap. What a vantage opens is this, and what a walk reveals is the other.
 */
export function sightReachCells(state: GameState, world: World, cal: Calendar, cell: number): number {
  return sightReachAtLux(state, world, cell, sightLux(state, world, cal, cell));
}

/** Ambient sky light at this cell. A carried torch lights work, not distant terrain. */
function sightLux(state: GameState, world: World, cal: Calendar, cell: number): number {
  const weather = localWeather(state, world, cell);
  return skyLux(cal, weather.clear, weather.snowCm);
}

function sightReachAtLux(state: GameState, world: World, cell: number, lux: number): number {
  const x = cell % world.w;
  const y = Math.floor(cell / world.w);
  const base = vantageBaseCells(world, terrainOf(world, x, y), x, y);
  const lf = lightFactor(lux, SPOT_LUX, 0);
  const reach = SIGHT_REACH_MULT[body(state).sightReach];
  return Math.max(0, Math.floor(base * lf * reach * wayfindingSightMult(state)));
}

/**
 * The ring you are standing in, which no canopy takes away.
 *
 * A cell is 300 m across and a survivor is not a point at its centre: they
 * walk across it, and closed spruce still shows the ground within a few
 * strides. So the cells touching the one under your feet are known whenever
 * there is light enough to walk by - WALK_LUX, the light a person wants
 * underfoot to keep a pace over rough ground, which is already the figure
 * this game uses for that question. Light enough to keep your footing is
 * light enough to see the ground you are about to step onto.
 *
 * Below that it is 0 again, and a night forest closes to your own cell. The
 * ring is not a floor under the whole model: it never lifts what the eye
 * reaches past the neighbours, so the fell is still the only place to see
 * far from and a torch still buys nothing at a distance.
 */
function ringCells(lux: number): number {
  return lightFactor(lux, WALK_LUX, 0) >= 1 ? 1 : 0;
}

/** Height in metres of the surface that can hide ground behind this cell. */
function obstacleHeightM(world: World, x: number, y: number, distM: number): number {
  const ground = groundE(world, x, y) * FELL_SPINE_M;
  const terrain = terrainOf(world, x, y);
  const canopy = terrain === "spruce" || distM > FOREST_VISIBILITY_M ? CANOPY_HEIGHT_M[terrain] ?? 0 : 0;
  return ground + canopy;
}

/**
 * Whether one ground-level subject can be seen from another cell. Unlike the
 * terrain viewshed this is not limited by ambient light: callers provide a
 * realistic range for a luminous or otherwise detectable subject.
 */
export function hasLineOfSight(world: World, observerCell: number, targetCell: number, targetHeightM = EYE_HEIGHT_M): boolean {
  if (observerCell === targetCell) return true;
  const cx = observerCell % world.w;
  const cy = Math.floor(observerCell / world.w);
  const tx = targetCell % world.w;
  const ty = Math.floor(targetCell / world.w);
  const dx = tx - cx;
  const dy = ty - cy;
  const steps = Math.max(Math.abs(dx), Math.abs(dy));
  const totalCells = Math.hypot(dx, dy);
  const totalM = totalCells * CELL_KM * 1000;
  const observerM = groundE(world, cx, cy) * FELL_SPINE_M + EYE_HEIGHT_M;
  const targetM = groundE(world, tx, ty) * FELL_SPINE_M + targetHeightM - (totalM * totalM) / (2 * EARTH_RADIUS_M);
  let previous = observerCell;
  for (let i = 1; i < steps; i++) {
    const x = cx + Math.round((dx * i) / steps);
    const y = cy + Math.round((dy * i) / steps);
    const cell = y * world.w + x;
    if (cell === previous) continue;
    previous = cell;
    const distanceCells = Math.hypot(x - cx, y - cy);
    const distM = distanceCells * CELL_KM * 1000;
    const curvatureDropM = (distM * distM) / (2 * EARTH_RADIUS_M);
    const rayM = observerM + (targetM - observerM) * (distanceCells / totalCells);
    if (obstacleHeightM(world, x, y, distM) - curvatureDropM >= rayM) return false;
  }
  return true;
}

/**
 * Marches one sightline, retaining the highest apparent surface angle met so
 * ridges and canopies hide lower ground beyond them. From inside a wood the
 * trees close each side whose first cell is more wood: that cell is the ring
 * and nothing lies past it, whatever the ground would say.
 */
function marchRay(world: World, cx: number, cy: number, dx: number, dy: number, range: number, inWood: boolean, seen: Set<number>): void {
  const steps = Math.max(Math.abs(dx), Math.abs(dy));
  const observerM = groundE(world, cx, cy) * FELL_SPINE_M + EYE_HEIGHT_M;
  let horizonSlope = -Infinity;
  let previous = -1;
  for (let i = 1; i <= steps; i++) {
    const x = cx + Math.round((dx * i) / steps);
    const y = cy + Math.round((dy * i) / steps);
    if (x < 0 || y < 0 || x >= world.w || y >= world.h) return;
    const cell = y * world.w + x;
    if (cell === previous) continue;
    const first = previous === -1;
    previous = cell;
    const distance = Math.hypot(x - cx, y - cy);
    if (distance > range) return;
    if (first && inWood && isForest(terrainOf(world, x, y))) {
      seen.add(cell);
      return;
    }
    const distM = distance * CELL_KM * 1000;
    const curvatureDropM = (distM * distM) / (2 * EARTH_RADIUS_M);
    const slope = (obstacleHeightM(world, x, y, distM) - curvatureDropM - observerM) / distM;
    if (slope >= horizonSlope - 1e-9) seen.add(cell);
    horizonSlope = Math.max(horizonSlope, slope);
  }
}

export interface OpticalSampler {
  extinction(midX: number, midY: number): number;
}

/** Bilinear midpoint extinction from fixed cell-centre samples; query order cannot change it. */
export function opticalSampler(state: GameState, world: World): OpticalSampler {
  const air = new Map<number, number>();
  const ground = new Map<number, LocalGroundWeather>();
  const minute = state.minute + state.weather.elapsedMinutes;
  const at = (x: number, y: number): number => {
    const cell = y * world.w + x;
    const cached = air.get(cell);
    if (cached !== undefined) return cached;
    const region = regionPeek(world, x, y);
    let localGround = ground.get(region);
    if (!localGround) {
      localGround = groundAt(state, world, region);
      ground.set(region, localGround);
    }
    const extinction = sampleAtmosphere(
      { startDoy: state.weather.startDoy, snowCm: localGround.snowCm },
      world, minute, x, y,
    ).extinctionPerKm;
    air.set(cell, extinction);
    return extinction;
  };
  return {
    extinction(midX, midY) {
      if (midX < 0 || midY < 0 || midX > world.w - 1 || midY > world.h - 1) return Number.POSITIVE_INFINITY;
      const x0 = Math.floor(midX);
      const y0 = Math.floor(midY);
      const x1 = Math.min(world.w - 1, x0 + 1);
      const y1 = Math.min(world.h - 1, y0 + 1);
      const tx = midX - x0;
      const ty = midY - y0;
      const top = at(x0, y0) * (1 - tx) + at(x1, y0) * tx;
      const bottom = at(x0, y1) * (1 - tx) + at(x1, y1) * tx;
      return top * (1 - ty) + bottom * ty;
    },
  };
}

/** Cumulative extinction can only remove contrast. Clear air after a dense band never restores it. */
function contrastReaches(cx: number, cy: number, dx: number, dy: number, sampler: OpticalSampler, maxOpticalDepth = MAX_OPTICAL_DEPTH): boolean {
  const distanceCells = Math.hypot(dx, dy);
  const unitX = dx / distanceCells;
  const unitY = dy / distanceCells;
  const segments = Math.ceil(distanceCells);
  let opticalDepth = 0;
  for (let i = 0; i < segments; i++) {
    const lengthCells = Math.min(1, distanceCells - i);
    const midpointCells = i + lengthCells / 2;
    opticalDepth += sampler.extinction(cx + unitX * midpointCells, cy + unitY * midpointCells)
      * lengthCells * CELL_KM;
    if (opticalDepth > maxOpticalDepth + 1e-12) return false;
  }
  return true;
}

/** A campfire is self-luminous, but terrain and cumulative local extinction can still hide it. */
export function campfireVisible(state: GameState, world: World, observerCell: number, fireCell: number): boolean {
  if (!hasLineOfSight(world, observerCell, fireCell, 1.5)) return false;
  if (observerCell === fireCell) return true;
  const cx = observerCell % world.w;
  const cy = Math.floor(observerCell / world.w);
  return contrastReaches(
    cx,
    cy,
    fireCell % world.w - cx,
    Math.floor(fireCell / world.w) - cy,
    opticalSampler(state, world),
    CAMPFIRE_MAX_OPTICAL_DEPTH,
  );
}

/** Includes the first whole-cell centre beyond clear MOR so the ray test owns the exact boundary. */
export function opticalCandidateRangeCells(terrainRange: number): number {
  return Math.min(terrainRange, Math.ceil(CLEAR_MOR_KM / CELL_KM));
}

/**
 * What the eye reaches from `cell` becomes known ground: the cell
 * underfoot always, then a ray to every cell on the vantage's own range,
 * each one marked until it runs into a canopy that closes the view.
 */
export function seeFrom(state: GameState, world: World, cal: Calendar, cell: number, announce = true): void {
  for (const visible of visibleCells(state, world, cal, cell)) markKnown(state, visible);
  discoverAvailableOpportunities(state, world, cal, announce);
}

/** Ground in sight now, unlike mapped knowledge which survives after the eye moves on. */
export function visibleCells(state: GameState, world: World, cal: Calendar, cell: number): Set<number> {
  // Clear air itself reaches the contrast threshold at CLEAR_MOR_KM, so
  // terrain and eyesight cannot make a farther candidate optically visible.
  const r = opticalCandidateRangeCells(sightRangeCells(state, world, cal, cell));
  const key = `${world.seed}:${world.w}:${world.h}:${cell}:${r}`;
  let terrainVisible = cachedViewshed(key);
  if (!terrainVisible) {
    const terrain = new Set<number>([cell]);
    if (r > 0) {
      const cx = cell % world.w;
      const cy = Math.floor(cell / world.w);
      const inWood = isForest(terrainOf(world, cx, cy));
      // Cast to the enclosing square for dense angular coverage, but stop each
      // ray at the Euclidean radius. Range is a real distance, not a square.
      for (let d = -r; d <= r; d++) {
        marchRay(world, cx, cy, d, -r, r, inWood, terrain);
        marchRay(world, cx, cy, d, r, r, inWood, terrain);
      }
      for (let d = -r + 1; d <= r - 1; d++) {
        marchRay(world, cx, cy, -r, d, r, inWood, terrain);
        marchRay(world, cx, cy, r, d, r, inWood, terrain);
      }
    }
    terrainVisible = retainViewshed(key, terrain);
  }
  const seen = new Set<number>([cell]);
  if (r <= 0) return seen;
  const cx = cell % world.w;
  const cy = Math.floor(cell / world.w);
  const sampler = opticalSampler(state, world);
  for (const target of terrainVisible) {
    if (target === cell) continue;
    const dx = target % world.w - cx;
    const dy = Math.floor(target / world.w) - cy;
    if (contrastReaches(cx, cy, dx, dy, sampler)) seen.add(target);
  }
  return seen;
}
