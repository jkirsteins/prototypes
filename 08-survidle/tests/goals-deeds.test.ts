import { describe, expect, it } from "vitest";
import { Rng } from "../src/rng";
import { advance } from "../src/sim/advance";
import { calendar } from "../src/sim/calendar";
import { addItem, pile } from "../src/sim/inventory";
import { newGame } from "../src/sim/newgame";
import { placeAt } from "../src/sim/position";
import { regionState } from "../src/sim/regionstate";
import { check, startTask, stepTask } from "../src/sim/tasks";

const cal = calendar(0);

describe("deeds reach the ladder", () => {
  it("credits the fire when this survivor lights one", () => {
    const { state, world } = newGame(3);
    const st = regionState(state, world, state.player.region);
    state.goals.done.firewood = true;
    placeAt(state, world, st.campCell);
    // Everything a light needs, so the deed is the only thing under test.
    st.structures.firePit = true;
    addItem(state.player.pack, "firewood", 5);
    state.player.tools.push({ id: "fireDrill", durability: 100 });
    const o = check(state, world, cal, "light");
    expect(o.ok, o.why).toBe(true);
    expect(startTask(state, world, cal, "light")).toBe(true);
    advance(state, world, o.duration + 1);
    // No rain at landing means lightingInRain's failChance is 0: this light
    // cannot fail, so the fire goal must be credited outright.
    expect(st.fire.lit).toBe(true);
    expect(state.goals.done.fire).toBe(true);
  });

  it("credits nothing when the tinder does not catch", () => {
    const { state, world } = newGame(3);
    const st = regionState(state, world, state.player.region);
    placeAt(state, world, st.campCell);
    st.structures.firePit = true;
    // Rain with no roof gives a one-in-three fail chance; seed 7 rolls it.
    state.weather.precip = "light";
    addItem(state.player.pack, "firewood", 5);
    state.player.tools.push({ id: "fireDrill", durability: 100 });
    const o = check(state, world, cal, "light");
    expect(o.ok, o.why).toBe(true);
    expect(startTask(state, world, cal, "light")).toBe(true);
    const rng = new Rng(7);
    for (let m = 0; m < o.duration + 1 && state.task; m++) stepTask(state, world, cal, rng, 1);
    expect(st.fire.lit).toBe(false);
    expect(state.goals.done.fire).toBeUndefined();
  });

  it("does not credit the fire to a survivor who only found one burning", () => {
    const { state, world } = newGame(3);
    const st = regionState(state, world, state.player.region);
    st.fire.lit = true;
    st.fire.fuelKg = 20;
    advance(state, world, 60);
    expect(state.goals.done.fire).toBeUndefined();
  });

  it("credits the firewood a survivor unloads at camp, and not the pile already there", () => {
    const { state, world } = newGame(3);
    const st = regionState(state, world, state.player.region);
    addItem(pile(state, st.campCell), "firewood", 40);
    advance(state, world, 120);
    expect(state.goals.progress.firewood ?? 0).toBe(0);
  });

  it("credits a season only when the calendar turns over into it", () => {
    const { state, world } = newGame(3);
    for (const id of ["firewood", "fire", "cook", "bed", "roof", "water", "snare", "store"] as const) {
      state.goals.done[id] = true;
    }
    const before = state.goals.lastSeason;
    // A landing does not credit the season it lands in.
    advance(state, world, 60);
    expect(state.goals.done[before as "winter"]).toBeUndefined();
  });
});
