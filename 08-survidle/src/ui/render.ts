import { monthStartDoy } from "../sim/calendar";
import { NOT_ORDERS } from "../sim/ladder";
import { type HurryState, newHurry } from "./hurry";
import type { AwaySummary } from "../sim/save";
import type { TaskGroup } from "../sim/tasks";
import type { IntentRequest, ItemId, OrderKind, OrderWhen, SpotId, TaskId, UntilChoice } from "../sim/types";

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
  until: "once" | "times" | "daily" | "campHas" | "keep" | "forever";
  n: number;
  deliver: "leave" | "camp";
  where: "nearest" | SpotId;
  /** The conditions the row's fields have set, empty until one is touched; the ladder gates each part. */
  when: OrderWhen;
}

export function defaultChoice(): RowChoice {
  return { until: "once", n: 10, deliver: "leave", where: "nearest", when: {} };
}

/** The condition fields a row draws, by the name each carries in its data attribute (data-row-season-from and its seven siblings). */
export const WHEN_FIELDS = ["season-from", "season-to", "stock-item", "stock-mode", "stock-n", "restart", "by", "spend"] as const;
export type WhenField = (typeof WHEN_FIELDS)[number];

/** The figure a stock line stands at, whichever side it reads from; one before a number is typed. */
export function stockQty(stock: OrderWhen["stock"]): number {
  return stock?.atLeast ?? stock?.under ?? 1;
}

/**
 * A condition field's value, written into the open row's when block. An
 * empty value is the field's "any" option and takes that part off. A season
 * picked on one side only runs from there right round the year, so the side
 * still on "any" narrows nothing until it is picked too.
 */
export function setWhenField(when: OrderWhen, field: WhenField, value: string): void {
  const num = Number(value);
  switch (field) {
    case "season-from":
      if (value === "") delete when.season;
      else when.season = { from: monthStartDoy(num), to: when.season?.to ?? (monthStartDoy(num) + 364) % 365 };
      break;
    case "season-to":
      if (value === "") delete when.season;
      else when.season = { from: when.season?.from ?? (monthStartDoy(num) + 1) % 365, to: monthStartDoy(num) };
      break;
    case "stock-item":
      if (value === "") delete when.stock;
      else when.stock = { ...(when.stock ?? { atLeast: 1 }), item: value as ItemId };
      break;
    case "stock-mode":
      // The figure follows the mode: a line already set reads the other way round rather than starting over.
      if (when.stock) when.stock = value === "under" ? { item: when.stock.item, under: stockQty(when.stock) } : { item: when.stock.item, atLeast: stockQty(when.stock) };
      break;
    case "stock-n":
      if (when.stock) when.stock = when.stock.under !== undefined ? { item: when.stock.item, under: Math.max(0, num || 0) } : { item: when.stock.item, atLeast: Math.max(0, num || 0) };
      break;
    case "restart":
      if (value === "") delete when.restart;
      else when.restart = Math.max(0, num || 0);
      break;
    case "by":
      if (value === "") delete when.by;
      else when.by = monthStartDoy(num);
      break;
    // A checkbox, so the value is its checked state as a string. It is only
    // ever true or absent: "held" is what a due date means on its own.
    case "spend":
      if (value === "") delete when.spend;
      else when.spend = true;
      break;
  }
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
 * skipped, without caching the new html, while a typed-in field inside this
 * panel has focus - the row's count, a condition's number, the name box:
 * rewriting the innerHTML there would destroy the focused input
 * mid-keystroke. Left uncached so the write is retried (and the field's
 * value re-synced) as soon as focus moves elsewhere. A select is not
 * guarded: it commits on the change, so a redraw that rebuilds it with the
 * chosen option selected loses nothing but the focus ring.
 */
export function setPanel(id: string, html: string, root: ParentNode = document): boolean {
  if (last.get(id) === html) return false;
  const el = root.querySelector<HTMLElement>(`#${id}`);
  if (!el) return false;
  const focused = document.activeElement;
  if (focused?.matches("input") && el.contains(focused)) return false;
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
    : choice.until === "daily" ? { kind: "daily", n: choice.n }
    : choice.until === "campHas" || choice.until === "keep" ? { kind: "campHas", qty: choice.n }
    : choice.until === "forever" ? { kind: "forever" }
    : { kind: "once" };
  // The restart line and the due date are a keep's alone, so a job or a grind leaves them
  // behind rather than being gated on conditions it would not read. An untouched when block
  // is left off the request entirely, so a plain click gives the order it always gave.
  const { restart: _restart, by: _by, ...rest } = choice.when;
  const set: OrderWhen = kind === "keep" ? choice.when : rest;
  const when = Object.keys(set).length ? { when: set } : {};
  return { req: { task: id, arg, until, deliver: choice.deliver, where: choice.where, ...when }, kind };
}
