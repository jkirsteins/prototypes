# Survidle: the survival edge, a roadmap

Survidle should be as hard as the north is. Being away must be riskier than
playing by hand, never safer: the intent runner carries out what you asked
and adds no safety nets. What makes it hard in real life applies here too.
The hardness is a means. The goal, stated in the next section, is that
players come back: to the tab several times a day, and to the game after
every death. This roadmap names the work in eight sub-projects, each with
its own spec, plan and build, in the order they should land, and the
lettered items under "The idle loop" that make it a game people return
to. Each spec lives beside this file as
`2026-MM-DD-survidle-<name>-design.md`.

## What we are optimising for

Retention. Every item below is judged by one question: does it give a
player a reason to open the tab again, or to start again after a death?
Realism is how the game earns that, not the aim in itself; a sub-project
that adds truth and no reason to return waits behind one that does.

What retention means here is fixed by the scale. A game day is 24 real
minutes, a year is about 6 real days, and the away cap is 60 game days.
So the natural unit is a week-long run with several check-ins a day, and
the two loops that carry it are:

- **The check-in loop.** Every return must show three things: what
  happened (the away report, built), a decision to make (B's forecast,
  which turns "food for 4 days, water for 1, storm on Thursday" into a
  change to one standing order), and visible progress since last time
  (stocks, skills, a season nearer).
- **The survivor loop.** Every survivor dies. What they built, walked and
  saw stays in the world for the next one. A longer life is the score
  and the achievement; the world remembering it is the reason to start
  again. This is item F below.

The contract is Don't Starve's and The Long Dark's, not Melvor Idle's.
Melvor's number never goes down and its player never loses, and that is
the opposite of the feeling wanted here: punishing, with a sense of
accomplishment as runs grow longer, and never a set-up that holds
forever. Loop Hero is the nearest structural match: an expedition ends,
what came home builds the camp, the camp persists. What Survidle keeps
from Melvor is the in-run part, the skill ladder, mastery and pools,
and standing orders. The unproven combination is brutal plus idle:
nobody has shown players accepting death while the tab is closed. That
is why B is not optional and why every away death has to be one the
forecast showed. Punishing is the aim; unfair is the failure mode.

Targets, to calibrate rather than to hit exactly:

- A first run dies inside 20 days. A player who has learned the loop
  reaches winter (about day 245) in one run in five. A full year is the
  achievement of the first weeks of play. Two full years is exceptional,
  and no set-up ever shows a month forecast of zero after its first
  winter.
- A competent set-up (the reference player in F) reaches 1 December on
  four seeds before any content that only matters in winter is built.
- Something new to read in the log every game day, and a season
  threshold to prepare for every 30 to 45 game days: berries, the rut,
  first frost, lake freeze, first snow, the dark, the cold snap, ice-out.

## What kills you today

- Cold: warmth under 20 drains 6 health an hour; a night in the open at
  -3 C costs 30 to 55 warmth. This is the killer that actually kills.
- Starvation: 6000 kcal full, 100 to 400 an hour burned, and only 2 health
  an hour once empty, so it is slow.
- Wolves: two percent per night hour outside shelter at full local wolf
  density, twice that in winter; no wolves, quiet nights.
- Fever: rare, four times likelier soaked and cold, slow unless untreated.

What is already hard and stays: fishing barely breaks even on calories, a
bow needs cordage, a log, a knife and arrows need sinew from a kill, a deer
is 18,000 kcal that rots in 36 warm hours and dries 6 kg at a time.

## The eight sub-projects, in order

The numbers below are names, not the sequence; they stay put so specs can
cite them while sections are still being written. The build order is by
impact on the idle loop, the thing that kills an away run soonest first,
with one exception taken by the author: D species and sound goes next,
because its spec and plans are done and it rewrites the hunt and fish
branches everything after it drives. So: 1 (built), A standing orders
(built), then D, then the baseline (the section of that name under the
idle loop: water at camp, the thirst priority, arrows in the pack, wet
wood, the rack as a task, tool keeps, and a start with a shore and rock),
then B the risk forecast with the away cap as its horizon, then F the
survivor loop (a run that ends is the first thing a returning player
needs, and the cellar is what its decay rules make worth building), then
the first producers and stocks (C's basket trap, and 3's water storage
and cellar, pulled out of their items), then E hides and clothing, then the rest of 3
camp (siting, the shelter ladder, the buildings) with the rest of C
alongside, then 4 animals, 5 injury and the body model, 7 wind, 8 forest
fire, and 6 territory last. 2 rivers is flavour and has no slot: it lands
whenever there is room after 3, and when it does it plugs into the water
features 1, C and 3 own rather than bringing its own.

Why the baseline, B and the producers come before E and 3: headless runs
of A's runner (2026-09-03, seeds 17, 19, 42 and 79, 250 game days, a
kitted camp with keeps for wood, fire, meat and fish) died of thirst
between day 3 and day 23 in every set-up, and with water and fire supplied
by hand they starved between day 67 and day 86 when the axe, spear and
bow wore out with nothing to replace them. No run reached winter, so
nothing that only matters in winter can be the next thing built. The
baseline is what lets a camp hold a week; B is what makes an away death
fair; the trap and the cellar are the first things that yield while the
player is gone. E comes straight after them because D's fur and fat are
its inputs and because 5 (insects, burns on bare skin), 7 (wind through a
coat) and C (clothing tiers worth the level) all reach for a clothing
model that 1 left thin. Fire comes after 5 because its burns are wounds
in that model and after 7 because it cannot spread without wind; it comes
before 6 because the burn's regrowth clock is the first of the regrowth
clocks Territory generalises.

### 1. Body and elements

Specced and in build: `2026-09-03-survidle-body-and-elements-design.md`.
That spec holds water, ice, wet clothing and frostbite, wet wood, smoke,
storms and exhaustion. Fog, described below, is not in it: it gets its
own spec after 3, and a shore or a region edge is what you follow out of
it until 2 adds a river bank.

Thirst and water: a third reserve beside food and warmth, drunk at a shore
or from melted snow at a fire, which costs fuel; stored water freezes.
Kilocalorie burn by activity and by the ground crossed. Exhaustion lowers
the odds of hunting, fishing and crafting, not only the pace. Freak
weather: rain and snow drive warmth down and spoil work in progress. Wet
wood burns poorly; a fire is hard to keep in heavy rain or snow. Smoke and
ventilation for a fire under a roof. An unattended fire can spread in dry
weather. Clothing and footwear stand between you and all of it; wet boots
are a real problem. Seasonality is sharpened, not invented: winter light,
snow, thinning herds and the berry season already exist.

**Fog.** Fog is a visibility in metres, never a flag: clear, haze at
1 km, fog at 200 m, dense fog at 50 m. It forms where fog forms at 62 N
inland, per cell, from the elevation every cell already has:

- Radiation fog on a clear, still night after wet weather, mostly August
  to October. Cold air pools, so there is a fog line: every cell below it
  is in fog, densest at the bottom. Bogs, lake shores and valley floors go
  first; a ridge stands above it, and from a fell you see a sea of grey
  with the tops clear. It forms an hour or two before dawn.
- Steam fog on water cells and their shore on cold autumn mornings; sea
  smoke over open sea in winter.
- Cloud on the fells: any overcast or rainy day puts the fell tops inside
  it, from the top down. Visibility 50 m up there is how people die in
  that country.
- Freezing fog in a valley under a cold-snap inversion, -10 C and below.
  It stays for days, rimes every twig, and holds the cold in the valley.

Fog dissipates the way it came: after sunrise the fog line drops a set
number of metres per hour, faster in sun and slower under overcast, so the
high cells clear first and the last of it lies on the bog at noon; an
autumn overcast can hold it all day; once storms exist, wind tears it off.

What fog does to the body and the work: it dampens slowly, like snow,
never past damp, and nothing dries outdoors in it; hunting odds halve,
since you cannot see the animal, while fishing is untouched; the dawn log
says where it lies, "Fog lies in the low ground", before it can hurt you.
Each foggy cell is drawn under a grey wash by its density, the glyph faded
beneath it, and freezing fog rimes the trees white-blue. The clock line
reads "fog, 200 m". Seeing through it, and getting lost in it, are
sub-project 6.

### 2. Rivers (flavour, no slot)

Rivers are kept for the look of the north, not for a threat or a stock:
a line on the map from the elevation the world already has, water
running off the fells to the lakes and the sea, blue in summer and white
under ice. Nothing after this depends on them. Every job the rivers were
once to do has an owner that does not need them: winter water is an ice
hole at the shore and 3's storage; a fishing spot is any shore, and the
passive tier of fishing is C's basket trap in lake shallows; the line to
follow out of fog is a shore or a region edge.

What rivers must do when they land is integrate with those owners, never
stand beside them:

- **Water.** A river cell is a shore for drinking and filling. A rapid
  never freezes, so a camp within reach of one has open water all
  winter beside the ice hole; the runner's drink and fill branches treat
  it as a shore with no ice.
- **Ice.** 1 lands one thickness for the world; rivers refine it per
  water body: rapids open, rotten ice in the thaw, and ice that forms
  later on moving water, which is where 7's freeze-up delay applies.
- **Fishing.** The weir is the river form of C's basket trap: stakes
  across a shallow segment, the same order to empty it, the same ice that
  takes it in November. D's catalogue keeps grayling and salmon back for
  rivers, and the summer run up the fjord rivers is the seasonal event
  the trap turns into a stock.
- **Fog.** A river bank joins shore and region edge as a line with no
  bearing error.
- **Bridges.** A log bridge on a narrow segment, a longer one on a wider
  segment for more logs, more cordage and days of work, and a bridge the
  flood can take. Moved here from 3 because nothing else in 3 needs them.
- **Crossings.** Each segment has a width and a flow that follows the
  season, spring melt the flood and late summer the low. A ford costs wet
  legs and time, above a threshold flow it is refused, and rapids are
  never fordable. The trap comes for free: cross a ford in September,
  two days of rain, and the way back is gone. The route planner's "no
  way there on foot" answer then changes week to week, and the log says
  so. This is the part that is simulation, and it is last inside the
  item.

### 3. Camp build-out

Camp today is two rungs, a lean-to at 4 hours for +5 and a cabin at 60
hours and 40 logs for +15, with nothing between, and A's build shows the
away runs dead before the cabin is affordable. This is the item with the
least depth today and the cheapest depth to add: every rung is a row in
the structures table and a warmth rule. It has three parts, in this
order: siting, the shelter ladder, and the buildings.

**Siting.** Camp is the cell nearest the region centroid and the player
never places it. It becomes a chosen cell: walk to it and "make camp
here". The region says what a cell offers before you commit: water
within reach and whether it ices over, forest within haul, rock, a dry
slope, bark or bog turf for a roof, wind exposure once 7 lands, bear
country once D's populations act. Orders belong to the camp as they do
today and the runner walks to the chosen cell. Choosing where to settle
is the decision the rest of the run is spent living with, and it is the
most idle-shaped addition in this roadmap; the rungs below are what make
the choice mean something.

**The shelter ladder.** Each rung has a northern precedent and a cost it
pays back in a different currency. Warmth is the shelter term of the
felt-temperature sum, as the lean-to's +5 and the cabin's +15 are today.

| rung | build | gives | costs it back | where it stands |
|---|---|---|---|---|
| snow shelter | 2 h, no materials, deep snow | about 0 C inside, out of the wind | melts in a thaw; winter only | wherever 7's drifts put deep snow |
| lean-to | as today: 4 h, 8 sticks, 4 logs, 2 cordage | +5, halves wetting | open front | anywhere |
| rock shelter | nothing; the site gives it | the lean-to's roof and wind wall, no snow load, no fire spread from bare rock | cold rock, so no more than a lean-to's warmth; smoke pools under the overhang by the closed-cabin rule; a bear den in winter (4) | fell edge and boulder field cells the world generates |
| turf hut | 2 days: poles, 20 sticks, birch bark or bog turf for the roof | +10, blocks rain, a hearth with a smoke hole so a fire inside is legal | the roof rots in a year or two and is re-turfed; heavy in bark, light in logs | where bark or turf is within reach |
| dug-out | 30 h: 12 logs for the roof, turf over, and a digging tool, an elk's shoulder blade from D's bone yield | +12, and the earth holds it near 0 C unheated, so a winter costs a third of a cabin's firewood | damp: bedding and hide inside wear as if in rain; floods on flat ground, so a dry slope or nothing | a slope that is neither rock nor bog |
| cabin | as today: 60 h, 40 logs, 12 stone, 8 cordage | +15, blocks everything; the hearth, storehouse and cellar attach here | the cost | forest within haul |
| hide tent | E's hides, 6 of them sewn, and poles cut on site | +8 with a hearth inside; 15 kg in the pack | wears like clothing; poles are cut fresh each pitch | walks with you; it is the shelter 6's moving camp needs and a multi-day hunt uses before that |

The rungs that carry the item: the turf hut is the missing middle, the
rung a player reaches in the first fortnight and winters in when the
cabin is out of reach, so the first winter becomes a choice between hut
plus wood pile and cabin plus less wood. The dug-out is the idle economy
rung, since its payoff is firewood not burned, which is hours the runner
does not spend, the currency every standing order is measured in. The
rock shelter is the first-winter answer that costs a walk instead of a
build, and it stays worse than a cabin in every way that matters so the
cabin keeps its reason. A player who winters in a shelter survives and
grows nothing; a player who builds a cabin has somewhere for the
storehouse to go.

**The buildings.** The cabin made properly expensive for one person.
Woodshed, smokehouse, raised cache or cellar, storehouse, tool shed,
palisade, a chimney or vent as part of a shelter, roofs with a snow load
they can fail under, water storage. Every building is an answer to a
threat from 1, 4, 7 or 8, and its cost is tuned against that threat.
Water storage and the cellar are the two that answer what A's build
measured, and they come first.

### 4. Animals as agents

Predators that attack in their own country by day, not only wolves at
night. Bear, wolverine, fox and ravens that take meat from the rack, the
pile and the shelter. Hunting genuinely poor without good tools.
Populations per region already grow, thin and migrate; D gives every one
of these animals a population with a range and a season, bear and
wolverine included; this makes them act.

The bear den is the one hunt with a season of its own. Bears den under
boulders and overhangs on the fell side from November; the den is found
by tracks in autumn and hunted in January with a spear, at a Hunting
level the recommended-level rule makes honest, for a hundred kilos of
meat, the fat E's tanning wants and a fur. A den missed in autumn is a
bear beside your camp in April.

### 5. Injury, disease, insects, mind

Wounds that need care and go septic. Parasites and disease from bad meat or
an untreated wound. Mosquito, black fly and tick season that makes places
unusable and makes smoke, clothing and the camp site matter. Loneliness and
poor judgement over months alone.

**Why this sub-project owns a body model.** Sub-project 1 shipped the flat
version: `injured` and `sick` as timers, `frostbite.feet` and `.hands` as
timers, `toes` and `fingers` as flags, and a walking-speed or odds factor
per flag. That is realistic in kind and much too kind in degree. Real
frostbite has two tiers: superficial, which clears in days by a fire, and
deep, which is dead tissue from the hour it freezes and declares itself
over three to six weeks ("frostbite in January, amputate in July"). A
thawed deep frostbite is not a limp, it is a bed: severe pain, blisters,
no walking and no heavy work for weeks, so the real question is whether
camp can carry you that long. What kills is not the cold but the
infection that follows, and the loss is not only toes: forefeet, a foot, a
hand, a leg after an axe wound or a fall on the fell. This sub-project
replaces the flat fields with one wound model that also serves the axe,
the elk, the fall through ice, burns, bites and disease.

**The body, as data.** Ten parts, each with a lost flag and a list of
wounds; the core reserves stay where they are.

```ts
type Part =
  | "head" | "torso"
  | "leftArm" | "rightArm" | "leftHand" | "rightHand"
  | "leftLeg" | "rightLeg" | "leftFoot" | "rightFoot";

type WoundKind = "cut" | "bruise" | "fracture" | "frostbite" | "burn" | "bite";

interface Wound {
  part: Part;
  kind: WoundKind;
  /** 1 superficial, 2 deep, 3 the part is dying. */
  severity: 1 | 2 | 3;
  /** Minutes since it happened. */
  age: number;
  /** Dressed, splinted, cleaned: what care it has had, as minutes since. */
  dressedAgo: number | null;
  /** 0 clean to 100 septic; rises with dirt, wet and cold, falls with care and rest. */
  infection: number;
  /** Deep frostbite only: minutes until the dead tissue declares itself. */
  demarcation: number | null;
}

interface Body {
  parts: Record<Part, { lost: boolean; wounds: Wound[] }>;
  /** Fever, parasites, food poisoning: whole-body courses with a timer and a strength. */
  conditions: { kind: "fever" | "parasites" | "foodPoisoning"; minutes: number; strength: number }[];
}
```

`Player.kcal`, `water`, `warmth`, `energy` and `wetness` remain the core
reserves; `sick`, `injured`, `frostbite`, `toes` and `fingers` fold into
`Body` and are migrated on load.

**What a part does, and what a wound or a loss costs.** Every effect on
the game goes through a small set of capability functions that read the
body, so no task ever reads a part directly:

| part            | carries                          | severity 2 wound                              | lost                                   |
|-----------------|----------------------------------|-----------------------------------------------|----------------------------------------|
| foot            | walking, standing work           | walk 0.5, no heavy work, no fell or bog       | walk 0.5 for good, no fell or bog, no hauling |
| leg             | walking, hauling                 | walk 0.4, no hauling; fracture: no walking    | crutch: walk 0.3, no hauling, no hunt  |
| hand            | tools, the bow, crafts           | odds and crafts 0.5, no axe                   | no bow, no axe, crafts 0.5 with the other |
| arm             | felling, the bow, hauling        | no felling, no bow, hauling 0.5               | as hand, and hauling 0.5               |
| torso           | everything                       | work 0.7, walk 0.8, kcal burn 1.2             | not survivable                          |
| head            | judgement                        | odds 0.7, the log's warnings arrive late       | not survivable                          |

Pairs matter: one bad hand leaves the other; both, and you cannot make a
fire. `canUse(tool)`, `walkFactor()`, `workFactor(activity)`,
`oddsFactor()` and `hauling()` are the only readers; today's `workSpeed`,
`baseWalkSpeed` and the skill odds call them.

**Courses.** A wound ages every minute. Infection rises by kind and
severity, faster wet, cold, dirty or starving, and falls with a dressing
that is fresh, with rest under a roof, and with the wound cleaned in boiled
water (a use for the water reserve and the fire). A wound past 60 infection
drains health and burns kcal; past 90 the part is dying (severity 3) and
the choice is the knife or the fever. Deep frostbite runs its
`demarcation` clock; at the end the part is either whole again (small
wounds) or lost (the toes, the forefoot, the foot), and the log says which
day the line will be drawn. Refreezing a thawed frostbite sets severity 3
at once: the one rule every account of cold injury agrees on.

**Care, as tasks.** Dress a wound (hide or cloth, minutes, needs a free
hand), splint a fracture (two sticks, cordage), clean a wound (1 litre
boiled: a fire and a vessel), rest it (a day off the part; the runner
respects a "no heavy work" flag the way it respects hunger), and amputate
(a knife and a fire, hours, a mortality roll of one in three alone, a
permanent loss, and a wound of its own to nurse). Each is an ordinary task
under an intent, trains Crafting, and appears in the Camp list only when a
wound calls for it.

**Sources of wounds.** The axe (1 to 3 percent per tree, worse spent), the
hunt that turns on you (the elk already does), the fall on the fell and
the fall through ice (sub-project 1), burns from a fire tended tired and from 8's forest fire, and bites from sub-project 4's animals. Each names a part by where it lands:
the axe takes shins and feet, the elk takes torsos and legs, the ice takes
the whole body cold and the feet first.

**The mind.** Loneliness is a slow course too: weeks without a change of
region or a finished build raise it, a warm cabin and a full store lower
it; high loneliness widens the odds of every mistake (the axe, the fire
left big, the thin ice taken) rather than adding a bar to watch.

**Insects.** June to August, bog and shore cells carry a mosquito load by
warmth and wind; working there without smoke or a hood costs energy and
sleep and raises the itch that turns into scratched, infected skin;
smoke from a smudge fire at camp clears the camp; ticks in tall grass on
the heath seed a fever course a week later. This is why camp on a windy
shore beats camp in the bog.

**What this sub-project explicitly does not do.** No pain or morale bar;
no permanent stats beyond the loss table; no medicine the north did not
have. The player learns the body from the body panel, which shows each
part with its wounds, their age and care, and from the log, which says
what a wound needs before it says what it took.

### 6. Territory

Every gathered resource depletes per region and regrows at a rate that
rewards spreading work over the neighbours, so the land near camp thins but
never dies. Moving camp, or shifting stock to it. Snow that buries
supplies, collapses weak roofs and raises the cost of travel. Wind that
damages buildings. Distance from camp already costs time and exposure;
this makes it a strategy.

**Seeing in fog, and getting lost.** The map veils every cell beyond the
visibility from you: at 300 m cells, fog at 200 m shows your neighbours
and dense fog only your own cell. Fog of war is untouched; this is a
second, temporary veil.

Walking in fog has no pace multiplier. Every step is at your normal speed
in the direction you believe is right; what changes is the error in that
direction. With the sun visible, in thin haze, or with a compass in hand
the error is small and you hold your bearing. Following a shore, a river
bank or a region edge you can feel underfoot, there is no error, since a
line is a line. Otherwise the error grows as visibility falls and with the
ground: forest gives you trees to line up on, open bog and fell give
nothing. People walk in circles in fog because each step drifts the same
way, so the error drifts the same way per walk and you curve rather than
jitter. You cover the route's distance at full speed and arrive somewhere
else, one to several cells off, and the walk ends there: "You have lost
the way." You re-route from where you are, wait for it to lift, or follow
a line out. Intents push on and report, as the rules say. Slower and
random both fall out of the one mechanism, and the compass removes both.

**The compass.** There is no iron, so no needle; but the fell spine is
magnetite country. A lodestone, a magnetite pebble that holds a field, is
a rare find when gathering stone on an outcrop in fell country. Hung from
a cordage thread on a stick, or floated on a chip of wood in still water,
it points north; that is how the first compasses worked. A compass is a
lodestone, cordage and a stick, a few minutes of work, kept as a tool. It
does nothing by day in clear weather, when the sun steers you, and
everything in fog, at night under overcast, and on a fell in cloud.

### 7. Wind and thunder

There is no wind in the game. A storm is a window of heavy rain lasting 6
to 18 hours with a flat -6 C felt-temperature penalty standing in for it,
and there is no thunder or lightning anywhere. Two of the entries above
already reach for wind (fog is torn off by it, Territory's wind damage)
and fire cannot be built without it, so wind is its own small sub-project
that lands before 8 and that 1's fog, 4's hunting and 6 draw on. The
details are for its spec; this is what is worth considering.

**The field.** A direction, one of eight points, and a speed in metres a
second, rolled at dawn with the temperature anomaly and persisting from
yesterday with drift, so a wind holds for days the way it does. Storms
force a gale. The clock line reads it ("breeze from the SW", "gale from
the N"), and it is the first weather the player can plan around by
direction: which side of the lake to camp on, which way to approach the
elk.

**What it should touch, once it exists.**

- Felt temperature: wind chill in place of the flat storm penalty. A gale
  on a fell in January is -35 felt at -15 ambient, and a calm cold snap
  in the valley at the same reading is survivable. This is the change that
  will kill the most players and needs the most care.
- Fog: radiation fog forms on still nights and a breeze tears it off; the
  fog entry's dissipation rule gets its missing half.
- Drying: wet garments and wet wood dry faster in wind, a multiplier on the
  drying tables.
- Hunting: animals smell you upwind, so odds depend on where you stand
  relative to the wind and the animal. Most of real stalking, and a cheap,
  honest rung for the hunting ladder.
- Fire at camp: a gale eats fuel faster and throws sparks; fire in the
  forest spreads downwind (sub-project 8).
- Snow: drift, deep in the lee and blown clear on the tops, so deep snow
  has a place rather than a depth.
- Ice: wind delays freeze-up on open water, which 2's moving water
  refines per body when rivers land.
- Buildings: Territory's wind damage and roof failures.
- Work: `fish` and `chop` already refuse in a storm as "too rough"; the
  wind speed is what should decide that, not the storm flag.
- Sound, if ever: cues carry downwind and not up.

**Thunderstorms.** Not the existing long storm. At 62 N inland a
thunderstorm is a hot summer afternoon, June to August, one to three
hours, ten to fifteen days a year: it rolls only on warm days, arrives
with a gust front before the rain, drops heavy rain directly under it and
dry lightning around its edges, and is gone by evening. "Thunder over the
fells." Strikes land near the storm's path, not anywhere in the country;
a strike on a forest or bog cell at tinder starts a smoulder that flares
one to three days later if the ground stays dry, and dies if rain comes
first. One thunderstorm in four is dry where you are, which is the one
that starts fires. This is the storm that makes wind direction visible in
play, since the gust front and the smoke that follows both have a side.
The odds are 8's to set; the event is this sub-project's.

**Showing it.** A thunderstorm is the most visible weather the game
will have and it should look and sound like one, not like a dark rain.
Worth considering:

- Before it: the light goes wrong in the hour of warning. The map's
  lighting already tints by phase and rain; a thunderstorm gets its own
  phase, darker than overcast at noon with a bruised olive-violet cast,
  and the sky strip shows the anvil, a dark band across the top with the
  horizon still lit beneath it, which is what an approaching cell looks
  like. The sun disc goes behind it.
- The gust front: the rain overlay's angle follows the wind direction
  instead of the fixed slant it has now, and thickens at the front. The
  clock line's wind reading jumps.
- Lightning: a whole-map flash of about 100 ms, brightness up and the tint
  to white for two frames then decaying, sometimes a double. At night the
  flash lifts the night shade for that instant, so a storm is the one time
  you see the country beyond the firelight: the lake, the fell, the
  neighbour's black burn scar. A bolt on the sky strip for a frame. The
  struck cell flares for a second, and if it took, the smoulder that
  follows is 8's. Honour reduced-motion: a flash becomes a dim pulse.
- Sound: the species-and-sound spec has a cue system and buses but is not
  built; it gains `thunder` and `gust` cues. Thunder is a one-shot on the
  action bus so it plays with ambience off, in near and far variants
  round-robin, delayed after the flash by the strike's distance so a far
  storm is heard before it is seen coming. The delay has to be in real
  seconds while the clock runs a game minute a second, so it reads as a
  distance cue rather than a physical one: settle that in the spec. Wind
  itself is a loop by speed, which the spec's "open" ambience already
  doubles in a storm and can now grade.
- The log: "The sky has gone the colour of a bruise." an hour out,
  "Thunder over the fells." at the first strike, "Lightning struck the
  pine ridge to the north." when a strike lands in view, so the fire that
  flares two days later has a cause the player read.

**What to settle in the spec.** Whether wind is one value for the world
like the rest of the weather or shaped by the ground (a fell top is
always windier than a valley floor, which the elevation every cell has
could give for free); whether the felt-temperature change ships with a
warmer clothing rung so winter stays winnable; and how much of the list
above ships with wind itself against being left as a field for the
sub-projects that want it.

### 8. Forest fire

The one threat that changes the map. Its inputs all exist: a dry-day count
on the weather, storms, a camp fire that can already walk off camp, a torch
that burns for an hour and cannot be put out, populations per region, and
wind and thunderstorms from 7. What it needs that does not exist is a
real dryness number and a way for a cell's ground to change. Its place in the build order is after 4, 5 and 7 and before 6 (see the order above): a fire is what makes the animals move, its burns are wounds in 5's body model, and it needs 7's wind. Sub-project 1's camp-fire spread (its section 3.3, a one-shot
loss of 10 to 30 wood and the lean-to) becomes one of this sub-project's
ignitions: the fire starts at the camp cell and what burns is what the
fire reaches.

**Realism.** At 62 N inland the fire season is May to September. Two
peaks: early May, when last year's grass is dead and dry and the birch is
not in leaf, is grass-fire season on meadow and bog edge; July and August
drought is forest-fire season. Snow on the ground ends it. Pine is fire
country: thick bark, open lichen heath under it, a surface fire every 30
to 100 years that most of the pines survive. Spruce is the opposite: thin
bark, shallow roots, a moist floor that seldom takes, and when it does the
fire goes into the crowns and kills the stand. Birch in leaf hardly burns
and resprouts from the stump when it does. A bog burns only in a deep
drought, weeks without rain, and then it smoulders in the peat for days or
weeks, ignores ordinary rain, and re-lights its edges. Rock and water stop
a fire; so does ground that has already burnt. A surface fire moves 1 to
10 m a minute, a wind-driven crown fire 1 to 3 km an hour, and every fire
lies down at night when the air is damp. Lightning is the natural cause;
a strike often smoulders in the duff for a day or three before it flares,
which is why a fire "appears" after a storm has passed. Most fires are
people: a camp fire, a dropped brand. Afterwards the burn is black for a
year, fireweed and raspberry the next two, a birch thicket with dead
standing pines by year five, and elk and hare come to the browse. People
in this country burnt spruce forest on purpose for rye (svedjebruk, kaski);
that is a later camp feature this leaves room for.

**Dryness and lightning.** `Weather.dryDays` becomes two buckets, both
in millimetres of evaporation deficit, since the ground dries by
temperature and sun and wets by rain, not by a day count:

| bucket | scale | dries by | fills by | thresholds |
|--------|-------|----------|----------|------------|
| litter | 0 to 20 mm | 1 to 4 mm a day, from the day's mean and clear sky; nothing under 5 C | light rain 1 mm an hour, heavy 3 | dry at 8 (a camp fire can walk), tinder at 15 (lightning and a brand take) |
| peat | 0 to 200 mm | the same rate | the same | bog burns above 120: five or six dry weeks |

The clock line reads "dry" and "tinder dry", the log warns once at each
("The ground is tinder dry." moves to the second). Wind and the
thunderstorm are 7's; this sub-project sets the odds of a strike taking:
a strike on a forest or bog cell at tinder starts a smoulder that flares
one to three days later if the litter is still at tinder, and dies if
rain comes first, and the odds are set so that a player at one camp sees
a lightning fire in the neighbourhood every few dry summers, not every
year.

**Ignitions from the player.** The camp-fire rule stays (over 12 kg, no
one at camp for 2 hours, dry ground, 2 percent an hour); at tinder any
outdoor fire on a forest cell rolls a small chance an hour even attended,
four times that in a gale, and none under a hearth. A torch's stub falls
where it gutters out: on a fuel cell in fire season it takes 1 time in
100 at dry and 1 in 20 at tinder. Nothing else lights the forest. The
player can put out a fire only in its first minutes and only where it
started: "Beat it out" on the cell, 30 minutes with a spruce bough, two
times in three at dry and one in three at tinder, a few points of health
in burns each try; ten litres of water on the camp cell within ten minutes is certain, which is more than any vessel holds (a bucket 2 litres, a waterskin 3), so in practice it means 3's water storage at camp, a trough or a filled barrel kept for the purpose. Past one cell it is a forest fire and nobody stops it.

**Spread.** An active fire is a set of burning cells, each with its
ignition minute, stepped every 10 game minutes. A burning cell tries to
light each 4-neighbour with a chance from the neighbour's fuel, the
litter bucket, the wind (downwind three times, upwind a third, calm all
equal), night (a third between dusk and dawn) and rain (light rain
halves it, heavy rain puts a surface fire out within the hour, peat
ignores both until two wet days). Fuel by ground, and what the cell is
afterwards:

| ground | takes | burns for | after |
|--------|-------|-----------|-------|
| meadow | fast in May, poorly in leaf season | 20 min | meadow next spring; hare nests lost |
| birch | poorly in leaf (June to September), like grass before | 1 h | burnt, then birch again from the stump by year 5 |
| pine | readily | 2 h | at dry the pines stand and only the floor burns: still pine; at tinder a crown fire: burnt |
| spruce | seldom below tinder; fiercely at tinder | 2 h | burnt, then thicket, then birch; spruce not in a run's lifetime |
| bog | only above the peat threshold | days to weeks, smouldering | bog, cloudberry gone for ten years |
| fell | dwarf shrub, tinder only, slow | 1 h | fell |
| rock, water, burnt, cleared | never | | firebreak |

At 300 m a cell, a breeze on a dry July day moves the front one cell in
20 to 40 minutes downwind, a gale in five, a calm night in hours: a
fire that starts at dusk 3 km upwind is at camp by morning, and one that
starts at dawn is there by lunch. A cell that has burnt smoulders for
12 hours, with smoke and no spread, then is burnt ground. A fire ends
when it runs out of fuel, meets water, rock or old burn on every side, or
rain comes.

**What it does.** A burning cell destroys what is on it: the pile, the
logs, a lean-to, the rack and its meat, snares, the bough bed, the wood
pile and the cabin, which is the biggest loss the game has. Stone and
bone survive in the ash. The region's `wood` drops by the burnt forest
cells' share, less the pines that stood. Hare and grouse on the burnt
cells mostly die; deer and elk mostly run, so the region loses a small
share to the fire and the rest of the burnt share moves to touched
neighbours at once instead of waiting for the daily migration. Fish are
untouched. On a burning cell you lose 25 health a minute: four minutes, and every minute there adds a burn wound in 5's body model to an exposed part (hands and face first, then whatever the clothing does not cover), so a survivor carries the fire for weeks; "burned" is the death cause when the body gives out on the cell or to the wounds after.
Smoke downwind is never deadly outdoors; it halves work and hunting odds
and brings visibility to 200 m through the fog mechanism. The runner
keeps its rule and plans nothing around a fire, but a body flinches from
flame the way it shelters from a storm: awake, with fire on a neighbour
cell, you step to the nearest cell that cannot burn, which the intent
reports as "fled the fire"; a walk routes around burning cells; asleep, the smoke wakes you two times in three, and the third time is the death cause "burned". These are runner behaviours of the storm kind, what a body does without being told: flinch, route around, wake; none of them plans, and the third time still kills, which keeps the rule that being away carries the full risk. A fire that comes through while you are away is a line in
the away report and a cause in the risk forecast, which is where a dry
July gets its honest number.

**What it gives.** Dead standing pine is the top rung of sub-project C's
wood ladder, and a burn is where it stands: felling on a burnt cell is
half the time, and its wood splits dry in any weather but rain, for five
years. Raspberry doubles the berry yield on a burn in years two to five.
Elk capacity doubles and hare rises by half on young burn cells for ten
years; grouse capacity there drops to a third, since grouse want old
forest. Burnt ground walks at meadow speed, thicket slower than forest.
The set-up that lowers the risk, so that the forecast can be answered:
camp on rock, meadow or shore rather than in spruce; a hearth; "Clear
the ground", a camp job of six hours with an axe that makes the camp cell
and its four neighbours firebreak for the year and yields sticks; a full
bucket at camp; no torches in a dry spell; a small banked fire, which the
runner already leaves.

**World generation.** Terrain is a pure function of seed and position,
and region stats, spots, names and routes are caches of it. A fire is
the first thing that changes a cell, so it needs one overlay and one
succession function, and both should serve generation too:

- `succession(original, years)` maps a ground and the years since it
  burnt to what stands there now: burnt to year 2, thicket to year 15,
  the pioneer after (birch on spruce and birch sites, pine on pine
  sites), spruce at 80. `Terrain` gains `burnt` and `thicket`.
- At generation a slow noise marks old burns, about one forest cell in
  twenty, aged 3, 8 or 20 years before the run, drawn through the same
  function: so the first map already has birch thickets full of dead
  pines and elk, and a black scar on a fell side, which is what that
  country looks like.
- At run time `GameState.burns` holds cell index to burn minute, the
  world reads it through the same function, and the chunk caches keep
  the original ground. A burn marks its regions dirty; their defs are
  rebuilt from the effective ground (fractions, forest, `wood0`,
  capacities, spots), the region name is computed from the original
  ground so it never changes, and the route cache is cleared. Active
  fires live in `GameState.fires`. Save version bumps; an old save has
  no burns and its dryness comes from its dry-day count.
- Fires are simulated in touched regions and one ring around them, the
  same country the animals move in; a fire beyond that does not exist.

**Visuals.** The question is how a fire in the trees at night reads as
something other than a hearth or a torch, since all three are orange
light on a dark map. A hearth today is one marker with one or two amber
rings that flicker in place; a torch is one amber ring around you. The
fire is told apart on four counts, and the rule that keeps them apart is
that rings belong to hearths and torches only:

- Shape and motion. A fire is many cells, contiguous, and it moves: the
  front advances a glyph at a time, every ten game seconds at speed. A
  burning cell keeps its ground glyph, so you see the pine burning, in
  flame yellow on deep red, flickering faster than a hearth and out of
  step per cell, and never gets a ring class. Behind the front the cell
  is `x` in ember red with a slow pulse while it smoulders, then `x` in
  ash grey on charcoal, no animation, day and night: a black scar that
  stays. Thicket is `y`, the small birch.
- Smoke. Two or three cells downwind carry a brown-grey veil with the
  glyph faded, the fog veil in another colour, by day as much as by
  night. Firelight has no smoke.
- The sky. With a fire within 10 km the sky strip's horizon goes tan and
  the sun disc red; at night the horizon on the fire's side carries an
  orange band and the map tint takes a brown cast. A hearth never touches
  the sky.
- Range. A smoke column is seen fifty kilometres off, so a burning block
  shows red at every zoom and even in never-visited fog, and the coarse
  zooms show burnt blocks as scar. The clock line says "fire 2.1 km NW,
  coming this way", which is the one signal that needs no reading of
  colour.

If play shows the hearth and the fire still confused, the hearth marker
moves from brick red toward amber and the fire keeps the red. A crackle
within a kilometre as a one-shot effect, no bed. The legend gains
"red: burning", "x burnt", "y thicket".

The browser pass for this one: a July run with a dry spell, the tinder
warning, thunder, a fire seen from camp two valleys over and the front
moving on the night map beside a lit camp fire, the flight to the shore,
and the scar the next morning with the elk tracks on it a year later.

## The idle loop

The eight above make the north dangerous. The lettered ones below make
Survidle an idle game in the sense of Melvor Idle and A Dark Room: you set
up a system, you leave, and you come back to gains and a readout of how
well the system held. They run beside the eight, not after them; the
first is built, and everything that follows is played through it. Every
"away" carries a risk of dying. The point is that the risk is legible and
the set-up lowers it. F is the one that is not an idle mechanic at all:
it is what happens when the set-up fails, and why the player starts again.

### A. Standing orders

Built: `2026-09-03-survidle-standing-orders-design.md`, plan
`2026-09-03-survidle-standing-orders.md`. A ranked list of orders per
camp: keeps ("keep camp at 40 kg firewood", unmet under half the target
and then held until the target, so the runner does not walk home to split
one log), grinds ("fell trees forever"), and jobs ("build a cabin", "make
20 arrows") that drop off when done. Each free minute the scheduler judges
every order, so every row shows a current state (met, its reason, or
waiting), and serves the highest that is unmet and can start; it finishes
a pending delivery before it switches and never switches mid-task. A
blocked row is still clickable: a cabin job ranked above the grind that
will haul its logs in is how a cabin gets built while you are away, since
the runner never gathers a prerequisite on its own. With orders but
nothing to run, the runner waits at camp, resting by day and sleeping by
night, the body tier serving it as any intent; a region with no orders
has no intent. The away report gives one line per order of the camp you
left: what it did, what it is blocked on, and which jobs finished.

What the build taught, for the sub-projects after it:

- A set-up camp with no water in reach dies of thirst in about thirty
  hours whatever its orders say (seed 3's start does). B's "tonight"
  number will show that before anything else, and an ice hole at the
  shore and 3's water storage are what answer it.
- Orders belong to a camp. Nothing crosses a region: an order's cells are
  in the region it was given in, and travelling leaves the list behind
  until you return. 6's moving camp, and any "stock the winter camp from
  the summer one" play, needs an order that spans regions.
- The runner's thresholds decide what "waiting" costs. Rest keeps energy
  at full, so a waiting body would never have slept by the night clause
  alone; the wait sleeps by the clock instead. B's forecast runs this
  runner, so a change to those thresholds moves the forecast.

### The baseline

Seven fixes to rules that already exist, in the order they killed the
headless runs of A's runner. None is a new system; each is a stock, a
priority or a keep the loop needs before any content lands on it. They
get one spec between them.

- **Water at camp.** A shore ices over from 2 cm and snow is gone on
  many April days, so a region has days with no water at all; the fire
  goes out when no one is at camp, since auto-feed is camp-only; and the
  thirsty need never lights a fire to melt snow, only uses one already
  lit. An ice hole at the shore, a water stock at camp that a keep can
  hold ("keep camp at 6 litres", the trough or filled bucket that 3's
  storage grows into), and a thirsty step that lights the fire the way the
  cold step does.
- **Thirst before hunger.** `currentNeed` returns hungry before it looks
  at thirst, and a hunger with no food to answer it still wins, so the
  runner works on until thirst kills it with water in reach. A need with
  no remedy yields to one that has one.
- **Arrows in the pack.** Unloading at camp drops everything on the back,
  arrows included, and provisioning pockets only food, so every bow hunt
  blocks on "needs arrows in the pack" after the first delivery. The
  provisioning step pockets what the live order needs: arrows for the
  bow, a vessel for the walk.
- **Wet wood.** "Keep camp at 40 kg firewood" counts dry wood, and a log
  split in rain is wet wood, so one run split 157 logs into 1,278 kg of
  wet firewood and never met the keep. The keep counts wet wood toward its
  target, or splitting waits for dry ground.
- **The rack as a task.** Hanging meat is an instant button, so no order
  can dry meat and a deer's 12 kg rots beside a rack that holds 6. Hanging
  and taking down become tasks with a yield, so "dry meat, keep camp at
  10 kg dried" is an order.
- **Tool keeps.** A tool recipe yields no countable item, so a keep for it
  collapses to a once job and the loop ends when the axe breaks. Tools
  become stock in the pile, or a keep reads "camp has a working axe".
- **A start with a shore and rock.** No start in seeds 1 to 80 has both a
  shore and an outcrop, and most have neither, so the first tool chain
  cannot be idled and the first camp has no water. `findStart` adds both
  spots to its filter. 3's siting is the long answer; this is the cheap
  insurance until it lands.

### B. The risk forecast

An honest number, not a checklist: the simulation itself run forward from
the current state in a worker, several times with different dice, and the
deaths counted. Shown as a small table per horizon: tonight, a week, a
month, each a percentage, with the top cause of death among the runs that
died ("cold, night 4"). A month is long, and the month number is the one
that says what to build next. The forecast runs the game's own `advance`, with the runner's needs, gates and stickiness exactly as the live game has them, never a model of them; a change to the runner changes the forecast by construction, and the spec should make that a test. The forecast reads the orders list, so it
answers "will this set-up hold", and it is recomputed when the list, the
stocks or the season change. The sim steps in game minutes and is
deterministic per seed; a month is 43,200 steps per run. The spec settles
how many runs, how the worker shares the world, and what the table shows
before the runs finish.

**The away cap is a horizon.** Offline catch-up simulates at most 24 real
hours today, 60 game days, a constant. It becomes a dial the player sets
per run, from 1 to 24 hours with a default near 8: the longer you are
willing to be away, the more the world runs without you and the more the
dice decide. The forecast's first row is that horizon, "until you are
back", so the number covers everything that can happen while you are
gone; tonight, a week and a month stay as the rows that say what to build
next. The forecast cannot be exact, since weather rolls consume the random
stream per step and every click before you leave draws from it, so it
says "dead in 7 of 10 runs before you are back, cold on night 4", never
"you will die". The cost is known: A's headless runs advance about a game
day in 10 ms, so ten runs of a 10-day horizon are about a second, and the
horizon row can recompute on every list change while the longer rows
finish in the worker.

### C. Skill tiers

Levels are a percent per level today, so a level 1 and a level 15
woodcutter do the same work, one a little faster. Melvor's ladder is
content tiers. Soft gates throughout, never "locked":

- **Wood by species.** Logs and firewood carry their species. Birch burns
  hottest and gives bark. Pine gives resin for torches and glue and splits
  easily. Spruce gives boughs for bedding and roofing and burns fast. A
  top rung such as dead standing pine, dry and light to haul. Each species
  gets a recommended Woodcraft level like deer and elk have for Hunting;
  under it the felling is slow and blunts the axe. Per-species mastery
  already exists (`chop:spruce`, `chop:pine`, `chop:birch`); its extras at
  20 and 50 become the concrete rewards.
- **Fishing by method.** The spear is the one method today, D's spec
  says so, and fishing barely breaks even on calories. The rungs are
  methods, not species: spear, then a basket trap, then a net. The trap
  is stakes and cordage set in lake shallows, a Crafting task at a
  recommended Fishing level; once set it catches while you are away at
  an hourly rate keyed to Fishing level and season, and a standing order
  "empty the trap, dry the fish" makes it a stock. It is the first food
  producer a camp runs without you. It has upkeep the game already knows
  how to charge: ice takes it in November, so it is rebuilt each spring,
  and 4's animals raid it. Whitefish in the shallows in October is its
  seasonal event; the salmon run waits for 2's weir, which is the river
  form of the same trap.
- **Hunting and crafting** already key per species and per recipe. They
  need more rungs, not a new mechanism: more animals with a real spread of
  yield and danger (D's roster, with a recommended level, yields and
  mastery extras per species), and tool and clothing tiers worth the level.
- **Buildings that produce, honestly.** A chicken coop lays real eggs at a
  real rate and eats real feed. Belongs with the camp build-out
  (sub-project 3), listed here because it is what an idle stock looks like
  in this game: a hut that yields wood per hour does not exist.

### D. Species and sound

Specced: `2026-09-03-survidle-species-and-sound-design.md`, plans
`2026-09-03-survidle-species.md` and `2026-09-03-survidle-sound.md`. The
species half is built (this branch): about thirty species in one
catalogue, each with a habitat, a range that does not cover every
suitable region, a season, yields and calls; wolves, bear and wolverine
as populations; hunt or fish for a chosen species or for whatever is
about; fur as its own item. Later: snares that take grouse, bear and
wolverine that act (4), seals on the coast, grayling and salmon with the
rivers. The sound half is next: beds for the ground, water, weather and
hearth, calls from the species here at their hours, footsteps and the
axe, one-shot cues that 7's thunder and 8's crackle plug into. It is here
beside the idle loop because the roster is what B's forecast and A's
orders hunt, and it lands right after A because it rewrites the hunt and
fish branches that A's runner drives.

### E. Hides and clothing

Clothing is named in 1 (wet garments, frostbite), 5 (insects, burns on
whatever is not covered), 7 ("a warmer clothing rung so winter stays
winnable") and C ("clothing tiers worth the level"), and D adds fur.
Nothing owns how a hide becomes a coat, and today that step is free.

**What the game does today.** Hide comes off the animal ready to sew and
never rots. A garment loses 0.5 durability an outdoor hour, 1.0 in rain,
1.5 times that while soaked, whatever it is made of and whatever you are
doing in it: a hide coat wears exactly like the wool one, asleep by the
fire in the open exactly like felling. Insulation scales with durability,
so a garment at 0 gives nothing, but it never goes: it sits in its slot
as a ghost, and a mitten at 0 still counts as mittens against frostbite.
"Mend clothing" is 0.5 kg hide, a bone needle and 30 minutes for +40 on
the most worn piece, and it revives the ghost for ever. The pace, at
twelve outdoor hours a day: the starting wool coat (60) is at 0 in ten
days, the starting boots (50) in eight, a new hide coat in seventeen,
and a full five-piece set costs 0.4 kg hide a day to hold at full, a
deer every eight days. The loop is coherent; it is thin. Wool is what
you arrived with, whenever this is set; the world has no iron and no
sheep, so hide is what the land gives, and the only clothing tech worth
having is the one that turned hides into fitted, layered clothing long
before wool: that is what this sub-project adds. Four decisions are
taken: tanning is in; torso and legs get a second layer; a garment at 0
becomes scrap; and wool keeps taking hide patches.

**Hide.** Three states, each an item with a weight, replacing the one
`hide` today:

| item | keeps | sews into | how it is made |
|------|-------|-----------|----------------|
| fresh hide | 72 h above 0 C like meat; frozen it holds | nothing; it is flesh on skin | comes off the kill, at the kill |
| rawhide | for ever while dry; soaked, it is fresh hide again with a 72 h clock | a wrapped piece: stiff, drafty, wears three times as fast | scrape: knife, at camp or at the kill, 1 h per 3 kg, loses a fifth of its weight to flesh and fat |
| tanned hide | for ever | every tailored piece | tan, then smoke (below) |

Tanning is one of two ways, both camp tasks, and the spec picks whether
both ship:

- Brain tanning: the animal's own brain, one per kill and enough for its
  own hide, 4 hours of work on the soaked rawhide, then a day drying in
  the open or by the fire. Fast, and it ties the hide to the kill.
- Bark tanning: 1 kg of birch bark per kg of hide, soaked together in a
  vessel or a pit at camp for 5 days, a task that is a standing order in
  A's sense rather than a wait. Slow, and it scales: an elk's 20 kg goes
  through in one pit. Birch bark is the wood-species rung C names, so the
  same bark that is tinder is the tannin.

Smoking is the last step and the one that matters in rain: 6 hours over
a low fire under a roof, or in 3's smokehouse. Smoked hide keeps half its
insulation soaked, like wool, where unsmoked tanned hide keeps a third,
and it does not stiffen after a wetting. Every step is a Crafting task
with its own mastery key. A tan or a smoke done under the recommended
level can spoil the way a craft does today, and a spoiled tan is the hide
gone. Fat scraped off the hide is D's fat item, 0.1 kg per kg of hide,
and is what feeds the tallow light 3 wants; the roadmap's calorie rule
holds, fat is 9 kcal a gram.

**Layers.** Torso and legs each get a second slot: base and shell. Head,
hands and feet keep one. The shell is the layer the weather finds first,
which `clothing.ts` already models as its outer set; the base takes half
the wetting, as the inner layers do today. Insulation sums. What the two
slots buy: the wind of sub-project 7 takes its felt-temperature cut off a
body with no shell in full, half through a wool shell, and none through
a hide shell; a base with no shell soaks straight through in rain; a
shell with no base is the wrapped-in-a-bearskin look, warm in the air
and cold where the wind gets in. The starting wool coat and trousers
are base layers. That is the one visible change to the opening: the wool
you arrived with is not enough for a winter shell, and it never was.

**Pieces and rungs.** Every slot gets a wrapped rung and a tailored rung,
where today there is only the tailored one at Crafting 8 and nothing
between it and wool:

| slot | wrapped: rawhide or tanned, cordage, no needle, Crafting 1 | tailored: tanned hide, sinew, needle |
|------|------|------|
| shell, torso | hide wrap, 4 kg, +8 C, 2 h | hide coat as today (+12) and, at Crafting 12, a parka with the hood sewn on (+14 and the head's shell) |
| shell, legs | hide leg wraps, +4 C, 1 h | hide trousers as today (+6) |
| base, torso | none | hide shirt, fur inward, 2 kg, +6 C, Crafting 5 |
| base, legs | none | hide leggings, +3 C, Crafting 5 |
| head | none | fur hat as today; fur hood, +4 C, Crafting 4, blocks the wind on the head |
| hands | hide mitts tied at the wrist, +1 C | fur mittens as today |
| feet | hide footwraps, +2 C, wet through in an hour | hide boots as today; lined boots below |

Lined boots are the cheap winter thing: dry grass or hay, a `hay` item
gathered on meadow under Foraging, 0.2 kg per lining, an instant action
at camp that gives +2 C on the feet and counts against cold feet, holds
while the boots are under 50 wet, and is flat after five days, the bough
bed's pattern. "Keep boots lined" is a standing order in A's sense. A
wrapped piece wears twice as fast as a tailored one and gives the
numbers above at best; a tailored piece under the recommended level can
spoil the way today's crafts do.

**Wear, by use and by material.** Wear per hour becomes a product:

- The task: asleep or resting 0, walking 0.5, felling, hauling, building
  and hunting 1.0, and nothing under a roof at rest, as today.
- The weather: rain doubles it, soaked 1.5 times, as today.
- The material: wool 1, tanned hide 0.75, smoked hide 0.6, rawhide 3.
- The making: a piece carries the Crafting level of the hands that made
  it, and wears 1 percent less per level, so a level 20 coat lasts a
  fifth longer than a level 1 coat of the same hide.

The log says "The coat is wearing thin." at 25, once. At 0 the garment
leaves its slot and becomes scrap: 0.3 kg for a small piece, 1 kg for a
coat, an item that mends with the same recipe as hide. Mending needs the
piece to be above 0, so "mend before it is gone" is a real choice and
the ghost coat is gone. Each patch lowers the piece's cap by 5: a coat
patched a dozen times is a coat that will not go above 40 again, and a
new one is the answer. Wool takes hide patches as today; the starting
coat becoming a patchwork is the right story.

**Skills.** The rule for this sub-project: every step has a level,
a mastery and a pool, and each buys something concrete and real, the way
felling and the hide coat do today. All under Crafting except the hay,
which is Foraging, and the skinning, which is Hunting:

| key | level buys (1% a level, as today) | mastery 20 | mastery 50 | pool |
|-----|------|------|------|------|
| `hunt:<species>` | the hide off in the hunt's time | as today | as today, and the hide comes off clean: fresh hide keeps 5 days, not 3 | 50%: every hide comes off clean |
| `scrape` | speed | loses a tenth to flesh, not a fifth | the fat comes off whole: 0.15 kg per kg | 25%: half the knife wear, as `wearFactor` does today |
| `tan:brain`, `tan:bark` | speed; under the recommended level (3) the tan can spoil, halving per level short as crafts do | a day less in the pit; a brain tans a hide and a half | 1 kg bark tans 2 kg hide; a spoiled tan is half the hide, not all of it | 25%: half the vessel wear; 95%: a tan never spoils |
| `smoke` | speed; recommended 5 | 4 hours, not 6 | the smoked hide wears as wool does when soaked, 1.5 times, not more | 10%: the smoke also drives the insects of 5 off the camp cell for the day |
| `craft:<piece>` | speed; the maker's level is the piece's wear discount above | one sinew fewer, as today | a tenth less hide, as today, and the piece starts at 110 | 25% and 95%: needle wear, as today |
| `repair` | speed | +50 a patch, not +40 | a patch costs 0.3 kg and takes 2 off the cap, not 5 | |
| `hay` | speed | a lining lasts a week | a lining holds to 75 wet | Foraging's yield perks, as today |

A line of that table is a mechanism the code has (`EXTRAS`,
`effectiveNeeds`, `wearFactor`, `craftSuccess`, `RECOMMENDED`) with a new
key, not a new mechanism, which is the point of C: rungs, not systems.
The one new field is the maker's level on the garment, which `Garment`
carries beside `durability` and `wet`, and which the mending rule reads.

**What it does to the rest.** 1's wet model gets the smoked and unsmoked
split and the base-takes-half rule it already half has. 5's insects find
bare skin: a hood and mittens are how the black-fly weeks are worked, and
its burns land on whatever the slots leave bare. 7's wind is what the
shell slot is for, and the parka is the "warmer clothing rung" 7 asks
about, settled here. 3's smokehouse smokes hides as well as meat, and
its water storage is the tanning pit. C gets its clothing tiers. D's
fur is the base-layer material by preference (fur inward, a degree more
than hide in the shirt), and its fat item gets a second source. A's
runner gets three orders: keep boots lined, keep clothing above N, and
the pit as a job that finishes on its own; B's forecast gets "your coat
will be at 0 in six days" as a cause.

**What to settle in the spec.** Whether both tanning ways ship or bark
alone; whether the pit is a structure in 3's sense or a vessel with a
timer; the exact insulation of every rung, checked against the winter
rule that a full tailored set, a cabin and a fire hold warmth at -30 C
and a wrapped set does not; and whether the starting kit gets a rawhide
or a scrap of tanned hide so the first mend does not wait on a deer.

### F. The survivor loop

Not specced. The high-level guidance is here so the spec has something
to argue with; the numbers are first targets, not rulings.

**The world persists; the person does not.** Death stays permanent and
still deletes the survivor: skills, pack, body, everything that was in
them. The world is saved instead of the person. The next survivor is set
down in the same world the following 1 April and finds what the last one
left. There is no rescue, no walking out and no voluntary end: a run ends
when the survivor dies, and the design has to make sure they do. Rogue
Legacy is the shape, with the land as the castle.

**The ramp.** A ramp is what rises inside one run until it kills. Without
one a stable camp is stable forever, and the game's promise is that no
set-up holds forever. Realism hands over the ramps; none is an abstract
difficulty number:

- The metal axe you arrived with is the best tool you will ever hold,
  and it wears out. Everything made after it is stone, bone and wood and
  worse. A's headless runs already die of this at day 67 to 86; that is
  the clock, not a bug. Tool keeps in the baseline let the camp replace a
  tool, never match the first one.
- The body accumulates what does not heal: 5's permanent damage, a
  frostbitten toe, a badly set bone, and a survivor who is slower each
  year. Skills rise a percent a level; the body should lose faster than
  that once the first winter is behind it.
- The land near camp empties. Trees within haul are cut, the game is
  hunted out (D's populations, 6's regrowth clocks), and every year the
  walk is longer. Wolves fed on carcasses grow in number.
- Winter, every year, and the second one with a worse axe and an older
  body.

The test of the ramp is B's forecast: a month number that reads zero for
a camp in its second year means the ramp is missing, and that is a
balance bug to fix before content.

**The ratchet.** A ratchet is what the next survivor starts with that the
last one did not. It must never be power: no skills carry, no pack, no
kit beyond the standard one. What carries is the world and knowledge of
it, and every rung of it is derived from play, never from a discrete
action the player takes for the heir. There is no "write in the journal"
button.

- **The journal** is the log the game already writes. A survivor who
  lived three days leaves three days; one who lived a season leaves
  where the elk were in October and the night the wolves came. The heir
  reads it at the start.
- **The map.** Cells the last survivor touched stay dim for the heir
  instead of black. Where they walked is where the map is.
- **Trails.** Traffic wears a path: a route walked twenty times hauling
  logs becomes a trail cell the router prefers and the heir can follow.
  Hauling already walks the same route repeatedly, so this costs nothing
  to earn.
- **Caches and structures.** What was at camp when the survivor died,
  minus decay. The stockpile was for their own winter; it is the heir's
  by accident.
- **Cumulative days survived**, across all survivors, is the one
  threshold currency, and it is also the score. It buys the single gift
  the world cannot explain: how close to the best camp the heir is set
  down. First targets: under 30 cumulative days, at the landing with the
  journal only; to 100, the map; to 250, the trails; past a year of
  cumulative living, set down at camp. A chain of three survivors dead by
  day 5 has earned nothing; one survivor who lived 200 days has earned
  most of it. Content the player is meant to meet only on a later run is
  gated this way, softly, by calibration: it needs a cabin already
  standing, a journal that names the place, a trail that reaches it, or
  more labour than one life gives (cabin, then cellar, then smokehouse,
  then a second camp). Never by a run counter.

**Decay between survivors** is where the balance lives and where the
roof and the cellar earn their place. The gap is months, so decay is per
month elapsed and the away catch-up already knows how to run it. First
rulings for the spec to strike: a cabin stands for decades; a lean-to
falls in a season; a rack rots in a season; dried meat in the open is
gone in a month and dried meat in the cellar keeps; a tool rusts to a
wear penalty and is still a tool; the fire pit stays; a trail fades in
two years unwalked; the dim map never fades, since it is knowledge; the
journal is forever.

**Where the heir is set down.** If the landing is fixed and the survivor
camps at it, the placement ladder is skipped. Either the landing moves
(the boat puts you ashore where the ice allows, so the drop point is
random along the coast) or the good land is deliberately not at the
coast, so camping at the landing is a bad camp. The second is more
honest and the terrain already reads that way: shore, then bog, then the
forest and rock a camp wants. The spec settles it.

**Search.** A cabin in fog is a real find. The vision ring, per-cell fog
and named spots exist; what is missing is a "search this region"
standing order that sweeps until a structure cell enters the ring. A
chimney does not glow, so the old camp is found by walking, by the
journal's direction, or by the trail.

**The reference player.** The ramp and the ratchet are calibrated by
headless runs, the way the baseline was found: a scripted set-up that a
competent player would make, run on four seeds, and its day of death and
cause reported. Its pass criterion moves with the roadmap: reaches
1 December before winter content, dies in year two after the ramp lands,
and never reads a zero month forecast. It is the test that keeps "no
set-up holds forever" true as content is added under it.

**What this asks of the sub-projects around it.** 3's siting and cellar
decide what a camp leaves behind; 5's permanent damage is a ramp; 6's
regrowth clocks are the decay clocks with the sign flipped; B's forecast
is how the ramp is measured; the save (`src/sim/save.ts`) stops being a
save of the person and becomes a save of the world with a person in it.

## Rules that hold across all eight

- Every quantity stays real: litres, kilocalories, degrees, minutes,
  kilometres, metres of visibility, cubic metres a second, centimetres of
  ice. No abstract points.
- Every new threat has a warning the player can read in the log before it
  kills, and a death cause that names it.
- Intents never plan around a new threat on the player's behalf; they carry
  it out and report. The player prepares, or does not.
- Each sub-project ships with the browser pass that shows a run through
  its new danger, not only its tests.
- Every death is the end of a survivor, never of the world. Nothing a
  sub-project adds may make a set-up hold forever, and nothing may carry
  power from one survivor to the next.
- A sub-project that adds truth and no reason to come back waits behind
  one that does.
