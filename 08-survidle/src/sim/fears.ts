/**
 * A quirk's fear as a predicate the routing and the rows can ask without
 * pulling the whole person module in: this file imports only the weather,
 * so position.ts and route callers can read it without a cycle.
 */
import type { GameState, QuirkId } from "./types";
import { stormNow } from "./weather";

export function hasQuirk(state: GameState, q: QuirkId): boolean {
  const rec = state.survivors[state.survivors.length - 1];
  return rec?.person?.quirks.includes(q) ?? false;
}

/** Coast-born, and the sky is not clear: no route crosses the fell and no work is done on it. */
export function fearsFell(state: GameState): boolean {
  return hasQuirk(state, "coastBorn") && !state.weather.clear;
}

/** Forest-born, and a storm is on: the open shore is not worked. */
export function shunsShore(state: GameState): boolean {
  return hasQuirk(state, "forestBorn") && stormNow(state.weather, state.minute);
}

export const FELL_FEAR_LINE = "will not go up on the fell in this cloud";
export const SHORE_FEAR_LINE = "will not work the open shore in this storm";
