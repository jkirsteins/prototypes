# Terrain and hydrology: the realism report, mapstats, the budget test and the docs

Task 11 of the terrain-hydrology plan. This is the evidence pass over the
generator built in Tasks 1 to 10: the realism report from spec section 6,
an updated `mapstats.ts`, the solve's own budget test in the slow suite,
and the docs. Generator constants were adjusted against the report's red
measures, each one named in spec section 3 as that measure's owner; a
review round (below, "Fix report") corrected two of those adjustments and
found a real modelling bug behind a third. `GENERATOR_VERSION` is 3.

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

### After the corrected fix (current: `GENERATOR_VERSION` 3)

This replaces an intermediate run (kept in the Fix report section below
for the record) that raised the rock rates ad hoc instead of fixing the
assumption behind them.

```
== seed 42 (world in 5.2 s)
land -> water km: p50 0.6 p90 1.5   target p50 < 0.6, p90 < 2;  perennial channel density 0.78 km/km2   target 0.5..1.5 (perennial only)
lake share of land+lake: 2.7%   target 5..10;  sea 39.1% river cells 986
largest river mouths m3/s: 130 101 53 52   (Namsen 290, Ume 430, Lule 500)
west coast length / straight: 10.3   target > 5
rock share: coast 30% (30) steep 22% (25) lowland 7.4% (3..5)
bog by degree: 61N 5% 62N 5% 63N 7% 64N 2% 65N 3% 66N 3% 67N 16%   target rising 10 -> 20+
mean slope by class: rock 14.1%  birch 8.6%  bog 1.3%  pine 9.6%  fell 12.9%  meadow 9.9%  spruce 6.1%
river flow winds E SE S SW W NW N NE: 0 0 0 0 0 0 0 0
land height m: p50 699 p90 1674 max 2827
start 3677622 at row 2043 (61.49 N), height 3 m, terrain birch, shore sea

== seed 1 (world in 4.9 s)
land -> water km: p50 0.6 p90 1.5   target p50 < 0.6, p90 < 2;  perennial channel density 0.79 km/km2   target 0.5..1.5 (perennial only)
lake share of land+lake: 2.0%   target 5..10;  sea 36.9% river cells 1042
largest river mouths m3/s: 1393 423 355 287 100   (Namsen 290, Ume 430, Lule 500)
west coast length / straight: 11.8   target > 5
rock share: coast 27% (30) steep 21% (25) lowland 7.0% (3..5)
bog by degree: 61N 3% 62N 3% 63N 5% 64N 2% 65N 2% 66N 6% 67N 22%   target rising 10 -> 20+
mean slope by class: bog 1.4%  rock 14.3%  birch 8.9%  meadow 10.4%  fell 13.2%  pine 9.8%  spruce 6.3%
river flow winds E SE S SW W NW N NE: 0 0 0 0 0 4 67 6
land height m: p50 677 p90 1697 max 2966
start 3654218 at row 2030 (61.52 N), height 19 m, terrain birch, shore sea

== seed 7 (world in 4.8 s)
land -> water km: p50 0.6 p90 1.5   target p50 < 0.6, p90 < 2;  perennial channel density 0.78 km/km2   target 0.5..1.5 (perennial only)
lake share of land+lake: 2.1%   target 5..10;  sea 37.8% river cells 1206
largest river mouths m3/s: 1070 501 300 72   (Namsen 290, Ume 430, Lule 500)
west coast length / straight: 10.7   target > 5
rock share: coast 32% (30) steep 21% (25) lowland 7.6% (3..5)
bog by degree: 61N 4% 62N 3% 63N 2% 64N 2% 65N 1% 66N 4% 67N 31%   target rising 10 -> 20+
mean slope by class: bog 1.4%  meadow 9.2%  birch 8.5%  rock 13.9%  pine 10.0%  fell 11.8%  spruce 6.2%
river flow winds E SE S SW W NW N NE: 9 9 0 1 17 5 9 1
land height m: p50 744 p90 1703 max 2890
start 3778487 at row 2099 (61.34 N), height 3 m, terrain bog, shore sea
```

### Reading the corrected run against the targets

| Measure | Target | Original (spec defaults, raw fbm) | Corrected (spec rates, uniform noise; other constants as adjusted) | Verdict |
|---|---|---|---|---|
| Distance to water, p50 | < 0.6 km | 0.9 km | 0.6 km | Red, at the boundary. The 0.3 km grid quantises this to whole cells; 0.6 km is 2 cells, and getting under it needs a median of 1 cell, a further stream-threshold drop this run does not spend. |
| Distance to water, p90 | < 2 km | 2.4 km | 1.5 km | Green |
| Perennial channel density | 0.5 to 1.5 km/km2 | not printed originally | 0.78 to 0.79 km/km2 | Green. Added this round as the real-terms check on `STREAM_M3S`; see the Fix report. |
| Lake share of land + lake | 5 to 10% | 2.0 to 2.7% | 2.0 to 2.7% | Red, unchanged. `LAKE_MIN_DEPTH_M` is back at its spec value of 2 after this round's review found the drop to 1 moved nothing; see the Fix report. |
| West coast length / straight | > 5 | 10.3 to 11.8 | unchanged (not touched) | Green already |
| Rock share, coast | 30 | 9 to 13% | 27 to 32% | Green - now landing on the target because the noise compared against the rate is genuinely uniform (see the Fix report), not because the rate was raised. |
| Rock share, steep | 25 | 5 to 6% | 21 to 22% | Red, close. Uniformising the noise did not close this one: "steep" is a small, spatially confined population (mountain valley flanks), and a rank transform makes the *whole* land population's soil field uniform, not every geographic subset of it, so a locally correlated pocket can still land off the target rate. Not chased further this round. |
| Rock share, lowland | 3 to 5% | 1.8 to 2.3% | 7.0 to 7.6% | Red, now on the high side rather than the low side. This is the accurate reading, not a new problem introduced by the fix: the report's "lowland" bucket (not coastal, not steep) overlaps heavily with `rockRate()`'s separate 100 m under-treeline band (rate 0.35), which was already inflating this measure before the fix - it just looked low because the un-uniformised floor rate (0.04 against raw fbm) was landing near 0%. With the floor corrected to its true ~4%, the treeline-band overlap now shows through as the dominant term. Not adjusted further this round - the coordinator's three corrections did not include a fourth pass at this band's definition. |
| Bog share by latitude | rising 10 to 20+ | flat 0 to 2%, then a jump to 10 to 21% at 67N | flat 2 to 7%, then a jump to 16 to 31% at 67N | Red. Unchanged from the prior round (bog thresholds were not part of this review). Trend direction is right and larger, but the low bands still start well under 10, not at it. |
| Largest river mouths, catchments | 5,000 to 30,000 km2 | not directly measured | not directly measured | Not scored - the script prints discharge at the mouth in m3/s, not the catchment area in km2; turning one into the other needs a second pass this task did not add. Reported for comparison against the real rivers named. |
| Valley bearings | histogram, transverse to the crest expected | mixed / mostly empty (few river cells in the checked coastal band per seed) | same shape | Not scored - a histogram, no numeric target, and owned by the carving constants this run does not touch. |
| Mean slope per class | printed, no target | - | - | Informational |
| Solve time | < 20 s | 5.1 s (budget test) | 4.8 to 5.2 s (both the budget test and each seed's fresh solve above) | Green |

## The generator constants: adjustments, a fix, and one reversion

Rule followed for the adjustments: at most one per measure, only to a
constant spec section 3 names as that measure's owner, never to a target,
never to the erosion or carving constants. `GENERATOR_VERSION` in
`src/world/solve.ts` is now 3, so the node cache re-solves under the
corrected rules; see the Fix report section below for exactly what
changed in the review round and why.

- **Distance to water** is owned by `STREAM_M3S` (`src/world/classify.ts`):
  a brook is a year-round stream at or above this discharge, and streams
  count as water for the measure. `0.05 -> 0.02`. Moved p50 from 0.9 km to
  0.6 km and p90 from 2.4 km to 1.5 km across all three seeds. Still not
  strictly under the 0.6 km target; left red rather than spending a second
  adjustment on the same measure. The review round asked for this to be
  justified in real terms rather than by the measure it moved: 20 litres
  a second is within the 10 to 30 l/s order of magnitude for a perennial
  first-order brook in humid Fennoscandia, and the new perennial channel
  density measure (0.78 to 0.79 km/km2, against an estimated 0.5 to 1.5
  km/km2 for perennial channels in Nordic terrain) checks the consequence
  independently and reads green.
- **Lake share** is owned by `LAKE_MIN_DEPTH_M` (`src/world/solve.ts`).
  The first round dropped it `2 -> 1`; lake share did not move (2.0%,
  2.7%, 2.1% before, 2.0%, 2.7%, 2.2% after - the same numbers to a tenth
  of a point), which the review round correctly read as "not a
  correction" rather than a tried-and-failed fix, and reverted it. It is
  back at its spec value of `2`. Lake share stays red at 2.0 to 2.7% on
  both the miniature and full worlds; the depression rule that decides
  how many closed basins the drainage produces in the first place, not
  the depth floor that decides which of them count as lakes, is where a
  future pass should look.
- **Rock share by band** is owned by `rockRate()`'s four literals
  (`src/world/classify.ts`). The first round's fix was wrong: it raised
  the four rates to compensate for the raw fbm soil noise not being
  uniform, when the real bug was the assumption that fbm *is* uniform.
  The review round's correction restores the spec's own rates (coast
  0.30, steep 0.25, under-treeline 0.35, elsewhere 0.04) and instead
  makes the noise itself uniform by rank before `rockRate()` ever sees
  it - see the Fix report for `uniformise()`. Coast now reads 27 to 32%
  against a target of 30 (green); steep reads 21 to 22% against 25 (red,
  close, and not fixable by this transform alone - see the table above);
  lowland reads 7.0 to 7.6% against 3 to 5% (red, and now understood to
  be a real overlap with the under-treeline band rather than a
  miscalibrated floor - see the table above).
- **Bog share** is owned by the wetness and precipitation thresholds in
  the bog rule (`src/world/classify.ts`, the `slope < 0.02 && wetness >
  0.6 && p > 0.3` line); the slope term is left alone since
  `tests/solve.test.ts` asserts bog's slope tolerance directly and
  changing it would mean editing the test. `wetness > 0.6 -> 0.5`,
  `p > 0.3 -> 0.2`. Not part of this review round - unchanged from the
  first pass. Bog share rose in every band (roughly 0 to 2% before,
  2 to 7% after, before the 67N jump), and the 67N band itself rose too
  (10 to 21% before, 16 to 31% after). Still red: the low-latitude bands
  need to start near 10% and they are still well under it, so the trend
  is in the right direction but the floor has not moved enough. Left red
  rather than loosening the thresholds a second time.

None of these touched the erosion (`src/world/erode.ts`) or glacial
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

This comparison was not repeated for the review round's corrections
(rockRate reverted to spec rates plus `uniformise()`, `LAKE_MIN_DEPTH_M`
reverted to 2): the coordinator's instructions for that round were
explicit that no `git stash` be used. The round's own required tests
(`tests/solve.test.ts`, `tests/solve-hydrology.test.ts`,
`tests/erode.test.ts`, `tests/terrain-template.test.ts`,
`tests/hydro.test.ts`) all pass; see the Fix report section.

## `scripts/mapstats.ts`

Added `river: "="` to `GLYPH` (it was already present from an earlier
task), and a new full-resolution block after the downsampled ASCII map:
water kinds (sea/lake percent, river cell count), stream cell count,
rock share of land, and a land height histogram in 200 m bands. Run for
seed 42:

```
water kinds: sea 39.1% lake 1.6% river cells 986; stream cells 556838; rock share of land 5.5%
land height histogram (200 m bands): 0-200m 7.6%  200-400m 11.5%  400-600m 20.2%  600-800m 20.0%  800-1000m 14.0%  1000-1200m 7.6%  1200-1400m 4.4%  1400-1600m 3.6%  1600-1800m 3.0%  1800-2000m 2.7%  2000-2200m 2.4%  2200-2400m 1.8%  2400-2600m 1.1%  2600-2800m 0.2%  2800-3000m 0.0%
start Harevik at lattice 18850: forest 54% water 43% cells 267 spots camp 0, forest 0.6, shore 0.6 neighbours 6; start in 0 ms
```

(Rock share of land reads higher here, 5.5%, than the sampled ASCII
map's 3% - the full-resolution figure counts every cell, the ASCII map
only 8,880 sample points at 120 columns, so a coarse sample under-catches
a class distributed in scattered single cells rather than solid blocks,
which rock is by design. The start cell and region shifted slightly from
the pre-fix run - `GENERATOR_VERSION` 3 is a different world, and
`findStart`'s spiral search naturally lands on a different first
candidate once the terrain classification under it changes.)

The picture (`npx vite-node scripts/mapstats.ts 42`) reads as the brief
asked: the west third of the sampled strip is open sea (`~`) breaking up
into what would be inlets and skerries at higher resolution; east of that
a broad, mostly continuous band of fell (`^`) runs down the map like a
spine, with rock (`n`), bog (`"`) and meadow (`.`) glyphs scattered
through it rather than forming a solid collar; east of the fell the
ground drops into a wide forest of pine (`T`), birch (`Y`) and pockets of
spruce (`A`). The downsampled 120-column view is too coarse to show
individual river lines (river read as 0% of the sampled points, against
986 actual river cells full-resolution out of 4,003,200), which is
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
  above; added the perennial channel density line (review round).
- `scripts/mapstats.ts` - added the full-resolution water/stream/rock/
  height-histogram block.
- `tests/slow/terrain-budget.test.ts` - new, the solve budget test.
- `tests/solve.test.ts` - new `uniformise` test (review round).
- `src/world/solve.ts` - `GENERATOR_VERSION` 1 -> 2 -> 3;
  `LAKE_MIN_DEPTH_M` 2 -> 1 -> 2 (reverted in the review round, see the
  Fix report).
- `src/world/classify.ts` - `STREAM_M3S` 0.05 -> 0.02 (kept); the bog
  rule's wetness and precipitation thresholds loosened (kept); new
  exported `uniformise()` helper and a soil pre-pass in `classify()`
  (review round); `rockRate()`'s four rates raised then reverted back to
  the spec's own values once the noise feeding them was fixed instead
  (review round, see the Fix report).
- `docs/README.md`, `docs/testing.md` - as above.
- `docs/superpowers/reports/2026-09-11-terrain-hydrology-report.md` -
  this file.

`vitest.config.ts` was not touched: `tests/slow/terrain-budget.test.ts`
is already covered by that file's `tests/slow/**/*.test.ts` glob for the
slow suite, the same as every other file already in that directory, and
`scripts/check-test-discovery.mjs` confirms no file is missed, duplicated
or in both suites.

## Self-review

- Ran `npx tsc --noEmit` clean, both after the first round and after the
  review round's fix.
- Ran `npx vitest run tests/solve.test.ts tests/solve-hydrology.test.ts tests/erode.test.ts`
  green after each first-round constant edit, and once more at the end.
- Ran `npx vitest run tests/solve.test.ts tests/solve-hydrology.test.ts tests/erode.test.ts tests/terrain-template.test.ts tests/hydro.test.ts`
  green after the review round's fix (35 tests, 5 files), including the
  new `uniformise` test.
- Ran `SURVIDLE_TEST_SUITE=slow npx vitest run tests/slow/terrain-budget.test.ts`
  alone: 5.1 s in the first round, 4.8 s after the review round's fix -
  both pass.
- Checked the fast suite did not regress from the first round's constant
  edits via a scoped stash comparison (18 -> 17 failed files, all
  pre-existing fixture staleness). Not repeated for the review round's
  fix, which used no `git stash` per that round's instructions - see
  the note in the regression-check section above.
- Re-read `scripts/terrain.ts` against the brief's verbatim code block:
  identical except the `NO_FLOW` import source (fixed, see above), the
  `--time` block kept from Task 3 and gated as asked, and the review
  round's added channel-density line.
- Checked `docs/README.md`'s 0.321 elevation line was left untouched and
  that nothing added near it claims a different number.
- No em dashes, unicode arrows or fancy quotes introduced; checked with
  a grep over the changed files, again after the review round.
- Checked `uniformise()` and its callers use only arithmetic and
  `Math.floor`, matching the review round's constraint and the existing
  banned-function test's engine-determinism rule.

## Issues or concerns

- Several measures stay red after this task's adjustments: distance-to-
  water p50 (at the 0.6 km boundary, a grid quantisation issue as much as
  a threshold one), lake share (its owning constant, tried and reverted,
  made no measured difference - the drainage producing too few closed
  basins is the real target for a later pass), rock share on steep ground
  (21 to 22% against 25%, a spatially confined population the noise fix
  cannot reach), rock share on lowland ground (7.0 to 7.6% against a 3 to
  5% target - now understood to be a real overlap with the under-treeline
  band rather than a miscalibration, see the reading table above), and
  bog share's low-latitude floor (rising but still well under the 10%
  the target implies at the low end). These are named honestly in the
  tables above rather than pushed further with more adjustments.
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
  each doing more work to build. None of this task's generator-constant
  changes touch routing or region-building, so the regression is in the
  terrain shape itself (the fjorded coast from Tasks 1-4), not in
  anything adjusted here.

## Fix report (review round 1)

The review of this task's first submission found three Important items.
The vitest-config question was checked and needed no change (see the
coordinator's own ruling, which this report agrees with: the slow suite's
`tests/slow/**` glob already discovers the budget test). The other two:

**1. Rock rates - the real bug was the uniformity assumption, not the
rate.** The first round raised `rockRate()`'s four literals (0.30/0.25/
0.35/0.04 to 0.40/0.38/0.45/0.15) to compensate for the fact that the raw
two-octave fbm soil noise clusters near 0.5 rather than drawing uniformly
from 0..1. That treats the symptom: any given band's *actual* share
still depends on exactly how non-uniform the noise is at that band's
population, which is not portable across seeds or worlds and does not
say anything true about "a rate is a share of cells." The fix instead
restores the spec's own rates and makes the noise itself uniform:

- Added `export function uniformise(values: Float32Array, bins = 4096):
  Float32Array` to `src/world/classify.ts`. It finds the raw min and max
  by a manual scan (no `Math.min`/`Math.max`), bins every value into one
  of `bins` buckets, turns the per-bucket counts into a running
  cumulative share of the whole population, and maps each value to the
  cumulative share up to and including its own bucket. Arithmetic and
  `Math.floor` only, so it stays engine-identical with the rest of the
  solve, matching the existing banned-function test's rule.
- `classify()` now runs a pre-pass before its main per-cell loop: it
  marks every cell that will end up `KIND.land` (not sea, not lake, not
  over the river discharge threshold), samples the raw fbm soil value for
  each of those cells once, runs `uniformise()` over that population, and
  scatters the result back into a full-size `soilAt` array. The main loop
  reads `soilAt[i]` instead of calling `fbm()` inline, so the total number
  of noise samples taken is unchanged - it is reorganised, not doubled.
- `rockRate()` is back to the spec's rates verbatim (0.30 coast, 0.25
  steep, 0.35 under-treeline, 0.04 elsewhere), now genuinely reads as
  "share of cells" since the value it compares against is uniform.
- Added the fast test the review asked for, in `tests/solve.test.ts`:
  samples a 200x200 fbm field (a fresh field, not tied to a world size,
  so the test is independent of any world's soil seed), uniformises it,
  and asserts the share of values under 0.3 is within 0.02 of 0.3.
  Passing without a solved world keeps it fast.
- Result: coast rock share now reads 27 to 32% against a target of 30
  (green) - close to what the first round's ad hoc rate also achieved,
  but for the right reason this time. Steep stays red (21 to 22% against
  25) because "steep" is a small, spatially confined population and a
  rank transform makes the *whole* land population uniform, not every
  geographic subset of it - a real limit of this fix, not a bug in it.
  Lowland moved from red-low (1.8 to 2.3% before any fix) to red-high
  (7.0 to 7.6% now): with the floor rate corrected from an effectively
  near-zero rate (0.04 against raw fbm, which rarely gets that low) to
  its true ~4% share, the overlap between the report's "lowland"
  measurement bucket and `rockRate()`'s separate 100 m under-treeline
  band (rate 0.35) - which was always there, just hidden by the
  miscalibrated floor - now shows through. This is an accurate reading
  of an existing overlap in the classification, not a new problem the
  fix introduced, and it was not chased further this round since the
  coordinator's three corrections did not ask for a fourth pass at that
  band's definition.

**2. `LAKE_MIN_DEPTH_M` reverted to 2.** The first round's drop to 1
moved lake share nowhere (2.0 to 2.7% before and after, to a tenth of a
point), which the review correctly read as "tried, not a correction."
Reverted to the spec's value of 2. The report now says plainly that lake
share is red on both the miniature and full worlds at 2 to 3%, and that
the depression rule producing too few closed basins in the first place -
not the depth floor deciding which of them count as lakes - is what a
later pass should look at.

**3. `STREAM_M3S` stays at 0.02, now justified in real terms.** Added a
perennial channel density measure to `scripts/terrain.ts`, printed beside
the distance-to-water line: `streamCells * 0.3 / (landCells * 0.09)`, km
of perennial channel per km2 of land, against an estimated 0.5 to 1.5
km/km2 for perennial channels in Nordic terrain (stated in the report and
the script's own comment as an estimate; total channel density including
ephemeral runs would read higher). Reads 0.78 to 0.79 km/km2 across the
three seeds - green. The real-terms case for 20 l/s (`STREAM_M3S = 0.02`)
as "a brook that runs all year": perennial first-order brooks in humid
Fennoscandia carry a mean flow on the order of 10 to 30 l/s, so 20 l/s
sits inside that band rather than being picked to hit the distance
measure.

**What did not change:** `STREAM_M3S` (0.02) and the bog rule's wetness/
precipitation thresholds (0.5/0.2) were not part of this review round and
are unchanged from the first submission.

**Verification for this round:**

```
$ npx tsc --noEmit
(clean)

$ npx vitest run tests/solve.test.ts tests/solve-hydrology.test.ts tests/erode.test.ts tests/terrain-template.test.ts tests/hydro.test.ts
 Test Files  5 passed (5)
      Tests  35 passed (35)

$ SURVIDLE_TEST_SUITE=slow npx vitest run tests/slow/terrain-budget.test.ts
full solve 4.8 s
 Test Files  1 passed (1)

$ npm run terrain
(three-seed tables above, "After the corrected fix" section)
```

`GENERATOR_VERSION` moved 2 -> 3. No `git stash` was used this round, per
the coordinator's instruction. Committed as a single commit on top of
the first submission's commit (`2b986692`), with a message naming the
uniform soil noise fix.


## Browser pass (task 12)

Both browser MCPs were unavailable - chrome-devtools-mcp's profile was held
by another session and the claude-in-chrome extension reported "not
connected" - so this pass ran against an own headless Chrome on a private
debug port, driven over CDP. Dev server: `npm run dev` in `08-survidle`,
which took port 5174 because a sibling session held 5173. Page:
`http://127.0.0.1:5174/prototypes/08/?seed=42`, viewport 1440 by 900 unless
stated.

| check | what the page showed |
| --- | --- |
| loading bar stages | all five in order: raising the land, wearing the valleys, filling the lakes, cutting the fjords, naming the ground |
| bar appears, reaches the end, hides | visible from 149 ms, last stage at 4.7 s, hidden with the run up at 7.5 s (budget 25 s) |
| reload returns the same world | bar shown again, five stages again, ready at 7.4 s, `world.startCell` 3,677,622 both times |
| the run starts on a shore | start cell (222, 2043), land at 3 m, three of its four neighbours sea |
| the far side of the fjord is in the viewshed | the landing look maps 267 cells out to 5.1 km, including land across 9 cells (2.7 km) of sea |
| zoom out | rungs read 300 m, 900 m, 2.7 km and 18.6 km per glyph; at 2.7 km the sea, the forest belt and the fell spine read as bands from coast to crest |
| zoom in at a river | at 100 m per detail the river draws `=` and fords draw `#`, and the reach carries April ice ("safe ice over water") |
| a route that must cross water | the places panel offered "across the ice (8 cm, thin)" for four neighbouring regions, so the thin-ice route offer is live in the page |
| phone width | at 400 by 860 the page is one column, `document.documentElement.scrollWidth` 400 against `innerWidth` 400: no horizontal scroll |
| console | no exceptions; only vite's connect lines and Chrome's AudioContext autoplay warning, which headless always raises |
| memory, live heap after a forced collection | 65 MB after the bar hides, 65 MB after two game minutes at the default zoom, 65 MB after a zoom-out (`totalJSHeapSize` 68 to 70 MB). Under the 200 MB line at all three moments, so the check passes |
| memory, without collecting first | `usedJSHeapSize` oscillates between 88 MB and 254 MB and `totalJSHeapSize` reaches 293 MB. The peak is garbage the collector had not taken yet: the live figure above is flat at 65 MB across the same moments |

Screenshots, all at seed 42:

- `docs/terrain-shots/landing-seed42.png` - the run at the landing, minute 5:
  the shore, the birch stand behind it, the sea north, fog beyond the look.
- `docs/terrain-shots/zoomed-out-revealed.png` - 2.7 km per glyph. The map is
  revealed by hand (every cell in a 228 by 120 km box marked known from the
  console) so the shot shows the ground rather than the fog: sea, a forest
  belt, and the fell spine east of it.
- `docs/terrain-shots/river-ford.png` - 100 m per detail on the nearest river
  to the landing, at (715, 2160): `=` for the channel, `#` for its fords.
- `docs/terrain-shots/river-course-300m.png` - the same course at 300 m per
  glyph: a chain of lakes with short river reaches between them.
- `docs/terrain-shots/river-whole-north.png` - the whole-world rung, where a
  one-cell channel does not survive the glyph.
- `docs/terrain-shots/river-route-at-ford.png` - the walk that crosses at the
  ford, in progress.
- `docs/terrain-shots/phone-400.png` - 400 px wide.

### The two river checks, on the reach rather than on the landing

Seed 42 has no river within reach of its landing, so both checks were run by
putting the survivor on the nearest reach, at (715, 2160), from the console -
the same placement the zoomed-out shot uses.

**A river does not read as a line from the crest to the sea.** Following the
solved flow directions downstream from that cell: 201 steps, of which 53 are
river cells and 148 are lake. The river cells come in runs of 1 to 15, so the
course is a chain of lakes joined by short reaches rather than one line, and
it ends at the southern world edge as a river cell rather than at the sea.
With the whole course and a three-cell margin marked known, the map draws it
at the two closest rungs only:

| rung | river glyphs | water glyphs |
| --- | ---: | ---: |
| 100 m per detail | 4 | 38 |
| 300 m per glyph | 11 | 169 |
| 900 m per glyph | 0 | 209 |
| 2.7 km per glyph | 0 | 45 |

A channel one cell wide disappears into a glyph that covers nine or more
cells, so at 900 m and coarser the course reads as its lakes alone.
`docs/terrain-shots/river-course-300m.png` is the 300 m view of the chain;
`river-whole-north.png` is the whole-world rung, where the course is not
drawn at all.

**The route refuses a crossing with no ford and takes one at a ford.** Run in
open water: the clock was moved to 20 July and the ground state dropped so
every region recomputed from the climate, which leaves the reach ice-free
(`iceCm` 0). The survivor stood at (749, 2133), one cell north of a river cell
at (749, 2134) that is *not* a ford. Asked for each walk the way a player asks
- a click on the target cell of the map:

- Target (749, 2135), the far bank straight across the fordless cell: the app
  planned a 14-cell route that never steps on (749, 2134). The only river cell
  on it is (744, 2135), which is a ford - it walks five cells west and crosses
  there.
- Target (745, 2135), the far bank across that ford: a 7-cell route, crossing
  at the same ford cell.
- The same fordless crossing with knowledge cut back to a corridor holding two
  river cells and no ford: no route, no task, and the log reads "Walk to a
  spot 0.6 km south: you know no way there."

`docs/terrain-shots/river-route-at-ford.png` holds the crossing walk in
progress.

## Open findings (task 12)

**Rivers are scarce, and none is near a southern landing.** Seed 42 holds 986
river cells in 4,003,200 - about 296 km of channel in a world 540 by 667 km -
and the nearest to the landing is 152 km away at (715, 2160). The ford
machinery works where a river is (that reach has 12 river cells in a 12 by 12
km box, 8 of them fords, and the map draws both), but a run that starts on
the southern shore will not meet one. The river cell count was already
reported in the first submission; what is new is that the play area has none.

**A river is not a connected line of cells, and the gaps are lakes.** Traced
downstream from (715, 2160), the course is 53 river cells and 148 lake cells
over 201 steps, in river runs of 1 to 15, and it leaves the world at the
southern edge rather than reaching the sea. That is a defensible landscape - a
chain of tarns linked by short reaches - but it means "the river from the
crest to the sea" is not a thing the map can draw, and at 900 m per glyph and
coarser the channel is not drawn at all.

**Lee by upwind blocking.** The depression rule that stood here read a cell as
lee only when it was lower than all four cardinal neighbours, and a drainage
solve fills interior pits, so on seed 17 only two land cells in a thousand
qualified and none lay within the several hundred regions around the landing.
Lee is now relative blocking: the highest ratio of upwind ground plus canopy
above the cell over its true distance, sampled five steps upwind along the
eight winds - 300 m to 1.5 km on a cardinal wind, 424 m to 2.1 km on a
diagonal one - with 0.05 lee and 0.1 full shelter. `npm run terrain -- 42`
reports the share of land cells that are lee: **31.2% under a west wind and
32.4% under a north wind**, and 22.3% north-west and 22.4% south-west, the
diagonals reading lower because a diagonal step is the 424 m it really is.
Valleys, gullies, the downwind side of a ridge, banks and terraces all shelter
while draining normally, and a wood upwind shelters as a barrier does.

**The heir gate's time is the route search, called from the hunting chooser.**
`scripts/reference.ts --heir` runs 24 lives of a year. Measured on seed 42, a
twenty-day reference life: 13.6 s of simulation (0.68 s a game day) and
334,694 A* searches, of which 5.67 of the profile's 5.70 s under `astar` came
from one caller chain - `speciesValue` -> `kmBetween` -> `survivorRoute` ->
`knownRoute`. The chooser measures a route from here to every mapped cell of
the region and its neighbours and a second route from that cell to camp, and
a search that cannot reach its target expands its whole box (mean 4,329 cells,
five typed arrays allocated and filled per call) before returning null. A
fjord landing puts a large share of those candidate cells across water, so
they are the expensive failing kind.

Widening the knowledge-limited route cache from 512 entries to 4,096 - one
sweep's worth - cuts the searches to 114,605 and the simulation to 8.6 s, a
third off, with the same outcome to the day (committed). 16,384 buys nothing
more, so the working set fits in 4,096. That does not close the gap to the
old world's roughly 15 minutes for the whole gate: what remains is the volume
of searches the chooser asks for, which is a design question about the
chooser rather than a cache size. The obvious next step, if someone wants the
gate fast, is to stop the chooser routing to every mapped cell - straight-line
distance to rank candidates and a route only for the shortlist.

**A sibling session's dev server was stopped by accident.** Cleaning up used
`pkill -f "vite --host 127.0.0.1"`, which matched the dev server another
session was running on port 5173 as well as this one's on 5174. No file was
touched; that session needs to restart `npm run dev`.

**The world cache holds stale versions.** `node_modules/.cache/survidle-worlds`
carries v1, v2 and v3 bins side by side, 44 MB each, about 5.4 GB in total.
Nothing reads v1 or v2 now.

## Slow suite

The whole-suite run is deferred until after the merge with main, on the author's
instruction: a fixture re-sited against this branch alone could be broken again
by whatever main has moved, so the one long run is worth spending once, on the
merged tree. What follows is the state of the re-site, file by file, measured by
running each file on its own with `SURVIDLE_TEST_SUITE=slow npx vitest run <file>`.

The run this replaces read 94 failed of 1335 across 32 files. Every one of those
32 files now passes on its own. The three failures the earlier round flagged as
possible real bugs were traced first, and none of them is a bug in the source:

- **`tests/churn.test.ts`, the panel churn budget.** The earlier note named
  `stats`, `weather` and `skills`; those are the whole counts table, not the
  over-budget list, which was `gear` (3 of 300, budget 2) and `map` (9, budget
  5). Diffing the markup frame by frame puts every one of those redraws in the
  weather: the landing is at sea level, so April crosses 0 C during the run
  (-0.92 C at minute 6 to +1.98 C at minute 24), a shower starts as snow, turns
  to rain and stops, and the fog crosses its shown threshold and back. Both
  panels redraw because what they show really changed. The budgets for `gear`
  and `map` are now MINUTE, the same claim `stats` and `weather` already make,
  with the reason in the comment.
- **`tests/words.test.ts`, region names with no Norwegian letter.**
  `src/world/names.ts` is intact. Only 2 of 24 prefixes carry a non-ASCII
  letter, so the six names the test read - home plus its neighbours - miss about
  60 percent of the time; over 40 regions, seed 21 gives 7. A coin flip that
  happened to land right on the old map. The test now samples the neighbourhood
  out to 40 regions, so it is about the pools rather than one draw.
- **`tests/probe.test.ts`, an undefined through `fishItem`.** The undefined is
  the test's own precondition, `capacity.trout`, on a landing region that holds
  no trout; `fishItem` is never reached. The camp is now sited by
  `lakeShoreNear` with the rule "this region holds trout".

One finding for the author that is not this branch's: `tests/tasks.test.ts`
"offers every kind of task somewhere in the list" wanted `sleep` among the
offered tasks, and commit `fb1fe98d` on main ("separate sleep from stamina
collapse") removed `check(state, world, cal, "sleep")` from `availableTasks`.
Sleep became body-owned work the runner starts. The expectation is dropped with
a comment; if sleep is meant to stay offerable by hand, the source is what needs
the change. The same commit is why `tests/advance-save.test.ts` no longer falls
asleep on low energy alone - that case now sets the sleep debt.

New finders in `tests/world-facts.ts`, each stating its rule:
`openCampWithForestNear` (an open camp with forest a short walk off, with a
minimum distance for a case that needs the round trip to cost something),
`forestCampOnWater`, `shoreCampWithDryForest`, `forestPairNear`,
`dryForestNear`, `regionWithSpots`, `forestKindNear`.

Re-sited by finder, with the count each file was carrying:

- `tests/body.test.ts` (22): `felling()` no longer names seed 39's camp - it
  stands at `openCampWithForestNear`, and `campAt(seed, findCamp)` lets a case
  ask for other ground by rule (`forestCampOnWater` for the camp-and-melt
  fallback, `shoreCampWithDryForest` for the walk for water). The storm cases'
  `cells.find(terrain === ...)` lookups and two literal cell numbers go through
  `terrainCellNear`, `forestPairNear` and `leeCellNear`.
- `tests/bodyorder.test.ts` (6): four terrain lookups through
  `terrainCellNear`; the thirst case stands in `dryForestNear`; the snare case
  runs on until a chunk is really in hand rather than assuming one at 60 minutes.
- `tests/intent.test.ts` (8): the berries assertion re-anchored to `heathCell`
  (bog or meadow) rather than the old `["fell", "meadow"]`, which contradicted
  the rule already; the tree kind from `forestKindNear`; `regionWithSpots` for
  the two hunt-for-anything cases and the spot fallback; an outcrop region for
  the stone gather; the spot fallback re-anchored to the source rule (the
  nearest suitable cell, with the note naming the forest).
- `tests/tasks.test.ts` (7): `walkableNeighbour` for the travel case, a region
  with deer capacity for the hunt, and the `sleep` finding above.
- `tests/orders.test.ts` (4) and `tests/night-work.test.ts` (2): the night gate's
  away branch needs a camp off forest ground, or the felling is worked at camp;
  the in-flight case waits for a real mid-chunk minute; the collapse case allows
  for a longer walk home.
- `tests/water.test.ts` (3): the thirst death stands in `dryForestNear`; the two
  freeze cases put the cold in at the sampling boundary, since `freezeCamps`
  reads the local air at the camp cell and ignores the ambient it is handed.
- `tests/animals.test.ts` (4): the gained species read off the region's own
  capacity; the local thaw found rather than dated; elk conservation summed over
  every region and the herd started at capacity; the hare refill given a region
  whose neighbours are all hare ground.
- `tests/animal-agents.test.ts` (2): the seeded threshold case asserts the
  minute's own answer is stable rather than naming it; the wolf case asserts the
  strike is refused rather than where the wolf goes next.
- `tests/ui.test.ts` (5): every road out accepts the ice crossing a water
  neighbour gets; the felling breadcrumb and bar derive the tree kind from the
  resolved cell; the map's light read from the air where the survivor stands,
  which is what `mapHtml` uses; the activity row read for distance and
  destination rather than the verb the ground picks.
- `tests/epitaph.test.ts` (3): two inline snapshots re-baked (they are measured
  outcomes by their own comment); the kitted trap asked of four reference
  landings, since how fast a trap fills follows from what its shore holds.
- `tests/roots.test.ts` (2): the file's own `findCell` walked the whole square
  of every ring out to 60 cells and threw for meadow; it now walks one perimeter
  at a time out to 400.
- `tests/horizon.test.ts` (2): the manual want list re-baked (`fill:shore` for
  an open shore, plus a `seaweed:` want a salt landing opens); the manual-stage
  reading re-read - the freeze is day 7 against a 0..2 band, with the cap raised
  over it so the run ends on the body and not the cap.
- `tests/hand.test.ts` (2): the camp is one you leave; the collapse is put in
  directly rather than left to the round trip to spend, and the second click
  displaces with a task the ground can answer.
- `tests/workday.test.ts` (2): the felling moved to `shoreCampWithDryForest`
  with a heath, so the thirst is a trip and can rank against the snares.
- `tests/advance-save.test.ts` (2), `tests/startday.test.ts` (1): the April
  temperature and the opening snow cover are the readings the spec predicted
  would move; the survival case asserts below freezing with the water shut, and
  the snow case asserts the cover is deterministic for a seed.
- `tests/camp.test.ts` (1), `tests/torch.test.ts` (1): the camp goes to country
  that holds wolves.
- `tests/shopping.test.ts` (1): a region given both an outcrop and a forest.
- `tests/skills.test.ts` (1): the fishing reading picks a fish whose practice a
  beginner already meets, since closing a recommendation gap halves into the
  odds alongside the skill.
- `tests/spine.test.ts` (1): six of the eight thresholds are what a year at this
  landing reaches; the cold snap wants -20 C, which a sea-level coast never
  sees, so it and the ice-out behind it are driven on the same detector with the
  air pushed under the line.
- `tests/walkorders.test.ts` (1): `walkableNeighbour`.
- `tests/explore.test.ts` (1): a region with water in it is surveyed as well as
  walked, so the shore reads belong in the sum the walk is checked against.
- `tests/reference.test.ts` (1): the spear keep is given its materials, since
  whether an outcrop is within reach is not what the keep is about.
- `tests/slow/wayfinding-vantage.test.ts` (1): the sweep goes to the first
  neighbour with ground in it, since a sweep of open water finishes in no
  minutes and eight of the twelve seeds measured 0.
- `tests/slow/heir.test.ts` (1): the heir reaches the old camp on day 14 where a
  walkable old world gave three. The walk before the first order is the rule and
  is kept; the day is a reading the author should look at.

## Heir lineage gate, measured

Run once from the controller session after the known-route cache widening: about 80 minutes wall time for the 24 lives (about 15 on main). Readings: trend gate 1 of 5 seeds (the gate is 3 of 4); lineage gate 3 of 5 seeds reached a year within six lives. Findings, not targets: the drop against the old world is the fjord coast the heirs land on, and the time is the hunting chooser routing to every mapped candidate cell.

## Rivers at 5 cubic metres a second

The threshold that made a cell `river` terrain was the classification defect: 40 cubic metres a second is a Namsen-class river needing 800 to 3,300 km2 of catchment, so the world held 300 km of it and a southern landing saw none, while a river a person calls a river starts around 5 cubic metres a second. Separately, the map's block sampling was a representation defect of its own: a one-cell-wide river vanished at any rung coarser than one cell per glyph regardless of the threshold, because a 3 by 3 sample takes the block's commonest class and a single river cell never wins that vote.

`RIVER_M3S` is now 5 (about 10 to 15 m wide at bankfull by Leopold's width relation, a catchment of about 400 km2 inland or 100 km2 on the Atlantic side), and `blockInfo` in `src/ui/map.ts` now promotes a block to `river` whenever any sampled known cell in it is a river cell and the block is not already majority water, so the thread stays visible at every zoom rung instead of only at one cell per glyph.

Seed 42, `npm run terrain -- 42`:

| | before (`RIVER_M3S = 40`) | after (`RIVER_M3S = 5`) |
|---|---|---|
| river cells | 986 | 11,289 |
| largest river mouths (m3/s) | 130 101 53 52 | 130 101 53 52 40 |

River cells rose by about a factor of 11, and the world's fifth-largest mouth (40 m3/s) now clears the new threshold and shows on the list.

## Chooser shortlist

`bestHuntCell` routed to every mapped cell of the region (and of the neighbours
when an expert ranged), twice per cell per species, which is what made the
lineage gate an 80 minute run. It now sifts first and routes second: one
breadth-first flood over known, passable ground (`reachableFrom` in
`src/sim/routing.ts`) drops the cells no route could reach without asking A* to
expand its whole box to answer null, every surviving candidate is scored on
straight-line distances, and only the best `HUNT_SHORTLIST = 24` of that
ranking are measured with real routes and scored again.

The sift ranks on the score rather than on distance alone. A shortlist of the
nearest 24 cells is enough for the from-scratch reference player, but it
silently took away the expert's reach: measured on seed 1 with the landing
region's hunting pressure at 1, the best ground in each neighbouring region sat
at straight-line rank 34 to 89, scoring 4.4 against 1.5 for anything within the
nearest 24 - so a nearest-24 shortlist would have kept an expert on emptied
ground. Scoring the sift on straight km, which the value term already accounts
for, keeps that behaviour; the two expert-ranging tests in
`tests/hunting.test.ts` are the guard.

`huntEstimate` and `huntSpeciesWeights` take an optional `HuntTravel`
(`toCell`, `toCamp`); given one, the distances are the caller's, so the walk
home is measured once per cell instead of once per species, and the sift pays
no A* at all. Callers that pass nothing route exactly as before.

Seed 42, 20 days, `npx vite-node scripts/reference.ts 42 20`, three runs each:

| | before | after |
|---|---|---|
| wall time | 15.3, 15.9, 16.7 s | 11.1, 11.1, 11.6 s |
| A* searches | 114,637 | 10,515 |

The run's outcome is unchanged (alive and fed at day 20, reached day 21), and
under a CPU profile A* is no longer the hot spot in the chain - what remains of
the 11 s is world generation.

## World cache (task 4)

`src/world/worldstore.ts` adds an IndexedDB cache (`survidle-worlds` database,
`worlds` store, keyed by `worldKey(seed, w, h)` which bakes in
`GENERATOR_VERSION`) so `loadWorld` in `src/world/worldloader.ts` can skip the
worker solve on a returning seed: `readSolved` first, and on a miss the worker
path as before followed by `void writeSolved(key, m.solved)` from the main
thread's copy. On open, any record whose key does not end with the live
`-v${GENERATOR_VERSION}` is swept. Failures (no IndexedDB, quota, a version
error) resolve to `null`/`void` rather than throwing; the module accepts an
injected `{ get, put }` store (`setWorldStore`) so `tests/worldstore.test.ts`
covers the key and the round trip of the seven typed arrays without needing
IndexedDB in happy-dom.

Timed over CDP against a headless Chrome on a fresh profile, dev server,
`http://127.0.0.1:5173/prototypes/08/?seed=42` (measured from `window.survidle.world`
appearing, since the static `#loading` markup ships pre-filled with the first
stage name and `hidden`, so bar visibility alone is not a reliable marker):

| load | time |
|---|---|
| first load (worker solve, fresh IndexedDB) | 8.8 s from browser launch (bar ran raising the land -> wearing the valleys -> filling the lakes -> cutting the fjords -> naming the ground) |
| reload (cache hit) | 2.4-2.8 s from the reload call, stage jumps straight to "reading the ground" |

The reload numbers are dominated by the Vite dev server re-fetching and
retransforming the module graph, not by `readSolved`/`generateWorld` - the
worker's five-stage solve never runs on the reload in either trial, and
`indexedDB.databases()` from the console lists `survidle-worlds` throughout. A
production build (no per-module dev-server round trips) would read faster
still; that was not separately measured here.
