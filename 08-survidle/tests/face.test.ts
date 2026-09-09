import { describe, expect, it } from "vitest";
import { medianPerson } from "../src/sim/person";
import type { Person } from "../src/sim/types";
import {
  clearFaceCache,
  faceCacheSize,
  faceFrame,
  faceIdentity,
  faceSvg,
  FOCUSED_FACE,
  STATIC_FACE,
} from "../src/ui/face";

function person(sex: "f" | "m", face: number): Person {
  return { ...medianPerson(sex), face };
}

describe("the Toon Head face", () => {
  it("keeps an identity stable per seed and changes it across seeds", () => {
    expect(faceIdentity(person("f", 7))).toEqual(faceIdentity(person("f", 7)));
    expect(faceIdentity(person("f", 7))).not.toEqual(faceIdentity(person("f", 8)));
    expect(faceSvg(person("f", 7), 64)).toBe(faceSvg(person("f", 7), 64));
    expect(faceSvg(person("f", 7), 64)).not.toBe(faceSvg(person("f", 8), 64));
  });

  it("shares hair, limits clothes, and gives facial hair only to men", () => {
    const clothes = new Set<string>();
    const womenHair = new Set<string>();
    const menHair = new Set<string>();
    let beardedMen = 0;
    for (let seed = 0; seed < 200; seed++) {
      const woman = faceIdentity(person("f", seed));
      const man = faceIdentity(person("m", seed));
      expect(woman.beard).toBeNull();
      expect(["shirt", "openJacket", "turtleNeck"]).toContain(woman.clothes);
      expect(["shirt", "openJacket", "turtleNeck"]).toContain(man.clothes);
      clothes.add(woman.clothes);
      clothes.add(man.clothes);
      womenHair.add(woman.hair);
      menHair.add(man.hair);
      if (man.beard) beardedMen++;
    }
    expect(clothes).toEqual(new Set(["shirt", "openJacket", "turtleNeck"]));
    expect(womenHair).toEqual(menHair);
    expect(womenHair.size).toBe(4);
    expect(beardedMen).toBeGreaterThan(0);
  });

  it("changes expression without changing the chosen identity", () => {
    const p = person("m", 77);
    const identity = faceIdentity(p);
    const resting = faceFrame(p, 64, STATIC_FACE);
    const focused = faceFrame(p, 64, FOCUSED_FACE);
    expect(faceIdentity(p)).toEqual(identity);
    expect(resting).not.toBe(focused);
    expect(resting).toContain("<svg");
    expect(resting).toContain('width="64"');
    expect(focused).toContain("eyes-wide");
  });

  it("bounds the generated frame cache", () => {
    clearFaceCache();
    for (let seed = 0; seed < 300; seed++) faceSvg(person("m", seed), 24);
    expect(faceCacheSize()).toBe(256);
  });
});
