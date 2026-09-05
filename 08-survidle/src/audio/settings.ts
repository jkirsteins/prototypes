/** The listener's choices: kept in the browser, not the save, because they are about this machine's speakers. */
export interface AudioSettings { volume: number; muted: boolean; ambience: boolean }

export const SETTINGS_KEY = "survidle.audio";
export const DEFAULT_SETTINGS: AudioSettings = { volume: 0.7, muted: false, ambience: true };

export function loadSettings(storage: Storage = localStorage): AudioSettings {
  try {
    const raw = storage.getItem(SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const p = JSON.parse(raw) as Partial<AudioSettings>;
    if (typeof p.volume !== "number" || typeof p.muted !== "boolean" || typeof p.ambience !== "boolean") return { ...DEFAULT_SETTINGS };
    return { volume: Math.min(1, Math.max(0, p.volume)), muted: p.muted, ambience: p.ambience };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(s: AudioSettings, storage: Storage = localStorage): void {
  try {
    storage.setItem(SETTINGS_KEY, JSON.stringify({ ...s, volume: Math.min(1, Math.max(0, s.volume)) }));
  } catch {
    // A browser that refuses storage still plays; it just forgets.
  }
}
