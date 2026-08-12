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
 *  `commit`, since there is nothing to present: it was never watched happen. */
const LIVE_STAGES = ["present", "commit", "ask", "summary", "ending"] as const;
const SETTLED_STAGES = ["commit", "ending"] as const;

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
 *  after being superseded, so every stage's `done` closes over the
 *  generation it was handed out under and is a no-op once that generation
 *  has moved on. Nothing here reads a clock or an rng; ordering is entirely
 *  driven by the `done` calls a caller chooses to make, which is what keeps
 *  this module testable with no timers and no DOM. */
export function createTransitionQueue(
  initial: GameState, stages: Stages,
): TransitionQueue {
  let committed = initial;
  let generation = 0;
  let running: Transition | null = null;
  const queue: Transition[] = [];

  /** Runs `names[i]` for `t` and, once it reports itself finished, recurses
   *  onto `i + 1` - `commit` has no `done` of its own and simply falls
   *  through in the same call, every other stage falls through from inside
   *  the `done` it was handed. That `done` is guarded on two axes: it must
   *  speak for the generation it was minted under, or a stage superseded by
   *  `replaceSettled` reporting in late must do nothing at all; and it must
   *  fire at most once, or a stage calling it twice would run the stage
   *  after it twice as well. */
  function runStage(
    t: Transition, gen: number, names: readonly string[], i: number,
  ): void {
    if (gen !== generation) return;
    if (i >= names.length) { complete(gen); return; }
    const name = names[i];
    if (name === "commit") {
      committed = t.next;
      stages.commit(t.next);
      runStage(t, gen, names, i + 1);
      return;
    }
    let fired = false;
    const done = (): void => {
      if (fired) return;
      fired = true;
      if (gen !== generation) return;
      runStage(t, gen, names, i + 1);
    };
    const hook = stages[name as "present" | "ask" | "summary" | "ending"];
    hook(t, done);
  }

  function complete(gen: number): void {
    if (gen !== generation) return;
    running = null;
    drain();
  }

  /** Starts the front of the queue when nothing is running. Called only from
   *  `submit` (when the queue was idle) and from `complete` (a stage's own
   *  `done`, never from inside a stage that is still open) - never
   *  re-entrantly out of a hook that has not yet released. */
  function drain(): void {
    if (running !== null) return;
    const next = queue.shift();
    if (next === undefined) return;
    running = next;
    const names: readonly string[] = next.settled ? SETTLED_STAGES : LIVE_STAGES;
    runStage(next, generation, names, 0);
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
      // so it fails the check in `runStage` and neither commits its stale
      // `next` over this snapshot nor advances a queue that no longer runs.
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
