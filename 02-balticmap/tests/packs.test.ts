import { describe, it, expect } from "vitest";
import { PACK_SIZE, openPack } from "../src/packs";
import {
  ACQUIRABLE_CARDS, BASE_RARITY, CARDS, RARITY_TIERS, type Rng,
} from "../src/cards";

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
    // Both slots roll the common tier (0) and then index 0 of it. Read off the
    // pool rather than written down: which card sits first in the common tier
    // follows from the measured impact table, not from the pool's own order.
    const common = ACQUIRABLE_CARDS.filter((id) => CARDS[id].rarity === BASE_RARITY);
    const pack = openPack(ACQUIRABLE_CARDS, scriptedRng([0, 0, 0, 0]));
    expect(pack).toEqual([common[0], common[0]]);
  });

  it("draws from the top tier once it holds a card", () => {
    // Roll the very top of the weight range - epic - then index 0 of it. Epic
    // is populated now that the impact table has been measured, so this is the
    // path a real jackpot pack takes.
    const epic = ACQUIRABLE_CARDS.filter((id) => CARDS[id].rarity === "epic");
    expect(epic.length).toBeGreaterThan(0);
    const pack = openPack(ACQUIRABLE_CARDS, scriptedRng([0.999, 0, 0.999, 0]));
    expect(pack).toEqual([epic[0], epic[0]]);
  });

  it("falls back to common when the rolled tier is empty", () => {
    // Roll epic again, but against a pool holding no epic card - the fallback
    // this exercises is what keeps an unpopulated tier harmless. It used to be
    // enough to roll epic against the whole pool, because epic was empty; now
    // that it is not, the empty tier has to be constructed.
    const noEpic = ACQUIRABLE_CARDS.filter((id) => CARDS[id].rarity !== "epic");
    const pack = openPack(noEpic, scriptedRng([0.999, 0, 0.999, 0]));
    expect(pack).toHaveLength(PACK_SIZE);
    for (const id of pack) expect(CARDS[id].rarity).toBe(BASE_RARITY);
  });

  it("returns nothing for an empty pool rather than throwing", () => {
    expect(openPack([], seededRng(1))).toEqual([]);
  });

  it("weights common most heavily", () => {
    const weight = (id: string) =>
      RARITY_TIERS.find((t) => t.id === id)?.weight;
    expect(weight("common")).toBeGreaterThan(weight("rare")!);
    expect(weight("rare")).toBeGreaterThan(weight("epic")!);
  });
});
