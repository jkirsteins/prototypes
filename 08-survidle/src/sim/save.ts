import { GAME_MINUTES_PER_REAL_SECOND } from "../units";
import type { World } from "../world/gen";
import { advance } from "./advance";
import type { GameState, LogEntry } from "./types";

export const SAVE_KEY = "survidle.save";
/** Away longer than this is simulated as this. */
export const MAX_OFFLINE_SECONDS = 24 * 3600;

export interface SaveFile { version: 1; savedAt: number; state: GameState }

export function serialize(state: GameState, now = Date.now()): string {
  const file: SaveFile = { version: 1, savedAt: now, state };
  return JSON.stringify(file);
}

export function deserialize(text: string): SaveFile | null {
  try {
    const file = JSON.parse(text) as SaveFile;
    if (file?.version !== 1 || !file.state || typeof file.savedAt !== "number") return null;
    // Saves from before tasks could be set aside.
    file.state.paused ??= {};
    return file;
  } catch {
    return null;
  }
}

export function saveGame(state: GameState, storage: Storage = localStorage, now = Date.now()): void {
  if (state.dead) {
    storage.removeItem(SAVE_KEY);
    return;
  }
  storage.setItem(SAVE_KEY, serialize(state, now));
}

export function loadGame(storage: Storage = localStorage): SaveFile | null {
  const text = storage.getItem(SAVE_KEY);
  return text ? deserialize(text) : null;
}

export function clearSave(storage: Storage = localStorage): void {
  storage.removeItem(SAVE_KEY);
}

/**
 * Simulates the time the tab was closed and returns what happened meanwhile.
 * Runs one-minute steps, the same steps the foreground loop takes.
 */
export function catchUp(state: GameState, world: World, realSecondsElapsed: number, speed = 1): LogEntry[] {
  const seconds = Math.min(MAX_OFFLINE_SECONDS, Math.max(0, realSecondsElapsed));
  const minutes = seconds * GAME_MINUTES_PER_REAL_SECOND * speed;
  const before = state.log.length;
  const firstMinute = state.minute;
  advance(state, world, minutes);
  return state.log.slice(before).filter((e) => e.minute > firstMinute);
}
