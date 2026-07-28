// @vitest-environment happy-dom
import { describe, it, expect, vi } from "vitest";
import { createDeckScreen, type DeckScreenCallbacks } from "../src/deck-screen";

function setup() {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const cb: DeckScreenCallbacks = { onUnlock: vi.fn(), onStart: vi.fn() };
  const screen = createDeckScreen(container, cb);
  return { container, cb, screen };
}

const q = (c: HTMLElement, sel: string) => c.querySelector(sel) as HTMLElement;

describe("createDeckScreen", () => {
  it("is hidden until shown, and first-run shows only filler + start", () => {
    const { container, cb, screen } = setup();
    expect(q(container, ".deck-screen").classList.contains("hidden")).toBe(true);
    screen.update({
      visible: true, knownCards: ["grow-crops"], seenPool: [], unlockUsed: false,
    });
    expect(q(container, ".deck-screen").classList.contains("hidden")).toBe(false);
    expect(q(container, ".ds-unlock-section").classList.contains("hidden")).toBe(true);
    expect(container.querySelectorAll(".ds-deck .ds-card")).toHaveLength(1); // filler only
    expect(q(container, ".ds-counter").textContent).toBe(
      "0 picked + 10 Grow potatoes = 10",
    );
    q(container, ".ds-start").click();
    expect(cb.onStart).toHaveBeenCalledWith([]);
  });

  it("unlock row lists the pool and collapses after one unlock", () => {
    const { container, cb, screen } = setup();
    screen.update({
      visible: true, knownCards: ["grow-crops"],
      seenPool: ["raid", "fortify"], unlockUsed: false,
    });
    const locked = [...container.querySelectorAll(".ds-unlock .ds-card")];
    expect(locked.map((c) => c.querySelector(".ds-card-name")?.textContent)).toEqual([
      "Raid", "Fortify",
    ]);
    (locked[0] as HTMLElement).click();
    expect(cb.onUnlock).toHaveBeenCalledWith("raid");
    screen.update({
      visible: true, knownCards: ["grow-crops", "raid"],
      seenPool: ["fortify"], unlockUsed: true,
    });
    expect(q(container, ".ds-unlock-section").classList.contains("hidden")).toBe(true);
  });

  it("known non-basics toggle, are pre-selected, and feed onStart", () => {
    const { container, cb, screen } = setup();
    screen.update({
      visible: true, knownCards: ["grow-crops", "raid", "fortify"],
      seenPool: [], unlockUsed: false,
    });
    const toggles = [...container.querySelectorAll(".ds-deck .ds-card")].filter(
      (c) => !c.classList.contains("ds-filler"),
    ) as HTMLElement[];
    expect(toggles.map((c) => c.querySelector(".ds-card-name")?.textContent)).toEqual([
      "Raid", "Fortify",
    ]);
    expect(toggles.every((c) => c.classList.contains("selected"))).toBe(true);
    expect(q(container, ".ds-counter").textContent).toBe(
      "2 picked + 8 Grow potatoes = 10",
    );
    toggles[1].click(); // deselect fortify
    expect(toggles[1].classList.contains("selected")).toBe(false);
    expect(q(container, ".ds-counter").textContent).toBe(
      "1 picked + 9 Grow potatoes = 10",
    );
    q(container, ".ds-start").click();
    expect(cb.onStart).toHaveBeenCalledWith(["raid"]);
  });

  it("a newly unlocked card arrives pre-selected without resetting other toggles", () => {
    const { container, screen } = setup();
    screen.update({
      visible: true, knownCards: ["grow-crops", "raid"],
      seenPool: ["fortify"], unlockUsed: false,
    });
    const raid = [...container.querySelectorAll(".ds-deck .ds-card")].find(
      (c) => c.querySelector(".ds-card-name")?.textContent === "Raid",
    ) as HTMLElement;
    raid.click(); // deselect raid
    screen.update({
      visible: true, knownCards: ["grow-crops", "raid", "fortify"],
      seenPool: [], unlockUsed: true,
    });
    const cards = [...container.querySelectorAll(".ds-deck .ds-card")];
    const byText = (t: string) =>
      cards.find((c) => c.querySelector(".ds-card-name")?.textContent === t) as HTMLElement;
    expect(byText("Raid").classList.contains("selected")).toBe(false);
    expect(byText("Fortify").classList.contains("selected")).toBe(true);
  });

  it("shows rules text on unlock and deck cards", () => {
    const { container, screen } = setup();
    screen.update({
      visible: true, knownCards: ["grow-crops", "subjugate"],
      seenPool: ["raid"], unlockUsed: false,
    });
    const unlock = container.querySelector(".ds-unlock .ds-card")!;
    expect(unlock.querySelector(".ds-card-name")!.textContent).toBe("Raid");
    expect(unlock.querySelector(".ds-card-text")!.textContent).toBe(
      "Gain +1 Might over one faction in reach of your realm.",
    );
    const deckCard = container.querySelector(".ds-deck .ds-card")!;
    expect(deckCard.querySelector(".ds-card-name")!.textContent).toBe("Subjugate");
    expect(deckCard.querySelector(".ds-card-text")!.textContent?.length).toBeGreaterThan(0);
  });

  it("shows the undiscovered counter when neither known nor pool cover every non-basic", () => {
    const { container, screen } = setup();
    screen.update({
      visible: true, knownCards: ["grow-crops"], seenPool: [], unlockUsed: false,
    });
    const undiscovered = q(container, ".ds-undiscovered");
    expect(undiscovered.classList.contains("hidden")).toBe(false);
    expect(undiscovered.textContent).toBe("7 cards still undiscovered");
  });

  it("deducts known and pool cards from the undiscovered count", () => {
    const { container, screen } = setup();
    screen.update({
      visible: true, knownCards: ["grow-crops", "raid", "subjugate"],
      seenPool: ["fortify"], unlockUsed: false,
    });
    // 7 non-basics total - raid, subjugate (known) - fortify (pool) = 4 left
    expect(q(container, ".ds-undiscovered").textContent).toBe("4 cards still undiscovered");
  });

  it("hides the undiscovered counter once every non-basic is known or in the pool", () => {
    const { container, screen } = setup();
    screen.update({
      visible: true,
      knownCards: [
        "grow-crops", "raid", "shrewd-marriage", "fortify", "subjugate",
      ],
      seenPool: ["incorporate", "reclaim-independence", "revolt"],
      unlockUsed: false,
    });
    expect(q(container, ".ds-undiscovered").classList.contains("hidden")).toBe(true);
  });
});
