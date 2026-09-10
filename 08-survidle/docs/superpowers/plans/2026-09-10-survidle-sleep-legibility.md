# Survidle Sleep Legibility Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Sleepiness the sole authority over automatic sleep, show approximate sleep and wake times, keep each sleep as one continuous activity, and leave Rest as the only explicit recovery action.

**Architecture:** Extend the pure two-process functions in `src/sim/sleep.ts` with onset and no-floor wake projections. A small UI projection turns those values into clock text beside the merged Sleepiness bar. The body records low-Stamina collapse independently from ordinary tiredness and forces Rest to the existing recovery line, while automatic Sleep remains a body-owned task that generic task completion cannot divide.

**Tech Stack:** TypeScript, Vite, Vitest, happy-dom

**Spec:** `docs/superpowers/specs/2026-09-10-survidle-sleep-legibility-design.md`

## Global Constraints

- Use only ASCII output and source text. Never use em dashes or other non-typable characters.
- Sleep debt plus circadian and ultradian alertness is the only authority over sleep onset and waking.
- Stamina may force Rest but may not start or extend Sleep.
- Keep the merged Stamina and Sleepiness bars.
- Keep the light-sleeper storm quality penalty at half-rate debt recovery.
- Do not run the full slow test suite. Focused slow-partition files are allowed during TDD.
- Do not expose `Sleep` or `Camp for the night` as player actions. Keep internal task IDs for save compatibility.

---

### Task 1: Project sleep onset and live wake time

**Files:**
- Modify: `src/sim/sleep.ts:87-151`
- Test: `tests/sleep.test.ts:120-202`

**Interfaces:**
- Produces: `minutesToSleep(debt: number, hour: number): number`
- Produces: `minutesUntilWake(debt: number, hour: number, halfRate?: boolean): number`
- Preserves: `minutesToWake(debt: number, hour: number, halfRate?: boolean): number` as the legacy one-hour-minimum task estimate

- [ ] **Step 1: Write failing projection tests**

Import `minutesToSleep` and `minutesUntilWake` in `tests/sleep.test.ts` and add:

```ts
it("projects sleep onset from sleep pressure and the body clock", () => {
  expect(minutesToSleep(10, 13)).toBe(680);
  expect(minutesToSleep(40, 20)).toBe(250);
});

it("projects the live wake crossing without imposing the legacy task floor", () => {
  expect(minutesUntilWake(0, 12)).toBe(10);
  expect(minutesToWake(0, 12)).toBe(SLEEP_MIN_MINUTES);
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
SURVIDLE_TEST_SUITE=slow npx vitest run tests/sleep.test.ts
```

Expected: FAIL because `minutesToSleep` and `minutesUntilWake` are not exported.

- [ ] **Step 3: Implement the projections with the existing process**

In `src/sim/sleep.ts`, keep `WAKE_PROBE_STEP` as the shared ten-minute projection step, add a 36-hour onset horizon, and implement:

```ts
const SLEEP_PROJECTION_MAX_MINUTES = 36 * 60;

export function minutesToSleep(debt: number, hour: number): number {
  let d = debt;
  for (let m = WAKE_PROBE_STEP; m <= SLEEP_PROJECTION_MAX_MINUTES; m += WAKE_PROBE_STEP) {
    d = debtStep(d, false, WAKE_PROBE_STEP);
    if (sleepiness(d, hour + m / 60) >= SLEEP_ONSET) return m;
  }
  return SLEEP_PROJECTION_MAX_MINUTES;
}

export function minutesUntilWake(debt: number, hour: number, halfRate = false): number {
  let d = debt;
  for (let m = WAKE_PROBE_STEP; m <= SLEEP_MAX_MINUTES; m += WAKE_PROBE_STEP) {
    d = debtStep(d, true, WAKE_PROBE_STEP, halfRate);
    if (sleepiness(d, hour + m / 60) <= WAKE_AT) return m;
  }
  return SLEEP_MAX_MINUTES;
}
```

Rewrite `minutesToWake` as `Math.max(SLEEP_MIN_MINUTES, minutesUntilWake(...))`. Do not read GameState, Stamina, or weather in `minutesToSleep`.

- [ ] **Step 4: Run the focused test and verify GREEN**

Run the command from Step 2. Expected: all `tests/sleep.test.ts` tests pass.

- [ ] **Step 5: Commit the process projection**

```bash
git add 08-survidle/src/sim/sleep.ts 08-survidle/tests/sleep.test.ts
git commit -m "feat(survidle): project sleep onset and live wake time"
```

### Task 2: Put clock forecasts beside the Sleepiness bar

**Files:**
- Create: `src/ui/sleep.ts`
- Modify: `src/ui/panels.ts:130-178`
- Modify: `src/ui/bars.ts:1-90`
- Modify: `src/style.css:220-235`
- Test: `tests/mood.test.ts:119-170`

**Interfaces:**
- Consumes: `minutesToSleep`, `minutesUntilWake`, `debtFallHalved`, `fmtClock`
- Produces: `sleepForecast(state: GameState, world: World, cal: Calendar): string`
- Produces markup hook: `[data-sleep-forecast]`

- [ ] **Step 1: Write failing UI projection tests**

Extend the merged Sleepiness test in `tests/mood.test.ts` with states whose debt is controlled directly:

```ts
it("shows the practical sleep clock beside the Sleepiness bar", () => {
  const { state, world } = newGame(17);
  state.minute = 5 * 60;
  state.player.sleepDebt = 10;
  const cal = calendar(state.minute, state.startDoy);
  document.body.innerHTML = statsHtml(state, world, cal, ambientTemperature(cal, state.weather), newUiState());
  updateBars(state, world);
  expect(document.querySelector("[data-sleep-forecast]")?.textContent).toBe("Sleep about 00:20");

  state.player.sleeping = { collapsed: false };
  state.player.sleepDebt = 64;
  updateBars(state, world);
  expect(document.querySelector("[data-sleep-forecast]")?.textContent).toMatch(/^Wake about \d\d:\d\d/);
});
```

Add a light-sleeper storm fixture using the existing test weather helpers and assert that the text ends with ` - storm reduces sleep quality`.

- [ ] **Step 2: Run the fast UI test and verify RED**

```bash
npx vitest run tests/mood.test.ts
```

Expected: FAIL because `[data-sleep-forecast]` does not exist.

- [ ] **Step 3: Implement the UI-only forecast projection**

Create `src/ui/sleep.ts`:

```ts
import type { World } from "../world/gen";
import { fmtClock, type Calendar } from "../sim/calendar";
import { debtFallHalved, minutesToSleep, minutesUntilWake, sleepiness, SLEEPY_AT } from "../sim/sleep";
import type { GameState } from "../sim/types";

export function sleepForecast(state: GameState, world: World, cal: Calendar): string {
  const asleep = state.player.sleeping !== null || state.task?.id === "sleep";
  if (asleep) {
    const reduced = debtFallHalved(state, world);
    const minutes = minutesUntilWake(state.player.sleepDebt, cal.hour, reduced);
    return `Wake about ${fmtClock((cal.hour + minutes / 60) % 24)}${reduced ? " - storm reduces sleep quality" : ""}`;
  }
  const minutes = minutesToSleep(state.player.sleepDebt, cal.hour);
  const soon = sleepiness(state.player.sleepDebt, cal.hour) >= SLEEPY_AT ? " soon," : "";
  return `Sleep${soon} about ${fmtClock((cal.hour + minutes / 60) % 24)}`;
}
```

Render `<div class="sleep-forecast" data-sleep-forecast>...</div>` immediately after the Sleepiness bar in `statsHtml`. In `updateBars`, update its `textContent` on every frame using the same helper. Add only spacing and subdued-text CSS; do not add a second bar.

- [ ] **Step 4: Run the UI test and verify GREEN**

Run the command from Step 2. Expected: all `tests/mood.test.ts` tests pass.

- [ ] **Step 5: Commit the forecast UI**

```bash
git add 08-survidle/src/ui/sleep.ts 08-survidle/src/ui/panels.ts 08-survidle/src/ui/bars.ts 08-survidle/src/style.css 08-survidle/tests/mood.test.ts
git commit -m "feat(survidle): show sleep and wake forecasts"
```

### Task 3: Make exhaustion Rest instead of Sleep

**Files:**
- Modify: `src/sim/body.ts:111-160`
- Modify: `src/sim/intent.ts:770-784`
- Modify: `src/sim/sleep.ts:55-78`
- Modify: `src/sim/types.ts:571-584`
- Modify: `src/sim/save.ts:265-280`
- Modify: `src/ui/panels.ts:145-175`
- Test: `tests/needs.test.ts:395-465`
- Test: `tests/workday.test.ts:60-110`
- Test: `tests/mood.test.ts:119-170`
- Test: `tests/bodyorder.test.ts:130-155,320-345`
- Test: `tests/orders.test.ts:1240-1280`
- Test: `tests/walkorders.test.ts:35-85`

**Interfaces:**
- Preserves: `player.sleeping` as `{ collapsed: false } | null` for sleep continuity
- Removes: collapse recovery as a sleep exit condition
- Migrates: `{ collapsed: true }` to `sleeping = null`, `player.collapsed = true`, and `bodyNeed = "spent"`

- [ ] **Step 1: Replace the collapse-sleep test with failing Rest behavior**

In `tests/needs.test.ts`, replace `a body under the collapse line sleeps parched...` with:

```ts
it("a body below the collapse line rests unless the sleep model is at onset", () => {
  const { state, world, night } = septemberEvening();
  const p = state.player;
  p.sleepDebt = 0;
  p.water = WATER_FULL;
  p.energy = SLEEP_AT;
  expect(currentNeed(state, world, night)).toBe("spent");
  expect(p.sleeping).toBeNull();

  p.bodyNeed = null;
  p.sleepDebt = debtFor(SLEEP_ONSET + 1, night.hour);
  expect(currentNeed(state, world, night)).toBe("sleep");
  expect(p.sleeping).toEqual({ collapsed: false });
});
```

Add a save test that serializes or constructs a legacy player with `sleeping: { collapsed: true }`, deserializes it, and expects `sleeping` to be null and `bodyNeed` to be `spent`.

- [ ] **Step 2: Run focused tests and verify RED**

```bash
SURVIDLE_TEST_SUITE=slow npx vitest run tests/needs.test.ts tests/workday.test.ts tests/bodyorder.test.ts tests/orders.test.ts tests/walkorders.test.ts
```

Expected: FAIL because low Stamina still creates collapsed sleep.

- [ ] **Step 3: Remove Stamina from sleep entry and exit**

In `needFrom`, evaluate an existing sleep and natural onset without consulting Energy:

```ts
if (mem.sleeping) {
  if (sleepy <= WAKE_AT) mem.sleeping = null;
} else if (sleepy >= SLEEP_ONSET && !drinkFirst) {
  mem.sleeping = { collapsed: false };
}
if (mem.sleeping || mem.night) return "sleep";
```

At or below `SLEEP_AT`, set `player.collapsed` and return `spent` after the sleep
and storm checks. Clear it at `RESTED_AT`. Use the same flag in `tooExhausted`
and the Stamina recovery marker. Do not use `bodyNeed === "spent"` as the
collapse memory: ordinary evening tiredness uses that need too and is allowed to
remain ranked below selected work. This keeps work blocked through physical
recovery without making Stamina a sleep condition.

Narrow the Player field to:

```ts
sleeping: { collapsed: false } | null;
```

In save normalization, convert a legacy true value before narrowing:

```ts
if (p.sleeping?.collapsed === true) {
  p.sleeping = null;
  p.collapsed = true;
  p.bodyNeed = "spent";
}
```

In `runIntent`, replace the assignment of `{ collapsed: true }` with
`state.player.bodyNeed = "spent"` before setting the work aside. Update the
collapse fixtures in `bodyorder`, `orders`, and `walkorders` to use the sticky
`spent` need and `RESTED_AT`; their assertions must continue to prove that work
cannot oscillate on and off around the collapse line.

- [ ] **Step 4: Run focused model and fast UI tests and verify GREEN**

```bash
SURVIDLE_TEST_SUITE=slow npx vitest run tests/needs.test.ts tests/workday.test.ts tests/bodyorder.test.ts tests/orders.test.ts tests/walkorders.test.ts
npx vitest run tests/mood.test.ts
```

Expected: all selected tests pass and the Stamina bar no longer claims that sleep waits for Stamina 100.

- [ ] **Step 5: Commit the collapse separation**

```bash
git add 08-survidle/src/sim/body.ts 08-survidle/src/sim/intent.ts 08-survidle/src/sim/sleep.ts 08-survidle/src/sim/types.ts 08-survidle/src/sim/save.ts 08-survidle/src/ui/panels.ts 08-survidle/tests/needs.test.ts 08-survidle/tests/workday.test.ts 08-survidle/tests/bodyorder.test.ts 08-survidle/tests/orders.test.ts 08-survidle/tests/walkorders.test.ts 08-survidle/tests/mood.test.ts
git commit -m "fix(survidle): make exhaustion recover through rest"
```

### Task 4: Keep automatic sleep as one body-owned activity

**Files:**
- Modify: `src/sim/tasks.ts:999-1004,1429-1558`
- Modify: `src/sim/bodyorder.ts:173-193`
- Test: `tests/needs.test.ts:466-505`
- Test: `tests/bodyorder.test.ts`
- Test: `tests/quirks.test.ts:84-122`

**Interfaces:**
- Consumes: `minutesUntilWake`, `debtFallHalved`
- Preserves: the same `Task` object and care intent throughout one sleep
- Ends sleep: only `serveBodyRow` after `currentNeed` clears `player.sleeping`

- [ ] **Step 1: Write a failing continuity test**

Add a test to `tests/needs.test.ts` that starts automatic body sleep, captures `const task = state.task`, changes local weather from calm to storm, advances beyond the original `task.duration`, and asserts:

```ts
expect(state.task).toBe(task);
expect(state.task?.id).toBe("sleep");
expect(state.intent).toBe(intent);
expect(state.task!.duration).toBeGreaterThan(state.task!.progress);
```

Then end the storm, advance until `player.sleeping` is null, and assert the one task ended without observing a second task object.

- [ ] **Step 2: Run focused continuity tests and verify RED**

```bash
SURVIDLE_TEST_SUITE=slow npx vitest run tests/needs.test.ts tests/bodyorder.test.ts tests/quirks.test.ts
```

Expected: FAIL because generic task completion clears the sleep task at its original estimate.

- [ ] **Step 3: Make generic task stepping maintain rather than complete sleep**

In `stepTask`, before work pace, special-case sleep:

```ts
if (t.id === "sleep") {
  t.progress += dt;
  const remaining = minutesUntilWake(
    state.player.sleepDebt,
    cal.hour,
    debtFallHalved(state, world),
  );
  t.duration = Math.max(t.progress + remaining, t.progress + 1);
  return;
}
```

Import the two model helpers. Do not resolve task completion, increment order counts, clear `bodyNeed`, or create a replacement sleep from this path. Retain `serveBodyRow`'s existing `need !== "sleep"` set-aside as the sole end. Immediately before that set-aside, clear `state.intent` when it is a work intent whose task is `night`; this lets a loaded legacy night finish its current sleep without requesting another one.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run the command from Step 2. Expected: all selected tests pass, including the existing half-rate storm assertion.

- [ ] **Step 5: Commit continuous sleep**

```bash
git add 08-survidle/src/sim/tasks.ts 08-survidle/src/sim/bodyorder.ts 08-survidle/tests/needs.test.ts 08-survidle/tests/bodyorder.test.ts 08-survidle/tests/quirks.test.ts
git commit -m "fix(survidle): keep sleep as one continuous activity"
```

### Task 5: Remove explicit sleep actions and replace the trait prose

**Files:**
- Modify: `src/sim/tasks.ts:995-1004,1108-1140`
- Modify: `src/ui/dopanel.ts:24-55,210-230,388-410`
- Modify: `src/ui/purpose.ts:80-100`
- Modify: `src/sim/person.ts:227-234`
- Modify: `docs/README.md:195-207`
- Test: `tests/tasks.test.ts:336-344`
- Test: `tests/dopanel.test.ts:154-166`
- Test: `tests/person.test.ts`

**Interfaces:**
- Player-facing task list contains `rest` but not `sleep` or `night`
- Internal `check(..., "sleep")`, `beginTask(..., "sleep")`, and TaskId values remain for body care and legacy saves
- `quirkLine("sleepsLight")` returns direct mechanical copy

- [ ] **Step 1: Write failing exposure and copy tests**

Change the available-task coverage test to exclude the internal IDs and add explicit assertions:

```ts
expect(ids.has("rest")).toBe(true);
expect(ids.has("sleep")).toBe(false);
expect(ids.has("night")).toBe(false);
```

Update the Do-panel search test so `sleep` finds Rest and bedding/shelter rows but no Sleep or Camp for the night row. Add to `tests/person.test.ts`:

```ts
expect(quirkLine("sleepsLight")).toBe(
  "Light sleeper. Safe from wolves while asleep. Storms reduce sleep quality.",
);
```

- [ ] **Step 2: Run focused tests and verify RED**

```bash
SURVIDLE_TEST_SUITE=slow npx vitest run tests/tasks.test.ts
npx vitest run tests/dopanel.test.ts tests/person.test.ts
```

Expected: FAIL because Sleep is still returned, the Camp group still contains both internal actions, and the old metaphor remains.

- [ ] **Step 3: Remove only the player-facing routes**

Remove `out.push(check(..., "sleep"))` from `availableTasks`. Remove `night` and `sleep` from the Camp group and vocabulary row lists in `src/ui/dopanel.ts`, while retaining `rest` and sleep-related structures under the `sleep` concept. Keep the exhaustive `PURPOSES` mappings for `night` and `sleep` because internal task IDs still need complete typing; they are no longer reachable as Do-panel rows. Do not delete TaskId members or the `check` cases used by body care.

Replace the copy in `src/sim/person.ts` with the exact approved sentence.
Update the Body paragraph in `docs/README.md` to say that Stamina below 20
forces Rest, while the separate Sleepiness process determines falling asleep
and waking. Do not retain the claim that an idle spent survivor falls asleep.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run the commands from Step 2. Expected: all selected tests pass.

- [ ] **Step 5: Commit action and copy cleanup**

```bash
git add 08-survidle/src/sim/tasks.ts 08-survidle/src/ui/dopanel.ts 08-survidle/src/ui/purpose.ts 08-survidle/src/sim/person.ts 08-survidle/docs/README.md 08-survidle/tests/tasks.test.ts 08-survidle/tests/dopanel.test.ts 08-survidle/tests/person.test.ts
git commit -m "fix(survidle): make sleep automatic and explain its quirk"
```

### Task 6: Verify the integrated behavior

**Files:**
- Modify: none planned
- Test: relevant files already named above

**Interfaces:**
- Verifies the complete spec without expanding scope

- [ ] **Step 1: Run all focused sleep tests**

```bash
SURVIDLE_TEST_SUITE=slow npx vitest run tests/sleep.test.ts tests/needs.test.ts tests/workday.test.ts tests/bodyorder.test.ts tests/quirks.test.ts tests/tasks.test.ts
npx vitest run tests/mood.test.ts tests/dopanel.test.ts tests/person.test.ts
```

Expected: all selected tests pass.

- [ ] **Step 2: Run the fast suite**

```bash
npm test
```

Expected: all fast tests pass. Do not run `npm run test:slow`.

- [ ] **Step 3: Run typecheck and production build**

```bash
npm run build
```

Expected: TypeScript and Vite complete successfully.

- [ ] **Step 4: Run repository lint**

From the repository worktree root:

```bash
npm run lint
```

Expected: Biome reports no errors in changed files.

- [ ] **Step 5: Inspect the diff and worktree state**

```bash
git diff main...HEAD --check
git status --short
```

Expected: no whitespace errors and no uncommitted changes.

- [ ] **Step 6: Playtest the required sequence**

Run `npm run dev`, open the prototype's configured `/prototypes/08/` URL, and use a light sleeper. Work Stamina below 20 before natural sleep onset, observe Rest rather than Sleep, then let Sleepiness cross onset. During the one sleep, introduce or wait for a storm and confirm the wake forecast moves without a new timer. Confirm the Do panel offers Rest but not Sleep or Camp for the night. Stop the server afterward.

It is wrong if Stamina starts sleep, sleep restarts, the forecast uses Stamina, the storm creates a second sleep task, or either explicit sleep action remains.

- [ ] **Step 7: Commit any verification-only corrections**

If Steps 1-6 required a correction, stage only the affected `08-survidle` paths and commit it with a narrowly descriptive message. If no correction was required, do not create an empty commit.
