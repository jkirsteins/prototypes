import { describe, expect, it } from "vitest";
import {
  coastKmAt, coastLineU, inBothnia, latitudeAt, runoffLsKm2, templateHeightM, treelineM,
  LAT_BOTTOM, LAT_TOP, TERRAINS, TERRAIN_INDEX, WORLD_CELL_H, WORLD_CELL_W, WORLD_H, WORLD_W,
} from "../src/world/terrain";

describe("world shape", () => {
  it("is 540 by 667 km, as 300 m cells and as the 50 m patches the game addresses", () => {
    expect(WORLD_CELL_W).toBe(1800);
    expect(WORLD_CELL_H).toBe(2224);
    expect(WORLD_W).toBe(WORLD_CELL_W * 6);
    expect(WORLD_H).toBe(WORLD_CELL_H * 6);
  });

  it("puts 67 N on the top row and 61 N on the bottom, 111 km a degree", () => {
    expect(latitudeAt(0)).toBe(LAT_TOP);
    expect(latitudeAt(WORLD_CELL_H)).toBe(LAT_BOTTOM);
    expect(latitudeAt(WORLD_CELL_H / 2)).toBeCloseTo(64, 6);
    // One degree is 370.7 rows of 300 m.
    expect(latitudeAt(0) - latitudeAt(370.67)).toBeCloseTo(1, 2);
  });

  it("drops the treeline northward and toward the coast", () => {
    expect(treelineM(61, 200)).toBe(1100);
    expect(treelineM(67, 200)).toBe(650);
    expect(treelineM(61, 0)).toBe(750);
    expect(treelineM(61, 25)).toBeCloseTo(925, 6);
    expect(treelineM(61, 50)).toBe(1100);
  });

  it("runs the coast from 40 km at the bottom to 280 km at the top", () => {
    // v = 1 is the bottom row. The coast line is u where coastKm is 0.
    expect(coastLineU(1)).toBeCloseTo(40 / 540, 6);
    expect(coastLineU(0)).toBeCloseTo(280 / 540, 6);
    expect(coastKmAt(coastLineU(1), 1)).toBeCloseTo(0, 6);
    expect(coastKmAt(coastLineU(0), 0)).toBeCloseTo(0, 6);
    expect(coastKmAt(0, 1)).toBeLessThan(0);
    expect(coastKmAt(1, 0.5)).toBeGreaterThan(200);
    // Distance is perpendicular to the coast, a little under the east-west gap.
    expect(coastKmAt(140 / 540, 1)).toBeCloseTo(100 * 0.9409, 2);
  });

  it("lets the Gulf of Bothnia into the east edge only between 63 and 65.5 N", () => {
    const v = (lat: number) => (LAT_TOP - lat) / (LAT_TOP - LAT_BOTTOM);
    expect(inBothnia(0.995, v(64.25))).toBe(true);
    expect(inBothnia(0.995, v(62))).toBe(false);
    expect(inBothnia(0.995, v(66.5))).toBe(false);
    expect(inBothnia(0.8, v(64.25))).toBe(false);
  });

  it("templates a sea shelf, a crest near 1800 m in the south and 1500 m in the north, and an eastern slope", () => {
    const v61 = 1, v67 = 0;
    expect(templateHeightM(42, 0.01, 0.5)).toBeLessThan(-100);
    // Crest is 110 km inland of the coast: u = (40 + 110 / 0.9409) / 540 at the bottom row.
    const crestSouth = templateHeightM(42, (40 + 110 / 0.9409) / 540, v61);
    const crestNorth = templateHeightM(42, (280 + 110 / 0.9409) / 540, v67);
    expect(crestSouth).toBeGreaterThan(1400);
    expect(crestSouth).toBeLessThan(2200);
    expect(crestNorth).toBeLessThan(crestSouth);
    expect(templateHeightM(42, 0.98, 0.1)).toBeLessThan(500);
    expect(templateHeightM(42, 0.98, 0.1)).toBeGreaterThan(-50);
    expect(templateHeightM(42, 0.995, 0.46)).toBeLessThan(0); // Bothnia
  });

  it("gives Atlantic runoff near 50 and inland runoff near 12 litres a second per km2", () => {
    expect(runoffLsKm2(0)).toBe(50);
    expect(runoffLsKm2(80)).toBe(31);
    expect(runoffLsKm2(400)).toBeCloseTo(18.33, 2);
    expect(runoffLsKm2(-10)).toBe(50);
  });

  it("lists river as a terrain", () => {
    expect(TERRAINS[8]).toBe("river");
    expect(TERRAIN_INDEX.river).toBe(8);
    expect(TERRAINS.length).toBe(9);
  });
});
