# The Order Ladder Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Two more rungs on every skill's order ladder, conditions at 15 and pace at 20, as things a standing order can say; keeps that read their stored forms; the reference runner held to the shapes its skills have earned and counted as a returning player for the rest; the gates re-measured with the attention each plan cost.

**Architecture:** The vocabulary lives on `IntentRequest` (`when`, and a `daily` until) and is read in one place, `src/sim/orders.ts`, by the scheduler; the ladder in `src/sim/ladder.ts` gates and strips it; the Do panel exposes it by rung; the runner in `src/sim/reference.ts` gives each want through `withinLadder` and, for what was stripped, acts as a returning player and counts the act. The scripts print the count and the two readings beside the gates.

**Tech Stack:** TypeScript, Vite, vitest; `npm test` fast suite; `npm run reference`, `npm run year`, `npm run reference -- --heir` for the gates.

**Spec:** `08-survidle/docs/superpowers/specs/2026-09-07-survidle-order-ladder-design.md`

## Global Constraints

- Rung levels: `condition: 15`, `pace: 20`, beside `job: 3`, `grind: 5`, `keep: 10`; no other new constant anywhere. Every number in a condition is a level, a day of year the calendar already has, or a figure the list already holds (`WINTER_STOCK`, `HANG_ABOVE_KG`, `TRACE_KG`, `MIDSUMMER_DOY`, `WINTER_WOOD_TO_DOY`, `EGG_FROM_DOY`, `EGG_TO_DOY`, `SAP_FROM_DOY`, `SAP_TO_DOY`, `ROOT_FROM_DOY`, `ROOT_TO_DOY`, `WOOD_DUE_DOY = 334`).
- Comments explain, never chronicle: no task numbers, dates, "was", "now", "old". No em dashes or non-typable unicode anywhere. Voice templates (`{You} {give}`) for log lines.
- Only files under `08-survidle/`; explicit-path staging, never `git add -A`; `npm test` green before each commit; the pre-commit hook runs biome lint and `tsc --noEmit`.
- Commit messages in the house style, ending with:
  `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`
  `Claude-Session: https://claude.ai/code/session_01352zAHUpQPBdTDeXJ5SWVM`
- Tests first: RED, then GREEN, in the report.
- An old save must load: every new field on an order is optional.

---

### Task 1: The vocabulary's types and the rung table

**Files:**
- Modify: `src/sim/types.ts` (`UntilChoice`, `IntentRequest`, `Order`, new `OrderWhen`)
- Modify: `src/sim/skills.ts` (`Rung`, `RUNG_LEVEL`, `RUNG_WORD`, `RUNG_ORDER`, `RUNG_LINE`)
- Test: `tests/ladder.test.ts`

**Interfaces:**
- Produces: `export interface OrderWhen { season?: { from: number; to: number }; stock?: { item: ItemId; atLeast?: number; under?: number }; restart?: number; by?: number }`; `UntilChoice` gains `{ kind: "daily"; n: number }`; `IntentRequest.when?: OrderWhen`; `Order` gains `held?: boolean; givenDoy?: number; dayOpened?: number`; `export type Rung = OrderKind | "condition" | "pace"`; `RUNG_LEVEL: Record<Rung, number>`, `RUNG_WORD`, `RUNG_LINE`, `RUNG_ORDER: Rung[]`.

- [ ] **Step 1: Write the failing test**

Append to `tests/ladder.test.ts`:

```ts
import { RUNG_LEVEL, RUNG_ORDER, RUNG_LINE } from "../src/sim/skills";

describe("the two upper rungs", () => {
  it("conditions open at 15 and pace at 20, after the keep", () => {
    expect(RUNG_LEVEL).toEqual({ job: 3, grind: 5, keep: 10, condition: 15, pace: 20 });
    expect(RUNG_ORDER).toEqual(["job", "grind", "keep", "condition", "pace"]);
    expect(RUNG_LINE.condition("Foraging")).toContain("season");
    expect(RUNG_LINE.pace("Woodcraft")).toContain("date");
  });
});
```

- [ ] **Step 2: Run to see it fail**

Run: `npx vitest run tests/ladder.test.ts`
Expected: FAIL (`condition` missing from `RUNG_LEVEL`).

- [ ] **Step 3: Implement**

In `src/sim/types.ts`, beside `UntilChoice`:

```ts
/** The row's chosen kind, before the yield item is filled in. A daily count is cleared at the day roll and never drops off. */
export type UntilChoice =
  | { kind: "once" } | { kind: "times"; n: number } | { kind: "campHas"; qty: number } | { kind: "forever" }
  | { kind: "daily"; n: number };

/**
 * Conditions on a standing order, read every morning against the calendar
 * and the camp. A season is a day-of-year window, inclusive, wrapping the
 * new year when from is past to. A stock line opens the order only while
 * the camp pile holds the item in the range. A restart line makes a keep
 * that has read met at its target stay met until the stock falls under
 * it, so the keep does not flicker at its line. A "by" day makes a keep's
 * target rise to its figure across the season (or from the day the order
 * was given) and hold there after. The ladder gates each part by rung.
 */
export interface OrderWhen {
  season?: { from: number; to: number };
  stock?: { item: ItemId; atLeast?: number; under?: number };
  restart?: number;
  by?: number;
}

export interface IntentRequest {
  task: TaskId;
  arg?: string;
  until: UntilChoice;
  deliver: "leave" | "camp";
  where: Where;
  when?: OrderWhen;
}
```

`Order` gains three optional fields with one comment: `/** A keep with a restart line: whether it last read met at its target. */ held?: boolean; /** The day of year the order was given, the rise's start for a "by" keep with no season. */ givenDoy?: number; /** The day a daily count was last cleared. */ dayOpened?: number;`

In `src/sim/skills.ts`:

```ts
/** A rung is what an order may say: its kind, and past the keep, the conditions and the pace it may carry. */
export type Rung = OrderKind | "condition" | "pace";
export const RUNG_LEVEL: Record<Rung, number> = { job: 3, grind: 5, keep: 10, condition: 15, pace: 20 };
export const RUNG_WORD: Record<Rung, string> = { job: "jobs", grind: "grinds", keep: "keeps", condition: "conditions", pace: "pace" };
export const RUNG_ORDER: Rung[] = ["job", "grind", "keep", "condition", "pace"];
export const RUNG_LINE: Record<Rung, (skill: string) => string> = {
  job: ..., grind: ..., keep: ... (unchanged),
  condition: (s) => `{You} {read} the season and the pile as one: orders from ${s} can carry a season, a stock line, a restart line or a daily count.`,
  pace: (s) => `{You} {plan} ${s.toLowerCase()} by the calendar: a keep from ${s} can be due by a date.`,
};
```

The two loops in skills.ts that log rung lines iterate `RUNG_ORDER` already; check they type against `Rung`. `capabilities.ts`'s `CapabilityKey` template is `rung:${OrderKind}`; widen to `rung:${Rung}` (the rows come in Task 5).

- [ ] **Step 4: Run the tests**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/sim/types.ts src/sim/skills.ts src/sim/capabilities.ts tests/ladder.test.ts
git commit -m "feat(survidle): an order can carry a season, a stock line, a restart line, a daily count and a due date - the types, and two rungs above the keep at 15 and 20"
```

---

### Task 2: The gate and the ladder read the rungs

**Files:**
- Modify: `src/sim/ladder.ts` (`rungsNeeded`, `orderGate`, `withinLadder`, `normalizeOrder` for daily)
- Test: `tests/ladder.test.ts`

**Interfaces:**
- Consumes: Task 1's types and `RUNG_LEVEL`.
- Produces: `export function rungsNeeded(req: IntentRequest, kind: OrderKind): Rung[]` (the kind's rung plus `condition` when `when.season`, `when.stock`, `when.restart` or a `daily` until is present, plus `pace` when `when.by` is); `orderGate` refuses on the first rung short with `why` naming it; `withinLadder` returns the request with unearned parts stripped (`by` gone under pace; `season`, `stock`, `restart` gone under condition; a `daily` until becomes `times n` under condition), then the kind stand-in as today.

- [ ] **Step 1: Write the failing tests**

Append to `tests/ladder.test.ts`:

```ts
describe("the upper rungs' gate", () => {
  it("a season needs the condition rung and a due date needs pace, named in the why", () => {
    const { state } = newGame(17);
    setLevel(state, "foraging", 12);
    const seasoned: IntentRequest = { ...req("berries", { kind: "campHas", qty: 2 }), when: { season: { from: 182, to: 120 } } };
    const g = orderGate(state, seasoned, "keep");
    expect(g.ok).toBe(false);
    if (!g.ok) expect(g.why).toContain("conditions at Foraging 15");
    setLevel(state, "foraging", 15);
    expect(orderGate(state, seasoned, "keep").ok).toBe(true);
    setLevel(state, "woodcraft", 15);
    const paced: IntentRequest = { ...req("split", { kind: "campHas", qty: 600 }), when: { by: 334 } };
    const p = orderGate(state, paced, "keep");
    expect(p.ok).toBe(false);
    if (!p.ok) expect(p.why).toContain("pace at Woodcraft 20");
    setLevel(state, "woodcraft", 20);
    expect(orderGate(state, paced, "keep").ok).toBe(true);
  });

  it("a daily count needs the condition rung; under it the ladder gives a counted job", () => {
    const { state } = newGame(17);
    setLevel(state, "foraging", 10);
    const daily = req("roots", { kind: "daily", n: 1 });
    expect(orderGate(state, daily, "job").ok).toBe(false);
    const w = withinLadder(state, daily, "job");
    expect(w.req.until).toEqual({ kind: "times", n: 1 });
    setLevel(state, "foraging", 15);
    expect(withinLadder(state, daily, "job").req.until).toEqual({ kind: "daily", n: 1 });
  });

  it("withinLadder strips what is not earned and keeps what is", () => {
    const { state } = newGame(17);
    setLevel(state, "hunting", 15);
    const hunt: IntentRequest = { ...req("hunt", { kind: "campHas", qty: 240 }, "any"), when: { restart: 192, by: 334 } };
    const w = withinLadder(state, hunt, "keep");
    expect(w.kind).toBe("keep");
    expect(w.req.when).toEqual({ restart: 192 });
    setLevel(state, "hunting", 20);
    expect(withinLadder(state, hunt, "keep").req.when).toEqual({ restart: 192, by: 334 });
    setLevel(state, "hunting", 8);
    const low = withinLadder(state, hunt, "keep");
    expect(low.kind).toBe("job");
    expect(low.req.when).toBeUndefined();
  });

  it("rungsNeeded lists the kind's rung and each condition's", () => {
    expect(rungsNeeded(req("chop", { kind: "campHas", qty: 10 }), "keep")).toEqual(["keep"]);
    expect(rungsNeeded({ ...req("chop", { kind: "campHas", qty: 10 }), when: { season: { from: 1, to: 2 }, by: 334 } }, "keep")).toEqual(["keep", "condition", "pace"]);
    expect(rungsNeeded(req("roots", { kind: "daily", n: 1 }), "job")).toEqual(["job", "condition"]);
  });
});
```

Import `rungsNeeded` from the ladder.

- [ ] **Step 2: Run to see it fail**

Run: `npx vitest run tests/ladder.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

In `src/sim/ladder.ts`:

```ts
/** The rungs an order asks for: its kind, and past the keep, each condition it carries. */
export function rungsNeeded(req: IntentRequest, kind: OrderKind): Rung[] {
  const n = normalizeOrder(req, kind);
  const out: Rung[] = [n.kind];
  const w = n.req.when;
  if (w?.season || w?.stock || w?.restart !== undefined || n.req.until.kind === "daily") out.push("condition");
  if (w?.by !== undefined) out.push("pace");
  return out;
}

export function orderGate(state: GameState, req: IntentRequest, kind: OrderKind): Gate {
  const n = normalizeOrder(req, kind);
  const rungs = rungsNeeded(n.req, n.kind);
  if (n.kind === "job" && n.req.until.kind === "once" && rungs.length === 1) return { ok: true };
  const skill = gateSkill(n.req.task, n.req.arg);
  if (!skill) throw new Error(`${n.req.task} has no gate skill and cannot be an order`);
  const level = skillLevel(state, skill);
  for (const r of rungs) {
    if (r === "job" && n.req.until.kind === "once") continue;
    const at = RUNG_LEVEL[r];
    if (level < at) return { ok: false, why: `${RUNG_WORD[r]} at ${SKILL_NAMES[skill]} ${at}, {you} {are} ${level}`, skill, level, at };
  }
  return { ok: true };
}

/** The request with every condition the skill has not earned taken off; the kind stand-in follows as before. */
function stripUnearned(state: GameState, req: IntentRequest): IntentRequest {
  const skill = gateSkill(req.task, req.arg);
  if (!skill) return req;
  const level = skillLevel(state, skill);
  let out = req;
  if (level < RUNG_LEVEL.pace && out.when?.by !== undefined) {
    const { by: _by, ...rest } = out.when;
    out = { ...out, when: Object.keys(rest).length ? rest : undefined };
  }
  if (level < RUNG_LEVEL.condition) {
    if (out.when) out = { ...out, when: undefined };
    if (out.until.kind === "daily") out = { ...out, until: { kind: "times", n: out.until.n } };
  }
  return out;
}
```

`withinLadder` calls `stripUnearned` first, then the existing kind logic on the stripped request. `normalizeOrder` treats a `daily` until like a `times`: a keep or a camp-has without a yield falls to once as today; a `daily` on a task with no countable yield stays daily (the tap of sap is drunk, not stocked, and "once a day" is its shape).

- [ ] **Step 4: Run the tests**

Run: `npm test`
Expected: PASS (the Do panel's `orderGate` callers are unchanged in shape).

- [ ] **Step 5: Commit**

```bash
git add src/sim/ladder.ts tests/ladder.test.ts
git commit -m "feat(survidle): the ladder gates a season, a stock line, a restart line and a daily count at 15 and a due date at 20, and strips what a skill has not earned"
```

---

### Task 3: The scheduler reads the vocabulary

**Files:**
- Modify: `src/sim/orders.ts` (`KEEP_FORMS`, `conditionOpen`, `keepTargetToday`, `orderMet`, `runOrders`, `orderSentence`, `chooseOrder`, `addOrder`)
- Modify: `src/sim/intent.ts` (`startIntent` maps a daily until to `times`)
- Test: `tests/orders.test.ts`

**Interfaces:**
- Consumes: Task 1's types.
- Produces: `export function inSeason(doy: number, season: { from: number; to: number }): boolean`; `export function conditionOpen(state: GameState, world: World, cal: Calendar, o: Order): string | null` (the reason it is shut, or null); `export function keepTargetToday(cal: Calendar, o: Order): number`; `export const KEEP_FORMS: Partial<Record<TaskId, { item: ItemId; ratio: number }[]>>`; `export function keepStock(state: GameState, world: World, o: Order): number` (the stock in the keep's unit across its forms, kit in the pack included as today).

- [ ] **Step 1: Write the failing tests**

Append to `tests/orders.test.ts` (use the file's existing helpers for a game with a camp; `giveOrder` from the ladder with the skill set high enough, or `addOrder` directly, which does not gate):

```ts
import { addOrder, conditionOpen, inSeason, keepStock, keepTargetToday, orderMet, ordersHere, runOrders } from "../src/sim/orders";
import { addItem, pile } from "../src/sim/inventory";
import { calendar } from "../src/sim/calendar";

describe("the vocabulary in the scheduler", () => {
  it("a season wraps the new year", () => {
    expect(inSeason(200, { from: 182, to: 90 })).toBe(true);
    expect(inSeason(50, { from: 182, to: 90 })).toBe(true);
    expect(inSeason(120, { from: 182, to: 90 })).toBe(false);
    expect(inSeason(150, { from: 120, to: 181 })).toBe(true);
    expect(inSeason(182, { from: 120, to: 181 })).toBe(false);
  });

  it("a keep reads its stored forms: dried meat is three kilos of meat", () => {
    const { state, world } = newGame(17);
    const st = regionState(state, world, state.player.region);
    addItem(pile(state, st.campCell), "driedMeat", 10);
    addItem(pile(state, st.campCell), "cookedMeat", 2);
    const o = addOrder(state, world, { task: "hunt", arg: "any", until: { kind: "campHas", qty: 40 }, deliver: "camp", where: "nearest" }, "keep");
    expect(keepStock(state, world, o)).toBeCloseTo(32, 6);
    expect(orderMet(state, world, o, true)).toBe(false);
    addItem(pile(state, st.campCell), "rawMeat", 8);
    expect(orderMet(state, world, o, true)).toBe(true);
  });

  it("a restart line holds a met keep until the stock falls under it", () => {
    const { state, world } = newGame(17);
    const st = regionState(state, world, state.player.region);
    const camp = pile(state, st.campCell);
    const o = addOrder(state, world, { task: "hunt", arg: "any", until: { kind: "campHas", qty: 10 }, deliver: "camp", where: "nearest", when: { restart: 6 } }, "keep");
    addItem(camp, "rawMeat", 10);
    expect(orderMet(state, world, o, true)).toBe(true);
    expect(o.held).toBe(true);
    camp.rawMeat = 7;
    expect(orderMet(state, world, o, true)).toBe(true);
    camp.rawMeat = 5;
    expect(orderMet(state, world, o, true)).toBe(false);
    expect(o.held).toBe(false);
  });

  it("a due date paces a keep's target across its season and holds after", () => {
    const { state, world } = newGame(17);
    const o = addOrder(state, world, { task: "split", until: { kind: "campHas", qty: 600 }, deliver: "camp", where: "nearest", when: { season: { from: 182, to: 90 }, by: 334 } }, "keep");
    expect(keepTargetToday(calendar(0, 182), o)).toBeCloseTo(0, 6);
    expect(keepTargetToday(calendar(0, 258), o)).toBeCloseTo(300, 6);
    expect(keepTargetToday(calendar(0, 334), o)).toBeCloseTo(600, 6);
    expect(keepTargetToday(calendar(0, 20), o)).toBeCloseTo(600, 6);
  });

  it("a stock line shuts an order with a reason the row shows, and a season the same", () => {
    const { state, world } = newGame(17);
    const crack = addOrder(state, world, { task: "crack", until: { kind: "forever" }, deliver: "leave", where: "nearest", when: { stock: { item: "bone", atLeast: 1 } } }, "grind");
    expect(conditionOpen(state, world, calendar(0, 100), crack)).toBe("waits for bone at camp");
    const st = regionState(state, world, state.player.region);
    addItem(pile(state, st.campCell), "bone", 1);
    expect(conditionOpen(state, world, calendar(0, 100), crack)).toBeNull();
    const eggs = addOrder(state, world, { task: "eggs", until: { kind: "daily", n: 1 }, deliver: "camp", where: "nearest", when: { season: { from: 120, to: 181 } } }, "job");
    expect(conditionOpen(state, world, calendar(0, 100), eggs)).toBe("out of season until 1 May");
    expect(conditionOpen(state, world, calendar(0, 150), eggs)).toBeNull();
  });

  it("a daily count clears at the day roll and never drops off", () => {
    const { state, world } = newGame(17);
    const o = addOrder(state, world, { task: "roots", until: { kind: "daily", n: 1 }, deliver: "camp", where: "nearest" }, "job");
    o.done = 1;
    o.dayOpened = 1;
    expect(orderMet(state, world, o, false)).toBe(true);
    state.minute = 2 * 1440 + 60;
    runOrders(state, world, calendar(state.minute, state.startDoy), new Rng(1));
    expect(ordersHere(state, world).some((x) => x.id === o.id)).toBe(true);
    expect(o.done).toBe(0);
  });
});
```

- [ ] **Step 2: Run to see it fail**

Run: `npx vitest run tests/orders.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

In `src/sim/orders.ts`:

```ts
/**
 * A keep on a food reads the food in every form it takes at camp, in the
 * keep's own unit: dried meat is three kilos of the meat it dried from,
 * flour and the dried strip three of the fresh strip, a cooked fish one of
 * the raw. A keep counting the raw item alone can never read met while the
 * cook and the body take it the same day, and takes the whole day for it.
 */
export const KEEP_FORMS: Partial<Record<TaskId, { item: ItemId; ratio: number }[]>> = {
  hunt: [{ item: "cookedMeat", ratio: 1 }, { item: "driedMeat", ratio: 3 }],
  fish: [{ item: "cookedFish", ratio: 1 }, { item: "oilyFish", ratio: 1 }, { item: "cookedOilyFish", ratio: 1 }],
  roots: [{ item: "cookedRoots", ratio: 1 }],
  innerBark: [{ item: "driedBark", ratio: BARK_DRY_RATIO }, { item: "barkFlour", ratio: BARK_DRY_RATIO }],
};

/** A day-of-year window, inclusive; from past to wraps the new year. */
export function inSeason(doy: number, season: { from: number; to: number }): boolean {
  return season.from <= season.to ? doy >= season.from && doy <= season.to : doy >= season.from || doy <= season.to;
}

/** The stock a keep holds in its own unit: the yield item, its stored forms at their ratios, and kit in the pack. */
export function keepStock(state: GameState, world: World, o: Order): number {
  const st = regionState(state, world, state.player.region);
  const camp = pile(state, st.campCell);
  const keep = keepTarget(o);
  if (!keep) return 0;
  let have = qty(camp, keep.item) + (KIT_ITEMS.has(keep.item) ? qty(state.player.pack, keep.item) : 0);
  for (const f of KEEP_FORMS[o.req.task] ?? []) have += qty(camp, f.item) * f.ratio;
  return have;
}

/** A keep's target today: its figure, or the share of it due by "by" across its season (or from the day it was given), the whole after. */
export function keepTargetToday(cal: Calendar, o: Order): number {
  const keep = keepTarget(o);
  if (!keep) return 0;
  const by = o.req.when?.by;
  if (by === undefined) return keep.qty;
  const from = o.req.when?.season?.from ?? o.givenDoy ?? by;
  const span = ((by - from) % 365 + 365) % 365;
  if (span === 0) return keep.qty;
  const gone = ((cal.dayOfYear - from) % 365 + 365) % 365;
  return keep.qty * Math.min(1, gone / span);
}

/** Why an order's conditions shut it this morning, or null while they hold. */
export function conditionOpen(state: GameState, world: World, cal: Calendar, o: Order): string | null {
  const w = o.req.when;
  if (!w) return null;
  if (w.season && !inSeason(cal.dayOfYear, w.season)) return `out of season until ${fmtDoy(w.season.from)}`;
  if (w.stock) {
    const st = regionState(state, world, state.player.region);
    const have = qty(pile(state, st.campCell), w.stock.item);
    if (w.stock.atLeast !== undefined && have < w.stock.atLeast - 1e-9) return `waits for ${ITEM_NAMES[w.stock.item]} at camp`;
    if (w.stock.under !== undefined && have >= w.stock.under - 1e-9) return `camp holds ${itemLabel(w.stock.item, w.stock.under)} already`;
  }
  return null;
}
```

`fmtDoy(doy)` prints "1 May" from a day of year; if the calendar module has one, import it, else add it there (month names exist for the month line). `orderMet` uses `keepStock` and `keepTargetToday`, and the restart line:

```ts
  if (keep) {
    const have = keepStock(state, world, o);
    const target = keepTargetToday(cal, o);
    const restart = o.req.when?.restart;
    if (restart !== undefined) {
      if (have >= target - 1e-9) o.held = true;
      else if (have < restart - 1e-9) o.held = false;
      return o.held === true;
    }
    return live ? have >= target - 1e-9 : have >= target / 2 - 1e-9;
  }
```

`orderMet` gains a `cal` argument (every caller has one: `chooseOrder`, `runOrders`, the runner's probe); the `daily` until reads `o.done >= u.n`. `chooseOrder` calls `conditionOpen` before `orderMet` and marks the order skipped with its reason. `runOrders` clears a daily order at the day roll (`if (o.req.until.kind === "daily" && o.dayOpened !== cal.day) { o.done = 0; o.dayOpened = cal.day; }`) and never removes a daily job. `addOrder` sets `givenDoy: calendar(state.minute, state.startDoy).dayOfYear` (import `calendar`). `orderSentence` appends, after the target, `by ${fmtDoy(by)}`, `restart under ${qty}`, `from ${fmtDoy(from)} to ${fmtDoy(to)}`, `while camp has at least ...` or `while camp has under ...`, and for a daily until `${n} a day`; a keep with forms says `in any form` after the item ("keep camp at 240 kg meat in any form"). In `src/sim/intent.ts` `startIntent`, a `daily` until becomes `{ kind: "times", n }` for the live intent.

- [ ] **Step 4: Run the tests**

Run: `npm test`
Expected: PASS. The `orderMet` signature change touches `tests/orders.test.ts` and `src/sim/reference.ts` callers; pass the calendar through.

- [ ] **Step 5: Commit**

```bash
git add src/sim/orders.ts src/sim/intent.ts src/sim/calendar.ts src/sim/reference.ts tests/orders.test.ts
git commit -m "feat(survidle): the scheduler reads a season, a stock line, a restart line, a due date and a daily count, and a keep reads its stored forms"
```

---

### Task 4: Save, the away report and the intent

**Files:**
- Modify: `src/sim/save.ts` (nothing to backfill: the fields are optional; a test proves an old order loads), `src/sim/away.ts` or wherever `AwayOrder` is built (the label already comes from `orderSentence`; confirm a daily order reports "N a day" and its completions)
- Test: `tests/advance-save.test.ts`, `tests/away.test.ts` (or the file that pins away orders)

- [ ] **Step 1: Write the failing test**

In `tests/advance-save.test.ts`, load the existing old-save fixture with an order that has no `when`, `held`, `givenDoy` or `dayOpened`, and assert `orderMet` and `conditionOpen` run on it without throwing and the order's sentence is unchanged. In the away test, a daily roots order that ran twice reports its label with "1 a day" and its done count.

- [ ] **Step 2: Run to see it fail** (it may pass already if nothing throws; keep the test, it pins the contract).

- [ ] **Step 3: Implement** whatever the test needs; expected: nothing, or `??=` defaults in `save.ts` beside the order shape fixes.

- [ ] **Step 4: Run the tests**: `npm test`.

- [ ] **Step 5: Commit**

```bash
git add src/sim/save.ts tests/advance-save.test.ts tests/away.test.ts
git commit -m "test(survidle): an old order loads with no conditions and reads as before; a daily order reports its count in the away report"
```

---

### Task 5: The Do panel and the capabilities

**Files:**
- Modify: `src/ui/render.ts` (`RowChoice` gains `when: OrderWhen` and until `"daily"`; `rowRequest` carries them), `src/ui/dopanel.ts` (`rowExpandHtml`: condition fields by rung; `kindLabel` for daily; `kindNeeds` for the rung small print), `src/main.ts` (the row's field handlers: `data-row-season-from`, `data-row-season-to`, `data-row-stock-item`, `data-row-stock-mode`, `data-row-stock-n`, `data-row-restart`, `data-row-by`), `src/sim/capabilities.ts` (the rung row's keys list five rungs), `src/sim/manual.ts` if a line names the rungs
- Test: `tests/dopanel.test.ts`, `tests/capabilities.test.ts`, `tests/ui.test.ts`

**Interfaces:**
- Produces: `RowChoice = { until: "once" | "times" | "campHas" | "keep" | "forever" | "daily"; n; deliver; where; when: OrderWhen }`; `defaultChoice()` returns `when: {}`.

- [ ] **Step 1: Write the failing tests**

In `tests/dopanel.test.ts`: `rowRequest` with `until: "daily"` yields `{ kind: "daily", n }` and kind `job`; with `when: { season: { from: 120, to: 181 } }` the request carries it. The expanded row HTML for a survivor at Foraging 15 contains `data-row-season-from`; at Foraging 12 it does not and contains "conditions at Foraging 15"; at Woodcraft 20 a keep row contains `data-row-by`. In `tests/capabilities.test.ts`: the rung row's keys are `["rung:job", "rung:grind", "rung:keep", "rung:condition", "rung:pace"]`.

- [ ] **Step 2: Run to see it fail**: `npx vitest run tests/dopanel.test.ts tests/capabilities.test.ts`.

- [ ] **Step 3: Implement**

`rowRequest`: `until === "daily"` gives `{ kind: "daily", n: choice.n }`, kind `job`; `when` is attached when any of its fields is set (`Object.keys(choice.when).length ? { when: choice.when } : {}`). `rowExpandHtml` adds a "daily" kind button; after the deliver toggle, when `skillLevel(state, gateSkill(o.id, arg)) >= RUNG_LEVEL.condition`, a `<div class="when">` with: two `<select>`s of month names (`data-row-season-from`, `data-row-season-to`, "any" first), a stock line (`<select data-row-stock-item>` over `ITEM_NAMES` keys the region has known or the pile holds, `<select data-row-stock-mode>` "at least" / "under", `<input type="number" data-row-stock-n>`), and for a keep `<input type="number" data-row-restart placeholder="restart under">`; when `>= RUNG_LEVEL.pace` and the kind is keep, `<select data-row-by>` of month names. Under the rung, `<small>conditions at ${SKILL_NAMES[skill]} 15</small>` (and "pace at ... 20") in the place of the fields, through `kindNeeds`'s wording. `main.ts` handlers write `ui.choice.when` (a month select sets `from`/`to` to the month's first day of year through the calendar's month table; "any" deletes the season). `capabilities.ts`: the rung row's keys and its text read five rungs ("jobs, grinds, keeps, conditions and pace").

- [ ] **Step 4: Run the tests**: `npm test`, then `npm run build`.

- [ ] **Step 5: Commit**

```bash
git add src/ui/render.ts src/ui/dopanel.ts src/main.ts src/sim/capabilities.ts src/sim/manual.ts tests/dopanel.test.ts tests/capabilities.test.ts tests/ui.test.ts tests/manual.test.ts
git commit -m "feat(survidle): the Do panel offers a season, a stock line, a restart line and a daily count at a skill's 15 and a due date at 20, and the capabilities name the five rungs"
```

---

### Task 6: The reference list in the vocabulary, and the runner as a returning player

**Files:**
- Modify: `src/sim/reference.ts` (`REFERENCE_ORDERS`, `wantOpen`, `ReferencePlayer`, `WOOD_DUE_DOY`, the list's doc comment), `src/sim/orders.ts` if the runner needs `keepStock` exported (Task 3 exports it)
- Test: `tests/list.test.ts`, `tests/reference.test.ts`

**Interfaces:**
- Produces: `export const WOOD_DUE_DOY = 334`; `ReferencePlayer.interventions: Map<number, number>` (day -> count) and `attention(fromDay, toDay): { mornings: number; days: number }`; `REFERENCE_ORDERS` with `when` on the wants the spec's table names; `wantOpen` reduced to the named runner rules.

- [ ] **Step 1: Write the failing tests**

Append to `tests/list.test.ts`:

```ts
  it("the wants carry their conditions, and wantOpen holds only the named runner rules", () => {
    const eggs = want("eggs::job");
    expect(eggs.req.until).toEqual({ kind: "daily", n: PLANT_HOURS_PER_ROW });
    expect(eggs.req.when).toEqual({ season: { from: EGG_FROM_DOY, to: EGG_TO_DOY } });
    const hunt = want("hunt:any:keep");
    expect(hunt.req.until).toEqual({ kind: "campHas", qty: WINTER_STOCK.driedMeatKg * 3 });
    expect(hunt.req.when).toEqual({ restart: WINTER_STOCK.driedMeatKg * 3 * 4 / 5 });
    const fish = want("fish:any:keep");
    expect(fish.req.when).toEqual({ stock: { item: "driedMeat", under: WINTER_STOCK.driedMeatKg } });
    const split = want("split::keep");
    expect(split.req.when).toEqual({ season: { from: MIDSUMMER_DOY, to: WINTER_WOOD_TO_DOY }, by: WOOD_DUE_DOY });
    expect(want("hang::grind").req.when).toEqual({ stock: { item: "rawMeat", atLeast: HANG_ABOVE_KG } });
    expect(want("cook:rawFat:grind").req.when).toEqual({ stock: { item: "rawFat", atLeast: TRACE_KG } });
    expect(want("crack::grind").req.when).toEqual({ stock: { item: "bone", atLeast: 1 } });
    expect(want("build:dryingRack:job").req.when).toEqual({ stock: { item: "rawMeat", atLeast: TRACE_KG } });
    const tasks = REFERENCE_ORDERS.map(key);
    expect(tasks.indexOf("split::keep")).toBeLessThan(tasks.indexOf("hunt:any:keep"));
  });

  it("the runner gives the plain shape under the rung and counts the morning as a returning player", () => {
    const { state, world, player } = setUpReference(17, true);
    // Kitted, all skills 20: the wood keep goes with its pace and its season and no morning is counted for it.
    stepReference({ state, world, player }, 1440 * 3);
    const paced = ordersHere(state, world).find((o) => o.req.task === "split" || o.req.task === "splitWedges");
    expect(paced?.req.when?.by).toBe(WOOD_DUE_DOY);
    expect(player.attention(1, 3).mornings).toBe(0);
  });

  it("a level-5 heir gets jobs and grinds only, and its list changes every morning the plant band re-opens", () => {
    const { state, world, player } = setUpReference(17, false);
    for (const s of SKILL_IDS) state.skills[s].xp = levelMinutes(5);
    stepReference({ state, world, player }, 1440 * 5);
    for (const o of ordersHere(state, world)) expect(o.kind).not.toBe("keep");
    expect(player.attention(1, 5).mornings).toBeGreaterThan(0);
  });
```

Update `tests/list.test.ts` keys: the plant rows are `job`s with a daily until (`roots::job`, `eggs::job`, `seaweed::job`); the sap tap `tapSap::job` with `when.season`; berries keep `when.season { from: 182, to: 120 }`.

- [ ] **Step 2: Run to see it fail**: `npx vitest run tests/list.test.ts`.

- [ ] **Step 3: Implement**

`REFERENCE_ORDERS`: the wants as the spec's section 4 table (`keep`/`job` helpers gain an optional `when` argument; a `daily` helper `daily(task, n, when?)`). The four wood keeps move above `keep("hunt", ...)` with `when: { season: { from: WINTER_WOOD_FROM_DOY, to: WINTER_WOOD_TO_DOY }, by: WOOD_DUE_DOY }`; `winterStockWant` stays for the tests that read it. `wantOpen` keeps only: water by method, fire by method, snow shelter, named hunts by level, garments by level, the spare axe by tier, the winter roots row by an axe in reach, seaweed by a sea camp. Delete the eggs, innerBark, tapSap, roots (summer), winter-stock season, dryingRack, hang, cook rawFat, crack and larder branches (their conditions are on the wants). Delete `DAILY_TASKS`, `REOPENING_TASKS`, `campFoodKcal` if unused, `WINTER_FOOD_KCAL` stays if a test reads it (the hunt band derives from the stock in kilos now; say so in the comment).

`ReferencePlayer.tick`: after `withinLadder`, compare the given request with the want's: for each part stripped, the returning-player act:
- `season` stripped: the want is open only `inSeason(cal.dayOfYear, season)`; give at the start, withdraw (removeOrder) when it closes; each is an intervention.
- `stock` stripped: open only while the stock line holds (read as `conditionOpen` would); give and withdraw likewise.
- `restart` stripped: open while `keepStock < restart` for a want the runner has withdrawn at its target, else while `keepStock < target`; withdraw when the stock reaches the target; the band by hand.
- `daily` stripped (a `times n` job): the finished mark and the banked count clear each morning (the mechanism `DAILY_TASKS` had), and the give is an intervention.
- `by` stripped: give a plain keep at `keepTargetToday` for a probe order with the want's `when`, and re-give (remove and add) when the week's target is more than the given target, at most once every seven days; each is an intervention.
For a want given with all its conditions, the order does its own reading and nothing is counted. The named runner rules' flips (a want withdrawn or given because `wantOpen` changed its answer) are interventions too. `interventions.set(cal.day, (interventions.get(cal.day) ?? 0) + 1)` on every give and withdrawal after the first morning (`this.openingDay` recorded on the first tick). `attention(from, to)` returns `{ mornings: number of days in [from, to] with a count above zero, days: to - from + 1 }`.

- [ ] **Step 4: Run the tests**: `npm test`. The reference opening snapshots and two golden epitaphs may move; update them with the prose beside them explaining the reading, not the change.

- [ ] **Step 5: Commit**

```bash
git add src/sim/reference.ts tests/list.test.ts tests/reference.test.ts tests/epitaph.test.ts
git commit -m "feat(survidle): the reference list says its seasons, stock lines, band and pace as orders, the runner gives what its skills have earned and counts every morning it plays the returning player"
```

---

### Task 7: The readings beside the gates

**Files:**
- Modify: `src/sim/reference.ts` (`unexploited` second half; `ReferenceReport` and `YearReport` carry `attention`), `src/sim/year.ts`, `scripts/reference.ts`, `scripts/year.ts` (print `attention: N mornings of M` on the month line and the pass line; the lineage's per-life line prints it too; the found line already prints kcal and firewood, keep it)
- Test: `tests/reference.test.ts`, `tests/probe.test.ts`

- [ ] **Step 1: Write the failing tests**

`unexploited()` returns entries with a third field `taken: string` ("306 kcal a day taken" or "none taken") read from `weekBefore(state.ledger, day).yield[source]` for the source each entry maps to (fat, roe, eggs, marrow for bones, roots, bark for pine ground, fish for the shore reads, sap, seaweed); `starvationCause` prints `name amount, taken`. A test: a state with roots credited 306 kcal a day for a week and roots in the ground reads "roots N kg, 306 kcal a day taken"; with nothing credited, "none taken". `weekLines` gains nothing; the scripts print attention from the report; a test on `YearReport.attention` after `runYear` on a short run reads `{ mornings, days }`.

- [ ] **Step 2: Run to see it fail**.

- [ ] **Step 3: Implement** as the test says; the month line in `scripts/year.ts` appends `; attention N of M mornings`, the pass line in `scripts/reference.ts` appends `attention: N mornings of M`, the lineage life line the same per life.

- [ ] **Step 4: Run the tests**: `npm test`.

- [ ] **Step 5: Commit**

```bash
git add src/sim/reference.ts src/sim/year.ts scripts/reference.ts scripts/year.ts tests/reference.test.ts tests/probe.test.ts
git commit -m "feat(survidle): the unexploited line says what was taken from each source in the week before a death, and every gate prints the mornings the list changed"
```

---

### Task 8: Measure, fix the runner inside the vocabulary, record

**Files:**
- Modify: `src/sim/reference.ts` (runner fixes the deaths ask for, each inside the shapes the survivor's skills have earned), the spec's section 0

- [ ] **Step 1: Run the gates** to a `runs/` directory under the SDD workspace: `npm run reference`, `npm run year`, `npm run year -- --winter`, `npm run reference -- --heir`, `npm run year -- --level=10`.

- [ ] **Step 2: Read every death** against the spec's section 6: a runner death whose fix is an order the survivor's level could give (a rank, a condition it has earned, a plain order) is fixed with a test and its own commit `fix(survidle): <change>, measured on seed N`; a death whose fix needs a rung the survivor has not reached is a finding. Never move a constant.

- [ ] **Step 3: Record** "Measured before" (the readings at HEAD before Task 6: April 5 of 5, winter 5 of 5, year 3 of 5, lineage 1 of 5) and "Measured after" in the spec's section 0: the four gates seed by seed with day and cause; each death's unexploited line with its taken half and its lean-wall days; the attention per gate (level-20 year per month, April per week, each lineage life); the named runner rules' flips; the runner fixes with the death that asked for each; findings left.

- [ ] **Step 4: Commit** the record as `docs(survidle): the order ladder measured - ...`.

---

### Task 9: Docs

**Files:**
- Modify: `docs/superpowers/specs/2026-09-03-survidle-realism-roadmap.md` (item L's Built paragraph with the readings; the build order's L clause marked built), `docs/README.md` (the standing-orders paragraph: five rungs, the conditions, keeps reading forms), `src/sim/manual.ts` if its orders line changes, the spec's Built paragraph at its foot

- [ ] **Step 1: Write them**; the README explains what is.
- [ ] **Step 2: Commit** as `docs(survidle): the order ladder as built - ...`.
