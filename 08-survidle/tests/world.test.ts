import { describe, expect, it } from "vitest";
import { fishSpecies } from "../src/sim/species";
import { cellAt, generateWorld, hasSpot, neighbours, regionAt, regionOf, speciesHere, terrainOf, WORLD_H, WORLD_W } from "../src/world/gen";
import { LATTICE_W } from "../src/world/terrain";
import { findRoute, routeKm } from "../src/world/route";

describe("world generation", () => {
  const world = generateWorld(42);
  const start = regionAt(world, world.start);

  it("is deterministic for a seed and cheap to make", () => {
    const t0 = performance.now();
    const again = generateWorld(42);
    expect(performance.now() - t0).toBeLessThan(2000);
    expect(again.start).toBe(world.start);
    expect(regionAt(again, again.start).name).toBe(start.name);
    for (const idx of start.cells.slice(0, 50)) expect(cellAt(again, idx).terrain).toBe(cellAt(world, idx).terrain);
    expect(generateWorld(43).start === world.start && regionAt(generateWorld(43), world.start).name === start.name).toBe(false);
  });

  it("is the size of the far north", () => {
    expect(world.w).toBe(WORLD_W);
    expect(world.h).toBe(WORLD_H);
    expect(WORLD_W * 0.3).toBeGreaterThan(500);
    expect(WORLD_H * 0.3).toBeGreaterThan(350);
  });

  it("has sea to the north and land inland", () => {
    let seaTop = 0;
    for (let x = 0; x < WORLD_W; x += 20) if (terrainOf(world, x, 2) === "water") seaTop++;
    expect(seaTop).toBeGreaterThan(WORLD_W / 20 * 0.6);
    let landSouth = 0;
    for (let x = 0; x < WORLD_W; x += 20) if (terrainOf(world, x, WORLD_H - 3) !== "water") landSouth++;
    expect(landSouth).toBeGreaterThan(WORLD_W / 20 * 0.5);
  });

  it("every cell belongs to a region, and regions have neighbours", () => {
    for (let i = 0; i < 200; i++) {
      const x = (i * 97) % WORLD_W;
      const y = (i * 61) % WORLD_H;
      expect(regionOf(world, x, y)).toBeGreaterThanOrEqual(0);
    }
    expect(start.neighbours.length).toBeGreaterThan(2);
    for (const nb of start.neighbours) {
      const back = regionAt(world, nb.id).neighbours.find((x) => x.id === world.start);
      expect(back).toBeDefined();
      expect(back!.km).toBeCloseTo(nb.km, 5);
    }
  });

  it("starts in a forested inland region with a camp and a forest", () => {
    expect(start.forest).toBeGreaterThanOrEqual(0.45);
    expect(hasSpot(start, "forest")).toBe(true);
    expect(hasSpot(start, "camp")).toBe(true);
    expect(cellAt(world, start.campCell).terrain).not.toBe("water");
    expect(cellAt(world, start.campCell).region).toBe(world.start);
    expect(start.cells.length).toBeGreaterThan(100);
    expect(start.cells.length).toBeLessThan(900);
  });

  it("sites the camp on a shore cell and the shore spot beside it, on every reference seed and the three that used to fall back", () => {
    for (const seed of [17, 19, 42, 79, 24, 35, 36]) {
      const w = generateWorld(seed);
      const r = regionAt(w, w.start);
      expect(w.startRing, `seed ${seed}`).toBeLessThan(40);
      expect(cellAt(w, r.campCell).terrain, `seed ${seed}`).not.toBe("water");
      expect(neighbours(w, r.campCell).some((n) => cellAt(w, n).terrain === "water"), `seed ${seed} camp beside water`).toBe(true);
      const shore = r.spots.find((s) => s.id === "shore")!;
      expect(shore, `seed ${seed} shore spot`).toBeDefined();
      expect(shore.cell).not.toBe(r.campCell);
      expect(shore.km).toBeLessThanOrEqual(0.6);
      expect(new Set(r.spots.map((s) => s.cell)).size).toBe(r.spots.length);
    }
  });

  it("puts every spot on a real cell of the right ground, reachable from camp", () => {
    const ids = [world.start, ...start.neighbours.map((n) => n.id)];
    for (const id of ids) {
      const r = regionAt(world, id);
      expect(r.name.length).toBeGreaterThan(2);
      for (const s of r.spots) {
        const t = cellAt(world, s.cell).terrain;
        expect(cellAt(world, s.cell).region).toBe(id);
        if (s.id === "camp") {
          expect(s.km).toBe(0);
          expect(s.cell).toBe(r.campCell);
        } else {
          const route = findRoute(world, r.campCell, s.cell);
          expect(route).not.toBeNull();
          expect(routeKm(route!)).toBeCloseTo(s.km, 1);
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
    expect(speciesHere(start).length).toBeGreaterThan(0);
    const dry = regionAt(world, world.start);
    // No water, no fish of any kind.
    if (dry.frac.water === 0) expect(fishSpecies().filter((s) => dry.capacity[s])).toEqual([]);
    expect(LATTICE_W).toBeGreaterThan(100);
  });

  it("routes between neighbouring camps stay inside the search box", () => {
    const nb = start.neighbours[0];
    const route = findRoute(world, start.campCell, regionAt(world, nb.id).campCell);
    if (route) expect(routeKm(route)).toBeLessThan(40);
  });
});
