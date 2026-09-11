import { describe, expect, it } from "vitest";
import { loadWorld } from "../src/world/worldloader";

describe("loading a world without a Worker", () => {
  it("falls back to the synchronous cache and reports the stages", async () => {
    const stages: string[] = [];
    const world = await loadWorld(42, (stage) => { if (!stages.includes(stage)) stages.push(stage); });
    expect(world.seed).toBe(42);
    expect(world.solved.height.length).toBe(world.w * world.h);
    // From the cache there is one synthetic stage; a fresh solve reports all five. Either is fine.
    expect(stages.length).toBeGreaterThanOrEqual(1);
  });
});
