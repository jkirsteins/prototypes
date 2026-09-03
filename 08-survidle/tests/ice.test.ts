import { describe, expect, it } from "vitest";
import { Rng } from "../src/rng";
import { advance } from "../src/sim/advance";
import { calendar } from "../src/sim/calendar";
import { newGame } from "../src/sim/newgame";
import { cellOf, placeAt } from "../src/sim/position";
import { check, startTask, stepTask } from "../src/sim/tasks";
import { iceMode, seasonalMean, stepWeather } from "../src/sim/weather";
import { cellAt, regionAt } from "../src/world/gen";
import { findRoute } from "../src/world/route";

/** A water cell in the player's region and a land cell beside it. */
function shoreAndWater(g: ReturnType<typeof newGame>) {
  const { state, world } = g;
  const r = regionAt(world, state.player.region);
  for (const c of r.cells) {
    if (cellAt(world, c).terrain !== "water") continue;
    for (const d of [1, -1, world.w, -world.w]) {
      const n = c + d;
      if (n >= 0 && n < world.w * world.h && cellAt(world, n).terrain !== "water") return { water: c, land: n };
    }
  }
  throw new Error("no shore in this region");
}

describe("ice", () => {
  it("grows on cold days, melts on warm ones, and opens routes over water", () => {
    const { state, world } = newGame(42);
    const w = state.weather;
    const rng = new Rng(1);
    // Fourteen days at -10, by Stefan's law: thickness squared gains 7.2 per freezing degree-day, sqrt(14 * 72) is about 32 cm.
    for (let d = 1; d <= 14; d++) {
      w.rolledDay = d - 1;
      const c = calendar(d * 1440 + 8 * 60);
      w.offset = -10 - seasonalMean(c.dayOfYear);
      stepWeather(w, c, rng, 1);
    }
    expect(w.iceCm).toBeGreaterThanOrEqual(15);
    expect(iceMode(w)).toBe("safe");
    const frozen = w.iceCm;
    const { water, land } = shoreAndWater({ state, world });
    expect(findRoute(world, land, water)).toBeNull();
    expect(findRoute(world, land, water, "safe")).toEqual([water]);
    // Five days at +1: melting is linear, two centimetres a day.
    for (let d = 15; d <= 19; d++) {
      w.rolledDay = d - 1;
      const c = calendar(d * 1440 + 8 * 60);
      w.offset = 1 - seasonalMean(c.dayOfYear);
      stepWeather(w, c, rng, 1);
    }
    expect(w.iceCm).toBeCloseTo(frozen - 10, 5);
    // Forty more days at +5: far more melt than is left, so it floors at 0 rather than going negative.
    for (let d = 20; d <= 59; d++) {
      w.rolledDay = d - 1;
      const c = calendar(d * 1440 + 8 * 60);
      w.offset = 5 - seasonalMean(c.dayOfYear);
      stepWeather(w, c, rng, 1);
    }
    expect(w.iceCm).toBe(0);
    w.iceCm = 8;
    expect(iceMode(w)).toBe("thin");
    expect(findRoute(world, land, water, "safe")).toEqual([water]);
    w.iceCm = 4;
    expect(iceMode(w)).toBe("none");
  });

  it("a walk onto thin ice may go through: most drown, the rest crawl out soaked on the shore", () => {
    const drowned: boolean[] = [];
    for (let seed = 1; seed <= 12; seed++) {
      const g = newGame(42);
      const { state, world } = g;
      state.weather.iceCm = 5;
      const { water, land } = shoreAndWater(g);
      placeAt(state, world, land);
      const cal = calendar(state.minute);
      expect(check(state, world, cal, "walk", `cell:${water}`).ok).toBe(false);
      expect(check(state, world, cal, "walk", `cell:${water}:thin`).ok).toBe(true);
      startTask(state, world, cal, "walk", `cell:${water}:thin`);
      const rng = new Rng(seed);
      for (let m = 0; m < 30 && state.task; m++) stepTask(state, world, cal, rng, 1);
      if (state.dead) {
        expect(state.dead.cause).toBe("drowned");
        drowned.push(true);
      } else if (state.log.some((e) => e.text.startsWith("Through the ice"))) {
        expect(state.player.wetness).toBe(100);
        expect(state.player.clothing.every((c) => c.wet === 100)).toBe(true);
        expect(cellAt(world, cellOf(state, world)).terrain).not.toBe("water");
        drowned.push(false);
      }
    }
    // Ten percent per cell at 5 cm across twelve tries: at least one fall, and
    // fallThrough drowns three in five, so across enough falls at least half should.
    expect(drowned.length).toBeGreaterThan(0);
    expect(drowned.filter(Boolean).length / drowned.length).toBeGreaterThanOrEqual(0.5);
  });

  it("safe ice crossed, then melted, leaves no way back", () => {
    const g = newGame(42);
    const { state, world } = g;
    state.weather.iceCm = 16;
    const { water, land } = shoreAndWater(g);
    placeAt(state, world, land);
    const cal = calendar(state.minute);
    startTask(state, world, cal, "walk", `cell:${water}`);
    const rng = new Rng(1);
    for (let m = 0; m < 30 && state.task; m++) stepTask(state, world, cal, rng, 1);
    expect(cellOf(state, world)).toBe(water);
    state.weather.iceCm = 3;
    expect(check(state, world, cal, "walk", `cell:${land}`).why).toBe("no way there on foot");
    // Standing on water with the ice gone rolls the fall every minute.
    advance(state, world, 60 * 12);
    expect(state.dead !== null || state.log.some((e) => e.text.startsWith("Through the ice"))).toBe(true);
  });

  it("a year of ordinary weather freezes one winter's worth of safe ice and none of it lasts to summer", () => {
    const { state } = newGame(42);
    const w = state.weather;
    const rng = new Rng(2);
    let safeDays = 0;
    let firstSafeDoy: number | null = null;
    let peak = 0;
    for (let d = 1; d <= 365; d++) {
      w.rolledDay = d - 1;
      const c = calendar(d * 1440 + 8 * 60);
      stepWeather(w, c, rng, 1);
      if (w.iceCm > peak) peak = w.iceCm;
      if (w.iceCm >= 15) {
        safeDays++;
        if (firstSafeDoy === null) firstSafeDoy = c.dayOfYear;
      }
      if (c.dayOfYear === 160) expect(w.iceCm).toBe(0);
    }
    expect(safeDays).toBeGreaterThanOrEqual(100);
    expect(safeDays).toBeLessThanOrEqual(170);
    expect(firstSafeDoy).not.toBeNull();
    expect(firstSafeDoy! >= 320 || firstSafeDoy! <= 20).toBe(true);
    expect(peak).toBeLessThan(120);
  });
});
