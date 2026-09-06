import { NOT_ORDERS } from "../sim/ladder";
import { type HurryState, newHurry } from "./hurry";
import type { AwaySummary } from "../sim/save";
import type { TaskGroup } from "../sim/tasks";
import type { IntentRequest, OrderKind, SpotId, TaskId, UntilChoice } from "../sim/types";

/** What the screen remembers that the game does not. */
export interface UiState {
  /** The raw list's tab, under the advanced toggle. */
  tab: TaskGroup;
  /** Region clicked on the map, or null for the one you stand in. */
  selected: number | null;
  /** What happened while the tab was closed, until dismissed. */
  away: AwaySummary | null;
  confirmAbandon: boolean;
  /** The cemetery overlay is open. */
  cemetery: boolean;
  /** The manual overlay is open. */
  manual: boolean;
  /** Survivor index whose entry is expanded in the cemetery, or null for none. */
  cemeteryOpen: number | null;
  /** The cemetery's "leave this world" button is showing its confirm step. */
  confirmLeave: boolean;
  /** The day catchUp was called on, so the away report's since-line reads from where the player left off. */
  awayFromDay: number;
  /** The copy button reads "copied" until this real-time millisecond. */
  copiedUntil: number;
  /** Index into ZOOMS: 0 is one cell per glyph. */
  zoom: number;
  /** The Do row whose kinds are open, or null. */
  open: { id: TaskId; arg: string } | null;
  /** The open row's choice; reset when another row opens. */
  choice: RowChoice;
  advanced: boolean;
  /** The Do panel's filter box: narrows rows to those whose label contains it, case-insensitive. */
  filter: string;
  /** Do groups whose far rows ("more (N)") have been opened this render lifetime. */
  moreOpen: string[];
  /** The Do panel's fold state, held here and written through on toggle so a frame never has to re-read storage. */
  folds: Record<string, boolean>;
  /** The hurry: how fast the work chosen by hand is running right now. Never saved. */
  hurry: HurryState;
}

/** A Do row's order settings: what "more" opens, and what a kind button there gives. */
export interface RowChoice {
  until: "once" | "times" | "campHas" | "keep" | "forever";
  n: number;
  deliver: "leave" | "camp";
  where: "nearest" | SpotId;
}

export function defaultChoice(): RowChoice {
  return { until: "once", n: 10, deliver: "leave", where: "nearest" };
}

/** A row's plain-click choice: a fetch or a melt brings its water to camp, everything else leaves its yield where it is. */
export function defaultChoiceFor(id: TaskId): RowChoice {
  return { ...defaultChoice(), deliver: id === "fill" || id === "melt" ? "camp" : "leave" };
}

export function newUiState(): UiState {
  return {
    tab: "gather", selected: null, away: null, confirmAbandon: false,
    cemetery: false, manual: false, cemeteryOpen: null, confirmLeave: false, awayFromDay: 1, copiedUntil: 0, zoom: 0,
    open: null, choice: defaultChoice(), advanced: false, filter: "", moreOpen: [], folds: {},
    hurry: newHurry(),
  };
}

const last = new Map<string, string>();

/**
 * Replaces a panel's markup only when it changed, so a button is never
 * swapped out from under the pointer between mousedown and mouseup. Also
 * skipped, without caching the new html, while an open row's number field
 * inside this panel has focus: rewriting the innerHTML there would destroy
 * the focused input mid-keystroke. Left uncached so the write is retried
 * (and the field's value re-synced) as soon as focus moves elsewhere.
 */
export function setPanel(id: string, html: string, root: ParentNode = document): boolean {
  if (last.get(id) === html) return false;
  const el = root.querySelector<HTMLElement>(`#${id}`);
  if (!el) return false;
  const focused = document.activeElement;
  if (focused && (focused.hasAttribute("data-row-n") || focused.hasAttribute("data-name")) && el.contains(focused)) return false;
  last.set(id, html);
  el.innerHTML = html;
  return true;
}

export function resetPanels(): void {
  last.clear();
}

/** Clamps and commits the open row's number field to at least 1; shared by the input and change listeners so a keystroke and a blur agree. */
export function commitChoiceN(ui: UiState, value: string): void {
  ui.choice.n = Math.max(1, Math.round(Number(value) || 1));
}

export function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/**
 * The order a click on an open row's kind gives: what main.ts hands to
 * giveOrder. A NOT_ORDERS task (night, rest, sleep, a runner step) ignores
 * the choice: it is a move the Do panel starts directly, not something the
 * ladder gates, so it is always the once job the click means.
 */
export function rowRequest(choice: RowChoice, id: TaskId, arg: string | undefined): { req: IntentRequest; kind: OrderKind } {
  if (NOT_ORDERS.includes(id)) return { req: { task: id, arg, until: { kind: "once" }, deliver: choice.deliver, where: choice.where }, kind: "job" };
  const kind: OrderKind = choice.until === "keep" ? "keep" : choice.until === "forever" ? "grind" : "job";
  const until: UntilChoice = choice.until === "times" ? { kind: "times", n: choice.n }
    : choice.until === "campHas" || choice.until === "keep" ? { kind: "campHas", qty: choice.n }
    : choice.until === "forever" ? { kind: "forever" }
    : { kind: "once" };
  return { req: { task: id, arg, until, deliver: choice.deliver, where: choice.where }, kind };
}
