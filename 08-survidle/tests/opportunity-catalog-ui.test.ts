import { expect, it } from "vitest";
import { newGame } from "../src/sim/newgame";
import { allOpportunityDefs, discoverOpportunity, OPPORTUNITY_CATEGORIES, setCurrentOpportunity } from "../src/sim/opportunities";
import { catalogPage, opportunityCatalogAction, opportunityCatalogHtml, opportunityCatalogKeyboard, opportunityDetailHtml } from "../src/ui/opportunity-catalog";
import { newUiState, resetPanels, setPanel } from "../src/ui/render";

it("renders anonymous unknown rows without leaking their titles", () => {
  const { state } = newGame(3);
  discoverOpportunity(state.opportunities, "track:deer", 1, false);
  const html = opportunityCatalogHtml(state, { category: "wildlife", page: 0, detail: null });
  expect(html).toContain("Track roe deer");
  expect(html).toContain("Undiscovered opportunity");
  expect(html).not.toContain("Track elk");
  expect(html).not.toContain("track:elk");
  expect(html).not.toContain("Hunt animals");
  expect(html).toContain("Track animals: 0 / 6");
});

it.each([6, 8])("paginates all definitions exactly once with %i rows", (size) => {
  const { state } = newGame(3);
  const slots: string[] = [];
  for (const category of OPPORTUNITY_CATEGORIES) {
    const first = catalogPage(state, category, 0, size);
    const rows = Array.from({ length: first.pageCount }, (_, page) => catalogPage(state, category, page, size).rows).flat();
    expect(rows).toHaveLength(allOpportunityDefs().filter((def) => def.category === category).length);
    slots.push(...rows.map((row) => row.slot));
    for (const row of rows.filter((row) => row.status === "unknown")) {
      expect(row).not.toHaveProperty("key");
      expect(row).not.toHaveProperty("title");
    }
  }
  expect(new Set(slots).size).toBe(slots.length);
  expect(catalogPage(state, "wildlife", 0, size).pageCount).toBe(24 / size);
});

it("clamps stale pages and shows stable disabled paging controls", () => {
  const { state } = newGame(3);
  expect(catalogPage(state, "wildlife", 999, 8).page).toBe(2);
  expect(catalogPage(state, "wildlife", -4, 8).page).toBe(0);
  document.body.innerHTML = opportunityCatalogHtml(state, { category: "wildlife", page: 999, detail: null });
  expect(document.querySelector<HTMLButtonElement>('[data-page="1"]')!.disabled).toBe(false);
  expect(document.querySelector<HTMLButtonElement>('[data-page="3"]')!.disabled).toBe(true);
  expect(document.body.textContent).toContain("Page 3 / 3");
  expect(document.querySelectorAll('[data-act="opportunity-category"]')).toHaveLength(7);
});

it("keeps the Next button and keyboard focus when its target page changes", () => {
  const { state } = newGame(3);
  document.body.innerHTML = '<div id="overlay"></div>';
  resetPanels();
  setPanel("overlay", opportunityCatalogHtml(state, { category: "wildlife", page: 0, detail: null }));
  const next = document.querySelector<HTMLButtonElement>('[data-page="1"]')!;
  next.focus();
  setPanel("overlay", opportunityCatalogHtml(state, { category: "wildlife", page: 1, detail: null }));
  expect(document.querySelector('[data-page="2"]')).toBe(next);
  expect(document.activeElement).toBe(next);
});

it("never leaks unknown definitions through any category or direct detail", () => {
  const { state } = newGame(3);
  for (const category of OPPORTUNITY_CATEGORIES) {
    const count = catalogPage(state, category, 0, 8).pageCount;
    for (let page = 0; page < count; page++) {
      const html = opportunityCatalogHtml(state, { category, page, detail: null });
      for (const def of allOpportunityDefs().filter((def) => state.opportunities.discoveredAt[def.key] === undefined)) {
        expect(html).not.toContain(def.title);
        expect(html).not.toContain(`="${def.key}"`);
      }
    }
  }
  expect(opportunityDetailHtml(state, "track:elk")).not.toContain("elk");
});

it("renders detail notes, Current and Done with valid selection controls only", () => {
  const { state } = newGame(3);
  discoverOpportunity(state.opportunities, "drink", 0, false);
  expect(opportunityDetailHtml(state, "drink")).toContain("Below 1 litre, Self-care drinks from water at hand, or walks to some, on the minutes the activity queue gives it.");
  expect(opportunityDetailHtml(state, "drink")).toContain('data-act="opportunity-current"');
  setCurrentOpportunity(state.opportunities, "drink");
  expect(opportunityDetailHtml(state, "drink")).toContain("Current");
  expect(opportunityDetailHtml(state, "drink")).not.toContain('data-act="opportunity-current"');
  state.opportunities.completedAt.drink = 1;
  expect(opportunityDetailHtml(state, "drink")).toContain("Done");
  expect(opportunityDetailHtml(state, "drink")).not.toContain('data-act="opportunity-current"');
  expect(opportunityDetailHtml(state, "drink")).toContain('data-act="opportunity-back"');
});

it("opens the current leaf's category and page, or the persisted last category", () => {
  const { state } = newGame(3);
  const ui = newUiState();
  discoverOpportunity(state.opportunities, "recover:bear", 0, false);
  setCurrentOpportunity(state.opportunities, "recover:bear");
  opportunityCatalogAction(state, ui, "opportunity-open", "", 8);
  expect(ui.opportunityCatalog).toEqual({ open: true, category: "wildlife", page: 2, detail: null });
  expect(ui.opportunityPresentation).toBeNull();
  opportunityCatalogAction(state, ui, "opportunity-category", "food", 8);
  expect(state.opportunities.lastCategory).toBe("food");
  opportunityCatalogAction(state, ui, "opportunity-close", "", 8);
  setCurrentOpportunity(state.opportunities, null);
  opportunityCatalogAction(state, ui, "opportunity-open", "", 8);
  expect(ui.opportunityCatalog).toEqual({ open: true, category: "food", page: 0, detail: null });
});

it("browses and changes current without mutating simulation progress or notices", () => {
  const { state } = newGame(3);
  const ui = newUiState();
  discoverOpportunity(state.opportunities, "drink", 0, false);
  const before = structuredClone(state);
  opportunityCatalogAction(state, ui, "opportunity-detail", "drink", 8);
  expect(ui.opportunityCatalog.detail).toBe("drink");
  opportunityCatalogAction(state, ui, "opportunity-current", "drink", 8);
  expect(state.opportunities.current).toBe("drink");
  expect(state).toEqual({ ...before, opportunities: { ...before.opportunities, current: "drink" } });
  opportunityCatalogAction(state, ui, "opportunity-back", "", 8);
  expect(ui.opportunityCatalog.detail).toBeNull();
  opportunityCatalogAction(state, ui, "opportunity-current", "track:elk", 8);
  state.opportunities.completedAt.site = 1;
  opportunityCatalogAction(state, ui, "opportunity-current", "site", 8);
  expect(state.opportunities.current).toBe("drink");
  opportunityCatalogAction(state, ui, "opportunity-page", "999", 8);
  expect(ui.opportunityCatalog.page).toBe(0);
  opportunityCatalogAction(state, ui, "opportunity-detail", "track:elk", 8);
  expect(ui.opportunityCatalog.detail).toBeNull();
});

it("keeps keyboard traversal inside the dialog and closes on Escape", () => {
  const { state } = newGame(3);
  document.body.innerHTML = `<button id="outside">Outside</button>${opportunityCatalogHtml(state, { category: "wildlife", page: 0, detail: null })}`;
  const dialog = document.querySelector<HTMLElement>('[role="dialog"]')!;
  const first = dialog.querySelector<HTMLButtonElement>("button")!;
  const last = dialog.querySelector<HTMLButtonElement>('[data-page="1"]')!;
  last.focus();
  const forward = new KeyboardEvent("keydown", { key: "Tab", cancelable: true });
  opportunityCatalogKeyboard(dialog, forward);
  expect(document.activeElement).toBe(first);
  expect(forward.defaultPrevented).toBe(true);
  opportunityCatalogKeyboard(dialog, new KeyboardEvent("keydown", { key: "Tab", shiftKey: true, cancelable: true }));
  expect(document.activeElement).toBe(last);
  first.addEventListener("click", () => { dialog.hidden = true; });
  opportunityCatalogKeyboard(dialog, new KeyboardEvent("keydown", { key: "Escape", cancelable: true }));
  expect(dialog.hidden).toBe(true);
});

it("returns Back to the page that now holds the leaf after a breakpoint change", () => {
  const { state } = newGame(3);
  const ui = newUiState();
  discoverOpportunity(state.opportunities, "hunt:deer", 1, false);
  opportunityCatalogAction(state, ui, "opportunity-detail", "hunt:deer", 8);
  const desktop = ui.opportunityCatalog.page;
  expect(opportunityCatalogHtml(state, { ...ui.opportunityCatalog, detail: null }, 8)).toContain("Hunt roe deer");
  opportunityCatalogAction(state, ui, "opportunity-back", "", 6);
  expect(ui.opportunityCatalog.page).not.toBe(desktop);
  expect(opportunityCatalogHtml(state, ui.opportunityCatalog, 6)).toContain("Hunt roe deer");
});
