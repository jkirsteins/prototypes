import { Rng } from "../rng";
import type { World } from "../world/gen";
import { autoEat } from "./actions";
import { dailyAnimals } from "./animals";
import { calendar } from "./calendar";
import { dailyCamp, stepCamp } from "./camp";
import { hourlyEvents } from "./events";
import { runIntent } from "./intent";
import { log } from "./log";
import { causeFrom, die, stepPlayer } from "./player";
import { beginTask, stepTask } from "./tasks";
import type { GameState } from "./types";
import { ambientTemperature, stepWeather } from "./weather";

export const MAX_STEP = 1;
/** Daily rolls happen at this hour. */
const DAILY_HOUR = 4;
/** Below this energy an idle character falls asleep unbidden. */
const EXHAUSTED = 10;

/**
 * Moves the world forward by dtMinutes, in steps of at most one minute so
 * every per-minute rate below means what it says. Safe to call with any dt.
 */
export function advance(state: GameState, world: World, dtMinutes: number): void {
  if (state.dead) return;
  let left = dtMinutes;
  const rng = new Rng(state.rng);
  while (left > 1e-9 && !state.dead) {
    const dt = Math.min(MAX_STEP, left);
    left -= dt;
    step(state, world, rng, dt);
  }
  state.rng = rng.s;
}

function step(state: GameState, world: World, rng: Rng, dt: number): void {
  state.minute += dt;
  const cal = calendar(state.minute);

  const ev = stepWeather(state.weather, cal, rng, dt);
  const ambient = ambientTemperature(cal, state.weather);
  if (ev.coldSnap) log(state, `A cold snap. ${Math.round(ambient)} C and falling.`, "bad");
  if (ev.precipStarted) log(state, ambient <= 0 ? "Snow begins to fall." : "Rain sets in.");
  if (ev.precipStopped) log(state, state.weather.snowCm > 0 && ambient <= 0 ? "The snow stops." : "The rain stops.");

  stepTask(state, world, cal, rng, dt);
  runIntent(state, world, cal, rng);
  // A body left idle and spent lies down on its own.
  if (!state.task && state.player.energy < EXHAUSTED && beginTask(state, world, cal, "sleep")) {
    log(state, "Too tired to stand, you sleep where you are.");
  }
  stepCamp(state, world, ambient, dt);
  const drains = stepPlayer(state, world, ambient, dt);
  autoEat(state, world, rng);

  const hour = Math.floor(state.minute / 60);
  if (hour > state.lastHour) {
    state.lastHour = hour;
    hourlyEvents(state, world, cal, rng);
  }
  if (cal.dayIndex > state.lastDay && cal.hour >= DAILY_HOUR) {
    state.lastDay = cal.dayIndex;
    dailyAnimals(state, world, cal, rng);
    dailyCamp(state, world, cal, rng);
  }

  if (state.player.health <= 0 && !state.dead) die(state, causeFrom(drains));
}
