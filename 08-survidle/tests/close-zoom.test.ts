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
import { newKnowledge } from "../src/sim/fineknowledge";
import { newGame } from "../src/sim/newgame";
import { cellOf } from "../src/sim/position";
import { DEFAULT_ZOOM, glyphSummary, LEVELS, levelAt, mapBoardHtml, mapTargetAtPoint, terrainComposition, viewOrigin, ZOOMS, zoomLabel } from "../src/ui/map";
import { board, glyphsWith, type MapModel } from "./board";
import { newUiState, type UiState } from "../src/ui/render";
import { tipHtml } from "../src/ui/tip";
import { worldCacheStats } from "../src/world/aggregate";
import { frontierRoute, survivorRoute } from "../src/sim/routing";
import { PATCH_M } from "../src/world/spatial";
import { cellAt, neighbours, type World } from "../src/world/gen";
import { passable } from "../src/world/route";
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

let drawn: MapModel;
function draw(world: World, state: GameState, ui: UiState): MapModel {
  document.body.innerHTML = `<div id="map">${mapBoardHtml(world, state, ui, CAL)}</div>`;
  drawn = board(world, state, ui, CAL);
  return drawn;
}

/**
 * A block two glyphs from the survivor that holds ground, in whichever
 * cardinal direction has some. A landing is on a shore, so which side of it
 * is open water belongs to the seed, and a block of nothing but water names
 * no patch to walk to.
 */
function blockNear(world: World, state: GameState, ui: UiState) {
  const l = levelAt(ui.zoom);
  const p = pointOf(world, state, ui, cellOf(state, world));
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const target = mapTargetAtPoint(world, state, ui, p.x + l.px * 2 * dx, p.y + l.line * 2 * dy);
    if (target?.patch != null) return target;
  }
  throw new Error("the survivor has open water on every side");
}

describe("the zoom ladder", () => {
  it("draws every known patch position in a 300m block, without generating unknown ground", () => {
    const { state, world } = newGame(21);
    const ui = open(2);
    const first = board(world, state, ui, CAL);
    const target = first.glyphs.find((g) => g.classes.includes("fog") && g.mapCell !== null && !g.classes.includes("void"))!;
    const x0 = first.x0 + target.gx * 6;
    const y0 = first.y0 + target.gy * 6;
    for (let y = 0; y < 6; y++) {
      for (let x = 0; x < 6; x++) {
        state.knowledge = newKnowledge();
        markKnown(state, (y0 + y) * world.w + x0 + x);
        const before = world.fineChunkBuilds;
        const g = board(world, state, ui, CAL).glyphs[target.gy * first.cols + target.gx];
        expect(g.classes, `known patch ${x},${y}`).toContain("part");
        expect(g.classes).not.toContain("fog");
        expect(world.fineChunkBuilds).toBe(before);
      }
    }
  });
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
    const b = draw(world, state, ui);
    expect(b.glyphs).toHaveLength(72 * 36);
    expect(b.z).toBe(1);
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
    const player = glyphsWith(draw(world, state, ui), "mk-player")[0];
    expect(player.classes[0]).toBe("c");
    expect(player.mapCell).toBe(cellOf(state, world));
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
    // A block two glyphs off, so the answer is not simply the patch they
    // already stand on.
    const target = blockNear(world, state, ui);
    expect(target.aggregate.size).toBe(2);
    expect(target.patch).not.toBeNull();
    // Asked of the sim's own door, which is the one the walk will be planned
    // through: known ground only, under the survivor's ice and fears.
    expect(survivorRoute(state, world, here, target.patch!)).not.toBeNull();
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
    const target = blockNear(world, state, ui);
    expect(target.patch).not.toBeNull();
    ui.destination = target.patch;
    expect(glyphsWith(draw(world, state, ui), "target")).toHaveLength(1);
  });
});

describe("unknown ground", () => {
  it("is drawn as fog without generating the terrain under it", () => {
    const { state, world } = newGame(21);
    // The wide rung spans several thousand patches a glyph. Drawing it must
    // not be what builds them: fog is the answer, and fog has no ground.
    const before = worldCacheStats(world);
    const b = draw(world, state, open(4));
    const after = worldCacheStats(world);
    expect(glyphsWith(b, "fog").length).toBeGreaterThan(2000);
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
    const b = board(world, state, ui, night);
    expect(glyphsWith(b, "lit-0").length).toBeGreaterThan(0);
    expect(glyphsWith(b, "lit-1").length).toBeGreaterThan(0);
    expect(glyphsWith(b, "lit-2").length).toBeGreaterThan(0);
  });

  it("lights the source and spills onto its neighbours at the default rung", () => {
    // The glow footprint, not the fire's visibility: the source pulses and
    // the eight glyphs round it take a weak spill (map.ts, litRings), a
    // soft edge on the pulse rather than lit terrain; a large fire reaches
    // one ring further and no fire reaches past that.
    const { state, world, night } = litCamp();
    const ui = open(DEFAULT_ZOOM);
    const b = board(world, state, ui, night);
    expect(glyphsWith(b, "lit-0").length).toBe(1);
    // Eight neighbours less whatever the board's edge or the void cuts off.
    expect(glyphsWith(b, "lit-1").length).toBeGreaterThanOrEqual(3);
    expect(glyphsWith(b, "lit-1").length).toBeLessThanOrEqual(8);
    expect(glyphsWith(b, "lit-2").length).toBeLessThanOrEqual(16);
  });
});

describe("clicking fog", () => {
  it("resolves a block of nothing but fog to its frontier, so the walk into the dark still works", () => {
    const { state, world } = newGame(21);
    const ui = open(1);
    const here = cellOf(state, world);
    const p = pointOf(world, state, ui, here);
    // The nearest block on the board holding no ground they know. How far
    // out that is, and in which direction, belongs to the seed: what a fresh
    // survivor knows is what the eye reached from the landing, which is a
    // different shape on every shore.
    let target = null;
    const l = levelAt(1);
    const glyphs: Array<{ x: number; y: number; d: number }> = [];
    for (let gy = 0; gy < l.h; gy++) {
      for (let gx = 0; gx < l.w; gx++) {
        const x = (gx + 0.5) * l.px;
        const y = (gy + 0.5) * l.line;
        glyphs.push({ x, y, d: Math.hypot((x - p.x) / l.px, (y - p.y) / l.line) });
      }
    }
    for (const glyph of glyphs.sort((a, b) => a.d - b.d)) {
      const candidate = mapTargetAtPoint(world, state, ui, glyph.x, glyph.y);
      // A frontier is unknown ground a survivor could stand on with known
      // ground they can reach beside it. A block of open water is fog too,
      // and a shore leaves fog on the far side of water that no walk
      // reaches; neither is the step into the dark this case is about.
      if (candidate?.patch == null || isKnown(state, candidate.patch)) continue;
      if (!passable(cellAt(world, candidate.patch).terrain)) continue;
      if (!neighbours(world, candidate.patch).some((cell) => isKnown(state, cell) && survivorRoute(state, world, here, cell) !== null)) continue;
      target = candidate;
      break;
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
    // only thing that could build it is the map drawing it. The fog patches
    // lie on a slant that no sample of a block's knowledge lands on: a block
    // is read at every sixth patch from its third (glyphGround), and the
    // block lattice sits on multiples of eighteen, so a pattern on x + y
    // would put every sample on a fog patch and the whole board in fog.
    for (let y = 1000 - 108; y < 1000 + 108; y++) {
      for (let x = 3300; x < 3516; x++) {
        if ((x + 2 * y) % 6 === 0) continue;
        markKnown(state, x + y * world.w);
      }
    }
    const before = worldCacheStats(world);
    expect(glyphsWith(draw(world, state, open(3)), "!fog", "!void").length).toBeGreaterThan(0);
    const wide = draw(world, state, open(4));
    const after = worldCacheStats(world);
    // Sixteen glyphs of known ground drawn, the partly known blocks round
    // their edge drawn pale, and not one patch of the world behind them
    // built to draw it. Before the parents were gated on knowledge this
    // cost nine chunks and 82,944 generated patches.
    expect(glyphsWith(wide, "!fog", "!void", "!part").length).toBe(16);
    expect(glyphsWith(wide, "part").length).toBeGreaterThan(0);
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
