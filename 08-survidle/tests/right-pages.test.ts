/**
 * The right column's top slot: the weather and the alerts as two pages,
 * the strip carrying the other page's counts.
 */
import { describe, expect, it } from "vitest";
import { loadRightPage, RIGHT_PAGE_KEY, rightPagesHtml, saveRightPage } from "../src/ui/rightpages";

function fakeStorage(): Storage {
  const m = new Map<string, string>();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v), removeItem: (k) => void m.delete(k), clear: () => m.clear(), key: () => null, length: 0 } as Storage;
}

describe("the right column's pages", () => {
  it("wears the alert counts on the Alerts button while the weather shows, and not on its own page", () => {
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
  });

  it("keeps the choice across reloads and defaults to the weather", () => {
    const storage = fakeStorage();
    expect(loadRightPage(storage)).toBe("weather");
    saveRightPage(storage, "alerts");
    expect(storage.getItem(RIGHT_PAGE_KEY)).toBe("alerts");
    expect(loadRightPage(storage)).toBe("alerts");
    storage.setItem(RIGHT_PAGE_KEY, "nonsense");
    expect(loadRightPage(storage)).toBe("weather");
  });
});
