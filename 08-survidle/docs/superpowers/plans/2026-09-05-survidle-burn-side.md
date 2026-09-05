# The Burn Side Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The runner's working day reads the fat reserve and the larder, the gate's food clause reads the week, and both rules are measured alone and together on the April and heir gates.

**Architecture:** Two clauses in the body need the runner already has (`spentNow` in `src/sim/body.ts`), reading numbers the sim already keeps: the fat warnings' thresholds in `player.ts`, the ledger's week average, the pack and the camp pile. The gate's clause in `reference.ts` reads the checkpoint's week average it already computes. Nothing new is stored except one saved step marker on the player.

**Tech Stack:** TypeScript, Vite, vitest. Run everything from `08-survidle/`. `npm test` must stay under ten seconds.

**Spec:** `08-survidle/docs/superpowers/specs/2026-09-05-survidle-burn-side-design.md`

## Global Constraints

- The work is on `main` in the primary clone, pre-approved by the author. Stage with explicit paths under `08-survidle/`; never `git add -A`.
- `FAT_THIN` 0.75, `FAT_RIBS` 0.5, `FAT_WASTING` 0.25 as shares of `FAT_FULL`; `THIN_DAY` shares 0.8, 0.6, 0.4 in that order; `FED_DAY_SHARE` 0.5; `FOOD_CLAUSE_KCAL` stays 500.
- Log lines verbatim: "Too thin for a full day's work.", "Your ribs show; the day is shorter still.", "Wasting away, a few hours' work is all you have.", "Food for tomorrow in hand: a short day. You rest by the fire." The existing "A day's work done. You rest by the fire." is unchanged.
- Both rules apply only through the runner. Manual clicks get no need and no line.
- No em dashes and no non-typable unicode anywhere: hyphens, plain quotes, `...`.
- Comments explain, they never chronicle: no dates, no "before/after", no "now".
- Every commit: `npm test` green from `08-survidle/`, and `npx tsc --noEmit` clean. Commit messages end with the two trailer lines the session uses:
  `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>` and
  `Claude-Session: https://claude.ai/code/session_01352zAHUpQPBdTDeXJ5SWVM`.

---

### Task 1: The reserve steps

**Files:**
- Modify: `src/sim/player.ts` (the fat warnings near line 325; a constants block near `FAT_FULL`, line 96)
- Modify: `src/sim/body.ts` (`spentNow`, lines 37-60; imports)
- Modify: `src/sim/types.ts` (`Player`, after `restUntil`, line 269)
- Modify: `src/sim/newgame.ts` (the player literal near `workHours`, line 55)
- Modify: `src/sim/save.ts` (the migration block near `p.workHours ??=`, line 105)
- Test: `tests/workday.test.ts`

**Interfaces:**
- Consumes: `FAT_FULL` from `player.ts`; `today` from `ledger.ts`; `log` from `log.ts`.
- Produces: `FAT_THIN`, `FAT_RIBS`, `FAT_WASTING` (numbers) exported from `player.ts`. `THIN_DAY: { fat: number; share: number; line: string }[]`, `type DayReason = "day" | "thin" | "fed"`, and `dayHours(state: GameState, world: World): { hours: number; reason: DayReason }` exported from `body.ts`. `spentNow(state: GameState, world: World): boolean` (gains the world argument). `Player.thinStep: number`.

- [ ] **Step 1: Write the failing tests**

In `tests/workday.test.ts`, change the import block at the top to:

```ts
import { describe, expect, it } from "vitest";
import { advance } from "../src/sim/advance";
import { currentNeed, dayHours, iceHoleSite, NIGHT_SLEEP_UNDER, snaresWaiting, spentNow, THIN_DAY, WORK_HOURS_DEFAULT } from "../src/sim/body";
import { calendar, minutesUntilDawn, START_MINUTE_OF_DAY } from "../src/sim/calendar";
import { qty, removeItem } from "../src/sim/inventory";
import { today } from "../src/sim/ledger";
import { newGame } from "../src/sim/newgame";
import { addOrder } from "../src/sim/orders";
import { FAT_FULL, FAT_RIBS, FAT_THIN, FAT_WASTING } from "../src/sim/player";
import { placeAtSpot } from "../src/sim/position";
import { kitOut } from "../src/sim/reference";
import { regionState } from "../src/sim/regionstate";
import { deserialize, serialize } from "../src/sim/save";
import { beginTask, setAside, startTask } from "../src/sim/tasks";
import type { GameState } from "../src/sim/types";
import { drink, ICE_SHORE_CM, iceHoleOpen, THIRSTY_L, WATER_FULL } from "../src/sim/water";
import { stormComing, stormNow } from "../src/sim/weather";
import { regionAt, spotOf } from "../src/world/gen";
```

Replace the `felling()` helper and add `stripFood` right after it (Task 2 makes the larder shorten the day; stripping the kit keeps the ten-hour tests measuring the full day):

```ts
/** A kitted camp on seed 17 with one endless felling grind, the survivor fresh at 08:00 and its larder empty, so the day is the full working day. */
function felling() {
  const g = newGame(17);
  kitOut(g.state, g.world);
  g.state.player.energy = 100;
  stripFood(g.state);
  addOrder(g.state, g.world, { task: "chop", until: { kind: "forever" }, deliver: "camp", where: "nearest" }, "grind");
  // One minute is enough for the order to become a live intent to read needs against.
  advance(g.state, g.world, 1);
  return g;
}

/** The kit's dried meat out of the pack: tomorrow's food is not in hand, so the day is what the reserve allows. */
function stripFood(state: GameState): void {
  removeItem(state.player.pack, "driedMeat", qty(state.player.pack, "driedMeat"));
}
```

In the existing test "the marker points at the next dawn..." change `expect(spentNow(state)).toBe(false);` to `expect(spentNow(state, world)).toBe(false);`.

Replace the existing test "spentNow sets the marker once at the cap and logs once" with:

```ts
  it("spentNow sets the marker once at the cap and logs once", () => {
    const { state, world } = newGame(1);
    stripFood(state);
    today(state).workMin = state.player.workHours * 60;
    expect(spentNow(state, world)).toBe(true);
    const until = state.player.restUntil!;
    expect(until).toBe(state.minute + minutesUntilDawn(state.minute, state.startDoy));
    expect(spentNow(state, world)).toBe(true);
    expect(state.player.restUntil).toBe(until);
    expect(state.log.filter((e) => e.text === LINE).length).toBe(1);
    state.minute = until;
    expect(spentNow(state, world)).toBe(false);
    expect(state.player.restUntil).toBeUndefined();
  });
```

Add a new describe block before `describe("checking the snares", ...)`:

```ts
describe("the day shortens with the reserve", () => {
  const lines = (state: GameState, text: string) => state.log.filter((e) => e.text === text).length;

  it("the steps are the fat warnings' own thresholds", () => {
    expect([FAT_THIN, FAT_RIBS, FAT_WASTING]).toEqual([0.75, 0.5, 0.25]);
    expect(THIN_DAY.map((s) => s.fat)).toEqual([FAT_THIN, FAT_RIBS, FAT_WASTING]);
    expect(THIN_DAY.map((s) => s.share)).toEqual([0.8, 0.6, 0.4]);
  });

  it("steps down as the reserve empties, as shares of the working day, and logs each step once per crossing", () => {
    const { state, world } = newGame(1);
    stripFood(state);
    const p = state.player;
    expect(dayHours(state, world)).toEqual({ hours: 10, reason: "day" });
    p.fat = 0.7 * FAT_FULL;
    expect(dayHours(state, world)).toEqual({ hours: 8, reason: "thin" });
    expect(lines(state, THIN_DAY[0].line)).toBe(1);
    dayHours(state, world);
    expect(lines(state, THIN_DAY[0].line)).toBe(1);
    p.fat = 0.4 * FAT_FULL;
    expect(dayHours(state, world).hours).toBe(6);
    expect(lines(state, THIN_DAY[1].line)).toBe(1);
    p.fat = 0.2 * FAT_FULL;
    expect(dayHours(state, world).hours).toBe(4);
    expect(lines(state, THIN_DAY[2].line)).toBe(1);
    // Fed back past the step and thin again: the line reads once per crossing, like the warning it follows.
    p.fat = FAT_FULL;
    expect(dayHours(state, world).hours).toBe(10);
    p.fat = 0.7 * FAT_FULL;
    expect(dayHours(state, world).hours).toBe(8);
    expect(lines(state, THIN_DAY[0].line)).toBe(2);
    // A player working a twelve-hour day steps down from twelve.
    p.workHours = 12;
    expect(dayHours(state, world).hours).toBeCloseTo(9.6, 6);
  });

  it("spentNow reads the shortened day", () => {
    const { state, world } = newGame(1);
    stripFood(state);
    state.player.fat = 0.7 * FAT_FULL;
    today(state).workMin = 7 * 60;
    expect(spentNow(state, world)).toBe(false);
    today(state).workMin = 8 * 60;
    expect(spentNow(state, world)).toBe(true);
    expect(lines(state, LINE)).toBe(1);
  });

  it("the step marker is saved, and a save without it loads on a full day", () => {
    const { state, world } = newGame(1);
    stripFood(state);
    state.player.fat = 0.4 * FAT_FULL;
    dayHours(state, world);
    expect(state.player.thinStep).toBe(2);
    expect(deserialize(serialize(state))!.state.player.thinStep).toBe(2);
    const raw = JSON.parse(serialize(state));
    delete raw.state.player.thinStep;
    expect(deserialize(JSON.stringify(raw))!.state.player.thinStep).toBe(0);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/workday.test.ts`
Expected: FAIL. The new block fails on missing exports (`dayHours`, `THIN_DAY`, `FAT_THIN`); the type check reports `spentNow` taking one argument.

- [ ] **Step 3: Export the thresholds from player.ts**

Below `export const FAT_FULL = 80000;` add:

```ts
/** The fat warnings' thresholds, as shares of FAT_FULL; the working day steps down on the same three (THIN_DAY in body.ts). */
export const FAT_THIN = 0.75;
export const FAT_RIBS = 0.5;
export const FAT_WASTING = 0.25;
```

And change the three warn lines to read them:

```ts
  warn(state, "thin", p.fat < FAT_THIN * FAT_FULL, "You are getting thin.");
  warn(state, "ribs", p.fat < FAT_RIBS * FAT_FULL, "Your ribs show.");
  warn(state, "wasting", p.fat < FAT_WASTING * FAT_FULL, "You are wasting away.");
```

- [ ] **Step 4: The marker on the player**

In `src/sim/types.ts`, after `restUntil?: number;` add:

```ts
  /** The reserve step the working day is on (an index into THIN_DAY, 0 for a full day), so each step's line reads once per crossing. */
  thinStep: number;
```

In `src/sim/newgame.ts`, after `workHours: WORK_HOURS_DEFAULT,` add `thinStep: 0,`.

In `src/sim/save.ts`, after `p.workHours ??= WORK_HOURS_DEFAULT;` add `p.thinStep ??= 0;`.

- [ ] **Step 5: dayHours and spentNow in body.ts**

Change the import of `baseWalkSpeed` to `import { baseWalkSpeed, FAT_FULL, FAT_RIBS, FAT_THIN, FAT_WASTING } from "./player";`.

Replace the `WORK_HOURS_DEFAULT` constant and `spentNow` (the block from the `/** Hours of task work a day ... */` comment through the end of `spentNow`) with:

```ts
/** Hours of task work a day before the body calls it a day: a camp-builder's working day, with the evening by the fire. */
export const WORK_HOURS_DEFAULT = 10;

/**
 * The working day shrinks with the fat reserve, one step per warning the
 * body already prints, deepest last: a thin body does four fifths of a
 * day, one whose ribs show three fifths, a wasting one two fifths. Each
 * step's line reads once per crossing, the way the warning does.
 */
export const THIN_DAY: { fat: number; share: number; line: string }[] = [
  { fat: FAT_THIN, share: 0.8, line: "Too thin for a full day's work." },
  { fat: FAT_RIBS, share: 0.6, line: "Your ribs show; the day is shorter still." },
  { fat: FAT_WASTING, share: 0.4, line: "Wasting away, a few hours' work is all you have." },
];

export type DayReason = "day" | "thin" | "fed";

/**
 * The hours of work the body will do today and why: the working day, or
 * the reserve step that cut it. Read by the runner each minute, so the
 * step line logs the minute the body crosses into it while at work.
 */
export function dayHours(state: GameState, world: World): { hours: number; reason: DayReason } {
  const p = state.player;
  let step = 0;
  for (let i = 0; i < THIN_DAY.length; i++) if (p.fat < THIN_DAY[i].fat * FAT_FULL) step = i + 1;
  if (step > p.thinStep) log(state, THIN_DAY[step - 1].line);
  p.thinStep = step;
  if (step === 0) return { hours: p.workHours, reason: "day" };
  return { hours: p.workHours * THIN_DAY[step - 1].share, reason: "thin" };
}

/**
 * A day's work is done. The ledger already counts every minute awake on a
 * task other than rest, wait, night or sleep, so the runner reads the same
 * number the report prints, against the day dayHours allows. The first
 * time the count reaches it, the marker is set to the next dawn and the
 * log says so once; it holds until then and clears itself, and the day
 * roll starts the count again. The marker lives on the player, not the
 * intent, so an order switching intents in the evening does not start
 * the day over.
 */
export function spentNow(state: GameState, world: World): boolean {
  const p = state.player;
  if (p.restUntil !== undefined) {
    if (state.minute < p.restUntil) return true;
    p.restUntil = undefined;
  }
  const day = dayHours(state, world);
  if (today(state).workMin < day.hours * 60) return false;
  p.restUntil = state.minute + minutesUntilDawn(state.minute, state.startDoy);
  log(state, "A day's work done. You rest by the fire.");
  return true;
}
```

In `currentNeed`, change `const spent = spentNow(state);` to `const spent = spentNow(state, world);`. `world` is already a parameter of `currentNeed`. `World` is already imported as a type in body.ts.

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run tests/workday.test.ts && npx tsc --noEmit`
Expected: PASS, every test in the file, and tsc clean.

- [ ] **Step 7: Run the whole suite**

Run: `npm test`
Expected: green, under ten seconds.

- [ ] **Step 8: Commit**

```bash
cd /Users/janis.kirsteins/Projects/prototypes
git add 08-survidle/src/sim/player.ts 08-survidle/src/sim/body.ts 08-survidle/src/sim/types.ts 08-survidle/src/sim/newgame.ts 08-survidle/src/sim/save.ts 08-survidle/tests/workday.test.ts
git commit -m "feat(survidle): the working day steps down with the fat reserve, on the warnings the body already prints"
```

---

### Task 2: Tomorrow's food in hand

**Files:**
- Modify: `src/sim/body.ts` (`dayHours`, `spentNow`, imports)
- Test: `tests/workday.test.ts`

**Interfaces:**
- Consumes: `dayHours`, `spentNow`, `THIN_DAY` from Task 1; `AUTO_EAT_ORDER`, `FOODS` from `items.ts`; `edible` from `actions.ts`; `pile`, `qty` from `inventory.ts`; `regionState`; `weekBefore` from `ledger.ts`; `dayNumber` from `calendar.ts`; `BURN` from `tables.ts`.
- Produces: `FED_DAY_SHARE` (0.5), `FED_LINE` (string), `foodInHand(state: GameState, world: World): number`, `dayBurn(state: GameState): number`, all exported from `body.ts`. `dayHours` may now return `reason: "fed"`.

- [ ] **Step 1: Write the failing tests**

In `tests/workday.test.ts`, extend the imports: the body import becomes

```ts
import {
  currentNeed, dayBurn, dayHours, FED_DAY_SHARE, FED_LINE, foodInHand, iceHoleSite, NIGHT_SLEEP_UNDER, snaresWaiting, spentNow, THIN_DAY, WORK_HOURS_DEFAULT,
} from "../src/sim/body";
```

the inventory import becomes `import { addItem, pile, qty, removeItem } from "../src/sim/inventory";`, the ledger import becomes `import { emptyBurn, emptyYield, today } from "../src/sim/ledger";`, and add `import { BERRY, BURN } from "../src/sim/tables";` in alphabetical position (after the save import).

Add a second describe block after "the day shortens with the reserve":

```ts
describe("tomorrow's food in hand", () => {
  const lines = (state: GameState, text: string) => state.log.filter((e) => e.text === text).length;

  /** A ledger week of `burn` a day on record, the clock on the morning after it. */
  function weekOnRecord(state: GameState, burn: number): void {
    state.minute = 7 * 1440;
    for (let day = 1; day <= 7; day++) {
      state.ledger.push({ day, yield: emptyYield(), eaten: 0, burn: { ...emptyBurn(), base: burn }, sleepMin: 0, workMin: 0 });
    }
  }

  it("a half day", () => {
    expect(FED_DAY_SHARE).toBe(0.5);
  });

  it("food in hand is what the body will eat, pack and camp together: no raw meat, no berries past the day's ceiling", () => {
    const { state, world } = newGame(1);
    stripFood(state);
    const p = state.player;
    const camp = pile(state, regionState(state, world, p.region).campCell);
    expect(foodInHand(state, world)).toBe(0);
    addItem(camp, "cookedFish", 2);
    addItem(p.pack, "driedMeat", 0.4);
    expect(foodInHand(state, world)).toBeCloseTo(3400, 6);
    addItem(camp, "rawMeat", 10);
    expect(foodInHand(state, world)).toBeCloseTo(3400, 6);
    addItem(camp, "berries", 1);
    expect(foodInHand(state, world)).toBeCloseTo(3900, 6);
    p.berriesToday = { day: 1, kg: BERRY.refuseKg };
    expect(foodInHand(state, world)).toBeCloseTo(3400, 6);
  });

  it("is a half day, read against the band top before a week exists and the body's own week after", () => {
    const { state, world } = newGame(1);
    stripFood(state);
    const p = state.player;
    const camp = pile(state, regionState(state, world, p.region).campCell);
    expect(dayBurn(state)).toBe(BURN.day.hi);
    addItem(camp, "cookedFish", 3.4);
    expect(dayHours(state, world)).toEqual({ hours: 10, reason: "day" });
    addItem(camp, "cookedFish", 0.1);
    expect(dayHours(state, world)).toEqual({ hours: 5, reason: "fed" });
    // A week burning 2,700 a day lowers the bar to what this body needs.
    removeItem(camp, "cookedFish", qty(camp, "cookedFish"));
    addItem(camp, "cookedFish", 2.7);
    expect(dayHours(state, world).reason).toBe("day");
    weekOnRecord(state, 2700);
    expect(dayBurn(state)).toBeCloseTo(2700, 6);
    expect(dayHours(state, world)).toEqual({ hours: 5, reason: "fed" });
  });

  it("the arrival kit is a day's food, so the first day is a half day", () => {
    const { state, world } = newGame(1);
    expect(foodInHand(state, world)).toBeCloseTo(BURN.day.hi, 6);
    expect(dayHours(state, world)).toEqual({ hours: 5, reason: "fed" });
  });

  it("the shorter of the two applies, and the day's-work-done line says which", () => {
    const { state, world } = newGame(1);
    stripFood(state);
    const p = state.player;
    const camp = pile(state, regionState(state, world, p.region).campCell);
    addItem(camp, "cookedFish", 4);
    p.fat = 0.4 * FAT_FULL;
    expect(dayHours(state, world)).toEqual({ hours: 5, reason: "fed" });
    p.fat = 0.2 * FAT_FULL;
    expect(dayHours(state, world)).toEqual({ hours: 4, reason: "thin" });
    // Spent at four hours on the wasting day, with the plain line.
    today(state).workMin = 4 * 60;
    expect(spentNow(state, world)).toBe(true);
    expect(lines(state, LINE)).toBe(1);
    expect(lines(state, FED_LINE)).toBe(0);
    // Fresh again with fat: five hours and the fed line.
    p.restUntil = undefined;
    p.fat = FAT_FULL;
    today(state).workMin = 4 * 60;
    expect(spentNow(state, world)).toBe(false);
    today(state).workMin = 5 * 60;
    expect(spentNow(state, world)).toBe(true);
    expect(lines(state, FED_LINE)).toBe(1);
    expect(lines(state, LINE)).toBe(1);
  });

  it("a runner with the larder full rests after a half day", () => {
    const g = newGame(17);
    kitOut(g.state, g.world);
    g.state.player.energy = 100;
    addOrder(g.state, g.world, { task: "chop", until: { kind: "forever" }, deliver: "camp", where: "nearest" }, "grind");
    advance(g.state, g.world, 1);
    expect(dayHours(g.state, g.world).reason).toBe("fed");
    for (let h = 0; h < 8; h++) advance(g.state, g.world, 60);
    const day1 = g.state.ledger.find((d) => d.day === 1)!;
    expect(day1.workMin).toBeGreaterThanOrEqual(5 * 60);
    expect(day1.workMin).toBeLessThan(6 * 60);
    expect(g.state.player.restUntil).toBeDefined();
    expect(lines(g.state, FED_LINE)).toBe(1);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/workday.test.ts`
Expected: FAIL on the missing exports `FED_DAY_SHARE`, `FED_LINE`, `foodInHand`, `dayBurn`.

- [ ] **Step 3: Implement**

In `src/sim/body.ts`:

Add to the imports: `dayNumber` to the calendar import (`import { type Calendar, dayNumber, minutesUntilDawn } from "./calendar";`), `FOODS` to the items import (`import { AUTO_EAT_ORDER, type FoodId, FOODS, ITEM_KG, MAX_SNARES } from "./items";`), `weekBefore` to the ledger import (`import { today, weekBefore } from "./ledger";`), and a new line `import { BURN } from "./tables";` in alphabetical position (after `./steps`). `pile`, `qty`, `edible` and `regionState` are already imported.

After `export type DayReason = ...` add:

```ts
/** With tomorrow's food in hand, a half day: chores and the roof still get their hours, and a full larder never stalls the hut. */
export const FED_DAY_SHARE = 0.5;
export const FED_LINE = "Food for tomorrow in hand: a short day. You rest by the fire.";

/**
 * The kcal of what the body will eat on its own, in the pack and at this
 * region's camp together: the auto-eat foods that are edible right now.
 * Raw meat is never eaten unasked and berries past the day's ceiling are
 * refused, so neither counts.
 */
export function foodInHand(state: GameState, world: World): number {
  const p = state.player;
  const camp = pile(state, regionState(state, world, p.region).campCell);
  let kcal = 0;
  for (const f of AUTO_EAT_ORDER) if (edible(state, f)) kcal += (qty(p.pack, f) + qty(camp, f)) * FOODS[f].kcalPerKg;
  return kcal;
}

/** A day's burn for this body: the ledger's week before today, all five buckets; the band top while nothing is on record. */
export function dayBurn(state: GameState): number {
  const w = weekBefore(state.ledger, dayNumber(state.minute));
  if (w.days === 0) return BURN.day.hi;
  const b = w.burn;
  return b.base + b.activity + b.walk + b.cold + b.sick;
}
```

Replace `dayHours` with the version that takes the shorter of the two, the reserve naming the reason on a tie:

```ts
/**
 * The hours of work the body will do today and why: the working day, the
 * reserve step that cut it, or tomorrow's food in hand. The shorter of
 * the two cuts applies, and on a tie the reserve is the reason, since it
 * is the body and not the larder that cannot work. Read by the runner
 * each minute, so the step line logs the minute the body crosses into
 * it while at work.
 */
export function dayHours(state: GameState, world: World): { hours: number; reason: DayReason } {
  const p = state.player;
  let step = 0;
  for (let i = 0; i < THIN_DAY.length; i++) if (p.fat < THIN_DAY[i].fat * FAT_FULL) step = i + 1;
  if (step > p.thinStep) log(state, THIN_DAY[step - 1].line);
  p.thinStep = step;
  const thin = step === 0 ? p.workHours : p.workHours * THIN_DAY[step - 1].share;
  const fed = foodInHand(state, world) >= dayBurn(state) ? p.workHours * FED_DAY_SHARE : p.workHours;
  if (fed < thin) return { hours: fed, reason: "fed" };
  return { hours: thin, reason: step === 0 ? "day" : "thin" };
}
```

In `spentNow`, change the log line to read the reason:

```ts
  log(state, day.reason === "fed" ? FED_LINE : "A day's work done. You rest by the fire.");
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/workday.test.ts && npx tsc --noEmit`
Expected: PASS, and tsc clean.

- [ ] **Step 5: Run the whole suite**

Run: `npm test`
Expected: green, under ten seconds. If a test elsewhere fails because its kitted runner rests after a half day, that test relied on the ten-hour day with a stocked larder: strip the kit's dried meat there the way `stripFood` does, and say why in a comment.

- [ ] **Step 6: Commit**

```bash
cd /Users/janis.kirsteins/Projects/prototypes
git add 08-survidle/src/sim/body.ts 08-survidle/tests/workday.test.ts
git commit -m "feat(survidle): with tomorrow's food in hand the runner works a half day"
```

---

### Task 3: The food clause reads the week

**Files:**
- Modify: `src/sim/reference.ts` (`FOOD_CLAUSE_KCAL` comment line 137, `fed` line 162-165, `checkpoint` lines 353-365, imports)
- Test: `tests/reference.test.ts` (the test "the food clause wants a stomach above zero..." near line 203)

**Interfaces:**
- Consumes: `WeekAverage`, `weekBefore` from `ledger.ts`.
- Produces: `fed(week: WeekAverage): boolean` exported from `reference.ts`.

- [ ] **Step 1: Write the failing tests**

In `tests/reference.test.ts`, add `import { emptyBurn, emptyYield, weekBefore } from "../src/sim/ledger";` after the items import. Replace the test "the food clause wants a stomach above zero or half a kilo of cooked fish at camp" with two:

```ts
  it("the food clause reads the week before the checkpoint: a beginner's day of food eaten on average, whatever the stomach and the larder hold at the instant", () => {
    const week = (eaten: number, days = 7) => ({ ...weekBefore([], 1), days, eaten });
    expect(fed(week(FOOD_CLAUSE_KCAL))).toBe(true);
    expect(fed(week(FOOD_CLAUSE_KCAL - 1))).toBe(false);
    expect(fed(week(FOOD_CLAUSE_KCAL, 0))).toBe(false);
    // Seed 19's shape at day 26: stomach 0, camp 0, eating 2,971 a day - fed.
    const { state, world } = newGame(19);
    state.player.kcal = 0;
    state.minute = 25 * 1440;
    for (let day = 19; day <= 25; day++) state.ledger.push({ day, yield: emptyYield(), eaten: 2971, burn: emptyBurn(), sleepMin: 0, workMin: 0 });
    expect(campFoodKcal(state, world)).toBe(0);
    expect(fed(weekBefore(state.ledger, 26))).toBe(true);
    // A body on the fat alone with nothing eaten all week is not, whatever the stomach reads.
    for (const d of state.ledger) d.eaten = 0;
    state.player.kcal = 3000;
    expect(fed(weekBefore(state.ledger, 26))).toBe(false);
  });

  it("campFoodKcal counts every food lying at camp", () => {
    const { state, world } = newGame(17);
    const camp = pile(state, regionState(state, world, state.player.region).campCell);
    expect(campFoodKcal(state, world)).toBe(0);
    addItem(camp, "cookedFish", 0.5);
    addItem(camp, "fish", 3);
    expect(campFoodKcal(state, world)).toBe(500);
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/reference.test.ts`
Expected: FAIL: `fed` is called with one object where it expects two numbers (a type error and a wrong result).

- [ ] **Step 3: Implement**

In `src/sim/reference.ts`, `WeekAverage` and `weekBefore` are already imported from `./ledger`; no import change.

Change the constant's comment:

```ts
/** The food clause: kcal a day eaten over the week before a checkpoint that counts as a beginner's day of food, the middle of the April beginner band the gate day is derived from. */
export const FOOD_CLAUSE_KCAL = 500;
```

Replace `fed`:

```ts
/** The food clause at a checkpoint: a beginner's day of food eaten on average over the week before it, so a body in deficit that eats what it catches reads fed and one living on its fat does not. */
export function fed(week: WeekAverage): boolean {
  return week.days > 0 && week.eaten >= FOOD_CLAUSE_KCAL;
}
```

In `checkpoint`, compute the week once and pass it:

```ts
function checkpoint(state: GameState, world: World, day: number): ReferenceReport["checkpoints"][number] {
  const p = state.player;
  const camp = pile(state, regionState(state, world, p.region).campCell);
  const stocks: Record<string, number> = {};
  for (const { item, qty } of listItems(camp)) stocks[item] = Math.round(qty * 10) / 10;
  const food = campFoodKcal(state, world);
  const week = weekBefore(state.ledger, day);
  return {
    day, dayOfYear: calendar(state.minute, state.startDoy).dayOfYear, kcal: Math.round(p.kcal), water: Math.round(p.water * 10) / 10, warmth: Math.round(p.warmth), health: Math.round(p.health),
    food: Math.round(food), fed: fed(week),
    stocks, tools: p.tools.map((t) => `${TOOLS[t.id].name} ${Math.round(t.durability)}`),
    week,
  };
}
```

Update the doc comment on the `checkpoints` field of `ReferenceReport` (line 327) so "fed" is described as the week's reading: `/** Day, kcal, water, warmth, health, food, whether the week before read fed, and camp stocks at each checkpoint reached, with the week before it. */`. Also update the comment in `scripts/reference.ts`'s header and the README sentence if either says the clause is a stomach or camp snapshot: the README's development section says "alive and fed on game day 26 ... with the food clause on top"; leave it, it does not describe the snapshot.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/reference.test.ts && npx tsc --noEmit`
Expected: PASS and tsc clean.

- [ ] **Step 5: Run the whole suite and commit**

Run: `npm test`
Expected: green.

```bash
cd /Users/janis.kirsteins/Projects/prototypes
git add 08-survidle/src/sim/reference.ts 08-survidle/tests/reference.test.ts
git commit -m "fix(survidle): the gate's food clause reads the week's intake, not the stomach at an instant"
```

---

### Task 4: The four readings

**Files:**
- Create: `<sdd workspace>/readings.md` (the SDD workspace path is given in the dispatch; nothing under `docs/` is written by this task)
- Modify (temporarily, never committed): `src/sim/body.ts`

**Interfaces:**
- Consumes: `dayHours` from Task 2.
- Produces: `readings.md`, one section per reading, in the format below.

- [ ] **Step 1: Confirm the tree is clean and the tests are green**

Run: `git status --short 08-survidle` (expect nothing) and `npm test` (expect green).

- [ ] **Step 2: Reading A, the clause alone**

Edit `dayHours` in `src/sim/body.ts` so its first line is `return { hours: state.player.workHours, reason: "day" };` (both rules off). Run from `08-survidle/`:

```bash
npm run reference -- --heir > "<sdd workspace>/reading-a.txt" 2>&1; echo "exit $?" >> "<sdd workspace>/reading-a.txt"
```

- [ ] **Step 3: Reading B, the reserve rule alone**

Restore `dayHours` (`git checkout -- src/sim/body.ts`), then edit it so the `fed` line reads `const fed = p.workHours;`. Run the same command into `reading-b.txt`.

- [ ] **Step 4: Reading C, the food rule alone**

Restore, then edit so `const thin = p.workHours;` and the step loop and its log stay as they are (the marker still moves; only the hours ignore it). Run into `reading-c.txt`.

- [ ] **Step 5: Reading D, both (the committed state)**

Restore (`git checkout -- src/sim/body.ts`), confirm `git status --short 08-survidle` is empty, run into `reading-d.txt`.

- [ ] **Step 6: Write readings.md**

For each reading A to D, a section with: the pass lines (`passed N of 4`, `heir passed N of 4`); a table per seed for the first life with the day-26 checkpoint's burn/day, work (activity + walk), walk, hours at work, eaten/day, fed, and the death day and cause; the same table for the heirs at their gate checkpoint (first snow day or "none") with death day and cause; and a line naming any death on days 1 to 10. Copy numbers from the `.txt` files; do not round beyond what the report prints. End with a table of the four readings side by side: April N of 4, heir N of 4, mean gate-week work across the four seeds, mean day, and the four first-life death days.

- [ ] **Step 7: Confirm the tree is clean**

Run: `git status --short 08-survidle`. Expected: nothing. No commit in this task.

---

### Task 5: The roadmap and the decision

**Files:**
- Modify: `docs/superpowers/specs/2026-09-03-survidle-realism-roadmap.md` (the build-order paragraph under "The eight sub-projects, in order", lines 230-330; the calibration-pass section's last paragraph, near line 1443; the F row's sentence naming the burn side, near line 1998)
- Modify, only if the controller's ruling withdraws a rule: `src/sim/body.ts`, `src/sim/player.ts`, `src/sim/types.ts`, `src/sim/newgame.ts`, `src/sim/save.ts`, `tests/workday.test.ts`

**Interfaces:**
- Consumes: `readings.md` from Task 4 and the controller's ruling, both given in the dispatch.

- [ ] **Step 1: The calibration-pass paragraph**

After the paragraph that ends "or the fat's trend, not the reserve at an instant." add a paragraph headed **Measured with the burn side** that gives: what was built (the two rules and the clause, each in a sentence, with the constants), the four readings side by side (April N of 4, heir N of 4, mean gate-week work and day, death days) from `readings.md`, per-seed lines for the committed state, what the opening did (any death on days 1 to 10), and the decision the controller's ruling gives (kept, or withdrawn and why). Prose in the section's own voice: numbers, seeds, days, no dates inside the paragraph beyond the section's existing style.

- [ ] **Step 2: The build order**

In the build-order paragraph, after "(C's reading water and basket trap, then 3's turf hut, then 3's water store, ... built)," insert "then the burn side (the paragraph of that name in the calibration pass: the working day steps down with the fat reserve and halves with tomorrow's food in hand, the gate's food clause reads the week's intake; built)," before "then B the risk forecast".

- [ ] **Step 3: The F row's pointer**

Change "both named in the calibration pass above, where the burn side is now the next change." to "both named in the calibration pass above, whose burn-side paragraph carries what changed and what it read."

- [ ] **Step 4: If the ruling withdraws a rule**

Remove its constants, its clause in `dayHours`, its lines and its tests; keep the other rule whole. The roadmap paragraph from Step 1 says it was measured and why it went. Run `npm test` and `npx tsc --noEmit`.

- [ ] **Step 5: Commit**

```bash
cd /Users/janis.kirsteins/Projects/prototypes
git add 08-survidle/docs/superpowers/specs/2026-09-03-survidle-realism-roadmap.md
# plus any source or test files Step 4 touched, by explicit path
git commit -m "docs(survidle): the burn side measured - the roadmap carries the four readings and the decision"
```
