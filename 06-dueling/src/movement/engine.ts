import { TILE, isSolid, ladderTopRow, tileAt } from "./level";
import type { Level } from "./level";

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

function headroom(m: Mover, level: Level): boolean {
  return !boxHits(m, level, m.x, m.y, BODY_W, BODY_H);
}

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

/** The body center overlaps a ladder tile. */
function overLadder(m: Mover, level: Level, h: number): number | null {
  const col = Math.floor(m.x / TILE);
  const midRow = Math.floor((m.y - h / 2) / TILE);
  const feetRow = Math.floor((m.y - EPS) / TILE);
  if (tileAt(level, col, midRow) === "ladder" || tileAt(level, col, feetRow) === "ladder") return col;
  return null;
}

/** Where the block can rest: on the floor, not inside solid tiles. */
function blockFits(level: Level, x: number): boolean {
  const floorTop = 10 * TILE;
  for (const px of [x - BLOCK_W / 2 + EPS, x, x + BLOCK_W / 2 - EPS]) {
    for (const py of [floorTop - BLOCK_H + EPS, floorTop - EPS]) {
      if (solidCellAt(level, px, py)) return false;
    }
  }
  return true;
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

// --- tick ------------------------------------------------------------------

export function tickMove(m: Mover, level: Level, input: MoveInput): MoveEvent[] {
  const ev: MoveEvent[] = [];
  m.time += MOVE_TICK;
  const dt = MOVE_TICK / 1000;
  const held = input.held;
  const wish = ((held.right ? 1 : 0) - (held.left ? 1 : 0)) as -1 | 0 | 1;
  const downEdge = held.down && !m.prevDown;
  m.prevDown = held.down;

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
      if (held.grab && wish !== 0
          && touchingWall(m, level, wish, BODY_H) && climbableBeside(m, level, wish, BODY_H)) {
        m.vx = 0; m.vy = 0;
        m.facing = wish;
        m.state = { kind: "sideClimb", wall: wish };
        ev.push({ kind: "grab" });
        break;
      }
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
        if (held.grab && wish === -beside) { m.state = { kind: "pull", dir: wish as -1 | 1 }; break; }
        if (held.grab && wish === 0) { m.state = { kind: "pushIdle" }; m.vx = 0; break; }
        if (!held.grab && wish === beside) { m.state = { kind: "push", dir: wish as -1 | 1 }; break; }
      }
      if (wish !== 0) m.facing = wish;
      m.vx = wish * (held.walk ? WALK_SPEED : RUN_SPEED);
      m.state =
        wish === 0 ? { kind: "idle" } :
        held.walk ? { kind: "walk" } : { kind: "run" };
      break;
    }
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
    case "land": {
      // Committed: the body absorbs the impact; movement resumes after.
      m.vx = 0;
      s.t += MOVE_TICK;
      if (s.t >= LAND_MS) m.state = { kind: "idle" };
      break;
    }
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
        m.facing = -s.wall as -1 | 1;
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
        m.facing = -s.wall as -1 | 1;
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
      m.facing = s.kind === "push" ? beside : (beside === 1 ? -1 : 1) as -1 | 1;
      const step = wish * WALK_SPEED * dt;
      if (blockFits(level, m.block.x + step)) {
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
      if (wish !== 0) { m.state = { kind: "idle" }; break; }
      break;
    }
  }

  // Integrate. Gravity applies in every non-climbing state; sideClimb and
  // ledgeGrab hold position entirely and skip it, and a wall contact caps
  // fall speed far below free fall.
  const clinging = m.state.kind === "sideClimb" || m.state.kind === "ledgeGrab" || m.state.kind === "ladderClimb";
  const onWallNow = m.state.kind === "wallSlide" || m.state.kind === "wallLand";
  const airborne = m.state.kind === "jump" || m.state.kind === "fall" || m.state.kind === "airSpin" || onWallNow;
  const h = heightOf(m.state);
  if (!clinging && (airborne || !onGround(m, level, h))) {
    // Terminal speed: the wall's friction caps it far below free fall.
    m.vy = Math.min(m.vy + GRAVITY * dt, onWallNow ? WALLSLIDE_CAP : FALL_CAP);
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
    // Wall states own their own floor plant (above), so a corner catch
    // cannot double-count: only a free fall lands here.
    const freeAir = m.state.kind === "jump" || m.state.kind === "fall" || m.state.kind === "airSpin";
    if (freeAir) {
      ev.push({ kind: "touchdown" });
      if (impact >= LAND_HARD) {
        if (wish !== 0) {
          m.facing = wish;
          m.state = { kind: "roll", t: 0 };
        } else {
          m.state = { kind: "land", t: 0, hard: true };
        }
      } else if (impact >= LAND_SOFT) {
        m.state = { kind: "land", t: 0, hard: false };
      } else {
        m.state = wish === 0 ? { kind: "idle" } : { kind: "run" };
      }
    }
  }
  // Walked off an edge: grounded states become a fall.
  const groundedKind = ["idle", "walk", "run", "crouchIdle", "crouchWalk", "dash", "push", "pull", "pushIdle"].includes(m.state.kind);
  if (groundedKind && !onGround(m, level, h)) m.state = { kind: "fall" };

  // Footfalls: strides while actually moving on the ground.
  const striding = ["walk", "run", "crouchWalk", "push", "pull"].includes(m.state.kind);
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
