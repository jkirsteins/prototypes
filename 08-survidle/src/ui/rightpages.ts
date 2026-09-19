/**
 * The top of the right column is one slot with pages under a button
 * strip: the weather and the alerts on a wide desktop; in a narrow window
 * the queue in front of them, since there the map spans the top of the
 * page and the right column is what is left under it, which on a short
 * window is a heading and no rows; and on a phone the map in front of
 * that, since a board that fills the phone's screen is a page you turn
 * to and not a panel you scroll past. Wide order: weather, alerts, as it
 * has always read; narrow: queue, alerts, weather; phone: map, queue,
 * alerts, weather. The first of each is the layout's default. The strip
 * carries the alerts page's news: with another page showing and alerts
 * standing, the Alerts button wears a red count and a yellow one, so the
 * page is never a place you have to remember to look. The choice is kept
 * across reloads, like the Do panes.
 */
import { esc } from "./render";

export type RightPage = "map" | "queue" | "alerts" | "weather";
export const RIGHT_PAGE_KEY = "survidle.rightPage";

/**
 * The three widths the strip serves. `wide` is three columns; `narrow` is
 * the two-column layout under 1300px, where the map spans the top and the
 * queue has no column height left; `phone` is one column under 700px,
 * where the map is a page too. The breakpoints are style.css's.
 */
export type RightLayout = "wide" | "narrow" | "phone";

/** The pages each layout has, the layout's default first. A page not in the list is a column or a panel there, not a page. */
export const RIGHT_PAGES: Record<RightLayout, readonly RightPage[]> = {
  wide: ["weather", "alerts"],
  narrow: ["queue", "alerts", "weather"],
  phone: ["map", "queue", "alerts", "weather"],
};

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

/** The strip: the layout's pages in their order, the shown one pressed. */
export function rightPagesHtml(page: RightPage, counts: { bad: number; warn: number }, layout: RightLayout = "wide"): string {
  const badges = page === "alerts"
    ? ""
    : `${counts.bad > 0 ? `<span class="badge bad" title="${counts.bad} happening now">${counts.bad}</span>` : ""}${counts.warn > 0 ? `<span class="badge warn" title="${counts.warn} next if nothing changes">${counts.warn}</span>` : ""}`;
  const tab = (id: RightPage, label: string, extra = "") =>
    `<button class="mini tab${page === id ? " on" : ""}" data-act="right-page" data-page="${id}" aria-pressed="${page === id}">${esc(label)}${extra}</button>`;
  // The Queue tab wears the running task's progress along its foot: the
  // fill is written by bars.ts each frame like every other bar, so the
  // strip's markup never carries a moving number.
  const taskFill = `<i class="tabfill" data-bar="task"></i>`;
  const label: Record<RightPage, string> = { map: "Map", queue: "Queue", alerts: "Alerts", weather: "Weather" };
  return RIGHT_PAGES[layout].map((id) => tab(id, label[id], id === "queue" ? taskFill : id === "alerts" ? badges : "")).join("");
}
