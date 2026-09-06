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
the year, or the death, holding 4, 8, 4 and 8 stone and 3, 7, 0 and 6
arrows, and not one of the four order lists reads "missing materials"
against the arrows, the axe or the knife; every one ends with an axe in
hand and a spare axe in the camp pile. The low counts are a restock
between trips rather than a camp that stayed dry: on every seed the
stone want and the axe keep are either running or waiting on the clock,
where the before reading had both reading "missing materials" for
months. Stone is wanted twice for this: the once job is the opening, and
the keep beside the axe is the restock, for the reason 2.1 gives.

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
ends with a spear in hand at durability 16, 70, 19 and 13 and a spare in
the camp pile, and the fire drills read 94, 72, 96 and 54 where seed
42's read 2. The three spears in the teens are the case the rule was
written for: the next stroke breaks one and the spare in the pile is
taken up on the way out. The keep of one crafts the replacement, and the
take-up puts it in the hands.

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
still is. It freezes on day 268, 26 December, at its own camp, with an
axe at 90 in hand, a spare axe in the pile and 8 stone at camp - and 0
logs and 0 kg of firewood, its indoor fire want reading "needs 1 kg
firewood" and its split keep "no logs here". The axe keep never reads
"missing materials" again. What is left is a December in which felling
is daylight work and the day is five hours long.

**Seed 17 starved on day 68 beside 764 logs.** From day 40 its stomach
read 0 and it lived on its fat, 80,000 kcal to 0 between days 40 and
66. With spear, arrows and stone gone, the only order able to run was
the felling grind: 5.0 hours of felling a day in April at 400 kcal an
hour, 2,000 kcal a day for nothing, with the snares as the only food.
The list's:
a player can give "keep camp at N logs" today.

Measured after: seed 17 lives the year at level 20 and stands on 1 April
with 3.8 million kcal at camp, 69 kg of firewood, 2 logs, 4 stone, 159 kg
of hide and a mended hide set. The 2,000 kcal a day of felling for
nothing is gone,
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
8.0, 8.9 and 9.0; the winter probe reads 8.8, 9.1, 8.9 and 8.6. Nothing
reads a second night's sleep. Work hours came up with them: 10.0, 5.6,
10.0 and 10.1 hours a day in the last week at level 20, against the 6.3
of the October reading, with seed 19's 5.6 the week it froze.

What the fix does not do is put the hours between waking and dawn back
in the day's reach. A body spent at nightfall still wears its rest to
dawn, so it sleeps its cap and rests out the rest of the dark; 1.1 says
why the clear was measured and withdrawn.

**The runner sets out in the dark.** Nothing refuses work away from camp
at night; winter's home-before-dark rule pulls it back before sunset and
is false once night has fallen. The stocked winter camp on seed 19 walks
5 to 8 hours in the dark on most nights. The runner's.

Measured after: the three skip reasons are on the live rows. Seed 79's
list at the year's end reads "dark; at first light" against the reindeer
hunt and "the day's work waits for the light" against the ice-hole fill,
the splitting, the cooking, the hang grind and the elk and deer hunts,
all at once, which is a December night whose chore budget is spent. The
indoor fire want above them is not skipped by either, which is the
lighting exemption 1.3 gives. The browser pass in section 5 read the
same three reasons in the page. Walking is not settled by any of them,
and stays the unclaimed number the burn side left.

**Clothing is at durability 0 on every seed by the end.** Coat,
trousers, boots and hat, all four, on all four seeds, while seed 19's
camp holds 168 kg of hide. A garment at 0 sits in its slot as a ghost
(E's reading) and insulates nothing; the seeds that froze in the winter
probe "in wool" were naked. Two issues: the list never orders the needle,
the hide set or a mend, which is the list's; "Mend clothing" is legal at
durability 99, so a patch of 0.5 kg hide can buy one point, which is why
mending cannot be a standing order today and is the game's.

Measured after: moved wherever hide reaches camp, and only there. Three
of the four seeds end the level-20 year in a hide set that is being
mended: seed 17's coat reads 62, trousers 82, boots 55 and the fur hat
and mittens 60 and 68; seed 42's 69, 93, 88, 78 and 78, its repair grind
reading "nothing worn enough to mend" beside 463 kg of hide; and seed
79's 32, 0, 32, 32 and 32 on 13 kg of hide, a set being patched as fast
as it wears. Every garment on every seed used to read 0. The needle keep
is what holds it up. A once job was tried first and withdrawn on its
reading: the needle wears out, and two seeds ended with the repair grind
skipped "needs a bone needle" beside 383 and 98 kg of hide at camp.

What did not move is a camp with no hide left in it. Seed 19 takes no
large game all year, never sews the set, and dies in wool at durability
0 with 0 kg of hide and 66.6 kg of fur at camp, the coat, trousers and
boots reading "missing materials" and the repair grind "needs 0.5 kg
hide". Seed 79 sews its set and keeps patching it, but ends the year on
13 kg of hide beside 69.7 kg of fur, with its trousers already back at
0. Fur is not hide: a garment or a patch that reads fur is E's to
answer, and it is the difference between a mended year and a naked one.

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
alive on 1 March and seed 79 frozen on winter day 89, 28 February, on an
empty stomach - 771 kcal a day eaten against 5,188 burned in its last
week, of which 2,195 was walking and 759 cold - with the hut's fire lit
and 67 kg of firewood and 73 logs at camp a month before. That is a
food-supply reading in a stocked winter camp, not a fuel or shelter one.
The three flags stand as written and go to the tables audit unchanged.

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

Measured on 2026-09-06 with `npm test` green at 782 tests and
`npm run build` clean.

The April gate holds at 4 of 4, with first lives of 41, 220, 203 and 91
days against 61, 51, 50 and 114. Two of the four now reach a second
autumn from nothing but the arrival kit. In aggregate that is far
longer, but not on every seed: seed 17 shortens from 61 to 41 and seed
79 from 114 to 91, and both are the price of the stone trade. The
opening's once job for eight stone is met and done, where the earlier
list kept gathering; the two that shorten are the two whose April went
into that gathering, and they buy in exchange the arrows, the axe and
the spare spear that carry seeds 19 and 42 to 220 and 203.

The year gate goes from 0 of 4 to 3 of 4 at level 20, seeds 17, 42 and
79 standing on 1 April a year after they landed where the best of them
used to reach day 211, and seed 19 freezing on day 268. At level 10 it
goes from 0 of 4 to 2 of 4, seeds 17 and 42 living the year, seed 19
starving on day 353 and seed 79 taken by wolves on day 343, against 246,
85, 186 and 186. The `--fresh` run is the April gate's own set, 41, 220,
203 and 91, all starved. The winter gate reads 3 of 4 against the 4 of 4
the water work left: seed 79 freezes on winter day 89 with a lit fire
and fuel at camp and nothing in its stomach. The horizon's lowest rung
is nearer its band at 4, 3, 3 and 4 days against 0 to 2, where it read
5, 8, 7 and 5; the second reads 9, 9, past 30 and 4 against 1 to 2,
where it read 4, 11, 13 and 4; the top three rungs are past 30 on every
seed as before, the stocked one in band.

The trend gate is the reading that did not come with the rest: 2 of 4
against its 3 of 4, where the water work left it at 2. Seed 17's three
lives read 41, 113 and 162 days and seed 42's 203 and then past 251,
both holding; seed 19's read 220, 222 and 207 and seed 79's 91, 67 and
203, both breaking on a life that landed out of season. The trend breaks
where a first life is long and its heir lands in autumn: seed 19's third
life, landing 6 May, dies 13 days short of the mark its second set. The
gate compares death days across lives that land in different seasons,
so a stronger opening reads to it as a regression; it is due to be
re-derived rather than answered by a rule here.

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

**The spent rest still runs to dawn, and the clear was withdrawn.**
`restUntil` is not cleared with `sleptTonight`: a body spent at nightfall
sleeps its cap, wakes in the dark still wearing the latch `spentNow` set,
and rests out the rest of the night. That means a spent body never spends
the chore budget 1.3 gives it, which reads like a defect, so clearing the
latch at the cap sleep was built and measured. It was withdrawn on the
April gate.

What it bought: about one more hour of chores in the dark in the stocked
December camp, 4.3 to 5.0 hours a day of work in the dark at the four
seeds without it against 5.6 to 6.4 with it, on a 4.6 hour budget. What
it cost: the April gate, 4 of 4 down to 3 of 4. Seed 79's level-1 runner
ends its working day at 17:00 on day 5 with 0 kg of firewood and 0 logs
at camp, having spent the last of its ten hours on a lean-to; the fire
dies at midnight, the felling reads "too rough" in the snow that follows,
and it freezes at noon on day 7. Nothing in the night rules is what kills
it: with 1.3's lighting exemption the light row reads "needs 1 kg
firewood", not the dark. What kills it is that nothing makes a runner
stock the night's fire before it stops for the day, and the extra
pre-dawn hours are what end its ten hours that early in the afternoon.

That fuel-planning gap predates this branch and is item J's, beside a
fire that needs no axe: a runner stocks the night's fire before its
working day ends. The clear is worth building again once that rule
stands, and not before.

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
for the light". In December the budget is 4.6 hours of splitting,
crafting, cooking and mending, against 5.4 hours of light for the forest,
the shore and the hunt; measured, the stocked December camp works 4.3 to
5.0 hours a day in the dark across the four seeds, since the budget stops
camp orders rather than the day, and the lighting tasks below, the body's
own fire-keeping and its thirst walks, and any task still under way at
dusk are none of them chores it counts. In June the budget is negative
and no chores run at night, which is what June already does. By day the
budget does not apply: if nothing away is able to run, the chores run in
the light as today.

**Lighting a fire is the one camp job the dark never stops.** An order
whose task is `light`, `lightIndoors` or `lightTorch` is exempt from both
camp branches: neither "dark; no fire to work by" nor the budget can skip
it. The fire is what the other chores work by, so a rule that made
lighting it wait for firelight would leave a camp whose fire has gone out
unable to light another until dawn - no fire, no splitting, no firewood,
no fire - and it is minutes of work rather than a working day, so the
budget has no claim on it either. The away branch still runs first and
never bites, since the lighting tasks resolve to camp.

A runner with every order skipped waits at camp, and a wait at camp keeps
its fire before it rests or sleeps: it takes the same `fireStep` a spent
body takes, and only then rests once it has slept (1.1). Otherwise a
runner could wait a fire out and have no way back to work before dawn.
The three skip reasons are strings the Do panel shows in the row like any
other, and the activity log gets the "" to reason transition once, as
`markSkipped` does for every reason.

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

`wearTool` is unchanged: it still replaces a broken tool from a pack
spare and reads no pile. A break at camp is covered twice over without
it - `beginTask` takes a tool up from the pile under foot when the next
camp task starts, and `provisionKit` takes one up on the next set-out -
so the survivor is never left swinging nothing with a spare at its feet.

A stated consequence of `provisionKit` calling `takeUp`: a tool lying in
the camp pile that a camp task used to swing straight from the pile,
without ever being held, is now taken into the hands when an order sets
out with it, and wears from then on like any held tool. That is the
point - a spare that is never held is never the tool that breaks - and
it is the one thing in section 8's list that does change.

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
December, at its own camp: the hut stood and the axe in hand read 90
with a spare in the pile, but the camp pile held 0 logs and 0 kg of
firewood, its indoor fire want reading "needs 1 kg firewood" and its
split keep "no logs here". A hearth burns fuel that is there; this camp
had none, so the entry would have changed nothing. Seed 79 of the winter
probe froze on winter day 89, 28 February, with the hut's fire lit, fuel
at camp, an axe in hand and an empty stomach: it ate 771 kcal a day
against 5,188 burned in its last week, of which 2,195 was walking. That
is a starving body giving up its warmth on a walk, not a shelter failing
to hold heat. The same reading was taken against two earlier drafts'
deaths, seed 17 on day 259 and the same seed 79, and read the same way.

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
  on a 19-hour day no chores run at night. The lighting exemption: at
  night with the fire out, firewood at camp and the day's work already
  at the budget, a `light` keep is chosen while a split keep below it
  reads "dark; no fire to work by", and once the fire is lit the split
  keep is chosen. The wait's fire: a `wait` intent at camp at night with
  the fire out, firewood at camp and a drill in hand starts the `light`
  task rather than resting.
- **1.4** Two tests, the widening and its edge: a felling judged from
  camp with the only axe in the camp pile is able to run, and starting
  it takes the axe up; judged from the forest with the axe at camp it
  is not, since the tool is only in reach from camp, where setting out
  takes it up. A third holds the line at the fill: a hole fill judged
  from a camp off the water with the only axe in the camp pile reads
  "needs an axe", because `provisionKit` leaves a fill's kit to the fill
  task, while an `iceHole` order judged from the same camp is able to
  run and starting it takes the axe up.
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

Measured. Every probe was run on 2026-09-06 with `npm test` green at 782
tests and `npm run build` clean. Section 0.4 carries the
gates and section 0's own readings carry the before and after per line;
the roadmap's F section has the same set in its "Measured with the
winter loop" paragraphs. In short: the April gate holds 4 of 4 at day
26, with first lives of 41, 220, 203 and 91 against 61, 51, 50 and 114;
the year gate 3 of 4 at level 20 and 2 of 4 at level 10, from 0 of 4 at
both; the winter gate 3 of 4, one below what the water work left; the
trend gate 2 of 4 against its 3 of 4, breaking where a long first life
sets a mark an out-of-season heir cannot match; the horizon's two lower
rungs nearer their bands and the top three past 30 as before. The
December working day itself was measured with a throwaway probe, since
no script prints work hours per month: the stocked December camp works
8.0 to 8.6 hours a day across the four seeds, of which 4.3 to 5.0 are in
the dark, against the 4.6 hours the budget allows and 5.4 hours of
light. Section 3's
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

Two exceptions to "no change".

Stated in 1.4: because `provisionKit` now calls `takeUp`, a tool lying in
the camp pile that a camp task used to swing from the pile without ever
being held is taken into the hands when an order sets out with it, and
wears from then on. No wear rate changes; what changes is which tool
wears.

Stated in 1.3: the `wait` intent gains a step. A wait standing at camp
takes the fire step before it rests or sleeps, since this spec's own
firelight rule would otherwise let a runner wait its fire out and leave
itself no way back to work before dawn. The rest and the sleep are
unchanged behind it.

And one thing withdrawn rather than not done, recorded in 1.1: clearing
`restUntil` at the cap sleep, so a spent body could spend the night's
chore budget, was built, measured and taken out. It bought about an hour
a day of December chores in the dark and cost the April gate a seed; the
fuel-planning rule it wants first is item J's.
