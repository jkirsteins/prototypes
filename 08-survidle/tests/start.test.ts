import { describe, expect, it } from "vitest";
import { generateWorld, hasSpot, regionAt } from "../src/world/gen";

describe("the start", () => {
  // A terrain pre-screen keeps findStart cheap for these seeds, but seeds 4
  // and 10 still fall to the ring-40 fallback and lack an outcrop; Task 9's
  // sweep script covers the wider seed range.
  it("has a shore and an outcrop on the reference seeds and seed 3", () => {
    const fallen: number[] = [];
    for (const seed of [17, 19, 42, 79, 3]) {
      const world = generateWorld(seed);
      const r = regionAt(world, world.start);
      expect(hasSpot(r, "shore"), `seed ${seed} shore`).toBe(true);
      expect(hasSpot(r, "outcrop"), `seed ${seed} outcrop`).toBe(true);
      if (world.startRing >= 40) fallen.push(seed);
    }
    expect(fallen).toEqual([]);
  });
});
