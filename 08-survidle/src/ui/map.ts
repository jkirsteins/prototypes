/**
 * The map is a viewport of glyphs centred on the player, its size and its
 * ground per glyph set by the zoom level (LEVELS below). At the default a
 * glyph is one 300 m simulation cell. The two closer rungs divide that cell
 * into cosmetic detail while retaining one hit target and one simulation
 * position: 3 by 3 at the first close rung, 6 by 6 at the closest. Beyond the
 * default a glyph is a block of cells drawn as its commonest ground. Regions
 * never visited are fog; regions only seen from next door are dim. At the
 * cell-scale rungs, ground known this life but outside the current viewshed is
 * muted. The player never pans; the world moves under them.
 */
import type { Calendar } from "../sim/calendar";
import { fuelTotal, hasEmbers, roofed } from "../sim/fire";
import { FIRE_LOW_KG } from "../sim/items";
import { knowledgeGen } from "../sim/mapped";
import { cellOf } from "../sim/position";
import { visitedCamps } from "../sim/light";
import { discovery, siteAt, VISITED } from "../sim/regionstate";
import type { AgentSpecies, AtmosphereSample, GameState, LocalGroundWeather, RegionState, Terrain, WildlifeSubject } from "../sim/types";
import { atmosphereAt, conditionsAt, conditionsWithGround, DEEP_SNOW_CM, groundAt, iceMode } from "../sim/weather";
import { cellAt, cellIdx, regionPeek, streamAt, terrainPeek, type World } from "../world/gen";
import { WORLD_H, WORLD_W } from "../world/terrain";
import { CELL_KM } from "../units";
import { activeWildlifeStartles, esc, type UiState } from "./render";
import { elevationAt, offshoreAt, STREAM_MARK, toneCuts, toneOf, TREES, turnedGround, VARIANTS, type ToneCuts } from "./ground";
import { moodOf } from "./mood";
import { lighting } from "./sky";
import { visibleWildlife, wildlifeMembers } from "../sim/wildlife-agents";
import { metricPointForWildlife } from "../sim/wildlife-space";
import { campfireVisible, hasLineOfSight, sightRangeCells, visibleCells } from "../sim/sight";
import { SNOW_SHOWN_CM, terrainHeading } from "../sim/cellstatus";
import { cellKnowledge as presentationKnowledge, cellPresentation, TERRAIN_GLYPH } from "./cellpresentation";

const CELL_M = CELL_KM * 1000;

/** A small open camp fire remains a distinct light out to about five kilometres on a clear night. */
const CAMPFIRE_VISIBLE_KM = 5;
/** Inside one kilometre the map can resolve firelit ground as well as the point source itself. */
const CAMPFIRE_LOCAL_LIGHT_KM = 1;

export const GLYPH = TERRAIN_GLYPH;

/**
 * Every mark the map can place on a glyph: what it looks like, its map
 * class (so the legend's letter carries the same colour as the map's),
 * and what the legend calls it. mapHtml's marker placement reads this same
 * table, so a mark added here cannot go undocumented in the legend, and a
 * legend entry can never point at a mark the map does not actually place.
 *
 * Every one of them is something that is there because the survivor built it
 * or found it. The named places - forest, outcrop, shore, heath - were marked
 * here once and are not any more: a mark on them is not clickable, the HERE
 * panel already lists every place in the region with its distance and a walk
 * button, and an order resolves its own cell and walks there without the
 * player ever locating it. Marking ground the world always had put four
 * tinted tiles around the camp for no act they enabled.
 */
type Mark = { glyph: string; cls: string; label: string };
export const MARKS = {
  you: { glyph: "@", cls: "mk-player", label: "you" },
  fire: { glyph: "F", cls: "mk-fire", label: "fire" },
  // Lowercase of the same letter: the same fire, banked rather than fed.
  coals: { glyph: "f", cls: "mk-coals", label: "coals" },
  shelter: { glyph: "H", cls: "mk-shelter", label: "shelter" },
  camp: { glyph: "x", cls: "mk-camp", label: "camp" },
  trap: { glyph: "T", cls: "mk-trap", label: "trap" },
  seep: { glyph: "s", cls: "mk-seep", label: "seep" },
  den: { glyph: "D", cls: "mk-den", label: "known bear den" },
} as const satisfies Record<string, Mark>;

/**
 * A stream is ground the world always had, not something the survivor built or
 * found, so it stays out of MARKS (layout.test.ts holds that table to built-or-found
 * marks only). It still needs a mark rather than a form - it can run across any
 * terrain, not just its own band of one - so it is drawn and keyed the same way,
 * just from its own table of one.
 */
const STREAM: Mark = { glyph: STREAM_MARK, cls: "mk-stream", label: "stream" };

const ANIMAL_GLYPH: Record<AgentSpecies, string> = { deer: "d", reindeer: "r", elk: "E", wolf: "w", wolverine: "v", bear: "B" };

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
      return `<span>${forms} ${terrainHeading(t)}${v ? `: ${v.reads}` : ""}</span>`;
    })
    .join("");
  const markSpan = (m: Mark) => `<span><b class="${m.cls}">${m.glyph}</b> ${m.label}</span>`;
  // The stream is not in MARKS - it is ground, not a built or found feature - but the
  // legend still owes it a line, put beside the seep's since both read as water underfoot.
  const marks = Object.values(MARKS)
    .flatMap((m) => (m === MARKS.seep ? [markSpan(m), markSpan(STREAM)] : [markSpan(m)]))
    .join("");
  const animals = `<span><b class="mk-animal">d r E w v B</b> large wildlife</span>`;
  return (
    `${terrain}<span><b class="ice-thin">~</b> thin ice</span><span><b class="ice-safe">~</b> safe ice</span>${marks}${animals}` +
    `<span class="tone-key">brighter ground stands higher; paler water is shallower</span>` +
    `<span class="pl-key">underlined: something lies there</span>` +
    `<span class="walk-key"><svg viewBox="0 0 24 6"><polyline class="walk-ahead" points="1,3 23,3"/></svg> your walk, solid ahead, dashed behind</span>` +
    `<span class="memory-key">muted: remembered, faint: inherited</span>` +
    `<span class="fog-key">dark: never been there</span>`
  );
}

/**
 * One rung of the zoom ladder: how much ground a glyph stands for, how many
 * glyphs are drawn, and how big each is on screen.
 */
export interface ZoomLevel {
  /** Cells per glyph. */
  cells: number;
  /** Cosmetic ground samples drawn across and down inside one simulation cell. */
  detail: number;
  /** Glyphs across and down. */
  w: number;
  h: number;
  /** The glyph box and its type, in pixels; the stylesheet reads all three off the grid. */
  px: number;
  line: number;
  font: number;
}

/** The board every level from the cell outwards is drawn on: 72 by 36 small glyphs. */
const BOARD = { detail: 1, w: 72, h: 36, px: 11, line: 14, font: 12 };
/** The farthest rung: the world at one glyph per block, in the world's own shape. */
const FAR_CELLS = Math.ceil(WORLD_H / BOARD.h);
const FAR = { cells: FAR_CELLS, detail: 1, w: Math.ceil(WORLD_W / FAR_CELLS), h: BOARD.h, px: BOARD.px, line: BOARD.line, font: BOARD.font };

/**
 * The ladder, closest first. The two closest rungs hold the 300 m simulation
 * cell but draw a cosmetic field inside it, 3 by 3 and then 6 by 6, so they
 * reveal smaller terrain forms without changing movement or resources. The
 * map keeps the same box on screen throughout and shows less ground the closer
 * it goes. The last rung is the smallest that fits the whole world.
 */
export const LEVELS: ZoomLevel[] = [
  { cells: 1, detail: 6, w: 12, h: 6, px: 66, line: 84, font: 10 },
  { cells: 1, detail: 3, w: 24, h: 12, px: 33, line: 42, font: 10 },
  { cells: 1, ...BOARD },
  { cells: 3, ...BOARD },
  { cells: 9, ...BOARD },
  // The whole world, and no more than the world. Its cells-per-glyph is set
  // by the taller side, and the board is then only as wide as the world
  // needs - a fixed 72 columns at that scale drew the world in the middle of
  // a wide band of void, which reads as a border round the map rather than
  // as the edge of the land.
  FAR,
];

/** Where a fresh screen opens: one cell per glyph on the whole board, as it always did. */
export const DEFAULT_ZOOM = 2;

/** The level at this rung, clamped, so a stale zoom index can never draw nothing. */
export function levelAt(zoom: number): ZoomLevel {
  return LEVELS[Math.max(0, Math.min(LEVELS.length - 1, zoom))];
}

/**
 * The cell under a point inside the map grid, or null when the point is
 * off it. `x` and `y` are offsets within the grid itself.
 *
 * Read from where the pointer is rather than from a glyph's own enter and
 * leave: a glyph replaced under the pointer fires an enter, and a glyph
 * detached under it never fires a leave, so hover state kept per element
 * gets stuck holding a cell that is no longer there. Nothing is stored on
 * a glyph here, so nothing can go stale - and the board draws thousands of
 * them, which is a lot of attributes to write for a fact the pointer
 * already knows.
 */
export function cellFromPoint(world: World, state: GameState, ui: UiState, x: number, y: number): number | null {
  const l = levelAt(ui.zoom);
  const col = Math.floor(x / l.px);
  const row = Math.floor(y / l.line);
  if (col < 0 || row < 0 || col >= l.w || row >= l.h) return null;
  const { x0, y0 } = viewOrigin(state, world, ui.zoom);
  const cx = x0 + col * l.cells;
  const cy = y0 + row * l.cells;
  // The view can hang over the world's edge, and void is not a cell.
  if (cx < 0 || cy < 0 || cx >= world.w || cy >= world.h) return null;
  return cellIdx(world, cx, cy);
}

/** Converts a screen position through the grid's real, possibly centered, origin. */
export function cellFromClient(
  world: World,
  state: GameState,
  ui: UiState,
  clientX: number,
  clientY: number,
  grid: Pick<DOMRect, "left" | "top">,
): number | null {
  return cellFromPoint(world, state, ui, clientX - grid.left, clientY - grid.top);
}

/** The scroll viewport clips a centered grid on small panels and short windows. */
export function mapViewportBounds(
  grid: Pick<DOMRect, "left" | "top" | "right" | "bottom">,
  viewport: Pick<DOMRect, "left" | "top" | "right" | "bottom">,
): UiState["mapViewport"] {
  const left = Math.max(grid.left, viewport.left) - grid.left;
  const top = Math.max(grid.top, viewport.top) - grid.top;
  const right = Math.min(grid.right, viewport.right) - grid.left;
  const bottom = Math.min(grid.bottom, viewport.bottom) - grid.top;
  return right > left && bottom > top ? { left, top, right, bottom } : null;
}

/** Cells per glyph at each zoom level. */
export const ZOOMS = LEVELS.map((l) => l.cells);
/** Priority when a block's ground is tied: what the eye should see first. */
const TIE_ORDER: Terrain[] = ["water", "river", "fell", "rock", "spruce", "pine", "birch", "bog", "meadow"];

export function zoomLabel(zoom: number): string {
  const l = levelAt(zoom);
  const km = l.cells * 0.3 / l.detail;
  const unit = l.detail > 1 ? "detail" : "glyph";
  return km < 1 ? `${Math.round(km * 1000)} m per ${unit}` : `${km.toFixed(1)} km per ${unit}`;
}

const DETAIL_FORMS: Record<Terrain, string[]> = {
  water: ["~", "-", "~", "~"],
  fell: ["^", "^", "n", "."],
  rock: ["n", "n", "o", "."],
  bog: ["\"", ":", ",", "."],
  spruce: ["A", "A", "A", "'"],
  pine: ["T", "T", "T", "."],
  birch: ["Y", "Y", "Y", "'"],
  meadow: [".", ",", "'", "."],
  river: ["=", "=", "~", "="],
};

/** A small integer hash for visual texture only. It never enters simulation state. */
function detailHash(seed: number, x: number, y: number, n: number): number {
  let h = (seed ^ Math.imul(x + 0x51ed, 0x9e3779b1) ^ Math.imul(y + 0x713d, 0x85ebca6b) ^ Math.imul(n + 1, 0xc2b2ae35)) >>> 0;
  h ^= h >>> 16;
  h = Math.imul(h, 0x7feb352d);
  h ^= h >>> 15;
  return h >>> 0;
}

/** Presentation-only fog motion. Density and location still come exclusively from the atmosphere sample. */
export function fogGlyphHtml(seed: number, x: number, y: number): string {
  const shapes = [".", ":", "~", "="];
  const phase = detailHash(seed, x, y, 97) % 12000;
  const order = detailHash(seed, x, y, 101) % shapes.length;
  return shapes.map((_, i) => {
    const shape = shapes[(i + order) % shapes.length];
    return `<span class="weather-ripple fog-ripple fog-ripple-${i}" style="--fog-phase:-${phase + i * 3000}ms">${shape}</span>`;
  }).join("");
}

/** Presentation-only cloud motion for players who prefer clouds drawn instead of cast as shadows. */
export function cloudGlyphHtml(seed: number, x: number, y: number): string {
  const shapes = ["o", "O", "0", "~"];
  const phase = detailHash(seed, x, y, 109) % 16000;
  const order = detailHash(seed, x, y, 113) % shapes.length;
  return shapes.map((_, i) => {
    const shape = shapes[(i + order) % shapes.length];
    return `<span class="weather-ripple cloud-ripple cloud-ripple-${i}" style="--cloud-phase:-${phase + i * 4000}ms">${shape}</span>`;
  }).join("");
}

/** Falling weather uses the same single-state-at-a-time animation as fog and clouds. */
export function precipitationGlyphHtml(seed: number, x: number, y: number, kind: "rain" | "snow"): string {
  const shapes = kind === "rain" ? ["/", "'", "|", "/"] : ["*", ".", "+", "*"];
  const period = kind === "rain" ? 6000 : 10000;
  const phase = detailHash(seed, x, y, kind === "rain" ? 127 : 131) % period;
  const order = detailHash(seed, x, y, kind === "rain" ? 137 : 139) % shapes.length;
  return shapes.map((_, i) => {
    const shape = shapes[(i + order) % shapes.length];
    return `<span class="weather-ripple precip-ripple precip-${kind}-${i}" style="--weather-phase:-${phase + i * period / 4}ms">${shape}</span>`;
  }).join("");
}

/** A deterministic field of cosmetic details inside one 300 m simulation cell. */
export function visualGround(seed: number, x: number, y: number, terrain: Terrain, base: string, detail: number): string[] {
  const forms = DETAIL_FORMS[terrain];
  return Array.from({ length: detail * detail }, (_, i) => {
    if (terrain === "water" && base === "-") return detailHash(seed, x, y, i) % 4 === 0 ? "~" : "-";
    const pick = detailHash(seed, x, y, i) % forms.length;
    return pick === 0 ? base : forms[pick];
  });
}

function visualSlotStyle(slot: number, detail: number): string {
  return `--sx:${slot % detail};--sy:${Math.floor(slot / detail)}`;
}

/** The survivor's continuous simulation position projected into the visual field. */
export function playerVisualSlot(state: GameState, detail: number): number {
  const x = Math.min(detail - 1, Math.max(0, Math.floor((state.player.x - Math.floor(state.player.x)) * detail)));
  const y = Math.min(detail - 1, Math.max(0, Math.floor((state.player.y - Math.floor(state.player.y)) * detail)));
  return y * detail + x;
}

function glyphHtml(glyph: string): string {
  return glyph === "\"" ? "&quot;" : glyph;
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
export function blockInfo(state: GameState, world: World, x0: number, y0: number, z: number): Block {
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
  // Cartographic exaggeration, not hydrology: a river one cell wide would
  // lose to its wider neighbours in the sample and vanish from the coarse
  // rungs. Any known river cell in the block promotes the glyph to river,
  // unless the block is already majority water (a lake or the sea), which
  // reads as water regardless of a river cell inside it.
  if (best !== "water" && (counts.get("river") ?? 0) > 0) best = "river";
  const seen: 0 | 1 | 2 = knownAny / n <= BLOCK_MAJORITY ? 0 : knownBright / knownAny > BLOCK_MAJORITY ? 2 : 1;
  return { terrain: best, region: regionPeek(world, x0 + (z >> 1), y0 + (z >> 1)), seen };
}

export interface LightSource { cell: number; reach: number }

/**
 * Where light is on the map tonight: every visited camp's lit fire, two
 * rings when it is well fed, one when low; banked coals reach only their
 * own cell, since a nightly ember bed is not the glow that finds wood by.
 */
export function lightSources(state: GameState, world: World): LightSource[] {
  const out: LightSource[] = [];
  for (const { st, cell } of visitedCamps(state)) {
    if (st.fire.lit) out.push({ cell, reach: fuelTotal(st.fire) >= FIRE_LOW_KG ? 2 : 1 });
    else if (hasEmbers(st.fire)) out.push({ cell, reach: 0 });
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

/**
 * Every cell in a region worth a mark: the camp itself, even bare, plus
 * every site a camp has since moved away from and left standing.
 */
function markedCells(st: RegionState): number[] {
  const cells = new Set<number>(Object.keys(st.sites).map(Number));
  if (st.campCell !== null) cells.add(st.campCell);
  return [...cells].sort((a, b) => a - b);
}

interface ViewshedCache {
  state: GameState;
  world: World;
  key: string;
  cells: Set<number>;
  projections: Map<string, string>;
}

let viewshedCache: ViewshedCache | null = null;

/** One authoritative visibility result per displayed game minute, shared by the key and markup. */
function currentViewshed(state: GameState, world: World, cal: Calendar, cell: number): ViewshedCache {
  const minute = Math.floor(state.minute + state.weather.elapsedMinutes);
  const range = sightRangeCells(state, world, cal, cell);
  const key = `${cell}:${minute}:${range}`;
  if (viewshedCache?.state === state && viewshedCache.world === world && viewshedCache.key === key) return viewshedCache;
  viewshedCache = { state, world, key, cells: visibleCells(state, world, cal, cell), projections: new Map() };
  return viewshedCache;
}

function projectedViewshed(cache: ViewshedCache, x0: number, y0: number, cellsPerGlyph: number, width: number, height: number): string {
  const projectionKey = `${x0}:${y0}:${cellsPerGlyph}:${width}:${height}`;
  const cached = cache.projections.get(projectionKey);
  if (cached !== undefined) return cached;
  const glyphs = new Set<number>();
  for (const cell of cache.cells) {
    const c = cellAt(cache.world, cell);
    const gx = Math.floor((c.x - x0) / cellsPerGlyph);
    const gy = Math.floor((c.y - y0) / cellsPerGlyph);
    if (gx >= 0 && gy >= 0 && gx < width && gy < height) glyphs.add(gy * width + gx);
  }
  const signature = [...glyphs].sort((a, b) => a - b).join(".");
  cache.projections.set(projectionKey, signature);
  return signature;
}

/** Everything the map's markup depends on, so it is rebuilt only when one of them changes. */
export function mapKey(state: GameState, world: World, ui: UiState, cal: Calendar, nowMs = performance.now()): string {
  const marks = Object.entries(state.regions).map(([id, r]) => {
    const cells = markedCells(r);
    const roofs = cells.map((c) => (roofed(siteAt(r, c)) ? "H" : "-")).join("");
    return `${id}@${cells.join(".")}:${roofs}${r.fire.lit ? (fuelTotal(r.fire) >= FIRE_LOW_KG ? "F" : "f") : hasEmbers(r.fire) ? "e" : ""}${r.trap ? "T" : ""}`;
  }).join(",");
  const route = state.route ? `${state.route.target}:${state.route.path.length}` : "";
  const piles = Object.keys(state.piles).join(",");
  const carcasses = state.carcasses.map((c) => `${c.id}:${c.cell}:${c.warmAge}:${JSON.stringify(c.yields)}`).join(",");
  const dens = Object.keys(state.wildlife.knownDens).join(",");
  const { x0, y0 } = viewOrigin(state, world, ui.zoom);
  const level = levelAt(ui.zoom);
  const cell = cellOf(state, world);
  const discoveredSum = Object.values(state.discovered).reduce((a, b) => a + b, 0);
  const animals = level.cells === 1 ? visibleWildlife(state, world, cal)
    .filter((subject) => subject.active && (subject.active.cell % world.w) >= x0 && (subject.active.cell % world.w) < x0 + level.w && Math.floor(subject.active.cell / world.w) >= y0 && Math.floor(subject.active.cell / world.w) < y0 + level.h)
    .map((s) => {
      const point = level.detail > 1 ? metricPointForWildlife(state, world, s) : null;
      return `${s.id}:${s.active?.cell}:${wildlifeMembers(s)}:${state.wildlife.recognized[s.id] ? s.name ?? "" : ""}:${s.active?.intent}:${point ? `${point.xM.toFixed(2)}:${point.yM.toFixed(2)}` : ""}`;
    }).join(",") : "";
  const playerDetail = level.detail > 1 ? playerVisualSlot(state, level.detail) : "";
  const weatherMinute = Math.floor((state.minute + state.weather.elapsedMinutes) / 10);
  const weatherCells = [
    cell,
    cellIdx(world, Math.max(0, Math.min(world.w - 1, x0)), Math.max(0, Math.min(world.h - 1, y0))),
    cellIdx(world, Math.max(0, Math.min(world.w - 1, x0 + level.w * level.cells - 1)), Math.max(0, Math.min(world.h - 1, y0 + level.h * level.cells - 1))),
  ];
  const localWeather = weatherCells.map((weatherCell, i) => {
    const local = i === 0 ? conditionsAt(state, world, cal, weatherCell) : null;
    const a = local ?? atmosphereAt(state, world, weatherCell);
    const ground = local?.ground ?? null;
    return `${a.cloud >= 0.15 ? 1 : 0}${a.precip === "rain" ? 1 : 0}${a.precip === "snow" ? 1 : 0}${a.fog >= 0.05 ? 1 : 0}${(ground?.snowCm ?? 0) > SNOW_SHOWN_CM ? 1 : 0}${(ground?.snowCm ?? 0) > DEEP_SNOW_CM ? 1 : 0}${iceMode({ iceCm: ground?.iceCm ?? 0 })}`;
  }).join(";");
  const viewRange = level.cells === 1 ? sightRangeCells(state, world, cal, cell) : "";
  const viewshed = projectedViewshed(currentViewshed(state, world, cal, cell), x0, y0, level.cells, level.w, level.h);
  const startles = activeWildlifeStartles(ui, nowMs).map((cue) => cue.key).join(",");
  const viewport = startles && ui.mapViewport ? Object.values(ui.mapViewport).join(",") : "";
  return `${ui.zoom}|${x0}|${y0}|${cell}:${playerDetail}|${ui.selected}|cs${ui.cloudShadows ? 1 : 0}|wx${weatherMinute}:${localWeather}|${cal.isNight}|${marks}|${route}|${piles}|${carcasses}|${dens}|${Object.keys(state.discovered).length}|${discoveredSum}|${knowledgeGen()}|${state.player.torch.lit ? "T" : ""}|${moodOf(state)}|${cal.season}|${viewRange}|vis${viewshed}|${animals}|${startles}|${viewport}`;
}

export function mapHtml(world: World, state: GameState, ui: UiState, cal: Calendar, nowMs = performance.now()): string {
  const cur = state.player.region;
  const sel = ui.selected;
  const l = levelAt(ui.zoom);
  const z = l.cells;
  const { x0, y0 } = viewOrigin(state, world, ui.zoom);
  const startles = activeWildlifeStartles(ui, nowMs);
  const recoilAt = new Map<number, number>();
  for (const { event, startedAtMs } of startles) {
    if (event.perception.kind === "seen") recoilAt.set(event.subjectId, startedAtMs);
  }
  // Filled by actual glyph placement below, after shared-cell collisions are
  // resolved. A future exact-position glyph supplies its center here too.
  const animalAnchors = new Map<number, { x: number; y: number }>();
  const playerCell = cellOf(state, world);
  // Current visibility has meaning only while one glyph is one mechanical
  // cell. Coarser blocks remain a map of knowledge rather than pretending a
  // majority-visible block is a precise view.
  const currentVisible = currentViewshed(state, world, cal, playerCell).cells;
  const visibleNow = z === 1 ? currentVisible : null;
  const toGlyph = (cell: number): number => {
    const c = cellAt(world, cell);
    const gx = Math.floor((c.x - x0) / z);
    const gy = Math.floor((c.y - y0) / z);
    if (gx < 0 || gy < 0 || gx >= l.w || gy >= l.h) return -1;
    return gy * l.w + gx;
  };
  const weatherVisibleGlyphs = new Set<number>();
  for (const cell of currentVisible) {
    const glyph = toGlyph(cell);
    if (glyph >= 0) weatherVisibleGlyphs.add(glyph);
  }

  const markerAt = new Map<number, Mark>();
  const visibleFireDistance = new Map<number, number>();
  const featuresAt = new Map<number, string[]>();
  const addFeature = (glyph: number, feature: string): void => {
    if (glyph < 0) return;
    const features = featuresAt.get(glyph) ?? [];
    if (!features.includes(feature)) features.push(feature);
    featuresAt.set(glyph, features);
  };
  for (const [idText, st] of Object.entries(state.regions)) {
    if (discovery(state, Number(idText)) !== VISITED) continue;
    for (const cell of markedCells(st)) {
      const isCamp = cell === st.campCell;
      let m: Mark;
      // Only the camp itself can carry the region's one fire; a site the camp has
      // moved away from is read by its roof alone.
      const live = visibleNow === null || visibleNow.has(cell);
      const fireDistanceKm = Math.hypot(cell % world.w - playerCell % world.w, Math.floor(cell / world.w) - Math.floor(playerCell / world.w)) * CELL_KM;
      const fireVisible = isCamp && st.fire.lit && (live || (fireDistanceKm <= CAMPFIRE_VISIBLE_KM && campfireVisible(state, world, playerCell, cell)));
      if (fireVisible) {
        visibleFireDistance.set(cell, fireDistanceKm);
        m = MARKS.fire;
      }
      else if (isCamp && live && hasEmbers(st.fire)) m = MARKS.coals;
      else m = roofed(siteAt(st, cell)) ? MARKS.shelter : MARKS.camp;
      const g = toGlyph(cell);
      if (g >= 0) {
        markerAt.set(g, m);
        addFeature(g, m.label);
      }
    }
  }
  for (const r of Object.values(state.regions)) {
    if (!r.trap) continue;
    const g = toGlyph(r.trap.cell);
    addFeature(g, "trap");
    if (g >= 0 && !markerAt.has(g)) markerAt.set(g, MARKS.trap);
  }
  for (const k of Object.keys(state.seeps)) {
    const g = toGlyph(Number(k));
    addFeature(g, "seep");
    if (g >= 0 && !markerAt.has(g)) markerAt.set(g, MARKS.seep);
  }
  for (const k of Object.keys(state.wildlife.knownDens)) {
    const g = toGlyph(Number(k));
    addFeature(g, "known bear den");
    if (g >= 0 && !markerAt.has(g)) markerAt.set(g, MARKS.den);
  }
  const playerGlyph = toGlyph(playerCell);
  addFeature(playerGlyph, "you");
  markerAt.set(playerGlyph, MARKS.you);
  const animalAt = new Map<number, WildlifeSubject[]>();
  if (z === 1) {
    for (const subject of visibleWildlife(state, world, cal)) {
      const g = subject.active ? toGlyph(subject.active.cell) : -1;
      if (g >= 0) {
        animalAt.set(g, [...(animalAt.get(g) ?? []), subject]);
        const recognized = state.wildlife.recognized[subject.id];
        const count = wildlifeMembers(subject);
        const identity = recognized && subject.name ? subject.name : (subject.species === "wolf" ? "wolf pack" : subject.species);
        addFeature(g, `${identity}${count > 1 ? `, ${count}` : ""}, ${subject.active?.intent ?? "moving"}`);
      }
    }
  }
  const lyingGlyphs = new Set<number>();
  for (const k of Object.keys(state.piles)) {
    const g = toGlyph(Number(k));
    if (g >= 0) {
      lyingGlyphs.add(g);
      addFeature(g, "supplies");
    }
  }
  for (const carcass of state.carcasses) {
    const g = toGlyph(carcass.cell);
    if (g >= 0) {
      lyingGlyphs.add(g);
      addFeature(g, `${carcass.species} carcass`);
    }
  }
  const sources = lightSources(state, world).filter((source) => {
    const distanceKm = Math.hypot(source.cell % world.w - playerCell % world.w, Math.floor(source.cell / world.w) - Math.floor(playerCell / world.w)) * CELL_KM;
    const observable = visibleNow === null || visibleNow.has(source.cell) || visibleFireDistance.has(source.cell);
    return observable && distanceKm <= CAMPFIRE_LOCAL_LIGHT_KM;
  });
  const rings = cal.isNight ? litRings(sources, toGlyph, z, l) : new Map<number, number>();

  // Region, ground and discovery per glyph, then borders between glyphs.
  const regions = new Int32Array(l.w * l.h);
  const terrains: Terrain[] = new Array(l.w * l.h);
  const seenAt = new Uint8Array(l.w * l.h);
  interface GlyphWeather { air: AtmosphereSample; ground: LocalGroundWeather | null }
  const weatherAt: Array<GlyphWeather | null> = new Array(l.w * l.h).fill(null);
  const groundByRegion = new Map<number, LocalGroundWeather>();
  const localGround = (region: number): LocalGroundWeather => {
    const cached = groundByRegion.get(region);
    if (cached) return cached;
    const ground = groundAt(state, world, region);
    groundByRegion.set(region, ground);
    return ground;
  };
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
      // Live weather is observable only on known ground inside the actual
      // viewshed. Remembered and unknown cells retain ground memory without
      // becoming an omniscient weather radar at any zoom.
      if (b.seen > 0 && weatherVisibleGlyphs.has(i)) {
        const sampleX = Math.min(world.w - 1, cx + Math.floor(z / 2));
        const sampleY = Math.min(world.h - 1, cy + Math.floor(z / 2));
        const sampleCell = cellIdx(world, sampleX, sampleY);
        const ground = localGround(b.region);
        const conditions = conditionsWithGround(state, world, sampleCell, ground);
        weatherAt[i] = { air: conditions, ground };
      }
    }
  }
  const drawBorders = z <= 3;

  /**
   * The regions whose outline is drawn through the fog: the one stood in and
   * the ones touching it. The shape of the country you are in and what adjoins
   * it is worth knowing before you have walked it - it is what tells you there
   * is somewhere to go - while outlining every region on screen would draw a
   * map of ground nobody has any business knowing the shape of yet.
   *
   * Adjacency is read off the view rather than the world: two regions are
   * neighbours here if their cells touch somewhere on screen, which is the
   * only adjacency that can be drawn anyway.
   */
  /**
   * Which side of a boundary draws it. Both sides used to, in their own two
   * colours, and the shared line came out alternating between them - a solid
   * edge read as a dashed one. The region stood in owns its whole outline and
   * a neighbour draws every edge except the one they share.
   */
  const ownsEdge = (mine: number, theirs: number): boolean => theirs !== mine && (mine === cur || theirs !== cur);

  const near = new Set<number>([cur]);
  if (drawBorders) {
    for (let i = 0; i < l.w * l.h; i++) {
      if (regions[i] !== cur) continue;
      const gx = i % l.w;
      for (const j of [gx > 0 ? i - 1 : -1, gx < l.w - 1 ? i + 1 : -1, i - l.w, i + l.w]) {
        if (j >= 0 && j < l.w * l.h && regions[j] >= 0) near.add(regions[j]);
      }
    }
  }

  /*
   * The shading normalises to what is on screen, so every figure must be read
   * before any one cell's step can be decided. Three scales, not one: trees
   * against trees, open land against open land, sea against sea. A single
   * scale over all of them would have a screen of highland forest and coastal
   * meadow put every tree in one bucket and every field in another, and each
   * family would lose the relief within itself, which is the whole point.
   */
  const step = z === 1 ? new Float32Array(l.w * l.h) : null;
  let treeCuts: ToneCuts | null = null;
  let landCuts: ToneCuts | null = null;
  let seaCuts: ToneCuts | null = null;
  if (step) {
    const trees: number[] = [];
    const land: number[] = [];
    const sea: number[] = [];
    for (let gy = 0; gy < l.h; gy++) {
      for (let gx = 0; gx < l.w; gx++) {
        const i = gy * l.w + gx;
        if (regions[i] < 0 || !seenAt[i]) continue;
        const cx = x0 + gx * z;
        const cy = y0 + gy * z;
        const t = terrains[i];
        if (t === "water") {
          // Lakes have no offshore; they keep the plain water colour.
          const off = offshoreAt(world, cx, cy);
          if (off === null) continue;
          step[i] = off;
          sea.push(off);
        } else {
          const e = elevationAt(world, cx, cy);
          step[i] = e;
          (TREES.includes(t) ? trees : land).push(e);
        }
      }
    }
    treeCuts = toneCuts(trees);
    landCuts = toneCuts(land);
    seaCuts = toneCuts(sea);
  }

  // The tools sit in the map's bottom left corner (drawn after the grid, placed
  // by the stylesheet), so they cost the panel no height of their own; the span
  // the two buttons stand over is the label's title rather than a line of text.
  // The three closest rungs all read one simulation cell at a time. The two
  // detailed rungs name their visual grain; the span says how much real ground
  // is on screen. "centred on you" is the title and not the corner.
  const span = `${(l.w * z * CELL_KM).toFixed(0)} by ${(l.h * z * CELL_KM).toFixed(0)} km`;
  const tools = `<div class="maptools"><button class="mini" data-act="zoom" data-dir="in" ${ui.zoom === 0 ? "disabled" : ""} title="Closer (plus key)">+</button><button class="mini" data-act="zoom" data-dir="out" ${ui.zoom === LEVELS.length - 1 ? "disabled" : ""} title="Farther (minus key)">-</button><span class="dim" title="${esc(`${span} on screen, centred on you`)}">${zoomLabel(ui.zoom)}, ${span}</span></div>`;

  const parts: string[] = [];
  // The hour's light is written into the grid as it is built, in the figures
  // updateSky writes each frame. A grid built without them would be born at
  // the stylesheet's daylight defaults, and the first frame after would
  // animate it down to the true light through the half-second transitions on
  // the shade, the tint and the saturation: a fade over the whole map every
  // time it is rebuilt, which is every zoom, every step into a new view.
  const playerGround = localGround(state.player.region);
  const playerConditions = conditionsWithGround(state, world, playerCell, playerGround);
  const light = lighting(cal, playerConditions, playerConditions.temperatureC);
  const lit = `--bright:${light.brightness.toFixed(3)};--sat:${light.saturation.toFixed(3)};--tint:${light.tint};--tint-a:${light.alpha.toFixed(3)}`;
  parts.push(`<div class="scroll-x${cal.isNight ? " night" : ""}" style="--px:${l.px}px;--line:${l.line}px;${lit}"><div class="grid season-${cal.season}${l.detail > 1 ? " detailed" : ""} ${ui.cloudShadows ? "cloud-shadows" : "cloud-glyphs"}${cal.isNight ? " night" : ""}" role="grid" tabindex="0" aria-label="Map. Use arrow keys to inspect cells." style="--cols:${l.w};--detail:${l.detail};--px:${l.px}px;--line:${l.line}px;--font:${l.font}px">`);
  for (let i = 0; i < l.w * l.h; i++) {
    const gx = i % l.w;
    const gy = Math.floor(i / l.w);
    const mechanicalCell = cellIdx(world, x0 + gx * z, y0 + gy * z);
    const reg = regions[i];
    const seen = reg >= 0 ? seenAt[i] : 0;
    const named = reg >= 0 && discovery(state, reg) > 0;
    const cls = ["c"];
    let glyph = " ";
    let detailGlyphs: string[] | null = null;
    const styles: string[] = [];
    let animalId: number | null = null;
    let animalRecoil: number | null = null;
    let terrainLabel = "unknown ground";
    const sampledWeather = weatherAt[i];
    const weather = sampledWeather?.air ?? null;
    const weatherGround = sampledWeather?.ground ?? null;
    if (weather) {
      const fall = Math.min(1, weather.precipMmPerHour / 7.5);
      cls.push("wx-local");
      if (weather.cloud >= 0.15) cls.push("wx-cloud");
      if (weather.fog >= 0.05) cls.push("wx-fog");
      if (weather.precipMmPerHour >= 0.05 && weather.precip === "rain") cls.push("wx-rain");
      if (weather.precipMmPerHour >= 0.05 && weather.precip === "snow") cls.push("wx-snowing");
      styles.push(`--wx-cloud:${weather.cloud.toFixed(3)}`, `--wx-shadow:${(weather.cloud * 0.14).toFixed(3)}`, `--wx-fog:${weather.fog.toFixed(3)}`, `--wx-fall:${fall.toFixed(3)}`);
    }
    if (reg < 0) {
      cls.push("void");
    } else if (seen === 0) {
      cls.push("fog");
      // The outline still shows through: where the country you are in ends and
      // what adjoins it, on ground nobody has walked. The class says which of
      // the three the edge belongs to and the stylesheet picks its colour, so a
      // fog cell never takes the wash a drawn cell of the same region takes.
      if (drawBorders && near.has(reg)) {
        if (gx > 0 && ownsEdge(reg, regions[i - 1])) cls.push("bl");
        if (gx < l.w - 1 && ownsEdge(reg, regions[i + 1])) cls.push("br");
        if (gy > 0 && ownsEdge(reg, regions[i - l.w])) cls.push("bt");
        if (gy < l.h - 1 && ownsEdge(reg, regions[i + l.w])) cls.push("bb");
        cls.push(reg === cur ? "edge-cur" : discovery(state, reg) === VISITED ? "edge-known" : "edge-unknown");
      }
    } else {
      const t = terrains[i];
      cls.push(`t-${t}`);
      const lightRing = rings.get(i);
      const firelit = lightRing !== undefined && hasLineOfSight(world, playerCell, mechanicalCell, 0.5);
      const surfaceCurrent = weatherVisibleGlyphs.has(i);
      const current = surfaceCurrent || visibleFireDistance.has(mechanicalCell) || firelit;
      if (seen === 1 && !current) cls.push("dim");
      if (seen === 2 && !current) cls.push("memory");
      if (drawBorders) {
        if (gx > 0 && ownsEdge(reg, regions[i - 1])) cls.push("bl");
        if (gx < l.w - 1 && ownsEdge(reg, regions[i + 1])) cls.push("br");
        if (gy > 0 && ownsEdge(reg, regions[i - l.w])) cls.push("bt");
        if (gy < l.h - 1 && ownsEdge(reg, regions[i + l.w])) cls.push("bb");
      }
      if (reg === cur) cls.push("cur");
      if (sel !== null && reg === sel) cls.push("sel");
      glyph = GLYPH[t];
      terrainLabel = terrainHeading(t);
      // A coarser glyph is a block of mixed ground with no single field to report.
      if (z === 1) {
        const presentation = cellPresentation(
          state,
          world,
          mechanicalCell,
          presentationKnowledge(state, mechanicalCell, surfaceCurrent),
          weatherGround ? () => weatherGround : undefined,
        );
        glyph = presentation.glyph;
        terrainLabel = presentation.heading;
        for (const presentationClass of presentation.classes) {
          if (presentationClass !== `t-${t}` && presentationClass !== "memory" && presentationClass !== "dim" && !cls.includes(presentationClass)) cls.push(presentationClass);
        }
        const detailBase = glyph;
        // Which ground has gone over. The season decides whether it shows.
        if (turnedGround(world, x0 + gx * z, y0 + gy * z, t)) cls.push("turned");
        if (step) {
          if (t === "water") {
            // Shallow water first: the shore is the lit end of the scale and the
            // open sea the dark one, which is the way water reads from a beach.
            const d = toneOf(step[i], seaCuts);
            if (d !== 1) cls.push(`deep-${2 - d}`);
          } else {
            const tone = toneOf(step[i], TREES.includes(t) ? treeCuts : landCuts);
            if (tone !== 1) cls.push(`tone-${tone}`);
          }
        }
        if (l.detail > 1) detailGlyphs = visualGround(world.seed, x0 + gx, y0 + gy, t, detailBase, l.detail);
        // A stream is drainage that has not yet earned its own terrain; it is worth
        // marking, but only at the two close rungs where there is a detail field to
        // mark it in. At the wider rungs the terrain's own glyph fills the cell and
        // a stream mark there would cover ground the player has not actually seen.
        if (l.detail > 1 && t !== "water" && t !== "river" && !markerAt.has(i) && streamAt(world, mechanicalCell)) {
          markerAt.set(i, STREAM);
          addFeature(i, STREAM.label);
        }
      }
      if (lyingGlyphs.has(i) && seen === 2) cls.push("pl");
      const ring = current ? lightRing : undefined;
      if (ring !== undefined) {
        cls.push(`lit-${ring}`);
        styles.push(`--fd:${flickerDelay(i)}`);
      }
    }
    const m = markerAt.get(i);
    if (m) {
      if (!detailGlyphs) {
        cls.push("mk", m.cls);
        if (m.cls === "mk-fire" && (visibleFireDistance.get(mechanicalCell) ?? 0) > CAMPFIRE_LOCAL_LIGHT_KM) cls.push("fire-far");
        // The mood rides as a class and not as a data attribute: the morph keys an
        // element by its data attributes, so a mood written there would make every
        // change of task replace the glyph's node instead of retitling it.
        if (m.cls === "mk-player") cls.push(`mood-${moodOf(state)}`);
        glyph = m.glyph;
      } else if (m === MARKS.you || m === MARKS.camp || m === MARKS.fire || m === MARKS.coals) {
        // Snow's brightness filter creates a stacking context on the cell.
        // Lift the containing context along with its essential detail marker.
        cls.push("has-map-signal");
      }
    } else if (!detailGlyphs) {
      const animal = animalAt.get(i)?.[0];
      if (animal) {
        animalId = animal.id;
        const recognized = state.wildlife.recognized[animal.id];
        cls.push("mk", "mk-animal", recognized ? `wildlife-${animal.colour}` : "wildlife-unknown");
        glyph = ANIMAL_GLYPH[animal.species];
        animalAnchors.set(animal.id, { x: (gx + 0.5) * l.px, y: (gy + 0.5) * l.line });
        const recoil = recoilAt.get(animal.id);
        if (recoil !== undefined) {
          animalRecoil = recoil;
        }
      }
    }
    // Named regions stay selectable so their ground can be inspected even when it
    // has not been walked. Survey targets themselves live in Do > Explore.
    //
    // The index rides with it, and has to. keyOf names an element by its
    // data attributes, so every cell of one region would otherwise carry the
    // same name - and morphChildren, which registers one node per name and
    // moves it to where the name is next wanted, would haul a glyph across
    // the board on every redraw and shift everything after it. That is the
    // flicker on the @ and the camp's x: they are the cells whose names
    // differ enough to be found and moved.
    const act = named ? ` data-act="select" data-i="${i}" data-r="${reg}"` : "";
    const terrain = reg < 0 ? "beyond the mapped world" : seen === 0 ? "unknown ground" : `${terrainLabel}${z > 1 ? `, ${z * CELL_M} m block` : ""}`;
    const place = reg >= 0 && named ? world.regions.get(reg)?.name : undefined;
    const info = [terrain, place, ...featuresAt.get(i) ?? []].filter(Boolean).join("; ");
    const cx = x0 + gx * z;
    const cy = y0 + gy * z;
    const mapCell = cx >= 0 && cy >= 0 && cx < world.w && cy < world.h ? ` data-map-cell="${cellIdx(world, cx, cy)}"` : "";
    // No title attribute: the board's own box says all of this, at once and
    // in the page's own voice, where the browser's tooltip said it after a
    // delay and stood over whatever it was next to.
    let content = glyphHtml(glyph);
    if (!detailGlyphs && cls.includes("mk")) {
      const wildlifeClass = animalRecoil === null ? "" : " wildlife-recoil";
      const wildlifeData = animalId === null ? "" : ` data-wildlife-id="${animalId}"`;
      const wildlifeStyle = animalRecoil === null ? "" : ` style="--wildlife-start:${animalRecoil}ms"`;
      content = `<b class="cell-signal${wildlifeClass}"${wildlifeData}${wildlifeStyle}>${content}</b>`;
    } else if (!detailGlyphs) {
      content = `<span class="cell-ground"><span class="terrain-visual">${content}</span></span>`;
    }
    if (detailGlyphs) {
      const overlays: string[] = [];
      const used = new Set<number>();
      if (m) {
        const mid = Math.floor(l.detail / 2);
        const slot = m === MARKS.you ? playerVisualSlot(state, l.detail)
          : m === MARKS.trap ? (l.detail - 1) * l.detail
            : m === MARKS.seep || m === STREAM ? (l.detail - 1) * l.detail + mid
              : m === MARKS.den ? l.detail - 1
                : mid * l.detail + mid;
        used.add(slot);
        const mood = m.cls === "mk-player" ? ` mood-${moodOf(state)}` : "";
        overlays.push(`<b class="micro-mark cell-signal ${m.cls}${mood}" data-visual-slot="${slot}" style="${visualSlotStyle(slot, l.detail)}">${glyphHtml(m.glyph)}</b>`);
      }
      const ground = detailGlyphs.map((g) => `<i class="micro-ground">${glyphHtml(g)}</i>`).join("");
      content = `<span class="cell-ground" aria-hidden="true"><span class="detail-ground terrain-visual">${ground}</span></span>${overlays.join("")}`;
    }
    if (weather && (weather.cloud >= 0.15 || weather.fog >= 0.05 || weather.rainMmPerHour >= 0.05 || weather.snowCmPerHour >= 0.05)) {
      let weatherGlyphs = weather.fog >= 0.05 ? fogGlyphHtml(world.seed, cx, cy) : "";
      if (!weatherGlyphs && weather.precipMmPerHour >= 0.05 && weather.precip !== "none") {
        weatherGlyphs = precipitationGlyphHtml(world.seed, cx, cy, weather.precip);
      }
      if (!weatherGlyphs && !ui.cloudShadows && weather.cloud >= 0.15) {
        weatherGlyphs = cloudGlyphHtml(world.seed, cx, cy);
      }
      if (weatherGlyphs) cls.push("wx-glyph");
      if (ui.cloudShadows && weather.cloud >= 0.15) content += `<i class="cloud-shadow" aria-hidden="true"></i>`;
      if (weatherGlyphs) content += `<i class="cell-weather" aria-hidden="true">${weatherGlyphs}</i>`;
    }
    const style = styles.length ? ` style="${styles.join(";")}"` : "";
    parts.push(`<span class="${cls.join(" ")}" role="gridcell" tabindex="-1" aria-label="${esc(info)}" data-map-x="${gx}" data-map-y="${gy}" data-map-info="${esc(info)}"${mapCell}${act}${style}>${content}</span>`);
  }
  const animalMarkup: string[] = [];
  if (l.detail > 1) {
    for (const animal of visibleWildlife(state, world, cal)) {
      const point = metricPointForWildlife(state, world, animal);
      if (!point) continue;
      const x = (point.xM / CELL_M - x0) * l.px;
      const y = (point.yM / CELL_M - y0) * l.line;
      if (x < 0 || y < 0 || x > l.w * l.px || y > l.h * l.line) continue;
      animalAnchors.set(animal.id, { x, y });
      const recognized = state.wildlife.recognized[animal.id];
      const recoil = recoilAt.get(animal.id);
      const motionClass = recoil === undefined ? "" : " wildlife-recoil";
      const motionStyle = recoil === undefined ? "" : `;--wildlife-start:${recoil}ms`;
      animalMarkup.push(`<b class="micro-mark wildlife-map-mark mk-animal ${recognized ? `wildlife-${animal.colour}` : "wildlife-unknown"}${motionClass}" data-wildlife-id="${animal.id}" style="--animal-x:${Number(x.toFixed(2))}px;--animal-y:${Number(y.toFixed(2))}px${motionStyle}">${ANIMAL_GLYPH[animal.species]}</b>`);
    }
  }
  const viewport = ui.mapViewport ?? { left: 0, top: 0, right: l.w * l.px, bottom: l.h * l.line };
  // Reserve room for the whole mark, including its pop and rise.
  const insetX = Math.min(24, (viewport.right - viewport.left) / 2);
  const insetY = Math.min(24, (viewport.bottom - viewport.top) / 2);
  const startleMarkup = startles.map(({ event, startedAtMs, key }) => {
    const gx = (event.source.xM / CELL_M - x0) / z;
    const gy = (event.source.yM / CELL_M - y0) / z;
    // Seen reactions follow the subject's rendered glyph, which may already
    // have escaped its original cell. Hearing never consults hidden wildlife.
    const animal = event.perception.kind === "seen" ? animalAnchors.get(event.subjectId) : undefined;
    const anchor = animal ?? {
      x: (l.detail > 1 ? gx : Math.floor(gx) + 0.5) * l.px,
      y: (l.detail > 1 ? gy : Math.floor(gy) + 0.5) * l.line,
    };
    let jitterX = 0;
    let jitterY = 0;
    if (event.perception.kind === "heard") {
      let hash = 0;
      for (const char of event.id) hash = (Math.imul(hash, 31) + char.charCodeAt(0)) >>> 0;
      const angle = (hash % 360) * Math.PI / 180;
      const radius = Math.min(30, Math.max(0, event.uncertaintyM)) / (CELL_M * z);
      jitterX = Math.cos(angle) * radius * l.px;
      jitterY = Math.sin(angle) * radius * l.line;
    }
    // The cue sits above one rendered glyph, not above its 300 m parent.
    // Its font height and the micro-glyph height stay constant across zooms.
    const px = anchor.x + jitterX;
    const py = anchor.y - l.line / l.detail / 2 - Math.max(18, l.font) + jitterY;
    const x = Math.max(viewport.left + insetX, Math.min(viewport.right - insetX, px));
    const y = Math.max(viewport.top + insetY, Math.min(viewport.bottom - insetY, py));
    const bearing = ["east", "southeast", "south", "southwest", "west", "northwest", "north", "northeast"];
    const direction = bearing[(Math.round(event.bearingRad / (Math.PI / 4)) % 8 + 8) % 8];
    const edge = px !== x || py !== y ? ` edge bearing-${direction}` : "";
    // All cues share the grid's transient layer, clear of cell clipping and
    // snow filters. Their anonymous identity and start time survive movement.
    return `<i aria-hidden="true" class="wildlife-startle ${event.perception.kind}${edge}" data-startle="${key}" style="--wildlife-start:${startedAtMs}ms;left:${Number(x.toFixed(2))}px;top:${Number(y.toFixed(2))}px">!</i>`;
  });
  parts.push(`${walkSvg(world, state, playerCell, x0, y0, z, l)}${animalMarkup.join("")}${startleMarkup.join("")}</div><i class="shade"></i></div>${tools}`);
  return parts.join("");
}
