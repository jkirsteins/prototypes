import { describe, expect, it } from "vitest";
import { Rng } from "../src/rng";
import { advance } from "../src/sim/advance";
import { calendar } from "../src/sim/calendar";
import { feedFire } from "../src/sim/camp";
import { burnPerHour, fireWarmth, lightingInRain, smoky } from "../src/sim/fire";
import { addItem, pile, qty } from "../src/sim/inventory";
import { newGame } from "../src/sim/newgame";
import { feltTemperature } from "../src/sim/player";
import { regionState } from "../src/sim/regionstate";
import { check, startTask, stepTask } from "../src/sim/tasks";

const cal = calendar(0);

describe("wet wood", () => {
  it("logs split in rain, or within six hours of it, give wet firewood, which dries by a fire and not in rain", () => {
    const { state, world } = newGame(3);
    const st = regionState(state, world, state.player.region);
    addItem(pile(state, st.campCell), "log", 2);
    state.weather.precip = "light";
    startTask(state, world, cal, "split");
    advance(state, world, 20);
    expect(qty(state.player.pack, "wetFirewood") + qty(pile(state, st.campCell), "wetFirewood")).toBe(20);
    state.weather.precip = "none";
    st.logsWet = 2 * 60;
    startTask(state, world, cal, "split");
    advance(state, world, 20);
    expect(qty(state.player.pack, "wetFirewood") + qty(pile(state, st.campCell), "wetFirewood")).toBe(40);
    // Dries at 2 kg an hour by a lit fire; not at all once it rains again.
    st.structures.firePit = true;
    st.fire.lit = true;
    st.fire.fuelKg = 30;
    const before = qty(state.player.pack, "wetFirewood") + qty(pile(state, st.campCell), "wetFirewood");
    advance(state, world, 60);
    const after = qty(state.player.pack, "wetFirewood") + qty(pile(state, st.campCell), "wetFirewood");
    expect(before - after).toBeCloseTo(2, 0);
    state.weather.precip = "heavy";
    advance(state, world, 60);
    expect(qty(state.player.pack, "wetFirewood") + qty(pile(state, st.campCell), "wetFirewood")).toBeCloseTo(after, 0);
  });

  it("wet wood on the fire halves its warmth and the fire is smoky", () => {
    const { state, world } = newGame(3);
    const st = regionState(state, world, state.player.region);
    st.structures.firePit = true;
    st.fire.lit = true;
    addItem(state.player.pack, "firewood", 5);
    addItem(state.player.pack, "wetFirewood", 20);
    feedFire(state, world, state.player.region, 30);
    expect(st.fire.fuelKg).toBe(5);
    expect(st.fire.wetKg).toBe(20);
    expect(smoky(st.fire)).toBe(true);
    expect(fireWarmth(st.fire, true)).toBe(7.5);
    const felt = feltTemperature(state, world, 0);
    st.fire.wetKg = 0;
    expect(feltTemperature(state, world, 0) - felt).toBeCloseTo(7.5, 6);
  });

  it("rain fights the fire: slower lighting that can fail, a faster burn, and heavy rain puts a low fire out", () => {
    const { state, world } = newGame(3);
    const w = state.weather;
    expect(burnPerHour(w, 5, false)).toBe(3);
    w.precip = "light";
    expect(burnPerHour(w, 5, false)).toBe(4.5);
    expect(lightingInRain(w, 5, false)).toEqual({ minutes: 20, failChance: 1 / 3, blocked: null });
    w.precip = "heavy";
    expect(burnPerHour(w, 5, false)).toBe(6);
    expect(lightingInRain(w, 5, false).blocked).toBe("too wet to light");
    expect(lightingInRain(w, 5, true).blocked).toBeNull();
    const st = regionState(state, world, state.player.region);
    st.structures.firePit = true;
    st.fire.lit = true;
    st.fire.fuelKg = 1.5;
    advance(state, world, 1);
    expect(st.fire.lit).toBe(false);
    // Lighting in light rain: a third of tries fail and cost the wood either way.
    w.precip = "light";
    state.player.tools.push({ id: "fireDrill", durability: 100 });
    let fails = 0;
    for (let seed = 1; seed <= 12; seed++) {
      st.fire.lit = false;
      addItem(state.player.pack, "firewood", 1);
      const o = check(state, world, cal, "light");
      expect(o.duration).toBe(20);
      startTask(state, world, cal, "light");
      const rng = new Rng(seed);
      for (let m = 0; m < 25 && state.task; m++) stepTask(state, world, cal, rng, 1);
      if (!st.fire.lit) fails++;
      st.fire.fuelKg = 0;
    }
    expect(fails).toBeGreaterThan(0);
    expect(fails).toBeLessThan(12);
    expect(qty(state.player.pack, "firewood")).toBe(0);
  });
});
