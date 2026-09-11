# Survidle Terrain Follow-ups Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the five findings the terrain and hydrology branch left open, on the same branch, before merge: rivers a person would call rivers and a map that draws them at every rung; wind shelter from real slopes rather than pits; a hunting chooser that routes a shortlist rather than every mapped cell; a browser cache so a reload does not re-solve; and the slow suite re-sited on the new world with its three suspected bugs traced.

**Architecture:** Each task is one concern with its own tests. The river threshold is one constant plus a version bump plus a coarse-rung rule in the map; the lee rule reads the wind bearing and the metres field; the chooser pre-ranks by straight line and a reachability flood before any route search; the cache is an IndexedDB store keyed by seed, size and generator version, read before the worker starts; the slow fixtures move to the finders module.

**Tech Stack:** TypeScript, Vite, Vitest, vite-node scripts, headless Chrome over CDP for the browser check. No new dependencies.

**Spec:** `08-survidle/docs/superpowers/specs/2026-09-11-survidle-terrain-hydrology-design.md` (amended by Tasks 1 and 2 as they land). The realism-first ruling binds: a wrong number is corrected on a real figure, never bent to a target.

## Global Constraints

- Realism first: every threshold traces to a real figure named in the code comment or the spec.
- The solve stays arithmetic and sqrt only; any generator constant change bumps `GENERATOR_VERSION` in `src/world/solve.ts` (currently 3).
- `npm test` stays fast and green at every commit; `npm run build` clean; root `npm run lint` clean.
- No em dashes, unicode arrows or fancy quotes; comments explain, never chronicle.
- Stage with explicit paths under `08-survidle/`; never `git add -A`; no `git stash` (other sessions share the stack); never kill a process by name pattern.
- Every commit ends with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.
- Working directory for every command: `08-survidle/` inside the worktree.

---

### Task 1: Rivers from 5 cubic metres a second, drawn at every rung

**Files:**
- Modify: `src/world/classify.ts` (`RIVER_M3S`), `src/world/solve.ts` (`GENERATOR_VERSION`), `src/ui/map.ts` (`blockInfo`), the spec table row, `docs/README.md` if it names the threshold, `scripts/terrain.ts` targets line if it names 40
- Test: `tests/solve.test.ts` (existing river invariants still hold), `tests/map-rivers.test.ts` (new)

**The audit, stated up front so generation and representation stay separate.** The generator classes moving water in two tiers. A stream is a flag on a land cell above 0.02 cubic metres a second (a perennial brook), and on the current world the median land cell is 600 m from moving or standing water with 0.78 km of perennial channel per km2, so a player meets moving water almost at once; that tier is right and is not touched. The river tier is terrain of its own above 40 cubic metres a second, which is a Namsen-class river needing 800 to 3,300 km2 of catchment, so the world holds 300 km of it and a southern landing sees none. That threshold is the classification defect: a river a person calls a river starts around 5 cubic metres a second. The rendering defect is separate: a one-cell river vanishes at rungs that sample cells, whatever the threshold.

**Interfaces:**
- `RIVER_M3S = 5` with the comment: a river about 10 to 15 m wide at bankfull (Leopold's width relation gives about 11 m for 5 cubic metres a second), a barrier in spring and wadeable at riffles in summer, which is what the ford rule models. At inland runoff that is a catchment of about 400 km2, on the Atlantic side about 100 km2.
- Cartographic exaggeration in `blockInfo`: at rungs above 1, if any sampled known cell in the block is `river` and the block's majority class is not `water`, the block's terrain is `river`. Water (lake or sea) majority still wins. Add `river` to `TIE_ORDER` if absent. The hydrology is untouched by this rule; it is a minimum visible width for the map. Streams stay at the close rungs only (they are within 600 m of most cells, so a coarse rung would be all stream marks).

- [ ] **Step 1: Failing map test.** `tests/map-rivers.test.ts`: build `flatWorld({ w: 60, h: 60, terrain: "pine" })`, paint a one-cell-wide river down column 30 with `paintWorld`, mark every cell known (use the same helper the other map tests use to mark cells mapped), and assert through the exported block helper (export `blockInfo` for tests, or assert through `mapHtml` counting `t-river` glyphs at zoom 3 and zoom 9) that the river column is drawn at 3 cells per glyph and at 9 cells per glyph. A second case paints a lake majority around a river cell and asserts the block reads water.
- [ ] **Step 2: Run it, confirm it fails at the coarse rungs.**
- [ ] **Step 3: Implement** the `blockInfo` rule and the constant change; bump `GENERATOR_VERSION` to 4; amend the spec row: "river: land with discharge above 5 cubic metres a second, about 10 to 15 m wide at bankfull; its own terrain, impassable except on ice or at a ford"; update any doc line that says 40.
- [ ] **Step 4: Run** `npx vitest run tests/map-rivers.test.ts tests/solve.test.ts tests/solve-hydrology.test.ts tests/route-river.test.ts`, then `npm run terrain -- 42` (the first run solves v4 for seed 42, about 6 s) and paste the river cells count and the largest mouths line into the commit body; expect river cells up by roughly an order of magnitude. Then `npm test`.
- [ ] **Step 5: Commit** `feat(survidle): rivers from 5 cubic metres a second, drawn at every rung`.

---

### Task 2: Lee is how much the upwind ground and wood block the wind

**Why the redesign.** The old rule asked whether the cell is a closed pit, and drainage removes closed pits by definition, so the rule went extinct without the world getting any less sheltered. Real lee is relative blocking: valleys, gullies, the downwind side of ridges, banks, terraces and slope breaks all shelter while draining normally, and a wood upwind shelters as a barrier does. The mechanic reads that blocking directly.

**Files:**
- Modify: `src/sim/shelter.ts` (`leeScore`, `isLee`, `galeProtection`), callers `src/sim/player.ts:182,354`, `src/sim/body.ts:539,592`, `src/sim/goalopportunity.ts:68`, `src/ui/tip.ts:208`; the spec section 4 lee line
- Test: `tests/lee.test.ts` (new), plus whatever existing test asserts the depression rule (grep `isLee` and `dipCell` in tests; `tests/storms.test.ts` finds a depression by `dipCellAnywhere`)

**Interfaces:**
- `leeScore(world, cell, windBearingDeg): { score: number; by: "slope" | "wood" | "canopy" | "none"; blocking: number }`. Rock, fell, water and river score 0 (rock and fell are exposed by nature, water is never a refuge). A spruce cell scores 1 with `by: "canopy"` (inside a closed canopy). Otherwise walk upwind: the wind bearing rounded to the eight winds (the convention `bearing()` in landing.ts uses; the map's north is negative y), samples at 1 to `LEE_REACH_CELLS = 5` cells (300 m to 1.5 km) toward where the wind comes from. For each sample at distance `d` cells the blocking ratio is `(heightAt(sample) + canopyM(sample) - heightAt(cell)) / (d * 300)`, with `canopyM` 22 for spruce, 17 pine, 14 birch, 0 otherwise (the figures `src/sim/sight.ts` already uses). `blocking` is the maximum over the samples; `score = clamp(blocking / LEE_FULL_RATIO, 0, 1)` with `LEE_FULL_RATIO = 0.1`; `by` is `"slope"` when the best sample's ground alone reaches the ratio, `"wood"` when only ground plus canopy does, `"none"` when the score is 0. The real figure: a barrier shelters the ground within about ten of its heights downwind (shelterbelt measurements halve the wind out to ten to fifteen heights), so a barrier standing one tenth as high as its distance is full shelter and one twentieth is half.
- `isLee(world, cell, windBearingDeg): boolean` is `leeScore(...).score >= 0.5`, that is a blocking ratio of at least 0.05 (about 3 degrees of terrain or a 15 m wood at 300 m). `galeProtection` keeps adding one step for lee, so the protection ladder is unchanged.
- `galeProtection(state, world, cell, site)`: reads the wind bearing from the cell's local weather (`localWeather(state, world, cell)` or `atmosphereAt`; find which carries `windBearingDeg` and use it) and passes it to `isLee`. Callers gain `state`.
- The tip line reads from `by`: "lee of the slope to the W", "sheltered by the wood to the W", "under the spruce", or "exposed to the W wind", with the wind's eight-wind name.

- [ ] **Step 1: Failing test** `tests/lee.test.ts` on `flatWorld` meadow at 100 m: (a) a 130 m ridge one cell west of the target: west wind (270) is lee by slope, east wind (90) is not; (b) the same 30 m rise placed four cells west (ratio 30/1200 = 0.025) is not lee, and a 120 m rise four cells west (0.1) is full shelter; (c) a pine wood (17 m canopy) one cell upwind on level ground gives a ratio of about 0.057, lee by wood; birch (14 m) alone at one cell gives 0.047, not lee; (d) rock and river cells score 0 whatever stands upwind; spruce scores 1 with `by: "canopy"`; (e) a 5 m rise one cell upwind is not lee.
- [ ] **Step 2: Run it, confirm it fails.**
- [ ] **Step 3: Implement**, update callers and `tests/storms.test.ts`'s depression finder to a finder for a cell with a blocking upwind slope under the test's wind, amend the spec's lee line: "Lee for the gale rule is relative blocking of the wind: the highest ratio of upwind ground plus canopy above the cell over its distance, sampled 300 m to 1.5 km upwind; a ratio of 0.05 is lee, 0.1 full shelter, spruce is full shelter by canopy. Rock, fell, water and river are never lee."
- [ ] **Step 4: Run** the lee test, `tests/storms.test.ts`, `tests/tip.test.ts` if it exists, then `npm test`. Add one measure to `scripts/terrain.ts`: the share of land cells that are lee under a west wind and under a north wind on seed 42, printed with no target; a realistic landscape should give tens of percent, not two in a thousand.
- [ ] **Step 5: Commit** `feat(survidle): lee is what the upwind ground and wood block`.

---

### Task 3: The hunting chooser routes a shortlist

**Files:**
- Modify: `src/sim/hunting.ts` (`bestHuntCell`, `speciesValue`, `huntEstimate`), possibly `src/sim/position.ts` for a reachability helper
- Test: `tests/hunting-chooser.test.ts` (new), existing `tests/hunting.test.ts`, `tests/hunt-stress.test.ts`

**Interfaces:**
- `reachableFrom(state, world, from, ice): Set<number>`: a BFS over known, passable cells (same predicate `survivorRoute` uses through `routeConditions`) bounded to the region and its neighbours' cells; one flood, no A*.
- `bestHuntCell`: candidates are mapped cells of the chosen regions that are in the reachable set; they are ranked by `straightKm(here, cell)` and only the nearest `HUNT_SHORTLIST = 24` proceed to `huntEstimate` and `kmBetween`. The camp distance inside `speciesValue` is computed once per cell, not once per species: `huntEstimate` gains an optional `campKm` argument that `bestHuntCell` supplies from a single `kmBetween(cell, camp)`; other callers pass nothing and keep today's behaviour.
- Outcome preservation: on the reference seeds the chosen cell must be the same as before in the common case; where it differs, it differs only because the old choice was outside the nearest 24 by straight line, and the report says how often.

- [ ] **Step 1: Failing tests** `tests/hunting-chooser.test.ts`: (a) on `flatWorld` with a river splitting the map and no ford, cells across the river are not in `reachableFrom`; (b) count `knownRoute` calls (spy on `survivorRoute` via `vi.spyOn` on the routing module) during one `bestHuntCell` on a full-size world at the seed 42 landing after mapping the region: at most `HUNT_SHORTLIST * 2 + 2` route searches; (c) the chosen cell on seed 42 at the landing equals the cell the old chooser picks (compute the old choice in the test by brute force over all mapped reachable cells with the same scoring, so the test is not a golden literal).
- [ ] **Step 2: Run, confirm (b) fails today** (the report measured 334,694 searches over 20 days; a single call is thousands).
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Measure**: `npx vite-node scripts/reference.ts 42 20` (or the script's syntax for one seed and 20 days; read its header) before and after, paste both wall times into the commit body; target under 4 s from 8.6 s. Run `npm test`.
- [ ] **Step 5: Commit** `perf(survidle): the hunting chooser routes a shortlist of reachable cells`.

---

### Task 4: A browser cache for the solved world

**Files:**
- Create: `src/world/worldstore.ts`
- Modify: `src/world/worldloader.ts`
- Test: `tests/worldstore.test.ts` (new; happy-dom has no IndexedDB, so test the key and the encode/decode of the seven buffers against a small in-memory fake of the two calls used)

**Interfaces:**
- `worldKey(seed, w, h) = \`${seed}-${w}x${h}-v${GENERATOR_VERSION}\``
- `readSolved(key): Promise<SolvedWorld | null>` and `writeSolved(key, solved): Promise<void>` over an IndexedDB database `survidle-worlds`, store `worlds`, one record `{ key, w, h, height, flowDir, discharge, kind, flags, terrain, moisture }` (typed arrays are structured-cloneable). Any failure (no IndexedDB, quota, version error) resolves to null or void; never throws to the caller.
- `loadWorld`: after the test-mode guard, `await readSolved(key)`; on a hit, `onProgress("reading the ground", 1)` and resolve `generateWorld(seed, solved)`; on a miss, the worker path as today, and after `done`, `void writeSolved(key, m.solved)` (the arrays were transferred to the main thread, so write from the main thread's copy after `generateWorld` has them).
- Keep the store to the current generator version: on open, delete records whose key does not end with `-v${GENERATOR_VERSION}`.

- [ ] **Step 1: Failing test** for `worldKey` and the round trip through a fake store object (an object with `get(key)` and `put(record)` that the module accepts through a small injectable seam, so the IndexedDB wrapper is the only untested part).
- [ ] **Step 2: Run, confirm it fails.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Browser check** on a headless Chrome over CDP the way the Task 12 pass did: first load shows the five stages; a reload shows "reading the ground" and the run is up in under one second; `indexedDB.databases()` from the console lists `survidle-worlds`. Record the two load times in the report doc under a new "World cache" line. Stop the browser and dev server by PID.
- [ ] **Step 5: Run** `npm test` and `npm run build`; commit `feat(survidle): cache the solved world in the browser`.

---

### Task 5: The slow suite re-sited on the new world, three bugs traced

**Files:**
- Modify: every slow-suite test the report's "Slow suite" section lists as an old-world fixture (`docs/superpowers/reports/2026-09-11-terrain-hydrology-report.md`), `tests/world-facts.ts` for new finders; source files only where one of the three suspected bugs is real
- Test: the slow suite itself

**Rules:** facts by finder, never by literal; a test changes to a new rule only where the old assertion contradicts the spec; readings that moved (gate days, temperatures) are re-read and the new reading asserted only if the test's purpose is the reading, otherwise the assertion is re-anchored to the rule it tests; nothing skipped or deleted.

- [ ] **Step 1: Trace the three suspected bugs first**, since a real one changes what the fixtures should read: (a) `tests/churn.test.ts` panel churn budget blown by stats, weather and skills panels: find which field changes every minute now and whether it is a real re-render regression from the metres world (the weather panel reading height-dependent temperature per minute is the suspect) or the test's budget assuming the old field; (b) `tests/words.test.ts` region names with no å, ø or æ: check `src/world/names.ts` pools against the terrain shares the new regions produce; (c) `tests/probe.test.ts` trap oily side undefined: follow `fishItem` for the trap's yield. Fix each real one in the source with a test; record each verdict in the report doc.
- [ ] **Step 2: Re-site the fixtures.** Seeds 39 `felling()` set-up first (28 failures): find the camp the set-up wants by finder (a meadow camp with forest within 0.6 km, or the nearest thing the new world offers and the comment says which), then the rest file by file. Run each file with `SURVIDLE_TEST_SUITE=slow npx vitest run <file>` as you go.
- [ ] **Step 3: Run the whole slow suite once** (`npm run test:slow`, about 35 minutes, foreground with a 50-minute timeout) and replace the report doc's "Slow suite" section with the new state, per-file, every remaining failure with its reason. The target is green; a remaining red must be a reading the author should look at, named as such.
- [ ] **Step 4: Run** `npm test`, `npm run build`, root lint; commit in two commits: `fix(survidle): ...` for any real bug, `test(survidle): re-site the slow suite on the solved world`.
