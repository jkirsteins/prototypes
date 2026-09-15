import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { calendar } from "../src/sim/calendar";
import * as celestial from "../src/sim/celestial";
import { mapRegion } from "../src/sim/mapped";
import { newGame } from "../src/sim/newgame";
import { placeAtSpot } from "../src/sim/position";
import type { Weather } from "../src/sim/types";
import { ambientTemperature, conditionsAt } from "../src/sim/weather";
import { cellOf } from "../src/sim/position";
import type { GameState } from "../src/sim/types";
import type { World } from "../src/world/gen";
import { placesHtml, weatherHtml } from "../src/ui/panels";
import { mapHtml } from "../src/ui/map";
import { newUiState, resetPanels, setPanel } from "../src/ui/render";
import {
  bodyOpacity, bodyPosition, lighting, moonShadowOffset, nightConstellation, phaseName, skyHtml, skyModelFor,
  updateSky, WALL,
} from "../src/ui/sky";
import { siteCamp } from "./siting-helpers";
import { current } from "../src/sim/record";
import { levelMinutes } from "../src/sim/skills";
import { stormOptions } from "../src/sim/body";

/** The first landing whose local air is clear: the sky tests that need an open sky say so rather than hoping. */
function clearSkyGame(): { state: GameState; world: World } {
  for (const seed of [31, 39, 19, 33, 12]) {
    const game = newGame(seed);
    const cal = calendar(game.state.minute, game.state.startDoy);
    if (conditionsAt(game.state, game.world, cal, cellOf(game.state, game.world)).cloud < 0.05) return game;
  }
  throw new Error("no clear landing among the sampled seeds");
}

const clear: Weather = { precip: "none", clear: true, offset: 0, snowCm: 0, rolledDay: 0, nextStormId: 1, stormFreeSince: 0, storm: null, dryDays: 0, wetDay: false, dryWarned: false, iceCm: 0 };
/** Minutes since the run start for a clock hour on day one. */
const at = (hour: number) => calendar((hour - 8) * 60);

// A test that installs a controlled atmosphere owns it only for its own case.
afterEach(() => vi.restoreAllMocks());

/**
 * Drives a real 2D canvas API in tests: happy-dom's `getContext("2d")`
 * returns null, so a recorder stands in - one canvas at a time, an own
 * property shadowing the prototype method, so the offscreen buffers the
 * moon and clouds use elsewhere stay null and skip themselves exactly as
 * they do in any environment without canvas support.
 */
interface RecordedCall { method: string; args: unknown[] }
function stubCanvas(canvas: HTMLCanvasElement): RecordedCall[] {
  const calls: RecordedCall[] = [];
  const record = (method: string) => (...args: unknown[]) => {
    calls.push({ method, args });
    if (method === "createLinearGradient" || method === "createRadialGradient") return { addColorStop: () => {} };
    if (method === "createImageData") return { data: new Uint8ClampedArray(4), width: 1, height: 1 };
    return undefined;
  };
  const ctx = new Proxy({} as CanvasRenderingContext2D, {
    get(_target, prop: string) {
      if (prop === "canvas") return canvas;
      return record(prop);
    },
    set(_target, prop: string, value) {
      calls.push({ method: `set:${prop}`, args: [value] });
      return true;
    },
  });
  canvas.getContext = ((() => ctx) as unknown) as typeof canvas.getContext;
  return calls;
}

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
      return document.querySelector("#weather")!;
    };
    const noviceSnow = render().cloneNode(true);
    const sky = document.querySelector("canvas.sky");
    state.weather.storm.kind = "rain";
    expect(render().isEqualNode(noviceSnow)).toBe(true);
    state.weather.storm.kind = kind;
    state.skills.weatherSense.xp = levelMinutes(13);
    render();
    expect(document.querySelector("[data-weather-forecast]")?.textContent).toBe(`heavy ${kind} storm in 1 h`);
    expect(sky?.getAttribute("aria-label")).toBe(`sky: heavy ${kind} storm in 1 h`);
    expect(document.querySelector("canvas.sky")).toBe(sky);
    state.skills.weatherSense.xp = 0;
    expect(render().isEqualNode(noviceSnow)).toBe(true);
    expect(document.querySelector("canvas.sky")).toBe(sky);
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

  it("shows the vague teaching sign before ordinary forecast knowledge", () => {
    const { state, world } = newGame(17);
    current(state).person.quirks = [];
    state.minute = 10;
    state.weather.storm = { id: 9, source: "natural", kind: "gale", from: 100, until: 460, warned: false };
    state.opportunities.context.weather = {
      opportunity: "readWeather", status: "announced", createdAt: 0, attempts: 1,
      stormId: 9, source: "natural", area: null, announcedAt: 10, resolvedAt: null,
      minutesByProtection: [0, 0, 0, 0], atCampMinutes: 0, awayFromCampMinutes: 0, maxWetness: 0,
    };

    const root = document.createElement("div");
    root.innerHTML = weatherHtml(state, world, calendar(state.minute), 15);

    expect(root.querySelector("[data-weather-forecast]")?.textContent).toBe("conditions are changing");
    expect(root.querySelector("[data-weather-plan]")).toBeNull();
    expect(root.textContent).not.toContain("gale");
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
    const sky = document.querySelector("canvas.sky");
    expect(sky?.getAttribute("aria-label")).toContain("a storm is coming");
    state.skills.weatherSense.xp = levelMinutes(25);
    setPanel("weather", weatherHtml(state, world, cal, 15));
    updateSky(state, cal, 15);
    expect(document.querySelector("canvas.sky")).toBe(sky);
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
    // The dark side is erased out of the lit disc rather than painted over
    // it, and what erases it slides by this offset - a whole diameter aside
    // at full, on top of the disc at new.
    const offsetOn = (d: number) => moonShadowOffset(calendar(1440 * (d - 1) + 16 * 60));
    // Full on 3 April (run day 3): the shadow is a whole diameter aside.
    expect(Math.abs(offsetOn(3))).toBeGreaterThan(9);
    // New about 18 April: the shadow sits on the moon.
    expect(Math.abs(offsetOn(18))).toBeLessThan(0.6);
    // Waning a week after full: shadow right. Waxing a week before the next full (about 2 May): shadow left.
    expect(offsetOn(9)).toBeGreaterThan(4);
    expect(offsetOn(26)).toBeLessThan(-4);
  });

  it("keeps two skies with different local weather from leaking into each other", () => {
    // Two canvases used to share ids across the whole document - a gradient,
    // a filter, a mask defined by the first sky also drew the second one's
    // cloud and moon phase. A canvas has no such ids to collide over, but
    // the dataset each sky writes must still describe only itself.
    document.body.innerHTML = `<div id="one">${skyHtml(WALL, "one")}</div><div id="two">${skyHtml(WALL, "two")}</div>`;
    const { state } = newGame(21);
    const cal = at(14);
    state.weather.clear = false;
    state.weather.precip = "heavy";
    updateSky(state, cal, 5, document.querySelector("#one")!);
    document.querySelector<HTMLCanvasElement>("#two canvas")!.dataset.weatherCloud = "0";
    document.querySelector<HTMLCanvasElement>("#two canvas")!.dataset.weatherRate = "0";
    document.querySelector<HTMLCanvasElement>("#two canvas")!.dataset.weatherRain = "0";
    document.querySelector<HTMLCanvasElement>("#two canvas")!.dataset.weatherSnow = "0";
    document.querySelector<HTMLCanvasElement>("#two canvas")!.dataset.weatherPrecip = "none";
    document.querySelector<HTMLCanvasElement>("#two canvas")!.dataset.weatherTemperature = "12";
    document.querySelector<HTMLCanvasElement>("#two canvas")!.dataset.weatherWindX = "0";
    document.querySelector<HTMLCanvasElement>("#two canvas")!.dataset.weatherWindY = "0";
    document.querySelector<HTMLCanvasElement>("#two canvas")!.dataset.weatherWindSpeed = "0";
    document.querySelector<HTMLCanvasElement>("#two canvas")!.dataset.weatherFog = "0";
    updateSky(state, cal, 5, document.querySelector("#two")!);
    const one = document.querySelector<HTMLCanvasElement>("#one canvas")!;
    const two = document.querySelector<HTMLCanvasElement>("#two canvas")!;
    expect(one.dataset.skyPrecip).toBe("rain");
    expect(two.dataset.skyPrecip).toBe("none");
  });

  it("names every sky's markup after its own uid without needing it to draw", () => {
    const a = skyHtml(undefined, "one");
    const b = skyHtml(undefined, "two");
    expect(a).toContain('data-sky-uid="one"');
    expect(b).toContain('data-sky-uid="two"');
    const plain = skyHtml();
    expect(plain).toContain('data-sky-uid=""');
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

  it("never fully hides the sun behind cloud, the way a disc still shows through an overcast deck", () => {
    expect(bodyOpacity(0)).toBe(1);
    expect(bodyOpacity(1)).toBeCloseTo(0.08, 5);
    expect(bodyOpacity(0.5)).toBeGreaterThan(bodyOpacity(1));
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
    // The sun is drawn through the air the survivor is standing under, so this
    // one needs a landing whose own sky is clear rather than any landing.
    const { state, world } = clearSkyGame();
    const cal = at(13);
    setPanel("weather", weatherHtml(state, world, cal, ambientTemperature(cal, state.weather)));
    setPanel("map", mapHtml(world, state, newUiState(), cal));
    updateSky(state, cal, ambientTemperature(cal, state.weather));
    const noon = bodyPosition(cal, WALL);
    expect(noon.body).toBe("sun");
    // 22:00: the moon is still on the left half of its arc, so its x differs from the noon sun's.
    const night = at(22);
    updateSky(state, night, -3);
    const evening = bodyPosition(night, WALL);
    expect(evening.body).toBe("moon");
    expect(evening.x).not.toBe(noon.x);
    const viewport = document.querySelector<HTMLElement>("#map .scroll-x")!;
    expect(Number(viewport.style.getPropertyValue("--bright"))).toBeLessThan(0.6);
    // Precipitation belongs to coordinate-matched glyphs, never a global
    // viewport class laid over unrelated local conditions.
    expect(viewport.classList.contains("snowing")).toBe(false);
    expect(viewport.classList.contains("rain")).toBe(false);
  });

  it("keeps one varied constellation star pattern through a clear night and hides it by day or cloud", () => {
    const { state } = newGame(21);
    // The run begins under whatever sky the landing has; the clear night this
    // case is about is stated rather than hoped for.
    state.weather.clear = true;
    state.weather.precip = "none";
    const root = document.createElement("div");
    root.innerHTML = skyHtml(WALL);
    const canvas = () => root.querySelector<HTMLCanvasElement>("canvas.sky")!;

    const evening = at(22);
    updateSky(state, evening, -3, root);
    const first = canvas().dataset.skyConstellation;
    expect(first).toBeTruthy();
    expect(canvas().dataset.skyMilkyWay).not.toBe("0.00");
    expect(canvas().dataset.skyStars).not.toBe("0.00");

    updateSky(state, at(28), -3, root);
    expect(canvas().dataset.skyConstellation).toBe(first);

    const nights = new Set<string>();
    for (let day = 0; day < 8; day++) {
      const cal = calendar((22 - 8) * 60 + day * 1440);
      updateSky(state, cal, -3, root);
      const constellation = canvas().dataset.skyConstellation;
      expect(constellation).toBe(String(nightConstellation(state.seed, cal.dayIndex)));
      if (constellation) nights.add(constellation);
    }
    expect(nights.size).toBeGreaterThan(2);
    // Every pattern shown is one of the four fixed shapes.
    expect([...nights].every((n) => Number(n) >= 0 && Number(n) < 4)).toBe(true);

    const { state: otherState } = newGame(22);
    otherState.weather.clear = true;
    otherState.weather.precip = "none";
    updateSky(otherState, evening, -3, root);
    // A different seed need not pick the same pattern; the point is that the
    // choice is a function of seed and night, not drawn fresh every call.
    const otherNightIndex = evening.dayIndex - (evening.hour < evening.sunrise ? 1 : 0);
    expect(canvas().dataset.skyConstellation).toBe(String(nightConstellation(otherState.seed, otherNightIndex)));

    updateSky(state, at(13), 10, root);
    expect(canvas().dataset.skyConstellation).toBe("");
    expect(canvas().dataset.skyStars).toBe("0.00");
    expect(canvas().dataset.skyMilkyWay).toBe("0.00");

    state.weather.clear = false;
    updateSky(state, evening, -3, root);
    expect(canvas().dataset.skyConstellation).toBe("");
    expect(canvas().dataset.skyStars).toBe("0.00");

    state.weather.clear = true;
    state.weather.precip = "light";
    updateSky(state, evening, -3, root);
    expect(canvas().dataset.skyConstellation).toBe("");
    expect(canvas().dataset.skyStars).toBe("0.00");
  });

  it("projects fixed RA/Dec stars and the real galactic plane at the sidereal rate", () => {
    const { state } = newGame(21);
    const root = document.createElement("div");
    root.innerHTML = skyHtml(WALL);
    const canvas = () => root.querySelector<HTMLCanvasElement>("canvas.sky")!;
    const angle = () => Number(canvas().dataset.skySiderealAngle);
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
    expect(Number(canvas().dataset.skyGalacticCenterAlt)).toBeCloseTo(-1.057, 3);
    const plane = celestial.projectGalacticPlane(angle(), WALL.w, WALL.groundY);
    expect(plane.length).toBeGreaterThan(0);

    const model = skyModelFor(WALL);
    expect(model.fieldStars.length).toBeGreaterThan(800);
    expect(model.fieldStars.every((s) => Number.isFinite(s.raDeg) && Number.isFinite(s.decDeg))).toBe(true);
    // A star visible in September's 20:24 sky at one sidereal angle projects
    // to a different point an hour of sidereal time later, the way a fixed
    // point on a turning sky does.
    const before = celestial.projectSouth(celestial.equatorialToHorizontal({ raDeg: model.fieldStars[0].raDeg, decDeg: model.fieldStars[0].decDeg }, angle()), WALL.w, WALL.groundY);
    updateSky(state, calendar((21.4 - 8) * 60, 243), -3, root);
    const after = celestial.projectSouth(celestial.equatorialToHorizontal({ raDeg: model.fieldStars[0].raDeg, decDeg: model.fieldStars[0].decDeg }, angle()), WALL.w, WALL.groundY);
    expect(before.x).not.toBeCloseTo(after.x, 3);
  });

  it("recomputes the celestial projection only when the displayed minute changes", () => {
    const { state } = newGame(21);
    const root = document.createElement("div");
    root.innerHTML = skyHtml(WALL);
    const minute = calendar((22 - 8) * 60, 172);
    updateSky(state, minute, -3, root);
    const spy = vi.spyOn(celestial, "equatorialToHorizontal");

    updateSky(state, minute, -3, root);
    expect(spy).not.toHaveBeenCalled();
    updateSky(state, calendar((22 - 8) * 60 + 1, 172), -3, root);
    expect(spy).toHaveBeenCalled();
  });

  it("draws no star when none is above the horizon, and draws many under a clear night", () => {
    const { state } = newGame(21, 172);
    state.weather.clear = true;
    state.weather.precip = "none";
    const root = document.createElement("div");
    root.innerHTML = skyHtml(WALL);
    const canvas = root.querySelector<HTMLCanvasElement>("canvas.sky")!;
    const calls = stubCanvas(canvas);

    updateSky(state, at(13), 14, root);
    const daytimeArcs = calls.filter((c) => c.method === "arc").length;

    calls.length = 0;
    updateSky(state, at(22), -3, root);
    const nightArcs = calls.filter((c) => c.method === "arc").length;

    // Daytime draws only the horizon guide and the sun's own disc; a clear
    // night draws those plus every star and dust point above the horizon.
    expect(daytimeArcs).toBeLessThanOrEqual(2);
    expect(nightArcs).toBeGreaterThan(500);
  });

  it("draws the terrain as one opaque colourless silhouette regardless of weather or season", () => {
    const { state } = newGame(21, 172);
    const root = document.createElement("div");
    root.innerHTML = skyHtml(WALL);
    const canvas = root.querySelector<HTMLCanvasElement>("canvas.sky")!;
    const ridgeFills = () => {
      const calls = stubCanvas(canvas);
      updateSky(state, calendar((13 - 8) * 60, state.startDoy), 14, root);
      return calls.filter((c) => c.method === "set:fillStyle" && c.args[0] === "#050505").length;
    };

    expect(ridgeFills()).toBe(3);

    state.weather.clear = false;
    expect(ridgeFills()).toBe(3);

    state.weather.clear = true;
    state.weather.snowCm = 20;
    expect(ridgeFills()).toBe(3);
  });

  it("shows Perseid streaks only on clear nights in their late-summer window", () => {
    const { state } = newGame(21, 223);
    state.weather.clear = true;
    state.weather.precip = "none";
    const root = document.createElement("div");
    root.innerHTML = skyHtml(WALL);
    const canvas = () => root.querySelector<HTMLCanvasElement>("canvas.sky")!;

    updateSky(state, calendar((22 - 8) * 60, 223), 12, root);
    expect(canvas().dataset.skyPerseids).toBe("1");

    state.weather.clear = false;
    updateSky(state, calendar((22 - 8) * 60, 223), 12, root);
    expect(canvas().dataset.skyPerseids).toBe("0");

    state.weather.clear = true;
    updateSky(state, calendar((22 - 8) * 60, 250), 12, root);
    expect(canvas().dataset.skyPerseids).toBe("0");
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
