/**
 * The map is a viewport of glyphs centred on the player, its size and its
 * ground per glyph set by the zoom level (LEVELS below). At the three
 * closest a glyph is one cell, drawn larger each rung; beyond them a glyph
 * is a block of cells drawn as its commonest ground. Regions never visited
 * are fog; regions only seen from next door are dim. The player never pans;
 * the world moves under them.
 */
import type { Calendar } from "../sim/calendar";
import { fuelTotal, hasEmbers, roofed } from "../sim/fire";
import { FIRE_LOW_KG } from "../sim/items";
import { knowledgeGen } from "../sim/mapped";
import { cellOf } from "../sim/position";
import { visitedCamps } from "../sim/light";
import { discovery, siteAt, VISITED } from "../sim/regionstate";
import type { AgentSpecies, GameState, RegionState, Terrain, WildlifeSubject } from "../sim/types";
import { ambientTemperature, DEEP_SNOW_CM, iceMode } from "../sim/weather";
import { cellAt, cellIdx, regionPeek, terrainPeek, type World } from "../world/gen";
import { WORLD_H, WORLD_W } from "../world/terrain";
import { CELL_KM } from "../units";
import { activeWildlifeStartles, esc, type UiState } from "./render";
import { elevationAt, groundGlyph, offshoreAt, toneCuts, toneOf, TREES, turnedGround, VARIANTS, type ToneCuts } from "./ground";
import { moodOf } from "./mood";
import { lighting } from "./sky";
import { visibleWildlife, wildlifeMembers } from "../sim/wildlife-agents";

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
 *
 * Every one of them is something that is there because the survivor built it
 * or found it. The named places - forest, outcrop, shore, heath - were marked
 * here once and are not any more: a mark on them is not clickable, the HERE
 * panel already lists every place in the region with its distance and a walk
 * button, and an order resolves its own cell and walks there without the
 * player ever locating it. Marking ground the world always had put four
 * tinted tiles around the camp for no act they enabled.
 */
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
} as const satisfies Record<string, { glyph: string; cls: string; label: string }>;

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
      return `<span>${forms} ${TERRAIN_NAME[t]}${v ? `: ${v.reads}` : ""}</span>`;
    })
    .join("");
  const marks = Object.values(MARKS)
    .map((m) => `<span><b class="${m.cls}">${m.glyph}</b> ${m.label}</span>`)
    .join("");
  const animals = `<span><b class="mk-animal">d r E w v B</b> large wildlife</span>`;
  return (
    `${terrain}<span><b>=</b> ice</span>${marks}${animals}` +
    `<span class="tone-key">brighter ground stands higher; paler water is shallower</span>` +
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
/** The farthest rung: the world at one glyph per block, in the world's own shape. */
const FAR_CELLS = Math.ceil(WORLD_H / BOARD.h);
const FAR = { cells: FAR_CELLS, w: Math.ceil(WORLD_W / FAR_CELLS), h: BOARD.h, px: BOARD.px, line: BOARD.line, font: BOARD.font };

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

/** Everything the map's markup depends on, so it is rebuilt only when one of them changes. */
export function mapKey(state: GameState, world: World, ui: UiState, cal: Calendar, nowMs = performance.now()): string {
  const marks = Object.entries(state.regions).map(([id, r]) => {
    const cells = markedCells(r);
    const roofs = cells.map((c) => (roofed(siteAt(r, c)) ? "H" : "-")).join("");
    return `${id}@${cells.join(".")}:${roofs}${r.fire.lit ? (fuelTotal(r.fire) >= FIRE_LOW_KG ? "F" : "f") : hasEmbers(r.fire) ? "e" : ""}${r.trap ? "T" : ""}`;
  }).join(",");
  const route = state.route ? `${state.route.target}:${state.route.path.length}` : "";
  const piles = Object.keys(state.piles).join(",");
  const dens = Object.keys(state.wildlife.knownDens).join(",");
  const { x0, y0 } = viewOrigin(state, world, ui.zoom);
  const level = levelAt(ui.zoom);
  const cell = cellOf(state, world);
  const discoveredSum = Object.values(state.discovered).reduce((a, b) => a + b, 0);
  const animals = level.cells === 1 ? visibleWildlife(state, world, cal)
    .filter((subject) => subject.active && (subject.active.cell % world.w) >= x0 && (subject.active.cell % world.w) < x0 + level.w && Math.floor(subject.active.cell / world.w) >= y0 && Math.floor(subject.active.cell / world.w) < y0 + level.h)
    .map((s) => `${s.id}:${s.active?.cell}:${wildlifeMembers(s)}:${state.wildlife.recognized[s.id] ? s.name ?? "" : ""}:${s.active?.intent}`).join(",") : "";
  const startles = activeWildlifeStartles(ui, nowMs).map((cue) => cue.key).join(",");
  const viewport = startles && ui.mapViewport ? Object.values(ui.mapViewport).join(",") : "";
  return `${ui.zoom}|${x0}|${y0}|${cell}|${ui.selected}|${state.weather.snowCm > SNOW_SHOWN_CM}|${state.weather.snowCm > DEEP_SNOW_CM}|${iceMode(state.weather)}|${cal.isNight}|${marks}|${route}|${piles}|${dens}|${Object.keys(state.discovered).length}|${discoveredSum}|${knowledgeGen()}|${state.player.torch.lit ? "T" : ""}|${moodOf(state)}|${cal.season}|${animals}|${startles}|${viewport}`;
}

export function mapHtml(world: World, state: GameState, ui: UiState, cal: Calendar, nowMs = performance.now()): string {
  const cur = state.player.region;
  const sel = ui.selected;
  const snow = state.weather.snowCm > SNOW_SHOWN_CM;
  // Deep enough to bury what it lies on, at the depth this game already uses
  // for snow that halves a walk and doubles the burn.
  const deepSnow = state.weather.snowCm > DEEP_SNOW_CM;
  const l = levelAt(ui.zoom);
  const z = l.cells;
  const { x0, y0 } = viewOrigin(state, world, ui.zoom);
  const startles = activeWildlifeStartles(ui, nowMs);
  const startleAt = new Map<number, string[]>();
  const edgeStartles: string[] = [];
  const recoilAt = new Map<number, number>();
  const viewport = ui.mapViewport ?? { left: 0, top: 0, right: l.w * l.px, bottom: l.h * l.line };
  // Keep the whole exclamation mark and its pop/rise inside the clipped area.
  const insetX = Math.min(24, (viewport.right - viewport.left) / 2);
  const insetY = Math.min(24, (viewport.bottom - viewport.top) / 2);
  for (const cue of startles) {
    const { event, startedAtMs, key } = cue;
    const gx = Math.floor((event.source.xM / (CELL_KM * 1000) - x0) / z);
    const gy = Math.floor((event.source.yM / (CELL_KM * 1000) - y0) / z);
    const px = (gx + 0.5) * l.px;
    const py = (gy + 0.5) * l.line;
    const x = Math.max(viewport.left + insetX, Math.min(viewport.right - insetX, px));
    const y = Math.max(viewport.top + insetY, Math.min(viewport.bottom - insetY, py));
    const offscreen = px !== x || py !== y;
    const i = gy * l.w + gx;
    const bearing = ["east", "southeast", "south", "southwest", "west", "northwest", "north", "northeast"];
    const direction = bearing[(Math.round(event.bearingRad / (Math.PI / 4)) % 8 + 8) % 8];
    // The presentation key is local and anonymous. Event IDs contain subject IDs
    // and must never enter hidden-cue markup, including its data attributes.
    const edge = offscreen ? ` edge bearing-${direction}` : "";
    let jitter = "";
    if (event.perception.kind === "heard" && !offscreen) {
      let hash = 0;
      for (const char of event.id) hash = (Math.imul(hash, 31) + char.charCodeAt(0)) >>> 0;
      const angle = (hash % 360) * Math.PI / 180;
      const radius = Math.min(30, Math.max(0, event.uncertaintyM)) / (CELL_KM * 1000 * z);
      jitter = `;--startle-x:${(Math.cos(angle) * radius * l.px).toFixed(2)}px;--startle-y:${(Math.sin(angle) * radius * l.line).toFixed(2)}px`;
    }
    const position = offscreen ? `;left:${x}px;top:${y}px` : jitter;
    const markup = `<i aria-hidden="true" class="wildlife-startle ${event.perception.kind}${edge}" data-startle="${key}" style="--wildlife-start:${startedAtMs}ms${position}">!</i>`;
    if (offscreen) edgeStartles.push(markup);
    else startleAt.set(i, [...startleAt.get(i) ?? [], markup]);
    if (event.perception.kind === "seen") recoilAt.set(event.subjectId, startedAtMs);
  }
  const playerCell = cellOf(state, world);
  const toGlyph = (cell: number): number => {
    const c = cellAt(world, cell);
    const gx = Math.floor((c.x - x0) / z);
    const gy = Math.floor((c.y - y0) / z);
    if (gx < 0 || gy < 0 || gx >= l.w || gy >= l.h) return -1;
    return gy * l.w + gx;
  };

  const markerAt = new Map<number, (typeof MARKS)[keyof typeof MARKS]>();
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
      let m: (typeof MARKS)[keyof typeof MARKS];
      // Only the camp itself can carry the region's one fire; a site the camp has
      // moved away from is read by its roof alone.
      if (isCamp && st.fire.lit) m = MARKS.fire;
      else if (isCamp && hasEmbers(st.fire)) m = MARKS.coals;
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
  const animalAt = new Map<number, WildlifeSubject>();
  if (z === 1) {
    for (const subject of visibleWildlife(state, world, cal)) {
      const g = subject.active ? toGlyph(subject.active.cell) : -1;
      if (g >= 0) {
        if (!animalAt.has(g)) animalAt.set(g, subject);
        const recognized = state.wildlife.recognized[subject.id];
        const count = wildlifeMembers(subject);
        const identity = recognized && subject.name ? subject.name : (subject.species === "wolf" ? "wolf pack" : subject.species);
        addFeature(g, `${identity}${count > 1 ? `, ${count}` : ""}, ${subject.active?.intent ?? "moving"}`);
      }
    }
  }
  const pileGlyphs = new Set<number>();
  for (const k of Object.keys(state.piles)) {
    const g = toGlyph(Number(k));
    if (g >= 0) {
      pileGlyphs.add(g);
      addFeature(g, "supplies");
    }
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
          const off = offshoreAt(world.seed, cx, cy);
          if (off === null) continue;
          step[i] = off;
          sea.push(off);
        } else {
          const e = elevationAt(world.seed, cx, cy);
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
  parts.push(`<div class="scroll-x${cal.isNight ? " night" : ""}${falling}" style="--px:${l.px}px;--line:${l.line}px;${lit}"><div class="grid season-${cal.season}${snow ? " snow" : ""}${deepSnow ? " snow-deep" : ""}${cal.isNight ? " night" : ""}" role="grid" tabindex="0" aria-label="Map. Use arrow keys to inspect cells." style="--cols:${l.w};--px:${l.px}px;--line:${l.line}px;--font:${l.font}px">`);
  for (let i = 0; i < l.w * l.h; i++) {
    const gx = i % l.w;
    const gy = Math.floor(i / l.w);
    const reg = regions[i];
    const seen = reg >= 0 ? seenAt[i] : 0;
    const named = reg >= 0 && discovery(state, reg) > 0;
    const cls = ["c"];
    let glyph = " ";
    let style = "";
    let animalId: number | null = null;
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
      if (seen === 1) cls.push("dim");
      if (drawBorders) {
        if (gx > 0 && ownsEdge(reg, regions[i - 1])) cls.push("bl");
        if (gx < l.w - 1 && ownsEdge(reg, regions[i + 1])) cls.push("br");
        if (gy > 0 && ownsEdge(reg, regions[i - l.w])) cls.push("bt");
        if (gy < l.h - 1 && ownsEdge(reg, regions[i + l.w])) cls.push("bb");
      }
      if (reg === cur) cls.push("cur");
      if (sel !== null && reg === sel) cls.push("sel");
      glyph = GLYPH[t];
      // A coarser glyph is a block of mixed ground with no single field to report.
      if (z === 1) {
        glyph = groundGlyph(world.seed, x0 + gx * z, y0 + gy * z, t, glyph);
        // Which ground has gone over. The season decides whether it shows.
        if (turnedGround(world.seed, x0 + gx * z, y0 + gy * z, t)) cls.push("turned");
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
      }
      if (t === "water" && iceMode(state.weather) !== "none") {
        glyph = "=";
        cls.push(iceMode(state.weather) === "safe" ? "ice-safe" : "ice-thin");
      }
      if (snow && t === "meadow") glyph = "*";
      if (pileGlyphs.has(i) && seen === 2) cls.push("pl");
      const ring = rings.get(i);
      if (ring !== undefined) {
        cls.push(`lit-${ring}`);
        style = ` style="--fd:${flickerDelay(i)}"`;
      }
    }
    const m = markerAt.get(i);
    if (m) {
      cls.push("mk", m.cls);
      // The mood rides as a class and not as a data attribute: the morph keys an
      // element by its data attributes, so a mood written there would make every
      // change of task replace the glyph's node instead of retitling it.
      if (m.cls === "mk-player") cls.push(`mood-${moodOf(state)}`);
      glyph = m.glyph;
    } else {
      const animal = animalAt.get(i);
      if (animal) {
        animalId = animal.id;
        const recognized = state.wildlife.recognized[animal.id];
        cls.push("mk", "mk-animal", recognized ? `wildlife-${animal.colour}` : "wildlife-unknown");
        glyph = ANIMAL_GLYPH[animal.species];
        const recoil = recoilAt.get(animal.id);
        if (recoil !== undefined) {
          cls.push("wildlife-recoil");
          style = style ? style.replace(/"$/, `;--wildlife-start:${recoil}ms"`) : ` style="--wildlife-start:${recoil}ms"`;
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
    const terrain = reg < 0 ? "beyond the mapped world" : seen === 0 ? "unknown ground" : `${TERRAIN_NAME[terrains[i]]}${z > 1 ? `, ${z * 300} m block` : ""}`;
    const place = reg >= 0 && named ? world.regions.get(reg)?.name : undefined;
    const info = [terrain, place, ...featuresAt.get(i) ?? []].filter(Boolean).join("; ");
    const wildlife = animalId === null ? "" : ` data-wildlife-id="${animalId}"`;
    const cx = x0 + gx * z;
    const cy = y0 + gy * z;
    const mapCell = cx >= 0 && cy >= 0 && cx < world.w && cy < world.h ? ` data-map-cell="${cellIdx(world, cx, cy)}"` : "";
    // No title attribute: the board's own box says all of this, at once and
    // in the page's own voice, where the browser's tooltip said it after a
    // delay and stood over whatever it was next to.
    const startle = startleAt.get(i)?.join("") ?? "";
    if (startle) cls.push("has-wildlife-startle");
    parts.push(`<span class="${cls.join(" ")}" role="gridcell" tabindex="-1" aria-label="${esc(info)}" data-map-x="${gx}" data-map-y="${gy}" data-map-info="${esc(info)}"${mapCell}${act}${wildlife}${style}>${glyph === "\"" ? "&quot;" : glyph}${startle}</span>`);
  }
  parts.push(`${walkSvg(world, state, playerCell, x0, y0, z, l)}${edgeStartles.join("")}</div><i class="shade"></i></div>${tools}`);
  return parts.join("");
}
