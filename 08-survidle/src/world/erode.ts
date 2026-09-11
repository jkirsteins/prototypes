/**
 * From the template to a landscape: the coarse surface at 1.2 km, a
 * stream-power erosion loop that cuts valleys where water gathers and
 * holds the crest up with uplift, and a bicubic upsample to 300 m with
 * detail noise that is rough on slopes and quiet on plains. Arithmetic
 * and square roots only.
 */
import { CELL_KM } from "../units";
import { accumulate, DIST8, flowDirections, NO_FLOW, priorityFlood, receiverOf } from "./hydro";
import { fbm } from "./noise";
import { seedsFor, templateHeightM, TEMPLATE_H_KM, TEMPLATE_W_KM } from "./terrain";

export const COARSE_KM = 1.2;
const COARSE_PER_FINE = COARSE_KM / CELL_KM;
export const ERODE_ITERATIONS = 30;
/** Erosion strength per iteration: the fraction of the drop to the receiver a one-cell catchment closes. Scales with the square root of catchment area in km2. */
const ERODE_DT_K = 0.08;
/** Uplift per iteration at the crest, metres; elsewhere in proportion to the template height. */
const UPLIFT_CREST_M = 36;
/** Hillslope diffusion per iteration: the share of the gap to the four-neighbour mean that closes. */
const DIFFUSION = 0.1;

export function coarseSize(w: number, h: number): { cw: number; ch: number } {
  return { cw: Math.ceil(w / COARSE_PER_FINE), ch: Math.ceil(h / COARSE_PER_FINE) };
}

/** The template sampled at coarse cell centres, with its uplift field and sea mask. */
export function coarseSurface(seed: number, cw: number, ch: number): { height: Float32Array; uplift: Float32Array; sea: Uint8Array } {
  const n = cw * ch;
  const height = new Float32Array(n);
  const uplift = new Float32Array(n);
  const sea = new Uint8Array(n);
  let crest = 0;
  for (let y = 0; y < ch; y++) {
    for (let x = 0; x < cw; x++) {
      const i = y * cw + x;
      const u = (x + 0.5) / cw;
      const v = (y + 0.5) / ch;
      const h = templateHeightM(seed, u, v);
      height[i] = h;
      sea[i] = h <= 0 ? 1 : 0;
      if (h > crest) crest = h;
    }
  }
  for (let i = 0; i < n; i++) uplift[i] = sea[i] ? 0 : (height[i] > 0 ? UPLIFT_CREST_M * height[i] / crest : 0);
  return { height, uplift, sea };
}

/**
 * Stream-power erosion, implicit in receiver order (Braun and Willett):
 * each cell relaxes toward its receiver by a fraction that grows with the
 * square root of its catchment, after the receiver has been updated, so
 * the scheme is stable at any strength. Then uplift and diffusion.
 */
export function erode(height: Float32Array, cw: number, ch: number, uplift: Float32Array, sea: Uint8Array, iterations: number, onIteration?: (i: number) => void): void {
  const n = cw * ch;
  const cellKm2 = COARSE_KM * COARSE_KM;
  const smoothed = new Float32Array(n);
  for (let it = 0; it < iterations; it++) {
    const filled = priorityFlood(height, cw, ch, sea);
    const dir = flowDirections(filled, cw, ch, sea);
    const { count, order } = accumulate(dir, cw, ch, null);
    for (let k = n - 1; k >= 0; k--) {
      const c = order[k];
      if (sea[c] || dir[c] === NO_FLOW) continue;
      const r = receiverOf(c, dir[c], cw);
      const f = ERODE_DT_K * Math.sqrt(count[c] * cellKm2) / (COARSE_KM * DIST8[dir[c]]);
      height[c] = (height[c] + uplift[c] + f * height[r]) / (1 + f);
    }
    for (let i = 0; i < n; i++) {
      if (sea[i]) { smoothed[i] = height[i]; continue; }
      const x = i % cw;
      const y = (i - x) / cw;
      let sum = 0;
      let m = 0;
      if (x > 0) { sum += height[i - 1]; m++; }
      if (x < cw - 1) { sum += height[i + 1]; m++; }
      if (y > 0) { sum += height[i - cw]; m++; }
      if (y < ch - 1) { sum += height[i + cw]; m++; }
      smoothed[i] = height[i] + DIFFUSION * (sum / m - height[i]);
    }
    height.set(smoothed);
    onIteration?.(it);
  }
}

/** Catmull-Rom weights for a fractional offset t in 0..1. */
function cubic(t: number): [number, number, number, number] {
  const t2 = t * t;
  const t3 = t2 * t;
  return [
    -0.5 * t3 + t2 - 0.5 * t,
    1.5 * t3 - 2.5 * t2 + 1,
    -1.5 * t3 + 2 * t2 + 0.5 * t,
    0.5 * t3 - 0.5 * t2,
  ];
}

/**
 * Bicubic interpolation of the coarse surface onto the fine grid, plus
 * two octaves of detail at 2.5 km whose amplitude is 12 m on flat ground
 * and 60 m on slopes of 15 percent and more.
 */
export function upsample(coarse: Float32Array, cw: number, ch: number, w: number, h: number, seed: number): Float32Array {
  const s = seedsFor(seed);
  const fine = new Float32Array(w * h);
  const at = (x: number, y: number) => coarse[(y < 0 ? 0 : y >= ch ? ch - 1 : y) * cw + (x < 0 ? 0 : x >= cw ? cw - 1 : x)];
  const kmPerFineU = TEMPLATE_W_KM / w;
  const kmPerFineV = TEMPLATE_H_KM / h;
  for (let y = 0; y < h; y++) {
    const gy = (y + 0.5) / COARSE_PER_FINE - 0.5;
    const iy = Math.floor(gy);
    const wy = cubic(gy - iy);
    for (let x = 0; x < w; x++) {
      const gx = (x + 0.5) / COARSE_PER_FINE - 0.5;
      const ix = Math.floor(gx);
      const wx = cubic(gx - ix);
      let v = 0;
      for (let j = 0; j < 4; j++) {
        let row = 0;
        for (let i = 0; i < 4; i++) row += wx[i] * at(ix - 1 + i, iy - 1 + j);
        v += wy[j] * row;
      }
      // Local slope of the coarse surface, metres per metre.
      const cx = Math.min(cw - 1, Math.max(0, Math.round(gx)));
      const cy = Math.min(ch - 1, Math.max(0, Math.round(gy)));
      const dzx = (at(cx + 1, cy) - at(cx - 1, cy)) / (2 * COARSE_KM * 1000);
      const dzy = (at(cx, cy + 1) - at(cx, cy - 1)) / (2 * COARSE_KM * 1000);
      const slope = Math.sqrt(dzx * dzx + dzy * dzy);
      const amp = 12 + 48 * (slope > 0.15 ? 1 : slope / 0.15);
      const xKm = (x + 0.5) * kmPerFineU;
      const yKm = (y + 0.5) * kmPerFineV;
      const detail = (fbm(xKm / 2.5, yKm / 2.5, s.detail, 2) - 0.5) * 2 * amp;
      // The sea keeps its floor: detail on the shelf is a tenth, so no fine cell rises through the surface by noise alone.
      fine[y * w + x] = v <= 0 ? v + detail / 10 : v + detail;
    }
  }
  return fine;
}
