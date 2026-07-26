import { describe, it, expect } from "vitest";
import { CARDS, DECK_SIZE, buildDeck, shuffle, type Rng } from "../src/cards";

function seededRng(seed: number): Rng {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

describe("cards", () => {
  it("defines the eight card types with v2 properties", () => {
    const expectProps = (
      id: string, name: string, targeted: boolean,
      maxPerDeck: number | null, deckBuildable: boolean, forced: boolean,
    ) =>
      expect(CARDS[id]).toEqual({ id, name, targeted, maxPerDeck, deckBuildable, forced });
    expectProps("grow-crops", "Grow crops", false, null, true, false);
    expectProps("raid", "Raid", true, 1, true, false);
    expectProps("shrewd-marriage", "Shrewd marriage", true, 1, true, false);
    expectProps("fortify", "Fortify", false, 1, true, false);
    expectProps("subjugate", "Subjugate", true, 1, true, false);
    expectProps("incorporate", "Incorporate", true, 1, true, false);
    expectProps("reclaim-independence", "Reclaim independence", false, 1, true, false);
    expectProps("pay-tribute", "Pay tribute", false, null, false, true);
  });

  it("builds the 10-card default deck: 6 non-basics once each + 4 grow-crops", () => {
    const deck = buildDeck();
    expect(deck).toHaveLength(DECK_SIZE);
    const count = (id: string) => deck.filter((c) => c === id).length;
    for (const id of [
      "raid", "shrewd-marriage", "fortify", "subjugate",
      "incorporate", "reclaim-independence",
    ]) {
      expect(count(id)).toBe(1);
    }
    expect(count("grow-crops")).toBe(4);
    expect(count("pay-tribute")).toBe(0);
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
