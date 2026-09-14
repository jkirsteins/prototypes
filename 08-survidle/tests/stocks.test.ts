import { describe, expect, it } from "vitest";
import { calendar } from "../src/sim/calendar";
import { addItem, pile } from "../src/sim/inventory";
import { ITEM_KG } from "../src/sim/items";
import { newGame } from "../src/sim/newgame";
import { regionState, siteFor } from "../src/sim/regionstate";
import type { ItemId } from "../src/sim/types";
import { startTask } from "../src/sim/tasks";
import { GROUPS, groupCap, groupHeld, stockPanelHtml, stocksHtml } from "../src/ui/stocks";
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

describe("the toolbar", () => {
  it("says each group's held figure, and its cap only where one is real", () => {
    const { state, world } = newGame(21);
    siteCamp(state, world);
    const st = regionState(state, world, state.player.region);
    addItem(pile(state, st.campCell!), "firewood", 12);
    siteFor(st, st.campCell!).woodsheds = 1;
    const html = stocksHtml(state, world, calendar(state.minute, state.startDoy), { rateDisplay: "game" });
    expect(html).toContain("Wood");
    expect(html).toContain("12");
    expect(html).toContain("1050");
    expect(html).toContain("Food");
  });

  it("writes no width into the markup, because bars.ts owns widths", () => {
    const { state, world } = newGame(21);
    siteCamp(state, world);
    const html = stocksHtml(state, world, calendar(state.minute, state.startDoy), { rateDisplay: "game" });
    expect(html).not.toContain("width:");
  });
});

describe("the expanded group", () => {
  it("lists the members, the causes, and what the stand has left", () => {
    const { state, world } = newGame(21);
    siteCamp(state, world);
    const st = regionState(state, world, state.player.region);
    addItem(pile(state, st.campCell!), "firewood", 12);
    addItem(pile(state, st.campCell!), "stick", 4);
    const html = stockPanelHtml(state, world, calendar(state.minute, state.startDoy), { rateDisplay: "game" }, "wood");
    expect(html).toContain("firewood");
    expect(html).toContain("sticks");
    expect(html).toContain("this patch");
  });

  it("says what the work in hand has not banked yet", () => {
    const { state, world } = newGame(3);
    siteCamp(state, world);
    const st = regionState(state, world, state.player.region);
    addItem(pile(state, st.campCell!), "log", 1);
    startTask(state, world, calendar(state.minute, state.startDoy), "split");
    const html = stockPanelHtml(state, world, calendar(state.minute, state.startDoy), { rateDisplay: "game" }, "wood");
    expect(html).toContain("coming");
  });
});
