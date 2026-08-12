import { describe, it, expect } from "vitest";
import {
  createTransitionQueue, type Stages, type Transition, type TransitionQueue,
} from "../src/transitions";
import type { GameState } from "../src/game";

/** A state distinguishable by one field. The queue never looks inside. */
const st = (turn: number) => ({ turn } as unknown as GameState);
const tr = (turn: number, over: Partial<Transition> = {}): Transition =>
  ({ next: st(turn), events: [], settled: false, ...over });

/** A settable box for a callback a stage hands out mid-test. A bare `let`
 *  reassigned only from inside a stage hook does not work for this: calling
 *  `q.submit(...)` is an opaque call as far as TypeScript's narrowing is
 *  concerned, so it cannot see that the call may, deep inside, run a closure
 *  that reassigns the variable - the read afterward stays narrowed to the
 *  `null` the `let` was declared with. A property on an object carries no
 *  such narrowing, which is also why `recorder` below pushes into an array
 *  rather than assigning a bare variable. */
function box<T>(): { value: T | null } {
  return { value: null };
}

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
    commit: (t) => { order.push(`commit:${(t.next as unknown as {turn: number}).turn}`); },
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

  it("raises the ending only once the beats, the question and the summary are done", () => {
    // The run-ending move is the one that most obviously must not be shown
    // out of order: an ending raised at the commit rises over the marches
    // still landing and the conquest question still unanswered, and "View the
    // map" behind it shows a board with arrows on it that never resolved.
    // Stage 5 is last, so each stage in turn is enough to hold it.
    const { order, stages, release } = recorder();
    const q = createTransitionQueue(st(1), stages);
    q.submit(tr(2, { events: [{ type: "victory" }] as never }));
    expect(order).not.toContain("ending");
    release("present"); // the marches have landed
    expect(order).not.toContain("ending");
    release("ask"); // the defenders are in
    expect(order).not.toContain("ending");
    release("summary"); // the round's news has been read
    expect(order).toEqual([
      "present", "commit:2", "ask", "summary", "ending",
    ]);
    // And the ending itself holds the queue: nothing runs behind a postmortem.
    q.submit(tr(3));
    expect(order.filter((o) => o === "present")).toHaveLength(1);
    release("ending");
    expect(order.filter((o) => o === "present")).toHaveLength(2);
    release("present"); release("ask"); release("summary"); release("ending");
  });

  it("commits a settled transition and presents nothing", () => {
    const { order, stages } = recorder();
    const q = createTransitionQueue(st(1), stages);
    q.submit(tr(9, { settled: true }));
    expect(q.state().turn).toBe(9);
    // Stages 1, 3 and 4 are skipped; the ending still gets its chance.
    expect(order).toEqual(["commit:9", "ending"]);
  });

  it("answers with the newest submitted state while the screen still lags", () => {
    // The distinction the whole wire rides on: a move is made from `latest`
    // and drawn from `state`. Read the wrong one and the next move is made
    // from a board that has already been overtaken, throwing away everything
    // submitted since - which is what a second play, or a push to another
    // screen, would do.
    const { stages, release } = recorder();
    const q = createTransitionQueue(st(1), stages);
    expect(q.latest().turn).toBe(1);
    q.submit(tr(2));
    q.submit(tr(3));
    expect(q.state().turn).toBe(1);
    expect(q.latest().turn).toBe(3);
    release("present");
    expect(q.state().turn).toBe(2);
    expect(q.latest().turn).toBe(3);
    release("ask"); release("summary"); release("ending");
    release("present"); release("ask"); release("summary"); release("ending");
    expect(q.state().turn).toBe(3);
    expect(q.latest().turn).toBe(3);
  });

  it("a settled replacement is the authoritative state as well as the drawn one", () => {
    const { stages, release } = recorder();
    const q = createTransitionQueue(st(1), stages);
    q.submit(tr(2));
    q.submit(tr(5));
    q.replaceSettled(st(99));
    expect(q.latest().turn).toBe(99);
    // The dropped transitions must not come back through the accessor a
    // caller builds its next move from.
    release("present"); release("ask"); release("summary"); release("ending");
    expect(q.latest().turn).toBe(99);
  });

  it("hands the commit the paint intent its own transition carried", () => {
    // The intent rides on the transition and not in a binding beside the
    // queue, so a silent paint cannot be inherited by the move after it.
    const painted: (boolean | undefined)[] = [];
    const stages: Stages = {
      present: (_t, done) => done(),
      commit: (t) => { painted.push(t.paint?.animate); },
      ask: (_t, done) => done(),
      summary: (_t, done) => done(),
      ending: (_t, done) => done(),
    };
    const q = createTransitionQueue(st(1), stages);
    q.replaceSettled(st(2), { animate: false });
    q.submit(tr(3));
    expect(painted).toEqual([false, undefined]);
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
    // Transition 3's own present beat must still run before it commits -
    // "starts nothing until they finish" applies to it too, not only to the
    // transition that happened to submit it.
    release("present");
    expect(q.state().turn).toBe(3);
    release("ask"); release("summary"); release("ending");
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

  it("busy() is true while a transition is in flight and false once the queue drains", () => {
    const { stages, release } = recorder();
    const q = createTransitionQueue(st(1), stages);
    expect(q.busy()).toBe(false);
    q.submit(tr(2));
    expect(q.busy()).toBe(true);
    release("present");
    expect(q.busy()).toBe(true); // commit ran; ask now holds it open
    release("ask"); release("summary"); release("ending");
    expect(q.busy()).toBe(false);
  });

  it("a stage that throws releases the queue rather than wedging it", () => {
    // The same doctrine `createAnimationQueue` already keeps in
    // src/animate.ts: a step that throws still frees the queue for the next
    // one. `busy()` is the app's input gate, so a hook left unreleased here
    // would lock input behind a reload rather than the mistaken card play or
    // render that actually threw.
    const q = createTransitionQueue(st(1), {
      present: (_t, done) => done(),
      commit: () => {},
      ask: () => { throw new Error("boom"); },
      summary: (_t, done) => done(),
      ending: (_t, done) => done(),
    });
    expect(() => q.submit(tr(2))).not.toThrow();
    expect(q.state().turn).toBe(2); // commit already happened before ask threw
    expect(q.busy()).toBe(false);
    expect(q.pending()).toBe(0);
  });

  it("a long cascade of synchronously-finishing transitions does not grow the call stack", () => {
    // A transition with no beats, no question, no summary and no ending is
    // the NORMAL shape of one, not an exotic case - and every one of those
    // stages calling `done` immediately is exactly what such a transition
    // looks like here. Queue thousands behind one held transition, then
    // release it: the whole cascade must run as sibling loop iterations, not
    // as one transition's completion nested inside the last, or this throws
    // a RangeError long before reaching the count a real guest buffer catch-up
    // could plausibly produce.
    const COUNT = 5000;
    const firstDone = box<() => void>();
    let started = 0;
    const stages: Stages = {
      present: (_t, done) => {
        started++;
        if (started === 1) { firstDone.value = done; return; } // held; released below
        done(); // every later transition completes immediately
      },
      commit: () => {},
      ask: (_t, done) => done(),
      summary: (_t, done) => done(),
      ending: (_t, done) => done(),
    };
    const q = createTransitionQueue(st(0), stages);
    for (let turn = 1; turn <= COUNT; turn++) q.submit(tr(turn));
    expect(q.pending()).toBe(COUNT - 1);
    expect(() => firstDone.value?.()).not.toThrow();
    expect(q.state().turn).toBe(COUNT);
    expect(q.pending()).toBe(0);
    expect(q.busy()).toBe(false);
  });
});

describe("waiting for the queue to drain", () => {
  it("fires an idle waiter at once when nothing is running", () => {
    const { stages } = recorder();
    const q = createTransitionQueue(st(1), stages);
    let fired = 0;
    q.onIdle(() => { fired++; });
    expect(fired).toBe(1);
  });

  it("holds an idle waiter until every queued transition has finished", () => {
    const { stages, release } = recorder();
    const q = createTransitionQueue(st(1), stages);
    q.submit(tr(2));
    q.submit(tr(3));
    let fired = 0;
    q.onIdle(() => { fired++; });
    release("present"); release("ask"); release("summary"); release("ending");
    expect(fired).toBe(0); // transition 3 has begun
    release("present"); release("ask"); release("summary"); release("ending");
    expect(fired).toBe(1);
  });

  it("starts a waiter's own transition as a sibling rather than nesting it", () => {
    // The AI chain's shape: each seat is submitted by the waiter the seat
    // before it armed. Every stage here finishes synchronously, so a chain
    // that nested one frame per seat would grow the stack for the length of
    // the round.
    const { order, stages } = recorder();
    const sync: Stages = {
      ...stages,
      present: (_t, done) => { order.push("present"); done(); },
      ask: (_t, done) => done(),
      summary: (_t, done) => done(),
      ending: (_t, done) => done(),
    };
    const q = createTransitionQueue(st(0), sync);
    let seat = 0;
    const step = (): void => {
      seat += 1;
      if (seat > 3) return;
      q.submit(tr(seat));
      q.onIdle(step);
    };
    step();
    expect(q.state().turn).toBe(3);
    expect(q.busy()).toBe(false);
  });

  it("drops the waiters a settled replacement supersedes", () => {
    // A continuation armed against the run being replaced - the next AI seat,
    // a repaint of a board that no longer exists - must not fire against the
    // world that replaced it.
    const { stages, release } = recorder();
    const q = createTransitionQueue(st(1), stages);
    q.submit(tr(2));
    let fired = 0;
    q.onIdle(() => { fired++; });
    q.replaceSettled(st(99));
    release("present"); release("ask"); release("summary"); release("ending");
    expect(fired).toBe(0);
    expect(q.state().turn).toBe(99);
  });
});

describe("the safety properties a superseded or double-fired callback must not break", () => {
  it("a stale present done fired twice after replaceSettled never commits the superseded state", () => {
    const commits: number[] = [];
    const staleDone = box<() => void>();
    const stages: Stages = {
      present: (_t, done) => { staleDone.value = done; }, // held - never fires on its own
      commit: (t) => { commits.push((t.next as unknown as { turn: number }).turn); },
      ask: (_t, done) => done(),
      summary: (_t, done) => done(),
      ending: (_t, done) => done(),
    };
    const q = createTransitionQueue(st(1), stages);
    q.submit(tr(2));
    q.replaceSettled(st(99));
    expect(commits).toEqual([99]);
    staleDone.value?.();
    staleDone.value?.();
    expect(commits).toEqual([99]);
    expect(q.state().turn).toBe(99);
  });

  it("a stale ask done fired twice after replaceSettled never commits the superseded state", () => {
    const commits: number[] = [];
    let summaryCalls = 0;
    const staleDone = box<() => void>();
    const stages: Stages = {
      present: (_t, done) => done(),
      commit: (t) => { commits.push((t.next as unknown as { turn: number }).turn); },
      ask: (_t, done) => { staleDone.value = done; }, // held - never fires on its own
      // A settled transition never reaches `summary` (SETTLED_STAGES skips
      // it) - so ANY call here can only mean the stale `ask` above escaped
      // past its own dead transition and ran on into the next stage. That is
      // the failure a check on `commits` alone would miss: continuing from
      // `ask` recurses to `summary`, not back to `commit`, so a superseded
      // `ask` running on leaves no second entry in `commits` at all.
      summary: (_t, done) => { summaryCalls++; done(); },
      ending: (_t, done) => done(),
    };
    const q = createTransitionQueue(st(1), stages);
    q.submit(tr(2));
    expect(commits).toEqual([2]);
    q.replaceSettled(st(50));
    expect(commits).toEqual([2, 50]);
    staleDone.value?.();
    staleDone.value?.();
    expect(summaryCalls).toBe(0);
    expect(commits).toEqual([2, 50]);
    expect(q.state().turn).toBe(50);
  });

  it("a transition superseded mid-commit does not reach its own next stage", () => {
    // `commit` has no `done` of its own, so its fall-through into the next
    // stage is guarded by the SAME check that guards every `done` - the one
    // at the top of `runStage`. This is the one path a `done`-side check
    // could never have covered, since there is no `done` on this edge to
    // hold the guard: something else - a repaint side effect, in the real
    // app - triggers the snapshot from directly inside `commit` itself.
    let askCalls = 0;
    const queueRef = box<TransitionQueue>();
    const stages: Stages = {
      present: (_t, done) => done(),
      commit: (t) => {
        if ((t.next as unknown as { turn: number }).turn === 2) {
          queueRef.value?.replaceSettled(st(99));
        }
      },
      ask: () => { askCalls++; },
      summary: (_t, done) => done(),
      ending: (_t, done) => done(),
    };
    const q = createTransitionQueue(st(1), stages);
    queueRef.value = q;
    q.submit(tr(2));
    expect(askCalls).toBe(0);
    expect(q.state().turn).toBe(99);
  });

  it("a stale done fired while a later transition is mid-flight does not disturb it", () => {
    const commits: number[] = [];
    const staleDone = box<() => void>();
    const laterDone = box<() => void>();
    let presentCalls = 0;
    const stages: Stages = {
      present: (_t, done) => {
        presentCalls++;
        if (presentCalls === 1) { staleDone.value = done; return; } // transition 2
        laterDone.value = done; // transition 3
      },
      commit: (t) => { commits.push((t.next as unknown as { turn: number }).turn); },
      ask: (_t, done) => done(),
      summary: (_t, done) => done(),
      ending: (_t, done) => done(),
    };
    const q = createTransitionQueue(st(1), stages);
    q.submit(tr(2));
    q.replaceSettled(st(99));
    q.submit(tr(3));
    expect(commits).toEqual([99]);
    expect(laterDone.value).not.toBeNull(); // transition 3 has started, held at present
    staleDone.value?.(); // transition 2's present, fired late
    expect(commits).toEqual([99]); // transition 3 untouched
    laterDone.value?.();
    expect(commits).toEqual([99, 3]);
    expect(q.state().turn).toBe(3);
  });

  it("calling a stage's done three times runs the next stage exactly once", () => {
    let presentCalls = 0;
    let askCalls = 0;
    const capturedDone = box<() => void>();
    const stages: Stages = {
      present: (_t, done) => { presentCalls++; capturedDone.value = done; },
      commit: () => {},
      ask: (_t, done) => { askCalls++; done(); },
      summary: (_t, done) => done(),
      ending: (_t, done) => done(),
    };
    const q = createTransitionQueue(st(1), stages);
    q.submit(tr(2));
    expect(presentCalls).toBe(1);
    expect(askCalls).toBe(0);
    capturedDone.value?.();
    capturedDone.value?.();
    capturedDone.value?.();
    expect(askCalls).toBe(1);
  });

  it("a doubled done at the last stage drains the queue exactly once", () => {
    // Two transitions wait behind the running one. If the running one's
    // final `done` were not idempotent, firing it twice would null out
    // `running` a second time WHILE the first transition it started is
    // already mid-flight, and drain a second one behind its back - both
    // waiting transitions gone instead of one.
    const endingDone = box<() => void>();
    let presentCalls = 0;
    const stages: Stages = {
      present: (_t, done) => {
        presentCalls++;
        if (presentCalls === 1) done(); // the running transition's own present
        // every later transition's present holds, simulating it mid-flight
      },
      commit: () => {},
      ask: (_t, done) => done(),
      summary: (_t, done) => done(),
      ending: (_t, done) => { endingDone.value = done; },
    };
    const q = createTransitionQueue(st(1), stages);
    q.submit(tr(2));
    q.submit(tr(3));
    q.submit(tr(4));
    expect(q.pending()).toBe(2);
    endingDone.value?.();
    endingDone.value?.(); // a second, spurious firing of the same done
    expect(q.pending()).toBe(1); // transition 4 still waits; 3 is running, held
  });
});
