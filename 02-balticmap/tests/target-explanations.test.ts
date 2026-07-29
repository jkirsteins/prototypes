import { describe, expect, it } from "vitest";
import {
  cardModifierLines,
  explainTargetEligibility,
} from "../src/target-explanations";
import type { TargetEligibility } from "../src/playability";

const nameOf = (id: string): string =>
  id.charAt(0).toUpperCase() + id.slice(1);

describe("explainTargetEligibility", () => {
  it("labels an available candidate", () => {
    expect(explainTargetEligibility([
      { state: "available", factionId: "beta" },
    ], nameOf)).toEqual([{
      factionId: "beta",
      available: true,
      lines: ["Beta", "Available."],
    }]);
  });

  it("preserves multiple blocker order and formats scaled lead values", () => {
    expect(explainTargetEligibility([{
      state: "blocked",
      factionId: "gamma",
      reasons: [
        { code: "alliance", expiresTurn: 12 },
        {
          code: "insufficient-lead",
          requiredLead: 4,
          mightLead: 1,
          statusLead: 0,
          realmSize: 2,
        },
      ],
    }], nameOf)).toEqual([{
      factionId: "gamma",
      available: false,
      lines: [
        "Gamma",
        "Blocked by Alliance until turn 12.",
        "Need a Might or Status lead of 4 because their realm has 2 lands.",
        "Current leads: Might 1, Status 0.",
      ],
    }]);
  });

  it("uses singular copy for a one-land realm", () => {
    expect(explainTargetEligibility([{
      state: "blocked",
      factionId: "alpha",
      reasons: [{
        code: "insufficient-lead",
        requiredLead: 2,
        mightLead: 0,
        statusLead: 1,
        realmSize: 1,
      }],
    }], nameOf)[0]?.lines).toEqual([
      "Alpha",
      "Need a Might or Status lead of 2 because their realm has 1 land.",
      "Current leads: Might 0, Status 1.",
    ]);
  });

  it("omits irrelevant candidates", () => {
    expect(explainTargetEligibility([
      { state: "irrelevant", factionId: "delta" },
    ], nameOf)).toEqual([]);
  });

  it("formats each relationship and identity blocker", () => {
    expect(explainTargetEligibility([{
      state: "blocked",
      factionId: "beta",
      reasons: [
        { code: "already-vassal" },
        { code: "actor-subjugated" },
        { code: "overlord-prohibited" },
        { code: "incorporated" },
        { code: "self" },
        { code: "not-your-vassal" },
      ],
    }], nameOf)[0]?.lines).toEqual([
      "Beta",
      "Already your vassal.",
      "Unavailable while you are subjugated.",
      "You cannot target your overlord.",
      "Already incorporated.",
      "You cannot target yourself.",
      "Not your vassal.",
    ]);
  });

  it("appends annotation lines to available targets only", () => {
    const entries: TargetEligibility[] = [
      { state: "available", factionId: "alpha" },
      { state: "blocked", factionId: "beta", reasons: [{ code: "self" }] },
    ];
    const out = explainTargetEligibility(entries, (id) => id, () => ["+3 Might"]);
    expect(out[0].lines).toEqual(["alpha", "Available.", "+3 Might"]);
    expect(out[1].lines).not.toContain("+3 Might");
  });

  it("annotates nothing when no annotator is given", () => {
    const entries: TargetEligibility[] = [{ state: "available", factionId: "alpha" }];
    expect(explainTargetEligibility(entries, (id) => id)[0].lines)
      .toEqual(["alpha", "Available."]);
  });
});

describe("cardModifierLines", () => {
  const none = { omens: [], diplomacyBoost: [], bodyguards: [] };

  it("says nothing when no modifier is active", () => {
    expect(cardModifierLines(none, "alpha", "raid")).toEqual([]);
    expect(cardModifierLines(none, "alpha", "alliance")).toEqual([]);
    expect(cardModifierLines(none, "alpha", "bodyguard")).toEqual([]);
  });

  it("marks a doublable card while a reading is held", () => {
    const v = { ...none, omens: ["alpha"] };
    expect(cardModifierLines(v, "alpha", "raid"))
      .toEqual(["Favourable omens: this card counts double."]);
    expect(cardModifierLines(v, "alpha", "pay-tribute"))
      .toEqual(["Favourable omens: this card counts double."]);
  });

  it("leaves a card with nothing to double unmarked", () => {
    const v = { ...none, omens: ["alpha"] };
    expect(cardModifierLines(v, "alpha", "subjugate")).toEqual([]);
  });

  it("says a reading is already in hand", () => {
    expect(cardModifierLines({ ...none, omens: ["alpha"] }, "alpha", "favourable-omens"))
      .toEqual(["A reading is already in hand."]);
  });

  it("says an Alliance will run long", () => {
    expect(
      cardModifierLines({ ...none, diplomacyBoost: ["alpha"] }, "alpha", "alliance"),
    ).toEqual(["Extended diplomacy: this Alliance lasts 10 turns."]);
  });

  it("says a bodyguard is already posted", () => {
    expect(cardModifierLines({ ...none, bodyguards: ["alpha"] }, "alpha", "bodyguard"))
      .toEqual(["A bodyguard is already posted."]);
  });

  it("ignores another faction's modifiers", () => {
    const v = { omens: ["beta"], diplomacyBoost: ["beta"], bodyguards: ["beta"] };
    expect(cardModifierLines(v, "alpha", "raid")).toEqual([]);
    expect(cardModifierLines(v, "alpha", "alliance")).toEqual([]);
    expect(cardModifierLines(v, "alpha", "bodyguard")).toEqual([]);
  });
});
