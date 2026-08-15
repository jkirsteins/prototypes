# Arrow depth and legibility Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An arrow ends inside the land it is aimed at, and a quarrel between
two rivals is something the player can see.

**Architecture:** `src/borders.ts` learns to measure how much land lies along a
ray (`reach`) and hangs a small table of measured `Station`s off every
`Crossing`. `src/arrow-scene.ts` stops placing lanes at fixed depths off a
straight tangent and stands each one on a station, reaching exactly as far as
that station has room. `src/map-render.ts` learns `inkFor`, which darkens a
faction colour until it contrasts with the land; `paintArrows` uses it for
rival arrows, which stop being drawn at 45% opacity. The four CSS rules that
raced to set an arrow's opacity collapse into one `ArrowSpec.emphasis` field.

**Tech Stack:** TypeScript, Vite, vitest (happy-dom where a DOM is needed),
plain imperative DOM and SVG. No framework, no new dependencies.

## Global Constraints

- Working directory is `02-balticmap`. `npm test` and `npm run build` must both
  pass before any commit. `npm run balance` is NOT part of this work.
- Stage with explicit paths scoped to `02-balticmap`. Never `git add -A`.
- No em dashes and no non-typable unicode in any output, code or comment.
- Comments explain why, never chronicle a change: no dates, no "was X now Y".
- Every player-facing name of a card or faction is a `Segment`, never
  interpolated into a string. Nothing in this plan adds player-facing prose.
- The spec is `docs/superpowers/specs/2026-08-15-arrow-depth-and-legibility-design.md`.
  Read the section named in a task before starting it.
- Numbers quoted in tests come from measurements in the spec. If an
  implementation produces a different count, the implementation is wrong until
  proven otherwise - do not edit the expected number to match.

---

## File Structure

| File | Responsibility after this plan |
|---|---|
| `src/borders.ts` | Where two lands meet, PLUS how much land lies along a ray and a per-border table of measured stations. Owns `ARROW_DEPTHS`. Pure numbers, no DOM. |
| `src/arrow-scene.ts` | Lane packing, station selection, one scene of four arrow kinds, and `emphasisFor`. Never sees a polygon. |
| `src/map-render.ts` | Colour helpers (`darkenColor`, `brightenColor`, new `contrastRatio` and `inkFor`) and map rendering. |
| `src/main.ts` | `paintArrows` builds specs: tone, ink, dataset, emphasis. No geometry. |
| `src/style.css` | One opacity rule per emphasis, arrow casing. |
| `tests/borders.test.ts` | `reach`, stations, and the all-pairs invariant over both maps. |
| `tests/arrow-scene.test.ts` | Lane arithmetic against synthetic crossings, and `emphasisFor`. |
| `tests/map-render.test.ts` (may not exist; see Task 6) | `inkFor` over every faction colour on both maps. |

---

### Task 1: `reach` measures how much land lies along a ray

**Files:**
- Modify: `src/borders.ts` (add after `pointInRings`, around line 85)
- Test: `tests/borders.test.ts`

**Interfaces:**
- Consumes: `Pt`, `pointInRings` (both already in `src/borders.ts`)
- Produces: `export function reach(from: Pt, dir: Pt, rings: Pt[][], want: number, inset: number): number`
  and `export const ARROW_DEPTHS: { head: number; tail: number; seaClearance: number; min: number; inset: number }`

- [ ] **Step 1: Write the failing tests**

Add to `tests/borders.test.ts`, after the `pointInRings` describe block. `LEFT`
and `RIGHT` are already defined in that file (two 10x20 squares meeting at
x=10).

```ts
describe("reach", () => {
  const EAST = { x: 1, y: 0 };
  const WEST = { x: -1, y: 0 };

  it("gives the whole of `want` where the land runs past it", () => {
    // From the border into RIGHT: 10 units of land, asking for 6.
    expect(reach({ x: 10, y: 10 }, EAST, RIGHT, 6, 2)).toBeCloseTo(6, 3);
  });

  it("stops short of the far edge by the inset", () => {
    // RIGHT ends at x=20, so 10 units of land for a `want` of 30.
    expect(reach({ x: 10, y: 10 }, EAST, RIGHT, 30, 2)).toBeCloseTo(8, 3);
  });

  it("measures backwards along a negative direction", () => {
    expect(reach({ x: 10, y: 10 }, WEST, LEFT, 30, 2)).toBeCloseTo(8, 3);
  });

  it("is -1 where the ray meets the land nowhere inside `want`", () => {
    // Facing away from RIGHT entirely.
    expect(reach({ x: 10, y: 10 }, WEST, RIGHT, 30, 2)).toBe(-1);
  });

  it("is -1 where the land is further off than `want`", () => {
    const far = [[
      { x: 100, y: 0 }, { x: 110, y: 0 }, { x: 110, y: 20 }, { x: 100, y: 20 },
    ]];
    expect(reach({ x: 10, y: 10 }, EAST, far, 30, 2)).toBe(-1);
  });

  it("measures from a point already inside the land", () => {
    // Five units in, fifteen to the far edge, less the inset.
    expect(reach({ x: 15, y: 10 }, EAST, RIGHT, 30, 2)).toBeCloseTo(3, 3);
  });

  it("takes the far side of a sliver rather than stopping at the near one", () => {
    // Two bars with a gap: [0,4] and [8,12]. From x=0 the honest answer is
    // the end of the run the tip would land in.
    const bars = [
      [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 20 }, { x: 0, y: 20 }],
      [{ x: 8, y: 0 }, { x: 12, y: 0 }, { x: 12, y: 20 }, { x: 8, y: 20 }],
    ];
    expect(reach({ x: 0, y: 10 }, EAST, bars, 30, 2)).toBeCloseTo(10, 3);
  });

  it("never returns more than `want` and never less than zero", () => {
    expect(reach({ x: 10, y: 10 }, EAST, RIGHT, 4, 2)).toBeLessThanOrEqual(4);
    expect(reach({ x: 19, y: 10 }, EAST, RIGHT, 30, 8)).toBeGreaterThanOrEqual(0);
  });
});
```

Extend the import at the top of the file:

```ts
import {
  ringsOf, sharedVertices, crossingBetween, pointInRings, reach,
} from "../src/borders";
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/borders.test.ts -t reach`
Expected: FAIL, "reach is not a function" (or a TS error that it is not
exported).

- [ ] **Step 3: Implement `reach` and `ARROW_DEPTHS`**

Add to `src/borders.ts`, after `pointInRings`:

```ts
/** How deep an arrow may go into a land, and how far past a coast it reaches
 *  across water. Here rather than in `src/arrow-scene.ts` because the depth of
 *  an arrow is a question about the GROUND, and the ground is measured on this
 *  side: a station is built with these numbers as its ceiling, and the scene is
 *  handed the answer rather than the polygons. */
export const ARROW_DEPTHS = {
  head: 34,
  tail: 30,
  seaClearance: 16,
  /** Shortest an arrow's half may be drawn. Below this it stops reading as an
   *  arrow, so the ground gets overrun instead - the trade `LAYOUT.blockMin`
   *  already makes for width. */
  min: 12,
  /** How far short of the far edge a tip stops, so it stands ON the land
   *  rather than exactly on its outline. */
  inset: 2,
};

/** Nudge off the start point before casting. A station sits exactly on a
 *  border vertex, which is on the outline of both lands, and a ray cast from
 *  exactly there is a coin toss on which side it starts. */
const RAY_EPS = 0.01;

/** How far from `from` along `dir` an arrow may go and still END on this land,
 *  capped at `want` and backed off by `inset`. `-1` where the ray meets the
 *  land nowhere inside `want`.
 *
 *  `dir` must be a unit vector: the returned number is a distance in the map's
 *  own user units, which is what the caller places an arrow with.
 *
 *  Exact edge intersections rather than a sampled walk, because the shapes this
 *  exists to detect are slivers and a walk in whole units steps straight over
 *  them - the same argument that makes `sharedVertices` a set intersection
 *  rather than a proximity search.
 *
 *  Whether the ray STARTS on the land is asked of `pointInRings` and not of the
 *  parity of the hits: the hits say where inside-ness CHANGES, and two
 *  point-in-polygon rules disagreeing about the same map is how a measurement
 *  and the test that checks it end up contradicting each other.
 *
 *  `-1` is a real answer rather than an error. It is what lets the layout see
 *  that a place on the border cannot be crossed and step around it, instead of
 *  guessing a length there. */
export function reach(
  from: Pt, dir: Pt, rings: Pt[][], want: number, inset: number,
): number {
  const start = { x: from.x + dir.x * RAY_EPS, y: from.y + dir.y * RAY_EPS };
  const hits: number[] = [];
  for (const ring of rings) {
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i];
      const b = ring[(i + 1) % ring.length];
      const ex = b.x - a.x;
      const ey = b.y - a.y;
      const den = dir.x * ey - dir.y * ex;
      if (den === 0) continue;
      const t = ((a.x - start.x) * ey - (a.y - start.y) * ex) / den;
      const u = ((a.x - start.x) * dir.y - (a.y - start.y) * dir.x) / den;
      // `u < 1` and not `<= 1`: a vertex belongs to exactly one of the two
      // edges that meet there, or every corner is counted twice and the
      // inside-outside walk below flips itself back.
      if (t <= 0 || t > want || u < 0 || u >= 1) continue;
      hits.push(t);
    }
  }
  hits.sort((p, q) => p - q);
  let inside = pointInRings(start, rings);
  let end = -1;
  for (const t of hits) {
    if (inside) end = t;
    inside = !inside;
  }
  if (inside) return want;
  if (end < 0) return -1;
  return Math.max(0, Math.min(want, end + RAY_EPS - inset));
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/borders.test.ts`
Expected: PASS, including every test that was already in the file.

- [ ] **Step 5: Commit**

```bash
git add tests/borders.test.ts src/borders.ts
git commit -m "feat(balticmap): a ray can say how much land is ahead of it"
```

---

### Task 2: A border carries a table of measured stations

**Files:**
- Modify: `src/borders.ts` (`Crossing`, `borderCrossing`, `singleVertexCrossing`, `straitCrossing`)
- Test: `tests/borders.test.ts`

**Interfaces:**
- Consumes: `reach`, `ARROW_DEPTHS` (Task 1)
- Produces:
  - `export interface Station { at: Pt; s: number; into: number; out: number }`
  - `Crossing` gains `stations: Station[]`
  - `Crossing.at` is now the roomiest station's point

- [ ] **Step 1: Write the failing tests**

Add to `tests/borders.test.ts`, inside the existing `crossingBetween` describe
block:

```ts
  it("measures a station on the border, into both lands", () => {
    const c = crossingBetween(LEFT, RIGHT);
    expect(c.stations.length).toBeGreaterThan(0);
    for (const st of c.stations) {
      expect(st.at.x).toBeCloseTo(10, 6);
      // 10 units of land each way, less the inset.
      expect(st.into).toBeCloseTo(8, 3);
      expect(st.out).toBeCloseTo(8, 3);
    }
  });

  it("puts the crossing on the roomiest station", () => {
    // A thin spur on RIGHT's side at the top of the border: the vertex at
    // y=20 has almost nothing behind it, the one at y=0 has the whole square.
    const spur = [[
      { x: 10, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 19 },
      { x: 11, y: 19 }, { x: 11, y: 20 }, { x: 10, y: 20 },
    ]];
    const c = crossingBetween(LEFT, spur);
    expect(c.at.y).toBeLessThan(19);
  });

  it("keeps every station's projection ordered along the tangent", () => {
    const c = crossingBetween(LEFT, RIGHT);
    const ss = c.stations.map((st) => st.s);
    expect([...ss].sort((a, b) => a - b)).toEqual(ss);
  });

  it("gives a strait one station spanning the water", () => {
    const far = [[
      { x: 40, y: 0 }, { x: 50, y: 0 }, { x: 50, y: 20 }, { x: 40, y: 20 },
    ]];
    const c = crossingBetween(LEFT, far);
    expect(c.stations).toHaveLength(1);
    expect(c.stations[0].into).toBeCloseTo(30 / 2 + ARROW_DEPTHS.seaClearance, 6);
    expect(c.stations[0].out).toBeCloseTo(30 / 2 + ARROW_DEPTHS.seaClearance, 6);
  });
```

And a new describe block at the end of the file, beside the existing
`every adjacency on every map`:

```ts
describe("stations on every adjacency of every map", () => {
  for (const region of Object.values(REGIONS)) {
    const rings = new Map(region.map.regions.map((r) => [r.id, ringsOf(r.path)]));

    it(`${region.id}: every station's own measurement agrees with the map`, () => {
      for (const r of region.map.regions) {
        for (const adjId of r.adjacent) {
          const a = rings.get(r.id);
          const b = rings.get(adjId);
          if (a === undefined || b === undefined) continue;
          const c = crossingBetween(a, b);
          const where = `${r.id} -> ${adjId}`;
          expect(c.stations.length, where).toBeGreaterThan(0);
          expect(c.stations.length, where).toBeLessThanOrEqual(32);
          if (c.sea) continue;
          for (const st of c.stations) {
            // A measured depth is a depth at which the map agrees the point is
            // on that land. This is the measurement checked by the predicate
            // the rest of the file uses, which is what stops `reach` and the
            // lane test in Task 4 drifting apart.
            if (st.into > 0) {
              expect(pointInRings({
                x: st.at.x + c.normal.x * st.into,
                y: st.at.y + c.normal.y * st.into,
              }, b), `${where} into=${st.into}`).toBe(true);
            }
            if (st.out > 0) {
              expect(pointInRings({
                x: st.at.x - c.normal.x * st.out,
                y: st.at.y - c.normal.y * st.out,
              }, a), `${where} out=${st.out}`).toBe(true);
            }
          }
        }
      }
    });
  }
});
```

Extend the import to include `ARROW_DEPTHS`.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/borders.test.ts`
Expected: FAIL, `c.stations` is undefined.

- [ ] **Step 3: Implement stations**

In `src/borders.ts`, add to the `Crossing` interface, after `at`:

```ts
  /** Places along this border an arrow can stand, measured once when the
   *  crossing is built. The scene picks one per lane and never sees a polygon.
   *
   *  Sampled rather than exhaustive: a border can share 183 vertices and each
   *  measurement walks a couple of thousand edges twice, which would be paid on
   *  the first paint of every border on the map. */
  stations: Station[];
```

Above `Crossing`, add:

```ts
/** One place on a border, with what an arrow standing there has room for. */
export interface Station {
  /** A real shared vertex, never a computed point. */
  at: Pt;
  /** Its projection on the tangent, which is what a lane's offset is measured
   *  in. */
  s: number;
  /** `reach` along the normal, into the second land. `-1` for a place the
   *  second land cannot be reached from at all. */
  into: number;
  /** `reach` against the normal, into the first land. */
  out: number;
}

/** How many stations one border is measured at. */
const MAX_STATIONS = 32;
```

Add these helpers below `crossingBetween`:

```ts
function projectOn(p: Pt, tangent: Pt): number {
  return p.x * tangent.x + p.y * tangent.y;
}

/** Every place this border can be crossed, in order along the tangent. */
function stationsAlong(
  shared: Pt[], tangent: Pt, normal: Pt, a: Pt[][], b: Pt[][],
): Station[] {
  const back = { x: -normal.x, y: -normal.y };
  const sorted = [...shared].sort(
    (p, q) => projectOn(p, tangent) - projectOn(q, tangent),
  );
  const step = Math.max(1, Math.ceil(sorted.length / MAX_STATIONS));
  const list: Station[] = [];
  for (let i = 0; i < sorted.length; i += step) {
    const at = sorted[i];
    list.push({
      at,
      s: projectOn(at, tangent),
      into: reach(at, normal, b, ARROW_DEPTHS.head, ARROW_DEPTHS.inset),
      out: reach(at, back, a, ARROW_DEPTHS.tail, ARROW_DEPTHS.inset),
    });
  }
  return list;
}

/** What a station is worth to an arrow: the smaller of its two rooms, with
 *  "nowhere" scoring nothing rather than less than nothing. */
function stationRoom(st: Station): number {
  return Math.min(Math.max(st.into, 0), Math.max(st.out, 0));
}

/** The station an arrow standing alone should take: the roomiest, and the one
 *  nearest the middle of the frontier where several are equally roomy. */
function roomiest(list: Station[], centre: number): Station {
  let best = list[0];
  for (const st of list) {
    const gain = stationRoom(st) - stationRoom(best);
    if (gain > 1e-9) best = st;
    else if (gain > -1e-9 && Math.abs(st.s - centre) < Math.abs(best.s - centre)) {
      best = st;
    }
  }
  return best;
}
```

In `borderCrossing`, keep everything up to and including the `sign` vote
unchanged - the vote still probes from the centroid-nearest vertex, so the
orientation behaviour the all-pairs test already pins does not move. Replace
only the returned object:

```ts
  const normal = { x: nx * sign, y: ny * sign };
  const stations = stationsAlong(shared, tangent, normal, a, b);
  return {
    // The roomiest station, not the vertex nearest the centroid: the centroid
    // is a statement about where the middle of the frontier is and says
    // nothing about what is behind it, and on a quarter of this map's
    // frontiers what is behind it is a pinch with no land either way.
    at: roomiest(stations, projectOn({ x: cx, y: cy }, tangent)).at,
    stations,
    tangent,
    normal,
    span: hi - lo,
    sea: false,
    gap: 0,
  };
```

In `singleVertexCrossing`, return one measured station:

```ts
  const tangent = { x: -normal.y, y: normal.x };
  return {
    at,
    stations: [{
      at,
      s: projectOn(at, tangent),
      into: reach(at, normal, b, ARROW_DEPTHS.head, ARROW_DEPTHS.inset),
      out: reach(at, { x: -normal.x, y: -normal.y }, a,
        ARROW_DEPTHS.tail, ARROW_DEPTHS.inset),
    }],
    tangent,
    normal,
    span: 0,
    sea: false,
    gap: 0,
  };
```

In `straitCrossing`, one station spanning the water. There is no border to
measure, so the reach is the constant the arrow has always used:

```ts
  const at = { x: (pa.x + pb.x) / 2, y: (pa.y + pb.y) / 2 };
  const across = (gap || 1) / 2 + ARROW_DEPTHS.seaClearance;
  const tangent = { x: -normal.y, y: normal.x };
  return {
    at,
    stations: [{ at, s: projectOn(at, tangent), into: across, out: across }],
    tangent,
    normal,
    span: SEA_SPAN,
    sea: true,
    gap: gap || 1,
  };
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/borders.test.ts`
Expected: PASS. If `puts the crossing on the roomiest station` fails, check
that `roomiest` is scoring `min(into, out)` and not `into` alone.

- [ ] **Step 5: Run the whole suite and the type check**

Run: `npm test && npx tsc --noEmit`
Expected: `tests/arrow-scene.test.ts` FAILS to compile - its two hand-built
`Crossing` literals have no `stations`. That is the next task; do not fix it
here beyond adding `stations: []` to those two literals so the suite compiles.

- [ ] **Step 6: Commit**

```bash
git add tests/borders.test.ts tests/arrow-scene.test.ts src/borders.ts
git commit -m "feat(balticmap): a border knows where it can be crossed"
```

---

### Task 3: A lane stands on a station

**Files:**
- Modify: `src/arrow-scene.ts` (`LAYOUT`, `layoutLanes`)
- Test: `tests/arrow-scene.test.ts`

**Interfaces:**
- Consumes: `Crossing.stations`, `Station`, `ARROW_DEPTHS` (Task 2)
- Produces: `layoutLanes` keeps its signature `(cross, items, unit) => Lane[]`.
  `LAYOUT` loses `tailDepth`, `headDepth` and `seaClearance`; they live in
  `ARROW_DEPTHS` now.

- [ ] **Step 1: Write the failing tests**

In `tests/arrow-scene.test.ts`, replace the `FLAT` fixture and add a station
helper at the top of the file:

```ts
/** A station table for a straight border, one station every `gap` units of
 *  tangent, all with the same room. */
const stationsFor = (
  into: number, out: number, count = 9, gap = 12,
): Station[] =>
  Array.from({ length: count }, (_, i) => {
    const s = (i - (count - 1) / 2) * gap;
    return { at: { x: 0, y: s }, s, into, out };
  });

/** A border running up the y axis at x=0, with "across" pointing at +x. */
const FLAT: Crossing = {
  at: { x: 0, y: 0 },
  tangent: { x: 0, y: 1 },
  normal: { x: 1, y: 0 },
  span: 200,
  sea: false,
  gap: 0,
  stations: stationsFor(ARROW_DEPTHS.head, ARROW_DEPTHS.tail),
};
```

Update the two existing `layoutLanes` expectations that name the old constants,
and add the new behaviour:

```ts
  it("starts inside the origin and ends inside the target", () => {
    const [lane] = layoutLanes(
      FLAT, [{ strength: 1, forward: true }], aloneOn(FLAT, [1]),
    );
    expect(lane.ax).toBeCloseTo(-ARROW_DEPTHS.tail, 6);
    expect(lane.bx).toBeCloseTo(ARROW_DEPTHS.head, 6);
  });

  it("reaches only as far as its station has room", () => {
    const shallow: Crossing = { ...FLAT, stations: stationsFor(20, ARROW_DEPTHS.tail) };
    const [lane] = layoutLanes(
      shallow, [{ strength: 1, forward: true }], aloneOn(shallow, [1]),
    );
    expect(lane.bx).toBeCloseTo(20, 6);
    expect(lane.ax).toBeCloseTo(-ARROW_DEPTHS.tail, 6);
  });

  it("reads a backward lane's room the other way round", () => {
    // `into` is room in the second land, so a lane running back into the FIRST
    // land is bounded by `out` at its head.
    const lopsided: Crossing = { ...FLAT, stations: stationsFor(30, 15) };
    const [lane] = layoutLanes(
      lopsided, [{ strength: 1, forward: false }], aloneOn(lopsided, [1]),
    );
    expect(lane.ax - lane.bx).toBeCloseTo(15 + 30, 6);
    expect(lane.bx).toBeCloseTo(-15, 6);
  });

  it("floors a station too shallow to draw on", () => {
    const pinch: Crossing = { ...FLAT, stations: stationsFor(3, 4) };
    const [lane] = layoutLanes(
      pinch, [{ strength: 1, forward: true }], aloneOn(pinch, [1]),
    );
    expect(lane.bx).toBeCloseTo(ARROW_DEPTHS.min, 6);
    expect(lane.ax).toBeCloseTo(-ARROW_DEPTHS.min, 6);
  });

  it("gives each lane of a block its own station", () => {
    const lanes = layoutLanes(FLAT, [
      { strength: 1, forward: true }, { strength: 1, forward: true },
      { strength: 1, forward: true },
    ], aloneOn(FLAT, [1, 1, 1]));
    const seen = lanes.map((l) => l.ay);
    expect(new Set(seen).size).toBe(3);
    // In order along the border, which is declaration order.
    expect([...seen].sort((a, b) => a - b)).toEqual(seen);
  });

  it("skips a station that cannot be crossed", () => {
    const holed: Crossing = {
      ...FLAT,
      stations: [
        { at: { x: 0, y: -12 }, s: -12, into: -1, out: -1 },
        { at: { x: 0, y: 0 }, s: 0, into: ARROW_DEPTHS.head, out: ARROW_DEPTHS.tail },
        { at: { x: 0, y: 12 }, s: 12, into: ARROW_DEPTHS.head, out: ARROW_DEPTHS.tail },
      ],
    };
    const lanes = layoutLanes(holed, [
      { strength: 1, forward: true }, { strength: 1, forward: true },
    ], aloneOn(holed, [1, 1]));
    expect(lanes.map((l) => l.ay)).toEqual([0, 12]);
  });

  it("falls back to the tangent where a crossing has no stations", () => {
    const bare: Crossing = { ...FLAT, stations: [] };
    const [lane] = layoutLanes(
      bare, [{ strength: 1, forward: true }], aloneOn(bare, [1]),
    );
    expect(lane.ax).toBeCloseTo(-ARROW_DEPTHS.tail, 6);
    expect(lane.bx).toBeCloseTo(ARROW_DEPTHS.head, 6);
  });
```

The sea test keeps its meaning but reads the station:

```ts
  it("spans the water on a sea crossing instead of standing in it", () => {
    const across = 100 / 2 + ARROW_DEPTHS.seaClearance;
    const strait: Crossing = {
      ...FLAT, sea: true, gap: 100,
      stations: [{ at: { x: 0, y: 0 }, s: 0, into: across, out: across }],
    };
    const [lane] = layoutLanes(
      strait, [{ strength: 1, forward: true }], aloneOn(strait, [1]),
    );
    expect(lane.bx - lane.ax).toBeCloseTo(100 + ARROW_DEPTHS.seaClearance * 2, 6);
  });
```

Update the imports:

```ts
import { ARROW_DEPTHS, type Crossing, type Station } from "../src/borders";
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/arrow-scene.test.ts`
Expected: FAIL on `reaches only as far as its station has room` (the lane is
drawn at the old fixed depth) and on the station-per-lane tests.

- [ ] **Step 3: Implement station-based layout**

In `src/arrow-scene.ts`, delete `tailDepth`, `headDepth` and `seaClearance`
from `LAYOUT` (the width dials stay), and import the depths:

```ts
import { ARROW_DEPTHS, type Crossing, type Pt, type Station } from "./borders";
```

Replace `layoutLanes` with:

```ts
/** The station a lane at this offset should stand on: the nearest one it can
 *  actually cross, taken at most once and in order, so the lanes keep their
 *  declaration order along the border and no two arrows stack.
 *
 *  `null` where the border has nothing left to offer, which is the caller's
 *  cue to fall back to the tangent. */
function stationAt(
  cross: Crossing, offset: number, after: number,
): { station: Station; index: number } | null {
  const base = cross.at.x * cross.tangent.x + cross.at.y * cross.tangent.y;
  const want = base + offset;
  let best: { station: Station; index: number } | null = null;
  let bestGap = Number.POSITIVE_INFINITY;
  for (let i = after + 1; i < cross.stations.length; i++) {
    const station = cross.stations[i];
    // Both ways, because an arrow has two ends and the one that is short is
    // not always the one aimed at the target.
    if (station.into < ARROW_DEPTHS.min || station.out < ARROW_DEPTHS.min) continue;
    const gap = Math.abs(station.s - want);
    if (gap < bestGap) {
      bestGap = gap;
      best = { station, index: i };
    }
  }
  return best;
}

/** Every arrow crossing one border, side by side along it, at the render's
 *  own scale (`unitWidthFor`).
 *
 *  The block is the SUM of what its arrows are owed rather than a size the
 *  border hands down: the ground decides where the block is centred and, at
 *  one remove through the scale, how wide it may grow - but an arrow's width
 *  is its strength and is the same on every border of the map.
 *
 *  Direction does not sort them: an answering raid stands beside the attack it
 *  answers, in the order the two were declared.
 *
 *  **A lane stands on a station rather than on a straight line.** The tangent
 *  is a global fit and the border bends under it, so a lane offset along that
 *  line is routinely not on the border at all - it is inside one of the two
 *  lands, and no length of arrow drawn from there crosses anything. On a
 *  straight border every station lies on the tangent anyway and nothing moves;
 *  on a bent one the block follows the frontier, which is what an arrow
 *  crossing that frontier should be doing. */
export function layoutLanes(
  cross: Crossing,
  items: readonly { strength: number; forward: boolean }[],
  unit: number,
): Lane[] {
  const widths = items.map((i) => laneWidthFor(i.strength, unit));
  const total = widths.reduce((s, w) => s + w, 0);
  const out: Lane[] = [];
  let cursor = -total / 2;
  let taken = -1;
  for (let i = 0; i < items.length; i++) {
    const width = widths[i];
    const offset = cursor + width / 2;
    cursor += width;
    const found = stationAt(cross, offset, taken);
    if (found !== null) taken = found.index;
    const centre = found?.station.at ?? {
      x: cross.at.x + cross.tangent.x * offset,
      y: cross.at.y + cross.tangent.y * offset,
    };
    const forward = items[i].forward;
    // A station's `into` is room in the SECOND land whichever way the arrow
    // runs, so a backward lane reads the two the other way round.
    const ahead = found === null
      ? ARROW_DEPTHS.head
      : forward ? found.station.into : found.station.out;
    const behind = found === null
      ? ARROW_DEPTHS.tail
      : forward ? found.station.out : found.station.into;
    const head = Math.max(ahead, ARROW_DEPTHS.min);
    const tail = Math.max(behind, ARROW_DEPTHS.min);
    const dir = forward ? 1 : -1;
    const nx = cross.normal.x * dir;
    const ny = cross.normal.y * dir;
    out.push({
      index: i, width,
      ax: centre.x - nx * tail, ay: centre.y - ny * tail,
      bx: centre.x + nx * head, by: centre.y + ny * head,
    });
  }
  return out;
}
```

Then fix every other reference to the moved constants. Search for them:

```bash
grep -rn "LAYOUT.tailDepth\|LAYOUT.headDepth\|LAYOUT.seaClearance" src tests
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/arrow-scene.test.ts && npx tsc --noEmit`
Expected: PASS, clean type check.

- [ ] **Step 5: Run the whole suite**

Run: `npm test`
Expected: PASS. `tests/render.test.ts` and `tests/arrow-focus.test.ts` exercise
the real scene through `src/main.ts`; if either fails, the cause is a crossing
built somewhere without stations, not a changed expectation.

- [ ] **Step 6: Commit**

```bash
git add src/arrow-scene.ts tests/arrow-scene.test.ts
git commit -m "feat(balticmap): an arrow stands where the border can be crossed"
```

---

### Task 4: The invariant, over every adjacency of both maps

**Files:**
- Test: `tests/borders.test.ts` (new describe block)

**Interfaces:**
- Consumes: `crossingBetween`, `layoutLanes`, `unitWidthFor`, `pointInRings`
- Produces: nothing; this is the gate for part one.

- [ ] **Step 1: Write the test**

Append to `tests/borders.test.ts`:

```ts
/** Ordered pairs where a lane at the edge of its block still reaches over a
 *  third land. Three frontiers, bent enough that the block runs past where the
 *  two lands actually meet. Named rather than counted: a fourth is a new
 *  defect and has to be looked at. */
const KNOWN_STRAY = new Set([
  "dainava|galinda", "galinda|dainava",
  "leon|upper-march", "upper-march|leon",
  "sobrarbe|upper-march", "upper-march|sobrarbe",
]);

describe("no arrow ends on a land it is not about", () => {
  for (const region of Object.values(REGIONS)) {
    const rings = new Map(region.map.regions.map((r) => [r.id, ringsOf(r.path)]));

    it(`${region.id}: every lane of a 1, 2 and 3 arrow block`, () => {
      const stray: string[] = [];
      for (const r of region.map.regions) {
        for (const adjId of r.adjacent) {
          const a = rings.get(r.id);
          const b = rings.get(adjId);
          if (a === undefined || b === undefined) continue;
          const cross = crossingBetween(a, b);
          if (cross.sea) continue;
          for (const count of [1, 2, 3]) {
            const items = Array.from({ length: count }, () => ({
              strength: 1, forward: true,
            }));
            const unit = unitWidthFor([{ span: cross.span, strengths: items.map(() => 1) }]);
            for (const lane of layoutLanes(cross, items, unit)) {
              const tip = { x: lane.bx, y: lane.by };
              const base = { x: lane.ax, y: lane.ay };
              for (const other of region.map.regions) {
                if (other.id === r.id || other.id === adjId) continue;
                const o = rings.get(other.id);
                if (o === undefined) continue;
                if (pointInRings(tip, o) || pointInRings(base, o)) {
                  stray.push(`${r.id}|${adjId} n=${count} lane=${lane.index} on ${other.id}`);
                }
              }
            }
          }
        }
      }
      const unexpected = stray.filter(
        (s) => !KNOWN_STRAY.has(s.slice(0, s.indexOf(" "))),
      );
      expect(unexpected, unexpected.join("\n")).toEqual([]);
    });
  }
});
```

Extend the import with `layoutLanes` and `unitWidthFor` from
`../src/arrow-scene`.

- [ ] **Step 2: Run it**

Run: `npx vitest run tests/borders.test.ts -t "no arrow ends"`
Expected: PASS. If it fails with more than the known strays, the station
selection in Task 3 is picking a station that cannot be crossed - check that
`stationAt` filters on BOTH `into` and `out`.

- [ ] **Step 3: Sanity-check the test can fail**

Temporarily change `KNOWN_STRAY` to an empty set and re-run. Expected: FAIL,
listing the 8 known lanes with the land each ends on. Put `KNOWN_STRAY` back.

- [ ] **Step 4: Commit**

```bash
git add tests/borders.test.ts
git commit -m "test(balticmap): no arrow ends on a land it is not about"
```

---

### Task 5: See part one in a browser

**Files:** none. This is the browser pass the repo rule asks for.

- [ ] **Step 1: Start this prototype's own dev server**

```bash
npm run dev
```

- [ ] **Step 2: Open the reported case**

`http://127.0.0.1:5173/prototypes/02/?seed=7&faction=selonians&build=warpath&march=lower-daugava-livs%3Ejersikans;talavians%3Ejersikans;ugandians%3Etalavians`

Check, at the default zoom and zoomed in:

- the Livs arrow's head and both barbs stand on Jersika, not on Selija;
- the arrows into Jersika stand side by side and do not overlap;
- no arrow is a stub, and none crosses a land it is not about.

- [ ] **Step 3: Open a border carrying three arrows**

`http://127.0.0.1:5173/prototypes/02/?seed=3&faction=selonians&build=warpath&march=jersikans%3Eselonians;semigallian-confederacy%3Eselonians;eastern-aukstaitian-confederacy%3Eselonians`

Check the block follows the frontier rather than standing on one straight line
through it, and that all three arrows are still in declaration order.

- [ ] **Step 4: Stop the server**

Say in the handoff what you saw and what would have looked wrong.

---

### Task 6: A rival's arrow is drawn in ink

**Files:**
- Modify: `src/map-render.ts` (add after `brightenColor`)
- Modify: `src/main.ts` (`paintArrows`, the march spec's `fill`)
- Modify: `src/style.css` (`.march-arrow polygon`)
- Test: `tests/map-render.test.ts` (create if absent)

**Interfaces:**
- Consumes: `darkenColor` (already in `src/map-render.ts`), `UNOWNED_FILL`
  (already in `src/main.ts:933`)
- Produces:
  - `export function contrastRatio(a: string, b: string): number`
  - `export function inkFor(hex: string, against: string, target: number): string`

- [ ] **Step 1: Write the failing tests**

Create `tests/map-render.test.ts` (if the file exists, append the describe
blocks):

```ts
import { describe, it, expect } from "vitest";
import { contrastRatio, inkFor, darkenColor } from "../src/map-render";
import { REGIONS } from "../src/regions";

/** What a land nobody plays is painted, which is what an arrow crossing the
 *  map stands on. Mirrors `UNOWNED_FILL` in src/main.ts. */
const LAND = "#c3bfb6";

describe("contrastRatio", () => {
  it("is 21 for black on white and 1 for a colour on itself", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 2);
    expect(contrastRatio("#c3bfb6", "#c3bfb6")).toBeCloseTo(1, 6);
  });

  it("does not care which way round the two are given", () => {
    expect(contrastRatio("#a8c8cf", LAND)).toBeCloseTo(contrastRatio(LAND, "#a8c8cf"), 9);
  });

  it("reads a pale faction colour against the land as almost nothing", () => {
    // The reported case: an arrow the player cannot see.
    expect(contrastRatio("#a8c8cf", LAND)).toBeLessThan(1.1);
  });
});

describe("inkFor", () => {
  it("darkens a pale colour until it reads against the land", () => {
    expect(contrastRatio(inkFor("#a8c8cf", LAND, 3), LAND)).toBeGreaterThanOrEqual(3);
  });

  it("leaves a colour that already reads nearly alone", () => {
    const ink = inkFor("#5f7aa3", LAND, 3);
    expect(contrastRatio(ink, LAND)).toBeGreaterThanOrEqual(3);
    // A dark colour barely moves: it was already most of the way there.
    expect(contrastRatio(ink, "#5f7aa3")).toBeLessThan(1.6);
  });

  it("keeps the hue family", () => {
    // A green stays greener than it is red or blue.
    const ink = inkFor("#8fb06d", LAND, 3);
    const g = parseInt(ink.slice(3, 5), 16);
    expect(g).toBeGreaterThan(parseInt(ink.slice(1, 3), 16));
    expect(g).toBeGreaterThan(parseInt(ink.slice(5, 7), 16));
  });

  it("is stable: asking twice gives the same ink", () => {
    expect(inkFor("#e2eecd", LAND, 3)).toBe(inkFor("#e2eecd", LAND, 3));
  });

  it("reaches the target for every faction colour on every map", () => {
    for (const region of Object.values(REGIONS)) {
      for (const f of region.map.factions) {
        const ink = inkFor(f.color, LAND, 3);
        expect(
          contrastRatio(ink, LAND),
          `${region.id}/${f.id} ${f.color} -> ${ink}`,
        ).toBeGreaterThanOrEqual(3);
      }
    }
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run tests/map-render.test.ts`
Expected: FAIL, `contrastRatio` is not exported.

- [ ] **Step 3: Implement the colour helpers**

In `src/map-render.ts`, after `brightenColor`:

```ts
/** WCAG relative luminance of a "#rrggbb". */
function luminance(hex: string): number {
  const channel = (start: number): number => {
    const v = parseInt(hex.slice(start, start + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
}

/** How far apart two colours are to the eye, 1 (identical) to 21. */
export function contrastRatio(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** A faction colour turned into a mark that can be seen ON the map: darkened
 *  until it reaches `target` against the colour behind it.
 *
 *  A faction's colour is what its LAND is painted, drawn from the same pale
 *  palette as every other land, so used raw as a mark it contrasts with the
 *  map by about 1.05 to 1. Darkening by a fixed factor answers for one palette
 *  and not for the next map's; darkening to a target answers for both, and an
 *  already-dark colour barely moves.
 *
 *  Steps of one percent so the answer is the same every time it is asked -
 *  this is read on every repaint and an unstable ink would be a flicker. */
export function inkFor(hex: string, against: string, target: number): string {
  for (let percent = 100; percent > 2; percent--) {
    const ink = darkenColor(hex, percent / 100);
    if (contrastRatio(ink, against) >= target) return ink;
  }
  return "#000000";
}
```

- [ ] **Step 4: Run to verify they pass**

Run: `npx vitest run tests/map-render.test.ts`
Expected: PASS, all six.

- [ ] **Step 5: Use the ink for rival arrows**

In `src/main.ts`, import `inkFor` alongside `darkenColor` and add, next to
`UNOWNED_FILL`:

```ts
/** How far a rival's arrow must stand out from the land it crosses. 3 is the
 *  ordinary floor for a mark this size, and every faction colour on both maps
 *  reaches it. */
const ARROW_INK_CONTRAST = 3;

/** Read on every repaint, and the search inside `inkFor` walks up to a hundred
 *  steps, so the answer is kept. */
const arrowInk = new Map<string, string>();

function arrowInkFor(factionId: string): string {
  const held = arrowInk.get(factionId);
  if (held !== undefined) return held;
  const ink = inkFor(
    factionById.get(factionId)?.color ?? "#7a6a55",
    UNOWNED_FILL,
    ARROW_INK_CONTRAST,
  );
  arrowInk.set(factionId, ink);
  return ink;
}
```

In the march spec inside `paintArrows`, replace the `fill` expression:

```ts
      // A quarrel between two rivals is drawn in the attacker's own colour, so
      // whose army it is can be read off the map without hovering it - as INK
      // rather than as the colour their land is painted. The palette a map's
      // lands are drawn from is pale by design, and a mark in it reads against
      // the map at about 1.05 to 1, which is not a mark.
      fill: against || ours ? undefined : arrowInkFor(m.actor),
```

- [ ] **Step 6: Make the casing survive the map's own zoom**

In `src/style.css`, in `.march-arrow polygon`:

```css
.march-arrow polygon {
  stroke: #fdfaf4;
  stroke-width: 1.6px;
  /* Screen pixels, not map units. The default view is a 2508-unit viewBox on a
     1440px element, so a 1.2-unit casing is a 0.69px line: it delineates the
     arrow when the player has zoomed in and disappears at the zoom the game is
     played at. The ink handles pale ground and the casing handles dark ground,
     so one of the two contrasts with anything an arrow can stand on.

     This does not reopen the argument in src/arrows.ts for a filled polygon
     over a stroked line with a marker-end: the SHAPE is still a polygon at
     every zoom, and only its outline stops being drawn in map units. */
  vector-effect: non-scaling-stroke;
  stroke-linejoin: round;
}
```

Check the two rules that override the casing width - `.march-counterable
polygon` at 2.4 and its `:hover` at 3.4 - and give them `px` units so they read
as screen pixels too. `.clash-flash polygon` carries the same 1.2 casing and
gets the same treatment: a ghost is the one arrow a beat is about, and it is
read at whatever zoom the player was already at.

- [ ] **Step 7: Run the suite and the type check**

Run: `npm test && npx tsc --noEmit && npm run lint`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/map-render.ts src/main.ts src/style.css tests/map-render.test.ts
git commit -m "feat(balticmap): a rival's arrow is drawn in ink, not in its land's own tint"
```

---

### Task 7: One opacity per arrow, decided in one place

**Files:**
- Modify: `src/arrow-scene.ts` (`ArrowSpec`, `dressArrow`, new `emphasisFor`)
- Modify: `src/main.ts` (`paintArrows`, the cue pass at the end of the spec build)
- Modify: `src/style.css` (four opacity rules in, five out)
- Test: `tests/arrow-scene.test.ts`

**Interfaces:**
- Consumes: `ArrowSpec` (Task 3 leaves it unchanged)
- Produces:
  - `export type ArrowEmphasis = "full" | "back" | "dimmed" | "faded"`
  - `export const ARROW_EMPHASIS: Record<ArrowEmphasis, { className: string; why: string }>`
  - `export interface ArrowCues { live: boolean; anyFocus: boolean; onFocus: boolean; pinnedOut: boolean; aiming: boolean; atAimTarget: boolean }`
  - `export function emphasisFor(cues: ArrowCues): ArrowEmphasis`
  - `ArrowSpec.faded` and `ArrowSpec.dimmed` are REPLACED by `ArrowSpec.emphasis?: ArrowEmphasis`

- [ ] **Step 1: Write the failing tests**

In `tests/arrow-scene.test.ts`:

```ts
describe("emphasisFor", () => {
  const cues = (over: Partial<ArrowCues> = {}): ArrowCues => ({
    live: false, anyFocus: false, onFocus: false,
    pinnedOut: false, aiming: false, atAimTarget: false, ...over,
  });

  it("leaves an arrow nothing is being asked about at full", () => {
    expect(emphasisFor(cues())).toBe("full");
  });

  it("fades every arrow but the one under the pointer", () => {
    expect(emphasisFor(cues({ anyFocus: true }))).toBe("faded");
    expect(emphasisFor(cues({ anyFocus: true, onFocus: true }))).toBe("full");
  });

  it("dims what a pin is not about", () => {
    expect(emphasisFor(cues({ pinnedOut: true }))).toBe("dimmed");
  });

  it("puts an aim ahead of nothing and a pin ahead of an aim", () => {
    // Starting an aim must not un-dim what the pin put away.
    expect(emphasisFor(cues({ pinnedOut: true, aiming: true }))).toBe("dimmed");
    expect(emphasisFor(cues({ aiming: true }))).toBe("back");
  });

  it("keeps an arrow landing where the player is aiming at full", () => {
    expect(emphasisFor(cues({ aiming: true, atAimTarget: true }))).toBe("full");
  });

  it("never quietens the arrow a beat is about, or the aim itself", () => {
    expect(emphasisFor(cues({ live: true, anyFocus: true }))).toBe("full");
    expect(emphasisFor(cues({ live: true, pinnedOut: true, aiming: true }))).toBe("full");
  });

  it("names a class for every emphasis and no two the same", () => {
    const names = Object.values(ARROW_EMPHASIS).map((e) => e.className);
    expect(new Set(names).size).toBe(names.length);
    for (const e of Object.values(ARROW_EMPHASIS)) {
      expect(e.why.length).toBeGreaterThan(20);
    }
  });
});
```

And, in the existing `renderArrowScene` describe block, one test that the class
reaches the element:

```ts
  it("writes the emphasis onto the arrow", () => {
    const host = document.createElementNS(NS, "g") as SVGGElement;
    const drawn = renderArrowScene(host, [
      { ...march("m1", "a", "b", 1), emphasis: "dimmed" },
    ], ctx);
    expect(drawn.get("m1")?.getAttribute("class"))
      .toContain(ARROW_EMPHASIS.dimmed.className);
  });
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run tests/arrow-scene.test.ts -t emphasis`
Expected: FAIL, `emphasisFor` is not exported.

- [ ] **Step 3: Implement the emphasis scale**

In `src/arrow-scene.ts`, beside `ARROW_KINDS`:

```ts
/** How loud an arrow is drawn. Exactly one applies, chosen in `emphasisFor`.
 *
 *  A scale and not a set of flags, because opacity is one property: it was
 *  four CSS rules on the same element resolved by specificity, which had
 *  already produced a "faded" rival arrow drawn BRIGHTER than an unfaded one,
 *  and starting an aim raised every pin-dimmed arrow back up. What an arrow
 *  looks like is decided here, once, and written as one class. */
export type ArrowEmphasis = "full" | "back" | "dimmed" | "faded";

export const ARROW_EMPHASIS: Record<ArrowEmphasis, {
  className: string;
  why: string;
}> = {
  full: {
    className: "arrow-full",
    why: "Nothing is narrowing the map, or this arrow is the thing being asked about: the one under the pointer, the one landing where the player is aiming, the aim itself, or the landing a beat is explaining.",
  },
  back: {
    className: "arrow-back",
    why: "An aim is live and this arrow is not part of it. Slightly back, because the thing being chosen is the map - but never away, because what is already flying at a land is half of the decision to send an army there.",
  },
  dimmed: {
    className: "arrow-dim",
    why: "A pin has narrowed the map to one realm and this arrow is no business of it. Faint rather than hidden: the board still has to read as a whole while one land is studied.",
  },
  faded: {
    className: "arrow-faded",
    why: "The pointer is resting on another arrow, and that arrow's two lands own the screen for as long as it does.",
  },
};

/** What every surface that can quieten an arrow has to say about it. */
export interface ArrowCues {
  /** A ghost or the aim preview: something happening right now, never
   *  quietened by a question about something else. */
  live: boolean;
  anyFocus: boolean;
  onFocus: boolean;
  pinnedOut: boolean;
  aiming: boolean;
  atAimTarget: boolean;
}

/** The one answer, in one order. A pin beats an aim: the pin is a narrowing the
 *  player asked for and holds, the aim is a question they are in the middle
 *  of. */
export function emphasisFor(cues: ArrowCues): ArrowEmphasis {
  if (cues.live) return "full";
  if (cues.anyFocus) return cues.onFocus ? "full" : "faded";
  if (cues.pinnedOut) return "dimmed";
  if (cues.aiming) return cues.atAimTarget ? "full" : "back";
  return "full";
}
```

In `ArrowSpec`, replace the `faded` / `dimmed` pair:

```ts
  /** How loud this arrow is drawn, decided by `emphasisFor` from what the
   *  hover, the pin and a live aim have to say about it.
   *
   *  Carried HERE rather than written onto the element afterwards, because
   *  `dressArrow` states an arrow's whole class attribute and `enter` fades a
   *  new arrow up to the opacity the stylesheet gives it once it is in the
   *  tree. A cue applied after the paint is a cue the fade was not told about:
   *  the arrow rose to full over 220ms and dropped to the dim in the single
   *  frame the fade ended on. */
  emphasis?: ArrowEmphasis;
```

In `dressArrow`, replace the two `if` lines:

```ts
  const classes = [def.className, `march-${spec.tone}`];
  if (spec.doomed === true) classes.push("claim-doomed");
  classes.push(ARROW_EMPHASIS[spec.emphasis ?? "full"].className);
```

- [ ] **Step 4: Decide the cues in `paintArrows`**

In `src/main.ts`, replace the cue pass (the loop setting `spec.faded` and
`spec.dimmed`):

```ts
  const focus = effectiveArrowFocus();
  for (const spec of specs) {
    const ends = spec.dataset ?? {};
    spec.emphasis = emphasisFor({
      // A ghost stands for the landing its beat is explaining and the preview
      // IS the question being asked, so neither is ever pushed back by a
      // question about something else.
      live: spec.kind === "ghost" || spec.kind === "aim",
      anyFocus: focus !== null,
      onFocus: ends.from === focus?.from && ends.target === focus?.to,
      pinnedOut: arrowDimLand !== null
        && ends.actor !== arrowDimLand && ends.target !== arrowDimLand,
      aiming: targeting,
      atAimTarget: aiming !== null && aiming.over !== null
        && ends.target === aiming.over,
    });
  }
```

Import `emphasisFor` from `./arrow-scene`.

- [ ] **Step 5: Collapse the CSS**

In `src/style.css`:

Delete `.march-arrow.march-other { opacity: 0.45 }` entirely, including its
comment - quiet is a colour now, and the ink is what makes it quiet.

Delete the `opacity: 0.75` from `.march-arrows.aiming .march-arrow,
.march-arrows.aiming .claim-arrow`. Keep `pointer-events: none` and the comment
about clicks belonging to the land.

Delete the two opacity rules under `svg.map.arrow-focused` for
`.arrow-faded` and `:not(.arrow-faded)`, and the comment about specificity that
only existed to explain the race.

Replace `.march-arrow.arrow-dim, .claim-arrow.arrow-dim` with the four rules,
in one block:

```css
/* How loud an arrow is drawn. One class, chosen in `emphasisFor` - see
   ARROW_EMPHASIS in src/arrow-scene.ts for what each one means. Four rules of
   equal weight on the same property, so which one applies is decided in code
   and never by specificity. */
.march-arrow.arrow-full,
.claim-arrow.arrow-full,
.clash-flash.arrow-full {
  opacity: 1;
}

.march-arrow.arrow-back,
.claim-arrow.arrow-back {
  opacity: 0.75;
}

.march-arrow.arrow-dim,
.claim-arrow.arrow-dim {
  opacity: 0.16;
}

.march-arrow.arrow-faded,
.claim-arrow.arrow-faded {
  opacity: 0.12;
  filter: saturate(0);
}
```

- [ ] **Step 6: Run the tests**

Run: `npm test && npx tsc --noEmit && npm run lint`
Expected: PASS. `tests/arrow-focus.test.ts` counts `.arrow-faded` elements and
that class name is unchanged, so it should not move.

- [ ] **Step 7: Commit**

```bash
git add src/arrow-scene.ts src/main.ts src/style.css tests/arrow-scene.test.ts
git commit -m "feat(balticmap): an arrow is as loud as one answer says it is"
```

---

### Task 8: See part two, then write down what changed

**Files:**
- Modify: `02-balticmap/CLAUDE.md` (the arrow section, and the ghost's fill note)

- [ ] **Step 1: Browser pass**

Start `npm run dev` and open:

`http://127.0.0.1:5173/prototypes/02/?seed=7&faction=selonians&build=warpath&march=lower-daugava-livs%3Ejersikans;talavians%3Ejersikans;ugandians%3Etalavians`

At the DEFAULT zoom, not zoomed in, check:

- every rival arrow reads as a mark on the map, and you can tell roughly which
  people each belongs to by its hue;
- your own gold and a hostile red still read as louder than a rival's quarrel;
- hovering one arrow fades the others and un-fades them on the way out;
- clicking a land to pin it dims the arrows that realm is no part of, and
  starting an aim from a card does NOT bring them back;
- while aiming a Raid at a land another faction is already marching on, that
  rival's arrow stays at full while the rest step back.

- [ ] **Step 2: Read the text in the screenshots**

Per the dark-box rule in CLAUDE.md: read the strength labels and the ordinal
chips in what you captured, not just the shapes. A `1 STR` that has gone
invisible against its own arrow is this change's most likely regression.

- [ ] **Step 3: Update CLAUDE.md**

In the arrow section ("An arrow crosses the border, and there is one thing that
draws it"), state the three facts that are now load-bearing:

- a border is a table of measured stations, `Crossing.at` is the roomiest of
  them, and a lane stands on one rather than at an offset along the tangent -
  with the reason (the tangent is a global fit, the border bends under it) and
  the measured 50 lanes against 8;
- an arrow's depth is the room its station has, floored at `ARROW_DEPTHS.min`,
  and the depths live in `src/borders.ts` because they are a question about the
  ground;
- an arrow's loudness is one `emphasis` chosen by `emphasisFor` and written as
  one class, replacing the paragraph about `faded` and `dimmed` being separate
  spec fields. Keep the paragraph about WHY a cue must be on the spec before
  the fade starts - that reasoning is unchanged and is the reason this field
  exists.

In the same section, restate the ghost's fill note: it states its own fill
because a ghost is the one arrow on the map its beat is about, not because it
would otherwise inherit a rival's 0.45.

Add, beside the rich-text rule or under the arrow section, one line for the new
colour rule: a faction colour used as a MARK goes through `inkFor`; used as a
land's fill it stays as authored.

- [ ] **Step 4: Full gate**

Run: `npm test && npm run build && npm run lint`
Expected: all three PASS.

- [ ] **Step 5: Commit**

```bash
git add 02-balticmap/CLAUDE.md
git commit -m "docs(balticmap): a station, a depth and one loudness"
```

---

## Self-Review

**Spec coverage:**

| Spec section | Task |
|---|---|
| Part one 1, `reach` | 1 |
| Part one 2, stations and `at` | 2 |
| Part one 3, lanes on stations | 3 |
| Part one 4, the floor and the fallback | 3 (the `Math.max` and the `found === null` arm) |
| Part one, tests | 2 (station measurement), 4 (the invariant), 3 (lane arithmetic) |
| Part two 5, quiet is a colour | 7 (the deleted `.march-other` rule) |
| Part two 6, ink | 6 |
| Part two 7, casing | 6 |
| Part two 8, emphasis | 7 |
| Part two 9, the aim lift | 7 (`atAimTarget`) |
| Part two, tests | 6 (`inkFor` over both palettes), 7 (`emphasisFor`) |
| Both browser passes | 5, 8 |

**Type consistency:** `Station` is defined in Task 2 and consumed by name in
Tasks 3 and 4. `ARROW_DEPTHS` is defined in Task 1 and used in 2 and 3.
`ArrowEmphasis`, `ARROW_EMPHASIS`, `ArrowCues` and `emphasisFor` are all defined
in Task 7 and used only there and in `src/main.ts`. `inkFor` and
`contrastRatio` are defined in Task 6 with the same argument order everywhere
(`hex, against, target`).

**Known risk, stated rather than hidden:** Task 3 changes where lanes sit for
every kind of arrow at once, so `tests/render.test.ts` and
`tests/arrow-focus.test.ts` are the two suites most likely to move. Neither
asserts a coordinate today; if one starts failing, read it before changing it.
