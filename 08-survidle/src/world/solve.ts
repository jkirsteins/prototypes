/**
 * The world solve: one pure function from seed and size to the arrays a
 * world is made of. Six stages, each reporting progress, all arithmetic
 * and square roots so every engine solves the same seed to the same
 * cell. Nothing here is stored; a world is solved again from its seed.
 */
import { carveGlacial, classify, FLAG_FORD, FLAG_STREAM, FORD_GRADIENT, KIND, RIVER_M3S, runoffWeights, STREAM_M3S } from "./classify";
import { coarseSize, coarseSurface, erode, ERODE_ITERATIONS, upsample } from "./erode";
import { accumulate, connectedSea, flowDirections, lakeComponents, priorityFlood } from "./hydro";

export { KIND, FLAG_FORD, FLAG_STREAM, RIVER_M3S, STREAM_M3S, FORD_GRADIENT };

export type SolveProgress = (stage: string, fraction: number) => void;
export const STAGES = ["raising the land", "wearing the valleys", "filling the lakes", "cutting the fjords", "naming the ground"] as const;
/** Bumped whenever the solve changes what a seed produces; the node cache is keyed by it. */
export const GENERATOR_VERSION = 2;
/** A depression must be this deep somewhere to be a lake rather than damp ground. */
export const LAKE_MIN_DEPTH_M = 1;

export interface HydrologyResult {
  height: Float32Array;
  sea: Uint8Array;
  lake: Uint8Array;
  dir: Uint8Array;
  count: Uint32Array;
  flow: Float32Array;
  drowned: Uint8Array;
}

export function hydrologyPass(height: Float32Array, w: number, h: number, sea: Uint8Array, weights: Float32Array) {
  const filled = priorityFlood(height, w, h, sea);
  const dir = flowDirections(filled, w, h, sea);
  const { count, flow, order } = accumulate(dir, w, h, weights);
  return { filled, dir, count, flow, order };
}

/** Stages one to five of the six; classification joins in classify.ts: template, erosion, upsample, drainage, carving and the sea re-read, then drainage again with the lakes. */
export function solveHydrology(seed: number, w: number, h: number, onProgress: SolveProgress = () => {}): HydrologyResult {
  onProgress(STAGES[0], 0);
  const { cw, ch } = coarseSize(w, h);
  const coarse = coarseSurface(seed, cw, ch);
  onProgress(STAGES[1], 0);
  erode(coarse.height, cw, ch, coarse.uplift, coarse.sea, ERODE_ITERATIONS, (i) => onProgress(STAGES[1], (i + 1) / ERODE_ITERATIONS));
  const height = upsample(coarse.height, cw, ch, w, h, seed);
  onProgress(STAGES[2], 0);
  const weights = runoffWeights(w, h);
  const seaBefore = connectedSea(height, w, h);
  const first = hydrologyPass(height, w, h, seaBefore, weights);
  onProgress(STAGES[3], 0);
  carveGlacial(height, w, h, first.dir, first.count, first.order, seaBefore);
  const sea = connectedSea(height, w, h);
  const n = w * h;
  const drowned = new Uint8Array(n);
  for (let i = 0; i < n; i++) if (sea[i] && !seaBefore[i]) drowned[i] = 1;
  onProgress(STAGES[3], 0.5);
  const second = hydrologyPass(height, w, h, sea, weights);
  const lake = lakeComponents(height, second.filled, w, h, sea, LAKE_MIN_DEPTH_M);
  onProgress(STAGES[3], 1);
  return { height, sea, lake, dir: second.dir, count: second.count, flow: second.flow, drowned };
}

export interface SolvedWorld {
  w: number;
  h: number;
  /** Metres above sea level; a lake cell carries its surface, a sea cell its floor. */
  height: Int16Array;
  /** 0..7 toward the receiver, NO_FLOW for the sea and the edge. */
  flowDir: Uint8Array;
  /** Cubic metres a second. */
  discharge: Float32Array;
  kind: Uint8Array;
  flags: Uint8Array;
  terrain: Uint8Array;
  /** 0..255 for the ground glyph forms. */
  moisture: Uint8Array;
}

export function solveWorld(seed: number, w: number, h: number, onProgress: SolveProgress = () => {}): SolvedWorld {
  const hydro = solveHydrology(seed, w, h, onProgress);
  onProgress(STAGES[4], 0);
  const { terrain, kind, flags, moisture } = classify(hydro, seed, w, h);
  const height = new Int16Array(w * h);
  for (let i = 0; i < height.length; i++) {
    const v = Math.round(hydro.height[i]);
    height[i] = v < -32768 ? -32768 : v > 32767 ? 32767 : v;
  }
  onProgress(STAGES[4], 1);
  return { w, h, height, flowDir: hydro.dir, discharge: hydro.flow, kind, flags, terrain, moisture };
}

/** The buffers to transfer out of a worker, in the order `fromBuffers` expects. */
export function solvedBuffers(s: SolvedWorld): ArrayBuffer[] {
  return [s.height.buffer, s.flowDir.buffer, s.discharge.buffer, s.kind.buffer, s.flags.buffer, s.terrain.buffer, s.moisture.buffer] as ArrayBuffer[];
}
