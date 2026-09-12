/**
 * What the deleted noise fields still owe their consumers. Each of the three
 * readers here is temporary: section 3 of the close-zoom plan gives every one
 * of them a real source at the fine lattice, and this module goes when the
 * last caller is repointed.
 *
 * Elevation reads the parent cell's solved height, which is what the sight
 * march and the parent summaries already read, so the two agree and a bound
 * still bounds the ground it summarises. The refined height per patch is
 * sitting on the chunk (`chunk.fine.height`) and is what every caller here
 * moves to, together, once the section decides how a 50 m surface enters the
 * optics and the route cost.
 *
 * Exposure and drainage are not readers at all yet: they sit at the value
 * that changes nothing, because the plan derives exposure from the fine
 * slope, the aspect against the wind and the height above the treeline, and
 * drainage from the fine wetness index, and neither is a stored array.
 */
import { inWorld, parentIdx, type World } from "./cells";
import { type PatchId, patchXY } from "./spatial";

/** Ground height in metres above sea level at the patch's parent cell; outside the world is sea level. */
export function temporaryElevationM(world: World, patch: PatchId): number {
  const { x, y } = patchXY(patch);
  if (!inWorld(world, x, y)) return 0;
  return world.solved.height[parentIdx(world, patch)];
}

/** How far a patch stands out of the wind's way, 0 sheltered to 1 bare. Neutral until the plan derives it. */
export const TEMPORARY_EXPOSURE = 0.5;

/** How freely a patch sheds water, 0 ponding to 1 draining. Neutral until the plan derives it. */
export const TEMPORARY_DRAINAGE = 0.5;
