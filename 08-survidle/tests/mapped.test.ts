import { knowledgeAt } from "../src/sim/fineknowledge";
import { describe, expect, it } from "vitest";
import { newGame } from "../src/sim/newgame";
import { forgetGen, forgetGround, inheritRegion, isKnown, knownShare, knowledgeGen, mapRegion, markKnown } from "../src/sim/mapped";
import { regionAt } from "../src/world/gen";

describe("mapped cells", () => {
  it("marks and counts a region's share", () => {
    const { state, world } = newGame(1);
    // The landing already maps the home region whole; a neighbour, never
    // visited, still has ground nobody has walked.
    const region = regionAt(world, state.player.region).neighbours[0].id;
    const cells = regionAt(world, region).cells;
    const fresh = cells.find((c) => !isKnown(state, c))!;
    const g0 = knowledgeGen();
    markKnown(state, fresh);
    expect(isKnown(state, fresh)).toBe(true);
    expect(knowledgeGen()).toBeGreaterThan(g0);
    mapRegion(state, world, region);
    expect(knownShare(state, world, region)).toBe(1);
  });

  it("a death takes the ground, and moves the stamp that says so", () => {
    const { state, world } = newGame(1);
    const region = state.player.region;
    expect(knownShare(state, world, region)).toBeGreaterThan(0);
    const f0 = forgetGen();
    forgetGround(state);
    expect(knownShare(state, world, region)).toBe(0);
    // The one writer that lowers a patch has to say so, or every cache that
    // trusts "known stays known" keeps answering for ground that is gone.
    expect(forgetGen()).toBeGreaterThan(f0);
  });

  it("a region handed back from the journal reads inherited, and a walked patch outranks it", () => {
    const { state, world } = newGame(1);
    const region = state.player.region;
    const walked = regionAt(world, region).cells[0];
    forgetGround(state);
    inheritRegion(state, world, region);
    expect(knownShare(state, world, region)).toBe(1);
    expect(knowledgeAt(state.knowledge, walked)).toBe("inherited");
    markKnown(state, walked);
    expect(knowledgeAt(state.knowledge, walked)).toBe("seen");
    // Handing the region back a second time never lowers what has been earned.
    inheritRegion(state, world, region);
    expect(knowledgeAt(state.knowledge, walked)).toBe("seen");
  });
});
