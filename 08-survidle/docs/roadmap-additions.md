# Roadmap additions

Items raised but not built, written here because the roadmap the specs cite
(`the roadmap's gate table`, `roadmap item B`) is not in this repo. Move them
into it when they meet.

## Optional revisit: mechanical subcells

**Raised** 2026-09-09, while adding close-map visual detail.

The first close map rung now divides each 300 m simulation cell into a 3 by 3
field of cosmetic 100 m details. The closest rung subdivides further into a 6
by 6 field of cosmetic 50 m details. These fields have no individual cell
borders, so the terrain reads as one continuous surface. Large-animal markers
can roam through the details and cross toward their next real cell, but their
visual position does not affect movement, detection, pursuit, targeting,
resources or encounters. The survivor's marker uses the continuous in-cell
position the walking simulation already keeps; this adds no second walking
task, skill or progress bar. All interaction still resolves to the containing
300 m cell.

This separation is deliberate. Making the details mechanical would multiply
the routing graph, retune travel and sight, redistribute cell-based resources,
and change every rule that currently means "here". It should remain optional,
and only be revisited if visual subcells prove insufficient in play: for
example, if close animal approaches repeatedly feel misleading, or players need
to choose a precise patch of ground inside a cell. At that point the work wants
its own spec and balance pass rather than more visual exceptions.

## Burn scars

**Raised** 2026-09-08, during the seasonal colour pass.

Ground that has burned reads as burned: black at first, weathering to grey,
and eventually growing back. It is the one mark on the map the survivor makes
by living somewhere rather than by building something, and it would make a camp
you have kept for a season look like a camp you have kept for a season.

This is not part of the colour pass and was deliberately left out of it. A
colour is a rule about a cell the world already describes; a scar is a fact the
world has to remember, which means state, a cause, and a lifetime. Three
decisions before it can be specced, and none of them are mine to take:

**What burns.** The cheap version is only your own fire sites: a hearth
scorches the cell it sits on, and nothing else in the world ever burns. That is
one class on one cell, no new state beyond what `regionState` already keeps,
and it delivers most of the look - the camp you have lived at is ringed with
old fire. The expensive version is fire that spreads: a lit fire in dry weather
taking the ground around it, which is a hazard, a loss condition, and a reason
to site a camp carefully. The second is a mechanic, not a decoration, and it
would want its own spec.

**How long a scar lasts, and in what terms.** A fire site used for a week is
not a fire site used for a year, and the fade wants to be in days that mean
something rather than a number picked to look right - the same rule the rest of
this game's numbers hold to. Charcoal on a hearth outlasts the hearth; a burnt
meadow greens in a season. If the two differ, the scar is per terrain.

**Whether it survives a life.** Camps, knowledge and the journal all carry
between survivors in their own ways. An heir finding the ancestor's burnt hearth
is a good moment; an heir finding a map speckled with ninety years of soot is
not. Whatever the answer, it should be the same answer the dimmed journal
ground already gives, or a deliberately different one.

Once those are settled the drawing is small: a `scorched` class carrying a step
for age, excluded from marked cells the way every other conditional ground rule
in `style.css` is, plus a row in `scripts/map-shots.mjs` so the look is checked
with the rest.

## The reference runner and a walking heir never reach for a seep

**Raised** 2026-09-08, during the body-fat calibration pass. Corrected the
same day: this is not a new mechanic. `src/sim/seep.ts` already exists - a
knee-deep hole dug on wet ground (`build:seep`), holding a pool that refills
from the water table (bog 3 l/h, damp 1 l/h), fetched from with `fill:seep`,
freezing without a fire on its cell, drying out after two weeks with no rain,
silting up after a year. It is real, built, and on the map (`MARKS.seep`).

The author's ruling on a heir landing far from the old camp - that a
competent player routes around it, by camping anew or by drinking along the
way - names a real tool the game already has. The gap is narrower than "build
seep": it is that nothing simulated ever reaches for it under its own
judgment. `REFERENCE_ORDERS` never mentions `seep`, so the reference runner's
whole gate suite never digs or drinks from one; a raised heir's walk-home
order comes from the same runner and carries the same blind spot. A human
player already has the tool a competent one would use here - the open
question is only whether the reference runner (and so the gates it drives)
should carry a seep want, given digging one is itself an hour-plus action
that assumes the walker can afford to stop, not a sip taken in passing.

## `pile()` and `siteFor` on read paths

**Raised** 2026-09-08, during the camp siting work.

`pile(state, cell)` creates an empty inventory when the cell has none, so any
code that only wants to *read* what lies somewhere writes to the state as a
side effect. The map draws a mark for every key in `state.piles` without
asking whether it holds anything, so a read can put a pile on the map at a
cell where nothing lies. `tidyPiles` sweeps the empties on the next tick, so
it flickers rather than persists, which is why nobody has chased it.

Camp siting hit this twice. Once as its own bug - the sentence naming what a
moved camp leaves behind called `pile()` from a render path, so opening the
confirm dialog and answering no marked a pile that was not there - fixed by
reading `state.piles[cell]` directly, and `pileAt(state, cell)` now exists as
the read-safe accessor. Once as something inherited: `checkRaw` calls
`pile(state, at)` for every camp-bound task row, so the Do panel does it on
every render, and `body.ts` and `ui/water.ts` keep a few more.

The follow-up is to finish what `pileAt` started: move every read path onto
it and leave `pile()` for the places that genuinely mean to create. Worth
doing as one pass rather than per-site, and worth a lint rule afterwards, the
same way the decision router is lint-banned from the engine mutators.

## A shelter away from camp

**Raised** 2026-09-08, ruled out of the camp siting work on purpose.

Camp siting settled that a camp is a place you keep - one per region, holding
the pile, the fire, the rack - and a shelter is a roof on a cell. That leaves
an obvious third thing unbuilt: a rough shelter thrown up where you stand,
warming whoever sleeps on that cell, holding nothing, falling apart in days.

It was left out because the measurements do not yet justify it. A region is
about 4.2 km across and every spot in one is 4 to 28 minutes from its camp,
so inside your own ground you would always just walk home. A neighbouring
region's camp is 47 to 104 minutes, which is the case a bivouac is for - but
nothing yet makes a survivor stay there overnight. The runner never leaves
the region, orders belong to the region, and populations are not depletable,
so no pressure pushes anyone out.

So the bivouac wants its reason first: a seasonal draw worth an overnight in
neighbouring ground - elk in autumn, a run of fish in one region at one time
of year. Build the reason, and the shelter earns itself. Build the shelter
first and it is decoration.

## Ruins that outlast the fall

**Raised** 2026-09-08, during the camp siting work.

A camp can now be left behind, and what stands there keeps sheltering whoever
walks back into it until it falls on its own clock. What it cannot do is
leave a mark afterwards. The author's call at the time was that an abandoned
camp decays on the clock it already has and then is simply gone.

The richer version is a shell that stops sheltering but stays on the map as
somewhere a survivor once lived - visible to heirs, part of the journal. It
wants the same three decisions as the burn scars above, and for the same
reason: what lasts, how long in terms that mean something, and whether it
survives a life. Worth deciding both at once, since an heir finding one
ancestor's hearth is a good moment and finding ninety years of them is not.

## Small things the camp siting work left

**Raised** 2026-09-08. None of these are load-bearing; they are recorded so
they are not rediscovered from scratch.

- `body.ts` prints the unreachable-camp line ("No way to camp from here")
  when the truth is there is no camp at all. A second wording keyed on a null
  camp would say what actually happened.
- `searchHome` given a region argument routes to that region's generated cell
  and answers "{you} {know} the way home" about ground that is nobody's home.
  Only the reference harness passes that argument today, so no player reaches
  it. `walkTarget` keeps the generated cell deliberately, as a landmark to
  aim at for travel; it is `searchHome` inheriting it that reads wrong.
- `camp.ts` has a `useOptionalChain` lint warning on `needsMending`. Left
  alone because the obvious fix widens the return type.

## The reference player ranges too far on known ground

**Raised** 2026-09-08, measured during the camp siting work.

The landing region is now mapped on arrival, so the player can read the
ground before choosing where to live. In this game knowledge gates movement
on purpose, so a mapped region is also a walkable one, and the reference
player answers that by ranging to farther spots from day one - working past
dark, collapsing, and freezing.

A 30-seed sweep says this is redistribution rather than decline: 7 seeds
froze early before, 5 after, only 2 of them the same. The gates hold. But
seed 1 is a real and specific regression, off-gate: it reached day 29 before
this work and dies on day 4 after, warmth 3, with no firewood at camp.

The reading is that the world got more permissive and the runner's policy did
not adapt - nothing teaches it that far ground is expensive when the day is
short. That is a reference-player question rather than a world-model one, and
seed 1 is the case to trace it on.

## Post-recovery balance calibration

**Raised** 2026-09-09, during the hunting economy repair.

Do not tune the skill curve, food-source rates, cold constants, or lineage
targets against results produced by instant whole-animal recovery. Hunting now
has ground selection, field processing, hauling, spoilage, and local avoidance,
but those downstream bands need fresh multi-seed evidence before their numbers
move.

Revisit these in order after the hunting gate has settled:

- Replace horizon stages derived from the changing reference order list with
  explicit per-stage fixtures, then raise the diagnostic cap beyond 60 days.
  Until then, horizon movement can mean the fixture changed rather than the
  simulated capability changed.
- Calibrate how quickly Hunting improves signs, ground choice, recovery, and
  consistency. Skill should not primarily multiply kill chance.
- Re-run the April and late-August source probes before changing fish, traps,
  plants, fat, or carbohydrate rates. Run each disabled-source probe beside an
  otherwise identical baseline seed so the delta, not two unrelated lives, is
  the measurement.
- Qualify deep-cold samples by actual outdoor cold exposure before changing
  metabolic or shelter constants.
- Replace raw lineage lifespan monotonicity with paired inherited and fresh
  survivors in the same world and season, then set lineage targets from those
  matched results.
- Consider species-specific butchery, pack frames, sledges, meat caches, and
  explicit carcass-quarter hauling only if the common carcass pipeline still
  leaves meaningful decisions missing. They are extensions, not prerequisites
  for realistic recovery.

Large game should usually respond to repeated hunting through local avoidance
and worse encounters. Population depletion belongs mainly to small, localized
animals such as beaver unless later evidence justifies a broader population
model.

The first post-recovery seed 17 run at Hunting 20 took 11 reindeer and one
ptarmigan, yielding 1,918 large-game kcal a day. That is far below the old
3,400-14,100 range but still above the experienced 300-1,500 band. A stronger
14-day, 4 km pressure experiment perversely raised it to 13 reindeer and 2,264
kcal a day by changing where the reference hunter ranged. It was reverted.
This is evidence that isolated pressure constants are not a safe balancing
lever. Rebuild the paired production evaluator, then calibrate the whole
selection, cadence, recovery and runway loop against multiple seeds.

The final late-August five-seed probe passed first snow on seeds 17, 79 and
45, but seeds 17 and 79 starved soon afterwards; seeds 19 and 42 starved
before the gate. The early deaths held only 14, 23 and 53 kg of firewood,
not the former 181-253 kg plus dozens of logs. Food now outranks speculative
fuel correctly, but the underlying late-start food supply succeeds on only
three of five seeds and is still unhealthy.

The ordinary April reference gate passed only two of seeds 17, 19 and 42;
all three starved on days 26-28. This is a real bootstrap regression after
instant whole-animal recovery was removed, not evidence for restoring that
abstraction. Revisit the first-month mix of passive food, inexpensive food
work and hunting only after the paired source probes identify the missing
calories.

The current horizon output also demonstrates why its fixtures must be
rebuilt: seed 17 held 5, 5, 35, 29 and 35 days across stages whose bands are
0-2, 1-2, 3-5, 10-20 and 20-60. Those stages are transformed snapshots of
the changing reference list, so the readings mix capability with policy and
must not be used to tune the game.
