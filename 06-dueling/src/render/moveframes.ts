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
