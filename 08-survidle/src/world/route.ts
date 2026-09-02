/**
 * Routes over the cell grid. A* with 4-connected steps and terrain costs, so
 * a route walks around the lake and across the bog only when it must. Water
 * is impassable. Results are cached per (from, to) for the life of a world.
 */
import type { Terrain } from "../sim/types";
import { CELL_KM } from "../units";
import type { World } from "./gen";

/** Walking speed on this ground relative to open forest. */
export const TERRAIN_SPEED: Record<Terrain, number> = {
  water: 0, fell: 0.5, rock: 0.75, bog: 0.7, spruce: 1, pine: 1, birch: 1, meadow: 1.1,
};

export function passable(t: Terrain): boolean {
  return TERRAIN_SPEED[t] > 0;
}

const caches = new WeakMap<World, Map<string, number[] | null>>();

/**
 * Cells to step through from `from` to `to`, excluding `from` and including
 * `to`, or null when no land route exists. An empty array means already there.
 */
export function findRoute(world: World, from: number, to: number): number[] | null {
  if (from === to) return [];
  let cache = caches.get(world);
  if (!cache) {
    cache = new Map();
    caches.set(world, cache);
  }
  // Callers consume the array they get (a walk shifts cells off it), so the
  // cache hands out copies and keeps its own.
  const key = `${from}>${to}`;
  const hit = cache.get(key);
  if (hit !== undefined) return hit ? hit.slice() : null;
  const route = astar(world, from, to);
  cache.set(key, route);
  return route ? route.slice() : null;
}

function astar(world: World, from: number, to: number): number[] | null {
  const { w, h, cells } = world;
  const n = w * h;
  if (!passable(cells[to].terrain)) return null;
  const tx = to % w;
  const ty = Math.floor(to / w);
  const g = new Float64Array(n).fill(Number.POSITIVE_INFINITY);
  const parent = new Int32Array(n).fill(-1);
  const closed = new Uint8Array(n);
  const open: number[] = [from];
  const f = new Float64Array(n).fill(Number.POSITIVE_INFINITY);
  g[from] = 0;
  f[from] = heuristic(from % w, Math.floor(from / w), tx, ty);
  while (open.length) {
    // Smallest f; the grid is small enough that a scan beats a heap's bookkeeping.
    let bi = 0;
    for (let i = 1; i < open.length; i++) if (f[open[i]] < f[open[bi]]) bi = i;
    const cur = open[bi];
    open[bi] = open[open.length - 1];
    open.pop();
    if (cur === to) break;
    closed[cur] = 1;
    const cx = cur % w;
    const cy = Math.floor(cur / w);
    const nbs = [cx > 0 ? cur - 1 : -1, cx < w - 1 ? cur + 1 : -1, cy > 0 ? cur - w : -1, cy < h - 1 ? cur + w : -1];
    for (const nb of nbs) {
      if (nb < 0 || closed[nb]) continue;
      const t = cells[nb].terrain;
      if (!passable(t)) continue;
      // Cost of a step is the time it takes: distance over speed, averaged over both cells.
      const speed = (TERRAIN_SPEED[t] + TERRAIN_SPEED[cells[cur].terrain]) / 2;
      const ng = g[cur] + 1 / speed;
      if (ng < g[nb]) {
        g[nb] = ng;
        parent[nb] = cur;
        f[nb] = ng + heuristic(nb % w, Math.floor(nb / w), tx, ty);
        if (!open.includes(nb)) open.push(nb);
      }
    }
  }
  if (parent[to] === -1) return null;
  const path: number[] = [];
  for (let c = to; c !== from; c = parent[c]) path.push(c);
  path.reverse();
  return path;
}

function heuristic(x: number, y: number, tx: number, ty: number): number {
  // Manhattan steps at the best speed on the map.
  return (Math.abs(x - tx) + Math.abs(y - ty)) / 1.1;
}

/** Kilometres along a route of cells. */
export function routeKm(path: number[]): number {
  return path.length * CELL_KM;
}

/** Minutes to walk a route at a given base speed (km/h), terrain of each cell applied. */
export function routeMinutes(world: World, path: number[], baseKmh: number): number {
  let minutes = 0;
  for (const c of path) {
    const v = baseKmh * TERRAIN_SPEED[world.cells[c].terrain];
    minutes += (CELL_KM / Math.max(0.05, v)) * 60;
  }
  return minutes;
}
