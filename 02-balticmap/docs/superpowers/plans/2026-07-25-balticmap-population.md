# Population and Cohesion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Attach population (game-estimate integers) and political cohesion (low/medium/high) to the 15 lands, validated in the data pipeline and displayed in the info panel and the hover tooltip.

**Architecture:** The LANDS config in `scripts/prepare-data.mjs` gains two fields per land plus fail-fast validation (multiples of 5,000; total exactly 650,000); the regenerated `map.json` carries them into the runtime. `src/panel.ts` exports two pure helpers (`formatPopulation`, `tooltipText`) used by the panel and by `main.ts`'s tooltip call; the tooltip div becomes two-line via `white-space: pre-line`.

**Tech Stack:** Existing stack only - Vite + TypeScript, vitest + happy-dom. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-07-25-balticmap-population-design.md`

## Global Constraints

- Populations are GAME ESTIMATES, all positive multiples of 5,000; map total exactly 650,000. Display only as bands: `~45k` form, derived as `~${population / 1000}k`.
- Cohesion is exactly one of `"low" | "medium" | "high"`.
- Panel lines (exact strings): `Population: ~45k` and `Cohesion: high`, placed between the peoples line and the flavor text, styled like `.panel-peoples`.
- Tooltip becomes two lines in one div: line 1 the land name, line 2 `~45k - high cohesion`.
- Per-land values (verbatim from spec): ravala 30000 medium; virumaa 35000 medium; jarvamaa 25000 medium; laanemaa-saaremaa 40000 medium; ugandi-sakala 50000 medium; livzeme 20000 medium; kursa 45000 high; zemgale-selija 45000 medium; talava 30000 high; jersika 35000 high; pilsotas 15000 medium; zemaitija 70000 low; aukstaitija 150000 low; suduva 30000 low; dainava 30000 low.
- Every task ends with `npm test` fully green; Task 2 also requires `npm run build` green. (`tsc` type-checks `tests/` too, which is why Task 1 updates the panel-test fixtures.)
- No em dashes anywhere; plain hyphen in the tooltip line.

## Deviation & escalation protocol

If reality contradicts this plan (a command fails, the prepare script throws on data that should be valid), STOP and report back rather than inventing a workaround. The prepare script needs network access to GISCO; retry a failed download once, then report BLOCKED.

---

### Task 1: Data pipeline - population and cohesion fields

**Files:**
- Modify: `scripts/prepare-data.mjs` (LANDS entries, validation block, region emit)
- Modify: `src/types.ts` (Region gains fields; new Cohesion type)
- Modify: `tests/data.test.ts` (new test)
- Modify: `tests/panel.test.ts` (fixtures gain the two new required fields ONLY - no new assertions here)
- Regenerate: `src/data/map.json`

**Interfaces:**
- Produces: `Region.population: number` (positive multiple of 5000) and `Region.cohesion: Cohesion` where `export type Cohesion = "low" | "medium" | "high"` in `src/types.ts`. Task 2 relies on exactly these names.

- [ ] **Step 1: Add the failing data test**

In `tests/data.test.ts`, add inside the top-level `describe("map.json (anno 1184)")` block, after the `"zemgale-selija carries both Semigallians and Selonians"` test:

```typescript
  it("every region has a game-estimate population and a cohesion tier", () => {
    let total = 0;
    for (const r of data.regions) {
      expect(Number.isInteger(r.population)).toBe(true);
      expect(r.population).toBeGreaterThan(0);
      expect(r.population % 5000).toBe(0);
      expect(["low", "medium", "high"]).toContain(r.cohesion);
      total += r.population;
    }
    expect(total).toBe(650000);
    const byId = new Map(data.regions.map((r) => [r.id, r]));
    expect(byId.get("kursa")).toMatchObject({ population: 45000, cohesion: "high" });
    expect(byId.get("aukstaitija")).toMatchObject({ population: 150000, cohesion: "low" });
    expect(byId.get("livzeme")).toMatchObject({ population: 20000, cohesion: "medium" });
  });
```

- [ ] **Step 2: Run the data test to verify it fails**

Run: `npx vitest run tests/data.test.ts`
Expected: FAIL - `population`/`cohesion` are undefined in the current map.json.

- [ ] **Step 3: Update the types**

In `src/types.ts`, add above the `Region` interface:

```typescript
export type Cohesion = "low" | "medium" | "high";
```

and change the `Region` interface to:

```typescript
export interface Region {
  id: string;
  name: string;
  peoples: string[]; // ids into MapData.peoples; first = primary = fill color
  population: number; // deliberate game estimate; positive multiple of 5000
  cohesion: Cohesion; // political concentration - NOT derivable from population
  flavor: string;
  places: string[];
  path: string;
}
```

- [ ] **Step 4: Add the fields to every LANDS entry**

In `scripts/prepare-data.mjs`, add this comment directly above `const LANDS = [`:

```javascript
// population/cohesion are deliberate GAME ESTIMATES, not historical facts:
// anchored to ~180k for the Estonian lands (common ~1200 estimate) and
// 650,000 for the whole map, rounded to the nearest 5,000. Cohesion is
// political concentration - it will later govern mobilization, so a
// cohesive 45k land can outweigh a fragmented 150k one.
```

Then add to each land object, on one line directly after its `places: [...]` line (values verbatim):

```javascript
// in ravala:            population: 30000, cohesion: "medium",
// in virumaa:           population: 35000, cohesion: "medium",
// in jarvamaa:          population: 25000, cohesion: "medium",
// in laanemaa-saaremaa: population: 40000, cohesion: "medium",
// in ugandi-sakala:     population: 50000, cohesion: "medium",
// in livzeme:           population: 20000, cohesion: "medium",
// in kursa:             population: 45000, cohesion: "high",
// in zemgale-selija:    population: 45000, cohesion: "medium",
// in talava:            population: 30000, cohesion: "high",
// in jersika:           population: 35000, cohesion: "high",
// in pilsotas:          population: 15000, cohesion: "medium",
// in zemaitija:         population: 70000, cohesion: "low",
// in aukstaitija:       population: 150000, cohesion: "low",
// in suduva:            population: 30000, cohesion: "low",
// in dainava:           population: 30000, cohesion: "low",
```

(Write the actual `population: 30000, cohesion: "medium",` lines into the objects - the list above maps land id to values.)

- [ ] **Step 5: Add validation and emit the fields**

In `scripts/prepare-data.mjs`, directly after the existing LANDS-partition sanity check (the block ending `throw new Error(\`LANDS config does not partition the NUTS set...\`)`), add:

```javascript
// Population/cohesion sanity: game estimates must stay coherent.
const COHESION_TIERS = new Set(["low", "medium", "high"]);
const EXPECTED_TOTAL_POPULATION = 650000;
let totalPopulation = 0;
for (const land of LANDS) {
  if (
    !Number.isInteger(land.population) ||
    land.population <= 0 ||
    land.population % 5000 !== 0
  ) {
    throw new Error(`Population for ${land.id} must be a positive multiple of 5000`);
  }
  if (!COHESION_TIERS.has(land.cohesion)) {
    throw new Error(`Unknown cohesion "${land.cohesion}" for ${land.id}`);
  }
  totalPopulation += land.population;
}
if (totalPopulation !== EXPECTED_TOTAL_POPULATION) {
  throw new Error(
    `Total population ${totalPopulation} != ${EXPECTED_TOTAL_POPULATION} - ` +
      `update EXPECTED_TOTAL_POPULATION intentionally when the roster changes`,
  );
}
```

Then in the `regions:` mapping (the object literal returning `id, name, peoples, flavor, places, path`), add the two fields after `peoples: land.peoples,`:

```javascript
        population: land.population,
        cohesion: land.cohesion,
```

- [ ] **Step 6: Update the panel test fixtures (types only, no new assertions)**

In `tests/panel.test.ts`, the two `Region` fixtures must satisfy the new interface. Add to the `talava` fixture object after its `peoples` line:

```typescript
  population: 30000,
  cohesion: "high",
```

and to the `jersika` fixture object after its `peoples` line:

```typescript
  population: 35000,
  cohesion: "high",
```

- [ ] **Step 7: Regenerate map.json**

Run: `npm run prepare-data`
Expected: `Wrote src/data/map.json: 15 lands, 9 peoples, 4 neighbors, 14 labels`. Any thrown error: STOP and report.

- [ ] **Step 8: Run the full suite and build**

Run: `npm test`
Expected: all 7 files pass (34 tests: the 33 existing + the new data test).

Run: `npm run build`
Expected: green (this is why Step 6 exists).

- [ ] **Step 9: Commit**

```bash
git add scripts/prepare-data.mjs src/types.ts tests/data.test.ts tests/panel.test.ts src/data/map.json
git commit -m "feat(balticmap): population and cohesion data for the 15 lands"
```

---

### Task 2: Display - panel lines and two-line tooltip

**Files:**
- Modify: `src/panel.ts` (two exported helpers; two new panel lines)
- Modify: `src/main.ts` (tooltip call uses tooltipText)
- Modify: `src/style.css` (tooltip pre-line; two panel line styles)
- Modify: `tests/panel.test.ts` (new assertions and helper tests)

**Interfaces:**
- Consumes: `Region.population`, `Region.cohesion` from Task 1.
- Produces: `formatPopulation(population: number): string` (returns `~45k` form) and `tooltipText(region: Region): string` (returns `` `${name}\n${band} - ${cohesion} cohesion` ``), both exported from `src/panel.ts`.

- [ ] **Step 1: Add the failing tests**

In `tests/panel.test.ts`:

(a) extend the import line from `../src/panel`:

```typescript
import { createPanel, createTooltip, formatPopulation, tooltipText } from "../src/panel";
```

(b) inside the first test (`"is hidden initially, shows land details on show()"`), after the `.panel-peoples` expectation, add:

```typescript
    expect(container.querySelector(".panel-population")!.textContent).toBe(
      "Population: ~30k",
    );
    expect(container.querySelector(".panel-cohesion")!.textContent).toBe(
      "Cohesion: high",
    );
```

(c) add a new describe block at the end of the file:

```typescript
describe("population helpers", () => {
  it("formats populations as 5k-rounded bands", () => {
    expect(formatPopulation(30000)).toBe("~30k");
    expect(formatPopulation(45000)).toBe("~45k");
    expect(formatPopulation(150000)).toBe("~150k");
  });

  it("builds a two-line tooltip with name, band, and cohesion", () => {
    expect(tooltipText(talava)).toBe("Tālava\n~30k - high cohesion");
    expect(tooltipText(jersika)).toBe("Jersika\n~35k - high cohesion");
  });
});
```

- [ ] **Step 2: Run the panel test to verify it fails**

Run: `npx vitest run tests/panel.test.ts`
Expected: FAIL - `formatPopulation`/`tooltipText` are not exported; `.panel-population` element does not exist.

- [ ] **Step 3: Implement panel.ts changes**

In `src/panel.ts`:

(a) add after the `formatPeoples` function:

```typescript
export function formatPopulation(population: number): string {
  return `~${population / 1000}k`;
}

export function tooltipText(region: Region): string {
  return `${region.name}\n${formatPopulation(region.population)} - ${region.cohesion} cohesion`;
}
```

(b) in `createPanel`, add after the `peoplesLine` declaration:

```typescript
  const population = document.createElement("p");
  population.className = "panel-population";
  const cohesion = document.createElement("p");
  cohesion.className = "panel-cohesion";
```

(c) change the append line to:

```typescript
  root.append(close, name, peoplesLine, population, cohesion, flavor, places);
```

(d) in `show(region)`, add after the `peoplesLine.textContent` line:

```typescript
      population.textContent = `Population: ${formatPopulation(region.population)}`;
      cohesion.textContent = `Cohesion: ${region.cohesion}`;
```

- [ ] **Step 4: Use tooltipText in main.ts**

In `src/main.ts`, extend the panel import:

```typescript
import { createPanel, createTooltip, tooltipText } from "./panel";
```

and change the onHover line:

```typescript
    if (region) tooltip.show(tooltipText(region), clientX, clientY);
```

- [ ] **Step 5: Style the new lines and the two-line tooltip**

In `src/style.css`:

(a) add `white-space: pre-line;` to the existing `.tooltip` rule (after `pointer-events: none;`).

(b) add after the `.panel-peoples` rule block:

```css
.panel-population,
.panel-cohesion {
  font-size: 13px;
  color: #8a7f6f;
  margin-top: 2px;
}

.panel-population {
  margin-top: 8px;
}
```

- [ ] **Step 6: Run the full suite and build**

Run: `npm test`
Expected: all 7 files pass (36 tests: 34 from Task 1 + the 2 new helper tests; the extended first panel test is not a new count).

Run: `npm run build`
Expected: green.

- [ ] **Step 7: Commit**

```bash
git add src/panel.ts src/main.ts src/style.css tests/panel.test.ts
git commit -m "feat(balticmap): show population and cohesion in panel and tooltip"
```

---

### Task 3: E2E verification in Chrome (orchestrator runs this, not a subagent)

**Files:** none unless a visual defect needs fixing.

- [ ] **Step 1:** Dev server (already running or `npm run dev`), reload the page.
- [ ] **Step 2:** Verify with screenshots:
  - Hover Kursa: tooltip shows two lines - `Kursa` / `~45k - high cohesion`.
  - Hover Aukstaitija: `~150k - low cohesion` (the fragmented-giant read).
  - Click Talava: panel shows `Population: ~30k` and `Cohesion: high` between peoples line and flavor, styled like the peoples line.
  - Diacritics still render; no layout breakage in panel or tooltip.
- [ ] **Step 3:** Only after checks pass: report done with screenshots, then superpowers:finishing-a-development-branch.
