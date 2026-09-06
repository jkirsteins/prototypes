import { describe, expect, it } from "vitest";
import { Rng } from "../src/rng";
import { autoEat, eat, edible } from "../src/sim/actions";
import { berriesRefused } from "../src/sim/berries";
import { calendar, START_MINUTE_OF_DAY } from "../src/sim/calendar";
import { addItem, qty } from "../src/sim/inventory";
import { KCAL_FULL } from "../src/sim/items";
import { today } from "../src/sim/ledger";
import { newGame } from "../src/sim/newgame";
import { FAT_FULL, stepPlayer, workSpeed } from "../src/sim/player";
import { BERRY } from "../src/sim/tables";
import { waterLossPerHour } from "../src/sim/water";

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
    for (const line of ["{You} {are} getting thin.", "{Your} ribs show.", "{You} {are} wasting away."]) {
      expect(texts.filter((t) => t === line).length).toBe(1);
    }
  });
});

describe("the berry ceiling", () => {
  function berried(kg: number) {
    const g = newGame(1);
    addItem(g.state.player.pack, "berries", kg);
    return g;
  }

  it("two kilos in a day credit their full 1,000 kcal", () => {
    const { state, world } = berried(2);
    state.player.kcal = 1000;
    for (let i = 0; i < 10; i++) expect(eat(state, world, "berries", new Rng(1))).toBe(true);
    expect(state.player.kcal).toBeCloseTo(2000, 6);
    expect(today(state).eaten).toBeCloseTo(1000, 6);
    expect(state.player.berriesToday.day).toBe(1);
    expect(state.player.berriesToday.kg).toBeCloseTo(2, 6);
    expect(state.log.some((e) => e.text === "{Your} stomach is turning.")).toBe(false);
  });

  it("the third and fourth kilos credit half, turn the stomach once, and cost water like a fever", () => {
    const { state, world } = berried(4);
    state.player.kcal = 1000;
    for (let i = 0; i < 10; i++) eat(state, world, "berries", new Rng(1));
    const plain = waterLossPerHour(state, 10);
    for (let i = 0; i < 5; i++) eat(state, world, "berries", new Rng(1));
    // 1,000 for the first two kilos, 250 for the third.
    expect(state.player.kcal).toBeCloseTo(2250, 6);
    expect(state.log.filter((e) => e.text === "{Your} stomach is turning.").length).toBe(1);
    expect(waterLossPerHour(state, 10)).toBeCloseTo(plain * 1.2, 6);
    for (let i = 0; i < 5; i++) eat(state, world, "berries", new Rng(1));
    expect(state.player.kcal).toBeCloseTo(2500, 6);
    expect(state.log.filter((e) => e.text === "{Your} stomach is turning.").length).toBe(1);
  });

  it("the fifth kilo is refused, said once, and auto-eat passes over berries for the day", () => {
    const { state, world } = berried(5);
    state.player.kcal = 1000;
    for (let i = 0; i < 20; i++) eat(state, world, "berries", new Rng(1));
    expect(state.player.berriesToday.kg).toBeCloseTo(4, 6);
    expect(qty(state.player.pack, "berries")).toBeCloseTo(1, 6);
    expect(eat(state, world, "berries", new Rng(1))).toBe(false);
    expect(berriesRefused(state.player, state.minute)).toBe(true);
    expect(edible(state, "berries")).toBe(false);
    expect(edible(state, "driedMeat")).toBe(true);
    expect(state.log.filter((e) => e.text === "{You} cannot face another berry.").length).toBe(1);
    state.player.kcal = 1000;
    addItem(state.player.pack, "driedMeat", 1);
    const k = state.player.kcal;
    autoEat(state, world, new Rng(1));
    expect(state.player.kcal).toBeGreaterThan(k);
    expect(qty(state.player.pack, "berries")).toBeCloseTo(1, 6);
  });

  it("the counter resets with the day", () => {
    const { state, world } = berried(5);
    state.player.kcal = 1000;
    for (let i = 0; i < 20; i++) eat(state, world, "berries", new Rng(1));
    state.minute = 24 * 60 - START_MINUTE_OF_DAY;
    expect(berriesRefused(state.player, state.minute)).toBe(false);
    expect(eat(state, world, "berries", new Rng(1))).toBe(true);
    expect(state.player.berriesToday.day).toBe(2);
    expect(state.player.berriesToday.kg).toBeCloseTo(0.2, 6);
    expect(calendar(state.minute).day).toBe(2);
  });

  it("the ceiling's numbers are the table's", () => {
    expect(BERRY.fullCreditKg).toBe(2);
    expect(BERRY.refuseKg).toBe(4);
  });
});
