import { describe, expect, it } from "vitest";
import { Rng } from "../src/rng";
import { autoEat, eat, edible } from "../src/sim/actions";
import { creditGut, creditLean, gutEatenToday, gutRefused, leanEatenToday, leanRefused } from "../src/sim/gut";
import { addItem, qty } from "../src/sim/inventory";
import { FOODS, GUT, LEAN_KCAL_PER_DAY } from "../src/sim/items";
import { newGame } from "../src/sim/newgame";

describe("the gut table and the lean share", () => {
  it("every food carries a lean share from the spec's table and berries keep their ceiling", () => {
    expect(FOODS.rawMeat.leanShare).toBe(1);
    expect(FOODS.driedMeat.leanShare).toBe(1);
    expect(FOODS.cookedFish.leanShare).toBe(1);
    expect(FOODS.fat.leanShare).toBe(0);
    expect(FOODS.berries.leanShare).toBe(0);
    expect(GUT.berries).toEqual({ fullCreditKg: 1.2, refuseKg: 2 });
    expect(LEAN_KCAL_PER_DAY).toBe(1600);
  });

  it("a capped food credits in full to its line, half to its refusal, and nothing past it; the day roll clears it", () => {
    const { state } = newGame(17);
    const p = state.player;
    const a = creditGut(p, state.minute, "berries", 1.0);
    expect(a).toEqual({ kg: 1.0, credit: 1 });
    const b = creditGut(p, state.minute, "berries", 0.4);
    expect(b.kg).toBeCloseTo(0.4, 6);
    expect(b.credit).toBeCloseTo((0.2 * 1 + 0.2 * 0.5) / 0.4, 6);
    expect(gutEatenToday(p, state.minute, "berries")).toBeCloseTo(1.4, 6);
    creditGut(p, state.minute, "berries", 1.0);
    expect(gutRefused(p, state.minute, "berries")).toBe(true);
    expect(gutEatenToday(p, state.minute, "berries")).toBeCloseTo(2.0, 6);
    expect(gutEatenToday(p, state.minute + 1440, "berries")).toBe(0);
  });

  it("the lean ceiling books a food's share: a 1,000 kcal portion at share 0.6 costs 600 of the day's 1,600", () => {
    const { state } = newGame(17);
    const p = state.player;
    expect(creditLean(p, state.minute, 1000, 0.6)).toBe(1000);
    expect(leanEatenToday(p, state.minute)).toBe(600);
    expect(creditLean(p, state.minute, 2000, 1)).toBe(1000);
    expect(leanRefused(p, state.minute)).toBe(true);
    expect(creditLean(p, state.minute, 500, 0)).toBe(500);
  });

  it("eating keeps its shape: berries past two kilos are refused, lean meat past the ceiling is refused, fat never is", () => {
    const { state, world } = newGame(17);
    const p = state.player;
    p.kcal = 100;
    addItem(p.pack, "berries", 3);
    addItem(p.pack, "cookedMeat", 5);
    addItem(p.pack, "fat", 1);
    const rng = new Rng(1);
    let n = 0;
    while (edible(state, "berries") && n < 20 && eat(state, world, "berries", rng)) n++;
    expect(gutEatenToday(p, state.minute, "berries")).toBeCloseTo(2, 6);
    expect(edible(state, "berries")).toBe(false);
    n = 0;
    while (edible(state, "cookedMeat") && n < 40 && eat(state, world, "cookedMeat", rng)) n++;
    expect(leanEatenToday(p, state.minute)).toBeCloseTo(LEAN_KCAL_PER_DAY, 0);
    expect(edible(state, "cookedMeat")).toBe(false);
    expect(edible(state, "fat")).toBe(true);
  });
});

describe("auto-eat closes the day with fat", () => {
  it("a body at the lean wall with fat at hand eats the fat, and stops once the hungry line is passed", () => {
    const { state, world } = newGame(17);
    const p = state.player;
    p.kcal = 100;
    p.gut = { day: 1, kg: {}, leanKcal: LEAN_KCAL_PER_DAY };
    addItem(p.pack, "cookedMeat", 5);
    addItem(p.pack, "fat", 1);
    autoEat(state, world, new Rng(1));
    expect(p.kcal).toBeGreaterThanOrEqual(1800);
    expect(qty(p.pack, "cookedMeat")).toBe(5);
    expect(qty(p.pack, "fat")).toBeLessThan(1);
    expect(qty(p.pack, "fat")).toBeGreaterThan(0.5);
  });

  it("lean food is eaten first while the ceiling has room, so the fat is kept", () => {
    const { state, world } = newGame(17);
    const p = state.player;
    p.kcal = 1500;
    addItem(p.pack, "cookedMeat", 5);
    addItem(p.pack, "fat", 1);
    autoEat(state, world, new Rng(1));
    expect(p.kcal).toBeGreaterThanOrEqual(1800);
    expect(qty(p.pack, "fat")).toBe(1);
    expect(qty(p.pack, "cookedMeat")).toBeLessThan(5);
  });
});
