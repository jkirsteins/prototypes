import { describe, expect, it } from "vitest";
import {
  FINE_PER_PARENT, PATCH_M, WORLD_FINE_H, WORLD_FINE_W, fineNeighbours,
  parentXY, patchAtMetric, patchCenter, patchId, patchXY,
} from "../src/world/spatial";

describe("the 50 m spatial lattice", () => {
  it("preserves the physical world and round trips exact patches", () => {
    expect(PATCH_M).toBe(50);
    expect(WORLD_FINE_W).toBe(10800);
    expect(WORLD_FINE_H).toBe(7800);
    const id = patchId(6411, 1875);
    expect(patchXY(id)).toEqual({ x: 6411, y: 1875 });
    expect(patchAtMetric(patchCenter(id))).toBe(id);
    expect(parentXY(id)).toEqual({ x: 1068, y: 312 });
    expect(FINE_PER_PARENT).toBe(6);
  });

  it("reports physical diagonal edges and the two corner guards", () => {
    const world = { w: WORLD_FINE_W, h: WORLD_FINE_H };
    const from = patchId(10, 10);
    const diagonal = fineNeighbours(world, from).find((edge) => edge.patch === patchId(11, 11));
    expect(diagonal).toEqual({
      patch: patchId(11, 11), distanceM: 50 * Math.SQRT2, diagonal: true,
      corners: [patchId(11, 10), patchId(10, 11)],
    });
  });
});
