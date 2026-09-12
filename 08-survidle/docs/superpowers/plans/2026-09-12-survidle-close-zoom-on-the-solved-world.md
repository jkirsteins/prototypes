# Close zoom on the solved world: instructions for the branch

Written 2026-09-12 for `survidle/authoritative-close-zoom`, at eb42d715
when this was written. The terrain hydrology is on main since PR 13
(359e395c). The order decided on 2026-09-11 (roadmap, "The terrain
merge order") is: hydrology first, then this branch merges main and
rewrites its fine terrain to refine the solved world. This document is
that rewrite, step by step. The rivers spec
(`2026-09-11-survidle-rivers-design.md`, section 0) is the consumer and
names the contract; the contract tests in section 6 here are its gate.

The principle in one line: **water and height are top-down from the
solved 300 m arrays; forest, bog and rock are bottom-up from the 50 m
patch.** Water is global (a river is its whole catchment, a lake is its
rim, sea is connection to the ocean) and cannot be a pure function of
one position. The branch's fine water today is a noise threshold and
goes.

## 0. Merge main first, and what the merge changes

Merge `origin/main` into the branch. Do not rebase: the branch has 26
commits with docs that cite them, and a merge commit is what the other
terrain branch did. `git merge-tree` against main today shows conflicts
in 18 source files and 24 tests. Resolve by one rule per group:

| Files | Rule |
|---|---|
| `src/world/cells.ts`, `gen.ts`, `route.ts`, `terrain.ts` | Main's solved world is the base. Re-apply the fine layer on top of it. `World` keeps main's `solved: SolvedWorld` and gains the branch's `fineChunks`; main's region `chunks` map folds into the fine chunk (one chunk type, not two). |
| `src/sim/position.ts`, `mapped.ts`, `tasks.ts`, `hunting.ts`, `cellstatus.ts` | The branch's fine ownership wins; main's river and stream reads (`waterKindOf` returning `"river"`, `streamAt`, `fordAt`) are kept and read at the parent. |
| `src/sim/climate.ts`, `sight.ts`, `weather-scenarios.ts` | Main's metre readers (`heightAt`, prominence) win over the branch's field reads; section 3 says what each becomes. |
| `src/sim/save.ts`, `newgame.ts`, `src/main.ts` | Both: main's world loader with the solve worker and the IndexedDB cache, plus the branch's fine save version. Save version bumps once more. |
| `src/ui/map.ts`, `render.ts`, `style.css` | Both: main's river glyph, ford mark, stream mark and shimmer, plus the branch's real close ground. |
| tests | Re-bake fixtures on the merged world after section 5; until then the known-red list is the branch's own. |

Two things main changed under the branch that are easy to miss:

- **The world is 1800 by 2224 cells, not 1800 by 1300.** The fine
  lattice is 10800 by 13344 patches, 540 by 667 km. `WORLD_FINE_H`,
  `WORLD_H_M`, the region lattice height and every test that assumed
  7800 rows change. `latitudeAt(y)` is main's and runs 67 N to 61 N.
- **The world is not a pure function of position any more.** It is
  solved once (about 5 s in a worker, cached in IndexedDB by seed and
  `GENERATOR_VERSION`) and the arrays live on `world.solved`. The
  branch's "fresh world under two seconds" invariant now means "from
  solved arrays in hand to a started run", and the branch's "no
  whole-world array" becomes "no whole-world *fine* array": the seven
  300 m arrays, 44 MB, are the named exception. Do not chase the solve
  down to two seconds; hydrology chose the bar and the progress bar.

## 1. The solved arrays, and which parts of the solve to reuse

`SolvedWorld` (`src/world/solve.ts`) per 300 m cell: `height` Int16
metres (a lake cell carries its surface, a sea cell its floor),
`flowDir` 0..7 toward the receiver or `NO_FLOW`, `discharge` m3/s,
`kind` (land, sea, lake, river: `KIND` in `classify.ts`), `flags`
(`FLAG_STREAM`, `FLAG_FORD`), `terrain`, `moisture` 0..255 for the
glyph forms.

The solve's own building blocks are exported and are what the fine
refinement runs, on a chunk instead of the world. Reuse them; do not
write a second flood:

| From | Function | Use in the chunk |
|---|---|---|
| `hydro.ts` | `priorityFlood(height, w, h, isSource)` | fill the chunk's fine surface toward its outlets |
| `hydro.ts` | `flowDirections(filled, w, h, isSink)` | steepest descent on the filled fine surface |
| `hydro.ts` | `accumulate(dir, w, h, weight)` | fine upslope area for the wetness index and to trace channels |
| `hydro.ts` | `lakeComponents(height, filled, w, h, isSea, minDepthM)` | the chunk's depressions and their rims, for the rivers spec's pools |
| `classify.ts` | `coastKmOfCell`, `runoffWeights`, the class rules of hydrology spec section 3 | the fine classifier's inputs |
| `terrain.ts` | `latitudeAt` | treeline per row |
| `solve.ts` or `erode.ts` | the bicubic upsample plus slope-scaled noise used from 1.2 km to 300 m | the same step from 300 m to 50 m; extract it into a shared helper rather than copying |

The determinism rule of the solve applies to the fine generator: only
addition, subtraction, multiplication, division, comparison and square
root, and the integer-hash noise. `fine-terrain.ts` uses `Math.exp`
today; the banned-function test that greps the solve extends to it.
The save sync's one-seed-one-world rule depends on this.

## 2. The new fine chunk

A chunk stays 96 by 96 patches, which is 16 by 16 parent cells, aligned
to parents. Build it from a 20 by 20 window of parents (a two-cell
apron) so interpolation and the flood have context past the edge.
Everything below is per chunk, pure in the seed and the solved arrays,
independent of the order chunks are built in.

**a. Fine height.** Bicubic interpolation of the parent heights, plus
one noise octave whose amplitude scales with the local coarse slope,
exactly as the solve does one rung up. Then shift each parent's 36
children so their mean equals the parent height to within half a
metre: the coarse height is the truth and the fine surface is a
refinement of it. Control points at water: a sea parent contributes 0,
a lake parent its surface, so the interpolated surface crosses the
water level between a shore parent and the water parent, and the shore
gets its shape from the heights rather than from a coast field.

**b. Water kind, top-down.** A patch is sea when its fine height is at
or below 0 and it is 8-connected through such patches to a sea parent;
lake when at or below the surface of an adjacent lake parent and
connected to it. A patch below sea or lake level that connects to
neither is land or a pond (step c). Coarse kind is not copied down: a
lake parent may have land children on its rim and a shore parent may
have water children. That is the point.

**c. The chunk-local flood.** `priorityFlood` over the chunk's fine
surface with the outlets as sources: the chunk boundary, sea patches,
lake patches. Per patch store the filled height, the depression id from
`lakeComponents` at a fill depth of 0.3 m or more (a pit of 30 cm is a
pool the rivers spec can leave water in; below that it is ground), and
the depression's rim height. A depression of 2 m or more is a pond: a
water patch with its own surface, which the solve could not see at
300 m.

**d. Channels.** Process the chunk's river and stream parents in the
solve's flow order. For each, the entry is the patch on the shared edge
with the upstream parent nearest where that parent's channel exits (a
parent outside the chunk enters at the midpoint of the shared edge);
the exit side is the edge toward `flowDir`'s receiver. Run
`flowDirections` on the filled fine surface with the exit side's
patches as sinks and trace from the entry: the path is the channel, one
patch wide, and it exits where the descent leaves the cell. Two
upstream parents give two entries and two paths that join. Mark channel
patches with the parent's `kind` (river) or stream flag, and reference
the parent's discharge. The parent's ford flag stays on the parent for
now; the rivers spec replaces it with hydraulics later and this branch
does not model depth.

**e. Terrain, bottom-up.** The classifier is hydrology spec section 3
applied per patch with fine inputs: slope from the fine height to the
fine receiver; upslope area from the fine `accumulate` plus the parent's
area at each entry; the wetness index from those; the precipitation
index and `coastKm` from `classify.ts` at the parent; the treeline from
`latitudeAt` and `coastKm`; the thin-soil noise at 2 km sampled at the
patch so rock falls where the solve put it; plus the branch's
`fineNoise` for the sub-cell break-up the way its neighbour-aware rule
does now. Water first (b, c, d), then fell, rock, bog, moisture,
spruce, birch, pine, meadow in the spec's order. The branch's `coast`,
`fjord`, `ridge`, `elevation`, `lake`, `moisture`, `exposure` and
`drainage` fields are deleted; the two that consumers still want,
exposure and drainage, are derived in section 3.

**f. Summaries.** The parent summary is computed bottom-up from the 36
children as the branch does, and the dominant child terrain is what
mechanics read when a chunk is resident. `solved.terrain` stays as the
presentation for unknown ground and the wide rungs, and as the
fallback when no chunk is resident. Measure the agreement of the two
on three seeds (section 6); where they disagree the fine rule wins for
mechanics, and a low agreement means a wrong fine input, never a wrong
solve.

**Cost.** Interpolation is a few multiplies per patch and the noise one
octave; the flood and the accumulation over 9216 patches are a few
milliseconds. Target under 50 ms per chunk cold, against the 1.3 s the
field generator measured on 2026-09-11. The branch's fine-world
performance test (96d9aeec) is where the number lives.

## 3. Consumers to repoint

Every reader of `fieldsAtPatch` or `fieldsAtMetric`, from a grep on the
branch today:

| Reader | Today | Becomes |
|---|---|---|
| `src/world/route.ts:77` | `elevationM` from the field | the fine height from the chunk; edge cost from physical distance, terrain speed and fine elevation gain as the branch's section 8 says |
| `src/sim/climate.ts:199,244` | `elevationM / 1000`, field moisture | `heightAt / 1000` at the parent, as main has it; `solved.moisture` for the terrain modifier. Climate stays at 300 m; nothing in it needs 50 m |
| `src/sim/sight.ts:242` | `elevationM` | the fine height, with main's prominence cap and metre march kept |
| `src/sim/weather.ts:147` | `exposure` for snow scour, `drainage` for ponding | exposure derived from fine slope, aspect against the wind, and height above the treeline; drainage from the fine wetness index. Both are functions of the chunk's arrays, not fields |
| `src/world/terrain.ts:29` | the `e`, `m`, `sea`, `coast` shim | deleted; callers read the chunk |
| `src/world/aggregate.ts:107` | `elevationAt` from the field | the fine height |
| `src/ui/map.ts:26` | field for the tone | the fine height at the close rungs; `heightAt` at the rest, as main cuts tone |

And the reads that have no field but change meaning:

- **Regions.** The branch's metric lattice `regionAtPatch` wins over
  main's `regionOfCell`; region statistics in fine units as the branch
  already computes them. `campCell` is the water-beside patch nearest
  the centroid, streams included, per hydrology's section 4.
- **The start.** Main's `findStart` (a sheltered sea shore in the
  southern rows, `world.startCell`) wins; convert the cell to a patch
  on its shore side.
- **Routing across water.** A river parent's channel patches are speed
  0 unless the parent carries the ford flag (then bog's speed on the
  channel) or the region's ice allows; the bank patches of a river
  parent are ordinary ground, which is the whole win of this rewrite.
  Portal routing must never invent a crossing: a portal between two
  parents exists only if a fine path exists. Lake and sea patches
  follow main's ice rules per region. `frontierRoute` on main lacks
  the ford argument; give it one.
- **Water beside.** `watersideCell` and `isShore` count a stream
  channel patch and a river channel patch as water beside, at the
  patch; seeps refuse a stream patch as main does at the cell.
- **Ice.** Per region, unchanged.
- **Knowledge.** The branch's per-chunk bit fields; a river seen is a
  river known at the parent, the same as main.
- **Save and cache.** `GENERATOR_VERSION` bumps when the fine
  refinement changes what the world is, because the cache key and the
  sync's handshake carry it; the IndexedDB cache stores the solved
  arrays only, never a fine chunk. The save version bumps for the
  fine-keyed state as the branch already planned.

## 4. What not to do

- Do not re-solve at 50 m or touch the solve's stages. 84 million
  patches is 840 MB and minutes per flood pass, for no more realism:
  the physics is at 1.2 km and everything under it is interpolation
  plus noise on both branches.
- Do not keep a coast or lake noise field beside the solved kind "for
  detail". Shore detail comes from the fine heights.
- Do not copy the parent's terrain to its children. The classifier
  runs per patch; agreement is measured, not forced.
- Do not keep two chunk maps on `World`.
- Do not let the tick path build a chunk. The scheduler's fine queries
  hit resident chunks; the work-count gate proves it.
- Do not write a second priority flood. The one in `hydro.ts` takes a
  size.

## 5. Order of work

1. Merge main. Get `tsc` clean and `npm test` to a known-red list that
   names each failing file's reason.
2. The lattice constants for 1800 by 2224 and every test that assumed
   the old height.
3. The new chunk: height (2a), water kind (2b), flood (2c), channels
   (2d). The contract tests of section 6 for these four, red first.
4. The classifier (2e) and the agreement measurement (2f).
5. Consumers (section 3), one reader at a time, each with its test.
6. Re-bake the fixtures and goldens on the merged world; re-site the
   slow suite's regions by rule the way hydrology's follow-up did.
7. The performance gates, the authentic after images, the browser
   pass. Then the branch's own delivery boundary (its spec section
   18) applies as written.

## 6. Tests this branch must add

These are the rivers spec's gate. The spec does not start until they
pass on main.

- **Children average to the parent.** For every land parent in a chunk,
  the mean of the 36 fine heights is within 0.5 m of `solved.height`.
- **Water runs downhill.** Along every channel from entry to exit, the
  filled fine height is non-increasing.
- **Discharge is conserved.** Every river and stream parent has exactly
  one channel path from an entry to the exit side, entries match the
  upstream parents' exits, and the path carries the parent's discharge.
- **Shores are real.** Every water patch of a lake parent is at or
  below the lake's surface and connected to it; a water patch in a land
  parent is a pond of 2 m or more, never a single isolated patch.
- **Determinism.** Two builds of a chunk are byte-identical; a chunk
  built before and after its neighbours is identical; the
  banned-function grep covers `fine-terrain.ts`.
- **Agreement.** The dominant child terrain matches `solved.terrain` on
  more than 90 percent of land parents across three seeds; the number
  is printed, and the disagreeing classes are named.
- **Performance.** A chunk cold under 50 ms; the closest view from
  cached chunks under 16 ms; all fine caches under 20 MB; a 20-day
  headless life builds zero chunks from the scheduler, by work count.
- **The river at 50 m.** On the terrain report's test reach (seed 42,
  the reach at cell 715, 2160), the closest rung shows a channel one
  patch wide with bank patches on both sides, and a route from one bank
  to the other crosses on a ford parent's channel and nowhere else.

Then the browser pass, and what would look wrong: a lake with a
straight 300 m edge, a river that is a 300 m block, a shore that does
not follow the slope, forest that changes class at every parent
boundary, a chunk that looks different after a reload.
