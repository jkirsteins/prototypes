/**
 * Every sound the game can make, by slot. A slot with several files plays
 * them round-robin. Gains are per slot under the bus; loops peak lower
 * than one-shots so a bed never masks an event. public/audio/manifest.md
 * says where each file came from.
 */
import type { Cue } from "../sim/cues";

export type Slot = string;
export interface SlotDef { files: string[]; kind: "loop" | "oneshot"; gain: number }

const loop = (gain: number, ...files: string[]): SlotDef => ({ files, kind: "loop", gain });
const shot = (gain: number, ...files: string[]): SlotDef => ({ files, kind: "oneshot", gain });

/**
 * Every slot name that is not one of the sim's Cue names. Declaring SLOTS
 * over `Cue | KnownSlot` makes a missing cue slot a compile error: add a
 * cue in sim/cues.ts and forget its sound here, and tsc catches it.
 */
type KnownSlot =
  | "forest" | "leaves" | "open" | "lake" | "sea"
  | "rain_light" | "rain_heavy" | "fire" | "chorus" | "insects"
  | "step_leaves" | "step_grass" | "step_bog" | "step_rock" | "step_snow" | "step_ice"
  | "axe" | "knap"
  | "loon" | "cuckoo" | "raven" | "owl" | "crane" | "woodpecker"
  | "capercaillie" | "blackGrouse" | "willowGrouse" | "ptarmigan" | "mallard" | "eider"
  | "goose" | "elk" | "wolf" | "fox" | "squirrel";

export const SLOTS: Record<Cue | KnownSlot, SlotDef> = {
  // Beds.
  forest: loop(0.5), leaves: loop(0.4), open: loop(0.45), lake: loop(0.5), sea: loop(0.55),
  rain_light: loop(0.4), rain_heavy: loop(0.55), fire: loop(0.6), chorus: loop(0.35), insects: loop(0.25),
  // The work.
  step_leaves: shot(0.5), step_grass: shot(0.45), step_bog: shot(0.5), step_rock: shot(0.5), step_snow: shot(0.5), step_ice: shot(0.5),
  axe: shot(0.7), knap: shot(0.5),
  // Moments.
  treeFalls: shot(0.8), arrow: shot(0.6), spear: shot(0.6), fireCatches: shot(0.6), torchLit: shot(0.5),
  iceCracks: shot(0.7), fallThrough: shot(0.9), toolBreaks: shot(0.7), wolves: shot(0.9),
  // Calls.
  loon: shot(0.7), cuckoo: shot(0.6), raven: shot(0.6), owl: shot(0.6), crane: shot(0.6), woodpecker: shot(0.5),
  capercaillie: shot(0.6), blackGrouse: shot(0.6), willowGrouse: shot(0.6), ptarmigan: shot(0.6), mallard: shot(0.6), eider: shot(0.6),
  goose: shot(0.6), elk: shot(0.7), wolf: shot(0.7), fox: shot(0.6), squirrel: shot(0.4),
};
