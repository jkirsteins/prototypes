import type { DuelEvent } from "../combat/engine";

export type SoundName =
  | "footstep1" | "footstep2" | "footstep3" | "footstep4"
  | "whoosh1" | "whoosh2" | "whoosh3"
  | "clash1" | "clash2" | "clash3"
  | "hit1"
  | "windupRise"
  /** Time-control cues (bullet time in/out), played through the engine's
   *  cue() by main.ts - not DuelEvents, because bullet time is
   *  presentation (wall-clock easing, like pause and the speed keys) and
   *  its cues belong to the layer that owns it. The bind's combat sounds
   *  stay the contest's one-sound-per-moment outcomes. */
  | "bulletIn" | "bulletOut";

/** Files under public/audio/; provenance and processing in public/audio/manifest.md. */
export const SOUNDS: Record<SoundName, string> = {
  footstep1: "footstep_01.ogg",
  footstep2: "footstep_02.ogg",
  footstep3: "footstep_03.ogg",
  footstep4: "footstep_04.ogg",
  whoosh1:   "whoosh_01.ogg",
  whoosh2:   "whoosh_02.ogg",
  whoosh3:   "whoosh_03.ogg",
  clash1:    "clash_01.ogg",
  clash2:    "clash_02.ogg",
  clash3:    "clash_03.ogg",
  hit1:      "hit_01.ogg",
  windupRise: "windup_rise.ogg",
  bulletIn:  "bullet_in.ogg",
  bulletOut: "bullet_out.ogg",
};

export const FOOTSTEPS: SoundName[] = ["footstep1", "footstep2", "footstep3", "footstep4"];

/**
 * Which events make a sound. Every attack resolves to exactly one sound,
 * each a readable outcome at its simulation instant: "whiff" the arc found
 * nothing (resolution - only then does the sim know, since a defender can
 * still step into the blade late), "met" it found steel (blade arrival at
 * the guard), "hit" it found flesh (resolution). "step" is a foot planting
 * (step or void hop). "swing" (blade starts travelling) is deliberately
 * unmapped: sounding every attack would make the whoosh carry no
 * information. Input-acceptance events (attackStart, void, parry) are
 * silent - a keypress is only input to the simulation, never a sound.
 * Footsteps round-robin through FOOTSTEPS; other multi-entry kinds pick
 * at random.
 */
export const EVENT_SOUNDS: Partial<Record<DuelEvent["kind"], SoundName[]>> = {
  step: FOOTSTEPS,
  whiff: ["whoosh1", "whoosh2", "whoosh3"],
  met: ["clash1", "clash2", "clash3"],
  bind: ["clash1", "clash2", "clash3"],
  bindBreak: ["clash1", "clash2", "clash3"],
  pulse: ["clash1", "clash2", "clash3"],
  hit: ["hit1"],
};

/**
 * Per-kind playback rate (default 1). The bind reuses the clash samples
 * pitched well down: deeper and longer, it reads as steel LOCKING where
 * the met's ring reads as steel knocked away - the same contact instant,
 * two audibly different outcomes. One event still means one sound; the
 * engine emits bind INSTEAD of met on the bound path, never both.
 *
 * bindBreak keeps the clash's own pitch: the second RING after the deep
 * clang is the bind resolving - always decisively, since the control
 * contest has no neutral break. yieldFail is deliberately unmapped: the
 * failed rotation has no steel moment, and the resolution stays the
 * bind's one second sound.
 *
 * pulse is the bind's RHYTHM made audible: one low grinding thud per
 * shove, on the tick its force lands - pitched below even the bind clang
 * and played quiet (EVENT_GAINS), so the beat reads as texture under the
 * outcome sounds. The silence after each thud is the yield gap; the
 * rhythm is the information, which is why pulses earn a sound at all.
 */
export const EVENT_RATES: Partial<Record<DuelEvent["kind"], number>> = {
  bind: 0.55,
  pulse: 0.32,
};

/** Per-kind gain (default 1): cues that must sit UNDER the outcomes.
 *  The pulse thud is deliberately SUBTLE - a felt texture keeping the
 *  beat, never competing with the clang, the break or the hit. */
export const EVENT_GAINS: Partial<Record<DuelEvent["kind"], number>> = {
  pulse: 0.22,
};

/**
 * The signalling cascade's tempo cue: a low rise through the windup, cut
 * off by the stillness of the transition beat. Handled outside
 * EVENT_SOUNDS because it is not fire-and-forget: it stretches to the
 * attack's windup via playbackRate, plays quieter than outcome sounds,
 * and is choked early if the windup dies (mezzo tempo interception).
 */
export const WINDUP_SOUND: SoundName = "windupRise";
