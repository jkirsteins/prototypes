import { describe, expect, it } from "vitest";
import { Rng } from "../src/rng";
import { advance } from "../src/sim/advance";
import { calendar } from "../src/sim/calendar";
import { newGame } from "../src/sim/newgame";
import { feltTemperature, stepPlayer } from "../src/sim/player";
import { placeAt, placeAtSpot } from "../src/sim/position";
import { craftSuccess } from "../src/sim/skills";
import { check, huntOdds } from "../src/sim/tasks";
import type { GameState, Terrain } from "../src/sim/types";
import { stepWeather, stormNow } from "../src/sim/weather";
import { cellAt, regionAt, type World } from "../src/world/gen";

const cal = calendar(0);

/** The nearest cell of one of these terrains, breadth-first over the region graph from `from`. */
function findCell(world: World, from: number, terrains: Terrain[]): number {
  const visited = new Set([from]);
  let frontier = [from];
  while (frontier.length) {
    const next: number[] = [];
    for (const id of frontier) {
      const r = regionAt(world, id);
      const cell = r.cells.find((c) => terrains.includes(cellAt(world, c).terrain));
      if (cell !== undefined) return cell;
      for (const nb of r.neighbours) {
        if (!visited.has(nb.id)) {
          visited.add(nb.id);
          next.push(nb.id);
        }
      }
    }
    frontier = next;
  }
  throw new Error(`no cell of ${terrains.join("/")} reachable from region ${from}`);
}

/** Places the player on the nearest cell of one of these terrains, sets the snow, and returns the kcal a walking hour there costs. */
function burnForTerrain(state: GameState, world: World, terrains: Terrain[], snowCm: number): number {
  state.weather.snowCm = snowCm;
  const cell = findCell(world, state.player.region, terrains);
  placeAt(state, world, cell);
  state.player.kcal = 5000;
  const k0 = state.player.kcal;
  for (let m = 0; m < 60; m++) stepPlayer(state, world, 15, 1);
  return k0 - state.player.kcal;
}

describe("storms", () => {
  it("a storm is announced an hour ahead, then it blows: heavy rain, six degrees of wind, half the odds, no felling or fishing", () => {
    const { state, world } = newGame(17);
    state.weather.storm = { from: state.minute + 60, until: state.minute + 60 + 6 * 60, warned: false };
    advance(state, world, 1);
    expect(state.log.some((e) => e.text === "The sky is closing in from the west.")).toBe(true);
    const calm = feltTemperature(state, world, 5);
    advance(state, world, 60);
    expect(stormNow(state.weather, state.minute)).toBe(true);
    expect(state.weather.precip).toBe("heavy");
    expect(feltTemperature(state, world, 5)).toBeLessThan(calm - 5);
    placeAtSpot(state, world, state.player.region, "forest");
    expect(check(state, world, calendar(state.minute), "chop").why).toBe("too rough");
    const d = 0.5;
    const odds = huntOdds(state, world, calendar(state.minute), d, "hare");
    advance(state, world, 6 * 60);
    expect(stormNow(state.weather, state.minute)).toBe(false);
    expect(huntOdds(state, world, calendar(state.minute), d, "hare")).toBeGreaterThan(odds * 1.5);
  });

  it("storm days come from the daily roll a few times a season", () => {
    const { state } = newGame(17);
    const w = state.weather;
    const rng = new Rng(5);
    let storms = 0;
    for (let d = 1; d <= 365; d++) {
      w.rolledDay = d - 1;
      const before = w.storm;
      stepWeather(w, calendar(d * 1440 + 8 * 60), rng, 1);
      if (w.storm && w.storm !== before) storms++;
    }
    expect(storms).toBeGreaterThan(5);
    expect(storms).toBeLessThan(40);
  });
});

describe("the body at work", () => {
  it("walking the fell burns twice what the forest does, and deep snow doubles it again", () => {
    const { state, world } = newGame(17);
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
    for (let m = 0; m < 60; m++) stepPlayer(state, world, 15, 1);
    expect(state.player.energy - e0).toBeCloseTo(4, 1);
  });
});
