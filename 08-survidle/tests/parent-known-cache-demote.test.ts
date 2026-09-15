/**
 * The map's per-world parent-known cache (src/ui/map.ts, parentKnownCache)
 * leans on a narrower invariant than "knowledge only rises": isKnown is
 * append-only, but the tier behind it is not - demoteFog lowers seen and
 * visited patches to inherited on the heir-landing path. This pins the
 * behaviour the cache's comment promises: ground already read fully known
 * still draws as known, not fog, after that demotion.
 */
import { describe, expect, it } from "vitest";
import { demoteFog } from "../src/sim/landing";
import { isKnown, mapRegion, markKnown } from "../src/sim/mapped";
import { knowledgeAt } from "../src/sim/fineknowledge";
import { newGame } from "../src/sim/newgame";
import { glyphSummary, LEVELS, mapHtml } from "../src/ui/map";
import { newUiState } from "../src/ui/render";
import { calendar } from "../src/sim/calendar";
import { cellIdx } from "../src/world/gen";
import { FINE_PER_PARENT } from "../src/world/spatial";

const CAL = calendar(10);

describe("the parent-known cache across a demotion", () => {
  it("keeps a fully known parent's summary unchanged after demoteFog lowers its tier", () => {
    const { state, world } = newGame(21);
    // One whole parent, marked known directly rather than through mapRegion,
    // so the block glyphSummary(0, 0, FINE_PER_PARENT) reads is exactly the
    // parent parentFullyKnown caches - no partial edge patches to blur it.
    for (let y = 0; y < FINE_PER_PARENT; y++) {
      for (let x = 0; x < FINE_PER_PARENT; x++) markKnown(state, cellIdx(world, x, y));
    }
    const before = glyphSummary(state, world, 0, 0, FINE_PER_PARENT);
    expect(before.samples).toBeGreaterThan(0);
    expect(knowledgeAt(state.knowledge, cellIdx(world, 0, 0))).toBe("seen");

    demoteFog(state);

    // The demotion actually happened - this patch dropped a tier - but the
    // bit isKnown reads never went back to zero.
    expect(knowledgeAt(state.knowledge, cellIdx(world, 0, 0))).toBe("inherited");
    expect(isKnown(state, cellIdx(world, 0, 0))).toBe(true);

    const after = glyphSummary(state, world, 0, 0, FINE_PER_PARENT);
    expect(after).toEqual(before);
  });

  it("draws a known region as known, not fog, right after a demotion", () => {
    const { state, world } = newGame(21);
    mapRegion(state, world, state.player.region);
    const parentZoom = LEVELS.findIndex((l) => l.finePerGlyph === FINE_PER_PARENT);
    expect(parentZoom).toBeGreaterThanOrEqual(0);
    const ui = { ...newUiState(), zoom: parentZoom, welcome: false };

    document.body.innerHTML = `<div id="map">${mapHtml(world, state, ui, CAL)}</div>`;
    const knownBefore = document.querySelectorAll("#map .c.cur, #map .c.memory, #map .c.dim").length;
    expect(knownBefore).toBeGreaterThan(0);

    demoteFog(state);

    document.body.innerHTML = `<div id="map">${mapHtml(world, state, ui, CAL)}</div>`;
    // Same known footprint, none of it fallen back to fog: a demotion dims
    // ground, it does not unknow it.
    const knownAfter = document.querySelectorAll("#map .c.cur, #map .c.memory, #map .c.dim").length;
    expect(knownAfter).toBe(knownBefore);
    expect(document.querySelectorAll("#map .c.cur.fog, #map .c.memory.fog, #map .c.dim.fog").length).toBe(0);
  });
});
