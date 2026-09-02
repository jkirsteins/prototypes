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

- **One task at a time**, with a progress bar. Most tasks have a `loop`
  button that repeats them until they cannot continue.
- **You are a point on the map.** The ASCII map is split into regions by
  blue borders; your region is outlined in yellow and `@` is your actual
  cell. What you can do depends on the ground under foot: fell trees and hunt
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
  feet, and cells with something on them are underlined on the map. "Haul
  to camp" is a plan: load 35 kg, walk to camp, drop, walk back, repeat
  while the pile has anything; stop anywhere and carry on later. Building
  uses the camp pile plus your pack.
- **Body.** Food is a kilocalorie reserve. Warmth settles toward what your
  felt temperature can hold: ambient, plus clothing, fire and shelter at
  camp, plus activity, minus wetness. Below 20 warmth you lose health fast.
  Energy drains awake and faster working; below 20 you work at half speed,
  and if you idle while spent you fall asleep where you stand.
- **Camp.** Fire pit, then fire (needs a fire drill and firewood); lean-to,
  then a cabin (40 logs, 60 hours); drying rack (3 kg raw to 1 kg that
  keeps); snares on the heath. Auto-eat and auto-feed keep you alive while
  the tab is closed, as long as the food and firewood are there.
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

`scripts/mapstats.ts` prints terrain shares and an ASCII dump for a few
seeds: `npx vite-node scripts/mapstats.ts`.

## Where the numbers live

- `src/units.ts`: the time scale and pack limits.
- `src/sim/items.ts`: weights, foods, recipes, structures, animals.
- `src/sim/player.ts`: kcal burn, warmth balance, energy, wetness, health.
- `src/sim/weather.ts`: the temperature curve, precipitation, snow.
- `src/world/gen.ts`: terrain thresholds, region capacities, spot distances.
