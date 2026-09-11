import { regionState } from "../src/sim/regionstate";
import type { GameState, Terrain } from "../src/sim/types";
import { FINE_CHUNK } from "../src/world/cells";
import { cellAt, neighbours, regionAt, type RegionDef, type World } from "../src/world/gen";
import { passable } from "../src/world/route";
import { TERRAIN_INDEX } from "../src/world/terrain";

/**
 * Writes one 50 m patch of an already-generated world. Terrain a seed happens
 * to place is no basis for a fixture at this scale, so a test that needs a
 * particular piece of ground under a particular patch states it outright.
 * The patch's chunk must already exist, which reading any of its cells does.
 */
export function paintPatch(world: World, cell: number, terrain: Terrain, region?: number): number {
  const { x, y } = cellAt(world, cell);
  const chunksW = Math.ceil(world.w / FINE_CHUNK);
  const chunk = world.fineChunks.get(Math.floor(y / FINE_CHUNK) * chunksW + Math.floor(x / FINE_CHUNK));
  if (!chunk) throw new Error(`patch ${cell} has no generated chunk`);
  const i = (y % FINE_CHUNK) * FINE_CHUNK + (x % FINE_CHUNK);
  chunk.terrain[i] = TERRAIN_INDEX[terrain];
  if (region !== undefined) chunk.region[i] = region;
  return cell;
}

/**
 * A cell next to `from`, passable land, in the same region as `from` - so a test can move the
 * player or the camp off a starting cell without landing in water or a neighbouring region.
 * Shared by the siting tests (Task 1's camp reads, Task 2's make-camp task).
 */
export function neighbourLandCell(world: World, from: number): number {
  const region = cellAt(world, from).region;
  const n = neighbours(world, from).find((c) => cellAt(world, c).region === region && passable(cellAt(world, c).terrain));
  if (n === undefined) throw new Error(`cell ${from} has no passable neighbour in its own region`);
  return n;
}

/**
 * The camp a test needs before it can address one, sited the way a survivor
 * would have: on the region's own generated cell, which the world offers as
 * the likeliest ground for one. A fresh region has no camp, so any test whose
 * subject is camp work makes one first; a test whose subject is the absence of
 * a camp must not call this.
 */
export function siteCamp(state: GameState, world: World, region = state.player.region): number {
  const cell = requireCamp(regionAt(world, region));
  regionState(state, world, region).campCell = cell;
  return cell;
}

/** Fixtures that need land must fail clearly if their chosen region is all water. */
export function requireCamp(region: RegionDef): number {
  if (region.campCell === null) throw new Error(`region ${region.id} has no passable camp`);
  return region.campCell;
}
