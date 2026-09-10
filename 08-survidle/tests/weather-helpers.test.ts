import { afterEach, describe, expect, it, vi } from "vitest";
import * as climate from "../src/sim/climate";
import { newWorld } from "../src/world/cells";
import { testAtmosphere } from "./weather-helpers";

afterEach(() => vi.restoreAllMocks());

describe("controlled weather", () => {
  it("keeps long simulations from retaining an unbounded sample history", () => {
    const expected = testAtmosphere({ temperatureC: 7, extinctionPerKm: 0.42 });
    const world = newWorld(17);

    for (let i = 0; i < 5_000; i++) {
      expect(climate.sampleAtmosphere({ startDoy: 91 }, world, i, 10, 20)).toEqual(expected);
    }

    expect(vi.mocked(climate.sampleAtmosphere).mock.calls.length).toBeLessThanOrEqual(1_024);
  });
});
