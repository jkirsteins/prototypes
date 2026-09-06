# Survidle Year Loop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make a survivable year possible with the pieces already in the tree, measured by a new year script, and make each heir inherit capital rather than a stripped region.

**Architecture:** A headless instrument first (`src/sim/year.ts`, `scripts/year.ts`, a three-life heir report in `src/sim/reference.ts`), then five sim rules each in the module that owns the quantity: fish capacities in `species.ts`, small-game inflow in `animals.ts`, the rack and the trap's rot in `camp.ts`/`items.ts`, fuel by shelter in `fire.ts`, an indoor temperature floor in `player.ts`, the wet-cold need in `body.ts`, the melt fallback in `intent.ts`, the reference list and its level gate in `reference.ts`, and two record-read lines in `landing.ts` and `ui/panels.ts`. Every task ends with `npm test` green and, from Task 3 on, a year-script reading written into the roadmap.

**Tech Stack:** TypeScript, Vite, vitest, vite-node for scripts. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-09-05-survidle-year-loop-design.md`

## Global Constraints

- No magic numbers: every constant is argued from the real north in the comment beside it (spec, "Decisions confirmed with the author").
- Producers keep running while nobody is home; regrowth and movement keep the region whole (spec 2.3).
- Rack life 730 days, lean-to 365, turf hut 540 unchanged (spec 5.2).
- Every number in the code is a real quantity; no em dashes or non-typable characters in any output or comment (repo CLAUDE.md).
- `npm test` stays fast; the year script is on demand and never part of `npm test`.
- Comments explain, never chronicle: no dates or before/after in code comments.
- Stage with explicit paths under `08-survidle/`; never `git add -A`. Commit messages end with the session's attribution trailer.
- Work from `08-survidle/` for every `npm` and `npx` command below.

---

## File structure

| file | responsibility |
|---|---|
| `src/sim/year.ts` (new) | `runYear` and `runWinter`: the best survivor the sim can hold, month lines, surplus days |
| `scripts/year.ts` (new) | the CLI: seeds, `--level`, `--fresh`, `--winter`, `--start` |
| `src/sim/reference.ts` | the list gains large game, a hang grind, cordage 8, a winter firewood want; the player script gates wants by level and date; `runLineage` runs three lives; `measure` records the surplus days |
| `scripts/reference.ts` | `--heir` prints three lives and the trend gate |
| `src/sim/species.ts` | fish habitat numbers from biomass per hectare |
| `src/sim/animals.ts` | small-game inflow replaces migration for small game |
| `src/sim/items.ts` | `RACK_MAX_KG` 40, `MAX_RACKS`, `RACK_DRY_RAIN_MINUTES`, `STRUCTURE_LIFE_DAYS` |
| `src/sim/types.ts` | `RegionState.racks`, `trap.age` |
| `src/sim/regionstate.ts`, `src/sim/save.ts` | defaults for the two new fields |
| `src/sim/camp.ts` | `rackCapacity`, drying in rain, trap rot, decay clears racks, fuel by shelter at the caller |
| `src/sim/actions.ts` | `loadRack` reads `rackCapacity` |
| `src/sim/tasks.ts` | hang and build checks read `rackCapacity` and `MAX_RACKS`; the light task goes under the hut's smoke hole |
| `src/sim/fire.ts` | `burnPerHour` by shelter |
| `src/sim/player.ts` | `INDOOR_C` floor in `feltTemperature` |
| `src/sim/body.ts` | the wet-cold need |
| `src/sim/intent.ts` | a fill intent melts snow at camp when the shore is iced and no hole can be cut |
| `src/sim/landing.ts` | the journal clause in the first log line |
| `src/sim/epitaph.ts` | the snare's built line |
| `src/ui/panels.ts` | the ancestor's day on the tombstone |
| `src/sim/capabilities.ts` | the rack row's limits |
| `docs/README.md`, the roadmap, the spec | bookkeeping |

---

### Task 1: The year script

**Files:**
- Create: `src/sim/year.ts`
- Create: `scripts/year.ts`
- Create: `tests/year.test.ts`
- Modify: `package.json` (scripts)
- Modify: `docs/README.md` (the scripts paragraph after `npm run horizon`)

**Interfaces:**
- Consumes: `setUpReference(seed, kitted, startDoy)`, `stepReference(ref, minutes)`, `measure(ref, days, kitted)`, `ReferencePlayer`, `REFERENCE_ORDERS`, `weekLines` from `src/sim/reference.ts`; `setSkillLevel` from `src/sim/horizon.ts`; `SKILL_IDS` from `src/sim/skills.ts`; `calendar` from `src/sim/calendar.ts`; `current` from `src/sim/record.ts`; `pile`, `qty`, `addItem`, `listItems` from `src/sim/inventory.ts`; `regionState` from `src/sim/regionstate.ts`; `FOODS` from `src/sim/items.ts`.
- Produces: `runYear(seed, opts): YearReport`, `runWinter(seed): YearReport`, `LARGE_GAME: Species[]`, `MonthLine`, `YearReport`. Task 2 reads `LARGE_GAME`; Task 14 quotes the script's output.

- [ ] **Step 1: Write the failing test**

Create `tests/year.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { LARGE_GAME, runWinter, runYear } from "../src/sim/year";

describe("the year script", () => {
  it("runs a kitted level-20 survivor from 1 April and reports months, the surplus days and the outcome", () => {
    const r = runYear(17, { level: 20, days: 40 });
    expect(r.seed).toBe(17);
    expect(r.level).toBe(20);
    expect(r.outcome.kind === "died" || r.outcome.kind === "reached").toBe(true);
    // 1 April to day 40 crosses 1 May: one month line.
    expect(r.months.length).toBe(1);
    expect(r.months[0].month).toBe(5);
    expect(r.months[0].eatenPerDay).toBeGreaterThanOrEqual(0);
    expect(r.months[0].burnPerDay).toBeGreaterThan(1000);
    expect(typeof r.months[0].stock.firewoodKg).toBe("number");
    expect(r.surplus.hang === null || r.surplus.hang >= 1).toBe(true);
    expect(r.surplus.largeGame === null || r.surplus.largeGame >= 1).toBe(true);
  });

  it("starts a fresh run at level 1 with the arrival kit only", () => {
    const r = runYear(17, { fresh: true, days: 3 });
    expect(r.level).toBe(1);
    expect(r.kitted).toBe(false);
  });

  it("stocks a December camp for the winter gate", () => {
    const r = runWinter(17, 2);
    expect(r.startDoy).toBe(335);
    expect(r.kitted).toBe(true);
    expect(r.stocked).toEqual({ driedMeatKg: 80, firewoodKg: 400, logs: 150 });
  });

  it("names the large game the surplus day is read from", () => {
    expect(LARGE_GAME).toEqual(["deer", "reindeer", "elk"]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/year.test.ts`
Expected: FAIL, "Failed to resolve import ../src/sim/year".

- [ ] **Step 3: Write `src/sim/year.ts`**

```ts
/**
 * The year probe (year loop spec, section 1): the best survivor the sim can
 * hold, run headless for a year. A kitted camp with every producer, all six
 * skills at one level, the reference list. It is a diagnostic and not a
 * claim about players: the survivor ladder puts a full year at rows 4 to
 * 6, reached by a lineage. If this survivor cannot live a year, no lineage
 * can, and that is what the gate reads.
 */
import type { World } from "../world/gen";
import { calendar, START_DOY } from "./calendar";
import { addItem, listItems, pile, qty } from "./inventory";
import { FOODS, type FoodId } from "./items";
import { type DayLedger, emptyBurn, type WeekAverage, weekBefore } from "./ledger";
import { current } from "./record";
import { measure, type ReferenceReport, ReferencePlayer, REFERENCE_ORDERS, setUpReference, stepReference } from "./reference";
import { regionState } from "./regionstate";
import { SKILL_IDS } from "./skills";
import { setSkillLevel } from "./horizon";
import type { GameState, Species } from "./types";

/** The species whose first kill marks the large-game surplus: the tables' large-game row. */
export const LARGE_GAME: Species[] = ["deer", "reindeer", "elk"];

/** 1 December: the winter gate's start, a fortnight before the dark and a month before the cold snap. */
export const WINTER_START_DOY = 335;
/** Days from 1 December to 1 March. */
export const WINTER_DAYS = 90;
/** The winter stock (spec 1.3): a hut winter is about 3 tonnes of firewood, of which 400 kg split and 150 logs to split. */
export const WINTER_STOCK = { driedMeatKg: 80, firewoodKg: 400, logs: 150 };

export interface MonthLine {
  /** The month that just began, 1 to 12, and the day of the run it began on. */
  month: number;
  day: number;
  /** Averages over the days since the last line. */
  eatenPerDay: number;
  burnPerDay: number;
  stock: { foodKcal: number; foodByKind: Record<string, number>; firewoodKg: number; logs: number };
}

export interface YearReport {
  seed: number;
  level: number;
  kitted: boolean;
  startDoy: number;
  stocked: typeof WINTER_STOCK | null;
  months: MonthLine[];
  /** The day of the first hang and of the first large-game kill; null when never. */
  surplus: { hang: number | null; largeGame: number | null };
  outcome: ReferenceReport["outcome"];
  lastWeek: WeekAverage;
  lastDayOfYear: number;
}

export interface YearOptions {
  level?: number;
  fresh?: boolean;
  startDoy?: number;
  days?: number;
}

/** Averages of eaten and burn over the ledger rows in [from, to). */
function between(ledger: DayLedger[], from: number, to: number): { eaten: number; burn: number } {
  const rows = ledger.filter((d) => d.day >= from && d.day < to);
  if (!rows.length) return { eaten: 0, burn: 0 };
  let eaten = 0;
  let burn = 0;
  for (const r of rows) {
    eaten += r.eaten;
    const b = r.burn ?? emptyBurn();
    burn += b.base + b.activity + b.walk + b.cold + b.sick;
  }
  return { eaten: eaten / rows.length, burn: burn / rows.length };
}

function stockAt(state: GameState, world: World): MonthLine["stock"] {
  const st = regionState(state, world, state.player.region);
  const camp = pile(state, st.campCell);
  const foodByKind: Record<string, number> = {};
  let foodKcal = 0;
  for (const { item, qty: n } of listItems(camp)) {
    const f = FOODS[item as FoodId];
    if (!f) continue;
    foodByKind[item] = Math.round(n * f.kcalPerKg);
    foodKcal += n * f.kcalPerKg;
  }
  return { foodKcal: Math.round(foodKcal), foodByKind, firewoodKg: Math.round(qty(camp, "firewood")), logs: Math.round(qty(camp, "log")) };
}

/** Runs one life a day at a time, writing a month line on the first of each month and the surplus days as they happen. */
function runLife(ref: { state: GameState; world: World; player: ReferencePlayer }, days: number, kitted: boolean): Pick<YearReport, "months" | "surplus" | "outcome" | "lastWeek" | "lastDayOfYear"> {
  const { state, world } = ref;
  const months: MonthLine[] = [];
  const surplus: YearReport["surplus"] = { hang: null, largeGame: null };
  let lastLineDay = 1;
  for (let d = 1; d <= days && !state.dead; d++) {
    stepReference(ref, 1440);
    const cal = calendar(state.minute, state.startDoy);
    const st = regionState(state, world, state.player.region);
    if (surplus.hang === null && st.rack.kg > 0) surplus.hang = cal.day;
    if (surplus.largeGame === null && current(state).events.some((e) => e.kind === "firstKill" && LARGE_GAME.includes(e.species))) surplus.largeGame = cal.day;
    if (cal.dayOfMonth === 1 && cal.day > lastLineDay) {
      const avg = between(state.ledger, lastLineDay, cal.day);
      months.push({ month: cal.month, day: cal.day, eatenPerDay: Math.round(avg.eaten), burnPerDay: Math.round(avg.burn), stock: stockAt(state, world) });
      lastLineDay = cal.day;
    }
  }
  const day = calendar(state.dead ? state.dead.minute : state.minute, state.startDoy).day;
  const outcome: ReferenceReport["outcome"] = state.dead ? { kind: "died", day, cause: state.dead.cause } : { kind: "reached", day };
  return { months, surplus, outcome, lastWeek: weekBefore(state.ledger, day), lastDayOfYear: calendar(state.minute, state.startDoy).dayOfYear };
}

export function runYear(seed: number, opts: YearOptions = {}): YearReport {
  const fresh = opts.fresh ?? false;
  const level = fresh ? 1 : (opts.level ?? 20);
  const startDoy = opts.startDoy ?? START_DOY;
  const days = opts.days ?? 365;
  const ref = setUpReference(seed, !fresh, startDoy);
  if (!fresh) for (const s of SKILL_IDS) setSkillLevel(ref.state, s, level);
  ref.player = new ReferencePlayer(REFERENCE_ORDERS);
  const life = runLife(ref, days, !fresh);
  return { seed, level, kitted: !fresh, startDoy, stocked: null, ...life };
}

/** The winter gate (spec 1.3): a kitted level-20 camp with the winter stock, 1 December to 1 March. */
export function runWinter(seed: number, days = WINTER_DAYS): YearReport {
  const ref = setUpReference(seed, true, WINTER_START_DOY);
  const { state, world } = ref;
  for (const s of SKILL_IDS) setSkillLevel(state, s, 20);
  const st = regionState(state, world, state.player.region);
  const camp = pile(state, st.campCell);
  addItem(camp, "driedMeat", WINTER_STOCK.driedMeatKg);
  addItem(camp, "firewood", WINTER_STOCK.firewoodKg);
  addItem(camp, "log", WINTER_STOCK.logs);
  ref.player = new ReferencePlayer(REFERENCE_ORDERS);
  const life = runLife(ref, days, true);
  return { seed, level: 20, kitted: true, startDoy: WINTER_START_DOY, stocked: { ...WINTER_STOCK }, ...life };
}
```

`measure` is imported so the file's report type lines up with the reference report; if the linter flags it unused, drop it from the import.

- [ ] **Step 4: Write `scripts/year.ts`**

```ts
/**
 * The year probe: npm run year, or npx vite-node scripts/year.ts 17 19 42 79.
 * A kitted camp with every producer, all skills at --level=N (default 20), the
 * reference list, from 1 April for a year. --fresh runs the arrival kit at
 * level 1 instead. --winter runs the stocked December camp to 1 March.
 * --start=<doy> opens on that day of year. Gates: alive on 1 April on 4
 * seeds (--level), alive on 1 March on 4 seeds (--winter). On demand, not
 * part of npm test. The exit code is 0 either way: a red gate is a reading
 * for the roadmap, not a failure of the script.
 */
import { calendar, fmtDate, monthName } from "../src/sim/calendar";
import { REFERENCE_SEEDS, weekLines } from "../src/sim/reference";
import { runWinter, runYear, type YearReport } from "../src/sim/year";

const rawArgs = process.argv.slice(2);
const flag = (name: string) => rawArgs.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const fresh = rawArgs.includes("--fresh");
const winter = rawArgs.includes("--winter");
const level = flag("level") ? Number(flag("level")) : undefined;
const startDoy = flag("start") ? Number(flag("start")) : undefined;
if (level !== undefined && !(Number.isInteger(level) && level >= 1 && level <= 50)) {
  console.error("--level takes a whole number, 1 to 50");
  process.exit(2);
}
if (startDoy !== undefined && !(Number.isInteger(startDoy) && startDoy >= 0 && startDoy < 365)) {
  console.error("--start takes a day of year, 0 to 364: 90 is 1 April, 335 is 1 December");
  process.exit(2);
}
const seeds = rawArgs.filter((a) => !a.startsWith("--")).map(Number).filter((n) => Number.isFinite(n));
const runSeeds = seeds.length ? seeds : REFERENCE_SEEDS;

function print(r: YearReport): void {
  const from = fmtDate(calendar(0, r.startDoy));
  const who = r.stocked ? `stocked winter camp (${r.stocked.driedMeatKg} kg dried meat, ${r.stocked.firewoodKg} kg firewood, ${r.stocked.logs} logs)` : r.kitted ? `kitted camp, skills ${r.level}` : "fresh survivor, arrival kit";
  console.log(`seed ${r.seed} (${who}, from ${from}):`);
  for (const m of r.months) {
    const food = Object.entries(m.stock.foodByKind).map(([k, v]) => `${k} ${v}`).join(", ") || "none";
    console.log(`  1 ${monthName(m.month)} (day ${m.day}): eaten ${m.eatenPerDay}/day, burned ${m.burnPerDay}/day; at camp ${m.stock.foodKcal} kcal (${food}), ${m.stock.firewoodKg} kg firewood, ${m.stock.logs} logs`);
  }
  console.log(`  surplus: first hang ${r.surplus.hang === null ? "never" : `day ${r.surplus.hang}`}, first large game ${r.surplus.largeGame === null ? "never" : `day ${r.surplus.largeGame}`}`);
  for (const line of weekLines(r.lastWeek, r.lastDayOfYear)) console.log(`    ${line}`);
  console.log(`  ${r.outcome.kind === "died" ? `died day ${r.outcome.day}, ${r.outcome.cause}` : `alive at day ${r.outcome.day}`}`);
}

let passed = 0;
for (const seed of runSeeds) {
  const r = winter ? runWinter(seed) : runYear(seed, { level, fresh, startDoy });
  print(r);
  if (r.outcome.kind === "reached") passed++;
}
console.log(`${winter ? "winter gate (alive on 1 March)" : "year gate (alive after a year)"}: passed ${passed} of ${runSeeds.length}`);
```

- [ ] **Step 5: Add the npm script and the README paragraph**

In `package.json`, after the `"horizon"` line:

```json
    "year": "vite-node scripts/year.ts"
```

In `docs/README.md`, after the paragraph that begins "`npm run horizon` runs a stocked camp", add:

```markdown
`npm run year` runs the best survivor the sim can hold: a kitted camp with
every producer, all six skills at 20, the reference list, from 1 April for
a year, on the four seeds. It prints a line on the first of each month
(kcal eaten and burned a day, the stock at camp), the day of the first
hang and the first large-game kill, the week before the death, and the
outcome; the gate is alive after a year on 4 seeds. `--level=N` sets the
skills, `--fresh` runs the arrival kit at level 1, `--winter` runs a
stocked December camp to 1 March (the winter gate), `--start=<doy>` opens
on another day. About a minute; not part of `npm test`. The survivor is a
diagnostic, not a claim about players: if this one cannot live a year, no
lineage can.
```

- [ ] **Step 6: Run the tests and the script**

Run: `npx vitest run tests/year.test.ts`
Expected: PASS, 4 tests.

Run: `npm run year -- 17`
Expected: one seed block with month lines, a surplus line, four week lines and an outcome. Paste the block into the roadmap in Task 14 as the "instrument's first reading".

Run: `npm test`
Expected: all green.

- [ ] **Step 7: Commit**

```bash
git add 08-survidle/src/sim/year.ts 08-survidle/scripts/year.ts 08-survidle/tests/year.test.ts 08-survidle/package.json 08-survidle/docs/README.md
git commit -m "feat(survidle): npm run year - the best survivor the sim can hold, run for a year, with month lines, surplus days and the winter gate"
```

---

### Task 2: Three lives in the heir report

**Files:**
- Modify: `src/sim/reference.ts` (`ReferenceReport`, `measure`, `runHeir`, new `runLineage`)
- Modify: `scripts/reference.ts` (the `--heir` block)
- Modify: `tests/reference.test.ts`

**Interfaces:**
- Consumes: `LARGE_GAME` from `src/sim/year.ts`; `beginAgain`, `land`, `oldCampRegion` from `src/sim/landing.ts`.
- Produces: `ReferenceReport.surplus: { hang: number | null; largeGame: number | null }`; `runLineage(seed, days, lives = 3): LineageReport` with `LineageReport = { seed; lives: LifeReport[] }` and `LifeReport = { index; landed: WorldDate; gapDays; found: Found | null; reachedCampDay: number | null; report: ReferenceReport }`; `Found` is the existing `HeirReport["found"]` type without `reachedCampDay`. `runHeir` keeps its shape.

- [ ] **Step 1: Write the failing tests**

Append to `tests/reference.test.ts`, inside the top-level `describe` or as a new one at the end of the file:

```ts
describe("the lineage", () => {
  it("runs three lives on seed 17, each landing after a gap and reporting what it found", () => {
    const r = runLineage(17, 250, 3);
    expect(r.seed).toBe(17);
    expect(r.lives.length).toBe(3);
    expect(r.lives[0].index).toBe(1);
    expect(r.lives[0].gapDays).toBe(0);
    expect(r.lives[0].found).toBeNull();
    for (const life of r.lives.slice(1)) {
      expect(life.gapDays).toBeGreaterThanOrEqual(90);
      expect(coastOpen(life.landed.doy)).toBe(true);
      expect(life.found).not.toBeNull();
      expect(life.found!.structures).toContain("firePit");
      expect(typeof life.found!.logs).toBe("number");
    }
    for (const life of r.lives) {
      expect(life.report.surplus.hang === null || life.report.surplus.hang >= 1).toBe(true);
    }
  });

  it("stops early when a life reaches the day cap alive", () => {
    const r = runLineage(17, 5, 3);
    expect(r.lives.length).toBe(1);
    expect(r.lives[0].report.outcome.kind).toBe("reached");
  });
});
```

Add `runLineage` to the import list from `../src/sim/reference`.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/reference.test.ts`
Expected: FAIL, `runLineage` is not exported.

- [ ] **Step 3: Record the surplus days in `measure`**

In `src/sim/reference.ts`, add to `ReferenceReport` after `firstSnowDay`:

```ts
  /** The day of the first hang and of the first large-game kill; null when never (year loop spec 1.1). */
  surplus: { hang: number | null; largeGame: number | null };
```

Import `LARGE_GAME` from `./year` at the top of the file. `year.ts` imports from `reference.ts` too; that cycle is between a constant and functions and is fine for ES modules, but to keep it clean move `LARGE_GAME` into `src/sim/species.ts` as `export const LARGE_GAME: Species[] = ["deer", "reindeer", "elk"];` right after `SPECIES_IDS`, and have both `year.ts` and `reference.ts` import it from `./species`. Update `tests/year.test.ts` to import `LARGE_GAME` from `../src/sim/species`.

In `measure`, before the loop:

```ts
  const surplus: ReferenceReport["surplus"] = { hang: null, largeGame: null };
```

Inside the loop, right after `const day = calendar(...).day;`:

```ts
    const home = regionState(state, world, state.player.region);
    if (surplus.hang === null && home.rack.kg > 0) surplus.hang = day;
    if (surplus.largeGame === null && current(state).events.some((e) => e.kind === "firstKill" && LARGE_GAME.includes(e.species))) surplus.largeGame = day;
```

Add `surplus` to the returned object.

- [ ] **Step 4: Extract the "found" reading and add `runLineage`**

Replace the body of `runHeir` and add `runLineage` (keep `HeirReport` as it is; `Found` is new):

```ts
export type Found = { structures: string[]; campFoodKcal: number; campFirewoodKg: number; logs: number; snares: number; kmToOldCamp: number; trapKg: number | null };

export interface LifeReport {
  index: number;
  landed: WorldDate;
  gapDays: number;
  /** What stood at the old camp when this life landed; null for the first survivor. */
  found: Found | null;
  reachedCampDay: number | null;
  report: ReferenceReport;
}

export interface LineageReport { seed: number; lives: LifeReport[] }

/** What the heir finds at the old camp, read after the gap has run and before the heir moves. */
function foundAtOldCamp(state: GameState, world: World, oldRegion: number, landCell: number, trapKg: number | null): Found {
  const oldSt = regionState(state, world, oldRegion);
  const camp = pile(state, oldSt.campCell);
  const structures = (["firePit", "leanTo", "cabin", "dryingRack", "boughBed", "hearth", "turfHut", "waterStore"] as const).filter((s) => oldSt.structures[s]);
  const lc = cellAt(world, landCell);
  const cc = cellAt(world, oldSt.campCell);
  return {
    structures: [...structures],
    campFoodKcal: Math.round(campFoodKcalAt(camp)),
    campFirewoodKg: Math.round(qty(camp, "firewood")),
    logs: Math.round(qty(camp, "log")),
    snares: oldSt.structures.snares,
    kmToOldCamp: Math.round(Math.hypot(lc.x - cc.x, lc.y - cc.y) * CELL_KM * 10) / 10,
    trapKg,
  };
}

/**
 * Lives in one world, one after another (year loop spec 1.4): the from-scratch
 * reference run, then for each heir the gap, the landing near the old camp,
 * the walk home and a fresh reference run. A life still alive at the day cap
 * has no heir to raise, so the report ends there.
 */
export function runLineage(seed: number, days: number, lives = 3): LineageReport {
  const ref = setUpReference(seed);
  const { state, world } = ref;
  const out: LifeReport[] = [];
  let first = measure(ref, days);
  out.push({ index: 1, landed: current(state).landed, gapDays: 0, found: null, reachedCampDay: null, report: first });
  for (let i = 2; i <= lives && state.dead; i++) {
    const oldRegion = oldCampRegion(state);
    const oldSt = regionState(state, world, oldRegion);
    const trapKg = oldSt.trap ? Math.round(oldSt.trap.kg * 10) / 10 : null;
    beginAgain(state, world);
    // land() clears state.landing once it confirms the name, so the cell it chose
    // has to be read off the landing itself, not off the player it then places.
    const landCell = state.landing!.cell;
    land(state, world);
    const found = foundAtOldCamp(state, world, oldRegion, landCell, trapKg);
    const heirRef = { state, world, player: new ReferencePlayer(REFERENCE_ORDERS, oldRegion) };
    const report = measure(heirRef, days);
    out.push({ index: i, landed: current(state).landed, gapDays: current(state).gapDays, found, reachedCampDay: heirRef.player.reachedDay, report });
    first = report;
  }
  return { seed, lives: out };
}

export function runHeir(seed: number, days: number): HeirReport {
  const l = runLineage(seed, days, 2);
  const first = l.lives[0].report;
  if (l.lives.length === 1) {
    return { seed, first, gapDays: 0, landed: l.lives[0].landed, found: { structures: [], campFoodKcal: 0, campFirewoodKg: 0, snares: 0, kmToOldCamp: 0, reachedCampDay: null, trapKg: null }, heir: first };
  }
  const h = l.lives[1];
  const { logs: _logs, ...found } = h.found!;
  return { seed, first, gapDays: h.gapDays, landed: h.landed, found: { ...found, reachedCampDay: h.reachedCampDay }, heir: h.report };
}
```

The unused `_logs` binding: if the linter objects, write `const found = { structures: h.found!.structures, campFoodKcal: h.found!.campFoodKcal, campFirewoodKg: h.found!.campFirewoodKg, snares: h.found!.snares, kmToOldCamp: h.found!.kmToOldCamp, trapKg: h.found!.trapKg, reachedCampDay: h.reachedCampDay };` instead.

- [ ] **Step 5: Print three lives and the trend gate in `scripts/reference.ts`**

Replace the `if (heir) { ... }` block:

```ts
if (heir) {
  let trend = 0;
  for (const seed of seeds) {
    const l = runLineage(seed, days, 3);
    console.log(`seed ${seed} (lineage):`);
    let lastDeath: number | null = null;
    let climbs = true;
    for (const life of l.lives) {
      const r = life.report;
      const landed = `${fmtWorldDate(life.landed)}${life.gapDays ? `, ${life.gapDays} days after the death` : ""}`;
      console.log(` life ${life.index}: landed ${landed}`);
      if (life.found) {
        const f = life.found;
        const trap = f.trapKg === null ? "no trap" : `trap with ${f.trapKg.toFixed(1)} kg`;
        console.log(`  found: ${f.structures.join(", ") || "nothing standing"}; ${f.snares} snares; ${trap}; ${f.campFoodKcal} kcal, ${f.campFirewoodKg} kg of firewood and ${f.logs} logs at camp, ${f.kmToOldCamp} km away`);
        console.log(life.reachedCampDay === null ? "  never reached the old camp" : `  reached the old camp on day ${life.reachedCampDay}`);
      }
      console.log(`  surplus: first hang ${r.surplus.hang === null ? "never" : `day ${r.surplus.hang}`}, first large game ${r.surplus.largeGame === null ? "never" : `day ${r.surplus.largeGame}`}`);
      printCheckpoints(r);
      console.log(`  ${passLine(r)}`);
      if (r.outcome.kind === "died") {
        if (lastDeath !== null && r.outcome.day < lastDeath) climbs = false;
        lastDeath = r.outcome.day;
      }
    }
    if (climbs && l.lives.length > 1) trend++;
    console.log(` trend: ${climbs ? "each life at or past the one before" : "a life died sooner than the one before"}`);
  }
  console.log(`trend gate: ${trend} of ${seeds.length} seeds (gate is 3 of 4)`);
}
```

Replace `runHeir` with `runLineage` in the import from `../src/sim/reference`.

- [ ] **Step 6: Run the tests, then the script**

Run: `npx vitest run tests/reference.test.ts tests/year.test.ts tests/epitaph.test.ts`
Expected: PASS.

Run: `npm run reference -- --heir 17 19 42 79 250`
Expected: four lineage blocks and a `trend gate:` line. Keep the output for Task 14.

Run: `npm test`
Expected: green.

- [ ] **Step 7: Commit**

```bash
git add 08-survidle/src/sim/reference.ts 08-survidle/src/sim/species.ts 08-survidle/src/sim/year.ts 08-survidle/scripts/reference.ts 08-survidle/tests/reference.test.ts 08-survidle/tests/year.test.ts
git commit -m "feat(survidle): the heir report runs three lives, reads the surplus days, and prints the trend gate"
```

---

### Task 3: Fish capacities from biomass

**Files:**
- Modify: `src/sim/species.ts` (the `fish` helper's callers, lines 141 to 152)
- Modify: `tests/species.test.ts`

**Interfaces:**
- Produces: `perKm2(kgPerHa: number, kgEach: number): number` exported from `species.ts`; the fish rows' `habitat.lake` and `habitat.sea` values.

- [ ] **Step 1: Write the failing test**

Append to `tests/species.test.ts`:

```ts
describe("fish capacities", () => {
  it("come from biomass per hectare over mean weight, so one survivor never moves a shore's density", () => {
    // A boreal lake: perch 30 kg/ha at 80 g, pike 15 kg/ha at 1.5 kg (year loop spec 2.1).
    expect(perKm2(30, 0.08)).toBe(37500);
    expect(SPECIES_DEFS.perch.habitat.lake).toBe(perKm2(30, 0.08));
    expect(SPECIES_DEFS.roach.habitat.lake).toBe(perKm2(20, 0.1));
    expect(SPECIES_DEFS.pike.habitat.lake).toBe(perKm2(15, 1.5));
    expect(SPECIES_DEFS.whitefish.habitat.lake).toBe(perKm2(10, 0.5));
    expect(SPECIES_DEFS.char.habitat.lake).toBe(perKm2(5, 0.6));
    expect(SPECIES_DEFS.trout.habitat.lake).toBe(perKm2(5, 0.5));
    expect(SPECIES_DEFS.burbot.habitat.lake).toBe(perKm2(5, 1.0));
    expect(SPECIES_DEFS.cod.habitat.sea).toBe(perKm2(5, 2.5));
    expect(SPECIES_DEFS.saithe.habitat.sea).toBe(perKm2(5, 1.5));
    expect(SPECIES_DEFS.herring.habitat.sea).toBe(perKm2(30, 0.15));
    for (const s of fishSpecies()) {
      const h = SPECIES_DEFS[s].habitat;
      expect((h.lake ?? 0) + (h.sea ?? 0), s).toBeGreaterThanOrEqual(200);
    }
  });
});
```

Add `perKm2` to the import from `../src/sim/species`.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/species.test.ts`
Expected: FAIL, `perKm2` is not exported.

- [ ] **Step 3: Rewrite the fish rows**

In `src/sim/species.ts`, above the `fish` helper:

```ts
/**
 * Fish per square kilometre of water from a standing biomass in kg per
 * hectare and the mean weight of one fish. A boreal lake carries perch at
 * 10 to 50 kg/ha and pike at 10 to 20; the numbers below sit inside those
 * ranges, so a region's lake holds tens of thousands of perch and a
 * survivor's take never moves its density. A pond is still fishable down.
 */
export function perKm2(kgPerHa: number, kgEach: number): number {
  return Math.round((kgPerHa * 100) / kgEach);
}
```

Replace the ten fish rows:

```ts
  // Lake fish: biomass per hectare over mean weight (perKm2).
  perch: fish("perch", perKm2(30, 0.08), null, 0.9, 0.6, 0.3, { lie: "along the reeds" }),
  roach: fish("roach", perKm2(20, 0.1), null, 0.6, 0.7, 0.2, { lie: "in the shallows" }),
  pike: fish("pike", perKm2(15, 1.5), null, 0.8, 0.35, 2.0, { level: 3, lie: "in the reeds" }),
  whitefish: fish("whitefish", perKm2(10, 0.5), null, 0.6, 0.5, 0.6, { level: 2, lie: "off the point" }),
  char: fish("arctic char", perKm2(5, 0.6), null, 0.3, 0.45, 0.8, { level: 4, lie: "in the deep water" }),
  trout: fish("brown trout", perKm2(5, 0.5), null, 0.5, 0.4, 0.7, { level: 3, lie: "at the inflow" }),
  burbot: fish("burbot", perKm2(5, 1.0), null, 0.5, 0.4, 1.2, { level: 2, night: 1.3, season: resident(1.5), lie: "on the bottom" }),

  // Sea fish, the coastal strip: cod and saithe thin, herring in shoals.
  cod: fish("cod", null, perKm2(5, 2.5), 0.9, 0.5, 2.5, { level: 2, lie: "off the rocks" }),
  saithe: fish("saithe", null, perKm2(5, 1.5), 0.7, 0.5, 1.5, { lie: "off the rocks" }),
  herring: fish("herring", null, perKm2(30, 0.15), 0.6, 0.8, 0.15, { lie: "off the point" }),
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run tests/species.test.ts tests/wildlife.test.ts tests/animals.test.ts tests/trap.test.ts tests/tasks.test.ts tests/read.test.ts`
Expected: PASS. If `tests/read.test.ts` or `tests/trap.test.ts` pins a density label ("few", "some") on a shore that is now at capacity, change the expectation to the label `densityLabel` gives for density 1, which is "many".

Run: `npm test`
Expected: green.

- [ ] **Step 5: Measure**

Run: `npm run year -- 17 19 42 79`
Expected: the `fish` and `trap` yields in the last week no longer read 0 on every seed. Note the outcome line per seed for Task 14.

- [ ] **Step 6: Commit**

```bash
git add 08-survidle/src/sim/species.ts 08-survidle/tests/species.test.ts
git commit -m "feat(survidle): fish capacities from biomass per hectare - a lake holds tens of thousands of perch, and a survivor's take never moves its density"
```

---

### Task 4: Small-game inflow

**Files:**
- Modify: `src/sim/animals.ts`
- Modify: `tests/animals.test.ts`

**Interfaces:**
- Consumes: `startingPop(world, id)` from `src/sim/regionstate.ts`.
- Produces: `SMALL_GAME: Species[]`, `SMALL_GAME_INFLOW`, `inflow(...)` internal.

- [ ] **Step 1: Write the failing test**

Append to `tests/animals.test.ts`:

```ts
describe("small game moves in", () => {
  /** Seed 5's start region and its neighbours, all touched, hares at the numbers the test sets. */
  function heath(nbDensity: number) {
    const { state, world } = newGame(5);
    const id = state.player.region;
    const st = regionState(state, world, id);
    const cal = calendar(60 * 1440); // 1 June from a 1 April start
    const k = seasonalCapacity(world, id, "hare", cal, 0);
    expect(k).toBeGreaterThan(10);
    st.pop.hare = k / 2;
    for (const nb of regionAt(world, id).neighbours) {
      const nst = regionState(state, world, nb.id);
      nst.pop.hare = seasonalCapacity(world, nb.id, "hare", cal, 0) * nbDensity;
    }
    return { state, world, id, st, cal, k };
  }

  it("refills a half-emptied region to nine tenths within thirty summer days when the neighbours are full", () => {
    const { state, world, st, cal, k } = heath(1);
    const rng = new Rng(3);
    for (let d = 0; d < 30; d++) dailyAnimals(state, world, cal, rng, null);
    expect(popOf(st, "hare") / k).toBeGreaterThanOrEqual(0.9);
  });

  it("does not refill it from neighbours that are as empty", () => {
    const { state, world, st, cal, k } = heath(0.5);
    const rng = new Rng(3);
    for (let d = 0; d < 30; d++) dailyAnimals(state, world, cal, rng, null);
    expect(popOf(st, "hare") / k).toBeLessThan(0.7);
  });

  it("never takes a neighbour below the receiving region's density", () => {
    const { state, world, id, cal } = heath(1);
    const rng = new Rng(3);
    for (let d = 0; d < 30; d++) dailyAnimals(state, world, cal, rng, null);
    const receiver = popOf(regionState(state, world, id), "hare") / seasonalCapacity(world, id, "hare", cal, 0);
    for (const nb of regionAt(world, id).neighbours) {
      const k = seasonalCapacity(world, nb.id, "hare", cal, 0);
      if (k <= 0) continue;
      expect(popOf(regionState(state, world, nb.id), "hare") / k).toBeGreaterThanOrEqual(receiver - 0.05);
    }
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/animals.test.ts`
Expected: the first test FAILS (density stays near 0.5 plus growth).

- [ ] **Step 3: Implement the inflow**

In `src/sim/animals.ts`, after `const MIGRATION = 0.03;`:

```ts
/**
 * Small game refills a hunted range from the country around it: hares
 * disperse kilometres and a vacated range is full again within weeks. Each
 * day a region below its seasonal capacity receives this share of its gap,
 * scaled by its neighbours' mean density; 0.052 a day takes a half-empty
 * region to nine tenths in thirty days with full neighbours, since
 * 0.948^30 is 0.2. Runs in every month: hares move in winter too.
 */
export const SMALL_GAME_INFLOW = 0.052;
/** The species the inflow rule moves; deer, elk, reindeer and the predators keep the slow migration. */
export const SMALL_GAME: Species[] = ["hare", "squirrel", "willowGrouse", "ptarmigan", "blackGrouse", "capercaillie", "hazelGrouse"];
```

Import `startingPop` from `./regionstate` beside `regionState, touchedRegions`.

In `dailyAnimals`, after the growth loop and before the migration comment, add:

```ts
  // Small game moves into a region with room from every neighbour, in
  // proportion to the gap and the neighbours' density, never taking a
  // neighbour under the receiver's own density. An untouched neighbour is
  // read at its starting numbers and materialised only when it gives.
  for (const id of touched) {
    const r = regionAt(world, id);
    const st = state.regions[id];
    for (const s of speciesHere(r)) {
      if (!SMALL_GAME.includes(s)) continue;
      const k = seasonalCapacity(world, r.id, s, cal, state.weather.iceCm);
      if (k <= 0) continue;
      const pop = popOf(st, s);
      const gap = k - pop;
      if (gap <= 0.01) continue;
      const nbs = r.neighbours.map((nb) => {
        const nk = seasonalCapacity(world, nb.id, s, cal, state.weather.iceCm);
        const npop = state.regions[nb.id] ? popOf(state.regions[nb.id], s) : (startingPop(world, nb.id)[s] ?? 0);
        return { id: nb.id, k: nk, pop: npop, d: nk > 0 ? Math.min(1, npop / nk) : 0 };
      }).filter((nb) => nb.k > 0);
      if (!nbs.length) continue;
      const meanD = nbs.reduce((a, nb) => a + nb.d, 0) / nbs.length;
      let want = SMALL_GAME_INFLOW * gap * meanD;
      if (want < 0.01) continue;
      const after = (pop + want) / k;
      const totalD = nbs.reduce((a, nb) => a + nb.d, 0);
      let got = 0;
      for (const nb of nbs) {
        if (nb.d <= 0) continue;
        const share = want * (nb.d / totalD);
        const spare = Math.max(0, nb.pop - nb.k * after);
        const give = Math.min(share, spare);
        if (give < 0.001) continue;
        const nst = regionState(state, world, nb.id);
        nst.pop[s] = popOf(nst, s) - give;
        got += give;
      }
      st.pop[s] = pop + got;
    }
  }
```

In the migration loop, skip small game so it is not moved twice:

```ts
      if (SPECIES_DEFS[s].kind !== "mammal" || SMALL_GAME.includes(s)) continue;
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run tests/animals.test.ts tests/nobody.test.ts tests/landing.test.ts`
Expected: PASS. The existing "conserves land animals under migration" test sums every region's hares; the inflow is conservative too, so it holds. If `tests/nobody.test.ts` forbids reading `state.player` and a stack trace names this code, the read is in `regionState` on a neighbour, which is world state, not the player; the proxy only guards `state.player`.

Run: `npm test`
Expected: green.

- [ ] **Step 5: Measure**

Run: `npm run reference -- --heir 17 19`
Expected: seed 17's heir finds hares nearer capacity: the heir's day-11 checkpoint reads `snare` above 0. Note it for Task 14.

- [ ] **Step 6: Commit**

```bash
git add 08-survidle/src/sim/animals.ts 08-survidle/tests/animals.test.ts
git commit -m "feat(survidle): small game moves into a hunted range from the country around it, and the slow migration keeps to deer, elk and the predators"
```

---

### Task 5: The trap's catch rots

**Files:**
- Modify: `src/sim/types.ts:229` (`trap`)
- Modify: `src/sim/regionstate.ts` (nothing: `trap` starts null), `src/sim/save.ts` (default)
- Modify: `src/sim/camp.ts` (`dailyCamp`)
- Modify: `src/sim/tasks.ts` (`setTrap`, `emptyTrap`), `src/sim/intent.ts` (the arrival draw, if it sets `trap.kg = 0` there)
- Modify: `tests/trap.test.ts`

**Interfaces:**
- Produces: `RegionState.trap.age: number`, minutes since the catch was last emptied.

- [ ] **Step 1: Write the failing test**

Append to `tests/trap.test.ts`:

```ts
describe("the trap's catch rots", () => {
  it("is gone two days after it was drawn with nobody emptying it, and the trap keeps drawing", () => {
    const g = newGame(17);
    const { state, world } = g;
    const st = regionState(state, world, state.player.region);
    st.trap = { cell: 0, kg: 3, fish: ["perch"], age: 0 };
    st.pop.perch = 1000;
    state.dead = { cause: "froze", minute: state.minute };
    advance(state, world, 3 * 1440, { nobody: true });
    expect(st.trap).not.toBeNull();
    // Drawn again since: the rot empties it, the dawn draws refill it, so kg is whatever the last day drew.
    expect(st.trap!.age).toBeLessThan(2 * 1440 + 1);
    expect(state.log.some((e) => /fish in the trap .* have rotted/.test(e.text))).toBe(true);
  });
});
```

`advance` and `regionState` are already imported at the top of the file.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/trap.test.ts`
Expected: FAIL, type error on `age` or no rot line.

- [ ] **Step 3: Add the field and the rule**

`src/sim/types.ts` line 229:

```ts
  /** The basket trap set in this region's water: where, the live fish in it, the species that shore holds, and minutes since it was last emptied. */
  trap: { cell: number; kg: number; fish: Species[]; age: number } | null;
```

`src/sim/save.ts`, beside `st.structureAge ??= {};`:

```ts
    if (st.trap) st.trap.age ??= 0;
```

`src/sim/tasks.ts`, `setTrap` completion: `st.trap = { cell: here, kg: 0, fish: [...state.player.known[here].fish], age: 0 };`.

Every place that empties the trap sets `age` back to 0. Find them:

Run: `grep -n "trap.kg = 0\|trap!.kg = 0\|\.trap\.kg -= \|trap.kg = Math" src/sim/*.ts`

At each site that empties or reduces `kg` to 0 (the `emptyTrap` completion in `tasks.ts` and the arrival draw, which lives in `intent.ts` or `tasks.ts` under a comment about fish coming out when you arrive), add `st.trap.age = 0;` beside it.

`src/sim/camp.ts`, `dailyCamp`, inside the per-region loop before the `if (st.structures.snares > 0)` block:

```ts
    if (st.trap && st.trap.kg > 0) {
      st.trap.age += 1440;
      if (st.trap.age > SNARE_CATCH_MAX_AGE) {
        log(state, `The fish in the trap at ${r.name} have rotted.`, "bad");
        st.trap.kg = 0;
        st.trap.age = 0;
      }
    }
```

Place it above the trap's draw block in the same function so the draw refills after the rot on the same dawn. In `kitTrap` (`src/sim/reference.ts`), add `age: 0` to the literal.

- [ ] **Step 4: Run the tests**

Run: `npx vitest run tests/trap.test.ts tests/nobody.test.ts tests/advance-save.test.ts`
Expected: PASS. Run `npx tsc --noEmit` to catch every other `trap` literal missing `age` (the horizon, tests) and add `age: 0` to each.

Run: `npm test`
Expected: green.

- [ ] **Step 5: Commit**

```bash
git add 08-survidle/src/sim/types.ts 08-survidle/src/sim/save.ts 08-survidle/src/sim/tasks.ts 08-survidle/src/sim/intent.ts 08-survidle/src/sim/camp.ts 08-survidle/src/sim/reference.ts 08-survidle/tests/trap.test.ts
git commit -m "feat(survidle): a basket trap's catch rots after two days like the snare catch, and the baited basket keeps drawing"
```

If `intent.ts` was not touched, leave it out of the `git add`.

---

### Task 6: The rack is a real rack

**Files:**
- Modify: `src/sim/items.ts` (`RACK_MAX_KG`, new `MAX_RACKS`, `RACK_DRY_RAIN_MINUTES`, `STRUCTURES.dryingRack.desc`)
- Modify: `src/sim/types.ts` (`RegionState.racks`)
- Modify: `src/sim/regionstate.ts`, `src/sim/save.ts` (defaults)
- Modify: `src/sim/camp.ts` (`rackCapacity`, drying in rain, decay)
- Modify: `src/sim/actions.ts` (`loadRack`)
- Modify: `src/sim/tasks.ts` (hang check, build check and completion for `dryingRack`)
- Modify: `src/sim/capabilities.ts` (the rack row and the trap row's limits)
- Modify: `tests/hang.test.ts`, `tests/decay.test.ts`, `tests/inventory.test.ts`

**Interfaces:**
- Produces: `rackCapacity(st: RegionState): number` exported from `camp.ts`; `MAX_RACKS = 2`; `RACK_DRY_RAIN_MINUTES = 96 * 60`.

- [ ] **Step 1: Write the failing tests**

Append to `tests/hang.test.ts`:

```ts
describe("a real rack", () => {
  it("holds 40 kg, a second one doubles it, and drying takes four days in rain", () => {
    const g = rackCamp();
    const { state, world } = g;
    const st = regionState(state, world, state.player.region);
    expect(rackCapacity(st)).toBe(40);
    addItem(pile(state, st.campCell), "rawMeat", 100);
    expect(loadRack(state, world)).toBe(40);
    expect(check(state, world, cal, "hang")).toMatchObject({ ok: false, why: "the rack is full" });
    // A second rack.
    addItem(pile(state, st.campCell), "stick", 6);
    addItem(pile(state, st.campCell), "cordage", 2);
    expect(check(state, world, cal, "build", "dryingRack").ok).toBe(true);
    startTask(state, world, cal, "build", "dryingRack");
    advance(state, world, 60);
    expect(st.racks).toBe(2);
    expect(rackCapacity(st)).toBe(80);
    expect(check(state, world, cal, "build", "dryingRack")).toMatchObject({ ok: false, why: "two racks stand here already" });
    expect(loadRack(state, world)).toBe(40);
    // Rain halves the drying: 48 dry hours, 96 wet.
    state.weather.precip = "light";
    advance(state, world, 48 * 60);
    expect(st.rack.kg).toBe(80);
    advance(state, world, 48 * 60);
    expect(st.rack.kg).toBe(0);
    expect(qty(pile(state, st.campCell), "driedMeat")).toBeCloseTo(80 / 3, 6);
  });
});
```

Add `rackCapacity` (from `../src/sim/camp`), `loadRack` (from `../src/sim/actions`) and `startTask` (from `../src/sim/tasks`) to the imports. `rackCamp()` is the helper already in the file; if it sets `st.structures.dryingRack = true`, also set `st.racks = 1` in it.

In `tests/hang.test.ts` line 44 ("the rack is full"), the existing test fills the rack; change its fill to `RACK_MAX_KG` and import `RACK_MAX_KG` from `../src/sim/items`.

In `tests/decay.test.ts`, the rack decay assertion (the test at the top that advances 89 days and then past 90) will change in Task 7; leave it for now.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/hang.test.ts`
Expected: FAIL, `rackCapacity` not exported.

- [ ] **Step 3: Constants and the field**

`src/sim/items.ts`:

```ts
/** Raw meat one pole rack holds: strips a centimetre thick run 5 to 8 kg a metre of pole, four two-metre poles. */
export const RACK_MAX_KG = 40;
/** Racks a camp can stand; a third is a smokehouse's job. */
export const MAX_RACKS = 2;
/** Dry minutes a rack needs in dry weather, and the minutes it needs while it rains. */
export const RACK_DRY_MINUTES = 48 * 60;
export const RACK_DRY_RAIN_MINUTES = 96 * 60;
```

`STRUCTURES.dryingRack.desc`: `"Holds 40 kg of raw meat. Two dry days turn 3 kg into 1 kg that keeps; four in rain. A second rack doubles it."`

`src/sim/types.ts`, in `RegionState` after `structures`:

```ts
  /** Drying racks standing at the camp, 0 to MAX_RACKS; structures.dryingRack is true while any stands. */
  racks: number;
```

`src/sim/regionstate.ts` `newRegionState`: add `racks: 0,` after `structures`. `src/sim/save.ts` beside `st.structureAge ??= {};`: `st.racks ??= st.structures.dryingRack ? 1 : 0;`.

- [ ] **Step 4: Capacity, drying, decay, loading, checks**

`src/sim/camp.ts`, export next to `trapDraws`:

```ts
/** Raw meat the camp's racks hold together. */
export function rackCapacity(st: RegionState): number {
  return RACK_MAX_KG * Math.max(1, st.racks);
}
```

Import `RACK_MAX_KG` and `RACK_DRY_RAIN_MINUTES` from `./items` if not already imported. In `stepCamp`, the rack block:

```ts
    if (st.rack.kg > 0) {
      // Dry air dries; rain dries at half the rate, so two dry days become four wet ones.
      st.rack.dried += state.weather.precip === "none" ? dt : dt * (RACK_DRY_MINUTES / RACK_DRY_RAIN_MINUTES);
      if (st.rack.dried >= RACK_DRY_MINUTES) {
```

(the rest unchanged). In `dailyCamp`'s decay loop: `if (sid === "dryingRack") { st.rack.kg = 0; st.rack.dried = 0; st.racks = 0; }`.

`src/sim/actions.ts` `loadRack`: `const room = rackCapacity(st) - st.rack.kg;` and import `rackCapacity` from `./camp` (check for an import cycle: `camp.ts` imports from `actions.ts`? Run `grep -n "from \"./actions\"" src/sim/camp.ts`; if it does, put `rackCapacity` in `src/sim/items.ts` as `rackCapacity(racks: number)` taking the count instead, and call it `rackCapacity(st.racks)` everywhere).

`src/sim/tasks.ts` hang check: `const room = rackCapacity(st) - st.rack.kg;` and the detail `` `5 minutes a kilo; ${rackCapacity(st)} kg on the racks, two dry days` ``.

Build check (line 479): replace `if (st.structures[sid]) return { ...o, ok: false, why: "already built here" };` with:

```ts
      if (sid === "dryingRack") {
        if (st.racks >= MAX_RACKS) return { ...o, ok: false, why: "two racks stand here already" };
      } else if (st.structures[sid]) return { ...o, ok: false, why: "already built here" };
```

Build completion (line 1191 block): after `st.structures[sid] = true;` add `if (sid === "dryingRack") st.racks = Math.min(MAX_RACKS, st.racks + 1);`. Import `MAX_RACKS` from `./items`.

`src/sim/capabilities.ts`: the rack row's `limits` becomes `"40 kg a rack and two racks, two dry days"`; the trap row's `limits` becomes `"emptying, the racks' 80 kg, the ice"`.

- [ ] **Step 5: Run the tests**

Run: `npx vitest run tests/hang.test.ts tests/decay.test.ts tests/capabilities.test.ts tests/inventory.test.ts tests/nobody.test.ts`
Expected: PASS except any assertion pinned to 6 kg: `grep -rn "6 kg\|RACK_MAX_KG).toBe(6)" tests/` and update each to 40. If `tests/capabilities.test.ts` asserts the old limits string, update it.

Run: `npx tsc --noEmit` and fix every `RegionState` literal missing `racks` (tests build them by `newGame`, so usually none).

Run: `npm test`
Expected: green.

- [ ] **Step 6: Commit**

```bash
git add 08-survidle/src/sim/items.ts 08-survidle/src/sim/types.ts 08-survidle/src/sim/regionstate.ts 08-survidle/src/sim/save.ts 08-survidle/src/sim/camp.ts 08-survidle/src/sim/actions.ts 08-survidle/src/sim/tasks.ts 08-survidle/src/sim/capabilities.ts 08-survidle/tests/hang.test.ts 08-survidle/tests/capabilities.test.ts
git commit -m "feat(survidle): a pole rack holds 40 kg, a camp stands two, and rain doubles the drying"
```

---

### Task 7: Decay at one and two years

**Files:**
- Modify: `src/sim/items.ts:134`
- Modify: `tests/decay.test.ts`, `tests/inventory.test.ts` (if pinned)

- [ ] **Step 1: Change the tests first**

In `tests/decay.test.ts`, the first test ("drops the lean-to and the rack after a season...") becomes:

```ts
  it("drops the lean-to after a year and the rack after two, and keeps the cabin and the fire pit", () => {
    const { state, world, st } = camp();
    state.dead = { cause: "froze", minute: 0 };
    advance(state, world, 200 * 1440, { nobody: true });
    expect(st.structures.leanTo).toBe(true);
    expect(st.structures.dryingRack).toBe(true);
    advance(state, world, 165 * 1440, { nobody: true });
    expect(st.structures.leanTo).toBe(false);
    expect(st.structures.dryingRack).toBe(true);
    advance(state, world, 365 * 1440, { nobody: true });
    expect(st.structures.dryingRack).toBe(false);
    expect(st.racks).toBe(0);
    expect(st.structures.cabin).toBe(true);
    expect(st.structures.firePit).toBe(true);
  });
```

Read the rest of `tests/decay.test.ts`: every assertion that advances toward 90 days for the lean-to or the rack, or reads "needs re-roofing" at 60 days, moves to the new lives (two thirds of 365 is 243 days for the lean-to; two thirds of 730 is 487 for the rack). Update each number; the shape of the tests stays.

In `tests/inventory.test.ts` line 92 area, add: `expect(STRUCTURE_LIFE_DAYS.leanTo).toBe(365); expect(STRUCTURE_LIFE_DAYS.dryingRack).toBe(730);`.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/decay.test.ts tests/inventory.test.ts`
Expected: FAIL on the new day counts.

- [ ] **Step 3: Change the constant**

`src/sim/items.ts:134`:

```ts
/** Days a decaying structure stands before the weather takes it down: a bough roof fails in a year while its frame stands, a lashed pole rack lasts two, a turf roof a year and a half. */
export const STRUCTURE_LIFE_DAYS: Record<DecayingId, number> = { leanTo: 365, dryingRack: 730, turfHut: 540 };
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run tests/decay.test.ts tests/inventory.test.ts tests/nobody.test.ts tests/landing.test.ts`
Expected: PASS. `tests/nobody.test.ts` asserts "over a 90-day gap ... the rack is gone"; that assertion was written against the 90-day life. Change it to assert the rack still stands after 90 days and its hung meat has dried and the catch rotted, which is what the gap does now.

Run: `npm test`
Expected: green.

- [ ] **Step 5: Commit**

```bash
git add 08-survidle/src/sim/items.ts 08-survidle/tests/decay.test.ts 08-survidle/tests/inventory.test.ts 08-survidle/tests/nobody.test.ts
git commit -m "feat(survidle): the lean-to stands a year and the rack two, so an heir can inherit a rack"
```

---

### Task 8: The hunt chain in the reference list

**Files:**
- Modify: `src/sim/reference.ts` (`REFERENCE_ORDERS`, `ReferencePlayer.tick`, new `wantOpen`)
- Modify: `tests/reference.test.ts`, `tests/species.test.ts`

**Interfaces:**
- Consumes: `RECOMMENDED`, `skillLevel` from `./skills`.
- Produces: `wantOpen(state, want, cal): boolean` exported for tests; the new list order below; Task 11 adds the date clause to `wantOpen`.

- [ ] **Step 1: Write the failing tests**

In `tests/reference.test.ts`, the test at line 90 `expect(REFERENCE_ORDERS.length).toBe(35)` becomes `toBe(39)`. Read the tests at lines 55 to 95 that map the list to `task:arg:kind:until` strings and update their expected arrays to the new list (Step 3 gives the order). Then append:

```ts
describe("wants by level", () => {
  it("opens the large-game keeps at the species' recommended hunting level and not below", () => {
    const { state, world } = newGame(17);
    const cal = calendar(0);
    const elk = REFERENCE_ORDERS.find((w) => w.req.task === "hunt" && w.req.arg === "elk")!;
    const any = REFERENCE_ORDERS.find((w) => w.req.task === "hunt" && w.req.arg === "any")!;
    expect(wantOpen(state, elk, cal)).toBe(false);
    expect(wantOpen(state, any, cal)).toBe(true);
    setSkillLevel(state, "hunting", SPECIES_DEFS.elk.hunt!.level!);
    expect(wantOpen(state, elk, cal)).toBe(true);
  });

  it("the list hangs as a grind, keeps eight cordage, and hunts elk, reindeer and roe deer by name", () => {
    const hang = REFERENCE_ORDERS.find((w) => w.req.task === "hang")!;
    expect(hang.kind).toBe("grind");
    expect(hang.req.until.kind).toBe("forever");
    const cordage = REFERENCE_ORDERS.find((w) => w.req.task === "craft" && w.req.arg === "cordage")!;
    expect(cordage.req.until).toEqual({ kind: "campHas", qty: 8 });
    const named = REFERENCE_ORDERS.filter((w) => w.req.task === "hunt" && w.req.arg !== "any").map((w) => w.req.arg);
    expect(named).toEqual(["elk", "reindeer", "deer"]);
  });
});
```

Add `wantOpen` to the reference import, `calendar` from `../src/sim/calendar`, `setSkillLevel` from `../src/sim/horizon`, `SPECIES_DEFS` from `../src/sim/species`.

In `tests/species.test.ts`, inside the existing describe on foods (or a new one), add the auto-eat guard the spec asks for:

```ts
  it("auto-eat never takes raw meat, only what is cooked, dried, picked or rendered", () => {
    expect(AUTO_EAT_ORDER).not.toContain("rawMeat");
    expect(AUTO_EAT_ORDER).not.toContain("fish");
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/reference.test.ts tests/species.test.ts`
Expected: the reference tests FAIL (`wantOpen` missing, length 35).

- [ ] **Step 3: The list**

In `src/sim/reference.ts`, `REFERENCE_ORDERS` becomes (four changes: cordage 8, the hang grind, three large-game keeps after the hunt keep, a winter firewood keep before the felling grind; Task 11 gates the last one by date):

```ts
export const REFERENCE_ORDERS: { req: IntentRequest; kind: OrderKind }[] = [
  keep("fill", 2),
  job("stone", { kind: "campHas", qty: 8 }),
  keep("sticks", 10),
  keep("bark", 12),
  keep("craft", 8, "cordage"),
  job("build", { kind: "once" }, "firePit"),
  job("craft", { kind: "once" }, "fireDrill"),
  keep("light", 1),
  keep("chop", 4),
  keep("split", 60),
  job("build", { kind: "once" }, "leanTo"),
  job("craft", { kind: "once" }, "knife"),
  keep("craft", 1, "snare"),
  job("build", { kind: "times", n: 5 }, "snare"),
  job("craft", { kind: "campHas", qty: 2 }, "barkBucket"),
  job("craft", { kind: "once" }, "fishingSpear"),
  job("read", { kind: "once" }),
  job("craft", { kind: "once" }, "basketTrap", "leave"),
  job("setTrap", { kind: "once" }),
  keep("cook", 1, "fish"),
  keep("cook", 1),
  keep("fish", 1, "any"),
  keep("berries", 2),
  job("build", { kind: "once" }, "dryingRack"),
  { req: { task: "hang", until: { kind: "forever" }, deliver: "leave", where: "nearest" }, kind: "grind" },
  job("craft", { kind: "once" }, "bow"),
  keep("craft", 10, "arrows"),
  keep("hunt", 2, "any"),
  keep("hunt", 40, "elk"),
  keep("hunt", 40, "reindeer"),
  keep("hunt", 40, "deer"),
  keep("craft", 1, "axe"),
  job("sticks", { kind: "campHas", qty: 20 }),
  job("bark", { kind: "campHas", qty: 40 }),
  job("build", { kind: "once" }, "turfHut"),
  job("build", { kind: "once" }, "waterStore"),
  keep("fill", 20),
  keep("split", 400),
  { req: { task: "chop", until: { kind: "forever" }, deliver: "camp", where: "nearest" }, kind: "grind" },
];
```

Update the doc comment above the list: cordage at eight because arrows, snares and the bucket all draw on it; the hang grind hangs whatever is raw while the rack has room, and the stock is what that made; the large-game keeps sit below the small-game keep and open at the species' recommended level, since a competent player does not walk at an elk at level 1; the 400 kg firewood keep is the winter want, opened from 1 September (Task 11).

- [ ] **Step 4: The level gate**

Add to `reference.ts` (import `RECOMMENDED, skillLevel` from `./skills` and `type Calendar` from `./calendar`):

```ts
/**
 * Whether a competent player would give this want today: a named hunt
 * waits for the species' recommended Hunting level, since walking at an
 * elk with a stone point at level 1 is not competence. The second clause,
 * the season, is the winter firewood want's (spec 4.3).
 */
export function wantOpen(state: GameState, w: { req: IntentRequest; kind: OrderKind }, cal: Calendar): boolean {
  if (w.req.task === "hunt" && w.req.arg && w.req.arg !== "any") {
    const rec = RECOMMENDED[`hunt:${w.req.arg}`];
    if (rec && skillLevel(state, rec.skill) < rec.level) return false;
  }
  return true;
}
```

In `ReferencePlayer.tick`, in the wants loop right after `if (this.finished.has(i) || this.given.has(i)) continue;`:

```ts
      if (!wantOpen(state, w, calendar(state.minute, state.startDoy))) continue;
```

- [ ] **Step 5: Run the tests**

Run: `npx vitest run tests/reference.test.ts tests/species.test.ts tests/horizon.test.ts tests/ladder.test.ts`
Expected: PASS. `setUpStage` in `horizon.ts` gives every want through `withinLadder` without the player script, so the elk keeps land there as jobs; if a horizon test pins the order count, update it to 39.

Run: `npm test`
Expected: green.

- [ ] **Step 6: Measure**

Run: `npm run year -- 17 19 42 79` and `npm run reference`
Expected: the year run's `surplus` line names a large-game day on at least one seed, and `hunt` in the last week is above 0 somewhere. The April gate stays 4 of 4 at day 26. If April drops below 4 of 4, the cause is the list's shape and not the rules: check whether the hang grind is being served ahead of the cook keeps (it sits below them, so it should not be); report the reading either way.

- [ ] **Step 7: Commit**

```bash
git add 08-survidle/src/sim/reference.ts 08-survidle/tests/reference.test.ts 08-survidle/tests/species.test.ts
git commit -m "feat(survidle): the reference list hunts large game by name at level, hangs as a grind, keeps eight cordage, and wants a winter woodpile"
```

---

### Task 9: Fuel by shelter, and the fire under the smoke hole

**Files:**
- Modify: `src/sim/fire.ts` (`burnPerHour`)
- Modify: `src/sim/camp.ts` (the caller)
- Modify: `src/sim/tasks.ts` (the `light` check's detail and its completion)
- Modify: `tests/fire.test.ts`

**Interfaces:**
- Produces: `burnPerHour(w, ambient, st: RegionState): number`; `SHELTER_BURN_KG_PER_HOUR`.

- [ ] **Step 1: Write the failing tests**

Append to `tests/fire.test.ts`:

```ts
describe("fuel by shelter", () => {
  it("burns 3 kg an hour in the open, 1.2 under a hut's smoke hole and 0.8 at a cabin hearth", () => {
    const { state, world } = newGame(3);
    const st = regionState(state, world, state.player.region);
    const dry = { ...state.weather, precip: "none" as const };
    st.fire.lit = true;
    expect(burnPerHour(dry, 5, st)).toBe(3);
    st.structures.leanTo = true;
    expect(burnPerHour(dry, 5, st)).toBe(3);
    st.structures.turfHut = true;
    expect(burnPerHour(dry, 5, st)).toBe(3);
    st.fire.indoors = true;
    expect(burnPerHour(dry, -20, st)).toBe(1.2);
    st.structures.cabin = true;
    st.structures.hearth = true;
    expect(burnPerHour(dry, -20, st)).toBe(0.8);
  });

  it("rain only eats an unroofed fire", () => {
    const { state, world } = newGame(3);
    const st = regionState(state, world, state.player.region);
    const rain = { ...state.weather, precip: "heavy" as const };
    expect(burnPerHour(rain, 5, st)).toBe(6);
    st.structures.turfHut = true;
    expect(burnPerHour(rain, 5, st)).toBe(3);
  });

  it("lighting the fire with a hut standing puts it under the smoke hole", () => {
    const { state, world } = newGame(3);
    const st = regionState(state, world, state.player.region);
    placeAt(state, world, st.campCell);
    st.structures.firePit = true;
    st.structures.turfHut = true;
    state.player.tools.push({ id: "fireDrill", durability: 100 });
    addItem(pile(state, st.campCell), "firewood", 10);
    expect(check(state, world, cal, "light").detail).toMatch(/under the smoke hole/);
    startTask(state, world, cal, "light");
    advance(state, world, 15);
    expect(st.fire.lit).toBe(true);
    expect(st.fire.indoors).toBe(true);
  });
});
```

If `state.player.tools.push({ id: "fireDrill", durability: 100 })` does not match the `Tool` type, use `freshTool("fireDrill")` from `../src/sim/inventory`.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/fire.test.ts`
Expected: FAIL, `burnPerHour` takes a boolean and returns 3 everywhere.

- [ ] **Step 3: Fuel by shelter**

`src/sim/fire.ts`, replace `const BURN_KG_PER_HOUR = 3;` and `burnPerHour`:

```ts
/**
 * Fuel a fire eats an hour by where it burns. An open fire kept going is 2
 * to 4 kg an hour; a hearth inside a turf hut kept through a winter night
 * is 15 to 30 kg a day, and Nordic households with a stove burned 4 to 8
 * tonnes a year, so 1.2 and 0.8. The hut and cabin rates apply only to a
 * fire lit indoors; a fire at the pit outside a hut is an open fire.
 */
export const SHELTER_BURN_KG_PER_HOUR = { open: 3, turfHut: 1.2, cabin: 0.8 } as const;

/** Fuel the fire eats per hour in this weather and this shelter; a roof over the pit keeps the rain off. */
export function burnPerHour(w: Weather, ambient: number, st: RegionState): number {
  if (st.fire.indoors) {
    if (st.structures.cabin && st.structures.hearth) return SHELTER_BURN_KG_PER_HOUR.cabin;
    if (st.structures.turfHut) return SHELTER_BURN_KG_PER_HOUR.turfHut;
  }
  if (w.precip === "none" || roofed(st)) return SHELTER_BURN_KG_PER_HOUR.open;
  const snowing = ambient <= 0;
  if (w.precip === "heavy" && !snowing) return 6;
  return 4.5;
}
```

`roofed` is defined later in the same file; hoisting makes that fine. `src/sim/camp.ts:34`: `const perMin = burnPerHour(state.weather, ambient, st) / 60;` (keep `const roof = roofed(st);` since `drownedLow` reads it). Search for other callers: `grep -rn "burnPerHour(" src tests` and update each to pass the region state.

- [ ] **Step 4: The light task under the smoke hole**

In `src/sim/tasks.ts`, the `light` check (line 500 block): after `if (!o.ok) return o;` and the fire pit and burning checks, add before `return o;`:

```ts
      if (st.structures.turfHut && !st.structures.cabin) return { ...o, detail: `${o.detail}; under the smoke hole` };
```

In the `light` completion (find `case "light":` in the completion switch near line 1215), where the fire is set lit, add: `st.fire.indoors = st.structures.turfHut && !st.structures.cabin;` right after `st.fire.lit = true;` (if the completion sets `indoors = false` explicitly, replace that line). A cabin without a hearth keeps the outdoor fire, since a fire inside a closed cabin without a hearth is the smoke death the README describes.

- [ ] **Step 5: Run the tests**

Run: `npx vitest run tests/fire.test.ts tests/hut.test.ts tests/camp.test.ts tests/storm.test.ts tests/nobody.test.ts`
Expected: PASS. `tests/hut.test.ts` may assert the fire is outdoors after a plain light with a hut standing; that assertion described the old behaviour and flips.

Run: `npm test`
Expected: green.

- [ ] **Step 6: Measure**

Run: `npm run year -- --winter`
Expected: the firewood at the last checkpoint is no longer 0 on every seed. Note the four outcomes.

- [ ] **Step 7: Commit**

```bash
git add 08-survidle/src/sim/fire.ts 08-survidle/src/sim/camp.ts 08-survidle/src/sim/tasks.ts 08-survidle/tests/fire.test.ts 08-survidle/tests/hut.test.ts
git commit -m "feat(survidle): a hearth under a roof burns a third of an open fire, and lighting the fire with a hut standing puts it under the smoke hole"
```

---

### Task 10: Inside is a temperature

**Files:**
- Modify: `src/sim/player.ts` (`feltTemperature`, new `INDOOR_C`)
- Modify: `tests/fire.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `tests/fire.test.ts`:

```ts
describe("inside is a temperature", () => {
  it("holds a body in wool above 20 warmth asleep in a hut at -30 with the fire lit, and not with it out", () => {
    const { state, world } = newGame(3);
    const st = regionState(state, world, state.player.region);
    placeAt(state, world, st.campCell);
    st.structures.firePit = true;
    st.structures.turfHut = true;
    st.fire.lit = true;
    st.fire.fuelKg = 10;
    st.fire.indoors = true;
    state.task = { id: "sleep", minutes: 0, total: 480 } as any;
    const lit = feltTemperature(state, world, -30);
    expect(warmthTarget(lit)).toBeGreaterThan(20);
    st.fire.lit = false;
    const out = feltTemperature(state, world, -30);
    expect(out).toBeLessThan(lit - 10);
    expect(INDOOR_C).toEqual({ turfHut: 5, cabin: 10 });
  });
});
```

Import `INDOOR_C`, `warmthTarget` from `../src/sim/player`. If `state.task` has a different literal shape, use `startTask(state, world, cal, "sleep")` instead of the cast.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/fire.test.ts`
Expected: FAIL, `INDOOR_C` not exported.

- [ ] **Step 3: The floor**

`src/sim/player.ts`, above `feltTemperature`:

```ts
/**
 * Air inside a walled shelter with its fire lit. A turf hut with a hearth
 * stays above freezing at -30 C outside; a chinked cabin sits at 10 to 15
 * by the fire. The outside air is the floor's lower bound, never its
 * ceiling: a hut in July is July.
 */
export const INDOOR_C = { turfHut: 5, cabin: 10 } as const;
```

In `feltTemperature`, replace `let felt = ambient + insulation(state);` and the `shelterBonus` line:

```ts
  const indoors = camp && campTask && r.fire.lit && r.fire.indoors && (r.structures.cabin || r.structures.turfHut);
  const floor = indoors ? (r.structures.cabin ? INDOOR_C.cabin : INDOOR_C.turfHut) : -Infinity;
  let felt = Math.max(ambient, floor) + insulation(state);
  if (camp && fireWarms(r)) felt += fireWarmth(r.fire, campTask);
  // A room at its temperature is the shelter's whole gift; the bonus is for a roof with no warm air under it.
  if (camp && campTask && !indoors) felt += shelterBonus(r);
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run tests/fire.test.ts tests/player.test.ts tests/body.test.ts tests/hut.test.ts tests/clothing.test.ts`
Expected: PASS. A hut test that pinned felt temperature as ambient plus 10 with the fire lit indoors now reads the floor; update that number to what the new rule gives and say why in the test name.

Run: `npm test`
Expected: green.

- [ ] **Step 5: Measure**

Run: `npm run year -- --winter`
Expected: no seed dies of cold with the fire lit; note the outcomes.

- [ ] **Step 6: Commit**

```bash
git add 08-survidle/src/sim/player.ts 08-survidle/tests/fire.test.ts 08-survidle/tests/hut.test.ts
git commit -m "feat(survidle): a walled shelter with its fire lit holds an inside temperature, and the roof's bonus is for a roof with no warm air under it"
```

---

### Task 11: The winter want and the melt fallback

**Files:**
- Modify: `src/sim/reference.ts` (`wantOpen`'s season clause)
- Modify: `src/sim/intent.ts` (the fill intent's fallback near line 537)
- Modify: `tests/reference.test.ts`, `tests/fill.test.ts`

**Interfaces:**
- Consumes: `campMeltReady` is private to `body.ts`; export it.
- Produces: `WINTER_WOOD_FROM_DOY = 244` in `reference.ts`.

- [ ] **Step 1: Write the failing tests**

Append to `tests/reference.test.ts` inside "wants by level":

```ts
  it("opens the 400 kg firewood keep from 1 September and not in April", () => {
    const { state } = newGame(17);
    const wood = REFERENCE_ORDERS.find((w) => w.req.task === "split" && w.req.until.kind === "campHas" && w.req.until.qty === 400)!;
    expect(wantOpen(state, wood, calendar(0, 90))).toBe(false);
    expect(wantOpen(state, wood, calendar(0, 244))).toBe(true);
    expect(wantOpen(state, wood, calendar(0, 20))).toBe(true);
  });
```

Append to `tests/fill.test.ts` (read its helpers first; it builds a camp beside a shore with a vessel in hand):

```ts
describe("the fill keep in winter", () => {
  it("melts snow at the fire when the shore is iced and no hole can be cut, and the camp water rises", () => {
    const { state, world } = newGame(17);
    const st = regionState(state, world, state.player.region);
    placeAt(state, world, st.campCell);
    st.structures.firePit = true;
    st.fire.lit = true;
    st.fire.fuelKg = 20;
    state.player.tools = state.player.tools.filter((t) => t.id !== "axe");
    state.player.tools.push(freshTool("barkBucket"));
    state.weather.iceCm = ICE_SHORE_CM;
    state.weather.snowCm = 20;
    addOrder(state, world, { task: "fill", until: { kind: "campHas", qty: 2 }, deliver: "camp", where: "nearest" }, "keep");
    const before = qty(pile(state, st.campCell), "water");
    advance(state, world, 120);
    expect(qty(pile(state, st.campCell), "water")).toBeGreaterThan(before);
    expect(state.log.some((e) => /melting snow/.test(e.text) || /Melt snow/.test(e.text))).toBe(true);
  });
});
```

Imports: `freshTool`, `pile`, `qty` from `../src/sim/inventory`; `placeAt` from `../src/sim/position`; `addOrder` from `../src/sim/orders`; `ICE_SHORE_CM` from `../src/sim/water`; `advance`, `newGame`, `regionState` as the file already does. If the runner's step text for melt is not logged, assert the water rise alone and drop the log clause.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/reference.test.ts tests/fill.test.ts`
Expected: FAIL: the wood want reads open in April; the fill keep sits blocked on "iced over; needs an axe for an ice hole".

- [ ] **Step 3: The season clause**

In `src/sim/reference.ts`:

```ts
/** 1 September: a competent player starts the winter woodpile when the nights first frost. */
export const WINTER_WOOD_FROM_DOY = 244;
/** The day the woodpile want closes again: after ice-out the pile is for next winter, and the list's 60 kg keep carries the summer. */
export const WINTER_WOOD_TO_DOY = 120;
```

In `wantOpen`, before `return true;`:

```ts
  if (w.req.task === "split" && w.req.until.kind === "campHas" && w.req.until.qty >= 400) {
    return cal.dayOfYear >= WINTER_WOOD_FROM_DOY || cal.dayOfYear < WINTER_WOOD_TO_DOY;
  }
```

A keep once given stays for good in `ReferencePlayer`, so the close clause only matters for a life that starts in summer.

- [ ] **Step 4: The melt fallback**

In `src/sim/body.ts`, export `campMeltReady` (change `function campMeltReady` to `export function campMeltReady`). In `src/sim/intent.ts`, import `campMeltReady` from `./body` (the file already imports from `./body`), and replace the fill-on-frozen-shore block at line 537:

```ts
  // A fill on a frozen shore cuts its hole first; the fill follows next minute.
  // With no hole to be had (no axe), the fill is served at camp instead: snow
  // melted at the fire into the vessels, which the delivery then pours out.
  if (it.task === "fill" && !waterSource(state, world)) {
    if (check(state, world, cal, "iceHole").ok) {
      takeStep(state, world, cal, { id: "iceHole", step: "cutting an ice hole" }, rng);
      return undefined;
    }
    if (state.weather.iceCm >= ICE_SHORE_CM && campMeltReady(state, world, cal)) {
      if (here !== it.campCell) return walkTo(state, world, cal, it, it.campCell, " to melt snow");
      const fs = fireStep(state, world, cal, it.campCell);
      if (fs) { takeStep(state, world, cal, fs, rng); return undefined; }
      takeStep(state, world, cal, { id: "melt", step: "melting snow" }, rng);
      return undefined;
    }
  }
```

This block sits after `if (here !== it.cell) return walkTo(...)` today; move the whole fill clause above that line so the walk to the shore is not taken first. `fireStep` is private to `body.ts`; export it too. `ICE_SHORE_CM` is imported in `intent.ts` already (line 147 uses it).

- [ ] **Step 5: Run the tests**

Run: `npx vitest run tests/fill.test.ts tests/reference.test.ts tests/ice.test.ts tests/intent.test.ts tests/needs.test.ts`
Expected: PASS.

Run: `npm test`
Expected: green.

- [ ] **Step 6: Measure**

Run: `npm run year -- --winter` and `npm run year`
Expected: no winter seed dies of thirst; the year run's month lines from October show the firewood stock climbing toward 400 kg.

- [ ] **Step 7: Commit**

```bash
git add 08-survidle/src/sim/reference.ts 08-survidle/src/sim/body.ts 08-survidle/src/sim/intent.ts 08-survidle/tests/reference.test.ts 08-survidle/tests/fill.test.ts
git commit -m "feat(survidle): the woodpile want opens in September, and a fill keep on an iced shore melts snow at the fire when no hole can be cut"
```

---

### Task 12: Wet and cold is cold sooner

**Files:**
- Modify: `src/sim/body.ts` (`currentNeed`)
- Modify: `tests/needs.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `tests/needs.test.ts`:

```ts
describe("wet and cold", () => {
  it("counts as cold at warmth 45 when soaked under 5 C, and not when dry", () => {
    const g = felling();
    const { state, world } = g;
    const st = regionState(state, world, state.player.region);
    st.structures.firePit = true;
    st.fire.lit = true;
    st.fire.fuelKg = 10;
    state.weather.offset = -10;
    const cal = calendar(state.minute);
    expect(ambientTemperature(cal, state.weather)).toBeLessThan(5);
    state.player.warmth = 40;
    state.player.wetness = 0;
    expect(currentNeed(state, world, cal, state.intent!)).not.toBe("cold");
    state.player.wetness = 80;
    expect(currentNeed(state, world, cal, state.intent!)).toBe("cold");
    expect(SOAKED_WETNESS).toBe(60);
    expect(WET_COLD_C).toBe(5);
  });
});
```

`felling()` is the helper at the top of the file (a forever felling on seed 17 with an intent running). Import `ambientTemperature` from `../src/sim/weather`, and `SOAKED_WETNESS`, `WET_COLD_C` from `../src/sim/body`. Check `currentNeed`'s signature at the top of `body.ts` and pass what it takes; if it takes `(state, world, cal)` only, drop the intent argument.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/needs.test.ts`
Expected: FAIL, the soaked body at 40 reads no cold need (threshold 30).

- [ ] **Step 3: The rule**

`src/sim/body.ts`, beside `COLD_UNDER` and `WARM_AT`:

```ts
/** Soaked through: wet clothing holds half its warmth, and hypothermia near freezing is an hour or two away. */
export const SOAKED_WETNESS = 60;
/** The air under which a soaked body reads cold at WARM_AT rather than COLD_UNDER. */
export const WET_COLD_C = 5;
```

In `currentNeed`, replace the `const cold = ...` line:

```ts
  const wetCold = p.wetness > SOAKED_WETNESS && ambientTemperature(cal, state.weather) < WET_COLD_C;
  const coldUnder = wetCold ? WARM_AT : COLD_UNDER;
  const cold = !it.coldSpent && (p.warmth < coldUnder || (it.need === "cold" && p.warmth < WARM_AT));
```

Import `ambientTemperature` from `./weather` if `body.ts` does not already.

- [ ] **Step 4: Run the tests**

Run: `npx vitest run tests/needs.test.ts tests/body.test.ts tests/storm.test.ts tests/clothing.test.ts`
Expected: PASS.

Run: `npm test`
Expected: green.

- [ ] **Step 5: Measure**

Run: `npm run year -- 19 --level=10`
Expected: seed 19 no longer freezes in early October while picking berries in the rain; note where it dies now.

- [ ] **Step 6: Commit**

```bash
git add 08-survidle/src/sim/body.ts 08-survidle/tests/needs.test.ts
git commit -m "feat(survidle): a soaked body under 5 C turns for the fire at warmth 45, before it is shivering at 6"
```

---

### Task 13: The journal clause and the ancestor's day

**Files:**
- Modify: `src/sim/tasks.ts` (record the first snare set as a `built` event)
- Modify: `src/sim/epitaph.ts` (`eventLine` for the snare)
- Modify: `src/sim/landing.ts` (`land`)
- Modify: `src/ui/panels.ts` (`tombstoneHtml`)
- Modify: `tests/landing.test.ts`, `tests/epitaph.test.ts`, `tests/survivor-ui.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `tests/landing.test.ts`:

```ts
describe("what the heir is told", () => {
  it("quotes the ancestor's journal for what was built, and the tombstone the ancestor's day", () => {
    const { state, world } = newGame(17);
    const st = regionState(state, world, state.player.region);
    placeAtSpot(state, world, "shore");
    st.structures.firePit = true;
    st.structures.dryingRack = true;
    st.racks = 1;
    const rec = current(state);
    rec.events.push({ kind: "built", structure: "firePit", day: 2, date: { year: 1, doy: 91 } });
    rec.events.push({ kind: "built", structure: "dryingRack", day: 9, date: { year: 1, doy: 98 } });
    rec.events.push({ kind: "built", structure: "snare", day: 3, date: { year: 1, doy: 92 } });
    advance(state, world, 20 * 1440);
    die(state, "starved");
    const firstDay = current(state).died!.day;
    beginAgain(state, world);
    land(state, world, { first: "Aino", last: "Berzins" });
    const last = state.log[state.log.length - 1].text;
    expect(last).toMatch(new RegExp(`The journal of ${fmtName(state.survivors[0].name)} lists a fire pit, snares and a drying rack at `));
    // The tombstone after the heir dies names the ancestor's day.
    advance(state, world, 3 * 1440);
    die(state, "froze");
    const html = tombstoneHtml(state, world);
    expect(html).toContain(`${fmtName(state.survivors[0].name)} lived ${firstDay} days.`);
  });

  it("says nothing about the journal when nothing was built, and the first tombstone has no comparison", () => {
    const { state, world } = newGame(17);
    placeAtSpot(state, world, "shore");
    advance(state, world, 2 * 1440);
    die(state, "starved");
    const html = tombstoneHtml(state, world);
    expect(html).not.toContain(" lived ");
    beginAgain(state, world);
    land(state, world, { first: "Aino", last: "Berzins" });
    expect(state.log[state.log.length - 1].text).not.toContain("journal");
  });
});
```

Imports: `tombstoneHtml` from `../src/ui/panels`, `fmtName` from `../src/sim/names`; the rest is already imported at the top of the file.

Append to `tests/epitaph.test.ts`:

```ts
  it("writes the first snare set as its own line", () => {
    const r = rec();
    r.events.push({ kind: "built", structure: "snare", day: 3, date: { year: 1, doy: 92 } });
    expect(entry(r)).toContain("Day 3. Set the first snare.");
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/landing.test.ts tests/epitaph.test.ts`
Expected: FAIL on the journal line and the snare line.

- [ ] **Step 3: Record the first snare**

`src/sim/tasks.ts`, build completion: replace

```ts
      if (sid !== "snare" && !hasEvent(state, (e) => e.kind === "built" && e.structure === sid)) record(state, { kind: "built", structure: sid });
```

with

```ts
      // Once per structure per life; the first snare set is the record's snare line.
      if (!hasEvent(state, (e) => e.kind === "built" && e.structure === sid)) record(state, { kind: "built", structure: sid });
```

`src/sim/epitaph.ts`, `eventLine`: `case "built": return e.structure === "snare" ? \`Day ${e.day}. Set the first snare.\` : \`Day ${e.day}. Built the ${STRUCTURES[e.structure].name}.\`;`

- [ ] **Step 4: The journal clause**

`src/sim/landing.ts`, above `land`:

```ts
/** What the last survivor's record says was built at the old camp, as a list: "a fire pit, snares and a drying rack". Empty when nothing was. */
function builtList(rec: LifeRecord): string {
  const names = rec.events.filter((e): e is LifeEvent & { kind: "built" } => e.kind === "built").map((e) => (e.structure === "snare" ? "snares" : `a ${STRUCTURES[e.structure].name}`));
  if (!names.length) return "";
  if (names.length === 1) return names[0];
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}
```

Import `STRUCTURES` from `./items` and the `LifeEvent`, `LifeRecord` types from `./types`. In `land`, build the line in two parts:

```ts
  const built = builtList(last);
  const journal = built ? ` The journal of ${fmtName(last.name)} lists ${built} at ${oldName}.` : "";
  log(
    state,
    `${fmtWorldDate(l.date)}. ${daysInWords(l.gapDays)} days after ${fmtName(last.name)} died. You land at ${regionAt(world, l.region).name} with an axe, wool on your back and a kilo of dried meat. The old camp at ${oldName} lies ${km} km ${bearing(world, l.cell, oldCamp)}.${journal}`,
  );
```

The record's events are in date order, so the list reads in the order things were built; the test's expectation follows that order (fire pit day 2, snares day 3, rack day 9).

- [ ] **Step 5: The ancestor's day**

`src/ui/panels.ts`, `tombstoneHtml`: after `<p>${esc(epitaphTail(rec))}</p>`:

```ts
${ancestorLine(state)}
```

and above the function:

```ts
/** "Veikko Urbonas lived 49 days." under the epitaph, for every survivor but the first. */
function ancestorLine(state: GameState): string {
  const prev = state.survivors[state.survivors.length - 2];
  if (!prev?.died) return "";
  return `<p class="ancestor">${esc(fmtName(prev.name))} lived ${prev.died.day} days.</p>`;
}
```

- [ ] **Step 6: Run the tests**

Run: `npx vitest run tests/landing.test.ts tests/epitaph.test.ts tests/survivor-ui.test.ts tests/record.test.ts tests/reference.test.ts`
Expected: PASS. If `tests/epitaph.test.ts` holds golden entry strings for the seeded reference runs, they now carry a "Set the first snare" line; re-read the run's actual output and update the golden string, and say in the test name that the snare line is part of it.

Run: `npm test`
Expected: green.

- [ ] **Step 7: Commit**

```bash
git add 08-survidle/src/sim/tasks.ts 08-survidle/src/sim/epitaph.ts 08-survidle/src/sim/landing.ts 08-survidle/src/ui/panels.ts 08-survidle/tests/landing.test.ts 08-survidle/tests/epitaph.test.ts
git commit -m "feat(survidle): the landing quotes the ancestor's journal for what stands at the old camp, and the tombstone names the ancestor's day"
```

---

### Task 14: Measure everything, the browser pass, and the bookkeeping

**Files:**
- Modify: `docs/superpowers/specs/2026-09-03-survidle-realism-roadmap.md` (build order; the F section's measured paragraphs; the calibration section)
- Modify: `docs/superpowers/specs/2026-09-05-survidle-year-loop-design.md` (section 3.4's correction, section 10's readings)
- Modify: `docs/README.md` (the "How it plays" bullets for camp and winter)

- [ ] **Step 1: Run every gate and keep the output**

```bash
npm test
npm run reference
npm run reference -- --heir 17 19 42 79 250
npm run year
npm run year -- --winter
npm run year -- --level=10
npm run year -- --fresh
npm run horizon
```

Expected: `npm test` green; the April gate 4 of 4 at day 26; the others are readings. Write down per script the pass count and each seed's outcome line.

- [ ] **Step 2: The browser pass**

Start the dev server from `08-survidle` (`npm run dev`), open `http://127.0.0.1:5173/prototypes/08/?seed=17&speed=200` in Chrome at 1440 by 900, then at 390 wide with touch emulation, per `docs/ux.md`. Check and note:

- a rack with the hang grind running shows "40 kg on the racks" in the Do row's detail and the camp panel;
- in December, with a hut standing, the fire reads lit under the smoke hole and the firewood keep at 400 kg is on the list (`window.survidle.advance(1440 * 240)` from April gets there);
- at an iced shore with snow, the fill keep's Doing line reads "melting snow";
- after a death and Begin again, the landing log line carries "The journal of ... lists";
- after the heir dies, the tombstone shows "... lived N days." under the epitaph.

Stop the dev server when done. Anything wrong is fixed in its task's files and committed with a `fix(survidle):` message before the bookkeeping.

- [ ] **Step 3: The roadmap and the spec**

In the roadmap's build order paragraph ("The eight sub-projects, in order"), after "then 3's siting (...; built)", insert: "then the year loop (`2026-09-05-survidle-year-loop-design.md`, plan `2026-09-05-survidle-year-loop.md`: the year script and its three gates, fish capacities from biomass, small-game inflow, the trap's rot, a 40 kg rack and a second one, decay at one and two years, large game by name at level, fuel by shelter and an indoor temperature, the winter woodpile and the melt fallback, the wet-cold need, the journal clause and the ancestor's day; built, readings under F)".

In the F section, replace the paragraph beginning "The heir gate is measured meaningfully once the tree's carry lands" with a paragraph headed "Measured with the year loop" that gives: the before readings from the spec's section 0, then per task the reading it moved (Tasks 3, 4, 8, 9, 10, 11, 12), then the final: April N of 4, heir trend N of 4 with each seed's three death days and landing months, year gate N of 4 at level 20 with each seed's death day and cause, level 10 and fresh readings, winter gate N of 4. State plainly which gates are red and what the last cause of death is; that sentence opens sub-project 2's spec.

In the year loop spec, section 3.4: replace "AUTO_EAT_ORDER is checked so raw meat is never eaten" with "AUTO_EAT_ORDER already excludes raw meat and raw fish; a test pins it (tests/species.test.ts). Seed 42's fever was not a raw-meat death." Section 10 gains a "Measured" paragraph pointing at the roadmap.

`docs/README.md`: in the Camp bullet, "drying rack (3 kg raw to 1 kg that keeps)" becomes "drying rack (40 kg of raw meat, 3 kg raw to 1 kg that keeps, two dry days or four wet; a camp can stand two)"; in the Winter bullet, add "A fire under the hut's smoke hole burns a third of what an open fire does, and the hut holds above freezing while it is lit."

- [ ] **Step 4: Lint, test, commit**

```bash
npm run lint --prefix ..   # from 08-survidle, the root biome lint
npm test
git add 08-survidle/docs/superpowers/specs/2026-09-03-survidle-realism-roadmap.md 08-survidle/docs/superpowers/specs/2026-09-05-survidle-year-loop-design.md 08-survidle/docs/README.md
git commit -m "docs(survidle): the year loop as built and measured - the three gates' readings, the heir trend per seed, and what the last death names for the tables audit"
```

If `npm run lint --prefix ..` does not resolve, run `cd .. && npm run lint && cd 08-survidle` instead.

---

## Self-review

**Spec coverage.** 1.1 to 1.5: Task 1 and Task 2. 2.1: Task 3. 2.2: Task 4. 2.3 (trap rot, snare odds unchanged, producers run): Task 5; snare odds are not touched anywhere. 2.4 tests: Tasks 3, 4, 5 carry them, except "a reference life leaves its home shore's fish density above 0.9", which follows from Task 3's capacities and is read in the year script rather than pinned, since a full reference run is too slow for `npm test`. 3.1: Task 8. 3.2: Task 6. 3.3: Task 8 (cordage 8; arrow loss untouched). 3.4: Task 8's auto-eat test and Task 14's spec correction. 4.1: Task 9. 4.2: Task 10. 4.3: Task 11. 4.4: Task 12. 5.1: falls out of Tasks 3 to 7; 5.2: Task 7; 5.3: Task 13. 6: Task 14 step 2. 7: Tasks 1 and 14. 8 and 9: nothing to build.

**Placeholders.** None: every step carries its code or its exact command.

**Type consistency.** `rackCapacity(st)` takes the region state in Tasks 6 (definition, `loadRack`, the hang check, the test); the fallback to `rackCapacity(st.racks)` is named as a single alternative to apply everywhere at once if the import cycle forces it. `burnPerHour(w, ambient, st)` in Task 9's definition, caller and tests. `wantOpen(state, want, cal)` in Task 8's definition and tests and Task 11's clause. `LARGE_GAME` lives in `species.ts` after Task 2's move; Task 1's test is updated in the same step. `trap.age` is added in Task 5 and `kitTrap`'s literal with it. `RegionState.racks` in Task 6; Task 13's test sets it beside `structures.dryingRack`.
