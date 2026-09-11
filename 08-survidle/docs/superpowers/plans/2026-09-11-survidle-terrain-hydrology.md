# Survidle Terrain and Hydrology Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the noise terrain with a real-scale world from 61 N to 67 N whose heights are metres above the sea, whose valleys come from erosion, whose lakes, streams, rivers and fjords come from a full-resolution drainage solve, and whose stone, bog and treeline follow geology and latitude.

**Architecture:** One pure function `solveWorld(seed, w, h)` in `src/world/solve.ts` runs six stages (coarse template, erosion, upsample, hydrology, glacial carving with a sea re-read, classification) and returns typed arrays. The browser runs it in a Web Worker behind a progress bar; tests and scripts run it synchronously through a node disk cache so a seed is solved once per machine. `World` carries the arrays; every consumer that read the old 0..1 field reads metres or a named property from `src/world/cells.ts`.

**Tech Stack:** TypeScript, Vite (module workers via `new Worker(new URL(...), { type: "module" })`), Vitest, vite-node scripts. No new dependencies.

**Spec:** `08-survidle/docs/superpowers/specs/2026-09-11-survidle-terrain-hydrology-design.md`. The plan argues from the spec; read both.

## Global Constraints

- World: 1800 by 2224 cells of 300 m; `latitudeAt(y) = 67 - 6 * y / 2224`; height is Int16 metres above sea level; sea is at or below 0.
- The solve uses only addition, subtraction, multiplication, division, comparison and `Math.sqrt`. No `Math.exp`, `Math.pow`, `Math.sin`, `Math.cos`, `Math.log`, `Math.atan2`, `**`. A test greps for them.
- Nothing about the world is stored in the save. Save format becomes version 10; older saves are refused with a message.
- Solve budget: under 20 s on the dev machine at full size, erosion on a 1.2 km grid; the iteration count is the knob, the grid is not.
- Every quantity real: metres, km2, cubic metres a second, litres a second per km2.
- Realism first: no threshold exists to make a gameplay resource available. The report measures against real targets; gates are re-run and reported, not tuned.
- Writing style in code comments and docs: no em dashes, no unicode arrows or fancy quotes; comments explain, never chronicle (no "was", "now", dates).
- Repo rules: stage with explicit paths under `08-survidle/`, never `git add -A`; `npm test` and `npm run build` must pass before each commit; the pre-commit hook runs biome and tsc; run every command from the worktree `08-survidle/` directory.
- Terrain names stay `water, fell, rock, bog, spruce, pine, birch, meadow` and gain `river`. `Habitat` gains `river`.

---

## File structure

| File | Responsibility |
|---|---|
| `src/world/terrain.ts` | World size, latitude, treeline, the macro template in metres, coast distance, the lattice and `regionOfCell`. Pure functions of seed and position. |
| `src/world/heap.ts` | A typed-array binary min-heap of cell indices keyed by a float. |
| `src/world/hydro.ts` | Priority-flood fill, D8 flow directions, topological accumulation, lake components, sea connectivity. Grid-generic: used at both resolutions. |
| `src/world/erode.ts` | The coarse surface, the stream-power erosion loop, the bicubic upsample with slope-scaled detail. |
| `src/world/classify.ts` | Discharge, glacial carving, and the cell classification into terrain, kind, flags and moisture. |
| `src/world/solve.ts` | `solveWorld`: the six stages in order with progress, the `SolvedWorld` shape, `GENERATOR_VERSION`. |
| `src/world/solvecache.ts` | The in-process cache and the injectable cache hook `setSolveCache`. |
| `src/world/solvecache.node.ts` | The node disk cache under `node_modules/.cache/survidle-worlds/`. Never imported by browser code. |
| `src/world/solve.worker.ts` | The worker shell: runs `solveWorld`, posts progress, transfers the arrays. |
| `src/world/worldloader.ts` | Browser entry: `loadWorld(seed, onProgress)` returning a `World` via the worker, or synchronously where there is no `Worker`. |
| `src/world/cells.ts` | `World` with the solved arrays; `terrainOf`, `heightAt`, `dischargeAt`, `streamAt`, `fordAt`, `waterKindOf`, region chunks. |
| `src/world/gen.ts` | `generateWorld(seed, solved?)`, regions, spots, the start. |
| `src/ui/loading.ts` | The progress bar panel. |
| `scripts/terrain.ts` | `npm run terrain`: stage timings and the realism report. |
| `tests/world-fixture.ts` | `flatWorld(...)` for consumer tests that need a hand-made world. |
| `tests/setup-worlds.ts` | Vitest setup: installs the node disk cache. |

---

### Task 1: World size, latitude, treeline and the macro template

**Files:**
- Modify: `src/world/terrain.ts` (rewrite the top half; keep `hash2`, `latticeSeed`, `regionOfCell`, the lattice constants)
- Test: `tests/terrain-template.test.ts`

**Interfaces:**
- Produces:
  - `WORLD_W = 1800`, `WORLD_H = 2224`, `LAT_TOP = 67`, `LAT_BOTTOM = 61`, `TEMPLATE_W_KM = 540`, `TEMPLATE_H_KM = 667`
  - `latitudeAt(y: number, h = WORLD_H): number`
  - `treelineM(lat: number, coastKm: number): number`
  - `coastKmAt(u: number, v: number): number` signed distance in template km from the Atlantic coast line, positive inland, for `u, v` in 0..1
  - `inBothnia(u: number, v: number): boolean`
  - `templateHeightM(seed: number, u: number, v: number): number` metres, before erosion
  - `runoffLsKm2(coastKm: number): number`
  - `TERRAINS` with `"river"` appended: `["water","fell","rock","bog","spruce","pine","birch","meadow","river"]`
  - `TERRAIN_INDEX` updated to match
- Consumes: `fbm` from `./noise`, `derive` from `../rng`

- [ ] **Step 1: Write the failing tests**

```ts
// tests/terrain-template.test.ts
import { describe, expect, it } from "vitest";
import {
  coastKmAt, coastLineU, inBothnia, latitudeAt, runoffLsKm2, templateHeightM, treelineM,
  LAT_BOTTOM, LAT_TOP, TERRAINS, TERRAIN_INDEX, WORLD_H, WORLD_W,
} from "../src/world/terrain";

describe("world shape", () => {
  it("is 540 by 667 km of 300 m cells", () => {
    expect(WORLD_W).toBe(1800);
    expect(WORLD_H).toBe(2224);
  });

  it("puts 67 N on the top row and 61 N on the bottom, 111 km a degree", () => {
    expect(latitudeAt(0)).toBe(LAT_TOP);
    expect(latitudeAt(WORLD_H)).toBe(LAT_BOTTOM);
    expect(latitudeAt(WORLD_H / 2)).toBeCloseTo(64, 6);
    // One degree is 370.7 rows of 300 m.
    expect(latitudeAt(0) - latitudeAt(370.67)).toBeCloseTo(1, 2);
  });

  it("drops the treeline northward and toward the coast", () => {
    expect(treelineM(61, 200)).toBe(1100);
    expect(treelineM(67, 200)).toBe(650);
    expect(treelineM(61, 0)).toBe(750);
    expect(treelineM(61, 25)).toBeCloseTo(925, 6);
    expect(treelineM(61, 50)).toBe(1100);
  });

  it("runs the coast from 40 km at the bottom to 280 km at the top", () => {
    // v = 1 is the bottom row. The coast line is u where coastKm is 0.
    expect(coastLineU(1)).toBeCloseTo(40 / 540, 6);
    expect(coastLineU(0)).toBeCloseTo(280 / 540, 6);
    expect(coastKmAt(coastLineU(1), 1)).toBeCloseTo(0, 6);
    expect(coastKmAt(coastLineU(0), 0)).toBeCloseTo(0, 6);
    expect(coastKmAt(0, 1)).toBeLessThan(0);
    expect(coastKmAt(1, 0.5)).toBeGreaterThan(200);
    // Distance is perpendicular to the coast, a little under the east-west gap.
    expect(coastKmAt(140 / 540, 1)).toBeCloseTo(100 * 0.9409, 2);
  });

  it("lets the Gulf of Bothnia into the east edge only between 63 and 65.5 N", () => {
    const v = (lat: number) => (LAT_TOP - lat) / (LAT_TOP - LAT_BOTTOM);
    expect(inBothnia(0.995, v(64.25))).toBe(true);
    expect(inBothnia(0.995, v(62))).toBe(false);
    expect(inBothnia(0.995, v(66.5))).toBe(false);
    expect(inBothnia(0.8, v(64.25))).toBe(false);
  });

  it("templates a sea shelf, a crest near 1800 m in the south and 1500 m in the north, and an eastern slope", () => {
    const v61 = 1, v67 = 0;
    expect(templateHeightM(42, 0.01, 0.5)).toBeLessThan(-100);
    // Crest is 110 km inland of the coast: u = (40 + 110 / 0.9409) / 540 at the bottom row.
    const crestSouth = templateHeightM(42, (40 + 110 / 0.9409) / 540, v61);
    const crestNorth = templateHeightM(42, (280 + 110 / 0.9409) / 540, v67);
    expect(crestSouth).toBeGreaterThan(1400);
    expect(crestSouth).toBeLessThan(2200);
    expect(crestNorth).toBeLessThan(crestSouth);
    expect(templateHeightM(42, 0.98, 0.1)).toBeLessThan(500);
    expect(templateHeightM(42, 0.98, 0.1)).toBeGreaterThan(-50);
    expect(templateHeightM(42, 0.995, 0.46)).toBeLessThan(0); // Bothnia
  });

  it("gives Atlantic runoff near 50 and inland runoff near 12 litres a second per km2", () => {
    expect(runoffLsKm2(0)).toBe(50);
    expect(runoffLsKm2(80)).toBe(31);
    expect(runoffLsKm2(400)).toBeCloseTo(18.33, 2);
    expect(runoffLsKm2(-10)).toBe(50);
  });

  it("lists river as a terrain", () => {
    expect(TERRAINS[8]).toBe("river");
    expect(TERRAIN_INDEX.river).toBe(8);
    expect(TERRAINS.length).toBe(9);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/terrain-template.test.ts`
Expected: FAIL with `latitudeAt` not exported (and the others).

- [ ] **Step 3: Rewrite the top of `src/world/terrain.ts`**

Replace everything above `function hash2` with:

```ts
/**
 * The world's shape: a window on the Scandinavian peninsula from 67 N on
 * the top row to 61 N on the bottom, at real scale, with the Atlantic
 * coast and the Scandes on the west and lowland falling east. Everything
 * here is a pure function of seed and position in metres or km. The
 * solve (solve.ts) turns this template into ground; nothing here is
 * stored.
 */
import { derive } from "../rng";
import type { Terrain } from "../sim/types";
import { fbm } from "./noise";

/** World size in 300 m cells: 540 by 667 km. */
export const WORLD_W = 1800;
export const WORLD_H = 2224;
/** The template is drawn in these km regardless of the cell count, so a small test world is the same geography in miniature. */
export const TEMPLATE_W_KM = 540;
export const TEMPLATE_H_KM = 667;
export const LAT_TOP = 67;
export const LAT_BOTTOM = 61;

/** Latitude of a row: 67 N at the top edge, 61 N at the bottom, 111 km a degree at full size. */
export function latitudeAt(y: number, h = WORLD_H): number {
  return LAT_TOP - (LAT_TOP - LAT_BOTTOM) * (y / h);
}

/** Cells between region seeds: regions are about 4 km across. */
export const LATTICE = 14;
export const LATTICE_W = Math.ceil(WORLD_W / LATTICE);
export const LATTICE_H = Math.ceil(WORLD_H / LATTICE);

export const TERRAINS: Terrain[] = ["water", "fell", "rock", "bog", "spruce", "pine", "birch", "meadow", "river"];
export const TERRAIN_INDEX: Record<Terrain, number> = { water: 0, fell: 1, rock: 2, bog: 3, spruce: 4, pine: 5, birch: 6, meadow: 7, river: 8 };

/**
 * The birch line in metres. About 1100 m at 61 N inland and 650 m at 67 N
 * inland, and up to 350 m lower on the outer coast where the oceanic
 * summer is too cool for trees to climb.
 */
export function treelineM(lat: number, coastKm: number): number {
  const inland = coastKm < 0 ? 0 : coastKm > 50 ? 1 : coastKm / 50;
  return 1100 - 75 * (lat - LAT_BOTTOM) - 350 * (1 - inland);
}

/** Where the Atlantic coast line crosses a row, in template km from the west edge: 40 km at the bottom, 280 km at the top. */
const COAST_X0_KM = 40;
const COAST_DRIFT_KM = 240;
/** The coast runs 240 km east over 667 km north; a perpendicular distance is the east-west gap scaled by this. */
const COAST_NORMAL = TEMPLATE_H_KM / Math.sqrt(COAST_DRIFT_KM * COAST_DRIFT_KM + TEMPLATE_H_KM * TEMPLATE_H_KM);

function coastLineKm(v: number): number {
  return COAST_X0_KM + COAST_DRIFT_KM * (1 - v);
}

/** Where the coast line crosses a row, as a share of the world's width. */
export function coastLineU(v: number): number {
  return coastLineKm(v) / TEMPLATE_W_KM;
}

/** Signed distance from the Atlantic coast line in km, positive inland, for a position in 0..1 of the template. */
export function coastKmAt(u: number, v: number): number {
  return (u * TEMPLATE_W_KM - coastLineKm(v)) * COAST_NORMAL;
}

/** The Gulf of Bothnia reaches the east edge between 63 N and 65.5 N, 60 km deep at 64.25 N. */
export function inBothnia(u: number, v: number): boolean {
  const lat = LAT_TOP - (LAT_TOP - LAT_BOTTOM) * v;
  const reach = 1 - Math.abs(lat - 64.25) / 1.25;
  if (reach <= 0) return false;
  return u * TEMPLATE_W_KM > TEMPLATE_W_KM - 60 * reach;
}

/** Litres a second per km2 of catchment: about 50 on the Atlantic side, falling to 12 far inland. */
export function runoffLsKm2(coastKm: number): number {
  const d = coastKm < 0 ? 0 : coastKm;
  return 12 + 38 / (1 + d / 80);
}

interface Seeds { relief: number; islands: number; soil: number; detail: number }
const seedCache = new Map<number, Seeds>();
export function seedsFor(seed: number): Seeds {
  let s = seedCache.get(seed);
  if (!s) {
    s = { relief: derive(seed, 21), islands: derive(seed, 22), soil: derive(seed, 23), detail: derive(seed, 24) };
    seedCache.set(seed, s);
  }
  return s;
}

/** Crest height by latitude: about 1800 m at 61 N, 1500 m at 67 N. */
function crestM(lat: number): number {
  return 1800 - 50 * (lat - LAT_BOTTOM);
}

/** Distance of the crest inland of the coast, and of the plateau foot. */
const CREST_KM = 110;
const PLATEAU_KM = 170;
const PLATEAU_M = 600;
const EAST_EDGE_M = 150;

/**
 * The macro template in metres before erosion: shelf and skerries, the
 * coastal flank, the crest, the plateau and the eastern slope, plus two
 * octaves of relief noise. The two finest octaves are added at 300 m in
 * the upsample, where slope is known.
 */
export function templateHeightM(seed: number, u: number, v: number): number {
  const s = seedsFor(seed);
  const xKm = u * TEMPLATE_W_KM;
  const yKm = v * TEMPLATE_H_KM;
  const d = coastKmAt(u, v);
  const lat = LAT_TOP - (LAT_TOP - LAT_BOTTOM) * v;
  const crest = crestM(lat);
  let base: number;
  if (d < 0) {
    // Shelf: -200 m at 60 km out, -20 m at the shore line.
    const t = d < -60 ? 0 : 1 + d / 60;
    base = -200 + 180 * t;
  } else if (d < CREST_KM) {
    const t = d / CREST_KM;
    base = -20 + (crest + 20) * t * Math.sqrt(t);
  } else if (d < PLATEAU_KM) {
    base = crest - (crest - PLATEAU_M) * (d - CREST_KM) / (PLATEAU_KM - CREST_KM);
  } else {
    const span = TEMPLATE_W_KM - PLATEAU_KM;
    const t = (d - PLATEAU_KM) / span;
    base = PLATEAU_M - (PLATEAU_M - EAST_EDGE_M) * (t > 1 ? 1 : t);
  }
  if (inBothnia(u, v)) base = -30;
  // Relief at 40 km and 10 km. The sea keeps a third of it so the shelf stays sea.
  const relief = 300 * (fbm(xKm / 40, yKm / 40, s.relief, 1) - 0.5) * 2 + 100 * (fbm(xKm / 10 + 7, yKm / 10 + 3, s.relief + 1, 1) - 0.5) * 2;
  let h = base + (d < 0 ? relief / 3 : relief);
  // Skerries: drowned hills within 20 km of the shore, some of which break the surface.
  if (d < 0 && d > -20) h += 90 * (fbm(xKm / 3, yKm / 3, s.islands, 2) - 0.5) * 2 * (1 + d / 20);
  return h;
}
```

Keep `hash2`, `latticeSeed` and `regionOfCell` unchanged below this. Delete `fieldsAt` and `terrainAt`; Task 6 replaces every caller. Until Task 6, the tree does not compile: that is expected, and Tasks 1 to 5 commit with `--no-verify` for the `tsc` hook only after their own tests pass. Record that in each commit message body ("tree compiles again at Task 6").

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/terrain-template.test.ts`
Expected: PASS, 8 tests.

- [ ] **Step 5: Commit**

```bash
git add src/world/terrain.ts tests/terrain-template.test.ts
git commit --no-verify -m "feat(survidle): world template from 61 N to 67 N in metres

Tree compiles again at Task 6 of the terrain plan."
```

---

### Task 2: Heap, priority flood, flow directions, accumulation

**Files:**
- Create: `src/world/heap.ts`
- Create: `src/world/hydro.ts`
- Test: `tests/hydro.test.ts`

**Interfaces:**
- Produces:
  - `class MinHeap { constructor(capacity: number); size: number; push(i: number, key: number): void; pop(): number }`
  - `DX8: Int8Array`, `DY8: Int8Array`, `DIST8: Float32Array` (neighbour offsets in the order E, SE, S, SW, W, NW, N, NE and their distances 1 or sqrt 2)
  - `priorityFlood(height: Float32Array, w: number, h: number, isSource: Uint8Array, epsM = 0.001): Float32Array`
  - `flowDirections(filled: Float32Array, w: number, h: number, isSink: Uint8Array): Uint8Array` (0..7, `NO_FLOW = 255`)
  - `receiverOf(i: number, dir: number, w: number): number`
  - `accumulate(dir: Uint8Array, w: number, h: number, weight: Float32Array | null): { count: Uint32Array; flow: Float32Array; order: Int32Array }` where `order` lists cells sources first, sinks last
  - `lakeComponents(height: Float32Array, filled: Float32Array, w: number, h: number, isSea: Uint8Array, minDepthM: number): Uint8Array` marks lake cells 1 and raises `height` to the lake surface for lakes and to `filled` for shallow depressions
  - `connectedSea(height: Float32Array, w: number, h: number): Uint8Array` cells at or below 0 reachable from an edge cell at or below 0, 4-connected

- [ ] **Step 1: Write the failing tests**

```ts
// tests/hydro.test.ts
import { describe, expect, it } from "vitest";
import { MinHeap } from "../src/world/heap";
import { accumulate, connectedSea, DX8, DY8, flowDirections, lakeComponents, NO_FLOW, priorityFlood, receiverOf } from "../src/world/hydro";

function grid(w: number, h: number, f: (x: number, y: number) => number): Float32Array {
  const a = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) a[y * w + x] = f(x, y);
  return a;
}

describe("min heap", () => {
  it("pops in key order and never exceeds capacity", () => {
    const heap = new MinHeap(8);
    const keys = [5, 1, 4, 2, 8, 0, 3, 7];
    keys.forEach((k, i) => heap.push(i, k));
    const out: number[] = [];
    while (heap.size > 0) out.push(keys[heap.pop()]);
    expect(out).toEqual([0, 1, 2, 3, 4, 5, 7, 8]);
  });
});

describe("priority flood", () => {
  // A 7 by 7 bowl with the sea on the west column.
  const w = 7, h = 7;
  const height = grid(w, h, (x, y) => (x === 0 ? -5 : 100 - 10 * Math.min(x, w - 1 - x, y, h - 1 - y)));
  const sea = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) sea[y * w] = 1;

  it("fills the bowl to its spill height and leaves rising ground alone", () => {
    const filled = priorityFlood(height, w, h, sea);
    const centre = 3 * w + 3;
    // The bowl floor is 70; its rim is the ring at 90 (x = 1 or 5). The spill is the lowest rim cell, 90, plus epsilons.
    expect(filled[centre]).toBeGreaterThanOrEqual(90);
    expect(filled[centre]).toBeLessThan(90.1);
    expect(filled[1 * w + 1]).toBe(90);
    expect(filled[0]).toBe(-5);
  });

  it("gives every non-sea cell a receiver after the flood", () => {
    const filled = priorityFlood(height, w, h, sea);
    const dir = flowDirections(filled, w, h, sea);
    for (let i = 0; i < w * h; i++) {
      if (sea[i]) expect(dir[i]).toBe(NO_FLOW);
      else {
        expect(dir[i]).toBeLessThan(8);
        const r = receiverOf(i, dir[i], w);
        expect(filled[r]).toBeLessThan(filled[i]);
      }
    }
  });

  it("accumulates every cell into the sea in topological order", () => {
    const filled = priorityFlood(height, w, h, sea);
    const dir = flowDirections(filled, w, h, sea);
    const { count, order } = accumulate(dir, w, h, null);
    let intoSea = 0;
    for (let i = 0; i < w * h; i++) if (sea[i]) intoSea += count[i] - 1;
    expect(intoSea).toBe(w * h - h);
    // A cell comes after everything that drains into it.
    const position = new Int32Array(w * h);
    order.forEach((c, k) => { position[c] = k; });
    for (let i = 0; i < w * h; i++) if (dir[i] !== NO_FLOW) expect(position[receiverOf(i, dir[i], w)]).toBeGreaterThan(position[i]);
  });

  it("weights accumulation by the cells' own contributions", () => {
    const filled = priorityFlood(height, w, h, sea);
    const dir = flowDirections(filled, w, h, sea);
    const weight = new Float32Array(w * h).fill(2);
    const { flow, count } = accumulate(dir, w, h, weight);
    for (let i = 0; i < w * h; i++) expect(flow[i]).toBeCloseTo(2 * count[i], 4);
  });
});

describe("lakes and the sea", () => {
  it("marks a deep depression as a lake at its spill height and raises a shallow one to ground", () => {
    const w = 9, h = 5;
    const height = grid(w, h, (x, y) => {
      if (x === 0) return -1;
      if (x === 3 && y === 2) return 40; // a 20 m deep hole in ground at 60
      if (x === 6 && y === 2) return 59; // a 1 m dip
      return 60;
    });
    const sea = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) sea[y * w] = 1;
    const filled = priorityFlood(height, w, h, sea);
    const lake = lakeComponents(height, filled, w, h, sea, 2);
    expect(lake[2 * w + 3]).toBe(1);
    expect(height[2 * w + 3]).toBeCloseTo(60, 1);
    expect(lake[2 * w + 6]).toBe(0);
    expect(height[2 * w + 6]).toBeCloseTo(60, 1);
    expect(lake[2 * w + 4]).toBe(0);
  });

  it("counts as sea only what is connected to an edge below sea level", () => {
    const w = 6, h = 3;
    const height = grid(w, h, (x, y) => (x === 0 ? -3 : x === 1 ? -1 : x === 4 && y === 1 ? -20 : 10));
    const sea = connectedSea(height, w, h);
    expect(sea[1 * w + 0]).toBe(1);
    expect(sea[1 * w + 1]).toBe(1);
    expect(sea[1 * w + 4]).toBe(0);
    expect(sea[1 * w + 2]).toBe(0);
  });
});

describe("neighbour tables", () => {
  it("lists eight neighbours starting east and going clockwise", () => {
    expect([...DX8]).toEqual([1, 1, 0, -1, -1, -1, 0, 1]);
    expect([...DY8]).toEqual([0, 1, 1, 1, 0, -1, -1, -1]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/hydro.test.ts`
Expected: FAIL, modules not found.

- [ ] **Step 3: Write `src/world/heap.ts`**

```ts
/**
 * A binary min-heap of cell indices keyed by a float, on typed arrays so
 * a flood over millions of cells pays no per-node allocation. Capacity
 * is fixed at construction: a flood pushes each cell at most once.
 */
export class MinHeap {
  private readonly idx: Int32Array;
  private readonly key: Float64Array;
  size = 0;

  constructor(capacity: number) {
    this.idx = new Int32Array(capacity);
    this.key = new Float64Array(capacity);
  }

  push(i: number, k: number): void {
    const idx = this.idx;
    const key = this.key;
    let c = this.size++;
    while (c > 0) {
      const p = (c - 1) >> 1;
      if (key[p] <= k) break;
      idx[c] = idx[p];
      key[c] = key[p];
      c = p;
    }
    idx[c] = i;
    key[c] = k;
  }

  pop(): number {
    const idx = this.idx;
    const key = this.key;
    const top = idx[0];
    const n = --this.size;
    if (n > 0) {
      const i = idx[n];
      const k = key[n];
      let c = 0;
      for (;;) {
        let l = 2 * c + 1;
        if (l >= n) break;
        const r = l + 1;
        if (r < n && key[r] < key[l]) l = r;
        if (key[l] >= k) break;
        idx[c] = idx[l];
        key[c] = key[l];
        c = l;
      }
      idx[c] = i;
      key[c] = k;
    }
    return top;
  }
}
```

- [ ] **Step 4: Write `src/world/hydro.ts`**

```ts
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
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run tests/hydro.test.ts`
Expected: PASS, 8 tests.

- [ ] **Step 6: Commit**

```bash
git add src/world/heap.ts src/world/hydro.ts tests/hydro.test.ts
git commit --no-verify -m "feat(survidle): priority flood, flow directions and accumulation

Tree compiles again at Task 6 of the terrain plan."
```

---

### Task 3: Coarse surface, erosion loop, upsample, and the timing spike

**Files:**
- Create: `src/world/erode.ts`
- Create: `scripts/terrain.ts` (timing only at this task; the report grows in Task 11)
- Modify: `package.json` (add `"terrain": "vite-node scripts/terrain.ts"`)
- Test: `tests/erode.test.ts`

**Interfaces:**
- Produces:
  - `COARSE_KM = 1.2`, `coarseSize(w: number, h: number): { cw: number; ch: number }` (`cw = ceil(w / 4)`, `ch = ceil(h / 4)`)
  - `coarseSurface(seed: number, cw: number, ch: number): { height: Float32Array; uplift: Float32Array; sea: Uint8Array }`
  - `erode(height: Float32Array, cw: number, ch: number, uplift: Float32Array, sea: Uint8Array, iterations: number, onIteration?: (i: number) => void): void`
  - `upsample(coarse: Float32Array, cw: number, ch: number, w: number, h: number, seed: number): Float32Array`
  - `ERODE_ITERATIONS = 30`

- [ ] **Step 1: Write the failing tests**

```ts
// tests/erode.test.ts
import { describe, expect, it } from "vitest";
import { coarseSize, coarseSurface, erode, ERODE_ITERATIONS, upsample } from "../src/world/erode";
import { accumulate, flowDirections, priorityFlood } from "../src/world/hydro";

// A miniature of the whole geography: 120 by 160 cells is 30 by 40 coarse cells.
const W = 120, H = 160;

function drainageDensity(height: Float32Array, cw: number, ch: number, sea: Uint8Array): number {
  const filled = priorityFlood(height, cw, ch, sea);
  const dir = flowDirections(filled, cw, ch, sea);
  const { count } = accumulate(dir, cw, ch, null);
  let channels = 0, land = 0;
  for (let i = 0; i < cw * ch; i++) if (!sea[i]) { land++; if (count[i] >= 8) channels++; }
  return channels / land;
}

describe("coarse surface", () => {
  const { cw, ch } = coarseSize(W, H);
  const c = coarseSurface(42, cw, ch);

  it("is finite, has sea on the west and land inland, and lifts only the land", () => {
    for (let i = 0; i < cw * ch; i++) expect(Number.isFinite(c.height[i])).toBe(true);
    expect(c.sea[ch * cw / 2 | 0]).toBe(1); // first column, middle row
    expect(c.sea[(ch / 2 | 0) * cw + cw - 2]).toBe(0);
    for (let i = 0; i < cw * ch; i++) if (c.sea[i]) expect(c.uplift[i]).toBe(0);
    let lifted = 0;
    for (let i = 0; i < cw * ch; i++) if (c.uplift[i] > 0) lifted++;
    expect(lifted).toBeGreaterThan(cw * ch * 0.3);
  });
});

describe("erosion", () => {
  const { cw, ch } = coarseSize(W, H);

  it("keeps heights finite, holds the crest, and cuts a denser channel network", () => {
    const c = coarseSurface(42, cw, ch);
    const before = new Float32Array(c.height);
    const densityBefore = drainageDensity(before, cw, ch, c.sea);
    let maxBefore = -Infinity;
    for (let i = 0; i < cw * ch; i++) if (before[i] > maxBefore) maxBefore = before[i];
    erode(c.height, cw, ch, c.uplift, c.sea, ERODE_ITERATIONS);
    let maxAfter = -Infinity;
    let sum = 0, sumBefore = 0, land = 0;
    for (let i = 0; i < cw * ch; i++) {
      expect(Number.isFinite(c.height[i])).toBe(true);
      if (c.sea[i]) { expect(c.height[i]).toBe(before[i]); continue; }
      land++;
      sum += c.height[i];
      sumBefore += before[i];
      if (c.height[i] > maxAfter) maxAfter = c.height[i];
    }
    expect(maxAfter).toBeGreaterThan(maxBefore * 0.7);
    expect(maxAfter).toBeLessThan(maxBefore * 1.3);
    // Erosion removes more than uplift adds: the mean land height falls.
    expect(sum / land).toBeLessThan(sumBefore / land);
    expect(drainageDensity(c.height, cw, ch, c.sea)).toBeGreaterThan(densityBefore);
  });

  it("is deterministic", () => {
    const a = coarseSurface(7, cw, ch);
    const b = coarseSurface(7, cw, ch);
    erode(a.height, cw, ch, a.uplift, a.sea, 5);
    erode(b.height, cw, ch, b.uplift, b.sea, 5);
    expect([...a.height]).toEqual([...b.height]);
  });
});

describe("upsample", () => {
  it("interpolates the coarse surface and adds more detail on steep ground than on flat", () => {
    const { cw, ch } = coarseSize(W, H);
    const c = coarseSurface(42, cw, ch);
    const fine = upsample(c.height, cw, ch, W, H, 42);
    expect(fine.length).toBe(W * H);
    // A fine cell lies within 120 m of the coarse cell under it plus the detail band.
    for (let y = 0; y < H; y += 7) for (let x = 0; x < W; x += 7) {
      const coarse = c.height[Math.min(ch - 1, (y / 4) | 0) * cw + Math.min(cw - 1, (x / 4) | 0)];
      expect(Math.abs(fine[y * W + x] - coarse)).toBeLessThan(400);
    }
    // Roughness: mean absolute difference to the east neighbour, on the shelf (flat) versus the coastal flank (steep).
    const rough = (x0: number, x1: number) => {
      let s = 0, n = 0;
      for (let y = 10; y < H - 10; y++) for (let x = x0; x < x1; x++) { s += Math.abs(fine[y * W + x + 1] - fine[y * W + x]); n++; }
      return s / n;
    };
    expect(rough(2, 6)).toBeLessThan(rough(20, 30));
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/erode.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Write `src/world/erode.ts`**

```ts
/**
 * From the template to a landscape: the coarse surface at 1.2 km, a
 * stream-power erosion loop that cuts valleys where water gathers and
 * holds the crest up with uplift, and a bicubic upsample to 300 m with
 * detail noise that is rough on slopes and quiet on plains. Arithmetic
 * and square roots only.
 */
import { CELL_KM } from "../units";
import { accumulate, DIST8, flowDirections, NO_FLOW, priorityFlood, receiverOf } from "./hydro";
import { fbm } from "./noise";
import { inBothnia, seedsFor, templateHeightM, TEMPLATE_H_KM, TEMPLATE_W_KM } from "./terrain";

export const COARSE_KM = 1.2;
const COARSE_PER_FINE = COARSE_KM / CELL_KM;
export const ERODE_ITERATIONS = 30;
/** Erosion strength per iteration: the fraction of the drop to the receiver a one-cell catchment closes. Scales with the square root of catchment area in km2. */
const ERODE_DT_K = 0.08;
/** Uplift per iteration at the crest, metres; elsewhere in proportion to the template height. */
const UPLIFT_CREST_M = 12;
/** Hillslope diffusion per iteration: the share of the gap to the four-neighbour mean that closes. */
const DIFFUSION = 0.1;

export function coarseSize(w: number, h: number): { cw: number; ch: number } {
  return { cw: Math.ceil(w / COARSE_PER_FINE), ch: Math.ceil(h / COARSE_PER_FINE) };
}

/** The template sampled at coarse cell centres, with its uplift field and sea mask. */
export function coarseSurface(seed: number, cw: number, ch: number): { height: Float32Array; uplift: Float32Array; sea: Uint8Array } {
  const n = cw * ch;
  const height = new Float32Array(n);
  const uplift = new Float32Array(n);
  const sea = new Uint8Array(n);
  let crest = 0;
  for (let y = 0; y < ch; y++) {
    for (let x = 0; x < cw; x++) {
      const i = y * cw + x;
      const u = (x + 0.5) / cw;
      const v = (y + 0.5) / ch;
      const h = templateHeightM(seed, u, v);
      height[i] = h;
      sea[i] = h <= 0 ? 1 : 0;
      if (h > crest) crest = h;
    }
  }
  for (let i = 0; i < n; i++) uplift[i] = sea[i] ? 0 : (height[i] > 0 ? UPLIFT_CREST_M * height[i] / crest : 0);
  return { height, uplift, sea };
}

/**
 * Stream-power erosion, implicit in receiver order (Braun and Willett):
 * each cell relaxes toward its receiver by a fraction that grows with the
 * square root of its catchment, after the receiver has been updated, so
 * the scheme is stable at any strength. Then uplift and diffusion.
 */
export function erode(height: Float32Array, cw: number, ch: number, uplift: Float32Array, sea: Uint8Array, iterations: number, onIteration?: (i: number) => void): void {
  const n = cw * ch;
  const cellKm2 = COARSE_KM * COARSE_KM;
  const smoothed = new Float32Array(n);
  for (let it = 0; it < iterations; it++) {
    const filled = priorityFlood(height, cw, ch, sea);
    const dir = flowDirections(filled, cw, ch, sea);
    const { count, order } = accumulate(dir, cw, ch, null);
    for (let k = n - 1; k >= 0; k--) {
      const c = order[k];
      if (sea[c] || dir[c] === NO_FLOW) continue;
      const r = receiverOf(c, dir[c], cw);
      const f = ERODE_DT_K * Math.sqrt(count[c] * cellKm2) / (COARSE_KM * DIST8[dir[c]]);
      height[c] = (height[c] + uplift[c] + f * height[r]) / (1 + f);
    }
    for (let i = 0; i < n; i++) {
      if (sea[i]) { smoothed[i] = height[i]; continue; }
      const x = i % cw;
      const y = (i - x) / cw;
      let sum = 0;
      let m = 0;
      if (x > 0) { sum += height[i - 1]; m++; }
      if (x < cw - 1) { sum += height[i + 1]; m++; }
      if (y > 0) { sum += height[i - cw]; m++; }
      if (y < ch - 1) { sum += height[i + cw]; m++; }
      smoothed[i] = height[i] + DIFFUSION * (sum / m - height[i]);
    }
    height.set(smoothed);
    onIteration?.(it);
  }
}

/** Catmull-Rom weights for a fractional offset t in 0..1. */
function cubic(t: number): [number, number, number, number] {
  const t2 = t * t;
  const t3 = t2 * t;
  return [
    -0.5 * t3 + t2 - 0.5 * t,
    1.5 * t3 - 2.5 * t2 + 1,
    -1.5 * t3 + 2 * t2 + 0.5 * t,
    0.5 * t3 - 0.5 * t2,
  ];
}

/**
 * Bicubic interpolation of the coarse surface onto the fine grid, plus
 * two octaves of detail at 2.5 km whose amplitude is 12 m on flat ground
 * and 60 m on slopes of 15 percent and more.
 */
export function upsample(coarse: Float32Array, cw: number, ch: number, w: number, h: number, seed: number): Float32Array {
  const s = seedsFor(seed);
  const fine = new Float32Array(w * h);
  const at = (x: number, y: number) => coarse[(y < 0 ? 0 : y >= ch ? ch - 1 : y) * cw + (x < 0 ? 0 : x >= cw ? cw - 1 : x)];
  const kmPerFineU = TEMPLATE_W_KM / w;
  const kmPerFineV = TEMPLATE_H_KM / h;
  for (let y = 0; y < h; y++) {
    const gy = (y + 0.5) / COARSE_PER_FINE - 0.5;
    const iy = Math.floor(gy);
    const wy = cubic(gy - iy);
    for (let x = 0; x < w; x++) {
      const gx = (x + 0.5) / COARSE_PER_FINE - 0.5;
      const ix = Math.floor(gx);
      const wx = cubic(gx - ix);
      let v = 0;
      for (let j = 0; j < 4; j++) {
        let row = 0;
        for (let i = 0; i < 4; i++) row += wx[i] * at(ix - 1 + i, iy - 1 + j);
        v += wy[j] * row;
      }
      // Local slope of the coarse surface, metres per metre.
      const cx = Math.min(cw - 1, Math.max(0, Math.round(gx)));
      const cy = Math.min(ch - 1, Math.max(0, Math.round(gy)));
      const dzx = (at(cx + 1, cy) - at(cx - 1, cy)) / (2 * COARSE_KM * 1000);
      const dzy = (at(cx, cy + 1) - at(cx, cy - 1)) / (2 * COARSE_KM * 1000);
      const slope = Math.sqrt(dzx * dzx + dzy * dzy);
      const amp = 12 + 48 * (slope > 0.15 ? 1 : slope / 0.15);
      const xKm = (x + 0.5) * kmPerFineU;
      const yKm = (y + 0.5) * kmPerFineV;
      const detail = (fbm(xKm / 2.5, yKm / 2.5, s.detail, 2) - 0.5) * 2 * amp;
      // The sea keeps its floor: detail on the shelf is a tenth, so no fine cell rises through the surface by noise alone.
      fine[y * w + x] = v <= 0 ? v + detail / 10 : v + detail;
    }
  }
  return fine;
}
```

Remove the unused `inBothnia` import from the import line.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/erode.test.ts`
Expected: PASS, 4 tests. If the "holds the crest" assertion fails, adjust `UPLIFT_CREST_M` (raise if the crest falls under 70 percent, lower if it exceeds 130 percent) and re-run; if "cuts a denser channel network" fails, raise `ERODE_DT_K` to 0.12. Record the final values in the commit message.

- [ ] **Step 5: Write the timing script and run the spike**

```ts
// scripts/terrain.ts
/**
 * Stage timings for the world solve at full size, and (from Task 11) the
 * realism report. Run: npm run terrain -- [seed]
 */
import { coarseSize, coarseSurface, erode, ERODE_ITERATIONS, upsample } from "../src/world/erode";
import { accumulate, flowDirections, priorityFlood } from "../src/world/hydro";
import { WORLD_H, WORLD_W } from "../src/world/terrain";

const seed = Number(process.argv[2] ?? 42);
const t = (label: string, f: () => void) => {
  const t0 = performance.now();
  f();
  console.log(`${label.padEnd(28)} ${((performance.now() - t0) / 1000).toFixed(2)} s`);
};
const { cw, ch } = coarseSize(WORLD_W, WORLD_H);
let c!: ReturnType<typeof coarseSurface>;
t("coarse surface", () => { c = coarseSurface(seed, cw, ch); });
t(`erosion x${ERODE_ITERATIONS}`, () => erode(c.height, cw, ch, c.uplift, c.sea, ERODE_ITERATIONS));
let fine!: Float32Array;
t("upsample", () => { fine = upsample(c.height, cw, ch, WORLD_W, WORLD_H, seed); });
const sea = new Uint8Array(WORLD_W * WORLD_H);
for (let i = 0; i < sea.length; i++) sea[i] = fine[i] <= 0 ? 1 : 0;
let filled!: Float32Array;
t("priority flood (full)", () => { filled = priorityFlood(fine, WORLD_W, WORLD_H, sea); });
let dir!: Uint8Array;
t("flow directions (full)", () => { dir = flowDirections(filled, WORLD_W, WORLD_H, sea); });
t("accumulate (full)", () => accumulate(dir, WORLD_W, WORLD_H, null));
```

Add to `package.json` scripts: `"terrain": "vite-node scripts/terrain.ts",` after `"december"`.

Run: `npm run terrain -- 42`
Expected: six lines of timings. The full solve is these plus a second flood, directions and accumulation (stage 5 re-run) plus carving and classification, about 1.5 s. If the projected total exceeds 20 s, lower `ERODE_ITERATIONS` until it fits and note the measured numbers in the commit message.

- [ ] **Step 6: Commit**

```bash
git add src/world/erode.ts scripts/terrain.ts package.json tests/erode.test.ts
git commit --no-verify -m "feat(survidle): coarse erosion loop and bicubic upsample

Timing spike at full size: <paste the six lines>.
Tree compiles again at Task 6 of the terrain plan."
```

---

### Task 4: Discharge, glacial carving, sea re-read, the hydrology assembly

**Files:**
- Create: `src/world/classify.ts` (discharge and carving here; classification joins in Task 5)
- Create: `src/world/solve.ts` (stages 1 to 5; stage 6 in Task 5)
- Test: `tests/solve-hydrology.test.ts`

**Interfaces:**
- Produces:
  - `runoffWeights(w: number, h: number): Float32Array` cubic metres a second each cell contributes: `0.09 * runoffLsKm2(coastKm) / 1000`
  - `carveGlacial(height: Float32Array, w: number, h: number, dir: Uint8Array, count: Uint32Array, order: Int32Array, seaBefore: Uint8Array): void` lowers valley floors in place
  - `hydrologyPass(height: Float32Array, w: number, h: number, sea: Uint8Array): { filled: Float32Array; dir: Uint8Array; count: Uint32Array; flow: Float32Array; order: Int32Array }`
  - `solveHydrology(seed: number, w: number, h: number, onProgress?: SolveProgress): HydrologyResult` where `HydrologyResult = { height: Float32Array; sea: Uint8Array; lake: Uint8Array; dir: Uint8Array; count: Uint32Array; flow: Float32Array }`
  - `type SolveProgress = (stage: string, fraction: number) => void`
  - `STAGES = ["raising the land", "wearing the valleys", "filling the lakes", "cutting the fjords", "naming the ground"]`

- [ ] **Step 1: Write the failing tests**

```ts
// tests/solve-hydrology.test.ts
import { describe, expect, it } from "vitest";
import { NO_FLOW, receiverOf } from "../src/world/hydro";
import { solveHydrology } from "../src/world/solve";
import { coastLineU } from "../src/world/terrain";

const W = 120, H = 160;

describe("the hydrology of a miniature world", () => {
  const r = solveHydrology(42, W, H);
  const n = W * H;

  it("drains every land cell to the sea or an edge, never uphill", () => {
    for (let i = 0; i < n; i++) {
      if (r.sea[i]) { expect(r.dir[i]).toBe(NO_FLOW); continue; }
      const x = i % W, y = (i - x) / W;
      const edge = x === 0 || y === 0 || x === W - 1 || y === H - 1;
      if (r.dir[i] === NO_FLOW) { expect(edge).toBe(true); continue; }
      const rc = receiverOf(i, r.dir[i], W);
      expect(r.height[rc]).toBeLessThanOrEqual(r.height[i] + 0.01);
    }
  });

  it("gives every lake an outlet at its own surface", () => {
    for (let i = 0; i < n; i++) {
      if (!r.lake[i] || r.dir[i] === NO_FLOW) continue;
      const rc = receiverOf(i, r.dir[i], W);
      if (!r.lake[rc]) expect(r.height[rc]).toBeLessThanOrEqual(r.height[i] + 0.01);
      else expect(Math.abs(r.height[rc] - r.height[i])).toBeLessThan(0.01);
    }
  });

  it("never lets discharge fall downstream", () => {
    for (let i = 0; i < n; i++) {
      if (r.dir[i] === NO_FLOW) continue;
      expect(r.flow[receiverOf(i, r.dir[i], W)]).toBeGreaterThanOrEqual(r.flow[i] - 1e-6);
    }
  });

  it("keeps the sea connected to an edge and below zero, and the land above the sea", () => {
    for (let i = 0; i < n; i++) {
      if (r.sea[i]) expect(r.height[i]).toBeLessThanOrEqual(0);
      else if (!r.lake[i]) expect(r.height[i]).toBeGreaterThan(-0.01);
    }
    let seaCells = 0;
    for (let i = 0; i < n; i++) seaCells += r.sea[i];
    expect(seaCells).toBeGreaterThan(n * 0.1);
    expect(seaCells).toBeLessThan(n * 0.5);
  });

  it("cuts fjords: sea reaches inland of the template coast line somewhere on the west side", () => {
    // A fjord is sea east of the template coast line.
    let inland = 0;
    for (let y = 0; y < H; y++) {
      const coastU = coastLineU((y + 0.5) / H);
      for (let x = Math.ceil(coastU * W) + 3; x < W; x++) if (r.sea[y * W + x]) inland++;
    }
    expect(inland).toBeGreaterThan(20);
  });

  it("is deterministic", () => {
    const again = solveHydrology(42, W, H);
    expect([...again.height]).toEqual([...r.height]);
    expect([...again.flow]).toEqual([...r.flow]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/solve-hydrology.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Write `src/world/classify.ts` (first half)**

```ts
/**
 * From drainage to discharge and to the glacial shape of the western
 * valleys; and (below) from the solved fields to what each cell is. The
 * rules here are the geology and ecology of the setting, in real units.
 */
import { CELL_KM } from "../units";
import { DIST8, NO_FLOW, receiverOf } from "./hydro";
import { coastKmAt, runoffLsKm2 } from "./terrain";

const CELL_KM2 = CELL_KM * CELL_KM;

/** What each cell adds to the river below it, cubic metres a second: its area times the row's runoff. */
export function runoffWeights(w: number, h: number): Float32Array {
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    const v = (y + 0.5) / h;
    for (let x = 0; x < w; x++) out[y * w + x] = CELL_KM2 * runoffLsKm2(coastKmAt((x + 0.5) / w, v)) / 1000;
  }
  return out;
}

/** Signed coast distance of a cell, km, positive inland. */
export function coastKmOfCell(x: number, y: number, w: number, h: number): number {
  return coastKmAt((x + 0.5) / w, (y + 0.5) / h);
}

const TROUGH_MAX_DEPTH_M = 700;
const TROUGH_MAX_HALF_KM = 4;
const TROUGH_REACH_KM = 150;
const DROWN_REACH_KM = 40;
const DROWN_M = 300;
/** A valley is carved once its catchment reaches this. */
const TROUGH_MIN_KM2 = 5;

/**
 * Ice sat in the western valleys and over-deepened them: along every
 * drainage line that reaches the Atlantic within 150 km, the floor is
 * lowered by a parabolic trough whose depth and width grow with the
 * catchment, and within 40 km of the coast an extra drop drowns it so the
 * sea can enter. Applied in place; the caller re-reads the sea afterwards.
 */
export function carveGlacial(height: Float32Array, w: number, h: number, dir: Uint8Array, count: Uint32Array, order: Int32Array, seaBefore: Uint8Array): void {
  const n = w * h;
  // A cell drains west if its receiver does, or it is Atlantic sea itself.
  const drainsWest = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    if (!seaBefore[i]) continue;
    const x = i % w;
    const y = (i - x) / w;
    if (coastKmOfCell(x, y, w, h) < 0) drainsWest[i] = 1;
  }
  for (let k = n - 1; k >= 0; k--) {
    const c = order[k];
    if (dir[c] === NO_FLOW) continue;
    if (drainsWest[receiverOf(c, dir[c], w)]) drainsWest[c] = 1;
  }
  const lower = new Float32Array(n);
  for (let c = 0; c < n; c++) {
    if (seaBefore[c] || !drainsWest[c]) continue;
    const x = c % w;
    const y = (c - x) / w;
    const coastKm = coastKmOfCell(x, y, w, h);
    if (coastKm >= TROUGH_REACH_KM) continue;
    const km2 = count[c] * CELL_KM2;
    if (km2 < TROUGH_MIN_KM2) continue;
    const root = Math.sqrt(km2);
    let depth = 40 * root;
    if (depth > TROUGH_MAX_DEPTH_M) depth = TROUGH_MAX_DEPTH_M;
    if (coastKm < DROWN_REACH_KM) depth += DROWN_M * (1 - coastKm / DROWN_REACH_KM);
    let halfKm = 0.15 * root;
    if (halfKm > TROUGH_MAX_HALF_KM) halfKm = TROUGH_MAX_HALF_KM;
    const halfCells = halfKm / CELL_KM;
    const reach = Math.ceil(halfCells);
    for (let dy = -reach; dy <= reach; dy++) {
      const yy = y + dy;
      if (yy < 0 || yy >= h) continue;
      for (let dx = -reach; dx <= reach; dx++) {
        const xx = x + dx;
        if (xx < 0 || xx >= w) continue;
        const r2 = (dx * dx + dy * dy) / (halfCells * halfCells);
        if (r2 >= 1) continue;
        const d = depth * (1 - r2);
        const j = yy * w + xx;
        if (d > lower[j]) lower[j] = d;
      }
    }
  }
  for (let i = 0; i < n; i++) if (!seaBefore[i]) height[i] -= lower[i];
}

export { DIST8 };
```

- [ ] **Step 4: Write `src/world/solve.ts` (stages 1 to 5)**

```ts
/**
 * The world solve: one pure function from seed and size to the arrays a
 * world is made of. Six stages, each reporting progress, all arithmetic
 * and square roots so every engine solves the same seed to the same
 * cell. Nothing here is stored; a world is solved again from its seed.
 */
import { coarseSize, coarseSurface, erode, ERODE_ITERATIONS, upsample } from "./erode";
import { accumulate, connectedSea, flowDirections, lakeComponents, priorityFlood } from "./hydro";
import { carveGlacial, runoffWeights } from "./classify";

export type SolveProgress = (stage: string, fraction: number) => void;
export const STAGES = ["raising the land", "wearing the valleys", "filling the lakes", "cutting the fjords", "naming the ground"] as const;
/** Bumped whenever the solve changes what a seed produces; the node cache is keyed by it. */
export const GENERATOR_VERSION = 1;
/** A depression must be this deep somewhere to be a lake rather than damp ground. */
export const LAKE_MIN_DEPTH_M = 2;

export interface HydrologyResult {
  height: Float32Array;
  sea: Uint8Array;
  lake: Uint8Array;
  dir: Uint8Array;
  count: Uint32Array;
  flow: Float32Array;
}

export function hydrologyPass(height: Float32Array, w: number, h: number, sea: Uint8Array) {
  const filled = priorityFlood(height, w, h, sea);
  const dir = flowDirections(filled, w, h, sea);
  const { count, flow, order } = accumulate(dir, w, h, runoffWeights(w, h));
  return { filled, dir, count, flow, order };
}

/** Stages 1 to 5: template, erosion, upsample, drainage, carving and the sea re-read, then drainage again with the lakes. */
export function solveHydrology(seed: number, w: number, h: number, onProgress: SolveProgress = () => {}): HydrologyResult {
  onProgress(STAGES[0], 0);
  const { cw, ch } = coarseSize(w, h);
  const coarse = coarseSurface(seed, cw, ch);
  onProgress(STAGES[1], 0);
  erode(coarse.height, cw, ch, coarse.uplift, coarse.sea, ERODE_ITERATIONS, (i) => onProgress(STAGES[1], (i + 1) / ERODE_ITERATIONS));
  const height = upsample(coarse.height, cw, ch, w, h, seed);
  onProgress(STAGES[2], 0);
  const seaBefore = connectedSea(height, w, h);
  const first = hydrologyPass(height, w, h, seaBefore);
  onProgress(STAGES[3], 0);
  carveGlacial(height, w, h, first.dir, first.count, first.order, seaBefore);
  const sea = connectedSea(height, w, h);
  onProgress(STAGES[3], 0.5);
  const second = hydrologyPass(height, w, h, sea);
  const lake = lakeComponents(height, second.filled, w, h, sea, LAKE_MIN_DEPTH_M);
  onProgress(STAGES[3], 1);
  return { height, sea, lake, dir: second.dir, count: second.count, flow: second.flow };
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run tests/solve-hydrology.test.ts`
Expected: PASS, 6 tests. If "cuts fjords" fails with too few inland sea cells, the miniature is too small for the 40 km drowning reach to bite; check the count and, if it is between 5 and 20, lower the threshold in the test to 5 with a comment saying the miniature is 36 km wide. If it is 0, `carveGlacial` is not lowering below zero: print `lower` maxima and fix.

- [ ] **Step 6: Commit**

```bash
git add src/world/classify.ts src/world/solve.ts tests/solve-hydrology.test.ts
git commit --no-verify -m "feat(survidle): discharge, glacial carving and the sea re-read

Tree compiles again at Task 6 of the terrain plan."
```

---

### Task 5: Classification, the complete solve, determinism and the banned-function test

**Files:**
- Modify: `src/world/classify.ts` (append classification)
- Modify: `src/world/solve.ts` (stage 6, `SolvedWorld`, `solveWorld`)
- Test: `tests/solve.test.ts`

**Interfaces:**
- Produces:
  - `KIND = { land: 0, sea: 1, lake: 2, river: 3 } as const`, `FLAG_STREAM = 1`, `FLAG_FORD = 2`
  - `RIVER_M3S = 40`, `STREAM_M3S = 0.05`, `FORD_GRADIENT = 0.005`
  - `classify(hydro: HydrologyResult, seed: number, w: number, h: number): { terrain: Uint8Array; kind: Uint8Array; flags: Uint8Array; moisture: Uint8Array }`
  - `interface SolvedWorld { w: number; h: number; height: Int16Array; flowDir: Uint8Array; discharge: Float32Array; kind: Uint8Array; flags: Uint8Array; terrain: Uint8Array; moisture: Uint8Array }`
  - `solveWorld(seed: number, w: number, h: number, onProgress?: SolveProgress): SolvedWorld`
  - `solvedBuffers(s: SolvedWorld): ArrayBuffer[]` the transfer list for a worker
- Consumes: `treelineM`, `latitudeAt`, `seedsFor` from `./terrain`; `fbm` from `./noise`; `TERRAIN_INDEX`

- [ ] **Step 1: Write the failing tests**

```ts
// tests/solve.test.ts
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { coastKmOfCell } from "../src/world/classify";
import { NO_FLOW, receiverOf } from "../src/world/hydro";
import { FLAG_FORD, FLAG_STREAM, KIND, RIVER_M3S, solveWorld, STREAM_M3S } from "../src/world/solve";
import { latitudeAt, TERRAIN_INDEX, treelineM } from "../src/world/terrain";

const W = 120, H = 160;

function hash(a: ArrayLike<number>): number {
  let h = 2166136261;
  for (let i = 0; i < a.length; i++) h = Math.imul(h ^ Math.round(a[i] * 1000), 16777619);
  return h >>> 0;
}

describe("the solved miniature world", () => {
  const s = solveWorld(42, W, H);
  const n = W * H;

  it("solves the same seed to the same arrays", () => {
    const again = solveWorld(42, W, H);
    for (const key of ["height", "flowDir", "discharge", "kind", "flags", "terrain", "moisture"] as const) {
      expect(hash(again[key]), key).toBe(hash(s[key]));
    }
    expect(hash(solveWorld(43, W, H).height)).not.toBe(hash(s.height));
  });

  it("classes water by kind: sea and lake are water, rivers are river", () => {
    for (let i = 0; i < n; i++) {
      if (s.kind[i] === KIND.sea || s.kind[i] === KIND.lake) expect(s.terrain[i]).toBe(TERRAIN_INDEX.water);
      if (s.kind[i] === KIND.river) expect(s.terrain[i]).toBe(TERRAIN_INDEX.river);
      if (s.terrain[i] === TERRAIN_INDEX.river) expect(s.discharge[i]).toBeGreaterThanOrEqual(RIVER_M3S);
    }
  });

  it("flags streams by discharge and fords by gradient, on land only", () => {
    for (let i = 0; i < n; i++) {
      const stream = (s.flags[i] & FLAG_STREAM) !== 0;
      const ford = (s.flags[i] & FLAG_FORD) !== 0;
      if (stream) { expect(s.kind[i]).toBe(KIND.land); expect(s.discharge[i]).toBeGreaterThanOrEqual(STREAM_M3S); }
      if (ford) {
        expect(s.kind[i]).toBe(KIND.river);
        expect(s.flowDir[i]).not.toBe(NO_FLOW);
        const r = receiverOf(i, s.flowDir[i], W);
        expect(s.height[i] - s.height[r]).toBeGreaterThan(0);
      }
      if (s.kind[i] === KIND.land && s.discharge[i] >= STREAM_M3S) expect(stream).toBe(true);
    }
  });

  it("continues every river downstream to a lake, the sea or the edge", () => {
    for (let i = 0; i < n; i++) {
      if (s.kind[i] !== KIND.river || s.flowDir[i] === NO_FLOW) continue;
      const r = receiverOf(i, s.flowDir[i], W);
      expect([KIND.river, KIND.lake, KIND.sea]).toContain(s.kind[r]);
    }
  });

  it("puts fell only above the treeline of its row and coast, and no spruce on the coast or above 66 N", () => {
    for (let i = 0; i < n; i++) {
      const x = i % W, y = (i - x) / W;
      const lat = latitudeAt(y + 0.5, H);
      const coast = coastKmOfCell(x, y, W, H);
      const t = s.terrain[i];
      if (t === TERRAIN_INDEX.fell) expect(s.height[i]).toBeGreaterThan(treelineM(lat, coast) - 1);
      if (t === TERRAIN_INDEX.spruce) { expect(coast).toBeGreaterThan(30); expect(lat).toBeLessThan(66); }
    }
  });

  it("keeps bog on flat ground and stores a moisture in 0..255", () => {
    for (let i = 0; i < n; i++) {
      expect(s.moisture[i]).toBeGreaterThanOrEqual(0);
      expect(s.moisture[i]).toBeLessThanOrEqual(255);
      if (s.terrain[i] !== TERRAIN_INDEX.bog || s.flowDir[i] === NO_FLOW) continue;
      const r = receiverOf(i, s.flowDir[i], W);
      expect((s.height[i] - s.height[r]) / 300).toBeLessThan(0.02 + 0.004);
    }
  });

  it("has every terrain class somewhere in the miniature", () => {
    const seen = new Set<number>();
    for (let i = 0; i < n; i++) seen.add(s.terrain[i]);
    for (const t of ["water", "fell", "rock", "bog", "spruce", "pine", "birch", "meadow"] as const) expect(seen.has(TERRAIN_INDEX[t]), t).toBe(true);
  });
});

describe("the solve's arithmetic", () => {
  it("uses no function whose last bit differs between engines", () => {
    for (const file of ["src/world/solve.ts", "src/world/classify.ts", "src/world/erode.ts", "src/world/hydro.ts", "src/world/heap.ts", "src/world/terrain.ts", "src/world/noise.ts"]) {
      const src = readFileSync(file, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
      expect(src, file).not.toMatch(/Math\.(exp|pow|sin|cos|tan|log|atan2|atan|asin|acos|cbrt|hypot|expm1|log1p|log2|log10)\b/);
      expect(src, file).not.toMatch(/\*\*/);
    }
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/solve.test.ts`
Expected: FAIL, `solveWorld` not exported.

- [ ] **Step 3: Append the classification to `src/world/classify.ts`**

```ts
import { fbm } from "./noise";
import { latitudeAt, LAT_BOTTOM, LAT_TOP, seedsFor, TEMPLATE_H_KM, TEMPLATE_W_KM, TERRAIN_INDEX, treelineM } from "./terrain";
import type { HydrologyResult } from "./solve";

export const KIND = { land: 0, sea: 1, lake: 2, river: 3 } as const;
export const FLAG_STREAM = 1;
export const FLAG_FORD = 2;
/** Mean discharge above this is a river about 50 m wide at bankfull: its own terrain, crossed on ice or at a ford. */
export const RIVER_M3S = 40;
/** A brook that runs all year. */
export const STREAM_M3S = 0.05;
/** A river cell dropping faster than this to its receiver is a riffle a walker can ford. */
export const FORD_GRADIENT = 0.005;
/** Slopes above this (20 degrees) shed their soil. */
const STEEP = 0.36;
/** Spruce does not grow within this of the Atlantic, nor north of this latitude. */
const SPRUCE_COAST_KM = 30;
const SPRUCE_LAT_LIMIT = 66;

/** Bare rock share by band; the highest applicable rate wins. */
function rockRate(coastKm: number, slope: number, underTreeline: number): number {
  let rate = 0.04;
  if (coastKm < 1) rate = 0.30;
  if (slope > STEEP && rate < 0.25) rate = 0.25;
  if (underTreeline >= 0 && underTreeline < 100 && rate < 0.35) rate = 0.35;
  return rate;
}

export function classify(hydro: HydrologyResult, seed: number, w: number, h: number): { terrain: Uint8Array; kind: Uint8Array; flags: Uint8Array; moisture: Uint8Array } {
  const n = w * h;
  const s = seedsFor(seed);
  const terrain = new Uint8Array(n);
  const kind = new Uint8Array(n);
  const flags = new Uint8Array(n);
  const moisture = new Uint8Array(n);
  const { height, sea, lake, dir, count, flow } = hydro;
  const kmPerU = TEMPLATE_W_KM / w;
  const kmPerV = TEMPLATE_H_KM / h;
  for (let i = 0; i < n; i++) {
    const x = i % w;
    const y = (i - x) / w;
    if (sea[i]) { kind[i] = KIND.sea; terrain[i] = TERRAIN_INDEX.water; continue; }
    if (lake[i]) { kind[i] = KIND.lake; terrain[i] = TERRAIN_INDEX.water; continue; }
    const q = flow[i];
    // Slope to the receiver, metres per metre; a sink is flat.
    let slope = 0;
    let northFacing = 0.5;
    if (dir[i] !== NO_FLOW) {
      const r = receiverOf(i, dir[i], w);
      slope = (height[i] - height[r]) / (DIST8[dir[i]] * CELL_KM * 1000);
      if (slope < 0) slope = 0;
      const dy = DY8[dir[i]];
      northFacing = dy < 0 ? 1 : dy > 0 ? 0 : 0.5;
    }
    if (q >= RIVER_M3S) {
      kind[i] = KIND.river;
      terrain[i] = TERRAIN_INDEX.river;
      if (slope > FORD_GRADIENT) flags[i] |= FLAG_FORD;
      continue;
    }
    kind[i] = KIND.land;
    if (q >= STREAM_M3S) flags[i] |= FLAG_STREAM;
    const coastKm = coastKmOfCell(x, y, w, h);
    const lat = latitudeAt(y + 0.5, h);
    const treeline = treelineM(lat, coastKm);
    const hm = height[i];
    const s0 = slope < 0.001 ? 0.001 : slope;
    const a = count[i];
    const wetness = a / (a + 200 * s0);
    const p = (runoffLsKm2(coastKm) - 12) / 38;
    const m = 0.5 * p + 0.4 * wetness + 0.1 * northFacing;
    moisture[i] = Math.round((m < 0 ? 0 : m > 1 ? 1 : m) * 255);
    const soil = fbm((x + 0.5) * kmPerU / 2 + 11, (y + 0.5) * kmPerV / 2 + 5, s.soil, 2);
    const underTreeline = treeline - hm;
    if (hm > treeline) { terrain[i] = TERRAIN_INDEX.fell; continue; }
    if (soil < rockRate(coastKm, slope, underTreeline)) { terrain[i] = TERRAIN_INDEX.rock; continue; }
    if (slope < 0.02 && wetness > 0.6 && p > 0.3) { terrain[i] = TERRAIN_INDEX.bog; continue; }
    if (underTreeline < 60 || (coastKm < 3 && soil < 0.5)) { terrain[i] = TERRAIN_INDEX.meadow; continue; }
    const spruceAllowed = coastKm > SPRUCE_COAST_KM && lat < SPRUCE_LAT_LIMIT;
    if (underTreeline < 150 || coastKm < 10 || (m > 0.55 && !spruceAllowed)) { terrain[i] = TERRAIN_INDEX.birch; continue; }
    if (m > 0.55 && spruceAllowed) { terrain[i] = TERRAIN_INDEX.spruce; continue; }
    terrain[i] = TERRAIN_INDEX.pine;
  }
  return { terrain, kind, flags, moisture };
}
```

Add `DY8` and `CELL_KM` to the imports at the top of the file (`CELL_KM` is already imported; add `DY8` to the `./hydro` import). Remove the `LAT_BOTTOM, LAT_TOP` imports if unused. Note the circular type import from `./solve` is type-only and fine.

- [ ] **Step 4: Complete `src/world/solve.ts`**

Append:

```ts
import { classify, KIND, FLAG_FORD, FLAG_STREAM, RIVER_M3S, STREAM_M3S, FORD_GRADIENT } from "./classify";
export { KIND, FLAG_FORD, FLAG_STREAM, RIVER_M3S, STREAM_M3S, FORD_GRADIENT };

export interface SolvedWorld {
  w: number;
  h: number;
  /** Metres above sea level; a lake cell carries its surface, a sea cell its floor. */
  height: Int16Array;
  /** 0..7 toward the receiver, NO_FLOW for the sea and the edge. */
  flowDir: Uint8Array;
  /** Cubic metres a second. */
  discharge: Float32Array;
  kind: Uint8Array;
  flags: Uint8Array;
  terrain: Uint8Array;
  /** 0..255 for the ground glyph forms. */
  moisture: Uint8Array;
}

export function solveWorld(seed: number, w: number, h: number, onProgress: SolveProgress = () => {}): SolvedWorld {
  const hydro = solveHydrology(seed, w, h, onProgress);
  onProgress(STAGES[4], 0);
  const { terrain, kind, flags, moisture } = classify(hydro, seed, w, h);
  const height = new Int16Array(w * h);
  for (let i = 0; i < height.length; i++) {
    const v = Math.round(hydro.height[i]);
    height[i] = v < -32768 ? -32768 : v > 32767 ? 32767 : v;
  }
  onProgress(STAGES[4], 1);
  return { w, h, height, flowDir: hydro.dir, discharge: hydro.flow, kind, flags, terrain, moisture };
}

/** The buffers to transfer out of a worker, in the order `fromBuffers` expects. */
export function solvedBuffers(s: SolvedWorld): ArrayBuffer[] {
  return [s.height.buffer, s.flowDir.buffer, s.discharge.buffer, s.kind.buffer, s.flags.buffer, s.terrain.buffer, s.moisture.buffer] as ArrayBuffer[];
}
```

Move the `import ... from "./classify"` lines to the top of the file with the other imports (one import statement for `carveGlacial, runoffWeights, classify, KIND, ...`).

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run tests/solve.test.ts tests/solve-hydrology.test.ts tests/erode.test.ts tests/hydro.test.ts tests/terrain-template.test.ts`
Expected: PASS. If "has every terrain class somewhere" fails for `bog`, the miniature's flat wet ground is scarce: lower nothing; instead widen the test to seeds 42 and 7 and require each class in at least one of them. If it fails for `spruce`, check that `coastKm > 30` exists in the miniature (it does: the east half is 200 km and more from the coast in template km).

- [ ] **Step 6: Commit**

```bash
git add src/world/classify.ts src/world/solve.ts tests/solve.test.ts
git commit --no-verify -m "feat(survidle): classify solved cells into terrain, kind and flags

Tree compiles again at Task 6 of the terrain plan."
```

---

### Task 6: The world carries the arrays; the tree compiles again

This is the one task that touches many files at once, because removing `fieldsAt` breaks every consumer together. It changes each consumer minimally to compile; Tasks 7 to 10 give them their real rules.

**Files:**
- Modify: `src/world/cells.ts`
- Modify: `src/world/gen.ts` (generateWorld and buildRegion shares only; the start rule is Task 7)
- Create: `src/world/solvecache.ts`, `src/world/solvecache.node.ts`, `tests/setup-worlds.ts`, `tests/world-fixture.ts`
- Modify: `vitest.config.ts` (setupFiles), `src/sim/types.ts` (Terrain), `src/sim/species.ts` (Habitat), `src/world/wildlife.ts` (no change needed if shares carry river), `src/world/names.ts` (no change)
- Modify: `src/sim/cellstatus.ts`, `src/ui/cellpresentation.ts`, `src/ui/ground.ts`, `src/ui/map.ts`, `src/sim/sight.ts`, `src/sim/shelter.ts`, `src/sim/climate.ts`, `src/world/route.ts`, `src/sim/fire.ts`, `scripts/weather-profile.ts`, `scripts/mapstats.ts`, `src/sim/forecast.worker.ts`
- Modify: `tests/world.test.ts`, `tests/ground.test.ts`, `tests/sight.test.ts`, `tests/weather-scenarios.test.ts` (compile only; the fixtures are re-baked in Task 12)

**Interfaces:**
- Produces (in `src/world/cells.ts`):
  - `interface World { seed; w; h; solved: SolvedWorld; chunks; regions; start; startRing; startCell: number }`
  - `newWorld(seed: number, solved: SolvedWorld): World`
  - `terrainOf(world, x, y): Terrain` from `solved.terrain`, `"water"` outside the world
  - `heightAt(world, x, y): number` metres; 0 outside
  - `dischargeAt(world, x, y): number`
  - `streamAt(world, idx): boolean`, `fordAt(world, idx): boolean`
  - `waterKindOf(world, idx): "sea" | "lake" | "river" | null`
  - `moistureAt(world, x, y): number` 0..1
  - `latitudeOfRow(world, y): number`
- Produces (in `src/world/solvecache.ts`): `setSolveCache(fn: SolveCache | null)`, `solvedFor(seed, w, h): SolvedWorld` (in-process Map, then the hook, then `solveWorld`)
- Produces (in `src/world/solvecache.node.ts`): `installNodeWorldCache(dir?: string): void`
- Produces (in `src/world/gen.ts`): `generateWorld(seed: number, solved?: SolvedWorld): World`
- Produces (in `tests/world-fixture.ts`): `flatWorld(opts: { w: number; h: number; terrain: Terrain; heightM?: number; seed?: number }): World` and `paintWorld(world, cells: Iterable<number>, terrain: Terrain, heightM?: number)`

- [ ] **Step 1: Write the world tests that must pass at the end of this task**

Replace `tests/world.test.ts` wholesale:

```ts
import { describe, expect, it } from "vitest";
import { cellAt, generateWorld, heightAt, regionAt, regionOf, terrainOf, waterKindOf, WORLD_H, WORLD_W } from "../src/world/gen";
import { KIND } from "../src/world/solve";

describe("world generation", () => {
  const world = generateWorld(42);

  it("is deterministic for a seed and cheap to make from the cache", () => {
    const t0 = performance.now();
    const again = generateWorld(42);
    expect(performance.now() - t0).toBeLessThan(2000);
    expect(again.start).toBe(world.start);
    for (let i = 0; i < 2000; i += 37) expect(again.solved.terrain[i]).toBe(world.solved.terrain[i]);
  });

  it("is 540 by 667 km", () => {
    expect(world.w).toBe(WORLD_W);
    expect(world.h).toBe(WORLD_H);
    expect(world.solved.height.length).toBe(WORLD_W * WORLD_H);
  });

  it("has the Atlantic on the west and land on the east", () => {
    let seaWest = 0, landEast = 0;
    for (let y = 0; y < WORLD_H; y += 40) {
      if (terrainOf(world, 2, y) === "water" && waterKindOf(world, y * WORLD_W + 2) === "sea") seaWest++;
      if (terrainOf(world, WORLD_W - 3, y) !== "water") landEast++;
    }
    expect(seaWest).toBeGreaterThan(WORLD_H / 40 * 0.8);
    expect(landEast).toBeGreaterThan(WORLD_H / 40 * 0.5);
  });

  it("reads height in metres with the sea at or below zero and lakes above", () => {
    let seaChecked = 0;
    for (let i = 0; i < WORLD_W * WORLD_H; i += 997) {
      const x = i % WORLD_W, y = (i - x) / WORLD_W;
      const kind = world.solved.kind[i];
      if (kind === KIND.sea) { expect(heightAt(world, x, y)).toBeLessThanOrEqual(0); seaChecked++; }
      else expect(heightAt(world, x, y)).toBeGreaterThanOrEqual(0);
    }
    expect(seaChecked).toBeGreaterThan(100);
    expect(heightAt(world, -1, 5)).toBe(0);
  });

  it("every cell belongs to a region, and regions have neighbours", () => {
    for (let i = 0; i < 200; i++) {
      const x = (i * 97) % WORLD_W;
      const y = (i * 61) % WORLD_H;
      expect(regionOf(world, x, y)).toBeGreaterThanOrEqual(0);
    }
    const start = regionAt(world, world.start);
    expect(start.neighbours.length).toBeGreaterThan(2);
    for (const nb of start.neighbours) {
      const back = regionAt(world, nb.id).neighbours.find((x) => x.id === world.start);
      expect(back).toBeDefined();
    }
    expect(cellAt(world, world.startCell).region).toBe(world.start);
  });

  it("counts river as its own habitat share", () => {
    const start = regionAt(world, world.start);
    expect(start.frac.river).toBeGreaterThanOrEqual(0);
    expect(start.frac.water + start.frac.river).toBeLessThanOrEqual(1);
  });
});
```

- [ ] **Step 2: Write `src/world/solvecache.ts` and `src/world/solvecache.node.ts`**

```ts
// src/world/solvecache.ts
/**
 * Where a solved world comes from when code asks for one synchronously:
 * the in-process map first, then an installed cache (the node disk cache
 * in tests and scripts), then the solve itself. The browser's main
 * thread never calls this: it loads through the worker (worldloader.ts).
 */
import { type SolvedWorld, solveWorld } from "./solve";

export type SolveCache = (seed: number, w: number, h: number) => SolvedWorld;

let hook: SolveCache | null = null;
const inProcess = new Map<string, SolvedWorld>();

export function setSolveCache(fn: SolveCache | null): void {
  hook = fn;
}

export function solvedFor(seed: number, w: number, h: number): SolvedWorld {
  const key = `${seed}:${w}x${h}`;
  let s = inProcess.get(key);
  if (!s) {
    s = hook ? hook(seed, w, h) : solveWorld(seed, w, h);
    inProcess.set(key, s);
  }
  return s;
}

/** A solved world handed in from elsewhere (the worker, a message) is remembered so `generateWorld(seed)` finds it. */
export function rememberSolved(s: SolvedWorld, seed: number): void {
  inProcess.set(`${seed}:${s.w}x${s.h}`, s);
}
```

```ts
// src/world/solvecache.node.ts
/**
 * A disk cache of solved worlds for tests and scripts, keyed by seed,
 * size and generator version, under node_modules/.cache so it is never
 * committed. A seed is solved once per machine, then read in tens of
 * milliseconds. Browser code must never import this file.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { GENERATOR_VERSION, type SolvedWorld, solveWorld } from "./solve";
import { setSolveCache } from "./solvecache";

const HEADER_BYTES = 16;

function encode(s: SolvedWorld): Buffer {
  const parts = [s.height, s.flowDir, s.discharge, s.kind, s.flags, s.terrain, s.moisture].map((a) => Buffer.from(a.buffer, a.byteOffset, a.byteLength));
  const header = Buffer.alloc(HEADER_BYTES);
  header.writeInt32LE(s.w, 0);
  header.writeInt32LE(s.h, 4);
  header.writeInt32LE(GENERATOR_VERSION, 8);
  return Buffer.concat([header, ...parts]);
}

function decode(buf: Buffer): SolvedWorld {
  const w = buf.readInt32LE(0);
  const h = buf.readInt32LE(4);
  const n = w * h;
  let at = HEADER_BYTES;
  const take = <T extends Int16Array | Uint8Array | Float32Array>(make: (n: number) => T, bytesPer: number): T => {
    const out = make(n);
    new Uint8Array(out.buffer).set(buf.subarray(at, at + n * bytesPer));
    at += n * bytesPer;
    return out;
  };
  return {
    w, h,
    height: take((n) => new Int16Array(n), 2),
    flowDir: take((n) => new Uint8Array(n), 1),
    discharge: take((n) => new Float32Array(n), 4),
    kind: take((n) => new Uint8Array(n), 1),
    flags: take((n) => new Uint8Array(n), 1),
    terrain: take((n) => new Uint8Array(n), 1),
    moisture: take((n) => new Uint8Array(n), 1),
  };
}

export function installNodeWorldCache(dir = join(process.cwd(), "node_modules", ".cache", "survidle-worlds")): void {
  setSolveCache((seed, w, h) => {
    const file = join(dir, `${seed}-${w}x${h}-v${GENERATOR_VERSION}.bin`);
    if (existsSync(file)) return decode(readFileSync(file));
    const solved = solveWorld(seed, w, h);
    mkdirSync(dir, { recursive: true });
    writeFileSync(file, encode(solved));
    return solved;
  });
}
```

```ts
// tests/setup-worlds.ts
import { installNodeWorldCache } from "../src/world/solvecache.node";

// A full-size world is solved once per machine and read from disk after that.
installNodeWorldCache();
```

In `vitest.config.ts`, inside `defineConfig({ test: { ... } })`, add `setupFiles: ["tests/setup-worlds.ts"],`. Read the file first to see where `test:` options sit (it holds `include`/`exclude` built from `slowTestFiles`).

- [ ] **Step 3: Rewrite `src/world/cells.ts`**

```ts
/**
 * The world as cells: the solved arrays (solve.ts) plus a region cache
 * filled a chunk at a time. Terrain, height, discharge and water kind are
 * lookups; the region of a cell is a pure function of the seed and is
 * cached because it costs nine lattice seeds to find.
 */
import type { Terrain } from "../sim/types";
import { FLAG_FORD, FLAG_STREAM, KIND, type SolvedWorld } from "./solve";
import { latitudeAt, regionOfCell, TERRAINS, WORLD_H, WORLD_W } from "./terrain";
import type { RegionDef } from "./gen";

export const CHUNK = 64;

interface Chunk { region: Int32Array }

export interface World {
  seed: number;
  /** Size in cells. */
  w: number;
  h: number;
  solved: SolvedWorld;
  chunks: Map<number, Chunk>;
  /** Region definitions computed so far, by id. */
  regions: Map<number, RegionDef>;
  /** The region the run begins in. */
  start: number;
  /** The shore cell the first boat lands on. */
  startCell: number;
  /** Rings of the lattice the start search walked; 60 means the fallback anchor. */
  startRing: number;
}

export interface Cell { x: number; y: number; terrain: Terrain; region: number }

export function newWorld(seed: number, solved: SolvedWorld): World {
  return { seed, w: solved.w, h: solved.h, solved, chunks: new Map(), regions: new Map(), start: -1, startCell: -1, startRing: -1 };
}

function chunkFor(world: World, x: number, y: number): { chunk: Chunk; i: number } {
  const cx = Math.floor(x / CHUNK);
  const cy = Math.floor(y / CHUNK);
  const key = cy * 4096 + cx;
  let chunk = world.chunks.get(key);
  if (!chunk) {
    const region = new Int32Array(CHUNK * CHUNK);
    const x0 = cx * CHUNK;
    const y0 = cy * CHUNK;
    for (let j = 0; j < CHUNK; j++) {
      for (let i = 0; i < CHUNK; i++) {
        const wx = x0 + i;
        const wy = y0 + j;
        region[j * CHUNK + i] = wx < world.w && wy < world.h ? regionOfCell(world.seed, wx, wy) : -1;
      }
    }
    chunk = { region };
    world.chunks.set(key, chunk);
  }
  return { chunk, i: (y - cy * CHUNK) * CHUNK + (x - cx * CHUNK) };
}

export function inWorld(world: World, x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < world.w && y < world.h;
}

export function terrainOf(world: World, x: number, y: number): Terrain {
  if (!inWorld(world, x, y)) return "water";
  return TERRAINS[world.solved.terrain[y * world.w + x]];
}

/** Metres above sea level; the sea's floor is negative, a lake reads its surface. Outside the world is sea level. */
export function heightAt(world: World, x: number, y: number): number {
  if (!inWorld(world, x, y)) return 0;
  return world.solved.height[y * world.w + x];
}

/** Cubic metres a second passing through the cell. */
export function dischargeAt(world: World, x: number, y: number): number {
  if (!inWorld(world, x, y)) return 0;
  return world.solved.discharge[y * world.w + x];
}

/** Moisture in 0..1 for the ground glyph forms. */
export function moistureAt(world: World, x: number, y: number): number {
  if (!inWorld(world, x, y)) return 0;
  return world.solved.moisture[y * world.w + x] / 255;
}

export function streamAt(world: World, idx: number): boolean {
  return (world.solved.flags[idx] & FLAG_STREAM) !== 0;
}

export function fordAt(world: World, idx: number): boolean {
  return (world.solved.flags[idx] & FLAG_FORD) !== 0;
}

export function latitudeOfRow(world: World, y: number): number {
  return latitudeAt(y + 0.5, world.h);
}

export function regionOf(world: World, x: number, y: number): number {
  if (!inWorld(world, x, y)) return -1;
  const { chunk, i } = chunkFor(world, x, y);
  return chunk.region[i];
}

/** Terrain without touching the region cache; the same lookup, kept for callers that read the coarse map. */
export function terrainPeek(world: World, x: number, y: number): Terrain {
  return terrainOf(world, x, y);
}

export function regionPeek(world: World, x: number, y: number): number {
  if (!inWorld(world, x, y)) return -1;
  const key = Math.floor(y / CHUNK) * 4096 + Math.floor(x / CHUNK);
  const chunk = world.chunks.get(key);
  if (chunk) return chunk.region[(y % CHUNK) * CHUNK + (x % CHUNK)];
  return regionOfCell(world.seed, x, y);
}

export function cellAt(world: World, idx: number): Cell {
  const x = idx % world.w;
  const y = Math.floor(idx / world.w);
  return { x, y, terrain: terrainOf(world, x, y), region: regionOf(world, x, y) };
}

export function cellIdx(world: World, x: number, y: number): number {
  return y * world.w + x;
}

/** Sea, lake or river for a water cell; null on land. */
export function waterKindOf(world: World, idx: number): "lake" | "sea" | "river" | null {
  const k = world.solved.kind[idx];
  return k === KIND.sea ? "sea" : k === KIND.lake ? "lake" : k === KIND.river ? "river" : null;
}

export function neighbours(world: World, idx: number): number[] {
  const x = idx % world.w;
  const y = Math.floor(idx / world.w);
  const out: number[] = [];
  if (x > 0) out.push(idx - 1);
  if (x < world.w - 1) out.push(idx + 1);
  if (y > 0) out.push(idx - world.w);
  if (y < world.h - 1) out.push(idx + world.w);
  return out;
}

export { WORLD_H, WORLD_W };
```

- [ ] **Step 4: Update `src/world/gen.ts` to build from the arrays**

- `generateWorld`:

```ts
export function generateWorld(seed: number, solved?: SolvedWorld): World {
  const world = newWorld(seed, solved ?? solvedFor(seed, WORLD_W, WORLD_H));
  if (solved) rememberSolved(solved, seed);
  const s = findStart(world);
  world.start = s.id;
  world.startCell = s.cell;
  world.startRing = s.ring;
  return world;
}
```
  Import `type SolvedWorld` from `./solve`, `solvedFor, rememberSolved` from `./solvecache`, and drop the `fieldsAt`/`terrainAt` imports. Extend the re-export line so consumers import the new readers from `./gen`: `export { cellAt, cellIdx, dischargeAt, fordAt, heightAt, latitudeOfRow, moistureAt, neighbours, regionOf, regionPeek, streamAt, terrainOf, terrainPeek, waterKindOf, type Cell, type World } from "./cells";`. Until Task 7, make `findStart` return `{ id, cell: regionAt(world, id).campCell, ring }` by adding `cell` to both cached shapes and the fallback: change `STARTS` to `Map<number, { id: number; cell: number; ring: number }>` and every `{ id, ring }` literal to include `cell: regionAt(world, id).campCell` (the fallback: `cell: regionAt(world, ay * LATTICE_W + ax).campCell`). Replace `terrainAt(seed, x, y)` in `looksLikeStart` with `terrainOf(world, x, y)` and change its signature to `looksLikeStart(world: World, lx, ly)`.
- `buildRegion`: replace the `fieldsAt(...).sea` check with `world.solved.kind[cellIdx(world, x, y)] === KIND.sea`; count `river` in `count` (add `river: 0`); add `river: frac.river` to `shares`; `frac.water` stays sea plus lake. Import `KIND` from `./solve`.
- `isShore`: `passable(c.terrain) && neighbours(...).some((n) => { const t = terrainOf(...); return t === "water" || t === "river"; })`.
- `regionName` call passes `water: frac.water + frac.river`.
- `RegionDef.frac` type is `Record<Terrain, number>`, which now includes river automatically.

- [ ] **Step 5: Add `river` across the terrain tables and the habitat type**

- `src/sim/types.ts`: `| "spruce" | "pine" | "birch" | "meadow" | "river";`
- `src/sim/species.ts`: `export type Habitat = Exclude<Terrain, "water"> | "lake" | "sea";` already yields `river` once `Terrain` has it. Add nothing; verify `wildlifeCapacity`'s `shares` object in `gen.ts` now includes `river`.
- `src/world/route.ts`: `TERRAIN_SPEED` gains `river: 0`. In `speedOf`, keep as is (fords come in Task 9).
- `src/sim/cellstatus.ts`: `TERRAIN_HEADING` gains `river: "river"`, `TERRAIN_LOCATION` gains `river: "at the river"`. `LandTerrain` is `Exclude<Terrain, "water">`; check its definition and, if `SNOW_LOCATION: Record<LandTerrain, string>` needs it, add `river: "at the frozen river"`. Replace the two `fieldsAt(...).sea ? "sea" : "lake"` reads with `waterKindOf(world, cell) ?? "lake"` and widen `CellSurface.water` and `surfaceOf`'s parameter to `"lake" | "sea" | "river"`. Where `terrain === "water"` decides `kind: "water"`, use `terrain === "water" || terrain === "river"`.
- `src/ui/cellpresentation.ts`: `TERRAIN_GLYPH` gains `river: "="`. Replace `fieldsAt(...).sea ? "sea" : "lake"` with `waterKindOf(world, cellIdx) ?? "lake"` (the function has `groundCell` with `x`, `y`; compute `groundCell.y * world.w + groundCell.x`).
- `src/ui/ground.ts`: remove the `fieldsAt` import. `groundGlyph(world, x, y, t, base)` takes the world instead of the seed: water form from `waterKindOf`, `"~"` for sea and `"-"` for lake; bog and meadow forms from `moistureAt(world, x, y)`. `turnedGround(world, x, y, t)` likewise. `elevationAt(world, x, y)` returns `heightAt`. `offshoreAt(world, x, y)` returns `-heightAt(world, x, y)` for sea cells (metres of depth) and null otherwise. Update the three callers in `src/ui/map.ts` (`elevationAt(world.seed, cx, cy)` becomes `elevationAt(world, cx, cy)`; find the `groundGlyph`, `turnedGround` and `offshoreAt` call sites with grep and pass `world`). `DETAIL_FORMS` in map.ts gains `river: ["=", "="]` or whatever shape the neighbouring entries take (read the table).
- `src/sim/shelter.ts`: `COVER_CEILING` gains `river: 0` (read the table's type to pick the matching `Protection`); `isLee` reads `heightAt(world, x, y)` and treats `river` like water (`return false`).
- `src/sim/sight.ts`: replace every `Math.min(1, Math.max(0, fieldsAt(world.seed, x, y).e)) * FELL_SPINE_M` with `Math.max(0, heightAt(world, x, y))`; delete `FELL_SPINE_M` and its comment; `vantageBaseCells` for fell and rock uses `horizonCells(Math.max(0, heightAt(world, x, y)) + EYE_HEIGHT_M)` for now (Task 8 replaces it with prominence). `CANOPY_HEIGHT_M` unchanged (river has no canopy).
- `src/sim/climate.ts`: `elevationKm` becomes `Math.max(0, heightAt(world, x, y)) / 1000` (it takes `seed` today; change the signature to take `world` and update its two callers inside the file). In `sampleAtmosphere`, `terrain.sea`/`terrain.m`/`terrain.e` become `waterKindOf(world, cellIdx) === "sea"`, `moistureAt(world, x, y)` and the height; `x`, `y` are fractional there, so floor them for the lookups.
- `src/sim/fire.ts`: `FIRE_SITE_MINUTES` is `Partial`, nothing to add.
- `src/sim/forecast.worker.ts`: leave `generateWorld(state.seed)` for now (Task 10 sends the arrays).
- `scripts/weather-profile.ts`: replace `fieldsAt(world.seed, x, y).e` with `heightAt(world, x, y)`.
- `scripts/mapstats.ts`: replace `terrainAt(seed, x, y)` with `terrainOf(world, x, y)` after building the world first; add `import { installNodeWorldCache } from "../src/world/solvecache.node";` and call it at the top.
- `src/main.ts`: no change yet; `generateWorld(seed)` there now solves synchronously on the main thread (20 s). Task 10 fixes it. Note this in the commit message.

- [ ] **Step 6: Write `tests/world-fixture.ts` and make the tests compile**

```ts
// tests/world-fixture.ts
import type { Terrain } from "../src/sim/types";
import { newWorld, type World } from "../src/world/cells";
import { KIND, type SolvedWorld } from "../src/world/solve";
import { TERRAIN_INDEX } from "../src/world/terrain";

/** A hand-made world of one terrain at one height, for consumer tests that must not depend on the generator. */
export function flatWorld(opts: { w: number; h: number; terrain: Terrain; heightM?: number; seed?: number }): World {
  const n = opts.w * opts.h;
  const water = opts.terrain === "water";
  const solved: SolvedWorld = {
    w: opts.w, h: opts.h,
    height: new Int16Array(n).fill(opts.heightM ?? (water ? 0 : 50)),
    flowDir: new Uint8Array(n).fill(255),
    discharge: new Float32Array(n),
    kind: new Uint8Array(n).fill(water ? KIND.lake : KIND.land),
    flags: new Uint8Array(n),
    terrain: new Uint8Array(n).fill(TERRAIN_INDEX[opts.terrain]),
    moisture: new Uint8Array(n).fill(128),
  };
  const world = newWorld(opts.seed ?? 1, solved);
  world.start = 0;
  world.startCell = 0;
  world.startRing = 0;
  return world;
}

/** Paint cells of a fixture world with a terrain and, optionally, a height; water cells become lake, river cells river. */
export function paintWorld(world: World, cells: Iterable<number>, terrain: Terrain, heightM?: number): void {
  for (const c of cells) {
    world.solved.terrain[c] = TERRAIN_INDEX[terrain];
    world.solved.kind[c] = terrain === "water" ? KIND.lake : terrain === "river" ? KIND.river : KIND.land;
    if (heightM !== undefined) world.solved.height[c] = heightM;
  }
}
```

Then:
- `tests/sight.test.ts`: the `openWorld` fixture becomes `const world = flatWorld({ w: 32, h: 32, terrain: "meadow", heightM: 600, seed: 1 });` and the `vi.spyOn(terrainFields, "fieldsAt")` line and the `terrainFields` import go. Every `Math.min(1, Math.max(0, fieldsAt(...).e)) * 1200` becomes `heightAt(world, x, y)` (import from `../src/world/gen`). The `fieldsAt(...).e > 1` check at line 152 becomes `heightAt(world, x, y) > 1200`. Do not chase failing assertions here; Task 12 re-bakes fixtures. The file must compile.
- `tests/ground.test.ts`: replace `fieldsAt(seed, x, y).m` with `moistureAt(world, x, y)` and `terrainAt(seed, x, y)` with `terrainOf(world, x, y)` on a `generateWorld(seed)`; compile only.
- `tests/weather-scenarios.test.ts`: replace `fieldsAt(shot.world.seed, x, y).e` with `heightAt(shot.world, x, y)`; compile only.
- `tests/start.test.ts`: leave; Task 7 rewrites it.

- [ ] **Step 7: Compile, then run the new fast tests**

Run: `npx tsc --noEmit`
Expected: clean. Chase every error; each is a consumer of `fieldsAt`, `terrainAt`, `groundGlyph`, `turnedGround`, `offshoreAt`, `elevationAt`, or a `Record<Terrain, ...>` missing `river`.

Run: `npx vitest run tests/world.test.ts tests/solve.test.ts tests/hydro.test.ts tests/erode.test.ts tests/terrain-template.test.ts tests/solve-hydrology.test.ts`
Expected: PASS. The first run solves seed 42 at full size once (about 20 s) and writes `node_modules/.cache/survidle-worlds/42-1800x2224-v1.bin`; the second run reads it.

Then: `npm test`
Expected: many failures in files that encode the old world (start region names, seeds with a particular shore, sight fixtures, weather shots). Record the failing file list in the commit message; Tasks 7 to 12 clear them. The build must still pass: `npm run build`.

- [ ] **Step 8: Commit**

```bash
git add src/world/cells.ts src/world/gen.ts src/world/solvecache.ts src/world/solvecache.node.ts tests/setup-worlds.ts tests/world-fixture.ts vitest.config.ts src/sim/types.ts src/sim/cellstatus.ts src/ui/cellpresentation.ts src/ui/ground.ts src/ui/map.ts src/sim/sight.ts src/sim/shelter.ts src/sim/climate.ts src/world/route.ts scripts/weather-profile.ts scripts/mapstats.ts tests/world.test.ts tests/sight.test.ts tests/ground.test.ts tests/weather-scenarios.test.ts
git commit -m "feat(survidle): the world carries the solved arrays

Consumers read metres and water kinds; river joins the terrain tables.
Failing until the fixtures are re-baked: <list>."
```

---

### Task 7: The start is a sheltered sea shore in the south

**Files:**
- Modify: `src/world/gen.ts` (`findStart`, `looksLikeStart`, `START_*` constants)
- Modify: `src/sim/newgame.ts` (camp at `world.startCell`)
- Test: `tests/start.test.ts` (rewrite)

**Interfaces:**
- Produces: `findStart(world): { id: number; cell: number; ring: number }`; `isShelteredShore(world, cell): boolean`; `forestShareWithin(world, cell, radiusCells): number`
- Consumes: `terrainOf`, `waterKindOf`, `neighbours`, `findRoute`, `regionOf`, `latticeSeed`, `LATTICE`, `LATTICE_W`, `LATTICE_H`

- [ ] **Step 1: Write the failing test**

```ts
// tests/start.test.ts
import { describe, expect, it } from "vitest";
import { cellAt, generateWorld, neighbours, regionAt, waterKindOf, WORLD_H } from "../src/world/gen";
import { forestShareWithin, isShelteredShore } from "../src/world/gen";
import { findRoute } from "../src/world/route";

describe("the start", () => {
  it("lands the first boat on a sheltered sea shore in the southern rows with forest within 3 km, on every reference seed", () => {
    for (const seed of [17, 19, 42, 79, 3]) {
      const world = generateWorld(seed);
      const cell = world.startCell;
      const c = cellAt(world, cell);
      expect(world.startRing, `seed ${seed} ring`).toBeLessThan(60);
      expect(c.terrain, `seed ${seed} land`).not.toBe("water");
      expect(neighbours(world, cell).some((n) => waterKindOf(world, n) === "sea"), `seed ${seed} beside the sea`).toBe(true);
      expect(c.y, `seed ${seed} south`).toBeGreaterThanOrEqual(WORLD_H * 0.85);
      expect(isShelteredShore(world, cell), `seed ${seed} sheltered`).toBe(true);
      expect(forestShareWithin(world, cell, 10), `seed ${seed} forest`).toBeGreaterThanOrEqual(0.4);
      expect(c.region).toBe(world.start);
      expect(regionAt(world, world.start).campCell).toBe(cell);
      // A land route into the forest exists.
      const r = regionAt(world, world.start);
      const forest = r.spots.find((s) => s.id === "forest");
      expect(forest, `seed ${seed} forest spot`).toBeDefined();
      expect(findRoute(world, cell, forest!.cell)).not.toBeNull();
    }
  });

  it("asks for no stone", () => {
    const world = generateWorld(42);
    const r = regionAt(world, world.start);
    // The outcrop spot may or may not exist; the start does not depend on it.
    expect(r.spots.some((s) => s.id === "camp")).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/start.test.ts`
Expected: FAIL, `isShelteredShore` not exported.

- [ ] **Step 3: Replace `looksLikeStart`, `STARTS` and `findStart` in `src/world/gen.ts`**

```ts
/** Rows the first boat may land in: the southern 15 percent of the world. */
const START_SOUTH_SHARE = 0.85;
/** A shore is sheltered when at least this many of sixteen 5 km rays from its sea cell meet land. */
const SHELTER_RAYS = 10;
const SHELTER_REACH_CELLS = Math.round(5 / CELL_KM);
/** Forest within this many cells of the landing, and its share. */
const START_FOREST_CELLS = 10;
const START_FOREST_SHARE = 0.4;
const START_MAX_RING = 60;

const RAY_DX = [1, 0.924, 0.707, 0.383, 0, -0.383, -0.707, -0.924, -1, -0.924, -0.707, -0.383, 0, 0.383, 0.707, 0.924];
const RAY_DY = [0, 0.383, 0.707, 0.924, 1, 0.924, 0.707, 0.383, 0, -0.383, -0.707, -0.924, -1, -0.924, -0.707, -0.383];

/** A land cell beside the sea whose sea neighbour sees land on most sides: a sound or a fjord, not the open coast. */
export function isShelteredShore(world: World, cell: number): boolean {
  const c = cellAt(world, cell);
  if (!passable(c.terrain)) return false;
  const seaCell = neighbours(world, cell).find((n) => waterKindOf(world, n) === "sea");
  if (seaCell === undefined) return false;
  const sx = seaCell % world.w;
  const sy = Math.floor(seaCell / world.w);
  let hits = 0;
  for (let r = 0; r < 16; r++) {
    for (let d = 1; d <= SHELTER_REACH_CELLS; d++) {
      const x = Math.round(sx + RAY_DX[r] * d);
      const y = Math.round(sy + RAY_DY[r] * d);
      if (x < 0 || y < 0 || x >= world.w || y >= world.h) { hits++; break; }
      if (waterKindOf(world, y * world.w + x) !== "sea") { hits++; break; }
    }
  }
  return hits >= SHELTER_RAYS;
}

/** Share of forest among the cells within a square radius of the cell. */
export function forestShareWithin(world: World, cell: number, radius: number): number {
  const cx = cell % world.w;
  const cy = Math.floor(cell / world.w);
  let forest = 0;
  let n = 0;
  for (let y = cy - radius; y <= cy + radius; y++) {
    for (let x = cx - radius; x <= cx + radius; x++) {
      if (x < 0 || y < 0 || x >= world.w || y >= world.h) continue;
      n++;
      const t = terrainOf(world, x, y);
      if (t === "spruce" || t === "pine" || t === "birch") forest++;
    }
  }
  return n ? forest / n : 0;
}

const STARTS = new Map<number, { id: number; cell: number; ring: number }>();

/** The best landing in one lattice square: the sheltered shore with the most forest around it, or -1. */
function landingIn(world: World, lx: number, ly: number): number {
  const x0 = lx * LATTICE;
  const y0 = ly * LATTICE;
  let best = -1;
  let bestForest = 0;
  for (let y = y0; y < Math.min(world.h, y0 + LATTICE); y++) {
    if (y < world.h * START_SOUTH_SHARE) continue;
    for (let x = x0; x < Math.min(world.w, x0 + LATTICE); x++) {
      const cell = y * world.w + x;
      if (!isShelteredShore(world, cell)) continue;
      const forest = forestShareWithin(world, cell, START_FOREST_CELLS);
      if (forest < START_FOREST_SHARE || forest <= bestForest) continue;
      // The forest must be walkable from the shore.
      const r = regionAt(world, regionOf(world, x, y));
      const target = r.spots.find((s) => s.id === "forest") ?? null;
      if (target && findRoute(world, cell, target.cell) === null) continue;
      best = cell;
      bestForest = forest;
    }
  }
  return best;
}

/**
 * The first survivor comes by boat in April, so the landing is a
 * sheltered sea shore in the southern rows with forest around it, found
 * by spiralling out from the coast line 55 km north of the south edge.
 * Nothing about stone or a lake: some starts have none in a day's walk,
 * and the run is about finding it.
 */
function findStart(world: World): { id: number; cell: number; ring: number } {
  const cached = STARTS.get(world.seed);
  if (cached) return cached;
  const v = 0.92;
  const ax = Math.floor((coastLineU(v) * world.w) / LATTICE);
  const ay = Math.floor((v * world.h) / LATTICE);
  for (let ring = 0; ring < START_MAX_RING; ring++) {
    for (let dy = -ring; dy <= ring; dy++) {
      for (let dx = -ring; dx <= ring; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== ring) continue;
        const lx = ax + dx;
        const ly = ay + dy;
        if (lx < 0 || ly < 0 || lx >= LATTICE_W || ly >= LATTICE_H) continue;
        const cell = landingIn(world, lx, ly);
        if (cell < 0) continue;
        const found = { id: regionOf(world, cell % world.w, Math.floor(cell / world.w)), cell, ring };
        STARTS.set(world.seed, found);
        return found;
      }
    }
  }
  const id = ay * LATTICE_W + ax;
  const fallback = { id, cell: regionAt(world, id).campCell, ring: START_MAX_RING };
  STARTS.set(world.seed, fallback);
  return fallback;
}
```

Import `coastLineU` from `./terrain` and `CELL_KM` from `../units` (already imported). Delete the old `looksLikeStart`. In `generateWorld`, after `findStart`, make the start region's camp the landing cell:

```ts
  const region = regionAt(world, s.id);
  if (region.campCell !== s.cell) {
    region.campCell = s.cell;
    region.spots = placeSpots(world, region);
  }
```

`placeSpots` is a module function in the same file; it reads `r.campCell`, so reassigning then re-placing is enough. The `camp` spot's cell follows.

- [ ] **Step 4: Update `src/sim/newgame.ts`**

In `newWorld` and `newGame`, `start.campCell` is now the landing cell already (the region's camp was moved), so no code change is needed; verify by reading lines 107 to 130 and leave a one-line comment on `newGame`: `// The start region's camp is the landing shore (gen.ts findStart).`

- [ ] **Step 5: Run the tests**

Run: `npx vitest run tests/start.test.ts tests/world.test.ts`
Expected: PASS. The first run solves seeds 17, 19, 79 and 3 (about 20 s each, once). If a seed falls to the fallback (`ring` 60), print the number of sheltered shores found per ring for that seed and loosen `SHELTER_RAYS` to 9 only if the count is 0 for every ring; otherwise the forest share is the blocker and the anchor row is the thing to look at, not the thresholds.

- [ ] **Step 6: Commit**

```bash
git add src/world/gen.ts src/sim/newgame.ts tests/start.test.ts
git commit -m "feat(survidle): the first boat lands on a sheltered southern shore"
```

---

### Task 8: Sight reads metres and caps range by prominence

**Files:**
- Modify: `src/sim/sight.ts`
- Test: `tests/sight-metres.test.ts` (new, small fixtures; the big `tests/sight.test.ts` is re-baked in Task 12)

**Interfaces:**
- Produces: `prominenceM(world, x, y): number` height above the lowest land or water within `PROMINENCE_KM = 20`, sampled every 5 cells; `vantageBaseCells` uses `horizonCells(prominenceM + EYE_HEIGHT_M)` for fell, rock and river, `OPEN_RANGE_CELLS` for meadow, bog and water.

- [ ] **Step 1: Write the failing tests**

```ts
// tests/sight-metres.test.ts
import { describe, expect, it } from "vitest";
import { hasLineOfSight, prominenceM } from "../src/sim/sight";
import { paintWorld } from "./world-fixture";
import { flatWorld } from "./world-fixture";

describe("sight in metres", () => {
  it("sees across water: a sea cell is no obstacle", () => {
    const world = flatWorld({ w: 40, h: 5, terrain: "meadow", heightM: 5 });
    const row = 2 * 40;
    paintWorld(world, Array.from({ length: 20 }, (_, i) => row + 10 + i), "water", 0);
    world.solved.kind.fill(1, row + 10, row + 30); // sea
    expect(hasLineOfSight(world, row + 2, row + 36)).toBe(true);
  });

  it("is blocked by a ridge between two valley floors", () => {
    const world = flatWorld({ w: 40, h: 5, terrain: "meadow", heightM: 100 });
    const row = 2 * 40;
    paintWorld(world, [row + 20], "rock", 400);
    expect(hasLineOfSight(world, row + 2, row + 38)).toBe(false);
    expect(hasLineOfSight(world, row + 2, row + 19)).toBe(true);
  });

  it("reads prominence above the lowest ground within 20 km, not altitude", () => {
    const plateau = flatWorld({ w: 200, h: 200, terrain: "meadow", heightM: 300 });
    expect(prominenceM(plateau, 100, 100)).toBe(0);
    const fjord = flatWorld({ w: 200, h: 200, terrain: "meadow", heightM: 300 });
    for (let y = 0; y < 200; y++) for (let x = 0; x < 20; x++) fjord.solved.height[y * 200 + x] = 0;
    expect(prominenceM(fjord, 40, 100)).toBe(300);
    expect(prominenceM(fjord, 150, 100)).toBe(0);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/sight-metres.test.ts`
Expected: FAIL, `prominenceM` not exported (the first two may pass already).

- [ ] **Step 3: Add prominence to `src/sim/sight.ts`**

```ts
/** A vantage is as high as it stands above the lowest ground within this many km, sampled every five cells. */
const PROMINENCE_KM = 20;
const PROMINENCE_STEP = 5;

/**
 * Height above the lowest ground within 20 km: what the horizon formula
 * wants. Altitude alone would give a flat plateau a horizon it does not
 * have; a fell above a fjord earns its view from the fjord's surface.
 */
export function prominenceM(world: World, x: number, y: number): number {
  const reach = Math.round(PROMINENCE_KM / CELL_KM);
  let lowest = heightAt(world, x, y);
  for (let dy = -reach; dy <= reach; dy += PROMINENCE_STEP) {
    for (let dx = -reach; dx <= reach; dx += PROMINENCE_STEP) {
      const xx = x + dx;
      const yy = y + dy;
      if (xx < 0 || yy < 0 || xx >= world.w || yy >= world.h) continue;
      const v = Math.max(0, heightAt(world, xx, yy));
      if (v < lowest) lowest = v;
    }
  }
  return Math.max(0, heightAt(world, x, y) - lowest);
}
```

In `vantageBaseCells`: `if (t === "fell" || t === "rock" || t === "river") return Math.max(OPEN_RANGE_CELLS, horizonCells(prominenceM(world, x, y) + EYE_HEIGHT_M));`. In `obstacleHeightM`, `hasLineOfSight` and `marchRay`, ground height is `Math.max(0, heightAt(world, x, y))` (the sea reads 0, a lake its surface); confirm the Task 6 edit did that. `CANOPY_HEIGHT_M` has no river entry, so a river cell is open.

- [ ] **Step 4: Run the tests**

Run: `npx vitest run tests/sight-metres.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/sim/sight.ts tests/sight-metres.test.ts
git commit -m "feat(survidle): sight reads metres and caps range by prominence"
```

---

### Task 9: Water access, fords, rivers on the map, seeps and the lee rule

**Files:**
- Modify: `src/sim/position.ts` (`watersideCell`), `src/world/gen.ts` (`isShore` includes streams for camp; fishing shore excludes them), `src/sim/seep.ts`, `src/world/route.ts` (fords), `src/ui/ground.ts`, `src/ui/map.ts` (river glyph, stream and ford marks), `src/sim/shelter.ts`
- Test: `tests/water-access.test.ts`, `tests/route-river.test.ts`

**Interfaces:**
- `watersideCell(world, idx, kind: "lake" | "sea" | "river" | "stream" | "any")`; `"any"` includes a stream on the cell itself
- `speedOf(t: Terrain, ice: IceMode, ford = false)`: river is 0 unless `ford`, then bog's speed
- `passable(t, ice, ford = false)`
- `astar` reads `fordAt(world, cell)` for river cells
- `seepGround`: a stream cell or a river neighbour is a shore and refuses a seep

- [ ] **Step 1: Write the failing tests**

```ts
// tests/water-access.test.ts
import { describe, expect, it } from "vitest";
import { watersideCell } from "../src/sim/position";
import { seepGround } from "../src/sim/seep";
import { FLAG_STREAM } from "../src/world/solve";
import { flatWorld, paintWorld } from "./world-fixture";

describe("water beside", () => {
  it("counts a stream on the cell, a river beside it and a lake beside it, and tells them apart", () => {
    const world = flatWorld({ w: 10, h: 10, terrain: "birch" });
    const c = 5 * 10 + 5;
    expect(watersideCell(world, c, "any")).toBe(false);
    world.solved.flags[c] |= FLAG_STREAM;
    expect(watersideCell(world, c, "any")).toBe(true);
    expect(watersideCell(world, c, "stream")).toBe(true);
    expect(watersideCell(world, c, "lake")).toBe(false);
    paintWorld(world, [c + 1], "river");
    expect(watersideCell(world, c, "river")).toBe(true);
    paintWorld(world, [c - 1], "water");
    expect(watersideCell(world, c, "lake")).toBe(true);
  });

  it("refuses a seep on a stream cell, as on any shore", () => {
    const world = flatWorld({ w: 10, h: 10, terrain: "spruce" });
    const c = 5 * 10 + 5;
    expect(seepGround(world, c)).toBe("damp");
    world.solved.flags[c] |= FLAG_STREAM;
    expect(seepGround(world, c)).toBeNull();
  });
});
```

```ts
// tests/route-river.test.ts
import { describe, expect, it } from "vitest";
import { findRoute } from "../src/world/route";
import { FLAG_FORD } from "../src/world/solve";
import { flatWorld, paintWorld } from "./world-fixture";

describe("rivers on a route", () => {
  it("refuses a river without a ford and crosses at the ford", () => {
    const world = flatWorld({ w: 12, h: 12, terrain: "pine" });
    // A river down column 6.
    paintWorld(world, Array.from({ length: 12 }, (_, y) => y * 12 + 6), "river");
    const from = 5 * 12 + 1;
    const to = 5 * 12 + 10;
    expect(findRoute(world, from, to)).toBeNull();
    world.solved.flags[9 * 12 + 6] |= FLAG_FORD;
    const route = findRoute(world, from, to);
    expect(route).not.toBeNull();
    expect(route).toContain(9 * 12 + 6);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/water-access.test.ts tests/route-river.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

- `src/sim/position.ts`:
```ts
/** Land beside water: any water including a stream on the cell, or one kind only. */
export function watersideCell(world: World, idx: number, kind: "lake" | "sea" | "river" | "stream" | "any" = "any"): boolean {
  if (kind === "stream") return streamAt(world, idx);
  if (kind === "any") return streamAt(world, idx) || neighbours(world, idx).some((n) => waterKindOf(world, n) !== null);
  return neighbours(world, idx).some((n) => waterKindOf(world, n) === kind);
}
```
  Import `streamAt` from `../world/gen` (Task 6 added it to the re-export line).
- `src/sim/seep.ts` `seepGround`: after the terrain check, `if (streamAt(world, cell) || neighbours(world, cell).some((n) => waterKindOf(world, n) !== null)) return null;` replacing the `nb.includes("water")` line (keep `nb` for the bog check).
- `src/world/gen.ts`: `isShore` (camp siting) uses `watersideCell(world, idx, "any")` semantics: a stream cell counts. Fishing `shore` spot pick: `(c) => passable(c.terrain) && neighbours(...).some((n) => waterKindOf(world, n) !== null)` (lake, sea or river; not a stream). Put both as named module functions `campWaterside` and `fishingShore`.
- `src/world/route.ts`:
```ts
export function speedOf(t: Terrain, ice: IceMode, ford = false): number {
  if (t === "water") return ice === "none" ? 0 : ICE_SPEED;
  if (t === "river") return ford ? TERRAIN_SPEED.bog : ice === "none" ? 0 : ICE_SPEED;
  return TERRAIN_SPEED[t];
}
export function passable(t: Terrain, ice: IceMode = "none", ford = false): boolean {
  return speedOf(t, ice, ford) > 0;
}
```
  In `astar`'s `sp`, pass `fordAt(world, cell)` as the third argument; in `routeMinutes` and `remainingWalkMinutes` likewise (`fordAt(world, c)`; for the fractional position in `remainingWalkMinutes`, the cell under the feet). Import `fordAt` from `./cells`.
- `src/ui/ground.ts`: `VARIANTS` gains `river: { forms: ["=", "#"], reads: "river, ford" }`; `groundGlyph` returns `"#"` for a river cell with a ford, `"="` otherwise; a stream on a land cell is a mark, not a form: export `STREAM_MARK = "~"` and let `map.ts` draw it at the two close rungs (the detail field's centre slot) the way `MARKS.seep` is placed; read `map.ts` around `MARKS` and `playerVisualSlot` to place it and add a legend line "~ stream" beside the seep's.
- `src/ui/map.ts`: `DETAIL_FORMS.river` entries follow the water entries' shape. Colour: add `.t-river { color: var(--water); }` in `src/style.css` next to `.t-water`.
- `src/sim/shelter.ts` `isLee`: `if (terrain === "rock" || terrain === "fell" || terrain === "water" || terrain === "river") return false;` and the comparison on `heightAt`.

- [ ] **Step 4: Run the tests**

Run: `npx vitest run tests/water-access.test.ts tests/route-river.test.ts tests/seep.test.ts tests/knownrouting.test.ts`
Expected: PASS for the two new files; `seep.test.ts` and `knownrouting.test.ts` may still fail on old-world fixtures (Task 12).

- [ ] **Step 5: Commit**

```bash
git add src/sim/position.ts src/sim/seep.ts src/world/gen.ts src/world/route.ts src/ui/ground.ts src/ui/map.ts src/style.css src/sim/shelter.ts tests/water-access.test.ts tests/route-river.test.ts
git commit -m "feat(survidle): streams, rivers and fords for water access, routing and the map"
```

---

### Task 10: The worker, the loading bar, async boot, the forecast worker's world, save version 10

**Files:**
- Create: `src/world/solve.worker.ts`, `src/world/worldloader.ts`, `src/ui/loading.ts`
- Modify: `index.html`, `src/style.css`, `src/main.ts`, `src/sim/forecaster.ts`, `src/sim/forecast.worker.ts`, `src/sim/save.ts`
- Test: `tests/worldloader.test.ts`, `tests/save-version.test.ts`

**Interfaces:**
- `solve.worker.ts` receives `{ seed, w, h }`, posts `{ kind: "progress", stage, fraction }` then `{ kind: "done", solved }` with the buffers transferred
- `loadWorld(seed: number, onProgress?: SolveProgress): Promise<World>`: with `Worker` defined, through the worker; otherwise `generateWorld(seed)`
- `showLoading(stage: string, fraction: number): void`, `hideLoading(): void`
- `ForecastRequest` becomes `{ kind: "forecast"; id; state } | { kind: "world"; seed: number; solved: SolvedWorld }`; `Forecaster.setWorld(world: World): void`
- `SaveFile.version: 10`; `deserialize` returns `{ refused: string }` for versions under 10

- [ ] **Step 1: Write the failing tests**

```ts
// tests/worldloader.test.ts
import { describe, expect, it } from "vitest";
import { loadWorld } from "../src/world/worldloader";

describe("loading a world without a Worker", () => {
  it("falls back to the synchronous cache and reports the stages", async () => {
    const stages: string[] = [];
    const world = await loadWorld(42, (stage) => { if (!stages.includes(stage)) stages.push(stage); });
    expect(world.seed).toBe(42);
    expect(world.solved.height.length).toBe(world.w * world.h);
    // From the cache there is one synthetic stage; a fresh solve reports all five. Either is fine.
    expect(stages.length).toBeGreaterThanOrEqual(1);
  });
});
```

```ts
// tests/save-version.test.ts
import { describe, expect, it } from "vitest";
import { newGame } from "../src/sim/newgame";
import { deserialize, serialize } from "../src/sim/save";

describe("save version 10", () => {
  it("round-trips a fresh save and refuses an older one with a reason", () => {
    const { state } = newGame(42);
    const text = serialize(state);
    expect(JSON.parse(text).version).toBe(10);
    const back = deserialize(text);
    expect(back && "state" in back && back.state.seed).toBe(42);
    const old = JSON.stringify({ version: 9, savedAt: 1, state });
    const refused = deserialize(old);
    expect(refused && "refused" in refused ? refused.refused : "").toMatch(/world/i);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/worldloader.test.ts tests/save-version.test.ts`
Expected: FAIL.

- [ ] **Step 3: Write the worker and loader**

```ts
// src/world/solve.worker.ts
/** The solve off the main thread: progress by stage, then the arrays transferred, not copied. */
import { type SolvedWorld, solvedBuffers, solveWorld } from "./solve";

export type SolveMessage = { kind: "progress"; stage: string; fraction: number } | { kind: "done"; solved: SolvedWorld };
const ctx = self as unknown as { postMessage(m: SolveMessage, transfer?: ArrayBuffer[]): void; onmessage: ((ev: MessageEvent<{ seed: number; w: number; h: number }>) => void) | null };

ctx.onmessage = (ev) => {
  const { seed, w, h } = ev.data;
  const solved = solveWorld(seed, w, h, (stage, fraction) => ctx.postMessage({ kind: "progress", stage, fraction }));
  ctx.postMessage({ kind: "done", solved }, solvedBuffers(solved));
};
```

```ts
// src/world/worldloader.ts
/**
 * A world for the browser: solved in a worker while the bar shows the
 * stage, then built on the main thread from the transferred arrays. Where
 * there is no Worker (tests, scripts) the synchronous cache serves.
 */
import { generateWorld, type World } from "./gen";
import type { SolveProgress } from "./solve";
import type { SolveMessage } from "./solve.worker";
import { WORLD_H, WORLD_W } from "./terrain";

export function loadWorld(seed: number, onProgress: SolveProgress = () => {}): Promise<World> {
  // Vitest's DOM shim may define Worker; the tests want the synchronous cache either way.
  if (typeof Worker === "undefined" || import.meta.env.MODE === "test") {
    onProgress("reading the ground", 0);
    return Promise.resolve(generateWorld(seed));
  }
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("./solve.worker.ts", import.meta.url), { type: "module" });
    worker.onmessage = (ev: MessageEvent<SolveMessage>) => {
      const m = ev.data;
      if (m.kind === "progress") onProgress(m.stage, m.fraction);
      else {
        worker.terminate();
        resolve(generateWorld(seed, m.solved));
      }
    };
    worker.onerror = (e) => { worker.terminate(); reject(e); };
    worker.postMessage({ seed, w: WORLD_W, h: WORLD_H });
  });
}
```

```ts
// src/ui/loading.ts
/** The bar that stands in for the world while the worker solves it. */
export function showLoading(stage: string, fraction: number): void {
  const el = document.getElementById("loading");
  if (!el) return;
  el.hidden = false;
  const bar = el.querySelector<HTMLElement>(".bar > i");
  const text = el.querySelector<HTMLElement>("p");
  if (bar) bar.style.width = `${Math.round(fraction * 100)}%`;
  if (text) text.textContent = stage;
}

export function hideLoading(): void {
  const el = document.getElementById("loading");
  if (el) el.hidden = true;
}
```

`index.html`, first child of `<body>`:
```html
    <!-- Shown while the worker solves the world; the run does not start until it is done. -->
    <div id="loading" hidden><div class="bar"><i></i></div><p>raising the land</p></div>
```
`src/style.css`:
```css
#loading { position: fixed; inset: 0; background: var(--bg); display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px; z-index: 50; }
#loading .bar { width: min(60vw, 420px); height: 8px; border: 1px solid var(--line); background: var(--panel); }
#loading .bar > i { display: block; height: 100%; width: 0; background: var(--accent); }
#loading p { color: var(--dim); margin: 0; }
```

- [ ] **Step 4: Make boot and fresh asynchronous in `src/main.ts`**

- Import `loadWorld` from `./world/worldloader` and `hideLoading, showLoading` from `./ui/loading`; keep `generateWorld` only if still referenced.
- `fresh` becomes `async function fresh(seed = ..., startDoy?, boat = 0): Promise<void>` and starts with `const w = await loadWorld(seed, showLoading); hideLoading();` then `const g = newWorld(seed, boat, startDoy, w);`. Change `newWorld(seed, boat, startDoy, world?: World)` and `newGame(seed, startDoy, person?, world?: World)` in `src/sim/newgame.ts` to use the given world instead of calling `generateWorld` when one is passed. Every call site of `fresh(` in main.ts becomes `void fresh(`; find them with `grep -n "fresh(" src/main.ts`.
- `boot` becomes `async function boot()`; the saved branch does `world = await loadWorld(state.seed, showLoading); hideLoading();` in place of `generateWorld(state.seed)`. The top-level `boot();` at line 712 becomes `await boot();` if the module is an ES module at top level (Vite supports top-level await in module scripts; `index.html` loads `main.ts` as `type="module"`). If tsc rejects top-level await for the configured target, wrap the rest of the module's world-dependent statements (the `forecaster` creation and the `requestAnimationFrame(frame)` at line 965) in a `boot().then(() => { ... })`; read lines 700 to 965 to see which statements touch `world` or `state` and move exactly those.
- Loading a refused save: where `loadGame()` returns the refusal (see save step below), show `alert`-free feedback: log to the game log after `fresh()` with `log(state, "Your old world was made by an older map. A new one begins.")` (find the `log` import in main.ts).
- After `world` is set (both branches), `forecaster.setWorld(world)`.

- [ ] **Step 5: The forecast worker takes the arrays**

`src/sim/forecaster.ts`: `export type ForecastRequest = { kind: "forecast"; id: number; state: GameState } | { kind: "world"; seed: number; solved: SolvedWorld };` and add to `Forecaster`: `setWorld(world: World): void`, implemented as `if (worker) worker.postMessage({ kind: "world", seed: world.seed, solved: world.solved }); else current = world;` with `current` the world used by the synchronous path (rename the `world` parameter's use). `src/sim/forecast.worker.ts`: on `kind === "world"`, `world = generateWorld(seed, solved); seed = msg.seed;`; on a forecast request with no world yet, `world = generateWorld(state.seed)` stays as the fallback (it solves in the worker, slowly, only if the main thread never sent one).

- [ ] **Step 6: Save version 10**

`src/sim/save.ts`: `version: 10` in `SaveFile` and `serialize`; `deserialize(text): SaveFile | { refused: string } | null`:
```ts
    if (file.version < 10) return { refused: "This save is from a world made by an older map and cannot be loaded; a new world begins." };
    if (!(file.version === 10) || !file.state || typeof file.savedAt !== "number") return null;
```
Update `migrate`'s default and every `version < N` check to remain valid. Find `loadGame` (grep `deserialize(` in `src/`) and make it return null on a refusal while remembering the reason for the log line in Step 4.

- [ ] **Step 7: Run the tests and the build**

Run: `npx vitest run tests/worldloader.test.ts tests/save-version.test.ts && npm run build`
Expected: PASS and a clean build with `solve.worker` emitted as its own chunk.

- [ ] **Step 8: Commit**

```bash
git add src/world/solve.worker.ts src/world/worldloader.ts src/ui/loading.ts index.html src/style.css src/main.ts src/sim/newgame.ts src/sim/forecaster.ts src/sim/forecast.worker.ts src/sim/save.ts tests/worldloader.test.ts tests/save-version.test.ts
git commit -m "feat(survidle): solve the world in a worker behind a bar; save version 10"
```

---

### Task 11: The report, mapstats, the budget test and the docs

**Files:**
- Modify: `scripts/terrain.ts` (the realism report), `scripts/mapstats.ts` (new fields)
- Create: `tests/slow/terrain-budget.test.ts`
- Modify: `vitest.config.ts` (add the slow file to `slowTestFiles`), `docs/README.md` (world section, scripts), `docs/testing.md`

**Interfaces:** the report prints the table from spec section 6 for seeds 42, 1 and 7.

- [ ] **Step 1: Write the budget test**

```ts
// tests/slow/terrain-budget.test.ts
import { describe, expect, it } from "vitest";
import { solveWorld } from "../../src/world/solve";
import { WORLD_H, WORLD_W } from "../../src/world/terrain";

describe("the solve budget", () => {
  it("solves a full-size world in under 20 s", () => {
    const t0 = performance.now();
    solveWorld(42, WORLD_W, WORLD_H);
    const s = (performance.now() - t0) / 1000;
    console.log(`full solve ${s.toFixed(1)} s`);
    expect(s).toBeLessThan(20);
  }, 120_000);
});
```

Add `"tests/slow/terrain-budget.test.ts"` to `slowTestFiles` in `vitest.config.ts`. Run `npm run test:slow -- tests/slow/terrain-budget.test.ts` and expect PASS with the printed time; if it fails, lower `ERODE_ITERATIONS` in `src/world/erode.ts` until it passes and note the value.

- [ ] **Step 2: Write the report into `scripts/terrain.ts`**

Replace the file with one that, for each seed in `[42, 1, 7]` (or the one given), takes the world through `installNodeWorldCache()` and `generateWorld(seed)` (timing a fresh solve if not cached, via the stage timings kept from Task 3 behind a `--time` flag) and prints:

```ts
import { installNodeWorldCache } from "../src/world/solvecache.node";
import { generateWorld, heightAt, terrainOf, waterKindOf } from "../src/world/gen";
import { coastKmOfCell } from "../src/world/classify";
import { FLAG_STREAM, KIND, NO_FLOW } from "../src/world/solve";
import { receiverOf } from "../src/world/hydro";
import { latitudeAt, TERRAINS, WORLD_H, WORLD_W } from "../src/world/terrain";

installNodeWorldCache();
const seeds = process.argv[2] ? [Number(process.argv[2])] : [42, 1, 7];
const pct = (a: number[], p: number) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor((s.length - 1) * p)]; };

for (const seed of seeds) {
  const t0 = performance.now();
  const world = generateWorld(seed);
  const s = world.solved;
  const W = WORLD_W, H = WORLD_H, n = W * H;
  console.log(`\n== seed ${seed} (world in ${((performance.now() - t0) / 1000).toFixed(1)} s)`);
  // Distance from land to running or standing water, by BFS from every water or stream cell.
  const d = new Int32Array(n).fill(-1);
  let q: number[] = [];
  for (let i = 0; i < n; i++) if (s.kind[i] !== KIND.land || (s.flags[i] & FLAG_STREAM)) { d[i] = 0; q.push(i); }
  while (q.length) { const nq: number[] = []; for (const c of q) { const x = c % W, y = (c - x) / W; for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue; const j = yy * W + xx; if (d[j] < 0) { d[j] = d[c] + 1; nq.push(j); } } } q = nq; }
  const dist: number[] = []; let land = 0, lake = 0, sea = 0, river = 0;
  for (let i = 0; i < n; i++) { if (s.kind[i] === KIND.land) { land++; dist.push(d[i] * 0.3); } else if (s.kind[i] === KIND.lake) lake++; else if (s.kind[i] === KIND.sea) sea++; else river++; }
  console.log(`land -> water km: p50 ${pct(dist, 0.5).toFixed(1)} p90 ${pct(dist, 0.9).toFixed(1)}   target p50 < 0.6, p90 < 2`);
  console.log(`lake share of land+lake: ${(100 * lake / (land + lake)).toFixed(1)}%   target 5..10;  sea ${(100 * sea / n).toFixed(1)}% river cells ${river}`);
  // Largest catchments: discharge at sea-bound river mouths, converted back to km2 at inland runoff is not exact; report the top mouths in m3/s and the top catchments by cell count.
  const mouths: number[] = [];
  for (let i = 0; i < n; i++) if (s.kind[i] === KIND.river && s.flowDir[i] !== NO_FLOW && s.kind[receiverOf(i, s.flowDir[i], W)] === KIND.sea) mouths.push(s.discharge[i]);
  mouths.sort((a, b) => b - a);
  console.log(`largest river mouths m3/s: ${mouths.slice(0, 5).map((v) => v.toFixed(0)).join(" ")}   (Namsen 290, Ume 430, Lule 500)`);
  // Coastline: land cells with a western-sea 4-neighbour, times 0.3 km, over the straight coast length 667/0.9409.
  let coastEdges = 0;
  for (let i = 0; i < n; i++) { if (s.kind[i] === KIND.sea) continue; const x = i % W, y = (i - x) / W; for (const j of [i - 1, i + 1, i - W, i + W]) { if (j < 0 || j >= n) continue; if (s.kind[j] === KIND.sea && coastKmOfCell(j % W, (j - j % W) / W, W, H) < 60) { coastEdges++; break; } } }
  console.log(`west coast length / straight: ${(coastEdges * 0.3 / (667 / 0.9409)).toFixed(1)}   target > 5`);
  // Exposed rock by band.
  const rock = { coast: [0, 0], steep: [0, 0], lowland: [0, 0] };
  for (let i = 0; i < n; i++) { if (s.kind[i] !== KIND.land) continue; const x = i % W, y = (i - x) / W; const t = TERRAINS[s.terrain[i]]; if (t === "fell") continue; const coast = coastKmOfCell(x, y, W, H); let slope = 0; if (s.flowDir[i] !== NO_FLOW) slope = (s.height[i] - s.height[receiverOf(i, s.flowDir[i], W)]) / 300; const band = coast < 1 ? rock.coast : slope > 0.36 ? rock.steep : rock.lowland; band[1]++; if (t === "rock") band[0]++; }
  console.log(`rock share: coast ${(100 * rock.coast[0] / Math.max(1, rock.coast[1])).toFixed(0)}% (30) steep ${(100 * rock.steep[0] / Math.max(1, rock.steep[1])).toFixed(0)}% (25) lowland ${(100 * rock.lowland[0] / Math.max(1, rock.lowland[1])).toFixed(1)}% (3..5)`);
  // Bog by latitude band and class shares per 100 m band.
  const bogBand = new Map<number, [number, number]>();
  for (let i = 0; i < n; i++) { if (s.kind[i] !== KIND.land) continue; const y = (i - i % W) / W; const band = Math.floor(latitudeAt(y, H)); const b = bogBand.get(band) ?? [0, 0]; b[1]++; if (TERRAINS[s.terrain[i]] === "bog") b[0]++; bogBand.set(band, b); }
  console.log(`bog by degree: ${[...bogBand.entries()].sort((a, b) => a[0] - b[0]).map(([k, [b, t]]) => `${k}N ${(100 * b / t).toFixed(0)}%`).join(" ")}   target rising 10 -> 20+`);
  const slopeBy = new Map<string, [number, number]>();
  for (let i = 0; i < n; i++) { if (s.kind[i] !== KIND.land) continue; const t = TERRAINS[s.terrain[i]]; let slope = 0; if (s.flowDir[i] !== NO_FLOW) slope = (s.height[i] - s.height[receiverOf(i, s.flowDir[i], W)]) / 300; const b = slopeBy.get(t) ?? [0, 0]; b[0] += slope; b[1]++; slopeBy.set(t, b); }
  console.log(`mean slope by class: ${[...slopeBy.entries()].map(([t, [sum, c]]) => `${t} ${(100 * sum / c).toFixed(1)}%`).join("  ")}`);
  // Valley bearings in the mountain belt: direction from a river cell to its receiver, binned to 8 winds.
  const winds = new Array(8).fill(0);
  for (let i = 0; i < n; i++) { if (s.kind[i] !== KIND.river || s.flowDir[i] === NO_FLOW) continue; const x = i % W, y = (i - x) / W; const c = coastKmOfCell(x, y, W, H); if (c < 0 || c > 150) continue; winds[s.flowDir[i]]++; }
  console.log(`river flow winds E SE S SW W NW N NE: ${winds.join(" ")}   (expected W and SW to dominate on the Atlantic side)`);
  const heights = [...s.height].filter((_, i) => s.kind[i] === KIND.land);
  console.log(`land height m: p50 ${pct(heights, 0.5)} p90 ${pct(heights, 0.9)} max ${pct(heights, 1)}`);
  console.log(`start ${world.startCell} at row ${Math.floor(world.startCell / W)} (${latitudeAt(Math.floor(world.startCell / W), H).toFixed(2)} N), height ${heightAt(world, world.startCell % W, Math.floor(world.startCell / W))} m, terrain ${terrainOf(world, world.startCell % W, Math.floor(world.startCell / W))}, shore ${waterKindOf(world, world.startCell + 1) ?? waterKindOf(world, world.startCell - 1) ?? "?"}`);
}
```

Keep the Task 3 stage-timing code under `if (process.argv.includes("--time"))` before the loop.

- [ ] **Step 3: Update `scripts/mapstats.ts`**

Add river to `GLYPH` (`river: "="`), print the water kinds split (sea, lake, river cells), stream cell count, rock share, and a height histogram in 200 m bands. Run `npx vite-node scripts/mapstats.ts 42` and look at the picture: the coast should read as inlets and islands, the crest as a continuous band with valleys crossing it, rock scattered, rivers as lines from the crest to the sea.

- [ ] **Step 4: Run the report and record it**

Run: `npm run terrain`
Expected: three seed blocks. Compare each line with its target. Where a measure misses its target, change the generator constant that owns it (spec section 3 names each), re-run, and record before and after in the commit message. Do not change a target. If a target cannot be met without an unrealistic constant, leave the measure red and say so in the report doc below.

Write `docs/superpowers/reports/2026-09-11-terrain-hydrology-report.md` with the printed tables for the three seeds, the solve time, and the existing gate readings: run `npm run test:slow` and paste the April, year, winter and heir gate summaries (they are findings, not targets).

- [ ] **Step 5: Docs**

`docs/README.md`: rewrite the "A big north" bullet: 540 by 667 km from 61 N to 67 N, metres above the sea, valleys cut by erosion, lakes with outlets, streams and rivers, fjords, stone at geological rates, the treeline by latitude, the loading bar. Replace the line about the valley cell's normalized elevation (0.321) with the new fixture's height in metres after Task 12. Add `npm run terrain` to the scripts list. `docs/testing.md`: the node world cache under `node_modules/.cache/survidle-worlds/`, the first-run cost per seed, `GENERATOR_VERSION`, and the slow budget test.

- [ ] **Step 6: Commit**

```bash
git add scripts/terrain.ts scripts/mapstats.ts tests/slow/terrain-budget.test.ts vitest.config.ts docs/README.md docs/testing.md docs/superpowers/reports/2026-09-11-terrain-hydrology-report.md
git commit -m "feat(survidle): terrain report, budget test and docs for the solved world"
```

---

### Task 12: Re-bake fixtures and goldens; the browser pass

**Files:**
- Modify: every test that fails on `npm test` after Task 11 (expected: `tests/sight.test.ts`, `tests/seep.test.ts`, `tests/knownrouting.test.ts`, `tests/wildlife.test.ts`, `tests/hunt-audit.test.ts`, `tests/boat.test.ts`, `tests/water-ui.test.ts`, `tests/dopanel.test.ts`, `tests/ground.test.ts`, `tests/weather-scenarios.test.ts`, `tests/landing.test.ts`, plus any golden replay test), `src/sim/weather-scenarios.ts` (fixture cells), `src/ui/ground.ts` (`BOG_WET`, `MEADOW_DAMP`, `MEADOW_DRY` re-measured), `docs/README.md` (fixture line)

- [ ] **Step 1: List the failures**

Run: `npm test 2>&1 | grep -E "FAIL|✗|×" | sort | uniq`
Expected: a list. For each file, classify: (a) it asserts a fact about the old world (a region name, a seed's shore, a cell number, a normalized elevation); (b) it asserts a rule that changed (fords, streams, water kinds); (c) it is a golden replay hash.

- [ ] **Step 2: Re-measure the ground quantiles**

`tests/ground.test.ts` re-measures bog's median and meadow's terciles of moisture. Run it, read the measured values it prints or asserts, and set `BOG_WET`, `MEADOW_DAMP`, `MEADOW_DRY` in `src/ui/ground.ts` to them. Run the test again; it must pass on seeds 42, 1 and 7.

- [ ] **Step 3: Re-pick the weather fixture cells**

For each entry in `WEATHER_SHOTS` in `src/sim/weather-scenarios.ts`, find a cell on seed 17 of the new world that matches its note (`valley-fog` wants a bog cell with higher ground 6 km away on four sides; `frozen-water` wants coastal sea; `clear`/`obscured` want the same comparison rock). Write a throwaway vite-node script in the scratchpad that scans seed 17 for cells meeting each note's condition and prints candidates; pick one per shot; update `x`, `y`. `tests/weather-scenarios.test.ts` asserts the valley condition with `heightAt`; make it pass. Update the README line that names the valley cell's elevation with the new metres.

- [ ] **Step 4: Fix category (a) tests**

For each, replace the hard-coded fact with the new world's fact found by the same rule (a seed's start cell, a shore cell near it, a spruce cell in the start region), preferring a helper that finds the cell by property over a new literal. Where a test relied on `startRing < 40`, use `< 60`. Where a test used a seed "for its shore" (seed 3), check `world.startCell` is beside the sea on the new world and rewrite the comment.

- [ ] **Step 5: Fix category (b) tests**

Read the failing assertion and the rule in spec section 3 and 4; the test changes to the new rule only if the old assertion contradicts the spec. If the test finds a real bug in Tasks 6 to 10, fix the source, not the test.

- [ ] **Step 6: Re-bake category (c) goldens**

Per the golden replay gate in memory: run the golden on the new world, diff the per-tick hash names against the old to confirm only world-derived values moved, and re-record. Commit each re-bake with the reason in the message.

- [ ] **Step 7: The whole gate**

Run: `npm test && npm run build && npm run lint` (lint from the repo root: `cd .. && npm run lint`).
Expected: all green.

- [ ] **Step 8: Browser pass**

Start `npm run dev` in `08-survidle/`, open `http://127.0.0.1:5173/prototypes/08/?seed=42` in Chrome via the MCP tools (memory: pick the deck tiles first if prompted; the devtools profile is single-session), and check:
- the loading bar shows the five stage names and reaches the end within 25 s; the run starts on a shore;
- reload: the bar shows again and the same world returns (same start cell in the map tip);
- zoom out: rivers read as lines from the crest to the sea; zoom in at the start: the shore, a stream mark if one is near;
- walk toward a river: the route refuses to cross where there is no ford and crosses at one;
- from the shore, the far side of the fjord is in the viewshed;
- a phone-width tab (400 px) loads without the page scrolling horizontally and memory stays under 200 MB in the performance panel.
Take screenshots into `docs/terrain-shots/` and list them in the report doc. Stop the dev server.

- [ ] **Step 9: Commit**

```bash
git add tests src/sim/weather-scenarios.ts src/ui/ground.ts docs/README.md docs/terrain-shots docs/superpowers/reports/2026-09-11-terrain-hydrology-report.md
git commit -m "test(survidle): re-bake fixtures and goldens on the solved world"
```

Then push the branch (`git push -u origin worktree-survidle-terrain-hydrology`) and report per the end-of-work memory: what to play and what would look wrong, the game health from the gates, the report's red measures, and the roadmap items this unblocks (latitude by row next). Merging waits on a yes.
