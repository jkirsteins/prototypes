/**
 * The sky: stars, the Milky Way, cloud, precipitation, the sun, the moon,
 * meteors and constellations, all drawn on one canvas.
 *
 * This used to be an SVG carrying 4,226 star circles that CSS transitioned
 * and `projectCoordinateStars` rewrote ten times a second, in daylight as
 * well as at night - the single largest style-recalculation cost on the
 * page. A canvas has no per-element style to recalculate: the whole picture
 * is one paint, however many stars are in it.
 *
 * The pattern here is the one the map and effects canvases copy next:
 * - One canvas per sky, sized in device pixels and scaled by
 *   `devicePixelRatio` (`ensureCanvasSize`), so it stays sharp on retina.
 * - A palette of plain constants, resolved once at module load rather than
 *   read from CSS per draw call (there is no theme dependency here today;
 *   the constants below ARE that resolved-once palette).
 * - The sky's own data - star positions, magnitudes, colours, the ridge
 *   silhouettes, the cloud noise masks - is generated once per shape and
 *   cached (`skyModelFor`), not rebuilt every frame or every instance.
 * - Decorative motion (cloud drift, falling rain and snow, meteors) runs
 *   from a real clock and keeps the existing ten-times-a-second cadence;
 *   under reduced motion the frame is drawn once and left alone
 *   (`shouldRedraw`), rather than continuing to redraw a picture nothing is
 *   asking to change.
 */
import type { Calendar } from "../sim/calendar";
import {
  equatorialToHorizontal,
  GALACTIC_CENTER,
  galacticToEquatorial,
  localSiderealDegrees,
  projectGalacticPlane,
  projectSouth,
  type HorizontalCoordinate,
  type ProjectedGalacticPoint,
} from "../sim/celestial";
import type { AtmosphereSample, GameState, Weather } from "../sim/types";
import { forecastText, localStorm, stormNow } from "../sim/weather";
import { clamp } from "../units";
import { heldQuery, heldQueryAll } from "./render";

export const SKY_W = 220;
export const SKY_H = 64;

/**
 * The shape one sky is drawn at.
 *
 * The strip is what the clock used to carry. The wall is the weather
 * widget's whole background, which is the same sky drawn tall: the sun
 * still climbs its arc and the ground still sits along the bottom, so the
 * picture reads the same at either size and only one set of rules draws
 * it.
 */
export interface SkyGeom { w: number; h: number; groundY: number; arcR: number; cx: number }

export function skyGeom(w: number, h: number): SkyGeom {
  const groundY = Math.round(h * 0.86);
  return { w, h, groundY, arcR: Math.min(w / 2 - 10, groundY - 12), cx: w / 2 };
}

export const STRIP: SkyGeom = skyGeom(SKY_W, SKY_H);
export const WALL: SkyGeom = skyGeom(240, 220);

export interface BodyPos { body: "sun" | "moon"; x: number; y: number; /** 0 at rising, 1 at setting */ t: number }

/** Sun by day, moon by night, each crossing the same arc left to right. */
export function bodyPosition(cal: Calendar, g: SkyGeom = STRIP): BodyPos {
  const day = cal.sunset - cal.sunrise;
  let body: "sun" | "moon";
  let t: number;
  if (!cal.isNight) {
    body = "sun";
    t = (cal.hour - cal.sunrise) / Math.max(0.1, day);
  } else {
    body = "moon";
    const night = 24 - day;
    const since = cal.hour >= cal.sunset ? cal.hour - cal.sunset : cal.hour + 24 - cal.sunset;
    t = since / Math.max(0.1, night);
  }
  t = clamp(t, 0, 1);
  const angle = Math.PI * (1 - t);
  return { body, t, x: g.cx + g.arcR * Math.cos(angle), y: g.groundY - g.arcR * Math.sin(angle) };
}

export interface Lighting {
  brightness: number;
  saturation: number;
  /** css colour laid over the map */
  tint: string;
  alpha: number;
  /** gradient for the sky strip */
  skyTop: string;
  skyBottom: string;
  /** the cloud in this light: the mass of it, and the tops catching what is left */
  cloudLow: string;
  cloudHigh: string;
  precip: "none" | "rain" | "snow";
}

type RGB = [number, number, number];
const NIGHT: RGB = [26, 42, 108];
const DAWN: RGB = [224, 138, 90];
const GOLDEN: RGB = [240, 176, 64];
const DUSK: RGB = [150, 70, 130];
const GREY: RGB = [120, 130, 145];
const CLOUD: RGB = [166, 177, 192];
/** The sun overhead, and the sun on the horizon: it reddens as it goes down, the way it does. */
const SUN_HIGH: RGB = [255, 214, 107];
const SUN_LOW: RGB = [255, 116, 92];
/** The glow left on the horizon: colder and rosier at first light, deeper and redder at last. */
const GLOW_DAWN: RGB = [255, 150, 140];
const GLOW_DUSK: RGB = [255, 104, 88];
const WHITE: RGB = [255, 255, 255];
const RAIN: RGB = [74, 106, 138];
const SNOW: RGB = [207, 216, 232];

const SKY_NIGHT: [RGB, RGB] = [[6, 10, 30], [20, 30, 70]];
const SKY_DAWN: [RGB, RGB] = [[70, 90, 160], [240, 150, 100]];
const SKY_DAY: [RGB, RGB] = [[70, 130, 210], [150, 195, 240]];
const SKY_GOLDEN: [RGB, RGB] = [[90, 120, 190], [245, 180, 90]];
const SKY_DUSK: [RGB, RGB] = [[30, 30, 90], [200, 90, 120]];

function mix(a: RGB, b: RGB, t: number): RGB {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}
function css(c: RGB): string {
  return `rgb(${Math.round(c[0])}, ${Math.round(c[1])}, ${Math.round(c[2])})`;
}
function smooth(t: number): number {
  const x = clamp(t, 0, 1);
  return x * x * (3 - 2 * x);
}

interface Phase { brightness: number; saturation: number; tint: RGB; alpha: number; sky: [RGB, RGB] }
const P_NIGHT: Phase = { brightness: 0.55, saturation: 0.6, tint: NIGHT, alpha: 0.35, sky: SKY_NIGHT };
const P_DAWN: Phase = { brightness: 0.8, saturation: 0.9, tint: DAWN, alpha: 0.25, sky: SKY_DAWN };
const P_DAY: Phase = { brightness: 1, saturation: 1, tint: DAWN, alpha: 0, sky: SKY_DAY };
const P_GOLDEN: Phase = { brightness: 0.95, saturation: 1.1, tint: GOLDEN, alpha: 0.22, sky: SKY_GOLDEN };
const P_DUSK: Phase = { brightness: 0.7, saturation: 0.8, tint: DUSK, alpha: 0.3, sky: SKY_DUSK };

function lerpPhase(a: Phase, b: Phase, t: number): Phase {
  const s = smooth(t);
  return {
    brightness: a.brightness + (b.brightness - a.brightness) * s,
    saturation: a.saturation + (b.saturation - a.saturation) * s,
    tint: mix(a.tint, b.tint, s),
    alpha: a.alpha + (b.alpha - a.alpha) * s,
    sky: [mix(a.sky[0], b.sky[0], s), mix(a.sky[1], b.sky[1], s)],
  };
}

/**
 * The light for this hour: night until 45 minutes before sunrise, dawn
 * across sunrise, day, golden hour for the 90 minutes before sunset, dusk
 * across sunset, and night again. Hours here are relative, so a five-hour
 * midwinter day is mostly dawn and dusk, which is what it looks like.
 */
export function phaseFor(hour: number, sunrise: number, sunset: number): Phase {
  const h = ((hour % 24) + 24) % 24;
  const dawnA = sunrise - 0.75;
  const dawnB = sunrise + 0.75;
  const goldA = sunset - 1.5;
  const duskA = sunset - 0.25;
  const duskB = sunset + 0.75;
  if (h < dawnA - 0.75 || h > duskB + 0.75) return P_NIGHT;
  if (h < dawnA) return lerpPhase(P_NIGHT, P_DAWN, (h - (dawnA - 0.75)) / 0.75);
  if (h < sunrise) return P_DAWN;
  if (h < dawnB) return lerpPhase(P_DAWN, P_DAY, (h - sunrise) / (dawnB - sunrise));
  if (h < goldA) return P_DAY;
  if (h < duskA) return lerpPhase(P_DAY, P_GOLDEN, (h - goldA) / (duskA - goldA));
  if (h < sunset) return lerpPhase(P_GOLDEN, P_DUSK, (h - duskA) / (sunset - duskA));
  if (h < duskB) return lerpPhase(P_DUSK, P_NIGHT, (h - sunset) / (duskB - sunset));
  return lerpPhase(P_DUSK, P_NIGHT, 1);
}

function isAtmosphere(w: Weather | AtmosphereSample): w is AtmosphereSample {
  return "cloud" in w;
}

export function lighting(cal: Calendar, w: Weather | AtmosphereSample, ambient: number): Lighting {
  const base = phaseFor(cal.hour, cal.sunrise, cal.sunset);
  let { brightness, saturation, tint, alpha } = base;
  let sky = base.sky;
  let precip: Lighting["precip"] = "none";
  const atmosphere = isAtmosphere(w);
  const rain = atmosphere ? w.rainMmPerHour : w.precip !== "none" && ambient > 0 ? (w.precip === "heavy" ? 7.5 : 1) : 0;
  const snow = atmosphere ? w.snowCmPerHour : w.precip !== "none" && ambient <= 0 ? (w.precip === "heavy" ? 7.5 : 1) : 0;
  const cloud = atmosphere ? w.cloud : w.clear ? 0 : 0.95;
  if (rain + snow > 0.05) {
    precip = atmosphere ? w.precip : snow > rain ? "snow" : "rain";
    const heavy = atmosphere ? clamp((w.precipMmPerHour + 0.5) / 8, 0.25, 1) : w.precip === "heavy" ? 1 : 0.6;
    brightness *= 1 - 0.15 * heavy;
    saturation *= 1 - 0.25 * heavy;
    const wc = precip === "snow" ? SNOW : RAIN;
    const wa = 0.25 * heavy;
    tint = mix(tint, wc, wa / Math.max(0.01, alpha + wa));
    alpha = Math.min(0.75, alpha + wa);
    sky = [mix(sky[0], GREY, 0.6 * heavy), mix(sky[1], GREY, 0.6 * heavy)];
  } else if (cloud > 0.1) {
    const cover = smooth(cloud);
    brightness *= 1 - 0.1 * cover;
    saturation *= 1 - 0.15 * cover;
    const wash = 0.12 * cover;
    tint = mix(tint, GREY, wash / Math.max(0.01, alpha + wash));
    alpha = Math.min(0.7, alpha + wash);
    sky = [mix(sky[0], GREY, 0.4 * cover), mix(sky[1], GREY, 0.4 * cover)];
  }
  // Cloud is lit by the same hour as everything else: grey mixed into the
  // sky it hangs in, then taken down by the light there is. Its tops keep
  // more of that light than its underside, which is what gives a bank of
  // it any shape at all.
  const mass = mix(mix(sky[0], CLOUD, 0.72), [0, 0, 0], 1 - Math.min(1, brightness));
  return {
    brightness, saturation, tint: css(tint), alpha,
    skyTop: css(sky[0]), skyBottom: css(sky[1]),
    cloudLow: css(mass), cloudHigh: css(mix(mass, WHITE, 0.3 * brightness)),
    precip,
  };
}

// ---------------------------------------------------------------------------
// The sky's own data: star fields, constellations, meteors, falling marks and
// ridge silhouettes. All of it is a pure function of the sky's shape (never
// of weather, time or which instance is asking), so it is built once per
// shape and cached rather than regenerated on every dress pass.
// ---------------------------------------------------------------------------

/** A hash, not an rng: sampled by index, so the same index always draws the same point. */
function hash(n: number, seed: number): number {
  return ((Math.sin(seed * 12.9898) * 43758.5453) % 1 + 1) % 1 * n;
}

interface StarSpec { raDeg: number; decDeg: number; r: number; alpha: number; colour: string }
interface Point { x: number; y: number }
/** A cubic-bezier ridge: the Catmull-Rom curve rewritten as the segments a canvas draws. */
interface RidgeShape { start: Point; curves: { c1: Point; c2: Point; p: Point }[] }
interface DropSpec { x: number; y: number; r: number; sx: number; n: number }
interface MeteorSpec { x1: number; y1: number; x2: number; y2: number; delayFrac: number }

const FIELD_STAR_COUNT = 2400;
const DUST_STAR_COUNT = 1800;
/** l=55..155 is Cygnus and Cassiopeia: the part of the Milky Way this latitude actually sees. */
const DUST_NORTHERN_SHARE = 1260;
const DUST_NORTHERN_BASE_L = 55;
const DUST_NORTHERN_SPAN_L = 100;

function buildFieldStars(): StarSpec[] {
  return Array.from({ length: FIELD_STAR_COUNT }, (_, i) => {
    const ra = hash(360, i + 1);
    const dec = Math.asin(hash(2, i + 31) - 1) * 180 / Math.PI;
    const bright = i % 47 === 0;
    const middle = !bright && i % 9 === 0;
    const r = bright ? 0.42 + hash(0.32, i + 61) : middle ? 0.19 + hash(0.21, i + 61) : 0.08 + hash(0.15, i + 61);
    const alpha = bright ? 0.68 + hash(0.30, i + 81) : middle ? 0.42 + hash(0.38, i + 81) : 0.24 + hash(0.38, i + 81);
    const colour = i % 29 === 0 ? "#d9e5ff" : i % 37 === 0 ? "#fff0dc" : "#fff";
    return { raDeg: ra, decDeg: dec, r, alpha, colour };
  });
}

/** Sky position and visibility are astronomical; brightness and texture are intentionally exaggerated for readability. */
function buildDustStars(g: SkyGeom): StarSpec[] {
  return Array.from({ length: DUST_STAR_COUNT }, (_, i) => {
    const longitude = i < DUST_NORTHERN_SHARE
      ? DUST_NORTHERN_BASE_L + hash(DUST_NORTHERN_SPAN_L, i + 401)
      : hash(360, i + 401);
    const latitude = (hash(1, i + 431) + hash(1, i + 461) - 1) * 9;
    const equatorial = galacticToEquatorial(longitude, latitude);
    const bright = i % 23 === 0;
    const middle = !bright && i % 5 === 0;
    const r = bright ? 0.40 + hash(g === WALL ? 0.36 : 0.26, i + 491) : middle ? 0.23 + hash(0.25, i + 491) : 0.15 + hash(0.18, i + 491);
    const colour = i % 7 === 0 ? "#dfc7ed" : i % 5 === 0 ? "#aec5f2" : "#f4f2ff";
    const alpha = bright ? 0.70 + hash(0.28, i + 521) : middle ? 0.50 + hash(0.38, i + 521) : 0.30 + hash(0.40, i + 521);
    return { raDeg: equatorial.raDeg, decDeg: equatorial.decDeg, r, alpha, colour };
  });
}

const CONSTELLATION_SHAPES: ReadonlyArray<readonly [number, number, ReadonlyArray<readonly [number, number]>]> = [
  [305, 40, [[-7, 0], [-4, -3], [0, 1], [3, -4], [7, 0], [10, -5], [14, -7]]],
  [15, 60, [[-8, -2], [-4, 3], [0, 0], [4, 4], [8, -1]]],
  [165, 15, [[-5, -5], [-7, 2], [-2, 7], [4, 3], [5, 11], [1, 13], [-3, 16]]],
  [80, 5, [[-8, -6], [-4, 0], [0, 5], [6, 10], [3, -7], [0, 5], [-6, 11]]],
];

function buildConstellations(g: SkyGeom): StarSpec[][] {
  return CONSTELLATION_SHAPES.map(([baseRa, baseDec, points]) => points.map(([ra, dec]) => ({
    raDeg: ((baseRa + ra + 360) % 360),
    decDeg: baseDec + dec,
    r: g === WALL ? 1.0 : 0.65,
    alpha: 1,
    colour: "#edf2ff",
  })));
}

const METEOR_BASE: ReadonlyArray<readonly [number, number, number, number, number]> = [
  [0.95, 0.35, 0.81, 0.49, 0.08], [0.80, 0.20, 0.69, 0.32, 0.34],
  [0.91, 0.12, 0.77, 0.26, 0.61], [0.72, 0.08, 0.62, 0.19, 0.84],
];

function buildMeteors(g: SkyGeom): MeteorSpec[] {
  return METEOR_BASE.map(([x1, y1, x2, y2, delayFrac]) => ({
    x1: g.w * x1, y1: g.groundY * y1, x2: g.w * x2, y2: g.groundY * y2, delayFrac,
  }));
}

const FALL_DROP_COUNT = 120;

/** Every flake gets its own size and its own sideways wander so snow drifts instead of marching. */
function buildFall(g: SkyGeom): DropSpec[] {
  return Array.from({ length: FALL_DROP_COUNT }, (_, i) => ({
    x: hash(g.w * 1.3, i + 101),
    y: hash(g.groundY, i + 131),
    r: 1 + hash(0.9, i + 151),
    sx: hash(26, i + 171) - 13,
    n: ((i * 37) % 100) / 100,
  }));
}

/**
 * A ridge line, the way a horizon actually sits: several waves of different
 * lengths added together, then drawn as a smooth curve rather than the
 * straight-sided zigzag no hill has. Four octaves of a cheap value noise,
 * joined by a Catmull-Rom spline turned into the cubic segments a canvas
 * draws directly.
 */
function buildRidge(g: SkyGeom, seed: number, height: number, samples: number): RidgeShape {
  // A hash rather than an rng: sampled by position, so neighbouring points
  // are drawn from the same curve however many samples are taken. Its own
  // constants, not the star field's - a different hash is a different hill.
  const at = (x: number) => {
    const s = Math.sin(x * 127.1 + seed * 311.7) * 43758.5453;
    return s - Math.floor(s);
  };
  const wave = (x: number, freq: number) => {
    const p = x * freq;
    const i = Math.floor(p);
    const f = p - i;
    const u = f * f * (3 - 2 * f);
    return at(i) * (1 - u) + at(i + 1) * u;
  };
  const pts: Point[] = [];
  for (let i = 0; i <= samples; i++) {
    const x = (i / samples) * g.w;
    const n = wave(i / samples, 1.4) * 0.55 + wave(i / samples, 3.1) * 0.28 + wave(i / samples, 6.7) * 0.12 + wave(i / samples, 13.3) * 0.05;
    pts.push({ x, y: g.groundY - n * height });
  }
  const curves: RidgeShape["curves"] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[Math.min(pts.length - 1, i + 2)];
    curves.push({
      c1: { x: p1.x + (p2.x - p0.x) / 6, y: p1.y + (p2.y - p0.y) / 6 },
      c2: { x: p2.x - (p3.x - p1.x) / 6, y: p2.y - (p3.y - p1.y) / 6 },
      p: p2,
    });
  }
  return { start: pts[0], curves };
}

/** Deterministic value noise: the same shape every time for a given seed, unlike an rng would give. */
function hash2(x: number, y: number, seed: number): number {
  const s = Math.sin(x * 127.1 + y * 311.7 + seed * 74.7) * 43758.5453;
  return s - Math.floor(s);
}
function noise2(x: number, y: number, seed: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const a = hash2(xi, yi, seed);
  const b = hash2(xi + 1, yi, seed);
  const c = hash2(xi, yi + 1, seed);
  const d = hash2(xi + 1, yi + 1, seed);
  return a * (1 - u) * (1 - v) + b * u * (1 - v) + c * (1 - u) * v + d * u * v;
}
/** Fractal sum of the value noise above: several octaves, the way feTurbulence's fractalNoise is several too. */
function fbm(x: number, y: number, seed: number, octaves: number, freqX: number, freqY: number): number {
  let sum = 0;
  let amp = 0.5;
  let freq = 1;
  for (let o = 0; o < octaves; o++) {
    sum += amp * noise2(x * freqX * freq, y * freqY * freq, seed + o * 17);
    amp *= 0.5;
    freq *= 2;
  }
  return sum;
}

const CLOUD_TEX_SCALE = 0.5;
const CLOUD_LOW_FREQ_X = 0.011 * 2;
const CLOUD_LOW_FREQ_Y = 0.026 * 2;
const CLOUD_LOW_OCTAVES = 5;
const CLOUD_LOW_SLOPE = 2.4;
const CLOUD_LOW_INTERCEPT = -0.62;
const CLOUD_LOW_SEED = 11;
const CLOUD_HIGH_FREQ_X = 0.03 * 2;
const CLOUD_HIGH_FREQ_Y = 0.05 * 2;
const CLOUD_HIGH_OCTAVES = 3;
const CLOUD_HIGH_SLOPE = 2;
const CLOUD_HIGH_INTERCEPT = -0.75;
const CLOUD_HIGH_SEED = 29;

/**
 * A cloud alpha mask: a fractal noise field remapped to 0..1 the way
 * feComponentTransfer's linear slope/intercept did, baked into a bitmap
 * once rather than recomputed per pixel per frame. The colour is not baked
 * in - it changes with the hour - so this carries only the shape, in the
 * alpha channel of an otherwise white bitmap.
 */
function buildCloudMask(texW: number, texH: number, seed: number, octaves: number, freqX: number, freqY: number, slope: number, intercept: number): HTMLCanvasElement | null {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(texW * CLOUD_TEX_SCALE));
  canvas.height = Math.max(1, Math.round(texH * CLOUD_TEX_SCALE));
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const image = ctx.createImageData(canvas.width, canvas.height);
  for (let y = 0; y < canvas.height; y++) {
    for (let x = 0; x < canvas.width; x++) {
      const n = fbm(x / CLOUD_TEX_SCALE, y / CLOUD_TEX_SCALE, seed, octaves, freqX, freqY);
      const a = clamp(n * slope + intercept, 0, 1);
      const p = (y * canvas.width + x) * 4;
      image.data[p] = 255;
      image.data[p + 1] = 255;
      image.data[p + 2] = 255;
      image.data[p + 3] = Math.round(a * 255);
    }
  }
  ctx.putImageData(image, 0, 0);
  return canvas;
}

interface SkyModel {
  fieldStars: StarSpec[];
  dustStars: StarSpec[];
  constellations: StarSpec[][];
  meteors: MeteorSpec[];
  fall: DropSpec[];
  ridgeFar: RidgeShape;
  ridgeMid: RidgeShape;
  ridgeNear: RidgeShape;
  cloudLow: HTMLCanvasElement | null;
  cloudHigh: HTMLCanvasElement | null;
}

const skyModelCache = new Map<string, SkyModel>();

/** The sky's own data, built once per shape and shared by every instance drawn at that shape. */
export function skyModelFor(g: SkyGeom): SkyModel {
  const key = `${g.w}x${g.h}`;
  const cached = skyModelCache.get(key);
  if (cached) return cached;
  const model: SkyModel = {
    fieldStars: buildFieldStars(),
    dustStars: buildDustStars(g),
    constellations: buildConstellations(g),
    meteors: buildMeteors(g),
    fall: buildFall(g),
    ridgeFar: buildRidge(g, 7, g.groundY * 0.30, 30),
    ridgeMid: buildRidge(g, 23, g.groundY * 0.20, 34),
    ridgeNear: buildRidge(g, 51, g.groundY * 0.12, 40),
    cloudLow: buildCloudMask(g.w * 2, g.groundY, CLOUD_LOW_SEED, CLOUD_LOW_OCTAVES, CLOUD_LOW_FREQ_X, CLOUD_LOW_FREQ_Y, CLOUD_LOW_SLOPE, CLOUD_LOW_INTERCEPT),
    cloudHigh: buildCloudMask(g.w * 2, g.groundY * 0.72, CLOUD_HIGH_SEED, CLOUD_HIGH_OCTAVES, CLOUD_HIGH_FREQ_X, CLOUD_HIGH_FREQ_Y, CLOUD_HIGH_SLOPE, CLOUD_HIGH_INTERCEPT),
  };
  skyModelCache.set(key, model);
  return model;
}

// ---------------------------------------------------------------------------
// Markup: one canvas per sky, sized to its shape. Everything that moves is
// drawn, not written as an attribute, so there is no per-element markup to
// build here beyond the element itself.
// ---------------------------------------------------------------------------

/**
 * One sky's markup: a single canvas, plus the dataset the game's weather
 * widget writes its local atmosphere into. `uid` distinguishes instances
 * for anyone reading the DOM (the sky gallery's card names, say); drawing
 * itself needs no such suffix, since a canvas has no ids for two skies on
 * one page to collide over the way two SVGs' gradients once did.
 */
export function skyHtml(g: SkyGeom = STRIP, uid = "", showPhase = true, atmosphere?: AtmosphereSample): string {
  const weatherData = atmosphere
    ? ` data-weather-temperature="${atmosphere.temperatureC}" data-weather-cloud="${atmosphere.cloud}" data-weather-rate="${atmosphere.precipMmPerHour}" data-weather-rain="${atmosphere.rainMmPerHour}" data-weather-snow="${atmosphere.snowCmPerHour}" data-weather-precip="${atmosphere.precip}" data-weather-fog="${atmosphere.fog}" data-weather-wind-x="${atmosphere.windXKmh}" data-weather-wind-y="${atmosphere.windYKmh}" data-weather-wind-speed="${atmosphere.windKmh}"` : "";
  return `<canvas class="sky" id="sky" width="${g.w}" height="${g.h}" aria-label="sky"
 data-sky-w="${g.w}" data-sky-h="${g.h}" data-sky-ground="${g.groundY}" data-sky-arc="${g.arcR}" data-sky-cx="${g.cx}" data-sky-uid="${uid}" data-sky-show-phase="${showPhase ? 1 : 0}"${weatherData}></canvas>`;
}

// ---------------------------------------------------------------------------
// Drawing. One canvas, redrawn whole every pass rather than patched piece by
// piece - there is nothing left to patch once the picture is pixels, not
// elements.
// ---------------------------------------------------------------------------

const MOON_RADIUS = 5;
const MOON_BUFFER_PAD = 2;
/** Big enough for the largest moon this file ever draws, at any device pixel ratio worth supporting. */
const MOON_BUFFER_PX = Math.ceil((MOON_RADIUS + MOON_BUFFER_PAD) * 2) * 4;
const moonBuffer = document.createElement("canvas");
moonBuffer.width = MOON_BUFFER_PX;
moonBuffer.height = MOON_BUFFER_PX;

const CLOUD_SCRATCH_W = 960;
const CLOUD_SCRATCH_H = 480;
const cloudScratch = document.createElement("canvas");
cloudScratch.width = CLOUD_SCRATCH_W;
cloudScratch.height = CLOUD_SCRATCH_H;
/**
 * One layer is composited here in isolation before being laid onto
 * `cloudScratch`, or the haze fill drawn first would be eaten by the next
 * layer's own destination-in mask.
 *
 * One per layer, and kept between frames. What the compositing produces - a
 * tint cut to the mask's shape - changes only when the hour changes the
 * tint or a resize changes the box. What changes every frame is where the
 * result is *drawn*, which is a source offset on the copy below. Rebuilding
 * it per frame meant clearing 960 by 480, filling it, and rescaling the
 * mask bitmap over it, twice, sixty times a second: measured at 1.47 s per
 * 20 s, the single most expensive thing on the main thread.
 */
interface CloudLayer { canvas: HTMLCanvasElement; mask: HTMLCanvasElement | null; key: string }
const cloudLayers: [CloudLayer, CloudLayer] = [newCloudLayer(), newCloudLayer()];

function newCloudLayer(): CloudLayer {
  const canvas = document.createElement("canvas");
  canvas.width = CLOUD_SCRATCH_W;
  canvas.height = CLOUD_SCRATCH_H;
  return { canvas, mask: null, key: "" };
}

/** The tinted, mask-cut layer for one cloud deck, rebuilt only when it would differ. */
function cloudLayerBitmap(slot: 0 | 1, mask: HTMLCanvasElement, tint: string, w: number, h: number): HTMLCanvasElement | null {
  const layer = cloudLayers[slot];
  const key = `${tint}|${Math.round(w)}|${Math.round(h)}`;
  if (layer.key === key && layer.mask === mask) return layer.canvas;
  const ctx = layer.canvas.getContext("2d");
  if (!ctx) return null;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, CLOUD_SCRATCH_W, CLOUD_SCRATCH_H);
  ctx.fillStyle = tint;
  ctx.globalAlpha = 0.9;
  ctx.fillRect(0, 0, w, h);
  ctx.globalCompositeOperation = "destination-in";
  ctx.globalAlpha = 1;
  ctx.drawImage(mask, 0, 0, w, h);
  ctx.globalCompositeOperation = "source-over";
  layer.mask = mask;
  layer.key = key;
  return layer.canvas;
}

const METEOR_LOOP_S = 12;
const METEOR_FLASH_START = 0.76;
const METEOR_FLASH_PEAK = 0.78;
const METEOR_FLASH_END = 0.86;
const METEOR_TRANSLATE: Point = { x: -32, y: 32 };
const METEOR_PEAK_OPACITY = 0.95;
const REDUCED_MOTION_METEOR_OPACITY = 0.72;

/** Where one meteor is in its twelve-second loop: invisible, flashing across, or gone again until the next lap. */
function meteorFrame(phase: number): { opacity: number; dx: number; dy: number } {
  if (phase < METEOR_FLASH_START || phase > METEOR_FLASH_END) return { opacity: 0, dx: 0, dy: 0 };
  const flashT = clamp((phase - METEOR_FLASH_START) / (METEOR_FLASH_END - METEOR_FLASH_START), 0, 1);
  const opacity = phase <= METEOR_FLASH_PEAK
    ? METEOR_PEAK_OPACITY * (phase - METEOR_FLASH_START) / (METEOR_FLASH_PEAK - METEOR_FLASH_START)
    : METEOR_PEAK_OPACITY * (1 - (phase - METEOR_FLASH_PEAK) / (METEOR_FLASH_END - METEOR_FLASH_PEAK));
  return { opacity, dx: METEOR_TRANSLATE.x * flashT, dy: METEOR_TRANSLATE.y * flashT };
}

const RAIN_DURATION_S = 0.9;
const SNOW_DURATION_MULTIPLE = 5;
const FALL_TRAVEL_Y = 220;
const FALL_MIN_DURATION_S = 0.45;
const FALL_WIND_DIVISOR = 60;
const FALL_DRIFT_X_PER_WIND = 2;
const CLOUD_DRIFT_X_PER_WIND = 4;
const CLOUD_DRIFT_Y_PER_WIND = 1.5;
const CLOUD_DEFAULT_DRIFT_X = -240;
const CLOUD_DURATION_MIN_S = 16;
const CLOUD_DURATION_BASE_S = 180;
const CLOUD_DURATION_PER_WIND = 3;
const SUN_CLOUD_ATTENUATION = 0.92;

/** The sun's own opacity behind cloud: never fully hidden, the way a disc behind an overcast deck still shows through. */
export function bodyOpacity(cover: number): number {
  return 1 - SUN_CLOUD_ATTENUATION * cover;
}

/**
 * How far the mask's dark disc sits from the lit one, and which side. The
 * dark of the moon is cut out of it rather than painted over it, because no
 * flat colour ever matched the sky behind a gibbous moon closely enough:
 * left while waxing, right while waning, on top at new, clear at full.
 */
export function moonShadowOffset(cal: Calendar, radius: number = MOON_RADIUS): number {
  return 2 * radius * cal.moonLight * (cal.moon < 0.5 ? -1 : 1);
}

/** Which of the four fixed patterns a clear night shows: stable until dawn, then drawn from the run seed and the next night's date. */
export function nightConstellation(seed: number, nightIndex: number): number {
  return ((Math.imul(seed, 1103515245) + Math.imul(nightIndex, 12345)) >>> 0) % CONSTELLATION_SHAPES.length;
}

function reducedMotion(): boolean {
  return typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;
}

interface ProjectedStar { x: number; y: number; visible: boolean }

interface SkyRuntime {
  /** The displayed minute this projection was computed for; the trig behind it is the expensive part, not the drawing. */
  projectionMinute: string;
  fieldStars: ProjectedStar[];
  dustStars: ProjectedStar[];
  constellations: ProjectedStar[][];
  milkyPlane: ProjectedGalacticPoint[][];
  milkyNorthPlane: ProjectedGalacticPoint[][];
  galacticCenterAlt: number;
  /** Everything that is not decorative motion; unchanged means reduced motion has nothing new to draw. */
  stateKey: string;
}

const runtimes = new WeakMap<HTMLCanvasElement, SkyRuntime>();

function project(star: StarSpec, siderealDeg: number, g: SkyGeom): ProjectedStar {
  const horizontal: HorizontalCoordinate = equatorialToHorizontal({ raDeg: star.raDeg, decDeg: star.decDeg }, siderealDeg);
  const point = projectSouth(horizontal, g.w, g.groundY);
  return { x: point.x, y: point.y, visible: point.visible };
}

/**
 * Sizes the backing buffer in device pixels and maps logical `g` coordinates
 * onto it the way `preserveAspectRatio="xMidYMax slice"` did: scaled to
 * cover the box the layout actually gave this canvas, centred horizontally,
 * pinned to the bottom. A canvas with no real layout (a bare intrinsic
 * canvas, or a test) reports a zero box, which falls back to drawing at the
 * logical size itself rather than dividing by zero.
 */
function ensureCanvasSize(canvas: HTMLCanvasElement, g: SkyGeom): CanvasRenderingContext2D | null {
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const dpr = (typeof window !== "undefined" ? window.devicePixelRatio : 1) || 1;
  const boxW = canvas.clientWidth || g.w;
  const boxH = canvas.clientHeight || g.h;
  const scale = Math.max(boxW / g.w, boxH / g.h);
  const offsetX = (boxW - g.w * scale) / 2;
  const offsetY = boxH - g.h * scale;
  const pixelW = Math.max(1, Math.round(boxW * dpr));
  const pixelH = Math.max(1, Math.round(boxH * dpr));
  if (canvas.width !== pixelW) canvas.width = pixelW;
  if (canvas.height !== pixelH) canvas.height = pixelH;
  ctx.setTransform(dpr * scale, 0, 0, dpr * scale, dpr * offsetX, dpr * offsetY);
  return ctx;
}

/** Terrain is a deliberately colourless, fully opaque silhouette; weather stays visible in the sky and the precipitation instead of tinting the land. */
const RIDGE_SILHOUETTE = "#050505";

function fillRidge(ctx: CanvasRenderingContext2D, g: SkyGeom, ridge: RidgeShape): void {
  ctx.beginPath();
  ctx.moveTo(ridge.start.x, ridge.start.y);
  for (const seg of ridge.curves) ctx.bezierCurveTo(seg.c1.x, seg.c1.y, seg.c2.x, seg.c2.y, seg.p.x, seg.p.y);
  ctx.lineTo(g.w, g.h);
  ctx.lineTo(0, g.h);
  ctx.closePath();
  ctx.fillStyle = RIDGE_SILHOUETTE;
  ctx.fill();
}

const MILKY_HAZE_BLUR_PX = 3;

function galacticStroke(ctx: CanvasRenderingContext2D, segments: ProjectedGalacticPoint[][], style: string, width: number, alpha: number, dash?: number[], blur?: number): void {
  if (alpha <= 0) return;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = style;
  ctx.lineWidth = width;
  ctx.lineCap = dash ? "round" : "butt";
  if (dash) ctx.setLineDash(dash);
  if (blur) ctx.filter = `blur(${blur}px)`;
  for (const segment of segments) {
    if (segment.length < 2) continue;
    ctx.beginPath();
    ctx.moveTo(segment[0].projection.x, segment[0].projection.y);
    for (let i = 1; i < segment.length; i++) ctx.lineTo(segment[i].projection.x, segment[i].projection.y);
    ctx.stroke();
  }
  ctx.restore();
}

function drawStars(ctx: CanvasRenderingContext2D, stars: StarSpec[], projected: ProjectedStar[], groupAlpha: number): void {
  if (groupAlpha <= 0) return;
  for (let i = 0; i < stars.length; i++) {
    const p = projected[i];
    if (!p.visible) continue;
    ctx.globalAlpha = stars[i].alpha * groupAlpha;
    ctx.fillStyle = stars[i].colour;
    ctx.beginPath();
    ctx.arc(p.x, p.y, stars[i].r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function drawMoon(ctx: CanvasRenderingContext2D, pos: BodyPos, cal: Calendar, opacity: number): void {
  if (opacity <= 0) return;
  const bufCtx = moonBuffer.getContext("2d");
  if (!bufCtx) return;
  const cx = MOON_BUFFER_PX / 2;
  const cy = MOON_BUFFER_PX / 2;
  bufCtx.setTransform(1, 0, 0, 1, 0, 0);
  bufCtx.clearRect(0, 0, MOON_BUFFER_PX, MOON_BUFFER_PX);
  bufCtx.fillStyle = "#e8ecf5";
  bufCtx.beginPath();
  bufCtx.arc(cx, cy, MOON_RADIUS, 0, Math.PI * 2);
  bufCtx.fill();
  // The dark side is erased out of the lit disc rather than painted over it,
  // scoped to this small offscreen buffer so the erase cannot touch the sky
  // drawn behind the moon on the main canvas.
  const offset = moonShadowOffset(cal);
  bufCtx.globalCompositeOperation = "destination-out";
  bufCtx.beginPath();
  bufCtx.arc(cx + offset, cy, MOON_RADIUS * 1.04, 0, Math.PI * 2);
  bufCtx.fill();
  bufCtx.globalCompositeOperation = "source-over";
  ctx.save();
  ctx.globalAlpha = opacity;
  ctx.drawImage(moonBuffer, pos.x - cx, pos.y - cy);
  ctx.restore();
}

/**
 * Cloud is a noise field tinted by the hour, not a shape drawn once and
 * coloured forever. Each layer is filled with its own flood colour, then
 * cut down to the noise mask's shape by erasing everything the mask is
 * transparent over (`destination-in`, the same trick the moon's dark side
 * uses) - done on its own scratch canvas first, or that erase would just as
 * happily eat the haze and the layer drawn under it, since a canvas has no
 * separate groups the way the SVG filters each lived inside their own.
 */
function drawClouds(ctx: CanvasRenderingContext2D, g: SkyGeom, model: SkyModel, cover: number, low: string, high: string, windX: number, windY: number, windSpeed: number, elapsedS: number, frozen: boolean): void {
  if (cover <= 0) return;
  const scratchCtx = cloudScratch.getContext("2d");
  if (!scratchCtx) return;
  scratchCtx.setTransform(1, 0, 0, 1, 0, 0);
  scratchCtx.clearRect(0, 0, CLOUD_SCRATCH_W, CLOUD_SCRATCH_H);
  scratchCtx.fillStyle = low;
  scratchCtx.globalAlpha = 0.55;
  scratchCtx.fillRect(0, 0, g.w, g.groundY);
  scratchCtx.globalAlpha = 1;
  const duration = Math.max(CLOUD_DURATION_MIN_S, CLOUD_DURATION_BASE_S - windSpeed * CLOUD_DURATION_PER_WIND);
  const t = frozen ? 0 : (elapsedS % duration) / duration;
  const driftX = windX * CLOUD_DRIFT_X_PER_WIND || CLOUD_DEFAULT_DRIFT_X;
  const driftY = windY * CLOUD_DRIFT_Y_PER_WIND;
  const ox = t * driftX;
  const oy = t * driftY;
  const drawLayer = (slot: 0 | 1, mask: HTMLCanvasElement | null, tint: string, w: number, h: number) => {
    if (!mask) return;
    // Built at its own full width, untranslated - a rect wider than the sky
    // is visible, panned behind a fixed window, exactly as the CSS
    // transform used to pan the SVG rect behind its unmoving viewBox. The
    // panning is this copy's source offset; the layer itself is the same
    // bitmap until the hour retints it.
    const layer = cloudLayerBitmap(slot, mask, tint, w, h);
    if (layer) scratchCtx.drawImage(layer, -ox, -oy, g.w, h, 0, 0, g.w, h);
  };
  drawLayer(0, model.cloudLow, low, g.w * 2, g.groundY);
  drawLayer(1, model.cloudHigh, high, g.w * 2, g.groundY * 0.72);
  ctx.save();
  ctx.globalAlpha = cover;
  ctx.drawImage(cloudScratch, 0, 0, g.w, g.groundY, 0, 0, g.w, g.groundY);
  ctx.restore();
}

function drawFall(ctx: CanvasRenderingContext2D, model: SkyModel, precip: Lighting["precip"], opacity: number, windX: number, windSpeed: number, elapsedS: number, frozen: boolean): void {
  if (precip === "none" || opacity <= 0) return;
  const fallDuration = Math.max(FALL_MIN_DURATION_S, RAIN_DURATION_S - windSpeed / FALL_WIND_DIVISOR);
  const duration = precip === "snow" ? fallDuration * SNOW_DURATION_MULTIPLE : fallDuration;
  const driftX = windX * FALL_DRIFT_X_PER_WIND;
  ctx.save();
  ctx.globalAlpha = opacity;
  for (const drop of model.fall) {
    const local = frozen ? 0 : (((elapsedS - drop.n * duration) % duration) + duration) % duration;
    const t = local / duration;
    const dx = driftX * t + (precip === "snow" ? drop.sx * t : 0);
    const dy = -20 + (FALL_TRAVEL_Y + 20) * t;
    const x = drop.x + dx;
    const y = drop.y + dy;
    if (precip === "rain") {
      ctx.strokeStyle = "rgba(255, 255, 255, 0.5)";
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x - 3.4, y + 9);
      ctx.stroke();
    } else {
      ctx.fillStyle = "rgba(255, 255, 255, 0.85)";
      ctx.beginPath();
      ctx.arc(x, y, drop.r, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

function drawMeteors(ctx: CanvasRenderingContext2D, model: SkyModel, visible: boolean, elapsedS: number, frozen: boolean): void {
  if (!visible) return;
  if (frozen) {
    // The still-picture case draws once and stops: one streak shown at its
    // base position, the way the reduced-motion stylesheet used to leave it.
    const m = model.meteors[0];
    ctx.save();
    ctx.globalAlpha = REDUCED_MOTION_METEOR_OPACITY;
    ctx.strokeStyle = "rgba(244, 247, 255, 0.92)";
    ctx.lineWidth = 0.9;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(m.x1, m.y1);
    ctx.lineTo(m.x2, m.y2);
    ctx.stroke();
    ctx.restore();
    return;
  }
  for (const m of model.meteors) {
    const phase = (((elapsedS / METEOR_LOOP_S) + m.delayFrac) % 1 + 1) % 1;
    const frame = meteorFrame(phase);
    if (frame.opacity <= 0) continue;
    ctx.save();
    ctx.globalAlpha = frame.opacity;
    ctx.strokeStyle = "rgba(244, 247, 255, 0.92)";
    ctx.lineWidth = 0.9;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(m.x1 + frame.dx, m.y1 + frame.dy);
    ctx.lineTo(m.x2 + frame.dx, m.y2 + frame.dy);
    ctx.stroke();
    ctx.restore();
  }
}

/** Positions sun or moon, colours the sky, and lights the map. */
export function updateSky(state: GameState, cal: Calendar, ambient: number, root: ParentNode = document): Lighting {
  // Every sky on the page, at whatever shape each was drawn: the game
  // widget and the gallery's cards are the same picture and must agree.
  const skies = heldQueryAll<HTMLCanvasElement>(root, "canvas.sky");
  for (const canvas of skies) dressSky(canvas, state, cal, ambient);
  const localAir = skies.length ? skyAtmosphere(skies[0]) : null;
  const light = lighting(cal, localAir ?? state.weather, localAir?.temperatureC ?? ambient);
  const grid = heldQuery<HTMLElement>(root, "#map .scroll-x");
  if (grid) {
    // Compared before written. These four are custom properties on the
    // scroller, so every one of the board's 2,592 cells inherits them, and
    // writing a property invalidates that subtree's style whether or not the
    // value changed. The light moves over minutes, not frames, so almost
    // every one of these writes was asking the engine to re-resolve the
    // whole board for an identical answer.
    setVar(grid, "--bright", light.brightness.toFixed(3));
    setVar(grid, "--sat", light.saturation.toFixed(3));
    setVar(grid, "--tint", light.tint);
    setVar(grid, "--tint-a", light.alpha.toFixed(3));
  }
  return light;
}

function setVar(el: HTMLElement, name: string, value: string): void {
  if (el.style.getPropertyValue(name) !== value) el.style.setProperty(name, value);
}

function skyAtmosphere(canvas: HTMLCanvasElement): AtmosphereSample | null {
  const d = canvas.dataset;
  if (d.weatherCloud === undefined) return null;
  const cloud = Number(d.weatherCloud);
  const rainMmPerHour = Number(d.weatherRain);
  const snowCmPerHour = Number(d.weatherSnow);
  const windXKmh = Number(d.weatherWindX);
  const windYKmh = Number(d.weatherWindY);
  return {
    temperatureC: Number(d.weatherTemperature), pressureHpa: 1013, relativeHumidity: 0.5, cloud,
    precipMmPerHour: Number(d.weatherRate),
    rainMmPerHour, snowCmPerHour,
    precip: d.weatherPrecip === "rain" || d.weatherPrecip === "snow" ? d.weatherPrecip : "none",
    windKmh: Number(d.weatherWindSpeed), windBearingDeg: 0, windXKmh, windYKmh,
    fog: Number(d.weatherFog), blowingSnow: 0, extinctionPerKm: 0.06,
  };
}

/** One sky, at the shape it was drawn: where the body sits, what colour the air is, and what is falling through it. */
function dressSky(canvas: HTMLCanvasElement, state: GameState, cal: Calendar, ambient: number): void {
  const forecast = forecastText(state);
  const ariaLabel = forecast ? `sky: ${forecast}` : "sky";
  if (canvas.getAttribute("aria-label") !== ariaLabel) canvas.setAttribute("aria-label", ariaLabel);

  const d = canvas.dataset;
  const g: SkyGeom = {
    w: Number(d.skyW ?? STRIP.w), h: Number(d.skyH ?? STRIP.h),
    groundY: Number(d.skyGround ?? STRIP.groundY), arcR: Number(d.skyArc ?? STRIP.arcR), cx: Number(d.skyCx ?? STRIP.cx),
  };
  const model = skyModelFor(g);
  const pos = bodyPosition(cal, g);
  const localAir = skyAtmosphere(canvas);
  const visualWeather = localAir ?? state.weather;
  const light = lighting(cal, visualWeather, localAir?.temperatureC ?? ambient);

  const startDoy = ((cal.dayOfYear - cal.dayIndex) % 365 + 365) % 365;
  const absoluteDay = startDoy + cal.dayIndex;
  const displayedMinute = Math.floor(cal.hour * 60 + 1e-6);
  const projectionKey = `${absoluteDay}:${displayedMinute}`;
  const siderealAngle = localSiderealDegrees(absoluteDay, displayedMinute / 60);

  let runtime = runtimes.get(canvas);
  if (!runtime || runtime.projectionMinute !== projectionKey) {
    const plane = projectGalacticPlane(siderealAngle, g.w, g.groundY);
    const north = plane.map((segment) => segment.filter((p) => p.galacticLongitudeDeg >= DUST_NORTHERN_BASE_L && p.galacticLongitudeDeg <= DUST_NORTHERN_BASE_L + DUST_NORTHERN_SPAN_L)).filter((s) => s.length > 1);
    runtime = {
      projectionMinute: projectionKey,
      fieldStars: model.fieldStars.map((s) => project(s, siderealAngle, g)),
      dustStars: model.dustStars.map((s) => project(s, siderealAngle, g)),
      constellations: model.constellations.map((dots) => dots.map((s) => project(s, siderealAngle, g))),
      milkyPlane: plane,
      milkyNorthPlane: north,
      galacticCenterAlt: equatorialToHorizontal(GALACTIC_CENTER, siderealAngle).altitudeDeg,
      stateKey: "",
    };
    runtimes.set(canvas, runtime);
  }

  const clearNight = pos.body === "moon" && (localAir ? localAir.precipMmPerHour < 0.05 && localAir.cloud < 0.35 : state.weather.precip === "none" && state.weather.clear);
  const deepSky = clearNight ? clamp((0.80 - phaseFor(cal.hour, cal.sunrise, cal.sunset).brightness) / 0.25, 0, 1) : 0;
  const nightIndex = cal.dayIndex - (cal.hour < cal.sunrise ? 1 : 0);
  const constellationIndex = nightConstellation(state.seed, nightIndex);
  const perseids = clearNight && cal.dayOfYear >= 197 && cal.dayOfYear <= 235;
  const falling = light.precip !== "none";
  const cover = localAir ? clamp(Math.max(localAir.cloud, localAir.fog, falling ? 0.72 : 0), 0, 1) : falling ? 1 : state.weather.clear ? 0 : 0.95;
  const fallOpacity = localAir ? clamp(Math.sqrt(localAir.precipMmPerHour / 7.5), 0, 1) : falling ? 1 : 0;
  const windX = localAir?.windXKmh ?? 0;
  const windY = localAir?.windYKmh ?? 0;
  const windSpeed = localAir?.windKmh ?? 0;
  const storm = localAir ? localStorm(localAir) : Boolean(state.weather.storm && stormNow(state.weather, state.minute));
  const through = bodyOpacity(cover);
  const high = clamp((g.groundY - pos.y) / g.arcR, 0, 1);
  const dawnNear = Math.abs(cal.hour - cal.sunrise);
  const duskNear = Math.abs(cal.hour - cal.sunset);
  const dusking = duskNear <= dawnNear;
  const glow = Math.max(0, 1 - Math.min(dawnNear, duskNear) / 1.6);
  const phaseText = Number(d.skyShowPhase) ? phaseName(cal) : "";

  // Everything above is the picture. This key stands for all of it except
  // decorative motion, so reduced motion can compare it call to call and
  // draw only when something in it actually changed.
  const stateKey = [
    projectionKey, pos.body, pos.x.toFixed(1), pos.y.toFixed(1), light.skyTop, light.skyBottom,
    clearNight, deepSky.toFixed(2), constellationIndex, perseids, cover.toFixed(2), fallOpacity.toFixed(2),
    light.precip, storm, windX.toFixed(1), windY.toFixed(1), through.toFixed(2), glow.toFixed(2), phaseText,
  ].join("|");

  // A handful of dataset attributes describe what the picture currently
  // shows, the way the classes and CSS custom properties used to - cheap to
  // write and useful to read without decoding pixels, but never thousands
  // of them and never the thing the browser recalculates style over.
  const setData = (key: string, value: string) => { if (d[key] !== value) d[key] = value; };
  setData("skyPrecip", light.precip);
  setData("skyStorm", storm ? "1" : "0");
  setData("skyWindX", windX.toFixed(2));
  setData("skyWindY", windY.toFixed(2));
  setData("skyWindSpeed", windSpeed.toFixed(2));
  setData("skyFallOpacity", fallOpacity.toFixed(2));
  setData("skyCloudOpacity", cover.toFixed(2));
  setData("skyStars", clearNight ? "0.90" : "0.00");
  setData("skyMilkyWay", (deepSky * 0.82).toFixed(2));
  setData("skyConstellation", clearNight ? String(constellationIndex) : "");
  setData("skyPerseids", perseids ? "1" : "0");
  setData("skySiderealAngle", siderealAngle.toFixed(3));
  setData("skyGalacticCenterAlt", runtime.galacticCenterAlt.toFixed(3));

  const frozen = reducedMotion();
  if (frozen && runtime.stateKey === stateKey) return;
  runtime.stateKey = stateKey;

  const ctx = ensureCanvasSize(canvas, g);
  if (!ctx) return;
  const elapsedS = frozen ? 0 : performance.now() / 1000;

  ctx.clearRect(0, 0, g.w, g.h);

  const skyGradient = ctx.createLinearGradient(0, 0, 0, g.h);
  skyGradient.addColorStop(0, light.skyTop);
  skyGradient.addColorStop(1, light.skyBottom);
  ctx.fillStyle = skyGradient;
  ctx.fillRect(0, 0, g.w, g.h);

  const pxPerDegree = g.groundY / 90;
  const milkyAlpha = deepSky * 0.82;
  if (milkyAlpha > 0) {
    galacticStroke(ctx, runtime.milkyPlane, "#b8c3ec", 20 * pxPerDegree, milkyAlpha * 0.24, undefined, MILKY_HAZE_BLUR_PX);
    galacticStroke(ctx, runtime.milkyPlane, "#b8c3ec", 11 * pxPerDegree, milkyAlpha * 0.11);
    galacticStroke(ctx, runtime.milkyNorthPlane, "#d5d5f2", 8 * pxPerDegree, milkyAlpha * 0.17);
    galacticStroke(ctx, runtime.milkyPlane, "#060b20", 2.8 * pxPerDegree, milkyAlpha * 0.36, [18, 3, 29, 5]);
    galacticStroke(ctx, runtime.milkyPlane, "#e6e1f6", 0.7 * pxPerDegree, milkyAlpha * 0.10);
    drawStars(ctx, model.dustStars, runtime.dustStars, milkyAlpha);
  }
  const starAlpha = clearNight ? 0.9 : 0;
  drawStars(ctx, model.fieldStars, runtime.fieldStars, starAlpha);
  if (clearNight) drawStars(ctx, model.constellations[constellationIndex], runtime.constellations[constellationIndex], 1);

  drawMeteors(ctx, model, perseids, elapsedS, frozen);

  if (glow > 0) {
    const glowCx = g.cx + (dusking ? g.arcR : -g.arcR) * 0.85;
    const glowColour = dusking ? GLOW_DUSK : GLOW_DAWN;
    const radial = ctx.createRadialGradient(glowCx, g.groundY, 0, glowCx, g.groundY, g.arcR * 1.15);
    radial.addColorStop(0, `rgba(${glowColour.join(",")}, 0.95)`);
    radial.addColorStop(0.4, `rgba(${glowColour.join(",")}, 0.4)`);
    radial.addColorStop(1, `rgba(${glowColour.join(",")}, 0)`);
    ctx.save();
    ctx.globalAlpha = glow;
    ctx.fillStyle = radial;
    ctx.fillRect(0, 0, g.w, g.h);
    ctx.restore();
  }

  ctx.save();
  ctx.strokeStyle = "rgba(255,255,255,0.18)";
  ctx.setLineDash([2, 3]);
  ctx.beginPath();
  ctx.arc(g.cx, g.groundY, g.arcR, Math.PI, 0);
  ctx.stroke();
  ctx.restore();

  if (pos.body === "sun" && through > 0) {
    ctx.save();
    ctx.globalAlpha = through;
    ctx.fillStyle = css(mix(SUN_LOW, SUN_HIGH, high));
    ctx.strokeStyle = css(mix(mix(SUN_LOW, SUN_HIGH, high), WHITE, 0.45));
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  } else if (pos.body === "moon" && through > 0) {
    drawMoon(ctx, pos, cal, through);
  }

  drawClouds(ctx, g, model, cover, light.cloudLow, light.cloudHigh, windX, windY, windSpeed, elapsedS, frozen);
  drawFall(ctx, model, light.precip, fallOpacity, windX, windSpeed, elapsedS, frozen);

  fillRidge(ctx, g, model.ridgeFar);
  fillRidge(ctx, g, model.ridgeMid);
  fillRidge(ctx, g, model.ridgeNear);

  if (phaseText) {
    ctx.save();
    ctx.fillStyle = "rgba(255,255,255,0.6)";
    ctx.font = "8px sans-serif";
    ctx.textAlign = "end";
    ctx.fillText(phaseText, g.w - 4, g.h - 3);
    ctx.restore();
  }
}

export function phaseName(cal: Calendar): string {
  const h = cal.hour;
  if (h >= cal.sunrise - 0.75 && h < cal.sunrise + 0.75) return "dawn";
  if (h >= cal.sunset - 1.5 && h < cal.sunset - 0.25) return "golden hour";
  if (h >= cal.sunset - 0.25 && h < cal.sunset + 0.75) return "dusk";
  if (cal.isNight) return "night";
  return "day";
}
