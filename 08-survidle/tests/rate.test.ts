import { describe, expect, it } from "vitest";
import { DEFAULT_RATE_DISPLAY, formatRate, loadRateDisplay, saveRateDisplay } from "../src/ui/rate";
import { loadTravelDisplay, saveTravelDisplay } from "../src/ui/travel";

function memoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
    clear: () => map.clear(),
    key: () => null,
    get length() { return map.size; },
  } as unknown as Storage;
}

describe("the rate component", () => {
  it("says the same number in game time and prints the real reading beside it", () => {
    // 20 kg a game hour is 20 kg per real minute: the same digits, so the game reading stands alone.
    expect(formatRate(20, "kg", "game")).toBe("20 kg/h");
  });

  it("says the per-second reading in real time, which is the per-game-minute one", () => {
    expect(formatRate(20, "kg", "real")).toBe("0.33 kg/s (20 kg/h in the north)");
  });

  it("signs a fall and a rise, and says nothing is moving as nothing", () => {
    expect(formatRate(-3, "kg", "game")).toBe("-3 kg/h");
    expect(formatRate(0, "kg", "game")).toBe("steady");
  });

  it("remembers the choice and does not wipe the travel setting beside it", () => {
    const storage = memoryStorage();
    expect(loadRateDisplay(storage)).toBe(DEFAULT_RATE_DISPLAY);
    saveTravelDisplay("both", storage);
    saveRateDisplay("real", storage);
    expect(loadRateDisplay(storage)).toBe("real");
    expect(loadTravelDisplay(storage)).toBe("both");
  });
});
