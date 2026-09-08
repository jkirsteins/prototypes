import { beforeEach, describe, expect, it } from "vitest";
import { calendar } from "../src/sim/calendar";
import { mapRegion } from "../src/sim/mapped";
import { newGame } from "../src/sim/newgame";
import { placeAtSpot } from "../src/sim/position";
import type { Weather } from "../src/sim/types";
import { ambientTemperature } from "../src/sim/weather";
import { placesHtml, weatherHtml } from "../src/ui/panels";
import { mapHtml } from "../src/ui/map";
import { newUiState, resetPanels, setPanel } from "../src/ui/render";
import { bodyPosition, lighting, phaseName, skyHtml, updateSky } from "../src/ui/sky";

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

  it("cuts the moon's dark side to the left while waxing, to the right while waning, over it at new and clear of it at full", () => {
    const { state } = newGame(1);
    const root = document.createElement("div");
    root.innerHTML = skyHtml();
    /**
     * How far the mask's dark disc sits from the lit one at 00:00 after run
     * day d (the run starts at 08:00, so +16 h is midnight). The dark side is
     * cut out of the moon rather than painted over it, so what moves is the
     * black circle inside the mask.
     */
    const shadowX = (d: number) => {
      updateSky(state, calendar(1440 * (d - 1) + 16 * 60), 0, root);
      const moon = Number(root.querySelector("#sky-moon-lit")!.getAttribute("cx"));
      const shadow = Number(root.querySelector("#sky-moon-dark")!.getAttribute("cx"));
      return shadow - moon;
    };
    // Full on 3 April (run day 3): the shadow is a whole diameter aside.
    expect(Math.abs(shadowX(3))).toBeGreaterThan(9);
    // New about 18 April: the shadow sits on the moon.
    expect(Math.abs(shadowX(18))).toBeLessThan(0.6);
    // Waning a week after full: shadow right. Waxing a week before the next full (about 2 May): shadow left.
    expect(shadowX(9)).toBeGreaterThan(4);
    expect(shadowX(26)).toBeLessThan(-4);
  });

  it("names every gradient, filter and mask after its own sky, so two on a page do not share one", () => {
    /**
     * url(#x) and mask=url(#x) are resolved against the whole document, not
     * against the svg they are written in. Thirteen skies on the gallery
     * page with identical ids therefore all drew the FIRST card's cloud,
     * moon phase and sunset - and looked entirely plausible doing it, which
     * is why this is a test rather than a note.
     */
    const refs = (html: string) => [...html.matchAll(/url\(#([^)]+)\)/g)].map((m) => m[1]);
    const ids = (html: string) => [...html.matchAll(/ id="([^"]+)"/g)].map((m) => m[1]);

    const a = skyHtml(undefined, "one");
    const b = skyHtml(undefined, "two");
    // Everything one sky points at, it defines itself.
    for (const r of refs(a)) expect(ids(a)).toContain(r);
    expect(refs(a).length).toBeGreaterThan(4);
    // And nothing it points at belongs to the sky beside it.
    for (const r of refs(a)) expect(refs(b)).not.toContain(r);

    // The game draws one sky and asks for no suffix; what it points at is
    // still its own.
    const plain = skyHtml();
    for (const r of refs(plain)) expect(ids(plain)).toContain(r);
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
    document.body.innerHTML = `<div id="weather"></div><div id="map"></div><div id="camp"></div><div id="maptravel"></div>`;
    resetPanels();
  });

  it("moves the sun and lights the map grid every frame", () => {
    const { state, world } = newGame(21);
    const cal = at(13);
    // The sky is drawn in the weather widget now, not the clock line.
    setPanel("weather", weatherHtml(state, world, cal, ambientTemperature(cal, state.weather)));
    setPanel("map", mapHtml(world, state, newUiState(), cal));
    updateSky(state, cal, ambientTemperature(cal, state.weather));
    const sun = document.querySelector("#sky-sun")!;
    const noonX = Number(sun.getAttribute("cx"));
    const opacity = (sel: string) => Number(document.querySelector(sel)!.getAttribute("opacity"));
    expect(opacity("#sky-sun")).toBe(1);
    // 22:00: the moon is still on the left half of its arc, so its x differs from the noon sun's.
    const night = at(22);
    updateSky(state, night, -3);
    expect(opacity("#sky-sun")).toBe(0);
    expect(opacity("#sky-moon")).toBe(1);
    expect(Number(document.querySelector("#sky-moon")!.getAttribute("cx"))).not.toBe(noonX);
    const grid = document.querySelector<HTMLElement>("#map .grid")!;
    expect(Number(grid.style.getPropertyValue("--bright"))).toBeLessThan(0.6);
    state.weather.precip = "heavy";
    updateSky(state, night, -3);
    expect(grid.classList.contains("snowing")).toBe(true);
    // And under a sky that thick there is no disc left to see.
    expect(opacity("#sky-moon")).toBeLessThan(0.1);
  });

  it("spot distances are from where you stand, with the walking time on the button", () => {
    const { state, world } = newGame(21);
    placeAtSpot(state, world, state.player.region, "forest");
    mapRegion(state, world, state.player.region);
    const cal = at(13);
    setPanel("maptravel", placesHtml(state, world, cal));
    const text = document.querySelector("#maptravel")!.textContent!;
    // Standing at the forest: the forest is where you are, and everywhere
    // else is measured from there rather than from camp.
    expect(text).toContain("the forest you are here");
    // The whole row is the button and what it costs is inside it: "from
    // here" was the same three words on every row and bought nothing.
    expect(text).not.toMatch(/from here/);
    const walk = document.querySelector('#maptravel [data-id="walk"][data-arg="spot:camp"]')!;
    expect(walk.textContent).toMatch(/^camp [\d.]+ km, \d+ min/);
  });
});
