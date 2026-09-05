# The Risk Forecast Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The game runs itself forward ten times per horizon in a worker and shows how many runs die and of what, the away cap becomes a per-run dial, and the month row's number is written into the life record daily.

**Architecture:** A pure `forecast.ts` (horizons, one row per horizon by cloning the state and calling the real `advance`), a worker that runs rows shortest first and posts each, a main-thread client that keeps a view with stale marks, a panel that renders the view, and a dial on the state that both the catch-up and the first row read. Nothing in the sim changes.

**Tech Stack:** TypeScript, Vite (module workers via `new Worker(new URL(...), { type: "module" })`), vitest with happy-dom. Run everything from `08-survidle/`. `npm test` must stay fast: forecast tests use three runs and horizons of a day or less.

**Spec:** `08-survidle/docs/superpowers/specs/2026-09-05-survidle-risk-forecast-design.md`

## Global Constraints

- Work on `main` in the primary clone, pre-approved by the author. Stage by explicit path under `08-survidle/`; never `git add -A`; never `git stash`. Other sessions commit docs to this clone concurrently.
- `FORECAST_RUNS` 10; horizons away, tonight, week (10,080 minutes), month (43,200 minutes) in that order; `AWAY_HOURS_DEFAULT` 8, `AWAY_HOURS_MAX` 24, minimum 1.
- Run k of a row uses `derive(state.rng, k)`; the live state is never mutated by a forecast.
- Row text: "N of 10 die: cause, day D" (the tonight row says "night D"), "none of 10 die", and a dimmed previous text plus "..." or "..." alone for a row not yet landed.
- The month number written into `current(state).forecast` is `runs - died`, an integer, into the last entry only when it is null.
- No em dashes and no non-typable unicode anywhere; code comments explain, never chronicle (no dates, no "before/after", no "now").
- Every commit: `npm test` green from `08-survidle/` and `npx tsc --noEmit` clean; never commit red. Commit messages end with:
  `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>` and
  `Claude-Session: https://claude.ai/code/session_01352zAHUpQPBdTDeXJ5SWVM`.

---

### Task 1: The away dial

**Files:**
- Modify: `src/units.ts` (constants), `src/sim/types.ts` (`GameState`), `src/sim/newgame.ts` (the state literal), `src/sim/save.ts` (`MAX_OFFLINE_SECONDS`, `catchUp`, `fillDefaults`), `src/main.ts` (every `MAX_OFFLINE_SECONDS` use), `index.html` (the dial markup)
- Create: `src/ui/dial.ts`
- Test: `tests/dial.test.ts`

**Interfaces:**
- Produces: `AWAY_HOURS_DEFAULT = 8`, `AWAY_HOURS_MAX = 24` in `units.ts`; `GameState.awayHours: number`; `awaySeconds(state: GameState): number` in `save.ts` (replaces the exported `MAX_OFFLINE_SECONDS`); `mountAwayDial(root: HTMLElement, get: () => number, set: (hours: number) => void): void` in `src/ui/dial.ts`.

- [ ] **Step 1: Write the failing tests**

Create `tests/dial.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { newGame } from "../src/sim/newgame";
import { awaySeconds, catchUp, deserialize, serialize } from "../src/sim/save";
import { mountAwayDial } from "../src/ui/dial";
import { AWAY_HOURS_DEFAULT, AWAY_HOURS_MAX, GAME_MINUTES_PER_REAL_SECOND } from "../src/units";

describe("the away dial", () => {
  it("is eight hours on a new game and on a save without it, and caps at twenty-four", () => {
    const { state } = newGame(1);
    expect(AWAY_HOURS_DEFAULT).toBe(8);
    expect(AWAY_HOURS_MAX).toBe(24);
    expect(state.awayHours).toBe(8);
    const raw = JSON.parse(serialize(state));
    delete raw.state.awayHours;
    expect(deserialize(JSON.stringify(raw))!.state.awayHours).toBe(8);
  });

  it("awaySeconds is the dial in seconds", () => {
    const { state } = newGame(1);
    expect(awaySeconds(state)).toBe(8 * 3600);
    state.awayHours = 2;
    expect(awaySeconds(state)).toBe(7200);
  });

  it("the catch-up simulates at most the dial's hours, whatever the real time away", () => {
    const { state, world } = newGame(17);
    state.awayHours = 2;
    const from = state.minute;
    catchUp(state, world, 10 * 3600);
    expect(state.minute - from).toBe(2 * 3600 * GAME_MINUTES_PER_REAL_SECOND);
  });

  it("the dial reads the state, writes it on input, and labels the hours", () => {
    const root = document.createElement("div");
    root.innerHTML = `<input type="range" data-away="hours"><b data-away="label"></b>`;
    let hours = 8;
    mountAwayDial(root, () => hours, (h) => { hours = h; });
    const input = root.querySelector<HTMLInputElement>("[data-away=hours]")!;
    const label = root.querySelector<HTMLElement>("[data-away=label]")!;
    expect(input.value).toBe("8");
    expect(input.min).toBe("1");
    expect(input.max).toBe("24");
    expect(label.textContent).toBe("8 hours");
    input.value = "2";
    input.dispatchEvent(new Event("input"));
    expect(hours).toBe(2);
    expect(label.textContent).toBe("2 hours");
    input.value = "1";
    input.dispatchEvent(new Event("input"));
    expect(label.textContent).toBe("1 hour");
  });
});
```

Check the vitest environment: if `tests/ui.test.ts` uses a `// @vitest-environment happy-dom` header or the config sets happy-dom globally, follow the same for this file so `document` exists.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/dial.test.ts`
Expected: FAIL on missing exports (`awaySeconds`, `mountAwayDial`, `AWAY_HOURS_DEFAULT`).

- [ ] **Step 3: Constants, the field, the defaults**

`src/units.ts`, after `GAME_MINUTES_PER_REAL_SECOND`:

```ts
/** Real hours the world runs on without the player before the catch-up caps: the away dial's default and ceiling. */
export const AWAY_HOURS_DEFAULT = 8;
export const AWAY_HOURS_MAX = 24;
```

`src/sim/types.ts`, in `GameState` beside `startDoy`:

```ts
  /** Real hours the world runs on without the player before the catch-up caps it: the away dial, 1 to AWAY_HOURS_MAX, set per run. */
  awayHours: number;
```

`src/sim/newgame.ts`: `awayHours: AWAY_HOURS_DEFAULT,` in the state literal, importing it from `../units`.

`src/sim/save.ts`: replace `export const MAX_OFFLINE_SECONDS = 24 * 3600;` with

```ts
/** The most real time a catch-up simulates: the run's away dial. The forecast's first row is this same span. */
export function awaySeconds(state: GameState): number {
  return state.awayHours * 3600;
}
```

In `catchUp`: `const seconds = Math.min(awaySeconds(state), Math.max(0, realSecondsElapsed));`. In `fillDefaults`: `state.awayHours ??= AWAY_HOURS_DEFAULT;` (import from `../units`).

`src/main.ts`: every `MAX_OFFLINE_SECONDS` becomes `awaySeconds(state)` (the import changes to `awaySeconds`).

- [ ] **Step 4: The dial**

`index.html`: after the `#sound` panel add

```html
        <div id="away" class="panel">
          <label>away up to <input type="range" min="1" max="24" step="1" data-away="hours" aria-label="hours away" /> <b data-away="label"></b></label>
        </div>
```

`src/ui/dial.ts`:

```ts
import { AWAY_HOURS_MAX } from "../units";

/**
 * The away dial: how many real hours the world runs on without the
 * player before the catch-up caps it. Static markup, mounted once like
 * the sound controls; the label spells the hours out.
 */
export function mountAwayDial(root: HTMLElement, get: () => number, set: (hours: number) => void): void {
  const input = root.querySelector<HTMLInputElement>("[data-away=hours]")!;
  const label = root.querySelector<HTMLElement>("[data-away=label]")!;
  input.min = "1";
  input.max = String(AWAY_HOURS_MAX);
  const show = (h: number) => { input.value = String(h); label.textContent = `${h} hour${h === 1 ? "" : "s"}`; };
  show(get());
  input.addEventListener("input", () => {
    const h = Math.min(AWAY_HOURS_MAX, Math.max(1, Math.round(Number(input.value) || 1)));
    set(h);
    show(h);
  });
}
```

`src/main.ts`, beside `mountControl(...)`: `mountAwayDial(document.getElementById("away")!, () => state.awayHours, (h) => { state.awayHours = h; });`. Task 4 adds the forecast request to that setter. When a new game or a loaded save replaces `state`, the dial reads through the getter, so nothing else is needed as long as `state` is the module-level binding the getter closes over; if `state` is reassigned on "begin again" or "leave world", confirm the closure reads the current binding (a `let state` at module scope does).

- [ ] **Step 5: Run the tests, the suite, tsc**

Run: `npx vitest run tests/dial.test.ts tests/advance-save.test.ts && npm test && npx tsc --noEmit`
Expected: all green. If an existing test imports `MAX_OFFLINE_SECONDS`, change it to `awaySeconds(state)` with the state it uses.

- [ ] **Step 6: Commit**

```bash
cd /Users/janis.kirsteins/Projects/prototypes
git add 08-survidle/src/units.ts 08-survidle/src/sim/types.ts 08-survidle/src/sim/newgame.ts 08-survidle/src/sim/save.ts 08-survidle/src/main.ts 08-survidle/index.html 08-survidle/src/ui/dial.ts 08-survidle/tests/dial.test.ts
git commit -m "feat(survidle): the away cap is a dial on the run, one to twenty-four hours"
```

---

### Task 2: The pure forecast

**Files:**
- Create: `src/sim/forecast.ts`
- Test: `tests/forecast.test.ts`

**Interfaces:**
- Consumes: `GameState.awayHours` (Task 1); `advance` from `advance.ts`; `derive` from `../rng`; `dayNumber`, `minutesUntilDawn` from `calendar.ts`; `GAME_MINUTES_PER_REAL_SECOND` from `../units`.
- Produces: `FORECAST_RUNS`, `type HorizonId`, `interface Horizon`, `interface ForecastRow`, `horizons(state)`, `forecastRow(state, world, horizon, runs?)`, `forecast(state, world, runs?)`, `CAUSE_WORD: Record<DeathCause, string>`.

- [ ] **Step 1: Write the failing tests**

Create `tests/forecast.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { minutesUntilDawn } from "../src/sim/calendar";
import { CAUSE_WORD, FORECAST_RUNS, forecast, forecastRow, horizons } from "../src/sim/forecast";
import { HORIZON_STAGES, setUpStage } from "../src/sim/horizon";
import { newGame } from "../src/sim/newgame";
import { addOrder } from "../src/sim/orders";
import { kitOut, REFERENCE_ORDERS } from "../src/sim/reference";
import { regionState } from "../src/sim/regionstate";
import { addItem, pile } from "../src/sim/inventory";
import { GAME_MINUTES_PER_REAL_SECOND } from "../src/units";

/** A kitted camp on seed 17 with the reference list and a stocked larder: a set-up that holds a day. */
function stocked() {
  const g = newGame(17);
  kitOut(g.state, g.world);
  for (const w of REFERENCE_ORDERS) addOrder(g.state, g.world, w.req, w.kind);
  addItem(pile(g.state, regionState(g.state, g.world, g.state.player.region).campCell), "driedMeat", 5);
  return g;
}

describe("the horizons", () => {
  it("are the dial, tonight, a week and a month, in that order", () => {
    const { state } = newGame(1);
    const h = horizons(state);
    expect(h.map((x) => x.id)).toEqual(["away", "tonight", "week", "month"]);
    expect(h[0].minutes).toBe(8 * 3600 * GAME_MINUTES_PER_REAL_SECOND);
    expect(h[1].minutes).toBe(minutesUntilDawn(state.minute, state.startDoy));
    expect(h[2].minutes).toBe(7 * 1440);
    expect(h[3].minutes).toBe(30 * 1440);
    state.awayHours = 2;
    expect(horizons(state)[0].minutes).toBe(2 * 3600 * GAME_MINUTES_PER_REAL_SECOND);
    expect(horizons(state)[1].minutes).toBe(h[1].minutes);
    expect(FORECAST_RUNS).toBe(10);
  });
});

describe("a forecast row", () => {
  it("is deterministic and leaves the live state untouched", () => {
    const { state, world } = stocked();
    const minute = state.minute;
    const rng = state.rng;
    const logLen = state.log.length;
    const a = forecastRow(state, world, { id: "away", minutes: 240 }, 3);
    const b = forecastRow(state, world, { id: "away", minutes: 240 }, 3);
    expect(a).toEqual(b);
    expect(state.minute).toBe(minute);
    expect(state.rng).toBe(rng);
    expect(state.log.length).toBe(logLen);
  });

  it("runs the runner: a stocked camp with its list holds a day, the same body with nothing left does not", () => {
    const { state, world } = stocked();
    const alive = forecastRow(state, world, { id: "tonight", minutes: 1440 }, 3);
    expect(alive).toEqual({ id: "tonight", runs: 3, died: 0, cause: null, day: null });
    regionState(state, world, state.player.region).orders = [];
    state.player.kcal = 0;
    state.player.fat = 0;
    state.player.health = 3;
    const dead = forecastRow(state, world, { id: "week", minutes: 7 * 1440 }, 3);
    expect(dead.died).toBe(3);
    expect(dead.cause).toBe("starved");
    expect(dead.day).toBe(1);
  });

  it("forecast maps every horizon, and the cause words are the ones the panel prints", () => {
    const { state, world } = stocked();
    state.awayHours = 1;
    const rows = forecast(state, world, 1).filter((r) => r.id === "away" || r.id === "tonight");
    expect(rows.map((r) => r.id)).toEqual(["away", "tonight"]);
    expect(CAUSE_WORD.starved).toBe("starved");
    expect(CAUSE_WORD.froze).toBe("cold");
    expect(CAUSE_WORD.gaveUp).toBe("gave up");
  });

  it("agrees with the harness: the horizon's stocked stage holds a week", () => {
    const { state, world } = setUpStage(17, HORIZON_STAGES[4]);
    const row = forecastRow(state, world, { id: "week", minutes: 7 * 1440 }, 3);
    expect(row.died).toBe(0);
  });
});
```

The `forecast` test above filters to the two short rows but `forecast` runs all four; to keep the test under a second, call `forecastRow` on `horizons(state).slice(0, 2)` instead of `forecast` if the full call is slow, and say so in a comment. The month row with one run on a stocked camp is about half a second, so the full call is acceptable if the file stays under two seconds.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/forecast.test.ts`
Expected: FAIL, module `../src/sim/forecast` not found.

- [ ] **Step 3: Implement**

Create `src/sim/forecast.ts`:

```ts
/**
 * The risk forecast (roadmap item B): the game itself run forward from
 * the current state, several times with different dice, and the deaths
 * counted per horizon. Every run goes through advance with the orders,
 * the needs and the stocks exactly as the live game has them, so a
 * change to the runner changes the forecast by construction.
 */
import { derive } from "../rng";
import { GAME_MINUTES_PER_REAL_SECOND } from "../units";
import type { World } from "../world/gen";
import { advance } from "./advance";
import { dayNumber, minutesUntilDawn } from "./calendar";
import type { DeathCause, GameState } from "./types";

/** Runs per horizon: enough to say "7 of 10", few enough for a month row in a few seconds. */
export const FORECAST_RUNS = 10;

export type HorizonId = "away" | "tonight" | "week" | "month";
export interface Horizon { id: HorizonId; minutes: number }

export interface ForecastRow {
  id: HorizonId;
  runs: number;
  died: number;
  /** The commonest cause among the dead; a tie goes to the cause whose median death came soonest, then to CAUSES order. Null when none died. */
  cause: DeathCause | null;
  /** The median day of death among the dead, the forecast's own day being 1. Null when none died. */
  day: number | null;
}

/** The word the panel prints for a cause. */
export const CAUSE_WORD: Record<DeathCause, string> = {
  starved: "starved", froze: "cold", wolves: "wolves", sickness: "sickness", thirst: "thirst", smoke: "smoke", drowned: "drowned", gaveUp: "gave up",
};
const CAUSES = Object.keys(CAUSE_WORD) as DeathCause[];

/** The four horizons in order: the away dial, the next dawn, a week, a month. */
export function horizons(state: GameState): Horizon[] {
  return [
    { id: "away", minutes: state.awayHours * 3600 * GAME_MINUTES_PER_REAL_SECOND },
    { id: "tonight", minutes: minutesUntilDawn(state.minute, state.startDoy) },
    { id: "week", minutes: 7 * 1440 },
    { id: "month", minutes: 30 * 1440 },
  ];
}

function median(sorted: number[]): number {
  return sorted[Math.floor((sorted.length - 1) / 2)];
}

/** One horizon, `runs` times, each run on a clone of the state with its own dice. */
export function forecastRow(state: GameState, world: World, horizon: Horizon, runs = FORECAST_RUNS): ForecastRow {
  const deaths: { cause: DeathCause; day: number }[] = [];
  for (let k = 0; k < runs; k++) {
    const s = structuredClone(state);
    s.rng = derive(state.rng, k);
    // A day at a time, so a run that dies stops costing.
    for (let left = horizon.minutes; left > 0 && !s.dead; left -= 1440) advance(s, world, Math.min(1440, left));
    if (s.dead) deaths.push({ cause: s.dead.cause, day: dayNumber(s.dead.minute) - dayNumber(state.minute) + 1 });
  }
  if (deaths.length === 0) return { id: horizon.id, runs, died: 0, cause: null, day: null };
  let best: { cause: DeathCause; n: number; day: number } | null = null;
  for (const c of CAUSES) {
    const days = deaths.filter((d) => d.cause === c).map((d) => d.day).sort((a, b) => a - b);
    if (days.length === 0) continue;
    const day = median(days);
    if (!best || days.length > best.n || (days.length === best.n && day < best.day)) best = { cause: c, n: days.length, day };
  }
  return { id: horizon.id, runs, died: deaths.length, cause: best!.cause, day: median(deaths.map((d) => d.day).sort((a, b) => a - b)) };
}

/** Every horizon in order. Synchronous; the worker calls forecastRow one horizon at a time instead. */
export function forecast(state: GameState, world: World, runs = FORECAST_RUNS): ForecastRow[] {
  return horizons(state).map((h) => forecastRow(state, world, h, runs));
}
```

Check `advance`'s signature (`advance(state, world, dtMinutes, opts?)`) and that stepping a dead state is harmless (it already is for the tombstone's frame loop; the day-chunk loop above stops on `s.dead` regardless).

- [ ] **Step 4: Run the tests, the suite, tsc**

Run: `npx vitest run tests/forecast.test.ts && npm test && npx tsc --noEmit`
Expected: green; `tests/forecast.test.ts` under two seconds. If the starved-in-a-day test reads a different cause or day, read what the body did (`s.dead`, the log) and report it rather than loosening the assertion: a body with no fat and three health starves inside hours at the sim's starve drain.

- [ ] **Step 5: Commit**

```bash
cd /Users/janis.kirsteins/Projects/prototypes
git add 08-survidle/src/sim/forecast.ts 08-survidle/tests/forecast.test.ts
git commit -m "feat(survidle): the forecast runs the game forward per horizon and counts the deaths"
```

---

### Task 3: The client and the worker

**Files:**
- Create: `src/sim/forecaster.ts`, `src/sim/forecast.worker.ts`
- Test: `tests/forecaster.test.ts`

**Interfaces:**
- Consumes: `forecastRow`, `horizons`, `forecast`, `ForecastRow`, `HorizonId` (Task 2); `generateWorld` from `../world/gen` (confirm `newGame` builds its world with it, and use the same call).
- Produces: `interface ViewRow extends ForecastRow { stale: boolean }`, `interface ForecastView { id: number; rows: Partial<Record<HorizonId, ViewRow>> }`, `emptyView()`, `beginRequest(view, id)`, `applyRow(view, id, row)`, `interface Forecaster { request(state): void; view(): ForecastView; dispose(): void }`, `createForecaster(world, worker?)`. The worker's message shapes `ForecastRequest` and `ForecastReply`.

- [ ] **Step 1: Write the failing tests**

Create `tests/forecaster.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { ForecastRow } from "../src/sim/forecast";
import { applyRow, beginRequest, createForecaster, emptyView } from "../src/sim/forecaster";
import { newGame } from "../src/sim/newgame";

const row = (id: ForecastRow["id"], died = 0): ForecastRow => ({ id, runs: 10, died, cause: died ? "starved" : null, day: died ? 3 : null });

describe("the forecast view", () => {
  it("a new request stales every row; rows with the latest id replace, older ones only fill a gap", () => {
    const v = emptyView();
    beginRequest(v, 1);
    applyRow(v, 1, row("away"));
    applyRow(v, 1, row("month", 7));
    expect(v.rows.away).toEqual({ ...row("away"), stale: false });
    beginRequest(v, 2);
    expect(v.rows.away!.stale).toBe(true);
    expect(v.rows.month!.stale).toBe(true);
    applyRow(v, 2, row("away", 1));
    expect(v.rows.away).toEqual({ ...row("away", 1), stale: false });
    // A late row from request 1 for a horizon request 2 has not produced yet fills the gap, staled.
    applyRow(v, 1, row("week", 2));
    expect(v.rows.week).toEqual({ ...row("week", 2), stale: true });
    // A late row for a horizon request 2 already produced is ignored.
    applyRow(v, 1, row("away", 9));
    expect(v.rows.away!.died).toBe(1);
    // A row for a horizon the current request has already filled, from the current request, replaces.
    applyRow(v, 2, row("month", 4));
    expect(v.rows.month).toEqual({ ...row("month", 4), stale: false });
  });

  it("without a worker the client forecasts synchronously and the view is complete at once", () => {
    const { state, world } = newGame(17);
    state.awayHours = 1;
    const f = createForecaster(world, undefined, 1);
    f.request(state);
    const v = f.view();
    expect(v.id).toBe(1);
    expect(Object.keys(v.rows).sort()).toEqual(["away", "month", "tonight", "week"]);
    expect(Object.values(v.rows).every((r) => r!.stale === false)).toBe(true);
    f.request(state);
    expect(f.view().id).toBe(2);
    f.dispose();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/forecaster.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement the client**

Create `src/sim/forecaster.ts`:

```ts
/**
 * The main thread's side of the forecast: a view of rows with stale
 * marks, filled by a worker that posts one row per horizon as it lands,
 * or filled at once by the pure forecast where there is no worker (the
 * headless harness, the tests).
 */
import type { World } from "../world/gen";
import { forecast, type ForecastRow, type HorizonId } from "./forecast";
import type { GameState } from "./types";

export interface ViewRow extends ForecastRow { stale: boolean }
export interface ForecastView { id: number; rows: Partial<Record<HorizonId, ViewRow>> }

export interface ForecastRequest { kind: "forecast"; id: number; state: GameState }
export interface ForecastReply { kind: "row"; id: number; row: ForecastRow }

export function emptyView(): ForecastView {
  return { id: 0, rows: {} };
}

/** A new request: every row on show is from an older state until its replacement lands. */
export function beginRequest(view: ForecastView, id: number): void {
  view.id = id;
  for (const r of Object.values(view.rows)) if (r) r.stale = true;
}

/** A row from the latest request replaces; one from an older request only fills a horizon nothing has landed for, and stays stale. */
export function applyRow(view: ForecastView, id: number, row: ForecastRow): void {
  if (id === view.id) view.rows[row.id] = { ...row, stale: false };
  else if (id < view.id && !view.rows[row.id]) view.rows[row.id] = { ...row, stale: true };
}

export interface Forecaster {
  request(state: GameState): void;
  view(): ForecastView;
  /** Called with each row from the latest request as it lands. */
  onRow?: (row: ForecastRow) => void;
  dispose(): void;
}

/** With a worker, rows land as messages; without one, the pure forecast fills the view before request returns. `runs` is for the synchronous path only. */
export function createForecaster(world: World, worker?: Worker, runs?: number): Forecaster {
  const view = emptyView();
  let next = 0;
  const f: Forecaster = {
    request(state) {
      const id = ++next;
      beginRequest(view, id);
      if (worker) {
        const msg: ForecastRequest = { kind: "forecast", id, state };
        worker.postMessage(msg);
      } else {
        for (const row of forecast(state, world, runs)) {
          applyRow(view, id, row);
          f.onRow?.(row);
        }
      }
    },
    view: () => view,
    dispose() { worker?.terminate(); },
  };
  worker?.addEventListener("message", (ev: MessageEvent<ForecastReply>) => {
    if (ev.data?.kind !== "row") return;
    applyRow(view, ev.data.id, ev.data.row);
    if (ev.data.id === view.id) f.onRow?.(ev.data.row);
  });
  return f;
}
```

- [ ] **Step 4: Implement the worker**

Create `src/sim/forecast.worker.ts`:

```ts
/**
 * The forecast's worker: builds the world once per seed, runs the
 * horizons shortest first and posts each row as it lands, yielding to
 * its queue between rows so a newer request supersedes an older one.
 */
import { generateWorld, type World } from "../world/gen";
import { forecastRow, horizons } from "./forecast";
import type { ForecastReply, ForecastRequest } from "./forecaster";

const ctx = self as unknown as { postMessage(m: ForecastReply): void; onmessage: ((ev: MessageEvent<ForecastRequest>) => void) | null };
let world: World | null = null;
let seed = Number.NaN;
let latest = 0;

ctx.onmessage = async (ev) => {
  const { id, state } = ev.data;
  latest = id;
  if (!world || seed !== state.seed) {
    world = generateWorld(state.seed);
    seed = state.seed;
  }
  for (const h of horizons(state)) {
    if (id !== latest) return;
    const row = forecastRow(state, world, h);
    if (id !== latest) return;
    ctx.postMessage({ kind: "row", id, row });
    await new Promise((r) => setTimeout(r, 0));
  }
};
```

Confirm in `src/sim/newgame.ts` how the world is built (`generateWorld(seed)` or a wrapper) and use exactly that call so the worker's world equals the live one. If `tsconfig.json`'s `lib` lacks `webworker`, the `self` cast above is enough; do not change the tsconfig.

- [ ] **Step 5: Run the tests, the suite, tsc**

Run: `npx vitest run tests/forecaster.test.ts && npm test && npx tsc --noEmit`
Expected: green.

- [ ] **Step 6: Commit**

```bash
cd /Users/janis.kirsteins/Projects/prototypes
git add 08-survidle/src/sim/forecaster.ts 08-survidle/src/sim/forecast.worker.ts 08-survidle/tests/forecaster.test.ts
git commit -m "feat(survidle): a forecast worker posts each horizon as it lands, and a view keeps the rows with their age"
```

---

### Task 4: The panel, the month number, the requests

**Files:**
- Modify: `index.html` (the section), `src/ui/panels.ts` (`forecastHtml`), `src/main.ts` (the forecaster, the requests, the render, the dial's setter), `src/sim/forecaster.ts` (`noteMonthRow`)
- Test: `tests/forecaster.test.ts` (the month number), `tests/ui.test.ts` (the panel)

**Interfaces:**
- Consumes: Tasks 1 to 3.
- Produces: `forecastHtml(view: ForecastView | null, state: GameState): string` in `panels.ts`; `noteMonthRow(state: GameState, row: ForecastRow): boolean` in `forecaster.ts`.

- [ ] **Step 1: Write the failing tests**

Append to `tests/forecaster.test.ts`:

```ts
import { current } from "../src/sim/record";
import { noteMonthRow } from "../src/sim/forecaster";

describe("the month number", () => {
  it("fills the last null of the life record with the runs alive, once per day, and ignores other rows", () => {
    const { state } = newGame(17);
    const rec = current(state);
    expect(noteMonthRow(state, row("month", 3))).toBe(false);
    rec.forecast.push(null, null);
    expect(noteMonthRow(state, row("week", 3))).toBe(false);
    expect(rec.forecast).toEqual([null, null]);
    expect(noteMonthRow(state, row("month", 3))).toBe(true);
    expect(rec.forecast).toEqual([null, 7]);
    expect(noteMonthRow(state, row("month", 9))).toBe(false);
    expect(rec.forecast).toEqual([null, 7]);
  });
});
```

Append to `tests/ui.test.ts` (match its imports and environment):

```ts
describe("the forecast panel", () => {
  it("prints each row, the dimmed unlanded ones, and the dial's hours", () => {
    const { state } = newGame(17);
    state.awayHours = 3;
    const v = emptyView();
    beginRequest(v, 1);
    applyRow(v, 1, { id: "away", runs: 10, died: 0, cause: null, day: null });
    applyRow(v, 1, { id: "tonight", runs: 10, died: 3, cause: "froze", day: 1 });
    applyRow(v, 1, { id: "month", runs: 10, died: 7, cause: "starved", day: 24 });
    beginRequest(v, 2);
    applyRow(v, 2, { id: "away", runs: 10, died: 1, cause: "wolves", day: 1 });
    const html = forecastHtml(v, state);
    expect(html).toContain("until you are back (3 h)");
    expect(html).toContain("1 of 10 die: wolves, day 1");
    expect(html).toContain("3 of 10 die: cold, night 1");
    expect(html).toContain("7 of 10 die: starved, day 24");
    expect(html).toMatch(/class="dim"[^>]*>a week<\/span>[\s\S]*?\.\.\./);
    expect(html).toContain("none of 10 die");
    expect(forecastHtml(null, state)).toContain("<h2>Ahead</h2>");
  });
});
```

Adjust the regex for the dimmed week row to the markup you write, keeping the assertion that the week row is dimmed and ends in "...". The "none of 10 die" text belongs to the away row of request 1 before request 2 replaced it, so assert it on a view where the away row died 0: build a second small view for that line if the first has none.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/forecaster.test.ts tests/ui.test.ts`
Expected: FAIL on missing `noteMonthRow` and `forecastHtml`.

- [ ] **Step 3: The month number**

In `src/sim/forecaster.ts`:

```ts
import { current } from "./record";

/**
 * The month row's number into the life record: the runs alive of ten,
 * into today's entry (the last one the daily step pushed) if it is
 * still null. False when there is no entry yet or it is already
 * written. The journal and the evolution view read the series later.
 */
export function noteMonthRow(state: GameState, row: ForecastRow): boolean {
  if (row.id !== "month") return false;
  const f = current(state).forecast;
  const i = f.length - 1;
  if (i < 0 || f[i] !== null) return false;
  f[i] = row.runs - row.died;
  return true;
}
```

- [ ] **Step 4: The panel**

`index.html`: after `<section id="task" class="panel"></section>` add `<section id="forecast" class="panel"></section>`.

In `src/ui/panels.ts` (imports: `CAUSE_WORD`, `type ForecastRow`, `type HorizonId` from `../sim/forecast`; `type ForecastView` from `../sim/forecaster`):

```ts
const HORIZON_LABEL: Record<HorizonId, (state: GameState) => string> = {
  away: (s) => `until you are back (${s.awayHours} h)`,
  tonight: () => "tonight",
  week: () => "a week",
  month: () => "a month",
};

/** "N of 10 die: cause, day D", the tonight row counting nights; "none of 10 die" when nothing died. */
export function forecastRowText(row: ForecastRow): string {
  if (row.died === 0) return `none of ${row.runs} die`;
  const unit = row.id === "tonight" ? "night" : "day";
  return `${row.died} of ${row.runs} die: ${CAUSE_WORD[row.cause!]}, ${unit} ${row.day}`;
}

/** The Ahead panel: one line per horizon, the ones not yet landed for the latest request dimmed with "...". */
export function forecastHtml(view: ForecastView | null, state: GameState): string {
  const ids: HorizonId[] = ["away", "tonight", "week", "month"];
  const rows = ids.map((id) => {
    const r = view?.rows[id];
    const label = HORIZON_LABEL[id](state);
    if (!r) return `<div class="row"><span class="dim">${label}</span><span class="dim r">...</span></div>`;
    if (r.stale) return `<div class="row"><span class="dim">${label}</span><span class="dim r">${esc(forecastRowText(r))} ...</span></div>`;
    return `<div class="row"><span>${label}</span><span class="r">${esc(forecastRowText(r))}</span></div>`;
  });
  return `<h2>Ahead</h2>${rows.join("")}`;
}
```

If `panels.ts` has a row helper or a `.row`/`.r` convention already, use it instead of the markup above and keep the class names the test looks for (`dim`); add a `.row` rule to `style.css` only if none exists (flex, space-between, the `.dim` class already exists or gets `opacity: .55`).

- [ ] **Step 5: The wiring in main.ts**

Near the top, after `world` and `state` exist:

```ts
import { createForecaster, noteMonthRow } from "./sim/forecaster";
import { forecastHtml } from "./ui/panels";
import { dayNumber } from "./sim/calendar";

const forecaster = createForecaster(world, typeof Worker === "undefined" ? undefined : new Worker(new URL("./sim/forecast.worker.ts", import.meta.url), { type: "module" }));
forecaster.onRow = (row) => { noteMonthRow(state, row); };
let forecastAt = { minute: -Infinity, day: -1, region: -1 };

/** A request when nothing overlays the game: the list, the day, the dial, the region and the hour each call this; the frame calls it on a cadence. */
function requestForecast(): void {
  if (state.dead || state.landing || ui.away) return;
  forecaster.request(state);
  forecastAt = { minute: state.minute, day: dayNumber(state.minute), region: state.player.region };
}
```

In `frame`, after the `advance(...)` call in the not-away branch:

```ts
      if (state.minute - forecastAt.minute >= 60 || dayNumber(state.minute) !== forecastAt.day || state.player.region !== forecastAt.region) requestForecast();
```

In `render`, after `setPanel("task", ...)`: `setPanel("forecast", forecastHtml(forecaster.view(), state));`.

In `onClick`, after the `switch` (before the render call that follows it), for the actions that change what the forecast reads: `if (["task", "stop", "intent", "order-up", "order-down", "order-remove", "dismiss", "eat", "feed", "drink", "fill", "take", "drop", "drop-all", "toggle-eat", "toggle-feed", "toggle-drink"].includes(target.dataset.act!)) requestForecast();`. Put the list in a `const FORECAST_ACTS` beside `requestForecast`.

The dial's setter from Task 1 becomes `(h) => { state.awayHours = h; requestForecast(); }`.

Where the game starts over (new world, "begin again", the landing's confirm) and `state` is replaced or reset, `forecastAt` resets to its initial value so the first frame requests; find each such site (the places that call `resetPanels()` are the ones) and add `forecastAt = { minute: -Infinity, day: -1, region: -1 };`. If `state` is a `const` reassigned by mutation rather than a `let`, the forecaster's closure is fine as is.

- [ ] **Step 6: Run the tests, the suite, tsc, and a build**

Run: `npx vitest run tests/forecaster.test.ts tests/ui.test.ts && npm test && npx tsc --noEmit && npm run build 2>&1 | tail -5`
Expected: green, and the build lists a worker chunk (a file named like `forecast.worker-*.js` in `dist/assets`). If the build fails on the worker URL, the fix is Vite's documented form `new Worker(new URL("./sim/forecast.worker.ts", import.meta.url), { type: "module" })`, exactly as written, with no variable in the URL.

- [ ] **Step 7: Commit**

```bash
cd /Users/janis.kirsteins/Projects/prototypes
git add 08-survidle/index.html 08-survidle/src/ui/panels.ts 08-survidle/src/main.ts 08-survidle/src/sim/forecaster.ts 08-survidle/tests/forecaster.test.ts 08-survidle/tests/ui.test.ts
# plus 08-survidle/src/style.css if a rule was added
git commit -m "feat(survidle): the Ahead panel - four horizons of deaths counted, the month number into the life record"
```

---

### Task 5: The docs

**Files:**
- Modify: `docs/superpowers/specs/2026-09-03-survidle-realism-roadmap.md` (the build-order sentence for B; a "Built" paragraph at the end of section B), `docs/README.md` ("Where the numbers live"; the debug section), `docs/superpowers/specs/2026-09-05-survidle-risk-forecast-design.md` (section 3's row-text rule)

- [ ] **Step 1: The roadmap**

In the build-order paragraph under "The eight sub-projects, in order", change "then B the risk forecast with the away cap as its horizon," to "then B the risk forecast with the away cap as its horizon (built: the Ahead panel, four horizons of ten runs each in a worker, the dial on the run, the month number into the life record)," keeping the paragraph's wrap.

At the end of section "### B. The risk forecast" (after the paragraph ending "rather than a mercy."), add a paragraph starting "**Built.**" that says in prose: ten runs per horizon seeded from the state's own stream; the four rows and what each reads; the worker posting rows shortest first and yielding between them; the recompute cadence (the list, the day, the dial, the region, and once a game hour); the dial on the settings strip capping the catch-up; the month number as runs alive of ten into the record's daily entry; and that the journal draws nothing yet (the evolution view lands with the rest of F). Two sentences at the end name what the browser pass is to check, as section 6 of the spec lists it; the controller fills in the pass's reading after running it.

- [ ] **Step 2: The README**

Under "Where the numbers live" add `- `src/sim/forecast.ts`: the forecast's runs per horizon and the horizons themselves; `src/sim/forecaster.ts`: the worker client and the month number.` Under "Debug URL parameters" add nothing; under the `window.survidle` line add nothing unless Task 4 exposed the view (it did not).

- [ ] **Step 3: The spec's row rule**

In section 3 of the risk-forecast spec, replace the sentence beginning "for the away and tonight rows, "night 1" replaces "day 1"" with: "the tonight row counts nights ("night 1"), since its horizon ends at dawn; the away row counts days, since a dial of eight hours from a morning ends in the afternoon." Keep the rest of the paragraph.

- [ ] **Step 4: Commit**

```bash
cd /Users/janis.kirsteins/Projects/prototypes
git add 08-survidle/docs/superpowers/specs/2026-09-03-survidle-realism-roadmap.md 08-survidle/docs/README.md 08-survidle/docs/superpowers/specs/2026-09-05-survidle-risk-forecast-design.md
git commit -m "docs(survidle): B built - the roadmap marks the forecast, the README names its files, the spec's row rule counts nights only tonight"
```
