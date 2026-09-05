# Survidle: the risk forecast (roadmap item B)

The roadmap's item B: an honest number for away risk. The simulation
itself is run forward from the current state, several times with
different dice, and the deaths are counted per horizon. The first row is
the away cap, which becomes a dial the player sets per run. The month
row's number is logged once a game day into the life record, where the
journal, the epitaph and the evolution view read it later.

Two facts this spec rests on, measured at main 54b6d35 with a throwaway
script: a game day of the sim with a runner on the reference list costs
about 14 ms (30 days in 410 ms on seed 17, kitted with orders); a bare
day with nobody acting costs under 1 ms. A save round trip of a 30-day
state is 36 KB and under half a millisecond. So ten runs of a month are
about four seconds of one core, ten runs of a week under a second, and
ten runs of an eight-hour away row about fifty milliseconds.

The burn side's readings (the roadmap's calibration-pass paragraph of
that name) say what the forecast will read on a fresh April start: every
reference survivor starves between day 34 and day 52, every August heir
by day 59. The forecast does not fix that; it makes it legible, which is
what the tester round needs from it.

## Decisions taken by the author's pre-approval

The author pre-approved the spec and asked for the work to proceed
without questions. The calls below are the ones a brainstorm would have
asked; each names the alternative it passed over.

- **Ten runs per horizon, seeded from the state.** Run k of a forecast
  uses `derive(state.rng, k)` as its dice, so the same state forecasts
  the same numbers twice, and a click that draws from the stream changes
  them, as the roadmap says it should. Passed over: a fixed run count per
  horizon scaled to cost (more runs for short rows). Ten is enough to say
  "7 of 10" and few enough to fit the month row in four seconds.
- **Four horizons: until you are back, tonight, a week, a month.** "Until
  you are back" is the away dial in game minutes. "Tonight" is the
  minutes to the next dawn from now. A week is 7 game days, a month 30
  (the roadmap's 43,200 steps). Passed over: a year row, which would cost
  fifty seconds and say nothing the month row does not.
- **The dial is per run, on the state, 1 to 24 hours, default 8.**
  `GameState.awayHours`. The offline catch-up and the background-tab
  catch-up both cap at `awayHours` real hours instead of the constant 24.
  It sits on the settings strip beside the sound controls, as a range
  input with its value spelled out, and on the forecast panel's first row
  as the row's own label. A save from before the field loads with 8.
  Passed over: keeping the cap at 24 and showing the dial as a forecast
  filter only, which would leave the world running a day after a player
  who meant eight hours; the roadmap says the dial is the net and the row
  is what makes it a choice.
- **A worker runs the rows, shortest first, and posts each as it lands.**
  The main thread posts a state snapshot with a request id; the worker
  builds the world once from `state.seed` and keeps it, runs the four
  horizons in order, yields to its message queue between runs so a newer
  request can supersede an older one mid-forecast, and posts one message
  per finished row. Passed over: running the away row on the main thread
  for a faster first number; fifty milliseconds in a worker is fast
  enough and keeps one code path.
- **Recompute on the list, the day, the dial, and once a game hour.** The
  orders list changing, the game day rolling, the dial moving, and the
  player moving region each post a request at once; otherwise a request
  is posted at most once a game hour, since the stocks and the body change
  every minute and the month row costs four seconds. Passed over: a hash
  of what the forecast reads; the hour cadence is simpler and the rows
  say how old they are.
- **The month number is the count of ten runs alive after thirty days.**
  An integer 0 to 10, written into `LifeRecord.forecast[day - 1]` the
  first time a month row lands on that game day, replacing the null the
  daily step pushed. A day the tab was closed keeps its null. Passed
  over: a share 0 to 1 (the same information, less legible in the
  journal's series) and a death-day median (a different number the row
  already shows in its text).
- **The table is honest about what it does not know yet.** A row that has
  not landed for the current request shows its previous value dimmed
  with "..."; a row with no previous value shows only "...". The row text
  is "N of 10 die: cause, day D" with the commonest cause among the dead
  and the median death day among them, or "none of 10 die". Passed over:
  percentages, which the roadmap suggested; "7 of 10" is the same number
  said the way a person says it.
- **The forecast is a pure function first.** `forecast(state, world,
  horizons, runs)` in `src/sim/forecast.ts` runs on any thread and is
  what the tests exercise; the worker and the panel are its two callers.
  Passed over: a forecast that lives in the worker only, which could not
  be tested without a worker shim.

## 1. The pure forecast

`src/sim/forecast.ts`:

```ts
export interface Horizon { id: "away" | "tonight" | "week" | "month"; minutes: number }
export interface ForecastRow {
  id: Horizon["id"];
  runs: number;
  died: number;
  /** The commonest cause among the dead, or null when none died. Ties: the earliest median death day wins, then the first in DeathCause order. */
  cause: DeathCause | null;
  /** The median game day of death among the dead, counted from the forecast's start day as day 1, or null. */
  day: number | null;
}
export function horizons(state: GameState): Horizon[];
export function forecastRow(state: GameState, world: World, horizon: Horizon, runs: number): ForecastRow;
export function forecast(state: GameState, world: World, runs = FORECAST_RUNS): ForecastRow[];
export const FORECAST_RUNS = 10;
```

`horizons(state)` returns the four in order: away at
`state.awayHours * 60 * GAME_MINUTES_PER_REAL_SECOND * 60` game minutes
(an hour of real time is 60 game minutes at the game scale; the constant
is read, not assumed), tonight at `minutesUntilDawn(state.minute,
state.startDoy)`, week at `7 * 1440`, month at `30 * 1440`.

`forecastRow` runs the horizon `runs` times. Each run:

- `const s = structuredClone(state)`; `s.rng = derive(state.rng, k)` for
  run k, 0-based. The clone carries the orders, the stocks, the body and
  the weather exactly as the live game has them.
- `advance(s, world, horizon.minutes)` in one call, the same steps the
  foreground loop and the catch-up take. The runner acts as it does in
  the live game: the orders list, the needs, the auto-eat and auto-drink.
  A player with no orders forecasts a camp where the body only answers
  its needs, which is what leaving now means.
- The run died if `s.dead` is set; its cause and day are read from
  `s.dead` (the same shape the epitaph reads). The day is
  `dayNumber(s.dead.minute) - dayNumber(state.minute) + 1`.

`forecast` maps `horizons(state)` through `forecastRow`. It is
synchronous and blocks for the sum of its rows; only tests and the worker
call it, and the worker calls it one row at a time (section 2).

The dead-state read: `state.dead` today carries the cause and the minute
of death (`Died` in types.ts, which the epitaph reads). If it lacks the
minute, the plan adds it in the same task as this file, with the epitaph
untouched.

The pure function never touches `state.record.forecast`; writing the
month number is the panel's job (section 3), since only the live state's
record is the one the journal reads.

## 2. The worker

`src/sim/forecast.worker.ts`, a module worker Vite bundles from
`new Worker(new URL("./sim/forecast.worker.ts", import.meta.url), { type: "module" })`.

Messages in: `{ kind: "forecast"; id: number; state: GameState }`.
Messages out: `{ kind: "row"; id: number; row: ForecastRow }`, one per
horizon, in horizon order.

The worker keeps `world` and the seed it was built for; a state with a
different `seed` rebuilds it. On a request it records `latest = id`,
then for each horizon: if `id !== latest`, stop; run `forecastRow`; post
the row; `await` a macrotask (`new Promise((r) => setTimeout(r, 0))`) so
queued requests are received before the next row starts. A superseded
request posts nothing further; its already-posted rows stand until the
newer request's rows replace them, which is why rows carry the id.

`src/sim/forecaster.ts` is the main thread's client: `createForecaster()`
returns `{ request(state): void; rows(): ForecastView; dispose(): void }`
where `ForecastView` is `{ id: number; rows: Partial<Record<Horizon["id"], ForecastRow & { stale: boolean }>> }`.
`request` clones nothing (postMessage structured-clones) and bumps the
id. A row message whose id is older than the latest request marks its
row `stale: true`; one with the latest id replaces the row unstaled.
Rows from an older request stay in the view, staled, until the latest
request's row for that horizon lands. The client is what the panel
reads, and it is the only place a `Worker` is constructed, so a test can
build the view by feeding rows directly.

Environments without `Worker` (the headless harness, vitest under
happy-dom if it lacks it) get a client whose `request` runs `forecast`
synchronously and fills the view at once; `createForecaster` picks by
`typeof Worker`. Nothing in the harness scripts uses it today; the
fallback exists so `main.ts` has one code path and the browser pass and
the tests read the same view type.

## 3. The panel and the log

`forecastHtml(view, state)` in `src/ui/panels.ts`, rendered into a new
`<section id="forecast" class="panel">` placed after `#task` in the
right column (the UI pass that follows this item reflows the columns;
this spec adds one section and nothing else to the layout):

```
<h2>Ahead</h2>
until you are back (8 h)    3 of 10 die: cold, night 1
tonight                     none of 10 die
a week                      ...  (dimmed previous value, if any)
a month                     7 of 10 die: starved, day 24
```

Row text rules: "N of 10 die: cause, day D" with the cause word the
epitaph uses for that `DeathCause` and D the median day; for the away
and tonight rows, "night 1" replaces "day 1" when the median death falls
before the next dawn, since that is what the roadmap's example says and
what the player means by tonight. "none of 10 die" when `died` is 0. A
row not yet landed for the current request shows the previous row's text
in the dimmed class with "..." appended, or "..." alone.

Under the table, the dial: `away up to <input type="range" min="1"
max="24" value="8"> 8 hours`, wired to `state.awayHours`. The same input
is mirrored on the settings strip beside the sound controls; both write
the one field and re-render.

Writing the month number: when a month row lands with the latest id, and
`state.record.forecast[day - 1]` for the current game day is `null`, set
it to `10 - row.died` (alive of ten). A row that lands on a later day
than it was requested writes nothing (the day rolled; the next request
covers it). Nothing else in the record changes; the journal, the epitaph
and the evolution view read the series later, as the idle-curve spec
says.

Requests: `main.ts` posts a request when the orders list changes (add,
remove, reorder: every path that mutates `regionState(...).orders` goes
through the decision points already in main.ts; the plan lists them),
when the game day rolls (the daily step's hook, read from
`dayNumber(state.minute)` changing between frames), when the dial moves,
when the player's region changes, and otherwise once a game hour. No
request while `state.dead`, `state.landing` or `ui.away` is set; the
panel then shows nothing but its heading and the dial. After a catch-up
report is dismissed, one request.

## 4. The away cap as the dial

`MAX_OFFLINE_SECONDS` becomes a function of the state:
`awaySeconds(state) = state.awayHours * 3600`. `catchUp` reads it in
place of the constant; `main.ts`'s background-tab branch reads it for
`awayInfo`. The constant stays exported as `AWAY_HOURS_MAX = 24` and
`AWAY_HOURS_DEFAULT = 8`, both in `src/sim/save.ts` beside the catch-up
they bound, and the dial's range reads them. A save without `awayHours`
loads with the default (the `fillDefaults` block).

The roadmap's numbers hold: 24 hours is 60 game days at the game scale
only if the scale says so; the catch-up computes minutes from the scale
as it does today, and the dial's label prints hours of real time.

## 5. Tests

`tests/forecast.test.ts` (kept under two seconds: three runs, horizons
of a day or less, seeds 17 and 42):

- `horizons(state)` returns the four in order with the away row at the
  dial's minutes, tonight at the minutes to dawn, week 10,080, month
  43,200; moving the dial moves only the away row.
- Determinism: `forecastRow` twice on the same state gives equal rows;
  the live state is untouched by a forecast (its `minute`, `rng` and
  `log` length are what they were).
- The forecast runs the runner: a kitted camp with the reference list
  and a stocked larder, forecast a day, reads 0 of 3 dead; the same
  state with its orders removed and its stomach, water and warmth set
  low reads 3 of 3 dead with the cause the body dies of. A change to the
  runner changes the forecast by construction, and this test is the
  spec's claim that it does: it passes only because the run goes through
  `advance`.
- Cause and day: a state built to die of thirst on the second day reads
  cause "thirst" and day 2 on the week row with one run.
- The month number: feeding a month row into the view on a state whose
  record has a null for today writes `10 - died` into
  `record.forecast[day - 1]` and leaves other days alone; a second row
  the same day writes nothing.
- The client view: rows from an older id stale, rows from the latest id
  replace; a row for a horizon the latest request has not yet produced
  stays visible and stale.
- The dial: `awayHours` defaults to 8 on a new game and on a save
  without it; `catchUp` with `awayHours` 2 simulates at most 2 real
  hours of game minutes; `awaySeconds` is `awayHours * 3600`.
- The two-way check with the harness: the horizon's stocked stage on
  seed 17 (a camp the harness holds past 30 days on every seed)
  forecasts a week with 0 of 3 dead. Kept to a week so the test stays
  under a second; the month row on that stage is the browser pass's
  check.

`tests/survivor-ui.test.ts` or `tests/ui.test.ts`: `forecastHtml` renders
the four rows, the dimmed "..." for an unlanded row, "none of 10 die",
"night 1" for a tonight death before dawn, and the dial's value.

## 6. The browser pass

Chrome at 200x on seed 17: the Ahead panel fills within a few seconds of
landing, the away row first; adding a keep to the list changes the rows;
the dial at 2 hours relabels the first row and a reload after ten real
minutes away is capped by it (the away report says so); the month
number appears in the journal's series after the first game day (the
journal draws nothing yet; the record's array is checked in the console
via `window.survidle.state.record.forecast`). The horizon's stocked
stage, set up in the console, forecasts the month row as mostly alive.

## 7. What this does not do

- Draw the forecast series in the journal or the cemetery: the idle-curve
  spec's evolution view, which lands with the rest of F.
- Change the runner, the bands or the gates.
- The beacon's field for the month number: the testing infra, next.
- Any layout beyond one new section; the UI pass follows.
