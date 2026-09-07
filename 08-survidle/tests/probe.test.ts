import { afterEach, describe, expect, it } from "vitest";
import { Rng } from "../src/rng";
import { calendar } from "../src/sim/calendar";
import { dailyCamp } from "../src/sim/camp";
import { newGame } from "../src/sim/newgame";
import { placeAt } from "../src/sim/position";
import { DISABLED, disabled } from "../src/sim/probe";
import { fishItem } from "../src/sim/species";
import { check } from "../src/sim/tasks";
import { unexploited } from "../src/sim/reference";
import { addItem, pile } from "../src/sim/inventory";
import { regionState } from "../src/sim/regionstate";
import { cellIdx, regionAt } from "../src/world/gen";

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

  it("shuts the trap's oily side too: the class goes through fishItem in one place", () => {
    // The trap read the species table directly and never the probe, so a char-shore trap kept
    // filling its oily kilos with oilyFish shut and takeTrapFish produced them at camp. The
    // without table's oilyFish row was a partial shutdown.
    // Seed 17's home region holds trout, the oily species the trap can draw here.
    const { state, world } = newGame(17, 200);
    const st = regionState(state, world, state.player.region);
    expect(regionAt(world, state.player.region).capacity.trout).toBeGreaterThan(0);
    const cal = calendar(0, 200);
    st.trap = { cell: st.campCell, kg: 0, oilyKg: 0, fish: ["trout"], age: 0 };
    DISABLED.add("oilyFish");
    for (let d = 0; d < 40; d++) dailyCamp(state, world, cal, new Rng(d), null);
    expect(st.trap!.kg).toBeGreaterThan(0);
    expect(st.trap!.oilyKg).toBe(0);
    // With the source open the same draws fill the oily side.
    DISABLED.clear();
    st.trap = { cell: st.campCell, kg: 0, oilyKg: 0, fish: ["trout"], age: 0 };
    for (let d = 0; d < 40; d++) dailyCamp(state, world, cal, new Rng(d), null);
    expect(st.trap!.oilyKg).toBeGreaterThan(0);
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

  // Seed 17's own coastline (the plants test's hand-found cell), not the landing
  // region: a land cell beside a "sea"-kind water cell, stood on directly.
  it("the seaweed bullet reads the shore's ice exactly as the seaweed task does", () => {
    const { state, world } = newGame(17, 90);
    placeAt(state, world, cellIdx(world, 1224, 12));
    state.weather.iceCm = 0;
    expect(unexploited(state, world).some((u) => u.name === "seaweed")).toBe(true);
    state.weather.iceCm = 2;
    expect(unexploited(state, world).some((u) => u.name === "seaweed")).toBe(false);
  });
});
