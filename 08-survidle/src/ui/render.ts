import { monthStartDoy } from "../sim/calendar";
import { NOT_ORDERS } from "../sim/ladder";
import { type HurryState, newHurry } from "./hurry";
import { newSpeedHistory, type SpeedHistory } from "./speed-history";
import { DEFAULT_ZOOM } from "./map";
import { defaultPanes, type Panes } from "./panes";
import { DEFAULT_TRAVEL_DISPLAY, type TravelDisplay } from "./travel";
import type { AwaySummary } from "../sim/save";
import type { GoalId, IntentRequest, ItemId, OrderKind, OrderWhen, Rung, SpotId, TaskId, UntilChoice } from "../sim/types";

/** What the screen remembers that the game does not. */
export interface UiState {
  /** How every route estimate is shown in this browser. */
  travelDisplay: TravelDisplay;
  /** Which pane is showing, and where in the Do pane the player was; remembered across a reload. */
  panes: Panes;
  /** Region clicked on the map, or null for the one you stand in. */
  selected: number | null;
  /** The map cell under the pointer, or null when the pointer is off the board. Derived from where the pointer is, never from a glyph's own enter and leave. */
  hover: number | null;
  /** What happened while the tab was closed, until dismissed. */
  away: AwaySummary | null;
  confirmAbandon: boolean;
  /** The Make camp row is showing its confirm step. Binding a camp is one click and no undo. */
  confirmCamp: boolean;
  /** The cemetery overlay is open. */
  cemetery: boolean;
  /** The manual overlay is open. */
  manual: boolean;
  /** The rung whose moment is open, drained one at a time from state.teachQueue. */
  teach: Rung | null;
  /** Goal guidance open now, whether automatic or reopened from a pinned row. */
  goalGuide: { ids: GoalId[]; done: GoalId[]; notices?: string[]; automatic: boolean } | null;
  /** The recognized wildlife subject whose naming moment is open. */
  recognition: number | null;
  /** The landing's welcome is open. Every landing has one, fresh survivor or heir. */
  welcome: boolean;
  /** The settings panel (sound, and the play-data beacon) is open. */
  settings: boolean;
  /** Survivor index whose entry is expanded in the cemetery, or null for none. */
  cemeteryOpen: number | null;
  /** The cemetery's "leave this world" button is showing its confirm step. */
  confirmLeave: boolean;
  /** The day catchUp was called on, so the away report's since-line reads from where the player left off. */
  awayFromDay: number;
  /** The copy button reads "copied" until this real-time millisecond. */
  /** Index into ZOOMS: 0 is one cell per glyph. */
  zoom: number;
  /** The Do row whose kinds are open, or null. */
  open: { id: TaskId; arg: string } | null;
  /** The open row's choice; reset when another row opens. */
  choice: RowChoice;
  /** The Do panel's filter box: narrows rows to those whose label contains it, case-insensitive. */
  filter: string;
  /** Specific tree, fish, and neighbouring-region rows are tucked behind their named chooser. */
  specific: { trees: boolean; fish: boolean; regions: boolean };
  /** The hurry: how fast the work chosen by hand is running right now. Never saved. */
  hurry: HurryState;
  /** Last minute of real-time speed, for the weather footer. Never saved. */
  speedHistory: SpeedHistory;
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
    panes: defaultPanes(), travelDisplay: DEFAULT_TRAVEL_DISPLAY, selected: null, hover: null, away: null, confirmAbandon: false, confirmCamp: false,
    cemetery: false, manual: false, teach: null, goalGuide: null, recognition: null, welcome: false, settings: false, cemeteryOpen: null, confirmLeave: false, awayFromDay: 1, zoom: DEFAULT_ZOOM,
    open: null, choice: defaultChoice(), filter: "", specific: { trees: false, fish: false, regions: false },
    hurry: newHurry(), speedHistory: newSpeedHistory(),
  };
}

const last = new Map<string, string>();

/**
 * Panels are written as whole markup strings, and the cheap way to put one on
 * the screen is to assign it to innerHTML. That throws away every node in the
 * panel and builds new ones, and with them goes everything the DOM owns and
 * the game state has never heard of: how far a list is scrolled, which
 * control has focus and where its caret sits, an open dropdown, the phase of
 * a running animation. A panel that redraws while someone is using it then
 * yanks the list back to the top and drops what they were typing into.
 *
 * So the markup is not assigned; it is morphed in. The new string is parsed
 * to a detached tree and the panel is walked against it, changing only what
 * actually differs: an attribute here, a line of text there, a row inserted
 * or dropped. A node that is the same before and after is never touched, and
 * a node that is never touched keeps its scroll, its focus and its caret
 * because it was never taken away. This is what React and its neighbours do
 * with a virtual DOM, and the reason to do it here rather than adopt one is
 * that it costs a page of code and no dependency, and every panel goes on
 * being authored as the template string it already is.
 */

/**
 * What names an element among its siblings, so a row that moved is found
 * again rather than being rebuilt in place. A Do row's data-opt, a fill's
 * data-fill and a button's data-act all serve; an element carrying none is
 * matched by its position, which is what plain text and layout divs want.
 */
function keyOf(el: Element): string | null {
  if (el.id) return `#${el.id}`;
  const data = Object.entries((el as HTMLElement).dataset ?? {})
    .map(([k, v]) => `${k}=${v}`)
    .sort()
    .join(",");
  return data ? `${el.tagName}[${data}]` : null;
}

function sameKind(a: Node, b: Node): boolean {
  if (a.nodeType !== b.nodeType) return false;
  return a.nodeType === Node.ELEMENT_NODE ? (a as Element).tagName === (b as Element).tagName : true;
}

/**
 * Brings one element's attributes to match another's.
 *
 * style is the exception, and deliberately: the width of every bar is
 * written straight onto the element each frame by bars.ts, and the markup
 * never mentions it. Clearing a style the markup does not carry would wipe
 * those every time a panel changed. A style the markup does state still wins.
 */
function morphAttrs(from: Element, to: Element): void {
  for (const attr of [...to.attributes]) {
    if (from.getAttribute(attr.name) !== attr.value) from.setAttribute(attr.name, attr.value);
  }
  for (const attr of [...from.attributes]) {
    if (attr.name !== "style" && !to.hasAttribute(attr.name)) from.removeAttribute(attr.name);
  }
  // A field's value follows the state only while nobody is in it: what is half-typed is the player's.
  const tag = from.tagName;
  if ((tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") && from !== document.activeElement) {
    const want = to.getAttribute("value");
    const field = from as HTMLInputElement;
    if (want !== null && field.value !== want) field.value = want;
  }
}

/** Walks one element's children against another's, moving, changing and dropping rather than replacing. */
function morphChildren(from: Element, to: Element | DocumentFragment): void {
  // Rows that carry a name can be found again wherever they have moved to.
  const named = new Map<string, Element>();
  for (const node of [...from.childNodes]) {
    if (node.nodeType !== Node.ELEMENT_NODE) continue;
    const k = keyOf(node as Element);
    if (k && !named.has(k)) named.set(k, node as Element);
  }
  let at: ChildNode | null = from.firstChild;
  for (const want of [...to.childNodes]) {
    const key = want.nodeType === Node.ELEMENT_NODE ? keyOf(want as Element) : null;
    const bykey = key ? named.get(key) : undefined;
    let take: ChildNode | null = null;
    if (bykey && sameKind(bykey, want)) {
      // Named: reuse it wherever it sat, so a row keeps its identity across an insertion above it.
      if (bykey !== at) from.insertBefore(bykey, at);
      take = bykey;
      named.delete(key as string);
      at = bykey;
    } else if (at && sameKind(at, want) && !(at.nodeType === Node.ELEMENT_NODE && keyOf(at as Element))) {
      take = at;
    }
    if (take) {
      morphNode(take, want);
      at = take.nextSibling;
    } else {
      from.insertBefore(want.cloneNode(true), at);
    }
  }
  while (at) {
    const next: ChildNode | null = at.nextSibling;
    at.remove();
    at = next;
  }
}

function morphNode(from: Node, to: Node): void {
  if (from.nodeType !== Node.ELEMENT_NODE) {
    if (from.nodeValue !== to.nodeValue) from.nodeValue = to.nodeValue;
    return;
  }
  morphAttrs(from as Element, to as Element);
  morphChildren(from as Element, to as Element);
}

/**
 * Replaces a panel's markup only when it changed, and changes only the parts
 * of it that actually differ. A button is never swapped out from under the
 * pointer between mousedown and mouseup, a list keeps its place, and a field
 * being typed into keeps its text, its focus and its caret - not because any
 * of that is saved and put back, but because the nodes holding it are left
 * alone.
 */
export function setPanel(id: string, html: string, root: ParentNode = document): boolean {
  if (last.get(id) === html) return false;
  const el = root.querySelector<HTMLElement>(`#${id}`);
  if (!el) return false;
  last.set(id, html);
  const parsed = document.createElement("template");
  parsed.innerHTML = html;
  morphChildren(el, parsed.content);
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
