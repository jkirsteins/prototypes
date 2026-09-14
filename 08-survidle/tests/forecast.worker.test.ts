import { describe, expect, it } from "vitest";
import { createForecastWorker } from "../src/sim/forecast.worker";
import type { ForecastReply } from "../src/sim/forecaster";
import { newGame } from "../src/sim/newgame";
import type { World } from "../src/world/gen";

describe("the forecast worker's row loop", () => {
  it("abandons a row rather than computing it against a world that landed mid-loop", async () => {
    const { state, world } = newGame(3);
    // A distinct object is all a world switch needs to prove itself with: the
    // abandoned loop must never read it, since forecastRow is never reached.
    const otherWorld = { ...world } as unknown as World;
    const posted: ForecastReply[] = [];
    const waiters: (() => void)[] = [];
    const worker = createForecastWorker({
      post: (m) => posted.push(m),
      // A wait this test controls by hand, standing in for the loop's real
      // between-horizon setTimeout(0): each call queues a resolver instead
      // of scheduling one, so the test can land a world switch in the gap.
      wait: () => new Promise((resolve) => waiters.push(resolve)),
      solve: async (s) => (s === state.seed ? world : otherWorld),
    });

    await worker.onMessage({ kind: "world", seed: state.seed });
    const run = worker.onMessage({ kind: "forecast", id: 1, state });
    // onMessage runs synchronously up to its first await: one horizon's wait is already queued.
    expect(waiters.length).toBe(1);

    // fresh() in main.ts (reset world, leave world, next boat) posts exactly
    // this while the old forecast is still yielding between horizons.
    await worker.onMessage({ kind: "world", seed: state.seed + 1 });

    // Resume the paused loop: its world has moved on since it started.
    waiters.shift()!();
    await run;

    expect(posted).toEqual([]);
  });
});
