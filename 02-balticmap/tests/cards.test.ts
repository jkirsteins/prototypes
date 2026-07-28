import { describe, it, expect } from "vitest";
import { CARDS, DECK_SIZE, buildDeck, buildAiDeck, shuffle, type Rng } from "../src/cards";

const NON_BASICS = [
  "raid", "shrewd-marriage", "fortify", "subjugate",
  "incorporate", "reclaim-independence", "revolt",
  "assassinate-ruler", "alliance", "extended-diplomacy",
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
      "Gain +1 Might over one faction in reach of your realm.",
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
  });

  it("builds the 10-card default deck: 10 non-basics once each, no filler", () => {
    const deck = buildDeck();
    expect(deck).toHaveLength(DECK_SIZE);
    const count = (id: string) => deck.filter((c) => c === id).length;
    for (const id of NON_BASICS) {
      expect(count(id)).toBe(1);
    }
    expect(count("grow-crops")).toBe(0);
    expect(count("pay-tribute")).toBe(0);
  });

  it("guards against overflow: buildDeck stays at DECK_SIZE even if CARDS grows past 10 non-basics", () => {
    // Simulate CARDS gaining an 11th deck-buildable non-basic without anyone
    // remembering to bump DECK_SIZE. buildDeck() must slice to DECK_SIZE
    // rather than silently returning an oversized deck that chooseDeck rejects.
    const overflowId = "__test-overflow-card";
    (CARDS as Record<string, (typeof CARDS)[string]>)[overflowId] = {
      id: overflowId, name: "Overflow", targeted: false,
      maxPerDeck: 1, deckBuildable: true, forced: false, text: "",
    };
    try {
      expect(buildDeck().length).toBe(DECK_SIZE);
    } finally {
      delete (CARDS as Record<string, (typeof CARDS)[string]>)[overflowId];
    }
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

  it("an rng that always returns >= 0.5 yields an all-filler deck", () => {
    const deck = buildAiDeck(() => 0.5);
    expect(deck).toEqual(Array.from({ length: DECK_SIZE }, () => "grow-crops"));
  });

  it("an rng that always returns < 0.5 includes every non-basic once", () => {
    const deck = buildAiDeck(() => 0);
    const count = (id: string) => deck.filter((c) => c === id).length;
    for (const id of NON_BASICS) expect(count(id)).toBe(1);
    expect(deck).toHaveLength(DECK_SIZE);
  });
});
