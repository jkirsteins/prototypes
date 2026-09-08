import { describe, expect, it } from "vitest";
import { Rng } from "../src/rng";
import { autoEat, eat, edible } from "../src/sim/actions";
import { calendar, START_MINUTE_OF_DAY } from "../src/sim/calendar";
import { gutRefused } from "../src/sim/gut";
import { addItem, qty } from "../src/sim/inventory";
import { GUT, KCAL_FULL } from "../src/sim/items";
import { today } from "../src/sim/ledger";
import { newGame } from "../src/sim/newgame";
import { derived, fatLandmarks, MEDIAN_MASS_KG } from "../src/sim/person";
import { FAT_FULL, FAT_KCAL_PER_KG, stepPlayer, workSpeed } from "../src/sim/player";
import type { Person } from "../src/sim/types";
import { waterLossPerHour } from "../src/sim/water";

describe("the fat reserve", () => {
  it("costs fat and no health for an hour with kcal at zero and fat above zero", () => {
    const { state, world } = newGame(1);
    state.player.kcal = 0;
    const fat0 = state.player.fat;
    const health0 = state.player.health;
    for (let m = 0; m < 60; m++) stepPlayer(state, world, calendar(state.minute, state.startDoy), 15, 1);
    expect(fat0 - state.player.fat).toBeCloseTo(100, 0);
    expect(state.player.health).toBeCloseTo(health0, 1);
  });

  it("raises fat past a full stomach, capped at FAT_FULL", () => {
    const { state, world } = newGame(1);
    state.player.kcal = KCAL_FULL - 100;
    state.player.fat = 0;
    addItem(state.player.pack, "driedMeat", 1);
    // driedMeat: 3,300 kcal/kg (three kilos to one rack kilo), 0.15 kg portion = 495 kcal; 100 fills the stomach, 395 goes to fat.
    eat(state, world, "driedMeat", new Rng(1));
    expect(state.player.kcal).toBe(KCAL_FULL);
    expect(state.player.fat).toBeCloseTo(395, 5);

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
    for (let m = 0; m < 5; m++) stepPlayer(state, world, calendar(state.minute, state.startDoy), 15, 1);
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

  it("1.2 kilos in a day credit their full 540 kcal", () => {
    const { state, world } = berried(1.2);
    state.player.kcal = 1000;
    for (let i = 0; i < 6; i++) expect(eat(state, world, "berries", new Rng(1))).toBe(true);
    expect(state.player.kcal).toBeCloseTo(1540, 6);
    expect(today(state).eaten).toBeCloseTo(540, 6);
    // Berries' kilos live under the shared gut counter, keyed by food.
    expect(state.player.gut.day).toBe(1);
    expect(state.player.gut.kg.berries).toBeCloseTo(1.2, 6);
    expect(state.log.some((e) => e.text === "{Your} stomach is turning.")).toBe(false);
  });

  it("past 1.2 kilos the gut credits half, turns the stomach once, and costs water like a fever", () => {
    const { state, world } = berried(2);
    state.player.kcal = 1000;
    for (let i = 0; i < 6; i++) eat(state, world, "berries", new Rng(1));
    const plain = waterLossPerHour(state, 10);
    for (let i = 0; i < 2; i++) eat(state, world, "berries", new Rng(1));
    // 540 for the first 1.2 kilos, 90 for the next 0.4 at half credit.
    expect(state.player.kcal).toBeCloseTo(1630, 6);
    expect(state.log.filter((e) => e.text === "{Your} stomach is turning.").length).toBe(1);
    expect(waterLossPerHour(state, 10)).toBeCloseTo(plain * 1.2, 6);
    for (let i = 0; i < 2; i++) eat(state, world, "berries", new Rng(1));
    expect(state.player.kcal).toBeCloseTo(1720, 6);
    expect(state.log.filter((e) => e.text === "{Your} stomach is turning.").length).toBe(1);
  });

  it("at 2 kilos berries are refused, said once, and auto-eat passes over berries for the day", () => {
    const { state, world } = berried(2.5);
    state.player.kcal = 1000;
    for (let i = 0; i < 20; i++) eat(state, world, "berries", new Rng(1));
    expect(state.player.gut.kg.berries).toBeCloseTo(2, 6);
    expect(qty(state.player.pack, "berries")).toBeCloseTo(0.5, 6);
    expect(eat(state, world, "berries", new Rng(1))).toBe(false);
    expect(gutRefused(state.player, state.minute, "berries")).toBe(true);
    expect(edible(state, "berries")).toBe(false);
    expect(edible(state, "driedMeat")).toBe(true);
    expect(state.log.filter((e) => e.text === "{You} cannot face another berry.").length).toBe(1);
    state.player.kcal = 1000;
    addItem(state.player.pack, "driedMeat", 1);
    const k = state.player.kcal;
    autoEat(state, world, new Rng(1));
    expect(state.player.kcal).toBeGreaterThan(k);
    expect(qty(state.player.pack, "berries")).toBeCloseTo(0.5, 6);
  });

  it("the counter resets with the day", () => {
    const { state, world } = berried(2.5);
    state.player.kcal = 1000;
    for (let i = 0; i < 20; i++) eat(state, world, "berries", new Rng(1));
    state.minute = 24 * 60 - START_MINUTE_OF_DAY;
    expect(gutRefused(state.player, state.minute, "berries")).toBe(false);
    expect(eat(state, world, "berries", new Rng(1))).toBe(true);
    expect(state.player.gut.day).toBe(2);
    expect(state.player.gut.kg.berries).toBeCloseTo(0.2, 6);
    expect(calendar(state.minute).day).toBe(2);
  });

  // The Swedish handbook's not over two litres of berries a day, about 1.2 kg, past which the gut turns.
  it("the ceiling's numbers are the table's", () => {
    expect(GUT.berries).toEqual({ fullCreditKg: 1.2, refuseKg: 2 });
  });
});

describe("the fat landmarks", () => {
  it("are strictly ordered for every build and both sexes", () => {
    for (const sex of ["m", "f"] as const) {
      for (const build of [-2, -1, 0, 1, 2] as const) {
        const p: Person = { sex, axes: { strength: 0, build, hands: 0, eyes: 0 }, quirks: [], face: 0 };
        const l = fatLandmarks(p);
        expect(l.floor).toBeGreaterThan(0);
        expect(l.lower).toBeGreaterThan(l.floor);
        expect(l.typical).toBeGreaterThan(l.lower);
        expect(l.upper).toBeGreaterThan(l.typical);
      }
    }
  });

  it("puts a woman's floor at a larger share of her mass than a man's", () => {
    const share = (sex: "m" | "f") => {
      const p: Person = { sex, axes: { strength: 0, build: 0, hands: 0, eyes: 0 }, quirks: [], face: 0 };
      const l = fatLandmarks(p);
      const d = derived(p);
      const floorKg = l.floor / FAT_KCAL_PER_KG;
      return floorKg / (d.leanKg + floorKg);
    };
    expect(share("f")).toBeGreaterThan(share("m") * 2);
  });

  it("stands both sexes at the midpoint of their own settling zone", () => {
    // The zone is defined in body-fat share, so the invariant is exact there: FAT_SHARES
    // places typical at the midpoint between lower and upper for both sexes by construction.
    // Converting a share to kilocalories is nonlinear (fatAt's share/(1-share)), so the same
    // midpoint does not land at the same fraction of the zone measured in kcal - that curve
    // is real and is read back out here rather than tuned away.
    const shareOf = (kcal: number, leanKg: number) => {
      const fatKg = kcal / FAT_KCAL_PER_KG;
      return fatKg / (leanKg + fatKg);
    };
    for (const sex of ["m", "f"] as const) {
      const p: Person = { sex, axes: { strength: 0, build: 0, hands: 0, eyes: 0 }, quirks: [], face: 0 };
      const l = fatLandmarks(p);
      const lean = derived(p).leanKg;
      const lower = shareOf(l.lower, lean);
      const typical = shareOf(l.typical, lean);
      const upper = shareOf(l.upper, lean);
      expect((typical - lower) / (upper - lower)).toBeCloseTo(0.5, 6);
    }
  });

  it("weighs a median man at his typical reserve at the reference mass", () => {
    const p: Person = { sex: "m", axes: { strength: 0, build: 0, hands: 0, eyes: 0 }, quirks: [], face: 0 };
    const l = fatLandmarks(p);
    expect(derived(p).leanKg + l.typical / FAT_KCAL_PER_KG).toBeCloseTo(MEDIAN_MASS_KG, 1);
  });
});
