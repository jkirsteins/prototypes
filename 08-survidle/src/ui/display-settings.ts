/**
 * The one object every display preference lives in. Each preference used to
 * write the whole key, so saving one wiped its neighbours; reading and
 * merging here is what stops that happening again as more are added.
 */
export const DISPLAY_SETTINGS_KEY = "survidle.display";

export type DisplaySettings = Record<string, unknown>;

export function readDisplay(storage: Storage = localStorage): DisplaySettings {
  try {
    const value = JSON.parse(storage.getItem(DISPLAY_SETTINGS_KEY) ?? "{}") as unknown;
    return typeof value === "object" && value !== null ? (value as DisplaySettings) : {};
  } catch {
    return {};
  }
}

export function writeDisplay(patch: DisplaySettings, storage: Storage = localStorage): void {
  try {
    storage.setItem(DISPLAY_SETTINGS_KEY, JSON.stringify({ ...readDisplay(storage), ...patch }));
  } catch {
    // The choice still lasts for this page when storage is unavailable.
  }
}
