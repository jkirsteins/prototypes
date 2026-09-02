import type { GameState, LogEntry } from "./types";

export const LOG_CAP = 300;

export function log(state: GameState, text: string, kind?: LogEntry["kind"]): void {
  state.log.push({ minute: state.minute, text, kind });
  if (state.log.length > LOG_CAP) state.log.splice(0, state.log.length - LOG_CAP);
}
