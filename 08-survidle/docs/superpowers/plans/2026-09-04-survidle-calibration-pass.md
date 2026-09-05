# Survidle calibration pass implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Measure the game's kcal against the roadmap's yield tables with a per-day ledger and a report, move the numbers the report shows to be off (one burn lever, a balanced sleep budget, berries from real numbers), give the harness a start day, derive the gates from the constants, and re-run the horizon checks.

**Architecture:** A new `src/sim/ledger.ts` owns one record per game day on `state.ledger`, credited at the seams every kcal already passes through: `stepPlayer` for burn and time, `eat` for intake, the four food effects and the kit for yield. A new `src/sim/tables.ts` holds the roadmap's bands as data; the reference and horizon reports print a week's averages against them, and tests pin the per-unit constants inside their real bands. The rest of the pass is numbers moved in place: the energy rates in `player.ts`, the sleep cap in `tasks.ts`, the berry rate and a soft eating ceiling in `actions.ts`, a `startDoy` threaded through `calendar` and `newGame`, and a `REFERENCE_TARGET_DAY` that is an expression over the constants.

**Tech Stack:** TypeScript, Vite, vitest (happy-dom), vite-node for scripts. All commands run from `08-survidle/`.

**Spec:** `docs/superpowers/specs/2026-09-04-survidle-calibration-pass-design.md`. Read it first; every task below cites its section. The roadmap's "The calibration pass" section (`2026-09-03-survidle-realism-roadmap.md`) says where this sits, and its "What the north yields" section is the source of the tables.

## Global Constraints

- Every quantity is real: kcal, kilos, litres, minutes. No abstract points.
- No em dashes, no unicode arrows or fancy quotes in any text, code or commit message. Hyphens and ASCII only.
- Comments explain, never chronicle: no "was X, now Y", no dates.
- `npm test` must stay under ten seconds. Runs to death go behind scripts; a test runs at most a few game days.
- `npm test` and `npm run build` must pass before every commit. Run `npx biome lint <files>` from the repo root on changed files.
- Stage with explicit paths under `08-survidle/`. Never `git add -A`.
- Log lines are plain sentences. Button reasons are lowercase fragments like the existing ones.
- Bands are steered by, not hit: the report prints in band / under / over and never exits non-zero for a band. Only the per-unit constant tests (Task 4, 7, 8) make a band a failure.
- Nothing here moves a horizon band (`HORIZON_STAGES[].band`) or a survivor-ladder row (spec 8, 11).
- The fuel keep, the plants-and-roots source, patch knowledge and the sleep-over-thirst order are out of scope (spec 11). Do not touch them.
- Commit messages follow the branch's style: `feat(survidle): ...` / `test(survidle): ...` / `docs(survidle): ...`, with the Co-Authored-By and Claude-Session trailers the session uses.

## File map

| file | change |
|---|---|
| `src/sim/calendar.ts` | `dayNumber(minute)`; `calendar`, `minutesUntilDawn`, `moonPhase` take `startDoy` |
| `src/sim/ledger.ts` | new: `DayLedger`, `YIELD_SOURCES`, `today`, `creditYield`, `creditEaten`, `creditBurn`, `creditTime`, `weekBefore` |
| `src/sim/tables.ts` | new: `APRIL`, `LATE_AUGUST`, `tableFor`, `sourceBand`, `BURN`, `SLEEP_HOURS`, `BERRY`, `verdict` |
| `src/sim/types.ts` | `GameState.ledger`, `GameState.startDoy`, `Player.berriesToday`, `PerishableId` gains `berries` |
| `src/sim/save.ts` | defaults for `ledger`, `startDoy`, `berriesToday`; `calendar` call passes `startDoy` |
| `src/sim/newgame.ts` | `START_KCAL`, `ARRIVAL_DRIED_MEAT_KG`; `newGame(seed, startDoy)`; kit credited; ledger and startDoy in state |
| `src/sim/player.ts` | `BASE_KCAL_PER_HOUR`, `COLD_BURN_FACTOR`, `ENERGY_RATE`; burn split into buckets and credited; time credited; the lever of Task 6 |
| `src/sim/berries.ts` | new: `berriesEatenToday`, `berriesRefused`, `berriesOverloaded` |
| `src/sim/actions.ts` | `eat` credits intake and applies the berry ceiling; `edible` |
| `src/sim/body.ts` | `canFeed` and `hungryStep` skip refused berries |
| `src/sim/water.ts` | the berry overload carries the 1.2 loss multiplier |
| `src/sim/tasks.ts` | berry pick 0.7 kg; sleep cap 9 h; yield credits in the fish, hunt, berries and snare effects; `minutesUntilDawn` passes `startDoy` |
| `src/sim/items.ts` | `SPOIL_HOURS.berries`; `BERRY_PICK_KG` |
| `src/sim/reference.ts` | `keep("berries", 2)`; derived `REFERENCE_TARGET_DAY`; `KITTED_TARGET_DAY`; `FOOD_CLAUSE_KCAL`; `gateFor`; `campFoodKcal`; checkpoints with `week`, `food`, `fed`; `weekLines`; `runReference(seed, days, opts)` |
| `src/sim/horizon.ts` | `StageReport.week`; `setUpStage` and `runStage` take `startDoy` |
| `src/sim/advance.ts`, `src/main.ts`, `src/ui/bars.ts`, `src/ui/panels.ts` | `calendar(state.minute, state.startDoy)`; `?day=`; the berry eat button greyed |
| `scripts/reference.ts`, `scripts/horizon.ts` | `--start=<doy>`; the week block; the pass lines |
| `tests/ledger.test.ts`, `tests/tables.test.ts` | new |
| `tests/fat.test.ts`, `tests/body.test.ts`, `tests/storm.test.ts`, `tests/reference.test.ts`, `tests/horizon.test.ts`, `tests/calendar.test.ts`, `tests/water.test.ts`, `tests/inventory.test.ts`, `tests/needs.test.ts` | updated |
| `docs/superpowers/specs/2026-09-03-survidle-realism-roadmap.md` | the measured numbers, the lever, the gates' standing |

Import direction, to avoid cycles: `calendar.ts` imports only types. `ledger.ts` imports `calendar.ts` (`dayNumber`) and types. `tables.ts` imports `ledger.ts` (the `YieldSource` type) and nothing else. `berries.ts` imports `calendar.ts`, `tables.ts` and types, so `water.ts`, `body.ts` and the panel read it without a cycle. `player.ts`, `actions.ts`, `tasks.ts`, `newgame.ts` import `ledger.ts`. `reference.ts` imports `tables.ts`, `ledger.ts`, `player.ts` (`FAT_FULL`), `newgame.ts` (`START_KCAL`), `items.ts` (`FOODS`).

---

### Task 1: The ledger module

Spec 1.1 and 1.2. The record, the credits and the week average, as a pure module; the state field; the save default. No caller yet.

**Files:**
- Modify: `src/sim/calendar.ts` (after `START_MINUTE_OF_DAY`, line 5)
- Create: `src/sim/ledger.ts`
- Modify: `src/sim/types.ts` (`GameState`, line 290)
- Modify: `src/sim/newgame.ts` (state literal, line 16)
- Modify: `src/sim/save.ts` (`fillDefaults`, after line 41)
- Test: `tests/ledger.test.ts` (new)

**Interfaces:**
- Produces: `dayNumber(minute: number): number` in `calendar.ts`. In `ledger.ts`: `type YieldSource`, `YIELD_SOURCES`, `interface DayLedger`, `interface WeekAverage`, `today(state): DayLedger`, `creditYield(state, source, kcal)`, `creditEaten(state, kcal)`, `creditBurn(state, burn: DayLedger["burn"])`, `creditTime(state, kind: "sleep" | "work" | "idle", minutes)`, `weekBefore(ledger, day): WeekAverage`, `emptyBurn()`, `emptyYield()`. `GameState.ledger: DayLedger[]`.

- [ ] **Step 1: Write the failing tests**

Create `tests/ledger.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { dayNumber, START_MINUTE_OF_DAY } from "../src/sim/calendar";
import { creditBurn, creditEaten, creditTime, creditYield, type DayLedger, emptyBurn, emptyYield, today, weekBefore, YIELD_SOURCES } from "../src/sim/ledger";
import { newGame } from "../src/sim/newgame";
import { deserialize, serialize } from "../src/sim/save";

describe("the day number", () => {
  it("is 1 at the start, 2 from midnight of the first night", () => {
    expect(dayNumber(0)).toBe(1);
    expect(dayNumber(24 * 60 - START_MINUTE_OF_DAY - 1)).toBe(1);
    expect(dayNumber(24 * 60 - START_MINUTE_OF_DAY)).toBe(2);
    expect(dayNumber(25 * 1440)).toBe(26);
  });
});

describe("the ledger", () => {
  it("starts with one record for day 1 and pushes a fresh one when the day changes", () => {
    const { state } = newGame(1);
    expect(state.ledger.length).toBe(1);
    expect(state.ledger[0].day).toBe(1);
    expect(today(state)).toBe(state.ledger[0]);
    state.minute = 24 * 60 - START_MINUTE_OF_DAY;
    const d2 = today(state);
    expect(d2.day).toBe(2);
    expect(state.ledger.length).toBe(2);
    expect(today(state)).toBe(d2);
  });

  it("credits yield, intake, burn and time onto today's record", () => {
    const { state } = newGame(1);
    const kit = today(state).yield.kit;
    creditYield(state, "fish", 300);
    creditYield(state, "fish", 200);
    creditEaten(state, 525);
    creditBurn(state, { base: 70, activity: 30, walk: 0, cold: 10, sick: 0 });
    creditBurn(state, { base: 70, activity: 0, walk: 230, cold: 0, sick: 5 });
    creditTime(state, "sleep", 60);
    creditTime(state, "work", 90);
    creditTime(state, "idle", 30);
    const d = today(state);
    expect(d.yield).toEqual({ ...emptyYield(), fish: 500, kit });
    expect(d.eaten).toBe(525);
    expect(d.burn).toEqual({ base: 140, activity: 30, walk: 230, cold: 10, sick: 5 });
    expect(d.sleepMin).toBe(60);
    expect(d.workMin).toBe(90);
  });

  it("averages the seven records before a day, and reports how many it found", () => {
    const ledger: DayLedger[] = [];
    for (let day = 1; day <= 10; day++) {
      ledger.push({ day, yield: { ...emptyYield(), fish: day * 100 }, eaten: 50, burn: { ...emptyBurn(), base: 1680, cold: day }, sleepMin: 480, workMin: 600 });
    }
    const w = weekBefore(ledger, 9);
    expect(w.days).toBe(7);
    // Days 2 to 8: fish 200..800 averages 500; cold 2..8 averages 5.
    expect(w.yield.fish).toBeCloseTo(500, 6);
    expect(w.burn.cold).toBeCloseTo(5, 6);
    expect(w.burn.base).toBe(1680);
    expect(w.eaten).toBe(50);
    expect(w.sleepMin).toBe(480);
    expect(w.workMin).toBe(600);
    const early = weekBefore(ledger, 3);
    expect(early.days).toBe(2);
    expect(early.yield.fish).toBeCloseTo(150, 6);
    const none = weekBefore(ledger, 1);
    expect(none.days).toBe(0);
    expect(none.yield.fish).toBe(0);
    expect(none.burn.base).toBe(0);
  });

  it("lists the five sources once each", () => {
    expect(YIELD_SOURCES).toEqual(["fish", "snare", "hunt", "berries", "kit"]);
  });

  it("a save from before the ledger loads with an empty ledger", () => {
    const { state } = newGame(1);
    const text = serialize(state);
    const raw = JSON.parse(text);
    delete raw.state.ledger;
    const file = deserialize(JSON.stringify(raw))!;
    expect(file.state.ledger).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `npx vitest run tests/ledger.test.ts`
Expected: FAIL, `../src/sim/ledger` cannot be resolved and `dayNumber` is not exported.

- [ ] **Step 3: Add `dayNumber` to the calendar**

In `src/sim/calendar.ts`, after `export const START_MINUTE_OF_DAY = 8 * 60;`:

```ts
/** Days survived, 1-based, from the minute alone: the ledger's key, cheap enough to read every minute. */
export function dayNumber(minute: number): number {
  return Math.floor((minute + START_MINUTE_OF_DAY) / 1440) + 1;
}
```

- [ ] **Step 4: Write the ledger module**

Create `src/sim/ledger.ts`:

```ts
/**
 * The kcal ledger (calibration pass spec, section 1): one record per game
 * day of what the body made, ate and burned, and how it spent its hours.
 * Every kcal the game moves passes through three seams - the food effects
 * for yield, eat() for intake, stepPlayer for burn - and each seam calls
 * one credit here. Nothing else writes to state.ledger. The report reads
 * the week before a checkpoint against the roadmap's tables, and the
 * survivor loop's epitaph and away report read the same records later.
 */
import { dayNumber } from "./calendar";
import type { GameState } from "./types";

export type YieldSource = "fish" | "snare" | "hunt" | "berries" | "kit";
export const YIELD_SOURCES: YieldSource[] = ["fish", "snare", "hunt", "berries", "kit"];

export interface BurnBuckets { base: number; activity: number; walk: number; cold: number; sick: number }

export interface DayLedger {
  /** Days survived, 1-based. */
  day: number;
  /** Gross kcal of the edible form each source produced. */
  yield: Record<YieldSource, number>;
  /** kcal eat() credited. */
  eaten: number;
  burn: BurnBuckets;
  sleepMin: number;
  /** Minutes awake on a task other than rest, wait or camping for the night. */
  workMin: number;
}

/** Per-day averages over the records found, and how many there were. */
export interface WeekAverage {
  days: number;
  yield: Record<YieldSource, number>;
  eaten: number;
  burn: BurnBuckets;
  sleepMin: number;
  workMin: number;
}

export function emptyYield(): Record<YieldSource, number> {
  return { fish: 0, snare: 0, hunt: 0, berries: 0, kit: 0 };
}

export function emptyBurn(): BurnBuckets {
  return { base: 0, activity: 0, walk: 0, cold: 0, sick: 0 };
}

function newDay(day: number): DayLedger {
  return { day, yield: emptyYield(), eaten: 0, burn: emptyBurn(), sleepMin: 0, workMin: 0 };
}

/** Today's record, pushed fresh the first time the day is read. */
export function today(state: GameState): DayLedger {
  const day = dayNumber(state.minute);
  const last = state.ledger[state.ledger.length - 1];
  if (last && last.day === day) return last;
  const d = newDay(day);
  state.ledger.push(d);
  return d;
}

export function creditYield(state: GameState, source: YieldSource, kcal: number): void {
  today(state).yield[source] += kcal;
}

export function creditEaten(state: GameState, kcal: number): void {
  today(state).eaten += kcal;
}

export function creditBurn(state: GameState, burn: BurnBuckets): void {
  const b = today(state).burn;
  b.base += burn.base;
  b.activity += burn.activity;
  b.walk += burn.walk;
  b.cold += burn.cold;
  b.sick += burn.sick;
}

export function creditTime(state: GameState, kind: "sleep" | "work" | "idle", minutes: number): void {
  const d = today(state);
  if (kind === "sleep") d.sleepMin += minutes;
  else if (kind === "work") d.workMin += minutes;
}

/** The seven records before `day` (days day-7 to day-1), averaged per day; zeros when there are none. */
export function weekBefore(ledger: DayLedger[], day: number): WeekAverage {
  const rows = ledger.filter((d) => d.day >= day - 7 && d.day < day);
  const n = rows.length;
  const avg: WeekAverage = { days: n, yield: emptyYield(), eaten: 0, burn: emptyBurn(), sleepMin: 0, workMin: 0 };
  if (n === 0) return avg;
  for (const r of rows) {
    for (const s of YIELD_SOURCES) avg.yield[s] += r.yield[s] / n;
    avg.eaten += r.eaten / n;
    for (const k of Object.keys(avg.burn) as (keyof BurnBuckets)[]) avg.burn[k] += r.burn[k] / n;
    avg.sleepMin += r.sleepMin / n;
    avg.workMin += r.workMin / n;
  }
  return avg;
}
```

- [ ] **Step 5: Add the state field, its start value and its save default**

In `src/sim/types.ts`, add to `GameState` after `intent: Intent | null;`:

```ts
  /** One record per game day of kcal made, eaten and burned: the calibration ledger. */
  ledger: DayLedger[];
```

and at the top of the file, with the other type imports (types.ts imports only types; add):

```ts
import type { DayLedger } from "./ledger";
```

In `src/sim/newgame.ts`, add `ledger: [],` after `intent: null,` in the state literal, and after `enterRegion(state, world, world.start);` add:

```ts
  today(state);
```

with `import { today } from "./ledger";` among the imports. (Task 3 turns this into the kit credit.)

In `src/sim/save.ts`, in `fillDefaults`, after `state.intent ??= null;`:

```ts
  state.ledger ??= [];
```

- [ ] **Step 6: Run the tests**

Run: `npx vitest run tests/ledger.test.ts`
Expected: PASS. Then `npm test` and `npm run build` pass; `npx biome lint 08-survidle/src/sim/ledger.ts 08-survidle/src/sim/calendar.ts 08-survidle/src/sim/types.ts 08-survidle/src/sim/newgame.ts 08-survidle/src/sim/save.ts 08-survidle/tests/ledger.test.ts` from the repo root is clean.

- [ ] **Step 7: Commit**

```bash
git add 08-survidle/src/sim/ledger.ts 08-survidle/src/sim/calendar.ts 08-survidle/src/sim/types.ts 08-survidle/src/sim/newgame.ts 08-survidle/src/sim/save.ts 08-survidle/tests/ledger.test.ts
git commit -m "feat(survidle): a kcal ledger, one record a game day, with the four credits and the week before a day"
```

---

### Task 2: Burn in buckets, and the hours

Spec 3.1 and 1.2: `stepPlayer` splits its burn into base, activity, walk, cold and sick and credits them; it credits sleep and work minutes. No number moves.

**Files:**
- Modify: `src/sim/player.ts:150-153` (constants) and `:197-212` (the kcal block)
- Test: `tests/ledger.test.ts`

**Interfaces:**
- Produces: `BASE_KCAL_PER_HOUR = 70`, `COLD_BURN_FACTOR = 1.3`, `SICK_BURN_FACTOR = 1.2` exported from `player.ts`. `stepPlayer`'s signature is unchanged.

- [ ] **Step 1: Write the failing tests**

Append to `tests/ledger.test.ts`:

```ts
import { advance } from "../src/sim/advance";
import { BASE_KCAL_PER_HOUR, COLD_BURN_FACTOR, stepPlayer } from "../src/sim/player";
import { cellOf, placeAt } from "../src/sim/position";
import { cellAt } from "../src/world/gen";

/** The nearest open-forest cell to the player, for a walk with a known terrain divisor. */
function forestCell(g: ReturnType<typeof newGame>): number {
  const { state, world } = g;
  const here = cellOf(state, world);
  const hx = here % world.w;
  const hy = Math.floor(here / world.w);
  for (let r = 0; r < 40; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        const x = hx + dx;
        const y = hy + dy;
        if (x < 0 || y < 0 || x >= world.w || y >= world.h) continue;
        const t = cellAt(world, y * world.w + x).terrain;
        if (t === "spruce" || t === "pine" || t === "birch") return y * world.w + x;
      }
    }
  }
  throw new Error("no forest near the start");
}

describe("burn in buckets", () => {
  it("an hour asleep in the warm is base and nothing else", () => {
    const { state, world } = newGame(1);
    state.task = { id: "sleep", progress: 0, duration: 60, repeat: false };
    for (let m = 0; m < 60; m++) stepPlayer(state, world, 15, 1);
    const b = today(state).burn;
    expect(b.base).toBeCloseTo(BASE_KCAL_PER_HOUR, 6);
    expect(b.activity).toBeCloseTo(0, 6);
    expect(b.walk).toBe(0);
    expect(b.cold).toBe(0);
    expect(b.sick).toBe(0);
    expect(today(state).sleepMin).toBe(60);
    expect(today(state).workMin).toBe(0);
  });

  it("an hour of heavy work at minus thirty is base, the rate above base, and the cold share of both", () => {
    const { state, world } = newGame(1);
    state.task = { id: "chop", progress: 0, duration: 60, repeat: false };
    const k0 = state.player.kcal;
    for (let m = 0; m < 60; m++) stepPlayer(state, world, -30, 1);
    const b = today(state).burn;
    expect(b.base).toBeCloseTo(70, 6);
    expect(b.activity).toBeCloseTo(330, 6);
    expect(b.walk).toBe(0);
    expect(b.cold).toBeCloseTo(400 * (COLD_BURN_FACTOR - 1), 6);
    expect(b.sick).toBe(0);
    expect(b.base + b.activity + b.cold).toBeCloseTo(k0 - state.player.kcal, 6);
    expect(today(state).workMin).toBe(60);
  });

  it("a walk puts everything above base in the walk bucket, and deep snow doubles it", () => {
    const g = newGame(17);
    const { state, world } = g;
    placeAt(state, world, forestCell(g));
    state.task = { id: "walk", progress: 0, duration: 60, repeat: false };
    for (let m = 0; m < 60; m++) stepPlayer(state, world, 15, 1);
    const dry = today(state).burn.walk;
    expect(dry).toBeCloseTo(300 - 70, 6);
    expect(today(state).burn.activity).toBe(0);
    state.weather.snowCm = 40;
    for (let m = 0; m < 60; m++) stepPlayer(state, world, 15, 1);
    expect(today(state).burn.walk - dry).toBeCloseTo(600 - 70, 6);
  });

  it("sickness adds its own bucket on top of the cold one", () => {
    const { state, world } = newGame(1);
    state.player.sick = 600;
    state.task = null;
    for (let m = 0; m < 60; m++) stepPlayer(state, world, -30, 1);
    const b = today(state).burn;
    expect(b.base).toBeCloseTo(70, 6);
    expect(b.activity).toBeCloseTo(30, 6);
    expect(b.cold).toBeCloseTo(100 * 0.3, 6);
    expect(b.sick).toBeCloseTo(100 * 1.3 * 0.2, 6);
  });

  it("over two hours of the real loop the buckets sum to what the stomach and the fat lost", () => {
    const { state, world } = newGame(17);
    const k0 = state.player.kcal + state.player.fat;
    advance(state, world, 120);
    const d = today(state);
    const burned = d.burn.base + d.burn.activity + d.burn.walk + d.burn.cold + d.burn.sick;
    expect(burned).toBeCloseTo(k0 - (state.player.kcal + state.player.fat) + d.eaten, 3);
  });

  it("an idle hour is neither sleep nor work", () => {
    const { state, world } = newGame(1);
    state.task = null;
    for (let m = 0; m < 60; m++) stepPlayer(state, world, 15, 1);
    expect(today(state).sleepMin).toBe(0);
    expect(today(state).workMin).toBe(0);
    state.task = { id: "wait", progress: 0, duration: 60, repeat: false };
    for (let m = 0; m < 60; m++) stepPlayer(state, world, 15, 1);
    expect(today(state).workMin).toBe(0);
  });
});
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `npx vitest run tests/ledger.test.ts`
Expected: FAIL, `BASE_KCAL_PER_HOUR` is not exported and the buckets stay zero.

- [ ] **Step 3: Split the burn and credit it**

In `src/sim/player.ts`, replace lines 150-153 (the two rate constants) with:

```ts
/** Flat kcal/h for activities that do not depend on the ground: walking is computed separately, by terrain. */
const KCAL_PER_HOUR: Record<Exclude<Activity, "walk">, number> = { sleep: 70, rest: 100, light: 200, heavy: 400 };
/** Base kcal/h for walking on ground at ordinary (open-forest) speed; the ground and load scale it from here. */
const WALK_KCAL_PER_HOUR = 300;
/**
 * The body's resting burn, every hour of the day asleep or not: the sleep
 * rate, which over 24 hours is 1,680 kcal, a fit adult's resting burn.
 * The ledger's base bucket; what an activity costs is counted above it.
 */
export const BASE_KCAL_PER_HOUR = KCAL_PER_HOUR.sleep;
/** Burn under a felt temperature below zero, as a multiple of the burn before it. */
export const COLD_BURN_FACTOR = 1.3;
/** Burn while sick, as a multiple of the burn before it. */
export const SICK_BURN_FACTOR = 1.2;
```

Replace the kcal block (from `// Kilocalories.` through the `if (shortfall > 0)` line) with:

```ts
  // Kilocalories, in the ledger's buckets: base for every hour, the activity
  // or the walk above it, then the cold and the sickness increments on top.
  let burn: number;
  if (a === "walk") {
    burn = WALK_KCAL_PER_HOUR / Math.max(0.25, speedOf(hereTerrain(state, world), state.route?.ice ?? "none"));
    if (w.snowCm > DEEP_SNOW_CM) burn *= 2;
    if (carried(p) > PACK_COMFORTABLE_KG) burn += 50;
  } else {
    burn = KCAL_PER_HOUR[a];
  }
  const above = burn - BASE_KCAL_PER_HOUR;
  const afterCold = felt < 0 ? burn * COLD_BURN_FACTOR : burn;
  const afterSick = p.sick > 0 ? afterCold * SICK_BURN_FACTOR : afterCold;
  creditBurn(state, {
    base: BASE_KCAL_PER_HOUR * h,
    activity: a === "walk" ? 0 : above * h,
    walk: a === "walk" ? above * h : 0,
    cold: (afterCold - burn) * h,
    sick: (afterSick - afterCold) * h,
  });
  creditTime(state, a === "sleep" ? "sleep" : state.task && !IDLE_TASKS.has(state.task.id) ? "work" : "idle", dt);
  // Below zero, the shortfall comes out of the fat reserve instead of health.
  const kcalBurn = afterSick * h;
  const shortfall = Math.max(0, kcalBurn - p.kcal);
  p.kcal = clamp(p.kcal - kcalBurn, 0, KCAL_FULL);
  if (shortfall > 0) p.fat = clamp(p.fat - shortfall, 0, FAT_FULL);
```

Add near `CAMP_TASKS` at the top of the file:

```ts
/** Awake hours that are not work: the ledger counts everything else on a task as a working minute. */
const IDLE_TASKS = new Set<TaskId>(["rest", "night", "wait", "sleep"]);
```

and the import `import { creditBurn, creditTime } from "./ledger";`.

- [ ] **Step 4: Run the tests**

Run: `npx vitest run tests/ledger.test.ts tests/fat.test.ts tests/storm.test.ts tests/water.test.ts`
Expected: PASS. The storm test's terrain ratios and the fat test's 100 kcal an hour at rest are unchanged, since no rate moved. Then `npm test`, `npm run build`, biome.

- [ ] **Step 5: Commit**

```bash
git add 08-survidle/src/sim/player.ts 08-survidle/tests/ledger.test.ts
git commit -m "feat(survidle): the body's burn lands in the ledger in buckets, base under everything, and its hours asleep and at work"
```

---

### Task 3: Yield and intake credits

Spec 1.2: the four food effects credit gross kcal of the edible form, the kit is credited at the start and by `kitOut`, and `eat` credits what it gave.

**Files:**
- Modify: `src/sim/tasks.ts` (the `berries`, `hunt`, `fish` effects around lines 958-1027; `collectSnares` around line 1177)
- Modify: `src/sim/actions.ts:31` (`eat`)
- Modify: `src/sim/newgame.ts` (the kit), `src/sim/reference.ts:108-122` (`kitOut`)
- Test: `tests/ledger.test.ts`

**Interfaces:**
- Consumes: `creditYield`, `creditEaten` from Task 1.
- Produces: `newGame` credits `kit` with `1 * FOODS.driedMeat.kcalPerKg`; `kitOut` credits `5 * FOODS.driedMeat.kcalPerKg`.

- [ ] **Step 1: Write the failing tests**

Append to `tests/ledger.test.ts`:

```ts
import { Rng } from "../src/rng";
import { eat } from "../src/sim/actions";
import { calendar } from "../src/sim/calendar";
import { addItem, qty } from "../src/sim/inventory";
import { FOODS } from "../src/sim/items";
import { kitOut } from "../src/sim/reference";
import { placeAtSpot } from "../src/sim/position";
import { beginTask } from "../src/sim/tasks";

describe("yield and intake", () => {
  it("the arrival kit is a kilo of dried meat, credited on day 1; the kitted camp adds five more", () => {
    const { state, world } = newGame(1);
    expect(state.ledger[0].yield.kit).toBe(FOODS.driedMeat.kcalPerKg);
    kitOut(state, world);
    expect(state.ledger[0].yield.kit).toBe(6 * FOODS.driedMeat.kcalPerKg);
  });

  it("eating credits the kcal the stomach and the fat received", () => {
    const { state, world } = newGame(1);
    addItem(state.player.pack, "driedMeat", 1);
    eat(state, world, "driedMeat", new Rng(1));
    expect(today(state).eaten).toBeCloseTo(0.15 * FOODS.driedMeat.kcalPerKg, 6);
  });

  it("a berry pick credits the kilos picked at the berry's kcal", () => {
    const { state, world } = newGame(3);
    // 120 days on from 1 April is the end of July, in season.
    state.minute = 120 * 1440;
    const cal = calendar(state.minute);
    placeAtSpot(state, world, state.player.region, "heath");
    expect(beginTask(state, world, cal, "berries")).toBe(true);
    const before = qty(state.player.pack, "berries");
    advance(state, world, 61);
    const picked = qty(state.player.pack, "berries") - before;
    expect(picked).toBeGreaterThan(0);
    expect(today(state).yield.berries).toBeCloseTo(picked * FOODS.berries.kcalPerKg, 6);
  });
});
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `npx vitest run tests/ledger.test.ts`
Expected: FAIL on the three new tests (`kit` is 0, `eaten` is 0, `berries` is 0).

- [ ] **Step 3: Credit the seams**

In `src/sim/actions.ts` `eat`, after the `if (gain <= room) {...} else {...}` block, add `creditEaten(state, gain);` with `import { creditEaten } from "./ledger";`.

In `src/sim/tasks.ts`, `import { creditYield } from "./ledger";` and:

- the berries effect becomes
  ```ts
  case "berries": {
    const kg = BERRY_PICK_KG * yieldFactor(state, "foraging");
    produce(state, world, "berries", kg);
    creditYield(state, "berries", kg * FOODS.berries.kcalPerKg);
    return;
  }
  ```
  where `BERRY_PICK_KG` is a new export in `src/sim/items.ts` next to `FOODS`: `/** Kilos an hour's picking takes at a patch, before the foraging pool's factor. */ export const BERRY_PICK_KG = 1;` (Task 8 sets it to 0.7). Use the same constant in the berries `check` label (`tasks.ts:293`), replacing the literal `1`.
- in the hunt effect, after `if (x.fatKg) produce(state, world, "fat", x.fatKg);`:
  ```ts
  creditYield(state, "hunt", x.meatKg * FOODS.rawMeat.kcalPerKg + (x.fatKg ?? 0) * FOODS.fat.kcalPerKg);
  ```
- in the fish effect, after `produce(state, world, "fish", kg);`:
  ```ts
  // Raw fish is not eaten; the yield is what it cooks to.
  creditYield(state, "fish", kg * FOODS.cookedFish.kcalPerKg);
  ```
- in `collectSnares`, after `produce(state, world, "rawMeat", y.meatKg * n);`:
  ```ts
  creditYield(state, "snare", y.meatKg * n * FOODS.rawMeat.kcalPerKg);
  ```

Check `FOODS` is imported in `tasks.ts` (it is used by the cook label already; if not, add it to the `./items` import).

In `src/sim/newgame.ts`, replace the `today(state);` line from Task 1 with:

```ts
  creditYield(state, "kit", ARRIVAL_DRIED_MEAT_KG * FOODS.driedMeat.kcalPerKg);
```

and above `newGame`:

```ts
/** The stomach a survivor arrives with, in kcal. */
export const START_KCAL = 5000;
/** Dried meat in the arrival pack, in kilos. */
export const ARRIVAL_DRIED_MEAT_KG = 1;
```

Use `ARRIVAL_DRIED_MEAT_KG` in `addItem(pack, "driedMeat", ...)` and `START_KCAL` in `kcal:`. Imports: `creditYield` from `./ledger`, `FOODS` from `./items`.

In `src/sim/reference.ts` `kitOut`, after `addItem(p.pack, "driedMeat", 5);`:

```ts
  creditYield(state, "kit", 5 * FOODS.driedMeat.kcalPerKg);
```

with `FOODS` added to the `./items` import and `creditYield` from `./ledger`.

- [ ] **Step 4: Run the tests**

Run: `npx vitest run tests/ledger.test.ts` then `npm test`, `npm run build`, biome on the changed files.
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add 08-survidle/src/sim/tasks.ts 08-survidle/src/sim/actions.ts 08-survidle/src/sim/newgame.ts 08-survidle/src/sim/reference.ts 08-survidle/src/sim/items.ts 08-survidle/tests/ledger.test.ts
git commit -m "feat(survidle): the fish, the hunt, the snares, the berries and the kit credit their kcal to the ledger, and eating credits its own"
```

---

### Task 4: The tables as code

Spec 2.1. The roadmap's two tables, the burn shares, the sleep band and the per-unit real numbers as one data module, with the verdict helper, and the first pinning tests for the constants that already hold.

**Files:**
- Create: `src/sim/tables.ts`
- Test: `tests/tables.test.ts` (new)

**Interfaces:**
- Produces: `interface Band { lo: number; hi: number }`, `band(lo, hi)`, `type TableRow`, `interface YieldTable`, `APRIL`, `LATE_AUGUST`, `tableFor(dayOfYear)`, `SOURCE_ROWS`, `sourceBand(table, source, tier)`, `BURN`, `SLEEP_HOURS`, `BERRY`, `verdict(value, band)`.

- [ ] **Step 1: Write the failing tests**

Create `tests/tables.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { BERRY_PICK_KG, FOODS } from "../src/sim/items";
import { BASE_KCAL_PER_HOUR } from "../src/sim/player";
import { APRIL, BERRY, BURN, LATE_AUGUST, SLEEP_HOURS, sourceBand, tableFor, verdict } from "../src/sim/tables";

describe("the tables", () => {
  it("carry the roadmap's April and late-August rows", () => {
    expect(APRIL.rows.fishing!.beginner).toEqual({ lo: 0, hi: 400 });
    expect(APRIL.rows.total!.experienced).toEqual({ lo: 1500, hi: 3500 });
    expect(APRIL.rows.largeGame!.beginner).toEqual({ lo: 0, hi: 0 });
    expect(LATE_AUGUST.rows.plants!.beginner).toEqual({ lo: 300, hi: 800 });
    expect(LATE_AUGUST.rows.total!.beginner).toEqual({ lo: 700, hi: 1500 });
    expect(LATE_AUGUST.rows.passiveFishing).toBeNull();
  });

  it("a source's band is the sum of its rows; a source with no row has none", () => {
    expect(sourceBand(APRIL, "hunt", "beginner")).toEqual({ lo: 0, hi: 100 });
    expect(sourceBand(APRIL, "fish", "beginner")).toEqual({ lo: 0, hi: 400 });
    expect(sourceBand(APRIL, "berries", "beginner")).toEqual({ lo: 0, hi: 150 });
    expect(sourceBand(LATE_AUGUST, "snare", "experienced")).toEqual({ lo: 200, hi: 700 });
    expect(sourceBand(APRIL, "kit", "beginner")).toBeNull();
  });

  it("the table for a day is April until midsummer and late August after", () => {
    expect(tableFor(90)).toBe(APRIL);
    expect(tableFor(181)).toBe(APRIL);
    expect(tableFor(182)).toBe(LATE_AUGUST);
    expect(tableFor(235)).toBe(LATE_AUGUST);
  });

  it("verdicts read in band, under and over, inclusive at the edges", () => {
    const b = { lo: 100, hi: 300 };
    expect(verdict(100, b)).toBe("in band");
    expect(verdict(300, b)).toBe("in band");
    expect(verdict(99, b)).toBe("under");
    expect(verdict(301, b)).toBe("over");
  });
});

describe("the constants sit in their real bands", () => {
  it("base burn over a day is a fit adult's resting burn", () => {
    expect(verdict(BASE_KCAL_PER_HOUR * 24, BURN.base)).toBe("in band");
  });

  it("a berry is about 500 kcal a kilo", () => {
    expect(verdict(FOODS.berries.kcalPerKg, BERRY.kcalPerKg)).toBe("in band");
  });

  it("an hour's picking at level one is what a hand picker takes", () => {
    expect(verdict(BERRY_PICK_KG, BERRY.pickKgPerHour)).toBe("in band");
  });

  it("the burn shares add up to the day band", () => {
    expect(BURN.base.lo + BURN.work.lo + BURN.cold.lo).toBeGreaterThanOrEqual(BURN.day.lo - 100);
    expect(BURN.base.hi + BURN.work.hi + BURN.cold.hi).toBeLessThanOrEqual(BURN.day.hi + 300);
    expect(SLEEP_HOURS).toEqual({ lo: 7, hi: 9 });
  });
});
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `npx vitest run tests/tables.test.ts`
Expected: FAIL, `../src/sim/tables` cannot be resolved.

- [ ] **Step 3: Write the tables module**

Create `src/sim/tables.ts`:

```ts
/**
 * What the north yields (roadmap, "What the north yields: the calibration
 * tables"), as data: gross kcal a day for a lone person, order-of-magnitude
 * bands the reference report is measured against and the per-unit tests
 * pin the constants inside. Bands are steered by, not hit: the report
 * prints a verdict per row, and only the per-unit constants are tests.
 */
import type { YieldSource } from "./ledger";

export interface Band { lo: number; hi: number }
export const band = (lo: number, hi: number): Band => ({ lo, hi });

export type TableRow = "plants" | "fishing" | "passiveFishing" | "traps" | "hunting" | "largeGame" | "birds" | "total";
export type Tier = "beginner" | "experienced";

export interface YieldTable {
  name: string;
  /** A row the table does not give is null. */
  rows: Record<TableRow, Record<Tier, Band> | null>;
}

const row = (beginner: Band, experienced: Band): Record<Tier, Band> => ({ beginner, experienced });

/** April, inland boreal forest. "About 0" for large game is a band of nothing. */
export const APRIL: YieldTable = {
  name: "April",
  rows: {
    plants: row(band(0, 150), band(100, 400)),
    fishing: row(band(0, 400), band(300, 1200)),
    passiveFishing: row(band(0, 500), band(800, 2500)),
    traps: row(band(0, 150), band(200, 700)),
    hunting: row(band(0, 100), band(150, 600)),
    largeGame: row(band(0, 0), band(300, 1500)),
    birds: row(band(0, 100), band(50, 300)),
    total: row(band(200, 800), band(1500, 3500)),
  },
};

/** Late August, the same country. Its fishing row folds hook and net; its small-game row folds traps and hunting. */
export const LATE_AUGUST: YieldTable = {
  name: "late August",
  rows: {
    plants: row(band(300, 800), band(600, 1200)),
    fishing: row(band(200, 700), band(700, 1500)),
    passiveFishing: null,
    traps: row(band(0, 200), band(200, 700)),
    hunting: null,
    largeGame: row(band(0, 0), band(300, 1500)),
    birds: null,
    total: row(band(700, 1500), band(2000, 4000)),
  },
};

/** The table a checkpoint is read against: April until midsummer, late August after. */
export function tableFor(dayOfYear: number): YieldTable {
  return dayOfYear < 182 ? APRIL : LATE_AUGUST;
}

/** Which table rows a ledger source answers to. The kit answers to none. */
export const SOURCE_ROWS: Record<YieldSource, TableRow[]> = {
  fish: ["fishing"],
  snare: ["traps"],
  hunt: ["hunting", "largeGame"],
  berries: ["plants"],
  kit: [],
};

/** The band a source is measured against in a table: its rows' bands summed, or null when the table has none of them. */
export function sourceBand(table: YieldTable, source: YieldSource, tier: Tier): Band | null {
  let lo = 0;
  let hi = 0;
  let found = false;
  for (const r of SOURCE_ROWS[source]) {
    const b = table.rows[r];
    if (!b) continue;
    found = true;
    lo += b[tier].lo;
    hi += b[tier].hi;
  }
  return found ? band(lo, hi) : null;
}

/**
 * A day's burn living outside in the cold, and its shares: the resting burn
 * of a fit 70 kg adult, cold thermogenesis in clothing, and the work that
 * takes the day into the band. work is the ledger's activity and walk together.
 */
export const BURN = {
  day: band(2500, 3500),
  base: band(1600, 1800),
  cold: band(100, 300),
  work: band(700, 1700),
};

/** A night's sleep for a working adult. */
export const SLEEP_HOURS = band(7, 9);

/** Bilberries and lingonberries, and a hand picker at a good patch. The ceiling is the gut's, spec 5.2. */
export const BERRY = {
  kcalPerKg: band(400, 600),
  pickKgPerHour: band(0.5, 1.5),
  /** Kilos a day eaten at full credit. */
  fullCreditKg: 2,
  /** Kilos a day past which the body will not eat another. */
  refuseKg: 4,
};

export function verdict(value: number, b: Band): "in band" | "under" | "over" {
  if (value < b.lo) return "under";
  if (value > b.hi) return "over";
  return "in band";
}
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run tests/tables.test.ts`
Expected: PASS (base is 1,680; berries 500; the pick 1.0 is inside 0.5 to 1.5). Then `npm test`, `npm run build`, biome.

- [ ] **Step 5: Commit**

```bash
git add 08-survidle/src/sim/tables.ts 08-survidle/tests/tables.test.ts
git commit -m "feat(survidle): the yield tables, the burn shares and the real per-unit numbers as data, with the first constants pinned inside them"
```

---

### Task 5: The report reads the week against the tables

Spec 2.2. The reference checkpoint carries the week before it and the day of year; the script prints the block; the horizon report prints the same block at each death.

**Files:**
- Modify: `src/sim/reference.ts` (`ReferenceReport`, `checkpoint`, `runReference`; new `weekLines`)
- Modify: `src/sim/horizon.ts` (`StageReport`, `runStage`)
- Modify: `scripts/reference.ts`, `scripts/horizon.ts`
- Test: `tests/reference.test.ts`, `tests/horizon.test.ts`

**Interfaces:**
- Consumes: `weekBefore`, `WeekAverage`, `YIELD_SOURCES` (Task 1); `tableFor`, `sourceBand`, `BURN`, `SLEEP_HOURS`, `verdict` (Task 4).
- Produces: `ReferenceReport.checkpoints[].week: WeekAverage` and `.dayOfYear: number`; `weekLines(week: WeekAverage, dayOfYear: number): string[]` exported from `reference.ts`; `StageReport.week: WeekAverage | null` and `.dayOfYear: number`.

- [ ] **Step 1: Write the failing tests**

Append to `tests/reference.test.ts`, inside the describe:

```ts
  it("a checkpoint carries the week before it, and weekLines reads it against the table", () => {
    const week = { days: 7, yield: { fish: 310, snare: 0, hunt: 0, berries: 0, kit: 0 }, eaten: 290, burn: { base: 1680, activity: 620, walk: 640, cold: 200, sick: 0 }, sleepMin: 504, workMin: 672 };
    const lines = weekLines(week, 115);
    expect(lines[0]).toContain("fish 310 (in band)");
    expect(lines[0]).toContain("kit 0");
    expect(lines[0]).toContain("vs April");
    expect(lines[1]).toContain("eaten/day 290");
    expect(lines[1]).toContain("net +20");
    expect(lines[2]).toContain("burn/day 3140 (in band)");
    expect(lines[2]).toContain("work 1260 (in band");
    expect(lines[2]).toContain("cold 200 (in band)");
    expect(lines[3]).toContain("sleep/day 8.4 h (in band)");
    expect(lines[3]).toContain("work/day 11.2 h");
    const none = weekLines({ ...week, days: 0 }, 115);
    expect(none[0]).toContain("no full day yet");
  });
```

and add `weekLines` to the import from `../src/sim/reference`.

Append to `tests/horizon.test.ts`:

```ts
  it("a stage report carries the week before its death", () => {
    const r = runStage(17, stage("manual"), 6);
    expect(r.week).not.toBeNull();
    expect(r.week!.days).toBe(r.days >= 7 ? 7 : Math.max(0, r.days));
    expect(r.dayOfYear).toBeGreaterThanOrEqual(90);
  });
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `npx vitest run tests/reference.test.ts tests/horizon.test.ts`
Expected: FAIL, `weekLines` is not exported; `week` is undefined.

- [ ] **Step 3: Carry the week and print it**

In `src/sim/reference.ts`:

```ts
import { type WeekAverage, weekBefore, YIELD_SOURCES } from "./ledger";
import { BURN, SLEEP_HOURS, sourceBand, tableFor, verdict } from "./tables";
```

Extend the checkpoint type and function:

```ts
export interface ReferenceReport {
  seed: number;
  startRing: number;
  /** Day, kcal, water, warmth, health and camp stocks at each checkpoint reached, with the week before it. */
  checkpoints: { day: number; dayOfYear: number; kcal: number; water: number; warmth: number; health: number; stocks: Record<string, number>; tools: string[]; week: WeekAverage }[];
  outcome: { kind: "died"; day: number; cause: DeathCause } | { kind: "reached"; day: number };
  passed: boolean;
}

function checkpoint(state: GameState, world: World, day: number): ReferenceReport["checkpoints"][number] {
  const p = state.player;
  const camp = pile(state, regionState(state, world, p.region).campCell);
  const stocks: Record<string, number> = {};
  for (const { item, qty } of listItems(camp)) stocks[item] = Math.round(qty * 10) / 10;
  return {
    day, dayOfYear: calendar(state.minute).dayOfYear, kcal: Math.round(p.kcal), water: Math.round(p.water * 10) / 10, warmth: Math.round(p.warmth), health: Math.round(p.health),
    stocks, tools: p.tools.map((t) => `${TOOLS[t.id].name} ${Math.round(t.durability)}`),
    week: weekBefore(state.ledger, day),
  };
}
```

Add the formatter, exported, below `checkpoint`:

```ts
const r0 = (n: number) => String(Math.round(n));

/**
 * The week before a checkpoint against the table for its date (spec 2.2):
 * yield a day per source with its band, intake and the net of the two,
 * burn by bucket, and the hours. Four lines, indented by the caller.
 */
export function weekLines(week: WeekAverage, dayOfYear: number): string[] {
  if (week.days === 0) return ["week: no full day yet"];
  const table = tableFor(dayOfYear);
  const yields = YIELD_SOURCES.map((s) => {
    const b = sourceBand(table, s, "beginner");
    return `${s} ${r0(week.yield[s])}${b ? ` (${verdict(week.yield[s], b)})` : ""}`;
  }).join(", ");
  const made = YIELD_SOURCES.reduce((a, s) => a + week.yield[s], 0);
  const net = made - week.eaten;
  const b = week.burn;
  const work = b.activity + b.walk;
  const total = b.base + work + b.cold + b.sick;
  const sleepH = week.sleepMin / 60;
  return [
    `week (${week.days} d): yield/day ${yields}; vs ${table.name}`,
    `eaten/day ${r0(week.eaten)}, net ${net >= 0 ? "+" : ""}${r0(net)}`,
    `burn/day ${r0(total)} (${verdict(total, BURN.day)}) = base ${r0(b.base)} (${verdict(b.base, BURN.base)}) + work ${r0(work)} (${verdict(work, BURN.work)}: activity ${r0(b.activity)}, walk ${r0(b.walk)}) + cold ${r0(b.cold)} (${verdict(b.cold, BURN.cold)}) + sick ${r0(b.sick)}`,
    `sleep/day ${sleepH.toFixed(1)} h (${verdict(sleepH, SLEEP_HOURS)}), work/day ${(week.workMin / 60).toFixed(1)} h`,
  ];
}
```

In `runReference`, after the loop, take a checkpoint at death too so the last week is always read: replace the `outcome` line and what follows with

```ts
  const day = calendar(state.dead ? state.dead.minute : state.minute).day;
  if (state.dead) checkpoints.push(checkpoint(state, world, day));
  const outcome: ReferenceReport["outcome"] = state.dead ? { kind: "died", day, cause: state.dead.cause } : { kind: "reached", day };
```

In `scripts/reference.ts`, inside the checkpoint loop, after the existing `console.log` of the day line:

```ts
    for (const line of weekLines(c.week, c.dayOfYear)) console.log(`    ${line}`);
```

and add `weekLines` to the import. The death checkpoint prints the same way, so a seed that dies on day 3 shows its two days.

In `src/sim/horizon.ts`:

```ts
import { type WeekAverage, weekBefore } from "./ledger";

export interface StageReport {
  seed: number;
  stage: HorizonStage["id"];
  /** Whole game days held before the death, or maxDays when still alive. */
  days: number;
  capped: boolean;
  cause: DeathCause | null;
  inBand: boolean;
  /** The week before the death, or before the cap. */
  week: WeekAverage | null;
  dayOfYear: number;
}

export function runStage(seed: number, stage: HorizonStage, maxDays: number): StageReport {
  const { state, world } = setUpStage(seed, stage);
  for (let d = 1; d <= maxDays && !state.dead; d++) advance(state, world, 1440);
  const end = calendar(state.dead ? state.dead.minute : state.minute);
  const days = state.dead ? end.day - 1 : maxDays;
  const inBand = days >= stage.band[0] && days <= stage.band[1];
  return { seed, stage: stage.id, days, capped: !state.dead, cause: state.dead?.cause ?? null, inBand, week: weekBefore(state.ledger, end.day), dayOfYear: end.dayOfYear };
}
```

In `scripts/horizon.ts`, after each row's `console.log`, print the block:

```ts
    if (r.week) for (const line of weekLines(r.week, r.dayOfYear)) console.log(`    ${line}`);
```

with `import { REFERENCE_SEEDS, weekLines } from "../src/sim/reference";`.

- [ ] **Step 4: Run the tests and one script**

Run: `npx vitest run tests/reference.test.ts tests/horizon.test.ts`, then `npm test`, `npm run build`, biome. Then `npm run reference -- 17 30` and read the block under day 21 and under the death: every yield source prints, the burn buckets sum, the sleep hours read.
Expected: PASS; the script prints four indented lines per checkpoint.

- [ ] **Step 5: Commit**

```bash
git add 08-survidle/src/sim/reference.ts 08-survidle/src/sim/horizon.ts 08-survidle/scripts/reference.ts 08-survidle/scripts/horizon.ts 08-survidle/tests/reference.test.ts 08-survidle/tests/horizon.test.ts
git commit -m "feat(survidle): the reference and horizon reports read the week before each checkpoint against the tables"
```

---

### Task 6: The measuring run and the burn lever

Spec 3.2. This task is the pass's judgement, made by a rule from the report. Run the instrument, compute the shares, move one lever, and write the decision into the roadmap. It touches one number in `player.ts` and the roadmap.

**Files:**
- Modify: `src/sim/player.ts` (one constant or one rule, per the rule below)
- Modify: `docs/superpowers/specs/2026-09-03-survidle-realism-roadmap.md` ("The calibration pass" section)
- Test: `tests/storm.test.ts` or `tests/ledger.test.ts`, whichever pins the lever moved

- [ ] **Step 1: Run the instrument**

Run: `npm run reference -- 17 19 42 79 40 > /tmp/claude-501/reference-before.txt; cat /tmp/claude-501/reference-before.txt` (use the session scratchpad directory if one is given instead of `/tmp/claude-501`). For each seed take the week block at the day-21 checkpoint, or at the death for a seed that dies before it. Write down, per seed and averaged over the four: `base`, `work` (with its `activity` and `walk` halves), `cold`, `total`, `work/day` hours, `sleep/day` hours.

- [ ] **Step 2: Apply the rule**

The shares are `BURN` in `tables.ts`: base 1,600 to 1,800, work 700 to 1,700, cold 100 to 300. Base is 1,680 by construction and never the lever. For `work` and `cold`, the distance outside the share is `(value - hi) / (hi - lo)` when over and `(lo - value) / (hi - lo)` when under, and zero inside. Then:

1. If the four-seed average of `work/day` hours is above 14 and `work` is over its share, the lever is hours: the sleep budget of Task 7 delivers it. Do not move a rate. Record "hours" as the decision, and after Task 7 run the instrument again and apply steps 2 to 4 of this rule to what remains, in that task's commit.
2. Otherwise the lever is the bucket with the larger distance, `work` or `cold`. If both are zero, no number moves; record that.
3. `cold` is the lever: set `COLD_BURN_FACTOR` in `player.ts` so the bucket lands on the share's middle: `1 + 0.3 * (200 / measured cold)`, rounded to the nearest 0.05, never below 1.05. Update the test in `tests/ledger.test.ts` that reads `COLD_BURN_FACTOR` (it already reads the constant, so it moves with it) and add a test that pins the constant between 1.05 and 1.3 with the comment "cold thermogenesis in clothing is a few hundred kcal a day, not a third of the burn".
4. `work` is the lever: the larger of `activity` and `walk` moves, scaled so that `activity + walk` lands on 1,200. If `walk` is larger, set `WALK_KCAL_PER_HOUR` to `round((1200 - activity) / walk * 300 / 10) * 10`, floor 200, and if the four-seed `walk` bucket comes mostly from deep snow (the report cannot say; the log's "Snow begins to fall" lines and the April snow of 3 cm say it does not), leave the doubling. If `activity` is larger, scale the `light` and `heavy` rates above base by `(1200 - walk) / activity` and round to 10: `light: 70 + round(130 * f / 10) * 10`, `heavy: 70 + round(330 * f / 10) * 10`, floors 150 and 300. The storm test's terrain ratios survive either; the fat test's "100 kcal an hour at rest" survives both since `rest` does not move.

- [ ] **Step 3: Move the lever and run the instrument again**

Make the one edit. Run `npm test` and `npm run build`. Run `npm run reference -- 17 19 42 79 40 > /tmp/claude-501/reference-after.txt` and confirm the moved bucket now reads `in band` on the four-seed average; if it does not, the rounding was the cause, so adjust one step of the rounding grid and run once more. Do not move a second lever.

- [ ] **Step 4: Record the decision in the roadmap**

In `docs/superpowers/specs/2026-09-03-survidle-realism-roadmap.md`, in "The calibration pass" section, after the bullet list and before "B. The risk forecast", add a paragraph in the section's voice with the values read from the two runs (write the numbers, not the angle brackets):

```
Measured, before any number moved, the April week before day 21 averaged
over the four seeds: base <base>, work <work> (activity <activity>, walk
<walk>), cold <cold>, <total> a day, <workH> hours at work and <sleepH>
asleep. The lever by the rule in the spec's section 3.2 was <cold | work |
hours>: <the one constant or rule, its value before and after>. After it
the same week reads <the four numbers>, and <bucket> sits in its share.
```

Also add under the section title: "Built: `2026-09-04-survidle-calibration-pass-design.md`, plan `2026-09-04-survidle-calibration-pass.md`."

- [ ] **Step 5: Commit**

```bash
git add 08-survidle/src/sim/player.ts 08-survidle/tests/ledger.test.ts 08-survidle/docs/superpowers/specs/2026-09-03-survidle-realism-roadmap.md
git commit -m "feat(survidle): the burn lever the measured week named, and the roadmap carries the numbers before and after"
```

If the decision was "hours" and nothing moved in `player.ts`, commit only the roadmap with `docs(survidle): the measured April week, and the burn lever is the hours the sleep budget fixes`.

---

### Task 7: The sleep budget

Spec 4. The awake drain balances eight hours of sleep against twelve hours on a task and four of camp work; the sleep cap is nine hours. Bedtime and the collapse threshold stay.

**Files:**
- Modify: `src/sim/player.ts:221-224` (energy)
- Modify: `src/sim/tasks.ts:526-530` (the sleep option)
- Test: `tests/body.test.ts`, `tests/tables.test.ts`, `tests/tasks.test.ts`

**Interfaces:**
- Produces: `ENERGY_RATE = { sleep: 12.5, task: -7, camp: -4, rest: 6, restSpent: 4 }` exported from `player.ts`; `SLEEP_CAP_MINUTES = 540` exported from `tasks.ts`.

- [ ] **Step 1: Write the failing tests**

Append to `tests/tables.test.ts` (in the "constants sit in their real bands" describe):

```ts
  it("the energy budget balances: twelve hours on a task and four of camp work drain what eight hours asleep restore", () => {
    expect(12 * -ENERGY_RATE.task + 4 * -ENERGY_RATE.camp).toBeCloseTo(8 * ENERGY_RATE.sleep, 6);
    expect(verdict(SLEEP_CAP_MINUTES / 60, SLEEP_HOURS)).toBe("in band");
  });
```

with `ENERGY_RATE` added to the `../src/sim/player` import and `import { SLEEP_CAP_MINUTES } from "../src/sim/tasks";`.

Append to `tests/body.test.ts` (top-level describe or a new one at the end):

```ts
describe("the sleep cap", () => {
  it("a spent body at midday sleeps nine hours, not until dawn", () => {
    const { state, world } = newGame(1);
    // 13:00 on 1 April: dawn is seventeen hours off, the body needs eight.
    state.minute = 5 * 60;
    state.player.energy = 0;
    const o = check(state, world, calendar(state.minute), "sleep");
    expect(o.ok).toBe(true);
    expect(o.duration).toBe(540);
  });

  it("a body at 60 at 22:00 sleeps until dawn, which is under the cap", () => {
    const { state, world } = newGame(1);
    // 22:00 on 1 April: dawn is eight and a half hours off, inside the cap; the body needs about three.
    state.minute = 14 * 60;
    state.player.energy = 60;
    const o = check(state, world, calendar(state.minute), "sleep");
    expect(o.duration).toBeCloseTo(minutesUntilDawn(state.minute), 3);
    expect(o.duration).toBeLessThanOrEqual(540);
  });

  it("an hour on a task costs seven energy; an hour of camp work four", () => {
    const { state, world } = newGame(1);
    state.task = { id: "chop", progress: 0, duration: 60, repeat: false };
    const e0 = state.player.energy;
    for (let m = 0; m < 60; m++) stepPlayer(state, world, 15, 1);
    expect(e0 - state.player.energy).toBeCloseTo(7, 6);
    state.task = { id: "craft", arg: "cordage", progress: 0, duration: 60, repeat: false };
    const e1 = state.player.energy;
    for (let m = 0; m < 60; m++) stepPlayer(state, world, 15, 1);
    expect(e1 - state.player.energy).toBeCloseTo(4, 6);
  });
});
```

Add `check` to the `../src/sim/tasks` import, `minutesUntilDawn` to the `../src/sim/calendar` import and `stepPlayer` to the `../src/sim/player` import in that file. If `minutesUntilDawn` returns a fraction for this minute, compare with `toBeCloseTo(..., 0)` instead of `toBe`.

- [ ] **Step 2: Run the tests to see them fail**

Run: `npx vitest run tests/tables.test.ts tests/body.test.ts`
Expected: FAIL: `ENERGY_RATE` not exported; duration 600; task drain 8.

- [ ] **Step 3: Balance the budget and cap the sleep**

In `src/sim/player.ts`, replace the energy block:

```ts
  // Energy.
  // The budget balances at eight hours: twelve on a task and four of camp
  // work drain exactly what eight asleep restore, so a working day ends
  // tired and a grind day needs nine, and the collapse threshold is what
  // real overwork does rather than the end of every third day.
  const energyRate = a === "sleep" ? ENERGY_RATE.sleep
    : a === "rest" && state.task?.id === "rest" ? (p.energy < 20 ? ENERGY_RATE.restSpent : ENERGY_RATE.rest)
    : a === "rest" ? ENERGY_RATE.camp
    : ENERGY_RATE.task;
  p.energy = clamp(p.energy + energyRate * h, 0, 100);
```

and above `stepPlayer`, exported:

```ts
/** Energy an hour: asleep, on a task, at camp work (the rest activity class on a task), and the explicit rest task. */
export const ENERGY_RATE = { sleep: 12.5, task: -7, camp: -4, rest: 6, restSpent: 4 };
```

In `src/sim/tasks.ts`, above `check`:

```ts
/** No one sleeps past nine hours: a night's sleep for a working adult, the top of the real band. */
export const SLEEP_CAP_MINUTES = 540;
```

and the sleep option:

```ts
    case "sleep": {
      // Until dawn or until rested, whichever is later, and never past the cap.
      const toRested = ((100 - p.energy) / ENERGY_RATE.sleep) * 60;
      const minutes = Math.min(SLEEP_CAP_MINUTES, Math.max(60, minutesUntilDawn(state.minute), toRested));
      return opt({ group: "camp", label: "Sleep", detail: `until dawn or rested, at most 9 h; ${bedText(state, world)}`, duration: minutes });
    }
```

with `ENERGY_RATE` imported from `./player`. Search `tests/` for the string `at most 10 h` and update any assertion to `at most 9 h`.

- [ ] **Step 4: Run the tests, and the instrument if Task 6 deferred to hours**

Run: `npx vitest run tests/tables.test.ts tests/body.test.ts tests/tasks.test.ts tests/storm.test.ts`, then `npm test`, `npm run build`, biome.
Expected: PASS. The existing "rest gives back exactly 4 under 20" and the 20 / 59 / 61 bedtime tests still pass, since those numbers did not move.

If Task 6 recorded "hours" as the lever: run `npm run reference -- 17 19 42 79 40` again, apply steps 2 to 4 of Task 6's rule to `work` and `cold` with the new hours, make that one edit if the rule names one, and extend the roadmap paragraph with "With the budget balanced the week reads <numbers>, and <lever or "no rate moved">."

- [ ] **Step 5: Commit**

```bash
git add 08-survidle/src/sim/player.ts 08-survidle/src/sim/tasks.ts 08-survidle/tests/body.test.ts 08-survidle/tests/tables.test.ts 08-survidle/tests/tasks.test.ts 08-survidle/docs/superpowers/specs/2026-09-03-survidle-realism-roadmap.md
git commit -m "feat(survidle): the energy budget balances at eight hours, and no one sleeps past nine"
```

---

### Task 8: Berries from real numbers

Spec 5. The pick drops to 0.7 kilos; the soft ceiling on eating them; the water cost of the overload; spoilage; the eat button; the reference want.

**Files:**
- Modify: `src/sim/items.ts` (`BERRY_PICK_KG`, `SPOIL_HOURS`), `src/sim/types.ts` (`PerishableId`, `PERISHABLES`, `Player.berriesToday`)
- Modify: `src/sim/actions.ts` (`eat`, `edible`, `berriesRefused`), `src/sim/body.ts` (`canFeed`, `hungryStep`), `src/sim/water.ts` (`waterLossPerHour`)
- Modify: `src/sim/newgame.ts`, `src/sim/save.ts` (the field and its default)
- Modify: `src/ui/panels.ts:369-375` (the eat button)
- Modify: `src/sim/reference.ts:52-79` (`REFERENCE_ORDERS`)
- Test: `tests/fat.test.ts` (a new describe), `tests/tables.test.ts`, `tests/inventory.test.ts`, `tests/needs.test.ts`, `tests/reference.test.ts`, `tests/water.test.ts`

**Interfaces:**
- Produces: `Player.berriesToday: { day: number; kg: number }`; `berriesEatenToday`, `berriesRefused(p: Player, minute: number): boolean` and `berriesOverloaded` exported from a new `berries.ts`; `edible(state, food): boolean` exported from `actions.ts`; `BERRY_PICK_KG = 0.7`.

- [ ] **Step 1: Write the failing tests**

Append to `tests/fat.test.ts`:

```ts
import { edible } from "../src/sim/actions";
import { berriesRefused } from "../src/sim/berries";
import { calendar } from "../src/sim/calendar";
import { today } from "../src/sim/ledger";
import { BERRY } from "../src/sim/tables";
import { waterLossPerHour } from "../src/sim/water";

describe("the berry ceiling", () => {
  function berried(kg: number) {
    const g = newGame(1);
    addItem(g.state.player.pack, "berries", kg);
    return g;
  }

  it("two kilos in a day credit their full 1,000 kcal", () => {
    const { state, world } = berried(2);
    state.player.kcal = 1000;
    for (let i = 0; i < 10; i++) expect(eat(state, world, "berries", new Rng(1))).toBe(true);
    expect(state.player.kcal).toBeCloseTo(2000, 6);
    expect(today(state).eaten).toBeCloseTo(1000, 6);
    expect(state.player.berriesToday.day).toBe(1);
    expect(state.player.berriesToday.kg).toBeCloseTo(2, 6);
    expect(state.log.some((e) => e.text === "Your stomach is turning.")).toBe(false);
  });

  it("the third and fourth kilos credit half, turn the stomach once, and cost water like a fever", () => {
    const { state, world } = berried(4);
    state.player.kcal = 1000;
    for (let i = 0; i < 10; i++) eat(state, world, "berries", new Rng(1));
    const plain = waterLossPerHour(state, 10);
    for (let i = 0; i < 5; i++) eat(state, world, "berries", new Rng(1));
    // 1,000 for the first two kilos, 250 for the third.
    expect(state.player.kcal).toBeCloseTo(2250, 6);
    expect(state.log.filter((e) => e.text === "Your stomach is turning.").length).toBe(1);
    expect(waterLossPerHour(state, 10)).toBeCloseTo(plain * 1.2, 6);
    for (let i = 0; i < 5; i++) eat(state, world, "berries", new Rng(1));
    expect(state.player.kcal).toBeCloseTo(2500, 6);
    expect(state.log.filter((e) => e.text === "Your stomach is turning.").length).toBe(1);
  });

  it("the fifth kilo is refused, said once, and auto-eat passes over berries for the day", () => {
    const { state, world } = berried(5);
    state.player.kcal = 1000;
    for (let i = 0; i < 20; i++) eat(state, world, "berries", new Rng(1));
    expect(state.player.berriesToday.kg).toBeCloseTo(4, 6);
    expect(qty(state.player.pack, "berries")).toBeCloseTo(1, 6);
    expect(eat(state, world, "berries", new Rng(1))).toBe(false);
    expect(berriesRefused(state.player, state.minute)).toBe(true);
    expect(edible(state, "berries")).toBe(false);
    expect(edible(state, "driedMeat")).toBe(true);
    expect(state.log.filter((e) => e.text === "You cannot face another berry.").length).toBe(1);
    state.player.kcal = 1000;
    addItem(state.player.pack, "driedMeat", 1);
    const k = state.player.kcal;
    autoEat(state, world, new Rng(1));
    expect(state.player.kcal).toBeGreaterThan(k);
    expect(qty(state.player.pack, "berries")).toBeCloseTo(1, 6);
  });

  it("the counter resets with the day", () => {
    const { state, world } = berried(5);
    state.player.kcal = 1000;
    for (let i = 0; i < 20; i++) eat(state, world, "berries", new Rng(1));
    state.minute = 24 * 60 - START_MINUTE_OF_DAY;
    expect(berriesRefused(state.player, state.minute)).toBe(false);
    expect(eat(state, world, "berries", new Rng(1))).toBe(true);
    expect(state.player.berriesToday.day).toBe(2);
    expect(state.player.berriesToday.kg).toBeCloseTo(0.2, 6);
    expect(calendar(state.minute).day).toBe(2);
  });

  it("the ceiling's numbers are the table's", () => {
    expect(BERRY.fullCreditKg).toBe(2);
    expect(BERRY.refuseKg).toBe(4);
  });
});
```

Add to that file's imports: `autoEat` from `../src/sim/actions`, `qty` from `../src/sim/inventory`, `START_MINUTE_OF_DAY` from `../src/sim/calendar`.

Append to `tests/inventory.test.ts`'s spoilage describe (find the test that ages `rawMeat` at 37 hours):

```ts
  it("berries keep three days in the warm and do not age in the cold", () => {
    const warm = emptyInventory();
    addItem(warm, "berries", 2);
    ageStacks(warm, 71 * 60, 10);
    expect(qty(warm, "berries")).toBeCloseTo(2, 6);
    const lost = ageStacks(warm, 2 * 60, 10);
    expect(lost.berries).toBeCloseTo(2, 6);
    expect(qty(warm, "berries")).toBe(0);
    const cold = emptyInventory();
    addItem(cold, "berries", 2);
    ageStacks(cold, 1000 * 60, -5);
    expect(qty(cold, "berries")).toBeCloseTo(2, 6);
  });
```

In `tests/tables.test.ts`, the "hour's picking at level one" test already reads `BERRY_PICK_KG`; add `expect(BERRY_PICK_KG).toBe(0.7);` to it.

In `tests/reference.test.ts`, append:

```ts
  it("the list keeps two kilos of berries at camp, after the cook keeps and before the rack", () => {
    const i = REFERENCE_ORDERS.findIndex((o) => o.req.task === "berries");
    expect(i).toBeGreaterThan(0);
    expect(REFERENCE_ORDERS[i]).toMatchObject({ kind: "keep", req: { until: { kind: "campHas", qty: 2 } } });
    expect(REFERENCE_ORDERS[i - 1].req).toMatchObject({ task: "cook" });
    expect(REFERENCE_ORDERS[i + 1].req).toMatchObject({ task: "build", arg: "dryingRack" });
  });
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `npx vitest run tests/fat.test.ts tests/inventory.test.ts tests/tables.test.ts tests/reference.test.ts`
Expected: FAIL across the new tests.

- [ ] **Step 3: The numbers and the field**

`src/sim/items.ts`: `BERRY_PICK_KG = 0.7` with the comment "Kilos an hour's picking takes at a patch by hand, before the foraging pool's factor: a beginner picker, near the real kilo an hour at the top of the pool." `SPOIL_HOURS` gains `berries: 72`.

`src/sim/types.ts`: `PerishableId` gains `| "berries"`, `PERISHABLES` gains `"berries"`. `Player` gains:

```ts
  /** Kilos of berries eaten today, for the gut's ceiling: full credit to two, half to four, none past it. */
  berriesToday: { day: number; kg: number };
```

`src/sim/newgame.ts`: `berriesToday: { day: 1, kg: 0 },` in the player literal. `src/sim/save.ts`: `p.berriesToday ??= { day: 0, kg: 0 };`.

Check `addItem` and `removeItem` in `inventory.ts` handle a perishable by `isPerishable` and not by a hard-coded list; they do (the stacks map is keyed by `PerishableId`). Check `tidyPiles` and the inventory panel treat `berries` as a kilo item already (`KG_ITEMS` has it).

- [ ] **Step 4: The ceiling in `eat`, and what reads it**

Create `src/sim/berries.ts`, a leaf that `actions.ts`, `water.ts`, `body.ts` and the panel all read without a cycle (it imports only `calendar.ts`, `tables.ts` and types):

```ts
/**
 * The gut's ceiling on berries (calibration pass spec, section 5.2): full
 * credit to two kilos a day, half credit and the water cost of a turning
 * stomach to four, and none past that. The counter lives on the player
 * and resets with the day number.
 */
import { dayNumber } from "./calendar";
import { BERRY } from "./tables";
import type { Player } from "./types";

/** Today's kilos, zero once the day has turned. */
export function berriesEatenToday(p: Player, minute: number): number {
  return p.berriesToday.day === dayNumber(minute) ? p.berriesToday.kg : 0;
}

/** True once today's berries have reached the kilos the body will not eat past. */
export function berriesRefused(p: Player, minute: number): boolean {
  return berriesEatenToday(p, minute) >= BERRY.refuseKg - 1e-9;
}

/** True past the full-credit kilos today: the water cost of a gut that is turning. */
export function berriesOverloaded(p: Player, minute: number): boolean {
  return berriesEatenToday(p, minute) > BERRY.fullCreditKg + 1e-9;
}
```

In `src/sim/actions.ts`:

```ts
import { berriesRefused } from "./berries";
import { dayNumber } from "./calendar";
import { creditEaten } from "./ledger";
import { BERRY } from "./tables";

/** A food the body will take right now: everything but berries past the day's ceiling. */
export function edible(state: GameState, food: FoodId): boolean {
  return food !== "berries" || !berriesRefused(state.player, state.minute);
}
```

and `eat` becomes:

```ts
export function eat(state: GameState, world: World, food: FoodId, rng: Rng): boolean {
  const p = state.player;
  const def = FOODS[food];
  if (!edible(state, food)) return false;
  const invs = [p.pack, herePile(state, world)];
  const have = totalQty(invs, food);
  if (have <= 1e-9) return false;
  let kg = Math.min(def.portionKg, have);
  let gain = kg * def.kcalPerKg;
  if (food === "berries") {
    const day = dayNumber(state.minute);
    if (p.berriesToday.day !== day) p.berriesToday = { day, kg: 0 };
    const before = p.berriesToday.kg;
    kg = Math.min(kg, BERRY.refuseKg - before);
    // Past two kilos the gut absorbs half; past four it will not take another.
    const full = Math.max(0, Math.min(kg, BERRY.fullCreditKg - before));
    gain = (full + (kg - full) / 2) * def.kcalPerKg;
    const after = before + kg;
    p.berriesToday.kg = after;
    if (before <= BERRY.fullCreditKg + 1e-9 && after > BERRY.fullCreditKg + 1e-9) log(state, "Your stomach is turning.", "bad");
    if (after >= BERRY.refuseKg - 1e-9) log(state, "You cannot face another berry.", "bad");
  }
  let left = kg;
  for (const inv of invs) {
    if (left <= 1e-9) break;
    left -= removeItem(inv, food, left);
  }
  // Past a full stomach the surplus is stored as fat, up to its own cap.
  const room = KCAL_FULL - p.kcal;
  if (gain <= room) {
    p.kcal += gain;
  } else {
    p.kcal = KCAL_FULL;
    p.fat = clamp(p.fat + (gain - room), 0, FAT_FULL);
  }
  creditEaten(state, gain);
  if (def.sickChance && p.sick === 0 && rng.chance(def.sickChance)) {
    p.sick = 48 * 60;
    log(state, "The raw meat turns your stomach. A fever follows.", "bad");
  }
  return true;
}
```

Import the `FoodId` type as needed. `autoEat` needs no change: `eat` returns false for refused berries and the loop moves on.

In `src/sim/water.ts` `waterLossPerHour`: `if (p.sick > 0 || berriesOverloaded(p, state.minute)) l *= 1.2;` with `import { berriesOverloaded } from "./berries";`.

In `src/sim/body.ts`: `canFeed` filters with `edible`: `AUTO_EAT_ORDER.some((f) => edible(state, f) && qty(p.pack, f) > 1e-9)` and the camp line the same; `hungryStep`'s camp check the same. Import `edible` from `./actions`.

In `src/ui/panels.ts` `instantHtml`, the berry button greys:

```ts
      const refused = f === "berries" && berriesRefused(p, state.minute); // from "../sim/berries"
      return `<button class="mini" data-act="eat" data-food="${f}" ${refused ? "disabled" : ""}>eat ${itemLabel(f, Math.min(def.portionKg, have))} <small>${refused ? "not another berry today" : `+${Math.round(def.kcalPerKg * Math.min(def.portionKg, have))} kcal${def.sickChance ? ", risky" : ""}`}</small></button>`;
```

In `src/sim/reference.ts`, insert `keep("berries", 2),` after `keep("cook", 1),` and before `job("build", { kind: "once" }, "dryingRack"),`. Extend the list's doc comment with one sentence: "Two kilos of berries at camp sit with the cook keeps: in season they are the cheapest kcal there is, and out of it the keep blocks harmlessly on nothing ripe."

- [ ] **Step 5: Run the tests**

Run: `npx vitest run tests/fat.test.ts tests/inventory.test.ts tests/tables.test.ts tests/reference.test.ts tests/needs.test.ts tests/horizon.test.ts tests/ladder.test.ts tests/ui.test.ts`, then `npm test`, `npm run build`, biome.
Expected: PASS. A test that counts `REFERENCE_ORDERS` by literal length (search for it) moves by one.

- [ ] **Step 6: Commit**

```bash
git add 08-survidle/src/sim/berries.ts 08-survidle/src/sim/items.ts 08-survidle/src/sim/types.ts 08-survidle/src/sim/actions.ts 08-survidle/src/sim/body.ts 08-survidle/src/sim/water.ts 08-survidle/src/sim/newgame.ts 08-survidle/src/sim/save.ts 08-survidle/src/ui/panels.ts 08-survidle/src/sim/reference.ts 08-survidle/tests/fat.test.ts 08-survidle/tests/inventory.test.ts 08-survidle/tests/tables.test.ts 08-survidle/tests/reference.test.ts
git commit -m "feat(survidle): berries from real numbers - a hand picker's rate, a gut that turns past two kilos and refuses past four, and fruit that keeps three days"
```

---

### Task 9: A start day for the harness and the browser

Spec 6. The calendar takes a start day of year; the state carries it; `newGame` opens the weather for the season; the scripts take `--start=<doy>`; the browser takes `?day=`.

**Files:**
- Modify: `src/sim/calendar.ts` (`calendar`, `minutesUntilDawn`, `moonPhase`, `moonIllumination`)
- Modify: `src/sim/types.ts` (`GameState.startDoy`), `src/sim/save.ts`, `src/sim/newgame.ts`
- Modify: the `calendar(state.minute)` call sites: `src/main.ts:81,131,144`, `src/ui/bars.ts:33`, `src/sim/advance.ts:42`, `src/sim/save.ts:164`, `src/sim/reference.ts` (two), `src/sim/horizon.ts` (one); `src/sim/tasks.ts:529` (`minutesUntilDawn`)
- Modify: `src/sim/reference.ts` (`setUpReference`, `runReference`), `src/sim/horizon.ts` (`setUpStage`, `runStage`), `scripts/reference.ts`, `scripts/horizon.ts`, `src/main.ts` (`?day=`)
- Test: `tests/calendar.test.ts`, `tests/ledger.test.ts` or a new `tests/startday.test.ts`

**Interfaces:**
- Produces: `calendar(minute, startDoy = START_DOY)`, `minutesUntilDawn(minute, startDoy = START_DOY)`, `moonPhase(minute, startDoy = START_DOY)`; `GameState.startDoy: number`; `newGame(seed, startDoy = START_DOY)`; `setUpReference(seed, kitted = false, startDoy = START_DOY)`; `runReference(seed, days, opts: { kitted?: boolean; startDoy?: number } = {})`; `setUpStage(seed, stage, startDoy = START_DOY)`; `runStage(seed, stage, maxDays, startDoy = START_DOY)`.

- [ ] **Step 1: Write the failing tests**

Create `tests/startday.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { advance } from "../src/sim/advance";
import { calendar, fmtDate, minutesUntilDawn, START_DOY } from "../src/sim/calendar";
import { newGame } from "../src/sim/newgame";
import { setUpReference } from "../src/sim/reference";
import { deserialize, serialize } from "../src/sim/save";
import { berrySeason } from "../src/sim/tasks";

describe("a start day", () => {
  it("the calendar reads the given day of year at 08:00 on day 1, April by default", () => {
    expect(calendar(0).dayOfYear).toBe(START_DOY);
    expect(fmtDate(calendar(0))).toBe("1 Apr");
    const july = calendar(0, 200);
    expect(july.day).toBe(1);
    expect(july.hour).toBeCloseTo(8, 6);
    expect(july.dayOfYear).toBe(200);
    expect(fmtDate(july)).toBe("20 Jul");
    expect(fmtDate(calendar(0, 235))).toBe("24 Aug");
    expect(calendar(3 * 1440, 200).day).toBe(4);
    expect(calendar(3 * 1440, 200).dayOfYear).toBe(203);
  });

  it("dawn is read on the start day's daylight", () => {
    // A July dawn at 62 N comes about four in the morning; an April one near six thirty.
    expect(minutesUntilDawn(13 * 60, 200)).toBeLessThan(minutesUntilDawn(13 * 60));
  });

  it("a July game opens with no ice and no snow, in berry season, and fires no catch-up roll", () => {
    const { state, world } = newGame(17, 200);
    expect(state.startDoy).toBe(200);
    expect(state.weather.iceCm).toBe(0);
    expect(state.weather.snowCm).toBe(0);
    expect(berrySeason(calendar(state.minute, state.startDoy))).toBe(true);
    expect(state.log.some((e) => e.text.startsWith("20 Jul."))).toBe(true);
    advance(state, world, 60);
    expect(state.lastDay).toBe(0);
    expect(state.weather.rolledDay).toBe(0);
    expect(calendar(state.minute, state.startDoy).day).toBe(1);
  });

  it("an April game is unchanged: three centimetres of snow in the shade", () => {
    const { state } = newGame(17);
    expect(state.startDoy).toBe(START_DOY);
    expect(state.weather.snowCm).toBe(3);
    expect(state.log.some((e) => e.text.startsWith("1 April."))).toBe(true);
  });

  it("the reference set-up takes a start day, and a save without one loads as April", () => {
    const ref = setUpReference(17, false, 235);
    expect(ref.state.startDoy).toBe(235);
    const raw = JSON.parse(serialize(ref.state));
    delete raw.state.startDoy;
    expect(deserialize(JSON.stringify(raw))!.state.startDoy).toBe(START_DOY);
  });
});
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `npx vitest run tests/startday.test.ts`
Expected: FAIL: `calendar(0, 200).dayOfYear` reads 90; `newGame(17, 200)` ignores the day.

- [ ] **Step 3: Thread the start day**

`src/sim/calendar.ts`:

```ts
/** 0 at new, 0.5 at full, in [0, 1). The moon runs on the date, so a later start opens on a later phase. */
export function moonPhase(minute: number, startDoy = START_DOY): number {
  const days = (minute + START_MINUTE_OF_DAY) / 1440 + (startDoy - START_DOY);
  const p = ((days - NEW_MOON_DAY) / SYNODIC_DAYS) % 1;
  return p < 0 ? p + 1 : p;
}

export function moonIllumination(minute: number, startDoy = START_DOY): number {
  return (1 - Math.cos(2 * Math.PI * moonPhase(minute, startDoy))) / 2;
}

/** The calendar at a minute of a run that began at 08:00 on `startDoy` (1 April unless the harness or the browser says otherwise). */
export function calendar(minute: number, startDoy = START_DOY): Calendar {
  const abs = minute + START_MINUTE_OF_DAY;
  const dayIndex = Math.floor(abs / 1440);
  const hour = (abs - dayIndex * 1440) / 60;
  const dayOfYear = (((startDoy + dayIndex) % 365) + 365) % 365;
  // ... the rest unchanged, with moon: moonPhase(minute, startDoy), moonLight: moonIllumination(minute, startDoy)
}

export function minutesUntilDawn(minute: number, startDoy = START_DOY): number {
  const cal = calendar(minute, startDoy);
  const today = cal.sunrise * 60 - cal.hour * 60;
  if (today > 0) return today;
  const tomorrow = calendar(minute + 1440, startDoy);
  return (24 - cal.hour) * 60 + tomorrow.sunrise * 60;
}
```

`src/sim/types.ts`, `GameState`: `/** Day of year the run began on, 0-based; 1 April unless the harness or the browser says otherwise. */ startDoy: number;`. `src/sim/save.ts`: `state.startDoy ??= START_DOY;` (import it), and `calendar(state.minute, state.startDoy)` at line 164.

`src/sim/newgame.ts`:

```ts
export function newGame(seed: number, startDoy = START_DOY): { state: GameState; world: World } {
  // ...
  // The weather opens for the season: past the thaw there is no ice and no snow.
  const warm = seasonalMean(startDoy) > 0;
  const state: GameState = {
    // ...
    startDoy,
    weather: { precip: "none", clear: true, offset: 0, snowCm: warm ? 0 : 3, rolledDay: 0, storm: null, dryDays: 0, wetDay: false, dryWarned: false, iceCm: 0 },
    // ...
  };
  enterRegion(state, world, world.start);
  creditYield(state, "kit", ARRIVAL_DRIED_MEAT_KG * FOODS.driedMeat.kcalPerKg);
  if (startDoy === START_DOY) log(state, `1 April. Snow still lies in the shade at ${start.name}. You have an axe, wool on your back and a kilo of dried meat.`);
  else log(state, `${fmtDate(calendar(0, startDoy))}. You wake at ${start.name} with an axe, wool on your back and a kilo of dried meat.`);
  return { state, world };
}
```

with `calendar`, `fmtDate`, `START_DOY` from `./calendar` and `seasonalMean` from `./weather`. (`weather.ts` imports only `rng`, `calendar` types and `types`, so no cycle.)

Call sites: every `calendar(state.minute)` in `src/main.ts`, `src/ui/bars.ts`, `src/sim/advance.ts`, `src/sim/save.ts`, `src/sim/reference.ts` and `src/sim/horizon.ts` becomes `calendar(state.minute, state.startDoy)` (and `calendar(state.dead.minute, state.startDoy)`); `src/sim/tasks.ts:529` becomes `minutesUntilDawn(state.minute, state.startDoy)`. Search `src/` for `calendar(` and `minutesUntilDawn(` once more to be sure none is missed; tests may keep the one-argument form.

`src/sim/reference.ts`:

```ts
export function setUpReference(seed: number, kitted = false, startDoy = START_DOY) {
  const g = newGame(seed, startDoy);
  // ...
}

export function runReference(seed: number, days: number, opts: { kitted?: boolean; startDoy?: number } = {}): ReferenceReport {
  const ref = setUpReference(seed, opts.kitted ?? false, opts.startDoy ?? START_DOY);
  // ...
}
```

`src/sim/horizon.ts`: `setUpStage(seed, stage, startDoy = START_DOY)` passes it to `newGame`; `runStage(seed, stage, maxDays, startDoy = START_DOY)` passes it on.

`scripts/reference.ts` and `scripts/horizon.ts`: parse `--start=<doy>`:

```ts
const startArg = rawArgs.find((a) => a.startsWith("--start="));
const startDoy = startArg ? Number(startArg.slice("--start=".length)) : undefined;
if (startArg && !(Number.isInteger(startDoy) && startDoy! >= 0 && startDoy! < 365)) {
  console.error("--start takes a day of year, 0 to 364: 90 is 1 April, 200 is 20 July, 235 is 24 August");
  process.exit(2);
}
```

and filter `--start=...` out before the numeric parse (`rawArgs.filter((a) => !a.startsWith("--"))`). Pass `{ kitted: kit, startDoy }` to `runReference` and `startDoy` to `runStage`. Extend each script's doc comment with the flag and the two dates. Print the start date in the seed line: `seed 17 (from 20 Jul): start found at ring 2` when a start is given.

`src/main.ts`: after `forcedSeed`:

```ts
/** Test aid beside seed: the day of year the run begins on, for a summer or autumn pass. Not a game feature. */
const forcedDay = params.get("day");
const startDoy = forcedDay === null ? undefined : Math.max(0, Math.min(364, Number(forcedDay) || 0));
```

`fresh(seed?, startDoy?)` passes it to `newGame`; `boot` skips the saved game when either is forced: `const saved = forcedSeed || forcedDay !== null ? null : loadGame();` and calls `fresh(forcedSeed ? Number(forcedSeed) >>> 0 : undefined, startDoy)`.

- [ ] **Step 4: Run the tests and a July run**

Run: `npx vitest run tests/startday.test.ts tests/calendar.test.ts tests/body.test.ts tests/sky.test.ts`, then `npm test`, `npm run build`, biome. Then `npm run reference -- --start=200 17 30`: the seed line says "from 20 Jul", the day-1 log is July, and the week block at the death or day 21 shows a berries yield above zero (the list's berries keep is in season).
Expected: PASS; the July block shows `berries` with a `vs late August` verdict.

- [ ] **Step 5: Commit**

```bash
git add 08-survidle/src/sim/calendar.ts 08-survidle/src/sim/types.ts 08-survidle/src/sim/save.ts 08-survidle/src/sim/newgame.ts 08-survidle/src/main.ts 08-survidle/src/ui/bars.ts 08-survidle/src/sim/advance.ts 08-survidle/src/sim/tasks.ts 08-survidle/src/sim/reference.ts 08-survidle/src/sim/horizon.ts 08-survidle/scripts/reference.ts 08-survidle/scripts/horizon.ts 08-survidle/tests/startday.test.ts
git commit -m "feat(survidle): a start day for the harness and the browser, the weather opening for its season"
```

---

### Task 10: The gates, derived

Spec 7. The April target is an expression over the constants; the food clause; the kitted run's pass line; the first-snow gate for a summer or autumn start.

**Files:**
- Modify: `src/sim/reference.ts` (`REFERENCE_TARGET_DAY`, `KITTED_TARGET_DAY`, `FOOD_CLAUSE_KCAL`, `Gate`, `gateFor`, `campFoodKcal`, `fed`, the checkpoint, `runReference`, `ReferenceReport`)
- Modify: `scripts/reference.ts` (the pass lines, the exit code)
- Test: `tests/reference.test.ts`

**Interfaces:**
- Consumes: `FAT_FULL` (`player.ts`), `START_KCAL`, `ARRIVAL_DRIED_MEAT_KG` (`newgame.ts`), `FOODS` (`items.ts`), `BURN`, `APRIL` (`tables.ts`).
- Produces: `REFERENCE_TARGET_DAY` (26 today), `KITTED_TARGET_DAY = 30`, `FOOD_CLAUSE_KCAL = 500`, `type Gate = { kind: "day"; day: number } | { kind: "firstSnow" }`, `gateFor(startDoy, kitted): Gate`, `campFoodKcal(state, world): number`, `fed(kcal, food): boolean`; `ReferenceReport.gate: Gate`, `.gateDay: number | null`, `.firstSnowDay: number | null`; checkpoints gain `food: number` and `fed: boolean`.

- [ ] **Step 1: Write the failing tests**

In `tests/reference.test.ts`, replace the two gate tests at the end with:

```ts
  it("the April target is the day a beginner eating the least and burning the most runs out of fat", () => {
    const reserve = FAT_FULL + START_KCAL + ARRIVAL_DRIED_MEAT_KG * FOODS.driedMeat.kcalPerKg;
    const deficit = BURN.day.hi - APRIL.rows.total!.beginner.lo;
    expect(REFERENCE_TARGET_DAY).toBe(Math.floor(reserve / deficit));
    expect(REFERENCE_TARGET_DAY).toBe(26);
    expect(KITTED_TARGET_DAY).toBe(30);
  });

  it("the gate passes a seed alive on the target day and fails one that dies on it or before", () => {
    expect(passesGate(null, REFERENCE_TARGET_DAY)).toBe(true);
    expect(passesGate(REFERENCE_TARGET_DAY + 1, REFERENCE_TARGET_DAY)).toBe(true);
    expect(passesGate(REFERENCE_TARGET_DAY, REFERENCE_TARGET_DAY)).toBe(false);
    expect(passesGate(REFERENCE_TARGET_DAY - 1, REFERENCE_TARGET_DAY)).toBe(false);
  });

  it("the food clause wants a stomach above zero or half a kilo of cooked fish at camp", () => {
    expect(fed(1, 0)).toBe(true);
    expect(fed(0, FOOD_CLAUSE_KCAL)).toBe(true);
    expect(fed(0, FOOD_CLAUSE_KCAL - 1)).toBe(false);
    const { state, world } = newGame(17);
    const camp = pile(state, regionState(state, world, state.player.region).campCell);
    expect(campFoodKcal(state, world)).toBe(0);
    addItem(camp, "cookedFish", 0.5);
    addItem(camp, "fish", 3);
    expect(campFoodKcal(state, world)).toBe(500);
  });

  it("the gate for a start is the target day in spring and the first snow from July on", () => {
    expect(gateFor(START_DOY, false)).toEqual({ kind: "day", day: REFERENCE_TARGET_DAY });
    expect(gateFor(START_DOY, true)).toEqual({ kind: "day", day: KITTED_TARGET_DAY });
    expect(gateFor(180, false)).toEqual({ kind: "day", day: REFERENCE_TARGET_DAY });
    expect(gateFor(181, false)).toEqual({ kind: "firstSnow" });
    expect(gateFor(235, true)).toEqual({ kind: "firstSnow" });
  });

  it("a run that dies before its gate day fails, with the checkpoint taken at the death", () => {
    const r = runReference(17, 2);
    expect(r.gate).toEqual({ kind: "day", day: REFERENCE_TARGET_DAY });
    expect(r.passed).toBe(false);
    expect(r.checkpoints.length).toBe(r.outcome.kind === "died" ? 1 : 0);
  });
```

Add to the imports: `addItem` from `../src/sim/inventory`; `FOODS` from `../src/sim/items`; `ARRIVAL_DRIED_MEAT_KG, START_KCAL` from `../src/sim/newgame`; `FAT_FULL` from `../src/sim/player`; `APRIL, BURN` from `../src/sim/tables`; `START_DOY` from `../src/sim/calendar`; and `campFoodKcal, fed, FOOD_CLAUSE_KCAL, gateFor, KITTED_TARGET_DAY, runReference` from `../src/sim/reference`.

- [ ] **Step 2: Run the tests to see them fail**

Run: `npx vitest run tests/reference.test.ts`
Expected: FAIL: `REFERENCE_TARGET_DAY` is 21; `gateFor`, `fed`, `campFoodKcal` are not exported.

- [ ] **Step 3: Derive the target and add the clause**

In `src/sim/reference.ts`, replace the `REFERENCE_TARGET_DAY` block:

```ts
/**
 * The April gate (spec 7.1): the day a beginner who eats the least the
 * tables allow and burns the most runs out of fat. Derived, so it moves
 * when the burn band, the reserve or the kit moves and not otherwise.
 */
export const REFERENCE_TARGET_DAY = Math.floor(
  (FAT_FULL + START_KCAL + ARRIVAL_DRIED_MEAT_KG * FOODS.driedMeat.kcalPerKg) / (BURN.day.hi - APRIL.rows.total!.beginner.lo),
);
/** The kitted camp's gate: a month, until C's trap moves it to December. */
export const KITTED_TARGET_DAY = 30;
/** The food clause: kcal at camp that counts as a beginner's day of food, the middle of the April band. */
export const FOOD_CLAUSE_KCAL = 500;
/** The day 1 December falls on from a 1 April start; kept as a late checkpoint, not a gate. */
export const DECEMBER_DAY = 245;

export type Gate = { kind: "day"; day: number } | { kind: "firstSnow" };

/** A spring start is measured on its target day; a start from July on is measured at the first snow (spec 7.3). */
export function gateFor(startDoy: number, kitted: boolean): Gate {
  if (startDoy >= 181) return { kind: "firstSnow" };
  return { kind: "day", day: kitted ? KITTED_TARGET_DAY : REFERENCE_TARGET_DAY };
}

/** kcal of food lying at this region's camp. */
export function campFoodKcal(state: GameState, world: World): number {
  const camp = pile(state, regionState(state, world, state.player.region).campCell);
  let kcal = 0;
  for (const f of Object.keys(FOODS) as FoodId[]) kcal += qty(camp, f) * FOODS[f].kcalPerKg;
  return kcal;
}

/** The food clause at a checkpoint: the stomach above zero, or a beginner's day of food at camp. */
export function fed(kcal: number, food: number): boolean {
  return kcal > 0 || food >= FOOD_CLAUSE_KCAL;
}
```

Imports: `FAT_FULL` from `./player`, `ARRIVAL_DRIED_MEAT_KG, START_KCAL` from `./newgame`, `FOODS, type FoodId` from `./items`, `APRIL, BURN` from `./tables`, `qty` from `./inventory`. `CHECKPOINT_DAYS` becomes a function of the gate:

```ts
function checkpointDays(gate: Gate): number[] {
  return gate.kind === "day" ? [gate.day, 90, DECEMBER_DAY] : [90, DECEMBER_DAY];
}
```

The checkpoint gains `food: Math.round(campFoodKcal(state, world))` and `fed: fed(p.kcal, campFoodKcal(state, world))`; the `ReferenceReport` checkpoint type gains `food: number; fed: boolean`, and the report gains `gate: Gate; gateDay: number | null; firstSnowDay: number | null`.

`runReference`:

```ts
export function runReference(seed: number, days: number, opts: { kitted?: boolean; startDoy?: number } = {}): ReferenceReport {
  const kitted = opts.kitted ?? false;
  const startDoy = opts.startDoy ?? START_DOY;
  const ref = setUpReference(seed, kitted, startDoy);
  const { state, world } = ref;
  const gate = gateFor(startDoy, kitted);
  const checkpoints: ReferenceReport["checkpoints"] = [];
  const seen = new Set<number>();
  let firstSnowDay: number | null = null;
  for (let d = 1; d <= days && !state.dead; d++) {
    stepReference(ref, 1440);
    const day = calendar(state.minute, state.startDoy).day;
    if (gate.kind === "firstSnow" && firstSnowDay === null && state.weather.snowCm > 0) {
      firstSnowDay = day;
      seen.add(day);
      checkpoints.push(checkpoint(state, world, day));
    }
    for (const c of checkpointDays(gate)) {
      if (day >= c && !seen.has(c)) {
        seen.add(c);
        checkpoints.push(checkpoint(state, world, day));
      }
    }
  }
  const day = calendar(state.dead ? state.dead.minute : state.minute, state.startDoy).day;
  if (state.dead) checkpoints.push(checkpoint(state, world, day));
  const outcome: ReferenceReport["outcome"] = state.dead ? { kind: "died", day, cause: state.dead.cause } : { kind: "reached", day };
  const gateDay = gate.kind === "day" ? gate.day : firstSnowDay;
  // The checkpoint taken as the gate day rolled over is the first at or past it: a
  // death after the gate comes later in the list, and a death before it fails passesGate.
  const at = gateDay === null ? undefined : checkpoints.find((c) => c.day >= gateDay);
  const passed = gateDay !== null && passesGate(state.dead ? day : null, gateDay) && at !== undefined && at.fed;
  return { seed, startRing: world.startRing, checkpoints, outcome, passed, gate, gateDay, firstSnowDay };
}
```

`scripts/reference.ts`: the pass line prints for both blocks now:

```ts
  const gateText = r.gate.kind === "day" ? `day ${r.gate.day}` : r.firstSnowDay === null ? "first snow (none yet)" : `first snow, day ${r.firstSnowDay}`;
  const passLine = r.passed ? `alive and fed at ${gateText}, ` : `gate ${gateText}: failed, `;
  console.log(`  ${passLine}${outcome}`);
```

and the day line prints `food at camp <food> kcal, fed: yes|no` after `health`. The exit code stays the from-scratch block's `passed` count. Update the script's doc comment: the kitted run has a pass line at 30 days now and still does not move the exit code.

- [ ] **Step 4: Run the tests and the four runs**

Run: `npx vitest run tests/reference.test.ts`, then `npm test`, `npm run build`, biome. Then:

```
npm run reference                              # April, from scratch: expect 2 of 4 or fewer, honestly
npm run reference -- --kitted 17 19 42 79 60   # the kitted block prints its 30-day pass line
npm run reference -- --start=235               # late August: the gate is the first snow
```

Expected: PASS; each run prints its gate and its food clause. Write the three standings down for Task 11.

- [ ] **Step 5: Commit**

```bash
git add 08-survidle/src/sim/reference.ts 08-survidle/scripts/reference.ts 08-survidle/tests/reference.test.ts
git commit -m "feat(survidle): the April gate is derived from the constants and wants food in hand, the kitted run has its month, and an autumn start is measured at the first snow"
```

---

### Task 11: The runs, the roadmap, and the browser pass

Spec 8, 10 (steps 7 and 8). Re-run the horizon checks, record every standing in the roadmap, and watch a July picking day in the browser.

**Files:**
- Modify: `docs/superpowers/specs/2026-09-03-survidle-realism-roadmap.md` ("The calibration pass" and "The delegation ladder" sections; the build-order paragraph under "The eight sub-projects, in order")
- Modify: `docs/README.md` if it lists the npm scripts (search it for `npm run reference`)

- [ ] **Step 1: Run everything and keep the output**

```
npm run reference > <scratch>/april.txt
npm run reference -- --kitted 17 19 42 79 60 > <scratch>/kitted.txt
npm run reference -- --start=200 17 19 42 79 60 > <scratch>/july.txt
npm run reference -- --start=235 > <scratch>/august.txt
npm run horizon > <scratch>/horizon.txt
```

(`<scratch>` is the session's scratchpad directory.) Read each. From April: per seed the death day and cause, and the day-26 (or death) week block. From July: the berries yield a day and its verdict against late August. From August: the first-snow day per seed and whether it was reached. From the horizon: the twelve rows and what ended each.

- [ ] **Step 2: Write the roadmap**

In "The calibration pass" section, after Task 6's paragraph, add in the section's voice, numbers filled in from the runs:

- A paragraph for sleep: "With the budget balanced the runner sleeps <sleepH> hours a day on the April seeds, and no day over ten remains / <n> days over ten remain, on seed <s> after <what the log shows>."
- A paragraph for berries: the July run's berries a day per seed and the verdict, and the sentence "A day on berries alone is <kcal>, the ceiling doing what the tables say a berry season is worth for one person."
- A paragraph for the gates: "`npm run reference` measures the April gate at day 26 with the food clause and passes <n> of 4: <per seed: alive and fed on day 26 | died day D of cause>. The kitted run passes <n> of 4 at 30 days. From 24 August the first snow fell on day <D> to <D> and <n> of 4 were alive and fed for it."
- The horizon re-run table, as the ladder section carries it: "`npm run horizon` after the pass: manual holds <a> to <b> days, jobs and grinds <c> to <d>, keeps <e> to <f>; <n> of twelve rows sit in their band, and what ends them is <cause list from the week blocks>. The bands did not move."

In "The delegation ladder" section, after its last paragraph, add: "Re-run after the calibration pass: see the pass's section." In the build-order paragraph, change "then the calibration pass (the section of that name below: ...)" to end with "; built)".

If `docs/README.md` lists the scripts, add `--start=<doy>` to the reference and horizon lines.

- [ ] **Step 3: The browser pass**

Start the dev server (`npm run dev` from `08-survidle/`) and open `http://127.0.0.1:5173/prototypes/08/?seed=17&day=200&speed=20` in the chrome-devtools MCP (or the claude-in-chrome MCP; the memory note on browser gotchas applies: `?seed=` restarts on reload). Check, and write what was seen into the roadmap paragraph for berries:

1. The first log line reads "20 Jul. You wake at ...".
2. The Do panel's "Pick berries" reads "0.7 kg berries, mid-July to mid-October", and is not greyed for season.
3. Give a berries once job (or click Pick berries at the heath); after the hour the pack holds 0.7 kg and the eat button offers berries.
4. Eat berries past two kilos (add berries by picking again or, for the pass only, by several picks at 20x speed): the log says "Your stomach is turning." once; past four kilos the eat button greys with "not another berry today" and the log says "You cannot face another berry." once.
5. Sleep: with the sleep label reading "at most 9 h", a night's sleep ends by the ninth hour.

Stop the dev server when done.

- [ ] **Step 4: Commit**

```bash
git add 08-survidle/docs/superpowers/specs/2026-09-03-survidle-realism-roadmap.md 08-survidle/docs/README.md
git commit -m "docs(survidle): the calibration pass's measured numbers, the gates' standing and the horizon re-run, and what the browser pass showed"
```

(Drop `docs/README.md` from the add line if it did not change.)

---

## Self-review against the spec

- 1.1, 1.2 ledger and credits: Tasks 1 to 3.
- 2.1 tables, 2.2 report: Tasks 4 and 5. The report prints `net` (yield minus eaten) where the spec's example says `wasted`, because stocks eaten from an earlier week make the difference negative and "wasted" would lie; the sign carries the meaning.
- 3.1 buckets: Task 2. 3.2 the rule and the roadmap paragraph: Task 6, with its hours branch closed in Task 7.
- 4.1, 4.2 sleep: Task 7. Bedtime, the collapse threshold and the sleep-over-thirst order do not move.
- 5.1 to 5.4 berries: Task 8, including the reference want and the eat button.
- 6.1, 6.2 start day: Task 9.
- 7.1 to 7.3 gates: Task 10; the standings recorded in Task 11.
- 8 horizon re-run: Task 11; bands untouched (global constraint).
- 9 tests: each task carries its own; the constants-in-band tests live in `tests/tables.test.ts` and grow in Tasks 7 and 8.
- 10 sequencing: the task order is the spec's, with the burn decision (Task 6) before sleep (Task 7) as the spec says, and its hours branch handled where the spec's rule sends it.
- 11 out of scope: nothing here touches the fuel keep, a plants source, patches, water treatment or the bands.
