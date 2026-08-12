# Transition Queue Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move game-state ownership out of `src/main.ts` into one module that
queues transitions, defers committing new state until the animations explaining
it have run, and drives one six-stage lifecycle that nothing can run past.

**Architecture:** `src/transitions.ts` owns the state and a FIFO of
`Transition`s. `main.ts` loses its assignable `game` binding and reads through
an accessor. Each transition runs: transient beats, commit, questions, summary,
ending, complete. A generation token makes a superseded transition's callbacks
inert so a snapshot can cancel one mid-flight.

**Tech Stack:** TypeScript, Vite, vitest. No new dependencies.

This is **step 2 of 5** in
`docs/superpowers/specs/2026-08-11-presentation-pipeline-design.md`. Step 1
(march identity) is merged. Steps 3 to 5 follow this one and depend on it.

**Reference inventory** (exact call sites, current bodies, line numbers):
`.superpowers/sdd/2026-08-12-transition-queue/inventory.md`. It is a read-only
map of the code as it stands - consult it rather than re-deriving, but verify
line numbers against the file before editing, since earlier tasks in this plan
will have moved them.

## Global Constraints

- `npm test` and `npm run build` must both pass before any commit.
- Do NOT run `npm run balance`.
- Stage with explicit paths scoped to `02-balticmap`. Never `git add -A`.
- No em dashes and no non-typable unicode in source, comments, docs or commit
  messages. Use `-`, `->`, `"`, `'`, `...`.
- Comments state a standing constraint. Never a date, never a chronicle of the
  change. Reviewers rejected exactly this three times during step 1.
- Nothing may consume rng that did not before.
- No card behaviour change; `cardRulesHash` must not move.
- `src/main.ts` has no test file. Anything worth testing belongs in
  `src/transitions.ts` or another module that does.
- The game must remain playable after every task. This plan is a refactor; a
  task that leaves the game broken "until the next task" is a failed task.

---

## File Structure

| File | Responsibility | Change |
|---|---|---|
| `src/transitions.ts` | **New.** Owns game state, the transition queue, the generation token and the lifecycle | Created in Task 1 |
| `tests/transitions.test.ts` | **New.** The ordering rules, the deferred commit, cancellation | Created in Task 1 |
| `src/main.ts` | Wiring and DOM only | Loses `let game`; every mutation routes through `submit`; `refresh` reads the accessor |
| `src/hud.ts` | Presentation surfaces | `settleTurn`/`pendingSummary`/`idleSettleArmed` retired; summary and postmortem raised by the lifecycle |
| `src/net-protocol.ts` | Wire | Unchanged unless a task says otherwise |

---

### Task 1: The transition queue, with no wiring

Build the module and test it in isolation. Nothing imports it yet, so the game
is untouched and the task is safe to land on its own.

**Files:**
- Create: `src/transitions.ts`
- Test: `tests/transitions.test.ts`

**Interfaces:**
- Consumes: `GameState` and `GameEvent` from `./game`.
- Produces: everything in the code block below. Later tasks import exactly these.

- [ ] **Step 1: Write the module's public shape**

```ts
import type { GameState, GameEvent } from "./game";

/** One move of the world, and everything needed to show it.
 *
 *  `events` is exactly what this move appended to the log - not a diff
 *  recomputed by a reader. That is the whole point: "what just happened" is
 *  produced by whoever caused it, never guessed afterwards by comparing
 *  cursors. */
export interface Transition {
  next: GameState;
  events: GameEvent[];
  /** History. Commit it, present nothing: a boot, a deal, a rejoin. */
  settled: boolean;
}

/** What a transition does to the screen, injected so the queue can be tested
 *  with no DOM. Every hook reports completion through its `done` callback and
 *  never on a timer of its own. */
export interface Stages {
  /** Stage 1. The transient beats, against the board as it stood. */
  present(t: Transition, done: () => void): void;
  /** Stage 2. Commit has happened; repaint every persistent layer. */
  commit(state: GameState): void;
  /** Stage 3. Questions this transition raised, if any. */
  ask(t: Transition, done: () => void): void;
  /** Stage 4. The round summary, and its dismissal if it blocks. */
  summary(t: Transition, done: () => void): void;
  /** Stage 5. The ending, if this transition ended the run. */
  ending(t: Transition, done: () => void): void;
}

export interface TransitionQueue {
  /** The state on screen. Stays at the PREVIOUS state for the whole of a
   *  transition, so a beat that has not run has drawn nothing. */
  state(): GameState;
  /** Enqueue. Never blocks: a beat may submit a transition of its own and it
   *  simply lands behind the current one. */
  submit(t: Transition): void;
  /** History arriving whole. Cancels anything in flight under a new
   *  generation, drops the pending queue, and commits immediately. */
  replaceSettled(state: GameState): void;
  /** True while a transition is running or waiting to. Input gating asks
   *  this rather than tracking flights of its own. */
  busy(): boolean;
  /** How many transitions are waiting, the buffer the guest cap reads. */
  pending(): number;
}

export function createTransitionQueue(
  initial: GameState, stages: Stages,
): TransitionQueue;
```

- [ ] **Step 2: Write the failing tests**

Create `tests/transitions.test.ts`. These five are the contract; write them
before the implementation.

```ts
import { describe, it, expect } from "vitest";
import { createTransitionQueue, type Stages, type Transition } from "../src/transitions";
import type { GameState } from "../src/game";

/** A state distinguishable by one field. The queue never looks inside. */
const st = (turn: number) => ({ turn } as unknown as GameState);
const tr = (turn: number, over: Partial<Transition> = {}): Transition =>
  ({ next: st(turn), events: [], settled: false, ...over });

/** Stages that record the order they ran in and hand back a release for each,
 *  so a test can hold any stage open and inspect the world underneath it. */
function recorder() {
  const order: string[] = [];
  const holds: Record<string, (() => void)[]> = {
    present: [], ask: [], summary: [], ending: [],
  };
  const hook = (name: keyof typeof holds) => (_t: Transition, done: () => void) => {
    order.push(name);
    holds[name].push(done);
  };
  const stages: Stages = {
    present: hook("present"),
    commit: (s) => { order.push(`commit:${(s as unknown as {turn: number}).turn}`); },
    ask: hook("ask"),
    summary: hook("summary"),
    ending: hook("ending"),
  };
  const release = (name: keyof typeof holds) => {
    const fns = holds[name].splice(0, holds[name].length);
    for (const fn of fns) fn();
  };
  return { order, stages, release };
}

describe("the transition queue", () => {
  it("holds the displayed state at the previous one until the beats have run", () => {
    const { stages, release } = recorder();
    const q = createTransitionQueue(st(1), stages);
    q.submit(tr(2));
    // Stage 1 is running. The screen must still show the board the player
    // was last shown - this is the rule the whole spec turns on.
    expect(q.state().turn).toBe(1);
    release("present");
    expect(q.state().turn).toBe(2);
    release("ask"); release("summary"); release("ending");
  });

  it("runs the six stages in order and starts nothing until they finish", () => {
    const { order, stages, release } = recorder();
    const q = createTransitionQueue(st(1), stages);
    q.submit(tr(2));
    q.submit(tr(3));
    expect(order).toEqual(["present"]);
    release("present");
    expect(order).toEqual(["present", "commit:2", "ask"]);
    release("ask");
    release("summary");
    release("ending");
    // Only now may the second transition begin.
    expect(order).toEqual([
      "present", "commit:2", "ask", "summary", "ending", "present",
    ]);
  });

  it("commits a settled transition and presents nothing", () => {
    const { order, stages } = recorder();
    const q = createTransitionQueue(st(1), stages);
    q.submit(tr(9, { settled: true }));
    expect(q.state().turn).toBe(9);
    // Stages 1, 3 and 4 are skipped; the ending still gets its chance.
    expect(order).toEqual(["commit:9", "ending"]);
  });

  it("lets a stage submit a transition without deadlocking", () => {
    const { order, stages, release } = recorder();
    const q = createTransitionQueue(st(1), stages);
    let submitted = false;
    q.submit(tr(2));
    release("present");
    // An ask beat's answer commits a decision of its own while stage 3 holds.
    if (!submitted) { submitted = true; q.submit(tr(3)); }
    release("ask"); release("summary"); release("ending");
    expect(order.filter((o) => o === "present")).toHaveLength(2);
    expect(q.state().turn).toBe(3);
  });

  it("a settled replacement wins over a transition already in flight", () => {
    const { stages, release } = recorder();
    const q = createTransitionQueue(st(1), stages);
    q.submit(tr(2));
    q.submit(tr(5));
    // Stage 1 of transition 2 is still open when history arrives whole.
    q.replaceSettled(st(99));
    expect(q.state().turn).toBe(99);
    expect(q.pending()).toBe(0);
    // The stalled beat finishing later must not commit its stale `next`
    // over the snapshot, and must not start the dropped transition.
    release("present"); release("ask"); release("summary"); release("ending");
    expect(q.state().turn).toBe(99);
  });
});
```

- [ ] **Step 3: Run them to verify they fail**

Run: `npx vitest run tests/transitions.test.ts`
Expected: FAIL - `src/transitions.ts` does not exist.

- [ ] **Step 4: Implement `src/transitions.ts`**

The implementation is small; the care is all in the generation token. Write it
so that EVERY callback the queue hands out captures the generation it was
created under and returns without effect if the generation has moved.

Required behaviour, each of which one test above pins:
- `state()` returns the committed state, which changes only in stage 2.
- Stages run 1 to 6 in order, each waiting on the previous one's `done`.
- A `settled` transition runs stages 2, 5, 6 only.
- `submit` appends and returns immediately; if nothing is running, it starts
  the queue - but never re-entrantly from inside a stage that is still open.
- `replaceSettled` bumps the generation, clears pending, commits, then runs
  stage 5 for the settled state.
- A `done` from a superseded generation is a no-op: it neither commits nor
  advances the queue.
- Each `done` is idempotent; calling it twice must not run stage N+1 twice.

Do NOT import `./animate`, `./hud` or any DOM here. The queue knows nothing
about how a stage draws; that is the caller's business and is what makes this
file testable.

- [ ] **Step 5: Run the tests**

Run: `npx vitest run tests/transitions.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 6: Full suite and build**

Run: `npm test && npm run build`
Expected: PASS. Nothing imports the new module yet, so only the new file's own
tests are new.

- [ ] **Step 7: Commit**

```bash
git add 02-balticmap/src/transitions.ts 02-balticmap/tests/transitions.test.ts
git commit -m "feat(balticmap): one queue owns the state and the clock

A transition carries the state after it and exactly the events it appended,
and the screen holds the previous state until the beats explaining the move
have run. Six stages in order, nothing able to run past them, and a
generation token so history arriving whole makes a beat still in flight
inert rather than letting it commit over the snapshot."
```

---

### Task 2: `main.ts` stops owning the state

Move every mutation onto the queue with the lifecycle stages wired to the
existing surfaces, keeping today's visible behaviour. The deferred commit is
already live from Task 1, so this task is where its consequences land.

**Files:**
- Modify: `src/main.ts` - the `game` declaration and all assignment sites, the
  `refresh` body, `resumeChain`/`stepAiChain`/`finishChain`,
  `afterHumanAction`, `afterHumanPlay`, the boot path, the deck-screen
  callbacks, the net handlers
- Modify: `biome.json` at the repo root if a lint rule can express the ban

**Interfaces:**
- Consumes: `createTransitionQueue`, `Transition`, `Stages` from Task 1.
- Produces: `main.ts` with no assignable `game` binding.

- [ ] **Step 1: Replace the binding with the queue**

Delete `let game: GameState = ...` and create the queue in its place. Give
`main.ts` a single local reader so the ~200 existing `game.` references need
no rewrite beyond their accessor:

```ts
const transitions = createTransitionQueue(newGame(/* ...as today... */), stages);
/** The state on screen. Every reader in this file goes through here, and
 *  nothing in this file may assign it - `src/transitions.ts` owns it, so
 *  there is no local path that appends events without presenting them. */
const game = (): GameState => transitions.state();
```

Then mechanically rewrite `game.` to `game().` throughout `main.ts`. This is a
large but purely textual change; do it with care and let `tsc` find what you
missed.

- [ ] **Step 2: Route every mutation through `submit`**

The inventory lists every assignment site. For each, capture the log length
before the engine call and submit the result:

```ts
/** The one way this file moves the world. `events` is the slice this call
 *  appended, so nothing downstream has to diff cursors to learn what
 *  happened. */
function apply(mutate: (g: GameState) => GameState, settled = false): void {
  const before = game();
  const next = mutate(before);
  transitions.submit({
    next, events: next.log.slice(before.log.length), settled,
  });
}
```

Sites that build a whole new world rather than moving the current one - the
boot path, `startStagingRun`, `tryDeal`, the guest's `start`/`snapshot`
handlers - call `transitions.replaceSettled(state)` instead. Getting this
split right is the task: a state this screen played into is a transition, and
a state that arrived whole is settled history.

- [ ] **Step 3: Wire the stages to the existing surfaces**

For this task the stages keep today's behaviour, so the change is
observable-free. Task 3 and 4 move the summary and ending into them properly.

- `present`: run the existing replay path, calling `done` on
  `animations.onIdle`.
- `commit`: the body of today's `refresh`, minus `hud.update`'s summary work.
- `ask`: call `done` immediately for now; Task 4 fills it in.
- `summary`: call `done` immediately for now; Task 4 fills it in.
- `ending`: call `done` immediately for now; Task 4 fills it in.

- [ ] **Step 4: Ban the binding structurally**

`noRestrictedImports` cannot forbid an assignment. What it CAN do is stop
`main.ts` importing the engine mutators directly, which is the same protection
one level up - the root `biome.json` already does this for `playCard`,
`discardCard`, `endTurn`, `transferDefense` and `surrender`. Extend that list
with `advance`, `startGame`, `chooseBuild`, `chooseRules`, `pickFaction` and
`applyBootParams` so those calls must go through the `apply` helper or
`src/decisions.ts`.

If a call genuinely cannot be routed, do NOT weaken the rule - report it and
stop. A hole here is the whole point of the task.

- [ ] **Step 5: Play it**

Run `npm run dev` from `02-balticmap`, read the actual port from its output,
and play a real turn: play a card, end the turn, watch a round resolve, take a
conquest if one offers. Then load
`?seed=4&faction=selonians&build=warpath&turns=6` and confirm a booted run
paints once, silently, with no replay of its history.

Everything must look exactly as it did before this task. Write down what you
checked and what you saw. Stop the dev server when done.

- [ ] **Step 6: Full suite, build, commit**

```bash
npm test && npm run build
git add 02-balticmap/src/main.ts biome.json
git commit -m "refactor(balticmap): the screen no longer owns the world

main.ts held an assignable game binding and fifteen places moved it, so
what the player was shown depended on which repaint happened to notice.
The queue owns the state now and main.ts reads it through an accessor;
every mutation submits a transition carrying exactly the events it
appended."
```

---

### Task 3: The AI chain becomes transitions

**Files:** Modify `src/main.ts` (`resumeChain`, `stepAiChain`, `finishChain`,
`afterHumanAction`, `afterHumanPlay`, `resolving`).

- [ ] **Step 1: Replace the chain's hand-rolled waiting**

`stepAiChain` currently plays a seat, calls `refresh`, then waits on
`animations.onIdle` with a `setTimeout(0)` to avoid recursion. With the queue,
each AI seat is one `submit` and the queue's own ordering does the waiting.
Rewrite it so a seat's transition is submitted and the next seat is driven from
the queue draining, not from an animation callback.

- [ ] **Step 2: `resolving` becomes a question, not a flag**

Every read of `resolving` is asking "may the player act right now". That is
`transitions.busy()` plus "a remote seat holds the turn". Replace the flag with
one predicate and delete the flag. Keep the remote-seat arm - `finishChain`
sets `resolving` for a remote turn and that is a different fact from the queue
being busy.

- [ ] **Step 3: Play it, then commit**

Same browser pass as Task 2, plus: end a turn and confirm the AI seats resolve
one at a time with their animations, and that input is locked throughout. Run
`npm test && npm run build`, commit with explicit paths.

---

### Task 4: The summary and the ending become stages

**Files:** Modify `src/hud.ts` (retire `settleTurn`, `pendingSummary`,
`idleSettleArmed`, `pendingContinuation`; `afterPlayAnimation` reduced to its
watchdog role), `src/main.ts` (the `summary` and `ending` stages,
`cueEndingIfAny`).

- [ ] **Step 1: Move the summary into stage 4**

`showRoundSummaryIfAny` currently parks the summary while the queue is busy and
`settleTurn` re-arms on `animations.onIdle`. Stage 4 is that, structurally: it
runs after the commit and its `done` fires on dismissal. Delete the parking
machinery rather than calling it from the stage.

- [ ] **Step 2: Move the ending into stage 5**

Today `cueEndingIfAny` fires from `refresh` off the committed phase and
`hud.update` shows the postmortem whenever the phase is `victory` or `defeat`.
Both move into stage 5, so an ending is raised by the transition that caused it
rather than by whichever repaint first notices. The postmortem stops being
derived from `phase` in `hud.update`; give the HUD an explicit call.

- [ ] **Step 3: The test that would have caught the old bug**

`tests/hud-animation-gate.test.ts:150` asserts a continuation fires at once
when nothing flew. That behaviour is preserved - a transition with no beats
runs straight through - so keep the test. Add the case it never covered: no
card flies, but a beat is queued, and the next transition must wait.

Add to `tests/transitions.test.ts` a test that a transition whose events end
the run raises the ending only after its beats, questions and summary have all
completed.

- [ ] **Step 4: Play it, then commit**

Browser pass: win or concede a run and confirm the postmortem appears only
after everything that ended it has been shown, and that "View the map" behind
it shows a board with no march still standing. Run `npm test && npm run build`.

---

### Task 5: Questions after the commit

**Files:** Modify `src/main.ts` (`askTransferIfPending`, `raiseTransferModal`,
`queueTransferQuestion`, `replayActive`, the `ask` stage).

- [ ] **Step 1: Fill in stage 3**

The conquest question is raised here and nowhere else. It re-frames its land
before raising the modal, so the question still follows the picture of the
thing it asks about. Its `done` fires when the player answers.

- [ ] **Step 2: Delete the second door**

`askTransferIfPending`'s call from `refresh` and the `replayActive` flag that
suppresses it both go. One raiser, one place.

- [ ] **Step 3: The correctness test**

A question raised before the commit asks about a conquest the state accessor
says has not happened, and `commitDecision` refuses the answer. Add a test that
an `ask` stage sees the committed state - the conquest is present in
`state()` by the time stage 3 runs.

- [ ] **Step 4: Play it, then commit**

Browser pass: take a land by raid and answer the transfer modal. Confirm the
answer is accepted, the defenders move, and the modal appeared after the
capture was shown rather than before it.

---

### Task 6: The guest buffers, and the cap collapses

**Files:** Modify `src/main.ts` (the `start`/`update`/`snapshot` handlers),
`src/transitions.ts` (the cap).

- [ ] **Step 1: Guest updates become transitions**

An `update` message carries `newEvents` and `logFrom` already, so the guest's
intake is `submit({ next, events: msg.newEvents, settled: false })`. A `start`
or `snapshot` is `replaceSettled`.

- [ ] **Step 2: The cap**

12 transitions, collapsing to the newest through `replaceSettled` - cancellation
and all. Twelve because a transition is roughly one seat's turn and five
factions act, so the cap is about two rounds behind.

- [ ] **Step 3: Tests**

In `tests/transitions.test.ts`: a buffer past the cap collapses to the newest
and presents nothing, and no superseded beat can commit behind it.

- [ ] **Step 4: The two-session browser pass**

Two Chrome tabs over the real broker. Host a game, join from the second tab
using the `?join=` link the host panel prints, deal, and play several rounds.
Confirm both seats show the same sequence, neither overlaps nor skips it,
input on the guest is locked while its buffer drains, and no console errors on
either tab. This is the pass the user asked for by name; do not skip it and do
not report a pass you did not observe.

---

## Self-Review

**Spec coverage.** Sections 1, 2, 3 (the lifecycle half), 7 and 8 of the design
spec. Section 3's classifier and section 4's audience gate are step 3 of the
order of work; sections 5 and 6 are step 1 (done) and step 4.

**Placeholders.** Tasks 3 to 6 give requirements and call sites rather than
literal code, because they are relocations of existing bodies that the
inventory quotes in full - the implementer must move real code, not write new
code from a snippet. Task 1, which creates new code, gives it literally.

**Type consistency.** `Transition`, `Stages` and `TransitionQueue` are defined
in Task 1 and imported unchanged by Tasks 2 to 6. `game` becomes a function in
Task 2 and stays one.

**Known risk.** Task 2 is the largest and touches the most call sites. If it
cannot be landed with the game still playable, split it: the accessor rewrite
first, the `submit` routing second.
