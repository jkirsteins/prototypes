import { afterEach, describe, expect, it, vi } from "vitest";
import { Rng } from "../src/rng";
import { advance } from "../src/sim/advance";
import { calendar } from "../src/sim/calendar";
import { newGame } from "../src/sim/newgame";
import { cellOf, placeAt } from "../src/sim/position";
import { check, fallThrough, startTask, stepTask } from "../src/sim/tasks";
import { ensureGround, iceMode, integrateGroundHour } from "../src/sim/weather";
import { cellAt, regionAt } from "../src/world/gen";
import { findRoute } from "../src/world/route";
import { siteCamp } from "./siting-helpers";
import { testAtmosphere } from "./weather-helpers";
afterEach(() => vi.restoreAllMocks());

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
    let w = ensureGround(state, world, state.player.region);
    const air = testAtmosphere({ temperatureC: -10 });
    w = { ...w, updatedHour: -8, iceCm: 0 };
    // Fourteen days at -10, by Stefan's law: thickness squared gains 7.2 per freezing degree-day, sqrt(14 * 72) is about 32 cm.
    for (let d = 1; d <= 14; d++) {
      for (let h = 0; h < 24; h++) w = integrateGroundHour(w, air);
    }
    expect(w.iceCm).toBeGreaterThanOrEqual(15);
    expect(iceMode(w)).toBe("safe");
    const frozen = w.iceCm;
    const { water, land } = shoreAndWater({ state, world });
    expect(findRoute(world, land, water)).toBeNull();
    expect(findRoute(world, land, water, "safe")).toEqual([water]);
    // Five days at +1: melting is linear, two centimetres a day.
    for (let d = 15; d <= 19; d++) {
      for (let h = 0; h < 24; h++) w = integrateGroundHour(w, { ...air, temperatureC: 1 });
    }
    expect(w.iceCm).toBeCloseTo(frozen - 10, 5);
    // Forty more days at +5: far more melt than is left, so it floors at 0 rather than going negative.
    for (let d = 20; d <= 59; d++) {
      for (let h = 0; h < 24; h++) w = integrateGroundHour(w, { ...air, temperatureC: 5 });
    }
    expect(w.iceCm).toBe(0);
    w.iceCm = 8;
    expect(iceMode(w)).toBe("thin");
    expect(findRoute(world, land, water, "safe")).toEqual([water]);
    w.iceCm = 4;
    expect(iceMode(w)).toBe("none");
  });

  it("a walk onto thin ice may go through: most drown, the rest crawl out soaked on the shore", () => {
    testAtmosphere({ temperatureC: -5 });
    const drowned: boolean[] = [];
    for (let seed = 1; seed <= 12; seed++) {
      const g = newGame(42);
      siteCamp(g.state, g.world);
      const { state, world } = g;
      ensureGround(state, world, state.player.region).iceCm = 5;
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
        expect(state.route).toBeNull();
        expect(state.task).toBeNull();
        drowned.push(true);
      } else if (state.log.some((e) => e.text.startsWith("Through the ice"))) {
        expect(state.player.wetness).toBe(100);
        expect(state.player.clothing.every((c) => c.wet === 100)).toBe(true);
        expect(cellAt(world, cellOf(state, world)).terrain).not.toBe("water");
        expect(state.route).toBeNull();
        expect(state.task).toBeNull();
        drowned.push(false);
      }
    }
    // Ten percent per cell at 5 cm across twelve tries: at least one fall, and
    // fallThrough drowns three in five, so across enough falls at least half should.
    expect(drowned.length).toBeGreaterThan(0);
    expect(drowned.filter(Boolean).length / drowned.length).toBeGreaterThanOrEqual(0.5);
  });

  it("ends the crossing route and task whether the fall drowns or reaches shore", () => {
    const crossing = () => {
      testAtmosphere({ temperatureC: -5 });
      const g = newGame(42);
      siteCamp(g.state, g.world);
      ensureGround(g.state, g.world, g.state.player.region).iceCm = 5;
      const { water, land } = shoreAndWater(g);
      placeAt(g.state, g.world, land);
      startTask(g.state, g.world, calendar(g.state.minute), "walk", `cell:${water}:thin`);
      expect(g.state.route).not.toBeNull();
      expect(g.state.task?.id).toBe("walk");
      g.state.intent = { mode: "care", care: "body", need: "home", orderId: 1, step: "crossing the ice" };
      return { ...g, land };
    };

    const drowned = crossing();
    const drowningRng = new Rng(1);
    vi.spyOn(drowningRng, "chance").mockReturnValue(true);
    fallThrough(drowned.state, drowned.world, drowningRng, drowned.land);
    expect(drowned.state.dead?.cause).toBe("drowned");
    expect(drowned.state.route).toBeNull();
    expect(drowned.state.task).toBeNull();
    expect(drowned.state.intent).toBeNull();

    const escaped = crossing();
    const escapeRng = new Rng(1);
    vi.spyOn(escapeRng, "chance").mockReturnValue(false);
    fallThrough(escaped.state, escaped.world, escapeRng, escaped.land);
    expect(escaped.state.dead).toBeNull();
    expect(cellOf(escaped.state, escaped.world)).toBe(escaped.land);
    expect(escaped.state.route).toBeNull();
    expect(escaped.state.task).toBeNull();
    expect(escaped.state.intent).toBeNull();
  });

  it("safe ice crossed, then melted, leaves no way back", () => {
    const g = newGame(42);
    siteCamp(g.state, g.world);
    const { state, world } = g;
    ensureGround(state, world, state.player.region).iceCm = 16;
    const { water, land } = shoreAndWater(g);
    placeAt(state, world, land);
    const cal = calendar(state.minute);
    startTask(state, world, cal, "walk", `cell:${water}`);
    const rng = new Rng(1);
    for (let m = 0; m < 30 && state.task; m++) stepTask(state, world, cal, rng, 1);
    expect(cellOf(state, world)).toBe(water);
    ensureGround(state, world, state.player.region).iceCm = 3;
    expect(check(state, world, cal, "walk", `cell:${land}`).why).toBe("{you} {know} no way there");
    // Standing on water with the ice gone rolls the fall every minute.
    advance(state, world, 60 * 12);
    expect(state.dead !== null || state.log.some((e) => e.text.startsWith("Through the ice"))).toBe(true);
  });

  it("local winter ice melts away in summer", () => {
    const { state, world } = newGame(42, 200);
    let winterPeak = 0;
    for (let day = 1; day <= 365; day++) {
      state.minute = day * 1440;
      const cal = calendar(state.minute, state.startDoy);
      const ground = ensureGround(state, world, state.player.region);
      if (cal.season === "winter") winterPeak = Math.max(winterPeak, ground.iceCm);
      if (cal.dayOfYear === 160) expect(ground.iceCm).toBe(0);
    }
    expect(winterPeak).toBeGreaterThan(15);
    expect(winterPeak).toBeLessThan(120);
  });
});
