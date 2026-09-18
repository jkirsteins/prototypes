/**
 * One thing the runner can start: an ordinary task and the words the Doing
 * panel shows while it runs. The runner decides a step every minute; a step
 * already under way is left alone.
 */
import type { Rng } from "../rng";
import type { Calendar } from "./calendar";
import type { World } from "../world/gen";
import { beginTask, check, whereIs } from "./tasks";
import type { GameState, TaskId } from "./types";

export interface Step {
  id: TaskId;
  arg?: string;
  /** "walking to the forest", "felling a tree", "sleeping". */
  step: string;
}

export function walkStep(state: GameState, world: World, cell: number, why: string): Step {
  return { id: "walk", arg: `cell:${cell}`, step: `walking to ${whereIs(state, world, cell)}${why}` };
}

export function isRunning(state: GameState, s: Step): boolean {
  const t = state.task;
  if (!t || t.id !== s.id) return false;
  // An "anything" step is running as whatever it drew, not under the word.
  if (s.arg === "any") return t.any === true;
  return (t.arg ?? "") === (s.arg ?? "");
}

/**
 * Whether this step could start this minute: already under way, or its
 * task's own check says it can begin. The body asks this before it names
 * a step, because a step named and refused is a stall: the strip prints
 * the words, no task runs under them, and the survivor stands still (a
 * thirsty one, beside a brook the ice-hole task would not cut, until he
 * died). A step that cannot start is skipped for the need's next fallback.
 */
export function canStart(state: GameState, world: World, cal: Calendar, s: Step): boolean {
  return isRunning(state, s) || check(state, world, cal, s.id, s.arg).ok;
}

/** Starts the step unless it is already under way. False when it cannot start; the intent is untouched either way. */
export function takeStep(state: GameState, world: World, cal: Calendar, s: Step, rng?: Rng): boolean {
  const it = state.intent;
  if (!it) return false;
  if (isRunning(state, s)) return true;
  if (!beginTask(state, world, cal, s.id, s.arg, false, rng)) return false;
  it.step = s.step;
  // A fresh rest's starting warmth, so stepTask can judge what it gained when it completes;
  // unset for every other step so a stale reading never survives into one that is not a rest.
  if (it.mode !== "hand") it.restFromWarmth = s.id === "rest" ? state.player.warmth : undefined;
  return true;
}
