/**
 * The fine chunk: 96 by 96 patches of 50 m built as a refinement of the
 * solved 300 m world, not as a second world. Height is the solve's height
 * interpolated and roughened, water is the solve's water resolved at 50 m,
 * and a channel is the solve's river walked across one cell. Pure in the
 * seed and the solved arrays, and built from a two-parent apron so a chunk
 * is the same whoever asks for it first.
 *
 * The determinism rule of the solve holds here: addition, subtraction,
 * multiplication, division, comparison, square root and the integer-hash
 * noise, and nothing else.
 */
import { derive } from "../rng";
import { CELL_KM } from "../units";
import { DX8, DY8, lakeComponents, priorityFlood } from "./hydro";
import { valueNoiseMetres } from "./noise";
import { FINE_PER_PARENT, PATCH_M } from "./spatial";
import { KIND, type SolvedWorld } from "./solve";
import { upsampleGrid } from "./upsample";

/** Patches to a side of a chunk: 16 parent cells. */
export const FINE_CHUNK = 96;
/** Parent cells of context around the chunk, so interpolation and the flood see past the edge. */
export const APRON_PARENTS = 2;
/** Parents to a side of a chunk. */
export const CHUNK_PARENTS = FINE_CHUNK / FINE_PER_PARENT;

const PARENT_M = CELL_KM * 1000;
/**
 * Detail amplitude at 50 m, metres: the 300 m rung's 12 m and 60 m scaled by
 * the six-to-one step in spacing, so the ground is as rough per metre walked
 * at this rung as at the one above.
 */
const DETAIL_FLAT_M = 2;
const DETAIL_STEEP_M = 10;
/** Wavelength of the fine detail octave, metres: two parent cells. */
const DETAIL_WAVELENGTH_M = 600;

/** A depression this deep is a pool the ground keeps water in; shallower than this it is damp ground. */
export const POOL_MIN_DEPTH_M = 0.3;
/** A depression this deep is a pond: a water patch with its own surface, which the solve could not see at 300 m. */
export const POND_MIN_DEPTH_M = 2;

export interface FineRefinement {
  /** The chunk's origin in patches. */
  x0: number;
  y0: number;
  /** The chunk's extent in patches, clipped at the world's edge. */
  w: number;
  h: number;
  /** Row stride of every array below: a chunk clipped short still indexes as 96 wide. */
  stride: number;
  /** Ground height in metres above sea level per patch. */
  height: Float32Array;
  /** The depression-filled surface: where water would stand before it spills. */
  filled: Float32Array;
  /** KIND per patch: land, sea, lake (a lake of the solve or a pond of this chunk). */
  kind: Uint8Array;
  /** The water surface in metres at a water patch; the ground height elsewhere. */
  surface: Float32Array;
  /** The id of the patch's depression, or -1 outside one. */
  depression: Int32Array;
  /** The spill height in metres of each depression, by id. */
  rims: Float32Array;
}

/** The spill height of the patch's depression, or its own height outside one. */
export function rimAt(chunk: FineRefinement, i: number): number {
  const id = chunk.depression[i];
  return id < 0 ? chunk.height[i] : chunk.rims[id];
}

function seedsFor(seed: number): { detail: number } {
  return { detail: derive(seed, 27) };
}

interface Window {
  /** Parent bounds of the window, px1 and py1 exclusive. */
  px0: number;
  py0: number;
  pw: number;
  ph: number;
  /** Fine bounds of the window. */
  fx0: number;
  fy0: number;
  ww: number;
  wh: number;
}

function windowOf(solved: SolvedWorld, cx: number, cy: number): Window {
  const px0 = Math.max(0, cx * CHUNK_PARENTS - APRON_PARENTS);
  const py0 = Math.max(0, cy * CHUNK_PARENTS - APRON_PARENTS);
  const px1 = Math.min(solved.w, cx * CHUNK_PARENTS + CHUNK_PARENTS + APRON_PARENTS);
  const py1 = Math.min(solved.h, cy * CHUNK_PARENTS + CHUNK_PARENTS + APRON_PARENTS);
  return {
    px0, py0,
    pw: px1 - px0,
    ph: py1 - py0,
    fx0: px0 * FINE_PER_PARENT,
    fy0: py0 * FINE_PER_PARENT,
    ww: (px1 - px0) * FINE_PER_PARENT,
    wh: (py1 - py0) * FINE_PER_PARENT,
  };
}

/**
 * The parent heights as interpolation control points. A sea parent
 * contributes 0 and a lake parent its surface, so the refined surface
 * crosses the water level between a shore parent and the water beside it
 * and the shore takes its shape from the heights.
 */
function controlPoints(solved: SolvedWorld, win: Window): Float32Array {
  const ctrl = new Float32Array(win.pw * win.ph);
  for (let j = 0; j < win.ph; j++) {
    for (let i = 0; i < win.pw; i++) {
      const parent = (win.py0 + j) * solved.w + win.px0 + i;
      ctrl[j * win.pw + i] = solved.kind[parent] === KIND.sea ? 0 : solved.height[parent];
    }
  }
  return ctrl;
}

/**
 * The refined fine surface over the window: bicubic interpolation of the
 * control points plus one slope-scaled detail octave, then each parent's 36
 * children shifted so their mean is the parent's own height. The coarse
 * height is the truth; the fine surface is a refinement of it.
 */
function fineHeights(seed: number, solved: SolvedWorld, win: Window): Float32Array {
  const s = seedsFor(seed);
  const ctrl = controlPoints(solved, win);
  const fine = upsampleGrid({
    src: ctrl,
    sw: win.pw,
    sh: win.ph,
    ratio: FINE_PER_PARENT,
    spacingM: PARENT_M,
    flatM: DETAIL_FLAT_M,
    steepM: DETAIL_STEEP_M,
    detail: (x, y) => valueNoiseMetres((win.fx0 + x + 0.5) * PATCH_M, (win.fy0 + y + 0.5) * PATCH_M, s.detail, DETAIL_WAVELENGTH_M) - 0.5,
  }, win.ww, win.wh);
  for (let j = 0; j < win.ph; j++) {
    for (let i = 0; i < win.pw; i++) {
      const parent = (win.py0 + j) * solved.w + win.px0 + i;
      let sum = 0;
      for (let dy = 0; dy < FINE_PER_PARENT; dy++) {
        const row = (j * FINE_PER_PARENT + dy) * win.ww + i * FINE_PER_PARENT;
        for (let dx = 0; dx < FINE_PER_PARENT; dx++) sum += fine[row + dx];
      }
      const shift = solved.height[parent] - sum / (FINE_PER_PARENT * FINE_PER_PARENT);
      for (let dy = 0; dy < FINE_PER_PARENT; dy++) {
        const row = (j * FINE_PER_PARENT + dy) * win.ww + i * FINE_PER_PARENT;
        for (let dx = 0; dx < FINE_PER_PARENT; dx++) fine[row + dx] += shift;
      }
    }
  }
  return fine;
}

/**
 * Water kind at 50 m, read down from the solved kind rather than copied from
 * it: sea is what lies at or below zero and reaches a sea parent, a lake is
 * what lies at or below an adjacent lake parent's surface and reaches it. So
 * a lake parent may have dry children on its rim and a shore parent wet ones.
 */
function waterKinds(solved: SolvedWorld, win: Window, height: Float32Array): { kind: Uint8Array; surface: Float32Array } {
  const n = win.ww * win.wh;
  const kind = new Uint8Array(n).fill(KIND.land);
  const surface = new Float32Array(height);
  const queue = new Int32Array(n);
  const parentKindAt = (i: number) => {
    const x = i % win.ww;
    const y = (i - x) / win.ww;
    return solved.kind[(win.py0 + Math.floor(y / FINE_PER_PARENT)) * solved.w + win.px0 + Math.floor(x / FINE_PER_PARENT)];
  };
  const spread = (seeds: number[], level: number, mark: number, allowed: (i: number) => boolean) => {
    let head = 0;
    let tail = 0;
    for (const seed of seeds) {
      if (kind[seed] !== KIND.land || height[seed] > level || !allowed(seed)) continue;
      kind[seed] = mark;
      surface[seed] = level;
      queue[tail++] = seed;
    }
    while (head < tail) {
      const c = queue[head++];
      const cx = c % win.ww;
      const cy = (c - cx) / win.ww;
      for (let k = 0; k < 8; k++) {
        const nx = cx + DX8[k];
        const ny = cy + DY8[k];
        if (nx < 0 || ny < 0 || nx >= win.ww || ny >= win.wh) continue;
        const nb = ny * win.ww + nx;
        if (kind[nb] !== KIND.land || height[nb] > level || !allowed(nb)) continue;
        kind[nb] = mark;
        surface[nb] = level;
        queue[tail++] = nb;
      }
    }
  };
  const seaSeeds: number[] = [];
  for (let i = 0; i < n; i++) if (height[i] <= 0 && parentKindAt(i) === KIND.sea) seaSeeds.push(i);
  spread(seaSeeds, 0, KIND.sea, () => true);
  for (let j = 0; j < win.ph; j++) {
    for (let i = 0; i < win.pw; i++) {
      const parent = (win.py0 + j) * solved.w + win.px0 + i;
      if (solved.kind[parent] !== KIND.lake) continue;
      const level = solved.height[parent];
      const seeds: number[] = [];
      for (let dy = 0; dy < FINE_PER_PARENT; dy++) {
        const row = (j * FINE_PER_PARENT + dy) * win.ww + i * FINE_PER_PARENT;
        for (let dx = 0; dx < FINE_PER_PARENT; dx++) seeds.push(row + dx);
      }
      // The lake reaches only into the parents beside its own: "adjacent" is
      // what keeps a lake's surface from flooding every hollow below it.
      const near = (k: number) => {
        const x = k % win.ww;
        const y = (k - x) / win.ww;
        const dx = Math.floor(x / FINE_PER_PARENT) - i;
        const dy = Math.floor(y / FINE_PER_PARENT) - j;
        return dx >= -1 && dx <= 1 && dy >= -1 && dy <= 1;
      };
      spread(seeds, level, KIND.lake, near);
    }
  }
  return { kind, surface };
}

interface Depressions {
  id: Int32Array;
  rims: Float32Array;
}

/**
 * The chunk-local flood: the fine surface filled toward its outlets, which
 * are the window's edge and every patch the solve's water already holds.
 * Each depression of POOL_MIN_DEPTH_M or more is kept with its spill height,
 * and one of POND_MIN_DEPTH_M or more over more than a single patch becomes
 * a pond: water with its own surface.
 */
function floodChunk(win: Window, height: Float32Array, kind: Uint8Array, surface: Float32Array): { filled: Float32Array; depressions: Depressions } {
  const n = win.ww * win.wh;
  const outlet = new Uint8Array(n);
  for (let i = 0; i < n; i++) if (kind[i] !== KIND.land) outlet[i] = 1;
  const filled = priorityFlood(height, win.ww, win.wh, outlet);
  const pooled = lakeComponents(new Float32Array(height), filled, win.ww, win.wh, outlet, POOL_MIN_DEPTH_M);
  const id = new Int32Array(n).fill(-1);
  const rims: number[] = [];
  const stack: number[] = [];
  const cells: number[] = [];
  for (let start = 0; start < n; start++) {
    if (!pooled[start] || id[start] >= 0) continue;
    const next = rims.length;
    stack.length = 0;
    cells.length = 0;
    stack.push(start);
    id[start] = next;
    let rim = filled[start];
    while (stack.length) {
      const c = stack.pop() as number;
      cells.push(c);
      if (filled[c] > rim) rim = filled[c];
      const cx = c % win.ww;
      const cy = (c - cx) / win.ww;
      for (let k = 0; k < 8; k++) {
        const nx = cx + DX8[k];
        const ny = cy + DY8[k];
        if (nx < 0 || ny < 0 || nx >= win.ww || ny >= win.wh) continue;
        const nb = ny * win.ww + nx;
        if (!pooled[nb] || id[nb] >= 0) continue;
        id[nb] = next;
        stack.push(nb);
      }
    }
    rims.push(rim);
    let deepest = 0;
    for (const c of cells) if (rim - height[c] > deepest) deepest = rim - height[c];
    if (deepest < POND_MIN_DEPTH_M || cells.length < 2) continue;
    for (const c of cells) {
      if (height[c] > rim) continue;
      kind[c] = KIND.lake;
      surface[c] = rim;
    }
  }
  return { filled, depressions: { id, rims: new Float32Array(rims) } };
}

/** The chunk's 96 by 96 patch out of a window array. */
function cutOut<T extends { [index: number]: number; length: number }>(out: T, source: T, win: Window, x0: number, y0: number, w: number, h: number): T {
  for (let y = 0; y < h; y++) {
    const from = (y0 - win.fy0 + y) * win.ww + x0 - win.fx0;
    for (let x = 0; x < w; x++) out[y * FINE_CHUNK + x] = source[from + x];
  }
  return out;
}

const PATCHES = FINE_CHUNK * FINE_CHUNK;

export function refineChunk(seed: number, solved: SolvedWorld, cx: number, cy: number): FineRefinement {
  const win = windowOf(solved, cx, cy);
  const x0 = cx * FINE_CHUNK;
  const y0 = cy * FINE_CHUNK;
  const w = Math.min(FINE_CHUNK, solved.w * FINE_PER_PARENT - x0);
  const h = Math.min(FINE_CHUNK, solved.h * FINE_PER_PARENT - y0);
  const height = fineHeights(seed, solved, win);
  const { kind, surface } = waterKinds(solved, win, height);
  const { filled, depressions } = floodChunk(win, height, kind, surface);
  return {
    x0, y0, w, h,
    stride: FINE_CHUNK,
    height: cutOut(new Float32Array(PATCHES), height, win, x0, y0, w, h),
    filled: cutOut(new Float32Array(PATCHES), filled, win, x0, y0, w, h),
    kind: cutOut(new Uint8Array(PATCHES), kind, win, x0, y0, w, h),
    surface: cutOut(new Float32Array(PATCHES), surface, win, x0, y0, w, h),
    depression: cutOut(new Int32Array(PATCHES).fill(-1), depressions.id, win, x0, y0, w, h),
    rims: depressions.rims,
  };
}
