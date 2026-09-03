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
  forest: loop(0.5, "forest.ogg"), leaves: loop(0.4, "leaves.ogg"), open: loop(0.45, "open.ogg"), lake: loop(0.5, "lake.ogg"), sea: loop(0.55, "sea.ogg"),
  rain_light: loop(0.4, "rain_light.ogg"), rain_heavy: loop(0.55, "rain_heavy.ogg"), fire: loop(0.6, "fire.ogg"), chorus: loop(0.35, "chorus.ogg"), insects: loop(0.25, "insects.ogg"),
  // The work.
  step_leaves: shot(0.5, "step_leaves_01.ogg", "step_leaves_02.ogg", "step_leaves_03.ogg", "step_leaves_04.ogg"), step_grass: shot(0.45, "step_grass_01.ogg", "step_grass_02.ogg", "step_grass_03.ogg", "step_grass_04.ogg"), step_bog: shot(0.5, "step_bog_01.ogg", "step_bog_02.ogg", "step_bog_03.ogg", "step_bog_04.ogg"), step_rock: shot(0.5, "step_rock_01.ogg", "step_rock_02.ogg", "step_rock_03.ogg", "step_rock_04.ogg"), step_snow: shot(0.5, "step_snow_01.ogg", "step_snow_02.ogg", "step_snow_03.ogg", "step_snow_04.ogg"), step_ice: shot(0.5, "step_ice_01.ogg", "step_ice_02.ogg", "step_ice_03.ogg", "step_ice_04.ogg"),
  axe: shot(0.7, "axe_01.ogg", "axe_02.ogg", "axe_03.ogg"), knap: shot(0.5, "knap.ogg"),
  // Moments.
  treeFalls: shot(0.8, "treeFalls.ogg"), arrow: shot(0.6, "arrow.ogg"), spear: shot(0.6, "spear.ogg"), fireCatches: shot(0.6, "fireCatches.ogg"), torchLit: shot(0.5, "torchLit.ogg"),
  iceCracks: shot(0.7, "iceCracks.ogg"), fallThrough: shot(0.9, "fallThrough.ogg"), toolBreaks: shot(0.7, "toolBreaks.ogg"), wolves: shot(0.9, "wolves.ogg"),
  // Calls.
  loon: shot(0.7, "loon.ogg"), cuckoo: shot(0.6, "cuckoo.ogg"), raven: shot(0.6, "raven.ogg"), owl: shot(0.6, "owl.ogg"), crane: shot(0.6, "crane.ogg"), woodpecker: shot(0.5, "woodpecker.ogg"),
  capercaillie: shot(0.6, "capercaillie.ogg"), blackGrouse: shot(0.6, "blackGrouse.ogg"), willowGrouse: shot(0.6, "willowGrouse.ogg"), ptarmigan: shot(0.6, "ptarmigan.ogg"), mallard: shot(0.6, "mallard.ogg"), eider: shot(0.6, "eider.ogg"),
  goose: shot(0.6, "goose.ogg"), elk: shot(0.7, "elk.ogg"), wolf: shot(0.7, "wolf.ogg"), fox: shot(0.6, "fox.ogg"), squirrel: shot(0.4, "squirrel.ogg"),
};
