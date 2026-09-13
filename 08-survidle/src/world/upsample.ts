/**
 * One rung of refinement: bicubic interpolation of a coarse height grid onto
 * a finer one, plus a detail octave whose amplitude grows with the coarse
 * slope, so a plain stays a plain and a mountainside gains roughness. The
 * solve climbs from 1.2 km to 300 m with it (erode.ts) and the fine chunk
 * climbs from 300 m to 50 m with it (refine.ts): one helper, so the two
 * rungs cannot drift apart. Arithmetic and square roots only.
 */

/** The slope at which the detail amplitude reaches its steep value, metres per metre. */
export const DETAIL_FULL_SLOPE = 0.15;

export interface UpsampleSpec {
  /** The coarse heights, row-major, metres. */
  src: Float32Array;
  sw: number;
  sh: number;
  /** Fine cells to a side of a coarse cell. */
  ratio: number;
  /** Width of a coarse cell in metres: the slope's denominator. */
  spacingM: number;
  /** Detail amplitude in metres on level ground. */
  flatM: number;
  /** Detail amplitude in metres at DETAIL_FULL_SLOPE and steeper. */
  steepM: number;
  /** The detail octave at a fine cell, in -0.5..0.5. */
  detail: (fx: number, fy: number) => number;
}

/** Catmull-Rom weights for a fractional offset t in 0..1. */
export function cubicWeights(t: number): [number, number, number, number] {
  const t2 = t * t;
  const t3 = t2 * t;
  return [
    -0.5 * t3 + t2 - 0.5 * t,
    1.5 * t3 - 2.5 * t2 + 1,
    -1.5 * t3 + 2 * t2 + 0.5 * t,
    0.5 * t3 - 0.5 * t2,
  ];
}

/** The coarse grid at integer coordinates, clamped to its edges. */
export function clampedAt(src: Float32Array, sw: number, sh: number, x: number, y: number): number {
  const cx = x < 0 ? 0 : x >= sw ? sw - 1 : x;
  const cy = y < 0 ? 0 : y >= sh ? sh - 1 : y;
  return src[cy * sw + cx];
}

/** Bicubic sample at fractional coarse coordinates. */
export function bicubicAt(src: Float32Array, sw: number, sh: number, gx: number, gy: number): number {
  const ix = Math.floor(gx);
  const iy = Math.floor(gy);
  const wx = cubicWeights(gx - ix);
  const wy = cubicWeights(gy - iy);
  let v = 0;
  for (let j = 0; j < 4; j++) {
    let row = 0;
    for (let i = 0; i < 4; i++) row += wx[i] * clampedAt(src, sw, sh, ix - 1 + i, iy - 1 + j);
    v += wy[j] * row;
  }
  return v;
}

/** Central-difference slope of the coarse grid at the nearest coarse cell, metres per metre. */
export function coarseSlopeAt(src: Float32Array, sw: number, sh: number, gx: number, gy: number, spacingM: number): number {
  const cx = Math.min(sw - 1, Math.max(0, Math.round(gx)));
  const cy = Math.min(sh - 1, Math.max(0, Math.round(gy)));
  const dzx = (clampedAt(src, sw, sh, cx + 1, cy) - clampedAt(src, sw, sh, cx - 1, cy)) / (2 * spacingM);
  const dzy = (clampedAt(src, sw, sh, cx, cy + 1) - clampedAt(src, sw, sh, cx, cy - 1)) / (2 * spacingM);
  return Math.sqrt(dzx * dzx + dzy * dzy);
}

/** Detail amplitude in metres for a coarse slope. */
export function detailAmplitudeM(slope: number, flatM: number, steepM: number): number {
  return flatM + (steepM - flatM) * (slope > DETAIL_FULL_SLOPE ? 1 : slope / DETAIL_FULL_SLOPE);
}

/**
 * The refined grid, `w` by `h` fine cells covering the coarse grid from its
 * origin. Below sea level the detail is a tenth, so no fine cell rises
 * through the surface by noise alone.
 */
export function upsampleGrid(spec: UpsampleSpec, w: number, h: number): Float32Array {
  const { src, sw, sh, ratio, spacingM, flatM, steepM } = spec;
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    const gy = (y + 0.5) / ratio - 0.5;
    for (let x = 0; x < w; x++) {
      const gx = (x + 0.5) / ratio - 0.5;
      const v = bicubicAt(src, sw, sh, gx, gy);
      const amp = detailAmplitudeM(coarseSlopeAt(src, sw, sh, gx, gy, spacingM), flatM, steepM);
      const detail = spec.detail(x, y) * 2 * amp;
      out[y * w + x] = v <= 0 ? v + detail / 10 : v + detail;
    }
  }
  return out;
}
