import type { World } from "../world/gen";
import { dayNumber } from "./calendar";
import { listItems, pileAt, qty } from "./inventory";
import { FOODS, type FoodId } from "./items";
import { weekBefore } from "./ledger";
import { fatLandmarks } from "./person";
import { current } from "./record";
import { regionState } from "./regionstate";
import type { GameState, Inventory } from "./types";

export const RUNWAY_DEFAULT_DAILY_KCAL = 3000;

function foodKcal(inv: Inventory): number {
  let kcal = qty(inv, "rawFat") * FOODS.fat.kcalPerKg;
  for (const row of listItems(inv)) {
    const food = FOODS[row.item as FoodId];
    if (food) kcal += row.qty * food.kcalPerKg;
  }
  return kcal;
}

function storedFatKcal(inv: Inventory): number {
  return (qty(inv, "fat") + qty(inv, "rawFat")) * FOODS.fat.kcalPerKg;
}

export function estimatedDailyBurn(state: GameState): number {
  const week = weekBefore(state.ledger, dayNumber(state.minute));
  if (!week.days) return RUNWAY_DEFAULT_DAILY_KCAL;
  const burn = week.burn;
  return Math.max(1, burn.base + burn.activity + burn.walk + burn.cold + burn.sick);
}

/** Food in reach of camp, and essential fat in the body or larder, in days at the survivor's recent burn. */
export function survivalRunway(state: GameState, world: World): { foodDays: number; fatDays: number } {
  const camp = pileAt(state, regionState(state, world, state.player.region).campCell);
  const burn = estimatedDailyBurn(state);
  const fatReserve = Math.max(0, state.player.fat - fatLandmarks(current(state).person).floor);
  return {
    foodDays: (foodKcal(state.player.pack) + foodKcal(camp)) / burn,
    fatDays: (fatReserve + storedFatKcal(state.player.pack) + storedFatKcal(camp)) / burn,
  };
}
