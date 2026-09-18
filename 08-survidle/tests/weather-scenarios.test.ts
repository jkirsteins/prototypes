import { knowledgeCounts } from "../src/sim/fineknowledge";
import { describe, expect, it } from "vitest";
import { effectsSnapshot } from "../src/ui/map";
import { board, boardText, glyphOfCell, glyphsWith } from "./board";
import { newUiState } from "../src/ui/render";
import { conditionsAt, iceMode, patchGroundModifiers } from "../src/sim/weather";
import { WEATHER_SHOTS, weatherShotFixture, weatherShotSimulation } from "../src/sim/weather-scenarios";
import { heightAt, terrainOf } from "../src/world/gen";
import { tipHtml } from "../src/ui/tip";
import { describeWhere } from "../src/sim/position";

describe("simulation-backed weather screenshot fixtures", () => {
  it("uses real sampled phases at the documented seed, minute and coordinates", () => {
    const clear = weatherShotSimulation("clear");
    const rain = weatherShotSimulation("local-rain");
    const fog = weatherShotSimulation("valley-fog");
    const snow = weatherShotSimulation("persisted-snow");

    expect(clear.definition).toMatchObject({ seed: 17, minute: 1440, x: 10179, y: 5283 });
    // The comparison pair is one rock cell read twice, in clear air and under a
    // dense band; the terrain is part of the fixture, not an accident of it.
    expect(terrainOf(clear.world, clear.definition.x, clear.definition.y)).toBe("rock");
    expect(weatherShotSimulation("obscured").cell).toBe(clear.cell);
    expect(conditionsAt(clear.state, clear.world, clear.cal, clear.cell).extinctionPerKm).toBeLessThan(0.3);
    expect(conditionsAt(rain.state, rain.world, rain.cal, rain.cell).rainMmPerHour).toBeGreaterThan(10);
    expect(conditionsAt(fog.state, fog.world, fog.cal, fog.cell).fog).toBeGreaterThan(0.35);
    expect(conditionsAt(fog.state, fog.world, fog.cal, fog.cell).precipMmPerHour).toBe(0);
    const snowHere = conditionsAt(snow.state, snow.world, snow.cal, snow.cell);
    expect(snowHere.snowCmPerHour).toBeGreaterThan(5);
    expect(snowHere.ground.snowCm).toBeGreaterThan(5);
    // The region record drives it; what lies on this patch is that record
    // after the patch's own crown and exposure.
    const driver = snow.state.weather.ground[snow.state.player.region]!.snowCm;
    expect(snowHere.ground.snowCm).toBeCloseTo(driver * patchGroundModifiers(snow.world, snow.cell).snow, 10);
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
    const b = board(fixture.world, fixture.state, { ...newUiState(), zoom: fixture.definition.zoom }, fixture.cal);
    // The wash is a canvas draw (map.ts, drawShadows), not an element.
    expect(effectsSnapshot()!.shadow.length).toBeGreaterThan(0);
    expect(glyphsWith(b, "wx-rain").length + glyphsWith(b, "wx-snowing").length).toBe(0);
    expect(glyphsWith(b, "ground-snow")).toHaveLength(0);
  });

  it("provides a naturally frozen water reference with safe ice across the visible surface", () => {
    const shot = weatherShotSimulation("frozen-water");
    const here = conditionsAt(shot.state, shot.world, shot.cal, shot.cell);
    expect(shot.definition).toMatchObject({ seed: 17, minute: 481200, x: 1053, y: 303 });
    expect(terrainOf(shot.world, shot.definition.x, shot.definition.y)).toBe("water");
    expect(iceMode({ iceCm: here.ground.iceCm })).toBe("safe");

    const fixture = weatherShotFixture("frozen-water");
    const b = board(fixture.world, fixture.state, { ...newUiState(), zoom: fixture.definition.zoom }, fixture.cal);
    expect(glyphsWith(b, "t-water", "ice-safe").length).toBeGreaterThan(20);
    const hereCell = glyphOfCell(b, fixture.cell)!;
    const visibleIce = glyphsWith(b, "t-water", "ice-safe", "!mk")[0];
    expect(hereCell.info).toContain("safe ice over water");
    expect(visibleIce.glyph).toMatch(/[~-]/);
    expect(visibleIce.glyph).not.toContain("=");
    expect(tipHtml(fixture.state, fixture.world, fixture.cal, fixture.cell)).toContain("Safe ice over water");
    expect(describeWhere(fixture.state, fixture.world)).toContain("on safe ice");
  });

  it("keeps one coherent field spatially varied instead of rolling weather per cell", () => {
    const shot = weatherShotSimulation("approaching-rain");
    // Every 300 m across 6 km of the band: one coherent field varies over
    // kilometres, and never jumps between neighbouring samples.
    const samples = Array.from({ length: 21 }, (_, i) =>
      conditionsAt(shot.state, shot.world, shot.cal, shot.cell - 60 + i * 6).rainMmPerHour,
    );
    expect(Math.max(...samples) - Math.min(...samples)).toBeGreaterThan(1);
    expect(Math.max(...samples.slice(1).map((v, i) => Math.abs(v - samples[i])))).toBeLessThan(8);
  });

  it("places the named valley fog sample below all four 6 km surroundings", () => {
    const shot = weatherShotSimulation("valley-fog");
    const { x, y } = shot.definition;
    const center = heightAt(shot.world, x, y);
    // 6 km is 120 patches.
    for (const [dx, dy] of [[-120, 0], [120, 0], [0, -120], [0, 120]]) {
      expect(heightAt(shot.world, x + dx, y + dy)).toBeGreaterThan(center);
    }
  });

  it("renders live weather only on the fixture's known visible ground", () => {
    const shot = weatherShotFixture("local-rain");
    const b = board(shot.world, shot.state, { ...newUiState(), zoom: shot.definition.zoom }, shot.cal);
    const text = boardText(b);
    expect(text).toContain("wx-rain");
    expect(text).not.toContain("fog-field");
    expect(text).toContain("unknown ground");
    expect(glyphsWith(b, "fog", "wx-local")).toHaveLength(0);
    expect(glyphsWith(b, "memory", "wx-local").length + glyphsWith(b, "dim", "wx-local").length).toBe(0);
  });

  it("draws fog where the air is foggy rather than over the whole viewport", () => {
    // The rain scene has no fog to draw; the fog scene is where that layer has
    // to be a per-patch glyph and not a sheet laid over the map.
    const shot = weatherShotFixture("valley-fog");
    const b = board(shot.world, shot.state, { ...newUiState(), zoom: shot.definition.zoom }, shot.cal);
    // Fog is a canvas glyph (map.ts, drawGlyphs), one per foggy cell in the model.
    expect(effectsSnapshot()!.glyph.some((cell) => cell.kind === "fog")).toBe(true);
    expect(boardText(b)).not.toContain("fog-field");
  });

  it("makes a dense band's actual current sight footprint smaller than clear air at the same rock", () => {
    const clear = weatherShotFixture("clear");
    const dense = weatherShotFixture("obscured");
    expect(clear.cell).toBe(dense.cell);
    expect(clear.visible.size).toBeGreaterThan(dense.visible.size * 10);
    expect(knowledgeCounts(clear.state.knowledge).known).toBe(clear.visible.size);
    expect(knowledgeCounts(dense.state.knowledge).known).toBe(dense.visible.size);
  });

  it("keeps the documented scenario catalog complete", () => {
    expect(Object.keys(WEATHER_SHOTS)).toEqual([
      "clear", "sunny-clouds", "approaching-rain", "local-rain", "persisted-snow", "frozen-water", "valley-fog", "windward-lee", "obscured",
    ]);
  });
});
