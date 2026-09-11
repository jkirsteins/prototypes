import { describe, expect, it } from "vitest";
import { calendar } from "../src/sim/calendar";
import { addItem, pile } from "../src/sim/inventory";
import { advance } from "../src/sim/advance";
import { newGame } from "../src/sim/newgame";
import { readSave, serialize } from "../src/sim/save";
import { clearShopping, shoppingList, shoppingSourceSpots, shoppingTarget, trackShopping } from "../src/sim/shopping";
import { heathCell, placeAt } from "../src/sim/position";
import { beginTask } from "../src/sim/tasks";
import { shoppingHtml, shoppingQuery } from "../src/ui/shopping";
import { placesHtml } from "../src/ui/panels";
import { shoppingSource } from "../src/sim/shopping";
import { siteCamp } from "./siting-helpers";
import { regionAt } from "../src/world/gen";

describe("the tracked shopping target", () => {
  it("starts empty and an older save gains the same empty target", () => {
    const { state } = newGame(3);
    expect((state as unknown as { shopping?: unknown }).shopping).toBeNull();

    const raw = JSON.parse(serialize(state)) as { state: Record<string, unknown> };
    delete raw.state.shopping;
    const loaded = readSave(JSON.stringify(raw));
    expect(loaded).not.toBeNull();
    expect((loaded!.state as unknown as { shopping?: unknown }).shopping).toBeNull();
  });

  it("tracks the direct needs of one recipe without explaining their own recipes", () => {
    const { state, world } = newGame(3);
    const camp = siteCamp(state, world);
    placeAt(state, world, camp);
    state.shopping = shoppingTarget("craft", "knife");
    addItem(state.player.pack, "stone", 1);
    addItem(pile(state, camp), "stone", 1);
    addItem(pile(state, camp), "stick", 1);

    const list = shoppingList(state, world, calendar(state.minute, state.startDoy));
    expect(list?.title).toBe("Make stone knife");
    expect(list?.needs.map((n) => n.item)).toEqual(["stone", "stick", "cordage"]);
    expect(list?.needs.some((n) => n.item === "bark")).toBe(false);
    expect(list?.needs.find((n) => n.item === "stone")).toMatchObject({
      need: 2,
      pack: 1,
      here: 1,
      camp: 1,
      available: 2,
      short: 0,
    });
    expect(list?.ready).toBe(false);
  });

  it("counts an alternative only when enough of either material is available", () => {
    const { state, world } = newGame(3);
    const camp = siteCamp(state, world);
    placeAt(state, world, camp);
    state.shopping = shoppingTarget("craft", "furHat");
    addItem(state.player.pack, "hide", 1);
    addItem(state.player.pack, "sinew", 1);

    const list = shoppingList(state, world, calendar(state.minute, state.startDoy));
    expect(list?.needs[0]).toMatchObject({ item: "fur", alt: "hide", pack: 0, packAlt: 1, available: 1, short: 0 });
    expect(list?.ready).toBe(true);
    const html = shoppingHtml(state, world, calendar(state.minute, state.startDoy));
    expect(html).toContain("1.0 kg hide in pack");
    expect(html).not.toContain("1.0 kg fur in pack");
  });

  it("keeps alternative shortages separate instead of implying they can be mixed", () => {
    const { state, world } = newGame(3);
    const camp = siteCamp(state, world);
    placeAt(state, world, camp);
    state.shopping = shoppingTarget("craft", "hideBlanket");
    addItem(state.player.pack, "fur", 3.5);

    const list = shoppingList(state, world, calendar(state.minute, state.startDoy));
    expect(list?.needs.find((n) => n.item === "hide")).toMatchObject({
      item: "hide", alt: "fur", shortPrimary: 4, shortAlt: 0.5, short: 0.5,
    });
    const html = shoppingHtml(state, world, calendar(state.minute, state.startDoy));
    expect(html).toContain("short 4.0 kg hide or 0.5 kg fur");
    expect(html).toContain('data-item="hide"');
    expect(html).toContain('data-item="fur"');
  });

  it("refuses targets with no material list", () => {
    expect(shoppingTarget("build", "firePit")).toBeNull();
    expect(shoppingTarget("build", "snowShelter")).toBeNull();
    expect(shoppingTarget("build", "leanTo")).toEqual({ task: "build", arg: "leanTo" });
  });

  it("replaces the one tracked target and clears it without touching the queue", () => {
    const { state } = newGame(3);
    const orders = JSON.stringify(state.regions);
    expect(trackShopping(state, "craft", "knife")).toBe(true);
    expect(state.shopping).toEqual({ task: "craft", arg: "knife" });
    expect(trackShopping(state, "build", "leanTo")).toBe(true);
    expect(state.shopping).toEqual({ task: "build", arg: "leanTo" });
    clearShopping(state);
    expect(state.shopping).toBeNull();
    expect(JSON.stringify(state.regions)).toBe(orders);
  });

  it("renders the target, direct shortages, location, and controls", () => {
    const { state, world } = newGame(3);
    const camp = siteCamp(state, world);
    placeAt(state, world, camp);
    state.shopping = shoppingTarget("craft", "knife");
    addItem(state.player.pack, "stone", 1);
    addItem(pile(state, camp), "stone", 1);
    addItem(pile(state, camp), "stick", 1);

    const html = shoppingHtml(state, world, calendar(state.minute, state.startDoy));
    expect(html).toContain("Shopping list");
    expect(html).toContain("Make stone knife");
    expect(html).toContain("2 stone");
    expect(html).toContain("ready here");
    expect(html).toContain("short 1 cordage");
    expect(html).toContain('data-act="shopping-find" data-item="cordage"');
    expect(html).toContain('data-act="shopping-clear"');
    expect(html).not.toContain("bark");
  });

  it("connects raw materials to their known kind of place and crafted materials to Do", () => {
    expect(shoppingSource("stone")).toMatchObject({ task: "stone", spot: "outcrop" });
    expect(shoppingSource("stick")).toMatchObject({ task: "sticks", spot: "forest" });
    expect(shoppingSource("cordage")).toMatchObject({ task: "craft", arg: "cordage", spot: null });
  });

  it("does not claim that every animal material comes from forest", () => {
    for (const item of ["hide", "fur", "bone", "sinew"] as const) {
      expect(shoppingSource(item)).toMatchObject({ task: "hunt", spot: null });
    }
  });

  it("points animal materials to the viable hunting places in this region", () => {
    const { state, world } = newGame(3);
    const spots = shoppingSourceSpots(state, world, calendar(state.minute, state.startDoy), "hide");
    expect(spots.length).toBeGreaterThan(0);
    expect(spots).toContain("forest");
  });

  it("uses searchable singular item names for Do filters", () => {
    expect(shoppingQuery("snare")).toBe("snare");
    expect(shoppingQuery("stone")).toBe("stone");
  });

  it("marks a known place when it can answer a current shortage", () => {
    const { state, world } = newGame(3);
    state.shopping = shoppingTarget("craft", "knife");
    const html = placesHtml(state, world, calendar(state.minute, state.startDoy));
    expect(html).toMatch(/outcrop[\s\S]*stone for stone knife/);
    expect(html).toMatch(/forest[\s\S]*stick for stone knife/);
  });

  it("names every direct shortage one known place can answer", () => {
    const { state, world } = newGame(3);
    state.shopping = shoppingTarget("build", "leanTo");
    const html = placesHtml(state, world, calendar(state.minute, state.startDoy));
    expect(html).toContain("sticks and logs for lean-to");
    expect(html).not.toContain("cordage for lean-to");
  });

  it("clears only when the tracked craft actually succeeds", () => {
    const { state, world } = newGame(17);
    const camp = siteCamp(state, world);
    placeAt(state, world, camp);
    state.shopping = shoppingTarget("craft", "knife");
    addItem(state.player.pack, "stone", 2);
    addItem(state.player.pack, "stick", 1);
    addItem(state.player.pack, "cordage", 1);
    expect(beginTask(state, world, calendar(state.minute, state.startDoy), "craft", "knife")).toBe(true);
    advance(state, world, 60);
    expect(state.shopping).toBeNull();
  });

  it("clears when the tracked structure is finished", () => {
    const { state, world } = newGame(3);
    const camp = siteCamp(state, world);
    placeAt(state, world, camp);
    state.shopping = shoppingTarget("build", "leanTo");
    addItem(pile(state, camp), "stick", 8);
    addItem(pile(state, camp), "log", 4);
    addItem(pile(state, camp), "cordage", 2);
    expect(beginTask(state, world, calendar(state.minute, state.startDoy), "build", "leanTo")).toBe(true);
    advance(state, world, 300);
    expect(state.shopping).toBeNull();
  });

  it("counts materials committed to a started build as ready", () => {
    const { state, world } = newGame(3);
    const camp = siteCamp(state, world);
    placeAt(state, world, camp);
    state.shopping = shoppingTarget("build", "leanTo");
    addItem(pile(state, camp), "stick", 8);
    addItem(pile(state, camp), "log", 4);
    addItem(pile(state, camp), "cordage", 2);
    expect(beginTask(state, world, calendar(state.minute, state.startDoy), "build", "leanTo")).toBe(true);

    const list = shoppingList(state, world, calendar(state.minute, state.startDoy));
    expect(list?.committed).toBe(true);
    expect(list?.ready).toBe(true);
    expect(list?.needs.every((need) => need.short === 0)).toBe(true);
    expect(shoppingHtml(state, world, calendar(state.minute, state.startDoy))).toContain("materials laid out");
  });

  it("counts camp stock for structures whose work site is elsewhere", () => {
    const { state, world } = newGame(3);
    const camp = siteCamp(state, world);
    placeAt(state, world, camp);

    state.shopping = shoppingTarget("build", "snare");
    addItem(pile(state, camp), "snare", 1);
    expect(shoppingList(state, world, calendar(state.minute, state.startDoy))).toMatchObject({ ready: true });

    state.shopping = shoppingTarget("build", "seep");
    addItem(pile(state, camp), "stick", 4);
    expect(shoppingList(state, world, calendar(state.minute, state.startDoy))).toMatchObject({ ready: true });
  });

  it("also counts loose build materials already at a remote work site", () => {
    const { state, world } = newGame(3);
    const camp = siteCamp(state, world);
    const cal = calendar(state.minute, state.startDoy);
    const workSite = regionAt(world, state.player.region).cells.find((cell) => cell !== camp && heathCell(world, cell));
    if (workSite === undefined) throw new Error("test region has no remote heath cell");
    placeAt(state, world, workSite);
    state.shopping = shoppingTarget("build", "snare");
    addItem(pile(state, workSite), "snare", 1);

    const list = shoppingList(state, world, cal);
    expect(list).toMatchObject({ ready: true });
    expect(list?.needs[0]).toMatchObject({ here: 1, available: 1, short: 0 });
  });
});
