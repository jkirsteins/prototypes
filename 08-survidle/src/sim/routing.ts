/**
 * The one door the sim layer routes through. `knownRoute` takes a bare
 * predicate rather than `state` because route.ts cannot import mapped.ts
 * without a cycle (world/gen imports route); this wrapper closes over
 * `state` once so every caller reads the way it did with `findRoute`.
 */
import { cellAt, fordAt, neighbours, regionOf, terrainOf, type World } from "../world/gen";
import { isKnown, knowledgeGen } from "./mapped";
import type { GameState, IceMode } from "./types";
import { knownRoute, passable, routeMinutes, type RouteConditions } from "../world/route";
import { groundAt, iceMode } from "./weather";
import { fearsFell, hasQuirk } from "./fears";

const weatherIds = new WeakMap<GameState["weather"], number>();
let nextWeatherId = 0;

/** Region ice is memoized only for this one query; the cache key includes mutable cover. */
export function routeConditions(state: GameState, world: World, requested: IceMode = "none"): RouteConditions {
  let id = weatherIds.get(state.weather);
  if (id === undefined) { id = ++nextWeatherId; weatherIds.set(state.weather, id); }
  const coast = hasQuirk(state, "coastBorn");
  const minute = state.minute + state.weather.elapsedMinutes;
  const key = `${id}:${state.weather.startDoy}:${coast ? minute : Math.floor(minute / 60)}:${coast}:${requested}:`
    + Object.entries(state.weather.ground).map(([region, g]) => `${region},${g.updatedHour},${g.iceCm}`).join(";");
  const modes = new Map<number, IceMode>();
  return { key, blockedAt: coast ? (cell) => cellAt(world, cell).terrain === "fell" && fearsFell(state, world, cell) : undefined, iceAt(cell) {
    const region = regionOf(world, cell % world.w, Math.floor(cell / world.w));
    let mode = modes.get(region);
    if (mode === undefined) {
      const actual = iceMode(groundAt(state, world, region));
      mode = actual === "safe" || requested === "thin" ? actual : "none";
      modes.set(region, mode);
    }
    return mode;
  } };
}

export function survivorRouteMinutes(state: GameState, world: World, path: number[], baseKmh: number, ice: IceMode = "none"): number {
  return routeMinutes(world, path, baseKmh, routeConditions(state, world, ice));
}

/** A route the survivor could actually plan: it may not leave the ground they know. */
export function survivorRoute(
  state: GameState,
  world: World,
  from: number,
  to: number,
  ice: IceMode = "none",
  avoidFell = false,
): number[] | null {
  return knownRoute(world, from, to, (c) => isKnown(state, c), knowledgeGen(), routeConditions(state, world, ice), avoidFell);
}

/**
 * Every cell the survivor could walk to from `from`, flooded over the same
 * known ground and the same passability `survivorRoute` searches. A caller
 * weighing many destinations asks this once instead of asking A* per cell:
 * a search whose target is cut off by water expands its whole box before it
 * can answer null, and one flood answers for all of them.
 *
 * The standing cell is in the set whether or not it is passable, the way a
 * route to where you already stand is empty rather than null.
 */
export function reachableFrom(state: GameState, world: World, from: number, ice: IceMode = "none"): Set<number> {
  const conditions = routeConditions(state, world, ice);
  const walkable = (cell: number): boolean => {
    if (conditions.blockedAt?.(cell)) return false;
    const terrain = terrainOf(world, cell % world.w, Math.floor(cell / world.w));
    return passable(terrain, conditions.iceAt(cell), fordAt(world, cell));
  };
  const seen = new Set<number>([from]);
  if (!walkable(from)) return seen;
  const queue = [from];
  for (let head = 0; head < queue.length; head++) {
    for (const next of neighbours(world, queue[head])) {
      if (seen.has(next) || !isKnown(state, next) || !walkable(next)) continue;
      seen.add(next);
      queue.push(next);
    }
  }
  return seen;
}

/** A known route followed by exactly one passable unknown step. */
export function frontierRoute(
  state: GameState,
  world: World,
  from: number,
  to: number,
  ice: IceMode = "none",
  avoidFell = false,
): number[] | null {
  const conditions = routeConditions(state, world, ice);
  if (isKnown(state, to) || !passable(cellAt(world, to).terrain, conditions.iceAt(to)) || conditions.blockedAt?.(to)) return null;
  const edges = neighbours(world, to).filter((cell) => isKnown(state, cell));
  let best: number[] | null = null;
  for (const edge of edges) {
    const known = survivorRoute(state, world, from, edge, ice, avoidFell);
    if (!known) continue;
    const path = [...known, to];
    if (!best || path.length < best.length) best = path;
  }
  return best;
}

/**
 * A route while exploring `region`: known ground as always, plus the
 * region's own unmapped ground. Walking into the dark is what exploring
 * is - refusing it is what leaves two cells passing the survivor back and
 * forth forever, each one's only unseen neighbour a cell neither can ever
 * become known enough to route to. Ground outside the region being
 * explored still obeys the known-only rule.
 */
export function exploreRoute(
  state: GameState,
  world: World,
  from: number,
  to: number,
  region: number,
  ice: IceMode = "none",
  avoidFell = false,
): number[] | null {
  const known = (c: number) => isKnown(state, c) || regionOf(world, c % world.w, Math.floor(c / world.w)) === region;
  return knownRoute(world, from, to, known, `${knowledgeGen()}:x${region}`, routeConditions(state, world, ice), avoidFell);
}
