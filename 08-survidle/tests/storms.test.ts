import { describe, expect, it } from "vitest";
import { Rng } from "../src/rng";
import { calendar } from "../src/sim/calendar";
import { newGame } from "../src/sim/newgame";
import { feltTemperature, stepPlayer } from "../src/sim/player";
import { cellOf } from "../src/sim/position";
import { regionState, siteFor } from "../src/sim/regionstate";
import { deserialize, serialize } from "../src/sim/save";
import type { Protection } from "../src/sim/types";
import { ambientTemperature, stepWeather } from "../src/sim/weather";

function exposure(protection: Protection, kind: "rain" | "snow", storm = true) {
  const g = newGame(17);
  const { state, world } = g;
  state.task = { id: "rest", progress: 0, duration: 60, repeat: false };
  state.weather.precip = "heavy";
  state.weather.storm = storm ? { kind, from: 0, until: 600, warned: true } : null;
  state.player.wetness = 10;
  for (const garment of state.player.clothing) garment.wet = kind === "snow" ? 10 : 50;
  siteFor(regionState(state, world, state.player.region), cellOf(state, world)).cover = protection;
  return g;
}

describe("rain and snow storms", () => {
  it("rolls only rain and snow, following the air at onset", () => {
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
      expect(storm.kind).toBe(air <= 0 ? "snow" : "rain");
      kinds.add(storm.kind);
    }
    expect([...kinds].sort()).toEqual(["rain", "snow"]);
  });

  it.each([[-30, "snow"], [30, "rain"]] as const)("migrates an untyped storm at offset %s without changing its window or random stream", (offset, kind) => {
    const { state } = newGame(17);
    state.startDoy = 0;
    state.minute = 70;
    state.weather.offset = offset;
    const raw = JSON.parse(serialize(state));
    raw.state.weather.storm = { from: 60, until: 420, warned: true };
    const back = deserialize(JSON.stringify(raw))!.state;
    expect(back.weather.storm).toEqual({ kind, from: 60, until: 420, warned: true });
    expect(back.rng).toBe(state.rng);
    expect(back.goals).toEqual(state.goals);
    expect(back.shopping).toEqual(state.shopping);
    back.weather.offset *= -1;
    expect(deserialize(serialize(back))!.state.weather.storm?.kind).toBe(kind);
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
      expect(deserialize(JSON.stringify(raw))!.state.weather.storm?.kind).toBe(kind);
    }
  });

  it.each([false, true])("gives rain a full protection ladder, including ordinary rain through a windbreak (bare skin: %s)", (bare) => {
    const games = ([0, 1, 2] as const).map((level) => exposure(level, "rain"));
    const ordinary = exposure(0, "rain", false);
    for (const { state, world } of [...games, ordinary]) {
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
