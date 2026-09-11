import { describe, expect, it, vi } from "vitest";
import { WORLD_H, WORLD_W } from "../src/world/gen";
import { flatWorld } from "./world-fixture";
import { cachedAtmosphereFieldNodes, cachedAtmosphereFieldWaves, extinctionComponents, fieldTransport, MAX_ATMOSPHERE_FIELD_NODES, meteorologicalRangeKm, precipitationPhase, sampleAtmosphere, terrainModifiers } from "../src/sim/climate";

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


const weather = { startDoy: 180, snowCm: 0 };

describe("deterministic local atmosphere", () => {
  it("keeps a high inland site within an annual precipitation envelope while retaining heavy bands", () => {
    // SMHI's 1991-2020 normal is about 400-600 mm in northern inland
    // Sweden and above 1,000 mm in mountain terrain. This deterministic
    // high site gets a broad envelope so one simulated year may be wet,
    // while rejecting a field that rains for nearly half the year.
    const world = climateWorld(17);
    let liquidMm = 0;
    let wetHours = 0;
    let peakMmPerHour = 0;
    for (let hour = 0; hour < 365 * 24; hour++) {
      const air = sampleAtmosphere({ startDoy: 90, snowCm: 0 }, world, hour * 60, 1254, 470);
      liquidMm += air.precipMmPerHour;
      if (air.precipMmPerHour >= 0.2) wetHours++;
      peakMmPerHour = Math.max(peakMmPerHour, air.precipMmPerHour);
    }
    expect(liquidMm).toBeGreaterThanOrEqual(400);
    expect(liquidMm).toBeLessThanOrEqual(1_600);
    expect(wetHours).toBeGreaterThanOrEqual(200);
    expect(wetHours).toBeLessThanOrEqual(2_000);
    expect(peakMmPerHour).toBeGreaterThanOrEqual(7.5);
  });

  it("reuses exact lattice nodes and bounds the per-world field cache", () => {
    const world = climateWorld(17);
    const sine = vi.spyOn(Math, "sin");
    const first = sampleAtmosphere(weather, world, 1234, 650, 720);
    sine.mockClear();
    expect(sampleAtmosphere(weather, world, 1234, 650, 720)).toEqual(first);
    expect(sine).toHaveBeenCalledTimes(1);
    sine.mockRestore();
    const negative = sampleAtmosphere(weather, world, 1234, -650, -720);
    expect(cachedAtmosphereFieldWaves(world)).toBe(4);

    for (let i = 0; i < 2_000; i++) sampleAtmosphere(weather, world, 1234, i * 30, i * 17);
    expect(cachedAtmosphereFieldNodes(world)).toBeLessThanOrEqual(MAX_ATMOSPHERE_FIELD_NODES);
    expect(sampleAtmosphere(weather, world, 1234, -650, -720)).toEqual(negative);
    world.seed = 19;
    const changedSeed = sampleAtmosphere(weather, world, 1234, -650, -720);
    expect(changedSeed).not.toEqual(negative);
    expect(changedSeed).toEqual(sampleAtmosphere(weather, climateWorld(19), 1234, -650, -720));
  });

  it("repeats across sample order and fresh worlds without materializing terrain or mutating inputs", () => {
    const world = climateWorld(17);
    const before = structuredClone(world);
    const first = sampleAtmosphere(weather, world, 1234, 650, 720);
    sampleAtmosphere(weather, world, 60000, 1500, 1000);
    expect(sampleAtmosphere(weather, world, 1234, 650, 720)).toEqual(first);
    expect(sampleAtmosphere(weather, climateWorld(17), 1234, 650, 720)).toEqual(first);
    expect(sampleAtmosphere(weather, climateWorld(19), 1234, 650, 720)).not.toEqual(first);
    expect(world).toEqual(before);
    expect(weather).toEqual({ startDoy: 180, snowCm: 0 });
  });

  it("keeps adjacent 300 m atmospheric samples coherent while distant weather differs", () => {
    const world = climateWorld(17);
    let adjacentPressure = 0;
    let distantPressure = 0;
    for (let x = 0; x < 150; x += 10) {
      // The northern sea removes elevation differences from the field comparison.
      const a = sampleAtmosphere(weather, world, 1440, x, 0);
      const b = sampleAtmosphere(weather, world, 1440, x + 1, 0);
      const far = sampleAtmosphere(weather, world, 1440, x + 250, 0);
      adjacentPressure += Math.abs(a.pressureHpa - b.pressureHpa);
      distantPressure += Math.abs(a.pressureHpa - far.pressureHpa);
      expect(Math.abs(a.relativeHumidity - b.relativeHumidity)).toBeLessThan(0.03);
      expect(Math.abs(a.cloud - b.cloud)).toBeLessThan(0.06);
    }
    expect(adjacentPressure).toBeLessThan(distantPressure / 15);
    expect(distantPressure).toBeGreaterThan(10);
  });

  it("advects the broad field over twenty minutes and stays continuous at lattice boundaries", () => {
    const world = climateWorld(17);
    const a = sampleAtmosphere(weather, world, 0, 100, 0);
    const later = sampleAtmosphere(weather, world, 20, 100, 0);
    const transport = fieldTransport(world.seed);
    const transported = sampleAtmosphere(weather, world, 20, 100 + transport.xKmh / 0.9, transport.yKmh / 0.9);
    expect(later.pressureHpa).not.toBeCloseTo(a.pressureHpa, 3);
    expect(transported.pressureHpa).toBeCloseTo(a.pressureHpa, 9);
    const left = sampleAtmosphere(weather, world, 0, 40 - 0.00001, 0);
    const right = sampleAtmosphere(weather, world, 0, 40 + 0.00001, 0);
    expect(Math.abs(left.pressureHpa - right.pressureHpa)).toBeLessThan(0.0001);
  });

  it("changes local wind smoothly as pressure systems pass and across neighbouring positions", () => {
    const world = climateWorld(17);
    const here = sampleAtmosphere(weather, world, 0, 100, 0);
    const next = sampleAtmosphere(weather, world, 0, 101, 0);
    const far = sampleAtmosphere(weather, world, 0, 200, 0);
    const soon = sampleAtmosphere(weather, world, 0.001, 100, 0);
    const later = sampleAtmosphere(weather, world, 20, 100, 0);
    const difference = (a: typeof here, b: typeof here) => Math.hypot(a.windXKmh - b.windXKmh, a.windYKmh - b.windYKmh);
    expect(difference(here, far)).toBeGreaterThan(1);
    expect(difference(here, later)).toBeGreaterThan(0.1);
    expect(difference(here, next)).toBeLessThan(1);
    expect(difference(here, soon)).toBeLessThan(0.01);
    for (let x = 0; x < world.w; x += 60) {
      const wind = sampleAtmosphere(weather, world, 1440, x, 500);
      expect(wind.windKmh).toBeGreaterThanOrEqual(0);
      expect(wind.windKmh).toBeLessThanOrEqual(60);
      expect(Math.hypot(wind.windXKmh, wind.windYKmh)).toBeCloseTo(wind.windKmh, 10);
    }
    const left = sampleAtmosphere(weather, world, 0, 40 - 0.00001, 0);
    const right = sampleAtmosphere(weather, world, 0, 40 + 0.00001, 0);
    expect(difference(left, right)).toBeLessThan(0.0001);
  });

  it("keeps local precipitation exactly zero outside parent cloud support", () => {
    const world = climateWorld(17);
    let dry = 0;
    let wet = 0;
    const rates: number[] = [];
    for (let x = 0; x < world.w; x += 30) {
      const sample = sampleAtmosphere(weather, world, 1440, x, 500);
      if (sample.cloud <= 0.65) {
        expect(sample.precipMmPerHour).toBe(0);
        expect(sample.precip).toBe("none");
        dry++;
      }
      if (sample.precipMmPerHour > 0) wet++;
      rates.push(sample.precipMmPerHour);
    }
    expect(dry).toBeGreaterThan(5);
    // Precipitation occupies the moving core, not the whole cloudy parent.
    // This 54 km sampling stride still crosses more than one wet point and
    // several continuous edge values without turning cells into fresh rolls.
    expect(wet).toBeGreaterThan(1);
    expect(new Set(rates).size).toBeGreaterThan(2);
  });

  it("cools elevated air at 6.5 C/km and wets windward slopes while drying the lee", () => {
    const up = terrainModifiers(1, 0.5, 1, 0.5);
    const lee = terrainModifiers(1, 1.5, 1, 0.5);
    expect(up.temperatureOffsetC).toBe(-6.5);
    expect(up.humidityOffset).toBeGreaterThan(0);
    expect(lee.humidityOffset).toBeLessThan(0);
    expect(up.precipMultiplier).toBeGreaterThan(lee.precipMultiplier);
  });

  it("uses the requested season and only develops blowing snow over cold snow cover", () => {
    const world = climateWorld(17);
    const summer = sampleAtmosphere(weather, world, 0, 500, 600);
    const winter = sampleAtmosphere({ startDoy: 15, snowCm: 40 }, world, 0, 500, 600);
    const bare = sampleAtmosphere({ startDoy: 15 }, world, 0, 500, 600);
    expect(winter.temperatureC).toBeLessThan(summer.temperatureC - 15);
    expect(winter.windKmh).toBeGreaterThan(18);
    expect(winter.blowingSnow).toBeGreaterThan(0);
    expect(bare.blowingSnow).toBe(0);
    expect(summer.blowingSnow).toBe(0);
    if (winter.precipMmPerHour > 0) expect(winter.precip).toBe("snow");
  });

  it("drifts settled snow according to local wind even under the same slow system transport", () => {
    const world = climateWorld(3);
    const transport = fieldTransport(world.seed);
    expect(Math.hypot(transport.xKmh, transport.yKmh)).toBeLessThan(18);
    let calm = 0;
    let drifting = 0;
    for (let x = 200; x < 1400; x += 60) {
      const sample = sampleAtmosphere({ startDoy: 15, snowCm: 40 }, world, 0, x, 600);
      expect(sample.temperatureC).toBeLessThan(0);
      if (sample.windKmh <= 18) {
        expect(sample.blowingSnow).toBe(0);
        calm++;
      } else {
        expect(sample.blowingSnow).toBeGreaterThan(0);
        drifting++;
      }
    }
    expect(calm).toBeGreaterThan(0);
    expect(drifting).toBeGreaterThan(0);
  });
});

describe("optical extinction", () => {
  it.each([
    [2, 0, 2, 0, "rain"],
    [1, 0, 2, 0, "rain"],
    [0, 0.5, 1, 1, "snow"],
    [-1, 1, 0, 2, "snow"],
    [-2, 1, 0, 2, "snow"],
  ] as const)("partitions liquid equivalent continuously at %s C", (temperature, frozen, rain, snow, label) => {
    const phase = precipitationPhase(2, temperature);
    expect(phase.frozenFraction).toBe(frozen);
    expect(phase.rainMmPerHour).toBe(rain);
    expect(phase.snowCmPerHour).toBe(snow);
    expect(phase.precip).toBe(label);
  });

  it("preserves snowfall and optical continuity across the freezing label change", () => {
    const warm = precipitationPhase(2, 0.01);
    const cold = precipitationPhase(2, -0.01);
    expect(warm.precip).toBe("rain");
    expect(cold.precip).toBe("snow");
    expect(warm.snowCmPerHour).toBeGreaterThan(0.9);
    expect(cold.rainMmPerHour).toBeGreaterThan(0.9);
    expect(Math.abs(warm.snowCmPerHour - cold.snowCmPerHour)).toBeLessThan(0.04);
    expect(Math.abs(extinctionComponents(warm).total - extinctionComponents(cold).total)).toBeLessThan(0.15);
    expect(precipitationPhase(0, -0.01).precip).toBe("none");
  });

  it("supplies both rain and snow to extinction while atmospheric precipitation is mixed", () => {
    const world = climateWorld(17);
    let mixed = 0;
    for (let x = 200; x < 1500; x += 100) {
      for (let startDoy = 70; startDoy < 160; startDoy += 5) {
        const sample = sampleAtmosphere({ startDoy }, world, 0, x, 500);
        if (sample.temperatureC <= -1 || sample.temperatureC >= 1 || sample.precipMmPerHour === 0) continue;
        expect(sample.rainMmPerHour).toBeGreaterThan(0);
        expect(sample.snowCmPerHour).toBeGreaterThan(0);
        expect(sample.rainMmPerHour + sample.snowCmPerHour).toBeCloseTo(sample.precipMmPerHour, 10);
        expect(sample.extinctionPerKm).toBeCloseTo(extinctionComponents(sample).total, 10);
        mixed++;
      }
    }
    expect(mixed).toBeGreaterThan(0);
  });

  it.each([[0.5, 20], [2.5, 8], [7.5, 3], [25, 0.8]])("calibrates rain %s mm/h to %s km MOR", (rainMmPerHour, morKm) => {
    expect(meteorologicalRangeKm(extinctionComponents({ rainMmPerHour }).total)).toBeCloseTo(morKm, 9);
  });

  it.each([[0.4, 5], [1, 1.2], [2.5, 0.4]])("calibrates snow %s cm/h to %s km MOR", (snowCmPerHour, morKm) => {
    expect(meteorologicalRangeKm(extinctionComponents({ snowCmPerHour }).total)).toBeCloseTo(morKm, 9);
  });

  it("log-interpolates rate tables and approaches clear air continuously as precipitation stops", () => {
    const mid = extinctionComponents({ rainMmPerHour: Math.sqrt(0.5 * 2.5) });
    expect(meteorologicalRangeKm(mid.total)).toBeCloseTo(Math.sqrt(20 * 8), 9);
    expect(meteorologicalRangeKm(extinctionComponents({ rainMmPerHour: 0.000001 }).total)).toBeCloseTo(50, 3);
  });

  it("adds excess extinction without counting clear air twice", () => {
    const clear = extinctionComponents({});
    const rain = extinctionComponents({ rainMmPerHour: 2.5 });
    const fog = extinctionComponents({ fog: 1 });
    const both = extinctionComponents({ rainMmPerHour: 2.5, fog: 1 });
    expect(meteorologicalRangeKm(clear.total)).toBeCloseTo(50, 10);
    expect(meteorologicalRangeKm(fog.total)).toBeCloseTo(0.2, 10);
    expect(meteorologicalRangeKm(extinctionComponents({ blowingSnow: 1 }).total)).toBeCloseTo(0.3, 10);
    expect(both.total).toBeCloseTo(rain.total + fog.total - clear.total, 10);
    expect(Math.exp(-both.total * meteorologicalRangeKm(both.total))).toBeCloseTo(0.05, 10);
    expect(meteorologicalRangeKm(both.total)).toBeLessThan(0.2);
  });
});
