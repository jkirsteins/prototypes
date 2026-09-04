/**
 * The life record: what a survivor did, kept per survivor in the world save
 * and uncapped, unlike the log. The journal, the epitaph and the away
 * report read it; nothing reads the log for history.
 */
import { calendar } from "./calendar";
import type { GameState, LifeRecord, WorldDate } from "./types";

export function newRecord(index: number, name: LifeRecord["name"], landed: WorldDate, gapDays: number): LifeRecord {
  return { name, index, landed, gapDays, events: [], worst: null, forecast: [], died: null };
}

/** The living survivor's record: the last in the list. */
export function current(state: GameState): LifeRecord {
  return state.survivors[state.survivors.length - 1];
}

/** The world date of a minute of this life: the landing year plus however many year ends the day index crossed. */
export function worldDate(state: GameState, minute = state.minute): WorldDate {
  const cal = calendar(minute, state.startDoy);
  return { year: state.year + Math.floor((state.startDoy + cal.dayIndex) / 365), doy: cal.dayOfYear };
}
