import type { DuelEvent } from "../combat/engine";

export type SoundName =
  | "footstep1" | "footstep2" | "footstep3" | "footstep4"
  | "whoosh1" | "whoosh2" | "whoosh3"
  | "clash1" | "clash2" | "clash3"
  | "hit1"
  | "ambientMeadow";

export interface SoundMeta {
  file: string;
  category: "sfx" | "ambient";
}

/** Files under public/audio/; provenance and processing in public/audio/manifest.md. */
export const SOUNDS: Record<SoundName, SoundMeta> = {
  footstep1:     { file: "footstep_01.ogg", category: "sfx" },
  footstep2:     { file: "footstep_02.ogg", category: "sfx" },
  footstep3:     { file: "footstep_03.ogg", category: "sfx" },
  footstep4:     { file: "footstep_04.ogg", category: "sfx" },
  whoosh1:       { file: "whoosh_01.ogg",   category: "sfx" },
  whoosh2:       { file: "whoosh_02.ogg",   category: "sfx" },
  whoosh3:       { file: "whoosh_03.ogg",   category: "sfx" },
  clash1:        { file: "clash_01.ogg",    category: "sfx" },
  clash2:        { file: "clash_02.ogg",    category: "sfx" },
  clash3:        { file: "clash_03.ogg",    category: "sfx" },
  hit1:          { file: "hit_01.ogg",      category: "sfx" },
  ambientMeadow: { file: "ambient_meadow.ogg", category: "ambient" },
};

export const FOOTSTEPS: SoundName[] = ["footstep1", "footstep2", "footstep3", "footstep4"];

/**
 * Which events make a sound. attackStart is deliberately absent: it fires at
 * windup start, long before the blade travels, and buffered attacks skip it
 * entirely - the resolution events (whiff/parried/hit) cover every swing.
 * kill/draw share a tick with hit, so they add nothing. Footsteps round-robin
 * through FOOTSTEPS; other multi-entry kinds pick at random.
 */
export const EVENT_SOUNDS: Partial<Record<DuelEvent["kind"], SoundName[]>> = {
  step: FOOTSTEPS,
  void: FOOTSTEPS,
  whiff: ["whoosh1", "whoosh2", "whoosh3"],
  parried: ["clash1", "clash2", "clash3"],
  hit: ["hit1"],
};

export const AMBIENT: SoundName = "ambientMeadow";
