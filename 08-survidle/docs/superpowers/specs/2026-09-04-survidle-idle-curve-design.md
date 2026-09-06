# Survidle: the idle curve

The roadmap (`2026-09-03-survidle-realism-roadmap.md`) sets the thirty-day
gate and the two loops that carry it, the check-in and the survivor. What
it does not say is how much of the player's attention each hour of the
game asks for, and how that falls as the game goes on. Idle games have a
known shape for that, and this spec fits Survidle to it: a short manual
phase, automation earned per skill, check-ins that stretch as the camp
holds longer, each survivor dying of the next ramp out, and a tree that
starts the heir further along. It also gives skills their own wall, so a
run that survives still stalls, and it names the view that shows the
curve to the player.

Everything here is measured against the roadmap's gate table. A rung, a
band or a node earns its place by what it does to the re-run rate or the
hours of attention, and one that moves neither is a badge and does not
belong.

## Decisions confirmed with the author

- **Manual first, per skill.** Every click on the Do panel is an order,
  so "manual" is a once job: one unit of work, then it drops off the list.
  Once jobs are never gated. Jobs with a count or a camp-has target,
  grinds and keeps are earned per skill. Nothing new is clicked.
- **The rungs are jobs at 3, grinds at 5, keeps at 10.** The level curve
  does not move, so the recommended levels do not move either.
- **Unlocks are carried by Lineage.** Until F lands they are per survivor.
- **Each survivor dies of the next ramp out**, and the tree pays for the
  step behind it. Gates are game days on the season spine; attention hours
  are the derived check.
- **Skills have their own wall.** Per skill, the tree has a carry ladder
  and a rate ladder, separate nodes, and content tiers sit on the reach
  they buy.
- **The "never raw percentages" rule for tree nodes is dropped.** The
  impact test above replaces it.
- **The forecast over a life is drawn**, in the journal, on the epitaph
  and between runs per ancestor.

## 1. The genre curve, and where Survidle sits

An idle game runs three phases per cycle and one across cycles. The
active phase is manual, no automation, and lasts minutes: A Dark Room
gives its first builder in about ten, Kittens Game has the player clicking
catnip for twenty to forty, Cookie Clicker for under two. The automation
phase unlocks one resource at a time, usually behind having gathered some
by hand, and sessions shrink from an hour to ten minutes while check-ins
go from every few minutes to a few times a day; offline progress is capped,
commonly at 8 to 24 hours. The wall is where progress slows until a reset
with a permanent bonus is the better move; the first reset lands inside
the first day of play, and each cycle after it is longer and starts more
automated. The long tail is weeks of a few short check-ins a day, kept
alive by content.

Survidle's pieces map onto it:

- The survivor is the cycle. "First death inside two hours of attention"
  is the genre's first-reset timing, and the Lineage tree is the permanent
  bonus. A game day is 24 real minutes, so a first survivor who dies on
  day 20 is 8 real hours of sim time and one or two of attention.
- The 60 game-day away cap is 24 real hours, Melvor's offline cap.
- The genre's wall is a soft one, gains per session dropping until the
  player resets. Survidle has no voluntary reset: a run ends only in
  death, and the ramp is what ends it. Its wall is B's month number
  falling once the axe is worn, the haul is cut out and winter is near.
  That falling number is the "time to prestige" feeling, and the player's
  answer is to prepare the heir: stock the cache, build the cabin, close
  goals for Lineage. The genre stretches the check-in interval by making
  the number go up faster; Survidle stretches it by making the camp hold
  longer, and the ramp still ends every set-up.

What the roadmap lacked and this spec adds: the gate that makes
automation earned (section 2), the pacing number and its bands (3), the
per-survivor gates (4), the skill wall and the nodes that move it (5),
and the view (6).

## 2. The delegation ladder

### 2.1 The rungs

Per skill, the orders list accepts an order kind once the skill is at its
gate. Below it the player points, one unit of work per click: a once job,
which is how the game opens today.

Every table in this spec that says when a level arrives is generated from
the code's curve by `scripts/curve-table.ts` and asserted verbatim by
`tests/curve-table.test.ts`, on two stated assumptions: a working day of
10 hours, which is where the working-day item rests the body and near the
9.6 the calibration pass measured, and a main skill that takes 40 percent
of it, 4 hours a day, with the other 6 spread over the five side skills at
1.2 each. Tier placement follows those practice hours, never a survivor's
age; a table typed by hand paced the game against an imaginary curve
once, which is why the numbers are not typed again.

| rung | level | practice hours | game days at 4 h a day | real time | genre analogue |
|---|---|---|---|---|---|
| once jobs | 1 | 0 | 0 | 0 | the opening clicks |
| jobs with a count or a target | 3 | 8 | 2 | 48 min | first builder, first session |
| grinds | 5 | 32 | 8 | 3 h | dumb automation, first day |
| keeps | 10 | 162 | 41 | 16 h | the manager, the second survivor |

Jobs at 3 gives a skill its automation inside the first session, the
genre's timing. Grinds at 5 is the "you have been at this a week" mark,
eight game days in the main skill, three real hours of sim. Keeps at 10
line up with the cabin's recommended building level, so the same number
means "seasoned" everywhere; they cost 162 hours, 41 days at the
main-skill share, 16 real hours of sim, which is past where a first
survivor dies. A first survivor earns keeps only by putting the whole day
into one skill for 16 days; on the ladder's shares the keep is the second
survivor's rung, on day 41 in the skill it works most and on day 135 in
a side skill, and the heir carries it from there. Six skills times three
rungs is a two or three survivor arc, which is the four to six survivors
of the thirty-day target.

Grinds come before keeps on purpose. A grind ("fell trees forever") is
crude automation that wears tools and depletes the haul; a keep ("keep
camp at 40 kg firewood") is the manager that stops when met. The genre
orders them crude then smart.

The level curve stays 2(L-1)^2 hours. It also prices the recommended
levels (the bow at crafting 5, the cabin at building 10, each species'
hunting level), and moving the formula to make a gate quicker would move
all of those. The gates are set per rung and the formula is left alone.

### 2.2 Which skill gates an order

An order's skill is `skillOf(task, arg)` in `src/sim/skills.ts`. A task
that maps to no skill needs a named gate: `haul` follows woodcraft, since
what is hauled is logs. Any task added later that maps to no skill names
its gate skill beside its definition, the way a card names its discovery
route in the card prototypes; a task with neither does not ship.

A once job is a job whose until is "once", and a keep or a camp-has job
whose task yields nothing countable falls back to a once job today; the
gate reads the kind after that fallback, so "build a cabin" given as a
keep is a once job and never gated. A task that resolves to no skill and
has no gate entry cannot be ordered at all.

The gate reads the skill's level at the moment the order is added, and an
order once added stays: a keep given at woodcraft 10 is not withdrawn if
the heir lands with less (it will not, since the carry is what gave the
level, but the rule is stated so nothing has to check). The gate is on
adding, not on running.

### 2.3 What the player sees

The orders form shows every kind for every task and greys the ones the
skill has not earned, with the reason in the row: "jobs at Woodcraft 3,
you are 2" and "keeps at Woodcraft 10". A greyed kind is the promise of
the rung; nothing is hidden. The skills panel shows the three rungs per
skill as three marks on the level line, so the plateau signal of section
5 and the rung are read off the same line.

The first unlock of each rung in a run gets a log line: "You know the
woods well enough to set a task and walk away: jobs from Woodcraft." A
line per rung per skill per survivor, eighteen at most, none repeated.

### 2.4 The carry

Until F lands the gate is per survivor. When F's carry nodes land
(section 5.3) the heir's carried hours give the level and the level gives
the rung; there is no separate "unlock carried" node. An heir who carries
woodcraft to 10 has jobs, grinds and keeps in woodcraft from birth. The
tables audit built the first half early: a heir's skill minutes carry at
a quarter as a rule of the world, ahead of the tree, and the rung lines
already fire on the first tick for whatever level that quarter opens.

### 2.5 The reference player

The harness's beginner gives orders from day one today. Under the ladder
a from-scratch survivor has only once jobs until a skill reaches 3, and
no keeps for weeks. The reference list stays as written, as the wants of
a competent player, and a player script serves it the way a present
player would: once an hour it walks the list top down, gives each want
as the best kind the skill has earned (a keep as a keep at 10, as a
camp-has job at 3, as a once job below; a grind as a grind at 5, as a
five-times job at 3, as a once job below), ranked where the want sits,
and re-gives a want whose stand-in dropped off when it is unmet again.
The hour between ticks is the cost of playing by hand. The April gate
then measures a player who can exist. The kitted variant, when it is
used, is a survivor whose lineage carried the rungs, which is what a kit
means from F on; until F, it is the same script on a stocked camp.

### 2.6 Tests

- `giveOrder`, the door the Do panel and the player script use, refuses a
  kind below the gate with the reason and accepts it at the gate; a table
  test over the six skills and three rungs. A once job is accepted at
  level 1 in every skill. `addOrder` stays the raw mutator underneath, for
  tests and the stage set-ups, and `main.ts` is lint-banned from it.
- `haul` gates on woodcraft; every task that can be ordered has a gate
  skill, asserted over `TASK_IDS` the way `POLICY_COVERAGE` is asserted
  over cards.
- The stand-in for a gated want is the best kind earned, at each of the
  four levels 1, 3, 5 and 10.
- The unlock log line fires once per rung per skill per survivor.
- The reference player, from scratch, on the four seeds: alive on the
  April gate's day with the opening in place.

## 3. The horizon curve

The medium-term pacing number is the safe-away horizon: how long the camp
holds without the player, which B's forecast reads live and the harness
reads headless. It is the check-in interval. "Increasingly idle" means it
grows with progress: the rungs grow it first, the producers after.

| stage | what the player has | camp holds | real time | check-in cadence |
|---|---|---|---|---|
| first hour | manual only | nothing | 0 | present |
| first survivor, jobs and grinds | wood and food on grinds | 1 to 2 game days | 30 to 60 min | hourly |
| first survivor, keeps | keeps in one or two skills | 3 to 5 game days | 1 to 2 hours | a few times a session |
| heir, carried keeps and the baseline | keeps from birth, water, rack, stocks | 10 to 20 game days | 4 to 8 hours | two or three a day |
| producers | trap, cellar, water storage | to the away cap, 60 game days | 24 hours | daily |

The last row is a ceiling and never a resting state: the ramp ends every
set-up. The long tail's content is the season thresholds every 30 to 45
game days, the goals list and the march north, all F's.

Each row is a harness check: a scripted set-up at that stage, run
forward on four seeds the way the reference player is, and the day of
the first death read as the horizon. A stage is a skill profile, every
skill at 1, every skill at 5, or woodcraft and building at 10 with the
rest at 5, set on a stocked camp; its list is the reference wants, each
given once as the best kind that profile has earned, and no player
script, since the player is away. A set-up whose horizon falls outside
its band is a finding, in the same sense as a food source outside its
kcal band in the calibration pass. The bands are steered by, not hit.
The checks land with the ladder for the first three rows and with each
producer for the last. The first three are provisional until the
calibration pass moves the kcal and the burn they are measured in.

### 3.1 The rhythm

The horizon grows in one repeating step: a new capability makes a new
surplus or a new reach; the surplus or the reach makes a new bottleneck;
the bottleneck is what the next capability answers. The trap makes fish
surplus, surplus makes spoilage the limit, spoilage is the rack's 6 kg
and then the smokehouse and the cellar. The elk makes 150 kg and 20 kg
of hide, which make preservation and tanning the limit, which make the
cellar and the pit. Clothing and stored food make distance the limit,
and distance makes the hide tent and the second camp. The build order
follows the same step: a capability is promoted when the one before it
made its bottleneck the measured cause of death in the reference runs,
never because its dependency graph is elegant. Stone and the spare spear
are the plainest case of it so far: the hunt row's bottleneck was three
stone per five arrows and the fish row's was a spear lying at camp, and
both were read off the year probe's deaths before the winter loop
promoted a stone restock and a keep of one of every tool
(`2026-09-06-survidle-winter-loop-design.md`, section 0.1). The
capability spine
(`2026-09-04-survidle-capability-spine-design.md`) lists the steps and
what each leaves limiting.

## 4. The survivor ladder

Each survivor dies of the next ramp out, and the tree pays for the step
behind it. Gates are game days on the season spine; attention hours are
what falls out of days times cadence, and are the check against the gate
table's "hours of attention" bar.

| survivor | dies of | game days | attention | what the survivor learns the game is | pays into Lineage | the heir starts with |
|---|---|---|---|---|---|---|
| 1 | the basics: thirst, cold, hunger, before any keep | under 20 | about 1 hour | existence: fire, a roof, water, snares, in that order | a fire through a night, a week of water | the dim map, landing near the old camp, a quarter carry in one skill, so jobs from birth |
| 2 | the arrival axe wearing out, or the first cold snap | to first frost, 60 to 150 | 1 to 5 hours | surplus: the trap and the rack mean the day is not spent on today's calories | live 30 and 100 days, first frost, an elk | a half carry in two skills, so keeps from birth in the one it worked most and grinds in the other; warnings a week sooner; the cabin stands |
| 3 | winter: the dark, the cold snap, a hunted-out haul | to 1 December, day 245 | 5 to 10 hours | materials: an elk is hide, sinew, bone and fat, and Crafting blooms | winter under a roof, live 245 | a chosen landing month, a kit variant, the cellar keeps |
| 4 to 6 | the second winter: an older body and a worse axe | a full year | 10 to 20 hours | infrastructure, then range: the camp is a machine, and everything it makes is for going somewhere it could not | live 365, the second winter | the step north |

The fifth column is the row read from the player's side: each survivor
dies of the next ramp, and each also ends knowing something about the
game the last one did not. A row whose heir learns nothing new is a
finding of the same kind as one where the tree bought nothing.

Row 1 and the axe half of row 2 exist today (A's headless runs die of
the axe at day 67 to 86). The cold snap, winter and the second winter
need the ramps C (tool tiers), 4 and 6 (depletion) and 5 (the body) own,
and each row becomes checkable when its ramp lands, the way the roadmap
already says the ramp is complete when the reference player dies in its
second year. The carry cap at half is F's and stays: every survivor still
earns half of everything, and the keeps-from-birth rung needs level 10,
which a half carry of a level 14 ancestor gives.

Row 1 is the tester's first run and is read from the beacon; the
reference player is a competent set-up and at no Lineage is row 2's
survivor, which is where the baseline's runs die today. The reference
player checks rows 2 on at two settings, no Lineage and full, and a row
whose heir at full Lineage dies in the same band as the survivor before
is a finding: the tree bought nothing.

## 5. The skill wall and the tree

### 5.1 Two walls

Death is one wall. The second is content: the bow at crafting 5, the
cabin at building 10, each species' hunting level, C's tiers. A run that
survives must still stall against it, or levels are decoration. The
quadratic curve already stalls a run. What one life reaches, in its main
skill at 4 hours a day and in a side skill at 1.2, from the code curve
(section 2.1 says how the table is made):

| survivor lives | hours in the main skill | level reached | hours in a side skill | level reached |
|---|---|---|---|---|
| 20 days | 80 | 7 | 24 | 4 |
| 100 days | 400 | 15 | 120 | 8 |
| 245 days | 980 | 23 | 294 | 13 |
| a year | 1460 | 28 | 438 | 15 |
| two years | 2920 | 39 | 876 | 21 |

So the wall exists, and it is higher up than this spec first said: an
earlier version of this table, typed by hand, had a 245-day survivor at
11 and a year at 13, and every tier was placed against that. The real
curve reaches the top of the content, 30, in the main skill in a second
year, and never in a side skill in two; the plateau past 25 is steep,
since level 28 to 29 is 110 hours, 27 days at the main-skill share. The
wall is invisible and immovable today: nothing on the tree lifts it and
the player never sees it. Two fixes, both taken.

### 5.2 The plateau signal

"Woodcraft 9, next level in 6 days" on the skills panel, the hours to the
next level converted to days at this survivor's recent rate in the skill,
next to the rung marks of section 2.3. On a run with a two-week forecast
that line is the genre's "the next upgrade costs more than this session
earns", in the game's own unit.

### 5.3 The tree, per skill

F's Carry branch becomes two ladders per skill, separate nodes:

- **Carry.** "Woodcraft carries a quarter", then a half. Capped at half,
  as F rules. The carried hours give the level and the level gives the
  rung.
- **Rate.** "Woodcraft comes twice as fast", then four times. Practice
  minutes in the skill count double, then quadruple, for every survivor
  of the lineage from then on. With a quadratic curve a doubled rate is
  1.4 times the level in the same hours. Read against the real curve and
  the survivor ladder's day bands (20, 150, 245 and 365 days in the main
  skill, at rates of 1, 2, 4 and 4), the reach across survivors with one
  doubling each runs about 7, 25, 45, 50: the third survivor at four
  times the rate holds the whole of the content in its main skill by
  1 December, and the fourth hits the cap. That is a pacing finding, not
  a ruling: the ladder was sized against the hand-typed table section 5.1
  replaced, which put the same reach at 5, 7, 10, 14, 20. The node stays
  and its multipliers are re-derived from the generated tables when the
  rest of F specs the tree; the candidates are a smaller step (one and a
  half, then two) or a rate that counts only the hours under the last
  tier the lineage opened. Mastery and the pool are not rated: they are
  per action and cap at 100 hours a key, and rating them would fill the
  pool in a life.

Six skills times four nodes is 24 nodes in this branch alone, and a
lineage that hurried woodcraft and carried hunting plays differently from
the reverse. The tree's size for the gate goes from about twenty nodes to
about forty. The other three branches (Arrival, Knowledge, Settlement)
are as F has them.

The roadmap's rule that nodes are "things a lineage would know or hold,
never raw percentages" is dropped. It was specific and did no work. The
rule that replaces it is the one the roadmap applies to everything else:
a node earns its place by what it does to a bar in the gate table.

The rule that the tree never buys anything on the ramp stays. Carry and
rate move the skill wall; the axe, the body, the land and winter do not
read the skill level, and an heir at full Lineage still dies of them.

### 5.4 Content tiers on the reach

Each skill gets a tier at about 3, 5, 10, 15, 20 and 30. Which survivor
opens which is read from practice hours, not from the tier's number: the
table below derives it from the code curve, the main-skill share and the
survivor ladder's day bands, and a tier is placed by the row it lands in.

| tier | practice hours | game days in the main skill | reached by survivor | in a side skill by day |
|---|---|---|---|---|
| 3 | 8 | 2 | 1 | 7 |
| 5 | 32 | 8 | 1 | 27 |
| 10 | 162 | 41 | 2 | 135 |
| 15 | 392 | 98 | 2 | 327 |
| 20 | 722 | 181 | 3 | 602 |
| 30 | 1682 | 421 | a second year or the tree | never in two years |

So the first survivor opens 3 and 5 in the skill it works most, the
second opens 10 and 15 there and 5 and 10 at the side, the third opens
20, and 30 is a full year in one skill with the tree's carry behind it,
or a second year without. Read against the capability spine's rows this
moves no tier: the trap at Fishing 5 is the first or second survivor's,
which is where the surplus revelation belongs; the cabin at Building 10
is the second survivor's late or the third's, since Building is a side
skill for most; the cellar and the smokehouse at Building 15 are the
fourth's on the side share, which is the infrastructure row; the net,
stalking and seasonal water fall to the second or third; and the weir and
local mastery at 20 and 30 are the top of the arc. What the table
changed is the claim that survivor N opens tier N: two tiers a survivor
in the main skill, one at the side, and the sixth needs the tree. The
tiers are C's list, placed: wood by species (spruce, pine, birch, dead
standing pine), fishing by method and by water (spear, reading water,
basket trap, net, seasonal water, weir), hunting by species (D's roster
with its recommended levels), tool and clothing grades (E's coat and
trousers, C's stone and bone tools). Today nothing sits above 10, so a
surviving run hits the real wall at the top of the content, not the top
of the curve; each tier lands inside the sub-project that owns it (C, D,
E), and this spec only fixes the levels they sit at.

Recommended levels are soft, as C rules: under the tier the work is slow
and the odds are punished, never locked. The tier is where it becomes
worth doing.

Every tier has a name the player can remember and a log line when it
opens, the way the rungs of section 2.3 do: "Reading water: the shore
tells you what it holds." A tier whose best name is "+X%" is not a tier;
the percent a level between tiers is where that lives. A tier names the
skill it receives from and the thing outside its skill it gives, and the
capability spine's coverage test asserts both over every tier, producer,
rung and capability-unlocking structure in the tree; a species is not a
tier and is not asserted.

## 6. The evolution view

B's month number, logged once a game day into the survivor's log, so the
journal keeps the series. Three places draw it:

- **The journal**, as a line over the life so far, days on the x axis.
- **The epitaph's long form** in the cemetery, the whole life: rising
  while the set-up builds, falling as the ramp bites, ending at the death.
- **The tree screen between runs**, every ancestor's line side by side,
  so "prepare for the heir" is visible as a curve that ends higher each
  time.

B produces the number and F keeps the series. Until B lands the series is
empty and the views draw nothing; the log field and the drawing are F's,
the number is B's. One line a day is at most 730 numbers a survivor and
costs the save nothing.

## 7. Sequencing

The roadmap's build order, as the roadmap has it, and what each slot
contains:

1. **The ladder** (section 2) and the first three horizon checks (3), a
   small item of its own, right after the baseline. It goes before the
   pass so the pass measures a beginner whose opening is final, once; the
   gates are levels on a curve that does not move, and calibration only
   changes the real time it takes to reach them.
2. **The calibration pass**, as specced, which makes the bands honest.
   The three horizon checks are provisional until it runs and are re-run
   after it.
3. **F's core** (built), with the life record the journal reads and the daily
   forecast field (6) added to its list; the views draw once B exists.
   The gap between survivors sets the heir's landing month, so the
   reference player runs from every month from here on.
4. **The first producers**: C's basket trap, 3's water storage and the
   turf hut, which add horizon rows 4 and 5 and make survivor row 2
   reachable, since every run starves on days 40 to 48 without them.
5. **B**, whose month number fills the series.
6. **The rest of F**, with the tree as section 5.3 has it and the
   survivor ladder (4) as the reference player's check per row.
7. **C, D and E** place their tiers at the levels of 5.4 as they land.
8. **The remaining producers** add the last horizon row's check as they
   land.

## 8. Out of scope

- A click-per-action manual layer. The intent layer is the manual phase.
- A per-life level cap. The quadratic curve is the wall, the rate node
  moves it, and the plateau signal makes it visible; a hard cap would be a
  third mechanism for the same job.
- Rating mastery or the pool.
- Any change to the level formula or to the recommended levels.
- Tier content itself: which species, tools and methods sit at each tier
  is C's, D's and E's; this spec fixes only the levels.
