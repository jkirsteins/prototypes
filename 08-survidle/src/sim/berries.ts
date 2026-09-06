/**
 * The gut's ceiling on berries (tables audit spec, section 3): full credit
 * to BERRY.fullCreditKg a day, half credit and the water cost of a turning
 * stomach to BERRY.refuseKg, and none past that. The counter lives on the
 * player and resets with the day number.
 */
import { dayNumber } from "./calendar";
import { BERRY } from "./tables";
import type { Player } from "./types";

/** Today's kilos, zero once the day has turned. */
export function berriesEatenToday(p: Player, minute: number): number {
  return p.berriesToday.day === dayNumber(minute) ? p.berriesToday.kg : 0;
}

/** True once today's berries have reached the kilos the body will not eat past. */
export function berriesRefused(p: Player, minute: number): boolean {
  return berriesEatenToday(p, minute) >= BERRY.refuseKg - 1e-9;
}

/** True past the full-credit kilos today: the water cost of a gut that is turning. */
export function berriesOverloaded(p: Player, minute: number): boolean {
  return berriesEatenToday(p, minute) > BERRY.fullCreditKg + 1e-9;
}
