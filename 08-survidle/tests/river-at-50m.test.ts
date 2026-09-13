/**
 * The river at 50 m, on the reach the terrain report names: seed 42, the
 * solved cell at 715, 2160 (2026-09-11 terrain hydrology report, "The two
 * river checks"). Seed 42 has no river near its landing, so this reads the
 * ground directly rather than through a run.
 *
 * What the plan asks of the closest rung is that a river be a channel one
 * patch wide with banks, not a 300 m block, and that a crossing be a ford's
 * business. Both are read off the real refinement of the solved arrays: the
 * rung draws one glyph per patch, so the patches below are the picture.
 */
import { describe, expect, it } from "vitest";
import { patchAt } from "../src/world/cells";
import { generateWorld } from "../src/world/gen";
import { LEVELS } from "../src/ui/map";
import { findRoute } from "../src/world/route";
import { FINE_PER_PARENT, patchId, patchXY } from "../src/world/spatial";
import { FLAG_FORD, KIND } from "../src/world/solve";

/** The reach the terrain report names, in solved 300 m cells. */
const REACH = { x: 715, y: 2160 };
/** The nearest river cell to it that carries a ford, and so the crossing this test walks. */
const FORD = { x: 705, y: 2161 };
/** The box the width check covers: 12 by 12 solved cells, 3.6 km a side, around the reach. */
const BOX = { x: 700, y: 2158, cells: 12 };

const world = generateWorld(42);

function terrainOf(x: number, y: number): string {
  return patchAt(world, patchId(x, y)).terrain;
}

function isChannel(x: number, y: number): boolean {
  return terrainOf(x, y) === "river";
}

function solvedAt(x: number, y: number): { kind: number; ford: boolean; discharge: number } {
  const i = y * world.solved.w + x;
  return { kind: world.solved.kind[i], ford: !!(world.solved.flags[i] & FLAG_FORD), discharge: world.solved.discharge[i] };
}

describe("the river at 50 m on seed 42's named reach", () => {
  it("has a ford-carrying river cell within a few kilometres of the reach", () => {
    // The test's own ground, stated: a world whose rivers moved fails here
    // rather than silently measuring a different place.
    const cell = solvedAt(FORD.x, FORD.y);
    expect(cell.kind).toBe(KIND.river);
    expect(cell.ford).toBe(true);
    expect(cell.discharge).toBeGreaterThan(0);
    expect(Math.abs(FORD.x - REACH.x) + Math.abs(FORD.y - REACH.y)).toBeLessThanOrEqual(12);
  });

  it("draws the channel one patch wide at the closest rung", () => {
    // One patch per glyph at the closest rung, so a patch is a glyph here.
    expect(LEVELS[0].finePerGlyph).toBe(1);
    const x0 = BOX.x * FINE_PER_PARENT;
    const y0 = BOX.y * FINE_PER_PARENT;
    const side = BOX.cells * FINE_PER_PARENT;
    let channels = 0;
    const squares: string[] = [];
    const thick: string[] = [];
    for (let y = y0; y < y0 + side; y++) {
      for (let x = x0; x < x0 + side; x++) {
        if (!isChannel(x, y)) continue;
        channels++;
        // A channel one patch wide is a path: it has no 2 by 2 of itself, and
        // no patch of it is surrounded by more than a path's neighbours.
        if (isChannel(x + 1, y) && isChannel(x, y + 1) && isChannel(x + 1, y + 1)) squares.push(`${x},${y}`);
        let neighbours = 0;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]] as const) {
          if (isChannel(x + dx, y + dy)) neighbours++;
        }
        if (neighbours > 3) thick.push(`${x},${y}:${neighbours}`);
      }
    }
    expect(channels, `no channel at all in the ${(BOX.cells * 0.3).toFixed(1)} km square around the reach`).toBeGreaterThan(0);
    expect(squares, `${channels} channel patches, and these sit in a two-by-two block of channel`).toEqual([]);
    expect(thick, "these channel patches have more neighbours than a path can have").toEqual([]);
  });

  it("gives the channel a bank patch on each side inside the ford cell", () => {
    const x0 = FORD.x * FINE_PER_PARENT;
    const y0 = FORD.y * FINE_PER_PARENT;
    let patches = 0;
    for (let y = y0; y < y0 + FINE_PER_PARENT; y++) {
      for (let x = x0; x < x0 + FINE_PER_PARENT; x++) {
        if (!isChannel(x, y)) continue;
        patches++;
        // Banks, whichever way the channel runs through the patch: of its four
        // cardinal neighbours, two at least are dry ground. A channel that had
        // widened into a wet block would have water on three sides or four.
        let dry = 0;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
          const bank = terrainOf(x + dx, y + dy);
          if (bank !== "river" && bank !== "water") dry++;
        }
        expect(dry).toBeGreaterThanOrEqual(2);
      }
    }
    expect(patches).toBeGreaterThan(0);
    // The row the crossing walks, where the channel runs north to south: one
    // patch of it, with dry ground either side.
    const crossingY = y0 + 3;
    const onRow: number[] = [];
    for (let x = x0; x < x0 + FINE_PER_PARENT; x++) if (isChannel(x, crossingY)) onRow.push(x);
    expect(onRow.length).toBe(1);
    for (const dx of [-1, 1]) {
      const bank = terrainOf(onRow[0] + dx, crossingY);
      expect(bank).not.toBe("river");
      expect(bank).not.toBe("water");
    }
  });

  it("crosses bank to bank on the ford cell's channel and nowhere else", () => {
    const x0 = FORD.x * FINE_PER_PARENT;
    const y = FORD.y * FINE_PER_PARENT + 3;
    let channelX = -1;
    for (let x = x0; x < x0 + FINE_PER_PARENT; x++) if (isChannel(x, y)) channelX = x;
    expect(channelX).toBeGreaterThan(0);
    // Two hundred metres of dry bank either side of the channel.
    const route = findRoute(world, patchId(channelX - 4, y), patchId(channelX + 4, y));
    expect(route).not.toBeNull();
    const crossed = route!.map(patchXY).filter((p) => isChannel(p.x, p.y));
    expect(crossed.length, `the walk touched the channel at ${crossed.map((p) => `${p.x},${p.y}`).join(" ")}`).toBe(1);
    for (const p of crossed) {
      const cell = solvedAt(Math.floor(p.x / FINE_PER_PARENT), Math.floor(p.y / FINE_PER_PARENT));
      expect(cell.ford).toBe(true);
    }
  });
});
