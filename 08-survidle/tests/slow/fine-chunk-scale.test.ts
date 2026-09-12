/**
 * The fine chunk's contract at the scale the game runs at. The fast cases in
 * `tests/fine-chunk.test.ts` run these same four checks on a 240 by 320
 * miniature, where a cell covers 2.25 km of the template while `refine.ts`
 * works in a fixed 300 m parent - so every metre constant there is exercised
 * at seven and a half times its intended spacing. This case runs them on the
 * real 1800 by 2224 world, where a cell is 300 m, over a handful of chunks
 * chosen for what they contain: inland ground, a coast, lake ground and river
 * ground.
 *
 * Slow because it solves the full world once, which is the only way to get a
 * 300 m cell.
 */
import { describe, expect, it } from "vitest";
import { expectChildrenAverageToParent, expectOutcomes, expectShoresAreReal, expectWaterRunsDownhill } from "../fine-chunk-contract";
import { FINE_CHUNK, refineChunk } from "../../src/world/refine";
import { KIND, solveWorld } from "../../src/world/solve";
import { FINE_PER_PARENT } from "../../src/world/spatial";
import { WORLD_CELL_H, WORLD_CELL_W } from "../../src/world/terrain";

const SEED = 42;
const PARENTS = FINE_CHUNK / FINE_PER_PARENT;
/** Chunks over inland plateau, the western coast, the lake country and two river reaches. */
const CHUNKS: [number, number][] = [[60, 60], [40, 120], [112, 24], [112, 104], [90, 40], [20, 90]];

describe("the fine chunk at 300 metres to the parent", () => {
  it("keeps the contract on real-scale ground: heights, water downhill, discharge out, shores", () => {
    const solved = solveWorld(SEED, WORLD_CELL_W, WORLD_CELL_H);
    let land = 0;
    let paths = 0;
    let lakePatches = 0;
    let ponds = 0;
    const outcomes = { handed: 0, leftChunk: 0, mouth: 0, held: 0, paths: 0 };
    let water = 0;
    for (const [cx, cy] of CHUNKS) {
      const chunk = refineChunk(SEED, solved, cx, cy);
      land += expectChildrenAverageToParent(solved, chunk);
      paths += expectWaterRunsDownhill(chunk);
      const tally = expectOutcomes(solved, chunk);
      for (const key of Object.keys(outcomes) as (keyof typeof outcomes)[]) outcomes[key] += tally[key];
      const shores = expectShoresAreReal(solved, chunk);
      lakePatches += shores.lakePatches;
      ponds += shores.ponds;
      for (let j = 0; j < PARENTS; j++) {
        for (let i = 0; i < PARENTS; i++) {
          const parent = (cy * PARENTS + j) * solved.w + cx * PARENTS + i;
          if (solved.kind[parent] !== KIND.land) water++;
        }
      }
    }
    console.log(`real scale: ${land} land parents, ${paths} channel paths, ${lakePatches} lake patches, ${ponds} pond patches, ${water} water parents`);
    console.log(`outcomes: ${outcomes.handed} handed, ${outcomes.leftChunk} left the chunk, ${outcomes.mouth} at a mouth, ${outcomes.held} held of ${outcomes.paths}`);
    // The chunks have to contain the things the checks are about, or a green
    // case means nothing.
    expect(land).toBeGreaterThan(1_000);
    expect(paths).toBeGreaterThan(100);
    expect(water).toBeGreaterThan(0);
    expect(lakePatches + ponds).toBeGreaterThan(0);
    // Water leaves a cell unless the fine ground holds it, which is rare: the
    // sill a channel may cut is a metre, and above that the flood's hollow
    // keeps the water and it spills over the rim instead.
    expect(outcomes.held).toBeLessThan(outcomes.paths * 0.05);
    expect(outcomes.handed).toBeGreaterThan(outcomes.paths * 0.5);
  }, 600_000);
});
