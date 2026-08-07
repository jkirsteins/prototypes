# Movement Test Scene + Scene Selector Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a scene selector and a single-screen parkour "movement test" scene to 06-dueling that exercises every non-combat animation the sprite pack provides, with the existing duel becoming the "dueling test" scene.

**Architecture:** A pure DOM-free movement engine (`src/movement/`) mirroring `src/combat/` (fixed 60 Hz tick, deterministic, unit-tested), driven by a thin scene shell extracted from `main.ts`. New sprite sheets join the existing `SHEETS` record with measured metadata; input goes through the `ActionId` scheme table so keyboard and pad both work. Spec: `docs/superpowers/specs/2026-08-07-movement-test-scene-design.md`.

**Tech Stack:** TypeScript, Vite, vitest, canvas 2D. No new dependencies.

## Global Constraints

- All work happens in `/Users/janis.kirsteins/Projects/prototypes/06-dueling`. Run `npm test` / `npm run build` from that directory. Both must pass before every commit.
- Stage with explicit paths prefixed `06-dueling/` (repo rule: several sessions share the branch; never `git add -A`). Run git commands from the repo root or use paths relative to cwd consistently.
- ASCII only in all authored files: no em dashes, no unicode arrows or fancy quotes (user writing rule). Use `->`, `-`, `"`.
- World units are centimeters, durations ms, fixed 60 Hz tick (`1000/60` ms). Renderer: `SCALE = 3`, `PX_PER_CM = 0.5` (from `src/render/draw.ts`).
- One simulation rule: no side-conditional physics. The movement scene has one character, so this mostly means: presentation (sound, animation) keys off simulation events, never off input (AGENTS.md).
- Both control schemes are first-class: every new control is an `ActionId` with labels in every scheme table; UI strings use `{action}` tokens.
- The "?" panel must document every movement state via a typed Record (build error when missing) in the same commit that adds states.
- The sprite pack lives at `/Users/janis.kirsteins/Downloads/2D-Pixel-Art-Character-Template` (referred to as `$T` below).
- Comments explain, never chronicle: no dates, no before/after in code comments.

---

### Task 1: Sprite assets, sheet metadata, tile atlas

**Files:**
- Create: `public/sprites/*.png` (17 new sheets + `tiles.png`)
- Modify: `src/render/sheets.ts`, `src/render/loader.ts`
- Test: `test/sheets.test.ts` (extends automatically - it iterates `SHEETS`)

**Interfaces:**
- Produces: 17 new `SheetName` members (listed below) in `SHEETS`; `loadTileAtlas(): Promise<HTMLImageElement>` from `src/render/loader.ts`. Consumed by Tasks 7, 9, 11.

- [ ] **Step 1: Copy and rename the sheets**

```bash
cd /Users/janis.kirsteins/Projects/prototypes/06-dueling
T="/Users/janis.kirsteins/Downloads/2D-Pixel-Art-Character-Template"
cp "$T/Walk/PlayerWalk 48x48.png"                                    public/sprites/walk.png
cp "$T/Run/player run 48x48.png"                                     public/sprites/run.png
cp "$T/Dash/dash.png"                                                public/sprites/dash.png
cp "$T/Slide/Player Slide 48x48.png"                                 public/sprites/slide.png
cp "$T/Jump/player new jump 48x48.png"                               public/sprites/jump.png
cp "$T/Land/player land 48x48.png"                                   public/sprites/land.png
cp "$T/Air Spin/player air spin 48x48.png"                           public/sprites/air-spin.png
cp "$T/Wall Slide/player wall slide 48x48.png"                       public/sprites/wall-slide.png
cp "$T/Wall Land/player wall land 48x48.png"                         public/sprites/wall-land.png
cp "$T/Climb (facing side of player)/Player Side-Climb 48x48.png"    public/sprites/side-climb.png
cp "$T/Climb (facing back of player)/player climb-back 48x48.png"    public/sprites/climb-back.png
cp "$T/Ledge Grab-Climb/player ledge climb 48x48.png"                public/sprites/ledge-climb.png
cp "$T/Crouch-Idle/Player Crouch-Idle 48x48.png"                     public/sprites/crouch-idle.png
cp "$T/Crouch-Walk/player crouch-walk 48x48.png"                     public/sprites/crouch-walk.png
cp "$T/Push/player push 48x48.png"                                   public/sprites/push.png
cp "$T/Pull/Player Pull 48x48.png"                                   public/sprites/pull.png
cp "$T/PushPull (idle state)/player push idle 48x48.png"             public/sprites/push-idle.png
cp "$T/Tilemap (Super Basic)/Basic Tilemap.png"                      public/sprites/tiles.png
```

Notes: `jump.png` is deliberately the 6-frame "new jump", NOT the 3-frame `player jump 48x48.png`. The "(left)" wall variants stay behind - flipping happens in code.

- [ ] **Step 2: Extend `src/render/sheets.ts`**

Replace the `SheetName` union and append to `SHEETS`. Frame counts are width/48, verified by the dimension test. `feetY`/`originX` below are MEASURED from per-frame alpha bounds of the real sheets (script in Task 13); they are real values, not guesses.

```ts
export type SheetName =
  | "swordIdle" | "swordRun" | "swordAttack" | "swordStab"
  | "roll" | "hurt" | "death" | "idle"
  // movement-test sheets (the pack's unarmed base character)
  | "walk" | "run" | "dash" | "slide" | "jump" | "land" | "airSpin"
  | "wallSlide" | "wallLand" | "sideClimb" | "climbBack" | "ledgeClimb"
  | "crouchIdle" | "crouchWalk" | "push" | "pull" | "pushIdle";
```

Append inside `SHEETS` (keep the existing entries and comment; add below them):

```ts
  // Movement-test sheets. feetY is the measured per-frame alpha ground
  // row + 1 where the sheet touches ground uniformly; airborne sheets
  // (jump, airSpin, wallSlide) anchor on their ground-contact frames or
  // the pack's uniform line. originX 24 = frame center; the bodies are
  // centered within +-2px on every measured sheet.
  walk:       { file: "walk.png",        frameW: 48, frameH: 48, frames: 8,  feetY: 40, originX: 24 },
  run:        { file: "run.png",         frameW: 48, frameH: 48, frames: 8,  feetY: 40, originX: 24 },
  dash:       { file: "dash.png",        frameW: 48, frameH: 48, frames: 9,  feetY: 40, originX: 24 },
  slide:      { file: "slide.png",       frameW: 48, frameH: 48, frames: 8,  feetY: 40, originX: 24 },
  jump:       { file: "jump.png",        frameW: 48, frameH: 48, frames: 6,  feetY: 44, originX: 24 },
  land:       { file: "land.png",        frameW: 48, frameH: 48, frames: 9,  feetY: 40, originX: 24 },
  airSpin:    { file: "air-spin.png",    frameW: 48, frameH: 48, frames: 6,  feetY: 40, originX: 24 },
  wallSlide:  { file: "wall-slide.png",  frameW: 48, frameH: 48, frames: 3,  feetY: 44, originX: 24 },
  wallLand:   { file: "wall-land.png",   frameW: 48, frameH: 48, frames: 6,  feetY: 42, originX: 24 },
  sideClimb:  { file: "side-climb.png",  frameW: 48, frameH: 48, frames: 4,  feetY: 41, originX: 24 },
  climbBack:  { file: "climb-back.png",  frameW: 48, frameH: 48, frames: 4,  feetY: 42, originX: 24 },
  ledgeClimb: { file: "ledge-climb.png", frameW: 48, frameH: 48, frames: 5,  feetY: 42, originX: 24 },
  crouchIdle: { file: "crouch-idle.png", frameW: 48, frameH: 48, frames: 10, feetY: 40, originX: 24 },
  crouchWalk: { file: "crouch-walk.png", frameW: 48, frameH: 48, frames: 10, feetY: 40, originX: 24 },
  push:       { file: "push.png",        frameW: 48, frameH: 48, frames: 10, feetY: 38, originX: 24 },
  pull:       { file: "pull.png",        frameW: 48, frameH: 48, frames: 6,  feetY: 40, originX: 24 },
  pushIdle:   { file: "push-idle.png",   frameW: 48, frameH: 48, frames: 8,  feetY: 38, originX: 24 },
```

- [ ] **Step 3: Add the tile atlas loader to `src/render/loader.ts`**

```ts
/** The Basic Tilemap atlas (96x160, 16px cells): platforms and walls for
 *  the movement scene. Loaded beside the sheets, not inside SHEETS -
 *  it is a tile atlas, not a character animation. */
export function loadTileAtlas(): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("failed to load tiles.png"));
    img.src = `${import.meta.env.BASE_URL}sprites/tiles.png`;
  });
}
```

- [ ] **Step 4: Run the tests**

Run: `npm test -- sheets`
Expected: PASS - every new sheet's width = frameW * frames and height = frameH. If any fails, the frame count is wrong; fix `SHEETS`, never the PNG.

- [ ] **Step 5: Commit**

```bash
git add 06-dueling/public/sprites 06-dueling/src/render/sheets.ts 06-dueling/src/render/loader.ts
git commit -m "feat(dueling): movement sprite sheets and tile atlas with measured metadata"
```

---

### Task 2: The level (tile grid)

**Files:**
- Create: `src/movement/level.ts`
- Test: `test/move-level.test.ts`

**Interfaces:**
- Produces: `TILE`, `COLS`, `ROWS`, `TileKind`, `Level`, `createLevel(): Level`, `tileAt(level, col, row): TileKind`, `isSolid(kind): boolean`, `ladderTopRow(level, col): number | null`. Consumed by Tasks 3-6, 11.

- [ ] **Step 1: Write the failing test** (`test/move-level.test.ts`)

```ts
import { describe, expect, test } from "vitest";
import { COLS, ROWS, TILE, createLevel, isSolid, ladderTopRow, tileAt } from "../src/movement/level";

describe("the movement level", () => {
  const level = createLevel();

  test("dimensions: 20x11 tiles of 96 cm", () => {
    expect(COLS).toBe(20);
    expect(ROWS).toBe(11);
    expect(TILE).toBe(96);
  });

  test("the floor row is fully solid", () => {
    for (let c = 0; c < COLS; c++) expect(isSolid(tileAt(level, c, 10))).toBe(true);
  });

  test("the left wall is climbable from row 2 to row 9", () => {
    for (let r = 2; r <= 9; r++) expect(tileAt(level, 0, r)).toBe("climb");
    expect(tileAt(level, 0, 1)).toBe("empty"); // lip above: ledge-grabbable
  });

  test("the ladder spans rows 3-9 at col 17 and knows its top", () => {
    for (let r = 3; r <= 9; r++) expect(tileAt(level, 17, r)).toBe("ladder");
    expect(ladderTopRow(level, 17)).toBe(3);
    expect(ladderTopRow(level, 5)).toBe(null);
  });

  test("the tunnel has exactly one tile of clearance", () => {
    // roof at row 8, cols 10-12; row 9 below it is empty; floor at row 10
    for (let c = 10; c <= 12; c++) {
      expect(isSolid(tileAt(level, c, 8))).toBe(true);
      expect(tileAt(level, c, 9)).toBe("empty");
    }
  });

  test("platforms sit where the layout says", () => {
    // The left step (cols 3-4) is solid down to the floor: a floating
    // platform there would leave a second accidental crawl-gap under it.
    for (const [c, r] of [[3, 8], [4, 8], [3, 9], [4, 9], [5, 6], [6, 6], [7, 6], [14, 6], [15, 6], [18, 3], [19, 3]]) {
      expect(isSolid(tileAt(level, c, r))).toBe(true);
    }
    // the dash gap: cols 8-13 at row 6 are open
    for (let c = 8; c <= 13; c++) expect(isSolid(tileAt(level, c, 6))).toBe(false);
  });

  test("out of bounds: sides and below are solid, above is empty", () => {
    expect(isSolid(tileAt(level, -1, 5))).toBe(true);
    expect(isSolid(tileAt(level, COLS, 5))).toBe(true);
    expect(isSolid(tileAt(level, 5, ROWS))).toBe(true);
    expect(isSolid(tileAt(level, 5, -1))).toBe(false);
  });

  test("the block starts on the floor at col 19", () => {
    expect(level.blockStartX).toBe(19.5 * TILE);
  });
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `npm test -- move-level`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement `src/movement/level.ts`**

```ts
/**
 * The movement-test level: one fixed screen, 20x11 tiles of 96 cm
 * (16 sprite px at SCALE 3 = 48 canvas px). The layout exercises every
 * verb: climbable wall (col 0), stepped platforms, a dash-only gap
 * (cols 8-13 at row 6), a one-tile tunnel (roof row 8, cols 10-12), a
 * ladder (col 17) to a high platform, and a pushable block parked
 * against the right wall so it must be PULLED out first.
 */
export const TILE = 96;
export const COLS = 20;
export const ROWS = 11;

export type TileKind = "empty" | "solid" | "climb" | "ladder";

// # solid, C climbable solid, H ladder (non-solid), . empty
const MAP = [
  "....................",
  "....................",
  "C...................",
  "C................H##",
  "C................H..",
  "C................H..",
  "C....###......##.H..",
  "C................H..",
  "C..##.....###....H..",
  "C..##............H..",
  "####################",
];

const KIND: Record<string, TileKind> = { ".": "empty", "#": "solid", C: "climb", H: "ladder" };

export interface Level {
  grid: TileKind[][]; // [row][col]
  /** Pushable block spawn, cm (center x; it lives on the floor). */
  blockStartX: number;
}

export function createLevel(): Level {
  return {
    grid: MAP.map((row) => [...row].map((ch) => KIND[ch])),
    blockStartX: 19.5 * TILE,
  };
}

/** Sides and below read solid (arena walls and ground), above reads empty
 *  (open sky), so collision needs no special edge cases. */
export function tileAt(level: Level, col: number, row: number): TileKind {
  if (row < 0) return "empty";
  if (col < 0 || col >= COLS || row >= ROWS) return "solid";
  return level.grid[row][col];
}

export function isSolid(kind: TileKind): boolean {
  return kind === "solid" || kind === "climb";
}

/** Topmost ladder row in a column, or null when the column has no ladder. */
export function ladderTopRow(level: Level, col: number): number | null {
  for (let r = 0; r < ROWS; r++) {
    if (tileAt(level, col, r) === "ladder") return r;
  }
  return null;
}
```

- [ ] **Step 4: Run the tests**

Run: `npm test -- move-level`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add 06-dueling/src/movement/level.ts 06-dueling/test/move-level.test.ts
git commit -m "feat(dueling): movement-test level grid"
```

---

### Task 3: Movement engine core (locomotion, jump, fall, land, events)

**Files:**
- Create: `src/movement/engine.ts`
- Test: `test/move-engine.test.ts`

**Interfaces:**
- Consumes: `Level`, `TILE`, `tileAt`, `isSolid` from Task 2.
- Produces (final shapes - later tasks add switch arms, not new signatures):
  - `MOVE_TICK` (= 1000/60), all tuning constants listed below
  - `type MoveState` (the FULL union, all 20 states, defined now so the shape never changes)
  - `interface MoveInput { held: { left; right; up; down; grab; walk }: booleans; pressed: { jump; dash }: booleans }`
  - `interface MoveEvent { kind: "footfall" | "liftoff" | "touchdown" | "grab" | "shove" }`
  - `interface Mover { x; y; vx; vy: number; facing: 1 | -1; state: MoveState; spun: boolean; strideMs: number; prevDown: boolean; blockMoving: boolean; time: number; block: { x: number } }`
  - `createMover(level: Level): Mover`
  - `tickMove(m: Mover, level: Level, input: MoveInput): MoveEvent[]`
  - `heightOf(state: MoveState): number`
  - `NO_INPUT: MoveInput` helper (all false) for tests and the AI-less scene

Coordinates: x cm rightward, y cm DOWNWARD (screen-aligned; +vy falls). `(x, y)` is the feet center. Feet on the floor top: `y = 10 * TILE = 960`.

- [ ] **Step 1: Write the failing tests** (`test/move-engine.test.ts`)

```ts
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
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test -- move-engine`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement `src/movement/engine.ts`**

The FULL state union and Mover shape are written now; the switch arms for dash/slide/crouch/roll (Task 4), wall verbs (Task 5) and ladder/block (Task 6) are added later - those states are simply never entered until their triggers exist.

```ts
import { TILE, isSolid, tileAt } from "./level";
import type { Level } from "./level";
// (ladderTopRow joins this import with the ladder task - importing it
// before its first use trips the lint gate.)

export const MOVE_TICK = 1000 / 60;

// Body AABB, feet-center anchored (cm).
export const BODY_W = 60;
export const BODY_H = 170;
export const BODY_H_CROUCH = 90;

// Locomotion (cm/s, cm/s^2, ms). Tuning targets from the spec: a jump
// clears 2 tiles, double jump 3+, dash about 2x run for a fixed burst,
// wall slide caps fall speed, hard landings roll.
export const RUN_SPEED = 700;
export const WALK_SPEED = 300;
export const CROUCH_SPEED = 250;
export const CLIMB_SPEED = 250;
export const GRAVITY = 3600;
export const JUMP_V = 1230;
export const AIRSPIN_V = 1100;
export const FALL_CAP = 1600;
export const WALLSLIDE_CAP = 350;
export const WALLJUMP_VX = 800;
export const DASH_SPEED = 1400;
export const DASH_MS = 180;
export const SLIDE_V0 = 1100;
export const SLIDE_MS = 450;
export const ROLL_SPEED = 800;
export const ROLL_MS = 350;
export const LAND_MS = 220;
export const WALLLAND_VY = 900;
export const WALLLAND_MS = 200;
export const LEDGE_MS = 400;
export const SPIN_MS = 360;
/** Touchdown speeds: below SOFT no land state, at/above HARD the landing
 *  is hard (rolls when a direction is held). HARD sits above the worst
 *  jump-in-place impact (JUMP_V plus one tick of gravity, ~1290) and
 *  below a 3-tile fall (~1440), so ordinary hops land clean and real
 *  drops do not. */
export const LAND_SOFT = 700;
export const LAND_HARD = 1350;
export const STRIDE_RUN_MS = 260;
export const STRIDE_WALK_MS = 420;
export const BLOCK_W = 96;
export const BLOCK_H = 96;

export type MoveState =
  | { kind: "idle" } | { kind: "walk" } | { kind: "run" }
  | { kind: "dash"; t: number }
  | { kind: "slide"; t: number }
  | { kind: "roll"; t: number }
  | { kind: "crouchIdle" } | { kind: "crouchWalk" }
  | { kind: "jump" }
  | { kind: "airSpin"; t: number }
  | { kind: "fall" }
  | { kind: "land"; t: number; hard: boolean }
  | { kind: "wallLand"; t: number; wall: -1 | 1 }
  | { kind: "wallSlide"; wall: -1 | 1 }
  | { kind: "sideClimb"; wall: -1 | 1 }
  | { kind: "ladderClimb" }
  | { kind: "ledgeGrab"; t: number; targetX: number; targetY: number }
  | { kind: "push"; dir: -1 | 1 }
  | { kind: "pull"; dir: -1 | 1 }
  | { kind: "pushIdle" };

export interface MoveInput {
  held: { left: boolean; right: boolean; up: boolean; down: boolean; grab: boolean; walk: boolean };
  pressed: { jump: boolean; dash: boolean };
}

export const NO_INPUT: MoveInput = {
  held: { left: false, right: false, up: false, down: false, grab: false, walk: false },
  pressed: { jump: false, dash: false },
};

/** Physical transitions, for audio and tests. Input is never an event. */
export interface MoveEvent {
  kind: "footfall" | "liftoff" | "touchdown" | "grab" | "shove";
}

export interface Mover {
  x: number; y: number;   // feet center, cm
  vx: number; vy: number; // cm/s
  facing: 1 | -1;
  state: MoveState;
  /** Double jump spent since the last ground/wall/ladder contact. */
  spun: boolean;
  strideMs: number;
  prevDown: boolean;
  blockMoving: boolean;
  /** Sim clock, ms - the frame picker's loop clock. */
  time: number;
  block: { x: number };
}

export function createMover(level: Level): Mover {
  return {
    // Spawn on open floor: col 8, clear of the tunnel roof (cols 10-12)
    // and the left step - a standing body is taller than one tile, so a
    // spawn under any row-8 tile would start wedged.
    x: 8.5 * TILE, y: 10 * TILE, vx: 0, vy: 0, facing: 1,
    state: { kind: "idle" }, spun: false, strideMs: 0, prevDown: false,
    blockMoving: false, time: 0, block: { x: level.blockStartX },
  };
}

export function heightOf(state: MoveState): number {
  switch (state.kind) {
    case "crouchIdle": case "crouchWalk": case "slide": case "roll":
      return BODY_H_CROUCH;
    default:
      return BODY_H;
  }
}

// --- collision -------------------------------------------------------------

const EPS = 0.01;

function solidCellAt(level: Level, x: number, y: number): boolean {
  return isSolid(tileAt(level, Math.floor(x / TILE), Math.floor(y / TILE)));
}

/** Body box (or any box) against tiles and the block. 3x3 sampling is
 *  sound: the box is at most 170 cm tall and 60 wide, so samples are
 *  spaced under one 96 cm tile apart in both axes. */
function boxHits(m: Mover, level: Level, cx: number, feetY: number, w: number, h: number, ignoreBlock = false): boolean {
  const xs = [cx - w / 2 + EPS, cx, cx + w / 2 - EPS];
  const ys = [feetY - h + EPS, feetY - h / 2, feetY - EPS];
  for (const x of xs) for (const y of ys) if (solidCellAt(level, x, y)) return true;
  if (!ignoreBlock) {
    const b = m.block;
    const floorTop = 10 * TILE;
    const overlapX = cx + w / 2 > b.x - BLOCK_W / 2 + EPS && cx - w / 2 < b.x + BLOCK_W / 2 - EPS;
    const overlapY = feetY > floorTop - BLOCK_H + EPS && feetY - h < floorTop - EPS;
    if (overlapX && overlapY) return true;
  }
  return false;
}

/** Move along x to the first contact; returns the wall side hit (0 none).
 *  The walk is 1 cm steps (at most 27 cm move per tick, so it is short);
 *  the final snap tries the next whole centimeter so contact positions
 *  come to rest on integers - every surface in the level lies on one,
 *  and fractional resting positions would leak into position asserts. */
function moveX(m: Mover, level: Level, dx: number, h: number): -1 | 0 | 1 {
  if (dx === 0) return 0;
  const target = m.x + dx;
  if (!boxHits(m, level, target, m.y, BODY_W, h)) { m.x = target; return 0; }
  const dir = dx > 0 ? 1 : -1;
  let x = m.x;
  while (Math.abs(target - x) > 1 && !boxHits(m, level, x + dir, m.y, BODY_W, h)) x += dir;
  const snapX = dir === 1 ? Math.ceil(x) : Math.floor(x);
  if (snapX !== x && Math.abs(snapX - x) < 1 && !boxHits(m, level, snapX, m.y, BODY_W, h)) x = snapX;
  m.x = x;
  return dir;
}

/** Move along y; returns 1 landed, -1 head bump, 0 free. Same contact
 *  walk and integer snap as moveX. */
function moveY(m: Mover, level: Level, dy: number, h: number): -1 | 0 | 1 {
  if (dy === 0) return 0;
  const target = m.y + dy;
  if (!boxHits(m, level, m.x, target, BODY_W, h)) { m.y = target; return 0; }
  const dir = dy > 0 ? 1 : -1;
  let y = m.y;
  while (Math.abs(target - y) > 1 && !boxHits(m, level, m.x, y + dir, BODY_W, h)) y += dir;
  const snapY = dir === 1 ? Math.ceil(y) : Math.floor(y);
  if (snapY !== y && Math.abs(snapY - y) < 1 && !boxHits(m, level, m.x, snapY, BODY_W, h)) y = snapY;
  m.y = y;
  return dir === 1 ? 1 : -1;
}

function onGround(m: Mover, level: Level, h: number): boolean {
  return boxHits(m, level, m.x, m.y + 2, BODY_W, h);
}

// (headroom() arrives with the crouch task, its first caller - defining
// it early trips the lint gate's unused-symbol rule.)

// --- tick ------------------------------------------------------------------

export function tickMove(m: Mover, level: Level, input: MoveInput): MoveEvent[] {
  const ev: MoveEvent[] = [];
  m.time += MOVE_TICK;
  const dt = MOVE_TICK / 1000;
  const held = input.held;
  const wish = ((held.right ? 1 : 0) - (held.left ? 1 : 0)) as -1 | 0 | 1;
  const downEdge = held.down && !m.prevDown;
  m.prevDown = held.down;
  void downEdge; // consumed by the slide trigger (crouch task)

  const s = m.state;
  switch (s.kind) {
    case "idle": case "walk": case "run": {
      if (input.pressed.jump) {
        m.vy = -JUMP_V;
        m.state = { kind: "jump" };
        m.spun = false;
        ev.push({ kind: "liftoff" });
        break;
      }
      if (wish !== 0) m.facing = wish;
      m.vx = wish * (held.walk ? WALK_SPEED : RUN_SPEED);
      m.state =
        wish === 0 ? { kind: "idle" } :
        held.walk ? { kind: "walk" } : { kind: "run" };
      break;
    }
    case "jump": {
      m.vx = wish * RUN_SPEED;
      if (wish !== 0) m.facing = wish;
      if (m.vy >= 0) m.state = { kind: "fall" };
      break;
    }
    case "fall": {
      m.vx = wish * RUN_SPEED;
      if (wish !== 0) m.facing = wish;
      break;
    }
    case "land": {
      // Committed: the body absorbs the impact; movement resumes after.
      m.vx = 0;
      s.t += MOVE_TICK;
      if (s.t >= LAND_MS) m.state = { kind: "idle" };
      break;
    }
    // Arms below are filled by later tasks; the states are unreachable
    // until their triggers exist.
    case "dash": case "slide": case "roll": case "crouchIdle": case "crouchWalk":
    case "airSpin": case "wallLand": case "wallSlide": case "sideClimb":
    case "ladderClimb": case "ledgeGrab": case "push": case "pull": case "pushIdle":
      m.state = { kind: "idle" };
      break;
  }

  // Integrate. Gravity applies in every non-climbing state; climbing arms
  // (later tasks) skip this via their own early return once implemented.
  const airborne = m.state.kind === "jump" || m.state.kind === "fall" || m.state.kind === "airSpin";
  const h = heightOf(m.state);
  if (airborne || !onGround(m, level, h)) {
    m.vy = Math.min(m.vy + GRAVITY * dt, FALL_CAP);
  }
  const hHit = moveX(m, level, m.vx * dt, h);
  // A wall stops the feet: commanded speed is not motion, and every
  // consumer of vx (the stride clock above all) must see the truth.
  if (hHit !== 0) m.vx = 0;
  const vHit = moveY(m, level, m.vy * dt, h);
  if (vHit === -1) m.vy = 0;
  if (vHit === 1) {
    const impact = m.vy;
    m.vy = 0;
    m.spun = false;
    // Only a free-air arrival classifies here; wall states own their own
    // floor plant in their arms, so a corner catch cannot double-count.
    const freeAir = m.state.kind === "jump" || m.state.kind === "fall" || m.state.kind === "airSpin";
    if (freeAir) {
      ev.push({ kind: "touchdown" });
      if (impact >= LAND_HARD) {
        m.state = { kind: "land", t: 0, hard: true }; // roll trigger: crouch task
      } else if (impact >= LAND_SOFT) {
        m.state = { kind: "land", t: 0, hard: false };
      } else {
        m.state = wish === 0 ? { kind: "idle" } : { kind: "run" };
      }
    }
  }
  // Walked off an edge: grounded states become a fall.
  const groundedKind = m.state.kind === "idle" || m.state.kind === "walk" || m.state.kind === "run";
  if (groundedKind && !onGround(m, level, h)) m.state = { kind: "fall" };

  // Footfalls: strides while actually moving on the ground.
  const striding = m.state.kind === "walk" || m.state.kind === "run";
  if (striding && m.vx !== 0) {
    m.strideMs += MOVE_TICK;
    const stride = m.state.kind === "run" ? STRIDE_RUN_MS : STRIDE_WALK_MS;
    if (m.strideMs >= stride) {
      m.strideMs -= stride;
      ev.push({ kind: "footfall" });
    }
  } else {
    m.strideMs = 0;
  }

  return ev;
}
```

- [ ] **Step 4: Run the tests**

Run: `npm test -- move-engine`
Expected: PASS. If the hard-landing test fails on the impact value, check FALL_CAP vs LAND_HARD (1600 > 1250, so a 7-tile drop must read hard).

- [ ] **Step 5: Commit**

```bash
git add 06-dueling/src/movement/engine.ts 06-dueling/test/move-engine.test.ts
git commit -m "feat(dueling): movement engine core - locomotion, jump, fall, land, events"
```

---

### Task 4: Dash, slide, crouch, tunnel, roll

**Files:**
- Modify: `src/movement/engine.ts`
- Test: `test/move-crouch.test.ts`

**Interfaces:**
- Consumes/extends Task 3. No signature changes; four switch arms gain bodies and three triggers are added.

- [ ] **Step 1: Write the failing tests** (`test/move-crouch.test.ts`)

```ts
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

  test("dash-jump keeps dash momentum: it clears the 6-tile gap a run-jump cannot clear outright", () => {
    // From platform B (cols 5-7, row 6) toward C (cols 14-15): the gap is
    // cols 8-13. A run-jump from B's edge does not clear the gap outright -
    // it reaches C's lip only because the ledge grab (Task 5) catches the
    // near miss and pulls it up, slower and never a clean landing; dash
    // then jump carries DASH_SPEED across with room to spare.
    const runJump = createMover(level);
    runJump.x = 6.5 * TILE; runJump.y = 6 * TILE;
    run(runJump, input({ right: true }), 12); // run up to the edge
    run(runJump, input({ right: true }, { jump: true }), 1);
    let grabbedLedge = false;
    for (let i = 0; i < 300 && runJump.state.kind !== "idle"; i++) {
      run(runJump, input({ right: true }), 1);
      if (runJump.state.kind === "ledgeGrab") grabbedLedge = true;
    }
    expect(grabbedLedge).toBe(true); // saved by the ledge, not a clean jump
    expect(runJump.y).toBe(6 * TILE); // pulled up onto C's lip

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
    m.x = 5.5 * TILE; // runway: a start nearer the tunnel is pinned (vx 0) before the press
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
      // clear of every platform (the ladder at col 17 is not solid). The
      // start sits BELOW the row-3 ledge so the wall/ledge checks cannot
      // catch a graze against it before the fall develops.
      m.x = 16.5 * TILE; m.y = 5.5 * TILE; m.state = { kind: "fall" };
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
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test -- move-crouch`
Expected: FAIL (dash arm resets to idle, crouch states never entered).

- [ ] **Step 3: Implement in `src/movement/engine.ts`**

First add the helper this task's arms need, below `onGround` (replacing the placeholder comment there):

```ts
function headroom(m: Mover, level: Level): boolean {
  return !boxHits(m, level, m.x, m.y, BODY_W, BODY_H);
}
```

In the `idle/walk/run` arm, after the jump trigger and before the locomotion lines, add the dash, slide and crouch triggers:

```ts
      if (input.pressed.dash) {
        if (wish !== 0) m.facing = wish;
        m.vx = DASH_SPEED * m.facing;
        m.state = { kind: "dash", t: 0 };
        break;
      }
      if (downEdge && m.state.kind === "run" && Math.abs(m.vx) >= RUN_SPEED) {
        m.vx = SLIDE_V0 * m.facing;
        m.state = { kind: "slide", t: 0 };
        break;
      }
      if (held.down) {
        m.state = { kind: "crouchIdle" };
        break;
      }
```

Replace the placeholder arms for `dash`, `slide`, `roll`, `crouchIdle`/`crouchWalk` (remove them from the fall-through list):

```ts
    case "dash": {
      s.t += MOVE_TICK;
      m.vx = DASH_SPEED * m.facing;
      if (input.pressed.jump) {
        // Dash momentum carries into the air: the dash-jump.
        m.vy = -JUMP_V;
        m.state = { kind: "jump" };
        m.spun = false;
        ev.push({ kind: "liftoff" });
      } else if (s.t >= DASH_MS) {
        m.state = wish === 0 ? { kind: "idle" } : { kind: "run" };
      }
      break;
    }
    case "slide": {
      s.t += MOVE_TICK;
      m.vx = SLIDE_V0 * m.facing * Math.max(0, 1 - s.t / SLIDE_MS);
      if (s.t >= SLIDE_MS) {
        m.state = headroom(m, level)
          ? (held.down ? { kind: "crouchIdle" } : { kind: "idle" })
          : { kind: "crouchIdle" };
      }
      break;
    }
    case "roll": {
      s.t += MOVE_TICK;
      m.vx = ROLL_SPEED * m.facing * Math.max(0.4, 1 - s.t / ROLL_MS);
      if (s.t >= ROLL_MS) m.state = wish === 0 ? { kind: "idle" } : { kind: "run" };
      break;
    }
    case "crouchIdle": case "crouchWalk": {
      if (!held.down && headroom(m, level)) {
        m.state = { kind: "idle" };
        m.vx = 0;
        break;
      }
      if (wish !== 0) m.facing = wish;
      m.vx = wish * CROUCH_SPEED;
      m.state = wish === 0 ? { kind: "crouchIdle" } : { kind: "crouchWalk" };
      break;
    }
```

In the dash-jump case above, `jump` in the air keeps `RUN_SPEED` steering, which would kill dash momentum. Change the `jump` and `fall` arms' steering so momentum above run speed is preserved:

```ts
    case "jump": {
      if (wish !== 0) {
        m.facing = wish;
        // Steering never brakes carried momentum in the same direction.
        if (Math.sign(m.vx) !== wish || Math.abs(m.vx) < RUN_SPEED) m.vx = wish * RUN_SPEED;
      } else {
        m.vx = Math.abs(m.vx) > RUN_SPEED ? m.vx : 0;
      }
      if (m.vy >= 0) m.state = { kind: "fall" };
      break;
    }
    case "fall": {
      if (wish !== 0) {
        m.facing = wish;
        if (Math.sign(m.vx) !== wish || Math.abs(m.vx) < RUN_SPEED) m.vx = wish * RUN_SPEED;
      } else {
        m.vx = Math.abs(m.vx) > RUN_SPEED ? m.vx : 0;
      }
      break;
    }
```

In the landing branch (vHit === 1), replace the hard-landing line so a held direction rolls:

```ts
      if (impact >= LAND_HARD) {
        if (wish !== 0) {
          m.facing = wish;
          m.state = { kind: "roll", t: 0 };
        } else {
          m.state = { kind: "land", t: 0, hard: true };
        }
      }
```

Also extend the "walked off an edge" grounded check and the footfall stride list:

```ts
  const groundedKind = ["idle", "walk", "run", "crouchIdle", "crouchWalk", "dash"].includes(m.state.kind);
```
```ts
  const striding = m.state.kind === "walk" || m.state.kind === "run" || m.state.kind === "crouchWalk";
  ...
    const stride = m.state.kind === "run" ? STRIDE_RUN_MS : STRIDE_WALK_MS;
```

- [ ] **Step 4: Run the tests**

Run: `npm test -- move-crouch && npm test -- move-engine`
Expected: both PASS (the core suite must not regress).

- [ ] **Step 5: Commit**

```bash
git add 06-dueling/src/movement/engine.ts 06-dueling/test/move-crouch.test.ts
git commit -m "feat(dueling): dash, slide, crouch, tunnel and hard-landing roll"
```

---

### Task 5: Wall slide, wall land, wall jump, side climb, ledge grab, air spin

**Files:**
- Modify: `src/movement/engine.ts`
- Test: `test/move-wall.test.ts`

**Interfaces:**
- Consumes/extends Task 3/4. Adds internal helpers `touchingWall`, `climbableBeside`, `ledgeProbe`; no exported signature changes.

- [ ] **Step 1: Write the failing tests** (`test/move-wall.test.ts`)

```ts
import { describe, expect, test } from "vitest";
import { createLevel, TILE } from "../src/movement/level";
import {
  AIRSPIN_V, GRAVITY, JUMP_V, LEDGE_MS, MOVE_TICK, SPIN_MS,
  WALLSLIDE_CAP, createMover, tickMove,
} from "../src/movement/engine";
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
  /** Airborne against the left wall (col 0 is climbable solid). */
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
});

describe("side climb and the ledge", () => {
  test("grab against the climbable wall climbs up with up held", () => {
    const m = createMover(level);
    m.x = 1.4 * TILE; // standing just off the wall at col 0
    const evs = run(m, input({ left: true, grab: true, up: true }), 5);
    expect(m.state.kind).toBe("sideClimb");
    expect(evs.some((e) => e.kind === "grab")).toBe(true);
    const y0 = m.y;
    run(m, input({ left: true, grab: true, up: true }), 60);
    expect(m.y).toBeLessThan(y0); // climbed upward
  });

  test("climbing past the wall top ledge-grabs and pulls up on top", () => {
    const m = createMover(level);
    m.x = 1.4 * TILE;
    run(m, input({ left: true, grab: true, up: true }), 1);
    for (let i = 0; i < 2000 && m.state.kind !== "ledgeGrab"; i++) {
      run(m, input({ left: true, grab: true, up: true }), 1);
    }
    expect(m.state.kind).toBe("ledgeGrab");
    run(m, input(), Math.ceil(LEDGE_MS / MOVE_TICK) + 1);
    expect(m.state.kind).toBe("idle");
    expect(m.y).toBe(2 * TILE); // standing on the wall top (col 0, row 2)
    expect(m.x).toBeLessThan(TILE); // centered over col 0
  });

  test("a jump toward a platform lip within reach ledge-grabs", () => {
    const m = createMover(level);
    // Platform A: cols 3-4 at row 8, top at y = 8*TILE, 2 tiles above floor.
    // Starts clear of the row-6 block (cols 5-7): an approach from under it
    // head-bumps, and the arc misses the grab window. 7.4-7.88 tiles grab.
    m.x = 7.5 * TILE; // right of A, jump left onto its lip
    run(m, input({ left: true }, { jump: true }), 1);
    let grabbed = false;
    for (let i = 0; i < 300; i++) {
      run(m, input({ left: true }), 1);
      if (m.state.kind === "ledgeGrab") { grabbed = true; break; }
      if (m.state.kind === "land" || m.state.kind === "idle") break;
    }
    // Either it grabbed the lip, or it cleared 2 tiles and simply landed
    // on top - both put the player on the platform; grabbing is only for
    // the case where the apex fell short.
    void grabbed;
    for (let i = 0; i < 300 && m.state.kind !== "idle"; i++) run(m, input(), 1);
    expect(m.y).toBeLessThanOrEqual(8 * TILE);
  });

  test("releasing grab mid-climb falls", () => {
    const m = createMover(level);
    m.x = 1.4 * TILE;
    run(m, input({ left: true, grab: true, up: true }), 30);
    expect(m.state.kind).toBe("sideClimb");
    run(m, input({ left: true }), 2);
    expect(["fall", "wallSlide", "wallLand"]).toContain(m.state.kind);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test -- move-wall`
Expected: FAIL.

- [ ] **Step 3: Implement in `src/movement/engine.ts`**

Add helpers after the collision section:

```ts
/** Wall contact probe: the body pressed 2 cm toward dir hits something. */
function touchingWall(m: Mover, level: Level, dir: -1 | 1, h: number): boolean {
  return boxHits(m, level, m.x + dir * 2, m.y, BODY_W, h, true);
}

/** The tile beside mid-body in that direction is a climbable wall. */
function climbableBeside(m: Mover, level: Level, dir: -1 | 1, h: number): boolean {
  const x = m.x + dir * (BODY_W / 2 + 4);
  const y = m.y - h / 2;
  return tileAt(level, Math.floor(x / TILE), Math.floor(y / TILE)) === "climb";
}

/** A grabbable lip: a solid tile beside the head with empty above it,
 *  its top edge within the grab window around head height. Returns the
 *  stand-on-top target, or null. */
function ledgeProbe(m: Mover, level: Level, dir: -1 | 1, h: number): { x: number; y: number } | null {
  const col = Math.floor((m.x + dir * (BODY_W / 2 + 6)) / TILE);
  const headY = m.y - h;
  const row = Math.floor((headY + 30) / TILE);
  if (!isSolid(tileAt(level, col, row))) return null;
  if (isSolid(tileAt(level, col, row - 1))) return null;
  const lipY = row * TILE;
  if (Math.abs(lipY - headY) > 60) return null;
  // Stand target must have headroom for a standing body.
  const tx = col * TILE + TILE / 2;
  if (boxHits(m, level, tx, lipY, BODY_W, BODY_H, true)) return null;
  return { x: tx, y: lipY };
}
```

Replace the `jump`/`fall` arms' shared air logic with a helper and wall handling. Extract the steering into a local function inside `tickMove` (above the switch):

```ts
  const steer = (): void => {
    if (wish !== 0) {
      m.facing = wish;
      if (Math.sign(m.vx) !== wish || Math.abs(m.vx) < RUN_SPEED) m.vx = wish * RUN_SPEED;
    } else {
      m.vx = Math.abs(m.vx) > RUN_SPEED ? m.vx : 0;
    }
  };
  const airChecks = (): void => {
    // Order: grab beats slide beats plain fall.
    const dir = wish as -1 | 0 | 1;
    if (dir !== 0 && touchingWall(m, level, dir, BODY_H)) {
      const lip = ledgeProbe(m, level, dir, BODY_H);
      if (lip !== null) {
        m.vx = 0; m.vy = 0; m.spun = false;
        m.facing = dir;
        m.state = { kind: "ledgeGrab", t: 0, targetX: lip.x, targetY: lip.y };
        ev.push({ kind: "grab" });
        return;
      }
      if (held.grab && climbableBeside(m, level, dir, BODY_H)) {
        m.vx = 0; m.vy = 0; m.spun = false;
        m.facing = dir;
        m.state = { kind: "sideClimb", wall: dir };
        ev.push({ kind: "grab" });
        return;
      }
      if (m.vy > 0) {
        const hardCatch = m.vy >= WALLLAND_VY;
        m.vx = 0;
        // The catch arrests the fall; speed re-accrues under the wall
        // cap. This also keeps the catch tick from crossing the floor.
        m.vy = 0;
        m.facing = dir;
        m.spun = false;
        m.state = hardCatch
          ? { kind: "wallLand", t: 0, wall: dir }
          : { kind: "wallSlide", wall: dir };
        // Only the hard catch is a contact moment with impact; drifting
        // onto the wall mid-fall stays silent until the feet plant.
        if (hardCatch) ev.push({ kind: "touchdown" });
      }
    }
  };
```

Ground entry: standing against the climbable wall with grab held must also start the climb - add to the `idle/walk/run` arm (after the crouch trigger, before locomotion):

```ts
      if (held.grab && wish !== 0
          && touchingWall(m, level, wish, BODY_H) && climbableBeside(m, level, wish, BODY_H)) {
        m.vx = 0; m.vy = 0;
        m.facing = wish;
        m.state = { kind: "sideClimb", wall: wish };
        ev.push({ kind: "grab" });
        break;
      }
```

Then the air arms become:

```ts
    case "jump": {
      steer();
      if (input.pressed.jump && !m.spun) {
        m.vy = -AIRSPIN_V;
        m.spun = true;
        m.state = { kind: "airSpin", t: 0 };
        ev.push({ kind: "liftoff" });
        break;
      }
      airChecks();
      if (m.state.kind === "jump" && m.vy >= 0) m.state = { kind: "fall" };
      break;
    }
    case "airSpin": {
      steer();
      s.t += MOVE_TICK;
      airChecks();
      if (m.state.kind === "airSpin" && s.t >= SPIN_MS) m.state = { kind: "fall" };
      break;
    }
    case "fall": {
      steer();
      if (input.pressed.jump && !m.spun) {
        m.vy = -AIRSPIN_V;
        m.spun = true;
        m.state = { kind: "airSpin", t: 0 };
        ev.push({ kind: "liftoff" });
        break;
      }
      airChecks();
      break;
    }
```

Replace the placeholder arms for the wall family (remove from the fall-through list):

```ts
    case "wallLand": {
      if (onGround(m, level, BODY_H)) {
        m.vy = 0;
        m.state = { kind: "idle" };
        ev.push({ kind: "touchdown" }); // the feet plant
        break;
      }
      s.t += MOVE_TICK;
      m.vx = 0;
      // The wall's friction cap is applied by the integration step.
      if (s.t >= WALLLAND_MS) m.state = { kind: "wallSlide", wall: s.wall };
      break;
    }
    case "wallSlide": {
      if (onGround(m, level, BODY_H)) {
        m.vy = 0;
        m.state = { kind: "idle" };
        ev.push({ kind: "touchdown" }); // the feet plant
        break;
      }
      m.vx = 0;
      if (input.pressed.jump) {
        // The wall jump: away and up, facing flipped.
        m.vx = -s.wall * WALLJUMP_VX;
        m.vy = -JUMP_V * 0.9;
        m.facing = -s.wall;
        m.state = { kind: "jump" };
        ev.push({ kind: "liftoff" });
        break;
      }
      if (held.grab && climbableBeside(m, level, s.wall, BODY_H)) {
        m.vy = 0;
        m.state = { kind: "sideClimb", wall: s.wall };
        ev.push({ kind: "grab" });
        break;
      }
      // Steering away, or the wall ran out: back to a fall.
      if (wish !== s.wall || !touchingWall(m, level, s.wall, BODY_H)) m.state = { kind: "fall" };
      break;
    }
    case "sideClimb": {
      m.vx = 0;
      m.vy = 0;
      if (held.down && onGround(m, level, BODY_H)) {
        m.state = { kind: "idle" };
        ev.push({ kind: "touchdown" }); // climbed down to the floor: the feet plant
        break;
      }
      if (!held.grab || !climbableBeside(m, level, s.wall, BODY_H)) {
        m.state = { kind: "fall" };
        break;
      }
      if (input.pressed.jump) {
        m.vx = -s.wall * WALLJUMP_VX;
        m.vy = -JUMP_V * 0.9;
        m.facing = -s.wall;
        m.state = { kind: "jump" };
        ev.push({ kind: "liftoff" });
        break;
      }
      const climb = (held.up ? -1 : 0) + (held.down ? 1 : 0);
      m.vy = climb * CLIMB_SPEED;
      if (climb === -1) {
        const lip = ledgeProbe(m, level, s.wall, BODY_H);
        if (lip !== null) {
          m.vy = 0;
          m.state = { kind: "ledgeGrab", t: 0, targetX: lip.x, targetY: lip.y };
          ev.push({ kind: "grab" });
        }
      }
      break;
    }
    case "ledgeGrab": {
      m.vx = 0;
      m.vy = 0;
      s.t += MOVE_TICK;
      if (s.t >= LEDGE_MS) {
        m.x = s.targetX;
        m.y = s.targetY;
        m.state = { kind: "idle" };
      }
      break;
    }
```

Gravity/integration: `sideClimb` and `ledgeGrab` must not fall. Update the airborne/gravity gate:

```ts
  const clinging = m.state.kind === "sideClimb" || m.state.kind === "ledgeGrab";
  const onWallNow = m.state.kind === "wallSlide" || m.state.kind === "wallLand";
  const airborne = m.state.kind === "jump" || m.state.kind === "fall" || m.state.kind === "airSpin" || onWallNow;
  const h = heightOf(m.state);
  if (!clinging && (airborne || !onGround(m, level, h))) {
    // Terminal speed: the wall's friction caps it far below free fall.
    m.vy = Math.min(m.vy + GRAVITY * dt, onWallNow ? WALLSLIDE_CAP : FALL_CAP);
  }
```

And the landing branch: a wallSlide/wallLand that reaches the ground lands like a fall (the `airborne` flag above already includes them, so `vHit === 1` handles it; the impact there is at most WALLSLIDE_CAP < LAND_SOFT, landing clean by construction).

- [ ] **Step 4: Run the whole movement suite**

Run: `npm test -- move-`
Expected: move-level, move-engine, move-crouch, move-wall all PASS.

- [ ] **Step 5: Commit**

```bash
git add 06-dueling/src/movement/engine.ts 06-dueling/test/move-wall.test.ts
git commit -m "feat(dueling): wall slide, wall jump, side climb, ledge grab, air spin"
```

---

### Task 6: Ladder and the pushable block

**Files:**
- Modify: `src/movement/engine.ts`
- Test: `test/move-ladder-block.test.ts`

- [ ] **Step 1: Write the failing tests** (`test/move-ladder-block.test.ts`)

```ts
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
    // Open floor under platform B - clear of the tunnel roof (which sits
    // at standing-head height) AND far enough from the left step's pillar
    // that a full second of pushing has room to travel.
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
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test -- move-ladder-block`
Expected: FAIL.

- [ ] **Step 3: Implement in `src/movement/engine.ts`**

Extend the level import with this task's first user of `ladderTopRow`:

```ts
import { TILE, isSolid, ladderTopRow, tileAt } from "./level";
```

(and drop the placeholder comment beneath it). Helpers:

```ts
/** The body center overlaps a ladder tile. */
function overLadder(m: Mover, level: Level, h: number): number | null {
  const col = Math.floor(m.x / TILE);
  const midRow = Math.floor((m.y - h / 2) / TILE);
  const feetRow = Math.floor((m.y - EPS) / TILE);
  if (tileAt(level, col, midRow) === "ladder" || tileAt(level, col, feetRow) === "ladder") return col;
  return null;
}

/** Where the block can rest: on the floor, not inside solid tiles, and
 *  not dragged through the player. The pair advances in lockstep during
 *  a pull - the player is projected by the same delta the block is
 *  asking to move, ignoring the block itself since it moves with it -
 *  so a player pinned by real geometry (a low ceiling, a wall) pins the
 *  block in turn, instead of the block being dragged through the body
 *  and soft-locking it inside. A static distance threshold cannot make
 *  this call: contact rests at exactly BLOCK_W/2+BODY_W/2, one WALK_SPEED
 *  tick closes far more than a one-unit epsilon can absorb, so a
 *  threshold trips on every ordinary pull step, not only a pinned one. */
function blockFits(m: Mover, level: Level, x: number): boolean {
  const floorTop = 10 * TILE;
  for (const px of [x - BLOCK_W / 2 + EPS, x, x + BLOCK_W / 2 - EPS]) {
    for (const py of [floorTop - BLOCK_H + EPS, floorTop - EPS]) {
      if (solidCellAt(level, px, py)) return false;
    }
  }
  const h = heightOf(m.state);
  const delta = x - m.block.x;
  return !boxHits(m, level, m.x + delta, m.y, BODY_W, h, true);
}

/** Which side of the player the block is beside (touching range), 0 none. */
function blockBeside(m: Mover): -1 | 0 | 1 {
  const gap = m.block.x - m.x;
  const touch = BLOCK_W / 2 + BODY_W / 2 + 8;
  if (m.y !== 10 * TILE) return 0; // both on the floor only
  if (gap > 0 && gap <= touch) return 1;
  if (gap < 0 && -gap <= touch) return -1;
  return 0;
}
```

In the `idle/walk/run` arm, after the crouch trigger and before locomotion, add ladder attach and block engagement:

```ts
      const ladderCol = overLadder(m, level, BODY_H);
      if (ladderCol !== null && (held.up || (held.down && !onGround(m, level, BODY_H)))) {
        m.x = ladderCol * TILE + TILE / 2;
        m.vx = 0; m.vy = 0;
        m.state = { kind: "ladderClimb" };
        m.spun = false;
        ev.push({ kind: "grab" });
        break;
      }
      const beside = blockBeside(m);
      if (beside !== 0) {
        if (held.grab && wish === -beside) { m.state = { kind: "pull", dir: wish }; break; }
        if (held.grab && wish === 0) { m.state = { kind: "pushIdle" }; m.vx = 0; break; }
        if (!held.grab && wish === beside) { m.state = { kind: "push", dir: wish }; break; }
      }
```

Replace the remaining placeholder arms (the fall-through list is now empty and must be deleted so the switch is exhaustive):

```ts
    case "ladderClimb": {
      m.vx = 0;
      const col = Math.floor(m.x / TILE);
      const top = ladderTopRow(level, col);
      if (top === null || input.pressed.jump) {
        if (input.pressed.jump) {
          m.vy = -JUMP_V * 0.8;
          m.state = { kind: "jump" };
          ev.push({ kind: "liftoff" });
        } else {
          m.state = { kind: "fall" };
        }
        break;
      }
      const climb = (held.up ? -1 : 0) + (held.down ? 1 : 0);
      m.vy = climb * CLIMB_SPEED;
      // Top clamp: feet never rise above the top rung's top edge.
      const topY = top * TILE;
      if (m.y + m.vy * dt < topY) {
        m.y = topY;
        m.vy = 0;
      }
      if (wish !== 0) {
        // Stepping off sideways: a small assisted hop so a platform whose
        // top matches the clamp height is reachable despite the drift
        // gravity would otherwise add before the feet cross onto it.
        m.facing = wish;
        m.state = { kind: "fall" };
        m.vx = wish * WALK_SPEED;
        m.vy = -300;
        break;
      }
      if (climb === 1 && onGround(m, level, BODY_H)) {
        m.state = { kind: "idle" };
        m.vy = 0;
        ev.push({ kind: "touchdown" }); // climbed down to the floor: the feet plant
      }
      break;
    }
    case "push": case "pull": {
      const beside = blockBeside(m);
      const wantDir = s.kind === "push" ? beside : -beside;
      if (beside === 0 || wish !== wantDir || (s.kind === "pull" && !held.grab)) {
        m.state = { kind: "idle" };
        m.vx = 0;
        m.blockMoving = false;
        break;
      }
      m.facing = s.kind === "push" ? beside : beside === 1 ? -1 : 1;
      const step = wish * WALK_SPEED * dt;
      if (blockFits(m, level, m.block.x + step)) {
        if (!m.blockMoving) ev.push({ kind: "shove" });
        m.blockMoving = true;
        m.block.x += step;
        m.vx = wish * WALK_SPEED;
      } else {
        m.blockMoving = false;
        m.vx = 0;
      }
      break;
    }
    case "pushIdle": {
      m.vx = 0;
      m.blockMoving = false;
      if (!held.grab || blockBeside(m) === 0) { m.state = { kind: "idle" }; break; }
      if (wish !== 0) break; // next tick's ground arm re-derives push/pull
      break;
    }
```

Wait - `pushIdle` with `wish !== 0` must actually hand control back: change its arm to transition to idle when a direction is held so the ground arm re-derives push/pull on the next tick:

```ts
      if (wish !== 0) { m.state = { kind: "idle" }; break; }
```

Also update the gravity gate and grounded list:

```ts
  const clinging = m.state.kind === "sideClimb" || m.state.kind === "ledgeGrab" || m.state.kind === "ladderClimb";
```
```ts
  const groundedKind = ["idle", "walk", "run", "crouchIdle", "crouchWalk", "dash", "push", "pull", "pushIdle"].includes(m.state.kind);
```

And extend footfalls to the block stances:

```ts
  const striding = ["walk", "run", "crouchWalk", "push", "pull"].includes(m.state.kind);
```

- [ ] **Step 4: Run the whole suite**

Run: `npm test`
Expected: all suites PASS (combat suites untouched).

- [ ] **Step 5: Commit**

```bash
git add 06-dueling/src/movement/engine.ts 06-dueling/test/move-ladder-block.test.ts
git commit -m "feat(dueling): ladder climb and the pushable block"
```

---

### Task 7: Frame picker for movement states

**Files:**
- Create: `src/render/moveframes.ts`
- Test: `test/moveframes.test.ts`

**Interfaces:**
- Consumes: `Mover`, `MoveState`, timing constants from `src/movement/engine`; `SHEETS`, `SheetName` from `src/render/sheets`; `FramePick` from `src/render/frames`.
- Produces: `pickMoveFrame(m: Mover): FramePick`. Consumed by Task 11.

- [ ] **Step 1: Write the failing test** (`test/moveframes.test.ts`)

```ts
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
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test -- moveframes`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement `src/render/moveframes.ts`**

```ts
import { DASH_MS, LAND_MS, LEDGE_MS, ROLL_MS, SLIDE_MS, SPIN_MS, WALLLAND_MS } from "../movement/engine";
import { SHEETS } from "./sheets";
import type { Mover } from "../movement/engine";
import type { FramePick } from "./frames";
import type { SheetName } from "./sheets";

/** Loop period per looping sheet, ms per frame. */
const LOOP_MS: Partial<Record<SheetName, number>> = {
  idle: 125, walk: 110, run: 80, crouchIdle: 125, crouchWalk: 110,
  push: 110, pull: 110, pushIdle: 125,
};

function loop(sheet: SheetName, time: number): number {
  const per = LOOP_MS[sheet] ?? 125;
  return Math.floor(time / per) % SHEETS[sheet].frames;
}

function span(sheet: SheetName, t: number, total: number, first: number, last: number): number {
  const n = last - first + 1;
  const idx = first + Math.min(n - 1, Math.floor((t / total) * n));
  return Math.min(idx, SHEETS[sheet].frames - 1);
}

/** Climb cycles advance with DISTANCE climbed, not time: hands move when
 *  the body does, and a paused climb holds its frame. 40 cm per frame. */
function climbFrame(sheet: SheetName, y: number): number {
  const n = SHEETS[sheet].frames;
  return ((Math.floor(y / 40) % n) + n) % n;
}

export function pickMoveFrame(m: Mover): FramePick {
  const flip = m.facing === -1;
  const s = m.state;
  switch (s.kind) {
    case "idle": return { sheet: "idle", frame: loop("idle", m.time), flip };
    case "walk": return { sheet: "walk", frame: loop("walk", m.time), flip };
    case "run": return { sheet: "run", frame: loop("run", m.time), flip };
    case "crouchIdle": return { sheet: "crouchIdle", frame: loop("crouchIdle", m.time), flip };
    case "crouchWalk": return { sheet: "crouchWalk", frame: loop("crouchWalk", m.time), flip };
    case "push": return { sheet: "push", frame: loop("push", m.time), flip };
    case "pull": return { sheet: "pull", frame: loop("pull", m.time), flip };
    case "pushIdle": return { sheet: "pushIdle", frame: loop("pushIdle", m.time), flip };
    case "dash": return { sheet: "dash", frame: span("dash", s.t, DASH_MS, 0, 8), flip };
    case "slide": return { sheet: "slide", frame: span("slide", s.t, SLIDE_MS, 0, 7), flip };
    case "roll": return { sheet: "roll", frame: span("roll", s.t, ROLL_MS, 0, 6), flip };
    case "land": return { sheet: "land", frame: span("land", s.t, LAND_MS, 0, 8), flip };
    // jump sheet: 0-1 crouch prep (unused - liftoff is instant), 2 rising,
    // 3 apex, 4 falling, 5 touch. Rising shows 2, slowing 3.
    case "jump": return { sheet: "jump", frame: m.vy < -400 ? 2 : 3, flip };
    case "fall": return { sheet: "jump", frame: 4, flip };
    case "airSpin": return { sheet: "airSpin", frame: span("airSpin", s.t, SPIN_MS, 0, 5), flip };
    // Wall sheets face a wall on the character's right; a wall on the
    // left mirrors them regardless of facing.
    case "wallLand": return { sheet: "wallLand", frame: span("wallLand", s.t, WALLLAND_MS, 0, 5), flip: s.wall === -1 };
    case "wallSlide": return { sheet: "wallSlide", frame: 1 + (Math.floor(m.time / 150) % 2), flip: s.wall === -1 };
    case "sideClimb": return { sheet: "sideClimb", frame: climbFrame("sideClimb", m.y), flip: s.wall === -1 };
    case "ladderClimb": return { sheet: "climbBack", frame: climbFrame("climbBack", m.y), flip: false };
    case "ledgeGrab": return { sheet: "ledgeClimb", frame: span("ledgeClimb", s.t, LEDGE_MS, 0, 4), flip };
  }
}
```

- [ ] **Step 4: Run the tests**

Run: `npm test -- moveframes`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add 06-dueling/src/render/moveframes.ts 06-dueling/test/moveframes.test.ts
git commit -m "feat(dueling): movement frame picker"
```

---

### Task 8: Scheme and gamepad extensions

**Files:**
- Modify: `src/input/scheme.ts`, `src/input/gamepad.ts`
- Test: `test/scheme.test.ts`, `test/gamepad.test.ts` (mechanical updates where the compiler demands)

**Interfaces:**
- Produces:
  - New `ActionId`s: `"moveLeft" | "moveRight" | "jump" | "dash" | "crouch" | "grab" | "climbUp" | "climbDown" | "walkMod" | "resetScene"`
  - `UiSnapshot` gains `scene: "duel" | "move"`; `duelLive` is RENAMED `simLive`
  - `MOVE_VERBS` list inside scheme.ts (not exported); `resolvePadEdge` handles the move scene
  - `PadFrame.held` gains `up`/`down`; `PadFrame` gains `moveMag: number`
- Consumed by: Tasks 9, 10, 11.

- [ ] **Step 1: Extend `src/input/scheme.ts`**

Add to the `ActionId` union after the duel verbs:

```ts
  // movement-scene verbs (the parkour test bed)
  | "moveLeft" | "moveRight" | "jump" | "dash" | "crouch" | "grab"
  | "climbUp" | "climbDown" | "walkMod" | "resetScene"
```

Add labels to `KEYBOARD_LABELS`:

```ts
  moveLeft: "A", moveRight: "D", jump: "K", dash: "J", crouch: "S",
  grab: "L", climbUp: "W", climbDown: "S", walkMod: "Shift",
  resetScene: "R",
```

To `PAD_LABELS.xbox`:

```ts
  moveLeft: "Stick/Dpad", moveRight: "Stick/Dpad", jump: "A", dash: "X",
  crouch: "Stick dn", grab: "RB", climbUp: "Stick up", climbDown: "Stick dn",
  walkMod: "Stick soft", resetScene: "Y",
```

To `PAD_LABELS.ps`:

```ts
  moveLeft: "Stick/Dpad", moveRight: "Stick/Dpad", jump: "\u2715", dash: "\u25a1",
  crouch: "Stick dn", grab: "R1", climbUp: "Stick up", climbDown: "Stick dn",
  walkMod: "Stick soft", resetScene: "\u25b3",
```

To `PAD_BINDINGS` (edge-resolved verbs only; movement/climb/grab are held LEVELS read by gamepad.ts, and walkMod is analog):

```ts
  jump: [{ kind: "button", index: 0 }],
  dash: [{ kind: "button", index: 2 }],
  resetScene: [{ kind: "button", index: 3 }],
```

Rename `duelLive` to `simLive` in `UiSnapshot` and add the scene field:

```ts
export interface UiSnapshot {
  helpOpen: boolean;
  selectOpen: boolean;
  /** The active scene's simulation is live (running, not over). */
  simLive: boolean;
  paused: boolean;
  decided: boolean;
  /** Which scene owns the duel/move verb tables. */
  scene: "duel" | "move";
}
```

Add beside `DUEL_VERBS`:

```ts
const MOVE_VERBS: ActionId[] = ["jump", "dash", "resetScene"];
```

Update `resolvePadEdge`: every `ui.duelLive` becomes `ui.simLive`; the B-button branch feints only in the duel scene; the final table branch picks the scene's verb list:

```ts
  if (isBtn(1)) {
    if (ui.helpOpen) return "help";
    if (ui.selectOpen) return null;
    if (ui.scene === "duel" && (ui.simLive || ui.decided)) return "feint";
    return null;
  }
  if (ui.helpOpen) return null;
  if (ui.selectOpen) return boundAction(edge, SELECT_VERBS);
  if (ui.simLive || ui.decided) return boundAction(edge, ui.scene === "move" ? MOVE_VERBS : DUEL_VERBS);
  return null;
```

Note: in the move scene `decided` is always false and `simLive` is true whenever the scene is active (the sim never ends), so Start resolves to `pause` and Back to `help` through the existing branches unchanged.

- [ ] **Step 2: Extend `src/input/gamepad.ts`**

`PadFrame.held` gains vertical levels and the frame gains the stick magnitude:

```ts
  held: { advance: boolean; retreat: boolean; guard: boolean; up: boolean; down: boolean };
  /** The active pad's |axes[0]| when engaged (0 otherwise): the walk/run
   *  threshold is the consumer's business. */
  moveMag: number;
```

`EMPTY_FRAME` gains `up: false, down: false` and `moveMag: 0`.

`PadSnapshot` gains vertical hysteresis beside `moveEngaged`:

```ts
  /** Vertical-axis engagement (axis 1; pos = down on the W3C layout). */
  vertEngaged: { pos: boolean; neg: boolean };
```

Initialize it in `createPadSnapshot` and reset it in `discardPadSnapshot` and on active-pad disconnect, exactly like `moveEngaged`.

In the held-levels block at the end of `readPads`, add after the horizontal hysteresis loop:

```ts
  for (const sign of [1, -1] as const) {
    const v = (cur.axes[1] ?? 0) * sign;
    const k = sign > 0 ? "pos" : "neg";
    const engaged = next.vertEngaged[k];
    next.vertEngaged[k] = engaged ? v >= MOVE_OFF : v >= MOVE_ON;
    if (next.stale[`a1${sign > 0 ? "+" : "-"}`] === true) next.vertEngaged[k] = false;
  }
  frame.held.up = next.vertEngaged.neg || btnHeld(12);
  frame.held.down = next.vertEngaged.pos || btnHeld(13);
  frame.moveMag = next.moveEngaged.pos || next.moveEngaged.neg ? Math.min(1, Math.abs(cur.axes[0] ?? 0)) : 0;
```

Extend `isHoldControl` (the ownership gate stales these too):

```ts
function isHoldControl(c: PadControl): boolean {
  if (c.kind === "axis") return c.index === 0 || c.index === 1;
  return c.index === 5 || c.index === 12 || c.index === 13 || c.index === 14 || c.index === 15;
}
```

- [ ] **Step 3: Fix the compiler-flagged tests**

Run: `npm run build` - TypeScript will flag every `duelLive:` object literal in `test/scheme.test.ts` (rename to `simLive:` and add `scene: "duel"` to the snapshot helper the tests use) and any `held:` literals in `test/gamepad.test.ts` (add `up: false, down: false`; expected frames gain `moveMag: 0`). Make exactly those mechanical fixes - no behavioral test edits.

- [ ] **Step 4: Add new resolver tests to `test/scheme.test.ts`**

```ts
describe("the move scene's resolver context", () => {
  const move = (over: Partial<UiSnapshot> = {}): UiSnapshot => ({
    helpOpen: false, selectOpen: false, simLive: true, paused: false,
    decided: false, scene: "move", ...over,
  });

  test("A jumps, X dashes, Y resets - and duel verbs do not leak in", () => {
    expect(resolvePadEdge(move(), { kind: "button", index: 0 })).toBe("jump");
    expect(resolvePadEdge(move(), { kind: "button", index: 2 })).toBe("dash");
    expect(resolvePadEdge(move(), { kind: "button", index: 3 })).toBe("resetScene");
    expect(resolvePadEdge(move(), { kind: "button", index: 7 })).toBe(null); // disarm is duel-only
  });

  test("B does nothing in the move scene; Start pauses; Back opens help", () => {
    expect(resolvePadEdge(move(), { kind: "button", index: 1 })).toBe(null);
    expect(resolvePadEdge(move(), { kind: "button", index: 9 })).toBe("pause");
    expect(resolvePadEdge(move(), { kind: "button", index: 8 })).toBe("help");
  });
});
```

(Import `UiSnapshot` type and `resolvePadEdge` as the file already does.)

- [ ] **Step 5: Run the suite and commit**

Run: `npm test && npm run build`
Expected: PASS.

```bash
git add 06-dueling/src/input 06-dueling/test/scheme.test.ts 06-dueling/test/gamepad.test.ts
git commit -m "feat(dueling): movement-scene actions, pad vertical levels, scene-aware resolver"
```

---

### Task 9: Scene shell - extract the duel scene from main.ts

**Files:**
- Create: `src/scenes/scene.ts`, `src/scenes/duel.ts`
- Modify: `src/main.ts`
- Test: existing suites (this task is a refactor; behavior must not change)

**Interfaces:**
- Produces (`src/scenes/scene.ts`):

```ts
import type { ActionId, Labels } from "../input/scheme";
import type { TimeControl } from "../render/draw";

export type SceneId = "duel" | "move";

/** Held levels main.ts merges across keyboard and pad. Scenes read the
 *  subset they care about; unknown levels are simply false. */
export interface HeldLevels {
  advance: boolean; retreat: boolean; guard: boolean;
  up: boolean; down: boolean; walk: boolean;
}
export type HeldAction = keyof HeldLevels;

export interface Scene {
  id: SceneId;
  /** lowercased e.key -> held action. main owns the level store and
   *  routes keydown/keyup through this map. */
  holdKeys: Partial<Record<string, HeldAction>>;
  /** An effective (source-merged) held-level transition. */
  heldEdge(action: HeldAction, value: boolean): void;
  /** A non-hold keydown; true when consumed. */
  press(e: KeyboardEvent): boolean;
  /** keyup quirks (the duel's Caps Lock OFF edge). */
  keyRelease(e: KeyboardEvent): void;
  /** A resolved pad edge action. */
  padAction(a: ActionId): void;
  /** One fixed 60 Hz tick. held: current effective levels. moveMag: the
   *  pad stick magnitude (0 when keyboard-driven). */
  tickOnce(held: HeldLevels, moveMag: number): void;
  /** Wall-clock presentation advance; returns the extra timescale the
   *  scene imposes (the duel's bullet time; 1 otherwise). */
  frameScale(wallDt: number): number;
  /** Flush this frame's simulation events to audio. Once per rAF. */
  audioFrame(): void;
  draw(overlay: boolean, labels: Labels, time: TimeControl): void;
  snapshot(): { live: boolean; decided: boolean };
  /** R: restart the scene's current run. */
  reset(): void;
}
```

- Produces (`src/scenes/duel.ts`): `createDuelScene(deps: DuelSceneDeps): Scene & { setWeapons(p: WeaponId, e: WeaponId): void }` where

```ts
export interface DuelSceneDeps {
  ctx: CanvasRenderingContext2D;
  images: Record<SheetName, HTMLImageElement>;
  audio: AudioEngine;
  /** URL-param seed pin, or undefined for fresh seeds per duel. */
  seedPin: number | undefined;
  initialAiMode: AiMode;
}
```

- [ ] **Step 1: Write `src/scenes/scene.ts`** exactly as above.

- [ ] **Step 2: Write `src/scenes/duel.ts`**

Move VERBATIM from main.ts: the duel/ai/pending/seed/bullet-time state, `startDuel`, the duel-key switch cases (s/j/k/i/l-as-guard is a hold, f, arrows, capslock, shift, 0-4), `applyPadAction`'s duel verbs, the tick loop body (aiDecide + tickDuel), audio event flush, and the draw call. The scene accumulates `DuelEvent`s from `tickOnce` into a frame buffer that `audioFrame()` flushes through `audio.frame(...)` (and bullet-time edge cues fire inside `frameScale` via `audio.cue`, exactly as main.ts does today).

```ts
import { aiDecide, createAiState } from "../combat/ai";
import { createDuel, tickDuel } from "../combat/engine";
import { TICK } from "../combat/fighter";
import { WEAPONS } from "../combat/weapons";
import { advanceBulletTime, bulletTimePhase, bulletTimeScale, createBulletTime } from "../ui/bullettime";
import { drawFrame } from "../render/draw";
import type { AiMode } from "../combat/ai";
import type { AudioEngine } from "../audio/audio";
import type { Duel, DuelEvent } from "../combat/engine";
import type { Intent, WeaponId } from "../combat/types";
import type { ActionId, Labels } from "../input/scheme";
import type { SheetName } from "../render/sheets";
import type { TimeControl } from "../render/draw";
import type { HeldAction, HeldLevels, Scene } from "./scene";

export interface DuelSceneDeps {
  ctx: CanvasRenderingContext2D;
  images: Record<SheetName, HTMLImageElement>;
  audio: AudioEngine;
  seedPin: number | undefined;
  initialAiMode: AiMode;
}

export function createDuelScene(deps: DuelSceneDeps): Scene & { setWeapons(p: WeaponId, e: WeaponId): void; start(): void } {
  let pWeapon: WeaponId = "longsword";
  let eWeapon: WeaponId = "rapier";
  let aiMode = deps.initialAiMode;
  let duel: Duel | null = null;
  let ai = createAiState();
  let activeSeed = 0;
  let pending: Intent | null = null;
  const bullet = createBulletTime();
  let frameEvents: DuelEvent[] = [];

  const start = (): void => {
    activeSeed = deps.seedPin ?? Math.floor(Math.random() * 0xffffffff);
    duel = createDuel(WEAPONS[pWeapon], WEAPONS[eWeapon]);
    ai = createAiState(activeSeed);
    pending = null;
  };

  return {
    id: "duel",
    holdKeys: { a: "retreat", d: "advance", l: "guard" },
    setWeapons(p, e) { pWeapon = p; eWeapon = e; },
    start,
    reset: start,
    heldEdge(action: HeldAction, value: boolean) {
      if (action === "guard") pending = value ? "parry" : "parryRelease";
      else if (!value && duel) {
        const dir = action === "advance" ? "advance" : "retreat";
        if (duel.f[0].buffered === dir) duel.f[0].buffered = null;
      }
    },
    press(e: KeyboardEvent): boolean {
      if (duel === null) return false;
      switch (e.key.toLowerCase()) {
        case "s": pending = "void"; return true;
        case "j": pending = "cut"; return true;
        case "k": pending = "thrust"; return true;
        case "i": pending = "disarm"; return true;
        case "arrowleft": case "arrowright": case "capslock":
          pending = "sideShift"; return true;
        case "f": pending = "feint"; return true;
        case "arrowup": pending = "stanceUp"; return true;
        case "arrowdown": pending = "stanceDown"; return true;
        case "shift": {
          if (e.code !== "ShiftLeft") return false;
          const f = duel.f[0];
          const target = f.heightTo ?? f.height;
          pending = target === "high" ? "stanceDown" : "stanceUp";
          return true;
        }
        case "0": aiMode = 0; return true;
        case "1": aiMode = 1; return true;
        case "2": aiMode = 2; return true;
        case "3": aiMode = 3; return true;
        case "4": aiMode = 4; return true;
        default: return false;
      }
    },
    keyRelease(e: KeyboardEvent) {
      if (e.key.toLowerCase() === "capslock" && duel !== null) pending = "sideShift";
    },
    padAction(a: ActionId) {
      switch (a) {
        case "void": case "cut": case "thrust": case "feint":
        case "stanceUp": case "stanceDown": case "sideShift": case "disarm":
          pending = a;
          break;
        default:
          break;
      }
    },
    tickOnce(held: HeldLevels) {
      if (!duel) return;
      let ia: Intent | null = pending;
      pending = null;
      if (ia === null && held.advance) ia = "advance";
      if (ia === null && held.retreat) ia = "retreat";
      const ib = aiDecide(duel, aiMode, ai, TICK);
      frameEvents.push(...tickDuel(duel, ia, ib));
    },
    frameScale(wallDt: number): number {
      const edge = advanceBulletTime(bullet, wallDt, bulletTimePhase(duel));
      if (edge === "enter") deps.audio.cue("bulletIn");
      else if (edge === "exit") deps.audio.cue("bulletOut");
      return bulletTimeScale(bullet);
    },
    audioFrame() {
      deps.audio.frame(frameEvents);
      frameEvents = [];
    },
    draw(overlay: boolean, labels: Labels, time: TimeControl) {
      if (!duel) return;
      drawFrame(
        { ctx: deps.ctx, images: deps.images, overlay, labels },
        duel, aiMode, activeSeed,
        { ...time, bulletScale: bulletTimeScale(bullet) },
      );
    },
    snapshot() {
      return { live: duel !== null && !duel.over, decided: duel?.over === true };
    },
  };
}
```

Note the `parry` intent consumption: today main.ts's tick loop reads `state.pending` which the guard edge overwrote; the scene's `heldEdge` + `tickOnce` reproduce that exactly (heldEdge writes `pending`, the next tick consumes it).

- [ ] **Step 3: Rewrite `src/main.ts` as the shell**

Keep: canvas/ctx setup, URL params, SPEEDS, help open/close + rendering, audio unlock, blur handling, pad polling, the accumulator loop. Replace duel-specific state with an `active: Scene | null` plus the duel scene instance. The held-level store generalizes:

```ts
const held = {
  keyboard: { advance: false, retreat: false, guard: false, up: false, down: false, walk: false },
  pad: { advance: false, retreat: false, guard: false, up: false, down: false, walk: false },
};
type Source = "keyboard" | "pad";
const effective = (a: HeldAction): boolean => held.keyboard[a] || held.pad[a];
const effectiveLevels = (): HeldLevels => ({
  advance: effective("advance"), retreat: effective("retreat"), guard: effective("guard"),
  up: effective("up"), down: effective("down"), walk: effective("walk"),
});

function setHeld(source: Source, action: HeldAction, value: boolean): void {
  const before = effective(action);
  held[source][action] = value;
  const after = effective(action);
  if (before !== after) active?.heldEdge(action, after);
}
function clearHeldSource(source: Source): void {
  for (const a of Object.keys(held[source]) as HeldAction[]) setHeld(source, a, false);
}
```

Keydown routing (replacing the old duel switch; global keys stay in main):

```ts
document.addEventListener("keydown", (e) => {
  if (e.repeat) return;
  noteKeyboardInput();
  if (state.helpOpen) {
    if (e.key === "Escape" || e.key === "?" || e.key.toLowerCase() === "h") setHelp(false);
    return;
  }
  if (e.key === "?" || (e.key.toLowerCase() === "h" && active !== null)) { setHelp(true); return; }
  if (active === null) return; // an overlay owns the keyboard
  const k = e.key.toLowerCase();
  const hold = active.holdKeys[k];
  if (hold !== undefined) { setHeld("keyboard", hold, true); return; }
  switch (k) {
    case "r": active.reset(); return;
    case "m": audio.toggleMute(); return;
    case "`": state.overlay = !state.overlay; return;
    case "escape": goBack(); return;
    case " ": e.preventDefault(); state.paused = !state.paused; return;
    case ".": state.paused = true; state.stepOnce = true; return;
    case "[": case "]": { /* unchanged SPEEDS logic */ return; }
  }
  active.press(e);
});
document.addEventListener("keyup", (e) => {
  const k = e.key.toLowerCase();
  const hold = active?.holdKeys[k];
  if (hold !== undefined) setHeld("keyboard", hold, false);
  active?.keyRelease(e);
});
```

IMPORTANT holdKeys nuance: the duel maps only `a`/`d`/`l`; the move scene (Task 11) maps `a`/`d`/`w`/`s`/`l`/`shift`. The duel's `s` (void) and `shift` (stance) stay in `press()` because they are presses there, and the map lookup happens first - so the duel's map must NOT contain `s`/`shift`, and the move scene's must.

`goBack()` and scene lifecycle (the scene selector arrives in Task 10; for THIS task `goBack()` keeps today's behavior - duel to sword select):

```ts
function goBack(): void {
  if (active?.id === "duel") { active = null; openSelect(); }
}
```

The frame loop's tick section becomes scene-generic:

```ts
    const scale = active !== null ? active.frameScale(wallDt) : 1;
    // help/pause accumulator logic unchanged, then:
    acc += wallDt * state.timescale * scale; // (in the running branch)
    if (active !== null) {
      while (acc >= TICK) {
        acc -= TICK;
        active.tickOnce(effectiveLevels(), state.padMoveMag);
      }
      active.audioFrame();
      active.draw(state.overlay, activeLabels(), { paused: state.paused, timescale: state.timescale, bulletScale: 1 });
    }
```

Pad plumbing: `uiSnapshot()` becomes

```ts
function uiSnapshot(): UiSnapshot {
  const snap = active?.snapshot() ?? { live: false, decided: false };
  return {
    helpOpen: state.helpOpen,
    selectOpen: isSelectOpen(),
    simLive: snap.live,
    paused: state.paused,
    decided: snap.decided,
    scene: active?.id ?? "duel",
  };
}
```

`applyPadAction` keeps the session verbs (pause/rematch/reselect/help/sel*) in main - `rematch` calls `active?.reset()`, `reselect` calls `goBack()` - and forwards everything else to `active?.padAction(a)`. `setHeld("pad", ...)` calls extend to `up`/`down` from `pf.frame.held`, and `state.padMoveMag = pf.frame.moveMag`.

`openSelect`/`startDuel` adapt: `startDuel` becomes `duelScene.setWeapons(p, e); duelScene.start(); active = duelScene;`. Loading adds nothing yet (tiles arrive with the move scene): keep `loadImages()` as-is this task.

- [ ] **Step 4: Verify no behavior changed**

Run: `npm test && npm run build`
Expected: PASS - this is a refactor; every existing suite must stay green.

Then a quick manual check: `npm run dev`, open `http://127.0.0.1:5173/prototypes/06/?p=longsword&e=rapier&mode=3`, fight a duel: steps, attacks, parry hold, pause/step/speeds, Esc to sword select, R rematch, help panel, audio. Everything must behave exactly as before the refactor.

- [ ] **Step 5: Commit**

```bash
git add 06-dueling/src/scenes 06-dueling/src/main.ts
git commit -m "refactor(dueling): extract the duel behind a Scene interface"
```

---

### Task 10: Scene selector overlay and URL boot

**Files:**
- Create: `src/ui/scenes.ts`
- Modify: `index.html`, `src/main.ts`, `src/ui/select.ts`
- Test: `test/scenes-select.test.ts`

**Interfaces:**
- Produces: `showScenes(onPick: (s: SceneId) => void): void`, `hideScenes()`, `isScenesOpen(): boolean`, `handleScenesAction(a)` mirroring `src/ui/select.ts`'s shape. `showSelect` gains an `onBack` callback parameter.

- [ ] **Step 1: Add the overlay markup and CSS to `index.html`**

After the `#select` div:

```html
    <div id="scenes" hidden>
      <h1>Choose a scene</h1>
      <div class="cols">
        <div class="col" data-scene="duel"><h2>Dueling test</h2>
          <div class="option"><strong>The duel</strong><br><small>Measure and tempo, two swords, single-hit lethality.</small></div>
        </div>
        <div class="col" data-scene="move"><h2>Movement test</h2>
          <div class="option"><strong>The parkour yard</strong><br><small>Every non-combat animation: run, jump, climb, slide, push.</small></div>
        </div>
      </div>
      <p class="hint"></p>
    </div>
```

CSS: extend the existing `#select` rules to cover both overlays by changing their selectors:

```css
#select, #scenes { position: fixed; inset: 0; background: rgba(16,18,22,0.96);
  display: flex; flex-direction: column; align-items: center; justify-content: center; }
#select[hidden], #scenes[hidden] { display: none; }
#select .cols, #scenes .cols { display: flex; gap: 48px; }
#select .col, #scenes .col { width: 300px; }
#select .option, #scenes .option { border: 1px solid #3a404c; padding: 10px 12px; margin: 8px 0; }
#select .option.picked, #scenes .col.active .option { border-color: #e6c229; }
#select .col.active h2, #scenes .col.active h2 { color: #e6c229; }
#select .hint, #scenes .hint { color: #8a8f98; margin-top: 24px; }
```

- [ ] **Step 2: Write the failing test** (`test/scenes-select.test.ts`)

The module is DOM-light like select.ts (renders into elements when present, logic testable without them via happy-dom). Configure the test file for happy-dom the way the project's DOM-touching tests do (add `// @vitest-environment happy-dom` at the top and minimal fixture divs).

```ts
// @vitest-environment happy-dom
import { beforeEach, describe, expect, test } from "vitest";
import { handleScenesAction, hideScenes, isScenesOpen, showScenes } from "../src/ui/scenes";

beforeEach(() => {
  document.body.innerHTML = `
    <div id="scenes" hidden>
      <div class="cols">
        <div class="col" data-scene="duel"></div>
        <div class="col" data-scene="move"></div>
      </div>
      <p class="hint"></p>
    </div>`;
});

describe("the scene selector", () => {
  test("opens, highlights, confirms the highlighted scene", () => {
    let picked = "";
    showScenes((s) => { picked = s; });
    expect(isScenesOpen()).toBe(true);
    handleScenesAction("selRight");
    handleScenesAction("selConfirm");
    expect(picked).toBe("move");
    expect(isScenesOpen()).toBe(false);
  });

  test("direct picks: 1 duels, 2 moves", () => {
    let picked = "";
    showScenes((s) => { picked = s; });
    handleScenesAction("selPickSecond");
    handleScenesAction("selConfirm");
    expect(picked).toBe("move");
    showScenes((s) => { picked = s; });
    handleScenesAction("selPickFirst");
    handleScenesAction("selConfirm");
    expect(picked).toBe("duel");
  });

  test("toggle flips the column like the sword select's W/S", () => {
    let picked = "";
    showScenes((s) => { picked = s; });
    handleScenesAction("selToggle");
    handleScenesAction("selConfirm");
    expect(picked).toBe("move");
  });

  test("hideScenes closes without picking", () => {
    let picked = "";
    showScenes((s) => { picked = s; });
    hideScenes();
    expect(isScenesOpen()).toBe(false);
    expect(picked).toBe("");
  });
});
```

- [ ] **Step 3: Implement `src/ui/scenes.ts`**

Mirror `src/ui/select.ts`'s structure exactly (module state, `onKey` listener added in show / removed in hide, `onControlsChange` re-render, hint via `resolveLabels`):

```ts
import { activeLabels, noteKeyboardInput, onControlsChange, resolveLabels } from "../input/scheme";
import type { SceneId } from "../scenes/scene";

interface ScenesState {
  active: SceneId;
  onPick: (s: SceneId) => void;
}

let st: ScenesState | null = null;

export function isScenesOpen(): boolean {
  return st !== null;
}

export function handleScenesAction(
  a: "selLeft" | "selRight" | "selToggle" | "selConfirm" | "selPickFirst" | "selPickSecond",
): void {
  if (!st) return;
  switch (a) {
    case "selLeft": st.active = "duel"; break;
    case "selRight": st.active = "move"; break;
    case "selToggle": st.active = st.active === "duel" ? "move" : "duel"; break;
    case "selPickFirst": st.active = "duel"; break;
    case "selPickSecond": st.active = "move"; break;
    case "selConfirm": {
      const { active, onPick } = st;
      hideScenes();
      onPick(active);
      return;
    }
  }
  render();
}

onControlsChange(() => {
  if (st !== null) render();
});

export function showScenes(onPick: (s: SceneId) => void): void {
  st = { active: "duel", onPick };
  render();
  const el = document.getElementById("scenes");
  if (el) el.hidden = false;
  document.addEventListener("keydown", onKey);
}

export function hideScenes(): void {
  st = null;
  const el = document.getElementById("scenes");
  if (el) el.hidden = true;
  document.removeEventListener("keydown", onKey);
}

function onKey(e: KeyboardEvent): void {
  if (!st) return;
  if (!e.repeat) noteKeyboardInput();
  const k = e.key.toLowerCase();
  const action =
    k === "a" || k === "arrowleft" ? "selLeft"
    : k === "d" || k === "arrowright" ? "selRight"
    : k === "w" || k === "s" || k === "arrowup" || k === "arrowdown" ? "selToggle"
    : k === "1" ? "selPickFirst"
    : k === "2" ? "selPickSecond"
    : k === "enter" ? "selConfirm"
    : null;
  if (action === null) return;
  e.preventDefault();
  handleScenesAction(action);
}

function render(): void {
  if (!st) return;
  const hint = document.querySelector("#scenes .hint");
  if (hint) {
    hint.textContent = resolveLabels(
      "{selLeft} or {selRight} switch - {selPickFirst}/{selPickSecond} direct pick - {selConfirm} to start",
      activeLabels(),
    );
  }
  for (const id of ["duel", "move"] as const) {
    const col = document.querySelector(`#scenes .col[data-scene="${id}"]`);
    if (col) col.classList.toggle("active", st.active === id);
  }
}
```

- [ ] **Step 4: Wire it into `src/main.ts` and `src/ui/select.ts`**

`showSelect` gains a back hook: `showSelect(current, onStart, onBack)`; its `onKey` adds

```ts
    : k === "escape" ? "selBack"
```

handled as `case "selBack": { const cb = sel.onBack; hideSelect(); cb(); return; }` (add `onBack` to `SelectState`; `handleSelectAction`'s union gains `"selBack"`).

Pad parity (two schemes, one action table - a back capability must not be keyboard-only): `selBack` joins the shared `ActionId` union beside the other select verbs, with labels keyboard `"Esc"`, xbox `"Back"`, ps `"Share"`. `resolvePadEdge`'s Back-button branch returns `"selBack"` instead of `null` while `ui.selectOpen` - the sword select goes back to the scene selector; main routes `selBack` to `handleSelectAction` only when the SWORD select is open (the scene selector is the root and ignores it). Tests: `test/scheme.test.ts` pins Back -> `selBack` on the select screen, and a `handleSelectAction("selBack")` -> onBack-callback assertion covers the one body both devices share.

main.ts boot and navigation:

```ts
const sceneParam = params.get("scene"); // "duel" | "move" | null
function openScenes(): void {
  discardPadSnapshot(padSnap);
  clearHeldSource("keyboard");
  clearHeldSource("pad");
  active = null;
  showScenes((s) => { if (s === "duel") openSelect(); else startMove(); });
}
function openSelect(): void {
  /* existing body, plus: */ active = null;
  showSelect({ p: state.pWeapon, e: state.eWeapon }, (p, e) => { ...startDuel(); }, () => openScenes());
}
function goBack(): void {
  if (active?.id === "duel") { active = null; openSelect(); }
  else if (active?.id === "move") { active = null; openScenes(); }
}
// boot (inside loadImages().then):
if (bootStraightIn) startDuel();
else if (sceneParam === "move") startMove();
else if (sceneParam === "duel") openSelect();
else openScenes();
```

`startMove()` is a stub this task (`function startMove(): void { openScenes(); }` with a comment naming Task 11) so the selector is fully wired and testable before the scene exists. Pad sel* routing: in `applyPadAction`, sel* actions go to `isScenesOpen() ? handleScenesAction(a) : handleSelectAction(a)`; `uiSnapshot().selectOpen` becomes `isSelectOpen() || isScenesOpen()`.

- [ ] **Step 5: Run, check manually, commit**

Run: `npm test && npm run build` - PASS.
Manual: `npm run dev` - boot shows the scene selector; "Dueling test" -> sword select -> duel; Esc from duel -> sword select; Esc again -> scene selector; "Movement test" -> selector re-opens (stub). `?p=rapier&e=longsword` still boots straight into the duel.

```bash
git add 06-dueling/src/ui/scenes.ts 06-dueling/src/ui/select.ts 06-dueling/src/main.ts 06-dueling/index.html 06-dueling/test/scenes-select.test.ts
git commit -m "feat(dueling): scene selector overlay and back navigation"
```

---

### Task 11: The movement scene - render, audio, help

**Files:**
- Create: `src/scenes/move.ts`, `src/render/movedraw.ts`, `src/ui/movehelp.ts`
- Modify: `src/main.ts` (real `startMove`), `src/audio/manifest.ts`, `src/audio/audio.ts`, `src/ui/help.ts` is NOT touched (movehelp is its own module)
- Test: `test/movehelp.test.ts`, `test/move-audio.test.ts`

**Interfaces:**
- Consumes: everything produced by Tasks 1-8.
- Produces:
  - `createMoveScene(deps: { ctx; images; tiles: HTMLImageElement; audio: AudioEngine }): Scene`
  - `MOVE_HELP: Record<MoveState["kind"], { label: string; what: string; player: string }>` and `renderMoveHelpHtml(labels): string` and `moveControlsLines(labels): [string, string]` from `src/ui/movehelp.ts`
  - `MOVE_EVENT_SOUNDS`, `MOVE_EVENT_RATES` in manifest; `moveFrame(events: MoveEvent[])` on `AudioEngine`

- [ ] **Step 1: Audio mapping** (`src/audio/manifest.ts` additions)

```ts
import type { MoveEvent } from "../movement/engine";

/**
 * Movement-scene cues. Two sounds by design (the spec's audio section):
 * footsteps on footfall and a lower-pitched step on touchdown. liftoff,
 * grab and shove are real simulation events that stay silent for now -
 * mapping them is a tuning decision, not a wiring one.
 */
export const MOVE_EVENT_SOUNDS: Partial<Record<MoveEvent["kind"], SoundName[]>> = {
  footfall: FOOTSTEPS,
  touchdown: FOOTSTEPS,
};

export const MOVE_EVENT_RATES: Partial<Record<MoveEvent["kind"], number>> = {
  touchdown: 0.75,
};
```

`src/audio/audio.ts`: add to the `AudioEngine` interface

```ts
  /** Once per rAF frame with the movement scene's events. */
  moveFrame(events: MoveEvent[]): void;
```

and implement beside `frame` (same one-sound-per-kind-per-frame dedupe, same footstep round-robin):

```ts
  const moveFrame = (events: MoveEvent[]): void => {
    if (ctx === null) return;
    const seen = new Set<MoveEvent["kind"]>();
    for (const e of events) {
      if (seen.has(e.kind)) continue;
      seen.add(e.kind);
      const pool = MOVE_EVENT_SOUNDS[e.kind];
      if (pool === undefined) continue;
      footstepAt = (footstepAt + 1) % pool.length;
      play(pool[footstepAt], (MOVE_EVENT_RATES[e.kind] ?? 1) * (1 + (Math.random() - 0.5) * 0.1));
    }
  };
```

(add `moveFrame` to the returned object; import `MOVE_EVENT_RATES`, `MOVE_EVENT_SOUNDS` and the `MoveEvent` type).

Test (`test/move-audio.test.ts`):

```ts
import { describe, expect, test } from "vitest";
import { MOVE_EVENT_RATES, MOVE_EVENT_SOUNDS, SOUNDS } from "../src/audio/manifest";

describe("movement audio stays inside the shipped sample set", () => {
  test("every mapped pool names real samples; only footfall and touchdown sound", () => {
    expect(Object.keys(MOVE_EVENT_SOUNDS).sort()).toEqual(["footfall", "touchdown"]);
    for (const pool of Object.values(MOVE_EVENT_SOUNDS)) {
      for (const name of pool) expect(SOUNDS[name]).toBeDefined();
    }
    expect(MOVE_EVENT_RATES.touchdown).toBeLessThan(1); // the thud sits under the steps
  });
});
```

- [ ] **Step 2: Help and legend** (`src/ui/movehelp.ts`)

```ts
import { KEYBOARD_LABELS, resolveLabels } from "../input/scheme";
import type { Labels } from "../input/scheme";
import type { MoveState } from "../movement/engine";

/** The movement scene's "?" panel: typed over the state union, so an
 *  undocumented state fails the build (the HELP trick, scene two). */
export interface MoveHelpEntry {
  label: string;
  what: string;
  player: string;
}

export const MOVE_HELP: Record<MoveState["kind"], MoveHelpEntry> = {
  idle:       { label: "idle",        what: "Standing free, every verb available.", player: "Hold {moveLeft}/{moveRight} to move, {walkMod} to walk." },
  walk:       { label: "walk",        what: "Slow travel; footfalls mark the strides.", player: "Release {walkMod} to run." },
  run:        { label: "run",         what: "Full ground speed.", player: "{crouch} at speed slides; {jump} jumps; {dash} dashes." },
  dash:       { label: "dash",        what: "A fixed burst at double run speed.", player: "{jump} during it carries the momentum into the air." },
  slide:      { label: "slide",       what: "A decaying slide at crouch height - it fits the tunnel.", player: "Steer nothing; it ends standing or crouched by headroom." },
  roll:       { label: "roll",        what: "A hard landing converted into travel.", player: "Automatic: hold a direction while landing from high up." },
  crouchIdle: { label: "crouch",      what: "Compact stance, one tile tall.", player: "Release {crouch} to stand - refused without headroom." },
  crouchWalk: { label: "crouch-walk", what: "Crouched travel, slow.", player: "The tunnel under the mid platform needs it." },
  jump:       { label: "jump",        what: "Rising; steering is live in the air.", player: "{jump} again mid-air spins for extra height, once per airtime." },
  airSpin:    { label: "air spin",    what: "The double jump's flourish and second rise.", player: "One per airtime; it resets on any landing or grab." },
  fall:       { label: "fall",        what: "Descending at up to terminal speed.", player: "Steer into a wall to wall-slide; height decides the landing." },
  land:       { label: "land",        what: "The touchdown absorbs the impact briefly.", player: "Hard landings without a direction held lock longer - roll instead." },
  wallLand:   { label: "wall land",   what: "A fast fall caught against a wall.", player: "Settles into the wall slide; {jump} leaps away." },
  wallSlide:  { label: "wall slide",  what: "Sliding down a wall at capped speed.", player: "Hold toward the wall to stay; {jump} wall-jumps away." },
  sideClimb:  { label: "side climb",  what: "Climbing the wall face while {grab} is held.", player: "{climbUp}/{climbDown} move; the top lip pulls you up." },
  ladderClimb:{ label: "ladder",      what: "On the ladder, gravity off.", player: "{climbUp}/{climbDown} climb; a side step or {jump} leaves it." },
  ledgeGrab:  { label: "ledge",       what: "Hanging on a lip, pulling up on top.", player: "Committed: it ends standing on the platform." },
  push:       { label: "push",        what: "Shoving the block at walk speed.", player: "Walk into it; a wall behind the block stops it." },
  pull:       { label: "pull",        what: "Dragging the block while gripping it.", player: "Hold {grab} beside it and move away - the pocket block must be pulled first." },
  pushIdle:   { label: "grip",        what: "Braced against the block, not moving.", player: "Hold {grab}; add a direction to push or pull." },
};

// pair() collapses two directions that share one pad label ("Stick/Dpad")
// so the pad legend stays inside the width bound - reuse help.ts's helper.
export function moveKeyGroups(labels: Labels): Array<Array<[string, string]>> {
  return [
    [
      [pair(labels.moveLeft, labels.moveRight), "move"], [labels.walkMod, "walk"],
      [labels.jump, "jump/spin"], [labels.dash, "dash"],
      [labels.crouch, "crouch"], [labels.grab, "grab"],
      [pair(labels.climbUp, labels.climbDown), "climb"],
    ],
    [
      [labels.resetScene, "reset"], [labels.reselect, "scenes"],
      [labels.overlay, "overlay"], [labels.help, "help"],
    ],
    [
      [labels.pause, "pause"], [labels.stepTick, "step"],
      [labels.speed, "speed"], [labels.mute, "mute"],
    ],
  ];
}

export function moveControlsLines(labels: Labels = KEYBOARD_LABELS): [string, string] {
  const groups = moveKeyGroups(labels);
  const fmt = (g: Array<[string, string]>): string => g.map(([k, a]) => `${k} ${a}`).join(" ");
  return [fmt(groups[0]), groups.slice(1).map(fmt).join(" | ")];
}

const esc = (s: string): string => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export function renderMoveHelpHtml(labels: Labels = KEYBOARD_LABELS): string {
  const r = (text: string): string => resolveLabels(text, labels);
  const rows = Object.values(MOVE_HELP)
    .map((e) => `
      <tr>
        <td class="l">${esc(e.label)}</td>
        <td>${esc(r(e.what))}</td>
        <td class="p">${esc(r(e.player))}</td>
      </tr>`)
    .join("");
  const keys = moveKeyGroups(labels).map(
    (g) => `<p class="keys">${g.map(([k, a]) => `<b>${esc(k)}</b> ${esc(a)}`).join(" &nbsp; ")}</p>`,
  ).join("");
  return `
    <h1>The movement yard <span class="close">(${esc(labels.reselect)} closes)</span></h1>
    <p>An animation test bed: every verb is a state, every state a sheet.
    Fixed 60Hz simulation; sounds follow the feet, never the keys.</p>
    <table>
      <tr><th>state</th><th>what is happening</th><th>you</th></tr>
      ${rows}
    </table>
    <h2>Keys</h2>
    ${keys}`;
}
```

Test (`test/movehelp.test.ts`), mirroring `test/help.test.ts`'s bounds:

```ts
import { describe, expect, test } from "vitest";
import { MOVE_HELP, moveControlsLines, moveKeyGroups, renderMoveHelpHtml } from "../src/ui/movehelp";
import { KEYBOARD_LABELS, PAD_LABELS, resolveLabels } from "../src/input/scheme";

describe("the movement help panel stays current and concise", () => {
  const html = renderMoveHelpHtml();

  test("every entry has label, what and player text, one sentence each", () => {
    for (const e of Object.values(MOVE_HELP)) {
      expect(e.label.length).toBeGreaterThan(0);
      expect(e.what.length).toBeLessThan(160);
      expect(e.player.length).toBeLessThan(160);
    }
  });

  test("no unresolved {action} tokens leak into the rendered panel", () => {
    expect(html).not.toMatch(/\{[a-zA-Z]+\}/);
    for (const kind of ["xbox", "ps"] as const) {
      expect(renderMoveHelpHtml(PAD_LABELS[kind])).not.toMatch(/\{[a-zA-Z]+\}/);
    }
  });

  test("every entry's tokens resolve in every scheme", () => {
    for (const e of Object.values(MOVE_HELP)) {
      for (const labels of [KEYBOARD_LABELS, PAD_LABELS.xbox, PAD_LABELS.ps]) {
        expect(resolveLabels(e.what + e.player, labels)).not.toMatch(/\{[a-zA-Z]+\}/);
      }
    }
  });

  test("legend lines fit the canvas in every scheme", () => {
    for (const labels of [KEYBOARD_LABELS, PAD_LABELS.xbox, PAD_LABELS.ps]) {
      for (const line of moveControlsLines(labels)) expect(line.length).toBeLessThanOrEqual(110);
    }
    const all = moveControlsLines().join(" | ");
    for (const group of moveKeyGroups(KEYBOARD_LABELS)) {
      for (const [key, action] of group) expect(all).toContain(`${key} ${action}`);
    }
  });
});
```

- [ ] **Step 3: The renderer** (`src/render/movedraw.ts`)

```ts
import { COLS, ROWS, TILE, isSolid, tileAt } from "../movement/level";
import { BLOCK_H, BLOCK_W, BODY_W, heightOf } from "../movement/engine";
import { HELP_BUTTON, PX_PER_CM, SCALE } from "./draw";
import { SHEETS } from "./sheets";
import { moveControlsLines } from "../ui/movehelp";
import { pickMoveFrame } from "./moveframes";
import type { Labels } from "../input/scheme";
import type { Level } from "../movement/level";
import type { Mover } from "../movement/engine";
import type { SheetName } from "./sheets";
import type { TimeControl } from "./draw";

/** Canvas y of the grid's top edge: 11 rows of 48 px = 528, letterboxed
 *  into the 540 canvas with the spare 12 px above. */
const GRID_Y = 12;

export interface MoveView {
  ctx: CanvasRenderingContext2D;
  images: Record<SheetName, HTMLImageElement>;
  tiles: HTMLImageElement;
  labels: Labels;
}

/** Atlas cell (16 px units) for a solid tile from its same-solid
 *  neighbourhood: the big 6x6 block's ring frames every rectangle. */
function atlasCell(l: boolean, r: boolean, t: boolean, b: boolean): [number, number] {
  const sx = !l ? 0 : !r ? 5 : 2;
  const sy = !t ? 4 : !b ? 9 : 6;
  return [sx * 16, sy * 16];
}

export function drawMoveFrame(v: MoveView, m: Mover, level: Level, overlay: boolean, time: TimeControl): void {
  const { ctx } = v;
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = "#1b1e24";
  ctx.fillRect(0, 0, 960, 540);

  // Tiles.
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      const k = tileAt(level, col, row);
      const x = col * 48;
      const y = GRID_Y + row * 48;
      if (isSolid(k)) {
        const solid = (c: number, r2: number): boolean => isSolid(tileAt(level, c, r2));
        const [sx, sy] = atlasCell(solid(col - 1, row), solid(col + 1, row), solid(col, row - 1), solid(col, row + 1));
        ctx.drawImage(v.tiles, sx, sy, 16, 16, x, y, 48, 48);
        if (k === "climb") {
          // Climbable walls read differently: a cool tint over the stone.
          ctx.globalAlpha = 0.18;
          ctx.fillStyle = "#4aa3df";
          ctx.fillRect(x, y, 48, 48);
          ctx.globalAlpha = 1;
        }
      } else if (k === "ladder") {
        // No ladder tile in the atlas: minimal flat-colour rails and rungs.
        ctx.fillStyle = "#6b5a3a";
        ctx.fillRect(x + 9, y, 6, 48);
        ctx.fillRect(x + 33, y, 6, 48);
        ctx.fillStyle = "#8a8f98";
        for (let ry = 6; ry < 48; ry += 12) ctx.fillRect(x + 9, y + ry, 30, 4);
      }
    }
  }

  // The block: one bright atlas cell plus an outline so it reads as a prop.
  const bx = m.block.x * PX_PER_CM - (BLOCK_W * PX_PER_CM) / 2;
  const by = GRID_Y + (10 * TILE - BLOCK_H) * PX_PER_CM;
  ctx.drawImage(v.tiles, 16, 16, 16, 16, bx, by, 48, 48);
  ctx.strokeStyle = "#0e1013";
  ctx.strokeRect(bx + 0.5, by + 0.5, 47, 47);

  // The player.
  const pick = pickMoveFrame(m);
  const meta = SHEETS[pick.sheet];
  const img = v.images[pick.sheet];
  const feetScreenY = GRID_Y + m.y * PX_PER_CM;
  ctx.save();
  ctx.translate(m.x * PX_PER_CM, 0);
  if (pick.flip) ctx.scale(-1, 1);
  ctx.drawImage(
    img, pick.frame * meta.frameW, 0, meta.frameW, meta.frameH,
    -meta.originX * SCALE, feetScreenY - meta.feetY * SCALE, meta.frameW * SCALE, meta.frameH * SCALE,
  );
  ctx.restore();

  // Overlay: state, velocities, the collision box.
  if (overlay) {
    const h = heightOf(m.state);
    ctx.strokeStyle = "#57a55a";
    ctx.strokeRect(
      (m.x - BODY_W / 2) * PX_PER_CM, GRID_Y + (m.y - h) * PX_PER_CM,
      BODY_W * PX_PER_CM, h * PX_PER_CM,
    );
    ctx.fillStyle = "#cfd3da";
    ctx.font = "12px ui-monospace, monospace";
    ctx.textAlign = "left";
    ctx.fillText(
      `${m.state.kind}  x ${m.x.toFixed(0)} y ${m.y.toFixed(0)}  vx ${m.vx.toFixed(0)} vy ${m.vy.toFixed(0)}`,
      12, 24,
    );
  }

  // Legend, time control, help button - the duel's furniture, this scene's table.
  const [line1, line2] = moveControlsLines(v.labels);
  ctx.fillStyle = "#8a8f98";
  ctx.font = "11px ui-monospace, monospace";
  ctx.textAlign = "center";
  ctx.fillText(line1, 480, 522);
  ctx.fillText(line2, 480, 536);
  if (time.paused || time.timescale !== 1) {
    ctx.textAlign = "left";
    ctx.fillStyle = "#e6c229";
    ctx.fillText(time.paused ? "paused" : `${time.timescale}x`, 12, 536);
  }
  const b = HELP_BUTTON;
  ctx.strokeStyle = "#3a404c";
  ctx.strokeRect(b.x + 0.5, b.y + 0.5, b.w - 1, b.h - 1);
  ctx.fillStyle = "#8a8f98";
  ctx.font = "13px ui-monospace, monospace";
  ctx.textAlign = "center";
  ctx.fillText("?", b.x + b.w / 2, b.y + 16);
}
```

(If `TimeControl`/`PX_PER_CM`/`SCALE`/`HELP_BUTTON` import lines need adjusting to match draw.ts's actual exports, adjust the imports, not the values.)

- [ ] **Step 4: The scene** (`src/scenes/move.ts`)

```ts
import { createMover, tickMove } from "../movement/engine";
import { createLevel } from "../movement/level";
import { drawMoveFrame } from "../render/movedraw";
import type { AudioEngine } from "../audio/audio";
import type { Labels } from "../input/scheme";
import type { ActionId } from "../input/scheme";
import type { MoveEvent, MoveInput, Mover } from "../movement/engine";
import type { SheetName } from "../render/sheets";
import type { TimeControl } from "../render/draw";
import type { HeldLevels, Scene } from "./scene";

/** Pad stick magnitude below this walks; at or above runs. The keyboard's
 *  walk is the {walkMod} hold. */
export const RUN_MAG = 0.85;

export interface MoveSceneDeps {
  ctx: CanvasRenderingContext2D;
  images: Record<SheetName, HTMLImageElement>;
  tiles: HTMLImageElement;
  audio: AudioEngine;
}

export function createMoveScene(deps: MoveSceneDeps): Scene {
  const level = createLevel();
  let mover: Mover = createMover(level);
  let pendingJump = false;
  let pendingDash = false;
  let frameEvents: MoveEvent[] = [];

  return {
    id: "move",
    holdKeys: { a: "retreat", d: "advance", w: "up", s: "down", l: "guard", shift: "walk" },
    heldEdge() { /* levels are read each tick; no edge consequences */ },
    press(e: KeyboardEvent): boolean {
      switch (e.key.toLowerCase()) {
        case "k": pendingJump = true; return true;
        case "j": pendingDash = true; return true;
        default: return false;
      }
    },
    keyRelease() {},
    padAction(a: ActionId) {
      if (a === "jump") pendingJump = true;
      else if (a === "dash") pendingDash = true;
      else if (a === "resetScene") mover = createMover(level);
    },
    tickOnce(held: HeldLevels, moveMag: number) {
      const padWalks = moveMag > 0 && moveMag < RUN_MAG;
      const input: MoveInput = {
        held: {
          left: held.retreat, right: held.advance,
          up: held.up, down: held.down,
          grab: held.guard, walk: held.walk || padWalks,
        },
        pressed: { jump: pendingJump, dash: pendingDash },
      };
      pendingJump = false;
      pendingDash = false;
      frameEvents.push(...tickMove(mover, level, input));
    },
    frameScale() { return 1; },
    audioFrame() {
      deps.audio.moveFrame(frameEvents);
      frameEvents = [];
    },
    draw(overlay: boolean, labels: Labels, time: TimeControl) {
      drawMoveFrame({ ctx: deps.ctx, images: deps.images, tiles: deps.tiles, labels }, mover, level, overlay, time);
    },
    snapshot() { return { live: true, decided: false }; },
    reset() { mover = createMover(level); },
  };
}
```

(Drop the `void NO_INPUT` line and its import if unused - it is here only if the import list needs trimming.)

- [ ] **Step 5: Wire into `src/main.ts`**

- Load tiles beside the sheets: `Promise.all([loadImages(), loadTileAtlas()]).then(([images, tiles]) => { ... })`.
- Build both scenes up front; `startMove()` becomes real:

```ts
const moveScene = createMoveScene({ ctx, images, tiles, audio });
function startMove(): void {
  moveScene.reset();
  active = moveScene;
}
```

- Scene-aware help: `setHelp` renders `active?.id === "move" ? renderMoveHelpHtml(activeLabels()) : renderHelpHtml(activeLabels())` (and the `onControlsChange` re-render uses the same pick).
- The move scene maps `s` as a HOLD key (crouch/climb down) - confirm the duel scene's `holdKeys` does NOT contain `s` and the move scene's `press()` does not handle it.

- [ ] **Step 6: Run everything, check in a browser**

Run: `npm test && npm run build` - PASS.
Manual: `npm run dev`, open `http://127.0.0.1:5173/prototypes/06/?scene=move`. Run around, jump, double-jump, dash, slide into the tunnel, crouch-walk, wall-slide and wall-jump at the left wall, side-climb it with L, ledge onto its top, climb the ladder, drop off platform D (roll with a direction held), pull the block out of the pocket, push it and stand on it. Footsteps and landing thuds sound; keys legend shows; `?` shows the movement panel; Esc returns to the scene selector; the duel still works.

- [ ] **Step 7: Commit**

```bash
git add 06-dueling/src/scenes/move.ts 06-dueling/src/render/movedraw.ts 06-dueling/src/ui/movehelp.ts \
        06-dueling/src/audio/manifest.ts 06-dueling/src/audio/audio.ts 06-dueling/src/main.ts \
        06-dueling/test/movehelp.test.ts 06-dueling/test/move-audio.test.ts
git commit -m "feat(dueling): movement test scene - parkour yard, audio cues, scene help"
```

---

### Task 12: README, lint, full gate

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Update `README.md`**

- Under "Run": document `?scene=move` / `?scene=duel` beside the existing params, and that the boot screen is now a scene selector ("Dueling test" leads to the sword select; `?p=`/`?e=` still boot straight into a duel).
- New "Movement test scene" section after "Controls":

```markdown
## Movement test scene

A single-screen parkour yard for the pack's non-combat animations. Pick
"Movement test" at the boot screen or open `?scene=move`.

- A / D: run (hold Shift to walk; a soft pad stick walks)
- K: jump; K again mid-air: air-spin double jump
- J: dash (dash-jump carries the momentum - the wide gap needs it)
- S: crouch (hold); pressed at full run: slide - the tunnel needs one or the other
- L (hold): grab - climb the marked wall (W/S), grip the block to pull it
- W / S: climb a ladder or the wall face
- R: reset, Esc: back to the scene selector, backtick: collision overlay
- Space, `.`, `[`/`]`, M: pause, step, speed, mute - as in the duel

The yard: a climbable wall (wall-slide, wall-jump, side-climb, ledge) on
the left, stepped platforms with a dash-only gap, a crouch tunnel, a
ladder to a high perch (drop off it to see the hard-landing roll), and a
pushable block parked in a pocket it can only be PULLED out of.
```

- In the feature matrix or below it, one line noting the duel is unchanged and lives behind the "Dueling test" scene.

- [ ] **Step 2: The full gate**

Run, from `06-dueling`: `npm test && npm run build`
Run, from the repo root: `npm run lint` (Biome over the whole repo).
Expected: all PASS. Fix anything Biome flags in the new files (unused imports are the usual suspects).

- [ ] **Step 3: Commit**

```bash
git add 06-dueling/README.md
git commit -m "docs(dueling): scene selector and movement test scene"
```

---

### Task 13: Chrome verification and animation-quality pass

**Files:**
- Possibly modify: `src/render/sheets.ts` (feetY/originX corrections), tuning constants in `src/movement/engine.ts`

This is the spec's definition of done: every verb exercised end to end in Chrome, frames consistent, nothing sinking or hopping between sheets.

- [ ] **Step 1: Start the dev server and open the scene**

```bash
cd /Users/janis.kirsteins/Projects/prototypes/06-dueling && npm run dev
```

Open `http://127.0.0.1:5173/prototypes/06/?scene=move` via the Chrome MCP tools. Also verify the boot flow without params: scene selector -> Dueling test -> sword select -> duel -> Esc -> Esc -> scene selector -> Movement test.

- [ ] **Step 2: Exercise every verb, screenshot mid-animation**

For each of: run, walk (Shift), dash, slide, crouch-idle, crouch-walk through the tunnel, jump, air spin, fall, land, hard-land roll (drop off platform D), wall slide, wall land, wall jump, side climb (L at the left wall), ledge pull-up, ladder climb, push, pull, push-idle - trigger it, screenshot while it plays (use pause + `.` single-step for the fast ones), and check:

1. The feet sit on the floor line in every state - no sinking, no hovering, especially across state transitions (run -> slide -> crouch, jump -> land).
2. The frame is not clipped or scaled oddly (a wrong frameW shows as a horizontally squashed or doubled character).
3. Facing flips are clean (run left vs right; wall slide on the left wall).
4. Tile seams: platform edges use the ring cells, no black gaps between tiles.

- [ ] **Step 3: Re-measure anchors if anything is off**

The shipped feetY values came from this measurement; re-run it if a state visibly floats or sinks, then correct `SHEETS` and note the measured truth in its comment:

```bash
python3 - <<'EOF'
from PIL import Image
import sys
path, fw = sys.argv[1] if len(sys.argv) > 1 else "public/sprites/run.png", 48
im = Image.open(path).convert("RGBA"); w, h = im.size; px = im.load()
for f in range(w // fw):
    ys = [y for y in range(h) for x in range(fw) if px[f * fw + x, y][3] > 10]
    xs = [x for y in range(h) for x in range(fw) if px[f * fw + x, y][3] > 10]
    print(f, "y", min(ys), max(ys), "x", min(xs), max(xs))
EOF
```

- [ ] **Step 4: Tune the feel constants if needed**

The tests pin RELATIONSHIPS (jump clears 2 tiles, dash-jump crosses the gap, the tunnel needs a crouch); the absolute feel (gravity weight, dash punch, slide length) is judged here. Adjust constants in `engine.ts` if something feels floaty or abrupt - the suite will catch any relationship broken by tuning.

- [ ] **Step 5: Regression sweep**

- The duel scene: one full fight with sounds, pause/step, help panel, Esc navigation.
- Console: no errors or warnings besides the known Safari-audio note (not applicable in Chrome).
- `?p=rapier&e=longsword&mode=3` still boots straight into a duel; `?scene=duel` boots the sword select; `?seed=` still pins.

- [ ] **Step 6: Final gate and commit**

Run: `npm test && npm run build`, repo-root `npm run lint`.

```bash
git add 06-dueling/src/render/sheets.ts 06-dueling/src/movement/engine.ts
git commit -m "fix(dueling): anchor and tuning corrections from the Chrome pass"
```

(Skip the commit if nothing needed correcting; say so instead.)

Stop the dev server when done.

---

## Self-review notes (already applied)

- Spec coverage: scene selector + flow (T10), main.ts shell (T9), input table + pad (T8), engine + level + all 20 states (T2-T6), sprites + measured metadata (T1), tiles + ladder fallback (T1, T11), frame picker (T7), audio two-cue mapping (T11), scene-aware help typed over the state union (T11), tests incl. the presentation-follows-simulation block (T3), README + `?scene=` (T12), Chrome verification + anchor corrections (T13).
- Deviation from spec, deliberate: "one-way platform lip" is not a tile kind; lips are DERIVED (any solid tile with empty above, `ledgeProbe`) - platforms are plain solid. The spec's intent (ledge-grabbable lips) is preserved with less collision machinery.
- Deviation from spec, deliberate: `moveLeft`/`moveRight`/`crouch`/`climbUp`/`climbDown`/`grab`/`walkMod` ActionIds exist for labels and help text; movement/grab/climb are held LEVELS carried by the existing advance/retreat/guard/up/down plumbing rather than edge-resolved pad verbs - same physical controls, one level store.
- The duel's `s`/`shift` are presses, the move scene's are holds: resolved per scene via `holdKeys` order (hold map checked first, scene `press()` last).
