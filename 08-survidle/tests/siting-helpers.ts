import { cellAt, neighbours, type World } from "../src/world/gen";
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
