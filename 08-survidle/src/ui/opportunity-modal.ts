import { dismissOpportunityPresentation, isOpportunityComplete, isOpportunityDiscovered, opportunityDef, opportunityGroupView } from "../sim/opportunities";
import type { GameState, OpportunityKey, OpportunityNotice } from "../sim/types";
import { opportunityChecklistHtml } from "./opportunity-panel";
import { esc, type UiState } from "./render";

/** Peek only: the catalog and higher overlays leave every notice queued. */
export function nextOpportunityPresentation(state: GameState, ui: UiState): OpportunityNotice | null {
  if (ui.manual || ui.cemetery || ui.away || state.landing || state.dead || ui.welcome || ui.teach
    || state.teachQueue.length || ui.recognition !== null || ui.opportunityCatalog.open || ui.opportunityPresentation) return null;
  return state.opportunities.notices[0] ?? null;
}

export function opportunityModalHtml(state: GameState, notice: OpportunityNotice): string {
  const known = (key: OpportunityKey) => isOpportunityDiscovered(state.opportunities, key) ? opportunityDef(key) : undefined;
  const completed = notice.completed.map((key) => {
    const def = known(key);
    return def ? `<p class="opportunity-completed">Completed: ${esc(def.title)}</p>` : "";
  }).join("");
  const groups = notice.completedGroups.map((id) => {
    const group = opportunityGroupView(state.opportunities, id);
    return group.discovered.length ? `<p class="opportunity-completed">Group completed: ${esc(group.title)}</p>` : "";
  }).join("");
  const discoveries = notice.discovered.map((key) => {
    const def = known(key);
    if (!def) return "";
    const done = isOpportunityComplete(state.opportunities, key);
    const current = !done && state.opportunities.current === key;
    return `<section class="opportunity-discovery"><h2>New opportunity: ${esc(def.title)}</h2>${opportunityChecklistHtml(state, key)}${def.note ? `<p class="opportunity-note">${esc(def.note)}</p>` : ""}${done ? `<p class="opportunity-completed">[x] Done</p>` : current ? `<p class="opportunity-current">Current</p>` : `<button type="button" class="mini" data-act="opportunity-set-current" data-notice="${esc(notice.id)}" data-opportunity="${esc(key)}">Set as current</button>`}</section>`;
  }).join("");
  const messages = notice.messages.map((message) => `<p class="opportunity-note">${esc(message)}</p>`).join("");
  return `<div class="opportunity-modal" data-notice="${esc(notice.id)}" role="dialog" aria-modal="true" aria-labelledby="opportunity-modal-heading"><header><p class="opportunity-modal-label">Field notes - paused</p><h1 id="opportunity-modal-heading" tabindex="-1">Opportunities</h1></header>${completed}${groups}${discoveries}${messages}<footer class="opportunity-modal-actions"><button type="button" class="mini" data-act="opportunity-modal-ok" data-notice="${esc(notice.id)}">OK</button></footer></div>`;
}

/** A routed action must still refer to the displayed batch, not a stale DOM button. */
export function opportunityModalAction(state: GameState, ui: UiState, action: string, noticeId: string, selected: OpportunityKey | null): boolean {
  if (ui.opportunityPresentation?.id !== noticeId) return false;
  if (action !== "opportunity-modal-ok" && action !== "opportunity-set-current") return false;
  if (action === "opportunity-set-current" && selected === null) return false;
  if (!dismissOpportunityPresentation(state, noticeId, action === "opportunity-modal-ok" ? null : selected)) return false;
  ui.opportunityPresentation = null;
  return true;
}

export function opportunityModalKeyboard(dialog: HTMLElement, event: KeyboardEvent): void {
  if (event.key === "Escape") {
    event.preventDefault();
    dialog.querySelector<HTMLButtonElement>('[data-act="opportunity-modal-ok"]')?.click();
  } else if (event.key === "Tab") {
    const buttons = [...dialog.querySelectorAll<HTMLButtonElement>("button:not(:disabled)")];
    const first = buttons[0];
    const last = buttons[buttons.length - 1];
    const active = dialog.ownerDocument.activeElement;
    if (!dialog.contains(active) || (event.shiftKey ? active === first : active === last)) {
      event.preventDefault();
      (event.shiftKey ? last : first)?.focus();
    }
  }
}
