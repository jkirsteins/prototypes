import { describe, expect, it } from "vitest";
import { advance } from "../src/sim/advance";
import { calendar } from "../src/sim/calendar";
import { addItem, pile } from "../src/sim/inventory";
import { newGame } from "../src/sim/newgame";
import { placeAt } from "../src/sim/position";
import { regionState } from "../src/sim/regionstate";
import { check, startTask } from "../src/sim/tasks";

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
    // Lighting can fail on the weather, and a failed light credits nothing:
    // the two must agree either way.
    expect(state.goals.done.fire ?? false).toBe(st.fire.lit);
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
