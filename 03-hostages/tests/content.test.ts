import { describe, it, expect } from "vitest";
import {
  ALL_CARDS,
  cardById,
  CONVICT_DECK,
  NOT_YET_ID,
  PLAYER_DECK,
  SECRETS,
  VICTORY_CARD_ID,
} from "../src/content/cards";
import { OPENING } from "../src/content/scenario";

describe("content", () => {
  it("has unique card ids", () => {
    const ids = ALL_CARDS.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("gives every card rules, flavor and narration", () => {
    for (const card of ALL_CARDS) {
      expect(card.rules.length, card.id).toBeGreaterThan(0);
      expect(card.flavor.length, card.id).toBeGreaterThan(0);
      expect(card.narration.length, card.id).toBeGreaterThan(0);
    }
  });

  it("uses no em dashes or fancy unicode in player-facing text", () => {
    const banned = /[—–‘’“”…→←•]/;
    for (const card of ALL_CARDS) {
      expect(banned.test(card.rules + card.flavor + card.narration + card.name), card.id).toBe(
        false,
      );
    }
    expect(banned.test(OPENING.prose)).toBe(false);
    for (const choice of OPENING.choices) {
      expect(banned.test(choice.label + choice.text)).toBe(false);
    }
  });

  it("has decks of the specified size referencing real cards", () => {
    expect(PLAYER_DECK).toHaveLength(19);
    expect(CONVICT_DECK).toHaveLength(15);
    for (const id of [...PLAYER_DECK, ...CONVICT_DECK]) {
      expect(() => cardById(id)).not.toThrow();
    }
  });

  it("keeps fixtures out of the shuffled decks", () => {
    const fixtures = [...SECRETS, VICTORY_CARD_ID, NOT_YET_ID];
    for (const id of fixtures) {
      expect(PLAYER_DECK).not.toContain(id);
      expect(CONVICT_DECK).not.toContain(id);
    }
  });

  it("only lets the player lead offensive cards and answer with defensive ones", () => {
    for (const id of PLAYER_DECK) {
      const card = cardById(id);
      expect(card.side).toBe("player");
    }
    for (const id of CONVICT_DECK) {
      expect(cardById(id).side).toBe("convict");
    }
    expect(cardById(VICTORY_CARD_ID).kind).toBe("offensive");
    for (const id of SECRETS) {
      expect(cardById(id).kind).toBe("defensive");
    }
  });

  it("marks exactly two coercion cards", () => {
    const coercers = ALL_CARDS.filter((c) => c.coercion);
    expect(coercers.map((c) => c.id).sort()).toEqual(["knifeToHerThroat", "whereIsIt"]);
  });

  it("offers three opening stances", () => {
    expect(OPENING.choices).toHaveLength(3);
    expect(new Set(OPENING.choices.map((c) => c.id)).size).toBe(3);
  });

  it("throws on an unknown id", () => {
    expect(() => cardById("nope")).toThrow(/Unknown card/);
  });
});
