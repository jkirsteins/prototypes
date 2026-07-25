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
  it("defines the four card types with targeting flags", () => {
    expect(CARDS["grow-crops"]).toEqual({ id: "grow-crops", name: "Grow crops", targeted: false });
    expect(CARDS["raid"]).toEqual({ id: "raid", name: "Raid", targeted: true });
    expect(CARDS["shrewd-marriage"]).toEqual({ id: "shrewd-marriage", name: "Shrewd marriage", targeted: true });
    expect(CARDS["incorporate"]).toEqual({ id: "incorporate", name: "Incorporate", targeted: true });
  });

  it("builds a 20-card deck: 10 grow-crops, 5 raid, 3 marriage, 2 incorporate", () => {
    const deck = buildDeck();
    expect(deck).toHaveLength(DECK_SIZE);
    const count = (id: string) => deck.filter((c) => c === id).length;
    expect(count("grow-crops")).toBe(10);
    expect(count("raid")).toBe(5);
    expect(count("shrewd-marriage")).toBe(3);
    expect(count("incorporate")).toBe(2);
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
