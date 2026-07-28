import { describe, it, expect } from "vitest";
import type { CardDef, Effect } from "../src/types";
import { HAND_CAP, STARTING_HAND, INCAPACITATED_CLEAR_AT } from "../src/types";

describe("types", () => {
  it("accepts a well-formed card", () => {
    const card: CardDef = {
      id: "test",
      name: "Test",
      side: "player",
      kind: "offensive",
      tags: [],
      requires: {},
      effects: [{ kind: "damage", target: "convict", amount: 1 }],
      rules: "r",
      flavor: "f",
      narration: "n",
    };
    expect(card.effects[0].kind).toBe("damage");
  });

  it("exposes tuning constants", () => {
    expect(STARTING_HAND).toBe(3);
    expect(HAND_CAP).toBe(5);
    expect(INCAPACITATED_CLEAR_AT).toBe(4);
  });

  it("keeps the effect union discriminated", () => {
    const e: Effect = { kind: "setDistracted", turns: 2 };
    expect(e.kind === "setDistracted" && e.turns).toBe(2);
  });
});
