import { expect, it } from "vitest";
import { newGame } from "../src/sim/newgame";
import { allOpportunityDefs, discoverOpportunity, recordOpportunityEvent, setCurrentOpportunity } from "../src/sim/opportunities";
import { opportunityPanelHtml } from "../src/ui/opportunity-panel";

it("shows only the current leaf and keeps the catalog available with no current", () => {
  const { state } = newGame(3);
  discoverOpportunity(state.opportunities, "drink", 0, false);
  setCurrentOpportunity(state.opportunities, "drink");
  expect(opportunityPanelHtml(state)).toContain("Drink water");
  expect(opportunityPanelHtml(state)).not.toContain("Choose where to live");
  setCurrentOpportunity(state.opportunities, null);
  expect(opportunityPanelHtml(state)).toContain("No current opportunity");
  expect(opportunityPanelHtml(state)).toContain("View all opportunities");
});

it("opens title and checklist with one keyboard button and reads stored progress", () => {
  const { state } = newGame(3);
  discoverOpportunity(state.opportunities, "fire", 0, false);
  setCurrentOpportunity(state.opportunities, "fire");
  recordOpportunityEvent(state, { kind: "built", structure: "firePit" });
  document.body.innerHTML = opportunityPanelHtml(state);
  const button = document.querySelector<HTMLButtonElement>('[data-act="opportunity-detail"]')!;
  expect(button.tagName).toBe("BUTTON");
  expect(button.dataset.opportunity).toBe("fire");
  expect(button.textContent).toContain("[x] Establish a fire site");
  expect(button.textContent).toContain("[ ] Provide ignition");
  expect(button.textContent).toContain("Current");
});

it("retains the entry point after all leaves complete and exposes no stale hidden current", () => {
  const { state } = newGame(3);
  state.opportunities.current = "track:elk";
  expect(opportunityPanelHtml(state)).not.toContain("elk");
  for (const def of allOpportunityDefs()) state.opportunities.completedAt[def.key] = 1;
  state.opportunities.current = null;
  expect(opportunityPanelHtml(state)).toContain("No current opportunity");
  expect(opportunityPanelHtml(state)).toContain('data-act="opportunity-open"');
});
