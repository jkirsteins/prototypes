/**
 * The map is a viewport of 72 by 36 glyphs centred on the player. At zoom 0
 * a glyph is one cell; at coarser zooms a glyph is a block of cells drawn as
 * its commonest ground. Regions never visited are fog; regions only seen from
 * next door are dim. The player never pans; the world moves under them.
 */
import type { Calendar } from "../sim/calendar";
import { fuelTotal } from "../sim/fire";
import { FIRE_LOW_KG } from "../sim/items";
import { cellOf } from "../sim/position";
import { DIM, discovery, SEEN, VISITED } from "../sim/regionstate";
import type { GameState, RegionState, Terrain } from "../sim/types";
import { iceMode } from "../sim/weather";
import { cellAt, regionPeek, terrainPeek, type World } from "../world/gen";
import { esc, type UiState } from "./render";

export const GLYPH: Record<Terrain, string> = {
  water: "~", fell: "^", rock: "n", bog: "\"", spruce: "A", pine: "T", birch: "Y", meadow: ".",
};

export const SNOW_SHOWN_CM = 5;
export const VIEW_W = 72;
export const VIEW_H = 36;
/** Cells per glyph at each zoom level; the last is the smallest that fits the whole world on screen. */
export const ZOOMS = [1, 3, 9, Math.max(Math.ceil(1800 / VIEW_W), Math.ceil(1300 / VIEW_H))];
/** Priority when a block's ground is tied: what the eye should see first. */
const TIE_ORDER: Terrain[] = ["water", "fell", "rock", "spruce", "pine", "birch", "bog", "meadow"];

export function zoomLabel(zoom: number): string {
  const km = ZOOMS[zoom] * 0.3;
  return km < 1 ? `${Math.round(km * 1000)} m per glyph` : `${km.toFixed(1)} km per glyph`;
}

/** Top-left cell of the viewport, so the player sits in the middle glyph. */
export function viewOrigin(state: GameState, world: World, zoom: number): { x0: number; y0: number } {
  const z = ZOOMS[zoom];
  const px = Math.floor(state.player.x);
  const py = Math.floor(state.player.y);
  const spanX = VIEW_W * z;
  const spanY = VIEW_H * z;
  let x0 = px - Math.floor(spanX / 2);
  let y0 = py - Math.floor(spanY / 2);
  // Clamp to the world's edge, or centre a world smaller than the view; the
  // origin may then be negative and the glyphs outside the world are void.
  x0 = spanX >= world.w ? -Math.floor((spanX - world.w) / 2 / z) * z : Math.max(0, Math.min(world.w - spanX, x0));
  y0 = spanY >= world.h ? -Math.floor((spanY - world.h) / 2 / z) * z : Math.max(0, Math.min(world.h - spanY, y0));
  return { x0, y0 };
}

interface Block { terrain: Terrain; region: number; seen: 0 | 1 | 2 | 3 }

/**
 * What a glyph shows for its block: the commonest ground among a 3 by 3
 * sample, the region at the centre, and the best discovery level of any
 * sampled region, so a block you stand in is never fog.
 */
function blockInfo(state: GameState, world: World, x0: number, y0: number, z: number): Block {
  if (z === 1) {
    const region = regionPeek(world, x0, y0);
    return { terrain: terrainPeek(world, x0, y0), region, seen: discovery(state, region) };
  }
  const counts = new Map<Terrain, number>();
  const step = Math.max(1, Math.floor(z / 3));
  let seen: 0 | 1 | 2 | 3 = 0;
  for (let j = step >> 1; j < z; j += step) {
    for (let i = step >> 1; i < z; i += step) {
      const reg = regionPeek(world, x0 + i, y0 + j);
      const d = discovery(state, reg);
      if (d > seen) seen = d;
      if (d > 0) {
        const t = terrainPeek(world, x0 + i, y0 + j);
        counts.set(t, (counts.get(t) ?? 0) + 1);
      }
    }
  }
  let best: Terrain = "water";
  let bestN = -1;
  for (const t of TIE_ORDER) {
    const n = counts.get(t) ?? 0;
    if (n > bestN) {
      bestN = n;
      best = t;
    }
  }
  return { terrain: best, region: regionPeek(world, x0 + (z >> 1), y0 + (z >> 1)), seen };
}

/** Every visited region's camp, so a fire cannot glow on the map without its marker or the reverse. */
function visitedCamps(state: GameState): { id: number; st: RegionState; cell: number }[] {
  const out: { id: number; st: RegionState; cell: number }[] = [];
  for (const [idText, st] of Object.entries(state.regions)) {
    const id = Number(idText);
    if (discovery(state, id) !== VISITED) continue;
    out.push({ id, st, cell: st.campCell });
  }
  return out;
}

export interface LightSource { cell: number; reach: number }

/** Where light is on the map tonight: every visited camp's lit fire, two rings when it is well fed, one when low. */
export function lightSources(state: GameState, world: World): LightSource[] {
  const out: LightSource[] = [];
  for (const { st, cell } of visitedCamps(state)) {
    if (!st.fire.lit) continue;
    out.push({ cell, reach: fuelTotal(st.fire) >= FIRE_LOW_KG ? 2 : 1 });
  }
  if (state.player.torch.lit) out.push({ cell: cellOf(state, world), reach: 1 });
  return out;
}

/**
 * Ring per lit glyph: 0 is the source, 1 and 2 the squares around it with
 * ring 2's corners cut so the glow is round. A glyph reached twice takes
 * the nearer ring. Rings shrink with zoom: whole at one cell per glyph,
 * the source alone at three, nothing beyond.
 */
export function litRings(sources: LightSource[], toGlyph: (cell: number) => number, z: number): Map<number, number> {
  const rings = new Map<number, number>();
  const reachAt = z === 1 ? 2 : z === 3 ? 0 : -1;
  if (reachAt < 0) return rings;
  for (const s of sources) {
    const g = toGlyph(s.cell);
    if (g < 0) continue;
    const reach = Math.min(s.reach, reachAt);
    const gx = g % VIEW_W;
    const gy = Math.floor(g / VIEW_W);
    for (let dy = -reach; dy <= reach; dy++) {
      for (let dx = -reach; dx <= reach; dx++) {
        const d = Math.max(Math.abs(dx), Math.abs(dy));
        if (Math.abs(dx) === 2 && Math.abs(dy) === 2) continue;
        const x = gx + dx;
        const y = gy + dy;
        if (x < 0 || y < 0 || x >= VIEW_W || y >= VIEW_H) continue;
        const i = y * VIEW_W + x;
        const prev = rings.get(i);
        if (prev === undefined || d < prev) rings.set(i, d);
      }
    }
  }
  return rings;
}

/** A negative animation delay under 1.1 s, fixed per glyph index, so neighbouring flames are out of step. */
export function flickerDelay(i: number): string {
  return `-${(((i * 2654435761) >>> 0) % 1100) / 1000}s`;
}

/** Everything the map's markup depends on, so it is rebuilt only when one of them changes. */
export function mapKey(state: GameState, world: World, ui: UiState, cal: Calendar): string {
  const marks = Object.entries(state.regions).map(([id, r]) => `${id}${r.structures.cabin || r.structures.leanTo || r.structures.turfHut ? "H" : ""}${r.fire.lit ? (fuelTotal(r.fire) >= FIRE_LOW_KG ? "F" : "f") : ""}${r.trap ? "T" : ""}`).join(",");
  const route = state.route ? `${state.route.target}:${state.route.path.length}` : "";
  const piles = Object.keys(state.piles).join(",");
  const { x0, y0 } = viewOrigin(state, world, ui.zoom);
  const cell = cellOf(state, world);
  const discoveredSum = Object.values(state.discovered).reduce((a, b) => a + b, 0);
  return `${ui.zoom}|${x0}|${y0}|${cell}|${ui.selected}|${state.weather.snowCm > SNOW_SHOWN_CM}|${iceMode(state.weather)}|${cal.isNight}|${marks}|${route}|${piles}|${Object.keys(state.discovered).length}|${discoveredSum}|${state.player.torch.lit ? "T" : ""}`;
}

export function mapHtml(world: World, state: GameState, ui: UiState, cal: Calendar): string {
  const cur = state.player.region;
  const sel = ui.selected;
  const snow = state.weather.snowCm > SNOW_SHOWN_CM;
  const z = ZOOMS[ui.zoom];
  const { x0, y0 } = viewOrigin(state, world, ui.zoom);
  const playerCell = cellOf(state, world);
  const toGlyph = (cell: number): number => {
    const c = cellAt(world, cell);
    const gx = Math.floor((c.x - x0) / z);
    const gy = Math.floor((c.y - y0) / z);
    if (gx < 0 || gy < 0 || gx >= VIEW_W || gy >= VIEW_H) return -1;
    return gy * VIEW_W + gx;
  };

  const markerAt = new Map<number, { glyph: string; cls: string }>();
  for (const { st, cell } of visitedCamps(state)) {
    let m: { glyph: string; cls: string } | null = null;
    if (st.fire.lit) m = { glyph: "F", cls: "mk-fire" };
    else if (st.structures.cabin || st.structures.leanTo || st.structures.turfHut) m = { glyph: "H", cls: "mk-shelter" };
    if (m) {
      const g = toGlyph(cell);
      if (g >= 0) markerAt.set(g, m);
    }
  }
  for (const r of Object.values(state.regions)) {
    if (!r.trap) continue;
    const g = toGlyph(r.trap.cell);
    if (g >= 0 && !markerAt.has(g)) markerAt.set(g, { glyph: "T", cls: "mk-trap" });
  }
  const playerGlyph = toGlyph(playerCell);
  markerAt.set(playerGlyph, { glyph: "@", cls: "mk-player" });
  const routeGlyphs = new Set<number>();
  for (const c of state.route?.path ?? []) {
    const g = toGlyph(c);
    if (g >= 0) routeGlyphs.add(g);
  }
  const pileGlyphs = new Set<number>();
  for (const k of Object.keys(state.piles)) {
    const g = toGlyph(Number(k));
    if (g >= 0) pileGlyphs.add(g);
  }
  const rings = cal.isNight ? litRings(lightSources(state, world), toGlyph, z) : new Map<number, number>();

  // Region, ground and discovery per glyph, then borders between glyphs.
  const regions = new Int32Array(VIEW_W * VIEW_H);
  const terrains: Terrain[] = new Array(VIEW_W * VIEW_H);
  const seenAt = new Uint8Array(VIEW_W * VIEW_H);
  for (let gy = 0; gy < VIEW_H; gy++) {
    for (let gx = 0; gx < VIEW_W; gx++) {
      const cx = x0 + gx * z;
      const cy = y0 + gy * z;
      const i = gy * VIEW_W + gx;
      const inside = cx >= 0 && cy >= 0 && cx < world.w && cy < world.h;
      if (!inside) {
        regions[i] = -1;
        terrains[i] = "water";
        continue;
      }
      const b = blockInfo(state, world, cx, cy, z);
      regions[i] = b.region;
      terrains[i] = b.terrain;
      seenAt[i] = b.seen;
    }
  }
  const drawBorders = z <= 3;

  const parts: string[] = [];
  parts.push(`<div class="maptools"><button class="mini" data-act="zoom" data-dir="in" ${ui.zoom === 0 ? "disabled" : ""} title="Closer (plus key)">+ closer</button><button class="mini" data-act="zoom" data-dir="out" ${ui.zoom === ZOOMS.length - 1 ? "disabled" : ""} title="Farther (minus key)">- farther</button><span class="dim">${zoomLabel(ui.zoom)}, ${(VIEW_W * z * 0.3).toFixed(0)} by ${(VIEW_H * z * 0.3).toFixed(0)} km on screen, centred on you</span></div>`);
  parts.push(`<div class="grid${snow ? " snow" : ""}${cal.isNight ? " night" : ""}">`);
  for (let i = 0; i < VIEW_W * VIEW_H; i++) {
    const gx = i % VIEW_W;
    const gy = Math.floor(i / VIEW_W);
    const reg = regions[i];
    const seen = reg >= 0 ? seenAt[i] : 0;
    const cls = ["c"];
    let glyph = " ";
    let title = "";
    let style = "";
    if (reg < 0) {
      cls.push("void");
    } else if (seen === 0) {
      cls.push("fog");
      title = "unknown ground";
    } else {
      const t = terrains[i];
      cls.push(`t-${t}`);
      if (seen === SEEN || seen === DIM) cls.push("dim");
      if (drawBorders) {
        if (gx > 0 && regions[i - 1] !== reg) cls.push("bl");
        if (gx < VIEW_W - 1 && regions[i + 1] !== reg) cls.push("br");
        if (gy > 0 && regions[i - VIEW_W] !== reg) cls.push("bt");
        if (gy < VIEW_H - 1 && regions[i + VIEW_W] !== reg) cls.push("bb");
      }
      if (reg === cur) cls.push("cur");
      if (sel !== null && reg === sel) cls.push("sel");
      if (routeGlyphs.has(i)) cls.push("rt");
      glyph = GLYPH[t];
      if (t === "water" && iceMode(state.weather) !== "none") {
        glyph = "=";
        cls.push(iceMode(state.weather) === "safe" ? "ice-safe" : "ice-thin");
      }
      if (snow && t === "meadow") glyph = "*";
      // Only regions already built get named; building one here would fill its chunks for a tooltip.
      title = seen === VISITED ? (world.regions.get(reg)?.name ?? "known country") : seen === DIM ? (world.regions.get(reg)?.name ?? "known once") : "seen from a distance";
      if (pileGlyphs.has(i) && seen === VISITED) {
        cls.push("pl");
        title += ", something lies here";
      }
      const ring = rings.get(i);
      if (ring !== undefined) {
        cls.push(`lit-${ring}`);
        style = ` style="--fd:${flickerDelay(i)}"`;
      }
    }
    const m = markerAt.get(i);
    if (m) {
      cls.push("mk", m.cls);
      glyph = m.glyph;
      if (m.cls === "mk-player") title = `you, ${title}`;
    }
    const act = reg >= 0 && seen > 0 ? ` data-act="select" data-r="${reg}"` : "";
    parts.push(`<span class="${cls.join(" ")}"${act}${style} title="${esc(title)}">${glyph === "\"" ? "&quot;" : glyph}</span>`);
  }
  parts.push(`<i class="shade"></i></div>`);
  parts.push(
    `<div class="legend"><span>~ water</span><span>= ice</span><span>A spruce</span><span>T pine</span><span>Y birch</span><span>. meadow</span><span>" bog</span><span>n rock</span><span>^ fell</span><span class="accent">@ you</span><span>H shelter</span><span>F fire</span><span class="pl-key">underlined: something lies there</span><span class="fog-key">dark: never been there</span></div>`,
  );
  return parts.join("");
}
