import { describe, it, expect } from "vitest";
import { contrastRatio, inkFor } from "../src/map-render";
import { REGIONS } from "../src/regions";

/** What a land nobody plays is painted, which is what an arrow crossing the
 *  map stands on. Mirrors `UNOWNED_FILL` in src/main.ts. */
const LAND = "#c3bfb6";

describe("contrastRatio", () => {
  it("is 21 for black on white and 1 for a colour on itself", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 2);
    expect(contrastRatio("#c3bfb6", "#c3bfb6")).toBeCloseTo(1, 6);
  });

  it("does not care which way round the two are given", () => {
    expect(contrastRatio("#a8c8cf", LAND)).toBeCloseTo(contrastRatio(LAND, "#a8c8cf"), 9);
  });

  it("reads a pale faction colour against the land as almost nothing", () => {
    // The reported case: an arrow the player cannot see.
    expect(contrastRatio("#a8c8cf", LAND)).toBeLessThan(1.1);
  });
});

describe("inkFor", () => {
  it("darkens a pale colour until it reads against the land", () => {
    expect(contrastRatio(inkFor("#a8c8cf", LAND, 3), LAND)).toBeGreaterThanOrEqual(3);
  });

  it("leaves a colour that already reads nearly alone", () => {
    const ink = inkFor("#5f7aa3", LAND, 3);
    expect(contrastRatio(ink, LAND)).toBeGreaterThanOrEqual(3);
    // A dark colour barely moves: it was already most of the way there.
    expect(contrastRatio(ink, "#5f7aa3")).toBeLessThan(1.6);
  });

  it("keeps the hue family", () => {
    // A green stays greener than it is red or blue.
    const ink = inkFor("#8fb06d", LAND, 3);
    const g = parseInt(ink.slice(3, 5), 16);
    expect(g).toBeGreaterThan(parseInt(ink.slice(1, 3), 16));
    expect(g).toBeGreaterThan(parseInt(ink.slice(5, 7), 16));
  });

  it("is stable: asking twice gives the same ink", () => {
    expect(inkFor("#e2eecd", LAND, 3)).toBe(inkFor("#e2eecd", LAND, 3));
  });

  it("reaches the target for every faction colour on every map", () => {
    for (const region of Object.values(REGIONS)) {
      for (const f of region.map.factions) {
        const ink = inkFor(f.color, LAND, 3);
        expect(
          contrastRatio(ink, LAND),
          `${region.id}/${f.id} ${f.color} -> ${ink}`,
        ).toBeGreaterThanOrEqual(3);
      }
    }
  });
});
