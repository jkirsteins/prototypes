import { describe, it, expect } from "vitest";
import {
  HARVEST_PRIORITY, autoHarvestChoice, harvestPool, rollHarvestOffer,
} from "../src/harvest";
import { BUILDS, CARDS, NEUTRAL_POOL, type Rng, type Strategy } from "../src/cards";
import type { PlayerState } from "../src/game";

function player(
  strategy: Strategy,
  piles: Partial<Pick<PlayerState, "deck" | "hand" | "discard">> = {},
): PlayerState {
  return {
    id: 2, factionId: "alpha", strategy,
    deck: [], hand: [], discard: [],
    ...piles,
  };
}

/** An rng that returns `values` in order, then 0 - and counts its draws. */
function scriptedRng(values: number[]): { rng: Rng; draws: () => number } {
  let i = 0;
  return {
    rng: () => {
      const value = i < values.length ? values[i] : 0;
      i++;
      return value;
    },
    draws: () => i,
  };
}

describe("harvestPool", () => {
  it("is the build's cards plus the neutrals for a fresh seat", () => {
    expect(harvestPool(player("warpath")))
      .toEqual([...BUILDS.warpath, ...NEUTRAL_POOL]);
    expect(harvestPool(player("pestilence")))
      .toEqual([...BUILDS.pestilence, ...NEUTRAL_POOL]);
  });

  it("drops a capped card whichever pile holds it", () => {
    // maxPerDeck is enforced HERE, at the offer, not at play time - so each
    // of the three piles must count.
    for (const pile of ["deck", "hand", "discard"] as const) {
      const p = player("warpath", { [pile]: ["subjugate"] });
      expect(harvestPool(p), pile).not.toContain("subjugate");
    }
  });

  it("sums copies across the piles against the cap", () => {
    const p = player("warpath", {
      deck: ["found-settlement"], hand: ["raid"], discard: ["raid"],
    });
    expect(harvestPool(p)).not.toContain("found-settlement");
    // Uncapped cards are offered no matter how many are held.
    expect(harvestPool(p)).toContain("raid");
  });

  it("caps a build's own card too - foul winds for a pestilence seat", () => {
    const p = player("pestilence", { discard: ["foul-winds"] });
    expect(harvestPool(p)).not.toContain("foul-winds");
  });

  it("never runs dry: the build cores and the heal cards are uncapped", () => {
    // Every capped card held once still leaves the uncapped remainder, which
    // is why the skip arm of autoHarvestChoice is defensive rather than
    // reachable: a real seat's pool is never shorter than this.
    const allCapped = Object.values(CARDS)
      .filter((c) => c.maxPerDeck !== null)
      .map((c) => c.id);
    const p = player("warpath", { discard: allCapped });
    expect(harvestPool(p)).toEqual([
      "raid", "great-raid", "favourable-omens", "war-council", "fortify",
      "hillfort", "harvest-feast", "create-army",
    ]);
  });
});

describe("rollHarvestOffer", () => {
  it("offers three distinct cards from the pool", () => {
    const { rng } = scriptedRng([0, 0, 0]);
    const offer = rollHarvestOffer(player("warpath"), rng);
    expect(offer).toEqual(["raid", "great-raid", "favourable-omens"]);
    expect(new Set(offer).size).toBe(3);
    for (const id of offer) {
      expect([...BUILDS.warpath, ...NEUTRAL_POOL]).toContain(id);
    }
  });

  it("always consumes exactly three rng draws, whatever the pool holds", () => {
    // The constant-draw contract: a shrunken pool must not shift a seeded
    // stream, so the three slots always roll.
    const fresh = scriptedRng([]);
    rollHarvestOffer(player("warpath"), fresh.rng);
    expect(fresh.draws()).toBe(3);
    const allCapped = Object.values(CARDS)
      .filter((c) => c.maxPerDeck !== null)
      .map((c) => c.id);
    const reduced = scriptedRng([]);
    rollHarvestOffer(player("pestilence", { discard: allCapped }), reduced.rng);
    expect(reduced.draws()).toBe(3);
  });

  it("draws without replacement - a middle pick shifts what follows", () => {
    // Slot 1 takes index 7 of the 12-card warpath pool (subjugate); the pool
    // closes up, so two zero draws then take the unchanged head.
    const { rng } = scriptedRng([7 / 12 + 0.001, 0, 0]);
    expect(rollHarvestOffer(player("warpath"), rng))
      .toEqual(["subjugate", "raid", "great-raid"]);
  });
});

describe("HARVEST_PRIORITY", () => {
  it("ranks exactly the cards a seat's pool can ever offer", () => {
    // A card the pool offers but the list omits would fall to the
    // MAX_SAFE_INTEGER fallback and lose every ranking silently.
    for (const strategy of ["warpath", "pestilence"] as const) {
      expect([...HARVEST_PRIORITY[strategy]].sort())
        .toEqual([...BUILDS[strategy], ...NEUTRAL_POOL].sort());
    }
  });

  it("puts subjugate first for both builds - the win-condition card", () => {
    expect(HARVEST_PRIORITY.warpath[0]).toBe("subjugate");
    expect(HARVEST_PRIORITY.pestilence[0]).toBe("subjugate");
  });
});

describe("autoHarvestChoice", () => {
  it("keeps the offered card its strategy ranks highest", () => {
    // The offer is [subjugate, raid, great-raid]; warpath ranks subjugate
    // above both.
    const { rng } = scriptedRng([7 / 12 + 0.001, 0, 0]);
    expect(autoHarvestChoice(player("warpath"), rng))
      .toEqual({ cardId: "subjugate" });
  });

  it("ranks by its own build - the same slots read differently", () => {
    const { rng } = scriptedRng([0, 0, 0]);
    // Pestilence pool head: spread-disease, localized-outbreak, miasma;
    // the priority list keeps spread-disease above the other two.
    expect(autoHarvestChoice(player("pestilence"), rng))
      .toEqual({ cardId: "spread-disease" });
  });

  it("prefers priority order over offer order", () => {
    // Offer [great-raid, favourable-omens, raid] (index 1, then 1, then 0 of
    // the shrinking 12-card pool): warpath ranks raid above both others.
    const { rng } = scriptedRng([1 / 12 + 0.001, 1 / 11 + 0.001, 0]);
    expect(autoHarvestChoice(player("warpath"), rng))
      .toEqual({ cardId: "raid" });
  });

  it("never skips a live offer - skip is the empty-pool arm only", () => {
    // The pool cannot empty through play (the uncapped core above), so a
    // choiceless harvest always keeps something.
    const { rng } = scriptedRng([0.9, 0.9, 0.9]);
    const choice = autoHarvestChoice(player("warpath"), rng);
    expect("cardId" in choice).toBe(true);
  });
});
