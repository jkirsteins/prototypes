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

  it("routes produce to the pack until it is comfortable, and logs to the ground", () => {
    const { state } = newGame(1);
    expect(produce(state, "log", 1)).toBe("pile");
    expect(qty(herePile(state), "log")).toBe(1);
    expect(produce(state, "stick", 6)).toBe("pack");
    expect(produce(state, "rawMeat", 30)).toBe("pile");
    expect(qty(state.player.pack, "rawMeat")).toBe(0);
  });

  it("consumes from pack and pile together, with substitutes", () => {
    const { state } = newGame(1);
    addItem(state.player.pack, "stone", 1);
    addItem(herePile(state), "stone", 2);
    addItem(herePile(state), "cordage", 1);
    const needs = [{ item: "stone" as const, qty: 3 }, { item: "sinew" as const, qty: 1, alt: "cordage" as const }];
    const invs = [state.player.pack, herePile(state)];
    expect(canConsume(invs, needs)).toBe(true);
    consume(invs, needs);
    expect(qty(state.player.pack, "stone")).toBe(0);
    expect(qty(herePile(state), "stone")).toBe(0);
    expect(qty(herePile(state), "cordage")).toBe(0);
    expect(canConsume(invs, needs)).toBe(false);
  });
});
