import { describe, expect, it } from "vitest";
import { Rng } from "../src/rng";
import { calendar } from "../src/sim/calendar";
import { newGame } from "../src/sim/newgame";
import type { Weather } from "../src/sim/types";
import { ambientTemperature, seasonalMean, SNOW_CM_PER_MINUTE, SNOW_SETTLE_PER_DAY, stepWeather } from "../src/sim/weather";

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

  it("rain running through the dawn roll still counts as today's wet day", () => {
    const rng = new Rng(5);
    // Rain already going before 03:00, held steady across the roll: no fresh
    // "started" transition happens right at dawn, only continuing rain.
    const weather = w({ precip: "light", wetDay: true, dryDays: 3, rolledDay: 0 });
    let rolled = false;
    for (let m = 1 * 1440 - 5 * 60; m < 1 * 1440 + 8 * 60; m++) {
      weather.precip = "light";
      stepWeather(weather, calendar(m), rng, 1, m);
      if (weather.rolledDay === 1) {
        rolled = true;
        break;
      }
    }
    expect(rolled).toBe(true);
    expect(weather.dryDays).toBe(0);
    expect(weather.wetDay).toBe(true);
  });

  it("snow lays a quarter of what it did and the pack settles five percent at the day roll", () => {
    expect(SNOW_CM_PER_MINUTE).toEqual({ light: 1 / 160, heavy: 1 / 80 });
    expect(SNOW_SETTLE_PER_DAY).toBe(0.05);
    const { state } = newGame(17, 334);
    const w = state.weather;
    w.snowCm = 0;
    w.offset = -10;
    const cal = calendar(0, 334);
    const rng = new Rng(1);
    // The stop-per-hour roll can flip precip off for a single minute; force
    // heavy again each step so the hour reads as continuously heavy snow.
    for (let m = 0; m < 60; m++) {
      w.precip = "heavy";
      stepWeather(w, calendar(m, 334), rng, 1, m);
    }
    expect(w.snowCm).toBeCloseTo(0.75, 1);
    w.snowCm = 100;
    w.precip = "none";
    // December's sunrise at 62 N is past 10:00; 11:00 the next day is after the roll.
    w.storm = null;
    const dawn = calendar(1440 + 11 * 60, 334);
    stepWeather(w, dawn, rng, 1, 1440 + 11 * 60);
    expect(w.snowCm).toBeCloseTo(95, 0);
    expect(cal.season).toBe("winter");
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
