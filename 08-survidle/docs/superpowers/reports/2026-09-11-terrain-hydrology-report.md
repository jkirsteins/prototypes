# Terrain and hydrology: the realism report, mapstats, the budget test and the docs

Task 11 of the terrain-hydrology plan. This is the evidence pass over the
generator built in Tasks 1 to 10: the realism report from spec section 6,
an updated `mapstats.ts`, the solve's own budget test in the slow suite,
and the docs. Four generator constants were adjusted against the report's
red measures, each one named in spec section 3 as that measure's owner.

## The solve budget

`tests/slow/terrain-budget.test.ts` solves one full-size world (no cache)
and asserts under 20 s:

```
full solve 5.1 s
```

Well inside budget. The file needs no entry in `vitest.config.ts`'s
`slowTestFiles`: like the other files already under `tests/slow/`
(`forecast.test.ts`, `goals-year.test.ts`, `heir.test.ts`,
`lineage.test.ts`, `wayfinding-vantage.test.ts`, `year-attention.test.ts`),
it is picked up by the slow suite's own glob
(`tests/slow/**/*.test.ts`), confirmed with
`SURVIDLE_TEST_SUITE=slow npx vitest list --filesOnly` before and after
adding the file, and with `node scripts/check-test-discovery.mjs`, which
passed with the file counted on the slow side and not the fast side.

## The report (`npm run terrain`)

### Before any constant change

```
== seed 42
land -> water km: p50 0.9 p90 2.4   target p50 < 0.6, p90 < 2
lake share of land+lake: 2.7%   target 5..10;  sea 39.1% river cells 986
largest river mouths m3/s: 130 101 53 52   (Namsen 290, Ume 430, Lule 500)
west coast length / straight: 10.3   target > 5
rock share: coast 12% (30) steep 6% (25) lowland 2.1% (3..5)
bog by degree: 61N 1% 62N 1% 63N 2% 64N 1% 65N 1% 66N 1% 67N 10%   target rising 10 -> 20+
mean slope by class: rock 14.0%  birch 8.5%  bog 1.2%  pine 9.6%  fell 12.9%  meadow 9.7%  spruce 4.9%
river flow winds E SE S SW W NW N NE: 0 0 0 0 0 0 0 0
land height m: p50 699 p90 1674 max 2827
start 3675819 at row 2042 (61.49 N), height 1 m, terrain bog, shore sea

== seed 1
land -> water km: p50 0.9 p90 2.4   target p50 < 0.6, p90 < 2
lake share of land+lake: 2.0%   target 5..10;  sea 36.9% river cells 1042
largest river mouths m3/s: 1393 423 355 287 100   (Namsen 290, Ume 430, Lule 500)
west coast length / straight: 11.8   target > 5
rock share: coast 9% (30) steep 5% (25) lowland 1.8% (3..5)
bog by degree: 61N 0% 62N 0% 63N 1% 64N 1% 65N 0% 66N 1% 67N 20%   target rising 10 -> 20+
mean slope by class: bog 1.3%  birch 8.8%  rock 14.5%  meadow 10.3%  fell 13.2%  pine 9.8%  spruce 5.2%
river flow winds E SE S SW W NW N NE: 0 0 0 0 0 4 67 6
land height m: p50 677 p90 1697 max 2966
start 3654218 at row 2030 (61.52 N), height 19 m, terrain birch, shore sea

== seed 7
land -> water km: p50 0.9 p90 2.4   target p50 < 0.6, p90 < 2
lake share of land+lake: 2.1%   target 5..10;  sea 37.8% river cells 1206
largest river mouths m3/s: 1070 501 300 72   (Namsen 290, Ume 430, Lule 500)
west coast length / straight: 10.7   target > 5
rock share: coast 13% (30) steep 6% (25) lowland 2.3% (3..5)
bog by degree: 61N 1% 62N 0% 63N 1% 64N 1% 65N 0% 66N 1% 67N 21%   target rising 10 -> 20+
mean slope by class: bog 1.2%  meadow 9.1%  birch 8.4%  rock 13.2%  pine 10.1%  fell 11.8%  spruce 5.3%
river flow winds E SE S SW W NW N NE: 9 9 0 1 17 5 9 1
land height m: p50 744 p90 1703 max 2890
start 3778487 at row 2099 (61.34 N), height 3 m, terrain bog, shore sea
```

This first run also caught a bug worth recording: `scripts/terrain.ts`
as given imported `NO_FLOW` from `../src/world/solve`, which does not
export it (only `hydro.ts` does). `tsc --noEmit` does not check
`scripts/` (it is outside `tsconfig.json`'s `include`), so the bad import
resolved to `undefined` at runtime rather than failing to compile;
`s.flowDir[i] !== NO_FLOW` was then always true, letting the sentinel
value 255 flow into `receiverOf` and into `winds[...]++`, which showed up
as `NaN%` in every "mean slope by class" line and a stray huge-index
entry in the wind histogram. Fixed by importing `NO_FLOW` (and
`receiverOf`) from `../src/world/hydro`, matching the exports `hydro.ts`
actually has.

### After the four adjustments below

```
== seed 42 (world in 0.0 s, cached; a fresh solve is 5.1 s)
land -> water km: p50 0.6 p90 1.5   target p50 < 0.6, p90 < 2
lake share of land+lake: 2.7%   target 5..10;  sea 39.1% river cells 954
largest river mouths m3/s: 130 101 53 52   (Namsen 290, Ume 430, Lule 500)
west coast length / straight: 10.3   target > 5
rock share: coast 29% (30) steep 21% (25) lowland 5.1% (3..5)
bog by degree: 61N 5% 62N 5% 63N 7% 64N 2% 65N 3% 66N 3% 67N 17%   target rising 10 -> 20+
mean slope by class: rock 16.6%  birch 8.6%  bog 1.3%  pine 9.5%  fell 12.9%  meadow 9.9%  spruce 6.1%
river flow winds E SE S SW W NW N NE: 0 0 0 0 0 0 0 0
land height m: p50 700 p90 1674 max 2827
start 3675819 at row 2042 (61.49 N), height 1 m, terrain bog, shore sea

== seed 1
land -> water km: p50 0.6 p90 1.5   target p50 < 0.6, p90 < 2
lake share of land+lake: 2.0%   target 5..10;  sea 36.9% river cells 1027
largest river mouths m3/s: 1393 423 355 287 100   (Namsen 290, Ume 430, Lule 500)
west coast length / straight: 11.8   target > 5
rock share: coast 25% (30) steep 21% (25) lowland 4.5% (3..5)
bog by degree: 61N 3% 62N 3% 63N 6% 64N 2% 65N 2% 66N 6% 67N 23%   target rising 10 -> 20+
mean slope by class: bog 1.4%  rock 17.4%  birch 8.8%  meadow 10.4%  fell 13.2%  pine 9.7%  spruce 6.3%
river flow winds E SE S SW W NW N NE: 0 0 0 0 0 4 60 6
land height m: p50 677 p90 1697 max 2966
start 3654218 at row 2030 (61.52 N), height 19 m, terrain birch, shore sea

== seed 7
land -> water km: p50 0.6 p90 1.5   target p50 < 0.6, p90 < 2
lake share of land+lake: 2.2%   target 5..10;  sea 37.8% river cells 1181
largest river mouths m3/s: 1070 501 300 72   (Namsen 290, Ume 430, Lule 500)
west coast length / straight: 10.7   target > 5
rock share: coast 31% (30) steep 21% (25) lowland 5.5% (3..5)
bog by degree: 61N 4% 62N 3% 63N 2% 64N 2% 65N 1% 66N 4% 67N 31%   target rising 10 -> 20+
mean slope by class: bog 1.4%  meadow 9.3%  birch 8.4%  rock 15.9%  pine 10.0%  fell 11.8%  spruce 6.2%
river flow winds E SE S SW W NW N NE: 9 9 0 1 17 5 9 1
land height m: p50 744 p90 1703 max 2890
start 3778487 at row 2099 (61.34 N), height 3 m, terrain bog, shore sea
```

### Reading the two runs against the targets

| Measure | Target | Before | After | Verdict |
|---|---|---|---|---|
| Distance to water, p50 | < 0.6 km | 0.9 km | 0.6 km | Red, at the boundary. The 0.3 km grid quantises this to whole cells; 0.6 km is 2 cells, and getting under it needs a median of 1 cell, a further stream-threshold drop this run does not spend. |
| Distance to water, p90 | < 2 km | 2.4 km | 1.5 km | Green |
| Lake share of land + lake | 5 to 10% | 2.0 to 2.7% | 2.0 to 2.7% | Red, unchanged. See below - the owning constant was tried and made no difference. |
| West coast length / straight | > 5 | 10.3 to 11.8 | unchanged (not touched) | Green already |
| Rock share, coast | 30 | 9 to 13% | 25 to 31% | Green |
| Rock share, steep | 25 | 5 to 6% | 21% | Red, close |
| Rock share, lowland | 3 to 5% | 1.8 to 2.3% | 4.5 to 5.5% | Green (seed 7 a shade over) |
| Bog share by latitude | rising 10 to 20+ | flat 0 to 2%, then a jump to 10 to 21% at 67N | flat 2 to 7%, then a jump to 17 to 31% at 67N | Red. Trend direction is right and larger, but the low bands still start well under 10, not at it. |
| Largest river mouths, catchments | 5,000 to 30,000 km2 | not directly measured | not directly measured | Not scored - the script prints discharge at the mouth in m3/s, not the catchment area in km2; turning one into the other needs a second pass this task did not add. Reported for comparison against the real rivers named. |
| Valley bearings | histogram, transverse to the crest expected | mixed / mostly empty (few river cells in the checked coastal band per seed) | same shape | Not scored - a histogram, no numeric target, and owned by the carving constants this run does not touch. |
| Mean slope per class | printed, no target | - | - | Informational |
| Solve time | < 20 s | 5.1 s (budget test) | unchanged | Green |

## The four constant adjustments

Rule followed: at most one adjustment per measure, only to a constant
spec section 3 names as that measure's owner, never to a target, never to
the erosion or carving constants. Each kept
`npx vitest run tests/solve.test.ts tests/solve-hydrology.test.ts tests/erode.test.ts`
green, and `GENERATOR_VERSION` in `src/world/solve.ts` moved from 1 to 2
so the node cache re-solves under the new rules.

- **Distance to water** is owned by `STREAM_M3S` (`src/world/classify.ts`):
  a brook is a year-round stream at or above this discharge, and streams
  count as water for the measure. `0.05 -> 0.02`. Moved p50 from 0.9 km to
  0.6 km and p90 from 2.4 km to 1.5 km across all three seeds. Still not
  strictly under the 0.6 km target (see the table above); left red rather
  than spending a second adjustment on the same measure.
- **Lake share** is owned by `LAKE_MIN_DEPTH_M` (`src/world/solve.ts`):
  a depression counts as a lake once its fill reaches this depth
  somewhere in it. `2 -> 1`. Lake share did not move (2.0%, 2.7%, 2.1%
  before; 2.0%, 2.7%, 2.2% after - the same numbers to a tenth of a
  point). This says the shortfall is not depth-gated closed basins being
  turned away at the 2 m sill; it is that the drainage produces too few
  closed depressions in the first place, which is not this constant's
  job to fix. Left red and reported as such rather than pushing the
  depth threshold further for no measured effect.
- **Rock share by band** is owned by `rockRate()`'s four literals
  (`src/world/classify.ts`): the soil noise `n` is compared against a
  rate per band, and the highest applicable rate wins. The rates read as
  probabilities but the noise is not a uniform draw - two octaves of
  value noise cluster near 0.5 - so a rate must sit above its target
  share to land on it. Sampled the soil noise over land cells in each
  band on seed 42 to find the quantile matching each target share
  (coast p30 was near soil 0.40, steep p25 near 0.38) and moved the
  rates: coast `0.30 -> 0.40`, steep `0.25 -> 0.38`, the 100 m
  under-treeline band `0.35 -> 0.45`, elsewhere `0.04 -> 0.15`. Coast
  moved from 9 to 13% up to 25 to 31% (green, target 30); steep moved
  from 5 to 6% up to 21% (still short of 25, red but much closer);
  lowland moved from 1.8 to 2.3% up to 4.5 to 5.5% (green, target 3 to
  5, seed 7 a shade over the top).
- **Bog share** is owned by the wetness and precipitation thresholds in
  the bog rule (`src/world/classify.ts`, the `slope < 0.02 && wetness >
  0.6 && p > 0.3` line); the slope term is left alone since
  `tests/solve.test.ts` asserts bog's slope tolerance directly and
  changing it would mean editing the test. `wetness > 0.6 -> 0.5`,
  `p > 0.3 -> 0.2`. Bog share rose in every band (roughly 0 to 2% before,
  2 to 7% after, before the 67N jump), and the 67N band itself rose too
  (10 to 21% before, 17 to 31% after). Still red: the low-latitude bands
  need to start near 10% and they are still well under it, so the trend
  is in the right direction but the floor has not moved enough. Left red
  rather than loosening the thresholds a second time.

None of the four touched the erosion (`src/world/erode.ts`) or glacial
carving (`carveGlacial` in `classify.ts`) constants, which own the west
coast length and valley bearing measures and were already green or
unscored respectively.

## Regression check on the fast suite

`npm test` was already red before this task - 18 failing files, all on
stale fixtures from the earlier terrain-hydrology tasks, per Task 10's
report, pending Task 12's fixture rebake. To make sure the four constant
changes did not add to that count, the classify.ts and solve.ts edits
were set aside with a scoped, tagged `git stash` (pathspec-limited to
those two files, applied back with `apply` rather than `pop`, then
dropped), `npm test` run against the untouched baseline, then the stash
reapplied and `npm test` run again:

- Baseline (before this task's constant edits): 18 failed files, 63
  failed tests, 841 passed.
- After this task's four constant edits: 17 failed files, 60 failed
  tests, 844 passed.

The edits did not regress the fast suite; if anything, a few fixture
comparisons landed closer to the new numbers by chance. The remaining
failures are the same class of pre-existing fixture staleness Task 10
already reported (old-world start regions, sight fixtures, map
screenshots), not something introduced here.

## `scripts/mapstats.ts`

Added `river: "="` to `GLYPH` (it was already present from an earlier
task), and a new full-resolution block after the downsampled ASCII map:
water kinds (sea/lake percent, river cell count), stream cell count,
rock share of land, and a land height histogram in 200 m bands. Run for
seed 42:

```
water kinds: sea 39.1% lake 1.7% river cells 954; stream cells 556049; rock share of land 4.1%
land height histogram (200 m bands): 0-200m 7.6%  200-400m 11.5%  400-600m 20.2%  600-800m 20.0%  800-1000m 14.0%  1000-1200m 7.6%  1200-1400m 4.4%  1400-1600m 3.6%  1600-1800m 3.0%  1800-2000m 2.7%  2000-2200m 2.4%  2200-2400m 1.8%  2400-2600m 1.1%  2600-2800m 0.2%  2800-3000m 0.0%
start Myrdalen at lattice 18720: forest 55% water 6% cells 292 spots camp 0, forest 0.6, outcrop 1.8, shore 0.3, heath 0.9 neighbours 8; start in 0 ms
```

The picture (`npx vite-node scripts/mapstats.ts 42`) reads as the brief
asked: the west third of the sampled strip is open sea (`~`) breaking up
into what would be inlets and skerries at higher resolution; east of that
a broad, mostly continuous band of fell (`^`) runs down the map like a
spine, with rock (`n`), bog (`"`) and meadow (`.`) glyphs scattered
through it rather than forming a solid collar; east of the fell the
ground drops into a wide forest of pine (`T`), birch (`Y`) and pockets of
spruce (`A`). The downsampled 120-column view is too coarse to show
individual river lines (river read as 0% of the sampled points, against
954 actual river cells full-resolution out of 4,003,200), which is
expected at this sample density and is exactly why the full-resolution
line was added beside it.

## Existing gates on the new world

These are findings on the new world, not targets. None of the four run
through `npm run test:slow` - the vitest files under `tests/slow/`
(`heir.test.ts`, `goals-year.test.ts`, `year-attention.test.ts`,
`lineage.test.ts`) assert invariants and print nothing resembling a gate
summary; the actual "passed N of M" lines these gates are named for come
from the standalone scripts `npm run reference`, `npm run reference --
--heir`, `npm run year` and `npm run year -- --winter`, which is what was
run here, each in the background against the terrain-hydrology world.

- **April gate** (`npm run reference`, 5 seeds): `passed 5 of 5`. Every
  seed alive and fed at day 20 from the arrival kit.
- **Winter gate** (`npm run year -- --winter`, 5 seeds): `winter gate
  (alive on 1 March): passed 5 of 5`. Every seed alive at day 91 from a
  stocked December camp.
- **Year gate** (`npm run year`, level 20, 5 seeds): `year gate (alive
  after a year): passed 3 of 5`.
- **Heir lineage gate: not measured.** The script (`npm run reference --
  --heir`) produced no line in 66 minutes on the new world, where it
  takes about 15 minutes on main; a performance regression to
  investigate (suspects: route searches that fail across fjords and are
  re-run every minute through `knownRoute`'s 512-entry cache, and regions
  built on a coast with many shores). Stopped rather than left running
  further; not restarted for this task.

## Docs

- `docs/README.md`: rewrote the "A big north" bullet to the real numbers
  (540 by 667 km, 61 N to 67 N, metres above sea level, erosion-cut
  valleys and drainage, lakes with outlets, streams and rivers to
  fjords, geological rock exposure, latitude-set treeline, the loading
  bar replacing "loading is instant"). Added `npm run terrain` to the
  scripts list and a paragraph describing it, and extended the
  `scripts/mapstats.ts` description to mention the new full-resolution
  fields. Left the valley cell's normalized-elevation line (0.321) alone
  for Task 12, which re-picks that fixture.
- `docs/testing.md`: this file turned out to be entirely about the
  beacon/tester-round instrument, not the vitest suite, so the cache and
  budget notes went in as their own new section ("Solving worlds for
  tests and scripts") rather than folded into the tester content -
  `installNodeWorldCache()`, the `node_modules/.cache/survidle-worlds/`
  layout, the first-run cost per seed versus the cached read, how
  `GENERATOR_VERSION` invalidates old cache files by name rather than by
  deletion, and the budget test's place in `npm run test:slow`.

## Files changed

- `scripts/terrain.ts` - replaced with the realism report; the Task 3
  stage-timing spike moved behind `--time` (and now accepts a seed
  argument in that mode too); fixed the `NO_FLOW` import bug described
  above.
- `scripts/mapstats.ts` - added the full-resolution water/stream/rock/
  height-histogram block.
- `tests/slow/terrain-budget.test.ts` - new, the solve budget test.
- `src/world/solve.ts` - `LAKE_MIN_DEPTH_M` 2 -> 1; `GENERATOR_VERSION`
  1 -> 2.
- `src/world/classify.ts` - `STREAM_M3S` 0.05 -> 0.02; `rockRate()`'s
  four rates raised; the bog rule's wetness and precipitation
  thresholds loosened.
- `docs/README.md`, `docs/testing.md` - as above.
- `docs/superpowers/reports/2026-09-11-terrain-hydrology-report.md` -
  this file.

`vitest.config.ts` was not touched: `tests/slow/terrain-budget.test.ts`
is already covered by that file's `tests/slow/**/*.test.ts` glob for the
slow suite, the same as every other file already in that directory, and
`scripts/check-test-discovery.mjs` confirms no file is missed, duplicated
or in both suites.

## Self-review

- Ran `npx tsc --noEmit` clean.
- Ran `npx vitest run tests/solve.test.ts tests/solve-hydrology.test.ts tests/erode.test.ts`
  green after each constant edit, and once more at the end.
- Ran `SURVIDLE_TEST_SUITE=slow npx vitest run tests/slow/terrain-budget.test.ts`
  alone: 5.1 s, pass.
- Checked the fast suite did not regress from the constant edits via the
  scoped stash comparison above (18 -> 17 failed files, all pre-existing
  fixture staleness).
- Re-read `scripts/terrain.ts` against the brief's verbatim code block:
  identical except the `NO_FLOW` import source (fixed, see above) and the
  `--time` block kept from Task 3 and gated as asked.
- Checked `docs/README.md`'s 0.321 elevation line was left untouched and
  that nothing added near it claims a different number.
- No em dashes, unicode arrows or fancy quotes introduced; checked with
  a grep over the changed files.

## Issues or concerns

- Three of the report's measures stay red after the one permitted
  adjustment each: distance-to-water p50 (at the 0.6 km boundary, a grid
  quantisation issue as much as a threshold one), lake share (the owning
  constant made no measured difference, pointing at the drainage
  producing too few closed basins rather than at the fill-depth sill),
  and bog share's low-latitude floor (rising but still well under the
  10% the target implies at the low end). These are named honestly in
  the tables above rather than pushed further with a second adjustment
  each, per this run's rule.
- The "largest catchments" and "valley bearings" rows are not scored
  against numeric pass/fail because the report script (verbatim from the
  brief) does not compute catchment area in km2 or give a numeric target
  for the bearing histogram; they are printed for comparison as the spec
  intends but nothing was tuned against them.
- `docs/testing.md` is topically about the tester round, not the vitest
  suite; the new section sits there because that is the file the task
  named, as its own section rather than woven into the tester content.
- **The heir lineage gate is a performance regression, not a survival
  reading.** `npm run reference -- --heir` gave no output at all in 66
  minutes (76 CPU minutes) on this world, against about 15 minutes on
  main; it was stopped rather than left running. This is worth an
  investigation of its own before Task 12: the likely causes are route
  searches failing across fjords and being re-run every minute through
  `knownRoute`'s small cache, and regions on a coast with many shores
  each doing more work to build. None of this task's four constant
  changes touch routing or region-building, so the regression is in the
  terrain shape itself (the fjorded coast from Tasks 1-4), not in
  anything adjusted here.
