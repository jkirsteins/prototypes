/**
 * What the survivor looks like they are doing, in the five terms a quiet
 * animation can actually say. There are forty-odd tasks and a motion per
 * task would be noise, so each one is filed under a mood and the map glyph
 * and the header portrait both animate off that.
 *
 * The table is a `Record<TaskId, Mood>` rather than a switch with a default,
 * so a task added to `TaskId` without a mood is a type error at the point it
 * is added rather than a survivor who silently stops moving.
 */
import type { GameState, TaskId } from "../sim/types";

/** Walking the world, working at something, resting awake, asleep, or doing nothing. */
export type Mood = "walk" | "work" | "rest" | "sleep" | "idle";

const MOOD: Record<TaskId, Mood> = {
  // Ground covered: between regions, out to a spot, home under a load, and the
  // exploring sweep, which is walking whatever else it is for.
  travel: "walk", walk: "walk", haul: "walk", explore: "walk", searchHome: "walk",
  // Off the feet.
  sleep: "sleep", night: "sleep", rest: "rest",
  // Everything else is work of some kind, and one slow pulse serves all of it.
  chop: "work", sticks: "work", bark: "work", stone: "work", berries: "work",
  split: "work", deadwood: "work", splitWedges: "work", hunt: "work", fish: "work",
  cook: "work", craft: "work", repair: "work", sharpen: "work", hone: "work",
  build: "work", mend: "work", light: "work", lightTorch: "work", melt: "work",
  thaw: "work", lightIndoors: "work", fill: "work", iceHole: "work", hang: "work",
  read: "work", setTrap: "work", emptyTrap: "work", crack: "work", eggs: "work",
  innerBark: "work", grindBark: "work", roots: "work", tapSap: "work", seaweed: "work",
  makeCamp: "work",
};

/**
 * The mood the whole screen animates to. The dead do not move, and neither
 * does a survivor with nothing on: standing still is a state worth reading
 * as one.
 */
export function moodOf(state: GameState): Mood {
  if (state.dead) return "idle";
  return state.task ? MOOD[state.task.id] : "idle";
}

/** Every mood the table can produce; the stylesheet is checked against this. */
export const MOODS: Mood[] = ["walk", "work", "rest", "sleep", "idle"];

export { MOOD as MOOD_BY_TASK };
