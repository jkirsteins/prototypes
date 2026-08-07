import { describe, expect, test } from "vitest";
import { createLevel } from "../src/movement/level";
import { createMover } from "../src/movement/engine";
import type { MoveState } from "../src/movement/engine";
import { pickMoveFrame } from "../src/render/moveframes";
import { SHEETS } from "../src/render/sheets";

const level = createLevel();

/** One representative of every state kind - the totality check. */
const STATES: MoveState[] = [
  { kind: "idle" }, { kind: "walk" }, { kind: "run" },
  { kind: "dash", t: 90 }, { kind: "slide", t: 200 }, { kind: "roll", t: 100 },
  { kind: "crouchIdle" }, { kind: "crouchWalk" },
  { kind: "jump" }, { kind: "airSpin", t: 100 }, { kind: "fall" },
  { kind: "land", t: 100, hard: true },
  { kind: "wallLand", t: 100, wall: -1 }, { kind: "wallSlide", wall: -1 },
  { kind: "sideClimb", wall: -1 }, { kind: "ladderClimb" },
  { kind: "ledgeGrab", t: 200, targetX: 0, targetY: 0 },
  { kind: "push", dir: 1 }, { kind: "pull", dir: -1 }, { kind: "pushIdle" },
];

describe("pickMoveFrame is total and in bounds", () => {
  for (const state of STATES) {
    test(state.kind, () => {
      const m = createMover(level);
      m.state = state;
      for (const t of [0, 250, 999, 5000]) {
        m.time = t;
        const pick = pickMoveFrame(m);
        expect(pick.frame).toBeGreaterThanOrEqual(0);
        expect(pick.frame).toBeLessThan(SHEETS[pick.sheet].frames);
      }
    });
  }

  test("facing left flips; a left wall slide shows the wall side", () => {
    const m = createMover(level);
    m.facing = -1;
    expect(pickMoveFrame(m).flip).toBe(true);
    m.facing = 1;
    m.state = { kind: "wallSlide", wall: -1 };
    expect(pickMoveFrame(m).flip).toBe(true); // wall on the left mirrors the sheet
  });

  test("climb cycles advance with position, not time", () => {
    const m = createMover(level);
    m.state = { kind: "sideClimb", wall: -1 };
    m.y = 800;
    const a = pickMoveFrame(m).frame;
    m.y = 760; // moved up one stride step
    const b = pickMoveFrame(m).frame;
    expect(a).not.toBe(b);
    m.time += 5000; // time alone changes nothing
    m.y = 800;
    expect(pickMoveFrame(m).frame).toBe(a);
  });
});
