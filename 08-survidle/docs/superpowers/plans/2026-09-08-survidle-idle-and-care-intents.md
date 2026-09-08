# Idle and Care Intents Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Represent idleness with null state, represent care with a dedicated intent, and make queue and activity presentation derive from explicit semantics.

**Architecture:** Split `Intent` into work and care variants. Remove `wait` from tasks and scheduling, let null task state use the existing passive rest simulation, and expose progress and queue metadata explicitly to the UI.

**Tech Stack:** TypeScript, Vite, Vitest, HTML/CSS

**Spec:** `docs/superpowers/specs/2026-09-08-survidle-idle-and-care-intents-design.md`

## Global Constraints

- Keep the body stat label `Wet` unchanged.
- Remove both public and internal wait tasks and intents.
- Do not run tests or builds during this playtest pass.
- Preserve unrelated dirty-worktree changes.

---

### Task 1: Split work intents from care intents

**Files:**
- Modify: `src/sim/types.ts`
- Modify: `src/sim/bodyorder.ts`
- Modify: `src/sim/steps.ts`
- Modify: `src/sim/intent.ts`
- Modify: `src/sim/tasks.ts`
- Modify: `src/sim/save.ts`
- Test: `tests/bodyorder.test.ts`
- Test: `tests/advance-save.test.ts`

**Interfaces:**
- Produces: `WorkIntent`, `CareIntent`, `isWorkIntent(intent): intent is WorkIntent`
- Produces: `startCareIntent(state, world, order, need): CareIntent`
- Consumes: existing `CareNeed`, `Order`, `Step`, and task completion flow

- [ ] **Step 1: Update intent specifications without running them**

Add assertions that a served care row has `mode === "care"`, owns its concrete
need, and has no work-task request. Add a save migration assertion that an old
`task: "wait"` intent loads as null.

- [ ] **Step 2: Define the discriminated intent model**

```ts
export interface WorkIntent extends IntentBase {
  mode: "hand" | "runner";
  task: TaskId;
  // existing work-only targeting and completion fields
}

export interface CareIntent {
  mode: "care";
  care: "body" | "camp";
  need: CareNeed;
  orderId: number;
  step: string;
  restFromWarmth?: number;
}

export type Intent = WorkIntent | CareIntent;
export const isWorkIntent = (it: Intent | null): it is WorkIntent => !!it && it.mode !== "care";
```

- [ ] **Step 3: Create care intents directly**

Replace `CARE_REQ` and `startIntent(...CARE_REQ...)` in `serveNeed` with a
`CareIntent` carrying the row kind, need, row id, and step text. `takeStep`
continues to write common step text and records rest warmth on runner or care
intents. `runIntent` immediately returns for care intents because `runOrders`
owns them.

- [ ] **Step 4: Narrow all work-only consumers**

Guard intent labeling, delivery, provisioning, task completion, hurry logic,
night checks, and save migration with `isWorkIntent`. Care task completion may
clear body-need state and measure warming, but never increments work counts.

- [ ] **Step 5: Remove legacy wait intents on load**

Before treating persisted intent data as the new union, clear records whose
legacy task is `wait`. A real care need is reconstructed by `runOrders` on the
next minute.

### Task 2: Remove wait from scheduling and task catalogs

**Files:**
- Modify: `src/sim/types.ts`
- Modify: `src/sim/orders.ts`
- Modify: `src/sim/tasks.ts`
- Modify: `src/sim/intent.ts`
- Modify: `src/sim/player.ts`
- Modify: `src/ui/dopanel.ts`
- Test: `tests/orders.test.ts`
- Test: `tests/tasks.test.ts`
- Test: `tests/hand.test.ts`
- Test: `tests/hurry.test.ts`

**Interfaces:**
- Consumes: `isWorkIntent`
- Produces: null intent/task when no queue row can run

- [ ] **Step 1: Update idle scheduler specifications without running them**

Replace expectations for synthetic wait intents with null intent, null task,
and unchanged cell. Remove task-catalog expectations for `wait`.

- [ ] **Step 2: Delete wait as a task**

Remove `wait` from `TaskId`, `TASK_IDS`, `CAMP_BOUND`, task option generation,
activity and idle-task tables, gerunds, hurry policy, and any task switches.

- [ ] **Step 3: Make no runnable row genuine idleness**

Delete the scheduler `WAIT` request, its `startIntent` call, and its log line.
When no row is chosen, clear stale scheduler-owned work or care intent and
start nothing. Do not change the survivor cell.

- [ ] **Step 4: Preserve real care movement**

Keep movement returned by `bodyStep` or `campNeed`: walking for food, water,
shelter, warmth, sleep, fire, or snares remains a real care step.

### Task 3: Make progress and queue metadata explicit

**Files:**
- Modify: `src/ui/panels.ts`
- Modify: `src/style.css`
- Test: `tests/ui.test.ts`
- Test: `tests/orderpanel.test.ts`
- Test: `tests/queue-legibility.test.ts`

**Interfaces:**
- Produces: `Activity { title: string; step: string; progress: boolean }`
- Consumes: `CareIntent`, `WorkIntent`, queue judgement verdicts

- [ ] **Step 1: Update presentation specifications without running them**

Specify that idle flavor has no task bar, finite activity follows the explicit
`progress` field, and all `once`, `standing`, and `blocked` chips occur inside
the row title area.

- [ ] **Step 2: Add explicit progress semantics**

```ts
export interface Activity {
  title: string;
  step: string;
  progress: boolean;
}
```

Work and care activities set `progress` only when the current `state.task`
has a meaningful finite duration. Null intent/task returns no activity and
uses idle flavor. The template renders `TASK_BAR` from `now?.progress` only.

- [ ] **Step 3: Unify queue metadata placement**

Compute whether each row is the stopping row or below it. Render `blocked`
beside its `once` or `standing` chip inside `.ti`. Do not render a second-line
blocked badge. Keep the refusal reason only on the stopping row.

- [ ] **Step 4: Align chip styling**

Use the existing compact chip geometry for kind and state. Keep kind yellow or
dim and blocked red, with both occupying the same metadata group.

### Task 4: Remove obsolete wording and validate the patch statically

**Files:**
- Modify: `src/ui/panels.ts`
- Modify: `src/sim/bodyorder.ts`
- Modify: `src/sim/orders.ts`
- Modify: affected tests containing old wait wording

**Interfaces:**
- Consumes: all preceding tasks
- Produces: no player-facing or internal scheduler wait wording

- [ ] **Step 1: Delete compatibility presentation branches**

Remove `Returning to camp`, `WAITING_STEP`, loose-wait queue text, and comments
that describe fabricated waiting.

- [ ] **Step 2: Audit source references**

Use `rg` to confirm no production reference remains for `task === "wait"`,
`task: "wait"`, `Wait at camp`, `CARE_REQ`, scheduler `WAIT`, or
`WAITING_STEP`.

- [ ] **Step 3: Check patch integrity without executing code**

Run `git diff --check` only. Do not run Vitest, TypeScript, Vite, or a browser
playtest. Report that execution verification remains with the user's active
playtest.
