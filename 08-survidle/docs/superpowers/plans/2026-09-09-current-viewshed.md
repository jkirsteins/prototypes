# Current Viewshed Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Distinguish terrain visible now from remembered terrain with a radial, terrain-aware viewshed, without exposing dynamic fire or wildlife state through occlusion.

**Architecture:** `sim/sight.ts` remains the single source of current visibility. It computes a Euclidean viewshed over the existing 300 m cells, using the generated elevation field and terrain canopy as blockers. `ui/map.ts` consumes that set only at one-cell-per-glyph zooms, adds a remembered-ground class, and gates live firelight and fire markers. Features that need state the game does not yet have are recorded in roadmap dependency order instead of being faked in the renderer.

**Tech Stack:** TypeScript, Vitest, Vite, DOM/CSS map renderer.

**Spec:** `docs/superpowers/specs/2026-09-03-survidle-realism-roadmap.md`, section 8, plus `docs/roadmap-additions.md`.

## Global Constraints

- One simulation cell is 300 m.
- Cosmetic 50 m and 100 m details never affect mechanics, routing, detection, or line of sight.
- Current visibility applies only where one glyph is one simulation cell.
- A blocker is visible; cells hidden behind it are not.
- Dynamic markers and animation never reveal current state through occlusion.
- A luminous camp fire uses its own five-kilometre line-of-sight range at night; it does not borrow the terrain's daylight range.
- A nearby source lights foreground cells with direct line of sight; blocked cells stay remembered, so the footprint can straddle an occlusion boundary while the one-cell source remains whole or hidden.
- Weather attenuation is deferred until roadmap 7 provides a shared per-cell atmospheric transmission field. The current rain overlay must not be presented as fog or physical extinction.
- No subject-level heard-animal marker ships until the simulation records a localized sound event.

---

### Task 1: Radial topographic viewshed

**Files:**
- Modify: `src/sim/sight.ts`
- Test: `tests/sight.test.ts`

**Interfaces:**
- Consumes: `fieldsAt(seed, x, y).e`, `terrainOf(world, x, y)`, `CELL_KM`.
- Produces: `visibleCells(state, world, cal, cell): ReadonlySet<number>` with Euclidean range and terrain/canopy occlusion.

- [x] Add a failing test proving no visible cell lies outside `sightRangeCells` by Euclidean distance.
- [x] Run `npm test -- --run tests/sight.test.ts` and verify the square-edge assertion fails.
- [x] Keep dense perimeter rays but stop them at the Euclidean radius, producing a circular rather than square maximum range.
- [x] Add elevation-angle blocking using cell elevation, canopy height, and Earth curvature.
- [x] Add a failing real-world test that finds an open ridge and proves it hides lower ground behind it.
- [x] Cache a bounded set of immutable viewsheds so recurring daylight ranges and redraw reads do not retrace the same terrain.
- [x] Run the sight suite until both radial range and ridge occlusion pass without regressing canopy and night behavior.

### Task 2: Visible-now and remembered rendering

**Files:**
- Modify: `src/ui/map.ts`
- Modify: `src/style.css`
- Test: `tests/ui.test.ts`
- Test: `tests/emberui.test.ts`
- Test: `tests/animal-agents.test.ts`

**Interfaces:**
- Consumes: `visibleCells(...)` from Task 1.
- Produces: `memory` on mapped current-life cells outside the current viewshed at one-cell-per-glyph zooms.

- [x] Add failing UI tests for a visible cell, a remembered current-life cell, inherited journal ground, and unknown ground.
- [x] Add a failing test proving an occluded campfire does not render a live `mk-fire` marker or light rings.
- [x] Compute the current viewshed once per map render at cell-scale zooms.
- [x] Add `memory` only to known current-life terrain outside that set; leave inherited `.dim` and unknown `.fog` distinct.
- [x] Render an occluded camp by its persistent site marker instead of its current fire or coals state.
- [x] Show a nearby unobstructed night fire as a whole luminous source while leaving its surrounding dark terrain remembered.
- [x] Show a distant unobstructed fire as a subdued source without giving it a local light footprint.
- [x] Clip nearby firelight to direct foreground line of sight so its footprint can straddle the visible-memory border, and remove animation from remembered ground.
- [x] Add a fixed desaturated memory treatment and update the legend.
- [x] Run focused UI, fire UI, wildlife, and sight tests.

### Task 3: Roadmap dependency order

**Files:**
- Modify: `docs/roadmap-additions.md`
- Modify: `docs/superpowers/specs/2026-09-03-survidle-realism-roadmap.md`

**Interfaces:**
- Consumes: the boundary established by Tasks 1 and 2.
- Produces: an ordered record for weather visibility, animal detection and hearing, spatial wildfire, smoke, and burn succession.

- [x] Make Burn scars point to forest-fire item 8 rather than treating spreading fire as an unspecified alternative.
- [x] Add the visibility foundation as a prerequisite for fog, animal detection, and wildfire presentation.
- [x] Specify that smoke uses a density veil over preserved terrain glyphs, not white `*` glyphs.
- [x] Specify separate low smoke and elevated plume knowledge, approximate distant bearings, and no exact fire cells in unknown fog.
- [x] Record animal detection and localized hearing as follow-up stateful simulation, including steady uncertain cues rather than exact or flickering `?` markers.

### Task 4: Verification and screenshots

**Files:**
- Modify: `scripts/map-shots.mjs` only if its existing scenario system can express current versus remembered terrain without production-only hooks.
- Create: ignored screenshots under `.superpowers/fov-dimming-preview/shots/`.

**Interfaces:**
- Consumes: completed simulation and renderer changes.
- Produces: test, build, lint, and visual evidence.

- [x] Run the focused suites after each production change.
- [x] Run `npm test`, `npm run build`, and the repository lint command for changed files.
- [x] Capture forest edge, ridge, valley, close fire, far fire, partially occluded firelight, fully occluded fire, and current-model heavy-rain screenshots from the real implementation.
- [x] Inspect each image for square range, light leaks, hidden live markers, and confusion between remembered and inherited terrain.
- [x] Confirm `git diff --check` and report every deferred roadmap item.
