# Survidle Winter Loop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the runner a winter working day (one sleep per night, away work by day, chores by firelight with the light kept for the outdoors), let it take a spare tool up from camp, make mending a workable standing order, and make the reference list keep stone, tools and logs and sew the hide set; then re-measure the year probe and write the readings into the roadmap.

**Architecture:** Five runner rules in the modules that own them: the night's sleep marker on the `Player` (`types.ts`, `save.ts`), set where a sleep completes (`tasks.ts`) and read by the body tier (`body.ts`) and the wait intent (`intent.ts`); the night skips in the order scheduler (`orders.ts`) as one function with three reasons; the tool take-up in the legality check (`tasks.ts`) and the kit provisioning (`body.ts`); the mend threshold in `tasks.ts`. Then the reference list (`reference.ts`) in two commits: stocks and tools, then clothing. Every task ends with `npm test` green; the last task runs the probes and edits the roadmap and the spec.

**Tech Stack:** TypeScript, Vite, vitest, vite-node for scripts. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-09-06-survidle-winter-loop-design.md`

## Global Constraints

- The list is the harness's, the runner is the game's (spec, "Decisions confirmed with the author"): Tasks 1 to 5 change what every player's orders do; Tasks 6 and 7 change only the reference list.
- No water row, vessel, source or melt fallback is touched; `thirstyStep` is not touched (spec 7 and 8). The parallel water work owns `keep("fill", 2)`, `keep("fill", 20)`, `wantOpen`'s fill clauses and `workStep`'s fill branches.
- No magic numbers: every constant is argued from the real north or derived from another in the comment beside it. `MEND_AT` is derived from the patch's gain; the log keep's 150 is the winter stock's own number.
- No em dashes or non-typable characters in any output or comment (repo CLAUDE.md). Comments explain, never chronicle: no dates or before/after in code comments.
- `npm test` stays fast; the year, reference and horizon scripts are on demand.
- Stage with explicit paths under `08-survidle/`; never `git add -A`. Commit messages end with the session's attribution trailer.
- Work from `08-survidle/` for every `npm` and `npx` command below.

---

## File structure

| file | responsibility |
|---|---|
| `src/sim/types.ts` | `Player.sleptTonight` |
| `src/sim/save.ts` | its default on an old save |
| `src/sim/tasks.ts` | a sleep that completes in the dark sets the marker; the tool lookup reads the camp pile when judged from camp; `MEND_GAIN`, `MEND_AT` and the mend rule |
| `src/sim/advance.ts` | dawn clears the marker |
| `src/sim/body.ts` | the spent clause reads the marker; `provisionKit` takes up the work's tool at camp |
| `src/sim/intent.ts` | the wait intent sleeps once a night, then rests |
| `src/sim/orders.ts` | `NIGHT_SKIP` and `nightSkip`, read by `chooseOrder` |
| `src/sim/reference.ts` | `WINTER_STOCK` moves here; stone, tools and logs as keeps; the clothing block; `winterStockWant`; the garment clause in `wantOpen` |
| `src/sim/year.ts` | imports `WINTER_STOCK` from `reference.ts` |
| `tests/needs.test.ts` | one sleep per night |
| `tests/orders.test.ts` | the night skips |
| `tests/intent.test.ts` | the spare tool at camp |
| `tests/tasks.test.ts` | the mend rule |
| `tests/reference.test.ts`, `tests/horizon.test.ts` | the list |
| the roadmap, the spec, `docs/superpowers/specs/2026-09-06-survidle-winter-loop-design.md` | readings and bookkeeping |

The calendar's clock, used by every test below: minute 0 of a run is 08:00 on the start day; `newGame(seed, startDoy)` opens on that day of year; 334 is 1 December, when sunrise is about 10:18 and sunset about 15:42 (5.4 hours of light), so minute 500 is 16:20 and dark, and minute 200 is 11:20 and light. 172 is 21 June, with 19 hours of light.

---

### Task 1: One sleep per night

**Files:**
- Modify: `src/sim/types.ts` (the `Player` interface, after `restUntil`)
- Modify: `src/sim/save.ts` (the player defaults, after `p.workHours ??=`)
- Modify: `src/sim/tasks.ts` (`complete`, the `case "sleep":` at the end of the switch)
- Modify: `src/sim/advance.ts` (`step`, after `const cal = ...`)
- Modify: `src/sim/body.ts` (`currentNeed`, the `sleep` clause)
- Modify: `src/sim/intent.ts` (`workStep`, the wait step)
- Test: `tests/needs.test.ts`

**Interfaces:**
- Produces: `Player.sleptTonight?: boolean`. Set by `complete("sleep")` when `cal.isNight`; cleared every minute the calendar reads day. Read by `currentNeed` and by the wait step.

- [ ] **Step 1: Write the failing tests**

Extend the existing imports of `tests/needs.test.ts`: `minutesUntilDawn` beside `calendar` from `../src/sim/calendar`; `SLEEP_CAP_MINUTES` and `startTask` beside `check` from `../src/sim/tasks`; and a new line `import { WINTER_WOOD_FROM_DOY } from "../src/sim/reference";` (1 September: the night is long enough for the cap and mild enough to sleep out through; December's cold would end the test another way).

Append to the file:

```ts
describe("one sleep per night", () => {
  /** 20:00 on 1 September at camp, a felling intent live: minute 0 is 08:00 and sunset is 19:56, so the cap of nine hours ends well before the 06:04 dawn. */
  function septemberEvening() {
    const g = newGame(17, WINTER_WOOD_FROM_DOY);
    const { state, world } = g;
    const st = regionState(state, world, state.player.region);
    placeAt(state, world, st.campCell);
    state.minute = 720;
    const night = calendar(state.minute, state.startDoy);
    expect(night.isNight).toBe(true);
    startIntent(state, world, night, new Rng(1), { task: "chop", until: { kind: "forever" }, deliver: "leave", where: "nearest" });
    return { g, state, world, night };
  }

  it("a spent body is laid down at nightfall; with the night's sleep had it rests until dawn instead", () => {
    const { state, world, night } = septemberEvening();
    const p = state.player;
    p.energy = 80;
    p.restUntil = state.minute + minutesUntilDawn(state.minute, state.startDoy);
    expect(currentNeed(state, world, night, state.intent!)).toBe("sleep");
    p.sleptTonight = true;
    expect(currentNeed(state, world, night, state.intent!)).toBe("spent");
  });

  it("a body worked under 60 in the dark sleeps again, marker or not: that is a collapse, not a second night", () => {
    const { state, world, night } = septemberEvening();
    state.player.energy = 50;
    state.player.sleptTonight = true;
    expect(currentNeed(state, world, night, state.intent!)).toBe("sleep");
  });

  it("a sleep that ends in the dark sets the marker, and dawn clears it", () => {
    const { state, world, night } = septemberEvening();
    state.intent = null;
    state.task = null;
    expect(startTask(state, world, night, "sleep")).toBe(true);
    expect(state.task!.duration).toBe(SLEEP_CAP_MINUTES);
    advance(state, world, SLEEP_CAP_MINUTES);
    expect(state.task).toBeNull();
    expect(state.player.sleptTonight).toBe(true);
    expect(calendar(state.minute, state.startDoy).isNight).toBe(true);
    advance(state, world, minutesUntilDawn(state.minute, state.startDoy) + 1);
    expect(state.player.sleptTonight).toBe(false);
  });

  it("a wait intent by night sleeps once and then rests", () => {
    const { state, world, night } = septemberEvening();
    state.intent = null;
    state.task = null;
    const wait = { task: "wait" as const, until: { kind: "forever" as const }, deliver: "leave" as const, where: "nearest" as const };
    startIntent(state, world, night, new Rng(1), wait);
    expect(state.task?.id).toBe("sleep");
    state.intent = null;
    state.task = null;
    state.player.sleptTonight = true;
    startIntent(state, world, night, new Rng(1), wait);
    expect(state.task?.id).toBe("rest");
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/needs.test.ts -t "one sleep per night"`
Expected: FAIL. The first test gets `sleep` twice; the third finds `sleptTonight` undefined; the fourth gets `sleep` twice.

- [ ] **Step 3: Add the marker to the player**

In `src/sim/types.ts`, after `restUntil?: number;`:

```ts
  /** Set when a sleep has run its cap while it is still dark; cleared at dawn. One sleep per night, then rest or chores by the fire until first light. */
  sleptTonight?: boolean;
```

In `src/sim/save.ts`, after `p.workHours ??= WORK_HOURS_DEFAULT;`:

```ts
  p.sleptTonight ??= false;
```

- [ ] **Step 4: Set it where a sleep completes, clear it at dawn**

In `src/sim/tasks.ts`, in `complete`, the end of the switch currently reads:

```ts
    case "haul":
    case "night":
    case "wait":
    case "travel":
    case "walk":
    case "rest":
    case "sleep":
      return;
```

Replace with:

```ts
    case "sleep":
      // A sleep runs to dawn or to the cap, whichever comes first, so one that
      // ends while it is still dark ran the cap: the night's sleep is had, and
      // the night clauses in currentNeed and the wait intent read the marker
      // rather than laying the body down again until dawn.
      if (cal.isNight) state.player.sleptTonight = true;
      return;
    case "haul":
    case "night":
    case "wait":
    case "travel":
    case "walk":
    case "rest":
      return;
```

In `src/sim/advance.ts`, in `step`, after `const cal = calendar(state.minute, state.startDoy);`:

```ts
  // Dawn ends the night's sleep marker whether or not anyone is running orders.
  if (!cal.isNight) state.player.sleptTonight = false;
```

- [ ] **Step 5: Read it in the body tier and the wait step**

In `src/sim/body.ts`, `currentNeed`, the sleep clause currently reads:

```ts
  const sleep = (it.need === "sleep" && (cal.isNight || p.energy < NIGHT_SLEEP_UNDER))
    || p.energy <= SLEEP_AT
    || (cal.isNight && (p.energy < NIGHT_SLEEP_UNDER || (spent && !thirsty)))
    || (it.task === "night" && it.done < 1);
```

Replace the third line, and extend the comment above the clause with the last two sentences:

```ts
    || (cal.isNight && (p.energy < NIGHT_SLEEP_UNDER || (spent && !thirsty && !p.sleptTonight)))
```

```ts
  // A spent body that has already slept its cap tonight is not laid down
  // again: it rests by the fire, or works by it, until dawn. The energy clause
  // stands, since a body worked under 60 in the dark is collapsing, not
  // starting a second night.
```

In `src/sim/intent.ts`, `workStep`, the wait step currently reads:

```ts
  const step: Step = it.task === "wait"
    ? cal.isNight
      ? { id: "sleep", step: "sleeping at camp" }
      : { id: "rest", step: "waiting at camp" }
    : { id: it.task, arg: it.arg, step: workGerund(state, world, it) };
```

Replace with:

```ts
  const step: Step = it.task === "wait"
    ? cal.isNight && !state.player.sleptTonight
      ? { id: "sleep", step: "sleeping at camp" }
      : { id: "rest", step: "waiting at camp" }
    : { id: it.task, arg: it.arg, step: workGerund(state, world, it) };
```

and change the comment above it from "by night it sleeps outright" to "by night it sleeps once, then rests".

- [ ] **Step 6: Run the tests**

Run: `npx vitest run tests/needs.test.ts`
Expected: PASS, the four new tests and every existing one.

Run: `npm test`
Expected: PASS. If a test in `tests/intent.test.ts` or `tests/orders.test.ts` pinned a wait intent sleeping through a whole night, read it and adjust its expectation to one cap and a rest; do not weaken the new rule.

- [ ] **Step 7: Commit**

```bash
git add 08-survidle/src/sim/types.ts 08-survidle/src/sim/save.ts 08-survidle/src/sim/tasks.ts 08-survidle/src/sim/advance.ts 08-survidle/src/sim/body.ts 08-survidle/src/sim/intent.ts 08-survidle/tests/needs.test.ts
git commit -m "feat(survidle): one sleep per night - a spent body that has slept its cap rests or works by the fire until dawn instead of sleeping the dark away"
```

---

### Task 2: Away work waits for first light

**Files:**
- Modify: `src/sim/orders.ts` (new `NIGHT_SKIP`, `nightSkip`; `chooseOrder` after `resolveCell`)
- Modify: `docs/superpowers/specs/2026-09-06-survidle-winter-loop-design.md` (section 1.2, one sentence)
- Test: `tests/orders.test.ts`

**Interfaces:**
- Produces: `export const NIGHT_SKIP = { away, noFire, budget }` (three strings) and `export function nightSkip(state, world, cal, cell): string | null`. Task 3 fills in the `noFire` and `budget` branches; this task writes the function with the `away` branch only and returns `null` otherwise.

- [ ] **Step 1: Write the failing test**

Extend the existing imports of `tests/orders.test.ts`: `placeAt` beside `placeAtSpot` from `../src/sim/position`, `NIGHT_SKIP` in the `../src/sim/orders` import, and a new line `import { WINTER_START_DOY } from "../src/sim/year";`. The weather is seeded: if seed 17 happens to have a storm at 16:20 on 1 December the chop row reads "too rough" instead, and the test should use another reference seed (19, 42 or 79) rather than a weaker expectation.

Append:

```ts
describe("the night", () => {
  it("an order for the forest is skipped at night with 'dark; at first light' and chosen at dawn", () => {
    const { state, world } = newGame(17, WINTER_START_DOY);
    const st = regionState(state, world, state.player.region);
    placeAt(state, world, st.campCell);
    addOrder(state, world, { task: "chop", until: { kind: "forever" }, deliver: "camp", where: "nearest" }, "grind");
    state.minute = 500;
    const night = calendar(state.minute, state.startDoy);
    expect(night.isNight).toBe(true);
    expect(chooseOrder(state, world, night)).toBeNull();
    expect(ordersHere(state, world)[0].skipped).toBe(NIGHT_SKIP.away);
    state.minute = 200;
    const day = calendar(state.minute, state.startDoy);
    expect(day.isNight).toBe(false);
    expect(chooseOrder(state, world, day)?.req.task).toBe("chop");
    expect(ordersHere(state, world)[0].skipped).toBe("");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/orders.test.ts -t "the night"`
Expected: FAIL: `NIGHT_SKIP` is not exported, and `chooseOrder` returns the chop order at night.

- [ ] **Step 3: Write the skip**

In `src/sim/orders.ts`, add to the imports `import { today } from "./ledger";` (Task 3 uses it; add it now so the file compiles once). Above `chooseOrder`, add:

```ts
/** The reasons the clock gives for skipping an order; the Do panel shows them on the row like any other. */
export const NIGHT_SKIP = {
  away: "dark; at first light",
  noFire: "dark; no fire to work by",
  budget: "the day's work waits for the light",
} as const;

/**
 * Whether the night keeps an order from running now, and why. Nobody sets
 * out for the forest, the shore or the hunt in the dark, so work away from
 * camp waits for first light; the body tier's own walks (thirst, home) are
 * reflexes rather than orders and are not judged here, and a task already
 * under way finishes, since this runs only when the task slot is free. By day
 * nothing here applies.
 */
export function nightSkip(state: GameState, world: World, cal: Calendar, cell: number): string | null {
  if (!cal.isNight) return null;
  const st = regionState(state, world, state.player.region);
  if (cell !== st.campCell) return NIGHT_SKIP.away;
  return null;
}
```

In `chooseOrder`, after `const { cell } = resolveCell(state, world, cal, o.req.task, o.req.arg, o.req.where);` and before the walk check:

```ts
    const night = nightSkip(state, world, cal, cell);
    if (night) {
      markSkipped(state, world, cal, o, night);
      continue;
    }
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run tests/orders.test.ts`
Expected: PASS.

Run: `npm test`
Expected: PASS. A test elsewhere that ran orders through a night and counted work done in the dark reads the new rule; adjust its numbers, not the rule.

- [ ] **Step 5: Bring the spec's sentence in line**

In the spec, section 1.2, the last sentence reads "The live intent is not interrupted by nightfall either: an order that started by day finishes its walk home under winter's home-before-dark rule as today, and in the other seasons its work is ended by the working day, by sleep or by the load being full, never by the clock." Replace it with:

"A task already under way finishes, since the scheduler runs only when the task slot is free; the order is then not chosen again until first light, and a runner with a load owed to camp delivers it first, as today. In winter the home-before-dark rule still brings the runner in before sunset."

- [ ] **Step 6: Commit**

```bash
git add 08-survidle/src/sim/orders.ts 08-survidle/tests/orders.test.ts 08-survidle/docs/superpowers/specs/2026-09-06-survidle-winter-loop-design.md
git commit -m "feat(survidle): away work waits for first light - the scheduler skips an order for another cell at night with the reason on its row"
```

---

### Task 3: Camp chores by firelight, the light kept for the outdoors

**Files:**
- Modify: `src/sim/orders.ts` (`nightSkip`)
- Test: `tests/orders.test.ts`

**Interfaces:**
- Consumes: `NIGHT_SKIP`, `nightSkip` from Task 2; `today(state).workMin` from `ledger.ts`; `cal.daylightHours`; `state.player.workHours`; `st.fire.lit`; `state.player.torch.lit`.

- [ ] **Step 1: Write the failing tests**

Add a new line to the imports of `tests/orders.test.ts`: `import { today } from "../src/sim/ledger";`. Inside `describe("the night", ...)`, append:

```ts
  /** 16:20 on 1 December at camp with four logs, a split keep on the list and the fire lit. */
  function decemberChores() {
    const { state, world } = newGame(17, WINTER_START_DOY);
    const st = regionState(state, world, state.player.region);
    placeAt(state, world, st.campCell);
    addItem(pile(state, st.campCell), "log", 4);
    addOrder(state, world, { task: "split", until: { kind: "campHas", qty: 60 }, deliver: "camp", where: "nearest" }, "keep");
    state.minute = 500;
    const night = calendar(state.minute, state.startDoy);
    st.fire.lit = true;
    return { state, world, st, night };
  }

  it("a split keep runs by firelight, by the camp fire or a torch, and is skipped with both out", () => {
    const { state, world, st, night } = decemberChores();
    expect(chooseOrder(state, world, night)?.req.task).toBe("split");
    st.fire.lit = false;
    expect(chooseOrder(state, world, night)).toBeNull();
    expect(ordersHere(state, world)[0].skipped).toBe(NIGHT_SKIP.noFire);
    state.player.torch.lit = true;
    expect(chooseOrder(state, world, night)?.req.task).toBe("split");
  });

  it("night chores stop once today's work reaches the working day less the day's light", () => {
    const { state, world, night } = decemberChores();
    // 1 December has 5.4 hours of light: 4.6 hours of the ten may be done in the dark.
    const budget = (state.player.workHours - night.daylightHours) * 60;
    expect(budget).toBeGreaterThan(4 * 60);
    expect(budget).toBeLessThan(5 * 60);
    today(state).workMin = budget - 1;
    expect(chooseOrder(state, world, night)?.req.task).toBe("split");
    today(state).workMin = budget;
    expect(chooseOrder(state, world, night)).toBeNull();
    expect(ordersHere(state, world)[0].skipped).toBe(NIGHT_SKIP.budget);
  });

  it("by day the budget does not apply, and in June no chores run at night at all", () => {
    const { state, world, night } = decemberChores();
    today(state).workMin = (state.player.workHours - night.daylightHours) * 60;
    state.minute = 200;
    const day = calendar(state.minute, state.startDoy);
    expect(day.isNight).toBe(false);
    expect(chooseOrder(state, world, day)?.req.task).toBe("split");
    // 21 June: 19 hours of light, so the budget is negative and the first minute of dark is already over it.
    const june = newGame(17, 172);
    const jst = regionState(june.state, june.world, june.state.player.region);
    placeAt(june.state, june.world, jst.campCell);
    addItem(pile(june.state, jst.campCell), "log", 4);
    addOrder(june.state, june.world, { task: "split", until: { kind: "campHas", qty: 60 }, deliver: "camp", where: "nearest" }, "keep");
    jst.fire.lit = true;
    june.state.minute = 15 * 60;
    const juneNight = calendar(june.state.minute, june.state.startDoy);
    expect(juneNight.isNight).toBe(true);
    expect(chooseOrder(june.state, june.world, juneNight)).toBeNull();
    expect(ordersHere(june.state, june.world)[0].skipped).toBe(NIGHT_SKIP.budget);
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/orders.test.ts -t "the night"`
Expected: the first test FAILS at `st.fire.lit = false` (the keep is still chosen); the second and third FAIL at the budget expectations.

- [ ] **Step 3: Fill in the two camp branches**

In `src/sim/orders.ts`, replace `nightSkip` with:

```ts
/**
 * Whether the night keeps an order from running now, and why. Nobody sets
 * out for the forest, the shore or the hunt in the dark, so work away from
 * camp waits for first light; the body tier's own walks (thirst, home) are
 * reflexes rather than orders and are not judged here, and a task already
 * under way finishes, since this runs only when the task slot is free. Camp
 * work runs by firelight, the camp fire or a torch in hand, and only while
 * today's work is under the working day less the day's light, so the light
 * hours stay free for the work that needs them: in December that is about
 * four and a half hours of splitting, crafting and cooking in the dark and
 * five and a half of light for the forest; in June the budget is negative
 * and no chores run at night. By day nothing here applies: if nothing away
 * is able to run, the chores run in the light as they always did.
 */
export function nightSkip(state: GameState, world: World, cal: Calendar, cell: number): string | null {
  if (!cal.isNight) return null;
  const st = regionState(state, world, state.player.region);
  if (cell !== st.campCell) return NIGHT_SKIP.away;
  if (!st.fire.lit && !state.player.torch.lit) return NIGHT_SKIP.noFire;
  const budgetMin = (state.player.workHours - cal.daylightHours) * 60;
  if (today(state).workMin >= budgetMin) return NIGHT_SKIP.budget;
  return null;
}
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run tests/orders.test.ts`
Expected: PASS.

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add 08-survidle/src/sim/orders.ts 08-survidle/tests/orders.test.ts
git commit -m "feat(survidle): camp chores by firelight - at night a camp order runs by the fire or a torch and stops once the working day less the light is used, so the light stays for the forest"
```

---

### Task 4: The spare tool at camp is taken up

**Files:**
- Modify: `src/sim/tasks.ts` (`checkFresh`, the `invs` line and the twelve `toolNear(p, ..., invs)` calls)
- Modify: `src/sim/body.ts` (`provisionKit`)
- Test: `tests/intent.test.ts`

**Interfaces:**
- Consumes: `toolFor(id, arg)` and `toolNear(p, id, invs)` in `tasks.ts`/`inventory.ts`; `takeUp(state, world, id)` in `inventory.ts`; `TOOLS` in `items.ts`.
- Note: `wearTool` is not changed. A held tool that breaks at camp is replaced by the next camp task's `beginTask`, which already takes a tool up from the pile under foot; the spec's sentence about a break at camp is met by that existing rule.

- [ ] **Step 1: Write the failing tests**

Extend the `../src/sim/inventory` import of `tests/intent.test.ts` with `hasTool`. Append:

```ts
describe("a spare tool at camp", () => {
  it("felling judged from camp with the only axe in the camp pile is able to run, and starting it takes the axe up", () => {
    const { state, world } = newGame(17);
    const st = regionState(state, world, state.player.region);
    placeAt(state, world, st.campCell);
    state.player.tools = state.player.tools.filter((t) => t.id !== "axe");
    addItem(pile(state, st.campCell), "axe", 1);
    expect(hasTool(state.player, "axe")).toBe(false);
    expect(intentOption(state, world, cal, "chop", undefined, "nearest").ok).toBe(true);
    const req: IntentRequest = { task: "chop", until: { kind: "forever" }, deliver: "camp", where: "nearest" };
    expect(startIntent(state, world, cal, new Rng(1), req)).toBe(true);
    expect(hasTool(state.player, "axe")).toBe(true);
    expect(qty(pile(state, st.campCell), "axe")).toBe(0);
  });

  it("judged from the forest with the axe at camp it is not: the tool is only in reach from camp, where setting out takes it up", () => {
    const { state, world } = newGame(17);
    const st = regionState(state, world, state.player.region);
    state.player.tools = state.player.tools.filter((t) => t.id !== "axe");
    addItem(pile(state, st.campCell), "axe", 1);
    placeAtSpot(state, world, state.player.region, "forest");
    expect(check(state, world, cal, "chop").why).toBe("needs an axe");
  });
});
```

The precedent for "the camp pile counts from camp" is `kitInReach` in `tasks.ts`, which already counts a snare or a basket in the camp pile when the survivor stands at camp; the tool rule follows it.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/intent.test.ts -t "a spare tool at camp"`
Expected: the first test FAILS at `intentOption(...).ok` (false: "needs an axe").

- [ ] **Step 3: Let the judging read the camp pile for tools**

In `src/sim/tasks.ts`, `checkFresh`, the line

```ts
  const invs = [p.pack, pile(state, at)];
```

becomes

```ts
  const invs = [p.pack, pile(state, at)];
  // Judged from camp for work elsewhere, a tool in the camp pile is in reach
  // too: setting out takes it up (provisionKit), so a spare made while the
  // first was still held is not left at home while the shore reads "needs a
  // fishing spear". Materials are not: they are fetched by the delivery rules
  // and never carried out to the work.
  const here = cellOf(state, world);
  const toolInvs = at !== here && here === st.campCell ? [...invs, pile(state, here)] : invs;
```

`st` and `camp` are already defined above that line; `here` may already exist under another name in the function, in which case reuse it. Then change every `toolNear(p, <tool>, invs)` in `checkFresh` to `toolNear(p, <tool>, toolInvs)`. There are twelve: the axe in `chop`, `split`, `iceHole` and the fill's ice clause; the bow in the two hunt branches; the spear in the two fish branches; `rec.tool` in `craft`; the needle in `repair`; the fire drill in `light` and `lightIndoors`. Leave every `totalQty(invs, ...)` and `canConsume(invs, ...)` as it is.

- [ ] **Step 4: Take the tool up on the way out**

In `src/sim/body.ts`, add `takeUp` and `TOOLS` to the imports (`takeUp` from `./inventory`, `TOOLS` from `./items`) and `toolFor` to the import from `./tasks`. In `provisionKit`, after the `if (!it || cellOf(state, world) !== it.campCell) return 0;` line:

```ts
  // The tool the work swings, when none is in hand and the camp pile holds
  // one: taken up here on the way out. A tool in hand is never put down, so
  // this is not undone when the start fails; the kit below is. Vessels are
  // left to the fill task's own rule.
  const need = it.task === "fill" ? null : toolFor(it.task, it.arg);
  if (need && !hasTool(state.player, need) && takeUp(state, world, need)) log(state, `You take up the ${TOOLS[need].name}.`);
```

- [ ] **Step 5: Run the tests**

Run: `npx vitest run tests/intent.test.ts`
Expected: PASS.

Run: `npm test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add 08-survidle/src/sim/tasks.ts 08-survidle/src/sim/body.ts 08-survidle/tests/intent.test.ts
git commit -m "feat(survidle): a spare tool at camp is in reach from camp and taken up on the way out, so a spare spear no longer lies at home while the shore reads needs a fishing spear"
```

---

### Task 5: Mend clothing when it is worth a patch

**Files:**
- Modify: `src/sim/tasks.ts` (`MEND_GAIN`, `MEND_AT`; the `repair` check and completion)
- Test: `tests/tasks.test.ts`

**Interfaces:**
- Produces: `export const MEND_GAIN = 40`, `export const MEND_AT = 100 - MEND_GAIN`; the skip reason `"nothing worn enough to mend"`.

- [ ] **Step 1: Write the failing test**

Extend the `../src/sim/tasks` import of `tests/tasks.test.ts` with `MEND_AT` (`addItem` and `cal` are already there). Append:

```ts
describe("mend clothing", () => {
  it("waits until the most worn piece is at or under MEND_AT, so a patch never buys less than its hide", () => {
    const { state, world } = newGame(8);
    state.player.tools.push({ id: "needle", durability: 100 });
    addItem(state.player.pack, "hide", 1);
    for (const g of state.player.clothing) g.durability = MEND_AT + 1;
    const greyed = check(state, world, cal, "repair");
    expect(greyed.ok).toBe(false);
    expect(greyed.why).toBe("nothing worn enough to mend");
    state.player.clothing[0].durability = MEND_AT;
    expect(check(state, world, cal, "repair").ok).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/tasks.test.ts -t "mend clothing"`
Expected: FAIL: `MEND_AT` is not exported.

- [ ] **Step 3: Write the rule**

In `src/sim/tasks.ts`, near `SLEEP_CAP_MINUTES`:

```ts
/** A patch gives this much to the most worn piece. */
export const MEND_GAIN = 40;
/** Mend when the most worn piece is at or under this: a patch of half a kilo of hide never buys less than its full gain. */
export const MEND_AT = 100 - MEND_GAIN;
```

In `checkFresh`, `case "repair"`, replace the detail and the last guard:

```ts
      const o = opt({ group: "camp", label: "Mend clothing", detail: `0.5 kg hide; +${MEND_GAIN} wear on the most worn piece`, duration: 30 });
      ...
      if (!p.clothing.some((g) => g.durability <= MEND_AT)) return { ...o, ok: false, why: "nothing worn enough to mend" };
```

In `complete`, `case "repair"`:

```ts
      worst.durability = Math.min(100, worst.durability + MEND_GAIN);
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run tests/tasks.test.ts tests/record.test.ts tests/skills.test.ts tests/ui.test.ts`
Expected: PASS. The two existing mend tests set durability to 50, under the threshold. If a UI test pinned the detail string "+40 wear", it still reads the same text.

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add 08-survidle/src/sim/tasks.ts 08-survidle/tests/tasks.test.ts
git commit -m "feat(survidle): mend clothing is legal when the most worn piece is at or under 60, so a patch is never wasted and a mend can stand as an order"
```

---

### Task 6: The list keeps stone, tools and logs

**Files:**
- Modify: `src/sim/reference.ts` (`REFERENCE_ORDERS`, the comment above it, `wantOpen`, new `WINTER_STOCK` and `winterStockWant`)
- Modify: `src/sim/year.ts` (`WINTER_STOCK` imported from `./reference`)
- Test: `tests/reference.test.ts`, `tests/horizon.test.ts`

**Interfaces:**
- Produces: `export const WINTER_STOCK = { driedMeatKg: 80, firewoodKg: 400, logs: 150 }` in `reference.ts`; `export function winterStockWant(w): boolean`.
- Consumes: `keep(task, qty, arg?)` and `job(task, until, arg?)`, the list's own helpers.

- [ ] **Step 1: Write the failing tests**

In `tests/reference.test.ts`:

The test "the knife, fire drill, fishing spear and bow are made once; the axe keep stays, for the spare" becomes:

```ts
  it("the knife, fire drill, fishing spear, bow and axe are keeps of one spare; the basket trap stays a once job, since it is set and not held", () => {
    for (const id of ["knife", "fireDrill", "fishingSpear", "bow", "axe"] as const) {
      const o = REFERENCE_ORDERS.find((o) => o.req.task === "craft" && o.req.arg === id)!;
      expect(o.kind, id).toBe("keep");
      expect(o.req.until, id).toEqual({ kind: "campHas", qty: 1 });
    }
    const trap = REFERENCE_ORDERS.find((o) => o.req.task === "craft" && o.req.arg === "basketTrap")!;
    expect(trap.kind).toBe("job");
    expect(trap.req.until.kind).toBe("once");
  });
```

In "a competent day two ...", `at("craft:knife:job:once")` becomes `at("craft:knife:keep:campHas")` in both places it appears.

In "the trap follows the spear ...", the last three expectations become:

```ts
    expect(tasks.slice(axe + 8, axe + 11)).toEqual(["hunt:elk", "hunt:reindeer", "hunt:deer"]);
    expect(tasks[axe + 11]).toBe("chop:");
    expect(REFERENCE_ORDERS[REFERENCE_ORDERS.length - 1].kind).toBe("keep");
    expect(REFERENCE_ORDERS.length).toBe(39);
```

In "at level 1 the first tick gives every open want ...", the comment and the two `- 4` become `- 5`, with the comment: "The three named hunts gate on the species' recommended level; the 400 kg woodpile keep and the 150-log keep gate by season and a 1 April start is closed for both."

In `describe("wants by level", ...)`, append:

```ts
  it("stone is a keep of eight: three for arrows, three for an axe, two for a knife, and a once job ran out on every year seed", () => {
    const stone = REFERENCE_ORDERS.find((w) => w.req.task === "stone")!;
    expect(stone.kind).toBe("keep");
    expect(stone.req.until).toEqual({ kind: "campHas", qty: 8 });
  });

  it("the list ends with a 150-log keep in place of the felling grind, opened with the woodpile from 1 September", () => {
    const last = REFERENCE_ORDERS[REFERENCE_ORDERS.length - 1];
    expect(last.req.task).toBe("chop");
    expect(last.kind).toBe("keep");
    expect(last.req.until).toEqual({ kind: "campHas", qty: WINTER_STOCK.logs });
    expect(REFERENCE_ORDERS.some((w) => w.req.task === "chop" && w.kind === "grind")).toBe(false);
    const { state } = newGame(17);
    expect(wantOpen(state, last, calendar(0, 90))).toBe(false);
    expect(wantOpen(state, last, calendar(0, 244))).toBe(true);
    expect(wantOpen(state, last, calendar(0, 20))).toBe(true);
    // The summer's 4-log keep is not a winter-stock want and stays open in April.
    const summer = REFERENCE_ORDERS.find((w) => w.req.task === "chop" && w.req.until.kind === "campHas" && w.req.until.qty === 4)!;
    expect(wantOpen(state, summer, calendar(0, 90))).toBe(true);
  });
```

and extend the `../src/sim/reference` import with `WINTER_STOCK`.

In `tests/horizon.test.ts`, "the manual stage ...": `REFERENCE_ORDERS.length - 4` becomes `- 5`, with the comment gaining "and the 150-log keep".

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/reference.test.ts tests/horizon.test.ts`
Expected: FAIL on the tool kinds, the stone kind, the last line's kind, and `WINTER_STOCK` not exported from `reference.ts`.

- [ ] **Step 3: Move the winter stock and write the wants**

In `src/sim/reference.ts`, after `WINTER_WOOD_TO_DOY`:

```ts
/** The winter stock (year loop spec 1.3): a hut winter is about 3 tonnes of firewood, of which 400 kg split and 150 logs to split, with 80 kg of dried meat. The stocked December camp starts with it; the list's winter keeps stock it. */
export const WINTER_STOCK = { driedMeatKg: 80, firewoodKg: 400, logs: 150 };

/** The winter-stock keeps, the 400 kg split keep and the 150-log keep, told from the list's summer keeps by their targets. */
export function winterStockWant(w: { req: IntentRequest; kind: OrderKind }): boolean {
  if (w.kind !== "keep" || w.req.until.kind !== "campHas") return false;
  return (w.req.task === "split" && w.req.until.qty >= WINTER_STOCK.firewoodKg) || (w.req.task === "chop" && w.req.until.qty >= WINTER_STOCK.logs);
}
```

In `src/sim/year.ts`, delete the `WINTER_STOCK` definition and its comment, and add `WINTER_STOCK` to the import from `./reference`. `scripts/year.ts` reads it through `YearReport.stocked` and needs no change.

In `wantOpen`, the clause

```ts
  if (w.req.task === "split" && w.req.until.kind === "campHas" && w.req.until.qty >= 400) {
    return cal.dayOfYear >= WINTER_WOOD_FROM_DOY || cal.dayOfYear < WINTER_WOOD_TO_DOY;
  }
```

becomes

```ts
  if (winterStockWant(w)) return cal.dayOfYear >= WINTER_WOOD_FROM_DOY || cal.dayOfYear < WINTER_WOOD_TO_DOY;
```

and its doc comment's "the 400 kg woodpile keep waits for the season it is stocked against" becomes "the winter-stock keeps, 400 kg of firewood and 150 logs, wait for the season they are stocked against".

In `REFERENCE_ORDERS`:

- `job("stone", { kind: "campHas", qty: 8 }),` becomes `keep("stone", 8),`
- `job("craft", { kind: "once" }, "knife"),` becomes `keep("craft", 1, "knife"),`
- `job("craft", { kind: "once" }, "fireDrill"),` becomes `keep("craft", 1, "fireDrill"),`
- `job("craft", { kind: "once" }, "fishingSpear"),` becomes `keep("craft", 1, "fishingSpear"),`
- `job("craft", { kind: "once" }, "bow"),` becomes `keep("craft", 1, "bow"),`
- `keep("split", 400),` becomes `keep("split", WINTER_STOCK.firewoodKg),`
- the last line, `{ req: { task: "chop", until: { kind: "forever" }, deliver: "camp", where: "nearest" }, kind: "grind" },` becomes `keep("chop", WINTER_STOCK.logs),`

`WINTER_STOCK` is read inside the `REFERENCE_ORDERS` array literal at module load, so it must be declared above the list in the file or the module throws on import. The `WINTER_WOOD_*` constants sit below the list today: move them, `WINTER_STOCK` and `winterStockWant` together to just above `REFERENCE_ORDERS`, after the `keep` and `job` helpers.

In the comment above the list, replace the sentence "Tools the survivor holds are once jobs, since the first one made is taken up and a keep would craft a second; the axe stays a keep because the arrival axe wears out and the spare is the point." with:

"Every tool is a keep of one at camp: the first one made is taken up, a keep then crafts a second, and the second is the point, since the arrival tools wear out and a survivor at the shore with a spear in the camp pile takes it up on the way out. The basket trap is the one craft that is not, since it is set and not held. Stone is a keep of eight for the same reason: arrows take three per five and a stone axe three, and a once job that ran out left every year seed with no arrows, no axe and a felling grind for company."

Replace "The felling grind, needing the axe kept well above it, runs last and forever." with:

"The list ends with a 150-log keep, the winter stock's unsplit half, under the woodpile's season clause: a felling grind at the end of the list burned 400 kcal an hour for nothing when everything above it was blocked, and a runner with nothing left to do rests instead."

- [ ] **Step 4: Run the tests**

Run: `npx vitest run tests/reference.test.ts tests/horizon.test.ts tests/year.test.ts`
Expected: PASS. If there is no `tests/year.test.ts`, run `npx tsc --noEmit` instead to catch the moved constant.

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add 08-survidle/src/sim/reference.ts 08-survidle/src/sim/year.ts 08-survidle/tests/reference.test.ts 08-survidle/tests/horizon.test.ts
git commit -m "feat(survidle): the reference list keeps eight stone, one spare of every tool and 150 logs for winter in place of the felling grind, since the once jobs ran out on every year seed"
```

---

### Task 7: The list sews the hide set and mends

**Files:**
- Modify: `src/sim/reference.ts` (`REFERENCE_ORDERS`, the comment above it, `wantOpen`)
- Test: `tests/reference.test.ts`, `tests/horizon.test.ts`

**Interfaces:**
- Consumes: `RECIPES`, `RecipeId` from `./items`; `RECOMMENDED`, `skillLevel` from `./skills` (already imported); `hasTool` from `./inventory` for the test.

- [ ] **Step 1: Write the failing tests**

In `tests/reference.test.ts`, extend the `../src/sim/inventory` import with `hasTool` and add `import { SKILL_IDS } from "../src/sim/skills";`. In "the trap follows the spear ...", the line `expect(tasks[hunt + 1]).toBe("craft:axe");` becomes:

```ts
    expect(tasks.slice(hunt + 1, hunt + 8)).toEqual(["craft:needle", "repair:", "craft:hideCoat", "craft:hideTrousers", "craft:hideBoots", "craft:furHat", "craft:furMittens"]);
    expect(tasks[hunt + 8]).toBe("craft:axe");
```

and `expect(REFERENCE_ORDERS.length).toBe(39);` becomes `toBe(46)`.

In "at level 1 the first tick ...", `- 5` becomes `- 8` in both places, with the comment gaining "and the hide coat, trousers and boots wait for Crafting 8". The same in `tests/horizon.test.ts`.

In `describe("wants by level", ...)`, append:

```ts
  it("the hide coat, trousers and boots wait for Crafting 8; the needle, the fur hat, the mittens and the bow do not", () => {
    const { state } = newGame(17);
    const cal = calendar(0);
    const want = (arg: string) => REFERENCE_ORDERS.find((w) => w.req.task === "craft" && w.req.arg === arg)!;
    for (const arg of ["hideCoat", "hideTrousers", "hideBoots"]) expect(wantOpen(state, want(arg), cal), arg).toBe(false);
    for (const arg of ["needle", "furHat", "furMittens", "bow"]) expect(wantOpen(state, want(arg), cal), arg).toBe(true);
    setSkillLevel(state, "crafting", 8);
    for (const arg of ["hideCoat", "hideTrousers", "hideBoots"]) expect(wantOpen(state, want(arg), cal), arg).toBe(true);
  });

  it("the clothing block is a needle, a mend grind and five garments as once jobs, right after the small-game hunt keep", () => {
    const block = REFERENCE_ORDERS.map((o) => `${o.req.task}:${o.req.arg ?? ""}:${o.kind}:${o.req.until.kind}`);
    const hunt = block.indexOf("hunt:any:keep:campHas");
    expect(block.slice(hunt + 1, hunt + 8)).toEqual([
      "craft:needle:job:once", "repair::grind:forever",
      "craft:hideCoat:job:once", "craft:hideTrousers:job:once", "craft:hideBoots:job:once", "craft:furHat:job:once", "craft:furMittens:job:once",
    ]);
  });

  it("a kitted level-20 list makes one spare spear and stops", () => {
    const ref = setUpReference(17, true);
    for (const s of SKILL_IDS) setSkillLevel(ref.state, s, 20);
    stepReference(ref, 20 * 1440);
    const st = regionState(ref.state, ref.world, ref.state.player.region);
    expect(hasTool(ref.state.player, "fishingSpear")).toBe(true);
    expect(qty(pile(ref.state, st.campCell), "fishingSpear")).toBeLessThanOrEqual(1);
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/reference.test.ts tests/horizon.test.ts`
Expected: FAIL on the block and the length.

- [ ] **Step 3: Write the wants and the garment clause**

In `src/sim/reference.ts`, add `RECIPES` and `type RecipeId` to the import from `./items`. In `REFERENCE_ORDERS`, after `keep("hunt", 2, "any"),` and before `keep("craft", 1, "axe"),`:

```ts
  job("craft", { kind: "once" }, "needle"),
  { req: { task: "repair", until: { kind: "forever" }, deliver: "leave", where: "nearest" }, kind: "grind" },
  job("craft", { kind: "once" }, "hideCoat"),
  job("craft", { kind: "once" }, "hideTrousers"),
  job("craft", { kind: "once" }, "hideBoots"),
  job("craft", { kind: "once" }, "furHat"),
  job("craft", { kind: "once" }, "furMittens"),
```

In `wantOpen`, after the named-hunt clause:

```ts
  // A garment waits for its recommended level, the way a named hunt does: a
  // level-1 survivor with an elk's hide does not spoil six kilos of it on a
  // coat. Tools and kit are not gated here; the ladder's stand-ins carry them.
  if (w.req.task === "craft" && w.req.arg && RECIPES[w.req.arg as RecipeId]?.out.clothing) {
    const rec = RECOMMENDED[`craft:${w.req.arg}`];
    if (rec && skillLevel(state, rec.skill) < rec.level) return false;
  }
```

and extend the function's doc comment with "and a garment waits for its recommended Crafting level".

In the comment above the list, after the paragraph on the hut group, add:

"Right after the small-game hunt keep, which is the want that brings hide to camp, sits the clothing block: the bone needle, a mend grind, and the hide coat, trousers and boots, the fur hat and the fur mittens as once jobs, since a made garment is put on and the old one left behind. The mend grind runs only while a piece is worn enough for a patch (MEND_AT) and hide is at camp, so it does not starve the hut group below it; without it every garment on every year seed was a ghost at durability 0 by autumn, with 168 kg of hide lying at camp on one of them. The hide set opens at Crafting 8 (wantOpen), the hat and mittens at once."

- [ ] **Step 4: Run the tests**

Run: `npx vitest run tests/reference.test.ts tests/horizon.test.ts`
Expected: PASS. If the spare-spear test's 20 days are not enough for the kitted list to reach the spear keep on seed 17, read the list order and the camp pile at the end rather than lengthening the run past 30 days; the keep sits sixteenth and needs one stick, one stone and one cordage.

Run: `npm test`
Expected: PASS, and the whole suite still inside its budget (the new run test is about two seconds).

- [ ] **Step 5: Commit**

```bash
git add 08-survidle/src/sim/reference.ts 08-survidle/tests/reference.test.ts 08-survidle/tests/horizon.test.ts
git commit -m "feat(survidle): the reference list sews the hide set at Crafting 8 and mends by a grind, with a needle first, since every garment on every year seed was a ghost by autumn"
```

---

### Task 8: Re-measure, the hearth trigger, and the roadmap

**Files:**
- Modify: `docs/superpowers/specs/2026-09-03-survidle-realism-roadmap.md` (the build order paragraph on the winter loop; a "Measured with the winter loop" paragraph in the F section after "Measured with the year loop"; the tables-audit flags; the UI pass notes)
- Modify: `docs/superpowers/specs/2026-09-06-survidle-winter-loop-design.md` (section 0 gains "measured after" numbers; section 3's trigger is read)
- Possibly: `src/sim/items.ts`, `src/sim/skills.ts`, `src/sim/camp.ts`, `src/sim/reference.ts` (the hearth, only if the trigger trips)

- [ ] **Step 1: Run the probes and keep the output**

From `08-survidle/`, each into a file under the session's scratch directory (not the repo):

```bash
npm run reference 2>&1 | tee /tmp/wl-reference.txt
npm run reference -- --heir 2>&1 | tee /tmp/wl-heir.txt
npm run year 2>&1 | tee /tmp/wl-year20.txt
npm run year -- --level=10 2>&1 | tee /tmp/wl-year10.txt
npm run year -- --fresh 2>&1 | tee /tmp/wl-fresh.txt
npm run year -- --winter 2>&1 | tee /tmp/wl-winter.txt
npm run horizon 2>&1 | tee /tmp/wl-horizon.txt
```

Expected: the April gate reads 4 of 4 at day 26. Every other gate is a reading, not a pass criterion. Note per seed: death day and cause, the last week's sleep and work hours, and the month lines' food and wood.

- [ ] **Step 2: Read section 3's trigger**

For each `--winter` and level-20 seed that died: did it die of cold or fuel inside a standing turf hut with an axe in hand and logs at camp? Read the death line and the last month line. If yes for any seed, the trigger has tripped: add the hearth entry exactly as the spec's section 3 writes it (`hearth` in `STRUCTURES` with 12 stone and 240 minutes, `"build:hearth": { skill: "building", level: 5 }` in `RECOMMENDED`, legal only where a turf hut or cabin stands, the `camp.ts` comment "a hearth has no build entry of its own" removed, and `job("build", { kind: "once" }, "hearth")` after the turf hut want in the list) with a test in `tests/hut.test.ts` pinning cost, level and the shelter requirement, then re-run the two probes. If no, write "not tripped" with the reason into the spec's section 3 and move on.

- [ ] **Step 3: Write the readings**

In the spec's section 0, add a "measured after" line under each reading with the number the same probe reads now, and a closing paragraph "Where it lands" in the year loop spec's style: the four gates, the horizon rows, and the death each seed now dies of.

In the roadmap:

- The build order paragraph beginning "then the winter loop, four runner and list rules and one question" is replaced by a paragraph that names what was built (the six rules of the spec, in a clause each) and what was found: stone and the spare spear as the causes the month lines hid, the sleep clause, the dropped hunts-above-woodpile rule with its reading ("hunting stopped for want of arrows, and September's hours went to sleep and walking, not wood; a grind above a keep starves the keep"), and "built, readings under F".
- In the F section, after the "Measured with the year loop" paragraphs, a "Measured with the winter loop (`2026-09-06-survidle-winter-loop-design.md`)" paragraph: the before numbers from the spec's section 0 in one sentence each, then what each rule moved, then "Where it lands" with the gates.
- In the tables-audit paragraph (the one beginning "Three of the four gates are red"), three flags with the spec's section 0.2 numbers: the ice hole skinning over at every day roll; 249 cm of snow on 3 January against 40 to 60 real; the 1.3 water-loss factor above 20 C felt applying 10 to 22 hours a day inside a lit hut.
- Beside them, one sentence for the water spec's re-measure: the 25 to 55 minute walk, the one 2-litre bucket per trip and the 20-litre keep that never fills, as the before numbers the landing camp is measured against.
- In the UI pass section's notes: "a working-day dial, for the tester round to ask for; `workHours` on the player is the field".

- [ ] **Step 4: The browser pass**

Run `npm run dev` from `08-survidle/` and open `http://127.0.0.1:5173/prototypes/08/` in Chrome at 1440 by 900. On seed 17, advance to a December evening with a forest order and a split keep on the list: the forest row shows "dark; at first light" and the split keep runs with the fire lit, and shows "dark; no fire to work by" with it out. Set the coat's durability to 80 in the console, the Mend row is greyed "nothing worn enough to mend"; at 60 it is legal. Put a spear in the camp pile with none in hand and start a fish keep: the log reads "You take up the fishing spear." Write what was seen into the spec's section 5 in one paragraph, and stop the dev server.

- [ ] **Step 5: Run the gate**

Run: `npm test && npm run build`
Expected: both PASS.

- [ ] **Step 6: Commit and push**

```bash
git add 08-survidle/docs/superpowers/specs/2026-09-03-survidle-realism-roadmap.md 08-survidle/docs/superpowers/specs/2026-09-06-survidle-winter-loop-design.md
git commit -m "docs(survidle): the winter loop measured - the readings per seed, the gates, the hearth trigger read, and three flags for the tables audit"
git push
```

If the hearth was built, its files go in a commit of their own before this one.

---

## Self-review

- **Spec coverage.** 1.1 is Task 1; 1.2 is Task 2; 1.3 is Task 3; 1.4 is Task 4 (the break-at-camp clause is met by `beginTask`'s existing take-up, noted there); 1.5 is Task 5; 2.1 to 2.3 are Task 6; 2.4 is Task 7; 2.5 is the horizon count in Tasks 6 and 7 and the horizon run in Task 8; section 3 is Task 8 step 2; section 4's tests are spread over Tasks 1 to 7; section 5 and 6 are Task 8; section 7's line is kept by never touching the fill rows, `wantOpen`'s fill clauses or `workStep`'s fill branches.
- **Names.** `sleptTonight`, `NIGHT_SKIP`, `nightSkip`, `MEND_GAIN`, `MEND_AT`, `WINTER_STOCK`, `winterStockWant` are used with the same spelling in every task that names them.
- **Counts.** The list is 39 after Task 6 and 46 after Task 7; the wants closed at level 1 on 1 April are 5 after Task 6 (three hunts, two winter-stock keeps) and 8 after Task 7 (plus three garments).
