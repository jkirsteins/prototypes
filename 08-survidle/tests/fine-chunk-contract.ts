/**
 * The fine chunk's contract with the solved world, from the close-zoom plan's
 * section 6, as four checks a caller runs on any chunk of any solved world.
 * The fast cases run them on a miniature solve and the slow case runs them on
 * the real 1800 by 2224 world, and a contract that is stated once cannot drift
 * between the two.
 *
 * Each check returns what it counted so the caller can say the chunk it chose
 * had something to measure.
 */
import { expect } from "vitest";
import { DX8, DY8, NO_FLOW, receiverOf } from "../src/world/hydro";
import { CHANNEL_RIVER, CHANNEL_STREAM, channelDischargeAt, type ChannelOutcome, type FineRefinement, POND_MIN_DEPTH_M, rimAt } from "../src/world/refine";
import { FLAG_STREAM, KIND, type SolvedWorld } from "../src/world/solve";
import { FINE_PER_PARENT } from "../src/world/spatial";

/** The solved cell a chunk-local patch belongs to. */
export function parentOf(solved: SolvedWorld, chunk: FineRefinement, i: number): number {
  const x = chunk.x0 + (i % chunk.stride);
  const y = chunk.y0 + Math.floor(i / chunk.stride);
  return Math.floor(y / FINE_PER_PARENT) * solved.w + Math.floor(x / FINE_PER_PARENT);
}

/** The solved cells a chunk covers. */
export function parentsOfChunk(solved: SolvedWorld, chunk: FineRefinement): number[] {
  const out: number[] = [];
  for (let y = 0; y < chunk.h; y += FINE_PER_PARENT) {
    for (let x = 0; x < chunk.w; x += FINE_PER_PARENT) out.push(parentOf(solved, chunk, y * chunk.stride + x));
  }
  return out;
}

/** The chunk-local indices of a parent's 36 children. */
export function children(chunk: FineRefinement, solved: SolvedWorld, parent: number): number[] {
  const px = parent % solved.w;
  const py = (parent - px) / solved.w;
  const x0 = px * FINE_PER_PARENT - chunk.x0;
  const y0 = py * FINE_PER_PARENT - chunk.y0;
  const out: number[] = [];
  for (let dy = 0; dy < FINE_PER_PARENT; dy++) {
    for (let dx = 0; dx < FINE_PER_PARENT; dx++) out.push((y0 + dy) * chunk.stride + x0 + dx);
  }
  return out;
}

/** The solved cells of the chunk the solve gave running water. */
export function flowingParents(solved: SolvedWorld, chunk: FineRefinement): number[] {
  return parentsOfChunk(solved, chunk).filter((p) => solved.kind[p] === KIND.river || (solved.flags[p] & FLAG_STREAM) !== 0);
}

/** The parents whose channel drains into this one. */
export function upstreamOf(solved: SolvedWorld, parent: number): number[] {
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

/** Patches 8-connected to a patch whose parent has one of the given kinds, through patches passing `through`. */
export function reachesParentKind(solved: SolvedWorld, chunk: FineRefinement, kinds: number[], through: (i: number) => boolean): Uint8Array {
  const seen = new Uint8Array(chunk.stride * chunk.stride);
  const queue: number[] = [];
  for (let y = 0; y < chunk.h; y++) {
    for (let x = 0; x < chunk.w; x++) {
      const i = y * chunk.stride + x;
      if (!through(i) || !kinds.includes(solved.kind[parentOf(solved, chunk, i)])) continue;
      seen[i] = 1;
      queue.push(i);
    }
  }
  for (let head = 0; head < queue.length; head++) {
    const c = queue[head];
    const cx = c % chunk.stride;
    const cy = (c - cx) / chunk.stride;
    for (let k = 0; k < 8; k++) {
      const nx = cx + DX8[k];
      const ny = cy + DY8[k];
      if (nx < 0 || ny < 0 || nx >= chunk.w || ny >= chunk.h) continue;
      const nb = ny * chunk.stride + nx;
      if (seen[nb] || !through(nb)) continue;
      seen[nb] = 1;
      queue.push(nb);
    }
  }
  return seen;
}

/** Contract 1: for every parent that is not sea, the mean of the 36 fine heights is the parent's height. */
export function expectChildrenAverageToParent(solved: SolvedWorld, chunk: FineRefinement): number {
  let land = 0;
  for (const parent of parentsOfChunk(solved, chunk)) {
    if (solved.kind[parent] === KIND.sea) continue;
    let sum = 0;
    for (const i of children(chunk, solved, parent)) sum += chunk.height[i];
    expect(Math.abs(sum / 36 - solved.height[parent]), `parent ${parent % solved.w},${Math.floor(parent / solved.w)}`).toBeLessThan(0.5);
    land++;
  }
  return land;
}

/** Contract 2: along every channel, from entry to exit, the filled surface falls. */
export function expectWaterRunsDownhill(chunk: FineRefinement): number {
  for (const path of chunk.channels) {
    expect(path.patches[0]).toBe(path.entry);
    expect(path.patches[path.patches.length - 1]).toBe(path.exit);
    expect(path.patches.length).toBeGreaterThan(1);
    for (let k = 1; k < path.patches.length; k++) {
      expect(chunk.filled[path.patches[k]], `step ${k} of parent ${path.parent}`).toBeLessThan(chunk.filled[path.patches[k - 1]]);
    }
  }
  return chunk.channels.length;
}

export type OutcomeTally = Record<ChannelOutcome, number> & { paths: number };

/**
 * Contract 3: every river and stream parent of the chunk has one path per
 * entry, each path carries that parent's discharge, leaves on the side the
 * solve's flow direction chose, and says where its water went. A `handed` path
 * names the patch in the cell below; `leftChunk` and `mouth` name no patch and
 * need none; `held` is the fine ground keeping the water in the cell, and the
 * caller bounds how often that is allowed to happen.
 */
export function expectOutcomes(solved: SolvedWorld, chunk: FineRefinement): OutcomeTally {
  const tally: OutcomeTally = { handed: 0, leftChunk: 0, mouth: 0, held: 0, paths: 0 };
  const byParent = new Map<number, FineRefinement["channels"]>();
  for (const path of chunk.channels) byParent.set(path.parent, [...(byParent.get(path.parent) ?? []), path]);
  for (const parent of flowingParents(solved, chunk)) {
    const paths = byParent.get(parent) ?? [];
    expect(paths.length, `parent ${parent}`).toBeGreaterThan(0);
    expect(paths.length, `parent ${parent}`).toBeLessThanOrEqual(Math.max(1, upstreamOf(solved, parent).length));
    for (const path of paths) {
      for (const i of path.patches) expect(channelDischargeAt(chunk, solved, i)).toBe(solved.discharge[parent]);
      expect(chunk.channel[path.entry]).toBe(solved.kind[parent] === KIND.river ? CHANNEL_RIVER : CHANNEL_STREAM);
      tally[path.outcome]++;
      tally.paths++;
      // What each outcome promises about `out`.
      if (path.outcome === "handed") {
        expect(path.out, `handover of ${parent}`).toBeGreaterThanOrEqual(0);
        expect(parentOf(solved, chunk, path.out), `handover of ${parent}`).not.toBe(parent);
      } else {
        expect(path.out, `${path.outcome} path of ${parent}`).toBe(-1);
      }
      if (path.outcome === "mouth") {
        expect([KIND.sea, KIND.lake], `mouth of ${parent}`).toContain(chunk.kind[path.exit]);
      }
      if (path.outcome !== "handed" && path.outcome !== "leftChunk") continue;
      // A path that goes on left on the side the solve's flow direction points at.
      const dir = solved.flowDir[parent];
      const ex = chunk.x0 + (path.exit % chunk.stride);
      const ey = chunk.y0 + Math.floor(path.exit / chunk.stride);
      expect(DX8[dir] > 0 ? ex % FINE_PER_PARENT === FINE_PER_PARENT - 1 : DX8[dir] < 0 ? ex % FINE_PER_PARENT === 0 : true, `exit of ${parent}`).toBe(true);
      expect(DY8[dir] > 0 ? ey % FINE_PER_PARENT === FINE_PER_PARENT - 1 : DY8[dir] < 0 ? ey % FINE_PER_PARENT === 0 : true, `exit of ${parent}`).toBe(true);
    }
  }
  return tally;
}

/**
 * Contract 4: every water patch of a lake parent is at or below that lake's
 * surface and connected to it, and a water patch in a land parent is a lake's
 * shore or a pond of POND_MIN_DEPTH_M over more than one patch.
 */
export function expectShoresAreReal(solved: SolvedWorld, chunk: FineRefinement): { lakePatches: number; ponds: number } {
  const connected = reachesParentKind(solved, chunk, [KIND.lake], (i) => chunk.kind[i] === KIND.lake);
  const lakeShore = reachesParentKind(solved, chunk, [KIND.lake, KIND.sea], (i) => chunk.kind[i] !== KIND.land);
  const sizes = new Map<number, number>();
  const deepest = new Map<number, number>();
  for (let i = 0; i < chunk.stride * chunk.stride; i++) {
    const id = chunk.depression[i];
    if (id < 0) continue;
    sizes.set(id, (sizes.get(id) ?? 0) + 1);
    deepest.set(id, Math.max(deepest.get(id) ?? 0, rimAt(chunk, i) - chunk.height[i]));
  }
  let lakePatches = 0;
  let ponds = 0;
  for (let y = 0; y < chunk.h; y++) {
    for (let x = 0; x < chunk.w; x++) {
      const i = y * chunk.stride + x;
      if (chunk.kind[i] !== KIND.lake) continue;
      const parent = parentOf(solved, chunk, i);
      if (solved.kind[parent] === KIND.lake) {
        lakePatches++;
        expect(chunk.height[i], `patch ${x},${y}`).toBeLessThanOrEqual(solved.height[parent]);
        expect(connected[i], `patch ${x},${y}`).toBe(1);
        continue;
      }
      if (lakeShore[i]) continue;
      ponds++;
      const id = chunk.depression[i];
      expect(id, `patch ${x},${y}`).toBeGreaterThanOrEqual(0);
      expect(deepest.get(id) ?? 0, `pond depth at ${x},${y}`).toBeGreaterThanOrEqual(POND_MIN_DEPTH_M);
      expect(sizes.get(id) ?? 0, `pond size at ${x},${y}`).toBeGreaterThan(1);
    }
  }
  return { lakePatches, ponds };
}
