# Survidle: the tables audit

The roadmap's tables audit (sub-project 2 of the year loop) was to be
opened on the flags the year loop and the winter loop left. It opens
instead on two survival handbooks read in full, the Swedish army's
Handbok Överlevnad (1988) and Kochanski's Northern Bushcraft, against
every number the game holds for the body, food, fire and shelter. Where
the handbooks and the game disagree, the game's number moves to the
handbook's, on the standing rule that a wrong number is corrected and
never bent to pass a gate; the gates are then re-measured and, where a
gate was derived from a wrong number, re-derived. Section 0 has the
readings before anything moved; sections 1 to 8 are what the handbooks
say to change; section 10 says what green means.

Two things ride with the audit because the audit makes them necessary.
The trap line and the depletion of big game turn two flat constants
into ramps, and the heir ramp needs the skill carry the roadmap put in
F's later slot, since a lineage gate that asks each heir to live longer
cannot be passed by heirs who inherit nothing but a fire pit. And one
page of manual goes in, because the corrected numbers make the first
days less forgiving than a tester's instincts, and the handbooks are
where the instincts should come from.

Extends `2026-09-05-survidle-year-loop-design.md` (the year probe, its
gates and its section 8 flags), `2026-09-06-survidle-winter-loop-design.md`
(the stocked December camp and its three flags),
`2026-09-04-survidle-calibration-pass-design.md` (the tables as data, the
burn buckets, the gate derived from the reserve) and
`2026-09-04-survidle-idle-curve-design.md` (section 2.4, the carry, and
5.3, the tree per skill).

## Decisions confirmed with the author

- **Correct the band, re-derive the gate.** The day band becomes 3,000
  to 4,500 and the April gate day re-derives from it. Not pinned at 26.
- **All three hare corrections.** Hare kcal, a lean-meat ceiling, and
  snares as a trap line. First lives may starve earlier; that is
  accepted.
- **Fuel and the cold burn both scale with the temperature now.**
- **Big game depletes.** Elk, reindeer, deer and bear draw their region
  down; hares, birds and fish keep the ruling that one survivor cannot
  empty them.
- **The four smaller corrections all go in**: night walking at a third
  of day speed, meat freezing only under -10 C, berries at 450 kcal/kg
  with a 1.2 kg full credit, the indoor water multiplier only on work.
- **Done is all four gates**: April, winter, the year at level 20, and
  the heir gate, which becomes a ramp: each heir plausibly lasts longer,
  and a lineage of up to six lives reaches a year.
- **The skill carry lands here**, as a rule of the world, so the ramp
  has something to climb on. The tree's nodes come later and lift it.
- **The snow shelter goes in; sweat frost waits for E.**
- **The manual is a panel** opened from the landing screen and the
  settings strip, opened once unasked on a world's first landing, with
  four sections and links to the handbooks.

## Sources

- Försvarsmakten, *Handbok Överlevnad*, 1988 (M7734-472091). Full text:
  https://archive.org/download/handbok_overlevnad_1988/Handbok_%C3%96verlevnad_1988_djvu.txt.
  The Nordic army source. Its energy table, water needs, the 500 kcal
  ration, the berry cap, drying and freezing meat, the trap line, the
  lean-to's hours, night marching.
- Mors Kochanski, *Northern Bushcraft*, 1987. Full text:
  https://archive.org/download/northern-bushcraft_202210/Northern%20Bushcraft_djvu.txt.
  Fuel per night by shelter, the bough bed, hare kcal and rabbit
  starvation, frost in clothing, snow shelters, ground temperature under
  snow.
- Unreachable or empty on 2026-09-06: the Norwegian Army's
  *Overlevelseshåndbok for Hæren* (FOBID, regelverk.forsvaret.no,
  returned 503; the forsvaret.no announcement lists chapters only);
  Zawalsky's *Canadian Wilderness Survival* look-inside PDF (chapter
  openers, no figures); the Boreal Wilderness Institute resource library
  (a link index). If the Norwegian PDF turns up, its numbers are read
  against this spec's table and any disagreement is a new flag.

Every constant this spec moves gets the handbook's line in the comment
beside it, the way the fuel-by-shelter comment already quotes its
sources.

## 0. Measured before

The audit was read on origin/main at 3ec48f8 (PR 7) and the branch was
rebased onto c9f1e96 (PR 8, the sleep model) before the build; the
sleep model moved the gates, and both readings are kept because the
audit's findings were made on the first and the build starts from the
second. `npm test` green at 865 tests on c9f1e96.

- `npm run reference` on 3ec48f8: the April gate at day 26 with the
  food clause passes 4 of 4. First lives end on days 41, 207 and 89 by
  starvation, and seed 42 is alive at day 251. The gate week reads burn
  3,339 to 3,781 a day, "over" the 2,500 to 3,500 band on three seeds;
  work 1,637 to 2,019 against its 700 to 1,700 share; snares 771 to
  2,314 kcal a day against a beginner band of 0 to 150, on every seed
  the food the gate is passed on. On c9f1e96 it passes 3 of 4: seed 19
  froze on day 16 with a burn of 4,270 a day (the sleep spec records
  it as the fuel gap's death, item J's), and the others live to 32,
  past 251 and 91; the working day reads 9.4 to 12.2 hours, since the
  sleep model has no count of hours, and sleep 7.9 to 8.0.
- `npm run year` (level 20) on 3ec48f8: 3 of 4. Seed 79 froze on day
  278, 3 January, eating 2,016 against 4,353 a day with 1,256 of it
  walking and 696 in cold. Seed 42 ends the year with 2.2 tonnes of
  fat and 660 kg of dried meat at camp, about thirty elk, on a hunt
  row of 3,921 kcal a day against the expert large-game top of 1,500;
  seed 17 the same shape at 709 kg of fat. Seed 19 is the honest pass,
  alive on 1 February with 3,600 kcal at camp. On c9f1e96 the sleep
  spec reads it at 2 of 4, seeds 17 and 19 frozen on days 306 and 300
  with food at camp, and the year at level 10 at 2 of 4.
- The winter gate reads 4 of 4 on both, and the heir trend 2 of 4 where
  the winter loop left it.
- Snow reads 79 to 271 cm by late December against 40 to 60 real, from
  the year loop's flag.

Two of those deaths are the runner's rather than the world's: a body
that freezes beside a woodpile, or with food at camp, is a runner a
player would have kept alive by hand. Section 10 has the rule for them.

The handbook against the game, the readings that opened the audit:

| quantity | game | source |
|---|---|---|
| a day's burn | band 2,500 to 3,500 | settled survival day 3,000; camp-building day 4,500; hard work 4,400; a week at -30 to -40 C 6,000 (Swedish, energy table) |
| walk with a heavy pack | 250 kcal/h | 545 kcal/h at 4 km/h with 27 kg (Swedish) |
| heavy work | 400 kcal/h | 700 kcal/h for a hard march or heavy work (Swedish) |
| sleep | 70 kcal/h | 70 kcal/h (Swedish) |
| water | 2.4 L/day at rest, 3.3 to 4.8 indoors in winter | 2.5 to 3 L a day, 1.5 lying still (Swedish) |
| food clause | 500 kcal/day | ration 500 kcal a day of carbohydrate, the least that helps (Swedish) |
| hare | 1,500 kcal/kg | about 1,000 kcal/kg; hare alone shows starvation within a week however much is eaten (Kochanski) |
| berries | 500 kcal/kg, 2 kg full credit, refuse at 4 kg | not over 2 L a day, about 1.2 kg (Swedish) |
| open fire fuel | 3 kg/h at any temperature | at -40 C in an open lean-to a 30 cm spruce a night, a pile as long and wide as you are tall and half as high; a teepee a third to a quarter of that; an enclosed shelter with a stove a tenth (Kochanski) |
| hut and cabin fuel | 0.4 and 0.27 of the open fire | teepee 0.25 to 0.33, stove 0.1 (Kochanski) |
| bough bed | flat after 14 days | a fresh layer every three or four days (Kochanski) |
| walking in the dark | 0.75 of day speed | 1 km/h in terrain (Swedish) |
| meat stops rotting | at 0 C | freezing storage needs -10 to -15 C (Swedish) |
| lean-to | 4 h and materials | 3 to 5 h (Swedish) |
| snares | 5 per region at 0.3 a night | a trap line 3 to 5 km long checked at dawn, up to a hundred snares after a few days (Swedish) |

What agrees and stays: the sleep burn, the lean-to's hours, fire by the
first evening and a roof by night two (both handbooks open with fire and
shelter, and the working-day spec's measured rejection of a knife before
the roof agrees), the hut and cabin fuel ratios, the 500 kcal clause as
a number, the thirsty slowdown (3 percent of body weight lost costs a
quarter of work capacity; the game's 0.8 at the thirsty line is that),
lighting failing one time in three in rain, and passive fishing as the
prize (the Swedish text calls the net the most effective method).

## 1. The instrument and the gates

### 1.1 The bands

In `src/sim/tables.ts`:

- `BURN.day` becomes `band(3000, 4500)`: 3,000 the settled survival day,
  4,500 the camp-building day and hard work.
- `BURN.work` becomes `band(1200, 2600)`: the day band less base and the
  warm cold share, so the shares still add up to the day.
- `BURN.cold` splits by season: `band(100, 300)` for a week outside
  December to February, `band(1000, 2000)` inside them. The verdict
  reads the checkpoint's month, since the ledger keeps no ambient.
- `BURN.deepCold = band(4500, 6000)`: the Swedish week at -30 to -40 C.
  The year report prints its verdict on the December, January and
  February month lines beside the burn; it gates nothing.
- `BURN.base` stays at 1,600 to 1,800.

### 1.2 The April gate re-derived

`REFERENCE_TARGET_DAY` keeps its formula, the reserve and the kit over
the worst deficit the tables allow, and reads the new band top:
(80,000 + 5,000 + 3,300) / (4,500 - 200) = 20. The kit's kilo of dried
meat is 3,300 after section 3. The food clause stays at 500 kcal a day
over the week before the checkpoint. The gate is still "alive and fed on
the target day on four seeds"; the day moves because the number it was
derived from was wrong, and for no other reason.

### 1.3 The lineage gate

`runLineage` runs up to six lives per seed and stops early when a life
reaches day 366. A seed passes when any of its lives reaches a year. The
report prints each life's landing, what it found, and its days, then
the seed's days as a line ("52, 94, 172, 366"), and "lineage gate: N of
4 seeds reached a year within six lives". The old trend line (each life
at or past the one before) is still printed for the eye and asserted by
nothing: the author's word for the ramp is "plausibly", and early heirs
dying is the prestige loop. `--heir` on `scripts/reference.ts` runs it
and, as today, never touches the exit code; section 10 is where it
becomes required.

### 1.4 The year report counts kills

The year report gains a line per year of kills by large-game species
(deer, reindeer, elk, bear) and the kcal they were worth, printed beside
the expert large-game band, so section 5's reading is a number.

## 2. The body

In `src/sim/player.ts` unless said:

- **Heavy work 500 kcal/h**, from 400. Axe work by the MET tables (6 to
  7 MET at 72 kg) and under the Swedish 700 for a hard march.
- **The loaded walk.** The surcharge of 50 kcal/h over the comfortable
  limit becomes 150 over the comfortable limit and 300 over the hard
  one, from the Swedish 545 with 27 kg against 240 unloaded. The haul
  task walks at the hard load and pays it.
- **The cold burn grows with the cold.** `COLD_BURN_FACTOR` (a flat 1.3
  under a felt zero) becomes `coldBurnFactor(felt)`: 1 plus 0.02 per
  degree of felt under zero, capped at 2. It reads 1.3 at -15, so the
  April week barely moves, 1.6 at -30 and 2 at -50 and below. A January
  working day then reads near the Swedish 6,000.
- **Water indoors.** In `src/sim/water.ts`, the 1.3 multiplier above 20
  C felt applies only while the activity is light, walk or heavy; a body
  resting or asleep drinks the floor whatever the room. The multiplier
  under -10 stays for every activity, since cold dry air takes water
  from the breath at rest. The Swedish floor is 1.5 L a day lying still.
- **The dark.** Without a lit torch, `baseWalkSpeed` at night is a
  third of day speed, from three quarters; the Swedish figure is 1 km/h
  in terrain. With a torch the night costs nothing, as today.
- **The bough bed** goes flat after 4 days, from 14 (Kochanski: a fresh
  layer every three or four days). The reference list gets a keep that
  lays it again, right after the lean-to: a keep on a structure reads
  met while the structure stands and unmet once it has gone flat, the
  way the light keep reads its flag. Twelve sticks and half an hour
  every four days is the cost, and it is real.

## 3. Food

In `src/sim/items.ts` unless said:

- **Meat 1,100 kcal/kg** raw and cooked, from 1,500. A kill's fat is its
  own item at 9,000, so the meat is lean wild meat: hare about 1,000,
  venison 1,100 to 1,200. **Dried meat 3,300**, from 3,500, so the rack's
  three kilos to one conserves kcal.
- **Berries 450 kcal/kg**, from 500 (wild bilberry, inside the tables'
  400 to 600). In `src/sim/tables.ts`, `BERRY.fullCreditKg` becomes 1.2
  and `BERRY.refuseKg` 2, from 2 and 4: the Swedish "not over 2 litres a
  day", about 1.2 kg, past which the gut turns.
- **The lean ceiling.** `LEAN_KCAL_PER_DAY = 1600` in `src/sim/items.ts`
  and a per-day counter `leanToday` on the player beside `berriesToday`.
  Raw meat, cooked meat, dried meat and cooked fish are lean foods; fat
  and berries are not. Past the ceiling in a day a lean food is not
  edible: the eat action refuses it, auto-eat skips it for the next
  food in its order, and the Do row's reason is "not more lean meat
  today". The log says once per crossing: "Lean meat is not filling
  {you}. {You} {need} fat." Fat and berries are never capped and do not
  lift the ceiling: Kochanski's finding is that the quantity of lean
  meat does not matter, and the game's answer to it is the fat item,
  the fish's own kcal under the same cap, and the berries. Sixteen
  hundred is about 1.5 kg of lean meat, the most a body turns into
  energy in a day before the protein goes to waste.
- **Meat freezes at -10 C.** In `src/sim/inventory.ts`, `ageStacks` ages
  a perishable at the full rate above 0 C, at half the rate from 0 down
  to -10, and not at all under -10 (`FREEZE_KEEP_C = -10`; the Swedish
  "at least -10 to -15 C"). April's nights no longer keep meat, so raw
  meat rots in 36 warm hours unless the cook keep clears it, which is
  the cook-keep flag from the year loop's section 8 made to bite rather
  than a change to the keep.

## 4. Snares as a trap line

The Swedish handbook's small game is a trap line: 3 to 5 km of marked
ground, snares where the tracks cross it, checked every dawn, and a
hundred of them after a few days. Kochanski's hare snare is a lifting
pole on a run. Five snares at 0.3 a night is the same catch as fifty at
0.03 with none of the work, and the work is the ramp.

- `MAX_SNARES` becomes 40, from 5. The Do row's refusal reads "forty
  snares is enough here".
- `SNARE_ODDS_PER_NIGHT = 0.04` in `src/sim/items.ts`, replacing the
  literal 0.3 in `dailyCamp`, still scaled by hare density. Five snares
  read a hare every five days; forty at full density read a hare and a
  half a day, which at 1,100 kcal/kg is about 2,000 kcal, the expert
  traps band's top. A beginner's five read about 260 a day, near the
  beginner band.
- The snare's cost stays: a stick, two cordage, twenty minutes to make,
  six to set, and the dawn walk the snares chore already makes.
- The reference list keeps its opening five-times job and adds a keep
  on the count, "snares set, keep at 20", with the food group after the
  berries keep, and "keep at 40" below the hut, the winter food. A keep
  on a structure count reads met while `structures.snares` is at or
  over the target; the plan checks `orderMet` reads it and the ladder
  gates it under hunting.

## 5. Big game

A hunt already takes one animal off the region (`tasks.ts`, the hunt's
completion). Thirty elk a year come from the refill: `MIGRATION`, 3
percent of every non-small mammal population a day, moves into any
touched neighbour with room, and a hunted range is full again in weeks.
Elk, deer and reindeer hold ranges for seasons and years; a range shot
out refills over a year or two.

- `BIG_GAME: Species[] = ["deer", "reindeer", "elk", "bear"]` in
  `src/sim/animals.ts`, and `BIG_GAME_MIGRATION = 0.003` a day for them,
  a tenth of the predators' 0.03, which wolves and wolverines keep.
  Growth is unchanged; the spring rate already says a herd recovers in
  a year or two from half.
- Nothing else changes in this pass. The year report's kills line
  (section 1.4) reads the result against the expert band of 300 to
  1,500 kcal a day; a second pass on the rate, the odds or the capacity
  is decided on that reading and written into the roadmap, not guessed
  here.

## 6. Fuel, cold and snow

### 6.1 The open fire eats with the cold

In `src/sim/fire.ts`, `SHELTER_BURN_KG_PER_HOUR` becomes an open rate
and two ratios. `openBurnPerHour(ambient) = 3 * (1 + max(0, -ambient) /
10)`: 3 kg/h at zero, 6 at -10, 9 at -20, 15 at -40. Kochanski's -40
lean-to is a 30 cm spruce a night, some 200 kg over a twelve-hour
night, and the game's fire at 15 kg/h is the tended fire of a shelter
rather than the long fire of an open bivouac; the difference is the
lean-to's +5. `SHELTER_BURN_RATIO = { turfHut: 0.4, cabin: 0.27 }`
applies to the open rate, so a hut at -10 burns 2.4 kg/h. The rain
rule (one and a half times, twice in heavy rain, on a fire with no roof)
stays a multiplier on top. `FIRE_MAX_KG` and the low mark stay; the fire
is fed more often, not larger.

The reference list's winter stock is re-sized from the measured burn:
a hut at the winter mean of -9 reads about 2.2 kg/h, 53 kg a day, some
4,800 kg over the ninety days, against the 3,400 kg the list stocks
today (400 kg firewood and 150 logs). The stock moves after the year
probe reads the woodpile on 1 March, and the number lands in
`WINTER_STOCK` with the reading beside it.

### 6.2 The cold burn

Section 2's `coldBurnFactor` is the body's half of this. Together they
say what the handbook's table says: a week at -30 is 6,000 a day and a
fire that keeps it under 6,000 is nine kilos an hour.

### 6.3 Snow depth

The year loop's first flag. In `src/sim/weather.ts`, precipitation lays
a quarter of today's snow: light snow 0.375 cm/h from 1.5, heavy 0.75
from 3. At the day roll the pack settles by 2 percent of its depth. Melting above 2 C stays at 2
cm/h. The year script prints the snow depth on every month line, and
the constants are tuned on it until January reads 40 to 60 cm on the
four seeds; `DEEP_SNOW_CM` at 30 then means what it says.

### 6.4 The snow shelter

Kochanski: pile snow, let it set, dig it out; best under -15 C; the
ground under a good snow cover sits at -3 to -5 C whatever the air; a
floor of boughs and 15 cm of packed snow under it. The Swedish
handbook: the pile freezes together in four or five hours, sticks
pushed in as wall gauges. No tools, no materials, the winter roof a heir
landed in August can actually build.

- `StructureId` gains `"snowShelter"`. `STRUCTURES.snowShelter`: needs
  nothing, 300 minutes, `desc` "A heaped and hollowed drift. Walls of
  snow hold -3 C whatever the night does; no fire inside." It can be
  built only at camp with `snowCm >= SNOW_SHELTER_CM` (40) and no hut or
  cabin standing; the check's reason otherwise is "needs 40 cm of snow"
  or "the hut is warmer".
- It counts as roofed and walled: the rain and snow rules, the wolf
  rule (`sheltered`), wood drying under it as under a hut. It gives no
  shelter bonus; instead the felt temperature at camp on a camp task
  reads `max(ambient, SNOW_FLOOR_C)` with `SNOW_FLOOR_C = -3`, fire or
  no fire, and a fire cannot be lit inside (the `lightIndoors` row
  refuses with "snow does not take a fire"). A pit fire outside still
  adds its 7 to the felt temperature of someone in it. The bough bed
  adds its 4 inside as anywhere.
- It falls in on the third day in a row whose daily mean ambient is
  above 0 C: a `meltDays` counter on the region state, reset by a cold
  day, and the log line "The snow shelter at {name} has slumped." It is
  not decaying in `DECAYING`'s sense and cannot be mended; it is built
  again.
- The reference list gets `job build once snowShelter` right after the
  bough bed keep, so it sits above the hut and below the lean-to; it is
  blocked until the snow is deep enough and closed by `wantOpen` when a
  hut or cabin stands. A heir landed in August has a lean-to by night
  two, a snow shelter the week the snow comes, and the hut when the
  list reaches it.

## 7. The carry

The idle curve spec's section 2.4: carried hours give the level and the
level gives the rung. The roadmap's F puts the carry in the Lineage
tree's Experience branch, a quarter then a half, bought with Lineage
earned by goals. The tree, its goals and its points are not built, and
the ramp cannot wait on them.

- **A heir carries a quarter as a rule of the world.** At death,
  `fillDied` writes the survivor's skill minutes (`xp` per skill, not
  mastery, not the pool) onto the life record. On landing as a heir,
  `land` sets each skill's `xp` to `CARRY_SHARE` (0.25) of the previous
  survivor's. Mastery and the pool start empty, as the tree spec rules
  they are per action. The rung lines fire on the first tick for any
  rung the carried level already opens, so the log says what the heir
  can do from birth.
- The landing log adds a sentence: "{You} {carry} a quarter of what
  {name} knew: Woodcraft 6, Hunting 4." naming the skills at level 2 or
  above. The skills panel reads "carried from {name}" under a skill
  whose carried minutes are still the larger share.
- The tree's carry nodes, when F's lineage lands, lift a skill to a
  half. The quarter is free because row 1 of the survivor ladder already
  promised it, and a heir who inherits a fire pit and nothing of the
  hands that built it is not the prestige loop.
- The lineage harness runs the heir with the carry, as a player would;
  the kitted year probe is unchanged.

## 8. The manual

One page, four sections, two to four lines each, in the game's own
voice, no reading beyond it. The handbooks are linked at the foot for
whoever wants more.

- **Where.** `manualHtml()` in `src/ui/panels.ts`, an overlay like the
  cemetery, with `ui.manual` in `UiState` and `manual-open` and
  `manual-close` actions in `src/main.ts`. A "How to survive" mini
  button on the landing screen beside "next boat", and a "manual" link
  on the settings strip. It obeys `docs/ux.md` at 390 wide: one column,
  controls 40 pixels tall, nothing sideways.
- **When.** `state.manualSeen` in the save, on the world and not the
  life, false in a new world. The first landing in a world opens the
  panel over the game once and sets it; the harness never opens it. A
  heir's landing does not.
- **The text.** Drafted here and edited in the build; the plan keeps
  it to the four sections and their lines.

  *The first days, in order.* A fire tonight. A roof by the second
  night. Water every day, from the shore or a bucket. Then food. Nothing
  else comes before those four.

  *What kills you, and how fast.* Cold kills in hours: wet clothes and a
  night in the open. Thirst kills in days. Hunger takes weeks, but the
  work gets slow long before. The log warns before each: "You are
  shivering hard", "You are thirsty", "You are getting thin". The dark
  is slow going without a torch.

  *Food and the seasons.* Hare alone starves you; you need fat, and
  fish. A trap in the water works while you sleep. Berries are a season,
  and two litres is a day's worth. A deer is weeks of food that rots in
  a day unless you dry it. Winter needs a hut or a snow shelter, a
  woodpile, and stores.

  *Orders and being away.* You give orders; the game keeps them, and
  earns you longer ones as your skills grow. Away is riskier than
  playing: the runner does what you asked and nothing more. Death keeps
  the world. The next survivor lands months later, near the old camp,
  carrying a quarter of what you knew.

  *More.* Försvarsmakten, Handbok Överlevnad (1988), and Mors Kochanski,
  Northern Bushcraft, both free to read at archive.org; the Norwegian
  Army's Overlevelseshåndbok for Hæren (2025).

## 9. Tests

Per-unit tests pin every constant this spec moves, beside the existing
ones in `tests/tables.test.ts`, `tests/player.test.ts`,
`tests/fire.test.ts`, `tests/weather.test.ts` and `tests/water.test.ts`;
the snapshot tests of the reference opening move with the list. New:

- The lean ceiling: a body that has eaten 1,600 kcal of meat today
  cannot eat more meat, can eat fat and berries, auto-eat skips to fat,
  and the counter resets at the day roll.
- Aging at half rate between 0 and -10 and none under it.
- The trap line: forty snares set, the forty-first refused; expected
  catch at full density near 1.6 a night over a thousand rolls; the
  count keep reads met at and over its target.
- Big game: an elk population shot to half refills at a tenth of the
  wolves' rate.
- The open fire at -10 burns 6 kg/h, the hut 2.4; the cold burn factor
  at -15 is 1.3 and at -50 is 2.
- Snow: a day of light snow lays what the constant says, and the pack
  settles 2 percent at the day roll.
- The snow shelter: refused under 40 cm and with a hut standing; felt
  temperature at camp reads -3 with the air at -25 and no fire; a fire
  inside is refused; it slumps on the third warm day.
- The carry: a heir's skill minutes are a quarter of the ancestor's,
  mastery and pool empty, the rung line logged on the first tick.
- The lineage gate: a stubbed lineage whose third life reaches day 366
  passes and stops; one that never does runs six lives and fails.
- The manual: a new world's first landing opens it once and sets the
  flag, a heir's landing does not, the buttons open and close it, the
  panel holds four sections and the links.
- The night walk at a third without a torch, the loaded walk's
  surcharge, the bough bed flat on day 5 and the keep unmet then.

## 10. Measurement and done

The commands, in the order they are read:

    npm test
    npm run reference                      # April, day 20, food clause
    npm run reference -- --heir            # lineage, six lives
    npm run year                           # level 20, snow on the month lines, kills
    npm run year -- --level=10             # reported
    npm run year -- --winter               # the stocked December camp
    npm run horizon                        # reported
    npm run reference -- --start=235       # reported, the first-snow gate

Done is all four green on seeds 17, 19, 42 and 79:

- April: alive and fed on day 20, 4 of 4.
- Winter: the stocked December camp alive on 1 March, 4 of 4.
- Year at level 20: alive on 1 April, 4 of 4.
- Lineage: a life reaches a year within six lives, 4 of 4, with the
  days per life printed and read for a plausible climb.

**Runner deaths are fixed, realism deaths are discussed.** The author's
rule for the build: when a gate seed dies of something a player playing
by hand would have avoided (a fire out beside a woodpile, food at camp
uneaten, a walk into the dark, a keep ranked under the grind that
starves it), the runner or the reference list is changed to do what
the player would have done, in the same task, and the change is
recorded with the death that asked for it. Only a death the world's
corrected numbers make unavoidable is reported as a finding and left
for a decision. "The runner now fails for an avoidable reason" is not
a report; it is the next task.

The build measures after each group of sections lands (1 to 3, then 4
and 5, then 6, then 7), so each gate's move is attributable, and the
roadmap's audit item carries the before and the after of every reading
in section 0 plus snow depth in January, kills per species, the
woodpile on 1 March and the litres drunk in a winter week. A number that
is corrected and turns a gate red is not turned back; what is tuned to
turn it green is the list, the stock or a ramp, and the roadmap says
which.

## 11. Roadmap and docs

- The roadmap's build order marks the tables audit built with this
  spec's readings, and the year loop's section 8 flags are annotated:
  snow depth and snare odds taken here, the cook keep made to bite by
  the aging rule, the indoor water multiplier answered; fish capacities
  by species, the hunting band, the rack in cold air, the arrival
  arrows, the ice hole's re-cut rate and the axe's loss rate stand as
  flags.
- The roadmap's "What kills you today" and "What the north yields"
  sections get the corrected burn band and the handbook table from
  section 0, so the tables cite their sources.
- F's carry paragraph records that the quarter landed here as a rule
  and the tree lifts it to a half.
- The README's body, food, camp, snares and skills paragraphs move with
  the numbers, and a "How to survive" line names the manual.
- The idle curve spec's section 2.4 and the survivor ladder's row 1 are
  annotated with the carry as built.

## 12. Out of scope

Sweat frost in clothing (E hides and clothing owns drying); a
thirst-death timeline slower than today's; fish capacities species by
species; the rack in cold air; the arrival kit; the ice hole's re-cut
rate; the axe's loss rate; the tree, its goals and Lineage points; sleep
debt (H, the mind); the Norwegian handbook until it can be read.
