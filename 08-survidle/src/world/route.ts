/**
 * Routes over the cell grid. A* with 4-connected steps and terrain costs, so
 * a route walks around the lake and across the bog only when it must. Water
 * is impassable. The search is confined to a box around the two ends with a
 * margin, which keeps a region hop to a few thousand cells on a world of
 * millions. Results are cached per (from, to) for the life of a world.
 */
import type { IceMode, Terrain } from "../sim/types";
import { CELL_KM } from "../units";
import { fordAt, terrainOf, type World } from "./cells";

/** Walking speed on this ground relative to open forest. */
export const TERRAIN_SPEED: Record<Terrain, number> = {
  water: 0, river: 0, fell: 0.5, rock: 0.75, bog: 0.7, spruce: 1, pine: 1, birch: 1, meadow: 1.1,
};

/** Walking on ice relative to open forest. */
export const ICE_SPEED = 0.8;

/** A caller-owned local ice field; key must change whenever its readings change. */
export interface RouteConditions {
  key: string;
  iceAt: (cell: number) => IceMode;
  blockedAt?: (cell: number) => boolean;
}
export type RouteIce = IceMode | RouteConditions;
const iceAt = (ice: RouteIce, cell: number): IceMode => typeof ice === "string" ? ice : ice.iceAt(cell);
const iceKey = (ice: RouteIce): string => typeof ice === "string" ? ice : ice.key;

/** Speed on this ground given the ice mode a route is willing to cross water with, and whether a ford lets this river cell be crossed at bog's speed. */
export function speedOf(t: Terrain, ice: IceMode, ford = false): number {
  if (t === "water") return ice === "none" ? 0 : ICE_SPEED;
  if (t === "river") return ford ? TERRAIN_SPEED.bog : ice === "none" ? 0 : ICE_SPEED;
  return TERRAIN_SPEED[t];
}

export function passable(t: Terrain, ice: IceMode = "none", ford = false): boolean {
  return speedOf(t, ice, ford) > 0;
}

/** Cells of slack around the endpoints' bounding box. */
export const ROUTE_MARGIN = 40;

const caches = new WeakMap<World, Map<string, number[] | null>>();

/**
 * Cells to step through from `from` to `to`, excluding `from` and including
 * `to`, or null when no land route exists within the search box. An empty
 * array means already there.
 */
export function findRoute(world: World, from: number, to: number, ice: RouteIce = "none", avoidFell = false): number[] | null {
  if (from === to) return [];
  let cache = caches.get(world);
  if (!cache) {
    cache = new Map();
    caches.set(world, cache);
  }
  // Callers consume the array they get (a walk shifts cells off it), so the
  // cache hands out copies and keeps its own.
  const key = `${from}>${to}>${iceKey(ice)}${avoidFell ? ">nofell" : ""}`;
  const hit = cache.get(key);
  if (hit !== undefined) return hit ? hit.slice() : null;
  const route = astar(world, from, to, ice, avoidFell);
  cache.set(key, route);
  return route ? route.slice() : null;
}

/** Routes kept per world for the knowledge-limited search; see the note where it is trimmed. */
const KNOWN_ROUTE_CACHE = 4096;

const knownCaches = new WeakMap<World, Map<string, number[] | null>>();

/**
 * `findRoute`, but refusing any cell the survivor has not mapped: `known`
 * says which cells that is. The survivor's own standing cell is exempt -
 * an heir lands where they land - but `to` is not, and a `to` outside
 * `known` returns null without searching.
 *
 * `gen` is the caller's fresh `knowledgeGen()` reading and keys the cache
 * alongside `from`/`to`/`ice`/`avoidFell`: pass a value read after the
 * knowledge you are routing on, never a value held from an earlier call,
 * or a route computed before ground opened up can be served stale. A
 * caller whose `known` means something beyond plain `knowledgeGen()` (an
 * exploring sweep's "or unmapped ground of this region") folds that into
 * `gen` too - a string tag is as good a cache key as a number, and keeps
 * that route's cache entries apart from every other caller's.
 */
export function knownRoute(
  world: World,
  from: number,
  to: number,
  known: (cell: number) => boolean,
  gen: number | string,
  ice: RouteIce = "none",
  avoidFell = false,
): number[] | null {
  if (from === to) return [];
  if (!known(to)) return null;
  let cache = knownCaches.get(world);
  if (!cache) {
    cache = new Map();
    knownCaches.set(world, cache);
  }
  const key = `${from}>${to}>${iceKey(ice)}${avoidFell ? ">nofell" : ""}>${gen}`;
  const hit = cache.get(key);
  if (hit !== undefined) return hit ? hit.slice() : null;
  const route = astar(world, from, to, ice, avoidFell, known);
  // Local weather revisions can create a fresh key every minute while
  // travelling, so the cache is bounded. It has to be wide enough to hold one
  // caller's whole sweep, though, or the start of a sweep is evicted before
  // the end of it and searched again on the next one. The widest sweep left is
  // `exploreFrontier` in src/sim/tasks.ts: one route per frontier cell of the
  // region, bounded only by how many cells the region has, so a few hundred
  // entries in one decision. Everything else asks for tens - the hunting
  // chooser's shortlist is two routes for each of HUNT_SHORTLIST cells.
  if (cache.size >= KNOWN_ROUTE_CACHE) cache.delete(cache.keys().next().value!);
  cache.set(key, route);
  return route ? route.slice() : null;
}

function astar(world: World, from: number, to: number, ice: RouteIce, avoidFell: boolean, known?: (cell: number) => boolean): number[] | null {
  // A walker who will not go up on the fell treats it as water with no ice.
  const sp = (t: Terrain, cell: number) => ((avoidFell && t === "fell") || (typeof ice !== "string" && ice.blockedAt?.(cell)) ? 0 : speedOf(t, t === "water" || t === "river" ? iceAt(ice, cell) : "none", fordAt(world, cell)));
  const W = world.w;
  const fx = from % W;
  const fy = Math.floor(from / W);
  const tx = to % W;
  const ty = Math.floor(to / W);
  // Impassable ground at either end blocks the whole route: standing on ice
  // that has thinned past the mode asked for is a dead end, not just a wall
  // ahead, since there is no legal first step out of it.
  if (sp(terrainOf(world, fx, fy), from) <= 0 || sp(terrainOf(world, tx, ty), to) <= 0) return null;
  // The search box.
  const x0 = Math.max(0, Math.min(fx, tx) - ROUTE_MARGIN);
  const y0 = Math.max(0, Math.min(fy, ty) - ROUTE_MARGIN);
  const x1 = Math.min(world.w - 1, Math.max(fx, tx) + ROUTE_MARGIN);
  const y1 = Math.min(world.h - 1, Math.max(fy, ty) + ROUTE_MARGIN);
  const bw = x1 - x0 + 1;
  const bh = y1 - y0 + 1;
  const n = bw * bh;
  const local = (x: number, y: number) => (y - y0) * bw + (x - x0);
  const start = local(fx, fy);
  const goal = local(tx, ty);
  // Reading one cell's speed costs a chunk lookup, and on a known-only route a
  // knowledge lookup on top. The box is sized off the margin rather than off
  // the route, so a step to the next cell over still spans thousands of cells
  // the search will never look at: measure a cell when the frontier reaches it,
  // not all of them up front.
  const speed = new Float32Array(n);
  const measured = new Uint8Array(n);
  const speedAt = (li: number): number => {
    if (measured[li]) return speed[li];
    measured[li] = 1;
    const x = (li % bw) + x0;
    const y = Math.floor(li / bw) + y0;
    // The standing cell stays enterable-from even when unmapped; every
    // other cell also needs `known` on top of its terrain speed.
    speed[li] = known && li !== start && !known(y * W + x) ? 0 : sp(terrainOf(world, x, y), y * W + x);
    return speed[li];
  };

  const g = new Float64Array(n).fill(Number.POSITIVE_INFINITY);
  const f = new Float64Array(n).fill(Number.POSITIVE_INFINITY);
  const parent = new Int32Array(n).fill(-1);
  const closed = new Uint8Array(n);
  const inOpen = new Uint8Array(n);
  // Binary heap on f.
  const heap: number[] = [];
  const push = (i: number) => {
    heap.push(i);
    let k = heap.length - 1;
    while (k > 0) {
      const p = (k - 1) >> 1;
      if (f[heap[p]] <= f[heap[k]]) break;
      [heap[p], heap[k]] = [heap[k], heap[p]];
      k = p;
    }
  };
  const pop = (): number => {
    const top = heap[0];
    const last = heap.pop()!;
    if (heap.length) {
      heap[0] = last;
      let k = 0;
      for (;;) {
        const l = 2 * k + 1;
        const r = l + 1;
        let m = k;
        if (l < heap.length && f[heap[l]] < f[heap[m]]) m = l;
        if (r < heap.length && f[heap[r]] < f[heap[m]]) m = r;
        if (m === k) break;
        [heap[m], heap[k]] = [heap[k], heap[m]];
        k = m;
      }
    }
    return top;
  };
  const heuristic = (i: number) => (Math.abs((i % bw) - (goal % bw)) + Math.abs(Math.floor(i / bw) - Math.floor(goal / bw))) / 1.1;

  g[start] = 0;
  f[start] = heuristic(start);
  push(start);
  inOpen[start] = 1;
  while (heap.length) {
    const cur = pop();
    inOpen[cur] = 0;
    if (cur === goal) break;
    if (closed[cur]) continue;
    closed[cur] = 1;
    const cx = cur % bw;
    const cy = Math.floor(cur / bw);
    const nbs = [cx > 0 ? cur - 1 : -1, cx < bw - 1 ? cur + 1 : -1, cy > 0 ? cur - bw : -1, cy < bh - 1 ? cur + bw : -1];
    for (const nb of nbs) {
      if (nb < 0 || closed[nb] || speedAt(nb) <= 0) continue;
      const ng = g[cur] + 1 / ((speedAt(nb) + speedAt(cur)) / 2);
      if (ng < g[nb]) {
        g[nb] = ng;
        parent[nb] = cur;
        f[nb] = ng + heuristic(nb);
        if (!inOpen[nb]) {
          push(nb);
          inOpen[nb] = 1;
        }
      }
    }
  }
  if (parent[goal] === -1) return null;
  const path: number[] = [];
  for (let c = goal; c !== start; c = parent[c]) path.push((Math.floor(c / bw) + y0) * W + ((c % bw) + x0));
  path.reverse();
  return path;
}

/** Kilometres along a route of cells. */
export function routeKm(path: number[]): number {
  return path.length * CELL_KM;
}

/** Minutes to walk a route at a given base speed (km/h), terrain of each cell applied. */
export function routeMinutes(world: World, path: number[], baseKmh: number, ice: RouteIce = "none"): number {
  let minutes = 0;
  for (const c of path) {
    const v = baseKmh * speedOf(terrainOf(world, c % world.w, Math.floor(c / world.w)), iceAt(ice, c), fordAt(world, c));
    if (v <= 0 || (typeof ice !== "string" && ice.blockedAt?.(c))) return Infinity;
    minutes += (CELL_KM / Math.max(0.05, v)) * 60;
  }
  return minutes;
}

/** The geometry of one walking step, shared by movement and its time estimate.
 * Mutates the position and remaining path. A false visit result stops at that
 * point, so a real walk can stop immediately when the ice gives way. */
export function walkPath(
  world: World, position: { x: number; y: number }, path: number[], km: number,
  visit?: (cell: number, movedKm: number, arrived: boolean) => boolean | undefined,
): void {
  while (km > 1e-9 && path.length) {
    const cell = path[0];
    const x = cell % world.w + 0.5;
    const y = Math.floor(cell / world.w) + 0.5;
    const dx = x - position.x;
    const dy = y - position.y;
    const distKm = Math.hypot(dx, dy) * CELL_KM;
    if (km >= distKm) {
      position.x = x;
      position.y = y;
      path.shift();
      km -= distKm;
      if (visit?.(cell, distKm, true) === false) return;
    } else {
      const fraction = km / distKm;
      position.x += dx * fraction;
      position.y += dy * fraction;
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
  world: World, position: { x: number; y: number }, path: number[], baseKmh: number, ice: IceMode,
): number {
  const feet = { x: position.x, y: position.y };
  const remaining = [...path];
  let minutes = 0;
  while (remaining.length) {
    const fx = Math.floor(feet.x);
    const fy = Math.floor(feet.y);
    const speed = baseKmh * speedOf(terrainOf(world, fx, fy), ice, fordAt(world, fy * world.w + fx));
    if (speed <= 0) return Number.POSITIVE_INFINITY;
    walkPath(world, feet, remaining, speed / 60);
    minutes++;
  }
  return minutes;
}
