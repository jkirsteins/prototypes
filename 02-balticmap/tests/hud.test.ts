// @vitest-environment happy-dom
import { describe, it, expect, vi } from "vitest";
import { createHud, type HudCallbacks } from "../src/hud";
import {
  newGame, startGame, pickFaction, endTurn, playCard, aiTurn, beginTurn,
  type GameState,
} from "../src/game";
import type { Rng } from "../src/cards";
import { bumpMight } from "../src/relations";

function seededRng(seed: number): Rng {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const FACTIONS = ["alpha", "beta", "gamma"];

function setup(canPlayCard?: (cardId: string) => boolean) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const cb: HudCallbacks = {
    onNewGame: vi.fn(),
    onPlayCard: vi.fn(),
    onEndTurn: vi.fn(),
    ...(canPlayCard ? { canPlayCard } : {}),
  };
  const hud = createHud(container, cb, new Map([
    ["alpha", "Alpha"], ["beta", "Beta"], ["gamma", "Gamma"],
  ]));
  return { container, cb, hud };
}

const q = (c: HTMLElement, sel: string) => c.querySelector(sel) as HTMLElement;

function withHand(g: GameState, playerIdx: number, hand: string[]): GameState {
  const p = { ...g.players[playerIdx], hand };
  return { ...g, players: g.players.map((pl, i) => (i === playerIdx ? p : pl)) };
}

describe("createHud", () => {
  it("shows only the menu at main-menu, and New game fires onNewGame", () => {
    const { container, cb, hud } = setup();
    hud.update(newGame(FACTIONS));
    expect(q(container, ".menu-overlay").classList.contains("hidden")).toBe(false);
    expect(q(container, ".status-bar").classList.contains("hidden")).toBe(true);
    expect(q(container, ".hand").classList.contains("hidden")).toBe(true);
    expect(q(container, ".pile-deck").classList.contains("hidden")).toBe(true);
    expect(q(container, ".pile-discard").classList.contains("hidden")).toBe(true);
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
    const g = withHand(pickFaction(startGame(newGame(FACTIONS)), "beta", seededRng(1)), 0, ["grow-crops"]);
    hud.update(g);
    expect(q(container, ".status-text").textContent).toBe("Turn 1 - your turn");
    expect(q(container, ".end-turn").classList.contains("hidden")).toBe(false);
    expect(q(container, ".pile-deck .pile-count").textContent).toBe("6");
    expect(q(container, ".pile-deck .pile-label").textContent).toBe("Deck");
    expect(q(container, ".pile-discard .pile-count").textContent).toBe("0");
    expect(q(container, ".pile-discard .pile-label").textContent).toBe("Discard");
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
    // opening hand deals 3 + a turn draw = 4; force a known 3-card hand to
    // exercise the fan formula independent of hand size.
    const g = withHand(
      pickFaction(startGame(newGame(FACTIONS)), "beta", seededRng(1)), 0,
      ["grow-crops", "grow-crops", "grow-crops"],
    );
    hud.update(g);
    const cards = [...container.querySelectorAll(".card")] as HTMLElement[];
    expect(cards).toHaveLength(3);
    expect(cards[0].style.transform).toContain("rotate(-5deg)");
    expect(cards[1].style.transform).toContain("rotate(0deg)");
    expect(cards[2].style.transform).toContain("rotate(5deg)");
  });

  it("disables held cards during AI turns and shows the waiting label", () => {
    const { container, cb, hud } = setup();
    let g = pickFaction(startGame(newGame(FACTIONS)), "beta", seededRng(1));
    // endTurn hands control to player 2 (AI); force a known 1-card hand
    g = endTurn(g, seededRng(3));
    g = withHand(g, 0, ["grow-crops"]);
    hud.update(g);
    expect(q(container, ".status-text").textContent).toBe("Waiting on other players...");
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
    g = withHand(g, 0, ["grow-crops", "grow-crops"]);
    g = playCard(g, 0, seededRng(1)); // 1 card left, playedThisTurn = true
    hud.update(g);
    const card = q(container, ".card") as HTMLButtonElement;
    expect(card.disabled).toBe(true);
    card.click();
    expect(cb.onPlayCard).not.toHaveBeenCalled();
  });
});

describe("visual piles", () => {
  it("renders layered card backs scaled to the count, dashed when empty", () => {
    const { container, hud } = setup();
    // force a non-targeted card so playCard(g, 0) below succeeds regardless
    // of what the seeded shuffle happened to deal
    const g = withHand(
      pickFaction(startGame(newGame(FACTIONS)), "beta", seededRng(1)), 0,
      ["grow-crops"],
    );
    hud.update(g); // deck 6, discard 0
    expect(container.querySelectorAll(".pile-deck .card-back")).toHaveLength(2);
    expect(container.querySelectorAll(".pile-discard .card-back")).toHaveLength(0);
    expect(
      q(container, ".pile-discard .pile-stack").classList.contains("empty"),
    ).toBe(true);
    expect(
      q(container, ".pile-deck .pile-stack").classList.contains("empty"),
    ).toBe(false);
    hud.update(playCard(g, 0, seededRng(1))); // discard 1
    expect(container.querySelectorAll(".pile-discard .card-back")).toHaveLength(1);
    expect(
      q(container, ".pile-discard .pile-stack").classList.contains("empty"),
    ).toBe(false);
  });
});

describe("activity log", () => {
  function playing() {
    return pickFaction(startGame(newGame(FACTIONS)), "beta", seededRng(1));
  }

  it("is hidden outside the playing phase and visible during it", () => {
    const { container, hud } = setup();
    hud.update(newGame(FACTIONS));
    expect(q(container, ".activity-log").classList.contains("hidden")).toBe(true);
    hud.update(playing());
    expect(q(container, ".activity-log").classList.contains("hidden")).toBe(false);
  });

  it("names your cards, hides AI draws, and shows AI plays", () => {
    const { container, hud } = setup();
    let g = playing();
    g = withHand(g, 0, ["grow-crops"]);
    g = playCard(g, 0, seededRng(1));
    g = endTurn(g, seededRng(2)); // player 2 draws
    g = withHand(g, 1, ["grow-crops"]);
    g = aiTurn(g, seededRng(1)); // player 2 plays
    hud.update(g);
    const texts = [...container.querySelectorAll(".log-entry")].map(
      (el) => el.textContent,
    );
    expect(texts[0]).toMatch(/^You drew /);
    expect(texts[1]).toBe("You played Grow crops");
    expect(texts[2]).toBe("Player 2 drew a card");
    expect(texts[3]).toMatch(/^Player 2 played /);
  });

  it("appends only new entries across updates and inserts turn separators", () => {
    const { container, hud } = setup();
    let g = playing();
    hud.update(g);
    for (let i = 0; i < FACTIONS.length; i++) g = endTurn(g, seededRng(3));
    hud.update(g); // back to the human: turn 2 draw happened
    expect(container.querySelectorAll(".log-entry")).toHaveLength(4);
    const seps = [...container.querySelectorAll(".log-turn")].map(
      (el) => el.textContent,
    );
    expect(seps).toEqual(["Turn 1", "Turn 2"]);
  });

  it("resets the entries when a new game starts", () => {
    const { container, hud } = setup();
    let g = playing();
    g = withHand(g, 0, ["grow-crops"]);
    g = playCard(g, 0, seededRng(1));
    hud.update(g);
    expect(container.querySelectorAll(".log-entry")).toHaveLength(2);
    hud.update(playing()); // fresh game: log has only the opening draw
    expect(container.querySelectorAll(".log-entry")).toHaveLength(1);
  });

  it("collapses to a tab and expands again", () => {
    const { container, hud } = setup();
    hud.update(playing());
    const panel = q(container, ".activity-log");
    expect(panel.classList.contains("collapsed")).toBe(false);
    q(container, ".activity-log-toggle").click();
    expect(panel.classList.contains("collapsed")).toBe(true);
    q(container, ".activity-log-toggle").click();
    expect(panel.classList.contains("collapsed")).toBe(false);
  });
});

describe("card animations", () => {
  function playing() {
    return pickFaction(startGame(newGame(FACTIONS)), "beta", seededRng(1));
  }

  it("flies a card back from the deck on your draw, exactly once", () => {
    vi.useFakeTimers();
    const { container, hud } = setup();
    const g = playing();
    hud.update(g); // log contains your opening draw
    expect(container.querySelectorAll(".flying-card.back")).toHaveLength(1);
    hud.update(g); // same state again: no duplicate animation
    expect(container.querySelectorAll(".flying-card.back")).toHaveLength(1);
    vi.runAllTimers();
    expect(container.querySelectorAll(".flying-card")).toHaveLength(0);
    vi.useRealTimers();
  });

  it("hides the newest hand card while the draw flight is in progress", () => {
    vi.useFakeTimers();
    const { container, hud } = setup();
    hud.update(playing());
    // opening hand is 3 + a turn draw = 4; the newest (drawn) card renders last
    const cards = container.querySelectorAll(".card");
    const card = cards[cards.length - 1] as HTMLElement;
    expect(card.classList.contains("card-incoming")).toBe(true);
    vi.runAllTimers();
    expect(card.classList.contains("card-incoming")).toBe(false);
    vi.useRealTimers();
  });

  it("flies the played card face-up on your play", () => {
    vi.useFakeTimers();
    const { container, hud } = setup();
    let g = playing();
    hud.update(g);
    vi.runAllTimers();
    g = withHand(g, 0, ["grow-crops"]);
    g = playCard(g, 0, seededRng(1));
    hud.update(g);
    const flying = container.querySelectorAll(".flying-card");
    expect(flying).toHaveLength(1);
    expect(flying[0].classList.contains("back")).toBe(false);
    expect(flying[0].textContent).toBe("Grow crops");
    vi.runAllTimers();
    expect(container.querySelectorAll(".flying-card")).toHaveLength(0);
    vi.useRealTimers();
  });

  it("does not animate AI actions, but pulses the deck on your reshuffle", () => {
    vi.useFakeTimers();
    const { container, hud } = setup();
    let g = playing();
    g = withHand(g, 0, ["grow-crops"]);
    g = playCard(g, 0, seededRng(1));
    hud.update(g); // consumes your draw + play events
    vi.runAllTimers();
    g = endTurn(g, seededRng(2)); // AI draw event
    hud.update(g);
    expect(container.querySelectorAll(".flying-card")).toHaveLength(0);

    // force a human reshuffle: empty deck, cards in discard
    const p0 = {
      ...g.players[0],
      deck: [] as string[],
      discard: ["grow-crops", "grow-crops"],
    };
    let g2 = { ...g, players: [p0, ...g.players.slice(1)], current: 0 };
    g2 = beginTurn(g2, seededRng(3));
    hud.update(g2);
    expect(q(container, ".pile-deck").classList.contains("pulse")).toBe(true);
    vi.runAllTimers();
    expect(q(container, ".pile-deck").classList.contains("pulse")).toBe(false);
    vi.useRealTimers();
  });
});

describe("subjugation HUD", () => {
  function playing() {
    return pickFaction(startGame(newGame(FACTIONS)), "beta", seededRng(1));
  }

  it("renders targeted play and subjugation log texts with faction names", () => {
    const { container, hud } = setup();
    // v2 subjugation is stored, not automatic on raid: build a might lead
    // then play the explicit Subjugate card to trigger the event.
    let g = playing();
    g = { ...g, relations: bumpMight(bumpMight(g.relations, "beta", "alpha"), "beta", "alpha") };
    g = withHand(g, 0, ["subjugate"]);
    g = playCard(g, 0, seededRng(1), "alpha");
    hud.update(g);
    const texts = [...container.querySelectorAll(".log-entry")].map(
      (el) => el.textContent,
    );
    expect(texts).toContain("You played Subjugate on Alpha");
    expect(texts).toContain("Alpha submits to Beta");
  });

  it("marks cards the callback rejects as unplayable", () => {
    const { container, cb, hud } = setup((id) => id !== "incorporate");
    const g = withHand(playing(), 0, ["incorporate", "grow-crops"]);
    hud.update(g);
    const cards = [...container.querySelectorAll(".card")] as HTMLButtonElement[];
    expect(cards[0].disabled).toBe(true);
    expect(cards[0].classList.contains("unplayable")).toBe(true);
    expect(cards[1].disabled).toBe(false);
    cards[0].click();
    expect(cb.onPlayCard).not.toHaveBeenCalled();
  });

  it("setArmed highlights the card and prompts for a target", () => {
    const { container, hud } = setup();
    const g = withHand(playing(), 0, ["raid", "grow-crops"]);
    hud.update(g);
    hud.setArmed(0, "Raid");
    expect(q(container, ".status-text").textContent).toBe(
      "Choose a target for Raid",
    );
    expect(q(container, ".card").classList.contains("card-armed")).toBe(true);
    hud.setArmed(null);
    expect(q(container, ".status-text").textContent).toBe("Turn 1 - your turn");
    expect(q(container, ".card").classList.contains("card-armed")).toBe(false);
  });

  it("shows the defeat overlay naming the incorporator", () => {
    const { container, cb, hud } = setup();
    let g = playing();
    g = { ...g, current: 2, overlords: new Map([["beta", "gamma"]]) };
    g = withHand(g, 2, ["incorporate"]);
    g = playCard(g, 0, seededRng(1), "beta");
    expect(g.phase).toBe("defeat");
    hud.update(g);
    const overlay = q(container, ".gameover-overlay");
    expect(overlay.classList.contains("hidden")).toBe(false);
    expect(q(container, ".gameover-reason").textContent).toBe(
      "Your realm has been incorporated by Gamma",
    );
    expect(q(container, ".status-bar").classList.contains("hidden")).toBe(true);
    (overlay.querySelector(".menu-new-game") as HTMLElement).click();
    expect(cb.onNewGame).toHaveBeenCalledOnce();
  });
});
