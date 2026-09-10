# Roadmap additions

Items raised but not built, written here because the roadmap the specs cite
(`the roadmap's gate table`, `roadmap item B`) is not in this repo. Move them
into it when they meet.

## Walking skill

**Raised** 2026-09-09, while designing wildlife disturbance.

The disturbance model now accepts a neutral movement-proficiency profile, but
ordinary walking still trains no skill. Flesh this out as a separate design
task rather than hiding it inside Hunting or adding a second "stalk" walking
skill. Hunting owns deliberate approach, reading animals, and identification;
Walking should own general travel competence.

Start that item by inventorying every bonus it could touch: terrain pace,
energy and calorie cost, load tolerance, footing noise, falls and injuries,
route finding versus Wayfinding, snow and darkness penalties, recovery on long
journeys, and how much nearby wildlife detects. Decide which of those are
trained by ordinary travel, how inherited competence works, what mastery keys
mean across terrain and weather, and what the UI exposes before assigning any
numbers. Guard against a feedback loop where faster walking produces more
Walking XP simply because it covers more distance per real second. Keep
deliberate stealth a Hunting input unless playtesting demonstrates a genuinely
different repeated action that deserves its own verb and progression track.

## Metric reach for legacy predator interactions

**Raised** 2026-09-09, while replacing wildlife cell jumps with continuous
metric travel.

Animal locomotion, ungulate detection, startle distance, and escape now use
exact metres and elapsed game minutes. Older wolf attacks, wolf predation,
bear and wolverine camp-food contact, and fire or torch avoidance still use
cell membership or cell-count reach. This is a required blocker before
simulation-cell size itself changes, not an optional polish pass.

Convert those interactions to physical distances with cells serving only as a
broad-phase lookup. Specify separate warning, pursuit, attack, predation,
camp-contact, fire-avoidance, and torch-avoidance radii. Pursuit must target the
moving actor's exact point rather than a stale destination cell. A swept check
must catch a wolf crossing the survivor or prey between update endpoints, and
assign the interaction a time inside that elapsed interval. Explicit cooldowns
must prevent update chunking or smaller cells from multiplying attacks, kills,
feeding, or theft. Preserve an in-progress pursuit and cooldown across saves.

The current ten-minute wildlife decision tick also owns needs, feeding,
predation, and attacks. Locomotion has been separated from it, but the remaining
cadences are still bundled in `moveOne`. Split them before adding swept contact
so changing decision frequency cannot silently change hunger or lethality.
Test identical metric separations and moving crossings on two grid scales and
with split versus whole elapsed intervals. Detailed and aggregate predator
risk should agree where both modes represent the same exposure.

Predators currently have zero disturbance gain and therefore do not emit the
new startle event. The `startle_brush_predator` audio slot is reserved but
unreachable. Decide predator perception, defensive retreat, and disclosure as
part of this item, or remove the reserved slot if predator departures will use
a different presentation contract.

## Wildlife scale transition

**Raised** 2026-09-09, during the post-implementation scale audit.

Exact positions and travel speed are metric, but changing the simulation grid
still has several prerequisites beyond predator reach:

- `advanceWildlifeTravel` stops after 32 waypoint arrivals in one update. The
  ceiling is only a runaway-loop guard at today's cell size and update cadence;
  smaller cells or a long detailed update could discard available travel.
  Replace it with progress detection and preserved residual time or distance,
  then prove whole and split updates agree beyond 32 crossings.
- Current tests prove gait distance and split-update invariance at the configured
  cell scale, not by running one journey against two interchangeable grid
  scales. Add injectable grid geometry or an equivalent adapter fixture before
  claiming that a changed simulation grid has been exercised end to end.
- Saves written before exact positions store only a cell. Their migration uses
  today's `WORLD_W`, `WORLD_H`, and `CELL_KM`, so a later grid change would
  reinterpret an old cell under the new geometry. Version the saved world
  geometry or migrate those saves before changing any of the three constants.
- Animal visibility and occlusion still use the containing terrain cell even
  though disturbance geometry is exact. Define how exact sight rays sample
  cover on a finer grid and test an animal crossing into and out of cover.
- Active agents stop at their active-region boundary. Decide whether a finer
  grid keeps that deliberate local-simulation boundary or needs persistent
  cross-region journeys, including activation, save, and aggregate handoff.
- A subject uses one stable seeded point per cell as its waypoint. If finer
  cells expose repetitive paths, replace this with a metric path vocabulary
  whose outcome is stable across save/load and independent of render detail.
- Audit map labels, test fixtures, and documentation for literal assumptions
  about the old cell size. Production map distance labels and the disturbance
  tests now read `CELL_KM`; descriptive references to today's 300 m world are
  not conversion logic.

The existing optional mechanical-subcells item covers the larger routing and
resource consequences. This item is the compatibility gate that must be
cleared even if the new grid remains visually similar.

## Wildlife calibration and deferred senses

**Raised** 2026-09-09, during the post-implementation scale audit.

The centralized travel and escape speeds are provisional gameplay calibration.
The cited field studies anchor initiation and escape distances, but do not
validate every species gait used here. Before wildlife movement becomes a
hunting balance dependency, compare ordinary travel, escape duration, pursuit,
and encounter frequency against sources and playtests. Keep physical constants
in the species profiles and record why each number changed.

Wind and scent are neutral inputs in the disturbance spec and are not yet
simulated. Add them only through metric encounter context, with direction,
strength, terrain, precipitation, and Hunting effects specified together.
Human listening must also confirm that contact plus receding terrain movement
reads as an animal startling, especially for a heard-only event; automated
checks establish scheduling and disclosure, not recognisability.

## Optional revisit: mechanical subcells

**Raised** 2026-09-09, while adding close-map visual detail.

The first close map rung divides each 300 m terrain cell into a 3 by 3 field of
cosmetic 100 m details. The closest rung subdivides further into a 6 by 6 field
of cosmetic 50 m details. These fields have no individual cell borders, so the
terrain reads as one continuous surface. Large-animal and survivor markers are
projections of their exact movement positions rather than cosmetic subcell
motion. Resources and most interaction targets still resolve to the containing
terrain cell; the visual detail cells themselves remain non-mechanical.

This separation is deliberate. Making the details mechanical would multiply
the routing graph, retune travel and sight, redistribute cell-based resources,
and change every rule that currently means "here". It should remain optional,
and only be revisited if visual subcells prove insufficient in play: for
example, if close animal approaches repeatedly feel misleading, or players need
to choose a precise patch of ground inside a cell. At that point the work wants
its own spec and balance pass rather than more visual exceptions.

## Current viewshed refinements

**Raised** 2026-09-09, after the first topographic viewshed pass.

**Foundation built.** At the cell-scale zooms, current sight now has a circular
maximum range, elevation and canopy occlusion, Earth-curvature drop, distinct
remembered and inherited ground, and no live camp flame or glow through an
occluder. A clear night fire uses a separate five-kilometre luminous-source
range, so seeing the flame does not pretend the unlit ground is visible. The
map is awareness gathered while standing in a cell, not a literal
instantaneous gaze cone, so it remains 360 degrees unless facing and turning
become simulation actions.

Refine it in this order, and only where play or screenshots expose a problem:

1. When roadmap 7 lands, give fog, low cloud, rain, falling snow and smoke one
   per-cell atmospheric transmission field. Terrain rays and luminous-source
   rays both accumulate it: dense fog can hide a nearby flame, haze weakens a
   distant flame before hiding it, and heavy precipitation shortens both
   ranges. Add physical distance contrast from that same field, not a cosmetic
   feather around the viewshed edge. Never reveal an exact hidden fire merely
   because an atmospheric glow is drawn; a diffuse glow needs its own uncertain
   observation state.
2. Add animal-specific visual detection, localized sound and observed dynamic
   state in the order under Sensory map follow-ons below.
3. If diagonal pinholes or missed blockers are visible at 300 m resolution,
   replace rounded ray traversal with supercover traversal and keep a regression
   gallery for ridge, valley and forest-edge cases. Do not add finer mechanical
   cells merely to smooth the outline.
4. When fires make terrain mutable, add a terrain observation generation to the
   viewshed cache key or invalidate the cache for every changed burn, smoke and
   regrowth cell before rendering or marking knowledge.

The current rain overlay is presentation only for sight: overcast reduces
ambient sky light, but rain and snow do not yet attenuate terrain or flame
line-of-sight. Screenshot coverage must label that limitation until the shared
transmission field exists. Fog is not yet simulated and must not be mocked only
in CSS.

## Burn scars

**Raised** 2026-09-08, during the seasonal colour pass.

Ground that has burned reads as burned: black at first, weathering to grey,
and eventually growing back. It is the one mark on the map the survivor makes
by living somewhere rather than by building something, and it would make a camp
you have kept for a season look like a camp you have kept for a season.

This is not a separate cheap decoration any more. The realism roadmap already
specifies the authoritative version in `8. Forest fire`: active burning cells,
smouldering ground, the persistent burn overlay and ecological succession. This
entry remains as a cross-reference until that sub-project lands.

The implementation order is fixed by what each layer can honestly know:

1. The current viewshed distinguishes visible ground from remembered ground,
   with terrain and canopy occlusion. This is the foundation, not part of the
   fire state.
2. Roadmap 7 supplies wind, thunderstorms and fog visibility; item 8 replaces
   the dry-day counter with litter and peat moisture.
3. Item 8 adds ignition, active fire cells, spread, destruction and smouldering.
4. Smoke reads those real cells and the real wind. Low smoke limits the local
   viewshed; an elevated plume gives only an approximate distant bearing.
5. A finished burn writes the persistent scar, then succession and wildlife
   capacity read its age. The scar never predicts or substitutes for steps 2
   through 4.

The old cheap option, scorching every occupied fire site without a fire, is
withdrawn. It would make a visual claim that the simulation never caused and
would leave two incompatible definitions of burned ground. The drawing follows
the effective terrain in item 8 and gets rows in `scripts/map-shots.mjs` for
flame, smoulder, fresh scar and succession.

## Sensory map follow-ons

**Raised** 2026-09-09, during the current-viewshed pass.

The viewshed can hide what the existing simulation locates, but it cannot make
up observations the simulation does not record. Build these in order:

1. **Detection.** Large wildlife uses its own distance, size, movement, cover,
   light and weather check inside the terrain viewshed. Seeing a cell never by
   itself means seeing every animal on it.
2. **Localized sound.** A wildlife subject emits a real event with origin,
   loudness and time. Rain, wind, fire and terrain affect whether it is heard
   and how well it can be localized.
3. **Uncertain map cue.** A heard but unseen subject produces a steady,
   short-lived `?` at an approximate bearing or area. It never uses the hidden
   subject's exact cell, never flickers, and is replaced by the animal glyph
   only after visual detection.
4. **Observed dynamic state.** Fires, coals, traps, piles and other changing
   marks retain last-observed state and time. Until that exists the close map
   must prefer hiding live off-screen changes over reading omniscient state.

Fire and smoke consume the same observation interfaces after roadmap item 8
creates their spatial state; they do not add renderer-only exceptions.

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
and worse encounters, while every actual kill still removes one whole animal
from the regional population. Small, localized animals such as beaver can be
depleted outright; wide-ranging large game should more often become difficult
to encounter locally and recover only through explicit movement and births.

The 2026-09-09 post-merge year gate confirms that recovery alone did not settle
expert hunting. Three of five kitted Hunting 20 survivors lived a year, one
died on day 48 without taking large game, and one died on day 80 after taking
some. The four lives that did take large game produced 2,413-6,878 kcal a day,
all above the experienced 300-1,500 band; successful camps ended with roughly
507,000-716,000 kcal, and one exceeded 1.1 million during autumn. This is a
real balance defect, but isolated pressure constants are not a safe lever: an
earlier stronger 14-day, 4 km pressure experiment increased production by
changing where the reference hunter ranged. Rebuild the paired production
evaluator, then calibrate selection, encounter cadence, recovery, local
avoidance and food-runway stopping together.

The final late-August five-seed probe passed first snow on seeds 17, 79 and
45, but seeds 17 and 79 starved soon afterwards; seeds 19 and 42 starved
before the gate. The early deaths held only 14, 23 and 53 kg of firewood,
not the former 181-253 kg plus dozens of logs. Food now outranks speculative
fuel correctly, but the underlying late-start food supply succeeds on only
three of five seeds and is still unhealthy.

The 2026-09-09 ordinary April reference gate passed three of five seeds. All
five survived at least 27 days, and the two gate failures died on days 28 and
30. The runner reported thousands of kilos of reachable roots and, on several
seeds, known oily or spawning fish while taking none. That makes this evidence
of reference-policy blindness, not yet evidence that the player-facing food
model is underpowered. A beginner living at a sustained food deficit is also
consistent with the intended harsh start. Keep the April source rates unchanged
until paired probes and a competent-player scenario separate policy from supply.

The 2026-09-09 horizon output still demonstrates why its fixtures must be
rebuilt. Manual-only lives held 5-6 days against a 0-2 band. Jobs-and-grinds
lives ranged from 4 days to alive at 30 against 1-2. Keeps held 24-30 days
against 3-5. Trap/hut/trough held 24 days to alive at 30 against 10-20, while
every stocked life was alive at 30 and in its 20-60 band. These are transformed
snapshots of the changing reference list, so the readings mix capability,
world seed and policy and must not be used to tune the game.

## Hunting population accounting and learned range

**Raised** 2026-09-10, after tracing impossible expert harvests to the
population model rather than to hunting-pressure constants.

**Addressed** 2026-09-10. Whole-animal claims, resident bear seasonality,
authoritative concrete targets, learned negative evidence, skilled neighboring
range selection and wildlife alarm behavior are implemented with conservation
regressions. Numeric hunting calibration remains open under Post-recovery
balance calibration above.

The final mechanics audit also closed two indirect repeat-hunt paths. Meat
already on a drying rack counts toward a hunting keep, so preservation in
progress cannot launch another hunt. A species hunt no longer binds an
arbitrary active animal elsewhere in the region, and a claim cannot consume a
represented animal unless it is at the encounter cell (or at its explicitly
known den). Skilled automatic hunters can compare mapped neighboring ground
after either repeated failures or sustained local pressure.

The governing invariant is that every carcass represents one whole animal
removed from the simulated population. Continuous abundance may remain useful
for ecological growth, but a fractional remainder is not a huntable animal.
The harvest transaction must therefore fail without producing a carcass when
no whole individual can be claimed, and a failed wildlife-subject removal must
never be ignored.

Priority order:

- **P0:** Make the removal of one whole animal and creation of its carcass one
  atomic operation. A failed removal means a failed kill.
- **P0:** Stop applying flock-style daily return-to-capacity to resident
  mammals. Bears remain in their resident population while denning; births,
  deaths, explicit movement, immigration and emigration are the only population
  changes. Migratory flock replenishment remains species-class-specific.
- **P1:** Make a concrete wildlife subject authoritative when one was targeted.
  A probabilistic search may materialize an otherwise unrepresented whole
  individual as an encounter, but it must then remove that individual and its
  aggregate population exactly once.
- **P1:** Record negative evidence from unsuccessful searches. Recent repeated
  failures must lower the estimated value of that locality without exposing the
  hidden true population.
- **P1:** Let skilled automatic hunters compare mapped, reachable neighboring
  regions once learned local yield falls. Fresh nearby ground should not be
  chosen merely because its hidden population is larger.
- **P2:** Keep hunting pressure as a behavioral overlay: animals become alert,
  avoid disturbed ground and are harder to approach. Pressure is not population
  accounting and cannot create or destroy animals.

Required regression coverage:

- No carcass when continuous abundance is below one and no whole subject exists.
- A failed subject claim cannot produce a carcass.
- Resident bear abundance cannot jump toward carrying capacity each day.
- Total harvest cannot exceed whole animals present plus explicit arrivals.
- Replenishment behavior is selected by species class, not by a shared seasonal
  label.
- Repeated empty hunts reduce estimated local yield, and a sufficiently skilled
  hunter can then select known reachable ground in a neighboring region.
- In controlled populations, ending abundance equals starting abundance plus
  births and explicit immigration, minus deaths and explicit emigration.

Do not recalibrate kill odds, body weights, skill curves, food sources, cold
constants or survival bands until these invariants hold and the paired
evaluators below are rebuilt. Exceeding 1,500 kcal/day can be a legitimate
jackpot; routine production of several annual diets by one hunter is the defect.

### Mechanics-complete diagnostic, 2026-09-10

The structural mechanics are ready for evaluation. After integration with main,
720 fast tests, 1,321 slow tests and the production build pass. The five-seed
expert year probe passes 3 of 5. Seeds 19, 79 and 45 survive the year with about
324,000, 278,000 and 2,600 kcal at camp. Seed 19 takes nine elk and four deer;
seed 79 takes seven elk and six deer; seed 42 takes six elk and three deer in
99 days before freezing. Every kill now consumes a conserved whole animal and
creates a carcass that must be dressed, carried, preserved and stored.

The remaining player-facing issue is cadence and stopping policy, not missing
recovery machinery. Thirteen large animals per year for one survivor is too
routine, and nine in 99 days is implausibly dense. Automatic hunting should stop
against food and fat runway, and selection/encounter cadence/local avoidance
must be calibrated together. Do not shrink carcasses or break conservation to
fit the old band.

The existing large-game kcal/day verdict is not ready to gate calibration. It
divides recovered kill calories by days lived, so seed 42's single elk in a
15-day life reports 10,623 kcal/day. It also measures field recovery rather than
what survives hauling, spoilage, preservation and consumption. Rebuild it around
whole kill windows, hunted area, recovered calories, preserved calories and
ending stock before changing the 300-1,500 band.

The integrated late-August first-snow probe passes 4 of 5, up from 2 of 5. Seed
17 still dies on day 29 while reporting about 9,179 kg of reachable roots and
known oily/spawning fish but taking almost none. The other four reach first snow;
three later starve on days 36, 51 and 37. Seed 45 receives about 204,000 kcal of
large-game recovery in one measured week and later starves on day 137. This is
unhealthy automatic policy at both extremes: it ignores available fallback food
on poor starts and can over-hunt after a jackpot. Repair the policy and paired
source probes before tuning food production.

Evaluator status: safe to run for diagnosis, not safe to use as a numeric gate.
The old large-game kcal/day denominator still inflates short lives and reports
gross recovery rather than preserved usable food. Rebuild it around kill windows,
hunted area, recovered and preserved calories, ending stock, and explicit food
and fat runway before recalibrating bands.

### Hunting audit classification, 2026-09-10

The rebuilt diagnostic now records every attempt and kill with its date, cell,
region, local abundance and capacity, odds, pressure, work time, and food and fat
runway. It also accounts for regional population growth and movement, field
recovery, hauling, spoilage, preservation, consumption, and ending hunt-derived
stock. This is diagnostic instrumentation only and does not alter simulation
decisions.

The suspicious expert runs are not isolated jackpots. Seed 42 made 170 attempts
and spent 505 hours hunting from 5 April through 30 June, killing six elk and
three deer in one 17.10 km2 region. Seed 19 made 118 attempts and spent 362 hours
through 30 August, killing eight elk and two deer in one 18.54 km2 region. Seed
79 made 140 attempts and spent 429 hours through 31 August, killing seven elk,
five deer and one capercaillie in one 21.42 km2 region. The large-game kills in
the latter two runs were spread over five months rather than concentrated in a
short lucky window.

Population conservation holds across the connected ranges. Seed 42 removed six
of 29.57 starting elk from 123.84 km2 by the end of June; growth added 0.48 and
24.05 remained. Seed 19 removed eight of 25.63 starting elk from 117.36 km2 by
the end of August; growth added 0.76 and 18.37 remained. Seed 79 removed seven
of 14.42 starting elk from 115.74 km2; growth added 0.34 and 7.75 remained.
Local movement did funnel 2.92 elk into seed 42's hunted region and 4.90 into
seed 19's, while seed 79 received only 0.44. Resupply can amplify extraction,
but it does not explain the high result by itself and does not create animals.
Its directional cadence remains a P2 ecological calibration question.

The two P1 automation defects found by this audit were addressed on 2026-09-10.
The reference hunter now uses the same shared food-and-fat runway calculation as
the audit, and stops hunting once it has 30 food days and 14 fat days. Repeated
empty searches become learned negative evidence. The evidence requirement scales
continuously from seven searches at Hunting 1 to three at Hunting 20, remains
firm for half its skill-scaled memory, then fades continuously. Fresh sign
invalidates the inference. This remains player knowledge rather than hidden
population access. Generic target selection reads mapped habitat, signs,
remembered failures and disturbance; a named prey choice requires fresh local
sign.

On the final 153-day rerun after continuous negative-evidence scaling, seed 79
fell from 140 attempts and 13 kills to nine attempts and three kills. Seed 42
made 33 attempts and killed two elk and two roe deer. Seed 19 made eight attempts
and killed two elk. Hunting is limited to one attempt per day while either
runway is low, so it cannot monopolize the plan; later attempts begin only after
food runway falls back below the 30-day target. These are no longer hunts
continuing through a 50-to-129-day surplus. All three survivors lived through
the 153-day probe and their population ledgers balanced. The old gross kcal/day
verdict still labels all three "over" and remains an evaluator defect, not a
game-mechanics failure.

### Persistent-locality ecology stress, 2026-09-10

A separate `npm run hunt-stress` probe deliberately ignores food, fatigue and
negative evidence and makes three elk attempts every day on one cell. Before an
ecological response, 153 days reduced seed 79's local elk from 7.15 to 0.25 and
removed seven animals. Hunting pressure lowered the roll but did not move the
aggregate herd, so enough repeated rolls could still grind through almost the
whole local population.

Sustained disturbance now adds explicit, population-conserving emigration for
large game toward quieter neighboring habitat with room. It changes local
availability rather than creating or deleting animals. After the change, seed
79 records 2.42 elk emigrating and 1.80 remaining after 153 days. Continued for
three years, the irrational hunter gets eight kills from 3,285 attempts, mean
encounter odds fall to 1.0%, and 0.93 elk remain locally. This closes the endless
same-cell extraction issue without a hard stop or a stronger arbitrary roll
penalty.

The diagnostic's `spoiled kcal` includes losses from an exposed carcass before
field recovery as well as spoilage after hauling. It can therefore exceed
`field-recovered kcal`; those fields are not additive. A later evaluator cleanup
should report potential carcass kcal and split pre-recovery scavenging from
post-recovery food spoilage. This is a measurement clarity issue, not a known
population or inventory conservation failure.

The former headline is also a confirmed evaluator defect. It annualizes gross
field-recovered calories, not usable food. The carcass pipeline discarded or
failed to haul a material share: the three runs recovered about 956,000,
1,248,000 and 1,414,000 kcal in the field, while only about 762,000, 510,000 and
979,000 kcal reached camp. Preserved calories overlap later consumption and
ending stock and must not be added as a separate yield. Calibration should use
a declared net measure and report gross recovery alongside it.

### Deferred hunting evaluator rebuild

**Priority:** P1 measurement work. It does not block the corrected hunting
mechanics, but it blocks numeric recalibration.

Replace the current gross-kcal verdict with a lifecycle report that separately
shows potential carcass calories, field recovery, hauling, pre-recovery loss,
post-recovery spoilage, preservation, consumption and ending stock. Keep hunt
dates, cells, area, attempts, hours, kills, population flows and food/fat runway
at the next hunt. Evaluate long-run usable yield while retaining jackpot-year
distributions. Until this is complete, the current kcal/day verdict is
diagnostic and non-gating; do not tune hunting odds, carcass yields, food ecology
or survival bands against it.

### Local-weather hunting integration

**Raised** 2026-09-10, after reviewing the complete
`codex/survidle-local-weather` branch before its planned merge.

The local-weather branch makes snow, ice, precipitation, storms, light, route
costs, wildlife capacity and ground-item spoilage depend on place. Its current
hunting changes correctly read local ice for seasonal presence and local snow,
precipitation, light and storms when an encounter resolves. After that branch
lands, run one explicit hunting integration pass rather than assuming the two
features compose because their unit suites pass separately.

- Prove that search, encounter, field recovery, exposed-carcass loss and hauled
  food spoilage use conditions at the actual cell, including across a weather
  boundary and after save/load.
- Let automatic ground ranking use only weather the survivor can reasonably
  observe or forecast. It must not inspect a better hidden weather cell and
  thereby become an oracle.
- Decide how fresh snow helps tracking before deep snow hinders travel, how rain
  erases sign, and how fog or precipitation changes identification. Express
  these through the existing sign/evidence and encounter inputs, not a second
  weather-only hunting rule.
- Add wind and scent through the metric encounter context already reserved under
  Wildlife calibration and deferred senses. Wind direction should affect
  approach and animal alarm, while skill improves how the player reads and uses
  it rather than revealing the hidden animal.
- Extend the hunting audit with encounter-cell weather and route exposure. Keep
  these fields diagnostic until the lifecycle evaluator is rebuilt, then test
  whether weather changes usable yield rather than merely gross kill odds.

This is P1 integration and calibration work, not a blocker for either feature
branch by itself. Promote it to a mechanics defect only if the post-merge tests
show global weather leaking into a local hunt, hidden-cell weather informing a
choice, or carcass accounting using the wrong cell's conditions.

#### Merge guidance

Merge the completed hunting work first, then bring main into
`codex/survidle-local-weather`. Do not resolve overlapping simulation files by
taking either side wholesale. In particular, `animals.ts`, `camp.ts`,
`hunting.ts`, `reference.ts`, `tasks.ts`, `types.ts` and their tests contain
independent state and accounting changes from both branches.

Preserve these hunting invariants while replacing global weather reads with the
local-weather APIs:

- A successful hunt atomically removes one whole animal and creates exactly one
  carcass. Failed or fractional claims create none.
- Population flows remain conserved and resident mammals are replenished only
  by recorded births and movement.
- Hunting pressure, learned negative evidence, fresh signs and neighboring-ground
  selection remain player knowledge inputs. Local weather must not provide
  hidden-cell knowledge to target selection.
- The shared food/fat runway still limits reference hunting to one attempt per
  day while stores are low. Do not restore forever hunts or old kcal thresholds.
- Carcass field recovery, hauling, pre-recovery loss, post-recovery spoilage,
  preservation and consumption remain distinct audit stages. Temperature and
  precipitation should become local inputs without collapsing those stages.
- Explicit disturbance emigration remains a population-conserving response to
  sustained same-locality hunting.

After resolving conflicts, run the fast and slow suites plus the hunting audit
and persistent-locality stress probe. Add focused crossings where two adjacent
cells have materially different precipitation, snow, visibility or temperature.
The merge is not complete if deterministic seeds change without an explained
mechanics cause, if a hunt succeeds against fewer than one available animal, if
the audit no longer balances population flows, or if carcass loss is attributed
to the survivor's weather instead of the carcass cell's weather.

#### Integration result, 2026-09-10

The hunting merge retains whole-animal claims, conserved population flows,
food-and-fat runway limits, learned negative evidence, audit stages and
disturbance-driven emigration. Seasonal capacity and presence read each
region's persistent local ice while migration still prefers quieter habitat.

Automatic ground ranking does not inspect hidden candidate weather. It may use
cell weather for the hunter's current or currently visible ground; other mapped
ground falls back to the survivor's observed weather facade until approached.
Exposed carcasses now age from temperature at each carcass cell, independently
of the survivor's current cell. Focused regressions cover hidden candidate ice,
cell-local carcass decay, conserved hunts and persistent-locality stress.

## Fog edge translucency

**Raised** 2026-09-10, while repairing hunting and exploration feedback.

**Addressed** 2026-09-10. Known cells now feather into adjacent unknown cells
without drawing unknown terrain or covering map marks; day, night and rain were
checked in the headless map-shot harness.

At the boundary between explored and unexplored map cells, consider a narrow
translucent fog edge to soften the hard cutoff. It must be derived only from the
known/unknown boundary, preserve the uniform time-of-day shade across the whole
viewport, and never reveal terrain or marks in an unknown cell. Treat this as a
P2 readability pass, with screenshots at day, night and rain before shipping.
