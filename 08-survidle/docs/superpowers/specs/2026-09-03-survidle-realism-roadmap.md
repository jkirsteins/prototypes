# Survidle: the survival edge, a roadmap

Survidle should be as hard as the north is. Being away must be riskier than
playing by hand, never safer: the intent runner carries out what you asked
and adds no safety nets. What makes it hard in real life applies here too.
This roadmap names the work in seven sub-projects, each with its own spec,
plan and build, in the order they should land. Each spec lives beside this
file as `2026-MM-DD-survidle-<name>-design.md`.

## What kills you today

- Cold: warmth under 20 drains 6 health an hour; a night in the open at
  -3 C costs 30 to 55 warmth. This is the killer that actually kills.
- Starvation: 6000 kcal full, 100 to 400 an hour burned, and only 2 health
  an hour once empty, so it is slow.
- Wolves: one percent per night hour outside shelter, twice that in winter.
- Fever: rare, four times likelier soaked and cold, slow unless untreated.

What is already hard and stays: fishing barely breaks even on calories, a
bow needs cordage, a log, a knife and arrows need sinew from a kill, a deer
is 18,000 kcal that rots in 36 warm hours and dries 6 kg at a time.

## The seven sub-projects, in order

### 1. Body and elements

Specced and in build: `2026-09-03-survidle-body-and-elements-design.md`.
That spec holds water, ice (the base the rivers build on), wet clothing
and frostbite, wet wood, smoke, storms and exhaustion. Fog, described
below, is not in it: it gets its own spec after rivers, since a river bank
is one of the things you follow out of it.

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

### 2. Rivers, ice and crossings

Rivers come from the elevation the world already has: water runs downhill
off the fells, gathers, and reaches the lakes and the sea. Each river cell
is a segment with a width and a flow in cubic metres per second, from how
much land drains into it and from the season: the spring melt in May is
the flood, late summer the low, winter the freeze.

- A segment is a ford where it is shallow and slow. Crossing a ford costs
  wet legs and time; above a threshold flow the crossing is refused, "the
  river is too strong here". Rapids are never fordable and never freeze.
- Ice grows by freezing degree-days and thins by thaw, the way ice does.
  Sub-project 1 lands the base of this: one thickness for the world, thin
  ice from 5 cm that can take you, safe ice from 15, the fall, and the
  thaw that strands you (its spec, section 1.6). Rivers refine it per
  water body: rapids that never freeze, rotten ice in the thaw, and the
  fords and bridges that make a river more than a line on the map.
- The trap comes for free. Cross a ford in September, rain for two days,
  and the way back is gone until the water drops. Cross on ice in March
  and the thaw strands you on the far side. The route planner already
  answers "no way there on foot"; that answer now changes from week to
  week, and the log says when a river you crossed has risen or opened.
- Rivers give drinking water for thirst, fishing spots, and a bank to
  follow out of fog. They are the reason 1 comes first and this comes
  before the camp: everything after depends on where the water runs.

### 3. Camp build-out

The cabin made properly expensive for one person. Woodshed, smokehouse,
raised cache or cellar, storehouse, tool shed, palisade, a chimney or vent
as part of a shelter, roofs with a snow load they can fail under, water
storage. Bridges: a log bridge on a narrow segment, a longer one on a
wider segment for more logs, more cordage and days of work, and a bridge
the flood can take. Every building is an answer to a threat from 1, 2, 4
or 7, and its cost is tuned against that threat.

### 4. Animals as agents

Predators that attack in their own country by day, not only wolves at
night. Bear, wolverine, fox and ravens that take meat from the rack, the
pile and the shelter. Hunting genuinely poor without good tools.
Populations per region already grow, thin and migrate; this makes them act.

### 5. Injury, disease, insects, mind

Wounds that need care and go septic. Parasites and disease from bad meat or
an untreated wound. Mosquito, black fly and tick season that makes places
unusable and makes smoke, clothing and the camp site matter. Loneliness and
poor judgement over months alone.

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

### 7. Forest fire

The one threat that changes the map. Its inputs all exist: a dry-day count
on the weather, storms, a camp fire that can already walk off camp, a torch
that burns for an hour and cannot be put out, populations per region. What
it needs that does not exist is wind, a real dryness number, and a way for
a cell's ground to change. It is numbered last so nothing above renumbers,
but its slot is between 4 and 6: after 4, since a fire is what makes the
animals move, and before 6, because the burn's regrowth clock is the first
of the regrowth clocks that Territory generalises. Sub-project 1's camp-fire spread (its section 3.3, a one-shot
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

**Dryness, wind, lightning.** `Weather.dryDays` becomes two buckets, both
in millimetres of evaporation deficit, since the ground dries by
temperature and sun and wets by rain, not by a day count:

| bucket | scale | dries by | fills by | thresholds |
|--------|-------|----------|----------|------------|
| litter | 0 to 20 mm | 1 to 4 mm a day, from the day's mean and clear sky; nothing under 5 C | light rain 1 mm an hour, heavy 3 | dry at 8 (a camp fire can walk), tinder at 15 (lightning and a brand take) |
| peat | 0 to 200 mm | the same rate | the same | bog burns above 120: five or six dry weeks |

The clock line reads "dry" and "tinder dry", the log warns once at each
("The ground is tinder dry." moves to the second). Wind is a daily roll
at dawn like the temperature anomaly: one of eight directions and a speed
in metres a second, persisting from yesterday with drift; a storm forces
a gale. Fog, snow load and wind damage in 6 want the same field. A storm
in fire season is a thunderstorm: "Thunder over the fells." One
thunderstorm in four is dry where you are. Each strikes a few cells in
the simulated country; a strike on a forest or bog cell at tinder starts
a smoulder that flares one to three days later if the litter is still at
tinder, and dies if rain comes first. Odds set so that a player at one
camp sees a lightning fire in the neighbourhood every few dry summers,
not every year.

**Ignitions from the player.** The camp-fire rule stays (over 12 kg, no
one at camp for 2 hours, dry ground, 2 percent an hour); at tinder any
outdoor fire on a forest cell rolls a small chance an hour even attended,
four times that in a gale, and none under a hearth. A torch's stub falls
where it gutters out: on a fuel cell in fire season it takes 1 time in
100 at dry and 1 in 20 at tinder. Nothing else lights the forest. The
player can put out a fire only in its first minutes and only where it
started: "Beat it out" on the cell, 30 minutes with a spruce bough, two
times in three at dry and one in three at tinder, a few points of health
in burns each try; ten litres from a bucket on the camp cell within ten
minutes is certain. Past one cell it is a forest fire and nobody stops it.

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
untouched. On a burning cell you lose 25 health a minute: four minutes.
Smoke downwind is never deadly outdoors; it halves work and hunting odds
and brings visibility to 200 m through the fog mechanism. The runner
keeps its rule and plans nothing around a fire, but a body flinches from
flame the way it shelters from a storm: awake, with fire on a neighbour
cell, you step to the nearest cell that cannot burn, which the intent
reports as "fled the fire"; a walk routes around burning cells; asleep,
the smoke wakes you two times in three, and the third time is the death
cause "burned". A fire that comes through while you are away is a line in
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

The seven above make the north dangerous. These three make Survidle an idle
game in the sense of Melvor Idle and A Dark Room: you set up a system, you
leave, and you come back to gains and a readout of how well the system
held. They run beside the seven, not after them; the first is specced and
should land before sub-project 2, since everything that follows is played
through it. Every "away" carries a risk of dying. The point is that the
risk is legible and the set-up lowers it.

### A. Standing orders

Specced: `2026-09-03-survidle-standing-orders-design.md`. A ranked list
of orders per camp: keeps ("keep camp at 40 firewood", with a half rule
so the runner does not walk home to split one log), grinds ("fell trees
forever"), and jobs ("build a cabin", "make 20 arrows") that drop off when
done. The runner serves the highest unmet order that can start, finishes
a pending delivery before it switches, and waits at camp when nothing can
run so the nights are spent by the fire. The away report summarises each
order: what it did, and what it is blocked on.

### B. The risk forecast

An honest number, not a checklist: the simulation itself run forward from
the current state in a worker, several times with different dice, and the
deaths counted. Shown as a small table per horizon: tonight, a week, a
month, each a percentage, with the top cause of death among the runs that
died ("cold, night 4"). A month is long, and the month number is the one
that says what to build next. The forecast reads the orders list, so it
answers "will this set-up hold", and it is recomputed when the list, the
stocks or the season change. The sim steps in game minutes and is
deterministic per seed; a month is 43,200 steps per run. The spec settles
how many runs, how the worker shares the world, and what the table shows
before the runs finish.

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
- **Hunting and crafting** already key per species and per recipe. They
  need more rungs, not a new mechanism: more animals with a real spread of
  yield and danger, and tool and clothing tiers worth the level.
- **Buildings that produce, honestly.** A chicken coop lays real eggs at a
  real rate and eats real feed. Belongs with the camp build-out
  (sub-project 3), listed here because it is what an idle stock looks like
  in this game: a hut that yields wood per hour does not exist.

## Rules that hold across all seven

- Every quantity stays real: litres, kilocalories, degrees, minutes,
  kilometres, metres of visibility, cubic metres a second, centimetres of
  ice. No abstract points.
- Every new threat has a warning the player can read in the log before it
  kills, and a death cause that names it.
- Intents never plan around a new threat on the player's behalf; they carry
  it out and report. The player prepares, or does not.
- Each sub-project ships with the browser pass that shows a run through
  its new danger, not only its tests.
