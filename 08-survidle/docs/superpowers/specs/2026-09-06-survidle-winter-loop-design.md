# Survidle: the winter loop

The year loop landed with three of its four gates red, and the roadmap
(`2026-09-03-survidle-realism-roadmap.md`, the build order) wrote the
next slot from the year probe's month lines: four runner and list rules
and one question, "pulled ahead of everything because the year loop's
last deaths name them". Before writing this spec the four seeds were run
again with a per-day, per-task reading, and the month lines had hidden
the causes. Two of the four rules hold, one is re-shaped, one is dropped,
and two rules the roadmap did not name are what the deaths actually
name. Section 0 has the readings; this spec is what they say to build.

Extends `2026-09-05-survidle-year-loop-design.md` (the year probe and
its gates, the winter woodpile, fuel by shelter) and
`2026-09-03-survidle-standing-orders-design.md` (the runner's body tier,
the order scheduler, the reference list). The water design
(`2026-09-05-survidle-water-design.md`) is being built in parallel by
another session; section 7 draws the line between the two.

## Decisions confirmed with the author

- **The winter loop goes first; water runs beside it.** The water spec's
  section 8 asks for water's first part before this work, so that the
  winter loop is measured once. The roadmap's later commit puts the
  winter loop first so the year gate keeps moving while the tester round
  is prepared. Ruling: the winter loop now, water in parallel by another
  session. The thirst deaths in section 0 are read as water's to move,
  and this spec does not touch a water row.
- **The re-derived set, not the roadmap's four rules as written.** The
  rules below are what the per-task readings name. The roadmap's
  hunts-above-woodpile rule is dropped with its reading in section 0.
- **Night chores keep the light for the outdoors.** Camp chores by
  firelight count toward the ten-hour working day and stop once the
  day's work reaches ten hours less the day's daylight, so a December
  runner does about four and a half hours of chores in the dark and has
  the five and a half hours of light for the forest. The alternatives
  were measured in thought and rejected: no reservation has a runner
  that sleeps at 16:00 do its whole working day in the dark and rest
  through the light; free night chores has it work fifteen hours a day
  at 200 kcal an hour.
- **No dial for the daylight share.** The rule takes its number from the
  day's length, which makes it a competent reflex like home-before-dark
  and not a choice; by day the list order already decides between chores
  and away work. The lever a player might want is the working day's
  length, which is `workHours` on the player at ten with no dial yet.
  The UI pass notes carry a working-day dial for the tester round to
  ask for. Open to being overturned on review.
- **The list is the harness's, the runner is the game's.** The reference
  list is imported by the year, reference and horizon scripts and by
  nothing a player sees, so a list change moves the gates and the
  readings and never a player's run. The runner's body tier and the
  order scheduler run every player's standing orders, at the keyboard
  and away. Section 1 is the game's; section 2 is the harness's; each
  reading in section 0 says which it is.

## Curve

Horizon rows 4 to 6, the year: the winter working day and the tool
take-up are runner rules with no tier. Survivor row 3 ("a coat worth the
level"): the hide set the tree already sews at Crafting 8 is ordered for
the first time, which is the row's floor and not E's depth. Expected:
the year gate moves off 0 of 4 at level 20 by the deaths in section 0
turning into the next death; the April gate holds 4 of 4 at day 26,
since nothing here touches the first month.

## 0. Measured before

All numbers from a throwaway probe on main 22976fe, 2026-09-06: the
year probe's set-up (`setUpReference(seed, true)`, every skill at 20,
`kitOut` with the producers) stepped a minute at a time, with the task
under way, the light, the position and the water loss read every minute
and summed by day, and the camp pile, the tools and the order list read
at the death. The probe was not kept. `npm run year -- --winter 19` runs
in 1.6 seconds and a year in about 6, so the plan's re-measure is cheap.

### 0.1 The year probe, level 20, from 1 April

**Stone runs out on every seed, and with it arrows and the axe.** The
list's stone want is `job("stone", campHas 8)`, a once job. Arrows take
3 stone per 5 and the stone axe takes 3. At the death the camp piles
hold 2, 1, 0 and 0 stone, and the order list reads "arrows x5: missing
materials", "stone axe: missing materials", "Hunt anything: needs
arrows in the pack" and the same for the three named hunts. Hunting
drops out of the month's tasks from June on seeds 42 and 79 and from
July on 19.
This is the whole of "seeds 42 and 79 ate their July stock by November".
Their September hours went to sleep (12.3 to 12.5 a day), walking (5.9
to 6.4), felling (1.5 to 1.7) and berries; wood was not where the hours
went. A list issue: a player can give "keep camp at 8 stone" today.

**The fishing spear wears out and is never re-made or taken up.** The
spear want is a once job. Every seed reads "Fish for anything: needs a
fishing spear" from May while a spear lies in the camp pile: the
list made it while the arrival spear was still held, the arrival spear
broke at the shore, and the runner takes a tool from the pack or the
pile under foot at the work cell, never from camp on the way out. The
fire drill on seed 42 was at durability 2 at the death. Two issues: the
once job is the list's; the take-up is the runner's, and a player who
crafted a spare has the same spear lying at home.

**Seed 19 froze on day 245, 1 December, because its axe wore out on day
234.** The felling stopped at 670 logs; from day 235 the 60 kg split
keep, the 400 kg woodpile keep and the felling grind all read "needs an
axe" and the axe keep "missing materials", with 1 stone at camp;
firewood reached 0 on day 242 and the fire went out that evening. Camp
held 444,600 kcal of dried meat, 168 kg of hide, 83 sinew and 371 bone.
The roadmap's "working two hours a day in five hours of light" is the
October month line, and the light was not the cause; see the sleep
reading below. The arrival axe wearing out is the ramp the design wants;
the stone is the list's.

**Seed 17 starved on day 68 beside 764 logs.** From day 40 its stomach
read 0 and it lived on its fat, 80,000 kcal to 0 between days 40 and
66. With spear, arrows and stone gone, the only order able to run was
the felling grind: 5.0 hours of felling a day in April at 400 kcal an
hour, 2,000 kcal a day for nothing, with the snares as the only food.
The list's:
a player can give "keep camp at N logs" today.

**Sleep is over band from August, and the light hours are lost with
it.** Sleep a day: 8.2 hours in July, 11.3 in August, 12.1 in September,
14.8 in October on seed 19, against the seven-to-nine band. October on
seed 19: 6.3 hours of work, 4.2 of them in the 5.4 hours of light, and
2.9 hours of walking. The cause is in `currentNeed`: a body that has
done its ten hours is spent and is laid down at nightfall by the clause
`isNight && spent`; it sleeps the nine-hour cap, wakes at about 01:00
still in the dark and still spent (`restUntil` is the next dawn), and
the same clause lays it down again until dawn. The `wait` intent has the
same shape: waiting at night is a sleep. The runner's: every player's
away run sleeps its autumn away.

**The runner sets out in the dark.** Nothing refuses work away from camp
at night; winter's home-before-dark rule pulls it back before sunset and
is false once night has fallen. The stocked winter camp on seed 19 walks
5 to 8 hours in the dark on most nights. The runner's.

**Clothing is at durability 0 on every seed by the end.** Coat,
trousers, boots and hat, all four, on all four seeds, while seed 19's
camp holds 168 kg of hide. A garment at 0 sits in its slot as a ghost
(E's reading) and insulates nothing; the seeds that froze in the winter
probe "in wool" were naked. Two issues: the list never orders the needle,
the hide set or a mend, which is the list's; "Mend clothing" is legal at
durability 99, so a patch of 0.5 kg hide can buy one point, which is why
mending cannot be a standing order today and is the game's.

### 0.2 The winter probe, the stocked December camp

Seed 19 dies of thirst on winter day 34, 3 January. The 2.5 litres a
day of the question is 3.3 to 4.8 litres a day in the reading, and it
has three parts:

- **The indoor factor.** `waterLossPerHour` multiplies by 1.3 above 20 C
  felt as it does below -10. Inside the lit hut, felt temperature reads
  22 to 27, and the factor applies 10 to 22 hours a day for the first
  fortnight. Then it applies 0 hours: firewood reached 0 on day 15 with
  145 logs at camp, because splitting got 0.3 hours a day.
- **The walk.** 4 to 11 hours of walking a day in snow that reads 14 cm
  on 1 December and 249 cm on 3 January, which halves walking speed. A
  walk with a load past the comfortable pack is the heavy loss rate,
  and at felt under -10 the 1.3 factor applies again.
- **The water path.** The fill keep at the top of the list holds camp at
  2 litres with one 2-litre bucket per trip, 25 to 55 minutes each way
  before the snow; the trough's 20-litre keep sits twentieth and never
  gets camp past 2 litres; the ice hole skins over at every day roll
  (`dailyCamp`) and is
  re-cut most days, 0.3 to 0.9 hours; between trips the body's thirst
  need walks to the shore on its own. Camp water reads 0 or 2 litres
  every evening.

None of this is a winter-loop rule. The walk and the one vessel per
trip are the water spec's landing camp and fetch-by-method, being built
in parallel. The daily hole, the snow depth and the indoor factor are
tables-audit flags; section 7 hands them over with these numbers.

### 0.3 What this does to the roadmap's four rules

1. **The winter working day**: needed, re-shaped. Not "more work in
   less light" but one full sleep per night, away work only by day, and
   camp chores by firelight with the light kept for the outdoors.
2. **"Keep camp at N logs" for the felling grind**: needed as written.
3. **The hunts above the woodpile in autumn**: dropped. Hunting stopped
   for want of arrows, not for want of hours, and a grind ranked above a
   keep starves the keep for good, since a grind is never met. The
   woodpile keep's own hysteresis (unmet under half its target when
   idle) already lets the named hunts run while the pile sits between
   200 and 400 kg.
4. **Clothing wants**: needed, plus the needle and a mend that can stand.

Plus two the readings name: stone as a keep, and tools as keeps with a
take-up of the spare at camp.

## 1. The runner: the game's rules

### 1.1 One sleep per night

A night's sleep is one marker on the player, `sleptTonight`, set when a
sleep task ends at the cap (`SLEEP_CAP_MINUTES`) while it is still night
and cleared at dawn with `restUntil`. The two night clauses read it:

- `currentNeed`'s `isNight && (energy < NIGHT_SLEEP_UNDER || (spent &&
  !thirsty))` becomes `isNight && !sleptTonight && (...)`. The energy
  clauses stand as they are: energy at or under `SLEEP_AT` sleeps
  whenever, and a body that has worked itself under 60 in the dark
  sleeps again; that is a collapse, not a second night.
- The `wait` intent's "by night it sleeps outright" becomes "by night it
  sleeps once, then rests"; the rest keeps raising energy as it does by
  day.

A spent body still goes to bed at nightfall, as the year loop had it.
What changes is the morning: it wakes after nine hours into the dark
with the day's work count at 0, and section 1.3 says what it does with
the hours until dawn.

### 1.2 Away work only by day

In `chooseOrder`, an order whose resolved cell is not the camp cell is
skipped at night with the reason "dark; at first light". It is judged
like every other skip, so the row shows the reason and clears it at
dawn. The body tier is exempt on purpose: a thirsty body still walks to
the shore at night and a spent one still walks home, because those are
reflexes and not orders. The live intent is not interrupted by nightfall
either: an order that started by day finishes its walk home under
winter's home-before-dark rule as today, and in the other seasons its
work is ended by the working day, by sleep or by the load being full,
never by the clock.

### 1.3 Camp chores by firelight, the light kept for the outdoors

At night, an order whose resolved cell is the camp cell runs when the
camp fire or a torch in hand is lit, and is otherwise skipped with
"dark; no fire to work by". The chores count toward the working day as
every task does, and they stop once today's work minutes reach
`(workHours - daylightHours) * 60`, skipped with "the day's work waits
for the light". In December that is about 4.5 hours of splitting,
crafting, cooking and mending between waking and dawn and 5.5 hours of
light for the forest, the shore and the hunt; in June the budget is
negative and no chores run at night, which is what June already does.
By day the budget does not apply: if nothing away is able to run, the
chores run in the light as today.

A runner with every order skipped waits at camp, which by night is a
rest once it has slept (1.1). The three skip reasons are strings the Do
panel shows in the row like any other, and the activity log gets the
"" to reason transition once, as `markSkipped` does for every reason.

### 1.4 The spare tool at camp is taken up

Two changes, both at the camp cell, so a tool never teleports:

- **Judging.** In `checkFresh`, the inventories a tool is looked for in
  are the pack and the pile at the work cell. When the survivor stands
  at its camp and the work is judged at another cell, the camp pile
  joins the list for tools only, not for materials: the tool will be
  taken up on the way out, materials are fetched by the delivery rules
  as today. `toolFor(task)` names the tool per task already.
- **Setting out.** `provisionKit` pockets arrows, snares and the basket
  at the intent's camp cell before the intent's check runs. It gains the
  tool the task needs: when the survivor holds none and the camp pile
  has one, `takeUp` moves it into the hands, with the "You have a ..."
  log line the craft completion uses. A start that turns out illegal
  hands the kit back as today; a taken-up tool stays taken up, since a
  tool in hand is never put down.

A held tool that breaks at camp with a spare in the camp pile is
replaced in the same breath, the way `wearTool` already replaces it
from a pack spare, by reading the pile under foot too.

### 1.5 Mend clothing is legal when it is worth a patch

"Mend clothing" gives +40 to the most worn piece for 0.5 kg hide. Its
legality gains "the most worn piece is at or under 60", greyed with
"nothing worn enough to mend", so a patch is never worth less than its
hide. The manual button reads the same rule; a player whose worst piece
is at 80 waits, as a person would. `MEND_AT = 60` sits beside the +40 in
`tasks.ts`, derived from it: `100 - MEND_GAIN`.

## 2. The list: the harness's rules

The reference list is the stand-in for a competent player. Every edit
below is a line in `REFERENCE_ORDERS` or a clause in `wantOpen`, and
the comment above the list gains a paragraph per edit in its own voice.
The water rows (`keep("fill", 2)`, `keep("fill", 20)`) are not touched;
the parallel water work splits them by method.

### 2.1 Stone is a keep

`job("stone", campHas 8)` becomes `keep("stone", 8)`. At level 1 the
ladder gives it as a once stand-in, re-given whenever camp is under 8,
which is what a stand-in already does; at level 10 and above it is a
keep. Eight is the number the list already chose: three for arrows,
three for an axe, two for a knife.

### 2.2 Tools are keeps of one spare

`job("craft", once, "knife")`, `fireDrill`, `fishingSpear` and `bow`
become `keep("craft", 1, <tool>)`, the pattern the axe already uses.
A keep of one at camp with the tool in hand crafts exactly one spare
and then reads met; when the held one breaks, section 1.4 takes the
spare up and the keep crafts the next. The list comment's "tools the
survivor holds are once jobs, since the first one made is taken up and a
keep would craft a second" becomes "a keep would craft a second, and the
second is the point". The basket trap stays a once job carried in the
pack: it is set, not held.

### 2.3 The felling grind becomes a log keep

The last line, `chop forever`, becomes `keep("chop", 150)`, opened by
the same season clause as the 400 kg woodpile keep (`WINTER_WOOD_FROM_DOY`
to `WINTER_WOOD_TO_DOY`). 150 logs is `WINTER_STOCK.logs`, the hut
winter's unsplit half; the 4-log keep near the top of the list carries
the summer's fire as it does today. `wantOpen`'s clause is generalised
from "a split keep at 400 or more" to "a winter-stock keep": split at
400 or chop at 150, read from the two constants. The list ends with the
three named hunts, and a runner with nothing to do rests, which is
the 2,000 to 2,500 kcal a day of felling it no longer burns.

### 2.4 Clothing wants

Right after `keep("hunt", 2, "any")`, which is the want that brings hide
to camp, and before the axe keep:

- `job("craft", once, "needle")`: a bone and the knife, 20 minutes.
- `{ task: "repair", forever }` as a grind: mends the most worn piece
  whenever one is at or under 60 and hide is at camp, and is skipped
  otherwise. A grind here does not starve the hut group below it,
  because with 1.5 it runs only while a piece is worn enough.
- `job("craft", once, "hideCoat")`, `"hideTrousers"`, `"hideBoots"`,
  `"furHat"`, `"furMittens"`: once jobs, since a made garment is put on
  and the old one left behind. `wantOpen` opens each at its
  `RECOMMENDED` level (coat, trousers, boots at Crafting 8; hat and
  mittens have none), the way a named hunt opens at its level, so a
  level-1 survivor with an elk's hide does not spoil 6 kg of it.

The hide blanket (Crafting 6, sleep +8) is not added: the bough bed and
the roof are the list's sleep answer and nothing in section 0 died
asleep. E's wraps, layers, tanning and wear are E's.

### 2.5 The horizon stages read the same list

`setUpStage` in `horizon.ts` gives the open wants of `REFERENCE_ORDERS`
at each stage's levels, so every edit above reaches the horizon rows.
The re-measure in section 5 reads them, and the four lower rungs that
read over band in the year loop's readings are expected to move.

## 3. The hearth, conditional

No seed in section 0 died of fuel in a hut with an axe in hand, so the
hearth is not built by this spec. The trigger and the entry are written
here so the plan can add them if the re-measure in section 5 trips the
trigger, without another spec:

- **Trigger.** A re-measured seed dies of cold or of fuel inside a
  standing turf hut with an axe in hand and logs at camp.
- **Entry.** `hearth` in `STRUCTURES`: 12 stone, 240 minutes, Building
  5 in `RECOMMENDED`, legal only where a turf hut or a cabin stands, and
  "a hearth has no build entry of its own" comes out of `camp.ts`. In a
  cabin it is what `burnPerHour` and `INDOOR_C` already read; in a hut
  it is the smoke hole's fire made permanent and changes no rate, since
  the hut's 1.2 kg an hour already assumes one. The list wants it as a
  once job after the hut.

If the trigger does not trip, the entry waits for the shelter ladder in
3 camp, as the roadmap has it.

## 4. Tests

- **1.1** A spent body at nightfall sleeps the cap once and then rests
  until dawn; the ledger's sleep minutes for the night read 540, not
  the night's length. A body worked under 60 after its night's sleep
  sleeps again. `sleptTonight` clears at dawn. A `wait` intent by night
  sleeps once, then rests.
- **1.2** An order for the forest is skipped at night with "dark; at
  first light" and chosen at dawn; a thirsty body at night still walks
  to the shore; a live felling that started by day is not ended by
  nightfall.
- **1.3** A split keep at night with the fire lit runs; with the fire
  out and no torch it is skipped with "dark; no fire to work by"; on a
  5-hour day it stops once 5 hours of work stand and resumes by day;
  on a 19-hour day no chores run at night.
- **1.4** A fish keep judged from camp with a spear in the camp pile
  and none in hand is able to run, and starting it takes the spear up;
  judged from the shore with the spear at camp it is not; a spear that
  breaks at camp with a spare in the pile is replaced.
- **1.5** Mend is greyed with the worst piece at 61 and legal at 60; a
  `repair` grind is skipped while nothing is worn enough.
- **2.1 to 2.4** The reference test's want list: stone is a keep; the
  four tools are keeps of one and the trap stays a carried once job; the
  list ends with the named hunts and the chop keep opens on 1 September
  and closes on 31 March; the needle, the repair grind and the five
  garments sit between the small-game hunt keep and the axe keep; the
  coat want is closed at Crafting 7 and open at 8; a level-20 kitted
  survivor's list crafts one spare spear and no second.
- **3** Only if built: the hearth's legality, cost and level.

`npm test` stays under its budget; nothing here runs a year.

## 5. Measurement and done

The plan lands sections 1 and 2 as small commits, each with its tests,
and re-measures once at the end rather than per rule, since the probe
is cheap and the rules interact:

- `npm run reference` on the four seeds: the April gate holds 4 of 4 at
  day 26.
- `npm run year` at level 20 and 10, `--fresh`, and `--winter`: the
  death day and cause per seed, the sleep and work hours in the last
  week, and the month lines, written into the roadmap beside the year
  loop's.
- `npm run horizon`: the rows, beside the year loop's.
- `npm run reference -- --heir`: the trend gate, since the list changed.
- The browser pass: a December evening on seed 17 at 1440 by 900, the
  Do panel showing "dark; at first light" on a forest row and a split
  keep running by the fire; the mend row greyed at 80 and legal at 60;
  a spare spear at camp taken up when a fish keep starts.

Done when `npm test` passes, the readings are in the roadmap whatever
the gates say, section 3's trigger has been read against them, and the
spec's section 0 numbers have a "measured after" beside them. If the
year gate stays 0 of 4, the death it names is the opening of the tables
audit or of the missing tier, and the roadmap says which.

## 6. Roadmap edits

- The build order: the winter loop's description replaced by what
  section 0 found, with the dropped rule and its reading kept as a
  sentence so it is not re-proposed from the month lines.
- The F section: a "Measured with the winter loop" paragraph beside the
  year loop's, with section 0 as the before and section 5's readings as
  the after.
- The tables audit's flag list, section 8 of the year loop spec or its
  successor in the roadmap: the ice hole skinning over at every day
  roll; 249 cm of snow on 3 January against 40 to 60 real; the 1.3
  water-loss factor above 20 C felt applying 10 to 22 hours a day inside
  a lit hut; each with section 0.2's numbers.
- The water spec's re-measure: the 25 to 55 minute walk, the one
  2-litre bucket per trip and the 20-litre keep that never fills, as the
  before numbers the landing camp and fetch-by-method are measured
  against. Written into the roadmap, not into the water spec, which the
  parallel session owns.
- The UI pass notes: a working-day dial, for the tester round to ask
  for.
- The idle-curve spec's rhythm line: a capability is promoted when the
  one before it made its bottleneck the measured cause of death. Stone
  and the spare spear are that for the hunt and fish rows.

## 7. The line between this and the water work

Both edit `reference.ts` and `intent.ts`. This spec's lines: the stone
want, the four tool wants, the last line, the block after the hunt-any
keep, and `wantOpen`'s winter-stock clause and garment clause. Water's
lines: the two fill wants and `wantOpen`'s fill-method clauses, and
`workStep`'s fill branches. This spec adds to `chooseOrder` and
`currentNeed`, which water does not touch, and to `checkFresh`'s tool
lookup and `provisionKit`, which water's vessel take-up sits beside but
not on. Whichever lands second rebases; the conflicts are textual.
Neither spec changes `thirstyStep`.

## 8. What this does not do

No dial for the daylight share; no change to the working day's length;
no bedtime clock beyond the night clauses; no tanning, wear model,
wraps or layers (E); no hearth unless section 3's trigger trips; no
change to any water row, vessel, source or the melt fallback (water); no
change to snow depth, the hole's life or the indoor factor (the audit);
no cabin want; no new tables, bands or constants beyond `MEND_AT`,
`sleptTonight` and the winter-stock clause.
