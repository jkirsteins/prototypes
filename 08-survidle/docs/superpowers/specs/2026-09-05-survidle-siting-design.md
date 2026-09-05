# Survidle: siting (item 3's first part)

The roadmap's siting, pulled out of item 3 ahead of the tester round:
camp becomes a chosen cell. Walk to a cell and make camp there; the
region says what the cell offers before you commit. Orders belong to the
camp as they do today and the runner walks to the chosen cell. The
generated cell stays the default, so every harness (the reference
player, the horizon, the heirs) is unchanged until a player chooses.

What the code does today, surveyed at main 9d78189: `RegionDef.campCell`
is computed once at world generation (`src/world/gen.ts`) and copied
into `RegionState.campCell` the first time a region is touched
(`src/sim/regionstate.ts`); nearly every reader (the body's needs, the
tasks, the orders, the fire, the epitaph, the heir's landing, the map's
fire and shelter markers) reads the run-time value and would follow a
move. Structures live on `RegionState` per region, not per cell, and
follow for free. Three things do not follow: the camp pile is
`state.piles[cell]`, keyed by cell; `describeWhere` and `spotHere` in
`src/sim/position.ts` read the generation-time camp (the "km from camp"
status line, the "you are at camp" test that gates the Do panel's
instant buttons, and the region overview's "from camp" distances in
`src/ui/panels.ts`); and a running intent snapshots `campCell` at its
start. No task chooses or moves the camp; the map draws a marker at the
camp only when a fire is lit or a shelter stands.

## Decisions taken by the author's pre-approval

- **A task, "make camp here", in the Camp group.** Twenty minutes, no
  skill, no tool. Legal on a passable land cell of the current region
  that is not the camp, while nothing stands at the old camp (no
  structure built, no fire lit, no fuel banked) and the old camp's pile
  is empty. Otherwise the row says why: "the fire pit stands there",
  "the fire is banked there", "N kg lie at the old camp, carry them
  first". Passed over: moving the camp at any time and carrying the pile
  by magic, which teleports stock; and blocking only on structures, which
  strands a day's drops at the old cell.
- **The choice is one decision, not a settled-forever flag.** Nothing
  marks the camp as chosen; a player who made camp and built nothing may
  make camp again elsewhere. Once the fire pit is dug the rule above
  holds the camp for the run. Passed over: a "chosen" flag with its own
  save field, which the structures already imply.
- **The site report is walk minutes from this cell to each spot the
  region has**, plus the terrain under foot and whether the water ices
  over (all open water does, at the ice depth `ICE_SHORE_CM`, so the line
  reads "ices over in winter" whenever a shore is in the list). Wind
  exposure and bear country arrive with items 7 and 4, as the roadmap
  says. The report shows in the region panel's Here section when the
  survivor stands on a cell that is not the camp, and as the make-camp
  row's small print. Passed over: a dry-slope reading, which the terrain
  model does not carry.
- **The stale reads are fixed at their source.** `spotHere` and
  `describeWhere` read the run-time camp for the camp case; the region
  overview's distances are computed live from the run-time camp. Passed
  over: rewriting `RegionDef.spots` on a move, which mutates generated
  world data the worker and the harness rebuild from the seed.
- **A running intent follows the move.** On completion the live intent's
  `campCell` snapshot is set to the new cell, so an order mid-delivery
  brings its load to the new camp. Passed over: cancelling the intent,
  which drops a haul on the ground.
- **The map marks the camp always.** An "x" glyph (`mk-camp`, the
  walk-line spec's own mark) at the camp cell whenever no fire or shelter
  glyph is drawn there, so a player sees where camp is before anything
  stands. Passed over: a marker only after the choice, which hides the
  default camp the first day.
- **No life event.** The log records "You make camp here." and the
  journal reads nothing new; a camp event in the life record would need
  an epitaph template and the survey found the record's event kinds are a
  closed set. Passed over: a new event kind, for the second half of I or
  the rest of F to add when the journal gains its map of found places.

## 1. The task

`TaskId` gains `"makeCamp"`. In `src/sim/tasks.ts` its definition:
label "Make camp here", group "camp", 20 minutes, activity "light", no
tool, no skill, `deckable` as the other camp chores are. Its legality in
`check`: the cell under foot is passable land in the current region and
not `regionState(...).campCell`; `canMoveCamp(state, world)` holds. Its
completion in the task's `complete` branch: `st.campCell = here`; if
`state.intent` exists, `state.intent.campCell = here`; log "You make
camp here."; the day's ledger counts the minutes as work like any task.

`canMoveCamp(state, world): { ok: true } | { ok: false; why: string }`
in `src/sim/camp.ts`: false with the reason when any structure flag on
`st.structures` is true (snares excepted, they stand on the heath),
when `st.fire.lit` or `st.fire.fuelKg > 0` ("the fire is banked there"),
or when the old camp's pile holds anything ("N kg lie at the old camp,
carry them first", the weight from `weight(pile)`).

The request binds the cell the click happened on: `src/main.ts`'s
"intent" handler sets `where: { cell }` for `makeCamp`, and
`resolveCell` in `src/sim/intent.ts` carries its own `makeCamp` case
honouring it, so a queued order walks back to the chosen site and
completes there whatever cell the survivor is standing on when it
starts.

The Do panel's `intentGroups` Camp group lists `makeCamp`; the row is
never an order (it joins `NOT_ORDERS`), so the kind-per-row expansion
does not offer it as a keep, and a row greyed "this is the camp" gets
no "add it anyway": queuing a blocked makeCamp would let the runner
site the camp wherever it next stood, not the cell the click meant.

## 2. The site report

`siteReport(state, world, cell)` in `src/sim/camp.ts` returns
`{ spots: { id: SpotId; minutes: number | null }[] }`: for each spot of
the region except "camp", the walk minutes from `cell` by `findRoute`
and `routeMinutes` at the survivor's base speed in the current weather
(null when no route). No `terrain` field (nothing read it) and no
`ices` field (a region-wide fact that says nothing about the cell,
along with the "ices over in winter" clause it drove). `siteLine(report)`
renders "forest 6, outcrop 33, shore 22, heath 17 min" with the spots
in the region's own order, bare minutes and one "min" for the lot, and
"no way" in place of a null's number.

The region panel (`regionHtml`) shows, under Here when the survivor is
in the region and not on the camp cell: "as a camp: <siteLine>", with
the reason in parentheses when `canMoveCamp` would refuse the move.
The make-camp row's small print is the same line when legal, or the
reason when not.

## 3. The stale reads

- `spotHere(state, world)`: when the survivor's cell equals
  `regionState(...).campCell`, return "camp"; otherwise match the
  region's spots as today, skipping the "camp" entry.
- `describeWhere`: "X km from camp" reads `regionState(...).campCell`.
- `regionHtml`'s overview list for a region you are not in: each spot's
  distance is `kmBetween(world, campCellOf(state, world, id), s.cell)`.
- `whereIs` in tasks.ts (cell to spot id) treats the run-time camp as
  "camp" the same way `spotHere` does; both read one helper,
  `campCellOf(state, world, region)`, added to `src/sim/position.ts`.
  `campCellOf` is non-creating - `state.regions[region]?.campCell ??
  regionAt(world, region).campCell`, never `regionState(...)` - so
  asking after a neighbour's camp (from `whereIs`, `walkTarget`'s
  region case, or the overview above) never persists state for a
  region nobody has touched.

## 4. The map

`mapHtml`: for each visited region, when the camp cell would get no fire
or shelter glyph, draw "x" with class `mk-camp` at it. A CSS rule gives
`.mk-camp` the marker colour the shelter mark uses at lower opacity. The
legend line the UI pass adds under the map on touch lists it as "x camp".

## 5. Tests

`tests/siting.test.ts`:

- `canMoveCamp` on a fresh game is ok; false with the fire-pit reason
  after `structures.firePit = true`; false with the banked-fire reason
  with fuel at the fire; false with the weight reason when the old pile
  holds 3 kg of sticks; ok again when the pile is emptied.
- `makeCamp` is not offered on the camp cell, is offered one cell away
  on land, is not offered on water; completing it moves
  `regionState(...).campCell` to the cell, logs the line, and a live
  intent's `campCell` follows.
- After the move: `spotHere` reads "camp" on the new cell and not on the
  old; `describeWhere` reads 0 km on the new cell; `atCamp` is true
  there; the Do panel's instant buttons (a lit fire's "add firewood")
  gate on the new cell; the heir's landing (`beginAgain`) reads the new
  cell as the old camp.
- The site report on seed 17's start cell lists every spot the region
  has except "camp", with walk minutes above zero for a reachable one and
  "ices over in winter" when a shore is listed; the region panel shows
  "as a camp:" off the camp cell and not on it.
- The map draws `mk-camp` at a fresh camp and not once a fire is lit
  there; after a move the mark is at the new cell.
- The reference player, the horizon stages and `runHeir` are unchanged:
  `runReference(17, 30)` reads the same outcome as before this item (the
  existing tests pin it).

## 6. The browser pass

Chrome at 1440 by 900 and 390 wide on seed 17: the "x" camp mark shows
once the survivor steps off the camp (the survivor's own glyph takes
the cell on the first frame); walking two cells off camp shows "as a
camp: ..." in the region panel and the make-camp row in the Camp group
with the same line; making camp moves the mark, the status line reads
0 km from camp, and "add firewood" appears there once a fire is lit;
digging the fire pit then greys the row with its reason; a reload
keeps the new camp; the forecast re-requests after the move (the
region did not change, so the click is in the forecast's action list).

## 7. What this does not do

- The shelter ladder's rungs and the buildings (the rest of item 3).
- Wind exposure, bear country, the dry slope.
- A life event or a journal line for the choice.
- Orders that target the camp by name change nothing: they read the
  run-time cell already.
