# Survidle Intents Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace click-by-click play (walk, fell, haul, walk back, sleep) with intents such as "Gather wood, forever, bring it to camp" that the game carries out, including the night at camp and the fire, on top of the unchanged task system.

**Architecture:** A small `Intent` record on the state and a reactive runner, `runIntent`, called once a minute from `advance`. The runner holds no plan: each minute it re-reads the world and takes at most one step, always an ordinary task through `beginTask`. A body tier (sleep, cold, hungry) may preempt; a work tier (until, delivery, fetch, walk, work) runs when the task slot is free. Three new sim modules: `steps.ts` (a step and how to take one), `body.ts` (the needs and their steps), `intent.ts` (the record, resolution, the work tier, the entry point). The UI replaces the six tabs with an intents list and a settings strip; the raw list survives behind an advanced toggle.

**Tech Stack:** TypeScript, Vite, vitest with happy-dom, already configured. No new dependencies.

**Spec:** `08-survidle/docs/superpowers/specs/2026-09-03-survidle-intents-design.md`. Read it first. Section numbers below refer to it.

## Global Constraints

- Every step the runner takes is an ordinary task started with `beginTask`; the runner never computes yields, odds, wear, xp or shares. If a task needs a number the runner does not have, the runner is wrong, not the task.
- Body thresholds, from spec section 3: sleep at `energy <= 20` or night and `energy < 60`; cold under `warmth < 30`, warm again at `warmth >= 45`; hungry under `kcal < 1800`; provisions up to 2 kg of safe food, never past `PACK_COMFORTABLE_KG`.
- Log lines reuse the button's words: "`<label>`: done." (good), "`<label>`: `<why>`. You stop." (bad).
- The raw action list (`actionsHtml`) keeps producing what it produces today, so the advanced toggle shows the game as it was.
- All work is in `08-survidle/`. Run `npm test`, `npx tsc --noEmit` and `npm run build` there before every commit. Stage with explicit paths, never `git add -A`. Another session may be editing sibling prototypes on this branch.
- Every commit message ends with these two trailer lines:
  `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`
  `Claude-Session: https://claude.ai/code/session_01TGFWX8xrXdeUmKMgAdy5rB`
- Writing style in code, comments, log lines and docs: no em dashes, no unicode arrows or fancy quotes, only characters on a keyboard. Comments explain, they do not chronicle (no "added", "now", "previously", no dates).
- Tests run under vitest with `happy-dom`; `document` exists in UI tests. Keep `npm test` under a few seconds: drive long runs with `advance(state, world, minutes)` in one call where the assertion allows, and step minute by minute only where a trace is needed.

---

## File map

| file | responsibility |
|------|----------------|
| `src/sim/types.ts` | `Until`, `Intent`, `GameState.intent`; `Plan` and `PlanStep` removed; `"night"` joins `TaskId` |
| `src/sim/position.ts` | cell-based ground predicates `forestCell`, `rockCell`, `heathCell`, `watersideCell`; the player-based ones call them |
| `src/sim/tasks.ts` | `check`/`checkFresh`/`pauseKey`/`pausedFraction` take an optional `at` cell; `setAside`, `beginTask`, `startTask`; `stopTask` clears the intent; `done` and `need` bookkeeping in `stepTask`; the `night` option; `loadPack` and `withProgression` exported; `Plan`, `runPlan`, `startHaul` removed |
| `src/sim/steps.ts` (new) | `Step`, `walkStep`, `isRunning`, `takeStep` |
| `src/sim/body.ts` (new) | `Need`, `currentNeed`, `bodyStep`, `provision`, the thresholds |
| `src/sim/intent.ts` (new) | `Where`, `IntentRequest`, `yieldItem`, `yieldItems`, `resolveCell`, `intentOption`, `startIntent`, `runIntent`, `intentSentence`, `endIntent` |
| `src/sim/advance.ts` | calls `runIntent`; the exhaustion floor uses `beginTask` |
| `src/sim/newgame.ts`, `src/sim/save.ts` | `intent: null`; old saves drop `plan` |
| `src/ui/render.ts` | strip fields and `advanced` on `UiState` |
| `src/ui/panels.ts` | `doHtml` (strip, instant buttons, intents, advanced toggle), `intentRowHtml`, `instantHtml`, `taskHtml` shows the intent sentence and step, the finish button on set-aside entries |
| `src/main.ts` | renders `doHtml`; click handlers `intent`, `strip`, `finish`; routes `haul` and `night` task clicks to `startIntent` |
| `src/style.css` | `.strip`, `.grp`, `#task .step` |
| `tests/intent.test.ts` (new) | resolution, the work tier, delivery, until, haul, fetch, save |
| `tests/body.test.ts` (new) | the needs, their steps, priority, preemption, a working day |
| `tests/tasks.test.ts`, `tests/ui.test.ts`, `tests/pause.test.ts` | updated for `at`, `beginTask`, the haul intent, the new panel |
| `docs/README.md` | how it plays, with intents |

---

### Task 1: The record, the night option, and saves that forget their plan

**Files:**
- Modify: `src/sim/types.ts` (the `TaskId` union, the `Plan`/`PlanStep` block, `GameState`)
- Modify: `src/sim/newgame.ts:54`
- Modify: `src/sim/save.ts` (`fillDefaults`)
- Modify: `src/sim/tasks.ts` (`checkFresh` switch, `complete` switch, `availableTasks` untouched)
- Test: `tests/intent.test.ts` (new), `tests/advance-save.test.ts`

**Interfaces:**
- Produces: `Until`, `Intent`, `GameState.intent: Intent | null`, `TaskId` includes `"night"`; `checkFresh` returns an option for `"night"` labelled "Camp for the night".
- Note: `Plan` stays in this task so `runPlan` still compiles; it goes in Task 4.

- [ ] **Step 1: Write the failing tests**

Create `tests/intent.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { calendar } from "../src/sim/calendar";
import { newGame } from "../src/sim/newgame";
import { deserialize, serialize } from "../src/sim/save";
import { check } from "../src/sim/tasks";

const cal = calendar(0);

describe("the intent record", () => {
  it("a new game has no intent", () => {
    const { state } = newGame(3);
    expect(state.intent).toBeNull();
  });

  it("a save that still carries a plan loads with no plan and no intent", () => {
    const { state } = newGame(3);
    const text = serialize(state);
    const raw = JSON.parse(text);
    delete raw.state.intent;
    raw.state.plan = { name: "Haul to camp", steps: [], loop: null, sourceCell: null };
    const file = deserialize(JSON.stringify(raw))!;
    expect(file.state.intent).toBeNull();
    expect("plan" in file.state).toBe(false);
  });

  it("camping for the night is an option with the bed in its detail", () => {
    const { state, world } = newGame(3);
    const o = check(state, world, cal, "night");
    expect(o.label).toBe("Camp for the night");
    expect(o.ok).toBe(true);
    expect(o.detail).toContain("on bare ground");
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `cd 08-survidle && npx vitest run tests/intent.test.ts`
Expected: FAIL, `state.intent` is undefined and `check` has no case for "night" (a TypeScript error on the `"night"` literal is also a failure here).

- [ ] **Step 3: Add the types**

In `src/sim/types.ts`, extend `TaskId`:

```ts
export type TaskId =
  | "chop" | "sticks" | "bark" | "stone" | "berries" | "split"
  | "hunt" | "fish" | "cook" | "craft" | "repair" | "sharpen" | "build"
  | "light" | "travel" | "walk" | "haul" | "night" | "rest" | "sleep";
```

After the `Plan` interface (which Task 4 removes), add:

```ts
/** When an intent is finished with. */
export type Until =
  | { kind: "once" }
  | { kind: "times"; n: number }
  | { kind: "campHas"; item: ItemId; qty: number }
  | { kind: "forever" };

/** A body need the runner is serving; kept so a need whose exit is above its entry holds between the two. */
export type BodyNeed = "sleep" | "cold" | "hungry";

/**
 * What the player set out to do. The runner re-reads the world every minute
 * and starts one ordinary task at a time; nothing else is planned ahead.
 */
export interface Intent {
  /** The work underneath, in the terms startTask speaks. */
  task: TaskId;
  arg?: string;
  /** The cell the work is done in, resolved once when the intent starts. */
  cell: number;
  /** The home camp: where "bring it to camp" delivers. Fixed at start. */
  campCell: number;
  until: Until;
  deliver: "leave" | "camp";
  /** Completions of the work so far. */
  done: number;
  /** What the runner is doing right now, for the Doing panel. */
  step: string;
  need: BodyNeed | null;
}
```

In `GameState`, after `plan: Plan | null;` add `intent: Intent | null;`.

In `src/sim/newgame.ts`, after `plan: null,` add `intent: null,`.

In `src/sim/save.ts`, `fillDefaults`:

```ts
function fillDefaults(state: GameState): void {
  state.skills ??= newSkills();
  state.intent ??= null;
  // Hauling was a stored plan once; an intent restarts from anywhere, so a saved plan is simply forgotten.
  delete (state as unknown as Record<string, unknown>).plan;
  for (const st of Object.values(state.regions)) {
    st.structures.boughBed ??= false;
    st.boughBedAge ??= 0;
  }
}
```

(Until Task 4 removes `plan` from `GameState`, `newgame` still sets it and this delete removes it on load; that is fine, nothing reads it after load except `runPlan`, which handles null. The test asserts `"plan" in file.state` is false, which this satisfies.)

In `src/sim/tasks.ts` `checkFresh`, add a case before `"rest"`:

```ts
    case "night":
      return opt({ group: "camp", label: "Camp for the night", detail: `go to camp, make a fire if you can, sleep; ${bedText(state, world)}`, duration: 0 });
```

In `complete`, add `case "night":` to the no-op list beside `"haul"`.

- [ ] **Step 4: Run the tests**

Run: `cd 08-survidle && npx vitest run tests/intent.test.ts && npx tsc --noEmit`
Expected: PASS, no type errors.

- [ ] **Step 5: Commit**

```bash
cd 08-survidle && git add src/sim/types.ts src/sim/newgame.ts src/sim/save.ts src/sim/tasks.ts tests/intent.test.ts
git commit -m "feat(survidle): the intent record in the state, and camping for the night as an option"
```

---

### Task 2: Legality judged at a cell

**Files:**
- Modify: `src/sim/position.ts` (the ground predicates)
- Modify: `src/sim/tasks.ts` (`pauseKey`, `pausedFraction`, `check`, `checkFresh`)
- Test: `tests/tasks.test.ts`

**Interfaces:**
- Produces: `forestCell(world, idx)`, `rockCell(world, idx)`, `heathCell(world, idx)`, `watersideCell(world, idx)`; `check(state, world, cal, id, arg?, at?)`, `checkFresh(...same)`, `pauseKey(state, world, id, arg?, at?)`, `pausedFraction(state, world, id, arg?, at?)`. With `at` omitted every one behaves exactly as today.

- [ ] **Step 1: Write the failing tests**

Append to `describe("tasks", ...)` in `tests/tasks.test.ts`:

```ts
  it("legality can be judged at a cell you do not stand on", () => {
    const g = newGame(3);
    const { state, world } = g;
    const r = regionAt(world, state.player.region);
    const forest = spotOf(r, "forest")!;
    // From camp, felling is illegal here but legal at the forest.
    expect(check(state, world, cal, "chop").ok).toBe(false);
    const there = check(state, world, cal, "chop", undefined, forest.cell);
    expect(there.ok).toBe(true);
    expect(there.duration).toBeGreaterThan(0);
    // Splitting reads the pile at that cell, not the one under foot.
    addItem(pile(state, forest.cell), "log", 1);
    expect(check(state, world, cal, "split").ok).toBe(false);
    expect(check(state, world, cal, "split", undefined, forest.cell).ok).toBe(true);
    // A share set aside at that cell shows up from anywhere.
    placeAt(state, world, forest.cell);
    startTask(state, world, cal, "chop");
    run(g, 30);
    stopTask(state, world);
    placeAtSpot(state, world, state.player.region, "camp");
    expect(check(state, world, cal, "chop", undefined, forest.cell).resume).toBeCloseTo(0.5, 2);
  });
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd 08-survidle && npx vitest run tests/tasks.test.ts`
Expected: FAIL: `check` ignores the sixth argument, so `there.ok` is false.

- [ ] **Step 3: Cell-based predicates**

In `src/sim/position.ts`, replace the four player predicates with:

```ts
export function forestCell(world: World, idx: number): boolean {
  const t = cellAt(world, idx).terrain;
  return t === "spruce" || t === "pine" || t === "birch";
}

export function rockCell(world: World, idx: number): boolean {
  const t = cellAt(world, idx).terrain;
  return t === "rock" || t === "fell";
}

export function heathCell(world: World, idx: number): boolean {
  const t = cellAt(world, idx).terrain;
  return t === "bog" || t === "meadow";
}

/** A cell with water next to it: where you can fish. */
export function watersideCell(world: World, idx: number): boolean {
  return neighbours(world, idx).some((n) => cellAt(world, n).terrain === "water");
}

export function inForest(state: GameState, world: World): boolean {
  return forestCell(world, cellOf(state, world));
}

export function onRock(state: GameState, world: World): boolean {
  return rockCell(world, cellOf(state, world));
}

export function onHeath(state: GameState, world: World): boolean {
  return heathCell(world, cellOf(state, world));
}

export function byWater(state: GameState, world: World): boolean {
  return watersideCell(world, cellOf(state, world));
}
```

- [ ] **Step 4: Thread `at` through tasks.ts**

In `src/sim/tasks.ts`:

```ts
export function pauseKey(state: GameState, world: World, id: TaskId, arg?: string, at = cellOf(state, world)): string | null {
  const a = arg ?? "";
  if (LOCATED.has(id)) return `${id}:${a}@${at}`;
  if (CARRIED.has(id)) return `${id}:${a}`;
  return null;
}

export function pausedFraction(state: GameState, world: World, id: TaskId, arg?: string, at = cellOf(state, world)): number {
  const key = pauseKey(state, world, id, arg, at);
  return key ? (state.paused[key]?.fraction ?? 0) : 0;
}

/**
 * The one place a task's legality and duration are decided. availableTasks
 * and startTask both go through it so the button and the click agree.
 * `at` judges the task at another cell of this region, for an intent that
 * has not walked there yet; ground, camp and reach are all taken there.
 */
export function check(state: GameState, world: World, cal: Calendar, id: TaskId, arg?: string, at = cellOf(state, world)): TaskOption {
  const o = checkFresh(state, world, cal, id, arg, at);
  const fraction = pausedFraction(state, world, id, arg, at);
  if (fraction > 0 && o.ok) return { ...o, resume: fraction, duration: o.duration * (1 - fraction) };
  if (fraction > 0) return { ...o, resume: fraction };
  return o;
}

export function checkFresh(state: GameState, world: World, cal: Calendar, id: TaskId, arg?: string, at = cellOf(state, world)): TaskOption {
  const p = state.player;
  const r = regionAt(world, p.region);
  const st = regionState(state, world, p.region);
  const invs = [p.pack, pile(state, at)];
  const camp = at === st.campCell;
  const terrain = cellAt(world, at).terrain;
```

Then inside the switch replace every position call with the cell form:

- `chop`: `ground(forestCell(world, at), ...)` and `duration: terrain === "spruce" ? 50 : 60` (`terrain` is the constant declared above the switch).
- `sticks`, `bark`: `ground(forestCell(world, at), ...)`.
- `stone`: `ground(rockCell(world, at), ...)`.
- `berries`: `ground(heathCell(world, at), ...)`.
- `hunt`: `const onGround = def.spot === "heath" ? heathCell(world, at) : forestCell(world, at);`
- `fish`: `ground(watersideCell(world, at), ...)`.
- `build` snare: `ground(heathCell(world, at), ...)`.
- `haul`: `const here = at;` and `const kg = weight(pile(state, at));`.
- `walk`/`travel`: unchanged; a walk starts from where you stand.

`checkFresh` becomes exported (the runner does not call it, but `startTask` and `pausedList` do, and the export keeps the signatures in one place). Remove the now-unused imports `inForest`, `onRock`, `onHeath`, `byWater`, `hereTerrain`, `herePile`, `reach` from tasks.ts only if nothing else in the file uses them (`startTask` uses `reach` for build materials and `stepWalk` uses `hereTerrain`; keep those). Add `forestCell, rockCell, heathCell, watersideCell` to the position import and `pile` is already imported.

- [ ] **Step 5: Run all tests**

Run: `cd 08-survidle && npm test && npx tsc --noEmit`
Expected: PASS. Every existing test still passes because `at` defaults to the cell under foot.

- [ ] **Step 6: Commit**

```bash
cd 08-survidle && git add src/sim/position.ts src/sim/tasks.ts tests/tasks.test.ts
git commit -m "refactor(survidle): a task's legality can be judged at a cell you have not reached"
```

---

### Task 3: beginTask, setAside, and the bookkeeping in stepTask

**Files:**
- Modify: `src/sim/tasks.ts` (`startTask`, `stopTask`, `stepTask`)
- Modify: `src/sim/advance.ts` (the exhaustion floor)
- Test: `tests/tasks.test.ts`

**Interfaces:**
- Produces: `beginTask(state, world, cal, id, arg?, repeat = false): boolean` starts a task without touching `state.intent`; `setAside(state, world)` sets the current task aside without touching `state.intent`; `startTask` is `beginTask` then `state.intent = null`; `stopTask` is `state.intent = null` then `setAside`; `startTask` and `beginTask` return false for `"haul"` and `"night"` (the haul plan is still reachable through `startHaul` until Task 4, see below). `stepTask` increments `intent.done` when the intent's own task completes, or when a `sleep` completes under a `night` intent, and clears `intent.need` when a `sleep` completes.
- Note: `startHaul` is still called from `startTask` in this task; the guard for `"haul"` lands in Task 4 with the removal.

- [ ] **Step 1: Write the failing tests**

Append to `tests/tasks.test.ts`:

```ts
  it("beginTask leaves an intent in place; startTask and stopTask clear it", () => {
    const g = newGame(3);
    const { state, world } = g;
    placeAtSpot(state, world, state.player.region, "forest");
    const intent = { task: "chop" as const, cell: cellOf(state, world), campCell: regionState(state, world, state.player.region).campCell, until: { kind: "forever" as const }, deliver: "leave" as const, done: 0, step: "", need: null };
    state.intent = { ...intent };
    expect(beginTask(state, world, cal, "chop")).toBe(true);
    expect(state.intent).not.toBeNull();
    done(g);
    expect(state.intent!.done).toBe(1);
    expect(startTask(state, world, cal, "sticks")).toBe(true);
    expect(state.intent).toBeNull();
    state.intent = { ...intent };
    stopTask(state, world);
    expect(state.intent).toBeNull();
    expect(state.task).toBeNull();
  });

  it("night is not a task you can start; a sleep under a night intent counts as its completion", () => {
    const g = newGame(3);
    const { state, world } = g;
    expect(startTask(state, world, cal, "night")).toBe(false);
    state.intent = { task: "night", cell: cellOf(state, world), campCell: cellOf(state, world), until: { kind: "once" }, deliver: "leave", done: 0, step: "", need: "sleep" };
    expect(beginTask(state, world, cal, "sleep")).toBe(true);
    done(g);
    expect(state.intent!.done).toBe(1);
    expect(state.intent!.need).toBeNull();
  });
```

Add `beginTask` to the import from `../src/sim/tasks` and `cellOf` is already imported.

- [ ] **Step 2: Run to verify they fail**

Run: `cd 08-survidle && npx vitest run tests/tasks.test.ts`
Expected: FAIL: `beginTask` is not exported.

- [ ] **Step 3: Split startTask**

In `src/sim/tasks.ts` replace `startTask` and `stopTask`:

```ts
/** Starts a task by hand. Whatever intent was running is over; the task set aside keeps its share. */
export function startTask(state: GameState, world: World, cal: Calendar, id: TaskId, arg?: string, repeat = false): boolean {
  if (!beginTask(state, world, cal, id, arg, repeat)) return false;
  state.intent = null;
  return true;
}

/**
 * Starts a task without touching the intent: what the runner calls for each
 * of its steps. Whatever was under way is set aside first, with its share done kept.
 */
export function beginTask(state: GameState, world: World, cal: Calendar, id: TaskId, arg?: string, repeat = false): boolean {
  if (state.dead) return false;
  if (id === "night") return false;
  const o = check(state, world, cal, id, arg);
  if (!o.ok) return false;
  setAside(state, world);
  if (id === "haul") return startHaul(state, world, cal);
  if (id === "build" && !(regionState(state, world, state.player.region).build[arg as StructureId] ?? 0)) {
    // Materials are committed when the work starts, and stay laid out if you stop.
    consume(reach(state, world), STRUCTURES[arg as StructureId].needs);
    if (arg !== "snare") regionState(state, world, state.player.region).build[arg as StructureId] = 0.001;
  }
  if (id === "walk" || id === "travel") {
    const target = walkTarget(state, world, arg ?? "")!;
    const path = findRoute(world, cellOf(state, world), target.cell) ?? [];
    state.route = { target: target.cell, path, label: target.label };
    state.task = { id, arg, progress: 0, duration: o.duration, repeat: false };
    return true;
  }
  // Pick up where this task was left, if it was.
  const key = pauseKey(state, world, id, arg);
  const fresh = checkFresh(state, world, cal, id, arg);
  const fraction = key ? (state.paused[key]?.fraction ?? 0) : 0;
  if (key) delete state.paused[key];
  state.task = { id, arg, progress: fresh.duration * fraction, duration: fresh.duration, repeat: repeat && o.repeatable };
  return true;
}

/** Stops by hand: the intent is over and the task is set aside with its share kept. */
export function stopTask(state: GameState, world: World): void {
  state.intent = null;
  setAside(state, world);
}

/**
 * Sets the current task aside. Work keeps its share where it belongs; a walk
 * simply ends where you stand; a plan is dropped, since it restarts from
 * anywhere. Rest and sleep keep nothing.
 */
export function setAside(state: GameState, world: World): void {
  state.plan = null;
  const t = state.task;
  if (!t) return;
  if (t.id === "build" && t.arg !== "snare") {
    const st = regionState(state, world, state.player.region);
    const sid = t.arg as StructureId;
    st.build[sid] = (st.build[sid] ?? 0) + t.progress;
  } else if (t.id === "walk" || t.id === "travel") {
    state.route = null;
  } else {
    const key = pauseKey(state, world, t.id, t.arg);
    const fraction = t.duration > 0 ? Math.min(0.999, t.progress / t.duration) : 0;
    if (key && fraction > 0.005) {
      state.paused[key] = { id: t.id, arg: t.arg, fraction, cell: LOCATED.has(t.id) ? cellOf(state, world) : -1 };
    }
  }
  state.task = null;
}
```

In `stepTask`, after `state.task = null;` and before `complete(...)`:

```ts
  const it = state.intent;
  if (it) {
    if (it.task === id && (it.arg ?? "") === (arg ?? "")) it.done++;
    else if (it.task === "night" && id === "sleep") it.done++;
    if (id === "sleep" && it.need === "sleep") it.need = null;
  }
```

In `src/sim/advance.ts`, the floor:

```ts
  if (!state.task && state.player.energy < EXHAUSTED && beginTask(state, world, cal, "sleep")) {
```

and import `beginTask` instead of `startTask`.

- [ ] **Step 4: Run all tests**

Run: `cd 08-survidle && npm test && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd 08-survidle && git add src/sim/tasks.ts src/sim/advance.ts tests/tasks.test.ts
git commit -m "refactor(survidle): beginTask starts a task under an intent; startTask and stopTask end the intent"
```

---

### Task 4: Steps, the intent core, and the haul intent in place of the plan

This is the largest task: `steps.ts`, `intent.ts` with resolution, the work tier without body needs, delivery, until, and the haul intent; `Plan` and `runPlan` go; `advance` calls `runIntent`.

**Files:**
- Create: `src/sim/steps.ts`, `src/sim/intent.ts`
- Modify: `src/sim/types.ts` (remove `Plan`, `PlanStep`, `GameState.plan`), `src/sim/newgame.ts` (remove `plan: null`), `src/sim/tasks.ts` (remove `startHaul`, `runPlan`, the `plan` line in `setAside`, export `loadPack`, guard `haul` in `beginTask`), `src/sim/advance.ts`, `src/ui/panels.ts:210-211` (the two `state.plan` reads), `src/main.ts` (route `haul` clicks)
- Test: `tests/intent.test.ts`, `tests/tasks.test.ts` (replace the two haul tests)

**Interfaces:**
- Produces, `steps.ts`:
  ```ts
  export interface Step { id: TaskId; arg?: string; step: string }
  export function walkStep(state, world, cell: number, why: string): Step   // arg "cell:<n>", step "walking to <whereIs><why>"
  export function isRunning(state, s: Step): boolean
  export function takeStep(state, world, cal, s: Step): boolean            // beginTask unless already running; sets intent.step
  ```
- Produces, `intent.ts`:
  ```ts
  export type Where = "nearest" | SpotId | { cell: number };
  export type UntilChoice = { kind: "once" } | { kind: "times"; n: number } | { kind: "campHas"; qty: number } | { kind: "forever" };
  export interface IntentRequest { task: TaskId; arg?: string; until: UntilChoice; deliver: "leave" | "camp"; where: Where }
  export function yieldItem(task: TaskId, arg?: string): ItemId | null
  export function yieldItems(task: TaskId, arg?: string): ItemId[] | "all"
  export function resolveCell(state, world, task, arg, where): { cell: number; note: string }
  export function intentOption(state, world, cal, task, arg, where): TaskOption
  export function startIntent(state, world, cal, rng, req): boolean
  export function runIntent(state, world, cal, rng): void
  export function endIntent(state, text: string, kind?: "good" | "bad"): void
  export function intentSentence(state, world, cal, it: Intent): string
  ```
  In this task `runIntent` has no body tier; Task 5 adds it through one call.

- [ ] **Step 1: Write the failing tests**

Replace the two haul tests in `tests/tasks.test.ts` ("hauling is a plan..." and "stopping mid-haul...") with nothing; they move here. Remove `runPlan` from that file's import.

Append to `tests/intent.test.ts` (extend the imports as needed: `advance` from `../src/sim/advance`, `Rng` from `../src/rng`, `addItem, herePile, isEmpty, pile, qty` from `../src/sim/inventory`, `cellOf, placeAt, placeAtSpot` from `../src/sim/position`, `regionState` from `../src/sim/regionstate`, `type IntentRequest, resolveCell, startIntent, intentOption, intentSentence` from `../src/sim/intent`, `type TaskId` from `../src/sim/types`, `regionAt, spotOf` from `../src/world/gen`):

```ts
type G = ReturnType<typeof newGame>;
const rng = () => new Rng(1);
function go(g: G, minutes: number) {
  advance(g.state, g.world, minutes);
}
/** Advances a minute at a time until the predicate holds or the budget runs out. */
function until(g: G, pred: () => boolean, max = 3000): boolean {
  for (let i = 0; i < max; i++) {
    if (pred()) return true;
    advance(g.state, g.world, 1);
  }
  return pred();
}
function req(task: TaskId, extra: Partial<IntentRequest> = {}): IntentRequest {
  return { task, until: { kind: "once" }, deliver: "leave", where: "nearest", ...extra };
}

describe("where the work is done", () => {
  it("nearest ground is the region's spot unless you already stand on it", () => {
    const { state, world } = newGame(3);
    const r = regionAt(world, state.player.region);
    expect(resolveCell(state, world, "chop", undefined, "nearest").cell).toBe(spotOf(r, "forest")!.cell);
    placeAtSpot(state, world, state.player.region, "forest");
    expect(resolveCell(state, world, "chop", undefined, "nearest").cell).toBe(cellOf(state, world));
    expect(resolveCell(state, world, "stone", undefined, "nearest").cell).toBe(spotOf(r, "outcrop")!.cell);
  });

  it("a spot that does not suit the work falls back to one that does, and says so", () => {
    const { state, world } = newGame(3);
    const r = regionAt(world, state.player.region);
    const res = resolveCell(state, world, "chop", undefined, "outcrop");
    expect(res.cell).toBe(spotOf(r, "forest")!.cell);
    expect(res.note).toContain("the forest");
  });

  it("camp-bound work resolves to camp; crafting stays where the materials are", () => {
    const { state, world } = newGame(3);
    const camp = regionState(state, world, state.player.region).campCell;
    placeAtSpot(state, world, state.player.region, "forest");
    expect(resolveCell(state, world, "split", undefined, "nearest").cell).toBe(camp);
    expect(resolveCell(state, world, "craft", "cordage", "nearest").cell).toBe(camp);
    addItem(state.player.pack, "bark", 3);
    expect(resolveCell(state, world, "craft", "cordage", "nearest").cell).toBe(cellOf(state, world));
  });

  it("the button is judged at the resolved cell, so ground is never the reason", () => {
    const { state, world } = newGame(3);
    const o = intentOption(state, world, cal, "chop", undefined, "nearest");
    expect(o.ok).toBe(true);
    state.player.tools = [];
    expect(intentOption(state, world, cal, "chop", undefined, "nearest").why).toBe("needs an axe");
  });
});

describe("the work tier", () => {
  it("walks to the forest, fells once, and is done", () => {
    const g = newGame(3);
    const { state, world } = g;
    expect(startIntent(state, world, cal, rng(), req("chop"))).toBe(true);
    expect(state.task?.id).toBe("walk");
    expect(state.intent?.step).toContain("walking to the forest");
    expect(until(g, () => state.task?.id === "chop")).toBe(true);
    expect(state.intent?.step).toBe("felling a tree");
    expect(until(g, () => state.intent === null)).toBe(true);
    expect(state.stats.trees).toBe(1);
    expect(state.log.some((e) => e.text === "Fell a tree: done.")).toBe(true);
  });

  it("refuses to start what cannot start, and ends with the button's words when the work runs out", () => {
    const g = newGame(3);
    const { state, world } = g;
    state.player.tools = [];
    expect(startIntent(state, world, cal, rng(), req("chop"))).toBe(false);
    expect(state.intent).toBeNull();
    state.player.tools = [{ id: "axe", durability: 100 }];
    regionState(state, world, state.player.region).wood = 1;
    startIntent(state, world, cal, rng(), req("chop", { until: { kind: "forever" } }));
    expect(until(g, () => state.intent === null)).toBe(true);
    expect(state.stats.trees).toBe(1);
    expect(state.log.some((e) => e.text === "Fell a tree: nothing left worth felling. You stop.")).toBe(true);
  });

  it("N times counts completions of the work only", () => {
    const g = newGame(3);
    const { state, world } = g;
    startIntent(state, world, cal, rng(), req("sticks", { until: { kind: "times", n: 3 } }));
    expect(until(g, () => state.intent === null)).toBe(true);
    expect(qty(state.player.pack, "stick")).toBe(18);
    expect(state.log.some((e) => e.text === "Gather sticks: done.")).toBe(true);
  });

  it("brings a full load to camp and goes back for more, and hauls the rest when it is over", () => {
    const g = newGame(3);
    const { state, world } = g;
    const camp = regionState(state, world, state.player.region).campCell;
    startIntent(state, world, cal, rng(), req("chop", { until: { kind: "times", n: 2 }, deliver: "camp" }));
    expect(until(g, () => state.intent === null, 6000)).toBe(true);
    expect(qty(pile(state, camp), "log")).toBe(8);
    expect(state.stats.trees).toBe(2);
    expect(cellOf(state, world)).toBe(camp);
  });

  it("until camp has N counts the camp pile alone", () => {
    const g = newGame(3);
    const { state, world } = g;
    const camp = regionState(state, world, state.player.region).campCell;
    startIntent(state, world, cal, rng(), req("chop", { until: { kind: "campHas", qty: 5 }, deliver: "camp" }));
    expect(state.intent?.until).toEqual({ kind: "campHas", item: "log", qty: 5 });
    expect(until(g, () => state.intent === null, 8000)).toBe(true);
    expect(qty(pile(state, camp), "log")).toBeGreaterThanOrEqual(5);
    expect(state.stats.trees).toBe(2);
  });

  it("work with no countable yield turns until camp has N into once", () => {
    const { state, world } = newGame(3);
    startIntent(state, world, cal, rng(), req("rest", { until: { kind: "campHas", qty: 5 } }));
    expect(state.intent?.until).toEqual({ kind: "once" });
  });

  it("reads as a sentence", () => {
    const { state, world } = newGame(3);
    startIntent(state, world, cal, rng(), req("chop", { until: { kind: "campHas", qty: 40 }, deliver: "camp" }));
    expect(intentSentence(state, world, cal, state.intent!)).toBe("Fell a tree, until camp has 40 logs, bringing it to camp");
    startIntent(state, world, cal, rng(), req("sticks", { until: { kind: "times", n: 5 } }));
    expect(intentSentence(state, world, cal, state.intent!)).toBe("Gather sticks, 5 times, 0 done");
    startIntent(state, world, cal, rng(), req("bark", { until: { kind: "forever" } }));
    expect(intentSentence(state, world, cal, state.intent!)).toBe("Strip bark, forever");
  });
});

describe("the haul intent", () => {
  it("loads, walks to camp, drops, walks back, until the pile is bare", () => {
    const g = newGame(3);
    const { state, world } = g;
    const region = state.player.region;
    placeAtSpot(state, world, region, "forest");
    const forestCell = cellOf(state, world);
    addItem(herePile(state, world), "log", 3);
    addItem(herePile(state, world), "stick", 10);
    expect(startIntent(state, world, cal, rng(), req("haul"))).toBe(true);
    expect(state.intent?.deliver).toBe("camp");
    expect(state.task?.id).toBe("walk");
    expect(qty(state.player.pack, "log")).toBe(1);
    expect(until(g, () => state.intent === null, 6000)).toBe(true);
    const camp = pile(state, regionState(state, world, region).campCell);
    expect(qty(camp, "log")).toBe(3);
    expect(qty(camp, "stick")).toBe(10);
    expect(isEmpty(pile(state, forestCell))).toBe(true);
    expect(state.log.some((e) => e.text === "Haul to camp: done.")).toBe(true);
  });

  it("stopping mid-haul keeps the load on your back and you on the way", () => {
    const g = newGame(3);
    const { state, world } = g;
    placeAtSpot(state, world, state.player.region, "forest");
    const forestCell = cellOf(state, world);
    addItem(herePile(state, world), "log", 2);
    startIntent(state, world, cal, rng(), req("haul"));
    expect(until(g, () => cellOf(state, world) !== forestCell)).toBe(true);
    stopTask(state, world);
    expect(state.intent).toBeNull();
    expect(qty(state.player.pack, "log")).toBe(1);
    expect(state.route).toBeNull();
    expect(qty(pile(state, forestCell), "log")).toBe(1);
  });

  it("an empty pile is nothing to haul", () => {
    const { state, world } = newGame(3);
    expect(startIntent(state, world, cal, rng(), req("haul"))).toBe(false);
  });
});

describe("saves", () => {
  it("a live intent survives a save and goes on while you are away", () => {
    const g = newGame(3);
    const { state, world } = g;
    startIntent(state, world, cal, rng(), req("sticks", { until: { kind: "forever" } }));
    go(g, 5);
    const file = deserialize(serialize(state))!;
    expect(file.state.intent?.task).toBe("sticks");
    const back = { state: file.state, world };
    go(back, 120);
    expect(back.state.intent).not.toBeNull();
    expect(back.state.intent!.done).toBeGreaterThan(0);
  });
});
```

`stopTask` comes from `../src/sim/tasks`.

- [ ] **Step 2: Run to verify they fail**

Run: `cd 08-survidle && npx vitest run tests/intent.test.ts`
Expected: FAIL: `../src/sim/intent` does not exist.

- [ ] **Step 3: steps.ts**

Create `src/sim/steps.ts`:

```ts
/**
 * One thing the runner can start: an ordinary task and the words the Doing
 * panel shows while it runs. The runner decides a step every minute; a step
 * already under way is left alone.
 */
import type { Calendar } from "./calendar";
import type { World } from "../world/gen";
import { beginTask, whereIs } from "./tasks";
import type { GameState, TaskId } from "./types";

export interface Step {
  id: TaskId;
  arg?: string;
  /** "walking to the forest", "felling a tree", "sleeping". */
  step: string;
}

export function walkStep(state: GameState, world: World, cell: number, why: string): Step {
  return { id: "walk", arg: `cell:${cell}`, step: `walking to ${whereIs(state, world, cell)}${why}` };
}

export function isRunning(state: GameState, s: Step): boolean {
  return state.task?.id === s.id && (state.task.arg ?? "") === (s.arg ?? "");
}

/** Starts the step unless it is already under way. False when it cannot start; the intent is untouched either way. */
export function takeStep(state: GameState, world: World, cal: Calendar, s: Step): boolean {
  const it = state.intent;
  if (!it) return false;
  if (isRunning(state, s)) return true;
  if (!beginTask(state, world, cal, s.id, s.arg)) return false;
  it.step = s.step;
  return true;
}
```

- [ ] **Step 4: intent.ts**

Create `src/sim/intent.ts`:

```ts
/**
 * Intents: "Gather wood, forever, bring it to camp". An intent is a small
 * record; the runner below re-reads the world every minute and starts one
 * ordinary task at a time. It never computes a yield, an odd or a share;
 * the tasks do, exactly as when a player clicks them one by one.
 */
import type { Rng } from "../rng";
import { PACK_HARD_KG } from "../units";
import { regionAt, spotOf, type World } from "../world/gen";
import { itemLabel } from "./actions";
import { bodyStep, currentNeed, provision } from "./body";
import type { Calendar } from "./calendar";
import { canConsume, isEmpty, listItems, pile, pilesIn, qty, reach, resolveNeed, transfer, weight } from "./inventory";
import { ANIMALS, ITEM_KG, type Need, RECIPES, STRUCTURES } from "./items";
import { log } from "./log";
import { cellOf, forestCell, heathCell, kmBetween, rockCell, SPOT_WORDS, watersideCell } from "./position";
import { regionState } from "./regionstate";
import { isRunning, type Step, takeStep, walkStep } from "./steps";
import { check, loadPack, stopTask, type TaskOption } from "./tasks";
import type { GameState, Intent, ItemId, RecipeId, SpotId, Species, StructureId, TaskId, Until } from "./types";

export type Where = "nearest" | SpotId | { cell: number };

/** The strip's choice, before the yield item is filled in. */
export type UntilChoice =
  | { kind: "once" } | { kind: "times"; n: number } | { kind: "campHas"; qty: number } | { kind: "forever" };

export interface IntentRequest {
  task: TaskId;
  arg?: string;
  until: UntilChoice;
  deliver: "leave" | "camp";
  where: Where;
}

/** Work that is done at camp whatever the ground. */
const CAMP_BOUND = new Set<TaskId>(["split", "cook", "light", "repair", "sharpen"]);
/** Work whose place is wherever you stand. */
const HERE = new Set<TaskId>(["haul", "night", "rest", "sleep"]);
/** Intents whose legality is not a question for check: the runner knows when they are over. */
const UNCHECKED = new Set<TaskId>(["haul", "night", "rest", "sleep"]);

const GROUND_OF: Partial<Record<TaskId, SpotId>> = {
  chop: "forest", sticks: "forest", bark: "forest", stone: "outcrop", berries: "heath", fish: "shore",
};

/** The ground a piece of work wants, as the spot that stands for it, or null when any ground does. */
function groundOf(task: TaskId, arg?: string): SpotId | null {
  if (task === "hunt") return ANIMALS[arg as Species].spot;
  if (task === "build" && arg === "snare") return "heath";
  return GROUND_OF[task] ?? null;
}

function suits(world: World, cell: number, ground: SpotId): boolean {
  switch (ground) {
    case "forest": return forestCell(world, cell);
    case "outcrop": return rockCell(world, cell);
    case "heath": return heathCell(world, cell);
    case "shore": return watersideCell(world, cell);
    case "camp": return true;
  }
}

/** The item "until camp has N" counts, or null when the work makes nothing countable. */
export function yieldItem(task: TaskId, arg?: string): ItemId | null {
  switch (task) {
    case "chop": return "log";
    case "sticks": return "stick";
    case "bark": return "bark";
    case "stone": return "stone";
    case "berries": return "berries";
    case "split": return "firewood";
    case "hunt": return "rawMeat";
    case "fish": return "fish";
    case "cook": return arg === "fish" ? "cookedFish" : "cookedMeat";
    case "craft": return RECIPES[arg as RecipeId].out.item ?? null;
    default: return null;
  }
}

/** Everything the work leaves in the pack that a delivery carries to camp. */
export function yieldItems(task: TaskId, arg?: string): ItemId[] | "all" {
  if (task === "haul") return "all";
  if (task === "chop") return ["log", "stick"];
  if (task === "hunt") return ["rawMeat", "hide", "bone", "sinew"];
  const one = yieldItem(task, arg);
  return one ? [one] : [];
}

/** Where the work is done, decided once. The note says when the chosen spot did not suit. */
export function resolveCell(state: GameState, world: World, task: TaskId, arg: string | undefined, where: Where): { cell: number; note: string } {
  const here = cellOf(state, world);
  if (typeof where === "object") return { cell: where.cell, note: "" };
  const r = regionAt(world, state.player.region);
  const st = regionState(state, world, state.player.region);
  if (HERE.has(task)) return { cell: here, note: "" };
  if (CAMP_BOUND.has(task) || (task === "build" && arg !== "snare")) return { cell: st.campCell, note: "" };
  if (task === "craft") {
    const needs = RECIPES[arg as RecipeId].needs;
    return { cell: canConsume(reach(state, world), needs) ? here : st.campCell, note: "" };
  }
  const ground = groundOf(task, arg);
  if (!ground) return { cell: here, note: "" };
  let note = "";
  if (where !== "nearest") {
    const s = spotOf(r, where);
    if (s && suits(world, s.cell, ground)) return { cell: s.cell, note: "" };
    note = `${SPOT_WORDS[where]} does not suit; going to ${SPOT_WORDS[ground]} instead`;
  }
  if (suits(world, here, ground)) return { cell: here, note };
  const s = spotOf(r, ground);
  // No such ground in this region: check at the cell under foot says so in its own words.
  return { cell: s ? s.cell : here, note };
}

/** The button: legality judged where the work would be done, so ground is never the reason. */
export function intentOption(state: GameState, world: World, cal: Calendar, task: TaskId, arg: string | undefined, where: Where): TaskOption {
  const { cell } = resolveCell(state, world, task, arg, where);
  return check(state, world, cal, task, arg, cell);
}

/** Sets out. False when the work could not start at its place; the button already said why. */
export function startIntent(state: GameState, world: World, cal: Calendar, rng: Rng, req: IntentRequest): boolean {
  if (state.dead || req.task === "walk" || req.task === "travel") return false;
  const { cell, note } = resolveCell(state, world, req.task, req.arg, req.where);
  if (!UNCHECKED.has(req.task) && !check(state, world, cal, req.task, req.arg, cell).ok) return false;
  if (req.task === "haul" && isEmpty(pile(state, cell))) return false;
  const item = yieldItem(req.task, req.arg);
  let until: Until = req.until.kind === "campHas"
    ? item ? { kind: "campHas", item, qty: req.until.qty } : { kind: "once" }
    : req.until;
  let deliver = req.deliver;
  if (req.task === "haul") {
    until = { kind: "once" };
    deliver = "camp";
  }
  if (req.task === "night") until = { kind: "once" };
  // Whatever was under way, by hand or by intent, is set aside with its share kept.
  stopTask(state, world);
  state.intent = {
    task: req.task, arg: req.arg, cell,
    campCell: regionState(state, world, state.player.region).campCell,
    until, deliver, done: 0, step: note || "setting out", need: null,
  };
  runIntent(state, world, cal, rng);
  return true;
}

export function endIntent(state: GameState, text: string, kind?: "good" | "bad"): void {
  log(state, text, kind);
  state.intent = null;
}

function labelOf(state: GameState, world: World, cal: Calendar, it: Intent): string {
  return check(state, world, cal, it.task, it.arg, it.cell).label;
}

/** "Fell a tree, until camp has 40 logs, bringing it to camp". */
export function intentSentence(state: GameState, world: World, cal: Calendar, it: Intent): string {
  const parts = [labelOf(state, world, cal, it)];
  const u = it.until;
  if (u.kind === "times") parts.push(`${u.n} times, ${it.done} done`);
  else if (u.kind === "campHas") parts.push(`until camp has ${itemLabel(u.item, u.qty)}`);
  else if (u.kind === "forever") parts.push("forever");
  if (it.deliver === "camp" && it.task !== "haul") parts.push("bringing it to camp");
  return parts.join(", ");
}

function untilMet(state: GameState, it: Intent): boolean {
  if (it.task === "haul") return isEmpty(pile(state, it.cell));
  const u = it.until;
  switch (u.kind) {
    case "once": return it.done >= 1;
    case "times": return it.done >= u.n;
    case "campHas": return qty(pile(state, it.campCell), u.item) >= u.qty - 1e-9;
    case "forever": return false;
  }
}

/** The pack holds something a delivery should carry, or cannot take more anyway. */
function packCarries(state: GameState, it: Intent): boolean {
  const pack = state.player.pack;
  if (weight(pack) >= PACK_HARD_KG - 1e-9) return true;
  const items = yieldItems(it.task, it.arg);
  if (items === "all") return !isEmpty(pack);
  return items.some((i) => qty(pack, i) > 1e-9);
}

/** Something is owed to camp: on the ground at the work cell, or on your back. */
function deliveryPending(state: GameState, it: Intent): boolean {
  if (it.deliver !== "camp") return false;
  return !isEmpty(pile(state, it.cell)) || packCarries(state, it);
}

function loadFull(state: GameState, it: Intent): boolean {
  return weight(state.player.pack) + weight(pile(state, it.cell)) >= PACK_HARD_KG - 1e-9;
}

function dropEverything(state: GameState, world: World): void {
  const from = state.player.pack;
  const to = pile(state, cellOf(state, world));
  for (const { item, qty: q } of listItems(from)) transfer(from, to, item, q);
}

type Outcome = "again" | undefined;

/**
 * A walk the runner starts. Leaving the home camp, it pockets provisions
 * first. A walk that cannot start ends the intent with the walk's reason.
 */
function walkTo(state: GameState, world: World, cal: Calendar, it: Intent, cell: number, why: string): Outcome {
  const here = cellOf(state, world);
  if (here === cell) return undefined;
  if (here === it.campCell) provision(state, world);
  const o = check(state, world, cal, "walk", `cell:${cell}`);
  if (!o.ok) {
    endIntent(state, `${labelOf(state, world, cal, it)}: ${o.why}. You stop.`, "bad");
    return undefined;
  }
  takeStep(state, world, cal, walkStep(state, world, cell, why));
  return undefined;
}

/**
 * One step of a haul leg, inferred from where you are and what you carry:
 * at the pile, fill up first; carrying anything, take it to camp; at camp,
 * unload; otherwise go back for the rest.
 */
function deliveryStep(state: GameState, world: World, cal: Calendar, it: Intent): Outcome {
  const here = cellOf(state, world);
  const pack = state.player.pack;
  if (here === it.cell && !isEmpty(pile(state, it.cell)) && weight(pack) < PACK_HARD_KG - 1e-9) {
    const before = weight(pack);
    loadPack(state, world);
    if (weight(pack) > before + 1e-9) {
      it.step = "loading up";
      return "again";
    }
  }
  if (packCarries(state, it)) {
    if (here !== it.campCell) return walkTo(state, world, cal, it, it.campCell, " with the load");
    dropEverything(state, world);
    it.step = "unloading at camp";
    return "again";
  }
  if (here !== it.cell) return walkTo(state, world, cal, it, it.cell, " for the rest");
  // At the pile with nothing loaded and nothing that counts: what is on your back is in the way. Take it to camp.
  return walkTo(state, world, cal, it, it.campCell, " with the load");
}

/** Moves the missing materials of a build from this region's piles to camp, one load at a time. Undefined when there is nothing to fetch. */
function fetchStep(state: GameState, world: World, cal: Calendar, it: Intent): Outcome | "none" {
  const sid = it.arg as StructureId;
  const st = regionState(state, world, state.player.region);
  if ((st.build[sid] ?? 0) > 0) return "none";
  const p = state.player;
  const campInvs = [p.pack, pile(state, it.campCell)];
  const needs: Need[] = STRUCTURES[sid].needs;
  if (canConsume(campInvs, needs)) return "none";
  const missing = needs.filter((n) => resolveNeed(campInvs, n) === null);
  const wanted = (inv: Parameters<typeof qty>[0]) => missing.some((n) => qty(inv, n.item) > 1e-9 || (n.alt !== undefined && qty(inv, n.alt) > 1e-9));
  const here = cellOf(state, world);
  if (wanted(p.pack)) {
    if (here !== it.campCell) return walkTo(state, world, cal, it, it.campCell, " with materials");
    dropEverything(state, world);
    it.step = "laying out materials at camp";
    return "again";
  }
  const sources = pilesIn(state, world, p.region)
    .filter((x) => x.cell !== it.campCell && wanted(x.inv))
    .map((x) => ({ ...x, km: kmBetween(world, here, x.cell) }))
    .filter((x): x is { cell: number; inv: typeof x.inv; km: number } => x.km !== null)
    .sort((a, b) => a.km - b.km);
  if (!sources.length) return "none";
  const src = sources[0];
  if (here !== src.cell) return walkTo(state, world, cal, it, src.cell, " for materials");
  // The missing things first, then whatever else fits.
  let room = PACK_HARD_KG - weight(p.pack);
  for (const n of missing) {
    for (const item of [n.item, n.alt].filter((x): x is ItemId => x !== undefined)) {
      const have = qty(src.inv, item);
      const unit = ITEM_KG[item];
      const max = unit >= 1 ? Math.floor(room / unit + 1e-9) : room / unit;
      const take = Math.min(have, Math.max(0, max));
      if (take > 0) {
        transfer(src.inv, p.pack, item, take);
        room -= take * unit;
      }
    }
  }
  loadPack(state, world);
  it.step = "loading materials";
  return "again";
}

/** The work tier: one rule fires. "again" means an instant action was taken and the next decision can follow at once. */
function workStep(state: GameState, world: World, cal: Calendar): Outcome {
  const it = state.intent!;
  const here = cellOf(state, world);
  const label = labelOf(state, world, cal, it);
  if (it.task === "build" && it.arg !== "snare") {
    const f = fetchStep(state, world, cal, it);
    if (f !== "none") return f;
  }
  const o = UNCHECKED.has(it.task) ? null : check(state, world, cal, it.task, it.arg, it.cell);
  const met = untilMet(state, it);
  if (met || (o && !o.ok)) {
    if (deliveryPending(state, it)) return deliveryStep(state, world, cal, it);
    if (met) endIntent(state, `${label}: done.`, "good");
    else endIntent(state, `${label}: ${o!.why}. You stop.`, "bad");
    return undefined;
  }
  if (it.deliver === "camp" && (it.task === "haul" || loadFull(state, it))) return deliveryStep(state, world, cal, it);
  if (here !== it.cell) return walkTo(state, world, cal, it, it.cell, "");
  if (it.task === "night") return undefined;
  const step: Step = { id: it.task, arg: it.arg, step: o ? o.label.charAt(0).toLowerCase() + o.label.slice(1) : it.task === "rest" ? "resting" : "sleeping" };
  if (!takeStep(state, world, cal, step)) endIntent(state, `${label}: cannot go on. You stop.`, "bad");
  return undefined;
}

/**
 * Called once a minute by advance, after stepTask. The body tier may take
 * over a running task; the work tier runs only when the slot is free. At
 * most eight instant actions chain in one call, as the old haul plan did.
 */
export function runIntent(state: GameState, world: World, cal: Calendar, rng: Rng): void {
  if (!state.intent || state.dead) return;
  const it = state.intent;
  const need = currentNeed(state, cal, it);
  it.need = need;
  if (need) {
    const s = bodyStep(state, world, cal, rng, need);
    if (s) {
      if (!isRunning(state, s)) takeStep(state, world, cal, s);
      return;
    }
  }
  for (let guard = 0; guard < 8 && state.intent && !state.task; guard++) {
    if (workStep(state, world, cal) !== "again") return;
  }
}
```

`tsconfig` has `noUnusedLocals`: drop any import above that the final file does not use.

For this task, `body.ts` does not exist yet: create a stub so the module compiles, replaced in Task 5:

```ts
// src/sim/body.ts, stub until the body tier lands
import type { Rng } from "../rng";
import type { World } from "../world/gen";
import type { Calendar } from "./calendar";
import type { Step } from "./steps";
import type { BodyNeed, GameState, Intent } from "./types";

export function currentNeed(_state: GameState, _cal: Calendar, _it: Intent): BodyNeed | null {
  return null;
}
export function bodyStep(_state: GameState, _world: World, _cal: Calendar, _rng: Rng, _need: BodyNeed): Step | null {
  return null;
}
export function provision(_state: GameState, _world: World): void {}
```

- [ ] **Step 5: Remove the plan**

In `src/sim/types.ts` delete `PlanStep`, `Plan`, and `plan: Plan | null;` from `GameState`. In `src/sim/newgame.ts` delete `plan: null,`. In `src/sim/tasks.ts`:

- delete `startHaul`, `runPlan`, and the `state.plan = null;` line in `setAside`;
- in `beginTask`, replace `if (id === "haul") return startHaul(state, world, cal);` with `if (id === "haul") return false;` placed beside the `night` guard, before `check`;
- export `loadPack` and `withProgression`;
- remove `PlanStep` from the types import.

In `src/sim/advance.ts` replace `if (!state.task) runPlan(state, world, cal);` with `runIntent(state, world, cal, rng);` and fix the imports (`runIntent` from `./intent`, drop `runPlan`).

In `src/ui/panels.ts` `taskHtml`, delete the two `state.plan` uses (lines 210 and 211): the `if (state.plan) label = ...` line, and the `: state.plan ? ... : ""` branch, leaving `${t.repeat ? " <span class=\"r\">on repeat</span>" : ""}`. Task 7 rewrites this function; this keeps it compiling.

In `src/main.ts` `onClick`, case `"task"`:

```ts
    case "task": {
      const id = target.dataset.id as TaskId;
      if (id === "haul" || id === "night") {
        startIntent(state, world, cal, rng, { task: id, until: { kind: "once" }, deliver: "camp", where: { cell: cellOf(state, world) } });
      } else {
        startTask(state, world, cal, id, target.dataset.arg || undefined, target.dataset.repeat === "1");
      }
      break;
    }
```

with `startIntent` imported from `./sim/intent` and `cellOf` from `./sim/position`.

- [ ] **Step 6: Run everything**

Run: `cd 08-survidle && npm test && npx tsc --noEmit && npm run build`
Expected: PASS. If "brings a full load" runs past the budget, check that `loadFull` fires (four logs at 20 kg each exceed 35 kg) and that `deliveryStep` returns to the forest after each drop.

- [ ] **Step 7: Commit**

```bash
cd 08-survidle && git add src/sim/steps.ts src/sim/intent.ts src/sim/body.ts src/sim/types.ts src/sim/newgame.ts src/sim/tasks.ts src/sim/advance.ts src/ui/panels.ts src/main.ts tests/intent.test.ts tests/tasks.test.ts
git commit -m "feat(survidle): intents walk to the work, do it, bring it to camp and stop when told; hauling is one of them"
```

---

### Task 5: The body tier

**Files:**
- Replace: `src/sim/body.ts`
- Test: `tests/body.test.ts` (new)

**Interfaces:**
- Consumes: `Step`, `isRunning`, `walkStep` from `steps.ts`; `check`, `beginTask` from `tasks.ts`; `eat` from `actions.ts`; `Intent.need` and its clearing in `stepTask` (Task 3).
- Produces:
  ```ts
  export const SLEEP_AT = 20, NIGHT_SLEEP_UNDER = 60, COLD_UNDER = 30, WARM_AT = 45, HUNGRY_UNDER = 1800, PROVISION_KG = 2;
  export function currentNeed(state, cal, it: Intent): BodyNeed | null
  export function bodyStep(state, world, cal, rng, need: BodyNeed): Step | null   // null: nothing to start (hungry with nothing to do, or a portion just eaten)
  export function provision(state, world): void
  ```

- [ ] **Step 1: Write the failing tests**

Create `tests/body.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { Rng } from "../src/rng";
import { advance } from "../src/sim/advance";
import { calendar } from "../src/sim/calendar";
import { addItem, pile, qty, weight } from "../src/sim/inventory";
import { startIntent } from "../src/sim/intent";
import { newGame } from "../src/sim/newgame";
import { cellOf } from "../src/sim/position";
import { regionState } from "../src/sim/regionstate";
import { PACK_COMFORTABLE_KG } from "../src/units";

type G = ReturnType<typeof newGame>;
const cal = calendar(0);
const rng = () => new Rng(1);
function until(g: G, pred: () => boolean, max = 3000): boolean {
  for (let i = 0; i < max; i++) {
    if (pred()) return true;
    advance(g.state, g.world, 1);
  }
  return pred();
}
/** A forever felling from camp, with the camp cell to hand. */
function felling(seed = 3) {
  const g = newGame(seed);
  const { state, world } = g;
  const camp = regionState(state, world, state.player.region).campCell;
  addItem(state.player.pack, "driedMeat", 2);
  startIntent(state, world, cal, rng(), { task: "chop", until: { kind: "forever" }, deliver: "leave", where: "nearest" });
  return { g, state, world, camp };
}

describe("the body tier", () => {
  it("spent, it sets the tree aside, walks to camp and sleeps there", () => {
    const { g, state, world, camp } = felling();
    expect(until(g, () => state.task?.id === "chop")).toBe(true);
    advance(state, world, 20);
    state.player.energy = 20;
    advance(state, world, 1);
    expect(state.task?.id).toBe("walk");
    expect(state.intent?.step).toBe("walking to camp for the night");
    expect(state.intent?.need).toBe("sleep");
    expect(Object.keys(state.paused)).toHaveLength(1);
    expect(until(g, () => state.task?.id === "sleep")).toBe(true);
    expect(cellOf(state, world)).toBe(camp);
    expect(state.intent?.step).toBe("sleeping");
    expect(until(g, () => state.task?.id !== "sleep", 700)).toBe(true);
    expect(state.intent?.need).toBeNull();
    // Back to the tree it left, and on with the same intent.
    expect(until(g, () => state.task?.id === "chop")).toBe(true);
    expect(state.task!.progress).toBeGreaterThan(15);
  });

  it("night with the energy under 60 is bedtime; over it is not", () => {
    const { g, state } = felling();
    expect(until(g, () => state.task?.id === "chop")).toBe(true);
    // 21:00 on 1 April is dark at 62 N.
    state.minute = 13 * 60;
    state.player.energy = 59;
    advance(state, g.world, 1);
    expect(state.intent?.need).toBe("sleep");
    const other = felling();
    expect(until(other.g, () => other.state.task?.id === "chop")).toBe(true);
    other.state.minute = 13 * 60;
    other.state.player.energy = 61;
    advance(other.state, other.world, 1);
    expect(other.state.intent?.need).toBeNull();
    expect(other.state.task?.id).toBe("chop");
  });

  it("makes a fire for the night when the means are at camp: pit from stones, a split log, then light", () => {
    const { g, state, world, camp } = felling();
    state.player.tools.push({ id: "fireDrill", durability: 100 });
    addItem(pile(state, camp), "stone", 6);
    addItem(pile(state, camp), "log", 1);
    expect(until(g, () => state.task?.id === "chop")).toBe(true);
    state.player.energy = 20;
    const steps: string[] = [];
    until(g, () => {
      const s = state.intent?.step ?? "";
      if (steps.at(-1) !== s) steps.push(s);
      return state.task?.id === "sleep";
    }, 1500);
    expect(steps).toEqual(expect.arrayContaining(["walking to camp for the night", "laying a fire pit", "splitting a log for the fire", "lighting the fire", "sleeping"]));
    expect(regionState(state, world, state.player.region).fire.lit).toBe(true);
  });

  it("with no way to camp it sleeps where it stands and says so", () => {
    const { g, state, world } = felling();
    expect(until(g, () => state.task?.id === "chop")).toBe(true);
    // Overload the pack so no walk can start.
    addItem(state.player.pack, "stone", 40);
    state.player.energy = 20;
    advance(state, world, 1);
    expect(state.task?.id).toBe("sleep");
    expect(state.intent?.step).toContain("where you stand");
    expect(state.log.some((e) => e.text.includes("You sleep where you are"))).toBe(true);
  });

  it("cold, it goes to camp and rests until warm again, and sleep outranks cold", () => {
    const { g, state, world } = felling();
    expect(until(g, () => state.task?.id === "chop")).toBe(true);
    state.player.warmth = 29;
    advance(state, world, 1);
    expect(state.intent?.need).toBe("cold");
    expect(state.intent?.step).toBe("walking to camp to warm up");
    expect(until(g, () => state.task?.id === "rest")).toBe(true);
    // Between the entry and the exit the need still holds; at the exit it lets go.
    state.player.warmth = 40;
    advance(state, world, 1);
    expect(state.intent?.need).toBe("cold");
    state.player.warmth = 80;
    advance(state, world, 1);
    expect(state.intent?.need).toBeNull();
    state.player.warmth = 20;
    state.player.energy = 15;
    advance(state, world, 1);
    expect(state.intent?.need).toBe("sleep");
  });

  it("hungry, it eats from the pack and keeps working; with food only at camp it goes there", () => {
    const { g, state, world, camp } = felling();
    expect(until(g, () => state.task?.id === "chop")).toBe(true);
    state.player.autoEat = false;
    state.player.kcal = 1700;
    advance(state, world, 1);
    expect(state.player.kcal).toBeGreaterThan(1700);
    expect(state.task?.id).toBe("chop");
    state.player.pack.items.driedMeat = 0;
    addItem(pile(state, camp), "driedMeat", 1);
    state.player.kcal = 1700;
    advance(state, world, 1);
    expect(state.intent?.step).toBe("walking to camp to eat");
    expect(until(g, () => state.player.kcal > 1800)).toBe(true);
    expect(cellOf(state, world)).toBe(camp);
  });

  it("pockets provisions when leaving camp, up to 2 kg and never past the comfortable load", () => {
    const g = newGame(3);
    const { state, world } = g;
    const camp = regionState(state, world, state.player.region).campCell;
    state.player.pack.items.driedMeat = 0;
    addItem(pile(state, camp), "driedMeat", 5);
    startIntent(state, world, cal, rng(), { task: "sticks", until: { kind: "once" }, deliver: "leave", where: "nearest" });
    expect(qty(state.player.pack, "driedMeat")).toBeCloseTo(2, 6);
    expect(weight(state.player.pack)).toBeLessThanOrEqual(PACK_COMFORTABLE_KG);
  });

  it("a working day: trees fall, the night is spent at camp, and the work goes on at dawn", () => {
    const { g, state, world, camp } = felling(5);
    const seen = new Map<string, number>();
    for (let m = 0; m < 1440 * 1.5; m++) {
      advance(state, world, 1);
      const k = `${state.task?.id ?? "idle"}@${cellOf(state, world) === camp ? "camp" : "away"}`;
      seen.set(k, (seen.get(k) ?? 0) + 1);
    }
    expect(state.dead).toBeNull();
    expect(state.stats.trees).toBeGreaterThan(3);
    expect(seen.get("sleep@camp") ?? 0).toBeGreaterThan(60);
    expect(seen.get("chop@away") ?? 0).toBeGreaterThan(300);
    expect(state.intent?.task).toBe("chop");
    // Woodcraft trained only through the felling minutes. The trace samples after each minute, so the
    // minute a tree comes down is counted by train and not by the trace: one minute per tree of slack.
    expect(Math.abs(state.skills.woodcraft.xp - seen.get("chop@away")!)).toBeLessThanOrEqual(state.stats.trees + 1);
  });

  it("a cabin build is set aside for the night and picked up with its minutes kept", () => {
    const g = newGame(3);
    const { state, world } = g;
    const camp = regionState(state, world, state.player.region).campCell;
    const st = regionState(state, world, state.player.region);
    st.structures.firePit = true;
    addItem(pile(state, camp), "log", 40);
    addItem(pile(state, camp), "stone", 12);
    addItem(pile(state, camp), "cordage", 8);
    addItem(state.player.pack, "driedMeat", 2);
    state.player.energy = 25;
    startIntent(state, world, cal, rng(), { task: "build", arg: "cabin", until: { kind: "once" }, deliver: "leave", where: "nearest" });
    expect(state.task?.id).toBe("build");
    expect(until(g, () => state.task?.id === "sleep", 1500)).toBe(true);
    const banked = st.build.cabin ?? 0;
    expect(banked).toBeGreaterThan(10);
    expect(until(g, () => state.task?.id === "build", 1500)).toBe(true);
    expect(state.task!.duration).toBeCloseTo(3600 - banked, 0);
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `cd 08-survidle && npx vitest run tests/body.test.ts`
Expected: FAIL: the stub returns no need, so the character keeps felling at energy 20.

- [ ] **Step 3: body.ts**

Replace `src/sim/body.ts`:

```ts
/**
 * The body tier of an intent: sleep, cold and hunger, in that order, and
 * what to do about each. Every step is an ordinary task; the fire steps are
 * guarded by check, so a missing drill or an under-level pit is skipped,
 * never an error.
 */
import type { Rng } from "../rng";
import { PACK_COMFORTABLE_KG } from "../units";
import { regionAt, type World } from "../world/gen";
import { eat } from "./actions";
import type { Calendar } from "./calendar";
import { hasTool, pile, qty, reach, totalQty, transfer, weight } from "./inventory";
import { AUTO_EAT_ORDER, type FoodId, ITEM_KG } from "./items";
import { log } from "./log";
import { cellOf } from "./position";
import { regionState } from "./regionstate";
import { isRunning, type Step, walkStep } from "./steps";
import { check } from "./tasks";
import type { BodyNeed, GameState, Intent } from "./types";

export const SLEEP_AT = 20;
export const NIGHT_SLEEP_UNDER = 60;
export const COLD_UNDER = 30;
export const WARM_AT = 45;
export const HUNGRY_UNDER = 1800;
export const PROVISION_KG = 2;
/** Densest first, so two kilos carry the most days. */
const PROVISIONS: FoodId[] = ["driedMeat", "cookedMeat", "cookedFish", "berries"];

/** The need that holds now, sleep first. A need already being served keeps holding until its own exit. */
export function currentNeed(state: GameState, cal: Calendar, it: Intent): BodyNeed | null {
  const p = state.player;
  const sleep = it.need === "sleep"
    || p.energy <= SLEEP_AT
    || (cal.isNight && p.energy < NIGHT_SLEEP_UNDER)
    || (it.task === "night" && it.done < 1);
  if (sleep) return "sleep";
  if (p.warmth < COLD_UNDER || (it.need === "cold" && p.warmth < WARM_AT)) return "cold";
  if (p.kcal < HUNGRY_UNDER) return "hungry";
  return null;
}

/** The step a need calls for, or null when there is nothing to start for it. */
export function bodyStep(state: GameState, world: World, cal: Calendar, rng: Rng, need: BodyNeed): Step | null {
  if (need === "hungry") return hungryStep(state, world, cal, rng);
  return campStep(state, world, cal, need);
}

/** Walk to this region's camp, make a fire if the means are here, then sleep or rest. */
function campStep(state: GameState, world: World, cal: Calendar, need: "sleep" | "cold"): Step {
  const p = state.player;
  const st = regionState(state, world, p.region);
  const here = cellOf(state, world);
  const it = state.intent!;
  if (here !== st.campCell) {
    const why = need === "sleep" ? " for the night" : " to warm up";
    if (check(state, world, cal, "walk", `cell:${st.campCell}`).ok) return walkStep(state, world, st.campCell, why);
    const s: Step = need === "sleep"
      ? { id: "sleep", step: "sleeping where you stand; no way to camp" }
      : { id: "rest", step: "resting to warm up; no way to camp" };
    if (!isRunning(state, s) && need === "sleep") log(state, "No way to camp from here. You sleep where you are.", "bad");
    return s;
  }
  if (!st.fire.lit) {
    if (!st.structures.firePit) {
      if (check(state, world, cal, "build", "firePit").ok) return { id: "build", arg: "firePit", step: "laying a fire pit" };
    } else if (check(state, world, cal, "light").ok) {
      return { id: "light", step: "lighting the fire" };
    } else if (hasTool(p, "fireDrill") && totalQty(reach(state, world), "firewood") < 1 && check(state, world, cal, "split").ok) {
      return { id: "split", step: "splitting a log for the fire" };
    }
  }
  if (need === "sleep") {
    const s: Step = { id: "sleep", step: "sleeping" };
    if (!isRunning(state, s) && st.campCell !== it.campCell) log(state, `You turn in at camp in ${regionAt(world, p.region).name}.`);
    return s;
  }
  return { id: "rest", step: st.fire.lit ? "warming up by the fire" : "resting to warm up" };
}

/** Eat what is in reach; else go where the food is; else nothing. */
function hungryStep(state: GameState, world: World, cal: Calendar, rng: Rng): Step | null {
  const it = state.intent!;
  for (const food of AUTO_EAT_ORDER) {
    if (eat(state, world, food, rng)) return null;
  }
  if (cellOf(state, world) === it.campCell) return null;
  const camp = pile(state, it.campCell);
  if (!AUTO_EAT_ORDER.some((f) => qty(camp, f) > 1e-9)) return null;
  if (!check(state, world, cal, "walk", `cell:${it.campCell}`).ok) return null;
  return walkStep(state, world, it.campCell, " to eat");
}

/**
 * Lunch for the day: at the home camp, pocket safe food from the pile up to
 * PROVISION_KG in the pack, never past the comfortable load.
 */
export function provision(state: GameState, world: World): void {
  const it = state.intent;
  if (!it || cellOf(state, world) !== it.campCell) return;
  const pack = state.player.pack;
  const camp = pile(state, it.campCell);
  let want = PROVISION_KG - PROVISIONS.reduce((a, f) => a + qty(pack, f), 0);
  let room = PACK_COMFORTABLE_KG - weight(pack);
  for (const f of PROVISIONS) {
    if (want <= 1e-9 || room <= 1e-9) return;
    const kg = Math.min(want, room, qty(camp, f)) / ITEM_KG[f];
    if (kg <= 1e-9) continue;
    const moved = transfer(camp, pack, f, kg);
    want -= moved;
    room -= moved;
  }
}
```

Eating is instant and `hungryStep` returns null after it, so the running task goes on and the Doing panel keeps showing its step.

Check `stepTask`'s need clearing (Task 3) covers the "sleep where you stand" case: it does, since it keys on the task id, not on where the sleep began.

- [ ] **Step 4: Run everything**

Run: `cd 08-survidle && npm test && npx tsc --noEmit`
Expected: PASS. If "night with the energy under 60" fails on `isNight`, print `calendar(13 * 60)` and pick a minute that is after sunset on 1 April; the fixture only needs a dark hour.

- [ ] **Step 5: Commit**

```bash
cd 08-survidle && git add src/sim/body.ts tests/body.test.ts
git commit -m "feat(survidle): an intent sleeps at camp, makes a fire when it can, warms up when cold and eats when hungry"
```

---

### Task 6: Fetching a build's materials

**Files:**
- Modify: `src/sim/intent.ts` (`fetchStep` exists from Task 4; this task proves it and fixes what the test finds)
- Test: `tests/intent.test.ts`

**Interfaces:**
- Consumes: `fetchStep` from Task 4, `STRUCTURES` from items.

- [ ] **Step 1: Write the failing test**

Append to `describe("the work tier", ...)` in `tests/intent.test.ts`:

```ts
  it("a build fetches what is missing from this region's piles, one load at a time, then builds", () => {
    const g = newGame(3);
    const { state, world } = g;
    const region = state.player.region;
    const camp = regionState(state, world, region).campCell;
    const r = regionAt(world, region);
    const forest = spotOf(r, "forest")!.cell;
    addItem(pile(state, camp), "stick", 8);
    addItem(pile(state, camp), "cordage", 2);
    addItem(pile(state, forest), "log", 4);
    addItem(state.player.pack, "driedMeat", 3);
    expect(intentOption(state, world, cal, "build", "leanTo", "nearest").ok).toBe(false);
    expect(startIntent(state, world, cal, rng(), req("build", { arg: "leanTo" }))).toBe(true);
    expect(state.intent?.step).toContain("for materials");
    expect(until(g, () => state.intent === null, 8000)).toBe(true);
    expect(regionState(state, world, region).structures.leanTo).toBe(true);
    expect(qty(pile(state, forest), "log")).toBe(0);
    expect(state.log.some((e) => e.text === "lean-to: done.")).toBe(true);
  });

  it("a build with materials nowhere in the region does not start; the button already says why", () => {
    const { state, world } = newGame(3);
    expect(intentOption(state, world, cal, "build", "leanTo", "nearest").why).toBe("missing materials at camp");
    expect(startIntent(state, world, cal, rng(), req("build", { arg: "leanTo" }))).toBe(false);
    expect(state.intent).toBeNull();
  });
```

- [ ] **Step 2: Run to verify**

Run: `cd 08-survidle && npx vitest run tests/intent.test.ts`
Expected: the first test FAILS at `startIntent(...)` returning false, because `startIntent` checks legality at the camp cell and finds materials missing before the fetch had a chance. The second passes already.

- [ ] **Step 3: Let a fetchable build start**

In `src/sim/intent.ts` `startIntent`, replace the legality line with:

```ts
  if (!UNCHECKED.has(req.task)) {
    const o = check(state, world, cal, req.task, req.arg, cell);
    if (!o.ok && !(req.task === "build" && req.arg !== "snare" && canFetch(state, world, req.arg as StructureId, regionState(state, world, state.player.region).campCell))) return false;
  }
```

and add, beside `fetchStep`:

```ts
/** Some pile in this region, other than camp's, holds a material the build still lacks. */
function canFetch(state: GameState, world: World, sid: StructureId, campCell: number): boolean {
  const campInvs = [state.player.pack, pile(state, campCell)];
  const missing = STRUCTURES[sid].needs.filter((n) => resolveNeed(campInvs, n) === null);
  if (!missing.length) return false;
  return pilesIn(state, world, state.player.region)
    .some((x) => x.cell !== campCell && missing.some((n) => qty(x.inv, n.item) > 1e-9 || (n.alt !== undefined && qty(x.inv, n.alt) > 1e-9)));
}
```

The second test passes already: with nothing to fetch, `startIntent` returns false and nothing is logged. The "You stop" line is for an intent that was running and found the materials gone, which the fetching loop produces if a pile empties under it.

- [ ] **Step 4: Run everything**

Run: `cd 08-survidle && npm test && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd 08-survidle && git add src/sim/intent.ts tests/intent.test.ts
git commit -m "feat(survidle): building fetches its missing materials from the piles of the region"
```

---

### Task 7: The Do panel and the Doing panel

**Files:**
- Modify: `src/ui/render.ts` (`UiState`, `newUiState`)
- Modify: `src/ui/panels.ts` (`doHtml`, `instantHtml`, `intentRowHtml`, `actionsHtml` gets an `instant` flag, `taskHtml`)
- Modify: `src/main.ts` (render `doHtml`; clicks `intent`, `strip`, `finish`, `advanced`; a `change` listener for the number field)
- Modify: `src/style.css`
- Test: `tests/ui.test.ts`, `tests/pause.test.ts`

**Interfaces:**
- Produces:
  ```ts
  // render.ts
  export interface UiState { tab: TaskGroup; selected: number | null; away: LogEntry[] | null; confirmAbandon: boolean; zoom: number;
    until: "once" | "times" | "campHas" | "forever"; n: number; deliver: "leave" | "camp"; where: "nearest" | SpotId; advanced: boolean }
  // panels.ts
  export function doHtml(state, world, cal, ui): string
  export function actionsHtml(state, world, cal, ui, instant = true): string   // unchanged output when instant is true
  export const INTENT_GROUPS: { label: string; items: { id: TaskId; arg?: string }[] }[]
  ```
  Markup contracts: intent rows carry `data-act="intent" data-id data-arg` and `data-opt="intent:<id>:<arg>"`; strip buttons carry `data-act="strip" data-k="until|deliver|where" data-v="<value>"` and class `on` when selected; the number field is `<input class="n" type="number" min="1" data-strip-n value="N">`; the advanced toggle is `data-act="advanced"`; the finish button on a set-aside entry is `data-act="finish" data-id data-arg data-cell`.

- [ ] **Step 1: Write the failing tests**

In `tests/ui.test.ts`, add `doHtml` to the panels import and `startIntent` from `../src/sim/intent`, `Rng` from `../src/rng`, and append:

```ts
describe("the Do panel", () => {
  const { state, world } = newGame(21);
  const cal = calendar(state.minute);

  it("has a settings strip, the instant buttons, and one row per intent, judged at the work's place", () => {
    const html = doHtml(state, world, cal, newUiState());
    expect(html).toContain('data-act="strip" data-k="until" data-v="forever"');
    expect(html).toContain('data-act="strip" data-k="deliver" data-v="camp"');
    expect(html).toContain('data-act="strip" data-k="where" data-v="nearest"');
    expect(html).toContain("data-strip-n");
    expect(html).toContain('data-act="eat"');
    // Felling is legal from camp because the intent walks to the forest itself.
    expect(html).toContain('data-act="intent" data-id="chop" data-arg=""');
    expect(html).not.toContain('class="opt off" data-opt="intent:chop:"');
    for (const id of RECIPE_IDS) expect(html).toContain(`data-opt="intent:craft:${id}"`);
    for (const id of STRUCTURE_IDS) expect(html).toContain(`data-opt="intent:build:${id}"`);
    for (const s of SPECIES) expect(html).toContain(s === "fish" ? 'data-opt="intent:fish:"' : `data-opt="intent:hunt:${s}"`);
    for (const id of ["sticks", "bark", "stone", "berries", "split", "cook", "light", "sharpen", "repair", "night", "rest", "sleep"]) {
      expect(html).toContain(`data-opt="intent:${id}:`);
    }
    expect(html).not.toContain('class="tabs"');
    expect(html).toContain('data-act="advanced"');
  });

  it("the strip's choice shows on the row, and the raw list appears under the advanced toggle unchanged", () => {
    const ui = { ...newUiState(), until: "forever" as const, deliver: "camp" as const, advanced: true };
    const html = doHtml(state, world, cal, ui);
    expect(html).toMatch(/data-opt="intent:chop:".*forever, bringing it to camp/s);
    expect(html).toContain('class="tabs"');
    expect(html).toContain('data-opt="haul:"');
    expect(html).toContain('data-opt="walk:spot:');
    expect(html).toContain(actionsHtml(state, world, cal, ui, false));
  });

  it("the Doing panel reads the intent as a sentence with its step, and set-aside work can be finished from anywhere", () => {
    const g = newGame(21);
    const rng = new Rng(1);
    startIntent(g.state, g.world, calendar(0), rng, { task: "chop", until: { kind: "campHas", qty: 40 }, deliver: "camp", where: "nearest" });
    let html = taskHtml(g.state, g.world, calendar(0));
    expect(html).toContain("Fell a tree, until camp has 40 logs, bringing it to camp");
    expect(html).toContain("walking to the forest");
    expect(html).toContain('data-act="stop"');
    // A tree half felled, then the intent stopped from camp: the entry offers finish, not resume.
    placeAtSpot(g.state, g.world, g.state.player.region, "forest");
    startTask(g.state, g.world, calendar(0), "chop");
    for (let i = 0; i < 30; i++) stepTask(g.state, g.world, calendar(0), rng, 1);
    stopTask(g.state, g.world);
    placeAtSpot(g.state, g.world, g.state.player.region, "camp");
    html = taskHtml(g.state, g.world, calendar(0));
    expect(html).toContain('data-act="finish" data-id="chop"');
    expect(html).not.toContain('>resume<');
  });
});
```

Add `startTask, stepTask, stopTask` to the tasks import in that file.

In `tests/pause.test.ts`, the existing "lists what is set aside with a resume button" test stays; append one assertion inside it after the resume check, if the test has the player away from the cell at some point: `expect(html).toContain('data-act="finish"')`. If it does not, leave it; the new ui test covers finish.

- [ ] **Step 2: Run to verify they fail**

Run: `cd 08-survidle && npx vitest run tests/ui.test.ts`
Expected: FAIL: `doHtml` is not exported.

- [ ] **Step 3: UiState**

In `src/ui/render.ts`:

```ts
import type { TaskGroup } from "../sim/tasks";
import type { LogEntry, SpotId } from "../sim/types";

/** What the screen remembers that the game does not. */
export interface UiState {
  /** The raw list's tab, under the advanced toggle. */
  tab: TaskGroup;
  selected: number | null;
  away: LogEntry[] | null;
  confirmAbandon: boolean;
  zoom: number;
  /** The settings strip: what the next intent clicked will do. */
  until: "once" | "times" | "campHas" | "forever";
  n: number;
  deliver: "leave" | "camp";
  where: "nearest" | SpotId;
  advanced: boolean;
}

export function newUiState(): UiState {
  return { tab: "gather", selected: null, away: null, confirmAbandon: false, zoom: 0, until: "once", n: 10, deliver: "leave", where: "nearest", advanced: false };
}
```

- [ ] **Step 4: panels.ts**

In `src/ui/panels.ts`:

Extract the instant buttons from `actionsHtml` into `instantHtml(state, world)` returning exactly the `<div style="margin:4px 0 8px;...">...</div>` string it builds today, and make `actionsHtml(state, world, cal, ui, instant = true)` call it only when `instant && ui.tab === "camp"`. The output for `instant = true` is what it was.

Add the catalogue and the row:

```ts
export const INTENT_GROUPS: { label: string; items: { id: TaskId; arg?: string }[] }[] = [
  { label: "Gather", items: [{ id: "chop" }, { id: "sticks" }, { id: "bark" }, { id: "stone" }, { id: "berries" }] },
  { label: "Hunt", items: [...SPECIES.filter((s) => s !== "fish").map((s) => ({ id: "hunt" as TaskId, arg: s })), { id: "fish" }] },
  { label: "Camp", items: [{ id: "split" }, { id: "cook", arg: "rawMeat" }, { id: "cook", arg: "fish" }, { id: "light" }, { id: "repair" }, { id: "sharpen" }, { id: "night" }, { id: "rest" }, { id: "sleep" }] },
  { label: "Make", items: RECIPE_IDS.map((id) => ({ id: "craft" as TaskId, arg: id })) },
  { label: "Build", items: STRUCTURE_IDS.map((id) => ({ id: "build" as TaskId, arg: id })) },
];

/** What the strip would add to a plain click, in words; empty for once, leave it, nearest. */
function stripSentence(ui: UiState, id: TaskId, arg: string | undefined): string {
  const parts: string[] = [];
  const item = yieldItem(id, arg);
  if (ui.until === "times") parts.push(`${ui.n} times`);
  else if (ui.until === "campHas") parts.push(item ? `until camp has ${itemLabel(item, ui.n)}` : "once");
  else if (ui.until === "forever") parts.push("forever");
  if (ui.deliver === "camp") parts.push("bringing it to camp");
  if (ui.where !== "nearest") parts.push(`at ${SPOT_NAMES[ui.where]}`);
  return parts.join(", ");
}

function intentRowHtml(o: TaskOption, extra: string): string {
  const arg = o.arg ?? "";
  const rec = o.recommended ? `<small class="rec${o.recommended.under ? " warn" : ""}">${esc(o.recommended.text)}</small>` : "";
  const bar = o.mastery ? masteryBar(o.mastery) : "";
  const detail = [o.detail, extra].filter(Boolean).join("; ");
  if (!o.ok) {
    return `<div class="opt off" data-opt="intent:${o.id}:${esc(arg)}"><span class="act">${esc(o.label)}${rec}<small>${esc(o.why)}${detail ? ` - ${esc(detail)}` : ""}</small>${bar}</span></div>`;
  }
  const time = o.duration > 0 ? `${fmtDuration(o.duration)} (${fmtReal(o.duration)})${o.resume ? `, ${Math.round(o.resume * 100)}% already done` : ""}` : "";
  const line = [time, detail].filter(Boolean).join("; ");
  return `<div class="opt" data-opt="intent:${o.id}:${esc(arg)}"><button class="act" data-act="intent" data-id="${o.id}" data-arg="${esc(arg)}">${esc(o.label)}${rec}<small>${esc(line)}</small>${bar}</button></div>`;
}

function stripHtml(state: GameState, world: World, ui: UiState): string {
  const b = (k: string, v: string, label: string, on: boolean) => `<button class="mini${on ? " on" : ""}" data-act="strip" data-k="${k}" data-v="${v}">${label}</button>`;
  const r = regionAt(world, state.player.region);
  const here = cellOf(state, world);
  const spots = r.spots.filter((s) => s.id !== "camp").map((s) => {
    const km = kmBetween(world, here, s.cell);
    return b("where", s.id, `${SPOT_NAMES[s.id]}${km === null ? "" : ` <small>${fmtKm(km)}</small>`}`, ui.where === s.id);
  }).join("");
  return `<div class="strip">
<div><small>do it</small>${b("until", "once", "once", ui.until === "once")}${b("until", "times", "N times", ui.until === "times")}${b("until", "campHas", "until camp has N", ui.until === "campHas")}${b("until", "forever", "forever", ui.until === "forever")}<input class="n" type="number" min="1" data-strip-n value="${ui.n}"></div>
<div><small>bring it</small>${b("deliver", "leave", "leave it", ui.deliver === "leave")}${b("deliver", "camp", "to camp", ui.deliver === "camp")}</div>
<div><small>where</small>${b("where", "nearest", "nearest", ui.where === "nearest")}${spots}</div>
</div>`;
}

export function doHtml(state: GameState, world: World, cal: Calendar, ui: UiState): string {
  const groups = INTENT_GROUPS.map((g) => {
    const rows = g.items.map(({ id, arg }) => intentRowHtml(withProgression(state, world, intentOption(state, world, cal, id, arg, ui.where)), stripSentence(ui, id, arg))).join("");
    return `<div class="grp"><small>${g.label}</small>${rows}</div>`;
  }).join("");
  const adv = `<div style="margin-top:8px"><button class="mini${ui.advanced ? " on" : ""}" data-act="advanced">advanced: ${ui.advanced ? "on" : "off"}</button></div>${ui.advanced ? actionsHtml(state, world, cal, ui, false) : ""}`;
  return `<h2>Do</h2>${stripHtml(state, world, ui)}${instantHtml(state, world)}${groups}${adv}`;
}
```

Imports to add in panels.ts: `intentOption, intentSentence, yieldItem` from `../sim/intent`; `withProgression` from `../sim/tasks` (exported in Task 4); `TaskId` from `../sim/types`; `RECIPE_IDS, STRUCTURE_IDS` from `../sim/items`; `kmBetween` is already imported from position.

Rewrite `taskHtml`:

```ts
export function taskHtml(state: GameState, world: World, cal: Calendar): string {
  const t = state.task;
  const it = state.intent;
  const here = cellOf(state, world);
  const aside = pausedList(state, world, cal);
  const asideHtml = aside.length
    ? `<div class="aside"><small>Set aside</small>${aside
        .map(({ task, option, here: isHere }) => {
          const pct = Math.round(task.fraction * 100);
          const note = !isHere || !option.ok ? ` <small>${esc(option.why)}</small>` : "";
          const resume = option.ok
            ? ` <button class="mini" data-act="task" data-id="${task.id}" data-arg="${esc(task.arg ?? "")}">resume</button>`
            : "";
          const cell = task.cell < 0 ? here : task.cell;
          const finish = ` <button class="mini" data-act="finish" data-id="${task.id}" data-arg="${esc(task.arg ?? "")}" data-cell="${cell}" title="Go there if need be and finish it">finish</button>`;
          return `<div class="paused">${esc(option.label)} <b>${pct}%</b>${note}${resume}${finish}</div>`;
        })
        .join("")}</div>`
    : "";
  const bar = `<div class="bar task"><div class="fill" id="bar-task"></div><span class="lbl"><span id="val-task"></span><span id="task-pct"></span></span></div>`;
  if (it) {
    return `<h2>Doing</h2>
<div class="head"><b>${esc(intentSentence(state, world, cal, it))}</b><button class="mini" data-act="stop" title="Stop; the share done is kept">stop</button></div>
<div class="step">${esc(it.step)}</div>${t ? bar : ""}${asideHtml}`;
  }
  if (!t) return `<h2>Doing</h2><div class="dim">Nothing. Pick something below.</div>${asideHtml}`;
  const opts = availableTasks(state, world, cal);
  let label = opts.find((o) => o.id === t.id && (o.arg ?? "") === (t.arg ?? ""))?.label ?? t.id;
  if ((t.id === "walk" || t.id === "travel") && state.route) label = `${t.id === "travel" ? "Go" : "Walk"} to ${state.route.label}`;
  return `<h2>Doing${t.repeat ? " <span class=\"r\">on repeat</span>" : ""}</h2>
<div class="head"><b>${esc(label)}</b><button class="mini" data-act="stop" title="Set it aside; the share done is kept">stop</button></div>
${bar}${asideHtml}`;
}
```

`updateBars` in `src/ui/bars.ts` already tolerates a missing `#bar-task` (it queries and checks for null), so nothing changes there; `bars.ts` is not in this task's commit.

- [ ] **Step 5: main.ts and style**

In `src/main.ts`:

- `render()`: `setPanel("actions", doHtml(state, world, cal, ui));` in place of `actionsHtml`.
- `onClick`, new cases:

```ts
    case "intent": {
      const until = ui.until === "times" ? { kind: "times" as const, n: ui.n }
        : ui.until === "campHas" ? { kind: "campHas" as const, qty: ui.n }
        : { kind: ui.until };
      startIntent(state, world, cal, rng, { task: target.dataset.id as TaskId, arg: target.dataset.arg || undefined, until, deliver: ui.deliver, where: ui.where });
      break;
    }
    case "strip": {
      const k = target.dataset.k as "until" | "deliver" | "where";
      const v = target.dataset.v as string;
      if (k === "until") ui.until = v as UiState["until"];
      else if (k === "deliver") ui.deliver = v as UiState["deliver"];
      else ui.where = v as UiState["where"];
      break;
    }
    case "advanced":
      ui.advanced = !ui.advanced;
      break;
    case "finish":
      startIntent(state, world, cal, rng, { task: target.dataset.id as TaskId, arg: target.dataset.arg || undefined, until: { kind: "once" }, deliver: "leave", where: { cell: Number(target.dataset.cell) } });
      break;
```

- A `change` listener for the number field, beside the keydown listener:

```ts
document.addEventListener("change", (ev) => {
  const el = ev.target as HTMLInputElement;
  if (!el.matches("[data-strip-n]")) return;
  ui.n = Math.max(1, Math.round(Number(el.value) || 1));
  render();
});
```

Import `UiState` type from `./ui/render` and `doHtml` from `./ui/panels`.

In `src/style.css`, after the `.tabs` rules:

```css
.strip { display: flex; flex-direction: column; gap: 4px; margin-bottom: 8px; }
.strip > div { display: flex; flex-wrap: wrap; gap: 4px; align-items: center; }
.strip > div > small { color: var(--dim); width: 52px; }
.strip .n { width: 52px; background: #181e27; color: var(--text); border: 1px solid var(--line); font: inherit; font-size: 12px; padding: 1px 4px; }
.grp { margin-top: 8px; }
.grp > small { color: var(--dim); display: block; margin-bottom: 2px; }
#task .step { color: var(--dim); margin: 4px 0; }
```

- [ ] **Step 6: Run everything**

Run: `cd 08-survidle && npm test && npx tsc --noEmit && npm run build`
Expected: PASS. The reachability tests in `ui.test.ts` still pass because `actionsHtml` is unchanged.

- [ ] **Step 7: Commit**

```bash
cd 08-survidle && git add src/ui/render.ts src/ui/panels.ts src/main.ts src/style.css tests/ui.test.ts tests/pause.test.ts
git commit -m "feat(survidle): a Do panel of intents with a settings strip; the Doing panel reads the intent as a sentence"
```

---

### Task 8: README, and a browser pass

**Files:**
- Modify: `docs/README.md` ("How it plays")
- No code unless the browser pass finds something.

- [ ] **Step 1: README**

In `docs/README.md`, replace the first bullet of "How it plays" and the "Carrying matters" bullet's haul sentence:

```markdown
- **You say what, the game does how.** Every button is an intent: "Fell a
  tree" walks to the forest itself; a strip above the list says how long
  (once, N times, until camp has N, forever), whether to bring the yield to
  camp, and where. The game does the walking, the work and the hauling,
  and when the body asks for it, the walk back to camp, a fire from what
  is at camp, and the night's sleep; at dawn it goes back to the work.
  Anything it cannot do (no axe, nothing left to fell, no materials) ends
  the intent with the reason in the log. An "advanced" toggle shows the
  raw single actions underneath, one at a time, as they were.
```

and in the carrying bullet: `"Bring it to camp" hauls a full load at a time: load 35 kg, walk to camp, drop, walk back, and the rest when the work is over; "Haul to camp" under advanced does the same for whatever lies where you stand.`

Add under Debug URL parameters nothing; under "Where the numbers live": `- `src/sim/body.ts`: when an intent sleeps, warms up, eats and provisions.`

- [ ] **Step 2: Browser pass**

Run `cd 08-survidle && npm run dev`, open `http://127.0.0.1:5173/prototypes/08/?seed=3&speed=60`. Set the strip to forever / to camp / nearest, click Fell a tree. Watch for: the Doing sentence, the walk step, felling, a haul leg at 40 kg, the night ("walking to camp for the night", "sleeping"), and the return at dawn. Then flip advanced on and confirm the old tabs render below. Stop the dev server. Note: `?seed=` restarts on every reload, so do not reload mid-run.

- [ ] **Step 3: Commit**

```bash
cd 08-survidle && git add docs/README.md
git commit -m "docs(survidle): intents in the README"
```

---

## Self-review against the spec

- 1 record, 1.1 resolution, 1.2 until and yields: Task 1 (record), Task 4 (`resolveCell`, `yieldItem`, `untilMet`, `campHas` fallback to once).
- 2 where the runner sits, the exhaustion floor: Task 3 (`beginTask` in advance), Task 4 (`runIntent` call).
- 3.1 sleep, 3.2 cold, 3.3 hungry, 3.4 provisioning: Task 5.
- 4.1 load and delivery, 4.2 rule order, 4.3 blockers, 4.4 haul and night: Task 4; the fetch rule proved in Task 6.
- 5 starting and stopping, the finish button: Task 3 (`startTask`/`stopTask`), Task 4 (`startIntent`), Task 7 (finish).
- 6 legality at a cell: Task 2.
- 7.1 the Do panel, 7.2 Doing, 7.3 log lines: Task 7; log lines in Tasks 4 and 5.
- 8 persistence: Task 1 (`fillDefaults`), Task 4 (save test).
- 9 removals: Task 4.
- 10 tests: spread as above; the browser pass in Task 8.
