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
  /** How the commit paints this move. Absent is the ordinary animating
   *  paint; `{ animate: false }` renders the state as already-settled - no
   *  card flies and no round summary rises - which is what a whole game
   *  arriving at once needs.
   *
   *  It rides on the transition rather than in a binding beside the queue
   *  because a binding is inherited: a live transition submitted from inside
   *  a settled commit would drain while the flag was still set and be painted
   *  in silence. A field cannot leak from one transition to another. */
  paint?: { animate?: boolean };
}

/** What a transition does to the screen, injected so the queue can be tested
 *  with no DOM. Every hook reports completion through its `done` callback and
 *  never on a timer of its own. */
export interface Stages {
  /** Stage 1. The transient beats, against the board as it stood. */
  present(t: Transition, done: () => void): void;
  /** Stage 2. Commit has happened; repaint every persistent layer. Handed
   *  the whole transition, not just the state, because how a move is painted
   *  is the transition's own (`Transition.paint`). */
  commit(t: Transition): void;
  /** Stage 3. Questions this transition raised, if any. */
  ask(t: Transition, done: () => void): void;
  /** Stage 4. The round summary, and its dismissal if it blocks. */
  summary(t: Transition, done: () => void): void;
  /** Stage 5. The ending, if this transition ended the run. */
  ending(t: Transition, done: () => void): void;
}

export interface TransitionQueue {
  /** The state on screen. Stays at the PREVIOUS state for the whole of a
   *  transition, so a beat that has not run has drawn nothing. For RENDERING,
   *  and for nothing else - see `latest`. */
  state(): GameState;
  /** The state after everything submitted so far, on screen or not. The
   *  authoritative world: what the next move is made from and what the wire
   *  carries.
   *
   *  It exists because `state()` lags by however long a transition takes to
   *  show itself, and a mutation based on a lagging state is a mutation that
   *  throws away everything submitted since. Two ways that bites, both real:
   *  a move computed from the displayed state commits OVER the one still
   *  being presented, erasing it from the board for good; and a snapshot sent
   *  to another screen from the displayed state hands it a board older than
   *  the one it already has, with no events to explain the difference.
   *
   *  So: mutations and the wire read this, rendering reads `state()`. They
   *  are the same object whenever the queue is idle, which is most of the
   *  time and is exactly why the distinction has to be written down rather
   *  than noticed. */
  latest(): GameState;
  /** Enqueue. Never blocks: a beat may submit a transition of its own and it
   *  simply lands behind the current one. */
  submit(t: Transition): void;
  /** History arriving whole. Cancels anything in flight under a new
   *  generation, drops the pending queue and every idle waiter, and commits
   *  immediately. */
  replaceSettled(state: GameState, paint?: { animate?: boolean }): void;
  /** True while a transition is running or waiting to. Input gating asks
   *  this rather than tracking flights of its own. */
  busy(): boolean;
  /** Runs `fn` once every transition submitted so far has finished all six
   *  stages. Fires immediately when the queue is already empty, so a caller
   *  that has to read the committed state after submitting always waits on
   *  the same call whether or not the move had anything to show.
   *
   *  This is what a continuation is: the host's AI chain steps a seat here,
   *  and a decision's aftermath repaints here, rather than either of them
   *  watching the animation queue for a beat it does not own. A waiter that
   *  submits is fine - it lands behind nothing and starts at once - but a
   *  waiter that unconditionally re-arms never returns, the same as
   *  `AnimationQueue.onIdle`. */
  onIdle(fn: () => void): void;
  /** How many transitions are waiting, the buffer the guest cap reads. */
  pending(): number;
}

/** The stages a non-settled transition runs, in order. A settled transition
 *  (history arriving whole - a boot, a deal, a rejoin) skips straight to
 *  `commit`, since there is nothing to present: it was never watched happen.
 *  Typed against `keyof Stages` rather than `string` so indexing `stages` by
 *  a name drawn from this list needs no cast - a typo here is a compile
 *  error instead of a runtime "undefined is not a function" five tasks away. */
const LIVE_STAGES: readonly (keyof Stages)[] =
  ["present", "commit", "ask", "summary", "ending"];
const SETTLED_STAGES: readonly (keyof Stages)[] = ["commit", "ending"];

/** `createTransitionQueue` runs each submitted transition through six stages
 *  - present, commit, ask, summary, ending, complete - never starting one
 *  before the previous has finished all six. `state()` answers with the
 *  displayed state, which only moves at stage 2: the whole reason this module
 *  exists is that a beat which has not run yet must not have anything to show
 *  for it already on screen, and the only way to guarantee that is for the
 *  commit itself to wait behind the beats explaining it.
 *
 *  Cancellation (`replaceSettled`) is best-effort on the DOM side and
 *  authoritative on the bookkeeping side: a stage can report `done` a tick
 *  after being superseded, so every recursive step into the next stage is
 *  gated on `gen === generation` at the top of `runStage`. That is the ONE
 *  place the check belongs, and it belongs there rather than inside `done`
 *  because `commit` has no `done` of its own: it falls through to the next
 *  stage in the same call, so a check written into `done` alone would not
 *  stand between a stale generation and a stale commit. At `runStage`'s
 *  entry it guards every edge unconditionally - a late `done`, and the
 *  fall-through out of `commit` alike.
 *
 *  Nothing here reads a clock or an rng; ordering is entirely driven by the
 *  `done` calls a caller chooses to make, which is what keeps this module
 *  testable with no timers and no DOM. */
export function createTransitionQueue(
  initial: GameState, stages: Stages,
): TransitionQueue {
  let committed = initial;
  /** The newest state submitted, which is `committed` plus everything still
   *  waiting to be shown. Moved at SUBMIT time rather than at commit, because
   *  the whole point of it is to answer for moves the screen has not caught
   *  up with yet. */
  let latest = initial;
  let generation = 0;
  let running: Transition | null = null;
  const queue: Transition[] = [];
  /** Waiters armed by `onIdle`, fired and emptied the moment nothing is
   *  running and nothing is queued. */
  const idle: (() => void)[] = [];
  // True only while `drain`'s own loop is on the call stack. It is what lets
  // a transition that finishes every stage synchronously hand off to the
  // next queued transition by looping rather than recursing - see `drain`.
  let draining = false;

  /** Runs `names[i]` for `t` and, once it reports itself finished, recurses
   *  onto `i + 1` - `commit` has no `done` of its own and falls through in
   *  the same call; every other stage falls through from inside the `done`
   *  it was handed, guarded so a stage calling it twice cannot run the stage
   *  after it twice as well. Reaching the end hands control back to `drain`
   *  rather than starting the next transition itself, which is what keeps a
   *  long run of synchronously-finishing transitions from nesting one stack
   *  frame per transition. */
  function runStage(
    t: Transition, gen: number, names: readonly (keyof Stages)[], i: number,
  ): void {
    if (gen !== generation) return;
    if (i >= names.length) {
      running = null;
      drain();
      return;
    }
    const name = names[i];
    if (name === "commit") {
      committed = t.next;
      // A repaint must not leave the queue believing a transition is still
      // in flight - the same doctrine as the stage hooks below, applied to
      // the one stage with no `done` of its own to fall back on.
      try {
        stages.commit(t);
      } catch {
        // no recovery to attempt: the state is already committed, and the
        // lifecycle simply carries on to the next stage.
      }
      runStage(t, gen, names, i + 1);
      return;
    }
    let fired = false;
    const done = (): void => {
      if (fired) return;
      fired = true;
      runStage(t, gen, names, i + 1);
    };
    const hook = stages[name];
    // A stage that throws must release the queue rather than wedging it -
    // the same rule `createAnimationQueue` already keeps in src/animate.ts.
    // `busy()` is the whole app's input gate, so a hook that throws and
    // leaves `running` set would lock input with no way back short of a
    // reload.
    try {
      hook(t, done);
    } catch {
      done();
    }
  }

  /** Starts the front of the queue when nothing is running, as a loop rather
   *  than recursion, and fires the idle waiters when there is nothing left to
   *  start. A transition whose every stage completes synchronously
   *  (present, ask, summary and ending all calling `done` immediately - the
   *  normal shape of a transition with no beats, no question, no summary and
   *  no ending) reaches `i >= names.length` from deep inside `runStage`'s own
   *  recursion for THAT transition, and hands back here to start the next
   *  one. `draining` is what makes that handover a sibling iteration rather
   *  than a deeper stack frame: the nested call sees the flag already set and
   *  returns at once, unwinding to the `while` below, which picks the next
   *  transition up. Without it a run of synchronously-finishing transitions
   *  nests one frame per transition, without bound. */
  function drain(): void {
    if (draining) return;
    draining = true;
    try {
      while (running === null) {
        const next = queue.shift();
        if (next === undefined) {
          // Nothing left to start: the queue is idle, which is what a waiter
          // asked to be told. Taken as a batch and looped rather than
          // returned from, because a waiter may submit - the AI chain's next
          // seat does exactly that - and that transition must start here, as
          // a sibling iteration, rather than one frame deeper.
          const waiting = idle.splice(0, idle.length);
          if (waiting.length === 0) return;
          for (const fn of waiting) fn();
          continue;
        }
        running = next;
        const names = next.settled ? SETTLED_STAGES : LIVE_STAGES;
        runStage(next, generation, names, 0);
      }
    } finally {
      draining = false;
    }
  }

  return {
    state() {
      return committed;
    },
    latest() {
      return latest;
    },
    submit(t) {
      latest = t.next;
      queue.push(t);
      drain();
    },
    replaceSettled(state, paint) {
      // Bumping the generation first is what makes a `done` still held by
      // the transition this replaces inert: it captured the old generation,
      // so it fails the check at the top of `runStage` and neither commits
      // its stale `next` over this snapshot nor advances a queue that no
      // longer runs.
      generation += 1;
      queue.length = 0;
      // The waiters go with the queue. A continuation armed against the run
      // this snapshot replaces - the next AI seat, a repaint of a board that
      // no longer exists - would otherwise fire against the new world.
      idle.length = 0;
      // History arriving whole IS the authoritative world: everything
      // submitted before it has been dropped, so nothing may be made from it.
      latest = state;
      const t: Transition = { next: state, events: [], settled: true, paint };
      running = t;
      runStage(t, generation, SETTLED_STAGES, 0);
    },
    busy() {
      return running !== null || queue.length > 0;
    },
    onIdle(fn) {
      idle.push(fn);
      drain();
    },
    pending() {
      return queue.length;
    },
  };
}
