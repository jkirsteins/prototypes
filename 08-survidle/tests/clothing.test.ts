import { describe, expect, it } from "vitest";
import { Rng } from "../src/rng";
import { calendar } from "../src/sim/calendar";
import { coldFeet, coldHands, garmentWet, skinExposure, stepGarments, wetFactor } from "../src/sim/clothing";
import { hourlyHazards } from "../src/sim/hazards";
import { CLOTHING } from "../src/sim/items";
import { newGame } from "../src/sim/newgame";
import { baseWalkSpeed, insulation, stepPlayer } from "../src/sim/player";
import { placeAtSpot } from "../src/sim/position";
import { regionState } from "../src/sim/regionstate";
import { craftSuccess, oddsFactor } from "../src/sim/skills";

const dry = { raining: false, heavy: false, snowing: false, roof: false, walled: false, fireAtCamp: false, bedded: false, storm: false };

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

  it("the fire dries fastest whatever the weather, a cabin dries slowly whatever the weather, a lean-to only when it is dry, and rain in the open dries nothing", () => {
    const { state } = newGame(1);
    for (const g of state.player.clothing) g.wet = 100;
    stepGarments(state, { ...dry, raining: true, fireAtCamp: true, roof: true }, 60);
    expect(garmentWet(state.player.clothing[0])).toBeCloseTo(80, 6);
    for (const g of state.player.clothing) g.wet = 100;
    stepGarments(state, { ...dry, raining: true, walled: true, roof: true }, 60);
    expect(garmentWet(state.player.clothing[0])).toBeCloseTo(95, 6);
    // A lean-to alone, in rain or snowfall, neither dries nor wets you further.
    for (const g of state.player.clothing) g.wet = 100;
    stepGarments(state, { ...dry, raining: true, roof: true }, 60);
    expect(garmentWet(state.player.clothing[0])).toBe(100);
    state.player.clothing[0].wet = 50;
    stepGarments(state, { ...dry, raining: true, roof: true }, 60);
    expect(garmentWet(state.player.clothing[0])).toBe(50);
    for (const g of state.player.clothing) g.wet = 100;
    stepGarments(state, { ...dry, roof: true }, 60);
    expect(garmentWet(state.player.clothing[0])).toBeCloseTo(95, 6);
    for (const g of state.player.clothing) g.wet = 100;
    stepGarments(state, { ...dry, raining: true }, 60);
    expect(garmentWet(state.player.clothing[0])).toBe(100);
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

describe("frostbite", () => {
  it("bare hands in deep cold freeze through the hourly roll, no mittens needed to test it", () => {
    const { state, world } = newGame(1);
    expect(coldHands(state, -20)).toBe(true);
    const rng = new Rng(5);
    let hours = 0;
    while (state.player.frostbite.hands === 0 && hours < 200) {
      hourlyHazards(state, world, -20, -20, rng);
      hours++;
    }
    expect(state.player.frostbite.hands).toBe(3 * 1440);
    expect(state.log.some((e) => e.text === "{You} cannot feel {your} fingers.")).toBe(true);
  });

  it("wet boots in frost freeze the feet within a night; a fire under a roof heals them; a second time costs toes", () => {
    const { state, world } = newGame(17);
    const boots = state.player.clothing.find((g) => CLOTHING[g.id].slot === "boots")!;
    boots.wet = 80;
    expect(coldFeet(state, -8)).toBe(true);
    boots.wet = 0;
    expect(coldFeet(state, -8)).toBe(false);
    boots.wet = 80;
    const rng = new Rng(2);
    let hours = 0;
    while (state.player.frostbite.feet === 0 && hours < 200) {
      hourlyHazards(state, world, -12, -12, rng);
      hours++;
    }
    expect(state.player.frostbite.feet).toBe(3 * 1440);
    expect(hours).toBeLessThan(120);
    expect(state.log.some((e) => e.text === "{Your} feet are numb.")).toBe(true);
    expect(baseWalkSpeed(state, calendar(0), state.weather)).toBeCloseTo(3 * 0.6, 6);
    // In the open nothing heals.
    for (let m = 0; m < 600; m++) stepPlayer(state, world, 5, 1);
    expect(state.player.frostbite.feet).toBe(3 * 1440);
    // Under a roof by a fire it counts down.
    const st = regionState(state, world, state.player.region);
    st.structures.leanTo = true;
    st.structures.firePit = true;
    st.fire.lit = true;
    st.fire.fuelKg = 30;
    placeAtSpot(state, world, state.player.region, "camp");
    state.task = { id: "rest", progress: 0, duration: 60, repeat: false };
    for (let m = 0; m < 600; m++) stepPlayer(state, world, 5, 1);
    expect(state.player.frostbite.feet).toBe(3 * 1440 - 600);
    // A second bite while the first holds is for good.
    state.player.frostbite.feet = 100;
    boots.wet = 80;
    placeAtSpot(state, world, state.player.region, "forest");
    state.task = null;
    for (let h = 0; h < 200 && !state.player.toes; h++) hourlyHazards(state, world, -20, -20, rng);
    expect(state.player.toes).toBe(true);
    state.player.frostbite.feet = 0;
    expect(baseWalkSpeed(state, calendar(0), state.weather)).toBeCloseTo(3 * 0.85, 6);
  });

  it("the numb warning fires once, on the fresh bite; a repeat strike while it holds costs the toes instead, logged once", () => {
    const { state, world } = newGame(17);
    const boots = state.player.clothing.find((g) => CLOTHING[g.id].slot === "boots")!;
    boots.wet = 80;
    const rng = new Rng(2);
    let hours = 0;
    while (!state.player.toes && hours < 100) {
      hourlyHazards(state, world, -12, -12, rng);
      hours++;
    }
    expect(state.player.toes).toBe(true);
    expect(state.log.filter((e) => e.text === "{Your} feet are numb.")).toHaveLength(1);
    expect(state.log.filter((e) => e.text === "{You} will not get those toes back.")).toHaveLength(1);
  });

  it("frostbitten hands halve the hunting odds and double the chance the craft spoils", () => {
    const { state } = newGame(1);
    const o0 = oddsFactor(state, "hare");
    const c0 = craftSuccess(state, "bow");
    expect(c0).toBeLessThan(1);
    state.player.frostbite.hands = 1000;
    expect(oddsFactor(state, "hare")).toBeCloseTo(o0 * 0.5, 6);
    expect(craftSuccess(state, "bow")).toBeCloseTo(1 - Math.min(1, 2 * (1 - c0)), 6);
  });
});
