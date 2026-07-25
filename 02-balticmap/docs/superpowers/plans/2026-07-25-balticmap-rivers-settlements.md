# Rivers, Settlements, and Shift to 1100 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Natural Earth river layer and curated ca. 1100 settlement markers (with hover tooltips) on top of the land polygons, and shift the map's setting from 1184 to 1100.

**Architecture:** The build script `scripts/prepare-data.mjs` downloads Natural Earth river GeoJSON (cached like the GISCO sources), filters by a river-name whitelist, projects with the existing d3-geo projection, and bakes SVG path strings plus projected settlement coordinates into `src/data/map.json`. Rendering adds two SVG groups (rivers, then settlements) between regions and labels in `src/map-render.ts`. Settlement hover reuses the existing tooltip pathway via a new callback in `src/interaction.ts`.

**Tech Stack:** Node ESM build script, d3-geo, TypeScript, Vite, Vitest with happy-dom. No new dependencies.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-07-25-balticmap-rivers-settlements-design.md`.
- Working directory for all commands: `/Users/janis.kirsteins/Projects/prototypes/02-balticmap` (the repo root is one level up; commit paths are prefixed `02-balticmap/`).
- All work happens on branch `feature/rivers-1100` (created in Task 1, Step 1).
- Year is 1100 everywhere. Riga must NOT appear as a settlement (it does not exist in 1100). No faction consolidation language stronger than what exists today.
- No people or faction named "Lithuanians" (Samogitians are Lithuanian too; use Aukstaitians/Samogitians).
- Rivers are purely visual (`pointer-events: none`). Settlement dots are hoverable; clicking them changes no selection.
- DOM layer order inside the SVG: sea < neighbors < regions < rivers < settlements < labels.
- `npm run prepare-data` regenerates `src/data/map.json` and needs network on first run (downloads are cached in `scripts/.cache/`). Commit the regenerated `map.json` with the script change that produced it.
- Run tests with `npm run test` (vitest run). All tests must pass at the end of every task.
- Source files use Latvian/Lithuanian/Estonian diacritics in data strings (existing convention) - keep them in data. Plan/commit text uses plain ASCII punctuation only.

---

### Task 1: Shift the setting from 1184 to 1100

**Files:**
- Modify: `scripts/prepare-data.mjs` (YEAR, comments, title label, two flavor texts, Livzeme places)
- Modify: `index.html:7`
- Modify: `tests/data.test.ts:24,28,164`
- Modify: `tests/render.test.ts:50`
- Regenerate: `src/data/map.json`

**Interfaces:**
- Consumes: existing pipeline as-is.
- Produces: `map.json` with `year: 1100`, title label `"Anno Domini 1100"`. Later tasks assume the describe blocks and title assertions already say 1100.

- [ ] **Step 1: Create the feature branch**

```bash
git checkout -b feature/rivers-1100
```

- [ ] **Step 2: Update the tests to expect 1100 (failing first)**

In `tests/data.test.ts`:
- Line 24: `describe("map.json (anno 1184)"` becomes `describe("map.json (anno 1100)"`.
- Line 28: `expect(data.year).toBe(1184);` becomes `expect(data.year).toBe(1100);`.
- Line 164: `expect(byKind("title")).toEqual(["Anno Domini 1184"]);` becomes `expect(byKind("title")).toEqual(["Anno Domini 1100"]);`.

In `tests/render.test.ts` line 50: `expect(title.textContent).toBe("Anno Domini 1184");` becomes `expect(title.textContent).toBe("Anno Domini 1100");`.

- [ ] **Step 3: Run tests to verify they fail**

Run: `npm run test`
Expected: FAIL - data.test year/title assertions and render.test title assertion (3 failures); everything else passes.

- [ ] **Step 4: Update `scripts/prepare-data.mjs` for 1100**

Make exactly these edits:

1. `const YEAR = 1184;` becomes `const YEAR = 1100;`

2. The PEOPLES comment `// Peoples of the eastern Baltic, ca. 1184.` becomes `// Peoples of the eastern Baltic, ca. 1100.`

3. In the LANDS comment block, `// of municipalities into 1184 lands is a deliberate game abstraction.` becomes `// of municipalities into 1100 lands is a deliberate game abstraction.` and the population comment line `// anchored to ~180k for the Estonian lands (common ~1200 estimate) and` becomes `// anchored to ~180k for the Estonian lands (a common estimate for the` with the following line starting `// era, held flat for 1100 - these are game numbers, not a census) and`. Keep the rest of that comment intact, so the full population comment reads:

```js
// population/cohesion are deliberate GAME ESTIMATES, not historical facts:
// anchored to ~180k for the Estonian lands (a common estimate for the
// era, held flat for 1100 - these are game numbers, not a census) and
// 650,000 for the whole map, rounded to the nearest 5,000. Cohesion is
// political concentration - a cohesive 45k land can outweigh a fragmented
// 150k neighbourhood.
```

4. Livzeme (id `"livzeme"`): the current flavor mentions Meinhard's 1184 stone church, which does not exist in 1100. Replace flavor and places:

```js
    flavor:
      "The Liv lands at the mouths of the Daugava and the Gauja, grown " +
      "rich on river trade with the Rus' towns and Gotland. The hillfort " +
      "town of Daugmale above the river crossing is the busiest market " +
      "on this coast.",
    places: ["Daugmale", "Turaida"],
```

5. Lietuva (id `"lietuva"`): soften the consolidation hint for 1100. Replace the flavor's last sentence so the whole flavor reads:

```js
    flavor:
      "The land of Lietuva between the Neris and the Nemunas, whose " +
      "war-bands ride yearly against the Rus' towns. Its rival dukes " +
      "feud among themselves as readily as they raid abroad.",
```

6. In LABELS, replace the title entry literal with a template so the year cannot desync:

```js
  { text: `Anno Domini ${YEAR}`, lon: 23.55, lat: 57.75, kind: "title" },
```

(This requires LABELS to be declared after YEAR - it already is.)

- [ ] **Step 5: Update `index.html`**

Line 7: `<title>Anno Domini 1184 - Lands of the Eastern Baltic</title>` becomes `<title>Anno Domini 1100 - Lands of the Eastern Baltic</title>`.

- [ ] **Step 6: Regenerate data and run tests**

Run: `npm run prepare-data && npm run test`
Expected: script logs `Wrote src/data/map.json: 20 lands, ...`; all tests PASS.

- [ ] **Step 7: Verify no stray 1184 remains**

Run: `grep -rn "1184" index.html src tests scripts --include="*.ts" --include="*.html" --include="*.mjs" | grep -v map.json`
Expected: no output. (`map.json` is regenerated, so it should not contain 1184 either; `grep -c 1184 src/data/map.json` should print 0.)

- [ ] **Step 8: Commit**

```bash
git add scripts/prepare-data.mjs index.html tests/data.test.ts tests/render.test.ts src/data/map.json
git commit -m "feat(balticmap): shift setting from 1184 to 1100"
```

---

### Task 2: River geometry from Natural Earth in the data pipeline

**Files:**
- Modify: `scripts/prepare-data.mjs`
- Modify: `src/types.ts`
- Modify: `tests/data.test.ts`
- Regenerate: `src/data/map.json`

**Interfaces:**
- Consumes: existing `projection`, `path` (geoPath with `clipExtent`, which clips lines to the canvas), `fetchJsonCached`, `LABELS` array.
- Produces: `map.json` gains `rivers: [{id: string, name: string, major: boolean, path: string}]` sorted by id, and four new labels with `kind: "river"`. `src/types.ts` gains `River`, `MapData.rivers: River[]`, and `"river"` in `LabelKind`. Attribution becomes exactly `"(c) EuroGeographics for the administrative boundaries; rivers: Natural Earth"`. Task 4 renders `data.rivers` using the `major` flag and `text.label-river`.

- [ ] **Step 1: Add types**

In `src/types.ts`, add after the `Neighbor` interface:

```ts
export interface River {
  id: string;
  name: string;
  major: boolean; // wider stroke for the great trade rivers
  path: string;
}
```

Extend `LabelKind`:

```ts
export type LabelKind =
  | "people"
  | "people-minor"
  | "neighbor"
  | "river"
  | "title"
  | "subtitle";
```

Extend `MapData` with `rivers: River[];` (after `neighbors`).

- [ ] **Step 2: Write the failing tests**

In `tests/data.test.ts`, update the attribution assertion in the first test:

```ts
    expect(data.attribution).toBe(
      "(c) EuroGeographics for the administrative boundaries; rivers: Natural Earth",
    );
```

Add a new test inside the describe block:

```ts
  it("has the main rivers as path data", () => {
    const ids = data.rivers.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual([...ids].sort());
    expect(ids.length).toBeGreaterThanOrEqual(5);
    expect(ids.length).toBeLessThanOrEqual(9);
    expect(ids).toContain("daugava");
    expect(ids).toContain("nemunas");
    for (const r of data.rivers) {
      expect(r.name.length).toBeGreaterThan(0);
      expect(typeof r.major).toBe("boolean");
      expect(r.path.startsWith("M")).toBe(true);
    }
    const major = data.rivers.filter((r) => r.major).map((r) => r.id);
    expect(major.sort()).toEqual(["daugava", "nemunas"]);
  });
```

And in the label test (`has neighbor geometry and the full label set inside bounds`), add before the bounds loop:

```ts
    expect(byKind("river").sort()).toEqual(["Daugava", "Gauja", "Nemunas", "Venta"]);
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npm run test`
Expected: FAIL - `data.rivers` is undefined and the attribution assertion fails; other tests pass.

- [ ] **Step 4: Implement river sourcing in `scripts/prepare-data.mjs`**

Add the source URLs next to the existing GISCO URLs:

```js
// Natural Earth 10m river centerlines (public domain). The Europe
// supplement carries the smaller regional rivers (Gauja, Venta, Musa...).
const NE_RIVERS_URL =
  "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_rivers_lake_centerlines.geojson";
const NE_RIVERS_EU_URL =
  "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_rivers_europe.geojson";
```

Add the whitelist after the FACTIONS constant:

```js
// Main trade arteries ca. 1100. `match` lists Natural Earth naming
// variants, compared case-insensitively against each feature's name,
// name_en and name_alt. `major` = wider stroke (the two great rivers).
// A missing minor river is warned and skipped (spec: accept the gap);
// Daugava and Nemunas are required.
const RIVERS = [
  { id: "daugava", name: "Daugava", major: true, match: ["daugava", "zapadnaya dvina", "western dvina", "dvina"] },
  { id: "nemunas", name: "Nemunas", major: true, match: ["neman", "nemunas", "nyoman", "nioman"] },
  { id: "neris", name: "Neris", major: false, match: ["neris", "viliya", "vilija"] },
  { id: "gauja", name: "Gauja", major: false, match: ["gauja"] },
  { id: "venta", name: "Venta", major: false, match: ["venta"] },
  { id: "lielupe", name: "Lielupe", major: false, match: ["lielupe"] },
  { id: "musa", name: "Mūša", major: false, match: ["musa", "mūša"] },
  { id: "memele", name: "Mēmele", major: false, match: ["memele", "mēmele", "nemunelis", "nemunėlis"] },
  { id: "narva", name: "Narva", major: false, match: ["narva"] },
];
```

Extend the download block:

```js
const [lau, nuts, countries, neRivers, neRiversEu] = await Promise.all([
  fetchJsonCached(LAU_URL),
  fetchJsonCached(NUTS_URL),
  fetchJsonCached(CNTR_URL),
  fetchJsonCached(NE_RIVERS_URL),
  fetchJsonCached(NE_RIVERS_EU_URL),
]);
```

After the projection/`path` setup (they must exist first), add:

```js
// --- Rivers: collect every Natural Earth segment matching a whitelisted
// name into one MultiLineString per river; geoPath's clipExtent trims
// them to the canvas.
function riverFeatureNames(f) {
  const p = f.properties ?? {};
  return [p.name, p.name_en, p.name_alt]
    .filter((n) => typeof n === "string" && n.length > 0)
    .flatMap((n) => n.split(/[\/,()]/))
    .map((n) => n.trim().toLowerCase())
    .filter((n) => n.length > 0);
}
const toLineCoords = (geom) =>
  geom.type === "LineString" ? [geom.coordinates]
  : geom.type === "MultiLineString" ? geom.coordinates
  : [];
const riverSegments = new Map(RIVERS.map((r) => [r.id, []]));
for (const f of [...neRivers.features, ...neRiversEu.features]) {
  const names = riverFeatureNames(f);
  for (const r of RIVERS) {
    if (r.match.some((m) => names.includes(m))) {
      riverSegments.get(r.id).push(...toLineCoords(f.geometry));
    }
  }
}
const rivers = RIVERS.flatMap((r) => {
  const segs = riverSegments.get(r.id);
  const d = segs.length
    ? path({ type: "MultiLineString", coordinates: segs })
    : null;
  if (!d) {
    if (r.major) {
      throw new Error(`Natural Earth match failed for required river ${r.id}`);
    }
    console.warn(`River ${r.id}: no usable Natural Earth geometry - skipped`);
    return [];
  }
  return [{ id: r.id, name: r.name, major: r.major, path: d }];
}).sort((a, b) => a.id.localeCompare(b.id));
```

Add river labels to LABELS (hand-tuned positions beside each river's course; final nudging happens in the Chrome pass, Task 6):

```js
  { text: "Daugava", lon: 25.62, lat: 56.47, kind: "river" },
  { text: "Nemunas", lon: 23.9, lat: 54.93, kind: "river" },
  { text: "Gauja", lon: 25.35, lat: 57.28, kind: "river" },
  { text: "Venta", lon: 22.1, lat: 56.85, kind: "river" },
```

Update the attribution in the `data` object:

```js
  attribution:
    "(c) EuroGeographics for the administrative boundaries; rivers: Natural Earth",
```

Add `rivers,` to the `data` object (after `neighbors`), and extend the final console.log to include `${data.rivers.length} rivers`.

- [ ] **Step 5: Regenerate and inspect**

Run: `npm run prepare-data`
Expected: first run downloads the two NE files into `scripts/.cache/`; log line reports the counts. Check which rivers matched:

Run: `node -e "const d=require('./src/data/map.json'); console.log(d.rivers.map(r=>r.id+(r.major?'*':'')).join(', '))"`
Expected: at least daugava*, nemunas*, gauja, venta plus ideally lielupe, musa, memele, narva, neris. If a minor river is missing, that is acceptable (spec) - note it in the commit message; do NOT switch data sources.

- [ ] **Step 6: Run tests to verify they pass**

Run: `npm run test`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add scripts/prepare-data.mjs src/types.ts tests/data.test.ts src/data/map.json
git commit -m "feat(balticmap): source main rivers from Natural Earth"
```

---

### Task 3: Curated ca. 1100 settlements in the data pipeline

**Files:**
- Modify: `scripts/prepare-data.mjs`
- Modify: `src/types.ts`
- Modify: `tests/data.test.ts`
- Regenerate: `src/data/map.json`

**Interfaces:**
- Consumes: existing `projection`, WIDTH/HEIGHT.
- Produces: `map.json` gains `settlements: [{id, name, note, x, y, labelDy?}]` sorted by id (x/y are projected viewBox coordinates; `labelDy` only present when set). `src/types.ts` gains `Settlement` and `MapData.settlements: Settlement[]`. Tasks 4 and 5 consume `data.settlements`.

- [ ] **Step 1: Add types**

In `src/types.ts`, after `River`:

```ts
export interface Settlement {
  id: string;
  name: string;
  note: string; // one-line tooltip, valid for ca. 1100
  x: number;
  y: number;
  labelDy?: number; // label offset override to dodge a colliding neighbour
}
```

Extend `MapData` with `settlements: Settlement[];` (after `rivers`).

- [ ] **Step 2: Write the failing tests**

Add to `tests/data.test.ts` inside the describe block:

```ts
  it("has 18 curated settlements valid for 1100", () => {
    expect(data.settlements.length).toBe(18);
    const ids = data.settlements.map((s) => s.id);
    expect(new Set(ids).size).toBe(18);
    expect(ids).toEqual([...ids].sort());
    for (const s of data.settlements) {
      expect(s.name.length).toBeGreaterThan(0);
      expect(s.note.length).toBeGreaterThan(20);
      expect(s.x).toBeGreaterThan(0);
      expect(s.x).toBeLessThan(1000);
      expect(s.y).toBeGreaterThan(0);
      expect(s.y).toBeLessThan(1400);
      // Riga does not exist in 1100
      expect(s.name.toLowerCase()).not.toContain("riga");
      expect(s.name.toLowerCase()).not.toContain("rīga");
    }
    const names = data.settlements.map((s) => s.name);
    expect(names).toContain("Lindanise");
    expect(names).toContain("Daugmale");
    expect(names).toContain("Kernavė");
    expect(names).toContain("Tērvete");
  });
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npm run test`
Expected: FAIL - `data.settlements` is undefined; other tests pass.

- [ ] **Step 4: Implement settlements in `scripts/prepare-data.mjs`**

Add after the RIVERS constant:

```js
// Attested or archaeologically grounded sites ca. 1100, at the modern
// coordinates of their hillforts/harbours. Notes are one-line tooltips
// and must hold for 1100 specifically (hence Daugmale at its peak, an
// unremarkable Ikskile, and no Riga - it does not exist yet). labelDy
// drops a label below its dot where neighbours would collide.
const SETTLEMENTS = [
  { id: "apuole", name: "Apuolė", lon: 21.55, lat: 56.17, note: "Old Curonian stronghold in the north of the land, besieged by sea-kings in centuries past." },
  { id: "daugmale", name: "Daugmale", lon: 24.43, lat: 56.84, note: "Great Liv hillfort and market above the Daugava crossing, at the height of its power." },
  { id: "ikskile", name: "Ikšķile", lon: 24.5, lat: 56.84, labelDy: 16, note: "Liv riverside village; nothing yet marks it out from its neighbours." },
  { id: "impiltis", name: "Impiltis", lon: 21.22, lat: 56.05, note: "Stronghold of the coastal Curonians above the lagoon shore." },
  { id: "jersika", name: "Jersika", lon: 26.2, lat: 56.27, note: "Seat of the Latgalian princes of the Daugava, looking east to Polotsk." },
  { id: "kernave", name: "Kernavė", lon: 24.85, lat: 54.89, note: "Cluster of hillforts above the Neris, chief seat of the dukes of Lietuva." },
  { id: "koknese", name: "Koknese", lon: 25.44, lat: 56.64, note: "Fortified town on the Daugava's right bank, tollgate of the river road." },
  { id: "lindanise", name: "Lindanise", lon: 24.74, lat: 59.44, note: "Harbour below the fort where the Gotland run turns east for Novgorod." },
  { id: "mezotne", name: "Mežotne", lon: 24.05, lat: 56.44, note: "Semigallian stronghold guarding the Lielupe river road." },
  { id: "otepaa", name: "Otepää", lon: 26.46, lat: 58.06, note: "Upland stronghold of Ugandi on the road from the Rus' towns." },
  { id: "selpils", name: "Sēlpils", lon: 25.68, lat: 56.6, note: "Old fort of the Selonians on the Daugava's wooded left bank." },
  { id: "soontagana", name: "Soontagana", lon: 24.08, lat: 58.55, note: "Stronghold of the western Estonians amid bogs, reachable only on winter roads." },
  { id: "talsi", name: "Talsi", lon: 22.59, lat: 57.24, note: "Curonian hillfort town among the lakes of Vanema." },
  { id: "tarbatu", name: "Tarbatu", lon: 26.72, lat: 58.38, note: "Estonian hillfort above the Emajõgi crossing, key to the eastern road." },
  { id: "tervete", name: "Tērvete", lon: 23.38, lat: 56.48, note: "Chief hillfort of the Semigallians, seat of their strongest chiefs." },
  { id: "trikata", name: "Trikāta", lon: 25.7, lat: 57.54, note: "Latgalian chief's fort on the upper Gauja, heart of Tālava." },
  { id: "valjala", name: "Valjala", lon: 22.79, lat: 58.4, note: "Chief ringfort of the Osilians, lords of the island sea-roads." },
  { id: "varbola", name: "Varbola", lon: 24.47, lat: 59.03, note: "Great ringfort of Harjumaa, mightiest stronghold of the Estonian lands." },
];
```

After the rivers block, add:

```js
const settlements = SETTLEMENTS.map((s) => {
  const p = projection([s.lon, s.lat]);
  const inBounds =
    p && p[0] > 0 && p[0] < WIDTH && p[1] > 0 && p[1] < HEIGHT;
  if (!inBounds) throw new Error(`Settlement outside canvas: ${s.id}`);
  return {
    id: s.id,
    name: s.name,
    note: s.note,
    x: Math.round(p[0]),
    y: Math.round(p[1]),
    ...(s.labelDy !== undefined ? { labelDy: s.labelDy } : {}),
  };
}).sort((a, b) => a.id.localeCompare(b.id));
```

Add `settlements,` to the `data` object (after `rivers`) and extend the console.log with `${data.settlements.length} settlements`.

- [ ] **Step 5: Regenerate and run tests**

Run: `npm run prepare-data && npm run test`
Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add scripts/prepare-data.mjs src/types.ts tests/data.test.ts src/data/map.json
git commit -m "feat(balticmap): curated ca. 1100 settlement data"
```

---

### Task 4: Render rivers and settlements

**Files:**
- Modify: `src/map-render.ts`
- Modify: `src/style.css`
- Modify: `tests/render.test.ts`

**Interfaces:**
- Consumes: `data.rivers` (`River {id, name, major, path}`), `data.settlements` (`Settlement {id, name, note, x, y, labelDy?}`) from Tasks 2-3.
- Produces: `RenderResult` gains `settlementDots: Map<string, SVGCircleElement>` (keyed by settlement id; each circle carries `data-settlement-id`). Task 5 consumes it. SVG group order: sea rect, `g.neighbors`, `g.regions`, `g.rivers`, `g.settlements`, `g.labels`.

- [ ] **Step 1: Write the failing tests**

Add to `tests/render.test.ts`:

```ts
  it("renders rivers above regions and below settlements and labels", () => {
    const container = document.createElement("div");
    const { svg } = renderMap(data, container);
    expect(svg.querySelectorAll("path.river").length).toBe(data.rivers.length);
    expect(svg.querySelectorAll("path.river-major").length).toBe(
      data.rivers.filter((r) => r.major).length,
    );
    const groups = Array.from(svg.querySelectorAll("g")).map((g) => g.getAttribute("class"));
    expect(groups.indexOf("regions")).toBeLessThan(groups.indexOf("rivers"));
    expect(groups.indexOf("rivers")).toBeLessThan(groups.indexOf("settlements"));
    expect(groups.indexOf("settlements")).toBeLessThan(groups.indexOf("labels"));
  });

  it("renders settlement dots and labels", () => {
    const container = document.createElement("div");
    const { svg, settlementDots } = renderMap(data, container);
    expect(settlementDots.size).toBe(data.settlements.length);
    expect(svg.querySelectorAll("circle.settlement").length).toBe(
      data.settlements.length,
    );
    expect(svg.querySelectorAll("text.settlement-label").length).toBe(
      data.settlements.length,
    );
    const daugmale = settlementDots.get("daugmale")!;
    expect(daugmale.getAttribute("data-settlement-id")).toBe("daugmale");
    const s = data.settlements.find((x) => x.id === "daugmale")!;
    expect(daugmale.getAttribute("cx")).toBe(String(s.x));
    expect(daugmale.getAttribute("cy")).toBe(String(s.y));
    expect(svg.querySelectorAll("text.label-river").length).toBe(
      data.labels.filter((l) => l.kind === "river").length,
    );
  });
```

Also extend the existing label-kind loop in `renders neighbors beneath regions and labels by kind` to include `"river"`:

```ts
    for (const kind of ["people", "people-minor", "neighbor", "river", "title", "subtitle"]) {
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test`
Expected: FAIL - `settlementDots` undefined, no `path.river` elements.

- [ ] **Step 3: Implement rendering in `src/map-render.ts`**

Update `RenderResult`:

```ts
export interface RenderResult {
  svg: SVGSVGElement;
  regionPaths: Map<string, SVGPathElement>;
  settlementDots: Map<string, SVGCircleElement>;
}
```

After `svg.appendChild(regionsGroup);` and before the labels group, insert:

```ts
  const riversGroup = el("g");
  riversGroup.classList.add("rivers");
  for (const r of data.rivers) {
    const p = el("path");
    p.classList.add("river");
    if (r.major) p.classList.add("river-major");
    p.setAttribute("d", r.path);
    riversGroup.appendChild(p);
  }
  svg.appendChild(riversGroup);

  const settlementsGroup = el("g");
  settlementsGroup.classList.add("settlements");
  const settlementDots = new Map<string, SVGCircleElement>();
  for (const s of data.settlements) {
    const c = el("circle") as SVGCircleElement;
    c.classList.add("settlement");
    c.setAttribute("cx", String(s.x));
    c.setAttribute("cy", String(s.y));
    c.setAttribute("r", "3.5");
    c.setAttribute("data-settlement-id", s.id);
    settlementsGroup.appendChild(c);
    settlementDots.set(s.id, c);
    const t = el("text");
    t.classList.add("settlement-label");
    t.setAttribute("x", String(s.x));
    t.setAttribute("y", String(s.y + (s.labelDy ?? -7)));
    t.textContent = s.name;
    settlementsGroup.appendChild(t);
  }
  svg.appendChild(settlementsGroup);
```

Return `{ svg, regionPaths, settlementDots }`.

- [ ] **Step 4: Add styles to `src/style.css`**

After the `.region.selected` rule:

```css
.river {
  fill: none;
  stroke: #7fa3c0;
  stroke-width: 1.6;
  stroke-linecap: round;
  stroke-linejoin: round;
  pointer-events: none;
  opacity: 0.85;
}

.river-major {
  stroke-width: 2.8;
}

.settlement {
  fill: #4c4234;
  stroke: #fdfaf4;
  stroke-width: 1.2;
}

.settlement-label {
  font-size: 12px;
  fill: #3f3428;
  text-anchor: middle;
  pointer-events: none;
  paint-order: stroke;
  stroke: rgba(253, 250, 244, 0.8);
  stroke-width: 3px;
}
```

After the `.label-neighbor` rule:

```css
.label-river {
  font-size: 16px;
  font-style: italic;
  letter-spacing: 0.08em;
  fill: #56809f;
  text-anchor: middle;
  pointer-events: none;
  opacity: 0.85;
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm run test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/map-render.ts src/style.css tests/render.test.ts
git commit -m "feat(balticmap): render river and settlement layers"
```

---

### Task 5: Settlement hover tooltips

**Files:**
- Modify: `src/interaction.ts`
- Modify: `src/panel.ts`
- Modify: `src/main.ts`
- Modify: `tests/interaction.test.ts`
- Modify: `tests/panel.test.ts`

**Interfaces:**
- Consumes: `settlementDots` from Task 4's `RenderResult`; `data.settlements`.
- Produces: `attachInteraction(svg, regionPaths, settlementDots, data, cb)` - note the NEW third parameter - with `InteractionCallbacks` gaining `onHoverSettlement(settlement: Settlement | null, clientX: number, clientY: number): void`. `panel.ts` exports `settlementTooltipText(s: Settlement): string` returning `` `${s.name}\n${s.note}` ``. Clicking a settlement dot changes no selection.

- [ ] **Step 1: Write the failing tests**

In `tests/interaction.test.ts`, the `setup()` helper must pass the new argument and callback:

```ts
function setup() {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const { svg, regionPaths, settlementDots } = renderMap(data, container);
  const onHover = vi.fn();
  const onSelect = vi.fn();
  const onHoverSettlement = vi.fn();
  const handle = attachInteraction(svg, regionPaths, settlementDots, data, {
    onHover,
    onSelect,
    onHoverSettlement,
  });
  return { svg, regionPaths, settlementDots, onHover, onSelect, onHoverSettlement, handle };
}
```

Add tests:

```ts
  it("hovering a settlement dot fires onHoverSettlement with the settlement", () => {
    const { settlementDots, onHoverSettlement } = setup();
    const dot = settlementDots.get("daugmale")!;
    dot.dispatchEvent(mouse("pointerenter", { clientX: 3, clientY: 4 }));
    expect(onHoverSettlement).toHaveBeenLastCalledWith(
      expect.objectContaining({ id: "daugmale", name: "Daugmale" }), 3, 4,
    );
    dot.dispatchEvent(mouse("pointerleave"));
    expect(onHoverSettlement).toHaveBeenLastCalledWith(null, 0, 0);
  });

  it("clicking a settlement dot does not change the selection", () => {
    const { regionPaths, settlementDots, onSelect } = setup();
    const region = regionPaths.get("livzeme")!;
    region.dispatchEvent(mouse("pointerdown", { clientX: 10, clientY: 10 }));
    region.dispatchEvent(mouse("pointerup", { clientX: 10, clientY: 10 }));
    expect(region.classList.contains("selected")).toBe(true);
    const dot = settlementDots.get("daugmale")!;
    dot.dispatchEvent(mouse("pointerdown", { clientX: 12, clientY: 12 }));
    dot.dispatchEvent(mouse("pointerup", { clientX: 12, clientY: 12 }));
    expect(region.classList.contains("selected")).toBe(true);
    expect(onSelect).toHaveBeenLastCalledWith(
      expect.objectContaining({ id: "livzeme" }),
    );
  });
```

In `tests/panel.test.ts`, add (import `settlementTooltipText` from `../src/panel`):

```ts
  it("settlementTooltipText shows name and note", () => {
    const s = {
      id: "daugmale", name: "Daugmale", note: "Great Liv hillfort.",
      x: 100, y: 200,
    };
    expect(settlementTooltipText(s)).toBe("Daugmale\nGreat Liv hillfort.");
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test`
Expected: FAIL - attachInteraction has the old signature, `settlementTooltipText` does not exist. (`npm run build` would also fail; that is expected until Step 3.)

- [ ] **Step 3: Implement**

`src/interaction.ts`:

- Import `Settlement` in the type import.
- Extend the callbacks interface:

```ts
export interface InteractionCallbacks {
  onHover(region: Region | null, clientX: number, clientY: number): void;
  onSelect(region: Region | null): void;
  onHoverSettlement(
    settlement: Settlement | null,
    clientX: number,
    clientY: number,
  ): void;
}
```

- New signature:

```ts
export function attachInteraction(
  svg: SVGSVGElement,
  regionPaths: Map<string, SVGPathElement>,
  settlementDots: Map<string, SVGCircleElement>,
  data: MapData,
  cb: InteractionCallbacks,
): InteractionHandle {
```

- After the region hover loop, add:

```ts
  const settlementById = new Map(data.settlements.map((s) => [s.id, s]));
  for (const [id, dot] of settlementDots) {
    dot.addEventListener("pointerenter", (e) => {
      const me = e as MouseEvent;
      cb.onHoverSettlement(settlementById.get(id)!, me.clientX, me.clientY);
    });
    dot.addEventListener("pointerleave", () => {
      cb.onHoverSettlement(null, 0, 0);
    });
  }
```

- In the `pointerup` handler, ignore settlement clicks (before the `closest("[data-id]")` line):

```ts
    if ((e.target as Element).closest?.("[data-settlement-id]")) return;
```

`src/panel.ts` - add (import `Settlement` in the type import):

```ts
export function settlementTooltipText(s: Settlement): string {
  return `${s.name}\n${s.note}`;
}
```

`src/main.ts` - destructure `settlementDots` from `renderMap`, import `settlementTooltipText`, pass the new argument and callback:

```ts
const { svg, regionPaths, settlementDots } = renderMap(data, app);
```

```ts
const interaction = attachInteraction(svg, regionPaths, settlementDots, data, {
  onHover(region, clientX, clientY) {
    if (region) {
      tooltip.show(
        tooltipText(region, factionById.get(region.faction)!),
        clientX,
        clientY,
      );
    } else tooltip.hide();
  },
  onHoverSettlement(settlement, clientX, clientY) {
    if (settlement) {
      tooltip.show(settlementTooltipText(settlement), clientX, clientY);
    } else tooltip.hide();
  },
  onSelect(region) {
    if (region) panel.show(region);
    else panel.hide();
  },
});
```

- [ ] **Step 4: Run tests and the build**

Run: `npm run test && npm run build`
Expected: tests PASS; tsc + vite build succeed with no type errors.

- [ ] **Step 5: Commit**

```bash
git add src/interaction.ts src/panel.ts src/main.ts tests/interaction.test.ts tests/panel.test.ts
git commit -m "feat(balticmap): settlement hover tooltips"
```

---

### Task 6: E2E visual verification in Chrome (main session)

This task is performed by the MAIN agent in the interactive session (it drives the Chrome browser tools), not by a subagent. Standing user rule: a Chrome pass is required before the feature counts as done - happy-dom misses visual problems.

**Files:**
- Possibly modify: `scripts/prepare-data.mjs` (label lon/lat nudges, labelDy tweaks), `src/style.css` (colors/widths)
- Regenerate: `src/data/map.json` after any constant change

- [ ] **Step 1: Start the dev server**

Run: `npm run dev` (background). Note the local URL (default `http://127.0.0.1:5173`).

- [ ] **Step 2: Open in Chrome and verify visually**

Load the browser tools, open a new tab at the dev URL, take a screenshot, and check every item:

1. Rivers visible with plausible courses: Daugava crossing the map from southeast to the gulf (forming the Selija/Jersika border zone), Nemunas across the south, Gauja looping through Talava, Venta north through Kursa. Major rivers visibly wider.
2. River color reads as water against both the sea and all region fills; rivers do not visually shout over borders.
3. Settlement dots sit where they should: Koknese on the Daugava's north bank, Selpils on the south bank, Lindanise on the northern coast, Valjala on Saaremaa, Kernave near the Neris.
4. No overlapping settlement labels (especially Daugmale vs Ikskile); no settlement label colliding with river or people labels.
5. The four river name labels sit beside their rivers and are legible.
6. Title reads "Anno Domini 1100"; page title too.
7. Hovering a settlement dot shows the name + note tooltip; moving off hides it; hovering a region still shows the region tooltip; region click/selection and panel still work; zoom and pan still work.
8. Zoom in once and re-check settlement dot/label sizes remain reasonable.

- [ ] **Step 3: Fix what the screenshot disproves**

For label collisions: adjust `labelDy` values or river-label lon/lat in `scripts/prepare-data.mjs`, then `npm run prepare-data`. For color/width issues: adjust `src/style.css`. Reload, re-screenshot, repeat until the checklist passes.

- [ ] **Step 4: Final test run and commit**

Run: `npm run test`
Expected: PASS.

```bash
git add -A
git commit -m "fix(balticmap): visual tuning from Chrome verification pass"
```

(Skip the commit if no tuning was needed.)

- [ ] **Step 5: Merge to main**

```bash
git checkout main
git merge --no-ff feature/rivers-1100 -m "Merge feature/rivers-1100: rivers, settlements, shift to 1100"
```
