/**
 * The top of the right column is one slot with two pages, the weather and
 * the alerts, under a two-button strip. The strip carries the other page's
 * news: with the weather showing and alerts standing, the Alerts button
 * wears a red count and a yellow one, so the page is never a place you
 * have to remember to look. The choice is kept across reloads, like the
 * Do panes.
 */
import { esc } from "./render";

export type RightPage = "weather" | "alerts";
export const RIGHT_PAGE_KEY = "survidle.rightPage";

export function loadRightPage(storage: Storage): RightPage {
  try {
    const v = storage.getItem(RIGHT_PAGE_KEY);
    return v === "alerts" ? "alerts" : "weather";
  } catch { return "weather"; }
}

export function saveRightPage(storage: Storage, page: RightPage): void {
  try { storage.setItem(RIGHT_PAGE_KEY, page); } catch { /* a storage that refuses keeps the page for the session only */ }
}

export function rightPagesHtml(page: RightPage, counts: { bad: number; warn: number }): string {
  const badges = page === "alerts"
    ? ""
    : `${counts.bad > 0 ? `<span class="badge bad" title="${counts.bad} happening now">${counts.bad}</span>` : ""}${counts.warn > 0 ? `<span class="badge warn" title="${counts.warn} next if nothing changes">${counts.warn}</span>` : ""}`;
  const tab = (id: RightPage, label: string, extra = "") =>
    `<button class="mini tab${page === id ? " on" : ""}" data-act="right-page" data-page="${id}" aria-pressed="${page === id}">${esc(label)}${extra}</button>`;
  return `${tab("weather", "Weather")}${tab("alerts", "Alerts", badges)}`;
}
