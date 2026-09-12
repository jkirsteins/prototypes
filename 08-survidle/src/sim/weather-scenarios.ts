import { calendar, type Calendar } from "./calendar";
import { newKnowledge } from "./fineknowledge";
import { markKnown } from "./mapped";
import { newGame } from "./newgame";
import { setRegion } from "./position";
import { patchCenter } from "../world/spatial";
import { visibleCells } from "./sight";
import type { GameState } from "./types";
import { ensureGround } from "./weather";
import { regionPeek, type World } from "../world/gen";

/** Coordinates are fine 50 m patches: each shot names the physical place its note describes. */
export const WEATHER_SHOTS = {
  clear: { seed: 17, minute: 1440, x: 10179, y: 5283, zoom: 2, note: "clear air above the comparison rock" },
  "sunny-clouds": { seed: 17, minute: 170160, x: 4203, y: 5703, zoom: 2, note: "dry midsummer sun with a broken cloud field" },
  "approaching-rain": { seed: 17, minute: 86760, x: 6243, y: 903, zoom: 2, note: "edge of a rain band approaching from the west" },
  "local-rain": { seed: 17, minute: 108720, x: 6675, y: 2403, zoom: 2, note: "the dense part of a local rain band" },
  "persisted-snow": { seed: 17, minute: 480480, x: 5235, y: 5187, zoom: 2, note: "falling snow above snow retained by stationary ground state" },
  "frozen-water": { seed: 17, minute: 481200, x: 1053, y: 303, zoom: 2, note: "safe winter ice over naturally frozen coastal water" },
  "valley-fog": { seed: 17, minute: 19560, x: 8595, y: 6219, zoom: 2, note: "dry fog pooled over bog ground" },
  "windward-lee": { seed: 17, minute: 3960, x: 4203, y: 5703, zoom: 2, note: "a terrain-modified extinction gradient" },
  obscured: { seed: 17, minute: 480480, x: 10179, y: 5283, zoom: 2, note: "dense snow and fog above the comparison rock" },
} as const;

export type WeatherShotName = keyof typeof WEATHER_SHOTS;

export interface WeatherShotFixture {
  definition: (typeof WEATHER_SHOTS)[WeatherShotName];
  state: GameState;
  world: World;
  cal: Calendar;
  cell: number;
  visible: Set<number>;
}

/** Deterministic normal simulation state before its current visibility is materialized. */
export function weatherShotSimulation(name: WeatherShotName): Omit<WeatherShotFixture, "visible"> {
  const definition = WEATHER_SHOTS[name];
  const { state, world } = newGame(definition.seed);
  state.minute = definition.minute;
  state.weather.elapsedMinutes = 0;
  const cell = definition.y * world.w + definition.x;
  const center = patchCenter(cell);
  state.player.xM = center.xM;
  state.player.yM = center.yM;
  setRegion(state, world, regionPeek(world, definition.x, definition.y));
  ensureGround(state, world, state.player.region);
  const cal = calendar(state.minute, state.startDoy);
  return { definition, state, world, cal, cell };
}

/** A browser and test fixture built only from normal simulation state and sight. */
export function weatherShotFixture(name: WeatherShotName): WeatherShotFixture {
  const simulation = weatherShotSimulation(name);
  const { state, world, cal, cell } = simulation;
  const visible = visibleCells(state, world, cal, cell);
  state.knowledge = newKnowledge();
  for (const seen of visible) markKnown(state, seen);
  return { ...simulation, visible };
}
