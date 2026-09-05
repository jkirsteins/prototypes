# Survidle

A northern survival idle game. One person, an axe, wool clothes and a kilo of
dried meat, set down on 1 April in a procedurally generated stretch of boreal
forest, lakes, bog and fell. Survive as many days as you can. Death keeps the
world, not the survivor: the tombstone shows what happened, and "Begin again"
lands the next survivor here months later, under a name you choose. The
journal holds the life record and every ancestor before them; the cemetery
lists the dead, and "leave this world", on the cemetery panel, is the only
way to a new one.

Design spec: `docs/superpowers/specs/2026-09-02-survidle-design.md`.
Implementation plan: `docs/superpowers/plans/2026-09-02-survidle.md`.

## The one scale

    1 real second = 1 game minute

Everything else is a real quantity: kilometres, kilograms, kilocalories,
degrees Celsius, minutes. A 3 km walk at 3 km/h is an hour of game time and
sixty seconds of yours. A day is 24 real minutes; a year is 365 game days.
Every button shows both times: "1 h 40 min (1 min 40 s)".

## How it plays

- **You give orders, the game keeps them.** Every button adds an order to
  this camp's list; the strip above says what kind: once, N times, until
  camp has N, keep camp at N, or forever. Keeps and forevers are standing
  orders. "Keep camp at 40 kg firewood" triggers when the pile drops under
  20 and splits back up to 40; "Fell trees, forever, bringing it to camp"
  soaks up every spare hour. Jobs ("build a cabin", "make 20 arrows") drop
  off when done. Each kind is earned per skill: a job (N times or until camp
  has N) opens at level 3 in the task's skill, a grind (forever) at 5, a
  keep (keep camp at N) at 10, and a once job is always open. A row below
  its skill's level greys and names the level that opens it. The list is
  ranked: each free minute the game serves the highest order that is unmet
  and can start, finishes any load it owes camp first, and never switches
  mid-task. A blocked order shows why ("needs an axe", "missing materials at
  camp") and waits; a job placed above the grind that will haul its logs in
  is how a cabin gets built while you are away. With orders but nothing to
  do, you wait at camp, where the nights are by the fire. The game does the
  walking, the work, the hauling, and when the body asks for it, the walk
  back to camp, a fire from what is at camp, and the night's sleep. An
  "advanced" toggle shows the raw single actions underneath, one at a time.
- **Camp is the cell the run lives around.** It starts at the region's
  centre; walk to a better cell and make camp there while nothing stands at
  the old one, and the region panel says what the cell offers first.
- **Orders belong to a camp.** Walk into a new region and its list is
  empty; come back and the old list resumes.
- **A big north.** The world is about 540 by 390 km, the shape of the far
  north: sea and fjords to the northwest, a fell spine inland, lakes and bog
  to the east. It is generated as you touch it, so loading is instant.
  Regions are about 4 km across; country you have never entered is fog, and
  the next valley over is dimly seen. The map is always centred on you;
  zoom with the two buttons or the plus and minus keys, from 300 m per
  glyph to the whole north on one screen.
- **You are a point on the map.** Regions are split by blue borders; your
  region is outlined in yellow and `@` is your actual cell. What you can do depends on the ground under foot: fell trees and hunt
  in forest, gather stone on rock, fish beside water, hares and berries on
  bog or meadow, and camp things at camp. Named spots (forest, outcrop,
  shore, heath) are waypoints with walk buttons; routes go around lakes and
  across bog only when they must, and the remaining route is highlighted
  while you walk. Stop a walk and you stand where you are.
- **Stopping never loses work.** Felling, gathering, crafting and the rest
  keep their share done, listed under "Set aside" with a resume button, or
  the place to walk back to. Walking keeps nothing because your position is
  the progress.
- **Carrying matters.** Your pack is comfortable to 25 kg and impossible past
  35. Logs weigh 20 kg and never go in the pack: they lie where they fell.
  Everything you make or kill that does not fit lands on the pile under your
  feet, and cells with something on them are underlined on the map. "Bring
  it to camp" hauls a full load at a time: load 35 kg, walk to camp, drop,
  walk back, and the rest when the work is over; "Haul to camp" under
  advanced does the same for whatever lies where you stand. Building uses
  the camp pile plus your pack.
- **Water at camp.** Buckets and waterskins left in the camp pile hold
  water; "fill vessels, keep camp at 4 litres" carries it home. It freezes
  without a fire and thaws by one, and an ice hole cut with the axe on a
  frozen shore is open until morning.
- **Species.** About thirty animals live in the north, each with a range:
  capercaillie in some old spruce country and not all of it, ptarmigan and
  reindeer on the fell, eider and cod on the coast, perch and pike in the
  lakes, wolves in patches of forest where the nights are dangerous. The
  region card lists what lives here. Hunt or fish for a chosen species,
  or for anything, and what you meet is drawn by how many are about. Each
  species has its own mastery, yields and recommended level; fur-bearers
  give fur, deer and bigger give hide, and big animals give fat, the
  richest food there is.
- **Sound.** The place has a voice: wind in the trees or over the fell,
  water at the shore, rain, the fire at camp, footsteps on leaves, snow or
  bog, the axe. The species that live here call at their hours and in
  their seasons: loons on a June evening, cranes on the bog, wolves at
  night by the moon. Click once to start it; the Sound control mutes,
  sets the volume and turns the ambience off on its own. Recordings and
  their licences are listed in `public/audio/manifest.md`; several are for
  this prototype only and are marked for replacement.
- **Body.** Food is a kilocalorie reserve. Warmth settles toward what your
  felt temperature can hold: ambient, plus clothing, fire and shelter at
  camp, plus activity, minus wetness. Below 20 warmth you lose health fast.
  Energy drains awake and faster working; below 20 you work at half speed,
  and if you idle while spent you fall asleep where you stand.
- **The elements.** Water is a reserve like food: drink at a shore, carry it
  in a bark bucket or a waterskin, melt snow at the fire in winter for a kilo
  of wood a litre. Lakes freeze; thin ice is a shortcut that can take you,
  safe ice is a road until it melts and strands you. Clothing gets wet
  garment by garment and a soaked coat is half a coat; wet boots in frost
  are frostbite, which heals only by a fire under a roof and can cost toes.
  Wood split in rain is wet wood that smokes and gives half the heat; rain
  makes lighting chancy and eats the fire. A fire left big on dry August
  ground can spread. A fire inside a closed cabin without a hearth fills it
  with smoke and can kill you in your sleep. Storms are announced an hour
  ahead. Spent, you miss more, spoil more and recover slower. The runner
  drinks, shelters from a storm, is home before dark in winter and banks
  the fire it leaves, and nothing more.
- **Camp.** Fire pit, then fire (needs a fire drill and firewood); lean-to,
  then a cabin (40 logs, 60 hours); drying rack (3 kg raw to 1 kg that
  keeps); snares on the heath. "Hang meat to dry" is a task, and a keep on
  dried meat runs it as the rack has room. Auto-eat and auto-feed keep you
  alive while the tab is closed, as long as the food and firewood are
  there.
- **Spares.** A tool recipe yields a spare that is taken up when the one in
  hand breaks; "keep camp at 1 axe" is how the axe is never the end of the
  run.
- **Light.** Every tile carries its ground's colour as a dark background.
  At night a lit fire glows on the map, two rings when it is fed and one
  when it burns low, and you can see your own camp from the next valley.
  A torch (1 stick, 2 bark, 20 minutes; lit at a fire in a minute or with
  the fire drill in ten) burns for an hour, lights one ring around you,
  takes the night penalty off your walking, and keeps the wolves off.
- **Bedding.** Most of a night's heat goes into the ground. A bough bed (12
  sticks, half an hour) gives +4 C asleep at that camp and goes flat after
  a fortnight. A hide blanket (4 kg hide, 2 sinew, a needle, 4 hours) is
  3 kg in the pack and gives +8 C asleep or resting anywhere. The sleep
  button says what you lie on and under: "on bare ground, in the open" or
  "on a bough bed, under your blanket and the roof, by the fire".
- **Skills.** Every minute at a task is a minute of practice in one of six
  skills (Woodcraft, Foraging, Hunting, Fishing, Crafting, Building) and in
  that action's mastery. A level is hours behind the tool: 2 h to level 2,
  162 h to 10, 722 h to 20. Each level is 1% faster, and 1% better odds for
  hunting and fishing, 1% less tool wear for crafting. Mastery adds a
  quarter percent per level on that one action, with a concrete extra at
  20 and 50. Every mastery minute also fills the skill's pool; at 10, 25,
  50 and 95 percent it gives skill-wide perks. Gates are soft: a button
  says "Hunting 8" and stays live, but under it the odds halve per level
  short and an elk can hurt you; a craft under level can spoil the piece.
  The skills panel marks the three order-kind rungs (3, 5, 10) on each
  skill and reads how far off the next one is, "jobs 3, 8 h to go".
- **Away.** Close the tab and the world keeps going. While it is closed the
  elapsed time is simulated up to the away dial on the settings strip, 1 to
  24 real hours, default 8 (20 game days at the game scale). On return a
  panel tells you what happened, and, above the log, what each order did
  while you were gone and what any of them is blocked on. You can die
  while away.
- **Ahead.** The Ahead panel runs the game forward ten times per horizon
  (until you are back, tonight, a week, a month) and prints how many of
  the ten runs die and of what. Dim text with "..." is a row from an
  older state, not yet replaced by the latest request.
- **Winter** is December to February at 62 N: about five hours of light,
  -9 C mean, cold snaps to -30 C, deep snow that halves your walking speed.
  Deer and elk thin out, the mallards and geese are gone south, the eider
  stay on the coast, and the lakes' birds leave with the ice. You need hide
  clothing, a cabin, and a wood pile.
- **The journal** reads the life record: what season it is, what came before,
  and every ancestor's life under their epitaph.

## Debug URL parameters

- `?seed=123` starts a fresh run with that world seed. While present, every
  reload starts over instead of loading the save. Without it, a reload
  returns to whatever phase the save is in: alive, the tombstone, or the
  landing screen.
- `?speed=60` runs the clock 60 times faster than the game scale. For
  reaching winter in an afternoon; not a game feature.
- `window.survidle` exposes `state`, `world`, `advance(minutes)` and `speed`
  in the console.
- `?tester=<cohort>` marks this device a tester for the round and names its
  cohort; the parameter is dropped from the address after one open, and the
  mark survives a new world. The settings strip shows the beacon id and the
  cohort. See docs/testing.md.

## Development

    npm install
    npm run dev      # http://127.0.0.1:5173/prototypes/08/
    npm test
    npm run build

Every browser pass runs at 1440 by 900 and at 390 wide against
`docs/ux.md`.

`scripts/mapstats.ts` prints a downsampled view of the whole world and its
terrain shares: `npx vite-node scripts/mapstats.ts 42`.

`npm run reference` runs the day-one order list a competent player would
write, headless, on four seeds, about ten seconds; the gate is alive and
fed on game day 26 from the arrival kit, in April - a short-term survival
problem for a beginner with fire, a roof and water at the deficit the yield
tables allow, with the day derived from that deficit and the food clause
on top so the gate measures the loop rather than the fat reserve. `npm run
reference -- --kitted` runs a diagnostic that starts with tools and a
fire already in hand instead of from scratch, and `npm run reference --
--start=<doy>` opens the run on that day of year instead of 1 April (200
is 20 July, 235 is 24 August); a start from July on is measured at the
first snow rather than at a day. It is not part of `npm test`.

`npm run horizon` runs a stocked camp with no player forward for up to 30
days on the same four seeds, at each stage of the delegation ladder in
turn (manual only, jobs and grinds, keeps), and reports the day and cause
of the first death. It checks how long an idle camp holds at each stage,
against the roadmap's provisional bands. `npm run horizon -- --start=<doy>`
opens each stage's camp on that day of year instead of 1 April (200 is
20 July, 235 is 24 August). It is not part of `npm test`.

## Where the numbers live

- `src/units.ts`: the time scale and pack limits.
- `src/sim/items.ts`: weights, foods, recipes, structures.
- `src/sim/species.ts`: every species: habitat, range, season, hunt odds, yields, calls.
- `src/world/wildlife.ts`: how a region's habitat and a species' range become a capacity.
- `src/sim/player.ts`: kcal burn, warmth balance, energy, wetness, health, the fat reserve.
- `src/sim/body.ts`: when an intent sleeps, warms up, eats and provisions.
- `src/sim/weather.ts`: the temperature curve, precipitation, snow.
- `src/world/terrain.ts`: world size, the geography, terrain thresholds, the region lattice.
- `src/world/gen.ts`: region stats, capacities, spots, the start.
- `src/sim/skills.ts`: the level curves, recommended levels, mastery extras and pool perks.
- `src/ui/map.ts`: light sources and the rings they light.
- `src/sim/water.ts`: the water reserve, drinking, filling vessels and auto-drink.
- `src/sim/clothing.ts`: per-garment wetness, drying and frostbite chance.
- `src/sim/fire.ts`: wet wood, burn rate and lighting odds in weather, indoor smoke.
- `src/sim/hazards.ts`: the hourly rolls: frostbite, fire spread, ice underfoot, freezing vessels.
- `src/audio/manifest.ts`: every sound slot, its files and gain; `src/sim/soundscape.ts`: which beds and calls are open where.
- `src/sim/reference.ts`: the reference player's order list and checkpoints.
- `src/sim/forecast.ts`: the forecast's runs per horizon and the horizons themselves; `src/sim/forecast.worker.ts`: the worker that runs them off the main thread; `src/sim/forecaster.ts`: the worker client and the month number; `src/ui/dial.ts`: the away dial.
