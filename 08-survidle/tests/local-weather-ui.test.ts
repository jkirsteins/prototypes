import { markSeen, setKnowledge } from "../src/sim/fineknowledge";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as climate from "../src/sim/climate";
import { calendar } from "../src/sim/calendar";
import { newGame } from "../src/sim/newgame";
import { cellOf } from "../src/sim/position";
import { opticalCandidateRangeCells, sightRangeCells, visibleCells } from "../src/sim/sight";
import type { AtmosphereSample, LocalGroundWeather } from "../src/sim/types";
import { ensureGround } from "../src/sim/weather";
import { cellIdx, regionPeek } from "../src/world/gen";
import { cloudGlyphHtml, levelAt, mapHtml, mapKey, viewOrigin } from "../src/ui/map";
import { weatherHtml } from "../src/ui/panels";
import { newUiState } from "../src/ui/render";
import { lighting, updateSky } from "../src/ui/sky";

function air(over: Partial<AtmosphereSample> = {}): AtmosphereSample {
  return {
    temperatureC: 7, pressureHpa: 1008, relativeHumidity: 0.8, cloud: 0.7,
    precipMmPerHour: 0, rainMmPerHour: 0, snowCmPerHour: 0, precip: "none",
    windKmh: 0, windBearingDeg: 0, windXKmh: 0, windYKmh: 0,
    fog: 0, blowingSnow: 0, extinctionPerKm: 0.06, ...over,
  };
}

afterEach(() => vi.restoreAllMocks());

describe("local weather presentation", () => {
  it("catches up each visible region once while sampling atmosphere at every glyph", () => {
    const { state, world } = newGame(21);
    const ui = newUiState();
    const level = levelAt(ui.zoom);
    const { x0, y0 } = viewOrigin(state, world, ui.zoom);
    const regions = new Set<number>();
    const ground: LocalGroundWeather = {
      updatedHour: 0, snowCm: 0, surfaceWaterMm: 0, soilMoisture: 0.5,
      frost: 0, iceCm: 0, dryHours: 0, temperatureSum: 0, temperatureHours: 0,
    };
    for (let gy = 0; gy < level.h; gy++) {
      for (let gx = 0; gx < level.w; gx++) {
        const x = x0 + gx * level.finePerGlyph;
        const y = y0 + gy * level.finePerGlyph;
        if (x < 0 || y < 0 || x >= world.w || y >= world.h) continue;
        const cell = cellIdx(world, x, y);
        markSeen(state.knowledge, cell);
        regions.add(regionPeek(world, x, y));
      }
    }
    for (const region of regions) state.weather.ground[region] = { ...ground };
    state.minute = 24 * 60;
    const samples = vi.spyOn(climate, "sampleAtmosphere").mockReturnValue(air());

    const cal = calendar(state.minute, state.startDoy);
    mapHtml(world, state, ui, cal);
    const renderCalls = samples.mock.calls.slice();
    const currentMinute = state.minute + state.weather.elapsedMinutes;
    const historicalSamples = renderCalls.filter(([, , minute]) => minute < currentMinute).length;
    const currentSamples = renderCalls.length - historicalSamples;
    const visible = visibleCells(state, world, cal, cellOf(state, world));
    const visibleGlyphs = new Set([...visible].map((cell) => {
      const cx = cell % world.w;
      const cy = Math.floor(cell / world.w);
      const gx = Math.floor((cx - x0) / level.finePerGlyph);
      const gy = Math.floor((cy - y0) / level.finePerGlyph);
      return gy * level.w + gx;
    }).filter((glyph) => glyph >= 0 && glyph < level.w * level.h)).size;
    const visibleRegions = new Set([...visible].filter((cell) => {
      const cx = cell % world.w;
      const cy = Math.floor(cell / world.w);
      const gx = Math.floor((cx - x0) / level.finePerGlyph);
      const gy = Math.floor((cy - y0) / level.finePerGlyph);
      return gx >= 0 && gy >= 0 && gx < level.w && gy < level.h;
    }).map((cell) => regionPeek(world, cell % world.w, Math.floor(cell / world.w))));
    const sightSamples = currentSamples - visibleGlyphs;
    const sightRange = opticalCandidateRangeCells(sightRangeCells(state, world, cal, cellOf(state, world)));
    // The ray sampler bilinearly reads cell centres in the candidate square,
    // plus the player's one local sample used to establish sight range.
    const maxSightSamples = 1 + (2 * sightRange + 2) ** 2;
    const representedGroundSamples = visibleRegions.size * 24;
    const sightGroundSamples = historicalSamples - representedGroundSamples;
    const maxSightGroundSamples = (2 * sightRange + 1) ** 2 * 24;

    // Ground history remains one replay per represented or ray-crossed region,
    // while each visible glyph and the one current viewshed read current atmosphere.
    // Neither bounded ray cost may become replay per glyph (about 65k here).
    expect(sightGroundSamples).toBeGreaterThanOrEqual(0);
    expect(sightGroundSamples % 24).toBe(0);
    expect(sightGroundSamples).toBeLessThanOrEqual(maxSightGroundSamples);
    expect(currentSamples).toBe(visibleGlyphs + sightSamples);
    expect(sightSamples).toBeGreaterThan(0);
    expect(sightSamples).toBeLessThanOrEqual(maxSightSamples);
  });

  it("renders live weather only on known ground inside the current viewshed", () => {
    const { state, world } = newGame(21);
    const here = cellOf(state, world);
    const x = here % world.w;
    const y = Math.floor(here / world.w);
    const rainy = here;
    const ui = newUiState();
    // One glyph to one patch, so the sample the map takes is the patch the
    // mocked atmosphere is keyed to.
    ui.zoom = 0;
    const cal = calendar(state.minute, state.startDoy);
    const level = levelAt(ui.zoom);
    const origin = viewOrigin(state, world, ui.zoom);
    const visible = visibleCells(state, world, cal, here);
    const hiddenCandidates: number[] = [];
    for (let gy = 0; gy < level.h; gy++) {
      for (let gx = 0; gx < level.w; gx++) {
        const cx = origin.x0 + gx * level.finePerGlyph;
        const cy = origin.y0 + gy * level.finePerGlyph;
        if (cx < 0 || cy < 0 || cx >= world.w || cy >= world.h) continue;
        const candidate = cellIdx(world, cx, cy);
        if (!visible.has(candidate)) hiddenCandidates.push(candidate);
      }
    }
    const [hiddenKnown, unknown] = hiddenCandidates;
    expect(hiddenKnown).toBeTypeOf("number");
    expect(unknown).toBeTypeOf("number");
    markSeen(state.knowledge, hiddenKnown);
    setKnowledge(state.knowledge, unknown, "unknown");
    ensureGround(state, world, regionPeek(world, x, y)).snowCm = 18;
    vi.spyOn(climate, "sampleAtmosphere").mockImplementation((_weather, _world, _minute, sx, sy) => (
      sx === x && sy === y
        ? air({ cloud: 0.9, precipMmPerHour: 4, rainMmPerHour: 4, precip: "rain", windKmh: 24, windXKmh: 24 })
        : (sx === hiddenKnown % world.w && sy === Math.floor(hiddenKnown / world.w)) ||
            (sx === unknown % world.w && sy === Math.floor(unknown / world.w))
          ? air({ cloud: 0.95, precipMmPerHour: 4, rainMmPerHour: 4, precip: "rain", fog: 0.8 })
          : air({ cloud: 0.1 })
    ));

    const root = document.createElement("div");
    root.innerHTML = mapHtml(world, state, ui, cal);
    const rainCell = root.querySelector<HTMLElement>(`[data-map-cell="${rainy}"]`)!;
    const hiddenCell = root.querySelector<HTMLElement>(`[data-map-cell="${hiddenKnown}"]`)!;
    const unknownCell = root.querySelector<HTMLElement>(`[data-map-cell="${unknown}"]`)!;

    expect(rainCell.classList).toContain("wx-rain");
    expect(rainCell.classList).toContain("ground-snow");
    expect(rainCell.getAttribute("aria-label")).toMatch(/snow/i);
    expect(rainCell.style.getPropertyValue("--wx-fall")).toBe("0.533");
    expect(hiddenCell.classList).not.toContain("wx-local");
    expect(hiddenCell.getAttribute("aria-label")).not.toMatch(/snow|ice/i);
    expect(hiddenCell.querySelector(".cell-weather")).toBeNull();
    expect(unknownCell.classList).not.toContain("wx-local");
    expect(root.querySelector(".fog-field")).toBeNull();
    expect(unknownCell.querySelectorAll(".fog-ripple")).toHaveLength(0);
    expect([...unknownCell.children].some((child) => child.classList.contains("cell-ground"))).toBe(true);
    expect([...unknownCell.children].some((child) => child.classList.contains("cell-weather"))).toBe(false);
    expect(unknownCell.classList).not.toContain("ground-snow");
    expect(unknownCell.className).not.toMatch(/t-(water|fell|rock|bog|spruce|pine|birch|meadow)/);
    expect(unknownCell.getAttribute("aria-label")).toContain("unknown ground");
  });

  it("limits coarse live weather to known blocks intersecting the actual viewshed", () => {
    const { state, world } = newGame(21);
    const ui = newUiState();
    ui.zoom = 3;
    const cal = calendar(state.minute, state.startDoy);
    const visible = visibleCells(state, world, cal, cellOf(state, world));
    for (const cell of visible) markSeen(state.knowledge, cell);
    vi.spyOn(climate, "sampleAtmosphere").mockReturnValue(air({ cloud: 0.95, fog: 0.8 }));

    const root = document.createElement("div");
    root.innerHTML = mapHtml(world, state, ui, cal);
    const level = levelAt(ui.zoom);
    const weatherCells = [...root.querySelectorAll<HTMLElement>(".c.wx-local")];
    expect(weatherCells.length).toBeGreaterThan(0);
    for (const element of weatherCells) {
      const start = Number(element.dataset.mapCell);
      const sx = start % world.w;
      const sy = Math.floor(start / world.w);
      expect([...visible].some((cell) => {
        const cx = cell % world.w;
        const cy = Math.floor(cell / world.w);
        return cx >= sx && cx < sx + level.finePerGlyph && cy >= sy && cy < sy + level.finePerGlyph;
      })).toBe(true);
      expect(element.classList).not.toContain("fog");
    }
    expect(root.querySelectorAll(".c[data-map-cell]").length).toBeGreaterThan(weatherCells.length);
  });

  it("renders clouds as terrain shadows by default and as ASCII flavor when disabled", () => {
    const { state, world } = newGame(21);
    vi.spyOn(climate, "sampleAtmosphere").mockReturnValue(air({ cloud: 1 }));
    const ui = newUiState();

    const shadow = document.createElement("div");
    shadow.innerHTML = mapHtml(world, state, ui, calendar(state.minute, state.startDoy));
    const shadowCell = shadow.querySelector<HTMLElement>(".c.wx-cloud:not(.mk)")!;
    expect(shadow.querySelector(".grid")?.classList).toContain("cloud-shadows");
    expect([...shadowCell.children].some((child) => child.classList.contains("cell-ground"))).toBe(true);
    expect([...shadowCell.children].some((child) => child.classList.contains("cloud-shadow"))).toBe(true);
    expect(shadowCell.style.getPropertyValue("--wx-shadow")).toBe("0.140");
    expect(shadowCell.querySelector(".cloud-ripple")).toBeNull();

    ui.cloudShadows = false;
    const flavor = document.createElement("div");
    flavor.innerHTML = mapHtml(world, state, ui, calendar(state.minute, state.startDoy));
    expect(flavor.querySelector(".grid")?.classList).toContain("cloud-glyphs");
    expect(flavor.querySelector(".c.wx-cloud:not(.wx-fog)")?.querySelectorAll(".cloud-ripple")).toHaveLength(4);
    expect(new Set(cloudGlyphHtml(17, 12, 34).match(/[oO0~]/g))).toHaveLength(4);
    expect(flavor.querySelector(".c.wx-cloud:not(.wx-fog)")?.classList).toContain("wx-glyph");
  });

  it("describes and animates the player's sampled air, including the simulated wind vector", () => {
    const { state, world } = newGame(21);
    vi.spyOn(climate, "sampleAtmosphere").mockReturnValue(air({
      temperatureC: 3.4, cloud: 0.82, precipMmPerHour: 2.5, rainMmPerHour: 2.5,
      precip: "rain", windKmh: 36, windBearingDeg: 270, windXKmh: 36,
      fog: 0.35, extinctionPerKm: 1.2,
    }));
    const cal = calendar(state.minute, state.startDoy);
    const root = document.createElement("div");
    root.innerHTML = `<div id="weather">${weatherHtml(state, world, cal, -99)}</div><div id="map"></div>`;

    updateSky(state, cal, -99, root);

    expect(root.querySelector(".wx-temp")?.textContent).toContain("3C");
    expect(root.querySelector(".wx-word")?.textContent).toContain("rain");
    expect(root.querySelector(".wx-wind")?.textContent).toContain("W 36 km/h");
    expect(root.querySelector(".wx-visibility")?.textContent).toContain("fog");
    const sky = root.querySelector<SVGElement>("svg.sky")!;
    expect(sky.style.getPropertyValue("--wind-x")).toBe("36.00");
    expect(sky.style.getPropertyValue("--wind-y")).toBe("0.00");
    expect(sky.style.getPropertyValue("--wind-speed")).toBe("36.00");
    expect(sky.classList).toContain("rain");
  });

  it.each([
    ["rain", 0.6, 4, "wx-rain", "wx-snowing"],
    ["snow", 0.4, 6, "wx-snowing", "wx-rain"],
  ] as const)("renders mixed precipitation once as its %s-dominant phase", (phase, rain, snow, shown, hidden) => {
    const { state, world } = newGame(21);
    vi.spyOn(climate, "sampleAtmosphere").mockReturnValue(air({
      temperatureC: phase === "snow" ? -0.2 : 0.2,
      precipMmPerHour: rain + snow, rainMmPerHour: rain,
      snowCmPerHour: snow, precip: phase,
    }));
    const cal = calendar(state.minute, state.startDoy);
    const root = document.createElement("div");
    root.innerHTML = `<div id="weather">${weatherHtml(state, world, cal, 0)}</div><div id="map">${mapHtml(world, state, newUiState(), cal)}</div>`;
    updateSky(state, cal, 0, root);

    const player = root.querySelector<HTMLElement>(`[data-map-cell="${cellOf(state, world)}"]`)!;
    expect(player.classList).toContain(shown);
    expect(player.classList).not.toContain(hidden);
    expect(root.querySelector(".wx-word")?.textContent).toContain(phase);
    expect(root.querySelector("svg.sky")?.classList).toContain(phase);
  });

  it("preserves the authoritative liquid-equivalent rate for heavy snow in the sky", () => {
    const { state, world } = newGame(21);
    const snow = air({
      temperatureC: -5, cloud: 0.95, precipMmPerHour: 7.5,
      snowCmPerHour: 7.5, precip: "snow",
    });
    vi.spyOn(climate, "sampleAtmosphere").mockReturnValue(snow);
    const cal = calendar(state.minute, state.startDoy);
    const root = document.createElement("div");
    root.innerHTML = `<div id="weather">${weatherHtml(state, world, cal, -5)}</div><div id="map"></div>`;

    const light = updateSky(state, cal, -5, root);
    const clearLight = lighting(cal, air({ temperatureC: -5, cloud: 0 }), -5);

    expect(root.querySelector("#sky-fall")?.getAttribute("opacity")).toBe("1.00");
    expect(root.querySelector(".wx-word")?.textContent).toContain("heavy snow");
    expect(light.brightness).toBeCloseTo(clearLight.brightness * 0.85, 5);
  });

  it("keeps coarse player marker text on the signal layer above its weather", () => {
    const { state, world } = newGame(21);
    vi.spyOn(climate, "sampleAtmosphere").mockReturnValue(air({
      precipMmPerHour: 3, rainMmPerHour: 3, precip: "rain",
    }));
    const root = document.createElement("div");
    root.innerHTML = mapHtml(world, state, newUiState(), calendar(state.minute, state.startDoy));
    const player = root.querySelector<HTMLElement>(`[data-map-cell="${cellOf(state, world)}"]`)!;

    expect([...player.children].some((child) => child.classList.contains("cell-weather"))).toBe(true);
    expect([...player.children].find((child) => child.classList.contains("cell-signal"))?.textContent).toBe("@");
  });

  it("keys the map to a weather interval and local samples without per-frame churn", () => {
    const { state, world } = newGame(21);
    const cal = () => calendar(state.minute, state.startDoy);
    const ui = newUiState();
    vi.spyOn(climate, "sampleAtmosphere").mockImplementation((_weather, _world, minute) => (
      air({ cloud: minute < 10 ? 0.1 : 0.9 })
    ));

    const opening = mapKey(state, world, ui, cal());
    ui.cloudShadows = false;
    expect(mapKey(state, world, ui, cal())).not.toBe(opening);
    ui.cloudShadows = true;
    state.minute = 9;
    expect(mapKey(state, world, ui, cal())).toBe(opening);
    state.minute = 10;
    expect(mapKey(state, world, ui, cal())).not.toBe(opening);
  });

  it("keys coarse weather to the projected viewshed, not only the local sample", () => {
    const { state, world } = newGame(21);
    const ui = newUiState();
    // The first block rung. Sight in forest reaches about 150 m, so a wider
    // glyph swallows the whole viewshed and any change to it; 100 m a glyph
    // is where the projection can still tell two viewsheds apart.
    ui.zoom = 1;
    const cal = calendar(state.minute, state.startDoy);
    let extinction = 0.06;
    vi.spyOn(climate, "sampleAtmosphere").mockImplementation(() => air({ extinctionPerKm: extinction }));

    const clear = mapKey(state, world, ui, cal);
    extinction = 20;
    state.minute = 1;

    expect(mapKey(state, world, ui, calendar(state.minute, state.startDoy))).not.toBe(clear);
  });
});
