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
    if (airborne) {
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
