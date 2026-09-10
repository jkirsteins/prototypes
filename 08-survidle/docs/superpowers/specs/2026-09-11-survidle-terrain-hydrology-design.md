# Survidle terrain and hydrology

Date: 2026-09-11. Status: approved in conversation, awaiting written review.

## Purpose

Replace the terrain generator with one that produces a real landscape:
heights in metres above a sea at zero, valleys shaped by erosion, lakes
that are filled depressions with outlets, rivers and streams from
drainage, fjords as drowned valleys, stone where geology puts it, and a
treeline that falls with latitude. The world spans 61 N to 67 N at real
scale so the lineage's march north is walked on real ground.

The ruling that governs every choice here: terrain is judged by realism
first. Gameplay consequences are downstream. A valley with water and no
stone is geography, not a defect. The generator does not distribute
resources because crafting needs them, and the start finder does not
distort the world to guarantee a convenient start.

## Why now

An audit of the current generator (`src/world/terrain.ts`) on 2026-09-11
measured, on seeds 42, 1, 7, 3 and 79:

- The elevation field has no sea-level datum. The lowest land reads 372 m
  at 1200 m per unit, and two consumers (`src/sim/sight.ts`,
  `src/sim/climate.ts`) read it as metres above the sea. The lapse rate
  cools every land cell by 2.4 C or more, the sea shore is a 400 m step
  for the weather, and open sea carries heights of 260 to 760 m in the
  line-of-sight model.
- Stone exists only in a collar around the one ridge. Under 1 percent of
  regions hold both water and stone, and 83 percent of land is more than
  2 km from any stone. The start finder demands both, so every start sits
  at 700 to 940 m on the ridge shoulder.
- There are no rivers. The p90 distance from land to water is 21 km.
- The coast is a blurred diagonal with no fjords, a freshwater fringe of
  lake cells hugs the sea shore, terrain classes are altitude bands, and
  the east and south edges are 100 percent land cut to sea.

## Decisions taken in conversation

| Question | Decision |
|---|---|
| Moving north | Latitude is a function of the row. The lineage moves north because the player moves camp north. Heir landings are unchanged: 3 to 20 km from the last camp, on a shore. |
| World height | Real length: 61 N to 67 N over 667 km. |
| Drainage | Real drainage, solved at full resolution, behind a progress bar. |
| Generator | Coarse erosion loop, then full-resolution hydrology (approach B). |
| Rivers | Two tiers by discharge: a stream is a property of a land cell; a river is its own terrain, crossed on ice or at a ford. |
| Regions | Lattice regions stay. They are where orders and stocks live. |
| Start | A sheltered sea shore in the southern rows, found by realistic criteria. No requirement for stone or a lake. |

## 1. The world's shape and datum

| Quantity | Value |
|---|---|
| Cells | 1800 wide by 2224 tall, 300 m each |
| Extent | 540 km by 667 km, about 4.0 million cells |
| Latitude | `latitudeAt(y) = 67 - 6 * y / 2224`, 111 km per degree; row 0 is the north edge |
| Height | Int16 metres above sea level per cell; sea is at or below 0 |

The world is an axis-aligned window on the Scandinavian peninsula. The
real coast trends about 20 degrees east of north inside such a window, so
the template runs the Atlantic coast from about 40 km east of the west
edge at the bottom row to about 280 km at the top row.

**Macro template**, evaluated in metres from the seed and the position in
km, before erosion:

- **Shelf and skerries.** Sea floor from -200 m at the west edge rising
  to -20 m at the coast line, with island noise so drowned hills break
  the surface within 20 km of the coast.
- **The Scandes crest** runs parallel to the coast, 110 km inland. Crest
  height is `1800 - 50 * (lat - 61)` m, so about 1800 m at 61 N and
  1500 m at 67 N. The western flank drops to the coast over 110 km; the
  eastern flank drops to a plateau of 600 m over 60 km.
- **The eastern slope** falls from the 600 m plateau to 150 m at the
  east edge. The Gulf of Bothnia enters only where the real shore reaches
  the window: a sea bay in the east edge between about 63 N and 65.5 N.
- **Noise** at three scales on top of the template: about 300 m
  amplitude at a 40 km wavelength, 100 m at 10 km, 30 m at 2.5 km.

**Treeline**, birch line in metres, from latitude and distance to the
western sea in km:

    treelineM(lat, coastKm) = 1100 - 75 * (lat - 61) - 350 * max(0, 1 - coastKm / 50)

About 1100 m at 61 N inland, 650 m at 67 N inland, and 300 to 400 m
lower on the outer coast. Fell is ground above it, so fell area grows
northward on its own.

Two consequences. `latitudeAt(y)` is exported for the roadmap's
latitude-by-row item to consume; only the generator reads it in this
change. Extending the world south to 56 N later is a height change and a
longer template, not a new generator.

## 2. The solve

One pure function, `solveWorld(seed, w, h, onProgress)`, from seed and
size to typed arrays. A Web Worker (`src/world/solve.worker.ts`) is a
thin shell that runs it and posts progress by stage; tests call the
function directly. Six stages:

1. **Coarse surface.** The template plus the two largest noise octaves,
   sampled on a 1.2 km grid (450 by 556, about 250k cells).
2. **Erosion loop on the coarse grid.** Stream-power erosion with
   uplift and hillslope diffusion, implicit in the receiver order (Braun
   and Willett), which is stable at any step. Each iteration: fill pits
   with priority-flood, route flow to the steepest neighbour, accumulate
   area, then update height:

       h = (h + dt * U + dt * K * sqrt(A) / dx * h_receiver) / (1 + dt * K * sqrt(A) / dx)

   with uplift `U` shaped like the template's crest so the crest is
   held up while the valleys cut, and diffusion applied as a five-point
   smoothing of the height change. About 30 iterations. Budget 10 s.
   Sea cells are fixed at their template height and are never eroded.
3. **Upsample to 300 m.** Bicubic interpolation of the eroded coarse
   surface, plus the two finest noise octaves with amplitude scaled by
   the local coarse slope, so fells are rough and lake plains are not.
4. **Full-resolution hydrology.**
   - Priority-flood (Barnes) from the sea and the edges fills every
     depression. A cell filled above its own height by 2 m or more
     anywhere in its depression is lake; the fill height is the lake's
     surface. A depression nowhere filled by 2 m is ground.
   - Flow direction to the steepest of the eight neighbours on the
     filled surface; flat fill surfaces drain toward the outlet.
   - Accumulation in topological order: upslope cell count per cell.
   - Discharge in cubic metres a second:
     `Q = A_km2 * runoff(coastKm) / 1000`, with
     `runoff(coastKm) = 12 + 38 / (1 + coastKm / 80)` litres a second
     per km2, about 50 on the Atlantic side and 12 far inland, from
     real runoff maps.
   Budget 8 s.
5. **Glacial carving and the coast re-read.** For cells that drain to
   the western sea and lie within 150 km of it, valley floors along the
   drainage lines are lowered by a trough of depth
   `min(700, 40 * sqrt(A_km2))` m and half-width `1.5 * sqrt(A_km2)`
   km with a parabolic cross profile. Within 40 km of the coast an extra
   `300 * (1 - coastKm / 40)` m is taken off the floor so the trough
   drowns. Then sea is re-read: a cell at or below 0 that is
   4-connected to the ocean edge is sea; a cell at or below 0 that is
   not connected stays land or lake. Stage 4 is re-run on the carved
   surface so the drainage, lakes and discharge agree with the final
   ground.
6. **Classification and output.** Every cell gets its terrain (section
   3) and the arrays below are handed to the main thread as transferred
   buffers.

| Array | Type | Meaning |
|---|---|---|
| height | Int16 | metres above sea level; lake cells carry the lake surface, sea cells their floor |
| flowDir | Uint8 | 0 to 7 for the receiver, 255 for sea |
| discharge | Float32 | cubic metres a second |
| kind | Uint8 | 0 land, 1 sea, 2 lake, 3 river |
| flags | Uint8 | bit 0 stream, bit 1 ford |
| terrain | Uint8 | index into `TERRAINS` |

About 44 MB for 4 million cells, held for the world's life.

**Two rules for the code.**

- Determinism across engines: the solve uses only addition,
  subtraction, multiplication, division, comparison and square root, all
  correctly rounded under IEEE 754. No `Math.exp`, `Math.pow`,
  `Math.sin` or any other function whose last bit can differ between
  engines. The noise stays the existing integer-hash value noise. A test
  greps the solve for the banned functions.
- Nothing about the world is stored in the save. The world regenerates
  from the seed on load. A cache keyed by seed and generator version is
  the escape hatch if the load bar becomes a complaint, and is not built
  now.

**Budget.** Under 20 s for the whole solve on the dev machine, measured
in the slow suite. Measured on the current 2.34 million cells for
scale: the elevation field costs 1.4 s and a priority-flood pass 2.8 s.
The plan's first task is a timing spike of stages 1 to 5 on the full
size, so the budget is known before the classification is written. The
erosion grid stays at 1.2 km because that is where the tributary network
comes from; the iteration count is the knob if the spike runs over.

**Progress bar.** The worker posts `{ stage, fraction }` per stage. The
UI shows a bar with the stage name on new world and on load: raising the
land, wearing the valleys, filling the lakes, cutting the fjords, naming
the ground. The run does not start until the world exists.

## 3. What a cell is

Terrain is a lookup over the solved fields, decided once in stage 6.
Water first, in this order, then land.

| Class | Rule |
|---|---|
| sea | height at or below 0 and 4-connected to the ocean edge |
| lake | a filled depression with a fill depth of 2 m or more somewhere in it; the surface is the fill height |
| river | land with discharge above 40 cubic metres a second, about 50 m wide at bankfull; its own terrain, impassable except on ice or at a ford |
| ford | a river cell whose gradient to its receiver is above 0.5 percent, a riffle; passable at bog's walking cost |
| stream | a land cell with discharge above 0.05 cubic metres a second, a year-round brook; a flag on the cell, not a terrain, and it counts as water beside for drinking, seeps and camp siting |

At inland runoff a stream needs about 4 km2 of catchment and a river
about 3300 km2; on the Atlantic side about 1 km2 and 800 km2. Rivers are
the main valley rivers only, the Namsen and the Ume of the world, and a
river cell continues downstream to a lake or the sea without a gap.

Land classes keep today's names, so the tables, species habitats, orders
and spots stay valid. The rules change. Inputs per cell: height, slope
`s` (rise over run to the receiver), latitude, `coastKm` (distance to
the western sea), upslope area `a` in cells, a wetness index
`W = a / (a + 200 * s)` with `s` floored at 0.001, a precipitation index
`p = (runoff - 12) / 38` in 0..1, and a thin-soil noise `n` in 0..1 with
two octaves at 2 km.

- **fell**: height above `treelineM(lat, coastKm)`.
- **rock**: exposure at real rates rather than a collar around fells.
  A land cell below the treeline is rock when `n` is under the rate for
  its band: 0.30 within 1 km of the sea, 0.25 where `s` exceeds 0.36
  (20 degrees), 0.35 in the 100 m under the treeline, 0.04 elsewhere.
  The highest applicable rate wins. Stone is therefore on every shore
  and in every steep valley at the frequency geology gives it.
- **bog**: `s` under 0.02, `W` above 0.6, `p` above 0.3, not lake. The
  share rises northward on its own because the plateau flattens.
- **moisture** `m = 0.5 * p + 0.4 * W + 0.1 * northFacing`, where
  `northFacing` is 1 for a receiver to the north, 0 to the south, 0.5
  otherwise. Moisture is no longer a separate noise.
- **spruce**: `m` above 0.55, and only where spruce grows: `coastKm`
  above 30 and latitude under 66.
- **birch**: the 150 m under the treeline everywhere, and the outer
  coast within 10 km of the sea, and moist ground where spruce is not
  allowed.
- **pine**: the remaining forest ground.
- **meadow**: open heath in the 60 m under the treeline that is not
  rock, and on the outer coast within 3 km of the sea where `n` is under
  0.5 and the cell is not rock or birch by the rules above. Same name,
  same walking speed.

`TERRAINS` gains `river`. `TERRAIN_SPEED.river` is 0; a ford cell is
still terrain `river` and `speedOf` returns bog's speed for it when the
ford flag is set. Ice on a river follows the lake ice rule for now.

## 4. Consumers

Every reader of the old 0..1 field moves to metres or to a named
property. `fieldsAt` is removed. The new readers on the world are
`heightAt`, `dischargeAt`, `streamAt`, `fordAt`, `waterKindOf`
(now sea, lake or river) and `latitudeAt`.

- **Sight** (`src/sim/sight.ts`). Ground height is `heightAt` in
  metres; a sea cell is 0, a lake its surface, a river cell its bank
  with no canopy. `FELL_SPINE_M` goes. The horizon range cap is
  computed from prominence, not altitude: the vantage's height above the
  lowest ground within 20 km, so a flat plateau at 300 m reads as flat
  and a fell above a fjord reads as the vantage it is. The march itself
  keeps its curvature and blocking rules.
- **Climate** (`src/sim/climate.ts`). `elevationKm` is `heightAt / 1000`
  floored at 0. The seasonal curve keeps its 62 N calibration until the
  latitude-by-row item. Gate readings will move because the lowland stops
  being cooled; they are reported, not tuned.
- **Lee** (`src/sim/shelter.ts`). Unchanged rule on `heightAt`; erosion
  removes the cell-scale speckle so it reads real hollows.
- **Water access**. `watersideCell` and `isShore` count a stream cell
  and a river neighbour as water beside. Seeps: a stream cell is a shore
  and refuses a seep as today. Fishing spots need lake, sea or river; a
  brook is drinking only.
- **Routing** (`src/world/route.ts`). River speed 0, ford as bog, ice
  on a river as on a lake. `avoidFell` unchanged.
- **Map** (`src/ui/map.ts`, `src/ui/ground.ts`,
  `src/ui/cellpresentation.ts`). Tone cuts from `heightAt`. A river
  glyph at every zoom in the water colour; a stream mark on the cell at
  the two close rungs; a ford mark on river cells at the close rungs.
- **Regions** (`src/world/gen.ts`). Lattice unchanged. `campCell` is
  the water-beside cell nearest the centroid, streams included. Habitat
  shares gain `river` with no species rows, so nothing lives in rivers
  until the species table gets salmon and grayling; `frac.water` counts
  sea, lake and river.
- **Soundscape**. River and stream cells within earshot add running
  water to the bed when a recording exists; otherwise nothing changes.
- **Heirs** (`src/sim/landing.ts`). Unchanged.

**The start.** The first survivor arrives by boat in April, so the
landing is a sheltered sea shore in the southern rows. `findStart`
keeps its spiral but changes anchor and test:

- Anchor: the coast line at 92 percent of the world's height, that is
  about 55 km north of the south edge.
- A candidate is a land cell beside sea, in the bottom 15 percent of
  rows, sheltered: of sixteen 5 km rays from the adjoining sea cell, at
  least ten meet land. Forest is at least 40 percent of the cells within
  3 km, and a land route from the shore into that forest exists.
- The first camp is that shore cell. The start region is its region.
- No requirement for stone, a lake or an outcrop. Some starts have no
  stone within a day's walk, and the run is about finding it.

**Edges.** North at 67 N is the wall the roadmap names. South and east
are cut ground and read as beyond the mapped world, as today. The
freshwater fringe on the sea shore cannot occur: sea is by connection,
not by a second field.

## 5. Data, files and what breaks

- `src/world/terrain.ts`: world size, `latitudeAt`, `treelineM`, the
  macro template, the lattice constants and `regionOfCell` as today.
- `src/world/solve.ts`: `solveWorld` and the six stages, each its own
  exported function so the report and the tests can run one stage.
- `src/world/solve.worker.ts`: the worker shell.
- `src/world/cells.ts`: `terrainOf` reads the terrain array; chunks
  keep only the region cache. The new readers live here.
- `src/world/gen.ts`: regions, spots, the new start.
- `src/ui/loading.ts`: the progress bar panel.
- **World object.** `World` carries the solved arrays. `newWorld` is
  asynchronous on the main thread (worker) and `solveWorld` is
  synchronous in tests; one function behind both.
- **Save format.** Version 10. A save holds the seed only, as today.
  Saves under version 10 are refused with a message that names the
  reason, never loaded into the wrong world. The beacon cohort is told
  before this ships.
- **Goldens.** Every golden replay, the sight fixtures, start-region
  names in tests and the map screenshots are re-baked, per the golden
  replay gate. This is the plan's largest item after the solve.
- **Scripts.** `scripts/mapstats.ts` prints the new fields: water kinds,
  stream density, exposed rock share and a height histogram.
- **Memory.** About 44 MB of typed arrays per world, one world per tab.

## 6. Testing and measurement

**Fast suite** (`npm test`), on a small solved world of about 120 by
160 cells so it runs well under a second:

- Determinism: the same seed gives the same hash of every array, twice
  in one process. A test greps `solve.ts` for the banned functions.
- Hydrology invariants: every land cell's flow reaches the sea or the
  edge; every lake has an outlet at its surface; discharge never falls
  from a cell to its receiver; every river cell continues downstream to
  a lake or the sea; every sea cell is connected to the ocean edge.
- Class rules: fell only above the treeline for its row and coast
  distance; no spruce within 30 km of the Atlantic or above 66 N; bog
  only under 2 percent slope; ford only above 0.5 percent.
- Start rule: a sea shore in the bottom rows, sheltered, forest within
  3 km, a route into it.
- Consumers: sight reads sea as 0 and a lake as its surface; the
  prominence cap; the climate lapse from metres; a stream counts as
  water beside; a ford is passable and a river is not.

**Report** (`npm run terrain`, about a minute, three seeds, full size),
printing each measure beside its real target:

| Measure | Real target |
|---|---|
| Median distance from land to running or standing water | under 600 m; p90 under 2 km |
| Lake share of land | 5 to 10 percent |
| Largest catchments | 5,000 to 30,000 km2 |
| West coast length over its straight length | above 5 |
| Exposed rock by band | coast 30, steep 25, lowland 3 to 5 percent |
| Bog share by latitude band | rising from about 10 to over 20 percent |
| Valley bearings in the mountain belt | histogram; expected transverse to the crest |
| Mean slope per land class; class shares per 100 m band per degree | printed, no target |
| Solve time | under 20 s |

**Existing gates.** April, year, winter and heir gates re-run on the
new world and their readings go in the report as findings, not targets.

**Browser pass** before done: the bar on new world and on load; rivers
on the map at every zoom; a view across a fjord from a shore; a walk
that fords a river and a route that refuses a river without a ford.

## Out of scope, named so nobody assumes them

- Daylight, the seasonal temperature curve and species ranges reading
  latitude from the row. That is the roadmap's latitude-by-row item.
- Regions shaped by watersheds.
- River species and river fishing rows.
- River ice thinner and later than lake ice.
- The extension south to 56 N.
- A cache of the solved world.

## Risks

- **The budget is unmeasured at full size.** The timing spike is the
  first task; the iteration count is the knob, the 1.2 km grid is not.
- **Lake share may run high** on an upsampled noisy surface. The 2 m
  fill-depth rule is the first defence; the report's lake share is the
  check.
- **Float determinism** across engines rests on the banned-function
  rule and on the noise hash; a golden across two browsers is the proof.
- **Memory on phones.** 44 MB of arrays plus the map. Measured in the
  browser pass on a phone-width tab.
