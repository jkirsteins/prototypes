# Survidle

A northern survival idle game. One person, an axe, wool clothes and a kilo of
dried meat, set down on 1 April in a procedurally generated stretch of boreal
forest, lakes, bog and fell. Survive as many days as you can. Death is
permanent and deletes the save.

Design spec: `docs/superpowers/specs/2026-09-02-survidle-design.md`.
Implementation plan: `docs/superpowers/plans/2026-09-02-survidle.md`.

## The one scale

    1 real second = 1 game minute

Everything else is a real quantity: kilometres, kilograms, kilocalories,
degrees Celsius, minutes. A 3 km walk at 3 km/h is an hour of game time and
sixty seconds of yours. A day is 24 real minutes; a year is 365 game days.
Every button shows both times: "1 h 40 min (1 min 40 s)".

## How it plays

- **You say what, the game does how.** Every button is an intent: "Fell a
  tree" walks to the forest itself; a strip above the list says how long
  (once, N times, until camp has N, forever), whether to bring the yield to
  camp, and where. The game does the walking, the work and the hauling,
  and when the body asks for it, the walk back to camp, a fire from what
  is at camp, and the night's sleep; at dawn it goes back to the work.
  Anything it cannot do (no axe, nothing left to fell, no materials) ends
  the intent with the reason in the log. An "advanced" toggle shows the
  raw single actions underneath, one at a time, as they were.
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
- **Body.** Food is a kilocalorie reserve. Warmth settles toward what your
  felt temperature can hold: ambient, plus clothing, fire and shelter at
  camp, plus activity, minus wetness. Below 20 warmth you lose health fast.
  Energy drains awake and faster working; below 20 you work at half speed,
  and if you idle while spent you fall asleep where you stand.
- **Camp.** Fire pit, then fire (needs a fire drill and firewood); lean-to,
  then a cabin (40 logs, 60 hours); drying rack (3 kg raw to 1 kg that
  keeps); snares on the heath. Auto-eat and auto-feed keep you alive while
  the tab is closed, as long as the food and firewood are there.
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
- **Away.** Close the tab and the world keeps going. On return the elapsed
  time is simulated, up to 24 real hours (60 game days), and a panel tells
  you what happened. You can die while away.
- **Winter** is December to February at 62 N: about five hours of light,
  -9 C mean, cold snaps to -30 C, deep snow that halves your walking speed.
  Deer and elk thin out. You need hide clothing, a cabin, and a wood pile.

## Debug URL parameters

- `?seed=123` starts a new run with that world seed. While present, every
  reload starts over instead of loading the save.
- `?speed=60` runs the clock 60 times faster than the game scale. For
  reaching winter in an afternoon; not a game feature.
- `window.survidle` exposes `state`, `world`, `advance(minutes)` and `speed`
  in the console.

## Development

    npm install
    npm run dev      # http://127.0.0.1:5173/prototypes/08/
    npm test
    npm run build

`scripts/mapstats.ts` prints a downsampled view of the whole world and its
terrain shares: `npx vite-node scripts/mapstats.ts 42`.

## Where the numbers live

- `src/units.ts`: the time scale and pack limits.
- `src/sim/items.ts`: weights, foods, recipes, structures, animals.
- `src/sim/player.ts`: kcal burn, warmth balance, energy, wetness, health.
- `src/sim/body.ts`: when an intent sleeps, warms up, eats and provisions.
- `src/sim/weather.ts`: the temperature curve, precipitation, snow.
- `src/world/terrain.ts`: world size, the geography, terrain thresholds, the region lattice.
- `src/world/gen.ts`: region stats, capacities, spots, the start.
- `src/sim/skills.ts`: the level curves, recommended levels, mastery extras and pool perks.
- `src/ui/map.ts`: light sources and the rings they light.
