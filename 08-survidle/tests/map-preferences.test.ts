import { describe, expect, it } from "vitest";
import { DEFAULT_CLOUD_SHADOWS, loadCloudShadows, saveCloudShadows } from "../src/ui/map-preferences";

function memory(): Storage {
  const values = new Map<string, string>();
  return {
    get length() { return values.size; },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => { values.delete(key); },
    setItem: (key, value) => { values.set(key, String(value)); },
  };
}

describe("map preferences", () => {
  it("defaults cloud shadows on and persists either choice", () => {
    const storage = memory();
    expect(DEFAULT_CLOUD_SHADOWS).toBe(true);
    expect(loadCloudShadows(storage)).toBe(true);
    saveCloudShadows(false, storage);
    expect(loadCloudShadows(storage)).toBe(false);
    saveCloudShadows(true, storage);
    expect(loadCloudShadows(storage)).toBe(true);
  });

  it("falls back to cloud shadows when stored data is invalid", () => {
    const storage = memory();
    storage.setItem("survidle.map.cloud-shadows", "maybe");
    expect(loadCloudShadows(storage)).toBe(true);
    storage.setItem("survidle.map.cloud-shadows", "{bad json");
    expect(loadCloudShadows(storage)).toBe(true);
  });
});
