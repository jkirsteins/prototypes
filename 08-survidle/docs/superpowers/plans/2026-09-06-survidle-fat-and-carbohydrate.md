# Survidle fat and carbohydrate implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give a lone survivor the fat and carbohydrate paths the handbooks describe (marrow, seasonal carcass fat that must be rendered, oily fish and roe, eggs, winter berries, pine inner bark, roots, sap, seaweed), with auto-eat that closes the day with fat, a report that names why a survivor starved, and no change to the nutrition model beyond a lean share per food.

**Architecture:** The lean ceiling stays the one rule; every food gets a `leanShare` and the berry gut rule becomes a per-food `GUT` table in a new `src/sim/gut.ts` that replaces `berries.ts` and `lean.ts`'s counters. New foods and items follow the existing item tables; new tasks follow the task registration list below, one seam at a time; seasonal stocks (nests, roots) sit on the region state and reset in `dailyCamp` on their day of year; the year script gains a `--without=<source>` probe through a small `src/sim/probe.ts`. Every task ends green on `npm test` and is committed on its own.

**Tech Stack:** TypeScript, Vite, vitest (`npm test`), vite-node scripts (`npm run reference`, `npm run year`, `npm run horizon`). Biome lint from the repo root.

**Spec:** `08-survidle/docs/superpowers/specs/2026-09-06-survidle-fat-and-carbohydrate-design.md`

## Global Constraints

- Work in `08-survidle/` of the worktree on branch `survidle/fat-and-carbohydrate`; stage with explicit paths, never `git add -A`.
- The nutrition model does not grow: kilocalories are the one reserve, `LEAN_KCAL_PER_DAY` stays 1,600, and the only per-food facts are `kcalPerKg`, `portionKg`, `sickChance`, `leanShare` and a `GUT` ceiling. No protein, carbohydrate or vitamin reserves.
- The lean-share table is the spec's, verbatim: raw and cooked meat 1.0, dried meat 1.0, lean fish 1.0, oily fish 0.6, roe 0.5, eggs 0.4, fat 0, berries 0, bark flour 0, cooked roots 0, seaweed 0. Oily fish is one class defined once (1,500 kcal/kg, 0.6); a species carries only `oily: true` and its `spawn` window.
- Every constant carries its handbook line in the comment beside it. No constant an earlier item set to a handbook value moves (the tables audit's foods, rates and stock).
- Comments explain and never chronicle. No em dashes or non-typable unicode anywhere. Log lines use the voice templates (`{You} {have}`).
- **The task registration list.** A new `TaskId` is not done until it is in: `TaskId` and `TASK_IDS` in `src/sim/types.ts` (the `tests/skills.test.ts` count moves with it); `checkRaw` and `complete` in `src/sim/tasks.ts`, and `LOCATED` or `CARRIED` and `WORK_TASKS` there; `toolFor` if it swings a tool; `GROUND_OF` or a `resolveCell` branch, `CAMP_BOUND` if it is camp work, `DOING` and `yieldItem`/`yieldItems` in `src/sim/intent.ts`; `COUNT_WORDS` in `src/sim/orders.ts`; `skillOf`, `masteryKey` and `MASTERY_KEYS` in `src/sim/skills.ts`; `intentGroups` in `src/ui/dopanel.ts`; a `RECOMMENDED` entry and a capability row in `src/sim/capabilities.ts` where the spec names a level. `tests/ladder.test.ts` (every orderable task has a gate skill), `tests/skills.test.ts` and `tests/capabilities.test.ts` are the guards; run them.
- `npm test` must be green before every commit; the pre-commit hook runs biome lint and `tsc --noEmit`.
- Commit messages: `type(survidle): what changed, in the house's declarative style`, ending with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>` and `Claude-Session: https://claude.ai/code/session_01352zAHUpQPBdTDeXJ5SWVM`.
- The year and lineage scripts take minutes; run them in the background with output to a file under the SDD workspace, never under the repo.

---

### Task 1: The lean share and the gut table

**Files:**
- Modify: `src/sim/items.ts:32-60` (`FoodId`, `FOODS`, `LEAN_FOODS` removed, `AUTO_EAT_ORDER` untouched here)
- Create: `src/sim/gut.ts` (replaces `src/sim/berries.ts` and the counter half of `src/sim/lean.ts`)
- Delete: `src/sim/berries.ts`; shrink `src/sim/lean.ts` to `LEAN_KCAL_PER_DAY`'s reader (`leanRefused`, `creditLean` move to `gut.ts`)
- Modify: `src/sim/types.ts:288-290` (`Player.berriesToday` and `leanToday` become `gut`), `src/sim/newgame.ts`, `src/sim/save.ts`
- Modify: `src/sim/actions.ts:22-76` (`edible`, `eat`), `src/sim/water.ts:31` (`berriesOverloaded`), `src/ui/panels.ts` (the eat row's reasons), `src/sim/tables.ts:110-118` (`BERRY` keeps its picking numbers; the gut numbers move to `GUT`)
- Test: `tests/gut.test.ts` (new), `tests/lean.test.ts`, `tests/species.test.ts`

**Interfaces:**
- Produces: `FOODS[food].leanShare: number`; `export const GUT: Partial<Record<FoodId, { fullCreditKg: number; refuseKg: number }>>` in `items.ts` with `berries: { fullCreditKg: 1.2, refuseKg: 2 }`; `Player.gut: { day: number; kg: Partial<Record<FoodId, number>>; leanKcal: number }`; in `gut.ts`: `gutEatenToday(p, minute, food): number`, `gutRefused(p, minute, food): boolean`, `gutOverloaded(p, minute): boolean` (any capped food past its full credit today), `creditGut(p, minute, food, kg): { kg: number; credit: number }` (kilos taken up to refusal and the credit share 1 or 0.5), `leanEatenToday(p, minute)`, `leanRefused(p, minute)`, `creditLean(p, minute, kcal)`. `LEAN_FOODS` is gone: a food is lean to the extent of its share.

- [ ] **Step 1: Write the failing tests**

Create `tests/gut.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { Rng } from "../src/rng";
import { eat, edible } from "../src/sim/actions";
import { creditGut, creditLean, gutEatenToday, gutRefused, leanEatenToday, leanRefused } from "../src/sim/gut";
import { addItem } from "../src/sim/inventory";
import { FOODS, GUT, LEAN_KCAL_PER_DAY } from "../src/sim/items";
import { newGame } from "../src/sim/newgame";

describe("the gut table and the lean share", () => {
  it("every food carries a lean share from the spec's table and berries keep their ceiling", () => {
    expect(FOODS.rawMeat.leanShare).toBe(1);
    expect(FOODS.driedMeat.leanShare).toBe(1);
    expect(FOODS.cookedFish.leanShare).toBe(1);
    expect(FOODS.fat.leanShare).toBe(0);
    expect(FOODS.berries.leanShare).toBe(0);
    expect(GUT.berries).toEqual({ fullCreditKg: 1.2, refuseKg: 2 });
    expect(LEAN_KCAL_PER_DAY).toBe(1600);
  });

  it("a capped food credits in full to its line, half to its refusal, and nothing past it; the day roll clears it", () => {
    const { state } = newGame(17);
    const p = state.player;
    const a = creditGut(p, state.minute, "berries", 1.0);
    expect(a).toEqual({ kg: 1.0, credit: 1 });
    const b = creditGut(p, state.minute, "berries", 0.4);
    expect(b.kg).toBeCloseTo(0.4, 6);
    expect(b.credit).toBeCloseTo((0.2 * 1 + 0.2 * 0.5) / 0.4, 6);
    expect(gutEatenToday(p, state.minute, "berries")).toBeCloseTo(1.4, 6);
    creditGut(p, state.minute, "berries", 1.0);
    expect(gutRefused(p, state.minute, "berries")).toBe(true);
    expect(gutEatenToday(p, state.minute, "berries")).toBeCloseTo(2.0, 6);
    expect(gutEatenToday(p, state.minute + 1440, "berries")).toBe(0);
  });

  it("the lean ceiling books a food's share: a 1,000 kcal portion at share 0.6 costs 600 of the day's 1,600", () => {
    const { state } = newGame(17);
    const p = state.player;
    expect(creditLean(p, state.minute, 1000, 0.6)).toBe(1000);
    expect(leanEatenToday(p, state.minute)).toBe(600);
    expect(creditLean(p, state.minute, 2000, 1)).toBe(1000);
    expect(leanRefused(p, state.minute)).toBe(true);
    expect(creditLean(p, state.minute, 500, 0)).toBe(500);
  });

  it("eating keeps its shape: berries past two kilos are refused, lean meat past the ceiling is refused, fat never is", () => {
    const { state, world } = newGame(17);
    const p = state.player;
    p.kcal = 100;
    addItem(p.pack, "berries", 3);
    addItem(p.pack, "cookedMeat", 5);
    addItem(p.pack, "fat", 1);
    const rng = new Rng(1);
    let n = 0;
    while (edible(state, "berries") && n < 20 && eat(state, world, "berries", rng)) n++;
    expect(gutEatenToday(p, state.minute, "berries")).toBeCloseTo(2, 6);
    expect(edible(state, "berries")).toBe(false);
    n = 0;
    while (edible(state, "cookedMeat") && n < 40 && eat(state, world, "cookedMeat", rng)) n++;
    expect(leanEatenToday(p, state.minute)).toBeCloseTo(LEAN_KCAL_PER_DAY, 0);
    expect(edible(state, "cookedMeat")).toBe(false);
    expect(edible(state, "fat")).toBe(true);
  });
});
```

Update `tests/lean.test.ts`: drop the `LEAN_FOODS` import and its assertion; assert instead `FOODS.cookedMeat.leanShare === 1 && FOODS.fat.leanShare === 0`; keep the rest, replacing `leanEatenToday` import from `../src/sim/lean` with `../src/sim/gut`. `tests/species.test.ts`: unchanged.

- [ ] **Step 2: Run to see them fail**

Run: `npx vitest run tests/gut.test.ts tests/lean.test.ts`
Expected: FAIL (no `gut.ts`, no `leanShare`).

- [ ] **Step 3: Implement**

`src/sim/items.ts`:

```ts
/**
 * Every food: its kcal, its portion, its sick chance, and its lean share -
 * the part of its kcal that counts toward LEAN_KCAL_PER_DAY. The share is
 * the spec's table (fat and carbohydrate design, section 1): an
 * anti-overconsumption rule, not chemistry. Lean meat and lean fish are
 * all lean; fat and the plants none of it; the new foods sit between.
 */
export const FOODS: Record<FoodId, { kcalPerKg: number; portionKg: number; sickChance: number; leanShare: number }> = {
  rawMeat: { kcalPerKg: 1100, portionKg: 0.3, sickChance: 0.25, leanShare: 1 },
  cookedMeat: { kcalPerKg: 1100, portionKg: 0.3, sickChance: 0, leanShare: 1 },
  driedMeat: { kcalPerKg: 3300, portionKg: 0.15, sickChance: 0, leanShare: 1 },
  cookedFish: { kcalPerKg: 1000, portionKg: 0.3, sickChance: 0, leanShare: 1 },
  berries: { kcalPerKg: 450, portionKg: 0.2, sickChance: 0, leanShare: 0 },
  fat: { kcalPerKg: 9000, portionKg: 0.1, sickChance: 0, leanShare: 0 },
};
/**
 * The gut's ceilings by food: full credit to the first line, half to the
 * second, none past it. Berries are the Swedish handbook's two litres a
 * day, about 1.2 kg; later foods add their own rows.
 */
export const GUT: Partial<Record<FoodId, { fullCreditKg: number; refuseKg: number }>> = {
  berries: { fullCreditKg: 1.2, refuseKg: 2 },
};
```

Remove `LEAN_FOODS`. Remove `fullCreditKg` and `refuseKg` from `BERRY` in `tables.ts` (keep `kcalPerKg` and `pickKgPerHour`); grep the tree for `BERRY.fullCreditKg`/`BERRY.refuseKg` and point each at `GUT.berries!`.

Create `src/sim/gut.ts`:

```ts
/**
 * What the body will take in a day: a ceiling per capped food (GUT) and the
 * lean ceiling on the lean share of everything (LEAN_KCAL_PER_DAY). One
 * counter on the player, reset with the day number.
 */
import { dayNumber } from "./calendar";
import { type FoodId, GUT, LEAN_KCAL_PER_DAY } from "./items";
import type { Player } from "./types";

function today(p: Player, minute: number): Player["gut"] {
  const day = dayNumber(minute);
  if (p.gut.day !== day) p.gut = { day, kg: {}, leanKcal: 0 };
  return p.gut;
}

export function gutEatenToday(p: Player, minute: number, food: FoodId): number {
  return p.gut.day === dayNumber(minute) ? (p.gut.kg[food] ?? 0) : 0;
}

export function gutRefused(p: Player, minute: number, food: FoodId): boolean {
  const cap = GUT[food];
  return cap !== undefined && gutEatenToday(p, minute, food) >= cap.refuseKg - 1e-9;
}

/** True once any capped food is past its full-credit line today: the water cost of a gut that is turning. */
export function gutOverloaded(p: Player, minute: number): boolean {
  return (Object.keys(GUT) as FoodId[]).some((f) => gutEatenToday(p, minute, f) > GUT[f]!.fullCreditKg + 1e-9);
}

/** Books kilos of a capped food: the kilos the gut takes (to refusal) and the credit share over them (1 to the line, 0.5 past it). An uncapped food takes everything at 1. */
export function creditGut(p: Player, minute: number, food: FoodId, kg: number): { kg: number; credit: number } {
  const cap = GUT[food];
  if (!cap) return { kg, credit: 1 };
  const g = today(p, minute);
  const before = g.kg[food] ?? 0;
  const take = Math.max(0, Math.min(kg, cap.refuseKg - before));
  const full = Math.max(0, Math.min(take, cap.fullCreditKg - before));
  g.kg[food] = before + take;
  const credit = take > 0 ? (full + (take - full) / 2) / take : 0;
  return { kg: take, credit };
}

export function leanEatenToday(p: Player, minute: number): number {
  return p.gut.day === dayNumber(minute) ? p.gut.leanKcal : 0;
}

export function leanRefused(p: Player, minute: number): boolean {
  return leanEatenToday(p, minute) >= LEAN_KCAL_PER_DAY - 1e-9;
}

/** Books a portion's kcal against the lean ceiling by its share and returns what the body takes: the lean part only up to the room left, the rest whole. */
export function creditLean(p: Player, minute: number, kcal: number, share: number): number {
  const g = today(p, minute);
  const lean = kcal * share;
  const room = Math.max(0, LEAN_KCAL_PER_DAY - g.leanKcal);
  const taken = Math.min(lean, room);
  g.leanKcal += taken;
  return kcal - lean + taken;
}
```

Delete `src/sim/berries.ts` and `src/sim/lean.ts` (move `LEAN_KCAL_PER_DAY`'s comment to `items.ts`, where the constant already lives); grep for their imports (`actions.ts`, `water.ts`, `panels.ts`, tests) and re-point them at `gut.ts`.

`src/sim/types.ts` `Player`: replace `berriesToday` and `leanToday` with `/** What the gut has taken today: kilos per capped food and the lean kcal, reset with the day. */ gut: { day: number; kg: Partial<Record<FoodId, number>>; leanKcal: number };` (import `FoodId` type from `./items` if not already; if that creates a cycle, declare `gut.kg` as `Partial<Record<string, number>>`). `newgame.ts`: `gut: { day: 1, kg: {}, leanKcal: 0 }`. `save.ts`: replace the two defaults with:

```ts
  p.gut ??= { day: 0, kg: {}, leanKcal: 0 };
  delete (p as { berriesToday?: unknown }).berriesToday;
  delete (p as { leanToday?: unknown }).leanToday;
```

`src/sim/actions.ts`:

```ts
/** A food the body will take right now: a capped food past its refusal, or a lean food past the ceiling, is refused. */
export function edible(state: GameState, food: FoodId): boolean {
  const p = state.player;
  if (gutRefused(p, state.minute, food)) return false;
  if (FOODS[food].leanShare > 0 && leanRefused(p, state.minute)) return false;
  return true;
}

export function eat(state: GameState, world: World, food: FoodId, rng: Rng): boolean {
  const p = state.player;
  const def = FOODS[food];
  if (!edible(state, food)) return false;
  const invs = [p.pack, herePile(state, world)];
  const have = totalQty(invs, food);
  if (have <= 1e-9) return false;
  const wasFull = gutEatenToday(p, state.minute, food) > (GUT[food]?.fullCreditKg ?? Number.POSITIVE_INFINITY) + 1e-9;
  const taken = creditGut(p, state.minute, food, Math.min(def.portionKg, have));
  const kg = taken.kg;
  if (kg <= 1e-9) return false;
  let gain = kg * def.kcalPerKg * taken.credit;
  if (GUT[food]) {
    if (!wasFull && gutEatenToday(p, state.minute, food) > GUT[food]!.fullCreditKg + 1e-9) log(state, "{Your} stomach is turning.", "bad");
    if (gutRefused(p, state.minute, food)) log(state, `{You} cannot face another ${GUT_WORD[food] ?? ITEM_NAMES[food]}.`, "bad");
  }
  if (def.leanShare > 0) {
    const wasRefused = leanRefused(p, state.minute);
    gain = creditLean(p, state.minute, gain, def.leanShare);
    if (!wasRefused && leanRefused(p, state.minute)) log(state, "Lean meat is not filling {you}. {You} {need} fat.", "bad");
  }
  let left = kg;
  for (const inv of invs) {
    if (left <= 1e-9) break;
    left -= removeItem(inv, food, left);
  }
  const room = KCAL_FULL - p.kcal;
  if (gain <= room) p.kcal += gain;
  else {
    p.kcal = KCAL_FULL;
    p.fat = clamp(p.fat + (gain - room), 0, body(state).fatFull);
  }
  creditEaten(state, gain);
  if (def.sickChance && p.sick === 0 && rng.chance(def.sickChance)) {
    p.sick = 48 * 60;
    log(state, "The raw meat turns {your} stomach. A fever follows.", "bad");
  }
  return true;
}
```

with `const GUT_WORD: Partial<Record<FoodId, string>> = { berries: "berry" };` beside it (later foods add their word). `water.ts`: `berriesOverloaded(p, state.minute)` becomes `gutOverloaded(p, state.minute)`. `panels.ts`'s eat row: the reason is `GUT[f] && gutRefused(...) ? "not another ${GUT_WORD} today" : "not more lean meat today"`; export `GUT_WORD` from `actions.ts` for it, or move both reasons into a `refusalReason(state, food)` in `actions.ts` that the row and nothing else reads (preferred).

- [ ] **Step 4: Run the tests**

Run: `npm test`
Expected: PASS; `tests/ui.test.ts`'s lean-refusal row test and the berry tests read the same reasons as before.

- [ ] **Step 5: Commit**

```bash
git add src/sim/items.ts src/sim/gut.ts src/sim/actions.ts src/sim/water.ts src/sim/types.ts src/sim/newgame.ts src/sim/save.ts src/sim/tables.ts src/ui/panels.ts tests/gut.test.ts tests/lean.test.ts tests/species.test.ts
git rm -q src/sim/berries.ts src/sim/lean.ts
git commit -m "feat(survidle): every food carries a lean share and the gut's ceilings are one table - the berry rule generalised, the lean ceiling booked by share"
```

---

### Task 2: Auto-eat closes the day with fat

**Files:**
- Modify: `src/sim/items.ts` (`AUTO_EAT_ORDER`), `src/sim/actions.ts:78-85` (`autoEat`), `src/sim/body.ts:389-398` (`hungryStep`) and `canFeed`
- Test: `tests/gut.test.ts`, `tests/needs.test.ts`

**Interfaces:**
- Produces: `autoEat` walks the order until the reserve is at or over `HUNGRY_UNDER` (1,800) or nothing is edible; a refused food is skipped, not a stop; `export const HUNGRY_LINE = 1800` in `actions.ts` read by `autoEat` and `body.ts`'s `HUNGRY_UNDER` (which becomes an import of it). `AUTO_EAT_ORDER` stays least valuable first with fat last, but the walk is what changes.

- [ ] **Step 1: Write the failing test**

Append to `tests/gut.test.ts`:

```ts
describe("auto-eat closes the day with fat", () => {
  it("a body at the lean wall with fat at hand eats the fat, and stops once the hungry line is passed", () => {
    const { state, world } = newGame(17);
    const p = state.player;
    p.kcal = 100;
    p.gut = { day: 1, kg: {}, leanKcal: LEAN_KCAL_PER_DAY };
    addItem(p.pack, "cookedMeat", 5);
    addItem(p.pack, "fat", 1);
    autoEat(state, world, new Rng(1));
    expect(p.kcal).toBeGreaterThanOrEqual(1800);
    expect(qty(p.pack, "cookedMeat")).toBe(5);
    expect(qty(p.pack, "fat")).toBeLessThan(1);
    expect(qty(p.pack, "fat")).toBeGreaterThan(0.5);
  });

  it("lean food is eaten first while the ceiling has room, so the fat is kept", () => {
    const { state, world } = newGame(17);
    const p = state.player;
    p.kcal = 1500;
    addItem(p.pack, "cookedMeat", 5);
    addItem(p.pack, "fat", 1);
    autoEat(state, world, new Rng(1));
    expect(p.kcal).toBeGreaterThanOrEqual(1800);
    expect(qty(p.pack, "fat")).toBe(1);
    expect(qty(p.pack, "cookedMeat")).toBeLessThan(5);
  });
});
```

(imports: `autoEat` from `../src/sim/actions`, `qty` from `../src/sim/inventory`.)

- [ ] **Step 2: Run to see it fail**

Run: `npx vitest run tests/gut.test.ts`
Expected: FAIL (the first test stops after one bite).

- [ ] **Step 3: Implement**

`src/sim/actions.ts`:

```ts
/** The reserve under which the body eats on its own. */
export const HUNGRY_LINE = 1800;

/**
 * Eats when the reserve runs low: the order is least valuable first and fat
 * last, and the walk goes on until the line is passed or nothing is left
 * that the body will take. A refused food (a capped one past its line, lean
 * food past the ceiling) is skipped, not a stop, so a body at the lean wall
 * with fat at hand eats the fat rather than starving beside it, and a body
 * with room under the ceiling eats the lean food and keeps the fat.
 */
export function autoEat(state: GameState, world: World, rng: Rng): void {
  const p = state.player;
  if (!p.autoEat) return;
  let guard = 0;
  while (p.kcal < HUNGRY_LINE && guard++ < 200) {
    let ate = false;
    for (const food of AUTO_EAT_ORDER) {
      if (eat(state, world, food, rng)) {
        ate = true;
        break;
      }
    }
    if (!ate) return;
  }
}
```

`src/sim/body.ts`: `HUNGRY_UNDER` becomes `export const HUNGRY_UNDER = HUNGRY_LINE;` (import from `./actions`), and `hungryStep` calls `autoEat`'s walk rather than its own single-bite loop:

```ts
function hungryStep(state: GameState, world: World, cal: Calendar, rng: Rng, it: Intent): Step | null {
  const before = state.player.kcal;
  autoEat(state, world, rng);
  if (state.player.kcal > before) return null;
  if (cellOf(state, world) === it.campCell) return null;
  const camp = pile(state, it.campCell);
  if (!AUTO_EAT_ORDER.some((f) => edible(state, f) && qty(camp, f) > 1e-9)) return null;
  if (!check(state, world, cal, "walk", `cell:${it.campCell}`).ok) return null;
  return walkStep(state, world, it.campCell, " to eat");
}
```

(`autoEat` reads `p.autoEat`; the runner's hungry step must eat regardless, so give `autoEat` a second parameter `force = false` that skips the `p.autoEat` check when true, and pass `true` here.)

- [ ] **Step 4: Run the tests**

Run: `npm test`
Expected: PASS; `tests/needs.test.ts` may pin the number of bites a hungry step takes, re-pin with a comment.

- [ ] **Step 5: Commit**

```bash
git add src/sim/actions.ts src/sim/body.ts tests/gut.test.ts tests/needs.test.ts
git commit -m "feat(survidle): auto-eat walks its order until the hungry line is passed, so a body at the lean wall eats the fat beside it and one with room keeps it"
```

---

### Task 3: The carcass: seasonal fat, raw fat that is rendered, marrow

**Files:**
- Modify: `src/sim/species.ts` (peak `fatKg` values; `export function fatSeason(s, month)`), `src/sim/skills.ts:246-267` (`huntExtras` scales `fatKg`)
- Modify: `src/sim/types.ts` (`KgItem` gains `rawFat`, `CountItem` gains `crackedBone`, `PerishableId` gains `rawFat`, `TaskId` gains `crack`, `TASK_IDS`)
- Modify: `src/sim/items.ts` (`ITEM_KG`, `KG_ITEMS`, `ITEM_NAMES`, `SPOIL_HOURS.rawFat = 72`, the needle recipe `alt: "crackedBone"`, `MARROW_KG_PER_BONE = 0.1`)
- Modify: `src/sim/tasks.ts` (hunt completion produces `rawFat`; `cook` takes `rawFat` and renders it to `fat`; new `crack` task), `src/sim/intent.ts` (`yieldItem` cook rawFat, `yieldItems` hunt list, `CAMP_BOUND` crack, `DOING`), `src/sim/orders.ts` (`COUNT_WORDS`), `src/sim/skills.ts` (`skillOf` crack building, `masteryKey`, `MASTERY_KEYS.building` gains `crack` and `cook:rawFat`), `src/ui/dopanel.ts` (Camp group gains `cook rawFat` and `crack`), `src/sim/ledger.ts` (`marrow` source, Task 9 formalises the rows), `src/sim/save.ts` (nothing new on the player; a `rawFat` stack default is `{}`)
- Test: `tests/carcass.test.ts` (new), `tests/species.test.ts`

**Interfaces:**
- Produces: `fatSeason(s: Species, month: number): number` (the class curve: ungulates 1.0 Aug to Nov, 0.5 Dec to Feb, 0.2 Mar to May, 0.6 Jun to Jul; bear 1.0 Sep and Oct, 0.3 Apr and May, 0.6 Jun to Aug, and 0 while denned; beaver 0.8; other mammals 0.5); `marrowFactor(season: number): number` (1 at 1, 0.75 at 0.5, 0.4 at 0.2, linear between, 0.4 below 0.2); `huntExtras(...).fatKg` is the peak times the season, rounded to a tenth; a hunt produces `rawFat` not `fat`; `cook` with `arg = "rawFat"` consumes raw fat and produces `fat` ("Render fat", 10 minutes a kilo, needs a lit fire); `crack` at camp with a stone or an axe in reach, 20 minutes, consumes one `bone`, produces `MARROW_KG_PER_BONE * marrowFactor(fatSeason of the bone's animal)` of `fat` and one `crackedBone`. Bones do not remember their animal: the crack reads the region's most-killed large game this year from `state.stats.kills`, else the ungulate curve at the month (say so in the comment).

- [ ] **Step 1: Write the failing tests**

Create `tests/carcass.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { Rng } from "../src/rng";
import { calendar } from "../src/sim/calendar";
import { addItem, qty } from "../src/sim/inventory";
import { MARROW_KG_PER_BONE, RECIPES, SPOIL_HOURS } from "../src/sim/items";
import { newGame } from "../src/sim/newgame";
import { regionState } from "../src/sim/regionstate";
import { huntExtras } from "../src/sim/skills";
import { fatSeason, marrowFactor, SPECIES_DEFS } from "../src/sim/species";
import { check, startTask, stepTask } from "../src/sim/tasks";

describe("the carcass", () => {
  it("fat peaks are the handbooks' animals and the season scales them", () => {
    expect(SPECIES_DEFS.deer.yields?.fatKg).toBe(2);
    expect(SPECIES_DEFS.reindeer.yields?.fatKg).toBe(6);
    expect(SPECIES_DEFS.elk.yields?.fatKg).toBe(15);
    expect(SPECIES_DEFS.bear.yields?.fatKg).toBe(25);
    expect(SPECIES_DEFS.beaver.yields?.fatKg).toBe(3);
    expect(fatSeason("elk", 9)).toBe(1);
    expect(fatSeason("elk", 0)).toBe(0.5);
    expect(fatSeason("elk", 3)).toBe(0.2);
    expect(fatSeason("elk", 6)).toBe(0.6);
    expect(fatSeason("bear", 9)).toBe(1);
    expect(fatSeason("bear", 3)).toBe(0.3);
    expect(fatSeason("beaver", 3)).toBe(0.8);
    expect(fatSeason("fox", 3)).toBe(0.5);
  });

  it("marrow follows the animal's condition at 1, 0.75 and 0.4", () => {
    expect(marrowFactor(1)).toBe(1);
    expect(marrowFactor(0.5)).toBe(0.75);
    expect(marrowFactor(0.2)).toBe(0.4);
    expect(marrowFactor(0.35)).toBeCloseTo(0.575, 6);
    expect(marrowFactor(0.1)).toBe(0.4);
  });

  it("a kill in April drops a fifth of the fat, raw, and it rots in three warm days unless rendered", () => {
    const { state } = newGame(17);
    const april = calendar(0);
    expect(april.month).toBe(3);
    const x = huntExtras(state, "elk", april.month);
    expect(x.fatKg).toBeCloseTo(3, 6);
    expect(SPOIL_HOURS.rawFat).toBe(72);
  });

  it("render fat is the cook task on raw fat, at a lit fire, ten minutes a kilo", () => {
    const { state, world } = newGame(17);
    const st = regionState(state, world, state.player.region);
    st.structures.firePit = true;
    st.fire.lit = true;
    st.fire.fuelKg = 10;
    addItem(state.player.pack, "rawFat", 2);
    const cal = calendar(0);
    const o = check(state, world, cal, "cook", "rawFat");
    expect(o.ok).toBe(true);
    expect(o.label).toBe("Render fat");
    expect(o.duration).toBe(10);
    startTask(state, world, cal, "cook", "rawFat");
    for (let m = 0; m < 10 && state.task; m++) stepTask(state, world, cal, new Rng(m), 1);
    expect(qty(state.player.pack, "rawFat")).toBeCloseTo(1, 6);
    expect(qty(state.player.pack, "fat")).toBeCloseTo(1, 6);
  });

  it("cracking a bone gives marrow as fat and a cracked bone that still makes a needle", () => {
    const { state, world } = newGame(17);
    addItem(state.player.pack, "bone", 2);
    addItem(state.player.pack, "stone", 1);
    const cal = calendar(0);
    state.stats.kills.elk = 1;
    const o = check(state, world, cal, "crack");
    expect(o.ok).toBe(true);
    expect(o.duration).toBe(20);
    startTask(state, world, cal, "crack");
    for (let m = 0; m < 20 && state.task; m++) stepTask(state, world, cal, new Rng(m), 1);
    expect(qty(state.player.pack, "bone")).toBe(1);
    expect(qty(state.player.pack, "crackedBone")).toBe(1);
    expect(qty(state.player.pack, "fat")).toBeCloseTo(MARROW_KG_PER_BONE * marrowFactor(fatSeason("elk", cal.month)), 6);
    expect(RECIPES.needle.needs[0]).toEqual({ item: "bone", qty: 1, alt: "crackedBone" });
  });
});
```

`huntExtras` gains an optional `month` parameter (defaulting to the state's current month through `calendar(state.minute, state.startDoy).month`); the test passes it explicitly.

- [ ] **Step 2: Run to see them fail**

Run: `npx vitest run tests/carcass.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

`src/sim/species.ts`: set `fatKg` to 2 (deer), 6 (reindeer), 15 (elk), 25 (bear), 3 (beaver) with a comment "peak autumn fat, the fat and carbohydrate design, section 2"; add:

```ts
/**
 * Fat by season, as a share of the peak (fat and carbohydrate design,
 * section 2): ungulates at full from August to November, half in winter, a
 * fifth from March to May and 0.6 through midsummer; a bear full before
 * denning, a third at emergence; a beaver near full all year; the rest of
 * the mammals at half. The figure abstracts suet, depot fat and other
 * fatty tissue; other offal is in the meat.
 */
export function fatSeason(s: Species, month: number): number {
  switch (s) {
    case "deer": case "reindeer": case "elk":
      return month >= 7 && month <= 10 ? 1 : month === 11 || month <= 1 ? 0.5 : month <= 4 ? 0.2 : 0.6;
    case "bear":
      return month === 8 || month === 9 ? 1 : month === 3 || month === 4 ? 0.3 : month >= 5 && month <= 7 ? 0.6 : 0;
    case "beaver": return 0.8;
    default: return SPECIES_DEFS[s].kind === "mammal" ? 0.5 : 0;
  }
}

/** Marrow is the last fat to go: 1 at a full animal, 0.75 at half, 0.4 at a fifth, linear between and no lower. */
export function marrowFactor(season: number): number {
  if (season >= 1) return 1;
  if (season >= 0.5) return 0.75 + ((season - 0.5) / 0.5) * 0.25;
  if (season >= 0.2) return 0.4 + ((season - 0.2) / 0.3) * 0.35;
  return 0.4;
}
```

`src/sim/skills.ts` `huntExtras(state, species, month = calendar(state.minute, state.startDoy).month)`: `fatKg: Math.round(y.fatKg * fatSeason(species, month) * 10) / 10` (import `fatSeason`, `calendar`).

`src/sim/types.ts`: `KgItem` gains `"rawFat"`, `CountItem` gains `"crackedBone"`, `PerishableId` and `PERISHABLES` gain `"rawFat"`, `TaskId` and `TASK_IDS` gain `"crack"` (the count test moves to 37). `src/sim/items.ts`: `ITEM_KG.rawFat = 1`, `ITEM_KG.crackedBone = 0.3`, `KG_ITEMS` adds `rawFat`, `ITEM_NAMES` adds `rawFat: "raw fat"`, `crackedBone: "cracked bone"`, `SPOIL_HOURS.rawFat = 72` with the comment "raw fat keeps like cooked meat and no longer; rendered it keeps for the winter", `needle.needs[0] = { item: "bone", qty: 1, alt: "crackedBone" }`, and

```ts
/** Kochanski: marrow from the larger bones. A tenth of a kilo a bone at a full animal; marrowFactor scales it by the season. */
export const MARROW_KG_PER_BONE = 0.1;
```

`src/sim/tasks.ts` hunt completion: `if (x.fatKg) produce(state, world, "rawFat", x.fatKg);` and the credit line stays (fat kcal at the rendered value). `cook` check: `const food = (arg ?? "rawMeat") as "rawMeat" | "fish" | "rawFat"`, label `food === "rawFat" ? "Render fat" : \`Cook ${ITEM_NAMES[food]}\``, detail for fat "1 kg at a time; raw fat rots in three warm days, rendered it keeps"; completion: `produce(..., food === "rawMeat" ? "cookedMeat" : food === "fish" ? "cookedFish" : "fat", kg)`. New `crack` case in `checkRaw`:

```ts
    case "crack": {
      const o = needCamp(opt({ group: "camp", label: "Crack bones for marrow", detail: `${MARROW_KG_PER_BONE * 1000} g of marrow a bone at a fat animal, less in spring; the fragments still make a needle`, duration: 20, repeatable: true }));
      if (!o.ok) return o;
      if (totalQty(invs, "bone") < 1) return { ...o, ok: false, why: "no bones here" };
      if (totalQty(toolInvs, "stone") < 1 && !axeInHand(p)) return { ...o, ok: false, why: "needs a stone or the axe" };
      return o;
    }
```

and in `complete`:

```ts
    case "crack": {
      consume(invs, [{ item: "bone", qty: 1 }]);
      const kg = Math.round(MARROW_KG_PER_BONE * marrowFactor(fatSeason(marrowAnimal(state), cal.month)) * 1000) / 1000;
      produce(state, world, "fat", kg);
      produce(state, world, "crackedBone", 1);
      creditYield(state, "marrow", kg * FOODS.fat.kcalPerKg);
      log(state, `{You} {crack} a bone: ${Math.round(kg * 1000)} g of marrow.`, "good");
      return;
    }
```

with, beside it: `/** Bones do not remember their animal: the crack reads this year's most-killed large game, and the ungulate curve when there is none. */ function marrowAnimal(state: GameState): Species { ... }` picking the max of `state.stats.kills` over `LARGE_GAME` plus `"bear"`, defaulting to `"deer"`. Add `crack` to `WORK_TASKS`, `CARRIED`-or-`LOCATED` (neither: it is camp-bound and short; leave it out of both), `CAMP_BOUND` in `intent.ts`, `DOING.crack = () => "cracking bones"`, `COUNT_WORDS.crack = ["bone", "bones"]`, `yieldItem` for `cook` with `rawFat` returns `"fat"`, `yieldItems("hunt")` gains `"rawFat"`, `skillOf("crack") = "building"`, `masteryKey` returns `"crack"`, `MASTERY_KEYS.building` gains `"crack"` and `"cook:rawFat"`, the Do panel's Camp group gains `{ id: "cook", arg: "rawFat" }` and `{ id: "crack" }`, `ledger.ts` `YieldSource` gains `"marrow"` (and `emptyYield`, `SOURCE_ROWS` in `tables.ts` mapping it to `["hunting", "largeGame"]`; Task 9 revisits the rows). `orders.ts`'s cook keep on `rawFat` needs nothing new: `yieldItem("cook", "rawFat")` is `fat`, a stock.

- [ ] **Step 4: Run the tests**

Run: `npm test`
Expected: PASS; `tests/species.test.ts` pins bear's fat at 10, re-pin to 25 with the handbook line; the winter stock and year tests are untouched (they stock rendered `fat`).

- [ ] **Step 5: Commit**

```bash
git add src/sim/species.ts src/sim/skills.ts src/sim/types.ts src/sim/items.ts src/sim/tasks.ts src/sim/intent.ts src/sim/orders.ts src/sim/ledger.ts src/sim/tables.ts src/ui/dopanel.ts tests/carcass.test.ts tests/species.test.ts tests/skills.test.ts
git commit -m "feat(survidle): the carcass by season - fat peaks at the handbooks' animals and falls to a fifth by spring, comes off raw and rots unless rendered at the fire, and bones crack for marrow and still make a needle"
```

---

### Task 4: Lean and oily fish, and roe

**Files:**
- Modify: `src/sim/species.ts` (`SpeciesDef` gains `oily?: true` and `spawn?: [number, number]`; the fish entries), `src/sim/types.ts` (`KgItem` gains `oilyFish`, `cookedOilyFish`, `roe`; `PerishableId` too; `FoodId` in items gains `cookedOilyFish`, `roe`)
- Modify: `src/sim/items.ts` (`FOODS` rows, `ITEM_KG`, `KG_ITEMS`, `ITEM_NAMES`, `SPOIL_HOURS`, `AUTO_EAT_ORDER`), `src/sim/tasks.ts` (fish completion, the trap's take, `cook` on `oilyFish`), `src/sim/camp.ts` (the trap's draw records oily kilos), `src/sim/types.ts` (`RegionState.trap` gains `oilyKg`), `src/sim/save.ts`, `src/sim/intent.ts` (`yieldItem` cook oilyFish, `yieldItems("fish")` and `("emptyTrap")` lists), `src/ui/dopanel.ts` (Camp gains `cook oilyFish`), `src/sim/skills.ts` (`MASTERY_KEYS.building` gains `cook:oilyFish`), `src/sim/manual.ts` (the food line)
- Test: `tests/fish.test.ts` (new), `tests/trap.test.ts`

**Interfaces:**
- Produces: `SPECIES_DEFS[s].oily === true` for herring, char, trout; `spawn` windows: perch and pike `[3, 4]`, whitefish `[9, 10]`, char and trout `[8, 9]`, burbot `[0, 1]`, herring and cod `[2, 3]`; `export function inSpawn(s, month): boolean`; `export function fishItem(s): "fish" | "oilyFish"`; `FOODS.cookedOilyFish = { kcalPerKg: 1500, portionKg: 0.3, sickChance: 0, leanShare: 0.6 }`, `FOODS.roe = { kcalPerKg: 1600, portionKg: 0.2, sickChance: 0, leanShare: 0.5 }`; `ROE_SHARE = 0.1`; a catch in its window produces roe at that share of its kilos; the trap holds `kg` and `oilyKg` and the take produces both items; `AUTO_EAT_ORDER` becomes `["berries", "roe", "cookedFish", "cookedOilyFish", "cookedMeat", "driedMeat", "fat"]` (the plant foods join in Tasks 6 to 8).

- [ ] **Step 1: Write the failing tests**

Create `tests/fish.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { Rng } from "../src/rng";
import { calendar } from "../src/sim/calendar";
import { addItem, qty } from "../src/sim/inventory";
import { FOODS, ROE_SHARE } from "../src/sim/items";
import { newGame } from "../src/sim/newgame";
import { placeAtSpot } from "../src/sim/position";
import { regionState } from "../src/sim/regionstate";
import { fishItem, inSpawn, SPECIES_DEFS } from "../src/sim/species";
import { check, startTask, stepTask } from "../src/sim/tasks";
import { regionAt } from "../src/world/gen";

describe("lean and oily fish", () => {
  it("the class is defined once and a species carries only the flag and its window", () => {
    expect(FOODS.cookedOilyFish).toEqual({ kcalPerKg: 1500, portionKg: 0.3, sickChance: 0, leanShare: 0.6 });
    expect(FOODS.roe).toEqual({ kcalPerKg: 1600, portionKg: 0.2, sickChance: 0, leanShare: 0.5 });
    expect(ROE_SHARE).toBe(0.1);
    expect(fishItem("herring")).toBe("oilyFish");
    expect(fishItem("char")).toBe("oilyFish");
    expect(fishItem("trout")).toBe("oilyFish");
    expect(fishItem("whitefish")).toBe("fish");
    expect(fishItem("perch")).toBe("fish");
    expect(SPECIES_DEFS.perch.spawn).toEqual([3, 4]);
    expect(SPECIES_DEFS.char.spawn).toEqual([8, 9]);
    expect(inSpawn("perch", 3)).toBe(true);
    expect(inSpawn("perch", 6)).toBe(false);
    expect(inSpawn("burbot", 0)).toBe(true);
  });

  it("a perch caught in April brings roe at a tenth of its weight; a char caught brings oily fish", () => {
    const { state, world } = newGame(17);
    const st = regionState(state, world, state.player.region);
    const r = regionAt(world, state.player.region);
    placeAtSpot(state, world, state.player.region, "shore");
    state.player.tools.push({ id: "fishingSpear", durability: 100 });
    r.capacity.perch = 100000;
    st.pop.perch = 100000;
    const cal = calendar(0);
    let caught = 0;
    for (let i = 0; i < 20 && caught === 0; i++) {
      startTask(state, world, cal, "fish", "perch");
      for (let m = 0; m < 60 && state.task; m++) stepTask(state, world, cal, new Rng(i * 100 + m), 1);
      caught = qty(state.player.pack, "fish");
    }
    expect(caught).toBeGreaterThan(0);
    expect(qty(state.player.pack, "roe")).toBeCloseTo(caught * ROE_SHARE, 6);
    expect(qty(state.player.pack, "oilyFish")).toBe(0);
  });
});
```

(If the region has no perch capacity, choose a seed or set `r.capacity` and `st.pop` as shown; `placeAtSpot` is in `src/sim/position.ts`.) In `tests/trap.test.ts` add a test that a trap whose shore holds char stores `oilyKg` and the take produces `oilyFish`.

- [ ] **Step 2: Run to see them fail**

Run: `npx vitest run tests/fish.test.ts tests/trap.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

`src/sim/species.ts`: `SpeciesDef` gains `/** The oily class: 1,500 kcal/kg, a 0.6 lean share, defined once in FOODS. */ oily?: true;` and `/** Spawning months, 0-based inclusive; a catch inside yields roe. */ spawn?: [number, number];`; the `fish` helper passes `oily` and `spawn` through from `extra`; entries: perch `spawn: [3, 4]`, roach `[3, 4]`, pike `[3, 4]`, whitefish `[9, 10]`, char `oily: true, spawn: [8, 9]`, trout `oily: true, spawn: [8, 9]`, burbot `[0, 1]`, cod `[2, 3]`, saithe `[1, 2]`, herring `oily: true, spawn: [2, 3]`. Add:

```ts
export function fishItem(s: Species): "fish" | "oilyFish" {
  return SPECIES_DEFS[s].oily ? "oilyFish" : "fish";
}

export function inSpawn(s: Species, month: number): boolean {
  const w = SPECIES_DEFS[s].spawn;
  return w !== undefined && month >= w[0] && month <= w[1];
}
```

`src/sim/items.ts`: `FoodId` gains `"cookedOilyFish" | "roe"`; `FOODS` rows as the interface says, with the comment "oily fish is one class: herring, char, trout, salmon when it lands, about 1,500 kcal/kg with 0.6 lean; roe 1,600 at half lean, a tenth of a spawning catch, the spec's shortcut"; `export const ROE_SHARE = 0.1;`; `ITEM_KG` and `KG_ITEMS` gain `oilyFish`, `cookedOilyFish`, `roe` at 1; `ITEM_NAMES` "oily fish", "cooked oily fish", "roe"; `SPOIL_HOURS`: `oilyFish: 36, cookedOilyFish: 72, roe: 36`; `AUTO_EAT_ORDER` as the interface says. `types.ts`: the three ids in `KgItem`, `PerishableId`, `PERISHABLES`; `RegionState.trap` gains `oilyKg: number`. `save.ts`: `if (st.trap) st.trap.oilyKg ??= 0;`.

`tasks.ts` fish completion:

```ts
        const kg = fishKg(state, s) * yieldFactor(state, "fishing");
        const item = fishItem(s);
        produce(state, world, item, kg);
        creditYield(state, "fish", kg * FOODS[item === "fish" ? "cookedFish" : "cookedOilyFish"].kcalPerKg);
        if (inSpawn(s, cal.month)) {
          const roe = Math.round(kg * ROE_SHARE * 100) / 100;
          produce(state, world, "roe", roe);
          creditYield(state, "roe", roe * FOODS.roe.kcalPerKg);
          log(state, `${anAnimal(s, true)}, ${kg.toFixed(1)} kg, and ${Math.round(roe * 1000)} g of roe.`, "good");
        } else log(state, `${anAnimal(s, true)}, ${kg.toFixed(1)} kg.`, "good");
```

The trap's draw in `camp.ts`: where it adds `meatKg * kgFactor` to `st.trap.kg`, add the same to `st.trap.oilyKg` when `SPECIES_DEFS[s].oily`; `takeTrapFish` produces `oilyKg` as `oilyFish` and `kg - oilyKg` as `fish`, crediting each at its cooked value, and zeroes both. `cook` takes `"oilyFish"` to `"cookedOilyFish"` (label "Cook oily fish"). `yieldItem("cook", "oilyFish") = "cookedOilyFish"`, `yieldItems("fish") = ["fish", "oilyFish", "roe"]`, `yieldItems("emptyTrap") = ["fish", "oilyFish"]`; `ledger.ts` gains the `roe` source. Manual: the food line becomes "Hare alone starves you; you need fat: marrow, oily fish, eggs and roe in their season."

- [ ] **Step 4: Run the tests**

Run: `npm test`
Expected: PASS; `tests/species.test.ts`'s `AUTO_EAT_ORDER.at(-1) === "fat"` still holds.

- [ ] **Step 5: Commit**

```bash
git add src/sim/species.ts src/sim/items.ts src/sim/types.ts src/sim/tasks.ts src/sim/camp.ts src/sim/save.ts src/sim/intent.ts src/sim/skills.ts src/sim/ledger.ts src/sim/manual.ts src/ui/dopanel.ts tests/fish.test.ts tests/trap.test.ts tests/manual.test.ts
git commit -m "feat(survidle): fish are lean or oily by species and a spawning catch brings roe - one oily class at 1,500 kcal/kg and a 0.6 lean share"
```

---

### Task 5: Eggs

**Files:**
- Modify: `src/sim/types.ts` (`RegionState.nests: number`, `KgItem`/`PerishableId` gain `eggs`, `TaskId` gains `eggs`), `src/sim/items.ts` (`FOODS.eggs`, `EGG_CLUTCH_KG = 0.4`, `EGG_KG_PER_HOUR = 0.5`, `EGG_FROM_DOY = 120`, `EGG_TO_DOY = 181`, `SPOIL_HOURS.eggs = 240`, `AUTO_EAT_ORDER`), `src/sim/regionstate.ts`, `src/sim/save.ts`, `src/sim/camp.ts` (`dailyCamp` sets the stock on 1 May and clears it on 1 July), `src/sim/tasks.ts` (the `eggs` task), `src/sim/intent.ts` (`resolveCell`: the nearest shore cell when waterfowl nest here, else the heath), `src/sim/skills.ts`, `src/sim/orders.ts`, `src/ui/dopanel.ts`, `src/sim/ledger.ts`
- Test: `tests/eggs.test.ts` (new)

**Interfaces:**
- Produces: `export function nestsFor(world, state, region): number` in `camp.ts` (sum over `NESTING` species present of `capacity * density / 4`, `NESTING = ["mallard", "eider", "willowGrouse", "blackGrouse", "ptarmigan", "capercaillie", "hazelGrouse"]`); `RegionState.nests` in clutches; the `eggs` task under Foraging at a shore or heath cell in the window, 60 minutes, producing `min(EGG_KG_PER_HOUR * yieldFactor, nests * EGG_CLUTCH_KG)` of `eggs` and drawing the clutches taken; refused "the nests are empty" or "no eggs until May"; `FOODS.eggs = { kcalPerKg: 1500, portionKg: 0.2, sickChance: 0, leanShare: 0.4 }`; ledger source `eggs`.

- [ ] **Step 1: Write the failing test**

Create `tests/eggs.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { Rng } from "../src/rng";
import { calendar } from "../src/sim/calendar";
import { dailyCamp, nestsFor } from "../src/sim/camp";
import { qty } from "../src/sim/inventory";
import { EGG_CLUTCH_KG, EGG_FROM_DOY, EGG_KG_PER_HOUR, EGG_TO_DOY, FOODS } from "../src/sim/items";
import { newGame } from "../src/sim/newgame";
import { placeAtSpot } from "../src/sim/position";
import { regionState } from "../src/sim/regionstate";
import { check, startTask, stepTask } from "../src/sim/tasks";

describe("eggs", () => {
  it("nests are set on 1 May from the nesting birds and cleared on 1 July; the task takes half a kilo an hour until they are empty", () => {
    expect(FOODS.eggs).toEqual({ kcalPerKg: 1500, portionKg: 0.2, sickChance: 0, leanShare: 0.4 });
    expect([EGG_CLUTCH_KG, EGG_KG_PER_HOUR, EGG_FROM_DOY, EGG_TO_DOY]).toEqual([0.4, 0.5, 120, 181]);
    const { state, world } = newGame(17, EGG_FROM_DOY);
    const st = regionState(state, world, state.player.region);
    dailyCamp(state, world, calendar(0, EGG_FROM_DOY), new Rng(1), null);
    expect(st.nests).toBeCloseTo(nestsFor(world, state, state.player.region), 6);
    expect(st.nests).toBeGreaterThan(0);
    placeAtSpot(state, world, state.player.region, "shore");
    const cal = calendar(0, EGG_FROM_DOY);
    const o = check(state, world, cal, "eggs");
    expect(o.ok).toBe(true);
    expect(o.duration).toBe(60);
    const before = st.nests;
    startTask(state, world, cal, "eggs");
    for (let m = 0; m < 60 && state.task; m++) stepTask(state, world, cal, new Rng(m), 1);
    expect(qty(state.player.pack, "eggs")).toBeCloseTo(Math.min(EGG_KG_PER_HOUR, before * EGG_CLUTCH_KG), 6);
    expect(st.nests).toBeCloseTo(before - qty(state.player.pack, "eggs") / EGG_CLUTCH_KG, 6);
    st.nests = 0;
    expect(check(state, world, cal, "eggs").why).toBe("the nests are empty");
    dailyCamp(state, world, calendar(0, EGG_TO_DOY + 1), new Rng(2), null);
    expect(check(state, world, calendar(0, EGG_TO_DOY + 1), "eggs").why).toBe("no eggs until May");
  });
});
```

- [ ] **Step 2: Run to see it fail**

Run: `npx vitest run tests/eggs.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

`items.ts`: the constants with the comment "the Swedish handbook: eggs and young birds are easy to get, and only in a real emergency; May and June at this latitude, a clutch 0.4 kg, half a kilo an hour while the nests last"; `FOODS.eggs`; `AUTO_EAT_ORDER` becomes `["berries", "eggs", "roe", "cookedFish", "cookedOilyFish", "cookedMeat", "driedMeat", "fat"]`. `types.ts`: `RegionState.nests: number`, `eggs` in `KgItem`, `PerishableId`, `PERISHABLES`, `TaskId`, `TASK_IDS`. `regionstate.ts` default `nests: 0`; `save.ts` `st.nests ??= 0`. `camp.ts`:

```ts
/** The birds whose nests the spring gives: waterfowl at the shore, grouse on the heath. */
export const NESTING: Species[] = ["mallard", "eider", "willowGrouse", "blackGrouse", "ptarmigan", "capercaillie", "hazelGrouse"];

/** Clutches a region holds on 1 May: a clutch for every four nesting birds about. */
export function nestsFor(world: World, state: GameState, region: number): number {
  const r = regionAt(world, region);
  const st = regionState(state, world, region);
  let n = 0;
  for (const s of NESTING) if (r.capacity[s]) n += popOf(st, s) / 4;
  return n;
}
```

and in `dailyCamp`, per region: `if (cal.dayOfYear === EGG_FROM_DOY) st.nests = nestsFor(world, state, id); if (cal.dayOfYear === EGG_TO_DOY + 1) st.nests = 0;`. `tasks.ts`:

```ts
    case "eggs": {
      const shore = watersideCell(world, at);
      const heath = heathCell(world, at);
      const o = opt({ group: "gather", label: "Gather eggs", detail: `${EGG_KG_PER_HOUR} kg an hour from the nests; May and June, and the nests empty`, duration: 60, repeatable: true });
      if (!(shore || heath)) return { ...o, ok: false, why: "stand by the water or on the heath" };
      if (cal.dayOfYear < EGG_FROM_DOY || cal.dayOfYear > EGG_TO_DOY) return { ...o, ok: false, why: "no eggs until May" };
      if (st.nests <= 1e-9) return { ...o, ok: false, why: "the nests are empty" };
      return o;
    }
```

completion: `const kg = Math.min(EGG_KG_PER_HOUR * yieldFactor(state, "foraging"), st.nests * EGG_CLUTCH_KG); st.nests -= kg / EGG_CLUTCH_KG; produce(state, world, "eggs", kg); creditYield(state, "eggs", kg * FOODS.eggs.kcalPerKg);`. Registrations: `LOCATED` and `WORK_TASKS`; `resolveCell` branch: `if (task === "eggs") { const shore = spotOf(r, "shore"); const heath = spotOf(r, "heath"); const water = NESTING.some((s) => s === "mallard" || s === "eider").... }` simpler: prefer the shore spot when the region has capacity for mallard or eider, else the heath, else here; `DOING.eggs = () => "gathering eggs"`; `COUNT_WORDS.eggs = ["nest", "nests"]`; `yieldItem("eggs") = "eggs"`; `skillOf("eggs") = "foraging"`, `masteryKey` `"eggs"`, `MASTERY_KEYS.foraging` gains `"eggs"` and `POOL_KEY_CAP.foraging = 2` so the pool's capacity stays what it is; Do panel Gather gains `{ id: "eggs" }`; ledger source `eggs`.

- [ ] **Step 4: Run the tests**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/sim/items.ts src/sim/types.ts src/sim/regionstate.ts src/sim/save.ts src/sim/camp.ts src/sim/tasks.ts src/sim/intent.ts src/sim/skills.ts src/sim/orders.ts src/sim/ledger.ts src/ui/dopanel.ts tests/eggs.test.ts tests/skills.test.ts
git commit -m "feat(survidle): eggs - a nest stock per region set on 1 May from the birds about, gathered at the shore or heath until it is empty"
```

---

### Task 6: Pine inner bark

**Files:**
- Modify: `src/sim/types.ts` (`KgItem` gains `freshBark`, `driedBark`, `barkFlour`; `TaskId` gains `innerBark`, `grindBark`), `src/sim/items.ts` (`FOODS.barkFlour`, `GUT.barkFlour`, `BARK_FRESH_KG_PER_HOUR = 0.7`, `BARK_DRY_RATIO = 3`, `BARK_FLOUR_MINUTES_PER_KG = 20`, `BARK_TREE_SHARE = 1 / 20`, `BARK_FROM_DOY = 90`, `BARK_TO_DOY = 212`, `AUTO_EAT_ORDER`), `src/sim/fire.ts` (`dryWood` dries `freshBark` to `driedBark` by the same budget at the ratio), `src/sim/tasks.ts` (two tasks), `src/sim/intent.ts` (`resolveCell`: the nearest pine cell; `CAMP_BOUND` grindBark), `src/sim/skills.ts`, `src/sim/orders.ts`, `src/ui/dopanel.ts`, `src/sim/ledger.ts` (`bark` source), `src/sim/actions.ts` (`GUT_WORD.barkFlour = "bark"`)
- Test: `tests/bark.test.ts` (new)

**Interfaces:**
- Produces: `innerBark` on a pine cell with a knife in reach, 60 minutes, `BARK_FRESH_KG_PER_HOUR * yieldFactor` of `freshBark` in the window and half outside it, drawing `BARK_TREE_SHARE` of a tree per kilo from `st.wood` and refused "the pines are stripped" under a tree; `freshBark` dries to `driedBark` at 3 to 1 in `dryWood`'s budget (a lit fire or a walled camp 2 kg an hour, a lean-to or the open 0.5 in dry weather, and only camp piles and the pack); `grindBark` at camp with a stone in reach, 20 minutes a kilo, `driedBark` to `barkFlour`; `FOODS.barkFlour = { kcalPerKg: 800, portionKg: 0.2, sickChance: 0, leanShare: 0 }`, `GUT.barkFlour = { fullCreditKg: 0.5, refuseKg: 1 }`.

- [ ] **Step 1: Write the failing test**

Create `tests/bark.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { Rng } from "../src/rng";
import { advance } from "../src/sim/advance";
import { calendar } from "../src/sim/calendar";
import { addItem, pile, qty } from "../src/sim/inventory";
import { BARK_FRESH_KG_PER_HOUR, BARK_TREE_SHARE, FOODS, GUT } from "../src/sim/items";
import { newGame } from "../src/sim/newgame";
import { placeAt } from "../src/sim/position";
import { regionState } from "../src/sim/regionstate";
import { check, startTask, stepTask } from "../src/sim/tasks";
import { cellAt, regionAt } from "../src/world/gen";

function pineCell(world: import("../src/world/gen").World, region: number): number | undefined {
  return regionAt(world, region).cells.find((c) => cellAt(world, c).terrain === "pine");
}

describe("pine inner bark", () => {
  it("is stripped on pine with a knife, dries by the fire three to one, grinds to flour with a stone, and eats to a ceiling", () => {
    expect(FOODS.barkFlour).toEqual({ kcalPerKg: 800, portionKg: 0.2, sickChance: 0, leanShare: 0 });
    expect(GUT.barkFlour).toEqual({ fullCreditKg: 0.5, refuseKg: 1 });
    const { state, world } = newGame(17, 130);
    const region = state.player.region;
    const st = regionState(state, world, region);
    const pine = pineCell(world, region);
    if (pine === undefined) return;
    placeAt(state, world, pine);
    state.player.tools.push({ id: "knife", durability: 100 });
    const cal = calendar(0, 130);
    const o = check(state, world, cal, "innerBark");
    expect(o.ok).toBe(true);
    const wood = st.wood;
    startTask(state, world, cal, "innerBark");
    for (let m = 0; m < 60 && state.task; m++) stepTask(state, world, cal, new Rng(m), 1);
    expect(qty(state.player.pack, "freshBark")).toBeCloseTo(BARK_FRESH_KG_PER_HOUR, 6);
    expect(wood - st.wood).toBeCloseTo(BARK_FRESH_KG_PER_HOUR * BARK_TREE_SHARE, 6);
    placeAt(state, world, st.campCell);
    st.structures.firePit = true;
    st.fire.lit = true;
    st.fire.fuelKg = 30;
    addItem(pile(state, st.campCell), "freshBark", 3);
    advance(state, world, 90);
    expect(qty(pile(state, st.campCell), "driedBark")).toBeCloseTo(1, 1);
    addItem(state.player.pack, "stone", 1);
    const g = check(state, world, calendar(90, 130), "grindBark");
    expect(g.ok).toBe(true);
    startTask(state, world, calendar(90, 130), "grindBark");
    for (let m = 0; m < 20 && state.task; m++) stepTask(state, world, calendar(90 + m, 130), new Rng(m), 1);
    expect(qty(state.player.pack, "barkFlour") + qty(pile(state, st.campCell), "barkFlour")).toBeCloseTo(1, 1);
  });

  it("stripping outside spring is half as fast and a stand can be stripped out", () => {
    const { state, world } = newGame(17, 250);
    const region = state.player.region;
    const st = regionState(state, world, region);
    const pine = pineCell(world, region);
    if (pine === undefined) return;
    placeAt(state, world, pine);
    state.player.tools.push({ id: "knife", durability: 100 });
    const cal = calendar(0, 250);
    startTask(state, world, cal, "innerBark");
    for (let m = 0; m < 60 && state.task; m++) stepTask(state, world, cal, new Rng(m), 1);
    expect(qty(state.player.pack, "freshBark")).toBeCloseTo(BARK_FRESH_KG_PER_HOUR / 2, 6);
    st.wood = 0.5;
    expect(check(state, world, cal, "innerBark").why).toBe("the pines are stripped");
  });
});
```

(Seed 17's start region may hold no pine; the test returns early then. Pick a seed with pine by trying 17, 19, 42, 79 and pin the one that has it, noting it in a comment.)

- [ ] **Step 2: Run to see it fail**

Run: `npx vitest run tests/bark.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

`items.ts` constants with the comments: "the Swedish handbook calls inner bark time-consuming and low in nutrition, usable all year and easiest on young branches in spring; Kochanski scrapes the cambium in late spring and early summer and dries it. 0.7 kg fresh an hour, three to one dried, 800 kcal/kg of flour, half a kilo a day at full credit and none past one, and a twentieth of a tree per kilo off the felling stock, so a kilo a day is a tree every three weeks against a stock of sixty a forest cell." `FOODS.barkFlour`, `GUT.barkFlour`; `AUTO_EAT_ORDER` inserts `"barkFlour"` after `"berries"`. `types.ts` ids. `fire.ts` `dryWood`: after the firewood budget, run the same budget over `freshBark` producing `driedBark` at `moved / BARK_DRY_RATIO` (a second `dryBudget` call with the pair and the ratio as parameters). `tasks.ts`:

```ts
    case "innerBark": {
      const o = opt({ group: "gather", label: "Strip inner bark", detail: `${BARK_FRESH_KG_PER_HOUR} kg an hour on pine, half outside spring; dries three to one, grinds to flour`, duration: 60, repeatable: true });
      if (terrain !== "pine") return { ...o, ok: false, why: "stand in pine forest" };
      if (!kitInReach(state, world, "knife", toolInvs) && !hasTool(p, "knife")) return { ...o, ok: false, why: "needs a knife" };
      if (st.wood < 1) return { ...o, ok: false, why: "the pines are stripped" };
      return o;
    }
    case "grindBark": {
      const kg = Math.min(1, totalQty(invs, "driedBark"));
      const o = needCamp(opt({ group: "camp", label: "Grind bark flour", detail: "20 minutes a kilo with a stone", duration: Math.max(1, Math.round(BARK_FLOUR_MINUTES_PER_KG * kg)), repeatable: true }));
      if (!o.ok) return o;
      if (kg <= 1e-9) return { ...o, ok: false, why: "no dried bark here" };
      if (totalQty(toolInvs, "stone") < 1) return { ...o, ok: false, why: "needs a stone" };
      return o;
    }
```

completion: `innerBark` produces `BARK_FRESH_KG_PER_HOUR * yieldFactor(state, "foraging") * (inBarkSeason ? 1 : 0.5)` of `freshBark` and `st.wood -= kg * BARK_TREE_SHARE`, crediting the source `bark` at the flour value it will make (`kg / BARK_DRY_RATIO * FOODS.barkFlour.kcalPerKg`); `grindBark` consumes `driedBark` and produces `barkFlour`. Registrations: `innerBark` in `LOCATED`, `WORK_TASKS`, `toolFor` returns `"knife"`; `grindBark` in `WORK_TASKS`, `CAMP_BOUND`; `resolveCell`: `if (task === "innerBark") return nearestCell(state, world, (c) => cellAt(world, c).terrain === "pine")` with a `nearestCell` helper lifted from the seep branch (straight-line sort, route check, `here` as the fallback); `DOING`, `COUNT_WORDS` (`innerBark: ["strip", "strips"]`, `grindBark: ["kilo", "kilos"]`), `yieldItem` (`freshBark`, `barkFlour`), `skillOf` foraging for both (grinding is Foraging's too: the flour is the forager's), `masteryKey` `"innerBark"` for both, `MASTERY_KEYS.foraging` gains it; Do panel Gather gains `innerBark`, Camp gains `grindBark`; ledger source `bark`; `GUT_WORD.barkFlour = "bark"`.

- [ ] **Step 4: Run the tests**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/sim/items.ts src/sim/types.ts src/sim/fire.ts src/sim/tasks.ts src/sim/intent.ts src/sim/skills.ts src/sim/orders.ts src/sim/ledger.ts src/sim/actions.ts src/ui/dopanel.ts tests/bark.test.ts tests/skills.test.ts
git commit -m "feat(survidle): pine inner bark - stripped with a knife in spring, dried by the fire three to one, ground to a flour that feeds a little and no more, and a stand that can be stripped out"
```

---

### Task 7: Roots and rhizomes

**Files:**
- Modify: `src/sim/types.ts` (`KgItem` gains `roots`, `cookedRoots`; `PerishableId` gains `cookedRoots`; `RegionState.roots: number`; `TaskId` gains `roots`), `src/sim/items.ts` (`FOODS.cookedRoots`, `ROOT_KG_PER_HOUR = 0.3`, `ROOT_WINTER_KG_PER_HOUR = 0.1`, `ROOT_STOCK_KG_PER_CELL = 3`, `ROOT_FROM_DOY = 90`, `ROOT_TO_DOY = 304`, `ROOT_RAW_CREDIT = 0.5`, `AUTO_EAT_ORDER`), `src/sim/regionstate.ts`, `src/sim/save.ts`, `src/sim/camp.ts` (the stock set on 1 April from the shore, bog and meadow cells; no growth inside the year), `src/sim/tasks.ts` (the `roots` task; `cook` takes `roots`), `src/sim/skills.ts` (`RECOMMENDED.roots = { skill: "foraging", level: 3 }`, the under-level spoil), `src/sim/capabilities.ts` (a row keyed `rec:roots`), `src/sim/intent.ts`, `src/sim/orders.ts`, `src/ui/dopanel.ts`, `src/sim/ledger.ts` (`roots` source)
- Test: `tests/roots.test.ts` (new)

**Interfaces:**
- Produces: `roots` at a shore, bog or meadow cell with a stick in reach, 60 minutes, `ROOT_KG_PER_HOUR * yieldFactor` of `roots` in season, `ROOT_WINTER_KG_PER_HOUR` from November to March only at a shore cell with the region's ice hole open, both drawn from `st.roots` and refused "the ground is dug out" at zero; under Foraging 3 the dig loses half its kilos with the log "{You} {dig} up as much that is not food as is."; `roots` are not a food (`FoodId` excludes them); `cook` with `arg = "roots"` makes `cookedRoots` (`FOODS.cookedRoots = { kcalPerKg: 850, portionKg: 0.3, sickChance: 0, leanShare: 0 }`); the region stock is `ROOT_STOCK_KG_PER_CELL` per shore, bog and meadow cell on 1 April (`ROOT_FROM_DOY`), cleared by nothing else.

- [ ] **Step 1: Write the failing test**

Create `tests/roots.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { Rng } from "../src/rng";
import { calendar } from "../src/sim/calendar";
import { dailyCamp, rootStockFor } from "../src/sim/camp";
import { setSkillLevel } from "../src/sim/horizon";
import { addItem, qty } from "../src/sim/inventory";
import { FOODS, ROOT_KG_PER_HOUR, ROOT_STOCK_KG_PER_CELL } from "../src/sim/items";
import { newGame } from "../src/sim/newgame";
import { placeAtSpot } from "../src/sim/position";
import { regionState } from "../src/sim/regionstate";
import { RECOMMENDED } from "../src/sim/skills";
import { check, startTask, stepTask } from "../src/sim/tasks";

describe("roots and rhizomes", () => {
  it("a bog holds a season's roots, dug with a stick at 0.3 kg an hour by a forager who knows them and half that by one who does not", () => {
    expect(FOODS.cookedRoots).toEqual({ kcalPerKg: 850, portionKg: 0.3, sickChance: 0, leanShare: 0 });
    expect(RECOMMENDED.roots).toEqual({ skill: "foraging", level: 3 });
    const { state, world } = newGame(17, 130);
    const region = state.player.region;
    const st = regionState(state, world, region);
    dailyCamp(state, world, calendar(0, 90), new Rng(1), null);
    expect(st.roots).toBeCloseTo(rootStockFor(world, region), 6);
    expect(st.roots).toBeGreaterThanOrEqual(ROOT_STOCK_KG_PER_CELL);
    placeAtSpot(state, world, region, "heath");
    addItem(state.player.pack, "stick", 1);
    const cal = calendar(0, 130);
    expect(check(state, world, cal, "roots").ok).toBe(true);
    const stock = st.roots;
    startTask(state, world, cal, "roots");
    for (let m = 0; m < 60 && state.task; m++) stepTask(state, world, cal, new Rng(m), 1);
    expect(qty(state.player.pack, "roots")).toBeCloseTo(ROOT_KG_PER_HOUR / 2, 6);
    expect(stock - st.roots).toBeCloseTo(ROOT_KG_PER_HOUR, 6);
    setSkillLevel(state, "foraging", 3);
    startTask(state, world, cal, "roots");
    for (let m = 0; m < 60 && state.task; m++) stepTask(state, world, cal, new Rng(m), 1);
    expect(qty(state.player.pack, "roots")).toBeCloseTo(ROOT_KG_PER_HOUR * 1.5, 6);
    st.roots = 0;
    expect(check(state, world, cal, "roots").why).toBe("the ground is dug out");
    dailyCamp(state, world, calendar(0, 200), new Rng(2), null);
    expect(st.roots).toBe(0);
  });
});
```

- [ ] **Step 2: Run to see it fail**

Run: `npx vitest run tests/roots.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

`items.ts` constants with the comment "the Swedish handbook: cattail rhizome at 210 g of starch a kilo, reed root-shoots at 5 percent, dandelion root at 23 percent, fifteen pieces for the 500 kcal ration; 0.3 kg an hour in season and 0.1 through an ice hole in winter, 850 kcal/kg cooked, three kilos a shore, bog or meadow cell set on 1 April and not grown back inside the year". `camp.ts`: `export function rootStockFor(world, region): number` (count of cells that are `watersideCell` or terrain `bog` or `meadow`, times `ROOT_STOCK_KG_PER_CELL`), set in `dailyCamp` when `cal.dayOfYear === ROOT_FROM_DOY`. `tasks.ts`:

```ts
    case "roots": {
      const ground = watersideCell(world, at) || terrain === "bog" || terrain === "meadow";
      const winter = cal.dayOfYear < ROOT_FROM_DOY || cal.dayOfYear > ROOT_TO_DOY;
      const rate = winter ? ROOT_WINTER_KG_PER_HOUR : ROOT_KG_PER_HOUR;
      const o = opt({ group: "gather", label: "Dig roots", detail: `${rate} kg an hour with a digging stick; cattail and reed at the water, dandelion on the meadow; cook them`, duration: 60, repeatable: true });
      if (!ground) return { ...o, ok: false, why: "stand by the water, on the bog or on the meadow" };
      if (winter && !(watersideCell(world, at) && iceHoleOpen(state, at))) return { ...o, ok: false, why: "the ground is frozen; an ice hole reaches the rhizomes" };
      if (totalQty(invs, "stick") < 1) return { ...o, ok: false, why: "needs a stick to dig with" };
      if (st.roots <= 1e-9) return { ...o, ok: false, why: "the ground is dug out" };
      return withRecommended(state, o, "roots");
    }
```

(`withRecommended` is whatever helper the check already uses to attach the `recommended` field for `read` and the crafts; read it and use it.) Completion: `const take = Math.min(rate * yieldFactor(state, "foraging"), st.roots); st.roots -= take; const kept = gap(state, "roots") > 0 ? take / 2 : take; if (kept < take) log(state, "{You} {dig} up as much that is not food as is.", "bad"); produce(state, world, "roots", kept); creditYield(state, "roots", kept * FOODS.cookedRoots.kcalPerKg);`. `cook` takes `"roots"` to `"cookedRoots"` (label "Cook roots", 10 minutes a kilo, a lit fire). `roots` (raw) is not in `FoodId`; the spec's "eaten raw credits half" is dropped by the controller's ruling that a raw root is not a food in this game (the cook keep is a minute's work), recorded in the plan here. Registrations: `LOCATED`, `WORK_TASKS`, `resolveCell` via `nearestCell` over shore, bog and meadow cells; `DOING`, `COUNT_WORDS` (`roots: ["dig", "digs"]`), `yieldItem("roots") = "roots"`, `yieldItem("cook", "roots") = "cookedRoots"`, `skillOf` foraging, `masteryKey` `"roots"`, `MASTERY_KEYS.foraging` gains it, `RECOMMENDED.roots`, a capability row `{ id: "roots and rhizomes", keys: ["rec:roots"], tier: { skill: "foraging", level: 3 }, receives: ["fishing"], gives: "starch from the shore and the bog: cattail, reed and dandelion root, cooked", limits: "a stick, the cooking, and a stock that is dug out by autumn and not back until spring" }` (receives fishing because the ice hole reaches the winter rhizomes), Do panel Gather and Camp (`cook roots`), ledger `roots`, `AUTO_EAT_ORDER` inserts `"cookedRoots"` after `"barkFlour"`.

- [ ] **Step 4: Run the tests**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/sim/items.ts src/sim/types.ts src/sim/regionstate.ts src/sim/save.ts src/sim/camp.ts src/sim/tasks.ts src/sim/skills.ts src/sim/capabilities.ts src/sim/intent.ts src/sim/orders.ts src/sim/ledger.ts src/ui/dopanel.ts tests/roots.test.ts tests/skills.test.ts tests/capabilities.test.ts
git commit -m "feat(survidle): roots and rhizomes - dug with a stick at the water, the bog and the meadow from a stock that is set each spring and dug out by autumn, spoiled by half under Foraging 3, and cooked"
```

---

### Task 8: Sap, seaweed and berries under the snow

**Files:**
- Modify: `src/sim/types.ts` (`TaskId` gains `tapSap`, `seaweed`; `KgItem`/`PerishableId` gain `seaweed`; `RegionState.sapTaps: { day: number; n: number }`), `src/sim/items.ts` (`FOODS.seaweed`, `GUT.seaweed`, `SAP_FROM_DOY = 121`, `SAP_TO_DOY = 141`, `SAP_LITRES = 2.5`, `SAP_KCAL = 125`, `SAP_TAPS_PER_DAY = 3`, `SEAWEED_KG_PER_HOUR = 2`, `BERRY_WINTER_SHARE = 0.2`, `AUTO_EAT_ORDER`), `src/sim/tasks.ts` (`tapSap`, `seaweed`, the berries check and completion in winter), `src/sim/intent.ts` (`resolveCell`: nearest birch cell, nearest sea-shore cell), `src/sim/skills.ts`, `src/sim/orders.ts`, `src/ui/dopanel.ts`, `src/sim/ledger.ts` (`sap`, `seaweed`), `src/sim/regionstate.ts`, `src/sim/save.ts`, `src/sim/actions.ts` (`GUT_WORD.seaweed`)
- Test: `tests/plants.test.ts` (new)

**Interfaces:**
- Produces: `tapSap` on a birch cell with a knife in reach, 30 minutes, in the window, at most `SAP_TAPS_PER_DAY` a region a day (`st.sapTaps` counts by day number); completion sets `p.water = WATER_FULL` and credits `SAP_KCAL` straight to `p.kcal` (through `creditEaten` and the `sap` yield source; no item); `seaweed` on a sea-shore cell (`watersideCell(world, at, "sea")`) while the shore is not iced, 60 minutes, `SEAWEED_KG_PER_HOUR` of `seaweed` (`FOODS.seaweed = { kcalPerKg: 200, portionKg: 0.3, sickChance: 0, leanShare: 0 }`, `GUT.seaweed = { fullCreditKg: 2, refuseKg: 2 }`, spoils in 72 hours); the `berries` task opens from November to April at `BERRY_PICK_KG * BERRY_WINTER_SHARE` where `snowCm < DEEP_SNOW_CM`, its row reading "frozen lingon under the snow"; `AUTO_EAT_ORDER` final: `["berries", "seaweed", "cookedRoots", "barkFlour", "eggs", "roe", "cookedFish", "cookedOilyFish", "cookedMeat", "driedMeat", "fat"]`.

- [ ] **Step 1: Write the failing test**

Create `tests/plants.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { Rng } from "../src/rng";
import { calendar } from "../src/sim/calendar";
import { qty } from "../src/sim/inventory";
import { AUTO_EAT_ORDER, BERRY_PICK_KG, BERRY_WINTER_SHARE, FOODS, GUT, SAP_FROM_DOY, SAP_KCAL, SAP_TAPS_PER_DAY, SEAWEED_KG_PER_HOUR } from "../src/sim/items";
import { newGame } from "../src/sim/newgame";
import { placeAt, placeAtSpot } from "../src/sim/position";
import { regionState } from "../src/sim/regionstate";
import { check, startTask, stepTask } from "../src/sim/tasks";
import { WATER_FULL } from "../src/sim/water";
import { cellAt, regionAt } from "../src/world/gen";

describe("sap, seaweed and winter berries", () => {
  it("the auto-eat order is the spec's, fat last", () => {
    expect(AUTO_EAT_ORDER).toEqual(["berries", "seaweed", "cookedRoots", "barkFlour", "eggs", "roe", "cookedFish", "cookedOilyFish", "cookedMeat", "driedMeat", "fat"]);
  });

  it("a birch tapped in the sap rise fills the body with water and 125 kcal, three taps a day", () => {
    const { state, world } = newGame(17, SAP_FROM_DOY);
    const region = state.player.region;
    const birch = regionAt(world, region).cells.find((c) => cellAt(world, c).terrain === "birch");
    if (birch === undefined) return;
    placeAt(state, world, birch);
    state.player.tools.push({ id: "knife", durability: 100 });
    state.player.water = 1;
    state.player.kcal = 3000;
    const cal = calendar(0, SAP_FROM_DOY);
    expect(check(state, world, cal, "tapSap").duration).toBe(30);
    for (let t = 0; t < SAP_TAPS_PER_DAY; t++) {
      startTask(state, world, cal, "tapSap");
      for (let m = 0; m < 30 && state.task; m++) stepTask(state, world, cal, new Rng(m), 1);
    }
    expect(state.player.water).toBeCloseTo(WATER_FULL, 6);
    expect(state.player.kcal).toBeGreaterThanOrEqual(3000 + SAP_KCAL * SAP_TAPS_PER_DAY - 200);
    expect(check(state, world, cal, "tapSap").why).toBe("the birches have given today's sap");
    expect(check(state, world, calendar(0, 200), "tapSap").why).toBe("the sap has stopped");
  });

  it("seaweed is two kilos an hour on the sea shore and capped at two a day", () => {
    expect(FOODS.seaweed).toEqual({ kcalPerKg: 200, portionKg: 0.3, sickChance: 0, leanShare: 0 });
    expect(GUT.seaweed).toEqual({ fullCreditKg: 2, refuseKg: 2 });
    expect(SEAWEED_KG_PER_HOUR).toBe(2);
  });

  it("berries under the snow pick at a fifth from November to April where the snow is shallow", () => {
    expect(BERRY_WINTER_SHARE).toBe(0.2);
    const { state, world } = newGame(17, 320);
    placeAtSpot(state, world, state.player.region, "heath");
    state.weather.snowCm = 10;
    const cal = calendar(0, 320);
    const o = check(state, world, cal, "berries");
    expect(o.ok).toBe(true);
    expect(o.label).toBe("Pick frozen lingon under the snow");
    startTask(state, world, cal, "berries");
    for (let m = 0; m < 60 && state.task; m++) stepTask(state, world, cal, new Rng(m), 1);
    expect(qty(state.player.pack, "berries")).toBeCloseTo(BERRY_PICK_KG * BERRY_WINTER_SHARE, 6);
    state.weather.snowCm = 40;
    expect(check(state, world, cal, "berries").why).toBe("under too much snow");
  });
});
```

(A seaweed task test needs a sea shore; find a coastal seed with `regionAt(world, id).sea > 0` among the reference seeds' neighbours or leave the seaweed task's behaviour to a check-level test on a hand-placed sea cell if `placeAt` on a sea-side cell is reachable; say which in the report.)

- [ ] **Step 2: Run to see it fail**

Run: `npx vitest run tests/plants.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

`items.ts` constants with the handbook lines (sap: 20 g of sugar a litre, 2 to 3 litres from a birch in a couple of hours, the rise in early May at this latitude until the leaves open; seaweed: some carbohydrate and minerals, not calorie-dense; the prisoner's frozen lingonberries under the snow). `tasks.ts`:

```ts
    case "tapSap": {
      const o = opt({ group: "gather", label: "Tap a birch", detail: `${SAP_LITRES} litres of sap drunk on the spot, ${SAP_KCAL} kcal; early May until the leaves open`, duration: 30, repeatable: true });
      if (terrain !== "birch") return { ...o, ok: false, why: "stand among birches" };
      if (cal.dayOfYear < SAP_FROM_DOY || cal.dayOfYear > SAP_TO_DOY) return { ...o, ok: false, why: cal.dayOfYear < SAP_FROM_DOY ? "the sap has not risen" : "the sap has stopped" };
      if (!kitInReach(state, world, "knife", toolInvs) && !hasTool(p, "knife")) return { ...o, ok: false, why: "needs a knife" };
      if (st.sapTaps.day === dayNumber(state.minute) && st.sapTaps.n >= SAP_TAPS_PER_DAY) return { ...o, ok: false, why: "the birches have given today's sap" };
      return o;
    }
    case "seaweed": {
      const o = opt({ group: "gather", label: "Gather seaweed", detail: `${SEAWEED_KG_PER_HOUR} kg an hour off the rocks; two kilos a day is all a body takes`, duration: 60, repeatable: true });
      if (!watersideCell(world, at, "sea")) return { ...o, ok: false, why: "stand on the sea shore" };
      if (state.weather.iceCm >= ICE_SHORE_CM) return { ...o, ok: false, why: "the shore is iced over" };
      return o;
    }
```

`tapSap` completion: `const day = dayNumber(state.minute); st.sapTaps = st.sapTaps.day === day ? { day, n: st.sapTaps.n + 1 } : { day, n: 1 }; p.water = WATER_FULL; p.kcal = Math.min(KCAL_FULL, p.kcal + SAP_KCAL); creditEaten(state, SAP_KCAL); creditYield(state, "sap", SAP_KCAL); log(state, "{You} {drink} the sap as it runs.", "good");`. `seaweed` completion produces `SEAWEED_KG_PER_HOUR * yieldFactor` of `seaweed`, credits `seaweed`. `berries` check: outside `berrySeason`, if `cal.month >= 10 || cal.month <= 3`, the row is "Pick frozen lingon under the snow" at `BERRY_PICK_KG * BERRY_WINTER_SHARE`, refused "under too much snow" when `snowCm >= DEEP_SNOW_CM`; otherwise "nothing ripe yet" as today; completion multiplies by the winter share in those months. Registrations for both tasks as the list says (`tapSap` in `WORK_TASKS`, `LOCATED`; `seaweed` too; `resolveCell` via `nearestCell` for birch and sea-shore cells; `DOING`, `COUNT_WORDS` (`tapSap: ["tap", "taps"]`, `seaweed: ["load", "loads"]`), `yieldItem` (`tapSap` null, `seaweed` "seaweed"), `skillOf` foraging, `masteryKey` by id, `MASTERY_KEYS.foraging`, Do panel Gather, ledger `sap` and `seaweed`); `regionstate.ts` `sapTaps: { day: 0, n: 0 }`, `save.ts` default; `GUT_WORD.seaweed = "mouthful of seaweed"`. `tapSap` yields no item, so `normalizeOrder` makes it a once job; the list gives it as one.

- [ ] **Step 4: Run the tests**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/sim/items.ts src/sim/types.ts src/sim/regionstate.ts src/sim/save.ts src/sim/tasks.ts src/sim/intent.ts src/sim/skills.ts src/sim/orders.ts src/sim/ledger.ts src/sim/actions.ts src/ui/dopanel.ts tests/plants.test.ts tests/skills.test.ts
git commit -m "feat(survidle): birch sap in its three weeks, seaweed on the sea shore, and frozen lingon under shallow snow - the bonuses that never carry a strategy"
```

---

### Task 9: The ledger's rows, the plant band, the report's causality, the without probe

**Files:**
- Modify: `src/sim/ledger.ts` (`YieldSource` and `emptyYield` carry `marrow`, `roe`, `eggs`, `roots`, `bark`, `sap`, `seaweed`), `src/sim/tables.ts` (`SOURCE_ROWS`, the April plants band `row(band(0, 400), band(200, 800))`), `src/sim/reference.ts` (`weekLines` and the checkpoint gain lean-wall days; a `starvationCause(state, world)` line), `scripts/reference.ts` and `scripts/year.ts` (print both; `--without=<source>`), `src/sim/probe.ts` (new: `DISABLED: Set<Source>`, `disabled(source)`), `src/sim/tasks.ts` (each new task's check refuses "disabled for the probe" when its source is disabled; `fishItem` reads lean when `oilyFish` is disabled; roe skipped when `roe` is), `src/sim/save.ts` (`d.yield.<source> ??= 0` for old ledgers)
- Test: `tests/ledger.test.ts`, `tests/tables.test.ts`, `tests/reference.test.ts`, `tests/probe.test.ts` (new)

**Interfaces:**
- Produces: `WeekAverage.leanWallDays: number` (days whose lean intake reached the ceiling with lean food at camp and no fat, roe, eggs or plant food eaten: `DayLedger` gains `leanKcal`, `nonLeanKcal` and `leanAtCamp: boolean`, credited by `eat` and read at the day roll); `export function unexploited(state, world): { name: string; amount: string }[]` in `src/sim/reference.ts` (the spec's list: fat, roe, eggs at camp or in the pack; raw fat unrendered; bones uncracked at camp; nests above zero in season; roots above zero in season with a shore, bog or meadow cell reachable; pine ground in the strip season; an oily species in the shore's read; sap in its window on birch ground; seaweed on a sea shore); the reference and year scripts print, for a starvation death, `unexploited: <name amount, ...>` or `unexploited: none` and `lean-wall days N of M` on the week line; `npm run year -- --without=marrow` (and `oilyFish`, `roe`, `eggs`, `roots`, `bark`, `sap`, `seaweed`) runs the level-20 year with that source shut.

- [ ] **Step 1: Write the failing tests**

Append to `tests/ledger.test.ts`:

```ts
  it("a day whose lean intake hit the ceiling with lean food at camp and nothing else eaten is a lean-wall day", () => {
    const { state, world } = newGame(17);
    const st = regionState(state, world, state.player.region);
    addItem(pile(state, st.campCell), "cookedMeat", 10);
    state.player.kcal = 100;
    const rng = new Rng(1);
    let n = 0;
    while (n++ < 40 && eat(state, world, "cookedMeat", rng)) {}
    advance(state, world, 1440);
    const w = weekBefore(state.ledger, 2);
    expect(w.leanWallDays).toBe(1);
  });
```

Create `tests/probe.test.ts`:

```ts
import { afterEach, describe, expect, it } from "vitest";
import { calendar } from "../src/sim/calendar";
import { newGame } from "../src/sim/newgame";
import { DISABLED, disabled } from "../src/sim/probe";
import { fishItem } from "../src/sim/species";
import { check } from "../src/sim/tasks";
import { unexploited } from "../src/sim/reference";
import { addItem, pile } from "../src/sim/inventory";
import { regionState } from "../src/sim/regionstate";

afterEach(() => DISABLED.clear());

describe("the without probe and the unexploited line", () => {
  it("a disabled source shuts its task and reads oily fish as lean", () => {
    DISABLED.add("oilyFish");
    expect(disabled("oilyFish")).toBe(true);
    expect(fishItem("char")).toBe("fish");
    DISABLED.add("marrow");
    const { state, world } = newGame(17);
    addItem(state.player.pack, "bone", 1);
    addItem(state.player.pack, "stone", 1);
    expect(check(state, world, calendar(0), "crack").why).toBe("disabled for the probe");
  });

  it("names fat at camp and bones uncracked, and reads none when there is nothing", () => {
    const { state, world } = newGame(17);
    const st = regionState(state, world, state.player.region);
    const before = unexploited(state, world);
    addItem(pile(state, st.campCell), "fat", 2);
    addItem(pile(state, st.campCell), "bone", 3);
    const after = unexploited(state, world);
    expect(after.some((u) => u.name === "fat at camp" && u.amount.includes("18,000"))).toBe(true);
    expect(after.some((u) => u.name === "bones uncracked")).toBe(true);
    expect(after.length).toBeGreaterThan(before.length);
  });
});
```

`tests/tables.test.ts`: the plants band assertion moves to `{ lo: 0, hi: 400 }` with the handbook's three hours in a comment, and `sourceBand(APRIL, "berries", "beginner")` reads the same.

- [ ] **Step 2: Run to see them fail**

Run: `npx vitest run tests/ledger.test.ts tests/probe.test.ts tests/tables.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

`ledger.ts`: the sources; `DayLedger` gains `leanKcal`, `nonLeanKcal`, `leanAtCamp`; `creditEaten(state, kcal, leanPart)` books both; a `noteLarder(state, leanAtCamp: boolean)` called once a day from `dailyCamp` for the player's region (lean food in the camp pile or pack); `weekBefore` counts `leanWallDays` as days with `leanKcal >= LEAN_KCAL_PER_DAY - 1 && nonLeanKcal < 1 && leanAtCamp`. `tables.ts`: `SOURCE_ROWS` gains `marrow: ["hunting", "largeGame"]`, `roe: ["fishing"]`, `eggs: ["birds"]`, `roots: ["plants"]`, `bark: ["plants"]`, `sap: ["plants"]`, `seaweed: ["plants"]`; the April plants row `row(band(0, 400), band(200, 800))` with the comment "the Swedish handbook budgets three hours a day of plant work for the 500 kcal ration; the old band was written when the row had no task". `probe.ts`:

```ts
/** The without probe (fat and carbohydrate design, section 7): a source shut for a year run, so no single resource can be mandatory. Empty in play. */
export type ProbeSource = "marrow" | "oilyFish" | "roe" | "eggs" | "roots" | "bark" | "sap" | "seaweed";
export const PROBE_SOURCES: ProbeSource[] = ["marrow", "oilyFish", "roe", "eggs", "roots", "bark", "sap", "seaweed"];
export const DISABLED = new Set<ProbeSource>();
export function disabled(s: ProbeSource): boolean {
  return DISABLED.has(s);
}
```

Each new task's check begins `if (disabled("<source>")) return { ...o, ok: false, why: "disabled for the probe" };`; `fishItem` returns `"fish"` when `disabled("oilyFish")`; the roe branch is skipped when `disabled("roe")`. `reference.ts` `unexploited` as the interface says, each entry `{ name, amount }` with kcal formatted with a thousands comma; the checkpoint carries `week.leanWallDays`; `weekLines` prints `lean-wall days N of M` on the sleep line; the scripts print `unexploited: ...` under a starvation death's pass line (the reference script) and outcome line (the year script). `scripts/year.ts`: `--without=<source>` adds to `DISABLED` before the runs and prints `without <source>` in the seed header; unknown names exit 2 with the list. `save.ts`: the new ledger fields default to 0 and false.

- [ ] **Step 4: Run the tests**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/sim/ledger.ts src/sim/tables.ts src/sim/reference.ts src/sim/probe.ts src/sim/tasks.ts src/sim/species.ts src/sim/camp.ts src/sim/save.ts scripts/reference.ts scripts/year.ts tests/ledger.test.ts tests/tables.test.ts tests/reference.test.ts tests/probe.test.ts
git commit -m "feat(survidle): the ledger reads the new sources, the plants band is the handbook's three hours, a starvation death names the non-lean calories it left, and the year runs without one source at a time"
```

---

### Task 10: The list, the seasons and the panel

**Files:**
- Modify: `src/sim/reference.ts` (`REFERENCE_ORDERS`, `wantOpen`), `src/sim/orders.ts` (nothing new if the keeps are stocks; a `tapSap` once job is given by the script), `src/sim/capabilities.ts` (rows for marrow, eggs, oily fish are content beneath rows, no row; roots has its row from Task 7), `docs/README.md` is Task 12
- Test: `tests/list.test.ts`

**Interfaces:**
- Produces: the list gains, in the food group after `keep("cook", 1)`: `keep("cook", 1, "rawFat")` placed above the two cook keeps (fat first), a `crack` grind (leave) at camp after the cook keeps, `keep("eggs", 2)`, `keep("roots", 2)` and `keep("cook", 1, "roots")`, `keep("innerBark", 3)` with `keep("grindBark", 1)` (that is, a keep on `barkFlour` at 1 kg) after it, `job("tapSap", once)` and `keep("seaweed", 2)`; `wantOpen` opens eggs in the window, roots April to October and in winter with an axe in reach, inner bark April to July, sap in its window, seaweed only at a camp on a sea shore (`regionAt(...).sea > 0`), and `crack` only when the camp pile holds a bone.

- [ ] **Step 1: Write the failing test**

Append to `tests/list.test.ts`:

```ts
  it("keeps the fat rendered above the cook keeps, cracks bones, and gathers eggs, roots, bark, sap and seaweed in their seasons", () => {
    const tasks = REFERENCE_ORDERS.map(key);
    expect(tasks.indexOf("cook:rawFat:keep")).toBeLessThan(tasks.indexOf("cook:fish:keep"));
    expect(tasks.indexOf("crack::grind")).toBeGreaterThan(tasks.indexOf("cook::keep"));
    for (const t of ["eggs::keep", "roots::keep", "cook:roots:keep", "innerBark::keep", "grindBark::keep", "tapSap::job", "seaweed::keep"]) expect(tasks).toContain(t);
    const { state, world } = newGame(17);
    expect(wantOpen(state, world, want("eggs::keep"), calendar(0, 100))).toBe(false);
    expect(wantOpen(state, world, want("eggs::keep"), calendar(0, 130))).toBe(true);
    expect(wantOpen(state, world, want("tapSap::job"), calendar(0, 125))).toBe(true);
    expect(wantOpen(state, world, want("tapSap::job"), calendar(0, 200))).toBe(false);
    expect(wantOpen(state, world, want("innerBark::keep"), calendar(0, 250))).toBe(false);
    expect(wantOpen(state, world, want("roots::keep"), calendar(0, 250))).toBe(true);
    state.player.tools = [];
    expect(wantOpen(state, world, want("roots::keep"), calendar(0, 340))).toBe(false);
  });
```

- [ ] **Step 2: Run to see it fail**

Run: `npx vitest run tests/list.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

Insert into `REFERENCE_ORDERS` as the interface says, with a paragraph in the list's doc comment: "Fat before meat: the render keep sits above the cook keeps because raw fat rots in three days and is the calories the ceiling does not touch; the crack grind takes the bones the hunts leave at camp; the gathering keeps open by season in wantOpen, and a seaweed keep opens only for a camp on the sea." `wantOpen` branches per the interface (`crack` reads `qty(pile(state, campCell), "bone") >= 1`). The reference opening snapshots in `tests/reference.test.ts` move (list length, ranks) with a comment naming the insertions.

- [ ] **Step 4: Run the tests**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/sim/reference.ts tests/list.test.ts tests/reference.test.ts
git commit -m "feat(survidle): the reference list renders its fat before it cooks, cracks the bones at camp, and gathers eggs, roots, bark, sap and seaweed in their seasons"
```

---

### Task 11: Measure, and name every starvation

**Files:**
- Modify: `src/sim/reference.ts`, `src/sim/body.ts`, `src/sim/intent.ts` (runner or list changes the deaths ask for), the spec's section 0 ("Measured after")

- [ ] **Step 1: Run the gates and the probes to files under the SDD workspace**

```bash
npm run reference > april.log 2>&1
npm run year -- --winter > winter.log 2>&1
npm run year > year20.log 2>&1
npm run reference -- --heir > lineage.log 2>&1
npm run year -- --level=10 > year10.log 2>&1
for s in marrow oilyFish roe eggs roots bark sap seaweed; do npm run year -- --without=$s > without-$s.log 2>&1; done
```

- [ ] **Step 2: Read every starvation death against the spec's criteria (section 7)**

For each seed that starves on any gate, read its `unexploited` line and its lean-wall days. A non-empty line is a hole: if the calories could not be eaten (a rule refuses them, auto-eat never reaches them, the cook keep never renders), fix the food model or the runner in the same task, with a test, and re-run that gate; if they could be eaten and were not because of the list's ranking or a want that never opened, fix the list or `wantOpen`. A line reading "none" is luck or strategy: record it and leave it. Never move a constant this plan or the tables audit set.

- [ ] **Step 3: Read the without probes**

For each source, note the year reading with it shut; done is that no single source's removal takes the level-20 year from its reading to 0 of 4. If one does, that source is mandatory and the spec's criterion fails: write it down as a finding with the number, and leave it for the author.

- [ ] **Step 4: Record**

Add a "Measured after" subsection to the spec's section 0: the four gates seed by seed with day and cause, every starvation death's unexploited line and lean-wall days, the without table (source, reading), the kcal per source on the gate weeks, the runner changes with the death that asked for each, and the findings left. Commit each runner change on its own (`fix(survidle): <change>, measured on seed N`) and the spec as a docs commit.

- [ ] **Step 5: Commit**

```bash
npm test
git add src/sim/reference.ts src/sim/body.ts src/sim/intent.ts tests/ docs/superpowers/specs/2026-09-06-survidle-fat-and-carbohydrate-design.md
git commit -m "docs(survidle): fat and carbohydrate measured - the gates seed by seed, every starvation named, the without table"
```

---

### Task 12: Docs

**Files:**
- Modify: `docs/superpowers/specs/2026-09-03-survidle-realism-roadmap.md` (item K after J, the build order, "What the north yields", E's tallow line, a "Measured with fat and carbohydrate" paragraph under F), `docs/README.md` (the Body, Camp, Species and How-it-plays paragraphs; "Where the numbers live" gains `gut.ts` and `probe.ts`, loses `berries.ts` and `lean.ts`), `src/sim/manual.ts` (the food section reads the new sources in one line), the spec's "Built" paragraph

- [ ] **Step 1: Write them**

Item K's curve line: horizon rows 4 and 5, survivor rows 2 to 4, tier Foraging 3 for roots, expected to move the level-20 year and the first lives past the berries, measured in Task 11's paragraph. The README explains what is, never what was. The manual's food section becomes: "Hare alone starves you; you need fat: marrow, oily fish, eggs and roe in their season." / "A trap in the water works while you sleep. Berries are a season, and two litres is a day's worth." / "Roots at the water and pine bark are work; they fill a gap, not a winter." / "A deer is weeks of food that rots in a day unless you dry it; its fat rots in three unless you render it." / "Winter needs a hut or a snow shelter, a woodpile, and stores." (five lines, the section's cap).

- [ ] **Step 2: Commit**

```bash
git add docs/README.md docs/superpowers/specs/2026-09-03-survidle-realism-roadmap.md docs/superpowers/specs/2026-09-06-survidle-fat-and-carbohydrate-design.md src/sim/manual.ts tests/manual.test.ts
git commit -m "docs(survidle): fat and carbohydrate as built - item K in the roadmap, the readings under F, the README's food, the manual's fat line"
```
