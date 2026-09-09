import { beforeEach, describe, expect, it, vi } from "vitest";
import { calendar } from "../src/sim/calendar";
import { mapRegion } from "../src/sim/mapped";
import { newGame } from "../src/sim/newgame";
import { placeAtSpot } from "../src/sim/position";
import type { Weather } from "../src/sim/types";
import { ambientTemperature } from "../src/sim/weather";
import { placesHtml, weatherHtml } from "../src/ui/panels";
import { mapHtml } from "../src/ui/map";
import { newUiState, resetPanels, setPanel } from "../src/ui/render";
import { bodyPosition, lighting, phaseName, skyHtml, updateSky, WALL } from "../src/ui/sky";
import { siteCamp } from "./siting-helpers";
import { current } from "../src/sim/record";
import { levelMinutes } from "../src/sim/skills";
import { stormOptions } from "../src/sim/body";

const clear: Weather = { precip: "none", clear: true, offset: 0, snowCm: 0, rolledDay: 0, nextStormId: 1, stormFreeSince: 0, storm: null, dryDays: 0, wetDay: false, dryWarned: false, iceCm: 0 };
/** Minutes since the run start for a clock hour on day one. */
const at = (hour: number) => calendar((hour - 8) * 60);

describe("forecast knowledge in the weather wall", () => {
  it.each(["snow", "gale"] as const)("reads stored %s only at an earned stage, without leaking it into stage-one markup", (kind) => {
    resetPanels();
    document.body.innerHTML = '<div id="weather"></div>';
    const { state, world } = newGame(17);
    current(state).person.quirks = [];
    state.weather.offset = 30;
    state.weather.precip = "none";
    state.weather.snowCm = 0;
    state.weather.iceCm = 0;
    state.weather.storm = { id: 1, source: "natural", kind, from: 60, until: 420, warned: false };
    const cal = calendar(0);
    const render = () => {
      setPanel("weather", weatherHtml(state, world, cal, 15));
      updateSky(state, cal, 15);
      return document.querySelector("#weather")!.innerHTML;
    };
    const noviceSnow = render();
    const sky = document.querySelector("svg.sky");
    state.weather.storm.kind = "rain";
    expect(render()).toBe(noviceSnow);
    state.weather.storm.kind = kind;
    state.skills.weatherSense.xp = levelMinutes(13);
    render();
    expect(document.querySelector("[data-weather-forecast]")?.textContent).toBe(`heavy ${kind} storm in 1 h`);
    expect(sky?.getAttribute("aria-label")).toBe(`sky: heavy ${kind} storm in 1 h`);
    expect(document.querySelector("svg.sky")).toBe(sky);
    state.skills.weatherSense.xp = 0;
    expect(render()).toBe(noviceSnow);
    expect(document.querySelector("svg.sky")).toBe(sky);
  });

  it("hides distant storms and reveals arrival, kind, severity and duration only as learned", () => {
    const { state, world } = newGame(17);
    current(state).person.quirks = [];
    state.weather.offset = 15;
    state.weather.storm = { id: 1, source: "natural", kind: "rain", from: 100, until: 460, warned: false };
    const line = () => {
      const root = document.createElement("div");
      root.innerHTML = weatherHtml(state, world, calendar(state.minute), 15);
      return root.querySelector("[data-weather-forecast]")?.textContent ?? "";
    };
    expect(line()).toBe("");
    state.minute = 40;
    expect(line()).toBe("a storm is coming");
    state.skills.weatherSense.xp = levelMinutes(13);
    expect(line()).toBe("heavy rain storm in 1 h");
    state.skills.weatherSense.xp = levelMinutes(25);
    expect(line()).toBe("heavy rain storm in 1 h, lasting 6 h");
    state.minute = 100;
    state.skills.weatherSense.xp = 0;
    expect(line()).toBe("storm");
  });

  it("describes the same recommended option as the body without leaking hidden storm detail", () => {
    const { state, world } = newGame(17);
    current(state).person.quirks = [];
    state.weather.storm = { id: 12, source: "natural", kind: "gale", from: 60, until: 500, warned: false };
    const render = () => {
      const root = document.createElement("div");
      root.innerHTML = weatherHtml(state, world, calendar(0), 15);
      return root;
    };
    const plan = stormOptions(state, world, state.weather.storm);
    const first = render();
    const line = first.querySelector<HTMLElement>("[data-weather-plan]")!;
    expect(line.dataset.weatherPlan).toBe(plan.recommended);
    expect(line.textContent).toBe("plan: shelter here");
    const markup = first.innerHTML;
    state.weather.storm.kind = "snow";
    state.weather.storm.until = 900;
    expect(render().innerHTML).toBe(markup);
  });

  it("updates accessible forecast detail without replacing the painted sky", () => {
    resetPanels();
    document.body.innerHTML = '<div id="weather"></div>';
    const { state, world } = newGame(17);
    current(state).person.quirks = [];
    state.weather.offset = 15;
    state.weather.storm = { id: 1, source: "natural", kind: "rain", from: 60, until: 420, warned: false };
    const cal = calendar(0);
    setPanel("weather", weatherHtml(state, world, cal, 15));
    updateSky(state, cal, 15);
    const sky = document.querySelector("svg.sky");
    expect(sky?.getAttribute("aria-label")).toContain("a storm is coming");
    state.skills.weatherSense.xp = levelMinutes(25);
    setPanel("weather", weatherHtml(state, world, cal, 15));
    updateSky(state, cal, 15);
    expect(document.querySelector("svg.sky")).toBe(sky);
    expect(sky?.getAttribute("aria-label")).toContain("lasting 6 h");
    state.skills.weatherSense.xp = 0;
    updateSky(state, cal, 15);
    expect(sky?.getAttribute("aria-label")).not.toMatch(/rain|6 h|1 h/);
  });
});

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

  it("leaves the day phase out of the weather card", () => {
    const { state, world } = newGame(21);
    const cal = at(22);
    setPanel("weather", weatherHtml(state, world, cal, ambientTemperature(cal, state.weather)));
    updateSky(state, cal, ambientTemperature(cal, state.weather));
    expect(document.querySelector("#weather #sky-label")).toBeNull();
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
    const viewport = document.querySelector<HTMLElement>("#map .scroll-x")!;
    expect(Number(viewport.style.getPropertyValue("--bright"))).toBeLessThan(0.6);
    state.weather.precip = "heavy";
    updateSky(state, night, -3);
    expect(viewport.classList.contains("snowing")).toBe(true);
    // And under a sky that thick there is no disc left to see.
    expect(opacity("#sky-moon")).toBeLessThan(0.1);
  });

  it("keeps one varied constellation star pattern through a clear night and hides it by day or cloud", () => {
    const { state } = newGame(21);
    const root = document.createElement("div");
    root.innerHTML = skyHtml(WALL);
    const visibleConstellation = () => root.querySelector<SVGElement>('[data-constellation][opacity="1"]')?.id;
    const opacity = (id: string) => root.querySelector(id)?.getAttribute("opacity");

    const evening = at(22);
    updateSky(state, evening, -3, root);
    const first = visibleConstellation();
    expect(first).toBeTruthy();
    expect(root.querySelector(".sky-constellation polyline")).toBeNull();
    expect(root.querySelector("#sky-milky-way")).not.toBeNull();
    expect(opacity("#sky-milky-way")).not.toBe("0");
    expect(opacity("#sky-stars")).not.toBe("0");

    updateSky(state, at(28), -3, root);
    expect(visibleConstellation()).toBe(first);

    const nights = new Set<string>();
    for (let day = 0; day < 8; day++) {
      updateSky(state, calendar((22 - 8) * 60 + day * 1440), -3, root);
      const constellation = visibleConstellation();
      if (constellation) nights.add(constellation);
    }
    expect(nights.size).toBeGreaterThan(2);

    const { state: otherState } = newGame(22);
    updateSky(otherState, evening, -3, root);
    expect(visibleConstellation()).not.toBe(first);

    updateSky(state, at(13), 10, root);
    expect(visibleConstellation()).toBeUndefined();
    expect(opacity("#sky-stars")).toBe("0");
    expect(Number(opacity("#sky-milky-way"))).toBe(0);

    state.weather.clear = false;
    updateSky(state, evening, -3, root);
    expect(visibleConstellation()).toBeUndefined();
    expect(opacity("#sky-stars")).toBe("0");

    state.weather.clear = true;
    state.weather.precip = "light";
    updateSky(state, evening, -3, root);
    expect(visibleConstellation()).toBeUndefined();
    expect(opacity("#sky-stars")).toBe("0");
  });

  it("projects fixed RA/Dec stars and the real galactic plane at the sidereal rate", () => {
    const { state } = newGame(21);
    const root = document.createElement("div");
    root.innerHTML = skyHtml(WALL);
    const angle = () => Number(root.querySelector("#sky-celestial")?.getAttribute("data-sidereal-angle"));
    const forward = (from: number, to: number) => (to - from + 360) % 360;

    const night = calendar((22 - 8) * 60, 172);
    updateSky(state, night, -3, root);
    const first = angle();
    updateSky(state, calendar((23 - 8) * 60, 172), -3, root);
    expect(forward(first, angle())).toBeCloseTo(15.041, 2);

    updateSky(state, calendar((22 - 8) * 60 + 1440, 172), -3, root);
    expect(forward(first, angle())).toBeCloseTo(0.986, 2);

    updateSky(state, calendar((24 - 8) * 60 - 1, 364), -3, root);
    const yearEnd = angle();
    updateSky(state, calendar((24 - 8) * 60, 364), -3, root);
    expect(forward(yearEnd, angle())).toBeCloseTo(360 / (23 * 60 + 56 + 4 / 60), 3);

    const september = calendar((20.4 - 8) * 60, 243);
    updateSky(state, september, -3, root);
    const celestial = root.querySelector("#sky-celestial");
    expect(celestial?.getAttribute("data-coordinate-system")).toBe("horizontal");
    expect(Number(celestial?.getAttribute("data-galactic-center-alt"))).toBeCloseTo(-1.057, 3);
    expect(root.querySelector("#sky-milky-plane")?.getAttribute("d")).toMatch(/^M /);
    expect(root.querySelector("#sky-milky-way")?.getAttribute("clip-path")).toContain("sky-horizon");

    const stars = [...root.querySelectorAll<SVGCircleElement>(".sky-field-star")];
    expect(stars.length).toBeGreaterThan(800);
    expect(stars.every((star) => star.hasAttribute("data-ra") && star.hasAttribute("data-dec"))).toBe(true);
    const visibleBefore = new Map(stars
      .filter((star) => star.getAttribute("opacity") !== "0")
      .map((star) => [star, star.getAttribute("cx")]));
    updateSky(state, calendar((21.4 - 8) * 60, 243), -3, root);
    expect([...visibleBefore].some(([star, x]) => (
      star.getAttribute("opacity") !== "0" && star.getAttribute("cx") !== x
    ))).toBe(true);
  });

  it("reuses the celestial projection throughout one displayed game minute", () => {
    const { state } = newGame(21);
    const root = document.createElement("div");
    root.innerHTML = skyHtml(WALL);
    const minute = calendar((22 - 8) * 60, 172);
    updateSky(state, minute, -3, root);
    const star = root.querySelector<SVGCircleElement>(".sky-field-star")!;
    const writes = vi.spyOn(star, "setAttribute");

    updateSky(state, minute, -3, root);
    expect(writes).not.toHaveBeenCalled();
    updateSky(state, calendar((22 - 8) * 60 + 1, 172), -3, root);
    expect(writes).toHaveBeenCalled();
  });

  it("draws the terrain as one opaque colourless silhouette", () => {
    const { state } = newGame(21, 172);
    const root = document.createElement("div");
    root.innerHTML = skyHtml(WALL);
    const fills = () => ["#sky-far", "#sky-mid", "#sky-near"]
      .map((id) => root.querySelector(id)?.getAttribute("fill"));
    const summer = calendar((13 - 8) * 60, 172);

    updateSky(state, summer, 14, root);
    const summerFills = fills();
    expect(new Set(summerFills)).toEqual(new Set(["#050505"]));
    expect(root.querySelector("#sky-trees")).toBeNull();
    for (const id of ["#sky-far", "#sky-mid", "#sky-near"]) {
      const opacity = root.querySelector(id)?.getAttribute("opacity");
      expect(opacity === null || opacity === "1").toBe(true);
    }

    state.weather.clear = false;
    updateSky(state, summer, 14, root);
    expect(fills()).toEqual(summerFills);

    state.weather.clear = true;
    const winter = calendar((13 - 8) * 60, 350);
    updateSky(state, winter, -5, root);
    expect(fills()).toEqual(summerFills);

    state.weather.snowCm = 20;
    updateSky(state, winter, -5, root);
    expect(fills()).toEqual(summerFills);
  });

  it("shows Perseid streaks only on clear nights in their late-summer window", () => {
    const { state } = newGame(21, 223);
    const root = document.createElement("div");
    root.innerHTML = skyHtml(WALL);
    const opacity = () => root.querySelector("#sky-perseids")?.getAttribute("opacity");

    updateSky(state, calendar((22 - 8) * 60, 223), 12, root);
    expect(root.querySelectorAll("#sky-perseids .sky-meteor").length).toBeGreaterThan(2);
    expect(root.querySelector("#sky-celestial #sky-perseids")).toBeNull();
    expect(opacity()).toBe("1");

    state.weather.clear = false;
    updateSky(state, calendar((22 - 8) * 60, 223), 12, root);
    expect(opacity()).toBe("0");

    state.weather.clear = true;
    updateSky(state, calendar((22 - 8) * 60, 250), 12, root);
    expect(opacity()).toBe("0");
  });

  it("spot distances are from where you stand, with the walking time on the button", () => {
    const { state, world } = newGame(21);
    siteCamp(state, world);
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
    expect(walk.textContent).toMatch(/^camp [\d.]+ km/);
    expect(walk.textContent).not.toMatch(/\d+ min/);
  });
});
