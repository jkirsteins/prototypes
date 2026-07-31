// @vitest-environment happy-dom
import { describe, it, expect, vi } from "vitest";
import { createDeckScreen, type DeckScreenCallbacks } from "../src/deck-screen";
import { applyRarityBand } from "../src/rarity-band";
import { ACQUIRABLE_CARDS, CARDS, RARITY_TIERS } from "../src/cards";

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
  reveal: null, savedPicks: [], ...over,
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
    expect(q(container, ".ds-undiscovered").textContent).toBe("3 of 8 collected");
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

  it("does not re-render the pack cards on a repeat update with the same reveal", () => {
    const { container, screen } = setup();
    const v = view({
      pendingPacks: 1,
      reveal: [{ id: "alliance", isNew: true }, { id: "raid", isNew: false }],
    });
    screen.update(v);
    const first = container.querySelector(".ds-pack-card");
    expect(first).not.toBeNull();
    screen.update(v); // same view object, same reveal array identity
    expect(container.querySelector(".ds-pack-card")).toBe(first);
  });

  it("hides the pack count while a reveal is showing", () => {
    const { container, screen } = setup();
    screen.update(view({ pendingPacks: 1 }));
    expect(q(container, ".ds-pack-count").classList.contains("hidden")).toBe(false);
    screen.update(view({
      pendingPacks: 0,
      reveal: [{ id: "alliance", isNew: true }, { id: "raid", isNew: false }],
    }));
    expect(q(container, ".ds-pack-count").classList.contains("hidden")).toBe(true);
  });

  it("shows the deck builder again once no packs are pending", () => {
    const { container, screen } = setup();
    screen.update(view({ pendingPacks: 1 }));
    expect(q(container, ".ds-pack-overlay").classList.contains("hidden")).toBe(false);
    screen.update(view({ pendingPacks: 0, reveal: null }));
    expect(q(container, ".ds-pack-overlay").classList.contains("hidden")).toBe(true);
  });

  it("arrives with the last confirmed loadout already picked", () => {
    const { container, cb, screen } = setup();
    screen.update(view({ savedPicks: ["raid", "fortify"] }));
    const picked = [...container.querySelectorAll(".ds-deck .ds-card.selected")]
      .map((c) => c.querySelector(".ds-card-name")?.textContent);
    expect(picked).toEqual(["Raid", "Fortify"]);
    expect(q(container, ".ds-counter").textContent).toBe(
      "2 picked + 8 Grow turnips = 10",
    );
    // Replaying that deck is one click: no reselection needed.
    q(container, ".ds-start").click();
    expect(cb.onStart).toHaveBeenCalledWith(["raid", "fortify"]);
  });

  it("drops a saved pick for a card that is no longer known", () => {
    const { container, cb, screen } = setup();
    screen.update(view({ knownCards: ["grow-crops", "raid"], savedPicks: ["raid", "alliance"] }));
    expect(container.querySelectorAll(".ds-deck .ds-card.selected")).toHaveLength(1);
    q(container, ".ds-start").click();
    expect(cb.onStart).toHaveBeenCalledWith(["raid"]);
  });

  it("keeps a pick the player just changed, and yields to a new saved loadout", () => {
    const { container, cb, screen } = setup();
    const saved = ["raid", "fortify"];
    screen.update(view({ savedPicks: saved }));
    // Deselect Raid, then re-render for an unrelated reason: the same saved
    // array must not undo the change.
    const raid = [...container.querySelectorAll<HTMLElement>(".ds-deck .ds-card")]
      .find((c) => c.querySelector(".ds-card-name")?.textContent === "Raid")!;
    raid.click();
    screen.update(view({ savedPicks: saved, collected: 1 }));
    q(container, ".ds-start").click();
    expect(cb.onStart).toHaveBeenLastCalledWith(["fortify"]);
    // A fresh array is the owner saying the loadout itself changed - a new
    // confirmed deck, or Reset progress handing back an empty one.
    screen.update(view({ savedPicks: [] }));
    expect(container.querySelectorAll(".ds-deck .ds-card.selected")).toHaveLength(0);
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

describe("rarity band", () => {
  it("bands a pack-pool card with its tier colour", () => {
    const el = document.createElement("div");
    const id = ACQUIRABLE_CARDS[0];
    applyRarityBand(el, id);
    const tier = RARITY_TIERS.find((t) => t.id === CARDS[id].rarity);
    expect(el.classList.contains("rarity-band")).toBe(true);
    expect(el.style.getPropertyValue("--rarity")).toBe(tier?.colour);
  });

  it("leaves a card that never came from a pack unbanded", () => {
    const el = document.createElement("div");
    applyRarityBand(el, "grow-crops");
    expect(el.classList.contains("rarity-band")).toBe(false);
    expect(el.style.getPropertyValue("--rarity")).toBe("");
  });
});
