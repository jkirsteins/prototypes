import { describe, expect, it } from "vitest";
import { BOG_WET, MEADOW_DAMP, MEADOW_DRY, groundGlyph, toneCuts, toneOf, VARIANTS } from "../src/ui/ground";
import { legendHtml } from "../src/ui/map";
import type { Terrain } from "../src/sim/types";
import { fieldsAt, terrainAt } from "../src/world/terrain";

/** Moisture of every bog or meadow cell in a sample of several worlds. */
function bandMoisture(): Record<string, number[]> {
  const out: Record<string, number[]> = { bog: [], meadow: [] };
  for (const seed of [1000010, 3, 17, 19, 77]) {
    let s = seed;
    const rnd = () => {
      s = (s * 1103515245 + 12345) & 0x7fffffff;
      return s / 0x7fffffff;
    };
    for (let i = 0; i < 20000; i++) {
      const x = Math.floor(rnd() * 1800);
      const y = Math.floor(rnd() * 1300);
      const t = terrainAt(seed, x, y);
      if (t === "bog" || t === "meadow") out[t].push(fieldsAt(seed, x, y).m);
    }
  }
  return out;
}

describe("the ground's forms", () => {
  it("splits each band evenly enough that no form is a rarity", () => {
    const m = bandMoisture();
    const wet = m.bog.filter((v) => v >= BOG_WET).length / m.bog.length;
    expect(wet).toBeGreaterThan(0.35);
    expect(wet).toBeLessThan(0.65);
    const dry = m.meadow.filter((v) => v < MEADOW_DRY).length / m.meadow.length;
    const damp = m.meadow.filter((v) => v >= MEADOW_DAMP).length / m.meadow.length;
    for (const share of [dry, damp, 1 - dry - damp]) {
      expect(share).toBeGreaterThan(0.2);
      expect(share).toBeLessThan(0.47);
    }
  });

  it("gives a lake and the sea different water", () => {
    // Both kinds exist in a world; whichever a cell is, the two never share a glyph.
    const seen = new Set<string>();
    for (let i = 0; i < 40000 && seen.size < 2; i++) {
      const x = (i * 37) % 1800;
      const y = (i * 53) % 1300;
      if (terrainAt(1000010, x, y) !== "water") continue;
      seen.add(groundGlyph(1000010, x, y, "water", "~"));
    }
    expect([...seen].sort()).toEqual(["-", "~"]);
  });

  it("leaves terrain without forms alone", () => {
    for (const t of ["spruce", "pine", "birch", "rock", "fell"] as Terrain[]) {
      expect(groundGlyph(1000010, 900, 650, t, "A")).toBe("A");
    }
  });

  it("names every form it can draw in the legend", () => {
    const key = legendHtml();
    for (const v of Object.values(VARIANTS)) {
      for (const form of v.forms) {
        expect(key).toContain(`<b>${form === '"' ? "&quot;" : form}</b>`);
      }
    }
  });
});

describe("height as tone", () => {
  it("cuts the view into three parts of its own spread, not the world's", () => {
    // A screen of highland forest: a fixed world-wide band would call it all high.
    const highland = Array.from({ length: 300 }, (_, i) => 0.62 + (i / 300) * 0.14);
    const cuts = toneCuts(highland);
    const tones = highland.map((e) => toneOf(e, cuts));
    for (const k of [0, 1, 2]) {
      expect(tones.filter((t) => t === k).length).toBeGreaterThan(highland.length * 0.25);
    }
  });

  it("shades nothing where the ground is one height", () => {
    expect(toneCuts([0.5, 0.5, 0.5])).toBeNull();
    expect(toneOf(0.5, null)).toBe(1);
    expect(toneCuts([])).toBeNull();
  });
});
