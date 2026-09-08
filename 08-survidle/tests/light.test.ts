import { describe, expect, it } from "vitest";
import { calendar, LATITUDE_DEG } from "../src/sim/calendar";
import { CAMP_FIRE_LUX, DARK_LUX, illuminance, lightWord, moonAltitude, skyLux, sunAltitude, TORCH_LUX, lightFactor } from "../src/sim/light";
import { newGame } from "../src/sim/newgame";
import { regionState } from "../src/sim/regionstate";
import { placeAt } from "../src/sim/position";
import { siteCamp } from "./siting-helpers";

/** Day of year for a date in a 365-day year, 0-based, the way the calendar counts. */
const DOY = { equinox: 79, june: 171, december: 354 };
/** The minute of a run started on `doy` at which the clock reads `hour`; the run opens at 08:00. */
function at(hour: number): number {
  return Math.round((hour - 8) * 60);
}

describe("the sun", () => {
  it("stands where the latitude says at noon: 51 degrees in June, under 5 in December", () => {
    // 90 - 62 +/- 23.44, the solstice altitudes at 62 N.
    expect(sunAltitude(at(13), DOY.june)).toBeCloseTo(90 - LATITUDE_DEG + 23.44, 1);
    expect(sunAltitude(at(13), DOY.december)).toBeCloseTo(90 - LATITUDE_DEG - 23.44, 1);
  });

  it("is level with the horizon at the equinox's seven o'clock and highest at one", () => {
    expect(sunAltitude(at(7), DOY.equinox)).toBeCloseTo(0, 0);
    expect(sunAltitude(at(13), DOY.equinox)).toBeGreaterThan(sunAltitude(at(10), DOY.equinox));
  });
});

describe("the sky's light", () => {
  it("is a hundred times brighter at a June noon than a December one, both clear", () => {
    const june = skyLux(calendar(at(13), DOY.june), true, 0);
    const december = skyLux(calendar(at(13), DOY.december), true, 0);
    expect(june).toBeGreaterThan(50_000);
    expect(december).toBeLessThan(10_000);
    expect(december).toBeGreaterThan(1_000);
  });

  it("falls through the twilights to the starlight floor", () => {
    // Moonless, so the reading is the sun's alone.
    const lux = (h: number) => skyLux({ ...calendar(at(h), DOY.equinox), moon: 0, moonLight: 0 }, true, 0);
    // Sunset is at 19:00 at the equinox; the sun is 6 degrees under by about 19:35 and 12 by 20:10.
    expect(lux(19)).toBeGreaterThan(100);
    expect(lux(19)).toBeLessThan(1_000);
    expect(lux(20)).toBeLessThan(lux(19.5));
    expect(lux(23)).toBeLessThan(0.01);
    expect(lux(23)).toBeGreaterThan(0);
  });

  it("carries a full moon high through a December night and leaves a new moon down", () => {
    // The moon opposite a low winter sun rides high; the new moon keeps the sun's own hours.
    const midnight = at(24 + 1);
    expect(moonAltitude(calendar(midnight, DOY.december), 0.5)).toBeGreaterThan(30);
    expect(moonAltitude(calendar(midnight, DOY.december), 0)).toBeLessThan(0);
  });

  it("is brighter under a full moon than under none, and overcast kills the difference", () => {
    const night = calendar(at(24 + 1), DOY.december);
    const full = { ...night, moon: 0.5, moonLight: 1 };
    const none = { ...night, moon: 0, moonLight: 0 };
    expect(skyLux(full, true, 0)).toBeGreaterThan(10 * skyLux(none, true, 0));
    expect(skyLux(full, false, 0)).toBeLessThan(skyLux(full, true, 0) / 10);
  });

  it("is raised by snow on the ground, by half again", () => {
    const night = { ...calendar(at(24 + 1), DOY.december), moon: 0.5, moonLight: 1 };
    // Fresh snow's 0.8 albedo against the forest floor's 0.15: (1 + 0.8) / (1 + 0.15).
    expect(skyLux(night, true, 20)).toBeCloseTo(skyLux(night, true, 0) * (1.8 / 1.15), 5);
    expect(skyLux(night, true, 20) / skyLux(night, true, 0)).toBeCloseTo(1.57, 2);
  });

  it("never falls under the overcast starless floor", () => {
    const night = { ...calendar(at(24 + 1), DOY.december), moon: 0, moonLight: 0 };
    expect(skyLux(night, false, 0)).toBeGreaterThanOrEqual(DARK_LUX);
  });
});

describe("flame", () => {
  it("lights the camp cell and not the next one over", () => {
    const { state, world } = newGame(3, DOY.december);
    siteCamp(state, world);
    const st = regionState(state, world, state.player.region);
    state.minute = at(24 + 1);
    const cal = calendar(state.minute, state.startDoy);
    st.fire.lit = true;
    expect(illuminance(state, world, cal, st.campCell!)).toBeGreaterThan(CAMP_FIRE_LUX * 0.9);
    expect(illuminance(state, world, cal, st.campCell! + 1)).toBeLessThan(1);
  });

  it("goes where the torch goes", () => {
    const { state, world } = newGame(3, DOY.december);
    siteCamp(state, world);
    const st = regionState(state, world, state.player.region);
    state.minute = at(24 + 1);
    const cal = calendar(state.minute, state.startDoy);
    const away = st.campCell! + world.w * 3;
    placeAt(state, world, away);
    expect(illuminance(state, world, cal, away)).toBeLessThan(1);
    state.player.torch = { lit: true, minutes: 30 };
    expect(illuminance(state, world, cal, away)).toBeGreaterThan(TORCH_LUX * 0.9);
  });
});

describe("the odds a light buys", () => {
  it("are full at the light the work needs and the floor in the dark", () => {
    expect(lightFactor(DARK_LUX, 20, 0.05)).toBeCloseTo(0.05, 5);
    expect(lightFactor(20, 20, 0.05)).toBeCloseTo(1, 5);
    expect(lightFactor(100_000, 20, 0.05)).toBe(1);
  });

  it("put a torch within a hair of daylight and a moonlit snowfield halfway", () => {
    expect(lightFactor(TORCH_LUX, 20, 0.05)).toBeGreaterThan(0.9);
    expect(lightFactor(0.2, 20, 0.05)).toBeGreaterThan(0.5);
    expect(lightFactor(0.2, 20, 0.05)).toBeLessThan(0.7);
  });

  it("are far meaner for fine work than for gathering, at the same light", () => {
    expect(lightFactor(0.2, 500, 0.02)).toBeLessThan(lightFactor(0.2, 20, 0.02));
  });
});

describe("the word for the light", () => {
  it("names what a person would call it", () => {
    expect(lightWord(50_000)).toBe("daylight");
    expect(lightWord(2_000)).toBe("overcast");
    expect(lightWord(20)).toBe("firelit");
    expect(lightWord(0.2)).toBe("moonlit");
    expect(lightWord(0.002)).toBe("starlit");
    expect(lightWord(DARK_LUX)).toBe("pitch dark");
  });
});
