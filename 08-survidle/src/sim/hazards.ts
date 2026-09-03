/**
 * The hourly rolls that need a die: what the weather does to your things
 * and your body over an hour. Called from hourlyEvents. iceUnderFoot is the
 * exception: standing on failing ice is a per-minute risk (the ice does not
 * wait for the hour to turn), so advance.ts calls it every step instead.
 */
import type { Rng } from "../rng";
import { cellAt, neighbours, type World } from "../world/gen";
import type { Calendar } from "./calendar";
import { TOOLS } from "./items";
import { log } from "./log";
import { activityOf } from "./player";
import { atCamp, cellOf } from "./position";
import { regionState } from "./regionstate";
import { fallChance, fallThrough } from "./tasks";
import type { GameState } from "./types";
import { FREEZE_C } from "./water";
import { ICE_THIN_CM } from "./weather";

export function hourlyHazards(state: GameState, world: World, cal: Calendar, ambient: number, felt: number, rng: Rng): void {
  void cal;
  void felt;
  freezeVessels(state, world, ambient, rng);
}

/**
 * Ice too thin to bear weight at all: standing on it risks the fall every
 * minute you stay. A walk already rolls this per cell as it crosses
 * (tasks.ts, stepWalk), so this is only for standing still on it.
 */
export function iceUnderFoot(state: GameState, world: World, rng: Rng): void {
  if (state.weather.iceCm >= ICE_THIN_CM) return;
  if (activityOf(state.task) === "walk") return;
  const cell = cellOf(state, world);
  if (cellAt(world, cell).terrain !== "water") return;
  if (!rng.chance(fallChance(state.weather.iceCm))) return;
  const land = neighbours(world, cell).find((n) => cellAt(world, n).terrain !== "water") ?? cell;
  fallThrough(state, world, rng, land);
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
