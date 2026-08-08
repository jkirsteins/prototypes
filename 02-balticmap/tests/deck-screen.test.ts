// @vitest-environment happy-dom
import { describe, it, expect, vi } from "vitest";
import { createDeckScreen, type DeckScreenCallbacks } from "../src/deck-screen";
import { applyRarityBand } from "../src/rarity-band";
import { ACQUIRABLE_CARDS, CARDS, RARITY_TIERS } from "../src/cards";
import { DEFAULT_RULES } from "../src/rules";

function setup() {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const cb: DeckScreenCallbacks = {
    onStart: vi.fn(), onOpenPack: vi.fn(), onDismissReveal: vi.fn(),
    onShowTip: vi.fn(), onHideTip: vi.fn(), onRulesChange: vi.fn(),
  };
  const screen = createDeckScreen(container, cb);
  return { container, cb, screen };
}

const q = (c: HTMLElement, sel: string) => c.querySelector(sel) as HTMLElement;
const START = ["grow-crops", "raid", "subjugate", "fortify"];

const view = (over: Record<string, unknown> = {}) => ({
  visible: true, knownCards: START, collected: 0, pendingPacks: 0,
  reveal: null, savedPicks: [], rules: DEFAULT_RULES, ...over,
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

  it("keeps the counters and the start button out of the scrolling grid", () => {
    // .ds-deck is the scroll region, and everything the player needs to act on
    // has to stay outside it. The bug this replaces was the last row and the
    // button under it clipped off a short window with no way to reach them, and
    // the tempting fix next time is to move the button in here with the cards.
    const { container, screen } = setup();
    screen.update(view());
    const grid = q(container, ".ds-deck");
    for (const sel of [".ds-start", ".ds-counter", ".ds-undiscovered", ".ds-label"]) {
      expect(grid.contains(q(container, sel))).toBe(false);
    }
  });

  it("clears the shared tooltip when the pointer leaves a card", () => {
    // Only the hide path is testable here: happy-dom performs no layout, so
    // every scrollHeight and clientHeight is 0 and the tile can never report
    // the spill that opens the tip. Asserting onShowTip is not called would
    // lock in the wrong thing. The show path is verified in a browser.
    const { container, cb, screen } = setup();
    screen.update(view());
    const card = container.querySelector(".ds-deck .ds-card") as HTMLElement;
    card.dispatchEvent(new MouseEvent("mouseleave", { bubbles: true }));
    expect(cb.onHideTip).toHaveBeenCalled();
  });

  it("clears the shared tooltip when the screen goes away under the cursor", () => {
    // The tip is coordinate-driven and outlives its tile: a card hovered as the
    // screen closes never fires mouseleave, and the tip strands over the map.
    const { cb, screen } = setup();
    screen.update(view());
    screen.update(view({ visible: false }));
    expect(cb.onHideTip).toHaveBeenCalled();
  });

  it("clears the shared tooltip when a pack hides the builder", () => {
    const { cb, screen } = setup();
    screen.update(view());
    screen.update(view({ pendingPacks: 1 }));
    expect(cb.onHideTip).toHaveBeenCalled();
  });

  it("reports collection progress against the pack pool", () => {
    const { container, screen } = setup();
    screen.update(view({ collected: 3 }));
    expect(q(container, ".ds-undiscovered").textContent).toBe("3 of 12 collected");
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

  it("shows no copy counts and states the 1-copy cap under default rules", () => {
    const { container, screen } = setup();
    screen.update(view({ savedPicks: ["raid"] }));
    expect(q(container, ".ds-label").textContent).toBe(
      "Choose the cards you take (up to 10, 1 copy each):",
    );
    for (const pill of container.querySelectorAll(".ds-card-count")) {
      expect(pill.classList.contains("hidden")).toBe(true);
    }
  });
});

describe("the double-copies rule", () => {
  const DOUBLE = { ...DEFAULT_RULES, copies: "double" as const };
  const tileOf = (container: HTMLElement, name: string) =>
    [...container.querySelectorAll<HTMLElement>(".ds-deck .ds-card")]
      .find((c) => c.querySelector(".ds-card-name")?.textContent === name)!;

  it("cycles a tile none -> x1 -> x2 -> none and counts total copies", () => {
    const { container, cb, screen } = setup();
    screen.update(view({ rules: DOUBLE }));
    expect(q(container, ".ds-label").textContent).toBe(
      "Choose the cards you take (up to 10, up to 2 copies each):",
    );
    const raid = tileOf(container, "Raid");
    raid.click();
    expect(raid.querySelector(".ds-card-count")?.textContent).toBe("x1");
    raid.click();
    expect(raid.querySelector(".ds-card-count")?.textContent).toBe("x2");
    expect(raid.querySelector(".ds-card-count")?.classList.contains("hidden"))
      .toBe(false);
    expect(q(container, ".ds-counter").textContent).toBe(
      "2 picked + 8 Grow turnips = 10",
    );
    q(container, ".ds-start").click();
    expect(cb.onStart).toHaveBeenCalledWith(["raid", "raid"]);
    raid.click();
    expect(raid.classList.contains("selected")).toBe(false);
    expect(raid.querySelector(".ds-card-count")?.classList.contains("hidden"))
      .toBe(true);
    expect(q(container, ".ds-counter").textContent).toBe(
      "0 picked + 10 Grow turnips = 10",
    );
  });

  it("arrives with a saved two-copy loadout picked", () => {
    const { container, cb, screen } = setup();
    screen.update(view({ rules: DOUBLE, savedPicks: ["raid", "raid", "fortify"] }));
    expect(tileOf(container, "Raid").querySelector(".ds-card-count")?.textContent)
      .toBe("x2");
    expect(q(container, ".ds-counter").textContent).toBe(
      "3 picked + 7 Grow turnips = 10",
    );
    q(container, ".ds-start").click();
    expect(cb.onStart).toHaveBeenCalledWith(["raid", "raid", "fortify"]);
  });

  it("prunes second copies when the rule flips back to single", () => {
    const { container, cb, screen } = setup();
    const saved = ["raid", "raid", "fortify"];
    screen.update(view({ rules: DOUBLE, savedPicks: saved }));
    screen.update(view({ rules: DEFAULT_RULES, savedPicks: saved }));
    expect(q(container, ".ds-counter").textContent).toBe(
      "2 picked + 8 Grow turnips = 10",
    );
    q(container, ".ds-start").click();
    expect(cb.onStart).toHaveBeenCalledWith(["raid", "fortify"]);
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

  it("labels a pack-pool card with its tier when asked", () => {
    const el = document.createElement("div");
    const id = ACQUIRABLE_CARDS[0];
    applyRarityBand(el, id, { labelled: true });
    expect(el.classList.contains("rarity-labelled")).toBe(true);
    expect(el.dataset.rarity).toBe(CARDS[id].rarity);
  });

  it("stays band-only by default", () => {
    const el = document.createElement("div");
    applyRarityBand(el, ACQUIRABLE_CARDS[0]);
    expect(el.classList.contains("rarity-labelled")).toBe(false);
    expect(el.dataset.rarity).toBeUndefined();
  });

  it("never labels a card that never came from a pack", () => {
    const el = document.createElement("div");
    applyRarityBand(el, "grow-crops", { labelled: true });
    expect(el.classList.contains("rarity-labelled")).toBe(false);
    expect(el.dataset.rarity).toBeUndefined();
  });

  it("labels every picker tile that carries a band", () => {
    // The starting four are not pack-pool cards, so the default view offers
    // nothing banded; borrow acquirable cards to have tiles to assert on.
    const { container, screen } = setup();
    screen.update(view({ knownCards: [...START, ...ACQUIRABLE_CARDS.slice(0, 3)] }));
    const tiles = [...container.querySelectorAll(".ds-deck .ds-card.rarity-band")];
    expect(tiles.length).toBeGreaterThan(0);
    for (const tile of tiles) {
      expect(tile.classList.contains("rarity-labelled")).toBe(true);
      expect((tile as HTMLElement).dataset.rarity).toBeTruthy();
    }
  });
});

describe("rules picker", () => {
  it("summarizes the current picks and keeps the options out of the screen", () => {
    const { container, screen } = setup();
    screen.update(view());
    expect(q(container, ".ds-rules-summary").textContent).toBe(
      "One card per turn, 1 of each card",
    );
    expect(
      q(container, ".ds-rules-overlay").classList.contains("hidden"),
    ).toBe(true);
  });

  it("opens the modal from the button and closes it on Done", () => {
    const { container, screen } = setup();
    screen.update(view());
    q(container, ".ds-rules-btn").click();
    expect(
      q(container, ".ds-rules-overlay").classList.contains("hidden"),
    ).toBe(false);
    q(container, ".ds-rules-done").click();
    expect(
      q(container, ".ds-rules-overlay").classList.contains("hidden"),
    ).toBe(true);
  });

  it("reports a radio pick and reflects the updated view", () => {
    const { container, cb, screen } = setup();
    screen.update(view());
    q(container, ".ds-rules-btn").click();
    const radio = container.querySelector(
      'input[name="ds-rules-turn"][value="unlimited"]',
    ) as HTMLInputElement;
    radio.click();
    expect(cb.onRulesChange).toHaveBeenCalledWith({
      ...DEFAULT_RULES, turn: "unlimited",
    });
    screen.update(view({ rules: { ...DEFAULT_RULES, turn: "unlimited" } }));
    expect(q(container, ".ds-rules-summary").textContent).toBe(
      "Unlimited plays, 1 of each card",
    );
    expect(radio.checked).toBe(true);
  });

  it("keeps the rules row outside the scrolling grid", () => {
    const { container, screen } = setup();
    screen.update(view());
    expect(q(container, ".ds-deck").contains(q(container, ".ds-rules-row")))
      .toBe(false);
  });
});
