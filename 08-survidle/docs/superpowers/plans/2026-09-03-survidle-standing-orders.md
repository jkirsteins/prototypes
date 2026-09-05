# Survidle Standing Orders Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the single live intent with a ranked list of orders per camp ("keep camp at 40 kg firewood; build a cabin; otherwise fell trees forever") that a scheduler serves, waiting at camp when nothing can run, and summarised per order in the away report.

**Architecture:** A new sim module `orders.ts` owns the `Order` record, the list operations, the met rules and the scheduler `runOrders`, called from `advance` between `stepTask` and `runIntent` whenever the task slot is free. It chooses the highest unmet order that can start and makes it the live intent through the existing `startIntent`; the intent runner, body tier, hauling and every task are untouched apart from three small hooks: an `orderId` and a `windDown` flag on the intent, order counters bumped in `stepTask`, and a new intent-only `wait` task whose work step is `rest` at camp. The UI adds a keep toggle to the strip, turns a row click into "add an order", and draws the ranked list in the Doing panel. `catchUp` returns per-order deltas beside the log.

**Tech Stack:** TypeScript, Vite, vitest with happy-dom, already configured. No new dependencies.

**Spec:** `08-survidle/docs/superpowers/specs/2026-09-03-survidle-standing-orders-design.md`. Read it first; section numbers below refer to it. It extends `2026-09-03-survidle-intents-design.md`, whose runner this plan hooks into.

## Global Constraints

- The scheduler never computes a yield, an odd or a share, and never starts a task itself: every intent it makes live goes through `startIntent`, every step through the runner. If the scheduler needs a number the runner does not have, the scheduler is wrong.
- The scheduler runs only when `state.task` is null. A switch never happens mid-task. The body tier remains the only thing that takes a task over.
- The half rule, spec 1.1: a keep is unmet under half its target when idle, and stays unmet until the target once live. Only the camp pile counts.
- Log lines: a met job logs "`<label>`: done." (good) once, when the scheduler removes it. A blocked order logs "`<label>`: `<why>`." (bad) once, when its reason changes from "" to that reason. A switch logs nothing. "Nothing to do. You wait at camp." logs once when `wait` starts. Manual intents (`orderId` null) keep today's lines.
- All work is in `08-survidle/`. Run `npm test`, `npx tsc --noEmit` and `npm run build` there before every commit. Stage with explicit paths, never `git add -A`. Another session may be editing sibling prototypes on this branch.
- Every commit message ends with these two trailer lines:
  `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`
  `Claude-Session: https://claude.ai/code/session_01SJXviYwuYcLdq43h5vNo8m`
- Writing style in code, comments, log lines and docs: no em dashes, no unicode arrows or fancy quotes, only characters on a keyboard. Comments explain, they do not chronicle (no "added", "now", "previously", no dates).
- Tests run under vitest with `happy-dom`. Keep `npm test` under a few seconds: drive long runs with one `advance(state, world, minutes)` call where the assertion allows, and step minute by minute only where a trace is needed. The 72-hour test in Task 5 steps minute by minute once; it is the only one that does.

---

## File map

| file | responsibility |
|------|----------------|
| `src/sim/types.ts` | `Where`, `UntilChoice`, `IntentRequest` move here; `OrderKind`, `Order`; `RegionState.orders`, `RegionState.nextOrderId`; `Intent.orderId`, `Intent.windDown`; `"wait"` joins `TaskId` |
| `src/sim/regionstate.ts` | `newRegionState` starts `orders: []`, `nextOrderId: 1` |
| `src/sim/save.ts` | `fillDefaults` for the new fields; `catchUp` returns an `AwaySummary` |
| `src/sim/tasks.ts` | the `wait` option and its no-op completion; `beginTask` refuses `wait`; order counters in `stepTask` |
| `src/sim/intent.ts` | re-exports the moved types; `startIntent` takes an `orderId`; `wait` is camp-bound, unchecked, rests; `windDown` in `workStep`; order intents end silently; `deliveryPending` exported |
| `src/sim/orders.ts` (new) | `ordersHere`, `addOrder`, `removeOrder`, `moveOrder`, `orderById`, `keepTarget`, `orderMet`, `orderSentence`, `countWord`, `chooseOrder`, `runOrders` |
| `src/sim/advance.ts` | calls `runOrders` between `stepTask` and `runIntent` |
| `src/ui/render.ts` | `UiState.until` gains `"keep"`; `UiState.away` holds an `AwaySummary` |
| `src/ui/panels.ts` | the keep toggle; blocked rows stay clickable; `taskHtml` draws the list; `awayHtml` shows the per-order summary |
| `src/main.ts` | a row click adds an order; `order-up`, `order-down`, `order-remove`; `finish` adds a job |
| `src/style.css` | `.order`, `.order.live`, `.opt.off button.act` |
| `tests/orders.test.ts` (new) | the list, the met rules, the scheduler table, waiting, the set-up camp, per region, save and away |
| `tests/ui.test.ts`, `tests/intent.test.ts`, `tests/advance-save.test.ts` | updated for the strip, the list, `catchUp`'s return type, silent order intents |
| `docs/README.md` | how it plays, with orders |

---

### Task 1: The records, the wait option, and saves that fill them in

**Files:**
- Modify: `src/sim/types.ts` (the `TaskId` union, the `Intent` interface, the `RegionState` interface; new types)
- Modify: `src/sim/intent.ts:24-36` (the three types become re-exports)
- Modify: `src/sim/regionstate.ts:14-29` (`newRegionState`)
- Modify: `src/sim/save.ts:34-66` (`fillDefaults`)
- Modify: `src/sim/tasks.ts` (`checkFresh` switch beside `case "night"`, `complete` switch beside `case "haul": case "night":`, `beginTask`)
- Modify: `src/sim/intent.ts` (`startIntent` sets `orderId` and `windDown`)
- Test: `tests/orders.test.ts` (new)

**Interfaces:**
- Produces: `OrderKind`, `Order`, `RegionState.orders: Order[]`, `RegionState.nextOrderId: number`, `Intent.orderId: number | null`, `Intent.windDown: boolean`, `TaskId` includes `"wait"`; `check(..., "wait")` returns an ok option labelled "Wait at camp"; `beginTask(..., "wait")` returns false; `startIntent(state, world, cal, rng, req, orderId = null)`.
- `Where`, `UntilChoice`, `IntentRequest` are importable from both `./types` and `./intent`.

- [ ] **Step 1: Write the failing tests**

Create `tests/orders.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { Rng } from "../src/rng";
import { calendar } from "../src/sim/calendar";
import { startIntent } from "../src/sim/intent";
import { newGame } from "../src/sim/newgame";
import { regionState } from "../src/sim/regionstate";
import { deserialize, serialize } from "../src/sim/save";
import { beginTask, check } from "../src/sim/tasks";

const cal = calendar(0);

describe("the order record", () => {
  it("a new region has an empty list and ids start at 1", () => {
    const { state, world } = newGame(3);
    const st = regionState(state, world, state.player.region);
    expect(st.orders).toEqual([]);
    expect(st.nextOrderId).toBe(1);
  });

  it("a save without orders loads with empty lists, and a live intent without an order is manual", () => {
    const { state, world } = newGame(3);
    startIntent(state, world, cal, new Rng(1), { task: "sticks", until: { kind: "once" }, deliver: "leave", where: "nearest" });
    const raw = JSON.parse(serialize(state));
    for (const st of Object.values(raw.state.regions) as Record<string, unknown>[]) {
      delete st.orders;
      delete st.nextOrderId;
    }
    delete raw.state.intent.orderId;
    delete raw.state.intent.windDown;
    const file = deserialize(JSON.stringify(raw))!;
    const st = file.state.regions[file.state.player.region];
    expect(st.orders).toEqual([]);
    expect(st.nextOrderId).toBe(1);
    expect(file.state.intent?.orderId).toBeNull();
    expect(file.state.intent?.windDown).toBe(false);
  });

  it("a manual intent starts with no order and no wind-down", () => {
    const { state, world } = newGame(3);
    startIntent(state, world, cal, new Rng(1), { task: "sticks", until: { kind: "once" }, deliver: "leave", where: "nearest" });
    expect(state.intent?.orderId).toBeNull();
    expect(state.intent?.windDown).toBe(false);
  });

  it("waiting at camp is an option the runner can name but a task no one can start by hand", () => {
    const { state, world } = newGame(3);
    const o = check(state, world, cal, "wait");
    expect(o.ok).toBe(true);
    expect(o.label).toBe("Wait at camp");
    expect(beginTask(state, world, cal, "wait")).toBe(false);
    expect(state.task).toBeNull();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd 08-survidle && npx vitest run tests/orders.test.ts`
Expected: FAIL. `st.orders` is undefined; `check(..., "wait")` does not compile or falls through.

- [ ] **Step 3: Move the request types and add the order types**

In `src/sim/types.ts`, after the `Until` type, add:

```ts
/** Where an intent's work is done: the nearest suitable ground, a named spot, or one cell. */
export type Where = "nearest" | SpotId | { cell: number };

/** The strip's choice, before the yield item is filled in. */
export type UntilChoice =
  | { kind: "once" } | { kind: "times"; n: number } | { kind: "campHas"; qty: number } | { kind: "forever" };

/** A click on the Do panel, in the terms startIntent speaks. */
export interface IntentRequest {
  task: TaskId;
  arg?: string;
  until: UntilChoice;
  deliver: "leave" | "camp";
  where: Where;
}

/**
 * A standing order keeps a stock (keep) or grinds forever (grind); a job
 * finishes and drops off the list. All three rank together.
 */
export type OrderKind = "keep" | "grind" | "job";

export interface Order {
  /** Stable within the run; the live intent names its order by it. */
  id: number;
  kind: OrderKind;
  /** The click, as the strip made it. Cells are resolved afresh at every start. */
  req: IntentRequest;
  /** Completions of the work and minutes spent in it, for the list and the away report. */
  done: number;
  minutes: number;
  /** Why the scheduler last skipped it, or "" when it could run. */
  skipped: string;
}
```

In the `Intent` interface, after `need: BodyNeed | null;`, add:

```ts
  /** The order this intent serves, or null for one started by hand. */
  orderId: number | null;
  /** The scheduler has chosen another order: deliver what is owed, then end. */
  windDown: boolean;
```

In the `RegionState` interface, after `logsWet: number;`, add:

```ts
  /** This camp's ranked orders, top first. */
  orders: Order[];
  nextOrderId: number;
```

In the `TaskId` union, change `| "travel" | "walk" | "haul" | "night" | "rest" | "sleep";` to `| "travel" | "walk" | "haul" | "night" | "wait" | "rest" | "sleep";`.

In `src/sim/intent.ts`, delete the `Where`, `UntilChoice` and `IntentRequest` declarations (lines 24 to 36) and replace them with:

```ts
export type { IntentRequest, UntilChoice, Where } from "./types";
```

Add `IntentRequest`, `Where` to the `import type { ... } from "./types"` list at the top of `intent.ts` so the file's own uses still resolve.

- [ ] **Step 4: Start the fields, fill them in old saves, add the wait option**

In `src/sim/regionstate.ts`, in the object `newRegionState` returns, after `logsWet: 1440,` add:

```ts
    orders: [],
    nextOrderId: 1,
```

In `src/sim/save.ts`, in `fillDefaults`, after `state.intent ??= null;` add:

```ts
  if (state.intent) {
    state.intent.orderId ??= null;
    state.intent.windDown ??= false;
  }
```

and inside the `for (const st of Object.values(state.regions))` loop add:

```ts
    st.orders ??= [];
    st.nextOrderId ??= 1;
```

In `src/sim/tasks.ts`, in `checkFresh`, directly after the `case "night":` option, add:

```ts
    case "wait":
      return opt({ group: "camp", label: "Wait at camp", detail: "rest at camp until there is something to do", duration: 0 });
```

In `complete`, find the line `case "haul":` followed by `case "night":` near the end of the switch and make it:

```ts
    case "haul":
    case "night":
    case "wait":
```

In `beginTask`, after `if (id === "haul") return false;` add `if (id === "wait") return false;`.

In `src/sim/intent.ts`, change `startIntent`'s signature to:

```ts
export function startIntent(state: GameState, world: World, cal: Calendar, rng: Rng, req: IntentRequest, orderId: number | null = null): boolean {
```

and in the object it assigns to `state.intent`, after `need: null,` add `orderId, windDown: false,`.

- [ ] **Step 5: Run the tests and the type check**

Run: `cd 08-survidle && npx vitest run tests/orders.test.ts && npx tsc --noEmit`
Expected: PASS, and `tsc` clean. If `tsc` reports `"wait"` unhandled in a `Record<TaskId, ...>` somewhere (`GERUND` is `Partial`, so not there), add the case it names.

- [ ] **Step 6: Run the whole suite and commit**

Run: `cd 08-survidle && npm test`
Expected: all green; nothing here changes behaviour.

```bash
git add 08-survidle/src/sim/types.ts 08-survidle/src/sim/intent.ts 08-survidle/src/sim/regionstate.ts 08-survidle/src/sim/save.ts 08-survidle/src/sim/tasks.ts 08-survidle/tests/orders.test.ts
git commit -m "feat(survidle): the order record, the wait option, and the intent's order id

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01SJXviYwuYcLdq43h5vNo8m"
```

---

### Task 2: The list and the met rules

**Files:**
- Create: `src/sim/orders.ts`
- Test: `tests/orders.test.ts`

**Interfaces:**
- Consumes: `Order`, `OrderKind`, `IntentRequest` from Task 1; `yieldItem`, `resolveCell` from `intent.ts`; `check` from `tasks.ts`; `itemLabel` from `actions.ts`.
- Produces:
  - `ordersHere(state, world): Order[]` the list of the region under foot
  - `addOrder(state, world, req: IntentRequest, kind: OrderKind): Order` appends; keep and campHas without a yield item fall back to a `once` job; a grind's until is forced to `forever`
  - `removeOrder(state, world, id: number): void`
  - `moveOrder(state, world, id: number, dir: -1 | 1): void` up is -1
  - `orderById(state, world, id: number): Order | undefined`
  - `keepTarget(o: Order): { item: ItemId; qty: number } | null`
  - `orderMet(state, world, o: Order, live: boolean): boolean`
  - `orderSentence(state, world, cal, o: Order): string`
  - `countWord(task: TaskId, n: number): string`

- [ ] **Step 1: Write the failing tests**

Append to `tests/orders.test.ts` (add `addOrder, keepTarget, moveOrder, orderMet, orderSentence, ordersHere, removeOrder, countWord` to the imports from `../src/sim/orders`, and `addItem, pile, qty` from `../src/sim/inventory`, and `placeAtSpot` from `../src/sim/position`):

```ts
describe("the list", () => {
  it("a click appends at the bottom with the next id; up, down and remove edit the list", () => {
    const { state, world } = newGame(3);
    const a = addOrder(state, world, { task: "chop", until: { kind: "forever" }, deliver: "camp", where: "nearest" }, "grind");
    const b = addOrder(state, world, { task: "split", until: { kind: "campHas", qty: 40 }, deliver: "camp", where: "nearest" }, "keep");
    expect(ordersHere(state, world).map((o) => o.id)).toEqual([1, 2]);
    expect(a.kind).toBe("grind");
    expect(b.kind).toBe("keep");
    moveOrder(state, world, b.id, -1);
    expect(ordersHere(state, world).map((o) => o.id)).toEqual([2, 1]);
    moveOrder(state, world, b.id, -1);
    expect(ordersHere(state, world).map((o) => o.id)).toEqual([2, 1]);
    moveOrder(state, world, b.id, 1);
    expect(ordersHere(state, world).map((o) => o.id)).toEqual([1, 2]);
    removeOrder(state, world, a.id);
    expect(ordersHere(state, world).map((o) => o.id)).toEqual([2]);
    // Ids are never reused within a run.
    expect(addOrder(state, world, { task: "sticks", until: { kind: "once" }, deliver: "leave", where: "nearest" }, "job").id).toBe(3);
  });

  it("keep and camp-has need a countable yield; a build cannot be kept and becomes a once job", () => {
    const { state, world } = newGame(3);
    const o = addOrder(state, world, { task: "build", arg: "leanTo", until: { kind: "campHas", qty: 2 }, deliver: "camp", where: "nearest" }, "keep");
    expect(o.kind).toBe("job");
    expect(o.req.until).toEqual({ kind: "once" });
    expect(keepTarget(o)).toBeNull();
    const k = addOrder(state, world, { task: "split", until: { kind: "campHas", qty: 40 }, deliver: "leave", where: "nearest" }, "keep");
    expect(keepTarget(k)).toEqual({ item: "firewood", qty: 40 });
  });

  it("a grind's until is forever whatever the strip said", () => {
    const { state, world } = newGame(3);
    const o = addOrder(state, world, { task: "chop", until: { kind: "times", n: 3 }, deliver: "leave", where: "nearest" }, "grind");
    expect(o.req.until).toEqual({ kind: "forever" });
  });
});

describe("when an order is met", () => {
  it("a keep: unmet under half when idle, unmet until the target once live", () => {
    const { state, world } = newGame(3);
    const camp = pile(state, regionState(state, world, state.player.region).campCell);
    const o = addOrder(state, world, { task: "split", until: { kind: "campHas", qty: 40 }, deliver: "camp", where: "nearest" }, "keep");
    addItem(camp, "firewood", 25);
    expect(orderMet(state, world, o, false)).toBe(true);
    expect(orderMet(state, world, o, true)).toBe(false);
    addItem(camp, "firewood", 15);
    expect(orderMet(state, world, o, true)).toBe(true);
    camp.items.firewood = 19;
    expect(orderMet(state, world, o, false)).toBe(false);
    camp.items.firewood = 20;
    expect(orderMet(state, world, o, false)).toBe(true);
  });

  it("a keep counts the camp pile only, never the pack", () => {
    const { state, world } = newGame(3);
    const o = addOrder(state, world, { task: "split", until: { kind: "campHas", qty: 40 }, deliver: "camp", where: "nearest" }, "keep");
    addItem(state.player.pack, "firewood", 30);
    expect(orderMet(state, world, o, false)).toBe(false);
  });

  it("a grind is never met; jobs are met by their until, and a build by the structure standing", () => {
    const { state, world } = newGame(3);
    const st = regionState(state, world, state.player.region);
    const g = addOrder(state, world, { task: "chop", until: { kind: "forever" }, deliver: "leave", where: "nearest" }, "grind");
    expect(orderMet(state, world, g, false)).toBe(false);
    const once = addOrder(state, world, { task: "sticks", until: { kind: "once" }, deliver: "leave", where: "nearest" }, "job");
    expect(orderMet(state, world, once, false)).toBe(false);
    once.done = 1;
    expect(orderMet(state, world, once, false)).toBe(true);
    const times = addOrder(state, world, { task: "sticks", until: { kind: "times", n: 3 }, deliver: "leave", where: "nearest" }, "job");
    times.done = 2;
    expect(orderMet(state, world, times, false)).toBe(false);
    times.done = 3;
    expect(orderMet(state, world, times, false)).toBe(true);
    const has = addOrder(state, world, { task: "chop", until: { kind: "campHas", qty: 8 }, deliver: "camp", where: "nearest" }, "job");
    addItem(pile(state, st.campCell), "log", 8);
    expect(orderMet(state, world, has, false)).toBe(true);
    const build = addOrder(state, world, { task: "build", arg: "firePit", until: { kind: "once" }, deliver: "leave", where: "nearest" }, "job");
    expect(orderMet(state, world, build, false)).toBe(false);
    st.structures.firePit = true;
    expect(orderMet(state, world, build, false)).toBe(true);
  });
});

describe("what an order says", () => {
  it("reads as the intent sentence with the keep clause", () => {
    const { state, world } = newGame(3);
    const k = addOrder(state, world, { task: "split", until: { kind: "campHas", qty: 40 }, deliver: "camp", where: "nearest" }, "keep");
    expect(orderSentence(state, world, cal, k)).toBe("Split a log, keep camp at 40 kg firewood");
    const g = addOrder(state, world, { task: "chop", until: { kind: "forever" }, deliver: "camp", where: "nearest" }, "grind");
    expect(orderSentence(state, world, cal, g)).toBe("Fell a tree, forever, bringing it to camp");
    const j = addOrder(state, world, { task: "sticks", until: { kind: "times", n: 5 }, deliver: "leave", where: "forest" }, "job");
    j.done = 2;
    expect(orderSentence(state, world, cal, j)).toBe("Gather sticks, 2 of 5 done, at the forest");
    expect(countWord("chop", 14)).toBe("trees");
    expect(countWord("split", 1)).toBe("log");
    expect(countWord("repair", 3)).toBe("times");
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd 08-survidle && npx vitest run tests/orders.test.ts`
Expected: FAIL, module `../src/sim/orders` not found.

- [ ] **Step 3: Write `src/sim/orders.ts`**

```ts
/**
 * Standing orders: a ranked list per camp of keeps ("keep camp at 40 kg
 * firewood"), grinds ("fell trees forever") and jobs ("build a cabin"). The
 * scheduler below decides which order the live intent serves; the intent
 * runner does everything else, exactly as when the player clicks an intent
 * by hand.
 */
import type { World } from "../world/gen";
import { itemLabel } from "./actions";
import type { Calendar } from "./calendar";
import { pile, qty } from "./inventory";
import { resolveCell, yieldItem } from "./intent";
import { SPOT_WORDS } from "./position";
import { regionState } from "./regionstate";
import { check } from "./tasks";
import type { GameState, IntentRequest, ItemId, Order, OrderKind, StructureId, TaskId } from "./types";

/** The list of the region under foot. */
export function ordersHere(state: GameState, world: World): Order[] {
  return regionState(state, world, state.player.region).orders;
}

export function orderById(state: GameState, world: World, id: number): Order | undefined {
  return ordersHere(state, world).find((o) => o.id === id);
}

/** Appends. A keep or a camp-has without a countable yield is a once job; a grind is always forever. */
export function addOrder(state: GameState, world: World, req: IntentRequest, kind: OrderKind): Order {
  const st = regionState(state, world, state.player.region);
  let k = kind;
  let r = req;
  if ((kind === "keep" || req.until.kind === "campHas") && !yieldItem(req.task, req.arg)) {
    k = "job";
    r = { ...req, until: { kind: "once" } };
  }
  if (kind === "grind") r = { ...req, until: { kind: "forever" } };
  const o: Order = { id: st.nextOrderId++, kind: k, req: r, done: 0, minutes: 0, skipped: "" };
  st.orders.push(o);
  return o;
}

export function removeOrder(state: GameState, world: World, id: number): void {
  const st = regionState(state, world, state.player.region);
  st.orders = st.orders.filter((o) => o.id !== id);
}

/** Moves one rank up (-1) or down (1); a move off either end does nothing. */
export function moveOrder(state: GameState, world: World, id: number, dir: -1 | 1): void {
  const list = ordersHere(state, world);
  const i = list.findIndex((o) => o.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= list.length) return;
  [list[i], list[j]] = [list[j], list[i]];
}

/** The stock a keep holds and its target, or null for any other order. */
export function keepTarget(o: Order): { item: ItemId; qty: number } | null {
  if (o.kind !== "keep" || o.req.until.kind !== "campHas") return null;
  return { item: yieldItem(o.req.task, o.req.arg)!, qty: o.req.until.qty };
}

/**
 * Whether the order asks for nothing right now. A keep is unmet under half
 * its target when idle and until the target once it is the live order, so
 * one low fire does not send the runner home to split a single log. Only
 * the camp pile counts: a keep is a promise about camp.
 */
export function orderMet(state: GameState, world: World, o: Order, live: boolean): boolean {
  const st = regionState(state, world, state.player.region);
  const camp = pile(state, st.campCell);
  const keep = keepTarget(o);
  if (keep) {
    const have = qty(camp, keep.item);
    return live ? have >= keep.qty - 1e-9 : have >= keep.qty / 2 - 1e-9;
  }
  if (o.kind === "grind") return false;
  if (o.req.task === "build" && o.req.arg !== "snare") {
    return st.structures[o.req.arg as Exclude<StructureId, "snare">] === true;
  }
  const u = o.req.until;
  switch (u.kind) {
    case "once": return o.done >= 1;
    case "times": return o.done >= u.n;
    case "campHas": return qty(camp, yieldItem(o.req.task, o.req.arg)!) >= u.qty - 1e-9;
    case "forever": return false;
  }
}

/** "Split a log, keep camp at 40 kg firewood"; "Fell a tree, forever, bringing it to camp". */
export function orderSentence(state: GameState, world: World, cal: Calendar, o: Order): string {
  const { cell } = resolveCell(state, world, o.req.task, o.req.arg, o.req.where);
  const parts = [check(state, world, cal, o.req.task, o.req.arg, cell).label];
  const keep = keepTarget(o);
  const u = o.req.until;
  if (keep) parts.push(`keep camp at ${itemLabel(keep.item, keep.qty)}`);
  else if (u.kind === "times") parts.push(`${o.done} of ${u.n} done`);
  else if (u.kind === "campHas") parts.push(`until camp has ${itemLabel(yieldItem(o.req.task, o.req.arg)!, u.qty)}`);
  else if (u.kind === "forever") parts.push("forever");
  if (!keep && u.kind !== "campHas" && o.req.deliver === "camp" && o.req.task !== "haul") parts.push("bringing it to camp");
  if (typeof o.req.where === "string" && o.req.where !== "nearest") parts.push(`at ${SPOT_WORDS[o.req.where]}`);
  return parts.join(", ");
}

const COUNT_WORDS: Partial<Record<TaskId, [string, string]>> = {
  chop: ["tree", "trees"],
  split: ["log", "logs"],
  sticks: ["bundle", "bundles"],
  bark: ["strip", "strips"],
  stone: ["trip", "trips"],
  berries: ["picking", "pickings"],
  hunt: ["hunt", "hunts"],
  fish: ["cast", "casts"],
  cook: ["meal", "meals"],
  craft: ["piece", "pieces"],
};

/** The word a completion count of this work takes: "14 trees", "1 log", "3 times". */
export function countWord(task: TaskId, n: number): string {
  const w = COUNT_WORDS[task];
  if (!w) return "times";
  return n === 1 ? w[0] : w[1];
}
```

The scheduler functions come in Task 3, which adds its own imports (`intentOption`, `deliveryPending`, `startIntent`, `log`, `Rng`) beside these.

- [ ] **Step 4: Run the tests**

Run: `cd 08-survidle && npx vitest run tests/orders.test.ts && npx tsc --noEmit`
Expected: PASS. If `SPOT_WORDS` is not exported from `position.ts` under that name, use the name `intent.ts` imports it by (it imports `SPOT_WORDS` from `./position`).

- [ ] **Step 5: Lint and commit**

Run from the repo root: `npm run lint`
Expected: clean.

```bash
git add 08-survidle/src/sim/orders.ts 08-survidle/tests/orders.test.ts
git commit -m "feat(survidle): the orders list, the half rule, and what an order says

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01SJXviYwuYcLdq43h5vNo8m"
```

---

### Task 3: The scheduler

**Files:**
- Modify: `src/sim/orders.ts` (append `chooseOrder`, `runOrders`)
- Modify: `src/sim/intent.ts` (`deliveryPending` exported; `windDown` and silent ends in `workStep`)
- Modify: `src/sim/tasks.ts` (`stepTask` bumps the order's counters)
- Modify: `src/sim/advance.ts` (calls `runOrders`)
- Test: `tests/orders.test.ts`, `tests/intent.test.ts`

**Interfaces:**
- Consumes: everything from Tasks 1 and 2.
- Produces: `chooseOrder(state, world, cal): Order | null`, `runOrders(state, world, cal, rng): void`. `workStep` treats `it.windDown` as until-met. An intent with `orderId !== null` ends without a log line in every case; a manual one logs as today.

- [ ] **Step 1: Write the failing tests**

Append to `tests/orders.test.ts` (add `chooseOrder, runOrders` to the orders import, `advance` from `../src/sim/advance`, `cellOf` from `../src/sim/position`, `stopTask` from `../src/sim/tasks`, and `type IntentRequest` from `../src/sim/intent`):

```ts
type G = ReturnType<typeof newGame>;
/** Advances a minute at a time until the predicate holds or the budget runs out. */
function until(g: G, pred: () => boolean, max = 3000): boolean {
  for (let i = 0; i < max; i++) {
    if (pred()) return true;
    advance(g.state, g.world, 1);
  }
  return pred();
}
function req(task: IntentRequest["task"], extra: Partial<IntentRequest> = {}): IntentRequest {
  return { task, until: { kind: "once" }, deliver: "leave", where: "nearest", ...extra };
}
/** A camp with a pit, an axe and a fire drill, standing at the camp cell. */
function campWith(seed: number, camp: Partial<Record<"log" | "firewood" | "driedMeat" | "stick", number>>) {
  const g = newGame(seed);
  const { state, world } = g;
  const st = regionState(state, world, state.player.region);
  st.structures.firePit = true;
  state.player.tools.push({ id: "fireDrill", durability: 100 });
  placeAtSpot(state, world, state.player.region, "camp");
  const p = pile(state, st.campCell);
  for (const [item, n] of Object.entries(camp)) addItem(p, item as "log", n);
  return g;
}

describe("the scheduler", () => {
  it("takes the highest unmet order that can start, and marks the ones it passes over", () => {
    const g = campWith(3, { log: 4, firewood: 10 });
    const { state, world } = g;
    const keep = addOrder(state, world, req("split", { until: { kind: "campHas", qty: 40 }, deliver: "camp" }), "keep");
    const grind = addOrder(state, world, req("chop", { until: { kind: "forever" }, deliver: "camp" }), "grind");
    expect(chooseOrder(state, world, cal)?.id).toBe(keep.id);
    advance(state, world, 1);
    expect(state.intent?.orderId).toBe(keep.id);
    expect(state.task?.id).toBe("split");
    expect(grind.skipped).toBe("");
    // The keep filled: its intent ends, the grind takes over.
    expect(until(g, () => state.intent?.orderId === grind.id)).toBe(true);
    expect(qty(pile(state, regionState(state, world, state.player.region).campCell), "firewood")).toBeGreaterThanOrEqual(40);
    expect(keep.done).toBeGreaterThanOrEqual(2);
    expect(keep.minutes).toBeGreaterThan(0);
  });

  it("a blocked order is skipped with the button's reason, logged once, and the next order runs", () => {
    const g = campWith(3, { firewood: 5 });
    const { state, world } = g;
    const keep = addOrder(state, world, req("split", { until: { kind: "campHas", qty: 40 }, deliver: "camp" }), "keep");
    const sticks = addOrder(state, world, req("sticks", { until: { kind: "forever" } }), "grind");
    advance(state, world, 1);
    expect(keep.skipped).toBe("no logs here");
    expect(state.intent?.orderId).toBe(sticks.id);
    const line = "Split a log, keep camp at 40 kg firewood: no logs here.";
    expect(state.log.filter((e) => e.text === line).length).toBe(1);
    // Skipped again and again, but the line is written once until the reason changes.
    expect(until(g, () => state.task === null)).toBe(true);
    advance(state, world, 5);
    expect(state.log.filter((e) => e.text === line).length).toBe(1);
  });

  it("never switches mid-task, and finishes a pending delivery before it does", () => {
    const g = campWith(3, { firewood: 40 });
    const { state, world } = g;
    const st = regionState(state, world, state.player.region);
    const keep = addOrder(state, world, req("split", { until: { kind: "campHas", qty: 40 }, deliver: "camp" }), "keep");
    // Seed 3's camp sits on forest ground, so "nearest" would fell at camp itself; name the forest spot so a haul is really owed.
    const grind = addOrder(state, world, req("chop", { until: { kind: "forever" }, deliver: "camp", where: "forest" }), "grind");
    // The keep is met; the grind runs and fells a tree at the forest, off camp.
    expect(until(g, () => state.task?.id === "chop")).toBe(true);
    expect(state.intent?.orderId).toBe(grind.id);
    const forest = state.intent!.cell;
    expect(forest).not.toBe(st.campCell);
    // Firewood vanishes mid-felling: the keep is unmet, but the tree is finished first.
    pile(state, st.campCell).items.firewood = 0;
    addItem(pile(state, st.campCell), "log", 2);
    advance(state, world, 1);
    expect(state.task?.id).toBe("chop");
    expect(state.intent?.orderId).toBe(grind.id);
    expect(until(g, () => state.task?.id !== "chop")).toBe(true);
    // The felled logs lie at the forest: the grind winds down and hauls them home before the keep takes over.
    expect(state.intent?.orderId).toBe(grind.id);
    expect(state.intent?.windDown).toBe(true);
    expect(until(g, () => state.intent?.orderId === keep.id, 6000)).toBe(true);
    expect(qty(pile(state, forest), "log")).toBe(0);
    expect(cellOf(state, world)).toBe(st.campCell);
  });

  it("a met job drops off with its done line; a keep stays", () => {
    const g = campWith(3, { log: 2 });
    const { state, world } = g;
    const job = addOrder(state, world, req("split", { until: { kind: "times", n: 2 }, deliver: "camp" }), "job");
    expect(until(g, () => ordersHere(state, world).length === 0)).toBe(true);
    expect(job.done).toBe(2);
    expect(state.log.filter((e) => e.text === "Split a log, 2 of 2 done: done.").length).toBe(1);
    expect(state.intent).toBeNull();
  });

  it("removing the live order ends its intent at the next free minute; reordering takes effect then too", () => {
    const g = campWith(3, { log: 6 });
    const { state, world } = g;
    const a = addOrder(state, world, req("split", { until: { kind: "forever" } }), "grind");
    const b = addOrder(state, world, req("sticks", { until: { kind: "forever" } }), "grind");
    advance(state, world, 1);
    expect(state.intent?.orderId).toBe(a.id);
    moveOrder(state, world, b.id, -1);
    advance(state, world, 1);
    expect(state.intent?.orderId).toBe(a.id);
    expect(until(g, () => state.intent?.orderId === b.id)).toBe(true);
    removeOrder(state, world, b.id);
    expect(until(g, () => state.intent?.orderId === a.id)).toBe(true);
  });

  it("a manual intent is left alone while the region has no orders, and a raw task overrides the list until it ends", () => {
    const g = campWith(3, { log: 6 });
    const { state, world } = g;
    startIntent(state, world, cal, new Rng(1), req("sticks", { until: { kind: "forever" } }));
    advance(state, world, 30);
    expect(state.intent?.orderId).toBeNull();
    expect(state.task?.id).toBe("sticks");
    const a = addOrder(state, world, req("split", { until: { kind: "forever" } }), "grind");
    expect(until(g, () => state.intent?.orderId === a.id)).toBe(true);
    stopTask(state, world);
    beginTask(state, world, cal, "rest");
    advance(state, world, 30);
    expect(state.intent).toBeNull();
    expect(state.task?.id).toBe("rest");
    expect(until(g, () => state.intent?.orderId === a.id)).toBe(true);
  });
});
```

In `tests/intent.test.ts`, the test "refuses to start what cannot start, and ends with the button's words when the work runs out" stays as it is: a manual intent still logs "You stop.".

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd 08-survidle && npx vitest run tests/orders.test.ts`
Expected: FAIL, `chooseOrder` and `runOrders` are not exported.

- [ ] **Step 3: The hooks in `intent.ts`, `tasks.ts` and `advance.ts`**

In `src/sim/intent.ts`:

Export `deliveryPending` (change `function deliveryPending(` to `export function deliveryPending(`).

In `workStep`, replace the block that begins `const o = UNCHECKED.has(it.task) ? null : check(...)` through the `return undefined;` that ends the met/blocked branch with:

```ts
  const o = UNCHECKED.has(it.task) ? null : check(state, world, cal, it.task, it.arg, it.cell);
  const met = it.windDown || untilMet(state, it);
  if (met || (o && !o.ok)) {
    if (deliveryPending(state, it)) return deliveryStep(state, world, cal, it);
    // An order's intent says nothing: the scheduler removes a met job with its
    // done line and re-judges a blocked one, logging the reason once.
    if (it.orderId !== null || it.windDown) state.intent = null;
    else if (met) endIntent(state, `${label}: done.`, "good");
    else endIntent(state, `${label}: ${o!.why}. You stop.`, "bad");
    return undefined;
  }
```

In `src/sim/tasks.ts`, add a helper above `stepTask`:

```ts
/** The order the live intent serves, when it serves one and the task under way is its work. */
function liveOrderFor(state: GameState, world: World, id: TaskId, arg?: string): Order | null {
  const it = state.intent;
  if (!it || it.orderId === null) return null;
  if (it.task !== id || (it.arg ?? "") !== (arg ?? "")) return null;
  return regionState(state, world, state.player.region).orders.find((o) => o.id === it.orderId) ?? null;
}
```

Add `Order` to the `import type { ... } from "./types"` list. In `stepTask`, after `train(state, world, dt);` add:

```ts
  const order = liveOrderFor(state, world, t.id, t.arg);
  if (order) order.minutes += dt;
```

and inside the `if (it) {` block, change `if (it.task === id && (it.arg ?? "") === (arg ?? "")) it.done++;` to:

```ts
    if (it.task === id && (it.arg ?? "") === (arg ?? "")) {
      it.done++;
      const o = liveOrderFor(state, world, id, arg);
      if (o) o.done++;
    }
```

Note `liveOrderFor` reads `state.intent`, which is still set at that point of `stepTask` (`state.task` has been cleared, `state.intent` has not).

In `src/sim/advance.ts`, import `runOrders` from `./orders` and change the two lines

```ts
  stepTask(state, world, cal, rng, dt);
  runIntent(state, world, cal, rng);
```

to

```ts
  stepTask(state, world, cal, rng, dt);
  runOrders(state, world, cal, rng);
  runIntent(state, world, cal, rng);
```

- [ ] **Step 4: The scheduler in `orders.ts`**

Add `deliveryPending`, `intentOption`, `startIntent` to the `./intent` import, `log` from `./log`, and `import type { Rng } from "../rng";`. Append:

```ts
/** Sets the skip reason and logs it once when it changes from nothing to something. */
function markSkipped(state: GameState, world: World, cal: Calendar, o: Order, why: string): void {
  if (why && !o.skipped) log(state, `${orderSentence(state, world, cal, o)}: ${why}.`, "bad");
  o.skipped = why;
}

/**
 * The first order, top down, that is unmet and can start where its work
 * would be done. Every order passed over is marked with its reason; the
 * ones below the choice are left as they were.
 */
export function chooseOrder(state: GameState, world: World, cal: Calendar): Order | null {
  const liveId = state.intent?.orderId ?? null;
  for (const o of ordersHere(state, world)) {
    if (orderMet(state, world, o, o.id === liveId)) {
      markSkipped(state, world, cal, o, "");
      continue;
    }
    const opt = intentOption(state, world, cal, o.req.task, o.req.arg, o.req.where);
    if (!opt.ok) {
      markSkipped(state, world, cal, o, opt.why);
      continue;
    }
    o.skipped = "";
    return o;
  }
  return null;
}

const WAIT: IntentRequest = { task: "wait", until: { kind: "forever" }, deliver: "leave", where: "nearest" };

/**
 * Runs each minute with a free task slot. Met jobs drop off. Then the
 * chosen order becomes the live intent: at once when nothing is owed to
 * camp, after the delivery when something is. With orders but nothing to
 * do, the runner waits at camp, where the nights are safe.
 */
export function runOrders(state: GameState, world: World, cal: Calendar, rng: Rng): void {
  if (state.dead || state.task) return;
  const st = regionState(state, world, state.player.region);
  if (!st.orders.length) return;
  const live = state.intent;
  for (const o of [...st.orders]) {
    if (o.kind === "job" && orderMet(state, world, o, live?.orderId === o.id)) {
      log(state, `${orderSentence(state, world, cal, o)}: done.`, "good");
      removeOrder(state, world, o.id);
    }
  }
  const chosen = chooseOrder(state, world, cal);
  if (chosen && live?.orderId === chosen.id) return;
  if (!chosen && live?.task === "wait") return;
  if (live && deliveryPending(state, live)) {
    live.windDown = true;
    return;
  }
  if (chosen) {
    if (!startIntent(state, world, cal, rng, chosen.req, chosen.id)) markSkipped(state, world, cal, chosen, "cannot start");
    return;
  }
  startIntent(state, world, cal, rng, WAIT);
  log(state, "Nothing to do. You wait at camp.");
}
```

`startIntent` calls `stopTask`, which clears the outgoing intent; the slot is already free so nothing is set aside.

- [ ] **Step 5: Run the tests**

Run: `cd 08-survidle && npx vitest run tests/orders.test.ts tests/intent.test.ts && npx tsc --noEmit`
Expected: PASS. The `wait` intent started at the end of `runOrders` will not rest yet (Task 4 teaches `workStep` what `wait` does); the tests in this task never reach a wait, since every list has a grind. If "a met job drops off" ends with `state.intent` non-null because the region has no orders left and the runner still holds the job's intent, check the order of operations in `runOrders`: the met job is removed, `chooseOrder` finds nothing, the live intent's `orderId` no longer matches, `deliveryPending` is false, so the code reaches the wait branch with an empty list. Guard it: after the removal loop, `if (!st.orders.length) { if (live) state.intent = null; return; }`. Add that guard; it is what "a region with no orders has no intent" (spec 2.3) means.

- [ ] **Step 6: Run everything, lint, commit**

Run: `cd 08-survidle && npm test && npx tsc --noEmit` and from the repo root `npm run lint`.

```bash
git add 08-survidle/src/sim/orders.ts 08-survidle/src/sim/intent.ts 08-survidle/src/sim/tasks.ts 08-survidle/src/sim/advance.ts 08-survidle/tests/orders.test.ts
git commit -m "feat(survidle): the scheduler serves the highest unmet order, delivery first, silently

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01SJXviYwuYcLdq43h5vNo8m"
```

---

### Task 4: Waiting at camp

**Files:**
- Modify: `src/sim/intent.ts` (`CAMP_BOUND`, `UNCHECKED`, `GERUND`, `workStep`)
- Test: `tests/orders.test.ts`

**Interfaces:**
- Consumes: `runOrders` starting a `wait` intent (Task 3).
- Produces: a live `wait` intent walks to the home camp and starts `rest` there every free minute; the body tier serves sleep, cold and hunger as for any intent.

- [ ] **Step 1: Write the failing tests**

Append to `tests/orders.test.ts` (add `calendar` is already imported; add `regionAt` from `../src/world/gen` if not present):

```ts
describe("waiting at camp", () => {
  it("with orders but nothing to do, the runner walks home, rests, and sleeps at camp with the fire lit", () => {
    const g = campWith(3, { firewood: 60, driedMeat: 3 });
    const { state, world } = g;
    const st = regionState(state, world, state.player.region);
    // Off camp, so the wait has to walk. A keep already met is the whole list.
    placeAtSpot(state, world, state.player.region, "heath");
    addOrder(state, world, req("split", { until: { kind: "campHas", qty: 40 }, deliver: "camp" }), "keep");
    advance(state, world, 1);
    expect(state.intent?.task).toBe("wait");
    expect(state.task?.id).toBe("walk");
    expect(state.log.some((e) => e.text === "Nothing to do. You wait at camp.")).toBe(true);
    expect(until(g, () => state.task?.id === "rest")).toBe(true);
    expect(cellOf(state, world)).toBe(st.campCell);
    expect(state.intent?.step).toBe("waiting at camp");
    // Through the night: asleep at camp, by a fire lit from the firewood there.
    expect(until(g, () => state.task?.id === "sleep", 1500)).toBe(true);
    expect(cellOf(state, world)).toBe(st.campCell);
    expect(st.fire.lit).toBe(true);
    // The wait is not an order and the list still has the one keep.
    expect(ordersHere(state, world).length).toBe(1);
    expect(state.intent?.orderId).toBeNull();
  });

  it("a keep that becomes unmet takes over from the wait at once", () => {
    const g = campWith(3, { firewood: 60, log: 3 });
    const { state, world } = g;
    const st = regionState(state, world, state.player.region);
    const keep = addOrder(state, world, req("split", { until: { kind: "campHas", qty: 40 }, deliver: "camp" }), "keep");
    advance(state, world, 2);
    expect(state.intent?.task).toBe("wait");
    pile(state, st.campCell).items.firewood = 10;
    expect(until(g, () => state.intent?.orderId === keep.id, 120)).toBe(true);
  });

  it("a region with no orders has no intent of its own", () => {
    const { state, world } = newGame(3);
    advance(state, world, 10);
    expect(state.intent).toBeNull();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd 08-survidle && npx vitest run tests/orders.test.ts -t "waiting"`
Expected: FAIL. The wait intent starts but never rests: `state.task` stays null or the intent ends.

- [ ] **Step 3: Teach the runner what wait does**

In `src/sim/intent.ts`:

Change `const CAMP_BOUND = new Set<TaskId>(["split", "cook", "light", "repair", "sharpen"]);` to include `"wait"`:

```ts
const CAMP_BOUND = new Set<TaskId>(["split", "cook", "light", "repair", "sharpen", "wait"]);
```

Change `const UNCHECKED = new Set<TaskId>(["night", "rest", "sleep"]);` to:

```ts
const UNCHECKED = new Set<TaskId>(["night", "rest", "sleep", "wait"]);
```

In `workStep`, replace

```ts
  if (it.task === "night") return undefined;
  const step: Step = { id: it.task, arg: it.arg, step: workGerund(state, world, it) };
```

with

```ts
  if (it.task === "night") return undefined;
  // Waiting is resting at camp, started afresh each time the slot frees; the body tier does the rest.
  const step: Step = it.task === "wait"
    ? { id: "rest", step: "waiting at camp" }
    : { id: it.task, arg: it.arg, step: workGerund(state, world, it) };
```

`resolveCell` already routes `CAMP_BOUND` work to the home camp cell, so a wait started on the heath walks to camp through rule 4 (`here !== it.cell`).

- [ ] **Step 4: Run the tests**

Run: `cd 08-survidle && npx vitest run tests/orders.test.ts && npx tsc --noEmit`
Expected: PASS. If the sleep assertion fails because the character sleeps before the fire is lit, that is the body tier's own ordering (pit, split, light, then sleep) and means the fixture lacks something: check `st.structures.firePit` is true and the drill is in `state.player.tools`. If `until(..., 1500)` runs out before night, the test started at minute 0 (1 April, 00:00 is night; the walk and rest run into the sleep need immediately), so the sleep should come early; print `state.player.energy` and `calendar(state.minute).isNight` to see which need holds.

- [ ] **Step 5: Run everything, lint, commit**

```bash
git add 08-survidle/src/sim/intent.ts 08-survidle/tests/orders.test.ts
git commit -m "feat(survidle): with orders but nothing to do, the runner waits at camp

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01SJXviYwuYcLdq43h5vNo8m"
```

---

### Task 5: A set-up camp, and lists per region

**Files:**
- Test: `tests/orders.test.ts`

**Interfaces:**
- Consumes: Tasks 1 to 4. No production code changes are expected; if one is needed, it is a bug in an earlier task and belongs in that file.

- [ ] **Step 1: Write the tests**

Append to `tests/orders.test.ts` (add `startTask` to the tasks import, `regionAt` from `../src/world/gen`):

```ts
describe("a set-up camp", () => {
  it("keeps the fire, the sticks and the felling going for three days, every night at camp", () => {
    const g = campWith(3, { log: 6, firewood: 30, driedMeat: 5 });
    const { state, world } = g;
    const st = regionState(state, world, state.player.region);
    const wood = addOrder(state, world, req("split", { until: { kind: "campHas", qty: 40 }, deliver: "camp" }), "keep");
    const sticks = addOrder(state, world, req("sticks", { until: { kind: "campHas", qty: 30 }, deliver: "camp" }), "keep");
    const trees = addOrder(state, world, req("chop", { until: { kind: "forever" }, deliver: "camp" }), "grind");
    let sleptElsewhere = 0;
    let sleeps = 0;
    let prev: string | undefined;
    for (let m = 0; m < 72 * 60; m++) {
      advance(state, world, 1);
      const id = state.task?.id;
      if (id === "sleep" && prev !== "sleep") {
        sleeps++;
        if (cellOf(state, world) !== st.campCell) sleptElsewhere++;
      }
      prev = id;
    }
    expect(state.dead).toBeNull();
    expect(sleeps).toBeGreaterThanOrEqual(2);
    expect(sleptElsewhere).toBe(0);
    expect(wood.done).toBeGreaterThanOrEqual(1);
    expect(sticks.done).toBeGreaterThanOrEqual(1);
    expect(trees.done).toBeGreaterThanOrEqual(3);
    expect(state.stats.trees).toBe(trees.done);
    // The counters are the completions: minutes in the work, none from walks or hauls.
    expect(trees.minutes).toBeGreaterThan(0);
    expect(qty(pile(state, st.campCell), "log")).toBeGreaterThan(0);
  });
});

describe("orders belong to a camp", () => {
  it("the next region has its own empty list, and the first list resumes on return", () => {
    const g = campWith(3, { log: 6 });
    const { state, world } = g;
    const home = state.player.region;
    const a = addOrder(state, world, req("split", { until: { kind: "forever" } }), "grind");
    advance(state, world, 1);
    expect(state.intent?.orderId).toBe(a.id);
    const nb = regionAt(world, home).neighbours[0].id;
    expect(startTask(state, world, calendar(state.minute), "travel", `region:${nb}`)).toBe(true);
    expect(state.intent).toBeNull();
    expect(until(g, () => state.player.region === nb, 6000)).toBe(true);
    expect(until(g, () => state.task === null, 6000)).toBe(true);
    advance(state, world, 5);
    expect(ordersHere(state, world)).toEqual([]);
    expect(state.intent).toBeNull();
    expect(startTask(state, world, calendar(state.minute), "travel", `region:${home}`)).toBe(true);
    expect(until(g, () => state.player.region === home && state.task === null, 6000)).toBe(true);
    advance(state, world, 5);
    expect(ordersHere(state, world).map((o) => o.id)).toEqual([a.id]);
    expect(state.intent?.orderId).toBe(a.id);
  });
});
```

- [ ] **Step 2: Run the tests**

Run: `cd 08-survidle && npx vitest run tests/orders.test.ts`
Expected: PASS. The 72-hour loop is 4,320 single-minute advances; it should take well under a second. If `sleptElsewhere` is not 0, read the log for "No way to camp" (a route problem in the fixture region: pick another seed with a forest spot near camp, the intent tests use 3 and 21) or for the collapse line "Too tired to stand" (the body tier is not running: the intent was null at that minute, which is a scheduler bug from Task 3). If a travel does not arrive within 6,000 minutes, the neighbour is across water; pick `neighbours.find((n) => n.km < 6)` instead of `[0]`.

- [ ] **Step 3: Commit**

```bash
git add 08-survidle/tests/orders.test.ts
git commit -m "test(survidle): a set-up camp runs three days on its orders; lists belong to their camp

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01SJXviYwuYcLdq43h5vNo8m"
```

---

### Task 6: The away report

**Files:**
- Modify: `src/sim/save.ts` (`catchUp` returns an `AwaySummary`)
- Modify: `src/ui/render.ts:11` (`UiState.away`)
- Modify: `src/ui/panels.ts:416-425` (`awayHtml`)
- Modify: `src/main.ts` (the two `catchUp` call sites and `awayHtml`)
- Test: `tests/orders.test.ts`, `tests/advance-save.test.ts`, `tests/ui.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface AwayOrder { label: string; task: TaskId; done: number; minutes: number; skipped: string; gone: boolean }
  export interface AwaySummary { entries: LogEntry[]; orders: AwayOrder[]; movedTo: string | null }
  export function catchUp(state, world, realSecondsElapsed, speed = 1): AwaySummary
  export function awayHtml(away: AwaySummary, realSeconds: number, capped: boolean): string
  ```
- `UiState.away: AwaySummary | null`.

- [ ] **Step 1: Write the failing tests**

Append to `tests/orders.test.ts` (add `catchUp` to the save import):

```ts
describe("the away report", () => {
  it("summarises every order of the camp you left: what it did, what blocks it, what finished", () => {
    const g = campWith(3, { log: 6, firewood: 10 });
    const { state, world } = g;
    const keep = addOrder(state, world, req("split", { until: { kind: "campHas", qty: 40 }, deliver: "camp" }), "keep");
    const job = addOrder(state, world, req("sticks", { until: { kind: "once" } }), "job");
    addOrder(state, world, req("build", { arg: "cabin", until: { kind: "once" } }), "job");
    const grind = addOrder(state, world, req("chop", { until: { kind: "forever" }, deliver: "camp" }), "grind");
    const away = catchUp(state, world, 4 * 3600);
    expect(away.movedTo).toBeNull();
    expect(away.orders.map((o) => o.label)).toEqual([
      orderSentence(state, world, calendar(state.minute), keep),
      "Gather sticks",
      "Build a cabin",
      orderSentence(state, world, calendar(state.minute), grind),
    ]);
    const [k, j, c, t] = away.orders;
    expect(k.done).toBe(keep.done);
    expect(k.minutes).toBe(keep.minutes);
    expect(j.gone).toBe(true);
    expect(j.done).toBe(1);
    expect(c.skipped).toBe("missing materials at camp");
    expect(c.done).toBe(0);
    expect(t.task).toBe("chop");
    expect(t.done).toBe(grind.done);
    expect(away.entries.length).toBeGreaterThan(0);
  });

  it("counts only what happened while away", () => {
    const g = campWith(3, { log: 6 });
    const { state, world } = g;
    const grind = addOrder(state, world, req("split", { until: { kind: "forever" } }), "grind");
    advance(state, world, 60);
    const before = grind.done;
    expect(before).toBeGreaterThan(0);
    const away = catchUp(state, world, 1800);
    expect(away.orders[0].done).toBe(grind.done - before);
  });

  it("a save mid-order resumes the same order", () => {
    const g = campWith(3, { log: 6 });
    const { state, world } = g;
    const a = addOrder(state, world, req("split", { until: { kind: "forever" } }), "grind");
    advance(state, world, 5);
    const file = deserialize(serialize(state))!;
    const s2 = file.state;
    expect(s2.intent?.orderId).toBe(a.id);
    catchUp(s2, world, 120);
    expect(s2.intent?.orderId).toBe(a.id);
    expect(regionState(s2, world, s2.player.region).orders[0].done).toBeGreaterThan(a.done);
  });
});
```

In `tests/advance-save.test.ts`, every use of `catchUp`'s return value as an array (`.length`, `.some`, `.filter`, `.map`) becomes `.entries.length` and so on. Search the file for `catchUp(` and update each. In `tests/ui.test.ts`, if `awayHtml` is called anywhere, pass `{ entries, orders: [], movedTo: null }`.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd 08-survidle && npx vitest run tests/orders.test.ts -t "away"`
Expected: FAIL, `away.orders` is undefined.

- [ ] **Step 3: `catchUp` snapshots and diffs**

In `src/sim/save.ts`, replace `catchUp` with:

```ts
export interface AwayOrder {
  label: string;
  task: TaskId;
  /** Completions and minutes since the player left. */
  done: number;
  minutes: number;
  /** Why it is blocked now, or "". */
  skipped: string;
  /** Finished and dropped off the list while away. */
  gone: boolean;
}

export interface AwaySummary {
  entries: LogEntry[];
  /** One per order of the camp the player left, in rank order. */
  orders: AwayOrder[];
  /** The region the player is in now, when it is not the one they left. */
  movedTo: string | null;
}

/**
 * Simulates the time the tab was closed and returns what happened meanwhile:
 * the log, and each order's share of it. Runs one-minute steps, the same
 * steps the foreground loop takes.
 */
export function catchUp(state: GameState, world: World, realSecondsElapsed: number, speed = 1): AwaySummary {
  const seconds = Math.min(MAX_OFFLINE_SECONDS, Math.max(0, realSecondsElapsed));
  const minutes = seconds * GAME_MINUTES_PER_REAL_SECOND * speed;
  const before = state.log.length;
  const firstMinute = state.minute;
  const region = state.player.region;
  const cal = calendar(state.minute);
  // The whole order is copied: a job that finishes while away is removed with
  // its counters, and its "until" is what says how many completions that took.
  const snap = ordersHere(state, world).map((o) => ({ ...o, label: orderSentence(state, world, cal, o) }));
  advance(state, world, minutes);
  const after = regionState(state, world, region).orders;
  const orders = snap.map((s) => {
    const o = after.find((x) => x.id === s.id);
    const u = s.req.until;
    const finished = u.kind === "times" ? u.n : 1;
    return {
      label: s.label,
      task: s.req.task,
      done: o ? o.done - s.done : Math.max(0, finished - s.done),
      minutes: (o?.minutes ?? s.minutes) - s.minutes,
      skipped: o?.skipped ?? "",
      gone: !o,
    };
  });
  return {
    entries: state.log.slice(before).filter((e) => e.minute > firstMinute),
    orders,
    movedTo: state.player.region === region ? null : regionAt(world, state.player.region).name,
  };
}
```

Imports needed in `save.ts`: `calendar` from `./calendar`, `ordersHere, orderSentence` from `./orders`, `regionState` from `./regionstate`, `regionAt` from `../world/gen`, and `TaskId` in the types import.

- [ ] **Step 4: The UI side**

In `src/ui/render.ts`, change `away: LogEntry[] | null;` to `away: AwaySummary | null;` and import `type AwaySummary` from `../sim/save`; drop `LogEntry` from the import if it is no longer used.

In `src/ui/panels.ts`, replace `awayHtml` with:

```ts
function awayOrderLine(o: AwayOrder): string {
  const did = o.done > 0 ? `${o.done} ${countWord(o.task, o.done)}, ${fmtDuration(o.minutes)}` : "";
  const now = o.gone ? "done" : o.skipped ? `blocked, ${o.skipped}` : did ? "" : "nothing to do";
  return `<div class="e ${o.skipped && !o.gone ? "bad" : ""}">${esc(o.label)}: ${esc([did, now].filter(Boolean).join("; "))}.</div>`;
}

export function awayHtml(away: AwaySummary, realSeconds: number, capped: boolean): string {
  const h = Math.floor(realSeconds / 3600);
  const m = Math.floor((realSeconds % 3600) / 60);
  const gameMin = realSeconds * GAME_MINUTES_PER_REAL_SECOND;
  const moved = away.movedTo ? `<p>You are now in ${esc(away.movedTo)}.</p>` : "";
  const orders = away.orders.length ? `<div class="entries orders">${away.orders.map(awayOrderLine).join("")}</div>` : "";
  const entries = away.entries;
  return `<div class="box">
<h1>While you were away</h1>
<p>${h ? `${h} h ` : ""}${m} min of the clock; ${fmtDuration(gameMin)} in the north${capped ? " (a day is as much as the world runs on without you)" : ""}.</p>
${moved}${orders}
${entries.length ? `<div class="entries">${entries.slice(-40).map((e) => `<div class="e ${e.kind ?? ""}"><time>${fmtLogTime(e)}</time>${esc(e.text)}</div>`).join("")}</div>` : "<p class=\"dim\">Nothing worth telling.</p>"}
<button class="act" data-act="dismiss">Continue</button>
</div>`;
}
```

Import `type AwayOrder, type AwaySummary` from `../sim/save` and `countWord` from `../sim/orders` in `panels.ts`.

In `src/main.ts`, the two places that do `ui.away = catchUp(...)` or `const entries = catchUp(...); ui.away = entries;` assign the summary directly; `awayHtml(ui.away, ...)` needs no change. Add to `src/style.css`, after the `.entries` rules if any, or at the end:

```css
.entries.orders { margin-bottom: 8px; border-bottom: 1px dotted var(--line); padding-bottom: 6px; }
```

- [ ] **Step 5: Run the tests, the type check, the build**

Run: `cd 08-survidle && npm test && npx tsc --noEmit && npm run build`
Expected: all green. `tsc` is what finds every remaining caller that treated `catchUp`'s result as an array.

- [ ] **Step 6: Commit**

```bash
git add 08-survidle/src/sim/save.ts 08-survidle/src/ui/render.ts 08-survidle/src/ui/panels.ts 08-survidle/src/main.ts 08-survidle/src/style.css 08-survidle/tests/orders.test.ts 08-survidle/tests/advance-save.test.ts 08-survidle/tests/ui.test.ts
git commit -m "feat(survidle): the away report says what each order did and what blocks it

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01SJXviYwuYcLdq43h5vNo8m"
```

---

### Task 7: The Do panel and the Orders panel

**Files:**
- Modify: `src/ui/render.ts:16` (`UiState.until`)
- Modify: `src/ui/panels.ts` (`stripSentence`, `intentRowHtml`, `stripHtml`, `taskHtml`)
- Modify: `src/main.ts` (`intent`, `finish`, new `order-up`, `order-down`, `order-remove`)
- Modify: `src/style.css`
- Test: `tests/ui.test.ts`

**Interfaces:**
- Consumes: `addOrder`, `moveOrder`, `removeOrder`, `ordersHere`, `orderMet`, `orderSentence`, `countWord` from Task 2.
- Produces: `UiState.until: "once" | "times" | "campHas" | "keep" | "forever"`; a row click adds an order; `taskHtml` renders `.order` rows with `data-act="order-up|order-down|order-remove"` and `data-id`.

- [ ] **Step 1: Write the failing tests**

Append to `tests/ui.test.ts` (add `addOrder, moveOrder` from `../src/sim/orders`, `advance` from `../src/sim/advance`):

```ts
describe("the Orders panel", () => {
  it("the strip offers keep, and a blocked row is still a button", () => {
    const { state, world } = newGame(3);
    const ui = { ...newUiState(), until: "keep" as const, n: 40 };
    const html = doHtml(state, world, calendar(0), ui);
    expect(html).toContain('data-k="until" data-v="keep"');
    expect(html).toContain("keep camp at 40 kg firewood");
    // Split needs logs this camp has none of: dim, with the reason, and still clickable.
    expect(html).toMatch(/class="opt off" data-opt="intent:split:"><button class="act" data-act="intent" data-id="split"/);
    expect(html).toContain("no logs here");
  });

  it("lists the orders in rank order with their state, counters and buttons", () => {
    const g = newGame(3);
    const { state, world } = g;
    const st = regionState(state, world, state.player.region);
    st.structures.firePit = true;
    state.player.tools.push({ id: "fireDrill", durability: 100 });
    placeAtSpot(state, world, state.player.region, "camp");
    addItem(pile(state, st.campCell), "log", 6);
    addItem(pile(state, st.campCell), "firewood", 60);
    const keep = addOrder(state, world, { task: "split", until: { kind: "campHas", qty: 40 }, deliver: "camp", where: "nearest" }, "keep");
    const cabin = addOrder(state, world, { task: "build", arg: "cabin", until: { kind: "once" }, deliver: "leave", where: "nearest" }, "job");
    const grind = addOrder(state, world, { task: "sticks", until: { kind: "forever" }, deliver: "camp", where: "nearest" }, "grind");
    advance(state, world, 3);
    const cal = calendar(state.minute);
    let html = taskHtml(state, world, cal);
    expect(html).toContain("<h2>Orders</h2>");
    expect(html.indexOf(`data-id="${keep.id}"`)).toBeLessThan(html.indexOf(`data-id="${cabin.id}"`));
    expect(html).toContain("met");
    expect(html).toContain("missing materials at camp");
    expect(html).toContain("gathering sticks");
    expect(html).toContain('id="bar-task"');
    expect(html.split('id="bar-task"').length).toBe(2);
    expect(html).toContain(`data-act="order-up" data-id="${keep.id}" disabled`);
    expect(html).toContain(`data-act="order-down" data-id="${grind.id}" disabled`);
    expect(html).toContain(`data-act="order-remove" data-id="${cabin.id}"`);
    expect(html).not.toContain('data-act="stop"');
    // Counters appear once the work has completed.
    for (let i = 0; i < 400 && grind.done === 0; i++) advance(state, world, 1);
    html = taskHtml(state, world, calendar(state.minute));
    expect(html).toMatch(new RegExp(`${grind.done} bundle`));
    // Moving the cabin up shows in the next render.
    moveOrder(state, world, cabin.id, -1);
    html = taskHtml(state, world, calendar(state.minute));
    expect(html.indexOf(`data-id="${cabin.id}"`)).toBeLessThan(html.indexOf(`data-id="${keep.id}"`));
  });

  it("shows the wait with the rest bar when nothing can run", () => {
    const g = newGame(3);
    const { state, world } = g;
    const st = regionState(state, world, state.player.region);
    placeAtSpot(state, world, state.player.region, "camp");
    addItem(pile(state, st.campCell), "firewood", 60);
    addOrder(state, world, { task: "split", until: { kind: "campHas", qty: 40 }, deliver: "camp", where: "nearest" }, "keep");
    advance(state, world, 2);
    const html = taskHtml(state, world, calendar(state.minute));
    expect(html).toContain("Waiting at camp");
    expect(html).toContain('id="bar-task"');
  });
});
```

Also in `tests/ui.test.ts`, find any test asserting that an intent row that cannot start has no button (search for `opt off` and `not.toContain('data-act="intent"')` or similar) and update it to expect the button with the reason in its small print.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd 08-survidle && npx vitest run tests/ui.test.ts -t "Orders"`
Expected: FAIL: no keep toggle, no `<h2>Orders</h2>`.

- [ ] **Step 3: The strip and the rows**

In `src/ui/render.ts`, change `until: "once" | "times" | "campHas" | "forever";` to `until: "once" | "times" | "campHas" | "keep" | "forever";`.

In `src/ui/panels.ts`:

`stripSentence`: replace the body after `const item = yieldItem(id, arg);` with:

```ts
  if (ui.until === "times") parts.push(`${ui.n} times`);
  else if (ui.until === "campHas") parts.push(item ? `until camp has ${itemLabel(item, ui.n)}` : "once");
  else if (ui.until === "keep") parts.push(item ? `keep camp at ${itemLabel(item, ui.n)}` : "once");
  else if (ui.until === "forever") parts.push("forever");
  if (item && (ui.deliver === "camp" || ui.until === "campHas" || ui.until === "keep")) parts.push("bringing it to camp");
  else if (!item && ui.deliver === "camp") parts.push("bringing it to camp");
  if (ui.where !== "nearest") parts.push(`at ${SPOT_NAMES[ui.where]}`);
  return parts.join(", ");
```

`intentRowHtml`: the `!o.ok` branch becomes a button too:

```ts
  if (!o.ok) {
    return `<div class="opt off" data-opt="intent:${o.id}:${esc(arg)}"><button class="act" data-act="intent" data-id="${o.id}" data-arg="${esc(arg)}" title="Add it anyway; it waits until it can start">${esc(o.label)}${rec}<small>${esc(o.why)}${detail ? ` - ${esc(detail)}` : ""}</small>${bar}</button></div>`;
  }
```

`stripHtml`: in the "do it" line, between the `campHas` and `forever` buttons, insert:

```ts
${b("until", "keep", "keep camp at N", ui.until === "keep")}
```

Add to `src/style.css` beside `.opt.off span.act`:

```css
.opt.off button.act { color: var(--dim); background: transparent; }
.opt.off button.act small { color: #5d6570; }
```

- [ ] **Step 4: The Orders panel**

In `src/ui/panels.ts`, import `ordersHere, orderMet, orderSentence, countWord` from `../sim/orders`. Add above `taskHtml`:

```ts
const TASK_BAR = `<div class="bar task"><div class="fill" id="bar-task"></div><span class="lbl"><span id="val-task"></span><span id="task-pct"></span></span></div>`;

/** The ranked list: each row its sentence, counters, state and buttons; the live row carries the task bar. */
function ordersHtml(state: GameState, world: World, cal: Calendar): string {
  const orders = ordersHere(state, world);
  const it = state.intent;
  const waiting = it?.task === "wait"
    ? `<div class="step">Waiting at camp: ${esc(it.step)}</div>${state.task ? TASK_BAR : ""}`
    : "";
  const rows = orders.map((o, i) => {
    const live = it?.orderId === o.id;
    const counts = o.done > 0 ? ` <small>${o.done} ${countWord(o.req.task, o.done)}, ${fmtDuration(o.minutes)}</small>` : "";
    const second = live
      ? `<div class="step">${esc(it!.step)}</div>${state.task ? TASK_BAR : ""}`
      : `<div class="step">${esc(o.skipped || (orderMet(state, world, o, false) ? "met" : "waiting"))}</div>`;
    const btns = `<span class="ctl"><button class="mini" data-act="order-up" data-id="${o.id}" ${i === 0 ? "disabled" : ""}>up</button> <button class="mini" data-act="order-down" data-id="${o.id}" ${i === orders.length - 1 ? "disabled" : ""}>down</button> <button class="mini" data-act="order-remove" data-id="${o.id}" title="Take it off the list">x</button></span>`;
    return `<div class="order${live ? " live" : ""}"><div class="head"><b>${i + 1}. ${esc(orderSentence(state, world, cal, o))}</b>${counts}${btns}</div>${second}</div>`;
  }).join("");
  return `${waiting}${rows}`;
}
```

Then rewrite `taskHtml` so it reads:

```ts
export function taskHtml(state: GameState, world: World, cal: Calendar): string {
  const t = state.task;
  const it = state.intent;
  const orders = ordersHere(state, world);
  const aside = pausedList(state, world, cal);
  const asideHtml = aside.length
    ? ... (unchanged) ...
    : "";
  // A scheduled intent is drawn as its row; a manual one, or a raw task, as a head of its own.
  const scheduled = it !== null && (it.task === "wait" || orders.some((o) => o.id === it.orderId));
  let head = "";
  if (it && !scheduled) {
    head = `<div class="head"><b>${esc(intentSentence(state, world, cal, it))}</b><button class="mini" data-act="stop" title="Stop; the share done is kept">stop</button></div>
<div class="step">${esc(it.step)}</div>${t ? TASK_BAR : ""}`;
  } else if (!it && t) {
    const opts = availableTasks(state, world, cal);
    let label = opts.find((o) => o.id === t.id && (o.arg ?? "") === (t.arg ?? ""))?.label ?? t.id;
    if ((t.id === "walk" || t.id === "travel") && state.route) label = `${t.id === "travel" ? "Go" : "Walk"} to ${state.route.label}`;
    head = `<div class="head"><b>${esc(label)}${t.repeat ? " <span class=\"r\">on repeat</span>" : ""}</b><button class="mini" data-act="stop" title="Set it aside; the share done is kept">stop</button></div>${TASK_BAR}`;
  } else if (!it && !orders.length) {
    head = `<div class="dim">Nothing. Pick something below.</div>`;
  }
  const list = orders.length ? ordersHtml(state, world, cal) : "";
  return `<h2>${orders.length ? "Orders" : "Doing"}</h2>${head}${list}${asideHtml}`;
}
```

Keep the `asideHtml` block exactly as it is today (the `aside.map(...)` with resume and finish buttons). Delete the old `const bar = ...` local since `TASK_BAR` replaces it.

Add to `src/style.css`:

```css
#task .order { padding: 4px 0; border-top: 1px dotted var(--line); }
#task .order:first-of-type { border-top: 0; }
#task .order.live { border-left: 2px solid var(--accent); padding-left: 6px; }
#task .order .head { gap: 6px; }
#task .order .ctl { white-space: nowrap; }
```

- [ ] **Step 5: The click handlers**

In `src/main.ts`, import `addOrder, moveOrder, removeOrder` from `./sim/orders`, `type OrderKind, type UntilChoice` from `./sim/types`, and drop `intentOption` and `log` from the imports if nothing else uses them.

Replace the `case "intent":` block with:

```ts
    case "intent": {
      const kind: OrderKind = ui.until === "keep" ? "keep" : ui.until === "forever" ? "grind" : "job";
      const until: UntilChoice = ui.until === "times" ? { kind: "times", n: ui.n }
        : ui.until === "campHas" || ui.until === "keep" ? { kind: "campHas", qty: ui.n }
        : ui.until === "forever" ? { kind: "forever" }
        : { kind: "once" };
      addOrder(state, world, { task: target.dataset.id as TaskId, arg: target.dataset.arg || undefined, until, deliver: ui.deliver, where: ui.where }, kind);
      break;
    }
```

Replace the `case "finish":` block with:

```ts
    case "finish": {
      const id = target.dataset.id as TaskId;
      const arg = target.dataset.arg || undefined;
      // Located work names its cell; carried work has none, so it resolves through
      // "nearest" - camp for camp-bound work, wherever the player stands for craft.
      const where: Where = target.dataset.cell !== undefined ? { cell: Number(target.dataset.cell) } : "nearest";
      addOrder(state, world, { task: id, arg, until: { kind: "once" }, deliver: "leave", where }, "job");
      break;
    }
```

Add three cases:

```ts
    case "order-up":
      moveOrder(state, world, Number(target.dataset.id), -1);
      break;
    case "order-down":
      moveOrder(state, world, Number(target.dataset.id), 1);
      break;
    case "order-remove":
      removeOrder(state, world, Number(target.dataset.id));
      break;
```

The `case "task":` block for `haul` and `night` stays: they start manual intents. The `case "strip":` block needs no change; `"keep"` arrives as `v` and is assigned.

- [ ] **Step 6: Run everything**

Run: `cd 08-survidle && npm test && npx tsc --noEmit && npm run build` and from the repo root `npm run lint`.
Expected: all green. The existing test "the Doing panel reads the intent as a sentence with its step" still passes: a manual intent draws the head with its stop button, and with no orders the heading is "Doing".

- [ ] **Step 7: Commit**

```bash
git add 08-survidle/src/ui/render.ts 08-survidle/src/ui/panels.ts 08-survidle/src/main.ts 08-survidle/src/style.css 08-survidle/tests/ui.test.ts
git commit -m "feat(survidle): a row click adds an order; the Doing panel draws the ranked list

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01SJXviYwuYcLdq43h5vNo8m"
```

---

### Task 8: The README and the browser pass

**Files:**
- Modify: `docs/README.md` ("How it plays")

- [ ] **Step 1: Rewrite the first bullet of "How it plays"**

Replace the bullet that begins `- **You say what, the game does how.**` with:

```markdown
- **You give orders, the game keeps them.** Every button adds an order to
  this camp's list; the strip above says what kind: once, N times, until
  camp has N, keep camp at N, or forever. Keeps and forevers are standing
  orders. "Keep camp at 40 kg firewood" triggers when the pile drops under
  20 and splits back up to 40; "Fell trees, forever, bringing it to camp"
  soaks up every spare hour. Jobs ("build a cabin", "make 20 arrows") drop
  off when done. The list is ranked: each free minute the game serves the
  highest order that is unmet and can start, finishes any load it owes
  camp first, and never switches mid-task. A blocked order shows why
  ("needs an axe", "missing materials at camp") and waits; a job placed
  above the grind that will haul its logs in is how a cabin gets built
  while you are away. With orders but nothing to do, you wait at camp,
  where the nights are by the fire. The game does the walking, the work,
  the hauling, and when the body asks for it, the walk back to camp, a
  fire from what is at camp, and the night's sleep. An "advanced" toggle
  shows the raw single actions underneath, one at a time.
- **Orders belong to a camp.** Walk into a new region and its list is
  empty; come back and the old list resumes.
```

Under "Away", after "a panel tells you what happened", add: "and, above the log, what each order did while you were gone and what any of them is blocked on."

- [ ] **Step 2: Commit the doc**

```bash
git add 08-survidle/docs/README.md
git commit -m "docs(survidle): how orders play

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01SJXviYwuYcLdq43h5vNo8m"
```

- [ ] **Step 3: The browser pass**

Start the dev server from `08-survidle` (`npm run dev`) and open `http://127.0.0.1:5173/prototypes/08/?seed=3&speed=60`. In the console, set up a camp:

```js
const s = survidle.state, w = survidle.world;
const st = s.regions[s.player.region];
st.structures.firePit = true;
s.player.tools.push({ id: "fireDrill", durability: 100, litres: 0, frozen: false });
const camp = s.piles[st.campCell] ??= { items: {}, stacks: {} };
camp.items.log = 6; camp.items.firewood = 30; camp.items.driedMeat = 5;
```

Then in the Do panel: choose "keep camp at N" with 40 and click Split a log; choose "forever" and "to camp" and click Fell a tree; choose "once" and click Build under Cabin (it is dim, with "missing materials at camp", and still adds). Watch for a day and a night at speed 60 (24 game hours is 24 real seconds):

- The list reads 1. Split a log, keep camp at 40 kg firewood / 2. Fell a tree, forever, bringing it to camp / 3. Build a cabin, with the felling live, the keep "met", and the cabin's reason under it.
- At night the felling row's step reads "walking to camp for the night", then "lighting the fire", then "sleeping"; the fire glows on the map.
- After the fire burns firewood down through 20 kg, the keep's row goes live, the character splits at camp, the counters on the keep row count logs, and the felling resumes when firewood is back at 40.
- Use the up and down buttons to put the cabin above the keep, and remove it with x.

Then the away report: with the character mid-felling, run in the console

```js
localStorage.setItem("survidle.save", JSON.stringify({ ...JSON.parse(localStorage.getItem("survidle.save")), savedAt: Date.now() - 2 * 3600 * 1000 }));
```

and reload without the `?seed` parameter (a seed in the URL restarts the run). The "While you were away" panel shows one line per order above the log: the keep with its logs split, the felling with its trees and hours, the cabin blocked on materials or, if the logs came in, finished.

What would look wrong: a row's step and the bar out of step with the log; a switch happening while a tree is half felled (the felling's set-aside share appearing in the list); the character sleeping in the forest with a lit camp two cells away; the same "no logs here" line repeating every minute in the log; two task bars on screen.

Stop the dev server when done.

---

## Self-review against the spec

- Section 1 (orders, kinds, counters, keep fallback): Tasks 1 and 2.
- Section 1.1 (the half rule): Task 2 `orderMet`.
- Section 1.2 (jobs drop off, blocked jobs stay): Task 3 `runOrders`.
- Section 2 and 2.1 (position in `advance`, choosing, re-judging each free minute): Task 3.
- Section 2.2 (same order, delivery first via `windDown`, silent switch, nothing to do): Task 3; the `windDown` handling in `workStep`.
- Section 2.3 (wait at camp, `wait` refused by `startTask`, no intent without orders): Tasks 1, 3 and 4.
- Section 2.4 (the raw list overrides until it ends): Task 3's last scheduler test; no code beyond `startTask` clearing the intent as today.
- Section 3 (strip with keep, clickable blocked rows, a click appends): Task 7.
- Section 3.1 (the Orders panel rows, states, buttons, wait line, aside list): Task 7.
- Section 3.2 (log lines): Task 3 (`done.` on removal, the reason once on change, the wait line); manual intents unchanged.
- Section 4 (the away report, snapshot and diff, gone jobs, moved region): Task 6.
- Section 5 (persistence, defaults, a manual intent from an old save): Task 1.
- Section 6 (removals): Task 3's `workStep` change.
- Section 7 (tests): Tasks 1 to 7 cover each listed test; the browser pass is Task 8.
