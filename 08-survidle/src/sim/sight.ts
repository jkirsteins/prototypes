/**
 * What the eye reaches from where the survivor stands, and what that
 * opens for walking. Range is what the vantage allows and the canopy
 * cuts short, side by side; the dark takes it away. Marks cells, never
 * regions.
 */
import { CELL_KM } from "../units";
import { parentSummary } from "../world/aggregate";
import { FINE_CHUNK } from "../world/cells";
import { heightAt, regionPeek, terrainOf, type World } from "../world/gen";
import { FINE_PER_PARENT, PATCH_KM, PATCH_M } from "../world/spatial";
import { CANOPY_HEIGHT_M } from "../world/terrain";
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
 * Pine and birch keep about 150 m of visibility between the trunks: three
 * 50 m patches. Nearer than this their crowns hide nothing, which is why
 * EXACT_SIGHT_M must not be shorter - see the note there.
 */
export const FOREST_VISIBILITY_M = 150;
const FOREST_RANGE_CELLS = Math.round(FOREST_VISIBILITY_M / PATCH_M);
/** Mean Earth radius, metres; enough here to stop an elevated view claiming ground below its geometric horizon. */
const EARTH_RADIUS_M = 6_371_000;
/** A bright point source remains distinguishable at 2% transmitted contrast, below the 5% daylight terrain threshold. */
export const CAMPFIRE_CONTRAST_LIMIT = 0.02;
const CAMPFIRE_MAX_OPTICAL_DEPTH = -Math.log(CAMPFIRE_CONTRAST_LIMIT);

/**
 * Terrain is immutable, so the few daylight ranges repeatedly read from one
 * place can share their expensive results. Entries belong to a world, not to
 * its seed: two worlds can share a seed and differ in the chunks they hold.
 */
const VIEWSHED_CACHE_ENTRIES = 32;
const VIEWSHED_CACHE_CELL_BUDGET = 200_000;
const viewshedCache = new Map<string, ReadonlySet<number>>();
let viewshedCacheCells = 0;
const viewshedWorldIds = new WeakMap<World, number>();
let nextViewshedWorldId = 1;

function viewshedWorldId(world: World): number {
  let id = viewshedWorldIds.get(world);
  if (id === undefined) {
    id = nextViewshedWorldId++;
    viewshedWorldIds.set(world, id);
  }
  return id;
}

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

/** Patches to the horizon for a vantage this many metres up, floored: reaching a little short of the true line is safer than claiming ground unseen. */
function horizonCells(heightM: number): number {
  return Math.floor((HORIZON_KM_PER_SQRT_M * Math.sqrt(Math.max(0, heightM))) / PATCH_KM);
}

/**
 * How far the eye is traced patch by patch, and how far a viewshed is
 * enumerated at all.
 *
 * Inside EXACT_SIGHT_M every 50 m patch on a ray is read for itself: that is
 * the close view, where a boulder field, a lone spruce and the far bank of a
 * stream are all separate ground. Past it the ray steps a 300 m parent at a
 * time and only descends into one whose own elevation and obstruction bounds
 * cannot settle it either way, which is what makes a long view affordable.
 *
 * EXACT_SIGHT_M must be at least FOREST_VISIBILITY_M. A parent summary counts
 * every crown in full, while a ray inside FOREST_VISIBILITY_M discounts pine
 * and birch crowns it is standing among; where the two overlap the summary
 * would stop being an upper bound on what the ray reads, and a bound that is
 * not an upper bound skips visible ground. Keeping the close view the longer
 * of the two keeps the discount inside the exactly-read ring.
 *
 * The enumerated reach stops at one fine chunk, 4.8 km. That is not what an
 * eye can do - clear air carries terrain contrast to CLEAR_MOR_KM, and a fell
 * vantage looks far past that - it is how far this world holds ground at 50 m,
 * and a viewshed that ran to the clear-air range would mark millions of
 * patches from one look. Beyond it the country is read from map aggregates
 * rather than patch by patch, and a vantage's own reach (sightReachCells)
 * keeps saying how far it sees.
 */
export const EXACT_SIGHT_M = FINE_PER_PARENT * PATCH_M;
/** The grain the air is sampled and integrated at, in metres and in patches. */
const OPTICAL_SAMPLE_M = FINE_PER_PARENT * PATCH_M;
const OPTICAL_SAMPLE_PATCHES = OPTICAL_SAMPLE_M / PATCH_M;
const EXACT_SIGHT_PATCHES = EXACT_SIGHT_M / PATCH_M;
const FINE_VIEWSHED_PATCHES = FINE_CHUNK;

/** Exact patch obstructions read since the counter was last cleared: the visibility work count. */
let obstacleReads = 0;
export function obstacleReadCount(): number { return obstacleReads; }
export function clearObstacleReadCount(): void { obstacleReads = 0; }

/** Open ground and water: the plain standing-eye horizon. */
const OPEN_RANGE_CELLS = horizonCells(EYE_HEIGHT_M);

/** A vantage is as high as it stands above the lowest ground within this many km, sampled every five cells. */
const PROMINENCE_KM = 20;
const PROMINENCE_STEP = 5;

/**
 * Height above the lowest ground within 20 km: what the horizon formula
 * wants. Altitude alone would give a flat plateau a horizon it does not
 * have; a fell above a fjord earns its view from the fjord's surface.
 */
export function prominenceM(world: World, x: number, y: number): number {
  const reach = Math.round(PROMINENCE_KM / CELL_KM);
  let lowest = heightAt(world, x, y);
  for (let dy = -reach; dy <= reach; dy += PROMINENCE_STEP) {
    for (let dx = -reach; dx <= reach; dx += PROMINENCE_STEP) {
      const xx = x + dx;
      const yy = y + dy;
      if (xx < 0 || yy < 0 || xx >= world.w || yy >= world.h) continue;
      const v = Math.max(0, heightAt(world, xx, yy));
      if (v < lowest) lowest = v;
    }
  }
  return Math.max(0, heightAt(world, x, y) - lowest);
}

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
  if (t === "fell" || t === "rock" || t === "river") return Math.max(OPEN_RANGE_CELLS, horizonCells(prominenceM(world, x, y) + EYE_HEIGHT_M));
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

/**
 * Ground height in metres at one patch, straight from the physical field, so
 * that a ray and the obstruction bounds of the parent it crosses are reading
 * the same ground. Terrain and elevation are immutable, so a viewshed that
 * crosses the same ground on many rays pays the field once. The cache belongs
 * to the world object, never to save state, and is dropped whole when full.
 */
const GROUND_HEIGHT_LIMIT = 262_144;
const groundHeights = new WeakMap<World, Map<number, number>>();

function groundHeightM(world: World, x: number, y: number): number {
  let heights = groundHeights.get(world);
  if (!heights) {
    heights = new Map();
    groundHeights.set(world, heights);
  }
  const cell = y * world.w + x;
  const cached = heights.get(cell);
  if (cached !== undefined) return cached;
  const height = Math.max(0, heightAt(world, x, y));
  if (heights.size >= GROUND_HEIGHT_LIMIT) heights.clear();
  heights.set(cell, height);
  return height;
}

/** Height in metres of the surface that can hide ground behind this cell. */
function obstacleHeightM(world: World, x: number, y: number, distM: number): number {
  obstacleReads++;
  const ground = groundHeightM(world, x, y);
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
  const totalM = totalCells * PATCH_M;
  const observerM = groundHeightM(world, cx, cy) + EYE_HEIGHT_M;
  const targetM = groundHeightM(world, tx, ty) + targetHeightM - curvatureDropM(totalM);
  let previous = observerCell;
  for (let i = 1; i < steps; i++) {
    const x = cx + Math.round((dx * i) / steps);
    const y = cy + Math.round((dy * i) / steps);
    const cell = y * world.w + x;
    if (cell === previous) continue;
    previous = cell;
    const distanceCells = Math.hypot(x - cx, y - cy);
    const distM = distanceCells * PATCH_M;
    const rayM = observerM + (targetM - observerM) * (distanceCells / totalCells);
    if (obstacleHeightM(world, x, y, distM) - curvatureDropM(distM) >= rayM) return false;
  }
  return true;
}

/** The drop of the curved earth under a level line this far out. */
function curvatureDropM(distM: number): number {
  return (distM * distM) / (2 * EARTH_RADIUS_M);
}

/**
 * Every apparent angle a surface at `heightAboveEyeM` could stand at while it
 * lies between `nearM` and `farM` out.
 *
 * The angle is `height / distance` less the earth's drop, `distance / 2R`, and
 * that is not monotonic in distance. Above the eye it falls away the whole
 * window, so its ends are its extremes. Below the eye it climbs back toward
 * the level as the distance grows - a far low field stands higher in the view
 * than a near one - until the earth's curve overtakes it at
 * `sqrt(2R * drop below the eye)`, which is the one interior extreme there is.
 * Taking one end of the window on faith is what turns a bound into a guess.
 */
function slopeWindow(heightAboveEyeM: number, nearM: number, farM: number): { min: number; max: number } {
  const at = (distM: number) => heightAboveEyeM / distM - distM / (2 * EARTH_RADIUS_M);
  const near = at(nearM);
  const far = at(farM);
  if (heightAboveEyeM >= 0) return { min: far, max: near };
  const turn = Math.sqrt(-2 * EARTH_RADIUS_M * heightAboveEyeM);
  const max = turn > nearM && turn < farM ? at(turn) : Math.max(near, far);
  return { min: Math.min(near, far), max };
}

/**
 * The steepest and shallowest apparent angle anything inside one 300 m parent
 * could stand at, seen from `observerM` between `nearM` and `farM` out.
 *
 * The high bound is the highest angle the parent's tallest obstruction could
 * reach anywhere in that window, and the low bound the lowest angle its
 * lowest bare ground could fall to, so a ray whose horizon is above the high
 * bound has provably nothing to see in there, and one below the low bound has
 * provably nothing hidden. Both are true over the whole window, at any height
 * relative to the eye.
 */
function parentSlopeBounds(world: World, px: number, py: number, observerM: number, nearM: number, farM: number) {
  const summary = parentSummary(world, px, py);
  return {
    high: slopeWindow(summary.maxObstructionM - observerM, nearM, farM).max,
    low: slopeWindow(summary.minElevationM - observerM, nearM, farM).min,
    /** Ground and crowns inside this parent stand within this many metres of each other. */
    reliefM: summary.maxObstructionM - summary.minElevationM,
  };
}

/**
 * How flat a parent must be before its bounds may stand in for the patches
 * inside it on the seen side. A ray that crosses a uniform node takes its
 * upper bound as the new horizon, which is wrong by at most this much height
 * over the distance crossed; open water and a bare flat are uniform, and a
 * stand of spruce never is.
 */
const UNIFORM_RELIEF_M = 1;

/**
 * Marches one sightline, retaining the highest apparent surface angle met so
 * ridges and canopies hide lower ground beyond them. Close in it reads every
 * patch; farther out it takes a parent at a time whenever that parent's
 * bounds settle the whole run of patches the ray crosses inside it. From
 * inside a wood the trees close each side whose first patch is more wood: that
 * patch is the ring and nothing lies past it, whatever the ground would say.
 */
function marchRay(world: World, cx: number, cy: number, dx: number, dy: number, range: number, inWood: boolean, seen: Set<number>): void {
  const steps = Math.max(Math.abs(dx), Math.abs(dy));
  const observerM = groundHeightM(world, cx, cy) + EYE_HEIGHT_M;
  let horizonSlope = -Infinity;
  let previous = -1;
  const xAt = (i: number) => cx + Math.round((dx * i) / steps);
  const yAt = (i: number) => cy + Math.round((dy * i) / steps);
  for (let i = 1; i <= steps; i++) {
    const x = xAt(i);
    const y = yAt(i);
    if (x < 0 || y < 0 || x >= world.w || y >= world.h) return;
    const distance = Math.hypot(x - cx, y - cy);
    if (distance > range) return;
    const cell = y * world.w + x;
    if (cell === previous) continue;
    const first = previous === -1;
    if (first && inWood && isForest(terrainOf(world, x, y))) {
      seen.add(cell);
      return;
    }

    // A run of steps inside one parent, past the close view, may be settled whole.
    if (distance > EXACT_SIGHT_PATCHES) {
      const px = Math.floor(x / FINE_PER_PARENT);
      const py = Math.floor(y / FINE_PER_PARENT);
      let last = i;
      while (last + 1 <= steps) {
        const nx = xAt(last + 1);
        const ny = yAt(last + 1);
        if (nx < 0 || ny < 0 || nx >= world.w || ny >= world.h) break;
        if (Math.floor(nx / FINE_PER_PARENT) !== px || Math.floor(ny / FINE_PER_PARENT) !== py) break;
        if (Math.hypot(nx - cx, ny - cy) > range) break;
        last++;
      }
      const farM = Math.hypot(xAt(last) - cx, yAt(last) - cy) * PATCH_M;
      const bounds = parentSlopeBounds(world, px, py, observerM, distance * PATCH_M, farM);
      if (bounds.high < horizonSlope - 1e-9) {
        // Nothing in here reaches over the horizon already met.
        previous = yAt(last) * world.w + xAt(last);
        i = last;
        continue;
      }
      if (bounds.reliefM <= UNIFORM_RELIEF_M && bounds.low >= horizonSlope - 1e-9) {
        for (let j = i; j <= last; j++) seen.add(yAt(j) * world.w + xAt(j));
        horizonSlope = Math.max(horizonSlope, bounds.high);
        previous = yAt(last) * world.w + xAt(last);
        i = last;
        continue;
      }
    }

    previous = cell;
    const distM = distance * PATCH_M;
    const slope = (obstacleHeightM(world, x, y, distM) - curvatureDropM(distM) - observerM) / distM;
    if (slope >= horizonSlope - 1e-9) seen.add(cell);
    horizonSlope = Math.max(horizonSlope, slope);
  }
}

export interface OpticalSampler {
  extinction(midX: number, midY: number): number;
}

/**
 * Bilinear midpoint extinction from fixed sample points; query order cannot
 * change it.
 *
 * The air is sampled every OPTICAL_SAMPLE_M rather than at every patch. The
 * finest thing in the atmosphere is the subordinate 1.2 km detail lattice, so
 * a 300 m grid already resolves its shortest wave four times over, and a ray
 * across kilometres of country costs tens of atmospheric samples instead of
 * thousands.
 */
export function opticalSampler(state: GameState, world: World): OpticalSampler {
  const air = new Map<number, number>();
  const ground = new Map<number, LocalGroundWeather>();
  const minute = state.minute + state.weather.elapsedMinutes;
  // Sample indices are grid nodes OPTICAL_SAMPLE_PATCHES apart, in patches.
  const at = (ix: number, iy: number): number => {
    const key = iy * world.w + ix;
    const cached = air.get(key);
    if (cached !== undefined) return cached;
    const x = Math.min(world.w - 1, ix * OPTICAL_SAMPLE_PATCHES);
    const y = Math.min(world.h - 1, iy * OPTICAL_SAMPLE_PATCHES);
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
    air.set(key, extinction);
    return extinction;
  };
  return {
    extinction(midX, midY) {
      if (midX < 0 || midY < 0 || midX > world.w - 1 || midY > world.h - 1) return Number.POSITIVE_INFINITY;
      const nodeX = midX / OPTICAL_SAMPLE_PATCHES;
      const nodeY = midY / OPTICAL_SAMPLE_PATCHES;
      const lastX = Math.floor((world.w - 1) / OPTICAL_SAMPLE_PATCHES);
      const lastY = Math.floor((world.h - 1) / OPTICAL_SAMPLE_PATCHES);
      const x0 = Math.min(lastX, Math.floor(nodeX));
      const y0 = Math.min(lastY, Math.floor(nodeY));
      const x1 = Math.min(lastX, x0 + 1);
      const y1 = Math.min(lastY, y0 + 1);
      const tx = nodeX - x0;
      const ty = nodeY - y0;
      const top = at(x0, y0) * (1 - tx) + at(x1, y0) * tx;
      const bottom = at(x0, y1) * (1 - tx) + at(x1, y1) * tx;
      return top * (1 - ty) + bottom * ty;
    },
  };
}

/**
 * Cumulative extinction can only remove contrast. Clear air after a dense band
 * never restores it. The ray is integrated in OPTICAL_SAMPLE_M steps, the same
 * grain the air itself is sampled at.
 */
function contrastReaches(cx: number, cy: number, dx: number, dy: number, sampler: OpticalSampler, maxOpticalDepth = MAX_OPTICAL_DEPTH): boolean {
  const distanceCells = Math.hypot(dx, dy);
  const unitX = dx / distanceCells;
  const unitY = dy / distanceCells;
  const segments = Math.ceil(distanceCells / OPTICAL_SAMPLE_PATCHES);
  let opticalDepth = 0;
  for (let i = 0; i < segments; i++) {
    const lengthCells = Math.min(OPTICAL_SAMPLE_PATCHES, distanceCells - i * OPTICAL_SAMPLE_PATCHES);
    const midpointCells = i * OPTICAL_SAMPLE_PATCHES + lengthCells / 2;
    opticalDepth += sampler.extinction(cx + unitX * midpointCells, cy + unitY * midpointCells)
      * lengthCells * PATCH_KM;
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

/**
 * Candidates a viewshed will actually enumerate, in patches. Clear air itself
 * reaches the contrast threshold at CLEAR_MOR_KM, so nothing farther can be
 * optically visible; the fine viewshed stops sooner still, at FINE_VIEWSHED_PATCHES.
 * The first whole patch beyond the limit is included so the ray test owns the
 * exact boundary.
 */
export function opticalCandidateRangeCells(terrainRange: number): number {
  return Math.min(terrainRange, FINE_VIEWSHED_PATCHES, Math.ceil(CLEAR_MOR_KM / PATCH_KM));
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
  const key = `${viewshedWorldId(world)}:${cell}:${r}`;
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
