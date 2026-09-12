/**
 * The map is a viewport of glyphs centred on the player, its size and its
 * ground per glyph set by the zoom level (LEVELS below). Every glyph stands
 * for a square block of real 50 m patches: one at the closest rung, and 2, 6,
 * 18 or 54 a side beyond it. Nothing on the board is invented to fill a
 * glyph - an aggregate's letter, its relief and its surface all come from the
 * patches it covers, so what is drawn is what a click resolves to.
 *
 * Patches never known are fog, and fog costs no terrain: an aggregate that
 * reads as unknown is never summarised, which is what keeps a wide rung from
 * generating the world to draw a screen of it. Ground known this life but
 * outside the current viewshed is muted; ground only the journal has is
 * fainter still. The player never pans; the world moves under them.
 */
import type { Calendar } from "../sim/calendar";
import { fuelTotal, hasEmbers, roofed } from "../sim/fire";
import { FIRE_LOW_KG } from "../sim/items";
import { knowledgeAt } from "../sim/fineknowledge";
import { isKnown, knowledgeGen } from "../sim/mapped";
import { cellOf } from "../sim/position";
import { visitedCamps } from "../sim/light";
import { discovery, siteAt, VISITED } from "../sim/regionstate";
import type { AgentSpecies, AtmosphereSample, GameState, LocalGroundWeather, RegionState, Terrain, WildlifeSubject } from "../sim/types";
import { atmosphereAt, conditionsAt, conditionsWithGround, DEEP_SNOW_CM, groundAt, iceMode } from "../sim/weather";
import { cellIdx, fineHeightAt, fineHeightPeek, neighbours, regionPeek, streamAt, terrainPeek, waterKindOf, type World } from "../world/gen";
import { WORLD_H, WORLD_W } from "../world/terrain";
import { emptyTerrainCounts, parentSummary } from "../world/aggregate";
import { FINE_PER_PARENT, PATCH_KM, PATCH_M, type PatchId } from "../world/spatial";
import { passable, type RouteConditions } from "../world/route";
import { routeConditions, survivorRoute, survivorRouteCandidates } from "../sim/routing";
import { activeWildlifeStartles, esc, type UiState } from "./render";
import { elevationAt, offshoreAt, STREAM_MARK, toneCuts, toneOf, TREES, turnedGround, VARIANTS, type ToneCuts } from "./ground";
import { moodOf } from "./mood";
import { lighting } from "./sky";
import { visibleWildlife, wildlifeMembers } from "../sim/wildlife-agents";
import { metricPointForWildlife } from "../sim/wildlife-space";
import { campfireVisible, hasLineOfSight, sightRangeCells, visibleCells } from "../sim/sight";
import { SNOW_SHOWN_CM, terrainHeading } from "../sim/cellstatus";
import { aggregatePresentation, cellKnowledge as presentationKnowledge, cellPresentation, TERRAIN_GLYPH } from "./cellpresentation";

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
 * The widest glyph an animal is still drawn on. A herd stands in one 50 m
 * patch, so past a glyph a few hundred metres across its mark would claim a
 * block of ground it is nowhere near the whole of.
 */
const ANIMAL_GLYPH_PATCHES = 6;

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
  /** Real 50 m patches per glyph, across and down. One is the patch itself. */
  finePerGlyph: number;
  /** Glyphs across and down. */
  w: number;
  h: number;
  /** The glyph box and its type, in pixels; the stylesheet reads all three off the grid. */
  px: number;
  line: number;
  font: number;
}

/** The board every rung is drawn on: 72 by 36 small glyphs. */
const BOARD = { w: 72, h: 36, px: 11, line: 14, font: 12 };
/** The farthest rung: the world at one glyph per block, in the world's own shape. */
const FAR_FINE = Math.ceil(WORLD_H / BOARD.h);
const FAR: ZoomLevel = { finePerGlyph: FAR_FINE, w: Math.ceil(WORLD_W / FAR_FINE), h: BOARD.h, px: BOARD.px, line: BOARD.line, font: BOARD.font };

/**
 * The ladder, closest first, in patches per glyph: 50 m, 100 m, 300 m, 900 m
 * and 2.7 km, then the whole world. The board keeps its size on screen
 * throughout and shows less ground the closer it goes; every rung but the
 * last is a square block of the same authoritative patches, so the closest
 * rung is not a magnified default but the ground the simulation runs on.
 */
export const LEVELS: ZoomLevel[] = [
  { finePerGlyph: 1, ...BOARD },
  { finePerGlyph: 2, ...BOARD },
  { finePerGlyph: 6, ...BOARD },
  { finePerGlyph: 18, ...BOARD },
  { finePerGlyph: 54, ...BOARD },
  // The whole world, and no more than the world. Its patches-per-glyph is set
  // by the taller side, and the board is then only as wide as the world
  // needs - a fixed 72 columns at that scale drew the world in the middle of
  // a wide band of void, which reads as a border round the map rather than
  // as the edge of the land.
  FAR,
];

/** Where a fresh screen opens: 300 m per glyph on the whole board, as it always did. */
export const DEFAULT_ZOOM = 2;

/** The level at this rung, clamped, so a stale zoom index can never draw nothing. */
export function levelAt(zoom: number): ZoomLevel {
  return LEVELS[Math.max(0, Math.min(LEVELS.length - 1, zoom))];
}

/** The block of real patches one glyph stands for. */
export interface MapAggregate {
  /** Top-left patch of the block, in patch coordinates. */
  x0: number;
  y0: number;
  /** Patches a side. One means the glyph is the patch. */
  size: number;
}

/** Something exact standing on one patch, named the way the legend and the tooltip name it. */
export interface MapFeature {
  patch: PatchId;
  label: string;
  /** The mark the map draws for it, where it draws one. */
  mark: (typeof MARKS)[keyof typeof MARKS] | null;
}

/**
 * What a click on the board means: the block of ground under the pointer,
 * the exact patch that block resolves to, and everything exact that stands
 * inside it. The patch is what an order is given for; the feature list is
 * what the tooltip reads out, so a glyph holding a trap and a seep says both
 * instead of silently picking one.
 */
export interface MapTarget {
  aggregate: MapAggregate;
  patch: PatchId | null;
  features: MapFeature[];
}

/**
 * How a block's ordinary ground is resolved to one patch.
 *
 * "geometric" is the pointer's answer: the nearest known passable patch,
 * with no route asked for. A pointer crossing the board resolves a block per
 * move, and routing there would put the map's budget through the floor.
 * "routed" is the click's answer, and the only one an order is given from.
 */
export type TargetResolution = "geometric" | "routed";

/**
 * The glyph column and row under a point inside the map grid, or null when
 * the point is off the board.
 *
 * Read from where the pointer is rather than from a glyph's own enter and
 * leave: a glyph replaced under the pointer fires an enter, and a glyph
 * detached under it never fires a leave, so hover state kept per element
 * gets stuck holding ground that is no longer there. Nothing is stored on
 * a glyph here, so nothing can go stale - and the board draws thousands of
 * them, which is a lot of attributes to write for a fact the pointer
 * already knows.
 */
function glyphAtPoint(l: ZoomLevel, x: number, y: number): { col: number; row: number } | null {
  const col = Math.floor(x / l.px);
  const row = Math.floor(y / l.line);
  if (col < 0 || row < 0 || col >= l.w || row >= l.h) return null;
  return { col, row };
}

/** Every exact feature standing inside a block, in the order the map ranks their marks. */
function featuresIn(state: GameState, world: World, cal: Calendar | null, box: MapAggregate): MapFeature[] {
  const out: MapFeature[] = [];
  const x1 = Math.min(world.w, box.x0 + box.size);
  const y1 = Math.min(world.h, box.y0 + box.size);
  const inside = (patch: PatchId): boolean => {
    const x = patch % world.w;
    const y = Math.floor(patch / world.w);
    return x >= box.x0 && x < x1 && y >= box.y0 && y < y1;
  };
  const add = (patch: PatchId, label: string, mark: MapFeature["mark"] = null): void => {
    if (inside(patch)) out.push({ patch, label, mark });
  };
  for (const [idText, st] of Object.entries(state.regions)) {
    if (discovery(state, Number(idText)) !== VISITED) continue;
    for (const cell of markedCells(st)) {
      const isCamp = cell === st.campCell;
      const mark = isCamp && st.fire.lit ? MARKS.fire
        : isCamp && hasEmbers(st.fire) ? MARKS.coals
          : roofed(siteAt(st, cell)) ? MARKS.shelter : MARKS.camp;
      add(cell, mark.label, mark);
    }
    if (st.trap) add(st.trap.cell, "trap", MARKS.trap);
  }
  for (const k of Object.keys(state.seeps)) add(Number(k), "seep", MARKS.seep);
  for (const k of Object.keys(state.wildlife.knownDens)) add(Number(k), "known bear den", MARKS.den);
  add(cellOf(state, world), "you", MARKS.you);
  if (cal) {
    for (const subject of visibleWildlife(state, world, cal)) {
      if (!subject.active) continue;
      const recognized = state.wildlife.recognized[subject.id];
      const count = wildlifeMembers(subject);
      const identity = recognized && subject.name ? subject.name : subject.species === "wolf" ? "wolf pack" : subject.species;
      add(subject.active.cell, `${identity}${count > 1 ? `, ${count}` : ""}, ${subject.active.intent ?? "moving"}`);
    }
  }
  for (const k of Object.keys(state.piles)) add(Number(k), "supplies");
  for (const carcass of state.carcasses) add(carcass.cell, `${carcass.species} carcass`);
  return out;
}

/** Squared distance in patches from a patch to the middle of its block, for ranking candidates. */
function distanceToMiddle(world: World, box: MapAggregate, patch: PatchId): number {
  const midX = box.x0 + (box.size - 1) / 2;
  const midY = box.y0 + (box.size - 1) / 2;
  const dx = (patch % world.w) - midX;
  const dy = Math.floor(patch / world.w) - midY;
  return dx * dx + dy * dy;
}

/**
 * The exact patch a click on a block means: an exact mark standing in it
 * wins, and ordinary ground resolves to the patch nearest the middle that
 * the survivor can actually walk to. Where nothing in the block routes - a
 * block across water, or one the known ground does not reach - the nearest
 * known passable patch is still the answer, so the tooltip can say why the
 * walk is refused instead of the click doing nothing at all.
 */
/**
 * The block's own patches that could carry a destination: known ground the
 * survivor could stand on, nearest the middle first.
 *
 * Ice decides what water is, so passability is asked of the same conditions
 * the walk will be planned under rather than of bare terrain. Unknown ground
 * is skipped before its terrain is ever asked for, which is what keeps a
 * wide rung from generating the world to answer a click.
 */
function knownCandidates(state: GameState, world: World, box: MapAggregate, conditions: RouteConditions): PatchId[] {
  const x1 = Math.min(world.w, box.x0 + box.size);
  const y1 = Math.min(world.h, box.y0 + box.size);
  const candidates: PatchId[] = [];
  for (let y = Math.max(0, box.y0); y < y1; y++) {
    for (let x = Math.max(0, box.x0); x < x1; x++) {
      const patch = cellIdx(world, x, y);
      if (!isKnown(state, patch)) continue;
      if (!passable(terrainPeek(world, x, y), conditions.iceAt(patch))) continue;
      if (conditions.blockedAt?.(patch)) continue;
      candidates.push(patch);
    }
  }
  return candidates.sort((a, b) => distanceToMiddle(world, box, a) - distanceToMiddle(world, box, b) || a - b);
}

/**
 * The patch a block of nothing but fog means: the one nearest the middle
 * that stands on the frontier, with known ground next to it.
 *
 * A click on fog is how the survivor walks into the dark, and frontierRoute
 * is what carries them. Without this the whole gesture existed at 50 m and
 * nowhere else, because every block wider than a patch resolved to nothing
 * and the click fell through.
 */
function frontierCandidate(state: GameState, world: World, box: MapAggregate): PatchId | null {
  const x1 = Math.min(world.w, box.x0 + box.size);
  const y1 = Math.min(world.h, box.y0 + box.size);
  let best: PatchId | null = null;
  for (let y = Math.max(0, box.y0); y < y1; y++) {
    for (let x = Math.max(0, box.x0); x < x1; x++) {
      const patch = cellIdx(world, x, y);
      if (isKnown(state, patch)) continue;
      if (!neighbours(world, patch).some((cell) => isKnown(state, cell))) continue;
      if (best === null || distanceToMiddle(world, box, patch) < distanceToMiddle(world, box, best)) best = patch;
    }
  }
  return best;
}

/**
 * The exact patch a click on a block means: an exact mark standing in it
 * wins, and ordinary ground resolves to the patch nearest the middle the
 * survivor can actually walk to.
 *
 * Reachability is asked of the sim's own door, so it means what the walk
 * will mean: known ground only, under the ice and the fears the survivor is
 * actually walking under. knownRouteCandidates rejects the unreachable in
 * bulk through parent connectivity, so the exact route is asked for once in
 * the ordinary case rather than once per patch of the block.
 *
 * Where nothing in the block routes, the nearest known passable patch is
 * still the answer, so the tooltip can say why the walk is refused instead
 * of the click doing nothing at all. Where the block is all fog, the answer
 * is its frontier, which is a walk into the dark and not a refusal.
 */
function resolveTarget(
  state: GameState, world: World, box: MapAggregate, features: MapFeature[], resolution: TargetResolution,
): PatchId | null {
  const marks = features.filter((f) => f.mark);
  if (marks.length) {
    return marks.reduce((best, f) => (distanceToMiddle(world, box, f.patch) < distanceToMiddle(world, box, best.patch) ? f : best)).patch;
  }
  const candidates = knownCandidates(state, world, box, routeConditions(state, world));
  if (!candidates.length) return frontierCandidate(state, world, box);
  if (resolution === "geometric") return candidates[0];
  const from = cellOf(state, world);
  if (candidates.includes(from)) return from;
  for (const patch of survivorRouteCandidates(state, world, from, candidates)
    .sort((a, b) => distanceToMiddle(world, box, a) - distanceToMiddle(world, box, b) || a - b)) {
    if (survivorRoute(state, world, from, patch)) return patch;
  }
  return candidates[0];
}

/**
 * The block under a point inside the map grid and the exact patch it
 * resolves to, or null when the point is off the board or over void. `x`
 * and `y` are offsets within the grid itself. The calendar is optional
 * because a hover resolves ground, and only the tooltip's feature list
 * needs to know which wildlife is on show.
 */
export function mapAggregateAtPoint(world: World, state: GameState, ui: UiState, x: number, y: number): MapAggregate | null {
  const l = levelAt(ui.zoom);
  const at = glyphAtPoint(l, x, y);
  if (!at) return null;
  const { x0, y0 } = viewOrigin(state, world, ui.zoom);
  const box: MapAggregate = { x0: x0 + at.col * l.finePerGlyph, y0: y0 + at.row * l.finePerGlyph, size: l.finePerGlyph };
  // The view can hang over the world's edge, and void is not ground.
  if (box.x0 + box.size <= 0 || box.y0 + box.size <= 0 || box.x0 >= world.w || box.y0 >= world.h) return null;
  return box;
}

export function mapTargetAtPoint(
  world: World, state: GameState, ui: UiState, x: number, y: number,
  cal: Calendar | null = null, resolution: TargetResolution = "routed",
): MapTarget | null {
  const box = mapAggregateAtPoint(world, state, ui, x, y);
  if (!box) return null;
  const features = featuresIn(state, world, cal, box);
  if (box.size === 1) {
    const patch = box.x0 < 0 || box.y0 < 0 ? null : cellIdx(world, box.x0, box.y0);
    return { aggregate: box, patch, features };
  }
  return { aggregate: box, patch: resolveTarget(state, world, box, features, resolution), features };
}

/** Converts a screen position through the grid's real, possibly centered, origin. */
export function mapTargetAtClient(
  world: World,
  state: GameState,
  ui: UiState,
  clientX: number,
  clientY: number,
  grid: Pick<DOMRect, "left" | "top">,
  cal: Calendar | null = null,
  resolution: TargetResolution = "routed",
): MapTarget | null {
  return mapTargetAtPoint(world, state, ui, clientX - grid.left, clientY - grid.top, cal, resolution);
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

/** Patches per glyph at each zoom level. */
export const ZOOMS = LEVELS.map((l) => l.finePerGlyph);
/** Priority when a block's ground is tied: what the eye should see first. */
const TIE_ORDER: Terrain[] = ["water", "river", "fell", "rock", "spruce", "pine", "birch", "bog", "meadow"];

/** How much ground one glyph covers, said the way a survivor would say it. */
export function glyphScale(finePerGlyph: number): string {
  const km = finePerGlyph * PATCH_KM;
  return km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`;
}

/**
 * What a glyph's block is made of, and how high it stands - out of the
 * patches the survivor actually knows, and no others.
 *
 * Two rules, and the map path holds both. The first: never ask the world
 * generator for a patch nobody has been to. `aggregateSummary` cannot be
 * used here at all, because an unaligned box sends it down its per-patch
 * `terrainAt` path and even its aligned path builds the whole 96 by 96
 * chunk behind a parent - eighty thousand patches of untouched ground to
 * draw one screen of a wide rung. The second: a parent summary is still
 * worth having, because it is cached beside the chunk it came from and a
 * second render of the same ground then costs nothing.
 *
 * So a parent whose thirty-six patches are all known takes `parentSummary`;
 * the generation it forces is of ground the survivor has already walked or
 * seen. A parent only partly known contributes the patches that are known,
 * one `terrainPeek` each, which reads a built chunk if there is one and
 * falls back to the pure generator if there is not. A parent nobody has
 * been to contributes nothing: it is fog, and fog has no ground.
 *
 * Knowledge is two bits a patch, so deciding which of the three a parent is
 * costs thirty-six reads and no generation at all.
 */
export interface GlyphSummary {
  samples: number;
  terrainCounts: Record<Terrain, number>;
  minElevationM: number;
  maxElevationM: number;
}

function addKnownPatch(state: GameState, world: World, out: GlyphSummary, x: number, y: number): void {
  const patch = cellIdx(world, x, y);
  if (!isKnown(state, patch)) return;
  out.samples++;
  out.terrainCounts[terrainPeek(world, x, y)]++;
  // The refined height where the ground is already in hand, the parent's where
  // it is not: a wide rung reads thousands of patches and must generate none.
  const elevationM = fineHeightPeek(world, x, y);
  out.minElevationM = Math.min(out.minElevationM, elevationM);
  out.maxElevationM = Math.max(out.maxElevationM, elevationM);
}

/** Whether every one of a parent's thirty-six patches is known. Bit reads only. */
function parentFullyKnown(state: GameState, world: World, px: number, py: number): boolean {
  const x0 = px * FINE_PER_PARENT;
  const y0 = py * FINE_PER_PARENT;
  if (x0 + FINE_PER_PARENT > world.w || y0 + FINE_PER_PARENT > world.h) return false;
  for (let y = y0; y < y0 + FINE_PER_PARENT; y++) {
    for (let x = x0; x < x0 + FINE_PER_PARENT; x++) {
      if (!isKnown(state, cellIdx(world, x, y))) return false;
    }
  }
  return true;
}

export function glyphSummary(state: GameState, world: World, x0: number, y0: number, size: number): GlyphSummary {
  const bx0 = Math.max(0, x0);
  const by0 = Math.max(0, y0);
  const bx1 = Math.min(world.w, x0 + size);
  const by1 = Math.min(world.h, y0 + size);
  const out: GlyphSummary = {
    samples: 0,
    terrainCounts: emptyTerrainCounts(),
    minElevationM: Number.POSITIVE_INFINITY,
    maxElevationM: Number.NEGATIVE_INFINITY,
  };
  if (bx1 <= bx0 || by1 <= by0) return out;
  // The whole parents the block covers, and the rectangle they fill.
  const px0 = Math.ceil(bx0 / FINE_PER_PARENT);
  const py0 = Math.ceil(by0 / FINE_PER_PARENT);
  const px1 = Math.floor(bx1 / FINE_PER_PARENT);
  const py1 = Math.floor(by1 / FINE_PER_PARENT);
  const wholeX0 = px1 > px0 ? px0 * FINE_PER_PARENT : bx0;
  const wholeX1 = px1 > px0 ? px1 * FINE_PER_PARENT : bx0;
  const wholeY0 = py1 > py0 ? py0 * FINE_PER_PARENT : by0;
  const wholeY1 = py1 > py0 ? py1 * FINE_PER_PARENT : by0;
  for (let py = py0; py < py1; py++) {
    for (let px = px0; px < px1; px++) {
      if (parentFullyKnown(state, world, px, py)) {
        const parent = parentSummary(world, px, py);
        out.samples += parent.samples;
        for (const terrain of TIE_ORDER) out.terrainCounts[terrain] += parent.terrainCounts[terrain];
        out.minElevationM = Math.min(out.minElevationM, parent.minElevationM);
        out.maxElevationM = Math.max(out.maxElevationM, parent.maxElevationM);
        continue;
      }
      for (let y = py * FINE_PER_PARENT; y < (py + 1) * FINE_PER_PARENT; y++) {
        for (let x = px * FINE_PER_PARENT; x < (px + 1) * FINE_PER_PARENT; x++) addKnownPatch(state, world, out, x, y);
      }
    }
  }
  for (let y = by0; y < by1; y++) {
    const insideY = y >= wholeY0 && y < wholeY1;
    for (let x = bx0; x < bx1; x++) {
      if (insideY && x >= wholeX0 && x < wholeX1) continue;
      addKnownPatch(state, world, out, x, y);
    }
  }
  return out;
}

/**
 * What a block is made of, commonest ground first, as shares of the patches
 * it actually holds. A block that is all one thing says so in one word; a
 * mixed one names what is in it rather than letting its dominant letter
 * stand for ground it is only half of.
 */
export function terrainComposition(summary: Pick<GlyphSummary, "terrainCounts" | "samples">): string {
  const parts = TIE_ORDER
    .map((terrain) => ({ terrain, count: summary.terrainCounts[terrain] }))
    .filter((part) => part.count > 0)
    .sort((a, b) => b.count - a.count);
  if (!parts.length || !summary.samples) return "unknown ground";
  if (parts.length === 1) return `all ${terrainHeading(parts[0].terrain)}`;
  return parts.map((part) => `${terrainHeading(part.terrain)} ${Math.round((part.count / summary.samples) * 100)}%`).join(", ");
}

export function zoomLabel(zoom: number): string {
  return `${glyphScale(levelAt(zoom).finePerGlyph)} per glyph`;
}

/** A small integer hash for animation phase only. It never enters simulation state. */
function phaseHash(seed: number, x: number, y: number, n: number): number {
  let h = (seed ^ Math.imul(x + 0x51ed, 0x9e3779b1) ^ Math.imul(y + 0x713d, 0x85ebca6b) ^ Math.imul(n + 1, 0xc2b2ae35)) >>> 0;
  h ^= h >>> 16;
  h = Math.imul(h, 0x7feb352d);
  h ^= h >>> 15;
  return h >>> 0;
}

/**
 * The three ripples that light open water: a direction in radians, a
 * wavelength in drawn cells and a period in real seconds each. The
 * stylesheet's three overlay durations are these periods. Presentation only.
 */
export const WATER_RIPPLES = [
  { direction: 0.35, wavelength: 4, periodS: 5 },
  { direction: 2.27, wavelength: 2.5, periodS: 3.75 },
  { direction: 4.54, wavelength: 6, periodS: 8 },
] as const;

/**
 * A water cell's phase in each ripple, in radians within one turn: the
 * cell's position projected on the ripple's direction, divided by the zoom
 * so a coarse block keeps the same step per drawn cell, plus up to a
 * radian of seeded jitter either way so the fronts are ragged. Neighbours
 * still land near each other, which is what makes the light travel
 * instead of blink; the jitter is what keeps it from sliding as one sheet.
 */
function detailHash(seed: number, x: number, y: number, n: number): number {
  let h = (seed ^ Math.imul(x + 0x51ed, 0x9e3779b1) ^ Math.imul(y + 0x713d, 0x85ebca6b) ^ Math.imul(n + 1, 0xc2b2ae35)) >>> 0;
  h ^= h >>> 16;
  h = Math.imul(h, 0x7feb352d);
  h ^= h >>> 15;
  return h >>> 0;
}

export function waterRipplePhases(seed: number, x: number, y: number, zoom: number): [number, number, number] {
  const turn = 2 * Math.PI;
  return WATER_RIPPLES.map((ripple, i) => {
    const along = x * Math.cos(ripple.direction) + y * Math.sin(ripple.direction);
    const jitter = (detailHash(seed, x, y, 149 + 2 * i) % 1000) / 1000 * 2 - 1;
    const phase = (along / zoom / ripple.wavelength) * turn + jitter;
    return Math.round(((phase % turn) + turn) % turn * 1000) / 1000;
  }) as [number, number, number];
}

/**
 * How bright one cell's overlay for one ripple peaks, 0.25 to 0.5: with the
 * strong phase jitter, the reason the sum reads as light on water and not
 * as one texture sliding over it. Texture from the seed, like the phases.
 */
export function waterRipplePeak(seed: number, x: number, y: number, wave: number): number {
  return Math.round((0.25 + (detailHash(seed, x, y, 163 + 2 * wave) % 1000) / 1000 * 0.25) * 1000) / 1000;
}

/** The same phases as a start offset into each ripple's cycle, in seconds, for the overlays' animation delay. */
export function waterRippleDelaysS(seed: number, x: number, y: number, zoom: number): [number, number, number] {
  return waterRipplePhases(seed, x, y, zoom).map((phase, i) => {
    const delay = Math.round(phase / (2 * Math.PI) * WATER_RIPPLES[i].periodS * 1000) / 1000;
    return delay >= WATER_RIPPLES[i].periodS ? 0 : delay;
  }) as [number, number, number];
}

/** Presentation-only fog motion. Density and location still come exclusively from the atmosphere sample. */
export function fogGlyphHtml(seed: number, x: number, y: number): string {
  const shapes = [".", ":", "~", "="];
  const phase = phaseHash(seed, x, y, 97) % 12000;
  const order = phaseHash(seed, x, y, 101) % shapes.length;
  return shapes.map((_, i) => {
    const shape = shapes[(i + order) % shapes.length];
    return `<span class="weather-ripple fog-ripple fog-ripple-${i}" style="--fog-phase:-${phase + i * 3000}ms">${shape}</span>`;
  }).join("");
}

/** Presentation-only cloud motion for players who prefer clouds drawn instead of cast as shadows. */
export function cloudGlyphHtml(seed: number, x: number, y: number): string {
  const shapes = ["o", "O", "0", "~"];
  const phase = phaseHash(seed, x, y, 109) % 16000;
  const order = phaseHash(seed, x, y, 113) % shapes.length;
  return shapes.map((_, i) => {
    const shape = shapes[(i + order) % shapes.length];
    return `<span class="weather-ripple cloud-ripple cloud-ripple-${i}" style="--cloud-phase:-${phase + i * 4000}ms">${shape}</span>`;
  }).join("");
}

/** Falling weather uses the same single-state-at-a-time animation as fog and clouds. */
export function precipitationGlyphHtml(seed: number, x: number, y: number, kind: "rain" | "snow"): string {
  const shapes = kind === "rain" ? ["/", "'", "|", "/"] : ["*", ".", "+", "*"];
  const period = kind === "rain" ? 6000 : 10000;
  const phase = phaseHash(seed, x, y, kind === "rain" ? 127 : 131) % period;
  const order = phaseHash(seed, x, y, kind === "rain" ? 137 : 139) % shapes.length;
  return shapes.map((_, i) => {
    const shape = shapes[(i + order) % shapes.length];
    return `<span class="weather-ripple precip-ripple precip-${kind}-${i}" style="--weather-phase:-${phase + i * period / 4}ms">${shape}</span>`;
  }).join("");
}

function glyphHtml(glyph: string): string {
  return glyph === "\"" ? "&quot;" : glyph;
}

/** Top-left cell of the viewport, so the player sits in the middle glyph. */
export function viewOrigin(state: GameState, world: World, zoom: number): { x0: number; y0: number } {
  const l = levelAt(zoom);
  const z = l.finePerGlyph;
  const px = Math.floor(state.player.xM / PATCH_M);
  const py = Math.floor(state.player.yM / PATCH_M);
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

/**
 * How an aggregate's patches stand in the survivor's knowledge. The counts
 * say how much of the block is seen now, remembered from this life, carried
 * in from the journal and never known - and nothing about what a member
 * holds, so a block of fog discloses only its own size.
 */
export interface KnowledgeComposition {
  samples: number;
  visible: number;
  remembered: number;
  inherited: number;
  unknown: number;
}

/** What a glyph draws for the block of patches it stands over. */
export interface GlyphGround {
  terrain: Terrain;
  region: number;
  seen: 0 | 1 | 2;
  knowledge: KnowledgeComposition;
  /** The block's real terrain and relief, computed only where the block reads as known. */
  summary: GlyphSummary | null;
}

/** A patch's own knowledge: 0 unknown, 1 dim (only the journal has it), 2 known this life. */
function cellKnowledge(state: GameState, world: World, x: number, y: number): 0 | 1 | 2 {
  const level = knowledgeAt(state.knowledge, cellIdx(world, x, y));
  return level === "unknown" ? 0 : level === "inherited" ? 1 : 2;
}

/**
 * A block reads as known only once more than half its sampled patches are -
 * ties go to fog. A corridor one patch wide fills at most a couple of a
 * block's nine samples, so it stays fog at this rung and only reads as a
 * thread at the closer ones, where a glyph is one patch and cannot blur.
 */
const BLOCK_MAJORITY = 0.5;

/** The ground the eye should read first when a block's commonest terrains tie. */
export function dominantByPriority(counts: Record<Terrain, number>): Terrain {
  let best: Terrain = TIE_ORDER[0];
  let bestN = -1;
  for (const t of TIE_ORDER) {
    if (counts[t] > bestN) {
      bestN = counts[t];
      best = t;
    }
  }
  // Cartographic exaggeration, not hydrology: a channel one patch wide would
  // lose to its wider neighbours in the block and vanish from the coarse rungs.
  // Any river patch in the block promotes the glyph to river, unless the block
  // is already majority water - a lake or the sea reads as water whatever runs
  // through it.
  if (best !== "water" && counts.river > 0) return "river";
  return best;
}

/**
 * What a glyph shows for its block: its knowledge first, and its ground only
 * if that knowledge allows it.
 *
 * The order matters. Knowledge is a bit per patch and costs nothing to read;
 * terrain is generated. Asking for the terrain of a block nobody has been to
 * would fill chunks across the whole screen at the wide rungs, to draw fog.
 */
function glyphGround(state: GameState, world: World, visible: Set<number> | null, x0: number, y0: number, z: number): GlyphGround {
  const step = Math.max(1, Math.floor(z / 3));
  const knowledge: KnowledgeComposition = { samples: 0, visible: 0, remembered: 0, inherited: 0, unknown: 0 };
  let knownAny = 0;
  let knownBright = 0;
  for (let j = step >> 1; j < z; j += step) {
    for (let i = step >> 1; i < z; i += step) {
      const x = x0 + i;
      const y = y0 + j;
      if (x < 0 || y < 0 || x >= world.w || y >= world.h) continue;
      knowledge.samples++;
      const k = cellKnowledge(state, world, x, y);
      if (k === 0) {
        knowledge.unknown++;
        continue;
      }
      knownAny++;
      if (k === 2) {
        knownBright++;
        if (visible?.has(cellIdx(world, x, y))) knowledge.visible++;
        else knowledge.remembered++;
      } else knowledge.inherited++;
    }
  }
  const region = regionPeek(world, Math.min(world.w - 1, Math.max(0, x0 + (z >> 1))), Math.min(world.h - 1, Math.max(0, y0 + (z >> 1))));
  const seen: 0 | 1 | 2 = !knowledge.samples || knownAny / knowledge.samples <= BLOCK_MAJORITY ? 0
    : knownBright / knownAny > BLOCK_MAJORITY ? 2 : 1;
  if (seen === 0) return { terrain: "water", region, seen, knowledge, summary: null };
  if (z === 1) return { terrain: terrainPeek(world, x0, y0), region, seen, knowledge, summary: null };
  const summary = glyphSummary(state, world, x0, y0, z);
  return { terrain: dominantByPriority(summary.terrainCounts), region, seen, knowledge, summary };
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
 * the nearer ring. The glow is about a hundred metres across, so the rings
 * shrink as a glyph grows: two at 50 m, one at 100 m, the source alone out
 * to 300 m, and nothing past a glyph the whole glow would sit inside.
 */
export function litRings(sources: LightSource[], toGlyph: (cell: number) => number, z: number, view: { w: number; h: number }): Map<number, number> {
  const rings = new Map<number, number>();
  const reachAt = z === 1 ? 2 : z === 2 ? 1 : z <= 6 ? 0 : -1;
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
      const pt = `${Math.floor((cell % world.w - x0) / z) + 0.5},${Math.floor((Math.floor(cell / world.w) - y0) / z) + 0.5}`;
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
    const gx = Math.floor((cell % cache.world.w - x0) / cellsPerGlyph);
    const gy = Math.floor((Math.floor(cell / cache.world.w) - y0) / cellsPerGlyph);
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
  const z = level.finePerGlyph;
  const animals = z <= ANIMAL_GLYPH_PATCHES ? visibleWildlife(state, world, cal)
    .filter((subject) => subject.active && (subject.active.cell % world.w) >= x0 && (subject.active.cell % world.w) < x0 + level.w * z && Math.floor(subject.active.cell / world.w) >= y0 && Math.floor(subject.active.cell / world.w) < y0 + level.h * z)
    .map((s) => {
      const point = z === 1 ? metricPointForWildlife(state, world, s) : null;
      return `${s.id}:${s.active?.cell}:${wildlifeMembers(s)}:${state.wildlife.recognized[s.id] ? s.name ?? "" : ""}:${s.active?.intent}:${point ? `${point.xM.toFixed(2)}:${point.yM.toFixed(2)}` : ""}`;
    }).join(",") : "";
  const weatherMinute = Math.floor((state.minute + state.weather.elapsedMinutes) / 10);
  const weatherCells = [
    cell,
    cellIdx(world, Math.max(0, Math.min(world.w - 1, x0)), Math.max(0, Math.min(world.h - 1, y0))),
    cellIdx(world, Math.max(0, Math.min(world.w - 1, x0 + level.w * z - 1)), Math.max(0, Math.min(world.h - 1, y0 + level.h * z - 1))),
  ];
  const localWeather = weatherCells.map((weatherCell, i) => {
    const local = i === 0 ? conditionsAt(state, world, cal, weatherCell) : null;
    const a = local ?? atmosphereAt(state, world, weatherCell);
    const ground = local?.ground ?? null;
    return `${a.cloud >= 0.15 ? 1 : 0}${a.precip === "rain" ? 1 : 0}${a.precip === "snow" ? 1 : 0}${a.fog >= 0.05 ? 1 : 0}${(ground?.snowCm ?? 0) > SNOW_SHOWN_CM ? 1 : 0}${(ground?.snowCm ?? 0) > DEEP_SNOW_CM ? 1 : 0}${iceMode({ iceCm: ground?.iceCm ?? 0 })}`;
  }).join(";");
  const viewRange = z === 1 ? sightRangeCells(state, world, cal, cell) : "";
  const viewshed = projectedViewshed(currentViewshed(state, world, cal, cell), x0, y0, z, level.w, level.h);
  const startles = activeWildlifeStartles(ui, nowMs).map((cue) => cue.key).join(",");
  const viewport = startles && ui.mapViewport ? Object.values(ui.mapViewport).join(",") : "";
  return `${ui.zoom}|${x0}|${y0}|${cell}|${ui.selected}|${ui.destination}|cs${ui.cloudShadows ? 1 : 0}|wx${weatherMinute}:${localWeather}|${cal.isNight}|${marks}|${route}|${piles}|${carcasses}|${dens}|${Object.keys(state.discovered).length}|${discoveredSum}|${knowledgeGen()}|${state.player.torch.lit ? "T" : ""}|${moodOf(state)}|${cal.season}|${viewRange}|vis${viewshed}|${animals}|${startles}|${viewport}`;
}

export function mapHtml(world: World, state: GameState, ui: UiState, cal: Calendar, nowMs = performance.now()): string {
  const cur = state.player.region;
  const sel = ui.selected;
  const l = levelAt(ui.zoom);
  const z = l.finePerGlyph;
  const { x0, y0 } = viewOrigin(state, world, ui.zoom);
  const startles = activeWildlifeStartles(ui, nowMs);
  const recoilAt = new Map<number, number>();
  for (const { event, startedAtMs } of startles) {
    if (event.perception.kind === "seen") recoilAt.set(event.subjectId, startedAtMs);
  }
  // Filled by actual glyph placement below, after shared-patch collisions are
  // resolved. The exact-position marks supply their centre here too.
  const animalAnchors = new Map<number, { x: number; y: number }>();
  const playerCell = cellOf(state, world);
  // Current visibility has meaning only while one glyph is one patch. Coarser
  // blocks remain a map of knowledge rather than pretending a
  // majority-visible block is a precise view.
  const currentVisible = currentViewshed(state, world, cal, playerCell).cells;
  const visibleNow = z === 1 ? currentVisible : null;
  // Patch coordinates straight off the id: a marker may stand on ground no
  // chunk has been built for, and asking cellAt for it would build one.
  const toGlyph = (cell: number): number => {
    const gx = Math.floor((cell % world.w - x0) / z);
    const gy = Math.floor((Math.floor(cell / world.w) - y0) / z);
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
      const fireDistanceKm = Math.hypot(cell % world.w - playerCell % world.w, Math.floor(cell / world.w) - Math.floor(playerCell / world.w)) * PATCH_KM;
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
  // Where the last click resolved to. At the block rungs the glyph is not the
  // patch, so the board says which patch an order would actually be for.
  const destinationGlyph = ui.destination === null ? -1 : toGlyph(ui.destination);
  const playerGlyph = toGlyph(playerCell);
  addFeature(playerGlyph, "you");
  markerAt.set(playerGlyph, MARKS.you);
  // A glyph one patch across carries the herd's exact metre position instead
  // (animalMarkup below), so only the block rungs put a letter on the glyph.
  const animalAt = new Map<number, WildlifeSubject[]>();
  if (z <= ANIMAL_GLYPH_PATCHES) {
    for (const subject of visibleWildlife(state, world, cal)) {
      const g = subject.active ? toGlyph(subject.active.cell) : -1;
      if (g >= 0) {
        if (z > 1) animalAt.set(g, [...(animalAt.get(g) ?? []), subject]);
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
    const distanceKm = Math.hypot(source.cell % world.w - playerCell % world.w, Math.floor(source.cell / world.w) - Math.floor(playerCell / world.w)) * PATCH_KM;
    const observable = visibleNow === null || visibleNow.has(source.cell) || visibleFireDistance.has(source.cell);
    return observable && distanceKm <= CAMPFIRE_LOCAL_LIGHT_KM;
  });
  const rings = cal.isNight ? litRings(sources, toGlyph, z, l) : new Map<number, number>();

  // Region, ground and discovery per glyph, then borders between glyphs.
  const regions = new Int32Array(l.w * l.h);
  const terrains: Terrain[] = new Array(l.w * l.h);
  const seenAt = new Uint8Array(l.w * l.h);
  const groundAtGlyph: Array<GlyphGround | null> = new Array(l.w * l.h).fill(null);
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
      const b = glyphGround(state, world, currentVisible, cx, cy, z);
      groundAtGlyph[i] = b;
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
  // Region outlines belong to the rungs where a region is still a shape
  // rather than a smudge: out to 900 m a glyph, and no further.
  const drawBorders = z <= 18;

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
   *
   * A glyph one patch across reads its own ground; a block reads the middle
   * of the elevation its summary actually found, so relief survives every
   * rung instead of flattening the moment a glyph stops being a patch. The
   * sea's scale is the shore's own field and has no block form, so blocks
   * of water keep the plain water colour.
   */
  const step = new Float32Array(l.w * l.h);
  let treeCuts: ToneCuts | null = null;
  let landCuts: ToneCuts | null = null;
  let seaCuts: ToneCuts | null = null;
  {
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
          const off = z === 1 ? offshoreAt(world, cx, cy) : null;
          if (off === null) continue;
          step[i] = off;
          sea.push(off);
        } else {
          const summary = groundAtGlyph[i]?.summary;
          // A glyph that is one patch is toned by that patch's own height; a
          // block is toned by the middle of what its summary found.
          const e = summary ? (summary.minElevationM + summary.maxElevationM) / 2
            : z === 1 ? fineHeightAt(world, cellIdx(world, cx, cy)) : elevationAt(world, cx, cy);
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
  // The label names the ground one glyph stands for; the span says how much
  // real ground is on screen. "centred on you" is the title and not the corner.
  const kmAcross = l.w * z * PATCH_KM;
  const kmDown = l.h * z * PATCH_KM;
  const figure = (km: number): string => (kmAcross < 10 ? km.toFixed(1) : km.toFixed(0));
  const span = `${figure(kmAcross)} by ${figure(kmDown)} km`;
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
  parts.push(`<div class="scroll-x${cal.isNight ? " night" : ""}" style="--px:${l.px}px;--line:${l.line}px;${lit}"><div class="grid season-${cal.season}${z === 1 ? " fine" : ""} ${ui.cloudShadows ? "cloud-shadows" : "cloud-glyphs"}${cal.isNight ? " night" : ""}" role="grid" tabindex="0" aria-label="Map. Use arrow keys to inspect cells." style="--cols:${l.w};--px:${l.px}px;--line:${l.line}px;--font:${l.font}px">`);
  for (let i = 0; i < l.w * l.h; i++) {
    const gx = i % l.w;
    const gy = Math.floor(i / l.w);
    const mechanicalCell = cellIdx(world, x0 + gx * z, y0 + gy * z);
    const reg = regions[i];
    const seen = reg >= 0 ? seenAt[i] : 0;
    const named = reg >= 0 && discovery(state, reg) > 0;
    const cls = ["c"];
    let glyph = " ";
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
      // Firelight is its own light and cannot be read off the viewshed: the
      // viewshed is what the sky lights, and on a moonless night it is empty
      // while the ground round the fire is plainly lit. Only a glyph that
      // already carries a ring asks - at most the two glyphs round a source
      // inside a kilometre - so this is a few dozen rays, not one per glyph.
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
      if (i === destinationGlyph) cls.push("target");
      const presentation = z === 1
        ? cellPresentation(
          state,
          world,
          mechanicalCell,
          presentationKnowledge(state, mechanicalCell, surfaceCurrent),
          weatherGround ? () => weatherGround : undefined,
        )
        : aggregatePresentation(
          t,
          waterKindOf(world, mechanicalCell) === "sea" ? "sea" : "lake",
          surfaceCurrent ? "current" : seen === 2 ? "remembered" : "inherited",
          weatherGround ?? (surfaceCurrent ? localGround(reg) : null),
        );
      glyph = presentation.glyph;
      terrainLabel = presentation.heading;
      for (const presentationClass of presentation.classes) {
        if (presentationClass !== `t-${t}` && presentationClass !== "memory" && presentationClass !== "dim" && !cls.includes(presentationClass)) cls.push(presentationClass);
      }
      // Which ground has gone over. The season decides whether it shows, and
      // only a glyph that is one patch can claim it of the ground it draws.
      if (z === 1 && turnedGround(world, x0 + gx * z, y0 + gy * z, t)) cls.push("turned");
      if (t === "water") {
        // Shallow water first: the shore is the lit end of the scale and the
        // open sea the dark one, which is the way water reads from a beach.
        const d = toneOf(step[i], seaCuts);
        if (seaCuts && d !== 1) cls.push(`deep-${2 - d}`);
      } else {
        const tone = toneOf(step[i], TREES.includes(t) ? treeCuts : landCuts);
        if (tone !== 1) cls.push(`tone-${tone}`);
      // A stream is drainage that has not yet earned its own terrain; it is
      // worth marking, but only where a glyph is one patch. At the block rungs
      // the terrain's own glyph fills the glyph and a stream mark there would
      // cover ground the player has not actually seen.
      if (z === 1 && !markerAt.has(i) && streamAt(world, mechanicalCell)) {
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
      cls.push("mk", m.cls);
      if (m.cls === "mk-fire" && (visibleFireDistance.get(mechanicalCell) ?? 0) > CAMPFIRE_LOCAL_LIGHT_KM) cls.push("fire-far");
      // The mood rides as a class and not as a data attribute: the morph keys an
      // element by its data attributes, so a mood written there would make every
      // change of task replace the glyph's node instead of retitling it.
      if (m.cls === "mk-player") cls.push(`mood-${moodOf(state)}`);
      glyph = m.glyph;
    } else {
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
    const terrain = reg < 0 ? "beyond the mapped world" : seen === 0 ? "unknown ground" : `${terrainLabel}${z > 1 ? `, ${glyphScale(z)} block` : ""}`;
    const place = reg >= 0 && named ? world.regions.get(reg)?.name : undefined;
    const info = [terrain, place, ...featuresAt.get(i) ?? []].filter(Boolean).join("; ");
    const cx = x0 + gx * z;
    const cy = y0 + gy * z;
    const mapCell = cx >= 0 && cy >= 0 && cx < world.w && cy < world.h ? ` data-map-cell="${cellIdx(world, cx, cy)}"` : "";
    // No title attribute: the board's own box says all of this, at once and
    // in the page's own voice, where the browser's tooltip said it after a
    // delay and stood over whatever it was next to.
    let content = glyphHtml(glyph);
    if (cls.includes("mk")) {
      const wildlifeClass = animalRecoil === null ? "" : " wildlife-recoil";
      const wildlifeData = animalId === null ? "" : ` data-wildlife-id="${animalId}"`;
      const wildlifeStyle = animalRecoil === null ? "" : ` style="--wildlife-start:${animalRecoil}ms"`;
      content = `<b class="cell-signal${wildlifeClass}"${wildlifeData}${wildlifeStyle}>${content}</b>`;
    } else {
      content = `<span class="cell-ground"><span class="terrain-visual">${content}</span></span>`;
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
    // Open water in sight catches the light: three overlays, one per ripple,
    // whose opacity the compositor animates off the main thread. Each delay
    // is a function of the cell and the seed, so the same cell writes the
    // same markup on every render and the morph has nothing to change.
    if (cls.includes("t-water") && seen === 2 && !cls.includes("memory") && !cls.includes("mk") && !cls.includes("ice-thin") && !cls.includes("ice-safe")) {
      cls.push("water-live");
      content += waterRippleDelaysS(world.seed, cx, cy, z).map((delay, i) => `<i class="water-ripple water-ripple-${i + 1}" style="--water-delay:-${delay}s;--water-peak:${waterRipplePeak(world.seed, cx, cy, i)}" aria-hidden="true"></i>`).join("");
    }
    const style = styles.length ? ` style="${styles.join(";")}"` : "";
    parts.push(`<span class="${cls.join(" ")}" role="gridcell" tabindex="-1" aria-label="${esc(info)}" data-map-x="${gx}" data-map-y="${gy}" data-map-info="${esc(info)}"${mapCell}${act}${style}>${content}</span>`);
  }
  const animalMarkup: string[] = [];
  if (z === 1) {
    for (const animal of visibleWildlife(state, world, cal)) {
      const point = metricPointForWildlife(state, world, animal);
      if (!point) continue;
      const x = (point.xM / PATCH_M - x0) * l.px;
      const y = (point.yM / PATCH_M - y0) * l.line;
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
    const gx = (event.source.xM / PATCH_M - x0) / z;
    const gy = (event.source.yM / PATCH_M - y0) / z;
    // Seen reactions follow the subject's rendered glyph, which may already
    // have escaped its original cell. Hearing never consults hidden wildlife.
    const animal = event.perception.kind === "seen" ? animalAnchors.get(event.subjectId) : undefined;
    const anchor = animal ?? {
      x: (z === 1 ? gx : Math.floor(gx) + 0.5) * l.px,
      y: (z === 1 ? gy : Math.floor(gy) + 0.5) * l.line,
    };
    let jitterX = 0;
    let jitterY = 0;
    if (event.perception.kind === "heard") {
      let hash = 0;
      for (const char of event.id) hash = (Math.imul(hash, 31) + char.charCodeAt(0)) >>> 0;
      const angle = (hash % 360) * Math.PI / 180;
      const radius = Math.min(30, Math.max(0, event.uncertaintyM)) / (PATCH_M * z);
      jitterX = Math.cos(angle) * radius * l.px;
      jitterY = Math.sin(angle) * radius * l.line;
    }
    // The cue sits above the glyph that actually drew the source. Its font
    // height stays constant across zooms, so the clearance does too.
    const px = anchor.x + jitterX;
    const py = anchor.y - l.line / 2 - Math.max(18, l.font) + jitterY;
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
