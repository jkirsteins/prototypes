import { DEATH_ANIM_MS, HIT_STUN_MS } from "../combat/fighter";
import { SHEETS } from "./sheets";
import type { Fighter } from "../combat/fighter";
import type { SheetName } from "./sheets";

export interface FramePick {
  sheet: SheetName;
  frame: number;
  flip: boolean;
}

const IDLE_FRAME_MS = 125;

function span(sheet: SheetName, t: number, total: number, first: number, last: number): number {
  const n = last - first + 1;
  const idx = first + Math.min(n - 1, Math.floor((t / total) * n));
  return Math.min(idx, SHEETS[sheet].frames - 1);
}

export function pickFrame(f: Fighter, timeMs: number): FramePick {
  const flip = f.facing === -1;
  const s = f.state;
  const w = f.weapon;
  switch (s.kind) {
    case "idle": {
      const per = IDLE_FRAME_MS / w.animSpeed;
      return { sheet: "swordIdle", frame: Math.floor(timeMs / per) % SHEETS.swordIdle.frames, flip };
    }
    case "pause":
      return { sheet: "swordIdle", frame: 0, flip };
    case "step":
      return { sheet: "swordRun", frame: span("swordRun", s.t, w.stepDuration, 0, 7), flip };
    case "void":
      return { sheet: "roll", frame: span("roll", s.t, w.voidDuration, 0, 6), flip };
    case "parry":
      // No parry sheet in the template: hold the raised-guard windup frame.
      return { sheet: "swordAttack", frame: 1, flip };
    case "hitstun":
      return { sheet: "hurt", frame: span("hurt", s.t, HIT_STUN_MS, 0, 3), flip };
    case "dead":
      return { sheet: "death", frame: span("death", Math.min(s.t, DEATH_ANIM_MS - 1), DEATH_ANIM_MS, 0, 9), flip };
    case "attack": {
      const timings = w.attacks[s.attack];
      const sheet: SheetName = s.attack === "cut" ? "swordAttack" : "swordStab";
      switch (s.phase) {
        case "pretempo":
          return { sheet, frame: 0, flip };
        case "windup":
          return { sheet, frame: s.t < timings.windup / 2 ? 0 : 1, flip };
        case "beat":
          return { sheet, frame: 2, flip };
        case "strike":
          return { sheet, frame: span(sheet, s.t, timings.strike, 3, s.attack === "cut" ? 4 : 5), flip };
        case "recovery":
          return { sheet, frame: SHEETS[sheet].frames - 1, flip };
      }
    }
  }
}
