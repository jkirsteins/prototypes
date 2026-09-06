import { describe, expect, it } from "vitest";
import { Rng } from "../src/rng";
import { calendar } from "../src/sim/calendar";
import { addItem, qty } from "../src/sim/inventory";
import { MARROW_KG_PER_BONE, RECIPES, SPOIL_HOURS } from "../src/sim/items";
import { newGame } from "../src/sim/newgame";
import { regionState } from "../src/sim/regionstate";
import { huntExtras } from "../src/sim/skills";
import { fatSeason, marrowFactor, SPECIES_DEFS } from "../src/sim/species";
import { check, startTask, stepTask } from "../src/sim/tasks";

describe("the carcass", () => {
  it("fat peaks are the handbooks' animals and the season scales them", () => {
    expect(SPECIES_DEFS.deer.yields?.fatKg).toBe(2);
    expect(SPECIES_DEFS.reindeer.yields?.fatKg).toBe(6);
    expect(SPECIES_DEFS.elk.yields?.fatKg).toBe(15);
    expect(SPECIES_DEFS.bear.yields?.fatKg).toBe(25);
    expect(SPECIES_DEFS.beaver.yields?.fatKg).toBe(3);
    expect(fatSeason("elk", 9)).toBe(1);
    expect(fatSeason("elk", 0)).toBe(0.5);
    expect(fatSeason("elk", 3)).toBe(0.2);
    expect(fatSeason("elk", 6)).toBe(0.6);
    expect(fatSeason("bear", 9)).toBe(1);
    expect(fatSeason("bear", 3)).toBe(0.3);
    expect(fatSeason("beaver", 3)).toBe(0.8);
    expect(fatSeason("fox", 3)).toBe(0.5);
  });

  it("marrow follows the animal's condition at 1, 0.75 and 0.4", () => {
    expect(marrowFactor(1)).toBe(1);
    expect(marrowFactor(0.5)).toBe(0.75);
    expect(marrowFactor(0.2)).toBe(0.4);
    expect(marrowFactor(0.35)).toBeCloseTo(0.575, 6);
    expect(marrowFactor(0.1)).toBe(0.4);
  });

  it("a kill in April drops a fifth of the fat, raw, and it rots in three warm days unless rendered", () => {
    const { state } = newGame(17);
    const april = calendar(0);
    expect(april.month).toBe(3);
    const x = huntExtras(state, "elk", april.month);
    expect(x.fatKg).toBeCloseTo(3, 6);
    expect(SPOIL_HOURS.rawFat).toBe(72);
  });

  it("render fat is the cook task on raw fat, at a lit fire, ten minutes a kilo", () => {
    const { state, world } = newGame(17);
    const st = regionState(state, world, state.player.region);
    st.structures.firePit = true;
    st.fire.lit = true;
    st.fire.fuelKg = 10;
    addItem(state.player.pack, "rawFat", 2);
    const cal = calendar(0);
    const o = check(state, world, cal, "cook", "rawFat");
    expect(o.ok).toBe(true);
    expect(o.label).toBe("Render fat");
    expect(o.duration).toBe(10);
    startTask(state, world, cal, "cook", "rawFat");
    for (let m = 0; m < 10 && state.task; m++) stepTask(state, world, cal, new Rng(m), 1);
    expect(qty(state.player.pack, "rawFat")).toBeCloseTo(1, 6);
    expect(qty(state.player.pack, "fat")).toBeCloseTo(1, 6);
  });

  it("cracking a bone gives marrow as fat and a cracked bone that still makes a needle", () => {
    const { state, world } = newGame(17);
    addItem(state.player.pack, "bone", 2);
    addItem(state.player.pack, "stone", 1);
    const cal = calendar(0);
    state.stats.kills.elk = 1;
    const o = check(state, world, cal, "crack");
    expect(o.ok).toBe(true);
    expect(o.duration).toBe(20);
    startTask(state, world, cal, "crack");
    for (let m = 0; m < 20 && state.task; m++) stepTask(state, world, cal, new Rng(m), 1);
    expect(qty(state.player.pack, "bone")).toBe(1);
    expect(qty(state.player.pack, "crackedBone")).toBe(1);
    expect(qty(state.player.pack, "fat")).toBeCloseTo(MARROW_KG_PER_BONE * marrowFactor(fatSeason("elk", cal.month)), 6);
    expect(RECIPES.needle.needs[0]).toEqual({ item: "bone", qty: 1, alt: "crackedBone" });
  });
});
