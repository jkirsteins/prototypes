/**
 * The map is a viewport of glyphs centred on the player, its size and its
 * ground per glyph set by the zoom level (LEVELS below). At the three
 * closest a glyph is one cell, drawn larger each rung; beyond them a glyph
 * is a block of cells drawn as its commonest ground. Regions never visited
 * are fog; regions only seen from next door are dim. The player never pans;
 * the world moves under them.
 */
import type { Calendar } from "../sim/calendar";
import { fuelTotal } from "../sim/fire";
import { FIRE_LOW_KG } from "../sim/items";
import { knowledgeGen } from "../sim/mapped";
import { cellOf } from "../sim/position";
import { visitedCamps } from "../sim/light";
import { discovery, VISITED } from "../sim/regionstate";
import type { GameState, SpotId, Terrain } from "../sim/types";
import { ambientTemperature, iceMode } from "../sim/weather";
import { cellAt, cellIdx, regionPeek, terrainPeek, type World } from "../world/gen";
import { esc, type UiState } from "./render";
import { elevationAt, groundGlyph, toneCuts, toneOf, TREES, VARIANTS, type ToneCuts } from "./ground";
import { lighting } from "./sky";

export const GLYPH: Record<Terrain, string> = {
  water: "~", fell: "^", rock: "n", bog: "\"", spruce: "A", pine: "T", birch: "Y", meadow: ".",
};

/** What each terrain glyph is called, for the legend. */
const TERRAIN_NAME: Record<Terrain, string> = {
  water: "water", fell: "fell", rock: "rock", bog: "bog", spruce: "spruce", pine: "pine", birch: "birch", meadow: "meadow",
};

/**
 * Every mark the map can place on a glyph: what it looks like, its map
 * class (so the legend's letter carries the same colour as the map's),
 * and what the legend calls it. mapHtml's marker placement reads this same
 * table, so a mark added here cannot go undocumented in the legend, and a
 * legend entry can never point at a mark the map does not actually place.
 */
export const MARKS = {
  you: { glyph: "@", cls: "mk-player", label: "you" },
  fire: { glyph: "F", cls: "mk-fire", label: "fire" },
  shelter: { glyph: "H", cls: "mk-shelter", label: "shelter" },
  camp: { glyph: "x", cls: "mk-camp", label: "camp" },
  trap: { glyph: "T", cls: "mk-trap", label: "trap" },
  seep: { glyph: "s", cls: "mk-seep", label: "seep" },
  forest: { glyph: "%", cls: "mk-spot", label: "forest" },
  outcrop: { glyph: "o", cls: "mk-spot", label: "outcrop" },
  shore: { glyph: "w", cls: "mk-spot", label: "shore" },
  heath: { glyph: ";", cls: "mk-spot", label: "heath" },
} as const satisfies Record<string, { glyph: string; cls: string; label: string }>;

/**
 * The places the HERE panel offers to walk to, as marks. Camp is not among them:
 * it already has its own mark, and a camp is drawn wherever one stands rather
 * than only at the region's own site.
 */
export const SPOT_MARKS: Partial<Record<SpotId, (typeof MARKS)[keyof typeof MARKS]>> = {
  forest: MARKS.forest,
  outcrop: MARKS.outcrop,
  shore: MARKS.shore,
  heath: MARKS.heath,
};

/**
 * The map's key: every terrain letter from the glyph table, then ice, then
 * every mark from `MARKS`. Static content - it names nothing that changes
 * between renders - so it is filled into `.legend` once at boot rather
 * than rebuilt with the map.
 */
export function legendHtml(): string {
  // A terrain with forms names them all here instead of its plain letter, so the
  // key never says "water" twice with a different glyph each time.
  const terrain = (Object.keys(GLYPH) as Terrain[])
    .map((t) => {
      const v = VARIANTS[t];
      const forms = (v ? v.forms : [GLYPH[t]]).map((g) => `<b>${g === '"' ? "&quot;" : g}</b>`).join(" ");
      return `<span>${forms} ${TERRAIN_NAME[t]}${v ? `: ${v.reads}` : ""}</span>`;
    })
    .join("");
  const marks = Object.values(MARKS)
    .map((m) => `<span><b class="${m.cls}">${m.glyph}</b> ${m.label}</span>`)
    .join("");
  return (
    `${terrain}<span><b>=</b> ice</span>${marks}` +
    `<span class="tone-key">brighter trees stand higher</span>` +
    `<span class="pl-key">underlined: something lies there</span>` +
    `<span class="walk-key"><svg viewBox="0 0 24 6"><polyline class="walk-ahead" points="1,3 23,3"/></svg> your walk, solid ahead, dashed behind</span>` +
    `<span class="fog-key">dark: never been there</span>`
  );
}

export const SNOW_SHOWN_CM = 5;

/**
 * One rung of the zoom ladder: how much ground a glyph stands for, how many
 * glyphs are drawn, and how big each is on screen.
 */
export interface ZoomLevel {
  /** Cells per glyph. */
  cells: number;
  /** Glyphs across and down. */
  w: number;
  h: number;
  /** The glyph box and its type, in pixels; the stylesheet reads all three off the grid. */
  px: number;
  line: number;
  font: number;
}

/** The board every level from the cell outwards is drawn on: 72 by 36 small glyphs. */
const BOARD = { w: 72, h: 36, px: 11, line: 14, font: 12 };

/**
 * The ladder, closest first. Past one cell per glyph there is nothing finer
 * to draw, so the two closest rungs hold the cell and grow the glyph, which
 * means fewer of them: the map keeps the same box on screen throughout and
 * shows less ground the closer it goes, the way a zoom should. The last rung
 * is the smallest that fits the whole world.
 */
export const LEVELS: ZoomLevel[] = [
  { cells: 1, w: 36, h: 18, px: 22, line: 28, font: 23 },
  { cells: 1, w: 49, h: 24, px: 16, line: 21, font: 17 },
  { cells: 1, ...BOARD },
  { cells: 3, ...BOARD },
  { cells: 9, ...BOARD },
  { cells: Math.max(Math.ceil(1800 / BOARD.w), Math.ceil(1300 / BOARD.h)), ...BOARD },
];

/** Where a fresh screen opens: one cell per glyph on the whole board, as it always did. */
export const DEFAULT_ZOOM = 2;

/** The level at this rung, clamped, so a stale zoom index can never draw nothing. */
export function levelAt(zoom: number): ZoomLevel {
  return LEVELS[Math.max(0, Math.min(LEVELS.length - 1, zoom))];
}

/** Cells per glyph at each zoom level. */
export const ZOOMS = LEVELS.map((l) => l.cells);
/** Priority when a block's ground is tied: what the eye should see first. */
const TIE_ORDER: Terrain[] = ["water", "fell", "rock", "spruce", "pine", "birch", "bog", "meadow"];

export function zoomLabel(zoom: number): string {
  const km = levelAt(zoom).cells * 0.3;
  return km < 1 ? `${Math.round(km * 1000)} m per glyph` : `${km.toFixed(1)} km per glyph`;
}

/** Top-left cell of the viewport, so the player sits in the middle glyph. */
export function viewOrigin(state: GameState, world: World, zoom: number): { x0: number; y0: number } {
  const l = levelAt(zoom);
  const z = l.cells;
  const px = Math.floor(state.player.x);
  const py = Math.floor(state.player.y);
  const spanX = l.w * z;
  const spanY = l.h * z;
  let x0 = px - Math.floor(spanX / 2);
  let y0 = py - Math.floor(spanY / 2);
  // Clamp to the world's edge, or centre a world smaller than the view; the
  // origin may then be negative and the glyphs outside the world are void.
  x0 = spanX >= world.w ? -Math.floor((spanX - world.w) / 2 / z) * z : Math.max(0, Math.min(world.w - spanX, x0));
  y0 = spanY >= world.h ? -Math.floor((spanY - world.h) / 2 / z) * z : Math.max(0, Math.min(world.h - spanY, y0));
  return { x0, y0 };
}

interface Block { terrain: Terrain; region: number; seen: 0 | 1 | 2 }

/** A cell's own knowledge: 0 unknown, 1 dim (only the journal has it), 2 known this life. */
function cellKnowledge(state: GameState, world: World, x: number, y: number): 0 | 1 | 2 {
  const m = state.mapped[cellIdx(world, x, y)];
  return m === undefined ? 0 : m === 1 ? 2 : 1;
}

/**
 * A block reads as known only once more than half its sampled cells are -
 * ties go to fog. A corridor one cell wide fills at most a couple of a
 * block's nine samples, so it stays fog at this zoom and only reads as a
 * thread at the closer rungs, where a glyph is one cell and cannot blur.
 */
const BLOCK_MAJORITY = 0.5;

/**
 * What a glyph shows for its block: the commonest ground among a 3 by 3
 * sample of cells actually known, the region at the centre, and the
 * block's own knowledge - unknown unless most sampled cells are known,
 * dim rather than bright unless most of what is known is this life's.
 */
function blockInfo(state: GameState, world: World, x0: number, y0: number, z: number): Block {
  if (z === 1) {
    const region = regionPeek(world, x0, y0);
    return { terrain: terrainPeek(world, x0, y0), region, seen: cellKnowledge(state, world, x0, y0) };
  }
  const counts = new Map<Terrain, number>();
  const step = Math.max(1, Math.floor(z / 3));
  let n = 0;
  let knownAny = 0;
  let knownBright = 0;
  for (let j = step >> 1; j < z; j += step) {
    for (let i = step >> 1; i < z; i += step) {
      n++;
      const k = cellKnowledge(state, world, x0 + i, y0 + j);
      if (k > 0) {
        knownAny++;
        if (k === 2) knownBright++;
        const t = terrainPeek(world, x0 + i, y0 + j);
        counts.set(t, (counts.get(t) ?? 0) + 1);
      }
    }
  }
  let best: Terrain = "water";
  let bestN = -1;
  for (const t of TIE_ORDER) {
    const c = counts.get(t) ?? 0;
    if (c > bestN) {
      bestN = c;
      best = t;
    }
  }
  const seen: 0 | 1 | 2 = knownAny / n <= BLOCK_MAJORITY ? 0 : knownBright / knownAny > BLOCK_MAJORITY ? 2 : 1;
  return { terrain: best, region: regionPeek(world, x0 + (z >> 1), y0 + (z >> 1)), seen };
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
export function litRings(sources: LightSource[], toGlyph: (cell: number) => number, z: number, view: { w: number; h: number }): Map<number, number> {
  const rings = new Map<number, number>();
  const reachAt = z === 1 ? 2 : z === 3 ? 0 : -1;
  if (reachAt < 0) return rings;
  for (const s of sources) {
    const g = toGlyph(s.cell);
    if (g < 0) continue;
    const reach = Math.min(s.reach, reachAt);
    const gx = g % view.w;
    const gy = Math.floor(g / view.w);
    for (let dy = -reach; dy <= reach; dy++) {
      for (let dx = -reach; dx <= reach; dx++) {
        const d = Math.max(Math.abs(dx), Math.abs(dy));
        if (Math.abs(dx) === 2 && Math.abs(dy) === 2) continue;
        const x = gx + dx;
        const y = gy + dy;
        if (x < 0 || y < 0 || x >= view.w || y >= view.h) continue;
        const i = y * view.w + x;
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

/**
 * The walk as a line through glyph centres: solid from the survivor's glyph
 * to the target, dashed from where the walk began to the survivor's glyph.
 * The viewBox is in glyphs, so the same points serve every zoom; a point off
 * the view is kept and clipped rather than dropped, since dropping it would
 * join the two visible ends with a false straight segment. Cells that share
 * a glyph collapse to one point, and a polyline of one point draws nothing.
 * With no route the element is emitted empty, so the markup has one shape.
 */
function walkSvg(world: World, state: GameState, here: number, x0: number, y0: number, z: number, view: { w: number; h: number }): string {
  const route = state.route;
  const points = (cells: number[]): string => {
    const out: string[] = [];
    let last = "";
    for (const cell of cells) {
      const c = cellAt(world, cell);
      const pt = `${Math.floor((c.x - x0) / z) + 0.5},${Math.floor((c.y - y0) / z) + 0.5}`;
      if (pt === last) continue;
      out.push(pt);
      last = pt;
    }
    return out.join(" ");
  };
  const behind = route ? points([...route.walked, here]) : "";
  const ahead = route ? points([here, ...route.path]) : "";
  return `<svg class="walk" viewBox="0 0 ${view.w} ${view.h}" preserveAspectRatio="none"><polyline class="walk-behind" points="${behind}"/><polyline class="walk-ahead" points="${ahead}"/></svg>`;
}

/** Everything the map's markup depends on, so it is rebuilt only when one of them changes. */
export function mapKey(state: GameState, world: World, ui: UiState, cal: Calendar): string {
  const marks = Object.entries(state.regions).map(([id, r]) => `${id}${r.structures.cabin || r.structures.leanTo || r.structures.turfHut ? "H" : ""}${r.fire.lit ? (fuelTotal(r.fire) >= FIRE_LOW_KG ? "F" : "f") : ""}${r.trap ? "T" : ""}`).join(",");
  const route = state.route ? `${state.route.target}:${state.route.path.length}` : "";
  const piles = Object.keys(state.piles).join(",");
  const { x0, y0 } = viewOrigin(state, world, ui.zoom);
  const cell = cellOf(state, world);
  const discoveredSum = Object.values(state.discovered).reduce((a, b) => a + b, 0);
  return `${ui.zoom}|${x0}|${y0}|${cell}|${ui.selected}|${state.weather.snowCm > SNOW_SHOWN_CM}|${iceMode(state.weather)}|${cal.isNight}|${marks}|${route}|${piles}|${Object.keys(state.discovered).length}|${discoveredSum}|${knowledgeGen()}|${state.player.torch.lit ? "T" : ""}`;
}

export function mapHtml(world: World, state: GameState, ui: UiState, cal: Calendar): string {
  const cur = state.player.region;
  const sel = ui.selected;
  const snow = state.weather.snowCm > SNOW_SHOWN_CM;
  const l = levelAt(ui.zoom);
  const z = l.cells;
  const { x0, y0 } = viewOrigin(state, world, ui.zoom);
  const playerCell = cellOf(state, world);
  const toGlyph = (cell: number): number => {
    const c = cellAt(world, cell);
    const gx = Math.floor((c.x - x0) / z);
    const gy = Math.floor((c.y - y0) / z);
    if (gx < 0 || gy < 0 || gx >= l.w || gy >= l.h) return -1;
    return gy * l.w + gx;
  };

  const markerAt = new Map<number, (typeof MARKS)[keyof typeof MARKS]>();
  for (const { st, cell } of visitedCamps(state)) {
    let m: (typeof MARKS)[keyof typeof MARKS];
    if (st.fire.lit) m = MARKS.fire;
    else if (st.structures.cabin || st.structures.leanTo || st.structures.turfHut) m = MARKS.shelter;
    else m = MARKS.camp;
    const g = toGlyph(cell);
    if (g >= 0) markerAt.set(g, m);
  }
  for (const r of Object.values(state.regions)) {
    if (!r.trap) continue;
    const g = toGlyph(r.trap.cell);
    if (g >= 0 && !markerAt.has(g)) markerAt.set(g, MARKS.trap);
  }
  for (const k of Object.keys(state.seeps)) {
    const g = toGlyph(Number(k));
    if (g >= 0 && !markerAt.has(g)) markerAt.set(g, MARKS.seep);
  }
  // The named places, and only closer than the map opens at: the two close rungs
  // showed the same ground at a larger size and nothing else, so this is what
  // zooming in buys. A place is known once its region has been walked in.
  if (z === 1 && ui.zoom < DEFAULT_ZOOM) {
    for (const [id, r] of world.regions) {
      if (discovery(state, id) !== VISITED) continue;
      for (const sp of r.spots) {
        const mark = SPOT_MARKS[sp.id];
        if (!mark) continue;
        const g = toGlyph(sp.cell);
        if (g >= 0 && !markerAt.has(g)) markerAt.set(g, mark);
      }
    }
  }
  const playerGlyph = toGlyph(playerCell);
  markerAt.set(playerGlyph, MARKS.you);
  const pileGlyphs = new Set<number>();
  for (const k of Object.keys(state.piles)) {
    const g = toGlyph(Number(k));
    if (g >= 0) pileGlyphs.add(g);
  }
  const rings = cal.isNight ? litRings(lightSources(state, world), toGlyph, z, l) : new Map<number, number>();

  // Region, ground and discovery per glyph, then borders between glyphs.
  const regions = new Int32Array(l.w * l.h);
  const terrains: Terrain[] = new Array(l.w * l.h);
  const seenAt = new Uint8Array(l.w * l.h);
  for (let gy = 0; gy < l.h; gy++) {
    for (let gx = 0; gx < l.w; gx++) {
      const cx = x0 + gx * z;
      const cy = y0 + gy * z;
      const i = gy * l.w + gx;
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

  // The height shading normalises to what is on screen, so every elevation must
  // be read before any one cell's tone can be decided.
  const elev = z === 1 ? new Float32Array(l.w * l.h) : null;
  let cuts: ToneCuts | null = null;
  if (elev) {
    const seen: number[] = [];
    for (let gy = 0; gy < l.h; gy++) {
      for (let gx = 0; gx < l.w; gx++) {
        const i = gy * l.w + gx;
        if (regions[i] < 0 || !seenAt[i] || !TREES.includes(terrains[i])) continue;
        const e = elevationAt(world.seed, x0 + gx * z, y0 + gy * z);
        elev[i] = e;
        seen.push(e);
      }
    }
    cuts = toneCuts(seen);
  }

  // The tools sit in the map's bottom left corner (drawn after the grid, placed
  // by the stylesheet), so they cost the panel no height of their own; the span
  // the two buttons stand over is the label's title rather than a line of text.
  // The three closest rungs all read a cell per glyph, so the span is what tells
  // them apart on the label; "centred on you" is the title and not the corner.
  const span = `${(l.w * z * 0.3).toFixed(0)} by ${(l.h * z * 0.3).toFixed(0)} km`;
  const tools = `<div class="maptools"><button class="mini" data-act="zoom" data-dir="in" ${ui.zoom === 0 ? "disabled" : ""} title="Closer (plus key)">+</button><button class="mini" data-act="zoom" data-dir="out" ${ui.zoom === LEVELS.length - 1 ? "disabled" : ""} title="Farther (minus key)">-</button><span class="dim" title="${esc(`${span} on screen, centred on you`)}">${zoomLabel(ui.zoom)}, ${span}</span></div>`;

  const parts: string[] = [];
  // The hour's light is written into the grid as it is built, in the figures
  // updateSky writes each frame. A grid built without them would be born at
  // the stylesheet's daylight defaults, and the first frame after would
  // animate it down to the true light through the half-second transitions on
  // the shade, the tint and the saturation: a fade over the whole map every
  // time it is rebuilt, which is every zoom, every step into a new view.
  const light = lighting(cal, state.weather, ambientTemperature(cal, state.weather));
  const falling = light.precip === "rain" ? " rain" : light.precip === "snow" ? " snowing" : "";
  const lit = `--bright:${light.brightness.toFixed(3)};--sat:${light.saturation.toFixed(3)};--tint:${light.tint};--tint-a:${light.alpha.toFixed(3)}`;
  parts.push(`<div class="scroll-x"><div class="grid${snow ? " snow" : ""}${cal.isNight ? " night" : ""}${falling}" style="--cols:${l.w};--px:${l.px}px;--line:${l.line}px;--font:${l.font}px;${lit}">`);
  for (let i = 0; i < l.w * l.h; i++) {
    const gx = i % l.w;
    const gy = Math.floor(i / l.w);
    const reg = regions[i];
    const seen = reg >= 0 ? seenAt[i] : 0;
    const named = reg >= 0 && discovery(state, reg) > 0;
    const cls = ["c"];
    let glyph = " ";
    let title = "";
    let style = "";
    if (reg < 0) {
      cls.push("void");
    } else if (seen === 0) {
      cls.push("fog");
      // Only regions already built get named; building one here would fill its chunks for a tooltip.
      title = named ? (world.regions.get(reg)?.name ?? "ground heard of, not seen") : "unknown ground";
    } else {
      const t = terrains[i];
      cls.push(`t-${t}`);
      if (seen === 1) cls.push("dim");
      if (drawBorders) {
        if (gx > 0 && regions[i - 1] !== reg) cls.push("bl");
        if (gx < l.w - 1 && regions[i + 1] !== reg) cls.push("br");
        if (gy > 0 && regions[i - l.w] !== reg) cls.push("bt");
        if (gy < l.h - 1 && regions[i + l.w] !== reg) cls.push("bb");
      }
      if (reg === cur) cls.push("cur");
      if (sel !== null && reg === sel) cls.push("sel");
      glyph = GLYPH[t];
      // A coarser glyph is a block of mixed ground with no single field to report.
      if (z === 1) {
        glyph = groundGlyph(world.seed, x0 + gx * z, y0 + gy * z, t, glyph);
        if (elev && TREES.includes(t)) {
          const tone = toneOf(elev[i], cuts);
          if (tone !== 1) cls.push(`tone-${tone}`);
        }
      }
      if (t === "water" && iceMode(state.weather) !== "none") {
        glyph = "=";
        cls.push(iceMode(state.weather) === "safe" ? "ice-safe" : "ice-thin");
      }
      if (snow && t === "meadow") glyph = "*";
      title = world.regions.get(reg)?.name ?? (seen === 2 ? "known country" : "known once");
      if (pileGlyphs.has(i) && seen === 2) {
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
      title = `${m.label}, ${title}`;
    }
    // Selecting is what puts the Explore button on the panel, so a named region stays
    // clickable on the map whether or not its ground itself has been walked.
    const act = named ? ` data-act="select" data-r="${reg}"` : "";
    // The scroll wrapper centres on this glyph after every rebuild.
    const you = m?.cls === "mk-player" ? ` data-you="1"` : "";
    parts.push(`<span class="${cls.join(" ")}"${act}${you}${style} title="${esc(title)}">${glyph === "\"" ? "&quot;" : glyph}</span>`);
  }
  parts.push(`<i class="shade"></i>${walkSvg(world, state, playerCell, x0, y0, z, l)}</div></div>${tools}`);
  return parts.join("");
}
