// @vitest-environment happy-dom
import { describe, it, expect, vi } from "vitest";
import { createHud, type HudCallbacks } from "../src/hud";
import { newGame, startGame, pickFaction, endTurn, playCard } from "../src/game";
import type { Rng } from "../src/cards";

function seededRng(seed: number): Rng {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const FACTIONS = ["alpha", "beta", "gamma"];

function setup() {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const cb: HudCallbacks = {
    onNewGame: vi.fn(),
    onPlayCard: vi.fn(),
    onEndTurn: vi.fn(),
  };
  const hud = createHud(container, cb);
  return { container, cb, hud };
}

const q = (c: HTMLElement, sel: string) => c.querySelector(sel) as HTMLElement;

describe("createHud", () => {
  it("shows only the menu at main-menu, and New game fires onNewGame", () => {
    const { container, cb, hud } = setup();
    hud.update(newGame(FACTIONS));
    expect(q(container, ".menu-overlay").classList.contains("hidden")).toBe(false);
    expect(q(container, ".status-bar").classList.contains("hidden")).toBe(true);
    expect(q(container, ".hand").classList.contains("hidden")).toBe(true);
    expect(q(container, ".piles").classList.contains("hidden")).toBe(true);
    q(container, ".menu-new-game").click();
    expect(cb.onNewGame).toHaveBeenCalledOnce();
  });

  it("prompts for a faction during pick-faction, no End Turn button", () => {
    const { container, hud } = setup();
    hud.update(startGame(newGame(FACTIONS)));
    expect(q(container, ".menu-overlay").classList.contains("hidden")).toBe(true);
    expect(q(container, ".status-bar").classList.contains("hidden")).toBe(false);
    expect(q(container, ".status-text").textContent).toBe("Choose your faction");
    expect(q(container, ".end-turn").classList.contains("hidden")).toBe(true);
  });

  it("renders the human turn: status, piles, fanned hand, End Turn", () => {
    const { container, cb, hud } = setup();
    const g = pickFaction(startGame(newGame(FACTIONS)), "beta", seededRng(1));
    hud.update(g);
    expect(q(container, ".status-text").textContent).toBe("Turn 1 - your turn");
    expect(q(container, ".end-turn").classList.contains("hidden")).toBe(false);
    expect(q(container, ".pile-deck").textContent).toBe("Deck: 19");
    expect(q(container, ".pile-discard").textContent).toBe("Discard: 0");
    const cards = container.querySelectorAll(".card");
    expect(cards).toHaveLength(1);
    expect(cards[0].textContent).toBe("Grow crops");
    (cards[0] as HTMLElement).click();
    expect(cb.onPlayCard).toHaveBeenCalledWith(0);
    q(container, ".end-turn").click();
    expect(cb.onEndTurn).toHaveBeenCalledOnce();
  });

  it("fans multiple cards with symmetric rotations", () => {
    const { container, hud } = setup();
    let g = pickFaction(startGame(newGame(FACTIONS)), "beta", seededRng(1));
    for (let i = 0; i < FACTIONS.length * 2; i++) g = endTurn(g, seededRng(2));
    hud.update(g); // human has drawn 3 cards, played none
    const cards = [...container.querySelectorAll(".card")] as HTMLElement[];
    expect(cards).toHaveLength(3);
    expect(cards[0].style.transform).toContain("rotate(-5deg)");
    expect(cards[1].style.transform).toContain("rotate(0deg)");
    expect(cards[2].style.transform).toContain("rotate(5deg)");
  });

  it("disables held cards during AI turns and shows the waiting label", () => {
    const { container, cb, hud } = setup();
    let g = pickFaction(startGame(newGame(FACTIONS)), "beta", seededRng(1));
    // human keeps their 1 card; endTurn hands control to player 2 (AI)
    g = endTurn(g, seededRng(3));
    hud.update(g);
    expect(q(container, ".status-text").textContent).toBe("Waiting on player 2...");
    expect(q(container, ".end-turn").classList.contains("hidden")).toBe(true);
    const cards = [...container.querySelectorAll(".card")] as HTMLButtonElement[];
    expect(cards).toHaveLength(1);
    expect(cards[0].disabled).toBe(true);
    cards[0].click();
    expect(cb.onPlayCard).not.toHaveBeenCalled();
  });

  it("disables remaining cards after playing one this turn", () => {
    const { container, cb, hud } = setup();
    let g = pickFaction(startGame(newGame(FACTIONS)), "beta", seededRng(1));
    // run one full round so the human holds 2 cards on their next turn
    for (let i = 0; i < FACTIONS.length; i++) g = endTurn(g, seededRng(4));
    g = playCard(g, 0); // 1 card left, playedThisTurn = true
    hud.update(g);
    const card = q(container, ".card") as HTMLButtonElement;
    expect(card.disabled).toBe(true);
    card.click();
    expect(cb.onPlayCard).not.toHaveBeenCalled();
  });
});
