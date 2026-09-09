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
