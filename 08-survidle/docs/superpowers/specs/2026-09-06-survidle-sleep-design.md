# Survidle: sleep, a two-process body

The runner goes to bed at sunset and wakes at one in the morning. In
December that is a body laid down at 15:42 because it is dark and the
day's work is done, sleeping its nine-hour cap, and waking into nine
more hours of dark with nothing it is allowed to do but rest. Nobody
lives like that. A person sits by the fire through the evening, sleeps
across the middle of the night, and does the dark morning's chores by
firelight until the light comes; an exhausted one falls asleep early
and sleeps longer; a June body is up with the light and dozes in the
afternoon when the short night has not paid its debt.

The sim has one number, `energy`, doing two jobs, and a set of clock
rules written over it: a bedtime that is sunset, a wake that is a cap, a
working day that is a count of ten hours, and a rest latch that holds
the body down until dawn. Every one of those was measured on the winter
loop and each moved a seed somewhere else (the winter loop spec,
section 1.1; the roadmap's winter loop paragraph). This spec replaces
them with the two processes a real body runs on, with physiological
numbers and no clock constant, and lets the bedtime, the wake, the
working day and the nap fall out.

Extends `2026-09-03-survidle-body-and-elements-design.md` (the body's
reserves) and supersedes the sleep clauses of
`2026-09-04-survidle-working-day-design.md` (section 1.2, the spent
need and the nightfall sleep) and `2026-09-06-survidle-winter-loop-design.md`
(section 1.1, one sleep per night, and the rest latch). The winter
loop's night rules for orders (1.2 away work by day, 1.3 chores by
firelight and the light budget, the lighting exemption, the waiting
runner's fire) stand.

## Decisions confirmed with the author

- **No hardcoded bedtime.** A clock constant was built, measured and
  rejected in session. The bedtime comes from the model or not at all.
- **Exhausted early sleep stays possible.** Sleep pressure can override
  the evening's alertness, and when it does the body sleeps early and
  long. That is the physiology, not a bug.
- **Naps happen when the model calls for one, and not when it does
  not.** A rested December body works through its five hours of light;
  a body carrying debt from a short night or a hard morning dozes in
  the afternoon dip.
- **Rest recovers from work, never from wakefulness.** Only sleep pays
  sleep debt. Rest clears fatigue, lowers the burn, warms and dries, and
  passes the evening.
- **The gates measure the sim, not the player.** The April gate is
  reported as it falls; a death this model exposes in another rule (item
  J's fuel gap) is that rule's to fix and this spec's to record.

## Curve

Horizon rows 3 to 6: the winter is where the sunset bedtime cost the
year (two level-20 seeds froze beside an axe when the pre-dawn chores
ate the working day, the winter loop's withdrawn clear). Survivor row 3.
Tiers: none; the body is the body. The strength axis of the survivor
(item I) keeps its card line "works ten hours" by setting the fatigue
drain, so a strong survivor's day is longer and a weak one's shorter
without a count. Expected: sleep inside the seven-to-nine band the
calibration pass set, December chores by firelight in the dark
morning rather than the dark evening alone, the level-20 year gate no
worse than main's 3 of 4, and the April gate reported as it reads.

## 0. Measured before

Main 3ec48f8 (item J and the survivor merged), 2026-09-06, the four
reference seeds:

| gate | reading |
|---|---|
| April, day 26 | 4 of 4; first lives 41, 207, 89 and one more past 26 |
| year, level 20 | 3 of 4; seed 79 froze day 278 |
| year, level 10 | 2 of 4; seeds 19 and 79 froze days 307 and 336 |
| winter, stocked December camp | 4 of 4 |
| December work, 30 days from 1 December | 8.1 to 8.8 h a day, 4.5 to 4.9 of it in the dark; sleep 8.2 to 9.3 h |

With the winter loop's rest latch cleared at the night's sleep and
nothing else: April 3 of 4 (seed 79 froze day 7, the fuel gap), year
level 20 1 of 4 (seeds 17 and 19 froze in winter with the light hours
rested away), level 10 3 of 4, winter 4 of 4, December dark chores 5.6
to 6.1 h. That reading is why this spec exists: every clock rule over
`energy` trades one seed for another.

What the code does today, in the words of the rules it has:

- `energy` 0..100 drains at 7 an hour on a task, 4 on camp work, and
  rises at 6 an hour resting and 12.5 asleep (`ENERGY_RATE`,
  `player.ts`). Rest therefore pays sleep debt, which is why a spent
  body by the fire never got tired enough to sleep on its own.
- The sleep need fires at night when energy is under 60 or the body is
  spent, and at any hour under 20 (`currentNeed`, `body.ts`). Night is
  a step at sunset.
- A sleep runs to dawn or to rested, whichever is later, never past
  nine hours (`check("sleep")`, `tasks.ts`). The dawn floor is a hidden
  bedtime; the cap is a cliff.
- The working day is a count: ten hours of task minutes, then
  `restUntil` holds the body at rest until the next dawn (`spentNow`).
- `sleptTonight` stops a second sleep in the same night.

## Measured after

Built on `sleep-model`, 2026-09-06, the same four seeds, `npm test` green
at 863 tests and `npm run build` clean:

| gate | reading |
|---|---|
| April, day 26 | 4 of 4; first lives 58, 169, past 251 and 207 |
| year, level 20 | 2 of 4; seeds 17 and 19 froze days 282 and 284, each with a full larder and no firewood |
| year, level 10 | 1 of 4; seeds 17 and 19 froze days 290 and 271, seed 79 starved day 311 |
| winter, stocked December camp | 4 of 4 |
| heir, the trend gate | 2 of 4, where the winter loop left it |
| horizon rows 3 to 6 | past 30 days alive on every seed, the stocked row in band |
| December work, 30 days from 1 December | 7.5 to 8.8 h a day, 3.8 to 4.6 of it in the dark, of which 3.4 to 3.7 is the dark morning; sleep 8.0 h |
| December night | one sleep a night, none begun by day; median asleep 22:41, median awake 06:41 |

The December night is what the spec was written for: the body works the
dark morning by firelight and sleeps the middle of the night, rather than
sleeping from 15:42 and sitting out nine more hours of dark. The year
gate's lost seed is item J's fuel gap, which the rest latch had been
hiding: a body held down by the fire from the count's tenth hour to dawn
is a body keeping its fire because it has nothing else it is allowed to
do. The evening now ends at `RESTED_AT` and the runner goes back out, so
the woodpile is short by the hours the latch used to sit on it.

## 1. The two processes

Both live on the player and are stepped in `stepPlayer` beside kcal,
warmth and water. The numbers are the three-process model of alertness
(Akerstedt and Folkard: a homeostatic process with an 18.2 hour rise
and a 4.2 hour fall, a circadian process peaking at 16.8 h, and a
twelve-hour ultradian with the post-lunch dip), rescaled to this
codebase's 0..100 reserves. Nothing in it is a bedtime.

### 1.1 Sleep debt, the homeostatic process

`Player.sleepDebt`, 0..100. Awake it rises toward 100 with a time
constant of 18.2 hours; asleep it falls toward 0 with a time constant
of 4.2 hours:

    awake:  debt += (100 - debt) * dt / (18.2 * 60)
    asleep: debt -= debt * dt / (4.2 * 60)

A day of sixteen hours awake from a debt of 10 reaches 63; eight hours
asleep brings it back to 9. That is the balance a working adult keeps,
and it is the reason the seven-to-nine band exists. Activity does not
move the debt: a felling day and a sewing day are equally long awake.
Fatigue (1.3) is where the work goes.

A light sleeper (the `sleepsLight` quirk) on a storm night clears debt
at half the rate, which is the quirk's existing rule moved from
`ENERGY_RATE.sleep` to the debt's fall.

### 1.2 Alertness, the circadian process

Alertness is a wave on the clock, peaking in the late afternoon and at
its lowest a few hours before dawn, with a smaller twelve-hour wave
whose troughs are the post-lunch dip and the small hours:

    circadian(h) = 20 * cos(2 * pi * (h - 16.8) / 24)
    ultradian(h) = -4 * cos(4 * pi * (h - 14.5) / 24)
    alertness(h) = circadian(h) + ultradian(h)

`h` is the hour of the clock, the sim's own, whose noon is 13:00. The
amplitudes are the three-process model's 2.5 and 0.5 on its twelve-unit
range, as shares of 100. The phase is the clock's, not the sun's: a
person's rhythm is set by the day's light over weeks and holds through
a polar winter, which is why December's dawn at 10:18 does not move the
wake to 08:00. Item H, the mind, owns what the dark does to the rhythm
over months and can widen or drift this wave then.

### 1.3 Fatigue, the reserve the work drains

`Player.energy` keeps its name, its bar and its thresholds, and becomes
what it always measured: fatigue from work. It drains on a task, less
on camp work, and recovers resting and asleep, at the rates it has
today. The strength axis sets the task drain through the card's own
number, `workHours`: a task drains `(100 - SPENT_AT) / workHours` an
hour, so the median survivor's ten hours of task work bring a fresh
body from 100 to `SPENT_AT`, a strong one's eleven and a weak one's
nine, with no count kept anywhere. `SPENT_AT` is 30, the level a
ten-hour day at the old rate ended on. Camp work stays at 4 an hour and
rest at 6. The bar reads fatigue; "exhausted" under 20 stays.

### 1.4 Sleepiness and its two lines

    sleepiness = sleepDebt - alertness(h)

Two thresholds, with hysteresis so a body neither falls asleep at the
first dip nor wakes at the first stir:

- `SLEEP_ONSET = 60`: sleepiness at or above it, and the body sleeps.
- `WAKE_AT = 25`: sleepiness at or below it, and a sleeping body wakes.

Worked on 1 December, sunset 15:41, sunrise 10:19, a body up since
05:30 with debt 10 and ten hours of work behind it:

| hour | debt | alertness | sleepiness | body |
|---|---|---|---|---|
| 16:00 | 49 | +17 | 32 | rests by the fire, tired but awake |
| 21:00 | 62 | +13 | 49 | still up |
| 22:20 | 64 | +4 | 60 | falls asleep |
| 04:30 | 15 | -22 | 37 | asleep, the trough |
| 06:30 | 9 | -16 | 25 | wakes |

Sleep 22:20 to 06:30, 8.2 hours; then nearly four hours of chores by
firelight until the light at 10:19. Debt is time awake, so a hard day
does not move it; what a hard day moves is fatigue, and a body that has
worked itself under the collapse line sleeps at once, holds that sleep
until fatigue is back to `RESTED_AT`, and then sits up by the fire with
its debt half paid. Worked for a body collapsing at 16:00 after
fourteen hours of felling: asleep 16:00 to about 20:30, up by the fire
until the small hours, asleep again from about 02:45 to 07:30, 9.3
hours in two sleeps. That is the first sleep and second sleep of a
winter night, and it comes from the numbers rather than from a rule.

A June body up at 06:40 reaches 60 at about 22:30 and wakes at 06:40. At
14:30 the dip reads only 4, so a body with a four-hour night behind it
reads 42 and does not doze; a nap by the debt line needs about a day
awake (a night walk home, a storm sat out), and the ordinary afternoon
doze after a hard morning is the fatigue collapse, not the debt. The
dip's amplitude is the three-process model's and is flagged for the
tables audit if the readings say a northern summer naps more than that.
These numbers are the model's, computed and not chosen.

## 2. The runner

### 2.1 The needs

The body tier's order stays: sleep, storm, cold, thirst, hunger,
snares, spent, home. What each reads changes:

- **sleep**: `sleepiness >= SLEEP_ONSET`, or `energy <= SLEEP_AT` (20,
  the collapse, unchanged), or a sleep under way that has not yet
  reached its end: sleepiness at or under `WAKE_AT` and, for a sleep
  that began as a collapse, fatigue back at `RESTED_AT`. A sleep is
  sticky by the model, not by the night. The thirst exception stands: a
  thirsty body that can drink drinks first.
- **spent**: `energy < SPENT_AT`, holding while a spent rest is under
  way until `energy >= RESTED_AT` (55, the level five hours by the fire
  restore). A spent body walks home, keeps its fire and rests, as
  `campStep` does today; the evening by the fire is this need doing
  what it did, without the count and without the latch.
- The night clauses go: no `isNight` in the sleep need, no
  `NIGHT_SLEEP_UNDER`, no `sleptTonight`, no `restUntil`, no
  `spentNow`, no `workHours` count. `WORK_HOURS_DEFAULT` and the
  person's `workHours` stay as the drain's divisor and the card's word.
- The wait intent at camp keeps its fire (the winter loop's rule) and
  then rests; it never sleeps of its own accord, since sleep is the
  body's need now.
- `homeBeforeDark`, the storm, the cold and the snares are unchanged.

### 2.2 Where a body sleeps

A sleep need at camp sleeps at camp, after the fire step, as today. Away
from camp it walks home when a walk is open, and sleeps where it stands
when none is, as today. A nap is the same need in daylight and takes the
same path: home first, then by the fire; the cold need sits above it in
the order, so a body in the snow at the felling site walks in before it
dozes. The Doing panel shows a daytime sleep at camp as "dozing by the
fire" and a night's as "sleeping", so an away report that reads forty
minutes of dozing at two in the afternoon is telling the truth.

### 2.3 The sleep task

`check("sleep")` loses the dawn floor and the cap. Its duration is the
minutes until the model's wake line, found by stepping 1.1 and 1.2
forward in ten-minute steps from now, bounded at fourteen hours; at
least sixty minutes. The label's detail reads "until rested". The
`night` intent is one such sleep. The collapse in `advance.ts` (a body
under 10 energy with no task sleeps where it stands) stays.

### 2.4 The order rules the winter loop left

`nightSkip` stands as written: away work waits for first light, camp
chores run by firelight, the light budget is `workHours` less the day's
daylight against the ledger's work minutes, and the lighting tasks are
exempt. The budget still reads the calendar day's count from the ledger,
which is a day-roll number and not a latch, so it is untouched by the
end of `spentNow`. Whether the budget is still needed once fatigue sets
the day is a reading for section 5, not a decision here.

## 3. What the player sees

- The Energy bar and the "exhausted" tag are unchanged in meaning.
- A "sleepy" tag beside "exhausted" when sleepiness is at or above 50,
  so a player reads the yawn before the body lies down; the log line "You
  can barely keep your eyes open." once per crossing, the way "You can
  barely lift your arms." reads today.
- "Sleep" in the Do panel: "until rested" in its detail, with the hours
  the model expects, "about 8 h".
- The away report's sleep line is the ledger's and needs no change.

## 4. Roadmap and record

Read against the roadmap before writing:

- **I, the survivor.** The strength axis's `workHours` becomes the
  fatigue drain's divisor; the card line "works ten hours" stays true in
  the sense a player reads it. The `sleepsLight` quirk's storm rule moves
  to the debt's fall. The build axis's "sleeps warm" is the comfort
  temperature and is untouched.
- **J, the axe and the wood.** Its fuel-gap flag ("nothing makes a
  runner stock the night's fire before its working day ends") reads
  differently under this model: the evening is a spent rest by the fire,
  and the fire step that rest takes is what stocks it, as far as
  `fireStep` reaches (a log split for the fire when firewood is short).
  The flag stays J's; section 5 reads whether the April death moves.
- **H, the mind.** "The dark" as a condition can act on the circadian
  amplitude and phase; this spec leaves the wave on the clock.
- **5, the body model.** `sleepDebt` joins `kcal`, `water`, `warmth`,
  `energy` and `wetness` as a core reserve.
- **B, the forecast.** It runs this runner; the Ahead panel moves with
  it, and its horizons are re-read in section 5.
- **The calibration pass** keeps its seven-to-nine sleep band as the
  gate on the hours.
- **The working day spec's** 1.2 and the **winter loop's** 1.1 are
  superseded, said in both documents in one sentence each.

## 5. Tests

- 1.1: sixteen hours awake from 10 reads 63; eight asleep from 63 reads
  9; a light sleeper in a storm halves the fall.
- 1.2: alertness peaks at 16:48 and troughs at 04:48; the dip at 14:30
  reads 4 under the circadian line.
- 1.3: ten hours of task work take a median body from 100 to 30; eleven
  hours for strength +1; rest restores 6 an hour and never moves debt.
- 1.4 and 2.1: the December table's five rows, computed by the model
  from the stated start; a body collapsing at 16:00 sleeps until
  `RESTED_AT` and is up by the fire at 20:30 with its debt half paid; a
  June body with a four-hour night behind it reads under 60 at 14:30
  and does not doze, and one a day awake does; a body at sleepiness 59
  at sunset rests rather than sleeps.
- 2.1: a sleep holds until the wake line and no longer; a spent body
  rests until `RESTED_AT`; no night clause remains (a body at 100 energy
  and debt 20 at 23:00 with orders on the list works by firelight).
- 2.3: the sleep task's duration is the model's minutes to the wake
  line, at least sixty, at most fourteen hours; the night intent is one
  sleep.
- 2.4: the winter loop's night tests stand unchanged.
- 3: the sleepy tag and its log line once per crossing.
- Save: a save without `sleepDebt` loads with it derived from energy,
  `100 - energy`, and without `restUntil` or `sleptTonight` read.

The existing tests that pin the night clauses (needs.test's "one sleep
per night" block, workday.test's spent and nightfall rules, the
epitaph snapshots' day numbers) are rewritten to the model's rules, not
weakened.

## 6. Measurement and done

`npm test` and `npm run build` green. Then the probes on the four seeds:
`npm run reference`, `--heir`, `npm run year` at 20 and 10, `--fresh`,
`--winter`, `npm run horizon`, and a thirty-day December probe reading
per seed: hours asleep a day, hours of work by light and dark, the hour
the body falls asleep and wakes on a median night, and the count of
daytime sleeps. Written into the roadmap beside the winter loop's
readings as "Measured with the sleep model", with section 0 as the
before. Done when the readings are in the roadmap whatever the gates
say, the level-20 year gate is explained if it fell, and the working
day and winter loop specs carry their superseded lines.

## 7. What this does not do

No light as a wake cue (a sleeper in June light wakes by the model's
line, not the sun); no drift of the rhythm in the polar dark (H); no
change to the winter loop's order rules; no change to the burn, the
warmth or the water; no multi-day fatigue beyond what the reserve
carries over; no dream, no insomnia, no condition (5 and H); no UI
beyond the tag, the log line and the detail text.
