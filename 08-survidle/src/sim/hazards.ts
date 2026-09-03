/**
 * The hourly rolls that need a die: what the weather does to your things
 * and your body over an hour. Called from hourlyEvents.
 */
import type { Rng } from "../rng";
import type { World } from "../world/gen";
import type { Calendar } from "./calendar";
import { TOOLS } from "./items";
import { log } from "./log";
import { activityOf } from "./player";
import { atCamp } from "./position";
import { regionState } from "./regionstate";
import type { GameState } from "./types";
import { FREEZE_C } from "./water";

export function hourlyHazards(state: GameState, world: World, cal: Calendar, ambient: number, felt: number, rng: Rng): void {
  void cal;
  void felt;
  freezeVessels(state, world, ambient, rng);
}

/** A still pack in frost: the water in it freezes; a bark bucket more than half full may split. */
function freezeVessels(state: GameState, world: World, ambient: number, rng: Rng): void {
  const p = state.player;
  if (ambient >= FREEZE_C) return;
  const a = activityOf(state.task);
  if (a === "walk" || a === "heavy" || a === "light") return;
  const st = regionState(state, world, p.region);
  if (atCamp(state, world) && st.fire.lit) return;
  for (const t of [...p.tools]) {
    const holds = TOOLS[t.id].litres ?? 0;
    if (!holds || !(t.litres ?? 0) || t.frozen) continue;
    t.frozen = true;
    if (t.id === "barkBucket" && t.litres! > holds / 2 && rng.chance(1 / 3)) {
      p.tools = p.tools.filter((x) => x !== t);
      log(state, "The bucket has split in the frost.", "bad");
    }
  }
}
