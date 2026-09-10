import type { Terrain } from "../sim/types";
import { FINE_PER_PARENT, fineNeighbours, type PatchId, PATCH_M, parentXY, patchId, patchXY } from "./spatial";

export interface FineGrid {
  w: number;
  h: number;
  terrainAt(patch: PatchId): Terrain;
}

export interface TraversalProfile {
  /** Change the key whenever speed or elevation readings change. */
  key: string;
  /** Caller guarantees this bounds every positive speedAt reading. */
  maxSpeed?: number;
  speedAt(patch: PatchId): number;
  elevationAt(patch: PatchId): number;
}

export interface FineRoute {
  /** Includes both endpoints, or one patch when already there. */
  patches: PatchId[];
  distanceM: number;
  cost: number;
}

export interface ParentTopology {
  readonly key: string;
  readonly components: ReadonlyMap<number, readonly PatchId[]>;
  readonly portals: readonly PatchId[];
  connected(from: PatchId, to: PatchId): boolean;
}

interface Topology extends ParentTopology {
  members: Set<PatchId>;
}

interface SearchTree {
  costs: Map<PatchId, number>;
  previous: Map<PatchId, PatchId>;
}

interface GridCache {
  topology: Map<string, Topology>;
  overlays: Map<string, Map<PatchId, SearchTree>>;
}

const caches = new WeakMap<FineGrid, GridCache>();
const TOPOLOGY_LIMIT = 4096;
const OVERLAY_LIMIT = 1024;
const DIRECT_PATCH_LIMIT = 65536;
const PARENT_MARGIN = 40;

/** Retained work only; observing diagnostics does not create a cache. */
export function fineRouteCacheStats(grid: FineGrid): { topologies: number; topologyLimit: number; overlays: number; overlayLimit: number; localTrees: number } {
  const cache = caches.get(grid);
  let localTrees = 0;
  for (const overlay of cache?.overlays.values() ?? []) localTrees += overlay.size;
  return {
    topologies: cache?.topology.size ?? 0, topologyLimit: TOPOLOGY_LIMIT,
    overlays: cache?.overlays.size ?? 0, overlayLimit: OVERLAY_LIMIT, localTrees,
  };
}

function cacheFor(grid: FineGrid): GridCache {
  let cache = caches.get(grid);
  if (!cache) {
    cache = { topology: new Map(), overlays: new Map() };
    caches.set(grid, cache);
  }
  return cache;
}

function retained<K, V>(cache: Map<K, V>, key: K): V | undefined {
  const value = cache.get(key);
  if (value !== undefined) { cache.delete(key); cache.set(key, value); }
  return value;
}

function retain<K, V>(cache: Map<K, V>, key: K, value: V, limit: number): void {
  cache.delete(key);
  cache.set(key, value);
  while (cache.size > limit) cache.delete(cache.keys().next().value!);
}

function passable(profile: TraversalProfile, patch: PatchId): boolean {
  const speed = profile.speedAt(patch);
  return Number.isFinite(speed) && speed > 0;
}

function inGrid(grid: FineGrid, patch: PatchId): boolean {
  const { x, y } = patchXY(patch);
  return x < grid.w && y < grid.h;
}

/** Exact topology depends on passability, never on positive walking speeds. */
export function buildParentTopology(grid: FineGrid, px: number, py: number, profile: TraversalProfile): ParentTopology {
  return topologyFor(grid, px, py, profile);
}

function topologyFor(grid: FineGrid, px: number, py: number, profile: TraversalProfile): Topology {
  const x0 = px * FINE_PER_PARENT;
  const y0 = py * FINE_PER_PARENT;
  if (!Number.isInteger(px) || !Number.isInteger(py) || x0 < 0 || y0 < 0 || x0 >= grid.w || y0 >= grid.h) {
    throw new RangeError("parent is outside the fine grid");
  }
  const x1 = Math.min(grid.w, x0 + FINE_PER_PARENT);
  const y1 = Math.min(grid.h, y0 + FINE_PER_PARENT);
  const members = new Set<PatchId>();
  const portals: PatchId[] = [];
  let mask = "";
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
    const patch = patchId(x, y);
    const open = passable(profile, patch);
    mask += open ? "1" : "0";
    if (!open) continue;
    members.add(patch);
    if (x === x0 || x === x1 - 1 || y === y0 || y === y1 - 1) portals.push(patch);
  }
  const key = `${px},${py}:${x1},${y1}:${mask}`;
  const cache = cacheFor(grid);
  const hit = retained(cache.topology, key);
  if (hit) return hit;
  const components = new Map<number, PatchId[]>();
  const componentOf = new Map<PatchId, number>();
  for (const patch of members) {
    if (componentOf.has(patch)) continue;
    const component = components.size;
    const queue = [patch];
    componentOf.set(patch, component);
    for (let i = 0; i < queue.length; i++) {
      for (const edge of fineNeighbours(grid, queue[i])) {
        if (!members.has(edge.patch) || componentOf.has(edge.patch) || edge.corners.some(c => !members.has(c))) continue;
        componentOf.set(edge.patch, component);
        queue.push(edge.patch);
      }
    }
    components.set(component, queue);
  }
  const topology: Topology = {
    key, components, portals, members,
    connected: (from, to) => componentOf.has(from) && componentOf.get(from) === componentOf.get(to),
  };
  retain(cache.topology, key, topology, TOPOLOGY_LIMIT);
  return topology;
}

/** Flat-normalized Tobler factor; bounded grades prevent unbounded exponents. */
function edgeCost(profile: TraversalProfile, from: PatchId, to: PatchId, distanceM: number): number {
  const grade = Math.max(-1, Math.min(1, (profile.elevationAt(to) - profile.elevationAt(from)) / distanceM));
  const slope = Math.exp(3.5 * (Math.abs(grade + 0.05) - 0.05));
  return distanceM / ((profile.speedAt(from) + profile.speedAt(to)) / 2) * slope;
}

interface HeapEntry { patch: PatchId; cost: number; priority: number }

/** Immutable heap priorities permit duplicate entries after a better path. */
class Frontier {
  private entries: HeapEntry[] = [];
  get length(): number { return this.entries.length; }
  push(entry: HeapEntry): void {
    const heap = this.entries;
    heap.push(entry);
    let i = heap.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (heap[parent].priority <= entry.priority) break;
      heap[i] = heap[parent];
      i = parent;
    }
    heap[i] = entry;
  }
  pop(): HeapEntry {
    const heap = this.entries;
    const top = heap[0];
    const last = heap.pop()!;
    if (heap.length) {
      let i = 0;
      while (i * 2 + 1 < heap.length) {
        let child = i * 2 + 1;
        if (child + 1 < heap.length && heap[child + 1].priority < heap[child].priority) child++;
        if (heap[child].priority >= last.priority) break;
        heap[i] = heap[child];
        i = child;
      }
      heap[i] = last;
    }
    return top;
  }
}

function searchFine(grid: FineGrid, from: PatchId, profile: TraversalProfile, allowed: (patch: PatchId) => boolean, to?: PatchId): SearchTree {
  const costs = new Map<PatchId, number>([[from, 0]]);
  const previous = new Map<PatchId, PatchId>();
  const frontier = new Frontier();
  frontier.push({ patch: from, cost: 0, priority: 0 });
  while (frontier.length) {
    const current = frontier.pop();
    if (current.cost !== costs.get(current.patch)) continue;
    if (current.patch === to) break;
    for (const edge of fineNeighbours(grid, current.patch)) {
      if (!allowed(edge.patch) || !passable(profile, edge.patch) || edge.corners.some(c => !allowed(c) || !passable(profile, c))) continue;
      const cost = current.cost + edgeCost(profile, current.patch, edge.patch, edge.distanceM);
      if (cost >= (costs.get(edge.patch) ?? Infinity)) continue;
      costs.set(edge.patch, cost);
      previous.set(edge.patch, current.patch);
      frontier.push({ patch: edge.patch, cost, priority: cost });
    }
  }
  return { costs, previous };
}

function treePath(tree: SearchTree, from: PatchId, to: PatchId): PatchId[] {
  const patches = [to];
  for (let patch = to; patch !== from;) {
    patch = tree.previous.get(patch)!;
    patches.push(patch);
  }
  return patches.reverse();
}

export function fineRouteDistanceM(patches: readonly PatchId[]): number {
  let distanceM = 0;
  for (let i = 1; i < patches.length; i++) {
    const from = patchXY(patches[i - 1]);
    const to = patchXY(patches[i]);
    distanceM += Math.hypot(to.x - from.x, to.y - from.y) * PATCH_M;
  }
  return distanceM;
}

/** Bounded oracle/local tool. World routes must use the hierarchy. */
export function findDirectFineRoute(grid: FineGrid, from: PatchId, to: PatchId, profile: TraversalProfile): FineRoute | null {
  if (grid.w * grid.h > DIRECT_PATCH_LIMIT) throw new RangeError("direct fine routing is limited to 65536 patches");
  if (!inGrid(grid, from) || !inGrid(grid, to) || !passable(profile, from) || !passable(profile, to)) return null;
  const tree = searchFine(grid, from, profile, () => true, to);
  const cost = tree.costs.get(to);
  if (cost === undefined) return null;
  const patches = treePath(tree, from, to);
  return { patches, distanceM: fineRouteDistanceM(patches), cost };
}

function localTree(grid: FineGrid, topology: Topology, from: PatchId, profile: TraversalProfile): SearchTree {
  const cache = cacheFor(grid);
  const key = JSON.stringify([topology.key, profile.key]);
  let overlay = retained(cache.overlays, key);
  if (!overlay) {
    overlay = new Map();
    retain(cache.overlays, key, overlay, OVERLAY_LIMIT);
  }
  let tree = overlay.get(from);
  if (!tree) {
    tree = searchFine(grid, from, profile, patch => topology.members.has(patch));
    overlay.set(from, tree);
  }
  return tree;
}

/** Exact portal A*. Without a declared speed bound its heuristic is zero. */
export function findHierarchicalRoute(grid: FineGrid, from: PatchId, to: PatchId, profile: TraversalProfile): FineRoute | null {
  if (!inGrid(grid, from) || !inGrid(grid, to) || !passable(profile, from) || !passable(profile, to)) return null;
  if (from === to) return { patches: [from], distanceM: 0, cost: 0 };
  const start = parentXY(from);
  const goal = parentXY(to);
  const x0 = Math.max(0, Math.min(start.x, goal.x) - PARENT_MARGIN);
  const y0 = Math.max(0, Math.min(start.y, goal.y) - PARENT_MARGIN);
  const x1 = Math.min(Math.ceil(grid.w / FINE_PER_PARENT) - 1, Math.max(start.x, goal.x) + PARENT_MARGIN);
  const y1 = Math.min(Math.ceil(grid.h / FINE_PER_PARENT) - 1, Math.max(start.y, goal.y) + PARENT_MARGIN);
  const topologies = new Map<string, Topology>();
  const topologyAt = (px: number, py: number) => {
    const key = `${px},${py}`;
    let topology = topologies.get(key);
    if (!topology) { topology = topologyFor(grid, px, py, profile); topologies.set(key, topology); }
    return topology;
  };
  const costs = new Map<PatchId, number>([[from, 0]]);
  const previous = new Map<PatchId, { from: PatchId; patches: PatchId[] }>();
  const frontier = new Frontier();
  // Every edge costs at least length / maxSpeed * exp(-0.175): the
  // normalized Tobler factor reaches its minimum at a 5 percent descent.
  // Euclidean remaining distance is no greater than any route length.
  // A caller supplying maxSpeed below an actual speed violates this bound.
  const lowerCostPerM = profile.maxSpeed !== undefined && Number.isFinite(profile.maxSpeed) && profile.maxSpeed > 0
    ? Math.exp(-0.175) / profile.maxSpeed : 0;
  const destination = patchXY(to);
  const heuristic = (patch: PatchId) => {
    const at = patchXY(patch);
    return Math.hypot(at.x - destination.x, at.y - destination.y) * PATCH_M * lowerCostPerM;
  };
  frontier.push({ patch: from, cost: 0, priority: heuristic(from) });
  while (frontier.length) {
    const current = frontier.pop();
    if (current.cost !== costs.get(current.patch)) continue;
    if (current.patch === to) {
      const segments: PatchId[][] = [];
      for (let patch = to; patch !== from;) {
        const edge = previous.get(patch)!;
        segments.push(edge.patches.slice(1));
        patch = edge.from;
      }
      const patches = [from, ...segments.reverse().flat()];
      return { patches, distanceM: fineRouteDistanceM(patches), cost: current.cost };
    }
    const parent = parentXY(current.patch);
    const topology = topologyAt(parent.x, parent.y);
    const tree = localTree(grid, topology, current.patch, profile);
    const relax = (patch: PatchId, addedCost: number, path: () => PatchId[]) => {
      const cost = current.cost + addedCost;
      if (cost >= (costs.get(patch) ?? Infinity)) return;
      costs.set(patch, cost);
      previous.set(patch, { from: current.patch, patches: path() });
      frontier.push({ patch, cost, priority: cost + heuristic(patch) });
    };
    const targets = parent.x === goal.x && parent.y === goal.y ? [...topology.portals, to] : topology.portals;
    for (const portal of targets) {
      const cost = tree.costs.get(portal);
      if (cost !== undefined) relax(portal, cost, () => treePath(tree, current.patch, portal));
    }
    for (const edge of fineNeighbours(grid, current.patch)) {
      const next = parentXY(edge.patch);
      if (next.x === parent.x && next.y === parent.y) continue;
      if (next.x < x0 || next.x > x1 || next.y < y0 || next.y > y1) continue;
      if (!passable(profile, edge.patch) || edge.corners.some(c => !passable(profile, c))) continue;
      relax(edge.patch, edgeCost(profile, current.patch, edge.patch, edge.distanceM), () => [current.patch, edge.patch]);
    }
  }
  return null;
}
