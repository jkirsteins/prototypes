import { describe, expect, test } from "vitest";
import {
  ACTIVITY_DELTA, DEADZONE, MOVE_OFF, MOVE_ON,
  createPadSnapshot, discardPadSnapshot, readPads,
} from "../src/input/gamepad";
import type { PadSnapshot } from "../src/input/gamepad";

/**
 * gamepad-support §4/§10: the pure poller. Everything here runs on
 * hand-built Gamepad-shaped objects - readPads never touches navigator.
 */

function pad(index: number, opts?: { id?: string; buttons?: number[]; axes?: number[] }): Gamepad {
  const buttons = Array.from({ length: 17 }, (_, i) => ({
    pressed: opts?.buttons?.includes(i) ?? false,
    touched: false,
    value: opts?.buttons?.includes(i) ? 1 : 0,
  }));
  return {
    index,
    id: opts?.id ?? "Xbox Wireless Controller (STANDARD GAMEPAD)",
    buttons,
    axes: opts?.axes ?? [0, 0, 0, 0],
    connected: true,
    mapping: "standard",
    timestamp: 0,
  } as unknown as Gamepad;
}

/** Seed the snapshot with a neutral pad so the next poll diffs normally. */
function seeded(index = 0): PadSnapshot {
  const s0 = createPadSnapshot();
  return readPads(s0, [pad(index)], false).next;
}

/** Make a pad the ACTIVE one (a button tap: press then release). */
function withActive(index = 0): PadSnapshot {
  let s = seeded(index);
  s = readPads(s, [pad(index, { buttons: [0] })], false).next;
  s = readPads(s, [pad(index)], false).next;
  return s;
}

describe("edges and the seed poll", () => {
  test("a press is one edge; holding it repeats nothing; release is one edge", () => {
    let s = withActive();
    let r = readPads(s, [pad(0, { buttons: [2] })], false);
    expect(r.frame.pressed).toEqual([{ kind: "button", index: 2 }]);
    s = r.next;
    r = readPads(s, [pad(0, { buttons: [2] })], false);
    expect(r.frame.pressed).toEqual([]);
    s = r.next;
    r = readPads(s, [pad(0)], false);
    expect(r.frame.released).toEqual([{ kind: "button", index: 2 }]);
  });

  test("the first poll ever only seeds: no edges, no activity, no holds - and engaged controls are stale until released", () => {
    const s0 = createPadSnapshot();
    // A guard bumper held across the boot (or a blur): must not read as a press.
    const r = readPads(s0, [pad(0, { buttons: [5] })], false);
    expect(r.frame.pressed).toEqual([]);
    expect(r.frame.activity).toBe(false);
    expect(r.frame.held.guard).toBe(false);
    // Still held on later polls: still nothing.
    const r2 = readPads(r.next, [pad(0, { buttons: [5] })], false);
    expect(r2.frame.held.guard).toBe(false);
    expect(r2.frame.pressed).toEqual([]);
    // Released, then pressed afresh: acts normally.
    const r3 = readPads(r2.next, [pad(0)], false);
    const r4 = readPads(r3.next, [pad(0, { buttons: [5] })], false);
    expect(r4.frame.pressed).toEqual([{ kind: "button", index: 5 }]);
    expect(r4.frame.held.guard).toBe(true);
  });

  test("discard behaves like the first poll: a blur never converts a held button into a fresh press", () => {
    let s = withActive();
    s = readPads(s, [pad(0, { buttons: [5] })], false).next; // guard held
    discardPadSnapshot(s);
    const r = readPads(s, [pad(0, { buttons: [5] })], false);
    expect(r.frame.pressed).toEqual([]);
    expect(r.frame.held.guard).toBe(false);
  });
});

describe("deadzone and hysteresis", () => {
  test("0.45 engages nothing; 0.5 engages; 0.4 keeps holding; 0.34 releases", () => {
    const s = withActive();
    let r = readPads(s, [pad(0, { axes: [0.45, 0, 0, 0] })], false);
    expect(r.frame.held.advance).toBe(false);
    r = readPads(r.next, [pad(0, { axes: [0.5, 0, 0, 0] })], false);
    expect(r.frame.held.advance).toBe(true);
    r = readPads(r.next, [pad(0, { axes: [0.4, 0, 0, 0] })], false);
    expect(r.frame.held.advance).toBe(true); // hysteresis: still on
    r = readPads(r.next, [pad(0, { axes: [0.34, 0, 0, 0] })], false);
    expect(r.frame.held.advance).toBe(false);
    expect(r.frame.released).toContainEqual({ kind: "axis", index: 0, sign: 1 });
  });

  test("activity is edge-shaped: a held stick reclaims nothing, a re-grip does", () => {
    const s = withActive();
    let r = readPads(s, [pad(0, { axes: [0.6, 0, 0, 0] })], false);
    expect(r.frame.activity).toBe(true); // crossing out of the deadzone
    r = readPads(r.next, [pad(0, { axes: [0.6, 0, 0, 0] })], false);
    expect(r.frame.activity).toBe(false); // merely held: not activity
    r = readPads(r.next, [pad(0, { axes: [0.6 + ACTIVITY_DELTA, 0, 0, 0] })], false);
    expect(r.frame.activity).toBe(true); // a re-grip is input
    expect(DEADZONE).toBeLessThan(MOVE_OFF);
    expect(MOVE_OFF).toBeLessThan(MOVE_ON);
  });
});

describe("the ownership gate", () => {
  test("a hold engaged under the gate contributes no level until released - the edge still reports", () => {
    const s = withActive();
    const r = readPads(s, [pad(0, { axes: [0.9, 0, 0, 0] })], true); // gate on (select screen)
    expect(r.frame.pressed).toContainEqual({ kind: "axis", index: 0, sign: 1 }); // navigation still works
    expect(r.frame.held.advance).toBe(false); // but no combat hold
    // Gate lifts, stick still held: STILL stale until it comes home.
    const r2 = readPads(r.next, [pad(0, { axes: [0.9, 0, 0, 0] })], false);
    expect(r2.frame.held.advance).toBe(false);
    // Returns inside the deadzone, engages afresh: acts normally.
    const r3 = readPads(r2.next, [pad(0, { axes: [0.1, 0, 0, 0] })], false);
    const r4 = readPads(r3.next, [pad(0, { axes: [0.9, 0, 0, 0] })], false);
    expect(r4.frame.held.advance).toBe(true);
  });

  test("a hold from BEFORE the gate keeps its level and its release still falls through", () => {
    let s = withActive();
    s = readPads(s, [pad(0, { buttons: [5] })], false).next; // guard up, ungated
    const r = readPads(s, [pad(0, { buttons: [5] })], true); // help opens
    expect(r.frame.held.guard).toBe(true); // preserved
    const r2 = readPads(r.next, [pad(0)], true);
    expect(r2.frame.held.guard).toBe(false); // the release falls through the gate
  });
});

describe("multi-pad election and handoff", () => {
  test("only the active pad reaches the game; activity elects; same-frame ties go to the lowest index", () => {
    let s = createPadSnapshot();
    s = readPads(s, [pad(0), pad(1)], false).next; // seed both
    // Both press on the same frame: pad 0 wins the tie.
    let r = readPads(s, [pad(0, { buttons: [2] }), pad(1, { buttons: [3] })], false);
    expect(r.frame.activePadIndex).toBe(0);
    expect(r.frame.pressed).toEqual([{ kind: "button", index: 2 }]);
    // Pad 1 acts alone: handoff - its edge fires once, from pad 1.
    s = readPads(r.next, [pad(0), pad(1)], false).next;
    r = readPads(s, [pad(0), pad(1, { buttons: [3] })], false);
    expect(r.frame.activePadIndex).toBe(1);
    expect(r.frame.pressed).toEqual([{ kind: "button", index: 3 }]);
  });

  test("a handoff adopts the new pad's holds as levels, not edges", () => {
    let s = createPadSnapshot();
    s = readPads(s, [pad(0), pad(1, { buttons: [5] })], false).next; // seed: pad 1 already holds guard
    s = readPads(s, [pad(0, { buttons: [0] }), pad(1, { buttons: [5] })], false).next; // pad 0 active
    s = readPads(s, [pad(0), pad(1, { buttons: [5] })], false).next;
    // Pad 1 presses a button: elected; its standing guard becomes a LEVEL.
    const r = readPads(s, [pad(0), pad(1, { buttons: [5, 2] })], false);
    expect(r.frame.activePadIndex).toBe(1);
    expect(r.frame.held.guard).toBe(true); // adopted, deliberately unsuppressed
    expect(r.frame.pressed).toEqual([{ kind: "button", index: 2 }]); // the electing edge only
  });

  test("the active pad disconnecting reports padGone and promotes nobody without activity", () => {
    const s = withActive(0);
    const r = readPads(s, [null, pad(1)], false);
    expect(r.frame.padGone).toBe(true);
    expect(r.frame.activePadIndex).toBe(null);
    expect(r.frame.held).toEqual({ advance: false, retreat: false, guard: false, up: false, down: false });
  });
});
