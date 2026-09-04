import { describe, expect, it } from "vitest";
import { Rng } from "../src/rng";
import { eat } from "../src/sim/actions";
import { addItem } from "../src/sim/inventory";
import { KCAL_FULL } from "../src/sim/items";
import { newGame } from "../src/sim/newgame";
import { FAT_FULL, stepPlayer, workSpeed } from "../src/sim/player";

describe("the fat reserve", () => {
  it("costs fat and no health for an hour with kcal at zero and fat above zero", () => {
    const { state, world } = newGame(1);
    state.player.kcal = 0;
    const fat0 = state.player.fat;
    const health0 = state.player.health;
    for (let m = 0; m < 60; m++) stepPlayer(state, world, 15, 1);
    expect(fat0 - state.player.fat).toBeCloseTo(100, 0);
    expect(state.player.health).toBeCloseTo(health0, 1);
  });

  it("raises fat past a full stomach, capped at FAT_FULL", () => {
    const { state, world } = newGame(1);
    state.player.kcal = KCAL_FULL - 100;
    state.player.fat = 0;
    addItem(state.player.pack, "driedMeat", 1);
    // driedMeat: 3500 kcal/kg, 0.15 kg portion = 525 kcal; 100 fills the stomach, 425 goes to fat.
    eat(state, world, "driedMeat", new Rng(1));
    expect(state.player.kcal).toBe(KCAL_FULL);
    expect(state.player.fat).toBeCloseTo(425, 5);

    state.player.kcal = KCAL_FULL;
    state.player.fat = FAT_FULL - 10;
    addItem(state.player.pack, "driedMeat", 1);
    eat(state, world, "driedMeat", new Rng(1));
    expect(state.player.fat).toBe(FAT_FULL);
  });

  it("work speed at half fat is three quarters of the same body at full fat", () => {
    const { state, world } = newGame(1);
    const full = workSpeed(state, world);
    state.player.fat = FAT_FULL / 2;
    const half = workSpeed(state, world);
    expect(half).toBeCloseTo(full * 0.75, 5);
  });

  it("logs each fat warning once as the reserve crosses its threshold", () => {
    const { state, world } = newGame(1);
    state.player.fat = FAT_FULL * 0.25 - 1;
    for (let m = 0; m < 5; m++) stepPlayer(state, world, 15, 1);
    const texts = state.log.map((e) => e.text);
    for (const line of ["You are getting thin.", "Your ribs show.", "You are wasting away."]) {
      expect(texts.filter((t) => t === line).length).toBe(1);
    }
  });
});
