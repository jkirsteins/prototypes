import { describe, expect, it } from "vitest";
import { addItem, pile } from "../src/sim/inventory";
import { ITEM_KG } from "../src/sim/items";
import { newGame } from "../src/sim/newgame";
import { regionState, siteFor } from "../src/sim/regionstate";
import type { ItemId } from "../src/sim/types";
import { GROUPS, groupCap, groupHeld } from "../src/ui/stocks";
import { siteCamp } from "./siting-helpers";

describe("the group table", () => {
  it("names only what it surfaces, so a new item changes nothing", () => {
    const named = new Set(GROUPS.flatMap((g) => g.members));
    expect(named.has("firewood")).toBe(true);
    // Most of the item list is deliberately not on the toolbar.
    expect((Object.keys(ITEM_KG) as ItemId[]).some((id) => !named.has(id))).toBe(true);
  });

  it("adds a group's members up in the camp's own pile", () => {
    const { state, world } = newGame(21);
    siteCamp(state, world);
    const st = regionState(state, world, state.player.region);
    addItem(pile(state, st.campCell!), "firewood", 12);
    addItem(pile(state, st.campCell!), "stick", 4);
    const wood = GROUPS.find((g) => g.id === "wood")!;
    expect(groupHeld(state, world, wood)).toBe(14);
  });

  it("reads the wood cap off what stands, and gives the food group no cap", () => {
    const { state, world } = newGame(21);
    siteCamp(state, world);
    const st = regionState(state, world, state.player.region);
    siteFor(st, st.campCell!).woodsheds = 1;
    expect(groupCap(state, world, GROUPS.find((g) => g.id === "wood")!)).toBe(1050);
    expect(groupCap(state, world, GROUPS.find((g) => g.id === "food")!)).toBeNull();
  });
});
