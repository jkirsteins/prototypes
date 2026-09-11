import { describe, expect, it } from "vitest";
import { solveWorld } from "../../src/world/solve";
import { WORLD_H, WORLD_W } from "../../src/world/terrain";

describe("the solve budget", () => {
  it("solves a full-size world in under 20 s", () => {
    const t0 = performance.now();
    solveWorld(42, WORLD_W, WORLD_H);
    const s = (performance.now() - t0) / 1000;
    console.log(`full solve ${s.toFixed(1)} s`);
    expect(s).toBeLessThan(20);
  }, 120_000);
});
