import { describe, expect, it } from "vitest";
import { NO_FLOW, receiverOf } from "../src/world/hydro";
import { solveHydrology } from "../src/world/solve";
import { coastLineU } from "../src/world/terrain";

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
    // A fjord is sea east of the template coast line.
    let inland = 0;
    for (let y = 0; y < H; y++) {
      const coastU = coastLineU((y + 0.5) / H);
      for (let x = Math.ceil(coastU * W) + 3; x < W; x++) if (r.sea[y * W + x]) inland++;
    }
    expect(inland).toBeGreaterThan(20);
  });

  it("is deterministic", () => {
    const again = solveHydrology(42, W, H);
    expect([...again.height]).toEqual([...r.height]);
    expect([...again.flow]).toEqual([...r.flow]);
  });
});
