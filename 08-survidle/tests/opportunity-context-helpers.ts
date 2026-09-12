/**
 * Arranging a survivor who has already learned their way to one weather lesson.
 * Shared by the fast opportunity-context cases and the heir cases, which live in
 * the slow suite because each of them steps the world across the landing gap.
 */
import { vi } from "vitest";
import * as climate from "../src/sim/climate";
import { straightKm } from "../src/sim/position";
import { atmosphereAt } from "../src/sim/weather";
import { isLee } from "../src/sim/shelter";
import { cellAt, regionAt, type World } from "../src/world/gen";
import { passable } from "../src/world/route";
import type { GameState, OpportunityKey } from "../src/sim/types";
import { reveal } from "./opportunity-helpers";
import { siteCamp } from "./siting-helpers";
import { testAtmosphere } from "./weather-helpers";
import { regionNear } from "./world-facts";

export const THROUGH_SHELTER: OpportunityKey[] = [
  "site", "drink", "firewood", "fire", "bed", "roof", "keptNight", "forageMeal", "cook",
  "findUsefulCover", "makeUsefulShelter",
];
export const THROUGH_CAMP_SYSTEMS: OpportunityKey[] = [
  ...THROUGH_SHELTER, "testShelter", "snareMeal", "huntMeal", "fishMeal", "trapMeal",
  "foodSource", "store", "fat", "firstOrder", "water", "keptDays",
];

export function finish(state: GameState, ids: OpportunityKey[]): void {
  for (const id of ids) state.opportunities.completedAt[id] = 0;
}

export function activateShelterTest(state: GameState): void {
  finish(state, THROUGH_SHELTER);
  reveal(state, ["testShelter"]);
}

export function activateWeatherReading(state: GameState): void {
  finish(state, THROUGH_CAMP_SYSTEMS);
  state.minute = 7 * 1440;
  reveal(state, ["readWeather"]);
}

export function activateRemoteStorm(state: GameState): void {
  finish(state, [
    ...THROUGH_CAMP_SYSTEMS, "readWeather", "prepareWeather", "surviveForecast", "longOrder", "toolCare",
    "explore", "remoteRefuge", "fieldFire", "fieldMeal",
  ]);
  state.minute = 30 * 1440;
  reveal(state, ["remoteStorm"]);
}

export function activateRemoteRefuge(state: GameState): void {
  finish(state, [...THROUGH_CAMP_SYSTEMS, "readWeather", "prepareWeather", "surviveForecast"]);
  state.minute = 30 * 1440;
  reveal(state, ["remoteRefuge"]);
}

export function testStormWindow(from: number, until: number, temperatureC = 5): void {
  const clear = testAtmosphere({ temperatureC });
  vi.mocked(climate.sampleAtmosphere).mockImplementation((_weather, _world, minute) => minute >= from && minute < until
    ? { ...clear, cloud: 1, precipMmPerHour: 8,
      rainMmPerHour: temperatureC > 0 ? 8 : 0, snowCmPerHour: temperatureC <= 0 ? 8 : 0,
      precip: temperatureC > 0 ? "rain" : "snow", windKmh: 40 }
    : { ...clear });
}

/**
 * A survivor at the refuge lesson, with a refuge region found by rule: land more
 * than a kilometre from its own camp, so protection counted anywhere in the
 * region is not the same thing as protection within the local radius, and open
 * meadow to be exposed on. A region of mostly sea has neither.
 */
export function remoteAttempt(state: GameState, world: World, stormId = 90): { home: number; remote: ReturnType<typeof regionAt> } {
  siteCamp(state, world);
  activateRemoteStorm(state);
  const home = state.player.region;
  const remote = regionAt(world, regionNear(world, home, (id) => {
    if (id === home) return false;
    const region = regionAt(world, id);
    if (region.campCell === null) return false;
    const land = region.cells.filter((cell) => passable(cellAt(world, cell).terrain));
    return land.some((cell) => straightKm(world, region.campCell!, cell) > 1)
      && land.some((cell) => cellAt(world, cell).terrain === "meadow" && !isLee(world, cell, atmosphereAt(state, world, cell).windBearingDeg))
      && land.some((cell) => cellAt(world, cell).terrain === "spruce");
  }));
  state.opportunities.context.weather = {
    opportunity: "remoteStorm", status: "running", createdAt: state.minute, attempts: 1,
    stormId, source: "natural", area: { region: remote.id, centre: remote.campCell!, radiusKm: 1 },
    announcedAt: state.minute, resolvedAt: null, minutesByProtection: [0, 0, 0, 0],
    atCampMinutes: 0, awayFromCampMinutes: 0, maxWetness: 0 };
  return { home, remote };
}
