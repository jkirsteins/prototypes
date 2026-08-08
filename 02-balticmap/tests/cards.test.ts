import { describe, it, expect } from "vitest";
import {
  ATTACK_CARDS, BASE_RARITY, BUILDS, CARDS, GUARDS, NEUTRAL_POOL,
  RARITY_TIERS, TRIBUTE_CARDS,
  guardAgainst, isGuardCard, isTributeCard, rarityForImpact, shuffle,
  startingDeck,
} from "../src/cards";
import { cardTextSegments, plainText, t, type NameLookup } from "../src/rich-text";
import { seededRng } from "../src/rng";

describe("cards", () => {
  const LISTED: string[] = [];

  it("defines each card's properties and rules text", () => {
    // Everything but `rarity` - the whole roster is common by design until the
    // balance pass re-measures it - and `textSegments`, which is `text` in
    // another shape; the equivalence test below pins the pair to each other.
    const expectProps = (
      id: string, name: string, targeted: boolean, secret: boolean,
      maxPerDeck: number | null, deckBuildable: boolean, forced: boolean,
      text: string, wealthCost?: number,
    ) => {
      LISTED.push(id);
      const { rarity: _tier, textSegments: _segs, ...rest } = CARDS[id];
      expect(rest).toEqual({
        id, name, targeted, secret, maxPerDeck, deckBuildable, forced, text,
        ...(wealthCost !== undefined ? { wealthCost } : {}),
      });
    };
    expectProps(
      "grow-crops", "Grow turnips", false, false, null, true, false,
      "No effect - a quiet season. Every 5th play earns a Turnip harvest.",
    );
    // Build A - Warpath.
    expectProps(
      "raid", "Raid", true, false, null, true, false,
      "Deal 150 damage, plus your ruler's leadership, to the defenses of one " +
        "land in reach.",
    );
    expectProps(
      "great-raid", "Great raid", false, false, null, true, false,
      "Deal 75 damage, plus your ruler's leadership, to the defenses of " +
        "every land bordering your realm.",
    );
    expectProps(
      "favourable-omens", "Favourable omens", false, false, null, true, false,
      "The signs are read: your next Raid or Great raid deals double damage. " +
        "Readings stack.",
    );
    expectProps(
      "war-council", "War council", false, false, null, true, false,
      "Your ruler gains 50 leadership, added to every attack. Stacks, and " +
        "dies with the ruler.",
    );
    // Build B - Pestilence.
    expectProps(
      "spread-disease", "Spread disease", true, false, null, true, false,
      "Set one of your disease stacks on a land in reach. Stacks sit " +
        "harmless until a Plague cashes them.",
    );
    expectProps(
      "localized-outbreak", "Localized outbreak", true, false, null, true, false,
      "Set one of your disease stacks on every neighbour of a land in reach, " +
        "except lands of your own realm. Third parties are hit.",
    );
    expectProps(
      "miasma", "Miasma", false, false, null, true, false,
      "Foul air gathers: your next Plague counts each of your stacks double. " +
        "Stacks.",
    );
    expectProps(
      "plague", "Plague", false, false, null, true, false,
      "Every land holding your disease takes 100 damage per stack of yours, " +
        "and your stacks are spent. Other owners' stacks are untouched.",
    );
    expectProps(
      "foul-winds", "Foul winds", false, false, 1, true, false,
      "Every disease stack on every land, whoever owns it, becomes yours.",
    );
    // Neutrals - reachable by every deck through the harvest pool.
    expectProps(
      "hillfort", "Hillfort", true, false, null, true, false,
      "Restore 150 defense to one land of your realm, up to what it once held.",
    );
    expectProps(
      "harvest-feast", "Harvest feast", false, false, null, true, false,
      "Restore 50 defense to every land of your realm, up to what each once " +
        "held.",
    );
    expectProps(
      "subjugate", "Subjugate", true, false, 1, true, false,
      "Turn a faction in reach into your vassal. Legal only while their home " +
        "land's defenses sit at a quarter or less. Vassals pay tribute.",
    );
    expectProps(
      "incorporate", "Incorporate", true, false, 1, true, false,
      "Permanently absorb one of your vassals into your realm. Needs a realm " +
        "of 4 lands.",
    );
    expectProps(
      "assassinate-ruler", "Assassinate ruler", true, false, 1, true, false,
      "The ruler of one faction in reach dies. The successor starts with no " +
        "leadership.",
    );
    expectProps(
      "bodyguard", "Bodyguard", false, true, 1, true, false,
      "Post a bodyguard: the next Assassinate ruler against you fails. " +
        "No stacking. Others see only that you played a secret card.",
    );
    expectProps(
      "found-settlement", "Found a settlement", true, false, 1, true, false,
      "Costs 1 wealth. Raise another settlement in one land of your realm, " +
        "up to what your people support. Each settlement founded earns " +
        "1 wealth a turn.",
      1,
    );
    // Injection-only pair: subjugation injects the tribute, the turnip bar
    // injects the harvest.
    expectProps(
      "pay-military-tribute", "Pay tribute", false, false, null, false, true,
      "Forced: while a vassal, pay 1 wealth per land of your realm to your " +
        "overlord; what your treasury cannot cover is forgiven.",
    );
    expectProps(
      "turnip-harvest", "Turnip harvest", false, false, null, false, false,
      "The quiet seasons pay off: three cards from your build's pool are " +
        "offered and you keep one, or none. The keep joins your deck for good.",
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
    const omens = cardTextSegments("favourable-omens")
      .filter((s) => s.kind === "card")
      .map((s) => (s.kind === "card" ? s.cardId : ""));
    expect(omens).toEqual(["raid", "great-raid"]);
    const grow = cardTextSegments("grow-crops")
      .filter((s) => s.kind === "card" && s.cardId === "turnip-harvest");
    expect(grow).toHaveLength(1);
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
    expect(BUILDS.warpath).toEqual([
      "raid", "great-raid", "favourable-omens", "war-council",
    ]);
    expect(BUILDS.pestilence).toEqual([
      "spread-disease", "localized-outbreak", "miasma", "plague", "foul-winds",
    ]);
  });

  it("derives the neutrals in declaration order", () => {
    expect(NEUTRAL_POOL).toEqual([
      "hillfort", "harvest-feast", "subjugate", "incorporate",
      "assassinate-ruler", "bodyguard", "found-settlement",
    ]);
  });

  it("pins the attack cards - what an omens reading doubles", () => {
    expect([...ATTACK_CARDS].sort()).toEqual(["great-raid", "raid"]);
    for (const id of ATTACK_CARDS) {
      expect(CARDS[id]).toBeDefined();
      expect(BUILDS.warpath).toContain(id);
    }
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

describe("startingDeck", () => {
  it("is five Raids and the turnip that feeds the harvest bar", () => {
    expect(startingDeck()).toEqual([
      "raid", "raid", "raid", "raid", "raid", "grow-crops",
    ]);
  });

  it("returns a fresh array each call, so one seat's shuffle cannot leak", () => {
    const a = startingDeck();
    const b = startingDeck();
    expect(a).not.toBe(b);
    a.pop();
    expect(startingDeck()).toHaveLength(6);
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
  const INJECTED_BY: Record<string, string> = {
    ...Object.fromEntries(TRIBUTE_CARDS.map((id) => [id, "subjugate"])),
    // The turnip bar: 5 grow-crops plays shuffle one into the deck
    // (playCard's harvest-earned block), announced by a critical notice.
    "turnip-harvest": "grow-crops",
  };

  it("makes every non-deck-buildable card reachable by something that injects it", () => {
    for (const card of Object.values(CARDS)) {
      if (card.deckBuildable) continue;
      const source = INJECTED_BY[card.id];
      expect(source, `${card.id} is not deck-buildable and nothing injects it`)
        .toBeDefined();
      expect(CARDS[source]).toBeDefined();
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
