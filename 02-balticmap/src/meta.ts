import type { Strategy } from "./cards";
import { DEFAULT_REGION, REGIONS, type RegionId } from "./regions";

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

/** The map the player last chose, seeding the Regions page and the boot. A
 *  preference in the build-pref mould, not progression. */
export const REGION_PREF_KEY = "balticmap-region-pref-v1";

export function loadRegionPref(storage: MetaStorage): RegionId {
  try {
    const raw = storage.getItem(REGION_PREF_KEY);
    return raw !== null && raw in REGIONS ? (raw as RegionId) : DEFAULT_REGION;
  } catch {
    return DEFAULT_REGION;
  }
}

export function saveRegionPref(storage: MetaStorage, id: RegionId): void {
  try {
    storage.setItem(REGION_PREF_KEY, id);
  } catch {
    // storage unavailable or full: the pick still holds for the session.
  }
}
