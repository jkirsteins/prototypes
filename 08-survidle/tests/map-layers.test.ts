import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { Rng } from "../src/rng";
import { calendar } from "../src/sim/calendar";
import { mapRegion } from "../src/sim/mapped";
import { newGame } from "../src/sim/newgame";
import { cellOf } from "../src/sim/position";
import { activateWildlife } from "../src/sim/wildlife-agents";
import { cloudGlyphHtml, fogGlyphHtml, mapHtml, precipitationGlyphHtml } from "../src/ui/map";
import { enqueueWildlifeStartle, newUiState } from "../src/ui/render";
import { cellAt, neighbours } from "../src/world/gen";
import { passable } from "../src/world/route";
import { css, rule } from "./css";
import { neighbourLandCell } from "./siting-helpers";
import { testAtmosphere } from "./weather-helpers";
import { ensureGround } from "../src/sim/weather";

describe("the map's compositing layers", () => {
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

  it("renders precipitation as cell-owned ASCII without taking the pointer", () => {
    const rain = rule(".grid .c.wx-rain .cell-weather");
    const snow = rule(".grid .c.wx-snowing .cell-weather");
    expect(rain).not.toContain("gradient");
    expect(snow).not.toContain("gradient");
    expect(precipitationGlyphHtml(17, 12, 34, "rain")).toMatch(/[/'|]/);
    expect(precipitationGlyphHtml(17, 12, 34, "snow")).toMatch(/[.*+]/);
    expect(rule(".grid .c.wx-cloud, .grid .c.wx-fog, .grid .c.wx-rain, .grid .c.wx-snowing"))
      .toContain("pointer-events: auto");
    expect(rule(".grid .c .cell-weather")).toContain("z-index: var(--map-weather)");
    expect(rule(".grid .c .cell-weather")).toContain("pointer-events: none");
    expect(rule(".grid .c .cell-signal")).toContain("z-index: var(--map-signal)");
  });

  it("stops local map and sky weather motion when reduced motion is requested", () => {
    const reduced = rule("@media (prefers-reduced-motion: reduce)");
    expect(reduced).toContain(".weather-ripple");
    expect(reduced).toContain(".fog-ripple");
    expect(reduced).toContain(".cloud-ripple");
    expect(reduced).toContain(".sky-cloud");
    expect(reduced).toContain("animation: none");
    expect(readFileSync("src/style.css", "utf8")).toContain(".weather-ripple:not(:first-child), .fog-ripple:not(:first-child), .cloud-ripple:not(:first-child) { display: none; }");
  });

  it("renders fog only as cell-owned same-colour ASCII ripples", () => {
    const first = fogGlyphHtml(17, 12, 34);
    expect(first).toBe(fogGlyphHtml(17, 12, 34));
    expect(first).toContain("fog-ripple");
    expect(new Set(first.match(/[.:~=]/g))).toHaveLength(4);
    expect(first).toContain("--fog-phase:");
    expect(first.match(/fog-ripple-/g)).toHaveLength(4);
    const fogPhases = [...first.matchAll(/--fog-phase:-(\d+)ms/g)].map((match) => Number(match[1]));
    expect(fogPhases[3] - fogPhases[0]).toBe(9000);
    const clouds = cloudGlyphHtml(17, 12, 34);
    const cloudPhases = [...clouds.matchAll(/--cloud-phase:-(\d+)ms/g)].map((match) => Number(match[1]));
    expect(cloudPhases[3] - cloudPhases[0]).toBe(12000);
    const fog = rule(".grid .c.wx-fog .cell-weather");
    expect(fog).toContain("color: var(--fog-glyph)");
    expect(fog).not.toContain("border");
    expect(fog).not.toContain("box-shadow");
    expect(fog).not.toContain("background-size");
    const fogRipple = rule(".grid .c.wx-fog .fog-ripple");
    expect(fogRipple).toContain("color: inherit");
    expect(fogRipple).toContain("animation: map-weather-ripple 12s step-end infinite");
    expect(rule(".grid .c.wx-cloud .cloud-ripple")).toContain("animation: map-weather-ripple 16s step-end infinite");
    const stylesheet = readFileSync("src/style.css", "utf8");
    expect(stylesheet).not.toContain(".grid .c.wx-cloud .cell-weather {");
    expect(stylesheet).not.toContain(".grid .c.memory {");
    expect(stylesheet).not.toContain(".grid .c.dim {");
    expect(rule(".grid .c.memory > .cell-ground, .grid .c.memory > .cell-signal"))
      .toContain("filter: brightness(0.58) saturate(0.45)");
    expect(rule(".grid .c.dim > .cell-ground, .grid .c.dim > .cell-signal"))
      .toContain("opacity: 0.45");
    const fogMotion = stylesheet.match(/@keyframes map-weather-ripple[\s\S]*?\n}/)?.[0] ?? "";
    expect(fogMotion).toContain("opacity:");
    expect(fogMotion).not.toContain("transform:");

    const snow = rule(".grid .c.wx-snowing .cell-weather");
    expect(snow).not.toContain("gradient");
    const rain = rule(".grid .c.wx-rain .cell-weather");
    expect(rain).not.toContain("gradient");
  });

  it("never feathers exploration or stacks atmospheric glyphs over terrain glyphs", () => {
    const stylesheet = readFileSync("src/style.css", "utf8");
    expect(stylesheet).not.toContain(".fog-edge");
    expect(stylesheet).not.toContain("--fog-left");
    expect(rule(".grid .c.wx-glyph:not(.mk) > .cell-ground > .terrain-visual"))
      .toContain("visibility: hidden");
    expect(rule(".grid .c.mk > .cell-weather")).toContain("display: none");
    expect(rule(".grid .c .weather-ripple")).toContain("animation-timing-function: step-end");
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
      source: { xM: state.player.x * 300, yM: state.player.y * 300 },
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
      const player = map.querySelector(".mk-player")!;
      const source = player.closest(".c")!;
      source.classList.add("tone-0", "dim");
      const z = (element: Element) => Number(getComputedStyle(element).zIndex);
      expect(getComputedStyle(source).overflow).toBe("hidden");
      expect(getComputedStyle(source).filter).toBe("");
      expect(getComputedStyle(source).opacity).toBe("");
      expect(getComputedStyle(player).opacity).toBe("0.45");
      expect(getComputedStyle(source.querySelector(".cell-weather")!).opacity).toBe("");
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

  it("keeps detailed player and camp signals above routes without lifting ordinary animals", () => {
    const sheet = document.createElement("style");
    sheet.textContent = css;
    document.head.append(sheet);
    const map = document.createElement("div");
    map.id = "mapdyn";
    map.innerHTML = '<div class="scroll-x"><div class="grid detailed"><span class="c"><b class="micro-mark mk-player"></b><b class="micro-mark mk-camp"></b><b class="micro-mark mk-fire"></b><b class="micro-mark mk-coals"></b><b class="micro-mark mk-animal"></b></span><svg class="walk"></svg><i class="wildlife-startle"></i></div></div>';
    document.body.append(map);
    try {
      const z = (selector: string) => Number(getComputedStyle(map.querySelector(selector)!).zIndex);
      const route = z(".walk");
      for (const signal of [".mk-player", ".mk-camp", ".mk-fire", ".mk-coals"]) {
        expect(z(signal)).toBeGreaterThan(route);
        expect(z(signal)).toBeLessThan(z(".wildlife-startle"));
      }
      expect(z(".mk-animal")).toBeLessThan(route);
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
      for (const selector of [".mk-player", `.mk-${kind}`]) {
        const cell = map.querySelector(selector)!.closest(".c")!;
        // Exercise both snow filters on real map markup, independent of the
        // generated cell's elevation rank within this particular viewport.
        for (const [tone, filter] of [["tone-0", "brightness(0.82)"], ["tone-2", "brightness(1.18)"]]) {
          cell.classList.remove("tone-0", "tone-2");
          cell.classList.add(tone);
          expect(getComputedStyle(cell).filter).toBe("");
          expect(getComputedStyle(cell.querySelector(".terrain-visual")!).filter).toBe(filter);
          expect(Number(getComputedStyle(cell).zIndex)).toBeGreaterThan(route);
        }
      }
      const animalMark = map.querySelector(`[data-wildlife-id="${animal.id}"]`)!;
      expect(Number(getComputedStyle(animalMark).zIndex)).toBeGreaterThan(route);
      const terrainCell = [...map.querySelectorAll(".c:not(.fog):not(.void)")].find((cell) => !cell.querySelector(".micro-mark"))!;
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
