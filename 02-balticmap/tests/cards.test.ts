import { describe, it, expect } from "vitest";
import {
  ACQUIRABLE_CARDS, AI_DECK_GUARANTEED, CARDS, DECK_SIZE, DEFAULT_DECK,
  STARTING_KNOWN_CARDS, buildDeck, buildAiDeck, shuffle, type Rng,
} from "../src/cards";

const NON_BASICS = [
  "raid", "shrewd-marriage", "fortify", "subjugate",
  "incorporate", "seeds-of-revolt",
  "assassinate-ruler", "alliance", "extended-diplomacy", "bodyguard",
  "favourable-omens",
];

function seededRng(seed: number): Rng {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

describe("cards", () => {
  it("defines the nine card types with v2 properties", () => {
    const expectProps = (
      id: string, name: string, targeted: boolean,
      maxPerDeck: number | null, deckBuildable: boolean, forced: boolean,
      rarity: string, text: string,
    ) =>
      expect(CARDS[id]).toEqual({ id, name, targeted, maxPerDeck, deckBuildable, forced, rarity, text });
    expectProps(
      "grow-crops", "Grow turnips", false, null, true, false,
      "common",
      "No effect - a quiet season. Fills out the deck.",
    );
    expectProps(
      "raid", "Raid", true, 1, true, false,
      "common",
      "Gain Might over one faction in reach: +1 for your first land on their " +
        "border, +2 for the second, +3 for the third, and so on.",
    );
    expectProps(
      "shrewd-marriage", "Shrewd marriage", true, 1, true, false,
      "common",
      "Gain +1 Status over one faction in reach; your overlord is always courtable.",
    );
    expectProps(
      "fortify", "Fortify", false, 1, true, false,
      "common",
      "Gain +1 Might over every other living faction at once.",
    );
    expectProps(
      "subjugate", "Subjugate", true, 1, true, false,
      "common",
      "Turn a faction in reach into your vassal. Needs a lead of 2 per land of their realm. Vassals pay tribute.",
    );
    expectProps(
      "incorporate", "Incorporate", true, 1, true, false,
      "common",
      "Permanently absorb one of your vassals into your realm.",
    );
    expectProps(
      "pay-tribute", "Pay tribute", false, null, false, true,
      "common",
      "Forced: while a vassal, grant your overlord +1 Might or +1 Status.",
    );
    expectProps(
      "seeds-of-revolt", "Seeds of revolt", false, 1, true, false,
      "common",
      "While a vassal: shuffle a Revolt into your deck. Only one Revolt at a time.",
    );
    // Revolt is injection-only now, like Pay tribute: Seeds of revolt puts it
    // in the deck, so it must never be deck-buildable.
    expectProps(
      "revolt", "Revolt", false, 1, false, false,
      "common",
      "Cast off your overlord, no lead required. They lose 1 Might and 1 Status against you. Leaves your deck for good.",
    );
    expectProps(
      "assassinate-ruler", "Assassinate ruler", true, 1, true, false,
      "common",
      "Even the score: the Status lead between you and one faction in reach resets to none.",
    );
    expectProps(
      "alliance", "Alliance", true, 1, true, false,
      "common",
      "Seal a pact with one faction in reach: no hostile cards between you for 5 turns.",
    );
    expectProps(
      "extended-diplomacy", "Extended diplomacy", false, 1, true, false,
      "common",
      "Patient envoys: your next Alliance lasts twice as long.",
    );
    expectProps(
      "bodyguard", "Bodyguard", false, 1, true, false,
      "common",
      "Post a bodyguard: the next Assassinate ruler against you fails. No stacking.",
    );
  });

  it("builds the explicit default deck, favourable-omens included", () => {
    const deck = buildDeck();
    expect(deck).toHaveLength(DECK_SIZE);
    expect(deck).toEqual(DEFAULT_DECK);
    expect(deck).toContain("favourable-omens");
    expect(deck).not.toContain("extended-diplomacy");
    expect(deck).not.toContain("bodyguard");
    expect(deck).not.toContain("pay-tribute");
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
    // 11 non-basics now exist (Reclaim independence retired); an rng that
    // includes all of them must still be capped at DECK_SIZE (same overflow
    // guard as buildDeck), dropping only favourable-omens (last in CARDS
    // order) rather than returning 11 cards.
    const deck = buildAiDeck(() => 0);
    const count = (id: string) => deck.filter((c) => c === id).length;
    for (const id of NON_BASICS.filter((id) => id !== "favourable-omens")) {
      expect(count(id)).toBe(1);
    }
    expect(count("favourable-omens")).toBe(0);
    expect(deck).toHaveLength(DECK_SIZE);
  });
});

describe("every card is reachable by a player", () => {
  // AGENTS.md: a card a player can never learn of is, for them, not in the
  // game. Deck-buildable cards are found via the learning loop; the only
  // exemption is injection-only cards, which must name what injects them.
  const INJECTED_BY: Record<string, string> = {
    "pay-tribute": "subjugate",
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
  it("tags every card with a rarity, all common for now", () => {
    for (const c of Object.values(CARDS)) {
      expect(c.rarity).toBe("common");
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
    // first run could reach a position with no legal play but Pay tribute and
    // no way out of it - which src/game.ts now ends outright, so the card
    // being reachable from run one is what keeps that ending a decision.
    // tests/meta.test.ts checks the other half: it can actually be decked.
    expect(STARTING_KNOWN_CARDS).toContain("seeds-of-revolt");
  });

  it("acquires exactly the deck-buildable non-basics you do not start with", () => {
    expect(ACQUIRABLE_CARDS).toEqual([
      "shrewd-marriage", "incorporate",
      "assassinate-ruler", "alliance", "extended-diplomacy", "bodyguard",
      "favourable-omens", "found-settlement",
    ]);
    // the escape is a starting card now, not a pack drop
    expect(ACQUIRABLE_CARDS).not.toContain("seeds-of-revolt");
    // grow-crops is free filler, not acquirable; revolt and pay-tribute are
    // injection-only and must never appear in a pack.
    expect(ACQUIRABLE_CARDS).not.toContain("grow-crops");
    expect(ACQUIRABLE_CARDS).not.toContain("revolt");
    expect(ACQUIRABLE_CARDS).not.toContain("pay-tribute");
  });
});
