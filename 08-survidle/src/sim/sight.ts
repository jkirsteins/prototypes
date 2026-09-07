/**
 * What the eye reaches from where the survivor stands, and what that
 * opens for walking. Range is what the vantage allows and the canopy
 * cuts short; the dark takes it away. Marks cells, never regions.
 */
import { CELL_KM } from "../units";
import { terrainOf, type World } from "../world/gen";
import { fieldsAt } from "../world/terrain";
import type { Calendar } from "./calendar";
import { illuminance, lightFactor, SPOT_LUX } from "./light";
import { markKnown } from "./mapped";
import { body } from "./person";
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
 * How far the eye reaches from `cell`, in cells: the vantage's own canopy
 * or height, scaled by how much of the dark-to-daylight span the light
 * here has climbed (SPOT_LUX is what seeing ground at a distance needs,
 * the same figure a hunter's eye wants), scaled again by how good that
 * eye is.
 */
export function sightRangeCells(state: GameState, world: World, cal: Calendar, cell: number): number {
  const x = cell % world.w;
  const y = Math.floor(cell / world.w);
  const base = vantageBaseCells(world, terrainOf(world, x, y), x, y);
  const lf = lightFactor(illuminance(state, world, cal, cell), SPOT_LUX, 0);
  const reach = SIGHT_REACH_MULT[body(state).sightReach];
  return Math.max(0, Math.floor(base * lf * reach));
}

/** Whether the cell at (x, y), this far from the vantage in metres, closes the ray behind it. */
function canopyBlocks(world: World, x: number, y: number, distM: number): boolean {
  const t = terrainOf(world, x, y);
  if (t === "spruce") return true;
  return (t === "pine" || t === "birch") && distM > FOREST_VISIBILITY_M;
}

/** Marches from (cx, cy) toward the cell (cx + dx, cy + dy), marking every cell it crosses until the world's edge or a closed canopy. */
function marchRay(state: GameState, world: World, cx: number, cy: number, dx: number, dy: number): void {
  const steps = Math.max(Math.abs(dx), Math.abs(dy));
  for (let i = 1; i <= steps; i++) {
    const x = cx + Math.round((dx * i) / steps);
    const y = cy + Math.round((dy * i) / steps);
    if (x < 0 || y < 0 || x >= world.w || y >= world.h) return;
    const distM = Math.hypot(x - cx, y - cy) * CELL_KM * 1000;
    const blocked = canopyBlocks(world, x, y, distM);
    markKnown(state, y * world.w + x);
    if (blocked) return;
  }
}

/**
 * What the eye reaches from `cell` becomes known ground: the cell
 * underfoot always, then a ray to every cell on the vantage's own range,
 * each one marked until it runs into a canopy that closes the view.
 */
export function seeFrom(state: GameState, world: World, cal: Calendar, cell: number): void {
  markKnown(state, cell);
  const r = sightRangeCells(state, world, cal, cell);
  if (r <= 0) return;
  const cx = cell % world.w;
  const cy = Math.floor(cell / world.w);
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
      marchRay(state, world, cx, cy, dx, dy);
    }
  }
}
