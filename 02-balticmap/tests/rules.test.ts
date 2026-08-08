import { describe, it, expect } from "vitest";
import {
  DEFAULT_RULES, RULE_AXES, RULES_PREFS_KEY, loadRulesPrefs, mergeRules,
  saveRulesPrefs, summarizeRules,
} from "../src/rules";
import { memoryStorage } from "../src/meta";
import { HAND_REFILL } from "../src/game";

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
});

describe("unlimited option text", () => {
  it("states the same refill count as HAND_REFILL in src/game.ts", () => {
    const unlimited = RULE_AXES
      .find((a) => a.id === "turn")!
      .options.find((o) => o.id === "unlimited")!;
    expect(unlimited.text).toContain(String(HAND_REFILL));
  });
});

describe("mergeRules", () => {
  it("keeps a known pick and drops an unknown axis or option", () => {
    expect(mergeRules({ turn: "unlimited", bogus: "x" }))
      .toEqual({ turn: "unlimited" });
    expect(mergeRules({ turn: "gone" })).toEqual(DEFAULT_RULES);
  });
});

describe("rules prefs", () => {
  it("round-trips through storage", () => {
    const s = memoryStorage();
    saveRulesPrefs(s, { turn: "unlimited" });
    expect(loadRulesPrefs(s)).toEqual({ turn: "unlimited" });
  });
  it("absent, corrupt or stale storage yields defaults", () => {
    const s = memoryStorage();
    expect(loadRulesPrefs(s)).toEqual(DEFAULT_RULES);
    s.setItem(RULES_PREFS_KEY, "not json");
    expect(loadRulesPrefs(s)).toEqual(DEFAULT_RULES);
    s.setItem(RULES_PREFS_KEY, JSON.stringify({ turn: "gone" }));
    expect(loadRulesPrefs(s)).toEqual(DEFAULT_RULES);
  });
});

describe("summarizeRules", () => {
  it("names the picked option per axis", () => {
    expect(summarizeRules(DEFAULT_RULES)).toBe("One card per turn");
    expect(summarizeRules({ turn: "unlimited" })).toBe("Unlimited plays");
  });
});
