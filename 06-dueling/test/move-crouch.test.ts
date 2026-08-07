import { describe, expect, test } from "vitest";
import { createLevel, TILE } from "../src/movement/level";
import {
  BODY_H_CROUCH, CROUCH_SPEED, DASH_MS, DASH_SPEED, MOVE_TICK, ROLL_MS,
  SLIDE_MS, createMover, heightOf, tickMove,
} from "../src/movement/engine";
import type { MoveInput } from "../src/movement/engine";

const level = createLevel();

function input(over: Partial<MoveInput["held"]> = {}, pressed: Partial<MoveInput["pressed"]> = {}): MoveInput {
  return {
    held: { left: false, right: false, up: false, down: false, grab: false, walk: false, ...over },
    pressed: { jump: false, dash: false, ...pressed },
  };
}
function run(m: ReturnType<typeof createMover>, inp: MoveInput, n: number): void {
  for (let i = 0; i < n; i++) tickMove(m, level, inp);
}

describe("dash", () => {
  test("a ground dash bursts at DASH_SPEED for DASH_MS, then resumes", () => {
    const m = createMover(level);
    run(m, input({}, { dash: true }), 1);
    expect(m.state.kind).toBe("dash");
    expect(m.vx).toBe(DASH_SPEED);
    run(m, input(), Math.ceil(DASH_MS / MOVE_TICK) + 1);
    expect(m.state.kind).toBe("idle");
  });

  test("dash-jump keeps dash momentum: it clears the 6-tile gap a run-jump cannot", () => {
    // From platform B (cols 5-7, row 6) toward C (cols 14-15): the gap is
    // cols 8-13. A run-jump from B's edge falls short; dash then jump
    // carries DASH_SPEED across.
    const runJump = createMover(level);
    runJump.x = 6.5 * TILE; runJump.y = 6 * TILE;
    run(runJump, input({ right: true }), 12); // run up to the edge
    run(runJump, input({ right: true }, { jump: true }), 1);
    for (let i = 0; i < 300 && runJump.y < 10 * TILE; i++) run(runJump, input({ right: true }), 1);
    expect(runJump.y).toBe(10 * TILE); // fell into the gap to the floor

    const dashJump = createMover(level);
    dashJump.x = 6.5 * TILE; dashJump.y = 6 * TILE;
    run(dashJump, input({ right: true }, { dash: true }), 1);
    run(dashJump, input({ right: true }, { jump: true }), 1); // one press: two would double-jump once airSpin exists
    let peakY = dashJump.y;
    for (let i = 0; i < 300 && !(dashJump.vy === 0 && dashJump.y <= 6 * TILE + 1); i++) {
      run(dashJump, input({ right: true }), 1);
      peakY = Math.min(peakY, dashJump.y);
      if (dashJump.y >= 10 * TILE) break;
    }
    expect(dashJump.y).toBeLessThan(10 * TILE); // never fell to the floor
    expect(dashJump.x).toBeGreaterThan(14 * TILE); // reached platform C
  });
});

describe("crouch, slide and the tunnel", () => {
  test("holding down crouches; crouch-walk moves at CROUCH_SPEED", () => {
    const m = createMover(level);
    run(m, input({ down: true }), 2);
    expect(m.state.kind).toBe("crouchIdle");
    expect(heightOf(m.state)).toBe(BODY_H_CROUCH);
    run(m, input({ down: true, right: true }), 2);
    expect(m.state.kind).toBe("crouchWalk");
    expect(m.vx).toBe(CROUCH_SPEED);
  });

  test("the tunnel refuses standing and admits a crouch", () => {
    const m = createMover(level);
    m.x = 9.4 * TILE; // just left of the tunnel (roof cols 10-12, row 8... clearance row 9)
    run(m, input({ right: true }), 90); // standing: walks into the roof edge and stops
    expect(m.x).toBeLessThan(10 * TILE);
    run(m, input({ right: true, down: true }), 240); // crouched: passes under
    expect(m.x).toBeGreaterThan(13 * TILE);
  });

  test("standing up under the roof is refused until there is headroom", () => {
    const m = createMover(level);
    m.x = 11.5 * TILE; // mid-tunnel
    run(m, input({ down: true }), 2);
    expect(m.state.kind).toBe("crouchIdle");
    run(m, input(), 5); // down released, no headroom
    expect(m.state.kind).toBe("crouchIdle");
    run(m, input({ right: true, down: true }), 200); // crawl out
    run(m, input(), 5);
    expect(["idle", "run"]).toContain(m.state.kind);
  });

  test("pressing down at speed slides; the slide fits the tunnel", () => {
    const m = createMover(level);
    // 5.5 tiles: at RUN_SPEED, 30 ticks covers 350cm, landing short of the
    // standing-height wall stop at the tunnel mouth (~930cm, col 10 minus
    // half body width) - starting at 7.5 tiles instead runs the standing
    // body into that wall by tick 18, zeroing vx and missing the
    // >=RUN_SPEED slide gate on the down press.
    m.x = 5.5 * TILE;
    run(m, input({ right: true }), 30); // at full run
    run(m, input({ right: true, down: true }), 1); // down edge -> slide
    expect(m.state.kind).toBe("slide");
    run(m, input({ right: true, down: true }), Math.ceil(SLIDE_MS / MOVE_TICK));
    // still under or past the tunnel, never stood into the roof
    expect(["crouchWalk", "crouchIdle", "slide", "run", "idle"]).toContain(m.state.kind);
  });
});

describe("roll on hard landing", () => {
  test("a high drop with a direction held rolls; without one it lands hard", () => {
    const drop = (dir: boolean): ReturnType<typeof createMover> => {
      const m = createMover(level);
      // Open column: nothing below but the floor; drifting right stays
      // clear of every platform (the ladder at col 17 is not solid).
      m.x = 16.5 * TILE; m.y = 3 * TILE; m.state = { kind: "fall" };
      const inp = dir ? input({ right: true }) : input();
      for (let i = 0; i < 400 && m.state.kind === "fall"; i++) run(m, inp, 1);
      return m;
    };
    const rolled = drop(true);
    expect(rolled.state.kind).toBe("roll");
    const braced = drop(false);
    expect(braced.state).toMatchObject({ kind: "land", hard: true });
    // the roll travels, then ends
    const m = drop(true);
    run(m, input({ right: true }), Math.ceil(ROLL_MS / MOVE_TICK) + 1);
    expect(["run", "idle"]).toContain(m.state.kind);
  });
});
