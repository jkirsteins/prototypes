/** The geometry of a march arrow: a tapered spear drawn as one filled polygon
 *  from the land an army marches out of to the land it is aimed at.
 *
 *  One polygon rather than a stroked line with a `marker-end`, because a marker
 *  scales off the stroke width and the map's stroke widths are user-space
 *  constants that do not compensate for zoom - the head would swell and shrink
 *  independently of the shaft. A filled polygon is one shape at every zoom.
 *
 *  Pure numbers, no DOM. That matters twice over: `getBBox()` returns zeros
 *  under happy-dom, so a rendering test cannot assert coordinates, and this is
 *  where the shape can actually be checked. Coordinates are the map's own
 *  1000x1400 user space, so anything built from these pans and zooms with the
 *  regions for free. */

export interface SpearOptions {
  /** Half-width where the shaft leaves the source. The widest part of the
   *  shaft, so the arrow reads as coming FROM somewhere. */
  baseHalf: number;
  /** Half-width where the shaft meets the head. Narrower than the base: the
   *  taper is what stops a long arrow reading as a road. */
  waistHalf: number;
  /** Half-width of the barbs. Wider than the base, so the head bites. */
  headHalf: number;
  /** How far back from the tip the barbs sit. */
  headLen: number;
}

export const SPEAR: SpearOptions = {
  baseHalf: 5, waistHalf: 2.5, headHalf: 11, headLen: 26,
};

/** The largest share of the axis the head may eat. Without it a short arrow
 *  between two neighbouring lands would be all head and no shaft, or worse,
 *  have its barbs behind its base. */
const MAX_HEAD_SHARE = 0.55;

export function pointAlong(
  ax: number, ay: number, bx: number, by: number, t: number,
): { x: number; y: number } {
  return { x: ax + (bx - ax) * t, y: ay + (by - ay) * t };
}

/** A spear that fills the lane it was given.
 *
 *  The proportions rather than the sizes are the constant here: a lane is how
 *  much of a shared border this arrow is entitled to, and the barbs filling it
 *  is what makes strength readable as width. `SPEAR` is what a spear asked for
 *  at no particular width comes out as. */
export function spearFor(width: number): SpearOptions {
  const half = width / 2;
  return {
    baseHalf: half * 0.6,
    waistHalf: half * 0.42,
    headHalf: half * 0.95,
    // Long enough to read as a head at every lane width. The share of the
    // AXIS is clamped inside `spearPolygon`, so a short arrow is still mostly
    // shaft.
    headLen: Math.max(12, half * 1.15),
  };
}

/** The `points` attribute of one spear, tip exactly on (bx, by).
 *
 *  Seven points, walked around the outline from the base's left shoulder:
 *  base, waist, barb, tip, barb, waist, base. Symmetric about the axis by
 *  construction, so there is no left-handed and right-handed version to keep
 *  in step. An empty string for a zero-length axis - a march can only run
 *  between two distinct lands, but two region centres coinciding is a data
 *  question, not a reason to emit `NaN` into the DOM. */
export function spearPolygon(
  ax: number, ay: number, bx: number, by: number,
  opts: SpearOptions = SPEAR,
): string {
  const dx = bx - ax;
  const dy = by - ay;
  const len = Math.hypot(dx, dy);
  if (len === 0) return "";
  const ux = dx / len;
  const uy = dy / len;
  // Normal, not normalised separately: (ux, uy) is already a unit vector.
  const nx = -uy;
  const ny = ux;
  const headLen = Math.min(opts.headLen, len * MAX_HEAD_SHARE);
  const wx = bx - ux * headLen;
  const wy = by - uy * headLen;
  const at = (x: number, y: number, half: number, side: 1 | -1): string =>
    `${round(x + nx * half * side)},${round(y + ny * half * side)}`;
  return [
    at(ax, ay, opts.baseHalf, 1),
    at(wx, wy, opts.waistHalf, 1),
    at(wx, wy, opts.headHalf, 1),
    `${round(bx)},${round(by)}`,
    at(wx, wy, opts.headHalf, -1),
    at(wx, wy, opts.waistHalf, -1),
    at(ax, ay, opts.baseHalf, -1),
  ].join(" ");
}

/** SVG coordinates carry three decimals: enough that a rounded shape is
 *  invisible against the unrounded one at any zoom the map allows, short
 *  enough that a `points` string of seven of them stays readable in the DOM
 *  inspector. */
function round(n: number): number {
  return Math.round(n * 1000) / 1000;
}
