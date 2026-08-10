import { describe, it, expect } from "vitest";
import {
  ATTACK_CARDS, BASE_RARITY, BUILDS, CARDS, CONSUMED_CARDS, GUARDS,
  INWARD_CARDS, LADDER_DEPTH, NEUTRAL_POOL, RARITY_TIERS, SINGLE_LAND_HEALS,
  TRIBUTE_CARDS, UPGRADES,
  guardAgainst, isGuardCard, isHostileCard, isInwardCard, isSingleLandHeal,
  isTributeCard,
  repeatGroupOf, rarityForImpact, shuffle, startingDeck, upgradeCostOf,
  upgradesInto,
} from "../src/cards";
import { SINGLE_LAND_HEAL } from "../src/defense";
import { cardTextSegments, plainText, t, type NameLookup } from "../src/rich-text";
import { seededRng } from "../src/rng";

describe("cards", () => {
  const LISTED: string[] = [];

  it("defines each card's properties and rules text", () => {
    // Everything but `rarity` - the whole roster is common by design until the
    // balance pass re-measures it - `textSegments`, which is `text` in another
    // shape, and `playsAgain`, which has its own pin below; the equivalence
    // test further down pins text and segments to each other.
    const expectProps = (
      id: string, name: string, targeted: boolean, secret: boolean,
      maxPerDeck: number | null, deckBuildable: boolean, forced: boolean,
      text: string, wealthCost?: number,
    ) => {
      LISTED.push(id);
      const {
        rarity: _tier, textSegments: _segs, keywords: _again, ...rest
      } = CARDS[id];
      expect(rest).toEqual({
        id, name, targeted, secret, maxPerDeck, deckBuildable, forced, text,
        ...(wealthCost !== undefined ? { wealthCost } : {}),
      });
    };
    expectProps(
      "grow-crops", "Grow turnips", false, false, null, true, false,
      "Nothing happens. Enough of these earn a Turnip harvest.",
    );
    // Build A - Warpath.
    expectProps(
      "raid", "Raid", true, false, null, true, false,
      "Send an army at a bordering land. It lands next turn for 1 damage, " +
        "less any counter-raid.",
    );
    expectProps(
      "great-raid", "Great raid", true, false, null, true, false,
      "Every land of yours bordering one land raids it, one army each. Each " +
        "lands next turn like a Raid, answered separately.",
    );
    expectProps(
      "favourable-omens", "Favourable omens", false, false, null, true, false,
      "Your next raid or fortify card counts double. Stacks.",
    );
    expectProps(
      "war-council", "War council", false, false, null, true, false,
      "Your ruler gains 1 leadership. Stacks. Lost when the ruler dies - " +
        "what their leadership is worth is up to what they can do with it.",
    );
    expectProps(
      "strong-raid", "Strong raid", true, false, null, true, false,
      "Send an army at a bordering land. It lands next turn for 2 damage, " +
        "less any counter-raid.",
    );
    expectProps(
      "strong-fortify", "Strong fortify", true, false, null, true, false,
      "Restore 2 defense to one of your lands.",
    );
    expectProps(
      "fortify", "Fortify", true, false, null, true, false,
      "Restore 1 defense to one of your lands.",
    );
    // Build B - Pestilence.
    expectProps(
      "spread-disease", "Spread disease", true, false, null, true, false,
      "Put 1 disease on a land in reach. It does nothing until a Plague.",
    );
    expectProps(
      "localized-outbreak", "Localized outbreak", true, false, null, true, false,
      "Put 1 disease on every neighbour of a land in reach. Skips your own " +
        "lands.",
    );
    expectProps(
      "miasma", "Miasma", false, false, null, true, false,
      "Your next Plague counts each of your stacks double. Stacks.",
    );
    expectProps(
      "plague", "Plague", false, false, null, true, false,
      "Every land holding your disease takes 1 damage per stack. Your " +
        "stacks are spent.",
    );
    expectProps(
      "foul-winds", "Foul winds", false, false, 1, true, false,
      "Every disease stack on the map becomes yours.",
    );
    // Neutrals - reachable by every deck through the harvest pool.
    expectProps(
      "hillfort", "Hillfort", true, false, null, true, false,
      "Restore 3 defense to one of your lands.",
    );
    expectProps(
      "harvest-feast", "Harvest feast", false, false, null, true, false,
      "Restore 1 defense to every land you hold.",
    );
    expectProps(
      "subjugate", "Subjugate", true, false, 1, false, false,
      "Take a faction in reach as your vassal, once their defenses are " +
        "gone. Vassals pay tribute.",
    );
    expectProps(
      "incorporate", "Incorporate", true, false, 1, true, false,
      "Absorb one of your vassals for good. Needs a realm of 4 lands.",
    );
    expectProps(
      "assassinate-ruler", "Assassinate ruler", true, false, 1, true, false,
      "Kill a ruler in reach. Their successor starts with no leadership.",
    );
    expectProps(
      "bodyguard", "Bodyguard", false, true, 1, true, false,
      "The next Assassinate ruler against you fails. One at a time. Others " +
        "see only that you played a secret card.",
    );
    // Consumed: leaves the deck for good rather than a build or the neutral
    // pool, since the harvest offers it in a fixed slot of its own.
    expectProps(
      "prosperous-proliferation", "Prosperous proliferation", true, false,
      null, false, false,
      "Good years: one of your lands grows by 1, ceiling and defense alike.",
    );
    expectProps(
      "found-settlement", "Found a settlement", true, false, 1, true, false,
      "Costs 1 wealth. Build a settlement in one of your lands. Each one " +
        "founded earns 1 wealth a turn.",
      1,
    );
    // Injection-only pair: subjugation injects the tribute, the turnip bar
    // injects the harvest.
    expectProps(
      "pay-military-tribute", "Pay tribute", false, false, null, false, true,
      "Forced. Pay your overlord 1 wealth per land of yours. What you " +
        "cannot pay is forgiven.",
    );
    expectProps(
      "turnip-harvest", "Turnip harvest", false, false, null, false, false,
      "Three cards are offered. Keep one, or none. The keep joins your deck.",
    );
    // The table above IS the roster: a card added to CARDS without a row here
    // fails, so nothing ships property-unreviewed.
    expect([...LISTED].sort()).toEqual(Object.keys(CARDS).sort());
  });

  it("keeps textSegments and text saying the same thing", () => {
    // textSegments exists so a card the text names is a hoverable node; text
    // is the same sentence flat. Pinning the two equal is what makes a rename
    // of the referenced card fail here until the flat text follows it.
    const names: NameLookup = { factionName: (id) => id, isPlaceName: () => false };
    for (const c of Object.values(CARDS)) {
      if (c.textSegments !== undefined) {
        expect(plainText(c.textSegments, names), c.id).toBe(c.text);
      }
    }
  });

  it("does not pass vacuously - references are segments, plain text one run", () => {
    // A card naming another card carries it as a `card` segment...
    const bodyguard = cardTextSegments("bodyguard")
      .filter((s) => s.kind === "card")
      .map((s) => (s.kind === "card" ? s.cardId : ""));
    expect(bodyguard).toEqual(["assassinate-ruler"]);
    const grow = cardTextSegments("grow-crops")
      .filter((s) => s.kind === "card" && s.cardId === "turnip-harvest");
    expect(grow).toHaveLength(1);
    // ...and a card naming a CLASS of cards carries the keyword instead, which
    // is why Favourable omens no longer lists the raids one by one.
    const omens = cardTextSegments("favourable-omens")
      .filter((s) => s.kind === "keyword")
      .map((s) => (s.kind === "keyword" ? s.keywordId : ""));
    expect(omens).toEqual(["raid", "fortify"]);
    // A card naming nothing is one plain run, not a run per word.
    expect(cardTextSegments("raid")).toEqual([t(CARDS.raid.text)]);
  });

  it("keeps the secret cards and the guards the same set", () => {
    // Not a preference - a guard rail, and the reason it is an identity rather
    // than a pinned literal.
    //
    // A secret card must move no score, because `impactText` in src/hud.ts
    // prints the before -> after suffix beside the line whatever the card's
    // name says, and a suffix names the card in all but words. It must also
    // have a reveal clause, or the log insists on "a secret card" forever
    // about something the player watched happen.
    //
    // Being a guard answers both at once: a guard's whole effect is that
    // SOMEBODY ELSE'S card moved nothing, and `revealedSecrets` reveals it off
    // the `prevented` play it turned aside. A secret that guards nothing has
    // neither for free and must write its own; a guard that is not secret hands
    // rivals a detector for what it is holding.
    const secret = Object.values(CARDS).filter((c) => c.secret).map((c) => c.id);
    expect([...secret].sort()).toEqual(Object.keys(GUARDS).sort());
  });

  it("pins the costed set to a literal", () => {
    // A wealth cost changes when a card is playable at all, so one cannot
    // appear - or change size - without somebody updating this.
    const costed = Object.fromEntries(
      Object.values(CARDS)
        .filter((c) => c.wealthCost !== undefined)
        .map((c) => [c.id, c.wealthCost]),
    );
    expect(costed).toEqual({ "found-settlement": 1 });
    // A forced card with a cost would jam the forced set against an empty
    // treasury; nothing forces the two apart today except this line.
    for (const id of Object.keys(costed)) {
      expect(CARDS[id].forced).toBe(false);
    }
  });

  it("aims every guard at a real, targeted card", () => {
    // Targeted, because `playCard` consumes the guard off `targetFactionId`:
    // an untargeted card has nobody to check against and would silently never
    // be turned aside.
    for (const [guardId, targetId] of Object.entries(GUARDS)) {
      expect(CARDS[guardId], `${guardId} is not a real card`).toBeDefined();
      expect(CARDS[targetId], `${targetId} is not a real card`).toBeDefined();
      expect(CARDS[targetId].targeted, `${targetId} is not targeted`).toBe(true);
      expect(guardAgainst(targetId)).toBe(guardId);
      expect(isGuardCard(guardId)).toBe(true);
      expect(isGuardCard(targetId)).toBe(false);
    }
  });
});

describe("builds and the neutral pool", () => {
  it("partitions the deck-buildable non-filler roster exactly", () => {
    // Every deck-buildable card except the turnip filler belongs to exactly
    // one of: warpath, pestilence, the neutral pool. A card in none is
    // unreachable (no harvest ever offers it); a card in two double-arms one
    // build. Both are roster bugs this identity catches.
    const partition = [
      ...BUILDS.warpath, ...BUILDS.pestilence, ...NEUTRAL_POOL,
    ];
    expect(new Set(partition).size).toBe(partition.length);
    const nonFiller = Object.values(CARDS)
      .filter((c) => c.deckBuildable && c.id !== "grow-crops")
      .map((c) => c.id);
    expect([...partition].sort()).toEqual([...nonFiller].sort());
  });

  it("pins the two build lists to literals", () => {
    // Warpath is a ladder listed bottom to top: the plain cards are in the
    // build because they are the currency the strong ones are bought with.
    expect(BUILDS.warpath).toEqual([
      "raid", "strong-raid", "great-raid",
      "fortify", "strong-fortify",
      "favourable-omens", "war-council",
    ]);
    expect(BUILDS.pestilence).toEqual([
      "spread-disease", "localized-outbreak", "miasma", "plague", "foul-winds",
    ]);
  });

  it("derives the neutrals in declaration order", () => {
    // Raid and Fortify are NOT here: they are the bottom rungs of the warpath
    // ladder and belong to that build. Subjugate is not here either - it is
    // withdrawn, which is to say not deck-buildable at all.
    expect(NEUTRAL_POOL).toEqual([
      "hillfort", "harvest-feast", "incorporate", "assassinate-ruler",
      "bodyguard", "found-settlement",
    ]);
  });

  it("pins the attack cards - what an omens reading doubles", () => {
    expect([...ATTACK_CARDS].sort()).toEqual(["great-raid", "raid", "strong-raid"]);
    for (const id of ATTACK_CARDS) {
      expect(CARDS[id]).toBeDefined();
      // Reachable by a warpath seat either way: all three raids are rungs of
      // its own build's ladder, and the plain one opens the deck besides.
      expect([...BUILDS.warpath, ...NEUTRAL_POOL]).toContain(id);
    }
  });

  it("pins the consumed set - what leaves the deck instead of discarding", () => {
    // Both are handed out again when they are earned again, and both are
    // permanent once played, so neither may come round with the discard.
    expect([...CONSUMED_CARDS].sort())
      .toEqual(["prosperous-proliferation", "turnip-harvest"]);
    for (const id of CONSUMED_CARDS) {
      expect(CARDS[id]).toBeDefined();
      // Uncapped: a card that already cannot repeat needs no belt-and-braces
      // maxPerDeck on top of that.
      expect(CARDS[id].maxPerDeck).toBeNull();
      expect(startingDeck()).not.toContain(id);
    }
  });

  it("pins the repeat groups - what a spent turn still accepts", () => {
    // Carrying a keyword is not the same as repeating: the fortify and unique
    // keywords carry rules of their own and re-open nothing.
    const keyworded = Object.values(CARDS).filter((c) => c.keywords !== undefined)
      .map((c) => c.id).sort();
    expect(keyworded).toEqual([
      "assassinate-ruler", "fortify", "foul-winds", "great-raid",
      "localized-outbreak", "plague", "prosperous-proliferation", "raid",
      "spread-disease", "strong-fortify", "strong-raid", "subjugate",
      "turnip-harvest",
    ]);
    // All three raids share one group, so any of them re-opens the turn for
    // any other.
    const again = ["great-raid", "raid", "strong-raid"];
    for (const id of again) expect(repeatGroupOf(id)).toBe("raid");
    // The reader is the only reader of the field, so a card that declares
    // nothing must answer null through it rather than by being left out of a
    // list somewhere else.
    for (const id of Object.keys(CARDS)) {
      expect(repeatGroupOf(id) !== null).toBe(again.includes(id));
    }
    expect(repeatGroupOf("no-such-card")).toBeNull();
  });

  it("pins the hostile set - every card that may not be aimed up your chain", () => {
    // A literal, so the set cannot grow or shrink without somebody reading the
    // rule it turns on: a card that does harm and is left OUT of this set can
    // still be aimed at the actor's own overlord, and nothing else in the tree
    // would say so. Untargeted plagues are in it too - they resolve over a set
    // of lands rather than at one, and `plagueTargets` skips the same chain.
    const hostile = Object.keys(CARDS).filter(isHostileCard).sort();
    expect(hostile).toEqual([
      "assassinate-ruler", "foul-winds", "great-raid", "localized-outbreak",
      "plague", "raid", "spread-disease", "strong-raid", "subjugate",
    ]);
    // Nothing that heals, builds or grows is hostile: a card aimed inward
    // cannot be aimed up anything.
    for (const id of INWARD_CARDS) expect(isHostileCard(id)).toBe(false);
  });

  it("pins the single-land heals to the amounts they restore", () => {
    // The set is the amount table's key set: a heal in one and not the other
    // would be a card whose preview and whose effect disagree.
    expect([...SINGLE_LAND_HEALS].sort())
      .toEqual(["fortify", "hillfort", "strong-fortify"]);
    for (const id of SINGLE_LAND_HEALS) {
      expect(CARDS[id], id).toBeDefined();
      expect(isSingleLandHeal(id), id).toBe(true);
      expect(SINGLE_LAND_HEAL[id], id).toBeGreaterThan(0);
    }
    expect(isSingleLandHeal("raid")).toBe(false);
  });

  it("pins the inward cards - what is aimed at your own realm", () => {
    // The click, the targeting cues and the hover all ask this one question,
    // and only an INCORPORATED land tells a right answer from a wrong one:
    // resolved politically, a card aimed at an annexed land lands on its
    // annexer's home instead.
    expect([...INWARD_CARDS].sort()).toEqual([
      "fortify", "found-settlement", "hillfort", "prosperous-proliferation",
      "strong-fortify",
    ]);
    for (const id of INWARD_CARDS) {
      expect(CARDS[id], id).toBeDefined();
      expect(CARDS[id].targeted, id).toBe(true);
      expect(isInwardCard(id), id).toBe(true);
    }
    // Every heal is inward; not everything inward is a heal.
    for (const id of SINGLE_LAND_HEALS) expect(INWARD_CARDS.has(id), id).toBe(true);
    expect(isInwardCard("subjugate")).toBe(false);
  });

  it("pins the one-per-deck set - what the harvest offer stops re-offering", () => {
    const capped = Object.values(CARDS)
      .filter((c) => c.maxPerDeck !== null)
      .map((c) => c.id);
    expect([...capped].sort()).toEqual([
      "assassinate-ruler", "bodyguard", "foul-winds", "found-settlement",
      "incorporate", "subjugate",
    ]);
    for (const id of capped) expect(CARDS[id].maxPerDeck).toBe(1);
  });
});

describe("the upgrade ladder", () => {
  it("pins what each priced card is bought with", () => {
    expect(UPGRADES).toEqual({
      "strong-raid": { from: "raid", count: 2 },
      "great-raid": { from: "strong-raid", count: 2 },
      "strong-fortify": { from: "fortify", count: 2 },
    });
    expect(upgradeCostOf("raid")).toBeNull();
    expect(upgradeCostOf("plague")).toBeNull();
  });

  it("names only real cards, on both sides of the price", () => {
    for (const [id, cost] of Object.entries(UPGRADES)) {
      expect(CARDS[id], id).toBeDefined();
      expect(CARDS[cost.from], cost.from).toBeDefined();
      expect(cost.count, id).toBeGreaterThan(1);
    }
  });

  it("prices only cards inside a build, and only where the currency is too", () => {
    // A price on a card the harvest cannot offer by name is a price nothing
    // charges, and a currency outside the build is a price the seat has no
    // route to earn.
    const inABuild = new Set([...BUILDS.warpath, ...BUILDS.pestilence]);
    for (const [id, cost] of Object.entries(UPGRADES)) {
      expect(inABuild.has(id), id).toBe(true);
      expect(inABuild.has(cost.from), cost.from).toBe(true);
    }
  });

  it("has a bottom: every ladder walks down to a free card", () => {
    // The AI's pick drops a rung whenever it cannot pay, so a ladder with no
    // free bottom rung is a policy with nothing to buy.
    for (const id of Object.keys(UPGRADES)) {
      let at: string = id;
      let rungs = 0;
      while (upgradeCostOf(at) !== null) {
        at = (upgradeCostOf(at) as { from: string }).from;
        rungs++;
        expect(rungs, `${id} does not reach a free card`)
          .toBeLessThanOrEqual(LADDER_DEPTH);
      }
    }
  });

  it("spends each card on at most one thing, so the table inverts cleanly", () => {
    // `upgradesInto` is the table read backwards, and two cards sharing a
    // currency would lose one of them - which is how the AI tells "I spent my
    // Raids" from "I still want Raids".
    const spent = Object.values(UPGRADES).map((c) => c.from);
    expect(new Set(spent).size).toBe(spent.length);
    expect(upgradesInto("raid")).toBe("strong-raid");
    expect(upgradesInto("strong-raid")).toBe("great-raid");
    expect(upgradesInto("great-raid")).toBeNull();
  });

  it("bounds any walk of the table", () => {
    expect(LADDER_DEPTH).toBe(Object.keys(UPGRADES).length + 1);
  });
});

describe("startingDeck", () => {
  it("is 4 Raid, 4 Fortify and the turnip that feeds the bar", () => {
    expect(startingDeck()).toEqual([
      "raid", "raid", "raid", "raid",
      "fortify", "fortify", "fortify", "fortify",
      "grow-crops",
    ]);
  });

  it("swaps in the pestilence build's own opener, same shape otherwise", () => {
    expect(startingDeck("pestilence")).toEqual([
      "spread-disease", "spread-disease", "spread-disease", "plague",
      "fortify", "fortify", "fortify", "fortify",
      "grow-crops",
    ]);
  });

  it("holds no card that takes ground - an army walking in does that now", () => {
    // Subjugate is withdrawn, and a land changes hands by a raid landing on a
    // flattened one. Nothing deals the card and nothing offers it.
    expect(startingDeck()).not.toContain("subjugate");
    expect(startingDeck("pestilence")).not.toContain("subjugate");
    expect(CARDS.subjugate.deckBuildable).toBe(false);
  });

  it("opens with the whole price of the warpath ladder's first two rungs", () => {
    // Four Raids buy two Strong raids, and those two buy the Great raid. The
    // opening deck is the bankroll, which is why the plain cards are dealt in
    // fours and not in twos.
    const raids = startingDeck().filter((c) => c === "raid").length;
    expect(raids).toBe(
      (UPGRADES["strong-raid"].count) * (UPGRADES["great-raid"].count),
    );
    expect(startingDeck().filter((c) => c === "fortify").length)
      .toBeGreaterThanOrEqual(UPGRADES["strong-fortify"].count);
  });

  it("returns a fresh array each call, so one seat's shuffle cannot leak", () => {
    const a = startingDeck();
    const b = startingDeck();
    expect(a).not.toBe(b);
    a.pop();
    expect(startingDeck()).toHaveLength(9);
  });
});

describe("tribute cards", () => {
  it("pins the set and its injection-only shape", () => {
    expect(TRIBUTE_CARDS).toEqual(["pay-military-tribute"]);
    for (const id of TRIBUTE_CARDS) {
      expect(isTributeCard(id)).toBe(true);
      expect(CARDS[id].forced).toBe(true);
      expect(CARDS[id].deckBuildable).toBe(false);
    }
    expect(isTributeCard("raid")).toBe(false);
  });
});

describe("every card is reachable by a player", () => {
  // AGENTS.md: a card a player can never learn of is, for them, not in the
  // game. Deck-buildable cards are reachable through the harvest offer; the
  // only exemption is injection-only cards, which must name what injects them.
  //
  // The one exception is a WITHDRAWN card: taken out of every pool while its
  // definition, its AI branch and the machinery it drives stay in the tree,
  // because it is meant to come back. A land changes hands by an army walking
  // into it now, so Subjugate is out - and the tribute it injects goes dormant
  // with it rather than becoming a card with no injector.
  const WITHDRAWN = new Set(["subjugate"]);

  const INJECTED_BY: Record<string, string> = {
    ...Object.fromEntries(TRIBUTE_CARDS.map((id) => [id, "subjugate"])),
    // The turnip bar: enough grow-crops plays shuffle one into the deck
    // (playCard's harvest-earned block), announced by a critical notice.
    "turnip-harvest": "grow-crops",
    // The harvest's own "growth" choice always offers it, in a slot of its
    // own - resolving a turnip-harvest is what reaches it.
    "prosperous-proliferation": "turnip-harvest",
  };

  it("makes every non-deck-buildable card reachable by something that injects it", () => {
    for (const card of Object.values(CARDS)) {
      if (card.deckBuildable || WITHDRAWN.has(card.id)) continue;
      const source = INJECTED_BY[card.id];
      expect(source, `${card.id} is not deck-buildable and nothing injects it`)
        .toBeDefined();
      expect(CARDS[source]).toBeDefined();
      // A card whose only injector is withdrawn is dormant, not reachable, and
      // saying so here is what stops the exemption spreading by accident.
      if (WITHDRAWN.has(source)) {
        expect(TRIBUTE_CARDS, `${card.id} rides on a withdrawn card`)
          .toContain(card.id);
      }
    }
  });

  it("keeps a withdrawn card out of every pool at once", () => {
    // Withdrawn is all or nothing: half-withdrawn is a card the offer can hand
    // out while nothing else in the game expects anybody to hold one.
    for (const id of WITHDRAWN) {
      expect(CARDS[id], id).toBeDefined();
      expect(CARDS[id].deckBuildable, id).toBe(false);
      expect(NEUTRAL_POOL, id).not.toContain(id);
      expect([...BUILDS.warpath, ...BUILDS.pestilence], id).not.toContain(id);
      expect(startingDeck(), id).not.toContain(id);
      expect(startingDeck("pestilence"), id).not.toContain(id);
    }
  });
});

describe("rarity", () => {
  it("keeps the whole roster common - the rebuild ships unmeasured", () => {
    // The design doc defers `npm run rarity` to the later balance pass; until
    // it runs, hand-tagging a tier would be the drift the conformance test
    // used to catch. When the pass lands, this pin is what it replaces.
    for (const c of Object.values(CARDS)) {
      expect(c.rarity, c.id).toBe(BASE_RARITY);
    }
  });
});

describe("rarity tiers", () => {
  it("orders tiers by ascending minImpact", () => {
    const mins = RARITY_TIERS.map((tier) => tier.minImpact);
    expect([...mins].sort((a, b) => a - b)).toEqual(mins);
  });

  it("gives a harder-to-reach tier a smaller weight", () => {
    const weights = RARITY_TIERS.map((tier) => tier.weight);
    expect([...weights].sort((a, b) => b - a)).toEqual(weights);
  });

  it("weights sum to 100, so they read as percentages", () => {
    expect(RARITY_TIERS.reduce((sum, tier) => sum + tier.weight, 0)).toBe(100);
  });

  it("puts the base tier first and lets anything reach it", () => {
    expect(RARITY_TIERS[0].id).toBe(BASE_RARITY);
    expect(rarityForImpact(Number.NEGATIVE_INFINITY)).toBe(BASE_RARITY);
  });

  it("returns the highest tier the impact reaches", () => {
    const top = RARITY_TIERS[RARITY_TIERS.length - 1];
    expect(rarityForImpact(top.minImpact)).toBe(top.id);
  });
});

describe("shuffle", () => {
  it("returns a permutation and leaves the input untouched", () => {
    const input = ["a", "b", "c", "d", "e"];
    const copy = [...input];
    const out = shuffle(input, seededRng(42));
    expect(input).toEqual(copy);
    expect([...out].sort()).toEqual([...input].sort());
  });

  it("is deterministic for a given rng seed", () => {
    const input = ["a", "b", "c", "d", "e", "f", "g"];
    expect(shuffle(input, seededRng(7))).toEqual(shuffle(input, seededRng(7)));
  });

  it("actually reorders (seed chosen to produce a change)", () => {
    const input = ["a", "b", "c", "d", "e", "f", "g"];
    expect(shuffle(input, seededRng(1))).not.toEqual(input);
  });
});
