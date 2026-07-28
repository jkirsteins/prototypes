import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createPile, pileLayers, PULSE_MS } from "../src/ui/piles";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("pileLayers", () => {
  it("shows nothing for an empty pile", () => {
    expect(pileLayers(0)).toBe(0);
  });

  it("thickens with the pile and caps out", () => {
    expect(pileLayers(1)).toBe(1);
    expect(pileLayers(5)).toBe(2);
    expect(pileLayers(10)).toBe(3);
    expect(pileLayers(30)).toBe(4);
  });

  it("never returns more layers for a smaller pile", () => {
    for (let n = 1; n < 40; n += 1) {
      expect(pileLayers(n)).toBeGreaterThanOrEqual(pileLayers(n - 1));
    }
  });
});

describe("pile", () => {
  it("carries its key and label", () => {
    const pile = createPile("player-deck", "Deck");
    expect(pile.root.dataset.pile).toBe("player-deck");
    expect(pile.root.querySelector(".pile-label")?.textContent).toBe("Deck");
  });

  it("shows the count", () => {
    const pile = createPile("player-deck", "Deck");
    pile.update(8);
    expect(pile.root.querySelector(".pile-count")?.textContent).toBe("8");
  });

  it("draws a layer stack that matches the count", () => {
    const pile = createPile("player-deck", "Deck");
    pile.update(10);
    expect(pile.root.querySelectorAll(".card-back")).toHaveLength(pileLayers(10));
  });

  it("marks an empty pile and draws no backs", () => {
    const pile = createPile("player-discard", "Discard");
    pile.update(0);
    expect(pile.root.querySelector(".pile-stack")?.classList.contains("empty")).toBe(true);
    expect(pile.root.querySelectorAll(".card-back")).toHaveLength(0);
  });

  it("clears the empty mark when cards come back", () => {
    const pile = createPile("player-discard", "Discard");
    pile.update(0);
    pile.update(3);
    expect(pile.root.querySelector(".pile-stack")?.classList.contains("empty")).toBe(false);
  });

  it("rebuilds rather than accumulating layers across updates", () => {
    const pile = createPile("player-deck", "Deck");
    pile.update(30);
    pile.update(1);
    expect(pile.root.querySelectorAll(".card-back")).toHaveLength(1);
  });

  it("pulses for a reshuffle and stops pulsing after PULSE_MS", () => {
    const pile = createPile("player-deck", "Deck");
    pile.pulse();
    expect(pile.root.classList.contains("pulse")).toBe(true);
    vi.advanceTimersByTime(PULSE_MS + 10);
    expect(pile.root.classList.contains("pulse")).toBe(false);
  });
});
