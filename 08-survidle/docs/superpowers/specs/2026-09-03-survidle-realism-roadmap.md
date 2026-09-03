# Survidle: the survival edge, a roadmap

Survidle should be as hard as the north is. Being away must be riskier than
playing by hand, never safer: the intent runner carries out what you asked
and adds no safety nets. What makes it hard in real life applies here too.
This roadmap names the work in six sub-projects, each with its own spec,
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

## The six sub-projects, in order

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
the flood can take. Every building is an answer to a threat from 1, 2 or
4, and its cost is tuned against that threat.

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

## Rules that hold across all six

- Every quantity stays real: litres, kilocalories, degrees, minutes,
  kilometres, metres of visibility, cubic metres a second, centimetres of
  ice. No abstract points.
- Every new threat has a warning the player can read in the log before it
  kills, and a death cause that names it.
- Intents never plan around a new threat on the player's behalf; they carry
  it out and report. The player prepares, or does not.
- Each sub-project ships with the browser pass that shows a run through
  its new danger, not only its tests.
