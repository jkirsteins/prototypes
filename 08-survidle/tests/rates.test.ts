import { describe, expect, it } from "vitest";
import { advance } from "../src/sim/advance";
import { calendar } from "../src/sim/calendar";
import { addItem, pile } from "../src/sim/inventory";
import { ITEM_KG } from "../src/sim/items";
import { newGame } from "../src/sim/newgame";
import { stockCauses } from "../src/sim/rates";
import { regionState, siteFor } from "../src/sim/regionstate";
import { chopSticks } from "../src/sim/skills";
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

  it("splitting is a rise in the wood group, at the exact yield its own task declares over its own duration", () => {
    testAtmosphere();
    const { state, world } = newGame(3);
    siteCamp(state, world);
    const st = regionState(state, world, state.player.region);
    addItem(pile(state, st.campCell!), "log", 2);
    startTask(state, world, calendar(state.minute, state.startDoy), "split");
    const t = state.task!;
    expect(t.id).toBe("split");
    const causes = stockCauses(state, world, calendar(state.minute, state.startDoy)).wood;
    const splitting = causes.find((c) => c.label === "splitting");
    expect(splitting).toBeDefined();
    expect(splitting!.perHour).toBeCloseTo((ITEM_KG.log / t.duration) * 60);
  });

  it("felling's cause equals four logs plus its own sticks, over its own duration", () => {
    testAtmosphere();
    const { state, world } = newGame(3);
    siteCamp(state, world);
    // Set directly rather than through startTask: chop's own preconditions
    // (forest ground, an axe in reach) are not what this test is about, and
    // stockCauses reads state.task exactly as set, regardless of how it got there.
    state.task = { id: "chop", progress: 0, duration: 40, repeat: false };
    const causes = stockCauses(state, world, calendar(state.minute, state.startDoy)).wood;
    const felling = causes.find((c) => c.label === "felling");
    expect(felling).toBeDefined();
    const expectedKg = 4 * ITEM_KG.log + chopSticks(state, world) * ITEM_KG.stick;
    expect(felling!.perHour).toBeCloseTo((expectedKg / 40) * 60);
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
