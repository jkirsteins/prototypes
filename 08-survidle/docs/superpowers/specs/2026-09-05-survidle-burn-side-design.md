# Survidle: the burn side

The first producers (`2026-09-05-survidle-first-producers-design.md`)
were measured and the roadmap's calibration section read the result: the
gap both gates die of is on the burn side. Work burn reads over its band
(700 to 1,700 kcal a day) on every seed and every heir, before the
producers and after them, because the runner works its ten hours whatever
food it holds and whatever its body has left. Measured again at main
7066694 with `npm run reference -- --heir`, the gate week on the four
April seeds:

| seed | burn/day | work | of which walk | hours at work | eaten/day | fed at day 26 |
|---|---|---|---|---|---|---|
| 17 | 3,450 | 1,763 | 497 | 10.4 | 3,105 | yes |
| 19 | 3,648 | 1,884 | 718 | 10.0 | 2,971 | no |
| 42 | 4,000 | 2,030 | 783 | 8.7 | 1,657 | no |
| 79 | 3,860 | 1,929 | 689 | 10.0 | 1,979 | yes |

April reads 2 of 4, the heir gate 1 of 4, and all eight deaths are
starvation between day 29 and day 59. The band for the whole day is
2,500 to 3,500. Seed 19 reads unfed while eating 2,971 a day because the
clause is a 04:00 snapshot of a stomach that sits at zero whenever intake
is under burn, however much is eaten.

This spec makes the working day read the body and the larder, changes the
gate's food clause to read the week, measures each rule alone and both
together on both gates, and keeps what the measurement supports. Neither
rule is new content; both are clauses in a body need the runner already
has.

## Decisions confirmed with the author

- **Build both rules, measure, keep what is green.** The reserve rule and
  the food-in-hand rule both land. Each is measured alone and both
  together, on the April gate and the heir gate. A rule that moves neither
  the gate week's burn nor the death days is withdrawn, not left in as a
  constant. The roadmap records all four readings.
- **The reserve rule steps on the existing warnings.** The three fat
  warnings the body already prints (thin, ribs show, wasting away) are the
  steps, each logged once as it deepens, so the player can read why the
  day is short.
- **Tomorrow's food in hand is a half day, not the end of the day.** Chores
  and the roof still get their hours; a full larder never stalls the hut.
  "In hand" is read against the body's own week of burn from the ledger,
  and against the band top before a week exists.
- **The food clause reads the week's intake.** Fed is a beginner's day of
  food eaten on average over the week before the checkpoint, the same 500
  kcal the clause already uses, read over seven days instead of at an
  instant. April is expected to read 4 of 4 from the clause alone on
  today's numbers; the burn rules are then judged on the gate week's burn
  and the death days, not the pass count.
- **The work is on main, spec then plan then build**, all pre-approved.

## 1. The day the body will do

`Player.workHours` (10) stays the working day. A new reading in
`src/sim/body.ts`, `dayHours(state, world)`, returns the hours the body
will do today and why: `{ hours, reason }` with `reason` one of `"day"`
(the full working day), `"thin"` (the reserve cut it) or `"fed"` (the
larder cut it). `spentNow` reads `dayHours` where it read `workHours`,
and gains the world argument the larder needs. Both rules apply only
through the runner, as the working day does: a player who keeps clicking
keeps working.

### 1.1 The reserve steps

The fat thresholds the warnings in `src/sim/player.ts` use become
exported constants, `FAT_THIN` (0.75), `FAT_RIBS` (0.5) and
`FAT_WASTING` (0.25), as shares of `FAT_FULL`, and the warn lines read
them. `THIN_DAY` in body.ts is the table, deepest last:

| fat under | share of the working day | line, logged once per crossing |
|---|---|---|
| `FAT_THIN` | 0.8 | Too thin for a full day's work. |
| `FAT_RIBS` | 0.6 | Your ribs show; the day is shorter still. |
| `FAT_WASTING` | 0.4 | Wasting away, a few hours' work is all you have. |

The deepest step whose threshold the fat is under is the step in force;
its share times `workHours` is the day. `Player.thinStep` is the index of
the step in force, 0 for none, saved and defaulting to 0 on a save
without it. When `dayHours` finds a deeper step than the marker, it logs
that step's line once and moves the marker; when it finds a shallower
one, it moves the marker silently, so a body fed back past a step and
thin again reads the line again, once per crossing, the way the warning
it follows does. A twelve-hour player steps down from twelve.

### 1.2 Tomorrow's food in hand

`foodInHand(state, world)` is the kcal of what the body will eat on its
own, in the pack and at this region's camp pile together: every food in
`AUTO_EAT_ORDER` that `edible` allows right now, at its `kcalPerKg`. Raw
meat is not counted, since the body never eats it unasked; berries past
the day's ceiling are not counted, since the body refuses them.

`dayBurn(state)` is a day's burn for this body: the ledger's
`weekBefore(today)` summed over its five buckets, and `BURN.day.hi`
(3,500) while the ledger has no day on record. With tomorrow's food in
hand (`foodInHand >= dayBurn`), the day is `FED_DAY_SHARE` (0.5) of
`workHours`.

The arrival kit is one day's food at the band top, so a first day from
the boat is a half day until the kit is eaten into. The measurement in
section 3 reads what that costs the opening; the roof by the second
night is what the opening cannot spare, and if it is lost the reading
says so and the rule's fix is a decision for the author, not a silent
change.

### 1.3 The shorter applies

`dayHours` takes the smaller of the two days. On a tie the reserve names
the reason, because it is the body and not the larder that cannot work.
When the day ends under the food rule, the day's-work-done line reads
"Food for tomorrow in hand: a short day. You rest by the fire."
(`FED_LINE`); otherwise it reads the line it reads today.

### 1.4 What does not change

- The marker `restUntil`, the dawn it points at, the sleep clauses, water
  before rest, the snare chore and the ice-hole cut.
- Manual clicks. No need, no line.
- The horizon stages, the kitted run, the heirs and B's forecast run the
  same runner and get both rules by construction.
- Every burn constant, the bands, the gate day and the survivor rows.

## 2. The food clause

`fed` in `src/sim/reference.ts` takes the checkpoint's `WeekAverage`
instead of the stomach and the camp: fed when the week has at least one
day on record and its `eaten` per day is at or above `FOOD_CLAUSE_KCAL`.
The constant's comment says what it now is: kcal a day eaten over the
week before a checkpoint that counts as a beginner's day of food, the
middle of the April beginner band the gate day is derived from. The
checkpoint still prints the stomach and the camp's food; neither decides
the clause. `passed` is unchanged in shape: alive past the gate day and
fed at the checkpoint taken there.

## 3. Measure, record, decide

Four readings of `npm run reference -- --heir` at the built state: the
clause alone (both rules off), the reserve rule alone, the food rule
alone, both. The rules are switched off for a reading by a local edit of
`dayHours` that is never committed; the reading with both on is the
committed state. For each reading the record is: April passed N of 4, the
heir gate N of 4, the gate week's burn and work per seed, the hours at
work, and every death day and cause.

What each reading is judged on:

- The gate week's work bucket against its band (700 to 1,700) and the
  day against its band (2,500 to 3,500), per seed.
- The death days on the first lives and the heirs.
- The opening: a cold death on days 1 to 10 that the baseline does not
  have is the food rule reading the arrival kit, and is recorded as such.

A rule stays when it moves the gate week's burn toward its band or moves
a death day later on either gate without a new death earlier on the
other. A rule that moves nothing is withdrawn with its constants, its
lines and its tests, and the roadmap says it was measured and why it
went. The clause stays whatever the rules do; it is the gate's reading
and not a lever.

The readings and the decision go into the roadmap's calibration-pass
section as a paragraph headed "Measured with the burn side", the
build-order paragraph under "The eight sub-projects, in order" gains the
burn side between the first producers and B, marked built, and the F
row's line that names the burn side as the next change is updated to
point here. The README's "Where the numbers live" gains nothing: the
rules live in body.ts, which it already names.

The stop rule after the readings: the deaths are read again. What the
survivors still die of, and on what day, is what the summary to the
author names as the next thing to pull or to add to the roadmap.

## 4. Tests

In `tests/workday.test.ts`:

- The thresholds are the warnings' own: `[FAT_THIN, FAT_RIBS,
  FAT_WASTING]` is `[0.75, 0.5, 0.25]`, `THIN_DAY` reads them in that
  order with shares `[0.8, 0.6, 0.4]`, and `FED_DAY_SHARE` is 0.5.
- The day steps down as the fat drops (10, 8, 6, 4 hours at full, 0.7,
  0.4 and 0.2 of the reserve), each line logs once, a second reading at
  the same step logs nothing, fat restored and dropped again logs the
  line a second time, and a twelve-hour player reads 9.6 at the first
  step.
- Food in hand counts cooked fish at camp and dried meat in the pack
  together, not raw meat, and not berries past the day's ceiling.
- With no ledger day, `dayBurn` is the band top: 3,400 in hand is a full
  day and 3,500 a half day with reason `"fed"`; with a week burning 2,700
  a day on record, `dayBurn` is 2,700 and 2,700 in hand is a half day.
- A new game's kit is a day's food, so day one reads a half day.
- The shorter applies: ribs (6) against food in hand (5) is 5 with reason
  `"fed"`; wasting (4) against food in hand is 4 with reason `"thin"`.
  `spentNow` at four hours on the wasting day logs the plain line, and
  at five hours on a fed full-fat day logs `FED_LINE`.
- A kitted runner on a felling grind, larder full, rests after a half
  day: the day's `workMin` is at or above 300 and under 360, `restUntil`
  is set, `FED_LINE` is logged once.
- `thinStep` survives a save and defaults to 0 on a save without it.
- The existing ten-hour tests strip the kit's dried meat first, so they
  still measure the full day.

In `tests/reference.test.ts`:

- `fed` reads a week: 500 a day is fed, 499 is not, a week with no days
  is not. Seed 19's shape (stomach 0, camp 0, a week eating 2,971) is
  fed; a week eating nothing with 3,000 in the stomach is not.
- `campFoodKcal` still counts every food at camp.

The day-long felling test stays one run of one seed; the new tests are
unit-level and add well under a second.

## 5. Out of scope

- Any UI for the working day or its steps.
- The snare yield, which reads over its band on every seed, and every
  producer's numbers.
- The gate day, the bands and the survivor rows.
- B, the risk forecast, which follows this in the build order.
