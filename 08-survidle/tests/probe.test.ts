import { afterEach, describe, expect, it, vi } from "vitest";
import { Rng } from "../src/rng";
import { calendar } from "../src/sim/calendar";
import { dailyCamp } from "../src/sim/camp";
import { newGame } from "../src/sim/newgame";
import { placeAt } from "../src/sim/position";
import { DISABLED, disabled } from "../src/sim/probe";
import { fishItem } from "../src/sim/species";
import { check } from "../src/sim/tasks";
import { unexploited } from "../src/sim/reference";
import { emptyBurn, emptyYield } from "../src/sim/ledger";
import { addItem, pile } from "../src/sim/inventory";
import { regionState } from "../src/sim/regionstate";
import { cellIdx, regionAt } from "../src/world/gen";
import { siteCamp } from "./siting-helpers";
import { ensureGround } from "../src/sim/weather";
import { testAtmosphere } from "./weather-helpers";

afterEach(() => { DISABLED.clear(); vi.restoreAllMocks(); });

describe("the without probe and the unexploited line", () => {
  it("a disabled source shuts its task and reads oily fish as lean", () => {
    DISABLED.add("oilyFish");
    expect(disabled("oilyFish")).toBe(true);
    expect(fishItem("char")).toBe("fish");
    DISABLED.add("marrow");
    const { state, world } = newGame(17);
    siteCamp(state, world);
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
    siteCamp(state, world);
    const st = regionState(state, world, state.player.region);
    expect(regionAt(world, state.player.region).capacity.trout).toBeGreaterThan(0);
    const cal = calendar(0, 200);
    st.trap = { cell: st.campCell!, kg: 0, oilyKg: 0, fish: ["trout"], age: 0 };
    DISABLED.add("oilyFish");
    for (let d = 0; d < 40; d++) dailyCamp(state, world, cal, new Rng(d), null);
    expect(st.trap!.kg).toBeGreaterThan(0);
    expect(st.trap!.oilyKg).toBe(0);
    // With the source open the same draws fill the oily side.
    DISABLED.clear();
    st.trap = { cell: st.campCell!, kg: 0, oilyKg: 0, fish: ["trout"], age: 0 };
    for (let d = 0; d < 40; d++) dailyCamp(state, world, cal, new Rng(d), null);
    expect(st.trap!.oilyKg).toBeGreaterThan(0);
  });

  it("names fat at camp and bones uncracked, and reads none when there is nothing", () => {
    const { state, world } = newGame(17);
    siteCamp(state, world);
    const st = regionState(state, world, state.player.region);
    const before = unexploited(state, world);
    addItem(pile(state, st.campCell!), "fat", 2);
    addItem(pile(state, st.campCell!), "bone", 3);
    const after = unexploited(state, world);
    expect(after.some((u) => u.name === "fat at camp" && u.amount.includes("18,000"))).toBe(true);
    expect(after.some((u) => u.name === "bones uncracked")).toBe(true);
    expect(after.length).toBeGreaterThan(before.length);
    // Nothing has ever been credited into the ledger, so what sat there reads unclaimed the same way.
    expect(after.every((u) => u.taken === "none taken")).toBe(true);
  });

  it("the taken half reads what the ledger credited from the item's own source in the week before, hunt for fat and marrow for bones", () => {
    const { state, world } = newGame(17);
    siteCamp(state, world);
    const st = regionState(state, world, state.player.region);
    addItem(pile(state, st.campCell!), "fat", 2);
    addItem(pile(state, st.campCell!), "bone", 3);
    // newGame seeds day 1's own row (the arrival kit's kcal); replace it rather than
    // duplicate it, or weekBefore's average would divide by eight rows, not seven.
    state.ledger.length = 0;
    for (let d = 1; d <= 7; d++) {
      const row = { day: d, yield: emptyYield(), eaten: 0, leanKcal: 0, nonLeanKcal: 0, leanAtCamp: false, burn: emptyBurn(), sleepMin: 0, workMin: 0 };
      row.yield.hunt = 306;
      state.ledger.push(row);
    }
    // Day 8: weekBefore reads days 1-7.
    state.minute = 7 * 1440;
    const after = unexploited(state, world);
    expect(after.find((u) => u.name === "fat at camp")?.taken).toBe("306 kcal a day taken");
    // Marrow was never credited, so bones read unclaimed beside a fed larder.
    expect(after.find((u) => u.name === "bones uncracked")?.taken).toBe("none taken");
  });

  // Seed 17's own coastline (the plants test's hand-found cell), not the landing
  // region: a land cell beside a "sea"-kind water cell, stood on directly.
  it("the seaweed bullet reads the shore's ice exactly as the seaweed task does", () => {
    testAtmosphere({ temperatureC: 5 });
    const { state, world } = newGame(17, 90);
    siteCamp(state, world);
    placeAt(state, world, cellIdx(world, 1224, 12));
    ensureGround(state, world, state.player.region).iceCm = 0;
    expect(unexploited(state, world).some((u) => u.name === "seaweed")).toBe(true);
    ensureGround(state, world, state.player.region).iceCm = 2;
    expect(unexploited(state, world).some((u) => u.name === "seaweed")).toBe(false);
  });
});
