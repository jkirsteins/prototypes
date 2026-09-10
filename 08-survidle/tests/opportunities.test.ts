import { describe, expect, it } from "vitest";
import {
  discoverOpportunity,
  newOpportunities,
  opportunityGroupView,
  applyOpportunityEvent,
  opportunityDef,
  opportunityEligible,
  setCurrentOpportunity,
} from "../src/sim/opportunities";
import type { OpportunityDef } from "../src/sim/types";

describe("opportunity focus", () => {
  it("credits a discovered opportunity while another leaf is current", () => {
    const opportunities = newOpportunities("winter");
    discoverOpportunity(opportunities, "drink", 0);
    discoverOpportunity(opportunities, "firewood", 0);
    setCurrentOpportunity(opportunities, "drink");
    applyOpportunityEvent(opportunities, { kind: "gathered", item: "firewood", kg: 10 }, 1);
    expect(opportunities.completedAt.firewood).toBe(1);
    expect(opportunities.current).toBe("drink");
  });

  it("does not replay an event from before discovery", () => {
    const opportunities = newOpportunities("winter");
    applyOpportunityEvent(opportunities, { kind: "drank" }, 1);
    discoverOpportunity(opportunities, "drink", 2);
    expect(opportunities.completedAt.drink).toBeUndefined();
  });

  it("keeps a group incomplete while an unknown child remains", () => {
    const opportunities = newOpportunities("winter");
    discoverOpportunity(opportunities, "season:spring", 0);
    opportunities.completedAt["season:spring"] = 1;
    expect(opportunityGroupView(opportunities, "seasons")).toMatchObject({ done: false });
  });

  it("reports a completed group only on the event that completes its last child", () => {
    const opportunities = newOpportunities("winter");
    for (const season of ["spring", "summer", "autumn"] as const) {
      opportunities.completedAt[`season:${season}`] = 1;
    }
    applyOpportunityEvent(opportunities, { kind: "season", season: "winter" }, 2);
    expect(applyOpportunityEvent(opportunities, { kind: "drank" }, 3).completedGroups).toEqual([]);
    expect(opportunities.notices.filter((notice) => notice.completedGroups.includes("seasons"))).toHaveLength(1);
  });

  it("uses the one-based calendar day at day 8 and day 31 boundaries", () => {
    const gated: OpportunityDef = { key: "site", title: "gated", category: "survival", notBeforeDay: 8, steps: [] };
    expect(opportunityEligible(gated, 9600 - 1)).toBe(false);
    expect(opportunityEligible(gated, 9600)).toBe(true);
    gated.notBeforeDay = 31;
    expect(opportunityEligible(gated, 42720 - 1)).toBe(false);
    expect(opportunityEligible(gated, 42720)).toBe(true);
  });

  it("does not materialize unsupported definitions", () => {
    expect(opportunityDef("fire")).toBeUndefined();
    expect(opportunityDef("hunt:deer")).toBeUndefined();
  });
});
