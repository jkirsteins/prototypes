import { describe, expect, it } from "vitest";
import {
  addDisease, applyDamage, applyHeal, clearDiseaseOf, DEFAULT_DEFENSE_MAX,
  DEFENSE_PER_POPULATION, defenseMaxFromPopulations, defenseMaxOf, defenseOf,
  diseaseOn, gateBandOf, independenceGateOpen, subjugationGateOpen,
  transferAllDiseaseTo, type Defense, type Disease,
} from "../src/defense";

const view = (
  defense: Defense = {},
  defenseMax: Record<string, number> = {},
) => ({ defense, defenseMax });

describe("defense store", () => {
  it("defaults defenseMax where the map named none", () => {
    expect(defenseMaxOf(view(), "selija")).toBe(DEFAULT_DEFENSE_MAX);
    expect(defenseMaxOf(view({}, { selija: 300 }), "selija")).toBe(300);
  });

  it("reads an absent key as at max, and clamps a stored value", () => {
    const v = view({}, { selija: 300 });
    expect(defenseOf(v, "selija")).toBe(300);
    expect(defenseOf(view({ selija: 120 }, { selija: 300 }), "selija")).toBe(120);
    // A stored value outside [0, max] (a boot override, a bug) reads clamped.
    expect(defenseOf(view({ selija: 900 }, { selija: 300 }), "selija")).toBe(300);
    expect(defenseOf(view({ selija: -5 }, { selija: 300 }), "selija")).toBe(0);
  });

  it("damage floors at 0 and materialises the key", () => {
    const v = view({}, { selija: 300 });
    const hit = applyDamage(v, "selija", 120);
    expect(hit.selija).toBe(180);
    const dead = applyDamage(view(hit, v.defenseMax), "selija", 999);
    expect(dead.selija).toBe(0);
  });

  it("heal caps at max and deletes the key at max", () => {
    const v = view({ selija: 180 }, { selija: 300 });
    const part = applyHeal(v, "selija", 50);
    expect(part.selija).toBe(230);
    const full = applyHeal(view(part, v.defenseMax), "selija", 999);
    expect("selija" in full).toBe(false);
    // Healing an undamaged polygon is a no-op that materialises nothing.
    expect("selija" in applyHeal(view({}, v.defenseMax), "selija", 50)).toBe(false);
  });

  it("opens the subjugation gate at exactly 25% of max", () => {
    const max = { selija: 600 };
    expect(subjugationGateOpen(view({ selija: 150 }, max), "selija")).toBe(true);
    expect(subjugationGateOpen(view({ selija: 151 }, max), "selija")).toBe(false);
    expect(subjugationGateOpen(view({ selija: 0 }, max), "selija")).toBe(true);
    expect(subjugationGateOpen(view({}, max), "selija")).toBe(false);
  });

  it("opens the independence gate at exactly 75% of max", () => {
    const max = { selija: 600 };
    expect(independenceGateOpen(view({ selija: 450 }, max), "selija")).toBe(true);
    expect(independenceGateOpen(view({ selija: 449 }, max), "selija")).toBe(false);
    // Undamaged means at max, which is above the gate.
    expect(independenceGateOpen(view({}, max), "selija")).toBe(true);
  });

  it("bands a polygon for the map badge", () => {
    const max = { selija: 600 };
    expect(gateBandOf(view({}, max), "selija")).toBe("high");
    expect(gateBandOf(view({ selija: 450 }, max), "selija")).toBe("high");
    expect(gateBandOf(view({ selija: 449 }, max), "selija")).toBe("middle");
    expect(gateBandOf(view({ selija: 151 }, max), "selija")).toBe("middle");
    expect(gateBandOf(view({ selija: 150 }, max), "selija")).toBe("open");
  });

  it("keeps disease stacks per owner: two rivals on one polygon", () => {
    let d: Disease = {};
    d = addDisease(d, "talava", "selonians", 2);
    d = addDisease(d, "talava", "curonian-confederacy", 1);
    expect(diseaseOn(d, "talava", "selonians")).toBe(2);
    expect(diseaseOn(d, "talava", "curonian-confederacy")).toBe(1);
    expect(diseaseOn(d, "talava", "lietuva")).toBe(0);
    expect(diseaseOn(d, "selija", "selonians")).toBe(0);
  });

  it("clearDiseaseOf burns only the actor's stacks", () => {
    let d: Disease = {};
    d = addDisease(d, "talava", "selonians", 3);
    d = addDisease(d, "talava", "lietuva", 1);
    d = addDisease(d, "selija", "selonians", 2);
    const after = clearDiseaseOf(d, "selonians");
    expect(diseaseOn(after, "talava", "selonians")).toBe(0);
    expect(diseaseOn(after, "selija", "selonians")).toBe(0);
    expect(diseaseOn(after, "talava", "lietuva")).toBe(1);
  });

  it("foul winds hands every stack to one owner, merging counts", () => {
    let d: Disease = {};
    d = addDisease(d, "talava", "selonians", 2);
    d = addDisease(d, "talava", "lietuva", 1);
    d = addDisease(d, "selija", "lietuva", 4);
    const after = transferAllDiseaseTo(d, "selonians");
    expect(diseaseOn(after, "talava", "selonians")).toBe(3);
    expect(diseaseOn(after, "talava", "lietuva")).toBe(0);
    expect(diseaseOn(after, "selija", "selonians")).toBe(4);
  });

  it("sizes the real map's lands from 2 to 18", () => {
    expect(DEFENSE_PER_POPULATION).toBe(5000);
    expect(
      defenseMaxFromPopulations({ "eastern-aukstaitija": 90000, pilsotas: 10000 }),
    ).toEqual({ "eastern-aukstaitija": 18, pilsotas: 2 });
  });
});
