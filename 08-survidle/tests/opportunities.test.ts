import { describe, expect, it } from "vitest";
import {
  discoverOpportunity,
  newOpportunities,
  opportunityGroupView,
  applyOpportunityEvent,
  setCurrentOpportunity,
} from "../src/sim/opportunities";

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
});
