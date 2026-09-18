/**
 * Waiting is not a goal.
 *
 * "'drink' is a useless opportunity" - the self-care row drinks on its own,
 * and as the second rung it held the fire behind it. An FYI is discovered
 * like any other and shown with its note, but it is complete the moment it
 * is told, is never current, and never holds a later rung. The fire site is
 * the second rung now, and firewood and the fire follow it.
 */
import { describe, expect, it } from "vitest";
import { calendar } from "../src/sim/calendar";
import { newGame } from "../src/sim/newgame";
import { discoverAvailableOpportunities, dismissOpportunityPresentation, isOpportunityComplete, isOpportunityDiscovered, opportunityDef, recordOpportunityEvent, refreshOpportunities, setCurrentOpportunity } from "../src/sim/opportunities";
import { cellOf } from "../src/sim/position";
import { regionState } from "../src/sim/regionstate";
import type { TaskId } from "../src/sim/types";

function camped() {
  const { state, world } = newGame(17);
  regionState(state, world, state.player.region).campCell = cellOf(state, world);
  recordOpportunityEvent(state, { kind: "task", id: "makeCamp" as TaskId });
  discoverAvailableOpportunities(state, world, calendar(state.minute, state.startDoy), false);
  return { state, world };
}

describe("an FYI", () => {
  it("is told with the camp and is done the moment it is told", () => {
    const { state } = camped();
    expect(opportunityDef("drink")?.fyi).toBe(true);
    expect(isOpportunityDiscovered(state.opportunities, "drink")).toBe(true);
    expect(isOpportunityComplete(state.opportunities, "drink")).toBe(true);
  });

  it("is never current", () => {
    const { state } = camped();
    expect(setCurrentOpportunity(state.opportunities, "drink")).toBe(false);
    expect(state.opportunities.current).not.toBe("drink");
  });

  it("does not hold a later rung: the seasons are lived through, not achieved", () => {
    const { state } = newGame(17);
    for (const season of ["spring", "summer", "autumn", "winter"] as const) {
      expect(opportunityDef(`season:${season}`)?.fyi).toBe(true);
      expect(isOpportunityComplete(state.opportunities, `season:${season}`)).toBe(true);
    }
  });
});

describe("the opening spine", () => {
  it("puts the fire site second, and makes it current", () => {
    const { state } = camped();
    expect(isOpportunityDiscovered(state.opportunities, "build:firePit")).toBe(true);
    expect(state.opportunities.current).toBe("build:firePit");
  });

  it("holds firewood behind the fire site, not behind drinking", () => {
    expect(opportunityDef("firewood")?.prerequisites).toEqual(["build:firePit"]);
    const { state } = camped();
    expect(isOpportunityDiscovered(state.opportunities, "firewood")).toBe(false);
    recordOpportunityEvent(state, { kind: "built", structure: "firePit" });
    expect(isOpportunityDiscovered(state.opportunities, "firewood")).toBe(true);
  });
});

describe("an FYI left open by an older save", () => {
  /**
   * A world saved before the seasons were FYIs has them discovered and
   * not complete. With no steps they would complete on the first event of
   * any kind and be announced - four seasons lived through on the day a
   * camp was sited. They are closed without a word instead.
   */
  it("is closed silently, never announced, and its group is no achievement", () => {
    const { state } = newGame(17);
    for (const season of ["spring", "summer", "autumn", "winter"] as const) delete state.opportunities.completedAt[`season:${season}`];
    state.opportunities.notices = [];
    recordOpportunityEvent(state, { kind: "task", id: "makeCamp" as TaskId });
    const announced = state.opportunities.notices.flatMap((n) => [...n.completed, ...n.completedGroups]);
    expect(announced).not.toEqual(expect.arrayContaining(["season:spring"]));
    expect(announced).not.toContain("seasons");
    expect(isOpportunityComplete(state.opportunities, "season:spring")).toBe(true);
  });
});

describe("something open is current whenever something open exists", () => {
  /**
   * The fire and the firewood arrive together after the pit: a choice the
   * notice offers. OK without choosing settles on the first; when the
   * firewood is done the fire steps forward. The card never says "No
   * current opportunity" beside a half-ticked goal.
   */
  it("settles an unmade choice on the first offered goal, and steps the next open goal forward on completion", () => {
    const { state } = camped();
    recordOpportunityEvent(state, { kind: "built", structure: "firePit" });
    const notice = state.opportunities.notices.at(-1)!;
    expect(notice.discovered).toEqual(expect.arrayContaining(["firewood", "fire"]));
    expect(state.opportunities.current).toBeNull();
    expect(dismissOpportunityPresentation(state, notice.id, null)).toBe(true);
    expect(state.opportunities.current).toBe("firewood");
    for (let i = 0; i < 10; i++) recordOpportunityEvent(state, { kind: "gathered", item: "firewood", kg: 1 });
    expect(isOpportunityComplete(state.opportunities, "firewood")).toBe(true);
    expect(state.opportunities.current).toBe("fire");
  });
});

describe("a loaded save", () => {
  it("settles an open goal on the next refresh when nothing is current and no choice is pending", () => {
    const { state } = camped();
    recordOpportunityEvent(state, { kind: "built", structure: "firePit" });
    // OK was never pressed on the old save: the notice is gone and current is empty.
    state.opportunities.notices = [];
    state.opportunities.current = null;
    refreshOpportunities(state);
    expect(state.opportunities.current).toBe("firewood");
  });
});

describe("the vedbod", () => {
  it("arrives with the firewood goal, so keeping wood dry is on the board while the wood is", () => {
    const { state } = camped();
    expect(isOpportunityDiscovered(state.opportunities, "build:vedbod")).toBe(false);
    recordOpportunityEvent(state, { kind: "built", structure: "firePit" });
    expect(isOpportunityDiscovered(state.opportunities, "build:vedbod")).toBe(true);
    expect(opportunityDef("firewood")?.note).toContain("vedbod");
  });
});
