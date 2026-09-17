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

/**
 * Whether the survivor has a camp where they are standing.
 *
 * `site` completes once per world and never reopens, because opportunities
 * belong to the world rather than to a life. That is right for the
 * catalogue and wrong for the card: an heir who lands in a region with no
 * camp has making one as their most urgent job, and the card said "No
 * current opportunity" - which is the dead card this pass set out to fix,
 * coming back for every life after the first.
 */
function homeless(state: GameState): boolean {
  const cell = state.regions[state.player.region]?.campCell;
  return cell === null || cell === undefined;
}

export function opportunityPanelHtml(state: GameState): string {
  const key = state.opportunities.current;
  const def = key && isOpportunityDiscovered(state.opportunities, key) && !isOpportunityComplete(state.opportunities, key) ? opportunityDef(key) : undefined;
  // Nothing current and nowhere to live: say the thing that is true, and
  // point at the row, rather than leaving the card blank. The checklist is
  // left off because the world's `site` is long since ticked - it is this
  // survivor who has no camp, not this world.
  const resite = def === undefined && homeless(state) ? opportunityDef("site") : undefined;
  const body = def
    ? `<button type="button" class="opportunity-summary" data-act="opportunity-goto" data-opportunity="${esc(def.key)}"><span class="opportunity-current">Current</span><strong>${esc(def.title)}</strong>${opportunityChecklistHtml(state, def.key)}</button>`
    : resite
      ? `<button type="button" class="opportunity-summary" data-act="opportunity-goto" data-opportunity="site"><span class="opportunity-current">Current</span><strong>${esc(resite.title)}</strong></button>`
      : `<p class="dim">No current opportunity</p>`;
  return `<h2>Opportunities</h2>${body}<button type="button" class="mini" data-act="opportunity-open">View all opportunities</button>`;
}
