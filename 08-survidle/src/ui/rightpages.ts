/**
 * The top of the right column is one slot with pages under a button
 * strip: the alerts and the weather, and on a phone the map as well,
 * since a board that fills the phone's screen is a page you turn to and
 * not a panel you scroll past. Order: map, alerts, weather. The strip
 * carries the alerts page's news: with another page showing and alerts
 * standing, the Alerts button wears a red count and a yellow one, so the
 * page is never a place you have to remember to look. The choice is kept
 * across reloads, like the Do panes.
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

/**
 * The strip. On a phone (`phone`) the map and the queue are pages too, in
 * front of the alerts and the weather, and the strip's far end carries the
 * manual and settings buttons, since the If-you-leave panel that holds them
 * on a desktop is not shown on a phone.
 */
export function rightPagesHtml(page: RightPage, counts: { bad: number; warn: number }, phone = false): string {
  const badges = page === "alerts"
    ? ""
    : `${counts.bad > 0 ? `<span class="badge bad" title="${counts.bad} happening now">${counts.bad}</span>` : ""}${counts.warn > 0 ? `<span class="badge warn" title="${counts.warn} next if nothing changes">${counts.warn}</span>` : ""}`;
  const tab = (id: RightPage, label: string, extra = "") =>
    `<button class="mini tab${page === id ? " on" : ""}" data-act="right-page" data-page="${id}" aria-pressed="${page === id}">${esc(label)}${extra}</button>`;
  const tools = phone
    ? `<span class="spacer"></span><button type="button" class="mini" data-act="manual-open">manual</button><button type="button" class="mini" data-act="settings-open">settings</button>`
    : "";
  return `${phone ? `${tab("map", "Map")}${tab("queue", "Queue")}` : ""}${tab("alerts", "Alerts", badges)}${tab("weather", "Weather")}${tools}`;
}
