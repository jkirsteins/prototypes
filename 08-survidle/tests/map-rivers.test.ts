import { describe, expect, it } from "vitest";
import { markKnown } from "../src/sim/mapped";
import type { GameState } from "../src/sim/types";
import { blockInfo } from "../src/ui/map";
import { flatWorld, paintWorld } from "./world-fixture";

/** A GameState carrying nothing but the knowledge map blockInfo actually reads. */
function knownState(): GameState {
  return { mapped: {} } as GameState;
}

function markAll(state: GameState, w: number, h: number): void {
  for (let i = 0; i < w * h; i++) markKnown(state, i);
}

describe("a one-cell river is drawn at every rung", () => {
  it("promotes a block to river at 3 cells and 9 cells per glyph", () => {
    const w = 60;
    const h = 60;
    const world = flatWorld({ w, h, terrain: "pine" });
    const riverCol = 30;
    const riverCells: number[] = [];
    for (let y = 0; y < h; y++) riverCells.push(y * w + riverCol);
    paintWorld(world, riverCells, "river");
    const state = knownState();
    markAll(state, w, h);

    // z = 3 samples every cell of the block, so any x0 spanning the column works.
    const at3 = blockInfo(state, world, riverCol - 1, 10, 3);
    expect(at3.terrain).toBe("river");

    // z = 9 samples offsets 1, 4, 7; put the column at offset 4 so it is hit.
    const at9 = blockInfo(state, world, riverCol - 4, 10, 9);
    expect(at9.terrain).toBe("river");
  });

  it("keeps a lake-majority block reading as water even with a river cell in it", () => {
    const w = 60;
    const h = 60;
    const world = flatWorld({ w, h, terrain: "pine" });
    // The 3x3 sample at z = 3, x0 = 0, y0 = 0 hits every cell of the block.
    const blockCells: number[] = [];
    for (let y = 0; y < 3; y++) for (let x = 0; x < 3; x++) blockCells.push(y * w + x);
    paintWorld(world, blockCells, "water");
    paintWorld(world, [1 * w + 1], "river");
    const state = knownState();
    markAll(state, w, h);

    const b = blockInfo(state, world, 0, 0, 3);
    expect(b.terrain).toBe("water");
  });
});
