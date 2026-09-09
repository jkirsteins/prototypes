# Survidle: reading the weather, and what to do when it turns

A storm gives one hour's warning and the only answer is to walk home. This
changes that. A survivor learns to read the sky, and a survivor caught out
looks for cover, improves what they find, and builds only when the ground
offers nothing.

## What the code does today, resurveyed at 252a2ea1

A storm rolls on a daily chance by season (`STORM_CHANCE`: winter 0.08,
spring and autumn 0.04, summer 0.02), starts 60 to 180 minutes later and
runs **6 to 19 hours**. While it blows, precipitation is heavy and felt
temperature drops 6 C. `stormComing` is true for exactly the hour before,
and that hour is the whole warning.

The storm is now a body need on the region's one ordered list. When that row
wins the minute, `stormStep` still answers it one way: walk to camp, clear the
fire site if needed, light the fire, feed it, rest. With no camp it returns
null and the body row says there is no shelter within reach. Nothing else is
possible: `light` still sits behind `needCamp` and `fireStep` still needs the
camp's fire site, so a drill in the pack is inert anywhere but home; and the
only shelter-shaped verb away from camp is `makeCamp`, which moves the whole
camp rather than raising anything temporary.

The ordered list matters. The body no longer owns a hidden priority tier: the
player may rank work above or below it, and a click lands above it. Weather
response must therefore remain a service of the body row, not a second
scheduler that silently overrides the list. A survivor who ranks the body low
has chosen to work through its warning, subject to the existing collapse floor.

### The measurements that shape this work

**Inside your own region, an hour is plenty.** Every spot is 4 to 28
minutes from camp. Lengthening the warning changes nothing here.

**From a neighbouring region, it is not.** Home is 48 to 110 minutes away
(seeds 17, 19, 42, measured from the neighbour's forest to the home camp).
Against a 60-minute warning: at best you just make it, typically you walk
the last 30 to 50 minutes inside the storm, at worst you are an hour into
it before you arrive. **This is the case the whole spec exists for.**

**A storm is decided by fuel, and fuel by a roof**, because heavy rain on an
unroofed fire doubles its burn:

| | 6 h storm | 19 h storm |
|---|---|---|
| No roof | 36 kg | 114 kg |
| Lean-to | 18 kg | 57 kg |
| Turf hut | 7 kg | 23 kg |
| Cabin | 5 kg | 15 kg |

At -10 C unroofed for 19 hours: 171 kg, against a fire that holds 36 kg at
once. Splitting is 15 minutes a log for 20 kg, so an hour of splitting is 80
kg - but felling is 55 minutes for four logs and no burnable wood, and
deadwood without an axe is 10 kg an hour. **No warning length lets a
survivor build a roof and lay in 60 kg from nothing.**

**The ground is not uniform.** Over 1800 cells across three seeds and nine
regions: spruce 31.5%, pine 26.9%, meadow 26.7%, rock 9.3%, water 5.6%. So
roughly two cells in five offer reliable natural cover, one in four offers
none, and one in four is marginal. Being caught on the wrong ground is a
real risk without being a common death.

### What moved on main underneath this design

The design still answers the same measured hole, but its integration points
have changed:

- The Do pane is split by subtab and purpose. Every new row needs a home in
  `ui/purpose.ts`, search vocabulary in `ui/dopanel.ts`, and the existing
  coverage tests must prove it is neither homeless nor duplicated.
- Work, the body and the camp share one ranked order list. Shelter-in-place is
  a sequence of ordinary task steps owned by the body care row. It does not
  enqueue private work, jump the list, or create another runner.
- Goals advance from contextual simulation events, not state scans. The old
  deeds become the small end of that event vocabulary: successful lighting,
  completed work, protection changes, forecast changes and storm endings all
  carry where, when and under what weather they happened. This feature adds
  three ordered teaching chapters and a world-scoped weather opportunity for
  each chapter that needs one. The goal system may claim a normal event, but
  it does not become a second weather generator.
- Tools are active gear and carried load is explicit. A field task uses the
  normal provisioning and `toolNear` / `takeUp` paths. It must not invent a
  second notion of a drill or vessel being available.
- The sky is now the weather widget. Forecast detail belongs in
  `weatherHtml` and the sky presentation, while cell protection belongs in the
  map tooltip. The removed region panel is not brought back.
- A life already records survived storms as `LifeEvent { kind: "storm" }`.
  Weather sense counts those events instead of adding a second counter that
  can drift from the record.

## Decisions taken by the author

- **Foresight buys the choice to stay out**, not more minutes of the same
  errand. A warning becomes a decision: run for it, or dig in here.
- **Looking comes before building.** Finding natural cover is the primary
  answer and costs minutes; building from scratch is the fallback for
  ground that offers nothing.
- **Terrain decides whether there is anything to find; skill decides how
  good it is and how fast it is found.** A novice on rock finds a poor
  overhang slowly, an expert finds a good one quickly, and neither finds
  anything on a meadow.
- **An emergency shelter is not a small permanent one.** The useful
  distinction is weatherproof enough to survive the event against good
  enough to live in. Protection rises with the minutes put in rather than
  arriving all at once.
- **Shelter is a family of skills, not one.** In an idle game the
  progression is part of the reward, and genuinely different techniques
  deserve their own levels, speeds and ceilings. Not fragmented to the
  point of a skill per part of a lean-to.
- **Every route to weather sense is wanted**: a skill that levels with use,
  storms actually survived, a deliberate act of reading the sky, and a
  quirk landed with. They stack.
- **Guarantee the opportunity, not the outcome.** A teaching goal may ensure
  that meaningful weather arrives, but it never awards a failed search,
  protects the survivor, changes the task order, or calls survival a success.
- **Goals teach through consequential activity.** Reading the sky only counts
  when it reveals something the survivor did not know. Finding shelter only
  counts when useful cover is actually found. A missed opportunity stays
  missed, says why, and another comes later without rewinding the chapter.
- **Being caught out kills only when it compounds.** A storm alone is a hard
  night; wet, cold, hungry and stormbound together should end a run.

## The design

### 1. Shelter has one currency: protection

Everything below - found cover, improved cover, an emergency build, and the
existing lean-to, turf hut and cabin - produces the same thing, a
**protection level**:

| Level | Word | Means |
|---|---|---|
| 0 | none | open ground |
| 1 | windbreak | takes the wind off; some rain still gets in |
| 2 | weatherproof | survives the event: rain off, fire keeps, wetness held |
| 3 | liveable | good enough to live in - the existing built shelters |

Level 2 is the bar that matters. It is what halves the storm's fuel burn
(the existing `roofed` test), what stops wind driving wetness, and what the
whole spec is about reaching before the storm lands. Level 3 is what a camp
already builds and is unchanged.

Level 1 is not a failed level 2. In rain it removes the storm wind's extra
wetting but does not stop the rain itself; level 2 keeps the rain off. In snow
a windbreak is the effective weather answer, and in a gale it contributes
through lee and low profile. The progression is therefore partial rather than
a binary race to 2, without adding another protection currency.

Reusing one currency means `roofed`, `shelterBonus` and `sheltered` keep
working: they read the protection at the survivor's cell, whatever produced
it. After the camp-siting work those already read the site under the feet
rather than the camp, so this is a widening rather than a rewrite.

### 2. Find shelter

A task, available on any passable land cell, costing minutes rather than
hours. It searches the ground and reports what is there.

**Terrain sets the ceiling** - whether anything exists at all:

| Terrain | Ceiling | What it is |
|---|---|---|
| rock | 2 | overhang, boulder lee, root plate |
| spruce | 2 | dense canopy, tree well, low branches |
| pine, birch | 1 | thinner canopy; wind off, rain through |
| meadow, bog, fell | 0 | nothing; open ground |

The list is FM 21-76's own: caves and rocky crevices, clumps of bushes,
small depressions, large rocks on the leeward side of hills, large trees
with low-hanging limbs, and fallen trees with thick branches. Every entry
above is one of those read onto terrain this world already generates.

**A tension worth keeping rather than resolving.** The same guidance warns
off low ground - ravines, narrow valleys, creek beds - because cold air
collects there at night, and warns to check overhead for loose rock and
dead limbs. But low ground is exactly where a survivor should be in a
lightning storm, and an overhang is exactly what a gale can drop something
onto. So the best ground genuinely depends on which storm is coming, and a
survivor who knows only "a storm" cannot pick correctly. That is the
argument for the forecast's second stage, made by the sources rather than
by us.

**Skill sets what you actually get and how long it takes.** A high
natural-shelter level finds the ceiling quickly; a low one finds less than
the ground holds, or takes longer, or both. The ceiling is never exceeded -
no level of skill conjures an overhang on a meadow.

The result binds to that cell for a short while and is not a structure: no
materials, nothing to maintain, and it never becomes a camp.

### 3. Improve what you found

Found cover can be worked on. Labour raises its protection by one level
above the terrain ceiling - piling boughs against an overhang, walling the
lee side of a spruce, cutting drainage. So rock and spruce reach 3 with
effort, pine and birch reach 2, and open ground still reaches nothing
without a build.

This is the step that makes searching worth doing even when a build is
possible: improving found cover is always cheaper than starting from
nothing, which is exactly the real ordering.

### 4. Build when the ground gives nothing

An **emergency shelter**, raised anywhere from what is underfoot, whose
protection **rises continuously with the minutes put in** rather than
appearing when finished.

**Sourced ranges.** Field guidance does not give build-time constants, and
should not be pretended to. What it gives is ranges, and they are wide
because materials and experience dominate:

- A lean-to of natural materials gives "a windbreak and a roof in under an
  hour"; with a tarp or poncho it is minutes.
- A debris hut runs from about 1.5 hours to half a day, with 2-4 hours
  usual for a first-time builder and about 3 hours for one practised person
  in wooded ground. A simple debris shelter can be had in about an hour.
- FM 21-76 declines to give times at all, and frames shelter choice as a
  trade between time and effort, tools, materials, and the protection
  actually needed - which is precisely the choice this section models.

**Design values, chosen inside those ranges** against the 60-minute warning
so the decision has teeth:

| Protection | Minutes | Sits inside |
|---|---|---|
| 1, windbreak | 30 | "under an hour" for a natural lean-to |
| 2, weatherproof | 90 | the 1-1.5 h low end of the debris-hut range |
| 3, liveable | 240 | the 2-4 h usual, and the existing lean-to's own cost |

These are **design values selected within sourced field ranges**, not
measurements. That distinction should stay in the code comment beside them.

Two things fall out that are worth keeping. At 90 minutes, a survivor with
the standard hour's warning **cannot** reach weatherproof from nothing - so
the plain warning is not enough, and reading the sky is what buys the
margin. And at 240 minutes the emergency build lands exactly on the
existing `STRUCTURES.leanTo.minutes`, so the curve joins the structure table
rather than running beside it: at the top it gives the protection a lean-to
gives for the same labour. It remains temporary rather than changing identity
into a permanent structure.

The machinery already exists. A site already keeps partial permanent builds;
the emergency shelter follows that pattern but keeps its minutes in a separate
site field. It is not a `StructureId`, because putting it in that union would
leak it into permanent build, capability and mending tables. It pays out from
its own progress, which is what lets 50 minutes buy a windbreak instead of
nothing.

It rots in days, is not mended, and is not a camp.

### 5. A fire where you stand

`light` stops being camp-only. With a drill, tinder and a kilo of dry wood a
survivor lights a fire on any passable land cell.

**The rule is that a fire's capabilities follow the fire and the equipment
present, not whether the map calls the place a camp.** A fire hot enough to
boil a pot is hot enough to put meat on a stick beside it, and a rule that
says otherwise is one players eventually notice and rightly resent. What a
camp gives is not a hotter fire; it is **infrastructure**.

So the gate on this whole class of work changes from *where you are* to
*what you have with you*:

| Field fire, with the gear | Camp, because of what stands there |
|---|---|
| cook carried or raw food | batch cooking |
| boil water, carrying a vessel | large quantities of water, the trough |
| melt snow, thaw ice | the rack: hanging meat to dry |
| roast directly, no cookware | smoking and preservation |
| dry yourself and small carried items | processing a carcass beside storage and tools |
| warm | a fire indoors, under a hut or cabin roof |

Concretely, of the tasks behind `needCamp` today, these move to an
equipment gate and become possible anywhere with a fire: `cook` (every
food), `crack`, `grindBark`, `melt`, `thaw`. These stay with the camp
because they need something that stands there: `hang` (the drying rack),
`lightIndoors` (a hut or cabin roof), `mend` (a structure to mend), `build`
of the permanent structures, and `haul` and `night`, which are about home by
definition.

The refusal wording changes with it, and improves: a survivor is told they
need a bark bucket, not that there is no camp here yet.

**What still makes a field fire different from a camp's** is that it is
nobody's home. It needs no fire pit. It burns only what is fed by hand,
since the camp care path reaches the camp's woodpile and this has only the pack. It
dies when the survivor leaves the cell, keeping no embers and no
`litSince`, so it credits none of the fire-keeping goals, which measure a
hearth kept. An improvised fire may also cost more time and fuel for the
same work than a camp's does. One camp fire per region stays true.

**A consequence worth naming.** This softens the camp-siting work's
`no camp here yet` guard considerably, and for the better: a survivor who
has landed and not yet chosen where to live can make a fire, cook, and melt
snow. Today they cannot, which is a strange thing to tell someone standing
on a beach with an axe and a drill. The guard remains for the things that
genuinely need a home.

### 6. Reading the weather

Four routes, stacking:

- **A weather sense skill**, levelling with use.
- **Storms survived.** The existing storm events on the life record - storms
  that blew while the survivor was alive, not merely rolled. The one route
  that cannot be ground; it needs weather to happen to you.
- **Reading the sky**, a task costing minutes that buys a forecast now,
  better the higher the skill, and givable as a daily order on the shared
  list so a careful player checks each morning. The observation is
  per-survivor and expires at the next dawn; it is not a permanent change to
  the weather.
- **A weather eye**, a sixth quirk beside `coastBorn`, `forestBorn`,
  `sleepsLight`, `bigEater` and `steadyByTheFire`, granting a free step.

**What the warning says grows in three stages**, so skill changes the kind
of information rather than only the number of minutes:

1. **That it is coming** - today's hour, from nothing.
2. **When, and how hard** - enough to judge whether the woodpile will do.
3. **How long** - the difference between a 6-hour blow and a 19-hour one is
   20 kg against 100, and knowing it turns weather into a plan.

The minutes per stage should come from what the fuel and distance tables
make meaningful - notably that 60 minutes does not cover the 48 to 110
minute walk from a neighbouring region, so stage 2 or 3 should.

The forecast is shown in the weather wall that already owns the sky and storm
status. Stage 1 names only the warning, stage 2 adds arrival and kind/severity,
and stage 3 adds duration. The body uses the same forecast value the wall
shows, so the interface and the decision cannot disagree.

### 7. Goals teach the weather loop

The existing ladder is useful because it names concrete outcomes, but this
feature needs more than adding `findShelter` and `readSky` to its deed list.
Neither button is meaningful by itself. A search that finds nothing has not
taught shelter, and an observation that reveals nothing has not taught
forecasting.

The rule is:

> **Guarantee the opportunity, not the outcome.**

Goals remain deterministic in their order and in whether the simulation gives
the player a fair chance to attempt them. Completion still depends on what
actually happens in the simulation. The goal system never changes protection,
reduces damage, forces a task, moves the survivor, or completes a goal because
an attempt was reasonable.

#### The three chapters

The ten new goals form three ordered chapters inside the existing ladder. A
chapter step must be active before its teaching opportunity can credit it;
weather experienced months early does not silently complete a lesson the game
has not introduced. Ordinary non-teaching goals retain their current rule that
an outcome reached early still counts.

**Chapter 1: shelter is useful.** This joins the ordered opening after the
immediate camp, firewood, fire and cooking goals, while the survivor is still
in the first-week guidance.

1. **Find useful cover.** Complete only when a search actually discovers
   protection 1 or better. Finding nothing leaves the goal open.
2. **Turn the ground into shelter.** Reach protection 2 anywhere in the same
   local teaching area, defined as the original find's region and within 1 km
   of it. The player may improve the first find, find a better cell 200 m away,
   build an emergency shelter, or use another valid route. The goal teaches
   the outcome, not loyalty to the first shrub inspected.
3. **Put it to the test.** Reserve a mild rain storm, for which protection 2
   is the intended answer. Complete when that storm ends with the survivor
   alive after accumulating at least 60 storm minutes at protection 2 or
   better inside the teaching area. A different shelter in the area counts.
   A windbreak does not, because this opportunity deliberately chooses rain
   that requires a roof rather than pretending every weather kind has the same
   threshold.

After Chapter 1, the existing ordered opening resumes with keeping the fire
overnight and getting off the cold ground.

**Chapter 2: weather can be anticipated.** This opens once Chapter 1,
`keptNight` and `bed` are complete, but no earlier than day 8, so it sits in
the weeks 2-4 camp-systems phase. If the player reaches the date first, the
ordinary eligible camp goals remain visible rather than leaving an empty
panel.

4. **Read approaching weather.** The opportunity first exposes an honest,
   vague sign that conditions are changing. `readSky` completes the goal only
   if it raises forecast knowledge for the reserved storm and reveals at least
   one fact that was previously unknown.
5. **Prepare for what is coming.** At storm onset, record a pre-storm snapshot
   of what was established before the weather began: known forecast facts,
   routes and travel times to camp and known refuges, local protection, fire,
   fuel, carried gear and supplies. Complete if that snapshot contains at
   least one viable plan for this particular storm. Walking to a reachable
   camp, sheltering locally, or travelling to a prepared refuge can all count.
   Work done after the storm starts cannot retroactively make the preparation
   goal true.
6. **Come through the forecast storm.** Complete when the same storm ends and
   the survivor who read it is alive. Death, or surviving some unrelated
   storm, does not count.

**Chapter 3: anticipation enables independence from camp.** This opens after
Chapter 2, but no earlier than day 31, among the open-ended months 2-4 prompts.
Existing camp goals remain available beside it at the ladder's established
width.

7. **Prepare a refuge beyond home.** Reach protection 2 in a region other than
   the survivor's camp region. Found, improved, emergency and permanent
   shelter all count.
8. **Light a fire away from camp.** Complete on a successful fire light at a
   non-camp cell. Failed tinder and a camp hearth do not count.
9. **Make a meal away from camp.** Complete when food is actually cooked at a
   field fire. Starting the task, carrying raw food through the cell, or
   cooking at camp does not count.
10. **Ride out weather beyond home.** Once the refuge exists, reserve an
    eligible non-lightning storm with enough lead time to choose whether to
    travel to it. Complete when the storm ends with the survivor alive, at
    least 60 minutes were spent under adequate protection in the refuge's
    region, and no storm minute was spent at camp. Going home may be the wise
    survival choice, but it does not demonstrate this lesson; the goal remains
    open and another opportunity comes later.

The existing seasonal goals remain the broad later ambitions. The whole
progression therefore reads: shelter is useful, weather can be anticipated,
and anticipation makes life away from camp possible.

#### Opportunity state and weather ownership

Only one weather-backed teaching step can be active at a time, so `GoalState`
needs one world-scoped opportunity rather than a parallel scheduler:

```ts
interface GoalOpportunity {
  goal: GoalId;
  status: "reserved" | "announced" | "running" | "resolved";
  createdAt: number;
  attempts: number;
  stormId: number | null;
  source: "natural" | "synthetic" | null;
  area: { region: number; centre: number; radiusKm: 1 } | null;
  announcedAt: number | null;
  resolvedAt: number | null;
}
```

`reserved` means an event exists in the simulation but the survivor cannot yet
know it. `announced` begins at the first vague sign or forecast stage the
survivor can perceive. `running` begins at the storm's `from` minute.
`resolved` records either completion or a missed attempt before cooldown.
`createdAt` makes expiry and cooldown inspectable; `attempts` survives retries
so a goal that repeatedly offers unusable opportunities is visible in saves
and diagnostics.

The ordinary weather generator always gets first refusal. Once a weather goal
needs an opportunity, each naturally scheduled event is checked against that
goal's kind, danger and lead-time constraints. The first valid event is
claimed by assigning it a stable `stormId`; its timing and rolled properties
are not changed. If no valid natural event has appeared by the third dawn
after `createdAt`, the normal generator is called once to create an event from
the same distributions, constrained only by the goal's eligibility rules and
lead time. It is tagged `source: "synthetic"` for tests and diagnostics but is
presented exactly like natural weather.

The Chapter 1 event is rain, above freezing, and in the shortest third of the
normal duration range. Chapter 2 accepts the next non-lightning storm that a
sky reading at the survivor's current weather-sense level can reveal before
the ordinary one-hour warning. Chapter 3 accepts the next non-lightning storm
whose lead time is at least the current travel time to the refuge plus 30
minutes. If a storm is already reserved or running, the opportunity waits; it
does not replace, overlap or reroll that storm.

This is an event claim layered over weather, not a second weather director.
There is no convenient rain when the survivor reaches a hut, and there is no
storm spawned because the survivor happens to stand in the goal area. In
particular, Chapter 3 reserves its storm when the refuge is ready and gives the
survivor time to choose whether to use it.

No teaching event may be materially more dangerous than a comparable natural
event available at that point in progression. Synthesis increases the chance
of exposure, so it does not also increase severity, duration, cold, strike
risk or effect multipliers. Lightning is never eligible.

#### Failure, death and retries

A missed opportunity resolves the attempt, not the chapter. The goal remains
open and says what happened in simulation terms, for example: "The storm
passed before {you} prepared a refuge. Another opportunity will come." After
one full day without another active storm, it returns to `reserved`, increments
`attempts`, refreshes `createdAt`, and again prefers natural weather for three
dawns before synthesis.

Death is the same kind of miss. Goals and opportunities belong to the world,
not one life. The dead survivor receives no completion; after an heir lands
and the one-day cooldown has passed, the open goal can reserve another event.
The chapter never restarts and completed earlier steps stay complete.

#### General events, not goal-only deeds

The goal seam widens from narrow deeds to reusable contextual simulation
events. At minimum it needs:

```ts
type GoalEvent =
  | { kind: "protectionChanged"; minute: number; region: number; cell: number;
      from: Protection; to: Protection; source: "found" | "improved" | "emergency" | "structure" }
  | { kind: "forecastChanged"; minute: number; stormId: number;
      before: ForecastKnowledge; after: ForecastKnowledge; source: "passive" | "readSky" }
  | { kind: "fireLit"; minute: number; region: number; cell: number; atCamp: boolean }
  | { kind: "taskCompleted"; minute: number; id: TaskId; arg?: string;
      region: number; cell: number; atCamp: boolean }
  | { kind: "stormStarted"; minute: number; stormId: number; plan: StormPlanSnapshot }
  | { kind: "stormEnded"; minute: number; stormId: number; survivorAlive: boolean;
      minutesByProtection: [number, number, number, number];
      atCampMinutes: number; awayFromCampMinutes: number; maxWetness: number };
```

Existing gathered, built, kept-fire, stored and season deeds remain small
events in the same union. The names above describe simulation facts useful to
future goals; there is no `stormWeathered` or `chapterOneShelterFound` event.
Goal interpretation decides whether a fact satisfies a currently active
lesson. Every event that refers to weather carries the stable `stormId`, so a
later event cannot be credited to the wrong opportunity.

`StormPlanSnapshot` is produced by the same option evaluator used by the
body's return-home versus shelter-in-place decision. It records inputs and the
viable options before the storm, rather than a goal-specific Boolean. This
keeps the goal, the AI and the weather wall from inventing three definitions
of "prepared".

#### Introduction and review

Every goal definition gains explanatory copy. The first time a goal becomes
active, its introduction is queued once in `GoalState.introduced` and shown in
the existing teaching overlay shape. The row remains a button after dismissal;
clicking it opens the same copy for review without changing progress or
pausing the simulation beyond the overlay's normal behavior. An heir does not
receive the automatic introduction again, because the goals and their teaching
history belong to the world, but the row remains reviewable.

The introduction explains why the outcome matters, the facts the survivor can
reason from, and several valid approaches where they exist. It does not name a
hidden recipe chain or command a meaningless click. Opportunity failures use
the same overlay queue but are notices, not completions.

### 8. What kind of storm

One storm behaves one way today. Rain, snow and gale already ask for different
answers and give weather sense something to be sense *about*: knowing a storm
is coming matters less than knowing which one. Lightning sharpens that
distinction further, but is separable as an optional final stage.

- **Rain and cold wind** - the common case. A roof and a fed fire. Cover
  overhead is what counts.
- **Snow** - colder, but the precipitation itself is less of an enemy: a
  windbreak serves where a roof would be needed in rain, and drifted snow
  becomes cover in its own right. The weather model already knows snow from
  rain (`ambient <= 0`).
- **Gale** - wind is the danger, not water. What matters is the **lee** and
  a **low profile**. A tall frame shelter in a gale is worse than a scrape
  behind a boulder: it catches wind, and it can come down. So a gale reads
  a shelter's profile as well as its protection, and terrain lee - rock,
  dense spruce, a depression - counts for more than a roof.
- **Lightning** - the terrain advice **inverts**, and it can kill. The
  ground that shelters you from rain is what kills you here: an isolated
  tall tree, a rock outcrop, a ridge, high open fell. The right answer is
  low ground, away from lone trees, and *not* the overhang you would run to
  in rain.

  The inversion is not invented. US National Weather Service casualty data
  for 2006-2011 puts the commonest places to die of lightning as **under or
  near trees (25%)** and **open ground (25%)**, with water third at 23% -
  so a survivor who runs to the biggest spruce is running to the single
  worst place there is, and one who stands out on open fell is no better
  off. Both are exactly what this world's terrain offers.

  **Lightning is a summer storm.** Over 70% of US lightning deaths fall in
  June, July and August. That is worth honouring for its own sake and it
  also does the balance a favour: summer currently carries the *lowest*
  storm chance in the game (0.02, against winter's 0.08), so it has little
  weather of its own. Lightning gives summer a danger that winter does not
  have, which is a better shape than every season being dangerous the same
  way.

That inversion is the reason lightning earns a separate optional stage. It is
the one storm where a survivor who knows only "a storm is coming" does the
wrong thing by doing the obvious thing, and where a survivor who read the sky
properly goes somewhere else entirely. It turns the forecast's second stage -
what kind, how hard - from a convenience into the difference between living
and not. Stages 1-3 remain complete without an instant-death hazard.

**What each kind reads:**

| Kind | Danger | What answers it | What is now wrong |
|---|---|---|---|
| Rain | wet, fuel burn | cover overhead, level 2 | open ground |
| Snow | cold | windbreak, drifted cover | nothing much |
| Gale | wind, falling timber | lee and low profile | tall frame shelters, exposed ground |
| Lightning | strike | low ground, no lone trees | overhangs, ridges, isolated tall trees |

A shelter therefore carries a **profile** (low or high) beside its
protection level, and a cell carries whether it is **lee** and whether it is
**exposed high ground**. Both are readable off terrain the world already
generates: rock and fell are high and exposed, a depression or dense spruce
is lee, a frame shelter is high profile and a found scrape or cave is low.

**A strike can kill.** Sitting a lightning storm out on struck ground - under
a lone tall tree, on a ridge, on open fell - carries a small chance per hour
exposed. This is the one place the spec adds a death the game does not have,
and it is deliberate: without it, lightning is a suggestion, and the second
stage of the forecast is a convenience rather than the thing that saves a
run.

**How the odds get set.** There is no honest per-hour figure to read off a
page: real strike statistics describe a modern sheltered population and say
nothing about a person deliberately standing under a spruce for six hours.
So the number is **calibrated to a stated target rather than sourced**, and
the target is the design decision: a survivor who repeatedly sits lightning
storms out on bad ground should die of it eventually; a survivor who reads
the sky and moves should essentially never. Record it as a design value with
that target written beside it, the same way the shelter minutes are
recorded, and check it against the seeds rather than asserting it.

The death wants its own cause in `causeFrom` and its own epitaph line. It is
the one death in this game that is instant rather than the end of a slide,
and the record should say so.

### 9. The skills

Skills here are **categories of technique, not of material**. A snow cave
dug into a drift is not a different skill from a rock overhang - both are
reading the land for cover that already exists. Piling snow into a quinzhee
is not a different skill from raising a lean-to - both are building a
structure out of what is to hand. Naming a skill after snow would prescribe
the material and split one competence in two.

So the categories are what the survivor *does*:

- **Natural shelter** - finding cover the land already gives, judging a
  site, and improving what is found. Overhang, tree well, root plate,
  drifted snow, the lee of a boulder, a depression out of the wind. Covers
  the author's "natural shelter finding" and "rock/overhang improvement",
  and takes snow caves too. This is also where **choosing where to sit a
  storm out** lives, which is what a gale and a lightning storm are really
  asking of the survivor.
- **Shelter building** - raising a structure from materials: frame and
  covering, debris piled on, a windbreak, a heaped and hollowed quinzhee.
  Covers "lean-to", "debris shelter", "windbreak" and the built half of
  snow work. Material-agnostic; terrain and season decide what is available
  to build with, not which skill is used.
- **Weather sense** - reading what is coming, and which kind (section 6).

Permanent work - the turf hut, the cabin - stays in the existing `building`
skill, where it already is and already levels.

That is **three new skills**, taking the ladder from seven to ten.

**The cost, stated plainly.** The idle curve spec assigns jobs, grinds and
keeps per skill, and `MASTERY_KEYS` gives each its own action pool. Three
new skills is three new sets of those, and it widens every panel listing
skills, the heir carry (`CARRY_SHARE`) and the rung moments. It is the
largest single change here and it is deliberate: the progression is part of
the reward, and distinct levels make distinct survivors. One strong in
natural shelter searches first and rides out storms where they stand; one
strong in shelter building carries an axe and raises what they need. Those
are different players, which is the point.

### 10. When it compounds

The stack is already modelled and should be used rather than replaced.
Wetness costs 0.15 C of felt temperature per point, starvation up to 4 C, a
storm 6 C; warmth under 20 drains health at 6 an hour and `causeFrom`
already names cold as a death. A soaked, starving survivor stormbound in the
open is therefore already in trouble.

The one addition: **wind drives wetness faster on a body with no protection
over it.** That makes the gap between level 0 and level 2 a matter of how
fast you get soaked, not only how much wood you burn - and it makes being
caught out dangerous through the existing stack rather than through a new
rule. No new death cause, no storm-specific health drain.

## Not in scope

- Lengthening the plain hour as a fix on its own; the measurements say it is
  not the constraint.
- Any change to the camp's own fire, its embers, its keeping goals, or one
  camp per region.
- Weather beyond storms: the seasonal model, precipitation and ice.
- Falling timber as a hazard in its own right. A gale reads a shelter's
  profile, but trees coming down on a survivor is a hazard model this game
  does not have and should not gain here.
- Anything that lets a found or emergency shelter drift into being a camp.
- A second weather scheduler or any weather response that bypasses the ranked
  body row.
- Replacing the existing goal ladder wholesale. The three weather chapters are
  inserted into its phase progression; existing survival, camp and seasonal
  goals remain.
- Goal-created lightning, harsher teaching storms, forced task ordering, free
  protection, or any other tutorial-only survival advantage or penalty.

## Testing

- Find shelter returns nothing on meadow at any skill, and something on rock
  and spruce at every skill; what it returns rises with the level and the
  time falls.
- Improving found cover raises it one level above the terrain ceiling, and
  no further.
- An emergency shelter gives protection proportional to minutes in: a
  survivor who stops at 50 minutes has a windbreak, not nothing.
- Protection at level 2 halves the storm burn and is read by `roofed`,
  `shelterBonus` and `sheltered` wherever it stands.
- A fire lights on open ground with a drill and dry wood and no fire pit;
  it dies on leaving, keeps no embers, credits no fire-keeping goal.
- Cooking, cracking, bark-grinding, melting and thawing all work at a field
  fire when the survivor carries the gear, and are refused for want of the
  gear rather than for want of a camp.
- Hanging meat, lighting a fire indoors and mending still need the camp,
  and say so.
- A survivor who has landed and sited no camp can still light a fire, cook
  and melt snow.
- The warning lengthens with the skill, with storms survived, and with the
  quirk, and the three stack without any one skipping a stage.
- A soaked, starving survivor caught in the open dies; the same survivor
  under level 2 cover with a fed fire lives.
- A survivor with camp 10 minutes away still walks home - the fork must not
  make digging in the default when home is close.
- A survivor caught in a neighbouring region, 90 minutes out, survives by
  finding and improving cover, which is the case this spec exists for.
- A gale reads profile: the same protection level in a high frame shelter
  serves worse than in a low found one, and lee ground beats a roof.
- Lightning inverts the ground: the overhang and the ridge that answer rain
  are the wrong answer here, and a survivor who knows only that a storm is
  coming goes to the wrong place.
- A forecast that names the kind lets a survivor pick ground the plain
  warning would not have sent them to.
- A failed shelter search does not complete "Find useful cover"; a successful
  find at protection 1 does. Protection 2 anywhere within 1 km in the same
  region completes the next goal, even when it is not the first-found cell.
- A Chapter 1 opportunity claims the first eligible natural mild rain inside
  its three-dawn window, synthesizes one only after that window, and never
  accepts lightning or a stronger-than-natural event.
- `readSky` with no new forecast fact does not complete a goal. Reading an
  announced opportunity and increasing its forecast knowledge does.
- The preparation snapshot is taken before storm onset and accepts each viable
  strategy the shared storm-option evaluator finds. Work begun after onset
  cannot alter that snapshot or earn preparation credit.
- Every weather completion matches the opportunity's stable storm ID. An
  unrelated storm cannot finish the goal.
- A missed storm produces a failure notice, leaves earlier chapter steps done,
  waits a full storm-free day, increments `attempts`, and offers another
  natural-first opportunity. Death follows the same rule after an heir lands.
- The remote-refuge storm is reserved when the refuge exists, not when the
  survivor stands there, and its lead time covers travel plus 30 minutes.
- A goal introduction opens exactly once per world and every active goal row
  remains clickable to review it. Review changes no goal or opportunity state.
- Every new action has exactly one Do-pane purpose, complete search vocabulary,
  skill/mastery/gerund coverage, and the intended orderability.
- A body row ranked below work does not pre-empt that work for a forecast; when
  it wins, all shelter-in-place substeps remain owned by that same care row.
- A field light and field cook credit the existing fire and cook goals. The
  contextual versions of those events also credit the new away-from-camp
  goals only at non-camp cells. The first transition to protection 2 credits
  the roof outcome. No field fire credits overnight, three-day or rain-keeping
  goals.

## Gates

`stormStep` walks everyone home today when the body row wins, so giving that
row a real second option will move the reference player. Expect movement in
`reference` and `year`, and read it rather than tuning it: a body row that digs
in when it should have walked is a policy bug, and one that walks when it
should have dug in is the same bug mirrored. A gate measures the sim; no
constant moves to restore a reading. The gate setup must state where the body
row is ranked, because that is now part of the player's policy.

Seed 1 is the case to watch. It regressed from day 29 to day 4 on the
camp-siting work because the reference player ranges too far on known
ground. A storm answer that lets it stay out may fix that or make it much
worse, and it will say so first.

## Decisions still needed during execution

Two values remain deliberately unset: how many days a found cover observation
lasts, and how many days an emergency shelter lasts. Neither follows from the
current tables, so the executor asks rather than borrowing a permanent
structure's lifetime.

The teaching constants are settled: a local opportunity has a 1 km radius;
weather waits three dawns for a natural event before synthesis; a missed
attempt cools down for one full storm-free day; and each shelter test requires
60 storm minutes. These are pacing values, not claims from the field sources,
and the comments beside them must say so.

The earlier author questions are settled: 30 / 90 / 240 are design values
inside sourced ranges, and a lightning strike on bad ground may kill. Lightning
itself remains an optional fourth stage and must not hold stages 1-3 back.
