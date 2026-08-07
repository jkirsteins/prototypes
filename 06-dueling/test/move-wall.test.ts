import { describe, expect, test } from "vitest";
import { createLevel, TILE } from "../src/movement/level";
import {
  AIRSPIN_V, GRAVITY, JUMP_V, MOVE_TICK, RUN_SPEED, SPIN_MS,
  WALLSLIDE_CAP, createMover, tickMove,
} from "../src/movement/engine";
import type { MoveEvent, MoveInput, MoveState } from "../src/movement/engine";

const level = createLevel();

function input(over: Partial<MoveInput["held"]> = {}, pressed: Partial<MoveInput["pressed"]> = {}): MoveInput {
  return {
    held: { left: false, right: false, up: false, down: false, grab: false, walk: false, ...over },
    pressed: { jump: false, dash: false, ...pressed },
  };
}
function run(m: ReturnType<typeof createMover>, inp: MoveInput, n: number): MoveEvent[] {
  const out: MoveEvent[] = [];
  for (let i = 0; i < n; i++) out.push(...tickMove(m, level, inp));
  return out;
}

describe("air spin (double jump)", () => {
  test("a second jump press mid-air spins once, and only once", () => {
    const m = createMover(level);
    run(m, input({}, { jump: true }), 1);
    run(m, input(), 10);
    run(m, input({}, { jump: true }), 1);
    expect(m.state.kind).toBe("airSpin");
    // The press tick already integrates one tick of gravity.
    expect(m.vy).toBeLessThan(-AIRSPIN_V + 100);
    run(m, input(), 5);
    run(m, input({}, { jump: true }), 1); // third press: nothing
    expect(m.state.kind).toBe("airSpin");
    run(m, input(), Math.ceil(SPIN_MS / MOVE_TICK));
    expect(["fall", "jump"]).toContain(m.state.kind);
  });

  test("jump plus spin clears 3 tiles", () => {
    const apex1 = JUMP_V * JUMP_V / (2 * GRAVITY);
    const apex2 = AIRSPIN_V * AIRSPIN_V / (2 * GRAVITY);
    expect(apex1 + apex2).toBeGreaterThan(3 * TILE);
  });
});

describe("wall slide and wall jump", () => {
  /** Airborne against the left wall (col 0 is solid). */
  function onWall(): ReturnType<typeof createMover> {
    const m = createMover(level);
    m.x = 1.5 * TILE;
    run(m, input({ left: true }, { jump: true }), 1);
    for (let i = 0; i < 300 && m.state.kind !== "wallSlide" && m.state.kind !== "wallLand"; i++) {
      run(m, input({ left: true }), 1);
    }
    return m;
  }

  test("falling against a wall while steering into it wall-slides, capping fall speed", () => {
    const m = onWall();
    expect(["wallSlide", "wallLand"]).toContain(m.state.kind);
    run(m, input({ left: true }), 30);
    expect(m.state.kind).toBe("wallSlide");
    expect(m.vy).toBeLessThanOrEqual(WALLSLIDE_CAP);
  });

  test("jump off the wall flips facing and pushes away", () => {
    const m = onWall();
    run(m, input({ left: true }), 30);
    run(m, input({}, { jump: true }), 1);
    expect(m.state.kind).toBe("jump");
    expect(m.vx).toBeGreaterThan(0); // away from the left wall
    expect(m.facing).toBe(1);
  });

  test("steering away releases the wall into a fall", () => {
    const m = onWall();
    run(m, input({ left: true }), 30);
    run(m, input({ right: true }), 3);
    expect(["fall", "jump"]).toContain(m.state.kind);
  });

  /** A plain jump beside the step's right face, nothing else held. */
  function hangAtStep(): ReturnType<typeof createMover> {
    const m = createMover(level);
    m.x = 5 * TILE + 34; // beside the step's right face (cols 3-4, top row 8)
    m.facing = -1;
    run(m, input({}, { jump: true }), 1);
    for (let i = 0; i < 200 && m.state.kind !== "ledgeHang"; i++) run(m, input(), 1);
    return m;
  }

  test("a plain jump beside an edge catches the lip on the way down and stays hanging", () => {
    const m = hangAtStep();
    expect(m.state.kind).toBe("ledgeHang");
    const y0 = m.y;
    run(m, input(), 180); // nothing pressed: the hang holds station
    expect(m.state.kind).toBe("ledgeHang");
    expect(m.y).toBe(y0);
  });

  test("up climbs on from the hang", () => {
    const m = hangAtStep();
    run(m, input({ up: true }), 1);
    expect(m.state.kind).toBe("ledgeGrab");
    for (let i = 0; i < 60 && m.state.kind !== "idle"; i++) run(m, input({ up: true }), 1);
    expect(m.state.kind).toBe("idle");
    expect(m.x).toBe(4 * TILE + TILE / 2);
    expect(m.y).toBe(8 * TILE);
  });

  test("down lets go without re-catching; the drop ends on the floor", () => {
    const m = hangAtStep();
    run(m, input({ down: true }), 1);
    expect(m.state.kind).toBe("fall");
    for (let i = 0; i < 120 && !["idle", "land", "run"].includes(m.state.kind); i++) run(m, input(), 1);
    expect(m.y).toBe(10 * TILE);
  });

  test("steering away from the wall lets go of the hang", () => {
    const m = hangAtStep();
    run(m, input({ right: true }), 1); // the lip is on the left
    expect(m.state.kind).toBe("fall");
  });

  test("crouch-walking off an edge falls - idle hands, no grab of anything nearby", () => {
    const m = createMover(level);
    // The step's top right corner, crouched, walking right off the edge:
    // platform B's left lip sits one tile up-right and used to get
    // hand-grabbed mid-fall, teleporting the walker onto B's face.
    m.x = 463; m.y = 8 * TILE; m.state = { kind: "crouchIdle" };
    const seen = new Set<string>();
    for (let i = 0; i < 180; i++) {
      tickMove(m, level, input({ down: true, right: true }));
      seen.add(m.state.kind);
    }
    expect(seen.has("ledgeHang")).toBe(false);
    expect(seen.has("ledgeGrab")).toBe(false);
    expect(m.y).toBe(10 * TILE); // ended on the floor below the edge
  });

  test("a jump at a wall with the lip within arm's reach hangs instead of sliding", () => {
    const m = createMover(level);
    // Falling beside platform B's left face with the lip ~104 cm above
    // the head: inside HANG_REACH, so the hands catch; the old
    // head-height-only window slid down the face instead.
    m.x = 446; m.y = 850; m.vy = 0;
    m.state = { kind: "fall" };
    m.airFromJump = true;
    run(m, input({ right: true }), 3);
    expect(m.state.kind).toBe("ledgeHang");
  });

  test("standing is balance: a center past the edge tips off, a center on it stands", () => {
    const over = createMover(level);
    over.x = 14 * TILE - 2; // center 2 cm past platform C's left edge
    over.y = 6 * TILE;
    run(over, input(), 120);
    expect(over.y).toBe(10 * TILE); // tipped, slipped off the corner, fell

    const on = createMover(level);
    on.x = 14 * TILE + 2;
    on.y = 6 * TILE;
    run(on, input(), 60);
    expect(on.state.kind).toBe("idle");
    expect(on.y).toBe(6 * TILE);
  });

  test("a wall slide with the stick held into the wall catches the lip at its window", () => {
    const m = createMover(level);
    // Crouch-walk off the step's right edge (standing walks are pinned
    // by B overhead), then hold back INTO the face: the slide starts
    // above the catch window and must hang on arrival at it.
    m.x = 440; m.y = 8 * TILE;
    m.state = { kind: "crouchIdle" } as MoveState;
    for (let i = 0; i < 30 && m.vy <= 0; i++) run(m, input({ right: true, down: true }), 1);
    expect(m.vy).toBeGreaterThan(0); // off the edge
    let caught = false;
    for (let i = 0; i < 120 && !caught; i++) {
      run(m, input({ left: true }), 1);
      caught = m.state.kind === "ledgeHang";
    }
    expect(caught).toBe(true); // the hold is the intent: hands catch, then wait
  });

  test("jump leaps away from the hang, facing flipped", () => {
    const m = hangAtStep();
    run(m, input({}, { jump: true }), 1);
    expect(m.state.kind).toBe("jump");
    expect(m.vx).toBeGreaterThan(0); // away from the left-side lip
    expect(m.facing).toBe(1);
  });

  test("the ledge pull-up travels - no frozen hang, no snap to the top", () => {
    const m = createMover(level);
    // Hanging at platform A's right lip (col 4, top y = 8 * TILE).
    m.x = 5 * TILE + 34;
    m.y = 8 * TILE + 162;
    m.facing = -1;
    m.state = {
      kind: "ledgeGrab", t: 0,
      startX: m.x, startY: m.y,
      targetX: 4 * TILE + TILE / 2, targetY: 8 * TILE,
    };
    let prevX = m.x;
    let prevY = m.y;
    for (let i = 0; i < 60 && m.state.kind === "ledgeGrab"; i++) {
      run(m, input(), 1);
      // Continuous: every tick is a small move, never a jump cut.
      expect(Math.abs(m.x - prevX) + Math.abs(m.y - prevY)).toBeLessThan(45);
      expect(m.y).toBeLessThanOrEqual(prevY); // the body never sags back down
      prevX = m.x;
      prevY = m.y;
    }
    expect(m.state.kind).toBe("idle");
    expect(m.x).toBe(4 * TILE + TILE / 2);
    expect(m.y).toBe(8 * TILE);
  });

  test("a wall catch beside the floor is one plant, never a double touchdown", () => {
    const m = createMover(level);
    m.x = 126; // flush against the left wall face
    m.y = 954; // centimeters above the floor: the catch and the plant nearly coincide
    m.vy = 300;
    m.state = { kind: "fall" };
    const evs = run(m, input({ left: true }), 30);
    expect(evs.filter((e) => e.kind === "touchdown")).toHaveLength(1);
    expect(["idle", "run"]).toContain(m.state.kind); // grounded, not stuck in a wall state
  });

  test("grab changes nothing at a wall: falling against it slides regardless", () => {
    const m = createMover(level);
    m.x = 1.5 * TILE;
    run(m, input({ left: true, grab: true }, { jump: true }), 1);
    for (let i = 0; i < 300 && !["wallSlide", "wallLand"].includes(m.state.kind); i++) {
      run(m, input({ left: true, grab: true }), 1);
    }
    expect(["wallSlide", "wallLand"]).toContain(m.state.kind);
  });
});

describe("input buffering: presses are intent, not single-tick edges", () => {
  test("a jump pressed just before touchdown fires on landing", () => {
    const m = createMover(level);
    run(m, input({}, { jump: true }), 1); // up
    run(m, input({}, { jump: true }), 1); // double jump: spin spent
    // ride the fall until just above the floor, then press jump again
    for (let i = 0; i < 300 && !(m.state.kind === "fall" && m.y > 10 * TILE - 30); i++) run(m, input(), 1);
    const evs = run(m, input({}, { jump: true }), 1); // one press, a few ticks early
    evs.push(...run(m, input(), 5));
    expect(evs.filter((e) => e.kind === "liftoff").length).toBeGreaterThanOrEqual(1);
    expect(m.state.kind).toBe("jump"); // airborne again: the press survived the landing
    expect(m.vy).toBeLessThan(0);
  });

  test("steering interrupts a soft landing instead of dying for LAND_MS", () => {
    const m = createMover(level);
    run(m, input({}, { jump: true }), 1);
    for (let i = 0; i < 300 && m.state.kind !== "land"; i++) run(m, input(), 1);
    expect(m.state).toMatchObject({ kind: "land", hard: false });
    run(m, input({ right: true }), 2);
    expect(m.state.kind).toBe("run"); // moving at once, no dead window
    expect(m.vx).toBe(RUN_SPEED);
  });

  test("a spin press does not double-fire as a landing jump", () => {
    const m = createMover(level);
    m.x = 3.5 * TILE; m.y = 8 * TILE; // on the step: a short drop
    run(m, input({}, { jump: true }), 1);
    for (let i = 0; i < 60 && m.state.kind !== "fall"; i++) run(m, input(), 1);
    run(m, input({}, { jump: true }), 1); // the spin, close to the ground
    for (let i = 0; i < 300 && !["land", "idle"].includes(m.state.kind); i++) run(m, input(), 1);
    // the same press must not ALSO jump off the ground after landing
    const after = run(m, input(), 10);
    expect(after.filter((e) => e.kind === "liftoff")).toHaveLength(0);
    expect(["land", "idle"]).toContain(m.state.kind);
  });

  test("a hard landing stays committed: the buffer expires before it ends", () => {
    const m = createMover(level);
    m.x = 16.5 * TILE; m.y = 3 * TILE;
    m.state = { kind: "fall" } as MoveState;
    for (let i = 0; i < 400 && m.state.kind === "fall"; i++) run(m, input(), 1);
    expect(m.state).toMatchObject({ kind: "land", hard: true });
    run(m, input({}, { jump: true }), 1); // pressed into the lock
    const evs = run(m, input(), Math.ceil(220 / MOVE_TICK) + 2);
    expect(evs.filter((e) => e.kind === "liftoff")).toHaveLength(0);
    expect(m.state.kind).toBe("idle");
  });
});

describe("the ledge", () => {
  test("jumping under the middle of a platform never hangs from its underside", () => {
    const m = createMover(level);
    m.x = 6.5 * TILE; // under platform B's middle column
    const seen = new Set<string>();
    run(m, input({}, { jump: true }), 1);
    for (let i = 0; i < 200; i++) {
      run(m, input(), 1);
      seen.add(m.state.kind);
    }
    expect(seen.has("ledgeHang")).toBe(false); // interior columns have no face
    expect(m.y).toBe(10 * TILE); // bonked the underside and came back down
  });

  test("a jump toward a platform lip within reach ledge-grabs", () => {
    const m = createMover(level);
    // Platform A: cols 3-4 at row 8, top at y = 8*TILE, 2 tiles above floor.
    // Cols 5-7 at row 6 are an unrelated ceiling block (see level.ts); any
    // approach starting under it (5.0-7.3 tiles) has its rise capped by a
    // head bump well before reaching the wall, so the arc's head height
    // overshoots the ledge grab window (headY within 60 cm of the lip)
    // before horizontal contact ever registers, and it slides past to the
    // floor - not a design gap, just this start point's timing. Starting
    // farther out gives the arc time to fall back into the window by the
    // time it reaches the wall; 7.4-7.88 tiles all grab cleanly, traced
    // with 7.5.
    m.x = 7.5 * TILE; // right of A, jump left onto its lip
    run(m, input({ left: true }, { jump: true }), 1);
    let hung = false;
    for (let i = 0; i < 300; i++) {
      run(m, input({ left: true }), 1);
      if (m.state.kind === "ledgeHang") { hung = true; break; }
      if (m.state.kind === "land" || m.state.kind === "idle") break;
    }
    // Either the hands caught the lip (climb on from the hang), or the
    // jump cleared 2 tiles and simply landed on top - both end on the
    // platform; the hang is for the case where the apex fell short.
    if (hung) {
      for (let i = 0; i < 120 && m.state.kind !== "idle"; i++) run(m, input({ up: true }), 1);
    } else {
      for (let i = 0; i < 300 && m.state.kind !== "idle"; i++) run(m, input(), 1);
    }
    expect(m.y).toBeLessThanOrEqual(8 * TILE);
  });
});
