# Body-fat calibration readings

Branch `survidle/body-fat-spec` against `origin/main`. Three gates, five reference
seeds each: `npm run reference` (April), `npm run year`, `npm run december`.
Two passes are recorded below - the landmarks as Task 1 left them, and the
tuned set this task settled on after reading them.

## April gate (`npm run reference`)

Gate day moves with the reserve, so it differs by row.

| seed | main (gate day 19) | branch, untuned (gate day 17) | branch, tuned (gate day 20) |
|---|---|---|---|
| 17 | died 22, starved (fail: before day 19) | died 41, starved (pass) | died 41, starved (pass) |
| 19 | died 28, starved (pass) | died 54, starved (pass) | died 54, starved (pass) |
| 42 | died 38, starved (pass) | died 39, starved (pass) | died 51, starved (pass) |
| 79 | died 28, starved (pass) | **died 7, froze** (fail) | died 7, froze (fail) |
| 45 | died 34, starved (pass) | died 69, starved (pass) | died 69, starved (pass) |
| **passed** | **4 of 5** | **4 of 5** | **4 of 5** |

Pass count holds at 4/5 through both branch readings. Seed 17 flips from fail
(main) to pass (branch): main's gate day is 19 and seed 17 starves at 22, one
day inside the old window and about three past the new one - a genuine near
miss both ways, and the branch's larger reserve pushes it clear. Seed 79 flips
the other way, fail on the branch where it passed on main - see the finding
below, this is not the reserve. (Both readings above are the standalone
branch, before it merged into main; the postscript at the end of this
document explains why the merged tree reads **5 of 5** instead.)

## Year gate (`npm run year`, kitted level-20 camp, from 1 April)

All five seeds are alive at day 366 on both main and branch, untuned and
tuned: **5 of 5** everywhere. No seed's outcome moved. Larders and firewood
piles at each month checkpoint differ - branch bodies carry more fat mass
earlier because deposition is now 1:1 into an uncapped store instead of
filling a shared `kcal` value - but a kitted, skilled camp has enough of
everything that the difference never threatens the gate.

## December gate (`npm run december`, 30-day winter window)

All five seeds run the full 30 days with no death on both main and branch,
untuned and tuned: **5 of 5** everywhere, work hours and sleep median
(22:40 asleep, 06:36 awake) within a few tenths of an hour of each other
across every version. This gate does not move.

## What moved, and why

**The reserve model** (Tasks 1-6): every death day past the April gate's
checkpoint shifts later on the branch than on main, for every seed that
starves rather than freezes - seed 19 (28 -> 54), seed 42 (38 -> 39 untuned,
-> 51 tuned), seed 45 (34 -> 69). Main's `FAT_FULL` was a flat cap; the branch
reserve is `typical` minus `floor` read per body, and a median man's usable
reserve came out larger than the old cap allowed him to carry. `starvation()`
reading from `lower` rather than the old threshold, and death only at `floor`
rather than at zero, both push survival later once the sim is starving
already. This is the intended shape of the redesign, not an artifact.

**The walking mass term** (Task 9): every seed's per-week `burn/day` line now
carries a `walk` sub-component that scales with the body's current mass
instead of a flat figure, so a fat-heavy body's early walks cost slightly
more and its late, starved walks cost slightly less than the flat-rate main
build. This shows up as smaller week-to-week swings in the `walk` figure on
the branch than on main (e.g. seed 17's week 1 walk drops from 868 on main to
683 on branch under the same task list) rather than as a pass/fail change on
any gate.

**Runs diverging rather than reflecting a model change**: the exact death day
for every starving seed differs by a few days between runs of the *same*
version too (seed 42 went from 39 to 51 between the untuned and tuned reads
purely from the larger male reserve, not from any run-to-run noise - the sim
is deterministic per seed and version, so every difference in this document
between two columns is attributable to a code or landmark change, never to
chance).

## The sex ratio the plan could not verify

The plan projected usable reserve (`typical - floor`) of 67,500 kcal for a
median man and 81,506 kcal for a median woman - a 1.21x reserve ratio - and,
because burn scales with mass, a fasting survival ratio of about **1.40x** in
a woman's favour. That figure is exactly the ratio between the `build` axis's
own extremes (`massKg` at `build: +2` over `build: -2` is `1.1667/0.8333 =
1.4`), which was flagged as the edge of the design goal that sex read as
flavour rather than a build-sized lever.

Measuring it against the untuned landmarks confirms the projection almost
exactly:

| | floor | typical | reserve | reserve ratio f/m | survival ratio f/m |
|---|---|---|---|---|---|
| male (untuned) | 23,220 | 90,720 | 67,500 | | |
| female | 52,414 | 133,920 | 81,506 | 1.207 | **1.402** |

A ratio equal to the entire span a player actively dials with the build axis
is not flavour - it is a second, unlabelled build axis riding on a
character-creation choice the player does not make expecting it to carry that
much weight. That reads as a dominant pick, not flavour, and the plan's own
text names this as the trigger for a landmark change if confirmed.

## The landmark change

`FAT_SHARES.m` moves from `{ floor: 0.04, lower: 0.08, typical: 0.14, upper:
0.2 }` to `{ floor: 0.04, lower: 0.1, typical: 0.16, upper: 0.22 }` - floor
held (essential fat is not a dial to turn), the rest of the zone shifted up
by two points of body mass, keeping `typical` the exact midpoint of `lower`
and `upper` that `tests/fat.test.ts` pins as a structural invariant. Female
shares are unchanged. Raising the male typical toward the more commonly cited
"average, not athletic" range for men (high teens rather than 14%) reads as a
realism improvement alongside the balance one.

| | floor | typical | reserve | reserve ratio f/m | survival ratio f/m |
|---|---|---|---|---|---|
| male (tuned) | 22,680 | 103,680 | 81,000 | | |
| female | 52,414 | 133,920 | 81,506 | 1.006 | **1.169** |

1.169x sits clearly under the build axis's own 1.40x span - closer to what
one build step moves than what the whole axis moves - while keeping the
direction physiology gives the floor share: a woman still outlasts a man on
the same fast, just not by as much as changing build from -2 to +2 would.
`REFERENCE_TARGET_DAY` moves from 17 to 20 as a direct consequence (the
reference body's reserve is now bigger); this is the derivation working as
Task 11 built it, not a second tuning decision.

Every gate's pass count (4/5, 5/5, 5/5) is identical before and after this
tune, and `tests/axes-body.test.ts`'s pinned landing-fat values for a median
and a `build: +2` man (previously 90,720 / 105,840, now 103,680 / 120,960)
were updated because the number they check legitimately moved with
`FAT_SHARES`, the same way the April gate's checkpoint day did - not because
any gate needed nudging to pass.

## Finding: seed 79's cold death is not main's

The brief carried a hypothesis that seed 79 freezing on day 7 came in with
main's fire-keeping work, not this branch's fat model. That does not hold up
against the main baseline taken here: **on main, seed 79 does not die of cold
on day 7.** It starves on day 28, past the April gate's day-19 checkpoint,
counting as a pass. Fire-keeping (`survidle/fire-keeping`, merged at `c2b16b0`
and confirmed present on `origin/main` via `git merge-base --is-ancestor`) is
already part of the main baseline this reading was taken against - it is not
something the branch newly brought in.

So the cold death is this branch's, but it is an interaction rather than the
fat model alone: something about the reserve/appetite/walking-mass changes
leaves seed 79 short of firewood in its opening week where main's identical
fire-keeping mechanics were not. It reproduces identically before and after
the `FAT_SHARES` tune (still day 7, still froze), so it is not sensitive to
where the landmarks sit - the interaction is with the mechanism, not the
tuning.

The mechanism: seed 79's body sits in its settling zone in the opening week,
where the rebased `starvation()` correctly reads 0. The old shape,
`1 - fat/typical`, was nonzero there and throttled `workSpeed` through that
week; the new one does not, so her day reshuffles, the fire goes unlit from
day 4, warmth falls, and because `p.kcal` sits at 0 the health-regen gate
never opens, so cold damage accumulates until she dies on day 7. A bisect
confirms the mechanism: restoring the old `starvation()` shape, or feeding
the old shape only to `workSpeed`, both leave her alive past day 13; changing
`SATIETY_BASE` or forcing `massFactor` to 1 change nothing.

## Judgment: seed 17's heir dying of thirst on day 3

`tests/reference.test.ts` already documents this in a comment: on seed 17 the
raised heir dies of thirst on day 3 without reaching the old camp at all,
which is why the walk-home test uses seed 19 instead.

Ruled acceptable by the author: a heir landing far from the old camp is a
situation a competent player plays around - making a new camp instead of the
walk, or stopping to drink along the way - not one the sim owes a guarantee
against. The reference runner takes the unconditional walk-home order with no
such judgment, so it dying here says more about the runner's lack of
discretion than about the heir mechanism. The tool for "stopping to drink
along the way" already exists - `src/sim/seep.ts`, a dug hole that refills
from the water table - the reference runner just never reaches for it
(`REFERENCE_ORDERS` never mentions `seep`), so a raised heir inherits that
blind spot. Recorded in `docs/roadmap-additions.md` as a question about the
reference runner's want list, not a new mechanic; it is a water/routing
question that does not move with `FAT_SHARES`.

## Postscript: both findings above were this branch's own bug, not main's

Merging this branch into main surfaced the actual cause of both. `canFeed`
and the need probe around it had diverged: this branch threaded a
`RunnerIntent` through and read camp location off `it.campCell`, a value
cached on the intent at whatever moment it was built; main, independently,
had already replaced that whole path (`needFrom`/`peekNeed`, a `NeedMemory`
for sleep and cold, `canFeed` reading `regionState(state, world,
p.region).campCell` fresh) and split camp-level needs like snares into their
own `campNeed`, no longer part of `BodyNeed` at all. The merge conflict in
`src/sim/body.ts` was resolved by taking main's structure and dropping the
stale `it`-threaded reads.

That fix alone (no landmark or mechanism change) takes the April gate to
**5 of 5** - seed 79 now starves on day 44 rather than freezing on day 7 -
and `tests/slow/heir.test.ts` runs seed 17's heir to a clean landing and a
walk home inside three days, exactly as it did before this branch started
diverging from main's own need-probe work. Neither finding above was a fat
model or landmark problem; both were this branch quietly running on a stale
copy of a function main had already moved on from.

That does not erase the sibling session's root-cause work on seed 79 above -
`starvation()` reading 0 across its whole settling zone, where the old shape
still throttled `workSpeed`, is a real, confirmed behaviour change from the
redesign, and the bisection that pinned it stands. It just was not, on its
own, what killed seed 79: something about the stale `canFeed` path made that
particular seed's opening week land in the one spot where the missing
throttle mattered enough to cost the fire. The throttle's removal is worth
someone's deliberate look regardless of whether a seed currently walks into
it - a settling zone that no longer slows work at all near its own edges is a
one-line rule to restore if a later change ever exposes it on a seed that
still starts from a fresh `canFeed`.
