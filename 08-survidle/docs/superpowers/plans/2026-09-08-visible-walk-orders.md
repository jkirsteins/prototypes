# Visible Walk Orders Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every same-region walk a visible once-only queue order, including direct map walks and walks required by work or care.

**Architecture:** Add one queue operation that inserts an exact-cell Walk order before the row that requires it. Work and care planning call that operation instead of starting hidden walk tasks; the existing walk task becomes the execution of the visible Walk order and credits normal order completion.

**Tech Stack:** TypeScript, Vite, Vitest, DOM-rendered HTML/CSS

**Spec:** `docs/superpowers/specs/2026-09-08-visible-walk-orders-design.md`

## Global Constraints

- Same-region walking always has a visible queue row.
- Direct and generated Walk rows use the same order and task lifecycle.
- Exact map destinations never retarget to a nearest compatible cell.
- Generated Walk rows are movable and removable.
- A requester regenerates a missing Walk row only when it becomes eligible again.
- Rendering and dry judgement never mutate the queue.
- Region travel, exploration, and route-home search remain out of scope.
- Idle remains no intent and no task.
- Do not rename any player stats.
- Do not run tests or builds during this implementation; update tests as specifications and leave execution to the user's playtest.

---

### Task 1: Represent and insert exact Walk orders

**Files:**
- Modify: `src/sim/orders.ts`
- Modify: `src/sim/ladder.ts`
- Modify: `src/sim/types.ts`
- Test: `tests/orders.test.ts`
- Test: `tests/ladder.test.ts`

**Interfaces:**
- Produces: `insertWalkBefore(state, world, cell, beforeId): WorkOrder`
- Produces: `isWalkOrder(order): boolean`
- Consumes: existing `addOrder`, `ordersHere`, `IntentRequest`, and exact `Where` cells

- [ ] **Step 1: Add specification tests for exact insertion and idempotence**

Add tests which create a work row, call `insertWalkBefore`, and assert this shape:

```ts
const work = addOrder(state, world, {
  task: "fish", arg: "any", until: { kind: "once" },
  deliver: "leave", where: "nearest",
}, "job");
const walk = insertWalkBefore(state, world, target, work.id);
expect(ordersHere(state, world).map((o) => o.id)).toEqual([1, 2, walk.id, work.id]);
expect(walk.req).toEqual({
  task: "walk", arg: `cell:${target}`, until: { kind: "once" },
  deliver: "leave", where: { cell: target },
});
expect(insertWalkBefore(state, world, target, work.id).id).toBe(walk.id);
```

Also specify that insertion with `beforeId = null` places a direct Walk at the whole queue top, above care rows.

- [ ] **Step 2: Add the Walk-order helpers**

Implement the helpers around the existing order-list splice rather than routing through ladder skill gates:

```ts
export function isWalkOrder(o: Order): o is WorkOrder {
  return isWorkOrder(o) && o.req.task === "walk";
}

export function insertWalkBefore(
  state: GameState, world: World, cell: number, beforeId: number | null,
): WorkOrder {
  const rows = ordersHere(state, world);
  const before = beforeId === null ? 0 : rows.findIndex((o) => o.id === beforeId);
  const at = before < 0 ? rows.length : before;
  const existing = rows[at - 1];
  if (
    existing && isWalkOrder(existing) &&
    typeof existing.req.where === "object" && existing.req.where.cell === cell
  ) return existing;
  const st = regionState(state, world, state.player.region);
  const order: WorkOrder = {
    id: st.nextOrderId++, kind: "job",
    req: { task: "walk", arg: `cell:${cell}`, until: { kind: "once" }, deliver: "leave", where: { cell } },
    done: 0, minutes: 0, skipped: "",
  };
  rows.splice(at, 0, order);
  return order;
}
```

Use a real object check such as `typeof existing.req.where === "object" && existing.req.where.cell === cell`; do not introduce a string encoding for the `where` comparison.

- [ ] **Step 3: Treat Walk as an allowed internal order task**

Keep Walk out of skill gating and standing-order controls, but remove comments and assertions claiming it can never be an order. `insertWalkBefore` is the sole creation door, so no new Do-panel kind choices are needed.

- [ ] **Step 4: Inspect the task diff**

Run only static inspection:

```bash
git diff --check -- src/sim/orders.ts src/sim/ladder.ts src/sim/types.ts tests/orders.test.ts tests/ladder.test.ts
rg -n 'insertWalkBefore|isWalkOrder' src tests
```

- [ ] **Step 5: Commit the representation change**

```bash
git add src/sim/orders.ts src/sim/ladder.ts src/sim/types.ts tests/orders.test.ts tests/ladder.test.ts
git commit -m "refactor: represent walks as queue orders"
```

### Task 2: Execute Walk rows through the normal order lifecycle

**Files:**
- Modify: `src/sim/intent.ts`
- Modify: `src/sim/tasks.ts`
- Modify: `src/sim/orders.ts`
- Modify: `src/sim/save.ts`
- Test: `tests/intent.test.ts`
- Test: `tests/orders.test.ts`
- Test: `tests/advance-save.test.ts`

**Interfaces:**
- Consumes: `insertWalkBefore` and exact Walk requests from Task 1
- Produces: Walk WorkIntents that start the existing walk task and increment `order.done` on arrival

- [ ] **Step 1: Specify normal Walk-order execution**

Add a test that inserts a Walk row, advances until arrival, and asserts:

```ts
expect(state.intent?.orderId).toBe(walk.id);
expect(state.task?.id).toBe("walk");
advance(state, world, enoughMinutes);
expect(cellOf(state, world)).toBe(target);
expect(ordersHere(state, world).some((o) => o.id === walk.id)).toBe(false);
```

Add a second test that removes or moves the row while active and verifies the existing set-aside and queue-change rules apply without a movement-specific cancellation path.

- [ ] **Step 2: Allow `startIntent` to own Walk orders**

Remove the `req.task === "walk"` refusal. Resolve an exact-cell Walk from `req.where`, retain `arg: cell:N`, and avoid applying delivery, kit, or yield behavior to it.

At the head of `workStep`, handle the Walk order as its own work rather than treating the target as a hidden prerequisite:

```ts
if (it.task === "walk") {
  if (here === it.cell) {
    finishWalkIntent(state, world, it);
    return "again";
  }
  takeStep(state, world, cal, walkStep(state, world, it.cell, ""));
  return undefined;
}
```

- [ ] **Step 3: Credit arrival to the Walk order**

Refactor `stepWalk` to report arrival. When an owned Walk task arrives, increment the live Walk intent and its order exactly once before clearing the task. Let the ordinary next scheduler pass remove the completed once job.

Do not credit interrupted, blocked, or thin-ice-ended walks.

- [ ] **Step 4: Migrate walks already in progress**

During save loading, when `state.task.id === "walk"` and `state.route` has a target:

- insert a Walk job at the correct position;
- bind the live intent to that Walk order;
- retain `state.route`, task progress, destination, and current position;
- leave an existing scheduled parent row immediately after the Walk row;
- create a once parent work row after the Walk row only for a legacy hand intent that had no order.

Keep legacy synthetic wait cleanup intact.

- [ ] **Step 5: Inspect the task diff**

```bash
git diff --check -- src/sim/intent.ts src/sim/tasks.ts src/sim/orders.ts src/sim/save.ts tests/intent.test.ts tests/orders.test.ts tests/advance-save.test.ts
rg -n 'req.task === "walk"|task === "walk"|finishWalkIntent' src/sim
```

- [ ] **Step 6: Commit Walk execution**

```bash
git add src/sim/intent.ts src/sim/tasks.ts src/sim/orders.ts src/sim/save.ts tests/intent.test.ts tests/orders.test.ts tests/advance-save.test.ts
git commit -m "refactor: execute walking through the queue"
```

### Task 3: Materialize every work-related walk as a queue row

**Files:**
- Modify: `src/sim/intent.ts`
- Modify: `src/sim/orders.ts`
- Test: `tests/intent.test.ts`
- Test: `tests/orders.test.ts`
- Test: `tests/fill.test.ts`

**Interfaces:**
- Consumes: `insertWalkBefore(state, world, cell, beforeId)`
- Produces: `queueWalk(state, world, intent, cell): void`
- Removes: hidden `walkTo(...): Outcome` task creation

- [ ] **Step 1: Specify outward, delivery, return, and material-fetch walks**

For each case, advance one scheduler decision and assert that a visible Walk row sits immediately before the requesting row while no hidden walk task belongs to the requester:

```ts
const rows = ordersHere(state, world);
const at = rows.findIndex((o) => o.id === work.id);
expect(isWalkOrder(rows[at - 1])).toBe(true);
expect(rows[at - 1].req.where).toEqual({ cell: expectedCell });
expect(state.intent?.orderId).not.toBe(work.id);
```

Cover initial travel to work, a loaded return to camp, a return for another load, and a build fetching a material pile.

- [ ] **Step 2: Replace hidden movement with queue materialization**

Implement one handoff used by outward work, delivery, and fetch planning:

```ts
function queueWalk(state: GameState, world: World, it: WorkIntent, cell: number): void {
  if (cellOf(state, world) === cell) return;
  insertWalkBefore(state, world, cell, it.orderId);
  state.intent = null;
}
```

For hand work with `orderId === null`, first materialize its original request as a once work row, then insert the Walk immediately before it. This ensures a manual remote action also becomes wholly queue-visible instead of losing its requester.

Replace every call that currently starts `walkStep` from `walkTo`, `deliveryStep`, or `fetchStep` with this handoff. Preserve instant loading, unloading, laying out materials, provisioning, and fire banking as local effects, but no branch may call `takeStep(...walkStep...)` unless the active intent itself is a Walk order.

- [ ] **Step 3: Preserve exact and nearest targeting rules**

Resolve the requester's work cell once for the generated Walk row. The requester keeps its original `where` choice and re-evaluates after arrival. Exact `{ cell }` requests remain exact; nearest requests may select a new nearest usable cell only on a later execution cycle after the prior Walk row is complete or removed.

- [ ] **Step 4: Inspect the task diff**

```bash
git diff --check -- src/sim/intent.ts src/sim/orders.ts tests/intent.test.ts tests/orders.test.ts tests/fill.test.ts
rg -n 'walkStep\(' src/sim/intent.ts src/sim/bodyorder.ts
```

The only `walkStep` call left in work execution must be the branch whose active row is itself Walk.

- [ ] **Step 5: Commit work prerequisite materialization**

```bash
git add src/sim/intent.ts src/sim/orders.ts tests/intent.test.ts tests/orders.test.ts tests/fill.test.ts
git commit -m "refactor: queue work travel explicitly"
```

### Task 4: Materialize care-related walks as queue rows

**Files:**
- Modify: `src/sim/bodyorder.ts`
- Modify: `src/sim/body.ts`
- Modify: `src/sim/orders.ts`
- Test: `tests/bodyorder.test.ts`
- Test: `tests/needs.test.ts`
- Test: `tests/wayhome.test.ts`

**Interfaces:**
- Consumes: `insertWalkBefore(state, world, cell, careOrder.id)`
- Produces: care service that inserts Walk for movement steps and uses CareIntent only for non-movement steps

- [ ] **Step 1: Specify body and camp prerequisite walks**

Add cases for a body going to camp and camp maintenance going to snares. Each should assert an exact Walk row immediately before the relevant care row, with the care row itself remaining permanent.

Also assert that drinking, eating, resting, sleeping, and feeding a fire do not create Walk rows when served where the survivor stands.

- [ ] **Step 2: Convert care walk steps into queue rows**

In `serveNeed`, distinguish movement from non-movement:

```ts
if (s.id === "walk") {
  const cell = Number((s.arg ?? "").split(":")[1]);
  setAside(state, world);
  state.intent = null;
  insertWalkBefore(state, world, cell, o.id);
  return;
}
```

Keep the existing CareIntent path for concrete rest, sleep, and other non-walk steps. Do not create a CareIntent merely to preserve a generated Walk.

- [ ] **Step 3: Remove obsolete care-walk ownership branches**

Delete comments and state handling that assume a CareIntent can own a walk. Body and camp needs are re-read after arrival and either complete immediately or choose their next concrete care step.

- [ ] **Step 4: Inspect the task diff**

```bash
git diff --check -- src/sim/bodyorder.ts src/sim/body.ts src/sim/orders.ts tests/bodyorder.test.ts tests/needs.test.ts tests/wayhome.test.ts
rg -n 'takeStep\(.*walk|CareIntent.*walk|mode.*care' src/sim
```

- [ ] **Step 5: Commit care prerequisite materialization**

```bash
git add src/sim/bodyorder.ts src/sim/body.ts src/sim/orders.ts tests/bodyorder.test.ts tests/needs.test.ts tests/wayhome.test.ts
git commit -m "refactor: queue care travel explicitly"
```

### Task 5: Route map clicks and UI through Walk orders

**Files:**
- Modify: `src/main.ts`
- Modify: `src/ui/panels.ts`
- Modify: `src/ui/map.ts`
- Test: `tests/ui.test.ts`
- Test: `tests/orderpanel.test.ts`

**Interfaces:**
- Consumes: `insertWalkBefore(state, world, cell, null)`
- Produces: direct map clicks as top-ranked visible Walk jobs

- [ ] **Step 1: Specify direct map click queue behavior**

Extract or exercise the map-click command and assert that clicking a known same-region cell creates a top Walk row instead of directly assigning `state.task`.

Specify queue HTML containing the Walk title and `once` metadata, and central activity HTML containing one progress bar only while that row is active.

- [ ] **Step 2: Replace direct task startup in the map handler**

Change the map click from:

```ts
startTask(state, world, cal, "walk", `cell:${cell}`, false, rng);
```

to:

```ts
insertWalkBefore(state, world, cell, null);
runOrders(state, world, cal, rng);
```

Preserve the existing known-cell and same-region guards, target highlighting, RNG write-back, save, and render calls.

- [ ] **Step 3: Keep progress and metadata single-sourced**

Use the existing `activity(...).progress` decision for the central bar. The queue row displays `once` and `blocked` metadata in its header but does not draw another task bar.

- [ ] **Step 4: Inspect the task diff**

```bash
git diff --check -- src/main.ts src/ui/panels.ts src/ui/map.ts tests/ui.test.ts tests/orderpanel.test.ts
rg -n 'startTask\(.*"walk"|insertWalkBefore' src/main.ts src/ui src/sim
```

The map click must no longer start a raw walk task.

- [ ] **Step 5: Commit the visible map walk**

```bash
git add src/main.ts src/ui/panels.ts src/ui/map.ts tests/ui.test.ts tests/orderpanel.test.ts
git commit -m "feat: show map walks in the activity queue"
```

### Task 6: Remove the old hidden-walk architecture

**Files:**
- Modify: `src/sim/intent.ts`
- Modify: `src/sim/orders.ts`
- Modify: `src/sim/bodyorder.ts`
- Modify: `src/sim/types.ts`
- Modify: `src/sim/reference.ts`
- Modify: `docs/ux.md`
- Test: `tests/intent.test.ts`
- Test: `tests/orders.test.ts`
- Test: `tests/reference.test.ts`

**Interfaces:**
- Removes: hidden prerequisite `walkTo` and any intent state used only to preserve it
- Preserves: exact work targeting, delivery state, care priority, and current stat names

- [ ] **Step 1: Add an architectural guard test**

Add source-level or behavior-level assertions that all same-region walk tasks have a live Walk order and that work and care intents never own a task with `id === "walk"` unless their own request task is Walk.

```ts
if (state.task?.id === "walk" && state.intent) {
  expect(isWorkIntent(state.intent)).toBe(true);
  expect(state.intent.task).toBe("walk");
  expect(ordersHere(state, world).some((o) => o.id === state.intent!.orderId && isWalkOrder(o))).toBe(true);
}
```

- [ ] **Step 2: Delete obsolete state and branches**

Remove `walkTo`, movement reasons stored only for hidden steps, and any WorkIntent or CareIntent fields that are no longer used after all movement is materialized. Keep `cell` where the local work and delivery model still requires it; do not delete it merely because outward travel moved into the queue.

Update the reference player so its same-region movement observes visible Walk rows rather than assuming a raw movement task is outside the list.

- [ ] **Step 3: Document the final mental model**

Update `docs/ux.md` to state:

```md
The queue contains every same-region action the survivor will perform. When an
action needs another cell, it places an exact once-only Walk immediately before
itself. The central strip shows the active row's current task and progress.
```

- [ ] **Step 4: Perform the final static audit**

Do not run tests or builds. Run:

```bash
git diff --check
rg -n 'walkTo\(|startTask\(.*"walk"|takeStep\(.*walkStep' src
rg -n 'task: "wait"|case "wait"|CARE_REQ|WAITING_STEP|HAND_REST' src tests
git status --short
```

Expected results:

- no hidden same-region walk starter remains;
- no removed wait mechanism has returned, except quoted legacy migration checks in `save.ts`;
- no whitespace errors are reported;
- unrelated dirty files remain unstaged.

- [ ] **Step 5: Commit the cleanup**

```bash
git add src/sim/intent.ts src/sim/orders.ts src/sim/bodyorder.ts src/sim/types.ts src/sim/reference.ts docs/ux.md tests/intent.test.ts tests/orders.test.ts tests/reference.test.ts
git commit -m "refactor: remove hidden walking orchestration"
```

### Task 7: User playtest handoff

**Files:**
- No code changes required

**Interfaces:**
- Consumes: completed Tasks 1 through 6
- Produces: a concise manual verification script for the user

- [ ] **Step 1: Report verification limits**

State explicitly that no automated tests or builds were run at the user's request.

- [ ] **Step 2: Provide the playtest cases**

Ask the user to verify:

1. Clicking an exact known map cell adds and executes a visible Walk row to that exact cell.
2. Starting Fish or Fell from elsewhere inserts a Walk row directly above it.
3. Removing that Walk leaves the requester intact; when eligible again, it creates a fresh Walk.
4. Moving the Walk elsewhere in the queue obeys its new rank.
5. Delivery and return trips appear as Walk rows.
6. Self-care and camp-maintenance trips appear as Walk rows.
7. Idle survivors do not move and show no progress bar.
8. The central strip shows one Walk progress bar and the queue shows no duplicate bar.

- [ ] **Step 3: Leave the working tree scoped**

Use `git status --short` to report changed files. Do not stage, revert, or commit unrelated existing work.
