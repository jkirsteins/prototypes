import { describe, expect, it } from "vitest";
import { latticeCandidateCount, profileWeather, shouldPrintWeatherProfile, WEATHER_PROFILE_DEFAULTS } from "../scripts/weather-profile";

describe("weather profiler", () => {
  it("counts the exact integer lattice candidates in the 167-cell MOR cap", () => {
    expect(latticeCandidateCount(167)).toBe(87_604);
  });
  it("keeps the required production workload sizes in one named configuration", () => {
    expect(WEATHER_PROFILE_DEFAULTS).toEqual({ atmosphereSamples: 10_000, mapGlyphs: 54 * 48, groundRegions: 100 });
  });

  it("prints outside Vitest and stays quiet when imported by tests", () => {
    expect(shouldPrintWeatherProfile({})).toBe(true);
    expect(shouldPrintWeatherProfile({ VITEST: "true" })).toBe(false);
  });

  it("reports deterministic work separately from host-dependent timings", () => {
    const first = profileWeather(17, { atmosphereSamples: 16, mapGlyphs: 12, groundRegions: 3, quick: true });
    const second = profileWeather(17, { atmosphereSamples: 16, mapGlyphs: 12, groundRegions: 3, quick: true });
    expect(first.workloads.map(({ name, operations, checksum }) => ({ name, operations, checksum })))
      .toEqual(second.workloads.map(({ name, operations, checksum }) => ({ name, operations, checksum })));
    expect(first.workloads.map((workload) => workload.name)).toEqual([
      "atmosphere samples",
      "memoized current atmosphere",
      "maximum-range open fell sight",
      "map-sized atmosphere",
      "active ground regions",
      "late-day map render",
    ]);
    expect(first.workloads[0].operations).toBe(16);
    expect(first.workloads[1].operations).toBe(16);
    expect(first.workloads[3].operations).toBe(12);
    expect(first.workloads[4].operations).toBe(3);
    for (const workload of first.workloads) expect(workload.ms).toBeGreaterThanOrEqual(0);
  });
});
