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
 *  gated on `gen === generation` at the top of `runStage` - the ONE check
 *  that matters, since it runs on every entry regardless of which edge got
 *  there: a `done` callback firing late, or the synchronous fall-through out
 *  of `commit`. A second copy of this check used to live inside `done` as
 *  well; it was dead weight; `commit`'s own fall-through never passed
 *  through a `done` at all, so the copy inside `done` could never be the
 *  thing standing between a stale generation and a stale commit - the check
 *  at the top of `runStage` already was, on every path, unconditionally.
 *
 *  Nothing here reads a clock or an rng; ordering is entirely driven by the
 *  `done` calls a caller chooses to make, which is what keeps this module
 *  testable with no timers and no DOM. */
export function createTransitionQueue(
  initial: GameState, stages: Stages,
): TransitionQueue {
  let committed = initial;
  let generation = 0;
  let running: Transition | null = null;
  const queue: Transition[] = [];
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
        stages.commit(t.next);
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
   *  than recursion: a transition whose every stage completes synchronously
   *  (present, ask, summary and ending all calling `done` immediately - the
   *  normal shape of a transition with no beats, no question, no summary and
   *  no ending) reaches `i >= names.length` from deep inside `runStage`'s own
   *  recursion for THAT transition, and used to call `drain` again from
   *  there to start the next one - nesting one more stack frame per
   *  transition, without bound, for as many transitions as complete in a
   *  row. `draining` turns that into a loop instead: the nested call made
   *  from inside `runStage` sees `draining` already true and returns at
   *  once, unwinding back to the `while` below - which is a sibling
   *  iteration, not a deeper frame - to pick up the next transition. */
  function drain(): void {
    if (draining) return;
    draining = true;
    try {
      while (running === null) {
        const next = queue.shift();
        if (next === undefined) return;
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
    submit(t) {
      queue.push(t);
      drain();
    },
    replaceSettled(state) {
      // Bumping the generation first is what makes a `done` still held by
      // the transition this replaces inert: it captured the old generation,
      // so it fails the check at the top of `runStage` and neither commits
      // its stale `next` over this snapshot nor advances a queue that no
      // longer runs.
      generation += 1;
      queue.length = 0;
      const t: Transition = { next: state, events: [], settled: true };
      running = t;
      runStage(t, generation, SETTLED_STAGES, 0);
    },
    busy() {
      return running !== null || queue.length > 0;
    },
    pending() {
      return queue.length;
    },
  };
}
