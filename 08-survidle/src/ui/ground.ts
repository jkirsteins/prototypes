/**
 * What the ground looks like under one glyph.
 *
 * terrainAt reduces four continuous fields to a single letter, so every cell in
 * a band draws identically however different the ground is. These rules read
 * the fields back: the letter still names the terrain, its form says where in
 * the band the cell sits. Nothing here invents detail - a variant is only ever
 * a field the world already computed.
 *
 * Only meaningful where a glyph is one cell; a coarser glyph is a block of
 * mixed ground and has no single field to report.
 */
import type { Terrain } from "../sim/types";
import { fieldsAt } from "../world/terrain";

export const TREES: Terrain[] = ["spruce", "pine", "birch"];

/**
 * Where a band splits, measured as its own quantiles rather than picked: bog at
 * its median moisture, meadow at its terciles, so each form is about as common
 * as its siblings and no variant is a rarity the player never learns. The
 * quantiles hold across worlds - `ground.test.ts` re-measures them and fails if
 * a change to terrainAt moves a band out from under these.
 */
export const BOG_WET = 0.68;
export const MEADOW_DAMP = 0.338;
export const MEADOW_DRY = 0.257;

/**
 * Every variant form, in the order the field runs. The legend is built from
 * this table, so a form the map can draw cannot go unexplained - the same
 * contract MARKS holds for the marks.
 */
export const VARIANTS: Partial<Record<Terrain, { forms: string[]; reads: string }>> = {
  water: { forms: ["-", "~"], reads: "lake, sea" },
  bog: { forms: [":", '"'], reads: "drier, wetter" },
  meadow: { forms: ["'", ".", ","], reads: "dry to damp" },
};

/** The glyph for one cell: its terrain's letter, in the form its fields ask for. */
export function groundGlyph(seed: number, x: number, y: number, t: Terrain, base: string): string {
  if (t !== "water" && t !== "bog" && t !== "meadow") return base;
  const f = fieldsAt(seed, x, y);
  if (t === "water") return f.sea ? "~" : "-";
  if (t === "bog") return f.m >= BOG_WET ? '"' : ":";
  return f.m < MEADOW_DRY ? "'" : f.m < MEADOW_DAMP ? "." : ",";
}

/**
 * Whether this cell has turned, in a month where turning happens.
 *
 * The ground does not go over all at once and it does not go over evenly: the
 * dry ground turns first, and it turns while the damp ground beside it is
 * still green. So the patch is the driest band of each terrain - the same
 * bands the glyph forms already come from, measured as each terrain's own
 * quantiles, which is why a turned patch is about a third of a meadow and half
 * a bog rather than a share picked to look right.
 *
 * The birch is not here. A deciduous tree turns as a tree, not as a patch of
 * ground, and every birch on the map goes with the season.
 */
export function turnedGround(seed: number, x: number, y: number, t: Terrain): boolean {
  if (t === "meadow") return fieldsAt(seed, x, y).m < MEADOW_DRY;
  if (t === "bog") return fieldsAt(seed, x, y).m < BOG_WET;
  return false;
}

export interface ToneCuts {
  lo: number;
  hi: number;
}

/**
 * Where the height shading steps, taken from the elevations actually on screen
 * rather than from the world's range. A view spans a narrow slice of that range
 * - a screen of highland forest sits entirely in the world's top few percent -
 * so a fixed global band flattens to one tone and shows nothing at all.
 * Normalising per view is what makes the relief read wherever the player is.
 */
export function toneCuts(elevations: number[]): ToneCuts | null {
  if (elevations.length < 2) return null;
  const s = [...elevations].sort((a, b) => a - b);
  const at = (p: number) => s[Math.min(s.length - 1, Math.floor(s.length * p))];
  const lo = at(1 / 3);
  const hi = at(2 / 3);
  // Ground of one height has no relief to show; every cell keeps the plain tone.
  return hi > lo ? { lo, hi } : null;
}

/** 0 low, 1 the tone the stylesheet already gives the terrain, 2 high. */
export function toneOf(elevation: number, cuts: ToneCuts | null): 0 | 1 | 2 {
  if (!cuts) return 1;
  return elevation < cuts.lo ? 0 : elevation < cuts.hi ? 1 : 2;
}

export function elevationAt(seed: number, x: number, y: number): number {
  return fieldsAt(seed, x, y).e;
}

/**
 * How far out to sea a cell lies, or null for anything that is not sea.
 *
 * `coast` is the field the coastline itself is cut from: it crosses zero at
 * the shore and runs more negative the further out the water goes, so its
 * magnitude is distance offshore without anything new being computed. Lakes
 * sit on the land side of it and have no offshore to speak of, which is why
 * they are excluded rather than shaded as very shallow sea.
 */
export function offshoreAt(seed: number, x: number, y: number): number | null {
  const f = fieldsAt(seed, x, y);
  return f.sea ? -f.coast : null;
}
