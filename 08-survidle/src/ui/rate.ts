import { readDisplay, writeDisplay } from "./display-settings";

/**
 * Which clock a rate is read on. The scale is exact in both directions -
 * a game hour is a real minute, a game minute a real second - so the
 * setting changes the words and the decimal point and never the model.
 */
export type RateDisplay = "game" | "real";
export const DEFAULT_RATE_DISPLAY: RateDisplay = "game";

/** Two decimals under ten, none above: a rate is an estimate and reads worse with false precision. */
function num(n: number): string {
  const rounded = Math.abs(n) >= 10 ? Math.round(n) : Number(n.toFixed(2));
  return String(rounded);
}

export function formatRate(perGameHour: number, unit: string, display: RateDisplay): string {
  if (Math.abs(perGameHour) < 0.005) return "steady";
  const perGameMinute = perGameHour / 60;
  const game = `${num(perGameHour)} ${unit}/h`;
  const real = `${num(perGameMinute)} ${unit}/s`;
  // A game hour is a real minute, so "per real min" repeats the same digits
  // in other words; the game reading stands alone.
  return display === "real" ? real : game;
}

export function loadRateDisplay(storage: Storage = localStorage): RateDisplay {
  const value = readDisplay(storage).rates;
  return value === "game" || value === "real" ? value : DEFAULT_RATE_DISPLAY;
}

export function saveRateDisplay(display: RateDisplay, storage: Storage = localStorage): void {
  writeDisplay({ rates: display }, storage);
}
