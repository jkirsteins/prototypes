import { describe, expect, it } from "vitest";
import { advance } from "../src/sim/advance";
import { calendar } from "../src/sim/calendar";
import { addItem, pile } from "../src/sim/inventory";
import { newGame } from "../src/sim/newgame";
import { stockCauses } from "../src/sim/rates";
import { regionState, siteFor } from "../src/sim/regionstate";
import { startTask } from "../src/sim/tasks";
import { siteCamp } from "./siting-helpers";
import { testAtmosphere } from "./weather-helpers";

const sum = (causes: { perHour: number }[]) => causes.reduce((a, c) => a + c.perHour, 0);

describe("the causes behind a rate", () => {
  it("a lit fire is a fall in the wood group, at the rate it actually burns", () => {
    testAtmosphere();
    const { state, world } = newGame(3);
    siteCamp(state, world);
    const st = regionState(state, world, state.player.region);
    siteFor(st, st.campCell!).structures.firePit = true;
    st.fire.lit = true;
    st.fire.fuelKg = 20;
    const causes = stockCauses(state, world, calendar(state.minute, state.startDoy)).wood;
    const fire = causes.find((c) => c.label === "fire");
    expect(fire).toBeDefined();
    expect(fire!.perHour).toBeLessThan(0);
  });

  it("splitting is a rise in the wood group, at the yield its own task declares", () => {
    testAtmosphere();
    const { state, world } = newGame(3);
    siteCamp(state, world);
    const st = regionState(state, world, state.player.region);
    addItem(pile(state, st.campCell!), "log", 2);
    startTask(state, world, calendar(state.minute, state.startDoy), "split");
    const causes = stockCauses(state, world, calendar(state.minute, state.startDoy)).wood;
    expect(sum(causes)).toBeGreaterThan(0);
  });

  it("counts nothing for a task that declares no yield", () => {
    testAtmosphere();
    const { state, world } = newGame(3);
    siteCamp(state, world);
    startTask(state, world, calendar(state.minute, state.startDoy), "rest");
    expect(stockCauses(state, world, calendar(state.minute, state.startDoy)).wood).toEqual([]);
  });

  it("the body is a fall in food and in water, whatever else is happening", () => {
    testAtmosphere();
    const { state, world } = newGame(3);
    siteCamp(state, world);
    advance(state, world, 10);
    const causes = stockCauses(state, world, calendar(state.minute, state.startDoy));
    expect(sum(causes.food)).toBeLessThan(0);
    expect(sum(causes.water)).toBeLessThan(0);
  });
});
