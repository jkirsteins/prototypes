import { isOpportunityComplete, isOpportunityDiscovered, opportunityDef, opportunitySteps } from "../sim/opportunities";
import type { GameState, OpportunityKey } from "../sim/types";
import { esc } from "./render";

/** Also used in details; only a discovered leaf may expose its checklist. */
export function opportunityChecklistHtml(state: GameState, key: OpportunityKey): string {
  if (!isOpportunityDiscovered(state.opportunities, key)) return "";
  // The bracket pair is a status glyph, not a checkbox. It looked like one
  // and did nothing when clicked, which is a promise the panel cannot keep:
  // a step is ticked by doing the work, never by the player saying so. It
  // is hidden from a screen reader, which is told done or not in words.
  return `<span class="opportunity-steps">${opportunitySteps(state, key).map((step) => `<span class="opportunity-step${step.done ? " done" : ""}"><span aria-hidden="true">[${step.done ? "x" : " "}]</span> ${esc(step.label)}<span class="sr-only">${step.done ? " (done)" : ""}</span></span>`).join("")}</span>`;
}

export function opportunityPanelHtml(state: GameState): string {
  const key = state.opportunities.current;
  const def = key && isOpportunityDiscovered(state.opportunities, key) && !isOpportunityComplete(state.opportunities, key) ? opportunityDef(key) : undefined;
  const body = def
    ? `<button type="button" class="opportunity-summary" data-act="opportunity-goto" data-opportunity="${esc(def.key)}"><span class="opportunity-current">Current</span><strong>${esc(def.title)}</strong>${opportunityChecklistHtml(state, def.key)}</button>`
    : `<p class="dim">No current opportunity</p>`;
  return `<h2>Opportunities</h2>${body}<button type="button" class="mini" data-act="opportunity-open">View all opportunities</button>`;
}
