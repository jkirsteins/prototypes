# Survidle: the year loop, sub-project 1 of 3

The survivor loop does not close. The first survivor dies inside two
months, which is the design; the heir dies the same way in the same
band, which is not. The roadmap
(`2026-09-03-survidle-realism-roadmap.md`, "F. The survivor loop") wrote
the heir gate's 1 of 4 down as "the expected reading for a fresh heir"
until the Lineage tree's carry lands. Measured on main bcaebb2 on
2026-09-05, that expectation is wrong: carry moves the delegation clock
and adds no calories, and nothing the sim can hold reaches a year.

This is the first of three sub-projects toward a survivable year, each
with its own spec, plan and gate:

1. **This one.** Close the year with the pieces already in the tree, and
   measure the heir trend on top of it.
2. **The tables audit.** Every band and constant in the yield tables and
   the burn model checked against a real source and corrected where it
   is wrong, in either direction, with the year probe saying what each
   correction moved. Flags for it are gathered in section 8.
3. **The missing tier.** Whatever the probe still names as the cause of
   death after 1 and 2: the net, the cellar, the smokehouse, the elk
   chain. Specced when 2 says which.

## Decisions confirmed with the author

- **Heirs inch toward living longer.** More than one iteration is fine;
  each run must feel better. The gate is a trend across lives, not a
  step between two.
- **Do all three sub-projects, in order.** Nothing here is a substitute
  for the audit or the tier content.
- **No magic numbers.** A value may never be bent to reach a goal ("we
  can't put kcal burn to 50 a day even if that achieves our goals").
  Every balance change is argued from the real north first, then
  measured. If the realistic number does not close the gap, the answer
  is a missing rule or missing content, and the spec says so.
- **A sole survivor cannot meaningfully deplete fish or hare
  populations.** Producers keep running while nobody is home; regrowth
  and movement are what keep the heir's region whole. Untended snares
  do not stop.
- **The rack stands two years and the lean-to one.** This replaces the F
  core decision that a lean-to falls after a season; the rack at 90 days
  could never be inherited across a 90-day gap.

## 0. Measured before

All numbers from throwaway probes on main bcaebb2, 2026-09-05. The
scripts were not kept; section 1 makes them a script.

`npm run reference -- --heir 17 19 42 79 250`: the first lives starve
on days 52, 49, 34 and 37; the heirs land 2 to 20 August, walk to the
old camp on day 1, and starve on days 32, 59, 29 and 46. Heir gate 1 of
4.

A kitted camp with every producer (`kitOut`), all six skills set to a
level with `setSkillLevel`, the reference list, from 1 April to 365
days:

| seed | skills 1 | skills 10 | skills 20 |
|---|---|---|---|
| 17 | starved day 62 | starved day 67 | starved day 73 |
| 19 | starved day 53 | starved day 113 | starved day 129 |
| 42 | starved day 45 | starved day 57 | starved day 57 |
| 79 | starved day 42 | starved day 52 | starved day 48 |

With the felling grind taken off the list, seed 19 reaches day 190
(froze, 7 October) at level 10 and 213 at level 20; the other seeds
move by a few days. Seed 19 is carried by 2,000 kcal a day of berries in
season and dies soaked in cold rain while picking them.

The home region's populations over seed 17's first life and the gap:
perch 38 of 54 at landing, 21 at the death on day 52, 12 when the heir
lands 90 days later; hares 77 of 109, 45, 21. Seed 19, whose first life
set no trap: hares 95, 67, 29. Fish regrow at 0.003 a day and only in
months 3 to 8.

The hunt keep on a level-20 camp: 17 kills by day 40, none of them
large game, since "hunt anything" draws by how likely a species is to
be met and shoots willow grouse and squirrels at 0.2 to 0.4 kg. The ten
kit arrows are gone by day 20 at a 50 percent loss per miss, and the
arrow keep sits on cordage.

A kitted level-20 camp with a turf hut, 80 kg of dried meat and 300 kg
of firewood from 1 December: dead on days 15 (thirst, the store
frozen), 26 (froze), 13 (froze) and 6 (froze in the cold snap with the
fire lit), every one with 0 kg of firewood left. The fire burns 3 kg an
hour in any shelter. Snow reads 79 to 271 cm by late December.

The yield tables (`src/sim/tables.ts`) put a beginner's total at 200 to
800 kcal a day in April and 700 to 1,500 in late August against a burn
of 2,500 to 3,500; the experienced tier straddles burn and its
large-game row (300 to 1,500) is what carries it. Nothing reaches that
row.

## 1. The instrument and the gates

### 1.1 `npm run year`

`scripts/year.ts`, on demand like reference and horizon, about a
minute, not part of `npm test`. It runs the best survivor the sim can
hold: `setUpReference(seed, true)` with `kitOut` and every producer,
all six skills at 20, the reference list, from 1 April to 1 April on
the four reference seeds. It prints per seed:

- the death day and cause, or "alive on 1 April";
- the week before the death as `weekLines` prints it;
- one line per month on the first of the month: kcal eaten and burned
  a day over the month, and the stock at camp (kcal of food by kind,
  kg of firewood, logs);
- the day the list first reached the surplus tier: the first hang and
  the first large-game kill.

Flags: `--level=N` sets the skills (default 20); `--fresh` starts from
the arrival kit alone at level 1, which is the reference run to a year;
`--winter` is section 1.3; `--start=<doy>` as the other scripts.

The kitted level-20 survivor is a diagnostic, not a claim about players.
The survivor ladder puts a full year at rows 4 to 6, reached by a
lineage. The point of the gate is the contrapositive: if this survivor
cannot live a year, no lineage can.

### 1.2 The year gate

Alive on 1 April on 4 seeds at level 20. Once green, the descent is the
ramp made measurable: the lowest `--level` that passes, then `--fresh`,
each written into the roadmap as a reading and none of them a gate in
this sub-project.

### 1.3 The winter gate

`--winter` kits the level-20 camp with the winter stock section 4
implies (a turf hut, 80 kg of dried meat, 400 kg of firewood, 150 logs
at camp) on 1 December and runs to 1 March. Gate: alive on 1 March on 4
seeds.

As built, `WINTER_START_DOY` is 334, not 335: the day of year is 0-based,
so 1 April is 90 and 1 December is 334. The probes behind section 0 were
written against 335 and so opened a day late.

### 1.4 The trend gate

`runHeir` runs three lives instead of two, `--heir` printing per life
the landing date, what was found (structures, snares, the trap, logs,
firewood, food kcal, tools), the surplus day, and the death day and
cause. Gate: each life's death day at or past the one before, on 3 of 4
seeds. A May landing after an autumn death and an August landing after
a spring death are different games, so the report names the landing
month beside every death day and the gate is read as a trend.

### 1.5 The order of work

The instrument lands first, so every later section is measured by it.
Then sections 2, 3, 4, 5, each closing with the year script's reading
written into the roadmap the way the calibration pass wrote its own.
Each section's death cause is the next section's subject.

## 2. Populations

### 2.1 Fish: capacities from biomass

`src/sim/species.ts` gives perch 40 per square kilometre of lake and
pike 8. A boreal lake carries perch at 10 to 50 kg a hectare, 60 to
100 g a fish, which is 15,000 to 80,000 a square kilometre, and pike at
10 to 20 kg a hectare at about a kilo, 1,000 to 2,000 a square
kilometre. The sim is low by a factor of a few hundred to a thousand,
and that is why one spear and one trap emptied a shore in fifty days.

Every fish's habitat number is rewritten as biomass per hectare divided
by mean weight, lake and sea species alike, with the source in the
comment beside it. Growth stays 0.003 a day: recruitment in a cold lake
is slow, and at these counts it does not matter. Density then sits at
1 for a whole life and what moves fishing odds is skill, season, night,
the read shore's lie, and never the survivor's own take. A small pond
stays fishable down, which is true; the read line may say so.

The trap's dawn draw and the spear take one fish each as today.

### 2.2 Small game: movement, not growth

Hare habitat gives about 6 a square kilometre on seed 17's region, and
growth of 0.006 a day over March to August is a two to four times yearly
increase. Both match mountain hares in Fennoscandia and both stay. What
is unreal is that a region is one pool of about 13 square kilometres
and a snare line takes from it as if the far side and the six
neighbours never sent anyone. Hares disperse kilometres and a vacated
range refills in weeks.

The migration step in `dailyAnimals` (outflow at `MIGRATION` 3 percent
a day toward neighbours with room) is replaced for small game by an
inflow rule: each day a region below its seasonal capacity receives,
from each neighbour, animals in proportion to its own gap and the
neighbour's density, at a rate `SMALL_GAME_INFLOW` set so that a region
emptied to half refills to nine tenths in about thirty days of summer
with neighbours at capacity. It runs in every month, since hares move
in winter too, and it never takes a neighbour below the receiving
region's density. Hare, squirrel, and the grouse take the rule; deer,
elk, reindeer, fox and the predators keep the migration they have,
because game hunted out over years is roadmap items 4 and 6.

### 2.3 What stays

Snare odds stay at 0.3 a night per snare and are flagged for the audit
(section 8): likely high against real snare lines, and a cut belongs
where it can be argued with a source.

Producers run through the gap unchanged: the snares catch and the trap
fills, per the ruling. One rule for honesty: the trap's catch rots at
`SNARE_CATCH_MAX_AGE` like the snare catch does, so no heir inherits
five kilos of ninety-day-old perch. The trap keeps drawing after its
catch rots, as a baited basket does.

### 2.4 Tests

- A reference life on each of the four seeds leaves its home shore's
  fish density above 0.9 at the death.
- A hare region emptied to half with nobody home refills to 0.9 within
  thirty days from 1 June, neighbours at capacity; and does not refill
  when the neighbours are as empty.
- The trap's catch is gone two days after it was drawn with nobody
  emptying it.
- Each fish capacity constant is pinned in `tests/species.test.ts`
  against the per-hectare figure its comment names.

## 3. The hunt chain

A year is one arithmetic: an elk is 150 kg of meat and 8 kg of fat,
about 300,000 kcal, a hundred days of burn. Two elk or four reindeer
and a roof is a winter. Today an elk cannot be aimed at, and if it fell
it would rot in 36 hours beside a rack that dries 6 kg every two days.

### 3.1 Large game by name, at level

The reference list gains a keep per large species, ranked below the
small-game keep: "hunt elk, keep camp at 40 kg raw meat", the same for
reindeer and roe deer. The player script (`ReferencePlayer`) gives a
want only when the survivor's Hunting is at the species' recommended
level (`RECOMMENDED["hunt:elk"]` and kin, from `SPECIES_DEFS[s].hunt
.level`), since a competent player does not walk at an elk at level 1.
The fresh survivor's list is unchanged in effect, and the level-20
diagnostic reaches the row the tables say carries a year. A directed
elk hunt at level 8 is four hours at about 25 percent, an elk in two
days of hunting, which is what a skilled subsistence hunter gets in the
rut. Odds, injury and yields are unchanged.

As built, the named hunts are grinds rather than "keep camp at 40 kg raw
meat", and they sit with the hang grind below the hut group and the
400 kg woodpile keep, before the felling grind. A keep on raw meat with
the hang grind above it never reads met: the rack takes the raw meat, the
keep sees the camp short again and the named hunt never ends, which
starved the axe, the hut and the trough. Shelter and water come before
the surplus loop. The horizon harness (`setUpStage`) filters its wants
through `wantOpen` too, so a stage sees the same list the reference
player would at that level and date.

### 3.2 The rack is a real rack

A pole rack holds what you build: strips a centimetre thick run 5 to
8 kg a metre of pole, so four two-metre poles are 40 to 60 kg.
`RACK_MAX_KG` goes from 6 to 40. A second rack can be built at the same
camp (`structures.dryingRack` becomes a count, capped at 2, with
`rack.kg` against `RACK_MAX_KG * racks`); the build recipe and hours are
the same per rack. Drying stays `RACK_DRY_MINUTES` (48 h) in dry weather
and stretches to 96 h while it rains, read from the weather each hour
the way the fire's burn already is.

The "hang meat" want becomes a grind: hang whatever raw meat is at camp
while the rack has room. The stock is whatever that made. Dried meat
keeps a month in the open (F's decay rule as built) and does not age at
or below 0 C (the stack rule as built), so an October stock is a winter
stock without a store. The cellar and the smokehouse stay sub-project
3's.

### 3.3 Arrows and cordage

Arrow loss stays at half a miss below mastery 20, honest for brush. The
list's cordage keep goes from 4 to 8: arrows, snares and the bucket all
draw on it and the probe shows the arrow keep starving on it. Nothing
else changes; the recipe and `provisionKit` already work once the
material is there.

### 3.4 The kill is hauled, not eaten raw

An elk lies where it fell and is hauled in 35 kg loads by the machinery
that exists; the hunt keep's "bring it to camp" is the same haul the
felling grind uses. `AUTO_EAT_ORDER` already excludes raw meat and raw
fish; a test pins it (`tests/species.test.ts`). Seed 42's fever was not a
raw-meat death. Meat at or below 0 C does not age, which is why an autumn
kill keeps overnight and a July one races the rack.

### 3.5 Tests

- A level-20 survivor's list carries the elk want and a level-1
  survivor's does not.
- The rack accepts 40 kg; a second rack stands and doubles it; drying
  takes 96 h in rain.
- A 150 kg kill at camp, hung by the grind over four dry days, leaves
  dried meat within 10 percent of 150 divided by the 3-to-1 ratio.
- Auto-eat with cooked meat at camp never takes raw meat.

## 4. Autumn and winter

### 4.1 Fuel by shelter

`BURN_KG_PER_HOUR` is 3 in any shelter: right for an open fire, wrong
for a hearth inside walls. A hearth in a turf hut kept through a winter
night is 15 to 30 kg a day, and Nordic households with a stove burned
4 to 8 tonnes a year. `burnPerHour` takes the shelter: 3 kg an hour in
the open or under a lean-to, 1.2 in a turf hut, 0.8 in a cabin, with the
rain multipliers as today for an unroofed pit only. A hut winter is
then about 3 tonnes of firewood, 150 logs, two to three hours of axe
work a day.

### 4.2 Inside is a temperature

`shelterBonus` adds 10 or 15 degrees to the outside air, so a hut at
-30 C is a hut at -20. A turf hut with a lit hearth stays above
freezing at -30 outside, and a chinked cabin sits at 10 to 15 by the
fire. `feltTemperature` gains a floor: at camp on a camp task inside a
walled shelter (`turfHut` or `cabin`) with the fire lit, the ambient
term is at least `INDOOR_C[shelter]`, 5 for the hut and 10 for the
cabin, before clothing, fire warmth and activity are added. The bonus
stays as it is for the lean-to and for a walled shelter with the fire
out. Clothing keeps deciding everything outdoors.

### 4.3 A competent list has a winter

From 1 September the reference list wants `keep camp at 400 kg
firewood` in place of 60; the player script swaps the want by the
date. The fill keep melts snow at the fire when the shore is iced and
no hole is cut, the way `drinkStep` already falls back to `melt`, so a
frozen store is refilled. Both apply to the fresh survivor's list too.

As built, the woodpile want opens on day of year 244 and closes on day 90
(`WINTER_WOOD_FROM_DOY` and `WINTER_WOOD_TO_DOY`): the thaw begins with
April, and a spring survivor should get a roof over its head before a
winter's pile of wood.

### 4.4 Wet and cold is cold sooner

The cold need in `bodyStep` reads wetness: soaked (`wetness` above 60)
with the ambient under 5 C counts as cold at warmth 45 (`WARM_AT`)
rather than 30 (`COLD_UNDER`), so the runner turns home, lights the
fire and dries under the roof before it is shivering at 6. Hypothermia
in wet clothes near freezing is an hour or two.

### 4.5 Tests

- `burnPerHour` per shelter pinned; a banked fire in a hut lasts the
  night on `BANKED_KG`.
- Felt temperature inside a hut at -30 C with the fire lit, in wool,
  holds warmth above 20 asleep.
- The fill keep at an iced shore with snow on the ground melts and the
  store rises.
- The wet-cold need fires at warmth 45 when soaked at 2 C and not when
  dry.

## 5. The heir trend

### 5.1 What the heir inherits

After sections 2 to 4: a region at capacity; the fire pit, the snares,
the trap, the rack, the hut if there was one; the logs, now a winter's
fuel; tools at the death site, which every reference ancestor put
within a kilometre of camp; the ancestor's orders, since orders belong
to the camp. The heir walks home on day 1 as the reference heir does.
Every want on the list's first twenty days is then already met, so the
heir's list starts at the surplus tier on its first morning.

### 5.2 Decay

`STRUCTURE_LIFE_DAYS` becomes lean-to 365, drying rack 730, turf hut
540 as today. The "needs re-roofing" and "needs relashing" lines and
the repair task move with the two-thirds rule already built.

Both numbers stand as built. One consequence to know: `structureAge` for
the rack is one clock shared by both racks at a camp, so building the
second resets the first one's age. The alternative is an age per rack,
which the decay rules do not carry today.

### 5.3 What the player sees

Two lines, both read from the life record and not from the world, so
the heir knows what the journal can tell them and not what they have
not walked to:

- The first log line gains what the record's `built` events say:
  "Veikko Urbonas's journal says he built a fire pit and a rack at
  Hareskog and set five snares." Snares are read from the record's
  build events too; if nothing was built the clause is omitted.
- The tombstone gains the comparison under the day: "Day 59. Veikko
  Urbonas lived 49." The first survivor's tombstone has no line.

### 5.4 Tests

- The three-life heir report on seed 17 prints three lives, each with
  its landing month, its found list and its surplus day.
- The two record-read lines as golden strings on seed 17.
- The rack stands at 200 days and is gone at 730; the lean-to at 200
  and gone at 365.

## 6. Browser pass

Seed 17 at 200x, per `docs/ux.md` at 1440 by 900 and 390 wide: a rack
holding 40 kg with the hang grind running; the hut in December with the
fire lit and the firewood keep at 400 kg; the fill keep melting snow at
an iced shore; the landing line quoting the journal; the tombstone with
the ancestor's day beside the heir's.

## 7. Docs and bookkeeping

- `README.md`: `npm run year` beside reference and horizon, with its
  flags and gates.
- The roadmap's build order: this item as the next slot after siting,
  with the readings of section 0 as the "before" and each section's
  reading as it lands.
- The F section's line saying 1 of 4 is expected until carry lands is
  replaced by what section 0 found.
- The capability spine: the rack row's "6 kg at a time" becomes 40 and
  two racks; a row for large game by name is not added, since species
  stay content under methods.
- The memory notes for this session
  (`survidle-no-path-to-a-year`, `survidle-populations-not-depletable`,
  `survidle-no-magic-numbers`) hold the rulings; the roadmap is the
  record.

## 8. Flags for sub-project 2, the tables audit

Found here, not changed here, each with the reading that raised it:

- Snow depth: 79 to 271 cm by late December on the four seeds against
  40 to 60 in the real inland north; `stepWeather` lays 1.5 to 3 cm an
  hour of precipitation and melts only above 2 C. Deep snow halves
  walking and doubles every haul.
- Snare odds at 0.3 a night per snare.
- Every fish capacity, now with a source, to be checked species by
  species; sea species in particular.
- The hunting row's beginner band, since small game by "hunt anything"
  reads 110 kcal an hour of hunting and the band may be honest.
- The rack's drying time in cold dry air, and whether frozen strips
  count as dried.
- The arrival kit's ten arrows against what a boat would land with.

## 9. Out of scope

The tables audit; the net, cellar, smokehouse and elk-processing
content; the Lineage tree and carry; the corpse run as a directed
search; latitude by row; goals; the beacon; a chosen landing month.

## 10. Measurement and done

Done when: `npm test` passes; the year gate (1.2) reads 4 of 4 at level
20, or the report names the death and this spec's section 8 gains the
flag; the winter gate (1.3) reads 4 of 4; the trend gate (1.4) reads 3
of 4; the April gate stays 4 of 4 at day 26; the browser pass in
section 6 is read; and the roadmap carries every reading. If the year
gate is red after all five sections, the sub-project still lands and
the reading is the opening of sub-project 2's spec.

Measured. All five sections landed and the readings are in the roadmap,
in the F section's "Measured with the year loop" paragraphs
(`2026-09-03-survidle-realism-roadmap.md`), which carry the before
numbers, what each piece moved, and the closing gates. In short: `npm
test` green at 715 tests; the April gate 4 of 4 at day 26; the trend gate
2 of 4 against its 3 of 4; the year gate 0 of 4 at level 20, 10 and
fresh; the winter gate 0 of 4; the browser pass of section 6 read at both
widths with nothing to fix. Three gates are red, and the two deaths they
name are winter thirst at a camp holding an axe and outdoor cold in wool
at -15 to -20 C on a walking task. That is the opening of sub-project 2's
spec, as this section allows for.
