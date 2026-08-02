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
 * Which events make a sound. attackStart is deliberately absent: it fires at
 * windup start, long before the blade travels, and buffered attacks skip it
 * entirely. The clash keys off "met" - the tick the guard meets the blade -
 * not "parried", which resolves up to half a strike later. kill/draw share a
 * tick with hit, so they add nothing. Footsteps round-robin through
 * FOOTSTEPS; other multi-entry kinds pick at random.
 */
export const EVENT_SOUNDS: Partial<Record<DuelEvent["kind"], SoundName[]>> = {
  step: FOOTSTEPS,
  void: FOOTSTEPS,
  whiff: ["whoosh1", "whoosh2", "whoosh3"],
  met: ["clash1", "clash2", "clash3"],
  hit: ["hit1"],
};
