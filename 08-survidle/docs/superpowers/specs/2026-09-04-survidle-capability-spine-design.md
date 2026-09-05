# Survidle: the capability spine

A constraint document, not a design project. The roadmap
(`2026-09-03-survidle-realism-roadmap.md`) says what the north does to a
survivor; the idle curve (`2026-09-04-survidle-idle-curve-design.md`)
says how much attention the game asks for and when. Neither lists what a
survivor can do, in the order it becomes possible, and what each ability
takes from and gives to the rest. This file does, in one table, so every
later spec can point at a row instead of arguing the web again. It
changes no build order and has no implementation plan of its own; its
one piece of code is the coverage test in section 5.

## 1. The hierarchy

Survival decides what happens. Idle decides how the player commands it.
Lineage decides why death is a continuation and not a reversal. When the
genres disagree, survival wins on outcomes and idle wins on interaction:
the runner never makes an action safer, it removes repeated execution the
player has learned; and a death takes the survivor and never the world.

## 2. What each skill is for

A skill answers one economic question, and its tiers are judged by it. A
tier that does not answer its skill's question is in the wrong skill.

| skill | what it makes true |
|---|---|
| Woodcraft | trees become differentiated material, fuel and structure |
| Foraging | more of the world becomes a resource |
| Hunting | animals become bundles of inputs, not meals |
| Fishing | food becomes predictable, then passive |
| Crafting | raw material becomes capability |
| Building | a capability becomes infrastructure that persists |
| Music (G) | the hours by the fire become a remedy |

Speed, odds and waste improve underneath all seven, a percent a level,
between tiers. That is not what a skill is for.

## 3. The spine

Every row is a capability: something the survivor can newly do, recognise,
make, automate or survive. A row has a name the player can remember, the
tier it sits on, what it receives from outside its own skill, what it
gives to something outside its own skill, and what it leaves limiting,
because automation moves a bottleneck and never removes the problem.
"Survivor" is the idle curve's ladder row where it first matters, read
from that spec's tier table (its section 5.4), which derives from the
code curve: a tier is placed by practice hours, never by a survivor's age. "Owner"
is the roadmap item that builds it; "built" means it is in the tree today.

| capability | tier | receives | gives | leaves limiting | survivor | owner |
|---|---|---|---|---|---|---|
| fire | Crafting 1: the drill | sticks and cordage (Woodcraft) | warmth, cooking, melted snow, light | fuel, wet wood, a fire nobody feeds goes out | 1 | built; alone |
| stone knife | Crafting 1 | stone (Foraging), cordage (Woodcraft) | every tool recipe | wear | 1 | built |
| snares | Hunting 1 | cordage (Woodcraft), a knife (Crafting) | food while working; fur, bone and sinew | checking them, the fox, five a region, lean meat | 1 | built; producer |
| lean-to | Building 1 | sticks, logs, cordage (Woodcraft) | a roof: half the wetting, a night that does not kill | the open front, no fire inside | 1 | built |
| bark bucket | Crafting 1 | bark (Woodcraft) | stored water, the water keep | splits at frost, competes for cordage | 1 | built |
| fishing spear | Fishing 1 | stick, stone, cordage (Woodcraft, Foraging) | fish at the beginner rate | barely breaks even | 1 | built |
| drying rack | Building 1 | sticks, cordage (Woodcraft), meat (Hunting, Fishing) | meat that keeps: 3 kg into 1 | 40 kg a rack, two racks a camp, two dry days or four wet, animals at the rack | 2 | built; producer |
| jobs, grinds, keeps | 3, 5, 10 in each skill | the skill's own hours | the away horizon for every skill | grinds wear tools and cut out the haul | 1 to 2 | built; alone |
| bone needle | Crafting 1 | bone (Hunting) | tailored clothing, the waterskin | the first kill comes first | 2 | built |
| bow | Crafting 5 | a log (Woodcraft), cordage, a knife; sinew (Hunting) for arrows | roe deer and elk | arrows, sinew, a lumpy larder | 2 | built |
| tailored hide clothing | Crafting 8 | hide and sinew (Hunting), the needle | winter under wool is winter under hide; the shell 7's wind reads | wear, mending, a deer every eight days | 2 to 3 | built; E deepens |
| cabin | Building 10 | 40 logs, 12 stone, 8 cordage (Woodcraft, Foraging) | +15 C, and the hearth, storehouse, cellar and smokehouse attach here | sixty hours, a winter's firewood | 2 to 3 | built |
| reading water | Fishing 3 | D's ranges per shore | the shore says what it holds and where; the local rate; where to site a camp and set a trap | nothing passive yet | 1 to 2 | C; built |
| fibres and resin | Foraging 3 and 5 | the season: nettle and willow in summer, resin from pine | a second source of cordage (Crafting); glue for arrows, a wound seal (5), a torch that burns longer | season, drying | 2 | C |
| basket trap | Fishing 5 | stakes (Woodcraft), fibre (Foraging), Crafting; a read shore | passive fish: the first food a camp makes without you | emptying, hauling, the rack's 40 kg, November ice, 4's raiders | 1 to 2 | C, producers slot; producer; built |
| water storage | Building 3 | a vessel (Crafting), a camp | a week of water, the water keep as a stock | freezing, the walk to fill it | 2 | 3, producers slot; producer; built |
| turf hut | Building 5 | poles, sticks, birch bark or bog turf (Woodcraft, Foraging) | a hearth: fire inside is legal, and the roof E's smoking needs; +10 C | re-turfing in a year or two | 2 to 3 | 3, producers slot; built |
| scrape and tan | Crafting 3 and 5 | hide (Hunting), birch bark (Woodcraft), a vessel or pit (Crafting, Building) | tanned hide that every tailored piece needs; fat (D) for the tallow light | five days in the pit, a spoiled tan is the hide gone | 3 | E |
| smoking | Crafting 5 | a roof with a hearth (Building), fuel (Woodcraft) | hide that keeps half its warmth soaked; rack-dried meat without the sickness roll | six hours, fuel | 3 | E and 3 |
| net | Fishing 10 | cordage in quantity (Woodcraft, Foraging), a read shore | surplus that scales | spoilage becomes the limit | 2 to 3 | C |
| stalking | Hunting 10 | wind (7) | odds by where you stand; the elk approached | the wind's side | 3 | 4 and 7 |
| dug-out | Building 5 | 12 logs, turf, an elk's shoulder blade (Hunting) | near 0 C unheated: a third of a cabin's firewood, and a cool store before the cellar | damp on bedding and hide, a slope or nothing | 3 | 3 |
| cellar | Building 15 | a digging tool (Hunting's bone), logs, the cabin | three to five days at 4 C: a large kill becomes weeks | the walk back to the one store, stocking it | 3 to 4 | 3 |
| smokehouse | Building 15 | fuel (Woodcraft), the hearth, a surplus worth smoking (Hunting, Fishing) | durable stock; expeditions of days; the elk economically whole | fuel, capacity, supply | 4 | 3; the first named project |
| seasonal water | Fishing 15 | the season spine (F) | whitefish in the October shallows and burbot under the ice, named on the season panel | the season itself | 2 to 3 | C and D |
| fur shell | Crafting 12 to 15 | tanned fur (D, E), tailoring | the cold snap survived in the open; wind blocked through the shell | wear, a bear or a wolverine per parka | 4 | E |
| trail | hauling repeated | twenty walks of the same route | a route the router prefers; distant resources within economic reach; the heir's road | fades in two years unwalked | 3 to 4 | F |
| known water, crossings, stands | Knowledge, F's tree | hours at a cell, written as observations | the heir lands knowing the bend, the saddle, the birch | what the last survivor never walked | 2 on | F |
| compass | Foraging on a fell outcrop, Crafting | a lodestone, cordage, a stick | range in fog and under overcast; the fell in cloud | does nothing in clear daylight | 4 | 6 |
| hide tent | Crafting, E's hides | six hides sewn, poles cut on site | a camp that walks: the multi-day hunt, the push north | 15 kg in the pack, poles cut each pitch | 4 to 5 | 3 and 6 |
| remote camp | shelter, stock and hauling together | a tent or hut, stored food, clothing, a trail | a second camp: distance stops being the limit; the step north | orders that must cross regions | 5 | 6 and F |
| weir | Fishing 20 | rivers (2), stakes, the trap's order | the salmon run as a stock | the flood, the ice | 5 | 2 |
| bear den | Hunting 15 | tracks in autumn, a spear, January, 4's populations | a hundred kilos, the fat tanning wants, a fur | a den missed is a bear beside camp in April | 4 | 4 |

Two exceptions carry the word "alone" and no others do. Fire receives
material and gives everything, and no test should have to prove it. The
delegation rungs receive nothing from another skill by design; their gift
is the away horizon, to every skill at once. Mastery extras at 20 and 50
are not rows: they are rates between tiers.

What is not on the spine, on purpose: species. A hare, a pike or an elk is
D's content under a class (fur, big, bird, fish) and is reached by a
method, a place and a season, never by a level of its own. C's fishing
bullet says how the fish levels in the tree today become the rows above.

## 4. Projects

A project is a job on the orders list whose bill is visible on its row:
"log cabin: 40 logs, 12 at camp; 12 stone, none and no outcrop known; 8
cordage, 2". The runner never gathers a prerequisite on its own, so the
plan stays the player's: the grinds that feed the job go above it. The
last clause of a bill reads F's dim map, so a material with no known
source says so. A goal in F may be a project when it is a building a good
run wants anyway. The smokehouse is the first named cross-skill project,
listed here and built in its slot, since a project is promoted when the
capability before it made its bottleneck the measured cause.

## 5. The coverage test

`src/sim/capabilities.ts` holds the `CAPABILITIES` table for what is
built, and `tests/capabilities.test.ts` asserts over it the way card
coverage is asserted over cards. Its scope is exactly:

- every declared tier (a recommended level that names a capability);
- every producer (a structure or order that yields while the survivor
  does something else);
- every delegation rung;
- every structure that unlocks a capability.

Not every recommended key and not every structure: species are content
beneath methods and classes, and a purely defensive or decorative
structure is not a tier. A row either names a receiving skill other than
its own and one thing it gives, or carries `alone` with its reason. A
tier that reaches the tree without a row fails the test, and a row whose
best name is "+X%" is not a row. A row's tier sits on a task with no
roll, or on the rate the tool then earns, never on the making of it: a
recommended level on a craft halves its success per level short, so a
tier placed there is a lottery and not a capability. The basket trap is
the standing example, keyed on setting the trap, not on crafting it.

## 6. Out of scope

- Any numbers the rows imply: levels are the idle curve's, yields and
  costs are the owning sub-project's.
- A plan. A row lands when its owner does.
- Knowledge as a mastery system. Known water and its kin are per-cell
  observations (hours observed, known fish, season, ice), never a
  mastery key; mastery stays on activities and species.
