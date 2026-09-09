import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { Rng } from "../src/rng";
import { calendar } from "../src/sim/calendar";
import { mapRegion } from "../src/sim/mapped";
import { newGame } from "../src/sim/newgame";
import { cellOf } from "../src/sim/position";
import { activateWildlife } from "../src/sim/wildlife-agents";
import { mapHtml } from "../src/ui/map";
import { enqueueWildlifeStartle, newUiState } from "../src/ui/render";
import { cellAt, neighbours } from "../src/world/gen";
import { passable } from "../src/world/route";
import { css, rule } from "./css";
import { neighbourLandCell } from "./siting-helpers";

describe("the map's compositing layers", () => {
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

  it("keeps startles outside filtered, dimmed and clipped cells above signals and below controls", () => {
    const { state, world } = newGame(79);
    const ui = newUiState();
    ui.zoom = 0;
    state.weather.snowCm = 10;
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
      expect(getComputedStyle(source).filter).not.toBe("none");
      expect(getComputedStyle(source).opacity).toBe("0.45");
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
          expect(getComputedStyle(cell).filter).toBe(filter);
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

  it("keeps both kinds of falling weather animated without taking the pointer", () => {
    const rain = rule(".scroll-x.rain::before");
    const snow = rule(".scroll-x.snowing::before");
    expect(rain).toContain("animation: rainfall");
    expect(rain).toContain("opacity: 0.35");
    expect(snow).toContain("animation: snowfall");
    expect(snow).toContain("opacity: 0.6");
  });

  it("keeps night firelight and active survivor marks animated above the weather", () => {
    expect(rule(".grid.night .c.mk-fire")).toContain("animation: flicker");
    expect(rule(".grid.night .c.lit-0")).toContain("z-index: var(--map-signal)");
    expect(rule(".grid.night .c.lit-0")).toContain("animation: flicker");
    expect(rule(".grid .c.mk-player.mood-walk")).toContain("animation: mood-toil");
    expect(rule(".grid .c.mk-player.mood-work")).toContain("animation: mood-toil");
  });

  it("makes the visual harness put weather on the same viewport as the game", () => {
    const shots = readFileSync("scripts/map-shots.mjs", "utf8");
    expect(shots).toContain('["rain", "season-autumn", "rain"');
    expect(shots).toContain('["snowing", "season-winter snow", "snowing"');
    expect(shots).toContain("window.__weather");
    expect(shots).toContain("viewport.classList.toggle('rain'");
    expect(shots).toContain("viewport.classList.toggle('snowing'");
    expect(shots).toContain("viewport.style.setProperty('--bright'");
  });
});
