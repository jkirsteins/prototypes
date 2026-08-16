import { describe, expect, it } from "vitest";
import {
  addDisease, allocateSpend, applyDamage, applyHeal, clearDiseaseOf,
  DEFAULT_DEFENSE_MAX,
  DEFENSE_PER_POPULATION, defenseMaxFromPopulations, defenseMaxOf, defenseOf,
  diseaseOn, gateBandOf, MIN_RAID_SPEND,
  spendCeilingFor, subjugationGateOpen,
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

  it("opens the subjugation gate only when the defenses are gone", () => {
    // The gate is zero: a land falls when it is flattened and not a moment
    // sooner, so the badge that turns red, the band the map draws and the army
    // that walks in all mean the same thing. A fractional gate was a second
    // way to lose a land and a second number to read.
    const max = { selija: 6 };
    expect(subjugationGateOpen(view({ selija: 0 }, max), "selija")).toBe(true);
    expect(subjugationGateOpen(view({ selija: 1 }, max), "selija")).toBe(false);
    expect(subjugationGateOpen(view({ selija: 2 }, max), "selija")).toBe(false);
    expect(subjugationGateOpen(view({}, max), "selija")).toBe(false);
    // Floored against the ceiling, so no size of land opens early.
    expect(subjugationGateOpen(view({ selija: 1 }, { selija: 18 }), "selija"))
      .toBe(false);
  });

  it("bands a polygon for the map badge", () => {
    // Only the open band is a rule. High and middle are how hurt a land
    // LOOKS, at the ceiling of 75% of max - 4.5 on a 6, so 5 reads healthy
    // and 4 reads wounded.
    const max = { selija: 6 };
    expect(gateBandOf(view({}, max), "selija")).toBe("high");
    expect(gateBandOf(view({ selija: 5 }, max), "selija")).toBe("high");
    expect(gateBandOf(view({ selija: 4 }, max), "selija")).toBe("middle");
    expect(gateBandOf(view({ selija: 2 }, max), "selija")).toBe("middle");
    // Only a flattened land bands open - the gate is zero.
    expect(gateBandOf(view({ selija: 1 }, max), "selija")).toBe("middle");
    expect(gateBandOf(view({ selija: 0 }, max), "selija")).toBe("open");
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

describe("spendCeilingFor", () => {
  it("gives a Raid half the land's CURRENT defense, rounded up", () => {
    expect(spendCeilingFor("raid", 6)).toBe(3);
    expect(spendCeilingFor("raid", 5)).toBe(3); // rounded up
    expect(spendCeilingFor("raid", 1)).toBe(1); // the last point is spendable
    expect(spendCeilingFor("raid", 0)).toBe(0); // and then there is no raid
  });

  it("gives the two deep cards all of it", () => {
    expect(spendCeilingFor("strong-raid", 5)).toBe(5);
    expect(spendCeilingFor("great-raid", 5)).toBe(5);
  });

  it("reads current and never maximum - a wounded land raids feebly", () => {
    // Which is what makes a successful counter-raid worth more than the point
    // it took off the score.
    expect(spendCeilingFor("raid", 2)).toBe(1);
  });

  it("gives a card that is not an attack nothing, rather than a Raid's share", () => {
    expect(spendCeilingFor("fortify", 6)).toBe(0);
    expect(spendCeilingFor("not-a-card", 6)).toBe(0);
  });

  it("floors a nonsense score rather than returning one", () => {
    expect(spendCeilingFor("raid", -4)).toBe(0);
  });
});

describe("allocateSpend", () => {
  it("spreads a total as evenly as the caps allow, remainder in fan order", () => {
    expect(allocateSpend([6, 4, 3], 6)).toEqual([2, 2, 2]);
    expect(allocateSpend([6, 4, 3], 8)).toEqual([3, 3, 2]);
    expect(allocateSpend([6, 4, 3], 11)).toEqual([4, 4, 3]);
  });

  it("stops a land at its own cap and keeps climbing the others", () => {
    // The slider's whole behaviour: a row that has hit its ceiling stays put
    // while the rows around it rise.
    expect(allocateSpend([6, 4, 3], 13)).toEqual([6, 4, 3]);
    expect(allocateSpend([6, 4, 3], 12)).toEqual([5, 4, 3]);
  });

  it("adds exactly one point per point of total, so a drag never re-shuffles", () => {
    let last = allocateSpend([6, 4, 3], 0);
    for (let total = 1; total <= 13; total += 1) {
      const next = allocateSpend([6, 4, 3], total);
      const moved = next.filter((n, i) => n !== last[i]);
      expect(moved).toHaveLength(1);
      expect(next.reduce((a, b) => a + b, 0)).toBe(total);
      last = next;
    }
  });

  it("ignores a total the caps cannot hold, and one below zero", () => {
    expect(allocateSpend([6, 4, 3], 99)).toEqual([6, 4, 3]);
    expect(allocateSpend([6, 4, 3], -1)).toEqual([0, 0, 0]);
  });

  it("handles one land, no lands, and a fan of empty purses", () => {
    expect(allocateSpend([5], 3)).toEqual([3]);
    expect(allocateSpend([], 3)).toEqual([]);
    expect(allocateSpend([0, 0], 3)).toEqual([0, 0]);
  });

  it("gives every land at least the minimum once the total reaches the fan", () => {
    // Which is the floor `playCard` and the slider both put on a Great raid:
    // a pool smaller than the fan would send fewer arrows than the card says.
    const caps = [6, 4, 3];
    for (const n of allocateSpend(caps, MIN_RAID_SPEND * caps.length)) {
      expect(n).toBeGreaterThanOrEqual(MIN_RAID_SPEND);
    }
  });
});
