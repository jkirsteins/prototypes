import { shortOf } from "../sim/inventory";
import { itemLabel, RECIPES, STRUCTURES, TOOLS } from "../sim/items";
import { isOpportunityComplete, isOpportunityDiscovered, opportunityDef, opportunitySteps } from "../sim/opportunities";
import type { GameState, OpportunityKey, RecipeId, StructureId } from "../sim/types";
import { esc } from "./render";

/**
 * The shopping list under a pinned recipe or structure: what it still
 * wants, against the pack and the camp pile, and the tool if that is
 * missing too. A tester asked for exactly this - pin "make knife" and see
 * what it needs, tick it off wherever you happen to be - and "make knife"
 * as a goal with one step said nothing of the kind. Read-only: the camp
 * pile is looked at, never created, so an empty camp adds no entry.
 */
export function opportunityNeedsHtml(state: GameState, key: OpportunityKey): string {
  const [kind, id] = key.split(":");
  const needs = kind === "make" && id in RECIPES ? RECIPES[id as RecipeId].needs : kind === "build" && id in STRUCTURES ? STRUCTURES[id as StructureId].needs : null;
  if (!needs) return "";
  const camp = state.regions[state.player.region]?.campCell;
  const invs = [state.player.pack, camp !== null && camp !== undefined ? state.piles[camp] : undefined].filter((inv) => inv !== undefined);
  const short = shortOf(invs, needs).map((s) => itemLabel(s.item, s.qty));
  const tool = kind === "make" ? RECIPES[id as RecipeId].tool : undefined;
  if (tool && !state.player.tools.some((t) => t.id === tool)) short.push(`a ${TOOLS[tool].name}`);
  const list = short.length > 1 ? `${short.slice(0, -1).join(", ")} and ${short[short.length - 1]}` : short[0];
  return `<span class="opportunity-needs dim">${short.length ? `still needs ${esc(list)}` : "everything it needs is at hand"}</span>`;
}

/** Also used in details; only a discovered leaf may expose its checklist. */
export function opportunityChecklistHtml(state: GameState, key: OpportunityKey): string {
  if (!isOpportunityDiscovered(state.opportunities, key)) return "";
  // The bracket pair is a status glyph, not a checkbox. It looked like one
  // and did nothing when clicked, which is a promise the panel cannot keep:
  // a step is ticked by doing the work, never by the player saying so. It
  // is hidden from a screen reader, which is told done or not in words.
  // A counted step says how far it has got. "Gather 10 kg" with 1.1 kg
  // banked and a full wood pile in view read as a goal that had failed to
  // notice; "1.1 of 10 kg" says what has counted and, by omission, what has not.
  const progress = (step: { at: number; target: number; unit?: string; done: boolean }) => step.unit && !step.done && step.at > 0 ? ` <small class="dim">${fmt(step.at)} of ${fmt(step.target)} ${esc(step.unit)}</small>` : "";
  const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));
  return `<span class="opportunity-steps">${opportunitySteps(state, key).map((step) => `<span class="opportunity-step${step.done ? " done" : ""}"><span aria-hidden="true">[${step.done ? "x" : " "}]</span> ${esc(step.label)}${progress(step)}<span class="sr-only">${step.done ? " (done)" : ""}</span></span>`).join("")}</span>`;
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
    ? `<button type="button" class="opportunity-summary" data-act="opportunity-goto" data-opportunity="${esc(def.key)}"><span class="opportunity-current">Current</span><strong>${esc(def.title)}</strong>${opportunityChecklistHtml(state, def.key)}${opportunityNeedsHtml(state, def.key)}</button>`
    : resite
      ? `<button type="button" class="opportunity-summary" data-act="opportunity-goto" data-opportunity="site"><span class="opportunity-current">Current</span><strong>${esc(resite.title)}</strong></button>`
      : `<p class="dim">No current opportunity</p>`;
  return `<h2>Opportunities</h2>${body}<button type="button" class="mini" data-act="opportunity-open">View all opportunities</button>`;
}
