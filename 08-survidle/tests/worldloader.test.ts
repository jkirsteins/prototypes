import { describe, expect, it } from "vitest";
import { WORLD_CELL_H, WORLD_CELL_W } from "../src/world/terrain";
import { loadWorld } from "../src/world/worldloader";

describe("loading a world without a Worker", () => {
  it("falls back to the synchronous cache and reports the stages", async () => {
    const stages: string[] = [];
    const world = await loadWorld(42, (stage) => { if (!stages.includes(stage)) stages.push(stage); });
    expect(world.seed).toBe(42);
    // The solved arrays are the 300 m cells; world.w and world.h are the 50 m
    // patches the game addresses.
    expect(world.solved.height.length).toBe(world.solved.w * world.solved.h);
    expect(world.solved.w).toBe(WORLD_CELL_W);
    expect(world.solved.h).toBe(WORLD_CELL_H);
    // From the cache there is one synthetic stage; a fresh solve reports all five. Either is fine.
    expect(stages.length).toBeGreaterThanOrEqual(1);
  });
});
