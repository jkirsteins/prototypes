import type { Strategy } from "./cards";

/** The storage abstraction the preferences ride on - rules prefs, log prefs,
 *  the net display name and the build pref below all use it. The meta
 *  PROGRESSION that used to live here (XP, levels, packs, the known-cards
 *  collection) retired with the defense-score design (2026-08-08): card
 *  acquisition moved in-run, through the turnip harvest. */
export interface MetaStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** In-memory stand-in when localStorage is unavailable (private mode, tests,
 *  a booted page). */
export function memoryStorage(): MetaStorage {
  const map = new Map<string, string>();
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => {
      map.set(key, value);
    },
    removeItem: (key) => {
      map.delete(key);
    },
  };
}

/** The build confirmed at the last "Choose your lands", so replaying the
 *  same build is zero clicks. A preference in the rules-prefs mould, not
 *  progression. */
export const BUILD_PREF_KEY = "balticmap-build-pref-v1";

export function loadBuildPref(storage: MetaStorage): Strategy {
  try {
    const raw = storage.getItem(BUILD_PREF_KEY);
    return raw === "pestilence" ? "pestilence" : "warpath";
  } catch {
    return "warpath";
  }
}

export function saveBuildPref(storage: MetaStorage, build: Strategy): void {
  try {
    storage.setItem(BUILD_PREF_KEY, build);
  } catch {
    // storage unavailable or full: the pick still holds for the session.
  }
}
