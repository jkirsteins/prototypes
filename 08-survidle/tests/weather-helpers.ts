import { vi } from "vitest";
import * as climate from "../src/sim/climate";
import type { AtmosphereSample } from "../src/sim/types";

let restoreAtmosphere: (() => void) | null = null;
const MAX_RETAINED_SAMPLE_CALLS = 1_024;

/** Controlled atmosphere at the pure sampling boundary, for consumer tests. */
export function testAtmosphere(over: Partial<AtmosphereSample> = {}): AtmosphereSample {
  const air: AtmosphereSample = { temperatureC: 5, pressureHpa: 1013, relativeHumidity: 0.5,
    cloud: 0, precipMmPerHour: 0, rainMmPerHour: 0, snowCmPerHour: 0, precip: "none",
    windKmh: 0, windBearingDeg: 0, windXKmh: 0, windYKmh: 0, fog: 0, blowingSnow: 0,
    extinctionPerKm: 0.06, ...over };
  restoreAtmosphere?.();
  // Optical sight can sample tens of thousands of cell centres per view. A
  // Vitest spy retains every argument and result by default, which makes a
  // long controlled simulation retain gigabytes even though the simulation
  // itself releases each view. Tests needing exact counts install their own
  // spy; this shared fixture keeps only a bounded diagnostic tail.
  const sample = vi.spyOn(climate, "sampleAtmosphere").mockImplementation(() => {
    if (sample.mock.calls.length >= MAX_RETAINED_SAMPLE_CALLS) sample.mockClear();
    return { ...air };
  });
  restoreAtmosphere = () => sample.mockRestore();
  return air;
}

export function testRain(rate: number, temperatureC = 5, windKmh = 0): void {
  testAtmosphere({ temperatureC, precipMmPerHour: rate,
    rainMmPerHour: temperatureC > 0 ? rate : 0, snowCmPerHour: temperatureC <= 0 ? rate : 0,
    precip: rate <= 0 ? "none" : temperatureC <= 0 ? "snow" : "rain", windKmh });
}
