import { describe, expect, it } from "vitest";
import { NO_FLOW, receiverOf } from "../src/world/hydro";
import { solveHydrology } from "../src/world/solve";

const W = 120, H = 160;

describe("the hydrology of a miniature world", () => {
  const r = solveHydrology(42, W, H);
  const n = W * H;

  it("drains every land cell to the sea or an edge, never uphill", () => {
    for (let i = 0; i < n; i++) {
      if (r.sea[i]) { expect(r.dir[i]).toBe(NO_FLOW); continue; }
      const x = i % W, y = (i - x) / W;
      const edge = x === 0 || y === 0 || x === W - 1 || y === H - 1;
      if (r.dir[i] === NO_FLOW) { expect(edge).toBe(true); continue; }
      const rc = receiverOf(i, r.dir[i], W);
      expect(r.height[rc]).toBeLessThanOrEqual(r.height[i] + 0.01);
    }
  });

  it("gives every lake an outlet at its own surface", () => {
    for (let i = 0; i < n; i++) {
      if (!r.lake[i] || r.dir[i] === NO_FLOW) continue;
      const rc = receiverOf(i, r.dir[i], W);
      if (!r.lake[rc]) expect(r.height[rc]).toBeLessThanOrEqual(r.height[i] + 0.01);
      else expect(Math.abs(r.height[rc] - r.height[i])).toBeLessThan(0.01);
    }
  });

  it("never lets discharge fall downstream", () => {
    for (let i = 0; i < n; i++) {
      if (r.dir[i] === NO_FLOW) continue;
      expect(r.flow[receiverOf(i, r.dir[i], W)]).toBeGreaterThanOrEqual(r.flow[i] - 1e-6);
    }
  });

  it("keeps the sea connected to an edge and below zero, and the land above the sea", () => {
    for (let i = 0; i < n; i++) {
      if (r.sea[i]) expect(r.height[i]).toBeLessThanOrEqual(0);
      else if (!r.lake[i]) expect(r.height[i]).toBeGreaterThan(-0.01);
    }
    let seaCells = 0;
    for (let i = 0; i < n; i++) seaCells += r.sea[i];
    expect(seaCells).toBeGreaterThan(n * 0.1);
    expect(seaCells).toBeLessThan(n * 0.5);
  });

  it("cuts fjords: sea reaches inland of the template coast line somewhere on the west side", () => {
    // Fjords are sea the carving made: land before, sea after.
    let drowned = 0;
    for (let i = 0; i < n; i++) drowned += r.drowned[i];
    expect(drowned).toBeGreaterThan(20);
  });

  // The basins nearly double the lake cells of the full world, where a cell is
  // 300 m across. The miniature stretches the same template over cells a few km
  // wide, which cannot resolve a basin one km long, so it reads a smaller gain;
  // what it can prove is that the stage makes lakes rather than removing them.
  it("turns the glacial basins into lakes, and they keep their outlets", () => {
    const plain = solveHydrology(42, W, H, () => {}, false);
    let withBasins = 0, without = 0;
    for (let i = 0; i < n; i++) { withBasins += r.lake[i]; without += plain.lake[i]; }
    expect(withBasins).toBeGreaterThan(1.25 * without);
    for (let i = 0; i < n; i++) {
      if (!r.lake[i] || r.dir[i] === NO_FLOW) continue;
      const rc = receiverOf(i, r.dir[i], W);
      expect(r.height[rc]).toBeLessThanOrEqual(r.height[i] + 0.01);
    }
  });

  it("is deterministic", () => {
    const again = solveHydrology(42, W, H);
    expect([...again.height]).toEqual([...r.height]);
    expect([...again.flow]).toEqual([...r.flow]);
  });
});
