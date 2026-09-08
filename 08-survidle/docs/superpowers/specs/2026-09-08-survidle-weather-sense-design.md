# Survidle: reading the weather, and what to do when it turns

A storm gives one hour's warning and the only answer is to walk home. This
changes that. A survivor learns to read the sky, and a survivor caught out
looks for cover, improves what they find, and builds only when the ground
offers nothing.

## What the code does today, surveyed at 87cf39c

A storm rolls on a daily chance by season (`STORM_CHANCE`: winter 0.08,
spring and autumn 0.04, summer 0.02), starts 60 to 180 minutes later and
runs **6 to 19 hours**. While it blows, precipitation is heavy and felt
temperature drops 6 C. `stormComing` is true for exactly the hour before,
and that hour is the whole warning.

`stormStep` answers it one way: walk to camp, light the fire, feed it, rest.
With no camp it returns null and the survivor is told there is no shelter
within reach. Nothing else is possible: `light` sits behind `needCamp` and
`fireStep` needs the camp's `firePit`, so a drill in the pack is inert
anywhere but home; and the only shelter-shaped verb away from camp is
`makeCamp`, which moves the whole camp rather than raising anything
temporary.

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

An **emergency shelter**, raised anywhere from what is underfoot, with
protection that **rises continuously with the minutes put in** rather than
appearing when finished:

| Time in | Reaches |
|---|---|
| 30-60 min | 1, windbreak |
| 1-2 h | 2, weatherproof |
| several hours | 3, and now it is a lean-to |

The machinery for this already exists: `Site.build` keeps build progress in
minutes per structure. Today a part-built structure gives nothing until it
completes. An emergency shelter is the one thing that reads its own
progress, which is what makes it answer a storm at all - a survivor with 50
minutes gets a windbreak rather than nothing.

It rots in days and is not mended. It is not a camp.

**The numbers above are reasoned from the handbook shape the author
described, not read off a page.** Before this ships they want checking
against the Swedish handbook and Kochanski, the sources the rest of this
game's numbers come from. The standing rule is that a number comes from a
real source; these are honest placeholders for real ones.

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
of the permanent structures, and `haul`, `night` and `wait`, which are all
about home by definition.

The refusal wording changes with it, and improves: a survivor is told they
need a bark bucket, not that there is no camp here yet.

**What still makes a field fire different from a camp's** is that it is
nobody's home. It needs no fire pit. It burns only what is fed by hand,
since `autoFeed` reaches the camp's woodpile and this has only the pack. It
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
- **Storms survived.** A count on the life record - storms that blew while
  the survivor was alive, not merely rolled. The one route that cannot be
  ground; it needs weather to happen to you.
- **Reading the sky**, a task costing minutes that buys a forecast now,
  better the higher the skill, and givable as a standing order so a careful
  player checks each morning.
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

### 7. What kind of storm

One storm behaves one way today. Four kinds ask for different answers, and
carrying all four is what gives weather sense something to be sense *about*:
knowing a storm is coming matters less than knowing which one.

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
- **Lightning** - the terrain advice **inverts**. The ground that shelters
  you from rain is what kills you here: an isolated tall tree, a rock
  outcrop, a ridge, high open fell. The right answer is low ground, away
  from lone trees, and *not* the overhang you would run to in rain.

That inversion is the reason lightning earns its place rather than being
deferred. It is the one storm where a survivor who knows only "a storm is
coming" does the wrong thing by doing the obvious thing, and where a
survivor who read the sky properly goes somewhere else entirely. It turns
the forecast's second stage - what kind, how hard - from a convenience into
the difference between living and not.

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

### 8. The skills

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

### 9. When it compounds

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

## Gates

`stormStep` walks everyone home today, so giving the runner a real second
option will move the reference player. Expect movement in `reference` and
`year`, and read it rather than tuning it: a runner that digs in when it
should have walked is a policy bug, and one that walks when it should have
dug in is the same bug mirrored. A gate measures the sim; no constant moves
to restore a reading.

Seed 1 is the case to watch. It regressed from day 29 to day 4 on the
camp-siting work because the reference player ranges too far on known
ground. A storm answer that lets it stay out may fix that or make it much
worse, and it will say so first.

## Open questions for the author

Taken one at a time, in this order:

1. The emergency shelter's minutes per protection level, against the
   handbooks (section 4).
2. Whether a survivor caught by lightning on the wrong ground should be
   able to die of it, or only ever be driven off that ground (section 7).
