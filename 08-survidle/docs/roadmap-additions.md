# Roadmap additions

Items raised but not yet placed in the roadmap
(`superpowers/specs/2026-09-03-survidle-realism-roadmap.md`). An item moves
into it when it can carry a curve line, and this file then points at its
letter.

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

**Raised** 2026-09-09, during the post-implementation scale audit. **Partly
settled** by the authoritative-close-zoom migration: the grid is the 50 m patch
lattice now, saves from the 300 m world were refused rather than reinterpreted
(and that gate is gone since, nobody having such a save), and `CELL_KM` is
gone in favour of `PATCH_KM`. The two bullets below about
old-save migration and cell-size literals are closed by that; the rest still
stand as what any further change of scale would need.

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
- Closed. Saves written before exact positions stored only a cell, and their
  migration read the world geometry of the day, so a grid change would have
  reinterpreted an old cell under the new one. A save carries its schema
  version and one of another version is not read.
- Animal visibility and occlusion still use the containing terrain cell even
  though disturbance geometry is exact. Define how exact sight rays sample
  cover on a finer grid and test an animal crossing into and out of cover.
- Active agents stop at their active-region boundary. Decide whether a finer
  grid keeps that deliberate local-simulation boundary or needs persistent
  cross-region journeys, including activation, save, and aggregate handoff.
- A subject uses one stable seeded point per cell as its waypoint. If finer
  cells expose repetitive paths, replace this with a metric path vocabulary
  whose outcome is stable across save/load and independent of render detail.
- Closed. Map labels, test fixtures and documentation were audited for literal
  assumptions about the cell size; the map's distance labels and the
  disturbance tests read the grid constant rather than a literal, and that
  constant is `PATCH_KM`. Prose describing the old 300 m world is not
  conversion logic and was left as history.

The implemented authoritative fine terrain item below covers the larger routing
and resource consequences. This item is the compatibility gate that must be
cleared even if a further grid change remains visually similar.

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

## Implemented: authoritative fine terrain

**Raised** 2026-09-09, while adding close-map visual detail. **Settled**
2026-09-10 by the authoritative-close-zoom migration.

The close rungs once divided a 300 m terrain cell into cosmetic 100 m and 50 m
fields. Nothing under those letters was true: the ground did not change from
one to the next, a click anywhere in the field meant the same cell, and the
survivor's mark slid about inside a cell it never left.

The 50 m patch is now the simulation's own unit. Terrain, region, weather,
visibility, wildlife, ownership of structures, piles, work and resources, and
routing all run on it; every map rung is a square block of those real patches,
and a click names the exact patch an order would be given for. The lattice is
generated a chunk at a time and summarised bottom-up, so no whole-world array
or whole-world scan exists to pay for the resolution.

The design is
`docs/superpowers/specs/2026-09-10-survidle-authoritative-close-zoom-design.md`;
the before-and-after captures are in `docs/close-zoom-simulation-shots/`.

What this roadmap entry worried about was making the detail mechanical: a
larger routing graph, retuned travel and sight, redistributed resources, and
every rule that means "here" rewritten. All of it happened, under that spec and
with its own performance gates in `tests/spatial-performance.test.ts`. Nothing
is left to revisit here.

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

## The old camp's bearing lived in one log line

**Raised** 2026-09-18 by the author, landing as an heir and finding nothing
that said where the old camp was. The landing line said it - region,
distance and wind - but the log is cleared at every boat, reads newest
first, and an heir's landing writes a rung line per carried rung straight
after it, so the one sentence that pointed the way was the first thing the
log scrolled past.

Done the same day. The old camp is kept on the heir's record
(`LifeRecord.oldCamp`, read back off the world for older saves), the welcome
says where it lies, and the activity strip under the map keeps the bearing
with the one click toward it - the walk when a way is known, the search for
one when none is - until the heir walks into that country and the map holds
the camp. The strip's search button matters on its own: the Do pane's
"Search for a way home" reads the current region's camp, which an heir has
none of, so the pane hid it, and only the reference runner could point a
search at the old camp's region. Not done, and still open above: the camp's
own mark on a dim region's map, which the dim-map rule (ground and name
only, until visited) currently forbids.

What would look wrong: the row still there after the heir has stood in the
old camp's region; a "walk there" that stops at the edge of known ground
without saying so (that is `Go to` reaching a frontier, as it always has).

**Amended** 2026-09-18, the same day. Measured on seed 17, the strip's
"search for a way there" passed its check and then did nothing: the search
picks its legs among named regions still unmapped, the landing maps the
heir's shore whole, and all three people on that boat have poor eyes, so no
neighbour was seen from the shore and nothing named led on. Such an heir
could not explore, travel or search anywhere from the Do pane either; the
only way out was to walk to the region's edge by hand, look across, and
click a cell beyond. Three things changed, the honest way rather than by
telling a poor-eyed survivor what the boat's crew saw:

- **Ground the eye reaches into is country you can name.** `seeFrom` marks
  a region whose ground is in sight as glimpsed (`glimpseRegions`,
  discovery SEEN, "You see into X." once), so "Explore X" can be aimed at a
  region seen from a fell top or across a border. The coarse horizon does
  not count; only what is really in sight.
- **A region known whole can be surveyed to its edge.** When its own ground
  gives nothing more and it borders a country never glimpsed, the survey
  walks to the nearest reachable edge cell and looks across (`pickEdge`,
  the task's `edge` flag; arriving glimpses what lies over the border
  whether or not the trees let the eye through). The row's detail says
  "walks the edge to look into the country beyond"; "you know that country"
  is now true when it says it.
- **The search falls back to the same edge walk**, on home's side by
  bearing, so the strip's button works for the seed 17 heir: edge leg,
  glimpse, then the sweep goes on into the neighbour. Its check refuses
  "nothing known leads on from here" when even that is not there, and a
  start that still fails logs why instead of swallowing the click. The
  strip names the search ("Searching for the way to Elglia") and its leg
  ("sweeping Stormvik" or "to the edge of Langtjern to look beyond") in
  place of the raw task id it showed before; the bar is the leg's, and the
  whole has no ETA, which the step says by naming the leg.

What would look wrong: a survey of a fully known region that walks to an
edge and opens nothing; a search that ends in silence (it says "no way on
from here" now); a "You see into X." that repeats.

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

### Re-source the large-game expectation, 2026-09-11

**Raised** 2026-09-11, when the fresh-sign-on-foot seam moved the year gate
from 2 of 5 to 4 of 5 seeds and the kills line to "over" on four seeds.

The band itself is the weak number, not only the verdict that reads it.
`APRIL.rows.largeGame` (300 to 1,500 kcal a day, experienced) is one row of
the Swedish handbook's diversified expert day, whose total tops out at
3,500 while a survivor who lives the year burns 3,000 to 4,500. Any run that
reaches 1 April in this country therefore leans past the handbook's day on
whatever the country offers, and inland that is elk. The row cannot tell a
survivor eating what it killed from a stockpile; the runner still stops
hunting at 30 food days and 14 fat days, so the kills track consumption.

The reading to keep from 2026-09-11, at level 20 from 1 April: main c9e596cf
read seeds 17, 19, 42, 79, 45 as froze day 12, starved day 317, alive, froze
day 289, alive, with elk 0, 2, 4, 2, 2 and the large-game line under, in
band, over, in band, in band. The branch read froze day 23, alive, alive,
alive, alive with elk 2 (reindeer), 6, 6, 6, 3 and the line over on all but
seed 45 at 1,700 to 2,300 a day, inside the handbook's total band. The
mechanism is known: sign read while walking satisfies the "no fresh sign"
legality gate for a named hunt, so the runner can hunt where it has walked.
Reading tracks in passing is what a hunter does; the question the number
raises is the kill rate, not the sign.

Do, in this order:

- Re-source the expectation from a boreal subsistence figure: large-game
  kills per hunter-year with bow and traps for a lone adult in inland
  boreal forest, with the source named beside the band the way `BURN` and
  the plant hours are. Six elk a year in twenty square kilometres is the
  claim to test. If the source supports a band in kills per year rather
  than kcal per day, change the row's unit and the year report's line with
  it.
- Read kill-per-attempt on the fresh-sign seam with the existing hunt
  diagnostic (the 153-day rerun above), main against the branch, before
  touching odds or `WALK_SIGN_FACTOR`. More attempts at the same odds is the
  runner knowing more ground; more kills per attempt would be a seam
  defect.
- Then, and only then, recalibrate under the evaluator rebuild above. A
  number bent to bring the line into band is not a correction.

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

## Rendering on its own clock

**Raised** 2026-09-11, while measuring the water shimmer's cost.

**Addressed** 2026-09-11. Tiers 1 and 2 below are built: panels render
every 100 ms, `setHidden` and the sky, speed-graph and tip writers compare
before writing, and the tip draws on the pointer event. Measured on the
same lake run: main thread 478 to 230 ms a second with the water still,
script 157 to 32, the mutation census down from eleven per-frame writers to
the speed path at ten a second. What remains: the water's 567 opacity
overlays still cost about 160 ms a second because Chrome ticks every
animation on the main thread whatever the compositing hints; the lever is
one animation per cell with pre-summed keyframes through the Web Animations
API. Tier 3, the engine in a worker, is untouched. The churn budget test
still counts markup only, not attribute rewrites.

The frame loop renders every panel on every animation frame and diffs the
result, so the page pays style and layout at display rate whether or not
anything changed. Measured in headless Chrome at 1x on a real run (seed
12318, day 190, a lake of 189 water cells in view), with all water motion
switched off: a style recalculation and a layout 60 times a second, paint
at 74 ms of every second, and a main thread busy 478 ms of every second.
The per-frame mutation census names the writers: the six panes' `hidden`
attribute, the sky's `aria-label` and gradient centre, the weather panel's
children and path, and the map tip's `hidden`, each rewritten 60 times a
second though the value is almost always the one already there. The same
run had hundreds of CSS animations alive at once: four glyph ripples per
fog or rain cell, 120 sky rain drops, and now three ripple overlays per
water cell.

What it cost in practice: the first water ripple computed a colour per
cell in place, which repainted every water cell every frame. Paint went
from 74 to 366 ms a second at 1x, roughly four times that on a Retina
screen, and the main thread to 94 percent busy. Frames dropped, a smooth
ripple with dropped frames reads as pulsing, and hover queued behind the
same work. Moving the ripple to opacity overlays the compositor animates
by itself put paint back at baseline. The lesson generalises: nothing
that moves every frame may run on the main thread.

The shape to build has three tiers, each on its own clock:

1. **Presentation motion** - water, fog, rain, cloud shadows, the mood
   glyph - lives in CSS and runs on the compositor at display rate with no
   script. Only transform and opacity animate; a colour or a glyph change
   is a step, never a per-frame paint. Per-cell phases are seeded from
   the world, as the water ripples are now, so a re-render writes the same
   markup and the morph has nothing to do.
2. **State rendering** runs on change or on a fixed cadence of about 10 Hz,
   whichever is later, since nothing a panel shows moves faster than a
   game minute. Every writer compares before it writes - the discipline
   `setPanel` already applies to markup - so an unchanged pane, sky or tip
   costs no mutation, no style invalidation and no layout. The weather
   panel and the sky render on their own keys, as the weather panel already
   does for its text but not for its path.
3. **The engine** ticks at whatever rate the simulation needs, decoupled
   from both; the forecaster already shows the pattern for moving that
   work into a worker when it grows.

Measure with the same per-frame census and the same headless budgets
before and after, and extend the churn budget test to count attribute
rewrites, not only markup: a panel that sets `hidden` to the value it
already has every frame is churn. Acceptance is the lake run above idle at
under 10 percent main-thread busy with the water rippling, and hover
answering within a frame. Smaller follow-ons once the tiers exist: four
glyph ripples per weather cell could be one element whose content steps,
and sky rain could cap its drop count by viewport size.


## Opportunities catalog follow-ons

**Raised** 2026-09-11, from the reviews of the catalog work as it merged.
None of these blocks anything; each is a polish item or a question.

- The catalog's unknown rows carry `data-slot="<group>:<ordinal>"` for the
  morph. No title or key leaks, but the ordinal maps to a species for
  anyone reading the source with the species order in hand. The slot only
  needs to be stable, not ordered.
- Four sites emit opportunity notices with slightly different rules
  (`discoverOpportunity`, `applyOpportunityEvent`, `discoverMany`,
  `refreshOpportunities`). One `emitNotice` helper would keep them from
  drifting. The same shape for the page-holding computation in
  `ui/opportunity-catalog.ts`, which appears three times.
- The narrow breakpoint lives twice, `main.ts` (`max-width: 700px`) and
  `style.css` (`--opportunity-page-size: 6` under the same query). Nothing
  asserts the two strings agree.
- `.opportunity-body` has a fixed height and the dialog `overflow: visible`,
  so a detail taller than the reserved body would paint over the button row
  rather than scroll. The longest current note fits at 390 px with margin.
- An all-unknown catalog page reads sparse: every unknown row carries an
  empty group-heading span, and a fresh Wildlife tab is three pages of
  identical `[?] Undiscovered opportunity` lines. What a first look at the
  index should say is the author's call.
- `DAY_ONE_CAPABILITY_KEYS` is a flat list. The first recipe or structure
  that gets a real availability gate splits it into day-one and later
  members; the comment says so, the type does not.
- The walk-sign roll uses region density only, while the hunt path also
  weights species by `habitatPrior`, so elk sign can be read on any
  non-water terrain the region holds. Per-cell density recomputation on
  every walked cell is also the first thing to cache if the whole-run
  sims slow.
- `scripts/opportunity-ux.mjs` asserts the opening queue at one moment and
  the next-page click only by node existence; the unit tests cover both
  claims over the whole queue, so the browser checks are belt and braces.
- Test hygiene, four places where a test proves less than it reads: the
  authored-journey reachability test accepts any matching step rather than
  every ordinary step; collection subset coverage asserts generated
  membership, not a working discovery and credit route per member; the
  seasonal legacy-selection test pins the selected leaf but not its
  discovery notice; the starlight walk-sign test does not pin that its
  midnight is brighter than pitch dark, so an overcast moonless night turns
  it into a copy of the dark case.

## Nature is the enemy: the camp, the stake and the idle layer

**Raised** 2026-09-11, in a design conversation on why the idle layer is
the weakest part of the game after the 09-07 and 09-10 playtests. The
mental model itself is now in the roadmap's "What we are optimising for"
section. Everything below is a candidate; each carries a verdict, add,
consider later, or do not add, and the reason.

### The diagnosis

Three things the idle genre depends on are missing, and neither playtest
rejected idle as such:

- **No ratchet.** Idle games run on a quantity that only goes up, whose
  rate the player improves. Survival is homeostasis: when it works,
  nothing happens. Skills are invisible hours, Lineage pays only on death,
  and camp is a short ladder.
- **No return moment.** `catchUp` in `src/sim/save.ts` returns a log and a
  per-order tally. That is a report, not a payoff, and it can be "you
  died while the tab was closed."
- **Unauthored autonomy.** Both testers accepted indirect control (RimWorld
  and Dwarf Fortress came up unprompted) and rejected acts they had not
  written the rule for. The 09-10 tester's own line: those games have
  indirect control without being idle games.

The answer that keeps realism is **extension, not intensification**. The
unrealistic ratchet makes one hectare yield more; the honest ones work
more hectares, bank more months, know more country, carry more
generations and cut the odds of dying. Four of those five are in the tree.
Proposed as a rule for "Rules that hold across all eight" once an item
below lands: no number in the game rises by making a fixed real quantity
(a day's kilocalories, a working day, a hectare's yield) larger.

### Games to play, and what to take from each

- **Loop Hero.** No control over the hero at all; the player shapes the
  world he walks and decides when to retreat with the loot. Autonomy is
  pleasant because the player authored the environment. The nearest
  shipped answer to the control contract question.
- **Kittens Game.** The one mainstream idle game that is a survival idle.
  Storage caps make returning necessary rather than permitted, and the
  season is the check-in clock; winter kills kittens.
- **This War of Mine.** The night scavenging run is an away period the
  player authored, with a destination, a risk and a haul, and a report on
  return that is a story. That is what "away" should mean here.
- **RimWorld.** The work-priority tab and the thought ledger: state as an
  itemised list of signed causes, thresholds drawn on the bar, the reason
  attached to the greyed affordance, and an override that is always
  available and visibly temporary.
- **Oxygen Not Included.** The daily report as a return moment for a game
  that never stops.
- **Increlution.** A survival incremental with short runs, death, carried
  knowledge and earned automation; this game's lineage model with the
  attention curve already solved.
- **Cultist Simulator.** Real time, a hunger timer that must be fed, and
  nothing starts without the player placing it. The control contract from
  the other direction.
- **Frostpunk.** One meaningful decision a day and the rest is watching;
  the heat map is a painted stake against the cold with no claimant.

### Add, and consider later

Moved into the roadmap as item P, "The camp and the stake": six parts in
build order (the two views, placed improvements, the camp sheet, the
stake, raids that scale with the larder, a pack range that follows its
prey) and four held for later (zone painting as control, the seasonal
round, a camp across several cells, the catchment overlay).

### Do not add

- **Political borders or claims.** A border needs pressure from outside,
  and nature supplies it; there is nothing to claim ground from, so a
  claim would be the first mechanic in the game that is not a real
  quantity. The stake in 4 is what a border is here.
- **Other people.** A camp that becomes a household solves the ceiling
  completely and makes the game RimWorld. The premise is one survivor and
  the roadmap's contract is written around it. Area and generations
  first; this is a fork to name, not to drift into.
- **An abstract storage capacity.** "Storage 200/400" would be the first
  abstract number in the game. The caps exist and are real; surface them.
- **Intensification ratchets.** Faster eating, longer days, richer
  hectares, multipliers on yield. Every one breaks the model, and the
  rule proposed under the diagnosis bans them.
- **A wake button as the answer to sleep.** The camp view is the answer to
  what those minutes are for. Whether sleep can be interrupted at all is
  still the open half of the 09-10 record's proposed improvement 2 and
  stays a control-contract question.

## The solved world: principles to keep, and the order of what is next

The terrain landed 2026-09-12 (PR 13, then the glacial basins). The
principle to preserve above every item below: generate a plausible world
first, then adapt the game to living in it. The danger from here is seeing
hard survival readings and turning geography back into a convenience
generator. Model limitations are roadmap items, not reasons to bend a
parameter; a wrong number is corrected on its real anchor, never tuned to a
gate.

Priority order:

1. **Drainage basin partitioning.** Seed 42's largest mouth reads 1,639
   cubic metres a second into the Bothnian bay where the Lule carries 500:
   the basins spill across low divides and the interior finds one spill
   path. Fix it structurally in the sill and basin rule (basins bounded by
   the divide they sit under, sills that hold), not by capping discharge.
   Large rivers must emerge because a genuinely large catchment feeds them.
2. **Lee stability at survival timescales.** Lee is relative obstruction in
   the current upwind direction, not a terrain label, and that stays. What
   to inspect is flapping: a 20 degree wind swing must not flip a hillside
   from full shelter to none every few minutes. Give the effect inertia
   rather than falsifying the terrain: the shelter calculation reads a wind
   direction averaged over a recent period, or protection changes gradually.
   Then re-read every survival rule that consumes galeProtection.
3. **The broader seed sweep and the full slow suite.** Every realism
   target is read on seeds 42, 1 and 7 only. Make the sweep a standing
   report over ten seeds; run the slow suite whole once, on ask.
4. **Judge the moved gates on their merits.** The heir reaches the old camp
   on day 14 (was 3), the manual stage freezes on day 7, the lineage gate
   reads 3 of 5. Do not restore old numbers because the world moved them:
   each may be a real pacing problem or the old world's convenience.
5. **Bog as ecology, not slope.** Peatland follows permeability,
   groundwater, flatness, drainage convergence, lake margins and climate.
   A later ecology pass; only pull it forward if bog scarcity changes
   survival materially.
6. **Seasonal hydrology, and the river a survivor stands in.** The design is
   written and unbuilt: `docs/superpowers/specs/2026-09-11-survidle-rivers-
   design.md` already carries stage (width, depth and velocity at a station
   from discharge), flow through the season including snowmelt, the
   depth-velocity wading limit, fording, bridging a narrow stream, swimming,
   drift, cold-water incapacitation, overbank flood surfaces, and river ice
   thinner and later than lake ice. Nothing here needs a second design; what
   it needs is building, and the parts are separable in that order. Glaciers
   stay optional and scope dependent. What would look wrong: a river read as
   one uniform barrier the way it is today, a ford that is a 300 m gradient
   flag rather than today's hydraulics, or a crossing whose cost does not
   change between June and the melt.
7. Everything else as detail: the report's lowland rock bucket includes the
   treeline band (fix the measure, not the rule); the template is a window
   with a straight coast trend and a Bothnian notch, and erosion runs at
   1.2 km, so no Lofoten geometry and no sub-kilometre landforms; both are
   believable at this game's scale and stay limitations, not defects.

Two readings that are not concerns: rivers as chains of lakes joined by
short reaches are Fennoscandian and stay; do not force a continuous line
where the terrain does not draw one. Scarce visible rivers are a consequence
of explicit thresholds, so the game must distinguish surface drainage, tiny
stream, perennial brook (20 litres a second) and river (5 cubic metres a
second) rather than reading everything below river as no flowing water.

## The heir probe costs an hour, and one call in one place is why

**Raised** 2026-09-12, after the sign table stopped being walked once per
cell and species (`tests/hunting-chooser.test.ts` holds the budget) and the
lineage was put behind `--i-have-timed-a-life`. The fix was real for a player
and did nothing for the probe, and finding out why is what this item is.

### What was measured

A life on seed 17 costs 125 to 134 s. The lineage is 24 of them, so it is
about 50 minutes; it read 80 before the sign table was indexed.

`bestHuntCell` is called **21,130 times in the forty-day seed 17 life, 528
times a game day** - about once every three game minutes. One decision costs
about 6 ms on a mapped region. That is 127 s, which is the whole life. The
probe is not a slow simulation with a slow chooser in it; it is the chooser.

The reference runner records six signs in that life and eight in a kitted one
reaching day 245, all in one region, which is why the sign-table fix moved
nothing here. Its value is for a player who ranges: one decision took 50 ms
at 100 signs and 1.1 s at 2,000 before the index, and 6 ms flat after.

### Why it is called so often

`placeFor` in `src/sim/intent.ts` resolves where a task would happen, and for
`hunt any` that is `anyHuntCell` and so `bestHuntCell`. The order runner asks
where a task would happen every time it weighs the list, not only when a hunt
begins. So the sweep runs while the survivor is felling a tree, hauling, or
asleep, and answers the same cell it answered three minutes ago.

### The order to fix it in

1. **Do not choose again when nothing it reads has changed.** The chosen cell
   is a function of the survivor's cell, the mapped set, the season and
   weather, the hunting level, the sign table and the pressure. A tick that
   moves none of those cannot move the answer. Memoise on those inputs, or
   hold the chosen cell until the survivor reaches it or it stops being worth
   hunting. Expect the call count, not the call, to fall by one to two orders
   of magnitude; this is the item that could take a life under ten seconds and
   the lineage under five minutes. Behaviour must not move: the reference
   runs are the check, and seed 17 dying on day 40 with the same unexploited
   line is what "did not move" means.
2. **Run the seeds in parallel.** Lives within a seed are a chain - each heir
   needs its ancestor's death - but the five seeds are independent. A worker
   per seed is about 5x for no change to the sim at all, and it is worth doing
   whether or not 1 lands.
3. **Only then look at the sweep itself.** `bestHuntCell` scores every mapped
   cell of the region, and of the neighbouring regions above hunting 8,
   through `huntSpeciesWeights` and `habitatPrior` for each species, and the
   cell lookups under those are most of what a profile shows. Scoring fewer
   cells moves the cell the chooser picks, which the chooser's test pins
   against the whole-region sweep on purpose. So this one is a design call
   about how far a survivor looks, not an optimisation, and it should not be
   reached for while 1 and 2 are undone.

The gate comes off when a life is measured under two minutes, and the
`--i-have-timed-a-life` flag with it. Under twenty seconds is the target
worth having: a lineage read in two minutes is a reading that gets run.

## Rhizome as a patch-to-patch winter loop

**Raised** 2026-09-13, after the 50 m patch became the simulation's unit.

A root dig takes its kilos from the patch underfoot, and a patch is a
thirty-sixth of what a cell used to hold: the seed 17 start region went from
30,240 kg of diggable rhizome to 840, and a shore patch carries about 22.5 kg.
The same `ROOT_KG_PER_HOUR` therefore thins a patch thirty-six times faster,
so `rootDigFactor`'s "dug over here" line arrives within an afternoon. Roots
are no longer a stand-still food; they are a walk-between-patches food, and
nothing in the orders, the opportunities or the pace words says so.

Design the loop rather than re-inflating the patch: what a reedbed or a shore
run of patches holds, how fast a dug patch recovers over a winter, whether a
standing order may work a run of patches without a fresh once order each time,
and what the player is told about a patch that is spent. Winter is the case
that matters, because rhizome is the food that is there when nothing else is.

What would look wrong: a survivor standing on one patch for a day and lifting
a cell's worth of roots off it; or an order list that makes the player retype
the same dig thirty-six times to eat what one order used to feed them.

## Work spots and named places at 50 m

**Raised** 2026-09-13, from the step 5b measurement.

`nearestCell` sorts a region's cells by straight line, and a region is now
6,069 to 7,941 patches rather than a couple of hundred cells. Two things
follow, and both are measured: the nearest matching patch is essentially
adjacent (a `chop` spot is 0.00, 0.00 and 0.05 km away on seeds 17, 39 and 79,
where the region's named `forest` spot is 0.58, 0.99 and 2.31 km), and the
chosen patch is essentially never the named spot's own patch, so `whereIs`
reads "a spot 0.1 km north" where it read "the forest". Fifteen fixtures are
pinned to the old walks and must not be fixed one at a time before this is
decided.

Three options, none costed as obviously right:

1. **Keep it.** The nearest patch is the physically honest answer - you fell
   the nearest tree. Re-bake the fifteen fixtures, accept short early walks and
   the anonymous wording, and re-read the balance gates before concluding
   anything from them.
2. **A minimum spot distance.** `nearestCell` skips patches inside a radius.
   Cheap, one constant - and that constant needs a real-north reason, not a
   number picked to restore the old fixtures.
3. **Nearest distinct stand.** Choose the parent, or a contiguous run of
   matching patches above some size, or the named spot whenever the nearest
   match lies in the same stand as it. This is the only option that also
   restores the naming, and it needs a definition of "stand" the 50 m lattice
   can answer cheaply.

What would look wrong: a day's grind that never leaves the camp patch; or the
player reading a grid reference where they used to read a place.

## Overlay-cache pressure at the 20 MB cap

**Raised** 2026-09-13, from the step 7 performance gate.

Every fine cache together reads 17.73 MB against a 20 MB budget, with the
chunk LRU at its cap (16.75 MB of the ceiling, 2.88 MB resident) and overlays
at 0.90 MB for the 77 a day of play holds. The overlay cache's own cap is
1,024 entries: at the size a day's play gives them that would be 12.0 MB,
which with the chunks at their cap is over the line. The gate measures the
overlays play actually holds, so it would stay green while a longer or more
travelled session walked past the budget.

Decide whether the overlay cap is a byte budget rather than an entry count,
and gate on the ceiling instead of the day. Look at the overlay cap first if
the 20 MB line is ever tightened.

What would look wrong: a long session where the map gets slower the more
ground the survivor has seen, with every cache still reporting itself inside
its own cap.

## The long-horizon gates have not been read since the fine world

**Raised** 2026-09-13, at the end of the authoritative-close-zoom branch.

The April, winter, year and lineage gates and the balance sweep were all last
read against the 300 m world. Four things moved under them and none of the
readings has been retaken:

- **Standing timber is 50 to 75 times what it was.** A forest patch carries
  62.5 to 125 stems where the old abstraction gave 1.67, so `wood0` and every
  fuel-planning number move by that factor. Felling is now effectively
  unlimited on one patch for a whole winter. That is realistic for a quarter
  hectare and may still be too generous as a game.
- **Movement, snow and sight are all patch-local now**, so a day's walking,
  hauling and surveying costs what the ground between two points really costs
  rather than what six cells averaged to.
- **Resources are patch-local**, which is the rhizome item above and the same
  story for wood, water and forage.
- **`pickVantage` values a far view three to four times its near one** on a
  high fell (1e6/36 against 96 squared), so sweeps may climb more than they
  did.

Read the gates before anything is concluded from them, and per "gates measure
the sim" do not restore an old number because the world moved it. Each moved
gate is either a real pacing problem or the old world's convenience, and which
one it is has to be decided per gate.

What would look wrong: a balance decision taken on a gate reading that
predates the merge; or a correct physical number bent to make an old gate
green.

## Bog under-shows at the 300 m rung

**Raised** 2026-09-13, left open by the wetness calibration (phase 3 A2).

The two rungs agree to 97.6 to 97.9 percent overall, but bog does not: 0.49
percent of land at 300 m against 1.34 at 50 m on seed 42. The fine rung is
authoritative and unchanged, so nothing a survivor walks on has moved; what
under-shows is the far map. A cell whose typical patch is hillslope is not
bog even when a tenth of it is, and bog at 50 m is often exactly that tenth,
the thread along a hollow's floor.

The obvious cheap fix - let the coarse class read bog when enough of the 36
modelled points are bog - was probed and does not work. The 36 points are one
thread column and five hillslope columns, so the histogram of bog points per
eligible cell is empty between 1 and 5: every fraction at or below a sixth is
the same rule, and that rule reads 4.13, 2.86 and 5.05 percent bog on seeds
42, 7 and 1984 - three times the fine rung rather than equal to it. The
fraction that does agree is about a third (1.46, 0.99, 1.97 percent), and a
third has no derivation from either rung; it is a number chosen to match a
number. It would also make bog the one class that wins a cell it is a minority
of, against the majority rule the rest of the classifier states.

So this is a presentation question, not a calibration one, and it should not
be answered by wetting the coarse rung again. The shape it probably wants is a
"some of this is bog" cue the far map can carry alongside the cell's class -
which needs the cell to keep a second number, not a different class.

What would look wrong: bog appearing on the far map in places a walk finds dry;
or the fine rung retuned so the far map's arithmetic comes out.

## The terrain report's figures predate the classifier

**Raised** 2026-09-13.

`docs/superpowers/reports/2026-09-11-terrain-hydrology-report.md` was written
at `GENERATOR_VERSION` 3 and the generator is at 7. Its class shares,
bog-by-latitude and mean-slope-by-class tables are all pre-calibration. It is
marked stale in the doc with a pointer, and deliberately not rewritten: it is
a dated report of a past round and its numbers are the evidence for the
decisions that round took.

Re-measure into a new dated report when the next terrain question needs a
baseline. What would look wrong: a decision argued from that report's tables
as if they described today's world.

## Clearings are invisible to the region and to cached routes

**Raised** 2026-09-13, from the forest-succession work.

A felled-out patch becomes saved clearing ground, and the patch-level readers
see it. Two readers do not:

- **Region wildlife capacity.** `RegionDef.frac` / `capacity` / `wood0` are
  computed once when a region is built, so a region whose forest has been cut
  to clearings still carries a forest's capacity. Habitat reads at the patch
  see the clearing; the region's own number does not.
- **Route and topology caches.** A clearing changes terrain speed (spruce to
  meadow) but not passability, and `succeedGround` clears only the parent
  summaries. A cached fine route over a freshly cleared patch keeps its old
  cost until it expires.

Both are correctness gaps rather than balance ones, and both need the same
decision: what a saved ground change is allowed to invalidate, and at what
cost. Note that on today's stem densities a clearing takes 112 felled trees
off one 50 m square, so neither gap is reachable in ordinary play yet - which
is a reason to fix them before the density question above moves.

**Amended** 2026-09-13, from the phase 3 fix wave. A third reader disagrees
with a clearing in the same way: tasks.ts refuses a fell, a dead-wood
gathering or an inner-bark strip below its own stock guard (tasks.ts:503,
509, 536), and those guards sit below the clearing share on every forest
terrain, so they can never fire while the ground is still forest - the
clearing door always answers first. The wording it answers with is built for
standing forest ("stand in the forest; walk to the forest"), so a survivor
who has just cut their own cutover reads a true refusal as a bug. See "Dead
refusal branches after succession" below for the decision this and the two
unreachable guards want together.

What would look wrong: a region logged flat that still feeds as much game as
an untouched one; or a walk that takes the old time across ground that is now
open.

## Far country is not dimmed on inheritance

**Raised** 2026-09-13, from the coarse far-country work.

`inheritKnowledge` dims what the ancestor walked but keeps far country whole,
on the argument that a coarse mark was never a claim about ground anyone stood
on: it is the shape of the country, and the heir grew up hearing it. That may
be right and it may read as the heir inheriting a survey. It is a one-line
change either way, and the call wants a playtest rather than an argument.

**Amended** 2026-09-13, from the phase 3 fix wave. "A coarse mark" is not one
thing: `knowledgeAtLevel` names a patch `farParent` or `farAggregate`, and the
far map now draws each its own ground (a `farAggregate` block reads
`aggregateTerrain`, its middle parent's terrain, rather than its own parent
detail). A block at the wider rungs can still hold both grains at once, and
the tooltip says "seen from afar" either way - true of both, but naming
neither. Fixing that wants `GlyphGround` to carry the composition, not just
the winning terrain.

What would look wrong: an heir opening the map to a far view the ancestor
earned from a fell the heir has never climbed, with nothing saying where it
came from; or a tooltip claiming one grain's precision for ground it drew at
the other's.

## `DEFAULT_ZOOM` opens on the 300 m rung

**Raised** 2026-09-13, carried from the close-zoom migration.

`DEFAULT_ZOOM` is 2, the spec's 300 m rung, so a fresh survivor's opening
board is mostly fog: the rung shows six patches per glyph and a survivor who
has seen one valley has read very little of it. Opening at rung 1 (100 m) or
rung 0 would show a smaller world more fully. This is a first-minutes design
call, not a bug, and it is the first thing a new tester sees.

What would look wrong: an opening screen that reads as an empty map rather
than as a small clearing in a large country.

## The coarse pass runs inside every `seeFrom`

**Raised** 2026-09-13, from the coarse far-country work.

A survivor standing on a high fell pays about 47,000 parent reads on the first
look of each ten-minute bucket, because `markCoarseSeen` runs inside `seeFrom`
and `seeFrom` is called on every survey step. That is under the fine
viewshed's own budget, so nothing is slow today, but it is the largest thing
a vantage costs and it is paid again at every step of a sweep.

If a profile shows it, the lever is a vantage-keyed cache of the marked set
rather than a narrower fan: the same vantage sees the same far country, and
recomputing it is what costs. Do not shrink the horizon to buy the time back -
the horizon is derived from the physics.

What would look wrong: a sweep from a fell that stutters where a sweep across
a bog does not.

## Patch ground physics unfinished

**Raised** 2026-09-13, from the pre-merge triage.

`patchGroundModifiers` in `src/sim/weather.ts` gives each patch a snow
modifier from canopy and wind exposure and a water modifier from its own
wetness index, but two physical inputs are still missing. Nearby standing
water is not read as a patch input at all, so a shore patch dries and sheds
snow exactly like a hilltop of the same wetness class. And `dryHours` only
counts precipitation and soil moisture (`weather.ts`, the `dryHours` update),
so ponding after rain never extends it: a patch can read "dry" the moment
rain stops even where water is still standing on it.

Separately, `PATCH_MODIFIER_LIMIT` (16,384) clears the whole modifier cache
the instant it fills, rather than evicting the coldest entries, so a survivor
who has ranged widely pays a full recompute for every patch on the next
touch.

What would look wrong: a shore patch reading as dry as a hilltop right after
rain, or a well-travelled world stuttering on ground it has already computed
once.

## Fast suite is five minutes against the repo's own rule

**Raised** 2026-09-13, from the pre-merge triage.

`npm test` runs the fast suite in about 313 seconds (1182 cases, measured in
the phase 3 fix wave), against this repo's own rule that a fast suite should
cost "a few seconds" and a slow part should be split behind its own script.
The Task 5 ruling that let this happen was explicit and time-boxed: it moved
`tests/hunting.test.ts` to the slow suite and left seven more files that had
grown past 20 seconds in the fine world in the fast suite on purpose -
`goalopportunity` 110 s, `dopanel` 96 s, `thin-ice-panel` 49 s, `shelter`
46 s, `storms` 29 s, `weathersense` 29 s, `sight` 26 s - "until Task 13
measures them." Task 13 never did; the ruling lapsed rather than resolved.

What would look wrong: nothing in play, since none of this changes what the
game does. Every commit against this branch pays close to five minutes for
it, which is exactly the cost the repo's convention exists to avoid.

## Wildlife at 50 m: three loose ends

**Raised** 2026-09-13, from the pre-merge triage. (Region wildlife capacity
ignoring clearings is already covered by "Clearings are invisible to the
region and to cached routes" above; not repeated here.)

- **`localForage` lost its any-passable fallback.** `suitableCells` in
  `src/sim/wildlife-agents.ts` falls back to any passable patch in the region
  when none match the species' habitat, so a subject placed on odd ground is
  never stranded. `localForage` (same file) has no such fallback: it only
  ever returns a patch that is both passable and in habitat, so a subject
  whose region's habitat has been cut back or never generated near it can
  fail to forage at all.
- **The diagonal corner rule ignores region.** `stepCandidates` requires a
  step's own patch to share the subject's region but checks the two corner
  patches a diagonal squeezes between for passability only, not region
  membership. A diagonal across a region seam can pass a corner check that a
  straight step at the same seam would fail on the region test alone.
- **A fleeing animal still stops at a region boundary.** The same
  region-scoped filter in `stepCandidates` governs `intent === "flee"`
  travel, so an animal escaping a threat treats the region edge as a wall it
  cannot cross, the way bookkeeping treats terrain rather than the way a
  frightened animal would.

What would look wrong: an animal that cannot find food yards from where it
stands, a diagonal escape route open where the straight one is not, or a
chase that ends at an invisible line on the map instead of the animal simply
outrunning it.

## Map code debt

**Raised** 2026-09-13, from the pre-merge triage.

`src/ui/map.ts` is over 1500 lines and carries duplication its own comments
do not flag:

- **`featuresIn` duplicates the render path's marker logic, with different
  fire gating.** `featuresIn` (used for the tooltip's "also in this glyph"
  list) marks a camp's fire lit whenever `st.fire.lit` is true. The main
  render loop's own marker map, a few hundred lines later, gates the same
  fire on distance and `campfireVisible` occlusion before drawing it. The two
  paths can disagree about whether a fire mark is showing.
- **Two owners of `.target`-shaped state never get cleared together.**
  Wildlife's own `active.target` (`wildlife-agents.ts`) and the UI's
  `ui.destination` (`map.ts`) are set and read independently; nothing keeps
  them in step when one is invalidated without the other.
- **The aggregate summary is computed twice per tooltip.** `glyphGround`
  calls `glyphSummary` once to draw a block's terrain (`map.ts:813`); when
  the same block gets a tooltip, `tip.ts`'s `aggregateLines` calls
  `glyphSummary` again for the identical box.
- Target resolution, marker computation and tooltip assembly could each be
  their own module; today they are read by scrolling.

What would look wrong: a fire mark that shows on the tooltip but not on the
map (or the reverse), or a hover-driven slowdown that traces back to the same
summary being rebuilt for ground already drawn this frame.

## Fire spread across a region line

**Raised** 2026-09-13, from the pre-merge triage.

`burnWoodAround` (`src/sim/stocks.ts`) collects every patch within
`FIRE_SPREAD_REACH_M` (300 m) of a burning camp by raw coordinate distance
and debits each one's standing wood through the caller's own `RegionState`,
with no check that a nearby patch actually belongs to that region. A camp
within 300 m of a region seam burns wood out of the wrong region's stock.

What would look wrong: a neighbouring region's forest thinning from a fire
its own survivor never lit or saw.

## Dead refusal branches after succession

**Raised** 2026-09-13, from the pre-merge triage and the phase 3 fix wave.

Three refusal guards in `tasks.ts` are unreachable for any generated stand:
felling refuses under 1 stem (tasks.ts:503), gathering dead wood refuses
under an eighth of a full patch (tasks.ts:509), and stripping inner bark
refuses under 1 stem (tasks.ts:536). The clearing door sits above all three -
a tenth of a full patch, which is 12.5 stems on spruce, 8.75 on pine, 6.25 on
birch - and no forest terrain's full patch is under 10 stems, so the ground
turns to meadow and the clearing refusal answers before any of these three
ever can. Their player-facing strings ("the pines are stripped", "the forest
is picked clean", and the inner-bark equivalent) are dead text.

The fix wave's two covering tests now pin the clearing's own refusal instead,
which reads oddly on fresh-cut ground: a survivor standing in the cutover
they just made is told "stand in the forest; walk to the forest." The
probable answer is not deletion but a clearing-aware refusal that names what
actually happened, but that is a decision, not a cleanup - the branches stay
until it is made.

What would look wrong: a player action refused with wording that assumes
standing forest while the survivor can see the stumps.

## Forest table review

**Raised** 2026-09-13, from the pre-merge triage.

Three small findings from the stand-density work, none urgent enough to
block on:

- `STAND_ROTATION_YEARS` (`src/world/aggregate.ts:44`) gives spruce 100
  years and pine 90. Northern silviculture usually runs the reverse - pine
  is the slower, longer-rotation species on poor northern ground - so this
  wants a source check rather than an assumption either way.
- `GroundChange.since` (`src/world/groundchange.ts:23`) is written on every
  ground change and read nowhere in `src`. Either something should read it
  (age-based succession display, a scar that fades) or it should not be
  carried.
- `Aggregate.trees` (`src/world/aggregate.ts`) is named for a body count but
  its comments and `FELLABLE_STEMS_PER_HA` call the same quantity "stems"
  throughout. One name should win.

What would look wrong: a pine stand felled and regrown twice in the time a
spruce stand takes once, if the rotation is in fact backwards.

## Channel cut after the flood

**Raised** 2026-09-13, from the pre-merge triage.

`src/world/refine.ts` cuts channel height after `lakeComponents` has already
solved which patches sit in a filled depression, so a channel can be carved
through ground the flood-fill just recorded as part of a pool. Measured at 8
of roughly 2000 channel patches on the sampled seed. Small enough that it may
be an intentional order (an outlet cut resolves the depression rather than
disagreeing with it) rather than a bug, but that has not been confirmed
either way.

What would look wrong: a channel patch that draws as a stream while the same
ground is recorded as standing water underneath it.

## Hunting chooser test cannot exercise its own shortlist cut

**Raised** 2026-09-13, from the pre-merge triage.

`tests/hunting-chooser.test.ts` asserts a search-count bound
(`HUNT_SHORTLIST * 2 + 2`) meant to prove the shortlist actually cuts the
candidate set on seed 42, but the case still passes if `HUNT_SHORTLIST`
(`src/sim/hunting.ts:28`) is set to 1, which means seed 42 never produces
enough candidates to test the cut at all. It needs a seed and skill level
that genuinely produces a shortlist longer than the cut, or it is only
testing that the code runs.

What would look wrong: a change that breaks the shortlist cut shipping with
this test green.

## The render surface: four canvases and a DOM for the rest

**Raised** 2026-09-14, after Safari terminated the page with "This web page
was reloaded because it was using significant memory" and the profile showed
the cost is the document, not the simulation.

### What the measurements say

Taken on the live page over CDP, with the game sitting still and nothing
being asked of it, in headless Chrome with no GPU:

| | per 30 s | share of one core |
| --- | ---: | ---: |
| Style recalculation | 3.40 s | 11% |
| Script, all of it | 0.94 s | 3% |
| Layout | 0.06 s | 0.2% |
| Total task time | 11.26 s | 38% |

Style recalculation costs three and a half times everything the simulation
and the panels do together. The JS heap sits between 18 and 21 MB and
collects cleanly, so what Safari ran out of is not the heap: it is the
document. The page held 14,279 elements, of which 4,226 were SVG star
circles, 567 are water-shimmer overlays at three per water cell, and 192 are
cloud shadows.

The first reading blamed the star field, and that was wrong. Stage one
removed all 4,226 of those circles - the element count fell to 9,626 and the
animated count from 5,203 to 828 - and style recalculation did not move:
3.40 s to 3.59 s per 30 s, with script rising from 0.94 s to 1.62 s because
a canvas draw costs JS. Stage one's win is element count and memory, which
is what the browser ran out of, and not recalculation.

Isolating the real cause rather than guessing a second time:

| what was disabled | recalc per 30 s | total task |
| --- | ---: | ---: |
| nothing | 3.59 s | 37% of a core |
| every animation and transition | 0.01 s | 11% |
| the water shimmer alone, 567 elements | 0.52 s | 15% |

**The water shimmer carries about 86 percent of all style recalculation in
this game.** Three stacked overlay elements per water cell, each animating.
Everything else that moves costs about half a second between them. That
makes the effects layer, which owns the shimmer, the stage that actually
pays, and it is the reason to build it next rather than last.

### What the first two stages actually bought

Measured on a settled page, seed 17, once both stages had landed and the
effects canvas was drawing the whole board rather than a corner of it:

| | before | after |
| --- | ---: | ---: |
| style recalculation per 30 s | 3.40 s | 0.15 s |
| total frame cost | 38% of a core | 21% |
| script per 30 s | 0.94 s | 3.79 s |
| animated elements | 5,203 | 41 |
| DOM elements | 14,279 | 8,833 |

Recalculation is gone, which was the point, and the frame is a little
under twice as cheap. Script trebled, because a canvas draw is work the
browser used to do and the main thread now does: about 12 ms a draw for
2,592 cells. That is the next thing to optimise rather than a defect, and
it is why the honest figure for the migration is 21 percent and not the
10 percent an earlier reading gave while the canvas was mis-sized.

Three sizing bugs got through the whole markup suite on the way, and all
three are worth remembering because none of them is visible in markup. A
canvas is a replaced element, so `inset: 0` with an auto width leaves it
at its intrinsic 300 by 150 instead of stretching; its backing buffer is a
pair of attributes, so a morph that strips attributes the new markup does
not carry will blank it on every rebuild; and the board is not the panel's
visible box.

That third one survived the fix for the first two and the check written
alongside them, because the check compared the canvas against its host's
**visible** box and that comparison passed. `.scroll-x` clips a board
taller than itself - 504 px of grid in a 262 px panel at the closest rung,
which is the stylesheet's stated intent, "a fixed-size grid is centred and
clipped". The intent also says the viewport never pans, and no game
control pans it. The browser does. The grid is a focusable `role="grid"`
whose 36 rows are walked by arrow-key inspection, and focusing a clipped
cell scrolls it into view whatever `overflow: hidden` says: forty presses
of the down arrow put the panel at `scrollTop` 243, and every layer
absolutely positioned inside it went with it. Measured there, all seven
live water cells the player was looking at fell outside the canvas
entirely - `painted 0, off-buffer 7`. The night shade and the hour's tint
had gone the same 243 px, so the scrolled board also lost its darkening.

The fix is one measurement published as two inherited custom properties,
`--board-w` and `--board-h`, which the canvas, the shade and the tint all
size from - the tint being a pseudo element with no handle for JS to size
directly. They are set on the panel rather than on the scroller because
`setPanel` morphs the panel's children, and an inline style on the
scroller itself would be dropped for a frame on every map rebuild. The
cover is measured from the grid and the panel and never from the panel's
own `scrollHeight`, because an absolutely positioned child counts towards
that and a layer sized from its own contribution ratchets itself bigger
every frame.

The lesson for the check, rather than for the code: an assertion that
compares a layer against the box it already has will pass for the same
reason the bug exists. The shots harness now asserts the canvas against
the **board** - the visible box or the grid's full extent, whichever is
bigger - and then scrolls the panel to its limit and asserts the canvas
still spans what the player can see. Reverted against the unfixed code it
fails on the first scenario with `782x262 over a board of 792x504`.

### Where the frame time actually went

**Measured** 2026-09-16, seed 42 day 200, a settled landed run at 300 m per
glyph in headless Chrome at 1440x900. Three runs per figure, median taken;
the spread between runs was under half a point.

| per 30 s | before | after |
| --- | ---: | ---: |
| total main-thread task time | 10.3 s | 5.6 s |
| of that, script | 7.2 s | 2.45 s |
| style recalculation | 0.73 s | 0.71 s |
| **share of one core** | **34.4%** | **18.8%** |

And what a player feels, from frame-to-frame delays over the same window:

| | before | after |
| --- | ---: | ---: |
| median frame | 16.6 ms | 16.7 ms |
| 95th percentile | 38.9 ms | 21.1 ms |
| 99th percentile | 75.0 ms | 58.0 ms |
| **frames over 33 ms** | **272** | **30** |
| worst frame | 228 ms | 150 ms |

The median frame was always 60 Hz. What was wrong was the spread: about one
frame in six took longer than two display refreshes. That is now one in
fifty-seven.

**The plan in this document aimed at the wrong thing.** It named the effects
draw as the next target, at "roughly 12 ms per draw". A bench that draws the
settled picture over and over (`window.survidle.effectsBench`, a development
door beside `placeAtPatch`) measures that draw at **0.27 ms** - about 0.6 s
of a 30 s window, under 6% of the script time. The 12 ms figure was a
profiler reading that had swept in the forced layout around the draw, not
the draw. Optimising it further would have bought almost nothing, which is
why the first thing done here was to profile rather than to start on the
list.

What the profile actually found, each fixed in the commit this section
accompanies:

- **A viewshed computed six times a frame.** `mapKey` and `mapHtml` between
  them asked `visibleWildlife` for the visible subjects six times while
  building one picture, and each call ran its own contrast pass over every
  candidate patch - the most expensive question a frame can ask. The map
  already held a cached viewshed for the same cell and minute a few lines
  away. Passing it in: **1.7 s per 30 s**.
- **A cloud deck retinted every frame.** The sky rebuilt both cloud layers
  from scratch sixty times a second - clear 960 by 480, fill it, rescale the
  mask bitmap over it, twice - when the only thing that changes per frame is
  where the finished layer is *drawn*. The tint changes with the hour. Held
  between frames: **1.5 s per 30 s**, and all 17 sky reference shots come out
  byte-identical.
- **Thirteen bars, thirty-nine document sweeps.** Every bar wrote itself by
  running `querySelectorAll` for its fill, its value and its trend, on every
  frame, across a page of 8,705 elements. One sweep now indexes all three by
  name: **0.8 s per 30 s**.
- **A morph key made of content.** `keyOf` built a node's identity from every
  data attribute it carried, which for a map cell included `data-map-info` -
  the whole of its hover text. So when the weather changed a cell's reading,
  its key changed with it, the morph could not recognise the cell it already
  had, and all 2,592 were replaced instead of updated. A cell is now keyed by
  its coordinate. `data-map-info` itself turned out to be read by nothing but
  one test, and duplicated `aria-label` exactly, so it is gone.

Three smaller ones came with these: writes to `--bright`, `--sat`, `--tint`
and `--tint-a` are compared before being made (they are inherited by all
2,592 cells, so writing an unchanged value asked the engine to re-resolve
the whole board), `?shimmer=` is read from the cascade once rather than
through `getComputedStyle` every frame, and the water and weather cells
carry their seeded phases and peaks on the model instead of rehashing them
per cell per frame.

**What was tried and taken back out**, because measurement did not support
it: caching the effects canvas's transform and box (no gain, and a stale
transform is a real hazard), and repainting the sky at 20 Hz while only the
cloud deck is moving (0.4%, inside the noise, and it changed when the sky
draws - a test that called `updateSky` twice in a row and expected two
pictures caught it). A change at the noise floor is not worth the behaviour
it alters.

### What is left, and why it needs stage three

The count of long tasks did not move: about 19 per 30 s, the worst still
around 150 ms. They are all one thing. Once a game minute the map's key
changes and its 2,592-cell panel is rebuilt and morphed, and the next
reader of layout pays for the reflow that causes. Spread across
`morphChildren`, `morphAttrs`, `setPanel` and the forced layout behind
`ensureCanvasSize`, no single part is more than a fifth of it, so there is
no remaining cut of that size to make in a document.

That is the case for stage three, and it is now a sharper case than this
document opened with: the steady per-frame cost is dealt with, and what is
left is the cost of *being* a document at all - rebuilding and diffing
thousands of elements for a picture that changes every second. A canvas map
does not have a morph.

### Stage three, as built

**Decided** 2026-09-16, on the way in, and then **revised the same day**
once the first cut had been played. The plan above left three open
questions and one design freedom; this is what was chosen, what the first
cut got wrong, and what stands.

The board is one canvas drawn from a model. `buildMapModel` (map.ts) works
out, per glyph, everything the old markup carried - the words the classes
were (`t-water`, `memory`, `mk-player`), the character, the borders, the
hover text, the patch and the action it stands for - and `drawBoard`
(mapcanvas.ts) turns that into a picture in a canvas nobody sees, redrawn
only when the map's key changes. The picture reaches the screen through
the effects layer: `updateEffects` copies it onto the one visible canvas
every frame under the light of the hour and then draws everything that
moves over it, in the order the old stack of layers had - the night shade
and the hour's tint over the whole panel, the water, the cloud shadow and
the weather motion, the walk, the marks that stay legible in the dark
drawn again over the shade, the pulses, the animals at their own metre
positions, the startle cues, the pointed glyph. The static layer draws
nothing that moves, which is the budget the plan asked for, and the
`.grid` element keeps only its box: hit testing, the board cover and the
viewport bounds were always arithmetic over its rect and still are.

The first cut kept the stylesheet as the source of colours, through a
hidden probe cell and `getComputedStyle`, and kept `mapHtml` as a
serializer of the model into the old markup so that nineteen test files
could go on reading the map as a document. Both were retired the same
day, and the reason is the one the author gave: a board drawn from a
stylesheet through a probe, verified through a markup nobody shows, is a
board that is not what the player sees, and it is not trustworthy on the
one browser that was crashing. So:

- **The palette is code.** `palette.ts` is the 140 cell rules carried over
  one by one, with the cascade's order of precedence written out as the
  order of the assignments. It was checked against the stylesheet before
  the stylesheet went: every distinct look on the board, across five
  seeds, four seasons, every rung and night, through the probe and
  through the function, and the two agreed on all of them (the two
  differences found were the probe's own - a remembered mark filtered
  twice, and a fog dot drawn under the survivor's `@`). Then the cell
  rules, the keyframes, the overlays, the shade and the tint left the
  stylesheet: 424 lines, and no rule left that the board reads.
- **The tests read the model.** `tests/board.ts` is the whole of the
  helper: `board()` builds the model, `glyphsWith(b, "t-water",
  "memory")` is what `.c.t-water.memory` used to select, `glyphOfCell`
  finds the glyph a patch falls in at any rung. What the stylesheet used
  to be asked - a mark keeps its colours on any ground, snow flattens the
  relief, ice has no shallows - the palette is asked instead, and it
  answers the same. What the DOM's z-indices used to be asked is now the
  draw order of `updateEffects`, and the test reads that order.
- **The overlays are drawn.** The walk line (two strokes), the herd's
  exact-position marks at 50 m (with the 180 ms slide the old `transition`
  gave a move), the startle cues (the 1.2 s pop, hold and rise of the old
  keyframes, sampled against the wall clock from each cue's own start) and
  the recoil shake are all `updateEffects` draws from the model. The
  `--wildlife-now` write every frame and the paused-animation trick that
  read it are gone with them.

What the real-input harness found, and the DOM never would have. The plan
had a browser harness that read a fixture world through an off-screen copy
of the board's markup; the author's view of the game was not that, and
said so. `scripts/e2e.mjs` plays the real game instead: seed 42 on day
200, landed through the real controls, clicked on the board with real
mouse events at real screen coordinates, zoomed with the real buttons,
walked into night, screenshotted as the player sees it. Its first run
turned up two bugs that had been in the DOM board all along:

- **The board sat at the top of its panel and clipped the bottom half.**
  `.scroll-x` is a grid container whose one row track sized itself to the
  board's 504 px, so `place-items: center` centred nothing: on a 900 px
  window the map panel is 262 px tall, the survivor - the middle glyph -
  was drawn on the panel's bottom edge, and every glyph under them was off
  the screen and could not be clicked. That is the "player glyph is
  broken" report and half of the "two clicks to walk" one: a click on the
  visible half walked, a click aimed below it landed on the legend. One
  declaration fixes it - `grid-template-rows: minmax(0, 1fr)` - and the
  harness now holds the survivor to the middle third of the visible panel.
- **The block rungs re-cut the board on every step.** `viewOrigin` put the
  survivor's patch in the middle glyph exactly, so at 300 m the origin
  moved one patch per step and every glyph on the board re-aggregated its
  block one patch over: the whole board recoloured under a survivor
  standing still in the middle of it. That is the "shimmers and jiggles
  like crazy when I walk at 300 m" report. The origin is snapped to whole
  glyphs now; the board holds still while the survivor crosses a block and
  scrolls one glyph when they leave it. The harness measures it: median
  glyph churn between origin moves is held under one percent, and a step
  that re-reads more than five percent of the board is allowed twice in a
  walk (a region crossing re-washes that region once).

The harness is `npm run e2e` against `npm run dev`, and `docs/e2e/` is
what it saw. `docs/map-shots/` and the `?weather-shot=` fixture mode are
gone: the game has one way of being looked at, which is playing it.

**Measured** 2026-09-16, the same seed, day and settled window as the
figures above, three runs a figure, the DOM board against the one canvas:

                                   DOM board   one canvas
  main-thread task time per 30 s     5.6-6.0 s   5.9 s
  of that, script                    2.4-2.5 s   2.26 s
  of that, style recalculation       0.5-0.7 s   0.2 s
  share of one core                  18.5-19.9%  19.8%

  median frame                       16.7 ms     16.7 ms
  95th percentile                    21 ms       21 ms
  99th percentile                    57-60 ms    40 ms
  worst frame                        146-203 ms  56-60 ms (149 once)
  long tasks per 30 s                18-20       0-1
  worst long task                    145-201 ms  51 ms

  elements in the document           8,705       989

The total did not move and the shape of it did. The nineteen long tasks
a half-minute - every one the 2,592-cell panel being rebuilt and morphed
once a game minute, the last thing the previous pass could not cut in a
document - are gone: the worst thing the main thread does in thirty
seconds is now one task of fifty milliseconds, and the 99th-percentile
frame came down from three and a half refreshes to two and a half. What
the total kept is the per-frame draw, which is larger than it was:
copying the board under the light of the hour, then the shade, the tint
and the overlays, every frame, in place of the compositor doing the
layering for free. That is the trade the plan priced - a steady small
cost every frame for the absence of the big one every minute - and the
steady cost is where the next pass would look, starting with drawing the
board's copy only when something above it moved.

Heap over three minutes of the frame loop with the survivor walking,
garbage collected before each sample: 108-109 MB throughout, 989
elements throughout. Nothing grows.

### What the suite was actually spending

**Measured** 2026-09-16. The fast suite took 11 minutes on this container
against the 17 seconds `docs/testing.md` records for the author's machine,
and one sight test took 103 seconds on its own. A CPU profile of that test
put 60 of its 64 busy seconds under `regionAt`, reached from a helper
that walks regions outward to find one with a spruce cell - and the cost
was not the flood that builds a region but the copy the in-process cache
kept of it, which read the region's lazy `spots` to copy them and so
placed them: up to two dozen route searches per region walked past.
Keeping spots lazy across the copy took the test from 96 to 38 seconds;
persisting built regions to disk beside the solved worlds took a warm run
to 15. `docs/testing.md` has the mechanism.

The block-rung walk took two clicks - the first to disclose which patch
the glyph resolved to, the second to order the walk - and the disclosure
was already on show before either, from the pointer and the tooltip. One
click walks at every rung now; touch keeps its tap to inspect.

### The instrument

The figures above came from CDP's own counters (`Performance.getMetrics`)
and its sampling profiler, driven by three throwaway harnesses, plus the
`long-animation-frame` observer for attributing the spikes. None of that is
in the tree. What is in the tree is `window.survidle.effectsBench(n)`,
which reports what one effects draw costs in a real browser, because that
is the one number a redraw budget would need and the one a flame graph
reads differently every time.

The conclusion the numbers force: the game draws a continuously animated
scene through a document, and a document is the wrong instrument for that.
Every moving pixel costs a style resolution on an element that also carries
classes, data attributes and an accessibility role it does not need.

### The architecture

Four surfaces, split by how often each one changes rather than by what it
depicts. That split is the whole point: a layer that changes on a walk must
not be redrawn because a wave moved.

- **Static map canvas.** Terrain, region borders, remembered ground,
  structures. Redraws only when something it depicts actually changes: a
  step, a zoom, newly discovered ground, a building raised, the season
  turning. On a still minute it draws nothing at all.
- **Effects canvas.** Water shimmer, clouds, fog, precipitation, wildlife,
  the route line and the player marker. Everything that moves on its own
  clock. Redraws per animation frame, but as drawing commands rather than as
  thousands of elements, and it can drop to a lower rate or stop entirely
  under reduced motion without touching the layer beneath it.
- **Sky canvas.** Stars, the Milky Way, clouds, precipitation, the sun and
  the moon. This layer alone removes 4,226 SVG circles and the loop in
  `projectCoordinateStars` that rewrites two attributes on every one of them
  ten times a second.
- **DOM.** Buttons, panels, the tooltip, the stocks bar, labels, settings.
  Everything a person clicks, reads or types into stays a document, because
  that is what a document is good at.

### What this buys, and what it costs

Gained: the per-element style cost disappears for everything on a canvas,
which by the table above is most of the frame. The close-zoom sub-lattice
stops being a DOM multiplication problem and becomes arithmetic. Reduced
motion becomes a real switch rather than a CSS block that misses half its
targets. The compositor stops holding thousands of animated boxes, which is
the half of the problem Safari actually complained about.

Given up, and the user has accepted this: keyboard navigation of the map and
screen-reader support for it. That acceptance is what makes this tractable,
because it removes the requirement that every cell be a focusable element
with a label.

What must be rebuilt rather than lost:

- **Hit testing** becomes arithmetic. A pointer position maps to a cell by
  division, which is cheaper and more direct than asking the document which
  element is under the cursor. The tooltip stays a DOM element positioned
  over the canvas, so hovering still reads the same.
- **Theming.** Cell colours come from CSS custom properties today. A canvas
  cannot read those per draw call; read them once into a palette object when
  the theme is established, and re-read on a theme change.
- **Text.** The map is glyphs, so the static layer is thousands of
  `fillText` calls unless they are prepared. Measure a plain `fillText` pass
  first; if it is too slow, draw the glyph set once into an offscreen atlas
  and blit from it, which is the standard answer and turns text into image
  copies.
- **Device pixel ratio.** Every canvas must be sized in device pixels and
  scaled, or the map will be soft on a retina screen, which is exactly the
  kind of regression that makes people reject a rewrite that was otherwise
  correct.

### The order to build it in

Each stage should be shippable and separately measurable, and the profile
should be re-read after each rather than at the end.

1. **The sky canvas first.** It is self-contained, purely decorative, has no
   hit testing and no state, so it proves the pattern on the easiest
   surface. It was expected to be the largest single cost and was not; what
   it removed was four thousand elements and their memory.
2. **The effects canvas next**, taking the water shimmer, the cloud shadows
   and the precipitation ripples off the map cells. This removes the
   per-cell overlay elements while the map itself stays a document, so it
   can be judged on its own. The measurements above make this the stage
   that carries the win: the shimmer alone is 86 percent of the
   recalculation, so this is where the frame is bought back.
3. **The static map canvas last**, because it carries the hit testing, the
   glyph drawing and the theming, and it is the stage that can regress the
   feel of the game. By the time it starts, the two cheaper stages will have
   established the palette, the pixel-ratio handling and the draw loop.

### How it stays honest

`tests/churn.test.ts` currently measures how often each panel rewrites
itself, and that test loses its subject as panels become canvases. Replace
it per layer with the same idea in the new terms: a budget on how many times
a layer redraws over a fixed number of frames, with the static layer's
budget being close to zero on a still minute. A static layer that redraws
every frame is the exact failure this architecture exists to prevent, and it
would otherwise be invisible.

The existing screenshot harness keeps working, since a canvas screenshots
like anything else, so the weather and map reference shots remain the check
that the picture did not change.

### Open questions to settle before stage three

- Whether the map's glyphs survive as text or become an atlas, which only a
  measurement can answer.
- What happens to the close-zoom marks and the wildlife glyphs, which today
  are positioned DOM overlays and are a natural fit for the effects layer.
- Whether the region borders belong to the static layer or want their own,
  given they change on discovery rather than on movement.

## A cheap pre-filter for the Do panel's search

**Raised** 2026-09-15, out of the performance work on the render surface.

The Do panel's filter box used to run a real pathfind for every candidate
row on every tick, measured at 6,634 ms a call against 0.03 ms when the box
was empty, which is twice the whole frame budget spent for ever while any
text sat in the box. That is fixed: the route is cached and the cheap
legality check runs fresh, so a row's reason is never stale. What remains
is about 25 to 30 ms a tick while text is held, which is a quarter of the
frame budget and is accepted rather than solved.

The route cache keeps a floored game-minute in its key, and that is
deliberate and evidenced: over a full game-day with position and knowledge
fixed, a row's distance never changes but its walking time drifts
continuously through the light term in `baseWalkSpeed`, by enough that
dropping the key would show a walk time wrong by a third all night. So the
misses are honest work, not a missing invalidation.

**Partially addressed** 2026-09-17. Exact concepts are filtered before route
construction. Free text now checks live searchable descriptions at exact
direct destinations, or at a valid cached destination, before building routed
options. The description includes progression text, details, refusals and
keywords, not only the name. Destination rules are shared with normal intent
resolution. Cold location-dependent rows remain candidates: excluding them by
the description at the player's feet would lose legitimate matches elsewhere.
Region survey labels are also conservatively retained because the panel rewrites
them. No whole-row or search-text cache can make live legality stale.

The regression starts with 95 routed rows for "torch" and now requires fewer
than 45, with no unrelated hide-coat route. Exhaustive-result comparisons and
existing route invalidation/live legality checks protect the search contract.
Further narrowing of cold location-dependent rows is deferred until measured
cost justifies a descriptor that can conservatively represent every destination.

## Cross-thread solved-world and fine-cache sharing

**Raised** 2026-09-17, after the Safari memory audit.

Lazy forecast loading and old-seed cache eviction are implemented. They avoid
allocating a forecast world merely to announce a seed and retaining replaced
runs. They do not eliminate the second solved world or the independent fine
caches once forecasts run. Main-thread terrain arrays are still used by rendering
and simulation; transferring their buffers to the worker would detach data still
in use and is not sharing.

Investigate immutable base-world sharing separately from mutable run overlays:

1. Measure retained main/worker solved arrays and fine chunks after first forecast,
   cancellation, reset and a long Safari session. Establish a memory budget.
2. Enumerate thread ownership and mutations. Keep forecast state and mutable
   ground overlays isolated; share only data proven immutable.
3. Verify the candidate shared-memory mechanism against the actual Pages preview
   deployment and Safari. Do not assume required browser/deployment capabilities.
   Preserve the current isolated-worker fallback and lazy startup behavior.
4. Prototype one immutable array boundary, test cancellation/seed replacement,
   then measure total retained memory and message costs before extending it to
   solved arrays or fine-cache entries.

Acceptance requires correct reset/cancellation, unchanged world results, verified
Safari/deployment compatibility and a measured memory reduction. This is not a
prerequisite for the current preview and is not a speculative transfer patch.

## Slow-suite reconciliation after map, weather and wildlife migrations

**Raised** 2026-09-17. Fast tests and Chromium playthrough passed, but the slow
integration suite reports failures. A baseline worktree at 98461be3 reproduced
16 selected UI/wildlife/delivery failures before the performance batch. That
establishes provenance, not harmlessness. Additional failures are not yet fully
baseline-classified. Do not disable files or relax assertions to claim green.

Simple cases addressed in this follow-up:

- Task enumeration keeps uniqueness and required-task assertions, without the
  obsolete fixed count of 49 after two tasks were added.
- Counted yard clearing gets its missing Building delegation gate. A real order
  now refuses below the rung and succeeds at it instead of throwing.
- Save round-trip expectations preserve Maps/typed arrays through an independent
  structured snapshot. These repair obsolete fixtures, not save behavior.
- Fire fixtures clear leftover laid fuel before testing carried-wood consumption.
  The drying test checks both 2 kg/h drying and 1 kg/h exposed-stack rewetting,
  including dry wood and wetted accounting, rather than mistaking the net rate
  for the drying rate. The whole fire file passes without simulation changes.

Remaining investigation groups, ordered by player risk:

- Delivery preemption and haul completion (`orders`, `ladder`): reproduce whether
  displaced carrying loses row ownership or marks work complete before delivery.
  Trace owner, carried load and completion credit across preemption/resumption.
- Shelter and fire (`body`, `fire`): distinguish stale synthetic-weather fixtures
  from incorrect cover adequacy, extinguishing or wet-wood drying. Use explicit
  observer position, local weather and protection transitions, not only regional
  settings. No balance constants should change just to satisfy an old expectation.
- Wildlife (`animal-agents`, `hunting`): separate old cell/axis-distance and
  region-boundary assumptions from actual visibility, alarm and hidden-ice leaks.
  Use metric positions and independently specified sight/movement contracts.
  The `animals` summer-refill case narrowly misses its 90% density band; diagnose
  the migration/calendar fixture before changing the ecological rate or band.
- Terrain presentation (`ui`, `siting`, `landing`): old per-patch assertions often
  run at the default 300m aggregate rung. Rewrite narrow tests at an explicit rung
  and keep separate 300m aggregate/canvas acceptance checks. Fixtures that cannot
  find their proposed night observer need controlled terrain rather than a new
  arbitrary seed or weaker assertion.
  `churn` also reports zero tooltip transitions in its pointer fixture. Reproduce
  that against controlled known cells, alongside the separate static-layer budget;
  do not infer from it that continuous redraw is acceptable.
- Task availability and seep waiting (`tasks`, `needs`): establish whether the
  fixture reaches usable water, then validate seasonal refusals and continuous
  trickle drinking at the resolved work destination.
  `water` also expects an iced-shore message in an old inventory presentation;
  check the current access/status boundary before altering UI or removing coverage.
- Routing/visibility budgets (`spatial-performance`): replace incidental generated
  terrain with controlled traversable neighbors; derive parent-touch budgets from
  the declared reach plus boundary cells. Do not merely raise failing limits.

Next pass should produce an exhaustive JSON failure inventory, run each affected
case at the pulled baseline and current head, and record root cause, production
contract and minimal regression. Commit each verified correction independently,
then run the complete slow suite on the settled head. The in-flight old-head
run is diagnostic evidence, not final validation of subsequent commits.
