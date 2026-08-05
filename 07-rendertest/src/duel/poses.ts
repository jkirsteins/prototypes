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
  // Mixamo "Upward Thrust", not "Stabbing": stabbing.glb stands
  // three-quarters to camera with both arms up and never drives a point
  // forward in the picture plane, so no timestamp in it reads as a thrust.
  stab:       { file: "upward-thrust.glb",        durationS: 2.333 },
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
    // 0.86 and 0.88 tie for the furthest-forward frame of the whole clip
    // (tip 1.465 m and 1.464 m ahead of the root) and both hold the
    // off-hand on the hilt (1.5 cm, 1.3 cm off the grip). 0.88 is the pick
    // because it is the one where the blade has come down onto the line -
    // horizontal at chest height, 0.97 of it along the forward axis,
    // against 0.91 and 25 degrees of lift at 0.86. bindContact below stays
    // a separate, earlier pick: the cut arrested mid-arc, not landed.
    delivered: 0.88,     // deep lunge, arms driven fully out front
    recoveryStart: 3.28, // upright, blade dropping back toward the line
    recoveryEnd: 3.46,   // the clip's own guard, where an idle resumes
  },
  // upward-thrust.glb opens on a held on-guard (0.05 .. 0.48: point cocked
  // over the rear shoulder, off-hand out on the line), drives through
  // 0.50 .. 0.78, then withdraws to a wide guard by 1.30. Past 1.50 it
  // turns and lifts a leg, so nothing after that is usable.
  stab: {
    windupLow: 0.10,     // on guard: point cocked back, off-hand out on the line
    windupHigh: 0.30,    // deepest draw, torso leaning off the line, knees loaded
    still: 0.48,         // coil held, front foot gathering for the step in
    travelling: 0.68,    // compact and upright, the point driving up past the head
    // 0.76 is the last frame of the drive itself (tip 1.412 m ahead of the
    // root); past 0.80 the clip has stopped driving and simply holds the
    // arm out, so its slightly longer reach is not a thrust. The off-hand
    // is 32.1 cm off the grip here and the whole drive is no better - this
    // clip holds it clear of the hilt, hands 46-52 cm apart in its own
    // skeleton, so it is the choreography and not the rig.
    delivered: 0.76,     // deep lunge, weapon arm out front, point furthest forward
    recoveryStart: 1.08, // still lunged, the arm starting to fold back
    recoveryEnd: 1.30,   // off the lunge, hands drawn in over a wide guard
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
