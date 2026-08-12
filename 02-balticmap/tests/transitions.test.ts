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
});
