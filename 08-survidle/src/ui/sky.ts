/**
 * The sky strip and the light on the map. Both are functions of the same
 * clock: where the sun (or moon) sits on its arc, and how that colours the
 * world. Updated every frame; the markup is static and only attributes move.
 */
import type { Calendar } from "../sim/calendar";
import type { GameState, Weather } from "../sim/types";
import { stormNow } from "../sim/weather";
import { clamp } from "../units";

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

const GROUND_Y = STRIP.groundY;
const ARC_R = STRIP.arcR;
const CX = STRIP.cx;

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

/**
 * A ridge line, the way a horizon actually sits: several waves of
 * different lengths added together, then drawn as a smooth curve.
 *
 * The old horizon was a hand-written zigzag of eight points, and it read
 * as one - straight sides meeting at corners no hill has. This sums four
 * octaves of a cheap value noise and joins the samples with a Catmull-Rom
 * spline, so the long shape is a range and the short shape is its
 * roughness. It is a pure function of its seed, so the same sky draws the
 * same hills every time rather than reshuffling the land each frame.
 */
function ridgePath(g: SkyGeom, seed: number, height: number, samples = 34): string {
  // A hash rather than an rng: sampled by position, so neighbouring points
  // are drawn from the same curve however many samples are taken.
  const at = (x: number) => {
    const s = Math.sin(x * 127.1 + seed * 311.7) * 43758.5453;
    return s - Math.floor(s);
  };
  const wave = (x: number, freq: number) => {
    const p = x * freq;
    const i = Math.floor(p);
    const f = p - i;
    // Smoothstep between the two nearest hash values: the curve is
    // continuous, which is what stops the corners.
    const u = f * f * (3 - 2 * f);
    return at(i) * (1 - u) + at(i + 1) * u;
  };
  const pts: { x: number; y: number }[] = [];
  for (let i = 0; i <= samples; i++) {
    const x = (i / samples) * g.w;
    const n = wave(i / samples, 1.4) * 0.55 + wave(i / samples, 3.1) * 0.28 + wave(i / samples, 6.7) * 0.12 + wave(i / samples, 13.3) * 0.05;
    pts.push({ x, y: g.groundY - n * height });
  }
  // Catmull-Rom through the samples, written as cubics.
  let d = `M ${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[Math.min(pts.length - 1, i + 2)];
    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${c1x.toFixed(1)} ${c1y.toFixed(1)}, ${c2x.toFixed(1)} ${c2y.toFixed(1)}, ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
  }
  return `${d} L ${g.w} ${g.h} L 0 ${g.h} Z`;
}

/**
 * Static markup; updateSky moves the pieces.
 *
 * Drawn at whatever shape it is asked for. Everything that moves carries an
 * id and nothing carries a position the markup would have to be rewritten
 * to change, so a frame writes attributes and the panel around it holds
 * still.
 */
/**
 * One sky.
 *
 * `uid` names this instance's gradients, filters and mask. Everything a
 * shape points at with url(#...) or mask=url(#...) is looked up across the
 * WHOLE document, not within its own svg, so two skies on one page with
 * the same ids both draw the first one's cloud, the first one's moon phase
 * and the first one's sunset - which is exactly what the sky gallery did,
 * silently, while its thirteen cards looked plausible. The game draws one
 * sky and needs no suffix; the gallery passes the case name.
 */
export function skyHtml(g: SkyGeom = STRIP, uid = "", showPhase = true): string {
  const u = uid ? `-${uid}` : "";
  const arc = `M ${g.cx - g.arcR} ${g.groundY} A ${g.arcR} ${g.arcR} 0 0 1 ${g.cx + g.arcR} ${g.groundY}`;
  const rand = (n: number, seed: number) => ((Math.sin(seed * 12.9898) * 43758.5453) % 1 + 1) % 1 * n;
  const stars = Array.from({ length: 14 }, (_, i) =>
    `<circle cx="${(rand(g.w, i + 1)).toFixed(1)}" cy="${(rand(g.groundY * 0.8, i + 31)).toFixed(1)}" r="${(0.5 + rand(0.6, i + 61)).toFixed(2)}" fill="#fff"/>`).join("");
  // Cloud is a noise field, not a row of ellipses. feTurbulence gives a
  // fractal the browser generates itself: the shape has detail at every
  // scale the way weather does, and lobes drawn by hand never will. The
  // seed is written down, so the same sky grows the same cloud.
  const cloudField = `<filter id="sky-cloudnoise${u}" x="-20%" y="-20%" width="140%" height="140%">
  <feTurbulence type="fractalNoise" baseFrequency="0.011 0.026" numOctaves="5" seed="11" result="noise"/>
  <feComponentTransfer in="noise" result="mask"><feFuncA id="sky-cloudcut" type="linear" slope="2.4" intercept="-0.62"/></feComponentTransfer>
  <feFlood id="sky-cloudflood" flood-color="#aeb9c6" result="flood"/>
  <feComposite in="flood" in2="mask" operator="in"/>
</filter>
<filter id="sky-cloudnoise-hi${u}" x="-20%" y="-20%" width="140%" height="140%">
  <feTurbulence type="fractalNoise" baseFrequency="0.03 0.05" numOctaves="3" seed="29" result="noise"/>
  <feComponentTransfer in="noise" result="mask"><feFuncA type="linear" slope="2" intercept="-0.75"/></feComponentTransfer>
  <feFlood id="sky-cloudflood-hi" flood-color="#c6d0da" result="flood"/>
  <feComposite in="flood" in2="mask" operator="in"/>
</filter>`;

  // The fall: a field of marks slid down forever by css. Both are dense -
  // a thin scatter of ticks read as dust on the screen rather than weather
  // - rain leans the way rain does, and every flake gets its own size and
  // its own sideways wander so snow drifts instead of marching.
  const fall = Array.from({ length: 120 }, (_, i) => {
    const x = rand(g.w * 1.3, i + 101).toFixed(1);
    const y = rand(g.groundY, i + 131).toFixed(1);
    const r = (1 + rand(0.9, i + 151)).toFixed(2);
    const sx = (rand(26, i + 171) - 13).toFixed(1);
    return `<g class="sky-drop" style="--x:${x}px;--y:${y}px;--sx:${sx}px;--n:${((i * 37) % 100) / 100}"><line x1="0" y1="0" x2="-3.4" y2="9"/><circle cx="0" cy="0" r="${r}"/></g>`;
  }).join("");
  return `<svg class="sky" id="sky" viewBox="0 0 ${g.w} ${g.h}" width="${g.w}" height="${g.h}" preserveAspectRatio="xMidYMax slice" aria-label="sky"
 data-sky-w="${g.w}" data-sky-h="${g.h}" data-sky-ground="${g.groundY}" data-sky-arc="${g.arcR}" data-sky-cx="${g.cx}">
<defs>${cloudField}<radialGradient id="sky-glowgrad${u}" class="glowgrad" gradientUnits="userSpaceOnUse" cx="${g.cx}" cy="${g.groundY}" r="${g.arcR * 1.15}">
<stop id="sky-glow-in" offset="0" stop-color="#ff8a5c" stop-opacity="0.95"/>
<stop id="sky-glow-mid" offset="0.4" stop-color="#ff8a5c" stop-opacity="0.4"/>
<stop id="sky-glow-out" offset="1" stop-color="#ff8a5c" stop-opacity="0"/>
</radialGradient><linearGradient id="skygrad${u}" x1="0" y1="0" x2="0" y2="1"><stop id="sky-top" offset="0" stop-color="#4682d2"/><stop id="sky-bottom" offset="1" stop-color="#96c3f0"/></linearGradient></defs>
<rect width="${g.w}" height="${g.h}" fill="url(#skygrad${u})"/>
<g id="sky-stars" opacity="0">${stars}</g>
<rect id="sky-glow" width="${g.w}" height="${g.h}" fill="url(#sky-glowgrad${u})" opacity="0"/>
<path d="${arc}" fill="none" stroke="rgba(255,255,255,0.18)" stroke-dasharray="2 3"/>
<circle id="sky-sun" cx="${g.cx - g.arcR}" cy="${g.groundY}" r="6" fill="#ffd66b" stroke="#fff3c0" stroke-width="1"/>
<mask id="sky-moon-mask${u}" maskUnits="userSpaceOnUse" x="0" y="0" width="${g.w}" height="${g.h}">
<circle id="sky-moon-lit" cx="${g.cx - g.arcR}" cy="${g.groundY}" r="5" fill="#fff"/>
<circle id="sky-moon-dark" cx="${g.cx - g.arcR}" cy="${g.groundY}" r="5.2" fill="#000"/>
</mask>
<circle id="sky-moon" cx="${g.cx - g.arcR}" cy="${g.groundY}" r="5" fill="#e8ecf5" opacity="0" mask="url(#sky-moon-mask${u})"/>
<g id="sky-clouds" opacity="0">
<rect id="sky-haze" width="${g.w}" height="${g.groundY}" fill="#8390a0" opacity="0.55"/>
<g class="sky-cloud" style="--drift:150s"><rect x="0" y="0" width="${g.w * 2}" height="${g.groundY}" filter="url(#sky-cloudnoise${u})"/></g>
<g class="sky-cloud" style="--drift:88s"><rect x="0" y="0" width="${g.w * 2}" height="${g.groundY * 0.72}" filter="url(#sky-cloudnoise-hi${u})"/></g>
</g>
<g id="sky-fall" opacity="0">${fall}</g>
<path id="sky-far" d="${ridgePath(g, 7, g.groundY * 0.30, 30)}" fill="#141c24" opacity="0.75"/>
<path id="sky-mid" d="${ridgePath(g, 23, g.groundY * 0.20, 34)}" fill="#0f161c"/>
<path id="sky-near" d="${ridgePath(g, 51, g.groundY * 0.12, 40)}" fill="#0b1210"/>
${showPhase ? `<text id="sky-label" x="${g.w - 4}" y="${g.h - 3}" text-anchor="end" font-size="8" fill="rgba(255,255,255,0.6)"></text>` : ""}
</svg>`;
}

function setAttr(root: ParentNode, id: string, name: string, value: string) {
  const el = root.querySelector<SVGElement>(`#${id}`);
  if (el && el.getAttribute(name) !== value) el.setAttribute(name, value);
}

/** Positions sun or moon, colours the strip, and lights the map. */
export function updateSky(state: GameState, cal: Calendar, ambient: number, root: ParentNode = document): Lighting {
  // Every sky on the page, at whatever shape each was drawn: the strip and
  // the widget's wall are the same picture and must agree.
  for (const svg of root.querySelectorAll<SVGElement>("svg.sky")) dressSky(svg, state, cal, ambient);
  const light = lighting(cal, state.weather, ambient);
  const grid = root.querySelector<HTMLElement>("#map .scroll-x");
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

/** One sky, at the shape it was drawn: where the body sits, what colour the air is, and what is falling through it. */
function dressSky(svg: SVGElement, state: GameState, cal: Calendar, ambient: number): void {
  const d = (svg as unknown as HTMLElement).dataset;
  const g: SkyGeom = {
    w: Number(d.skyW ?? SKY_W), h: Number(d.skyH ?? SKY_H),
    groundY: Number(d.skyGround ?? GROUND_Y), arcR: Number(d.skyArc ?? ARC_R), cx: Number(d.skyCx ?? CX),
  };
  const root: ParentNode = svg;
  const pos = bodyPosition(cal, g);
  const light = lighting(cal, state.weather, ambient);
  const f = (v: number) => v.toFixed(1);
  setAttr(root, "sky-sun", "cx", f(pos.body === "sun" ? pos.x : g.cx - g.arcR));
  setAttr(root, "sky-sun", "cy", f(pos.body === "sun" ? pos.y : g.groundY + 8));
  // A yellow disc sitting on the horizon at dusk was the one thing in the
  // picture disagreeing with the pink sky behind it, so the sun takes its
  // colour from how high it is.
  const high = Math.max(0, Math.min(1, (g.groundY - pos.y) / g.arcR));
  setAttr(root, "sky-sun", "fill", css(mix(SUN_LOW, SUN_HIGH, high)));
  setAttr(root, "sky-sun", "stroke", css(mix(mix(SUN_LOW, SUN_HIGH, high), WHITE, 0.45)));
  setAttr(root, "sky-moon", "cx", f(pos.body === "moon" ? pos.x : g.cx - g.arcR));
  setAttr(root, "sky-moon", "cy", f(pos.body === "moon" ? pos.y : g.groundY + 8));
  // The dark of the moon is cut out of it rather than painted over it. The
  // mask's black disc slides across by how much is lit - left while waxing,
  // right while waning - and what it covers is simply not drawn. Painting
  // instead needed a colour matching the sky at that exact height, which it
  // never did, so a gibbous moon showed a second black moon beside it.
  const r = 5;
  const offset = 2 * r * cal.moonLight * (cal.moon < 0.5 ? -1 : 1);
  setAttr(root, "sky-moon-lit", "cx", f(pos.x));
  setAttr(root, "sky-moon-lit", "cy", f(pos.y));
  setAttr(root, "sky-moon-dark", "cx", f(pos.x + offset));
  setAttr(root, "sky-moon-dark", "cy", f(pos.y));
  setAttr(root, "sky-stars", "opacity", pos.body === "moon" && state.weather.precip === "none" && state.weather.clear ? "0.9" : "0");
  setAttr(root, "sky-top", "stop-color", light.skyTop);
  setAttr(root, "sky-bottom", "stop-color", light.skyBottom);
  // The sun goes down behind the hills, so for the whole of the pink hour
  // there is no sun in the sky to be pink. What a dusk actually shows is
  // the glow it left where it went: a wash on the horizon, at the end of
  // the arc it set at, which the ridges stand black against.
  const dawnNear = Math.abs(cal.hour - cal.sunrise);
  const duskNear = Math.abs(cal.hour - cal.sunset);
  const dusking = duskNear <= dawnNear;
  const near = Math.min(dawnNear, duskNear);
  const glow = Math.max(0, 1 - near / 1.6);
  // By class rather than by id: the gradient's id carries this sky's own
  // suffix, and the class is what stays the same across all of them.
  root.querySelector(".glowgrad")?.setAttribute("cx", f(g.cx + (dusking ? g.arcR : -g.arcR) * 0.85));
  setAttr(root, "sky-glow", "opacity", glow.toFixed(2));
  for (const id of ["sky-glow-in", "sky-glow-mid", "sky-glow-out"]) {
    setAttr(root, id, "stop-color", css(dusking ? GLOW_DUSK : GLOW_DAWN));
  }

  const label = root.querySelector<SVGElement>("#sky-label");
  const text = phaseName(cal);
  if (label && label.textContent !== text) label.textContent = text;

  // What the air is doing. Cloud thickens as the sky stops being clear and
  // thickens again while something is falling out of it; the fall itself is
  // snow or rain, and a storm leans it over and hurries it along.
  const w = state.weather;
  const falling = light.precip !== "none";
  // An overcast sky is covered. At half opacity the blue read straight
  // through the cloud and the widget looked like a fair day with a smudge
  // over it, which is not what the word says.
  const cover = falling ? 1 : w.clear ? 0 : 0.95;
  setAttr(root, "sky-clouds", "opacity", cover.toFixed(2));
  setAttr(root, "sky-fall", "opacity", falling ? "1" : "0");
  // Behind a cloud deck there is no disc to see. A flat grey sun pasted on
  // an overcast card was the one thing in the picture that never happens.
  const through = (1 - 0.92 * cover).toFixed(2);
  setAttr(root, "sky-sun", "opacity", pos.body === "sun" ? through : "0");
  setAttr(root, "sky-moon", "opacity", pos.body === "moon" ? through : "0");
  svg.classList.toggle("snow", light.precip === "snow");
  svg.classList.toggle("rain", light.precip === "rain");
  svg.classList.toggle("storm", Boolean(w.storm && stormNow(w, state.minute)));
  // The cloud is coloured by the hour, so it darkens through the evening
  // rather than sitting white over a night sky.
  setAttr(root, "sky-cloudflood", "flood-color", light.cloudLow);
  setAttr(root, "sky-cloudflood-hi", "flood-color", light.cloudHigh);
  setAttr(root, "sky-haze", "fill", light.cloudLow);

  // Snow on the ground is white ground. Black hills under a card reading
  // "snow 40 cm" said one thing in words and another in the picture.
  const lying = w.snowCm >= 1;
  for (const [id, bare, snowy] of RIDGES) setAttr(root, id, "fill", lying ? snowy : bare);
}

/** The three ridges, as they are bare and as they are under snow. */
const RIDGES: ReadonlyArray<readonly [string, string, string]> = [
  ["sky-far", "#141c24", "#8695ab"],
  ["sky-mid", "#0f161c", "#61708a"],
  ["sky-near", "#0b1210", "#3c4859"],
];

export function phaseName(cal: Calendar): string {
  const h = cal.hour;
  if (h >= cal.sunrise - 0.75 && h < cal.sunrise + 0.75) return "dawn";
  if (h >= cal.sunset - 1.5 && h < cal.sunset - 0.25) return "golden hour";
  if (h >= cal.sunset - 0.25 && h < cal.sunset + 0.75) return "dusk";
  if (cal.isNight) return "night";
  return "day";
}
