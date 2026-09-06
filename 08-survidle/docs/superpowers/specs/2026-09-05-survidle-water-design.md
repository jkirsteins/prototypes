# Survidle: water - the landing camp, fetching, and the seep

Three things about water, taken together because each one is half an
answer without the others: the first survivor's camp is the shore they
land on; fetching water is one plain trip with one vessel by a method
the order names; and a seep, dug on wet ground, is the water source for a
camp with no shore. It also states a rule the water rows made visible:
an order names one method, and the code does not pick another behind it.
Springs, boiling and multi-vessel trips are not in this work.

What the code does today, surveyed at main ae85e1f, with the year loop landed. `RegionDef.campCell` is the
passable cell nearest the region centroid (`src/world/gen.ts`), and every
other spot is placed at a target walk from it that grows as its terrain
gets rarer: the shore at 0.3 km plus 1 km scaled by how scarce water is,
the same rule as the outcrop. So water is treated like any other resource
spot, and it is the one resource a real survivor sites the camp by.
Measured over the start regions of seeds 1 to 40: the nearest cell beside
water is over 1 km from the camp, or absent, on 28 of them; three (seeds
24, 35, 36) have no open water in the region at all, because the start
search found no lattice cell passing its filter within 40 rings and fell
back to the anchor region (`world.startRing` reads 40 on all three). The heir already lands on a shore cell 3 to 20 km from the
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

What the year loop changed, landed at ae85e1f (spec
`2026-09-05-survidle-year-loop-design.md`, plan
`2026-09-05-survidle-year-loop.md`, readings in the roadmap's F section
under "Measured with the year loop"). Where it meets this spec: the fill
intent in `src/sim/intent.ts` now has a melt fallback, stated once in
`meltInsteadOk` and read by `fetchAllowance` (which takes the calendar
now), `intentOption`, `startIntent` and the running intent's `workStep`:
a fill on an iced shore with no axe for a hole walks home and melts snow
at the fire into the vessels, and the ice hole is judged at the fill's
own cell, not under foot; `campMeltReady` and `fireStep` are exported
from `src/sim/body.ts` for it. Under section 0's rule that fallback
comes out again: the fill row is split by method in section 2, the
reference list makes the winter choice in the open, and the two winter
fill tests in `tests/fill.test.ts` become tests of the list's choice.
This undoes a day-old piece of the year loop on purpose, and the roadmap
says so. `thirstyStep` itself is unchanged in kind: it is the body, not
an order. The
decay ruling now reads in years: a lean-to's roof fails in a year, a
rack lasts two, and "a structure that needs mending twice a summer is a
chore rather than a decision"; the seep's upkeep in section 3 follows
that ruling. `RegionState` gained `racks` and `trap.age` with defaults
in `src/sim/save.ts`; `state.seeps` sits beside them. `npm run year`
exists, with `--winter`, `--fresh`, `--level` and `--start`. The
roadmap's build order now runs: the winter loop (a winter working day, a
log keep in place of the felling grind, hunt grinds above the woodpile
keep), then E hides and clothing, then the tables audit, then I. The
tables audit opens on "winter thirst at a camp holding an axe": seeds
17 and 19 die of thirst on winter days 23 and 34 from the stocked
December camp, whose water is the generated shore 25 to 55 minutes
away. The landing camp of section 1 puts that shore under foot, so this
spec's re-measure is the reading the audit should open on, and section
8 places this work before the winter loop for that reason. What the
landing camp does not touch: the indoor floor's 1.3 water-loss factor
above 20 C, which the roadmap names as the other half of that death.

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
- **An order names one method.** The fill row's ice hole clause and the
  year loop's melt fallback are collapsed choices, and the seep would
  have been a third. They are split into rows, and the choice between
  them is the player's, or the reference list's, in the open. "Hunt
  anything" and "fish anything" stay as the two exceptions, since what
  walks past is not the player's to choose. Passed over: leaving the
  fallbacks and adding the seep as another, which removes decisions from
  play one convenience at a time.
- **The fire rows are split in the same work.** "Light the fire" going
  indoors on its own when a hut stands is the same collapse, and it is
  the only other one on main that is a method rather than a delivery.
  It is a misc task here rather than a roadmap item.
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

## 0. The rule: an order names one method

An order in the Do panel names one way of doing one thing. When that
way is not open, the order waits and its row says why; it does not do
something else instead. The Do panel is the list of methods, and the
choice between methods is the player's. For the reference player, which
stands in for a competent human, the choice lives in the list's wants
and in `wantOpen`, in the open where a test reads it, not inside the
intent runner.

What the rule covers: every order (a job, a counted order, a grind, a
keep), and every raw action started from the Do panel. What it does not
cover: the body's own needs (auto-eat, auto-drink, the thirsty step, the
cold step, going home before dark), which are reflexes and not orders,
and which may choose among sources as a body does; a delivery leg, which
is how the order gets its goods home rather than a second method; and
the two exceptions, "hunt anything" and "fish anything", which draw a
species because what comes past is not chosen.

On main today the collapsed rows are: the fill row (open water, or cut
a hole first with an axe near, or melt snow at camp with no axe near),
and the light row (a pit fire, or indoors under the smoke hole or at the
hearth when one stands). Both are split in this spec. A row may be
collapsed again later only when play shows the split is a chore, and
the roadmap records that decision; the default is the split.

The roadmap carries this as a standing ruling so the next spec follows
it.

## 1. The first camp

`generateWorld` keeps the start search. Once the start region is built,
its `campCell` is the landing cell: the shore cell nearest the centroid,
which a seed fixes as surely as a draw would, and the centroid camp only
in a region with no shore. The centroid stays
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

`findStart`'s fallback changes: when no lattice cell passes the exact
filter, a second spiral takes the nearest region with at least 120 land
cells and a shore, and the anchor is used only if that fails too. The
box sampler stays as the cheap first filter.

`newGame` places the survivor at `start.campCell` as today, which is now
the shore. The landing screen's wording does not change. Heirs are
unchanged: they land near the old camp and walk home to it.

## 2. Fetch water, by method

The Camp group's single `fill` row becomes three rows of the same task,
told apart by an argument the way a hunt is told apart by its species,
so the order carries its method through the list, the save and the
ledger:

| row | arg | legal where | greyed with |
|---|---|---|---|
| Fetch water from the shore | `shore` | a shore cell with open water | "iced over" |
| Cut an ice hole and fetch water | `hole` | a shore cell under ice, an axe in reach | "the shore is open, no hole needed"; "needs an axe" |
| Fetch water from the seep | `seep` | a seep that holds liquid water | "no seep dug"; "the seep is empty"; "the seep is frozen" |

"Melt snow" is the fourth method. It is a task already; it becomes
orderable as a keep, "melt snow, keep camp at N litres", by giving
`melt` a yield of water so `normalizeOrder` keeps it a keep, and its
delivery pours the vessel into the pile at camp as a fill's does. It is
greyed as today: "needs a lit fire", "the fire is too low", "no snow to
melt".

The hole row cuts the hole and fills in the same order: at the shore it
runs `iceHole` when no hole is open there, then `fill`. Its small print
carries the axe wear. The plain `iceHole` row stays for a hole with no
fill after it.

Each row's small print is the litres the trip adds, the vessel it takes,
and the walk: "2 l, the bark bucket, 6 min there". A plain click gives a
once job with delivery to camp; `rowRequest` sets `deliver: "camp"` for
`fill` whatever the default choice, and the row's "leave where it is"
toggle still works from the expansion for the player who wants the
vessel filled and kept in hand. The raw "fill vessels" button in the
actions row, shown when standing at a source, is unchanged and draws
from whatever source is under foot.

The trip's vessel: when the intent starts, it takes up one vessel from
the pack or the pile, the one with the most room, comparing capacity
minus litres; a partly full vessel is chosen only when it is the only
vessel there. A vessel already in hand counts as one of the candidates,
so a full skin in hand and an empty bucket in the pile takes up the
bucket. At the source every vessel in hand is topped up, as today, and
a seep tops up only as far as its pool goes. At camp the vessels pour
into the pile's vessels and the trough as far as they have room, as
today, and a vessel with nowhere to pour stays in hand, full; auto-drink
reads it. The litres shown are the sum over the vessels that will be in
hand of capacity minus litres, so a half full skin shows a smaller gain.

**The fallback comes out.** `meltInsteadOk`, the fill clause of
`fetchAllowance`, and the fill branches of `workStep` that cut a hole or
walk home to melt are removed. A fill order whose method is shut waits
on the reason its row shows, like any other order. `fetchAllowance`
keeps its build clause, which is a delivery.

**The reference list chooses in the open.** `keep("fill", 2)` becomes
`keep("fill", "shore", 2)`; beside it a `keep("fill", "hole", 2)` that
`wantOpen` opens when the home shore is iced and an axe is in reach, and
a `keep("melt", 2)` that it opens when the home shore is iced and no axe
is in reach; the trough's `keep("fill", 20)` splits the same way. The
two winter fill tests become: the shore keep waits with "iced over" on
an iced shore; the hole keep cuts and fills with an axe; the melt keep
fills the vessel at the fire and pours it. The list never digs a seep,
since it camps on the shore.

The keep "keep camp at N litres" is otherwise unchanged. The counted
order "N times" is N trips.

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
no seep yet; four hours; needs 4 sticks and a vessel to bail with; trains
building; no skill gate. The sticks are the order's kit: a dig given at
camp pockets them from the camp pile as a snare job pockets its snares
(`orderKit`, `provisionKit`), so the row judged from camp counts the
camp's sticks, and away from camp only what is in the pack or under
foot. Its place for the intent runner is decided in `resolveCell` the
way the trap's is: the nearest cell of the region with a seep ground and
no seep, by straight line then a route check, ahead of the rule that
sends every other build to camp. No new spot kind: a `wet` spot would
have joined every region's places list, which nothing asked for. Digging on a cell
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
`FREEZE_C` and no fed fire is lit on the seep's own cell (a fire 300 m
off keeps no hole open; a seep dug on the camp cell beside the fire is
the one that stays open, which makes where to dig a winter decision),
in which case the pool's litres become ice in place (the seep holds `ice` litres
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
liquid litres; camp water by the pile's litres; snow at a lit fire is
last, as today, since it burns the woodpile. It walks to the nearest
source that would raise the reserve over the thirsty line, ties by walk.
This ranking is the body's and is allowed under section 0.
When no source holds that much, the runner walks to the seep with the
most water, or the nearest on a tie, and waits, step "waiting at the
seep", drinking as it fills, until the reserve is over the thirsty line;
the wait is idle time in the ledger, like waiting out a storm. Walking to
an empty seep with a shore in reach never happens.

**Upkeep.** The walls slump in the thaw and the hole silts up over a
year. A seep has a life of `SEEP_LIFE_DAYS = 365` from `dug`, in the
roadmap's ruling that lifetimes read in years and a structure mended
twice a summer is a chore, and a mend of 1 hour and no materials,
"Re-dig the seep", offered on the seep's own cell, not at camp, since
the hole is where it is; `DECAYING` and `needsMending` are per region
and stay as they are, and the seep's clock lives on the seep. Past two
thirds of its life the mend row shows, past its life the pool stops
refilling and the water line says "silted up" until it is re-dug.

**Map.** Every seep is a mark, "s", class `mk-seep`, drawn at its cell
when nothing else takes the glyph, with a legend entry.

**Capability spine.** `build:seep` gets a row: a producer, connecting
the body's thirst, the runner's thirsty step and the camp tick. It is
added to `PRODUCERS` and the coverage test picks it up.

**The seep row.** "Fetch water from the seep" is the `fill` row with
arg `seep` (section 2). Its place is the nearest seep in the region that
holds liquid water, by route; it fills the vessel as far as the pool
goes and brings it home. It is never chosen for the player: a shore
order at an iced shore waits, it does not walk to the seep. Passed over:
a keep served by the seep for a trough, which is a day of waiting for
20 litres, though nothing forbids the player ordering it.

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
of 10 l; camp water 6 l, 8 min; snow at the fire, 1 l per 15 min and 1
kg wood". The melt line shows when the camp fire is lit and snow lies,
so the wood cost sits beside the seep's free litres. Kinds with none are
left out; a region with none reads "no water in this region". The site report adds "seep
possible" for a cell with a seep ground.

## 4b. Misc: the fire rows split

"Light the fire" today lays a pit fire, except that when a turf hut
stands with no cabin, or a cabin has a hearth, it lights indoors on its
own and the row's small print says so after the fact. "Light a fire
indoors" refuses a cabin with a hearth and points at the plain row. Under
section 0 the two become two methods:

- **Light the fire** is the pit fire, always: `fire.indoors` is false
  whatever stands. A pit fire beside a hut is legal and burns at the
  open rate with no indoor temperature, which is the player's choice.
- **Light a fire indoors** covers the hut's smoke hole and the cabin's
  hearth; its refusal for a cabin with a hearth is dropped, and its
  warning for a cabin with no hearth stays.
- The reference list's `keep("light", 1)` is joined by a
  `keep("lightIndoors", 1)` that `wantOpen` opens once a hut or a hearth
  stands, and the plain keep closes then; the runner's own `fireStep`,
  a body reflex, lights indoors when it can, as it does today.
- Tests in `tests/fire.test.ts` that reached the indoor rates through
  the plain light move to the indoors row; the year loop's readings for
  fuel by shelter are re-read in section 6 on the split list.

## 5. Tests

- gen: over seeds 1 to 40, every start region's camp is a shore cell;
  every start region has a shore; the spot list has no duplicate cell.
- landing: the first survivor's start cell is a shore; `landingCell`
  for an heir is unchanged on a fixed seed.
- fill: a plain Fetch water order delivers to camp; the trip takes the
  emptiest vessel, a partly full one only when it is alone; the row's
  litres equal capacity minus litres for the vessels in hand; a vessel
  with nowhere to pour stays in hand full; a shore order at an iced
  shore waits with "iced over" and never melts or cuts; the hole order
  cuts and fills with an axe and is greyed without one; the melt keep
  fills the vessel and pours it; the seep order fills as far as the pool
  goes and is greyed when no seep holds water.
- reference: `wantOpen` opens the hole keep with an axe on an iced
  shore, the melt keep without one, and neither on an open shore; the
  indoors light keep opens once a hut or a hearth stands.
- fire: the plain light never sets `fire.indoors`; the indoors light
  lights a cabin's hearth.
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

`npm run reference`, `npm run horizon`, `npm run year`,
`npm run year -- --level=10`, `npm run year -- --fresh` and
`npm run year -- --winter` on the gate seeds 17, 19, 42 and 79, after
part 1, with the numbers in the plan's record and in the roadmap's F
section as a "Measured with the landing camp" paragraph beside the
"Measured with the year loop" ones, under the same gate names. The
"before" is the year loop's closing set at 9deac2c: the April gate 4 of
4 at day 26, then starving on days 52, 55, 39 and 46; the heir trend 2
of 4; the year gate 0 of 4 at level 20 (days 68 starved, 245 froze, 218
and 229 starved), at level 10 (82, 214 thirst, 177, 102) and fresh (52,
55, 39, 46); the winter gate 0 of 4 (days 23 and 34 thirst, 6 and 8
froze). Every one of these moves when the first camp is on the shore,
so all six runs are re-read, not only the ones about water. The winter
gate is the one this camp is expected to change most: the two thirst
deaths are at a camp with an axe whose shore is 25 to 55 minutes off,
and now the shore is under foot; the two frozen deaths are outdoor cold
on a walking task, which is E's row and should not move. The indoor 1.3
water-loss factor is not touched, so a thirst death that stays is that
factor's reading and goes to the tables audit as such. The expectation
everywhere is a shorter water walk and an easier gate; a gate that gets
harder is a finding, not a number to bend.

**Measured.** Built 2026-09-06 on main; the readings are in the
roadmap's F section under "Measured with the landing camp", beside the
year loop's. In short: the April gate 4 of 4 at day 26 with the first
lives at days 61, 51, 50 and 114; the winter gate 4 of 4 from 0 of 4;
the heir trend 2 of 4 as before; the year gate 0 of 4 at every level,
the level-20 deaths now thirst in late October on three seeds, traced
to the axe wearing out with no stone to make another, so no wood is
split, no fire burns, the trough's water is ice and the shore keep
reads "camp is full" when the shore ices. That is the tool chain's
reading, not the water's, and it goes to the tables audit.

## 7. The browser pass

DevTools, seed 17, 1440 wide: the survivor starts on a shore and the
water line reads "shore, endless"; Fetch water from the shore brings a
bucket home and the camp reading rises; with the shore iced (a December
save) the shore row is greyed "iced over" and the hole row is offered
with the axe's wear in its small print; walk to a bog cell, the line says a seep is
possible with its rate, dig it, the mark shows, the line shows the pool
filling; drink there and the pool drops; a second dig on the same cell
is refused, and one on the next bog cell works and shows its own mark.

## 8. Roadmap edits

- The build order: this spec goes in right after the year loop and
  before the winter loop, because the tables audit's opening flag,
  winter thirst at a camp with an axe, is a reading taken at a camp 25
  to 55 minutes from its water, and the winter loop's three rules are
  gated on the year probe, which this spec moves. Reading them in the
  other order measures the winter loop twice.
- The F section: a "Measured with the landing camp" paragraph beside
  the year loop's, with section 6's runs, and a line that the year
  loop's melt fallback was replaced by the list's own winter wants.
- A standing ruling, beside the decay ruling: an order names one
  method; the choice is the player's or the list's; "hunt anything" and
  "fish anything" are the exceptions; a later collapse is a recorded
  decision.
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
splitting of rows other than water and fire, no
drought model beyond the existing dry-day count.
