import { describe, expect, it } from "vitest";
import { Rng } from "../src/rng";
import { calendar } from "../src/sim/calendar";
import type { Weather } from "../src/sim/types";
import { ambientTemperature, seasonalMean, stepWeather } from "../src/sim/weather";

function w(over: Partial<Weather> = {}): Weather {
  return { precip: "none", clear: true, offset: 0, snowCm: 0, rolledDay: -1, storm: null, dryDays: 0, wetDay: false, dryWarned: false, iceCm: 0, ...over };
}

describe("weather", () => {
  it("is warm in July and cold in January", () => {
    expect(seasonalMean(196)).toBeGreaterThan(14);
    expect(seasonalMean(15)).toBeLessThan(-8);
  });

  it("is warmer in the afternoon than before dawn", () => {
    const afternoon = calendar(7 * 60);
    const night = calendar(19 * 60);
    expect(ambientTemperature(afternoon, w())).toBeGreaterThan(ambientTemperature(night, w()));
  });

  it("precipitation starts and stops over a month", () => {
    const rng = new Rng(7);
    const weather = w();
    let starts = 0;
    let stops = 0;
    for (let m = 0; m < 30 * 1440; m++) {
      const ev = stepWeather(weather, calendar(m), rng, 1);
      if (ev.precipStarted) starts++;
      if (ev.precipStopped) stops++;
    }
    expect(starts).toBeGreaterThan(5);
    expect(stops).toBeGreaterThan(5);
  });

  it("snow builds in the cold and melts in the warm", () => {
    const rng = new Rng(1);
    const cold = w({ precip: "heavy", offset: -20, rolledDay: 999 });
    for (let m = 0; m < 60; m++) stepWeather(cold, calendar(m), rng, 1);
    expect(cold.snowCm).toBeGreaterThan(0);
    const warm = w({ precip: "none", offset: 15, snowCm: 5, rolledDay: 999 });
    for (let m = 0; m < 200; m++) stepWeather(warm, calendar(m), rng, 1);
    expect(warm.snowCm).toBe(0);
  });

  it("rolls a new daily offset at dawn only once", () => {
    const rng = new Rng(3);
    const weather = w({ rolledDay: -1 });
    const noon = calendar(5 * 60);
    stepWeather(weather, noon, rng, 1);
    const first = weather.offset;
    expect(weather.rolledDay).toBe(0);
    stepWeather(weather, calendar(6 * 60), rng, 1);
    expect(weather.offset).toBe(first);
  });
});
