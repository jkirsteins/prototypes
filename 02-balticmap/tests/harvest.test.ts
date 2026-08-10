import { describe, it, expect } from "vitest";
import {
  autoHarvestChoice, buildListing, buildOffer, BURN_ORDER, canAfford,
  destroyOffer, GROWTH_CARD, harvestCard, HARVEST_PRIORITY, randomPool,
  removeCopies, SPEND_ORDER,
} from "../src/harvest";
import {
  BUILDS, CARDS, startingDeck, upgradeCostOf, type Strategy,
} from "../src/cards";
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

/** A seat as a game actually deals it - the opening deck in the deck pile.
 *  The ladder is priced against what a seat HOLDS, so a fixture with empty
 *  piles is a seat that can afford nothing and is the wrong default for
 *  anything asking what the offer looks like. */
const opener = (strategy: Strategy): PlayerState =>
  player(strategy, { deck: [...startingDeck(strategy)] });

describe("buildOffer", () => {
  it("is exactly the seat's own build for a seat holding its opening deck", () => {
    // Four Raids and four Fortifies pay for the first rung of both ladders;
    // the top rung is not affordable yet and is not offered yet.
    expect(buildOffer(opener("warpath"))).toEqual([
      "raid", "strong-raid", "fortify", "strong-fortify",
      "favourable-omens", "war-council",
    ]);
    expect(buildOffer(opener("pestilence"))).toEqual(BUILDS.pestilence);
  });

  it("offers a free build in full whatever the seat holds - pestilence is flat", () => {
    expect(buildOffer(player("pestilence"))).toEqual(BUILDS.pestilence);
  });

  it("withholds a card the seat cannot pay for, and hands it over when it can", () => {
    const broke = player("warpath", { deck: ["raid"] });
    expect(buildOffer(broke)).not.toContain("strong-raid");
    const paid = player("warpath", { deck: ["raid", "raid"] });
    expect(buildOffer(paid)).toContain("strong-raid");
  });

  it("counts the price across all three piles, not one of them", () => {
    const spread = player("warpath", { deck: ["raid"], discard: ["raid"] });
    expect(buildOffer(spread)).toContain("strong-raid");
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

  it("always leaves a warpath seat something free to take", () => {
    // Raid and Fortify are the bottom rungs and cost nothing, so no state of
    // the piles can empty a warpath offer and leave the picker with a dead
    // button.
    for (const p of [player("warpath"), opener("warpath")]) {
      expect(buildOffer(p)).toContain("raid");
      expect(buildOffer(p)).toContain("fortify");
    }
  });
});

describe("canAfford", () => {
  it("is true of every free card, held or not", () => {
    expect(canAfford(player("warpath"), "raid")).toBe(true);
    expect(canAfford(player("warpath"), "war-council")).toBe(true);
    expect(canAfford(player("pestilence"), "plague")).toBe(true);
  });

  it("wants the whole price, not part of it", () => {
    expect(canAfford(player("warpath", { hand: ["raid"] }), "strong-raid"))
      .toBe(false);
    expect(canAfford(player("warpath", { hand: ["raid", "raid"] }), "strong-raid"))
      .toBe(true);
  });

  it("charges each rung in its own currency - Raids do not buy a Great raid", () => {
    const rich = player("warpath", { deck: ["raid", "raid", "raid", "raid"] });
    expect(canAfford(rich, "great-raid")).toBe(false);
    const strong = player("warpath", { deck: ["strong-raid", "strong-raid"] });
    expect(canAfford(strong, "great-raid")).toBe(true);
  });
});

describe("buildListing", () => {
  it("keeps a row the seat cannot pay for - the offer is how a card is learnt", () => {
    const rows = buildListing(opener("warpath"));
    expect(rows.map((r) => r.cardId)).toEqual(BUILDS.warpath);
    const great = rows.find((r) => r.cardId === "great-raid");
    expect(great).toEqual({
      cardId: "great-raid",
      cost: { from: "strong-raid", count: 2 },
      held: 0,
      affordable: false,
    });
  });

  it("quotes what the seat holds of the price, so the row says how far off it is", () => {
    const rows = buildListing(opener("warpath"));
    expect(rows.find((r) => r.cardId === "strong-raid"))
      .toEqual({
        cardId: "strong-raid",
        cost: { from: "raid", count: 2 },
        held: 4,
        affordable: true,
      });
  });

  it("prices a free card as no price at all", () => {
    const rows = buildListing(player("pestilence"));
    for (const row of rows) {
      expect(row.cost, row.cardId).toBeNull();
      expect(row.affordable, row.cardId).toBe(true);
      expect(row.held, row.cardId).toBe(0);
    }
  });

  it("drops a capped row entirely - a price is not the reason it is gone", () => {
    const p = player("pestilence", { discard: ["foul-winds"] });
    expect(buildListing(p).map((r) => r.cardId)).not.toContain("foul-winds");
  });
});

describe("removeCopies", () => {
  it("spends the discard first, then the deck, then the hand", () => {
    const p = player("warpath", {
      deck: ["raid", "fortify"], hand: ["raid"], discard: ["raid"],
    });
    const { player: after, removed } = removeCopies(p, "raid", 2, SPEND_ORDER);
    expect(removed).toBe(2);
    expect(after.discard).toEqual([]);
    expect(after.deck).toEqual(["fortify"]);
    // The hand copy is the last one touched: paying with the card somebody was
    // about to play is the one way this trade can feel like a theft.
    expect(after.hand).toEqual(["raid"]);
  });

  it("burns the deck first, then the hand, then the discard", () => {
    const p = player("warpath", {
      deck: ["raid"], hand: ["raid"], discard: ["raid"],
    });
    const { player: after } = removeCopies(p, "raid", 1, BURN_ORDER);
    expect(after.deck).toEqual([]);
    expect(after.hand).toEqual(["raid"]);
    expect(after.discard).toEqual(["raid"]);
  });

  it("says how many it found when the copies run out", () => {
    const p = player("warpath", { deck: ["raid"] });
    const { player: after, removed } = removeCopies(p, "raid", 2, SPEND_ORDER);
    expect(removed).toBe(1);
    expect(after.deck).toEqual([]);
  });

  it("leaves the seat untouched when it holds none", () => {
    const p = player("warpath", { deck: ["fortify"] });
    const { player: after, removed } = removeCopies(p, "raid", 2, SPEND_ORDER);
    expect(removed).toBe(0);
    expect(after).toEqual(p);
  });

  it("does not mutate the seat it was handed", () => {
    const p = player("warpath", { deck: ["raid", "raid"] });
    removeCopies(p, "raid", 2, SPEND_ORDER);
    expect(p.deck).toEqual(["raid", "raid"]);
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
    // A card buildOffer could hand out but this list omits is a card the
    // policy would never set out to buy, and on a ladder that also orphans
    // every rung below it.
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
  it("takes its own build's top-priority card for a seat that can pay for it", () => {
    expect(autoHarvestChoice(opener("warpath")))
      .toEqual({ kind: "build", cardId: "war-council" });
    // A pestilence opener is dealt its own Plague, so the top-ranked card it
    // does not already hold is the next one down.
    expect(autoHarvestChoice(opener("pestilence")))
      .toEqual({ kind: "build", cardId: "localized-outbreak" });
    expect(autoHarvestChoice(player("pestilence")))
      .toEqual({ kind: "build", cardId: "plague" });
  });

  it("prefers priority order over buildOffer's own declaration order", () => {
    // BUILDS.warpath declares raid first; HARVEST_PRIORITY.warpath ranks
    // war-council above it. The pick has to read the priority list, not just
    // take buildOffer's own first entry.
    expect(BUILDS.warpath[0]).not.toBe(HARVEST_PRIORITY.warpath[0]);
    expect(autoHarvestChoice(opener("warpath")))
      .toEqual({ kind: "build", cardId: HARVEST_PRIORITY.warpath[0] });
  });

  it("buys the currency when it wants a card it cannot pay for", () => {
    // It wants a Great raid and holds no Strong raid, so the pick drops a rung
    // to what a Strong raid is bought with - and it holds those.
    const p = player("warpath", {
      deck: ["war-council", "favourable-omens", "strong-fortify"],
      hand: ["raid", "raid"],
    });
    expect(autoHarvestChoice(p))
      .toEqual({ kind: "build", cardId: "strong-raid" });
  });

  it("drops to the bottom of the ladder when it cannot pay for the middle", () => {
    const p = player("warpath", {
      deck: ["war-council", "favourable-omens", "strong-fortify"],
    });
    expect(autoHarvestChoice(p)).toEqual({ kind: "build", cardId: "raid" });
  });

  it("climbs a warpath opener to the top of its build, then broadens", () => {
    // The whole ladder, played out one harvest at a time against the real
    // resolution: this is the sequence a rival seat runs in a live game.
    let p = opener("warpath");
    const picks: string[] = [];
    for (let i = 0; i < 8; i++) {
      const choice = autoHarvestChoice(p);
      picks.push(choice.kind === "build" ? choice.cardId : choice.kind);
      if (choice.kind !== "build") break;
      const cost = upgradeCostOf(choice.cardId);
      if (cost !== null) {
        p = removeCopies(p, cost.from, cost.count, SPEND_ORDER).player;
      }
      p = { ...p, deck: [...p.deck, choice.cardId] };
    }
    expect(picks).toEqual([
      "war-council", "strong-raid", "favourable-omens", "strong-raid",
      "great-raid", "strong-fortify", "random",
    ]);
  });

  it("does not buy back what it spent - the ladder is not a treadmill", () => {
    // Every Raid and Strong raid went into the Great raid this seat holds, so
    // it holds neither. A policy reading only the counts would set out to
    // rebuild both and never look at a neutral card again.
    const p = player("warpath", {
      deck: [
        "great-raid", "war-council", "favourable-omens", "strong-fortify",
      ],
    });
    expect(autoHarvestChoice(p)).toEqual({ kind: "random" });
  });

  it("still wants a rung whose ladder it has not climbed", () => {
    // Holding a Great raid says nothing about the fortify ladder.
    const p = player("warpath", {
      deck: ["great-raid", "war-council", "favourable-omens", "fortify", "fortify"],
    });
    expect(autoHarvestChoice(p))
      .toEqual({ kind: "build", cardId: "strong-fortify" });
  });

});
