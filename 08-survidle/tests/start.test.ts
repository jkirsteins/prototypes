import { describe, expect, it } from "vitest";
import { cellAt, generateWorld, neighbours, regionAt, waterKindOf, WORLD_H } from "../src/world/gen";
import { forestShareWithin, isShelteredShore } from "../src/world/gen";
import { findRoute } from "../src/world/route";
import { solvedFor } from "../src/world/solvecache";
import { WORLD_CELL_H, WORLD_CELL_W } from "../src/world/terrain";

describe("the start", () => {
  it("lands the first boat on a sheltered sea shore in the southern rows with forest within 3 km, on every reference seed", () => {
    for (const seed of [17, 19, 42, 79, 3]) {
      const world = generateWorld(seed);
      const cell = world.startCell;
      const c = cellAt(world, cell);
      expect(world.startRing, `seed ${seed} ring`).toBeLessThan(60);
      expect(c.terrain, `seed ${seed} land`).not.toBe("water");
      expect(neighbours(world, cell).some((n) => waterKindOf(world, n) === "sea"), `seed ${seed} beside the sea`).toBe(true);
      expect(c.y, `seed ${seed} south`).toBeGreaterThanOrEqual(WORLD_H * 0.85);
      expect(isShelteredShore(world, cell), `seed ${seed} sheltered`).toBe(true);
      expect(forestShareWithin(world, cell, 10), `seed ${seed} forest`).toBeGreaterThanOrEqual(0.4);
      expect(c.region).toBe(world.start);
      expect(regionAt(world, world.start).campCell).toBe(cell);
      // A land route into the forest exists.
      const r = regionAt(world, world.start);
      const forest = r.spots.find((s) => s.id === "forest");
      expect(forest, `seed ${seed} forest spot`).toBeDefined();
      expect(findRoute(world, cell, forest!.cell)).not.toBeNull();
    }
  });

  it("asks for no stone", () => {
    const world = generateWorld(42);
    const r = regionAt(world, world.start);
    // The outcrop spot may or may not exist; the start does not depend on it.
    expect(r.spots.some((s) => s.id === "camp")).toBe(true);
  });

  // The ceiling is from solved arrays in hand to a started run. The solve has
  // its own bar and its own progress bar; it is not inside this budget.
  it("finds a fresh fine-world start in under two seconds once the world is solved", () => {
    const solved = solvedFor(21, WORLD_CELL_W, WORLD_CELL_H);
    const before = performance.now();
    const world = generateWorld(21, solved);
    expect(world.w).toBe(10800);
    expect(performance.now() - before).toBeLessThan(2000);
    expect(regionAt(world, world.start).spots.some((s) => s.id === "shore")).toBe(true);
  });
});
