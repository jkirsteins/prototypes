import { describe, expect, it } from "vitest";
import { cellAt, generateWorld, heightAt, regionAt, regionOf, terrainOf, waterKindOf, WORLD_H, WORLD_W } from "../src/world/gen";
import { KIND } from "../src/world/solve";

describe("world generation", () => {
  const world = generateWorld(42);

  it("is deterministic for a seed and cheap to make from the cache", () => {
    const t0 = performance.now();
    const again = generateWorld(42);
    expect(performance.now() - t0).toBeLessThan(2000);
    expect(again.start).toBe(world.start);
    for (let i = 0; i < 2000; i += 37) expect(again.solved.terrain[i]).toBe(world.solved.terrain[i]);
  });

  it("is 540 by 667 km", () => {
    expect(world.w).toBe(WORLD_W);
    expect(world.h).toBe(WORLD_H);
    expect(world.solved.height.length).toBe(WORLD_W * WORLD_H);
  });

  it("has the Atlantic on the west and land on the east", () => {
    let seaWest = 0, landEast = 0;
    for (let y = 0; y < WORLD_H; y += 40) {
      if (terrainOf(world, 2, y) === "water" && waterKindOf(world, y * WORLD_W + 2) === "sea") seaWest++;
      if (terrainOf(world, WORLD_W - 3, y) !== "water") landEast++;
    }
    expect(seaWest).toBeGreaterThan(WORLD_H / 40 * 0.8);
    expect(landEast).toBeGreaterThan(WORLD_H / 40 * 0.5);
  });

  it("reads height in metres with the sea at or below zero and lakes above", () => {
    let seaChecked = 0;
    for (let i = 0; i < WORLD_W * WORLD_H; i += 997) {
      const x = i % WORLD_W, y = (i - x) / WORLD_W;
      const kind = world.solved.kind[i];
      if (kind === KIND.sea) { expect(heightAt(world, x, y)).toBeLessThanOrEqual(0); seaChecked++; }
      else expect(heightAt(world, x, y)).toBeGreaterThanOrEqual(0);
    }
    expect(seaChecked).toBeGreaterThan(100);
    expect(heightAt(world, -1, 5)).toBe(0);
  });

  it("every cell belongs to a region, and regions have neighbours", () => {
    for (let i = 0; i < 200; i++) {
      const x = (i * 97) % WORLD_W;
      const y = (i * 61) % WORLD_H;
      expect(regionOf(world, x, y)).toBeGreaterThanOrEqual(0);
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
});
