import { describe, expect, it } from "vitest";
import { calendar } from "../src/sim/calendar";
import { newGame } from "../src/sim/newgame";
import { ambientTemperature, localWeather, seasonalMean, weatherLabel } from "../src/sim/weather";

describe("local weather readings", () => {
  it("is warm in July and cold in January", () => {
    expect(seasonalMean(196)).toBeGreaterThan(14);
    expect(seasonalMean(15)).toBeLessThan(-8);
  });

  it("adapts local temperature and phase for existing consumers", () => {
    const { state, world } = newGame(42, 15);
    const cal = calendar(0, 15);
    const local = localWeather(state, world);
    expect(ambientTemperature(cal, local)).toBe(local.temperatureC);
    expect(weatherLabel(local, local.temperatureC)).toMatch(/clear|overcast|snow|rain/);
  });
});
