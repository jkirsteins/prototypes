/**
 * The map's per-world parent-known cache (src/ui/map.ts, parentKnownCache)
 * answers "is every patch of this parent known" and, for speed, trusts a
 * `true` for ever: every ordinary write to the lattice raises a patch, so
 * known ground stays known and a parent found whole need never be rescanned.
 *
 * `forgetGround` (mapped.ts), on a heir's landing, is the one writer that
 * breaks that - it takes every patch back to unknown so the heir starts on
 * ground they have not walked - and `forgetGen` is how the cache is told.
 * This file pins that telling. Without it the cache keeps answering `true`
 * and `glyphSummary` takes the fast path, summarising all thirty-six patches
 * of terrain for a parent the survivor can no longer see: a map drawn of fog.
 */
import { describe, expect, it } from "vitest";
import { demoteFog } from "../src/sim/landing";
import { isKnown, mapRegion, markKnown } from "../src/sim/mapped";
import { knowledgeAt } from "../src/sim/fineknowledge";
import { newGame } from "../src/sim/newgame";
import { glyphSummary, LEVELS } from "../src/ui/map";
import { board, glyphsWith, has } from "./board";
import { newUiState } from "../src/ui/render";
import { calendar } from "../src/sim/calendar";
import { cellIdx } from "../src/world/gen";
import { FINE_PER_PARENT } from "../src/world/spatial";

const CAL = calendar(10);

describe("the parent-known cache across a forgetting", () => {
  it("stops summarising a parent the heir no longer knows, having summarised it before", () => {
    const { state, world } = newGame(21);
    // One whole parent, marked known directly rather than through mapRegion,
    // so the block glyphSummary(0, 0, FINE_PER_PARENT) reads is exactly the
    // parent parentFullyKnown caches - no partial edge patches to blur it.
    for (let y = 0; y < FINE_PER_PARENT; y++) {
      for (let x = 0; x < FINE_PER_PARENT; x++) markKnown(state, cellIdx(world, x, y));
    }
    // Reading it first is the point: this is what puts `known: true` in the
    // cache, so the call after the forgetting is answered from a stale entry
    // unless the forget stamp has moved.
    const before = glyphSummary(state, world, 0, 0, FINE_PER_PARENT);
    expect(before.samples).toBe(FINE_PER_PARENT * FINE_PER_PARENT);
    expect(knowledgeAt(state.knowledge, cellIdx(world, 0, 0))).toBe("seen");

    demoteFog(state);

    expect(knowledgeAt(state.knowledge, cellIdx(world, 0, 0))).toBe("unknown");
    expect(isKnown(state, cellIdx(world, 0, 0))).toBe(false);

    // Nothing known, so nothing sampled: the block has no ground to describe.
    const after = glyphSummary(state, world, 0, 0, FINE_PER_PARENT);
    expect(after.samples).toBe(0);
  });

  it("draws a forgotten region as fog, having drawn it as known before", () => {
    const { state, world } = newGame(21);
    mapRegion(state, world, state.player.region);
    const parentZoom = LEVELS.findIndex((l) => l.finePerGlyph === FINE_PER_PARENT);
    expect(parentZoom).toBeGreaterThanOrEqual(0);
    const ui = { ...newUiState(), zoom: parentZoom, welcome: false };

    const knownOn = (b: ReturnType<typeof board>) => b.glyphs.filter((g) => has(g, "cur") || has(g, "memory") || has(g, "dim"));
    const knownBefore = knownOn(board(world, state, ui, CAL)).length;
    expect(knownBefore).toBeGreaterThan(0);

    demoteFog(state);

    // The ancestor's country is not this survivor's to read. What the board
    // keeps is what the heir's own eye reaches, and that is not this region.
    const after = board(world, state, ui, CAL);
    expect(knownOn(after).length).toBeLessThan(knownBefore);
    expect(glyphsWith(after, "fog").length).toBeGreaterThan(0);
  });
});
