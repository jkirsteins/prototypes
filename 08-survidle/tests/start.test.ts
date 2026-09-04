import { describe, expect, it } from "vitest";
import { generateWorld, hasSpot, regionAt } from "../src/world/gen";

describe("the start", () => {
  // These five are the seeds the baseline actually starts a run from: the
  // four reference seeds the gate is measured on, plus seed 3, which many
  // fixtures elsewhere rely on for its own shore. Not every seed clears
  // findStart's terrain pre-screen inside 40 rings - some fall to the
  // ring-40 fallback and lack an outcrop - so this only promises the start
  // for the seeds the baseline depends on, not for seeds in general.
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
