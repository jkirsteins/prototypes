import { describe, expect, it } from "vitest";
import {
  discoverOpportunity,
  newOpportunities,
  opportunityGroupView,
  applyOpportunityEvent,
  opportunityDef,
  opportunityEligible,
  setCurrentOpportunity,
  recordOpportunityEvent,
  OPPORTUNITY_GROUPS,
} from "../src/sim/opportunities";
import { newGame } from "../src/sim/newgame";
import type { OpportunityDef } from "../src/sim/types";

describe("opportunity focus", () => {
  it("clears completed current before selecting its single discovered successor", () => {
    const { state } = newGame(3);
    discoverOpportunity(state.opportunities, "track:deer", 0, false);
    setCurrentOpportunity(state.opportunities, "track:deer");
    recordOpportunityEvent(state, { kind: "signFound", species: "deer" });
    expect(state.opportunities.current).toBe("hunt:deer");
  });

  it("batches the last child, group completion, and successor exactly once", () => {
    const opportunities = newOpportunities("spring");
    opportunities.notices = [];
    const group = OPPORTUNITY_GROUPS.find((entry) => entry.id === "track-animals")!;
    for (const key of group.keys) {
      discoverOpportunity(opportunities, key, 0, false);
      if (key !== "track:deer") opportunities.completedAt[key] = 0;
    }
    // Discover the earlier children's successors before the event under test.
    applyOpportunityEvent(opportunities, { kind: "drank" }, 1);
    opportunities.notices = [];
    applyOpportunityEvent(opportunities, { kind: "signFound", species: "deer" }, 2);
    expect(opportunities.notices).toHaveLength(1);
    expect(opportunities.notices[0]).toMatchObject({ completed: ["track:deer"], completedGroups: ["track-animals"], discovered: ["hunt:deer"], messages: [] });
    const before = structuredClone(opportunities.notices);
    applyOpportunityEvent(opportunities, { kind: "signFound", species: "deer" }, 2);
    applyOpportunityEvent(opportunities, { kind: "speciesSeen", species: "deer" }, 2);
    expect(opportunities.notices).toEqual(before);
  });

  it("discovers authored parallel leaves only after their prerequisite chain", () => {
    const { state } = newGame(3);
    expect(state.opportunities.discoveredAt.site).toBeDefined();
    recordOpportunityEvent(state, { kind: "task", id: "makeCamp" });
    expect(state.opportunities.discoveredAt.drink).toBeDefined();
    recordOpportunityEvent(state, { kind: "drank" });
    recordOpportunityEvent(state, { kind: "gathered", item: "firewood", kg: 10 });
    recordOpportunityEvent(state, { kind: "built", structure: "firePit" });
    recordOpportunityEvent(state, { kind: "fuelled" });
    recordOpportunityEvent(state, { kind: "crafted", recipe: "fireDrill" });
    recordOpportunityEvent(state, { kind: "lit" });
    expect(Object.keys(state.opportunities.discoveredAt)).toEqual(expect.arrayContaining(["bed", "roof", "keptNight"]));
    expect(state.opportunities.discoveredAt.cook).toBeUndefined();
  });

  it("requires a hunt before a later generic preservation event", () => {
    const state = newOpportunities("spring");
    discoverOpportunity(state, "preserveHunt", 0);
    applyOpportunityEvent(state, { kind: "preserved" }, 1);
    applyOpportunityEvent(state, { kind: "animalKilled", species: "deer" }, 2);
    expect(state.completedAt.preserveHunt).toBeUndefined();
    applyOpportunityEvent(state, { kind: "preserved" }, 3);
    expect(state.completedAt.preserveHunt).toBe(3);
  });

  it("keeps a running weather reservation when completed refuge work happens again", () => {
    const { state } = newGame(3);
    discoverOpportunity(state.opportunities, "remoteRefuge", 0);
    state.opportunities.context.chapter3HomeRegion = state.player.region;
    const event = { kind: "protectionChanged", minute: 0, region: state.player.region + 1, cell: 1, from: 1, to: 2, source: "improved" } as const;
    recordOpportunityEvent(state, event);
    state.opportunities.context.weather!.stormId = 42;
    state.opportunities.context.weather!.status = "running";
    recordOpportunityEvent(state, event);
    expect(state.opportunities.context.weather).toMatchObject({ stormId: 42, status: "running" });
  });

  it("continues an inherited remote chapter without waiting another thirty-one days", () => {
    const { state } = newGame(3);
    state.minute = 42720;
    discoverOpportunity(state.opportunities, "remoteRefuge", state.minute);
    state.opportunities.context.chapter3HomeRegion = state.player.region;
    recordOpportunityEvent(state, { kind: "protectionChanged", minute: state.minute, region: state.player.region + 1, cell: 1, from: 1, to: 2, source: "improved" });
    state.minute = 0;
    recordOpportunityEvent(state, { kind: "fireLit", minute: 0, region: state.player.region + 1, cell: 1, atCamp: false });
    expect(state.opportunities.discoveredAt.fieldMeal).toBe(0);
    recordOpportunityEvent(state, { kind: "taskCompleted", id: "cook", minute: 0, region: state.player.region + 1, cell: 1, atCamp: false });
    expect(state.opportunities.discoveredAt.remoteStorm).toBe(0);
  });
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

  it("credits an inherited discovery after the life clock resets", () => {
    const opportunities = newOpportunities("winter");
    discoverOpportunity(opportunities, "firewood", 9000);
    applyOpportunityEvent(opportunities, { kind: "gathered", item: "firewood", kg: 4 }, 9001);
    applyOpportunityEvent(opportunities, { kind: "gathered", item: "firewood", kg: 6 }, 1);
    expect(opportunities.discoveredAt.firewood).toBe(9000);
    expect(opportunities.completedAt.firewood).toBe(1);
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
    expect(opportunityDef("hunt:hare")).toBeUndefined();
  });
});
