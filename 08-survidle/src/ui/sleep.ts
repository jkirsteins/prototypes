import type { World } from "../world/gen";
import { type Calendar, fmtClock } from "../sim/calendar";
import { debtFallHalved, minutesToSleep, minutesUntilWake, sleepiness, SLEEPY_AT } from "../sim/sleep";
import type { GameState } from "../sim/types";

/** The practical clock readout of the same process drawn by the Sleepiness bar. */
export function sleepForecast(state: GameState, world: World, cal: Calendar): string {
  const asleep = state.player.sleeping !== null || state.task?.id === "sleep";
  if (asleep) {
    const reduced = debtFallHalved(state, world);
    const minutes = minutesUntilWake(state.player.sleepDebt, cal.hour, reduced);
    const time = fmtClock((cal.hour + minutes / 60) % 24);
    return `Wake about ${time}${reduced ? " - storm reduces sleep quality" : ""}`;
  }
  const minutes = minutesToSleep(state.player.sleepDebt, cal.hour);
  const soon = sleepiness(state.player.sleepDebt, cal.hour) >= SLEEPY_AT ? " soon," : "";
  return `Sleep${soon} about ${fmtClock((cal.hour + minutes / 60) % 24)}`;
}
