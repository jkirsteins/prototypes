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

/** Pull both ends of an axis in along its own direction, so an arrow starts at
 *  the edge of the source land and bites the edge of the target rather than
 *  both ends sitting on region centres. Overrunning insets collapse to the
 *  midpoint instead of turning the segment inside out. */
export function insetSegment(
  ax: number, ay: number, bx: number, by: number,
  fromInset: number, toInset: number,
): { ax: number; ay: number; bx: number; by: number } {
  const dx = bx - ax;
  const dy = by - ay;
  const len = Math.hypot(dx, dy);
  if (len === 0) return { ax, ay, bx, by };
  if (fromInset + toInset >= len) {
    const mid = pointAlong(ax, ay, bx, by, 0.5);
    return { ax: mid.x, ay: mid.y, bx: mid.x, by: mid.y };
  }
  const ux = dx / len;
  const uy = dy / len;
  return {
    ax: ax + ux * fromInset, ay: ay + uy * fromInset,
    bx: bx - ux * toInset, by: by - uy * toInset,
  };
}

/** Slide a segment sideways, perpendicular to its own direction. What keeps a
 *  counter-raid beside the attack it answers rather than drawn straight
 *  through it: two spears nose to nose on the same line read as one confused
 *  shape, and which of them is the attack is exactly what the player needs to
 *  see. Positive `d` is to the left of the direction of travel. */
export function offsetSegment(
  ax: number, ay: number, bx: number, by: number, d: number,
): { ax: number; ay: number; bx: number; by: number } {
  const len = Math.hypot(bx - ax, by - ay);
  if (len === 0 || d === 0) return { ax, ay, bx, by };
  const nx = -(by - ay) / len;
  const ny = (bx - ax) / len;
  return {
    ax: ax + nx * d, ay: ay + ny * d,
    bx: bx + nx * d, by: by + ny * d,
  };
}

/** A spear of the same proportions at a different size, for the answering
 *  half of a clash. Scaling every width by one factor is what keeps the
 *  smaller arrow recognisably the same object rather than a different one. */
export function scaleSpear(opts: SpearOptions, k: number): SpearOptions {
  return {
    baseHalf: opts.baseHalf * k,
    waistHalf: opts.waistHalf * k,
    headHalf: opts.headHalf * k,
    headLen: opts.headLen * k,
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

/** Where along the axis two clashing forces meet, as a fraction from the first
 *  end to the second: the stronger side pushes the meeting point toward the
 *  weaker one, which is where the leftover-damage label goes. Even sides, and
 *  two sides of nothing, meet in the middle.
 *
 *  Clamped away from both ends so a total rout still leaves the label inside
 *  the map rather than on top of the land it is about. */
export function clashFraction(strengthA: number, strengthB: number): number {
  const total = strengthA + strengthB;
  const raw = total <= 0 ? 0.5 : strengthA / total;
  return Math.max(0.15, Math.min(0.85, raw));
}

/** SVG coordinates carry three decimals: enough that a rounded shape is
 *  invisible against the unrounded one at any zoom the map allows, short
 *  enough that a `points` string of seven of them stays readable in the DOM
 *  inspector. */
function round(n: number): number {
  return Math.round(n * 1000) / 1000;
}
