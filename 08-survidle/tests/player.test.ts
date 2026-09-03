import { describe, expect, it } from "vitest";
import { calendar } from "../src/sim/calendar";
import { newGame } from "../src/sim/newgame";
import { placeAtSpot } from "../src/sim/position";
import { causeFrom, feltTemperature, stepPlayer, walkSpeed } from "../src/sim/player";
import { regionState } from "../src/sim/regionstate";

describe("player physiology", () => {
  it("regenerates when fed, warm and idle", () => {
    const { state, world } = newGame(1);
    state.player.health = 50;
    for (let m = 0; m < 60; m++) stepPlayer(state, world, 15, 1);
    expect(state.player.health).toBeCloseTo(51, 1);
  });

  it("burns about 100 kcal per idle hour and more when chopping", () => {
    const { state, world } = newGame(1);
    const k0 = state.player.kcal;
    for (let m = 0; m < 60; m++) stepPlayer(state, world, 15, 1);
    expect(k0 - state.player.kcal).toBeCloseTo(100, 0);
    state.task = { id: "chop", progress: 0, duration: 60, repeat: false };
    const k1 = state.player.kcal;
    for (let m = 0; m < 60; m++) stepPlayer(state, world, 15, 1);
    expect(k1 - state.player.kcal).toBeCloseTo(400, 0);
  });

  it("starves at 2 health per hour with an empty reserve", () => {
    const { state, world } = newGame(1);
    state.player.kcal = 0;
    for (let m = 0; m < 60; m++) stepPlayer(state, world, 15, 1);
    expect(state.player.health).toBeCloseTo(98, 1);
  });

  it("loses warmth in the cold and health once hypothermic", () => {
    const { state, world } = newGame(1);
    // Starting wool gives about +9 C; at -25 C the body is far below comfort.
    expect(feltTemperature(state, world, -25)).toBeLessThan(-10);
    for (let m = 0; m < 220; m++) stepPlayer(state, world, -25, 1);
    expect(state.player.warmth).toBeLessThan(20);
    const h = state.player.health;
    for (let m = 0; m < 60; m++) stepPlayer(state, world, -25, 1);
    expect(h - state.player.health).toBeCloseTo(6, 0);
    expect(causeFrom({ starve: 0, cold: 1, sick: 0, thirst: 0, smoke: 0 })).toBe("froze");
  });

  it("a fire and a cabin at camp make the difference", () => {
    const { state, world } = newGame(1);
    const bare = feltTemperature(state, world, -20);
    regionState(state, world, state.player.region).fire.lit = true;
    regionState(state, world, state.player.region).structures.cabin = true;
    // A cabin's own fire needs a hearth to warm anyone; without one only the roof counts.
    regionState(state, world, state.player.region).structures.hearth = true;
    expect(feltTemperature(state, world, -20)).toBeCloseTo(bare + 30, 5);
    // Out at the forest the fire and roof do not reach you.
    placeAtSpot(state, world, state.player.region, "forest");
    expect(feltTemperature(state, world, -20)).toBeCloseTo(bare, 5);
  });

  it("gets wet in rain and dries by the fire", () => {
    const { state, world } = newGame(1);
    state.weather.precip = "heavy";
    for (let m = 0; m < 30; m++) stepPlayer(state, world, 5, 1);
    // The coat and trousers start dry, so they keep most of the rain off the skin at first.
    expect(state.player.wetness).toBeLessThan(20);
    for (let m = 0; m < 60; m++) stepPlayer(state, world, 5, 1);
    // Soaked through by now, the skin catches up with the rain.
    expect(state.player.wetness).toBeGreaterThan(50);
    state.weather.precip = "none";
    regionState(state, world, state.player.region).fire.lit = true;
    for (let m = 0; m < 70; m++) stepPlayer(state, world, 5, 1);
    expect(state.player.wetness).toBe(0);
  });

  it("walks slower in deep snow, at night and under a heavy pack", () => {
    const { state } = newGame(1);
    const day = calendar(4 * 60);
    const night = calendar(16 * 60);
    const clear = { ...state.weather, snowCm: 0 };
    expect(walkSpeed(state, day, clear, "pine", 5)).toBeCloseTo(3.0);
    expect(walkSpeed(state, day, { ...clear, snowCm: 40 }, "pine", 5)).toBeCloseTo(1.5);
    expect(walkSpeed(state, night, clear, "pine", 5)).toBeCloseTo(2.25);
    expect(walkSpeed(state, day, clear, "pine", 30)).toBeCloseTo(2.4);
    expect(walkSpeed(state, day, clear, "bog", 5)).toBeCloseTo(2.1);
    expect(walkSpeed(state, day, clear, "fell", 5)).toBeCloseTo(1.5);
  });
});
