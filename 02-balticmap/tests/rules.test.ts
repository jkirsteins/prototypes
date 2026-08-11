import { describe, it, expect } from "vitest";
import {
  DEFAULT_RULES, RULE_AXES, RULES_PREFS_KEY, loadRulesPrefs,
  mergeRules, saveRulesPrefs, summarizeRules, sweepsHandAtTurnEnd,
} from "../src/rules";
import { memoryStorage } from "../src/meta";

describe("RULE_AXES", () => {
  it("every axis's default is one of its options, and ids are unique", () => {
    const axisIds = RULE_AXES.map((a) => a.id);
    expect(new Set(axisIds).size).toBe(axisIds.length);
    for (const axis of RULE_AXES) {
      const ids = axis.options.map((o) => o.id);
      expect(new Set(ids).size).toBe(ids.length);
      expect(ids).toContain(axis.defaultOption);
      expect(DEFAULT_RULES[axis.id]).toBe(axis.defaultOption);
    }
  });

  it("carries the turn and hand axes - copies retired with the deck picker", () => {
    expect(RULE_AXES.map((a) => a.id)).toEqual(["turn", "hand"]);
    expect(DEFAULT_RULES).toEqual({ turn: "standard", hand: "keep" });
  });
});

describe("turn option text", () => {
  // The old version of this pinned the "4" in the unlimited option against
  // HAND_REFILL, so the prose could not drift from the constant. The hand size
  // is `handLimitFor` now and moves with the realm, so no number written here
  // could be true for long - the guard is therefore that BOTH options name no
  // number at all. It also closes the hole the old one left: the identical 4
  // in the standard option was never covered.
  it("promises no hand size, on either option", () => {
    for (const option of RULE_AXES.find((a) => a.id === "turn")!.options) {
      expect(option.text).not.toMatch(/\d/);
    }
  });
});

describe("sweepsHandAtTurnEnd", () => {
  it("is off by default and on under the sweeping pick", () => {
    expect(sweepsHandAtTurnEnd(DEFAULT_RULES)).toBe(false);
    expect(sweepsHandAtTurnEnd({ ...DEFAULT_RULES, hand: "sweep" })).toBe(true);
  });
});

describe("mergeRules", () => {
  it("keeps a known pick and drops an unknown axis or option", () => {
    expect(mergeRules({ turn: "unlimited", bogus: "x" }))
      .toEqual({ ...DEFAULT_RULES, turn: "unlimited" });
    expect(mergeRules({ turn: "gone" })).toEqual(DEFAULT_RULES);
  });

  it("drops a retired copies pick without ceremony", () => {
    // Stored prefs from before the axis retired name it; the unknown-axis
    // rule is what lets them degrade to defaults instead of wedging boot.
    expect(mergeRules({ copies: "double" })).toEqual(DEFAULT_RULES);
    expect(mergeRules({ turn: "unlimited", copies: "double" }))
      .toEqual({ ...DEFAULT_RULES, turn: "unlimited" });
  });
});

describe("rules prefs", () => {
  it("round-trips through storage", () => {
    const s = memoryStorage();
    saveRulesPrefs(s, { ...DEFAULT_RULES, turn: "unlimited" });
    expect(loadRulesPrefs(s)).toEqual({ ...DEFAULT_RULES, turn: "unlimited" });
  });

  it("absent, corrupt or stale storage yields defaults", () => {
    const s = memoryStorage();
    expect(loadRulesPrefs(s)).toEqual(DEFAULT_RULES);
    s.setItem(RULES_PREFS_KEY, "not json");
    expect(loadRulesPrefs(s)).toEqual(DEFAULT_RULES);
    s.setItem(RULES_PREFS_KEY, JSON.stringify({ turn: "gone" }));
    expect(loadRulesPrefs(s)).toEqual(DEFAULT_RULES);
  });

  it("a pre-flip record naming copies loads with the pick kept and the axis dropped", () => {
    const s = memoryStorage();
    s.setItem(RULES_PREFS_KEY, JSON.stringify({ turn: "unlimited", copies: "double" }));
    expect(loadRulesPrefs(s)).toEqual({ ...DEFAULT_RULES, turn: "unlimited" });
  });
});

describe("summarizeRules", () => {
  it("names the picked option per axis", () => {
    expect(summarizeRules(DEFAULT_RULES)).toBe("One card per turn, Keep your hand");
    expect(summarizeRules({ ...DEFAULT_RULES, turn: "unlimited" }))
      .toBe("Unlimited plays, Keep your hand");
  });
});
