/**
 * The close-zoom plan's Agreement case (section 6): the ground the fine
 * classifier decides per 50 m patch, summarised to the parent, against the
 * ground the solve decided for that 300 m cell. Where the two differ the fine
 * rule wins for mechanics, so a low number would mean a wrong fine input; the
 * number is printed with the classes that differ either way.
 *
 * This case is slow because only a full-size solve can answer it. The soil
 * noise is a 2 km field in template km, and a miniature world's cells are
 * template kilometres wide (240 cells span the same 540 km as 1800), so in a
 * miniature the field varies inside a single cell and the parent's own draw is
 * an aliased sample of it. At 1800 by 2224 a cell is 300 m, the soil field is
 * six cells wide, and comparing a parent with its children compares the two
 * lattices rather than the fixture's scale.
 */
import { describe, expect, it } from "vitest";
import { KIND, solveWorld } from "../../src/world/solve";
import { FINE_CHUNK, refineChunk } from "../../src/world/refine";
import { FINE_PER_PARENT } from "../../src/world/spatial";
import { TERRAINS, WORLD_CELL_H, WORLD_CELL_W } from "../../src/world/terrain";

const PARENTS = FINE_CHUNK / FINE_PER_PARENT;
/** Chunk strides that spread 81 chunks over the whole world without landing on a lattice of its features. */
const CHUNK_STEP_X = 13;
const CHUNK_STEP_Y = 17;
const SEEDS = [42, 7, 1984];

function dominantOf(terrain: Uint8Array, stride: number, i: number, j: number): number {
  const counts = new Map<number, number>();
  for (let dy = 0; dy < FINE_PER_PARENT; dy++) {
    for (let dx = 0; dx < FINE_PER_PARENT; dx++) {
      const k = (j * FINE_PER_PARENT + dy) * stride + i * FINE_PER_PARENT + dx;
      counts.set(terrain[k], (counts.get(terrain[k]) ?? 0) + 1);
    }
  }
  let dominant = -1;
  let best = -1;
  // Sorted by terrain index so a tie is broken the same way every run.
  for (const [t, c] of [...counts].sort((a, b) => a[0] - b[0])) if (c > best) { best = c; dominant = t; }
  return dominant;
}

describe("the fine ground against the solved ground", () => {
  it("agrees with the solve on more than 90 percent of land parents, on three seeds", () => {
    for (const seed of SEEDS) {
      const solved = solveWorld(seed, WORLD_CELL_W, WORLD_CELL_H);
      let agree = 0;
      let total = 0;
      const differences = new Map<string, number>();
      for (let cy = 1; cy < Math.floor(WORLD_CELL_H / PARENTS); cy += CHUNK_STEP_Y) {
        for (let cx = 1; cx < Math.floor(WORLD_CELL_W / PARENTS); cx += CHUNK_STEP_X) {
          const chunk = refineChunk(seed, solved, cx, cy);
          for (let j = 0; j < PARENTS; j++) {
            for (let i = 0; i < PARENTS; i++) {
              const parent = (cy * PARENTS + j) * solved.w + cx * PARENTS + i;
              if (solved.kind[parent] !== KIND.land) continue;
              total++;
              const dominant = dominantOf(chunk.terrain, chunk.stride, i, j);
              if (dominant === solved.terrain[parent]) {
                agree++;
                continue;
              }
              const pair = `${TERRAINS[solved.terrain[parent]]} -> ${TERRAINS[dominant]}`;
              differences.set(pair, (differences.get(pair) ?? 0) + 1);
            }
          }
        }
      }
      const share = 100 * agree / total;
      const named = [...differences].sort((a, b) => b[1] - a[1]).slice(0, 6)
        .map(([pair, n]) => `${pair} ${(100 * n / total).toFixed(1)}%`).join(", ");
      console.log(`seed ${seed}: ${share.toFixed(1)} percent of ${total} land parents; ${named}`);
      expect(share, `seed ${seed}`).toBeGreaterThan(90);
    }
  }, 600_000);
});
