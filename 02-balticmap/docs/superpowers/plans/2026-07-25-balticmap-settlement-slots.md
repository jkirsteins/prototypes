# Settlement Slots and Full Land Coverage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every land starts with exactly one visible settlement; the data model gains population-correlated settlement slots (maxSettlements) with authored-but-locked extra settlements; Harjumaa becomes contiguous; Estonia gets its interior rivers.

**Architecture:** All data work happens in `scripts/prepare-data.mjs` (which bakes `src/data/map.json`): settlements gain `land`/`unlocked`, regions gain `maxSettlements`, new build-time validations (including a d3-geo `geoContains` check that each settlement sits inside its claimed land), the Laane-Harju municipality moves from Harjumaa to Ravala, and two rivers join the whitelist. Rendering filters to unlocked settlements; the panel gains a one-line settlements readout.

**Tech Stack:** Node ESM build script, d3-geo (`geoContains` - already a dependency), TypeScript, Vite, Vitest with happy-dom.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-07-25-balticmap-settlement-slots-design.md`.
- Working directory for all commands: `/Users/janis.kirsteins/Projects/prototypes/02-balticmap` (repo root is one level up; commit paths show as `02-balticmap/...`).
- All work on branch `feature/settlement-slots` (created in Task 1, Step 1).
- Slot formula, exact: `maxSettlements = Math.min(10, Math.max(1, Math.round(population / 10000)))`.
- Start state: exactly one `unlocked: true` settlement per land; 25 authored settlements total, 20 unlocked, 5 locked (`ikskile`, `koknese`, `otepaa`, `mezotne`, `apuole`).
- Locked settlements are NOT rendered and have no DOM presence. No unlock mechanic (YAGNI).
- Populations after the border fix: ravala 15000, harjumaa 15000; map total stays exactly 650000.
- No settlement named Riga. Settlement notes must hold for ca. 1100; plain understated tone, no titles like "Dukes of X".
- `npm run prepare-data` regenerates `src/data/map.json` (downloads are cached in `scripts/.cache/`; no network needed). Commit the regenerated `map.json` with the script change that produced it.
- `npm run test` (48 tests currently) must pass at the end of every task; `npm run build` must stay clean where a task says to run it.
- Keep diacritics in data strings (existing convention). Plan/commit text is plain ASCII.

---

### Task 1: Harjumaa/Ravala border fix

**Files:**
- Modify: `scripts/prepare-data.mjs` (LANDS entries for `ravala` and `harjumaa`)
- Modify: `tests/data.test.ts`
- Regenerate: `src/data/map.json`

**Interfaces:**
- Consumes: existing LANDS/partition-validation machinery.
- Produces: ravala includes "Lääne-Harju vald" with population 15000; harjumaa is contiguous with population 15000. Task 2's slot math relies on these populations (both yield maxSettlements 2).

- [ ] **Step 1: Create the feature branch**

```bash
git checkout -b feature/settlement-slots
```

- [ ] **Step 2: Write the failing tests**

In `tests/data.test.ts`, add inside the describe block:

```ts
  it("ravala holds the northwest coast and harjumaa is contiguous", () => {
    const region = (id: string) => data.regions.find((r) => r.id === id)!;
    expect(region("ravala").population).toBe(15000);
    expect(region("harjumaa").population).toBe(15000);
    const rings = region("harjumaa").path.split("M").filter(Boolean);
    const sorted = [...rings].sort((a, b) => b.length - a.length);
    for (const ring of sorted.slice(1)) {
      expect(ring.length).toBeLessThan(300);
    }
  });
```

- [ ] **Step 3: Run tests to verify the new one fails**

Run: `npm run test`
Expected: FAIL - populations are 10000/20000 and harjumaa has a ~1500-char secondary ring; all other tests pass.

- [ ] **Step 4: Edit LANDS in `scripts/prepare-data.mjs`**

In the `ravala` entry: add `"Lääne-Harju vald"` to `lau`, change `population` to 15000, and replace the flavor so it reads:

```js
    id: "ravala", name: "Rävala", faction: "ravalans",
    peoples: ["estonians"],
    lau: [
      "Tallinn", "Viimsi vald", "Maardu linn", "Jõelähtme vald", "Rae vald",
      "Kiili vald", "Saku vald", "Saue vald", "Harku vald", "Keila linn",
      "Lääne-Harju vald",
    ],
    flavor:
      "The coastal land around the harbour below the fort of Lindanise, " +
      "running west past the bay of Paldiski, where traders bound for " +
      "Novgorod and the Gotland run put in. Its elders grow rich on the " +
      "sea-road.",
    places: ["Lindanise", "Iru"],
    population: 15000, cohesion: "medium",
```

In the `harjumaa` entry: remove `"Lääne-Harju vald"` from `lau` (the list becomes `"Kuusalu vald", "Loksa linn", "Anija vald", "Raasiku vald", "Kose vald", "Kehtna vald", "Kohila vald", "Märjamaa vald", "Rapla vald"`), and change `population` to 15000. Keep flavor and places unchanged (already inland-framed around Varbola).

- [ ] **Step 5: Regenerate and run tests**

Run: `npm run prepare-data && npm run test`
Expected: script succeeds (the partition check proves the move is clean); all tests pass including the new one.

- [ ] **Step 6: Commit**

```bash
git add scripts/prepare-data.mjs tests/data.test.ts src/data/map.json
git commit -m "fix(balticmap): move Laane-Harju coast to Ravala; contiguous Harjumaa"
```

---

### Task 2: Settlement slots data model and full coverage

**Files:**
- Modify: `src/types.ts`
- Modify: `scripts/prepare-data.mjs` (SETTLEMENTS constant, validations, region/settlement emit)
- Modify: `tests/data.test.ts`
- Modify: `tests/panel.test.ts` (Settlement literal gains new required fields)
- Regenerate: `src/data/map.json`

**Interfaces:**
- Consumes: LANDS populations from Task 1 (ravala/harjumaa 15000 each); existing `landFeatures` array (unprojected GeoJSON features with `properties.land.id`) built before the projection is set up.
- Produces: `Settlement` gains `land: string; unlocked: boolean;`; `Region` gains `maxSettlements: number;`. map.json settlements: 25 entries sorted by id, 20 unlocked. Tasks 4-5 consume `settlement.unlocked`, `settlement.land`, `region.maxSettlements`.

- [ ] **Step 1: Update types in `src/types.ts`**

`Region` gains one field after `cohesion`:

```ts
  maxSettlements: number; // population-correlated slot cap, baked by the pipeline
```

`Settlement` becomes:

```ts
export interface Settlement {
  id: string;
  name: string;
  note: string; // one-line tooltip, valid for ca. 1100
  land: string; // id into MapData.regions
  unlocked: boolean; // locked settlements are authored but not rendered
  x: number;
  y: number;
  labelDy?: number; // label offset override to dodge a colliding neighbour
}
```

- [ ] **Step 2: Write the failing tests**

In `tests/data.test.ts`, REPLACE the existing test `"has 18 curated settlements valid for 1100"` with:

```ts
  it("has 25 authored settlements, exactly one unlocked per land", () => {
    expect(data.settlements.length).toBe(25);
    const ids = data.settlements.map((s) => s.id);
    expect(new Set(ids).size).toBe(25);
    expect(ids).toEqual([...ids].sort());
    const landIds = new Set(data.regions.map((r) => r.id));
    const unlockedPerLand = new Map<string, number>();
    for (const s of data.settlements) {
      expect(s.name.length).toBeGreaterThan(0);
      expect(s.note.length).toBeGreaterThan(20);
      expect(landIds.has(s.land)).toBe(true);
      expect(typeof s.unlocked).toBe("boolean");
      expect(s.x).toBeGreaterThan(0);
      expect(s.x).toBeLessThan(1000);
      expect(s.y).toBeGreaterThan(0);
      expect(s.y).toBeLessThan(1400);
      expect(s.name.toLowerCase()).not.toContain("riga");
      expect(s.name.toLowerCase()).not.toContain("rīga");
      if (s.unlocked) {
        unlockedPerLand.set(s.land, (unlockedPerLand.get(s.land) ?? 0) + 1);
      }
    }
    expect(data.settlements.filter((s) => s.unlocked).length).toBe(20);
    for (const r of data.regions) {
      expect(unlockedPerLand.get(r.id)).toBe(1);
    }
    const locked = data.settlements.filter((s) => !s.unlocked).map((s) => s.id);
    expect(locked.sort()).toEqual(["apuole", "ikskile", "koknese", "mezotne", "otepaa"]);
  });

  it("maxSettlements follows the population formula and bounds authored counts", () => {
    const authoredPerLand = new Map<string, number>();
    for (const s of data.settlements) {
      authoredPerLand.set(s.land, (authoredPerLand.get(s.land) ?? 0) + 1);
    }
    for (const r of data.regions) {
      const expected = Math.min(10, Math.max(1, Math.round(r.population / 10000)));
      expect(r.maxSettlements).toBe(expected);
      expect(authoredPerLand.get(r.id) ?? 0).toBeGreaterThanOrEqual(1);
      expect(authoredPerLand.get(r.id) ?? 0).toBeLessThanOrEqual(r.maxSettlements);
    }
    const region = (id: string) => data.regions.find((r) => r.id === id)!;
    expect(region("ravala").maxSettlements).toBe(2);
    expect(region("harjumaa").maxSettlements).toBe(2);
    expect(region("kursa").maxSettlements).toBe(5);
    expect(region("zemaitija").maxSettlements).toBe(7);
    expect(region("eastern-aukstaitija").maxSettlements).toBe(9);
  });
```

In `tests/panel.test.ts`, three fixtures must satisfy the widened types:

1. The `talava` Region literal gains `maxSettlements: 3,` after `cohesion: "high",`.
2. The `jersika` Region literal gains `maxSettlements: 4,` after `cohesion: "high",`.
3. The `settlementTooltipText` test's literal becomes:

```ts
    const s = {
      id: "daugmale", name: "Daugmale", note: "Great Liv hillfort.",
      land: "livzeme", unlocked: true, x: 100, y: 200,
    };
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npm run test`
Expected: FAIL - settlements have no `land`/`unlocked`, count is 18, regions have no `maxSettlements`.

- [ ] **Step 4: Rewrite SETTLEMENTS and add validations in `scripts/prepare-data.mjs`**

Replace the whole SETTLEMENTS constant with (comment included):

```js
// Attested or archaeologically grounded sites ca. 1100, at the modern
// coordinates of their hillforts/harbours. Notes are one-line tooltips
// and must hold for 1100 specifically (hence Daugmale at its peak, an
// unremarkable Ikskile, and no Riga - it does not exist yet). Each land
// starts with exactly one unlocked settlement; locked entries are
// authored ahead for future unlocks and are not rendered. labelDy drops
// a label below its dot where neighbours would collide.
const SETTLEMENTS = [
  { id: "apuole", name: "Apuolė", land: "pilsotas", unlocked: false, lon: 21.55, lat: 56.17, note: "Old Curonian stronghold in the north of the land, besieged by sea-kings in centuries past." },
  { id: "daugmale", name: "Daugmale", land: "livzeme", unlocked: true, lon: 24.43, lat: 56.84, note: "Great Liv hillfort and market above the Daugava crossing, at the height of its power." },
  { id: "ikskile", name: "Ikšķile", land: "livzeme", unlocked: false, lon: 24.5, lat: 56.84, labelDy: 16, note: "Liv riverside village; nothing yet marks it out from its neighbours." },
  { id: "impiltis", name: "Impiltis", land: "pilsotas", unlocked: true, lon: 21.22, lat: 56.05, note: "Stronghold of the coastal Curonians above the lagoon shore." },
  { id: "jersika", name: "Jersika", land: "jersika", unlocked: true, lon: 26.2, lat: 56.27, note: "Seat of the Latgalian princes of the Daugava, looking east to Polotsk." },
  { id: "kareda", name: "Kareda", land: "jarvamaa", unlocked: true, lon: 25.75, lat: 58.93, note: "Village among the fields at the heart of the causeway country, where the elders meet." },
  { id: "kernave", name: "Kernavė", land: "lietuva", unlocked: true, lon: 24.85, lat: 54.89, note: "Cluster of hillforts above the Neris, foremost among the strongholds of Lietuva." },
  { id: "koknese", name: "Koknese", land: "jersika", unlocked: false, lon: 25.44, lat: 56.64, note: "Fortified town on the Daugava's right bank, tollgate of the river road." },
  { id: "lindanise", name: "Lindanise", land: "ravala", unlocked: true, lon: 24.74, lat: 59.44, note: "Harbour below the fort where the Gotland run turns east for Novgorod." },
  { id: "medvegalis", name: "Medvėgalis", land: "zemaitija", unlocked: true, lon: 22.11, lat: 55.635, note: "Highest of the Samogitian hillforts, refuge of the lineages around it." },
  { id: "mezotne", name: "Mežotne", land: "zemgale", unlocked: false, lon: 24.05, lat: 56.44, note: "Semigallian stronghold guarding the Lielupe river road." },
  { id: "otepaa", name: "Otepää", land: "ugandi", unlocked: false, lon: 26.46, lat: 58.06, note: "Upland stronghold of Ugandi on the road from the Rus' towns." },
  { id: "punia", name: "Punia", land: "dainava", unlocked: true, lon: 24.09, lat: 54.513, note: "Hillfort above the Nemunas bend, chief refuge of the Dainava bands." },
  { id: "selpils", name: "Sēlpils", land: "selija", unlocked: true, lon: 25.68, lat: 56.6, labelDy: 16, note: "Old fort of the Selonians on the Daugava's wooded left bank." },
  { id: "soontagana", name: "Soontagana", land: "laanemaa", unlocked: true, lon: 24.08, lat: 58.55, note: "Stronghold of the western Estonians amid bogs, reachable only on winter roads." },
  { id: "sudargas", name: "Sudargas", land: "suduva", unlocked: true, lon: 22.63, lat: 55.06, note: "Line of hillforts above the Nemunas, watching the river road to the west." },
  { id: "talsi", name: "Talsi", land: "kursa", unlocked: true, lon: 22.59, lat: 57.24, note: "Curonian hillfort town among the lakes of Vanema." },
  { id: "tarbatu", name: "Tarbatu", land: "ugandi", unlocked: true, lon: 26.72, lat: 58.38, note: "Estonian hillfort above the Emajõgi crossing, key to the eastern road." },
  { id: "tarvanpea", name: "Tarvanpea", land: "virumaa", unlocked: true, lon: 26.355, lat: 59.346, note: "Chief hillfort of the Vironians where the coast road turns toward the east." },
  { id: "tervete", name: "Tērvete", land: "zemgale", unlocked: true, lon: 23.38, lat: 56.48, note: "Chief hillfort of the Semigallians, seat of their strongest chiefs." },
  { id: "trikata", name: "Trikāta", land: "talava", unlocked: true, lon: 25.7, lat: 57.54, note: "Latgalian chief's fort on the upper Gauja, heart of Tālava." },
  { id: "utena", name: "Utena", land: "eastern-aukstaitija", unlocked: true, lon: 25.6, lat: 55.49, note: "Old hillfort seat among the eastern lakes." },
  { id: "valjala", name: "Valjala", land: "saaremaa", unlocked: true, lon: 22.79, lat: 58.4, note: "Chief ringfort of the Osilians, lords of the island sea-roads." },
  { id: "varbola", name: "Varbola", land: "harjumaa", unlocked: true, lon: 24.47, lat: 59.03, note: "Great ringfort of Harjumaa, mightiest stronghold of the Estonian lands." },
  { id: "viliende", name: "Viliende", land: "sakala", unlocked: true, lon: 25.6, lat: 58.363, note: "Stronghold on the Sakala upland, seat of its strongest elders." },
];
```

Add `geoContains` to the existing d3-geo import:

```js
import { geoAzimuthalEqualArea, geoPath, geoArea, geoContains } from "d3-geo";
```

Add the slot formula helper next to the other roster validation code (before the LANDS loop that sums population):

```js
// Population-correlated settlement slots ("max cities"): one slot per
// ~10k people, clamped to 1..10. Deliberate game math, not demography.
const maxSettlementsFor = (population) =>
  Math.min(10, Math.max(1, Math.round(population / 10000)));
```

After `landFeatures` is built and the geoArea guard has run, add the settlement validations:

```js
// --- Settlement validation: known land, exactly one unlocked per land,
// authored count within the land's slot cap, and the coordinates really
// fall inside the claimed land (curation guard).
const landIdSet = new Set(LANDS.map((l) => l.id));
const unlockedPerLand = new Map();
const authoredPerLand = new Map();
for (const s of SETTLEMENTS) {
  if (!landIdSet.has(s.land)) {
    throw new Error(`Settlement ${s.id} claims unknown land ${s.land}`);
  }
  authoredPerLand.set(s.land, (authoredPerLand.get(s.land) ?? 0) + 1);
  if (s.unlocked) {
    unlockedPerLand.set(s.land, (unlockedPerLand.get(s.land) ?? 0) + 1);
  }
}
const landFeatureById = new Map(
  landFeatures.map((f) => [f.properties.land.id, f]),
);
for (const s of SETTLEMENTS) {
  if (!geoContains(landFeatureById.get(s.land), [s.lon, s.lat])) {
    throw new Error(
      `Settlement ${s.id} at ${s.lon},${s.lat} is not inside land ${s.land}`,
    );
  }
}
for (const land of LANDS) {
  if ((unlockedPerLand.get(land.id) ?? 0) !== 1) {
    throw new Error(`Land ${land.id} must have exactly one unlocked settlement`);
  }
  if ((authoredPerLand.get(land.id) ?? 0) > maxSettlementsFor(land.population)) {
    throw new Error(`Land ${land.id} has more authored settlements than slots`);
  }
}
```

In the settlements emit block, carry the new fields:

```js
  return {
    id: s.id,
    name: s.name,
    note: s.note,
    land: s.land,
    unlocked: s.unlocked,
    x: Math.round(p[0]),
    y: Math.round(p[1]),
    ...(s.labelDy !== undefined ? { labelDy: s.labelDy } : {}),
  };
```

In the regions emit block, add after `cohesion`:

```js
        maxSettlements: maxSettlementsFor(land.population),
```

- [ ] **Step 5: Regenerate and run tests**

Run: `npm run prepare-data && npm run test`
Expected: script log now shows 25 settlements; all tests pass. If a geoContains throw fires for one of the seven new sites, nudge that site's lon/lat by up to ~0.05 deg toward its land's interior (the intent is the named historical place; small shifts are cartographic tolerance), rerun, and note the final coordinates in the commit message.

- [ ] **Step 6: Run the type build**

Run: `npm run build`
Expected: clean (the panel.test literal was widened in Step 2; nothing else constructs Settlement values).

- [ ] **Step 7: Commit**

```bash
git add src/types.ts scripts/prepare-data.mjs tests/data.test.ts tests/panel.test.ts src/data/map.json
git commit -m "feat(balticmap): settlement slots, locked entries, full land coverage"
```

---

### Task 3: Emajogi and Parnu rivers

**Files:**
- Modify: `scripts/prepare-data.mjs` (RIVERS constant)
- Modify: `tests/data.test.ts` (river count upper bound)
- Regenerate: `src/data/map.json`

**Interfaces:**
- Consumes: existing exclusive primary-name river matching (matches on properties.name with name_en fallback; a feature joins at most one river; minor rivers warn-and-skip when unmatched).
- Produces: whitelist grows to 10 entries; map.json rivers may gain `emajogi` and `parnu`.

- [ ] **Step 1: Update the river count test**

In `tests/data.test.ts`, in the `"has the main rivers as path data"` test, change the upper bound line to:

```ts
    expect(ids.length).toBeLessThanOrEqual(10);
```

(Leave the lower bound at 5 - both new rivers are minor, warn-and-skip.)

- [ ] **Step 2: Add the whitelist entries**

In the RIVERS constant in `scripts/prepare-data.mjs`, add before the `narva` entry:

```js
  { id: "emajogi", name: "Emajõgi", major: false, match: ["emajogi", "emajõgi"] },
  { id: "parnu", name: "Pärnu", major: false, match: ["parnu", "pärnu"] },
```

- [ ] **Step 3: Regenerate and inspect the match**

Run: `npm run prepare-data`
Then: `node -e "const d=require('./src/data/map.json'); console.log(d.rivers.map(r=>r.id).join(','))"`
Expected: emajogi and parnu appear. If either warns as unmatched, inspect the cached Natural Earth Europe file for the real feature name (features near lon 26.5/lat 58.4 for Emajogi, lon 24.5/lat 58.5 for Parnu):
`node -e "const d=require('./scripts/.cache/ne_10m_rivers_europe.geojson'); for (const f of d.features) { const c=JSON.stringify(f.geometry.coordinates); if (c.includes('26.') && (f.properties.name||'').length) {} } "` - adapt as needed, e.g. filter features whose first coordinate falls in 25-28E / 57.5-59N and print `properties.name` / `name_en`. Add the discovered primary-name variant to the match list and regenerate. If Natural Earth simply lacks the river, accept the warn-and-skip (spec) and say so in the commit message.

- [ ] **Step 4: Run tests**

Run: `npm run test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/prepare-data.mjs tests/data.test.ts src/data/map.json
git commit -m "feat(balticmap): Emajogi and Parnu rivers for Estonia"
```

---

### Task 4: Render only unlocked settlements

**Files:**
- Modify: `src/map-render.ts`
- Modify: `tests/render.test.ts`

**Interfaces:**
- Consumes: `settlement.unlocked` from Task 2.
- Produces: dots/labels exist only for unlocked settlements; `RenderResult.settlementDots` keys only unlocked ids. Task 5's interaction wiring is unaffected (it iterates `settlementDots`).

- [ ] **Step 1: Write the failing tests**

In `tests/render.test.ts`, in the `"renders settlement dots and labels"` test, replace the three count assertions and add a locked-absence check so the test reads:

```ts
  it("renders settlement dots and labels", () => {
    const container = document.createElement("div");
    const { svg, settlementDots } = renderMap(data, container);
    const unlocked = data.settlements.filter((s) => s.unlocked);
    expect(unlocked.length).toBeLessThan(data.settlements.length);
    expect(settlementDots.size).toBe(unlocked.length);
    expect(svg.querySelectorAll("circle.settlement").length).toBe(unlocked.length);
    expect(svg.querySelectorAll("text.settlement-label").length).toBe(unlocked.length);
    expect(settlementDots.has("ikskile")).toBe(false);
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

- [ ] **Step 2: Run tests to verify the changed test fails**

Run: `npm run test`
Expected: FAIL - 25 dots rendered vs 20 expected, and `ikskile` has a dot.

- [ ] **Step 3: Filter in `src/map-render.ts`**

In the settlements loop, skip locked entries as the first statement:

```ts
  for (const s of data.settlements) {
    if (!s.unlocked) continue;
```

- [ ] **Step 4: Run tests**

Run: `npm run test`
Expected: PASS (interaction tests still pass - daugmale and livzeme are unlocked).

- [ ] **Step 5: Commit**

```bash
git add src/map-render.ts tests/render.test.ts
git commit -m "feat(balticmap): render only unlocked settlements"
```

---

### Task 5: Panel settlements line

**Files:**
- Modify: `src/panel.ts`
- Modify: `src/main.ts`
- Modify: `src/style.css`
- Modify: `tests/panel.test.ts`

**Interfaces:**
- Consumes: `Settlement.land`/`unlocked`, `Region.maxSettlements` from Task 2.
- Produces: `createPanel(container, onClose, peoples, factions, settlements: Settlement[])` - NEW fifth parameter. Panel shows a `p.panel-settlements` line: `Settlements: <unlocked name> (1/<maxSettlements>)`.

- [ ] **Step 1: Write the failing test**

`tests/panel.test.ts` uses hand-built fixtures. Make these exact changes:

1. Import Settlement: change the type import line to `import type { Faction, People, Region, Settlement } from "../src/types";`
2. Add a settlements fixture after the `factions` constant:

```ts
const settlements: Settlement[] = [
  {
    id: "trikata", name: "Trikāta", note: "Latgalian chief's fort.",
    land: "talava", unlocked: true, x: 10, y: 20,
  },
  {
    id: "jersika-town", name: "Jersika", note: "Seat of the princes.",
    land: "jersika", unlocked: true, x: 30, y: 40,
  },
];
```

3. All three existing `createPanel(container, ..., peoples, factions)` calls (panel.test.ts:49, 81, 91) gain `settlements` as the fifth argument, e.g. `createPanel(container, () => {}, peoples, factions, settlements)`.
4. Add inside the `describe("panel")` block:

```ts
  it("shows the settlements line with the unlocked settlement and slot cap", () => {
    const container = document.createElement("div");
    const panel = createPanel(container, () => {}, peoples, factions, settlements);
    panel.show(talava);
    expect(container.querySelector(".panel-settlements")!.textContent).toBe(
      "Settlements: Trikāta (1/3)",
    );
  });
```

(The `talava` fixture has `maxSettlements: 3` from Task 2.)

- [ ] **Step 2: Run tests to verify it fails**

Run: `npm run test`
Expected: FAIL - createPanel takes 4 args / no `.panel-settlements` element.

- [ ] **Step 3: Implement**

`src/panel.ts`:

- Import `Settlement` in the type import.
- Signature:

```ts
export function createPanel(
  container: HTMLElement,
  onClose: () => void,
  peoples: People[],
  factions: Faction[],
  settlements: Settlement[],
): Panel {
```

- Create the element with the others:

```ts
  const settlementsLine = document.createElement("p");
  settlementsLine.className = "panel-settlements";
```

- Append it after `cohesion` in the `root.append(...)` call (order: close, name, factionLine, peoplesLine, population, cohesion, settlementsLine, flavor, places).
- In `show(region)`:

```ts
      const home = settlements.find((s) => s.land === region.id && s.unlocked);
      settlementsLine.textContent = home
        ? `Settlements: ${home.name} (1/${region.maxSettlements})`
        : "";
```

`src/main.ts`: pass the new argument:

```ts
const panel = createPanel(app, () => interaction.deselect(), data.peoples, data.factions, data.settlements);
```

`src/style.css`: extend the stats selector group:

```css
.panel-population,
.panel-cohesion,
.panel-settlements {
  font-size: 13px;
  color: #8a7f6f;
  margin-top: 2px;
}
```

(Replace the existing `.panel-population, .panel-cohesion` group selector with this three-class version; keep the separate `.panel-population { margin-top: 8px; }` rule as is.)

- [ ] **Step 4: Run tests and build**

Run: `npm run test && npm run build`
Expected: tests pass, build clean.

- [ ] **Step 5: Commit**

```bash
git add src/panel.ts src/main.ts src/style.css tests/panel.test.ts
git commit -m "feat(balticmap): settlements line in region panel"
```

---

### Task 6: E2E visual verification in Chrome (main session)

Performed by the MAIN agent (standing user rule: Chrome pass before done). Chrome DevTools MCP tools; the dev server may pick a port other than 5173.

**Files:**
- Possibly modify: `scripts/prepare-data.mjs` (labelDy / label positions), `src/style.css`
- Regenerate: `src/data/map.json` after any constant change

- [ ] **Step 1: Start `npm run dev` (background), open the served URL in Chrome**

- [ ] **Step 2: Verify checklist**

1. Exactly 20 settlement dots; every land visibly has one (esp. the 7 new: Tarvanpea, Kareda, Viliende, Medvėgalis, Utena, Sudargas, Punia). No dot for Ikšķile/Koknese/Otepää/Mežotne/Apuolė.
2. No settlement-label collisions (programmatic bounding-box check plus screenshot).
3. Harjumaa renders as one contiguous polygon; Rävala hugs the northwest coast.
4. Emajõgi/Pärnu visible in Estonia if matched in Task 3.
5. Panel: selecting a land shows `Settlements: <name> (1/<max>)` with correct numbers (spot-check Rävala 1/2 - Lindanise; Eastern Aukštaitija 1/9 - Utena).
6. Tooltips (settlement + region), selection, dot-click guard, zoom/pan still work; console clean.

- [ ] **Step 3: Fix what the screenshot disproves** (labelDy/lon-lat nudges or CSS), regenerate, re-verify.

- [ ] **Step 4: `npm run test`, commit any tuning**

```bash
git add -A
git commit -m "fix(balticmap): visual tuning from Chrome verification pass"
```

- [ ] **Step 5: Merge**

```bash
git checkout main
git merge --no-ff feature/settlement-slots -m "Merge feature/settlement-slots: slots, coverage, Harjumaa fix"
```
