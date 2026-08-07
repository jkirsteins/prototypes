import { describe, expect, test } from "vitest";
import { createLevel, TILE } from "../src/movement/level";
import { BLOCK_W, BODY_W, WALK_SPEED, createMover, tickMove } from "../src/movement/engine";
import type { MoveEvent, MoveInput } from "../src/movement/engine";

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

describe("the ladder", () => {
  test("holding up over the ladder attaches and climbs; the top clamps at the platform level", () => {
    const m = createMover(level);
    m.x = 17.5 * TILE; // over the ladder column
    const evs = run(m, input({ up: true }), 5);
    expect(m.state.kind).toBe("ladderClimb");
    expect(evs.some((e) => e.kind === "grab")).toBe(true);
    expect(m.x).toBe(17.5 * TILE); // snapped to the ladder center
    run(m, input({ up: true }), 60 * 6);
    expect(m.y).toBe(3 * TILE); // clamped at the top rung's top
    // step right onto platform D (cols 18-19, row 3)
    run(m, input({ right: true }), 30);
    expect(m.state.kind).not.toBe("ladderClimb");
    run(m, input(), 60);
    expect(m.y).toBe(3 * TILE); // standing on D
  });

  test("climbing down to the floor detaches", () => {
    const m = createMover(level);
    m.x = 17.5 * TILE;
    run(m, input({ up: true }), 60); // attach, climb a bit
    run(m, input({ down: true }), 60 * 4);
    expect(m.state.kind).not.toBe("ladderClimb");
    expect(m.y).toBe(10 * TILE);
  });

  test("jumping off the ladder is a liftoff", () => {
    const m = createMover(level);
    m.x = 17.5 * TILE;
    run(m, input({ up: true }), 90);
    const evs = run(m, input({}, { jump: true }), 1);
    expect(m.state.kind).toBe("jump");
    expect(evs.some((e) => e.kind === "liftoff")).toBe(true);
  });
});

describe("the ladder", () => {
  test("holding up mid-fall grabs a ladder being passed", () => {
    const m = createMover(level);
    m.x = 17.5 * TILE; // over the ladder column
    run(m, input({}, { jump: true }), 1);
    for (let i = 0; i < 60 && m.vy <= 0; i++) run(m, input(), 1); // ride to the descent
    let grabbed = false;
    for (let i = 0; i < 60 && !grabbed; i++) {
      run(m, input({ up: true }), 1);
      grabbed = m.state.kind === "ladderClimb";
    }
    expect(grabbed).toBe(true);
    expect(m.x).toBe(17.5 * TILE); // snapped to the ladder center
  });
});

describe("the pushable block", () => {
  test("the block cannot be pushed out of its pocket, only pulled", () => {
    const m = createMover(level);
    const bx0 = m.block.x; // 19.5 * TILE, against the right wall
    m.x = 14 * TILE; // open floor right of the tunnel (standing cannot pass it)
    // Walk right into it: push attempts move it right, into the wall.
    run(m, input({ right: true }), 60 * 3);
    expect(m.block.x).toBe(bx0);
    // Grab and pull left.
    const evs = run(m, input({ left: true, grab: true }), 60);
    expect(m.state.kind).toBe("pull");
    expect(m.block.x).toBeLessThan(bx0);
    expect(evs.some((e) => e.kind === "shove")).toBe(true);
  });

  test("push moves the block at walk speed and the player with it", () => {
    const m = createMover(level);
    // Open floor past platform B, clear of the tunnel roof (which would
    // sit at standing-head height beside the block) and far enough from
    // the left step's pillar (cols 3-4, solid rows 8-9, right edge at
    // x=480) that a full second of leftward push - up to 300 cm at
    // WALK_SPEED - has room before the block's left face (half-width 48)
    // reaches it: col 8.5 leaves 816-528=288 cm of travel, comfortably
    // inside the WALK_SPEED*[0.8, 1.2] window the assertions check.
    m.block.x = 8.5 * TILE;
    m.x = 8.5 * TILE + BLOCK_W / 2 + BODY_W / 2 + 4; // touching its right face
    run(m, input({ left: true }), 2);
    expect(m.state.kind).toBe("push");
    const bx0 = m.block.x;
    run(m, input({ left: true }), 60);
    expect(bx0 - m.block.x).toBeGreaterThan(WALK_SPEED * 0.8);
    expect(bx0 - m.block.x).toBeLessThan(WALK_SPEED * 1.2);
  });

  test("grab beside the block without direction is the push-idle stance", () => {
    const m = createMover(level);
    m.block.x = 6 * TILE;
    m.x = 6 * TILE + BLOCK_W / 2 + BODY_W / 2 + 4;
    run(m, input({ grab: true }), 2);
    expect(m.state.kind).toBe("pushIdle");
  });

  test("the block is solid: the player can stand on it", () => {
    const m = createMover(level);
    m.block.x = 9.5 * TILE; // open column: no roof or platform overhead
    m.x = 9.5 * TILE;
    m.y = 7 * TILE; // drop from above
    m.state = { kind: "fall" };
    for (let i = 0; i < 300 && !["idle", "land", "run"].includes(m.state.kind); i++) run(m, input(), 1);
    expect(m.y).toBe(10 * TILE - 96); // feet on the block top
  });

  test("a pull toward a low ceiling stops the block at the pinned player, never inside", () => {
    const m = createMover(level);
    m.x = 15 * TILE; // pulling left pins the standing body against the tunnel roof
    m.block.x = 15 * TILE + BLOCK_W / 2 + BODY_W / 2 + 4;
    run(m, input({ left: true, grab: true }), 120);
    // The block fits under the roof the body cannot pass; it must stop
    // beside the pinned body, never be dragged through it.
    expect(m.block.x - m.x).toBeGreaterThanOrEqual(BLOCK_W / 2 + BODY_W / 2 - 1);
  });
});
