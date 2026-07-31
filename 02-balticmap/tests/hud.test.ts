// @vitest-environment happy-dom
import { describe, it, expect, vi } from "vitest";
import { createHud, type HudCallbacks } from "../src/hud";
import {
  newGame, startGame, chooseDeck, pickFaction, advance, playCard, beginTurn,
  type GameState, type GameEvent,
} from "../src/game";
import { aiTakeTurn } from "../src/ai";
import { buildDeck, type Rng } from "../src/cards";
import { allianceKey, bumpMight } from "../src/relations";
import { rulerOf } from "../src/rulers";
import {
  INCORPORATE_RAMP, PASSIVE_PER_LANDS, loyaltyKey,
} from "../src/playability";
import type { TargetExplanation } from "../src/target-explanations";
import { memoryStorage, type MetaStorage } from "../src/meta";

function seededRng(seed: number): Rng {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const FACTIONS = ["alpha", "beta", "gamma"];

function setup(opts?: {
  canPlayCard?: (cardId: string) => boolean;
  targetExplanations?: (cardId: string) => TargetExplanation[];
  cardModifiers?: (cardId: string) => string[];
  isDiscardMode?: () => boolean;
  onResetProgress?: () => void;
  onSurrender?: () => void;
  onHighlightFaction?: (factionId: string | null) => void;
  placeNameFactionIds?: Set<string>;
  /** LogPrefs storage. Defaults to a fresh, isolated memoryStorage() per
   *  call - pass the SAME instance to two setup() calls to test that
   *  preferences persist across HUD instances. */
  logStorage?: MetaStorage;
}) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const cb: HudCallbacks = {
    onNewGame: vi.fn(),
    onPlayCard: vi.fn(),
    onTributeTrack: vi.fn(),
    ...(opts?.canPlayCard ? { canPlayCard: opts.canPlayCard } : {}),
    ...(opts?.targetExplanations
      ? { targetExplanations: opts.targetExplanations }
      : {}),
    ...(opts?.cardModifiers ? { cardModifiers: opts.cardModifiers } : {}),
    ...(opts?.isDiscardMode ? { isDiscardMode: opts.isDiscardMode } : {}),
    ...(opts?.onResetProgress ? { onResetProgress: opts.onResetProgress } : {}),
    ...(opts?.onSurrender ? { onSurrender: opts.onSurrender } : {}),
    ...(opts?.onHighlightFaction
      ? { onHighlightFaction: opts.onHighlightFaction }
      : {}),
  };
  const hud = createHud(container, cb, new Map([
    ["alpha", "Alpha"], ["beta", "Beta"], ["gamma", "Gamma"],
  ]), opts?.placeNameFactionIds, opts?.logStorage ?? memoryStorage());
  return { container, cb, hud };
}

const q = (c: HTMLElement, sel: string) => c.querySelector(sel) as HTMLElement;

function withHand(g: GameState, playerIdx: number, hand: string[]): GameState {
  const p = { ...g.players[playerIdx], hand };
  return { ...g, players: g.players.map((pl, i) => (i === playerIdx ? p : pl)) };
}

describe("createHud", () => {
  function playing() {
    return pickFaction(chooseDeck(startGame(newGame(FACTIONS)), buildDeck()), "beta", seededRng(1));
  }

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

  it("prompts for a faction during pick-faction", () => {
    const { container, hud } = setup();
    hud.update(chooseDeck(startGame(newGame(FACTIONS)), buildDeck()));
    expect(q(container, ".menu-overlay").classList.contains("hidden")).toBe(true);
    expect(q(container, ".status-bar").classList.contains("hidden")).toBe(false);
    expect(q(container, ".status-text").textContent).toBe("Choose your faction");
  });

  it("renders the human turn: status, piles, fanned hand", () => {
    const { container, cb, hud } = setup();
    const g = withHand(pickFaction(chooseDeck(startGame(newGame(FACTIONS)), buildDeck()), "beta", seededRng(1)), 0, ["grow-crops"]);
    hud.update(g);
    expect(q(container, ".status-text").textContent).toBe("Turn 1 - play a card");
    expect(q(container, ".pile-deck .pile-count").textContent).toBe("6");
    expect(q(container, ".pile-deck .pile-label").textContent).toBe("Deck");
    expect(q(container, ".pile-discard .pile-count").textContent).toBe("0");
    expect(q(container, ".pile-discard .pile-label").textContent).toBe("Discard");
    const cards = container.querySelectorAll(".card");
    expect(cards).toHaveLength(1);
    expect(cards[0].querySelector(".card-name")!.textContent).toBe("Grow turnips");
    (cards[0] as HTMLElement).click();
    expect(cb.onPlayCard).toHaveBeenCalledWith(0);
  });

  it("fans multiple cards with symmetric rotations", () => {
    const { container, hud } = setup();
    // opening hand deals 3 + a turn draw = 4; force a known 3-card hand to
    // exercise the fan formula independent of hand size.
    const g = withHand(
      pickFaction(chooseDeck(startGame(newGame(FACTIONS)), buildDeck()), "beta", seededRng(1)), 0,
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
    let g = pickFaction(chooseDeck(startGame(newGame(FACTIONS)), buildDeck()), "beta", seededRng(1));
    // advance hands control to player 2 (AI); force a known 1-card hand
    g = advance({ ...g, playedThisTurn: true }, seededRng(3));
    g = withHand(g, 0, ["grow-crops"]);
    hud.update(g);
    expect(q(container, ".status-text").textContent).toBe("Waiting on other players...");
    const cards = [...container.querySelectorAll(".card")] as HTMLButtonElement[];
    expect(cards).toHaveLength(1);
    expect(cards[0].disabled).toBe(true);
    cards[0].click();
    expect(cb.onPlayCard).not.toHaveBeenCalled();
  });

  it("disables remaining cards after playing one this turn", () => {
    const { container, cb, hud } = setup();
    let g = pickFaction(chooseDeck(startGame(newGame(FACTIONS)), buildDeck()), "beta", seededRng(1));
    // run one full round so the human holds 2 cards on their next turn
    for (let i = 0; i < FACTIONS.length; i++) g = advance({ ...g, playedThisTurn: true }, seededRng(4));
    g = withHand(g, 0, ["grow-crops", "grow-crops"]);
    g = playCard(g, 0, seededRng(1)); // 1 card left, playedThisTurn = true
    hud.update(g);
    const card = q(container, ".card") as HTMLButtonElement;
    expect(card.disabled).toBe(true);
    card.click();
    expect(cb.onPlayCard).not.toHaveBeenCalled();
  });

  it("names the faction that unified the Balts", () => {
    const { container, hud } = setup();
    const g = playing();
    hud.update({
      ...g,
      phase: "defeat",
      log: [
        ...g.log,
        { turn: 9, playerId: 2, type: "unified", overlordFactionId: "alpha" },
      ],
    });
    expect(q(container, ".pm-cause").textContent).toBe("Alpha unified the Balts");
  });

  it("marks a doubled play in the activity log", () => {
    const { container, hud } = setup();
    const g = playing();
    hud.update({
      ...g,
      log: [
        ...g.log,
        {
          turn: 3, playerId: 1, type: "play", cardId: "raid",
          targetFactionId: "alpha", doubled: true,
        },
      ],
    });
    expect(q(container, ".activity-log-entries").textContent)
      .toContain("You played Raid on Alpha - doubled");
  });
});

describe("visual piles", () => {
  it("renders layered card backs scaled to the count, dashed when empty", () => {
    const { container, hud } = setup();
    // force a non-targeted card so playCard(g, 0) below succeeds regardless
    // of what the seeded shuffle happened to deal
    const g = withHand(
      pickFaction(chooseDeck(startGame(newGame(FACTIONS)), buildDeck()), "beta", seededRng(1)), 0,
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
    return pickFaction(chooseDeck(startGame(newGame(FACTIONS)), buildDeck()), "beta", seededRng(1));
  }

  it("is hidden outside the playing phase and visible during it", () => {
    const { container, hud } = setup();
    hud.update(newGame(FACTIONS));
    expect(q(container, ".activity-log").classList.contains("hidden")).toBe(true);
    hud.update(playing());
    expect(q(container, ".activity-log").classList.contains("hidden")).toBe(false);
  });

  it("never logs a draw, and names your cards and AI plays", () => {
    const { container, hud } = setup();
    let g = playing();
    g = withHand(g, 0, ["grow-crops"]);
    g = playCard(g, 0, seededRng(1));
    g = advance({ ...g, playedThisTurn: true }, seededRng(2)); // player 2 draws - never logged
    g = withHand(g, 1, ["grow-crops"]);
    g = aiTakeTurn(g, seededRng(1)); // player 2 plays
    hud.update(g);
    const texts = [...container.querySelectorAll(".log-entry")].map(
      (el) => el.textContent,
    );
    const alpha = rulerOf(g.rulers, "alpha").name;
    expect(texts).toEqual([
      "You played Grow turnips",
      `${alpha} of the Alpha played Grow turnips`,
    ]);
  });

  it("names a place-name faction's ruler with no article", () => {
    const { container, hud } = setup({ placeNameFactionIds: new Set(["alpha"]) });
    let g = playing();
    g = advance({ ...g, playedThisTurn: true }, seededRng(2)); // player 2 draws
    g = withHand(g, 1, ["grow-crops"]);
    g = aiTakeTurn(g, seededRng(1)); // player 2 plays
    hud.update(g);
    const texts = [...container.querySelectorAll(".log-entry")].map(
      (el) => el.textContent,
    );
    const alpha = rulerOf(g.rulers, "alpha").name;
    expect(texts.some((t) => t === `${alpha} of Alpha played Grow turnips`)).toBe(true);
  });

  it("appends only new entries across updates and inserts turn separators", () => {
    const { container, hud } = setup();
    let g = playing(); // beta's opening draw, turn 1 (never logged)
    g = withHand(g, 0, ["grow-crops"]);
    g = playCard(g, 0, seededRng(1)); // entry 1: your play, turn 1
    hud.update(g);
    expect(container.querySelectorAll(".log-entry")).toHaveLength(1);

    g = advance(g, seededRng(2)); // -> alpha's turn (draw, never logged)
    g = withHand(g, 1, ["grow-crops"]);
    g = aiTakeTurn(g, seededRng(2)); // entry 2: alpha's play, turn 1
    g = advance(g, seededRng(2)); // -> gamma's turn (draw, never logged)
    g = withHand(g, 2, ["grow-crops"]);
    g = aiTakeTurn(g, seededRng(2)); // entry 3: gamma's play, turn 1
    g = advance(g, seededRng(2)); // -> back to you, turn bumps to 2 (draw, never logged)
    g = withHand(g, 0, ["grow-crops"]);
    g = playCard(g, 0, seededRng(2)); // entry 4: your play, turn 2

    hud.update(g);
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
    expect(container.querySelectorAll(".log-entry")).toHaveLength(1);
    hud.update(playing()); // fresh game: log has only the (unlogged) opening draw
    expect(container.querySelectorAll(".log-entry")).toHaveLength(0);
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

describe("activity log filters", () => {
  function playing() {
    return pickFaction(chooseDeck(startGame(newGame(FACTIONS)), buildDeck()), "beta", seededRng(1));
  }

  const filterCheckbox = (c: HTMLElement): HTMLInputElement =>
    c.querySelectorAll(".activity-log-filter input")[0] as HTMLInputElement;
  const popupsCheckbox = (c: HTMLElement): HTMLInputElement =>
    c.querySelectorAll(".activity-log-filter input")[1] as HTMLInputElement;

  it("defaults to unfiltered, with popups on", () => {
    const { container, hud } = setup();
    hud.update(playing());
    expect(filterCheckbox(container).checked).toBe(false);
    expect(popupsCheckbox(container).checked).toBe(true);
    expect(q(container, ".activity-log").classList.contains("filter-targeting-me")).toBe(false);
  });

  it("tags a notice-worthy entry, and leaves an AI-vs-AI entry untagged", () => {
    const { container, hud } = setup();
    let g = playing();
    g = {
      ...g,
      log: [
        ...g.log,
        { turn: 1, playerId: 2, type: "play", cardId: "raid", targetFactionId: "beta", amount: 1, track: "might" },
        { turn: 1, playerId: 2, type: "play", cardId: "raid", targetFactionId: "gamma", amount: 1, track: "might" },
      ],
    };
    hud.update(g);
    q(container, ".notice-continue").click(); // dismiss the round summary the raid raised
    const entries = [...container.querySelectorAll(".activity-log .log-entry")];
    const raidOnYou = entries.find((el) => el.textContent === "Alpha played Raid on you")!;
    const raidOnGamma = entries.find((el) => el.textContent === "Alpha played Raid on Gamma")!;
    expect(raidOnYou.classList.contains("notice-worthy")).toBe(true);
    expect(raidOnGamma.classList.contains("notice-worthy")).toBe(false);
  });

  it("checking Targeting me hides everything but notice-worthy entries, instantly", () => {
    const { container, hud } = setup();
    let g = playing();
    g = {
      ...g,
      log: [
        ...g.log,
        { turn: 1, playerId: 2, type: "play", cardId: "raid", targetFactionId: "beta", amount: 1, track: "might" },
        { turn: 1, playerId: 2, type: "play", cardId: "raid", targetFactionId: "gamma", amount: 1, track: "might" },
      ],
    };
    hud.update(g);
    q(container, ".notice-continue").click();
    filterCheckbox(container).click();
    expect(q(container, ".activity-log").classList.contains("filter-targeting-me")).toBe(true);
  });

  it("persists both preferences across HUD instances sharing storage", () => {
    const logStorage = memoryStorage();
    const { container: c1, hud: hud1 } = setup({ logStorage });
    hud1.update(playing());
    filterCheckbox(c1).click();
    popupsCheckbox(c1).click();

    const { container: c2, hud: hud2 } = setup({ logStorage });
    hud2.update(playing());
    expect(filterCheckbox(c2).checked).toBe(true);
    expect(popupsCheckbox(c2).checked).toBe(false);
  });

  it("unchecking Show popups keeps the round silent, without losing the log entry", () => {
    const { container, hud } = setup();
    popupsCheckbox(container).click(); // off, before any game state exists
    let g = playing();
    g = {
      ...g,
      log: [
        ...g.log,
        { turn: 1, playerId: 2, type: "play", cardId: "raid", targetFactionId: "beta", amount: 1, track: "might" },
      ],
    };
    hud.update(g);
    expect(q(container, ".notice-overlay").classList.contains("hidden")).toBe(true);
    const texts = [...container.querySelectorAll(".log-entry")].map((el) => el.textContent);
    expect(texts).toContain("Alpha played Raid on you");
  });

  /** The mute narrows the interrupt, it does not switch it off. Being made
   *  someone's vassal walls off your own plays, so a muted player who was
   *  never told would discover it by noticing their cards had stopped
   *  working. */
  it("still interrupts for your own subjugation with popups muted", () => {
    const { container, hud } = setup();
    popupsCheckbox(container).click(); // off
    let g = playing();
    g = {
      ...g,
      overlords: new Map([["beta", "alpha"]]),
      log: [
        ...g.log,
        { turn: 1, playerId: 2, type: "play", cardId: "raid", targetFactionId: "beta", amount: 1, track: "might" },
        { turn: 1, playerId: 2, type: "subjugated", targetFactionId: "beta", overlordFactionId: "alpha" },
      ],
    };
    hud.update(g);
    expect(q(container, ".notice-overlay").classList.contains("hidden")).toBe(false);
    expect(q(container, ".notice-title").textContent).toBe("You were subjugated");
    const lines = [...container.querySelectorAll(".notice-line")].map((el) => el.textContent);
    // Only the subjugation rides through the mute; the Raid stays in the log.
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatch(/fealty/i);
    const logTexts = [...container.querySelectorAll(".log-entry")].map((el) => el.textContent);
    expect(logTexts).toContain("Alpha played Raid on you");
  });

  it("stays silent with popups muted when a rival poaches a vassal from you", () => {
    const { container, hud } = setup();
    popupsCheckbox(container).click(); // off
    let g = playing();
    g = {
      ...g,
      overlords: new Map([["gamma", "alpha"]]),
      log: [
        ...g.log,
        {
          turn: 1, playerId: 2, type: "subjugated", targetFactionId: "gamma",
          overlordFactionId: "alpha", formerOverlordFactionId: "beta",
        },
      ],
    };
    hud.update(g);
    expect(q(container, ".notice-overlay").classList.contains("hidden")).toBe(true);
  });
});

describe("card animations", () => {
  function playing() {
    return pickFaction(chooseDeck(startGame(newGame(FACTIONS)), buildDeck()), "beta", seededRng(1));
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
    expect(flying[0].textContent).toBe("Grow turnips");
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
    g = advance({ ...g, playedThisTurn: true }, seededRng(2)); // AI draw event
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

describe("afterPlayAnimation", () => {
  function playing() {
    return pickFaction(chooseDeck(startGame(newGame(FACTIONS)), buildDeck()), "beta", seededRng(1));
  }

  it("waits for the played card to land before firing", () => {
    vi.useFakeTimers();
    const { hud } = setup();
    let g = playing();
    hud.update(g);
    vi.runAllTimers(); // clear the opening draw's flight
    g = withHand(g, 0, ["grow-crops"]);
    g = playCard(g, 0, seededRng(1));
    hud.update(g);

    const fn = vi.fn();
    hud.afterPlayAnimation(fn);
    vi.advanceTimersByTime(20 + 350 + 700 + 350 - 1);
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(fn).toHaveBeenCalledOnce();
    vi.useRealTimers();
  });

  it("fires on the next tick when nothing flew (a forced discard)", () => {
    vi.useFakeTimers();
    const { hud } = setup();
    const g = playing();
    hud.update(g); // nothing played yet - no flight in the air
    const fn = vi.fn();
    hud.afterPlayAnimation(fn);
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(0);
    expect(fn).toHaveBeenCalledOnce();
    vi.useRealTimers();
  });

  it("fires exactly once even once every timer has run", () => {
    vi.useFakeTimers();
    const { hud } = setup();
    let g = playing();
    hud.update(g);
    vi.runAllTimers();
    g = withHand(g, 0, ["grow-crops"]);
    g = playCard(g, 0, seededRng(1));
    hud.update(g);
    const fn = vi.fn();
    hud.afterPlayAnimation(fn);
    vi.runAllTimers();
    expect(fn).toHaveBeenCalledOnce();
    vi.useRealTimers();
  });

  it("a new game releases a pending continuation", () => {
    vi.useFakeTimers();
    const { hud } = setup();
    let g = playing();
    hud.update(g);
    vi.runAllTimers();
    g = withHand(g, 0, ["grow-crops"]);
    g = playCard(g, 0, seededRng(1));
    hud.update(g); // the card is now mid-flight

    const fn = vi.fn();
    hud.afterPlayAnimation(fn);
    hud.update(newGame(FACTIONS)); // main-menu: the run this flight belonged to is gone
    expect(fn).toHaveBeenCalledOnce();
    vi.useRealTimers();
  });
});

describe("subjugation HUD", () => {
  function playing() {
    return pickFaction(chooseDeck(startGame(newGame(FACTIONS)), buildDeck()), "beta", seededRng(1));
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

  it("hovering a faction name in the log highlights that faction on the map", () => {
    const onHighlightFaction = vi.fn();
    const { container, hud } = setup({ onHighlightFaction });
    let g = playing();
    g = { ...g, relations: bumpMight(bumpMight(g.relations, "beta", "alpha"), "beta", "alpha") };
    g = withHand(g, 0, ["subjugate"]);
    g = playCard(g, 0, seededRng(1), "alpha");
    hud.update(g);
    const entry = [...container.querySelectorAll(".log-entry")]
      .find((el) => el.textContent === "You played Subjugate on Alpha")!;
    const span = entry.querySelector(".rt-faction")!;
    expect(span.textContent).toBe("Alpha");
    span.dispatchEvent(new MouseEvent("mousemove", { clientX: 1, clientY: 1, bubbles: true }));
    expect(onHighlightFaction).toHaveBeenCalledWith("alpha");
    span.dispatchEvent(new MouseEvent("mouseleave", { bubbles: true }));
    expect(onHighlightFaction).toHaveBeenCalledWith(null);
  });

  it("appends '- prevented' to a nullified Assassinate ruler play, for both the actor and the victim", () => {
    const { container, hud } = setup();
    let g = { ...playing(), bodyguards: ["alpha"] };
    g = withHand(g, 0, ["assassinate-ruler"]);
    const survivor = rulerOf(g.rulers, "alpha").name;
    g = playCard(g, 0, seededRng(1), "alpha"); // you (beta) are the actor
    hud.update(g);
    const texts = [...container.querySelectorAll(".log-entry")].map(
      (el) => el.textContent,
    );
    expect(texts).toContain(
      `You played Assassinate ruler on Alpha - prevented, ${survivor} survives`,
    );

    const { container: container2, hud: hud2 } = setup();
    let g2 = { ...playing(), bodyguards: ["beta"], current: 1 }; // alpha acts against you
    g2 = withHand(g2, 1, ["assassinate-ruler"]);
    const ruler = rulerOf(g2.rulers, "alpha").name;
    const ruler2 = rulerOf(g2.rulers, "beta").name;
    g2 = playCard(g2, 0, seededRng(1), "beta");
    hud2.update(g2);
    const texts2 = [...container2.querySelectorAll(".log-entry")].map(
      (el) => el.textContent,
    );
    expect(texts2).toContain(
      `${ruler} of the Alpha played Assassinate ruler on you - prevented, ${ruler2} survives`,
    );
  });

  it("marks cards the callback rejects as unplayable", () => {
    const { container, cb, hud } = setup({ canPlayCard: (id) => id !== "incorporate" });
    const g = withHand(playing(), 0, ["incorporate", "grow-crops"]);
    hud.update(g);
    const cards = [...container.querySelectorAll(".card")] as HTMLButtonElement[];
    expect(cards[0].disabled).toBe(false);
    expect(cards[0].getAttribute("aria-disabled")).toBe("true");
    expect(cards[0].classList.contains("unplayable")).toBe(true);
    expect(cards[1].disabled).toBe(false);
    cards[0].click();
    expect(cb.onPlayCard).not.toHaveBeenCalled();
  });

  it("keeps blocked targeted cards inspectable and explains candidates", () => {
    const { container, cb, hud } = setup({
      canPlayCard: () => false,
      targetExplanations: () => [{
        factionId: "gamma",
        available: false,
        lines: [
          "Gamma",
          "Blocked by Alliance until turn 12.",
        ],
      }],
    });
    hud.update(withHand(playing(), 0, ["subjugate"]));

    const card = q(container, ".card") as HTMLButtonElement;
    expect(card.disabled).toBe(false);
    expect(card.getAttribute("aria-disabled")).toBe("true");
    expect(q(container, ".card-tip").textContent).toContain("Potential targets");
    expect(q(container, ".card-tip").textContent)
      .toContain("Blocked by Alliance until turn 12.");

    card.click();
    expect(cb.onPlayCard).not.toHaveBeenCalled();
  });

  it("does not play a card when its target popup is clicked", () => {
    const { container, cb, hud } = setup({
      targetExplanations: () => [{
        factionId: "gamma",
        available: true,
        lines: ["Gamma", "Available."],
      }],
    });
    hud.update(withHand(playing(), 0, ["subjugate"]));

    q(container, ".card-tip").click();

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
    expect(q(container, ".status-text").textContent).toBe("Turn 1 - play a card");
    expect(q(container, ".card").classList.contains("card-armed")).toBe(false);
  });
});

describe("hud v2", () => {
  function playing() {
    return pickFaction(chooseDeck(startGame(newGame(FACTIONS)), buildDeck()), "beta", seededRng(1));
  }

  it("has no End Turn button", () => {
    const { container, hud } = setup();
    hud.update(playing());
    expect(container.querySelector(".end-turn")).toBeNull();
    expect(q(container, ".status-text").textContent).toBe("Turn 1 - play a card");
  });

  it("discard mode enables all cards and prompts", () => {
    const { container, cb, hud } = setup({ isDiscardMode: () => true });
    const g = withHand(playing(), 0, ["subjugate", "incorporate"]);
    hud.update(g);
    expect(q(container, ".status-text").textContent).toBe(
      "No playable card - discard one",
    );
    const cards = [...container.querySelectorAll(".card")] as HTMLButtonElement[];
    expect(cards.every((c) => !c.disabled)).toBe(true);
    expect(cards.every((c) => c.classList.contains("discard-hint"))).toBe(true);
    cards[1].click();
    expect(cb.onPlayCard).toHaveBeenCalledWith(1);
  });

  it("tribute prompt swaps the status bar to track buttons", () => {
    const { container, cb, hud } = setup();
    hud.update(playing());
    hud.setTributePrompt(true);
    const buttons = [...container.querySelectorAll(".tribute-btn")];
    expect(buttons.map((b) => b.textContent)).toEqual(["Might", "Status"]);
    (buttons[1] as HTMLElement).click();
    expect(cb.onTributeTrack).toHaveBeenCalledWith("status");
    hud.setTributePrompt(false);
    // buttons stay in the DOM, hidden via the codebase's .hidden convention
    expect(
      q(container, ".tribute-buttons").classList.contains("hidden"),
    ).toBe(true);
    expect(q(container, ".status-text").textContent).toBe("Turn 1 - play a card");
  });

  it("defeat shows the post-mortem with cause, build-up, seen cards, and log", () => {
    const { container, cb, hud } = setup();
    // A 3-faction roster makes gamma's realm (itself + vassal beta) reach
    // victory size the instant overlords is seeded below, before either card
    // plays - a 4th faction keeps that build-up step from ending the game
    // early. gamma still lands at players[2], same as with 3 factions.
    let g = pickFaction(
      chooseDeck(startGame(newGame([...FACTIONS, "delta"])), buildDeck()),
      "beta", seededRng(1),
    );
    g = { ...g, current: 2, overlords: new Map([["beta", "gamma"]]) };
    g = withHand(g, 2, ["raid"]);
    g = playCard(g, 0, seededRng(1), "beta"); // gamma raids you (seen)
    g = { ...g, playedThisTurn: false };
    // Held long enough that Incorporate is certain: this test is about the
    // post-mortem, not about the loyalty roll.
    g = { ...g, loyalty: { [loyaltyKey("beta", "gamma")]: INCORPORATE_RAMP } };
    g = withHand(g, 2, ["incorporate"]);
    g = playCard(g, 0, seededRng(1), "beta");
    expect(g.phase).toBe("defeat");
    hud.update(g);
    const pm = q(container, ".postmortem-overlay");
    expect(pm.classList.contains("hidden")).toBe(false);
    expect(q(container, ".pm-title").textContent).toBe("Game over");
    expect(q(container, ".pm-cause").textContent).toBe("Incorporated by Gamma");
    expect(q(container, ".pm-buildup").textContent).toContain("Raid");
    expect(q(container, ".pm-log .log-entry").textContent?.length).toBeGreaterThan(0);
    expect(q(container, ".status-bar").classList.contains("hidden")).toBe(true);
    (pm.querySelector(".menu-new-game") as HTMLElement).click();
    expect(cb.onNewGame).toHaveBeenCalledOnce();
  });

  it("victory names the realm size", () => {
    const { container, hud } = setup();
    const many = Array.from({ length: 20 }, (_, i) => `f${i}`);
    let g = pickFaction(
      chooseDeck(startGame(newGame(many)), buildDeck()), "f0", seededRng(1),
    );
    const inc: Record<string, string> = {};
    for (let i = 1; i <= 10; i++) inc[`f${i}`] = "f0";
    g = { ...g, incorporated: inc };
    g = withHand(g, 0, ["grow-crops"]);
    g = playCard(g, 0, seededRng(1));
    expect(g.phase).toBe("victory");
    hud.update(g);
    expect(q(container, ".pm-title").textContent).toBe("Victory");
    expect(q(container, ".pm-cause").textContent).toBe(
      "You rule the Baltic - 11 of 20 lands",
    );
  });
});

describe("learning loop hud", () => {
  function playing() {
    return pickFaction(
      chooseDeck(startGame(newGame(FACTIONS)), buildDeck()),
      "beta", seededRng(1),
    );
  }

  function defeated() {
    let g = playing();
    g = { ...g, current: 2, overlords: new Map([["beta", "gamma"]]) };
    g = withHand(g, 2, ["incorporate"]);
    g = playCard(g, 0, seededRng(1), "beta");
    return g;
  }

  it("reports what the run earned and drops the old loot row", () => {
    const { container, hud } = setup();
    hud.update(defeated());
    expect(q(container, ".pm-xp").textContent).toMatch(/^\+\d+ XP earned$/);
    expect(container.querySelector(".pm-seen")).toBeNull();
  });

  it("reset progress arms on first click and fires on second", () => {
    const onResetProgress = vi.fn();
    const { container, hud } = setup({ onResetProgress });
    hud.update(newGame(FACTIONS));
    const reset = q(container, ".menu-reset");
    expect(reset.textContent).toBe("Reset progress");
    reset.click();
    expect(onResetProgress).not.toHaveBeenCalled();
    expect(reset.textContent).toBe("Really reset?");
    expect(reset.classList.contains("confirm")).toBe(true);
    reset.click();
    expect(onResetProgress).toHaveBeenCalledOnce();
    expect(reset.textContent).toBe("Reset progress");
  });

  it("omits the reset control without the callback", () => {
    const { container, hud } = setup();
    hud.update(newGame(FACTIONS));
    expect(container.querySelector(".menu-reset")).toBeNull();
  });
});

describe("notice modal", () => {
  function playing() {
    return pickFaction(chooseDeck(startGame(newGame(FACTIONS)), buildDeck()), "beta", seededRng(1));
  }

  function withEvents(g: GameState, events: GameEvent[]): GameState {
    return { ...g, log: [...g.log, ...events] };
  }

  const lineTexts = (container: HTMLElement): string[] =>
    [...container.querySelectorAll(".notice-line")].map((el) => el.textContent ?? "");
  const footnoteTexts = (container: HTMLElement): string[] =>
    [...container.querySelectorAll(".notice-footnote")].map((el) => el.textContent ?? "");

  const subjugatedYou: GameEvent = {
    turn: 1, playerId: 2, type: "subjugated",
    targetFactionId: "beta", overlordFactionId: "alpha",
  };
  const releasedYou: GameEvent = {
    turn: 1, playerId: 3, type: "released", targetFactionId: "beta",
  };

  it("shows a modal when a rival poaches one of your vassals", () => {
    const { container, hud } = setup();
    hud.update(withEvents(playing(), [{
      turn: 1, playerId: 2, type: "subjugated", targetFactionId: "gamma",
      overlordFactionId: "alpha", formerOverlordFactionId: "beta",
    }]));
    expect(q(container, ".notice-overlay").classList.contains("hidden")).toBe(false);
    expect(q(container, ".notice-title").textContent).toBe("What happened during their turns");
    expect(lineTexts(container)).toEqual([
      "Subjugate by Alpha took your vassal Gamma (Might +1 -> 0, Status +1 -> 0)",
    ]);
    expect(footnoteTexts(container)[0]).toContain("Your realm is smaller");
  });

  it("shows a modal when a vassal of yours breaks free", () => {
    const { container, hud } = setup();
    hud.update(withEvents(playing(), [{
      turn: 1, playerId: 3, type: "reclaimed", cardId: "revolt",
      targetFactionId: "gamma", overlordFactionId: "beta", amount: 1,
    }]));
    expect(lineTexts(container)).toEqual([
      "Revolt by Gamma cast off your overlordship (Might +1 -> 0, Status +1 -> 0)",
    ]);
  });

  it("shows a mandatory modal when an AI subjugates you", () => {
    const { container, hud } = setup();
    hud.update(withEvents(playing(), [subjugatedYou]));
    const overlay = q(container, ".notice-overlay");
    expect(overlay.classList.contains("hidden")).toBe(false);
    expect(lineTexts(container)).toEqual(["Subjugate by Alpha - you owe fealty to them"]);
    expect(footnoteTexts(container)[0]).toContain("Pay tribute cards were shuffled into your deck");
  });

  it("dismisses on Continue and stays dismissed on re-render", () => {
    const { container, hud } = setup();
    const g = withEvents(playing(), [subjugatedYou]);
    hud.update(g);
    q(container, ".notice-continue").click();
    expect(q(container, ".notice-overlay").classList.contains("hidden")).toBe(true);
    hud.update(g); // same state: no new events, no re-show
    expect(q(container, ".notice-overlay").classList.contains("hidden")).toBe(true);
  });

  it("puts both a subjugation and a release in one modal with one Continue", () => {
    const { container, hud } = setup();
    hud.update(withEvents(playing(), [subjugatedYou, releasedYou]));
    expect(lineTexts(container)).toEqual([
      "Subjugate by Alpha - you owe fealty to them",
      "The fall of your overlord to Gamma released you from vassalage",
    ]);
    expect(q(container, ".notice-overlay").classList.contains("hidden")).toBe(false);
    q(container, ".notice-continue").click();
    expect(q(container, ".notice-overlay").classList.contains("hidden")).toBe(true);
  });

  it("lists 2 raid events in one update as 2 lines in a single modal", () => {
    const { container, hud } = setup();
    const raidByAlpha: GameEvent = {
      turn: 1, playerId: 2, type: "play", cardId: "raid", targetFactionId: "beta",
      amount: 1, track: "might",
    };
    const raidByGamma: GameEvent = {
      turn: 1, playerId: 3, type: "play", cardId: "raid", targetFactionId: "beta",
      amount: 1, track: "might",
    };
    hud.update(withEvents(playing(), [raidByAlpha, raidByGamma]));
    expect(q(container, ".notice-overlay").classList.contains("hidden")).toBe(false);
    expect(lineTexts(container)).toEqual([
      "Raid played against you by Alpha (Might +1 -> 0)",
      "Raid played against you by Gamma (Might +1 -> 0)",
    ]);
    q(container, ".notice-continue").click();
    expect(q(container, ".notice-overlay").classList.contains("hidden")).toBe(true);
  });

  it("shows the alliance until-turn clause inline on the line", () => {
    const { container, hud } = setup();
    let g = playing();
    g = {
      ...g,
      alliances: { [allianceKey("beta", "alpha")]: 8 },
      log: [
        ...g.log,
        { turn: 1, playerId: 2, type: "play", cardId: "alliance", targetFactionId: "beta" },
      ],
    };
    hud.update(g);
    expect(q(container, ".notice-overlay").classList.contains("hidden")).toBe(false);
    expect(lineTexts(container)).toEqual([
      "Alliance sealed with you by Alpha, until turn 8",
    ]);
  });

  it("renders a place-name actor with no article, as a hoverable faction span that highlights the map", () => {
    // Actor (alpha) is a place-name faction and gets no article; proves the
    // real hud.ts wiring, not just the hand-built NoticeCtx fixture in
    // notices.test.ts.
    const onHighlightFaction = vi.fn();
    const { container, hud } = setup({
      placeNameFactionIds: new Set(["alpha"]), onHighlightFaction,
    });
    hud.update(withEvents(playing(), [{
      turn: 1, playerId: 2, type: "play", cardId: "assassinate-ruler",
      targetFactionId: "beta", targetRuler: "Kaupo", successorRuler: "Dabrelis", amount: 1,
    }]));
    expect(lineTexts(container)).toEqual([
      "Assassinate ruler took Kaupo; Dabrelis now leads you - by Alpha (Status -1 -> 0)",
    ]);
    const span = q(container, ".notice-line .rt-faction");
    expect(span.textContent).toBe("Alpha");
    span.dispatchEvent(new MouseEvent("mousemove", { clientX: 1, clientY: 1, bubbles: true }));
    expect(onHighlightFaction).toHaveBeenCalledWith("alpha");
  });

  it("dismisses on Escape", () => {
    const { container, hud } = setup();
    hud.update(withEvents(playing(), [subjugatedYou]));
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(q(container, ".notice-overlay").classList.contains("hidden")).toBe(true);
  });

  it("clears a hover's tip and map halo on dismiss", () => {
    const onHighlightFaction = vi.fn();
    const onHideTip = vi.fn();
    const { container, cb, hud } = setup({ onHighlightFaction });
    cb.onHideTip = onHideTip;
    hud.update(withEvents(playing(), [subjugatedYou]));
    q(container, ".notice-continue").click();
    expect(onHideTip).toHaveBeenCalled();
    expect(onHighlightFaction).toHaveBeenCalledWith(null);
  });

  it("shows nothing for your own plays or AI-vs-AI events", () => {
    const { container, hud } = setup();
    hud.update(withEvents(playing(), [
      { turn: 1, playerId: 1, type: "subjugated", targetFactionId: "alpha", overlordFactionId: "beta" },
      { turn: 1, playerId: 2, type: "subjugated", targetFactionId: "gamma", overlordFactionId: "alpha" },
    ]));
    expect(q(container, ".notice-overlay").classList.contains("hidden")).toBe(true);
  });

  it("clears the overlay when a new game starts", () => {
    const { container, hud } = setup();
    hud.update(withEvents(playing(), [subjugatedYou, releasedYou]));
    expect(q(container, ".notice-overlay").classList.contains("hidden")).toBe(false);
    hud.update(playing()); // fresh game: shorter log resets renderLog
    expect(q(container, ".notice-overlay").classList.contains("hidden")).toBe(true);
    // a later dismiss must not resurface a stale summary
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(q(container, ".notice-overlay").classList.contains("hidden")).toBe(true);
  });

  it("does not show notices once the game has ended", () => {
    const { container, hud } = setup();
    let g = withEvents(playing(), [subjugatedYou]);
    g = { ...g, phase: "defeat" };
    hud.update(g);
    expect(q(container, ".notice-overlay").classList.contains("hidden")).toBe(true);
  });
});

describe("log highlighting", () => {
  function playing() {
    return pickFaction(chooseDeck(startGame(newGame(FACTIONS)), buildDeck()), "beta", seededRng(1));
  }

  it("marks entries involving the human faction with log-you", () => {
    const { container, hud } = setup();
    let g = playing(); // log: your opening draw (playerId 1)
    g = {
      ...g,
      log: [
        ...g.log,
        { turn: 1, playerId: 2, type: "draw", cardId: "raid" },
        { turn: 1, playerId: 2, type: "subjugated", targetFactionId: "beta", overlordFactionId: "alpha" },
        { turn: 1, playerId: 2, type: "subjugated", targetFactionId: "gamma", overlordFactionId: "alpha" },
        { turn: 1, playerId: 3, type: "reclaimed", targetFactionId: "gamma", overlordFactionId: "beta" },
      ],
    };
    hud.update(g);
    // dismiss the modal the subjugation raised; this test is about the log
    q(container, ".notice-continue").click();
    const entries = [...container.querySelectorAll(".activity-log .log-entry")];
    const flags = entries.map((el) => el.classList.contains("log-you"));
    // draws never reach the log; you subjugated, AI-vs-AI, AI reclaims from you
    expect(flags).toEqual([true, false, true]);
  });

  it("marks postmortem log entries the same way", () => {
    const { container, hud } = setup();
    let g = playing();
    g = {
      ...g,
      phase: "defeat",
      log: [
        ...g.log,
        { turn: 2, playerId: 2, type: "defeat", targetFactionId: "beta", overlordFactionId: "alpha" },
      ],
    };
    hud.update(g);
    const entries = [...container.querySelectorAll(".pm-log .log-entry")];
    expect(entries.length).toBeGreaterThan(0);
    expect(entries[entries.length - 1].classList.contains("log-you")).toBe(true);
  });
});

describe("notice details and hand tips", () => {
  function playing() {
    return pickFaction(chooseDeck(startGame(newGame(FACTIONS)), buildDeck()), "beta", seededRng(1));
  }

  it("renders the line for a subjugation notice, with its Pay Tribute footnote", () => {
    const { container, hud } = setup();
    let g = playing();
    g = { ...g, log: [...g.log, { turn: 1, playerId: 2, type: "subjugated", targetFactionId: "beta", overlordFactionId: "alpha" }] };
    hud.update(g);
    expect(q(container, ".notice-line").textContent).toContain("you owe fealty to them");
    expect(q(container, ".notice-footnote").textContent).toContain(
      "Pay tribute cards were shuffled into your deck",
    );
    expect(q(container, ".notice-footnotes").classList.contains("hidden")).toBe(false);
  });

  it("hides the footer when the round produced no consequences", () => {
    // Your own subjugation losing you a vassal (role "lord") carries no
    // footnote of its own - the Pay Tribute consequence belongs to the
    // "subjugated" line for the same round, not this side-effect.
    const { container, hud } = setup();
    let g = playing();
    g = { ...g, log: [...g.log, { turn: 1, playerId: 3, type: "released", targetFactionId: "gamma", overlordFactionId: "beta" }] };
    hud.update(g);
    expect(q(container, ".notice-overlay").classList.contains("hidden")).toBe(false);
    expect(q(container, ".notice-footnotes").classList.contains("hidden")).toBe(true);
  });

  it("hand cards carry a name span and a rules tip", () => {
    const { container, hud } = setup();
    const g = withHand(playing(), 0, ["fortify"]);
    hud.update(g);
    const card = q(container, ".hand .card");
    expect(card.querySelector(".card-name")!.textContent).toBe("Fortify");
    expect(card.querySelector(".card-tip")!.textContent).toBe(
      "Gain +1 Might over every other living faction at once.",
    );
  });

  it("shows an active modifier above the card description", () => {
    const { container, hud } = setup({
      cardModifiers: () => ["Favourable omens: this card counts double."],
    });
    hud.update(withHand(playing(), 0, ["raid"]));
    const tip = q(container, ".card-tip");
    expect(tip.firstElementChild!.className).toBe("card-tip-modifier");
    expect(tip.textContent).toContain("Favourable omens: this card counts double.");
    expect(tip.textContent).toContain("on their border"); // description still there
  });
});

describe("log lines name rulers", () => {
  function playing() {
    return pickFaction(chooseDeck(startGame(newGame(FACTIONS)), buildDeck()), "beta", seededRng(1));
  }

  const texts = (container: HTMLElement) =>
    [...container.querySelectorAll(".log-entry")].map((el) => el.textContent);

  it("names the ruler and their faction instead of a player number", () => {
    const { container, hud } = setup();
    let g = { ...playing(), current: 1 }; // alpha acts
    g = withHand(g, 1, ["grow-crops"]);
    const alpha = rulerOf(g.rulers, "alpha").name;
    g = playCard(g, 0, seededRng(1));
    hud.update(g);
    expect(texts(container)).toContain(`${alpha} of the Alpha played Grow turnips`);
    expect(texts(container).join(" ")).not.toContain("Player 2");
  });

  it("still addresses the human as You", () => {
    const { container, hud } = setup();
    let g = withHand(playing(), 0, ["grow-crops"]);
    g = playCard(g, 0, seededRng(1));
    hud.update(g);
    expect(texts(container)).toContain("You played Grow turnips");
  });

  it("names the dead ruler and the successor", () => {
    const { container, hud } = setup();
    let g = withHand(playing(), 0, ["assassinate-ruler"]);
    const killed = rulerOf(g.rulers, "alpha").name;
    g = playCard(g, 0, seededRng(1), "alpha");
    const successor = rulerOf(g.rulers, "alpha").name;
    hud.update(g);
    expect(texts(container)).toContain(
      `You played Assassinate ruler on Alpha - ${killed} killed, ${successor} succeeds`,
    );
  });

  it("names the survivor when a bodyguard turns the blade", () => {
    const { container, hud } = setup();
    let g = { ...playing(), bodyguards: ["alpha"] };
    g = withHand(g, 0, ["assassinate-ruler"]);
    const survivor = rulerOf(g.rulers, "alpha").name;
    g = playCard(g, 0, seededRng(1), "alpha");
    hud.update(g);
    expect(texts(container)).toContain(
      `You played Assassinate ruler on Alpha - prevented, ${survivor} survives`,
    );
  });
});

describe("private actions stay off the activity log", () => {
  /** Push a raw event onto a playing state and render it. */
  const withEvent = (e: GameEvent) => {
    const { container, hud } = setup();
    // beta is the human seat, as everywhere else in this file
    const g = pickFaction(
      chooseDeck(startGame(newGame(FACTIONS)), buildDeck()), "beta", seededRng(1),
    );
    hud.update({ ...g, log: [...g.log, e] });
    return [...container.querySelectorAll(".log-entry")].map((el) => el.textContent);
  };

  it("shows your own vassal sowing a revolt - the warning you act on", () => {
    const texts = withEvent({
      turn: 1, playerId: 2, type: "seeded",
      targetFactionId: "alpha", overlordFactionId: "beta", // beta is the human
    });
    expect(texts.some((t) => /sows the seeds of revolt/.test(t ?? ""))).toBe(true);
  });

  it("hides a sowing between two other factions, which nobody can observe", () => {
    // Sowing moves a card inside one faction's own deck. Without this filter
    // the log would announce every faction's private preparations map-wide.
    const texts = withEvent({
      turn: 1, playerId: 3, type: "seeded",
      targetFactionId: "gamma", overlordFactionId: "alpha",
    });
    expect(texts.some((t) => /sows the seeds of revolt/.test(t ?? ""))).toBe(false);
  });
});

describe("scoreboard", () => {
  function playing() {
    return pickFaction(
      chooseDeck(startGame(newGame(FACTIONS)), buildDeck()), "beta", seededRng(1),
    );
  }

  it("is hidden outside play", () => {
    const { container, hud } = setup();
    hud.update(newGame(FACTIONS));
    expect(q(container, ".scoreboard").classList.contains("hidden")).toBe(true);
  });

  it("names the frontrunner and the human's own standing", () => {
    const { container, hud } = setup();
    // alpha absorbs gamma: 2 lands of the 2 needed for a 3-faction map... so
    // shrink the win target by using the real formula instead of guessing.
    const g = { ...playing(), incorporated: { gamma: "alpha" } };
    hud.update(g);
    const rows = [...container.querySelectorAll(".sb-row")];
    expect(rows).toHaveLength(2);
    expect(rows[0].querySelector(".sb-who")!.textContent).toBe("Alpha");
    expect(rows[0].querySelector(".sb-lands")!.textContent).toBe("2/2 lands");
    expect(rows[0].querySelector(".sb-pct")!.textContent).toBe("100%");
    // The human's own row is labelled "You", never by faction name.
    expect(rows[1].querySelector(".sb-who")!.textContent).toBe("You");
    expect(rows[1].classList.contains("sb-you")).toBe(true);
  });

  it("puts the human at the top when they lead, without a duplicate row", () => {
    const { container, hud } = setup();
    const g = { ...playing(), incorporated: { gamma: "beta" } };
    hud.update(g);
    const rows = [...container.querySelectorAll(".sb-row")];
    // gamma is absorbed, so only alpha and beta are still contenders.
    expect(rows).toHaveLength(2);
    expect(rows[0].querySelector(".sb-who")!.textContent).toBe("You");
    expect(rows.filter((r) => r.classList.contains("sb-you"))).toHaveLength(1);
  });

  it("states the garrison rate on the human's row, the one place the rule is given", () => {
    const { container, hud } = setup();
    // Four annexed lands is exactly PASSIVE_PER_LANDS, so +1 per turn.
    const annexed = Object.fromEntries(
      Array.from({ length: PASSIVE_PER_LANDS }, (_, i) => [`annex-${i}`, "beta"]),
    );
    hud.update({ ...playing(), incorporated: annexed });
    const you = q(container, ".sb-row.sb-you");
    expect(you.querySelector(".sb-passive")!.textContent).toBe(
      "garrisons +1 Might/turn",
    );
  });

  it("omits the garrison line when there is nothing to report", () => {
    const { container, hud } = setup();
    hud.update(playing());
    expect(q(container, ".sb-row.sb-you").querySelector(".sb-passive")).toBeNull();
  });
});

describe("surrender", () => {
  function playing() {
    return pickFaction(
      chooseDeck(startGame(newGame(FACTIONS)), buildDeck()), "beta", seededRng(1),
    );
  }

  it("is absent when no surrender callback is wired", () => {
    const { container, hud } = setup();
    hud.update(playing());
    expect(q(container, ".surrender-btn").classList.contains("hidden")).toBe(true);
  });

  it("needs a confirming second click, so a stray click cannot end the run", () => {
    const onSurrender = vi.fn();
    const { container, hud } = setup({ onSurrender });
    hud.update(playing());
    const btn = q(container, ".surrender-btn");
    expect(btn.classList.contains("hidden")).toBe(false);
    btn.click();
    expect(onSurrender).not.toHaveBeenCalled();
    expect(btn.textContent).toBe("Really surrender?");
    btn.click();
    expect(onSurrender).toHaveBeenCalledOnce();
  });

  it("disarms and hides once the run is over", () => {
    const onSurrender = vi.fn();
    const { container, hud } = setup({ onSurrender });
    hud.update(playing());
    const btn = q(container, ".surrender-btn");
    btn.click();
    expect(btn.classList.contains("confirm")).toBe(true);
    hud.update({ ...playing(), phase: "defeat" });
    expect(btn.classList.contains("hidden")).toBe(true);
    expect(btn.textContent).toBe("Surrender");
    expect(btn.classList.contains("confirm")).toBe(false);
  });

  it("postmortem names the concession instead of inventing a killer", () => {
    const { container, hud } = setup();
    const g = playing();
    hud.update({
      ...g,
      phase: "defeat",
      log: [...g.log, { turn: 4, playerId: 1, type: "surrendered" }],
    });
    expect(q(container, ".pm-title").textContent).toBe("Surrendered");
    expect(q(container, ".pm-cause").textContent).toContain("You conceded");
    expect(q(container, ".pm-deltas").textContent).toBe("");
  });
});
