/**
 * The fine chunk's contract with the solved world, from the close-zoom plan's
 * section 6. The chunk is a refinement of the 300 m solve, not a second
 * world: its heights average back to the parents, its water is the solve's
 * water at 50 m, and its channels run downhill from an entry to the exit the
 * solve's flow direction chose. The four checks themselves live in
 * `fine-chunk-contract.ts`, so the slow case can run the same ones at the real
 * scale.
 *
 * **What this fixture cannot check.** It is a miniature solve, 240 by 320 cells
 * in about 120 ms, which keeps the cases in the fast suite where the gate is.
 * But the template is 540 by 667 km whatever the cell count, so a fixture cell
 * is 2.25 km wide while `refine.ts` works in a fixed 300 m parent: every metre
 * constant here - the detail amplitudes, the 1 m sill a channel cuts, the
 * 0.3 m pool and 2 m pond, a slope over 50 m - is exercised at seven and a
 * half times the spacing it was chosen for, and so is every field sampled in
 * template km, the thin-soil noise among them. What this fixture proves is
 * that the contract holds over arbitrary solved arrays; that it holds at the
 * scale the game runs at is `tests/slow/fine-chunk-scale.test.ts`.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { expectChildrenAverageToParent, expectOutcomes, expectShoresAreReal, expectWaterRunsDownhill, parentOf, upstreamOf } from "./fine-chunk-contract";
import { rimEntersWindow } from "../src/world/fine-class";
import { DX8, DY8, NO_FLOW } from "../src/world/hydro";
import { fineWindowOf, type FineRefinement, POOL_MIN_DEPTH_M, refineChunk, rimAt } from "../src/world/refine";
import { KIND, solveWorld } from "../src/world/solve";
import { upslopeCellsOf } from "../src/world/classify";

const W = 240;
const H = 320;
const SEED = 42;
const solved = solveWorld(SEED, W, H);
/** Inland: 227 land parents, 20 lake, 9 river and 56 streams, with six fords. */
const CX = 14;
const CY = 3;
const chunk = refineChunk(SEED, solved, CX, CY);

describe("the fine chunk over the solved world", () => {
  it("averages its children back to the parent's height", () => {
    expect(expectChildrenAverageToParent(solved, chunk)).toBeGreaterThan(100);
  });
});

describe("the fine chunk's shores", () => {
  it("keeps lake patches at their lake's surface and makes a water patch in a land parent a pond", () => {
    const { lakePatches, ponds } = expectShoresAreReal(solved, chunk);
    expect(lakePatches).toBeGreaterThan(100);
    expect(ponds).toBeGreaterThan(0);
  });

  it("makes a sea patch one at or below sea level connected to a sea parent", () => {
    const shore = refineChunk(SEED, solved, 14, 13);
    const connected = reachesSea(shore);
    let sea = 0;
    let beach = 0;
    for (let y = 0; y < shore.h; y++) {
      for (let x = 0; x < shore.w; x++) {
        const i = y * shore.stride + x;
        const inSeaParent = solved.kind[parentOf(solved, shore, i)] === KIND.sea;
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

/** Sea reached from a sea parent through patches at or below sea level. */
function reachesSea(of: FineRefinement): Uint8Array {
  // Local to this case, which is about the sea rule rather than the contract.
  const through = (i: number) => of.height[i] <= 0;
  const seen = new Uint8Array(of.stride * of.stride);
  const queue: number[] = [];
  for (let y = 0; y < of.h; y++) {
    for (let x = 0; x < of.w; x++) {
      const i = y * of.stride + x;
      if (!through(i) || solved.kind[parentOf(solved, of, i)] !== KIND.sea) continue;
      seen[i] = 1;
      queue.push(i);
    }
  }
  for (let head = 0; head < queue.length; head++) {
    const c = queue[head];
    const cx = c % of.stride;
    const cy = (c - cx) / of.stride;
    for (let k = 0; k < 8; k++) {
      const nx = cx + DX8[k];
      const ny = cy + DY8[k];
      if (nx < 0 || ny < 0 || nx >= of.w || ny >= of.h) continue;
      const nb = ny * of.stride + nx;
      if (seen[nb] || !through(nb)) continue;
      seen[nb] = 1;
      queue.push(nb);
    }
  }
  return seen;
}

describe("the fine chunk's channels", () => {
  it("runs water downhill from every entry to every exit", () => {
    expect(expectWaterRunsDownhill(chunk)).toBeGreaterThan(20);
  });

  it("gives every river and stream parent one path per entry, each saying where its water went", () => {
    const tally = expectOutcomes(solved, chunk);
    expect(tally.handed + tally.leftChunk + tally.mouth).toBeGreaterThan(tally.paths * 0.9);
    expect(tally.held).toBeLessThan(tally.paths * 0.1);
  });

  it("hands no catchment to the river the chunk drains into", () => {
    const win = fineWindowOf(solved, CX, CY);
    const rim: number[] = [];
    // The rim cell with the largest catchment that the window's own ground
    // drains into: the river below the chunk, whose implied catchment is the
    // chunk and everything above it. Handing that to it would draw a wet line
    // back into the ground that drained into it.
    let below = -1;
    let belowCells = 0;
    for (let j = 0; j < win.ph; j++) {
      for (let i = 0; i < win.pw; i++) {
        if (i > 0 && j > 0 && i < win.pw - 1 && j < win.ph - 1) continue;
        const px = win.px0 + i;
        const py = win.py0 + j;
        rim.push(py * solved.w + px);
        if (!fedFromInside(px, py, win.px0, win.py0, win.pw, win.ph)) continue;
        const cells = upslopeCellsOf(solved.discharge[py * solved.w + px], px, py, solved.w, solved.h);
        if (cells > belowCells) {
          belowCells = cells;
          below = py * solved.w + px;
        }
      }
    }
    expect(belowCells, "the window drains into a rim cell with a catchment").toBeGreaterThan(1_000);
    expect(rimEntersWindow(solved, win, below % solved.w, Math.floor(below / solved.w)), `cell ${below}`).toBe(false);
    // And the rule is not simply "never": the rim cells above the chunk do hand over.
    const handing = rim.filter((parent) => rimEntersWindow(solved, win, parent % solved.w, Math.floor(parent / solved.w)));
    expect(handing.length).toBeGreaterThan(rim.length / 2);
    expect(handing.length).toBeLessThan(rim.length);
  });

  it("brings each parent's water in where the parent above it took it out", () => {
    const entries = new Map<number, number[]>();
    for (const path of chunk.channels) entries.set(path.parent, [...(entries.get(path.parent) ?? []), path.entry]);
    let handovers = 0;
    for (const path of chunk.channels) {
      if (path.outcome !== "handed") continue;
      const below = parentOf(solved, chunk, path.out);
      if (!entries.has(below)) continue;
      expect(upstreamOf(solved, below), `parent ${below}`).toContain(path.parent);
      expect(entries.get(below), `parent ${below} from ${path.parent}`).toContain(path.out);
      handovers++;
    }
    expect(handovers).toBeGreaterThan(10);
  });
});

/** Whether any cell inside the window drains into this one. */
function fedFromInside(px: number, py: number, px0: number, py0: number, pw: number, ph: number): boolean {
  for (let k = 0; k < 8; k++) {
    const qx = px + DX8[k];
    const qy = py + DY8[k];
    if (qx < px0 || qy < py0 || qx >= px0 + pw || qy >= py0 + ph) continue;
    const d = solved.flowDir[qy * solved.w + qx];
    if (d === NO_FLOW) continue;
    if (qx + DX8[d] === px && qy + DY8[d] === py) return true;
  }
  return false;
}

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
