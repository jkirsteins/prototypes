import { expect, it } from "vitest";
import { newGame } from "../src/sim/newgame";
import { discoverOpportunity, dismissOpportunityPresentation, recordOpportunityEvent, setCurrentOpportunity } from "../src/sim/opportunities";
import type { OpportunityNotice } from "../src/sim/types";
import { nextOpportunityPresentation, opportunityModalAction, opportunityModalHtml, opportunityModalKeyboard } from "../src/ui/opportunity-modal";
import { newUiState, simulationPaused } from "../src/ui/render";

function newState() {
  const { state } = newGame(3);
  state.opportunities.notices = [];
  return state;
}

function discovery() {
  const state = newState();
  discoverOpportunity(state.opportunities, "drink", 0, false);
  setCurrentOpportunity(state.opportunities, "drink");
  recordOpportunityEvent(state, { kind: "speciesSeen", species: "deer" });
  const notice = state.opportunities.notices[0];
  if (!notice) throw new Error("discovery notice is missing");
  return { state, notice };
}

it("combines completion, group completion, discoveries, and messages in one modal", () => {
  const state = newState();
  discoverOpportunity(state.opportunities, "track:deer", 0, false);
  discoverOpportunity(state.opportunities, "hunt:deer", 0, false);
  const notice: OpportunityNotice = {
    id: "0:1", minute: 0, completed: ["track:deer"], completedGroups: ["track-animals"],
    discovered: ["hunt:deer"], messages: ["A new path opens."],
  };
  const html = opportunityModalHtml(state, notice);
  const lines = ["Completed: Track roe deer", "Group completed: Track animals", "New opportunity: Hunt roe deer", "A new path opens."];
  for (const line of lines) expect(html).toContain(line);
  for (let i = 1; i < lines.length; i++) expect(html.indexOf(lines[i - 1])).toBeLessThan(html.indexOf(lines[i]));
  expect(html.match(/class="opportunity-modal"/g)).toHaveLength(1);
  document.body.innerHTML = html;
  expect(document.querySelectorAll('[role="dialog"]')).toHaveLength(1);
});

it("preserves existing current on discovery and OK", () => {
  const { state, notice } = discovery();
  expect(state.opportunities.current).toBe("drink");
  dismissOpportunityPresentation(state, notice.id, null);
  expect(state.opportunities.current).toBe("drink");
  expect(state.opportunities.notices).toEqual([]);
});

it("changes current only to the discovery selected from that notice", () => {
  const { state, notice } = discovery();
  dismissOpportunityPresentation(state, notice.id, "track:deer");
  expect(state.opportunities.current).toBe("track:deer");
});

it.each(["site", "track:elk"] as const)("rejects a choice outside the shown discoveries: %s", (key) => {
  const { state, notice } = discovery();
  expect(dismissOpportunityPresentation(state, notice.id, key)).toBe(false);
  expect(state.opportunities.current).toBe("drink");
  expect(state.opportunities.notices).toEqual([notice]);
});

it("auto-selects one discovery when no current exists", () => {
  const state = newState();
  setCurrentOpportunity(state.opportunities, null);
  recordOpportunityEvent(state, { kind: "speciesSeen", species: "deer" });
  const notice = state.opportunities.notices[0];
  if (!notice) throw new Error("discovery notice is missing");
  expect(state.opportunities.current).toBe("track:deer");
  expect(opportunityModalHtml(state, notice)).not.toContain("Set as current");
});

it("offers a separate choice for each of several discoveries and chooses none", () => {
  const state = newState();
  setCurrentOpportunity(state.opportunities, null);
  recordOpportunityEvent(state, { kind: "waterRead", species: ["perch", "pike"] });
  const notice = state.opportunities.notices[0]!;
  expect(state.opportunities.current).toBeNull();
  document.body.innerHTML = opportunityModalHtml(state, notice);
  const buttons = [...document.querySelectorAll<HTMLButtonElement>('[data-act="opportunity-set-current"]')];
  expect(buttons.map((button) => button.dataset.opportunity)).toEqual(["catch:perch", "catch:pike"]);
  dismissOpportunityPresentation(state, notice.id, "catch:pike");
  expect(state.opportunities.current).toBe("catch:pike");
});

it("removes exactly the displayed id and repeated dismissal cannot consume the next batch", () => {
  const { state, notice } = discovery();
  recordOpportunityEvent(state, { kind: "speciesSeen", species: "elk" });
  const second = state.opportunities.notices[1]!;
  expect(second.id).not.toBe(notice.id);
  state.opportunities.notices.reverse();
  expect(dismissOpportunityPresentation(state, notice.id, null)).toBe(true);
  expect(dismissOpportunityPresentation(state, notice.id, "track:deer")).toBe(false);
  expect(state.opportunities.notices).toEqual([second]);
  expect(state.opportunities.current).toBe("drink");
});

it("does not reveal unknown titles, keys, groups, or checklists from a stale notice", () => {
  const state = newState();
  const notice: OpportunityNotice = { id: "bad", minute: 0, completed: ["track:elk"], completedGroups: ["hunt-animals"], discovered: ["hunt:elk"], messages: ["<script>bad</script>"] };
  const html = opportunityModalHtml(state, notice);
  expect(html).not.toMatch(/elk|Hunt animals|<script>/);
  expect(html).toContain("&lt;script&gt;");
  expect(html).not.toContain("Set as current");
});

it("does not offer completed discoveries as current", () => {
  const { state, notice } = discovery();
  state.opportunities.completedAt["track:deer"] = 1;
  expect(opportunityModalHtml(state, notice)).not.toContain("Set as current");
  expect(dismissOpportunityPresentation(state, notice.id, "track:deer")).toBe(false);
});

it("queues discoveries behind the non-pausing catalog and pauses when the modal opens", () => {
  const { state, notice } = discovery();
  const ui = newUiState();
  ui.opportunityCatalog.open = true;
  expect(nextOpportunityPresentation(state, ui)).toBeNull();
  expect(simulationPaused(state, ui)).toBe(false);
  expect(state.opportunities.notices).toEqual([notice]);
  ui.opportunityCatalog.open = false;
  ui.opportunityPresentation = nextOpportunityPresentation(state, ui);
  expect(ui.opportunityPresentation).toBe(notice);
  expect(simulationPaused(state, ui)).toBe(true);
  expect(opportunityModalAction(state, ui, "opportunity-modal-ok", notice.id, null)).toBe(true);
  expect(ui.opportunityPresentation).toBeNull();
  expect(simulationPaused(state, ui)).toBe(false);
});

it.each(["manual", "cemetery", "welcome", "teach", "away", "recognition", "landing", "dead", "queued-teach"])("waits behind %s without consuming facts", (overlay) => {
  const { state, notice } = discovery();
  const ui = newUiState();
  if (overlay === "manual" || overlay === "cemetery" || overlay === "welcome") ui[overlay] = true;
  else if (overlay === "teach") ui.teach = "job";
  else if (overlay === "away") ui.away = {} as NonNullable<typeof ui.away>;
  else if (overlay === "recognition") ui.recognition = 1;
  else if (overlay === "landing") state.landing = {} as NonNullable<typeof state.landing>;
  else if (overlay === "dead") state.dead = {} as NonNullable<typeof state.dead>;
  else state.teachQueue.push("job");
  expect(nextOpportunityPresentation(state, ui)).toBeNull();
  expect(state.opportunities.notices).toEqual([notice]);
});

it("ignores stale UI actions after another presentation has opened", () => {
  const { state, notice } = discovery();
  const ui = newUiState();
  ui.opportunityPresentation = notice;
  expect(opportunityModalAction(state, ui, "opportunity-set-current", "stale", "track:deer")).toBe(false);
  expect(ui.opportunityPresentation).toBe(notice);
  expect(state.opportunities.current).toBe("drink");
  expect(opportunityModalAction(state, ui, "opportunity-set-current", notice.id, "track:deer")).toBe(true);
  expect(state.opportunities.current).toBe("track:deer");
  expect(ui.opportunityPresentation).toBeNull();
});

it("keeps keyboard focus inside the presentation and Escape uses OK", () => {
  const { state, notice } = discovery();
  document.body.innerHTML = opportunityModalHtml(state, notice);
  const dialog = document.querySelector<HTMLElement>('[role="dialog"]')!;
  const buttons = [...dialog.querySelectorAll<HTMLButtonElement>("button")];
  const first = buttons[0];
  const last = buttons[buttons.length - 1];
  last.focus();
  opportunityModalKeyboard(dialog, new KeyboardEvent("keydown", { key: "Tab", cancelable: true }));
  expect(document.activeElement).toBe(first);
  opportunityModalKeyboard(dialog, new KeyboardEvent("keydown", { key: "Tab", shiftKey: true, cancelable: true }));
  expect(document.activeElement).toBe(last);
  dialog.addEventListener("click", (event) => {
    const button = event.target as HTMLButtonElement;
    dismissOpportunityPresentation(state, button.dataset.notice!, null);
  });
  opportunityModalKeyboard(dialog, new KeyboardEvent("keydown", { key: "Escape", cancelable: true }));
  expect(state.opportunities.notices).toEqual([]);
  expect(state.opportunities.current).toBe("drink");
});
