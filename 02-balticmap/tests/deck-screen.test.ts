// @vitest-environment happy-dom
import { describe, it, expect, vi } from "vitest";
import { createDeckScreen, type DeckScreenCallbacks } from "../src/deck-screen";

function setup() {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const cb: DeckScreenCallbacks = {
    onStart: vi.fn(), onOpenPack: vi.fn(), onDismissReveal: vi.fn(),
  };
  const screen = createDeckScreen(container, cb);
  return { container, cb, screen };
}

const q = (c: HTMLElement, sel: string) => c.querySelector(sel) as HTMLElement;
const START = ["grow-crops", "raid", "subjugate", "fortify"];

const view = (over: Record<string, unknown> = {}) => ({
  visible: true, knownCards: START, collected: 0, pendingPacks: 0,
  reveal: null, ...over,
}) as Parameters<ReturnType<typeof createDeckScreen>["update"]>[0];

describe("createDeckScreen", () => {
  it("is hidden until shown, then offers the three starting cards", () => {
    const { container, cb, screen } = setup();
    expect(q(container, ".deck-screen").classList.contains("hidden")).toBe(true);
    screen.update(view());
    expect(q(container, ".deck-screen").classList.contains("hidden")).toBe(false);
    // three toggles plus the filler tile
    expect(container.querySelectorAll(".ds-deck .ds-card")).toHaveLength(4);
    expect(q(container, ".ds-counter").textContent).toBe(
      "0 picked + 10 Grow turnips = 10",
    );
    q(container, ".ds-start").click();
    expect(cb.onStart).toHaveBeenCalledWith([]);
  });

  it("reports collection progress against the pack pool", () => {
    const { container, screen } = setup();
    screen.update(view({ collected: 3 }));
    expect(q(container, ".ds-undiscovered").textContent).toBe("3 of 9 collected");
  });

  it("gates the deck builder behind a sealed pack and opens it on click", () => {
    const { container, cb, screen } = setup();
    screen.update(view({ pendingPacks: 1 }));
    const overlay = q(container, ".ds-pack-overlay");
    expect(overlay.classList.contains("hidden")).toBe(false);
    expect(q(container, ".ds-pack-sealed").classList.contains("hidden")).toBe(false);
    expect(q(container, ".ds-pack-count").textContent).toBe("1 pack to open");
    q(container, ".ds-pack-sealed").click();
    expect(cb.onOpenPack).toHaveBeenCalled();
  });

  it("pluralizes the waiting-pack count", () => {
    const { container, screen } = setup();
    screen.update(view({ pendingPacks: 3 }));
    expect(q(container, ".ds-pack-count").textContent).toBe("3 packs to open");
  });

  it("reveals both cards, tagging new ones and duplicates", () => {
    const { container, cb, screen } = setup();
    screen.update(view({
      pendingPacks: 1,
      reveal: [{ id: "alliance", isNew: true }, { id: "raid", isNew: false }],
    }));
    expect(q(container, ".ds-pack-sealed").classList.contains("hidden")).toBe(true);
    const cards = [...container.querySelectorAll(".ds-pack-card")];
    expect(cards).toHaveLength(2);
    expect(cards[0].querySelector(".ds-card-name")?.textContent).toBe("Alliance");
    expect(cards[0].querySelector(".ds-pack-new")).not.toBeNull();
    expect(cards[1].querySelector(".ds-pack-new")).toBeNull();
    expect(cards[1].querySelector(".ds-pack-dupe")?.textContent).toBe("already known");
    // Every revealed card states its rules - this is where a new card is learnt.
    for (const c of cards) {
      expect(c.querySelector(".ds-card-text")!.textContent!.length).toBeGreaterThan(0);
    }
    q(container, ".ds-pack-continue").click();
    expect(cb.onDismissReveal).toHaveBeenCalled();
  });

  it("shows the deck builder again once no packs are pending", () => {
    const { container, screen } = setup();
    screen.update(view({ pendingPacks: 1 }));
    expect(q(container, ".ds-pack-overlay").classList.contains("hidden")).toBe(false);
    screen.update(view({ pendingPacks: 0, reveal: null }));
    expect(q(container, ".ds-pack-overlay").classList.contains("hidden")).toBe(true);
  });

  it("caps picks at the deck size", () => {
    const { container, screen } = setup();
    screen.update(view({ knownCards: START }));
    const toggles = [...container.querySelectorAll(".ds-deck .ds-card")]
      .filter((c) => c.tagName === "BUTTON") as HTMLElement[];
    for (const t of toggles) t.click();
    expect(q(container, ".ds-counter").textContent).toBe(
      "3 picked + 7 Grow turnips = 10",
    );
  });
});
