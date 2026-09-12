/**
 * The close rungs draw real ground, and a click on any rung resolves to a
 * real patch.
 *
 * The two closest rungs used to hold one 300 m cell and scatter a made-up
 * field of letters inside it. Nothing under those letters was true: the
 * ground did not change from one to the next, a click anywhere in the field
 * meant the same cell, and the survivor's mark slid about inside a cell it
 * never left. Sections 5 and 9 of the authoritative-close-zoom spec replace
 * both: every glyph is a square block of real 50 m patches, and every click
 * names the exact patch an order would be given for.
 */
import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { calendar } from "../src/sim/calendar";
import { isKnown, mapRegion, markKnown } from "../src/sim/mapped";
import { newGame } from "../src/sim/newgame";
import { cellOf } from "../src/sim/position";
import { DEFAULT_ZOOM, glyphSummary, LEVELS, levelAt, mapHtml, mapTargetAtPoint, terrainComposition, viewOrigin, ZOOMS, zoomLabel } from "../src/ui/map";
import { newUiState, type UiState } from "../src/ui/render";
import { tipHtml } from "../src/ui/tip";
import { worldCacheStats } from "../src/world/aggregate";
import { frontierRoute, survivorRoute } from "../src/sim/routing";
import { PATCH_M } from "../src/world/spatial";
import { neighbours, type World } from "../src/world/gen";
import type { GameState } from "../src/sim/types";

const CAL = calendar(10);

function open(zoom: number): UiState {
  return { ...newUiState(), zoom, welcome: false };
}

/** The middle of the glyph a patch falls in, in the board's own pixels. */
function pointOf(world: World, state: GameState, ui: UiState, patch: number) {
  const l = levelAt(ui.zoom);
  const { x0, y0 } = viewOrigin(state, world, ui.zoom);
  const gx = Math.floor((patch % world.w - x0) / l.finePerGlyph);
  const gy = Math.floor((Math.floor(patch / world.w) - y0) / l.finePerGlyph);
  return { x: (gx + 0.5) * l.px, y: (gy + 0.5) * l.line };
}

function draw(world: World, state: GameState, ui: UiState): void {
  document.body.innerHTML = `<div id="map">${mapHtml(world, state, ui, CAL)}</div>`;
}

describe("the zoom ladder", () => {
  it("counts real patches per glyph and nothing else", () => {
    expect(ZOOMS.slice(0, 5)).toEqual([1, 2, 6, 18, 54]);
    expect(LEVELS.slice(0, 5).every((l) => l.w === 72 && l.h === 36)).toBe(true);
    expect(LEVELS[DEFAULT_ZOOM].finePerGlyph * PATCH_M).toBe(300);
    // The farthest rung is the smallest that fits the whole world.
    expect(LEVELS[5].finePerGlyph).toBeGreaterThan(54);
  });

  it("names the ground one glyph stands for at every rung", () => {
    expect([0, 1, 2, 3, 4].map(zoomLabel)).toEqual([
      "50 m per glyph", "100 m per glyph", "300 m per glyph", "900 m per glyph", "2.7 km per glyph",
    ]);
  });
});

describe("the closest rung", () => {
  it("draws 2592 ordinary real cells at 50 m", () => {
    const { state, world } = newGame(21);
    const ui = open(0);
    draw(world, state, ui);
    expect(document.querySelectorAll("#map .c")).toHaveLength(72 * 36);
    expect(document.querySelectorAll("#map .micro-ground")).toHaveLength(0);
    expect(document.querySelector("#map .maptools")?.textContent).toContain("50 m per glyph");
  });

  it("puts the survivor's mark on their patch and nowhere inside it", () => {
    const { state, world } = newGame(21);
    const ui = open(0);
    // A metre position well inside the patch used to move the mark within
    // its cell. The patch is the smallest thing the simulation has, so the
    // mark sits on it whole.
    state.player.xM = Math.floor(state.player.xM / PATCH_M) * PATCH_M + PATCH_M - 5;
    state.player.yM = Math.floor(state.player.yM / PATCH_M) * PATCH_M + 5;
    draw(world, state, ui);
    const player = document.querySelector<HTMLElement>("#map .mk-player")!;
    expect(player.classList.contains("c")).toBe(true);
    expect(player.dataset.mapCell).toBe(String(cellOf(state, world)));
    expect(player.querySelector("[data-visual-slot]")).toBeNull();
  });

  it("resolves a click on a glyph to that exact patch", () => {
    const { state, world } = newGame(21);
    const ui = open(0);
    const here = cellOf(state, world);
    const p = pointOf(world, state, ui, here);
    const target = mapTargetAtPoint(world, state, ui, p.x, p.y);
    expect(target?.aggregate.size).toBe(1);
    expect(target?.patch).toBe(here);
  });
});

describe("a click on a block", () => {
  it("resolves an aggregate click to a reachable exact patch", () => {
    const { state, world } = newGame(21);
    mapRegion(state, world, state.player.region);
    const ui = open(1);
    const here = cellOf(state, world);
    // A block two glyphs east of the survivor, so the answer is not simply
    // the patch they already stand on.
    const p = pointOf(world, state, ui, here);
    const target = mapTargetAtPoint(world, state, ui, p.x + levelAt(1).px * 2, p.y);
    expect(target?.aggregate.size).toBe(2);
    expect(target?.patch).not.toBeNull();
    // Asked of the sim's own door, which is the one the walk will be planned
    // through: known ground only, under the survivor's ice and fears.
    expect(survivorRoute(state, world, here, target!.patch!)).not.toBeNull();
  });

  it("gives a block holding an exact mark that mark's own patch", () => {
    const { state, world } = newGame(21);
    mapRegion(state, world, state.player.region);
    const ui = open(3);
    const here = cellOf(state, world);
    const p = pointOf(world, state, ui, here);
    const target = mapTargetAtPoint(world, state, ui, p.x, p.y);
    expect(target?.aggregate.size).toBe(18);
    expect(target?.patch).toBe(here);
  });

  it("lists every exact feature in a block instead of choosing one", () => {
    const { state, world } = newGame(21);
    mapRegion(state, world, state.player.region);
    const here = cellOf(state, world);
    const ui = open(3);
    const p = pointOf(world, state, ui, here);
    // Both marks go inside the same block as the survivor, read off the
    // block the click actually lands on rather than guessed from an offset.
    const box = mapTargetAtPoint(world, state, ui, p.x, p.y)!.aggregate;
    state.seeps[box.y0 * world.w + box.x0] = { class: "damp", litres: 4, ice: 0, dug: 0 };
    state.wildlife.knownDens[box.y0 * world.w + box.x0 + 1] = true;
    const target = mapTargetAtPoint(world, state, ui, p.x, p.y, CAL)!;
    const labels = target.features.map((f) => f.label);
    expect(labels).toContain("you");
    expect(labels).toContain("seep");
    expect(labels).toContain("known bear den");
    // The block resolves to one of its marks, and the tooltip names the rest
    // rather than letting them vanish behind the one that won.
    const tip = tipHtml(state, world, CAL, target.patch!, "both", target);
    const others = target.features.filter((f) => f.patch !== target.patch).map((f) => f.label);
    expect(others.length).toBeGreaterThan(1);
    for (const label of others) expect(tip).toContain(label);
    expect(tip).toContain("also in this glyph");
  });

  it("states the block's scale and what its ground is made of", () => {
    const { state, world } = newGame(21);
    mapRegion(state, world, state.player.region);
    const ui = open(2);
    const here = cellOf(state, world);
    const p = pointOf(world, state, ui, here);
    const target = mapTargetAtPoint(world, state, ui, p.x, p.y)!;
    const tip = tipHtml(state, world, CAL, target.patch!, "both", target);
    expect(tip).toContain("300 m glyph:");
    const summary = glyphSummary(state, world, target.aggregate.x0, target.aggregate.y0, target.aggregate.size);
    expect(summary.samples).toBe(36);
    expect(tip).toContain(terrainComposition(summary));
  });

  it("reads a 100 m glyph off its own four patches", () => {
    const { state, world } = newGame(21);
    mapRegion(state, world, state.player.region);
    const ui = open(1);
    const here = cellOf(state, world);
    const target = mapTargetAtPoint(world, state, ui, pointOf(world, state, ui, here).x, pointOf(world, state, ui, here).y)!;
    const summary = glyphSummary(state, world, target.aggregate.x0, target.aggregate.y0, 2);
    expect(summary.samples).toBe(4);
    const total = Object.values(summary.terrainCounts).reduce((a, b) => a + b, 0);
    expect(total).toBe(4);
  });

  it("refuses a point off the board", () => {
    const { state, world } = newGame(21);
    const ui = open(2);
    expect(mapTargetAtPoint(world, state, ui, -5, -5)).toBeNull();
    const l = levelAt(2);
    expect(mapTargetAtPoint(world, state, ui, l.w * l.px + 10, 5)).toBeNull();
  });
});

describe("the resolved destination", () => {
  it("is shown on the board before an order is given", () => {
    const { state, world } = newGame(21);
    mapRegion(state, world, state.player.region);
    const ui = open(1);
    const here = cellOf(state, world);
    const p = pointOf(world, state, ui, here);
    const target = mapTargetAtPoint(world, state, ui, p.x + levelAt(1).px * 2, p.y)!;
    expect(target.patch).not.toBeNull();
    ui.destination = target.patch;
    draw(world, state, ui);
    const marked = document.querySelectorAll("#map .c.target");
    expect(marked).toHaveLength(1);
  });
});

describe("unknown ground", () => {
  it("is drawn as fog without generating the terrain under it", () => {
    const { state, world } = newGame(21);
    // The wide rung spans several thousand patches a glyph. Drawing it must
    // not be what builds them: fog is the answer, and fog has no ground.
    const before = worldCacheStats(world);
    draw(world, state, open(4));
    const after = worldCacheStats(world);
    expect(document.querySelectorAll("#map .c.fog").length).toBeGreaterThan(2000);
    expect(after.fineChunkBuilds - before.fineChunkBuilds).toBeLessThanOrEqual(1);
  });
});

describe("firelight at night", () => {
  // Firelight is not the sky's light. visibleCells is gated by lux, so on a
  // moonless night it is empty while the ground round a lit fire is plainly
  // lit; reading the rings off the viewshed put the camp fire out.
  function litCamp() {
    const { state, world } = newGame(21);
    mapRegion(state, world, state.player.region);
    const region = state.regions[state.player.region];
    region.campCell = cellOf(state, world);
    region.fire.lit = true;
    region.fire.fuelKg = 6;
    // A run opens at 08:00, so midnight of the first night is minute 960.
    const night = calendar(16 * 60, state.startDoy);
    expect(night.isNight).toBe(true);
    return { state, world, night };
  }

  it("lights the ground round a lit camp fire at the closest rung", () => {
    const { state, world, night } = litCamp();
    const ui = open(0);
    document.body.innerHTML = `<div id="map">${mapHtml(world, state, ui, night)}</div>`;
    expect(document.querySelectorAll("#map .c.lit-0").length).toBeGreaterThan(0);
    expect(document.querySelectorAll("#map .c.lit-1").length).toBeGreaterThan(0);
    expect(document.querySelectorAll("#map .c.lit-2").length).toBeGreaterThan(0);
  });

  it("keeps the source lit at the default rung, where the glow fits inside one glyph", () => {
    // A ring of glyphs at 300 m each would claim 600 m of firelight, so the
    // rings shrink as the glyph grows and only the source is left.
    const { state, world, night } = litCamp();
    const ui = open(DEFAULT_ZOOM);
    document.body.innerHTML = `<div id="map">${mapHtml(world, state, ui, night)}</div>`;
    expect(document.querySelectorAll("#map .c.lit-0").length).toBe(1);
    expect(document.querySelectorAll("#map .c.lit-1, #map .c.lit-2").length).toBe(0);
  });
});

describe("clicking fog", () => {
  it("resolves a block of nothing but fog to its frontier, so the walk into the dark still works", () => {
    const { state, world } = newGame(21);
    const ui = open(1);
    const here = cellOf(state, world);
    const p = pointOf(world, state, ui, here);
    // The first block east of the survivor holding no ground they know. A
    // fresh survivor knows a blob about a hundred metres across, so it is
    // only a glyph or two out.
    let target = null;
    for (let step = 1; step < 20 && !target; step++) {
      const candidate = mapTargetAtPoint(world, state, ui, p.x + levelAt(1).px * step, p.y);
      if (candidate?.patch !== null && candidate !== null && !isKnown(state, candidate.patch)) target = candidate;
    }
    expect(target).not.toBeNull();
    expect(target!.patch).not.toBeNull();
    expect(isKnown(state, target!.patch!)).toBe(false);
    // The frontier is what frontierRoute needs: unknown, with known ground
    // next to it.
    expect(neighbours(world, target!.patch!).some((cell) => isKnown(state, cell))).toBe(true);
    expect(frontierRoute(state, world, here, target!.patch!)).not.toBeNull();
  });
});

describe("drawing known aggregates", () => {
  it("summarises a block nobody has been to without generating a patch of it", () => {
    const { state, world } = newGame(21);
    // Virgin ground, far from the landing. A wide glyph here holds 2,916
    // patches; asking the world for any of them to draw fog is the whole
    // cost the lazy lattice exists to avoid.
    const before = worldCacheStats(world);
    const summary = glyphSummary(state, world, 3000, 1000, 54);
    const after = worldCacheStats(world);
    expect(summary.samples).toBe(0);
    expect(after.fineChunkBuilds).toBe(before.fineChunkBuilds);
    expect(after.generatedPatches).toBe(before.generatedPatches);
  });

  it("summarises a half-known parent from its known patches alone", () => {
    const { state, world } = newGame(21);
    // Scattered knowledge, so no parent inside the block is whole. The
    // summary must come out of these patches and no others.
    let known = 0;
    for (let y = 1000; y < 1054; y++) {
      for (let x = 3000; x < 3054; x++) {
        if ((x + y) % 6 === 0) continue;
        markKnown(state, x * 1 + y * world.w);
        known++;
      }
    }
    const before = worldCacheStats(world);
    const summary = glyphSummary(state, world, 3000, 1000, 54);
    const after = worldCacheStats(world);
    expect(summary.samples).toBe(known);
    expect(after.fineChunkBuilds).toBe(before.fineChunkBuilds);
    expect(after.generatedPatches).toBe(before.generatedPatches);
  });

  it("draws a frontier board at the wide rungs without generating the ground behind the fog", () => {
    const { state, world } = newGame(21);
    // Stand on virgin ground and let the first render pay for whatever the
    // viewshed and the local weather need. Everything after that is the
    // aggregate path's own bill.
    state.player.xM = (3000 + 0.5) * PATCH_M;
    state.player.yM = (1000 + 0.5) * PATCH_M;
    draw(world, state, open(3));
    draw(world, state, open(4));
    // Enough known ground for whole glyphs to pass the majority test, and
    // never a whole parent: one patch in six of every parent stays fog.
    // Fifteen kilometres east of where the survivor stands, so the ground
    // is well outside anything their own sight already generated and the
    // only thing that could build it is the map drawing it.
    for (let y = 1000 - 108; y < 1000 + 108; y++) {
      for (let x = 3300; x < 3516; x++) {
        if ((x + y) % 6 === 0) continue;
        markKnown(state, x + y * world.w);
      }
    }
    const before = worldCacheStats(world);
    draw(world, state, open(3));
    expect(document.querySelectorAll("#map .c:not(.fog):not(.void)").length).toBeGreaterThan(0);
    draw(world, state, open(4));
    const after = worldCacheStats(world);
    // Sixteen glyphs of known ground drawn, and not one patch of the world
    // behind them built to draw it. Before the parents were gated on
    // knowledge this cost nine chunks and 82,944 generated patches.
    expect(document.querySelectorAll("#map .c:not(.fog):not(.void)").length).toBe(16);
    expect(after.fineChunkBuilds).toBe(before.fineChunkBuilds);
    expect(after.generatedPatches).toBe(before.generatedPatches);
  });

  it("composes a wide glyph from cached parent summaries instead of generating its fringe twice", () => {
    const { state, world } = newGame(21);
    mapRegion(state, world, state.player.region);
    // The first render pays for the ground the survivor knows; the second
    // must pay nothing, or every frame at a block rung rebuilds chunks.
    draw(world, state, open(3));
    const afterFirst = worldCacheStats(world).fineChunkBuilds;
    draw(world, state, open(3));
    draw(world, state, open(4));
    draw(world, state, open(4));
    expect(worldCacheStats(world).fineChunkBuilds).toBe(afterFirst);
  });
});

/** Every .ts and .css file the shipped game is built from. */
function applicationSources(): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = `${dir}/${entry.name}`;
      if (entry.isDirectory()) walk(path);
      else if (entry.name.endsWith(".ts") || entry.name.endsWith(".css")) out.push(readFileSync(path, "utf8"));
    }
  };
  walk("src");
  return out;
}

describe("the comparison scene", () => {
  // The before and after images are only evidence if the game cannot tell it
  // is being photographed. The seed, the file names and the capture directory
  // belong to scripts/ and docs/, which this deliberately does not read.
  it("contains no application special case for the comparison scene", () => {
    const source = applicationSources().join("\n");
    expect(source).not.toMatch(/seed\s*===?\s*21/);
    expect(source).not.toContain("close-zoom-simulation-shots");
    expect(source).not.toContain("after-50m");
    expect(source).not.toContain("after-100m");
  });
});
