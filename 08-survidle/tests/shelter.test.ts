import { describe, expect, it } from "vitest";
import { newGame } from "../src/sim/newgame";
import { regionState, siteFor } from "../src/sim/regionstate";
import { protectionOf, PROTECTION_WORDS } from "../src/sim/shelter";

describe("protection", () => {
  it("reads nothing as open ground", () => {
    expect(protectionOf(null)).toBe(0);
    expect(PROTECTION_WORDS[0]).toBe("open ground");
  });

  it("puts the existing structures on the scale they already imply", () => {
    const { state, world } = newGame(17);
    const st = regionState(state, world, state.player.region);
    const site = siteFor(st, st.campCell ?? 0);
    expect(protectionOf(site)).toBe(0);
    site.structures.snowShelter = true;
    expect(protectionOf(site)).toBe(2);
    site.structures.leanTo = true;
    expect(protectionOf(site)).toBe(2);
    site.structures.turfHut = true;
    expect(protectionOf(site)).toBe(3);
  });
});
