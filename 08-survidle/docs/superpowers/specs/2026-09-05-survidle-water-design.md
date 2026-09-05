# Survidle: water - the landing camp, fetching, and the seep

Three things about water, taken together because each one is half an
answer without the others: the first survivor's camp is the shore they
land on; fetching water is one plain trip with one vessel; and a seep,
dug on wet ground, is the water source for a camp with no shore. Springs,
boiling and multi-vessel trips are not in this work.

What the code does today, surveyed at main 66a9dce. `RegionDef.campCell` is the
passable cell nearest the region centroid (`src/world/gen.ts`), and every
other spot is placed at a target walk from it that grows as its terrain
gets rarer: the shore at 0.3 km plus 1 km scaled by how scarce water is,
the same rule as the outcrop. So water is treated like any other resource
spot, and it is the one resource a real survivor sites the camp by.
Measured over the start regions of seeds 1 to 40: the nearest cell beside
water is over 1 km from the camp, or absent, on 28 of them; three (seeds
24, 35, 36) have no open water in the region at all, because
`looksLikeStart` samples a 3x3 lattice box around the region and not the
region itself. The heir already lands on a shore cell 3 to 20 km from the
old camp (`landingCell` in `src/sim/landing.ts`); only the first survivor
starts at the generated centroid. The player can make camp elsewhere
before the fire pit is dug (`makeCamp`, the siting spec), so the generated
cell is a default, and the default matters for the three players who never
move it: the idle player, the reference player the gates are measured on,
and the heir who walks home.

Water itself is a reserve in litres (`src/sim/water.ts`). `waterSource` is
true on a cell beside water when the shore is not iced over or an ice hole
is open there; `drink` fills the body from a carried vessel, then camp
water under foot, then the source, and a source is endless. `fillVessels`
tops every carried vessel off at a source. Auto-drink calls `drink` at the
1 litre thirsty line. The runner's thirsty step (`thirstyStep` in
`src/sim/body.ts`) drinks in reach, else walks to the nearest waterside
cell, else opens an ice hole, else goes to camp for stored water or to
melt snow. The Do panel's Camp group has a "Fill vessels" row: a plain
click is a once job whose delivery defaults to "leave where it is", so it
walks to the shore, fills, and stops; "bring to camp" is behind "more".
The intent takes one vessel up from the pile only when none is in hand.
Tools are one per kind (`takeUp` in `src/sim/inventory.ts` drops any tool
of the same id), so a trip carries at most a bucket and a skin. The camp
pile's vessels and the trough hold water at camp; it freezes without a
fire and thaws by one. There are no springs, streams, seeps or wells; bog
is a walking cost, roofing turf and an insect load, never water. The world
derives terrain from per-cell moisture and elevation (`fieldsAt` in
`src/world/terrain.ts`): bog is saturated peat, spruce is the damp forest,
pine the dry heath. The weather counts dry days (`dryDays`) for the fire's
tinder rule.

What the year loop changes, in flight as this is written. The year loop
(spec `2026-09-05-survidle-year-loop-design.md` at 33f8aa1, plan
`2026-09-05-survidle-year-loop.md` at 66a9dce, code on
`worktree-year-loop`) lands before this spec's plan is written, and the
plan is written against main as it is then, not against the survey
above. The pieces that meet this spec: its Task 11 rewrites the fill
intent's fallback in `src/sim/intent.ts`, so a fill on an iced shore
with no axe walks home and melts snow into the vessels, and exports
`fireStep` and `campMeltReady` from `src/sim/body.ts` for it; the fetch
trip in section 2 and the thirsty step in section 3 are written on top
of that clause, not beside it. It adds `npm run year` with a year gate
and a winter gate, and the winter gate's stocked December camp dies of
thirst today walking to an iced shore, which is the reading section 6
is for. `RegionState` gains `racks` and `trap.age` with defaults in
`src/sim/save.ts`; `state.seeps` sits beside them. The reference list
gains large game by name; nothing in this spec changes the list.

## Decisions taken by the author's pre-approval

- **The first camp is where you land.** The first survivor lands on a
  shore cell of the start region, chosen the way an heir's landing cell
  is chosen, and that cell is the region's camp. A default camp stays,
  because orders, the pile, the fire, the runner's home, the forecast and
  the heir's walk home all need a camp from minute zero. Passed over:
  no camp until the player makes one, which threads a "no camp yet"
  state through all of those; a siting rule that puts the camp one or
  two cells back from the shore, which at 300 m a cell is already the
  far end of real practice.
- **A start region with no open water is never chosen.** The filter
  reads the region itself. Passed over: a seep as the answer for a
  waterless start, which would make the fallback the plan.
- **Fetching water is one plain trip with one vessel.** A click brings
  it to camp. The trip takes up the emptiest vessel. More water is more
  clicks or a counted order. Passed over: multi-vessel trips with a
  vessel count and plus and minus buttons on the row, which needs vessels
  to be the one multi-instance tool and a count carried on the order;
  rejected as too much machinery for a bucket.
- **The seep is a real structure, dug on wet ground, one per cell.** A
  seep belongs to the cell it is dug on, like a pile, and a region may
  hold several. Its pool and refill are per ground type, drinking draws
  only what is in the pool, and the UI states the cell's water in litres
  and litres an hour. Passed over: the seep at camp only, which loses the
  "walk to the bog for water" case; one seep per region like the trap,
  which is a rule about a basket and not about the ground; a seep on a
  shore cell, where the shore is right there and the ice hole owns the
  winter.
- **No boiling, no sickness from seep water.** Lake water carries no
  risk today either; the roadmap keeps boiling for item 5. Passed over:
  a sickness chance on seep water now, which would be the only treated
  water in the game.
- **Springs stay out.** They go into the roadmap's item 2 beside rapids.
  Their one real effect, winter water that does not ice over, is a job the
  ice hole and camp storage already own.

## Curve

Horizon rows 4 and 5, beside the trough: the seep is the passive tier of
water the way the basket trap is the passive tier of fishing, a source
that gives while the survivor is elsewhere, and it is the answer to the
idle-loop audit's "thirst first". Survivor row 2: "a camp with water".
Tier: none, the seep is a first-week job. Expected: a camp on a bog or in
damp forest with a seep holds a survivor without a walk to the shore; a
shore camp is unchanged and stays the better camp. The landing camp is
expected to move the April gate: "water before rest" and walking are the
over-band numbers today, and the reference player's water walk shrinks
from 25 to 55 minutes each way to none.

## 1. The first camp

`generateWorld` keeps the start search. Once the start region is built,
its `campCell` is the landing cell: a shore cell of that region chosen by
the same rule as `landingCell`, restricted to the region's own cells,
seeded from the world seed so a seed always lands the same way, and
falling back to the shore cell nearest the centroid. The centroid stays
as `cx, cy` for the wildlife capacity and the region name. `placeSpots`
runs from the new camp as it does today, so the forest, outcrop and heath
keep their scaled walks. The shore spot stays, and its rule changes: it is
the shore cell nearest the camp by route other than the camp cell itself,
usually a neighbour, a minute's walk. It stays because `kitTrap` in
`src/sim/reference.ts` sets the trap through it, the horizon's producer
stages and the year probe kit through `kitTrap`, and seven test files
place the survivor with `placeAtSpot(state, world, "shore")`; a dropped
spot would lose the trap in all of them without an error. Passed over:
dropping the spot and teaching `kitTrap` to read the camp cell, which
moves the exposure into every test instead of out of it.

`looksLikeStart` gains a second pass: a lattice cell the box test accepts
is built as a region and rejected when no cell of it is a shore. The box
test stays as the cheap first filter.

`newGame` places the survivor at `start.campCell` as today, which is now
the shore. The landing screen's wording does not change. Heirs are
unchanged: they land near the old camp and walk home to it.

## 2. Fetch water

The Camp group's `fill` row is labelled "Fetch water". Its small print is
the litres the trip adds, the vessel it takes, and the walk: "2 l, the
bark bucket, 6 min there". A plain click gives a once job with delivery
to camp; `rowRequest` sets `deliver: "camp"` for `fill` whatever the
default choice, and the row's "leave where it is" toggle still works from
the expansion for the player who wants the vessel filled and kept in
hand. The raw "fill vessels" button in the actions row, shown when
standing at a source, is unchanged.

The trip's vessel: when the intent starts, it takes up one vessel from
the pack or the pile, the one with the most room, comparing capacity
minus litres; a partly full vessel is chosen only when it is the only
vessel there. A vessel already in hand counts as one of the candidates,
so a full skin in hand and an empty bucket in the pile takes up the
bucket. At the source every vessel in hand is topped up, as today. At camp
the vessels pour into the pile's vessels and the trough as far as they
have room, as today, and a vessel with nowhere to pour stays in hand,
full; auto-drink reads it. The litres shown are the sum over the vessels
that will be in hand of capacity minus litres, so a half full skin shows
a smaller gain.

The keep order "keep camp at N litres" is unchanged. The counted order
"N times" is N trips.

## 3. The seep

**Ground.** `seepGround(world, cell)` returns the ground class or null:

| class | rule | pool | refill |
|---|---|---|---|
| `bog` | terrain bog | 10 l | 3 l/h |
| `damp` | terrain spruce; or meadow or birch with a bog neighbour | 10 l | 1 l/h |
| null | pine, rock, fell, water; meadow or birch with no bog neighbour; any cell with a water neighbour | | |

The pool is the volume of a knee-deep hole half a metre across below the
water table; the refill is its sustained yield in saturated peat and in
damp forest soil. Both live in `src/sim/seep.ts` as a table by class.

**The task.** "Dig a seep" is a Build row, `build` with arg `seep`, in the
Build group. Legal on a cell whose `seepGround` is not null and that has
no seep yet; four hours; needs 4 sticks in reach and a bark bucket in
reach to bail with; trains building; no skill gate. Its ground for the
intent runner is a new spot kind `wet` resolved like the snare's heath:
the nearest cell of the region with a seep ground and no seep, by route
from the runner. `groundOf("build", "seep")` is `wet`. Digging on a cell
that has one refuses with "a seep is here already"; a silted seep is
re-dug through its mend row, not dug again. A region may hold as many
seeps as it has wet cells the player cares to dig; four hours and four
sticks each is the limit.

**State.** `state.seeps: Record<number, Seep>` keyed by cell like the
piles, `Seep = { class: SeepClass; litres: number; ice: number; dug: number }`,
`dug` the world minute it was finished, for the upkeep clock. The save
defaults it to an empty record, beside the year loop's `racks` and
`trap.age` defaults in `src/sim/save.ts`.

**Refill.** Each tick, every seep adds `rate / 60 * dt` litres up to the
pool, unless refilling is stopped. It stops when the ambient is under
`FREEZE_C` and no fed fire is lit within one cell of the seep, in which
case the pool's litres become ice in place (the seep holds `ice` litres
beside `litres`, and the two sum to at most the pool); it thaws back at
`THAW_L_PER_HOUR` when the ambient is above 0 C or such a fire is by. It
also stops after `SEEP_DRY_DAYS = 14` dry days, the water table's low,
not the fire's 3 day tinder count; a wet day resets `dryDays` as today
and the seep refills from the next tick.

**Drinking and filling draw what is there.** `waterSource` gains a
litres reading: `sourceLitres(state, world, cell)` is `Infinity` at an
open shore or an open ice hole, the seep's liquid litres on its cell,
and 0 elsewhere. `drink` takes `min(want, sourceLitres)` from the source
and subtracts what it took from the seep. `fillVessels` does the same per
vessel, so a 3 litre skin at a 2 litre pool leaves with 2 litres.
Auto-drink is unchanged in form and takes what the pool has.

**The runner.** `thirstyStep` ranks sources by what a walk there would
give: the shore and an open ice hole are endless; each seep counts by its
liquid litres; camp water by the pile's litres. It walks to the nearest
source that would raise the reserve over the thirsty line, ties by walk.
When no source holds that much, the runner walks to the seep with the
most water, or the nearest on a tie, and waits, step "waiting at the
seep", drinking as it fills, until the reserve is over the thirsty line;
the wait is idle time in the ledger, like waiting out a storm. Walking to
an empty seep with a shore in reach never happens.

**Upkeep.** The walls slump. A seep has a life of 60 days from `dug` and
a mend of 1 hour and no materials, "Re-dig the seep", offered on the
seep's own cell, not at camp, since the hole is where it is; `DECAYING`
and `needsMending` are per region and stay as they are, and the seep's
clock lives on the seep. Past two thirds of its life the mend row shows,
past its life the pool stops refilling and the water line says "silted
up" until it is re-dug.

**Map.** Every seep is a mark, "s", class `mk-seep`, drawn at its cell
when nothing else takes the glyph, with a legend entry.

**Capability spine.** `build:seep` gets a row: a producer, connecting
the body's thirst, the runner's thirsty step and the camp tick. It is
added to `PRODUCERS` and the coverage test picks it up.

**Fill on a seep.** The `fill` intent's ground stays `shore`; a Fetch
water order goes to the shore or the ice hole as today, and in a region
with no open shore the row is greyed with "no shore here" while the
runner's thirsty step still drinks at the seep. Filling at a seep is by
hand: stand there and the actions row shows "fill vessels" with the
litres available. Passed over: the runner walking to the seep for a
trough fill, which is a day of waiting for 20 litres.

## 4. The water line

One line in the Here section, always present, for the cell under foot:

- shore, open: "water: shore, endless"
- shore iced, hole open: "water: ice hole, open until morning"
- shore iced, no hole: "water: iced over; an axe opens an ice hole"
- seep here: "water: seep, 6 of 10 l, +3 l/h"; the rate reads "+0 l/h, frozen", "+0 l/h, drought" or "+0 l/h, silted up" when stopped, and "6 l frozen" is appended when ice is in it
- wet ground, no seep: "water: none; a seep is possible here, 10 l, +1 l/h"
- camp cell with stored water: "water: 4 of 24 l at camp", then the shore or seep line when one also applies, joined with "; "
- anything else: "water: none"

The region panel gains a water list: the nearest of each kind from where
the survivor stands, with its walk: "shore 12 min, endless; seep 4 min, 6
of 10 l; camp water 6 l, 8 min". Kinds with none are left out; a region
with none reads "no water in this region". The site report adds "seep
possible" for a cell with a seep ground.

## 5. Tests

- gen: over seeds 1 to 40, every start region's camp is a shore cell;
  every start region has a shore; the spot list has no duplicate cell.
- landing: the first survivor's start cell is a shore; `landingCell`
  for an heir is unchanged on a fixed seed.
- fill: a plain Fetch water order delivers to camp; the trip takes the
  emptiest vessel, a partly full one only when it is alone; the row's
  litres equal capacity minus litres for the vessels in hand; a vessel
  with nowhere to pour stays in hand full.
- seep: `seepGround` on the seven cases of the table; dig refuses on
  dry ground, on a shore, and on a cell that has one; two seeps in one
  region refill on their own; the pool refills at its class rate and
  stops at the cap; a drink takes the pool and no more; a
  fill takes the pool per vessel; it freezes under `FREEZE_C` without a
  fire and thaws by one; 14 dry days stop it and a wet day restarts it;
  the mend row shows at two thirds, on the seep's cell only, and the
  refill stops at its life.
- body: the thirsty step prefers a shore over an empty seep, walks to a
  seep that holds enough, and waits at the fullest seep when none does.
- panels: the water line for each case of section 4; the region water
  list drops empty kinds.
- capabilities: the spine's coverage passes with `build:seep`.
- save: an old save without `seeps` loads with an empty record.

## 6. The re-measure

`npm run reference`, `npm run horizon`, `npm run year` and
`npm run year -- --winter` on the gate seeds, after part 1, with the
numbers in the plan's record. The year loop's readings are the "before":
its spec's section 0 and section 10 as measured when it lands. The
"after" is written beside them under the same headings, not as a second
unrelated set, since every gate number in the roadmap moves when the
first camp is on the shore. The winter gate is the one this camp is
expected to change most: a stocked December camp that dies of thirst on
day 15 walking to an iced shore now has the shore under foot. The
expectation everywhere is a shorter water walk and an easier gate; a
gate that gets harder is a finding, not a number to bend.

## 7. The browser pass

DevTools, seed 17, 1440 wide: the survivor starts on a shore and the
water line reads "shore, endless"; Fetch water brings a bucket home and
the camp reading rises; walk to a bog cell, the line says a seep is
possible with its rate, dig it, the mark shows, the line shows the pool
filling; drink there and the pool drops; a second dig on the same cell
is refused, and one on the next bog cell works and shows its own mark.

## 8. Roadmap edits

- Item 2: springs beside rapids, running water that never freezes, with
  the note that the ice hole owns winter water until they land.
- Item 3: the seep's record, in the item's own built-then-said style.
- Item 5: boiling stays as written; the seep is named as the water it
  would apply to.
- The UI pass notes: the keep order's default litres follow camp capacity
  once a trough stands.
- The idle-loop audit's "thirst first": the seep named as the answer for
  a camp with no shore.

## 9. What this does not do

No springs, no rivers, no boiling, no sickness from any water, no
multi-vessel trips, no vessel count on an order, no removal of the
default camp, no seep on a shore cell, no more than one seep per cell, no
drought model beyond the existing dry-day count.
