# Developing Survidle

Everything a developer runs: the dev server, the test gate, the browser
check, the debug parameters, and the headless probes that read the sim
over days and seasons. The runbooks for the save sync and the tester
round are `sync.md` and `testing.md`.

## Build, test, run

    npm install
    npm run dev      # http://127.0.0.1:5173/prototypes/08/
    npm test
    npm run build
    npm run weather:profile
    npm run terrain

`npm test` is the commit gate and the only suite. A fresh clone pays for
the worlds first: the suite touches about fourteen full-size seeds, each
solved once and cached, which is around seventy seconds and six hundred MB
under `node_modules/.cache/`. See `docs/testing.md` for the cache. The
slow suite that held the whole-season runs was deleted; see "Reinstate the
useful slow tests, under a time budget" in `docs/roadmap-additions.md`.

Every browser pass runs at 1440 by 900 and at 390 wide against
`docs/ux.md`.

The save sync - the run following the player to a phone, one device
running the world at a time - is always on: the world is in the address
(`?w=heron-pine-ember`), and a build with no store URL in
`src/sync/config.ts` is the one case with no sync at all. `docs/sync.md` is the runbook: `npm run worker:dev`
and `npm run worker:smoke` drive the store locally, `npm run
worker:deploy` publishes it, and the Worker's dependencies are its own
under `worker/` so none of this touches `npm install` here.

The browser check plays the real game. Run the development server in one
shell and `npm run e2e` in another: headless Chrome opens seed 42 on day
200, lands through the real candidate and landing controls, clicks the
board with real mouse events at real screen coordinates, presses the real
zoom buttons and lets night fall, and writes what it saw to `docs/e2e/`.
Every image is a screenshot of the page as the player sees it, and every
reading is taken from the model the canvas drew and from the canvas itself
- never from a fixture world, an off-screen copy of the board or a
synthetic click on a glyph. It holds the game to: one click on known
ground orders a walk at the block rung and at 50 m; while walking at a
block rung the view origin moves only by whole glyphs and the glyphs
between moves change only where sight reaches something new; the survivor
is drawn in the middle of the visible panel throughout; the board is
painted at every rung and at night; and the page throws nothing.

`scripts/mapstats.ts` prints a downsampled view of the whole world and its
terrain shares, plus the full-resolution water kinds, stream count, rock
share and a height histogram: `npx vite-node scripts/mapstats.ts 42`.

`npm run terrain` is the realism report: for seeds 42, 1 and 7 it solves
(or reads the cached solve) and prints each measure from the
terrain-hydrology spec's section 6 beside its real target - distance from
land to water, lake share and the five largest lakes, the largest river
mouths, coastline length,
exposed rock by band, bog share by latitude, valley bearings, mean slope
per class and the solve time. `npm run terrain -- <seed>` runs one seed;
`npm run terrain -- --time` runs the older stage-by-stage timing spike
instead of the report.

`npm run reference` runs the day-one order list a competent player would
write, headless, on five seeds; the gate is alive and
fed on game day 26 from the arrival kit, in April - a short-term survival
problem for a beginner with fire, a roof and water at the deficit the yield
tables allow, with the day derived from that deficit and the food clause
on top so the gate measures the loop rather than the fat reserve. `npm run
reference -- --kitted` runs a diagnostic that starts with tools and a
fire already in hand instead of from scratch, and `npm run reference --
--start=<doy>` opens the run on that day of year instead of 1 April (200
is 20 July, 235 is 24 August); a start from July on is measured at the
first snow rather than at a day. It is not part of `npm test`.

A life costs about two minutes of wall time on the solved world, so the
five seeds are about ten of them and not the ten seconds this paragraph
used to claim.

**Do not run the heir lineage (`--heir`) until one life is measured under
two minutes.** It is 24 lives, so it costs a life times 24: about 80
minutes when it was last read on 2026-09-11, and about 50 after the sign
table stopped being walked once per cell and species. Time one life first
with `npx vite-node scripts/reference.ts 17`, which prints its own
seconds. The script refuses `--heir` outright until it is passed
`--i-have-timed-a-life`, so the hour is never started by accident. What is left is the shape of the chooser rather than a slow
function: `bestHuntCell` scores every mapped cell of the region, and of
the neighbouring regions above hunting 8, for every species. Cutting that
sweep moves the cell the chooser picks, which `tests/hunting-chooser.test.ts`
pins on purpose, so it is a design call about how far a survivor looks and
not an optimisation.

`npm run horizon` runs a stocked camp with no player forward for up to 30
days on the same five seeds, at each stage of the delegation ladder in
turn (manual only, jobs and grinds, keeps), and reports the day and cause
of the first death. It checks how long an idle camp holds at each stage,
against the roadmap's provisional bands. `npm run horizon -- --start=<doy>`
opens each stage's camp on that day of year instead of 1 April (200 is
20 July, 235 is 24 August). It is not part of `npm test`.

`npm run year` runs the best survivor the sim can hold: a kitted camp with
every producer, all six skills at 20, the reference list, from 1 April for
a year, on the five seeds. It prints a line on the first of each month
(kcal eaten and burned a day, the stock at camp), the day of the first
hang and the first large-game kill, the week before the death, and the
outcome; the gate is alive after a year on 4 seeds. `--level=N` sets the
skills, `--fresh` runs the arrival kit at level 1, `--winter` runs a
stocked December camp to 1 March (the winter gate), `--start=<doy>` opens
on another day. About a minute; not part of `npm test`. The survivor is a
diagnostic, not a claim about players: if this one cannot live a year, no
lineage can.

`npm run december` runs thirty days of that stocked December camp against
the shortest days of the year and prints, per seed, hours asleep a day,
hours of work by light and by dark with the dark morning split from the
dark evening, the median hour the body falls asleep and wakes, and how
many sleeps begin in daylight. It is the only probe that reads the working
day against the sun, which is what the sleep model was written to change.
`--days=N` and `--level=N` change the span and the skills. About a minute;
not part of `npm test`, and it has no gate: every line is a reading.


## Debug URL parameters

- For an ordinary wildlife encounter, follow the
  [natural seed 19 playtest](natural-wildlife-playtest.md): land, then click
  the deer one map cell west of the survivor for a 300 m walk.
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
- `?faces=1` opens the face self-test page (`faces.html`): locally generated
  Toon Head identities at 64px and 24px, the full expression set, layered
  focused, hot, cold and firelit states, plus blink, glance and flavor motion.
  It is the review surface for portrait variety and legibility, not a game
  feature.

