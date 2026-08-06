import { DEATH_ANIM_MS, HIT_STUN_MS, LONGSWORD, PARRY_FORM_MS } from "./timings";
import type { Duelist } from "./states";

/**
 * The 3D analogue of 06's ATTACK_FRAMES: curated timestamps into each
 * clip, chosen from screenshots. Pose is a pure function of state, but
 * unlike 06's discrete sprite frames the clip PLAYS through an attack:
 * each phase scrubs its clip segment across its timeline window
 * (piecewise-linear clip time in elapsedMs), so the animation moves
 * continuously while the combat marks still land where the timeline says.
 * The one deliberate hold is the pre-strike stillness beat - motion
 * stopping IS the telegraph.
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
  // The third of Mixamo's three same-named "Stabbing" products
  // (c9c61d25-b96c-11e4-a802-0aaa78deedf9), the only one of the catalog's
  // six point-forward clips that lunges in the picture plane. The first
  // (stabbing.glb) and second stand three-quarters to camera and punch
  // with the off-hand; "Upward Thrust" straddles instead of lunging.
  stab:       { file: "stabbing-3.glb",        durationS: 2.125 },
  unarmedIdle:{ file: "unarmed-idle.glb",         durationS: 1.875 },
  gsDeath:    { file: "great-sword-death.glb",    durationS: 2.375 },
};

/**
 * An attack is one CONTIGUOUS clip segment played start to end, every
 * frame in order. The only freedom is the time-warp: at each timeline
 * mark the clip must be at the paired anchor timestamp, and between
 * marks clip time interpolates linearly - so different stretches play
 * slower or faster, but nothing is skipped, held-and-jumped, or
 * reordered. The beat (riseEnd .. strikeStart) maps to a sliver of clip
 * (beatIn .. still), so the telegraph reads as motion nearly stopping
 * while the fighter keeps breathing.
 */
export interface AttackWarp {
  clip: ClipName;
  /** Anchor timestamps, strictly ascending: clip time at riseStart,
   *  riseEnd, strikeStart, parryableUntil, strikeEnd, recoveryEnd. */
  start: number; beatIn: number; still: number;
  midArc: number; delivered: number; end: number;
}

export const WARP: Record<"slash" | "stab", AttackWarp> = {
  // gsSlash is a four-swing combo; the segment is its first swing plus
  // follow-through (0.30 .. 1.20): rise, deepest cock, the arc, the
  // landed lunge, then the grounded turn-and-gather before the combo
  // re-cocks for swing two (which is where the segment must stop).
  slash: {
    clip: "gsSlash",
    start: 0.30,     // hands lifting past the head, guard broken
    beatIn: 0.59,    // almost at the deepest cock; the beat creeps from here
    still: 0.61,     // deepest cock: hands back, knees loaded
    midArc: 0.78,    // long stride, blade mid-arc: the last meetable look
    // 0.88 is the furthest-forward frame with the blade down on the line
    // (tip 1.464 m ahead of the root, horizontal at chest height).
    delivered: 0.88, // deep lunge, arms driven fully out front
    end: 1.20,       // follow-through gathered, blade at the hip
  },
  // stabbing-3.glb is one clean thrust: low guard, vertical cock, the
  // drive, held extension, withdrawal, hip guard. One segment covers it
  // all (0.06 .. 1.30) - the clip is contiguous by nature.
  // The off-hand is thrown back throughout (78 cm off the grip): a
  // one-handed lunge, and no clip in the catalog thrusts two-handed.
  stab: {
    clip: "stab",
    start: 0.06,     // low guard: hilt at the hip, point forward on the line
    beatIn: 0.30,    // nearly cocked; the beat creeps the last sliver
    still: 0.32,     // deepest cock: blade vertical, hands at the chest
    midArc: 0.40,    // the arm coming out, point 1.13 m ahead and climbing
    delivered: 0.58, // full extension, deep lunge, point 1.55 m ahead
    end: 1.30,       // withdrawn onto the clip's own hip guard
  },
};

/** Non-attack scrub ranges and freezes, curated from screenshots. */
export const POSE_T = {
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
      const wv = s.attack === "cut" ? WARP.slash : WARP.stab;
      const tl = s.timeline;
      // The warp: clip time is monotonic piecewise-linear in elapsedMs,
      // pinned at the timeline marks. The phase field plays no part here -
      // the whole attack is one continuous playback.
      const anchors: [number, number][] = [
        [tl.riseStart, wv.start],
        [tl.riseEnd, wv.beatIn],
        [tl.strikeStart, wv.still],
        [tl.parryableUntil, wv.midArc],
        [tl.strikeEnd, wv.delivered],
        [tl.recoveryEnd, wv.end],
      ];
      let clipTime = wv.end;
      for (let i = 1; i < anchors.length; i += 1) {
        if (s.elapsedMs <= anchors[i][0]) {
          const [m0, c0] = anchors[i - 1];
          const [m1, c1] = anchors[i];
          clipTime = lerp(c0, c1, (s.elapsedMs - m0) / (m1 - m0));
          break;
        }
      }
      return { clip: wv.clip, clipTime, mode: "held" };
    }
  }
}
