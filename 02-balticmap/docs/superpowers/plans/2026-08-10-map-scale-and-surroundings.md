# Map Scale and Surroundings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Open on the whole playable map inside a band of surrounding land, let
the player zoom out at least twice as far as today into real geography, and
swap label detail in and out with scale the way an atlas does.

**Architecture:** The three view rules (default, floor, pan bound) move into one
`ViewBounds` object derived from the map and the viewport, replacing `base`'s
current triple duty. A scale-driven detail ladder toggles per-layer classes on
the `<svg>` root, with every threshold derived from the layer's authored font
size. Both maps re-bake at a larger margin with longer neighbour lists and a
new large-text `group` label kind.

**Tech Stack:** Plain TypeScript + Vite, no framework, imperative DOM. vitest
(happy-dom). Map bakes: node scripts using d3-geo, topojson, polygon-clipping.

## Global Constraints

- Work in the worktree at
  `/Users/janis.kirsteins/Projects/prototypes/.claude/worktrees/multi-region`,
  branch `worktree-multi-region`, from its `02-balticmap/` directory.
- `npm test` and `npm run build` must pass before every commit. Do NOT run
  `npm run balance` (minutes) - balance is unaffected by this work.
- Stage with explicit paths. Never `git add -A`. Commit subjects lowercase
  (`feat(balticmap):` / `test(balticmap):` / `docs(balticmap):`), each message
  ending with the trailer `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
- No em dashes and no non-ASCII punctuation in any new prose, data or comment.
  Use `-`, `->`, `...`. Comments explain WHY; they never chronicle a change.
- No change to card rules, AI, the engine, or any faction/land roster. This
  plan touches views, labels, styling and baked geometry only.
- The design spec is
  `docs/superpowers/specs/2026-08-10-map-scale-and-surroundings-design.md`.
  Read the section covering your task before writing code.
- `MIN_LABEL_PX = 8`, `DEFAULT_RING = 0.12`, `group` label size 64px and
  `margin: 2000` are the agreed starting values. They are tuned once, by eye,
  in the final Chrome pass - not adjusted opportunistically mid-task.

---

### Task 1: One ViewBounds instead of three jobs for `base`

**Files:**
- Modify: `src/view.ts:5-20` (constants), `:214-283` (fitView, clampW,
  clampView, homeView, panBy, zoomAt)
- Modify: `src/interaction.ts:2` (imports), `:83-101` (base/view/resize)
- Test: `tests/view.test.ts` (extend; create the describe block if absent)

**Interfaces:**
- Consumes: `MapData` (`width`, `height`, `margin`) from `src/types.ts`.
- Produces (later tasks and the controller rely on these exact names):

```ts
// src/view.ts
export interface View { x: number; y: number; w: number; h: number }

/** How far past the exact whole-map fit the default view sits, so every land
 *  is on screen inside a band of the ground around it. */
export const DEFAULT_RING = 0.12;
export const MAX_ZOOM = 8;

/** Everything a view is allowed to be, for one map in one viewport.
 *
 *  `base` used to answer all three questions at once - what may be panned
 *  over, how wide a view may get, how narrow. They have different answers
 *  now: the widest view is bounded by the painted ground and the narrowest by
 *  the map the player plays on, so a deeper floor must not silently deepen
 *  the ceiling too. */
export interface ViewBounds {
  /** The painted rect: canvas plus margin. Pan bound and zoom-out bound. */
  outer: View;
  /** Widest allowed view width: the largest viewport-shaped rect that fits
   *  INSIDE `outer`. Not the smallest that covers it - a view wider than the
   *  painted ground shows unpainted page beside the sea. */
  maxW: number;
  /** Narrowest allowed view width: the default view over MAX_ZOOM. */
  minW: number;
  /** Viewport aspect as height over width. */
  aspect: number;
  /** What a fresh load shows: the whole canvas plus DEFAULT_RING, centered. */
  home: View;
}

export function viewBoundsOf(
  map: { width: number; height: number; margin: number },
  vpW: number, vpH: number,
): ViewBounds;

export function clampView(view: View, b: ViewBounds): View;
export function panBy(view: View, b: ViewBounds, dxPx: number, dyPx: number, vpW: number): View;
export function zoomAt(view: View, b: ViewBounds, px: number, py: number, factor: number, vpW: number, vpH: number): View;
```

`fitView`, `homeView` and `MIN_ZOOM` are REMOVED. `MIN_ZOOM`'s doc comment
states the behaviour this task deletes ("the whole map never fits on screen"),
so leaving it as an unread constant would leave the codebase asserting the
opposite of what it does.

- [ ] **Step 1: Write the failing tests**

```ts
// tests/view.test.ts - add to the existing file, matching its import style
import { describe, it, expect } from "vitest";
import {
  viewBoundsOf, clampView, zoomAt, panBy, DEFAULT_RING, MAX_ZOOM,
} from "../src/view";

const BALTIC = { width: 1000, height: 1400, margin: 2000 };
const IBERIA = { width: 1400, height: 1150, margin: 2000 };
const VIEWPORTS: [number, number][] = [[1440, 749], [800, 1200], [1000, 1000]];

const covers = (v: { x: number; y: number; w: number; h: number },
                m: { width: number; height: number }) =>
  v.x <= 0 && v.y <= 0 && v.x + v.w >= m.width && v.y + v.h >= m.height;

describe("view bounds", () => {
  it("opens on the whole canvas plus a ring, on any viewport", () => {
    for (const map of [BALTIC, IBERIA]) {
      for (const [vpW, vpH] of VIEWPORTS) {
        const b = viewBoundsOf(map, vpW, vpH);
        expect(covers(b.home, map), `${map.width} @ ${vpW}x${vpH}`).toBe(true);
        // The ring is real: the home view is wider than the exact fit.
        const fitW = Math.max(map.width, map.height / (vpH / vpW));
        expect(b.home.w).toBeGreaterThan(fitW * 1.05);
        expect(b.home.w).toBeCloseTo(Math.min(fitW * (1 + DEFAULT_RING), b.maxW), 5);
      }
    }
  });

  it("the floor fits inside the painted rect and touches it on one axis", () => {
    for (const map of [BALTIC, IBERIA]) {
      for (const [vpW, vpH] of VIEWPORTS) {
        const b = viewBoundsOf(map, vpW, vpH);
        const maxH = b.maxW * b.aspect;
        expect(b.maxW).toBeLessThanOrEqual(b.outer.w + 1e-9);
        expect(maxH).toBeLessThanOrEqual(b.outer.h + 1e-9);
        const touches =
          Math.abs(b.maxW - b.outer.w) < 1e-6 || Math.abs(maxH - b.outer.h) < 1e-6;
        expect(touches, "floor must reach the painted edge on one axis").toBe(true);
      }
    }
  });

  it("zooms out at least twice as far as the old 1.3 floor did", () => {
    // The retired rule: widest view = (smallest rect COVERING the canvas) / 1.3.
    for (const map of [BALTIC, IBERIA]) {
      const [vpW, vpH] = [1440, 749];
      const b = viewBoundsOf(map, vpW, vpH);
      const oldWidest = Math.max(map.width, map.height / (vpH / vpW)) / 1.3;
      expect(b.maxW / oldWidest).toBeGreaterThanOrEqual(2);
    }
  });

  it("the zoom-in ceiling is measured against the default, not the floor", () => {
    const b = viewBoundsOf(BALTIC, 1440, 749);
    expect(b.minW).toBeCloseTo(b.home.w / MAX_ZOOM, 5);
  });

  it("clamping keeps every view inside the painted rect", () => {
    const b = viewBoundsOf(BALTIC, 1440, 749);
    for (const v of [
      { x: -99999, y: -99999, w: b.home.w, h: b.home.h },
      { x: 99999, y: 99999, w: b.home.w, h: b.home.h },
      { x: 0, y: 0, w: 1e9, h: 1e9 },
      { x: 0, y: 0, w: 1e-9, h: 1e-9 },
    ]) {
      const c = clampView(v, b);
      expect(c.w).toBeGreaterThanOrEqual(b.minW - 1e-9);
      expect(c.w).toBeLessThanOrEqual(b.maxW + 1e-9);
      expect(c.x).toBeGreaterThanOrEqual(b.outer.x - 1e-9);
      expect(c.y).toBeGreaterThanOrEqual(b.outer.y - 1e-9);
      expect(c.x + c.w).toBeLessThanOrEqual(b.outer.x + b.outer.w + 1e-9);
      expect(c.y + c.h).toBeLessThanOrEqual(b.outer.y + b.outer.h + 1e-9);
    }
  });

  it("a wheel tick at the floor pans nothing sideways", () => {
    const b = viewBoundsOf(BALTIC, 1440, 749);
    const floor = clampView({ x: 0, y: 0, w: 1e9, h: 1e9 }, b);
    const out = zoomAt(floor, b, 700, 400, 0.9, 1440, 749);
    expect(out).toEqual(floor);
  });

  it("panning at the floor cannot move the view", () => {
    const b = viewBoundsOf(IBERIA, 1440, 749);
    const floor = clampView({ x: 0, y: 0, w: 1e9, h: 1e9 }, b);
    expect(panBy(floor, b, 200, 200, 1440)).toEqual(floor);
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run tests/view.test.ts`
Expected: FAIL - `viewBoundsOf` is not exported.

- [ ] **Step 3: Implement**

```ts
// src/view.ts
export function viewBoundsOf(
  map: { width: number; height: number; margin: number },
  vpW: number, vpH: number,
): ViewBounds {
  const aspect = vpH / vpW;
  const outer: View = {
    x: -map.margin, y: -map.margin,
    w: map.width + 2 * map.margin, h: map.height + 2 * map.margin,
  };
  // Largest viewport-shaped rect that FITS INSIDE the painted ground.
  const maxW = Math.min(outer.w, outer.h / aspect);
  // Smallest viewport-shaped rect that COVERS the canvas, then the ring.
  const fitW = Math.max(map.width, map.height / aspect);
  const homeW = Math.min(fitW * (1 + DEFAULT_RING), maxW);
  const homeH = homeW * aspect;
  const home = clampInto(
    {
      x: map.width / 2 - homeW / 2, y: map.height / 2 - homeH / 2,
      w: homeW, h: homeH,
    },
    outer,
  );
  return { outer, maxW, minW: homeW / MAX_ZOOM, aspect, home };
}
```

`clampInto(view, outer)` is a small private helper clamping x/y only - the
same two `Math.min(Math.max(...))` lines `clampView` already runs - so the
home centering and the general clamp cannot disagree about what "inside"
means. `clampView` becomes: clamp `w` into `[minW, maxW]`, derive
`h = w * aspect`, then `clampInto`. `panBy` and `zoomAt` change only in
taking `b: ViewBounds` and reading `b.aspect` where they read `base.h/base.w`.

`src/interaction.ts`: replace the `base`/`view` pair with

```ts
let bounds = viewBoundsOf(data, vpW(), vpH());
let view: View = bounds.home;
```

and in the resize handler recompute `bounds` first, keep the
"was the player at home" check against the OLD `bounds.home`, then
`view = wasAtHome ? bounds.home : clampView(view, bounds)`. Update the
`homeView(base)` comment above the declaration to state the new rule.

- [ ] **Step 4: Full suite and build**

Run: `npm test && npm run build`
Expected: PASS. `tests/interaction.test.ts` and `tests/render.test.ts` drive
this file; if either asserts an old crop, fix the ASSERTION to the new rule
and say so in your report - do not weaken the new behaviour to keep an old
expectation green.

- [ ] **Step 5: Commit**

```bash
git add src/view.ts src/interaction.ts tests/view.test.ts
git commit -m "feat(balticmap): the map opens whole, and the floor is the ground it sits in"
```

---

### Task 2: The detail ladder

**Files:**
- Create: `src/map-detail.ts`
- Modify: `src/interaction.ts` (apply the classes on every view change),
  `src/style.css` (the hide rules, and the `.label-group` style)
- Modify: `src/types.ts` (`LabelKind` gains `"group"`)
- Test: `tests/map-detail.test.ts`

**Interfaces:**
- Consumes: nothing from Task 1 except that `interaction.ts` already
  recomputes the view in `apply()`.
- Produces:

```ts
// src/map-detail.ts
/** Smallest a label may render before it is noise rather than a name. The one
 *  number the whole ladder rests on. */
export const MIN_LABEL_PX = 8;

export interface DetailLayer {
  /** Class put on the <svg> root to hide this layer. */
  hideClass: string;
  /** The style.css selector whose font-size sets this layer's threshold. The
   *  drift guard reads it back, so the size is declared once, in CSS. */
  selector: string;
  fontPx: number;
}

/** Ascending by font size, which IS the order they drop out in. */
export const DETAIL_LAYERS: readonly DetailLayer[];
/** Shown exactly while the people labels are hidden, so the map is never
 *  wordless: the per-people names give way to a few large ones. */
export const GROUP_LABEL_CLASS = "show-group-labels";
export const GROUP_LABEL_SELECTOR = ".label-group";
export const GROUP_LABEL_PX = 64;
export const ALL_DETAIL_CLASSES: readonly string[];

/** `scale` is viewport pixels per map unit. */
export function detailClassesAt(scale: number): string[];
```

The four layers, in order: `.settlement-label` 12, `.label-river` 16,
`.threat-badge .badge-text` 18, `.label-people` 30, hidden by
`hide-settlement-labels`, `hide-river-labels`, `hide-badges`,
`hide-people-labels`.

Note a deliberate refinement of the spec: the spec described one
`data-detail` attribute. Per-layer classes are used instead - the attribute
form needs one CSS rule per (layer, tier) pair, which is the combinatorial
restatement the single-source rule exists to avoid. The essential claim is
unchanged: every threshold is derived from the layer's authored size, in one
table.

- [ ] **Step 1: Write the failing tests**

```ts
// tests/map-detail.test.ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  DETAIL_LAYERS, ALL_DETAIL_CLASSES, GROUP_LABEL_CLASS, GROUP_LABEL_PX,
  GROUP_LABEL_SELECTOR, MIN_LABEL_PX, detailClassesAt,
} from "../src/map-detail";

/** The font-size declared for `selector` in style.css, or null. */
function cssFontPx(selector: string): number | null {
  const css = readFileSync("src/style.css", "utf8");
  const at = css.indexOf(`${selector} {`);
  if (at < 0) return null;
  const block = css.slice(at, css.indexOf("}", at));
  const m = block.match(/font-size:\s*(\d+(?:\.\d+)?)px/);
  return m === null ? null : Number(m[1]);
}

describe("detail ladder", () => {
  it("declares each layer's size once, in the stylesheet", () => {
    for (const layer of DETAIL_LAYERS) {
      expect(cssFontPx(layer.selector), layer.selector).toBe(layer.fontPx);
    }
    expect(cssFontPx(GROUP_LABEL_SELECTOR)).toBe(GROUP_LABEL_PX);
  });

  it("layers are ascending by size, which is the order they drop out", () => {
    const sizes = DETAIL_LAYERS.map((l) => l.fontPx);
    expect(sizes).toEqual([...sizes].sort((a, b) => a - b));
    expect(new Set(DETAIL_LAYERS.map((l) => l.hideClass)).size)
      .toBe(DETAIL_LAYERS.length);
  });

  it("hides a layer exactly below its own legibility scale", () => {
    for (const layer of DETAIL_LAYERS) {
      const at = MIN_LABEL_PX / layer.fontPx;
      expect(detailClassesAt(at * 1.001)).not.toContain(layer.hideClass);
      expect(detailClassesAt(at * 0.999)).toContain(layer.hideClass);
    }
  });

  it("drops the smallest text first and the largest last", () => {
    const counts = [2, 1, 0.5, 0.4, 0.3, 0.2, 0.1]
      .map((s) => detailClassesAt(s).length);
    expect(counts).toEqual([...counts].sort((a, b) => a - b));
    expect(detailClassesAt(2)).toEqual([]);
  });

  it("group labels are shown exactly when the people labels are gone", () => {
    const people = DETAIL_LAYERS.find((l) => l.selector === ".label-people")!;
    for (const scale of [2, 1, 0.5, 0.35, 0.26, 0.2, 0.1, 0.05]) {
      const on = detailClassesAt(scale);
      expect(on.includes(GROUP_LABEL_CLASS), `scale ${scale}`)
        .toBe(on.includes(people.hideClass));
    }
  });

  it("every class it can return is in ALL_DETAIL_CLASSES", () => {
    for (const scale of [4, 1, 0.5, 0.3, 0.2, 0.05, 0.001]) {
      for (const c of detailClassesAt(scale)) {
        expect(ALL_DETAIL_CLASSES).toContain(c);
      }
    }
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run tests/map-detail.test.ts`
Expected: FAIL - `Cannot find module '../src/map-detail'`.

- [ ] **Step 3: Implement**

Write `src/map-detail.ts` per the interface. `detailClassesAt` pushes each
layer's `hideClass` while `layer.fontPx * scale < MIN_LABEL_PX`, then pushes
`GROUP_LABEL_CLASS` if the people layer's class was pushed.

`src/style.css`: one `display: none` rule per hide class, scoped to the svg
root, which carries the class `map` (`map-render.ts:91`) - so
`.map.hide-settlement-labels .settlement-label { display: none }` and its
three siblings. Add
`.label-group`: 64px, the `.label-people` family's colour and letter-spacing
at a wider tracking, `text-anchor: middle`, `pointer-events: none`, and
`display: none` by default, turned on by `.show-group-labels .label-group`.
Follow the dark-box rule: state the colour, never inherit.

`src/types.ts`: add `"group"` to `LabelKind`. `map-render.ts` already writes
`label-${l.kind}`, so nothing else there changes.

`src/interaction.ts`: in `apply()`, after setting the viewBox,

```ts
const want = new Set(detailClassesAt(vpW() / view.w));
for (const c of ALL_DETAIL_CLASSES) svg.classList.toggle(c, want.has(c));
```

- [ ] **Step 4: Full suite and build**

Run: `npm test && npm run build`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/map-detail.ts src/interaction.ts src/style.css src/types.ts tests/map-detail.test.ts
git commit -m "feat(balticmap): labels leave when they stop being legible, and big ones take over"
```

---

### Task 3: Re-bake the Baltic map wide

**Files:**
- Modify: `scripts/prepare-data.mjs` (`NEIGHBORS` :39, `CLIP_MARGIN` :1509,
  the `LABELS` table around :723-740)
- Regenerate: `src/data/baltic.json`
- Modify: `tests/data.test.ts` (margin, label bounds, group labels)

**Interfaces:**
- Consumes: `LabelKind` gained `"group"` in Task 2.
- Produces: `baltic.json` with `margin: 2000`, a longer `neighbors` list, and
  `labels` entries of kind `group`.

- [ ] **Step 1: Write the failing tests**

In `tests/data.test.ts`, change the canvas assertion to `margin` 2000, and
add:

```ts
it("names the ground beyond the lands, for the zoomed-out view", () => {
  const group = data.labels.filter((l) => l.kind === "group").map((l) => l.text);
  expect(group).toContain("FINNIC PEOPLES");
  expect(group).toContain("THE BALTS");
  expect(group).toContain("SCANDINAVIA");
  expect(group).toContain("RUS'");
  expect(group).toContain("POLAND");
});

it("carries the surrounding countries, not only the bordering ones", () => {
  const ids = data.neighbors.map((n) => n.id);
  for (const id of ["DK", "NO", "DE", "PL", "RU", "SE", "FI", "BY"]) {
    expect(ids, `neighbor ${id}`).toContain(id);
  }
  for (const n of data.neighbors) expect(n.path.startsWith("M")).toBe(true);
});
```

Then WIDEN the existing label-bounds assertion. Today it requires every label
inside `[0, 1000] x [0, 1400]`; a `group` label naming Scandinavia sits
outside the canvas by design. Split it: settlements keep the canvas bound (a
site outside the playable map is a site nobody can reach), labels take the
painted rect `[-margin, width+margin] x [-margin, height+margin]`.

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run tests/data.test.ts`
Expected: FAIL on margin, on the group labels, and on DK/NO/DE.

- [ ] **Step 3: Re-bake**

Read `scripts/prepare-data.mjs` whole first. Then:
1. `CLIP_MARGIN` 1200 -> 2000. Update the comment above it: it currently
   justifies 1200 by "viewport aspects up to ~3.4:1 at the floor", which is
   the retired floor rule. State the new one - the painted rect IS the pan and
   zoom bound, so what is baked is exactly what can be reached.
2. `NEIGHBORS` gains `DK`, `NO`, `DE`. DK was dropped once for being
   off-canvas at the old frame; it is in view now. The existing guard that
   warns when a listed neighbour contributes no path is what tells you whether
   a code earns its place - read the bake output and drop any that does not.
3. Add the five `group` labels to the label table, kind `"group"`, positioned
   by lon/lat as its neighbours are. Starting positions, to be confirmed by
   eye in the Chrome pass: FINNIC PEOPLES lon 24.5 lat 58.8; THE BALTS lon
   24.0 lat 55.4; SCANDINAVIA lon 16.0 lat 59.0; RUS' lon 31.0 lat 56.5;
   POLAND lon 20.0 lat 52.2. A name may appear both here and in the existing
   `neighbor` labels - they are never visible at the same scale, which is the
   point of the ladder.
4. `npm run prepare-data`, then check the printed land/neighbour counts.

**Size budget: `src/data/baltic.json` must stay under 2.5 MB** (986 KB today).
Print the written size at the end of the bake. If the additions blow the
budget, do NOT drop a country - a neighbour clipped away leaves a straight cut
through land with bare sea beyond it, which is the thing the margin exists to
prevent. Reduce coordinate precision for neighbour geometry only (the grey
context nobody measures), and say in your report what you changed and what the
size became.

- [ ] **Step 4: Full suite and build**

Run: `npm test && npm run build`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/prepare-data.mjs src/data/baltic.json tests/data.test.ts
git commit -m "feat(balticmap): the baltic map gets the sea and the neighbours it sits in"
```

---

### Task 4: Re-bake the Iberia map wide

**Files:**
- Modify: `scripts/prepare-iberia.mjs` (`NEIGHBORS` :29, `CLIP_MARGIN` :976,
  the label table around :513-524)
- Regenerate: `src/data/iberia.json`
- Modify: `tests/data-iberia.test.ts`

**Interfaces:**
- Consumes: `LabelKind` gained `"group"` in Task 2; the same widened
  label-bounds rule Task 3 applied to `tests/data.test.ts`.
- Produces: `iberia.json` with `margin: 2000`, more neighbours, `group` labels.

- [ ] **Step 1: Write the failing tests**

Mirror Task 3 in `tests/data-iberia.test.ts`: `margin` 2000; group labels
containing `THE CHRISTIAN NORTH`, `AL-ANDALUS`, `FRANCIA`, `THE MAGHREB`;
neighbours containing at least `FR`, `MA`, `DZ`; and the same
settlements-in-canvas / labels-in-painted-rect split - the existing bounds
assertions are at `tests/data-iberia.test.ts:228-232` (labels, which widen)
and `:247-249` (settlements, which do not).

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run tests/data-iberia.test.ts`
Expected: FAIL on margin and on the group labels.

- [ ] **Step 3: Re-bake**

Read `scripts/prepare-iberia.mjs` whole first. Then:
1. `CLIP_MARGIN` -> 2000, comment updated as in Task 3.
2. `NEIGHBORS` gains `DZ` and `TN` (the Maghreb coast the emirate looked
   across), and `IT` for Sardinia. Consider `GB`/`IE` only if land actually
   enters the box - the "contributes no path" guard is the arbiter, and the
   bake must not list a code that draws nothing. Corsica arrives with `FR`.
3. Add the four `group` labels, kind `"group"`. Starting positions: THE
   CHRISTIAN NORTH lon -4.0 lat 43.4; AL-ANDALUS lon -4.5 lat 37.4; FRANCIA
   lon 2.5 lat 45.5; THE MAGHREB lon -4.0 lat 32.8. The existing 22px
   `neighbor` FRANCIA and MAGHREB stay where they are.
4. `npm run prepare-iberia`; read the printed stats.

**Size budget: `src/data/iberia.json` under 2.5 MB** (464 KB today), same rule
and same reporting as Task 3.

- [ ] **Step 4: Full suite and build**

Run: `npm test && npm run build`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/prepare-iberia.mjs src/data/iberia.json tests/data-iberia.test.ts
git commit -m "feat(balticmap): iberia gets frankia, the maghreb and the sea between"
```

---

### Task 5: The invariants that must hold for every region

**Files:**
- Modify: `tests/regions.test.ts` (extend the existing
  `Object.values(REGIONS)` loop)

**Interfaces:**
- Consumes: both re-baked maps (Tasks 3 and 4), `viewBoundsOf` (Task 1),
  `DETAIL_LAYERS` / `GROUP_LABEL_PX` (Task 2).
- Produces: nothing new; this is the cross-region guard a per-map test cannot
  be.

This task exists separately because a shared invariant added while only one
map is re-baked fails on the other. It runs last on purpose.

- [ ] **Step 1: Write the tests**

Inside the existing per-region loop in `tests/regions.test.ts`:

```ts
// Every region is reachable at both ends of the zoom.
const b = viewBoundsOf(region.map, 1440, 749);
expect(b.home.x <= 0 && b.home.y <= 0, `${region.id} opens whole`).toBe(true);
expect(b.home.x + b.home.w >= region.map.width).toBe(true);
expect(b.home.y + b.home.h >= region.map.height).toBe(true);
const oldWidest = Math.max(region.map.width, region.map.height / (749 / 1440)) / 1.3;
expect(b.maxW / oldWidest, `${region.id} zooms out 2x`).toBeGreaterThanOrEqual(2);

// The map never goes wordless at the floor.
const group = region.map.labels.filter((l) => l.kind === "group");
expect(group.length, `${region.id} group labels`).toBeGreaterThanOrEqual(2);

// Every label sits on painted ground.
const m = region.map.margin;
expect(m).toBe(2000);
for (const l of region.map.labels) {
  expect(l.x).toBeGreaterThanOrEqual(-m);
  expect(l.x).toBeLessThanOrEqual(region.map.width + m);
  expect(l.y).toBeGreaterThanOrEqual(-m);
  expect(l.y).toBeLessThanOrEqual(region.map.height + m);
}
// A settlement outside the canvas is a site nobody can reach.
for (const s of region.map.settlements) {
  expect(s.x).toBeGreaterThan(0);
  expect(s.x).toBeLessThan(region.map.width);
  expect(s.y).toBeGreaterThan(0);
  expect(s.y).toBeLessThan(region.map.height);
}
```

And, outside the loop, the shipped-size budget, reading the files from disk:

```ts
it("no region's map data creeps past the bundle budget", () => {
  for (const file of ["baltic", "iberia"]) {
    const bytes = statSync(`src/data/${file}.json`).size;
    expect(bytes, `${file}.json is ${(bytes / 1e6).toFixed(2)} MB`)
      .toBeLessThan(2.5e6);
  }
});
```

- [ ] **Step 2: Run**

Run: `npx vitest run tests/regions.test.ts`
Expected: PASS if Tasks 1-4 landed correctly. A failure here is a real gap in
an earlier task - report it, do not relax the invariant.

- [ ] **Step 3: Full suite and build**

Run: `npm test && npm run build`

- [ ] **Step 4: Commit**

```bash
git add tests/regions.test.ts
git commit -m "test(balticmap): every region opens whole, zooms out and stays in budget"
```

---

### Task 6: Tune by eye and verify in Chrome

Not a subagent task - the orchestrating session runs this, because it is the
one judgment the tests cannot make.

- [ ] `npm test && npm run build` clean; `npm run dev`.
- [ ] Both regions, at the default view: every land visible, inside a band of
  real surrounding land rather than empty sea. Read the labels.
- [ ] Zoom to the floor on each: settlement names, river names and badges are
  gone; the per-people labels have given way to the group ones; the group
  labels sit over the right ground and do not collide with each other or with
  the surrounding-realm names. Screenshot and READ it - the dark-box lesson in
  AGENTS.md is that a screenshot checked for layout and not read hides exactly
  this class of fault.
- [ ] Zoom back in: everything returns, in reverse order, with no flicker at a
  boundary.
- [ ] Zoom all the way in: the closest view is no closer than it is on `main`
  (the ceiling must not have followed the floor out).
- [ ] Tune `DEFAULT_RING`, `MIN_LABEL_PX` and the group-label positions if the
  eye disagrees with the starting values, then re-run the suite. These are the
  three numbers this pass exists to settle.
- [ ] Fix what the pass finds through the ordinary test-first loop, then hand
  over on the branch. Merging waits for the user.

## Self-review notes

- Spec coverage: view model (T1), ladder and the `group` kind (T2), Baltic
  geography and labels (T3), Iberia (T4), cross-region invariants and the size
  budget (T5), the Chrome tuning pass (T6).
- The one deliberate deviation from the spec is T2's per-layer classes in
  place of a single `data-detail` attribute, recorded in that task.
- `MAX_ZOOM` keeps its value; only its reference point moves (T1), and a test
  pins that so a deeper floor cannot silently deepen the ceiling.
- Balance suites are untouched: nothing here reaches cards, AI or the engine,
  and `sim.ts` builds its own state without a viewport.
