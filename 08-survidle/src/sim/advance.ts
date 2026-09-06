import { Rng } from "../rng";
import { regionAt, type World } from "../world/gen";
import { autoEat } from "./actions";
import { dailyAnimals } from "./animals";
import { calendar } from "./calendar";
import { dailyCamp, stepCamp } from "./camp";
import { hourlyEvents } from "./events";
import { hourlyWorld, iceUnderFoot } from "./hazards";
import { runIntent } from "./intent";
import { log } from "./log";
import { runOrders } from "./orders";
import { atCamp } from "./position";
import { causeFrom, die, type Drains, feltTemperature, stepPlayer } from "./player";
import { current, record } from "./record";
import { stepSpine } from "./spine";
import { beginTask, stepTask } from "./tasks";
import type { GameState } from "./types";
import { stepSeeps } from "./seep";
import { autoDrink } from "./water";
import { ambientTemperature, stepWeather, stormComing } from "./weather";

export const MAX_STEP = 1;
/** Daily rolls happen at this hour. */
const DAILY_HOUR = 4;
/** Below this energy an idle character falls asleep unbidden. */
const EXHAUSTED = 10;

/** Where a body is, for the world half to shape itself around without touching the body. */
export interface Presence {
  region: number;
  atCamp: boolean;
}

/**
 * Moves the world forward by dtMinutes, in steps of at most one minute so
 * every per-minute rate below means what it says. Safe to call with any dt.
 * With `nobody: true` the person half (tasks, orders, intents, eating,
 * drinking, the death check) is skipped and a dead flag no longer halts
 * time: this is how the months between two survivors run, on the same
 * weather, camp and animal rules a lived-in world uses.
 */
export function advance(state: GameState, world: World, dtMinutes: number, opts: { nobody?: boolean } = {}): void {
  const nobody = opts.nobody ?? false;
  if (state.dead && !nobody) return;
  let left = dtMinutes;
  const rng = new Rng(state.rng);
  while (left > 1e-9 && (nobody || !state.dead)) {
    const dt = Math.min(MAX_STEP, left);
    left -= dt;
    step(state, world, rng, dt, nobody);
  }
  state.rng = rng.s;
}

function step(state: GameState, world: World, rng: Rng, dt: number, nobody: boolean): void {
  state.minute += dt;
  const cal = calendar(state.minute, state.startDoy);
  // Dawn ends the night's sleep marker whether or not anyone is running orders.
  if (!cal.isNight) state.player.sleptTonight = false;

  const hadStorm = state.weather.storm !== null;
  const ev = stepWeather(state.weather, cal, rng, dt, state.minute);
  const ambient = ambientTemperature(cal, state.weather);
  if (!nobody) {
    if (ev.coldSnap) log(state, `A cold snap. ${Math.round(ambient)} C and falling.`, "bad");
    if (ev.precipStarted) log(state, ambient <= 0 ? "Snow begins to fall." : "Rain sets in.");
    if (ev.precipStopped) log(state, state.weather.snowCm > 0 && ambient <= 0 ? "The snow stops." : "The rain stops.");
    if (hadStorm && state.weather.storm === null && !state.dead) record(state, { kind: "storm" });
    if (state.weather.storm && !state.weather.storm.warned && stormComing(state.weather, state.minute)) {
      state.weather.storm.warned = true;
      log(state, "The sky is closing in from the west.", "bad");
    }
  }

  if (!nobody) {
    stepTask(state, world, cal, rng, dt);
    runOrders(state, world, cal, rng);
    runIntent(state, world, cal, rng);
    // A body left idle and spent lies down on its own.
    if (!state.task && state.player.energy < EXHAUSTED && beginTask(state, world, cal, "sleep")) {
      log(state, "Too tired to stand, {you} {sleep} where {you} {are}.");
    }
  }

  // Read after the task step above: a walk, an order or an intent can move
  // the body within this same minute, and the world half should see where
  // it landed, the same place stepCamp used to read state.player itself.
  const who: Presence | null = nobody ? null : { region: state.player.region, atCamp: atCamp(state, world) };

  stepCamp(state, world, ambient, dt, who);
  stepSeeps(state, world, ambient, dt);

  let drains: Drains | null = null;
  if (!nobody) {
    drains = stepPlayer(state, world, ambient, dt);
    autoEat(state, world, rng);
    autoDrink(state, world);
    iceUnderFoot(state, world, rng);
  }

  const hour = Math.floor(state.minute / 60);
  if (hour > state.lastHour) {
    state.lastHour = hour;
    hourlyWorld(state, world, cal, ambient, rng, who);
    if (!nobody) hourlyEvents(state, world, cal, ambient, feltTemperature(state, world, ambient), rng);
  }
  if (cal.dayIndex > state.lastDay && cal.hour >= DAILY_HOUR) {
    state.lastDay = cal.dayIndex;
    dailyAnimals(state, world, cal, rng, who);
    dailyCamp(state, world, cal, rng, who);
    stepSpine(state, cal, who);
    if (!nobody) current(state).forecast.push(null);
  }

  if (!nobody && drains && state.player.health <= 0 && !state.dead) {
    die(state, causeFrom(drains), regionAt(world, state.player.region).name);
  }
}
