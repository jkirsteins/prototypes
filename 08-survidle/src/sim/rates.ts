/**
 * What the stocks are doing, as a list of signed causes rather than one
 * number. A player who reads "+0.33 kg/min" and cannot see the fire inside
 * it has been given a number to trust rather than a reading to use.
 *
 * Only causes the simulation can answer exactly are in here. A task with no
 * declared yield contributes nothing, and the panel says what it counted, so
 * the estimate is never a guess wearing a reading's clothes.
 */
import type { World } from "../world/gen";
import { coveredWoodKg, woodOnHandKg } from "./camp";
import type { Calendar } from "./calendar";
import { burnPerHour, RAIN_WET_KG_PER_HOUR } from "./fire";
import { pileAt } from "./inventory";
import { ITEM_KG } from "./items";
import { today } from "./ledger";
import { BASE_KCAL_PER_HOUR, feltTemperature } from "./player";
import { cellOf } from "./position";
import { campSite, regionState } from "./regionstate";
import { chopSticks } from "./skills";
import { DEADWOOD_KG } from "./tasks";
import type { GameState, StockGroupId, TaskId } from "./types";
import { waterLossPerHour } from "./water";
import { localWeather } from "./weather";

export interface StockCause {
  label: string;
  /**
   * Signed, per game hour, in the group's own RATE unit: kg for wood and
   * pack, litres for water, kcal for food. Food is the one group whose rate
   * and held figure are in different units on purpose - the held figure is
   * person-days (see kcalPerPersonDay), but the rate stays kcal/hour so a
   * cold snap or a hard day of work is visible here as itself, rather than
   * being pre-divided into a constant that has already thrown that away.
   */
  perHour: number;
  /** The reading behind it, where one makes the number legible. */
  note?: string;
}

/** The tasks that declare what they make. Wood only: the group whose rate is worth projecting. */
export const TASK_YIELD: Partial<Record<TaskId, (state: GameState, world: World) => { kg: number }>> = {
  chop: (state, world) => ({ kg: 4 * ITEM_KG.log + chopSticks(state, world) * ITEM_KG.stick }),
  split: () => ({ kg: ITEM_KG.log }),
  splitWedges: () => ({ kg: ITEM_KG.log }),
  deadwood: () => ({ kg: DEADWOOD_KG }),
  sticks: () => ({ kg: 6 * ITEM_KG.stick }),
};

/** Names only the five tasks TASK_YIELD declares; everything else has no wood-group label to show. */
const TASK_WORDS: Partial<Record<TaskId, string>> = {
  chop: "felling",
  split: "splitting",
  splitWedges: "splitting",
  deadwood: "gathering dead wood",
  sticks: "gathering sticks",
};

/**
 * Today's booked burn, per hour of it so far. The ledger is the one place
 * this number lives, so reading it here cannot disagree with what the year
 * run and the journal print. Shared by kcalPerPersonDay and the food cause
 * in stockCauses so the two can never quietly drift apart.
 */
function kcalPerHourToday(state: GameState): number {
  const led = today(state);
  const hoursToday = Math.max(1 / 60, (state.minute % 1440) / 60);
  const burnedToday = led.burn.base + led.burn.activity + led.burn.walk + led.burn.cold + led.burn.sick;
  return burnedToday / hoursToday;
}

/**
 * The survivor's own daily burn, floored at a sane day so a still-mostly-asleep
 * survivor does not make the larder read as a year. The floor is the body's own
 * base rate held over a full day, not an invented number.
 */
export function kcalPerPersonDay(state: GameState): number {
  return Math.max(BASE_KCAL_PER_HOUR * 24, kcalPerHourToday(state) * 24);
}

// cal is unused for now: every cause here reads its own moment straight off
// state and the region, and none of them yet needs the day-of-year shape.
export function stockCauses(state: GameState, world: World, _cal: Calendar): Record<StockGroupId, StockCause[]> {
  const st = regionState(state, world, state.player.region);
  const site = campSite(st);
  const wood: StockCause[] = [];

  // state.task, not state.intent: the intent is the order being served and
  // counts completions, while the task is the work in hand and carries the
  // minutes. Work a player starts by hand has a task and no intent at all,
  // and that is exactly the click this whole strip is for.
  const t = state.task;
  const yielder = t ? TASK_YIELD[t.id] : undefined;
  if (t && yielder) {
    wood.push({ label: TASK_WORDS[t.id] ?? t.id, perHour: (yielder(state, world).kg / Math.max(1, t.duration)) * 60 });
  }

  if (st.fire.lit) {
    const ambient = localWeather(state, world, st.campCell ?? cellOf(state, world)).temperatureC;
    const burn = burnPerHour(state.weather, ambient, st);
    wood.push({ label: "fire", perHour: -burn, note: `${burn.toFixed(1)} kg/h at ${Math.round(ambient)} C` });
  }

  const campPile = pileAt(state, st.campCell);
  const exposed = Math.max(0, woodOnHandKg(campPile) - coveredWoodKg(site));
  if (exposed > 0 && localWeather(state, world, st.campCell ?? cellOf(state, world)).precip !== "none") {
    wood.push({ label: "rain on the open stack", perHour: -RAIN_WET_KG_PER_HOUR, note: `${Math.round(exposed)} kg stands out` });
  }

  const kcalPerHour = kcalPerHourToday(state);
  const food: StockCause[] = [{ label: "the body", perHour: -kcalPerHour, note: `${Math.round(kcalPerHour * 24)} kcal a day` }];

  const felt = feltTemperature(state, world, localWeather(state, world, cellOf(state, world)).temperatureC);
  const water: StockCause[] = [{ label: "the body", perHour: -waterLossPerHour(state, felt) }];

  return { wood, food, water, pack: [] };
}
