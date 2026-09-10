import { afterEach, describe, expect, it, vi } from "vitest";
import { advance } from "../src/sim/advance";
import { calendar } from "../src/sim/calendar";
import { KCAL_FULL } from "../src/sim/items";
import { newGame } from "../src/sim/newgame";
import { fatLandmarks, medianPerson } from "../src/sim/person";
import { feltTemperature, stepPlayer } from "../src/sim/player";
import { cellOf, placeAt, placeAtSpot } from "../src/sim/position";
import { craftSuccess } from "../src/sim/skills";
import { check, huntOdds } from "../src/sim/tasks";
import type { GameState, Terrain } from "../src/sim/types";
import { ensureGround, localWeather, localStorm } from "../src/sim/weather";
import { cellAt, type World } from "../src/world/gen";
import { testRain, testAtmosphere } from "./weather-helpers";
afterEach(() => vi.restoreAllMocks());

const cal = calendar(0);

/** Cap on the ring radius, in cells, a search for a terrain may walk out to. */
const MAX_FIND_RADIUS = 400;

/**
 * The nearest cell of one of these terrains, scanning outward from `from` in
 * growing square rings. Reads only `cellAt`, which fills terrain chunks
 * lazily and caches them; it never touches the (much pricier) region graph.
 */
function findCell(world: World, from: number, terrains: Terrain[]): number {
  const cx = from % world.w;
  const cy = Math.floor(from / world.w);
  if (terrains.includes(cellAt(world, from).terrain)) return from;
  for (let r = 1; r <= MAX_FIND_RADIUS; r++) {
    for (let dx = -r; dx <= r; dx++) {
      for (let dy = -r; dy <= r; dy++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const x = cx + dx;
        const y = cy + dy;
        if (x < 0 || x >= world.w || y < 0 || y >= world.h) continue;
        const idx = y * world.w + x;
        if (terrains.includes(cellAt(world, idx).terrain)) return idx;
      }
    }
  }
  throw new Error(`no cell of ${terrains.join("/")} within ${MAX_FIND_RADIUS} cells of the start`);
}

/** Places the player on the nearest cell of one of these terrains, sets the snow, and returns the kcal a walking hour there costs. */
function burnForTerrain(state: GameState, world: World, terrains: Terrain[], snowCm: number): number {
  const cell = findCell(world, cellOf(state, world), terrains);
  placeAt(state, world, cell);
  ensureGround(state, world, state.player.region).snowCm = snowCm;
  state.player.kcal = KCAL_FULL;
  const k0 = state.player.kcal;
  for (let m = 0; m < 60; m++) stepPlayer(state, world, calendar(state.minute, state.startDoy), 15, 1);
  return k0 - state.player.kcal;
}

describe("storms", () => {
  it("diagnoses local storms and applies wind, work and hunting consequences", () => {
    testRain(0);
    const { state, world } = newGame(17);
    placeAtSpot(state, world, state.player.region, "forest");
    const calm = feltTemperature(state, world, 5);
    const odds = huntOdds(state, world, cal, 0.5, "hare");
    testRain(10, 5, 40);
    expect(localWeather(state, world).storm).not.toBeNull();
    expect(feltTemperature(state, world, 5)).toBe(calm - 6);
    expect(check(state, world, cal, "chop").why).toBe("too rough");
    expect(huntOdds(state, world, cal, 0.5, "hare")).toBeLessThan(odds * 0.6);
  });

  it("requires both heavy precipitation and strong wind", () => {
    const air = testAtmosphere({ precipMmPerHour: 8, windKmh: 36 });
    expect(localStorm(air)).toBe(true);
    expect(localStorm({ ...air, windKmh: 34 })).toBe(false);
    expect(localStorm({ ...air, precipMmPerHour: 7 })).toBe(false);
  });

  it("logs threshold transitions once with precipitation hysteresis", () => {
    testRain(0);
    const { state, world } = newGame(17);
    advance(state, world, 1);
    testRain(0.21);
    advance(state, world, 1);
    testRain(0.15);
    advance(state, world, 1);
    testRain(0.21);
    advance(state, world, 1);
    expect(state.log.filter((e) => e.text === "Rain sets in.")).toHaveLength(1);
    testRain(0.09);
    advance(state, world, 1);
    expect(state.log.filter((e) => e.text === "The rain stops.")).toHaveLength(1);
  });
});

describe("the body at work", () => {
  it("walking the fell burns twice what the forest does, and deep snow doubles it again", () => {
    // The base bucket scales by sex as well as build, so this seam - terrain and snow
    // alone - is pinned against the median man rather than whatever sex seed 17 rolls.
    // The reserve is set to this body's typical share too, so the live base burn lands
    // on the reference BASE_KCAL_PER_HOUR and the terrain/snow comparison stays exact.
    const { state, world } = newGame(17, undefined, medianPerson("m"));
    state.player.fat = fatLandmarks(medianPerson("m")).typical;
    state.task = { id: "walk", progress: 0, duration: 60, repeat: false };
    const forest = burnForTerrain(state, world, ["spruce", "pine", "birch"], 0);
    expect(burnForTerrain(state, world, ["fell"], 0)).toBeCloseTo(forest * 2, 0);
    expect(burnForTerrain(state, world, ["spruce", "pine", "birch"], 40)).toBeCloseTo(forest * 2, 0);
  });

  it("spent, the bow misses more, the craft spoils more, and rest gives less back", () => {
    const { state, world } = newGame(1);
    const o = huntOdds(state, world, cal, 0.5, "hare");
    const c = craftSuccess(state, "bow");
    state.player.energy = 25;
    expect(huntOdds(state, world, cal, 0.5, "hare")).toBeCloseTo(o * 0.75, 6);
    state.player.energy = 15;
    expect(huntOdds(state, world, cal, 0.5, "hare")).toBeCloseTo(o * 0.5, 6);
    expect(craftSuccess(state, "bow")).toBeCloseTo(1 - Math.min(1, 2 * (1 - c)), 6);
    state.task = { id: "rest", progress: 0, duration: 60, repeat: false };
    const e0 = state.player.energy;
    for (let m = 0; m < 60; m++) stepPlayer(state, world, calendar(state.minute, state.startDoy), 15, 1);
    expect(state.player.energy - e0).toBeCloseTo(4, 1);
  });
});
