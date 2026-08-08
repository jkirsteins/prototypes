import { describe, it, expect } from "vitest";
import {
  ACQUIRABLE_CARDS, AI_DECK_GUARANTEED, BASE_RARITY, CARDS, DECK_SIZE,
  DEFAULT_DECK, DOUBLABLE_CARDS, FAN_OUT_CARDS, GUARDS, RARITY_TIERS,
  STARTING_KNOWN_CARDS, TRIBUTE_CARDS,
  buildDeck, buildAiDeck, guardAgainst, isGuardCard, rarityForImpact, shuffle,
  type Rng,
} from "../src/cards";
import impactData from "../src/data/card-impact.json";

const NON_BASICS = [
  "raid", "fortify", "subjugate",
  "incorporate", "seeds-of-revolt",
  "assassinate-ruler", "alliance", "extended-diplomacy", "bodyguard",
  "favourable-omens", "found-settlement",
  "population-boom", "distrustful-neighbour",
  "take-hostage", "mighty-ruler", "seat-of-power",
];

function seededRng(seed: number): Rng {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

describe("cards", () => {
  it("defines each card's properties and rules text", () => {
    // Everything but `rarity`, which is not a property of the card's design:
    // it follows from the measured impact table, and the tier a given card
    // reaches moves whenever the pool does. Restating it here would be the
    // hand-tagging that "rarity assignment" below exists to refuse - and would
    // make every rarity pass a rewrite of this list.
    const expectProps = (
      id: string, name: string, targeted: boolean, secret: boolean,
      maxPerDeck: number | null, deckBuildable: boolean, forced: boolean,
      text: string, wealthCost?: number,
    ) => {
      const { rarity: _tier, ...rest } = CARDS[id];
      expect(rest).toEqual({
        id, name, targeted, secret, maxPerDeck, deckBuildable, forced, text,
        ...(wealthCost !== undefined ? { wealthCost } : {}),
      });
    };
    expectProps(
      "grow-crops", "Grow turnips", false, false, null, true, false,
      "No effect - a quiet season. Fills out the deck.",
    );
    expectProps(
      "raid", "Raid", true, false, 1, true, false,
      "Gain Might over one faction in reach: +1 for your first land on their " +
        "border, +2 for the second, +3 for the third, and so on.",
    );
    expectProps(
      "fortify", "Fortify", false, false, 1, true, false,
      "Gain +1 Might over every other living faction at once - except your " +
        "overlord, while you have one.",
    );
    expectProps(
      "subjugate", "Subjugate", true, false, 1, true, false,
      "Turn a faction in reach into your vassal. Needs a Might lead of 2 per land of their realm. Vassals pay tribute.",
    );
    expectProps(
      "incorporate", "Incorporate", true, false, 1, true, false,
      "Permanently absorb one of your vassals into your realm.",
    );
    expectProps(
      "pay-military-tribute", "Pay tribute", false, false, null, false, true,
      "Forced: while a vassal, pay 1 wealth per land of your realm to your " +
        "overlord; what your treasury cannot cover, grant as Might instead.",
    );
    expectProps(
      "seeds-of-revolt", "Seeds of revolt", false, false, 1, true, false,
      "While a vassal: shuffle a Revolt into your deck. Only one Revolt at a time.",
    );
    // Revolt is injection-only now, like the tribute cards: Seeds of revolt puts it
    // in the deck, so it must never be deck-buildable.
    expectProps(
      "revolt", "Revolt", false, false, 1, false, false,
      "Cast off your overlord. Needs a Might lead over them of 4 minus their " +
        "realm's lands - a sprawling realm is easier to escape. They lose 1 " +
        "Might against you, and none may subjugate you for 2 turns. Leaves " +
        "your deck for good.",
    );
    expectProps(
      "assassinate-ruler", "Assassinate ruler", true, false, 1, true, false,
      "Even the score: the Might lead between you and one faction in reach resets to none.",
    );
    expectProps(
      "alliance", "Alliance", true, false, 1, true, false,
      "Seal a pact with one faction in reach: no hostile cards between you " +
        "for 5 turns, and +1 Might for both of you against every faction " +
        "bordering both realms. Sealed again with an ally, the pact runs " +
        "5 turns longer.",
    );
    expectProps(
      "extended-diplomacy", "Extended diplomacy", false, false, 1, true, false,
      "Patient envoys: your next Alliance lasts twice as long.",
    );
    expectProps(
      "found-settlement", "Found a settlement", true, false, 1, true, false,
      "Costs 1 wealth. Raise another settlement in one land of your realm, " +
        "up to what your people support - two, and one more for each " +
        "Population boom you hold. Each settlement adds +1 to the Might " +
        "lead others need to subjugate you, and spends a boom.",
      1,
    );
    expectProps(
      "population-boom", "Population boom", false, false, 1, true, false,
      "Your people multiply: one more settlement than your lands would " +
        "otherwise support. Stacks, and waits in hand until a settlement is " +
        "founded.",
    );
    // The two secret cards: others see only that a card was played.
    expectProps(
      "bodyguard", "Bodyguard", false, true, 1, true, false,
      "Post a bodyguard: the next Assassinate ruler against you fails. " +
        "No stacking. Others see only that you played a secret card.",
    );
    expectProps(
      "distrustful-neighbour", "Distrustful neighbour", false, true, 1, true, false,
      "Your neighbours grow wary: the next Alliance sealed with you fails. " +
        "No stacking. Others see only that you played a secret card.",
    );
    expectProps(
      "take-hostage", "Take hostage", true, false, 1, true, false,
      "Take a hostage from a vassal of yours whose deck holds a Revolt: the " +
        "Revolt cannot be played until they pay tribute twice and the " +
        "hostage goes home.",
    );
    expectProps(
      "seat-of-power", "Seat of power", true, false, 1, true, false,
      "Costs 1 wealth. Move your ruler's seat to a land you hold outright. " +
        "Others need +2 more Might lead to subjugate you, and your raids on " +
        "the seat's neighbours gain +1 Might. Only one seat stands at a time.",
      1,
    );
  });

  it("keeps the secret cards and the guards the same set", () => {
    // Not a preference - a guard rail, and the reason it is an identity rather
    // than a pinned literal.
    //
    // A secret card must move no relation counter, because `impactText` in
    // src/hud.ts prints the standings suffix beside the line whatever the
    // card's name says, and a suffix names the card in all but words. It must
    // also have a reveal clause, or the log insists on "a secret card" forever
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
    // Like the secret set below the guards: a wealth cost changes when a card
    // is playable at all, so one cannot appear - or change size - without
    // somebody reading the 2026-08-02 wealth design and updating this.
    const costed = Object.fromEntries(
      Object.values(CARDS)
        .filter((c) => c.wealthCost !== undefined)
        .map((c) => [c.id, c.wealthCost]),
    );
    expect(costed).toEqual({ "found-settlement": 1, "seat-of-power": 1 });
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

  it("keeps every fan-out card real, untargeted and doublable", () => {
    // Untargeted because the effect is "against every other living faction",
    // and doublable because a reading has an obvious number to double - which
    // `impactText` then renders as "+N against all" rather than a pair.
    for (const id of FAN_OUT_CARDS) {
      expect(CARDS[id], `${id} is not a real card`).toBeDefined();
      expect(CARDS[id].targeted).toBe(false);
      expect(DOUBLABLE_CARDS.has(id), `${id} is not doublable`).toBe(true);
    }
  });

  it("builds the explicit default deck, favourable-omens included", () => {
    const deck = buildDeck();
    expect(deck).toHaveLength(DECK_SIZE);
    expect(deck).toEqual(DEFAULT_DECK);
    expect(deck).toContain("favourable-omens");
    expect(deck).not.toContain("extended-diplomacy");
    expect(deck).not.toContain("bodyguard");
    for (const id of TRIBUTE_CARDS) expect(deck).not.toContain(id);
    // Found a settlement holds the slot Reclaim independence retired and
    // grow-crops briefly filled, so the default deck now carries no filler at
    // all: every one of its ten cards does something.
    expect(deck).toContain("found-settlement");
    expect(deck.filter((c) => c === "grow-crops")).toHaveLength(0);
  });

  it("DEFAULT_DECK holds DECK_SIZE ids, each a real, deck-buildable, " +
    "maxPerDeck-respecting card", () => {
    expect(DEFAULT_DECK).toHaveLength(DECK_SIZE);
    const seen = new Set<string>();
    for (const id of DEFAULT_DECK) {
      const card = CARDS[id];
      expect(card, `${id} is not a real card`).toBeDefined();
      expect(card.deckBuildable, `${id} is not deck-buildable`).toBe(true);
      // Every id here appears once, so a maxPerDeck of 1 (true of every
      // non-basic) is trivially respected; this also catches an accidental
      // duplicate that would otherwise silently double a card in the deck.
      expect(seen.has(id), `${id} appears more than once`).toBe(false);
      seen.add(id);
      if (card.maxPerDeck !== null) {
        const count = DEFAULT_DECK.filter((c) => c === id).length;
        expect(count).toBeLessThanOrEqual(card.maxPerDeck);
      }
    }
  });

  it("pads with grow-crops if DEFAULT_DECK is ever shorter than DECK_SIZE", () => {
    // DEFAULT_DECK is currently exactly DECK_SIZE long, so buildDeck()'s
    // padding branch (Math.max(0, DECK_SIZE - DEFAULT_DECK.length)) is never
    // exercised by calling buildDeck() as-is. Force it by shortening the
    // live array - DEFAULT_DECK is a plain mutable string[] - then restore it
    // in `finally` so no other test observes the mutation.
    const removed = DEFAULT_DECK.pop()!;
    try {
      expect(DEFAULT_DECK).toHaveLength(DECK_SIZE - 1);
      const deck = buildDeck();
      expect(deck).toHaveLength(DECK_SIZE);
      expect(deck).toEqual([...DEFAULT_DECK, "grow-crops"]);
    } finally {
      DEFAULT_DECK.push(removed);
    }
    expect(DEFAULT_DECK).toHaveLength(DECK_SIZE);
  });

  it("shuffle returns a permutation and leaves the input untouched", () => {
    const input = ["a", "b", "c", "d", "e"];
    const copy = [...input];
    const out = shuffle(input, seededRng(42));
    expect(input).toEqual(copy);
    expect([...out].sort()).toEqual([...input].sort());
  });

  it("shuffle is deterministic for a given rng seed", () => {
    const input = ["a", "b", "c", "d", "e", "f", "g"];
    expect(shuffle(input, seededRng(7))).toEqual(shuffle(input, seededRng(7)));
  });

  it("shuffle actually reorders (seed chosen to produce a change)", () => {
    const input = ["a", "b", "c", "d", "e", "f", "g"];
    expect(shuffle(input, seededRng(1))).not.toEqual(input);
  });

  it("carries Favourable omens as a one-per-deck buildable card", () => {
    const card = CARDS["favourable-omens"];
    expect(card.name).toBe("Favourable omens");
    expect(card.targeted).toBe(false);
    expect(card.forced).toBe(false);
    expect(card.maxPerDeck).toBe(1);
    expect(card.deckBuildable).toBe(true);
  });
});

describe("buildAiDeck", () => {
  it("returns DECK_SIZE cards drawn only from valid deck-buildable ids", () => {
    const deck = buildAiDeck(seededRng(3));
    expect(deck).toHaveLength(DECK_SIZE);
    for (const id of deck) {
      expect(["grow-crops", ...NON_BASICS]).toContain(id);
    }
  });

  it("is deterministic for the same seed", () => {
    expect(buildAiDeck(seededRng(11))).toEqual(buildAiDeck(seededRng(11)));
  });

  it("different seeds can produce different decks", () => {
    const decks = [1, 2, 3, 4, 5, 6, 7, 8].map((s) => buildAiDeck(seededRng(s)));
    const unique = new Set(decks.map((d) => JSON.stringify([...d].sort())));
    expect(unique.size).toBeGreaterThan(1);
  });

  it("an rng that always returns >= 0.5 yields the guaranteed cards over filler", () => {
    const deck = buildAiDeck(() => 0.5);
    expect(deck).toEqual([
      "raid", "subjugate",
      ...Array.from({ length: DECK_SIZE - 2 }, () => "grow-crops"),
    ]);
  });

  it("an empty guarantee list gives the unarmed all-filler deck", () => {
    const deck = buildAiDeck(() => 0.5, []);
    expect(deck).toEqual(Array.from({ length: DECK_SIZE }, () => "grow-crops"));
  });

  it("every deck carries the guaranteed aggression cards", () => {
    for (let seed = 1; seed <= 40; seed++) {
      const deck = buildAiDeck(seededRng(seed));
      for (const id of AI_DECK_GUARANTEED) expect(deck).toContain(id);
    }
  });

  it("an rng that always returns < 0.5 includes non-basics up to DECK_SIZE, guarding overflow", () => {
    // 17 non-basics now exist; an rng that includes all of them must still be
    // capped at DECK_SIZE (same overflow guard as buildDeck), keeping the
    // guaranteed pair plus the first of the rest in CARDS declaration order
    // rather than returning 16 cards.
    const deck = buildAiDeck(() => 0);
    expect(deck).toHaveLength(DECK_SIZE);
    for (const id of AI_DECK_GUARANTEED) expect(deck).toContain(id);
    // Everything in the deck is a real non-basic, and nothing is duplicated.
    for (const id of deck) expect(NON_BASICS).toContain(id);
    expect(new Set(deck).size).toBe(DECK_SIZE);
    // The tail of CARDS is what falls off the end.
    expect(deck).not.toContain("eloping-heirs");
  });
});

describe("every card is reachable by a player", () => {
  // AGENTS.md: a card a player can never learn of is, for them, not in the
  // game. Deck-buildable cards are found via the learning loop; the only
  // exemption is injection-only cards, which must name what injects them.
  const INJECTED_BY: Record<string, string> = {
    ...Object.fromEntries(TRIBUTE_CARDS.map((id) => [id, "subjugate"])),
    "revolt": "seeds-of-revolt",
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

  it("keeps Revolt out of deck-building so Seeds of revolt is its only route", () => {
    expect(CARDS.revolt.deckBuildable).toBe(false);
    expect(CARDS["seeds-of-revolt"].deckBuildable).toBe(true);
    // and therefore never rolled into an AI deck or offered on the deck screen
    const deck = buildAiDeck(() => 0, []);
    expect(deck).not.toContain("revolt");
  });
});

describe("rarity and the acquirable pool", () => {
  it("tags every card with a rarity drawn from the tier table", () => {
    const ids = RARITY_TIERS.map((t) => t.id);
    for (const c of Object.values(CARDS)) {
      expect(ids, `${c.id} has an unknown rarity`).toContain(c.rarity);
    }
  });

  it("starts the player on Raid, Subjugate, Fortify and Seeds of revolt", () => {
    expect(STARTING_KNOWN_CARDS).toEqual([
      "raid", "subjugate", "fortify", "seeds-of-revolt",
    ]);
    for (const id of STARTING_KNOWN_CARDS) {
      expect(CARDS[id].deckBuildable).toBe(true);
      expect(CARDS[id].maxPerDeck).not.toBeNull();
    }
  });

  it("keeps the only escape from vassalage reachable on a first run", () => {
    // Seeds of revolt is the only route to a Revolt, and a Revolt is the only
    // way a vassal frees itself (src/playability.ts). Pack-locking it meant a
    // first run could reach a position with no legal play but tribute and
    // no way out of it - which src/game.ts now ends outright, so the card
    // being reachable from run one is what keeps that ending a decision.
    // tests/meta.test.ts checks the other half: it can actually be decked.
    expect(STARTING_KNOWN_CARDS).toContain("seeds-of-revolt");
  });

  it("acquires exactly the deck-buildable non-basics you do not start with", () => {
    expect(ACQUIRABLE_CARDS).toEqual([
      "incorporate",
      "assassinate-ruler", "alliance", "extended-diplomacy", "bodyguard",
      "favourable-omens", "found-settlement",
      "population-boom", "distrustful-neighbour",
      "take-hostage", "mighty-ruler", "seat-of-power",
    ]);
    // the escape is a starting card now, not a pack drop
    expect(ACQUIRABLE_CARDS).not.toContain("seeds-of-revolt");
    // grow-crops is free filler, not acquirable; revolt and the tribute cards are
    // injection-only and must never appear in a pack.
    expect(ACQUIRABLE_CARDS).not.toContain("grow-crops");
    expect(ACQUIRABLE_CARDS).not.toContain("revolt");
    for (const id of TRIBUTE_CARDS) {
      expect(ACQUIRABLE_CARDS).not.toContain(id);
    }
  });
});

describe("rarity assignment", () => {
  it("gives every pack-pool card the tier its measured impact reaches", () => {
    const impact: Record<string, number> = impactData.impact;
    for (const id of ACQUIRABLE_CARDS) {
      expect(impact[id], `no measured impact for ${id}`).toBeTypeOf("number");
      expect(CARDS[id].rarity).toBe(rarityForImpact(impact[id]));
    }
  });

  it("keeps every card outside the pack pool at the base tier", () => {
    for (const card of Object.values(CARDS)) {
      if (ACQUIRABLE_CARDS.includes(card.id)) continue;
      expect(card.rarity, `${card.id} is not in a pack`).toBe(BASE_RARITY);
    }
  });
});

describe("rarity tiers", () => {
  it("orders tiers by ascending minImpact", () => {
    const mins = RARITY_TIERS.map((t) => t.minImpact);
    expect([...mins].sort((a, b) => a - b)).toEqual(mins);
  });

  it("gives a harder-to-reach tier a smaller weight", () => {
    const weights = RARITY_TIERS.map((t) => t.weight);
    expect([...weights].sort((a, b) => b - a)).toEqual(weights);
  });

  it("weights sum to 100, so they read as percentages", () => {
    expect(RARITY_TIERS.reduce((sum, t) => sum + t.weight, 0)).toBe(100);
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
