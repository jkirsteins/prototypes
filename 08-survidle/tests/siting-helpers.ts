import { regionState } from "../src/sim/regionstate";
import type { GameState } from "../src/sim/types";
import { cellAt, neighbours, regionAt, type World } from "../src/world/gen";
import { passable } from "../src/world/route";

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
  const cell = regionAt(world, region).campCell;
  regionState(state, world, region).campCell = cell;
  return cell;
}
