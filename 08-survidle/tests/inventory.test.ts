import { describe, expect, it } from "vitest";
import {
  addItem, ageStacks, canConsume, consume, emptyInventory, herePile, produce, qty, removeItem, weight,
} from "../src/sim/inventory";
import {
  DECAYING, ITEM_KG, MEND, RECIPES, STRUCTURE_LIFE_DAYS, STRUCTURES, TRAP_HOLD_KG, WATER_STORE_L,
} from "../src/sim/items";
import { newGame } from "../src/sim/newgame";
import { masteryKey, RECOMMENDED, skillOf } from "../src/sim/skills";
import { fishSpecies, SPECIES_DEFS } from "../src/sim/species";

describe("inventory", () => {
  it("weighs counts and kilograms", () => {
    const inv = emptyInventory();
    addItem(inv, "log", 2);
    addItem(inv, "stick", 4);
    addItem(inv, "rawMeat", 3.5);
    expect(weight(inv)).toBeCloseTo(40 + 2 + 3.5);
    expect(qty(inv, "rawMeat")).toBeCloseTo(3.5);
  });

  it("removes perishables oldest first", () => {
    const inv = emptyInventory();
    addItem(inv, "rawMeat", 2);
    ageStacks(inv, 600, 10);
    addItem(inv, "rawMeat", 1);
    expect(inv.stacks.rawMeat!.length).toBe(2);
    expect(removeItem(inv, "rawMeat", 2.5)).toBeCloseTo(2.5);
    expect(inv.stacks.rawMeat!.length).toBe(1);
    expect(inv.stacks.rawMeat![0].age).toBe(0);
  });

  it("spoils warm meat after 36 hours but not frozen meat", () => {
    const warm = emptyInventory();
    addItem(warm, "rawMeat", 1);
    const lost = ageStacks(warm, 37 * 60, 5);
    expect(lost.rawMeat).toBeCloseTo(1);
    expect(qty(warm, "rawMeat")).toBe(0);
    const frozen = emptyInventory();
    addItem(frozen, "rawMeat", 1);
    ageStacks(frozen, 1000 * 60, -5);
    expect(qty(frozen, "rawMeat")).toBe(1);
  });

  it("berries keep three days in the warm and do not age in the cold", () => {
    const warm = emptyInventory();
    addItem(warm, "berries", 2);
    ageStacks(warm, 71 * 60, 10);
    expect(qty(warm, "berries")).toBeCloseTo(2, 6);
    const lost = ageStacks(warm, 2 * 60, 10);
    expect(lost.berries).toBeCloseTo(2, 6);
    expect(qty(warm, "berries")).toBe(0);
    const cold = emptyInventory();
    addItem(cold, "berries", 2);
    ageStacks(cold, 1000 * 60, -5);
    expect(qty(cold, "berries")).toBeCloseTo(2, 6);
  });

  it("routes produce to the pack until it is comfortable, and logs to the ground", () => {
    const { state, world } = newGame(1);
    expect(produce(state, world, "log", 1)).toBe("pile");
    expect(qty(herePile(state, world), "log")).toBe(1);
    expect(produce(state, world, "stick", 6)).toBe("pack");
    expect(produce(state, world, "rawMeat", 30)).toBe("pile");
    expect(qty(state.player.pack, "rawMeat")).toBe(0);
  });

  it("consumes from pack and pile together, with substitutes", () => {
    const { state, world } = newGame(1);
    addItem(state.player.pack, "stone", 1);
    addItem(herePile(state, world), "stone", 2);
    addItem(herePile(state, world), "cordage", 1);
    const needs = [{ item: "stone" as const, qty: 3 }, { item: "sinew" as const, qty: 1, alt: "cordage" as const }];
    const invs = [state.player.pack, herePile(state, world)];
    expect(canConsume(invs, needs)).toBe(true);
    consume(invs, needs);
    expect(qty(state.player.pack, "stone")).toBe(0);
    expect(qty(herePile(state, world), "stone")).toBe(0);
    expect(qty(herePile(state, world), "cordage")).toBe(0);
    expect(canConsume(invs, needs)).toBe(false);
  });
});

describe("the producers' rows", () => {
  it("has the basket trap, the turf hut and the water trough with their costs", () => {
    expect(ITEM_KG.basketTrap).toBe(2);
    expect(RECIPES.basketTrap.needs).toEqual([{ item: "stick", qty: 6 }, { item: "cordage", qty: 3 }]);
    expect(RECIPES.basketTrap.tool).toBe("knife");
    expect(STRUCTURES.turfHut.minutes).toBe(1200);
    expect(STRUCTURES.turfHut.needs).toEqual([{ item: "log", qty: 4 }, { item: "stick", qty: 20 }, { item: "bark", qty: 40 }, { item: "cordage", qty: 4 }]);
    expect(STRUCTURES.waterStore.needs).toEqual([{ item: "log", qty: 1 }, { item: "bark", qty: 8 }, { item: "cordage", qty: 2 }]);
    expect(STRUCTURE_LIFE_DAYS.turfHut).toBe(540);
    expect(MEND.turfHut).toEqual({ needs: [{ item: "bark", qty: 20 }], minutes: 120 });
    expect(DECAYING).toEqual(["leanTo", "dryingRack", "turfHut"]);
    expect(TRAP_HOLD_KG).toBe(5);
    expect(WATER_STORE_L).toBe(20);
    for (const s of fishSpecies()) expect(SPECIES_DEFS[s].lie).toBeTruthy();
    expect(RECOMMENDED.read).toEqual({ skill: "fishing", level: 3 });
    expect(RECOMMENDED["craft:basketTrap"]).toEqual({ skill: "fishing", level: 5 });
    expect(RECOMMENDED["build:turfHut"]).toEqual({ skill: "building", level: 5 });
    expect(RECOMMENDED["build:waterStore"]).toEqual({ skill: "building", level: 3 });
    expect(skillOf("read")).toBe("fishing");
    expect(masteryKey(newGame(8).state, newGame(8).world, "emptyTrap")).toBe("trap");
  });
});
