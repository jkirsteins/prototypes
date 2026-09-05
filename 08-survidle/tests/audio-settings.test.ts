import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, loadSettings, saveSettings } from "../src/audio/settings";

function memory(): Storage {
  const m = new Map<string, string>();
  return {
    get length() { return m.size; },
    clear: () => m.clear(),
    getItem: (k) => m.get(k) ?? null,
    key: (i) => [...m.keys()][i] ?? null,
    removeItem: (k) => { m.delete(k); },
    setItem: (k, v) => { m.set(k, String(v)); },
  };
}

describe("audio settings", () => {
  it("default to on, at 0.7, with ambience", () => {
    expect(loadSettings(memory())).toEqual({ volume: 0.7, muted: false, ambience: true });
    expect(DEFAULT_SETTINGS.volume).toBe(0.7);
  });

  it("round-trip, clamp the volume, and survive junk", () => {
    const s = memory();
    saveSettings({ volume: 1.7, muted: true, ambience: false }, s);
    expect(loadSettings(s)).toEqual({ volume: 1, muted: true, ambience: false });
    s.setItem("survidle.audio", "{not json");
    expect(loadSettings(s)).toEqual(DEFAULT_SETTINGS);
    s.setItem("survidle.audio", JSON.stringify({ volume: "loud" }));
    expect(loadSettings(s)).toEqual(DEFAULT_SETTINGS);
  });
});
