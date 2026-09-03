import { beforeEach, describe, expect, it } from "vitest";
import { calendar } from "../src/sim/calendar";
import { newGame } from "../src/sim/newgame";
import { placeAtSpot } from "../src/sim/position";
import type { Weather } from "../src/sim/types";
import { ambientTemperature } from "../src/sim/weather";
import { clockHtml, regionHtml } from "../src/ui/panels";
import { mapHtml } from "../src/ui/map";
import { newUiState, resetPanels, setPanel } from "../src/ui/render";
import { bodyPosition, lighting, phaseName, updateSky } from "../src/ui/sky";

const clear: Weather = { precip: "none", clear: true, offset: 0, snowCm: 0, rolledDay: 0, storm: null, dryDays: 0, wetDay: false, dryWarned: false, iceCm: 0 };
/** Minutes since the run start for a clock hour on day one. */
const at = (hour: number) => calendar((hour - 8) * 60);

describe("sky arc", () => {
  it("puts the sun on the left horizon at sunrise, high at midday, right at sunset", () => {
    const cal = at(12);
    const rise = bodyPosition(at(cal.sunrise + 0.01));
    const noon = bodyPosition(at(13));
    const set = bodyPosition(at(cal.sunset - 0.01));
    expect(rise.body).toBe("sun");
    expect(rise.x).toBeLessThan(noon.x);
    expect(noon.x).toBeLessThan(set.x);
    expect(noon.y).toBeLessThan(rise.y);
    expect(Math.abs(rise.y - set.y)).toBeLessThan(1);
  });

  it("hands over to the moon at night and brings it across the same arc", () => {
    const early = bodyPosition(at(21));
    const late = bodyPosition(at(28));
    expect(early.body).toBe("moon");
    expect(late.body).toBe("moon");
    expect(early.x).toBeLessThan(late.x);
  });
});

describe("lighting", () => {
  it("is neutral at midday, dark and blue at midnight", () => {
    const day = lighting(at(13), clear, 10);
    const night = lighting(at(25), clear, 0);
    expect(day.brightness).toBe(1);
    expect(day.alpha).toBe(0);
    expect(night.brightness).toBeLessThan(0.7);
    expect(night.alpha).toBeGreaterThan(0.3);
    expect(night.tint).toBe("rgb(26, 42, 108)");
  });

  it("warms toward golden hour and dusk", () => {
    const cal = at(13);
    const golden = lighting(at(cal.sunset - 0.5), clear, 10);
    const dusk = lighting(at(cal.sunset + 0.3), clear, 10);
    expect(golden.alpha).toBeGreaterThan(0.1);
    expect(golden.brightness).toBeGreaterThan(dusk.brightness);
    expect(phaseName(at(cal.sunset - 0.5))).toBe("golden hour");
    expect(phaseName(at(cal.sunset + 0.3))).toBe("dusk");
    expect(phaseName(at(cal.sunrise))).toBe("dawn");
    expect(phaseName(at(13))).toBe("day");
    expect(phaseName(at(25))).toBe("night");
  });

  it("rain darkens and snow whitens", () => {
    const rain = lighting(at(13), { ...clear, precip: "heavy" }, 8);
    const snow = lighting(at(13), { ...clear, precip: "heavy" }, -3);
    expect(rain.precip).toBe("rain");
    expect(snow.precip).toBe("snow");
    expect(rain.brightness).toBeLessThan(1);
    expect(rain.alpha).toBeGreaterThan(0.1);
    expect(snow.tint).not.toBe(rain.tint);
    const overcast = lighting(at(13), { ...clear, clear: false }, 8);
    expect(overcast.brightness).toBeLessThan(1);
    expect(overcast.brightness).toBeGreaterThan(rain.brightness);
  });
});

describe("sky in the page", () => {
  beforeEach(() => {
    document.body.innerHTML = `<div id="clock"></div><div id="map"></div><div id="region"></div>`;
    resetPanels();
  });

  it("moves the sun and lights the map grid every frame", () => {
    const { state, world } = newGame(21);
    const cal = at(13);
    setPanel("clock", clockHtml(state, cal, 5));
    setPanel("map", mapHtml(world, state, newUiState(), cal));
    updateSky(state, cal, ambientTemperature(cal, state.weather));
    const sun = document.querySelector("#sky-sun")!;
    const noonX = Number(sun.getAttribute("cx"));
    expect(sun.getAttribute("opacity")).toBe("1");
    // 22:00: the moon is still on the left half of its arc, so its x differs from the noon sun's.
    const night = at(22);
    updateSky(state, night, -3);
    expect(document.querySelector("#sky-sun")!.getAttribute("opacity")).toBe("0");
    expect(document.querySelector("#sky-moon")!.getAttribute("opacity")).toBe("1");
    expect(Number(document.querySelector("#sky-moon")!.getAttribute("cx"))).not.toBe(noonX);
    const grid = document.querySelector<HTMLElement>("#map .grid")!;
    expect(Number(grid.style.getPropertyValue("--bright"))).toBeLessThan(0.6);
    state.weather.precip = "heavy";
    updateSky(state, night, -3);
    expect(grid.classList.contains("snowing")).toBe(true);
  });

  it("spot distances are from where you stand, with the walking time on the button", () => {
    const { state, world } = newGame(21);
    placeAtSpot(state, world, state.player.region, "forest");
    const cal = at(13);
    setPanel("region", regionHtml(state, world, cal, newUiState()));
    const text = document.querySelector("#region")!.textContent!;
    expect(text).toContain("you are here");
    expect(text).toContain("from here");
    expect(text).toContain("you are at the forest");
    const walk = document.querySelector('#region [data-id="walk"][data-arg="spot:camp"]')!;
    expect(walk.textContent).toMatch(/walk \(\d+ min, \d+ s\)/);
  });
});
