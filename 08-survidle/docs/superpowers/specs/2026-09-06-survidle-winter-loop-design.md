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

Measured after: stone no longer runs out. At level 20 the four camps end
the year, or the death, holding 11, 13, 9 and 0 stone and 8, 7, 6 and 5
arrows, and not one of the four order lists reads "missing materials"
against the arrows, the axe or the knife; every one ends with an axe in
hand and a spare axe in the camp pile. The zero is one instant on seed
79 and not a camp that stayed dry: its stone restock reads "dark; at
first light" at the year's end, a want waiting for dawn, and neither its
axe keep nor its arrow keep is blocked, where the before reading had
both reading "missing materials" for months. Stone is wanted twice for
this: the once
job is the opening, and the keep beside the axe is the restock, for the
reason 2.1 gives.

**The fishing spear wears out and is never re-made or taken up.** The
spear want is a once job. Every seed reads "Fish for anything: needs a
fishing spear" from May while a spear lies in the camp pile: the
list made it while the arrival spear was still held, the arrival spear
broke at the shore, and the runner takes a tool from the pack or the
pile under foot at the work cell, never from camp on the way out. The
fire drill on seed 42 was at durability 2 at the death. Two issues: the
once job is the list's; the take-up is the runner's, and a player who
crafted a spare has the same spear lying at home.

Measured after: no order list on any of the four level-20 seeds reads
"needs a fishing spear" at the year's end or the death. Each survivor
ends with a spear in hand at durability 89, 1, 60 and 90 and a spare in
the camp pile, and the fire drills read 86, 76, 96 and 36 where seed
42's read 2. Seed 19's spear at 1 is the case the rule was written for:
the next stroke breaks it and the spare in the pile is taken up on the
way out. The keep of one crafts the replacement, and the take-up puts it
in the hands.

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

Measured after: the axe is no longer what kills seed 19, but the fuel
still is. It freezes on day 268, 26 December, at its own camp on the
twentieth night after the cold snap, with an axe at 98 in hand, a spare
axe in the pile, 13 stone and 266,575 kcal of food at camp - and 0 logs
and 0 kg of firewood, the fire out for three nights. The axe keep never
reads "missing materials" again. What is left is a December in which
felling is daylight work and the day is five hours long.

**Seed 17 starved on day 68 beside 764 logs.** From day 40 its stomach
read 0 and it lived on its fat, 80,000 kcal to 0 between days 40 and
66. With spear, arrows and stone gone, the only order able to run was
the felling grind: 5.0 hours of felling a day in April at 400 kcal an
hour, 2,000 kcal a day for nothing, with the snares as the only food.
The list's:
a player can give "keep camp at N logs" today.

Measured after: seed 17 lives the year at level 20 and stands on 1 April
with 505 kg of dried meat, 48 kg of firewood, 3 logs, 11 stone and a
mended hide set. The 2,000 kcal a day of felling for nothing is gone,
and the 150-log keep that replaced it runs, because it sits beside the
woodpile keep and above the three named hunts. The first draft left it
in the grind's old place at the end of the list, and it never ran there:
camp logs never passed five from 1 September and seed 17 froze on day
259 with 2.7 million kcal at camp and no fuel. A grind above a keep
starves the keep, which is 0.3's own argument used on this list.

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

Measured after: sleep is back in band. The last week of the level-20
year reads 8.9, 8.9, 8.9 and 9.2 hours a day; at level 10 it reads 8.9,
8.0, 8.9 and 9.4; the winter probe reads 8.8, 9.1, 8.6 and 8.6. Nothing
reads a second night's sleep. Work hours came up with them: 10.0, 5.6,
10.0 and 10.1 hours a day in the last week at level 20, against the 6.3
of the October reading, with seed 19's 5.6 the week it froze.

**The runner sets out in the dark.** Nothing refuses work away from camp
at night; winter's home-before-dark rule pulls it back before sunset and
is false once night has fallen. The stocked winter camp on seed 19 walks
5 to 8 hours in the dark on most nights. The runner's.

Measured after: the three skip reasons are on the live rows. Seed 79's
list at the year's end reads "dark; at first light" against the stone
restock and the reindeer hunt and "the day's work waits for the light"
against the ice-hole fill, the felling, the cooking, the fishing, the
hang grind and the elk and deer hunts, all at once, which is a December
night whose chore budget is spent. The browser pass in section 5 read
the same three reasons in the page. Walking is not settled by any of
them, and stays the unclaimed number the burn side left.

**Clothing is at durability 0 on every seed by the end.** Coat,
trousers, boots and hat, all four, on all four seeds, while seed 19's
camp holds 168 kg of hide. A garment at 0 sits in its slot as a ghost
(E's reading) and insulates nothing; the seeds that froze in the winter
probe "in wool" were naked. Two issues: the list never orders the needle,
the hide set or a mend, which is the list's; "Mend clothing" is legal at
durability 99, so a patch of 0.5 kg hide can buy one point, which is why
mending cannot be a standing order today and is the game's.

Measured after: moved wherever hide reaches camp, and only there. Seeds
17 and 42 end the level-20 year in a mended hide set: seed 17's coat
reads 94, trousers 58, boots 79 and the fur hat and mittens 81, and seed
42's 53, 73, 48, 79 and 79, where every garment on every seed used to
read 0. The needle keep is what holds it up. A once job was tried first
and withdrawn on its reading: the needle wears out, and both seeds ended
with the repair grind skipped "needs a bone needle" beside 383 and 98 kg
of hide. As a keep of one, each ends with a needle in hand at 59 and 72
and a spare in the pile.

What did not move is a camp with no hide left in it. Seed 19 takes no
large game all year, never sews the set, and ends in wool at durability
0 with 0 kg of hide and 63 kg of fur at camp, the coat, trousers and
boots reading "missing materials" and the repair grind "needs 0.5 kg
hide". Seed 79 takes its first large game on day 28 and sews the set,
but ends the year with its hide spent, every garment back at 0 and the
same "needs 0.5 kg hide" against the grind beside 63 kg of fur. Fur is
not hide: a garment or a patch that reads fur is E's to answer, and it
is the difference between a mended year and a naked one on half the
seeds.

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

Measured after: no seed dies of thirst in the winter probe, and none of
the three parts was touched by this spec. The water work landed on main
first and is what moved it: the winter gate reads seeds 17, 19 and 42
alive on 1 March and seed 79 frozen on winter day 89, 0.6 km from camp
with an empty stomach, 37 logs and 35 kg of firewood at camp and the
hut's fire lit. The three flags stand as written and go to the tables
audit unchanged.

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

### 0.4 Where it lands

Measured at 3054226 on 2026-09-06 with `npm test` green at 777 tests
and `npm run build` clean.

The April gate holds at 4 of 4 and the first lives run far longer: days
41, 222, 203 and 91 against 61, 51, 50 and 114. Two of the four now
reach a second autumn from nothing but the arrival kit. The year gate
goes from 0 of 4 to 3 of 4 at level 20, seeds 17, 42 and 79 standing on
1 April a year after they landed where the best of them used to reach
day 211, and seed 19 freezing on day 268. At level 10 it goes from 0 of
4 to 3 of 4 as well, the same three living the year and seed 19 starving
on day 353, against 246, 85, 186 and 186. The `--fresh` run is the April
gate's own set, 41, 222, 203 and 91, all starved. The winter gate reads
3 of 4 against the 4 of 4 the water work left: seed 79 freezes on winter
day 89 with a lit fire, 37 logs and 35 kg of firewood at camp and
nothing in its stomach. The horizon's lowest rung is nearer its band at
4, 3, 4 and 4 days against 0 to 2, where it read 5, 8, 7 and 5; the
second reads 9, 9, past 30 and 4 against 1 to 2, where it read 4, 11, 13
and 4; the top three rungs are past 30 on every seed as before, the
stocked one in band.

The trend gate is the reading that did not come with the rest: 2 of 4
against its 3 of 4, where the water work left it at 2 and the first
draft of this spec read 3. Seed 17's three lives read 41, 112 and past
251 days and seed 42's 203 and then past 251, both holding; seed 19's
read 222, 214 (wolves) and 162 and seed 79's 91, 60 and past 251, both
breaking on a middle life that landed in autumn. The trend now breaks
where a first life is long: seed 19's 222 days sets a mark its August
heir cannot match, which is the gate reading a stronger opening as a
regression. That is a shape worth watching rather than a rule to change
here.

Two readings that this spec's first draft got wrong are kept, because
each is a rule about the reference player rather than about its
subject. A stone keep in place of the opening's once job read April 2 of
4 with first lives of 26, 71, 14 and 93, since a want is judged met at
half its target when it is given and a level-1 keep is a stand-in given
again only under four stone, which is less than the fire pit alone
needs; that is why the opening keeps its once job and the keep is the
restock (2.1). And a 150-log keep left in the felling grind's old place
at the end of the list never ran, since the three named hunts above it
are grinds and a grind is never met; camp logs never passed five from 1
September and seed 17 froze on day 259 with 2.7 million kcal of food
beside it. That is why the two winter-stock keeps sit together (2.3).

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
reflexes and not orders. A task already under way finishes, since the
scheduler runs only when the task slot is free; the order is then not
chosen again until first light, and a runner with a load owed to camp
delivers it first, as today. In winter the home-before-dark rule still
brings the runner in before sunset.

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

### 2.1 Stone is wanted twice: the opening's once job and a restock keep

`job("stone", campHas 8)` stays where it is, near the top of the list,
and `keep("stone", 8)` is added further down, right before
`keep("craft", 1, "axe")` and so at the end of the clothing block.

The first draft of this section replaced the once job with the keep, and
that cost the April gate two seeds when it was measured. The reason is
worth keeping, because it is a rule about the reference player and not
about stone. A want is judged met at half its target when the player
decides whether to give it (`orderMet(..., live: false)`, the same
hysteresis the woodpile keep is wanted for), and at level 1 a keep is
given as a once stand-in that finishes and has to be given again. So a
lone `keep("stone", 8)` tops camp up only once it is under four, and the
opening has to be met on day one: the fire pit needs six stones and the
knife two. Camp sat at 5 or 6 stone through April where the once job had
gathered to 8 and reached 10 to 12.

The once job is therefore the opening, met once and done, and the keep is
the restock, where topping up under four is exactly what a restock
should do. It sits beside the axe keep because the axe and the arrows
are what spend stone: three per five arrows, three for a stone axe, two
for a knife, which is where the eight comes from. At level 10 and above
the restock is a true keep and the scheduler holds camp at eight.

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

The last line's felling grind, `chop forever`, is replaced by
`keep("chop", 150)`, placed beside the 400 kg woodpile keep and opened
by the same season clause (`WINTER_WOOD_FROM_DOY` to
`WINTER_WOOD_TO_DOY`). 150 logs is `WINTER_STOCK.logs`, the hut winter's
unsplit half; the 4-log keep near the top of the list carries the
summer's fire as it does today. `wantOpen`'s clause is generalised from
"a split keep at 400 or more" to "a winter-stock keep": split at 400 or
chop at 150, read from the two constants. The list then ends with the
three named hunts, and a runner with nothing to do rests, which is the
2,000 to 2,500 kcal a day of felling it no longer burns.

Beside the woodpile keep and not in the grind's old place at the end,
because 0.3's own argument applies here: a grind is never met, and a
grind above a keep starves the keep. Left at the end, below the three
named hunts, the log keep never ran - camp logs never passed five from
1 September, and the level-20 camp on seed 17 froze in December beside
2.7 million kcal of food.

### 2.4 Clothing wants

Right after `keep("hunt", 2, "any")`, which is the want that brings hide
to camp, and before the stone restock and the axe keep:

- `keep("craft", 1, "needle")`: a bone and the knife, 20 minutes, kept
  as a spare of one like every other held tool (2.2). A once job here
  was measured and withdrawn: a needle wears out, and when it does it
  takes the mend grind with it, which left two year seeds ending with
  the grind skipped "needs a bone needle" beside 383 and 98 kg of hide
  at camp and every garment back at durability 0.
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

**Not tripped.** Two of the re-measured seeds froze, and neither death
is the one the trigger names. At level 20 seed 19 froze on day 268, 26
December, at its own camp on the twentieth night after the cold snap:
the hut stood, the axe in hand read 98 with a spare in the pile, and
266,575 kcal of food sat beside it, but the camp pile held 0 logs and 0
kg of firewood and the fire had been out for three nights. A hearth
burns fuel that is there; this camp had none, so the entry would have
changed nothing. Seed 79 of the winter probe froze on winter day 89, 28
February, 0.6 km from camp with the hut's fire lit, 37 logs and 35 kg of
firewood at camp, an axe in hand and an empty stomach: camp food and
pack food both read 0 kcal, and the week before it ate 771 kcal a day
against 5,188 burned. That is a starving body giving up its warmth on a
walk, not a shelter failing to hold heat. The same reading was taken
against the first draft's deaths, seed 17 on day 259 and the same seed
79, and read the same way.

What the December deaths do name is a fuel rule this spec did not touch.
Felling is away work, so 1.2 keeps it in the daylight, and a December
day is about five hours long: seed 19 came into the cold snap with 3
logs and never got ahead of the fire again. Dead wood without an axe and
the wedges are item J's second and third steps, and a log stock carried
into December rather than cut in it is the shelter ladder's. The hearth
is neither.

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
- **2.1 to 2.4** The reference test's want list: stone is wanted twice,
  a once job above the fire pit and a keep of eight directly above the
  axe keep; the four tools and the needle are keeps of one and the trap
  stays a carried once job; the chop keep sits directly below the
  woodpile keep with only the three named hunt grinds after it, and
  opens on 1 September and closes on 31 March; the needle, the repair
  grind and the five garments sit between the small-game hunt keep and
  the stone restock; the coat want is closed at Crafting 7 and open at
  8; a level-20 kitted survivor's list crafts one spare spear and no
  second.
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

Measured. Every probe was run at 3054226 on 2026-09-06 with `npm test`
green at 777 tests and `npm run build` clean. Section 0.4 carries the
gates and section 0's own readings carry the before and after per line;
the roadmap's F section has the same set in its "Measured with the
winter loop" paragraphs. In short: the April gate holds 4 of 4 at day
26, with first lives of 41, 222, 203 and 91 against 61, 51, 50 and 114;
the year gate 3 of 4 at level 20 and 3 of 4 at level 10, from 0 of 4 at
both; the winter gate 3 of 4, one below what the water work left; the
trend gate 2 of 4 against its 3 of 4, breaking where a long first life
sets a mark an autumn heir cannot match; the horizon's two lower rungs
nearer their bands and the top three past 30 as before. Section 3's
trigger was read against the two frozen seeds and did not trip.

The browser pass ran in a headless Chrome at 1440 by 900 on seed 17,
opened on 1 December (`?seed=17&day=334`) and driven through the app's
own console handle and the page's real modules. At 16:21, with a felling
grind and a 60 kg split keep on the list, four logs at camp and the fire
lit, the felling row read "dark; at first light" in its step line and the
activity log carried "Fell a tree, forever, bringing it to camp: dark; at
first light."; the split keep ran, the Doing panel reading "splitting a
log". With the fire out and no torch, the body's needs met and no
firewood at camp, the split row read "dark; no fire to work by" and the
log carried "Split a log, keep camp at 60 kg firewood: dark; no fire to
work by."; the runner waited at camp, and lighting the fire again put the
split keep back to work on the next minute. On the first try the fire
going out at -6 C sent the body to sleep before the scheduler judged the
row, which is the body tier preempting as designed and not a gap. The
Mend clothing row with a needle in hand, a kilo of hide in the pack and
every garment at 80 read "nothing worn enough to mend - 0.5 kg hide; +40
wear on the most worn piece", and with the coat at 60 it was legal. By
day, at 11:20 on 2 December, with the only fishing spear in the camp pile
and a fish keep given from camp, the keep was chosen, the spear moved
from the pile (0 left) to the hands, the Doing panel read "fishing" and
the log carried "You take up the fishing spear." Nothing was found to
fix.

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
