import { Rng } from "../rng";
import { regionAt, type World } from "../world/gen";
import { autoEat } from "./actions";
import { dailyAnimals } from "./animals";
import { stormOptions } from "./body";
import { calendar, DAILY_HOUR } from "./calendar";
import { dailyCamp, stepCamp, stepEmergencyShelter, stepFoundCover } from "./camp";
import { hourlyEvents } from "./events";
import { recordStormMinute, stepGoalOpportunity, stormMetrics } from "./goalopportunity";
import { checkWinterStores, goalDeed } from "./goals";
import { hourlyWorld, iceUnderFoot } from "./hazards";
import { runIntent } from "./intent";
import { log } from "./log";
import { runOrders } from "./orders";
import { atCamp, cellOf } from "./position";
import { causeFrom, die, type Drains, feltTemperature, stepPlayer } from "./player";
import { current, record } from "./record";
import { seeFrom } from "./sight";
import { stepSpine } from "./spine";
import { stepTask } from "./tasks";
import type { GameState } from "./types";
import type { WildlifeMode } from "./types";
import { stepSeeps } from "./seep";
import { advanceWildlifeMotion, dailyWildlife, stepWildlife } from "./wildlife-agents";
import { autoDrink } from "./water";
import { ambientTemperature, forecastKnowledge, forecastStage, forecastText, NO_FORECAST_KNOWLEDGE, sameForecastKnowledge, stepWeather, stormComing } from "./weather";

export const MAX_STEP = 1;
const CARRY_EPSILON = 1e-9;
const WILDLIFE_MOTION_STEP = 0.05;

/** Where a body is, for the world half to shape itself around without touching the body. */
export interface Presence {
  region: number;
  atCamp: boolean;
}

/**
 * Moves the world forward by dtMinutes. Fractional time is banked on the
 * state and the world runs in fixed one-minute ticks, so frame cadence cannot
 * change how many seeded rolls a minute consumes. Detailed wildlife travel
 * uses fixed 0.05-minute motion ticks between those decisions so fast animals
 * cross metric space continuously without making frame cadence part of RNG.
 * Safe to call with any dt.
 * With `nobody: true` the person half (tasks, orders, intents, eating,
 * drinking, the death check) is skipped and a dead flag no longer halts
 * time: this is how the months between two survivors run, on the same
 * weather, camp and animal rules a lived-in world uses.
 */
export function advance(state: GameState, world: World, dtMinutes: number, opts: { nobody?: boolean; wildlife?: WildlifeMode; live?: boolean } = {}): void {
  const nobody = opts.nobody ?? false;
  const wildlife = nobody ? "aggregate" : (opts.wildlife ?? "aggregate");
  if (state.dead && !nobody) return;
  if (!(dtMinutes > 0)) return;
  const rng = new Rng(state.rng);
  if (wildlife === "detailed") {
    let left = dtMinutes;
    while (left > CARRY_EPSILON && !state.dead) {
      const motionTick = Math.floor((state.advanceCarry + CARRY_EPSILON) / WILDLIFE_MOTION_STEP);
      const toMotion = Math.min(1, (motionTick + 1) * WILDLIFE_MOTION_STEP) - state.advanceCarry;
      const toWorld = 1 - state.advanceCarry;
      const elapsed = Math.min(left, toMotion, toWorld);
      state.advanceCarry += elapsed;
      left -= elapsed;
      if (toMotion - elapsed <= CARRY_EPSILON) advanceWildlifeMotion(state, world, rng, WILDLIFE_MOTION_STEP);
      if (toWorld - elapsed <= CARRY_EPSILON) {
        state.advanceCarry = 0;
        stepAtStormBoundary(state, world, rng, MAX_STEP, nobody, wildlife, opts.live ?? false, 0);
      }
    }
    if (state.dead) state.advanceCarry = 0;
    state.rng = rng.s;
    return;
  }
  const elapsed = state.advanceCarry + dtMinutes;
  const ticks = Math.floor(elapsed + CARRY_EPSILON);
  const carry = elapsed - ticks;
  state.advanceCarry = Math.abs(carry) < CARRY_EPSILON ? 0 : carry;
  for (let tick = 0; tick < ticks && (nobody || !state.dead); tick++) stepAtStormBoundary(state, world, rng, MAX_STEP, nobody, wildlife, opts.live ?? false);
  if (state.dead && !nobody) state.advanceCarry = 0;
  state.rng = rng.s;
}

function stepAtStormBoundary(state: GameState, world: World, rng: Rng, dtMinutes: number, nobody: boolean, wildlife: WildlifeMode, live: boolean, wildlifeDt = dtMinutes): void {
  let left = dtMinutes;
  while (left > CARRY_EPSILON) {
    const onset = state.weather.storm?.from;
    const dt = onset !== undefined && onset > state.minute && onset < state.minute + left
      ? onset - state.minute
      : left;
    left -= dt;
    const finalSegment = left <= CARRY_EPSILON;
    step(state, world, rng, dt, nobody || state.dead !== null, wildlife, live, wildlifeDt === 0 ? 0 : dt, wildlife !== "detailed" || finalSegment);
  }
}

function step(state: GameState, world: World, rng: Rng, dt: number, nobody: boolean, wildlife: WildlifeMode, live: boolean, wildlifeDt = dt, runWildlife = true): void {
  const previousMinute = state.minute;
  state.minute += dt;
  const cal = calendar(state.minute, state.startDoy);

  // This interval elapsed for cover that already existed at its start. Run
  // before tasks so a search completing now resets the new cover to age zero.
  stepFoundCover(state, dt);
  stepEmergencyShelter(state, world, dt);

  const previousStorm = state.weather.storm;
  const hadStorm = previousStorm !== null;
  const ev = stepWeather(state.weather, cal, rng, dt, state.minute);
  const ambient = ambientTemperature(cal, state.weather);
  const currentStorm = state.weather.storm;
  if (!nobody) {
    const beforeKnowledge = previousStorm ? forecastKnowledge(state, previousStorm, previousMinute) : null;
    if (ev.coldSnap) log(state, `A cold snap. ${Math.round(ambient)} C and falling.`, "bad");
    if (ev.precipStarted) log(state, ambient <= 0 ? "Snow begins to fall." : "Rain sets in.");
    if (ev.precipStopped) log(state, state.weather.snowCm > 0 && ambient <= 0 ? "The snow stops." : "The rain stops.");
    if (hadStorm && state.weather.storm === null && !state.dead) record(state, { kind: "storm" });
    if (state.weather.storm && !state.weather.storm.warned && stormComing(state)) {
      state.weather.storm.warned = true;
      log(state, forecastStage(state) === 1 ? "The sky is closing in from the west." : `The sky is closing in: ${forecastText(state)}.`, "bad");
    }
    const knowledgeStorm = currentStorm ?? previousStorm;
    if (knowledgeStorm) {
      const before = previousStorm?.id === knowledgeStorm.id && beforeKnowledge ? beforeKnowledge : { ...NO_FORECAST_KNOWLEDGE };
      const after = currentStorm?.id === knowledgeStorm.id ? forecastKnowledge(state, knowledgeStorm) : { ...NO_FORECAST_KNOWLEDGE };
      if (!sameForecastKnowledge(before, after)) {
        goalDeed(state, { kind: "forecastChanged", minute: state.minute, stormId: knowledgeStorm.id, before, after, source: "passive" }, world);
      }
    }
  }

  if (!nobody) {
    stepTask(state, world, cal, rng, dt);
    runOrders(state, world, cal, rng);
    runIntent(state, world, cal, rng);
  }

  // Work in the elapsed interval belongs before its ending boundary. Capture
  // the onset plan only after that work has settled, while storm exposure for
  // the interval remains zero below.
  if (!nobody && currentStorm && previousMinute < currentStorm.from && state.minute >= currentStorm.from) {
    const plan = stormOptions(state, world, currentStorm);
    goalDeed(state, { kind: "stormStarted", minute: state.minute, stormId: currentStorm.id, plan }, world);
  }

  // Read after the task step above: a walk, an order or an intent can move
  // the body within this same minute, and the world half should see where
  // it landed, the same place stepCamp used to read state.player itself.
  const who: Presence | null = nobody ? null : { region: state.player.region, atCamp: atCamp(state, world) };

  if (runWildlife) stepWildlife(state, world, cal, rng, wildlifeDt, wildlife, live);

  stepCamp(state, world, ambient, dt, who);
  stepSeeps(state, world, ambient, dt);

  let drains: Drains | null = null;
  if (!nobody) {
    drains = stepPlayer(state, world, cal, ambient, dt);
    autoEat(state, world, rng);
    autoDrink(state, world);
    iceUnderFoot(state, world, rng);
    // Attribute exactly the overlap of this elapsed interval to where the
    // survivor ended it, after its task or movement has taken effect.
    if (previousStorm) {
      const stormMinutes = Math.max(0, Math.min(state.minute, previousStorm.until) - Math.max(state.minute - dt, previousStorm.from));
      recordStormMinute(state, world, previousStorm.id, previousStorm.kind, stormMinutes);
    }
  }

  const hour = Math.floor(state.minute / 60);
  if (hour > state.lastHour) {
    state.lastHour = hour;
    hourlyWorld(state, world, cal, ambient, rng, who);
    const detailedWolves = wildlife === "detailed" && state.wildlife.subjects.some((subject) => subject.species === "wolf" && subject.region === state.player.region && subject.active);
    if (!nobody) hourlyEvents(state, world, cal, ambient, feltTemperature(state, world, ambient), rng, !detailedWolves);
    // Standing still still sees: the eye does not need a step to look around.
    if (!nobody) seeFrom(state, world, cal, cellOf(state, world));
  }
  if (cal.dayIndex > state.lastDay && cal.hour >= DAILY_HOUR) {
    state.lastDay = cal.dayIndex;
    dailyWildlife(state, world, cal, rng, wildlife);
    dailyAnimals(state, world, cal, rng, who);
    dailyCamp(state, world, cal, rng, who);
    stepSpine(state, cal, who);
    // A season is reached by living into it. Landing inside one is not
    // reaching it, which is why the turnover and not the reading is the deed.
    const season = cal.season;
    if (season !== state.goals.lastSeason) {
      state.goals.lastSeason = season;
      if (!nobody) goalDeed(state, { kind: "season", season });
    }
    if (!nobody) checkWinterStores(state);
    if (!nobody) current(state).forecast.push(null);
  }

  if (!nobody && drains && state.player.health <= 0 && !state.dead) {
    die(state, causeFrom(drains), regionAt(world, state.player.region).name);
  }
  if (!nobody && previousStorm && state.weather.storm === null) {
    goalDeed(state, {
      kind: "stormEnded", minute: state.minute, stormId: previousStorm.id, stormKind: previousStorm.kind, survivorAlive: !state.dead,
      ...stormMetrics(state, previousStorm.id),
    });
  }
  stepGoalOpportunity(state, world, cal, rng);
}
