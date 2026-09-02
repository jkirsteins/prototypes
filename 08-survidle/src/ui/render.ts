import type { TaskGroup } from "../sim/tasks";
import type { LogEntry } from "../sim/types";

/** What the screen remembers that the game does not. */
export interface UiState {
  tab: TaskGroup;
  /** Region clicked on the map, or null for the one you stand in. */
  selected: number | null;
  /** Log lines produced while the tab was closed, until dismissed. */
  away: LogEntry[] | null;
  confirmAbandon: boolean;
}

export function newUiState(): UiState {
  return { tab: "gather", selected: null, away: null, confirmAbandon: false };
}

const last = new Map<string, string>();

/**
 * Replaces a panel's markup only when it changed, so a button is never
 * swapped out from under the pointer between mousedown and mouseup.
 */
export function setPanel(id: string, html: string, root: ParentNode = document): boolean {
  if (last.get(id) === html) return false;
  const el = root.querySelector<HTMLElement>(`#${id}`);
  if (!el) return false;
  last.set(id, html);
  el.innerHTML = html;
  return true;
}

export function resetPanels(): void {
  last.clear();
}

export function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
