import { describe, expect, it } from "vitest";
import { advance } from "../src/sim/advance";
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

  // Food is the one group where g.unit and g.rateUnit diverge: the larder
  // is held in person-days but its rate stays kcal/hour. Every other group
  // reads the same either way, so only this one can catch a regression back
  // to g.unit for the rate.
  it("holds the larder in days but rates it in kcal, since food is the one group where the two units differ", () => {
    const { state, world } = newGame(21);
    siteCamp(state, world);
    const st = regionState(state, world, state.player.region);
    addItem(pile(state, st.campCell!), "berries", 5);
    // The body's burn-today rate reads zero in the instant newGame lands
    // (nothing has been burned yet today), which would format as "steady"
    // regardless of unit and defeat this test's own point.
    advance(state, world, 30);
    const html = stocksHtml(state, world, calendar(state.minute, state.startDoy), { rateDisplay: "game" });
    const food = html.slice(html.indexOf('data-stock="food"'));
    expect(food).toMatch(/[\d.]+ days/);
    expect(food).toContain("kcal/h");
    expect(food).not.toContain("days/h");
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

describe("the strip before there is a camp", () => {
  /**
   * Every group but the pack reads the pile at camp. Before there is a camp
   * they read zero, which on a landing is a lie: the survivor is carrying a
   * kilo of dried meat and two litres of water, and "Food 0.0 days" is the
   * wrong thing to tell them about the thing that kills them second fastest.
   */
  it("says so rather than reporting a store of nothing", () => {
    const { state, world } = newGame(17);
    const cal = calendar(state.minute, state.startDoy);
    expect(regionState(state, world, state.player.region).campCell).toBeNull();

    const html = stocksHtml(state, world, cal, { rateDisplay: "game" });
    expect(html).toContain("no camp yet");
    expect(html).not.toContain("0.0 days");
    expect(html).not.toContain("of 0.0");
  });

  it("still reads the pack, which is the one group that is not the camp's", () => {
    const { state, world } = newGame(17);
    const html = stocksHtml(state, world, calendar(state.minute, state.startDoy), { rateDisplay: "game" });
    expect(html).toContain("Pack");
    // The pack's own figure, not a refusal: it is real from the first minute.
    expect(html).toMatch(/Pack<\/span> <b>[^<]+<\/b>/);
  });
});
