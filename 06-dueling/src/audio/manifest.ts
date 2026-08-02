import type { DuelEvent } from "../combat/engine";

export type SoundName =
  | "footstep1" | "footstep2" | "footstep3" | "footstep4"
  | "whoosh1" | "whoosh2" | "whoosh3"
  | "clash1" | "clash2" | "clash3"
  | "hit1";

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
};

export const FOOTSTEPS: SoundName[] = ["footstep1", "footstep2", "footstep3", "footstep4"];

/**
 * Which events make a sound. Every key is a physical simulation moment:
 * "step" a foot planting (step or void hop), "swing" the blade starting to
 * travel (every strike, hit or miss), "met" the blade arriving at a guard,
 * "hit" the strike resolving into a wound. Input-acceptance events
 * (attackStart, void, parry) and outcome bookkeeping (whiff, parried,
 * kill, draw) are deliberately silent - a keypress is only input to the
 * simulation, never a sound. Footsteps round-robin through FOOTSTEPS;
 * other multi-entry kinds pick at random.
 */
export const EVENT_SOUNDS: Partial<Record<DuelEvent["kind"], SoundName[]>> = {
  step: FOOTSTEPS,
  swing: ["whoosh1", "whoosh2", "whoosh3"],
  met: ["clash1", "clash2", "clash3"],
  hit: ["hit1"],
};
