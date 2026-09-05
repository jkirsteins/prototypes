# Survidle: the calibration pass

The roadmap (`2026-09-03-survidle-realism-roadmap.md`) carries two tables
of what the north yields a lone person, in kcal a day, and a burn band to
set them against. The game's numbers were never measured against them:
nothing in the sim sums kcal a day, no test pins the berry yield or the
activity rates, and the April gate's 21 days was read off a run rather
than off the tables. The ladder (`2026-09-04-survidle-idle-curve-design.md`)
then landed three horizon bands that are provisional until the kcal and
the burn they are measured in are honest.

This pass is the measuring. It adds the instrument (a kcal ledger and a
report that reads it against the tables as code), moves the numbers the
report shows to be off, sets the gates from the tables, and re-runs the
horizon checks. It moves numbers the game already has, plus the two small
mechanisms that make berries honest. It adds no content.

## Decisions confirmed with the author

- **Burn: measure first.** The ledger splits burn into buckets and the
  report shows each against its real share; the pass moves the one
  furthest out, and one only. The lever is not chosen in this spec.
- **Berries come from real numbers, not a halving.** A bilberry is about
  500 kcal a kilo and a hand picker gets near a kilo an hour; both stay.
  What was missing is the real ceiling on eating them, which is soft.
- **The fuel keep moves to F core.** "Keep the fire at N kg", banking
  before a trip and relighting on return are behaviour, not numbers, and
  they land with the world that persists.
- **The 2 of 4 April gate is the beginner's real April.** The once-job
  walking cost stands and the two thirst deaths stand. The gate is re-set
  from the tables and its standing is recorded, red or green.
- **Sleep is set from real need.** Seven to nine hours a night; a
  twelve-hour day is a finding about the day before it, and the energy
  budget is made to balance so it stops happening on its own.

## 1. The kcal ledger

Every kcal the game moves passes through two seams: `produce` in
`tasks.ts` (and the snare collection beside it) for yield, and
`stepPlayer` in `player.ts` for burn, with `eat` in `actions.ts` between
them for intake. The ledger sits on those seams.

### 1.1 The record

```ts
type YieldSource = "fish" | "snare" | "hunt" | "berries" | "kit";

interface DayLedger {
  day: number;                                   // calendar day, 1-based
  yield: Record<YieldSource, number>;            // gross kcal produced
  eaten: number;                                 // kcal credited by eat()
  burn: { base: number; activity: number; walk: number; cold: number; sick: number };
  sleepMin: number;
  workMin: number;                               // awake and on a task that is not rest
}
```

`state.ledger: DayLedger[]`, one entry per game day in order, appended
when the calendar day changes. A 250-day run is 250 small records; the
save carries them. It lives in state rather than in the harness because
F's epitaph selector and away report read the same numbers later, and
because a per-day table is what the journal's forecast field draws from.

### 1.2 Crediting

A new module `src/sim/ledger.ts` owns the record and its four credits;
nothing else writes to `state.ledger`:

- `creditYield(state, source, kcal)` at the four sites that make food:
  the fish effect (kg times the cooked value, 1,000 a kilo, since raw
  fish is not edible), the hunt effect (meat kg times 1,500 plus fat kg
  times 9,000), the snare collection (the same per hare) and the berry
  effect (kg times 500). The kit is credited at `newGame` and at
  `kitOut` for the kitted run. Yield is gross kcal of the edible form,
  which is what the tables count; rot and the rack's loss are the
  difference between yield and eaten, and the report shows both.
- `creditEaten(state, kcal)` in `eat`.
- `creditBurn(state, buckets)` in `stepPlayer`, per minute, with the
  buckets split as section 3.1 says.
- `creditTime(state, asleep, working, minutes)` in `stepPlayer`, from
  the activity class the step already computes.

The day roll lives in `creditBurn`, since every minute passes through
it: when the calendar day differs from the last record's, a fresh record
is pushed. A save from before the ledger loads with an empty array.

## 2. The tables as code, and the report

### 2.1 `src/sim/tables.ts`

The roadmap's tables become data, so the report and the tests read one
source:

- `APRIL` and `LATE_AUGUST`: per source, the beginner and experienced
  bands in kcal a day, as the roadmap gives them. The game's sources map
  onto the table rows: `fish` to "hook, line, spear fishing", `snare` to
  "small-game traps", `hunt` to "active small-game hunting" plus "large
  game" (the report sums those two rows' bands), `berries` to "plants,
  roots" in April and "berries and plants" in late August. Rows the game
  has no source for (passive fishing, birds and eggs) are printed with a
  dash so the gap is visible.
- `BURN`: the day band 2,500 to 3,500, and its shares: base 1,600 to
  1,800 (the resting burn of a fit 70 kg adult), cold 100 to 300 (cold
  thermogenesis in clothing), activity and walking together whatever
  takes the day into the band, so 700 to 1,700.
- `SLEEP`: 7 to 9 hours a night.
- Per-unit real numbers: berries 400 to 600 kcal a kilo, hand picking
  0.5 to 1.5 kilos an hour at a full patch, the berry ceiling of section
  5.

Bands are steered by, not hit: a number outside its band is a finding
the report prints, and only the tests in section 9 make a band a
failure, for the per-unit constants alone.

### 2.2 What the reference report prints

Per seed, at each checkpoint (day 21 or the gate day, 90, 245) and at
death, the previous seven days averaged:

```
day 26: kcal 0, fat 31.2 kg, water 2.1 l, warmth 61, health 88
  yield/day  fish 310 (in band)  snare 0 (in band)  hunt 0 (in band)  berries 0 (in band)  kit 0
  eaten/day  290   wasted/day 20
  burn/day   3,140 (in band) = base 1,680 + activity 620 + walk 640 + cold 200 + sick 0
  sleep/day  8.4 h (in band)   work/day 11.2 h
```

Then the standing line the report has today, with the food clause of
section 7 added to it, and the `passed N of M` line. The horizon report
gains the same block at each stage's death, so a stage outside its band
shows what killed it in kcal.

## 3. Burn

### 3.1 The buckets

For each minute, with the rate the activity class already gives:

- **base** is the sleep rate (70 an hour) for every hour of the day,
  asleep or not. It is the game's resting burn, and 70 times 24 is
  1,680, which is what a fit adult's resting burn is.
- **activity** is the class rate above base for rest, light and heavy
  work.
- **walk** is the walking burn above base, including the terrain
  divisor, the deep-snow doubling and the load surcharge.
- **cold** is the increment the cold multiplier adds (0.3 of the burn
  before it) when the felt temperature is under zero.
- **sick** is the increment the sickness multiplier adds.

### 3.2 The rule

After the ledger and the report land and before any other number moves,
one run of `npm run reference` on the four April seeds is the evidence.
The bucket whose seven-day average sits furthest outside its share in
`BURN`, measured as a multiple of the share's width, is the lever. The
pass moves that bucket's constant or rule until the bucket sits in its
share, and moves nothing else in the burn model. Two candidates the
current shape suggests, written here so the plan can check them and not
so the decision is made: rest at 100 an hour puts 30 above base on
every idle hour, and walking at 300 divided by terrain speed reaches
1,200 an hour in deep snow where a real person on snowshoes burns 500
to 700. The report decides. The decision, the numbers before and after
and the seed lines go into the roadmap's calibration section.

## 4. Sleep

### 4.1 The budget

Energy restores at 12.5 an hour asleep, so eight hours restores 100.
Today the awake drain is 8 an hour on a task and 4 an hour on camp rest,
so a day of twelve hours' work and four of camp rest drains 112 against
the 100 that eight hours give back. The runner runs a deficit every day,
hits the collapse threshold every few days, and sleeps in the afternoon:
that is the twelve-hour day the roadmap saw.

The budget is made to balance: twelve hours on a task plus four of camp
rest drain exactly what eight hours asleep restore. With camp rest at 4,
the task drain is 7 an hour. A sixteen-hour grind day then needs nine
hours to recover, which is real, and a thirteen-hour day with three of
rest balances at eight.

### 4.2 The rules

- Sleep length is `min(9 h, max(1 h, until dawn, energy needed / 12.5))`.
  The cap was ten hours.
- Bedtime is unchanged: energy at 20 at any hour, or under 60 at night.
  The collapse threshold is what a real day of overwork does.
- Sleep outranks thirst overnight, unchanged. A runner that goes to bed
  with an empty vessel dies of thirst in the morning, and that is the
  April the gate records.
- The report prints hours asleep a day. A day over ten hours is a
  finding about the day before it; the plan's browser pass reads one.

## 5. Berries

### 5.1 What is real

Bilberries and lingonberries are about 500 kcal a kilo, 85 percent
water and 10 percent sugar, half of it fructose. A hand picker at a
good patch takes near a kilo an hour; a beginner takes less. So the
picking rate at level one drops from 1.0 to 0.7 kilos a pick, and the
foraging pool factor (1.2 and 1.5) carries it to 0.84 and 1.05. The
kcal a kilo stays at 500.

What the game lacks is the ceiling on eating them. The gut absorbs
fructose poorly past a few tens of grams a sitting, so two to three
kilos over a day absorb well and a growing share passes through above
that; fresh bilberries in quantity are a known laxative, which costs
water; and fresh berries do not keep. A starving person can push to
three or four kilos a day at a falling return and a rising cost.

### 5.2 The soft ceiling

`Player.berriesToday`, kilos eaten since the day roll, reset with the
ledger's day:

- Up to 2 kilos: full credit, 500 a kilo.
- From 2 to 4 kilos: half the kcal are credited, and for the rest of
  the day the water loss carries the same multiplier sickness does
  (1.2). The log says "Your stomach is turning." the first time the
  line is crossed.
- At 4 kilos the body will not eat berries again that day: auto-eat
  skips them and the eat button greys them with "not another berry
  today". The log says "You cannot face another berry." once.

A day on berries alone is then 1,000 to 1,500 kcal, at the top of the
beginner band and inside the experienced one, and never a full ration,
which is what the tables say a berry season is worth for one person.

### 5.3 Spoilage

Berries join `SPOIL_HOURS` at 72 hours above 0 C, the cooked food
figure. A picking day beyond what can be eaten in three days is waste,
and the ledger's wasted column shows it.

### 5.4 The reference list

`REFERENCE_ORDERS` has no berries want. It gains `keep("berries", 2)`,
two kilos at camp, after the cook keeps and before the fish keep. Out of
season it blocks harmlessly on "nothing ripe yet"; the ladder gives it
as the best kind the profile has earned. Patch knowledge, where the good
stands are, is F's trails and is not here.

## 6. A start day

### 6.1 The harness

`newGame(seed, startDoy = START_DOY)`: the clock starts at 08:00 on that
day of year, `lastDay` and the weather's rolled day are set to it so no
catch-up roll fires, and the weather's opening state comes from the
season: when the seasonal mean at that date is above zero, ice and snow
start at zero; otherwise the April values stand. The scripts take
`--start=<doy>`; `npm run reference -- --start=200` is a mid-July run
and `--start=235` late August. The horizon script takes the same flag.

### 6.2 The browser

`?day=<doy>` beside `?seed=` in `main.ts`, a test aid the way `?speed=`
is, so the browser pass can watch a July picking day.

## 7. The gates

### 7.1 April from scratch

The target day is derived from the constants rather than written down:

```
(FAT_FULL + start kcal + kit kcal) / (BURN.day top - APRIL mixed beginner floor)
= (80,000 + 5,000 + 3,500) / (3,500 - 200) = 26.8, floor 26
```

That is a beginner who eats the least the tables allow and burns the
most: the day the fat runs out. `REFERENCE_TARGET_DAY` becomes that
expression, with a test that recomputes it, so it moves when the burn
band or the kit moves and not otherwise. Today it reads 26.

The food clause: at the checkpoint, the stomach is above zero or camp
holds at least 500 kcal of food, the middle of the April beginner band.
A seed that reaches the day on fat alone with nothing to eat fails,
because the gate measures the loop the list runs and not the reserve.

The pass criterion stays all four seeds. Seeds 42 and 79 die of thirst
inside three days by the decision above, so the gate reads at most 2 of
4 until the reference script's opening changes, and the roadmap records
the standing as a number, not a promise.

### 7.2 The kitted run

`--kitted` gets a pass line: alive on day 30 with the food clause. It
holds until C's trap moves it to December. The report prints it the same
way.

### 7.3 Late August from scratch

`--start=235` on the four seeds, from the arrival kit: the pass line is
alive on the first day the weather lays snow, the day the report prints
as "first snow, day N". It is run once section 6 lands and its standing
recorded beside the April one. The roadmap had it waiting for F's
landing month; the start day makes it runnable now.

## 8. The horizon checks, re-run

After sections 3 to 5 have moved their numbers, `npm run horizon` is run
on the four seeds and the twelve rows recorded in the roadmap beside the
ladder's numbers. The bands `[0, 2]`, `[1, 2]` and `[3, 5]` do not move
in this pass. A row still outside its band is a finding for F core and
B, with the kcal block of section 2.2 saying what ended it.

## 9. Tests

- **Ledger sums.** A day of stepping credits burn equal to the kcal and
  fat the player lost, and eaten equal to what `eat` credited; the day
  roll pushes exactly one record at the calendar boundary; a pre-ledger
  save loads with an empty array.
- **Buckets.** An hour asleep is 70 base and nothing else; an hour of
  heavy work at minus five is 70 base, 330 activity and a cold bucket of
  0.3 of the sum; an hour's walk in deep snow puts the doubling in walk.
- **The energy budget.** Twelve hours on a task and four of camp rest
  drain what eight hours asleep restore, as an assertion on the
  constants. The sleep cap is nine hours. The existing threshold tests
  (20, 59 and 61 at night, rest at 4 an hour under 20) stay.
- **Per-unit constants in their real bands.** Berries kcal a kilo, the
  level-one picking rate, the sleep cap, base burn times 24, each
  against `tables.ts`. These are the numbers the pass found unasserted.
- **Berries.** 2 kilos credit 1,000; the third kilo credits 250 and sets
  the water multiplier; the fifth is refused and auto-eat passes over
  berries for the day; the counter resets at the day roll; berries
  spoil at 72 hours and not at or below zero.
- **Start day.** A July start reads the right calendar day at 08:00, has
  no ice or snow, and fires no catch-up roll; an April start is
  unchanged.
- **The gate.** `REFERENCE_TARGET_DAY` equals the derivation; the food
  clause fails a seed with an empty stomach and an empty camp and passes
  one with 500 kcal at camp.
- **Existing tests that move.** The terrain burn ratios in
  `storm.test.ts` and the horizon day assertions in `horizon.test.ts`
  are re-read against the new numbers; they pin the mechanism, not the
  day.

`npm test` stays under ten seconds. The reference and horizon runs stay
out of it, as they are now.

## 10. Sequencing

1. The ledger and the tables module, and the report reading them (1, 2).
2. One measuring run of the reference on April; the burn decision by
   the rule in 3.2, recorded in the roadmap, then the lever moved.
3. The energy budget and the sleep cap (4).
4. Berries: the rate, the soft ceiling, spoilage, the reference want (5).
5. The start day in the harness and the browser (6).
6. The gates, the derivation and the food clause; the kitted pass line;
   the late-August run (7).
7. The horizon re-run and the roadmap's numbers (8).
8. The browser pass on a July seed: a picking day, the stomach turning,
   the hours asleep in the panel.

## 11. Out of scope

- The fuel keep, banking and relighting: F core.
- The "plants, roots, overwintered food" row: the game has no such
  source, and adding one is content.
- Patch knowledge and berry stands by terrain: F's trails.
- The sleep-over-thirst order overnight.
- Water treatment (5), the trap and the cellar (C, 3), skill tiers (C).
- Moving the horizon bands or the survivor ladder rows.
