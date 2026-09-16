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
import { effectsSnapshot, type EffectsWeatherKind, mapHtml, WATER_LIT, WATER_RIPPLES, waterRippleDelaysS, waterRipplePeak, waterRipplePhases, weatherGlyphChar } from "../src/ui/map";
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
    const map = document.createElement("div");
    map.id = "mapdyn";
    map.innerHTML = mapHtml(world, state, ui, calendar(state.minute, state.startDoy));
    document.body.append(map);
    try {
      const marked = parent.filter((cell) => map.querySelector(`[data-map-cell="${cell}"]`)?.classList.contains("mk-stream"));
      expect(marked).toEqual([wet]);
    } finally {
      map.remove();
    }
  });

  it("turns frozen water from liquid blue into distinct thin and safe ice surfaces", () => {
    const sheet = document.createElement("style");
    sheet.textContent = css;
    document.head.append(sheet);
    const map = document.createElement("div");
    map.id = "mapdyn";
    map.innerHTML = `<div class="grid">
      <span class="c t-water deep-2">~</span>
      <span class="c t-water deep-2 ice-thin">~</span>
      <span class="c t-water deep-0 ice-safe">~</span>
    </div>`;
    document.body.append(map);
    try {
      const [open, thin, safe] = [...map.querySelectorAll(".c")].map((cell) => getComputedStyle(cell));
      expect(open.backgroundColor).toBe("#060d20");
      expect(thin.backgroundColor).toBe("#142533");
      expect(safe.backgroundColor).toBe("#243746");
      expect(thin.color).toBe("#3a6fd8");
      expect(safe.color).toBe("#3a6fd8");
    } finally {
      sheet.remove();
      map.remove();
    }
  });

  it("leaves adjacent map cells flush while retaining only real region edges", () => {
    const sheet = document.createElement("style");
    sheet.textContent = css;
    document.head.append(sheet);
    const map = document.createElement("div");
    map.id = "mapdyn";
    map.innerHTML = '<div class="scroll-x"><div class="grid"><span class="c t-meadow"></span><span class="c t-meadow bl"></span></div></div>';
    document.body.append(map);
    try {
      const [ordinary, boundary] = [...map.querySelectorAll(".c")];
      const widths = (cell: Element) => {
        const style = getComputedStyle(cell);
        return [style.borderTopWidth, style.borderRightWidth, style.borderBottomWidth, style.borderLeftWidth];
      };
      expect(widths(ordinary)).toEqual(["0px", "0px", "0px", "0px"]);
      expect(widths(boundary)).toEqual(["0px", "0px", "0px", "1px"]);
    } finally {
      sheet.remove();
      map.remove();
    }
  });

  it("emphasizes a targeted ordinary cell without drawing a box around it", () => {
    const sheet = document.createElement("style");
    sheet.textContent = css;
    document.head.append(sheet);
    const map = document.createElement("div");
    map.id = "mapdyn";
    map.innerHTML = '<div class="grid"><span class="c t-meadow target" tabindex="0"><span class="cell-ground">.</span></span></div>';
    document.body.append(map);
    try {
      const target = map.querySelector(".target")!;
      expect(getComputedStyle(target).outlineStyle).toBe("none");
      expect(getComputedStyle(target).textShadow).not.toBe("none");
    } finally {
      sheet.remove();
      map.remove();
    }
  });

  it("puts weather over the shaded ground and under routes, light, and essential marks", () => {
    const viewport = rule(".scroll-x");
    const layers = rule("#mapdyn");
    expect(viewport).toContain("isolation: isolate");
    for (const layer of ["ground: 0", "shade: 1", "weather: 2", "route: 3", "signal: 4", "startle: 5", "control: 6"]) {
      expect(layers).toContain(`--map-${layer}`);
    }

    expect(rule(".scroll-x > .shade")).toContain("z-index: var(--map-shade)");
    expect(rule(".scroll-x::after")).toContain("z-index: var(--map-shade)");
    expect(rule(".scroll-x::before")).toContain("z-index: var(--map-weather)");
    expect(rule(".scroll-x::before")).toContain("pointer-events: none");
    expect(rule(".grid .walk")).toContain("z-index: var(--map-route)");
    expect(rule(".grid .c.mk-player, .grid .c.mk-camp, .grid .c.mk-fire, .grid .c.mk-coals"))
      .toContain("z-index: var(--map-signal)");
    expect(rule(".grid.night .c.lit-1::after, .grid.night .c.lit-2::after"))
      .toContain("z-index: var(--map-signal)");
    expect(rule(".maptools")).toContain("z-index: var(--map-control)");
  });

  it("renders precipitation as a canvas glyph without taking the pointer off the cell", () => {
    // No more markup, so no more gradients or borders to rule out on it; the
    // canvas glyph is one fillText call, and the cell underneath still owns
    // hover and click.
    expect(weatherGlyphChar(17, 12, 34, "rain", 0)).toMatch(/[/'|]/);
    expect(weatherGlyphChar(17, 12, 34, "snow", 0)).toMatch(/[.*+]/);
    expect(rule(".grid .c.wx-cloud, .grid .c.wx-fog, .grid .c.wx-rain, .grid .c.wx-snowing"))
      .toContain("pointer-events: auto");
    expect(rule(".scroll-x > .effects")).toContain("pointer-events: none");
    expect(rule(".grid .c .cell-signal")).toContain("z-index: var(--map-signal)");
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
    expect(rule(".grid .c.wx-glyph:not(.mk) > .cell-ground > .terrain-visual")).toContain("visibility: hidden");
    expect(rule(".grid .c.memory > .cell-ground, .grid .c.memory > .cell-signal"))
      .toContain("filter: brightness(0.58) saturate(0.45)");
    expect(rule(".grid .c.dim > .cell-ground, .grid .c.dim > .cell-signal"))
      .toContain("opacity: 0.45");
  });

  it("never feathers exploration or stacks atmospheric glyphs over terrain glyphs", () => {
    const stylesheet = readFileSync("src/style.css", "utf8");
    expect(stylesheet).not.toContain(".fog-edge");
    expect(stylesheet).not.toContain("--fog-left");
    expect(rule(".grid .c.wx-glyph:not(.mk) > .cell-ground > .terrain-visual"))
      .toContain("visibility: hidden");
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
    const sheet = document.createElement("style");
    sheet.textContent = css;
    document.head.append(sheet);
    const map = document.createElement("div");
    map.id = "mapdyn";
    map.innerHTML = mapHtml(world, state, ui, calendar(state.minute, state.startDoy), 1100);
    document.body.append(map);
    try {
      const cue = map.querySelector(".wildlife-startle")!;
      // At the closest rung the survivor's glyph is the cell, so the filters
      // and the dimming ride on the cell and its own signal, not on a mark
      // nested inside it.
      const source = map.querySelector(".mk-player")!;
      const player = source.querySelector(".cell-signal")!;
      source.classList.add("tone-0", "dim");
      const z = (element: Element) => Number(getComputedStyle(element).zIndex);
      expect(getComputedStyle(source).filter).toBe("");
      expect(getComputedStyle(source).opacity).toBe("");
      expect(getComputedStyle(player).opacity).toBe("0.45");
      expect(cue.parentElement).toBe(map.querySelector(".grid"));
      expect(z(cue)).toBeGreaterThan(z(player));
      expect(z(cue)).toBeGreaterThan(z(map.querySelector(".walk")!));
      expect(z(cue)).toBeLessThan(z(map.querySelector(".maptools")!));
      expect(getComputedStyle(cue).pointerEvents).toBe("none");
    } finally {
      sheet.remove();
      map.remove();
    }
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
    map.innerHTML = mapHtml(world, state, ui, calendar(state.minute, state.startDoy), 1100);
    document.body.append(map);
    try {
      const scrollX = map.querySelector(".scroll-x")!;
      const effects = map.querySelector("#effects")!;
      const grid = map.querySelector(".grid")!;
      const walk = map.querySelector(".walk")!;
      const player = map.querySelector(".mk-player")!;
      const startle = map.querySelector(".wildlife-startle")!;
      expect(getComputedStyle(scrollX).isolation).toBe("isolate");
      // The regression this guards: a sibling of #mapdyn would fail every
      // one of these three, since it would sit outside .scroll-x entirely.
      expect(effects.parentElement).toBe(scrollX);
      expect(grid.parentElement).toBe(scrollX);
      expect(walk.parentElement).toBe(grid);
      expect(startle.parentElement).toBe(grid);
      const z = (element: Element) => Number(getComputedStyle(element).zIndex);
      expect(z(effects)).toBeLessThan(z(walk));
      expect(z(walk)).toBeLessThan(z(player));
      expect(z(player)).toBeLessThan(z(startle));
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
    setPanel("mapdyn", mapHtml(world, state, ui, cal, 1000));
    const canvas = document.querySelector<HTMLCanvasElement>("#effects")!;
    canvas.width = 999;
    canvas.height = 777;
    // A different frame, so setPanel's own same-html shortcut cannot mask a
    // morph that never actually ran against the canvas.
    ui.cloudShadows = !ui.cloudShadows;
    setPanel("mapdyn", mapHtml(world, state, ui, cal, 2000));
    expect(document.querySelector("#effects")).toBe(canvas);
    expect(canvas.width).toBe(999);
    expect(canvas.height).toBe(777);
  });

  it("keeps player and camp signals above routes without lifting ordinary animals", () => {
    const sheet = document.createElement("style");
    sheet.textContent = css;
    document.head.append(sheet);
    const map = document.createElement("div");
    map.id = "mapdyn";
    // The three things you would know in the dark without looking sit above
    // the walk line; a herd's glyph is ordinary ground and passes under it.
    // The herd's exact mark at the closest rung is laid over the grid, so it
    // rises with the rest of the signals.
    map.innerHTML = '<div class="scroll-x"><div class="grid fine">'
      + '<span class="c mk mk-player"></span><span class="c mk mk-camp"></span><span class="c mk mk-fire"></span>'
      + '<span class="c mk mk-coals"></span><span class="c mk mk-animal"></span>'
      + '<svg class="walk"></svg><b class="micro-mark wildlife-map-mark mk-animal"></b><i class="wildlife-startle"></i></div></div>';
    document.body.append(map);
    try {
      const z = (selector: string) => Number(getComputedStyle(map.querySelector(selector)!).zIndex);
      const route = z(".walk");
      for (const signal of [".c.mk-player", ".c.mk-camp", ".c.mk-fire", ".c.mk-coals"]) {
        expect(z(signal)).toBeGreaterThan(route);
        expect(z(signal)).toBeLessThan(z(".wildlife-startle"));
      }
      expect(z(".c.mk-animal")).toBeLessThan(route);
      expect(z(".micro-mark.mk-animal")).toBeGreaterThan(route);
    } finally {
      sheet.remove();
      map.remove();
    }
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
    const sheet = document.createElement("style");
    sheet.textContent = css;
    document.head.append(sheet);
    const map = document.createElement("div");
    map.id = "mapdyn";
    map.innerHTML = mapHtml(world, state, ui, calendar(state.minute, state.startDoy));
    document.body.append(map);
    try {
      const route = Number(getComputedStyle(map.querySelector(".walk")!).zIndex);
      // A glyph carrying one of the three essential marks rises above the
      // walk line whatever the snow is doing to the ground around it.
      for (const selector of [".c.mk-player", `.c.mk-${kind}`]) {
        const cell = map.querySelector(selector)!;
        expect(Number(getComputedStyle(cell).zIndex)).toBeGreaterThan(route);
      }
      // Exercise both snow filters on real map markup, on ground carrying no
      // mark: a mark's glyph draws a letter and not the ground under it.
      const terrainCell = [...map.querySelectorAll(".c:not(.fog):not(.void):not(.mk)")]
        .find((cell) => cell.querySelector(".terrain-visual"))!;
      terrainCell.classList.add("ground-snow");
      for (const [tone, filter] of [["tone-0", "brightness(0.82)"], ["tone-2", "brightness(1.18)"]]) {
        terrainCell.classList.remove("tone-0", "tone-2");
        terrainCell.classList.add(tone);
        expect(getComputedStyle(terrainCell).filter).toBe("");
        expect(getComputedStyle(terrainCell.querySelector(".terrain-visual")!).filter).toBe(filter);
      }
      const animalMark = map.querySelector(`[data-wildlife-id="${animal.id}"]`)!;
      expect(Number(getComputedStyle(animalMark).zIndex)).toBeGreaterThan(route);
      expect(Number(getComputedStyle(terrainCell).zIndex)).toBeLessThan(route);
    } finally {
      sheet.remove();
      map.remove();
    }
  });

  it("keeps night firelight and active survivor marks animated above the weather", () => {
    expect(rule(".grid.night .c.mk-fire")).toContain("animation: flicker");
    expect(rule(".grid.night .c.lit-0")).toContain("z-index: var(--map-signal)");
    expect(rule(".grid.night .c.lit-0")).toContain("animation: flicker");
    expect(rule(".grid .c.mk-player.mood-walk")).toContain("animation: mood-toil");
    expect(rule(".grid .c.mk-player.mood-work")).toContain("animation: mood-toil");
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
    expect(rule(".grid .c.t-water")).toContain("--water-rest: #0a1633");
    expect(rule(".grid .c:not(.mk):not(.ground-snow):not(.ice-thin):not(.ice-safe).t-water.deep-0")).toContain("--water-rest: #102047");
    expect(rule(".grid .c:not(.mk):not(.ground-snow):not(.ice-thin):not(.ice-safe).t-water.deep-2")).toContain("--water-rest: #060d20");

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
    const first = mapHtml(world, state, ui, cal);
    expect(mapHtml(world, state, ui, cal)).toBe(first);
    const root = document.createElement("div");
    root.innerHTML = first;
    // The document still marks which cells qualify, so the canvas model and
    // the class the cell carries can be checked against each other.
    const liveCells = [...root.querySelectorAll<HTMLElement>(".c.water-live")];
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
      expect(el.classList.contains("t-water")).toBe(true);
      for (const still of ["mk", "memory", "dim", "ice-thin", "ice-safe"]) expect(el.classList.contains(still)).toBe(false);
    }
    // Water the survivor remembers but cannot see now lies still.
    for (const el of root.querySelectorAll(".c.t-water.memory, .c.t-water.dim")) expect(el.classList.contains("water-live")).toBe(false);

    // Frozen water is a sheet, not a surface that catches light.
    const frozen = weatherShotFixture("frozen-water");
    root.innerHTML = mapHtml(frozen.world, frozen.state, newUiState(), frozen.cal);
    expect(root.querySelectorAll(".t-water.ice-safe").length).toBeGreaterThan(20);
    expect(root.querySelector(".water-live")).toBeNull();
    expect(effectsSnapshot()!.water).toHaveLength(0);
  });

  it("makes the visual harness select simulation fixtures without injecting presentation state", () => {
    const shots = readFileSync("scripts/map-shots.mjs", "utf8");
    for (const name of ["clear", "approaching-rain", "local-rain", "persisted-snow", "frozen-water", "valley-fog", "windward-lee", "obscured"]) {
      expect(shots).toContain(`"${name}"`);
    }
    for (const name of ["cloud-shadows.png", "cloud-glyphs.png"]) expect(shots).toContain(name);
    expect(shots).toContain("?weather-shot=");
    expect(shots).toContain("window.survidle.weatherShot.visibleCells");
    expect(shots).toContain("[data-display=cloud-shadows]");
    expect(shots).not.toContain("classList.toggle");
    expect(shots).not.toContain("style.setProperty");
  });
});
