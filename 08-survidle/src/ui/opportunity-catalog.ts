import { allOpportunityDefs, isOpportunityComplete, isOpportunityDiscovered, OPPORTUNITY_CATEGORIES, OPPORTUNITY_GROUPS, opportunityDef, opportunityGroupView, setCurrentOpportunity } from "../sim/opportunities";
import type { GameState, OpportunityCategory, OpportunityGroupId, OpportunityKey } from "../sim/types";
import { opportunityChecklistHtml } from "./opportunity-panel";
import { esc, type UiState } from "./render";

export interface OpportunityCatalogUi {
  open: boolean;
  category: OpportunityCategory;
  page: number;
  detail: OpportunityKey | null;
}

// Authored leaves have no model group. These anonymous slot namespaces are UI only.
type CatalogGroupId = OpportunityGroupId | `authored-${OpportunityCategory}`;
export interface CatalogRowView {
  slot: `${CatalogGroupId}:${number}`;
  group: CatalogGroupId;
  key?: OpportunityKey;
  title?: string;
  status: "unknown" | "not-done" | "done";
}
export interface CatalogPageView { page: number; pageCount: number; rows: CatalogRowView[] }

function catalogRows(state: GameState, category: OpportunityCategory): CatalogRowView[] {
  const groups: { id: CatalogGroupId; keys: OpportunityKey[] }[] = [
    { id: `authored-${category}`, keys: allOpportunityDefs().filter((def) => def.category === category && !def.group).map((def) => def.key) },
    ...OPPORTUNITY_GROUPS.filter((group) => group.category === category),
  ];
  return groups.flatMap((group) => group.keys.map((key, index): CatalogRowView => {
    const row: CatalogRowView = { slot: `${group.id}:${index}`, group: group.id, status: "unknown" };
    if (isOpportunityDiscovered(state.opportunities, key)) {
      row.key = key;
      row.title = opportunityDef(key)!.title;
      row.status = isOpportunityComplete(state.opportunities, key) ? "done" : "not-done";
    }
    return row;
  }));
}

export function catalogPage(state: GameState, category: OpportunityCategory, page: number, pageSize: number): CatalogPageView {
  if (!Number.isInteger(pageSize) || pageSize < 1) throw new RangeError("Catalog page size must be a positive integer");
  const rows = catalogRows(state, category);
  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize));
  const clamped = Math.max(0, Math.min(pageCount - 1, Number.isFinite(page) ? Math.floor(page) : 0));
  return { page: clamped, pageCount, rows: rows.slice(clamped * pageSize, (clamped + 1) * pageSize) };
}

function titleCase(category: OpportunityCategory): string { return category[0].toUpperCase() + category.slice(1); }

function groupHeading(state: GameState, group: CatalogGroupId): string {
  if (group.startsWith("authored-")) return "";
  const view = opportunityGroupView(state.opportunities, group as OpportunityGroupId);
  if (!view.discovered.length) return `<span class="opportunity-group dim">[?] Undiscovered group</span>`;
  return `<span class="opportunity-group${view.done ? " done" : ""}">${esc(view.title)}: ${view.completed.length} / ${view.keys.length}${view.done ? " - Done" : ""}</span>`;
}

export function opportunityDetailHtml(state: GameState, key: OpportunityKey): string {
  const back = `<button type="button" class="mini" data-act="opportunity-back">Back</button>`;
  if (!isOpportunityDiscovered(state.opportunities, key) || !opportunityDef(key)) return `<section class="opportunity-detail opportunity-body"><p class="dim">[?] Undiscovered opportunity</p></section><div class="opportunity-detail-actions">${back}</div>`;
  const def = opportunityDef(key)!;
  const done = isOpportunityComplete(state.opportunities, key);
  const current = !done && state.opportunities.current === key;
  return `<section class="opportunity-detail opportunity-body"><h2>${esc(def.title)}</h2><p class="${done ? "done" : "opportunity-current"}">${done ? "[x] Done" : current ? "Current" : "[ ] Not done"}</p>${opportunityChecklistHtml(state, key)}${def.note ? `<p class="opportunity-note">${esc(def.note)}</p>` : ""}</section><div class="opportunity-detail-actions">${back}${!done && !current ? `<button type="button" class="mini" data-act="opportunity-current" data-opportunity="${esc(key)}">Set as current</button>` : ""}</div>`;
}

export function opportunityCatalogHtml(state: GameState, ui: Omit<OpportunityCatalogUi, "open">, pageSize = 8): string {
  const page = catalogPage(state, ui.category, ui.page, pageSize);
  const tabs = OPPORTUNITY_CATEGORIES.map((category) => `<button type="button" class="mini" data-act="opportunity-category" data-category="${category}" aria-pressed="${category === ui.category}">${titleCase(category)}</button>`).join("");
  const rows = page.rows.map((row, index) => {
    const heading = index === 0 || page.rows[index - 1].group !== row.group ? groupHeading(state, row.group) : "";
    const status = row.status === "done" ? "[x]" : "[ ]";
    const leaf = row.key
      ? `<button type="button" class="opportunity-row${row.status === "done" ? " done" : ""}" data-act="opportunity-detail" data-opportunity="${esc(row.key)}"><span>${status} ${esc(row.title!)}</span><span class="opportunity-row-status">${row.status === "done" ? "Done" : state.opportunities.current === row.key ? "Current" : ""}</span></button>`
      : `<span class="opportunity-unknown">[?] Undiscovered opportunity</span>`;
    return `<li data-slot="${row.slot}">${heading}${leaf}</li>`;
  }).join("");
  const body = ui.detail === null
    ? `<ol class="opportunity-rows opportunity-body">${rows}</ol><nav class="opportunity-pages" aria-label="Opportunity pages"><button id="opportunity-previous" type="button" class="mini" data-act="opportunity-page" data-page="${page.page - 1}"${page.page === 0 ? " disabled" : ""}>Previous</button><span>Page ${page.page + 1} / ${page.pageCount}</span><button id="opportunity-next" type="button" class="mini" data-act="opportunity-page" data-page="${page.page + 1}"${page.page === page.pageCount - 1 ? " disabled" : ""}>Next</button></nav>`
    : opportunityDetailHtml(state, ui.detail);
  return `<div class="box opportunity-catalog" role="dialog" aria-modal="true" aria-labelledby="opportunity-heading"><header class="opportunity-heading"><h1 id="opportunity-heading">Opportunities</h1><button type="button" class="mini" data-act="opportunity-close">Close</button></header><nav class="opportunity-categories" aria-label="Opportunity categories">${tabs}</nav>${body}</div>`;
}

/** Presentation actions never credit progress or consume queued notices. */
export function opportunityCatalogAction(state: GameState, ui: UiState, action: string, value: string, pageSize: number): void {
  const catalog = ui.opportunityCatalog;
  const key = value as OpportunityKey;
  switch (action) {
    case "opportunity-open": {
      const current = state.opportunities.current;
      const def = current && isOpportunityDiscovered(state.opportunities, current) ? opportunityDef(current) : undefined;
      catalog.open = true;
      catalog.detail = null;
      catalog.category = def?.category ?? state.opportunities.lastCategory;
      catalog.page = def ? Math.floor(catalogRows(state, catalog.category).findIndex((row) => row.key === def.key) / pageSize) : 0;
      break;
    }
    case "opportunity-close": catalog.open = false; break;
    case "opportunity-category":
      if (OPPORTUNITY_CATEGORIES.includes(value as OpportunityCategory)) {
        catalog.category = value as OpportunityCategory;
        catalog.page = 0;
        catalog.detail = null;
      }
      break;
    case "opportunity-page": catalog.page = Number(value); catalog.detail = null; break;
    case "opportunity-detail":
      if (isOpportunityDiscovered(state.opportunities, key) && opportunityDef(key)) {
        if (!catalog.open) {
          catalog.category = opportunityDef(key)!.category;
          catalog.page = Math.floor(catalogRows(state, catalog.category).findIndex((row) => row.key === key) / pageSize);
        }
        catalog.open = true;
        catalog.detail = key;
      }
      break;
    case "opportunity-back": catalog.detail = null; break;
    case "opportunity-current": setCurrentOpportunity(state.opportunities, key); break;
  }
  catalog.page = catalogPage(state, catalog.category, catalog.page, pageSize).page;
  state.opportunities.lastCategory = catalog.category;
}

/** A modal field index traps only keyboard focus; the world clock keeps running. */
export function opportunityCatalogKeyboard(dialog: HTMLElement, event: KeyboardEvent): void {
  if (event.key === "Escape") {
    event.preventDefault();
    dialog.querySelector<HTMLButtonElement>('[data-act="opportunity-close"]')?.click();
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
