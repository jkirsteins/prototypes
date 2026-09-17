import { expect, it } from "vitest";
import { newGame } from "../src/sim/newgame";
import { cellOf } from "../src/sim/position";
import { regionState } from "../src/sim/regionstate";
import { allOpportunityDefs, discoverOpportunity, recordOpportunityEvent, setCurrentOpportunity } from "../src/sim/opportunities";
import { opportunityPanelHtml } from "../src/ui/opportunity-panel";

it("shows only the current leaf and keeps the catalog available with no current", () => {
  const { state, world } = newGame(3);
  regionState(state, world, state.player.region).campCell = cellOf(state, world);
  discoverOpportunity(state.opportunities, "build:firePit", 0, false);
  setCurrentOpportunity(state.opportunities, "build:firePit");
  expect(opportunityPanelHtml(state)).toContain("fire site");
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
  // The card goes to the row its opportunity is asking for. It used to open
  // the catalogue, which left the player to find the row themselves.
  const button = document.querySelector<HTMLButtonElement>('[data-act="opportunity-goto"]')!;
  expect(button.tagName).toBe("BUTTON");
  expect(button.dataset.opportunity).toBe("fire");
  // The fire site is its own rung before firewood now, not a step of the fire.
  expect(button.textContent).not.toContain("Build the fire site");
  // Each step names a row in the Do panel, in the order the rows come due.
  expect(button.textContent).toContain("[ ] Fuel the fire site");
  expect(button.textContent).toContain("[ ] Have a fire drill");
  expect(button.textContent).toContain("Current");
});

it("retains the entry point after all leaves complete and exposes no stale hidden current", () => {
  const { state, world } = newGame(3);
  regionState(state, world, state.player.region).campCell = cellOf(state, world);
  state.opportunities.current = "track:elk";
  expect(opportunityPanelHtml(state)).not.toContain("elk");
  for (const def of allOpportunityDefs()) state.opportunities.completedAt[def.key] = 1;
  state.opportunities.current = null;
  expect(opportunityPanelHtml(state)).toContain("No current opportunity");
  expect(opportunityPanelHtml(state)).toContain('data-act="opportunity-open"');
});

/**
 * `site` completes once per world. An heir who lands somewhere with no camp
 * therefore has nothing current, and the card used to say so - which left
 * the one survivor whose first job is unambiguous with a blank card.
 */
it("tells a survivor with no camp to choose where to live, whatever the world has ticked", () => {
  const { state } = newGame(3);
  state.opportunities.completedAt.site = 1;
  state.opportunities.current = null;
  const html = opportunityPanelHtml(state);
  expect(html).toContain("Choose where to live");
  expect(html).toContain('data-opportunity="site"');
  expect(html).not.toContain("No current opportunity");
  // The world's checklist is ticked; it is not shown, because it is not this survivor's.
  expect(html).not.toContain("[x]");
});
