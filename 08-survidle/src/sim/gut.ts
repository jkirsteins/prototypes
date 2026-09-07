/**
 * What the body will take in a day: a ceiling per capped food (GUT) and the
 * lean ceiling on the lean share of everything (LEAN_KCAL_PER_DAY). One
 * counter on the player, reset with the day number.
 */
import { dayNumber } from "./calendar";
import { type FoodId, GUT, LEAN_KCAL_PER_DAY } from "./items";
import type { Player } from "./types";

function today(p: Player, minute: number): Player["gut"] {
  const day = dayNumber(minute);
  if (p.gut.day !== day) p.gut = { day, kg: {}, leanKcal: 0 };
  return p.gut;
}

export function gutEatenToday(p: Player, minute: number, food: FoodId): number {
  return p.gut.day === dayNumber(minute) ? (p.gut.kg[food] ?? 0) : 0;
}

export function gutRefused(p: Player, minute: number, food: FoodId): boolean {
  const cap = GUT[food];
  return cap !== undefined && gutEatenToday(p, minute, food) >= cap.refuseKg - 1e-9;
}

/** True once any capped food is past its full-credit line today: the water cost of a gut that is turning. */
export function gutOverloaded(p: Player, minute: number): boolean {
  return (Object.keys(GUT) as FoodId[]).some((f) => gutEatenToday(p, minute, f) > GUT[f]!.fullCreditKg + 1e-9);
}

/** Books kilos of a capped food: the kilos the gut takes (to refusal) and the credit share over them (1 to the line, 0.5 past it). An uncapped food takes everything at 1. */
export function creditGut(p: Player, minute: number, food: FoodId, kg: number): { kg: number; credit: number } {
  const cap = GUT[food];
  if (!cap) return { kg, credit: 1 };
  const g = today(p, minute);
  const before = g.kg[food] ?? 0;
  const take = Math.max(0, Math.min(kg, cap.refuseKg - before));
  const full = Math.max(0, Math.min(take, cap.fullCreditKg - before));
  g.kg[food] = before + take;
  const credit = take > 0 ? (full + (take - full) / 2) / take : 0;
  return { kg: take, credit };
}

export function leanEatenToday(p: Player, minute: number): number {
  return p.gut.day === dayNumber(minute) ? p.gut.leanKcal : 0;
}

export function leanRefused(p: Player, minute: number): boolean {
  return leanEatenToday(p, minute) >= LEAN_KCAL_PER_DAY - 1e-9;
}

/** Books a portion's kcal against the lean ceiling by its share and returns what the body takes: the lean part only up to the room left, the rest whole. */
export function creditLean(p: Player, minute: number, kcal: number, share: number): number {
  const g = today(p, minute);
  const lean = kcal * share;
  const room = Math.max(0, LEAN_KCAL_PER_DAY - g.leanKcal);
  const taken = Math.min(lean, room);
  g.leanKcal += taken;
  return kcal - lean + taken;
}
