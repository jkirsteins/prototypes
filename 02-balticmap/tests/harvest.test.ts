import { describe, it, expect } from "vitest";
import {
  autoHarvestChoice, buildOffer, destroyOffer, GROWTH_CARD, harvestCard,
  HARVEST_PRIORITY, randomPool,
} from "../src/harvest";
import { BUILDS, CARDS, type Strategy } from "../src/cards";
import { seededRng } from "../src/rng";
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

describe("buildOffer", () => {
  it("is exactly the seat's own build for a fresh seat", () => {
    expect(buildOffer(player("warpath"))).toEqual(BUILDS.warpath);
    expect(buildOffer(player("pestilence"))).toEqual(BUILDS.pestilence);
  });

  it("drops a capped build card whichever pile holds it", () => {
    // foul-winds is the one capped card either build carries.
    for (const pile of ["deck", "hand", "discard"] as const) {
      const p = player("pestilence", { [pile]: ["foul-winds"] });
      expect(buildOffer(p), pile).not.toContain("foul-winds");
    }
  });

  it("never runs dry: every other build card is uncapped", () => {
    const p = player("pestilence", { discard: ["foul-winds"] });
    expect(buildOffer(p)).toEqual([
      "spread-disease", "localized-outbreak", "miasma", "plague",
    ]);
  });
});

describe("randomPool", () => {
  it("is every deck-buildable card for a fresh seat", () => {
    const all = Object.values(CARDS).filter((c) => c.deckBuildable).map((c) => c.id);
    expect([...randomPool(player("warpath"))].sort()).toEqual([...all].sort());
  });

  it("drops a capped card whichever pile holds it", () => {
    for (const pile of ["deck", "hand", "discard"] as const) {
      const p = player("warpath", { [pile]: ["subjugate"] });
      expect(randomPool(p), pile).not.toContain("subjugate");
    }
  });

  it("sums copies across the piles against the cap", () => {
    const p = player("warpath", {
      deck: ["found-settlement"], hand: ["raid"], discard: ["raid"],
    });
    expect(randomPool(p)).not.toContain("found-settlement");
    // Uncapped cards are offered no matter how many are held.
    expect(randomPool(p)).toContain("raid");
  });

  it("never offers an injection-only card - prosperous-proliferation has its own slot", () => {
    expect(randomPool(player("warpath"))).not.toContain("prosperous-proliferation");
  });
});

describe("destroyOffer", () => {
  it("is every card held anywhere, deduplicated and sorted", () => {
    const p = player("warpath", {
      deck: ["raid", "raid"], hand: ["fortify"], discard: ["raid", "grow-crops"],
    });
    expect(destroyOffer(p)).toEqual(["fortify", "grow-crops", "raid"]);
  });

  it("excludes forced cards - a tribute demand cannot be ducked by burning it", () => {
    const p = player("warpath", { hand: ["pay-military-tribute", "raid"] });
    expect(destroyOffer(p)).toEqual(["raid"]);
  });
});

describe("harvestCard", () => {
  it("skip and destroy grant nothing - the caller handles the burn itself", () => {
    const p = player("warpath");
    expect(harvestCard(p, { kind: "skip" }, seededRng(1))).toBeNull();
    expect(harvestCard(p, { kind: "destroy", cardId: "raid" }, seededRng(1)))
      .toBeNull();
  });

  it("growth always grants the growth card", () => {
    expect(harvestCard(player("warpath"), { kind: "growth" }, seededRng(1)))
      .toBe(GROWTH_CARD);
  });

  it("build grants the named card only while its own build still offers it", () => {
    const p = player("warpath");
    expect(harvestCard(p, { kind: "build", cardId: "war-council" }, seededRng(1)))
      .toBe("war-council");
    // foul-winds is a pestilence card, not warpath's own - buildOffer refuses
    // it whatever the piles hold.
    expect(harvestCard(p, { kind: "build", cardId: "foul-winds" }, seededRng(1)))
      .toBeNull();
  });

  it("random draws exactly once from the pool, by position", () => {
    const p = player("warpath");
    const pool = randomPool(p);
    let draws = 0;
    const rng = () => { draws++; return 0; };
    expect(harvestCard(p, { kind: "random" }, rng)).toBe(pool[0]);
    expect(draws).toBe(1);
  });
});

describe("HARVEST_PRIORITY", () => {
  it("ranks exactly the cards buildOffer can ever return", () => {
    // A card buildOffer could hand out but this list omits would fall to the
    // MAX_SAFE_INTEGER fallback in autoHarvestChoice and lose its ranking
    // silently.
    for (const strategy of ["warpath", "pestilence"] as const) {
      expect([...HARVEST_PRIORITY[strategy]].sort())
        .toEqual([...BUILDS[strategy]].sort());
    }
  });

  it("pins each build's decisive card first", () => {
    expect(HARVEST_PRIORITY.warpath[0]).toBe("war-council");
    expect(HARVEST_PRIORITY.pestilence[0]).toBe("plague");
  });
});

describe("autoHarvestChoice", () => {
  it("takes its own build's top-priority card for a fresh seat", () => {
    expect(autoHarvestChoice(player("warpath")))
      .toEqual({ kind: "build", cardId: "war-council" });
    expect(autoHarvestChoice(player("pestilence")))
      .toEqual({ kind: "build", cardId: "plague" });
  });

  it("prefers priority order over buildOffer's own declaration order", () => {
    // BUILDS.warpath declares strong-raid first; HARVEST_PRIORITY.warpath
    // ranks war-council above it. The pick has to read the priority list,
    // not just take buildOffer's own first entry.
    expect(BUILDS.warpath[0]).not.toBe(HARVEST_PRIORITY.warpath[0]);
    expect(autoHarvestChoice(player("warpath")))
      .toEqual({ kind: "build", cardId: HARVEST_PRIORITY.warpath[0] });
  });
});
