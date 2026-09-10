import { describe, expect, it } from "vitest";
import {
  cellSurface,
  surfaceHeading,
  surfaceLocation,
  surfaceOf,
  terrainHeading,
} from "../src/sim/cellstatus";
import { weatherShotSimulation } from "../src/sim/weather-scenarios";
import type { Terrain } from "../src/sim/types";

describe("the semantic status of a cell", () => {
  it("makes water ice an exhaustive surface state instead of a second terrain", () => {
    expect(surfaceOf("water", "sea", { snowCm: 0, iceCm: 0 })).toEqual({
      kind: "water", terrain: "water", water: "sea", ice: "none",
    });
    expect(surfaceOf("water", "lake", { snowCm: 12, iceCm: 7 })).toEqual({
      kind: "water", terrain: "water", water: "lake", ice: "thin",
    });
    const safe = surfaceOf("water", "sea", { snowCm: 20, iceCm: 32 });
    expect(safe).toEqual({ kind: "water", terrain: "water", water: "sea", ice: "safe" });
    expect(surfaceHeading(safe)).toBe("safe ice over water");
    expect(surfaceLocation(safe)).toBe("on safe ice");
  });

  it("keeps land terrain while snow changes its described surface", () => {
    const bare = surfaceOf("meadow", "lake", { snowCm: 5, iceCm: 40 });
    const snow = surfaceOf("meadow", "lake", { snowCm: 6, iceCm: 0 });
    const deep = surfaceOf("rock", "sea", { snowCm: 31, iceCm: 0 });
    expect(bare).toEqual({ kind: "land", terrain: "meadow", snow: "none" });
    expect(surfaceHeading(bare)).toBe("meadow");
    expect(surfaceLocation(bare)).toBe("on open ground");
    expect(snow).toEqual({ kind: "land", terrain: "meadow", snow: "cover" });
    expect(surfaceHeading(snow)).toBe("snow-covered meadow");
    expect(surfaceLocation(snow)).toBe("on snow-covered open ground");
    expect(deep).toEqual({ kind: "land", terrain: "rock", snow: "deep" });
    expect(surfaceHeading(deep)).toBe("deep snow over bare rock");
    expect(surfaceLocation(deep)).toBe("in deep snow on the rocks");
  });

  it("owns one complete heading for every terrain", () => {
    const terrains: Terrain[] = ["water", "fell", "rock", "bog", "spruce", "pine", "birch", "meadow"];
    expect(terrains.map(terrainHeading)).toEqual([
      "water", "open fell", "bare rock", "bog", "spruce forest", "pine forest", "birch wood", "meadow",
    ]);
  });

  it("derives a real cell from authoritative terrain and persistent ground", () => {
    const shot = weatherShotSimulation("frozen-water");
    const surface = cellSurface(shot.state, shot.world, shot.cell);
    expect(surface).toEqual({ kind: "water", terrain: "water", water: "sea", ice: "safe" });
    expect(surfaceHeading(surface)).toBe("safe ice over water");
  });
});
