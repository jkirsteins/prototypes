import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Rng } from "../src/rng";
import { calendar } from "../src/sim/calendar";
import { newGame } from "../src/sim/newgame";
import { feltTemperature, stepPlayer } from "../src/sim/player";
import { cellOf, placeAt } from "../src/sim/position";
import { regionState, siteFor } from "../src/sim/regionstate";
import { readSave, serialize } from "../src/sim/save";
import type { Protection, Weather } from "../src/sim/types";
import { ambientTemperature, stepWeather } from "../src/sim/weather";
import { galeProtection, isLee, profileOf, protectionOf } from "../src/sim/shelter";
import { cellAt } from "../src/world/gen";
import { testRain } from "./weather-helpers";
import { leeCellNear, terrainCellNear } from "./world-facts";

afterEach(() => vi.restoreAllMocks());

function exposure(protection: Protection, kind: "rain" | "snow", storm = true) {
  const g = newGame(17);
  const { state, world } = g;
  state.task = { id: "rest", progress: 0, duration: 60, repeat: false };
  state.weather.storm = storm ? { id: 1, source: "natural", kind, from: 0, until: 600, warned: true } : null;
  state.player.wetness = 10;
  for (const garment of state.player.clothing) garment.wet = kind === "snow" ? 10 : 50;
  siteFor(regionState(state, world, state.player.region), cellOf(state, world)).cover = protection;
  return g;
}

describe("rain and snow storms", () => {
  it("keeps non-gale storms tied to precipitation at onset", () => {
    const { state } = newGame(17);
    const rng = new Rng(5);
    const kinds = new Set<string>();
    for (let day = 1; day <= 365; day++) {
      const minute = day * 1440 + 6 * 60;
      const cal = calendar(minute, state.startDoy);
      const before = state.weather.storm;
      stepWeather(state.weather, cal, rng, 1, minute);
      const storm = state.weather.storm;
      if (!storm || storm === before) continue;
      const air = ambientTemperature(calendar(storm.from, state.startDoy), { ...state.weather, precip: "heavy" });
      if (storm.kind !== "gale") expect(storm.kind).toBe(air <= 0 ? "snow" : "rain");
      kinds.add(storm.kind);
    }
    expect(kinds.has("rain")).toBe(true);
    expect(kinds.has("snow")).toBe(true);
  });

  it.each([[-30, "snow"], [30, "rain"]] as const)("migrates an untyped storm at offset %s without changing its window or random stream", (offset, kind) => {
    const { state } = newGame(17);
    state.startDoy = 0;
    state.minute = 70;
    state.weather.offset = offset;
    const raw = JSON.parse(serialize(state));
    raw.state.weather.storm = { from: 60, until: 420, warned: true };
    const back = readSave(JSON.stringify(raw))!.state;
    expect(back.weather.storm).toEqual({ id: 1, source: "natural", kind, from: 60, until: 420, warned: true });
    expect(back.rng).toBe(state.rng);
    expect(back.opportunities).toEqual(state.opportunities);
    expect(back.shopping).toEqual(state.shopping);
    back.weather.offset *= -1;
    expect(readSave(serialize(back))!.state.weather.storm?.kind).toBe(kind);
  });

  it("keeps freezing precipitation in snow at the zero-degree boundary", () => {
    const { state } = newGame(17);
    state.weather.offset = 0;
    const from = 60;
    const zeroOffset = -ambientTemperature(calendar(from, state.startDoy), { ...state.weather, precip: "heavy" });
    for (const [delta, kind] of [[0, "snow"], [0.001, "rain"]] as const) {
      const raw = JSON.parse(serialize(state));
      raw.state.weather.offset = zeroOffset + delta;
      raw.state.weather.storm = { from, until: 420, warned: false };
      expect(readSave(JSON.stringify(raw))!.state.weather.storm?.kind).toBe(kind);
    }
  });

  it.each([false, true])("gives rain a full protection ladder, including ordinary rain through a windbreak (bare skin: %s)", (bare) => {
    const games = ([0, 1, 2] as const).map((level) => exposure(level, "rain"));
    const ordinary = exposure(0, "rain", false);
    if (bare) ordinary.state.player.clothing = [];
    testRain(8, 10, 0);
    stepPlayer(ordinary.state, ordinary.world, calendar(0), 10, 1);
    testRain(8, 10, 40);
    for (const { state, world } of games) {
      if (bare) state.player.clothing = [];
      stepPlayer(state, world, calendar(0), 10, 1);
    }
    const [open, windbreak, roof] = games.map(({ state }) => state.player);
    expect(open.wetness).toBeGreaterThan(windbreak.wetness);
    expect(windbreak.wetness).toBeGreaterThan(roof.wetness);
    expect(windbreak.wetness).toBe(ordinary.state.player.wetness);
    expect(windbreak.wetness).toBeGreaterThan(10);
    expect(roof.wetness).toBeLessThanOrEqual(10);
    for (let i = 0; i < open.clothing.length; i++) {
      expect(open.clothing[i].wet).toBeGreaterThan(windbreak.clothing[i].wet!);
      expect(windbreak.clothing[i].wet).toBeGreaterThan(roof.clothing[i].wet!);
      expect(windbreak.clothing[i].wet).toBe(ordinary.state.player.clothing[i].wet);
      expect(roof.clothing[i].wet).toBeLessThanOrEqual(50);
    }
  });

  it("lets a windbreak stop snow dampening and take the snow storm wind off the body", () => {
    testRain(8, -10, 40);
    const games = ([0, 1, 2] as const).map((level) => exposure(level, "snow"));
    const temperatures = games.map(({ state, world }) => feltTemperature(state, world, -10));
    expect(temperatures[1]).toBeCloseTo(temperatures[0] + 6);
    expect(temperatures[2]).toBe(temperatures[1]);
    for (const { state, world } of games) stepPlayer(state, world, calendar(0), -10, 1);
    expect(games[0].state.player.wetness).toBeGreaterThan(10);
    expect(games[0].state.player.clothing.every((garment) => garment.wet! > 10)).toBe(true);
    for (const { state } of games.slice(1)) {
      expect(state.player.wetness).toBeLessThanOrEqual(10);
      expect(state.player.clothing.every((garment) => garment.wet! <= 10)).toBe(true);
    }
  });

  it("does not carry a site's windbreak onto outdoor work", () => {
    testRain(8, 10, 40);
    const open = exposure(0, "rain");
    const covered = exposure(1, "rain");
    for (const { state, world } of [open, covered]) {
      state.task = { id: "walk", progress: 0, duration: 60, repeat: false };
      stepPlayer(state, world, calendar(0), 10, 1);
    }
    expect(covered.state.player.wetness).toBe(open.state.player.wetness);
    expect(covered.state.player.clothing).toEqual(open.state.player.clothing);
  });
});

// Seed 17's generated terrain, found by what each cell has to be: a spruce
// canopy, open meadow with nothing upwind of it, meadow behind a blocking
// upwind slope, and exposed ground whose own upwind slope must not turn it
// into lee. The controlled atmosphere these tests run under blows from due
// north, so north is the wind every fixture is found against.
const GALE_WIND = 0;
const GALE_WORLD = newGame(17).world;
const GALE_HOME = GALE_WORLD.start;
const SPRUCE = terrainCellNear(GALE_WORLD, GALE_HOME, "spruce").cell;
const OPEN = leeCellNear(GALE_WORLD, GALE_HOME, "meadow", GALE_WIND, false);
const SLOPE_LEE = leeCellNear(GALE_WORLD, GALE_HOME, "meadow", GALE_WIND);

function galeSite(cell = OPEN) {
  const g = exposure(0, "rain");
  placeAt(g.state, g.world, cell);
  g.state.weather.storm!.kind = "gale";
  const site = siteFor(regionState(g.state, g.world, g.state.player.region), cell);
  return { ...g, site };
}

function windLoss(g: ReturnType<typeof galeSite>): number {
  testRain(8, 10, 40);
  const windy = feltTemperature(g.state, g.world, 10);
  const storm = g.state.weather.storm;
  g.state.weather.storm = null;
  testRain(8, 10, 0);
  const calm = feltTemperature(g.state, g.world, 10);
  g.state.weather.storm = storm;
  testRain(8, 10, 40);
  return calm - windy;
}

describe("gale protection", () => {
  beforeEach(() => testRain(8, 10, 40));

  it("reads lee from the canopy overhead and the blocking ground upwind, never from exposed rock or fell", () => {
    const { world } = newGame(17);
    expect(isLee).toBeTypeOf("function");
    for (const [cell, terrain, lee] of [
      [SPRUCE, "spruce", true], [SLOPE_LEE, "meadow", true],
      [OPEN, "meadow", false], [leeCellNear(world, GALE_HOME, "pine", GALE_WIND, false), "pine", false],
      // Rock and fell behind a blocking slope of their own: still exposed,
      // which is the rule these two are here for.
      [leeCellNear(world, GALE_HOME, "rock", GALE_WIND), "rock", false],
      [leeCellNear(world, GALE_HOME, "fell", GALE_WIND), "fell", false],
      [terrainCellNear(world, GALE_HOME, "water").cell, "water", false],
    ] as const) {
      expect(cellAt(world, cell).terrain).toBe(terrain);
      expect(isLee(world, cell, GALE_WIND)).toBe(lee);
    }
  });

  it("takes the profile of usable cover, including field frames and permanent camp shelters", () => {
    const { state, world, site } = galeSite();
    expect(profileOf).toBeTypeOf("function");
    expect(profileOf(null)).toBe("low");
    expect(profileOf(site)).toBe("low");
    site.emergencyMinutes = 29;
    expect(profileOf(site)).toBe("low");
    site.emergencyMinutes = 30;
    expect(profileOf(site)).toBe("high");
    site.cover = 1;
    expect(profileOf(site)).toBe("low");
    site.emergencyMinutes = 90;
    expect(profileOf(site)).toBe("high");
    site.cover = 2;
    expect(profileOf(site)).toBe("low");
    site.cover = 0;
    site.emergencyMinutes = 0;
    const st = regionState(state, world, state.player.region);
    st.campCell = OPEN;
    for (const [structure, profile] of [["leanTo", "high"], ["snowShelter", "low"], ["turfHut", "low"], ["cabin", "high"]] as const) {
      site.structures[structure] = true;
      expect(profileOf(site)).toBe(profile);
      site.structures[structure] = false;
    }
    // Equipment is not a frame to shelter beneath.
    site.structures.dryingRack = true;
    site.structures.firePit = true;
    expect(profileOf(site)).toBe("low");
  });

  it("clamps the gale scale without changing the site's actual protection", () => {
    expect(galeProtection).toBeTypeOf("function");
    for (const [cell, cover, emergencyMinutes, effective] of [
      [OPEN, 0, 0, 0], [OPEN, 0, 30, 0], [OPEN, 0, 90, 1],
      [OPEN, 2, 0, 2], [SLOPE_LEE, 1, 0, 2], [SPRUCE, 3, 0, 3],
      [SPRUCE, 0, 240, 3],
    ] as const) {
      const g = galeSite(cell);
      g.site.cover = cover;
      g.site.emergencyMinutes = emergencyMinutes;
      const before = JSON.stringify(g.site);
      expect(galeProtection(g.state, g.world, cell, g.site)).toBe(effective);
      expect(JSON.stringify(g.site)).toBe(before);
    }
  });

  it("takes more wind in a frame than low cover at the same base protection, and lee beats a roof", () => {
    const frame = galeSite();
    frame.site.emergencyMinutes = 90;
    const found = galeSite();
    found.site.cover = 2;
    const scrape = galeSite(SLOPE_LEE);
    scrape.site.cover = 1;
    expect(protectionOf(frame.site)).toBe(2);
    expect(protectionOf(found.site)).toBe(2);
    expect(windLoss(frame)).toBeCloseTo(4);
    expect(windLoss(found)).toBeCloseTo(2);
    expect(windLoss(scrape)).toBeCloseTo(2);
    expect(windLoss(scrape)).toBeLessThan(windLoss(frame));
    expect(feltTemperature(scrape.state, scrape.world, 10)).toBeGreaterThan(feltTemperature(frame.state, frame.world, 10));
    expect(feltTemperature(found.state, found.world, 10)).toBeGreaterThan(feltTemperature(frame.state, frame.world, 10));
    const full = galeSite(SPRUCE);
    full.site.cover = 3;
    expect(windLoss(full)).toBe(0);
  });

  it("uses the gale scale for wind-driven skin and garment wetting while rain still needs a roof", () => {
    const frame = galeSite();
    frame.site.emergencyMinutes = 30;
    const found = galeSite();
    found.site.cover = 1;
    const lee = galeSite(SPRUCE);
    for (const g of [frame, found, lee]) stepPlayer(g.state, g.world, calendar(0), 10, 1);
    expect(frame.state.player.wetness).toBeGreaterThan(found.state.player.wetness);
    expect(frame.state.player.clothing[0].wet).toBeGreaterThan(found.state.player.clothing[0].wet!);
    expect(lee.state.player.wetness).toBe(found.state.player.wetness);
    expect(lee.state.player.wetness).toBeGreaterThan(10);
  });

  it("keeps terrain lee during outdoor work but does not carry the site's profile or roof along", () => {
    const open = galeSite();
    const frame = galeSite();
    frame.site.emergencyMinutes = 240;
    const lee = galeSite(SPRUCE);
    for (const g of [open, frame, lee]) g.state.task!.id = "walk";
    expect(windLoss(open)).toBeCloseTo(6);
    expect(windLoss(frame)).toBeCloseTo(6);
    expect(windLoss(lee)).toBeCloseTo(4);
  });
});

describe("ordinary gale generation", () => {
  it("turns one fifth of ordinary storms into gale without changing the existing draw count or windows", () => {
    const { state } = newGame(17);
    const rng = new Rng(5);
    const chance = { spring: 0.04, summer: 0.02, autumn: 0.04, winter: 0.08 };
    let storms = 0;
    let gales = 0;
    for (let day = 1; day <= 30000; day++) {
      state.weather.storm = null;
      const minute = day * 1440 + 6 * 60;
      const cal = calendar(minute, state.startDoy);
      const old = new Rng(rng.s);
      old.gauss();
      old.chance(0.6);
      const rolled = old.chance(chance[cal.season]);
      const from = rolled ? minute + 60 + old.int(121) : null;
      const until = from === null ? null : from + 360 + old.int(721);
      // Ordinary precipitation still consumes its original draws.
      if (state.weather.precip === "none") {
        const starts = { spring: 0.04, summer: 0.03, autumn: 0.04, winter: 0.05 };
        if (old.chance(starts[cal.season] / 60)) old.chance(0.3);
      } else old.chance(0.25 / 60);
      stepWeather(state.weather, cal, rng, 1, minute);
      expect(rng.s).toBe(old.s);
      const storm = state.weather.storm as Weather["storm"];
      expect(storm?.from ?? null).toBe(from);
      expect(storm?.until ?? null).toBe(until);
      if (storm) { storms++; if (storm.kind === "gale") gales++; }
    }
    expect(storms).toBeGreaterThan(1000);
    expect(gales / storms).toBeGreaterThan(0.17);
    expect(gales / storms).toBeLessThan(0.23);
  });

  it("replays gale windows across a save with the same weather and random state", () => {
    const { state } = newGame(17);
    const back = readSave(serialize(state))!.state;
    const a = new Rng(5), b = new Rng(5);
    let gales = 0;
    for (let day = 1; day <= 365; day++) {
      const minute = day * 1440 + 6 * 60;
      const cal = calendar(minute, state.startDoy);
      stepWeather(state.weather, cal, a, 1, minute);
      stepWeather(back.weather, cal, b, 1, minute);
      expect(back.weather).toEqual(state.weather);
      expect(b.s).toBe(a.s);
      if (state.weather.storm?.kind === "gale") gales++;
    }
    expect(gales).toBeGreaterThan(0);
  });
});
