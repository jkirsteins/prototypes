/**
 * One thing the runner can start: an ordinary task and the words the Doing
 * panel shows while it runs. The runner decides a step every minute; a step
 * already under way is left alone.
 */
import type { Rng } from "../rng";
import type { Calendar } from "./calendar";
import type { World } from "../world/gen";
import { beginTask, whereIs } from "./tasks";
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

/** Starts the step unless it is already under way. False when it cannot start; the intent is untouched either way. */
export function takeStep(state: GameState, world: World, cal: Calendar, s: Step, rng?: Rng): boolean {
  const it = state.intent;
  if (!it) return false;
  if (isRunning(state, s)) return true;
  if (!beginTask(state, world, cal, s.id, s.arg, false, rng)) return false;
  it.step = s.step;
  // A fresh rest's starting warmth, so stepTask can judge what it gained when it completes;
  // unset for every other step so a stale reading never survives into one that is not a rest.
  it.restFromWarmth = s.id === "rest" ? state.player.warmth : undefined;
  return true;
}
