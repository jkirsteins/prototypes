import { requireCamp } from "./siting-helpers";
import { describe, expect, it } from "vitest";
import { fishSpecies } from "../src/sim/species";
import { FINE_CHUNK, solvedTerrainAt, terrainOfPatch, terrainPeek } from "../src/world/cells";
import { refineChunk } from "../src/world/refine";
import { cellAt, generateWorld, hasSpot, heightAt, neighbours, regionAt, regionPeek, speciesHere, WORLD_H, WORLD_W } from "../src/world/gen";
import { FINE_PER_PARENT, PATCH_KM, patchId } from "../src/world/spatial";
import { LATTICE_W, TERRAINS } from "../src/world/terrain";
import { findRoute, routeKm } from "../src/world/route";
import { KIND } from "../src/world/solve";
import { solvedWorld } from "./world-fixture";

describe("world generation", () => {
  const world = generateWorld(42);
  const start = regionAt(world, world.start);

  it("is deterministic for a seed and cheap to make from the cache", () => {
    const t0 = performance.now();
    const again = generateWorld(42);
    expect(performance.now() - t0).toBeLessThan(2000);
    expect(again.start).toBe(world.start);
    for (let i = 0; i < 2000; i += 37) expect(again.solved.terrain[i]).toBe(world.solved.terrain[i]);
  });

  it("allocates only touched 96 by 96 fine chunks while peeks remain pure", () => {
    const fine = solvedWorld(21);
    const patch = patchId(6411, 1875);
    expect(fine.fineChunks.size).toBe(0);
    // A peek with no chunk resident is the solved ground at the parent; the
    // patch's own ground is the chunk's, and asking for it builds one.
    expect(terrainPeek(fine, patch)).toBe(solvedTerrainAt(fine, 6411, 1875));
    expect(fine.fineChunks.size).toBe(0);
    // The chunk's ground is the refinement's own classification, so the patch
    // reads exactly what refineChunk wrote for it - not merely some terrain.
    const refined = refineChunk(fine.seed, fine.solved, Math.floor(6411 / FINE_CHUNK), Math.floor(1875 / FINE_CHUNK));
    const inChunk = (1875 % FINE_CHUNK) * FINE_CHUNK + (6411 % FINE_CHUNK);
    expect(terrainOfPatch(fine, patch)).toBe(TERRAINS[refined.terrain[inChunk]]);
    expect(fine.fineChunks.size).toBe(1);
  });

  it("is the size of the far north", () => {
    expect(world.w).toBe(10800);
    expect(world.h).toBe(13344);
    expect(WORLD_W * PATCH_KM).toBe(540);
    expect(WORLD_H * PATCH_KM).toBeCloseTo(667.2, 6);
  });

  it("has sea to the north and land inland", () => {
    let seaTop = 0;
    for (let x = 0; x < WORLD_W; x += 120) if (terrainPeek(world, x, 12) === "water") seaTop++;
    expect(seaTop).toBeGreaterThan(WORLD_W / 120 * 0.6);
    let landSouth = 0;
    for (let x = 0; x < WORLD_W; x += 120) if (terrainPeek(world, x, WORLD_H - 18) !== "water") landSouth++;
    expect(landSouth).toBeGreaterThan(WORLD_W / 120 * 0.5);
  });

  it("every cell belongs to a region, and regions have neighbours", () => {
    for (let i = 0; i < 200; i++) {
      const x = (i * 97) % WORLD_W;
      const y = (i * 61) % WORLD_H;
      expect(regionPeek(world, x, y)).toBeGreaterThanOrEqual(0);
    }
    const start = regionAt(world, world.start);
    expect(start.neighbours.length).toBeGreaterThan(2);
    for (const nb of start.neighbours) {
      const back = regionAt(world, nb.id).neighbours.find((x) => x.id === world.start);
      expect(back).toBeDefined();
    }
    expect(cellAt(world, world.startCell).region).toBe(world.start);
  });

  it("counts river as its own habitat share", () => {
    const start = regionAt(world, world.start);
    expect(start.frac.river).toBeGreaterThanOrEqual(0);
    expect(start.frac.water + start.frac.river).toBeLessThanOrEqual(1);
  });

  it("reads height in metres with the sea at or below zero and lakes above", () => {
    const cells = world.solved;
    let seaChecked = 0;
    for (let i = 0; i < cells.w * cells.h; i += 997) {
      const cx = i % cells.w;
      const cy = (i - cx) / cells.w;
      const x = cx * FINE_PER_PARENT;
      const y = cy * FINE_PER_PARENT;
      // The fine lattice covers the solve exactly, so every solved cell has a patch.
      expect(y).toBeLessThan(world.h);
      if (cells.kind[i] === KIND.sea) { expect(heightAt(world, x, y)).toBeLessThanOrEqual(0); seaChecked++; }
      else expect(heightAt(world, x, y)).toBeGreaterThanOrEqual(0);
    }
    expect(seaChecked).toBeGreaterThan(100);
    expect(heightAt(world, -1, 5)).toBe(0);
  });

  it("starts in a forested inland region with a camp and a forest", () => {
    expect(start.forest).toBeGreaterThanOrEqual(0.45);
    expect(hasSpot(start, "forest")).toBe(true);
    expect(hasSpot(start, "camp")).toBe(true);
    expect(cellAt(world, requireCamp(start)).terrain).not.toBe("water");
    expect(cellAt(world, requireCamp(start)).region).toBe(world.start);
    expect(start.area).toBeGreaterThan(9);
    expect(start.area).toBeLessThan(81);
  });

  it("sites the camp on a shore cell and the shore spot beside it, on every reference seed and the three that used to fall back", () => {
    for (const seed of [17, 19, 42, 79, 24, 35, 36]) {
      const w = generateWorld(seed);
      const r = regionAt(w, w.start);
      expect(w.startRing, `seed ${seed}`).toBeLessThan(40);
      expect(cellAt(w, requireCamp(r)).terrain, `seed ${seed}`).not.toBe("water");
      expect(neighbours(w, requireCamp(r)).some((n) => cellAt(w, n).terrain === "water"), `seed ${seed} camp beside water`).toBe(true);
      const shore = r.spots.find((s) => s.id === "shore")!;
      expect(shore, `seed ${seed} shore spot`).toBeDefined();
      expect(shore.cell).not.toBe(requireCamp(r));
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
          expect(s.cell).toBe(requireCamp(r));
        } else {
          const route = findRoute(world, requireCamp(r), s.cell);
          expect(route).not.toBeNull();
          expect(routeKm(route!, requireCamp(r))).toBeCloseTo(s.km, 8);
          if (s.id === "forest") expect(["spruce", "pine", "birch"]).toContain(t);
          if (s.id === "outcrop") expect(["rock", "fell"]).toContain(t);
          if (s.id === "heath") expect(["bog", "meadow"]).toContain(t);
          if (s.id === "shore") expect(t).not.toBe("water");
        }
      }
      expect(r.area).toBeCloseTo(r.cells.length * 0.0025, 8);
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
    const route = findRoute(world, requireCamp(start), requireCamp(regionAt(world, nb.id)));
    if (route) expect(routeKm(route, requireCamp(start))).toBeLessThan(40);
  });
});
