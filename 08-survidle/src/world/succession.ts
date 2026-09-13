/**
 * What felling does to the ground, and what time does to it afterwards. One
 * writer for the ground-change record: every path that changes a patch's
 * standing timber goes through stocks.ts setWoodPatchLeft, and that calls
 * here, so a stand felled out by an axe, by a fire or by the away runner all
 * leave the same clearing behind.
 */
import type { World } from "./cells";
import { invalidatePatch } from "./aggregate";
import { CLEARING_SHARE, successionKind } from "./groundchange";
import type { PatchId } from "./spatial";

/** Day number a minute falls in, the stamp a change carries. */
const MINUTES_PER_DAY = 1440;

/**
 * Records what a patch has become, given the share of a full stand it now
 * carries. Entering and leaving are deliberately different thresholds:
 * ground becomes a clearing only when it is felled past CLEARING_SHARE, but
 * once it is a clearing it stays changed ground - clearing, then young growth
 * - all the way back up to REGROWN_SHARE. Without that gap a stand worked
 * down to a third would flicker in and out of being a wood.
 *
 * Changing a patch invalidates the summaries that bound it, so the map and
 * the sight march do not go on reading a canopy that has been cut down.
 */
export function succeedGround(world: World, id: PatchId, share: number): void {
  const run = world.run;
  if (!run) return;
  const had = run.groundChanges[id];
  if (!had && share > CLEARING_SHARE) return;
  const kind = successionKind(share);
  if (!kind) {
    if (!had) return;
    delete run.groundChanges[id];
    invalidatePatch(world, id);
    return;
  }
  if (had?.kind === kind) return;
  run.groundChanges[id] = { kind, since: Math.floor(run.minute / MINUTES_PER_DAY) };
  invalidatePatch(world, id);
}
