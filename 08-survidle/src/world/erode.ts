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
import { upsampleGrid } from "./upsample";

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

/** Detail amplitude at 300 m, metres: level ground and slopes of 15 percent and more. */
export const COARSE_DETAIL_FLAT_M = 12;
export const COARSE_DETAIL_STEEP_M = 60;
/** Wavelength of the 300 m rung's detail octaves, km. */
const COARSE_DETAIL_KM = 2.5;

/**
 * Bicubic interpolation of the coarse surface onto the fine grid, plus
 * two octaves of detail at 2.5 km whose amplitude is 12 m on flat ground
 * and 60 m on slopes of 15 percent and more. The rung from 300 m to 50 m
 * runs the same helper with its own amplitudes and octave.
 */
export function upsample(coarse: Float32Array, cw: number, ch: number, w: number, h: number, seed: number): Float32Array {
  const s = seedsFor(seed);
  const kmPerFineU = TEMPLATE_W_KM / w;
  const kmPerFineV = TEMPLATE_H_KM / h;
  return upsampleGrid({
    src: coarse,
    sw: cw,
    sh: ch,
    ratio: COARSE_PER_FINE,
    spacingM: COARSE_KM * 1000,
    flatM: COARSE_DETAIL_FLAT_M,
    steepM: COARSE_DETAIL_STEEP_M,
    detail: (x, y) => fbm((x + 0.5) * kmPerFineU / COARSE_DETAIL_KM, (y + 0.5) * kmPerFineV / COARSE_DETAIL_KM, s.detail, 2) - 0.5,
  }, w, h);
}
