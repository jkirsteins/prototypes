import { describe, expect, it } from "vitest";
import { advance } from "../src/sim/advance";
import { addItem, pile } from "../src/sim/inventory";
import { newGame } from "../src/sim/newgame";
import { addOrder } from "../src/sim/orders";
import { cellOf, placeAt } from "../src/sim/position";
import { cellAt, neighbours } from "../src/world/gen";
import { passable } from "../src/world/route";
import { regionState, siteFor } from "../src/sim/regionstate";
import { siteCamp } from "./siting-helpers";
import { testAtmosphere, testRain } from "./weather-helpers";

describe("a storm with no roof", () => {
  it("sends the runner to camp to feed the fire and wait it out", () => {
    testAtmosphere();
    const g = newGame(39);
    const { state, world } = g;
    siteCamp(state, world);
    const camp = regionState(state, world, state.player.region).campCell as number;
    // Away from camp when the storm breaks, so the return home is part of the case.
    placeAt(state, world, neighbours(world, camp).find((c) => passable(cellAt(world, c).terrain))!);
    addItem(state.player.pack, "driedMeat", 2);
    addOrder(state, world, { task: "chop", until: { kind: "forever" }, deliver: "leave", where: "nearest" }, "grind");
    advance(state, world, 1);
    const st = regionState(state, world, state.player.region);
    siteFor(st, camp).structures.firePit = true;
    st.fire.lit = true;
    st.fire.fuelKg = 4;
    addItem(pile(state, camp), "firewood", 20);
    const until = (pred: () => boolean, max = 3000) => {
      for (let i = 0; i < max && !pred(); i++) advance(state, world, 1);
      return pred();
    };
    expect(until(() => state.task?.id === "chop")).toBe(true);
    expect(cellOf(state, world)).not.toBe(camp);
    const from = state.minute + 60;
    state.weather.storm = { id: state.weather.nextStormId++, source: "natural", kind: "rain", from, until: from + 600, warned: true };
    testRain(8, 5, 40);
    advance(state, world, 1);
    expect(state.player.bodyNeed).toBe("storm");
    expect(until(() => state.task?.id === "rest")).toBe(true);
    expect(cellOf(state, world)).toBe(camp);
    expect(st.fire.fuelKg).toBeGreaterThanOrEqual(11.9);
    expect(state.intent?.step).toBe("waiting out the storm");
  });
});
