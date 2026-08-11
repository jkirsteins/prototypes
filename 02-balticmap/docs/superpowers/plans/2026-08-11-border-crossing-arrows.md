# Border-crossing arrows Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Draw every arrow on the map as a short fat spear crossing the shared border between two lands, several side by side splitting the width by strength, through one arrow subsystem that no caller can bypass.

**Architecture:** A new pure module `src/borders.ts` turns two regions' SVG paths into a border crossing (a point on the border, a tangent, a normal pointing into the target, and how much border there is). A new module `src/arrow-scene.ts` takes a declarative `ArrowSpec[]`, packs every spec crossing one border into lanes, and writes the DOM. `src/main.ts` stops building arrow geometry and only builds specs; a `biome.json` import ban makes that structural rather than a convention.

**Tech Stack:** TypeScript, Vite, vitest, happy-dom, Biome. No new dependencies.

## Global Constraints

- Read `docs/superpowers/specs/2026-08-11-border-crossing-arrows-design.md` before starting. It is the spec this plan implements.
- `npm test` and `npm run build` must both pass before every commit. Run from `02-balticmap/`.
- `npm test` deliberately excludes `tests/sim.test.ts` and `tests/scenarios.test.ts`. Do not run `npm run balance` - balance evidence is produced on demand only.
- Stage with explicit paths scoped to `02-balticmap/`. Never `git add -A`: other sessions work in sibling prototypes on this same branch.
- No em dashes and no non-typable unicode (no arrows, curly quotes, ellipsis characters) in any code, comment, commit message or doc.
- Comments explain why, never chronicle. No dates, no "changed from", no "previously".
- Player-facing prose that names a card or a faction must be built from `t()` / `card()` / `faction()` in `src/rich-text.ts`. Nothing in this plan adds such prose; keep it that way.
- Map coordinates are the map's own user space (`data.width` x `data.height`, 1000x1400 for Baltic). Every constant below is in those units.
- Geometry modules stay pure: no DOM, no `getBBox`, no `document`. `getBBox()` returns zeros under happy-dom, which is why the numbers must be checkable without it.

## File Structure

| File | Responsibility |
| --- | --- |
| `src/borders.ts` (create) | Parse region paths into rings; compute the crossing between two lands. Pure. |
| `src/arrow-scene.ts` (create) | `ArrowSpec`, `ARROW_KINDS`, lane layout, and the one function that writes arrows into an SVG group. |
| `src/arrows.ts` (modify) | Keeps the spear and segment primitives. `SPEAR` gains nothing; `spearFor` is added for lane-proportioned spears. |
| `src/main.ts` (modify) | Builds specs, binds behaviour to returned groups. Loses `drawMarch`, `drawClaim`, and the geometry in `renderAimArrow` / `flashMarchResolution`. |
| `biome.json` (modify, repo root) | Bans the geometry primitives from `src/main.ts`. |
| `tests/borders.test.ts` (create) | Crossing geometry, including a data test over every adjacency in both maps. |
| `tests/arrow-scene.test.ts` (create) | Lane widths, packing, kind table. |
| `02-balticmap/CLAUDE.md` (modify) | The arrow subsystem section, and the bare-number correction. |

---

### Task 1: Border geometry - rings and shared vertices

**Files:**
- Create: `src/borders.ts`
- Test: `tests/borders.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `export interface Pt { x: number; y: number }`
  - `export function ringsOf(path: string): Pt[][]`
  - `export function sharedVertices(a: Pt[][], b: Pt[][]): Pt[]`

- [ ] **Step 1: Write the failing test**

Create `tests/borders.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { ringsOf, sharedVertices } from "../src/borders";

describe("ringsOf", () => {
  it("reads one subpath as one ring", () => {
    const rings = ringsOf("M10,20L30,40L50,20");
    expect(rings).toEqual([[
      { x: 10, y: 20 }, { x: 30, y: 40 }, { x: 50, y: 20 },
    ]]);
  });

  it("splits a multi-subpath region into a ring each", () => {
    const rings = ringsOf("M0,0L10,0L10,10M100,100L110,100L110,110");
    expect(rings).toHaveLength(2);
    expect(rings[1][0]).toEqual({ x: 100, y: 100 });
  });

  it("drops a subpath too short to be a ring", () => {
    expect(ringsOf("M0,0L1,1M5,5L6,6L7,7")).toHaveLength(1);
  });

  it("reads negative and decimal coordinates", () => {
    expect(ringsOf("M-1.5,2.25L3,4L5,6")[0][0]).toEqual({ x: -1.5, y: 2.25 });
  });
});

describe("sharedVertices", () => {
  it("finds the vertices two rings hold in common", () => {
    const a = [[{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }]];
    const b = [[{ x: 10, y: 0 }, { x: 20, y: 0 }, { x: 10, y: 10 }]];
    expect(sharedVertices(a, b)).toEqual([{ x: 10, y: 0 }, { x: 10, y: 10 }]);
  });

  it("is empty for two rings that touch nowhere", () => {
    const a = [[{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }]];
    const b = [[{ x: 50, y: 50 }, { x: 51, y: 50 }, { x: 51, y: 51 }]];
    expect(sharedVertices(a, b)).toEqual([]);
  });

  it("matches across subpaths, not just the first ring", () => {
    const a = [[{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }],
               [{ x: 90, y: 90 }, { x: 91, y: 90 }, { x: 91, y: 91 }]];
    const b = [[{ x: 91, y: 90 }, { x: 95, y: 90 }, { x: 95, y: 95 }]];
    expect(sharedVertices(a, b)).toEqual([{ x: 91, y: 90 }]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- tests/borders.test.ts`
Expected: FAIL, cannot resolve `../src/borders`.

- [ ] **Step 3: Write the implementation**

Create `src/borders.ts`:

```ts
/** Where two lands meet, read off the map's own polygons.
 *
 *  Adjacent regions in the map data share EXACT vertices - the paths were cut
 *  from one topology - so a shared border is a set intersection rather than a
 *  geometry search. Jersika and Talava share 207 of them.
 *
 *  Pure numbers, no DOM, for the reason `src/arrows.ts` is: `getBBox()` is a
 *  stub under happy-dom, so this is where the shape can actually be checked. */

export interface Pt { x: number; y: number }

/** Every closed ring of a region's `path`. A list rather than one ring: ten
 *  Baltic and eighteen Iberian regions are drawn as several subpaths, being
 *  islands, enclaves and lakes, and a border can run along any of them. */
export function ringsOf(path: string): Pt[][] {
  const out: Pt[][] = [];
  for (const sub of path.split("M").slice(1)) {
    const pts: Pt[] = [];
    for (const m of sub.matchAll(/(-?[\d.]+),(-?[\d.]+)/g)) {
      pts.push({ x: Number(m[1]), y: Number(m[2]) });
    }
    // Two points are a line, not a ring, and no border runs along one.
    if (pts.length > 2) out.push(pts);
  }
  return out;
}

/** Three decimals, which is what the map data carries. A tolerance wider than
 *  the data's own precision would start matching vertices that are merely
 *  near each other, and "near" across a strait is a different question. */
function keyOf(p: Pt): string {
  return `${Math.round(p.x * 1000)},${Math.round(p.y * 1000)}`;
}

/** The vertices two lands hold in common, in the first land's own order. */
export function sharedVertices(a: Pt[][], b: Pt[][]): Pt[] {
  const inB = new Set<string>();
  for (const ring of b) for (const p of ring) inB.add(keyOf(p));
  const out: Pt[] = [];
  const seen = new Set<string>();
  for (const ring of a) {
    for (const p of ring) {
      const k = keyOf(p);
      if (!inB.has(k) || seen.has(k)) continue;
      seen.add(k);
      out.push(p);
    }
  }
  return out;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- tests/borders.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 5: Commit**

```bash
git add src/borders.ts tests/borders.test.ts
git commit -m "feat(balticmap): a border is a set intersection, not a search"
```

---

### Task 2: The crossing - point, tangent, normal, span

**Files:**
- Modify: `src/borders.ts`
- Test: `tests/borders.test.ts`

**Interfaces:**
- Consumes: `ringsOf`, `sharedVertices`, `Pt` from Task 1.
- Produces:
  - `export interface Crossing { at: Pt; tangent: Pt; normal: Pt; span: number; sea: boolean; gap: number }`
  - `export function crossingBetween(a: Pt[][], b: Pt[][]): Crossing`
  - `export function pointInRings(p: Pt, rings: Pt[][]): boolean`

`normal` points from a into b. `span` is the border's extent along `tangent`. `sea` is true where the two lands share no vertex, and `gap` is then the width of the water; `gap` is 0 otherwise.

- [ ] **Step 1: Write the failing test**

Append to `tests/borders.test.ts`:

```ts
import { crossingBetween, pointInRings } from "../src/borders";

/** Two unit squares side by side, sharing the x=10 edge. */
const LEFT = [[
  { x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 20 }, { x: 0, y: 20 },
]];
const RIGHT = [[
  { x: 10, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 20 }, { x: 10, y: 20 },
]];

describe("pointInRings", () => {
  it("is true inside and false outside", () => {
    expect(pointInRings({ x: 5, y: 10 }, LEFT)).toBe(true);
    expect(pointInRings({ x: 15, y: 10 }, LEFT)).toBe(false);
  });
});

describe("crossingBetween", () => {
  it("puts the crossing on a real border vertex", () => {
    const c = crossingBetween(LEFT, RIGHT);
    expect(c.at.x).toBe(10);
    expect([0, 20]).toContain(c.at.y);
  });

  it("runs the tangent along the border", () => {
    const c = crossingBetween(LEFT, RIGHT);
    expect(Math.abs(c.tangent.x)).toBeCloseTo(0, 6);
    expect(Math.abs(c.tangent.y)).toBeCloseTo(1, 6);
  });

  it("points the normal from the first land into the second", () => {
    const c = crossingBetween(LEFT, RIGHT);
    expect(c.normal.x).toBeCloseTo(1, 6);
    expect(c.normal.y).toBeCloseTo(0, 6);
  });

  it("flips the normal when the lands are given the other way round", () => {
    const c = crossingBetween(RIGHT, LEFT);
    expect(c.normal.x).toBeCloseTo(-1, 6);
  });

  it("measures the span as the border's extent", () => {
    expect(crossingBetween(LEFT, RIGHT).span).toBeCloseTo(20, 6);
  });

  it("crosses the water where two lands share no vertex", () => {
    const far = [[
      { x: 40, y: 0 }, { x: 50, y: 0 }, { x: 50, y: 20 }, { x: 40, y: 20 },
    ]];
    const c = crossingBetween(LEFT, far);
    expect(c.sea).toBe(true);
    expect(c.gap).toBeCloseTo(30, 6);
    expect(c.at.x).toBeCloseTo(25, 6);
    expect(c.normal.x).toBeCloseTo(1, 6);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- tests/borders.test.ts`
Expected: FAIL, `crossingBetween` is not exported.

- [ ] **Step 3: Write the implementation**

Append to `src/borders.ts`:

```ts
export interface Crossing {
  /** A vertex OF the border, never a computed point: the centroid of a bent
   *  border sits off it by up to 33 units on this map, so the nearest shared
   *  vertex to that centroid is what an arrow is placed on. */
  at: Pt;
  /** Unit vector along the border, the axis lanes are laid out on. */
  tangent: Pt;
  /** Unit vector from the first land into the second. */
  normal: Pt;
  /** How much border there is along `tangent`. 11 to 308 units on this map. */
  span: number;
  /** True where the two lands share no vertex at all. */
  sea: boolean;
  /** The width of the water on a sea crossing, 0 otherwise. */
  gap: number;
}

/** Ray casting, counting every ring: a region drawn as several subpaths is
 *  inside any of them. */
export function pointInRings(p: Pt, rings: Pt[][]): boolean {
  let inside = false;
  for (const ring of rings) {
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i];
      const b = ring[(i + 1) % ring.length];
      if ((a.y > p.y) !== (b.y > p.y)) {
        const x = a.x + ((p.y - a.y) * (b.x - a.x)) / (b.y - a.y);
        if (p.x < x) inside = !inside;
      }
    }
  }
  return inside;
}

/** How far out the orientation vote probes. Four distances rather than one,
 *  and this is load-bearing: `tangent` is a GLOBAL fit to the whole border and
 *  the border is locally bent under it, so a single probe is ambiguous on 7 of
 *  the 103 adjacencies these maps have. The vote resolves all 103. */
const PROBES = [6, 12, 24, 40];

/** The span a sea crossing lays its lanes along. There is no border to
 *  measure, so this is a constant rather than a number read off the map. */
const SEA_SPAN = 70;

export function crossingBetween(a: Pt[][], b: Pt[][]): Crossing {
  const shared = sharedVertices(a, b);
  if (shared.length >= 2) return borderCrossing(shared, a, b);
  return straitCrossing(a, b);
}

function borderCrossing(shared: Pt[], a: Pt[][], b: Pt[][]): Crossing {
  const n = shared.length;
  const cx = shared.reduce((s, p) => s + p.x, 0) / n;
  const cy = shared.reduce((s, p) => s + p.y, 0) / n;
  let sxx = 0;
  let syy = 0;
  let sxy = 0;
  for (const p of shared) {
    sxx += (p.x - cx) ** 2;
    syy += (p.y - cy) ** 2;
    sxy += (p.x - cx) * (p.y - cy);
  }
  // The principal axis of the shared set. Robust where a strict walk of
  // contiguous vertices is not: a border can be broken into many short runs
  // and still be one frontier.
  const th = 0.5 * Math.atan2((2 * sxy) / n, (sxx - syy) / n);
  const tangent = { x: Math.cos(th), y: Math.sin(th) };
  let lo = Number.POSITIVE_INFINITY;
  let hi = Number.NEGATIVE_INFINITY;
  let at = shared[0];
  let best = Number.POSITIVE_INFINITY;
  for (const p of shared) {
    const t = (p.x - cx) * tangent.x + (p.y - cy) * tangent.y;
    lo = Math.min(lo, t);
    hi = Math.max(hi, t);
    const d = (p.x - cx) ** 2 + (p.y - cy) ** 2;
    if (d < best) {
      best = d;
      at = p;
    }
  }
  const nx = -tangent.y;
  const ny = tangent.x;
  const score = (sign: 1 | -1): number => {
    let s = 0;
    for (const d of PROBES) {
      if (pointInRings({ x: at.x + nx * d * sign, y: at.y + ny * d * sign }, b)) s++;
      if (pointInRings({ x: at.x - nx * d * sign, y: at.y - ny * d * sign }, a)) s++;
    }
    return s;
  };
  const sign: 1 | -1 = score(1) >= score(-1) ? 1 : -1;
  return {
    at,
    tangent,
    normal: { x: nx * sign, y: ny * sign },
    span: hi - lo,
    sea: false,
    gap: 0,
  };
}

/** No shared vertex means no border: these two lands face each other across
 *  water. The narrowest part of the strait is where a crossing goes. */
function straitCrossing(a: Pt[][], b: Pt[][]): Crossing {
  let pa = a[0][0];
  let pb = b[0][0];
  let best = Number.POSITIVE_INFINITY;
  for (const ringA of a) {
    for (const p of ringA) {
      for (const ringB of b) {
        for (const q of ringB) {
          const d = (p.x - q.x) ** 2 + (p.y - q.y) ** 2;
          if (d < best) {
            best = d;
            pa = p;
            pb = q;
          }
        }
      }
    }
  }
  const gap = Math.hypot(pb.x - pa.x, pb.y - pa.y) || 1;
  const normal = { x: (pb.x - pa.x) / gap, y: (pb.y - pa.y) / gap };
  return {
    at: { x: (pa.x + pb.x) / 2, y: (pa.y + pb.y) / 2 },
    tangent: { x: -normal.y, y: normal.x },
    normal,
    span: SEA_SPAN,
    sea: true,
    gap,
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- tests/borders.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/borders.ts tests/borders.test.ts
git commit -m "feat(balticmap): where two lands meet, which way is across"
```

---

### Task 3: The data test - every adjacency on both maps

**Files:**
- Modify: `tests/borders.test.ts`

**Interfaces:**
- Consumes: `ringsOf`, `crossingBetween`, `pointInRings` from Tasks 1-2, plus `REGIONS` from `src/regions.ts`.
- Produces: nothing. This task exists to pin the map-data assumption the whole design rests on.

- [ ] **Step 1: Write the failing test**

Append to `tests/borders.test.ts`:

```ts
import { REGIONS } from "../src/regions";

describe("every adjacency on every map", () => {
  for (const region of Object.values(REGIONS)) {
    const rings = new Map(region.map.regions.map((r) => [r.id, ringsOf(r.path)]));

    it(`${region.id}: crosses at a point on the border, aimed into the target`, () => {
      for (const r of region.map.regions) {
        for (const adjId of r.adjacent) {
          const a = rings.get(r.id);
          const b = rings.get(adjId);
          if (a === undefined || b === undefined) continue;
          const c = crossingBetween(a, b);
          const where = `${r.id} -> ${adjId}`;
          expect(Number.isFinite(c.at.x), where).toBe(true);
          expect(Number.isFinite(c.at.y), where).toBe(true);
          expect(Math.hypot(c.normal.x, c.normal.y), where).toBeCloseTo(1, 6);
          expect(Math.hypot(c.tangent.x, c.tangent.y), where).toBeCloseTo(1, 6);
          expect(c.span, where).toBeGreaterThan(0);
          // The crossing must face the land it is aimed at. Asked one step
          // out, where a bent border is still locally straight.
          const step = 6;
          const into = {
            x: c.at.x + c.normal.x * step, y: c.at.y + c.normal.y * step,
          };
          const back = {
            x: c.at.x - c.normal.x * step, y: c.at.y - c.normal.y * step,
          };
          if (!c.sea) {
            expect(
              pointInRings(into, b) || !pointInRings(back, b), where,
            ).toBe(true);
          }
        }
      }
    });

    it(`${region.id}: only sea neighbours fall back to a strait`, () => {
      const seas: string[] = [];
      for (const r of region.map.regions) {
        for (const adjId of r.adjacent) {
          const a = rings.get(r.id);
          const b = rings.get(adjId);
          if (a === undefined || b === undefined) continue;
          if (crossingBetween(a, b).sea) seas.push(`${r.id}|${adjId}`);
        }
      }
      // Four ORDERED pairs per map, which is two lands facing each other
      // across water in each direction: Saaremaa in the Baltic, the Balearics
      // in Iberia. A fifth would mean the map data lost its shared topology.
      expect(seas.length, seas.join(", ")).toBe(4);
    });
  }
});
```

- [ ] **Step 2: Run the test to verify it passes**

Run: `npm test -- tests/borders.test.ts`
Expected: PASS. This test is written against behaviour Tasks 1-2 already deliver, so it passes on arrival - it is a regression gate on the DATA, not on new code. If it fails, the crossing is wrong for a real pair: print the `where` label and fix `src/borders.ts` before continuing.

- [ ] **Step 3: Commit**

```bash
git add tests/borders.test.ts
git commit -m "test(balticmap): every land pair on both maps has a crossing"
```

---

### Task 4: Lane layout - width is strength

**Files:**
- Create: `src/arrow-scene.ts`
- Test: `tests/arrow-scene.test.ts`

**Interfaces:**
- Consumes: `Crossing`, `Pt` from Task 2.
- Produces:
  - `export const LAYOUT: { blockShare: number; blockMin: number; blockMax: number; laneMin: number; tailDepth: number; headDepth: number; seaClearance: number }`
  - `export function laneWidths(strengths: readonly number[], total: number): number[]`
  - `export function blockWidthFor(span: number): number`
  - `export interface Lane { index: number; width: number; ax: number; ay: number; bx: number; by: number }`
  - `export function layoutLanes(cross: Crossing, items: readonly { strength: number; forward: boolean }[]): Lane[]`

`forward` is true for an item travelling along the crossing's own normal.

- [ ] **Step 1: Write the failing test**

Create `tests/arrow-scene.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  LAYOUT, blockWidthFor, laneWidths, layoutLanes,
} from "../src/arrow-scene";
import type { Crossing } from "../src/borders";

/** A border running up the y axis at x=0, with "across" pointing at +x. */
const FLAT: Crossing = {
  at: { x: 0, y: 0 },
  tangent: { x: 0, y: 1 },
  normal: { x: 1, y: 0 },
  span: 200,
  sea: false,
  gap: 0,
};

describe("blockWidthFor", () => {
  it("takes its share of the border", () => {
    expect(blockWidthFor(100)).toBeCloseTo(55, 6);
  });

  it("caps a wide border and floors a tiny one", () => {
    expect(blockWidthFor(1000)).toBe(LAYOUT.blockMax);
    expect(blockWidthFor(4)).toBe(LAYOUT.blockMin);
  });
});

describe("laneWidths", () => {
  it("gives one arrow the whole block whatever its strength", () => {
    expect(laneWidths([1], 90)).toEqual([90]);
    expect(laneWidths([7], 90)).toEqual([90]);
  });

  it("splits by strength share", () => {
    const [a, b] = laneWidths([2, 1], 90);
    expect(a).toBeCloseTo(60, 6);
    expect(b).toBeCloseTo(30, 6);
  });

  it("raises a lane to the floor and shrinks the others to pay for it", () => {
    const widths = laneWidths([9, 1], 60);
    expect(widths[1]).toBeCloseTo(LAYOUT.laneMin, 6);
    expect(widths[0] + widths[1]).toBeCloseTo(60, 6);
    expect(widths[0]).toBeGreaterThan(widths[1]);
  });

  it("shares evenly when even the floor will not fit", () => {
    const widths = laneWidths([1, 1, 1, 1, 1, 1], 30);
    expect(widths.every((w) => Math.abs(w - 5) < 1e-6)).toBe(true);
  });

  it("never returns a negative width", () => {
    for (const w of laneWidths([50, 1, 1, 1], 30)) expect(w).toBeGreaterThan(0);
  });
});

describe("layoutLanes", () => {
  it("packs lanes edge to edge, centred on the crossing", () => {
    const lanes = layoutLanes(FLAT, [
      { strength: 1, forward: true }, { strength: 1, forward: true },
    ]);
    const total = blockWidthFor(FLAT.span);
    expect(lanes[0].width + lanes[1].width).toBeCloseTo(total, 6);
    // Centres are symmetric about the crossing point on the tangent axis.
    expect(lanes[0].ay + lanes[1].ay).toBeCloseTo(0, 6);
  });

  it("runs a forward lane along the normal and a backward one against it", () => {
    const [fwd, back] = layoutLanes(FLAT, [
      { strength: 1, forward: true }, { strength: 1, forward: false },
    ]);
    expect(fwd.bx).toBeGreaterThan(fwd.ax);
    expect(back.bx).toBeLessThan(back.ax);
  });

  it("starts inside the origin and ends inside the target", () => {
    const [lane] = layoutLanes(FLAT, [{ strength: 1, forward: true }]);
    expect(lane.ax).toBeCloseTo(-LAYOUT.tailDepth, 6);
    expect(lane.bx).toBeCloseTo(LAYOUT.headDepth, 6);
  });

  it("spans the water on a sea crossing instead of standing in it", () => {
    const strait: Crossing = { ...FLAT, sea: true, gap: 100 };
    const [lane] = layoutLanes(strait, [{ strength: 1, forward: true }]);
    expect(lane.bx - lane.ax).toBeCloseTo(100 + LAYOUT.seaClearance * 2, 6);
  });

  it("keeps the caller's order", () => {
    const lanes = layoutLanes(FLAT, [
      { strength: 3, forward: true }, { strength: 1, forward: false },
      { strength: 2, forward: true },
    ]);
    expect(lanes.map((l) => l.index)).toEqual([0, 1, 2]);
    expect(lanes[0].width).toBeGreaterThan(lanes[2].width);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- tests/arrow-scene.test.ts`
Expected: FAIL, cannot resolve `../src/arrow-scene`.

- [ ] **Step 3: Write the implementation**

Create `src/arrow-scene.ts` with the layout half only (the DOM half arrives in Task 6):

```ts
import type { Crossing } from "./borders";

/** How an arrow is sized and placed on the border it crosses.
 *
 *  Opening values tuned by eye against the map's own scale, not derived. The
 *  map is 1000x1400 user units and a land is roughly 200 across, so a 64-unit
 *  arrow is a short step over the frontier rather than a march across a
 *  country. */
export const LAYOUT = {
  /** Share of the border's extent the whole block of arrows may occupy. */
  blockShare: 0.55,
  /** Floored so two lands that barely touch still get a readable arrow, even
   *  though the block then overruns the border. An arrow nobody can see is
   *  worse than one slightly wider than the ground it crosses. */
  blockMin: 30,
  /** Capped so a lone arrow on the map's widest frontier is not absurd. */
  blockMax: 96,
  /** Narrowest a single arrow may be drawn. */
  laneMin: 14,
  /** How far the arrow starts inside the land it leaves. */
  tailDepth: 30,
  /** How far the head reaches inside the land it is aimed at. */
  headDepth: 34,
  /** How far past each coast an arrow across water reaches. */
  seaClearance: 16,
};

export function blockWidthFor(span: number): number {
  return Math.max(
    LAYOUT.blockMin, Math.min(LAYOUT.blockMax, span * LAYOUT.blockShare),
  );
}

/** Each arrow's width, as its share of the block by strength.
 *
 *  A lane below the floor is raised to it and the surplus taken proportionally
 *  from the lanes above the floor, so the block stays inside `total` and the
 *  share stops being exact only once something would be unreadable. Where even
 *  an even split is under the floor there is nothing to take from, and the
 *  block is shared evenly instead. */
export function laneWidths(strengths: readonly number[], total: number): number[] {
  if (strengths.length === 0) return [];
  const even = total / strengths.length;
  const floor = Math.min(LAYOUT.laneMin, even);
  const sum = strengths.reduce((s, v) => s + Math.abs(v), 0);
  if (sum <= 0) return strengths.map(() => even);
  let widths = strengths.map((v) => (Math.abs(v) / sum) * total);
  // Bounded: each pass either fixes every short lane or finds nothing to take
  // from, and the number of lanes on one border is small.
  for (let pass = 0; pass < strengths.length; pass++) {
    const short = widths.map((w) => w < floor - 1e-9);
    if (!short.some(Boolean)) break;
    const owed = widths.reduce((s, w, i) => s + (short[i] ? floor - w : 0), 0);
    const pool = widths.reduce((s, w, i) => s + (short[i] ? 0 : w - floor), 0);
    if (pool <= 0) return strengths.map(() => even);
    widths = widths.map((w, i) =>
      short[i] ? floor : w - ((w - floor) / pool) * owed,
    );
  }
  return widths;
}

export interface Lane {
  /** The caller's own order, which is declaration order. */
  index: number;
  width: number;
  ax: number; ay: number;
  bx: number; by: number;
}

/** Every arrow crossing one border, side by side along it.
 *
 *  Direction does not sort them: an answering raid stands beside the attack it
 *  answers, in the order the two were declared. */
export function layoutLanes(
  cross: Crossing, items: readonly { strength: number; forward: boolean }[],
): Lane[] {
  const total = blockWidthFor(cross.span);
  const widths = laneWidths(items.map((i) => i.strength), total);
  // A strait is not a border: there is no line to cross, so the arrow spans
  // the water rather than standing in the middle of it.
  const tail = cross.sea ? cross.gap / 2 + LAYOUT.seaClearance : LAYOUT.tailDepth;
  const head = cross.sea ? cross.gap / 2 + LAYOUT.seaClearance : LAYOUT.headDepth;
  const out: Lane[] = [];
  let cursor = -total / 2;
  for (let i = 0; i < items.length; i++) {
    const width = widths[i];
    const centre = cursor + width / 2;
    cursor += width;
    const cx = cross.at.x + cross.tangent.x * centre;
    const cy = cross.at.y + cross.tangent.y * centre;
    const dir = items[i].forward ? 1 : -1;
    const nx = cross.normal.x * dir;
    const ny = cross.normal.y * dir;
    out.push({
      index: i, width,
      ax: cx - nx * tail, ay: cy - ny * tail,
      bx: cx + nx * head, by: cy + ny * head,
    });
  }
  return out;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- tests/arrow-scene.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/arrow-scene.ts tests/arrow-scene.test.ts
git commit -m "feat(balticmap): arrows share a border by strength, side by side"
```

---

### Task 5: A spear proportioned to its lane

**Files:**
- Modify: `src/arrows.ts`
- Test: `tests/arrows.test.ts`

**Interfaces:**
- Consumes: `SpearOptions`, `spearPolygon` already in `src/arrows.ts`.
- Produces: `export function spearFor(width: number): SpearOptions`

- [ ] **Step 1: Write the failing test**

Append to `tests/arrows.test.ts`:

```ts
import { spearFor } from "../src/arrows";

describe("spearFor", () => {
  it("fills its lane with the barbs and nothing wider", () => {
    const opts = spearFor(40);
    expect(opts.headHalf).toBeLessThanOrEqual(20);
    expect(opts.headHalf).toBeGreaterThan(17);
  });

  it("keeps the taper: base wider than waist, head widest", () => {
    const opts = spearFor(40);
    expect(opts.headHalf).toBeGreaterThan(opts.baseHalf);
    expect(opts.baseHalf).toBeGreaterThan(opts.waistHalf);
  });

  it("scales every width together, so a narrow lane is the same object", () => {
    const big = spearFor(40);
    const small = spearFor(20);
    expect(small.headHalf / big.headHalf).toBeCloseTo(0.5, 6);
    expect(small.baseHalf / big.baseHalf).toBeCloseTo(0.5, 6);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- tests/arrows.test.ts`
Expected: FAIL, `spearFor` is not exported.

- [ ] **Step 3: Write the implementation**

Append to `src/arrows.ts`:

```ts
/** A spear that fills the lane it was given.
 *
 *  The proportions rather than the sizes are the constant here: a lane is how
 *  much of a shared border this arrow is entitled to, and the barbs filling it
 *  is what makes strength readable as width. `SPEAR` stays as it is for the
 *  callers that size an arrow by hand. */
export function spearFor(width: number): SpearOptions {
  const half = width / 2;
  return {
    baseHalf: half * 0.6,
    waistHalf: half * 0.42,
    headHalf: half * 0.95,
    // Long enough to read as a head at every lane width. The share of the
    // AXIS is clamped inside `spearPolygon`, so a short arrow is still mostly
    // shaft.
    headLen: Math.max(12, half * 1.15),
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- tests/arrows.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/arrows.ts tests/arrows.test.ts
git commit -m "feat(balticmap): a spear the width of the lane it was given"
```

---

### Task 6: The scene - specs in, groups out

**Files:**
- Modify: `src/arrow-scene.ts`
- Test: `tests/arrow-scene.test.ts`

**Interfaces:**
- Consumes: `layoutLanes`, `LAYOUT` from Task 4; `spearFor`, `spearPolygon`, `pointAlong` from `src/arrows.ts`; `Crossing` from `src/borders.ts`.
- Produces:
  - `export type ArrowKind = "march" | "claim" | "aim" | "ghost"`
  - `export interface ArrowKindDef { shape: "spear" | "demand"; className: string; takesLane: boolean; why: string }`
  - `export const ARROW_KINDS: Record<ArrowKind, ArrowKindDef>`
  - `export interface ArrowSpec { id: string; kind: ArrowKind; from: string; to: string; at?: Pt; strength: number; tone: "hostile" | "ours" | "other"; fill?: string; label?: string; chip?: { order: number; clash: boolean }; doomed?: boolean; dataset?: Record<string, string> }`
  - `export interface SceneCtx { crossingFor(from: string, to: string): Crossing | null; freeAnchor(from: string): Pt | null }`
  - `export function renderArrowScene(host: SVGGElement, specs: readonly ArrowSpec[], ctx: SceneCtx): Map<string, SVGGElement>`
  - `export function borderKeyOf(a: string, b: string): string`

`renderArrowScene` clears `host` and rebuilds it. The returned map is spec id to the `<g>` drawn for it, so callers bind behaviour without knowing the geometry.

- [ ] **Step 1: Write the failing test**

Append to `tests/arrow-scene.test.ts`:

```ts
import {
  ARROW_KINDS, borderKeyOf, renderArrowScene,
  type ArrowSpec, type SceneCtx,
} from "../src/arrow-scene";

const NS = "http://www.w3.org/2000/svg";

const ctx: SceneCtx = {
  crossingFor: (from, to) => ({
    at: { x: 0, y: 0 },
    tangent: { x: 0, y: 1 },
    // Every pair in these tests crosses west to east, and back the other way
    // when the caller names them the other way round.
    normal: from < to ? { x: 1, y: 0 } : { x: -1, y: 0 },
    span: 200, sea: false, gap: 0,
  }),
  freeAnchor: () => ({ x: -100, y: 0 }),
};

const march = (id: string, from: string, to: string, strength: number): ArrowSpec => ({
  id, kind: "march", from, to, strength, tone: "hostile", label: `${strength} STR`,
});

describe("borderKeyOf", () => {
  it("names one border whichever way it is crossed", () => {
    expect(borderKeyOf("a", "b")).toBe(borderKeyOf("b", "a"));
  });
});

describe("ARROW_KINDS", () => {
  it("classifies every kind and says why", () => {
    for (const def of Object.values(ARROW_KINDS)) {
      expect(def.className.length).toBeGreaterThan(0);
      expect(def.why.length).toBeGreaterThan(20);
    }
  });
});

describe("renderArrowScene", () => {
  it("draws one group per spec, keyed by id", () => {
    const host = document.createElementNS(NS, "g") as SVGGElement;
    const drawn = renderArrowScene(host, [
      march("m1", "a", "b", 2), march("m2", "b", "a", 1),
    ], ctx);
    expect(drawn.size).toBe(2);
    expect(drawn.get("m1")?.querySelector("polygon")).not.toBeNull();
    expect(host.children).toHaveLength(2);
  });

  it("gives the stronger arrow the wider lane on the same border", () => {
    const host = document.createElementNS(NS, "g") as SVGGElement;
    const drawn = renderArrowScene(host, [
      march("m1", "a", "b", 3), march("m2", "b", "a", 1),
    ], ctx);
    const spread = (id: string): number => {
      const pts = (drawn.get(id)?.querySelector("polygon")
        ?.getAttribute("points") ?? "")
        .split(" ").map((p) => Number(p.split(",")[1]));
      return Math.max(...pts) - Math.min(...pts);
    };
    expect(spread("m1")).toBeGreaterThan(spread("m2"));
  });

  it("rebuilds from nothing, so a stale arrow cannot survive", () => {
    const host = document.createElementNS(NS, "g") as SVGGElement;
    renderArrowScene(host, [march("m1", "a", "b", 1)], ctx);
    renderArrowScene(host, [march("m2", "a", "b", 1)], ctx);
    expect(host.children).toHaveLength(1);
  });

  it("carries the caller's dataset onto the group", () => {
    const host = document.createElementNS(NS, "g") as SVGGElement;
    const drawn = renderArrowScene(host, [{
      ...march("m1", "a", "b", 1), dataset: { actor: "a", target: "b", from: "a" },
    }], ctx);
    expect(drawn.get("m1")?.dataset.actor).toBe("a");
  });

  it("draws a claim as a demand, with no polygon and no strength", () => {
    const host = document.createElementNS(NS, "g") as SVGGElement;
    const drawn = renderArrowScene(host, [{
      id: "c1", kind: "claim", from: "a", to: "b", strength: 1,
      tone: "other", label: "SUBJUGATE",
    }], ctx);
    const g = drawn.get("c1");
    expect(g?.querySelector("polygon")).toBeNull();
    expect(g?.querySelector("line")).not.toBeNull();
    expect(g?.querySelector("circle")).not.toBeNull();
  });

  it("packs a claim into the same block as the raids beside it", () => {
    const host = document.createElementNS(NS, "g") as SVGGElement;
    const drawn = renderArrowScene(host, [
      march("m1", "a", "b", 1),
      { id: "c1", kind: "claim", from: "a", to: "b", strength: 1, tone: "other" },
    ], ctx);
    const y = (id: string): number =>
      Number(drawn.get(id)?.querySelector("line, polygon")
        ?.getAttribute("y1") ?? NaN);
    // Two lanes on one border sit at different offsets along the tangent.
    expect(host.children).toHaveLength(2);
    expect(y("c1")).not.toBe(0);
  });

  it("draws a free-aimed spec to its own point", () => {
    const host = document.createElementNS(NS, "g") as SVGGElement;
    const drawn = renderArrowScene(host, [{
      id: "aim", kind: "aim", from: "a", to: "", at: { x: 40, y: 40 },
      strength: 2, tone: "ours",
    }], ctx);
    expect(drawn.get("aim")?.querySelector("polygon")).not.toBeNull();
  });

  it("skips a spec whose lands have no crossing rather than drawing NaN", () => {
    const host = document.createElementNS(NS, "g") as SVGGElement;
    const none: SceneCtx = { crossingFor: () => null, freeAnchor: () => null };
    const drawn = renderArrowScene(host, [march("m1", "a", "b", 1)], none);
    expect(drawn.size).toBe(0);
    expect(host.children).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- tests/arrow-scene.test.ts`
Expected: FAIL, `renderArrowScene` is not exported.

- [ ] **Step 3: Write the implementation**

Append to `src/arrow-scene.ts` (and add the imports it needs at the top of the file):

```ts
import type { Crossing, Pt } from "./borders";
import { pointAlong, spearFor, spearPolygon } from "./arrows";

/** What kind of thing an arrow IS. Not a per-caller distinction: the scene
 *  draws marches, claims, aim previews and the ghosts of resolved marches
 *  through one path, and a kind is the only place their differences live. */
export type ArrowKind = "march" | "claim" | "aim" | "ghost";

export interface ArrowKindDef {
  /** A filled spear, or the dashed demand a claim is drawn as. */
  shape: "spear" | "demand";
  className: string;
  /** Whether this kind takes a lane of the border's width. */
  takesLane: boolean;
  /** Why this kind is drawn the way it is. */
  why: string;
}

/** Exhaustive, the `NOTICE_RULES` shape: a new kind of arrow does not compile
 *  until somebody says what it looks like and why. */
export const ARROW_KINDS: Record<ArrowKind, ArrowKindDef> = {
  march: {
    shape: "spear", className: "march-arrow", takesLane: true,
    why: "An army in flight. The widest thing on its border if it is the strongest.",
  },
  claim: {
    shape: "demand", className: "claim-arrow", takesLane: true,
    why: "Nobody is marching, so it is dashed with a ring for a head - but it is a real declared thing on the board, so it takes a lane like everything else.",
  },
  aim: {
    shape: "spear", className: "aim-arrow", takesLane: true,
    why: "The arrow a play would declare, at the width it would really have, so aiming shows the board it is about to make.",
  },
  ghost: {
    shape: "spear", className: "clash-flash", takesLane: true,
    why: "A march that has already landed, fading where it stood - laid out with the living so a fade is never drawn across a live spear.",
  },
};

export interface ArrowSpec {
  /** The caller's handle. Behaviour is bound to the group this returns, so an
   *  id has to be stable for as long as the arrow is. */
  id: string;
  kind: ArrowKind;
  /** Faction ids. `to` may be empty where `at` is given. */
  from: string;
  to: string;
  /** A point to aim at instead of a land, for a drag over open map. */
  at?: Pt;
  /** What the lane split divides. A claim carries 1: it has no strength of
   *  its own and is one declared thing. */
  strength: number;
  tone: "hostile" | "ours" | "other";
  /** A rival's own colour, for tone "other". */
  fill?: string;
  label?: string;
  chip?: { order: number; clash: boolean };
  /** A claim already answered, drawn faded. */
  doomed?: boolean;
  /** Written onto the group, for the hover, the pin and the counter click. */
  dataset?: Record<string, string>;
}

export interface SceneCtx {
  /** The border between two lands, or null where there is none to draw on. */
  crossingFor(from: string, to: string): Crossing | null;
  /** Where an arrow with no target starts. */
  freeAnchor(from: string): Pt | null;
}

/** One border, whichever way it is crossed. */
export function borderKeyOf(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

const NS = "http://www.w3.org/2000/svg";

/** Where the strength sits along the shaft. Three stations cycled by lane, so
 *  two neighbours never sit level with each other: an arrow is short, and two
 *  labels at the same height across adjacent lanes overlap. */
const LABEL_STATIONS = [0.26, 0.5, 0.74];

/** Below this the shaft carries the bare number. Safe only because the ordinal
 *  chip sits behind the tail: the shaft carries exactly one number, so there
 *  is nothing for a bare number to be confused with. */
const BARE_NUMBER_WIDTH = 24;

const svgEl = <K extends keyof SVGElementTagNameMap>(
  name: K, attrs: Record<string, string | number> = {},
): SVGElementTagNameMap[K] => {
  const el = document.createElementNS(NS, name);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  return el;
};

/** Every arrow on the map, drawn from a description of what is happening.
 *
 *  Rebuilt whole: a march store this small is cheaper to redraw than to diff,
 *  and a stale arrow is a lie about what is coming. */
export function renderArrowScene(
  host: SVGGElement, specs: readonly ArrowSpec[], ctx: SceneCtx,
): Map<string, SVGGElement> {
  host.replaceChildren();
  const drawn = new Map<string, SVGGElement>();
  const byBorder = new Map<string, ArrowSpec[]>();
  const free: ArrowSpec[] = [];
  for (const spec of specs) {
    if (spec.to === "" || spec.at !== undefined) {
      free.push(spec);
      continue;
    }
    const key = borderKeyOf(spec.from, spec.to);
    byBorder.set(key, [...(byBorder.get(key) ?? []), spec]);
  }
  for (const group of byBorder.values()) {
    const first = group[0];
    const cross = ctx.crossingFor(first.from, first.to);
    if (cross === null) continue;
    // One frame for the whole border: the crossing's own normal runs from the
    // land that sorts first, so every spec is measured against the same axis.
    const [a] = borderKeyOf(first.from, first.to).split("|");
    const lanes = layoutLanes(
      cross,
      group.map((s) => ({ strength: s.strength, forward: s.from === a })),
    );
    for (const lane of lanes) {
      const g = drawArrow(group[lane.index], lane);
      if (g === null) continue;
      host.appendChild(g);
      drawn.set(group[lane.index].id, g);
    }
  }
  for (const spec of free) {
    const start = spec.at !== undefined && spec.to === ""
      ? ctx.freeAnchor(spec.from) : ctx.freeAnchor(spec.from);
    const end = spec.at;
    if (start === null || end === undefined) continue;
    const lane = {
      index: 0, width: blockWidthFor(0),
      ax: start.x, ay: start.y, bx: end.x, by: end.y,
    };
    const g = drawArrow(spec, lane);
    if (g === null) continue;
    host.appendChild(g);
    drawn.set(spec.id, g);
  }
  return drawn;
}

function drawArrow(spec: ArrowSpec, lane: Lane): SVGGElement | null {
  const def = ARROW_KINDS[spec.kind];
  const g = svgEl("g");
  g.classList.add(def.className, `march-${spec.tone}`);
  if (spec.doomed === true) g.classList.add("claim-doomed");
  for (const [k, v] of Object.entries(spec.dataset ?? {})) g.dataset[k] = v;

  if (def.shape === "spear") {
    const points = spearPolygon(
      lane.ax, lane.ay, lane.bx, lane.by, spearFor(lane.width),
    );
    if (points === "") return null;
    const poly = svgEl("polygon", { points });
    if (spec.fill !== undefined) poly.setAttribute("fill", spec.fill);
    g.appendChild(poly);
  } else {
    const len = Math.hypot(lane.bx - lane.ax, lane.by - lane.ay);
    if (len === 0) return null;
    const ux = (lane.bx - lane.ax) / len;
    const uy = (lane.by - lane.ay) / len;
    g.appendChild(svgEl("line", {
      x1: lane.ax, y1: lane.ay, x2: lane.bx - ux * 8, y2: lane.by - uy * 8,
    }));
    // A ring rather than a barb: a claim arrives and demands, it does not
    // strike, and the two must not be told apart by squinting at a dash.
    const ring = svgEl("circle", {
      cx: lane.bx - ux * 4, cy: lane.by - uy * 4, r: 6,
    });
    ring.classList.add("claim-head");
    g.appendChild(ring);
  }

  if (spec.label !== undefined) {
    const station = LABEL_STATIONS[lane.index % LABEL_STATIONS.length];
    const at = spec.kind === "claim"
      // The one label that is a word rather than a number, and wider than the
      // arrow it belongs to: past the head, in the land being demanded.
      ? pointAlong(lane.ax, lane.ay, lane.bx, lane.by, 1.18)
      : pointAlong(lane.ax, lane.ay, lane.bx, lane.by, station);
    const text = svgEl("text", { x: at.x, y: at.y });
    text.classList.add(spec.kind === "claim" ? "claim-label" : "march-strength");
    if (spec.kind !== "claim") text.setAttribute("dominant-baseline", "middle");
    text.textContent = spec.kind !== "claim" && lane.width < BARE_NUMBER_WIDTH
      ? spec.label.replace(/ STR$/, "")
      : spec.label;
    g.appendChild(text);
  }

  if (spec.chip !== undefined) {
    // Behind the tail, outside the block. On the shaft the chips collide as
    // soon as a border carries three arrows, and a chip over the head reads
    // as part of the arrowhead.
    const at = pointAlong(
      lane.ax, lane.ay, lane.bx, lane.by,
      -0.18 - (lane.index % LABEL_STATIONS.length) * 0.14,
    );
    const label = spec.chip.clash
      ? `${ordinal(spec.chip.order)} - clash` : ordinal(spec.chip.order);
    const width = 12 + label.length * 5.6;
    const chip = svgEl("g");
    chip.classList.add("march-order");
    const bg = svgEl("rect", {
      x: at.x - width / 2, y: at.y - 9, width, height: 15, rx: 7.5,
    });
    bg.classList.add("march-order-bg");
    const text = svgEl("text", { x: at.x, y: at.y + 2 });
    text.classList.add("march-order-text");
    text.textContent = label;
    chip.append(bg, text);
    g.appendChild(chip);
  }
  return g;
}

/** "1st", "2nd", "3rd", "4th" - the landing order in words, so the number can
 *  never be read as a strength. */
function ordinal(n: number): string {
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) return `${n}th`;
  const suffix = { 1: "st", 2: "nd", 3: "rd" }[n % 10] ?? "th";
  return `${n}${suffix}`;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- tests/arrow-scene.test.ts`
Expected: PASS. If the free-arrow branch reads awkwardly (`start` computed the same way in both arms), simplify it to one call while keeping the test green.

- [ ] **Step 5: Run the whole suite and the build**

Run: `npm test && npm run build`
Expected: both pass. `src/main.ts` still has its own `ordinal`; that goes in Task 7.

- [ ] **Step 6: Commit**

```bash
git add src/arrow-scene.ts tests/arrow-scene.test.ts
git commit -m "feat(balticmap): one subsystem draws every arrow on the map"
```

---

### Task 7: Rewire main.ts onto the scene

**Files:**
- Modify: `src/main.ts` (`renderMarchArrows` ~1531, `drawClaim` ~1655, `drawMarch` ~1711, `renderAimArrow` ~1494, `flashMarchResolution` ~1878, `appendOrder` ~1629, `ordinal` ~1615)
- Test: existing suite.

**Interfaces:**
- Consumes: everything Tasks 1-6 produce.
- Produces: nothing new. `main.ts` keeps `marchAnchors` for the free-drag preview only.

- [ ] **Step 1: Add the scene context**

In `src/main.ts`, beside the other derived maps (near `regionById`, line ~265), add:

```ts
/** The rings of every land on this map, parsed once. `crossingBetween` is
 *  cached per border because the walk is over a thousand vertices a side. */
const ringsByFaction = new Map<string, Pt[][]>(
  data.regions.map((r) => [r.faction, ringsOf(r.path)]),
);
const crossings = new Map<string, Crossing | null>();

/** The border between two lands, from the first's side. Cached both ways
 *  round off one computation: the reverse is the same crossing with its
 *  normal flipped. */
function crossingFor(from: string, to: string): Crossing | null {
  const key = `${from}>${to}`;
  const hit = crossings.get(key);
  if (hit !== undefined) return hit;
  const a = ringsByFaction.get(from);
  const b = ringsByFaction.get(to);
  const value = a === undefined || b === undefined
    ? null : crossingBetween(a, b);
  crossings.set(key, value);
  if (value !== null) {
    crossings.set(`${to}>${from}`, {
      ...value, normal: { x: -value.normal.x, y: -value.normal.y },
    });
  }
  return value;
}

const sceneCtx: SceneCtx = {
  crossingFor,
  freeAnchor: (from) => townsByFaction.get(from)?.[0] ?? regionCenter(from) ?? null,
};
```

Import what it needs:

```ts
import { crossingBetween, ringsOf, type Crossing, type Pt } from "./borders";
import {
  renderArrowScene, type ArrowSpec, type SceneCtx,
} from "./arrow-scene";
```

- [ ] **Step 2: Replace `renderMarchArrows` with a spec builder**

Replace the body of `renderMarchArrows` (from `arrowGroup.replaceChildren();` to the closing brace) with:

```ts
function renderMarchArrows(): void {
  const human = localHuman();
  if (!inPlay() || !human) {
    arrowGroup.replaceChildren();
    syncArrowFocus();
    return;
  }
  // Aiming does NOT take the arrows away, for the same reason it does not take
  // the badges away: what is already flying at a land is half of what decides
  // whether to send an army there.
  //
  // Inert rather than absent: no counter click, no hover focus, so while an
  // aim is live the only thing a click on the map can mean is still "this
  // land". `.aiming` in src/style.css is the pointer half.
  const aiming = targetingLive();
  arrowGroup.classList.toggle("aiming", aiming);
  const realm = fullRealmOf(human.factionId, game.overlords, game.incorporated);
  const order = landingOrder();
  const specs: ArrowSpec[] = [];
  for (const [key, m] of Object.entries(game.marches)) {
    const against = realm.has(m.to);
    const ours = realm.has(m.from);
    specs.push({
      id: key, kind: "march", from: m.from, to: m.to, strength: m.damage,
      // Against you first: an arrow between your own two lands cannot happen,
      // so the order only decides how a lord's raid on its own vassal reads,
      // and that is an attack on your realm.
      tone: against ? "hostile" : ours ? "ours" : "other",
      fill: against || ours
        ? undefined : factionById.get(m.actor)?.color ?? "#7a6a55",
      // "1 STR", not a bare number, wherever the lane has room for it.
      label: `${m.damage} STR`,
      chip: order.get(key),
      dataset: {
        actor: m.actor, target: m.to,
        // The two ENDS, which is what the hover lights. Not the same question
        // as `actor`: a lord marches out of a land its vassal holds.
        from: m.from,
      },
    });
  }
  // Claims LAST, so they sit above the spears. A demand of fealty decides who
  // owns a land; a raid decides a number on it.
  for (const [key, claim] of Object.entries(game.claims)) {
    const against = realm.has(claim.to);
    const ours = realm.has(claim.from);
    // Says so when it is already going to come to nothing: the demand rides
    // for a whole turn and the board moves under it.
    const doomed = !claimWouldLand(viewOf(game), claim.actor, claim.to);
    specs.push({
      id: `claim:${key}`, kind: "claim", from: claim.from, to: claim.to,
      strength: 1,
      tone: against ? "hostile" : ours ? "ours" : "other",
      label: doomed ? "SUBJUGATE (will fail)" : "SUBJUGATE",
      doomed,
      chip: order.get(`claim:${key}`),
      dataset: { actor: claim.actor, target: claim.to, from: claim.from },
    });
  }
  const drawn = renderArrowScene(arrowGroup, specs, sceneCtx);
  // An arrow you could answer right now is a button. Picking a source and a
  // target by hand to aim a counter back down an arrow already on the screen
  // is the game asking the player to restate something it can see.
  //
  // Never while an aim is live: the arrow is on screen to be READ then.
  for (const [key, m] of Object.entries(game.marches)) {
    const g = drawn.get(key);
    if (g === undefined) continue;
    const counterIndex = aiming ? null : counterFor(m);
    if (counterIndex === null) continue;
    g.classList.add("march-counterable");
    armArrowAsCounter(g, m, counterIndex);
  }
  // Every arrow on the map is new, including the one the pointer is resting
  // on. Nothing will announce that, so the focus is re-derived here.
  syncArrowFocus();
}
```

- [ ] **Step 3: Delete what the scene now owns**

Delete from `src/main.ts`: `drawMarch`, `drawClaim`, `appendOrder`, `ordinal`, and the constants only they used - `MAIN_GAP`, `COUNTER_GAP`, `COUNTER_SCALE`, `COUNTER_LENGTH_SHARE`, `COUNTER_CLEARANCE`, `ARROW_FIT_LENGTH`, `MIN_FIT`. Leave `clearancesFor`, `TOWN_CLEARANCE_TAIL`, `TOWN_CLEARANCE_HEAD` and `CLEARANCE_MAX_SHARE` only if the aim preview below still uses them; if nothing does, delete those too.

`axesOf` may become unused in `main.ts` once `renderMarchArrows` no longer walks axes - but `landingOrder` still calls it for the clash pairing, so check before touching the import.

- [ ] **Step 4: Rewire the aim preview**

Replace the geometry half of `renderAimArrow` (everything after the `aim-target` loop) with a scene call. Keep the `aim-target` land marking exactly as it is:

```ts
  if (aiming === null) {
    aimGroup.replaceChildren();
    return;
  }
  const human = localHuman();
  const armedCard = armed === null || !human ? undefined : human.hand[armed];
  const strength = armedCard === undefined
    ? 1
    : attackDamageFor(viewOf(game), human.factionId, armedCard).damage;
  renderArrowScene(aimGroup, [{
    id: "aim",
    kind: "aim",
    from: aiming.from,
    // A legal target crosses the real border; a drag over open map runs to
    // the pointer, which is the one arrow in the game with no border to cross.
    to: aiming.over ?? "",
    at: aiming.over === null ? aiming.at : undefined,
    strength,
    tone: "ours",
  }], sceneCtx);
  const g = aimGroup.firstElementChild;
  if (g instanceof SVGGElement) g.classList.toggle("aim-valid", aiming.over !== null);
```

Move the `aimGroup.replaceChildren()` that opened the function into the early-return arm shown above; `renderArrowScene` clears the group itself.

Import `attackDamageFor` if it is not already imported in `main.ts` - check first, it is used near line 1817.

- [ ] **Step 5: Rewire the resolution ghost**

In `flashMarchResolution`, replace the anchor and polygon geometry with a scene call into a ghost group, keeping the label, the animations and the callback exactly as they are:

```ts
  const from = e.sourceFactionId;
  const to = e.targetFactionId;
  if (from === undefined || to === undefined) {
    onDone();
    return;
  }
  const standoff = e.amount === undefined;
  const struckUs = realm.has(to);
  const drawn = renderArrowScene(ghostGroup, [{
    id: "ghost", kind: "ghost", from, to,
    strength: e.clash?.incoming ?? 1,
    tone: standoff ? "other" : struckUs ? "hostile" : "ours",
    fill: standoff ? "#6b5d49" : struckUs ? "#992f27" : "#d4af37",
  }], sceneCtx);
  const g = drawn.get("ghost");
  if (g === undefined) {
    onDone();
    return;
  }
  g.classList.add(standoff ? "clash-even" : struckUs ? "clash-bad" : "clash-good");
  const poly = g.querySelector("polygon");
  if (poly !== null) {
    poly.setAttribute("stroke", "#fdfaf4");
    poly.setAttribute("stroke-width", "1.2");
    runAnimation(poly, [{ opacity: 1 }, { opacity: 0 }], CLASH_FLASH_MS);
  }
```

The label keeps its existing text and `clashFraction` placement, but is positioned along the ghost's own lane: read the polygon's first and middle point, or simpler, place it at the crossing itself:

```ts
  const cross = crossingFor(from, to);
  const at = cross === null ? { x: 0, y: 0 } : cross.at;
```

Add the ghost group beside `arrowGroup` at line ~231, so a ghost is not wiped by a live rebuild mid-fade:

```ts
const ghostGroup = document.createElementNS(
  "http://www.w3.org/2000/svg", "g",
) as SVGGElement;
ghostGroup.classList.add("march-ghosts");
svg.appendChild(ghostGroup);
```

Clear it in the animation's completion callback where `g.remove()` is called today.

- [ ] **Step 6: Run the suite and the build**

Run: `npm test && npm run build`
Expected: both pass. Fix whatever the type checker names; do not silence it with `any`.

- [ ] **Step 7: Commit**

```bash
git add src/main.ts
git commit -m "feat(balticmap): the map builds arrow specs, not arrow geometry"
```

---

### Task 8: Close the door behind it

**Files:**
- Modify: `biome.json` (repo root, `/Users/janis.kirsteins/Projects/prototypes/biome.json`)
- Modify: `02-balticmap/CLAUDE.md`

**Interfaces:**
- Consumes: Task 7's rewiring, which must land first or the lint fails on the old code.
- Produces: nothing.

- [ ] **Step 1: Add the import ban**

In the `02-balticmap/src/main.ts` override in `biome.json`, add a second path beside the existing `./game` entry:

```json
"./arrows": {
  "importNames": [
    "spearPolygon",
    "insetSegment",
    "offsetSegment",
    "scaleSpear",
    "spearFor"
  ],
  "message": "Every arrow on the map goes through renderArrowScene in src/arrow-scene.ts, which is the only thing that knows about borders and lanes. Geometry here is a fifth kind of arrow with its own rules - see 02-balticmap/CLAUDE.md."
}
```

- [ ] **Step 2: Run the linter**

Run from the repo root: `npm run lint`
Expected: PASS. A failure here means `main.ts` still imports a banned name, which means Task 7 left geometry behind - go and finish it rather than shrinking the ban.

- [ ] **Step 3: Write the CLAUDE.md section**

Add a section to `02-balticmap/CLAUDE.md`, after "The guest is never a branch at the call site" (which it parallels):

```markdown
## An arrow crosses the border, and there is one thing that draws it

Every arrow on the map - a march in flight, a subjugation demanded, the
preview under an armed card, the ghost of a march that just landed - is an
`ArrowSpec` handed to `renderArrowScene` in `src/arrow-scene.ts`. There is no
march-arrow code and aim-preview code; there is one scene with four kinds in
it, and `ARROW_KINDS` is exhaustive, so a fifth does not compile until
somebody says what it looks like and why.

The root `biome.json` forbids `src/main.ts` from importing `spearPolygon`,
`insetSegment`, `offsetSegment`, `scaleSpear` and `spearFor` at all, the same
way it forbids the engine's mutators: there is no local path to put an arrow
on the map that could forget the border, the lane or the ghost beside it.

**The border is in the map data already.** Adjacent regions share EXACT
vertices, so `crossingBetween` in `src/borders.ts` is a set intersection, not
a geometry search. Three things about it are load-bearing:

- **The crossing is a real border vertex**, the shared one nearest their
  centroid, never a computed point. The centroid of a bent border sits up to
  33 units off the border itself on this map.
- **The normal's direction is decided by a vote**, four probe distances in
  and out of both lands. The tangent is a global fit to the whole border and
  the border is locally bent under it, so one probe is ambiguous on 7 of the
  103 adjacencies these two maps have. `tests/borders.test.ts` walks every
  pair on both maps, which is the test that would notice.
- **A strait is not a border.** Two lands that share no vertex face each
  other across water - Saaremaa and the Balearics, four ordered pairs per
  map - and their arrows SPAN the water instead of standing in the middle of
  it.

Width is strength and position is declaration order. Every arrow crossing one
border splits `clamp(span * 0.55, 30, 96)` between them by strength share,
with a floor of 14 that the lanes above it pay for, packed edge to edge. One
arrow takes the whole block whatever its strength; two out and one back is 66%
and 33%. Direction does not sort them - an answering raid stands beside the
attack it answers, in the order the two were declared.
```

- [ ] **Step 4: Correct the bare-number rule in CLAUDE.md**

The existing rule says a strength must read "1 STR" and never a bare digit, because two numbers ride on one arrow. The ordinal chip has moved off the shaft, so amend that passage to say:

```markdown
  The strength is "1 STR" wherever the lane has room for it, and the bare
  number below `BARE_NUMBER_WIDTH`. The bare number is safe only because the
  landing-order chip sits BEHIND the tail rather than on the shaft: the shaft
  carries exactly one number, and there is nothing left for a digit to be
  confused with. Put an ordinal back on the shaft and the "1 STR" form has to
  come back with it.
```

Find the passage by searching `CLAUDE.md` for "not a bare" and edit it in place rather than adding a second statement of the rule.

- [ ] **Step 5: Commit**

```bash
git add ../biome.json CLAUDE.md
git commit -m "docs(balticmap): one door to the arrow layer, and it is shut"
```

---

### Task 9: See it in a browser

**Files:** none. This task changes nothing; it verifies.

**Interfaces:**
- Consumes: everything.
- Produces: a report of what was seen, and any follow-up fixes as their own commits.

- [ ] **Step 1: Start the dev server**

Run from `02-balticmap/`: `npm run dev`
The page is at `http://127.0.0.1:5173/prototypes/02/`, not the bare root.

- [ ] **Step 2: Walk the cases**

Open each URL and READ the screen, text included, not just the layout:

1. `?seed=7&faction=selonians&march=jersikans>talavians` - one arrow on a long bent border. It must cross the border, not run town to town.
2. `?seed=7&faction=selonians&march=semigallian-confederacy>lower-daugava-livs;lower-daugava-livs>semigallian-confederacy` - a clash. The stronger arrow is wider; the two stand side by side, not nose to nose.
3. `?seed=7&faction=selonians&march=semigallian-confederacy>lower-daugava-livs;semigallian-confederacy>selonians` - two arrows out of one land at different borders.
4. `?seed=7&faction=osilians&march=osilians>laanians` - the sea crossing. The arrow spans the water and touches both lands.
5. `?region=iberia&seed=7&faction=castilians-of-burgos&march=castilians-of-burgos>leonese` - the other map.
6. `?seed=7&faction=selonians&turns=6` - a live board. Hover an arrow: the two lands light and every other arrow fades. Pin a land: arrows not about that realm dim.
7. With a Raid in hand, arm it and drag from your own land over a legal target: the preview snaps to the border at the width the arrow will have. Drag over open sea: the preview runs to the pointer.
8. Play a Raid, end the turn, and watch the turn-start replay: the ghost fades where the arrow stood.

- [ ] **Step 3: Report and fix**

Say what to play and what would look wrong. Anything wrong gets its own commit with a test where the failure was testable.

- [ ] **Step 4: Stop the server**

- [ ] **Step 5: Final gate**

Run: `npm test && npm run build` from `02-balticmap/`, and `npm run lint` from the repo root.
Expected: all three pass.

---

## Self-Review

**Spec coverage.** Border geometry (Tasks 1-2), the data test the spec calls the assumption's gate (Task 3), lane widths and packing (Task 4), lane-proportioned spears (Task 5), the subsystem, kind table and label rules (Task 6), main.ts rewiring including ghost and preview (Task 7), the import ban and both CLAUDE.md edits (Task 8), the browser pass (Task 9).

**Known soft spots for the implementer, called out rather than hidden:**

- Task 7 Step 5 places the clash label at the crossing rather than along the ghost's own axis. If that reads wrong in Task 9's step 8, move it to `pointAlong` over the ghost lane's endpoints, which are on the group's polygon.
- The free-arrow branch in Task 6's `renderArrowScene` computes `start` identically in both arms. Collapse it; the test does not care which way.
- `landingOrder` is untouched and still keys claims as `claim:${key}`. Task 7's spec ids use the same strings deliberately, so `order.get` keeps working.
