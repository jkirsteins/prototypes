/** Compatibility facade over exact hierarchical fine-patch routes. */
import type { IceMode, Terrain } from "../sim/types";
import { fineHeightAt, fordAt, type World } from "./cells";
import { filterReachableFineCandidates, findHierarchicalRoute, type TraversalProfile } from "./fine-route";
import { type MetricPoint, PATCH_KM, PATCH_M, type PatchId, patchCenter, patchId, patchXY } from "./spatial";

/** Walking speed on this ground relative to open forest. */
export const TERRAIN_SPEED: Record<Terrain, number> = {
  water: 0, river: 0, fell: 0.5, rock: 0.75, bog: 0.7, spruce: 1, pine: 1, birch: 1, meadow: 1.1,
};
export const ICE_SPEED = 0.8;

/** The key must change whenever iceAt OR blockedAt readings change. */
export interface RouteConditions {
  key: string;
  iceAt: (cell: number) => IceMode;
  blockedAt?: (cell: number) => boolean;
}
export type RouteIce = IceMode | RouteConditions;
const iceAt = (ice: RouteIce, cell: number): IceMode => typeof ice === "string" ? ice : ice.iceAt(cell);
const iceKey = (ice: RouteIce): readonly string[] => typeof ice === "string" ? ["uniform", ice] : ["local", ice.key];

/** Speed on this ground given the ice mode a route is willing to cross water with, and whether a ford lets this river cell be crossed at bog's speed. */
export function speedOf(t: Terrain, ice: IceMode, ford = false): number {
  if (t === "water") return ice === "none" ? 0 : ICE_SPEED;
  if (t === "river") return ford ? TERRAIN_SPEED.bog : ice === "none" ? 0 : ICE_SPEED;
  return TERRAIN_SPEED[t];
}

export function passable(t: Terrain, ice: IceMode = "none", ford = false): boolean {
  return speedOf(t, ice, ford) > 0;
}

/** Retained finished routes per world, in least-recently-used order. */
export const ROUTE_CACHE_LIMIT = 512;
interface RouteCache {
  routes: Map<string, number[] | null>;
  /** Routes actually searched, so a cache hit is distinguishable from work. */
  builds: number;
}
const caches = new WeakMap<World, RouteCache>();

/** Retained work only; observing diagnostics does not create a cache. */
export function routeCacheStats(world: World): { routes: number; routeLimit: number; routeBuilds: number } {
  const cache = caches.get(world);
  return { routes: cache?.routes.size ?? 0, routeLimit: ROUTE_CACHE_LIMIT, routeBuilds: cache?.builds ?? 0 };
}

function profileFor(
  world: World, from: PatchId, ice: RouteIce, avoidFell: boolean,
  known?: (cell: number) => boolean, generation?: number | string,
): TraversalProfile {
  // Only an unknown standing patch changes the knowledge overlay. Known
  // starts share one profile so reverse and multi-origin queries reuse it.
  const profileKey = JSON.stringify([
    "fine-v1", iceKey(ice), avoidFell, known ? [generation, known(from) ? null : from] : null,
  ]);
  const speeds = new Map<PatchId, number>();
  const elevations = new Map<PatchId, number>();
  return {
    key: profileKey,
    // speedAt only returns 0, ICE_SPEED or a TERRAIN_SPEED value.
    maxSpeed: Math.max(ICE_SPEED, ...Object.values(TERRAIN_SPEED)),
    speedAt(patch) {
      let speed = speeds.get(patch);
      if (speed !== undefined) return speed;
      const blocked = (known && patch !== from && !known(patch))
        || (typeof ice !== "string" && ice.blockedAt?.(patch));
      if (blocked) speed = 0;
      else {
        const terrain = world.terrainAt(patch);
        const water = terrain === "water" || terrain === "river";
        speed = avoidFell && terrain === "fell" ? 0 : speedOf(terrain, water ? iceAt(ice, patch) : "none", fordAt(world, patch));
      }
      speeds.set(patch, speed);
      return speed;
    },
    elevationAt(patch) {
      let elevation = elevations.get(patch);
      if (elevation === undefined) {
        elevation = fineHeightAt(world, patch);
        elevations.set(patch, elevation);
      }
      return elevation;
    },
  };
}

function route(
  world: World, from: PatchId, to: PatchId, ice: RouteIce, avoidFell: boolean,
  known?: (cell: number) => boolean, generation?: number | string,
): number[] | null {
  if (from === to) return [];
  if (known && !known(to)) return null;
  let cache = caches.get(world);
  if (!cache) { cache = { routes: new Map(), builds: 0 }; caches.set(world, cache); }
  const profile = profileFor(world, from, ice, avoidFell, known, generation);
  const key = JSON.stringify([from, to, profile.key]);
  const hit = cache.routes.get(key);
  if (hit !== undefined) return hit?.slice() ?? null;
  // World itself is the stable FineGrid cache identity.
  const result = findHierarchicalRoute(world, from, to, profile)?.patches.slice(1) ?? null;
  cache.builds++;
  if (cache.routes.size >= ROUTE_CACHE_LIMIT) cache.routes.delete(cache.routes.keys().next().value!);
  cache.routes.set(key, result);
  return result?.slice() ?? null;
}

/** Reject impossible targets using exact parent connectivity in a bounded
 * superset. Retained targets still require their individual exact route. */
export function knownRouteCandidates(
  world: World, from: PatchId, candidates: readonly PatchId[], known: (cell: number) => boolean,
  generation: number | string, ice: RouteIce = "none", avoidFell = false,
): number[] {
  const permitted = candidates.filter(candidate => candidate === from || known(candidate));
  const result = filterReachableFineCandidates(world, from, permitted, profileFor(world, from, ice, avoidFell, known, generation));
  return result.candidates;
}

/** Excludes from and includes to; [] means already there. */
export function findRoute(world: World, from: number, to: number, ice: RouteIce = "none", avoidFell = false): number[] | null {
  return route(world, from, to, ice, avoidFell);
}

/** Refuses unknown ground except the standing patch. The caller must provide
 * a fresh knowledge generation, including any extra exploration permissions. */
export function knownRoute(
  world: World, from: number, to: number, known: (cell: number) => boolean,
  gen: number | string, ice: RouteIce = "none", avoidFell = false,
): number[] | null {
  return route(world, from, to, ice, avoidFell, known, gen);
}

/** Physical length of a legacy path, including its explicit first edge. */
export function routeKm(path: readonly PatchId[], from: PatchId): number {
  let km = 0;
  let previous = patchXY(from);
  for (const patch of path) {
    const next = patchXY(patch);
    km += Math.hypot(next.x - previous.x, next.y - previous.y) * PATCH_KM;
    previous = next;
  }
  return km;
}

/**
 * What is left of a walk from exactly where the feet are: the metre point to
 * the next patch centre, then the rest of the path. A survivor mid-edge has
 * already covered part of that first edge, which a patch origin cannot say.
 */
export function remainingKm(path: readonly PatchId[], from: MetricPoint): number {
  if (!path.length) return 0;
  const next = patchCenter(path[0]);
  let km = Math.hypot(next.xM - from.xM, next.yM - from.yM) / 1000;
  let previous = patchXY(path[0]);
  for (let i = 1; i < path.length; i++) {
    const step = patchXY(path[i]);
    km += Math.hypot(step.x - previous.x, step.y - previous.y) * PATCH_KM;
    previous = step;
  }
  return km;
}

/** Terrain-adjusted walking time from an explicit starting patch. */
export function routeMinutes(world: World, path: readonly PatchId[], from: PatchId, baseKmh: number, ice: RouteIce = "none"): number {
  let minutes = 0;
  let previous = from;
  for (const cell of path) {
    const terrain = world.terrainAt(cell);
    const v = baseKmh * speedOf(terrain, terrain === "water" || terrain === "river" ? iceAt(ice, cell) : "none", fordAt(world, cell));
    if (v <= 0 || (typeof ice !== "string" && ice.blockedAt?.(cell))) return Infinity;
    minutes += routeKm([cell], previous) / Math.max(0.05, v) * 60;
    previous = cell;
  }
  return minutes;
}

/** The geometry of one walking step, shared by movement and its time estimate.
 * Mutates the position and remaining path. A false visit result stops at that
 * point, so a real walk can stop immediately when the ice gives way. */
export function walkPath(
  position: MetricPoint, path: number[], km: number,
  visit?: (cell: number, movedKm: number, arrived: boolean) => boolean | undefined,
): void {
  while (km > 1e-9 && path.length) {
    const cell = path[0];
    const next = patchCenter(cell);
    const dx = next.xM - position.xM;
    const dy = next.yM - position.yM;
    const distKm = Math.hypot(dx, dy) / 1000;
    if (km >= distKm) {
      position.xM = next.xM;
      position.yM = next.yM;
      path.shift();
      km -= distKm;
      if (visit?.(cell, distKm, true) === false) return;
    } else {
      const fraction = km / distKm;
      position.xM += dx * fraction;
      position.yM += dy * fraction;
      visit?.(cell, km, false);
      km = 0;
    }
  }
}

/** Remaining one-minute walking steps at today's body pace. Terrain is read
 * under the moving feet each minute, including a boundary before the next
 * route centre. Uses the same geometry as real movement, on private copies;
 * it predicts neither future weather nor random falls through thin ice. */
export function remainingWalkMinutes(
  world: World, position: MetricPoint, path: number[], baseKmh: number, ice: IceMode,
): number {
  const feet = { xM: position.xM, yM: position.yM };
  const remaining = [...path];
  let minutes = 0;
  while (remaining.length) {
    const patch = patchId(Math.floor(feet.xM / PATCH_M), Math.floor(feet.yM / PATCH_M));
    const speed = baseKmh * speedOf(world.terrainAt(patch), ice, fordAt(world, patch));
    if (speed <= 0) return Number.POSITIVE_INFINITY;
    walkPath(feet, remaining, speed / 60);
    minutes++;
  }
  return minutes;
}
