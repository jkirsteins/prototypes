/**
 * What the eye reaches from where the survivor stands, and what that
 * opens for walking. Range is what the vantage allows and the canopy
 * cuts short, side by side; the dark takes it away. Marks cells, never
 * regions.
 */
import { parentSummary } from "../world/aggregate";
import { canopyHeightAt, FINE_CHUNK, fineSurfaceAt, terrainPeek } from "../world/cells";
import { heightAt, regionPeek, solvedTerrainAt, terrainOf, type World } from "../world/gen";
import { FINE_PER_PARENT, PATCH_KM, PATCH_M, patchId } from "../world/spatial";
import { CANOPY_HEIGHT_M } from "../world/terrain";
import type { Calendar } from "./calendar";
import { CLEAR_MOR_KM, MAX_OPTICAL_DEPTH, sampleAtmosphere } from "./climate";
import { lightFactor, skyLux, SPOT_LUX, WALK_LUX } from "./light";
import { markCoarseKnown, markKnown } from "./mapped";
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

/**
 * The farthest this game claims the eye reaches, in metres. Two limits bound
 * a view of the ground and the smaller of them is the honest one.
 *
 * Geometry: the curvature horizon is HORIZON_KM_PER_SQRT_M times the root of
 * the vantage's height, and the solve puts the world's highest ground near
 * 2900 m above the sea (2966 m, 2827 m and 2894 m on seeds 1, 42 and 79;
 * fells a survivor actually stands on are a few hundred metres of prominence
 * above the ground around them). Even the highest summit's line runs about
 * 190 km, and 600 m of prominence - the plateau PLATEAU_M the terrain model
 * builds to - about 87 km. A ground target adds nothing: it stands at the
 * far end's own sea level.
 *
 * Air: clear air has itself taken terrain contrast below the threshold the
 * eye can hold by CLEAR_MOR_KM (climate.ts), so nothing past 50 km is
 * distinguishable from the sky whatever the geometry allows. Above about
 * 200 m of vantage the air is always the binding limit, and below it the
 * geometry already caps the reach on its own.
 *
 * So 50 km is the maximum, and every reach in this module is capped by it.
 * What that leaves to pay for: 50 km is a thousand patches, and reading a
 * disc of that radius patch by patch is millions of patches from one look.
 * Only the close ring (FINE_VIEWSHED_PATCHES, 4.8 km) is read at 50 m; the
 * rest of the horizon is read at 300 m parents and 900 m aggregates, from
 * the solved arrays, and written as coarse knowledge.
 */
export const SIGHT_HORIZON_M = CLEAR_MOR_KM * 1000;
/** The horizon in patches, floored: claiming a little short is safer than claiming ground the air has already taken. */
export const SIGHT_HORIZON_CELLS = Math.floor(SIGHT_HORIZON_M / PATCH_M);
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
  return Math.min(SIGHT_HORIZON_CELLS, Math.floor((HORIZON_KM_PER_SQRT_M * Math.sqrt(Math.max(0, heightM))) / PATCH_KM));
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

/** A vantage is as high as it stands above the lowest ground within this many km, sampled this far apart. */
const PROMINENCE_KM = 20;
const PROMINENCE_SAMPLE_KM = 1.5;

/**
 * Height above the lowest ground within 20 km: what the horizon formula
 * wants. Altitude alone would give a flat plateau a horizon it does not
 * have; a fell above a fjord earns its view from the fjord's surface.
 */
export function prominenceM(world: World, x: number, y: number): number {
  // x and y are patches, so both the reach and the sample spacing are read in
  // patches; the height under each one is its parent's, which is where the
  // solve put the landscape this measures.
  const reach = Math.round(PROMINENCE_KM / PATCH_KM);
  const step = Math.round(PROMINENCE_SAMPLE_KM / PATCH_KM);
  let lowest = heightAt(world, x, y);
  for (let dy = -reach; dy <= reach; dy += step) {
    for (let dx = -reach; dx <= reach; dx += step) {
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
 * How much of the view one patch of standing wood takes, at full canopy:
 * two patches of closed spruce and the view is gone, three of pine, four
 * of birch. A stand that has been cut takes nothing and young growth takes
 * its share by height, through the same canopy the obstruction reads.
 * Trees obstruct unevenly, not as solid 50 m walls: the first patch of a
 * wood shows the wood, and what is behind it fades out over the next few.
 */
const WOOD_COVER: Partial<Record<Terrain, number>> = { spruce: 0.5, pine: 0.34, birch: 0.25 };

function woodCoverAt(world: World, x: number, y: number, terrain: Terrain): number {
  const full = WOOD_COVER[terrain];
  if (!full) return 0;
  const tall = CANOPY_HEIGHT_M[terrain] ?? 0;
  return tall > 0 ? full * Math.min(1, canopyHeightAt(world, patchId(x, y)) / tall) : 0;
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
  // Sharp eyes and a practised one multiply the vantage's own reach, and
  // neither can carry a view past what the air allows: the cap is the last
  // word here as it is on the vantage.
  return Math.max(0, Math.min(SIGHT_HORIZON_CELLS, Math.floor(base * lf * reach * wayfindingSightMult(state))));
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
  const height = Math.max(0, fineSurfaceAt(world, y * world.w + x));
  if (heights.size >= GROUND_HEIGHT_LIMIT) heights.clear();
  heights.set(cell, height);
  return height;
}

/**
 * Height in metres of the surface that can hide ground behind this cell.
 * Close in, a canopy is not a wall: the trees take the view gradually
 * (WOOD_COVER, in marchRay) and the ground under them is what the ray
 * reads. Past FOREST_VISIBILITY_M the canopy stands at its height, so a
 * wood on the far side of a lake still hides the country behind it and a
 * fell still sees over the lot.
 */
function obstacleHeightM(world: World, x: number, y: number, distM: number): number {
  obstacleReads++;
  const ground = groundHeightM(world, x, y);
  // Canopy from the one door, so a clearing lets a ray through and the young
  // growth that follows it stops one at its own height.
  const canopy = distM > FOREST_VISIBILITY_M ? canopyHeightAt(world, patchId(x, y)) : 0;
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
 * bounds settle the whole run of patches the ray crosses inside it. Through
 * a wood the trees take the view a patch at a time (WOOD_COVER): each patch
 * of standing wood crossed inside FOREST_VISIBILITY_M adds its cover, the
 * patch that fills the measure is the last one seen, and a survivor standing
 * among trunks starts with half their own wood's cover already round them.
 */
function marchRay(world: World, cx: number, cy: number, dx: number, dy: number, range: number, inWood: boolean, seen: Set<number>): void {
  const steps = Math.max(Math.abs(dx), Math.abs(dy));
  const observerM = groundHeightM(world, cx, cy) + EYE_HEIGHT_M;
  let horizonSlope = -Infinity;
  let previous = -1;
  let cover = inWood ? woodCoverAt(world, cx, cy, terrainOf(world, cx, cy)) / 2 : 0;
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
    if (distance <= FOREST_RANGE_CELLS) {
      const terrain = terrainOf(world, x, y);
      if (isForest(terrain)) {
        cover += woodCoverAt(world, x, y, terrain);
        if (cover >= 1 - 1e-9) {
          // The trees that close the view are themselves in it.
          seen.add(cell);
          return;
        }
      }
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

/**
 * A campfire is self-luminous, but terrain and cumulative local extinction can
 * still hide it.
 *
 * A flame is read against the dark at CAMPFIRE_CONTRAST_LIMIT rather than the
 * 5% a piece of ground wants, so it survives a longer path through the same
 * air than terrain does, and its horizon is SIGHT_HORIZON_M stretched by that
 * ratio. It is the one range in this file that honestly exceeds the terrain
 * horizon, and it is still a hard stop rather than an open claim.
 */
export const CAMPFIRE_HORIZON_M = SIGHT_HORIZON_M * (CAMPFIRE_MAX_OPTICAL_DEPTH / MAX_OPTICAL_DEPTH);

export function campfireVisible(state: GameState, world: World, observerCell: number, fireCell: number): boolean {
  if (!hasLineOfSight(world, observerCell, fireCell, 1.5)) return false;
  if (observerCell === fireCell) return true;
  const cx = observerCell % world.w;
  const cy = Math.floor(observerCell / world.w);
  if (Math.hypot(fireCell % world.w - cx, Math.floor(fireCell / world.w) - cy) * PATCH_M > CAMPFIRE_HORIZON_M) return false;
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
 * Candidates a viewshed will actually enumerate, in patches. Nothing past
 * SIGHT_HORIZON_CELLS can be optically visible at all; the fine viewshed stops
 * sooner still, at FINE_VIEWSHED_PATCHES, and what lies between the two is
 * coarse country rather than patches (markCoarseSeen).
 */
export function opticalCandidateRangeCells(terrainRange: number): number {
  return Math.min(terrainRange, FINE_VIEWSHED_PATCHES, SIGHT_HORIZON_CELLS);
}

// The far country, read at the grain the solve itself holds.
//
// Past FINE_VIEWSHED_PATCHES a look cannot honestly claim 50 m patches: the
// world does not hold them there until a chunk is built, and building chunks
// to the horizon is the cost this whole design exists to avoid. What it can
// claim is the solved world the patches are refined from - a 300 m parent's
// height and the crowns its terrain carries - so the coarse pass marches the
// same kind of ray over the solved arrays and writes coarse knowledge, never
// patch knowledge and never a chunk.

/** One solved parent, in metres: the step the coarse ray takes and the grain it can claim. */
const COARSE_STEP_M = FINE_PER_PARENT * PATCH_M;
const COARSE_STEP_KM = COARSE_STEP_M / 1000;
/** The sight horizon in parents. */
const COARSE_HORIZON_PARENTS = Math.floor(SIGHT_HORIZON_M / COARSE_STEP_M);
/** The fine viewshed in parents: nearer than this the patches themselves are read and a coarse claim would say less than is already known. */
const COARSE_INNER_PARENTS = Math.ceil((FINE_VIEWSHED_PATCHES * PATCH_M) / COARSE_STEP_M);
/**
 * How wide the fan is, and so how far out a ray is one parent from its
 * neighbours.
 *
 * Rays are cast to every parent on a square perimeter at this radius, which
 * is 8R of them, and each runs to the horizon. The pass must cost no more
 * than the fine viewshed it follows, whose worst case is 8 * 96 rays of 96
 * patch reads - 73728. At 67 parents the fan is 536 rays reading 67 parents
 * out to 20.1 km and a third as many over the 44 parents beyond it, which is
 * 53600 reads, inside that budget.
 *
 * 20 km is therefore where the claim has to get coarser, and the geometry
 * says the same thing: rays one parent apart at 67 parents are 2.5 parents
 * apart at the horizon, so out there a ray no longer crosses every parent it
 * passes between and only the 900 m aggregate it lands in is provably seen.
 */
const COARSE_FAN_PARENTS = 67;
/** Three parents: the smallest aggregate wider than the fan's own spacing at the horizon (2.5 parents, 743 m). */
const COARSE_AGGREGATE_PARENTS = 3;
/** The fine viewshed's own worst case, which the coarse fan must not exceed. */
export const COARSE_WORK_BUDGET = 8 * FINE_VIEWSHED_PATCHES * FINE_VIEWSHED_PATCHES;

/** Solved parents read by the coarse pass since the counter was last cleared: its work count. */
let coarseReads = 0;
export function coarseReadCount(): number { return coarseReads; }
export function clearCoarseReadCount(): void { coarseReads = 0; }

/**
 * Whether one parent exists in the solved arrays. The fine world is the solve
 * refined, so this is the world's own edge; a fixture solved smaller than the
 * lattice stops its rays here rather than reading past its arrays.
 */
function solvedParent(world: World, px: number, py: number): boolean {
  return px >= 0 && py >= 0 && px < world.solved.w && py < world.solved.h;
}

/** The surface a coarse ray is stopped by: the parent's solved ground and whatever its solved terrain stands up. */
function coarseSurfaceM(world: World, px: number, py: number): number {
  coarseReads++;
  const x = px * FINE_PER_PARENT;
  const y = py * FINE_PER_PARENT;
  return Math.max(0, heightAt(world, x, y)) + (CANOPY_HEIGHT_M[solvedTerrainAt(world, x, y)] ?? 0);
}

/**
 * The ground a 900 m aggregate reads as: the terrain of its middle parent,
 * one answer for all nine. A ray that only proved the aggregate never told
 * its parents apart, so nothing may draw them apart either.
 */
export function aggregateTerrain(world: World, x: number, y: number): Terrain {
  const middle = (p: number) => Math.floor(Math.floor(p / FINE_PER_PARENT) / COARSE_AGGREGATE_PARENTS) * COARSE_AGGREGATE_PARENTS + (COARSE_AGGREGATE_PARENTS >> 1);
  const px = middle(x);
  const py = middle(y);
  if (!solvedParent(world, px, py)) return terrainPeek(world, x, y);
  return terrainPeek(world, px * FINE_PER_PARENT, py * FINE_PER_PARENT);
}

/** Every parent of the 900 m aggregate this one belongs to, as the first patch of each. */
function aggregatePatches(world: World, px: number, py: number): number[] {
  const x0 = Math.floor(px / COARSE_AGGREGATE_PARENTS) * COARSE_AGGREGATE_PARENTS;
  const y0 = Math.floor(py / COARSE_AGGREGATE_PARENTS) * COARSE_AGGREGATE_PARENTS;
  const out: number[] = [];
  for (let y = y0; y < y0 + COARSE_AGGREGATE_PARENTS; y++) {
    for (let x = x0; x < x0 + COARSE_AGGREGATE_PARENTS; x++) {
      if (solvedParent(world, x, y)) out.push(patchId(x * FINE_PER_PARENT, y * FINE_PER_PARENT));
    }
  }
  return out;
}

/**
 * One coarse sightline. It carries the highest apparent angle met, exactly as
 * the fine march does, so a ridge at 6 km still hides the country behind it;
 * it also carries the optical depth it has crossed, and stops where the air
 * has taken the ground's contrast, which is what makes a foggy day's far view
 * short without a second rule for it.
 */
function marchCoarseRay(state: GameState, world: World, pcx: number, pcy: number, dx: number, dy: number, fan: number, maxParents: number, observerM: number, sampler: OpticalSampler): void {
  let horizonSlope = -Infinity;
  let opticalDepth = 0;
  let previousDistance = 0;
  for (let i = 1; i <= maxParents;) {
    const px = pcx + Math.round((dx * i) / fan);
    const py = pcy + Math.round((dy * i) / fan);
    if (!solvedParent(world, px, py)) return;
    const distance = Math.hypot(px - pcx, py - pcy);
    if (distance > maxParents) return;
    const step = distance > COARSE_FAN_PARENTS ? COARSE_AGGREGATE_PARENTS : 1;

    opticalDepth += sampler.extinction((px + 0.5) * FINE_PER_PARENT, (py + 0.5) * FINE_PER_PARENT)
      * (distance - previousDistance) * COARSE_STEP_KM;
    previousDistance = distance;
    if (opticalDepth > MAX_OPTICAL_DEPTH) return;

    const distM = distance * COARSE_STEP_M;
    const slope = (coarseSurfaceM(world, px, py) - curvatureDropM(distM) - observerM) / distM;
    if (slope >= horizonSlope - 1e-9) {
      if (distance > COARSE_FAN_PARENTS) {
        for (const patch of aggregatePatches(world, px, py)) markCoarseKnown(state, patch, "aggregate");
      } else if (distance > COARSE_INNER_PARENTS) {
        markCoarseKnown(state, patchId(px * FINE_PER_PARENT, py * FINE_PER_PARENT), "parent");
      }
    }
    horizonSlope = Math.max(horizonSlope, slope);
    i += step;
  }
}

/**
 * A look repeated from the same stop inside the same ten minutes writes bits
 * it has already written: the country does not move and coarse knowledge only
 * ever rises. Standing on a fell for an hour would otherwise pay the whole fan
 * every minute of it.
 */
const COARSE_LOOK_ENTRIES = 32;
const coarseLooks = new Set<string>();

/**
 * What the country beyond the fine viewshed shows from `cell`, as coarsely as
 * it can honestly be claimed. Nothing here reads or builds a fine chunk.
 */
export function markCoarseSeen(state: GameState, world: World, cal: Calendar, cell: number): void {
  const reachPatches = sightReachCells(state, world, cal, cell);
  if (reachPatches <= FINE_VIEWSHED_PATCHES) return;
  const maxParents = Math.min(COARSE_HORIZON_PARENTS, Math.floor(reachPatches / FINE_PER_PARENT));
  if (maxParents <= COARSE_INNER_PARENTS) return;
  const key = `${viewshedWorldId(world)}:${cell}:${maxParents}:${Math.floor((state.minute + state.weather.elapsedMinutes) / 10)}`;
  if (coarseLooks.has(key)) return;
  if (coarseLooks.size >= COARSE_LOOK_ENTRIES) coarseLooks.clear();
  coarseLooks.add(key);

  const cx = cell % world.w;
  const cy = Math.floor(cell / world.w);
  const pcx = Math.floor(cx / FINE_PER_PARENT);
  const pcy = Math.floor(cy / FINE_PER_PARENT);
  const observerM = groundHeightM(world, cx, cy) + EYE_HEIGHT_M;
  const sampler = opticalSampler(state, world);
  const fan = Math.min(COARSE_FAN_PARENTS, maxParents);
  for (let d = -fan; d <= fan; d++) {
    marchCoarseRay(state, world, pcx, pcy, d, -fan, fan, maxParents, observerM, sampler);
    marchCoarseRay(state, world, pcx, pcy, d, fan, fan, maxParents, observerM, sampler);
  }
  for (let d = -fan + 1; d <= fan - 1; d++) {
    marchCoarseRay(state, world, pcx, pcy, -fan, d, fan, maxParents, observerM, sampler);
    marchCoarseRay(state, world, pcx, pcy, fan, d, fan, maxParents, observerM, sampler);
  }
}

/**
 * How much a chooser should value a look from `cell`, in patches worth of
 * ground opened, without marching a single ray.
 *
 * The near part is the square of the reach the fine viewshed will actually
 * enumerate. Past that a look still opens country - it writes coarse
 * knowledge out to the horizon - and that is worth something without being
 * worth the same: one coarse reading covers a parent's thirty-six patches at
 * once, and none of it is ground a route may cross. So far country counts at
 * a thirty-sixth, which is one patch of certainty per parent claimed.
 */
export const COARSE_REVEAL_WEIGHT = 1 / (FINE_PER_PARENT * FINE_PER_PARENT);

export function vantageRevealCells(state: GameState, world: World, cal: Calendar, cell: number): number {
  const reach = sightReachCells(state, world, cal, cell);
  const near = opticalCandidateRangeCells(reach);
  return near ** 2 + COARSE_REVEAL_WEIGHT * Math.max(0, reach ** 2 - near ** 2);
}

/**
 * What the eye reaches from `cell` becomes known ground: the cell
 * underfoot always, then a ray to every cell on the vantage's own range,
 * each one marked until it runs into a canopy that closes the view. Past the
 * patches, the far country the vantage opens is written coarsely.
 */
export function seeFrom(state: GameState, world: World, cal: Calendar, cell: number, announce = true): void {
  for (const visible of visibleCells(state, world, cal, cell)) markKnown(state, visible);
  markCoarseSeen(state, world, cal, cell);
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
