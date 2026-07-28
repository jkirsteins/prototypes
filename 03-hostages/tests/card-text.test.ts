import { describe, it, expect } from "vitest";
import { summarize, requirementText } from "../src/content/card-text";
import { cardById, ALL_CARDS } from "../src/content/cards";

describe("summarize", () => {
  it("compresses damage by target", () => {
    expect(summarize(cardById("kickHisKnee"))).toContain("-3 his vig");
  });

  it("names the state a card sets", () => {
    expect(summarize(cardById("kickHisKnee"))).toContain("off-balance");
  });

  it("describes a card that only frees you", () => {
    expect(summarize(cardById("wiggleOut"))).toBe("hands free");
  });

  it("describes a card that only topples you", () => {
    expect(summarize(cardById("rockTheChair"))).toBe("you fall");
  });

  it("returns a non-empty line for every card in the game", () => {
    for (const card of ALL_CARDS) {
      expect(summarize(card).length, `${card.id} has no summary`).toBeGreaterThan(0);
    }
  });

  it("stays short enough for a card face", () => {
    for (const card of ALL_CARDS) {
      expect(summarize(card).length, `${card.id} summary too long`).toBeLessThanOrEqual(46);
    }
  });

  it("uses no em dashes or unicode", () => {
    for (const card of ALL_CARDS) {
      expect(summarize(card)).not.toMatch(/[—→←…•]/);
    }
  });
});

describe("requirementText", () => {
  it("is empty when a card has no requirements", () => {
    expect(requirementText({})).toBe("");
  });

  it("phrases a single requirement", () => {
    expect(requirementText({ bound: true })).toBe("Needs: you are bound.");
  });

  it("joins several requirements with commas", () => {
    const text = requirementText({ range: "near", convictDistractedOrOffBalance: true });
    expect(text).toBe("Needs: he is near, he is distracted or off-balance.");
  });

  it("covers every requirement key used by the real cards", () => {
    for (const card of ALL_CARDS) {
      const keys = Object.keys(card.requires);
      if (keys.length === 0) continue;
      expect(requirementText(card.requires).length, `${card.id}`).toBeGreaterThan(0);
    }
  });
});
