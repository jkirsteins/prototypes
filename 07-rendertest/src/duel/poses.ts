import { DEATH_ANIM_MS, HIT_STUN_MS, LONGSWORD, PARRY_FORM_MS } from "./timings";
import type { Duelist } from "./states";

/**
 * The 3D analogue of 06's ATTACK_FRAMES: curated timestamps into each
 * clip, chosen from screenshots (Task 7 tunes them). Pose is a pure
 * function of state - the strike swap at parryableUntil is inclusive,
 * exactly 06's frames.ts:156.
 */

export type ClipName =
  | "gsIdle" | "gsWalk" | "gsSlash" | "gsBlock" | "gsImpact"
  | "dodgeBack" | "stab" | "unarmedIdle" | "gsDeath";

/** durationS values are measured from the converted GLBs (Task 4): the max
 *  input accessor time across animations[0]'s samplers, read from each
 *  GLB's JSON chunk. */
export const CLIPS: Record<ClipName, { file: string; durationS: number }> = {
  gsIdle:     { file: "great-sword-idle.glb",     durationS: 2.000 },
  gsWalk:     { file: "great-sword-walk.glb",     durationS: 1.292 },
  gsSlash:    { file: "great-sword-slash.glb",    durationS: 3.500 },
  gsBlock:    { file: "great-sword-blocking.glb", durationS: 0.958 },
  gsImpact:   { file: "great-sword-impact.glb",   durationS: 1.250 },
  dodgeBack:  { file: "dodge-backward.glb",       durationS: 1.625 },
  stab:       { file: "stabbing.glb",             durationS: 2.625 },
  unarmedIdle:{ file: "unarmed-idle.glb",         durationS: 1.875 },
  gsDeath:    { file: "great-sword-death.glb",    durationS: 2.375 },
};

/**
 * Curated timestamps (seconds), picked frame by frame from screenshots.
 *
 * gsSlash is a four-swing combo, not one cut. The attack poses come from
 * its first swing (0.30 .. 0.86), the only one that stays on the floor
 * through a full cock-and-cleave; the swing ends in a leap, so the
 * recovery is borrowed from the combo's closing swing (3.28 .. 3.46),
 * which settles into the same forward guard the clip opens on.
 */
export const POSE_T = {
  slash: {
    windupLow: 0.30,     // hands lifting past the head, guard broken
    windupHigh: 0.50,    // hands high behind the head, upright and open
    still: 0.61,         // deepest cock: hands back, knees loaded
    travelling: 0.78,    // long stride, blade mid-arc at head height
    delivered: 0.86,     // deep lunge, arms driven fully out front
    recoveryStart: 3.28, // upright, blade dropping back toward the line
    recoveryEnd: 3.46,   // the clip's own guard, where an idle resumes
  },
  stab: {
    windupLow: 0.15,     // tallest frame, weapon hand still low
    windupHigh: 0.36,    // hand drawing up and back, weight sinking
    still: 0.48,         // deepest coil, point cocked above the shoulder
    travelling: 0.70,    // compact over the front foot, arm swinging through
    delivered: 1.05,     // lunge at full reach, the clip's furthest point
    recoveryStart: 1.50, // arm withdrawing from the lunge
    recoveryEnd: 1.95,   // back upright over the feet
  },
  // great-sword-blocking.glb holds one crouched guard for its whole
  // 0.958 s (hips vary by 4 mm), so these two only bracket that hold.
  block: { rise: 0.10, formed: 0.70 },
  walk:  { start: 0.0, end: 0.646 },  // exactly one stride of the two-step cycle
  dodge: { start: 0.0, end: 1.20 },   // crouch, hop back, land, rise
  impact:{ start: 0.03, end: 0.92 },  // struck, thrown back, back over the feet
  death: { start: 0.0, end: 2.30 },   // standing to settled prone
  bindContact: 0.86,          // the cut arrested at full extension, arms into the guard
  bindCounterpartBlock: 0.70, // the static counterpart's formed block
};

export interface PosePick {
  clip: ClipName;
  clipTime: number;
  mode: "held" | "loop";
}

/** The static bind counterpart's pose: a formed block meeting the slash. */
export const BIND_COUNTERPART: PosePick = { clip: "gsBlock", clipTime: POSE_T.bindCounterpartBlock, mode: "held" };

const lerp = (a: number, b: number, f: number): number => a + (b - a) * Math.min(1, Math.max(0, f));
const loop = (clip: ClipName, timeMs: number): PosePick =>
  ({ clip, clipTime: (timeMs / 1000) % CLIPS[clip].durationS, mode: "loop" });

export function pickPose(d: Duelist, timeMs: number): PosePick {
  const s = d.state;
  const w = LONGSWORD;
  switch (s.kind) {
    case "ready": return loop("gsIdle", timeMs);
    case "unarmed": return loop("unarmedIdle", timeMs);
    case "step": return { clip: "gsWalk", clipTime: lerp(POSE_T.walk.start, POSE_T.walk.end, s.t / w.stepDurationMs), mode: "held" };
    case "void": return { clip: "dodgeBack", clipTime: lerp(POSE_T.dodge.start, POSE_T.dodge.end, s.t / w.voidDurationMs), mode: "held" };
    case "hitstun": return { clip: "gsImpact", clipTime: lerp(POSE_T.impact.start, POSE_T.impact.end, s.t / HIT_STUN_MS), mode: "held" };
    case "dead": return { clip: "gsDeath", clipTime: lerp(POSE_T.death.start, POSE_T.death.end, s.t / DEATH_ANIM_MS), mode: "held" };
    case "parry": return { clip: "gsBlock", clipTime: s.t < PARRY_FORM_MS ? POSE_T.block.rise : POSE_T.block.formed, mode: "held" };
    case "bind": return { clip: "gsSlash", clipTime: POSE_T.bindContact, mode: "held" };
    case "attack": {
      const t = s.attack === "cut" ? POSE_T.slash : POSE_T.stab;
      const clip = s.attack === "cut" ? "gsSlash" as const : "stab" as const;
      const tl = s.timeline;
      switch (s.phase) {
        case "windup": {
          const clipTime =
            s.elapsedMs < (tl.riseStart + tl.riseEnd) / 2 ? t.windupLow :
            s.elapsedMs < tl.riseEnd ? t.windupHigh :
            t.still;
          return { clip, clipTime, mode: "held" };
        }
        case "strike":
          return { clip, clipTime: s.elapsedMs <= tl.parryableUntil ? t.travelling : t.delivered, mode: "held" };
        case "recovery":
          return {
            clip,
            clipTime: lerp(t.recoveryStart, t.recoveryEnd, (s.elapsedMs - tl.recoveryStart) / (tl.recoveryEnd - tl.recoveryStart)),
            mode: "held",
          };
      }
    }
  }
}
