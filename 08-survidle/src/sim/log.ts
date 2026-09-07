import type { GameState, LogEntry } from "./types";

export const LOG_CAP = 300;

export function log(state: GameState, text: string, kind?: LogEntry["kind"]): void {
  state.log.push({ minute: state.minute, text, kind });
  if (state.log.length > LOG_CAP) state.log.splice(0, state.log.length - LOG_CAP);
}

const warned = new WeakMap<GameState, Set<string>>();
/**
 * Says a line the first minute a threshold is crossed, and not again until the
 * body comes back over it. Most of these are bad news; "plain" is for a
 * crossing that is only news, and reads in the log's ordinary voice.
 *
 * The one latch: a second copy of this per feature is how a warning ends up
 * repeating every minute in one place and never clearing in another.
 */
export function warn(state: GameState, key: string, active: boolean, text: string, kind: LogEntry["kind"] | "plain" = "bad"): void {
  let set = warned.get(state);
  if (!set) {
    set = new Set();
    warned.set(state, set);
  }
  if (active && !set.has(key)) {
    set.add(key);
    log(state, text, kind === "plain" ? undefined : kind);
  } else if (!active && set.has(key)) {
    set.delete(key);
  }
}
