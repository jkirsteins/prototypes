import type { TaskGroup } from "../sim/tasks";
import type { LogEntry, SpotId } from "../sim/types";

/** What the screen remembers that the game does not. */
export interface UiState {
  /** The raw list's tab, under the advanced toggle. */
  tab: TaskGroup;
  /** Region clicked on the map, or null for the one you stand in. */
  selected: number | null;
  /** Log lines produced while the tab was closed, until dismissed. */
  away: LogEntry[] | null;
  confirmAbandon: boolean;
  /** Index into ZOOMS: 0 is one cell per glyph. */
  zoom: number;
  /** The settings strip: what the next intent clicked will do. */
  until: "once" | "times" | "campHas" | "forever";
  n: number;
  deliver: "leave" | "camp";
  where: "nearest" | SpotId;
  advanced: boolean;
}

export function newUiState(): UiState {
  return {
    tab: "gather", selected: null, away: null, confirmAbandon: false, zoom: 0,
    until: "once", n: 10, deliver: "leave", where: "nearest", advanced: false,
  };
}

const last = new Map<string, string>();

/**
 * Replaces a panel's markup only when it changed, so a button is never
 * swapped out from under the pointer between mousedown and mouseup. Also
 * skipped, without caching the new html, while the strip's number field
 * inside this panel has focus: rewriting the innerHTML there would destroy
 * the focused input mid-keystroke. Left uncached so the write is retried
 * (and the field's value re-synced) as soon as focus moves elsewhere.
 */
export function setPanel(id: string, html: string, root: ParentNode = document): boolean {
  if (last.get(id) === html) return false;
  const el = root.querySelector<HTMLElement>(`#${id}`);
  if (!el) return false;
  const focused = document.activeElement;
  if (focused?.hasAttribute("data-strip-n") && el.contains(focused)) return false;
  last.set(id, html);
  el.innerHTML = html;
  return true;
}

export function resetPanels(): void {
  last.clear();
}

/** Clamps and commits the strip's number field to at least 1; shared by the input and change listeners so a keystroke and a blur agree. */
export function commitStripN(ui: UiState, value: string): void {
  ui.n = Math.max(1, Math.round(Number(value) || 1));
}

export function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
