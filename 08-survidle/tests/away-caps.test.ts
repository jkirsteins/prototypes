import { describe, expect, it } from "vitest";
import { advance } from "../src/sim/advance";
import { addItem, pile } from "../src/sim/inventory";
import { newGame } from "../src/sim/newgame";
import { regionState, siteFor } from "../src/sim/regionstate";
import { siteCamp } from "./siting-helpers";
import { testAtmosphere } from "./weather-helpers";

describe("caps that cost something say so", () => {
  it("a full rack is a line in the log, once a day, not once a minute", () => {
    testAtmosphere();
    const { state, world } = newGame(21);
    siteCamp(state, world);
    const st = regionState(state, world, state.player.region);
    const site = siteFor(st, st.campCell!);
    site.structures.dryingRack = true;
    site.racks = 1;
    st.rack.kg = 40;
    addItem(pile(state, st.campCell!), "rawMeat", 20);
    advance(state, world, 2 * 1440);
    const lines = state.log.filter((e) => e.text.includes("rack"));
    expect(lines.length).toBeGreaterThan(0);
    expect(lines.length).toBeLessThanOrEqual(2);
  });
});
