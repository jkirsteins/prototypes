import { describe, expect, it } from "vitest";
import { coveredWoodKg, woodOnHandKg } from "../src/sim/camp";
import { addItem, emptyInventory } from "../src/sim/inventory";
import { newGame } from "../src/sim/newgame";
import { regionState, siteFor } from "../src/sim/regionstate";
import { siteCamp } from "./siting-helpers";

describe("covered wood", () => {
  it("an open camp covers nothing, and a roof covers what its dry space holds", () => {
    const { state, world } = newGame(21);
    siteCamp(state, world);
    const st = regionState(state, world, state.player.region);
    const site = siteFor(st, st.campCell!);
    expect(coveredWoodKg(site)).toBe(0);
    site.structures.leanTo = true;
    expect(coveredWoodKg(site)).toBe(175);
    site.structures.cabin = true;
    expect(coveredWoodKg(site)).toBe(875);
  });

  it("each vedbod adds its own stack, so cover is what stands added up", () => {
    const { state, world } = newGame(21);
    siteCamp(state, world);
    const site = siteFor(regionState(state, world, state.player.region), regionState(state, world, state.player.region).campCell!);
    site.woodsheds = 2;
    expect(coveredWoodKg(site)).toBe(2100);
  });

  it("wood on hand counts the wet with the dry and the sticks at their weight, and leaves logs in the yard", () => {
    const inv = emptyInventory();
    addItem(inv, "firewood", 10);
    addItem(inv, "wetFirewood", 4);
    addItem(inv, "stick", 8);
    addItem(inv, "log", 3);
    expect(woodOnHandKg(inv)).toBe(18);
  });
});

import { addItem as add, pile, qty } from "../src/sim/inventory";
import { advance } from "../src/sim/advance";
import { testAtmosphere, testRain } from "./weather-helpers";

describe("the vedbod as a roof", () => {
  it("dries wet firewood at the sheltered rate while it rains", () => {
    testAtmosphere();
    const { state, world } = newGame(3);
    siteCamp(state, world);
    const st = regionState(state, world, state.player.region);
    siteFor(st, st.campCell!).woodsheds = 1;
    add(pile(state, st.campCell!), "wetFirewood", 10);
    testRain(1);
    advance(state, world, 60);
    // Two kilos an hour, the rate a cabin or a lit fire gives, in the rain.
    expect(qty(pile(state, st.campCell!), "firewood")).toBeCloseTo(2, 4);
  });
});

describe("rain on the stack", () => {
  it("wets only the share over cover, at the outer layer's rate", () => {
    testAtmosphere();
    const { state, world } = newGame(3);
    siteCamp(state, world);
    const st = regionState(state, world, state.player.region);
    siteFor(st, st.campCell!).structures.leanTo = true;   // covers 175 kg
    add(pile(state, st.campCell!), "firewood", 178);
    testRain(1);
    advance(state, world, 60);
    // Three kilos stood out in the rain; one hour takes one kilo of it.
    expect(qty(pile(state, st.campCell!), "wetFirewood")).toBeCloseTo(1, 4);
  });

  it("leaves a covered stack alone, and leaves sticks alone", () => {
    testAtmosphere();
    const { state, world } = newGame(3);
    siteCamp(state, world);
    const st = regionState(state, world, state.player.region);
    siteFor(st, st.campCell!).woodsheds = 1;
    add(pile(state, st.campCell!), "firewood", 40);
    add(pile(state, st.campCell!), "stick", 20);
    testRain(1);
    advance(state, world, 120);
    expect(qty(pile(state, st.campCell!), "wetFirewood")).toBe(0);
    expect(qty(pile(state, st.campCell!), "stick")).toBe(20);
  });

  it("wets a field pile, which can have no cover at all", () => {
    testAtmosphere();
    const { state, world } = newGame(3);
    siteCamp(state, world);
    const away = regionState(state, world, state.player.region).campCell! + 1;
    add(pile(state, away), "firewood", 30);
    testRain(1);
    advance(state, world, 60);
    expect(qty(pile(state, away), "wetFirewood")).toBeCloseTo(1, 4);
  });
});
