/**
 * Where the player is, in cells, and what that means: which region, which
 * named spot if any, what ground is under foot, and how far camp is. The
 * UI never shows coordinates; it shows what these functions say.
 */
import { CELL_KM } from "../units";
import { type Cell, cellAt, neighbours, regionAt, type RegionDef, regionOf, waterKindOf, type World } from "../world/gen";
import { findRoute, routeKm } from "../world/route";
import { enterRegion, regionState } from "./regionstate";
import { walkableIce } from "./weather";
import type { GameState, IceMode, SpotId, Terrain } from "./types";

export function cellIndex(world: World, x: number, y: number): number {
  const cx = Math.min(world.w - 1, Math.max(0, Math.floor(x)));
  const cy = Math.min(world.h - 1, Math.max(0, Math.floor(y)));
  return cy * world.w + cx;
}

/** The cell under the player's feet. */
export function cellOf(state: GameState, world: World): number {
  return cellIndex(world, state.player.x, state.player.y);
}

export function cellCenter(world: World, idx: number): { x: number; y: number } {
  return { x: (idx % world.w) + 0.5, y: Math.floor(idx / world.w) + 0.5 };
}

/** Puts the player in the middle of a cell and updates the region. */
export function placeAt(state: GameState, world: World, idx: number): void {
  const c = cellCenter(world, idx);
  state.player.x = c.x;
  state.player.y = c.y;
  setRegion(state, world, regionOf(world, idx % world.w, Math.floor(idx / world.w)));
}

/** Records a change of region, discovering it on first entry. */
export function setRegion(state: GameState, world: World, id: number): void {
  if (id < 0) return;
  state.player.region = id;
  if (state.discovered[id] !== 2) enterRegion(state, world, id);
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

/** The named spot whose cell the player stands on, if any. */
export function spotHere(state: GameState, world: World): SpotId | null {
  const idx = cellOf(state, world);
  const r = regionAt(world, state.player.region);
  return r.spots.find((s) => s.cell === idx)?.id ?? null;
}

export function atCamp(state: GameState, world: World): boolean {
  return cellOf(state, world) === regionState(state, world, state.player.region).campCell;
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
  const route = findRoute(world, cellOf(state, world), idx, ice);
  return route ? routeKm(route) : null;
}

export function kmBetween(world: World, a: number, b: number, ice: IceMode = "none"): number | null {
  const route = findRoute(world, a, b, ice);
  return route ? routeKm(route) : null;
}

/** Straight-line km, for descriptions where a route is not needed. */
export function straightKm(world: World, a: number, b: number): number {
  const pa = cellCenter(world, a);
  const pb = cellCenter(world, b);
  return Math.hypot(pa.x - pb.x, pa.y - pb.y) * CELL_KM;
}

const GROUND: Record<Terrain, string> = {
  water: "in the water", fell: "up on the fell", rock: "on the rocks", bog: "on the bog",
  spruce: "in the spruce", pine: "among the pines", birch: "among the birches", meadow: "on open ground",
};

/** "at camp", "in the spruce, 0.4 km from camp", "on the way to Stensund, 2.1 km to go". */
export function describeWhere(state: GameState, world: World): string {
  const r: RegionDef = regionAt(world, state.player.region);
  if (state.route?.path.length) {
    return `on the way to ${state.route.label}, ${routeKm(state.route.path).toFixed(1)} km to go`;
  }
  const spot = spotHere(state, world);
  if (spot === "camp") return "at camp";
  const ice = walkableIce(state.weather);
  const km = kmBetween(world, cellOf(state, world), r.campCell, ice);
  const dist = km === null ? "" : `, ${km.toFixed(1)} km from camp`;
  if (spot) return `at ${SPOT_WORDS[spot]}${dist}`;
  return `${GROUND[hereTerrain(state, world)]}${dist}`;
}

export const SPOT_WORDS: Record<SpotId, string> = {
  camp: "camp", forest: "the forest", outcrop: "the outcrop", shore: "the shore", heath: "the heath",
};
