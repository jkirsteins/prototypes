/**
 * Drainage on a grid: fill every depression so water always has a way
 * down, point each cell at its steepest neighbour, and sum what drains
 * through it. Grid-generic, so the erosion loop uses it on the 1.2 km
 * grid and the world solve on the 300 m grid. Only arithmetic and
 * comparisons: the result must be the same in every engine.
 */
import { MinHeap } from "./heap";

/** Eight neighbours, east first and clockwise, and their distances in cells. */
export const DX8 = new Int8Array([1, 1, 0, -1, -1, -1, 0, 1]);
export const DY8 = new Int8Array([0, 1, 1, 1, 0, -1, -1, -1]);
export const DIST8 = new Float32Array([1, Math.sqrt(2), 1, Math.sqrt(2), 1, Math.sqrt(2), 1, Math.sqrt(2)]);
export const NO_FLOW = 255;

export function receiverOf(i: number, dir: number, w: number): number {
  return i + DY8[dir] * w + DX8[dir];
}

/**
 * Priority-flood (Barnes 2014): from the sources and the edges outward in
 * height order, every cell is raised to at least its lowest already
 * flooded neighbour plus an epsilon, so the filled surface has no pit
 * and no flat, and a flow direction exists everywhere.
 */
export function priorityFlood(height: Float32Array, w: number, h: number, isSource: Uint8Array, epsM = 0.001): Float32Array {
  const n = w * h;
  const filled = new Float32Array(height);
  const closed = new Uint8Array(n);
  const heap = new MinHeap(n);
  for (let i = 0; i < n; i++) {
    const x = i % w;
    const y = (i - x) / w;
    if (isSource[i] || x === 0 || y === 0 || x === w - 1 || y === h - 1) {
      closed[i] = 1;
      heap.push(i, filled[i]);
    }
  }
  while (heap.size > 0) {
    const c = heap.pop();
    const cx = c % w;
    const cy = (c - cx) / w;
    const fc = filled[c];
    for (let k = 0; k < 8; k++) {
      const nx = cx + DX8[k];
      const ny = cy + DY8[k];
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const nb = ny * w + nx;
      if (closed[nb]) continue;
      closed[nb] = 1;
      // A source keeps its own height: the sea does not rise to meet the land.
      if (!isSource[nb] && filled[nb] < fc + epsM) filled[nb] = fc + epsM;
      heap.push(nb, filled[nb]);
    }
  }
  return filled;
}

/** Steepest descent among eight neighbours on the filled surface; sinks and cells with nothing lower get NO_FLOW. */
export function flowDirections(filled: Float32Array, w: number, h: number, isSink: Uint8Array): Uint8Array {
  const n = w * h;
  const dir = new Uint8Array(n).fill(NO_FLOW);
  for (let i = 0; i < n; i++) {
    if (isSink[i]) continue;
    const x = i % w;
    const y = (i - x) / w;
    const fi = filled[i];
    let best = NO_FLOW;
    let bestSlope = 0;
    for (let k = 0; k < 8; k++) {
      const nx = x + DX8[k];
      const ny = y + DY8[k];
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const slope = (fi - filled[ny * w + nx]) / DIST8[k];
      if (slope > bestSlope) {
        bestSlope = slope;
        best = k;
      }
    }
    dir[i] = best;
  }
  return dir;
}

/**
 * Upslope totals in topological order (Kahn): a cell is emitted once every
 * cell draining into it has been, so `order` reversed visits receivers
 * before their contributors. `count` includes the cell itself; `flow` sums
 * `weight`, or `count` again when weight is null.
 */
export function accumulate(dir: Uint8Array, w: number, h: number, weight: Float32Array | null): { count: Uint32Array; flow: Float32Array; order: Int32Array } {
  const n = w * h;
  const indegree = new Uint8Array(n);
  for (let i = 0; i < n; i++) if (dir[i] !== NO_FLOW) indegree[receiverOf(i, dir[i], w)]++;
  const count = new Uint32Array(n).fill(1);
  const flow = new Float32Array(n);
  for (let i = 0; i < n; i++) flow[i] = weight ? weight[i] : 1;
  const order = new Int32Array(n);
  let head = 0;
  let tail = 0;
  for (let i = 0; i < n; i++) if (indegree[i] === 0) order[tail++] = i;
  while (head < tail) {
    const c = order[head++];
    if (dir[c] === NO_FLOW) continue;
    const r = receiverOf(c, dir[c], w);
    count[r] += count[c];
    flow[r] += flow[c];
    if (--indegree[r] === 0) order[tail++] = r;
  }
  return { count, flow, order };
}

/**
 * Filled cells grouped 4-connected into depressions. A depression at
 * least `minDepthM` deep somewhere is a lake: its cells are marked and
 * their height becomes the lake surface, the lowest filled value in the
 * depression. A shallower one is ground: its cells are raised to the
 * filled surface so the drainage over it is the drainage the flood found.
 */
export function lakeComponents(height: Float32Array, filled: Float32Array, w: number, h: number, isSea: Uint8Array, minDepthM: number): Uint8Array {
  const n = w * h;
  const lake = new Uint8Array(n);
  const seen = new Uint8Array(n);
  const stack: number[] = [];
  const cells: number[] = [];
  for (let i = 0; i < n; i++) {
    if (seen[i] || isSea[i] || filled[i] - height[i] <= 0.01) continue;
    stack.length = 0;
    cells.length = 0;
    stack.push(i);
    seen[i] = 1;
    let maxDepth = 0;
    let surface = Infinity;
    while (stack.length) {
      const c = stack.pop()!;
      cells.push(c);
      const depth = filled[c] - height[c];
      if (depth > maxDepth) maxDepth = depth;
      if (filled[c] < surface) surface = filled[c];
      const x = c % w;
      const y = (c - x) / w;
      const around = [x > 0 ? c - 1 : -1, x < w - 1 ? c + 1 : -1, y > 0 ? c - w : -1, y < h - 1 ? c + w : -1];
      for (const nb of around) {
        if (nb < 0 || seen[nb] || isSea[nb] || filled[nb] - height[nb] <= 0.01) continue;
        seen[nb] = 1;
        stack.push(nb);
      }
    }
    if (maxDepth >= minDepthM) for (const c of cells) { lake[c] = 1; height[c] = surface; }
    else for (const c of cells) height[c] = filled[c];
  }
  return lake;
}

/** Sea is what lies at or below zero and is 4-connected to an edge cell at or below zero; a drowned hollow inland is not sea. */
export function connectedSea(height: Float32Array, w: number, h: number): Uint8Array {
  const n = w * h;
  const sea = new Uint8Array(n);
  const queue = new Int32Array(n);
  let head = 0;
  let tail = 0;
  for (let i = 0; i < n; i++) {
    const x = i % w;
    const y = (i - x) / w;
    if ((x === 0 || y === 0 || x === w - 1 || y === h - 1) && height[i] <= 0) {
      sea[i] = 1;
      queue[tail++] = i;
    }
  }
  while (head < tail) {
    const c = queue[head++];
    const x = c % w;
    const y = (c - x) / w;
    const around = [x > 0 ? c - 1 : -1, x < w - 1 ? c + 1 : -1, y > 0 ? c - w : -1, y < h - 1 ? c + w : -1];
    for (const nb of around) {
      if (nb < 0 || sea[nb] || height[nb] > 0) continue;
      sea[nb] = 1;
      queue[tail++] = nb;
    }
  }
  return sea;
}
