import { describe, expect, it } from "vitest";
import { generateWorld, hasSpot, MAP_H, MAP_W } from "../src/world/gen";

describe("world generation", () => {
  const world = generateWorld(42);

  it("is deterministic for a seed", () => {
    const again = generateWorld(42);
    expect(again.cells.map((c) => c.terrain).join("")).toBe(world.cells.map((c) => c.terrain).join(""));
    expect(again.regions.map((r) => r.name)).toEqual(world.regions.map((r) => r.name));
    expect(generateWorld(43).cells.map((c) => c.terrain).join("")).not.toBe(world.cells.map((c) => c.terrain).join(""));
  });

  it("gives every cell a region and every region a neighbour", () => {
    expect(world.cells.length).toBe(MAP_W * MAP_H);
    for (const c of world.cells) expect(c.region).toBeGreaterThanOrEqual(0);
    for (const r of world.regions) expect(r.neighbours.length).toBeGreaterThan(0);
  });

  it("has symmetric neighbour distances in kilometres", () => {
    for (const r of world.regions) {
      for (const nb of r.neighbours) {
        const back = world.regions[nb.id].neighbours.find((x) => x.id === r.id);
        expect(back).toBeDefined();
        expect(back!.km).toBeCloseTo(nb.km, 5);
        expect(nb.km).toBeGreaterThan(0.5);
        expect(nb.km).toBeLessThan(15);
      }
    }
  });

  it("starts in a forested region with a forest spot", () => {
    const start = world.regions[world.start];
    expect(start.forest).toBeGreaterThanOrEqual(0.4);
    expect(hasSpot(start, "forest")).toBe(true);
    expect(hasSpot(start, "camp")).toBe(true);
  });

  it("has a northern sea and a mix of terrain", () => {
    for (let x = 0; x < MAP_W; x++) expect(world.cells[x].terrain).toBe("water");
    const kinds = new Set(world.cells.map((c) => c.terrain));
    expect(kinds.has("spruce")).toBe(true);
    expect(kinds.has("water")).toBe(true);
    expect(kinds.size).toBeGreaterThanOrEqual(5);
  });

  it("names regions uniquely and puts every spot on a real cell of the right ground", () => {
    const names = new Set(world.regions.map((r) => r.name));
    expect(names.size).toBe(world.regions.length);
    for (const r of world.regions) {
      expect(world.cells[r.campCell].terrain).not.toBe("water");
      expect(world.cells[r.campCell].region).toBe(r.id);
      for (const s of r.spots) {
        const t = world.cells[s.cell].terrain;
        expect(world.cells[s.cell].region).toBe(r.id);
        if (s.id === "camp") {
          expect(s.km).toBe(0);
          expect(s.cell).toBe(r.campCell);
        } else {
          expect(s.km).toBeGreaterThanOrEqual(0.3);
          expect(s.km).toBeLessThanOrEqual(3);
          if (s.id === "forest") expect(["spruce", "pine", "birch"]).toContain(t);
          if (s.id === "outcrop") expect(["rock", "fell"]).toContain(t);
          if (s.id === "heath") expect(["bog", "meadow"]).toContain(t);
          if (s.id === "shore") expect(t).not.toBe("water");
        }
      }
      expect(r.area).toBeCloseTo(r.cells.length * 0.09, 5);
    }
  });

  it("derives animal capacities from area and terrain", () => {
    const start = world.regions[world.start];
    expect(start.capacity.deer).toBeGreaterThan(0);
    for (const r of world.regions) {
      if (r.frac.water === 0) expect(r.capacity.fish).toBe(0);
    }
  });
});
