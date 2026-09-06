/**
 * The lean ceiling (tables audit spec, section 3): meat and fish past
 * LEAN_KCAL_PER_DAY in a day feed nothing, the shape the berry gut rule
 * already has. The counter lives on the player and resets with the day.
 */
import { dayNumber } from "./calendar";
import { LEAN_KCAL_PER_DAY } from "./items";
import type { Player } from "./types";

/** Today's lean kcal, zero once the day has turned. */
export function leanEatenToday(p: Player, minute: number): number {
  return p.leanToday.day === dayNumber(minute) ? p.leanToday.kcal : 0;
}

/** True once today's lean food has reached the kcal the body will not take past. */
export function leanRefused(p: Player, minute: number): boolean {
  return leanEatenToday(p, minute) >= LEAN_KCAL_PER_DAY - 1e-9;
}

/** Books lean kcal against today's ceiling and returns what the body takes of it. */
export function creditLean(p: Player, minute: number, kcal: number): number {
  const day = dayNumber(minute);
  if (p.leanToday.day !== day) p.leanToday = { day, kcal: 0 };
  const room = Math.max(0, LEAN_KCAL_PER_DAY - p.leanToday.kcal);
  const taken = Math.min(kcal, room);
  p.leanToday.kcal += taken;
  return taken;
}
