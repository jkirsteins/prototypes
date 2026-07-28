import { describe, expect, it } from "vitest";
import { explainTargetEligibility } from "../src/target-explanations";

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
});
