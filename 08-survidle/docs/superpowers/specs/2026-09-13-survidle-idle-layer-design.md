# The idle layer: stocks, rates, and the first covered store

Written 2026-09-13 against main at `a587cf1d`, after the close-zoom and
succession work merged (PR 14).

The idle layer is the weakest part of this game, and
`docs/roadmap-additions.md` says why under "Nature is the enemy": no
ratchet, no return moment, and autonomy the player did not author. This
spec takes the first bite. It makes the camp's stocks, their real caps and
the direction they are moving legible at a glance, and it adds exactly one
new store with one expansion rung so that the pattern is proved on
something rather than asserted.

It is deliberately not item P entire. The camp view switch, ghost
placement on the map, the stake paint and the danger paint stay on the
roadmap.

## What is new, and what is only surfaced

Most of this is presentation of quantities the simulation already keeps.
Three things are new simulation, and they are named here so nobody has to
go looking:

1. A covered wood store, the vedbod, with a capacity in kilograms.
2. Dry firewood re-wetting in rain when it is over that capacity.
3. A camp yard in square metres, which every structure occupies a share of.

Everything else on the toolbar is a read.

## 1. The toolbar

A new full-width strip, `#stocks`, above `#app` in `index.html`, spanning
the page the way a menu bar does. It is not a map control and it does not
sit over the map.

The map's `#mapinventory` strip stays exactly as it is. The two answer
different questions and both are worth having: the map strip says what is
lying in this cell, which is a reading about a place, and the toolbar says
what the camp holds and which way it is moving, which is a reading about
the run.

Four groups, each a cell in the bar:

    WOOD 42 kg  +0.33/min      FOOD 6.2 days  -0.61/min
    WATER 2.0 / 4.0 l          PACK 11 / 25 kg

Hovering a group, or focusing it from the keyboard, opens a panel under it
holding the members with their own quantities, the cap and where the cap
comes from, and the itemised signed causes behind the rate. The panel is
also what a tap opens on a phone.

    WOOD   42 kg, 0 of it covered
      firewood 31 kg, wet firewood 6 kg, sticks 4, logs 1
      + felling                 +0.40 kg/min
      - fire                    -0.05 kg/min   (3 kg/h, open, at -2 C)
      - rain on the open stack  -0.02 kg/min
      = +0.33 kg/min            80 kg coming from the tree in hand
      this patch: 3 stems left of 7. This region: 412.

It renders through `setPanel` like every other panel, on the existing
ten-times-a-second clock, and writes no bar width into markup: the morphing
rule in `src/ui/panels.ts` and the writers in `src/ui/bars.ts` govern it.
At 390 wide the groups wrap to two rows and the hover panel becomes a
tap-to-open row.

### Why the stand is on it

The succession work that landed in PR 14 made felling a decision with a
consequence: `takeWood` draws a patch of 0.0025 km2 down, `setWoodPatchLeft`
succeeds the ground once it is empty, and a felled-out patch is a clearing
that grows back through young growth on a hundred-year rotation. Nothing in
the interface says so.

Putting `woodPatchLeft` and `woodLeft` on the wood group's panel is the
cheapest way to make the new model visible, and it is the honest ratchet
the roadmap asks for: the store goes up, the stand goes down, and the
answer is to work another patch rather than to make this one richer.

## 2. The group table

One new file, `src/ui/stocks.ts`, holding `GROUPS`: an ordered list of
`{ id, label, members, unit, cap, headline }`. An item named by no group
does not appear. Adding an item to `items.ts` can never break the toolbar,
and promoting one to it is one line in one table.

The MVP groups:

| group | members | unit | cap |
| --- | --- | --- | --- |
| wood | logs, sticks, firewood, wet firewood | kg | covered kg, see section 4 |
| food | every edible, at the survivor's own burn | person-days | none; the rack's kg is a store line on the camp sheet |
| water | water, ice | litres | `campWaterCapacity`, vessels and the trough |
| pack | everything carried | kg | 25 comfortable, 35 impossible, from `src/units.ts` |

Person-days of food banked is item P part 3's headline number and it is
honest: kilocalories held over the survivor's own daily burn.

## 3. The rate component and the units toggle

One component, `rate(perGameHour, unit)`, used by the toolbar and by every
producer line on the camp sheet.

The scale makes the conversion exact and free:

    1 game hour  = 1 real minute
    1 game minute = 1 real second

so a quantity per game hour is the same digits per real minute, and per
game minute the same digits per real second. The toggle changes the words
and the decimal point, never the model.

A new persistent setting sits beside the cloud-shadow one: "read rates in
game time / in real time", default game time. The component prints the
other in brackets, the way every duration in this game already prints
"1 h 40 min (1 min 40 s)". So `+0.33 kg/min (0.33 kg/s real)` under one
setting and `+20 kg/h (20 kg per real min)` under the other.

### What the projection may count

The rate sums only causes the simulation can already answer exactly:

- the running task's yield, where the task declares a machine-readable one.
  The MVP declares it on the wood tasks only: `chop` (4 logs and 4 sticks in
  50 to 60 minutes), `split` and `splitWedges` (20 kg a log), `deadwood`
  (`DEADWOOD_KG`, 10 kg a gather) and `sticks` (6 a gather). Every other task
  declares nothing and contributes nothing;
- the fire, from `burnPerHour(w, ambient, st)`;
- the producers in `src/sim/capabilities.ts`: snares, drying rack, basket
  trap, water trough, seep;
- the body's kilocalorie burn and water draw, for the food and water groups;
- spoilage and re-wetting, which are rates the sim already runs.

Anything else contributes nothing, and the panel's last line names what it
counted. The number is an estimate about the future and is labelled as one;
it is never a guess dressed as a reading.

A task in hand also shows its unbanked share, "80 kg coming from the tree
in hand". Felling banks four logs at the end of fifty to sixty minutes, so
this is the task progress bar read in kilograms, and it is the
click-and-watch-it-move feedback the whole layer is for.

## 4. The vedbod, and the one rule that makes a cap bite

### The store

A vedbod is a roof on posts over an open stack. Capacity comes from
stacked volume at about 350 kg per stacked cubic metre of air-dry birch.

| what stands | dry space it shelters | covered wood | days of a turf-hut winter fire |
| --- | --- | ---: | ---: |
| nothing, or a fire site only | none | 0 kg | 0 |
| lean-to | 0.5 m3, the strip beside the sleeper | 175 kg | 5 |
| turf hut | 1 m3, indoors along the wall | 350 kg | 10 |
| log cabin | 2 m3 | 700 kg | 19 |
| each vedbod | 3 m3 | 1,050 kg | 29 |

Cover adds, so a cabin with a vedbod covers 1,750 kg.

The last column uses the game's own numbers: `openBurnPerHour(-9)` is
5.7 kg/h, the turf hut's `SHELTER_BURN_RATIO` is 0.4, and a lit sixteen
hours is about 36 kg a day. A ninety-day winter is roughly 3,300 kg.

Build cost sits between the lean-to's 240 minutes and the turf hut's 1,200:
6 logs, 12 sticks, 20 bark, 3 cordage, 300 minutes. Upkeep is a bark roof
on the turf hut's clock, re-roofed for 20 bark and two hours.

It is counted, `site.woodsheds`, with no maximum. What caps it is
materials, labour, upkeep and the yard in section 5, which is the
roadmap's own rule for the stake: bounded by one person's labour and not
by a number.

### Re-wetting

Dry firewood over the covered capacity re-wets in rain, at 1 kg per hour
of rain, bounded by the uncovered amount. The rate does not scale with the
size of the stack, because the rain reaches the outer layer and the outer
layer is much the same whatever the stack.

It applies to every stack of firewood wherever it lies, camp pile or field
pile, at 1 kg an hour per stack; cover is what a camp can have and a field
pile cannot. Sticks are not touched, because there is no wet stick and a
stick is joinery rather than fuel.

This is the only reason any of the caps above bite, and it bites from the
first wet week rather than from a shed nobody has built yet: the default
state of a camp is zero cover.

It reuses the `firewood` and `wetFirewood` pair and the half-heat rule that
already exist. No abstract number enters the game.

### The vedbod as a dryer and as a roof

Two further readings follow from a vedbod being a roof, and both are one
line each:

- It counts as shelter in `dryWood`, drying 2 kg/h whatever the weather.
  Today only a lit fire, a cabin or a turf hut does that, and a lean-to
  dries 2 kg/h in dry weather and nothing in rain. So wet and dry firewood
  share one capacity and the wet becomes dry under it, which is what a
  woodshed is for and the reason to haul wet wood home.
- It counts in `splitSheltered`, so splitting under it yields dry firewood
  in the rain.

### Logs

Logs do not count against the vedbod and are not given a wet state.

A log is already wet: green wood is 40 to 60 percent water, well past
fibre saturation, and rain cannot add to that meaningfully. What rain wets
is the surface, and the surface is what the axe goes through. The sim
charges exactly that already, through `RegionState.logsWet` and
`splitIsWet`: a split is wet while it rains and for `WET_AFTER_RAIN_MINUTES`
after. A `wetLog` item would be a second name for a state that exists and
is in the right place.

A woodshed holds split, stacked firewood; round logs lie in the yard.
Log accumulation is capped already by the hardest constraint in the game:
a log is 20 kg and never goes in the pack, so it is one log per trip from
where the tree fell, and a cabin's forty logs are forty walks.

What is genuinely missing for logs is rot, not rain and not space. That is
raised as a roadmap line in section 9 rather than built here.

## 5. The yard

A camp cell is 300 m across, so the cell is not what constrains a camp. A
yard is, and clearing ground is already priced in this game: the fire site
is ground cleared to bare earth at 20 minutes on good ground, 30 under
spruce where the duff is scraped back, and 60 on peat, which cannot be
scraped at all and takes a platform instead.

That yields a clearing rate with no constant invented:

| ground | fire site minutes for its 4 m2 | implied rate |
| --- | ---: | ---: |
| dry meadow | 20 | 12 m2 an hour |
| spruce, duff scraped back | 30 | 8 m2 an hour |
| peat, a platform instead | 60 | 4 m2 an hour |

Footprints:

| structure | footprint |
| --- | ---: |
| fire site | 4 m2 |
| water trough | 1 m2 |
| drying rack, four two-metre poles | 4 m2 |
| lean-to | 6 m2 |
| vedbod | 6 m2 |
| snow shelter | 6 m2 |
| turf hut | 12 m2 |
| log cabin | 25 m2 |
| bough bed, snares, hanging meat, log heaps | none |

A landing camp has about 30 m2, which holds a fire site, a lean-to, a rack
and a trough with a little spare. Past that, ground is widened by a task
whose minutes the terrain under the camp sets. A cabin at 25 m2 forces a
widening; five vedbods are 30 m2, which is two and a half hours on meadow
and seven and a half on peat.

**Naming.** This is the **yard**, and the task is "widen the yard". The
word clearing is taken: since PR 14 a clearing is a felled-out patch of
stand under succession, in `src/world/groundchange.ts`, and the two must
not share a word.

Bough beds, snares, hanging meat and log heaps take no footprint. A bed is
inside something, snares are out on the heath, hanging meat is a use of the
rack rather than a thing on the ground, and a heap of timber awaiting a
build is not a kept store. If the last of those turns out to be wrong, the
yard is where the charge goes and nothing else moves.

A save written before the yard existed computes its yard as at least the
sum of what already stands, so no save is left holding a camp that could
not exist.

## 6. The camp sheet

`campHtml` in `src/ui/panels.ts` already prints the fire's fuel bar, the
rack's kilograms against `rackCapacity`, water litres against
`campWaterCapacity`, the snare count, and each producer's `limits` string
from `capabilities.ts`. The MVP re-lays that as item P part 3's sheet:

- one line per store: held, cap, and what is lossy about it, because the
  caps here are lossy rather than merely full. Meat spoils, an unchecked
  trap line loses its catch after `SNARE_CATCH_MAX_AGE`, the fire dies,
  water freezes, and now wood over cover gets wet. The north presses the
  return, not a timer.
- one line per producer: its rate through the same `rate()` component.
- the yard: "28 of 30 m2", and the blocker when a build does not fit.

## 7. Taken from item P, and left

Taken, because each is cheap and each is load-bearing for an idle layer:

- **The ghost's blocker list, without the placement gesture.** Item P part
  2's expensive half is choosing a cell on the map. Its valuable half is
  that a queued build is a visible object carrying why it cannot start.
  Create the `Site.build` entry when the order is placed rather than when
  it starts, so the camp sheet reads "vedbod, planned: needs 6 logs (have
  2), 20 bark (have 0), 6 m2 of yard (have 2)". Most of the machinery is
  there: `src/sim/tasks.ts` already writes `build[sid] = 0.001` at start,
  `Site.build` keeps progress between visits, and `RegionState.sites` is
  keyed by cell.
- **Cap events in the away report.** The diagnosis says the missing thing
  is a return moment, and item P part 3 says the away report should read
  against the sheet. So the report names what the caps did while you were
  gone: the rack was full for two days, 94 kg of firewood got rained on,
  the trough froze.
- **A reason on the greyed affordance,** RimWorld's habit: a store at its
  cap says why and what raises it, in the toolbar's own panel. Text, not
  machinery.

Left on the roadmap: the camp view switch (part 1), ghost placement on the
map (the rest of part 2), the stake and danger paint (parts 4 and 6), zone
painting, and expansion rungs on the rack, the vessels and the snares. The
vedbod is the one rung this ships; proving the pattern on one store is the
point.

## 8. Testing and gates

- Unit tests for the group table: an ungrouped item never appears, a group
  with no members does not render, a new item in `items.ts` changes nothing.
- Unit tests for `rate()`: both units round-trip, and the bracketed second
  reading is the other one.
- Unit tests for the projection against a fixture state, one per counted
  cause, including that an uncounted cause contributes nothing.
- Unit tests for cover: capacity sums over what stands, the uncovered share
  is what re-wets, wet and dry share one capacity, a vedbod dries and
  shelters a split.
- Unit tests for the yard: footprints sum, a build that does not fit is
  blocked and says so, an old save computes a yard that holds what stands.
- A browser pass at 1440 by 900 and at 390 wide against `docs/ux.md`,
  checking the hover panel, the wrap and the churn budget.

`npm test` and `npm run build` are the commit gate.

The re-wetting rule is the one balance risk, because today a player who
splits in dry weather keeps dry firewood for ever. Read
`npm run year -- --winter` before and after and report both numbers. If the
gate moves, that is a reading about a rule the simulation was missing, not
a reason to drop the rule: gates measure the sim.

## 9. Roadmap lines this raises

- **Log rot.** Nothing gives a log a clock, though food, structures and the
  bough bed all have one. Decay needs wood over about 20 percent moisture
  and temperature over about 5 C, so at 62 N the clock runs June to
  September and stops. Ground contact is most of it and bark is the rest: a
  birch log left with its bark on spoils in a summer, while the same log
  debarked and stacked on skids keeps for years. The shape when it comes:
  logs on the ground degrade, debarking yields `bark` the game already
  wants and preserves the timber, a roof stops the clock, and a rotted log
  splits to a reduced yield rather than vanishing. Kept out of this MVP so
  that one gate reading answers for one rule.
- **Footprints drawn into the camp cell's subcells.** The 3 by 3 and 6 by 6
  fields at close zoom are presentational by design, so drawing what stands
  costs no simulation. This is item P's held item "a camp across several
  cells", within the cell first.
- **The keep that fits the store.** "Keep camp at 40 kg firewood" is
  today's habit and a shed-full is 1,050 kg. Once a store has a cap, the
  cap is the natural number for its keep, and the camp sheet should offer
  it.
