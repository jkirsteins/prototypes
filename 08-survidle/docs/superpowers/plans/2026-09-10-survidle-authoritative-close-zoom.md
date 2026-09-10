# Survidle Authoritative Close Zoom Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace cosmetic close-map subdivisions with an authoritative 50 m simulation grid whose terrain, movement, routing, interactions, environment, and wildlife remain performant at the existing world scale.

**Architecture:** A lazy 50 m lattice is the only mechanical cell model. Larger map scales and long-distance routes use discardable summaries derived from those patches; exact component and portal data preserve fine traversibility. Player and wildlife positions share metre coordinates, while sparse changed state and knowledge use fine patch ids.

**Tech Stack:** TypeScript, Vite, Vitest, jsdom, typed arrays, deterministic seeded noise, headless Chrome through the existing DevTools protocol pattern.

**Spec:** `docs/superpowers/specs/2026-09-10-survidle-authoritative-close-zoom-design.md`

## Global Constraints

- Work only in `/Users/janis.kirsteins/Projects/prototypes/.worktrees/survidle-authoritative-close-zoom` on branch `survidle/authoritative-close-zoom`.
- Base patches are exactly 50 m square; the physical world remains about 540 by 390 km.
- Terrain generation starts from fine physical fields. Old 300 m terrain may not constrain fine children.
- Player and wildlife canonical positions use metres. Location-owned state uses fine patch ids.
- Fine routing allows eight directions, charges `sqrt(2)` for diagonals, and forbids diagonal corner-cutting.
- A 300 m routing summary represents exact connected components and boundary portals, never one assumed traversible node.
- No whole-world fine allocation, whole-world fine scan, or unbounded direct fine-grid route search.
- Generated terrain and caches are not saved. Changed state and knowledge remain sparse.
- Old saves are rejected explicitly; no spatial save migration is required.
- The 50 m and 100 m map views contain no cosmetic micro terrain.
- No application code may recognize or special-case the comparison seed or screenshot scene.
- Preserve the repository's ASCII-only output rule and run `npm test` plus `npm run build` before completion.
- Run npm, Vitest, and build commands from `08-survidle/`. Run git commands from the repository worktree root.

---

## File Structure

New focused modules:

- `src/world/spatial.ts`: metre, fine-patch, parent, and aggregate coordinate conversions.
- `src/world/fine-terrain.ts`: continuous physical fields and fine terrain classification.
- `src/world/aggregate.ts`: bottom-up terrain, obstruction, resource, and knowledge summaries.
- `src/world/fine-route.ts`: fine neighbors, direct bounded oracle, parent topology, portal A*, and route reconstruction.
- `src/sim/knowledge.ts`: chunked current-life and inherited knowledge bit fields.
- `src/sim/world-version.ts`: save/world version constants and compatibility result.
- `tests/spatial.test.ts`: coordinate and diagonal-neighbor contracts.
- `tests/fine-terrain.test.ts`: field scale, determinism, and mixed-terrain contracts.
- `tests/aggregate.test.ts`: exact bottom-up summary and invalidation contracts.
- `tests/fine-route.test.ts`: corner, component, portal, oracle, and cache contracts.
- `tests/knowledge.test.ts`: compact chunk knowledge and serialization contracts.
- `tests/close-zoom.test.ts`: authoritative rendering and click-resolution contracts.
- `tests/spatial-performance.test.ts`: deterministic work counters and broad timing ceilings.
- `scripts/close-zoom-shots.mjs`: reusable real-flow before/after close-zoom capture harness.

Existing modules retain their responsibilities but move to fine patch ids and metre positions:

- `src/world/terrain.ts`, `src/world/cells.ts`, `src/world/gen.ts`, `src/world/route.ts`
- `src/sim/types.ts`, `src/sim/position.ts`, `src/sim/routing.ts`, `src/sim/tasks.ts`
- `src/sim/newgame.ts`, `src/sim/save.ts`, `src/sim/mapped.ts`, `src/sim/sight.ts`
- `src/sim/weather.ts`, `src/sim/cellstatus.ts`, `src/sim/inventory.ts`, `src/sim/regionstate.ts`
- `src/sim/wildlife-space.ts`, `src/sim/wildlife-agents.ts`, `src/sim/hunting.ts`
- `src/ui/map.ts`, `src/ui/cellpresentation.ts`, `src/ui/render.ts`, `src/main.ts`, `src/style.css`

---

### Task 1: Explicit spatial primitives

**Files:**
- Create: `src/world/spatial.ts`
- Create: `tests/spatial.test.ts`
- Modify: `src/units.ts`

**Interfaces:**
- Produces: `PatchId`, `MetricPoint`, `PATCH_M`, `PATCH_KM`, `FINE_PER_PARENT`, `WORLD_FINE_W`, `WORLD_FINE_H`.
- Produces: `patchId(x, y)`, `patchXY(id)`, `patchAtMetric(point)`, `patchCenter(id)`, `parentXY(id)`, `parentKey(px, py)`, `aggregateBounds(gx, gy, finePerGlyph)`.
- Produces: `fineNeighbours(world, id)` returning `{ patch: PatchId; distanceM: number; diagonal: boolean; corners: PatchId[] }[]`.

- [ ] **Step 1: Write failing coordinate and neighbor tests**

```ts
import { describe, expect, it } from "vitest";
import {
  FINE_PER_PARENT, PATCH_M, WORLD_FINE_H, WORLD_FINE_W, fineNeighbours,
  parentXY, patchAtMetric, patchCenter, patchId, patchXY,
} from "../src/world/spatial";

describe("the 50 m spatial lattice", () => {
  it("preserves the physical world and round trips exact patches", () => {
    expect(PATCH_M).toBe(50);
    expect(WORLD_FINE_W).toBe(10800);
    expect(WORLD_FINE_H).toBe(7800);
    const id = patchId(6411, 1875);
    expect(patchXY(id)).toEqual({ x: 6411, y: 1875 });
    expect(patchAtMetric(patchCenter(id))).toBe(id);
    expect(parentXY(id)).toEqual({ x: 1068, y: 312 });
    expect(FINE_PER_PARENT).toBe(6);
  });

  it("reports physical diagonal edges and the two corner guards", () => {
    const world = { w: WORLD_FINE_W, h: WORLD_FINE_H };
    const from = patchId(10, 10);
    const diagonal = fineNeighbours(world, from).find((edge) => edge.patch === patchId(11, 11));
    expect(diagonal).toEqual({
      patch: patchId(11, 11), distanceM: 50 * Math.SQRT2, diagonal: true,
      corners: [patchId(11, 10), patchId(10, 11)],
    });
  });
});
```

- [ ] **Step 2: Run the test and verify the missing module failure**

Run: `npx vitest run tests/spatial.test.ts`

Expected: FAIL because `src/world/spatial.ts` does not exist.

- [ ] **Step 3: Implement the spatial module without changing live world behavior**

```ts
export type PatchId = number;
export interface MetricPoint { xM: number; yM: number }
export const PATCH_M = 50;
export const PATCH_KM = PATCH_M / 1000;
export const FINE_PER_PARENT = 6;
export const WORLD_FINE_W = 10800;
export const WORLD_FINE_H = 7800;

export function patchId(x: number, y: number): PatchId {
  return y * WORLD_FINE_W + x;
}

export function patchXY(id: PatchId): { x: number; y: number } {
  return { x: id % WORLD_FINE_W, y: Math.floor(id / WORLD_FINE_W) };
}

export function patchAtMetric(point: MetricPoint): PatchId {
  return patchId(Math.floor(point.xM / PATCH_M), Math.floor(point.yM / PATCH_M));
}

export function patchCenter(id: PatchId): MetricPoint {
  const { x, y } = patchXY(id);
  return { xM: (x + 0.5) * PATCH_M, yM: (y + 0.5) * PATCH_M };
}
```

Implement the remaining declared helpers with bounds checks and deterministic
neighbor order: north, northeast, east, southeast, south, southwest, west,
northwest. Keep `CELL_KM` exported as a temporary deprecated alias of
`PATCH_KM`; later tasks remove assumptions that it means 300 m.

- [ ] **Step 4: Run focused tests**

Run: `npx vitest run tests/spatial.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit the spatial contract**

```bash
git add 08-survidle/src/world/spatial.ts 08-survidle/src/units.ts 08-survidle/tests/spatial.test.ts
git commit -m "feat(survidle): define the 50 metre spatial lattice"
```

---

### Task 2: Fine terrain from physical fields

**Files:**
- Create: `src/world/fine-terrain.ts`
- Create: `tests/fine-terrain.test.ts`
- Modify: `src/world/noise.ts`

**Interfaces:**
- Consumes: `PatchId`, `MetricPoint`, `PATCH_M`, `patchCenter()` from Task 1.
- Produces: `PhysicalFields`, `fieldsAtMetric(seed, point)`, `fieldsAtPatch(seed, patch)`, `terrainAtPatch(seed, patch)`, `regionAtPatch(seed, patch)`.
- Produces: field frequencies expressed in metres and deterministic fine-scale octaves.

- [ ] **Step 1: Write failing determinism, physical-scale, and mixed-terrain tests**

```ts
import { describe, expect, it } from "vitest";
import { patchId } from "../src/world/spatial";
import { fieldsAtPatch, terrainAtPatch } from "../src/world/fine-terrain";

describe("fine terrain", () => {
  it("is deterministic and changes smoothly over neighboring 50 m patches", () => {
    const a = fieldsAtPatch(21, patchId(6411, 1875));
    const b = fieldsAtPatch(21, patchId(6412, 1875));
    expect(fieldsAtPatch(21, patchId(6411, 1875))).toEqual(a);
    expect(Math.abs(a.elevationM - b.elevationM)).toBeLessThan(180);
  });

  it("produces compatible mixed terrain inside at least one 6 by 6 area", () => {
    let found = false;
    for (let py = 250; py < 340 && !found; py++) {
      for (let px = 1020; px < 1110 && !found; px++) {
        const kinds = new Set<string>();
        for (let y = 0; y < 6; y++) for (let x = 0; x < 6; x++) {
          kinds.add(terrainAtPatch(21, patchId(px * 6 + x, py * 6 + y)));
        }
        found = kinds.size > 1;
      }
    }
    expect(found).toBe(true);
  });
});
```

Add a wavelength regression that samples a fixed 30 km transect and records
the number of sea transitions, ridge peak interval, and terrain runs. Assert
wide bounds matching the old physical scale rather than exact old cells.

- [ ] **Step 2: Run the test and verify it fails**

Run: `npx vitest run tests/fine-terrain.test.ts`

Expected: FAIL because `fine-terrain.ts` does not exist.

- [ ] **Step 3: Implement metric fields and classification**

Define `PhysicalFields` as:

```ts
export interface PhysicalFields {
  elevationM: number;
  moisture: number;
  exposure: number;
  drainage: number;
  sea: boolean;
  inlandWater: boolean;
  coast: number;
}
```

Port the current macro coast and ridge formula to metric coordinates. Preserve
the old macro wavelengths by multiplying old coordinate divisors by 300 m.
Add fine octaves with wavelengths from 100 m through 1.2 km. Classify water,
fell, rock, bog, spruce, pine, birch, and meadow only from these fields and
pure neighboring field samples. Scale region lattice spacing to 4.2 km.

- [ ] **Step 4: Run terrain and noise tests**

Run: `npx vitest run tests/fine-terrain.test.ts tests/ground.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit fine generation**

```bash
git add 08-survidle/src/world/fine-terrain.ts 08-survidle/src/world/noise.ts 08-survidle/tests/fine-terrain.test.ts
git commit -m "feat(survidle): generate terrain from 50 metre fields"
```

---

### Task 3: Lazy fine chunks and bottom-up aggregates

**Files:**
- Modify: `src/world/cells.ts`
- Create: `src/world/aggregate.ts`
- Create: `tests/aggregate.test.ts`
- Modify: `tests/world.test.ts`

**Interfaces:**
- Consumes: `terrainAtPatch()`, `regionAtPatch()`, fine spatial helpers.
- Produces: `FINE_CHUNK = 96`, `FineChunk`, `ParentSummary`, `AggregateSummary`.
- Produces: `patchAt(world, id)`, `terrainOfPatch(world, id)`, `parentSummary(world, px, py)`, `aggregateSummary(world, x0, y0, size)`.
- Produces: `invalidatePatch(world, patch)` and bounded cache diagnostics through `worldCacheStats(world)`.

- [ ] **Step 1: Write failing lazy-allocation and exact-summary tests**

```ts
it("allocates only touched 96 by 96 chunks", () => {
  const world = newWorld(21);
  expect(world.fineChunks.size).toBe(0);
  terrainOfPatch(world, patchId(6411, 1875));
  expect(world.fineChunks.size).toBe(1);
});

it("derives a 300 m summary from exactly 36 real patches", () => {
  const world = fixtureWorld([
    "SSSSSS", "SSSSSS", "SSMMSS", "SSMMSS", "SSRRSS", "SSRRSS",
  ]);
  const summary = parentSummary(world, 0, 0);
  expect(summary.samples).toBe(36);
  expect(summary.terrainCounts).toMatchObject({ spruce: 28, meadow: 4, rock: 4 });
  expect(summary.dominant).toBe("spruce");
});
```

Add tests proving an invalidated patch drops only its chunk summaries and the
adjacent parent boundary summaries, and that the LRU never exceeds its declared
chunk limit.

Define `fixtureWorld(rows)` in `tests/aggregate.test.ts` as a finite `FineGrid`
whose row characters map `S` to spruce, `M` to meadow, and `R` to rock. It must
use the same summary entry point as a generated world, with only its terrain
source replaced.

- [ ] **Step 2: Run the aggregate tests and verify failure**

Run:

```bash
npx vitest run tests/aggregate.test.ts
SURVIDLE_TEST_SUITE=slow npx vitest run tests/world.test.ts
```

Expected: FAIL on missing fine chunks and aggregate functions.

- [ ] **Step 3: Implement chunks and summaries**

Use typed arrays for terrain and region. Keep scalar elevation and obstruction
bounds in summaries unless a consumer requests the fine value. Define:

```ts
export interface ParentSummary {
  samples: 36;
  terrainCounts: Record<Terrain, number>;
  dominant: Terrain;
  minElevationM: number;
  maxElevationM: number;
  maxObstructionM: number;
  regionCounts: Map<number, number>;
  generation: number;
}
```

Use an LRU cap of 64 fine chunks. `terrainPeek` evaluates one pure patch
without filling a chunk. Aggregates of known ground may fill chunks; unknown
map ground may not.

- [ ] **Step 4: Run focused world tests**

Run:

```bash
npx vitest run tests/aggregate.test.ts tests/fine-terrain.test.ts
SURVIDLE_TEST_SUITE=slow npx vitest run tests/world.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit lazy aggregation**

```bash
git add 08-survidle/src/world/cells.ts 08-survidle/src/world/aggregate.ts 08-survidle/tests/aggregate.test.ts 08-survidle/tests/world.test.ts
git commit -m "feat(survidle): aggregate lazy fine terrain"
```

---

### Task 4: Exact hierarchical routing engine

**Files:**
- Create: `src/world/fine-route.ts`
- Create: `tests/fine-route.test.ts`
- Modify: `src/world/aggregate.ts`
- Modify: `vitest.config.ts`

**Interfaces:**
- Consumes: fine neighbors and patch terrain from Tasks 1-3.
- Produces: `FineGrid`, `TraversalProfile`, `FineRoute`, `ParentTopology`, `buildParentTopology()`, `findDirectFineRoute()`, `findHierarchicalRoute()`, `fineRouteDistanceM()`.

- [ ] **Step 1: Write failing diagonal and disconnected-parent tests**

```ts
it("charges physical diagonal distance", () => {
  const grid = asciiFixture(["...", "...", "..."]);
  const route = findDirectFineRoute(grid, grid.id(0, 0), grid.id(2, 2), traversalFor(grid));
  expect(route?.distanceM).toBeCloseTo(100 * Math.SQRT2, 6);
});

it("forbids diagonal corner cutting", () => {
  const grid = asciiFixture([".#", "#."]);
  expect(findDirectFineRoute(grid, grid.id(0, 0), grid.id(1, 1), traversalFor(grid))).toBeNull();
});

it("does not cross a parent split by impassable water", () => {
  const grid = asciiFixture([
    "..#...", "..#...", "..#...", "..#...", "..#...", "..#...",
  ]);
  const topology = buildParentTopology(grid, 0, 0, traversalFor(grid));
  expect(topology.components.size).toBe(2);
  expect(topology.connected(grid.id(0, 2), grid.id(5, 2))).toBe(false);
});
```

Add a seeded property test over at least 200 bounded 18 by 18 fixtures. Compare
reachability, distance, and exact blocked-patch avoidance between hierarchical
and direct routes.

Define `asciiFixture(rows)` in this test as a `FineGrid` whose `.` patches are
passable at elevation zero and whose `#` patches are blocked. Define
`traversalFor(grid)` as a profile with speed 1 on passable patches and speed 0
on blocked patches. Add `tests/fine-route.test.ts` to `slowTestFiles` in
`vitest.config.ts` in the same test-first change.

- [ ] **Step 2: Run the routing test and verify failure**

Run: `SURVIDLE_TEST_SUITE=slow npx vitest run tests/fine-route.test.ts`

Expected: FAIL because the routing engine does not exist.

- [ ] **Step 3: Implement direct oracle, topology, and portal A***

```ts
export interface FineGrid {
  w: number;
  h: number;
  terrainAt(patch: PatchId): Terrain;
}

export interface TraversalProfile {
  key: string;
  speedAt(patch: PatchId): number;
  elevationAt(patch: PatchId): number;
}

export interface FineRoute {
  patches: PatchId[];
  distanceM: number;
  cost: number;
}
```

Apply a directional slope multiplier when evaluating an edge. Build components
over the 36 local patches. Retain every passable perimeter patch as a portal.
Cache topology separately from profile-keyed costs. Search only parent boxes
with the existing physical 12 km margin, expressed as 40 parents.

- [ ] **Step 4: Run the fine route oracle suite**

Run: `SURVIDLE_TEST_SUITE=slow npx vitest run tests/fine-route.test.ts`

Expected: PASS for direct and hierarchical comparisons.

- [ ] **Step 5: Commit hierarchical routing**

```bash
git add 08-survidle/src/world/fine-route.ts 08-survidle/src/world/aggregate.ts 08-survidle/tests/fine-route.test.ts 08-survidle/vitest.config.ts
git commit -m "feat(survidle): route exactly through parent portals"
```

---

### Task 5: Cut world and region generation over to fine patches

**Files:**
- Modify: `src/world/terrain.ts`
- Modify: `src/world/cells.ts`
- Modify: `src/world/gen.ts`
- Modify: `src/world/route.ts`
- Modify: `tests/start.test.ts`
- Modify: `tests/world.test.ts`
- Modify: `tests/route.test.ts`
- Create: `tests/region.test.ts`

**Interfaces:**
- Consumes: fine generator, chunks, aggregates, and route engine.
- Produces: the existing `World`, `Cell`, `cellAt`, `cellIdx`, `neighbours`, `regionAt`, `findRoute`, and `routeKm` APIs with fine-patch semantics.
- Preserves: region physical diameter near 4.2 km and world physical extent.

- [ ] **Step 1: Rewrite world contract tests to physical assertions**

Change exact old cell coordinates to helper-derived fine ids. Add assertions:

```ts
expect(world.w).toBe(10800);
expect(world.h).toBe(7800);
expect(regionAt(world, world.start).area).toBeCloseTo(
  regionAt(world, world.start).cells.length * 0.05 * 0.05,
  8,
);
expect(regionAt(world, world.start).spots.some((spot) => spot.id === "shore")).toBe(true);
expect(regionAt(world, world.start).spots.every((spot) => passable(cellAt(world, spot.cell).terrain))).toBe(true);
```

Update route distance tests to calculate expected physical length from 50 m
orthogonal and diagonal edges.

- [ ] **Step 2: Run world, start, and route tests to verify failure**

Run:

```bash
npx vitest run tests/start.test.ts tests/route.test.ts tests/region.test.ts
SURVIDLE_TEST_SUITE=slow npx vitest run tests/world.test.ts
```

Expected: FAIL because live `World` still uses 300 m cells.

- [ ] **Step 3: Switch the public world APIs**

Make `World.w` and `World.h` fine dimensions. Set region lattice spacing to 84
patches. Build exact region cells lazily inside the three-lattice-square search
box, using aggregate counts to avoid repeating fine field work. Select camp and
named spots from reachable fine patches. Make `world/route.ts` a compatibility
facade over `findHierarchicalRoute()` and keep route cache keys condition-aware.

Delete old terrain classification logic after all callers use
`fine-terrain.ts`; `terrain.ts` re-exports world dimensions and terrain tables
for stable imports.

- [ ] **Step 4: Run world-facing tests and the fresh-world ceiling**

Run:

```bash
npx vitest run tests/start.test.ts tests/route.test.ts tests/region.test.ts
SURVIDLE_TEST_SUITE=slow npx vitest run tests/world.test.ts
```

Expected: PASS, including fresh `generateWorld(21)` under two seconds.

- [ ] **Step 5: Commit the world cutover**

```bash
git add 08-survidle/src/world/terrain.ts 08-survidle/src/world/cells.ts 08-survidle/src/world/gen.ts 08-survidle/src/world/route.ts 08-survidle/tests/world.test.ts 08-survidle/tests/start.test.ts 08-survidle/tests/route.test.ts 08-survidle/tests/region.test.ts
git commit -m "feat(survidle): make fine patches the world model"
```

---

### Task 6: Unify player position and walking in metres

**Files:**
- Modify: `src/sim/types.ts`
- Modify: `src/sim/position.ts`
- Modify: `src/sim/routing.ts`
- Modify: `src/sim/tasks.ts`
- Modify: `src/sim/newgame.ts`
- Modify: `src/ui/map.ts`
- Create: `tests/movement.test.ts`
- Modify: `tests/ui.test.ts`
- Modify: `tests/travel-ui.test.ts`

**Interfaces:**
- Consumes: `MetricPoint`, patch conversions, fine routes.
- Produces: `Player.xM`, `Player.yM`, `patchOf(state, world)`, `placeAtPatch()`, `placeAtMetric()`.
- Changes: `Route.path` and `Route.walked` contain fine patch ids; route progress follows exact metre edges.

- [ ] **Step 1: Write failing exact movement tests**

```ts
it("walks one fine orthogonal edge in physical time", () => {
  const { state, world } = newGame(21);
  const from = patchOf(state, world);
  const to = fineNeighbours(world, from).find((edge) => !edge.diagonal && passable(cellAt(world, edge.patch).terrain))!.patch;
  beginWalkToPatch(state, world, to);
  advance(state, world, 1);
  expect(Math.hypot(state.player.xM - patchCenter(from).xM, state.player.yM - patchCenter(from).yM)).toBeGreaterThan(0);
  expect(state.stats.km).toBeGreaterThan(0);
});

it("changes local patch before reaching the next patch center", () => {
  const { state, world } = newGame(21);
  const from = patchOf(state, world);
  const east = patchId(patchXY(from).x + 1, patchXY(from).y);
  placeAtMetric(state, world, { xM: patchCenter(from).xM + 26, yM: patchCenter(from).yM });
  expect(patchOf(state, world)).toBe(east);
});
```

- [ ] **Step 2: Run movement tests and verify failure**

Run: `npx vitest run tests/movement.test.ts tests/travel-ui.test.ts`

Expected: FAIL because `Player` still stores old cell-unit `x` and `y`.

- [ ] **Step 3: Replace the player coordinate convention**

Remove `Player.x` and `Player.y`; add `xM` and `yM`. Move `MetricPoint` from
`wildlife-space.ts` to `world/spatial.ts` and re-export it temporarily for
callers. Update placement, region entry, route stepping, distance descriptions,
map projection, and statistics. Enter a fine patch as soon as the exact point
crosses its boundary. Keep `cellOf()` as a compatibility name returning the
same fine `PatchId` as `patchOf()` until callers can be renamed mechanically;
it must not perform an old-scale conversion. Keep external `advance()` chunk
invariance.

- [ ] **Step 4: Run movement and chunk-invariance suites**

Run:

```bash
npx vitest run tests/movement.test.ts tests/travel-ui.test.ts tests/route.test.ts
SURVIDLE_TEST_SUITE=slow npx vitest run tests/ui.test.ts tests/advance-save.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit metre-based player movement**

```bash
git add 08-survidle/src/sim/types.ts 08-survidle/src/sim/position.ts 08-survidle/src/sim/routing.ts 08-survidle/src/sim/tasks.ts 08-survidle/src/sim/newgame.ts 08-survidle/src/ui/map.ts 08-survidle/tests/movement.test.ts 08-survidle/tests/ui.test.ts 08-survidle/tests/travel-ui.test.ts
git commit -m "feat(survidle): move the survivor through fine patches"
```

---

### Task 7: Move local state, tasks, and resources to fine ownership

**Files:**
- Modify: `src/sim/types.ts`
- Modify: `src/sim/inventory.ts`
- Modify: `src/sim/regionstate.ts`
- Modify: `src/sim/tasks.ts`
- Modify: `src/sim/intent.ts`
- Modify: `src/sim/orders.ts`
- Modify: `src/sim/items.ts`
- Modify: `src/sim/hunting.ts`
- Modify: `src/world/aggregate.ts`
- Modify: `tests/local-ground.test.ts`
- Modify: `tests/sites.test.ts`
- Modify: `tests/pause.test.ts`
- Modify: `tests/inventory.test.ts`
- Modify: `tests/hunting.test.ts`

**Interfaces:**
- Consumes: exact `patchOf()` and fine region cells.
- Produces: fine-keyed piles, sites, fires, traps, seeps, carcasses, paused work, hunt pressure, resource depletion, and work destinations.
- Produces: `resourcePotentialAt(world, patch)` based on patch area and fields.
- Changes: `ParentSummary` gains summed `resourcePotential` after patch-level resource rules exist.

- [ ] **Step 1: Add failing ownership and area tests**

```ts
it("leaves work and output on one exact 50 m patch", () => {
  const { state, world } = forestGame(21);
  const work = patchOf(state, world);
  startTask(state, world, calendar(0), "deadwood");
  advance(state, world, 30);
  stopTask(state, world);
  const neighbor = passableNeighbor(world, work);
  placeAtPatch(state, world, neighbor);
  expect(pausedList(state, world, calendar(state.minute)).some((entry) => entry.here)).toBe(false);
  expect(pileAt(state, work)).not.toBe(pileAt(state, neighbor));
});

it("derives forest stock from 0.0025 square kilometres", () => {
  const patch = findTerrainPatch(world, "spruce");
  const potential = resourcePotentialAt(world, patch);
  expect(potential.areaKm2).toBeCloseTo(0.0025, 8);
  expect(potential.trees).toBeGreaterThan(0);
});
```

Add exact-patch tests for camp structures, field fire departure, trap, seep,
ice hole, carcass, local shelter, and shopping pickup.

Define `forestGame(seed)` by calling `newGame(seed)`, locating the nearest
reachable spruce patch, and placing the player there. Define
`passableNeighbor(world, patch)` by selecting the first passable result from
`fineNeighbours()`. These helpers use public simulation APIs and do not assign
terrain.

- [ ] **Step 2: Run local-state suites and verify failures**

Run:

```bash
npx vitest run tests/local-ground.test.ts tests/inventory.test.ts tests/hunting.test.ts
SURVIDLE_TEST_SUITE=slow npx vitest run tests/sites.test.ts tests/pause.test.ts
```

Expected: FAIL where old parent-wide ownership remains.

- [ ] **Step 3: Convert local records and recalibrate resources**

Keep numeric record keys, but ensure every key is a `PatchId` from
`patchOf()`. Calculate tree, deadwood, berry, root, bark, and other renewable
stocks from local terrain, fine area, and existing seasonal multipliers.
Change camp warmth, roof, and fire checks to exact patch or named physical
range. Make located pause keys include the exact patch id.

- [ ] **Step 4: Run the affected simulation suites**

Run:

```bash
npx vitest run tests/local-ground.test.ts tests/inventory.test.ts tests/hunting.test.ts
SURVIDLE_TEST_SUITE=slow npx vitest run tests/sites.test.ts tests/pause.test.ts tests/fire.test.ts tests/tasks.test.ts tests/orders.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit fine local ownership**

```bash
git add 08-survidle/src/sim/types.ts 08-survidle/src/sim/inventory.ts 08-survidle/src/sim/regionstate.ts 08-survidle/src/sim/tasks.ts 08-survidle/src/sim/intent.ts 08-survidle/src/sim/orders.ts 08-survidle/src/sim/items.ts 08-survidle/src/sim/hunting.ts 08-survidle/src/world/aggregate.ts 08-survidle/tests/local-ground.test.ts 08-survidle/tests/sites.test.ts 08-survidle/tests/pause.test.ts 08-survidle/tests/inventory.test.ts 08-survidle/tests/hunting.test.ts
git commit -m "feat(survidle): bind work and resources to fine ground"
```

---

### Task 8: Compact fine knowledge and observations

**Files:**
- Create: `src/sim/knowledge.ts`
- Create: `tests/knowledge.test.ts`
- Modify: `src/sim/types.ts`
- Modify: `src/sim/mapped.ts`
- Modify: `src/sim/newgame.ts`
- Modify: `src/sim/record.ts`

**Interfaces:**
- Produces: `KnowledgeChunks`, `knowledgeAt()`, `markSeen()`, `markVisited()`, `inheritKnowledge()`, `knowledgeCounts()`, `encodeKnowledge()`, `decodeKnowledge()`.
- Uses two bits per fine patch: 0 unknown, 1 inherited, 2 seen this life, 3 visited this life.

- [ ] **Step 1: Write failing compact knowledge tests**

```ts
it("allocates knowledge only for touched chunks", () => {
  const knowledge = newKnowledge();
  markVisited(knowledge, patchId(10, 10));
  expect(knowledge.chunks.size).toBe(1);
  expect(knowledgeAt(knowledge, patchId(10, 10))).toBe("visited");
  expect(knowledgeAt(knowledge, patchId(5000, 5000))).toBe("unknown");
});

it("round trips compact knowledge without object keys per patch", () => {
  const knowledge = newKnowledge();
  for (let x = 0; x < 96; x++) markSeen(knowledge, patchId(x, 10));
  const encoded = encodeKnowledge(knowledge);
  expect(encoded.length).toBeLessThan(1200);
  expect(knowledgeCounts(decodeKnowledge(encoded))).toEqual(knowledgeCounts(knowledge));
});
```

- [ ] **Step 2: Run the knowledge tests and verify failure**

Run: `npx vitest run tests/knowledge.test.ts tests/mapped.test.ts`

Expected: FAIL because fine knowledge chunks do not exist.

- [ ] **Step 3: Implement two-bit chunk storage and migrate callers**

Store each touched 96 by 96 chunk in a `Uint8Array` packing four patches per
byte. Use serializable base64 chunk payloads in saves. Replace `state.mapped`
lookups in mapping, inheritance, discovery share, and record code. Keep region
discovery as a separate broad fact.

- [ ] **Step 4: Run knowledge and lineage suites**

Run:

```bash
npx vitest run tests/knowledge.test.ts tests/mapped.test.ts tests/knownrouting.test.ts
SURVIDLE_TEST_SUITE=slow npx vitest run tests/record.test.ts tests/ui.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit compact fine knowledge**

```bash
git add 08-survidle/src/sim/knowledge.ts 08-survidle/src/sim/types.ts 08-survidle/src/sim/mapped.ts 08-survidle/src/sim/newgame.ts 08-survidle/src/sim/record.ts 08-survidle/tests/knowledge.test.ts 08-survidle/tests/mapped.test.ts 08-survidle/tests/knownrouting.test.ts 08-survidle/tests/record.test.ts
git commit -m "feat(survidle): store fine terrain knowledge compactly"
```

---

### Task 9: Fine weather ground, visibility, and light

**Files:**
- Modify: `src/sim/climate.ts`
- Modify: `src/sim/weather.ts`
- Modify: `src/sim/cellstatus.ts`
- Modify: `src/sim/sight.ts`
- Modify: `src/sim/light.ts`
- Modify: `src/sim/fire.ts`
- Modify: `tests/climate.test.ts`
- Modify: `tests/local-ground.test.ts`
- Modify: `tests/sight.test.ts`
- Modify: `tests/light.test.ts`

**Interfaces:**
- Consumes: metric positions, fine fields, obstruction summaries, fine knowledge.
- Produces: patch-local ground modifiers and exact close visibility.
- Preserves: atmospheric wavelengths and storm speeds in physical units.

- [ ] **Step 1: Add failing physical weather and fine occlusion tests**

```ts
it("keeps adjacent 50 m air samples coherent without shrinking storms", () => {
  const a = atmosphereAt(state, world, { xM: 100_000, yM: 80_000 });
  const b = atmosphereAt(state, world, { xM: 100_050, yM: 80_000 });
  const far = atmosphereAt(state, world, { xM: 130_000, yM: 80_000 });
  expect(Math.abs(a.temperatureC - b.temperatureC)).toBeLessThan(1);
  expect(far).not.toEqual(a);
});

it("a one-patch rock band blocks the lower ground behind it", () => {
  const scene = fineSightFixture([".....", ".@^..", "....."]);
  expect(visiblePatches(scene.state, scene.world).has(scene.id(3, 1))).toBe(false);
});
```

Add tests for local snow, safe ice invalidating route passability, exact fire
source patch, and visibility-summary subdivision when bounds are inconclusive.

Define `fineSightFixture(rows)` in `tests/sight.test.ts` with the same public
`FineGrid` contract as the routing fixture, plus explicit elevation and canopy
values encoded by its row characters.

- [ ] **Step 2: Run environment tests and verify failure**

Run: `npx vitest run tests/climate.test.ts tests/local-ground.test.ts tests/sight.test.ts tests/light.test.ts`

Expected: FAIL on old cell-unit sampling and parent-wide effects.

- [ ] **Step 3: Convert environmental consumers**

Make climate APIs accept metric points or fine patches and convert all
wavelength constants to metres. Derive ground conditions from region driver,
fine elevation, terrain, exposure, water adjacency, and local shelter. Use
aggregate min/max obstruction bounds to skip proven ray segments and descend
for exact close answers. Version route and visibility caches when passability
or obstruction changes.

- [ ] **Step 4: Run weather, sight, fire, and screenshot-fixture tests**

Run: `npx vitest run tests/climate.test.ts tests/local-ground.test.ts tests/sight.test.ts tests/light.test.ts tests/fieldfire.test.ts tests/weather-scenarios.test.ts`

Expected: PASS after fixture coordinates are expressed in metres or fine ids.

- [ ] **Step 5: Commit the fine environment**

```bash
git add 08-survidle/src/sim/climate.ts 08-survidle/src/sim/weather.ts 08-survidle/src/sim/cellstatus.ts 08-survidle/src/sim/sight.ts 08-survidle/src/sim/light.ts 08-survidle/src/sim/fire.ts 08-survidle/tests/climate.test.ts 08-survidle/tests/local-ground.test.ts 08-survidle/tests/sight.test.ts 08-survidle/tests/light.test.ts 08-survidle/tests/weather-scenarios.test.ts
git commit -m "feat(survidle): resolve weather and sight on fine ground"
```

---

### Task 10: Fine active wildlife movement and encounters

**Files:**
- Modify: `src/sim/wildlife-space.ts`
- Modify: `src/sim/wildlife-agents.ts`
- Modify: `src/sim/animals.ts`
- Modify: `src/sim/hunting.ts`
- Modify: `tests/wildlife-space.test.ts`
- Modify: `tests/animal-agents.test.ts`
- Modify: `tests/wildlife-encounter.test.ts`
- Modify: `tests/wildlife-startle-anchors.test.ts`

**Interfaces:**
- Consumes: shared `MetricPoint`, fine patch buckets, hierarchical routes, exact visibility.
- Produces: active wildlife whose `cell` is a fine `PatchId`; inactive ecology remains region-level.

- [ ] **Step 1: Write failing shared-coordinate and obstacle tests**

```ts
it("buckets player and wildlife points with the same fine conversion", () => {
  const point = { xM: 53_425, yM: 15_625 };
  expect(cellForMetricPoint(world, point)).toBe(patchAtMetric(point));
});

it("an active animal cannot cross an impassable fine band", () => {
  const scene = wildlifeBarrierFixture();
  stepWildlife(scene.state, scene.world, scene.calendar, 60);
  expect(patchXY(scene.animal.active!.cell).x).toBeLessThan(scene.barrierX);
});
```

Add tests that inactive populations allocate no fine agents and that exact
distance and line of sight control detection within one former parent area.

Define `wildlifeBarrierFixture()` in `tests/animal-agents.test.ts` from a local
fine-grid fixture, one active subject, and a six-patch impassable band. Its
`barrierX` is the first blocked column and the destination lies east of it.

- [ ] **Step 2: Run wildlife suites and verify failure**

Run:

```bash
npx vitest run tests/wildlife-space.test.ts tests/wildlife-encounter.test.ts
SURVIDLE_TEST_SUITE=slow npx vitest run tests/animal-agents.test.ts
```

Expected: FAIL where wildlife buckets remain 300 m cells.

- [ ] **Step 3: Use shared fine spatial adapters and routes**

Remove duplicate metre-to-cell constants from `wildlife-space.ts`. Activate
subjects only on passable fine patches. Use hierarchical routes for deliberate
travel and fine neighbor steps for local wandering and escape. Keep population
capacity and inactive ecological updates at region scale.

- [ ] **Step 4: Run all wildlife and hunting suites**

Run:

```bash
npx vitest run tests/wildlife-space.test.ts tests/wildlife-encounter.test.ts tests/wildlife-startle-anchors.test.ts tests/hunting.test.ts tests/hunt-stress.test.ts
SURVIDLE_TEST_SUITE=slow npx vitest run tests/animal-agents.test.ts
```

Expected: PASS, including the existing average detailed-step performance cap.

- [ ] **Step 5: Commit fine wildlife**

```bash
git add 08-survidle/src/sim/wildlife-space.ts 08-survidle/src/sim/wildlife-agents.ts 08-survidle/src/sim/animals.ts 08-survidle/src/sim/hunting.ts 08-survidle/tests/wildlife-space.test.ts 08-survidle/tests/animal-agents.test.ts 08-survidle/tests/wildlife-encounter.test.ts 08-survidle/tests/wildlife-startle-anchors.test.ts
git commit -m "feat(survidle): move active wildlife across fine terrain"
```

---

### Task 11: Replace cosmetic close rendering and resolve exact clicks

**Files:**
- Create: `tests/close-zoom.test.ts`
- Modify: `src/ui/map.ts`
- Modify: `src/ui/cellpresentation.ts`
- Modify: `src/ui/render.ts`
- Modify: `src/main.ts`
- Modify: `src/style.css`
- Modify: `tests/ui.test.ts`
- Modify: `tests/tip.test.ts`
- Modify: `tests/layout.test.ts`
- Modify: `tests/map-layers.test.ts`

**Interfaces:**
- Consumes: aggregate summaries, exact feature patches, fine knowledge, exact routes.
- Produces: zoom levels in fine patches per glyph: 1, 2, 6, 18, 54, and dynamic far.
- Produces: `mapTargetAtPoint()` returning `{ aggregate; patch; features }` with an exact reachable destination.

- [ ] **Step 1: Write failing authoritative close-map tests**

```ts
it("draws 2592 ordinary real cells at 50 m", () => {
  const { state, world } = newGame(21);
  const ui = { ...newUiState(), zoom: 0 };
  document.body.innerHTML = `<div id="map">${mapHtml(world, state, ui, calendar(10))}</div>`;
  expect(document.querySelectorAll("#map .c")).toHaveLength(72 * 36);
  expect(document.querySelectorAll("#map .micro-ground")).toHaveLength(0);
  expect(document.querySelector("#map .maptools")?.textContent).toContain("50 m per glyph");
});

it("resolves an aggregate click to a reachable exact patch", () => {
  const target = mapTargetAtPoint(world, state, { ...newUiState(), zoom: 1 }, 330, 210);
  expect(target?.aggregate.size).toBe(2);
  expect(target?.patch).not.toBeNull();
  expect(findRoute(world, patchOf(state, world), target!.patch!)).not.toBeNull();
});
```

Add tests for a clicked exact marker, multiple features in one aggregate,
unknown ground not generating chunks, selection disclosure, 100 m 2 by 2
composition, route overlays, wildlife anchors, firelight, weather layers, and
keyboard navigation.

- [ ] **Step 2: Run close-map tests and verify failure**

Run:

```bash
npx vitest run tests/close-zoom.test.ts tests/tip.test.ts
SURVIDLE_TEST_SUITE=slow npx vitest run tests/ui.test.ts
```

Expected: FAIL because close zoom still emits cosmetic nested terrain.

- [ ] **Step 3: Rebuild map levels around real aggregates**

Replace `ZoomLevel.cells` and `detail` with `finePerGlyph`. Delete
`DETAIL_FORMS`, terrain use of `detailHash`, `visualGround()`,
`playerVisualSlot()`, and all `.micro-ground` CSS. Render one `.c` per glyph at
all levels. Aggregate exact known terrain and feature lists. Resolve clicks to
marker patches first, then the nearest reachable ordinary patch inside the
aggregate. Display the chosen exact destination before creating the walk.

- [ ] **Step 4: Run map, layer, interaction, and layout suites**

Run:

```bash
npx vitest run tests/close-zoom.test.ts tests/tip.test.ts tests/layout.test.ts tests/map-layers.test.ts tests/wildlife-startle-ui.test.ts tests/local-weather-ui.test.ts
SURVIDLE_TEST_SUITE=slow npx vitest run tests/ui.test.ts
```

Expected: PASS with no cosmetic terrain nodes.

- [ ] **Step 5: Commit authoritative close rendering**

```bash
git add 08-survidle/src/ui/map.ts 08-survidle/src/ui/cellpresentation.ts 08-survidle/src/ui/render.ts 08-survidle/src/main.ts 08-survidle/src/style.css 08-survidle/tests/close-zoom.test.ts 08-survidle/tests/ui.test.ts 08-survidle/tests/tip.test.ts 08-survidle/tests/layout.test.ts 08-survidle/tests/map-layers.test.ts
git commit -m "feat(survidle): render and select real close ground"
```

---

### Task 12: Reject old saves and serialize fine state

**Files:**
- Create: `src/sim/world-version.ts`
- Modify: `src/sim/save.ts`
- Modify: `src/sim/types.ts`
- Modify: `src/main.ts`
- Modify: `src/ui/panels.ts`
- Modify: `tests/advance-save.test.ts`
- Modify: `tests/manual.test.ts`

**Interfaces:**
- Produces: `SAVE_VERSION = 10`, `WORLD_VERSION = 2`, `SaveCompatibility`.
- Produces: `inspectSave(text)` returning `"current"`, `"old-world"`, or `"invalid"` before deserialization.
- Serializes compact knowledge chunks and exact metre positions.

- [ ] **Step 1: Write failing save-version tests**

```ts
it("rejects a version 9 world before interpreting old cell ids", () => {
  const old = JSON.stringify({ version: 9, savedAt: 1, state: { seed: 21 } });
  expect(inspectSave(old)).toBe("old-world");
  expect(deserialize(old)).toBeNull();
});

it("round trips metre positions, fine patch keys, and compact knowledge", () => {
  const { state } = newGame(21);
  const back = deserialize(serialize(state, 1000));
  expect(back?.state.player).toMatchObject({ xM: state.player.xM, yM: state.player.yM });
  expect(back?.state.knowledge).toEqual(state.knowledge);
});
```

- [ ] **Step 2: Run save tests and verify failure**

Run:

```bash
npx vitest run tests/manual.test.ts
SURVIDLE_TEST_SUITE=slow npx vitest run tests/advance-save.test.ts
```

Expected: FAIL because version 9 remains accepted.

- [ ] **Step 3: Add the version gate and clear message**

Inspect the JSON envelope before treating `state` as `GameState`. For
`old-world`, preserve no state and show: `This saved world used the old 300 m
terrain model. Start a new world to use the 50 m simulation.` Provide only the
existing new-world action. Current saves include both schema and world version.

- [ ] **Step 4: Run save and boot tests**

Run:

```bash
npx vitest run tests/manual.test.ts tests/start.test.ts
SURVIDLE_TEST_SUITE=slow npx vitest run tests/advance-save.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit the world-version boundary**

```bash
git add 08-survidle/src/sim/world-version.ts 08-survidle/src/sim/save.ts 08-survidle/src/sim/types.ts 08-survidle/src/main.ts 08-survidle/src/ui/panels.ts 08-survidle/tests/advance-save.test.ts 08-survidle/tests/manual.test.ts
git commit -m "feat(survidle): version the authoritative fine world"
```

---

### Task 13: Performance gates and legacy removal

**Files:**
- Create: `tests/spatial-performance.test.ts`
- Modify: `tests/weather-profile.test.ts`
- Modify: `tests/churn.test.ts`
- Modify: `vitest.config.ts`
- Modify: `docs/roadmap-additions.md`
- Modify: `docs/map-zoom-shots/README.md`
- Modify: all tests still referring to 300 m mechanical cells or cosmetic detail.

**Interfaces:**
- Consumes: cache diagnostics from Tasks 3, 4, 8, and 9.
- Produces: deterministic work counts for generation, aggregation, routing, visibility, and scheduler reuse.

- [ ] **Step 1: Write failing performance-invariant tests**

```ts
it("does not allocate the whole fine world during boot or whole-map render", () => {
  const started = performance.now();
  const { state, world } = newGame(21);
  mapHtml(world, state, { ...newUiState(), zoom: LEVELS.length - 1 }, calendar(0));
  const stats = worldCacheStats(world);
  expect(stats.fineChunks).toBeLessThan(96);
  expect(stats.generatedPatches).toBeLessThan(96 * 96 * 96);
  expect(performance.now() - started).toBeLessThan(2000);
});

it("reuses parent topology across repeated scheduler routes", () => {
  const scene = schedulerRouteScene(21);
  runOrders(scene.state, scene.world, scene.cal, scene.rng);
  const cold = worldCacheStats(scene.world).topologyBuilds;
  for (let i = 0; i < 20; i++) runOrders(scene.state, scene.world, scene.cal, scene.rng);
  expect(worldCacheStats(scene.world).topologyBuilds).toBe(cold);
});
```

Add cold/cached work-count assertions for all zoom levels, representative 50 m
and 20 km routes, close and long visibility, and a save after broad mapping.
Keep wall-time ceilings broad and work counters exact.

Define `schedulerRouteScene(seed)` with `newGame(seed)`, one reachable exact
work destination, one queued order targeting it, and the saved RNG and calendar
needed by `runOrders()`.
Add `tests/spatial-performance.test.ts` to `slowTestFiles` in
`vitest.config.ts` in the same test-first change.

- [ ] **Step 2: Run performance and discovery checks**

Run:

```bash
npx vitest run tests/weather-profile.test.ts
SURVIDLE_TEST_SUITE=slow npx vitest run tests/spatial-performance.test.ts tests/churn.test.ts
```

Expected: FAIL for missing diagnostics or excessive repeated work.

- [ ] **Step 3: Bound caches and remove legacy paths**

Add LRU caps and exact counters. Remove old 300 m generation helpers,
cosmetic-detail comments, stale `detail` state, old coordinate adapters, and
tests that assert obsolete seed geometry. Update the roadmap entry from
optional mechanical subcells to implemented authoritative fine terrain and
link the design and comparison directory.

- [ ] **Step 4: Run lint, full fast suite, selected slow suites, and build**

Run:

```bash
npm test
SURVIDLE_TEST_SUITE=slow npx vitest run tests/fine-route.test.ts tests/spatial-performance.test.ts tests/animal-agents.test.ts tests/fire.test.ts tests/orders.test.ts
npx vitest run tests/hunting.test.ts
npm run build
../node_modules/.bin/biome lint src tests
```

Expected: all commands exit 0. The expected beacon offline stderr remains
non-failing.

- [ ] **Step 5: Commit performance and cleanup**

```bash
git add 08-survidle/src/world/terrain.ts 08-survidle/src/world/aggregate.ts 08-survidle/src/world/fine-route.ts 08-survidle/src/ui/map.ts 08-survidle/src/ui/render.ts 08-survidle/src/style.css 08-survidle/tests/spatial-performance.test.ts 08-survidle/tests/weather-profile.test.ts 08-survidle/tests/churn.test.ts 08-survidle/docs/roadmap-additions.md 08-survidle/docs/map-zoom-shots/README.md 08-survidle/vitest.config.ts
git commit -m "test(survidle): enforce fine world performance"
```

Before staging, inspect `git status --short`. If legacy removal changed another
file, add that file by its exact path to this command. Never stage a directory
or use `git add -A`.

---

### Task 14: Authentic after images and final comparison

**Files:**
- Create: `scripts/close-zoom-shots.mjs`
- Create: `docs/close-zoom-simulation-shots/after-100m.png`
- Create: `docs/close-zoom-simulation-shots/after-50m.png`
- Create: `docs/close-zoom-simulation-shots/after-scene.json`
- Modify: `docs/close-zoom-simulation-shots/README.md`
- Test: `tests/close-zoom.test.ts`

**Interfaces:**
- Consumes: the ordinary application, seed URL, landing controls, zoom controls, and headless Chrome.
- Produces: reproducible comparison images and observed scene metadata without simulation-state assignment.

- [ ] **Step 1: Add a source-level anti-special-case test**

```ts
it("contains no application special case for the comparison scene", () => {
  const source = applicationSources().join("\n");
  expect(source).not.toMatch(/seed\s*===?\s*21/);
  expect(source).not.toContain("close-zoom-simulation-shots");
  expect(source).not.toContain("after-50m");
  expect(source).not.toContain("after-100m");
});
```

Define `applicationSources()` in the test by recursively reading `.ts` and
`.css` files under `src/` with `readdirSync(..., { withFileTypes: true })` and
`readFileSync(path, "utf8")`. Do not scan `scripts/` or `docs/`, where the
capture seed and output names are intentionally recorded.

- [ ] **Step 2: Implement the reusable capture harness**

Model it on `scripts/map-shots.mjs`. It must:

1. Open `?seed=21` in a fresh headless Chrome profile.
2. Select the first offered survivor through `[data-act="pick-candidate"]`.
3. Use `[data-act="land"]`, `[data-act="welcome-close"]`, and
   `[data-act="goal-close"]`.
4. Use the real `[data-act="zoom"][data-dir="in"]` controls.
5. Wait for `window.survidle.state.minute === 10`.
6. Read, but never assign, state, terrain, weather, visibility, markup, or CSS.
7. Capture the `#map` bounds at 1440 by 900 and scale 2.
8. Write observed seed, minute, start day, metre position, region, zoom label,
   rendered cell count, and cache diagnostics to `after-scene.json`.
9. Use independent fresh pages for the 100 m and 50 m captures.

- [ ] **Step 3: Run headless Chrome and inspect both image pairs**

Run:

```bash
npm run dev
node scripts/close-zoom-shots.mjs --after
```

Stop the development server after capture. Inspect all four PNGs at original
resolution. Confirm the after images contain ordinary coherent terrain cells,
no repeated nested parent blocks, identical capture dimensions, the expected
zoom labels, and a visible survivor marker.

- [ ] **Step 4: Run final verification from a clean process**

Run:

```bash
git diff --check
npm test
SURVIDLE_TEST_SUITE=slow npx vitest run tests/fine-route.test.ts tests/spatial-performance.test.ts tests/animal-agents.test.ts tests/fire.test.ts tests/orders.test.ts
npx vitest run tests/hunting.test.ts
npm run build
../node_modules/.bin/biome lint src tests scripts/close-zoom-shots.mjs
```

Expected: all commands exit 0. Compare `before-scene.json` and
`after-scene.json`: seed 21, start day 90, minute 10, viewport 1440 by 900, and
capture scale 2 must match. Fine-world coordinates and region ids may differ.

- [ ] **Step 5: Commit the authentic comparison**

```bash
git add 08-survidle/scripts/close-zoom-shots.mjs 08-survidle/tests/close-zoom.test.ts 08-survidle/docs/close-zoom-simulation-shots/README.md 08-survidle/docs/close-zoom-simulation-shots/after-100m.png 08-survidle/docs/close-zoom-simulation-shots/after-50m.png 08-survidle/docs/close-zoom-simulation-shots/after-scene.json
git commit -m "docs(survidle): compare authoritative close terrain"
```

---

## Completion Review

Before offering branch integration:

1. Confirm every mechanical location is a fine patch id and every exact actor
   position is in metres.
2. Confirm no close renderer calls `visualGround()` or emits `.micro-ground`.
3. Confirm the hierarchical oracle suite covers disconnected parents, narrow
   crossings, diagonal corners, directional slopes, dynamic ice, and cache
   invalidation.
4. Confirm no whole-world fine allocation or scan occurs in boot, routing, map,
   region, weather, visibility, or wildlife paths.
5. Confirm old saves fail with the explicit world-version message.
6. Confirm before and after images use the recorded real flow and matching
   capture facts.
7. Invoke `superpowers:verification-before-completion` before reporting success.
8. Invoke `superpowers:requesting-code-review` before merging.
9. Invoke `superpowers:finishing-a-development-branch` after review findings are
   resolved and verification is green.
