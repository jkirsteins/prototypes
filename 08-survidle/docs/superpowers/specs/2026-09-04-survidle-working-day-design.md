# Survidle: the working day, and food on day two

The calibration pass (`2026-09-04-survidle-calibration-pass-design.md`)
left every gate red and said why: the reference runner burns about 4,150
kcal a day, a fifth over the top of the burn band, and eats nothing in
April. The burn is not the rates any more, which now sit at their real
values; it is hours. The order list never ends, so the runner works 12 to
13.5 hours a day and rests only when it collapses. The food is the list's
order: three weeks of fire, roof and tools before the first snare, while
seed 79, the one seed that set snares, took 771 kcal a day from them.

This spec pulls two answers forward, measures, and stops when the April
gate is green. Neither is new content. The first is a body need every
runner gets; the second is a reorder of what a competent day one is.

## Decisions confirmed with the author

- **Pull items in order and stop when green.** The working day and the
  list reorder first, measured; then the basket trap (roadmap item C) if
  starvation still ends the runs, or item 3's water storage if thirst
  does. Each step is measured before the next.
- **The working day is a default in the runner**, stored on the player so
  the UI can expose it later. No UI now.
- **The roadmap stays current.** Whatever is pulled forward is written
  into the build order and the section markers in the same change.

## 1. The working day

### 1.1 The number

`Player.workHours`, hours of task work a day before the body calls it a
day, default 10. Saved; a save from before loads with the default. Not on
any panel yet.

### 1.2 The need

`BodyNeed` gains `"spent"`. It holds in `currentNeed` after hunger and
before "home before dark":

- It first holds when the ledger's record for today has `workMin` at or
  above `workHours * 60`. The ledger already counts every minute awake on
  a task other than rest, wait, night or sleep, so the runner reads the
  same number the report prints.
- When it first holds, `Player.restUntil` is set to the minute of the next
  dawn (`minutesUntilDawn` from now, on the run's start day), and the log
  says "A day's work done. You rest by the fire." once. The marker lives
  on the player, not the intent, so an order switching intents in the
  evening does not start the day again.
- It keeps holding while `state.minute < restUntil`. Past that the marker
  is cleared and the runner works. The day roll resets `workMin`, so the
  count starts fresh with the dawn.

The step is the camp step the cold need uses: walk to camp if not there
("for the evening"), make a fire if the means are at camp, then rest,
"resting by the fire after the day's work" with a lit fire and "resting
after the day's work" without one. A rest completing under this need just
rests again; there is nothing to judge, unlike the cold rest.

At nightfall a spent body goes to bed whatever its energy: the sleep
clause gains `cal.isNight && spent`. Rest gives energy back at six an
hour, so an evening by the fire would otherwise carry a body past the
night clause's 60 and leave it sitting up all night. Sleep already runs
until dawn or the cap.

**Water before rest.** A person drinks their fill before sitting down for
the evening: a spent body standing at open water drinks and only then
walks back to the fire, so the spent need yields to thirst while
`water < WATER_FULL - 0.5` and a source is under foot. Away from the
water the stores keep, since the auto-drink reaches a vessel or the camp
pile without getting up. A rested body that is thirsty at nightfall gets
up to drink first: the `cal.isNight && spent` clause holds only while the
thirst is answered or unanswerable, and the energy clause is untouched -
sleep outranks thirst for a body that has collapsed. A sleep set aside
for the fire ends the night's decision rather than freezing it: the
intent's sleep need is cleared when the task is set aside, so the next
minute decides bed or otherwise afresh, and the sticky need lives only as
long as the sleep that started it.

### 1.3 What does not change

- Manual clicks. The need lives in the intent runner; a player who keeps
  clicking keeps working. This is the player's choice, as the spec on
  away risk says.
- The horizon stages and B's forecast run the same runner, so they get
  the working day by construction; the spec's tests say so.
- The collapse threshold, the bedtime thresholds, the sleep cap and every
  burn constant.

### 1.4 What it should do to the numbers

Three hours less work a day at 200 to 400 kcal an hour and three more at
rest is about 600 kcal a day, from 4,150 to near 3,500, the top of the
band. The report says where it lands.

## 2. Food on day two

`REFERENCE_ORDERS` is what a competent player writes on day one, and a
competent day two sets snares. The knife (two stone, a stick, a cordage,
45 minutes, no tool) and the snares (a stick and two cordage each, the
knife, 20 minutes; set five) move up to right after the fire is lit,
before the felling and the lean-to:

```
keep fill 2, stone 8, sticks 10, bark 12, cordage 4,
fire pit, fire drill, keep light 1,
craft knife (once), keep craft 1 snare, set snare (times 5),
keep chop 4, keep split 60, lean-to,
bark bucket 2, fishing spear,
keep cook 1 fish, keep cook 1, keep fish 1 any, keep berries 2,
drying rack, keep hang 10,
bow, keep arrows 10, keep hunt 2 any, keep axe 1, chop forever
```

The fish keep moves from below the snares to right after the cook keeps,
so the spear is used the day it exists. The roof slips by the knife's 45
minutes and the snares' two hours plus their cordage, which the cordage
keep refills from bark.

**The fallback.** If the measured run shows cold deaths rising against the
pass's April run (one death by cold on seed 79 on day 16), the knife goes
back to its old place after the lean-to and only the snares move, to
right after the knife. The report decides; the spec names both orders so
the plan can measure them.

## 3. Measure, record, stop

After both land: `npm run reference` (April, the gate), `npm run reference
-- --kitted 17 19 42 79 60`, `npm run horizon`. The numbers go into the
roadmap's calibration section as a paragraph headed by what was pulled
forward, and the build-order paragraph under "The eight sub-projects, in
order" gains the working day as a step between the calibration pass and
F core, marked built.

The stop rule reads the deaths:

- April green on all four seeds with the food clause: stop; F core is
  next as the roadmap says.
- Starvation still ends the runs: the basket trap, roadmap item C's first
  producer, gets its own brainstorm and spec, pulled forward ahead of F.
- Thirst ends them: item 3's water storage is pulled forward instead, and
  the roadmap's build order says so.

## 4. Tests

- `workHours` defaults to 10 in a new game and on a save without it.
- A runner on a felling order stops at ten hours: after a day on seed 17
  the intent's need reads "spent", the step text is the rest text, the
  ledger's `workMin` for that day is under 600 plus one task's length,
  and `restUntil` points at the next dawn. The log holds the line once.
- At nightfall the spent body sleeps whatever its energy.
- At dawn the marker is clear and the runner is back on its order.
- A manual chop started by hand past ten hours keeps going: no intent, no
  need.
- The reference list's order: the knife is the first order after the light
  keep; the snares follow it; the fish keep follows the cook keeps; the
  count is unchanged.

`npm test` is at 9.1 seconds against a ten-second budget; the day-long
test is one run of one seed and stays alone in its file.

## 5. What the first measurement pulled next

Measured with the working day and the day-two snares in place, the April
run read: two seeds starve near the gate day, one dies of thirst on day 3
and one of wolves on day 4 after a dehydrated night. Three diagnoses
named the causes, and the author chose the answers:

- **Snares are set and catch, and nothing collects.** Collection is a side
  effect of walking onto the heath, and after the fifth snare nothing on
  the list goes there, so a fox takes every catch. The answer is a chore
  in the runner (5.1), not an order.
- **The thirst chain cannot cut an ice hole.** The shore ices on day 2,
  the runner carries the axe that cuts a hole, and the chain only walks to
  a hole that is already cut. The answer is the cut in the chain (5.2).
- **No vessel until day three or four.** The knife and the bucket sit
  behind the lean-to. The answer is the knife and one bucket on day one
  (5.3), measured against the cold the way section 2 was.

### 5.1 Checking the snares

`BodyNeed` gains `"snares"`. It holds in `currentNeed` after hunger and
before "spent", by day only, when the region's `snareCatch.count` is
above zero and a walk to the region's heath spot is open. Its step is the
walk to the heath ("to check the snares"); arriving on a heath cell
already collects the catch through `collectSnares`, so the chore ends the
minute the runner stands there. A person checks their snares on the way
past, so the chore sits above the evening's rest and below eating and
drinking. Manual play is untouched: a player who set snares by hand walks
back by hand.

### 5.2 Cutting the ice hole

The thirst chain gains a site to cut: when the shore is iced, no hole is
open, and the runner holds an axe, the nearest waterside cell a walk can
reach is a source. `canQuench` counts it; `thirstyStep` walks there ("to
open an ice hole") and, standing on it, takes the ice-hole task the manual
panel already offers (twenty minutes with the axe, and the hole skins over
by morning). The next minute the hole is open and the chain drinks from it
as it does today. A runner without an axe is where it was.

### 5.3 The knife and a bucket on day one

The knife and one bark bucket move to right after the fire is lit, before
the felling and the lean-to; the second bucket and the snares stay where
section 2's fallback put them, after the lean-to:

```
keep fill 2, stone 8, sticks 10, bark 12, cordage 4,
fire pit, fire drill, keep light 1,
craft knife (once), craft bark bucket (campHas 1),
keep chop 4, keep split 60, lean-to,
craft bark bucket (campHas 2),
keep craft 1 snare, set snare (times 5),
fishing spear, keep cook 1 fish, keep cook 1, keep fish 1 any, keep berries 2,
drying rack, keep hang 10,
bow, keep arrows 10, keep hunt 2 any, keep axe 1, chop forever
```

The roof slips by the knife's 45 minutes and a bucket's 20. The fallback
is section 2's: if the measured April run shows cold deaths rising
against the run before it (none), the knife and the bucket go back after
the lean-to and only the ice-hole cut and the snare chore stand.

**Measured and rejected.** With the snare chore and the ice-hole cut in
place and the list as section 2 left it, the April gate passed on all four
seeds with the food clause, the first time it has. This order then cost
two seeds to the cold on days 4 and 5, and the fallback two more on days
9 and 10. A roof by the second night is what the opening cannot spare;
the ice-hole cut answers the shore icing without a vessel, so the bucket
can wait behind the lean-to. The list stands as section 2 left it.

### 5.4 Measure again

The three runs of section 3, the roadmap paragraph amended with the new
numbers, and the stop rule read again.

## 6. Out of scope

- The horizon's thirst rows, unless the stop rule names them.
- The gate, the bands and the survivor rows.
- The basket trap, until the stop rule pulls it.
- Any UI for the working day.
