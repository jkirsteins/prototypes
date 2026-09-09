import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { rule } from "./css";

describe("the map's compositing layers", () => {
  it("puts weather over the shaded ground and under routes, light, and essential marks", () => {
    const viewport = rule(".scroll-x");
    const layers = rule("#mapdyn");
    expect(viewport).toContain("isolation: isolate");
    for (const layer of ["ground: 0", "shade: 1", "weather: 2", "route: 3", "signal: 4", "control: 5"]) {
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
