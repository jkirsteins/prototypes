# Survidle: the survival edge, a roadmap

Survidle should be as hard as the north is. Being away must be riskier than
playing by hand, never safer: the intent runner carries out what you asked
and adds no safety nets. What makes it hard in real life applies here too.
The hardness is a means. The goal, stated in the next section, is that
players come back: to the tab several times a day, and to the game after
every death. This roadmap names the work in eight sub-projects, each with
its own spec, plan and build, in the order they should land, and the
lettered items under "The idle loop" that make it a game people return
to, and, last, the content that waits on the gate. Each spec lives beside
this file as
`2026-MM-DD-survidle-<name>-design.md`.

## What we are optimising for

Survidle is a premium game for a niche: the idle and survival corner of
Steam where Melvor Idle, Wayward and UnReal World live, at ten to fifteen
dollars, with the browser build as its demo. Free-to-play sells a number
that never goes down, and this design bans every lever that model pulls:
no time skips, no boosts, no shop, no second slot. A premium buyer expects
permadeath, a finite arc and a game that ends, and that is what this is.

This prototype has one job: to show the game has legs and pull before a
proper game is built on it. Presentation and marketing wait on that. Both
can be added later, and neither can save a loop that does not hold.

**The target is thirty calendar days of content**: a player still opening
the tab on the thirtieth real day with something new to do. In game time
that is about five years of the sim, four to six survivors, the lineage
tree filled, one full year held, and the first step north. Thirty is the
smallest window in which every loop the game has runs several times, so a
player still there is showing pull and not novelty. Seven days is one run
and proves only the check-in loop; sixty needs the content sub-projects,
which is the proper game.

The gate is measured, not felt: twenty to fifty testers who opt in from
the incremental community, an anonymous beacon on each open so the
numbers exist, and these bars.

| measure | bar | why |
|---|---|---|
| re-run rate | two thirds start a new survivor within a day of a first death; half after a death that ended a run past 100 game days | the survivor loop is the unproven bet; if this is low nothing else matters |
| the first run | a tester completes a first death and starts again inside two hours of attention | the Steam refund window |
| would they pay | two thirds say yes to ten dollars after a week | the one question that maps to revenue |
| hours of attention | a median of ten or more among testers past day 1 | the arc a premium price needs |
| day 30 | a tenth still opening the tab | a bonus, not a gate |
| stories | testers tell survivor stories unprompted | the marketing, when it comes, is these |

Nothing is scoped for the proper game. This roadmap states the target and
sequences the work for the most impact per build toward it; nothing stops
the work going further if it is fun. Once the gate is passed, the proper
game targets a longer window from the same tree.

Every item below is judged by one question: does it give a player a
reason to open the tab again, or to start again after a death? Realism is
how the game earns that, not the aim in itself; a sub-project that adds
truth and no reason to return waits behind one that does.

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
  saw stays in the world for the next one, and the lineage grows. A
  longer life is the score and the achievement; the world remembering it
  is the reason to start again. This is item F below.

The contract is Don't Starve's and The Long Dark's, not Melvor Idle's.
Melvor's number never goes down and its player never loses, and that is
the opposite of the feeling wanted here: punishing, with a sense of
accomplishment as runs grow longer, and never a set-up that holds
forever. Loop Hero is the nearest structural match: an expedition ends,
what came home builds the camp, the camp persists. What Survidle keeps
from Melvor is the in-run part, the skill ladder, mastery and pools,
and standing orders. The unproven combination is brutal plus idle:
nobody has shown players accepting death while the tab is closed. A
death that a player accepts is one that happened in their care and not
to their account, and that is I's job: the survivor is a person the
player chose, left alone and kept. That
is why B is not optional, why every away death has to be one the
forecast showed, and why the re-run rate is the first bar above.
Punishing is the aim; unfair is the failure mode.

Calibration targets for the sim, to steer by rather than to hit exactly:

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
- The idle curve (`2026-09-04-survidle-idle-curve-design.md`) sets the
  rest of the pacing: automation earned per skill inside the first
  session, a safe-away horizon that grows from an hour to the away cap as
  rungs and producers land, each survivor dying of the next ramp out (the
  basics under day 20, the axe or the first cold snap by first frost,
  winter by day 245, the second winter after a full year), and a skill
  wall that the tree moves so a run that survives still stalls.


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

## What the north yields: the calibration tables

The reference player (the baseline's harness, `npm run reference`) is
the instrument; these are the bands it is measured against. They are
order-of-magnitude estimates for a lone person, gross kcal a day
averaged over a week or two, not measured Nordic figures, and they are
the author's rulings on what the game should give. Skill is the wide
axis: on hunting and on knowing where fish are, an expert is five to ten
times a beginner, not a percent a level.

April, inland boreal forest:

| source | beginner | experienced local |
|---|---|---|
| plants, roots, overwintered food | 0 to 150 | 100 to 400 |
| hook, line, spear fishing | 0 to 400 | 300 to 1,200 |
| passive fishing: nets, traps | 0 to 500 | 800 to 2,500 |
| small-game traps | 0 to 150 | 200 to 700 |
| active small-game hunting | 0 to 100 | 150 to 600 |
| large game, primitive weapons, averaged over weeks | about 0 | 300 to 1,500 |
| birds, eggs, opportunistic | 0 to 100 | 50 to 300 |
| mixed total | 200 to 800 | 1,500 to 3,500 |

Late August, the same country:

| source | beginner | experienced local |
|---|---|---|
| berries and plants | 300 to 800 | 600 to 1,200 |
| fishing | 200 to 700 | 700 to 1,500 |
| small game, trapping | 0 to 200 | 200 to 700 |
| large game, averaged | about 0 | 300 to 1,500 |
| mixed total | 700 to 1,500 | 2,000 to 4,000 |

Against a burn of 2,500 to 3,500 a day living outside in the cold, a
beginner in April runs a deficit whatever they do; the game's job is to
make that deficit take weeks to kill, not days. What the tables say for
the roadmap, and where each note lands:

- **Exposure decides the first days, food the weeks after.** Fire on the
  first evening and a roof by the second night are the baseline's
  eighth item; the starvation clock of weeks is its section 13. A run
  that dies inside five days now is a bug, not a season.
- **Passive fishing is the prize.** A trap or net at a known spot is the
  one source that reaches a person's whole need, and it works while the
  survivor does something else. That is C's basket trap and 2's weir,
  and it is why C's trap is the first producer on the order below.
- **Hunting is deceptively bad for one person.** A kill is weeks of food
  and the days between are zero; a society shares and stores, a lone
  survivor starves in the gaps. 4 and C keep the bow lumpy and make
  drying and the cellar (3) what turns a kill into weeks.
- **Traps change the economics but hares are lean.** Fat, not protein,
  is the limiting nutrient after winter; D's fat item and E's tallow are
  where that lives, and a hare-only diet should not sustain a body.
- **Berries are three to five times too rich today.** A kilo an hour at
  500 kcal a kilo is 2,000 to 4,000 a day of picking against a beginner
  band of 300 to 800. To be fixed when the late-August gate exists, so
  the fix is measured.
- **The skill ladder is too flat for what skill is worth.** A percent a
  level cannot make the five-to-tenfold expert; C's tiers and the
  recommended-level gates are where the multiplier belongs, above all on
  where to fish and how to stalk.
- **The second gate is late August.** The gap between survivors in F's
  core lands the heir of a spring death in late summer or autumn; a
  from-scratch reference run from late August should reach the first
  snow, and April stays the hard opening a first run dies in.
- **Water is not treated.** Drinking from a lake carries no risk; boiling
  it (hot stones in a bark bucket) is a disease rule for 5.
- **The runner sleeps 6.4 to 9.0 hours a day** in the April reference
  runs: seeds 17 and 19 inside the seven to nine band the calibration
  pass set, seed 42 at its top at 9.0 and seed 79 under it at 6.4. The
  thresholds that put the body to bed set the working day that every
  other number is measured against, and that working day caps the sleep
  in turn: a spent body rests by the fire after ten hours and sleeps at
  nightfall.
- **A kill is a preservation problem before it is food.** Realistic
  storage for game meat: fresh in warm air, hours to a day before it is
  risky; held at 4 C or under, three to five days; cooked or hot-smoked
  but moist, about four days; thoroughly dried, one to two months; salt
  cured and dried, weeks to months; frozen, indefinitely. Drying raw at
  low heat leaves pathogens alive; dryness does the preserving and smoke
  the surface. What the game has and what it lacks:
  - Raw meat and fish keep 36 hours above 0 C and do not age at or
    below it, so April is already the freezer the north is; cooked keeps
    72 hours. Both are a little generous and both are fine.
  - There is no cool tier between "frozen" and "warm": a stack ages the
    same at 2 C as at 20 C. The cellar (3) is that tier, three to five
    days at 4 C, and the raised cache is the frozen one above the snow
    and the animals (4).
  - The rack dries 6 kg in two dry days with no heat. A deer is 15 to 25
    kg and rots in 36 hours, so one kill needs three rack cycles and
    loses most of itself: racks should hold a day's cutting, or a camp
    should build more than one (3). Rack-dried raw meat should carry a
    sickness chance that the smokehouse (3) removes, and dried meat in
    the open should last a month or two, not for ever; F's decay table
    already says a month, and the cellar is where it keeps.
  - Salt does not exist. The coast can make it (sea water reduced over a
    fire with hot stones in a bucket, a day for a handful), and that is a
    coastal camp's reason to exist in 3 or C, not a baseline item.
  - Fat is the first thing to eat and the first thing to lose: the most
    perishable parts go first, then thin slices to the rack and the
    smoke. D's fat item and the hang task already make that a choice the
    log can show.
- **Knowledge is the ancient hunter's real advantage**: which creek has
  fish in April, where animals cross, which lake is still safe. F's
  journal, dim map and trails are that knowledge accruing across
  survivors, and the risk forecast (B) is the modern stand-in for it.

## The eight sub-projects, in order

The numbers below are names, not the sequence; they stay put so specs can
cite them while sections are still being written. The build order is by
impact toward the thirty-day gate, soonest first: what kills an away run
soonest, then what makes the death worth coming back from, then what
makes the next death fair, then what makes the second run a different
game and the lineage grow, then content. So: 1 (built), A standing orders
(built), D species and sound (built), then the baseline (the section of
that name under the idle loop: water at camp, the thirst priority, arrows
in the pack, wet wood, the rack as a task, tool keeps, and a start with a
shore and rock, with the reference player as its gate; built), then the
delegation ladder (the section of that name below: order kinds earned per
skill, jobs at 3, grinds at 5, keeps at 10, with the first horizon
checks; built), then the calibration pass (the section of that name below: the
harness measures each food source against the yield tables, the gates
are set from what it finds, and berries, burn and sleep get their first
honest numbers; built), then the working day and snares on day two (the
paragraph of that name at the end of the calibration pass: a spent body
rests by the fire after ten hours, the reference list sets snares before
it fells a tree, a body at open water drinks before it rests, a waiting
catch brings the runner home by day, and a thirsty runner with an axe
cuts the ice hole it walks to - a bark bucket before the roof was
measured there and rejected, and the deaths after the gate name the trap
and the water storage as the next food and water items, in their slot;
built), then F's core (the world saved instead of the person, the life
record and the journal read from it with its daily forecast field, the
epitaph and the cemetery, the dim map, the season spine, first decay,
the gap between survivors that sets the heir's month, and the heir set
down near the old camp; not its ramp; built), then the first producers and
stocks (C's reading water and basket trap, then 3's turf hut, then 3's
water store, pulled out of their items, in that order because the heirs
die of food before any snow falls and cold sits under band until it does;
built), then the burn side (the paragraph of that name in the
calibration pass: the gate's food clause reads the week's intake, and
two working-day rules were measured and withdrawn; measured), then B the
risk forecast with the away cap as its horizon (built: the Ahead panel,
four horizons of ten runs each in a worker, the dial on the run, the
month number into the life record), then the testing infra (the section
of that name below: the beacon on by default, the survey and the bars
read from them), then
the UI pass (the section of that name below: the Do panel folds and
filters, the kind chosen per row instead of a mode, columns that scroll
inside themselves, the phone layout, and the guidelines page the browser
pass checks from then on), then
3's siting (camp as a chosen cell, pulled out of 3 the way
the hut and the trough were), then the first half of I the survivor
(the section of that name below: the away report in third person by
name, three candidates per boat, the four body axes and the first
quirks, the card and the face), then the first tester round: with B,
siting and a survivor the tester chose in, the set the hybrid's bet
needs exists (a death that persists,
a producer, a camp that holds and was chosen, orders, a forecast that
makes away risk legible, a person to lose), so twenty testers go in there, as a kill-or-continue check of the hybrid and
not the commercial gate, before any content deepens a loop that has not
earned it; then the save sync if the round asks for it (the section of
that name below: a code on the settings panel and the two-device rule),
and the south if the round's first deaths are not followed by a restart
(the section of that name below: the landing month first, then the map
extended south);
then the second half of I (the found places, and the card reading the
earned traits as their items land);
then the rest of F in impact order (latitude by row with the
landing moving north, the goals list, the Lineage tree with the chosen
landing month as an Arrival node, and the death site with the corpse
run and its search order), then E hides and clothing, then the rest of
3 camp (the rest of the shelter ladder, the buildings with the
cellar first) with the rest of C alongside and F's trails and the
cellar's keep, then 4 animals, 5 injury
and the body model, 7 wind with 1's fog beside it, 8 forest fire, and 6
territory last. F's ramp is not one slot: its parts land inside C (the
tool tiers that make the arrival axe the best one), 5 (permanent damage),
4 and 6 (depletion and fed wolves), each when its sub-project does, and
the reference player says when the ramp is enough. The first of those
arrived unbidden with the producers: an heir inherits a shore its
ancestor and its ancestor's trap fished for six weeks, and the fish row
reads under band on every heir where it read in band for the ancestor. 2 rivers is flavour
and has no slot: it lands whenever there is room after 3, and when it
does it plugs into the water features 1, C and 3 own rather than bringing
its own. A capability is promoted in this order when the one before it
made its bottleneck the measured cause of death, never because its
dependency graph is elegant (the idle curve's rhythm, its section 3):
the smokehouse is the first named cross-skill project on the spine and
still waits behind the producers until the trap has made spoilage the
limit.
G music and H the mind have no slot before the gate: H is the first
content after it and G lands with H, since alone music moves nothing.
The edge of the world, the last section before the rules, is not an item.

Why the baseline is first: headless runs of A's runner (2026-09-03, seeds
17, 19, 42 and 79, 250 game days, a kitted camp with keeps for wood,
fire, meat and fish) died of thirst between day 3 and day 23 in every
set-up, and with water and fire supplied by hand they starved between day
67 and day 86 when the axe, spear and bow wore out with nothing to
replace them. No run reached winter, so nothing that only matters in
winter can be the next thing built. The baseline is what lets a camp hold
a week.

Why F's core comes before B: a first run dies inside 20 days by design,
so death is the first thing a returning player meets, and today it is a
deletion. F's core is the smaller build (a save shape, a log the game
already writes, a fog level, a decay table, a landing) and it turns that
death into a chapter. B is the larger and riskier build (a worker running the real
sim several times over) and its calibration wants the reference player,
which lands with the baseline, already in place. B is still what makes an
away death fair, which is why it comes before any content.

Why the first producers come before B and before the rest of F: the
working day's measurement has every April seed starving on days 40 to
48 and the kitted run dying of hunger and thirst by day 49, so the
survivor ladder's row 2, the axe or the first cold snap at day 60 to
150, is a row nobody can reach. A forecast calibrated against that
world always reads "starved, day 45", and goals and a tree tuned against
runs that never see first frost are tuned against the wrong game. The
trap, the water storage and the turf hut are each a table row and one
rate or rule, and the death the trap can cause while the player is away
is November ice, months past where any run ends today. Inside the slot
the trap goes first and the hut second: F's heirs, walking home, starve
in September with cold under band, so the trap is what moves the heir
gate and the hut is what carries the survivor past it into the snow.
The trough is third; no heir was thirsty. The rest of F still comes
before the cellar and the shelter ladder's other rungs: the
latitude is what makes the second run a different game from the first,
the goals and the tree are what the second run is for, and the corpse
run is what a death leaves reachable.

Why the testing infra is an item and sits after B: the gate table is
measured, not felt, and every one of its bars needs the numbers to exist
from the round's first day, so the beacon cannot be built during the
round. It depends on nothing in the sim, since every event it sends is
already in the life record, and it goes after B only so the forecast's
month number is a field from the start. It was deferred out of the
roadmap on 2026-09-04 as infra rather than game; with the round now a
slot two items away it needs its own.

Why the UI pass is before the round and the sync after it: the round
measures the check-in loop, and a check-in is reading and one tap, which
is the part of the game a phone fits best; half the incremental
community opens a link on a phone, and a page that does not fit is a
tester lost before the first death. On the desktop the Do panel has
sixty to seventy rows in one column and the log sits a screen and a half
down, so a tester who knows what they want cannot find it, and the
order strip can shut every row on the panel. None of that is the bet;
all of it stands between a tester and the bet. The sync is different: a
save that follows the player needs a two-device rule, and whether
testers want it is a finding the round produces for free when it is
recruited as single-device.

Why siting comes before the tester round and not in 3's slot: the
promotion rule above is written for rungs the player earns, and siting
is not a rung, it is the decision the run is spent living with, which
the section under 3 calls the most idle-shaped addition here. Measured
by deaths it never moves, since the baseline's start filter already
gives every camp a shore and an outcrop, so under the rule it would sit
behind E and the rest of F for as long as thirst and hunger lead the
ledger. But the tester round is a kill-or-continue check of the bet,
and testers who never chose where to settle cannot answer it; a kill
from that round would be ambiguous. The cost also grows with every slot
that passes: the camp cell is read in twenty files today, and the
corpse run, the goals and the trails would each bind to it before 3's
turn came. B stays ahead of it, because the forecast is what makes an
away death fair and that is the premise being tested. The rest of 3,
the ladder's other rungs and the buildings, keeps its slot.

Why D landed whole and early: the species half because the roster is
what the orders hunt, and the sound half beside it because the cue sink
reads the same roster. Nothing later waits on sound; 7's thunder and 8's
crackle are cues its engine already takes.

Why E and 3 come after: E comes straight after the producers because D's
fur and fat are its inputs and because 5 (insects, burns on bare skin), 7
(wind through a coat) and C (clothing tiers worth the level) all reach
for a clothing model that 1 left thin. Fire comes after 5 because its
burns are wounds in that model and after 7 because it cannot spread
without wind; it comes before 6 because the burn's regrowth clock is the
first of the regrowth clocks Territory generalises.

### 1. Body and elements

**Curve.** Survivor row 1: thirst, cold and hunger are what a first
survivor dies of under day 20, and this item owns them. No tier and no
horizon band of its own; its fog lands with 7 and belongs to row 3's
winter. Expected: a tester's first death inside 20 game days with one of
the three as its cause, read from the beacon.

Specced and in build: `2026-09-03-survidle-body-and-elements-design.md`.
That spec holds water, ice, wet clothing and frostbite, wet wood, smoke,
storms and exhaustion. Fog, described below, is not in it: it lands
beside 7, whose wind is the missing half of its dissipation rule, and a
shore or a region edge is what you follow out of it until 2 adds a river
bank. Seeing through it and getting lost in it stay with 6.

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

**Curve.** No row, no band, no tier: flavour. Expected to move nothing,
which is why it has no slot. The salmon run, when it lands, is a fishing
tier at 15 under C's methods.

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

**Curve.** Horizon rows 4 and 5: the shelter ladder and the buildings
are what let the heir's camp hold ten to twenty days, and the cellar and
the water storage are two of the three producers that take it to the away
cap. Survivor rows 2 and 3: a roof is "winter under a roof". Tiers:
building 3 and 5 for the shelter ladder's new rungs, 10 for the cabin as
now, 15 for the cellar. Expected: a cabin-and-cellar heir holds ten to
twenty game days; a stocked cellar camp reaches the away cap.

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

| rung | build | gives | what it enables | costs it back | where it stands |
|---|---|---|---|---|---|
| snow shelter | 2 h, no materials, deep snow | about 0 C inside, out of the wind | a night on the fell in January; nothing else | melts in a thaw; winter only | wherever 7's drifts put deep snow |
| lean-to | as today: 4 h, 8 sticks, 4 logs, 2 cordage | +5, halves wetting | a fire in front, drying, sleep, a little stock under the overhang | open front; no fire inside, so nothing smokes | anywhere |
| rock shelter | nothing; the site gives it | the lean-to's roof and wind wall, no snow load, no fire spread from bare rock | what the lean-to enables, for a walk instead of a build | cold rock, so no more than a lean-to's warmth; smoke pools under the overhang by the closed-cabin rule; a bear den in winter (4) | fell edge and boulder field cells the world generates |
| turf hut | 2 days: poles, 20 sticks, birch bark or bog turf for the roof | +10, blocks rain, a hearth with a smoke hole so a fire inside is legal | fire inside, so E's smoking has its roof; clothing dries by the hearth; a first winter | the roof rots in a year or two and is re-turfed; heavy in bark, light in logs | where bark or turf is within reach |
| dug-out | 30 h: 12 logs for the roof, turf over, and a digging tool, an elk's shoulder blade from D's bone yield | +12, and the earth holds it near 0 C unheated, so a winter costs a third of a cabin's firewood | a cool store before the cellar exists, and hours the runner does not spend on firewood | damp: bedding and hide inside wear as if in rain, so nothing dries here; floods on flat ground, so a dry slope or nothing | a slope that is neither rock nor bog |
| cabin | as today: 60 h, 40 logs, 12 stone, 8 cordage | +15, blocks everything; the hearth, storehouse and cellar attach here | the storehouse, the cellar, the smokehouse, a shelf that keeps instruments dry, and the long orders a camp that stands can hold | the cost | forest within haul |
| hide tent | E's hides, 6 of them sewn, and poles cut on site | +8 with a hearth inside; 15 kg in the pack | a camp that walks: the multi-day hunt, the second camp, the push north | wears like clothing; poles are cut fresh each pitch | walks with you; it is the shelter 6's moving camp needs and a multi-day hunt uses before that |

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
they can fail under, water storage. The woodshed comes with the rule it
exists for: wood gets wet by lying in the rain, not by being split in
it. Today a log split in rain, or within six hours of it, comes out wet
unless the camp has a roof, which gives the right day-to-day result and
the wrong story. The honest model is a firewood pile that takes on water
in rain at a camp with no cover and dries in sun, wind or by the fire,
with a roof (the lean-to's overhang, then the woodshed) keeping the pile
dry, and splitting allowed anywhere in any weather since a soaked log is
dry inside. The split-in-rain rule and its roof exception go when that
lands. Every building is an answer to a
threat from 1, 4, 7 or 8, and its cost is tuned against that threat.
Water storage and the cellar are the two that answer what A's build
measured, and they come first.

### 4. Animals as agents

**Curve.** Survivor rows 3 and 4: predators at the rack and a hunted-out
haul are two of winter's killers, and fed wolves are part of the second
winter. Tiers: hunting by species at 5, 10 and 15 from D's roster, the
bear den at its recommended level. Expected: with 4, 5 and 6 in, the
reference player at full Lineage dies in its second year; unguarded meat
at the rack is a horizon drop the forecast shows.

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

**Curve.** Survivor row 4: permanent damage is the second winter's
ramp, a body slower each year. Insect season shortens a July horizon
without smoke and clothing. No tier. Expected: an heir at full Lineage
still dies in year two, and no set-up reads a zero month forecast after
its first winter.

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

**The mind.** Is H's, under the idle loop: named conditions in this
body panel, a hidden sum, and G's music as a remedy. Loneliness was first
written here as a course the panel never showed; H shows it, because a
hidden multiplier on mistakes is a threat with no warning.

**Insects.** June to August, bog and shore cells carry a mosquito load by
warmth and wind; working there without smoke or a hood costs energy and
sleep and raises the itch that turns into scratched, infected skin;
smoke from a smudge fire at camp clears the camp; ticks in tall grass on
the heath seed a fever course a week later. This is why camp on a windy
shore beats camp in the bog.

**What this sub-project explicitly does not do.** No pain bar, and no
morale bar in H's sense either, since the mind is conditions and a
number the panel never draws; no permanent stats beyond the loss table;
no medicine the north did not have. The player learns the body from the
body panel, which shows each
part with its wounds, their age and care, and from the log, which says
what a wound needs before it says what it took.

### 6. Territory

**Curve.** Survivor rows 3 and 4: the cut-out and hunted-out haul is
winter's third killer and the year-two ramp, and the moving camp is row
4's step north. Horizon: depletion is what keeps the producers row a
ceiling, since a camp that holds sixty days empties its haul. No tier.
Expected: a stationary two-year camp's month number falls under the
regrowth clocks. Last in the order because every other ramp must exist
first.

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

**Curve.** Survivor row 3: the cold snap and the dark with wind through
a coat are winter's, and the felt temperature is the number. No tier of
its own; E's coat grades read it. Expected: the winter reference set-up's
horizon drops under a gale without a windbreak and holds with one.

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
- Sound: the cue system and buses are built; they gain `thunder` and
  `gust` cues. Thunder is a one-shot on the
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

**Curve.** Horizon rows 2 to 5: a fire that walks off camp ends a set-up
at any stage, so it is a ceiling on every band from the first grind on,
as the camp fire's spread rule already is. Survivor row 2 in a dry July.
No tier. Expected: the month number reads the dry-day count, and no camp
is lost to a banked fire.

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

**Curve.** The horizon curve runs on it: a job is the first rung, a
grind the crude one, a keep the manager, and the ladder decides when each
is earned. Expected: the bands in the delegation ladder section.

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

The delegation ladder (the section of that name below) decides which of
the three kinds a skill's orders may take: none below level 3, jobs from
3, grinds from 5, keeps from 10, per skill, with the intent layer as the
manual phase under them. The list is otherwise as built.

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

**Curve.** Horizon row 4's floor: water at camp, the rack, the tool
keeps and arrows are what a set-up needs to hold a week at all. Survivor
row 2: the competent set-up at no Lineage dies of the axe by first frost.
Expected: the April gate, 21 days for now, with the reference player
alive on it at no Lineage.

Built: `2026-09-03-survidle-baseline-design.md`, plan
`2026-09-03-survidle-baseline.md`. Seven fixes to rules
that already exist, in the order they killed the headless runs of A's
runner. None is a new system; each is a stock, a
priority or a keep the loop needs before any content lands on it. They
get one spec between them, and F's reference player is that spec's gate:
the scripted set-up on four seeds is what found these seven, its harness
lived only in a session scratchpad, and it is rebuilt here as a script in
the tree so that "reaches 1 December on four seeds" is a command, not a
memory.

- **Water at camp.** A shore ices over from 2 cm and snow is gone on
  many April days, so a region has days with no water at all; the fire
  goes out when no one is at camp, since auto-feed is camp-only; and the
  thirsty need never lights a fire to melt snow, only uses one already
  lit. An ice hole at the shore, a water stock at camp that a keep can
  hold ("keep camp at 6 litres", the trough or filled bucket that 3's
  storage grows into; the spec fixes the minimal stock so 3 extends it
  rather than rewriting it), and a thirsty step that lights the fire the
  way the cold step does.
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

### The delegation ladder

**Curve.** Section 2 of the curve spec whole: jobs at 3, grinds at 5,
keeps at 10, and horizon rows 1 to 3. Expected: the from-scratch reference
player alive on the April gate playing by hand, and the three bands,
provisional until the pass. Measured: 2 of 4, and eleven of twelve rows
over their bands, both in the paragraph at the end of the section.

Built: `2026-09-04-survidle-idle-curve-design.md` (sections 2 and 3),
plan `2026-09-04-survidle-ladder.md`. Right after the baseline, before
the calibration pass, so the pass measures a beginner whose opening is
final. Automation is earned per skill, the way the genre earns it: a once
job, one unit of work per click, is the manual rung and is never gated;
jobs with a count or a target come at 3 (about a working day), grinds at 5 (about an hour of real
time at the skill), keeps at 10 (about five hours, near a first death).
The level curve and the recommended levels do not move; the gates are set
per rung. The orders form greys a kind the skill has not earned and says
which level earns it. A task that maps to no skill names its gate skill
(`haul` follows woodcraft), asserted the way card coverage is. The
reference player's beginner gains an opening of intents for the first day
and adds each kind the day its gate opens, so the April gate measures a
player who can exist. When F's carry lands, carried hours give the level
and the level gives the rung, with no separate unlock node.

With it land the first three checks of the horizon curve: a scripted
set-up at each stage (manual only; jobs and grinds; keeps) run forward on
four seeds, and the day of the first death read as how long the camp
holds. The bands are nothing, one to two game days, three to five; the
heir with carried keeps and the baseline should hold ten to twenty, and
the producers up to the away cap, each checked when it lands. The three
that land here are provisional until the calibration pass moves the
numbers they are measured in, and are re-run then. The
horizon is the check-in interval, and it is what "increasingly idle"
means here: the camp holds longer, and the ramp still ends it.

`npm run reference` runs the from-scratch player through the hourly
script on four seeds and passes 2 of 4 on the April gate. Seed 17 and
seed 19 reach day 21 and die of starvation on day 24; seed 42 dies of
wolves on day 3; seed 79 dies of thirst on day 2. Before the ladder,
giving every order on day one passed all four seeds, dying of starvation
on day 22 or 23. The two early deaths trace to the once jobs: a once job
is a single trip and drops off the list, so the by-hand player walks
about twice the minutes of the old scheduler in the first two days, which
pushes the first lit fire 12 to 24 hours later, and with no vessel and no
fire in reach when the shore ices over on day 2 there is nothing left to
drink. Seed 42's wolves are a dehydration death: water hits zero at day 2
12h, sleep outranks thirst overnight, health falls from 78 to 21 and
never climbs past 11, and wolves take the last 11 points at camp on the
night of day 3. `npm run horizon` runs the same four seeds through the
three stages on a stocked camp with no player: manual holds 1 to 5 days,
freezing or thirst; jobs and grinds hold 4 to 6 days, thirst or freezing;
keeps hold 6 to 13 days, thirst on every seed. Eleven of the twelve rows
sit over their provisional band; only manual on seed 42 lands inside it.
That gap is the calibration pass's material, and the bands stay as
written until the pass moves the numbers they are measured in. Re-run
after the calibration pass: see the pass's section.

### The calibration pass

**Curve.** The pass is what makes every band honest: the horizon bands
and the survivor rows are in kcal and days the sim produces, and a burn
of 4,000 against 3,000 moves all of them. No row or tier of its own.
Expected: the ladder's horizon checks re-run after the numbers move and
land in their bands, and the gates reset as this section says. Measured:
2 of twelve horizon rows in their bands, and 0 of 4 on each of the three
gates, in the paragraphs at the end of the section.

Built: `2026-09-04-survidle-calibration-pass-design.md`, plan
`2026-09-04-survidle-calibration-pass.md`. Immediately after the
delegation ladder, before F, so it measures the beginner once, with the
by-hand opening in place. The baseline's harness runs a beginner's April
on four seeds with fire, a roof and water in hand. Its gate is day 26,
derived from the tables' deficit rather than from the harness's own
measurement, with a food clause on top; the runs against it read 0 of 4,
seed by seed in the standings at the end of this section. This pass turns
the tables in "What the north yields" into the game's numbers, measured:

- **Measure per source.** The reference report gains, per seed, kcal a
  day from each source over the run (fish, snares, hunts, berries and
  plants, the arrival kit) and the day's burn, so each row of the April
  table has a game number beside it. The bands are the target; a source
  outside its beginner band is a finding.
- **Burn.** The runner burns over the 2,500 to 3,500 band in April, with
  the cold multiplier on top. Decide whether the activity rates, the cold
  multiplier or the hours worked are what puts it there, and move one.
  The lever the rule picked was the walk rate; where each bucket sits
  after it, and after the sleep budget moved the working day, is in the
  measured paragraphs at the end of this section.
- **Sleep.** Six to twelve hours a day, two twelve-hour days in the
  first three. The energy thresholds that put the runner to bed at "you
  can barely lift your arms" get their first look here, since they set
  the working day every other number is measured against.
- **Berries.** Three to five times the beginner band; halve the picking
  yield or the kcal, measured on a July run of the harness (`?seed=`
  with the clock advanced, or the landing month once F gives it).
- **The gates.** After the numbers move, set the April from-scratch gate
  where a beginner with fire, roof and water lands in the tables (three
  weeks or more), keep 30 days for the kitted run until C's trap, and
  write the late-August gate down to be run when F's core sets the gap
  between survivors, since the gap is what lands an heir in August. Add a food-at-checkpoint clause too - kcal above zero, or a
  floor on food at camp - so the gate measures the loop the list runs
  rather than the fat reserve alone.
- **The fuel keep, and the trip.** "Keep the fire lit" is a keep on a
  flag because lighting makes nothing the pile can count; the honest
  order is "keep the fire at N kg", a keep on the fuel itself, whose task
  is light when the fire is out and feed when it is low, so the player
  chooses how big a fire to hold and pays its burn rate. What it asks of
  the runner is judgement, not a safety net: leaving camp for a trip
  longer than the fire will last, it banks the fire first, coals covered
  to burn low and long, which is what keeps the spread rule honest (a
  big fire left alone on dry ground walks off camp) and what a person
  does; far from camp and delayed, it lets the fire go out rather than
  rush back, since nobody walks three kilometres home to feed a fire;
  home again, it relights from the embers in minutes if any are left and
  from the drill if not. The order's row says which of those it is doing.
  This lands with the pass because its cost is hours of work the gate
  measures.
- **Not in this pass:** yields that need new content (the trap, the
  skill tiers, the cellar) stay with C and 3; the pass only moves numbers
  the game already has.

Measured, before any number moved, the April week before day 21 averaged
over the four seeds 17, 19, 42 and 79 (the last two die first, so theirs
is the week before the death): base 1,470, work 2,342 (activity 1,016,
walk 1,327), cold 120, 3,932 a day, 10.8 hours at work and 9.2 asleep.
The lever by the rule in the spec's section 3.2 was work, and inside it
the walk half, the larger of the two: `WALK_KCAL_PER_HOUR`, 300 kcal an
hour before and 200 after. 200 is the rule's floor; the arithmetic that
would land activity plus walk on 1,200 asked for 40, and the floor caught
it, because below 200 a walk would cost less than standing work. After
it the same week reads base 1,470, work 1,772 (activity 1,015, walk 757),
cold 85, 3,327 a day. The day is inside its 2,500 to 3,500 band, where it
was 432 over the top of it, and work sits 72 kcal above the 1,700 top of
its share, down from 642: the floor is what holds it there and not the
rounding, so what remains of the excess is activity's and the working
day's, which the sleep budget sets. Cold fell with it to 85, just under
the 100 floor of its share, since the cold increment is a share of the
burn it sits on and the walk half of that burn is what moved.

With the budget balanced (a task at 7 energy an hour, sleep capped at
nine) the same week reads base 1,680, work 2,260 (activity 1,296, walk
964), cold 202, 4,141 a day, 13.0 hours at work and 8.7 asleep; work
sits 560 over its share, cold in its share. Three of the four seeds
reach day 21 now, not the two of the first measurement - seed 42 crosses
over as well - and on those three, activity 1,425 outweighs walk 862, so
the survivors' weeks would have named the activity rates; walk stands
because a walk at three kilometres an hour is 200 to 250 kcal an hour by
the MET tables while chopping at 400 and gathering at 200 already sit at
theirs.

The sleep budget holds where the April gate is measured: the runner
sleeps 8.2 to 9.6 hours a day there, seed 19 at 8.2 and seed 42 at 8.9
inside the seven to nine band, seed 79 at 9.4 and seed 17 at 9.6 just
over it, and no week over ten remains. That seeds 42 and 79 are measured
at the gate at all is the balanced budget's doing: it ended the day-3
wolves and the day-2 thirst that took them in the opening, both
dehydration deaths, and they reach days 25 and 16 now. So the ladder's
expectation that at most 2 of 4 pass until the opening changes no longer
holds, and what the gate's 0 of 4 is measuring is the food clause. What
still averages over ten is the kitted and the late-August runs - the
kitted seed 19 at 10.4, and every late-August seed between 9.6 and 10.4
- and none of it is a night over nine, because the cap is on the sleep
option and the collapse takes that same option. A week over ten is more
than one sleep a day; the browser pass showed the pair back to back,
"Too tired to stand, you sleep where you are." and then the queued
Sleep.

Opened on 20 July, the berries row reads 750 to 2,025 kcal a day against
the late-August plants band of 300 to 800 for a beginner: seed 79 at 750
is in band, seed 42 at 1,140 and seed 17 at 2,025 are over, and seed 19
outlived the run to day 61 with no first snow to be measured at. Those
are the ledger's gross picked yield, kilos times 500, credited when the
berry goes in the basket rather than when it goes down, so the yield side
is not halved by the gut. What the gut takes is less: a day on berries
alone is 1,500 kcal, the first two kilos at 500 a kilo and the next two
at half credit, past which the body will not take another - the ceiling
doing what the tables say a berry season is worth for one person. So seed
17's 2,025 is a picker filling the basket to about four kilos a day,
right at the refusal, and absorbing 1,500 of it; the finding is that the
ceiling and the table's 800 top, 1.6 kg picked, do not agree about what a
day of picking is worth. In the browser on seed 17 the run opens "20 Jul.
You wake at Hareskog ...", the Do panel offers "Pick berries ... 0.7 kg
berries, mid-July to mid-October" ungreyed, an hour of it puts 0.7 kg in
the pack with "eat 0.2 kg berries +100 kcal" beside it, and eating on
past two kilos logs "Your stomach is turning." once while past four greys
the button to "not another berry today" and logs "You cannot face another
berry."

`npm run reference` measures the April gate at day 26 with the food
clause and passes 0 of 4: seed 17 starved on day 22, seed 19 starved on
day 26, seed 42 starved on day 25, seed 79 froze on day 16. The kitted
run passes 0 of 4 at 30 days: seed 17 to thirst on day 22, seed 19
starved on day 31, seed 42 starved on day 27, seed 79 froze on day 13.
From 24 August only seed 19 lived to see a first snow, on day 24, and
starved on day 33; the other three died before one fell, on days 19, 31
and 50, so 0 of 4 were alive and fed for it. Seven of those twelve deaths
are starvation, four are cold and one is thirst, which says the deficit
the gates are catching is food. Nothing was tuned to move them.

`npm run horizon` after the pass: manual holds 3 to 5 days, jobs and
grinds 3 to 7, keeps 4 to 11; 2 of twelve rows sit in their band - keeps
on seed 17 at 4 days and seed 42 at 5, against 3 to 5 - and what ends
them is thirst on seven rows and cold on five. Ten rows sit over their
band where eleven did before, so a stocked camp with nobody in it still
outlives what the ladder asks of it at every stage. The bands did not
move.

Pulled forward after the pass: the working day and snares on day two
(`2026-09-04-survidle-working-day-design.md`), with three fixes the first
measurement's deaths named, built beside it: water before rest, the snare
chore, and an ice hole cut inside the thirst chain. The spec's primary
list order was measured and rejected - it froze three of the four seeds
by day five, because it left the roof behind the knife and the snares -
so the fallback order stands: the knife after the lean-to, the snares
right after the knife, the fish keep after the cook keeps. A second
reordering, the knife and a bark bucket before the roof, was measured and
rejected the same way: both orders froze two seeds, and the roof by night
two is what the opening cannot spare.

The four diagnoses and what each got. A rested body wakes with the dawn:
the sticky sleep need held one in bed all morning - one seed lay from
06:41 to 13:20 at full energy and went to wolves on day four - so the
need holds only through the night, or while energy is under 60. A spent
body drinks its fill before it sits: at open water it drinks before it
rests, a rested body that is thirsty at nightfall drinks first, and a
sleep set aside for the fire clears the sticky need. A catch in the
snares brings the runner back by day when the heath is in reach, so the
catch is the runner's and not the fox's. And a thirsty runner with an axe
cuts the ice hole it walks to, so the thirst chain reaches water nobody
has opened yet.

`npm run reference` at the April gate, day 26 with the food clause,
passes 4 of 4. Seed 17 stands fed at health 97 with 3,600 kcal of food at
camp, seed 19 fed at health 80 on 1,478 kcal in hand with an empty camp,
seed 42 fed at health 100 with 1,800 kcal at camp, and seed 79 fed at
health 100 on 1,946 kcal in hand with an empty camp. No seed dies of cold
or thirst at all: all four starve, on days 48, 43, 40 and 40.

The gate week, averaged over the four seeds: base 1,680, work 1,846
(activity 1,206, walk 640), cold 57, 3,584 a day, 9.6 hours at work and
7.8 asleep. Base sits in its share on every seed, and cold is under its
share on three seeds and in band on seed 19 at 105; work is over its
share on all four; the day is over the 2,500 to 3,500 band on three
seeds and inside it on seed 79 at 3,421. Sleep reads 6.4 to 9.0
hours, seeds 17 and 19 inside the seven to nine band, seed 79 under it at
6.4 and seed 42 over it at 9.0.

The yields per source over that week: snares 1,864 kcal a day averaged,
1,543 to 2,571 and over the April band on every seed, which is the food
the gate now passes on; fish 193 averaged, in band on three seeds and
over it on seed 19 at 429; hunts, berries and the arrival kit read 0 on
every seed, inside their bands. Eaten 2,068 a day against the 3,584
burnt, so the fat reserve is still paying the difference.

The kitted run at 30 days passes 1 of 4: seed 42 stands alive and fed
with 1,710 kcal in hand and 2,700 at camp and starves on day 49, seed 17
stands unfed with an empty camp and starves on day 42, seed 19 the same
and starves on day 46, and seed 79 stands unfed and dies of thirst on day
47 with no water in hand. A finding the kitted camp carries, older than
this step: the bark bucket splits in the first frost (the roll is in
`hazards.ts`, against `FREEZE_C`, -5, in `water.ts`) and the replacement
never gets its cordage, which the higher-ranked consumers - the fire
drill, the snare, the bow and its arrows - have already claimed.

`npm run horizon`: 0 of twelve rows sit in their band, and every row
holds longer than its band asks. Manual holds 5 to 7 days against 0 to 2,
jobs and grinds 5 to 22 against 1 to 2, and keeps 15 days to past 30
against 3 to 5, keeps on seed 42 being alive when the run ends. What ends
the other eleven is cold on eight rows and thirst on three, where the
pass read thirst on seven and cold on five: the ice hole the thirst chain
now cuts turned thirst endings into cold ones. So a stocked camp with
nobody in it still outlives the ladder's ask at every stage.
The bands did not move.

The stop rule's reading: April is green on the food clause, 4 of 4 where
it read 0 of 4 through the pass, and nothing ends a run before the gate
day now, so F core is next; the survivors starve on days 40 to 48 and the
horizon rows end in cold and thirst, which is what the trap and the water
storage answer in their slot.

Measured again with the producers in (the F row carries the runs): the
gap both gates die of is on the burn side. Work burn reads over its band
on every seed and every heir, before the producers and after them: 1,800
to 2,200 kcal a day, of which 500 to 1,000 is walking, three hours a day
on the paths between camp, the shore, the heath and the forest, because
the runner works its ten hours whatever food it holds. A body doing that
needs 3,500 to 4,000 a day, and no April shore and five snares provide
it; the producers add a few hundred to a gap of two thousand. The next
calibration change is therefore not a food row: a runner that rests once
the day's food is in hand, or a working day that shortens on an empty
reserve, measured on both gates before any producer is tuned. And the
gate's food clause misreads a body in deficit: seed 19 read unfed at day
26 while eating 2,971 kcal a day, because the clause is a 04:00 snapshot
of the reserve, which sits at zero whenever intake is under burn however
much is eaten. The clause should read the week's intake against its burn,
or the fat's trend, not the reserve at an instant.

Measured with the burn side (spec
`2026-09-05-survidle-burn-side-design.md`): what was built is the
gate's food clause reading the week before a checkpoint, fed when the
week ate at least 500 kcal a day; a working day that stepped down on
the fat warnings, to 0.8, 0.6 and 0.4 of the day under three quarters,
half and a quarter of the reserve; and a half day whenever tomorrow's
cooked food was already in hand, read against the body's own week of
burn, the band top standing in for that week before one existed. Five
readings of `npm run reference -- --heir` show what each piece moves.
A, the clause alone with both rules off, reads April 4 of 4 and the
heir gate 1 of 4; the first lives starve on days 52, 49, 34 and 37, and
the heirs on 32, 59, 29 and 46. B, the reserve rule alone, reads April
2 of 4 and the heir gate 1 of 4; one first life starves on day 45 and
three freeze, on 41, 18 and 14, the heirs on 36, 67, 31 and 31, with
the gate week's work in band on every seed, 1,488 to 1,670. C, the food
rule alone, reads April 3 of 4 and the heir gate 3 of 4; the first
lives read 46 and 54 starved, 4 to wolves and 30 starved, the heirs on
38, 55, 34 and 60. D, both rules together, reads April 1 of 4 and the
heir gate 1 of 4; the first lives read 16 to sickness, 44 starved, 4
to wolves and 20 froze. E, the food rule guarded on a full week, reads
identical to A on every seed and every heir.

B's cold deaths are the reserve rule's own case against it: seeds 42
and 79 die on days 18 and 14 with 1.2 and 2.4 kilograms of raw meat
sitting at camp, no firewood, and nothing eaten all week, because a
shorter day starves the wood keeps first, the fire goes out, the snared
meat is never cooked, and the body freezes beside its own food. The
reserve's cost does not belong on the working day.

C's opening death is the arrival kit's doing, not the rule's: the kit
is one day's food by the band, so the first days off the boat read as
fed and ran half days, and seed 42 had no roof up when the wolves came
on day 4. C's heir reading of 3 of 4 comes from those changed first
lives, not from the rule working for heirs; guarded on the body's own
week, as E is, the rule never fires, because no April camp and no
August heir ever holds a day's burn of the food the body eats unasked:
seed 17's 3,700 kcal at camp on day 26 is 2,100 of raw meat, which the
body never touches on its own, and 1,600 the body would eat, against a
burn of 3,450; seed 79's 3,600 at camp is all raw meat, none of it
counted.

Reading F took the food rule's half day back to the camp larder alone
(no pack, so the arrival kit is never read at all) with the reserve
rule off and no week guard, the band top standing in before a week
exists. It reads April 2 of 4 and the heir gate 1 of 4; every first-life
death moves earlier than A's (52 to 44, 49 to 48, 34 to 24, 37 to 7),
the last of those a new cold death inside the days-1-to-10 window A
does not have, and the gate week's burn on the two seeds that still
reach day 26 reads higher than A's, further from the band, not closer.
The controller's ruling: withdrawn, on the same rule as B and the
guarded C - it moves deaths earlier without moving the burn toward its
band.

The decision is that both rules are withdrawn and the clause is kept,
on the spec's own rule that what moves nothing goes and what moves a
death earlier goes too. April reads 4 of 4 and the heir gate 1 of 4 on
the clause alone, the deaths after the gate unchanged at starvation on
days 34 to 52. The two rules are in commits 464ac1b to fe6b86e, and
ad800ce restores the working day; a later body model can rebuild from
there. The burn side's lever is not the hours: work burn still
sits over its band, at 1,763 to 2,030 kcal a day with 497 to 783 of it
walking, and the next reading of that belongs to the list's shape, the
trips between camp, shore and heath, or to the survivor rows that carry
a heir past a first snow, not to a shorter day; the horizon at D reads
as it did for the producers, four stages over their bands and the
stocked stage in band on all four seeds, and says nothing new.

The clause reads the week's intake against a flat 500 kcal a day, the
April beginner band's middle and the number the gate day is derived
from, by the author's decision; a burn-relative clause was not
measured. Against burn, the same week reads 90, 81, 41 and 51 percent
on seeds 17, 19, 42 and 79 (eaten over burn from reading A's first-life
table: 3,105/3,450, 2,971/3,648, 1,657/4,000, 1,979/3,860), which
separates the seeds a flat number does not.

### B. The risk forecast

**Curve.** The horizon curve's instrument: the forecast's first row is
the check-in interval, and the month number logged daily is the evolution
view's series. Survivor rows 2 on: the falling month number is the
plateau signal before every death. Expected: the forecast's horizon
matches the harness's for the same set-up within its band, and no set-up
in its second year reads zero.

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
finish in the worker. The dial is a net where the runner has none, and
it stays on purpose: a world that runs on for a day after a player who
meant to be gone eight hours is what turns an idle player away, and the
game has to sell. The forecast row is what makes the setting a choice
rather than a mercy.

**Built.** Ten runs per horizon, each a clone of the state seeded with
`derive(state.rng, k)` for run k, so the same state forecasts the same
numbers twice and only a click that draws from the stream moves them.
The four rows: away, at the dial's hours turned into game minutes;
tonight, at the minutes to the next dawn; a week, at seven game days;
and a month, at thirty, each reading "N of 10 die: cause, day D" or
"none of 10 die," a row not yet landed for the current request shown
dimmed with its previous text and an ellipsis, or an ellipsis alone.
The worker keeps one world per seed, posts rows shortest first, and
yields to its message queue between each so a newer request supersedes
an older one before its next row starts; a superseded request's
already-posted rows stand until the newer one's replace them. A
request goes out when the orders list changes, when the game day
rolls, when the dial moves, when the player's region changes, and
otherwise once a game hour, and not at all while the tombstone, the
landing screen or the away report is up. The dial sits on the settings
strip beside the sound controls, one to twenty-four hours, default
eight, and the same field now caps the offline and background-tab
catch-up in place of the old twenty-four-hour constant. The month
row's number, the runs alive of ten, lands in the life record's daily
entry the first time a month row lands for that game day, replacing
the null the daily step pushed; the journal draws nothing from the
series yet, since the evolution view lands with the rest of F. The
browser pass, section 6 of the spec, checks that the Ahead panel fills
within a few seconds of landing with the away row first, that a list
change and the dial both move the rows, and that the dial's cap holds
against a real reload the way the away report says it does. It also
checks that the month number reaches the life record after the first
game day, read from the console since the journal draws nothing yet,
and that a stocked camp stage forecasts its month row as mostly
alive.

### The testing infra

**Curve.** No row and no tier: this is the instrument the gate table
reads, not a capability. Expected: on the round's first day every bar in
the table has a number or a blank that says why.

The gate table's six bars split in two. Four come from a beacon: the
re-run rate (a new survivor within a day of a first death), the first
run (a death and a restart inside two hours of attention), hours of
attention (the median over testers past day 1) and day 30 (a tenth still
opening the tab), with the expected reading under 1 (a first death
inside 20 game days from thirst, cold or hunger) beside them. Two come
from a survey and nothing else: would they pay ten dollars after a week,
and stories told unprompted. That is one form, sent after a week, keyed
by the tester's id.

**The beacon is Datadog RUM.** The account is free, its product
analytics does funnels and retention by user, which are the re-run and
day 30 bars as they stand, and the MCP connected to this repo's sessions
reads the numbers without a bars script. The choice was made with cost
off the table; what earns it is that no worker, no table and no script
get built and the dashboards exist on the round's first day. Five
conditions keep the anonymous posture the epitaph section relies on and
keep the page as light as it is:

- **No client IP and no session replay.** The RUM application's client
  IP collection is off, and replay is never enabled; a game screen has
  nothing worth replaying.
- **On by default.** The SDK is an npm dependency behind a dynamic
  import, loaded on every open, so a tester who never visits the
  settings panel is counted; a switch on that panel turns it off, and
  the round is not asked to find it. A random id in local storage is
  the RUM user id, shown on the same panel so the tester can quote it
  in the survey. No name, no email.
- **The tester link.** `?tester=<cohort>` on any open marks the device
  a tester: the flag and the cohort word are written beside the beacon
  id in local storage, the parameter is dropped from the address, and
  every event carries both from then on. The cohort word is whatever
  the invite says, so a second recruiting wave is told apart from the
  first. The flag lives beside the id and not inside the world, so it
  survives "leave this world" and a new seed, and travels with the
  save sync if that lands; the settings panel shows it with the id.
  Everyone else stays counted, and the bars are read for the cohort.
- **The game's facts as custom actions.** Opened (world seed, survivor
  index, game day), died (game day, cause, days survived, hours of
  attention in that life), began again (real time since the death), and
  B's month number on each open. A heartbeat while the tab is visible is
  what hours of attention are summed from. Every field is read from the
  life record or the save, so the simulation does not change.
- **A thin adapter.** One beacon module with an emit function and the
  Datadog calls behind it. The account is tied to employment, so the
  events keep a shape a worker and a table could take if the org ever
  goes away, and the dashboards are the only thing that would be lost.
- **Retention and windows checked before the round.** The day 30 bar
  needs events kept for more than a month, and the re-run bar needs a
  funnel that takes a time window. Both are confirmed against the org
  before a tester is recruited; where a window is not available, the
  MCP exports the sessions and a short script does that one bar.

The round itself, twenty testers from the incremental community and the
recruiting, is not part of this item; it is the slot after siting.

The suite's own wall time was read at 12.8 to 23.7 seconds during the
burn-side item on a loaded machine, against the repo's few-seconds
budget; it was unmeasured at 7066694, and a baseline timing plus a split
of the slow files is this round's harness work.

### The UI pass

**Curve.** No row and no tier. Expected: a tester who knows what they
want finds it in one look, nothing a check-in needs is off the screen,
and the page fits a phone.

The desktop today is three columns with one breakpoint at 1300px, a
centre no narrower than 560px, and a map of 72 by 36 glyphs at 11px,
792px wide. The Do panel lists every gather, every species that lives
here for hunting and fishing, sixteen camp tasks, every recipe and every
structure: sixty to seventy rows in one column, two or three lines each,
and every item adds rows. The log sits under the Doing panel, the Do
panel and the inventory in the same column, a screen and a half down on
a normal monitor. Nothing in the layout stops a panel from pushing the
next one off the screen.

The order strip is a mode: choose "keep camp at N" and every row whose
skill is under the keep rung renders as a shut row with nothing to
click, so early on choosing a keep shuts most of the panel, chop
included, and the way out is to notice the strip. The shut rows were
meant as the promise of the rung, and they still are; what is wrong is
that the promise is a mode that applies to sixty rows at once.

The pass, in one item:

- **The kind is chosen per row, not as a mode.** A row's plain click is
  "once", as it reads. The row expands in place to offer the other kinds
  for that row alone, N times, until camp has N, keep camp at N,
  forever, with bring-it and where beside them; the kinds the row's skill
  has not earned are greyed there with the level and the hours to it, as
  the skills panel words it. The promise stays, next to what can be done
  now, and no row on the panel is ever shut by a choice made for another.
  The global strip goes.
- **Fold and filter.** Groups collapse and remember it. A text box at the
  top of the panel narrows the rows as you type. Rows that cannot start
  and are more than a level away fold under a "more" per group, and Make
  lists what can be made now first.
- **Columns scroll inside themselves.** Each column is the viewport's
  height. The Do panel scrolls inside its box; the log keeps a fixed
  slice at the foot of its column. The Doing panel, the away report, the
  bars, B's forecast, the order list and the log are on screen at 1440
  by 900 without scrolling.
- **The phone layout.** One column under about 700px, with Doing, the
  away report and the order list first, the map second in a horizontal
  scroll container scrolled to the survivor on each rebuild, the rest
  below. Buttons tall enough for a thumb; what the glyph tooltips say
  moves into the region card, since touch has no hover; the zoom keys
  already have buttons. Phone-only players get a whole game from this;
  a desktop player gets nothing on the phone until the sync.
- **The guidelines page.** `docs/ux.md`, a page: nothing is pushed off
  the screen; a list past a dozen rows gets a fold and a filter; the
  check-in fits above the fold; a row is two lines, label and small
  print, with the bar; every browser pass runs at 1440 by 900 and at
  390 wide. The page is what keeps the pass from rotting: every item
  after it is checked against it in its browser pass, the way the
  reference gate is run.

### The save sync

The save is local storage, so a phone is a different world from the
desktop and the beacon counts one tester as two. Responsive alone
serves phone-only players. For the save to follow the player it has to
leave the device, and the rungs are: export and import as a file, which
works and is not a check-in; a sync code on the settings panel with the
save put to a key-value store on every save and fetched on every open,
Cloudflare's free tier being enough; and Steam cloud for the Steam
build. The storage is trivial. The item is the two-device rule: a tab
left open on the desktop and a phone check-in both run the simulation
forward and diverge, the same problem two tabs have today. Last writer
by save time wins, the loser reloads and takes over, and the away
report says which happened. It lands after the round, if the round's
testers ask for the phone, and not before, so that the round is
recruited as single-device and the asking is a finding.

### The south

Not an item. No slot, no curve line. A contingency the round can pull
in, with a trigger, kept here so the answer to "too punishing" is
already designed and stays simple.

**The trigger.** The beacon shows first deaths clustering on one cause
before day 20 and the testers not starting again, so the first-run bar
fails on its second half. A tester who dies on day 12 and starts again
is the punishment working, and this stays on the shelf. A tester who
dies on day 12 and closes the tab is reading the game as unfair, and
this is the answer. The re-run rate is the bar it serves.

**Two pulls, cheapest first.**

1. **Survivor 1's landing month.** One number. The first survivor lands
   in June at 62 N instead of April. The gap already rolls the month for
   every heir, so only the first run changes. It goes first because it
   costs nothing and tests the same hypothesis.
2. **The map extended south.** Latitude by row runs from about 56 N at
   the bottom to 67 N at the top instead of 61 to 67, and the first
   landing moves to the bottom row. A temperate belt of mixed forest and
   a Baltic coast under the boreal country, with no names and no
   history, the way the north has none. New rows in the species table
   and their ranges (roe deer, boar, beaver, hazel and oak, more fish in
   spring), and the climate curve, snow and daylight read from the row
   as they already will. The north above is untouched. The cost is a
   floor's: a climate curve, terrain thresholds, species ranges and
   yields, a calibration pass, sound beds.

What the south changes is April, not February. Nobody dies of the
winter today: the reference runs starve in April and May at 62 N and
every heir starves in August and September, because a boreal spring has
nothing to eat until the fish and the berries arrive. A Baltic April
has sap, nettles, spawning fish and, later, mast, and the idle player
has more to put on the list.

**What it must not do.** Soften the ramp. The south changes yield
tables, not gates. The axe still wears, the body still ages, the land
still empties, and winter still comes, later and shallower at the
bottom row and as it is today by the middle. The reference player's
gates stay where they are, and the south is measured on the same
seeds. If the south takes hunger away as survivor 1's cause and nothing
kills inside 20 days, that is a finding that the ramp items are late,
not a reason to make the south harder.

**What it depends on.** Latitude by row, which is already first in F's
remaining order. Once the row is a function, the south is a wider
domain plus new species rows.

**What it gives the march north.** More rows to climb, and the first
camps a lineage builds sit in the richest country, so leaving them
costs something. It is one continuous map; the tower under "Beyond the
gate" is a different decision and this does not take it.

### C. Skill tiers

**Curve.** The skill wall's content: the tiers at 3, 5, 10, 15, 20 and
30 (wood by species, fishing by method, tool grades) are what a rung, a
carry and a rate node buy. Horizon row 5: the basket trap is the first
producer. Survivor row 2: the tool tiers make the arrival axe the best
one, which is the axe ramp. Expected: the trap's hourly rate takes a
stocked camp to the away cap, and a replaced axe is worse than the first.

Each skill answers one economic question, and a tier is judged by its
skill's question; a tier that does not answer it is in the wrong skill.
The capability spine (`2026-09-04-survidle-capability-spine-design.md`)
is the list of tiers this item fills, and its coverage test is what
keeps a tier from landing as a percent.

| skill | what it makes true |
|---|---|
| Woodcraft | trees become differentiated material, fuel and structure |
| Foraging | more of the world becomes a resource |
| Hunting | animals become bundles of inputs, not meals |
| Fishing | food becomes predictable, then passive |
| Crafting | raw material becomes capability |
| Building | a capability becomes infrastructure that persists |

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
- **Fishing by method and by water, never by fish.** The spear is the
  one method today, D's spec says so, and fishing barely breaks even on
  calories. The fish carry a recommended level each in the tree (pike at
  3, trout at 3, char at 4) and it buys nothing but dice: the same spear
  on the same shore with the odds halved per level short. That level
  comes off the six fish rows. A species keeps its odds, its kilos, its
  water and its season, and is reached by a method, a place and a time
  of year: the spear reaches pike and trout, the trap whitefish, the net
  char, the ice hole burbot, the weir salmon. The ladder is spear at 1;
  reading water at 3, where a shore says what it holds and where ("pike
  in the reeds, whitefish off the point") and fishes at the local rate
  where an unread shore fishes at the beginner band, which is where the
  tables' five-to-tenfold expert lives and what 3's siting and the trap's
  placement read; the basket trap at 5; the net at 10; seasonal water at
  15, the whitefish shallows in October and burbot under the ice named
  on the season panel; the weir at 20 with 2's rivers; local mastery at
  30. If a per-species ladder is wanted it takes the form of recognition,
  char water reading at 5 and burbot's winter holes at 10, never the
  form of dice. The trap is stakes and cordage set in lake shallows, a
  Crafting task at its Fishing tier; once set it catches while you are
  away at an hourly rate keyed to Fishing level and season, and a
  standing order "empty the trap, dry the fish" makes it a stock. It is
  the first food producer a camp runs without you. It has upkeep the
  game already knows how to charge: ice takes it in November, so it is
  rebuilt each spring, and 4's animals raid it. The salmon run waits for
  2's weir, which is the river form of the same trap.
- **Hunting and crafting** already key per species and per recipe. They
  need more rungs, not a new mechanism: more animals with a real spread of
  yield and danger (D's roster, with a recommended level, yields and
  mastery extras per species), and tool and clothing tiers worth the level.
  A hunted species keeps its level because it passes the test a fish does
  not: a deer at 4 is hide, sinew and bone for Crafting, and an elk at 8
  is a preservation problem for 3. Stalking at Hunting 10, odds by where
  you stand to the wind, is the tier 7 gives Hunting.
- **Buildings that produce, honestly.** A chicken coop lays real eggs at a
  real rate and eats real feed. Belongs with the camp build-out
  (sub-project 3), listed here because it is what an idle stock looks like
  in this game: a hut that yields wood per hour does not exist.

**Where the tiers sit.** The idle curve spec places a tier at about 3, 5,
10, 15, 20 and 30 in every skill, so the Nth survivor of a lineage opens
the Nth tier of each skill it pursues, and a run that survives stalls at
the top of the content rather than the top of the curve. Nothing sits
above 10 today. The wood species, the fishing methods, D's roster and the
tool and clothing grades take those levels as they land; the spec fixes
the levels, the sub-projects fill them.

### D. Species and sound

**Curve.** Tiers: hunting and fishing by species, each at its
recommended level, the roster filling 5, 10, 15 and 20 as it grows.
Survivor row 2: an elk is the row's goal; rows 3 and 4: the bear den in
January. Expected: each hunting tier has a species worth the level.

Built: `2026-09-03-survidle-species-and-sound-design.md`, plans
`2026-09-03-survidle-species.md` and `2026-09-03-survidle-sound.md`. The
species half: about thirty species in one catalogue, each with a
habitat, a range that does not cover every suitable region, a season,
yields and calls; wolves, bear and wolverine as populations; hunt or
fish for a chosen species or for whatever is about; fur as its own item.
The sound half: beds for the ground, water, weather and hearth, calls
from the species here at their hours, footsteps and the axe, and one-shot
cues that 7's thunder and 8's crackle plug into; the recordings and
their licences are in `public/audio/manifest.md`, and the ones marked for
replacement are a loose end, not a slot. Later: snares that take grouse,
bear and wolverine that act (4), seals on the coast, grayling and salmon
with the rivers. D is here beside the idle loop because the roster is
what B's forecast and A's orders hunt, and it landed right after A
because it rewrites the hunt and fish branches that A's runner drives.

### E. Hides and clothing

**Curve.** Survivor row 3: a coat worth the level is what makes
winter's cold snap survivable, and its wear is a ramp of its own. Tiers:
crafting 5 for the hide blanket, 8 to 10 for coat, trousers and boots as
now, 15 for the fur grades. Expected: the winter reference set-up in wool
dies in the cold snap and in fur holds, and a coat worn through is a
forecast drop the player sees.

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

**Curve.** The survivor ladder whole, and the tree that moves it: rows 1
to 4 are F's goals paying the nodes that carry, hurry, land nearer and
warn sooner; the evolution view; and the long tail's content, the season
spine, the goals and the march north. Expected: each row's heir at full
Lineage outlives the survivor before it, and never outlives the ramp.

Built: `2026-09-04-survidle-survivor-core-design.md`, plan
`2026-09-04-survidle-survivor-core.md`, for the core; the lineage and the
ramp are not specced. The high-level guidance for those two is here so
the spec has something to argue with; the numbers are first targets, not
rulings. It is the item the thirty-day gate measures, and it builds in
three parts. The core is one slot after the calibration pass and the
delegation ladder: the world saved instead of the person, the life
record and the journal read from it with a daily field for B's month
number, the epitaph and the cemetery, the dim map, the season spine,
first decay, the gap between survivors, and the heir set down near the
old camp. The lineage lands after the first producers and B, in impact
order: latitude by row, the goals list, the Lineage tree with the chosen
landing month as an Arrival node, and the death site with the corpse run
and its search order. The landing month is not an item of its own: the
gap between survivors rolls it from the first death on, so the reference
player runs from every month as soon as the core lands. The ramp's parts
land inside the sub-projects that own them. Trails and the cellar's keep
land with 3, because each needs a camp that can be sited and stocked. The
reference player is F's instrument and lands with the baseline.

Measured, `npx vite-node scripts/reference.ts --heir 17 19 42 79 250`:
seed 17's first life starves on day 48; a 90-day gap lands the heir 16
August, year 1, 12.4 km from the old camp, finding a fire pit standing,
5 snares, 0 kcal and 60 kg of firewood at camp; the heir freezes on day
25. Seed 19's first life starves on day 43; a 90-day gap lands the heir
11 August, year 1, 13.2 km away, finding the same fire pit and 5 snares
with 0 kcal and 26 kg of firewood; the heir freezes on day 19. Seed 42's
first life starves on day 40; a 90-day gap lands the heir 8 August, year
1, 10.4 km away, finding a fire pit standing, 5 snares, 0 kcal and 0 kg
of firewood at camp; the heir freezes on day 36. Seed 79's first life
starves on day 40; a 90-day gap lands the heir 8 August, year 1, 18.3 km
away, finding a fire pit standing, 5 snares, 0 kcal and 89 kg of
firewood at camp; the heir starves on day 27. Against the late-August
gate (first snow, fed), heir passed 0 of 4.

Every heir lands between 8 and 16 August with a fire pit and five
snares waiting some 10 to 18 km away. Read closer, those four deaths
were not the list meeting September: the heir never went to the old
camp, and the shore it landed on had no rock, so the list stalled on
its first job. Every heir's camp held 0 stone and 130 to 394 logs at
death, with a fire drill and no ring to light; three froze beside 40 kg
of firewood and seed 79's heir wore its axe out felling and starved. The
landing search asks for a shore where the start search asks for a shore
and an outcrop, and travel was not a line on the list. Meanwhile every
ancestor had starved 0.1 to 1.2 km from its own camp, so its axe, knife,
bucket and spear lay beside the fire pit and the stone through the gap.
The reference heir now walks to the old camp first, as the first log
line's bearing invites, by the travel task with its hours and burn, and
gives no order until it arrives: all four reach it on day 1 and take
their camp there. Measured again: seed 17's heir starves on day 39
(was frozen on 25), seed 19's on day 53, alive and fed at day 45 (was
19), seed 79's on day 36 (was 27), and seed 42's dies of a fever on day
16 (was 36), a hazard roll in rain with the tinder refusing. Heir
passed 0 of 4 still, and now of the ancestor's cause: snares over band
and fish in band, 950 to 2,600 kcal eaten a day against 3,500 to 3,700
burned, most of the excess the working day's felling. The stop rule's
reading holds: the first producers are next, and the heir's report is
the number they are measured against. Cold sits under band through
September on every heir, so the trap is what moves this gate and the
turf hut is what carries the survivor past it into the snow.

Measured with the producers in (`2026-09-05-survidle-first-producers-design.md`),
with the trap's fish coming out when the survivor arrives at its cell:
the April gate passed 2 of 4. Seed 17 stands fed at day 26 with 3,700
kcal at camp and starves on day 52; seed 19 reads unfed at day 26 while
eating 2,971 kcal a day, and starves on day 49; seed 42 reads unfed at
net -343 with sickness burning 180 a day, and starves on day 34; seed 79
stands fed and starves on day 37. `npx vite-node scripts/reference.ts
--heir 17 19 42 79 250`: seed 17's heir lands 20 August, year 1, 12.4 km
from the old camp, finding a fire pit, 5 snares, a trap emptied to 0.0 kg
and 70 kg of firewood, draws 129 kcal a day from the trap in its first
week, fails the first-snow gate on day 11 and starves on day 32. Seed
19's heir lands 17 August, 13.2 km away, finding no trap and no
firewood, is alive and fed at first snow on day 14 on hares and berries,
and starves on day 59. Seed 42's heir lands 2 August, 10.4 km away,
finding no trap, and starves on day 29 before any snow. Seed 79's heir
lands 5 August, 18.3 km away, finding a trap emptied to 0.0 kg, draws
400 kcal a day from it, and starves on day 46 before any snow. Heir
passed 1 of 4. `npx vite-node scripts/horizon.ts 17 19 42 79 90`: the
producers stage holds 33, 36, 36 and 34 days against its 10-to-20-day
band, over on all four; the stocked stage holds 41, 49, 39 and 34 days
against its 20-to-60-day band, in band on all four.

How the trap got there. Its dawn draws yielded 486 to 786 kcal a day on
three seeds when set on days 10 to 18, but no place in the reference
list could afford an empty keep: set early and emptied daily, April read
1 of 4, the trips costing what the trap yielded; set early and never
emptied, 1 of 4 again, the unemptied basket drawing the shore's fish
down while the spear fished it; below the hunt keep, the lines were
reached by one first life in four, and the heir who inherited a full trap
starved beside it. The snares already had the answer: hares come with you
when you pass the heath. A trap's fish now come out when you arrive at
its cell, so the fish keep's own trips bring the catch home and the list
has no empty keep; the trap is set the day the spear exists. With that,
first lives read trap weeks of 700 and 757 kcal a day on seeds 17 and
79, and two heirs inherit a working trap. April's 2 of 4 is accepted
against that: one honest deficit (seed 42) and one the food clause
misreads (seed 19, eating 2,971 a day), both named in the calibration
pass above, whose burn-side paragraph carries what was measured and
withdrawn; with the clause reading the week, April reads 4 of 4 and
only seed 42's deficit is still real. The heir gate
is measured meaningfully once the tree's carry lands with the rest of F:
the survivor ladder's row 2 is a carried heir, a quarter carry in one
skill and keeps from birth, and 1 of 4 is the expected reading for a
fresh heir until then. What to watch when carry lands is a Fishing 10
heir at a read shore, drawing five times a day from a trap and a hut
waiting, passing 4 of 4. Two runner findings stand: a spoiled once-craft
counts as done and is never retried (`it.done++` before `complete()`
decides), which hides the bow at low Crafting; and a trap keeps drawing
the shore's population down whether or not anyone empties it.

The browser pass ran in Chrome on seed 17 at 200x. The tombstone showed
the epitaph, the entry and "The next boat lands in July, year 1". Begin
again gave the landing screen dated 2 July, year 1, "Ninety days after
Veikko Urbonas died", with a prefilled name rerolled twice and then
typed over. Land gave a fresh body and the first log line naming the old
camp 12 km north. The journal read "Next: The berries, expected in 10
days", the heir's own entry, the ancestor under their epitaph and the
cemetery link; seven regions were dim. Abandoning gave a "Gave up"
tombstone with the next boat in October. The cemetery listed both dead
newest first with leave-world behind a confirm. A reload without the
seed parameter came back to the tombstone from the save. The console
stayed clean. Two findings: the tombstone shows the name twice, in the
heading and again in the epitaph's own "Name." prefix; and the panels
behind the landing screen still show the dead body's bars (health 0, no
tools) until Land. The Do panel's rows are a hand-kept list, and it had
missed the three new tasks - reading the water, setting and emptying
the trap - until this pass caught it. A July death lands the heir on 21
October, by which an October dawn has already taken the trap while the
hut, the trough and the ancestor's tools still stand at camp.

**The world persists; the person does not.** Death stays permanent and
still deletes the survivor: skills, pack, body, everything that was in
them, except what the tree below carries. The world is saved instead of
the person. The next survivor is set down in the same world after a gap
of months and finds what the last one left. There is no rescue, no
walking out and no voluntary end: a run ends when the survivor dies, and
the design has to make sure they do. Rogue Legacy is the shape, with the
land as the castle and the north as its upper floors.

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

None of these exists yet. The stone axe recipe outputs the same `axe` the
survivor arrived with, so today a replaced tool is as good as the first;
C's tool tiers are where the arrival axe becomes the best one. Permanent
damage is 5's, depletion and regrowth are 4's and 6's. Each lands when
its sub-project does, and the ramp is complete when the reference player
dies in its second year.

The tree never touches the ramp. Carried skill hours do not slow the
axe, the body or the land, so an heir at full Lineage still dies, and the
reference player checks it. The test of the ramp is B's forecast: a
month number that reads zero for a camp in its second year means the
ramp is missing, and that is a balance bug to fix before content.

**The recipe.** Two things make every run the same run today: every
survivor lands on 1 April with the same kit at the same kind of place,
and days survived is the only thing to aim at. A known recipe is fine in
a roguelike as long as executing it under variance is the game, and in
an idle game execution is a list of orders, so the variance has to live
in the world. Three levers, cheapest first:

- **The landing month.** The boat lands in any month the coast is open.
  A July landing is a sprint to winter through abundance; an October
  landing is winter first in a wool coat. The season spine already
  handles a year starting anywhere. The gap between survivors is what
  rolls it: an heir lands months after the death, so the month is set by
  when the last survivor died and how long the world ran without anyone,
  and the first survivor alone keeps April. The gap is the most
  consequential number in F's core and its spec strikes it first. The
  reference player gains a set-up per season, and the Arrival node buys
  a chosen month in place of the roll.
- **Latitude by row.** Latitude is one number today, 62 N. It becomes a
  function of the map row, about 61 N at the south edge and 67 N at the
  top: steeper than the real north, and nobody will measure it.
  Daylight, temperature, snow and D's ranges fall out of the row, and the
  top has polar night and treeless coast. This is the ascension. The
  landing moves north along the coast as the lineage grows, the goals
  point north, and everything a lineage built stays south and reachable
  by a long walk, so the old cabin is the waypoint on the way up. It is
  also the reason 6's moving camp exists: a summer camp south, a winter
  push north, stock carried between.
- **The camp as the decision.** 3's siting, which lands after B and
  before the tester round (the build order says why): coast, inland
  lake and fell edge should each want a different orders list. The
  test says whether the three together are enough.

**Goals.** Hades' fated list is the model: every goal in the world is
listed, a few are open at a time, harder ones open as earlier ones close,
and each pays Lineage. Two rules keep the list from being a recipe. The
world picks which goals are open, by the season next and by what lives
here: a coast world offers eider and cod, an inland one the bear and the
ice road. And a goal pays Lineage, or it is a badge and does not belong
here. Most of the currency comes from goals a good run wants anyway:
reach the first frost, winter under a roof, take an elk, live 30, 100,
245 and 365 days. Side goals that pull the set-up off course turn the
list into a checklist. The first three are the tutorial: hold a fire
through a night, hold a week of water, reach the first frost. Thirty to
forty goals for the gate. A goal may be a project, a job whose bill of
materials is visible on its row with what camp has against each line and
"no outcrop known" when the dim map has no source for one, when the
building is one a good run wants anyway; the spine's section 4 says what
a project is, and the smokehouse is the first named one.

**Lineage.** One level, owned by the player and not the world, so it
survives a new seed. It is earned by goals and by nothing else: no real
money, no time. It is spent on a tree of four branches. A node earns its
place by what it does to a bar in the gate table, the re-run rate or the
hours of attention; one that moves neither is a badge and does not
belong here. Knowledge is the branch the player should think Lineage is
about, and it is listed first; Experience holds the carry and rate
ladders, which are infrastructure, since they move the delegation clock
across lives, and are not what the tree is for:

- **Knowledge.** The dim map, trails, the death site marked, the journal
  read earlier, the season spine's warnings a week sooner, and the
  payloads that make the world legible: known water (which shore holds
  what, read at the local rate from the first day), animal crossings
  (the saddle the elk use in the rut), birch stands, safe ice and the
  rapids that never freeze, a valley that traps cold under an inversion,
  old camps. Each is a per-cell observation the last survivor made by
  being there (hours observed, known fish, the season it was seen, the
  ice), written into the life record and carried by the journal. It is
  never a mastery key: mastery stays on activities and species, and time
  at a cell reveals knowledge without becoming a second mastery system.
- **Arrival.** Set down nearer the old camp, then at it. A chosen
  landing month instead of a roll. A kit variant: a knife and a net, a
  bucket.
- **Experience: carry and rate, per skill.** Two ladders per skill, separate nodes.
  Carry: "Woodcraft carries a quarter", then a half, capped at half so
  every survivor still earns half of everything; the carried hours give
  the level and the level gives the delegation rung. Rate: "Woodcraft
  comes twice as fast", then four times, practice minutes counted double
  and then quadruple for every survivor from then on. The level curve is
  quadratic, so a doubled rate is 1.4 times the level in the same hours,
  and the reach across survivors with a doubling each runs about 5, 7,
  10, 14, 20; the square root keeps it from running away. Mastery and the
  pool are not rated. This is the branch that moves the skill wall, and
  a lineage that hurried woodcraft and carried hunting plays differently
  from the reverse.
- **Settlement.** Slower decay: the cabin stands a lifetime, the cellar
  keeps, tools rust less.

About forty nodes for the gate, most of them the per-skill ladders. The
tree is spendable, and that does not
break the rule that the heir's start is derived from play: that rule is
about the world, and the tree sits one level above it. Inside the world
there is still no button for the heir. The journal, the map, the trails
and the caches are earned by living, never by a discrete action taken
for the next one. There is no "write in the journal" button.

- **The season spine** is the year the journal is written against and
  the thresholds the goals list is keyed to: one every 30 to 45 game
  days (berries, the rut, first frost, lake freeze, first snow, the dark,
  the cold snap, ice-out), each announced in the log ahead and named
  when it arrives, and a season panel that says which is next and what
  it asks for. The weather and wildlife already move by date, so this is
  log lines and a panel, and it is core because a run needs something to
  reach before winter.
- **The life record** is what the journal, the epitaph and the dim map
  read, and it is new: the log the game writes is capped at 300 lines
  (`LOG_CAP` in `src/sim/log.ts`), so at death it holds the last two
  days of a life that may have run a season. The record is a typed,
  uncapped stream per survivor, written at the seams the kcal ledger
  already writes at: a season threshold reached, the first kill of a
  species, a build finished, a night's lowest warmth, a region entered,
  the daily forecast number, the death. It is saved with the world, one
  per survivor, and the log stays what it is, a scrolling window.
- **The journal** is the life record read as prose. A survivor who
  lived three days leaves three days; one who lived a season leaves
  where the elk were in October and the night the wolves came. The heir
  reads it at the start.
- **The forecast over a life.** B's month number, logged once a game day
  into the journal, drawn as a line over the life: in the journal so far,
  in the cemetery entry whole, rising while the set-up builds and falling
  as the ramp bites, and on the tree screen between runs with every
  ancestor's line side by side, so preparing for the heir is visible as a
  curve that ends higher each time. F keeps the series and draws it; B
  makes the number, and until B lands the views draw nothing.
- **The map.** Cells the last survivor touched stay dim for the heir
  instead of black. Where they walked is where the map is.
- **Trails.** Traffic wears a path: a route walked twenty times hauling
  logs becomes a trail cell the router prefers and the heir can follow.
  Hauling already walks the same route repeatedly, so this costs nothing
  to earn.
- **Caches and structures.** What was at camp when the survivor died,
  minus decay. The stockpile was for their own winter; it is the heir's
  by accident.
- **The death site.** Where the survivor died is marked on the dim map
  with the day and the cause, and the pack lies there as a pile, minus
  what the months took: the meat gone, the hide rotted, the axe rusted to
  a wear penalty. The heir can walk there and take it. It is never placed
  far by design; the distance comes from where the death was and where
  the heir lands. A lineage accumulates metal this way, an axe per
  survivor. Rust as wear keeps the tenth a lump, and the reference player
  checks that the tool ramp stays honest under a long lineage. The core
  lays the dead survivor's pack down as a pile without this: a pile holds
  tools as counts, and `takeUp` hands back a fresh tool at full
  durability regardless of what was dropped, so rust as wear waits for
  the corpse run, which is what needs durability to live in a pile at
  all.

**The epitaph and the cemetery.** Every survivor's life is summed up in
words the game writes from the log, and every world keeps the list. The
"stories" bar in the gate table needs an artefact the tester can share,
and a total of days is not one. The nearest models write no prose:
Dwarf Fortress's legends, RimWorld's colonist histories, Crusader Kings'
chronicle, Spelunky's death screen. Each lists facts with dates and the
player supplies the meaning. That is the voice here too: real
quantities, no adjectives, and no generated prose, since a model's
paragraph would be generic, cost money per death, add latency to the one
screen that has to be instant, and break the anonymous-beacon posture.
Templates over a deterministic event selector are enough:

- **The selector** reads the life record and picks the notable events
  from a short fixed list: days survived, each season threshold reached, the
  first kill of each species, what was built, the worst night (lowest
  warmth, wolves at the fire), the last three days, and the cause. It is
  deterministic from the log, so a test asserts the epitaph of a seeded
  run, and it is one module: the same selector writes the away report's
  "what happened" line, so the check-in loop and the survivor loop share
  it rather than each growing its own summary. It reads the life record
  and never the log, which is why the record is in the core.
- **The epitaph** is one line, the tombstone: "Day 87. Died of cold on
  the fourth night of the cold snap, 2.1 km from camp, with 400 g of
  dried meat in the pack and 6 kg of firewood at camp." It is written at
  death, shown on the death card, and the death card is what the player
  looks at while deciding to start again, so it is the screen the re-run
  rate is measured on.
- **The cemetery** is per world, since the world is what persists, and
  it lists every survivor that died in it, newest first, each under its
  tombstone line. Opening a tombstone shows the entry: the long form of
  the same selector, a dozen lines at most, one line per season
  threshold reached and per notable event in date order, then the last
  three days and the cause. A survivor who lived three days has a
  three-line entry; one who held a winter has the full dozen. The
  cemetery is a list, not a place: the death site on the map is where the
  body is, the cemetery is where the story is. It is reachable from the
  death card, from the lineage screen and from the heir's journal, and
  it is the first thing a returning player sees after the away report
  when a survivor died while they were gone.
- **What it is not.** There is no "write in the journal" button and no
  editing of an entry; the rule that the heir is earned by living holds
  for the story too. Nothing in the cemetery pays Lineage or changes the
  world. The graveyard grows, and a growing graveyard reads as an
  achievement list better than a total of days does; that is its whole
  job.

It lands in F's core because the life record lands there and the
epitaph is its summary; the selector, the templates and the list are
the cost, and none of it waits on the lineage.

**Decay between survivors** is where the balance lives and where the
roof and the cellar earn their place. The gap is months, so decay is per
month elapsed and the away catch-up already knows how to run it. First
rulings for the spec to strike: a cabin stands for decades; a lean-to
falls in a season; a rack rots in a season; dried meat in the open is
gone in a month and dried meat in the cellar keeps, once 3 builds the
cellar; a tool rusts to a wear penalty and is still a tool; the fire pit
stays; a trail fades in two years unwalked; the dim map never fades,
since it is knowledge; the journal is forever.

**Where the heir is set down, and when.** On the coast within a day's
walk of the old camp from the first death; Arrival nodes bring it
closer, then to camp itself. The gap between the death and the landing
is months, run by the away catch-up as decay, and it is what sets the
heir's month: a survivor who died in May leaves an heir landing in late
summer or autumn, with winter first. The first survivor keeps the
baseline's start with a shore
and an outcrop. After that the landing is chosen by the old camp and by
how far north the lineage has reached, and the good land is always
further up, so camping at the landing is never the best camp for long.

**Search.** A cabin in fog is a real find, and so is a body. The vision
ring, per-cell fog and named spots exist; what is missing is a "search
this region" standing order that sweeps until a structure cell or the
death site enters the ring. A chimney does not glow, so the old camp is
found by walking, by the journal's direction, or by the trail.

**The reference player.** The ramp and the lineage are calibrated by
headless runs, the way the baseline was found: a scripted set-up that a
competent player would make, run on four seeds, and its day of death and
cause reported. It is built with the baseline, as that spec's gate, and
it is F's because F is what it measures from then on. Its pass criterion
moves with the roadmap: reaches 1 December before winter content, from
every landing month once the month is rolled; dies in year two after the
ramp lands, at full Lineage as well as at none; never reads a zero
month forecast; and, per the idle curve's survivor ladder, each survivor
dies in its band and an heir at full Lineage outlives the survivor before
it, since a row where the tree bought nothing is a finding. It is the test that keeps "no set-up holds forever" true
as content is added under it.

**What this asks of the sub-projects around it.** 3's siting and cellar
decide what a camp leaves behind; 5's permanent damage is a ramp; 6's
regrowth clocks are the decay clocks with the sign flipped, and its
moving camp is the push north; B's forecast is how the ramp is measured;
the weather, the daylight and D's ranges read latitude from the row; the
save (`src/sim/save.ts`) stops being a save of the person and becomes a
save of the world with a person in it, and a lineage beside them.

### G. Music

**Curve.** Horizon: no row of its own; the evening grind fills the hours
the working day leaves, which today are spent waiting at camp. Survivor
row 3: the dark is row 3's killer and H's winter course is what music
answers. Tiers: Music 3 for a job of N evenings, 5 for the grind, 10 for
the keep on spirits, with a mastery per instrument and the zither's
recipe at Crafting 10. Expected: a winter set-up with the grind holds
its odds through the dark where the same set-up without it drifts by H's
number; the reference player checks it when H lands, since alone music
moves nothing. It has no slot before the gate and lands with H.

The fire is the game's one warm place and nothing happens there. After
the working day the survivor sits by it until sleep, and the log has
nothing to say about those hours. Music is what people did with them,
and it is the remedy H needs a task for.

**A seventh skill.** Music joins the six, with the same rungs and the
same rule: a minute played is a minute of practice, in Music and in the
instrument's mastery. A level widens what a session reaches, the way a
Hunting level widens the odds. The Lineage tree gets its carry and rate
nodes like any skill, and the idle curve's counts (six skills times
three rungs, six times four nodes) become seven when G lands. The skills
spec's "six skills and what trains them" gains a row.

**Instruments, from what the north gives.** Each is a Crafting recipe
and a tool in the pack that wears like one: damp kills a drum's skin,
frost cracks a flute, and a whistle lasts a season. Keeping them dry is
the reason the cabin has a shelf.

- **Voice.** Nothing to make, from the first night. The weakest reach
  and the only one that needs no hands, so a survivor with a splinted
  arm can still sing.
- **Willow whistle.** A willow stick in the sap weeks, late May to early
  June, when the bark slips off whole; a knife and a quarter of an hour.
  Dries out and goes silent by autumn.
- **Bone flute.** The wing bone of a crane, a knife, two hours. The
  oldest instrument found anywhere is one of these. Cranes are a bog
  bird and a summer one, so the bone is a June find.
- **Frame drum.** A hoop of green wood bent and bound, a hide from E
  stretched wet and dried tight, sinew, four hours. The drum the whole
  north kept. The loudest reach and the one the dark answers to.
- **Zither.** A hollowed board or a split log with five sinew strings,
  the kantele's shape, twenty hours at Crafting 10. The top of the
  ladder: it reaches every condition H has.

**Playing.** "Play by the fire" is a rest-class task at camp that needs a
lit fire, takes an evening, recovers energy the way rest does, and eases
H's conditions by name: voice reaches loneliness, the whistle and the
flute reach loneliness and grief, the drum reaches fear and the dark, the
zither reaches all of them. What it eases and by how much is the level,
the mastery and the instrument. The rungs are the ordinary ones: "play
by the fire" once, "play N evenings" as a job at 3, "play, forever" as a
grind at 5 that takes the evening after the working day, and "keep
spirits up" at 10, which plays until no condition is above mild. The
runner plays only when ordered. A survivor away with no music order
sits by the fire as now, and H's courses run.

**What G does not do.** No audience and no effect on animals, unless the
spec rules that a drum at night does what a torch does; no ballads, no
lyrics, no story beats; no recordings of its own beyond what D's engine
already takes, and the recordings are their own asset question.

### H. The mind

**Curve.** Survivor row 3: the dark is row 3's killer, and a mind that
fails in it is the truthful reason a winter set-up with wood and meat
still dies. Row 4: grief for what the body lost, and a fear of the
animal that took it. No tier of its own; the remedies are G's tiers and
3's roof. Expected: a set-up that reaches December without a roof, a
fire every night and something to do reads a lower month number through
the dark than the one that has them, and the reference player in a
lean-to in the January dark dies of a mistake the log named first. It
is the first content after the gate.

Sub-project 5 hid the mind: loneliness as a course the panel never
shows, widening the odds of every mistake. That breaks the rule that
every threat has a warning the player can read before it kills, and it
gives an idle game nothing an order can keep. H replaces it. The line
under 5 that ruled out a morale bar stands in one sense: there is no bar.

**The shape.** Named conditions, in the body panel beside the wounds,
each with a kind, a cause, an age, a strength and a remedy: "afraid of
wolves, since the night of 3 November, at Wolf Fell after dark", "alone
40 days", "the dark, 4 hours of light". A number under them, `spirits`,
sums the strengths and is never drawn; the log speaks for it ("you are
low", "you have not been this well since October"), and G's keep reads
it the way a keep on firewood reads the pile, with the panel showing
kept or not kept and never the number. Fear is reserved for fearful
things, and each has a source that exists or is ordered:

- **An animal, after it hurt you.** 4's agents: a bear, an elk in the
  rut, the wolves. The fear names the species and the region and holds
  at night. A kill of that species at the level, by day, clears it.
- **Fog on the fell,** after 6's veil has lost you once. Clears with a
  walk by a line or a compass in hand.
- **The dark.** The polar night at the top rows, and December anywhere:
  a course whose strength is the hours of daylight missing, the reason
  3's cabin and the wood pile matter beyond warmth.
- **The dead of your own lineage.** At their death sites and at the
  cemetery, at night. The ghost of the north is your own, and F's corpse
  run is walked by day or it is walked afraid.
- **Bandits.** Beyond the edge only. The north holds one person, and
  this is the one source that would break it.

Loneliness stays: weeks without a change of region or a finished build,
eased by voice, a new region, a finished build. Grief is new: a part
lost to 5, a cabin lost to 8, with a strength by the loss, fading by
time and eased by music. "Low spirits" is the sum's readout, a line that
appears when the number is under a threshold, and it is the only place
the number shows through.

**What a condition does.** Everything goes through 5's capability
functions, never a bar: `oddsFactor()` widens with fear and the dark,
sleep recovers less, and a fearful survivor refuses the task at its
source at night, which the runner reports the way it reports a blocked
order ("would not hunt the wolf ground after dark"). The mind is never a
death cause; it kills through the axe, the fire and the ice, and the
death cause names the mistake while the log named the state the day
before. There is no kcal drain and no health drain, since those are what
bars do.

**Remedies.** A fire, a roof, a full store and daylight lower every
course; G's music by name; time for grief; facing the source for fear.
While away, a keep on spirits makes music an away order; without one the
courses run and B's forecast shows the odds drift as a row, so an away
death in the dark is one the forecast showed.

**What H does not do.** No bar, no therapy, no companions, no medicine
the north did not have, and no condition without a source in the world.

### I. The survivor

**Curve.** Survivor rows 1 to 4: the person the rows are measured on.
No tier of its own; the found places open tiers early. Expected: the
re-run bar, two thirds starting a new survivor within a day of a first
death, since the heir is someone the player chose. The tester round
measures it. The first half lands after siting and before the round;
the second with the rest of F, after it.

A death while the tab is closed is accepted when it happened in the
player's care and not to their account. Today the survivor is a name
and a set of bars, and the away report says "you". This item makes the
survivor a person the player is given, leaves alone, and keeps as a
prize: how old they are, what they are like, what they know, and what
happened to them.

**The first half, before the round.**

- **The away report and the log while away are in third person, by
  name.** "Veikko set the snares, then sat by the fire through the
  storm." While you are here the log says "you"; while you are gone the
  survivor is someone else. This is the cheapest line in the item and
  most of the feeling.
- **Three candidates per boat.** The landing screen shows three people
  and the player picks one; the other two are gone. Asking for the next
  boat costs a week of the gap, so the landing shifts a week and the
  world decays a week more, with no limit: a player who waits until
  October for a strong one lands in the snow, and that is a story. The
  first survivor's boat works the same way.
- **Four body axes**, rolled per person and shown as grades, never
  numbers. Points exist under the hood and the card shows words.

| axis | what it sets | shown as |
|---|---|---|
| strength | comfortable and maximum pack load (25 / 35 kg today), the working day's length before the body rests, and burn per working hour, so a strong survivor hauls the cabin's logs in fewer trips and eats for it | "carries 30 kg all day, 42 at a push; works twelve hours" |
| build | body mass, so the landing fat reserve, warmth loss and resting burn: a heavy survivor lands with more weeks of fat, sleeps warmer, and burns more a day | "84 kg, sleeps warm" |
| hands | craft spoil odds and tool wear | "clumsy", "steady hands" |
| eyes | the vision ring and hunting odds by day | "poor sight", "eagle-eyed" |

  Strength and build cut both ways by physiology; hands and eyes are a
  spread with no downside, and no point budget balances the four, since
  the choice of three does that. Every number stays a real quantity:
  kilograms, hours, kilocalories, cells.

- **Quirks, four to six kinds in the first cut**, one or two per
  person, each naming a capability or a fear with a source and never a
  modifier: coast-born reads any shore from day one and fears the fell
  in cloud, forest-born the reverse; sleeps light, wakes at wolves and
  loses energy on windy nights; big eater, burns more and works faster;
  steady by the fire, lights in rain more often. A quirk earns its place
  if two people with different quirks write different order lists.
- **The card.** On the landing screen for each candidate: face, name,
  grades, quirks. In the journal for the living survivor: the same, plus
  days old, what they know, what they fear, what they have lost, and the
  three best stories from the life record by the selector the epitaph
  uses. On the tombstone whole, and in the cemetery under it. A copy
  button puts the card on the clipboard as plain text, which is how
  stories leave the game before presentation exists.
- **The face.** An 8x8 pixel portrait, a mirrored four-column half in
  four or five colours from a small northern palette, drawn from
  templates the person picks: hair shape, beard or none, eyes set wide
  and bright for eagle-eyed and narrow for poor sight, a wider jaw for a
  heavy build; seeded by the survivor so the ancestor keeps their face
  in the cemetery; rendered at eight to ten times with pixelated
  scaling. The item ships with a self-test pass: a page of generated
  faces at 8x8 and 12x12, screenshotted and judged one by one for
  whether each reads as a person by shape and colour. If 8x8 does not
  read, the size is 12x12.

**The second half, after the round.**

- **Found knowledge.** A place teaches a capability early: weir stakes
  at a river mouth teach the weir, a collapsed smokehouse teaches
  smoking, rock carvings at a lake mark where the elk cross, an old boat
  gives a net, a grave gives a stone axe. Six to ten kinds, each a cell
  the generator places rarely, found by walking it into the vision ring,
  which is what the "search this region" order in F is for. The
  capability opens below its tier for the survivor who found it and goes
  into the life record, so the journal carries the knowledge to the heir
  under the Knowledge branch as F already says knowledge travels; the
  object stays at the place and must be fetched. The lodestone is the
  first of these and already written under 6. This is the variance in
  the world the recipe section asks for, and the reason to explore that
  the orders game otherwise lacks.
- **Earned traits.** H's conditions and 5's scars are traits by living
  and land with their items; the card reads them from the record when
  they exist.

**The reference player** runs a fixed person, the median grades and no
quirk, so the gates keep measuring the list and not the boat.

**What I does not do.** No stats on screen, no re-roll button, no point
budget, no trait that is a percentage with a name, and the tree buys
nothing here: a lineage does not breed better people.

## Beyond the gate: the edge of the world

Not an item. It carries no curve line, has no slot, and waits on the
thirty-day gate. It is here because it is the shape the proper game's
content takes once the north is played out, and because two decisions
below fix what the north has to leave open.

**The reveal.** The march north is F's ascension and the road here. Past
the polar coast at the top row the sea ends at a wall, and the north is
one floor of a tower. The pitch stays survival; the tower is the twist
the Steam page does not show, the way Universal Paperclips is a clicker
until it is not. The verbs never change: orders, skills, the tree, the
forecast, the mind, the lineage all carry over untouched. What changes
per floor is a table.

**Floors.** A fixed count, set when it is designed, so the arc stays
finite and ends at both ends: the ground under the lowest floor and the
sky above the highest. Down is warmer and older ground, a desert first.
Up is the silo, then the wasteland above it, then space. Each floor is
all-encompassing, a terraformed capsule if that is what it takes, and it
is a vehicle for a biome, not a change of rules. Biomes stay one line
each until a floor is designed:

- **Down.** Desert: water is the ramp, the day kills and the night
  freezes, the species are few and the shade is the camp. Steppe or
  temperate floors if the count allows.
- **Up.** The silo: no weather, no wildlife, a finite store and the air
  itself the reserve. The wasteland: the north's rules with the sky
  hostile. Space: the last floor, where the arc ends.

**What holds on every floor.** The rules below, all of them: real
quantities, a warning before every death, a runner that adds nothing,
permadeath, a world that persists and a person who does not, and one
lineage across the whole tower. Each floor is a world saved the way the
north is, so a survivor who takes the stair leaves a camp behind that the
next one can walk back down to.

**What a floor costs.** A climate curve, terrain thresholds and a
geography, a species table with ranges and yields, the yield tables and
a calibration pass against them, and sound beds. That is 1, D, the
baseline and the calibration pass over again, and nothing else. Down
comes before up, because a desert keeps every table the north has and
only changes the numbers, while the silo needs content the sim has no
words for yet.

**What the north must leave open.** Latitude by row already puts a wall
at the top; F's landing must never claim the coast goes on. And the
lineage is owned by the player and not the world, which is what lets it
cross a floor.

## Rules that hold across all eight

- Every quantity stays real: litres, kilocalories, degrees, minutes,
  kilometres, metres of visibility, cubic metres a second, centimetres of
  ice. No abstract points.
- Every new threat has a warning the player can read in the log before it
  kills, and a death cause that names it.
- Survival decides what happens; idle decides how the player commands it;
  Lineage makes death a continuation and not a reversal. When the genres
  disagree, survival wins on outcomes and idle wins on interaction. The
  runner never makes an action safer; it removes repeated execution the
  player has learned. The two bullets after this one are its children.
- Intents never plan around a new threat on the player's behalf; they carry
  it out and report. The player prepares, or does not.
- Each sub-project ships with the browser pass that shows a run through
  its new danger, not only its tests.
- Every task the sim offers is offered by the Do panel, or named in an
  exclusion list with its reason, and a test asserts it both ways, the
  third such guard beside the card policy and the capability table. The
  panel's rows are a hand-kept list, and it had missed all three of the
  producers' tasks until a browser pass caught it.
- Every death is the end of a survivor, never of the world. Nothing a
  sub-project adds may make a set-up hold forever. Nothing carries on the
  person except through the Lineage tree, and the tree never buys
  anything on the ramp.
- A sub-project that adds truth and no reason to come back waits behind
  one that does. Inside an item the same test is per mechanic: simulation
  earns its complexity by changing a decision, and truth that changes no
  preparation, order, route, build, stock or risk stays behind truth that
  does, the way rivers keep their crossings for last.
- Progress is capabilities, not numbers. Levels, mastery, pools and the
  tree's carry and rate ladders improve rates between tiers; every major
  tier names something the survivor can newly do, recognise, make,
  automate or survive, with a name the player can remember and a log line
  when it opens. A tier whose best name is "+X%" is not a tier. A tier
  sits on a task with no roll, or on the rate the tool then earns, never
  on the making of it: a recommended level on a craft halves its odds
  per level short and makes the tier a lottery, which is what the basket
  trap's Fishing 5 did until it moved to setting the trap.
- Every major capability connects systems: it depends on something
  outside its own skill and makes something outside its own skill more
  useful. The capability spine
  (`2026-09-04-survidle-capability-spine-design.md`) is the list, its
  coverage test is the guard, and its two exceptions, the fire and the
  delegation rungs, are the only ones.
- Automation moves bottlenecks and never removes the survival problem.
  Every producer and every standing order takes away one repeated chore
  and leaves a limiting resource, capacity, season, distance, maintenance
  cost or risk, and the spine's row for it says which.
- The rules hold on every floor of the tower, when there are floors.
- Every item carries a curve line, the paragraph under its heading: which
  horizon stage and which survivor row of the idle curve spec it serves,
  the tier levels it fills, and the number it is expected to move, which
  the reference player checks when the item lands. An item that cannot
  write that line waits.
