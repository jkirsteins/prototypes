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

/** durationS values are measured from the converted GLBs (Task 4 fills
 *  them); 1.0 is a provisional stand-in that keeps the math testable. */
export const CLIPS: Record<ClipName, { file: string; durationS: number }> = {
  gsIdle:     { file: "great-sword-idle.glb",     durationS: 1.0 },
  gsWalk:     { file: "great-sword-walk.glb",     durationS: 1.0 },
  gsSlash:    { file: "great-sword-slash.glb",    durationS: 1.0 },
  gsBlock:    { file: "great-sword-blocking.glb", durationS: 1.0 },
  gsImpact:   { file: "great-sword-impact.glb",   durationS: 1.0 },
  dodgeBack:  { file: "dodge-backward.glb",       durationS: 1.0 },
  stab:       { file: "stabbing.glb",             durationS: 1.0 },
  unarmedIdle:{ file: "unarmed-idle.glb",         durationS: 1.0 },
  gsDeath:    { file: "great-sword-death.glb",    durationS: 1.0 },
};

/** Curated timestamps (seconds). Provisional until Task 7's screenshot
 *  pass; the STRUCTURE is what the tests pin down. */
export const POSE_T = {
  slash: { windupLow: 0.10, windupHigh: 0.25, still: 0.35, travelling: 0.50, delivered: 0.65, recoveryStart: 0.70, recoveryEnd: 0.95 },
  stab:  { windupLow: 0.10, windupHigh: 0.20, still: 0.30, travelling: 0.45, delivered: 0.60, recoveryStart: 0.65, recoveryEnd: 0.90 },
  block: { rise: 0.10, formed: 0.30 },
  walk:  { start: 0.0, end: 0.95 },
  dodge: { start: 0.05, end: 0.85 },
  impact:{ start: 0.05, end: 0.60 },
  death: { start: 0.0, end: 0.95 },
  bindContact: 0.50,          // the fighter's frozen slash contact
  bindCounterpartBlock: 0.30, // the static counterpart's formed block
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
