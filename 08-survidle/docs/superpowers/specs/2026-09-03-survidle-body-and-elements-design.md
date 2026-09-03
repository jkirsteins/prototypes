# Survidle: body and elements

Sub-project 1 of the survival edge (`2026-09-03-survidle-realism-roadmap.md`).
The body gets a third reserve, water; clothing gets wet and dries garment by
garment and feet can freeze; wood gets wet and fire fights the weather;
smoke under a roof harms; storms come; exhaustion lowers the odds of the
work and not only its pace. Every quantity stays real: litres, kilograms,
degrees, minutes, kilometres.

Extends `2026-09-02-survidle-design.md` (the body), the skills spec (odds)
and the intents spec (the runner). Sub-project 2 builds the answers: the
woodshed, the hearth, the covered pit. This spec defines the problems and
their harm so those buildings have a cost to be tuned against.

## Decisions confirmed with the author

- Water is drunk at the source; carrying it needs a crafted vessel.
- Wet garments lose warmth garment by garment; wet feet at frost risk
  frostbite, which can cost toes.
- A fire under a roof needs a hearth with a smoke hole (a sub-project 2
  build); a fire inside a closed cabin without one fills it with smoke and
  can kill a sleeper.
- Structure: one mechanic per module (`water.ts`, `clothing.ts`, `fire.ts`,
  `hazards.ts`), composed by `stepPlayer`, `stepCamp` and `hourlyEvents`;
  warmth stays the single integrator.
- The runner gets four behaviours a competent person has without being
  told: shelter from a storm, bank the fire before leaving camp, drink when
  thirsty, and in winter head home so as to arrive by sunset. It still
  gathers nothing on its own and never refuses an intent.

## 1. Water

### 1.1 The reserve

`Player.water`, litres, 0 to `WATER_FULL = 3.0`. A new game starts at 2.5.

Loss per hour by activity, the same `Activity` buckets `stepPlayer` uses:

| activity | l/h  |
|----------|------|
| sleep    | 0.10 |
| rest     | 0.10 |
| light    | 0.15 |
| walk     | 0.25 |
| heavy    | 0.35 |

Times 1.3 when the felt temperature is above 20 C or below -10 C. Times
1.2 while sick. Overloaded walking (over `PACK_COMFORTABLE_KG`) uses the
heavy rate.

Effects:

- Under 1.0 l: warning "You are thirsty." once per crossing; `workSpeed`
  times 0.8.
- At 0: health drains 4 per hour; `Drains` gains `thirst`; `causeFrom`
  names `"thirst"` when it is the largest drain; the death line is "Thirst
  took you."

### 1.2 Drinking

Instant, like eating. `drink(state, world)` fills `water` to full from the
first of: a vessel in hand with unfrozen water, the source under foot. A
source is a cell for which `watersideCell` is true, and the ice is under
`ICE_SHORE_CM = 2` (section 1.6). Thicker than that the shore is iced over:
the button reads "iced over" and the log says "The shore is iced over."
once per crossing of the threshold while you stand there.

`autoDrink`, on by default beside `autoEat`, drinks at 1.0 l when a vessel
or the source under foot allows.

### 1.3 Melting snow

A task `melt`, group camp, "Melt snow", 15 minutes, needs a lit fire at
camp and `snowCm >= 1`. On completion it burns 1 kg of firewood from the
fire's fuel (the task cannot start if the fire holds under 1 kg) and yields
1.0 l: into the player first, then into vessels in the pack, the rest is
lost. Repeatable. Trains nothing.

### 1.4 Vessels

Two new tools, in `TOOLS` and `ToolId`, with a `litres` field on the
`Tool` instance (0 when empty) and a `frozen` flag:

| tool       | holds | recipe                                  | minutes | needs  |
|------------|-------|-----------------------------------------|---------|--------|
| barkBucket | 2 l   | 4 bark, 1 cordage                       | 20      | knife  |
| waterskin  | 3 l   | 1 kg hide, 1 sinew                      | 60      | needle |

Instant buttons: "fill" at a source (fills every vessel), "drink" (section
1.2). A vessel is a tool, so it weighs its own mass plus its water at 1 kg
per litre in `carried`.

Freezing: each minute at ambient under `FREEZE_C = -5`, a vessel's water
freezes unless the player is walking or working (body heat in the pack) or
stands by a lit fire. Frozen water is not drinkable. "Thaw" is a 10-minute
task at a lit fire. When a bark bucket freezes while more than half full it
splits one time in three: durability to 0, water lost, log "The bucket has
split in the frost." A waterskin never splits.

### 1.5 The runner

A body need `thirsty`, checked after `hungry`: holds under 1.0 l. Steps:
drink from a vessel or the source in reach (instant); else walk to the
nearest shore cell in this region that is not iced over; else, in winter
with a lit fire at this region's camp and snow on the ground, walk to camp
and `melt`; else nothing, the work goes on. Provisioning at camp also fills
vessels from the camp's source when camp is waterside.

### 1.6 Ice

Lakes and the sea's inlets freeze. `Weather.iceCm`, one thickness for the
world (regional differences are out of scope), moves once a day at the
weather roll from the day's mean ambient: thickness squared grows by 7.2
per freezing degree of the day's mean, the way real ice does, so it
thickens fast when thin and slowly when thick; it melts 2 cm per degree
above 0, never below 0. At 62 N this gives walkable ice from roughly
December to April.

| ice           | water cells                                              |
|---------------|----------------------------------------------------------|
| under 5 cm    | impassable, as today                                     |
| 5 to 15 cm    | thin: passable at speed share 0.8, each cell risks a fall |
| 15 cm and up  | safe: passable at 0.8, no risk                            |

Routing: `findRoute` gains a flag `ice: "none" | "safe" | "thin"`. Walk and
go buttons route with `"safe"` by default; when a `"thin"` route exists
and is shorter, the Region panel offers a second button, "across the ice
(N cm, thin)", whose detail states the risk. The runner never routes over
thin ice; `resolveCell` and its walks use `"safe"`.

The fall: each water cell stepped onto with thin ice rolls
`(15 - iceCm) / 10 * 0.1` (10 percent per cell at 5 cm, 1 percent at 14).
Falling through: 60 percent drown, `DeathCause "drowned"`, death line "The
ice gave way. The lake kept you." Otherwise you climb out onto the nearest
land cell along the route: `wetness` 100, every garment `wet` 100, warmth
minus 30, energy minus 20, the walk ends there, log "Through the ice. You
crawl out soaked and shaking." (bad). Whether you live is the roll; what
kills you afterwards is section 2 and the cold.

Thaw while across: routes are computed when a walk starts, so ice that
melts under the threshold after you crossed simply leaves no route back
("no way there on foot") until it refreezes. Ice that drops under 5 cm
while you are standing on a water cell rolls the fall every minute you
stay. The clock line shows "ice N cm" whenever it is above 0; the map draws
crossable ice with `=` in place of `~`, thin ice dim and safe ice bright.

## 2. Clothing, wetness, frostbite

### 2.1 Per-garment wetness

`Garment.wet`, 0 to 100. Rain and snowfall wet the outer layer first: coat,
hat, boots, mittens take the full rate; trousers half; the blanket only
while in use (`bedded`). Rates per minute in the open: light rain 1, heavy
2, snowfall a quarter of rain and capped at `SNOW_DAMP_MAX`; under a
lean-to, in a cabin or by the fire none. Wet garments dry:

| where                                                  | points/hour |
|---------------------------------------------------------|-------------|
| by a lit fire at camp, camp task, whatever the weather   | 20          |
| in a cabin, whatever the weather                         | 5           |
| under a lean-to, dry weather, or the open, dry weather   | 5           |
| under a lean-to, rain or snowfall                        | 0           |
| rain or snowfall in the open                             | 0           |

`insulation()` scales each garment: wool keeps `1 - 0.5 * wet/100`, hide
`1 - 0.67 * wet/100`, the blanket is unaffected in the pack. The body's
`Player.wetness` stays the skin number and now rises only through a soaked
layer: the existing rain term applies times the mean `wet/100` of coat and
trousers, so a dry coat keeps you dry for the first hour of rain.

Wear while wet is 1.5 times.

### 2.2 Cold feet and hands

Feet are cold when the felt temperature is under 0 and the boots are wet
over 50 or worn under 25, or there are no boots. Hands are cold under -10
felt without mittens or with mittens wet over 50. Each hour with cold feet
or hands rolls frostbite:

| felt          | chance per hour |
|---------------|-----------------|
| -5 to -15 C   | 2 percent       |
| under -15 C   | 6 percent       |

`Player.frostbite: { feet: number; hands: number }` in minutes, 3 days
each. While it holds: feet, walking speed times 0.6 and heavy work 0.7;
hands, crafting spoil chance doubled and hunting and fishing odds halved.
It counts down only during hours under a roof with a lit fire at camp;
anywhere else it holds. A second roll succeeding while the first is
unhealed is loss: `Player.toes` or `Player.fingers` set true, permanent
walking speed 0.85 or permanent craft and hunt factors 0.9, log "You will
not get those toes back." Warnings: "Your feet are numb." and "You cannot
feel your fingers." once per crossing.

## 3. Wood, fire, smoke, storm

### 3.1 Wet wood

New kg item `wetFirewood`. `split` yields wet firewood when it rains where
you split, or when the log has lain in rain: piles track `wetSince` per
log stack is overkill, so the rule is the region's: `RegionState.logsWet`
minutes, set to 0 whenever it rains on the region and counting up in dry
weather; logs split within 6 hours of rain are wet. Wet firewood dries to
firewood at 2 kg an hour in total, from the camp pile and the pack of
anyone standing at camp, beside a lit fire or under a roof; 0.5 an hour
otherwise in dry weather, an unsheltered camp included, none in rain.
Drying is per pile, in `stepCamp`.

`RegionState.fire` gains `wetKg`. `feedFire` takes dry first when both are
in reach; `autoFeed` the same. The fire burns both at 3 kg per hour in the
ratio held. While `wetKg > fuelKg / 2` the fire's felt-temperature bonus is
halved and it counts as smoking for section 3.3.

### 3.2 Fire and weather

Lighting needs dry firewood. In light rain or snowfall `light` takes 20
minutes and fails one time in three ("The tinder will not catch."), the
firewood spent either way. In heavy rain it cannot start without a roof
over the pit: a lean-to at camp counts, a cabin's hearth (sub-project 2)
counts; the reason is "too wet to light". A lit fire loses fuel at 6 kg per
hour in heavy rain and 4.5 in snowfall or light rain, and goes out at once
in heavy rain when under 2 kg.

### 3.3 Fire spreading

Dry ground: summer or September, and `Weather.dryDays >= 3` (days since
rain, kept on the weather). A lit fire with over 12 kg of fuel and no one
at camp for over 2 hours (`RegionState.fire.unattended` minutes) rolls 2
percent per hour to spread: the region loses 10 to 30 `wood`, the lean-to
and the bough bed burn if present, the fire is out, log "Smoke on the wind.
The fire has spread from camp." (bad). The runner banks the fire before it
walks off camp (section 5), so this is a hazard for a fire left by hand.

### 3.4 Smoke and carbon monoxide

The fire pit is outdoors. A lean-to takes warmth from it as today. A cabin
is closed: `feltTemperature` gives a cabin no fire term until the region has
`structures.hearth` (sub-project 2 defines the build; this spec adds the
field, false, and the rule). `light` at a camp with a cabin lights the pit
outside as today; a second option `lightIndoors`, group camp, "Light a fire
indoors", exists only when a cabin stands and no hearth does, with the
detail "no smoke hole: the cabin will fill with smoke". It lights
`fire.indoors = true`.

While an indoor fire burns without a hearth, `RegionState.smoke` rises 20
per hour, and falls 30 per hour when the fire is out or the player is not
at camp. Above 40 while at camp: `workSpeed` 0.7 and hunting odds 0.5;
warning "The fire is smoking the place out." Sleeping at camp above 60:
health drains 25 per hour, `Drains.smoke`, cause `"smoke"`, death line "The
smoke took you in your sleep." The first such hour logs "The air is thick.
You wake coughing." Wet wood counts as an indoor fire's smoke times 1.5. The
runner never lights indoors.

### 3.5 Storms

The daily weather roll adds a storm: probability 4 percent in spring and
autumn, 8 in winter, 2 in summer. `Weather.storm: { until: minute } |
null`, 6 to 18 hours, starting 1 to 3 hours after the roll. One hour before
it starts: log "The sky is closing in from the west." (bad). During a
storm: precipitation heavy, felt temperature -6 C for wind, garment wetting
doubled, hunting odds halved, `fish` and `chop` refuse with "too rough".
The clock line shows "storm, N h left".

## 4. The body

### 4.1 Burn by ground and load

Walking burns `300 / TERRAIN_SPEED[terrain]` per hour on the ground under
foot (bog 429, rock 400, fell 600), doubled again in deep snow; overloaded
adds 50. Hauling a load counts as heavy work while the pack is over the
comfortable limit. Felling and building are heavy as today.

### 4.2 Exhaustion and odds

| energy   | hunt and fish odds | craft spoil chance | axe injury per tree |
|----------|--------------------|--------------------|---------------------|
| 30 and up| as is              | as is              | 1 percent           |
| under 30 | times 0.75         | as is              | 2 percent           |
| under 20 | times 0.5          | doubled            | 3 percent           |

Recovery: a `rest` under energy 20 restores 4 per hour instead of 6.

### 4.3 Warnings and deaths

New warnings, once per crossing: thirsty, iced over, feet numb, fingers
numb, smoking the place out, air thick, sky closing in, dry ground ("The
ground is tinder dry." on the third dry day), thin ice ("The ice is thin
here." on stepping onto it). New `DeathCause` values: `thirst`, `smoke`,
`drowned`. The death screen adds the last three log lines before
the death so the cause reads as a story.

## 5. The runner

Four rules in `body.ts`, each through ordinary tasks or instant actions:

- `thirsty` (section 1.5), after `hungry`.
- `storm`, before `hungry`: holds from the warning until the storm ends.
  Walk to this region's camp; keep the fire fed if lit (instant, from dry
  wood in reach); then `rest` under the roof, or `sleep` when the sleep
  need also holds; when it passes, the work resumes. No roof: it still goes
  to camp for the fire.
- Home before dark, winter only: when the walk from the work cell to camp
  would end after sunset, the runner starts it at sunset minus that walk's
  minutes and takes the night rule from there. Days are short; this is most
  of the winter day.
- Banking the fire: in `walkTo`, when leaving the home camp with a lit fire
  over 6 kg, move the surplus back to the camp pile as firewood (instant).

The cold need's `campCanWarm` counts an indoor fire only with a hearth.

## 6. UI

- A Water bar under Food; "thirsty" tag under 1.0 l.
- Each garment line: a second small bar for wet, the word "wet" over 50
  and "soaked" over 80; boots and mittens show "feet cold" or "hands cold"
  in the warning colour when section 2.2 holds.
- The fuel bar splits into dry and wet shades; the fire line says "smoking"
  when it is.
- Clock line: "storm, N h left"; "tinder dry" on dry days in fire season;
  "ice N cm" in the frozen months. The map draws crossable ice as `=`.
- Region panel: a second walk or go button "across the ice (N cm, thin)"
  when a thin-ice route is shorter than the land route.
- Instant buttons: drink, fill; tasks: melt snow, thaw, light indoors (with
  its warning). Recipes: bark bucket, waterskin. Intents list: Melt snow and
  Thaw under Camp.
- Set-aside and death screens unchanged except the story lines.

## 7. Persistence

New fields get defaults in `fillDefaults`: `water` 2.5, `frostbite` zeros,
`toes` and `fingers` false, `autoDrink` true, garments' `wet` 0, tools'
`litres` 0 and `frozen` false, region `logsWet` a day, `fire.wetKg` 0,
`fire.indoors` false, `fire.unattended` 0, `smoke` 0, `structures.hearth`
false, weather `dryDays` 0, `storm` null and `iceCm` 0. `SaveFile.version` stays 3.

## 8. Tests

Table tests per module on the numbers above. Scenario tests through
`advance`:

- A working day without drinking ends thirsty; by day three, dead of thirst,
  with the warning logged first.
- A winter day at camp melts snow at a firewood cost and keeps water up.
- Wet boots at -10 C felt produce frostbite within a night; eight roof and
  fire hours a day heal it; a second frostbite unhealed costs toes.
- Wet wood halves the fire's warmth term; a heavy-rain fire under 2 kg dies.
- A 20 kg fire left in a dry August with no one at camp spreads within a
  day; the log line appears; a banked fire does not.
- An indoor fire without a hearth: coughing at 40, the warning at the first
  sleeping hour, death by smoke if slept through.
- A storm: the warning an hour ahead, the runner walks home, rests under
  the roof, feeds the fire, and returns to the work when it ends.
- Winter: the runner leaves the work so as to arrive at camp by sunset.
- Exhaustion under 20 halves hunt odds and doubles spoil (deterministic rng).
- Ice: a -10 C fortnight makes safe ice; a walk across thin ice at 6 cm
  falls through within a few cells with a seeded rng, and the survivor
  stands soaked on the nearest shore; a lake crossed at 16 cm has no route
  back once a warm week melts it under 5; the runner's routes never touch
  thin ice; the shore reads iced over from 2 cm.
- Save round trip of every new field; a version 3 save without them loads.

Then a browser pass: a spring day on seed 17 with a storm forced from the
console (`state.weather.storm`), watched through the walk home and back.

## 9. Out of scope

- Wading and river crossings in open water; ice thickness per lake.
- The hearth, woodshed, covered pit and water storage builds (sub-project 2).
- Insects, infection of wounds, disease from food (sub-project 4).
- Fog, getting lost, snow load on roofs, wind damage (sub-project 5).
- Any planning by the runner beyond the four rules in section 5.
