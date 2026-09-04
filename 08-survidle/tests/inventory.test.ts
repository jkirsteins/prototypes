import { describe, expect, it } from "vitest";
import {
  addItem, ageStacks, canConsume, consume, emptyInventory, herePile, produce, qty, removeItem, weight,
} from "../src/sim/inventory";
import { newGame } from "../src/sim/newgame";

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
