/**
 * The fine chunk's contract with the solved world, from the close-zoom plan's
 * section 6. The chunk is a refinement of the 300 m solve, not a second
 * world: its heights average back to the parents, its water is the solve's
 * water at 50 m, and its channels run downhill from an entry to the exit the
 * solve's flow direction chose.
 *
 * The fixture is a miniature solve (240 by 320 cells, about 120 ms) rather
 * than the real 1800 by 2224 world: the refinement is pure in the seed and
 * the solved arrays and does not know how large they are, and a fast fixture
 * keeps these cases in the fast suite where the gate is.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { DX8, DY8, NO_FLOW, receiverOf } from "../src/world/hydro";
import { CHANNEL_RIVER, CHANNEL_STREAM, channelDischargeAt, FINE_CHUNK, type FineRefinement, POND_MIN_DEPTH_M, POOL_MIN_DEPTH_M, refineChunk, rimAt } from "../src/world/refine";
import { FLAG_STREAM, KIND, solveWorld } from "../src/world/solve";
import { FINE_PER_PARENT } from "../src/world/spatial";

const W = 240;
const H = 320;
const SEED = 42;
const solved = solveWorld(SEED, W, H);
/** Inland: 227 land parents, 20 lake, 9 river and 56 streams, with six fords. */
const CX = 14;
const CY = 3;
const chunk = refineChunk(SEED, solved, CX, CY);
const PARENTS = FINE_CHUNK / FINE_PER_PARENT;

/** The chunk-local indices of a parent's 36 children, for a parent inside the chunk. */
function children(px: number, py: number): number[] {
  const out: number[] = [];
  const x0 = px * FINE_PER_PARENT - chunk.x0;
  const y0 = py * FINE_PER_PARENT - chunk.y0;
  for (let dy = 0; dy < FINE_PER_PARENT; dy++) {
    for (let dx = 0; dx < FINE_PER_PARENT; dx++) out.push((y0 + dy) * chunk.stride + x0 + dx);
  }
  return out;
}

function parentsOfChunk(): number[] {
  const out: number[] = [];
  for (let j = 0; j < PARENTS; j++) {
    for (let i = 0; i < PARENTS; i++) {
      const px = CX * PARENTS + i;
      const py = CY * PARENTS + j;
      if (px < solved.w && py < solved.h) out.push(py * solved.w + px);
    }
  }
  return out;
}

describe("the fine chunk over the solved world", () => {
  it("averages its children back to the parent's height", () => {
    let land = 0;
    for (const parent of parentsOfChunk()) {
      if (solved.kind[parent] === KIND.sea) continue;
      const px = parent % solved.w;
      const py = (parent - px) / solved.w;
      let sum = 0;
      for (const i of children(px, py)) sum += chunk.height[i];
      expect(Math.abs(sum / 36 - solved.height[parent]), `parent ${px},${py}`).toBeLessThan(0.5);
      land++;
    }
    expect(land).toBeGreaterThan(100);
  });
});

/** The solved cell a chunk-local patch belongs to. */
function parentOf(chunkOf: { x0: number; y0: number; stride: number }, i: number): number {
  const x = chunkOf.x0 + (i % chunkOf.stride);
  const y = chunkOf.y0 + Math.floor(i / chunkOf.stride);
  return Math.floor(y / FINE_PER_PARENT) * solved.w + Math.floor(x / FINE_PER_PARENT);
}

/** Patches of the chunk 8-connected to a patch whose parent has one of the given kinds, through patches passing `through`. */
function reachesParentKind(chunkOf: FineRefinement, kinds: number[], through: (i: number) => boolean): Uint8Array {
  const seen = new Uint8Array(chunkOf.stride * chunkOf.stride);
  const queue: number[] = [];
  for (let y = 0; y < chunkOf.h; y++) {
    for (let x = 0; x < chunkOf.w; x++) {
      const i = y * chunkOf.stride + x;
      if (!through(i) || !kinds.includes(solved.kind[parentOf(chunkOf, i)])) continue;
      seen[i] = 1;
      queue.push(i);
    }
  }
  for (let head = 0; head < queue.length; head++) {
    const c = queue[head];
    const cx = c % chunkOf.stride;
    const cy = (c - cx) / chunkOf.stride;
    for (let k = 0; k < 8; k++) {
      const nx = cx + DX8[k];
      const ny = cy + DY8[k];
      if (nx < 0 || ny < 0 || nx >= chunkOf.w || ny >= chunkOf.h) continue;
      const nb = ny * chunkOf.stride + nx;
      if (seen[nb] || !through(nb)) continue;
      seen[nb] = 1;
      queue.push(nb);
    }
  }
  return seen;
}

describe("the fine chunk's shores", () => {
  it("keeps every lake patch at or below its lake's surface and connected to it", () => {
    let lakePatches = 0;
    const connected = reachesParentKind(chunk, [KIND.lake], (i) => chunk.kind[i] === KIND.lake);
    for (let y = 0; y < chunk.h; y++) {
      for (let x = 0; x < chunk.w; x++) {
        const i = y * chunk.stride + x;
        if (chunk.kind[i] !== KIND.lake) continue;
        const parent = parentOf(chunk, i);
        if (solved.kind[parent] !== KIND.lake) continue;
        lakePatches++;
        expect(chunk.height[i], `patch ${x},${y}`).toBeLessThanOrEqual(solved.height[parent]);
        expect(connected[i], `patch ${x},${y}`).toBe(1);
      }
    }
    expect(lakePatches).toBeGreaterThan(100);
  });

  it("makes a water patch in a land parent a lake's shore or a pond of two metres or more, never one isolated patch", () => {
    const lakeShore = reachesParentKind(chunk, [KIND.lake, KIND.sea], (i) => chunk.kind[i] !== KIND.land);
    const sizes = new Map<number, number>();
    const deepest = new Map<number, number>();
    for (let i = 0; i < chunk.stride * chunk.stride; i++) {
      const id = chunk.depression[i];
      if (id < 0) continue;
      sizes.set(id, (sizes.get(id) ?? 0) + 1);
      deepest.set(id, Math.max(deepest.get(id) ?? 0, rimAt(chunk, i) - chunk.height[i]));
    }
    let ponds = 0;
    for (let y = 0; y < chunk.h; y++) {
      for (let x = 0; x < chunk.w; x++) {
        const i = y * chunk.stride + x;
        if (chunk.kind[i] !== KIND.lake) continue;
        const parent = parentOf(chunk, i);
        if (solved.kind[parent] === KIND.lake || lakeShore[i]) continue;
        ponds++;
        const id = chunk.depression[i];
        expect(id, `patch ${x},${y}`).toBeGreaterThanOrEqual(0);
        expect(deepest.get(id) ?? 0, `pond depth at ${x},${y}`).toBeGreaterThanOrEqual(POND_MIN_DEPTH_M);
        expect(sizes.get(id) ?? 0, `pond size at ${x},${y}`).toBeGreaterThan(1);
      }
    }
    expect(ponds).toBeGreaterThan(0);
  });

  it("makes a sea patch one at or below sea level connected to a sea parent", () => {
    const shore = refineChunk(SEED, solved, 14, 13);
    const connected = reachesParentKind(shore, [KIND.sea], (i) => shore.height[i] <= 0);
    let sea = 0;
    let beach = 0;
    for (let y = 0; y < shore.h; y++) {
      for (let x = 0; x < shore.w; x++) {
        const i = y * shore.stride + x;
        const inSeaParent = solved.kind[parentOf(shore, i)] === KIND.sea;
        if (shore.kind[i] === KIND.sea) {
          sea++;
          expect(shore.height[i], `patch ${x},${y}`).toBeLessThanOrEqual(0);
          expect(connected[i], `patch ${x},${y}`).toBe(1);
        } else if (inSeaParent) beach++;
      }
    }
    expect(sea).toBeGreaterThan(1000);
    // The coarse kind is not copied down: a sea parent may carry dry patches.
    expect(beach).toBeGreaterThan(0);
  });

  it("fills every depression of a third of a metre or more and names its rim", () => {
    let pools = 0;
    let deep = 0;
    for (let y = 0; y < chunk.h; y++) {
      for (let x = 0; x < chunk.w; x++) {
        const i = y * chunk.stride + x;
        expect(chunk.filled[i], `patch ${x},${y}`).toBeGreaterThanOrEqual(chunk.height[i]);
        if (chunk.depression[i] < 0) continue;
        pools++;
        if (rimAt(chunk, i) - chunk.height[i] >= POOL_MIN_DEPTH_M) deep++;
        expect(rimAt(chunk, i), `patch ${x},${y}`).toBeGreaterThanOrEqual(chunk.filled[i]);
      }
    }
    expect(pools).toBeGreaterThan(0);
    expect(deep).toBeGreaterThan(0);
  });
});

/** The solved cells of the chunk the solve gave running water. */
function flowingParents(): number[] {
  return parentsOfChunk().filter((p) => solved.kind[p] === KIND.river || (solved.flags[p] & FLAG_STREAM) !== 0);
}

/** The parents whose channel drains into this one. */
function upstreamOf(parent: number): number[] {
  const px = parent % solved.w;
  const py = (parent - px) / solved.w;
  const out: number[] = [];
  for (let k = 0; k < 8; k++) {
    const qx = px + DX8[k];
    const qy = py + DY8[k];
    if (qx < 0 || qy < 0 || qx >= solved.w || qy >= solved.h) continue;
    const q = qy * solved.w + qx;
    const flowing = solved.kind[q] === KIND.river || (solved.flags[q] & FLAG_STREAM) !== 0;
    if (flowing && solved.flowDir[q] !== NO_FLOW && receiverOf(q, solved.flowDir[q], solved.w) === parent) out.push(q);
  }
  return out;
}

describe("the fine chunk's channels", () => {
  it("runs water downhill from every entry to every exit", () => {
    expect(chunk.channels.length).toBeGreaterThan(20);
    for (const path of chunk.channels) {
      expect(path.patches[0]).toBe(path.entry);
      expect(path.patches[path.patches.length - 1]).toBe(path.exit);
      expect(path.patches.length).toBeGreaterThan(1);
      for (let k = 1; k < path.patches.length; k++) {
        expect(chunk.filled[path.patches[k]], `step ${k} of parent ${path.parent}`).toBeLessThan(chunk.filled[path.patches[k - 1]]);
      }
    }
  });

  it("gives every river and stream parent one path per entry, out of the cell and downhill", () => {
    const byParent = new Map<number, typeof chunk.channels>();
    for (const path of chunk.channels) byParent.set(path.parent, [...(byParent.get(path.parent) ?? []), path]);
    let handed = 0;
    let mouths = 0;
    let held = 0;
    for (const parent of flowingParents()) {
      const paths = byParent.get(parent) ?? [];
      const upstream = upstreamOf(parent);
      expect(paths.length, `parent ${parent}`).toBeGreaterThan(0);
      expect(paths.length, `parent ${parent}`).toBeLessThanOrEqual(Math.max(1, upstream.length));
      for (const path of paths) {
        for (const i of path.patches) expect(channelDischargeAt(chunk, solved, i)).toBe(solved.discharge[parent]);
        expect(chunk.channel[path.entry]).toBe(solved.kind[parent] === KIND.river ? CHANNEL_RIVER : CHANNEL_STREAM);
        const dir = solved.flowDir[parent];
        if (path.out >= 0) {
          // The water left on the side the solve's flow direction points at.
          const ex = chunk.x0 + (path.exit % chunk.stride);
          const ey = chunk.y0 + Math.floor(path.exit / chunk.stride);
          expect(DX8[dir] > 0 ? ex % FINE_PER_PARENT === FINE_PER_PARENT - 1 : DX8[dir] < 0 ? ex % FINE_PER_PARENT === 0 : true, `exit of ${parent}`).toBe(true);
          expect(DY8[dir] > 0 ? ey % FINE_PER_PARENT === FINE_PER_PARENT - 1 : DY8[dir] < 0 ? ey % FINE_PER_PARENT === 0 : true, `exit of ${parent}`).toBe(true);
          handed++;
        } else if (chunk.kind[path.exit] === KIND.lake || chunk.kind[path.exit] === KIND.sea) mouths++;
        else held++;
      }
    }
    // Every path either hands its water to the cell below, ends in water, or
    // is held by ground the solve could not see: a hollow whose sill is too
    // high to cut through, which the flood filled instead.
    expect(handed + mouths).toBeGreaterThan(chunk.channels.length * 0.9);
    expect(held).toBeLessThan(chunk.channels.length * 0.1);
  });

  it("brings each parent's water in where the parent above it took it out", () => {
    const entries = new Map<number, number[]>();
    for (const path of chunk.channels) entries.set(path.parent, [...(entries.get(path.parent) ?? []), path.entry]);
    let handovers = 0;
    for (const path of chunk.channels) {
      if (path.out < 0) continue;
      const below = parentOf(chunk, path.out);
      if (!entries.has(below)) continue;
      expect(upstreamOf(below), `parent ${below}`).toContain(path.parent);
      expect(entries.get(below), `parent ${below} from ${path.parent}`).toContain(path.out);
      handovers++;
    }
    expect(handovers).toBeGreaterThan(10);
  });
});

/** A hash of one chunk's arrays, for byte-for-byte comparison. */
function fingerprint(of: FineRefinement): number {
  let h = 2166136261;
  for (const array of [of.height, of.filled, of.surface, of.rims] as Float32Array[]) {
    for (let i = 0; i < array.length; i++) h = Math.imul(h ^ Math.round(array[i] * 1000), 16777619);
  }
  for (const array of [of.kind, of.channel, of.depression, of.terrain] as ArrayLike<number>[]) {
    for (let i = 0; i < array.length; i++) h = Math.imul(h ^ array[i], 16777619);
  }
  return h >>> 0;
}

describe("the fine chunk's determinism", () => {
  it("builds the same chunk twice byte for byte, whatever was built before it", () => {
    expect(fingerprint(refineChunk(SEED, solved, CX, CY))).toBe(fingerprint(chunk));
    for (const [nx, ny] of [[CX - 1, CY], [CX, CY - 1], [CX + 1, CY], [CX, CY + 1]]) refineChunk(SEED, solved, nx, ny);
    expect(fingerprint(refineChunk(SEED, solved, CX, CY))).toBe(fingerprint(chunk));
    expect(fingerprint(refineChunk(SEED + 1, solved, CX, CY))).not.toBe(fingerprint(chunk));
  });

  it("uses no function whose last bit differs between engines", () => {
    for (const file of ["src/world/refine.ts", "src/world/upsample.ts", "src/world/fine-class.ts", "src/world/fine-terrain.ts"]) {
      const src = readFileSync(file, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
      expect(src, file).not.toMatch(/Math\.(exp|pow|sin|cos|tan|log|atan2|atan|asin|acos|cbrt|hypot|expm1|log1p|log2|log10)\b/);
      expect(src, file).not.toMatch(/\*\*/);
    }
  });
});
