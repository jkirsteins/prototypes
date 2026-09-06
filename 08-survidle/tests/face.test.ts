import { describe, expect, it } from "vitest";
import { medianPerson } from "../src/sim/person";
import type { Grade, Person } from "../src/sim/types";
import { BEARDS, facePicks, facePixels, faceSvg, HAIR_MEN, HAIR_WOMEN } from "../src/ui/face";

function person(sex: "f" | "m", face: number, eyes: Grade = 0, build: Grade = 0): Person {
  const p = medianPerson(sex);
  return { ...p, axes: { ...p.axes, eyes, build }, face };
}

describe("the face", () => {
  it("is eight rows of eight cells, each row its own mirror, at both sizes", () => {
    for (let seed = 0; seed < 200; seed++) {
      for (const sex of ["f", "m"] as const) {
        for (const eyes of [-2, 0, 2] as Grade[]) {
          for (const build of [0, 2] as Grade[]) {
            const p = person(sex, seed, eyes, build);
            const rows = facePixels(p, 8);
            expect(rows).toHaveLength(8);
            for (const row of rows) {
              expect(row).toHaveLength(8);
              expect([...row].reverse()).toEqual(row);
            }
            const big = facePixels(p, 12);
            expect(big).toHaveLength(12);
            for (const row of big) expect(row).toHaveLength(12);
          }
        }
      }
    }
  });

  it("reaches every hair and beard template, and never draws a beard on a woman", () => {
    const hairs = new Set<string>();
    const beards = new Set<string>();
    for (let seed = 0; seed < 300; seed++) {
      const w = facePicks(person("f", seed));
      const m = facePicks(person("m", seed));
      hairs.add(`f:${w.hair}`);
      hairs.add(`m:${m.hair}`);
      beards.add(m.beard);
      expect(w.beard).toBe("none");
      expect(facePixels(person("f", seed), 8).flat()).not.toContain("B");
      expect(HAIR_WOMEN).toContain(w.hair);
      expect(HAIR_MEN).toContain(m.hair);
    }
    for (const h of HAIR_WOMEN) expect(hairs.has(`f:${h}`)).toBe(true);
    for (const h of HAIR_MEN) expect(hairs.has(`m:${h}`)).toBe(true);
    for (const b of BEARDS) expect(beards.has(b)).toBe(true);
  });

  it("follows the grades: wide bright eyes at +1, a slit at -1, a wide jaw at build +1", () => {
    expect(facePicks(person("m", 1, 1, 0)).eyes).toBe("wide");
    expect(facePicks(person("m", 1, -1, 0)).eyes).toBe("narrow");
    expect(facePicks(person("m", 1, 0, 0)).eyes).toBe("plain");
    expect(facePicks(person("m", 1, 0, 1)).jaw).toBe("wide");
    expect(facePixels(person("m", 1, 2, 0), 8)[3]).toContain("W");
    expect(facePixels(person("m", 1, 0, 2), 8)[4][0]).toBe("S");
    expect(facePixels(person("m", 1, 0, 0), 8)[4][0]).toBe(".");
  });

  it("is stable per seed and different across seeds, and the svg is crisp rects", () => {
    expect(faceSvg(person("f", 7), 64)).toBe(faceSvg(person("f", 7), 64));
    expect(faceSvg(person("f", 7), 64)).not.toBe(faceSvg(person("f", 8), 64));
    const svg = faceSvg(person("m", 3), 48);
    expect(svg).toContain('viewBox="0 0 8 8"');
    expect(svg).toContain('width="48"');
    expect(svg).toContain('shape-rendering="crispEdges"');
    expect(svg.match(/<rect/g)!.length).toBeGreaterThan(20);
  });
});
