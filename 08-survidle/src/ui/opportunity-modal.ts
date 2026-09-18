import { dismissOpportunityPresentation, isOpportunityComplete, isOpportunityDiscovered, opportunityDef, opportunityGroupView } from "../sim/opportunities";
import type { GameState, OpportunityKey, OpportunityNotice, OpportunityGroupId } from "../sim/types";
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
  // Six fish read from one water arrive as one discovery, not six: the
  // group they share names them in a line, and the catalogue keeps the
  // per-fish choice. Below three, each still gets its own section.
  const byGroup = new Map<OpportunityGroupId, OpportunityKey[]>();
  for (const key of notice.discovered) { const g = known(key)?.group; if (g) byGroup.set(g, [...(byGroup.get(g) ?? []), key]); }
  const folded = new Set([...byGroup.values()].filter((keys) => keys.length >= 3).flat());
  const groupSections = [...byGroup].filter(([, keys]) => keys.length >= 3).map(([id, keys]) => {
    const group = opportunityGroupView(state.opportunities, id);
    const names = keys.map((key) => known(key)?.title.replace(/^(Catch|Trap|Read|Hunt|Gather|Make|Build) /, "") ?? key);
    return `<section class="opportunity-discovery"><h2>New opportunities: ${esc(group.title)}</h2><p class="opportunity-note">${esc(names.join(", "))}. Any of them can be set as current from the catalogue.</p></section>`;
  }).join("");
  const discoveries = groupSections + notice.discovered.map((key) => {
    const def = known(key);
    if (!def || folded.has(key)) return "";
    if (def.fyi) return `<section class="opportunity-discovery"><h2>${esc(def.title)}</h2>${def.note ? `<p class="opportunity-note">${esc(def.note)}</p>` : ""}</section>`;
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
    if (!buttons.some((button) => button === active) || (event.shiftKey ? active === first : active === last)) {
      event.preventDefault();
      (event.shiftKey ? last : first)?.focus();
    }
  }
}
