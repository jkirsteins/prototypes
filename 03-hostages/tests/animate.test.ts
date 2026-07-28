import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { flyCard, centerOf } from "../src/ui/animate";

let container: HTMLElement;

beforeEach(() => {
  vi.useFakeTimers();
  document.body.innerHTML = "<div id='app'></div>";
  container = document.querySelector<HTMLElement>("#app") as HTMLElement;
});

afterEach(() => {
  vi.useRealTimers();
});

const from = { x: 10, y: 20, width: 60, height: 90 };

describe("flyCard", () => {
  it("appends a card immediately and positions it at the origin", () => {
    flyCard(container, "back", "", from, [{ to: { x: 200, y: 200 }, scale: 1, durationMs: 100 }]);
    const card = container.querySelector<HTMLElement>(".flying-card");
    expect(card).not.toBeNull();
    expect(card?.style.left).toBe("10px");
    expect(card?.style.top).toBe("20px");
    expect(card?.className).toContain("back");
  });

  it("applies each stage transform in order", () => {
    flyCard(container, "", "Backhand", from, [
      { to: { x: 100, y: 100 }, scale: 1.5, durationMs: 100 },
      { to: { x: 300, y: 300 }, scale: 0.6, durationMs: 200 },
    ]);
    const card = container.querySelector<HTMLElement>(".flying-card") as HTMLElement;
    vi.advanceTimersByTime(30);
    expect(card.style.transform).toContain("scale(1.5)");
    vi.advanceTimersByTime(120);
    expect(card.style.transform).toContain("scale(0.6)");
  });

  it("removes the element and calls onDone after the last stage", () => {
    const done = vi.fn();
    flyCard(container, "", "x", from, [{ to: { x: 50, y: 50 }, scale: 1, durationMs: 100 }], done);
    expect(container.querySelector(".flying-card")).not.toBeNull();
    vi.advanceTimersByTime(1000);
    expect(container.querySelector(".flying-card")).toBeNull();
    expect(done).toHaveBeenCalledTimes(1);
  });

  it("still cleans up and reports done when there are no stages", () => {
    const done = vi.fn();
    flyCard(container, "", "x", from, [], done);
    vi.advanceTimersByTime(1000);
    expect(container.querySelector(".flying-card")).toBeNull();
    expect(done).toHaveBeenCalledTimes(1);
  });

  it("honours the hold between stages", () => {
    flyCard(container, "", "x", from, [
      { to: { x: 100, y: 100 }, scale: 1, durationMs: 100, holdMs: 500 },
      { to: { x: 200, y: 200 }, scale: 1, durationMs: 100 },
    ]);
    vi.advanceTimersByTime(300);
    expect(container.querySelector(".flying-card")).not.toBeNull();
    vi.advanceTimersByTime(500);
    expect(container.querySelector(".flying-card")).toBeNull();
  });

  it("labels the card so a player can read what flew", () => {
    flyCard(container, "", "Backhand", from, []);
    expect(container.querySelector(".flying-card")?.textContent).toBe("Backhand");
  });
});

describe("centerOf", () => {
  it("returns the middle of a rect", () => {
    expect(centerOf({ x: 10, y: 20, width: 100, height: 40 } as DOMRect)).toEqual({
      x: 60,
      y: 40,
    });
  });
});
