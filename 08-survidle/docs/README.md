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

Work you choose in the moment runs faster while you watch: a once order
or a single advanced action runs at up to 6x from start to end, and a
standing or counted order goes 3 minutes ahead each time you click its
row, one click per two-thirds of a second. Body needs, the runner's
waiting, and everything done while you are away run at the one scale.
The seconds in brackets on the task bar and on an option row are the wall
clock under all of that - the hurry and the body's pace - not the one
scale, so a once action's "40 min (10 s)" is what you will actually wait.

## How it plays, in brief

The full list, one bullet per mechanic as built, is `docs/how-it-plays.md`.
The shape of it:

- **You give orders and the game keeps them**: once, N times, until camp
  has N, keep camp at N, forever. The standing kinds are earned per skill,
  five rungs deep. The runner does the walking, the hauling, the fire and
  the night's sleep between orders; a once order is yours, starts on the
  click, and nothing interrupts it.
- **A boat lands three people and you choose one.** Death keeps the world.
  The heir lands months later carrying a quarter of what the last survivor
  knew, and the journal holds every life before them.
- **A big north**: 540 by 667 km of real ground from 61 N to 67 N, fog per
  cell, and routes only over ground you have seen. Exploring new country is
  always your own click.
- **Every quantity is real**: a pack of 25 kg comfortable and 35 impossible,
  kilocalories with a lean ceiling, litres, degrees, centimetres of ice.
  Wet clothes, frostbite, smoke in a closed cabin, fire on dry August
  ground and thin ice each kill, and each warns in the log first.
- **Camp is a cell**: fire site, lean-to, cabin, turf hut or snow shelter,
  drying rack, vedbod, water trough, a trap line, and a yard the ground
  under it limits.
- **About thirty species** with ranges, seasons, fat curves and calls at
  their hours. Hunt or fish for one, or for anything.
- **Light is a real illuminance.** The dark never refuses work; it charges
  for it, and a torch buys most of the night back.
- **Ten skills**, each a matter of hours behind the tool. Levels open
  order kinds and named capabilities, never only a percentage.
- **Close the tab and the world runs on**, up to the away dial. The Ahead
  panel runs ten futures per horizon and counts the deaths.

## Development

    npm install
    npm run dev      # http://127.0.0.1:5173/prototypes/08/
    npm test         # the commit gate and the only suite
    npm run build

A fresh clone pays for the worlds on the first `npm test`: about fourteen
seeds solved once and cached under `node_modules/.cache/`, around seventy
seconds. Everything else a developer runs - the browser check, the debug
URL parameters, the headless probes that read the sim over a season - is
in `docs/development.md`.

## The docs

- `docs/how-it-plays.md`: every mechanic as built, one bullet each,
  grouped by theme. Kept current as mechanics land.
- `docs/development.md`: scripts and probes (`reference`, `year`,
  `horizon`, `december`, `terrain`, `e2e`, `weather:profile`), the debug
  URL parameters, and the warning on the heir probe's cost.
- `docs/weather-model.md`: the atmosphere, visibility and ground-state
  model with its formulas and measured costs. `docs/sky-model.md`: the sky
  widget's astronomy.
- `docs/ux.md`: the UI rules every browser pass is checked against, at
  1440 by 900 and at 390 wide.
- `docs/testing.md`: the tester round and the beacon. `docs/sync.md`: the
  save sync runbook.
- `docs/superpowers/specs/2026-09-03-survidle-realism-roadmap.md`: the
  roadmap. `docs/roadmap-additions.md`: items raised and not yet placed in
  it, including what was measured and what was ruled out and why.
- `docs/superpowers/specs/`: one dated design per piece of work, and the
  sources behind its numbers; `docs/superpowers/plans/` the plans.
- `docs/playtest-*.md` and `docs/*-shots/`: playtest records and the
  screenshots the browser passes wrote.

## Where the numbers live

- `src/units.ts`: the time scale and the median pack limits.
- `src/sim/person.ts`: the four grades and what each sets (load, working day, burn, fat, comfort, spoil, wear, sight, day odds), the quirk lines, the candidate roll; `src/sim/fears.ts`: the two fears as predicates.
- `src/ui/face.ts`: the face templates and palette; `src/ui/card.ts`: the card's lines and the story rank; `src/sim/voice.ts`: the log's tokens and the third-person rule.
- `src/sim/inventory.ts`: the three axes, their wear factors and the blunt line; `src/sim/tasks.ts`: the edge's slowdown, honing, dead wood and the wedge split.
- `src/sim/items.ts`: weights, foods, recipes, structures.
- `src/sim/gut.ts`: the lean ceiling on every food's lean share and the per-food gut ceilings, both booked by the day.
- `src/sim/species.ts`: every species: habitat, range, season, hunt odds, yields, calls, and the carcass fat curve marrow follows.
- `src/world/wildlife.ts`: how a region's habitat and a species' range become a capacity.
- `src/sim/player.ts`: kcal burn, warmth balance, fatigue, wetness, health, the fat reserve.
- `src/sim/sleep.ts`: the two processes sleep runs on, their lines, and how long a night is.
- `src/sim/body.ts`: when an intent sleeps, warms up, eats and provisions.
- `src/sim/climate.ts`: advected atmospheric fields, terrain modifiers and
  optical extinction; `src/sim/weather.ts`: regional ground persistence,
  catch-up, snow, water, frost and ice.
- `src/world/terrain.ts`: world size, the geography, terrain thresholds, the region lattice.
- `src/world/gen.ts`: region stats, capacities, spots, the start.
- `src/sim/stocks.ts`: the spring egg stock, seeded on 1 May, and the root ground - what a cell's stand holds, what is left in each cell that has been dug, and the growing season's regrowth.
- `src/sim/skills.ts`: the level curves, recommended levels, mastery extras and pool perks.
- `src/sim/light.ts`: the illuminance at a cell in lux - the sun, the moon, cloud, snow and flame - the light each activity needs, and the odds a light buys; `src/ui/map.ts`: the rings a light source lights.
- `src/sim/water.ts`: the water reserve, drinking and filling vessels; the self-care row in `src/sim/body.ts` is what drinks.
- `src/sim/clothing.ts`: per-garment wetness, drying and frostbite chance.
- `src/sim/fire.ts`: wet wood, burn rate and lighting odds in weather, indoor smoke.
- `src/sim/hazards.ts`: the hourly rolls: frostbite, fire spread, ice underfoot, freezing vessels.
- `src/sim/yard.ts`: what each structure occupies in the camp's yard and
  the clearing rate an hour of widening buys, read off the fire site's
  own minutes rather than invented again.
- `src/sim/rates.ts`: the signed causes behind a stock group's rate - the
  task in hand, the fire, rain on an uncovered stack, the body's burn and
  draw - and what a projection may not count, so the panel never shows a
  guess dressed as a reading.
- `src/ui/stocks.ts`: the group table naming what belongs to wood, food,
  water and pack, what each holds and is capped by, and the reason
  printed when a group sits at its cap.
- `src/audio/manifest.ts`: every sound slot, its files and gain; `src/sim/soundscape.ts`: which beds and calls are open where.
- `src/sim/manual.ts`: the one-page manual's four sections, the handbook
  links, and when a world opens it unasked.
- `src/sim/reference.ts`: the reference player's order list and checkpoints.
- `src/sim/probe.ts`: the without probe, a source disabled for a year run so no single one reads as mandatory.
- `src/sim/forecast.ts`: the forecast's runs per horizon and the horizons themselves; `src/sim/forecast.worker.ts`: the worker that runs them off the main thread; `src/sim/forecaster.ts`: the worker client and the month number; `src/ui/dial.ts`: the away dial.
- `src/sync/lease.ts`: who may run the world - the grace period, the
  heartbeat, the forced take - shared by the Worker and the page;
  `src/sync/session.ts`: the sync's states and the rule in front of every
  catch-up; `src/sync/config.ts`: the store's URL; `worker/`: the store.
