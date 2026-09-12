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
import { classifyFine } from "./fine-class";
import { CELL_KM } from "../units";
import { DIST8, DX8, DY8, lakeComponents, NO_FLOW, priorityFlood, receiverOf } from "./hydro";
import { valueNoiseMetres } from "./noise";
import { FINE_PER_PARENT, PATCH_M } from "./spatial";
import { FLAG_STREAM, KIND, type SolvedWorld } from "./solve";
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

/** A channel patch of a river parent. */
export const CHANNEL_RIVER = 1;
/** A channel patch of a parent the solve flagged a stream. */
export const CHANNEL_STREAM = 2;
/** How far a channel patch is cut below the one above it where the fine surface has no way down to the exit, metres. */
const CHANNEL_CUT_M = 0.05;
/**
 * How high a sill a channel cuts through on its way to the exit, metres.
 * Above this the fine ground is holding the water back, so the channel ends
 * in the hollow the flood found and the water leaves the cell by spilling
 * over the rim rather than by a cut channel.
 */
const CHANNEL_SILL_M = 1;
/**
 * Where a channel's water goes when it reaches the end of its path. A reader
 * that has to route across a river or draw one needs the four apart, and -1
 * for `out` cannot tell them apart.
 *
 * - `handed`: into the cell below, at `out`, which is inside this chunk.
 * - `leftChunk`: into the cell below, which is outside this chunk, so `out`
 *   has no chunk-local index. The chunk next door carries it on.
 * - `mouth`: into standing water - the sea, a lake of the solve, or a pond of
 *   this chunk.
 * - `held`: nowhere, along this path. The fine ground holds the water in this
 *   cell, either in the hollow the flood found - the water leaves by spilling
 *   over the rim rather than down a channel - or where the path ran into a
 *   channel already drawn in this cell, which carries it on instead.
 */
export type ChannelOutcome = "handed" | "leftChunk" | "mouth" | "held";

/** One channel across one parent cell: where the water comes in, where it leaves, and the patches between. */
export interface ChannelPath {
  /** The solved cell the channel crosses. */
  parent: number;
  /** The patch the water enters at, chunk-local. */
  entry: number;
  /** The patch it leaves the parent from, chunk-local. */
  exit: number;
  /** Entry to exit inclusive, chunk-local, one patch wide. */
  patches: number[];
  /** Where the water goes from the end of the path. */
  outcome: ChannelOutcome;
  /** The patch in the cell below that the water steps into, chunk-local; -1 unless the outcome is `handed`. */
  out: number;
}

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
  /** CHANNEL_RIVER or CHANNEL_STREAM on a channel patch, 0 elsewhere. */
  channel: Uint8Array;
  /** What the ground is per patch, as a TERRAIN_INDEX: the fine classifier's, not the parent's. */
  terrain: Uint8Array;
  /** The classifier's own slope per patch, quantised: what the weather reads for how bare a patch stands. */
  slope: Uint8Array;
  /** The classifier's own wetness index per patch, quantised: what the weather reads for whether rain stands. */
  wetness: Uint8Array;
  /** The fine flow direction per patch: which way the ground falls, for the aspect against the wind. */
  aspect: Uint8Array;
  /** One path per entry, the parents in the order they were walked. */
  channels: ChannelPath[];
}

/** The discharge a channel patch carries, cubic metres a second: the parent's, referenced rather than copied. */
export function channelDischargeAt(chunk: FineRefinement, solved: SolvedWorld, i: number): number {
  if (!chunk.channel[i]) return 0;
  const x = chunk.x0 + (i % chunk.stride);
  const y = chunk.y0 + Math.floor(i / chunk.stride);
  return solved.discharge[Math.floor(y / FINE_PER_PARENT) * solved.w + Math.floor(x / FINE_PER_PARENT)];
}

/** The spill height of the patch's depression, or its own height outside one. */
export function rimAt(chunk: FineRefinement, i: number): number {
  const id = chunk.depression[i];
  return id < 0 ? chunk.height[i] : chunk.rims[id];
}

function seedsFor(seed: number): { detail: number } {
  return { detail: derive(seed, 27) };
}

/** The parent and fine bounds of the context a chunk is built from: the chunk plus its apron. */
export interface FineWindow {
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

/** The window a chunk is built from: its own parents plus the apron. */
export function fineWindowOf(solved: SolvedWorld, cx: number, cy: number): FineWindow {
  // A chunk beyond the solved arrays has no ground to refine, so the window
  // collapses to one parent rather than going negative.
  const px0 = Math.min(solved.w - 1, Math.max(0, cx * CHUNK_PARENTS - APRON_PARENTS));
  const py0 = Math.min(solved.h - 1, Math.max(0, cy * CHUNK_PARENTS - APRON_PARENTS));
  const px1 = Math.min(solved.w, Math.max(px0 + 1, cx * CHUNK_PARENTS + CHUNK_PARENTS + APRON_PARENTS));
  const py1 = Math.min(solved.h, Math.max(py0 + 1, cy * CHUNK_PARENTS + CHUNK_PARENTS + APRON_PARENTS));
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
function controlPoints(solved: SolvedWorld, win: FineWindow): Float32Array {
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
function fineHeights(seed: number, solved: SolvedWorld, win: FineWindow): Float32Array {
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
function waterKinds(solved: SolvedWorld, win: FineWindow, height: Float32Array): { kind: Uint8Array; surface: Float32Array } {
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
function floodChunk(win: FineWindow, height: Float32Array, kind: Uint8Array, surface: Float32Array): { filled: Float32Array; depressions: Depressions } {
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
      // Four neighbours, the neighbourhood lakeComponents grouped by, so an
      // id is one of its depressions and carries one spill height.
      for (let k = 0; k < 8; k += 2) {
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

/**
 * The channels: the solve's rivers and streams walked across one parent cell
 * at a time, in the order water reaches them, which is the order of their
 * discharge. The water comes in where the parent above it went out, or at the
 * middle of the shared edge when that parent is outside the chunk, and leaves
 * on the side the solve's flow direction points at; between the two it takes
 * the steepest way down the filled fine surface, one patch wide. Where the
 * fine surface does not fall it is cut, by centimetres: a channel is a
 * channel because the water got through.
 */
function carveChannels(solved: SolvedWorld, win: FineWindow, cx: number, cy: number, height: Float32Array, filled: Float32Array, kind: Uint8Array, channel: Uint8Array): { paths: ChannelPath[]; stepOut: Map<number, number> } {
  const flowing: number[] = [];
  for (let j = 0; j < CHUNK_PARENTS; j++) {
    for (let i = 0; i < CHUNK_PARENTS; i++) {
      const px = cx * CHUNK_PARENTS + i;
      const py = cy * CHUNK_PARENTS + j;
      if (px >= solved.w || py >= solved.h) continue;
      const parent = py * solved.w + px;
      if (solved.kind[parent] === KIND.river || (solved.flags[parent] & FLAG_STREAM) !== 0) flowing.push(parent);
    }
  }
  flowing.sort((a, b) => solved.discharge[a] - solved.discharge[b] || a - b);
  const paths: ChannelPath[] = [];
  /** The patch each parent's channel stepped out into, by that parent. */
  const stepOut = new Map<number, number>();
  for (const parent of flowing) {
    const px = parent % solved.w;
    const py = (parent - px) / solved.w;
    const wx0 = (px - win.px0) * FINE_PER_PARENT;
    const wy0 = (py - win.py0) * FINE_PER_PARENT;
    const parentPatches: number[] = [];
    for (let dy = 0; dy < FINE_PER_PARENT; dy++) {
      for (let dx = 0; dx < FINE_PER_PARENT; dx++) parentPatches.push((wy0 + dy) * win.ww + wx0 + dx);
    }
    const dir = solved.flowDir[parent];
    const side = dir === NO_FLOW ? [] : edgePatches(win, wx0, wy0, DX8[dir], DY8[dir]);
    let exit = -1;
    for (const i of side) if (exit < 0 || filled[i] < filled[exit]) exit = i;
    const mark = solved.kind[parent] === KIND.river ? CHANNEL_RIVER : CHANNEL_STREAM;
    for (const entry of entriesOf(solved, win, parent, stepOut, filled)) {
      const patches = trace(win, entry, exit, parentPatches, height, filled, kind);
      const last = patches[patches.length - 1];
      const standing = kind[last] === KIND.sea || kind[last] === KIND.lake;
      const out = !standing && last === exit && dir !== NO_FLOW ? stepBeyond(win, last, dir) : -1;
      const outcome: ChannelOutcome = standing ? "mouth"
        : out >= 0 ? "handed"
        : last === exit && dir !== NO_FLOW ? "leftChunk"
        : "held";
      for (const i of patches) {
        channel[i] = mark;
        if (mark === CHANNEL_RIVER && kind[i] === KIND.land) kind[i] = KIND.river;
      }
      paths.push({ parent, entry, exit: last, patches, outcome, out });
      // The water arrives in the parent below at the patch it stepped into.
      if (out >= 0) stepOut.set(parent, out);
    }
  }
  return { paths, stepOut };
}

/**
 * The patch one step beyond `i` in the direction `dir`, or -1 where that step
 * leaves the window. Stepping by index alone would wrap a row, so the column
 * is checked as well as the index.
 */
function stepBeyond(win: FineWindow, i: number, dir: number): number {
  const x = i % win.ww;
  const y = (i - x) / win.ww;
  const nx = x + DX8[dir];
  const ny = y + DY8[dir];
  if (nx < 0 || ny < 0 || nx >= win.ww || ny >= win.wh) return -1;
  return ny * win.ww + nx;
}

/** The solved cell a window patch belongs to. */
function parentOfWindowPatch(solved: SolvedWorld, win: FineWindow, i: number): number {
  const x = i % win.ww;
  const y = (i - x) / win.ww;
  return (win.py0 + Math.floor(y / FINE_PER_PARENT)) * solved.w + win.px0 + Math.floor(x / FINE_PER_PARENT);
}

/** The parent's patches along the side facing (dx, dy): six along an edge, one at a corner. */
function edgePatches(win: FineWindow, wx0: number, wy0: number, dx: number, dy: number): number[] {
  const out: number[] = [];
  if (dx !== 0 && dy !== 0) {
    out.push((wy0 + (dy > 0 ? FINE_PER_PARENT - 1 : 0)) * win.ww + wx0 + (dx > 0 ? FINE_PER_PARENT - 1 : 0));
  } else if (dx !== 0) {
    const x = wx0 + (dx > 0 ? FINE_PER_PARENT - 1 : 0);
    for (let k = 0; k < FINE_PER_PARENT; k++) out.push((wy0 + k) * win.ww + x);
  } else {
    const y = wy0 + (dy > 0 ? FINE_PER_PARENT - 1 : 0);
    for (let k = 0; k < FINE_PER_PARENT; k++) out.push(y * win.ww + wx0 + k);
  }
  return out;
}

/**
 * Where a parent's channel starts: one entry per parent above it, each the
 * patch that parent's channel stepped into, or the middle of the shared edge
 * when it lies outside the chunk. A parent with nothing above it starts at
 * its highest patch, where the water first gathers.
 */
function entriesOf(solved: SolvedWorld, win: FineWindow, parent: number, stepOut: Map<number, number>, filled: Float32Array): number[] {
  const px = parent % solved.w;
  const py = (parent - px) / solved.w;
  const wx0 = (px - win.px0) * FINE_PER_PARENT;
  const wy0 = (py - win.py0) * FINE_PER_PARENT;
  const out: number[] = [];
  for (let k = 0; k < 8; k++) {
    const qx = px + DX8[k];
    const qy = py + DY8[k];
    if (qx < 0 || qy < 0 || qx >= solved.w || qy >= solved.h) continue;
    const q = qy * solved.w + qx;
    const flowing = solved.kind[q] === KIND.river || (solved.flags[q] & FLAG_STREAM) !== 0;
    if (!flowing || solved.flowDir[q] === NO_FLOW || receiverOf(q, solved.flowDir[q], solved.w) !== parent) continue;
    const passed = stepOut.get(q);
    const side = edgePatches(win, wx0, wy0, DX8[k], DY8[k]);
    const entry = passed !== undefined && parentOfWindowPatch(solved, win, passed) === parent ? passed : side[Math.floor((side.length - 1) / 2)];
    if (!out.includes(entry)) out.push(entry);
  }
  if (out.length > 0) return out;
  let head = wy0 * win.ww + wx0;
  for (let dy = 0; dy < FINE_PER_PARENT; dy++) {
    for (let dx = 0; dx < FINE_PER_PARENT; dx++) {
      const i = (wy0 + dy) * win.ww + wx0 + dx;
      if (filled[i] > filled[head]) head = i;
    }
  }
  return [head];
}

/**
 * From the entry down: the steepest step among the eight neighbours that
 * stays inside the parent or lands on the exit patch. The solve decided
 * which side the water leaves by, so where the fine surface has no way down
 * to that side the rest of the route is the one over the lowest sill, cut by
 * centimetres to keep the water running downhill: a channel is a channel
 * because the water got through.
 */
function trace(win: FineWindow, entry: number, exit: number, parentPatches: number[], height: Float32Array, filled: Float32Array, kind: Uint8Array): number[] {
  const patches = [entry];
  const seen = new Set<number>([entry]);
  let cur = entry;
  const reachable = (i: number) => i === exit || parentPatches.includes(i);
  for (let step = 0; step < FINE_PER_PARENT * FINE_PER_PARENT * 2; step++) {
    if (cur === exit || (kind[cur] !== KIND.land && cur !== entry)) return patches;
    let best = -1;
    let bestSlope = 0;
    const cx = cur % win.ww;
    const cy = (cur - cx) / win.ww;
    for (let k = 0; k < 8; k++) {
      const nx = cx + DX8[k];
      const ny = cy + DY8[k];
      if (nx < 0 || ny < 0 || nx >= win.ww || ny >= win.wh) continue;
      const nb = ny * win.ww + nx;
      if (seen.has(nb) || !reachable(nb)) continue;
      const slope = (filled[cur] - filled[nb]) / DIST8[k];
      if (slope > bestSlope) {
        bestSlope = slope;
        best = nb;
      }
    }
    if (best < 0) break;
    seen.add(best);
    patches.push(best);
    cur = best;
  }
  if (cur === exit || exit < 0) return patches;
  for (const next of overTheSill(win, cur, exit, parentPatches, seen, filled)) {
    const cut = filled[cur] - CHANNEL_CUT_M;
    if (filled[next] > cut) filled[next] = cut;
    if (height[next] > filled[next]) height[next] = filled[next];
    patches.push(next);
    seen.add(next);
    cur = next;
  }
  return patches;
}

/**
 * The rest of the way to the exit over the lowest sill: the route whose
 * highest patch is as low as it can be, which is the route the water finds
 * when the cell holds it back. Label-correcting over the parent's 36
 * patches, so the cost is nothing.
 */
function overTheSill(win: FineWindow, from: number, exit: number, parentPatches: number[], seen: Set<number>, filled: Float32Array): number[] {
  const open = parentPatches.filter((i) => !seen.has(i));
  if (!open.includes(exit)) open.push(exit);
  const cost = new Map<number, number>([[from, filled[from]]]);
  const prev = new Map<number, number>();
  for (let pass = 0; pass < open.length + 1; pass++) {
    let changed = false;
    for (const i of [from, ...open]) {
      const here = cost.get(i);
      if (here === undefined) continue;
      const ix = i % win.ww;
      const iy = (i - ix) / win.ww;
      for (let k = 0; k < 8; k++) {
        const nx = ix + DX8[k];
        const ny = iy + DY8[k];
        if (nx < 0 || ny < 0 || nx >= win.ww || ny >= win.wh) continue;
        const nb = ny * win.ww + nx;
        if (!open.includes(nb)) continue;
        const through = filled[nb] > here ? filled[nb] : here;
        const known = cost.get(nb);
        if (known !== undefined && known <= through) continue;
        cost.set(nb, through);
        prev.set(nb, i);
        changed = true;
      }
    }
    if (!changed) break;
  }
  const sill = cost.get(exit);
  if (sill === undefined || sill - filled[from] > CHANNEL_SILL_M) return [];
  const back: number[] = [];
  let cur = exit;
  while (cur !== from) {
    back.push(cur);
    const up = prev.get(cur);
    if (up === undefined) return [];
    cur = up;
  }
  return back.reverse();
}

/** The chunk's 96 by 96 patch out of a window array. */
function cutOut<T extends { [index: number]: number; length: number }>(out: T, source: T, win: FineWindow, x0: number, y0: number, w: number, h: number): T {
  for (let y = 0; y < h; y++) {
    const from = (y0 - win.fy0 + y) * win.ww + x0 - win.fx0;
    for (let x = 0; x < w; x++) out[y * FINE_CHUNK + x] = source[from + x];
  }
  return out;
}

const PATCHES = FINE_CHUNK * FINE_CHUNK;

export function refineChunk(seed: number, solved: SolvedWorld, cx: number, cy: number): FineRefinement {
  const win = fineWindowOf(solved, cx, cy);
  const x0 = cx * FINE_CHUNK;
  const y0 = cy * FINE_CHUNK;
  const w = Math.max(0, Math.min(FINE_CHUNK, solved.w * FINE_PER_PARENT - x0));
  const h = Math.max(0, Math.min(FINE_CHUNK, solved.h * FINE_PER_PARENT - y0));
  const height = fineHeights(seed, solved, win);
  const { kind, surface } = waterKinds(solved, win, height);
  const { filled, depressions } = floodChunk(win, height, kind, surface);
  const channel = new Uint8Array(win.ww * win.wh);
  const { paths } = carveChannels(solved, win, cx, cy, height, filled, kind, channel);
  const measures = classifyFine(seed, solved, win, x0, y0, w, h, FINE_CHUNK, height, filled, kind);
  const local = (i: number) => {
    const x = i % win.ww;
    const lx = win.fx0 + x - x0;
    const ly = win.fy0 + (i - x) / win.ww - y0;
    return lx < 0 || ly < 0 || lx >= w || ly >= h ? -1 : ly * FINE_CHUNK + lx;
  };
  return {
    x0, y0, w, h,
    stride: FINE_CHUNK,
    height: cutOut(new Float32Array(PATCHES), height, win, x0, y0, w, h),
    filled: cutOut(new Float32Array(PATCHES), filled, win, x0, y0, w, h),
    kind: cutOut(new Uint8Array(PATCHES), kind, win, x0, y0, w, h),
    surface: cutOut(new Float32Array(PATCHES), surface, win, x0, y0, w, h),
    depression: cutOut(new Int32Array(PATCHES).fill(-1), depressions.id, win, x0, y0, w, h),
    rims: depressions.rims,
    channel: cutOut(new Uint8Array(PATCHES), channel, win, x0, y0, w, h),
    terrain: measures.terrain,
    slope: measures.slope,
    wetness: measures.wetness,
    aspect: measures.aspect,
    channels: paths.map((path) => {
      // A handover into a cell of the apron is a handover out of this chunk:
      // the water is the neighbour's from there on.
      const out = path.out < 0 ? -1 : local(path.out);
      return {
        parent: path.parent,
        entry: local(path.entry),
        exit: local(path.exit),
        patches: path.patches.map(local),
        outcome: path.outcome === "handed" && out < 0 ? "leftChunk" as const : path.outcome,
        out,
      };
    }),
  };
}
