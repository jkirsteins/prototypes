import { describe, expect, it } from "vitest";
import { garmentWet, skinExposure, stepGarments, wetFactor } from "../src/sim/clothing";
import { newGame } from "../src/sim/newgame";
import { insulation, stepPlayer } from "../src/sim/player";

const dry = { raining: false, heavy: false, snowing: false, roof: false, cabin: false, fireAtCamp: false, bedded: false, storm: false };

describe("wet clothing", () => {
  it("rain soaks the outer layer first, and a soaked wool coat keeps half its warmth", () => {
    const { state } = newGame(1);
    const ins0 = insulation(state);
    for (let m = 0; m < 60; m++) stepGarments(state, { ...dry, raining: true }, 1);
    const coat = state.player.clothing.find((g) => g.id === "woolCoat")!;
    const trousers = state.player.clothing.find((g) => g.id === "woolTrousers")!;
    expect(garmentWet(coat)).toBe(60);
    expect(garmentWet(trousers)).toBe(30);
    expect(wetFactor({ id: "woolCoat", durability: 100, wet: 100 })).toBeCloseTo(0.5, 6);
    expect(wetFactor({ id: "hideCoat", durability: 100, wet: 100 })).toBeCloseTo(0.33, 2);
    expect(insulation(state)).toBeLessThan(ins0);
  });

  it("dries fastest by the fire, slowly under a roof or in dry weather, not at all in rain in the open", () => {
    const { state } = newGame(1);
    for (const g of state.player.clothing) g.wet = 100;
    stepGarments(state, { ...dry, roof: true, fireAtCamp: true }, 60);
    expect(garmentWet(state.player.clothing[0])).toBeCloseTo(80, 6);
    for (const g of state.player.clothing) g.wet = 100;
    stepGarments(state, { ...dry, roof: true }, 60);
    expect(garmentWet(state.player.clothing[0])).toBeCloseTo(95, 6);
    for (const g of state.player.clothing) g.wet = 100;
    stepGarments(state, { ...dry, raining: true }, 60);
    expect(garmentWet(state.player.clothing[0])).toBe(100);
    // A fire, or even just a roof, wins over the rain: still net drying.
    for (const g of state.player.clothing) g.wet = 100;
    stepGarments(state, { ...dry, raining: true, fireAtCamp: true, roof: true }, 60);
    expect(garmentWet(state.player.clothing[0])).toBeCloseTo(80, 6);
    for (const g of state.player.clothing) g.wet = 100;
    stepGarments(state, { ...dry, raining: true, roof: true }, 60);
    expect(garmentWet(state.player.clothing[0])).toBeCloseTo(95, 6);
  });

  it("the skin stays dry under a dry coat, and wet gear wears half again as fast", () => {
    const { state, world } = newGame(1);
    expect(skinExposure(state)).toBe(0);
    state.weather.precip = "light";
    for (let m = 0; m < 30; m++) stepPlayer(state, world, 10, 1);
    expect(state.player.wetness).toBeLessThan(5);
    const d0 = state.player.clothing[0].durability;
    for (const g of state.player.clothing) g.wet = 100;
    state.weather.precip = "none";
    for (let m = 0; m < 60; m++) stepPlayer(state, world, 10, 1);
    const wetWear = d0 - state.player.clothing[0].durability;
    const { state: s2, world: w2 } = newGame(1);
    const e0 = s2.player.clothing[0].durability;
    for (let m = 0; m < 60; m++) stepPlayer(s2, w2, 10, 1);
    expect(wetWear).toBeCloseTo((e0 - s2.player.clothing[0].durability) * 1.5, 3);
  });
});
