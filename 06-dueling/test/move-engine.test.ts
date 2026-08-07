import { describe, expect, test } from "vitest";
import { createLevel, TILE } from "../src/movement/level";
import {
  GRAVITY, JUMP_V, LAND_MS, MOVE_TICK,
  RUN_SPEED, WALK_SPEED, createMover, tickMove,
} from "../src/movement/engine";
import type { MoveEvent, MoveInput } from "../src/movement/engine";

const level = createLevel();

function input(over: Partial<MoveInput["held"]> = {}, pressed: Partial<MoveInput["pressed"]> = {}): MoveInput {
  return {
    held: { left: false, right: false, up: false, down: false, grab: false, walk: false, ...over },
    pressed: { jump: false, dash: false, ...pressed },
  };
}

/** Run n ticks of the same input, collecting events. */
function run(m: ReturnType<typeof createMover>, inp: MoveInput, n: number): MoveEvent[] {
  const out: MoveEvent[] = [];
  for (let i = 0; i < n; i++) out.push(...tickMove(m, level, inp));
  return out;
}

describe("movement engine core", () => {
  test("spawns idle on the floor", () => {
    const m = createMover(level);
    expect(m.state.kind).toBe("idle");
    expect(m.y).toBe(10 * TILE);
  });

  test("deterministic: the same input script produces the same trace", () => {
    const script = (m: ReturnType<typeof createMover>): string => {
      const parts: string[] = [];
      run(m, input({ right: true }), 30);
      run(m, input({ right: true }, { jump: true }), 1);
      run(m, input({ right: true }), 60);
      parts.push(`${m.x.toFixed(3)},${m.y.toFixed(3)},${m.state.kind}`);
      return parts.join(";");
    };
    expect(script(createMover(level))).toBe(script(createMover(level)));
  });

  test("held right runs right at RUN_SPEED; walk modifier walks", () => {
    const m = createMover(level);
    m.x = 13.5 * TILE; // ~500 cm of clear runway: past the tunnel, short of the block
    run(m, input({ right: true }), 30);
    expect(m.state.kind).toBe("run");
    expect(m.vx).toBe(RUN_SPEED);
    run(m, input({ right: true, walk: true }), 2);
    expect(m.state.kind).toBe("walk");
    expect(m.vx).toBe(WALK_SPEED);
    expect(m.facing).toBe(1);
  });

  test("switching sides flips facing", () => {
    const m = createMover(level);
    run(m, input({ left: true }), 5);
    expect(m.facing).toBe(-1);
    expect(m.vx).toBe(-RUN_SPEED);
  });

  test("a jump clears 2 tiles but not 3", () => {
    const apex = JUMP_V * JUMP_V / (2 * GRAVITY); // cm above start
    expect(apex).toBeGreaterThan(2 * TILE + 10);
    expect(apex).toBeLessThan(3 * TILE);
  });

  test("jump rises, falls, lands: state walks jump -> fall -> land -> idle", () => {
    const m = createMover(level);
    run(m, input({}, { jump: true }), 1);
    expect(m.state.kind).toBe("jump");
    // The press tick already integrates one tick of gravity.
    expect(m.vy).toBeLessThan(-JUMP_V + 100);
    // ride to apex and back down
    let sawFall = false;
    for (let i = 0; i < 200 && m.state.kind !== "land"; i++) {
      run(m, input(), 1);
      if (m.state.kind === "fall") sawFall = true;
    }
    expect(sawFall).toBe(true);
    expect(m.state.kind).toBe("land");
    for (let i = 0; i < Math.ceil(LAND_MS / MOVE_TICK) + 1; i++) run(m, input(), 1);
    expect(m.state.kind).toBe("idle");
    expect(m.y).toBe(10 * TILE);
  });

  test("walls stop horizontal movement", () => {
    const m = createMover(level);
    // Start on the open floor RIGHT of the tunnel (standing traversal
    // through the tunnel is deliberately impossible).
    m.x = 15 * TILE;
    run(m, input({ right: true }), 60 * 3);
    expect(m.x).toBeLessThanOrEqual(20 * TILE);
    expect(m.x).toBeGreaterThan(18 * TILE); // pinned at the right wall
  });

  test("running off a platform edge falls", () => {
    const m = createMover(level);
    // Stand on platform C (cols 14-15, row 6) and run right off its edge.
    m.x = 14.5 * TILE;
    m.y = 6 * TILE;
    run(m, input({ right: true }), 120);
    // Support lost, support regained below C's level: the drift lands on
    // the parked block (top = 9 * TILE) or, if tuning shifts the arc, the
    // floor. Both prove the fall; the exact perch is level furniture.
    expect([9 * TILE, 10 * TILE]).toContain(m.y);
  });

  test("landing from 3+ tiles is a hard landing", () => {
    const m = createMover(level);
    m.x = 16.5 * TILE; // open column: nothing below but the floor
    m.y = 3 * TILE; // platform-D height, 7 tiles up
    m.state = { kind: "fall" };
    let landed: MoveEvent[] = [];
    for (let i = 0; i < 300 && m.state.kind === "fall"; i++) landed = run(m, input(), 1);
    expect(m.state).toMatchObject({ kind: "land", hard: true });
    expect(landed.some((e) => e.kind === "touchdown")).toBe(true);
  });
});

describe("presentation events follow the simulation, not the input", () => {
  test("liftoff fires on the jump tick, touchdown only when ground is reached", () => {
    const m = createMover(level);
    const first = run(m, input({}, { jump: true }), 1);
    expect(first.map((e) => e.kind)).toContain("liftoff");
    expect(first.map((e) => e.kind)).not.toContain("touchdown");
    let touchdownAt = -1;
    for (let i = 0; i < 300; i++) {
      const evs = run(m, input(), 1);
      if (evs.some((e) => e.kind === "touchdown")) { touchdownAt = i; break; }
    }
    expect(touchdownAt).toBeGreaterThan(10); // well after the press
    // and the touchdown tick is exactly when y returned to the floor
    expect(m.y).toBe(10 * TILE);
  });

  test("footfalls tick with strides while the feet move, and stop when they stop", () => {
    const m = createMover(level);
    m.x = 13.5 * TILE; // open right-side floor, body fully clear of the tunnel column
    const evs = run(m, input({ right: true }), 60); // ~0.85 s of motion, then the wall
    const falls = evs.filter((e) => e.kind === "footfall").length;
    expect(falls).toBeGreaterThanOrEqual(2);
    expect(falls).toBeLessThanOrEqual(4);
    // Still held against the wall: the feet no longer move, so no
    // footfall may sound - commanded speed is not motion.
    const pinned = run(m, input({ right: true }), 120);
    expect(pinned.filter((e) => e.kind === "footfall")).toHaveLength(0);
    const still = run(m, input(), 60);
    expect(still.filter((e) => e.kind === "footfall")).toHaveLength(0);
  });
});
