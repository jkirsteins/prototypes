/**
 * The sky strip and the light on the map. Both are functions of the same
 * clock: where the sun (or moon) sits on its arc, and how that colours the
 * world. Updated every frame; the markup is static and only attributes move.
 */
import type { Calendar } from "../sim/calendar";
import type { GameState, Weather } from "../sim/types";
import { clamp } from "../units";

export const SKY_W = 220;
export const SKY_H = 64;
const GROUND_Y = 52;
const ARC_R = 40;
const CX = SKY_W / 2;

export interface BodyPos { body: "sun" | "moon"; x: number; y: number; /** 0 at rising, 1 at setting */ t: number }

/** Sun by day, moon by night, each crossing the same arc left to right. */
export function bodyPosition(cal: Calendar): BodyPos {
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
  return { body, t, x: CX + ARC_R * Math.cos(angle), y: GROUND_Y - ARC_R * Math.sin(angle) };
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
  precip: "none" | "rain" | "snow";
}

type RGB = [number, number, number];
const NIGHT: RGB = [26, 42, 108];
const DAWN: RGB = [224, 138, 90];
const GOLDEN: RGB = [240, 176, 64];
const DUSK: RGB = [150, 70, 130];
const GREY: RGB = [120, 130, 145];
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

export function lighting(cal: Calendar, w: Weather, ambient: number): Lighting {
  const base = phaseFor(cal.hour, cal.sunrise, cal.sunset);
  let { brightness, saturation, tint, alpha } = base;
  let sky = base.sky;
  let precip: Lighting["precip"] = "none";
  if (w.precip !== "none") {
    precip = ambient <= 0 ? "snow" : "rain";
    const heavy = w.precip === "heavy" ? 1 : 0.6;
    brightness *= 1 - 0.15 * heavy;
    saturation *= 1 - 0.25 * heavy;
    const wc = precip === "snow" ? SNOW : RAIN;
    const wa = 0.25 * heavy;
    tint = mix(tint, wc, wa / Math.max(0.01, alpha + wa));
    alpha = Math.min(0.75, alpha + wa);
    sky = [mix(sky[0], GREY, 0.6 * heavy), mix(sky[1], GREY, 0.6 * heavy)];
  } else if (!w.clear) {
    brightness *= 0.9;
    saturation *= 0.85;
    tint = mix(tint, GREY, 0.12 / Math.max(0.01, alpha + 0.12));
    alpha = Math.min(0.7, alpha + 0.12);
    sky = [mix(sky[0], GREY, 0.4), mix(sky[1], GREY, 0.4)];
  }
  return { brightness, saturation, tint: css(tint), alpha, skyTop: css(sky[0]), skyBottom: css(sky[1]), precip };
}

/** Static markup; updateSky moves the pieces. */
export function skyHtml(): string {
  const arc = `M ${CX - ARC_R} ${GROUND_Y} A ${ARC_R} ${ARC_R} 0 0 1 ${CX + ARC_R} ${GROUND_Y}`;
  return `<svg class="sky" id="sky" viewBox="0 0 ${SKY_W} ${SKY_H}" width="${SKY_W}" height="${SKY_H}" aria-label="sky">
<defs><linearGradient id="skygrad" x1="0" y1="0" x2="0" y2="1"><stop id="sky-top" offset="0" stop-color="#4682d2"/><stop id="sky-bottom" offset="1" stop-color="#96c3f0"/></linearGradient></defs>
<rect width="${SKY_W}" height="${SKY_H}" fill="url(#skygrad)"/>
<g id="sky-stars" opacity="0"><circle cx="30" cy="14" r="0.8" fill="#fff"/><circle cx="62" cy="9" r="0.6" fill="#fff"/><circle cx="95" cy="20" r="0.7" fill="#fff"/><circle cx="140" cy="8" r="0.8" fill="#fff"/><circle cx="175" cy="18" r="0.6" fill="#fff"/><circle cx="200" cy="30" r="0.7" fill="#fff"/><circle cx="18" cy="34" r="0.6" fill="#fff"/></g>
<path d="${arc}" fill="none" stroke="rgba(255,255,255,0.18)" stroke-dasharray="2 3"/>
<circle id="sky-sun" cx="${CX - ARC_R}" cy="${GROUND_Y}" r="6" fill="#ffd66b" stroke="#fff3c0" stroke-width="1"/>
<circle id="sky-moon" cx="${CX - ARC_R}" cy="${GROUND_Y}" r="5" fill="#e8ecf5" opacity="0"/>
<circle id="sky-moon-shadow" cx="${CX - ARC_R}" cy="${GROUND_Y}" r="5.4" fill="#4682d2" opacity="0"/>
<rect x="0" y="${GROUND_Y}" width="${SKY_W}" height="${SKY_H - GROUND_Y}" fill="#0b1210"/>
<path d="M 0 ${GROUND_Y} L 40 ${GROUND_Y - 6} L 44 ${GROUND_Y} L 90 ${GROUND_Y - 4} L 96 ${GROUND_Y} L 150 ${GROUND_Y - 7} L 156 ${GROUND_Y} L 210 ${GROUND_Y - 5} L 214 ${GROUND_Y} Z" fill="#0b1210"/>
<text id="sky-label" x="${SKY_W - 4}" y="${SKY_H - 3}" text-anchor="end" font-size="8" fill="rgba(255,255,255,0.6)"></text>
</svg>`;
}

function setAttr(root: ParentNode, id: string, name: string, value: string) {
  const el = root.querySelector<SVGElement>(`#${id}`);
  if (el && el.getAttribute(name) !== value) el.setAttribute(name, value);
}

/** Positions sun or moon, colours the strip, and lights the map. */
export function updateSky(state: GameState, cal: Calendar, ambient: number, root: ParentNode = document): Lighting {
  const pos = bodyPosition(cal);
  const light = lighting(cal, state.weather, ambient);
  const f = (v: number) => v.toFixed(1);
  setAttr(root, "sky-sun", "cx", f(pos.body === "sun" ? pos.x : CX - ARC_R));
  setAttr(root, "sky-sun", "cy", f(pos.body === "sun" ? pos.y : GROUND_Y + 8));
  setAttr(root, "sky-sun", "opacity", pos.body === "sun" ? "1" : "0");
  setAttr(root, "sky-moon", "cx", f(pos.body === "moon" ? pos.x : CX - ARC_R));
  setAttr(root, "sky-moon", "cy", f(pos.body === "moon" ? pos.y : GROUND_Y + 8));
  setAttr(root, "sky-moon", "opacity", pos.body === "moon" ? "1" : "0");
  // A disc of sky laid over the moon, slid aside by how much of it is lit: left while waxing, right while waning.
  const r = 5;
  const offset = 2 * r * cal.moonLight * (cal.moon < 0.5 ? -1 : 1);
  setAttr(root, "sky-moon-shadow", "cx", f(pos.body === "moon" ? pos.x + offset : CX - ARC_R));
  setAttr(root, "sky-moon-shadow", "cy", f(pos.body === "moon" ? pos.y : GROUND_Y + 8));
  setAttr(root, "sky-moon-shadow", "fill", light.skyTop);
  setAttr(root, "sky-moon-shadow", "opacity", pos.body === "moon" ? "1" : "0");
  setAttr(root, "sky-stars", "opacity", pos.body === "moon" && state.weather.precip === "none" && state.weather.clear ? "0.9" : "0");
  setAttr(root, "sky-top", "stop-color", light.skyTop);
  setAttr(root, "sky-bottom", "stop-color", light.skyBottom);
  const label = root.querySelector<SVGElement>("#sky-label");
  const text = phaseName(cal);
  if (label && label.textContent !== text) label.textContent = text;

  const grid = root.querySelector<HTMLElement>("#map .grid");
  if (grid) {
    grid.style.setProperty("--bright", light.brightness.toFixed(3));
    grid.style.setProperty("--sat", light.saturation.toFixed(3));
    grid.style.setProperty("--tint", light.tint);
    grid.style.setProperty("--tint-a", light.alpha.toFixed(3));
    grid.classList.toggle("rain", light.precip === "rain");
    grid.classList.toggle("snowing", light.precip === "snow");
  }
  return light;
}

export function phaseName(cal: Calendar): string {
  const h = cal.hour;
  if (h >= cal.sunrise - 0.75 && h < cal.sunrise + 0.75) return "dawn";
  if (h >= cal.sunset - 1.5 && h < cal.sunset - 0.25) return "golden hour";
  if (h >= cal.sunset - 0.25 && h < cal.sunset + 0.75) return "dusk";
  if (cal.isNight) return "night";
  return "day";
}
