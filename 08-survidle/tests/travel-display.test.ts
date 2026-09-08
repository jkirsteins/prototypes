import { describe, expect, it } from "vitest";
import { DEFAULT_TRAVEL_DISPLAY, formatTravel, loadTravelDisplay, saveTravelDisplay } from "../src/ui/travel";

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

describe("travel display", () => {
  it("formats one route in all three modes", () => {
    expect(formatTravel(3.34, 66, "distance")).toBe("3.3 km");
    expect(formatTravel(3.34, 66, "time")).toBe("1 h 6 min");
    expect(formatTravel(3.34, 66, "both")).toBe("3.3 km, 1 h 6 min");
  });

  it("defaults safely and persists browser-wide", () => {
    const storage = memory();
    expect(DEFAULT_TRAVEL_DISPLAY).toBe("distance");
    expect(loadTravelDisplay(storage)).toBe("distance");
    saveTravelDisplay("time", storage);
    expect(loadTravelDisplay(storage)).toBe("time");
    storage.setItem("survidle.display", JSON.stringify({ travel: "nonsense" }));
    expect(loadTravelDisplay(storage)).toBe("distance");
    storage.setItem("survidle.display", "{bad json");
    expect(loadTravelDisplay(storage)).toBe("distance");
  });
});
