# One List, One Rule Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the three schedulers that decide a survivor's minute with one loop over one list, and put the body on that list as a row.

**Architecture:** `judgeOrders` walks the order list top down every minute and returns the first row that can run; that row runs, setting the live one aside if it differs. A row that cannot run is passed over unless the player pinned it. The body's eight needs stop being a hidden tier inside `runIntent` and become a single `kind: "body"` row that the player can rank but not remove.

**Tech Stack:** TypeScript, Vite, vitest. No new dependencies. All work in `08-survidle/`.

**Spec:** `docs/superpowers/specs/2026-09-08-survidle-one-list-scheduler-design.md` - read it before Task 1. Every task below argues from a numbered section of it.

**Branch:** `survidle/queue-rework`, in the worktree at `../prototypes-queue-rework`. Run everything from `08-survidle/`.

## Global Constraints

- **No em dashes, no non-ASCII.** The repo's source is pure ASCII and the global style rule forbids em dashes, fancy quotes, unicode arrows and ellipsis. Use `-`, `"`, `->`, `...`.
- **Comments explain, never chronicle.** No dates, no "previously", no before/after in code comments. Write what the code does and why, as if it had always been this way.
- **`npm test` and `npm run build` must both pass before every commit.** The pre-commit hook runs `biome lint` on staged files plus `tsc --noEmit`.
- **Stage with explicit paths.** Several sessions work in this repo at once. Never `git add -A` or `git add .`.
- **Never bend a number to pass a gate.** If a gate goes red on a correct rule, that is a reading about the game. Record it, do not tune it away.
- **Balance suites run only on an explicit ask.** `npm test` plus the browser pass is the gate for a task. Task 9 is the one place the long scripts run.
- **Commit message trailer**, on every commit:
  ```
  Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01EedwAoCPXna4Pw4kxh9Hve
  ```

## File Structure

| File | Responsibility after this plan |
|---|---|
| `src/sim/orders.ts` | The one scheduler. `judgeOrders` (verdicts + the loop), `runOrders` (pre-emption), `waitingLine`, the keep readings. |
| `src/sim/body.ts` | The need model only: `currentNeed`, `bodyStep`, and the per-need steps. No longer knows about intents. |
| `src/sim/intent.ts` | The intent runner only. `serveBody` moves out; `runIntent` keeps the collapse backstop. |
| `src/sim/bodyorder.ts` | **New.** The body row: its verdict, its sentence, and the step it takes. Keeps `orders.ts` from growing a second subject. |
| `src/sim/types.ts` | `OrderKind` gains `"body"`; `Order.pinned`; `Player.bodyNeed` / `Player.coldSpent`; `RunnerIntent` loses `need` and `coldSpent`. |
| `src/sim/ladder.ts` | `orderByHand`'s landing rule. |
| `src/sim/regionstate.ts`, `src/sim/save.ts` | The body row exists on every region list, new and loaded. |
| `src/ui/panels.ts`, `src/main.ts` | The pin control, the held-up banner, the body row's look, the landing-rule line. |
| `src/sim/reference.ts` | The player script's call sites for `stallingOrder` and `bodyAsks`. |

---

### Task 1: Verdicts, fall-through, and the pin

Spec sections 1, 4, 5. This is the change Nikko asked for: a row that cannot run stops holding up the list.

**Files:**
- Modify: `src/sim/types.ts` (add `Order.pinned`)
- Modify: `src/sim/orders.ts:426-497` (`judgeOrders`), `:510-521` (`waitingLine`), `:529-531` (`stallingOrder`), `markSkipped`
- Modify: `src/sim/reference.ts:955-962` (the stall-withdrawal loop)
- Test: `tests/orders.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces:
  ```ts
  // src/sim/types.ts
  /** The player has said this row holds the list until it is met. */
  pinned?: boolean;

  // src/sim/orders.ts
  export type Judgement = { chosen: Order | null; blockedBy: Order | null };
  export function judgeOrders(state: GameState, world: World, cal: Calendar): Judgement;
  export function blockingOrder(state: GameState, world: World, cal: Calendar): Order | null;
  export function waitingLine(state: GameState, world: World, cal: Calendar, o: Order, judged: Judgement): string;
  ```

- [ ] **Step 1: Write the failing tests**

Add to `tests/orders.test.ts`, in a new `describe("fall-through")` block:

```ts
describe("fall-through", () => {
  it("a once row that cannot run is passed over and the row below it runs", () => {
    const { state, world } = newGame(3);
    // A cook with nothing to cook cannot run; sticks always can.
    const blocked = addOrder(state, world, { task: "cook", until: { kind: "once" }, deliver: "camp", where: "nearest" }, "job");
    const runnable = addOrder(state, world, { task: "sticks", until: { kind: "once" }, deliver: "camp", where: "nearest" }, "job");
    const { chosen, blockedBy } = judgeOrders(state, world, cal);
    expect(blocked.skipped).not.toBe("");
    expect(chosen?.id).toBe(runnable.id);
    expect(blockedBy).toBe(null);
  });

  it("the same row, pinned, stops the list and blockingOrder names it", () => {
    const { state, world } = newGame(3);
    const blocked = addOrder(state, world, { task: "cook", until: { kind: "once" }, deliver: "camp", where: "nearest" }, "job");
    blocked.pinned = true;
    addOrder(state, world, { task: "sticks", until: { kind: "once" }, deliver: "camp", where: "nearest" }, "job");
    const { chosen, blockedBy } = judgeOrders(state, world, cal);
    expect(chosen).toBe(null);
    expect(blockedBy?.id).toBe(blocked.id);
    expect(blockingOrder(state, world, cal)?.id).toBe(blocked.id);
  });

  it("a pinned row that is met does not hold the list", () => {
    const { state, world } = newGame(3);
    const met = addOrder(state, world, { task: "sticks", until: { kind: "times", n: 1 }, deliver: "camp", where: "nearest" }, "job");
    met.pinned = true;
    met.done = 1;
    const below = addOrder(state, world, { task: "stone", until: { kind: "once" }, deliver: "camp", where: "nearest" }, "job");
    expect(judgeOrders(state, world, cal).chosen?.id).toBe(below.id);
  });

  it("a passed-over once row says what ran instead, once, on the transition", () => {
    const { state, world } = newGame(3);
    addOrder(state, world, { task: "cook", until: { kind: "once" }, deliver: "camp", where: "nearest" }, "job");
    addOrder(state, world, { task: "sticks", until: { kind: "once" }, deliver: "camp", where: "nearest" }, "job");
    const before = state.log.length;
    judgeOrders(state, world, cal);
    const lines = state.log.slice(before).map((e) => e.text);
    expect(lines.filter((t) => t.includes("instead")).length).toBe(1);
    // Judged again with nothing changed, it does not say it twice.
    judgeOrders(state, world, cal);
    expect(state.log.slice(before).filter((e) => e.text.includes("instead")).length).toBe(1);
  });

  it("a passed-over standing row is silent", () => {
    const { state, world } = newGame(3);
    addOrder(state, world, { task: "cook", until: { kind: "forever" }, deliver: "camp", where: "nearest" }, "grind");
    addOrder(state, world, { task: "sticks", until: { kind: "once" }, deliver: "camp", where: "nearest" }, "job");
    const before = state.log.length;
    judgeOrders(state, world, cal);
    expect(state.log.slice(before).some((e) => e.text.includes("instead"))).toBe(false);
  });
});
```

Add `judgeOrders` and `blockingOrder` to the import list at `tests/orders.test.ts:15-17`.

- [ ] **Step 2: Run them to verify they fail**

Run: `npm test -- tests/orders.test.ts -t "fall-through"`
Expected: FAIL - `blockingOrder` is not exported, and `judgeOrders` returns `{ chosen, stalling }`.

- [ ] **Step 3: Rewrite `judgeOrders` around verdicts**

In `src/sim/orders.ts`, replace the body of `judgeOrders`. The per-row reading becomes one local function returning a verdict, and the loop applies the pin rule:

In `src/sim/types.ts` (not `orders.ts`: `orders.ts` will import `bodyorder.ts`
in Task 4, and `bodyorder.ts` needs `Verdict`, so the type belongs where
neither has to import the other):

```ts
/** What the scheduler makes of one row this minute. */
export type Verdict =
  | { v: "met" }
  | { v: "shut"; why: string }
  | { v: "blocked"; why: string }
  | { v: "ready" };
```

Then in `src/sim/orders.ts`:

```ts
export type Judgement = { chosen: Order | null; blockedBy: Order | null };

/**
 * Every order, top down, is judged afresh: met, shut, blocked or ready.
 * The first ready row runs, and the rows below it are judged too, so a row
 * never shows a reason left over from before something above it started.
 *
 * A row that cannot run is passed over. The list is what the survivor does
 * next, not a contract to be completed in order: one order needing a tool
 * that is not made yet must not cost the day the tool would have been made
 * in. A pinned row is the player saying otherwise, and it is the only thing
 * that stops the list.
 */
export function judgeOrders(state: GameState, world: World, cal: Calendar): Judgement {
  const live = state.intent;
  const liveId = live?.orderId ?? null;
  let chosen: Order | null = null;
  let blockedBy: Order | null = null;
  for (const o of ordersHere(state, world)) {
    const verdict = judgeRow(state, world, cal, o, liveId);
    if (verdict.v === "met") {
      markSkipped(state, world, cal, o, "", null);
      continue;
    }
    if (verdict.v === "ready") {
      markSkipped(state, world, cal, o, "", null);
      if (!chosen && !blockedBy) chosen = o;
      continue;
    }
    markSkipped(state, world, cal, o, verdict.why, chosen);
    if (o.pinned && !chosen && !blockedBy) blockedBy = o;
  }
  return { chosen: blockedBy ? null : chosen, blockedBy };
}
```

`judgeRow` is the existing per-row body, lifted out and returning a verdict instead of `continue`-ing:

```ts
/** One row's reading. The delivery, condition, met, capacity, legality, night and walk checks, in the order they bite. */
function judgeRow(state: GameState, world: World, cal: Calendar, o: Order, liveId: number | null): Verdict {
  const live = state.intent;
  // A live order carrying a load home is still able to run: judged afresh at
  // the work cell it would read "the vessels are full" every trip, though
  // nothing is wrong - it is on its way to be poured.
  if (o.id === liveId && live && deliveryPending(state, world, live)) return { v: "ready" };
  const shut = conditionOpen(state, world, cal, o);
  if (shut) return { v: "shut", why: shut };
  if (readOrder(state, world, cal, o, o.id === liveId)) return { v: "met" };
  const keep = keepTarget(o);
  if (keep?.item === "water") {
    const homeSt = regionState(state, world, state.player.region);
    const camp = pile(state, homeSt.campCell);
    const cap = campWaterCapacity(camp, homeSt);
    // cap === 0 means no vessel has ever reached camp, not that camp is full.
    if (cap > 0 && cap < keep.qty && qty(camp, "water") + qty(camp, "ice") >= cap - 1e-9) {
      return { v: "shut", why: `camp holds ${cap % 1 === 0 ? cap : cap.toFixed(1)} litres; more vessels at camp would hold more` };
    }
  }
  const opt = intentOption(state, world, cal, o.req.task, o.req.arg, o.req.where);
  if (!opt.ok) return { v: "blocked", why: opt.why };
  const { cell } = resolveCell(state, world, cal, o.req.task, o.req.arg, o.req.where);
  const night = nightSkip(state, world, cal, o.req.task, cell);
  if (night) return { v: "shut", why: night };
  if (cell !== cellOf(state, world)) {
    const w = check(state, world, cal, "walk", `cell:${cell}`);
    if (!w.ok) return { v: "blocked", why: w.why };
  }
  return { v: "ready" };
}
```

Delete the `const hand = intentMode(...)` line and every use of it. Drop the now-unused `intentMode` from the import at `src/sim/orders.ts:15` if nothing else in the file uses it.

- [ ] **Step 4: Give `markSkipped` the second half of the sentence**

Replace `markSkipped` in `src/sim/orders.ts`:

```ts
/**
 * Sets the skip reason, and says what is happening instead. Only the ""
 * to reason transition speaks, so a row settled at one reason is quiet.
 *
 * A once row is the player's own request: passing it over is a thing they
 * asked for that is not happening, and the log owes them both halves of
 * it. A standing row is a policy, and a policy being passed over is what
 * the policy means - "keep camp at 40 kg firewood" is silent on the day
 * camp has 40 kg, and a line every time would bury the log.
 */
function markSkipped(state: GameState, world: World, cal: Calendar, o: Order, why: string, instead: Order | null): void {
  if (why && !o.skipped) {
    const asked = o.req.until.kind === "once";
    const tail = asked && instead ? ` ${cap(orderSentence(state, world, cal, instead))} instead.` : "";
    log(state, `${orderSentence(state, world, cal, o)}: ${why}.${tail}`, "bad");
  }
  o.skipped = why;
}

/** First letter up, for a sentence that starts mid-line. */
function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
```

Note the `instead` passed in is the row chosen *above* this one, which is the row actually taking the minute.

- [ ] **Step 5: Rename `stallingOrder` and update `waitingLine`**

In `src/sim/orders.ts`, rename `stallingOrder` to `blockingOrder` and reword its doc comment:

```ts
/**
 * The pinned row holding the list, if one is: the topmost pinned row that
 * cannot run, with nothing above it that can. Nothing else stops the list,
 * so this is always a row the player pinned on purpose and can unpin.
 */
export function blockingOrder(state: GameState, world: World, cal: Calendar): Order | null {
  return judgeOrders(state, world, cal).blockedBy;
}
```

In `waitingLine`, change the destructure and the held-up line:

```ts
  const { chosen, blockedBy } = judged;
  if (blockedBy && blockedBy.id !== o.id) return `held up by the pinned "${orderSentence(state, world, cal, blockedBy)}"`;
```

Update `waitingLine`'s signature to take `Judgement`, and its doc comment's last paragraph to say the judgement is one pass over the whole list.

- [ ] **Step 6: Update the player script**

In `src/sim/reference.ts:955-962`, the loop strikes off rows that stall the list. Nothing stalls now unless pinned, and the script never pins, so the loop can never fire. Delete the loop and its comment block (`:945-962`), and remove `stallingOrder` from the import at `:36`. Keep `this.stalled` if other code reads it; if nothing does, delete the field too.

Run `npm run typecheck` to find every other reference.

- [ ] **Step 7: Run the new tests**

Run: `npm test -- tests/orders.test.ts -t "fall-through"`
Expected: PASS, all five.

- [ ] **Step 8: Run the whole fast suite and read what moved**

Run: `npm test`
Expected: some existing tests fail. Every failure is either (a) a test asserting the old "a once order stalls the list" rule, which is now wrong and should be rewritten to assert fall-through, or (b) a seeded outcome that moved because a run no longer stands still. Read each one and say which it is in the commit message. Do not change production code to make an obsolete assertion pass.

- [ ] **Step 9: Commit**

```bash
npm run build
git add src/sim/orders.ts src/sim/types.ts src/sim/reference.ts tests/orders.test.ts
git commit
```
Message: `feat(survidle): a row that cannot run no longer stops the list`, body explaining the verdict split and which existing tests were rewritten and why.

---

### Task 2: Pre-emption every minute, on a prefix

Spec section 2. The scheduler currently only gets a say on a minute with a free task slot, which is why `decideAgain` exists.

**Files:**
- Modify: `src/sim/orders.ts:541` (`runOrders`), delete `decideAgain`, `moveOrderByHand`, `removeOrderByHand`
- Modify: `src/main.ts:505-512` (the three order buttons)
- Modify: `tests/orders.test.ts` (the `moveOrderByHand` / `removeOrderByHand` call sites at `:375, :389, :401, :419, :438`)
- Test: `tests/orders.test.ts`

**Interfaces:**
- Consumes: `Judgement`, `judgeOrders` from Task 1.
- Produces:
  ```ts
  export function moveOrder(state: GameState, world: World, id: number, dir: -1 | 1): void;   // unchanged, now the only door
  export function removeOrder(state: GameState, world: World, id: number): void;              // unchanged, now the only door
  ```
  `moveOrderByHand` and `removeOrderByHand` no longer exist.

- [ ] **Step 1: Write the failing tests**

```ts
describe("pre-emption", () => {
  it("a row dragged above the live row takes the minute, and the displaced row keeps its progress", () => {
    const { state, world } = newGame(3);
    const a = addOrder(state, world, { task: "sticks", until: { kind: "forever" }, deliver: "camp", where: "nearest" }, "grind");
    const b = addOrder(state, world, { task: "stone", until: { kind: "forever" }, deliver: "camp", where: "nearest" }, "grind");
    advance(state, world, 30);
    expect(state.intent?.orderId).toBe(a.id);
    const doneBefore = a.minutes;
    moveOrder(state, world, b.id, -1);
    advance(state, world, 2);
    expect(state.intent?.orderId).toBe(b.id);
    expect(a.minutes).toBe(doneBefore);
  });

  it("a load being carried home is delivered before a higher row takes over", () => {
    // Set up: a gather order away from camp with a pending delivery, and a
    // second order ranked above it that is ready.
    const { state, world } = newGame(3);
    const away = addOrder(state, world, { task: "sticks", until: { kind: "forever" }, deliver: "camp", where: "nearest" }, "grind");
    advance(state, world, 240);
    if (!deliveryPending(state, world, state.intent!)) return; // seed did not reach the walk home; the next test covers the rule
    const top = addOrder(state, world, { task: "stone", until: { kind: "forever" }, deliver: "camp", where: "nearest" }, "grind");
    moveOrder(state, world, top.id, -1);
    advance(state, world, 1);
    expect(state.intent?.orderId).toBe(away.id);
  });

  it("readiness is not computed for rows below the live row", () => {
    const { state, world } = newGame(3);
    addOrder(state, world, { task: "sticks", until: { kind: "forever" }, deliver: "camp", where: "nearest" }, "grind");
    for (let i = 0; i < 8; i++) {
      addOrder(state, world, { task: "stone", until: { kind: "forever" }, deliver: "camp", where: "nearest" }, "grind");
    }
    advance(state, world, 60);
    resetWalkJudged();
    advance(state, world, 1);
    // The live row is the top one, so at most it and the body row are judged.
    expect(walkJudged()).toBeLessThanOrEqual(2);
  });
});
```

The counter is new in this task. In `src/sim/orders.ts`:

```ts
/** Rows whose walk has been judged since the counter was last reset. The prefix rule's test reads it; nothing in the game does. */
let walked = 0;
export function walkJudged(): number { return walked; }
export function resetWalkJudged(): void { walked = 0; }
```

incremented in `judgeRow` on the line before its `check(state, world, cal, "walk", ...)` call. Import `resetWalkJudged` and `walkJudged` in the test.

- [ ] **Step 2: Run them to verify they fail**

Run: `npm test -- tests/orders.test.ts -t "pre-emption"`
Expected: FAIL - `moveOrder` alone does not re-decide, and `walkJudged` does not exist.

- [ ] **Step 3: Add the prefix rule to `judgeRow`**

`judgeRow` gains a parameter saying whether this row could take the minute at all, and skips the expensive half when it cannot:

```ts
function judgeRow(state: GameState, world: World, cal: Calendar, o: Order, liveId: number | null, canTakeIt: boolean): Verdict {
  ...
  if (readOrder(state, world, cal, o, o.id === liveId)) return { v: "met" };
  ...capacity check...
  // Rows below the live row cannot pre-empt it, so their readiness is not a
  // question this minute: the walk check routes across the map, and asking it
  // of every row every minute puts A* in the inner loop. They keep their cheap
  // reads, which is what the panel draws them from.
  if (!canTakeIt) return { v: "blocked", why: o.skipped || "waiting its turn" };
  const opt = intentOption(...);
  ...
}
```

In `judgeOrders`, `canTakeIt` is true until the live row has been passed:

```ts
  let past = false;
  for (const o of ordersHere(state, world)) {
    const verdict = judgeRow(state, world, cal, o, liveId, !past);
    if (o.id === liveId) past = true;
    ...
  }
```

A row below the live row returning `blocked` never becomes `chosen` (something above it already is) and never becomes `blockedBy` unless pinned - and a pinned row below the live row genuinely does hold everything under itself, which is correct.

- [ ] **Step 4: Make `runOrders` run with a task live**

In `src/sim/orders.ts`, `runOrders` drops `state.task` from its guard and gains the take-over branch:

```ts
export function runOrders(state: GameState, world: World, cal: Calendar, rng: Rng): void {
  if (state.dead) return;
  ...the daily roll and the finished-job sweep, unchanged...
  ...the empty-list branch, unchanged...
  const { chosen } = judgeOrders(state, world, cal);
  if (chosen && live?.orderId === chosen.id) return;
  if (!chosen && live?.task === "wait") return;
  if (live && deliveryPending(state, world, live)) {
    live.windDown = true;
    return;
  }
  if (chosen) {
    // The chosen row is not the live one. Whatever is running is set aside
    // with its share of the work kept, and the chosen row starts: the list
    // is what the survivor does next, read afresh every minute, and a row
    // that has just become the topmost runnable one is what next means.
    if (state.task) setAside(state, world);
    startIntent(state, world, cal, rng, chosen.req, chosen.id);
    return;
  }
  if (state.task) return;
  startIntent(state, world, cal, rng, WAIT);
  log(state, "Nothing to do. {You} {wait} at camp.");
}
```

The `bodyAsks` gate inside the `if (chosen)` branch (the "the body speaks first" block) stays for now - Task 5 removes it, when the body becomes a row.

- [ ] **Step 5: Delete `decideAgain` and its two doors**

Delete `decideAgain`, `moveOrderByHand` and `removeOrderByHand` from `src/sim/orders.ts`. In `src/main.ts:505-512`, call `moveOrder` and `removeOrder` directly (they need no `cal` or `rng`, so drop those arguments). In `tests/orders.test.ts`, replace the five `...ByHand` calls with the bare mutators plus an `advance(state, world, 1)` where the test was relying on the immediate re-decide.

- [ ] **Step 6: Run the new tests, then the suite**

Run: `npm test -- tests/orders.test.ts -t "pre-emption"` - Expected: PASS
Run: `npm test` - Expected: read every failure as in Task 1 Step 8.

- [ ] **Step 7: Check the cost before committing**

Run: `time npx vite-node scripts/reference.ts 17 40`
Expected: completes, and no slower than roughly twice the same command on `origin/main`. If it is dramatically slower, the prefix rule is not holding - find which row is routing and why before going on. This is the one performance-sensitive change in the plan and it is cheaper to catch here than in Task 9.

- [ ] **Step 8: Commit**

```bash
npm run build
git add src/sim/orders.ts src/main.ts tests/orders.test.ts
git commit
```
Message: `feat(survidle): the list is read every minute, not only on a free slot`.

---

### Task 3: The need model stops needing an intent

Spec section 3.2. Pure refactor, no behaviour change: the same needs in the same order, read off the player instead of off a live intent. Task 5 depends on this, because the body row's intent comes and goes.

**Files:**
- Modify: `src/sim/types.ts` (`Player`, `RunnerIntent`, `HandIntent`, `IntentBase`)
- Modify: `src/sim/body.ts:67` (`currentNeed`), `:126` (`bodyAsks`), `:174` (`bodyStep`), `homeBeforeDark`, `canFeed`, `campStep`
- Modify: `src/sim/intent.ts:678` (`serveBody` call site only), `src/sim/newgame.ts`, `src/sim/save.ts`
- Test: `tests/body.test.ts`

**Interfaces:**
- Produces:
  ```ts
  // src/sim/types.ts, on Player
  /** The body need being served, or null. Sticky: a need's exit line is not its entry line. */
  bodyNeed: BodyNeed | null;
  /** A rest has already failed to raise warmth: cold does not hold again until warmth recovers on its own. */
  coldSpent: boolean;

  // src/sim/body.ts
  export function currentNeed(state: GameState, world: World, cal: Calendar): BodyNeed | null;
  export function bodyStep(state: GameState, world: World, cal: Calendar, rng: Rng, need: BodyNeed): Step | null;
  export function canFeed(state: GameState, world: World, cal: Calendar): boolean;
  ```
  `bodyAsks` is gone; `currentNeed` is what it was.

- [ ] **Step 1: Write the failing test**

```ts
it("a cold need holds until warm, across a fresh intent", () => {
  const { state, world } = newGame(3);
  const p = state.player;
  p.warmth = 0.1;
  const first = currentNeed(state, world, cal);
  expect(first).toBe("cold");
  // The intent the need was read under is gone; the stickiness is the body's.
  state.intent = null;
  p.warmth = 0.5;   // above COLD_UNDER, below WARM_AT
  expect(currentNeed(state, world, cal)).toBe("cold");
  p.warmth = 1;
  expect(currentNeed(state, world, cal)).not.toBe("cold");
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- tests/body.test.ts -t "across a fresh intent"`
Expected: FAIL - `currentNeed` takes four arguments.

- [ ] **Step 3: Move the two fields**

In `src/sim/types.ts`: add `bodyNeed: BodyNeed | null;` and `coldSpent: boolean;` to `Player`. Remove `need` from `IntentBase`/`HandIntent`/`RunnerIntent` and remove `coldSpent` from `RunnerIntent`. Leave `restFromWarmth` where it is - it is per-step, not per-need.

In `src/sim/newgame.ts`, add `bodyNeed: null, coldSpent: false` beside `autoEat: true`.

- [ ] **Step 4: Drop the intent parameter through `body.ts`**

`currentNeed(state, world, cal)`:
- `it.need` becomes `state.player.bodyNeed`, and the function **writes** it before returning: `state.player.bodyNeed = need; return need;`
- `it.coldSpent` becomes `state.player.coldSpent`
- `it.task === "night" && it.done < 1` becomes `state.intent?.task === "night" && state.intent.done < 1`
- `canFeed(state, world, cal, it)` loses its `it`; `it.campCell` inside it becomes `regionState(state, world, state.player.region).campCell`

`bodyStep(state, world, cal, rng, need)` and `campStep(state, world, cal, need)` lose their `it` the same way. `homeBeforeDark(state, world, cal)` reads `state.player.bodyNeed === "home"`.

Delete `bodyAsks` entirely. Its three callers in `src/sim/reference.ts` (`:1023, :1047, :1053`) call `currentNeed(state, world, cal)`.

In `src/sim/intent.ts`, `serveBody` drops `it.need = need` (the write is `currentNeed`'s now) and passes no intent to `bodyStep`. It still takes `it` for the moment; Task 5 removes it.

- [ ] **Step 5: Migrate saves**

In `src/sim/save.ts`, beside the other player defaults (near `:219`, where region fields are filled), add:

```ts
  p.bodyNeed ??= null;
  p.coldSpent ??= false;
```

A save loading with `bodyNeed: null` re-enters its need on the next minute, which costs one minute of stickiness and nothing else.

- [ ] **Step 6: Run the tests**

Run: `npm test`
Expected: PASS, all of it. This task changes no behaviour, so a failure here is a mistake in the refactor, not a reading. If a seeded outcome moves, find out why before going on.

- [ ] **Step 7: Commit**

```bash
npm run build
git add src/sim/body.ts src/sim/types.ts src/sim/intent.ts src/sim/newgame.ts src/sim/save.ts src/sim/reference.ts tests/body.test.ts
git commit
```
Message: `refactor(survidle): a need is the body's, not the intent's`.

---

### Task 4: The body row exists, at the top, doing what the tier did

Spec section 3, minus 3.1. After this task the game behaves exactly as before - a body row pinned to the top of every list *is* the always-pre-empting body tier - but the tier is now visible and rankable. Task 5 is what makes it a lever.

**Files:**
- Create: `src/sim/bodyorder.ts`
- Modify: `src/sim/types.ts` (`OrderKind`), `src/sim/orders.ts` (`judgeRow`, `orderSentence`, `removeOrder`, `runOrders`'s job sweep), `src/sim/regionstate.ts:41`, `src/sim/save.ts:219`, `src/sim/ladder.ts` (`normalizeOrder`, `orderGate`, `rungsNeeded` must never see a body row)
- Test: `tests/bodyorder.test.ts` (new)

**Interfaces:**
- Consumes: `Verdict` and `judgeRow` from Tasks 1-2; `currentNeed` / `bodyStep` from Task 3.
- Produces:
  ```ts
  // src/sim/bodyorder.ts
  /** The request every body row carries. Its task is never begun as work; the row's own step is what runs. */
  export const BODY_REQ: IntentRequest;
  export const BODY_SENTENCE = "Look after yourself - sleep, food, water, warmth, shelter, home before dark";
  export function isBodyRow(o: Order): boolean;
  export function addBodyRow(st: RegionState): Order;
  export function bodyRowOf(state: GameState, world: World): Order | null;
  export function judgeBodyRow(state: GameState, world: World, cal: Calendar): Verdict;
  ```

- [ ] **Step 1: Write the failing tests**

Create `tests/bodyorder.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { calendar } from "../src/sim/calendar";
import { newGame } from "../src/sim/newgame";
import { regionState } from "../src/sim/regionstate";
import { removeOrder, ordersHere, orderSentence } from "../src/sim/orders";
import { bodyRowOf, isBodyRow, judgeBodyRow, BODY_SENTENCE } from "../src/sim/bodyorder";
import { Rng } from "../src/rng";
import { deserialize, serialize } from "../src/sim/save";

const cal = calendar(0);

describe("the body row", () => {
  it("a new region's list is the body row and nothing else", () => {
    const { state, world } = newGame(3);
    const list = ordersHere(state, world);
    expect(list.length).toBe(1);
    expect(isBodyRow(list[0])).toBe(true);
    expect(orderSentence(state, world, cal, list[0])).toBe(BODY_SENTENCE);
  });

  it("it cannot be struck off", () => {
    const { state, world } = newGame(3);
    const row = bodyRowOf(state, world)!;
    removeOrder(state, world, row.id);
    expect(bodyRowOf(state, world)?.id).toBe(row.id);
  });

  it("a save from before it loads with one, at the top", () => {
    const { state, world } = newGame(3);
    const raw = JSON.parse(serialize(state));
    for (const st of Object.values(raw.state.regions) as Record<string, unknown>[]) {
      st.orders = [];
    }
    const back = deserialize(JSON.stringify(raw), world);
    const list = ordersHere(back, world);
    expect(isBodyRow(list[0])).toBe(true);
  });

  it("it reads met when the body wants nothing and ready when it does", () => {
    const { state, world } = newGame(3);
    const p = state.player;
    p.warmth = 1; p.water = 3; p.kcal = 3000; p.energy = 1; p.sleepDebt = 0;
    expect(judgeBodyRow(state, world, cal, new Rng(1)).v).toBe("met");
    p.warmth = 0.1;
    expect(judgeBodyRow(state, world, cal, new Rng(1)).v).not.toBe("met");
  });
});
```

The exact property names for `p.warmth`, `p.kcal`, `p.energy`, `p.sleepDebt` are as in `src/sim/types.ts` - read them and fix the test's set-up to match before running.

- [ ] **Step 2: Run them to verify they fail**

Run: `npm test -- tests/bodyorder.test.ts`
Expected: FAIL - the module does not exist.

- [ ] **Step 3: Write `src/sim/bodyorder.ts`**

```ts
/**
 * The body's row. Sleep, food, water, warmth, shelter and coming home
 * before dark are one row on the order list rather than a tier hidden
 * under it, so where the body ranks against the work is the player's to
 * say and is visible while they say it.
 *
 * The row's verdict comes from the need model, not from a target: it asks
 * for nothing while the body wants nothing, and what it does when it wants
 * something is whatever step that need calls for.
 */
import type { Rng } from "../rng";
import type { World } from "../world/gen";
import type { Calendar } from "./calendar";
import { bodyStep, currentNeed, NEED_WORDS } from "./body";
import { regionState } from "./regionstate";
import type { GameState, IntentRequest, Order, RegionState, Verdict } from "./types";

/**
 * The request the row carries. `wait` is the task because the row's minute
 * is the body's own step rather than work: nothing ever begins a task from
 * this request, and the runner intent it starts is the one the wait at camp
 * already used to carry the body tier under.
 */
export const BODY_REQ: IntentRequest = { task: "wait", until: { kind: "forever" }, deliver: "leave", where: "nearest" };

export const BODY_SENTENCE = "Look after yourself - sleep, food, water, warmth, shelter, home before dark";

export function isBodyRow(o: Order): boolean {
  return o.kind === "body";
}

/** Adds the row at the top of a region's list. Every list has exactly one. */
export function addBodyRow(st: RegionState): Order {
  const o: Order = { id: st.nextOrderId++, kind: "body", req: BODY_REQ, done: 0, minutes: 0, skipped: "" };
  st.orders.unshift(o);
  return o;
}

export function bodyRowOf(state: GameState, world: World): Order | null {
  return regionState(state, world, state.player.region).orders.find(isBodyRow) ?? null;
}

/**
 * The row's reading. Met while the body wants nothing; ready when a need
 * holds and there is a step for it; blocked when a need holds and nothing
 * can be done about it here - a thirst with no water within reach - which
 * is the moment the row most owes the player a word.
 */
export function judgeBodyRow(state: GameState, world: World, cal: Calendar, rng: Rng): Verdict {
  const need = currentNeed(state, world, cal);
  if (!need) return { v: "met" };
  return bodyStep(state, world, cal, rng, need) ? { v: "ready" } : { v: "blocked", why: NEED_WORDS[need] };
}
```

`NEED_WORDS` is a new map in `src/sim/body.ts` giving each `BodyNeed` its blocked phrasing:

```ts
/** What the row says when a need holds and nothing here can answer it. */
export const NEED_WORDS: Record<BodyNeed, string> = {
  sleep: "needs sleep; nowhere to lie down",
  storm: "the storm is coming; no shelter within reach",
  cold: "cold; no fire and nowhere to warm up",
  thirsty: "thirsty; no water within reach",
  hungry: "hungry; nothing safe to eat",
  snares: "the snares want checking; no way there",
  spent: "worked out; nowhere to sit down",
  home: "should be home before dark; no way there",
};
```

`judgeBodyRow` needs an `Rng` because `bodyStep` does. `judgeRow` in `orders.ts` therefore needs one too - thread `state.rng` through as `new Rng(state.rng)` **without writing it back**, so judging never advances the run's randomness. Add that as a comment where it is done.

- [ ] **Step 4: Wire the row into the scheduler**

- `src/sim/types.ts`: `export type OrderKind = "keep" | "grind" | "job" | "body";`
- `src/sim/orders.ts`, in `judgeRow`, first line: `if (isBodyRow(o)) return judgeBodyRow(state, world, cal, rng);`
- `src/sim/orders.ts`, in `orderSentence`, first line: `if (isBodyRow(o)) return BODY_SENTENCE;`
- `src/sim/orders.ts`, in `removeOrder`: `st.orders = st.orders.filter((o) => o.id !== id || isBodyRow(o));`
- `src/sim/orders.ts`, in `runOrders`'s finished-job sweep: skip body rows (`if (isBodyRow(o)) continue;`) - a body row is never a job and never drops off.
- `src/sim/orders.ts`, in `runOrders`'s empty-list branch: the list is never empty now, so that branch is dead. Delete it, and check `save.ts`'s away report and `reference.ts` for anything reading "no orders" as a state.
- `src/sim/ladder.ts`: `normalizeOrder`, `rungsNeeded` and `orderGate` must never be called with a body row. They are called on a *request* being given, and nothing ever gives a body row, so no change is needed - but add a one-line comment at `normalizeOrder` saying the body kind never reaches it.
- `src/sim/regionstate.ts:41`: after the state literal is built, call `addBodyRow(st)` so `orders` starts as the body row and `nextOrderId` is 2.
- `src/sim/save.ts:219`: after `st.orders ??= []`, add the migration: `if (!st.orders.some(isBodyRow)) addBodyRow(st);` - it must run for every region, loaded or not, and it must unshift so a loaded game keeps the old always-first behaviour.
- `src/sim/save.ts:272`, the away snapshot: skip body rows. It counts completions and minutes per row, and the body row has no completions to report.

- [ ] **Step 5: Fix the tests the new row breaks**

`tests/orders.test.ts:26-30` asserts a new region's list is `[]` and `nextOrderId` is 1. That is now the body row and 2. Rewrite the assertion to say so; do not delete the test - it is the one that would catch the row going missing.

Run `npm test` and fix every list-length and index assumption the same way. Rows are ranked from index 0, and index 0 is now the body row unless something was clicked.

- [ ] **Step 6: Run the tests**

Run: `npm test -- tests/bodyorder.test.ts` - Expected: PASS
Run: `npm test` - Expected: PASS. Behaviour has not changed yet: the body row at the top is the old tier. Any seeded outcome that moves means the row is not equivalent to the tier - find out which need is being read differently before going on.

- [ ] **Step 7: Commit**

```bash
npm run build
git add src/sim/bodyorder.ts src/sim/body.ts src/sim/types.ts src/sim/orders.ts src/sim/ladder.ts src/sim/regionstate.ts src/sim/save.ts tests/bodyorder.test.ts tests/orders.test.ts
git commit
```
Message: `feat(survidle): the body is a row on the list`.

---

### Task 5: The body tier comes out of the intent runner

Spec section 3.1. This is the behaviour change: hand-clicked work now yields to the body when the body row outranks it, and the body row ranked low means the survivor works past it.

**Files:**
- Modify: `src/sim/intent.ts:678` (delete `serveBody`), `:700-718` (`runIntent`)
- Modify: `src/sim/orders.ts` (`runOrders`: the body row's own run, and the `bodyAsks` gate goes)
- Test: `tests/bodyorder.test.ts`

**Interfaces:**
- Consumes: everything from Tasks 1-4.
- Produces: nothing new. `serveBody` no longer exists.

- [ ] **Step 1: Write the failing tests**

```ts
it("the body row under a forever grind lets the survivor work past spent", () => {
  const { state, world } = newGame(3);
  const grind = addOrder(state, world, { task: "sticks", until: { kind: "forever" }, deliver: "camp", where: "nearest" }, "grind");
  const bodyRow = bodyRowOf(state, world)!;
  // The grind above the body row: the body gets no turn until it collapses.
  moveOrder(state, world, bodyRow.id, 1);
  expect(ordersHere(state, world)[0].id).toBe(grind.id);
  state.player.energy = SPENT_AT - 0.01;
  advance(state, world, 5);
  expect(state.intent?.orderId).toBe(grind.id);
});

it("the body row above the work pre-empts a live grind mid-chunk and the grind keeps its minutes", () => {
  const { state, world } = newGame(3);
  const grind = addOrder(state, world, { task: "sticks", until: { kind: "forever" }, deliver: "camp", where: "nearest" }, "grind");
  advance(state, world, 30);
  expect(state.intent?.orderId).toBe(grind.id);
  const minutes = grind.minutes;
  state.player.water = 0;   // thirsty, and camp has water
  advance(state, world, 2);
  expect(state.intent?.orderId).toBe(bodyRowOf(state, world)!.id);
  expect(grind.minutes).toBeGreaterThanOrEqual(minutes);
});

it("clearing the list does not stop a live sleep", () => {
  const { state, world } = newGame(3);
  const chore = addOrder(state, world, { task: "sticks", until: { kind: "forever" }, deliver: "camp", where: "nearest" }, "grind");
  state.player.sleepDebt = 1000;
  advance(state, world, 5);
  expect(state.task?.id).toBe("sleep");
  const slept = state.task!.done;
  removeOrder(state, world, chore.id);
  advance(state, world, 1);
  expect(state.task?.id).toBe("sleep");
  expect(state.task!.done).toBeGreaterThanOrEqual(slept);
});
```

The last one is playtest bug 1 (notes 146, 147) and is the reason this rework exists. Adjust the set-up values (`SPENT_AT`, `sleepDebt`) against `src/sim/body.ts` so the conditions actually hold; if a seed will not produce a sleep in five minutes, set `state.player.sleeping = { collapsed: false }` directly and say so in a comment.

- [ ] **Step 2: Run them to verify they fail**

Run: `npm test -- tests/bodyorder.test.ts -t "past spent"`
Expected: FAIL - `serveBody` still pre-empts from inside `runIntent` regardless of rank.

- [ ] **Step 3: Delete `serveBody` from `runIntent`**

In `src/sim/intent.ts`, delete the `serveBody` function and the `if (it.mode === "runner" && serveBody(...)) return;` line. Keep the `mode === "hand"` collapse clause above it exactly as it is, and update its comment: the reason hand work has no body tier is no longer the mode, it is that a click lands above the body row.

- [ ] **Step 4: Give the body row its minute in `runOrders`**

Where `runOrders` starts the chosen row's intent, a body row is started differently: it is the runner-shaped wait, and its minute takes the need's step.

```ts
  if (chosen) {
    if (state.task && !(isBodyRow(chosen) && state.task.id === "sleep")) setAside(state, world);
    if (isBodyRow(chosen)) {
      serveBodyRow(state, world, cal, rng, chosen);
      return;
    }
    startIntent(state, world, cal, rng, chosen.req, chosen.id);
    return;
  }
```

`serveBodyRow` lives in `src/sim/bodyorder.ts` and is what `serveBody` was, minus the intent bookkeeping:

```ts
/**
 * The row's minute: read the need and take its step. The sleep is the one
 * step the model rather than the clock ends - a sleep task runs as long as
 * the night is expected to be, and the two can disagree by minutes - so a
 * body past the wake line gets up on that minute instead of lying out an
 * hour it no longer needs.
 */
export function serveBodyRow(state: GameState, world: World, cal: Calendar, rng: Rng, o: Order): void {
  const need = currentNeed(state, world, cal);
  if (state.task?.id === "sleep" && need !== "sleep") setAside(state, world);
  if (!need) return;
  if (!state.intent || state.intent.orderId !== o.id) startIntent(state, world, cal, rng, BODY_REQ, o.id);
  const s = bodyStep(state, world, cal, rng, need);
  if (s && !isRunning(state, s)) takeStep(state, world, cal, s);
}
```

Delete the `bodyAsks` gate block from `runOrders` (the "Between orders the runner is its own, and the body speaks first" branch) - the body is a row and wins by rank now, not by a gate.

Check that `runIntent` does not tear down the body row's intent: it is a `wait`-tasked runner intent with an `orderId`, and `runOrders`'s existing "a manual intent is not this scheduler's to clear" logic must recognise it as the scheduler's.

- [ ] **Step 5: Run the tests**

Run: `npm test -- tests/bodyorder.test.ts` - Expected: PASS
Run: `npm test` - Expected: failures. This is the task that moves the game. Read each one: an assertion about a survivor who used to be interrupted mid-click and now is not (or the reverse) is a correct new reading and the test is rewritten; an assertion about something unrelated going wrong is a bug. Say which is which in the commit message.

- [ ] **Step 6: Commit**

```bash
npm run build
git add src/sim/intent.ts src/sim/orders.ts src/sim/bodyorder.ts tests/bodyorder.test.ts
git commit
```
Message: `feat(survidle): where the body ranks is the player's to say`.

---

### Task 6: A click goes to the top, a standing order goes to the bottom

Spec section 6, and note 111.

**Files:**
- Modify: `src/sim/ladder.ts:117-131` (`orderByHand`)
- Test: `tests/ladder.test.ts`

**Interfaces:**
- Consumes: `addBodyRow` / `isBodyRow` from Task 4.
- Produces: `orderByHand` unchanged in signature; only its insertion rank changes.

- [ ] **Step 1: Write the failing test**

```ts
it("a click lands at the top, above the body row, and runs now", () => {
  const { state, world } = newGame(3);
  state.player.water = 0;   // the body wants something
  const o = orderByHand(state, world, cal, new Rng(1), { task: "sticks", until: { kind: "once" }, deliver: "camp", where: "nearest" }, "job");
  expect(ordersHere(state, world)[0].id).toBe(o.id);
  expect(state.intent?.orderId).toBe(o.id);
});

it("a second click displaces the first", () => {
  const { state, world } = newGame(3);
  const a = orderByHand(state, world, cal, new Rng(1), { task: "sticks", until: { kind: "once" }, deliver: "camp", where: "nearest" }, "job");
  const b = orderByHand(state, world, cal, new Rng(1), { task: "stone", until: { kind: "once" }, deliver: "camp", where: "nearest" }, "job");
  const list = ordersHere(state, world);
  expect(list[0].id).toBe(b.id);
  expect(list[1].id).toBe(a.id);
});

it("a standing order lands at the bottom", () => {
  const { state, world } = newGame(3);
  const o = orderByHand(state, world, cal, new Rng(1), { task: "sticks", until: { kind: "forever" }, deliver: "camp", where: "nearest" }, "grind");
  const list = ordersHere(state, world);
  expect(list[list.length - 1].id).toBe(o.id);
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npm test -- -t "displaces the first"`
Expected: FAIL - a second click currently lands at `liveHand + 1`, below the first.

- [ ] **Step 3: Change the landing rank**

In `src/sim/ladder.ts`, `orderByHand` becomes:

```ts
export function orderByHand(state: GameState, world: World, cal: Calendar, rng: Rng, req: IntentRequest, kind: OrderKind): Order {
  // A standing order is a policy and sits under the day's requests; a click is
  // a request and goes to the top, above the body row, which is what "do this
  // now" means and what makes clicking through being tired possible at all.
  if (normalizeOrder(req, kind).req.until.kind !== "once") return giveOrder(state, world, req, kind);
  const o = giveOrder(state, world, req, kind, 0);
  if (!startIntent(state, world, cal, rng, o.req, o.id)) {
    const why = intentOption(state, world, cal, o.req.task, o.req.arg, o.req.where);
    log(state, `${orderSentence(state, world, cal, o)}: cannot start now${why.ok ? "" : `, ${plain(why.why)}`}. It stays on the list.`, "bad");
  }
  return o;
}
```

The `liveHand` lookup goes entirely. A second click displacing the first is the point: it is what the player meant by clicking.

- [ ] **Step 4: Run the tests**

Run: `npm test` - Expected: PASS, or failures that are the reference player's opening changing order. Read them.

- [ ] **Step 5: Commit**

```bash
npm run build
git add src/sim/ladder.ts tests/
git commit
```
Message: `feat(survidle): a click goes to the top, a standing order to the bottom`.

---

### Task 7: The panel says all of it

Spec section 7, and playtest findings 2, 4 and 5.

**Files:**
- Modify: `src/ui/panels.ts:397-432` (`ordersHtml`)
- Modify: `src/main.ts:505-512` and `:538` (the allowed-action list)
- Modify: `src/style.css`
- Test: `tests/panels.test.ts` (check the file name with `ls tests | grep panel`)

**Interfaces:**
- Consumes: `blockingOrder`, `isBodyRow`, `BODY_SENTENCE`, `Order.pinned`.
- Produces: one new `data-act` value, `"order-pin"`. Add it to the allow-list at `src/main.ts:538`.

`ordersHtml` (`src/ui/panels.ts:399`) is private and nothing tests it today.
Export it - it is a pure function of state and the natural unit to test, the
way `doHtml` is exported from `dopanel.ts` and tested in
`tests/dopanel.test.ts`. Put the new tests in a new `tests/orderpanel.test.ts`
following `tests/dopanel.test.ts`'s shape.

Note `src/ui/panels.ts:479` reads `orders.length ? ordersHtml(...) : ""`. The
list is never empty now, so the ternary always takes its first branch; leave
it or simplify it, but do not let it hide the body row.

- [ ] **Step 1: Write the failing tests**

```ts
it("the body row shows the need it is serving as its step", () => {
  const { state, world } = newGame(3);
  state.player.water = 0;
  advance(state, world, 2);
  const html = ordersHtml(state, world, cal);
  expect(html).toContain(BODY_SENTENCE);
  expect(html).toMatch(/drink|water/i);
});

it("a pinned row holding the list puts a banner above it naming the row and the way out", () => {
  const { state, world } = newGame(3);
  const blocked = addOrder(state, world, { task: "cook", until: { kind: "once" }, deliver: "camp", where: "nearest" }, "job");
  blocked.pinned = true;
  const html = ordersHtml(state, world, cal);
  expect(html).toContain("held up by");
  expect(html).toContain("Unpin");
});

it("no banner when nothing is holding the list", () => {
  const { state, world } = newGame(3);
  addOrder(state, world, { task: "cook", until: { kind: "once" }, deliver: "camp", where: "nearest" }, "job");
  expect(ordersHtml(state, world, cal)).not.toContain("held up by");
});

it("the body row has no remove button and no pin button", () => {
  const { state, world } = newGame(3);
  const row = bodyRowOf(state, world)!;
  const html = ordersHtml(state, world, cal);
  expect(html).not.toContain(`data-act="order-remove" data-id="${row.id}"`);
  expect(html).not.toContain(`data-act="order-pin" data-id="${row.id}"`);
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npm test -- -t "held up by"`
Expected: FAIL.

- [ ] **Step 3: Build the row and the banner**

In `ordersHtml`:
- Judge once at the top: `const judged = judgeOrders(state, world, cal);` and pass it to `waitingLine` per row, as the existing code does.
- The banner, before the rows, when `judged.blockedBy` is set:
  ```html
  <div class="held">The list is held up by <b>{sentence}</b> - {reason}. Unpin it to let the rest of the list run.</div>
  ```
- The pin button per row, not on the body row:
  ```html
  <button class="mini{ on when pinned}" data-act="order-pin" data-id="{id}"
    title="{pinned ? "Nothing under this runs until it is done" : "Hold the list here until this is done"}">{pinned ? "doing this first" : "do this first"}</button>
  ```
- The body row: no `order-remove`, no `order-pin`, `up`/`down` as normal, and a `body` class for styling. Its second line, when it is live, is the step (which `it.step` already carries from `bodyStep`); when it is not live it is `waitingLine` as any row.
- The landing rule, one line, at the head of the list: `<div class="rule">A click goes to the top. A standing order goes to the bottom.</div>`

In `src/style.css`, give `.order.body` a distinct look (a left border and a dimmer background is enough - do not invent a new colour system) and `.held` the same treatment `bad` log lines get.

- [ ] **Step 4: Handle the click**

`src/main.ts`, beside the other three cases:

```ts
    case "order-pin": {
      const o = ordersHere(state, world).find((x) => x.id === Number(target.dataset.id));
      if (o && !isBodyRow(o)) o.pinned = !o.pinned;
      break;
    }
```

Add `"order-pin"` to the list at `:538`.

- [ ] **Step 5: Run the tests**

Run: `npm test` - Expected: PASS.

- [ ] **Step 6: Look at it in a browser**

Run `npm run dev` from `08-survidle/` and open `http://127.0.0.1:5173/prototypes/08/?seed=1000010` - the playtest's own seed. Check, by measuring the DOM rather than by impression:
- The body row is first, reads its sentence, and shows a need as its step when one holds.
- A pinned blocked row raises the banner; unpinning clears it and the list moves on.
- A click lands at the top and starts.
- The landing-rule line is visible without scrolling.

Stop the dev server when done.

- [ ] **Step 7: Commit**

```bash
npm run build
git add src/ui/panels.ts src/main.ts src/style.css tests/
git commit
```
Message: `feat(survidle): the list says what is holding it and what the body is doing`.

---

### Task 8: The comment layer

The spec's reasoning must survive in the tree, because the next person to touch this will otherwise reinstate one of the three schedulers.

**Files:**
- Modify: `src/sim/orders.ts` (the module header), `src/sim/bodyorder.ts`, `src/sim/intent.ts` (`runIntent`'s comment)

- [ ] **Step 1: Rewrite the `orders.ts` module header**

It currently describes standing orders and says the intent runner does everything else. It should say: one list, judged top down every minute; the first ready row runs; a row that cannot run is passed over unless pinned; the body is a row on this list, so there is no second scheduler anywhere. Name the prefix rule as an invariant.

- [ ] **Step 2: Rewrite `runIntent`'s comment in `intent.ts`**

It says "the body tier may take over a running task of the runner's own; work chosen by hand has no body tier". Both halves are now false. It should say what is true: the runner takes the minute the scheduler gave it, and the collapse clause is the floor under a click that outranks the body row.

- [ ] **Step 3: Check for chronicle**

`grep -n "used to\|previously\|no longer\|now that\|since the" src/sim/orders.ts src/sim/bodyorder.ts src/sim/intent.ts src/sim/body.ts` - rewrite any comment that narrates the change rather than describing the code.

- [ ] **Step 4: Commit**

```bash
npm run lint
git add src/sim/orders.ts src/sim/bodyorder.ts src/sim/intent.ts
git commit
```
Message: `docs(survidle): the scheduler says it is the only one`.

---

### Task 9: Read the gates, honestly

Spec section 9. The one place the long suites run.

- [ ] **Step 1: Record the readings from before**

On `origin/main`, in a second checkout or by stashing to a WIP commit, run each and save the output to the scratchpad:

```bash
npx vite-node scripts/reference.ts        # April
npx vite-node scripts/reference.ts --heir # lineage
npm run year
npm run december
```

If a baseline from a recent session is already recorded in `docs/`, use it and say so rather than re-running.

- [ ] **Step 2: Run them on this branch**

Same four commands. Each takes minutes; run them in the background and collect.

- [ ] **Step 3: Write the readings down**

Add a section to the spec file, `## 12. What the gates read`, giving the before and after for each gate as N of M, and a sentence per gate on what changed and why. Where a gate went down, say what the survivor now does differently that costs it. Do not adjust any constant to move a number.

- [ ] **Step 4: Commit**

```bash
git add docs/superpowers/specs/2026-09-08-survidle-one-list-scheduler-design.md
git commit
```
Message: `docs(survidle): what the one-list scheduler reads on the gates`.

- [ ] **Step 5: Report and stop**

Push the branch. Report to the user in STE: what was built, the gate readings with the honest verdict, what to play and what would look wrong. Do not merge - a merge to main needs an explicit yes.

---

## Self-review notes

Spec coverage, section by section: 1 -> Task 1; 2 -> Task 2; 3 -> Tasks 3, 4; 3.1 -> Task 5; 3.2 -> Task 3; 3.3 -> untouched by design, asserted in Task 5's first test; 4 -> Task 1 Step 4; 5 -> Tasks 1, 7; 6 -> Task 6; 7 -> Task 7; 8 -> Tasks 3 Step 5, 4 Step 4; 9 -> Task 9; 10 -> the tests are distributed across Tasks 1, 2, 4, 5, 6, 7 (test 1 and 2 in Task 5, test 3-5 in Task 1, 6-7 in Task 5, 8 in Task 6, 9-11 in Task 2); 11 -> nothing, correctly.

Known soft spots an executor should expect to work through rather than treat as plan errors:

- **The test set-ups above use property names and thresholds read from the tree at plan time.** Check each against `src/sim/types.ts` and `src/sim/body.ts` before running; adjust the set-up, never the assertion.
- **Task 5's `serveBodyRow` and `runOrders` interact with `startIntent`'s own set-aside.** If a body step ends up restarting itself every minute, the cause is `startIntent` being called when the row is already live - the `state.intent.orderId !== o.id` guard is what prevents it.
- **The away report and the empty-list branch** both assumed a list can be empty. It cannot now. Task 4 Step 4 names both; if a third place assumes it, fix it there and note it.
