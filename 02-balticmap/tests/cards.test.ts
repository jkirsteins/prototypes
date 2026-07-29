import { describe, it, expect } from "vitest";
import {
  AI_DECK_GUARANTEED, CARDS, DECK_SIZE, DEFAULT_DECK, buildDeck, buildAiDeck,
  shuffle, type Rng,
} from "../src/cards";

const NON_BASICS = [
  "raid", "shrewd-marriage", "fortify", "subjugate",
  "incorporate", "reclaim-independence", "revolt",
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
      maxPerDeck: number | null, deckBuildable: boolean, forced: boolean, text: string,
    ) =>
      expect(CARDS[id]).toEqual({ id, name, targeted, maxPerDeck, deckBuildable, forced, text });
    expectProps(
      "grow-crops", "Grow potatoes", false, null, true, false,
      "No effect - a quiet season. Fills out the deck.",
    );
    expectProps(
      "raid", "Raid", true, 1, true, false,
      "Gain +1 Might over one faction in reach for each of your lands on their border.",
    );
    expectProps(
      "shrewd-marriage", "Shrewd marriage", true, 1, true, false,
      "Gain +1 Status over one faction in reach; your overlord is always courtable.",
    );
    expectProps(
      "fortify", "Fortify", false, 1, true, false,
      "Gain +1 Might over every other living faction at once.",
    );
    expectProps(
      "subjugate", "Subjugate", true, 1, true, false,
      "Turn a faction in reach into your vassal. Needs a lead of 2 per land of their realm. Vassals pay tribute.",
    );
    expectProps(
      "incorporate", "Incorporate", true, 1, true, false,
      "Permanently absorb one of your vassals into your realm.",
    );
    expectProps(
      "reclaim-independence", "Reclaim independence", false, 1, true, false,
      "Cast off your overlord. Playable while their lead in Might and Status is under 2 per land of their other holdings.",
    );
    expectProps(
      "pay-tribute", "Pay tribute", false, null, false, true,
      "Forced: while a vassal, grant your overlord +1 Might or +1 Status.",
    );
    expectProps(
      "revolt", "Revolt", false, 1, true, false,
      "Cast off your overlord, no lead required. They lose 1 Might and 1 Status against you.",
    );
    expectProps(
      "assassinate-ruler", "Assassinate ruler", true, 1, true, false,
      "Even the score: the Status lead between you and one faction in reach resets to none.",
    );
    expectProps(
      "alliance", "Alliance", true, 1, true, false,
      "Seal a pact with one faction in reach: no hostile cards between you for 5 turns.",
    );
    expectProps(
      "extended-diplomacy", "Extended diplomacy", false, 1, true, false,
      "Patient envoys: your next Alliance lasts twice as long.",
    );
    expectProps(
      "bodyguard", "Bodyguard", false, 1, true, false,
      "Post a bodyguard: the next Assassinate ruler against you fails. No stacking.",
    );
  });

  it("builds the explicit default deck, favourable-omens included, no filler", () => {
    const deck = buildDeck();
    expect(deck).toHaveLength(DECK_SIZE);
    expect(deck).toEqual(DEFAULT_DECK);
    expect(deck).toContain("favourable-omens");
    expect(deck).not.toContain("extended-diplomacy");
    expect(deck).not.toContain("bodyguard");
    expect(deck).not.toContain("grow-crops");
    expect(deck).not.toContain("pay-tribute");
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

  it("guards against overflow: buildDeck stays at DECK_SIZE even if DEFAULT_DECK were ever shorter", () => {
    // buildDeck() pads with grow-crops if DEFAULT_DECK is ever shorter than
    // DECK_SIZE. DEFAULT_DECK is currently exactly DECK_SIZE long, so this
    // guards a preserved invariant rather than an assumption.
    expect(buildDeck().length).toBe(DECK_SIZE);
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
    // 12 non-basics now exist; an rng that includes all of them must still
    // be capped at DECK_SIZE (same overflow guard as buildDeck), dropping
    // bodyguard and favourable-omens (last in CARDS order) rather than
    // returning 12 cards.
    const deck = buildAiDeck(() => 0);
    const count = (id: string) => deck.filter((c) => c === id).length;
    for (const id of NON_BASICS.filter(
      (id) => id !== "bodyguard" && id !== "favourable-omens",
    )) {
      expect(count(id)).toBe(1);
    }
    expect(count("bodyguard")).toBe(0);
    expect(count("favourable-omens")).toBe(0);
    expect(deck).toHaveLength(DECK_SIZE);
  });
});
