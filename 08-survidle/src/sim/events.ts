import type { Rng } from "../rng";
import { regionAt, type World } from "../world/gen";
import type { Calendar } from "./calendar";
import { regionDensity } from "./animals";
import { cue } from "./cues";
import { hourlyHazards } from "./hazards";
import { log } from "./log";
import { hasQuirk } from "./person";
import { die, firelit, sheltered } from "./player";
import { noteNight } from "./record";
import type { GameState } from "./types";

/** Rolled once per game hour. */
export function hourlyEvents(state: GameState, world: World, cal: Calendar, ambient: number, felt: number, rng: Rng): void {
  const p = state.player;

  // Sickness: cold and wet is how you catch it.
  if (p.sick === 0) {
    let chance = 0.001;
    if (p.wetness > 50 && p.warmth < 40) chance *= 4;
    if (rng.chance(chance)) {
      p.sick = 48 * 60;
      log(state, "A fever comes on. Rest somewhere warm.", "bad");
    }
  }

  // Wolves: the night outside, where wolves live, worse in winter. A region without wolves has quiet nights.
  let wolvesTonight = false;
  if (cal.isNight && !sheltered(state, world) && !firelit(state, world)) {
    let chance = 0.02 * regionDensity(state, world, p.region, "wolf", cal);
    if (cal.season === "winter") chance *= 2;
    if (chance > 0 && rng.chance(chance)) {
      wolvesTonight = true;
      cue("wolves");
      if (hasQuirk(state, "sleepsLight")) {
        // Awake before they are close: the fire between them and the bed, and no wound.
        log(state, "You wake at the wolves and sit up by the embers till they go.", "bad");
      } else {
        p.health = Math.max(0, p.health - 25);
        p.injured = Math.max(p.injured, 24 * 60);
        log(state, "Wolves out of the dark. You fight them off, bleeding.", "bad");
        if (p.health <= 0) die(state, "wolves", regionAt(world, p.region).name);
      }
    }
  }
  if (cal.isNight) noteNight(state, p.warmth, wolvesTonight);

  hourlyHazards(state, world, ambient, felt, rng);
}
