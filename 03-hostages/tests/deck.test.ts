import { describe, it, expect } from "vitest";
import { newPile, drawCard, discardCard, removeFromHand } from "../src/deck";
import { createRng } from "../src/rng";
import { HAND_CAP } from "../src/types";
import type { Pile } from "../src/types";

describe("deck", () => {
  it("builds a shuffled pile holding every card", () => {
    const pile = newPile(["a", "b", "c", "a"], createRng(1));
    expect(pile.deck).toHaveLength(4);
    expect([...pile.deck].sort()).toEqual(["a", "a", "b", "c"]);
    expect(pile.hand).toEqual([]);
    expect(pile.discard).toEqual([]);
  });

  it("draws into the hand", () => {
    const pile = newPile(["a", "b"], createRng(1));
    const drawn = drawCard(pile, createRng(1));
    expect(drawn).not.toBeNull();
    expect(pile.hand).toHaveLength(1);
    expect(pile.deck).toHaveLength(1);
  });

  it("draws past the hand cap, leaving the caller to discard down", () => {
    const pile: Pile = { deck: ["a", "b", "c", "d", "e", "f"], discard: [], hand: [] };
    const rng = createRng(1);
    for (let i = 0; i < HAND_CAP + 1; i += 1) drawCard(pile, rng);
    expect(pile.hand).toHaveLength(HAND_CAP + 1);
    expect(pile.deck).toHaveLength(0);
  });

  it("reshuffles the discard when the deck runs dry", () => {
    const pile: Pile = { deck: [], discard: ["x", "y"], hand: [] };
    const drawn = drawCard(pile, createRng(5));
    expect(drawn).not.toBeNull();
    expect(pile.discard).toEqual([]);
    expect(pile.deck).toHaveLength(1);
    expect(pile.hand).toHaveLength(1);
  });

  it("returns null when there is nothing anywhere", () => {
    const pile: Pile = { deck: [], discard: [], hand: [] };
    expect(drawCard(pile, createRng(1))).toBeNull();
  });

  it("discards one copy only", () => {
    const pile: Pile = { deck: [], discard: [], hand: ["a", "a", "b"] };
    discardCard(pile, "a");
    expect(pile.hand).toEqual(["a", "b"]);
    expect(pile.discard).toEqual(["a"]);
  });

  it("throws when discarding a card that is not held", () => {
    const pile: Pile = { deck: [], discard: [], hand: ["a"] };
    expect(() => discardCard(pile, "z")).toThrow(/not in hand/);
  });

  it("removes from hand without discarding", () => {
    const pile: Pile = { deck: [], discard: [], hand: ["a", "b"] };
    removeFromHand(pile, "a");
    expect(pile.hand).toEqual(["b"]);
    expect(pile.discard).toEqual([]);
  });
});
