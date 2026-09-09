# Survidle Goal Journey Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the linear, retroactive goal hints with an authored, announcement-gated, multi-step survival journey and explicit checklist UI.

**Architecture:** Goal definitions own their stages, checklist steps, deed matchers, and optional mechanics notes. `goalDeed` is the single credit gate and ignores unintroduced goals, while food acquisition emits method-specific deeds and eating closes only an eligible matching meal step. UI renderers consume normalized goal views and never infer progress from live inventory or structures.

**Tech Stack:** TypeScript, Vite, Vitest, jsdom, CSS, Chrome DevTools Protocol

**Spec:** `docs/superpowers/specs/2026-09-09-survidle-goal-journey-design.md`

## Global Constraints

- Use only ASCII text in code, documentation, and UI copy.
- A goal receives no credit before its automatic announcement is dismissed.
- No earlier deed is replayed when a goal becomes active.
- Goal steps are high-level outcomes, not recipes or UI paths.
- At most three goals are active, and only within the first unfinished authored stage.
- Meaning must be explicit in words; colour is only reinforcement.
- Preserve completed goals and introduced state when loading existing saves.

---

### Task 1: Announcement-gated stages and step state

**Files:**
- Modify: `src/sim/types.ts`
- Modify: `src/sim/goals.ts`
- Modify: `src/sim/save.ts`
- Test: `tests/goals.test.ts`

**Interfaces:**
- Produces: `GoalStepDef`, `GoalStepView`, `goalSteps(state, id)`, and the staged `activeGoals(state, cal)` behavior.
- Produces: `GoalState.stepProgress`, defaulting to `{}` during creation and migration.
- Consumes: existing `Deed`, `GoalId`, `GoalState`, and `introduceGoals` APIs.

- [ ] **Step 1: Write failing announcement and stage tests**

Add tests proving that a `drank` deed before `introduceGoals(state, ["drink"])` changes no goal state, that introduction does not replay it, that a later drink completes the goal, and that only the first unfinished stage is active. Add a save test asserting `stepProgress` defaults to `{}` without inferred credit.

- [ ] **Step 2: Run the focused tests and verify the expected failures**

Run: `npm test -- --run tests/goals.test.ts`

Expected: FAIL because unintroduced goals still receive credit, `stepProgress` does not exist, and active goals use width thresholds rather than authored stages.

- [ ] **Step 3: Add step state and authored stages**

Add this state shape:

```ts
export interface GoalState {
  done: Partial<Record<GoalId, true>>;
  progress: Partial<Record<GoalId, number>>;
  stepProgress: Partial<Record<GoalId, Record<string, number>>>;
  introduced: Partial<Record<GoalId, true>>;
  queue: GoalId[];
  lastSeason: Season;
}
```

Define stages as explicit `GoalId[][]`, with the seasonal tail handled by the existing next-season selection. Change `goalDeed` to skip goals for which `introduced[id]` is not true. Add step credit without reading inventory or structures, and only evaluate a final step after its prerequisites are met.

- [ ] **Step 4: Migrate saves without inferring progress**

Initialize `state.goals.stepProgress ??= {}` after legacy ladder migration. Preserve `done`, `introduced`, and valid queue ids exactly as before.

- [ ] **Step 5: Run focused tests**

Run: `npm test -- --run tests/goals.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add 08-survidle/src/sim/types.ts 08-survidle/src/sim/goals.ts 08-survidle/src/sim/save.ts 08-survidle/tests/goals.test.ts
git commit -m "feat(survidle): gate goals behind announcements"
```

### Task 2: Food acquisition journeys

**Files:**
- Modify: `src/sim/types.ts`
- Modify: `src/sim/goals.ts`
- Modify: `src/sim/actions.ts`
- Modify: `src/sim/tasks.ts`
- Test: `tests/goals-deeds.test.ts`
- Test: `tests/goals.test.ts`
- Test: `tests/goals-fire.test.ts`

**Interfaces:**
- Produces: goal ids `forageMeal`, `snareMeal`, `huntMeal`, `fishMeal`, and `trapMeal`.
- Produces: deeds `{ kind: "foodAcquired"; method: FoodMethod }`, `{ kind: "ate"; item: FoodId | "sap" }`, and `{ kind: "preserved" }`.
- Consumes: successful task completion seams in `tasks.ts` and positive consumption in `eat()`.

- [ ] **Step 1: Write failing method and final-step tests**

For each method, introduce the goal, emit or perform acquisition, assert the goal remains incomplete, then eat matching prepared food and assert completion. Assert that eating before acquisition does not count, hunted meat cannot complete a snare goal without a snare acquisition, one cooked-meat portion completes at most one specific method goal, and preservation requires `preserved` followed by eating `driedMeat`.

- [ ] **Step 2: Run focused tests and verify the expected failures**

Run: `npm test -- --run tests/goals.test.ts tests/goals-deeds.test.ts`

Expected: FAIL because the new ids and deeds do not exist and existing food goals complete at acquisition.

- [ ] **Step 3: Add food ids, stages, and step definitions**

Insert the five acquisition goals in the approved stages. Give equipment steps task matchers for crafting bow, arrows, fishing spear, snare, and basket trap; give placement and collection their existing task/build or new method deeds; make eating the final step.

- [ ] **Step 4: Emit food deeds at real effect seams**

Emit acquisition only when food is produced: successful forage, hunt, direct fish, snare collection, and basket-trap emptying. Emit `preserved` only when positive raw meat is placed on a rack. Emit `ate` only after `eat()` consumes a positive quantity. Include `sap` because tapping consumes it on the spot.

- [ ] **Step 5: Allocate ambiguous meals once**

When several introduced method goals could consume the same cooked food, credit only the earliest active specific goal whose acquisition prerequisites are complete. Allow the umbrella `foodSource` goal to receive the same meal as a specific method goal. This preserves the broad goal without letting one portion close hunting and snaring together.

- [ ] **Step 6: Update existing goal integration tests**

Introduce the goal under test before performing its deed. Do not globally introduce all goals where a test is specifically about ladder order or pre-announcement behavior.

- [ ] **Step 7: Run the goal suites**

Run: `npm test -- --run tests/goals.test.ts tests/goals-deeds.test.ts tests/goals-fire.test.ts`

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add 08-survidle/src/sim/types.ts 08-survidle/src/sim/goals.ts 08-survidle/src/sim/actions.ts 08-survidle/src/sim/tasks.ts 08-survidle/tests/goals.test.ts 08-survidle/tests/goals-deeds.test.ts 08-survidle/tests/goals-fire.test.ts
git commit -m "feat(survidle): add food acquisition goals"
```

### Task 3: High-level notes and explicit checklist UI

**Files:**
- Modify: `src/ui/goalguide.ts`
- Modify: `src/ui/goalpanel.ts`
- Modify: `src/main.ts`
- Modify: `src/style.css`
- Test: `tests/goalguide.test.ts`
- Test: `tests/goalpanel.test.ts`

**Interfaces:**
- Produces: `goalNote(id): string | null` and step views from `goalSteps`.
- Produces: `goalsHtml`, `goalGuideHtml`, `goalMomentToOpen`, and `goalIntroductionToOpen` with unchanged event contracts.
- Consumes: staged active goals and stored step progress from Tasks 1 and 2.

- [ ] **Step 1: Write failing markup and copy tests**

Assert that the pinned panel contains a `Goals` heading and `[ ]` rows but no `.bar`, fraction, `goal-next`, or route path. Assert that transitions contain exact `Goal completed: X` and `New goal available: Y` text under one `Goals` heading, use no per-goal `h1`, and render optional notes. Assert the water note contains `Below 1 litre`, `water at hand`, `Self-care`, and `activity queue`. Assert every guide contains at most one note and no `>` UI path.

- [ ] **Step 2: Run focused UI tests and verify the expected failures**

Run: `npm test -- --run tests/goalguide.test.ts tests/goalpanel.test.ts`

Expected: FAIL on current progress bars, implicit completion rows, large per-goal headings, reasons, paths, and prerequisite projections.

- [ ] **Step 3: Replace generic guidance with mechanics notes**

Reduce `goalguide.ts` to the approved optional note table. Keep `site` and season goals null. Test every goal id for ASCII and forbid UI-path syntax.

- [ ] **Step 4: Render the pinned checklist and modal**

Render active goal buttons as `[ ] Title`. Render one modal `h1` containing `Goals`, explicit completion and availability sentences, high-level stored step checklists, optional notes, and Continue. A manual open uses `Current goal: X`. Remove `updateGoalBars` and its frame call.

- [ ] **Step 5: Remove obsolete goal CSS**

Delete progress-bar, next-step, reason-callout, and oversized guide-header rules. Add only the spacing and completion colour needed by explicit checklist text.

- [ ] **Step 6: Run focused UI tests**

Run: `npm test -- --run tests/goalguide.test.ts tests/goalpanel.test.ts`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add 08-survidle/src/ui/goalguide.ts 08-survidle/src/ui/goalpanel.ts 08-survidle/src/main.ts 08-survidle/src/style.css 08-survidle/tests/goalguide.test.ts 08-survidle/tests/goalpanel.test.ts
git commit -m "fix(survidle): make goal status explicit"
```

### Task 4: Compact state-specific welcome

**Files:**
- Modify: `src/ui/teachpanel.ts`
- Modify: `src/style.css`
- Test: `tests/teach.test.ts`

**Interfaces:**
- Produces: `welcomeHtml(state, cal)` with the same action and parameters.
- Consumes: `tipFor`, `SKILL_IDS`, `SKILL_NAMES`, and `skillLevel`.

- [ ] **Step 1: Write a failing compact-welcome test**

Assert the welcome contains survivor name, date, `Starting skills`, all current skill levels, `Tip`, the deterministic tip, and Begin. Assert it omits both `welcomeLines(state).body` paragraphs and the `.example` callout class.

- [ ] **Step 2: Run the focused test and verify failure**

Run: `npm test -- --run tests/teach.test.ts`

Expected: FAIL because the current welcome still renders explanatory paragraphs and an unlabeled example callout.

- [ ] **Step 3: Simplify the welcome renderer**

Remove `welcomeLines` from `welcomeHtml`. Render labeled starting skills and tip blocks with compact CSS. Delete the now-unused simulation-side helper and its three prose-specific tests.

- [ ] **Step 4: Run the focused test**

Run: `npm test -- --run tests/teach.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add 08-survidle/src/ui/teachpanel.ts 08-survidle/src/sim/teach.ts 08-survidle/src/style.css 08-survidle/tests/teach.test.ts
git commit -m "fix(survidle): focus the landing welcome"
```

### Task 5: Full regression repair and headless Chrome verification

**Files:**
- Modify: `scripts/goal-ux.mjs`
- Modify: `tests/explore.test.ts`
- Modify: `tests/goals-deeds.test.ts`
- Modify: `tests/goals-fire.test.ts`
- Modify: `tests/goals.test.ts`
- Modify: `tests/siting.test.ts`
- Modify: `tests/slow/goals-year.test.ts`
- Create: `docs/goal-ux-shots/goal-transition-desktop.png`
- Create: `docs/goal-ux-shots/water-goal-desktop.png`
- Update: existing goal and welcome screenshots generated by the script.

**Interfaces:**
- Consumes: complete production behavior from Tasks 1 through 4.
- Produces: repeatable headless Chrome assertions and review screenshots.

- [ ] **Step 1: Run the fast test suite**

Run: `npm test`

Expected: tests that intentionally exercise goal credit introduce the named goal before performing its deed. Update only the six listed goal-aware suites where their setup still assumes pre-announcement credit, then rerun until all tests pass.

- [ ] **Step 2: Run lint and production build**

Run from the repository root: `npm run lint -- 08-survidle/src 08-survidle/tests 08-survidle/scripts`

Run from the prototype: `npm run build`

Expected: both exit 0.

- [ ] **Step 3: Update the headless goal journey script**

Drive a fresh seed through landing and welcome. Assert the welcome labels and absence of the removed paragraphs. Assert the first goal checklist has no bar. Inject announced completion and staged step state through `window.survidle.state` only where reaching the state through play would make the visual test slow. Capture explicit transition, water note, and multi-step food goal on desktop and mobile. Assert modal bounds and document width.

- [ ] **Step 4: Run headless Chrome against a production-like Vite server**

Start: `npm run dev -- --host 127.0.0.1`

Run: `npm run goal-ux`

Stop the server after the script exits.

Expected: the script reports every layout and wording assertion passed and writes the review screenshots.

- [ ] **Step 5: Run final verification**

Run: `npm test && npm run build`

Run from repository root: `npm run lint -- 08-survidle/src 08-survidle/tests 08-survidle/scripts`

Run: `git diff --check && git status --short`

Expected: tests, build, lint, and whitespace check pass; status contains only intended goal journey files and generated review screenshots.

- [ ] **Step 6: Commit**

```bash
git add 08-survidle/scripts/goal-ux.mjs 08-survidle/docs/goal-ux-shots 08-survidle/tests
git commit -m "test(survidle): verify the goal journey in Chrome"
```
