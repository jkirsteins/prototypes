# Performance and playtest follow-ups, 2026-09-17

Pulled baseline: 98461be3. Changes were shipped independently to the existing preview branch before full integration tests, as requested.

## What changed

- Loading is visible in initial HTML, before module download. The shell stays invisible and non-interactive through world loading, saved-game catch-up and the first complete panel/canvas render. A new-world reset uses the same gate. Background forecasts do not gate startup.
- At 50m, 100m and 300m, knowledge classification reads every patch in the glyph. A single known patch anywhere in a 300m block draws partial ground rather than disappearing between nine sample points. Terrain summaries still exclude unknown patches; the all-36-position regression checks that rendering builds no unknown chunks.
- Dense spruce uses the existing 150m local envelope and accumulated cover rather than a zero-range shortcut. Closing trunks are visible at about 100m in the controlled full-canopy scene; ground beyond them stays concealed. The forest-edge behavior and physical terrain/optical occlusion remain.
- Fine-position animal letters retain exact metre positions but no longer draw opaque tile rectangles. Their own accent color and a dark halo preserve legibility; survivor/camp marks still draw above them. Existing 300m shared-block badges remain.
- Both rate preferences print only their selected clock.
- Exact concept search filters membership before constructing routed options. The dark concept constructs two routed rows rather than 95; an unknown concept constructs none. Free-text search still includes dynamic detail/refusal matches and is deliberately not narrowed by names alone.
- The static-canvas budget checks 120 unchanged calls with no redraw, then requires redraw on changed ground keys and device pixel density.
- Forecast seed announcements no longer allocate a duplicate solved world. The first actual forecast loads it lazily; concurrent loads are shared, and superseded loads cannot install an old world or post stale rows.
- Browser main/forecast solved caches drop old seeds on replacement. The main forecaster updates its world reference even on the worker path, and search caches use weak game-state ownership so neither silently keeps the original world after a reset.

## Fresh evidence

- Focused regressions passed after observed failures for loading, all 36 known-patch positions, dense forest, compact rates, concept construction and lazy forecast allocation. Static redraw budgets and forecast cancellation checks passed.
- Production build passed. Vite still reports the pre-existing large portrait chunk warning.
- Real Chromium playthrough passed: no partially initialized startup frames, loading blocks keyboard shortcuts, walking at 300m and 50m, zoom controls without walk orders, painted board at all rungs/night, and a survey answering every probe for 22 seconds (slowest 54ms in that run).
- The final run reported 0.39ms per effects draw over 200 iterations, with 178 water, 233 shadow and 156 weather glyph cells. This is a single-scene Chromium number, not a Safari result or a comparable before/after speedup.
- First full fast run: 1266 passed, one failed. The weather-projection failure reproduced at the pulled baseline; its test assumed a one-minute cache. It now advances the actual air bucket and asserts the projection itself changes. Full rerun is tracked below.
- Slow suite found UI, wildlife and delivery failures. A clean baseline worktree reproduced 16 selected slow failures and the fast weather failure before this batch. They are not accepted as harmless: some fixtures assume patch-level markers at the 300m rung, while other behaviors still require diagnosis.

## Still open

- Full slow-suite cleanup is not complete. Do not claim the branch is integration-green merely because the browser playthrough passed.
- Further narrowing of cold location-dependent free-text candidates is deferred. The conservative direct/cached-destination pre-filter below is implemented; a name-only filter would still lose legitimate results.
- Once forecasting starts, main and worker still hold separate solved worlds and separate fine caches. This batch fixes eager allocation and old-world retention, not cross-thread sharing. Transferring main arrays would detach terrain still in use. A shared-memory design needs deployment and browser compatibility verification, plus immutable/shared base data separated from mutable per-run ground overlays.
- Further continuous canvas optimizations should be driven by per-scenario profiling; phases/peaks are already prepared in the model and only live visible water enters the shimmer list. The measured sub-millisecond draw does not justify a speculative rewrite.
- Safari cold load, saved-game catch-up, long sessions, background recovery and retained-memory behavior still need direct validation. Chromium is not a substitute.
- Forest visibility at 300m needs subjective preview playtesting across spruce, pine and birch, not only a deterministic cover test.

## Verification status

The original batch's full fast rerun passed: 134 files, 1267 tests. Production build and browser playthrough passed. Its diagnostic slow run reported failures and was stopped during the follow-up below; it is not complete or green.

## Free-text and slow-suite follow-up

Free text now obtains live descriptions at destinations that normal intent
resolution knows without pathfinding, or at still-valid cached destinations.
Descriptions include progression details, refusals and keywords. Only possible
matches build routed options; unresolved location-dependent descriptions remain
candidates. Matched descriptions are reused so warm routes do not repeat their
live legality check. No live whole-row cache was added.

The cold "torch" regression observed 95 routed option builds before the change
and now enforces fewer than 45 with no unrelated hide-coat route. Exhaustive
comparisons cover labels, details, refusals, keywords and progression text.
Existing movement, knowledge, clock and live-stock/skill invalidation tests pass.
This is a work-count reduction, not a measured Safari frame-time speedup.

Follow-up verification: all 1270 fast tests across 134 files passed; the latest
search/Do-panel focused rerun passed all 45 tests; production build passed.
Four targeted slow cases passed after the task-count, missing yard gate and two
save-fixture corrections. The whole fire file passed all 20 tests after repairing
leftover laid fuel and accounting for rain rewetting. Six previously failing
slow cases are therefore resolved, with only the yard gate requiring a simulation
change. A new fast regression proves counted yard orders refuse below Building 3
and are allowed at the rung rather than throwing.

The old-head full slow run was interrupted after collecting diagnostic failures.
It cannot validate these subsequent fixes. Remaining delivery, shelter, wildlife,
map presentation, water/task fixtures, ecology bands and spatial budgets need
root-cause reconciliation, not blind expectation changes. The roadmap lists the
investigation groups, baseline comparison procedure and acceptance gates. It also
contains the deferred cross-thread solved-world/fine-cache sharing design gates.
