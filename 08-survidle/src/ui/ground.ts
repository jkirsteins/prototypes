/**
 * What the ground looks like under one glyph.
 *
 * The classifier reduces the solved ground to a single letter, so every cell
 * in a band draws identically however different the ground is. These rules
 * read the arrays back: the letter still names the terrain, its form says
 * where in the band the cell sits. Nothing here invents detail - a variant is
 * only ever something the solve already computed.
 *
 * Only meaningful where a glyph is one cell; a coarser glyph is a block of
 * mixed ground and has no single value to report.
 */
import type { Terrain } from "../sim/types";
import { fordAt, heightAt, moistureAt, waterKindOf, type World } from "../world/cells";

export const TREES: Terrain[] = ["spruce", "pine", "birch"];

/**
 * Where a band splits, measured as its own quantiles rather than picked: bog at
 * its median moisture, meadow at its terciles, so each form is about as common
 * as its siblings and no variant is a rarity the player never learns. The
 * quantiles hold across worlds - `ground.test.ts` re-measures them and fails if
 * a change to the classifier moves a band out from under these.
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
  river: { forms: ["=", "#"], reads: "river, ford" },
  bog: { forms: [":", '"'], reads: "drier, wetter" },
  meadow: { forms: ["'", ".", ","], reads: "dry to damp" },
};

/** A stream on a land cell is a mark drawn over the terrain, not a form of it: the terrain's own glyph still names the ground. */
export const STREAM_MARK = "~";

/** The glyph for one cell: its terrain's letter, in the form the ground asks for. */
export function groundGlyph(world: World, x: number, y: number, t: Terrain, base: string): string {
  if (t !== "water" && t !== "river" && t !== "bog" && t !== "meadow") return base;
  if (t === "water") return waterKindOf(world, y * world.w + x) === "sea" ? "~" : "-";
  if (t === "river") return fordAt(world, y * world.w + x) ? "#" : "=";
  const m = moistureAt(world, x, y);
  if (t === "bog") return m >= BOG_WET ? '"' : ":";
  return m < MEADOW_DRY ? "'" : m < MEADOW_DAMP ? "." : ",";
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
export function turnedGround(world: World, x: number, y: number, t: Terrain): boolean {
  if (t === "meadow") return moistureAt(world, x, y) < MEADOW_DRY;
  if (t === "bog") return moistureAt(world, x, y) < BOG_WET;
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

/** Metres above sea level, for the tone bands. */
export function elevationAt(world: World, x: number, y: number): number {
  return heightAt(world, x, y);
}

/**
 * How deep the sea is under a cell in metres, or null for anything that is not
 * sea. The sea floor falls away from the shore, so depth stands in for how far
 * out the water lies without anything new being computed. A lake carries its
 * surface rather than its floor and has no depth to read, which is why lakes
 * are excluded rather than shaded as very shallow sea.
 */
export function offshoreAt(world: World, x: number, y: number): number | null {
  if (waterKindOf(world, y * world.w + x) !== "sea") return null;
  return -heightAt(world, x, y);
}
