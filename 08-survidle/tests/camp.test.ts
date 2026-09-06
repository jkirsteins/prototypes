import { describe, expect, it } from "vitest";
import { Rng } from "../src/rng";
import { autoEat, eat, loadRack } from "../src/sim/actions";
import { calendar } from "../src/sim/calendar";
import { dailyCamp, stepCamp } from "../src/sim/camp";
import { hourlyEvents } from "../src/sim/events";
import { addItem, pile, qty } from "../src/sim/inventory";
import { MAX_SNARES, SNARE_ODDS_PER_NIGHT } from "../src/sim/items";
import { newGame } from "../src/sim/newgame";
import { placeAtSpot } from "../src/sim/position";
import { regionState } from "../src/sim/regionstate";
import { check } from "../src/sim/tasks";
import { regionAt } from "../src/world/gen";

describe("camp", () => {
  it("burns 3 kg of firewood an hour and feeds itself from camp while you are there", () => {
    const { state, world } = newGame(2);
    const st = regionState(state, world, state.player.region);
    st.structures.firePit = true;
    st.fire.lit = true;
    st.fire.fuelKg = 6;
    addItem(pile(state, st.campCell), "firewood", 10);
    for (let m = 0; m < 65; m++) stepCamp(state, world, 5, 1, { region: state.player.region, atCamp: true });
    expect(st.fire.lit).toBe(true);
    // 6 kg minus 3 kg burnt, then topped up from the pile when it dropped to 3 kg.
    expect(qty(pile(state, st.campCell), "firewood")).toBeLessThan(10);
    state.player.autoFeed = false;
    for (let m = 0; m < 60 * 13; m++) stepCamp(state, world, 5, 1, { region: state.player.region, atCamp: true });
    expect(st.fire.lit).toBe(false);
    expect(state.log.some((e) => e.text.includes("gone out"))).toBe(true);
  });

  it("dries 3 kg of raw meat into 1 kg over two dry days", () => {
    const { state, world } = newGame(2);
    const st = regionState(state, world, state.player.region);
    st.structures.dryingRack = true;
    addItem(state.player.pack, "rawMeat", 3);
    expect(loadRack(state, world)).toBeCloseTo(3);
    for (let m = 0; m < 48 * 60; m++) stepCamp(state, world, -5, 1, { region: state.player.region, atCamp: true });
    expect(st.rack.kg).toBe(0);
    expect(qty(pile(state, st.campCell), "driedMeat")).toBeCloseTo(1);
  });

  it("snares catch hares where hares are, and a fox takes old catches", () => {
    const { state, world } = newGame(2);
    const rng = new Rng(4);
    const hares = (id: number) => regionAt(world, id).capacity.hare ?? 0;
    const home = state.player.region;
    const r = regionAt(world, hares(home) > 5 ? home : regionAt(world, home).neighbours.find((nb) => hares(nb.id) > 5)!.id);
    const st = regionState(state, world, r.id);
    st.structures.snares = 5;
    st.pop.hare = r.capacity.hare;
    let caught = 0;
    for (let d = 0; d < 20; d++) {
      dailyCamp(state, world, calendar(1440 * d), rng, { region: state.player.region, atCamp: true });
      caught = Math.max(caught, st.snareCatch.count);
      st.snareCatch.count = 0;
    }
    expect(caught).toBeGreaterThan(0);
    st.snareCatch.count = 2;
    st.snareCatch.age = 0;
    st.structures.snares = 0;
    for (let d = 0; d < 3; d++) dailyCamp(state, world, calendar(1440 * d), rng, { region: state.player.region, atCamp: true });
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
    // cookedMeat: 1,100 kcal/kg (Kochanski's venison), 0.3 kg portion.
    expect(state.player.kcal).toBeCloseTo(1330);
    expect(qty(state.player.pack, "cookedMeat")).toBeCloseTo(0.7);
    addItem(state.player.pack, "driedMeat", 1);
    expect(eat(state, world, "driedMeat", rng)).toBe(true);
    // driedMeat: 3,300 kcal/kg, three kilos to one rack kilo.
    expect(state.player.kcal).toBeCloseTo(1330 + 0.15 * 3300);
  });

  it("wolves come only at night outside shelter", () => {
    // Seed 1's start has wolves (seed 2's has none, capacity 0).
    const { state, world } = newGame(1);
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

describe("the trap line", () => {
  it("forty snares stand per region at 0.04 a night each, and the forty-first is refused", () => {
    expect(MAX_SNARES).toBe(40);
    expect(SNARE_ODDS_PER_NIGHT).toBe(0.04);
    const { state, world } = newGame(17);
    const st = regionState(state, world, state.player.region);
    st.structures.snares = 40;
    addItem(state.player.pack, "snare", 1);
    // The build/snare check grounds on heath before the count; stand there so the count is what refuses it.
    placeAtSpot(state, world, state.player.region, "heath");
    const o = check(state, world, calendar(0), "build", "snare");
    expect(o.ok).toBe(false);
    expect(o.why).toBe("40 snares is enough here");
  });

  it("forty snares at full hare density catch about a hare and a half a night", () => {
    const { state, world } = newGame(17);
    const st = regionState(state, world, state.player.region);
    st.structures.snares = 40;
    st.pop.hare = 100000;
    const r = regionAt(world, state.player.region);
    r.capacity.hare = 100000;
    let caught = 0;
    for (let d = 0; d < 200; d++) {
      st.snareCatch = { count: 0, age: 0 };
      dailyCamp(state, world, calendar(d * 1440), new Rng(d), null);
      caught += st.snareCatch.count;
    }
    expect(caught / 200).toBeGreaterThan(1.2);
    expect(caught / 200).toBeLessThan(2.0);
  });
});
