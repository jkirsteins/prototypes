import type { Rng } from "../rng";
import type { World } from "../world/gen";
import type { Calendar } from "./calendar";
import { hourlyHazards } from "./hazards";
import { log } from "./log";
import { die, firelit, sheltered } from "./player";
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

  // Wolves: the night outside, worse in winter.
  if (cal.isNight && !sheltered(state, world) && !firelit(state, world)) {
    let chance = 0.01;
    if (cal.season === "winter") chance *= 2;
    if (rng.chance(chance)) {
      p.health = Math.max(0, p.health - 25);
      p.injured = Math.max(p.injured, 24 * 60);
      log(state, "Wolves out of the dark. You fight them off, bleeding.", "bad");
      if (p.health <= 0) die(state, "wolves");
    }
  }

  hourlyHazards(state, world, cal, ambient, felt, rng);
}
