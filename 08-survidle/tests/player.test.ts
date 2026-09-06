import { describe, expect, it } from "vitest";
import { calendar } from "../src/sim/calendar";
import { newGame } from "../src/sim/newgame";
import { placeAtSpot } from "../src/sim/position";
import { causeFrom, coldBurnFactor, feltTemperature, KCAL_PER_HOUR_FOR_TEST, LOAD_KCAL_PER_HOUR, NIGHT_WALK_FACTOR, baseWalkSpeed, stepPlayer, walkSpeed } from "../src/sim/player";
import { regionState } from "../src/sim/regionstate";

describe("player physiology", () => {
  it("regenerates when fed, warm and idle", () => {
    const { state, world } = newGame(1);
    state.player.health = 50;
    for (let m = 0; m < 60; m++) stepPlayer(state, world, calendar(state.minute, state.startDoy), 15, 1);
    expect(state.player.health).toBeCloseTo(51, 1);
  });

  it("burns about 100 kcal per idle hour and more when chopping", () => {
    const { state, world } = newGame(1);
    const k0 = state.player.kcal;
    for (let m = 0; m < 60; m++) stepPlayer(state, world, calendar(state.minute, state.startDoy), 15, 1);
    expect(k0 - state.player.kcal).toBeCloseTo(100, 0);
    state.task = { id: "chop", progress: 0, duration: 60, repeat: false };
    const k1 = state.player.kcal;
    for (let m = 0; m < 60; m++) stepPlayer(state, world, calendar(state.minute, state.startDoy), 15, 1);
    // Heavy work at 500 kcal/h: the MET tables' 6 to 7 MET at 72 kg for axe work.
    expect(k1 - state.player.kcal).toBeCloseTo(500, 0);
  });

  it("starves at 2 health per hour with kcal and fat both empty", () => {
    const { state, world } = newGame(1);
    state.player.kcal = 0;
    state.player.fat = 0;
    for (let m = 0; m < 60; m++) stepPlayer(state, world, calendar(state.minute, state.startDoy), 15, 1);
    expect(state.player.health).toBeCloseTo(98, 1);
  });

  it("loses warmth in the cold and health once hypothermic", () => {
    const { state, world } = newGame(1);
    // Starting wool gives about +9 C; at -25 C the body is far below comfort.
    expect(feltTemperature(state, world, -25)).toBeLessThan(-10);
    for (let m = 0; m < 220; m++) stepPlayer(state, world, calendar(state.minute, state.startDoy), -25, 1);
    expect(state.player.warmth).toBeLessThan(20);
    const h = state.player.health;
    for (let m = 0; m < 60; m++) stepPlayer(state, world, calendar(state.minute, state.startDoy), -25, 1);
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
    for (let m = 0; m < 30; m++) stepPlayer(state, world, calendar(state.minute, state.startDoy), 5, 1);
    // The coat and trousers start dry, so they keep most of the rain off the skin at first.
    expect(state.player.wetness).toBeLessThan(20);
    for (let m = 0; m < 60; m++) stepPlayer(state, world, calendar(state.minute, state.startDoy), 5, 1);
    // Soaked through by now, the skin catches up with the rain.
    expect(state.player.wetness).toBeGreaterThan(50);
    state.weather.precip = "none";
    regionState(state, world, state.player.region).fire.lit = true;
    for (let m = 0; m < 70; m++) stepPlayer(state, world, calendar(state.minute, state.startDoy), 5, 1);
    expect(state.player.wetness).toBe(0);
  });

  it("walks slower in deep snow, at night and under a heavy pack", () => {
    const { state } = newGame(1);
    const day = calendar(4 * 60);
    const night = calendar(16 * 60);
    const clear = { ...state.weather, snowCm: 0 };
    expect(walkSpeed(state, day, clear, "pine", 5)).toBeCloseTo(3.0);
    expect(walkSpeed(state, day, { ...clear, snowCm: 40 }, "pine", 5)).toBeCloseTo(1.5);
    // The Swedish handbook's 1 km/h in terrain against 3 by day, NIGHT_WALK_FACTOR.
    expect(walkSpeed(state, night, clear, "pine", 5)).toBeCloseTo(1.0);
    expect(walkSpeed(state, day, clear, "pine", 30)).toBeCloseTo(2.4);
    expect(walkSpeed(state, day, clear, "bog", 5)).toBeCloseTo(2.1);
    expect(walkSpeed(state, day, clear, "fell", 5)).toBeCloseTo(1.5);
  });
});

describe("the body's rates read the handbooks", () => {
  it("the cold burn grows with the felt cold: 1 at zero, 1.3 at -15, 1.6 at -30, capped at 2", () => {
    expect(coldBurnFactor(5)).toBe(1);
    expect(coldBurnFactor(0)).toBe(1);
    expect(coldBurnFactor(-15)).toBeCloseTo(1.3, 6);
    expect(coldBurnFactor(-30)).toBeCloseTo(1.6, 6);
    expect(coldBurnFactor(-50)).toBe(2);
    expect(coldBurnFactor(-80)).toBe(2);
  });

  it("heavy work is 500 kcal an hour and a loaded walk pays 150 over the comfortable limit and 300 over the hard one", () => {
    expect(KCAL_PER_HOUR_FOR_TEST.heavy).toBe(500);
    expect(LOAD_KCAL_PER_HOUR).toEqual({ comfortable: 150, hard: 300 });
  });

  it("the dark without a torch is a third of day speed", () => {
    const { state } = newGame(17);
    const night = calendar(14 * 60);
    expect(night.isNight).toBe(true);
    const day = calendar(4 * 60);
    expect(day.isNight).toBe(false);
    expect(NIGHT_WALK_FACTOR).toBeCloseTo(1 / 3, 6);
    expect(baseWalkSpeed(state, night, state.weather) / baseWalkSpeed(state, day, state.weather)).toBeCloseTo(1 / 3, 6);
    state.player.torch = { lit: true, minutes: 30 };
    expect(baseWalkSpeed(state, night, state.weather)).toBeCloseTo(baseWalkSpeed(state, day, state.weather), 6);
  });
});
