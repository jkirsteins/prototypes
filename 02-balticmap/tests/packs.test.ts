import { describe, it, expect } from "vitest";
import { PACK_SIZE, RARITY_WEIGHTS, openPack } from "../src/packs";
import { ACQUIRABLE_CARDS, type Rng } from "../src/cards";

function seededRng(seed: number): Rng {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** Feeds exact values, then zeros. Lets a test pin which branch a roll takes. */
function scriptedRng(values: number[]): Rng {
  let i = 0;
  return () => values[i++] ?? 0;
}

describe("openPack", () => {
  it("always draws PACK_SIZE cards from the pool", () => {
    const rng = seededRng(7);
    for (let i = 0; i < 50; i++) {
      const pack = openPack(ACQUIRABLE_CARDS, rng);
      expect(pack).toHaveLength(PACK_SIZE);
      for (const id of pack) expect(ACQUIRABLE_CARDS).toContain(id);
    }
  });

  it("is deterministic for a given seed", () => {
    expect(openPack(ACQUIRABLE_CARDS, seededRng(42)))
      .toEqual(openPack(ACQUIRABLE_CARDS, seededRng(42)));
  });

  it("allows duplicates - a pack never guarantees a new card", () => {
    // Both slots roll the common tier (0) and then index 0 of it.
    const pack = openPack(ACQUIRABLE_CARDS, scriptedRng([0, 0, 0, 0]));
    expect(pack).toEqual([ACQUIRABLE_CARDS[0], ACQUIRABLE_CARDS[0]]);
  });

  it("falls back to common when the rolled tier is empty", () => {
    // Roll the very top of the weight range: epic, which has no cards today.
    const pack = openPack(ACQUIRABLE_CARDS, scriptedRng([0.999, 0, 0.999, 0]));
    expect(pack).toHaveLength(PACK_SIZE);
    for (const id of pack) expect(ACQUIRABLE_CARDS).toContain(id);
  });

  it("returns nothing for an empty pool rather than throwing", () => {
    expect(openPack([], seededRng(1))).toEqual([]);
  });

  it("weights common most heavily", () => {
    expect(RARITY_WEIGHTS.common).toBeGreaterThan(RARITY_WEIGHTS.rare);
    expect(RARITY_WEIGHTS.rare).toBeGreaterThan(RARITY_WEIGHTS.epic);
  });
});
