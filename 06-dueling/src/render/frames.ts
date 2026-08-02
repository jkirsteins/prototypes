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

/**
 * Frames per attack phase, measured from the sheets' own poses rather than
 * assumed. The strike gets exactly two frames: the blade travelling, then
 * the blade delivered - so the strike phase always ends on the sword's
 * furthest-committed pose at the instant it lands, and the swap between
 * those two frames is the moment the blade stops being meetable. That
 * makes the parryable window readable from the animation alone, and the
 * per-weapon phase durations make the same frames play at each weapon's
 * own speed.
 */
interface AttackFramePlan {
  sheet: SheetName;
  windup: [number, number];
  beat: number;
  /** [blade travelling (parryable), blade delivered (too late)] */
  strike: [number, number];
  recovery: [number, number];
}

export const ATTACK_FRAMES: Record<"cut" | "thrust", AttackFramePlan> = {
  // swordAttack: 0-1 rising, 2 held high, 3 arc sweeping down, 4 delivered
  // low, 5 back to stance. The cut reads "meet the sweeping arc": the slash
  // arc is visible for exactly the meetable half and draws the cut's true
  // reach (its tip, not the resting blade, is what the reach value means);
  // when the arc vanishes into the delivered pose the window is over. The
  // sword pixels alone peak mid-sweep - arc physics, not a sheet error.
  cut: { sheet: "swordAttack", windup: [0, 1], beat: 2, strike: [3, 4], recovery: [5, 5] },
  // swordStab: 0-1 coiling, 2-3 loaded, 4-5 point fully extended, 6
  // retracting. Frames 2 and 3 are near-identical, so the thrust stays in
  // its loaded pose through the whole meetable half and snaps to full
  // extension exactly when the window closes. Deliberate, and true to the
  // weapon: a thrust cannot be parried on reaction once the point flies -
  // you meet it during the preparation, or not at all.
  thrust: { sheet: "swordStab", windup: [0, 1], beat: 2, strike: [3, 4], recovery: [5, 6] },
};

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
    case "ready": {
      // A raised parry drives the pose while standing. No parry sheet in
      // the template: hold the raised-guard windup frame.
      if (f.parry !== null) return { sheet: "swordAttack", frame: 1, flip };
      // Settling after a step reads as stillness, not the relaxed idle sway.
      if (f.stepRecoveryMs > 0) return { sheet: "swordIdle", frame: 0, flip };
      const per = IDLE_FRAME_MS / w.animSpeed;
      return { sheet: "swordIdle", frame: Math.floor(timeMs / per) % SHEETS.swordIdle.frames, flip };
    }
    case "step":
      // A carried parry is invisible here (the legs own the sheet); HUD
      // row 2 keeps it legible.
      return { sheet: "swordRun", frame: span("swordRun", s.t, w.stepDuration, 0, 7), flip };
    case "void":
      return { sheet: "roll", frame: span("roll", s.t, w.voidDuration, 0, 6), flip };
    case "hitstun":
      return { sheet: "hurt", frame: span("hurt", s.t, HIT_STUN_MS, 0, 3), flip };
    case "dead":
      return { sheet: "death", frame: span("death", Math.min(s.t, DEATH_ANIM_MS - 1), DEATH_ANIM_MS, 0, 9), flip };
    case "attack": {
      const tl = s.timeline;
      const plan = ATTACK_FRAMES[s.attack];
      const sheet = plan.sheet;
      switch (s.phase) {
        case "windup": {
          // One phase, three poses, split at the timeline's presentation
          // marks: low until the rise's midpoint (the telegraph holds the
          // first pose), raised through the rest of the rise, then the
          // held-high stillness until the strike.
          const frame =
            s.elapsedMs < (tl.riseStart + tl.riseEnd) / 2 ? plan.windup[0] :
            s.elapsedMs < tl.riseEnd ? plan.windup[1] :
            plan.beat;
          return { sheet, frame, flip };
        }
        case "strike":
          // The frame flips to "delivered" exactly when the blade stops
          // being meetable, so the visual is the window. Both this and the
          // engine's meetable check read timeline.parryableUntil, so they
          // cannot disagree.
          return {
            sheet,
            frame: s.elapsedMs <= tl.parryableUntil ? plan.strike[0] : plan.strike[1],
            flip,
          };
        case "recovery":
          return {
            sheet,
            frame: span(sheet, s.elapsedMs - tl.recoveryStart, tl.recoveryEnd - tl.recoveryStart, plan.recovery[0], plan.recovery[1]),
            flip,
          };
      }
    }
  }
}
