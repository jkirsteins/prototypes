import { describe, it, expect } from "vitest";
import { NEW_CARD_GUARANTEES, PACK_SIZE, openPack } from "../src/packs";
import {
  ACQUIRABLE_CARDS, BASE_RARITY, CARDS, RARITY_TIERS, type Rng,
} from "../src/cards";
import { EARLY_PACKS } from "../src/xp";

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

  it("allows duplicates when no guarantee is in play", () => {
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

describe("guaranteed new card", () => {
  const ofTier = (tier: string) =>
    ACQUIRABLE_CARDS.filter((id) => CARDS[id].rarity === tier);
  const fresh = { unknownIds: [...ACQUIRABLE_CARDS] };

  it("covers exactly the early-progression window", () => {
    expect(NEW_CARD_GUARANTEES).toHaveLength(EARLY_PACKS);
  });

  it("overrides the tier roll on the first pack: an epic, whatever was rolled", () => {
    // A 0 tier-roll means common, but the pack-0 guarantee forces an unknown
    // epic into the first slot. The second slot still rolls common index 0.
    const pack = openPack(ACQUIRABLE_CARDS, scriptedRng([0, 0, 0, 0]), {
      ...fresh, packIndex: 0,
    });
    expect(pack).toEqual([ofTier("epic")[0], ofTier(BASE_RARITY)[0]]);
  });

  it("walks the schedule: rare on packs 1-2, common on packs 3-4", () => {
    for (const [index, tier] of [[1, "rare"], [2, "rare"], [3, "common"], [4, "common"]] as const) {
      const pack = openPack(ACQUIRABLE_CARDS, scriptedRng([0, 0, 0, 0]), {
        ...fresh, packIndex: index,
      });
      expect(CARDS[pack[0]].rarity, `pack ${index}`).toBe(tier);
    }
  });

  it("is inert past the schedule", () => {
    const guarded = openPack(ACQUIRABLE_CARDS, seededRng(42), {
      ...fresh, packIndex: EARLY_PACKS,
    });
    expect(guarded).toEqual(openPack(ACQUIRABLE_CARDS, seededRng(42)));
  });

  it("is inert when there is nothing left to learn", () => {
    const guarded = openPack(ACQUIRABLE_CARDS, seededRng(42), {
      packIndex: 0, unknownIds: [],
    });
    expect(guarded).toEqual(openPack(ACQUIRABLE_CARDS, seededRng(42)));
  });

  it("falls to the nearest tier when the scheduled one is exhausted", () => {
    // Both epics known: the pack-0 epic guarantee pays an unknown rare.
    const unknownIds = ACQUIRABLE_CARDS.filter((id) => CARDS[id].rarity !== "epic");
    const pack = openPack(ACQUIRABLE_CARDS, scriptedRng([0, 0, 0, 0]), {
      packIndex: 0, unknownIds,
    });
    expect(CARDS[pack[0]].rarity).toBe("rare");
  });

  it("climbs above the scheduled tier once everything below is known", () => {
    // Only an epic left unknown: the pack-4 common guarantee still pays it.
    const unknownIds = [ofTier("epic")[0]];
    const pack = openPack(ACQUIRABLE_CARDS, scriptedRng([0, 0, 0, 0]), {
      packIndex: 4, unknownIds,
    });
    expect(pack[0]).toBe(unknownIds[0]);
  });

  it("guarantees only the first slot - the second may duplicate it", () => {
    // Pack 3 guarantees a common; a 0 tier-roll on the second slot picks the
    // same first common. The duplicate stays a real outcome.
    const pack = openPack(ACQUIRABLE_CARDS, scriptedRng([0, 0, 0, 0]), {
      ...fresh, packIndex: 3,
    });
    expect(pack).toEqual([ofTier(BASE_RARITY)[0], ofTier(BASE_RARITY)[0]]);
  });

  it("burns a draw so the second slot matches an unguaranteed pack's", () => {
    // The guaranteed slot must consume exactly two rng values, like any slot,
    // so a seed maps to the same downstream draws with or without it.
    const script = [0.5, 0.5, 0.7, 0.3];
    const guarded = openPack(ACQUIRABLE_CARDS, scriptedRng(script), {
      ...fresh, packIndex: 0,
    });
    const free = openPack(ACQUIRABLE_CARDS, scriptedRng(script));
    expect(guarded[1]).toBe(free[1]);
  });
});
