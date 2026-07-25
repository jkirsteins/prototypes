# Baltic Map Prototype Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Interactive SVG map of the Baltic states with 21 hoverable/clickable NUTS-3 regions, built from open Eurostat GISCO vector data, deployed to GitHub Pages at /prototypes/02/.

**Architecture:** A one-time Node prep script downloads GISCO GeoJSON, projects it (LAEA Europe via d3-geo) into a 1000x1400 coordinate space and commits a compact `map.json` of SVG path strings. The runtime app (Vite + TypeScript, zero npm runtime dependencies) renders one SVG from that JSON and layers pure-logic modules (view math, selection state) under thin DOM glue (render, interaction, panel).

**Tech Stack:** Vite 5, TypeScript 5, Vitest + happy-dom (tests only), d3-geo (prep script only, devDependency).

## Global Constraints

- Runtime app has ZERO npm dependencies; d3-geo, vitest, happy-dom, vite, typescript are devDependencies only.
- `vite.config.ts` base: `"/prototypes/02/"` (and `01-escapecastle` changes to `"/prototypes/01/"`).
- Attribution string, exact: `(c) EuroGeographics for the administrative boundaries`
- Zoom clamped between 1x (fit-to-viewport) and 8x; wheel zoom centered on cursor.
- NUTS 2013 classification, 1:1M generalization. Exactly 21 regions: EE001 EE004 EE006 EE007 EE008, LV003 LV005 LV006 LV007 LV008 LV009, LT001 LT002 LT003 LT004 LT005 LT006 LT007 LT008 LT009 LT00A.
- TypeScript strict mode. All work happens in `02-balticmap/` unless a task says otherwise. All commands run from `02-balticmap/` unless the step says otherwise.
- Commit messages: end with `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.

---

### Task 1: Project scaffolding

**Files:**
- Create: `02-balticmap/package.json`
- Create: `02-balticmap/tsconfig.json`
- Create: `02-balticmap/vite.config.ts`
- Create: `02-balticmap/index.html`
- Create: `02-balticmap/.gitignore`
- Create: `02-balticmap/src/main.ts` (stub)
- Create: `02-balticmap/src/style.css` (stub)
- Test: `02-balticmap/tests/smoke.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: a building Vite+TS project; `npm test` runs Vitest; later tasks add modules under `src/` and tests under `tests/`.

- [ ] **Step 1: Write package.json**

```json
{
  "name": "balticmap",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite --host 127.0.0.1",
    "build": "tsc && vite build",
    "preview": "vite preview --host 127.0.0.1",
    "test": "vitest run",
    "prepare-data": "node scripts/prepare-data.mjs"
  },
  "devDependencies": {
    "d3-geo": "^3.1.1",
    "happy-dom": "^15.11.0",
    "typescript": "^5.5.4",
    "vite": "^5.4.0",
    "vitest": "^2.0.5"
  }
}
```

- [ ] **Step 2: Write tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "strict": true,
    "noEmit": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "skipLibCheck": true
  },
  "include": ["src", "tests"]
}
```

- [ ] **Step 3: Write vite.config.ts**

```ts
import { defineConfig } from "vite";

export default defineConfig({
  base: "/prototypes/02/",
});
```

- [ ] **Step 4: Write index.html**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Baltic States - NUTS-3 Regions</title>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

- [ ] **Step 5: Write .gitignore**

```
node_modules/
dist/
```

- [ ] **Step 6: Write stub src/main.ts and empty src/style.css**

`src/main.ts`:

```ts
import "./style.css";

document.getElementById("app")!.textContent = "balticmap loading...";
```

`src/style.css`: create empty file.

- [ ] **Step 7: Write smoke test tests/smoke.test.ts**

```ts
import { describe, it, expect } from "vitest";

describe("toolchain", () => {
  it("runs tests", () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 8: Install and verify**

Run: `npm install`
Expected: completes without errors, lockfile created.

Run: `npm test`
Expected: 1 test passes.

Run: `npm run build`
Expected: `tsc` passes, vite writes `dist/`.

- [ ] **Step 9: Commit**

```bash
git add 02-balticmap/package.json 02-balticmap/package-lock.json 02-balticmap/tsconfig.json 02-balticmap/vite.config.ts 02-balticmap/index.html 02-balticmap/.gitignore 02-balticmap/src 02-balticmap/tests
git commit -m "feat(balticmap): scaffold Vite+TS project with Vitest"
```

(Run git commands from the repo root `/Users/janis.kirsteins/Projects/prototypes`.)

---

### Task 2: Types, data prep script, committed map.json

**Files:**
- Create: `02-balticmap/src/types.ts`
- Create: `02-balticmap/scripts/prepare-data.mjs`
- Create: `02-balticmap/src/data/map.json` (generated by the script, committed)
- Test: `02-balticmap/tests/data.test.ts`

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces: `src/types.ts` exporting `Region { id, name, country, path }`, `Neighbor { id, path }`, `CountryLabel { text, x, y }`, `MapData { width, height, attribution, regions, neighbors, labels }`. Produces `src/data/map.json` conforming to `MapData`. Later tasks import both.

- [ ] **Step 1: Write src/types.ts**

```ts
export interface Region {
  id: string;
  name: string;
  country: string;
  path: string;
}

export interface Neighbor {
  id: string;
  path: string;
}

export interface CountryLabel {
  text: string;
  x: number;
  y: number;
}

export interface MapData {
  width: number;
  height: number;
  attribution: string;
  regions: Region[];
  neighbors: Neighbor[];
  labels: CountryLabel[];
}
```

- [ ] **Step 2: Write the failing data test tests/data.test.ts**

```ts
import { describe, it, expect } from "vitest";
import type { MapData } from "../src/types";
import raw from "../src/data/map.json";

const data = raw as MapData;

const EXPECTED_IDS = [
  "EE001", "EE004", "EE006", "EE007", "EE008",
  "LT001", "LT002", "LT003", "LT004", "LT005",
  "LT006", "LT007", "LT008", "LT009", "LT00A",
  "LV003", "LV005", "LV006", "LV007", "LV008", "LV009",
];

describe("map.json", () => {
  it("has canvas bounds and attribution", () => {
    expect(data.width).toBe(1000);
    expect(data.height).toBe(1400);
    expect(data.attribution).toBe(
      "(c) EuroGeographics for the administrative boundaries",
    );
  });

  it("contains exactly the 21 NUTS-3 regions, sorted by id", () => {
    expect(data.regions.map((r) => r.id)).toEqual(EXPECTED_IDS);
  });

  it("every region has a name, a country matching its id, and path data", () => {
    for (const r of data.regions) {
      expect(r.name.length).toBeGreaterThan(0);
      expect(r.country).toBe(r.id.slice(0, 2));
      expect(r.path.startsWith("M")).toBe(true);
    }
  });

  it("has neighbor geometry and three country labels inside bounds", () => {
    expect(data.neighbors.length).toBeGreaterThanOrEqual(4);
    for (const n of data.neighbors) expect(n.path.startsWith("M")).toBe(true);
    expect(data.labels.map((l) => l.text).sort()).toEqual([
      "ESTONIA", "LATVIA", "LITHUANIA",
    ]);
    for (const l of data.labels) {
      expect(l.x).toBeGreaterThan(0);
      expect(l.x).toBeLessThan(1000);
      expect(l.y).toBeGreaterThan(0);
      expect(l.y).toBeLessThan(1400);
    }
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test`
Expected: FAIL - cannot resolve `../src/data/map.json` (file does not exist yet).

- [ ] **Step 4: Write scripts/prepare-data.mjs**

```js
import { writeFileSync, mkdirSync } from "node:fs";
import { geoAzimuthalEqualArea, geoPath } from "d3-geo";

const NUTS_URL =
  "https://gisco-services.ec.europa.eu/distribution/v2/nuts/geojson/NUTS_RG_01M_2013_4326_LEVL_3.geojson";
const CNTR_URL =
  "https://gisco-services.ec.europa.eu/distribution/v2/countries/geojson/CNTR_RG_01M_2013_4326.geojson";

const WIDTH = 1000;
const HEIGHT = 1400;
const PAD = 40;
const BALTIC = ["EE", "LV", "LT"];
const NEIGHBORS = ["FI", "SE", "RU", "BY", "PL", "DK"];
const COUNTRY_LABELS = [
  { text: "ESTONIA", lon: 25.3, lat: 58.8 },
  { text: "LATVIA", lon: 26.2, lat: 56.9 },
  { text: "LITHUANIA", lon: 23.9, lat: 55.4 },
];

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed (${res.status}): ${url}`);
  return res.json();
}

const [nuts, countries] = await Promise.all([
  fetchJson(NUTS_URL),
  fetchJson(CNTR_URL),
]);

const regions = nuts.features.filter((f) =>
  BALTIC.includes(f.properties.CNTR_CODE),
);
if (regions.length !== 21) {
  throw new Error(`Expected 21 NUTS-3 regions, got ${regions.length}`);
}

const neighbors = countries.features.filter((f) =>
  NEIGHBORS.includes(f.properties.CNTR_ID),
);
if (neighbors.length !== NEIGHBORS.length) {
  const found = neighbors.map((f) => f.properties.CNTR_ID);
  throw new Error(`Missing neighbors: ${NEIGHBORS.filter((c) => !found.includes(c))}`);
}

// LAEA Europe orientation (lon 10, lat 52), fitted to the Baltic states.
const projection = geoAzimuthalEqualArea()
  .rotate([-10, -52])
  .fitExtent(
    [[PAD, PAD], [WIDTH - PAD, HEIGHT - PAD]],
    { type: "FeatureCollection", features: regions },
  );
projection.clipExtent([[0, 0], [WIDTH, HEIGHT]]);
const path = geoPath(projection).digits(1);

const data = {
  width: WIDTH,
  height: HEIGHT,
  attribution: "(c) EuroGeographics for the administrative boundaries",
  regions: regions
    .map((f) => ({
      id: f.properties.NUTS_ID,
      name: f.properties.NAME_LATN,
      country: f.properties.CNTR_CODE,
      path: path(f),
    }))
    .sort((a, b) => a.id.localeCompare(b.id)),
  neighbors: neighbors
    .map((f) => ({ id: f.properties.CNTR_ID, path: path(f) }))
    .filter((n) => n.path)
    .sort((a, b) => a.id.localeCompare(b.id)),
  labels: COUNTRY_LABELS.map((l) => {
    const projected = projection([l.lon, l.lat]);
    if (!projected) throw new Error(`Label outside projection: ${l.text}`);
    return { text: l.text, x: Math.round(projected[0]), y: Math.round(projected[1]) };
  }),
};

for (const r of data.regions) {
  if (!r.path) throw new Error(`Empty path for region ${r.id}`);
}

mkdirSync("src/data", { recursive: true });
writeFileSync("src/data/map.json", JSON.stringify(data));
console.log(
  `Wrote src/data/map.json: ${data.regions.length} regions, ` +
    `${data.neighbors.length} neighbors, ${data.labels.length} labels`,
);
```

- [ ] **Step 5: Run the script (network access required)**

Run: `npm run prepare-data`
Expected: `Wrote src/data/map.json: 21 regions, <4-6> neighbors, 3 labels`. (DK may drop out if fully clipped; that is fine.)

- [ ] **Step 6: Run tests to verify they pass**

Run: `npm test`
Expected: all data tests PASS.

- [ ] **Step 7: Check the JSON size is sane**

Run: `du -h src/data/map.json`
Expected: under ~3 MB. If wildly larger, something is wrong with clipping.

- [ ] **Step 8: Commit**

```bash
git add 02-balticmap/src/types.ts 02-balticmap/scripts 02-balticmap/src/data/map.json 02-balticmap/tests/data.test.ts
git commit -m "feat(balticmap): GISCO data prep script and committed map.json"
```

---

### Task 3: View math (pan/zoom, pure logic)

**Files:**
- Create: `02-balticmap/src/view.ts`
- Test: `02-balticmap/tests/view.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `View { x, y, w, h }`, `MAX_ZOOM = 8`, `fitView(mapW, mapH, vpW, vpH): View`, `clampView(view, base): View`, `panBy(view, base, dxPx, dyPx, vpW): View`, `zoomAt(view, base, px, py, factor, vpW, vpH): View`. Task 6 (interaction) uses all of these. All coordinates are map units; `dxPx/px/py/vpW/vpH` are viewport pixels. `factor > 1` zooms in; pan of +dxPx (cursor moving right) moves the view x left (content follows cursor).

- [ ] **Step 1: Write the failing tests tests/view.test.ts**

```ts
import { describe, it, expect } from "vitest";
import { fitView, clampView, panBy, zoomAt, MAX_ZOOM, type View } from "../src/view";

const close = (a: number, b: number) => expect(a).toBeCloseTo(b, 6);

describe("fitView", () => {
  it("covers the whole map, centered, matching viewport aspect", () => {
    // landscape viewport, portrait map: height binds
    const v = fitView(1000, 1400, 800, 600);
    close(v.h, 1400);
    close(v.w, (800 / 600) * 1400);
    close(v.y, 0);
    close(v.x, (1000 - v.w) / 2);
  });

  it("binds on width for a tall narrow viewport", () => {
    const v = fitView(1000, 1400, 500, 2000);
    close(v.w, 1000);
    close(v.h, (2000 / 500) * 1000);
    close(v.x, 0);
    close(v.y, (1400 - v.h) / 2);
  });
});

describe("zoomAt", () => {
  const base: View = fitView(1000, 1400, 800, 600);

  it("keeps the point under the cursor fixed", () => {
    const px = 200, py = 150;
    const before = {
      x: base.x + (px / 800) * base.w,
      y: base.y + (py / 600) * base.h,
    };
    const v = zoomAt(base, base, px, py, 2, 800, 600);
    close(v.x + (px / 800) * v.w, before.x);
    close(v.y + (py / 600) * v.h, before.y);
    close(base.w / v.w, 2);
  });

  it("never zooms in past MAX_ZOOM", () => {
    let v = base;
    for (let i = 0; i < 20; i++) v = zoomAt(v, base, 400, 300, 2, 800, 600);
    close(base.w / v.w, MAX_ZOOM);
  });

  it("never zooms out past the base view", () => {
    const v = zoomAt(base, base, 400, 300, 0.5, 800, 600);
    expect(v).toEqual(base);
  });
});

describe("panBy", () => {
  const base: View = fitView(1000, 1400, 800, 600);

  it("does nothing at 1x (view already covers the base)", () => {
    expect(panBy(base, base, 100, 100, 800)).toEqual(base);
  });

  it("moves opposite to cursor delta when zoomed in", () => {
    const zoomed = zoomAt(base, base, 400, 300, 4, 800, 600);
    const panned = panBy(zoomed, base, -100, 0, 800);
    const unitsPerPx = zoomed.w / 800;
    close(panned.x, zoomed.x + 100 * unitsPerPx);
    close(panned.y, zoomed.y);
  });

  it("clamps at the base view edges", () => {
    const zoomed = zoomAt(base, base, 400, 300, 4, 800, 600);
    const panned = panBy(zoomed, base, 1e9, 1e9, 800);
    close(panned.x, base.x);
    close(panned.y, base.y);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL - cannot resolve `../src/view`.

- [ ] **Step 3: Write src/view.ts**

```ts
export interface View {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const MAX_ZOOM = 8;

/** Smallest view that covers the whole map, centered, with the viewport's aspect. */
export function fitView(mapW: number, mapH: number, vpW: number, vpH: number): View {
  const unitsPerPx = Math.max(mapW / vpW, mapH / vpH);
  const w = vpW * unitsPerPx;
  const h = vpH * unitsPerPx;
  return { x: (mapW - w) / 2, y: (mapH - h) / 2, w, h };
}

/** Clamp zoom to [1x, MAX_ZOOM] relative to base and keep the view inside base. */
export function clampView(view: View, base: View): View {
  const w = Math.min(Math.max(view.w, base.w / MAX_ZOOM), base.w);
  const h = w * (base.h / base.w);
  const x = Math.min(Math.max(view.x, base.x), base.x + base.w - w);
  const y = Math.min(Math.max(view.y, base.y), base.y + base.h - h);
  return { x, y, w, h };
}

export function panBy(view: View, base: View, dxPx: number, dyPx: number, vpW: number): View {
  const unitsPerPx = view.w / vpW;
  return clampView(
    { ...view, x: view.x - dxPx * unitsPerPx, y: view.y - dyPx * unitsPerPx },
    base,
  );
}

/** factor > 1 zooms in; (px, py) is the cursor position in viewport pixels. */
export function zoomAt(
  view: View,
  base: View,
  px: number,
  py: number,
  factor: number,
  vpW: number,
  vpH: number,
): View {
  const cx = view.x + (px / vpW) * view.w;
  const cy = view.y + (py / vpH) * view.h;
  const w = view.w / factor;
  const h = view.h / factor;
  return clampView(
    { x: cx - (px / vpW) * w, y: cy - (py / vpH) * h, w, h },
    base,
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: all view tests PASS.

- [ ] **Step 5: Commit**

```bash
git add 02-balticmap/src/view.ts 02-balticmap/tests/view.test.ts
git commit -m "feat(balticmap): viewBox math for pan and cursor-centered zoom"
```

---

### Task 4: Selection state (pure logic)

**Files:**
- Create: `02-balticmap/src/state.ts`
- Test: `02-balticmap/tests/state.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `SelectionState { hovered: string | null; selected: string | null }`, `initialState`, `withHover(state, id): SelectionState`, `withClick(state, id): SelectionState`. Click semantics: clicking `null` (background) or the currently selected id deselects; clicking any other id selects it. Task 6 uses these.

- [ ] **Step 1: Write the failing tests tests/state.test.ts**

```ts
import { describe, it, expect } from "vitest";
import { initialState, withHover, withClick } from "../src/state";

describe("selection state", () => {
  it("starts empty", () => {
    expect(initialState).toEqual({ hovered: null, selected: null });
  });

  it("tracks hover without touching selection", () => {
    const s = withHover(withClick(initialState, "LV003"), "EE001");
    expect(s).toEqual({ hovered: "EE001", selected: "LV003" });
    expect(withHover(s, null).hovered).toBeNull();
  });

  it("click selects, clicking another region switches", () => {
    const a = withClick(initialState, "LV003");
    expect(a.selected).toBe("LV003");
    expect(withClick(a, "LT001").selected).toBe("LT001");
  });

  it("clicking the selected region or the background deselects", () => {
    const a = withClick(initialState, "LV003");
    expect(withClick(a, "LV003").selected).toBeNull();
    expect(withClick(a, null).selected).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL - cannot resolve `../src/state`.

- [ ] **Step 3: Write src/state.ts**

```ts
export interface SelectionState {
  hovered: string | null;
  selected: string | null;
}

export const initialState: SelectionState = { hovered: null, selected: null };

export function withHover(state: SelectionState, id: string | null): SelectionState {
  return { ...state, hovered: id };
}

/** Clicking the background (null) or the already-selected region deselects. */
export function withClick(state: SelectionState, id: string | null): SelectionState {
  return { ...state, selected: id === null || id === state.selected ? null : id };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: all state tests PASS.

- [ ] **Step 5: Commit**

```bash
git add 02-balticmap/src/state.ts 02-balticmap/tests/state.test.ts
git commit -m "feat(balticmap): selection state reducers"
```

---

### Task 5: Map rendering and styles

**Files:**
- Create: `02-balticmap/src/map-render.ts`
- Modify: `02-balticmap/src/style.css` (replace stub with full styles)
- Test: `02-balticmap/tests/render.test.ts`

**Interfaces:**
- Consumes: `MapData`, `Region` from `src/types.ts` (Task 2).
- Produces: `RenderResult { svg: SVGSVGElement; regionPaths: Map<string, SVGPathElement> }` and `renderMap(data: MapData, container: HTMLElement): RenderResult`. Region `<path>` elements carry `data-id="<NUTS id>"` and class `region`. Task 6 attaches events to `svg` and `regionPaths`; Task 7 (main) calls `renderMap`. Also exports `regionFill(country: string, indexInCountry: number): string` for tests.

- [ ] **Step 1: Write the failing tests tests/render.test.ts**

```ts
// @vitest-environment happy-dom
import { describe, it, expect } from "vitest";
import { renderMap, regionFill } from "../src/map-render";
import type { MapData } from "../src/types";
import raw from "../src/data/map.json";

const data = raw as MapData;

describe("renderMap", () => {
  it("renders one path per region with data-id, fill, and class", () => {
    const container = document.createElement("div");
    const { svg, regionPaths } = renderMap(data, container);
    expect(container.contains(svg)).toBe(true);
    const paths = svg.querySelectorAll("path.region");
    expect(paths.length).toBe(21);
    expect(regionPaths.size).toBe(21);
    const kurzeme = regionPaths.get("LV003")!;
    expect(kurzeme.getAttribute("data-id")).toBe("LV003");
    expect(kurzeme.getAttribute("fill")).toBe(regionFill("LV", 0));
  });

  it("renders neighbors beneath regions and country labels", () => {
    const container = document.createElement("div");
    const { svg } = renderMap(data, container);
    expect(svg.querySelectorAll("path.neighbor").length).toBe(data.neighbors.length);
    const labels = Array.from(svg.querySelectorAll("text.country-label"));
    expect(labels.map((l) => l.textContent).sort()).toEqual([
      "ESTONIA", "LATVIA", "LITHUANIA",
    ]);
    // neighbors group comes before regions group in document order
    const groups = Array.from(svg.querySelectorAll("g"));
    const neighborIdx = groups.findIndex((g) => g.classList.contains("neighbors"));
    const regionIdx = groups.findIndex((g) => g.classList.contains("regions"));
    expect(neighborIdx).toBeGreaterThanOrEqual(0);
    expect(neighborIdx).toBeLessThan(regionIdx);
  });

  it("adds the attribution line to the container", () => {
    const container = document.createElement("div");
    renderMap(data, container);
    expect(container.querySelector(".attribution")!.textContent).toBe(
      data.attribution,
    );
  });

  it("assigns distinct fills within a country", () => {
    const lt = Array.from({ length: 10 }, (_, i) => regionFill("LT", i));
    expect(new Set(lt).size).toBe(10);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL - cannot resolve `../src/map-render`.

- [ ] **Step 3: Write src/map-render.ts**

```ts
import type { MapData } from "./types";

export interface RenderResult {
  svg: SVGSVGElement;
  regionPaths: Map<string, SVGPathElement>;
}

const SVG_NS = "http://www.w3.org/2000/svg";

// Pastel palettes echoing the Nordregio original: EE greens, LV oranges, LT tans.
const PALETTES: Record<string, string[]> = {
  EE: ["#b8cf9b", "#dde3c0", "#9fbf7f", "#e9ead2", "#c9d8a8"],
  LV: ["#e5b28e", "#f0cbb0", "#d99b72", "#f6dfcb", "#e0a67f", "#c98a5e"],
  LT: [
    "#d8c294", "#e6d5b0", "#c9b17f", "#efe3c5", "#bfa571",
    "#e0cda2", "#d2ba89", "#ecdbb8", "#c6ac7c", "#dbc79b",
  ],
};

export function regionFill(country: string, indexInCountry: number): string {
  const palette = PALETTES[country] ?? ["#cccccc"];
  return palette[indexInCountry % palette.length];
}

function el<K extends string>(name: K): SVGElement {
  return document.createElementNS(SVG_NS, name) as SVGElement;
}

export function renderMap(data: MapData, container: HTMLElement): RenderResult {
  const svg = el("svg") as SVGSVGElement;
  svg.classList.add("map");
  svg.setAttribute("viewBox", `0 0 ${data.width} ${data.height}`);
  svg.setAttribute("preserveAspectRatio", "xMidYMid slice");

  const sea = el("rect");
  sea.classList.add("sea");
  sea.setAttribute("x", "0");
  sea.setAttribute("y", "0");
  sea.setAttribute("width", String(data.width));
  sea.setAttribute("height", String(data.height));
  svg.appendChild(sea);

  const neighborsGroup = el("g");
  neighborsGroup.classList.add("neighbors");
  for (const n of data.neighbors) {
    const p = el("path");
    p.classList.add("neighbor");
    p.setAttribute("d", n.path);
    neighborsGroup.appendChild(p);
  }
  svg.appendChild(neighborsGroup);

  const regionsGroup = el("g");
  regionsGroup.classList.add("regions");
  const regionPaths = new Map<string, SVGPathElement>();
  const countryCounters: Record<string, number> = {};
  for (const r of data.regions) {
    const index = countryCounters[r.country] ?? 0;
    countryCounters[r.country] = index + 1;
    const p = el("path") as SVGPathElement;
    p.classList.add("region");
    p.setAttribute("d", r.path);
    p.setAttribute("data-id", r.id);
    p.setAttribute("fill", regionFill(r.country, index));
    regionsGroup.appendChild(p);
    regionPaths.set(r.id, p);
  }
  svg.appendChild(regionsGroup);

  const labelsGroup = el("g");
  labelsGroup.classList.add("labels");
  for (const l of data.labels) {
    const t = el("text");
    t.classList.add("country-label");
    t.setAttribute("x", String(l.x));
    t.setAttribute("y", String(l.y));
    t.textContent = l.text;
    labelsGroup.appendChild(t);
  }
  svg.appendChild(labelsGroup);

  container.appendChild(svg);

  const attribution = document.createElement("div");
  attribution.className = "attribution";
  attribution.textContent = data.attribution;
  container.appendChild(attribution);

  return { svg, regionPaths };
}
```

- [ ] **Step 4: Replace src/style.css with the full styles**

```css
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

html,
body,
#app {
  height: 100%;
  overflow: hidden;
  font-family: system-ui, -apple-system, sans-serif;
}

#app {
  position: relative;
}

svg.map {
  display: block;
  width: 100%;
  height: 100%;
  touch-action: none;
  cursor: grab;
}

svg.map.dragging {
  cursor: grabbing;
}

.sea {
  fill: #e8eef2;
}

.neighbor {
  fill: #d9d9d9;
  stroke: #c0c0c0;
  stroke-width: 0.5;
}

.region {
  stroke: #7a6a55;
  stroke-width: 0.8;
  transition: filter 120ms ease;
}

.region.hovered {
  filter: brightness(1.09);
  stroke: #3f3428;
  stroke-width: 1.4;
}

.region.selected {
  stroke: #1d4ed8;
  stroke-width: 2;
  filter: brightness(1.05);
}

.country-label {
  font-size: 30px;
  font-weight: 600;
  letter-spacing: 0.35em;
  fill: #6f6250;
  text-anchor: middle;
  pointer-events: none;
  text-transform: uppercase;
  opacity: 0.75;
}

.tooltip {
  position: fixed;
  background: rgba(30, 30, 30, 0.85);
  color: #fff;
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 13px;
  pointer-events: none;
  z-index: 10;
}

.panel {
  position: absolute;
  top: 16px;
  right: 16px;
  width: 260px;
  background: #fff;
  border: 1px solid #d0d0d0;
  border-radius: 8px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12);
  padding: 16px;
  z-index: 5;
}

.panel-close {
  position: absolute;
  top: 8px;
  right: 8px;
  border: none;
  background: none;
  font-size: 16px;
  cursor: pointer;
  color: #666;
}

.panel-name {
  font-size: 18px;
  margin-bottom: 2px;
  padding-right: 20px;
}

.panel-country {
  font-size: 13px;
  color: #777;
  margin-bottom: 12px;
}

.panel-fields div {
  display: flex;
  justify-content: space-between;
  padding: 6px 0;
  border-top: 1px solid #eee;
  font-size: 13px;
}

.panel-fields dt {
  color: #555;
}

.panel-fields dd {
  color: #999;
}

.attribution {
  position: absolute;
  bottom: 6px;
  left: 8px;
  font-size: 11px;
  color: #8a8a8a;
  z-index: 5;
  pointer-events: none;
}

.hidden {
  display: none;
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test`
Expected: all render tests PASS.

- [ ] **Step 6: Commit**

```bash
git add 02-balticmap/src/map-render.ts 02-balticmap/src/style.css 02-balticmap/tests/render.test.ts
git commit -m "feat(balticmap): SVG map rendering with per-country pastel palettes"
```

---

### Task 6: Panel and tooltip

**Files:**
- Create: `02-balticmap/src/panel.ts`
- Test: `02-balticmap/tests/panel.test.ts`

**Interfaces:**
- Consumes: `Region` from `src/types.ts` (Task 2).
- Produces: `Panel { show(region: Region): void; hide(): void }`, `createPanel(container: HTMLElement, onClose: () => void): Panel`, `Tooltip { show(text: string, clientX: number, clientY: number): void; hide(): void }`, `createTooltip(container: HTMLElement): Tooltip`. Task 7 (main) wires these to interaction callbacks.

- [ ] **Step 1: Write the failing tests tests/panel.test.ts**

```ts
// @vitest-environment happy-dom
import { describe, it, expect, vi } from "vitest";
import { createPanel, createTooltip } from "../src/panel";
import type { Region } from "../src/types";

const kurzeme: Region = { id: "LV003", name: "Kurzeme", country: "LV", path: "M0 0Z" };

describe("panel", () => {
  it("is hidden initially, shows region details on show()", () => {
    const container = document.createElement("div");
    const panel = createPanel(container, () => {});
    const root = container.querySelector(".panel")!;
    expect(root.classList.contains("hidden")).toBe(true);

    panel.show(kurzeme);
    expect(root.classList.contains("hidden")).toBe(false);
    expect(container.querySelector(".panel-name")!.textContent).toBe("Kurzeme");
    expect(container.querySelector(".panel-country")!.textContent).toBe("Latvia");
    const fields = Array.from(container.querySelectorAll(".panel-fields dt"));
    expect(fields.map((f) => f.textContent)).toEqual([
      "Population", "Area", "GDP per capita",
    ]);

    panel.hide();
    expect(root.classList.contains("hidden")).toBe(true);
  });

  it("invokes onClose when the close button is clicked", () => {
    const container = document.createElement("div");
    const onClose = vi.fn();
    const panel = createPanel(container, onClose);
    panel.show(kurzeme);
    (container.querySelector(".panel-close") as HTMLButtonElement).click();
    expect(onClose).toHaveBeenCalledOnce();
  });
});

describe("tooltip", () => {
  it("shows text near the cursor and hides", () => {
    const container = document.createElement("div");
    const tooltip = createTooltip(container);
    const el = container.querySelector(".tooltip") as HTMLElement;
    expect(el.classList.contains("hidden")).toBe(true);

    tooltip.show("Kurzeme", 100, 200);
    expect(el.classList.contains("hidden")).toBe(false);
    expect(el.textContent).toBe("Kurzeme");
    expect(el.style.left).toBe("112px");
    expect(el.style.top).toBe("212px");

    tooltip.hide();
    expect(el.classList.contains("hidden")).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL - cannot resolve `../src/panel`.

- [ ] **Step 3: Write src/panel.ts**

```ts
import type { Region } from "./types";

const COUNTRY_NAMES: Record<string, string> = {
  EE: "Estonia",
  LV: "Latvia",
  LT: "Lithuania",
};

const PLACEHOLDER_FIELDS = ["Population", "Area", "GDP per capita"];

export interface Panel {
  show(region: Region): void;
  hide(): void;
}

export function createPanel(container: HTMLElement, onClose: () => void): Panel {
  const root = document.createElement("aside");
  root.className = "panel hidden";

  const close = document.createElement("button");
  close.className = "panel-close";
  close.setAttribute("aria-label", "Close");
  close.textContent = "x";
  close.addEventListener("click", onClose);

  const name = document.createElement("h2");
  name.className = "panel-name";
  const country = document.createElement("p");
  country.className = "panel-country";
  const fields = document.createElement("dl");
  fields.className = "panel-fields";

  root.append(close, name, country, fields);
  container.appendChild(root);

  return {
    show(region) {
      name.textContent = region.name;
      country.textContent = COUNTRY_NAMES[region.country] ?? region.country;
      fields.textContent = "";
      for (const label of PLACEHOLDER_FIELDS) {
        const row = document.createElement("div");
        const dt = document.createElement("dt");
        dt.textContent = label;
        const dd = document.createElement("dd");
        dd.textContent = "(placeholder)";
        row.append(dt, dd);
        fields.appendChild(row);
      }
      root.classList.remove("hidden");
    },
    hide() {
      root.classList.add("hidden");
    },
  };
}

export interface Tooltip {
  show(text: string, clientX: number, clientY: number): void;
  hide(): void;
}

export function createTooltip(container: HTMLElement): Tooltip {
  const el = document.createElement("div");
  el.className = "tooltip hidden";
  container.appendChild(el);
  return {
    show(text, clientX, clientY) {
      el.textContent = text;
      el.style.left = `${clientX + 12}px`;
      el.style.top = `${clientY + 12}px`;
      el.classList.remove("hidden");
    },
    hide() {
      el.classList.add("hidden");
    },
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: all panel/tooltip tests PASS.

- [ ] **Step 5: Commit**

```bash
git add 02-balticmap/src/panel.ts 02-balticmap/tests/panel.test.ts
git commit -m "feat(balticmap): info panel and hover tooltip"
```

---

### Task 7: Interaction wiring and main entry

**Files:**
- Create: `02-balticmap/src/interaction.ts`
- Modify: `02-balticmap/src/main.ts` (replace stub)
- Test: `02-balticmap/tests/interaction.test.ts`

**Interfaces:**
- Consumes: `fitView/clampView/panBy/zoomAt/View/MAX_ZOOM` (Task 3), `initialState/withHover/withClick` (Task 4), `renderMap` result shape (Task 5), `MapData/Region` (Task 2).
- Produces: `InteractionCallbacks { onHover(region: Region | null, clientX: number, clientY: number): void; onSelect(region: Region | null): void }` and `attachInteraction(svg, regionPaths, data, cb): { deselect(): void }`. `main.ts` is the composition root.

Notes for the implementer:
- happy-dom lacks `PointerEvent`; dispatch `MouseEvent` instances with pointer event type names (listeners match on type string).
- `svg.clientWidth/clientHeight` are 0 in happy-dom; the code falls back to `data.width/data.height`, which the tests rely on.
- Wheel zoom is exercised end-to-end in Chrome (Task 9), not unit-tested.

- [ ] **Step 1: Write the failing tests tests/interaction.test.ts**

```ts
// @vitest-environment happy-dom
import { describe, it, expect, vi } from "vitest";
import { renderMap } from "../src/map-render";
import { attachInteraction } from "../src/interaction";
import type { MapData } from "../src/types";
import raw from "../src/data/map.json";

const data = raw as MapData;

function setup() {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const { svg, regionPaths } = renderMap(data, container);
  const onHover = vi.fn();
  const onSelect = vi.fn();
  const handle = attachInteraction(svg, regionPaths, data, { onHover, onSelect });
  return { svg, regionPaths, onHover, onSelect, handle };
}

const mouse = (type: string, init: MouseEventInit = {}) =>
  new MouseEvent(type, { bubbles: true, ...init });

describe("attachInteraction", () => {
  it("sets the initial viewBox to a view covering the map", () => {
    const { svg } = setup();
    const [x, y, w, h] = svg.getAttribute("viewBox")!.split(" ").map(Number);
    expect(w).toBeGreaterThanOrEqual(data.width);
    expect(h).toBeGreaterThanOrEqual(data.height);
    expect(x).toBeLessThanOrEqual(0);
    expect(y).toBeLessThanOrEqual(0);
  });

  it("hover toggles the hovered class and fires onHover", () => {
    const { regionPaths, onHover } = setup();
    const el = regionPaths.get("LV003")!;
    el.dispatchEvent(mouse("pointerenter", { clientX: 5, clientY: 7 }));
    expect(el.classList.contains("hovered")).toBe(true);
    expect(onHover).toHaveBeenLastCalledWith(
      expect.objectContaining({ id: "LV003", name: "Kurzeme" }), 5, 7,
    );
    el.dispatchEvent(mouse("pointerleave"));
    expect(el.classList.contains("hovered")).toBe(false);
    expect(onHover).toHaveBeenLastCalledWith(null, 0, 0);
  });

  it("click on a region selects it; clicking again deselects", () => {
    const { regionPaths, onSelect } = setup();
    const el = regionPaths.get("LT001")!;
    el.dispatchEvent(mouse("pointerdown", { clientX: 10, clientY: 10 }));
    el.dispatchEvent(mouse("pointerup", { clientX: 10, clientY: 10 }));
    expect(el.classList.contains("selected")).toBe(true);
    expect(onSelect).toHaveBeenLastCalledWith(
      expect.objectContaining({ id: "LT001" }),
    );
    el.dispatchEvent(mouse("pointerdown", { clientX: 10, clientY: 10 }));
    el.dispatchEvent(mouse("pointerup", { clientX: 10, clientY: 10 }));
    expect(el.classList.contains("selected")).toBe(false);
    expect(onSelect).toHaveBeenLastCalledWith(null);
  });

  it("a drag beyond the threshold pans and does not select", () => {
    const { svg, regionPaths, onSelect } = setup();
    const el = regionPaths.get("EE001")!;
    const before = svg.getAttribute("viewBox");
    el.dispatchEvent(mouse("pointerdown", { clientX: 100, clientY: 100 }));
    el.dispatchEvent(mouse("pointermove", { clientX: 160, clientY: 100 }));
    el.dispatchEvent(mouse("pointerup", { clientX: 160, clientY: 100 }));
    expect(onSelect).not.toHaveBeenCalled();
    // at 1x the pan is clamped back, so the viewBox may be unchanged,
    // but selection must not fire; dragging is the observable contract here
    expect(svg.getAttribute("viewBox")).toBe(before);
  });

  it("deselect() clears the selection and fires onSelect(null)", () => {
    const { regionPaths, onSelect, handle } = setup();
    const el = regionPaths.get("LV006")!;
    el.dispatchEvent(mouse("pointerdown", { clientX: 10, clientY: 10 }));
    el.dispatchEvent(mouse("pointerup", { clientX: 10, clientY: 10 }));
    expect(el.classList.contains("selected")).toBe(true);
    handle.deselect();
    expect(el.classList.contains("selected")).toBe(false);
    expect(onSelect).toHaveBeenLastCalledWith(null);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL - cannot resolve `../src/interaction`.

- [ ] **Step 3: Write src/interaction.ts**

```ts
import type { MapData, Region } from "./types";
import { fitView, clampView, panBy, zoomAt, type View } from "./view";
import { initialState, withHover, withClick, type SelectionState } from "./state";

export interface InteractionCallbacks {
  onHover(region: Region | null, clientX: number, clientY: number): void;
  onSelect(region: Region | null): void;
}

export interface InteractionHandle {
  deselect(): void;
}

const DRAG_THRESHOLD_PX = 5;
const WHEEL_ZOOM_BASE = 1.0015;

export function attachInteraction(
  svg: SVGSVGElement,
  regionPaths: Map<string, SVGPathElement>,
  data: MapData,
  cb: InteractionCallbacks,
): InteractionHandle {
  const byId = new Map(data.regions.map((r) => [r.id, r]));
  let state: SelectionState = initialState;

  const vpW = () => svg.clientWidth || data.width;
  const vpH = () => svg.clientHeight || data.height;

  let base: View = fitView(data.width, data.height, vpW(), vpH());
  let view: View = base;

  function apply(): void {
    svg.setAttribute("viewBox", `${view.x} ${view.y} ${view.w} ${view.h}`);
  }
  apply();

  window.addEventListener("resize", () => {
    base = fitView(data.width, data.height, vpW(), vpH());
    view = clampView(view, base);
    apply();
  });

  function applySelection(): void {
    for (const [id, el] of regionPaths) {
      el.classList.toggle("selected", id === state.selected);
    }
    cb.onSelect(state.selected ? byId.get(state.selected)! : null);
  }

  for (const [id, el] of regionPaths) {
    el.addEventListener("pointerenter", (e) => {
      state = withHover(state, id);
      el.classList.add("hovered");
      const me = e as MouseEvent;
      cb.onHover(byId.get(id)!, me.clientX, me.clientY);
    });
    el.addEventListener("pointerleave", () => {
      state = withHover(state, null);
      el.classList.remove("hovered");
      cb.onHover(null, 0, 0);
    });
  }

  let down: { x: number; y: number } | null = null;
  let dragged = false;

  svg.addEventListener("pointerdown", (e) => {
    const me = e as MouseEvent;
    down = { x: me.clientX, y: me.clientY };
    dragged = false;
  });

  svg.addEventListener("pointermove", (e) => {
    if (!down) return;
    const me = e as MouseEvent;
    const dx = me.clientX - down.x;
    const dy = me.clientY - down.y;
    if (!dragged && Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return;
    dragged = true;
    svg.classList.add("dragging");
    view = panBy(view, base, dx, dy, vpW());
    down = { x: me.clientX, y: me.clientY };
    apply();
  });

  svg.addEventListener("pointerup", (e) => {
    const wasDrag = dragged;
    down = null;
    dragged = false;
    svg.classList.remove("dragging");
    if (wasDrag) return;
    const target = (e.target as Element).closest?.("[data-id]") ?? null;
    state = withClick(state, target?.getAttribute("data-id") ?? null);
    applySelection();
  });

  svg.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
      const rect = svg.getBoundingClientRect();
      const factor = Math.pow(WHEEL_ZOOM_BASE, -e.deltaY);
      view = zoomAt(
        view, base,
        e.clientX - rect.left, e.clientY - rect.top,
        factor, vpW(), vpH(),
      );
      apply();
    },
    { passive: false },
  );

  return {
    deselect() {
      state = withClick(state, state.selected);
      applySelection();
    },
  };
}
```

- [ ] **Step 4: Replace src/main.ts**

```ts
import rawData from "./data/map.json";
import type { MapData } from "./types";
import { renderMap } from "./map-render";
import { createPanel, createTooltip } from "./panel";
import { attachInteraction } from "./interaction";
import "./style.css";

const data = rawData as MapData;
const app = document.getElementById("app")!;

const { svg, regionPaths } = renderMap(data, app);
const tooltip = createTooltip(app);
const panel = createPanel(app, () => interaction.deselect());

const interaction = attachInteraction(svg, regionPaths, data, {
  onHover(region, clientX, clientY) {
    if (region) tooltip.show(region.name, clientX, clientY);
    else tooltip.hide();
  },
  onSelect(region) {
    if (region) panel.show(region);
    else panel.hide();
  },
});
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test`
Expected: ALL tests in the project PASS (smoke, data, view, state, render, panel, interaction).

- [ ] **Step 6: Verify the full build**

Run: `npm run build`
Expected: tsc clean, vite build succeeds.

- [ ] **Step 7: Commit**

```bash
git add 02-balticmap/src/interaction.ts 02-balticmap/src/main.ts 02-balticmap/tests/interaction.test.ts
git commit -m "feat(balticmap): pointer interaction wiring and app entry point"
```

---

### Task 8: GitHub Pages deployment for both prototypes

**Files:**
- Create: `.github/workflows/pages.yml` (repo root)
- Create: `.github/pages-index.html` (repo root)
- Modify: `01-escapecastle/vite.config.ts` (base `/prototypes/` -> `/prototypes/01/`)

**Interfaces:**
- Consumes: working `npm run build` in both `01-escapecastle/` and `02-balticmap/`.
- Produces: a Pages deployment publishing `01-escapecastle/dist` at `/prototypes/01/`, `02-balticmap/dist` at `/prototypes/02/`, and an index at `/prototypes/`.

- [ ] **Step 1: Update 01-escapecastle/vite.config.ts**

```ts
import { defineConfig } from "vite";

export default defineConfig({
  base: "/prototypes/01/",
});
```

- [ ] **Step 2: Write .github/pages-index.html**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>Prototypes</title>
    <style>
      body { font-family: system-ui, sans-serif; max-width: 600px; margin: 60px auto; padding: 0 20px; }
      li { margin: 8px 0; }
    </style>
  </head>
  <body>
    <h1>Prototypes</h1>
    <ul>
      <li><a href="./01/">01 - Escape Castle</a></li>
      <li><a href="./02/">02 - Baltic Map</a></li>
    </ul>
  </body>
</html>
```

- [ ] **Step 3: Write .github/workflows/pages.yml**

```yaml
name: Deploy prototypes to GitHub Pages

on:
  push:
    branches: [main]
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: true

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
      - name: Build escapecastle
        working-directory: 01-escapecastle
        run: |
          npm ci
          npm run build
      - name: Build balticmap
        working-directory: 02-balticmap
        run: |
          npm ci
          npm run build
      - name: Assemble site
        run: |
          mkdir -p _site/01 _site/02
          cp -R 01-escapecastle/dist/. _site/01/
          cp -R 02-balticmap/dist/. _site/02/
          cp .github/pages-index.html _site/index.html
      - uses: actions/upload-pages-artifact@v3
        with:
          path: _site

  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - id: deployment
        uses: actions/deploy-pages@v4
```

- [ ] **Step 4: Verify both projects still build locally**

Run (repo root): `cd 01-escapecastle && npm run build && cd ../02-balticmap && npm run build`
Expected: both succeed. (escapecastle runs ink compile + tsc + vite.)

- [ ] **Step 5: Commit**

```bash
git add .github 01-escapecastle/vite.config.ts
git commit -m "feat: GitHub Pages workflow deploying prototypes at /01/ and /02/"
```

Note for the final report (manual, outside this plan): the repo owner must set Pages source to "GitHub Actions" in the GitHub repo settings once, and the workflow only runs after push.

---

### Task 9: End-to-end visual verification in Chrome

This task is performed by the orchestrator session itself (it needs the Chrome automation tools), not a subagent.

**Files:**
- No file changes expected; fix-up commits allowed if defects are found.

**Interfaces:**
- Consumes: the built app from Tasks 1-7.

- [ ] **Step 1: Serve the production build**

Run in `02-balticmap/`: `npm run build && npm run preview` (background)
Expected: preview server on `http://127.0.0.1:4173/prototypes/02/`.

- [ ] **Step 2: Load and screenshot the initial view**

Open `http://127.0.0.1:4173/prototypes/02/` in Chrome (chrome-devtools MCP: `new_page`, then `take_screenshot`).
Expected: sea-blue background, grey neighbor countries, 21 pastel regions (greens north, oranges middle, tans south), ESTONIA/LATVIA/LITHUANIA labels, attribution line bottom-left. No console errors (`list_console_messages`).

- [ ] **Step 3: Hover a region**

Get the center of `path[data-id="LV003"]` via `evaluate_script` (getBoundingClientRect), `hover` at that point, screenshot.
Expected: Kurzeme brightens with darker outline; tooltip "Kurzeme" near cursor.

- [ ] **Step 4: Click to select and inspect the panel**

`click` at the same point, screenshot.
Expected: Kurzeme gets a blue selection outline; panel top-right shows "Kurzeme", "Latvia", and rows Population / Area / GDP per capita with "(placeholder)".

- [ ] **Step 5: Deselect via close button**

`click` on `.panel-close`.
Expected: panel disappears, region outline back to normal.

- [ ] **Step 6: Zoom and pan**

Dispatch two wheel events (deltaY -600) at the map center via `evaluate_script`, screenshot; then `drag` from map center 200px right, screenshot.
Expected: map visibly zoomed in around the cursor with crisp (non-pixelated) boundaries; drag shifts the visible area; viewBox attribute changes accordingly; zooming out past 1x returns to the fitted view.

- [ ] **Step 7: Record defects and fix**

Any defect found: fix in source, re-run `npm test`, rebuild, re-verify the failing step, commit with message `fix(balticmap): <what>`.
