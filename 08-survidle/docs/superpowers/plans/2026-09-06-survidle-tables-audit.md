# Survidle tables audit implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move every number the survival handbooks contradict to the handbook's value, add the trap line, depleting big game, fuel and cold burn by temperature, real snow depth, the snow shelter, the quarter carry and the lineage gate, and a one-page manual; then measure the four gates and fix what the runner dies of.

**Architecture:** Constants live where they are today (`src/sim/tables.ts`, `items.ts`, `player.ts`, `fire.ts`, `weather.ts`, `water.ts`, `animals.ts`) and each moved one carries its handbook line in its comment. New rules get their own small modules (`src/sim/lean.ts`, the snow shelter inside the existing structure machinery, the carry in `skills.ts` and `landing.ts`, the manual in `src/ui/panels.ts` plus `src/sim/manual.ts`). The harness scripts (`scripts/reference.ts`, `scripts/year.ts`) grow the readings the spec asks for. Every task ends green on `npm test` and is committed on its own.

**Tech Stack:** TypeScript, Vite, vitest (`npm test`), vite-node scripts (`npm run reference`, `npm run year`, `npm run horizon`). Biome lint from the repo root (`npm run lint`).

**Spec:** `08-survidle/docs/superpowers/specs/2026-09-06-survidle-tables-audit-design.md`

## Global Constraints

- Work in `08-survidle/` of the worktree on branch `worktree-tables-audit`; stage with explicit paths, never `git add -A`.
- Every quantity stays real (kcal, kg, C, cm, minutes); a corrected number is never bent back to pass a gate. Every constant this plan moves gets the handbook's line in the comment beside it.
- No em dashes or non-typable characters in code, comments, docs or log lines. Log lines use the voice templates (`{You} {have}`), never a bare "You".
- Runner deaths are fixed, realism deaths are discussed (spec section 10): a gate seed that dies of something a player would have avoided by hand gets a runner or list change in the same task, recorded with the death; only a death the corrected numbers make unavoidable is reported and left.
- `npm test` must be green before every commit; the pre-commit hook runs biome and `tsc --noEmit`.
- Commit messages: `type(survidle): what changed, in the house's declarative style`, ending with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>` and `Claude-Session: https://claude.ai/code/session_01352zAHUpQPBdTDeXJ5SWVM`.
- Run the harness from `08-survidle/` with the scripts in `package.json`; `npm run year` takes a few minutes and `npm run reference -- --heir` with six lives longer, so run them in the background with output to a file.

---

### Task 1: The bands and the gate day

**Files:**
- Modify: `src/sim/tables.ts:95-116` (the `BURN` block)
- Modify: `src/sim/reference.ts` (`weekLines`, the cold verdict)
- Modify: `tests/tables.test.ts`, `tests/reference.test.ts:220-232`
- Modify: `docs/superpowers/specs/2026-09-06-survidle-tables-audit-design.md` section 1.1 (the work band's arithmetic)

**Interfaces:**
- Produces: `BURN.day = band(3000, 4500)`, `BURN.work = band(1200, 2600)`, `BURN.coldWarm = band(100, 300)`, `BURN.coldWinter = band(1000, 2000)`, `BURN.deepCold = band(4500, 6000)`; `export const WINTER_FROM_DOY = 334`, `export const WINTER_TO_DOY = 59`; `export function isWinterDoy(dayOfYear: number): boolean`; `export function coldBand(dayOfYear: number): Band`. `BURN.cold` is removed. `REFERENCE_TARGET_DAY` re-derives to 20 on its own.

- [ ] **Step 1: Write the failing tests**

In `tests/tables.test.ts`, replace the "burn shares add up" test and add the winter band test:

```ts
  it("the burn shares add up to the day band, with the warm cold share", () => {
    expect(BURN.base.lo + BURN.work.lo + BURN.coldWarm.lo).toBeGreaterThanOrEqual(BURN.day.lo - 100);
    expect(BURN.base.hi + BURN.work.hi + BURN.coldWarm.hi).toBeLessThanOrEqual(BURN.day.hi + 300);
    expect(SLEEP_HOURS).toEqual({ lo: 7, hi: 9 });
  });

  it("the day band is the handbook's settled day to its camp-building day, and the cold share is a winter band inside December to February", () => {
    expect(BURN.day).toEqual({ lo: 3000, hi: 4500 });
    expect(BURN.deepCold).toEqual({ lo: 4500, hi: 6000 });
    expect(coldBand(90)).toEqual(BURN.coldWarm);
    expect(coldBand(334)).toEqual(BURN.coldWinter);
    expect(coldBand(10)).toEqual(BURN.coldWinter);
    expect(coldBand(59)).toEqual(BURN.coldWarm);
    expect(isWinterDoy(333)).toBe(false);
    expect(isWinterDoy(58)).toBe(true);
  });
```

Add `coldBand, isWinterDoy` to the tables import. In `tests/reference.test.ts` change `expect(REFERENCE_TARGET_DAY).toBe(26);` to `expect(REFERENCE_TARGET_DAY).toBe(20);` (the formula test above it stays as it is, since it reads the constants). Note: the 20 holds only after Task 4 sets dried meat to 3,300; until then the derivation reads floor(88,500 / 4,300) = 20 as well, so the test passes from this task on.

- [ ] **Step 2: Run the tests to see them fail**

Run: `npx vitest run tests/tables.test.ts tests/reference.test.ts`
Expected: FAIL on `coldBand` undefined and the day band.

- [ ] **Step 3: Move the bands**

In `src/sim/tables.ts` replace the `BURN` block:

```ts
/**
 * A day's burn living outside in the cold, and its shares. The day band is
 * the Swedish army handbook's energy table (Handbok Överlevnad, 1988):
 * a settled survival day 3,000 kcal, a camp-building day 4,500, hard
 * work 4,400; base is the resting burn of a fit 72 kg adult; work is the
 * ledger's activity and walk together, the day less base and a little
 * cold; the cold share is small outside winter and a band of its own in
 * December to February. deepCold is the same table's week at -30 to -40
 * C, 6,000 a day: printed as a verdict on winter month lines, gating nothing.
 */
export const BURN = {
  day: band(3000, 4500),
  base: band(1600, 1800),
  coldWarm: band(100, 300),
  coldWinter: band(1000, 2000),
  work: band(1200, 2600),
  deepCold: band(4500, 6000),
};

/** 1 December and 1 March, day of year 0-based: the winter the cold band reads. */
export const WINTER_FROM_DOY = 334;
export const WINTER_TO_DOY = 59;

export function isWinterDoy(dayOfYear: number): boolean {
  return dayOfYear >= WINTER_FROM_DOY || dayOfYear < WINTER_TO_DOY;
}

/** The cold share's band for a week ending on this day of year. */
export function coldBand(dayOfYear: number): Band {
  return isWinterDoy(dayOfYear) ? BURN.coldWinter : BURN.coldWarm;
}
```

In `src/sim/reference.ts`, `weekLines`: import `coldBand` beside `BURN` and change the cold verdict from `verdict(b.cold, BURN.cold)` to `verdict(b.cold, coldBand(dayOfYear))`. Grep the tree for any other `BURN.cold` (`grep -rn "BURN.cold" src tests scripts`) and change each to `coldBand(...)` with the day of year at hand, or `BURN.coldWarm` where none is.

In the spec, section 1.1, change the work line to: "`BURN.work` becomes `band(1200, 2600)`: the day band less base and the warm cold share, so the shares still add up to the day." (The spec said 1,300 to 2,800, which over-fills the day band's top.)

- [ ] **Step 4: Run the tests**

Run: `npm test`
Expected: PASS. If `tests/ledger.test.ts` or a snapshot reads the cold verdict word, update it to the new band's reading.

- [ ] **Step 5: Commit**

```bash
git add src/sim/tables.ts src/sim/reference.ts tests/tables.test.ts tests/reference.test.ts docs/superpowers/specs/2026-09-06-survidle-tables-audit-design.md
git commit -m "feat(survidle): the burn band is the handbook's - 3,000 to 4,500 a day, a winter cold share, a deep-cold check row, and the April gate re-derives to day 20"
```

---

### Task 2: The body's rates

**Files:**
- Modify: `src/sim/player.ts:164-175` (`baseWalkSpeed`), `:182-200` (the rates), `:266-276` (the burn and cold lines in `stepPlayer`)
- Modify: `src/sim/water.ts:25-33` (`waterLossPerHour`)
- Modify: `tests/player.test.ts`, `tests/ledger.test.ts:10,152`, `tests/water.test.ts`
- Test: `tests/player.test.ts`

**Interfaces:**
- Produces: `KCAL_PER_HOUR.heavy = 500`; `export const LOAD_KCAL_PER_HOUR = { comfortable: 150, hard: 300 }`; `export function coldBurnFactor(felt: number): number`; `export const NIGHT_WALK_FACTOR = 1 / 3`. `COLD_BURN_FACTOR` is removed.

- [ ] **Step 1: Write the failing tests**

Append to `tests/player.test.ts`:

```ts
import { coldBurnFactor, KCAL_PER_HOUR_FOR_TEST, LOAD_KCAL_PER_HOUR, NIGHT_WALK_FACTOR, baseWalkSpeed } from "../src/sim/player";

describe("the body's rates read the handbooks", () => {
  it("the cold burn grows with the felt cold: 1 at zero, 1.3 at -15, 1.6 at -30, capped at 2", () => {
    expect(coldBurnFactor(5)).toBe(1);
    expect(coldBurnFactor(0)).toBe(1);
    expect(coldBurnFactor(-15)).toBeCloseTo(1.3, 6);
    expect(coldBurnFactor(-30)).toBeCloseTo(1.6, 6);
    expect(coldBurnFactor(-50)).toBe(2);
    expect(coldBurnFactor(-80)).toBe(2);
  });

  it("heavy work is 500 kcal an hour and a loaded walk pays 150 over the comfortable limit and 300 over the hard one", () => {
    expect(KCAL_PER_HOUR_FOR_TEST.heavy).toBe(500);
    expect(LOAD_KCAL_PER_HOUR).toEqual({ comfortable: 150, hard: 300 });
  });

  it("the dark without a torch is a third of day speed", () => {
    const { state, world } = newGame(17);
    const night = calendar(14 * 60);
    expect(night.isNight).toBe(true);
    const day = calendar(4 * 60);
    expect(day.isNight).toBe(false);
    expect(NIGHT_WALK_FACTOR).toBeCloseTo(1 / 3, 6);
    expect(baseWalkSpeed(state, night, state.weather) / baseWalkSpeed(state, day, state.weather)).toBeCloseTo(1 / 3, 6);
    state.player.torch = { lit: true, minutes: 30 };
    expect(baseWalkSpeed(state, night, state.weather)).toBeCloseTo(baseWalkSpeed(state, day, state.weather), 6);
  });
});
```

(`calendar(14 * 60)` is 22:00 on 1 April, night at 62 N; `calendar(4 * 60)` is noon. `newGame` and `calendar` are already imported in that file; add them if not.) Export the rates table for the test: in `player.ts` add `export const KCAL_PER_HOUR_FOR_TEST = KCAL_PER_HOUR;` right under the table.

Append to `tests/water.test.ts`:

```ts
  it("a warm room costs no extra water at rest; work in it does, and cold dry air does whatever you do", () => {
    const { state, world } = newGame(17);
    state.task = null;
    const rest = waterLossPerHour(state, 25);
    expect(rest).toBeCloseTo(0.1, 6);
    expect(waterLossPerHour(state, -15)).toBeCloseTo(0.13, 6);
    startTask(state, world, calendar(0), "sticks");
    expect(waterLossPerHour(state, 25)).toBeCloseTo(0.15 * 1.3, 6);
  });
```

(`waterLossPerHour`, `newGame`, `startTask`, `calendar` imported as the file already does; add what is missing.)

- [ ] **Step 2: Run the tests to see them fail**

Run: `npx vitest run tests/player.test.ts tests/water.test.ts`
Expected: FAIL on the missing exports and the old factors.

- [ ] **Step 3: Implement**

In `src/sim/player.ts`:

```ts
/**
 * Flat kcal/h for activities that do not depend on the ground. Heavy is axe
 * work by the MET tables (6 to 7 MET at 72 kg), under the Swedish
 * handbook's 700 for a hard march or heavy work.
 */
const KCAL_PER_HOUR: Record<Exclude<Activity, "walk">, number> = { sleep: 70, rest: 100, light: 200, heavy: 500 };
export const KCAL_PER_HOUR_FOR_TEST = KCAL_PER_HOUR;
/**
 * What a load adds to an hour's walking: the Swedish handbook's 545 kcal/h
 * at 4 km/h with 27 kg against 240 unloaded, so 300 over the hard limit
 * and half that over the comfortable one.
 */
export const LOAD_KCAL_PER_HOUR = { comfortable: 150, hard: 300 } as const;
/**
 * Burn under a felt temperature below zero, as a multiple of the burn
 * before it: 2 percent a degree, capped at double. 1.3 at -15, where the
 * flat factor used to sit; 1.6 at -30, which with a working day reads the
 * handbook's 6,000 kcal for a week at -30 to -40 C.
 */
export function coldBurnFactor(felt: number): number {
  return Math.min(2, 1 + 0.02 * Math.max(0, -felt));
}
/** Walking in the dark with no torch: the Swedish handbook's 1 km/h in terrain against 3 by day. */
export const NIGHT_WALK_FACTOR = 1 / 3;
```

Delete `COLD_BURN_FACTOR`. In `baseWalkSpeed` change `v *= 0.75` to `v *= NIGHT_WALK_FACTOR`. In `stepPlayer` change the load line to:

```ts
    if (carried(p) > d.packHardKg) burn += LOAD_KCAL_PER_HOUR.hard;
    else if (carried(p) > d.packComfortableKg) burn += LOAD_KCAL_PER_HOUR.comfortable;
```

and the cold line to `const afterCold = burn * coldBurnFactor(felt);`.

In `tests/ledger.test.ts` replace the `COLD_BURN_FACTOR` import with `coldBurnFactor, feltTemperature` and the assertion at line 152 with `expect(b.cold).toBeCloseTo(400 * (coldBurnFactor(feltTemperature(state, world, ambient)) - 1), 6);` where `ambient` is the ambient that test steps the player with (read the test; it passes an ambient to `stepPlayer`). If the test's felt is above zero the expected cold is 0, and the test should say so.

In `src/sim/water.ts`:

```ts
  // Cold dry air takes water from the breath whatever you do; a warm room
  // costs nothing at rest and 30 percent more at work. The Swedish handbook's
  // floor is 1.5 L a day lying still, whatever the room.
  const working = a === "light" || a === "walk" || a === "heavy";
  if (felt < -10 || (felt > 20 && working)) l *= 1.3;
```

- [ ] **Step 4: Run the tests**

Run: `npm test`
Expected: PASS. `tests/needs.test.ts`, `tests/workday.test.ts` or `tests/intent.test.ts` may pin a walk's minutes at night or a heavy task's burn; update those numbers to the new rates with a comment naming the handbook line.

- [ ] **Step 5: Commit**

```bash
git add src/sim/player.ts src/sim/water.ts tests/player.test.ts tests/ledger.test.ts tests/water.test.ts tests/needs.test.ts tests/workday.test.ts tests/intent.test.ts
git commit -m "feat(survidle): the body's rates read the handbooks - heavy work 500, a loaded walk 150 and 300 more, the cold burn growing with the felt cold, the dark a third of day speed, and a warm room costing water only at work"
```

---

### Task 3: The bough bed and keeps on structures

**Files:**
- Modify: `src/sim/items.ts:141` (`BOUGH_BED_DAYS`)
- Modify: `src/sim/ladder.ts:31-38` (`normalizeOrder`)
- Modify: `src/sim/orders.ts:58-112` (`keepTarget`, `orderMet`, `orderSentence`)
- Modify: `src/sim/reference.ts:159-220` (`REFERENCE_ORDERS`)
- Test: `tests/orders.test.ts`, `tests/bedding.test.ts`, `tests/list.test.ts`

**Interfaces:**
- Produces: `export function structureKeep(req: IntentRequest, kind: OrderKind): boolean` in `ladder.ts` (true for a keep whose task is `build`); a keep `keep("build", 1, "boughBed")` reads met while the bed stands; a keep `keep("build", N, "snare")` reads met at N snares live and N/2 idle (Task 5 gives the list its snare keeps).

- [ ] **Step 1: Write the failing tests**

In `tests/bedding.test.ts`, find the test that pins the bed going flat after a fortnight and change it to four days (`BOUGH_BED_DAYS` is 4: advance 4 days at camp with the bed laid and expect `structures.boughBed` false and the log line "gone flat"). Add to `tests/orders.test.ts`:

```ts
describe("a keep on a structure", () => {
  it("stays a keep, holds no stock, and reads met while the structure stands", () => {
    const { state, world } = newGame(17);
    const st = regionState(state, world, state.player.region);
    const n = normalizeOrder({ task: "build", arg: "boughBed", until: { kind: "campHas", qty: 1 }, deliver: "camp", where: "nearest" }, "keep");
    expect(n.kind).toBe("keep");
    expect(n.req.until).toEqual({ kind: "campHas", qty: 1 });
    const o = addOrder(state, world, n.req, n.kind);
    expect(keepTarget(o)).toBeNull();
    expect(orderMet(state, world, o, false)).toBe(false);
    st.structures.boughBed = true;
    expect(orderMet(state, world, o, true)).toBe(true);
    st.structures.boughBed = false;
    expect(orderMet(state, world, o, true)).toBe(false);
    expect(orderSentence(state, world, calendar(0), o)).toContain("keep the bough bed laid");
  });

  it("a keep on snares reads met at its count live and at half idle", () => {
    const { state, world } = newGame(17);
    const st = regionState(state, world, state.player.region);
    const o = addOrder(state, world, { task: "build", arg: "snare", until: { kind: "campHas", qty: 20 }, deliver: "camp", where: "nearest" }, "keep");
    expect(o.kind).toBe("keep");
    st.structures.snares = 10;
    expect(orderMet(state, world, o, false)).toBe(true);
    expect(orderMet(state, world, o, true)).toBe(false);
    st.structures.snares = 20;
    expect(orderMet(state, world, o, true)).toBe(true);
    expect(orderSentence(state, world, calendar(0), o)).toContain("keep 20 snares set");
  });
});
```

Add the imports the file lacks (`normalizeOrder` from `../src/sim/ladder`, `addOrder, keepTarget, orderMet, orderSentence` from `../src/sim/orders`, `regionState`, `calendar`, `newGame`). In `tests/list.test.ts` add:

```ts
  it("keeps the bough bed laid right after the lean-to", () => {
    const tasks = REFERENCE_ORDERS.map(key);
    expect(tasks.indexOf("build:boughBed:keep")).toBe(tasks.indexOf("build:leanTo:job") + 1);
  });
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `npx vitest run tests/orders.test.ts tests/bedding.test.ts tests/list.test.ts`
Expected: FAIL (the keep collapses to a once job today; the bed lasts 14 days).

- [ ] **Step 3: Implement**

`src/sim/items.ts`: `/** Days a bough bed stays springy before it has to be laid again: Kochanski, a fresh layer every three or four days. */ export const BOUGH_BED_DAYS = 4;`

`src/sim/ladder.ts`:

```ts
/** A keep whose promise is a structure standing or a count of snares set, not a stock at camp. */
export function structureKeep(req: IntentRequest, kind: OrderKind): boolean {
  return kind === "keep" && req.task === "build";
}

export function normalizeOrder(req: IntentRequest, kind: OrderKind): { req: IntentRequest; kind: OrderKind } {
  const lightKeep = kind === "keep" && (req.task === "light" || req.task === "lightIndoors");
  if ((kind === "keep" || req.until.kind === "campHas") && !yieldItem(req.task, req.arg) && !lightKeep && !structureKeep(req, kind)) {
    return { req: { ...req, until: { kind: "once" } }, kind: "job" };
  }
  if (kind === "grind") return { req: { ...req, until: { kind: "forever" } }, kind: "grind" };
  return { req, kind };
}
```

`src/sim/orders.ts`: `keepTarget` returns null when `structureKeep(o.req, o.kind)`; in `orderMet`, before the `if (o.kind === "grind")` line:

```ts
  if (structureKeep(o.req, o.kind)) {
    if (o.req.arg === "snare") {
      const want = o.req.until.kind === "campHas" ? o.req.until.qty : 1;
      return live ? st.structures.snares >= want : st.structures.snares >= want / 2;
    }
    return st.structures[o.req.arg as Exclude<StructureId, "snare" | "seep">] === true;
  }
```

In `orderSentence`, after the `if (keep)` branch: `else if (structureKeep(o.req, o.kind)) parts.push(o.req.arg === "snare" ? \`keep ${u.kind === "campHas" ? u.qty : 1} snares set\` : \`keep the ${STRUCTURES[o.req.arg as StructureId].name} laid\`);` (import `STRUCTURES` from `./items`). The intent that serves such a keep is unchanged: `startIntent` already turns a `campHas` with no yield item into a `once`, so the runner lays the bed or sets one snare, ends, and the scheduler serves the keep again while `orderMet` reads false.

`src/sim/reference.ts`: after `job("build", { kind: "once" }, "leanTo"),` insert `keep("build", 1, "boughBed"),`. The `keep` helper builds `until: { kind: "campHas", qty }`, which is what the keep reads.

- [ ] **Step 4: Run the tests**

Run: `npm test`
Expected: PASS. The reference opening snapshots in `tests/reference.test.ts` and `tests/horizon.test.ts` read the list; if a pinned order count or rank moves by one, update it with a comment naming the bed keep.

- [ ] **Step 5: Commit**

```bash
git add src/sim/items.ts src/sim/ladder.ts src/sim/orders.ts src/sim/reference.ts tests/orders.test.ts tests/bedding.test.ts tests/list.test.ts tests/reference.test.ts tests/horizon.test.ts
git commit -m "feat(survidle): a bough bed lasts four days and a keep can stand on a structure - the bed laid again and snares kept at a count, without collapsing to a once job"
```

---

### Task 4: Food - meat, berries, the lean ceiling, meat that freezes at -10

**Files:**
- Modify: `src/sim/items.ts:33-40` (`FOODS`), `:49-51` (beside `SPOIL_HOURS`)
- Modify: `src/sim/tables.ts:110-118` (`BERRY`)
- Create: `src/sim/lean.ts`
- Modify: `src/sim/actions.ts:21-68` (`edible`, `eat`)
- Modify: `src/sim/inventory.ts:186-204` (`ageStacks`)
- Modify: `src/sim/types.ts:288-289` (`Player`), `src/sim/newgame.ts:60`, `src/sim/save.ts:130`
- Test: `tests/lean.test.ts` (new), `tests/tables.test.ts`, `tests/inventory.test.ts`

**Interfaces:**
- Produces: `FOODS.rawMeat.kcalPerKg = 1100`, `cookedMeat 1100`, `driedMeat 3300`, `berries 450`; `BERRY.fullCreditKg = 1.2`, `BERRY.refuseKg = 2`; `export const LEAN_KCAL_PER_DAY = 1600` and `export const LEAN_FOODS: ReadonlySet<FoodId>` in `items.ts`; `export const FREEZE_KEEP_C = -10` in `items.ts`; `Player.leanToday: { day: number; kcal: number }`; in `lean.ts`: `leanEatenToday(p, minute)`, `leanRefused(p, minute)`, `creditLean(p, minute, kcal): number` (returns the kcal the body takes); `ageStacks(inv, dt, ambient)` ages at half rate from 0 to -10 C and not under it.

- [ ] **Step 1: Write the failing tests**

Create `tests/lean.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { Rng } from "../src/rng";
import { autoEat, eat, edible } from "../src/sim/actions";
import { addItem } from "../src/sim/inventory";
import { FOODS, LEAN_KCAL_PER_DAY, LEAN_FOODS } from "../src/sim/items";
import { newGame } from "../src/sim/newgame";
import { leanEatenToday } from "../src/sim/lean";

describe("the lean ceiling", () => {
  it("meat and fish are lean, fat and berries are not, and the numbers are the handbooks'", () => {
    expect([...LEAN_FOODS].sort()).toEqual(["cookedFish", "cookedMeat", "driedMeat", "rawMeat"]);
    expect(LEAN_KCAL_PER_DAY).toBe(1600);
    expect(FOODS.rawMeat.kcalPerKg).toBe(1100);
    expect(FOODS.cookedMeat.kcalPerKg).toBe(1100);
    expect(FOODS.driedMeat.kcalPerKg).toBe(3300);
    expect(FOODS.berries.kcalPerKg).toBe(450);
  });

  it("past 1,600 kcal of lean food in a day, meat is refused, fat is still eaten, and the day roll clears it", () => {
    const { state, world } = newGame(17);
    const p = state.player;
    p.kcal = 100;
    addItem(p.pack, "cookedMeat", 5);
    addItem(p.pack, "fat", 1);
    const rng = new Rng(1);
    let ate = 0;
    while (edible(state, "cookedMeat") && ate < 40) {
      expect(eat(state, world, "cookedMeat", rng)).toBe(true);
      ate++;
    }
    expect(leanEatenToday(p, state.minute)).toBeCloseTo(LEAN_KCAL_PER_DAY, 0);
    expect(edible(state, "cookedMeat")).toBe(false);
    expect(eat(state, world, "cookedMeat", rng)).toBe(false);
    expect(state.log.some((l) => l.text.includes("Lean meat is not filling"))).toBe(true);
    expect(edible(state, "fat")).toBe(true);
    expect(eat(state, world, "fat", rng)).toBe(true);
    p.kcal = 100;
    autoEat(state, world, rng);
    expect(p.kcal).toBeGreaterThan(100);
    state.minute += 1440;
    expect(leanEatenToday(p, state.minute)).toBe(0);
    expect(edible(state, "cookedMeat")).toBe(true);
  });

  it("the last portion over the line credits only the room left", () => {
    const { state, world } = newGame(17);
    const p = state.player;
    p.kcal = 100;
    p.leanToday = { day: 1, kcal: LEAN_KCAL_PER_DAY - 100 };
    addItem(p.pack, "cookedMeat", 1);
    const before = p.kcal;
    eat(state, world, "cookedMeat", new Rng(1));
    expect(p.kcal - before).toBeCloseTo(100, 6);
  });
});
```

In `tests/tables.test.ts` change the berry test to `expect(BERRY.fullCreditKg).toBe(1.2); expect(BERRY.refuseKg).toBe(2);` beside the in-band check (450 sits in 400 to 600). Find the berry gut tests (`grep -rn "refuseKg\|fullCreditKg\|cannot face another berry" tests`) and move their kilos from 2 and 4 to 1.2 and 2.

Append to `tests/inventory.test.ts`:

```ts
  it("meat ages fully above zero, at half between 0 and -10, and not at all under -10", () => {
    const inv = emptyInventory();
    addItem(inv, "rawMeat", 1);
    ageStacks(inv, 600, 5);
    expect(inv.stacks.rawMeat![0].age).toBe(600);
    ageStacks(inv, 600, -5);
    expect(inv.stacks.rawMeat![0].age).toBe(900);
    ageStacks(inv, 600, -12);
    expect(inv.stacks.rawMeat![0].age).toBe(900);
    ageStacks(inv, 600, 0);
    expect(inv.stacks.rawMeat![0].age).toBe(1200);
  });
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `npx vitest run tests/lean.test.ts tests/tables.test.ts tests/inventory.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

`src/sim/items.ts`:

```ts
/**
 * Lean wild meat: a kill's fat is its own item at 9,000, so the meat is
 * hare at about 1,000 kcal/kg (Kochanski) and venison at 1,100 to 1,200;
 * dried meat is three kilos to one, so 3,300 conserves the rack's kcal.
 * Berries are wild bilberry, 400 to 600 a kilo, at 450.
 */
export const FOODS: Record<FoodId, { kcalPerKg: number; portionKg: number; sickChance: number }> = {
  rawMeat: { kcalPerKg: 1100, portionKg: 0.3, sickChance: 0.25 },
  cookedMeat: { kcalPerKg: 1100, portionKg: 0.3, sickChance: 0 },
  driedMeat: { kcalPerKg: 3300, portionKg: 0.15, sickChance: 0 },
  cookedFish: { kcalPerKg: 1000, portionKg: 0.3, sickChance: 0 },
  berries: { kcalPerKg: 450, portionKg: 0.2, sickChance: 0 },
  fat: { kcalPerKg: 9000, portionKg: 0.1, sickChance: 0 },
};
/**
 * The lean ceiling: Kochanski's rabbit starvation - on hare alone a body
 * shows starvation within a week however much it eats. Meat and fish past
 * this many kcal in a day feed nothing; about 1.5 kg of lean meat, the most
 * the body turns to energy before the protein goes to waste. Fat and
 * berries are never capped.
 */
export const LEAN_KCAL_PER_DAY = 1600;
export const LEAN_FOODS: ReadonlySet<FoodId> = new Set<FoodId>(["rawMeat", "cookedMeat", "driedMeat", "cookedFish"]);
/** Below this ambient a stack keeps: the Swedish handbook's freezing storage wants at least -10 to -15 C; between it and zero the rot runs at half speed. */
export const FREEZE_KEEP_C = -10;
```

`src/sim/tables.ts` `BERRY`: `fullCreditKg: 1.2, refuseKg: 2` with the comment "the Swedish handbook's not over two litres of berries a day, about 1.2 kg, past which the gut turns".

Create `src/sim/lean.ts`:

```ts
/**
 * The lean ceiling (tables audit spec, section 3): meat and fish past
 * LEAN_KCAL_PER_DAY in a day feed nothing, the shape the berry gut rule
 * already has. The counter lives on the player and resets with the day.
 */
import { dayNumber } from "./calendar";
import { LEAN_KCAL_PER_DAY } from "./items";
import type { Player } from "./types";

export function leanEatenToday(p: Player, minute: number): number {
  return p.leanToday.day === dayNumber(minute) ? p.leanToday.kcal : 0;
}

export function leanRefused(p: Player, minute: number): boolean {
  return leanEatenToday(p, minute) >= LEAN_KCAL_PER_DAY - 1e-9;
}

/** Books lean kcal against today's ceiling and returns what the body takes of it. */
export function creditLean(p: Player, minute: number, kcal: number): number {
  const day = dayNumber(minute);
  if (p.leanToday.day !== day) p.leanToday = { day, kcal: 0 };
  const room = Math.max(0, LEAN_KCAL_PER_DAY - p.leanToday.kcal);
  const taken = Math.min(kcal, room);
  p.leanToday.kcal += taken;
  return taken;
}
```

`src/sim/types.ts` `Player`: add `/** Lean kcal eaten today, for the ceiling meat and fish feed nothing past. */ leanToday: { day: number; kcal: number };`. `newgame.ts`: `leanToday: { day: 1, kcal: 0 },`. `save.ts` beside the berries default: `p.leanToday ??= { day: 0, kcal: 0 };`.

`src/sim/actions.ts`:

```ts
/** A food the body will take right now: berries and lean foods each past their day's ceiling are refused. */
export function edible(state: GameState, food: FoodId): boolean {
  if (food === "berries") return !berriesRefused(state.player, state.minute);
  if (LEAN_FOODS.has(food)) return !leanRefused(state.player, state.minute);
  return true;
}
```

and in `eat`, after the berries block and before `let left = kg;`:

```ts
  if (LEAN_FOODS.has(food)) {
    const wasRefused = leanRefused(p, state.minute);
    gain = creditLean(p, state.minute, gain);
    if (!wasRefused && leanRefused(p, state.minute)) log(state, "Lean meat is not filling {you}. {You} {need} fat.", "bad");
  }
```

Import `LEAN_FOODS` from `./items` and `creditLean, leanRefused` from `./lean`. The portion is still removed from the inventory (the meat is eaten; the protein is wasted), and `creditEaten` books the credited gain.

`src/sim/inventory.ts` `ageStacks`:

```ts
export function ageStacks(inv: Inventory, dt: number, ambient: number): Partial<Record<PerishableId, number>> {
  const lost: Partial<Record<PerishableId, number>> = {};
  // Frozen keeps; the cool tier between zero and the freeze rots at half speed.
  const rate = ambient < FREEZE_KEEP_C ? 0 : ambient <= 0 ? 0.5 : 1;
  if (rate === 0) return lost;
  for (const p of PERISHABLES) {
    const stacks = inv.stacks[p];
    if (!stacks?.length) continue;
    const limit = SPOIL_HOURS[p] * 60;
    for (const s of stacks) s.age += dt * rate;
    ...
```

(the rest unchanged; import `FREEZE_KEEP_C` from `./items`).

- [ ] **Step 4: Run the tests**

Run: `npm test`
Expected: PASS. Tests that pin a meal's kcal (`tests/fat.test.ts`, `tests/needs.test.ts`, `tests/epitaph.test.ts` food lines, `tests/reference.test.ts` derivation) move with the new kcal; each moved number gets the handbook line in a comment. The gate test's 20 now reads floor(88,300 / 4,300) = 20.

- [ ] **Step 5: Commit**

```bash
git add src/sim/items.ts src/sim/tables.ts src/sim/lean.ts src/sim/actions.ts src/sim/inventory.ts src/sim/types.ts src/sim/newgame.ts src/sim/save.ts tests/lean.test.ts tests/tables.test.ts tests/inventory.test.ts tests/fat.test.ts tests/needs.test.ts tests/epitaph.test.ts tests/reference.test.ts
git commit -m "feat(survidle): food reads the handbooks - lean meat at 1,100, berries at 450 with a two-litre day, a lean ceiling meat and fish feed nothing past, and meat that keeps only under -10 C"
```

---

### Task 5: Snares as a trap line

**Files:**
- Modify: `src/sim/items.ts:139` (`MAX_SNARES`, new `SNARE_ODDS_PER_NIGHT`)
- Modify: `src/sim/camp.ts:171-179` (`dailyCamp`)
- Modify: `src/sim/tasks.ts:553` (the refusal text)
- Modify: `src/sim/reference.ts` (`REFERENCE_ORDERS`)
- Test: `tests/camp.test.ts`, `tests/list.test.ts`

**Interfaces:**
- Produces: `MAX_SNARES = 40`; `export const SNARE_ODDS_PER_NIGHT = 0.04`; the list has `keep("build", 20, "snare")` after `keep("berries", 2)` and `keep("build", 40, "snare")` after `job("build", once, "waterStore")`.

- [ ] **Step 1: Write the failing tests**

Append to `tests/camp.test.ts` (it already imports `newGame`, `regionState`, `advance`; add `MAX_SNARES, SNARE_ODDS_PER_NIGHT` from items and `check` from tasks if missing):

```ts
describe("the trap line", () => {
  it("forty snares stand per region at 0.04 a night each, and the forty-first is refused", () => {
    expect(MAX_SNARES).toBe(40);
    expect(SNARE_ODDS_PER_NIGHT).toBe(0.04);
    const { state, world } = newGame(17);
    const st = regionState(state, world, state.player.region);
    st.structures.snares = 40;
    addItem(state.player.pack, "snare", 1);
    const o = check(state, world, calendar(0), "build", "snare");
    expect(o.ok).toBe(false);
    expect(o.why).toBe("40 snares is enough here");
  });

  it("forty snares at full hare density catch about a hare and a half a night", () => {
    const { state, world } = newGame(17);
    const st = regionState(state, world, state.player.region);
    st.structures.snares = 40;
    st.pop.hare = 100000;
    const r = regionAt(world, state.player.region);
    r.capacity.hare = 100000;
    let caught = 0;
    for (let d = 0; d < 200; d++) {
      st.snareCatch = { count: 0, age: 0 };
      dailyCamp(state, world, calendar(d * 1440), new Rng(d), null);
      caught += st.snareCatch.count;
    }
    expect(caught / 200).toBeGreaterThan(1.2);
    expect(caught / 200).toBeLessThan(2.0);
  });
});
```

(`dailyCamp` is exported from `camp.ts`; `regionAt` from `../src/world/gen`; `Rng` from `../src/rng`.) In `tests/list.test.ts`:

```ts
  it("keeps twenty snares set with the food and forty below the trough", () => {
    const tasks = REFERENCE_ORDERS.map(key);
    const twenty = REFERENCE_ORDERS.findIndex((w) => w.req.task === "build" && w.req.arg === "snare" && w.kind === "keep" && w.req.until.kind === "campHas" && w.req.until.qty === 20);
    const forty = REFERENCE_ORDERS.findIndex((w) => w.req.task === "build" && w.req.arg === "snare" && w.kind === "keep" && w.req.until.kind === "campHas" && w.req.until.qty === 40);
    expect(twenty).toBe(tasks.indexOf("berries::keep") + 1);
    expect(forty).toBe(tasks.indexOf("build:waterStore:job") + 1);
  });
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `npx vitest run tests/camp.test.ts tests/list.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

`src/sim/items.ts`:

```ts
/**
 * A trap line, not five snares: the Swedish handbook's 3 to 5 km of marked
 * ground with a hundred snares after a few days, checked at dawn. Forty
 * per region, a few percent a night each; five snares at 0.3 was the same
 * catch as fifty at 0.03 with none of the work.
 */
export const MAX_SNARES = 40;
export const SNARE_ODDS_PER_NIGHT = 0.04;
```

`src/sim/camp.ts`: `rng.chance(SNARE_ODDS_PER_NIGHT * d)` (import it). `src/sim/tasks.ts:553`: `why: \`${MAX_SNARES} snares is enough here\``. `src/sim/reference.ts`: insert `keep("build", 20, "snare"),` after `keep("berries", 2),` and `keep("build", 40, "snare"),` after `job("build", { kind: "once" }, "waterStore"),`. Check the ladder gate: `gateSkill("build", "snare")` is hunting, so the keep opens at Hunting 10 and the player script gives it as a five-times stand-in below that (a `times` stand-in from `withinLadder`); read `withinLadder` in `ladder.ts` and confirm a structure keep's stand-in is a `times` job of its count less what stands, or a once job. If `withinLadder` derives the stand-in's count from `until.qty`, it works as is; if it reads `yieldItem`, add the structure branch there too.

- [ ] **Step 4: Run the tests**

Run: `npm test`
Expected: PASS; update any test pinning "five snares is enough here" or the list's length.

- [ ] **Step 5: Commit**

```bash
git add src/sim/items.ts src/sim/camp.ts src/sim/tasks.ts src/sim/reference.ts src/sim/ladder.ts tests/camp.test.ts tests/list.test.ts
git commit -m "feat(survidle): snares are a trap line - forty per region at 0.04 a night, kept at twenty with the food and forty below the trough"
```

---

### Task 6: Big game depletes

**Files:**
- Modify: `src/sim/animals.ts:11,138-170`
- Test: `tests/animals.test.ts`

**Interfaces:**
- Produces: `export const BIG_GAME: Species[] = ["deer", "reindeer", "elk", "bear"]`; `export const BIG_GAME_MIGRATION = 0.003`; the migration loop uses it for those species and `MIGRATION` (0.03) for the rest.

- [ ] **Step 1: Write the failing test**

Append to `tests/animals.test.ts`:

```ts
  it("big game refills a shot-out range at a tenth of the predators' rate", () => {
    expect(BIG_GAME).toEqual(["deer", "reindeer", "elk", "bear"]);
    expect(BIG_GAME_MIGRATION).toBeCloseTo(0.003, 9);
    expect(BIG_GAME_MIGRATION * 10).toBeCloseTo(0.03, 9);
  });
```

Also, if `tests/animals.test.ts` has a migration test that moves elk or deer and asserts a number, update it to the new rate with a comment.

- [ ] **Step 2: Run to see it fail**

Run: `npx vitest run tests/animals.test.ts`
Expected: FAIL on the missing exports.

- [ ] **Step 3: Implement**

In `src/sim/animals.ts`:

```ts
const MIGRATION = 0.03;
/**
 * Elk, deer, reindeer and bear hold ranges for seasons; a range shot out
 * refills over a year or two, not weeks. A tenth of the predators' daily
 * share, so a lone hunter with a bow takes a few a year from a region, the
 * tables' expert band, and not thirty.
 */
export const BIG_GAME: Species[] = ["deer", "reindeer", "elk", "bear"];
export const BIG_GAME_MIGRATION = 0.003;
```

and in the migration loop: `const n = popOf(st, s) * (BIG_GAME.includes(s) ? BIG_GAME_MIGRATION : MIGRATION);`.

- [ ] **Step 4: Run the tests**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/sim/animals.ts tests/animals.test.ts
git commit -m "feat(survidle): big game refills a hunted range at a tenth of the predators' rate, so a region's elk are a few kills a year"
```

---

### Task 7: The fire eats with the cold

**Files:**
- Modify: `src/sim/fire.ts:98-117`
- Modify: `tests/fire.test.ts:69-89,284-290`

**Interfaces:**
- Produces: `export const OPEN_BURN_KG_PER_HOUR = 3`; `export const SHELTER_BURN_RATIO = { turfHut: 0.4, cabin: 0.27 } as const`; `export function openBurnPerHour(ambient: number): number`; `burnPerHour(w, ambient, st)` keeps its signature. `SHELTER_BURN_KG_PER_HOUR` is removed.

- [ ] **Step 1: Write the failing tests**

In `tests/fire.test.ts` add:

```ts
describe("fuel by the cold", () => {
  it("the open fire burns 3 kg/h at zero, 6 at -10, 9 at -20 and 15 at -40; the hut and cabin keep their ratios on top", () => {
    const { state, world } = newGame(3);
    const st = regionState(state, world, state.player.region);
    const w = state.weather;
    expect(openBurnPerHour(5)).toBe(3);
    expect(openBurnPerHour(0)).toBe(3);
    expect(openBurnPerHour(-10)).toBe(6);
    expect(openBurnPerHour(-20)).toBe(9);
    expect(openBurnPerHour(-40)).toBe(15);
    expect(burnPerHour(w, -10, st)).toBe(6);
    st.structures.turfHut = true;
    st.fire.indoors = true;
    expect(burnPerHour(w, -10, st)).toBeCloseTo(2.4, 6);
    st.structures.turfHut = false;
    st.structures.cabin = true;
    st.structures.hearth = true;
    expect(burnPerHour(w, -10, st)).toBeCloseTo(1.62, 6);
  });

  it("rain still multiplies the open fire's appetite", () => {
    const { state, world } = newGame(3);
    const st = regionState(state, world, state.player.region);
    const w = state.weather;
    w.precip = "light";
    expect(burnPerHour(w, -10, st)).toBeCloseTo(9, 6);
    w.precip = "heavy";
    expect(burnPerHour(w, 5, st)).toBe(6);
  });
});
```

Change the existing assertion at line 290 (`burnPerHour(dry, -20, st)).toBe(1.2)`) to `toBeCloseTo(3.6, 6)` with a comment "0.4 of an open fire at -20, 9 kg/h".

- [ ] **Step 2: Run to see them fail**

Run: `npx vitest run tests/fire.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

Replace the fuel block in `src/sim/fire.ts`:

```ts
/**
 * Fuel by the cold and the shelter. Kochanski: an overnight stay at -40 C
 * in an open lean-to is a 30 cm spruce a night, some 200 kg; a teepee with
 * an open fire a third to a quarter of that; an enclosed shelter with a
 * stove a tenth. The open fire here is a tended fire under a lean-to's
 * roof, not the long fire of an open bivouac, so 3 kg/h at zero rising a
 * tenth per degree of frost: 6 at -10, 9 at -20, 15 at -40. The hut and
 * the cabin are ratios on that (a hearth in a turf hut, a walled cabin
 * with a hearth; Nordic households with a stove burned 4 to 8 tonnes a
 * year), applied only to a fire lit indoors; a fire at the pit outside a
 * hut is an open fire.
 */
export const OPEN_BURN_KG_PER_HOUR = 3;
export const SHELTER_BURN_RATIO = { turfHut: 0.4, cabin: 0.27 } as const;

export function openBurnPerHour(ambient: number): number {
  return OPEN_BURN_KG_PER_HOUR * (1 + Math.max(0, -ambient) / 10);
}

/** Fuel the fire eats per hour in this weather and cold; a roof over the pit keeps the rain off. */
export function burnPerHour(w: Weather, ambient: number, st: RegionState): number {
  const open = openBurnPerHour(ambient);
  if (st.fire.indoors) {
    if (st.structures.cabin && st.structures.hearth) return open * SHELTER_BURN_RATIO.cabin;
    if (st.structures.turfHut) return open * SHELTER_BURN_RATIO.turfHut;
  }
  if (w.precip === "none" || roofed(st)) return open;
  const snowing = ambient <= 0;
  if (w.precip === "heavy" && !snowing) return open * 2;
  return open * 1.5;
}
```

Grep for `SHELTER_BURN_KG_PER_HOUR` in `src`, `tests`, `scripts` and `docs/README.md` and replace each use.

- [ ] **Step 4: Run the tests**

Run: `npm test`
Expected: PASS; `tests/hut.test.ts` or `tests/year.test.ts` may pin a night's fuel, update with the ratio arithmetic in a comment.

- [ ] **Step 5: Commit**

```bash
git add src/sim/fire.ts tests/fire.test.ts tests/hut.test.ts tests/year.test.ts
git commit -m "feat(survidle): the fire eats with the cold - 3 kg/h at zero, double by -10, triple by -20, the hut and cabin as ratios on it"
```

---

### Task 8: Snow depth

**Files:**
- Modify: `src/sim/weather.ts:68-121`
- Modify: `src/sim/year.ts:33-43,80-108` (`MonthLine.snowCm`), `scripts/year.ts:36-39`
- Test: `tests/weather.test.ts`

**Interfaces:**
- Produces: `export const SNOW_CM_PER_MINUTE = { light: 1 / 160, heavy: 1 / 80 } as const`; `export const SNOW_SETTLE_PER_DAY = 0.02`; `MonthLine.snowCm: number`.

- [ ] **Step 1: Write the failing tests**

Append to `tests/weather.test.ts`:

```ts
  it("snow lays a quarter of what it did and the pack settles two percent at the day roll", () => {
    expect(SNOW_CM_PER_MINUTE).toEqual({ light: 1 / 160, heavy: 1 / 80 });
    expect(SNOW_SETTLE_PER_DAY).toBe(0.02);
    const { state } = newGame(17, 334);
    const w = state.weather;
    w.snowCm = 0;
    w.precip = "heavy";
    w.offset = -10;
    const cal = calendar(0, 334);
    const rng = new Rng(1);
    for (let m = 0; m < 60; m++) stepWeather(w, calendar(m, 334), rng, 1, m);
    expect(w.snowCm).toBeCloseTo(0.75, 1);
    w.snowCm = 100;
    w.precip = "none";
    // December's sunrise at 62 N is past 10:00; 11:00 the next day is after the roll.
    w.storm = null;
    const dawn = calendar(1440 + 11 * 60, 334);
    stepWeather(w, dawn, rng, 1, 1440 + 11 * 60);
    expect(w.snowCm).toBeCloseTo(98, 0);
    expect(cal.season).toBe("winter");
  });
```

(A storm may start at the day roll; set `w.storm = null` before the dawn step and assert the settle before any fall by reading `snowCm` right after the step with `precip` forced to "none" again.)

- [ ] **Step 2: Run to see it fail**

Run: `npx vitest run tests/weather.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

`src/sim/weather.ts`:

```ts
/**
 * Snow on the ground. Fresh snow lays 0.375 cm an hour in light snow and
 * 0.75 in heavy, a quarter of the old rates, and the pack settles two
 * percent of its depth at each day roll; together they hold a 62 N inland
 * January at 40 to 60 cm where it read 80 to 270 (the year loop's first
 * flag). Melting above 2 C stays at 2 cm an hour.
 */
export const SNOW_CM_PER_MINUTE = { light: 1 / 160, heavy: 1 / 80 } as const;
export const SNOW_SETTLE_PER_DAY = 0.02;
```

In the day-roll block (after `stepIce(w, cal)`): `w.snowCm *= 1 - SNOW_SETTLE_PER_DAY;`. In the fall line: `w.snowCm += (w.precip === "heavy" ? SNOW_CM_PER_MINUTE.heavy : SNOW_CM_PER_MINUTE.light) * dt;`.

`src/sim/year.ts`: add `snowCm: number` to `MonthLine` and set it in `runLife`'s month push: `snowCm: Math.round(state.weather.snowCm)`. `scripts/year.ts` month line: append `, snow ${m.snowCm} cm`.

- [ ] **Step 4: Run and calibrate**

Run: `npm test` then `npm run year -- 17 19 42 79 > ../../year-snow.log 2>&1` (in the background) and read the January and February snow on the month lines. If January reads outside 40 to 60 cm on the four seeds, move `SNOW_SETTLE_PER_DAY` (not the fall) by steps of 0.005 until it does, re-running the year, and record the chosen value's reading in the constant's comment.

- [ ] **Step 5: Commit**

```bash
git add src/sim/weather.ts src/sim/year.ts scripts/year.ts tests/weather.test.ts
git commit -m "feat(survidle): snow lays a quarter as fast and settles two percent a day, and the year's month lines print the depth"
```

---

### Task 9: The snow shelter

**Files:**
- Modify: `src/sim/types.ts:59,211-243` (`StructureId`, `RegionState`)
- Modify: `src/sim/items.ts:127-138` (`STRUCTURES`, new constants)
- Modify: `src/sim/regionstate.ts:25-40` (defaults), `src/sim/save.ts:170-176` (defaults)
- Modify: `src/sim/tasks.ts:545-579` (the build check), the `lightIndoors` check, `:1363-1383` (completion)
- Modify: `src/sim/player.ts:47-62,110-145,244-253` (`shelterBonus`, `sheltered`, `feltTemperature`, `walled`)
- Modify: `src/sim/fire.ts:74-76` (`roofed`)
- Modify: `src/sim/camp.ts:206-213,243-252` (`dailyCamp` melt, `STRUCTURE_WORD`)
- Modify: `src/sim/landing.ts:100-104` (`structureCount`), `src/sim/reference.ts` (`foundAtOldCamp` list, `REFERENCE_ORDERS`, `wantOpen`)
- Modify: `src/sim/capabilities.ts:159-168` (a row), `src/ui/panels.ts:281-291` (the built list)
- Test: `tests/snowshelter.test.ts` (new), `tests/list.test.ts`

**Interfaces:**
- Produces: `StructureId` gains `"snowShelter"`; `RegionState.structures.snowShelter: boolean`; `RegionState.meltDays: number`; `export const SNOW_SHELTER_CM = 40`, `export const SNOW_MELT_DAYS = 3` in `items.ts`; `export const SNOW_FLOOR_C = -3` in `player.ts`; the list has `job("build", { kind: "once" }, "snowShelter")` after the bough bed keep; `wantOpen` closes it when a hut or cabin stands.

- [ ] **Step 1: Write the failing tests**

Create `tests/snowshelter.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { Rng } from "../src/rng";
import { calendar } from "../src/sim/calendar";
import { dailyCamp } from "../src/sim/camp";
import { roofed } from "../src/sim/fire";
import { SNOW_MELT_DAYS, SNOW_SHELTER_CM, STRUCTURES } from "../src/sim/items";
import { newGame } from "../src/sim/newgame";
import { feltTemperature, sheltered, SNOW_FLOOR_C } from "../src/sim/player";
import { regionState } from "../src/sim/regionstate";
import { check, startTask, stepTask } from "../src/sim/tasks";
import { REFERENCE_ORDERS, wantOpen } from "../src/sim/reference";

const key = (w: (typeof REFERENCE_ORDERS)[number]) => `${w.req.task}:${w.req.arg ?? ""}:${w.kind}`;

describe("the snow shelter", () => {
  it("needs 40 cm of snow, nothing else, and no hut standing", () => {
    expect(STRUCTURES.snowShelter.needs).toEqual([]);
    expect(STRUCTURES.snowShelter.minutes).toBe(300);
    expect(SNOW_SHELTER_CM).toBe(40);
    const { state, world } = newGame(17, 334);
    const st = regionState(state, world, state.player.region);
    const cal = calendar(0, 334);
    state.weather.snowCm = 10;
    expect(check(state, world, cal, "build", "snowShelter").why).toBe("needs 40 cm of snow");
    state.weather.snowCm = 45;
    expect(check(state, world, cal, "build", "snowShelter").ok).toBe(true);
    st.structures.turfHut = true;
    expect(check(state, world, cal, "build", "snowShelter").why).toBe("the hut is warmer");
  });

  it("built, it is a roof and walls with a -3 C floor and no fire inside", () => {
    const { state, world } = newGame(17, 334);
    const st = regionState(state, world, state.player.region);
    state.weather.snowCm = 45;
    const cal = calendar(0, 334);
    startTask(state, world, cal, "build", "snowShelter");
    for (let m = 0; m < 300 && state.task; m++) stepTask(state, world, cal, new Rng(m), 1);
    expect(st.structures.snowShelter).toBe(true);
    expect(roofed(st)).toBe(true);
    state.task = null;
    expect(sheltered(state, world)).toBe(true);
    const inside = feltTemperature(state, world, -25);
    const openAir = (() => { st.structures.snowShelter = false; const f = feltTemperature(state, world, -25); st.structures.snowShelter = true; return f; })();
    expect(inside - openAir).toBeCloseTo(SNOW_FLOOR_C + 25, 6);
    expect(check(state, world, cal, "lightIndoors").why).toBe("snow does not take a fire");
  });

  it("slumps on the third warm day in a row and stands through a cold one between", () => {
    const { state, world } = newGame(17, 334);
    const st = regionState(state, world, state.player.region);
    st.structures.snowShelter = true;
    state.weather.offset = 20;
    dailyCamp(state, world, calendar(0, 334), new Rng(1), null);
    dailyCamp(state, world, calendar(1440, 334), new Rng(2), null);
    expect(st.structures.snowShelter).toBe(true);
    state.weather.offset = -20;
    dailyCamp(state, world, calendar(2880, 334), new Rng(3), null);
    expect(st.meltDays).toBe(0);
    state.weather.offset = 20;
    for (let d = 0; d < SNOW_MELT_DAYS; d++) dailyCamp(state, world, calendar((3 + d) * 1440, 334), new Rng(d), null);
    expect(st.structures.snowShelter).toBe(false);
    expect(state.log.some((l) => l.text.includes("has slumped"))).toBe(true);
  });

  it("sits in the list after the bough bed keep and closes when a hut or cabin stands", () => {
    const tasks = REFERENCE_ORDERS.map(key);
    expect(tasks.indexOf("build:snowShelter:job")).toBe(tasks.indexOf("build:boughBed:keep") + 1);
    const { state, world } = newGame(17, 334);
    const w = REFERENCE_ORDERS[tasks.indexOf("build:snowShelter:job")];
    expect(wantOpen(state, world, w, calendar(0, 334))).toBe(true);
    regionState(state, world, state.player.region).structures.turfHut = true;
    expect(wantOpen(state, world, w, calendar(0, 334))).toBe(false);
  });
});
```

(`newGame(seed, startDoy)` opens on that day; 334 is 1 December, where the mean is under zero so `offset = 20` makes a warm day and `-20` a cold one.)

- [ ] **Step 2: Run to see it fail**

Run: `npx vitest run tests/snowshelter.test.ts`
Expected: FAIL on the missing structure.

- [ ] **Step 3: Implement**

`src/sim/types.ts`: add `"snowShelter"` to `StructureId`; in `RegionState.structures` add `snowShelter: boolean`; add `/** Days in a row with a mean above freezing; a snow shelter slumps at SNOW_MELT_DAYS. */ meltDays: number;`.

`src/sim/items.ts`, in `STRUCTURES`:

```ts
  snowShelter: { name: "snow shelter", needs: [], minutes: 300, desc: "A heaped and hollowed drift. Walls of snow hold -3 C whatever the night does; no fire inside." },
```

with, below the block:

```ts
/**
 * Kochanski: pile snow, let it set, dig it out; the ground under a good
 * cover sits at -3 to -5 C whatever the air. The Swedish handbook: the
 * pile freezes together in four or five hours. Needs this much snow at
 * camp and no tools; slumps after this many warm days in a row.
 */
export const SNOW_SHELTER_CM = 40;
export const SNOW_MELT_DAYS = 3;
```

`src/sim/regionstate.ts` defaults: `snowShelter: false` in `structures`, `meltDays: 0`. `src/sim/save.ts`: `st.structures.snowShelter ??= false; st.meltDays ??= 0;` beside the other region defaults.

`src/sim/tasks.ts` build check, after the `if (!camp)` line:

```ts
      if (sid === "snowShelter") {
        if (st.structures.turfHut || st.structures.cabin) return { ...o, ok: false, why: "the hut is warmer" };
        if (st.structures.snowShelter) return { ...o, ok: false, why: "already built here" };
        if (state.weather.snowCm < SNOW_SHELTER_CM) return { ...o, ok: false, why: `needs ${SNOW_SHELTER_CM} cm of snow` };
        if (done > 0) return { ...o, detail: `${Math.round((done / def.minutes) * 100)}% heaped` };
        return o;
      }
```

In the `lightIndoors` check (`grep -n '"lightIndoors"' src/sim/tasks.ts` for the `case`), before its other refusals: `if (st.structures.snowShelter && !st.structures.turfHut && !st.structures.cabin) return { ...o, ok: false, why: "snow does not take a fire" };`. Completion needs no change (`st.structures[sid] = true`).

`src/sim/player.ts`:

```ts
/** The floor a snow shelter holds with no fire: Kochanski's -3 to -5 C at the ground under good snow. */
export const SNOW_FLOOR_C = -3;
```

`shelterBonus`: first line `if (r.structures.snowShelter && !r.structures.cabin && !r.structures.turfHut) return 0;`. `sheltered`: add `|| r.structures.snowShelter`. In `feltTemperature`: `const inSnow = camp && campTask && r.structures.snowShelter && !indoors;` and `const floor = indoors ? (inCabin ? INDOOR_C.cabin : INDOOR_C.turfHut) : inSnow ? SNOW_FLOOR_C : -Infinity;`. In `stepPlayer`: `const walled = roof && (r.structures.cabin || r.structures.turfHut || r.structures.snowShelter);`.

`src/sim/fire.ts` `roofed`: `|| st.structures.snowShelter`.

`src/sim/camp.ts` `dailyCamp`, after the bough bed block (import `seasonalMean` from `./weather`, `SNOW_MELT_DAYS` from `./items`):

```ts
    if (st.structures.snowShelter) {
      const mean = seasonalMean(cal.dayOfYear) + state.weather.offset;
      st.meltDays = mean > 0 ? st.meltDays + 1 : 0;
      if (st.meltDays >= SNOW_MELT_DAYS) {
        st.structures.snowShelter = false;
        st.meltDays = 0;
        log(state, `The snow shelter at ${r.name} has slumped.`, "bad");
      }
    }
```

`STRUCTURE_WORD`: add `snowShelter: STRUCTURES.snowShelter.name`. `src/sim/landing.ts` `structureCount`: add `(s.snowShelter ? 1 : 0)`. `src/sim/reference.ts` `foundAtOldCamp`: add `"snowShelter"` to the structures list; `REFERENCE_ORDERS`: after `keep("build", 1, "boughBed"),` insert `job("build", { kind: "once" }, "snowShelter"),`; `wantOpen`: `if (w.req.task === "build" && w.req.arg === "snowShelter") { const st = regionState(state, world, state.player.region); return !(st.structures.turfHut || st.structures.cabin); }`. `src/sim/capabilities.ts`: add a row

```ts
  {
    id: "snow shelter",
    keys: ["build:snowShelter"],
    tier: "structure",
    receives: ["woodcraft"],
    gives: "a winter roof from nothing but the snow: -3 C inside whatever the night, the bough bed under you",
    limits: "40 cm of snow, no fire inside, three warm days and it is gone",
  },
```

`src/ui/panels.ts` built list: `if (st.structures.snowShelter) built.push("snow shelter");`. The Do panel builds its rows from `STRUCTURE_IDS`, so the row appears on its own; check `src/ui/dopanel.ts` for a hand-kept order of build rows and add the shelter after the lean-to if there is one. The spine (`src/sim/spine.ts`) and any `Record<StructureId, ...>` the compiler flags get their entry.

- [ ] **Step 4: Run the tests**

Run: `npm test`
Expected: PASS; `tests/capabilities.test.ts` and `tests/siting.test.ts` (STRUCTURE_WORD) cover the registrations.

- [ ] **Step 5: Commit**

```bash
git add src/sim/types.ts src/sim/items.ts src/sim/regionstate.ts src/sim/save.ts src/sim/tasks.ts src/sim/player.ts src/sim/fire.ts src/sim/camp.ts src/sim/landing.ts src/sim/reference.ts src/sim/capabilities.ts src/sim/spine.ts src/ui/panels.ts src/ui/dopanel.ts tests/snowshelter.test.ts
git commit -m "feat(survidle): the snow shelter - heaped from 40 cm of snow in five hours, a roof and walls with a -3 C floor and no fire, gone after three warm days, in the list between the bed and the hut"
```

---

### Task 10: The quarter carry

**Files:**
- Modify: `src/sim/types.ts:362-372` (`LifeRecord.skills`), `:398-410` (`SkillState.carried`)
- Modify: `src/sim/record.ts:53-70` (`fillDied`)
- Modify: `src/sim/skills.ts` (new `CARRY_SHARE`, `carrySkills`)
- Modify: `src/sim/landing.ts:244-290` (`land`, the heir branch)
- Modify: `src/ui/panels.ts:129-150` (`skillsHtml`)
- Test: `tests/carry.test.ts` (new)

**Interfaces:**
- Produces: `LifeRecord.skills?: Partial<Record<SkillId, number>>` (practice minutes at death); `SkillState.carried?: number`; `export const CARRY_SHARE = 0.25`; `export function carrySkills(state: GameState, from: LifeRecord): { skill: SkillId; level: number }[]` (sets each skill's xp to the share, logs the rung lines the carried level opens, returns the skills at level 2 or above); the landing log gains the carry sentence.

- [ ] **Step 1: Write the failing test**

Create `tests/carry.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { advance } from "../src/sim/advance";
import { setSkillLevel } from "../src/sim/horizon";
import { beginAgain, land } from "../src/sim/landing";
import { newGame } from "../src/sim/newgame";
import { die } from "../src/sim/player";
import { current } from "../src/sim/record";
import { CARRY_SHARE, level, levelMinutes } from "../src/sim/skills";
import { skillsHtml } from "../src/ui/panels";
import { regionAt } from "../src/world/gen";

describe("the quarter carry", () => {
  it("a heir lands with a quarter of the ancestor's minutes in every skill, mastery and pool empty, the rung lines and the landing line logged", () => {
    const { state, world } = newGame(17);
    setSkillLevel(state, "woodcraft", 12);
    setSkillLevel(state, "hunting", 5);
    state.skills.woodcraft.mastery["chop:spruce"] = 600;
    state.skills.woodcraft.pool = 600;
    advance(state, world, 60);
    die(state, "froze", regionAt(world, state.player.region).name);
    const ancestor = current(state);
    expect(ancestor.skills!.woodcraft).toBeGreaterThanOrEqual(levelMinutes(12));
    beginAgain(state, world);
    land(state, world);
    expect(CARRY_SHARE).toBe(0.25);
    expect(state.skills.woodcraft.xp).toBeCloseTo(ancestor.skills!.woodcraft * CARRY_SHARE, 6);
    expect(state.skills.hunting.xp).toBeCloseTo(ancestor.skills!.hunting * CARRY_SHARE, 6);
    expect(state.skills.woodcraft.carried).toBeCloseTo(state.skills.woodcraft.xp, 6);
    expect(state.skills.woodcraft.mastery).toEqual({});
    expect(state.skills.woodcraft.pool).toBe(0);
    // A quarter of level 12's 14,520 minutes is 3,630: level 6, so jobs and grinds from birth.
    expect(level(state.skills.woodcraft.xp)).toBe(6);
    const text = state.log.map((l) => l.text).join("\n");
    expect(text).toContain("a quarter of what");
    expect(text).toContain("Woodcraft 6");
    expect(text).toContain("jobs with a count or a target from Woodcraft");
    expect(text).toContain("grinds, work that never ends, from Woodcraft");
    expect(skillsHtml(state)).toContain("carried from");
  });

  it("a first survivor carries nothing", () => {
    const { state } = newGame(19);
    expect(state.skills.woodcraft.xp).toBe(0);
    expect(state.skills.woodcraft.carried).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run to see it fail**

Run: `npx vitest run tests/carry.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

`src/sim/types.ts`: in `LifeRecord` add `/** Practice minutes per skill at death, what a heir carries a share of. */ skills?: Partial<Record<SkillId, number>>;`; in `SkillState` add `/** Minutes carried from the ancestor at landing; the panel names the ancestor while these are the larger share. */ carried?: number;`.

`src/sim/record.ts` `fillDied`, before `rec.died = died;`: `rec.skills = Object.fromEntries(SKILL_IDS.map((s) => [s, state.skills[s].xp])) as Partial<Record<SkillId, number>>;` (import `SKILL_IDS` from `./skills`; if that import is circular - `skills.ts` imports `record.ts`? it does not today; `person.ts` does - fall back to `Object.keys(state.skills)`).

`src/sim/skills.ts`:

```ts
/**
 * The carry (tables audit spec, section 7; idle curve spec 2.4): a heir
 * lands with this share of the ancestor's practice minutes in every skill,
 * as a rule of the world; the Lineage tree's nodes later lift a skill to
 * a half. Mastery and the pool are per action and start empty.
 */
export const CARRY_SHARE = 0.25;

/** Sets the heir's skills from the ancestor's record and logs the rungs the carried levels open. Returns the skills at level 2 or above. */
export function carrySkills(state: GameState, from: LifeRecord): { skill: SkillId; level: number }[] {
  const out: { skill: SkillId; level: number }[] = [];
  for (const id of SKILL_IDS) {
    const minutes = (from.skills?.[id] ?? 0) * CARRY_SHARE;
    if (minutes <= 0) continue;
    const s = state.skills[id];
    s.xp = minutes;
    s.carried = minutes;
    const l = level(minutes);
    if (l >= 2) out.push({ skill: id, level: l });
    for (const k of RUNG_ORDER) if (l >= RUNG_LEVEL[k]) log(state, RUNG_LINE[k](SKILL_NAMES[id]), "good");
  }
  return out;
}
```

(`LifeRecord` type import from `./types`; `log` is already imported.)

`src/sim/landing.ts` `land`, in the heir branch after `newPerson(state, world, l.cell, l.region);`: `const carried = carrySkills(state, last);` and build `const carry = carried.length ? \` {You} {carry} a quarter of what ${fmtName(last.name)} knew: ${carried.map((c) => \`${SKILL_NAMES[c.skill]} ${c.level}\`).join(", ")}.\` : "";` appended to the landing log line after `${journal}`. Log the landing line first and the rung lines after it: call `carrySkills` after the `log(...)` call, storing nothing, and compute the sentence from `last.skills` directly with `level(minutes * CARRY_SHARE)` so the line can be built before the call; or call `carrySkills` first into a variable and emit the landing line, accepting the rung lines above it. Choose the first: the landing line reads first in the log.

`src/ui/panels.ts` `skillsHtml`: where the row's small print is built, add `${s.carried && s.carried > s.xp / 2 ? \` carried from ${esc(fmtName(state.survivors[state.survivors.length - 2].name))}\` : ""}` (guard `state.survivors.length >= 2`).

- [ ] **Step 4: Run the tests**

Run: `npm test`
Expected: PASS; `tests/landing.test.ts` pins the landing line, extend its expectation to allow the carry sentence.

- [ ] **Step 5: Commit**

```bash
git add src/sim/types.ts src/sim/record.ts src/sim/skills.ts src/sim/landing.ts src/ui/panels.ts tests/carry.test.ts tests/landing.test.ts
git commit -m "feat(survidle): a heir carries a quarter of the ancestor's practice in every skill, the rungs it opens logged at landing and the panel naming who it came from"
```

---

### Task 11: The lineage gate, kills per year, the deep-cold verdict

**Files:**
- Modify: `src/sim/reference.ts:664-689` (`runLineage`)
- Modify: `scripts/reference.ts:90-121`
- Modify: `src/sim/types.ts:396` (`RunStats.kills`), `src/sim/newgame.ts:66`, `src/sim/save.ts`, `src/sim/tasks.ts:1226-1228`
- Modify: `src/sim/year.ts:33-43,80-112`, `scripts/year.ts:32-43`
- Test: `tests/reference.test.ts`, `tests/year.test.ts`

**Interfaces:**
- Produces: `runLineage(seed, days, lives = 6)` stops after a life that reached `days`; `RunStats.kills: Partial<Record<Species, number>>`; `YearReport.kills: Partial<Record<Species, number>>` and `YearReport.killsKcal: number` (large game only); the year script prints `kills: elk 3, deer 5 (large game N kcal a day, in band)` and, on December, January and February month lines, `deep-cold band: over/in band/under`; the reference script prints `lineage gate: N of M seeds reached a year within six lives`.

- [ ] **Step 1: Write the failing tests**

Append to `tests/reference.test.ts`:

```ts
describe("the lineage gate", () => {
  it("runs up to six lives and stops at the first that reaches the day cap", () => {
    const l = runLineage(17, 3, 6);
    expect(l.lives.length).toBeGreaterThanOrEqual(1);
    expect(l.lives.length).toBeLessThanOrEqual(6);
    const last = l.lives[l.lives.length - 1].report;
    if (last.outcome.kind === "reached") expect(last.outcome.day).toBeGreaterThanOrEqual(3);
    for (const life of l.lives.slice(0, -1)) expect(life.report.outcome.kind).toBe("died");
  });
});
```

Append to `tests/year.test.ts`:

```ts
  it("counts kills per species on the run and the report", () => {
    const { state, world } = newGame(17);
    expect(state.stats.kills).toEqual({});
    state.stats.kills.elk = 2;
    const r = runYear(17, { days: 2 });
    expect(r.kills).toBeDefined();
    expect(typeof r.killsKcal).toBe("number");
  });
```

- [ ] **Step 2: Run to see them fail**

Run: `npx vitest run tests/reference.test.ts tests/year.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

`src/sim/types.ts`: `export interface RunStats { trees: number; animals: number; structures: number; km: number; kills: Partial<Record<Species, number>> }`. `newgame.ts`: `kills: {}`. `save.ts`: `state.stats.kills ??= {};`. `tasks.ts` hunt success: `state.stats.kills[s] = (state.stats.kills[s] ?? 0) + 1;` beside `state.stats.animals++`.

`src/sim/reference.ts` `runLineage`: signature `lives = 6`; the loop already stops when `state.dead` is false. Nothing else changes; document the six in the comment.

`scripts/reference.ts` heir block: run `runLineage(seed, Math.max(days, 366), 6)`; after the trend line print `` ` days: ${l.lives.map((x) => x.report.outcome.kind === "died" ? x.report.outcome.day : `${x.report.outcome.day}+`).join(", ")}` ``; count `reached++` when any life's outcome is `reached`; print `lineage gate: ${reached} of ${seeds.length} seeds reached a year within six lives` after the trend gate line.

`src/sim/year.ts`: add to `YearReport` `kills: Partial<Record<Species, number>>; killsKcal: number;` and in `runLife` return them: `kills: { ...state.stats.kills }`, `killsKcal` summed over `LARGE_GAME` and `"bear"` as `(kills[s] ?? 0) * (meatKg * FOODS.rawMeat.kcalPerKg + fatKg * FOODS.fat.kcalPerKg)` from `SPECIES_DEFS[s].yields`. `scripts/year.ts` `print`: after the surplus line, `console.log(\`  kills: ${Object.entries(r.kills).map(([s, n]) => \`${s} ${n}\`).join(", ") || "none"}; large game ${Math.round(r.killsKcal / daysRun)} kcal a day (${verdict(r.killsKcal / daysRun, APRIL.rows.largeGame!.experienced)})\`)` where `daysRun` is the outcome day; on month lines whose `m.month` is 11, 0 or 1 append `; deep-cold band ${verdict(m.burnPerDay, BURN.deepCold)}` (import `APRIL, BURN, verdict` from `../src/sim/tables`).

- [ ] **Step 4: Run the tests**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/sim/reference.ts scripts/reference.ts src/sim/types.ts src/sim/newgame.ts src/sim/save.ts src/sim/tasks.ts src/sim/year.ts scripts/year.ts tests/reference.test.ts tests/year.test.ts
git commit -m "feat(survidle): the lineage gate runs six lives to a year, the year report counts kills against the large-game band, and winter month lines carry the deep-cold verdict"
```

---

### Task 12: The manual

**Files:**
- Create: `src/sim/manual.ts`
- Modify: `src/sim/types.ts` (`GameState.manualSeen`), `src/sim/newgame.ts`, `src/sim/save.ts`
- Modify: `src/ui/panels.ts` (`manualHtml`, the landing button), `src/ui/render.ts:8-25,63` (`UiState.manual`), `src/main.ts:174-189,313-326` (overlay order, actions), `index.html:36-38` (the strip link)
- Test: `tests/manual.test.ts` (new)

**Interfaces:**
- Produces: `GameState.manualSeen: boolean`; `export function openManualOnFirstLanding(state: GameState, heir: boolean): boolean` in `src/sim/manual.ts` (true once per world for a first survivor's landing, sets the flag); `export const MANUAL_SECTIONS: { title: string; lines: string[] }[]` and `export const MANUAL_LINKS: { title: string; url: string }[]` in `src/sim/manual.ts`; `export function manualHtml(): string` in `panels.ts`; actions `manual-open`, `manual-close`; `UiState.manual: boolean`.

- [ ] **Step 1: Write the failing test**

Create `tests/manual.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { MANUAL_LINKS, MANUAL_SECTIONS, openManualOnFirstLanding } from "../src/sim/manual";
import { newGame } from "../src/sim/newgame";
import { landingHtml, manualHtml } from "../src/ui/panels";
import { beginAgain } from "../src/sim/landing";
import { die } from "../src/sim/player";
import { regionAt } from "../src/world/gen";

describe("the manual", () => {
  it("is four short sections and the handbook links", () => {
    expect(MANUAL_SECTIONS.map((s) => s.title)).toEqual(["The first days, in order", "What kills you, and how fast", "Food and the seasons", "Orders and being away"]);
    for (const s of MANUAL_SECTIONS) {
      expect(s.lines.length).toBeGreaterThanOrEqual(2);
      expect(s.lines.length).toBeLessThanOrEqual(5);
    }
    expect(MANUAL_LINKS.map((l) => l.url)).toContain("https://archive.org/details/handbok_overlevnad_1988");
    expect(MANUAL_LINKS.map((l) => l.url)).toContain("https://archive.org/details/northern-bushcraft_202210");
    const html = manualHtml();
    for (const s of MANUAL_SECTIONS) expect(html).toContain(s.title);
    for (const l of MANUAL_LINKS) expect(html).toContain(l.url);
    expect(html).toContain('data-act="manual-close"');
    expect(html).not.toMatch(/[—–…‘’“”]/);
  });

  it("opens once on a world's first landing and never for a heir", () => {
    const { state, world } = newGame(17);
    expect(state.manualSeen).toBe(false);
    expect(openManualOnFirstLanding(state, false)).toBe(true);
    expect(state.manualSeen).toBe(true);
    expect(openManualOnFirstLanding(state, false)).toBe(false);
    const fresh = newGame(19).state;
    expect(openManualOnFirstLanding(fresh, true)).toBe(false);
    expect(fresh.manualSeen).toBe(false);
  });

  it("the landing screen has the button", () => {
    const { state, world } = newGame(17);
    die(state, "froze", regionAt(world, state.player.region).name);
    beginAgain(state, world);
    expect(landingHtml(state, world)).toContain('data-act="manual-open"');
  });
});
```

- [ ] **Step 2: Run to see it fail**

Run: `npx vitest run tests/manual.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

Create `src/sim/manual.ts`:

```ts
/**
 * The one-page manual (tables audit spec, section 8): four sections of two
 * to four lines in the game's own voice, and the handbooks it was read
 * against. Opened once, unasked, on a world's first landing; there when
 * wanted after that.
 */
import type { GameState } from "./types";

export const MANUAL_SECTIONS: { title: string; lines: string[] }[] = [
  {
    title: "The first days, in order",
    lines: [
      "A fire tonight. A roof by the second night.",
      "Water every day, from the shore or a bucket.",
      "Then food. Nothing else comes before those four.",
    ],
  },
  {
    title: "What kills you, and how fast",
    lines: [
      "Cold kills in hours: wet clothes and a night in the open.",
      "Thirst kills in days. Hunger takes weeks, but the work gets slow long before.",
      "The log warns before each: \"You are shivering hard\", \"You are thirsty\", \"You are getting thin\".",
      "The dark is slow going without a torch.",
    ],
  },
  {
    title: "Food and the seasons",
    lines: [
      "Hare alone starves you; you need fat, and fish.",
      "A trap in the water works while you sleep. Berries are a season, and two litres is a day's worth.",
      "A deer is weeks of food that rots in a day unless you dry it.",
      "Winter needs a hut or a snow shelter, a woodpile, and stores.",
    ],
  },
  {
    title: "Orders and being away",
    lines: [
      "You give orders; the game keeps them, and earns you longer ones as your skills grow.",
      "Away is riskier than playing: the runner does what you asked and nothing more.",
      "Death keeps the world. The next survivor lands months later, near the old camp, carrying a quarter of what you knew.",
    ],
  },
];

export const MANUAL_LINKS: { title: string; url: string }[] = [
  { title: "Forsvarsmakten, Handbok Overlevnad (1988), free to read", url: "https://archive.org/details/handbok_overlevnad_1988" },
  { title: "Mors Kochanski, Northern Bushcraft, free to read", url: "https://archive.org/details/northern-bushcraft_202210" },
  { title: "The Norwegian Army's Overlevelseshandbok for Haeren (2025)", url: "https://www.forsvaret.no/aktuelt-og-presse/aktuelt/overlevelse-handbok" },
];

/** True once per world, on the first survivor's landing; a heir's landing never opens it. */
export function openManualOnFirstLanding(state: GameState, heir: boolean): boolean {
  if (heir || state.manualSeen) return false;
  state.manualSeen = true;
  return true;
}
```

(The link titles use plain ASCII for the Nordic letters, per the no-non-typable rule; the game's own strings elsewhere keep their letters, so if `MANUAL_LINKS` titles may carry ö and æ under that rule, use them. Decide by the CLAUDE.md rule: typable on a standard keyboard. ASCII it is.)

`src/sim/types.ts` `GameState`: `/** The manual has been opened unasked once in this world. */ manualSeen: boolean;`. `newgame.ts`: `manualSeen: false` in the state literal. `save.ts`: `state.manualSeen ??= false;`.

`src/ui/panels.ts`:

```ts
export function manualHtml(): string {
  const sections = MANUAL_SECTIONS.map((s) => `<h2>${esc(s.title)}</h2>${s.lines.map((l) => `<p>${esc(l)}</p>`).join("")}`).join("");
  const links = MANUAL_LINKS.map((l) => `<li><a href="${esc(l.url)}" target="_blank" rel="noopener">${esc(l.title)}</a></li>`).join("");
  return `<div class="box manual">
<h1>How to survive</h1>
${sections}
<h2>More</h2>
<ul>${links}</ul>
<button class="act" data-act="manual-close">Close</button>
</div>`;
}
```

and in `landingHtml`, after the next-boat button: `<button class="mini" data-act="manual-open">How to survive</button>`.

`src/ui/render.ts` `UiState`: `/** The manual overlay is open. */ manual: boolean;` defaulting to `false` in `newUiState`. `src/main.ts` render: `if (ui.manual) { setPanel("overlay", manualHtml()); overlay.hidden = false; } else if (ui.cemetery) ...`. Actions: `case "manual-open": ui.manual = true; break; case "manual-close": ui.manual = false; break;`. In the `land` case, after `land(state, world);`: `if (wasLanding && state.landing === null && openManualOnFirstLanding(state, heir)) ui.manual = true;`. `index.html` `#away` panel: add `<button type="button" class="mini" data-act="manual-open">how to survive</button>` after the label. `src/style.css`: `#overlay .box.manual { max-width: 640px; } #overlay .box.manual h2 { font-size: 1em; margin: 12px 0 4px; } #overlay .box.manual p { margin: 2px 0; }` beside the other overlay rules.

- [ ] **Step 4: Run the tests and the browser check**

Run: `npm test` then `npm run dev` and open `http://127.0.0.1:5173/prototypes/08/?seed=17` at 1440 by 900 and at 390 wide: the manual opens once over the first landing, closes, reopens from the landing button and from the strip, and nothing scrolls sideways at 390. Stop the server.

- [ ] **Step 5: Commit**

```bash
git add src/sim/manual.ts src/sim/types.ts src/sim/newgame.ts src/sim/save.ts src/ui/panels.ts src/ui/render.ts src/main.ts index.html src/style.css tests/manual.test.ts
git commit -m "feat(survidle): a one-page manual - four short sections and the handbooks, opened once on a world's first landing and from the landing screen and the strip after"
```

---

### Task 13: Measure, fix the runner's deaths, size the winter stock

**Files:**
- Modify: `src/sim/reference.ts` (`WINTER_STOCK`, list changes the deaths ask for), `src/sim/body.ts` or `src/sim/intent.ts` (runner rules the deaths ask for)
- Modify: `docs/superpowers/specs/2026-09-06-survidle-tables-audit-design.md` (section 0's "after" readings)

- [ ] **Step 1: Run the four gates and the reports, in the background, to files**

```bash
npm run reference > ../../april.log 2>&1
npm run year -- --winter > ../../winter.log 2>&1
npm run year > ../../year20.log 2>&1
npm run reference -- --heir > ../../lineage.log 2>&1
npm run year -- --level=10 > ../../year10.log 2>&1
npm run horizon > ../../horizon.log 2>&1
```

Read each: the pass lines, every death's day and cause, the gate week's burn buckets and their verdicts, the snow on the January line, the kills line, the woodpile on 1 March in the winter log, the litres drunk in a winter week (the week line's water, if printed; otherwise skip).

- [ ] **Step 2: Size the winter stock from the winter log**

From the winter log's firewood on the month lines, compute the kilos a hut winter burned; set `WINTER_STOCK.firewoodKg` and `WINTER_STOCK.logs` so the stock covers the ninety days with a fifth to spare, and put the reading in the constant's comment ("a hut at the winter mean burned N kg a day over the stocked December camp's ninety days"). Re-run the winter gate.

- [ ] **Step 3: Read every death against the rule**

For each seed that dies before its gate, read the last week's lines and the log around the death (`npx vite-node scripts/reference.ts 42 60` prints one seed; add a `console.log` of `state.log.slice(-40)` locally if needed, and remove it). Classify: runner (a woodpile or food at camp unused, a walk into the dark, a keep ranked under the grind that starves it, a chore the body should have done first) or world (the corrected numbers make the death unavoidable). For each runner death, change the rule or the list in the smallest way that a competent player would have played, in `body.ts`, `intent.ts` or `REFERENCE_ORDERS`, with a test in the file that owns the rule pinning the new behaviour, and re-run that gate. Record each change as a bullet under section 0 of the spec: the seed, the death, the cause read, the change. A world death is recorded the same way with "left: the world's number" and no change.

- [ ] **Step 4: Iterate until the four gates read 4 of 4, or every remaining death is a world death**

April at day 20 fed; the winter camp alive on 1 March; the level-20 year alive on 1 April; the lineage reaching a year within six lives. When a gate cannot go green without bending a corrected number, stop and write the reading down: the number, the death, and what a player could not have done.

- [ ] **Step 5: Run the full suite and commit each round**

```bash
npm test
git add src/sim/reference.ts src/sim/body.ts src/sim/intent.ts tests/ docs/superpowers/specs/2026-09-06-survidle-tables-audit-design.md
git commit -m "fix(survidle): <the runner change the death asked for>, measured on seed N"
```

One commit per change, each naming the death.

---

### Task 14: Docs

**Files:**
- Modify: `docs/superpowers/specs/2026-09-03-survidle-realism-roadmap.md` (the tables audit's build-order entry, "What kills you today", "What the north yields", the year loop's section 8 flags, F's carry paragraph)
- Modify: `docs/superpowers/specs/2026-09-05-survidle-year-loop-design.md` section 8 (which flags this audit took)
- Modify: `docs/superpowers/specs/2026-09-04-survidle-idle-curve-design.md` section 2.4 (the carry as built)
- Modify: `docs/README.md` (body, food, camp, snares, skills, winter paragraphs; a "How to survive" line; the numbers list)
- Modify: `docs/superpowers/specs/2026-09-06-survidle-tables-audit-design.md` ("Built" paragraph with the final readings)

- [ ] **Step 1: The roadmap**

Under the build order's tables audit entry write "built, readings under F" with the spec's path, and in the F section add a "Measured with the tables audit" paragraph in the style of the ones above it: the four gates before and after, seed by seed, the deaths and their causes, the January snow, the kills per species against the band, the 1 March woodpile, and the runner changes Task 13 made with the deaths that asked for them. Replace the "What kills you today" bullets' numbers with the corrected ones and add the handbook table from the spec's section 0 under "What the north yields" with the two source links. In F's Experience bullet add one sentence: the quarter carry landed as a rule of the world with the tables audit; the nodes lift it to a half.

- [ ] **Step 2: The other specs and the README**

Year loop section 8: annotate each flag "taken by the tables audit" (snow depth, snare odds), "made to bite by it" (the cook keep, via meat that rots in April), "answered by it" (the indoor water multiplier), or "stands". Idle curve 2.4: one sentence, the carry as built. README: every number this plan moved, in the paragraph that names it (hare and meat kcal, berries, the lean line, forty snares, the fire's appetite with the cold, the snow shelter under Camp and Winter, the bough bed's four days, the dark's third, the carry under The journal, the manual under How it plays), and the "Where the numbers live" list gains `src/sim/lean.ts`, `src/sim/manual.ts` and the snow constants in `weather.ts`.

- [ ] **Step 3: Commit**

```bash
git add docs/README.md docs/superpowers/specs/2026-09-03-survidle-realism-roadmap.md docs/superpowers/specs/2026-09-05-survidle-year-loop-design.md docs/superpowers/specs/2026-09-04-survidle-idle-curve-design.md docs/superpowers/specs/2026-09-06-survidle-tables-audit-design.md
git commit -m "docs(survidle): the tables audit as built - the readings before and after, the handbook table in the roadmap, the flags annotated, the carry recorded, the README's numbers moved"
```
