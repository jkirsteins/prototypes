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
    // Fourteen days at -10: half a centimetre per degree per day.
    for (let d = 1; d <= 14; d++) {
      w.rolledDay = d - 1;
      const c = calendar(d * 1440 + 8 * 60);
      w.offset = -10 - seasonalMean(c.dayOfYear);
      stepWeather(w, c, rng, 1);
    }
    expect(w.iceCm).toBeGreaterThanOrEqual(15);
    expect(iceMode(w)).toBe("safe");
    const { water, land } = shoreAndWater({ state, world });
    expect(findRoute(world, land, water)).toBeNull();
    expect(findRoute(world, land, water, "safe")).toEqual([water]);
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
    // Ten percent per cell at 5 cm across twelve tries: at least one fall, and drowning is the likelier end.
    expect(drowned.length).toBeGreaterThan(0);
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
    // Standing on water with the ice gone rolls the fall hourly.
    advance(state, world, 60 * 12);
    expect(state.dead !== null || state.log.some((e) => e.text.startsWith("Through the ice"))).toBe(true);
  });
});
