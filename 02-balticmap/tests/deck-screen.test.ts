// @vitest-environment happy-dom
import { describe, it, expect, vi } from "vitest";
import { createDeckScreen, type DeckScreenCallbacks } from "../src/deck-screen";

function setup() {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const cb: DeckScreenCallbacks = { onStart: vi.fn(), onDismissLearned: vi.fn() };
  const screen = createDeckScreen(container, cb);
  return { container, cb, screen };
}

const q = (c: HTMLElement, sel: string) => c.querySelector(sel) as HTMLElement;

describe("createDeckScreen", () => {
  it("is hidden until shown, and first-run shows only filler + start", () => {
    const { container, cb, screen } = setup();
    expect(q(container, ".deck-screen").classList.contains("hidden")).toBe(true);
    screen.update({
      visible: true, knownCards: ["grow-crops"], seenPool: [], learned: [],
    });
    expect(q(container, ".deck-screen").classList.contains("hidden")).toBe(false);
    expect(q(container, ".ds-learned-overlay").classList.contains("hidden")).toBe(true);
    expect(container.querySelectorAll(".ds-deck .ds-card")).toHaveLength(1); // filler only
    expect(q(container, ".ds-counter").textContent).toBe(
      "0 picked + 10 Grow turnips = 10",
    );
    q(container, ".ds-start").click();
    expect(cb.onStart).toHaveBeenCalledWith([]);
  });

  it("announces every learned card with its rules text, and dismisses", () => {
    const { container, cb, screen } = setup();
    screen.update({
      visible: true, knownCards: ["grow-crops", "raid", "fortify"],
      seenPool: [], learned: ["raid", "fortify"],
    });
    const overlay = q(container, ".ds-learned-overlay");
    expect(overlay.classList.contains("hidden")).toBe(false);
    expect(q(container, ".ds-learned-title").textContent).toBe(
      "You learned 2 new cards",
    );
    const entries = [...container.querySelectorAll(".ds-learned-entry")];
    expect(entries.map((e) => e.querySelector(".ds-card-name")?.textContent)).toEqual([
      "Raid", "Fortify",
    ]);
    // The modal is the only place a newly learned card's rules are stated.
    for (const e of entries) {
      expect(e.querySelector(".ds-card-text")!.textContent!.length).toBeGreaterThan(0);
    }
    q(container, ".ds-learned-card .notice-continue").click();
    expect(cb.onDismissLearned).toHaveBeenCalled();
    // Dismissal is the owner's call: it clears `learned` and re-renders.
    screen.update({
      visible: true, knownCards: ["grow-crops", "raid", "fortify"],
      seenPool: [], learned: [],
    });
    expect(q(container, ".ds-learned-overlay").classList.contains("hidden")).toBe(true);
  });

  it("uses the singular title for a single learned card", () => {
    const { container, screen } = setup();
    screen.update({
      visible: true, knownCards: ["grow-crops", "raid"],
      seenPool: [], learned: ["raid"],
    });
    expect(q(container, ".ds-learned-title").textContent).toBe(
      "You learned a new card",
    );
  });

  it("learned cards are already pickable: learning is not a separate step", () => {
    const { container, screen } = setup();
    screen.update({
      visible: true, knownCards: ["grow-crops", "raid", "fortify"],
      seenPool: [], learned: ["raid", "fortify"],
    });
    const toggles = [...container.querySelectorAll(".ds-deck .ds-card")].filter(
      (c) => !c.classList.contains("ds-filler"),
    );
    expect(toggles.map((c) => c.querySelector(".ds-card-name")?.textContent)).toEqual([
      "Raid", "Fortify",
    ]);
  });

  it("known non-basics start unselected, toggle on, and feed onStart", () => {
    const { container, cb, screen } = setup();
    screen.update({
      visible: true, knownCards: ["grow-crops", "raid", "fortify"],
      seenPool: [], learned: [],
    });
    const toggles = [...container.querySelectorAll(".ds-deck .ds-card")].filter(
      (c) => !c.classList.contains("ds-filler"),
    ) as HTMLElement[];
    expect(toggles.map((c) => c.querySelector(".ds-card-name")?.textContent)).toEqual([
      "Raid", "Fortify",
    ]);
    expect(toggles.some((c) => c.classList.contains("selected"))).toBe(false);
    expect(q(container, ".ds-counter").textContent).toBe(
      "0 picked + 10 Grow turnips = 10",
    );
    toggles[0].click(); // take raid
    expect(toggles[0].classList.contains("selected")).toBe(true);
    expect(q(container, ".ds-counter").textContent).toBe(
      "1 picked + 9 Grow turnips = 10",
    );
    q(container, ".ds-start").click();
    expect(cb.onStart).toHaveBeenCalledWith(["raid"]);
  });

  it("a newly unlocked card does not auto-select, and picks survive the render", () => {
    const { container, screen } = setup();
    screen.update({
      visible: true, knownCards: ["grow-crops", "raid"],
      seenPool: ["fortify"], learned: [],
    });
    const raid = [...container.querySelectorAll(".ds-deck .ds-card")].find(
      (c) => c.querySelector(".ds-card-name")?.textContent === "Raid",
    ) as HTMLElement;
    raid.click(); // take raid
    screen.update({
      visible: true, knownCards: ["grow-crops", "raid", "fortify"],
      seenPool: [], learned: [],
    });
    const cards = [...container.querySelectorAll(".ds-deck .ds-card")];
    const byText = (t: string) =>
      cards.find((c) => c.querySelector(".ds-card-name")?.textContent === t) as HTMLElement;
    expect(byText("Raid").classList.contains("selected")).toBe(true);
    expect(byText("Fortify").classList.contains("selected")).toBe(false);
  });

  it("start stays available with nothing picked (first run has no choice to make)", () => {
    const { container, cb, screen } = setup();
    screen.update({
      visible: true, knownCards: ["grow-crops"], seenPool: [], learned: [],
    });
    expect((q(container, ".ds-start") as HTMLButtonElement).disabled).toBe(false);
    q(container, ".ds-start").click();
    expect(cb.onStart).toHaveBeenCalledWith([]);
  });

  it("marks the remaining cards once the deck is full", () => {
    const { container, screen } = setup();
    const eleven = [
      "raid", "shrewd-marriage", "fortify", "subjugate", "incorporate",
      "revolt", "assassinate-ruler", "alliance",
      "extended-diplomacy", "bodyguard", "favourable-omens",
    ];
    screen.update({
      visible: true, knownCards: ["grow-crops", ...eleven],
      seenPool: [], learned: [],
    });
    const toggles = [...container.querySelectorAll(".ds-deck .ds-card")].filter(
      (c) => !c.classList.contains("ds-filler"),
    ) as HTMLElement[];
    expect(toggles).toHaveLength(11);
    for (let i = 0; i < 10; i++) toggles[i].click();
    expect(q(container, ".ds-counter").textContent).toBe(
      "10 picked + 0 Grow turnips = 10",
    );
    expect(toggles[10].classList.contains("deck-full")).toBe(true);
    toggles[10].click(); // the deck is full: nothing changes
    expect(toggles[10].classList.contains("selected")).toBe(false);
    expect(q(container, ".ds-counter").textContent).toBe(
      "10 picked + 0 Grow turnips = 10",
    );
    toggles[0].click(); // free a slot: the last card becomes takeable again
    expect(toggles[10].classList.contains("deck-full")).toBe(false);
    toggles[10].click();
    expect(toggles[10].classList.contains("selected")).toBe(true);
  });

  it("shows rules text on deck cards", () => {
    const { container, screen } = setup();
    screen.update({
      visible: true, knownCards: ["grow-crops", "subjugate"],
      seenPool: ["raid"], learned: [],
    });
    const deckCard = container.querySelector(".ds-deck .ds-card")!;
    expect(deckCard.querySelector(".ds-card-name")!.textContent).toBe("Subjugate");
    expect(deckCard.querySelector(".ds-card-text")!.textContent?.length).toBeGreaterThan(0);
  });

  it("shows the undiscovered counter when neither known nor pool cover every non-basic", () => {
    const { container, screen } = setup();
    screen.update({
      visible: true, knownCards: ["grow-crops"], seenPool: [], learned: [],
    });
    const undiscovered = q(container, ".ds-undiscovered");
    expect(undiscovered.classList.contains("hidden")).toBe(false);
    // 12 non-basics now exist (Reclaim independence retired, Found a
    // settlement added).
    expect(undiscovered.textContent).toBe("12 cards still undiscovered");
  });

  it("deducts known and pool cards from the undiscovered count", () => {
    const { container, screen } = setup();
    screen.update({
      visible: true, knownCards: ["grow-crops", "raid", "subjugate"],
      seenPool: ["fortify"], learned: [],
    });
    // 12 non-basics total - raid, subjugate (known) - fortify (pool) = 9 left
    expect(q(container, ".ds-undiscovered").textContent).toBe("9 cards still undiscovered");
  });

  it("uses the singular 'card' when exactly one non-basic is undiscovered", () => {
    const { container, screen } = setup();
    screen.update({
      visible: true,
      knownCards: [
        "grow-crops", "raid", "shrewd-marriage", "fortify", "subjugate",
        "incorporate", "seeds-of-revolt", "assassinate-ruler",
        "alliance", "extended-diplomacy", "bodyguard", "found-settlement",
      ],
      seenPool: [],
      learned: [],
    });
    const undiscovered = q(container, ".ds-undiscovered");
    expect(undiscovered.classList.contains("hidden")).toBe(false);
    // only favourable-omens remains undiscovered
    expect(undiscovered.textContent).toBe("1 card still undiscovered");
  });

  it("hides the undiscovered counter once every non-basic is known or in the pool", () => {
    const { container, screen } = setup();
    screen.update({
      visible: true,
      knownCards: [
        "grow-crops", "raid", "shrewd-marriage", "fortify", "subjugate",
      ],
      seenPool: [
        "incorporate", "seeds-of-revolt",
        "assassinate-ruler", "alliance", "extended-diplomacy", "bodyguard",
        "favourable-omens", "found-settlement",
      ],
      learned: [],
    });
    expect(q(container, ".ds-undiscovered").classList.contains("hidden")).toBe(true);
  });
});
