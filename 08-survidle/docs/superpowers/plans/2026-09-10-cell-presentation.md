# Unified Cell Presentation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every displayed cell one typed terrain and surface description while removing temporary-condition glyph substitutions.

**Architecture:** `src/sim/cellstatus.ts` owns exhaustive terrain, snow, and ice semantics. `src/ui/cellpresentation.ts` applies player knowledge and produces stable glyphs and CSS classes for the map and popup. Existing location text uses the same semantic formatter, preventing visual and textual states from choosing ice or snow independently.

**Tech Stack:** TypeScript, Vite, Vitest with jsdom, CSS, headless Chrome CDP harness.

**Spec:** `docs/superpowers/specs/2026-09-10-cell-presentation-design.md`

## Global Constraints

- Sea remains `~`, lake remains `-`, and meadow remains `'`, `.`, or `,` under snow and ice.
- `=` and `*` are not map condition glyphs.
- Thin ice background remains `#142533`; safe ice remains `#243746`.
- Unknown, remembered, and inherited cells never sample current snow or ice.
- Marks retain their own cell background and no border or overlay is added.
- Mechanical routing, terrain generation, weather state, and save data do not change.

---

### Task 1: Central semantic cell status

**Files:**
- Create: `src/sim/cellstatus.ts`
- Create: `tests/cellstatus.test.ts`

**Interfaces:**
- Consumes: `Terrain`, `LocalGroundWeather`, `World`, `GameState`, `cellAt`, `fieldsAt`, `groundAt`, `iceMode`, `DEEP_SNOW_CM`.
- Produces: `CellSurface`, `SnowCover`, `cellSurface`, `surfaceOf`, `terrainHeading`, `surfaceHeading`, `surfaceLocation`, `SNOW_SHOWN_CM`.

- [ ] **Step 1: Write failing semantic matrix tests**

Test literal cases for open sea, thin lake ice, safe sea ice, bare meadow, snow-covered meadow, deep snow over rock, and every base terrain. Assert complete player-facing headings and location phrases.

- [ ] **Step 2: Verify the tests fail because the module is absent**

Run: `npx vitest run tests/cellstatus.test.ts`

Expected: FAIL resolving `../src/sim/cellstatus`.

- [ ] **Step 3: Implement the discriminated union and formatters**

```ts
export type SnowCover = "none" | "cover" | "deep";
export type CellSurface =
  | { kind: "water"; terrain: "water"; water: "lake" | "sea"; ice: IceMode }
  | { kind: "land"; terrain: Exclude<Terrain, "water">; snow: SnowCover };

export function surfaceOf(
  terrain: Terrain,
  water: "lake" | "sea",
  ground: Pick<LocalGroundWeather, "snowCm" | "iceCm">,
): CellSurface;
export function cellSurface(state: GameState, world: World, cell: number): CellSurface;
export function terrainHeading(terrain: Terrain): string;
export function surfaceHeading(surface: CellSurface): string;
export function surfaceLocation(surface: CellSurface): string;
```

Use `SNOW_SHOWN_CM = 5` and `DEEP_SNOW_CM` only in `surfaceOf`. Use complete `Record<Terrain, string>` tables and exhaustive surface-kind switches.

- [ ] **Step 4: Run the semantic tests and commit**

Run: `npx vitest run tests/cellstatus.test.ts`

```bash
git add src/sim/cellstatus.ts tests/cellstatus.test.ts
git commit -m "feat(survidle): centralize cell surface meaning"
```

### Task 2: Knowledge-aware UI projection and stable glyphs

**Files:**
- Create: `src/ui/cellpresentation.ts`
- Modify: `src/ui/map.ts`
- Modify: `tests/ui.test.ts`
- Modify: `tests/map-layers.test.ts`
- Create: `tests/cellpresentation.test.ts`

**Interfaces:**
- Consumes: Task 1 status and formatters, map knowledge values, `groundGlyph`, and optional resolved ground weather.
- Produces: `CellKnowledge`, `CellPresentation`, `cellPresentation`, and a condition-free `visualGround(seed, x, y, terrain, base, detail)`.

- [ ] **Step 1: Write failing observation and glyph tests**

```ts
export type CellKnowledge = "unknown" | "current" | "remembered" | "inherited";
export type CellPresentation =
  | { knowledge: "unknown"; heading: "unknown ground"; glyph: " "; classes: readonly string[] }
  | { knowledge: "remembered" | "inherited"; terrain: Terrain; heading: string; glyph: string; classes: readonly string[] }
  | { knowledge: "current"; surface: CellSurface; heading: string; location: string; glyph: string; classes: readonly string[] };
```

Prove unknown and non-current calls never invoke the supplied ground resolver. Current ice returns an underlying water glyph and ice class. Current snow returns an underlying meadow glyph and snow classes. Detailed frozen-water and snowy-meadow fixtures return terrain forms only.

- [ ] **Step 2: Verify failures against the current substitutions**

Run: `npx vitest run tests/cellpresentation.test.ts tests/ui.test.ts tests/map-layers.test.ts`

Expected: FAIL because the adapter is absent and `visualGround` emits `=` and `*`.

- [ ] **Step 3: Implement the adapter and remove condition substitutions**

Return unknown before reading terrain, and remembered or inherited after reading base terrain but before reading ground. Only current knowledge calls `surfaceOf` or `cellSurface`. Remove condition parameters and branches from `visualGround`; remove the single-cell `glyph = "="` and `glyph = "*"` assignments while retaining classes.

- [ ] **Step 4: Run the focused tests and commit**

Run: `npx vitest run tests/cellpresentation.test.ts tests/ui.test.ts tests/map-layers.test.ts`

```bash
git add src/ui/cellpresentation.ts src/ui/map.ts tests/cellpresentation.test.ts tests/ui.test.ts tests/map-layers.test.ts
git commit -m "refactor(survidle): keep cell terrain glyphs stable"
```

### Task 3: Migrate descriptions and prevent remote surface leaks

**Files:**
- Modify: `src/ui/map.ts`
- Modify: `src/ui/tip.ts`
- Modify: `src/sim/position.ts`
- Modify: `src/style.css`
- Modify: `tests/tip.test.ts`
- Modify: `tests/siting.test.ts`
- Modify: `tests/local-weather-ui.test.ts`
- Modify: `tests/layout.test.ts`

**Interfaces:**
- Consumes: Task 1 semantic formatters and Task 2 presentation adapter.
- Produces: consistent map info, popup headings, accessibility labels, current-location phrases, and legend entries.

- [ ] **Step 1: Write failing cross-surface contract tests**

For the same naturally frozen cell, assert map `aria-label`, `data-map-info`, popup heading, and current-location description contain `safe ice`. For snow-covered meadow, assert all current-cell surfaces say `snow-covered meadow` while retaining a meadow glyph. For remembered and inherited fixtures, assert map and popup expose base terrain but contain no current snow or ice text or classes.

- [ ] **Step 2: Verify the duplicated labels fail**

Run: `npx vitest run tests/tip.test.ts tests/siting.test.ts tests/local-weather-ui.test.ts tests/layout.test.ts`

Expected: FAIL because popup or map still reports base water and non-current cells carry current surface classes.

- [ ] **Step 3: Replace duplicate tables and wire consumers**

Delete `TERRAIN_NAME` from `map.ts`, `GROUND` from `tip.ts`, and the terrain phrase table from `position.ts`. Use `cellPresentation` for map and popup text and `surfaceLocation(cellSurface(...))` for the survivor's current unnamed location. Preserve named-place headings and add shared surface text beneath them.

Classify map knowledge from mapped state plus current viewshed. Apply snow and ice classes only to current cells. At coarse zoom, apply live surface only when the block intersects the viewshed. Remove `= ice` from the legend and demonstrate thin and safe ice with underlying water glyphs on their background classes.

- [ ] **Step 4: Update CSS**

Remove ice foreground overrides so condition is communicated only by background. Retain ice background and snow foreground rules. Add legend selectors for the same ice fills without a new symbol.

- [ ] **Step 5: Run cross-surface tests and commit**

Run: `npx vitest run tests/cellstatus.test.ts tests/cellpresentation.test.ts tests/tip.test.ts tests/siting.test.ts tests/local-weather-ui.test.ts tests/layout.test.ts tests/ui.test.ts tests/map-layers.test.ts`

```bash
git add src/ui/map.ts src/ui/tip.ts src/sim/position.ts src/style.css tests/tip.test.ts tests/siting.test.ts tests/local-weather-ui.test.ts tests/layout.test.ts
git commit -m "refactor(survidle): unify displayed cell descriptions"
```

### Task 4: Browser references and final verification

**Files:**
- Modify: `scripts/map-shots.mjs`
- Modify: `docs/map-shots/README.md`
- Modify: `docs/map-shots/*.png`
- Modify: `tests/weather-scenarios.test.ts`

**Interfaces:**
- Consumes: deterministic weather scenarios and completed cell presentation.
- Produces: simulation-backed visual proof and live frozen-water URL.

- [ ] **Step 1: Strengthen browser assertions**

Assert frozen water has safe-ice backgrounds, no `=` glyphs, and retained `~` or `-` glyphs. Assert persisted snow has no `*` glyphs and retains terrain glyphs. Continue checking borders and viewshed weather gates.

- [ ] **Step 2: Run and inspect all headless scenarios**

Run: `SHOTS_URL=http://127.0.0.1:5175/prototypes/08/ npm run shots`

Expected: all nine scenarios pass, including more than 20 safe-ice cells. Inspect frozen-water and persisted-snow for stable glyphs, marker precedence, region borders, and no seams.

- [ ] **Step 3: Run repository verification**

```bash
npm test
npm run build
/Users/janis.kirsteins/Projects/prototypes/node_modules/.bin/biome lint 08-survidle/src 08-survidle/tests 08-survidle/scripts
git diff --check
```

Expected: no failures or errors.

- [ ] **Step 4: Commit references and final integration**

```bash
git add scripts/map-shots.mjs docs/map-shots/README.md docs/map-shots/*.png tests/weather-scenarios.test.ts
git commit -m "test(survidle): capture stable winter cell glyphs"
```

- [ ] **Step 5: Leave latest dev server running**

Verify `http://127.0.0.1:5175/prototypes/08/?seed=17&weather-shot=frozen-water` returns HTTP 200 and the footer reports the final commit.
