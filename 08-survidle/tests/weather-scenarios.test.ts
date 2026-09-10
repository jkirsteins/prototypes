import { describe, expect, it } from "vitest";
import { mapHtml } from "../src/ui/map";
import { newUiState } from "../src/ui/render";
import { conditionsAt, iceMode } from "../src/sim/weather";
import { WEATHER_SHOTS, weatherShotFixture, weatherShotSimulation } from "../src/sim/weather-scenarios";
import { fieldsAt, terrainAt } from "../src/world/terrain";
import { tipHtml } from "../src/ui/tip";
import { describeWhere } from "../src/sim/position";

describe("simulation-backed weather screenshot fixtures", () => {
  it("uses real sampled phases at the documented seed, minute and coordinates", () => {
    const clear = weatherShotSimulation("clear");
    const rain = weatherShotSimulation("local-rain");
    const fog = weatherShotSimulation("valley-fog");
    const snow = weatherShotSimulation("persisted-snow");

    expect(clear.definition).toMatchObject({ seed: 17, minute: 1440, x: 450, y: 1100 });
    expect(conditionsAt(clear.state, clear.world, clear.cal, clear.cell).extinctionPerKm).toBeLessThan(0.3);
    expect(conditionsAt(rain.state, rain.world, rain.cal, rain.cell).rainMmPerHour).toBeGreaterThan(10);
    expect(conditionsAt(fog.state, fog.world, fog.cal, fog.cell).fog).toBeGreaterThan(0.35);
    expect(conditionsAt(fog.state, fog.world, fog.cal, fog.cell).precipMmPerHour).toBe(0);
    const snowHere = conditionsAt(snow.state, snow.world, snow.cal, snow.cell);
    expect(snowHere.snowCmPerHour).toBeGreaterThan(5);
    expect(snowHere.ground.snowCm).toBeGreaterThan(5);
    expect(snow.state.weather.ground[snow.state.player.region]?.snowCm).toBe(snowHere.ground.snowCm);
  });

  it("provides a dry sunny reference with spatially varying cloud shadows", () => {
    const shot = weatherShotSimulation("sunny-clouds");
    const here = conditionsAt(shot.state, shot.world, shot.cal, shot.cell);
    expect(shot.cal.isNight).toBe(false);
    expect(here.precipMmPerHour).toBe(0);
    expect(here.fog).toBeLessThan(0.1);
    expect(here.cloud).toBeGreaterThan(0.3);
    expect(here.cloud).toBeLessThan(0.72);

    const fixture = weatherShotFixture("sunny-clouds");
    const root = document.createElement("div");
    root.innerHTML = mapHtml(fixture.world, fixture.state, newUiState(), fixture.cal);
    expect(root.querySelectorAll(".cloud-shadow").length).toBeGreaterThan(0);
    expect(root.querySelector(".wx-rain, .wx-snowing")).toBeNull();
    expect(root.querySelector(".ground-snow")).toBeNull();
  });

  it("provides a naturally frozen water reference with safe ice across the visible surface", () => {
    const shot = weatherShotSimulation("frozen-water");
    const here = conditionsAt(shot.state, shot.world, shot.cal, shot.cell);
    expect(shot.definition).toMatchObject({ seed: 17, minute: 481200, x: 175, y: 50 });
    expect(terrainAt(shot.world.seed, shot.definition.x, shot.definition.y)).toBe("water");
    expect(iceMode({ iceCm: here.ground.iceCm })).toBe("safe");

    const fixture = weatherShotFixture("frozen-water");
    const root = document.createElement("div");
    root.innerHTML = mapHtml(fixture.world, fixture.state, newUiState(), fixture.cal);
    expect(root.querySelectorAll(".t-water.ice-safe").length).toBeGreaterThan(20);
    const hereCell = root.querySelector<HTMLElement>(`[data-map-cell="${fixture.cell}"]`)!;
    const visibleIce = root.querySelector<HTMLElement>(".t-water.ice-safe:not(.mk) .terrain-visual")!;
    expect(hereCell.getAttribute("aria-label")).toContain("safe ice over water");
    expect(visibleIce.textContent).toMatch(/[~-]/);
    expect(visibleIce.textContent).not.toContain("=");
    expect(tipHtml(fixture.state, fixture.world, fixture.cal, fixture.cell)).toContain("Safe ice over water");
    expect(describeWhere(fixture.state, fixture.world)).toContain("on safe ice");
  });

  it("keeps one coherent field spatially varied instead of rolling weather per cell", () => {
    const shot = weatherShotSimulation("approaching-rain");
    const samples = Array.from({ length: 21 }, (_, dx) =>
      conditionsAt(shot.state, shot.world, shot.cal, shot.cell - 10 + dx).rainMmPerHour,
    );
    expect(Math.max(...samples) - Math.min(...samples)).toBeGreaterThan(1);
    expect(Math.max(...samples.slice(1).map((v, i) => Math.abs(v - samples[i])))).toBeLessThan(8);
  });

  it("places the named valley fog sample below all four 6 km surroundings", () => {
    const shot = weatherShotSimulation("valley-fog");
    const { x, y } = shot.definition;
    const center = fieldsAt(shot.world.seed, x, y).e;
    for (const [dx, dy] of [[-20, 0], [20, 0], [0, -20], [0, 20]]) {
      expect(fieldsAt(shot.world.seed, x + dx, y + dy).e).toBeGreaterThan(center);
    }
  });

  it("renders live weather only on the fixture's known visible ground", () => {
    const shot = weatherShotFixture("local-rain");
    const html = mapHtml(shot.world, shot.state, newUiState(), shot.cal);
    const root = document.createElement("div");
    root.innerHTML = html;
    expect(html).toContain("wx-rain");
    expect(html).not.toContain('class="fog-field"');
    expect(html).toContain("fog-ripple");
    expect(html).toContain("unknown ground");
    expect(root.querySelector(".c.fog.wx-local")).toBeNull();
    expect(root.querySelector(".c.memory.wx-local, .c.dim.wx-local")).toBeNull();
  });

  it("makes a dense band's actual current sight footprint smaller than clear air at the same rock", () => {
    const clear = weatherShotFixture("clear");
    const dense = weatherShotFixture("obscured");
    expect(clear.cell).toBe(dense.cell);
    expect(clear.visible.size).toBeGreaterThan(dense.visible.size * 10);
    expect(Object.keys(clear.state.mapped)).toHaveLength(clear.visible.size);
    expect(Object.keys(dense.state.mapped)).toHaveLength(dense.visible.size);
  });

  it("keeps the documented scenario catalog complete", () => {
    expect(Object.keys(WEATHER_SHOTS)).toEqual([
      "clear", "sunny-clouds", "approaching-rain", "local-rain", "persisted-snow", "frozen-water", "valley-fog", "windward-lee", "obscured",
    ]);
  });
});
