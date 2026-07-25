# Anno 1184 Re-theme Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Re-theme the interactive Baltic map from 21 modern NUTS-3 regions to 15 lands of the eastern Baltic in 1184 AD, colored by 9 peoples, with period labels, an "Anno Domini 1184" title, and a period info panel.

**Architecture:** The build-time data script (`scripts/prepare-data.mjs`) gains a LANDS config that merges NUTS features (topojson topology + merge, so shared borders dissolve), renames them, and attaches peoples/flavor/places; it emits a new `map.json` schema. The runtime app (no framework) is updated to fill by people color, render new label kinds, and show period panel content. Interaction (hover/click/pan/zoom) is untouched.

**Tech Stack:** Vite + TypeScript, vitest + happy-dom, d3-geo, topojson-server + topojson-client (devDeps, build-time only). Runtime stays dependency-free.

**Spec:** `docs/superpowers/specs/2026-07-25-balticmap-1184-retheme-design.md`

## Global Constraints

- Region ids are slugs (e.g. `talava`), not NUTS codes; NUTS provenance lives only in the prepare script config.
- Display names carry proper diacritics (Tālava, Žemaitija, Sūduva, Läänemaa-Saaremaa). Compound names use a plain hyphen "-", never an em dash.
- Colors encode PEOPLES (ethnocultural groups), never polities. Panel copy phrases peoples as predominance ("Predominantly X, with Y").
- 15 regions, 9 peoples (Selonians color no polygon - intentional).
- Attribution string stays exactly: `(c) EuroGeographics for the administrative boundaries` (shapes still derive from GISCO).
- `npm test` must pass at the end of Tasks 2 and 3; Task 1 leaves render/panel/interaction tests red by design (schema change lands before renderer update) - only `tests/data.test.ts` must be green there.
- Known deviations from spec (approved): no "Swedish lands" label (SE is not on the canvas at all - verified); label kinds extended with `people-minor` (smaller SELONIANS label) and `subtitle`.

## Deviation & escalation protocol

If reality contradicts this plan (a command fails, a projected label lands off-canvas and cannot be nudged inside within ~0.5 degrees, topojson merge produces empty geometry), STOP and report back rather than inventing a workaround. Small coordinate nudges to label lon/lat are allowed without escalation; schema changes are not.

---

### Task 1: Data pipeline - lands, peoples, labels, new map.json

**Files:**
- Modify: `tests/data.test.ts` (full rewrite)
- Modify: `src/types.ts` (full rewrite)
- Modify: `scripts/prepare-data.mjs` (full rewrite)
- Modify: `package.json` (add topojson devDeps via npm install)
- Regenerate: `src/data/map.json` (committed output)

**Interfaces:**
- Consumes: GISCO GeoJSON URLs (unchanged from current script).
- Produces: `map.json` schema `{ width, height, attribution, year, peoples: People[], regions: Region[], neighbors: Neighbor[], labels: MapLabel[] }` and the matching TypeScript types below. Later tasks rely on: `Region { id, name, peoples: string[], flavor: string, places: string[], path }`, `People { id, name, color }`, `MapLabel { text, x, y, kind: "people" | "people-minor" | "neighbor" | "title" | "subtitle" }`.

- [ ] **Step 1: Create the feature branch**

```bash
git checkout -b feature/anno-1184
```

- [ ] **Step 2: Rewrite the data test to the new schema**

Replace the entire contents of `tests/data.test.ts` with:

```typescript
import { describe, it, expect } from "vitest";
import type { MapData } from "../src/types";
import raw from "../src/data/map.json";

const data = raw as MapData;

const EXPECTED_IDS = [
  "aukstaitija", "dainava", "jarvamaa", "jersika", "kursa",
  "laanemaa-saaremaa", "livzeme", "pilsotas", "ravala", "suduva",
  "talava", "ugandi-sakala", "virumaa", "zemaitija", "zemgale-selija",
];

const EXPECTED_PEOPLE_IDS = [
  "aukstaitians", "curonians", "estonians", "latgalians", "livs",
  "samogitians", "selonians", "semigallians", "yotvingians",
];

describe("map.json (anno 1184)", () => {
  it("has canvas bounds, year, and attribution", () => {
    expect(data.width).toBe(1000);
    expect(data.height).toBe(1400);
    expect(data.year).toBe(1184);
    expect(data.attribution).toBe(
      "(c) EuroGeographics for the administrative boundaries",
    );
  });

  it("contains exactly the 15 lands, sorted by id", () => {
    expect(data.regions.map((r) => r.id)).toEqual(EXPECTED_IDS);
  });

  it("has exactly 9 peoples with names and hex colors", () => {
    expect(data.peoples.map((p) => p.id).sort()).toEqual(EXPECTED_PEOPLE_IDS);
    for (const p of data.peoples) {
      expect(p.name.length).toBeGreaterThan(0);
      expect(p.color).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  it("every region resolves peoples, has flavor, places, and path data", () => {
    const peopleIds = new Set(data.peoples.map((p) => p.id));
    for (const r of data.regions) {
      expect(r.name.length).toBeGreaterThan(0);
      expect(r.peoples.length).toBeGreaterThan(0);
      for (const pid of r.peoples) expect(peopleIds.has(pid)).toBe(true);
      expect(r.flavor.length).toBeGreaterThan(20);
      expect(r.places.length).toBeGreaterThan(0);
      expect(r.path.startsWith("M")).toBe(true);
    }
  });

  it("uses compound names and diacritics where the spec requires", () => {
    const byId = new Map(data.regions.map((r) => [r.id, r.name]));
    expect(byId.get("laanemaa-saaremaa")).toBe("Läänemaa-Saaremaa");
    expect(byId.get("ugandi-sakala")).toBe("Ugandi-Sakala");
    expect(byId.get("zemgale-selija")).toBe("Zemgale-Sēlija");
    expect(byId.get("talava")).toBe("Tālava");
    expect(byId.get("zemaitija")).toBe("Žemaitija");
    expect(byId.get("suduva")).toBe("Sūduva");
    expect(byId.get("jersika")).toBe("Jersika");
    expect(byId.get("livzeme")).toBe("Līvzeme");
  });

  it("zemgale-selija carries both Semigallians and Selonians", () => {
    const z = data.regions.find((r) => r.id === "zemgale-selija")!;
    expect(z.peoples).toEqual(["semigallians", "selonians"]);
  });

  it("has neighbor geometry and the full label set inside bounds", () => {
    expect(data.neighbors.length).toBeGreaterThanOrEqual(3);
    for (const n of data.neighbors) expect(n.path.startsWith("M")).toBe(true);
    const byKind = (k: string) =>
      data.labels.filter((l) => l.kind === k).map((l) => l.text);
    expect(byKind("people").sort()).toEqual([
      "CURONIANS", "ESTONIANS", "LATGALIANS", "LITHUANIANS", "LIVS",
      "SAMOGITIANS", "SEMIGALLIANS", "YOTVINGIANS",
    ]);
    expect(byKind("people-minor")).toEqual(["SELONIANS"]);
    expect(byKind("title")).toEqual(["Anno Domini 1184"]);
    expect(byKind("subtitle")).toEqual(["the lands of the eastern Baltic"]);
    expect(byKind("neighbor").length).toBeGreaterThanOrEqual(2);
    for (const l of data.labels) {
      expect(l.x).toBeGreaterThan(0);
      expect(l.x).toBeLessThan(1000);
      expect(l.y).toBeGreaterThan(0);
      expect(l.y).toBeLessThan(1400);
    }
  });
});
```

- [ ] **Step 3: Run the data test to verify it fails**

Run: `npx vitest run tests/data.test.ts`
Expected: FAIL (old map.json has 21 NUTS regions, no `year`, no `peoples`).

- [ ] **Step 4: Rewrite the types**

Replace the entire contents of `src/types.ts` with:

```typescript
export interface People {
  id: string;
  name: string;
  color: string;
}

export interface Region {
  id: string;
  name: string;
  peoples: string[]; // ids into MapData.peoples; first = primary = fill color
  flavor: string;
  places: string[];
  path: string;
}

export interface Neighbor {
  id: string;
  path: string;
}

export type LabelKind =
  | "people"
  | "people-minor"
  | "neighbor"
  | "title"
  | "subtitle";

export interface MapLabel {
  text: string;
  x: number;
  y: number;
  kind: LabelKind;
}

export interface MapData {
  width: number;
  height: number;
  attribution: string;
  year: number;
  peoples: People[];
  regions: Region[];
  neighbors: Neighbor[];
  labels: MapLabel[];
}
```

- [ ] **Step 5: Add topojson devDependencies**

```bash
npm install --save-dev topojson-server@3 topojson-client@3
```

Expected: both appear under devDependencies in package.json.

- [ ] **Step 6: Rewrite the prepare script**

Replace the entire contents of `scripts/prepare-data.mjs` with:

```javascript
import { writeFileSync, mkdirSync } from "node:fs";
import { geoAzimuthalEqualArea, geoPath } from "d3-geo";
import { topology } from "topojson-server";
import { merge } from "topojson-client";

const NUTS_URL =
  "https://gisco-services.ec.europa.eu/distribution/v2/nuts/geojson/NUTS_RG_01M_2013_4326_LEVL_3.geojson";
const CNTR_URL =
  "https://gisco-services.ec.europa.eu/distribution/v2/countries/geojson/CNTR_RG_01M_2013_4326.geojson";

const WIDTH = 1000;
const HEIGHT = 1400;
const PAD = 40;
const YEAR = 1184;
const BALTIC = ["EE", "LV", "LT"];
const NEIGHBORS = ["FI", "SE", "RU", "BY", "PL", "DK"];

// Peoples of the eastern Baltic, ca. 1184. Colors are the map's pastel
// palette; Selonians color no polygon (they share zemgale-selija) but keep
// a color for future use (legend, game factions).
const PEOPLES = [
  { id: "estonians", name: "Estonians", color: "#b8cf9b" },
  { id: "livs", name: "Livs", color: "#a8c8cf" },
  { id: "latgalians", name: "Latgalians", color: "#e5b28e" },
  { id: "curonians", name: "Curonians", color: "#d9986f" },
  { id: "semigallians", name: "Semigallians", color: "#e8d18b" },
  { id: "selonians", name: "Selonians", color: "#c7b3d6" },
  { id: "samogitians", name: "Samogitians", color: "#c9b17f" },
  { id: "aukstaitians", name: "Aukštaitians", color: "#e6d9b8" },
  { id: "yotvingians", name: "Yotvingians", color: "#d1a3a0" },
];

// 15 lands. `nuts` lists the NUTS-2013 level-3 members merged into each
// land (provenance lives here only, not in the output). Compound names are
// deliberate cartographic compromises - see the design spec.
const LANDS = [
  {
    id: "ravala", name: "Rävala", nuts: ["EE001"], peoples: ["estonians"],
    flavor:
      "The northern coastlands facing the gulf, where the harbour below the " +
      "fort of Lindanise serves traders bound for Novgorod and the Gotland " +
      "run. Elders of Rävala and Harju rule from hillforts scattered " +
      "through the woods.",
    places: ["Lindanise", "Iru", "Varbola"],
  },
  {
    id: "virumaa", name: "Virumaa", nuts: ["EE007"], peoples: ["estonians"],
    flavor:
      "A broad and prosperous land along the northeastern coast, first of " +
      "the Estonian lands to sight ships from the west. Its districts " +
      "answer to their own elders and to no common lord.",
    places: ["Tarvanpea", "Mahu"],
  },
  {
    id: "jarvamaa", name: "Järvamaa", nuts: ["EE006"], peoples: ["estonians"],
    flavor:
      "A small inland land of fields and bogs at the crossroads of the " +
      "Estonian interior; armies and traders alike must pass its causeways.",
    places: ["Kareda"],
  },
  {
    id: "laanemaa-saaremaa", name: "Läänemaa-Saaremaa", nuts: ["EE004"],
    peoples: ["estonians"],
    flavor:
      "The western coast and the great islands. The Osilians of Saaremaa " +
      "are the fiercest seafarers of these waters, raiding as far as the " +
      "Danish and Swedish coasts; the mainland districts till quieter " +
      "fields.",
    places: ["Valjala", "Soontagana"],
  },
  {
    id: "ugandi-sakala", name: "Ugandi-Sakala", nuts: ["EE008"],
    peoples: ["estonians"],
    flavor:
      "Two lands of the southern uplands: Sakala west of the great valley " +
      "and Ugandi east of it, each with its own strongholds and elders. " +
      "Through Ugandi runs the road from the Rus' towns to the coast.",
    places: ["Tarbatu", "Otepää", "Viliende"],
  },
  {
    id: "livzeme", name: "Līvzeme", nuts: ["LV006", "LV007"],
    peoples: ["livs"],
    flavor:
      "The Liv lands at the mouths of the Daugava and the Gauja, grown " +
      "rich on river trade with the Rus' towns and Gotland. At Ikšķile the " +
      "monk Meinhard has this very year raised a church of stone - the " +
      "first in these lands.",
    places: ["Ikšķile", "Mārtiņsala", "Turaida"],
  },
  {
    id: "kursa", name: "Kursa", nuts: ["LV003"], peoples: ["curonians"],
    flavor:
      "The Curonian shore, feared from Denmark to Gotland for its " +
      "war-boats. Its lands - Vanema, Ventava, Bandava and the rest - " +
      "follow their own kings in war and in raid.",
    places: ["Talsi", "Embūte", "Grobiņa"],
  },
  {
    id: "zemgale-selija", name: "Zemgale-Sēlija", nuts: ["LV009"],
    peoples: ["semigallians", "selonians"],
    flavor:
      "The fertile plain of the Semigallians along the Lielupe, and across " +
      "the Daugava the wooded hills of the Selonians. Both peoples guard " +
      "the river roads jealously.",
    places: ["Tērvete", "Mežotne", "Sēlpils"],
  },
  {
    id: "talava", name: "Tālava", nuts: ["LV008"],
    peoples: ["latgalians", "livs"],
    flavor:
      "Latgalian land on the upper Gauja, paying occasional tribute to " +
      "Pskov, while Liv settlements hold the river's lower reaches. Its " +
      "chiefs rule from timber forts above the valley.",
    places: ["Beverīna", "Trikāta"],
  },
  {
    id: "jersika", name: "Jersika", nuts: ["LV005"], peoples: ["latgalians"],
    flavor:
      "A Latgalian principality on the Daugava under its own prince, " +
      "leaning toward Polotsk and the eastern church. Fortified towns " +
      "watch the river crossings.",
    places: ["Jersika", "Koknese"],
  },
  {
    id: "pilsotas", name: "Pilsotas", nuts: ["LT003"], peoples: ["curonians"],
    flavor:
      "The narrow Curonian coast by the lagoon - Pilsotas and Mēguva - " +
      "living from fishing, amber, and the sea-road south to the " +
      "Prussians.",
    places: ["Palanga", "Impiltis"],
  },
  {
    id: "zemaitija", name: "Žemaitija", nuts: ["LT006", "LT007", "LT008"],
    peoples: ["samogitians"],
    flavor:
      "The Samogitian uplands between the coast and the river country: " +
      "dense forest, sacred groves, and rival lineages - Karšuva among " +
      "them - who unite only when raiders come.",
    places: ["Medvėgalis", "Karšuva", "Saulė"],
  },
  {
    id: "aukstaitija", name: "Aukštaitija",
    nuts: ["LT002", "LT005", "LT009", "LT00A"], peoples: ["aukstaitians"],
    flavor:
      "The eastern highlands, not one realm but many: the lands of " +
      "Lietuva, Deltuva, Nalšia and Upytė, whose warring dukes raid one " +
      "another and their neighbours alike. From here war-bands ride " +
      "against the Rus' towns.",
    places: ["Kernavė", "Deltuva", "Upytė"],
  },
  {
    id: "suduva", name: "Sūduva", nuts: ["LT004"], peoples: ["yotvingians"],
    flavor:
      "Land of the Yotvingian Sudovians, horse-breeders and raiders of the " +
      "western forests, pressed between Mazovian and Rus' spears.",
    places: ["Šešupė valley"],
  },
  {
    id: "dainava", name: "Dainava", nuts: ["LT001"], peoples: ["yotvingians"],
    flavor:
      "The southern Yotvingian land of lakes and pine forest along the " +
      "Nemunas bend; its bands raid into Rus' and Mazovia and are raided " +
      "in turn.",
    places: ["Merkinė", "Punia"],
  },
];

// Label positions are hand-tuned lon/lat, projected below.
// kinds: people | people-minor | neighbor | title | subtitle
const LABELS = [
  { text: "ESTONIANS", lon: 25.3, lat: 58.8, kind: "people" },
  { text: "LIVS", lon: 24.35, lat: 57.05, kind: "people" },
  { text: "LATGALIANS", lon: 26.6, lat: 56.95, kind: "people" },
  { text: "CURONIANS", lon: 22.0, lat: 56.75, kind: "people" },
  { text: "SEMIGALLIANS", lon: 23.6, lat: 56.45, kind: "people" },
  { text: "SELONIANS", lon: 25.6, lat: 56.15, kind: "people-minor" },
  { text: "SAMOGITIANS", lon: 22.6, lat: 55.65, kind: "people" },
  { text: "LITHUANIANS", lon: 24.9, lat: 55.35, kind: "people" },
  { text: "YOTVINGIANS", lon: 23.6, lat: 54.5, kind: "people" },
  { text: "Lands of Rus'", lon: 28.0, lat: 57.2, kind: "neighbor" },
  { text: "Prussian lands", lon: 21.3, lat: 54.15, kind: "neighbor" },
  { text: "Finnic lands", lon: 21.8, lat: 59.85, kind: "neighbor" },
  { text: "Anno Domini 1184", lon: 23.55, lat: 57.75, kind: "title" },
  { text: "the lands of the eastern Baltic", lon: 23.55, lat: 57.58, kind: "subtitle" },
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

const nutsFeatures = nuts.features.filter((f) =>
  BALTIC.includes(f.properties.CNTR_CODE),
);
if (nutsFeatures.length !== 21) {
  throw new Error(`Expected 21 NUTS-3 regions, got ${nutsFeatures.length}`);
}

// Sanity: every configured NUTS id exists exactly once, and every fetched
// feature is claimed by exactly one land.
const claimed = LANDS.flatMap((l) => l.nuts);
const available = nutsFeatures.map((f) => f.properties.NUTS_ID).sort();
if (JSON.stringify([...claimed].sort()) !== JSON.stringify(available)) {
  throw new Error(
    `LANDS config does not partition the NUTS set.\nclaimed: ${[...claimed].sort()}\navailable: ${available}`,
  );
}

// Build a topology so shared borders become shared arcs, then dissolve the
// internal borders of multi-member lands with merge().
const topo = topology(
  { nuts: { type: "FeatureCollection", features: nutsFeatures } },
  1e5,
);
const landFeatures = LANDS.map((land) => {
  const members = topo.objects.nuts.geometries.filter((g) =>
    land.nuts.includes(g.properties.NUTS_ID),
  );
  if (members.length !== land.nuts.length) {
    throw new Error(`Missing members for land ${land.id}`);
  }
  return { type: "Feature", properties: { land }, geometry: merge(topo, members) };
});

const neighborFeatures = countries.features.filter((f) =>
  NEIGHBORS.includes(f.properties.CNTR_ID),
);

// Same framing as the NUTS map: fit to the (identical) union of the lands.
const projection = geoAzimuthalEqualArea()
  .rotate([-10, -52])
  .fitExtent(
    [[PAD, PAD], [WIDTH - PAD, HEIGHT - PAD]],
    { type: "FeatureCollection", features: landFeatures },
  );
projection.clipExtent([[0, 0], [WIDTH, HEIGHT]]);
const path = geoPath(projection).digits(1);

const labels = LABELS.flatMap((l) => {
  const projected = projection([l.lon, l.lat]);
  const inBounds =
    projected &&
    projected[0] > 0 && projected[0] < WIDTH &&
    projected[1] > 0 && projected[1] < HEIGHT;
  if (!inBounds) {
    if (l.kind === "neighbor") {
      console.warn(`Dropping off-canvas neighbor label: ${l.text}`);
      return [];
    }
    throw new Error(`Label outside canvas: ${l.text}`);
  }
  return [{
    text: l.text,
    x: Math.round(projected[0]),
    y: Math.round(projected[1]),
    kind: l.kind,
  }];
});

const data = {
  width: WIDTH,
  height: HEIGHT,
  attribution: "(c) EuroGeographics for the administrative boundaries",
  year: YEAR,
  peoples: PEOPLES,
  regions: landFeatures
    .map((f) => {
      const { land } = f.properties;
      return {
        id: land.id,
        name: land.name,
        peoples: land.peoples,
        flavor: land.flavor,
        places: land.places,
        path: path(f),
      };
    })
    .sort((a, b) => a.id.localeCompare(b.id)),
  neighbors: neighborFeatures
    .map((f) => ({ id: f.properties.CNTR_ID, path: path(f) }))
    .filter((n) => n.path)
    .sort((a, b) => a.id.localeCompare(b.id)),
  labels,
};

for (const r of data.regions) {
  if (!r.path) throw new Error(`Empty path for region ${r.id}`);
}
const peopleIds = new Set(PEOPLES.map((p) => p.id));
for (const r of data.regions) {
  for (const pid of r.peoples) {
    if (!peopleIds.has(pid)) throw new Error(`Unknown people ${pid} in ${r.id}`);
  }
}

mkdirSync("src/data", { recursive: true });
writeFileSync("src/data/map.json", JSON.stringify(data));
console.log(
  `Wrote src/data/map.json: ${data.regions.length} lands, ` +
    `${data.peoples.length} peoples, ${data.neighbors.length} neighbors, ` +
    `${data.labels.length} labels`,
);
```

- [ ] **Step 7: Regenerate map.json**

Run: `npm run prepare-data`
Expected output: `Wrote src/data/map.json: 15 lands, 9 peoples, <n> neighbors, <m> labels` where n >= 3 and m is 13 or 14 (neighbor labels may drop with a warning). Any thrown error: STOP and report (see escalation protocol).

- [ ] **Step 8: Run the data test to verify it passes**

Run: `npx vitest run tests/data.test.ts`
Expected: PASS (all 7 tests). NOTE: the full suite is expected to be red right now (render/panel/interaction still consume the old schema); do NOT try to fix those here - Tasks 2 and 3 do.

- [ ] **Step 9: Commit**

```bash
git add tests/data.test.ts src/types.ts scripts/prepare-data.mjs package.json package-lock.json src/data/map.json
git commit -m "feat(balticmap): anno 1184 data pipeline - 15 lands, 9 peoples"
```

---

### Task 2: Renderer - people colors and label kinds

**Files:**
- Modify: `tests/render.test.ts` (full rewrite)
- Modify: `src/map-render.ts` (full rewrite)
- Modify: `src/style.css` (replace `.country-label` block, lines 60-69, with the label-kind styles below)

**Interfaces:**
- Consumes: `MapData`, `People`, `MapLabel` from Task 1 (`src/types.ts`).
- Produces: `renderMap(data: MapData, container: HTMLElement): RenderResult` (same signature as before, `RenderResult { svg, regionPaths }` unchanged - interaction code depends on it). Region `<path>` fill = color of `region.peoples[0]` looked up in `data.peoples`. Labels get classes `label-people`, `label-people-minor`, `label-neighbor`, `label-title`, `label-subtitle`.

- [ ] **Step 1: Rewrite the render test**

Replace the entire contents of `tests/render.test.ts` with:

```typescript
// @vitest-environment happy-dom
import { describe, it, expect } from "vitest";
import { renderMap } from "../src/map-render";
import type { MapData } from "../src/types";
import raw from "../src/data/map.json";

const data = raw as MapData;

describe("renderMap", () => {
  it("renders one path per land with data-id, people color, and class", () => {
    const container = document.createElement("div");
    const { svg, regionPaths } = renderMap(data, container);
    expect(container.contains(svg)).toBe(true);
    const paths = svg.querySelectorAll("path.region");
    expect(paths.length).toBe(15);
    expect(regionPaths.size).toBe(15);
    const kursa = regionPaths.get("kursa")!;
    expect(kursa.getAttribute("data-id")).toBe("kursa");
    const curonians = data.peoples.find((p) => p.id === "curonians")!;
    expect(kursa.getAttribute("fill")).toBe(curonians.color);
  });

  it("fills by the FIRST people when a land has several", () => {
    const container = document.createElement("div");
    const { regionPaths } = renderMap(data, container);
    const zemgale = regionPaths.get("zemgale-selija")!;
    const semigallians = data.peoples.find((p) => p.id === "semigallians")!;
    expect(zemgale.getAttribute("fill")).toBe(semigallians.color);
  });

  it("renders neighbors beneath regions and labels by kind", () => {
    const container = document.createElement("div");
    const { svg } = renderMap(data, container);
    expect(svg.querySelectorAll("path.neighbor").length).toBe(
      data.neighbors.length,
    );
    for (const kind of ["people", "people-minor", "neighbor", "title", "subtitle"]) {
      const expected = data.labels.filter((l) => l.kind === kind);
      const rendered = svg.querySelectorAll(`text.label-${kind}`);
      expect(rendered.length).toBe(expected.length);
    }
    const title = svg.querySelector("text.label-title")!;
    expect(title.textContent).toBe("Anno Domini 1184");
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
});
```

- [ ] **Step 2: Run the render test to verify it fails**

Run: `npx vitest run tests/render.test.ts`
Expected: FAIL (map-render still fills by country and lacks label kinds; TypeScript errors about `r.country` are also acceptable failure modes here).

- [ ] **Step 3: Rewrite map-render.ts**

Replace the entire contents of `src/map-render.ts` with:

```typescript
import type { MapData } from "./types";

export interface RenderResult {
  svg: SVGSVGElement;
  regionPaths: Map<string, SVGPathElement>;
}

const SVG_NS = "http://www.w3.org/2000/svg";

function el<K extends string>(name: K): SVGElement {
  return document.createElementNS(SVG_NS, name) as SVGElement;
}

export function renderMap(data: MapData, container: HTMLElement): RenderResult {
  const peopleColors = new Map(data.peoples.map((p) => [p.id, p.color]));

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
  for (const r of data.regions) {
    const fill = peopleColors.get(r.peoples[0]);
    if (!fill) throw new Error(`Unknown people ${r.peoples[0]} for ${r.id}`);
    const p = el("path") as SVGPathElement;
    p.classList.add("region");
    p.setAttribute("d", r.path);
    p.setAttribute("data-id", r.id);
    p.setAttribute("fill", fill);
    regionsGroup.appendChild(p);
    regionPaths.set(r.id, p);
  }
  svg.appendChild(regionsGroup);

  const labelsGroup = el("g");
  labelsGroup.classList.add("labels");
  for (const l of data.labels) {
    const t = el("text");
    t.classList.add(`label-${l.kind}`);
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

(The old `regionFill` export and `PALETTES` are deleted; nothing else imports them after this task.)

- [ ] **Step 4: Replace the label CSS**

In `src/style.css`, replace the whole `.country-label { ... }` block (currently lines 60-69) with:

```css
.label-people,
.label-people-minor {
  font-weight: 600;
  letter-spacing: 0.35em;
  fill: #6f6250;
  text-anchor: middle;
  pointer-events: none;
  text-transform: uppercase;
  opacity: 0.75;
}

.label-people {
  font-size: 30px;
}

.label-people-minor {
  font-size: 18px;
  opacity: 0.65;
}

.label-neighbor {
  font-size: 22px;
  font-style: italic;
  letter-spacing: 0.2em;
  fill: #8a7f6f;
  text-anchor: middle;
  pointer-events: none;
  opacity: 0.7;
}

.label-title {
  font-size: 44px;
  font-weight: 700;
  letter-spacing: 0.12em;
  fill: #4c4234;
  text-anchor: middle;
  pointer-events: none;
  opacity: 0.85;
}

.label-subtitle {
  font-size: 20px;
  font-style: italic;
  letter-spacing: 0.18em;
  fill: #6f6250;
  text-anchor: middle;
  pointer-events: none;
  opacity: 0.7;
}
```

- [ ] **Step 5: Run data + render tests to verify they pass**

Run: `npx vitest run tests/data.test.ts tests/render.test.ts`
Expected: PASS. (Panel/interaction tests remain red until Task 3.)

- [ ] **Step 6: Commit**

```bash
git add tests/render.test.ts src/map-render.ts src/style.css
git commit -m "feat(balticmap): render people colors and 1184 label kinds"
```

---

### Task 3: Panel content, interaction test ids, page title - full suite green

**Files:**
- Modify: `tests/panel.test.ts` (full rewrite)
- Modify: `src/panel.ts` (full rewrite)
- Modify: `src/main.ts` (pass peoples into createPanel)
- Modify: `tests/interaction.test.ts` (update region ids/names only)
- Modify: `index.html` (title)

**Interfaces:**
- Consumes: `Region`, `People` from Task 1; `renderMap` from Task 2.
- Produces: `createPanel(container: HTMLElement, onClose: () => void, peoples: People[]): Panel` - NOTE the new third parameter. `Panel.show(region: Region)` renders `.panel-name`, `.panel-peoples`, `.panel-flavor`, `.panel-places`. `createTooltip` unchanged.

- [ ] **Step 1: Rewrite the panel test**

Replace the entire contents of `tests/panel.test.ts` with:

```typescript
// @vitest-environment happy-dom
import { describe, it, expect, vi } from "vitest";
import { createPanel, createTooltip } from "../src/panel";
import type { People, Region } from "../src/types";

const peoples: People[] = [
  { id: "latgalians", name: "Latgalians", color: "#e5b28e" },
  { id: "livs", name: "Livs", color: "#a8c8cf" },
];

const talava: Region = {
  id: "talava",
  name: "Tālava",
  peoples: ["latgalians", "livs"],
  flavor: "Latgalian land on the upper Gauja.",
  places: ["Beverīna", "Trikāta"],
  path: "M0 0Z",
};

const jersika: Region = {
  id: "jersika",
  name: "Jersika",
  peoples: ["latgalians"],
  flavor: "A principality on the Daugava.",
  places: ["Koknese"],
  path: "M0 0Z",
};

describe("panel", () => {
  it("is hidden initially, shows land details on show()", () => {
    const container = document.createElement("div");
    const panel = createPanel(container, () => {}, peoples);
    const root = container.querySelector(".panel")!;
    expect(root.classList.contains("hidden")).toBe(true);

    panel.show(talava);
    expect(root.classList.contains("hidden")).toBe(false);
    expect(container.querySelector(".panel-name")!.textContent).toBe("Tālava");
    expect(container.querySelector(".panel-peoples")!.textContent).toBe(
      "Predominantly Latgalians, with Livs",
    );
    expect(container.querySelector(".panel-flavor")!.textContent).toBe(
      "Latgalian land on the upper Gauja.",
    );
    expect(container.querySelector(".panel-places")!.textContent).toBe(
      "Notable places: Beverīna, Trikāta",
    );

    panel.hide();
    expect(root.classList.contains("hidden")).toBe(true);
  });

  it("names a single people plainly, without 'Predominantly'", () => {
    const container = document.createElement("div");
    const panel = createPanel(container, () => {}, peoples);
    panel.show(jersika);
    expect(container.querySelector(".panel-peoples")!.textContent).toBe(
      "Latgalians",
    );
  });

  it("invokes onClose when the close button is clicked", () => {
    const container = document.createElement("div");
    const onClose = vi.fn();
    const panel = createPanel(container, onClose, peoples);
    panel.show(talava);
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

    tooltip.show("Kursa", 100, 200);
    expect(el.classList.contains("hidden")).toBe(false);
    expect(el.textContent).toBe("Kursa");
    expect(el.style.left).toBe("112px");
    expect(el.style.top).toBe("212px");

    tooltip.hide();
    expect(el.classList.contains("hidden")).toBe(true);
  });
});
```

- [ ] **Step 2: Run the panel test to verify it fails**

Run: `npx vitest run tests/panel.test.ts`
Expected: FAIL (createPanel has no peoples parameter; panel renders placeholder fields).

- [ ] **Step 3: Rewrite panel.ts**

Replace the entire contents of `src/panel.ts` with:

```typescript
import type { People, Region } from "./types";

export interface Panel {
  show(region: Region): void;
  hide(): void;
}

function formatPeoples(ids: string[], peoples: People[]): string {
  const names = ids.map(
    (id) => peoples.find((p) => p.id === id)?.name ?? id,
  );
  if (names.length === 1) return names[0];
  return `Predominantly ${names[0]}, with ${names.slice(1).join(" and ")}`;
}

export function createPanel(
  container: HTMLElement,
  onClose: () => void,
  peoples: People[],
): Panel {
  const root = document.createElement("aside");
  root.className = "panel hidden";

  const close = document.createElement("button");
  close.className = "panel-close";
  close.setAttribute("aria-label", "Close");
  close.textContent = "x";
  close.addEventListener("click", onClose);

  const name = document.createElement("h2");
  name.className = "panel-name";
  const peoplesLine = document.createElement("p");
  peoplesLine.className = "panel-peoples";
  const flavor = document.createElement("p");
  flavor.className = "panel-flavor";
  const places = document.createElement("p");
  places.className = "panel-places";

  root.append(close, name, peoplesLine, flavor, places);
  container.appendChild(root);

  return {
    show(region) {
      name.textContent = region.name;
      peoplesLine.textContent = formatPeoples(region.peoples, peoples);
      flavor.textContent = region.flavor;
      places.textContent = `Notable places: ${region.places.join(", ")}`;
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

(`.panel-country` and `.panel-fields` CSS rules become unused; leave `src/style.css` alone here except nothing - removing them is optional and NOT required. The old `COUNTRY_NAMES` and `PLACEHOLDER_FIELDS` constants are deleted with the rewrite.)

- [ ] **Step 4: Update main.ts to pass peoples**

In `src/main.ts`, change only this line:

```typescript
const panel = createPanel(app, () => interaction.deselect());
```

to:

```typescript
const panel = createPanel(app, () => interaction.deselect(), data.peoples);
```

- [ ] **Step 5: Update interaction test ids and names**

In `tests/interaction.test.ts`, four regions are referenced by old NUTS ids. Apply exactly these replacements (the test logic does not change):

- `regionPaths.get("LV003")` becomes `regionPaths.get("kursa")`
- `expect.objectContaining({ id: "LV003", name: "Kurzeme" })` becomes `expect.objectContaining({ id: "kursa", name: "Kursa" })`
- `regionPaths.get("LT001")` becomes `regionPaths.get("dainava")`
- `expect.objectContaining({ id: "LT001" })` becomes `expect.objectContaining({ id: "dainava" })`
- `regionPaths.get("EE001")` becomes `regionPaths.get("ravala")`
- `regionPaths.get("LV006")` becomes `regionPaths.get("livzeme")`

- [ ] **Step 6: Update the page title**

In `index.html`, change:

```html
    <title>Baltic States - NUTS-3 Regions</title>
```

to:

```html
    <title>Anno Domini 1184 - Lands of the Eastern Baltic</title>
```

- [ ] **Step 7: Run the FULL suite and the build**

Run: `npm test`
Expected: all test files PASS (data, render, panel, interaction, state, view, smoke).

Run: `npm run build`
Expected: tsc + vite build succeed with no errors.

- [ ] **Step 8: Commit**

```bash
git add tests/panel.test.ts src/panel.ts src/main.ts tests/interaction.test.ts index.html
git commit -m "feat(balticmap): period panel, interaction ids, 1184 page title"
```

---

### Task 4: E2E verification in Chrome (orchestrator runs this, not a subagent)

**Files:** none modified unless label positions need nudging (then: `scripts/prepare-data.mjs` LABELS lon/lat only, regenerate, commit).

**Interfaces:** consumes the running app (`npm run dev`, http://127.0.0.1:5173).

- [ ] **Step 1: Start the dev server** (`npm run dev` in background).
- [ ] **Step 2: In Chrome (claude-in-chrome tools):** open the page and verify, with screenshots:
  - Title cartouche "Anno Domini 1184" + subtitle render over sea, legible, not badly overlapping land.
  - People labels present with correct spellings; SELONIANS visibly smaller; neighbor labels ("Lands of Rus'", "Prussian lands", "Finnic lands" if kept) italic and placed over grey territory.
  - Diacritics render correctly in tooltips and panel (hover Tālava, Žemaitija).
  - Cross-border people coloring visible: Kursa and Pilsotas share the Curonian color across the old LV/LT border; Talava and Jersika share the Latgalian color; Suduva and Dainava share the Yotvingian color.
  - Click Līvzeme: panel shows name, "Livs", the Ikšķile/Meinhard flavor text, notable places. Close button works.
  - Click Zemgale-Sēlija: peoples line reads "Predominantly Semigallians, with Selonians".
  - Hover/click/pan/zoom still behave (drag pans, wheel zooms, click selects).
- [ ] **Step 3:** If a label position is bad, nudge its lon/lat in `scripts/prepare-data.mjs`, re-run `npm run prepare-data`, re-verify, commit (`fix(balticmap): tune 1184 label positions`).
- [ ] **Step 4:** Only after all checks pass: report done with screenshot evidence, then merge per superpowers:finishing-a-development-branch.
