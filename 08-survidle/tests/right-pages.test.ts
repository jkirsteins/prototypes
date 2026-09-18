/**
 * The right column's top slot: the alerts and the weather as pages, and on
 * a phone the map first, the strip carrying the alerts page's counts.
 */
import { describe, expect, it } from "vitest";
import { loadRightPage, PHONE_PAGES, RIGHT_PAGE_KEY, rightPagesHtml, saveRightPage } from "../src/ui/rightpages";

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
    expect(rightPagesHtml("map", { bad: 1, warn: 0 }, true)).toContain('class="badge bad"');
  });

  it("orders the tabs map, queue, alerts, weather on a phone, and alerts, weather on a desktop", () => {
    const pages = (html: string) => [...html.matchAll(/data-page="(\w+)"/g)].map((m) => m[1]);
    expect(pages(rightPagesHtml("weather", { bad: 0, warn: 0 }))).toEqual(["alerts", "weather"]);
    expect(pages(rightPagesHtml("map", { bad: 0, warn: 0 }, true))).toEqual(["map", "queue", "alerts", "weather"]);
    expect(rightPagesHtml("map", { bad: 0, warn: 0 }, true)).toMatch(/data-page="map" aria-pressed="true"/);
    expect(PHONE_PAGES).toEqual(["map", "queue"]);
  });

  it("carries the manual and settings buttons at its far end on a phone only", () => {
    const phone = rightPagesHtml("queue", { bad: 0, warn: 0 }, true);
    expect(phone).toContain('data-act="settings-open"');
    expect(phone).toContain('data-act="manual-open"');
    expect(phone.indexOf('class="spacer"')).toBeLessThan(phone.indexOf('data-act="manual-open"'));
    expect(rightPagesHtml("weather", { bad: 0, warn: 0 })).not.toContain("data-act=\"settings-open\"");
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
