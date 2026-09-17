import { describe, expect, it, vi } from "vitest";
import { createForecastWorker } from "../src/sim/forecast.worker";
import { newGame } from "../src/sim/newgame";
import type { World } from "../src/world/gen";

describe("forecast worker world loading", () => {
  it("does not allocate a duplicate world merely to receive its seed before any forecast", async () => {
    const solve = vi.fn(async () => { throw new Error("world loading must wait for a forecast"); });
    const worker = createForecastWorker({ solve, post: () => {}, wait: async () => {} });
    await expect(worker.onMessage({ kind: "world", seed: 42 })).resolves.toBeUndefined();
    await expect(worker.onMessage({ kind: "world", seed: 79 })).resolves.toBeUndefined();
    expect(solve).not.toHaveBeenCalled();
  });

  it("does not install or compute a world whose pending load was superseded", async () => {
    const { state, world } = newGame(3);
    let complete!: (world: World) => void;
    const pending = new Promise<World>((resolve) => { complete = resolve; });
    const post = vi.fn();
    const wait = vi.fn(async () => {});
    const worker = createForecastWorker({ solve: () => pending, post, wait });
    const run = worker.onMessage({ kind: "forecast", id: 1, state });
    await worker.onMessage({ kind: "world", seed: 79 });
    complete(world);
    await run;
    expect(post).not.toHaveBeenCalled();
    expect(wait).not.toHaveBeenCalled();
  });
});
