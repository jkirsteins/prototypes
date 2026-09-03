import { describe, expect, it } from "vitest";
import { Rng } from "../src/rng";
import { autoEat, eat, loadRack } from "../src/sim/actions";
import { calendar } from "../src/sim/calendar";
import { dailyCamp, stepCamp } from "../src/sim/camp";
import { hourlyEvents } from "../src/sim/events";
import { addItem, pile, qty } from "../src/sim/inventory";
import { newGame } from "../src/sim/newgame";
import { regionState } from "../src/sim/regionstate";
import { regionAt } from "../src/world/gen";

describe("camp", () => {
  it("burns 3 kg of firewood an hour and feeds itself from camp while you are there", () => {
    const { state, world } = newGame(2);
    const st = regionState(state, world, state.player.region);
    st.structures.firePit = true;
    st.fire.lit = true;
    st.fire.fuelKg = 6;
    addItem(pile(state, st.campCell), "firewood", 10);
    for (let m = 0; m < 65; m++) stepCamp(state, world, 5, 1);
    expect(st.fire.lit).toBe(true);
    // 6 kg minus 3 kg burnt, then topped up from the pile when it dropped to 3 kg.
    expect(qty(pile(state, st.campCell), "firewood")).toBeLessThan(10);
    state.player.autoFeed = false;
    for (let m = 0; m < 60 * 13; m++) stepCamp(state, world, 5, 1);
    expect(st.fire.lit).toBe(false);
    expect(state.log.some((e) => e.text.includes("gone out"))).toBe(true);
  });

  it("dries 3 kg of raw meat into 1 kg over two dry days", () => {
    const { state, world } = newGame(2);
    const st = regionState(state, world, state.player.region);
    st.structures.dryingRack = true;
    addItem(state.player.pack, "rawMeat", 3);
    expect(loadRack(state, world)).toBeCloseTo(3);
    for (let m = 0; m < 48 * 60; m++) stepCamp(state, world, -5, 1);
    expect(st.rack.kg).toBe(0);
    expect(qty(pile(state, st.campCell), "driedMeat")).toBeCloseTo(1);
  });

  it("snares catch hares where hares are, and a fox takes old catches", () => {
    const { state, world } = newGame(2);
    const rng = new Rng(4);
    const r = regionAt(world, state.player.region).capacity.hare > 5 ? regionAt(world, state.player.region) : regionAt(world, regionAt(world, state.player.region).neighbours.find((nb) => regionAt(world, nb.id).capacity.hare > 5)!.id);
    const st = regionState(state, world, r.id);
    st.structures.snares = 5;
    st.pop.hare = r.capacity.hare;
    let caught = 0;
    for (let d = 0; d < 20; d++) {
      dailyCamp(state, world, calendar(1440 * d), rng);
      caught = Math.max(caught, st.snareCatch.count);
      st.snareCatch.count = 0;
    }
    expect(caught).toBeGreaterThan(0);
    st.snareCatch.count = 2;
    st.snareCatch.age = 0;
    st.structures.snares = 0;
    for (let d = 0; d < 3; d++) dailyCamp(state, world, calendar(1440 * d), rng);
    expect(st.snareCatch.count).toBe(0);
  });

  it("eats a portion and auto-eats when low, keeping raw meat off the menu", () => {
    const { state, world } = newGame(2);
    const rng = new Rng(1);
    state.player.kcal = 1000;
    state.player.pack = { items: {}, stacks: {} };
    addItem(state.player.pack, "rawMeat", 1);
    autoEat(state, world, rng);
    expect(state.player.kcal).toBe(1000);
    addItem(state.player.pack, "cookedMeat", 1);
    autoEat(state, world, rng);
    expect(state.player.kcal).toBeCloseTo(1450);
    expect(qty(state.player.pack, "cookedMeat")).toBeCloseTo(0.7);
    addItem(state.player.pack, "driedMeat", 1);
    expect(eat(state, world, "driedMeat", rng)).toBe(true);
    expect(state.player.kcal).toBeCloseTo(1450 + 0.15 * 3500);
  });

  it("wolves come only at night outside shelter", () => {
    const { state, world } = newGame(2);
    const rng = new Rng(11);
    let hits = 0;
    for (let i = 0; i < 2000; i++) {
      state.player.health = 100;
      hourlyEvents(state, world, calendar(16 * 60), 5, 5, rng);
      if (state.player.health < 100) hits++;
    }
    expect(hits).toBeGreaterThan(5);
    regionState(state, world, state.player.region).structures.leanTo = true;
    hits = 0;
    for (let i = 0; i < 2000; i++) {
      state.player.health = 100;
      hourlyEvents(state, world, calendar(16 * 60), 5, 5, rng);
      if (state.player.health < 100) hits++;
    }
    expect(hits).toBe(0);
  });
});
