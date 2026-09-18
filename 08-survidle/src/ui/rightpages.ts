/**
 * The top of the right column is one slot with pages under a button
 * strip: the weather and the alerts on a desktop, and on a phone the map
 * and the queue in front of them, since a board that fills the phone's
 * screen is a page you turn to and not a panel you scroll past. Desktop
 * order: weather, alerts, as it has always read; phone order: map, queue,
 * alerts, weather. The strip carries the alerts page's news: with another
 * page showing and alerts standing, the Alerts button wears a red count
 * and a yellow one, so the page is never a place you have to remember to
 * look. The choice is kept across reloads, like the Do panes.
 */
import { esc } from "./render";

export type RightPage = "map" | "queue" | "alerts" | "weather";
export const RIGHT_PAGE_KEY = "survidle.rightPage";

/** The stored page, or `fallback` when nothing is stored: the map on a phone, the weather on a desktop. */
export function loadRightPage(storage: Storage, fallback: RightPage = "weather"): RightPage {
  try {
    const v = storage.getItem(RIGHT_PAGE_KEY);
    return v === "alerts" || v === "weather" || v === "map" || v === "queue" ? v : fallback;
  } catch { return fallback; }
}

export function saveRightPage(storage: Storage, page: RightPage): void {
  try { storage.setItem(RIGHT_PAGE_KEY, page); } catch { /* a storage that refuses keeps the page for the session only */ }
}

/** The pages a phone has that a desktop does not: there they are the centre column and the right column. */
export const PHONE_PAGES: readonly RightPage[] = ["map", "queue"];

/** The strip. On a phone (`phone`) the map and the queue are pages too, in front of the alerts and the weather. */
export function rightPagesHtml(page: RightPage, counts: { bad: number; warn: number }, phone = false): string {
  const badges = page === "alerts"
    ? ""
    : `${counts.bad > 0 ? `<span class="badge bad" title="${counts.bad} happening now">${counts.bad}</span>` : ""}${counts.warn > 0 ? `<span class="badge warn" title="${counts.warn} next if nothing changes">${counts.warn}</span>` : ""}`;
  const tab = (id: RightPage, label: string, extra = "") =>
    `<button class="mini tab${page === id ? " on" : ""}" data-act="right-page" data-page="${id}" aria-pressed="${page === id}">${esc(label)}${extra}</button>`;
  // The Queue tab wears the running task's progress along its foot: the
  // fill is written by bars.ts each frame like every other bar, so the
  // strip's markup never carries a moving number.
  const taskFill = `<i class="tabfill" data-bar="task"></i>`;
  return phone
    ? `${tab("map", "Map")}${tab("queue", "Queue", taskFill)}${tab("alerts", "Alerts", badges)}${tab("weather", "Weather")}`
    : `${tab("weather", "Weather")}${tab("alerts", "Alerts", badges)}`;
}
