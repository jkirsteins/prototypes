import { afterEach, describe, expect, it } from "vitest";
import { calendar } from "../src/sim/calendar";
import { newGame } from "../src/sim/newgame";
import { DISABLED, disabled } from "../src/sim/probe";
import { fishItem } from "../src/sim/species";
import { check } from "../src/sim/tasks";
import { unexploited } from "../src/sim/reference";
import { addItem, pile } from "../src/sim/inventory";
import { regionState } from "../src/sim/regionstate";

afterEach(() => DISABLED.clear());

describe("the without probe and the unexploited line", () => {
  it("a disabled source shuts its task and reads oily fish as lean", () => {
    DISABLED.add("oilyFish");
    expect(disabled("oilyFish")).toBe(true);
    expect(fishItem("char")).toBe("fish");
    DISABLED.add("marrow");
    const { state, world } = newGame(17);
    addItem(state.player.pack, "bone", 1);
    addItem(state.player.pack, "stone", 1);
    expect(check(state, world, calendar(0), "crack").why).toBe("disabled for the probe");
  });

  it("names fat at camp and bones uncracked, and reads none when there is nothing", () => {
    const { state, world } = newGame(17);
    const st = regionState(state, world, state.player.region);
    const before = unexploited(state, world);
    addItem(pile(state, st.campCell), "fat", 2);
    addItem(pile(state, st.campCell), "bone", 3);
    const after = unexploited(state, world);
    expect(after.some((u) => u.name === "fat at camp" && u.amount.includes("18,000"))).toBe(true);
    expect(after.some((u) => u.name === "bones uncracked")).toBe(true);
    expect(after.length).toBeGreaterThan(before.length);
  });
});
