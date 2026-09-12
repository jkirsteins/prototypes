import { afterEach, describe, expect, it, vi } from "vitest";
import * as climate from "../src/sim/climate";
import { WORLD_H, WORLD_W } from "../src/world/gen";
import { flatWorld } from "./world-fixture";
import { testAtmosphere } from "./weather-helpers";

/** Featureless ground at world size: these tests measure the air, not the terrain under it. */
const climateWorlds = new Map<number, ReturnType<typeof flatWorld>>();
function climateWorld(seed: number) {
  let w = climateWorlds.get(seed);
  if (!w) {
    w = flatWorld({ w: WORLD_W, h: WORLD_H, terrain: "spruce", heightM: 600, seed });
    climateWorlds.set(seed, w);
  }
  return w;
}


afterEach(() => vi.restoreAllMocks());

describe("controlled weather", () => {
  it("keeps long simulations from retaining an unbounded sample history", () => {
    const expected = testAtmosphere({ temperatureC: 7, extinctionPerKm: 0.42 });
    const world = climateWorld(17);

    for (let i = 0; i < 5_000; i++) {
      expect(climate.sampleAtmosphere({ startDoy: 91 }, world, i, 10, 20)).toEqual(expected);
    }

    expect(vi.mocked(climate.sampleAtmosphere).mock.calls.length).toBeLessThanOrEqual(1_024);
  });
});
