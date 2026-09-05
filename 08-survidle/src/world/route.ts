/**
 * Routes over the cell grid. A* with 4-connected steps and terrain costs, so
 * a route walks around the lake and across the bog only when it must. Water
 * is impassable. The search is confined to a box around the two ends with a
 * margin, which keeps a region hop to a few thousand cells on a world of
 * millions. Results are cached per (from, to) for the life of a world.
 */
import type { IceMode, Terrain } from "../sim/types";
import { CELL_KM } from "../units";
import { terrainOf, type World } from "./cells";

/** Walking speed on this ground relative to open forest. */
export const TERRAIN_SPEED: Record<Terrain, number> = {
  water: 0, fell: 0.5, rock: 0.75, bog: 0.7, spruce: 1, pine: 1, birch: 1, meadow: 1.1,
};

/** Walking on ice relative to open forest. */
export const ICE_SPEED = 0.8;

/** Speed on this ground given the ice mode a route is willing to cross water with. */
export function speedOf(t: Terrain, ice: IceMode): number {
  if (t === "water") return ice === "none" ? 0 : ICE_SPEED;
  return TERRAIN_SPEED[t];
}

export function passable(t: Terrain, ice: IceMode = "none"): boolean {
  return speedOf(t, ice) > 0;
}

/** Cells of slack around the endpoints' bounding box. */
export const ROUTE_MARGIN = 40;

const caches = new WeakMap<World, Map<string, number[] | null>>();

/**
 * Cells to step through from `from` to `to`, excluding `from` and including
 * `to`, or null when no land route exists within the search box. An empty
 * array means already there.
 */
export function findRoute(world: World, from: number, to: number, ice: IceMode = "none"): number[] | null {
  if (from === to) return [];
  let cache = caches.get(world);
  if (!cache) {
    cache = new Map();
    caches.set(world, cache);
  }
  // Callers consume the array they get (a walk shifts cells off it), so the
  // cache hands out copies and keeps its own.
  const key = `${from}>${to}>${ice}`;
  const hit = cache.get(key);
  if (hit !== undefined) return hit ? hit.slice() : null;
  const route = astar(world, from, to, ice);
  cache.set(key, route);
  return route ? route.slice() : null;
}

function astar(world: World, from: number, to: number, ice: IceMode): number[] | null {
  const W = world.w;
  const fx = from % W;
  const fy = Math.floor(from / W);
  const tx = to % W;
  const ty = Math.floor(to / W);
  // Impassable ground at either end blocks the whole route: standing on ice
  // that has thinned past the mode asked for is a dead end, not just a wall
  // ahead, since there is no legal first step out of it.
  if (!passable(terrainOf(world, fx, fy), ice) || !passable(terrainOf(world, tx, ty), ice)) return null;
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
  const speed = new Float32Array(n);
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) speed[local(x, y)] = speedOf(terrainOf(world, x, y), ice);

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
      if (nb < 0 || closed[nb] || speed[nb] <= 0) continue;
      const ng = g[cur] + 1 / ((speed[nb] + speed[cur]) / 2);
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
export function routeMinutes(world: World, path: number[], baseKmh: number, ice: IceMode = "none"): number {
  let minutes = 0;
  for (const c of path) {
    const v = baseKmh * speedOf(terrainOf(world, c % world.w, Math.floor(c / world.w)), ice);
    minutes += (CELL_KM / Math.max(0.05, v)) * 60;
  }
  return minutes;
}
