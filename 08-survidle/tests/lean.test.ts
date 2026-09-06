import { describe, expect, it } from "vitest";
import { Rng } from "../src/rng";
import { autoEat, eat, edible } from "../src/sim/actions";
import { addItem } from "../src/sim/inventory";
import { FOODS, LEAN_KCAL_PER_DAY, LEAN_FOODS } from "../src/sim/items";
import { newGame } from "../src/sim/newgame";
import { leanEatenToday } from "../src/sim/lean";

describe("the lean ceiling", () => {
  it("meat and fish are lean, fat and berries are not, and the numbers are the handbooks'", () => {
    expect([...LEAN_FOODS].sort()).toEqual(["cookedFish", "cookedMeat", "driedMeat", "rawMeat"]);
    expect(LEAN_KCAL_PER_DAY).toBe(1600);
    expect(FOODS.rawMeat.kcalPerKg).toBe(1100);
    expect(FOODS.cookedMeat.kcalPerKg).toBe(1100);
    expect(FOODS.driedMeat.kcalPerKg).toBe(3300);
    expect(FOODS.berries.kcalPerKg).toBe(450);
  });

  it("past 1,600 kcal of lean food in a day, meat is refused, fat is still eaten, and the day roll clears it", () => {
    const { state, world } = newGame(17);
    const p = state.player;
    p.kcal = 100;
    addItem(p.pack, "cookedMeat", 5);
    addItem(p.pack, "fat", 1);
    const rng = new Rng(1);
    let ate = 0;
    while (edible(state, "cookedMeat") && ate < 40) {
      expect(eat(state, world, "cookedMeat", rng)).toBe(true);
      ate++;
    }
    expect(leanEatenToday(p, state.minute)).toBeCloseTo(LEAN_KCAL_PER_DAY, 0);
    expect(edible(state, "cookedMeat")).toBe(false);
    expect(eat(state, world, "cookedMeat", rng)).toBe(false);
    expect(state.log.some((l) => l.text.includes("Lean meat is not filling"))).toBe(true);
    expect(edible(state, "fat")).toBe(true);
    expect(eat(state, world, "fat", rng)).toBe(true);
    p.kcal = 100;
    autoEat(state, world, rng);
    expect(p.kcal).toBeGreaterThan(100);
    state.minute += 1440;
    expect(leanEatenToday(p, state.minute)).toBe(0);
    expect(edible(state, "cookedMeat")).toBe(true);
  });

  it("the last portion over the line credits only the room left", () => {
    const { state, world } = newGame(17);
    const p = state.player;
    p.kcal = 100;
    p.leanToday = { day: 1, kcal: LEAN_KCAL_PER_DAY - 100 };
    addItem(p.pack, "cookedMeat", 1);
    const before = p.kcal;
    eat(state, world, "cookedMeat", new Rng(1));
    expect(p.kcal - before).toBeCloseTo(100, 6);
  });
});
