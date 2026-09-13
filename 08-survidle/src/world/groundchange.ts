/**
 * Ground the run itself changed: the one saved override on top of generated
 * terrain. A chunk's terrain array is what the seed grows and is never
 * written to, so felling a stand out cannot be recorded there; it is recorded
 * here, sparse and keyed by the patch it happened on, and every reader a
 * mechanic uses goes through it (cells.ts).
 *
 * Only forest succession writes here so far. The shape is general because the
 * next thing that changes ground - a burn, a dug-out bank - wants the same
 * record rather than one of its own.
 */
import type { Terrain } from "../sim/types";
import type { PatchId } from "./spatial";

/**
 * What stands on cleared ground. A clearing is open: felled stumps, grass and
 * whatever comes up in the first years. Young growth is the thicket that
 * follows, too small to fell but tall enough to stop a view.
 */
export type GroundChangeKind = "clearing" | "young";

/** One patch's change: what it is now, and the day number it became that. */
export interface GroundChange { kind: GroundChangeKind; since: number }

export type GroundChanges = Record<PatchId, GroundChange>;

/**
 * The terrain a changed patch reads as to every mechanic: open ground. A
 * clearing keeps no canopy and a thicket of saplings is not a stand, so
 * shelter, wind, wildlife habitat and felling all meet meadow there. What
 * separates the two is the canopy below, which a young stand has and a
 * clearing does not.
 */
export const GROUND_CHANGE_TERRAIN: Record<GroundChangeKind, Terrain> = { clearing: "meadow", young: "meadow" };

/**
 * Share of a full stand below which the ground is no longer forest. A stand
 * felled past nine tenths of its stems is a cutover with stumps on it, not a
 * wood: the tenth that is left is the scattered small stuff an axe passed by.
 */
export const CLEARING_SHARE = 0.1;

/**
 * Share at which a clearing has become a thicket. Three tenths of a full
 * stand's stems, coming back evenly over the rotation, is young growth with
 * its own closing canopy and nothing in it yet worth felling.
 */
export const YOUNG_SHARE = 0.3;

/**
 * Share at which the ground is a wood again and the override is dropped.
 * Seven tenths of full stocking is a stand a survivor can work; the last
 * three tenths are the slow filling out that a closed canopy does anyway.
 */
export const REGROWN_SHARE = 0.7;

/**
 * How tall a young stand stands, metres. Boreal regeneration is 5 to 8 m
 * through the decades it spends between thicket and pole stage, well under
 * the 14 to 22 m of the mature canopies in terrain.ts, and enough to block a
 * line of sight that a clearing would let through.
 */
export const YOUNG_CANOPY_M = 6;

/**
 * What a patch is, given the share of a full stand it carries. A stand grows
 * back its full stocking over its rotation, so the shares are also a clock:
 * at a rotation of 100 years, bare ground is a clearing for its first 30
 * years, young growth for the 40 after that, and forest again at 70.
 */
export function successionKind(share: number): GroundChangeKind | null {
  if (share >= REGROWN_SHARE) return null;
  return share <= YOUNG_SHARE ? "clearing" : "young";
}
