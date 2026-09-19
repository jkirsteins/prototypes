/**
 * The right column's top slot: the alerts and the weather as pages, in a
 * narrow window the queue in front of them, and on a phone the map first,
 * the strip carrying the alerts page's counts.
 */
import { describe, expect, it } from "vitest";
import { loadRightPage, RIGHT_PAGE_KEY, RIGHT_PAGES, rightPagesHtml, saveRightPage } from "../src/ui/rightpages";

function fakeStorage(): Storage {
  const m = new Map<string, string>();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v), removeItem: (k) => void m.delete(k), clear: () => m.clear(), key: () => null, length: 0 } as Storage;
}

describe("the right column's pages", () => {
  it("wears the alert counts on the Alerts button while another page shows, and not on its own page", () => {
    const weather = rightPagesHtml("weather", { bad: 2, warn: 1 });
    expect(weather).toContain('class="badge bad"');
    expect(weather).toContain(">2</span>");
    expect(weather).toContain('class="badge warn"');
    expect(weather).toContain(">1</span>");
    expect(weather).toMatch(/data-page="weather" aria-pressed="true"/);
    const alerts = rightPagesHtml("alerts", { bad: 2, warn: 1 });
    expect(alerts).not.toContain("badge");
    expect(alerts).toMatch(/data-page="alerts" aria-pressed="true"/);
    expect(rightPagesHtml("weather", { bad: 0, warn: 0 })).not.toContain("badge");
    expect(rightPagesHtml("map", { bad: 1, warn: 0 }, "phone")).toContain('class="badge bad"');
    expect(rightPagesHtml("queue", { bad: 1, warn: 0 }, "narrow")).toContain('class="badge bad"');
  });

  it("orders the tabs map, queue, alerts, weather on a phone, queue, alerts, weather in a narrow window, and weather, alerts wide as always", () => {
    const pages = (html: string) => [...html.matchAll(/data-page="(\w+)"/g)].map((m) => m[1]);
    expect(pages(rightPagesHtml("weather", { bad: 0, warn: 0 }))).toEqual(["weather", "alerts"]);
    expect(pages(rightPagesHtml("queue", { bad: 0, warn: 0 }, "narrow"))).toEqual(["queue", "alerts", "weather"]);
    expect(pages(rightPagesHtml("map", { bad: 0, warn: 0 }, "phone"))).toEqual(["map", "queue", "alerts", "weather"]);
    expect(rightPagesHtml("map", { bad: 0, warn: 0 }, "phone")).toMatch(/data-page="map" aria-pressed="true"/);
    expect(rightPagesHtml("queue", { bad: 0, warn: 0 }, "narrow")).toMatch(/data-page="queue" aria-pressed="true"/);
    // The strip is the table: every layout's default is its first page, and the map is only ever a phone's page.
    for (const layout of ["wide", "narrow", "phone"] as const) expect(pages(rightPagesHtml(RIGHT_PAGES[layout][0], { bad: 0, warn: 0 }, layout))).toEqual([...RIGHT_PAGES[layout]]);
    expect(RIGHT_PAGES.wide[0]).toBe("weather");
    expect(RIGHT_PAGES.narrow[0]).toBe("queue");
    expect(RIGHT_PAGES.phone[0]).toBe("map");
    expect(RIGHT_PAGES.narrow).not.toContain("map");
  });

  it("wears the running task's bar on the Queue tab, written by bars.ts like every bar", () => {
    for (const layout of ["narrow", "phone"] as const) {
      expect(rightPagesHtml("alerts", { bad: 0, warn: 0 }, layout)).toMatch(/data-page="queue"[^>]*>Queue<i class="tabfill" data-bar="task"><\/i><\/button>/);
    }
    expect(rightPagesHtml("weather", { bad: 0, warn: 0 })).not.toContain("tabfill");
  });

  it("carries no button but its tabs: the manual and the settings are the footer's", () => {
    for (const html of [rightPagesHtml("queue", { bad: 0, warn: 0 }, "phone"), rightPagesHtml("queue", { bad: 0, warn: 0 }, "narrow"), rightPagesHtml("weather", { bad: 0, warn: 0 })]) {
      expect(html).not.toContain("settings");
      expect(html).not.toContain("manual");
    }
  });

  it("keeps the choice across reloads and falls back to what the caller names", () => {
    const storage = fakeStorage();
    expect(loadRightPage(storage)).toBe("weather");
    expect(loadRightPage(storage, "map")).toBe("map");
    saveRightPage(storage, "alerts");
    expect(storage.getItem(RIGHT_PAGE_KEY)).toBe("alerts");
    expect(loadRightPage(storage)).toBe("alerts");
    saveRightPage(storage, "map");
    expect(loadRightPage(storage)).toBe("map");
    saveRightPage(storage, "queue");
    expect(loadRightPage(storage)).toBe("queue");
    storage.setItem(RIGHT_PAGE_KEY, "nonsense");
    expect(loadRightPage(storage)).toBe("weather");
  });
});
