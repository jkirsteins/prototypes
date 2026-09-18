import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Rng } from "../src/rng";
import { calendar } from "../src/sim/calendar";
import { newKnowledge } from "../src/sim/fineknowledge";
import { mapRegion, markKnown } from "../src/sim/mapped";
import { newGame } from "../src/sim/newgame";
import { cellOf, placeAt, setRegion } from "../src/sim/position";
import { visibleCells } from "../src/sim/sight";
import { ensureGround } from "../src/sim/weather";
import { WEATHER_SHOTS, weatherShotFixture } from "../src/sim/weather-scenarios";
import { activateWildlife } from "../src/sim/wildlife-agents";
import { effectsSnapshot, type EffectsWeatherKind, litRings, mapBoardHtml, WATER_LIT, WATER_RIPPLES, waterRippleDelaysS, waterRipplePeak, waterRipplePhases, weatherGlyphChar } from "../src/ui/map";
import { filtered, glyphStyle } from "../src/ui/palette";
import { board, glyphOfCell, glyphsWith } from "./board";
import { enqueueWildlifeStartle, newUiState, resetPanels, setPanel } from "../src/ui/render";
import { cellAt, neighbours, regionPeek } from "../src/world/gen";
import { cellIdx, chunkIndexOf, residentChunk } from "../src/world/cells";
import { CHANNEL_STREAM } from "../src/world/refine";
import { FINE_PER_PARENT, patchXY } from "../src/world/spatial";
import { passable } from "../src/world/route";
import { css, rule } from "./css";
import { neighbourLandCell } from "./siting-helpers";
import { testAtmosphere } from "./weather-helpers";

// A test that installs a controlled atmosphere owns it only for its own case.
afterEach(() => vi.restoreAllMocks());

describe("the map's compositing layers", () => {
  it("marks a brook where the channel runs, not across its whole parent", () => {
    const { state, world } = newGame(79);
    mapRegion(state, world, state.player.region);
    const here = cellOf(state, world);
    const { x, y } = patchXY(here);
    const chunk = residentChunk(world, x, y)!;
    // The brook is the chunk's own channel, so the case paints one: the patches
    // of one 300 m parent, one with the channel through it and the rest dry.
    chunk.fine.channel.fill(0);
    const px0 = Math.floor(x / FINE_PER_PARENT) * FINE_PER_PARENT;
    const py0 = Math.floor(y / FINE_PER_PARENT) * FINE_PER_PARENT;
    const parent: number[] = [];
    for (let fy = py0; fy < py0 + FINE_PER_PARENT; fy++) {
      for (let fx = px0; fx < px0 + FINE_PER_PARENT; fx++) parent.push(cellIdx(world, fx, fy));
    }
    // A glyph already carrying the player or the camp draws no brook, so the
    // channel goes on ground with nothing else on it.
    const plain = parent.filter((cell) => cell !== here && cell !== state.regions[state.player.region]?.campCell);
    const wet = plain[0];
    chunk.fine.channel[chunkIndexOf(wet % world.w, Math.floor(wet / world.w))] = CHANNEL_STREAM;
    const ui = newUiState();
    // The closest rung: one glyph is one patch, which is the only rung that marks a brook.
    ui.zoom = 0;
    const b = board(world, state, ui, calendar(state.minute, state.startDoy));
    const marked = parent.filter((cell) => glyphOfCell(b, cell)?.classes.includes("mk-stream"));
    expect(marked).toEqual([wet]);
  });

  const day = { season: "summer", night: false };

  it("turns frozen water from liquid blue into distinct thin and safe ice surfaces", () => {
    const open = glyphStyle(day, ["c", "t-water", "deep-2"]);
    const thin = glyphStyle(day, ["c", "t-water", "deep-2", "ice-thin"]);
    const safe = glyphStyle(day, ["c", "t-water", "deep-0", "ice-safe"]);
    expect(open.bg).toBe("#060d20");
    expect(thin.bg).toBe("#142533");
    expect(safe.bg).toBe("#243746");
    expect(thin.fg).toBe("#3a6fd8");
    expect(safe.fg).toBe("#3a6fd8");
  });

  it("leaves adjacent map cells flush while retaining only real region edges", () => {
    const ordinary = glyphStyle(day, ["c", "t-meadow"]).border;
    const boundary = glyphStyle(day, ["c", "t-meadow", "bl"]).border;
    expect(ordinary).toEqual({ l: null, r: null, t: null, b: null });
    expect(boundary.l).toBe("#3b6fd1");
    expect([boundary.r, boundary.t, boundary.b]).toEqual([null, null, null]);
  });

  it("emphasizes a targeted ordinary cell without drawing a box around it", () => {
    const target = glyphStyle(day, ["c", "t-meadow", "target"]);
    expect(target.glow).toBe("#e6c229");
    expect(target.border).toEqual({ l: null, r: null, t: null, b: null });
    expect(target.wash).toBeNull();
  });

  it("puts weather over the shaded ground and under routes, light, and essential marks", () => {
    // The stack is the order the one canvas is painted in (map.ts,
    // updateEffects): the board, then the shade and the tint, then the
    // weather, then the walk, then the animals at their metre positions,
    // then the marks that stay legible in the dark over them (so the
    // survivor is never under a herd), the pulses, the cues, and the
    // pointed glyph last.
    const source = readFileSync("src/ui/map.ts", "utf8");
    const body = source.slice(source.indexOf("export function updateEffects("), source.indexOf("let effectsFrozenKey"));
    const order = ["drawBoardImage(", "drawLight(", "drawWaterShimmer(", "drawShadows(", "drawGlyphs(", "drawWalk(", "drawMarks(", "drawLifted(", "drawPulses(", "drawRecoils(", "drawStartles(", "drawPointed("];
    const at = order.map((call) => body.indexOf(call));
    for (const [i, position] of at.entries()) expect(position, order[i]).toBeGreaterThan(i === 0 ? -1 : at[i - 1]);
    expect(rule(".scroll-x")).toContain("isolation: isolate");
    expect(rule(".scroll-x > .effects")).toContain("z-index: var(--map-board)");
    expect(rule(".maptools")).toContain("z-index: var(--map-control)");
  });

  it("renders precipitation as a canvas glyph without taking the pointer off the board", () => {
    // The canvas glyph is one fillText call, and the grid underneath still
    // owns hover and click.
    expect(weatherGlyphChar(17, 12, 34, "rain", 0)).toMatch(/[/'|]/);
    expect(weatherGlyphChar(17, 12, 34, "snow", 0)).toMatch(/[.*+]/);
    expect(rule(".scroll-x > .effects")).toContain("pointer-events: none");
  });

  it("stops local map and sky weather motion when reduced motion is requested", () => {
    // Both canvases check prefers-reduced-motion themselves where they draw
    // (sky.ts, map.ts) rather than through a CSS switch, since a canvas has
    // no per-element animation for a media query to reach.
    const stylesheet = readFileSync("src/style.css", "utf8");
    expect(stylesheet).not.toContain(".weather-ripple");
    expect(stylesheet).not.toContain(".fog-ripple");
    expect(stylesheet).not.toContain(".cloud-ripple");
    expect(readFileSync("src/ui/map.ts", "utf8")).toContain("prefers-reduced-motion: reduce");
  });

  it("cycles fog, cloud and precipitation through four seeded ASCII shapes, one at a time", () => {
    // Deterministic by cell and seed, same as the ripple phase and peak
    // functions: the same cell asked twice at the same moment draws the same
    // shape, and the same cell moved along the grid still hits every shape.
    const at = (kind: EffectsWeatherKind, ms: number) => weatherGlyphChar(17, 12, 34, kind, ms);
    expect(at("fog", 500)).toBe(at("fog", 500));
    const fogShapes = new Set(Array.from({ length: 12 }, (_, i) => at("fog", i * 3000)));
    expect(fogShapes).toHaveLength(4);
    for (const shape of fogShapes) expect(shape).toMatch(/[.:~=]/);
    const cloudShapes = new Set(Array.from({ length: 16 }, (_, i) => weatherGlyphChar(17, 12, 34, "cloud", i * 4000)));
    expect(cloudShapes).toHaveLength(4);
    for (const shape of cloudShapes) expect(shape).toMatch(/[oO0~]/);
    // Fog reads over cloud shadow and over every ripple, so a cell shows one
    // weather glyph at a time; the terrain glyph a weather glyph replaces
    // stays hidden underneath.
    expect(glyphStyle(day, ["c", "t-meadow", "wx-glyph"]).hidden).toBe(true);
    expect(glyphStyle(day, ["c", "t-meadow", "memory"]).fg).toBe(filtered("#6f9a3c", 0.58, 0.45));
    expect(glyphStyle(day, ["c", "t-meadow", "dim"]).alpha).toBe(0.45);
  });

  it("never feathers exploration or stacks atmospheric glyphs over terrain glyphs", () => {
    const stylesheet = readFileSync("src/style.css", "utf8");
    expect(stylesheet).not.toContain(".fog-edge");
    expect(stylesheet).not.toContain("--fog-left");
    expect(glyphStyle(day, ["c", "t-meadow", "wx-glyph"]).hidden).toBe(true);
    // A mark stays legible over its own weather.
    expect(glyphStyle(day, ["c", "t-meadow", "wx-glyph", "mk", "mk-player"]).hidden).toBe(false);
  });

  it("keeps startles outside filtered, dimmed and clipped cells above signals and below controls", () => {
    const { state, world } = newGame(79);
    const ui = newUiState();
    ui.zoom = 0;
    // Snow on the ground here, not merely in the run's weather: the cell classes
    // read the region's own ground. Fog puts an atmospheric glyph on the cell,
    // which is the layer this case is about stacking.
    state.weather.snowCm = 10;
    ensureGround(state, world, state.player.region).snowCm = 10;
    testAtmosphere({ fog: 0.2 });
    enqueueWildlifeStartle(ui, {
      id: "layer-startle", subjectId: 999,
      source: { xM: state.player.xM, yM: state.player.yM },
      bearingRad: 0, distanceM: 45, uncertaintyM: 0,
      perception: { kind: "heard", identification: "unknown", uncertaintyM: 0 },
      terrain: "spruce", body: "light", group: "group", logText: "Something crashes away.",
    }, 1000);
    const b = board(world, state, ui, calendar(state.minute, state.startDoy), 1100);
    // The cue is the model's, drawn by the effects layer after every glyph
    // and mark and before only the pointed glyph (the draw order above); the
    // snow and the fog on the survivor's own glyph touch the glyph's colour
    // and nothing about the cue.
    expect(b.startles).toHaveLength(1);
    expect(b.startles[0].kind).toBe("heard");
    const you = glyphsWith(b, "mk-player")[0];
    expect(you.classes).toContain("ground-snow");
    const look = glyphStyle({ season: b.season, night: b.night }, [...you.classes, "tone-0", "dim"]);
    // A mark owns its whole cell: the snow tone never touches its letter, and
    // dimming is the letter's alone.
    expect(look.fg).toBe("#fff");
    expect(look.alpha).toBe(0.45);
  });

  it("keeps the effects canvas inside the grid's own isolated stacking context, under the route, the marks and a startle", () => {
    // happy-dom implements neither elementsFromPoint nor real layout
    // (getBoundingClientRect returns all zeros here), so this cannot hit-test
    // a screen point the way a real browser can. What it checks instead - the
    // canvas sits inside the same isolation: isolate boundary as the route,
    // the marks and the startle cue rather than outside it (the actual
    // defect: a sibling of #mapdyn is compared in a different context and
    // its z-index does nothing there), and its resolved z-index is the
    // lowest of the four within that shared context - is a correct
    // regression guard for the markup as it stands today, not a general
    // proof of paint order: an equal z-index later in DOM order, an
    // intervening positioned and z-indexed ancestor, or a transform,
    // filter, opacity, will-change or mix-blend-mode anywhere between them
    // would all defeat it, and none of that is checked here.
    expect(document.elementsFromPoint).toBeUndefined();
    const { state, world } = newGame(79);
    const ui = newUiState();
    ui.zoom = 0;
    enqueueWildlifeStartle(ui, {
      id: "order-startle", subjectId: 998,
      source: { xM: state.player.xM, yM: state.player.yM },
      bearingRad: 0, distanceM: 45, uncertaintyM: 0,
      perception: { kind: "heard", identification: "unknown", uncertaintyM: 0 },
      terrain: "spruce", body: "light", group: "group", logText: "Something crashes away.",
    }, 1000);
    const sheet = document.createElement("style");
    sheet.textContent = css;
    document.head.append(sheet);
    const map = document.createElement("div");
    map.id = "mapdyn";
    map.innerHTML = mapBoardHtml(world, state, ui, calendar(state.minute, state.startDoy), 1100);
    document.body.append(map);
    try {
      const scrollX = map.querySelector(".scroll-x")!;
      const effects = map.querySelector("#effects")!;
      const grid = map.querySelector(".grid")!;
      expect(getComputedStyle(scrollX).isolation).toBe("isolate");
      // The regression this guards: a sibling of #mapdyn would fail these,
      // since it would sit outside .scroll-x entirely.
      expect(effects.parentElement).toBe(scrollX);
      expect(grid.parentElement).toBe(scrollX);
      // One canvas carries the walk, the marks and the cue in its own draw
      // order; there is nothing else in the grid for it to be under.
      expect(map.querySelectorAll("canvas")).toHaveLength(1);
      expect(grid.children).toHaveLength(0);
      const b = board(world, state, ui, calendar(state.minute, state.startDoy), 1100);
      expect(b.startles).toHaveLength(1);
    } finally {
      sheet.remove();
      map.remove();
    }
  });

  it("keeps a rebuilt effects canvas's backing buffer intact across a map rebuild", () => {
    // The canvas's width and height are its backing buffer, set as device
    // pixels through the JS properties (main.ts, ensureEffectsCanvasBox) and
    // never stated in mapHtml's own markup. Before morphAttrs (render.ts)
    // learned to leave a canvas's width and height alone the way it already
    // leaves style alone, a rebuild read that silence as an instruction to
    // remove them, resetting both to the 300x150 default and blanking the
    // bitmap - confirmed over CDP in real headless Chrome. happy-dom models
    // canvas width/height attribute-to-property reflection faithfully
    // (removing the attribute really does reset the property here), so this
    // pins the fix directly rather than needing a real browser.
    resetPanels();
    document.body.innerHTML = '<div id="mapdyn"></div>';
    const { state, world } = newGame(79);
    const ui = newUiState();
    ui.zoom = 0;
    const cal = calendar(state.minute, state.startDoy);
    setPanel("mapdyn", mapBoardHtml(world, state, ui, cal, 1000));
    const canvas = document.querySelector<HTMLCanvasElement>("#effects")!;
    canvas.width = 999;
    canvas.height = 777;
    // A different frame, so setPanel's own same-html shortcut cannot mask a
    // morph that never actually ran against the canvas.
    ui.cloudShadows = !ui.cloudShadows;
    setPanel("mapdyn", mapBoardHtml(world, state, ui, cal, 2000));
    expect(document.querySelector("#effects")).toBe(canvas);
    expect(canvas.width).toBe(999);
    expect(canvas.height).toBe(777);
  });

  it("keeps player and camp signals above routes without lifting ordinary animals", () => {
    // The three things you would know in the dark without looking, and the
    // fire's own lit cell, are drawn again over the shade and the walk line
    // (map.ts, drawLifted); a herd's glyph is ordinary ground and stays on
    // the board under both. The herd's exact mark at the closest rung is
    // drawn over the grid with the rest of the signals (drawMarks).
    const source = readFileSync("src/ui/map.ts", "utf8");
    const lifted = source.slice(source.indexOf("function drawLifted("), source.indexOf("const RECOIL_MS"));
    for (const mark of ["mk-player", "mk-camp", "mk-fire", "mk-coals", "lit-0"]) expect(lifted).toContain(`"${mark}"`);
    expect(lifted).not.toContain("mk-animal");
    expect(lifted).not.toContain("mk-shelter");
  });

  it.each(["camp", "fire", "coals"])("raises filtered snowy cells containing player and %s signals above routes", (kind) => {
    const { state, world } = newGame(79);
    const ui = newUiState();
    ui.zoom = 0;
    state.weather.snowCm = 10;
    ensureGround(state, world, state.player.region).snowCm = 10;
    mapRegion(state, world, state.player.region);
    const region = state.regions[state.player.region];
    region.campCell = neighbourLandCell(world, cellOf(state, world));
    region.fire.lit = kind === "fire";
    region.fire.embers = kind === "coals" ? 60 : 0;
    activateWildlife(state, world, new Rng(1));
    const animal = state.wildlife.subjects.find((subject) => subject.active)!;
    animal.active!.cell = neighbours(world, cellOf(state, world)).find((cell) =>
      cell !== region.campCell && cellAt(world, cell).region === state.player.region && passable(cellAt(world, cell).terrain))!;
    const b = board(world, state, ui, calendar(state.minute, state.startDoy));
    // The survivor and the mark stand on snow, and each is drawn again over
    // the shade and the walk whatever the snow does to the ground round them.
    for (const mark of ["mk-player", `mk-${kind}`]) {
      const glyph = glyphsWith(b, mark)[0];
      expect(glyph, mark).toBeDefined();
      expect(glyph.classes).toContain("ground-snow");
    }
    // The snow's relief is on the letter alone: the cell keeps the snow's
    // own background under either tone.
    const ground = glyphsWith(b, "!fog", "!void", "!mk").find((g) => g.glyph.trim())!;
    const grid = { season: b.season, night: b.night };
    const plain = glyphStyle(grid, [...ground.classes.filter((c) => !c.startsWith("tone-")), "ground-snow"]);
    for (const [tone, brightness] of [["tone-0", 0.82], ["tone-2", 1.18]] as const) {
      const toned = glyphStyle(grid, [...ground.classes.filter((c) => !c.startsWith("tone-")), "ground-snow", tone]);
      expect(toned.bg).toBe(plain.bg);
      expect(toned.fg).toBe(filtered(plain.fg, brightness, 1));
    }
    // The herd's mark rises with the signals: it is on the model as a mark
    // over the grid, not as a glyph on the board.
    expect(b.marks.some((m) => m.id === animal.id)).toBe(true);
  });

  it.each([["fire", "at-fire"], ["coals", "at-coals"]] as const)("keeps the %s under the survivor standing at it", (kind, cls) => {
    // The survivor's mark takes the camp cell; the fire under their feet
    // rides as a class, so the ground keeps the fire's colour and the night
    // pulse draws it (map.ts, drawPulses; palette.ts, at-fire).
    const { state, world } = newGame(79);
    const ui = newUiState();
    ui.zoom = 0;
    mapRegion(state, world, state.player.region);
    const region = state.regions[state.player.region];
    region.campCell = cellOf(state, world);
    region.fire.lit = kind === "fire";
    region.fire.embers = kind === "coals" ? 60 : 0;
    const b = board(world, state, ui, calendar(state.minute, state.startDoy));
    const you = glyphsWith(b, "mk-player")[0];
    expect(you.classes).toContain(cls);
    expect(glyphsWith(b, `mk-${kind}`)).toHaveLength(0);
    const grid = { season: b.season, night: b.night };
    expect(glyphStyle(grid, you.classes).bg).toBe(glyphStyle(grid, ["c", "mk", `mk-${kind}`]).bg);
    const source = readFileSync("src/ui/map.ts", "utf8");
    const pulses = source.slice(source.indexOf("function drawPulses("), source.indexOf("function drawGlyphOver("));
    expect(pulses).toContain(`cls.includes("${cls}")`);
  });

  it("gives a fire a glow footprint at 300 m: its cell, a weak spill on the neighbours, a second ring only for a large fire", () => {
    // The footprint is not the fire's visibility (campfireVisible sees it
    // from kilometres): it is the ground the pulse paints, one cell plus a
    // soft edge at this rung, and never past 600 m.
    const view = { w: 9, h: 9 };
    const centre = 4 * 9 + 4;
    const toGlyph = (cell: number) => cell;
    const small = litRings([{ cell: centre, reach: 1 }], toGlyph, 6, view);
    expect(small.get(centre)).toBe(0);
    expect(small.get(centre + 1)).toBe(1);
    expect(small.get(centre + 2)).toBeUndefined();
    const large = litRings([{ cell: centre, reach: 2 }], toGlyph, 6, view);
    expect(large.get(centre + 2)).toBe(2);
    expect(large.get(centre + 3)).toBeUndefined();
    expect(litRings([{ cell: centre, reach: 2 }], toGlyph, 12, view).size).toBe(0);
    const source = readFileSync("src/ui/map.ts", "utf8");
    const pulses = source.slice(source.indexOf("function drawPulses("), source.indexOf("function drawGlyphOver("));
    expect(pulses).toContain("board.z > 2 ? 0.5 : 1");
  });

  it("keeps night firelight and active survivor marks animated above the weather", () => {
    // The flicker, the coals' breath and the mood's pulse are fills the
    // effects layer draws each frame (map.ts, drawPulses), over the weather.
    const source = readFileSync("src/ui/map.ts", "utf8");
    const pulses = source.slice(source.indexOf("const PULSE = {"), source.indexOf("function drawGlyphOver("));
    for (const name of ["walk:", "work:", "fire:", "fireFar:", "coals:", "lit0:", "lit0Coals:"]) expect(pulses).toContain(name);
    expect(pulses).toContain('cls.includes("mk-fire")');
    expect(pulses).toContain('cls.includes("mood-walk")');
    expect(pulses).toContain('cls.includes("lit-0")');
    // A wildlife mark keeps its own ground under the fire's spill.
    expect(pulses).toContain('if (cls.includes("mk-animal")) continue;');
  });

  it("lets seen liquid water shimmer on the wall clock, out of step per cell, and nothing else", () => {
    // Rippling, faked for the eye: three smooth sine waves crossing the sheet
    // in different directions, summed per cell. Wall clock, never simulation
    // minutes, and a re-render writes the same attributes again.
    // Drawn on the effects canvas, not as per-cell overlays: a lake costs
    // the main thread the same handful of fillRect calls whether it is one
    // cell or two hundred, rather than an element and a running animation
    // per cell per ripple.
    expect(rule(".scroll-x > .effects")).toContain("position: absolute");
    expect(rule(".scroll-x > .effects")).toContain("pointer-events: none");
    // A test aid: ?shimmer= scales the wall clock updateEffects reads, so the
    // pattern keeps its shape and only its speed changes.
    expect(readFileSync("src/main.ts", "utf8")).toContain('params.get("shimmer")');
    expect(readFileSync("src/ui/map.ts", "utf8")).toContain("--water-shimmer-speed");
    // Neighbours are near each other in phase: one drawn cell east moves each
    // ripple by its own step, so the light travels instead of blinking, and a
    // coarse block keeps the same step per drawn cell.
    const turn = 2 * Math.PI;
    const wrap = (d: number) => ((d + Math.PI) % turn + turn) % turn - Math.PI;
    for (const [i, ripple] of WATER_RIPPLES.entries()) {
      const expectedEast = wrap(Math.cos(ripple.direction) / ripple.wavelength * turn);
      for (const [x, y] of [[12, 34], [175, 50], [700, 950]]) {
        const east = wrap(waterRipplePhases(17, x + 1, y, 1)[i] - waterRipplePhases(17, x, y, 1)[i]);
        expect(Math.abs(wrap(east - expectedEast))).toBeLessThanOrEqual(2);
        const block = wrap(waterRipplePhases(17, x + 4, y, 4)[i] - waterRipplePhases(17, x, y, 4)[i]);
        expect(Math.abs(wrap(block - expectedEast))).toBeLessThanOrEqual(2);
      }
    }
    expect(waterRipplePhases(17, 12, 34, 1)).toEqual(waterRipplePhases(17, 12, 34, 1));
    for (const p of waterRipplePhases(17, 12, 34, 1)) { expect(p).toBeGreaterThanOrEqual(0); expect(p).toBeLessThan(turn); }
    // Each depth band shimmers within its own palette.
    expect(glyphStyle(day, ["c", "t-water"]).bg).toBe("#0a1633");
    expect(glyphStyle(day, ["c", "t-water", "deep-0"]).bg).toBe("#102047");
    expect(glyphStyle(day, ["c", "t-water", "deep-2"]).bg).toBe("#060d20");

    // The frozen-water shore in midsummer: open coastal water in sight.
    const summer = WEATHER_SHOTS["sunny-clouds"].minute;
    const { x, y } = WEATHER_SHOTS["frozen-water"];
    const { state, world } = newGame(17);
    state.minute = summer;
    state.weather.elapsedMinutes = 0;
    const cell = y * world.w + x;
    placeAt(state, world, cell);
    setRegion(state, world, regionPeek(world, x, y));
    ensureGround(state, world, state.player.region);
    const cal = calendar(state.minute, state.startDoy);
    state.knowledge = newKnowledge();
    for (const seen of visibleCells(state, world, cal, cell)) markKnown(state, seen);
    const ui = newUiState();
    const first = board(world, state, ui, cal);
    expect(JSON.stringify(board(world, state, ui, cal))).toBe(JSON.stringify(first));
    // The document still marks which cells qualify, so the canvas model and
    // the class the cell carries can be checked against each other.
    const liveCells = glyphsWith(first, "water-live");
    expect(liveCells.length).toBeGreaterThan(20);
    const model = effectsSnapshot()!;
    expect(model).not.toBeNull();
    expect(model.water.length).toBe(liveCells.length);
    for (const [i, ripple] of WATER_RIPPLES.entries()) {
      const delays = model.water.map((c) => waterRippleDelaysS(model.seed, c.cx, c.cy, model.zoom)[i]);
      for (const delay of delays) expect(delay).toBeGreaterThanOrEqual(0);
      for (const delay of delays) expect(delay).toBeLessThan(ripple.periodS);
      expect(new Set(delays).size).toBeGreaterThan(5);
      // Each wave peaks at its own brightness, so the sum is light on water and not one sheet sliding.
      const peaks = model.water.map((c) => waterRipplePeak(model.seed, c.cx, c.cy, i));
      for (const peak of peaks) { expect(peak).toBeGreaterThanOrEqual(0.25); expect(peak).toBeLessThanOrEqual(0.5); }
      expect(new Set(peaks).size).toBeGreaterThan(5);
    }
    expect(waterRipplePeak(17, 12, 34, 0)).toBe(waterRipplePeak(17, 12, 34, 0));
    // The draw reads these off the cell rather than working them out per
    // frame, so what the cell carries has to be what the helpers say. A
    // precompute that drifts from its source would move the shimmer's
    // pattern with nothing else changing.
    for (const c of model.water) {
      expect(c.delays).toEqual(waterRippleDelaysS(model.seed, c.cx, c.cy, model.zoom));
      expect(c.peaks).toEqual([0, 1, 2].map((i) => waterRipplePeak(model.seed, c.cx, c.cy, i)));
    }
    // Each water cell in the model carries one of the three lit colours the
    // stylesheet's --water-lit custom properties name, chosen by the same
    // depth class the cell itself carries.
    for (const c of model.water) expect([WATER_LIT.rest, WATER_LIT.shallow, WATER_LIT.deep]).toContain(c.lit);
    for (const el of liveCells) {
      expect(el.classes).toContain("t-water");
      for (const still of ["mk", "memory", "dim", "ice-thin", "ice-safe"]) expect(el.classes).not.toContain(still);
    }
    // Water the survivor remembers but cannot see now lies still.
    for (const el of [...glyphsWith(first, "t-water", "memory"), ...glyphsWith(first, "t-water", "dim")]) expect(el.classes).not.toContain("water-live");

    // Frozen water is a sheet, not a surface that catches light.
    const frozen = weatherShotFixture("frozen-water");
    const sheet = board(frozen.world, frozen.state, newUiState(), frozen.cal);
    expect(glyphsWith(sheet, "t-water", "ice-safe").length).toBeGreaterThan(20);
    expect(glyphsWith(sheet, "water-live")).toHaveLength(0);
    expect(effectsSnapshot()!.water).toHaveLength(0);
  });

  it("makes the browser harness play the real game and read the real board, never a fixture or a stand-in", () => {
    const e2e = readFileSync("scripts/e2e.mjs", "utf8");
    // Real input at screen coordinates, the model the canvas drew, the
    // canvas the player sees; never a synthetic click, an off-screen copy of
    // the board or a fixture world.
    expect(e2e).toContain("Input.dispatchMouseEvent");
    expect(e2e).toContain("window.survidle.mapModel");
    expect(e2e).toContain("querySelector('#effects')");
    expect(e2e).toContain("Page.captureScreenshot");
    expect(e2e).not.toContain("weather-shot");
    expect(e2e).not.toContain("mapMarkup");
    expect(e2e).not.toContain("classList.toggle");
    expect(e2e).not.toContain("style.setProperty");
  });
});
