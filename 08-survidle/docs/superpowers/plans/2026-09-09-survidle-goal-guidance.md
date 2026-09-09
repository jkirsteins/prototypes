# Survidle Goal Guidance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace title-only goals with staged, concise guidance and live progress, while consolidating map hover information into the existing bottom-left tooltip.

**Architecture:** The simulation keeps a deed-driven ladder and persistent introduction state. A new UI projection builds progress views from deeds plus live world prerequisites, and both the pinned rows and modals consume that projection. Map inspection has one pointer surface, with animal identity and activity added to the existing cell tooltip; keyboard cell labels remain on the grid cells for assistive technology without a second visible panel.

**Tech Stack:** TypeScript, Vite, Vitest with happy-dom, CSS, Chrome DevTools Protocol, Git.

**Spec:** `docs/superpowers/specs/2026-09-09-survidle-goal-guidance-design.md`

## Global Constraints

- Use ASCII characters only in new output and source text.
- Keep UI copy short and non-repetitive; use position, progress, checks, and game data before prose.
- Early guidance may name an exact existing UI path; later guidance offers one experiment and does not reveal complete recipes.
- Goals never queue work, select a recipe, filter the Do panel, or choose an answer.
- Preserve unrelated working-tree changes and stage explicit `08-survidle` paths only.
- Run every behavior change through a failing test before implementation.
- Browser verification must cover 1440 by 900 and 390 wide with touch emulation.

---

### Task 1: Consolidate map inspection into one visible tooltip

**Files:**
- Modify: `src/ui/map.ts`
- Modify: `src/ui/tip.ts`
- Modify: `src/main.ts`
- Modify: `src/style.css`
- Modify: `tests/map-inspection.test.ts`
- Modify: `tests/tip.test.ts`

**Interfaces:**
- Consumes: `visibleWildlife(state, world, cal)` and `wildlifeMembers(subject)` from `src/sim/wildlife-agents.ts`.
- Produces: `tipHtml(...)` with a compact animal line for visible subjects whose `active.cell` is the hovered cell.
- Removes: `mountMapInspection(...)`, `.map-inspect`, and the visible map instruction output.

- [ ] **Step 1: Write failing map and tooltip tests**

Replace the old map inspection listener test with an assertion against real map markup:

```ts
it("has no second visible map inspection readout", () => {
  const { state, world } = newGame(21);
  const html = mapHtml(world, state, newUiState(), calendar(state.minute, state.startDoy));
  expect(html).not.toContain("map-inspect");
  expect(html).not.toContain("Map: point at");
});
```

Add a real wildlife subject at a known cell in `tests/tip.test.ts`, mark it visible through the real sight model, and assert:

```ts
const html = tipHtml(state, world, cal, subject.active!.cell);
expect(html).toContain("deer");
expect(html).toContain("7");
expect(html).toContain("wander");
```

Also assert a subject outside `visibleWildlife(...)` does not leak through fog.

- [ ] **Step 2: Run the focused tests and verify RED**

Run:

```bash
npm test -- --run tests/map-inspection.test.ts tests/tip.test.ts
```

Expected: failure because map markup still contains `.map-inspect` and `tipHtml` omits animals.

- [ ] **Step 3: Remove the redundant readout**

Delete `mountMapInspection`, remove its import and boot call from `src/main.ts`, remove the `<output class="map-inspect">` from `mapHtml`, and delete the `.map-inspect` CSS block. Keep `data-map-info`, gridcell roles, focusability, and arrow-key handling only if it can operate without a visible duplicate; otherwise remove the now-ownerless keyboard listener and retain native focus names through `aria-label` on each grid cell.

- [ ] **Step 4: Add visible animals to the existing tooltip**

In `src/ui/tip.ts`, add:

```ts
function animalLines(state: GameState, world: World, cal: Calendar, cell: number): string[] {
  return visibleWildlife(state, world, cal)
    .filter((subject) => subject.active?.cell === cell)
    .map((subject) => {
      const known = state.wildlife.recognized[subject.id] && subject.name;
      const identity = known ? subject.name! : subject.species === "wolf" ? "wolf pack" : subject.species;
      const count = wildlifeMembers(subject);
      return `${identity}${count > 1 ? `, ${count}` : ""}, ${subject.active?.intent ?? "moving"}`;
    });
}
```

Append escaped animal lines after physical marks and before loose supplies. Extend `tipKey` with the matching subjects' ids, cells, member counts, recognized names, and intents so a still pointer updates when wildlife moves.

- [ ] **Step 5: Run focused tests and verify GREEN**

Run:

```bash
npm test -- --run tests/map-inspection.test.ts tests/tip.test.ts tests/animal-agents.test.ts
```

Expected: all pass.

- [ ] **Step 6: Commit the map consolidation**

```bash
git add 08-survidle/src/ui/map.ts 08-survidle/src/ui/tip.ts 08-survidle/src/main.ts 08-survidle/src/style.css 08-survidle/tests/map-inspection.test.ts 08-survidle/tests/tip.test.ts
git commit -m "fix(survidle): use one map hover surface"
```

### Task 2: Add the revised staged ladder and persistent introductions

**Files:**
- Modify: `src/sim/types.ts`
- Modify: `src/sim/goals.ts`
- Modify: `src/sim/newgame.ts`
- Modify: `src/sim/save.ts`
- Modify: `tests/goals.test.ts`

**Interfaces:**
- Produces: `GoalPhase`, revised `GoalId`, the expanded `Deed` union, `GoalDef.phase`, `GoalState.introduced`, `unintroducedGoals(state, cal)`, and `introduceGoals(state, ids)`.
- Preserves: `activeGoals`, `goalDef`, `goalDeed`, seasonal tail selection, existing completion and progress from saves.

- [ ] **Step 1: Write failing ladder and migration tests**

Add table-driven expectations for the ordered ids from the approved spec, then assert the opening widths:

```ts
expect(activeGoals(state, cal)).toEqual(["site"]);
state.goals.done.site = true;
expect(activeGoals(state, cal)).toEqual(["drink"]);
for (const id of ["drink", "firewood", "fire"] as const) state.goals.done[id] = true;
expect(activeGoals(state, cal)).toEqual(["bed", "roof"]);
```

Assert a fresh world has `introduced: {}`, old serialized saves gain the field without losing `done` or `progress`, completed legacy ids do not become active, and:

```ts
expect(unintroducedGoals(state, cal)).toEqual(["site"]);
introduceGoals(state, ["site"]);
expect(unintroducedGoals(state, cal)).toEqual([]);
```

- [ ] **Step 2: Run the focused tests and verify RED**

```bash
npm test -- --run tests/goals.test.ts
```

Expected: type or assertion failures for the missing ids and introduction field.

- [ ] **Step 3: Extend the goal types**

Define:

```ts
export type GoalPhase = "firstWeek" | "firstMonth" | "firstSeason" | "longTerm";

export type GoalId =
  | "site" | "drink" | "firewood" | "fire" | "bed" | "roof" | "cook" | "keptNight" | "firstOrder"
  | "water" | "keptDays" | "foodSource" | "store" | "fat" | "longOrder" | "toolCare"
  | "explore" | "secondCamp" | "seasonalFood" | "durableRoof" | "winterStores"
  | "spring" | "summer" | "autumn" | "winter";
```

Add `introduced: Partial<Record<GoalId, true>>` to `GoalState` and initialize it in `newGoals`.

Add the new discriminated deed members listed in Task 3 now, so every revised
goal definition has a typed credit predicate. Task 3 connects real simulation
seams to this vocabulary.

- [ ] **Step 4: Replace `GOALS` with the approved ladder**

Add `phase: GoalPhase` to `GoalDef`. Use the exact order and titles from the spec. Keep credit predicates small and based on the deeds Task 3 introduces. Set the first width change to `bed` and the second to `water`, leaving the seasonal tail collapsed to one slot.

Add:

```ts
export function unintroducedGoals(state: GameState, cal: Calendar): GoalId[] {
  return activeGoals(state, cal).filter((id) => !state.goals.introduced[id]);
}

export function introduceGoals(state: GameState, ids: GoalId[]): void {
  for (const id of ids) state.goals.introduced[id] = true;
}
```

- [ ] **Step 5: Migrate old saves safely**

In `fillDefaults`, add `state.goals.introduced ??= {}` after the existing goal fallback. Do not infer introductions from `done`, and do not remove unknown keys from deserialized records.

- [ ] **Step 6: Run focused tests and verify GREEN**

```bash
npm test -- --run tests/goals.test.ts tests/goals-fire.test.ts
```

Expected: all pass after updating assertions that intentionally describe the old ladder. The real-seam coverage for new deeds belongs to Task 3.

- [ ] **Step 7: Commit the staged ladder**

```bash
git add 08-survidle/src/sim/types.ts 08-survidle/src/sim/goals.ts 08-survidle/src/sim/newgame.ts 08-survidle/src/sim/save.ts 08-survidle/tests/goals.test.ts 08-survidle/tests/goals-deeds.test.ts 08-survidle/tests/goals-fire.test.ts
git commit -m "feat(survidle): stage the goal journey"
```

### Task 3: Emit deeds for new goal destinations

**Files:**
- Modify: `src/sim/goals.ts`
- Modify: `src/sim/actions.ts`
- Modify: `src/sim/water.ts`
- Modify: `src/sim/ladder.ts`
- Modify: `src/sim/tasks.ts`
- Modify: `src/sim/spine.ts`
- Modify: `tests/goals-deeds.test.ts`
- Modify: `tests/goals.test.ts`

**Interfaces:**
- Produces new deeds: `drank`, `ordered`, `foodSourced`, `ateFat`, `explored`, `campedAgain`, `seasonalFood`, and `winterStocked`.
- Consumes existing task completion, order creation, eating, drinking, threshold, and structure seams.

- [ ] **Step 1: Write a failing real-seam test for each new deed**

Use the existing integration helpers in `tests/goals-deeds.test.ts`. Each test must perform the real action and assert its one goal, for example:

```ts
drink(state, world);
expect(state.goals.done.drink).toBe(true);

giveOrder(state, world, fuelRequest, "job");
expect(state.goals.done.firstOrder).toBe(true);
```

Cover actual successful food yield, non-lean intake, a grind or keep order, exploration of another region, a later camp, seasonal gathering, tool care, and crossing both winter stock lines. Assert failed or no-op actions credit nothing.

- [ ] **Step 2: Run deed tests and verify RED**

```bash
npm test -- --run tests/goals-deeds.test.ts tests/goals.test.ts
```

Expected: failures for each missing event seam.

- [ ] **Step 3: Confirm the deed vocabulary from Task 2**

Use the discriminated union members already added with the revised ladder:

```ts
| { kind: "drank" }
| { kind: "ordered"; task: TaskId; order: OrderKind; until: UntilChoice }
| { kind: "foodSourced"; method: "hunt" | "fish" | "trap" }
| { kind: "ateFat" }
| { kind: "explored"; region: number }
| { kind: "campedAgain"; region: number }
| { kind: "seasonalFood"; item: ItemId }
| { kind: "winterStocked" };
```

`firstOrder` accepts a non-once fuel or water request. `longOrder` accepts a grind or keep, preventing the first job from completing both. Goals continue to credit deeds even before becoming active so players never have to repeat real accomplishments.

- [ ] **Step 4: Emit deeds at successful owner seams**

- Emit `drank` only when `drink(...)` returns true.
- Emit `ordered` from `giveOrder` after `addOrder` succeeds and normalization is known.
- Emit `foodSourced` only where a hunt, fish, or trap produces food.
- Emit `ateFat` only when `eat(...)` consumes a food whose lean share is below 1.
- Emit `explored` when an Explore task completes, carrying its target region.
- Emit `campedAgain` when `makeCamp` moves from an existing camp or enters a second region.
- Emit `seasonalFood` for berries, eggs, sap, roots, seaweed, or bark when actual gathering produces it.
- Emit `winterStocked` from the daily world step when both existing winter food and fuel thresholds are met for the first time.

Keep each emission beside the successful state mutation, never at click intent.

- [ ] **Step 5: Update deed coverage**

Extend the emitted-deed table in `tests/goals.test.ts` so every revised goal has a possible deed. Preserve the rule that unreachable goals fail the suite.

- [ ] **Step 6: Run focused and neighboring tests**

```bash
npm test -- --run tests/goals-deeds.test.ts tests/goals.test.ts tests/orders.test.ts tests/water.test.ts tests/hunger.test.ts tests/explore.test.ts tests/spine.test.ts
```

Expected: all pass.

- [ ] **Step 7: Commit deed integration**

```bash
git add 08-survidle/src/sim/goals.ts 08-survidle/src/sim/actions.ts 08-survidle/src/sim/water.ts 08-survidle/src/sim/ladder.ts 08-survidle/src/sim/tasks.ts 08-survidle/src/sim/spine.ts 08-survidle/tests/goals-deeds.test.ts 08-survidle/tests/goals.test.ts
git commit -m "feat(survidle): credit the guided goal ladder"
```

### Task 4: Build concise guidance and live progress projections

**Files:**
- Create: `src/ui/goalguide.ts`
- Create: `tests/goalguide.test.ts`

**Interfaces:**
- Consumes: `GameState`, `World`, `Calendar`, `GoalId`, region camp/site state, inventory quantities, fire state, structures, skill levels, and seasonal dates.
- Produces: `goalGuide(id): GoalGuide` and `goalProgress(state, world, cal, id): GoalProgressView` exactly as specified.

- [ ] **Step 1: Write failing guidance coverage and copy-shape tests**

Use a table over `GOALS`:

```ts
for (const goal of GOALS) {
  const guide = goalGuide(goal.id);
  expect(guide.reason.trim()).not.toBe("");
  expect(Boolean(guide.path) && Boolean(guide.prompt)).toBe(false);
  expect(goalProgress(state, world, cal, goal.id).target).toBeGreaterThan(0);
}
```

Assert first-week guides have `path`, first-season and long-term guides use `prompt`, and paths use actual panel/action labels. Test representative live views: site `0 / 1`, fire prerequisites, firewood kilograms, shelter materials, first-night deadline, water litres, and days to a season.

- [ ] **Step 2: Run tests and verify RED**

```bash
npm test -- --run tests/goalguide.test.ts
```

Expected: module-not-found failure.

- [ ] **Step 3: Implement the guidance table**

Define the approved interfaces and a `Record<GoalId, GoalGuide>`. Keep each reason to one sentence and each guide to either `path` or `prompt`. Use exact UI words such as `Camp > Make camp here`, `Gather > Drink`, and `Do > Explore` only where the player can find those labels.

- [ ] **Step 4: Implement progress projections**

Use small per-goal projector functions and return one normalized view. For completed goals, return `at === target`. For counted deed goals, read `state.goals.progress`. For live prerequisites, return steps whose `done` values come from current inventory, camp site, structures, fire, and orders. Use existing inventory and structure helpers instead of reproducing quantity logic.

Season progress uses literal calendar days to the next boundary. The first-night deadline appears only before the first dusk and does not become false urgency on later days.

- [ ] **Step 5: Run tests and verify GREEN**

```bash
npm test -- --run tests/goalguide.test.ts tests/goals.test.ts
```

Expected: all pass.

- [ ] **Step 6: Commit the guidance projection**

```bash
git add 08-survidle/src/ui/goalguide.ts 08-survidle/tests/goalguide.test.ts
git commit -m "feat(survidle): project concise goal guidance"
```

### Task 5: Render progress rows and goal modals

**Files:**
- Modify: `src/ui/goalpanel.ts`
- Modify: `src/ui/render.ts`
- Modify: `src/main.ts`
- Modify: `src/style.css`
- Modify: `tests/goalpanel.test.ts`
- Modify: `tests/layout.test.ts`

**Interfaces:**
- Consumes: `goalGuide`, `goalProgress`, `unintroducedGoals`, and `introduceGoals`.
- Produces: `goalsHtml(state, world, cal)`, `goalGuideHtml(state, world, cal, ids, done)`, and UI state describing automatic versus manual goal opening.

- [ ] **Step 1: Write failing pinned-row tests**

Assert real markup includes a semantic button, title, figure, fill, and next incomplete step without repeated section labels:

```ts
const html = goalsHtml(state, world, cal);
expect(html).toContain('data-act="goal-open"');
expect(html).toContain("0 / 1");
expect(html).not.toContain("Your goal");
expect(html).not.toContain("Details");
```

Add tests for multi-goal rows, escaped copy, accessible names, and dynamic `updateGoalBars` or its replacement updating progress without rebuilding unrelated panels.

- [ ] **Step 2: Write failing modal lifecycle tests**

Extend `UiState` with:

```ts
goalGuide: { ids: GoalId[]; done: GoalId[]; automatic: boolean } | null;
```

Test automatic opening after higher overlays clear, manual reopening through `goal-open`, marking automatic introductions on `goal-close`, leaving manual reopening state untouched, grouping parallel goals, and combining completion plus next guidance in one modal.

- [ ] **Step 3: Run goal panel tests and verify RED**

```bash
npm test -- --run tests/goalpanel.test.ts tests/layout.test.ts
```

Expected: failures for missing buttons, progress, state, and modal functions.

- [ ] **Step 4: Render pinned progress buttons**

Change `goalsHtml` to accept `world`. Render each active goal as one full-width `<button>` with `data-act="goal-open" data-id="..."`. The title and figure share the first line; a thin fill follows; one next step or compact step run follows. Remove the redundant `Your goal` heading from the section.

- [ ] **Step 5: Implement the single transition modal**

Replace `goalDoneHtml` with `goalGuideHtml`. It renders, in order: compact completed titles when present, new goal title/progress, steps, one reason, one path or prompt, and `Continue`. When several ids open, render compact summaries in one modal and rely on pinned rows for focused reopening.

- [ ] **Step 6: Wire opening, closing, and overlay priority**

- `goal-open` creates a manual `ui.goalGuide` for the clicked id.
- The frame opens queued completions plus currently unintroduced active goals only after welcome and skill moments.
- `goal-close` calls `introduceGoals` only for an automatic modal, drains only completion ids actually shown, clears UI state, and resets `lastReal`.
- Simulation pauses while any goal modal is open.
- Existing wildlife recognition remains below goal guidance.

- [ ] **Step 7: Style with the existing Survidle vocabulary**

Use square borders, existing panel/background/accent/good/dim tokens, no new font, no decorative cards, no motion. Add visible focus, a thin progress track, compact inline milestones, and 40 px touch targets under the existing coarse-pointer media query. Keep modal text left aligned and under the existing narrow teaching width.

- [ ] **Step 8: Run focused tests and verify GREEN**

```bash
npm test -- --run tests/goalpanel.test.ts tests/layout.test.ts tests/churn.test.ts
```

Expected: all pass, including redraw-budget tests.

- [ ] **Step 9: Commit the goal UI**

```bash
git add 08-survidle/src/ui/goalpanel.ts 08-survidle/src/ui/render.ts 08-survidle/src/main.ts 08-survidle/src/style.css 08-survidle/tests/goalpanel.test.ts 08-survidle/tests/layout.test.ts
git commit -m "feat(survidle): show guided goal progress"
```

### Task 6: Simplify the opening overlay cadence

**Files:**
- Modify: `src/main.ts`
- Modify: `src/sim/manual.ts`
- Modify: `src/ui/teachpanel.ts`
- Modify: `tests/manual.test.ts`
- Modify: `tests/teach.test.ts`
- Modify: `tests/goalpanel.test.ts`

**Interfaces:**
- Preserves: manual opening through `data-act="manual-open"` and the welcome's identity/skills content.
- Removes: automatic manual opening and first-days advice duplicated in `welcomeHtml`.

- [ ] **Step 1: Write failing cadence tests**

Assert landing no longer calls or depends on `openManualOnFirstLanding`, manual markup remains reachable through `manual-open`, welcome markup omits `MANUAL_SECTIONS[0]`, and the first automatic goal guide becomes eligible after welcome closes.

- [ ] **Step 2: Run tests and verify RED**

```bash
npm test -- --run tests/manual.test.ts tests/teach.test.ts tests/goalpanel.test.ts
```

Expected: failures because the manual still opens automatically and welcome repeats its advice.

- [ ] **Step 3: Remove automatic manual opening**

Delete `openManualOnFirstLanding` and its landing call. Keep `manualSeen` migration only if old saves still require the field; otherwise retain it as an ignored compatibility field rather than rewriting saves.

- [ ] **Step 4: Trim the welcome**

Remove the manual-section import and copied survival paragraph from `welcomeHtml`. Keep survivor identity, date, inherited skill/status, one rotating northern tip, and `Begin`.

- [ ] **Step 5: Run focused tests and verify GREEN**

```bash
npm test -- --run tests/manual.test.ts tests/teach.test.ts tests/goalpanel.test.ts tests/landing.test.ts
```

Expected: all pass.

- [ ] **Step 6: Commit the cadence cleanup**

```bash
git add 08-survidle/src/main.ts 08-survidle/src/sim/manual.ts 08-survidle/src/ui/teachpanel.ts 08-survidle/tests/manual.test.ts 08-survidle/tests/teach.test.ts 08-survidle/tests/goalpanel.test.ts
git commit -m "fix(survidle): give each opening message one job"
```

### Task 7: Add headless UX verification and complete the pass

**Files:**
- Create: `scripts/goal-ux.mjs`
- Create: `docs/goal-ux-shots/README.md`
- Create: `docs/goal-ux-shots/first-goal-desktop.png`
- Create: `docs/goal-ux-shots/night-goals-desktop.png`
- Create: `docs/goal-ux-shots/monthly-prompt-desktop.png`
- Create: `docs/goal-ux-shots/first-goal-mobile.png`
- Modify: `package.json`

**Interfaces:**
- Consumes: the existing CDP launch pattern from `scripts/map-shots.mjs` and `window.survidle` test handle.
- Produces: `npm run goal-ux`, deterministic DOM assertions, and four review screenshots.

- [ ] **Step 1: Write the headless verifier**

Add a script using the installed `/Applications/Google Chrome.app` fallback pattern. It must:

- Open the dev URL with a deterministic seed.
- Land a survivor and dismiss welcome.
- Assert the first goal modal opens and the manual did not.
- Assert no `.map-inspect` element exists.
- Place a visible wildlife subject at a hovered cell and assert `#maptip` contains its identity, count, and intent.
- Drive or inject documented goal deeds through the exposed state to capture the first goal, parallel night goals, and a first-month prompt.
- At 1440 by 900 and 390 wide, assert no horizontal overflow, modal containment, readable progress, and reachable close controls.
- Save the four named screenshots and exit nonzero on any failed assertion.

- [ ] **Step 2: Add the script command and run it against the dev server**

Add:

```json
"goal-ux": "node scripts/goal-ux.mjs"
```

Run:

```bash
npm run goal-ux
```

Expected: PASS lines for both widths and four PNG files.

- [ ] **Step 3: Inspect all screenshots**

Open each PNG at original resolution. Check that progress is the first visual fact after the title, copy does not repeat labels, the map has one hover tooltip, the animal line is legible, and the 390 px layout has no clipped controls. Adjust CSS or copy through a failing layout/markup test before any production change.

- [ ] **Step 4: Write the browser record**

In `docs/goal-ux-shots/README.md`, record the seed, both viewport sizes, the exact states captured, and any issue found and fixed. State what would still look wrong in a manual first-week playtest.

- [ ] **Step 5: Run full verification**

```bash
npm test
npm run build
npm run goal-ux
```

From the repository root:

```bash
node_modules/.bin/biome lint 08-survidle/src 08-survidle/tests 08-survidle/scripts/goal-ux.mjs
```

Expected: zero test failures, successful production build, passing headless checks, and no new lint errors in changed files. Existing repository warnings outside changed files are reported separately.

- [ ] **Step 6: Commit verification artifacts**

```bash
git add 08-survidle/package.json 08-survidle/scripts/goal-ux.mjs 08-survidle/docs/goal-ux-shots
git commit -m "test(survidle): verify the guided first week"
```

- [ ] **Step 7: Review the complete branch**

Review `git diff` from the plan commit, confirm every spec requirement maps to a test or browser assertion, and verify no unrelated file is staged or committed.
