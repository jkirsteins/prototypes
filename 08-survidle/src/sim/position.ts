import { localWeather } from "./weather";
/**
 * Where the player is, in metres, and what that means: which region, which
 * named spot if any, what ground is under foot, and how far camp is. The
 * UI never shows coordinates; it shows what these functions say.
 */
import { type MetricPoint, PATCH_M, type PatchId, patchCenter, patchId } from "../world/spatial";
import { type Cell, cellAt, neighbours, regionAt, regionOf, waterKindOf, type World } from "../world/gen";
import { remainingKm, routeKm } from "../world/route";
import { calendar } from "./calendar";
import { markWalked } from "./mapped";
import { enterRegion, VISITED } from "./regionstate";
import { survivorRoute } from "./routing";
import { seeFrom } from "./sight";
import { walkableIce } from "./weather";
import type { GameState, IceMode, SpotId, Terrain } from "./types";
import { cellSurface, surfaceLocation } from "./cellstatus";

/** The fine patch containing a metre point, clamped to the world's edge. */
export function patchAt(world: World, point: MetricPoint): PatchId {
  const x = Math.min(world.w - 1, Math.max(0, Math.floor(point.xM / PATCH_M)));
  const y = Math.min(world.h - 1, Math.max(0, Math.floor(point.yM / PATCH_M)));
  return patchId(x, y);
}

/** The fine patch under the player's feet. */
export function patchOf(state: GameState, world: World): PatchId {
  return patchAt(world, state.player);
}

/** The name most of the sim still calls patchOf by; the same fine patch, no conversion. */
export function cellOf(state: GameState, world: World): PatchId {
  return patchOf(state, world);
}

/**
 * The camp as the run has it, or null where nobody has made one. A region owns a camp
 * only once somebody sites it; the generated cell is a suggestion, never a camp. Read
 * only: an untouched region has no state, and asking after its camp must not be what
 * gives it one - regionState(...) would.
 */
export function campCellOf(state: GameState, _world: World, region = state.player.region): number | null {
  return state.regions[region]?.campCell ?? null;
}

/** Puts the player in the middle of a fine patch and updates the region. */
export function placeAtPatch(state: GameState, world: World, patch: PatchId): void {
  const c = patchCenter(patch);
  state.player.xM = c.xM;
  state.player.yM = c.yM;
  setRegion(state, world, regionOf(world, patch % world.w, Math.floor(patch / world.w)));
  markWalked(state, patch);
  seeFrom(state, world, calendar(state.minute, state.startDoy), patch);
}

/** The name most of the sim still calls placeAtPatch by. */
export function placeAt(state: GameState, world: World, patch: PatchId): void {
  placeAtPatch(state, world, patch);
}

/**
 * Puts the player at an exact metre point, wherever inside a patch that
 * falls, and updates the region from the patch that then holds them.
 */
export function placeAtMetric(state: GameState, world: World, point: MetricPoint): void {
  const patch = patchAt(world, point);
  state.player.xM = point.xM;
  state.player.yM = point.yM;
  setRegion(state, world, regionOf(world, patch % world.w, Math.floor(patch / world.w)));
  markWalked(state, patch);
  seeFrom(state, world, calendar(state.minute, state.startDoy), patch);
}

/** Records a change of region, discovering it on first entry. */
export function setRegion(state: GameState, world: World, id: number): void {
  if (state.player.fieldFire && state.player.fieldFire.cell !== cellOf(state, world)) state.player.fieldFire = null;
  if (id < 0) return;
  state.player.region = id;
  if (state.discovered[id] !== VISITED) enterRegion(state, world, id);
}

/** Puts the player at a named spot of a region, for setup and tests. */
export function placeAtSpot(state: GameState, world: World, region: number, spot: SpotId): void {
  const s = regionAt(world, region).spots.find((x) => x.id === spot);
  if (!s) throw new Error(`region ${region} has no ${spot}`);
  placeAt(state, world, s.cell);
}

export function hereCell(state: GameState, world: World): Cell {
  return cellAt(world, cellOf(state, world));
}

export function hereTerrain(state: GameState, world: World): Terrain {
  return hereCell(state, world).terrain;
}

/** The named spot whose cell the player stands on, if any: the live camp cell first, then the region's other spots. */
export function spotHere(state: GameState, world: World): SpotId | null {
  const idx = cellOf(state, world);
  if (campCellOf(state, world) !== null && idx === campCellOf(state, world)) return "camp";
  const r = regionAt(world, state.player.region);
  return r.spots.find((s) => s.id !== "camp" && s.cell === idx)?.id ?? null;
}

export function atCamp(state: GameState, world: World): boolean {
  const camp = campCellOf(state, world);
  return camp !== null && cellOf(state, world) === camp;
}

export function forestCell(world: World, idx: number): boolean {
  const t = cellAt(world, idx).terrain;
  return t === "spruce" || t === "pine" || t === "birch";
}

export function rockCell(world: World, idx: number): boolean {
  const t = cellAt(world, idx).terrain;
  return t === "rock" || t === "fell";
}

export function heathCell(world: World, idx: number): boolean {
  const t = cellAt(world, idx).terrain;
  return t === "bog" || t === "meadow";
}

/** Land beside water: any water, or only a lake or only the sea. */
export function watersideCell(world: World, idx: number, kind: "lake" | "sea" | "any" = "any"): boolean {
  if (kind === "any") return neighbours(world, idx).some((n) => cellAt(world, n).terrain === "water");
  return neighbours(world, idx).some((n) => waterKindOf(world, n) === kind);
}

export function inForest(state: GameState, world: World): boolean {
  return forestCell(world, cellOf(state, world));
}

export function onRock(state: GameState, world: World): boolean {
  return rockCell(world, cellOf(state, world));
}

export function onHeath(state: GameState, world: World): boolean {
  return heathCell(world, cellOf(state, world));
}

export function byWater(state: GameState, world: World): boolean {
  return watersideCell(world, cellOf(state, world));
}

/** Route length in km from the player to a cell, or null if unreachable. */
export function kmTo(state: GameState, world: World, idx: number, ice: IceMode = "none"): number | null {
  const route = survivorRoute(state, world, cellOf(state, world), idx, ice);
  return route ? routeKm(route, cellOf(state, world)) : null;
}

export function kmBetween(state: GameState, world: World, a: number, b: number, ice: IceMode = "none"): number | null {
  const route = survivorRoute(state, world, a, b, ice);
  return route ? routeKm(route, a) : null;
}

/** Straight-line km, for descriptions where a route is not needed. */
export function straightKm(_world: World, a: number, b: number): number {
  const pa = patchCenter(a);
  const pb = patchCenter(b);
  return Math.hypot(pa.xM - pb.xM, pa.yM - pb.yM) / 1000;
}

/** "at camp", "in the spruce, 0.4 km from camp", "on the way to Stensund, 2.1 km to go". */
export function describeWhere(state: GameState, world: World): string {
  if (state.route?.path.length) {
    return `on the way to ${state.route.label}, ${remainingKm(state.route.path, state.player).toFixed(1)} km to go`;
  }
  const spot = spotHere(state, world);
  if (spot === "camp") return "at camp";
  const ice = walkableIce(localWeather(state, world));
  const camp = campCellOf(state, world);
  const km = camp === null ? null : kmBetween(state, world, cellOf(state, world), camp, ice);
  const dist = km === null ? "" : `, ${km.toFixed(1)} km from camp`;
  const surface = surfaceLocation(cellSurface(state, world, cellOf(state, world)));
  if (spot) return `at ${SPOT_WORDS[spot]}, ${surface}${dist}`;
  return `${surface}${dist}`;
}

export const SPOT_WORDS: Record<SpotId, string> = {
  camp: "camp", forest: "the forest", outcrop: "the outcrop", shore: "the shore", heath: "the heath",
};
