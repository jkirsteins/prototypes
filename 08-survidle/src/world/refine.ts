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

/** The chunk's 96 by 96 patch out of a window array. */
function cutOut(source: Float32Array, win: Window, x0: number, y0: number, w: number, h: number): Float32Array {
  const out = new Float32Array(FINE_CHUNK * FINE_CHUNK);
  for (let y = 0; y < h; y++) {
    const from = (y0 - win.fy0 + y) * win.ww + x0 - win.fx0;
    for (let x = 0; x < w; x++) out[y * FINE_CHUNK + x] = source[from + x];
  }
  return out;
}

export function refineChunk(seed: number, solved: SolvedWorld, cx: number, cy: number): FineRefinement {
  const win = windowOf(solved, cx, cy);
  const x0 = cx * FINE_CHUNK;
  const y0 = cy * FINE_CHUNK;
  const w = Math.min(FINE_CHUNK, solved.w * FINE_PER_PARENT - x0);
  const h = Math.min(FINE_CHUNK, solved.h * FINE_PER_PARENT - y0);
  const height = fineHeights(seed, solved, win);
  return { x0, y0, w, h, stride: FINE_CHUNK, height: cutOut(height, win, x0, y0, w, h) };
}
