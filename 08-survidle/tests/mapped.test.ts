import { describe, expect, it } from "vitest";
import { newGame } from "../src/sim/newgame";
import { dimAll, isKnown, knownShare, knowledgeGen, mapRegion, markKnown } from "../src/sim/mapped";

describe("mapped cells", () => {
  it("marks, dims and counts a region's share", () => {
    const { state, world } = newGame(1);
    const region = state.player.region;
    const cells = world.regions.get(region)!.cells;
    const fresh = cells.find((c) => !isKnown(state, c))!;
    const g0 = knowledgeGen();
    markKnown(state, fresh);
    expect(isKnown(state, fresh)).toBe(true);
    expect(knowledgeGen()).toBeGreaterThan(g0);
    mapRegion(state, world, region);
    expect(knownShare(state, world, region)).toBe(1);
    dimAll(state);
    // Dim ground is still known ground: an heir may walk the journal.
    expect(isKnown(state, fresh)).toBe(true);
    expect(state.mapped[fresh]).toBe(3);
  });
});
