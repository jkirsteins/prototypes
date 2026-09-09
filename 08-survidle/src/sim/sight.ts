/**
 * What the eye reaches from where the survivor stands, and what that
 * opens for walking. Range is what the vantage allows and the canopy
 * cuts short; the dark takes it away. Marks cells, never regions.
 */
import { CELL_KM } from "../units";
import { terrainOf, type World } from "../world/gen";
import { fieldsAt } from "../world/terrain";
import type { Calendar } from "./calendar";
import { lightFactor, skyLux, SPOT_LUX, WALK_LUX } from "./light";
import { markKnown } from "./mapped";
import { body } from "./person";
import { RUNG_LEVEL, skillLevel } from "./skills";
import type { GameState, Terrain } from "./types";

/** A standing eye, metres. */
const EYE_HEIGHT_M = 1.7;
/** The geometric horizon: km = this times the square root of the eye's height in metres. */
const HORIZON_KM_PER_SQRT_M = 3.57;
/**
 * Closed spruce lets almost nothing through: the trunks and the dark below
 * them close the view down to the ground the survivor is already standing
 * on, whatever the horizon formula would say.
 */
const SPRUCE_RANGE_CELLS = 0;
/**
 * Pine and birch keep about 150 m of visibility between the trunks -
 * short of a cell's own 300 m width, so it is read as the immediate ring
 * rather than rounded away to nothing.
 */
const FOREST_VISIBILITY_M = 150;
const FOREST_RANGE_CELLS = 1;
/**
 * The coastal spine this world is drawn from rises to about 1200 m; the
 * elevation field is 0..1 (fell opens at 0.84), so a vantage's height above
 * the lowland is its own elevation times this figure. The one number here
 * worth arguing with.
 */
const FELL_SPINE_M = 1200;
/** Mean Earth radius, metres; enough here to stop an elevated view claiming ground below its geometric horizon. */
const EARTH_RADIUS_M = 6_371_000;
/** Representative mature canopy tops above the generated ground surface. */
const CANOPY_HEIGHT_M: Partial<Record<Terrain, number>> = { spruce: 22, pine: 17, birch: 14 };

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

/** Open ground and water: the plain standing-eye horizon. */
const OPEN_RANGE_CELLS = horizonCells(EYE_HEIGHT_M);

/** The vantage's own canopy or height, before light and eyes ever touch it. */
function vantageBaseCells(world: World, t: Terrain, x: number, y: number): number {
  if (t === "spruce") return SPRUCE_RANGE_CELLS;
  if (t === "pine" || t === "birch") return FOREST_RANGE_CELLS;
  if (t === "fell" || t === "rock") return horizonCells(fieldsAt(world.seed, x, y).e * FELL_SPINE_M);
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
  const daylight = skyLux(cal, state.weather.clear, state.weather.snowCm);
  return Math.max(ringCells(daylight), sightReachCells(state, world, cal, cell));
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
  const x = cell % world.w;
  const y = Math.floor(cell / world.w);
  const base = vantageBaseCells(world, terrainOf(world, x, y), x, y);
  const lf = lightFactor(skyLux(cal, state.weather.clear, state.weather.snowCm), SPOT_LUX, 0);
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
  const ground = fieldsAt(world.seed, x, y).e * FELL_SPINE_M;
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
  const observerM = fieldsAt(world.seed, cx, cy).e * FELL_SPINE_M + EYE_HEIGHT_M;
  const targetM = fieldsAt(world.seed, tx, ty).e * FELL_SPINE_M + targetHeightM - (totalM * totalM) / (2 * EARTH_RADIUS_M);
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

/** Marches one sightline, retaining the highest apparent surface angle met so ridges and canopies hide lower ground beyond them. */
function marchRay(world: World, cx: number, cy: number, dx: number, dy: number, range: number, seen: Set<number>): void {
  const steps = Math.max(Math.abs(dx), Math.abs(dy));
  const observerM = fieldsAt(world.seed, cx, cy).e * FELL_SPINE_M + EYE_HEIGHT_M;
  let horizonSlope = -Infinity;
  let previous = -1;
  for (let i = 1; i <= steps; i++) {
    const x = cx + Math.round((dx * i) / steps);
    const y = cy + Math.round((dy * i) / steps);
    if (x < 0 || y < 0 || x >= world.w || y >= world.h) return;
    const cell = y * world.w + x;
    if (cell === previous) continue;
    previous = cell;
    const distance = Math.hypot(x - cx, y - cy);
    if (distance > range) return;
    const distM = distance * CELL_KM * 1000;
    const curvatureDropM = (distM * distM) / (2 * EARTH_RADIUS_M);
    const slope = (obstacleHeightM(world, x, y, distM) - curvatureDropM - observerM) / distM;
    if (slope >= horizonSlope - 1e-9) seen.add(cell);
    horizonSlope = Math.max(horizonSlope, slope);
  }
}

/**
 * What the eye reaches from `cell` becomes known ground: the cell
 * underfoot always, then a ray to every cell on the vantage's own range,
 * each one marked until it runs into a canopy that closes the view.
 */
export function seeFrom(state: GameState, world: World, cal: Calendar, cell: number): void {
  for (const visible of visibleCells(state, world, cal, cell)) markKnown(state, visible);
}

/** Ground in sight now, unlike mapped knowledge which survives after the eye moves on. */
export function visibleCells(state: GameState, world: World, cal: Calendar, cell: number): ReadonlySet<number> {
  const r = sightRangeCells(state, world, cal, cell);
  const key = `${world.seed}:${world.w}:${world.h}:${cell}:${r}`;
  const cached = cachedViewshed(key);
  if (cached) return cached;
  const seen = new Set<number>([cell]);
  if (r <= 0) return retainViewshed(key, seen);
  const cx = cell % world.w;
  const cy = Math.floor(cell / world.w);
  // Cast to the enclosing square for dense angular coverage, but stop each
  // ray at the Euclidean radius. Range is a real distance, not a square.
  for (let d = -r; d <= r; d++) {
    marchRay(world, cx, cy, d, -r, r, seen);
    marchRay(world, cx, cy, d, r, r, seen);
  }
  for (let d = -r + 1; d <= r - 1; d++) {
    marchRay(world, cx, cy, -r, d, r, seen);
    marchRay(world, cx, cy, r, d, r, seen);
  }
  return retainViewshed(key, seen);
}
