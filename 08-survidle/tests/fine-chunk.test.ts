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
import { describe, expect, it } from "vitest";
import { FINE_CHUNK, refineChunk } from "../src/world/refine";
import { KIND, solveWorld } from "../src/world/solve";
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
