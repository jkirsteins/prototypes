/**
 * The survivor stands at a metre point and walks exact fine edges. The patch
 * under foot is whatever contains that point, so it changes on the boundary
 * rather than at the next patch centre.
 */
import { describe, expect, it } from "vitest";
import { advance } from "../src/sim/advance";
import { newGame } from "../src/sim/newgame";
import { patchOf, placeAtMetric, placeAtPatch } from "../src/sim/position";
import { beginWalkToPatch } from "../src/sim/tasks";
import { cellAt } from "../src/world/gen";
import { passable, remainingKm } from "../src/world/route";
import { fineNeighbours, PATCH_M, patchCenter, patchId, patchXY } from "../src/world/spatial";

describe("walking in metres", () => {
  it("walks one fine orthogonal edge in physical time", () => {
    const { state, world } = newGame(21);
    const from = patchOf(state, world);
    const to = fineNeighbours(world, from).find((edge) => !edge.diagonal && passable(cellAt(world, edge.patch).terrain))!.patch;
    expect(beginWalkToPatch(state, world, to)).toBe(true);
    advance(state, world, 1);
    expect(Math.hypot(state.player.xM - patchCenter(from).xM, state.player.yM - patchCenter(from).yM)).toBeGreaterThan(0);
    expect(state.stats.km).toBeGreaterThan(0);
  });

  it("changes local patch before reaching the next patch center", () => {
    const { state, world } = newGame(21);
    const from = patchOf(state, world);
    const east = patchId(patchXY(from).x + 1, patchXY(from).y);
    placeAtMetric(state, world, { xM: patchCenter(from).xM + 26, yM: patchCenter(from).yM });
    expect(patchOf(state, world)).toBe(east);
  });

  it("stands at the centre of the patch it is placed on", () => {
    const { state, world } = newGame(21);
    const from = patchOf(state, world);
    const east = patchId(patchXY(from).x + 1, patchXY(from).y);
    placeAtPatch(state, world, east);
    expect(state.player.xM).toBe(patchCenter(east).xM);
    expect(state.player.yM).toBe(patchCenter(east).yM);
    expect(patchOf(state, world)).toBe(east);
  });

  it("counts the exact metres of a walked edge as kilometres", () => {
    const { state, world } = newGame(21);
    const from = patchOf(state, world);
    const to = fineNeighbours(world, from).find((edge) => !edge.diagonal && passable(cellAt(world, edge.patch).terrain))!.patch;
    expect(beginWalkToPatch(state, world, to)).toBe(true);
    // Far more time than one 50 m edge can absorb: the walk ends on the target centre.
    advance(state, world, 60);
    expect(state.player.xM).toBeCloseTo(patchCenter(to).xM, 9);
    expect(state.player.yM).toBeCloseTo(patchCenter(to).yM, 9);
    expect(state.stats.km).toBeCloseTo(PATCH_M / 1000, 9);
  });

  it("measures what is left of a walk from the exact point, not the patch centre", () => {
    const from = patchId(10, 10);
    const path = [patchId(11, 10), patchId(12, 10)];
    expect(remainingKm(path, patchCenter(from))).toBeCloseTo(0.1, 12);
    const midEdge = { xM: patchCenter(from).xM + 20, yM: patchCenter(from).yM };
    expect(remainingKm(path, midEdge)).toBeCloseTo(0.08, 12);
    expect(remainingKm([], midEdge)).toBe(0);
  });
});
