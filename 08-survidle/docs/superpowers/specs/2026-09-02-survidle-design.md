# Survidle - a northern survival idle game

Prototype `08-survidle`. A single-player, browser-only idle survival game in the
spirit of Melvor Idle: one active task at a time, a progress bar for everything,
the simulation keeps running while the tab is closed, and the only goal is to
survive as many days as possible. Death is permanent; the save is deleted.

## The one scale

Every in-game quantity is a real-world quantity - kilometres, kilograms,
kilocalories, degrees Celsius, minutes - and the only thing that is not real
is how fast the clock runs:

    1 real second = 1 game minute   (60x)

So a 4.5 km walk at 3 km/h is 90 game minutes and takes 90 real seconds. A
day is 24 real minutes. A year is 365 game days, which is about 6 real days
of the clock running; most of that passes while the tab is closed, because the
simulation catches up on load. Nothing else in the design converts time; every
duration below is a game duration and the UI shows both ("1 h 30 min, 90 s").

`?speed=N` multiplies the clock for testing and is the only exception. It is
how a tester reaches winter in an afternoon; it is not a game feature.

## Decisions confirmed with the author

- One autosave in `localStorage`. Opening the page resumes the run and
  catches up on elapsed time. Death deletes the save; "Begin again" starts a
  new random seed. An "Abandon run" control behind a confirm does the same.
- 60x clock with a realistic 365-day calendar. Winter is reached over days of
  real time, mostly while the tab is closed.
- Offline catch-up is capped at 24 real hours.
- Carrying matters, from first principles: a pack limit, piles that stay where
  things were produced, and walking inside a region between the places work
  happens. Carts and sleds are the intended later upgrade for carrying more;
  they are out of scope here and the pack limit is the single number they
  would raise.

## Assumptions made without asking

These are the remaining judgement calls and the first things to revisit:

- **Latitude and climate.** About 62 N inland (central Norway / Sweden /
  Finland). Midsummer has about 20 hours of daylight, midwinter about 5.
  July mean +15 C, January mean -9 C, with cold snaps to -30 C.
- **Calendar.** Realistic. The run starts on 1 April at 08:00 in a
  snow-melt spring. Seasons follow the months: spring March to May, summer June
  to August, autumn September to November, winter December to February.
- **Map scale.** A 72 x 36 grid of 300 m cells, so the world is 21.6 x 10.8
  km and each of its roughly 16 regions is a few kilometres across.
- **Weights and logistics.** Felled logs lie where they fall. Every spot in a
  region has a pile and the player carries a pack. Building at a camp uses
  the camp pile plus the pack, so what you cut in the forest has to be
  carried to camp.
- **Everything is reachable from the UI.** Every task, recipe, structure and
  animal in code appears as a button or list entry, and a test asserts it.

## Time

`GameState.minute` counts game minutes since the run started; the run starts
at day-of-year 91 (1 April), 08:00. Derived:

| quantity      | rule                                                              |
|---------------|-------------------------------------------------------------------|
| day survived  | calendar days since the start, 1-based: `dayIndex + 1`             |
| hour of day   | `((minute + 480) mod 1440) / 60`                                  |
| day of year   | `(90 + floor((minute + 480) / 1440)) mod 365`                     |
| season        | by month of the day of year                                       |
| daylight      | standard day-length formula for latitude 62 N with solar declination `23.44 * sin(2 pi (dayOfYear - 80) / 365)`, centred on 13:00 |
| is night      | hour outside `[13 - light/2, 13 + light/2]`                       |

The simulation advances in steps of at most one game minute. The foreground
loop calls `advance(state, dtMinutes)` at about 10 Hz with the real elapsed
time; offline catch-up calls it in one-minute steps. Probabilities are written
as per-minute rates so the step size does not change the odds.

## Weather

- **Seasonal mean** `T(doy) = 3 + 12 * cos(2 pi (doy - 200) / 365)`: about
  +15 C in mid-July, -9 C in mid-January, near 0 C on 1 April.
- **Diurnal swing** `+/- 5 * cos(2 pi (hour - 15) / 24)`, warmest at 15:00.
  The swing is 8 C on clear days and 3 C in overcast or precipitation.
- **Daily offset** re-rolled at dawn, roughly normal with standard deviation
  4 C, shifted 3 C colder in winter so clear still nights sink far below the
  mean. A winter offset below -8 C is a cold snap and gets a log line; with
  the night swing and snowfall that is -25 to -30 C.
- **Precipitation** is a two-state Markov chain evaluated per minute with
  per-hour rates: start 4 percent (spring, autumn), 3 percent (summer),
  5 percent (winter); stop 25 percent. Each spell is light or heavy (30
  percent heavy). Rain above 0 C, snow at or below. Precipitation lowers
  ambient by 2 C.
- **Snow depth** in cm: heavy snowfall adds 1 cm per 20 minutes, light 1 cm
  per 40; melts 1 cm per 30 minutes when ambient is above +2 C. Depth above
  30 cm is deep snow: walking speed x0.5 and hunt odds x0.75.

## World

### Cells

A 72 x 36 grid, 300 m per cell. Each cell has elevation `e` and moisture `m`
from seeded fractal value noise, then a terrain, tested top to bottom:

| terrain | glyph | colour      | rule                                  |
|---------|-------|-------------|---------------------------------------|
| water   | `~`   | blue        | `e < 0.31`, or the top 3 rows (sea)   |
| fell    | `^`   | grey        | `e > 0.84`                            |
| rock    | `n`   | dark grey   | `e > 0.76`                            |
| bog     | `"`   | teal-green  | `m > 0.62 and e < 0.5`                |
| spruce  | `A`   | dark green  | `m > 0.52`                            |
| pine    | `T`   | green       | `m > 0.40`                            |
| birch   | `Y`   | light green | `e < 0.5`                             |
| meadow  | `.`   | pale green  | otherwise                             |

Elevation is stretched around 0.52 by 1.4 before the tests and pulled down
toward the top edge so the sea lies north. Typical shares: water 18 to 35
percent, forest 45 to 55, bog 4 to 8, rock and fell 7 to 12.

When snow depth is above 5 cm every land glyph is drawn in whitened colours
and meadow becomes `*`.

### Regions

About 16 seed points on a jittered 6 x 3 lattice (a seed that lands on water
is nudged to the nearest land cell); each cell joins its nearest seed.
Regions are the unit of play. Per region, from its cells:

- Fractions `forest` (spruce + pine + birch), `spruce`, `pine`, `birch`,
  `meadow`, `bog`, `rock` (rock + fell), `water`.
- `wood`: standing trees worth felling. A hectare of boreal forest holds
  hundreds of stems, so this is not a scarcity number; it is
  `forest * cells * 60` and drops by 1 per tree, regrowing 0.5 per forest
  cell per year.
- Animal capacities, from boreal densities (roe deer 2 to 5 per km2, moose
  0.5 to 1 per km2, mountain hare 5 to 20 per km2, grouse 10 to 30 per km2)
  times the region area in km2 (`cells * 0.09`):
  hare `area * (4 + 16 * (meadow + birch))`, grouse `area * (8 + 20 * (pine + spruce))`,
  deer `area * 5 * forest`, elk `area * (0.3 + 0.8 * (spruce + bog))`,
  fish `area * 60 * water` (fish as catchable kilograms rather than heads is
  out of scope; each fish is a 0.7 kg average).
  Starting populations are 70 percent of capacity.
- `name` from a syllable generator (Kald-, Gran-, Myr-, Bjørk- as Bjork-,
  -vik, -tjern, -heia, -mo, -skog).
- Neighbours: regions sharing a 4-connected cell edge.

The start region is the most central region with `forest >= 0.4`.

### Spots inside a region

Work happens at places, not in a region as a whole. Every region has a
`camp` spot at its centroid and, where the terrain exists, a `forest`,
an `outcrop` (rock), a `shore` (water) and a `heath` (bog and meadow). Each
spot has a distance from camp in km that shrinks as its terrain gets more
common in the region:

    forest  0.3 + 0.9 * (1 - forest)      outcrop 0.4 + 1.2 * (1 - rock)
    shore   0.3 + 1.0 * (1 - water)       heath   0.3 + 1.0 * (1 - bog - meadow)

Walking between two spots goes via camp unless one of them is camp, at
the travel speed below. Chopping, sticks and bark happen at the forest;
stone at the outcrop; fishing at the shore; berries and hare at the heath;
grouse, deer and elk at the forest; building, fire, cooking, sleeping and
the shelter bonus at camp. Crafting and splitting work anywhere the inputs
are.

Each spot has a **pile**. Produced things go into the pack while it is under
25 kg, otherwise onto the pile of the spot the player stands on; logs always
go to the pile. Consuming tasks draw from the pack plus the pile under the
player's feet. **Haul to camp** is a repeatable task at any non-camp spot:
each cycle loads the pack to 35 kg from the pile, walks to camp, drops it
all on the camp pile and walks back. Its cycle time is the round trip at
the loaded speed. A cabin's 40 logs is 40 such cycles, which is exactly the
problem a cart later solves.

### Travel

Distance between two adjacent regions is the centroid distance in cells times
0.3 km times 1.25 for the wandering a real path does. Walking speed:

| condition                         | km/h                       |
|-----------------------------------|----------------------------|
| base, off-trail forest            | 3.0                        |
| more than half bog on either side | x0.7                       |
| snow depth above 30 cm            | x0.5                       |
| night                             | x0.75                      |
| pack over 25 kg                   | x0.8; over 35 kg x0.6      |
| energy below 20                   | x0.7                       |

Travel is a task whose duration is `distance / speed`, so a typical 4 km hop
takes 80 game minutes. Leaving from a spot other than camp adds that spot's
distance; arrival is always at the destination's camp. The travel list shows
km, game time and real seconds.

### Animals

Populations are real numbers per region per species. Once per game day at
04:00:

1. Logistic growth `pop += r * pop * (1 - pop / K)` with yearly-realistic
   daily rates: hare 0.006, grouse 0.005, deer 0.0012, elk 0.0006, fish 0.003.
   Growth happens April to September only; in winter K for deer and elk is 60
   percent so they thin out.
2. Migration: 3 percent of each land population leaves for a random neighbour
   weighted by spare capacity. The log notes it when the player's region
   gains or loses more than a quarter of its deer or elk ("Deer tracks lead
   toward Grantjern").

Density shown to the player is qualitative: none, tracks, few, some, many
(pop/K thresholds 0.02, 0.15, 0.4, 0.7).

## Player

### Energy budget (hunger)

Hunger is a kilocalorie reserve shown as a bar. Full is 6000 kcal, about two
days of normal living; the bar is `reserve / 6000`. Burn rates per hour:

| activity                 | kcal/h |
|--------------------------|--------|
| sleeping                 | 70     |
| resting, crafting, cooking | 100  |
| gathering, hunting, fishing | 200 |
| walking                  | 300; 350 with a pack over 25 kg |
| chopping, splitting, building | 400 |
| felt temperature below 0 C | +30 percent |
| sick                     | +20 percent |

At reserve 0 the body burns itself: health falls 2 points per hour.

### Warmth

Warmth 0..100 is a heat balance, not a leak. Each felt temperature has a
level the body settles at, `target = clamp(50 + (felt - 5) * 5, 0, 100)`:
50 at a felt 5 C, 100 at 15 C and above, 0 at -5 C and below. Warmth closes
1.2 percent of the gap to that target every minute, a time constant of about
an hour and a half, so a felt -15 C takes a fully warm body under 20 in about
two and a half hours and a return to the fire brings it back at the same
pace. Below 20 it is hypothermia: health falls 6 points per hour. Felt temperature = ambient + clothing + fire +
shelter + activity - 0.15 * wetness.

- Clothing insulation in "degrees of comfort", summed over worn items and
  scaled by durability. Starting wool coat 8, wool trousers 4, leather boots
  3 and wool hat 2 at 60, 60, 50 and 70 durability, about 10 C together. Hide coat 12, hide trousers 6, hide boots 4,
  fur hat 3, fur mittens 2. Worn items lose 0.5 durability per outdoor game
  hour, 1.0 in precipitation.
- Fire +15 when the player's region has a lit fire and the task is a camp
  task (idle, rest, sleep, craft, cook, split, repair, build); +7 for other
  tasks in that region.
- Shelter: lean-to +5 and halves wetting; cabin +15 and blocks precipitation;
  camp tasks only.
- Activity: chop, gather, build +6; walk +4; hunt, fish +2.

### Energy (fatigue)

Energy 0..100: -4 per hour awake, -8 per hour working, +12.5 per hour
sleeping (8 hours to full), +6 resting. Ten hours of work and six awake cost
about a night's sleep. Below 20, tasks run at half speed.

An idle character whose energy falls under 10 starts a sleep task on their
own, wherever they stand. Idling is not a way to skip sleep.

### Wetness

0..100. Rain outdoors: +1 (light) or +2 (heavy) per minute; snow brushes off,
wets at a quarter of that and never past 30 (damp). Drying: 1.5 per minute at a lit fire, 0.5 in
shelter, 0.3 outdoors when dry.

### Statuses

`sick` for 48 hours: hunger x1.2, health -0.5 per hour unless in shelter
with felt >= 10. `injured` for 24 hours: work speed x0.7.

Health regenerates 1 point per hour when fed (reserve > 1500), warm (> 40)
and not sick.

## Inventory and weight

Items carry a unit weight. Counted items: log (18 kg, a 2 m spruce section),
stick (0.5 kg), bark (0.2 kg), cordage (0.1 kg), stone (1.5 kg), bone (0.3 kg),
sinew (0.05 kg), snare (0.4 kg), arrows (0.05 kg). Weighed items in kg:
firewood, hide, raw meat, cooked meat, dried meat, fish, cooked fish, berries.
Tools: axe (1.5 kg), knife (0.2), bow (0.8), fishing spear (1.0), fire drill
(0.3), bone needle (0.01).

The **pack** is what travels; the **pile** of the current spot is the
ground. Producing tasks put results in the pack while it has room (under
25 kg) and otherwise on the pile; logs always go to the pile. Consuming
tasks (craft, cook, build, feed the fire) draw from pack and pile together.
The inventory panel shows both with "take" and "drop" controls; carrying above
25 kg slows walking and above 35 kg is refused.

### Food

| food        | kcal/kg | portion | notes                                              |
|-------------|---------|---------|----------------------------------------------------|
| raw meat    | 1500    | 0.3 kg  | 25 percent sickness roll                           |
| cooked meat | 1500    | 0.3 kg  |                                                    |
| dried meat  | 3500    | 0.15 kg | 3 kg raw dries to 1 kg                             |
| fish, cooked| 1000    | 0.3 kg  |                                                    |
| berries     | 500     | 0.2 kg  |                                                    |

Raw meat and fish spoil after 36 game hours above 0 C, cooked after 72;
ageing pauses below 0 C, so winter is a freezer. Dried meat and berries
keep. `autoEat` (default on) eats the best non-raw food when the reserve
drops below 1800 kcal.

### Tools

Durability 0..100, break at 0: axe (start 100, -1 per tree), knife (-1 per
use), bow (-1 per hunt), fishing spear (-1 per cast), fire drill (-2 per
lighting), bone needle (-2 per repair). Sharpening the axe costs 1 stone and
restores 30.

## Tasks

One task at a time, with `progress`, `duration` (minutes) and `repeat`.
Duration is divided by the work-speed factor (energy, injury). A repeating
task restarts if its inputs still hold. Durations are what the work takes a
competent person:

| task            | where / needs                         | duration          | result                                                              |
|-----------------|---------------------------------------|-------------------|---------------------------------------------------------------------|
| chop tree       | region wood > 0, axe                  | 60 min (spruce-dense regions 50) | 4 logs to the pile, 4 sticks; wood -1; axe -1; 1 percent injury |
| gather sticks   | forest > 0                            | 20                | 6 sticks                                                            |
| gather bark     | forest > 0                            | 20                | 4 bark                                                              |
| gather stone    | rock > 0                              | 30                | 3 stone                                                             |
| forage berries  | 15 July to 15 October, bog + meadow > 0 | 60              | 1 kg berries                                                        |
| split logs      | 1 log, axe                            | 15 per log        | 18 kg firewood                                                      |
| hunt hare       | hare > 0, bow + arrow                 | 90                | p = density * 0.6: 1.2 kg meat, 0.2 kg hide, 1 bone; 50 percent arrow loss on a miss |
| hunt grouse     | grouse > 0, bow + arrow               | 60                | p = density * 0.6: 0.5 kg meat                                      |
| hunt deer       | deer > 0, bow + arrow                 | 180               | p = density * 0.45: 12 kg meat, 3 kg hide, 4 bone, 3 sinew          |
| hunt elk        | elk > 0, bow + arrow                  | 240               | p = density * 0.3: 150 kg meat, 20 kg hide, 8 bone, 6 sinew; 15 percent injury |
| fish            | water > 0, fishing spear              | 60                | p = density * 0.6: 0.7 kg fish                                      |
| cook            | lit fire, raw meat or fish            | 10 per kg         | cooked meat / cooked fish                                           |
| craft X         | recipe inputs and tool present        | per recipe        | the item                                                            |
| repair clothing | 0.5 kg hide, bone needle              | 30                | +40 durability on the most worn item                                |
| sharpen axe     | 1 stone                               | 15                | axe +30                                                             |
| build X         | structure inputs, region lacks it     | per structure     | the structure; progress persists per region                         |
| light fire      | fire pit, fire drill, 1 kg firewood   | 10                | fire lit with 1 kg fuel                                             |
| travel to R     | R adjacent                            | distance / speed  | player region = R; snares checked on arrival                         |
| rest            | anywhere                              | 60, repeat        | energy +6 per hour                                                  |
| sleep           | anywhere, better in shelter           | until dawn or rested, 10 h at most | energy +12.5 per hour                              |

Hunt odds are multiplied by 0.75 in deep snow, 0.7 at night, 0.85 in rain.
Hunting removes the animal from the region population on success. Meat that
does not fit the pack goes onto the pile where it fell, which is how an elk becomes
several trips.

### Recipes

| item          | inputs                                   | tool   | minutes |
|---------------|------------------------------------------|--------|---------|
| cordage       | 3 bark                                   | -      | 20      |
| knife         | 2 stone, 1 stick, 1 cordage              | -      | 45      |
| fire drill    | 2 sticks, 1 cordage                      | knife  | 30      |
| bow           | 1 log, 2 cordage                         | knife  | 180     |
| arrows x5     | 5 sticks, 3 stone, 1 sinew (or 1 cordage) | knife | 60      |
| fishing spear | 1 stick, 1 stone, 1 cordage              | knife  | 30      |
| snare         | 1 stick, 2 cordage                       | knife  | 20      |
| bone needle   | 1 bone                                   | knife  | 20      |
| stone axe     | 3 stone, 1 stick, 2 cordage              | knife  | 90      |
| hide coat     | 6 kg hide, 2 sinew                       | needle | 480     |
| hide trousers | 4 kg hide, 1 sinew                       | needle | 300     |
| hide boots    | 2 kg hide, 1 sinew                       | needle | 240     |
| fur hat       | 1 kg hide, 1 sinew                       | needle | 120     |
| fur mittens   | 1 kg hide, 1 sinew                       | needle | 120     |

### Structures (per region)

| structure    | inputs                              | hours | effect                                                     |
|--------------|-------------------------------------|-------|------------------------------------------------------------|
| fire pit     | 6 stone                             | 0.5   | can hold a fire                                            |
| lean-to      | 8 sticks, 4 logs, 2 cordage         | 4     | shelter +5, halves wetting                                 |
| cabin        | 40 logs, 12 stone, 8 cordage        | 60    | shelter +15, blocks precipitation; supersedes the lean-to  |
| drying rack  | 6 sticks, 2 cordage                 | 1     | holds 6 kg raw meat; dries 3 kg to 1 kg per 48 dry hours, even while away |
| snare (x5)   | 1 snare item                        | 0.1   | each day at 04:00 catches a hare with p = 0.3 * hare density; an uncollected catch is lost after 2 days |

A fire burns 3 kg of firewood per hour and holds at most 36 kg (12 hours).
`autoFeed` (default on) adds firewood from pack and camp pile when the fire drops
below 3 kg and the player is in that region.

## Random events

Rolled once per game hour:

| event        | chance per hour                                     | effect                          |
|--------------|-----------------------------------------------------|---------------------------------|
| sickness     | 0.1 percent; x4 if wetness > 50 and warmth < 40     | `sick` for 48 hours             |
| wolves       | 1 percent at night outside shelter, x2 in winter    | health -25, `injured`           |
| found flint  | while gathering stone: 10 percent                   | +1 stone extra                  |
| cold snap    | dawn roll, offset below -8 in winter                | log line                        |

## Death and permadeath

Health reaching 0 ends the run. The death screen shows days survived, the
cause (starved, froze, wolves, sickness), a few totals (trees felled, animals
taken, structures built, kilometres walked) and a "Begin again" button that
starts a fresh seed. The save is removed the moment death is recorded.

## Persistence and offline progress

`localStorage["survidle.save"]` holds the full `GameState` plus `savedAt`
(wall clock). Autosave every 5 seconds and on `visibilitychange`. On load the
elapsed real seconds, capped at 24 hours, are simulated in one-minute steps
and log entries produced during catch-up are shown in a "While you were away"
panel.

## UI

Dark, monospace, three columns:

1. **Left - You.** Health, hunger (kcal), warmth, energy, wetness bars,
   statuses, worn clothing with durability bars, tools with durability,
   auto-eat and auto-feed toggles.
2. **Centre - World.** Clock line (day N, date and season, HH:MM, ambient C,
   weather, snow depth, sun or moon), the ASCII map with region borders,
   `@` at the player's region centroid, `H` for shelters and `F` for a lit
   fire; the current region card (name, area km2, terrain mix, animals, wood,
   structures with fire fuel and rack progress) and the travel list of
   neighbours with km, game time and real seconds.
3. **Right - Doing.** The active task with its progress bar and a Stop button,
   then tabs: Gather, Hunt, Camp (cook, eat, fire, rest, sleep, sharpen,
   repair), Craft, Build; then pack and pile with weights and the log
   (newest first).

Panels re-render only when their content string changes, so buttons are never
replaced under the pointer; bars and the task progress update every frame.
Clicking a map cell selects that region and shows its card; if adjacent, the
travel button is highlighted.

## Testing

- `npm test` (vitest, happy-dom): calendar and daylight, temperature curve,
  world generation determinism and invariants (every region has a neighbour,
  the start region is forest, every cell has a region), travel time from
  distance and speed, animal growth and migration conservation, task
  completion effects and weight routing, hunger and cold leading to death,
  offline catch-up in one-minute steps, save round-trip, death clears the
  save, and a reachability test asserting every task, recipe, structure and
  species id is rendered by the actions panel.
- Browser pass in Chrome with `?speed=`: start, chop, split, build a fire pit
  and lean-to, light a fire, craft cordage, knife and bow, hunt, travel and
  return, sleep, survive into winter, and die.

## Out of scope

Farming, multiplayer, sound, saving more than one run, mobile layout.
