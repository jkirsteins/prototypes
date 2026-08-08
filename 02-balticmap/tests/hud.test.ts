// @vitest-environment happy-dom
import { describe, it, expect, vi } from "vitest";
import { pact, } from "./helpers";
import { createHud, type Hud, type HudCallbacks } from "../src/hud";
import {
  newGame, startGame, chooseDeck, pickFaction, advance, playCard, beginTurn,
  chooseRules,
  type GameState, type GameEvent,
} from "../src/game";
import { aiTakeTurn } from "../src/ai";
import { CARDS, buildDeck, type Rng } from "../src/cards";
import { allianceKey, bumpMight, leadOf } from "../src/relations";
import { rulerOf } from "../src/rulers";
import {
  INCORPORATE_RAMP, PASSIVE_PER_LANDS, loyaltyKey,
} from "../src/playability";
import type { TargetExplanation } from "../src/target-explanations";
import { memoryStorage, type MetaStorage } from "../src/meta";
import { ROUND_SUMMARY_TITLE } from "../src/notices";
import { card, t } from "../src/rich-text";

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
  cardBlocked?: (cardId: string) => string | null;
  isDiscardMode?: () => boolean;
  onEndTurn?: () => void;
  isResolving?: () => boolean;
  onResetProgress?: () => void;
  onSurrender?: () => void;
  onHighlightFaction?: (factionId: string | null) => void;
  lifetimeXp?: () => number;
  packsWaiting?: () => number;
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
    ...(opts?.canPlayCard ? { canPlayCard: opts.canPlayCard } : {}),
    ...(opts?.targetExplanations
      ? { targetExplanations: opts.targetExplanations }
      : {}),
    ...(opts?.cardModifiers ? { cardModifiers: opts.cardModifiers } : {}),
    ...(opts?.cardBlocked ? { cardBlocked: opts.cardBlocked } : {}),
    ...(opts?.isDiscardMode ? { isDiscardMode: opts.isDiscardMode } : {}),
    ...(opts?.onEndTurn ? { onEndTurn: opts.onEndTurn } : {}),
    ...(opts?.isResolving ? { isResolving: opts.isResolving } : {}),
    ...(opts?.onResetProgress ? { onResetProgress: opts.onResetProgress } : {}),
    ...(opts?.onSurrender ? { onSurrender: opts.onSurrender } : {}),
    ...(opts?.onHighlightFaction
      ? { onHighlightFaction: opts.onHighlightFaction }
      : {}),
    ...(opts?.lifetimeXp ? { lifetimeXp: opts.lifetimeXp } : {}),
    ...(opts?.packsWaiting ? { packsWaiting: opts.packsWaiting } : {}),
  };
  // Delta is here for the tests that need a fourth faction; FACTIONS itself
  // stays three, so nothing else renders it.
  const hud = createHud(container, cb, new Map([
    ["alpha", "Alpha"], ["beta", "Beta"], ["gamma", "Gamma"], ["delta", "Delta"],
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
          targetFactionId: "alpha", readings: 1,
        },
      ],
    });
    expect(q(container, ".activity-log-entries").textContent)
      .toContain("You played Raid on Alpha - doubled");
  });

  it("names the multiple when a play cashed a stack of readings", () => {
    const { container, hud } = setup();
    const g = playing();
    hud.update({
      ...g,
      log: [
        ...g.log,
        {
          turn: 3, playerId: 1, type: "play", cardId: "raid",
          targetFactionId: "alpha", readings: 2,
        },
      ],
    });
    expect(q(container, ".activity-log-entries").textContent)
      .toContain("You played Raid on Alpha - quadrupled");
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

  it("states what your play did, in the badges' own before -> after form", () => {
    const { container, hud } = setup();
    let g = playing(); // you are beta; adjacency defaults to a complete graph
    g = withHand(g, 0, ["raid"]);
    g = playCard(g, 0, seededRng(1), "alpha");
    hud.update(g);
    const texts = [...container.querySelectorAll(".log-entry")].map(
      (el) => el.textContent,
    );
    expect(texts).toContain("You played Raid on Alpha (Might 0 -> +1)");
    // The number the log quotes is the number on the map, not a second
    // reckoning of its own.
    expect(leadOf(g.relations, "beta", "alpha")).toBe(1);
  });

  it("colours a gain and a loss differently", () => {
    const { container, hud } = setup();
    let g = playing();
    g = withHand(g, 0, ["raid"]);
    g = playCard(g, 0, seededRng(1), "alpha");
    g = {
      ...g,
      log: [
        ...g.log,
        { turn: 1, playerId: 2, type: "play", cardId: "raid", targetFactionId: "beta", amount: 1 },
      ],
    };
    hud.update(g);
    const changes = [...container.querySelectorAll(".log-change")];
    expect(changes[0].className).toBe("log-change lead-good"); // yours
    expect(changes[1].className).toBe("log-change lead-bad"); // theirs, on you
  });

  it("states a Fortify as the fan-out it is, not a pair", () => {
    const { container, hud } = setup();
    let g = playing();
    g = withHand(g, 0, ["fortify"]);
    g = playCard(g, 0, seededRng(1));
    hud.update(g);
    const texts = [...container.querySelectorAll(".log-entry")].map(
      (el) => el.textContent,
    );
    expect(texts).toContain("You played Fortify (+1 Might against all)");
  });

  it("counts a pact's neighbours rather than calling them all", () => {
    // A pact hits only the factions bordering BOTH realms. "against all" is the
    // wording for a card that really does hit every living faction, and using
    // it here overstates two neighbours by the width of the map.
    const { container, hud } = setup();
    // Four factions, not this suite's three: with only one shared neighbour
    // the line is a single pair and the plural is never exercised.
    const four = ["alpha", "beta", "gamma", "delta"];
    let g = pickFaction(
      chooseDeck(startGame(newGame(four, {
        // alpha and beta both border gamma and delta, and nothing else is
        // adjacent, so the pact's frozen set is exactly those two.
        alpha: ["beta", "gamma", "delta"],
        beta: ["alpha", "gamma", "delta"],
        gamma: ["alpha", "beta"],
        delta: ["alpha", "beta"],
      })), buildDeck()),
      "beta", seededRng(1),
    );
    g = withHand(g, 0, ["alliance"]);
    g = playCard(g, 0, seededRng(1), "alpha");
    hud.update(g);
    const texts = [...container.querySelectorAll(".log-entry")].map(
      (el) => el.textContent,
    );
    expect(texts).toContain("You played Alliance on Alpha (+1 Might against 2 factions)");
  });

  it("leaves a card that moves no standing without a suffix", () => {
    // Extended diplomacy, not Alliance: an Alliance moves Might now, against
    // every faction bordering both realms, so it carries a suffix like any
    // other gain.
    const { container, hud } = setup();
    let g = playing();
    g = withHand(g, 0, ["extended-diplomacy"]);
    g = playCard(g, 0, seededRng(1));
    hud.update(g);
    const texts = [...container.querySelectorAll(".log-entry")].map(
      (el) => el.textContent,
    );
    expect(texts).toContain("You played Extended diplomacy");
    expect(container.querySelectorAll(".log-change")).toHaveLength(0);
  });

  it("quotes the garrison tick's number once, from its own line", () => {
    const { container, hud } = setup();
    const annexed = Object.fromEntries(
      Array.from({ length: PASSIVE_PER_LANDS }, (_, i) => [`annex-${i}`, "beta"]),
    );
    // The garrison fires as a turn BEGINS, for whoever is about to play.
    const g = beginTurn({ ...playing(), incorporated: annexed }, seededRng(1));
    hud.update(g);
    const garrison = [...container.querySelectorAll(".log-entry")].find(
      (el) => el.textContent?.startsWith("Your garrisons"),
    )!;
    expect(garrison.textContent).toBe(
      "Your garrisons stand watch (+1 Might against all)",
    );
    expect(garrison.querySelector(".log-change")).toBeNull();
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
        { turn: 1, playerId: 2, type: "play", cardId: "raid", targetFactionId: "beta", amount: 1 },
        { turn: 1, playerId: 2, type: "play", cardId: "raid", targetFactionId: "gamma", amount: 1 },
      ],
    };
    hud.update(g);
    q(container, ".notice-continue").click(); // dismiss the round summary the raid raised
    const entries = [...container.querySelectorAll(".activity-log .log-entry")];
    // Prefix, not equality: the line carries a standings suffix and this test
    // is about the tag, not the number.
    const raidOnYou = entries.find(
      (el) => el.textContent?.startsWith("Alpha played Raid on you"),
    )!;
    const raidOnGamma = entries.find(
      (el) => el.textContent?.startsWith("Alpha played Raid on Gamma"),
    )!;
    expect(raidOnYou.classList.contains("notice-worthy")).toBe(true);
    expect(raidOnGamma.classList.contains("notice-worthy")).toBe(false);
  });

  /** The filter is about what is being done TO you. It was never meant to
   *  answer "what did I just do", and hiding your own turn is the one thing it
   *  must not do. */
  it("tags your own doing, so Targeting me can never hide it", () => {
    const { container, hud } = setup();
    let g = playing();
    g = withHand(g, 0, ["raid"]);
    g = playCard(g, 0, seededRng(1), "alpha");
    hud.update(g);
    const mine = [...container.querySelectorAll(".activity-log .log-entry")].find(
      (el) => el.textContent?.startsWith("You played Raid on Alpha"),
    )!;
    // Every modal rule requires playerId !== 1, so nothing you do is ever
    // notice-worthy: .log-mine is the only thing keeping this on screen.
    expect(mine.classList.contains("notice-worthy")).toBe(false);
    expect(mine.classList.contains("log-mine")).toBe(true);
  });

  it("leaves the automatic garrison tick out of your own doing", () => {
    const { container, hud } = setup();
    const annexed = Object.fromEntries(
      Array.from({ length: PASSIVE_PER_LANDS }, (_, i) => [`annex-${i}`, "beta"]),
    );
    const g = beginTurn({ ...playing(), incorporated: annexed }, seededRng(1));
    hud.update(g);
    const garrison = [...container.querySelectorAll(".log-entry")].find(
      (el) => el.textContent?.startsWith("Your garrisons"),
    )!;
    expect(garrison.classList.contains("log-mine")).toBe(false);
  });

  it("checking Targeting me hides everything but notice-worthy entries, instantly", () => {
    const { container, hud } = setup();
    let g = playing();
    g = {
      ...g,
      log: [
        ...g.log,
        { turn: 1, playerId: 2, type: "play", cardId: "raid", targetFactionId: "beta", amount: 1 },
        { turn: 1, playerId: 2, type: "play", cardId: "raid", targetFactionId: "gamma", amount: 1 },
      ],
    };
    hud.update(g);
    q(container, ".notice-continue").click();
    filterCheckbox(container).click();
    expect(q(container, ".activity-log").classList.contains("filter-targeting-me")).toBe(true);
  });

  /** Both surfaces walk the same batch through the same context (walkCtxOf),
   *  so a raid cannot read one way in the modal and another in the log. */
  it("quotes the same numbers in the log as in the round summary", () => {
    const { container, hud } = setup();
    const g = {
      ...playing(),
      log: [
        ...playing().log,
        { turn: 1, playerId: 2, type: "play" as const, cardId: "raid", targetFactionId: "beta", amount: 1 as const },
      ],
    };
    hud.update(g);
    const noticed = q(container, ".notice-change").textContent;
    q(container, ".notice-continue").click();
    const logged = [...container.querySelectorAll(".log-entry")]
      .find((el) => el.textContent?.startsWith("Alpha played Raid on you"))!
      .querySelector(".log-change")!.textContent;
    expect(logged).toBe(noticed);
    expect(logged).toBe(" (Might +1 -> 0)");
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
        { turn: 1, playerId: 2, type: "play", cardId: "raid", targetFactionId: "beta", amount: 1 },
      ],
    };
    hud.update(g);
    expect(q(container, ".notice-overlay").classList.contains("hidden")).toBe(true);
    const texts = [...container.querySelectorAll(".log-entry")].map((el) => el.textContent);
    expect(texts).toContain("Alpha played Raid on you (Might +1 -> 0)");
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
        { turn: 1, playerId: 2, type: "play", cardId: "raid", targetFactionId: "beta", amount: 1 },
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
    expect(logTexts).toContain("Alpha played Raid on you (Might +1 -> 0)");
  });

  /** The other half of the mute's narrow gap: your agency survives a poach, but
   *  your realm does not, and a smaller realm is a lower bar for whoever comes
   *  for you next. It interrupts under its own title, not the alarming one. */
  it("still interrupts for a vassal poached from you with popups muted", () => {
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
    expect(q(container, ".notice-overlay").classList.contains("hidden")).toBe(false);
    expect(q(container, ".notice-title").textContent).toBe("A vassal was lost");
  });

  /** Your own fall scatters every vassal you held (`freeVassalsOf` in game.ts),
   *  and the muted modal used to drop that line and leave you reading only that
   *  you owed fealty. */
  it("names the vassals your own subjugation scattered, with popups muted", () => {
    const { container, hud } = setup();
    popupsCheckbox(container).click(); // off
    let g = playing();
    g = {
      ...g,
      overlords: new Map([["beta", "alpha"]]),
      log: [
        ...g.log,
        { turn: 1, playerId: 2, type: "subjugated", targetFactionId: "beta", overlordFactionId: "alpha" },
        { turn: 1, playerId: 2, type: "released", targetFactionId: "gamma", overlordFactionId: "beta" },
        { turn: 1, playerId: 2, type: "released", targetFactionId: "delta", overlordFactionId: "beta" },
      ],
    };
    hud.update(g);
    expect(q(container, ".notice-overlay").classList.contains("hidden")).toBe(false);
    expect(q(container, ".notice-title").textContent).toBe("You were subjugated");
    const lines = [...container.querySelectorAll(".notice-line")].map((el) => el.textContent);
    expect(lines).toHaveLength(2);
    expect(lines[1]).toContain("Gamma");
    expect(lines[1]).toContain("Delta");
  });

  it("still interrupts when your overlord falls and frees you, with popups muted", () => {
    const { container, hud } = setup();
    popupsCheckbox(container).click(); // off
    let g = playing();
    g = {
      ...g,
      log: [
        ...g.log,
        { turn: 1, playerId: 3, type: "released", targetFactionId: "beta", overlordFactionId: "alpha" },
      ],
    };
    hud.update(g);
    expect(q(container, ".notice-overlay").classList.contains("hidden")).toBe(false);
    expect(q(container, ".notice-title").textContent).toBe("Your overlord fell");
  });

  it("still interrupts for a vassal breaking free with popups muted", () => {
    const { container, hud } = setup();
    popupsCheckbox(container).click(); // off
    let g = playing();
    g = {
      ...g,
      log: [
        ...g.log,
        { turn: 1, playerId: 2, type: "play", cardId: "raid", targetFactionId: "beta", amount: 1 },
        {
          turn: 1, playerId: 3, type: "reclaimed", cardId: "revolt",
          targetFactionId: "gamma", overlordFactionId: "beta",
        },
      ],
    };
    hud.update(g);
    expect(q(container, ".notice-overlay").classList.contains("hidden")).toBe(false);
    expect(q(container, ".notice-title").textContent).toBe("A vassal was lost");
    const lines = [...container.querySelectorAll(".notice-line")].map((el) => el.textContent);
    // Only the revolt rides through the mute; the Raid stays in the log.
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatch(/cast off/i);
    const logTexts = [...container.querySelectorAll(".log-entry")].map((el) => el.textContent);
    expect(logTexts).toContain("Alpha played Raid on you (Might +1 -> 0)");
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

  // The first paint of a state the player did not play into - a `?turns=` boot,
  // per src/boot-params.ts. Every event in the log is "fresh" by definition, so
  // the ordinary path would fly a card per human event at once and then, once
  // those flights landed, drop a round-summary modal over a board the tester
  // was already looking at. A modal that arrives a second after load and was
  // never asked for is the one thing an e2e pass cannot work around.
  it("renders a fast-forwarded state settled when animate is false", () => {
    vi.useFakeTimers();
    const { container, hud } = setup();
    let g = playing();
    // Several rounds of real play, so the log carries human plays and draws.
    for (let i = 0; i < 12 && g.phase === "playing"; i++) {
      g = advance(aiTakeTurn(g, seededRng(i + 1)), seededRng(i + 1));
    }
    expect(g.log.length).toBeGreaterThan(3);

    hud.update(g, { animate: false });
    expect(container.querySelectorAll(".flying-card")).toHaveLength(0);
    expect(container.querySelectorAll(".log-entry.log-new")).toHaveLength(0);
    expect(q(container, ".notice-overlay").classList.contains("hidden")).toBe(true);
    // Not merely deferred: nothing may surface later either.
    vi.runAllTimers();
    expect(q(container, ".notice-overlay").classList.contains("hidden")).toBe(true);
    // The history is still there to read - it is silent, not dropped.
    expect(container.querySelectorAll(".log-entry").length).toBeGreaterThan(0);
    vi.useRealTimers();
  });

  // The silent paint must not wedge the summary machinery for the rest of the
  // run: a booted state is where the player then plays, and the round after it
  // has to interrupt them exactly as any other round would.
  it("still raises the round summary on the round after a silent paint", () => {
    let g = playing();
    // As many rounds as the seed allows while KEEPING the game live: the
    // point is a summary raised after the silent paint, and a run that ended
    // mid-loop would test the postmortem instead.
    for (let i = 0; i < 12; i++) {
      const next = advance(aiTakeTurn(g, seededRng(i + 1)), seededRng(i + 1));
      if (next.phase !== "playing") break;
      g = next;
    }
    expect(g.phase).toBe("playing");
    const { container, hud } = setup();
    hud.update(g, { animate: false });
    expect(q(container, ".notice-overlay").classList.contains("hidden")).toBe(true);

    g = {
      ...g,
      overlords: new Map([["beta", "alpha"]]),
      log: [
        ...g.log,
        { turn: g.turn, playerId: 2, type: "subjugated", targetFactionId: "beta", overlordFactionId: "alpha" },
      ],
    };
    hud.update(g);
    expect(q(container, ".notice-overlay").classList.contains("hidden")).toBe(false);
    const lines = [...container.querySelectorAll(".notice-line")].map((el) => el.textContent);
    expect(lines.join(" ")).toMatch(/fealty/i);
  });

  it("animates normally on the update after a silent one", () => {
    vi.useFakeTimers();
    const { container, hud } = setup();
    let g = playing();
    hud.update(g, { animate: false });
    vi.runAllTimers();
    g = withHand(g, 0, ["grow-crops"]);
    g = playCard(g, 0, seededRng(1));
    hud.update(g);
    expect(container.querySelectorAll(".flying-card")).toHaveLength(1);
    vi.runAllTimers();
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

  /** A play whose card flew and whose roll then missed. Appended to the batch
   *  rather than rolled for real: the point under test is the ORDER of the
   *  modal against the flight, and driving the rules to a genuine miss would
   *  make the test about deck construction instead. */
  function withOwnFizzle(g: GameState): GameState {
    return {
      ...g,
      log: [...g.log, {
        turn: g.turn, playerId: 1, type: "subjugate-failed",
        targetFactionId: "gamma", overlordFactionId: "beta",
        formerOverlordFactionId: "alpha",
      }],
    };
  }

  function playedWithFizzle() {
    let g = pickFaction(chooseDeck(startGame(newGame(FACTIONS)), buildDeck()), "beta", seededRng(1));
    return (hud: Hud) => {
      hud.update(g);
      vi.runAllTimers(); // clear the opening draw's flight
      g = withHand(g, 0, ["grow-crops"]);
      g = withOwnFizzle(playCard(g, 0, seededRng(1)));
      hud.update(g);
      return g;
    };
  }

  it("holds a fizzle modal until the played card has landed", () => {
    vi.useFakeTimers();
    const { container, hud } = setup();
    playedWithFizzle()(hud);

    // The overlay sits above the flying card, so showing it now would cover the
    // very card the player is being told about.
    expect(q(container, ".notice-overlay").classList.contains("hidden")).toBe(true);
    vi.advanceTimersByTime(20 + 350 + 700 + 350);
    expect(q(container, ".notice-overlay").classList.contains("hidden")).toBe(false);
    expect(q(container, ".notice-title").textContent).toBe("Your subjugation failed");
    vi.useRealTimers();
  });

  it("keeps the AI waiting behind a fizzle modal until Continue", () => {
    vi.useFakeTimers();
    const { container, hud } = setup();
    playedWithFizzle()(hud);

    const fn = vi.fn();
    hud.afterPlayAnimation(fn);
    vi.runAllTimers();
    // The flight has landed and every timer has run, and the AI still has not
    // moved: a modal about your turn must not have their turns resolving
    // behind it.
    expect(fn).not.toHaveBeenCalled();
    expect(q(container, ".notice-overlay").classList.contains("hidden")).toBe(false);

    (q(container, ".notice-continue") as HTMLButtonElement).click();
    expect(fn).toHaveBeenCalledOnce();
    expect(q(container, ".notice-overlay").classList.contains("hidden")).toBe(true);
    vi.useRealTimers();
  });

  it("does not hold the turn when the play raised nothing", () => {
    vi.useFakeTimers();
    const { container, hud } = setup();
    let g = pickFaction(chooseDeck(startGame(newGame(FACTIONS)), buildDeck()), "beta", seededRng(1));
    hud.update(g);
    vi.runAllTimers();
    g = withHand(g, 0, ["grow-crops"]);
    hud.update(playCard(g, 0, seededRng(1)));

    const fn = vi.fn();
    hud.afterPlayAnimation(fn);
    vi.runAllTimers();
    expect(fn).toHaveBeenCalledOnce();
    expect(q(container, ".notice-overlay").classList.contains("hidden")).toBe(true);
    vi.useRealTimers();
  });

  /** The pending summary must not outlive its run, and clearing it must not
   *  swallow the continuation it was holding - `hideSummary` runs before
   *  `cancelLiveFlights` for exactly this reason. */
  it("a new game drops a pending fizzle and still releases the turn", () => {
    vi.useFakeTimers();
    const { container, hud } = setup();
    playedWithFizzle()(hud);

    const fn = vi.fn();
    hud.afterPlayAnimation(fn);
    hud.update(newGame(FACTIONS));
    expect(fn).toHaveBeenCalledOnce();
    expect(q(container, ".notice-overlay").classList.contains("hidden")).toBe(true);
    vi.runAllTimers();
    expect(q(container, ".notice-overlay").classList.contains("hidden")).toBe(true);
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
    let g: GameState = { ...playing(), guards: { bodyguard: ["alpha"] } };
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
    let g2: GameState = { ...playing(), guards: { bodyguard: ["beta"] }, current: 1 }; // alpha acts against you
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
        risk: [],
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
        risk: [],
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

  it("shows why a card is greyed out, on the card itself", () => {
    const { container, hud } = setup({
      canPlayCard: (id) => id !== "raid",
      cardBlocked: (id) =>
        id === "raid" ? "A forced card must be played first." : null,
    });
    hud.update(withHand(playing(), 0, ["raid", "grow-crops"]));
    const cards = [...container.querySelectorAll(".card")];
    expect(cards[0].classList.contains("unplayable")).toBe(true);
    expect(cards[0].querySelector(".card-tip-blocked")?.textContent).toBe(
      "A forced card must be played first.",
    );
    expect(cards[1].querySelector(".card-tip-blocked")).toBeNull();
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

  it("a vassalage with no way out names the lord and the cards you lacked", () => {
    const { container, hud } = setup();
    let g = pickFaction(
      chooseDeck(startGame(newGame([...FACTIONS, "delta"])), buildDeck()),
      "beta", seededRng(1),
    );
    // buildDeck() carries the escape, so the dead end has to be built: empty
    // every pile of it, then hand beta to gamma.
    g = {
      ...g,
      overlords: new Map([["beta", "gamma"]]),
      players: g.players.map((pl, i) =>
        i === 0
          ? {
              ...pl,
              deck: pl.deck.filter((c) => c !== "seeds-of-revolt"),
              hand: pl.hand.filter((c) => c !== "seeds-of-revolt"),
              discard: pl.discard.filter((c) => c !== "seeds-of-revolt"),
            }
          : pl,
      ),
    };
    g = withHand(g, 0, ["pay-military-tribute"]);
    g = playCard(g, 0, seededRng(1));
    expect(g.phase).toBe("defeat");
    hud.update(g);
    expect(q(container, ".pm-title").textContent).toBe("Game over");
    expect(q(container, ".pm-cause").textContent).toBe(
      "Vassal of Gamma with no way out - no Seeds of revolt and no Revolt anywhere in your deck",
    );
    // the lord is a node to point at, not text - AGENTS.md
    expect(q(container, ".pm-cause .rt-faction").textContent).toBe("Gamma");
    expect(
      [...container.querySelectorAll(".pm-cause .rt-card")].map((el) => el.textContent),
    ).toEqual(["Seeds of revolt", "Revolt"]);
    // and the standing against the lord still gets its comparison line
    expect(q(container, ".pm-deltas").textContent).toContain("Might");
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

describe("End turn button", () => {
  function standardPlayingState(): GameState {
    return pickFaction(chooseDeck(startGame(newGame(FACTIONS)), buildDeck()), "beta", seededRng(1));
  }

  function unlimitedHudPlaying(): GameState {
    const g = chooseRules(startGame(newGame(FACTIONS)), { turn: "unlimited" });
    return pickFaction(chooseDeck(g, buildDeck()), "alpha", seededRng(1));
  }

  it("is hidden under standard rules", () => {
    const { container, hud } = setup({ onEndTurn: vi.fn() });
    hud.update(standardPlayingState(), { animate: false });
    const btn = container.querySelector(".end-turn-btn") as HTMLButtonElement;
    expect(btn.classList.contains("hidden")).toBe(true);
  });

  it("shows, enables and fires on the human's unlimited turn", () => {
    const onEndTurn = vi.fn();
    const { container, hud } = setup({ onEndTurn });
    hud.update(unlimitedHudPlaying(), { animate: false });
    const btn = container.querySelector(".end-turn-btn") as HTMLButtonElement;
    expect(btn.classList.contains("hidden")).toBe(false);
    expect(btn.disabled).toBe(false);
    btn.click();
    expect(onEndTurn).toHaveBeenCalledTimes(1);
  });

  it("is disabled while a play is resolving and once the turn is closed", () => {
    const { container, hud } = setup({
      onEndTurn: vi.fn(), isResolving: () => true,
    });
    hud.update(unlimitedHudPlaying(), { animate: false });
    const btn = container.querySelector(".end-turn-btn") as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });

  it("keeps the hand inert while a play is resolving", () => {
    const { container, hud } = setup({ isResolving: () => true });
    hud.update(unlimitedHudPlaying(), { animate: false });
    const card = container.querySelector(".card") as HTMLButtonElement;
    expect(card.disabled).toBe(true);
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

  /** The complaint this bar exists for: a first run earned 17 XP, did not
   *  level, earned no pack, and the flat line gave no sense of how close it
   *  had come. */
  it("shows how much XP is still owed toward the next pack", () => {
    const { container, hud } = setup({ lifetimeXp: () => 17 });
    hud.update(defeated());
    expect(q(container, ".pm-xp-track").classList.contains("hidden")).toBe(false);
    expect(q(container, ".pm-xp-next").textContent).toBe("3 XP to your next pack");
  });

  /** The pity floor and the turnip milestones both grant packs without a
   *  level crossing; "N XP to your next pack" beside one would deny a pack
   *  the player plainly has. */
  it("says a pack is waiting when one is owed without a level crossing", () => {
    const { container, hud } = setup({ lifetimeXp: () => 17, packsWaiting: () => 1 });
    hud.update(defeated());
    expect(q(container, ".pm-xp-next").textContent).toBe("A pack is waiting");
  });

  it("announces the pack when the run crossed a level", () => {
    // The run must actually earn something to cross: `defeated()` alone has
    // the AI acting and the human idle, so its runXp is 0 and no lifetime
    // total could ever put the start and end in different bands.
    const { container, hud } = setup({ lifetimeXp: () => 20 });
    const g = defeated();
    hud.update({
      ...g,
      log: [...g.log, { turn: 1, playerId: 1, type: "play", cardId: "grow-crops" }],
    });
    // earned 1, so the run started at 19 - inside level 0 - and ended exactly
    // on the level 1 threshold, where a fresh band reads 0 of 20.
    expect(q(container, ".pm-xp").textContent).toBe("+1 XP earned");
    expect(q(container, ".pm-xp-next").textContent).toBe(
      "Level 1 reached - a pack is waiting",
    );
  });

  /** Caught in a browser pass: a run that ended PAST the threshold rather
   *  than exactly on it had won a pack, and the line read "49 XP to your next
   *  pack" - a number about the pack after the one just earned. */
  it("announces the pack when the run overshot the threshold", () => {
    const { container, hud } = setup({ lifetimeXp: () => 21 });
    const g = defeated();
    hud.update({
      ...g,
      log: [
        ...g.log,
        { turn: 1, playerId: 1, type: "play", cardId: "grow-crops" },
        { turn: 1, playerId: 1, type: "play", cardId: "grow-crops" },
      ],
    });
    // earned 2, so the run ran 19 -> 21, crossing the level-1 threshold at 20
    expect(q(container, ".pm-xp").textContent).toBe("+2 XP earned");
    expect(q(container, ".pm-xp-next").textContent).toBe(
      "Level 1 reached - a pack is waiting",
    );
  });

  it("hides the bar entirely when there is no lifetime progress to report", () => {
    const { container, hud } = setup();
    hud.update(defeated());
    expect(q(container, ".pm-xp-track").classList.contains("hidden")).toBe(true);
    expect(q(container, ".pm-xp-next").classList.contains("hidden")).toBe(true);
    // the plain earned line still shows
    expect(q(container, ".pm-xp").textContent).toMatch(/^\+\d+ XP earned$/);
  });

  it("fills the bar to where the run left it, once the animation lands", () => {
    vi.useFakeTimers();
    const { container, hud } = setup({ lifetimeXp: () => 17 });
    hud.update(defeated());
    vi.runAllTimers();
    // 17 of the 20-XP first band
    expect(q(container, ".pm-xp-fill").style.width).toBe("85%");
    vi.useRealTimers();
  });

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
    expect(q(container, ".notice-title").textContent).toBe(ROUND_SUMMARY_TITLE);
    expect(lineTexts(container)).toEqual([
      "Subjugate by Alpha took your vassal Gamma (Might +1 -> 0)",
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
      "Revolt by Gamma cast off your overlordship, and they cannot be subjugated again until turn 3 (Might +1 -> 0)",
    ]);
  });

  it("shows a mandatory modal when an AI subjugates you", () => {
    const { container, hud } = setup();
    hud.update(withEvents(playing(), [subjugatedYou]));
    const overlay = q(container, ".notice-overlay");
    expect(overlay.classList.contains("hidden")).toBe(false);
    expect(lineTexts(container)).toEqual(["Subjugate by Alpha - you owe fealty to them"]);
    expect(footnoteTexts(container)[0]).toContain("Pay tribute was shuffled into your deck");
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
      "The fall of your overlord to Gamma released you from vassalage, and none may subjugate you until turn 3",
    ]);
    expect(q(container, ".notice-overlay").classList.contains("hidden")).toBe(false);
    q(container, ".notice-continue").click();
    expect(q(container, ".notice-overlay").classList.contains("hidden")).toBe(true);
  });

  it("lists 2 raid events in one update as 2 lines in a single modal", () => {
    const { container, hud } = setup();
    const raidByAlpha: GameEvent = {
      turn: 1, playerId: 2, type: "play", cardId: "raid", targetFactionId: "beta",
      amount: 1,
    };
    const raidByGamma: GameEvent = {
      turn: 1, playerId: 3, type: "play", cardId: "raid", targetFactionId: "beta",
      amount: 1,
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
      alliances: { [allianceKey("beta", "alpha")]: pact(8) },
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
      "Assassinate ruler took Kaupo; Dabrelis now leads you - by Alpha (Might -1 -> 0)",
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

describe("log nesting", () => {
  function playing() {
    return pickFaction(chooseDeck(startGame(newGame(FACTIONS)), buildDeck()), "beta", seededRng(1));
  }

  /** Built through playCard, not by hand: the point is that the link between a
   *  play and what it caused survives the real path from the rules to the DOM. */
  function revoltBy(seat: number, lord: string) {
    let g = playing();
    const rebel = g.players[seat].factionId;
    g = { ...g, current: seat, overlords: new Map([[rebel, lord]]) };
    // The rebel meets the revolt gate (lead 2 against a two-land realm).
    g = { ...g, relations: bumpMight(bumpMight(g.relations, rebel, lord), rebel, lord) };
    g = withHand(g, seat, ["revolt"]);
    return playCard(g, 0, seededRng(1));
  }

  const entries = (c: HTMLElement): HTMLElement[] =>
    [...c.querySelectorAll(".activity-log .log-entry")] as HTMLElement[];

  it("indents what a play caused under the play, and not the play itself", () => {
    const { container, hud } = setup();
    hud.update(revoltBy(0, "gamma")); // you are gamma's vassal, and you revolt
    const nested = entries(container).map((el) => el.classList.contains("log-consequence"));
    expect(nested).toEqual([false, true]); // your play, then the land it freed
    expect(entries(container)[1].textContent).toContain("reclaims independence");
  });

  it("keeps the play on screen when the filter shows only its consequence", () => {
    // A rival's Revolt is not aimed at you; the vassalage it broke was. Without
    // .notice-cause the filter would leave the consequence indented under
    // nothing.
    const { container, hud } = setup();
    hud.update(revoltBy(1, "beta")); // alpha throws off your overlordship
    const [play, consequence] = entries(container);
    expect(play.classList.contains("notice-worthy")).toBe(false);
    expect(consequence.classList.contains("notice-worthy")).toBe(true);
    expect(play.classList.contains("notice-cause")).toBe(true);
  });

  it("leaves an AI-vs-AI play uncaused", () => {
    const { container, hud } = setup();
    hud.update(revoltBy(1, "gamma")); // alpha leaves gamma; nothing to do with you
    const [play, consequence] = entries(container);
    expect(consequence.classList.contains("log-consequence")).toBe(true);
    expect(play.classList.contains("notice-cause")).toBe(false);
  });

  it("leaves an ending flush left in the postmortem log", () => {
    const { container, hud } = setup();
    let g = playing();
    g = {
      ...g,
      phase: "defeat",
      log: [
        ...g.log,
        { turn: 2, playerId: 2, type: "play", cardId: "incorporate", targetFactionId: "beta" },
        {
          turn: 2, playerId: 2, type: "incorporated",
          targetFactionId: "beta", overlordFactionId: "alpha", consequence: true,
        },
        {
          turn: 2, playerId: 2, type: "defeat",
          targetFactionId: "beta", overlordFactionId: "alpha",
        },
      ],
    };
    hud.update(g);
    const pm = [...container.querySelectorAll(".pm-log .log-entry")];
    const nested = pm.slice(-3).map((el) => el.classList.contains("log-consequence"));
    expect(nested).toEqual([false, true, false]);
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
      "Pay tribute was shuffled into your deck",
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
      "Gain +1 Might over every other living faction at once - except your " +
        "overlord, while you have one.",
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
      `You played Assassinate ruler on Alpha - ${killed} killed, ${successor} succeeds (Might 0 -> 0)`,
    );
  });

  it("names the survivor when a bodyguard turns the blade", () => {
    const { container, hud } = setup();
    let g: GameState = { ...playing(), guards: { bodyguard: ["alpha"] } };
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

  it("counts a land your vassal annexed, which the map already draws as yours", () => {
    // The reported bug, at the scale it was seen: you -> a vassal -> a land the
    // vassal had annexed. That land carries your stripes, sits inside your realm
    // outline and hovers as "itself your vassal", so a score that walked one
    // level was quoting a smaller realm than the player could see.
    // A fourth faction so the win target is 3 and the count is legible.
    const { container, hud } = setup();
    const g = pickFaction(
      chooseDeck(startGame(newGame([...FACTIONS, "delta"])), buildDeck()),
      "beta",
      seededRng(1),
    );
    hud.update({
      ...g,
      overlords: new Map([["gamma", "beta"]]),
      incorporated: { alpha: "gamma" },
    });
    const you = q(container, ".sb-row.sb-you");
    // beta + gamma + alpha. One level out stops at 2.
    expect(you.querySelector(".sb-lands")!.textContent).toBe("3/3 lands");
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

describe("faction highlight in the activity log", () => {
  // Four factions so a line can name neither the human nor the faction under
  // test: with three, every pair that excludes the human is the same pair.
  const FOUR = ["alpha", "beta", "gamma", "delta"];

  /** The human is beta. */
  function playing(): GameState {
    return pickFaction(chooseDeck(startGame(newGame(FOUR)), buildDeck()), "beta", seededRng(1));
  }

  const YOURS: GameEvent = {
    turn: 1, playerId: 1, type: "play", cardId: "raid", targetFactionId: "alpha",
  };
  const THEIRS: GameEvent = {
    turn: 1, playerId: 3, type: "subjugated",
    targetFactionId: "delta", overlordFactionId: "gamma",
  };

  const withEvents = (g: GameState, events: GameEvent[]): GameState =>
    ({ ...g, log: [...g.log, ...events] });

  const entries = (c: HTMLElement) =>
    [...c.querySelectorAll(".log-entry")] as HTMLElement[];
  const lit = (c: HTMLElement) =>
    entries(c).filter((el) => el.classList.contains("log-lit"))
      .map((el) => el.textContent ?? "");
  const entryStarting = (c: HTMLElement, text: string) =>
    entries(c).find((el) => (el.textContent ?? "").startsWith(text))!;

  it("tags each entry with the factions it names, your own line with yours", () => {
    const { container, hud } = setup();
    hud.update(withEvents(playing(), [YOURS, THEIRS]));
    // "You played Raid on Alpha" names no faction for the actor, so the
    // human's own faction is added or hovering your realm would light nothing.
    expect(entryStarting(container, "You played Raid on Alpha").dataset.factions)
      .toBe("alpha beta");
    expect(entryStarting(container, "Delta submits to Gamma").dataset.factions)
      .toBe("delta gamma");
  });

  it("dims the log to the lines naming the highlighted faction, and clears", () => {
    const { container, hud } = setup();
    hud.update(withEvents(playing(), [YOURS, THEIRS]));
    const panel = q(container, ".activity-log");

    hud.highlightFaction("alpha");
    expect(panel.classList.contains("log-highlighting")).toBe(true);
    expect(lit(container)).toEqual(["You played Raid on Alpha"]);

    hud.highlightFaction("gamma");
    expect(lit(container)).toEqual(["Delta submits to Gamma"]);

    hud.highlightFaction(null);
    expect(panel.classList.contains("log-highlighting")).toBe(false);
    expect(lit(container)).toEqual([]);
  });

  it("lights your own actions when your own faction is highlighted", () => {
    const { container, hud } = setup();
    hud.update(withEvents(playing(), [YOURS, THEIRS]));
    hud.highlightFaction("beta");
    expect(lit(container)).toEqual(["You played Raid on Alpha"]);
  });

  it("an entry appended while a highlight is live arrives already dimmed", () => {
    const { container, hud } = setup();
    const g = withEvents(playing(), [YOURS]);
    hud.update(g);
    hud.highlightFaction("gamma");
    expect(lit(container)).toEqual([]);
    hud.update(withEvents(g, [THEIRS]));
    expect(lit(container)).toEqual(["Delta submits to Gamma"]);
  });

  it("a highlight held while the round resolves survives the new entries", () => {
    // The pin's whole point: the log goes on being dimmed to the pinned
    // faction while lines land under it, so it can be read.
    const { container, hud } = setup();
    const g = withEvents(playing(), [YOURS]);
    hud.update(g);
    hud.highlightFaction("alpha");
    hud.update(withEvents(g, [THEIRS]));
    expect(q(container, ".activity-log").classList.contains("log-highlighting"))
      .toBe(true);
    expect(lit(container)).toEqual(["You played Raid on Alpha"]);
  });
});

describe("the pinned faction in the status bar", () => {
  function playing(): GameState {
    return pickFaction(chooseDeck(startGame(newGame(FACTIONS)), buildDeck()), "beta", seededRng(1));
  }

  it("names the pinned faction and how to clear it, and restores the turn prompt", () => {
    const { container, hud } = setup();
    hud.update(playing());
    expect(q(container, ".status-text").textContent).toBe("Turn 1 - play a card");

    hud.setPinned("gamma");
    expect(q(container, ".status-text").textContent)
      .toBe("Pinned: Gamma - Esc to clear");

    hud.setPinned(null);
    expect(q(container, ".status-text").textContent).toBe("Turn 1 - play a card");
  });

  it("renders the name as a segment, so it lights that realm here too", () => {
    const onHighlightFaction = vi.fn();
    const { container, hud } = setup({ onHighlightFaction });
    hud.update(playing());
    hud.setPinned("gamma");
    const span = q(container, ".status-text .rt-faction");
    expect(span.textContent).toBe("Gamma");
    span.dispatchEvent(
      new MouseEvent("mousemove", { clientX: 1, clientY: 1, bubbles: true }),
    );
    expect(onHighlightFaction).toHaveBeenLastCalledWith("gamma");
  });

  it("survives a re-render, and an armed card owns the bar over it", () => {
    const { container, hud } = setup();
    const g = withHand(playing(), 0, ["raid", "grow-crops"]);
    hud.update(g);
    hud.setPinned("gamma");

    hud.setArmed(0, "Raid");
    expect(q(container, ".status-text").textContent)
      .toBe("Choose a target for Raid");

    // Disarming hands the bar back to the pin, which is still held.
    hud.setArmed(null);
    expect(q(container, ".status-text").textContent)
      .toBe("Pinned: Gamma - Esc to clear");
    hud.update(g);
    expect(q(container, ".status-text").textContent)
      .toBe("Pinned: Gamma - Esc to clear");
  });
});

describe("realm filter while pinned", () => {
  // Four factions so a line can sit wholly outside the pinned realm.
  const FOUR = ["alpha", "beta", "gamma", "delta"];

  /** The human is beta. */
  function playing(): GameState {
    return pickFaction(chooseDeck(startGame(newGame(FOUR)), buildDeck()), "beta", seededRng(1));
  }

  const seatOf = (g: GameState, factionId: string): number =>
    g.players.find((p) => p.factionId === factionId)!.id;
  const withEvents = (g: GameState, events: GameEvent[]): GameState =>
    ({ ...g, log: [...g.log, ...events] });
  const raid = (g: GameState, by: string, on: string): GameEvent =>
    ({ turn: 1, playerId: seatOf(g, by), type: "play", cardId: "raid", targetFactionId: on });
  const entries = (c: HTMLElement) =>
    [...c.querySelectorAll(".activity-log .log-entry")] as HTMLElement[];
  const inRealm = (c: HTMLElement) =>
    entries(c).filter((el) => el.classList.contains("log-realm"))
      .map((el) => el.textContent ?? "");
  const checkboxes = (c: HTMLElement) =>
    [...c.querySelectorAll(".activity-log-filter input")] as HTMLInputElement[];

  it("swaps the checkboxes for a Filtered-to label, and back on unpin", () => {
    const { container, hud } = setup();
    hud.update(playing());
    const panel = q(container, ".activity-log");

    hud.setPinned("gamma");
    expect(panel.classList.contains("filter-realm")).toBe(true);
    const label = q(container, ".activity-log-filtered");
    expect(label.textContent).toBe("Filtered to Gamma");
    // The name is a segment, not text - it lights the realm like any name.
    expect(q(label, ".rt-faction").textContent).toBe("Gamma");
    // The checkboxes are hidden by CSS, not removed: their state is not lost.
    expect(checkboxes(container)).toHaveLength(2);

    hud.setPinned(null);
    expect(panel.classList.contains("filter-realm")).toBe(false);
    expect(q(container, ".activity-log-filtered").textContent).toBe("");
  });

  it("leaves the Targeting-me pref checked and saved across a pin", () => {
    const { container, hud } = setup();
    hud.update(playing());
    const targetingMe = checkboxes(container)[0];
    targetingMe.click();
    hud.setPinned("gamma");
    hud.setPinned(null);
    expect(targetingMe.checked).toBe(true);
    // The class the pref drives is still on the panel; while pinned the CSS
    // :not(.filter-realm) guard is what suspends it, not any state change.
    expect(q(container, ".activity-log").classList.contains("filter-targeting-me"))
      .toBe(true);
  });

  it("keeps the pinned faction and its incorporated lands, hides the rest", () => {
    const { container, hud } = setup();
    const base = { ...playing(), incorporated: { delta: "gamma" } };
    const g = withEvents(base, [
      raid(base, "alpha", "delta"), raid(base, "gamma", "alpha"),
      raid(base, "alpha", "beta"),
    ]);
    hud.update(g);
    hud.setPinned("gamma");
    const kept = inRealm(container);
    expect(kept).toHaveLength(2);
    expect(kept[0]).toContain("Raid on Delta"); // the incorporated land
    expect(kept[1]).toContain("Raid on Alpha"); // the owner's own play
  });

  it("does not count a vassal as part of the pinned realm", () => {
    const { container, hud } = setup();
    const base = { ...playing(), overlords: new Map([["delta", "gamma"]]) };
    const g = withEvents(base, [raid(base, "delta", "alpha")]);
    hud.update(g);
    hud.setPinned("gamma");
    expect(inRealm(container)).toEqual([]);
  });

  it("re-files old entries when an incorporation lands while pinned", () => {
    const { container, hud } = setup();
    const g = withEvents(playing(), [raid(playing(), "alpha", "delta")]);
    hud.update(g);
    hud.setPinned("gamma");
    expect(inRealm(container)).toEqual([]);
    hud.update({ ...g, incorporated: { delta: "gamma" } });
    expect(inRealm(container)).toHaveLength(1);
  });

  it("classifies entries appended while the pin is held", () => {
    const { container, hud } = setup();
    const g = { ...playing(), incorporated: { delta: "gamma" } };
    hud.update(g);
    hud.setPinned("gamma");
    hud.update(withEvents(g, [raid(g, "alpha", "delta"), raid(g, "alpha", "beta")]));
    expect(inRealm(container)).toHaveLength(1);
    expect(inRealm(container)[0]).toContain("Raid on Delta");
  });

  it("keeps a whole batch when only its consequence touches the realm", () => {
    const { container, hud } = setup();
    const g = playing();
    hud.update(withEvents(g, [
      raid(g, "alpha", "beta"),
      { turn: 1, playerId: seatOf(g, "alpha"), type: "subjugated",
        targetFactionId: "gamma", overlordFactionId: "alpha", consequence: true },
      raid(g, "alpha", "beta"),
      { turn: 1, playerId: seatOf(g, "alpha"), type: "subjugated",
        targetFactionId: "delta", overlordFactionId: "alpha", consequence: true },
    ]));
    hud.setPinned("gamma");
    // First play + consequence survive as a unit - the consequence names
    // gamma - while the identical second batch is wholly outside the realm.
    expect(inRealm(container)).toHaveLength(2);
    expect(inRealm(container)[1]).toContain("Gamma submits to Alpha");
  });

  it("a foreign pact lapse noticed on your clock tick is not yours, and hides", () => {
    const { container, hud } = setup();
    const g = playing();
    hud.update(withEvents(g, [
      // playerId 1: the human's turn beginning is what noticed the lapse.
      { turn: 1, playerId: 1, type: "pact-lapsed", targetFactionId: "alpha",
        overlordFactionId: "delta", amount: 1, pactAgainst: [] },
    ]));
    hud.setPinned("gamma");
    const entry = entries(container).find((el) =>
      (el.textContent ?? "").includes("has run out"))!;
    expect(entry.classList.contains("log-mine")).toBe(false);
    expect(entry.classList.contains("log-realm")).toBe(false);
    // Nor is it about your faction: pinning yourself must not surface it.
    expect((entry.dataset.factions ?? "").split(" ")).not.toContain("beta");
  });

  it("your own line stays exempt through .log-mine, not through membership", () => {
    const { container, hud } = setup();
    const g = playing();
    hud.update(withEvents(g, [
      { turn: 1, playerId: 1, type: "play", cardId: "raid", targetFactionId: "alpha" },
    ]));
    hud.setPinned("gamma");
    const entry = entries(container).find((el) =>
      (el.textContent ?? "").startsWith("You played Raid"))!;
    expect(entry.classList.contains("log-realm")).toBe(false);
    expect(entry.classList.contains("log-mine")).toBe(true);
  });
});

/** The `secret` flag on CardDef, at the surface it exists for. The rules
 *  already treat a posted guard as hidden - `failureRiskOf` in
 *  src/playability.ts refuses to read `view.bodyguards` so the Assassinate
 *  ruler warning cannot become a detector - and the activity log naming the
 *  card was that detector by another route. */
describe("secret cards in the activity log", () => {
  function playing(): GameState {
    // beta is the human seat, as everywhere else in this file; alpha is
    // player 2 and gamma player 3.
    return pickFaction(
      chooseDeck(startGame(newGame(FACTIONS)), buildDeck()), "beta", seededRng(1),
    );
  }

  const texts = (container: HTMLElement, sel = ".activity-log .log-entry") =>
    [...container.querySelectorAll(sel)].map((el) => el.textContent ?? "");

  const guard = (playerId: number, turn = 1): GameEvent =>
    ({ turn, playerId, type: "play", cardId: "bodyguard" });

  /** An Assassinate ruler that came back turned aside, which spends the
   *  target's guard and so makes it public. */
  const turnedBlade = (
    playerId: number, targetFactionId: string, turn = 2,
  ): GameEvent => ({
    turn, playerId, type: "play", cardId: "assassinate-ruler",
    targetFactionId, prevented: true, targetRuler: "Someruler",
  });

  it("hides a rival's secret play behind 'a secret card'", () => {
    const { container, hud } = setup();
    const g = playing();
    hud.update({ ...g, log: [...g.log, guard(2)] });
    const line = texts(container).find((t) => /a secret card/.test(t))!;
    expect(line).toBeDefined();
    expect(line).toMatch(/played a secret card$/);
    // The whole point: nothing on the line names the card, or any other.
    for (const c of Object.values(CARDS)) expect(line).not.toContain(c.name);
  });

  it("still names your own secret play - the hiding is one-sided", () => {
    const { container, hud } = setup();
    const g = playing();
    hud.update({ ...g, log: [...g.log, guard(1)] });
    expect(texts(container)).toContain("You played Bodyguard");
  });

  it("leaves a non-secret card by the same rival alone", () => {
    const { container, hud } = setup();
    const g = playing();
    hud.update({
      ...g,
      log: [...g.log, {
        turn: 1, playerId: 2, type: "play", cardId: "raid",
        targetFactionId: "gamma", amount: 1,
      }],
    });
    expect(texts(container).some((t) => /played Raid on Gamma/.test(t))).toBe(true);
  });

  it("prints no standings suffix beside a secret line", () => {
    // The guard rail behind `CardDef.secret`: `impactText` renders the
    // before -> after from the event's own amount/track and nothing here hides
    // it, so a secret card that moved a track would be named in all but words.
    const { container, hud } = setup();
    const g = playing();
    hud.update({ ...g, log: [...g.log, guard(2)] });
    const entry = [...container.querySelectorAll(".activity-log .log-entry")].find(
      (el) => /a secret card/.test(el.textContent ?? ""),
    )!;
    expect(entry.querySelector(".log-change")).toBeNull();
  });

  it("rewrites the earlier line when your blade is turned on that guard", () => {
    const { container, hud } = setup();
    const g = playing();
    const withGuard = { ...g, log: [...g.log, guard(2)] };
    hud.update(withGuard);
    expect(texts(container).some((t) => /a secret card/.test(t))).toBe(true);

    hud.update({ ...withGuard, log: [...withGuard.log, turnedBlade(1, "alpha")] });
    const entry = [...container.querySelectorAll(".activity-log .log-entry")].find(
      (el) => /played Bodyguard/.test(el.textContent ?? ""),
    )!;
    expect(entry).toBeDefined();
    // Rewritten in place, and marked so a line changing several screens above
    // where the player is looking is not silent.
    expect(entry.classList.contains("log-revealed")).toBe(true);
    expect(texts(container).some((t) => /a secret card/.test(t))).toBe(false);
  });

  it("reveals nothing when the blade lands - there was no guard to spend", () => {
    const { container, hud } = setup();
    const g = playing();
    hud.update({
      ...g,
      log: [...g.log, guard(2), {
        turn: 2, playerId: 1, type: "play", cardId: "assassinate-ruler",
        targetFactionId: "alpha", targetRuler: "Someruler",
        successorRuler: "Somesuccessor", amount: 0,
      }],
    });
    expect(texts(container).some((t) => /a secret card/.test(t))).toBe(true);
    expect(texts(container).some((t) => /Bodyguard/.test(t))).toBe(false);
  });

  it("reveals the guard that matches the card, not merely the newest", () => {
    // A queue keyed by faction alone is exact only while one guard exists. A
    // rival holding two would have whichever they played LAST revealed -
    // naming the wrong card on the wrong line, and giving away a guard they
    // are still holding.
    const { container, hud } = setup();
    const g = playing();
    const wary: GameEvent =
      { turn: 1, playerId: 2, type: "play", cardId: "distrustful-neighbour" };
    // alpha posts a Bodyguard, then a Distrustful neighbour. The human's
    // alliance is the card turned aside, so the Distrustful neighbour is what
    // became public.
    const pactTry: GameEvent = {
      turn: 3, playerId: 1, type: "play", cardId: "alliance",
      targetFactionId: "alpha", prevented: true,
    };
    hud.update({ ...g, log: [...g.log, guard(2), wary, pactTry] });
    const all = texts(container);
    expect(all.filter((t) => /played Distrustful neighbour/.test(t))).toHaveLength(1);
    expect(all.filter((t) => /played Bodyguard/.test(t))).toHaveLength(0);
    expect(all.filter((t) => /a secret card/.test(t))).toHaveLength(1);
  });

  it("reveals only the guard that was spent, not the one still posted", () => {
    // The property the whole feature rests on. A reveal keyed by faction rather
    // than by the individual play would un-hide every future guard that rival
    // posts, which is exactly the detector this replaced.
    const { container, hud } = setup();
    const g = playing();
    let log = [...g.log, guard(2), turnedBlade(1, "alpha")];
    hud.update({ ...g, log });
    log = [...log, guard(2, 3)];
    hud.update({ ...g, log });
    const all = texts(container);
    expect(all.filter((t) => /played Bodyguard/.test(t))).toHaveLength(1);
    expect(all.filter((t) => /a secret card/.test(t))).toHaveLength(1);
  });

  it("never rewrites or flashes your own guard, which was never hidden", () => {
    // Found in the browser, not here: your own Bodyguard line read correctly
    // the whole time, then lit up as a reveal the moment a rival's blade spent
    // it - announcing a change to a line that had not changed. The cause was
    // two places deciding what "hidden" means; `hidesItsCard` is now one.
    const { container, hud } = setup();
    const g = playing();
    hud.update({ ...g, log: [...g.log, guard(1)] });
    hud.update({
      ...g,
      log: [...g.log, guard(1), turnedBlade(2, "beta")],
    });
    const entry = [...container.querySelectorAll(".activity-log .log-entry")].find(
      (el) => el.textContent === "You played Bodyguard",
    )!;
    expect(entry).toBeDefined();
    expect(entry.classList.contains("log-revealed")).toBe(false);
  });

  it("reveals a rival's guard spent by another rival's blade", () => {
    // The fiction is that the blade was publicly turned aside, so it does not
    // matter whose blade it was.
    const { container, hud } = setup();
    const g = playing();
    hud.update({
      ...g, log: [...g.log, guard(3), turnedBlade(2, "gamma")],
    });
    expect(texts(container).some((t) => /played Bodyguard/.test(t))).toBe(true);
  });

  it("renders a play revealed from the start when both land in one batch", () => {
    // Nothing to flash at a player who never saw the hidden version.
    const { container, hud } = setup();
    const g = playing();
    hud.update({ ...g, log: [...g.log, guard(2), turnedBlade(1, "alpha")] });
    const entry = [...container.querySelectorAll(".activity-log .log-entry")].find(
      (el) => /played Bodyguard/.test(el.textContent ?? ""),
    )!;
    expect(entry).toBeDefined();
    expect(entry.classList.contains("log-revealed")).toBe(false);
  });

  it("names every secret card in the postmortem, with no reveal event at all", () => {
    const { container, hud } = setup();
    const g = playing();
    hud.update({
      ...g,
      phase: "defeat",
      log: [...g.log, guard(2), {
        turn: 2, playerId: 2, type: "defeat", overlordFactionId: "alpha",
      }],
    });
    const pm = texts(container, ".pm-log .log-entry");
    expect(pm.some((t) => /played Bodyguard/.test(t))).toBe(true);
    expect(pm.some((t) => /a secret card/.test(t))).toBe(false);
  });

  it("forgets its rewrite bookkeeping when the log resets under it", () => {
    const { container, hud } = setup();
    const g = playing();
    hud.update({ ...g, log: [...g.log, guard(2), turnedBlade(1, "alpha")] });
    expect(texts(container).some((t) => /played Bodyguard/.test(t))).toBe(true);
    // A new run: the panel is cleared and the same indices mean other events.
    hud.update({ ...g, log: [...g.log, guard(2)] });
    expect(texts(container).some((t) => /a secret card/.test(t))).toBe(true);
    expect(texts(container).some((t) => /played Bodyguard/.test(t))).toBe(false);
  });
});

describe("the turnip bar chip and the harvest modals", () => {
  function playing(): GameState {
    return pickFaction(
      chooseDeck(startGame(newGame(FACTIONS)), buildDeck()), "beta",
      seededRng(1),
    );
  }

  const grownLog = (g: GameState, n: number): GameState => ({
    ...g,
    log: [
      ...g.log,
      ...Array.from({ length: n }, (): GameEvent => ({
        turn: 1, playerId: 1, type: "play", cardId: "grow-crops",
      })),
    ],
  });

  it("hides the chip for a run that holds no turnips and grew none", () => {
    const { container, hud } = setup();
    hud.update(playing());
    expect(q(container, ".status-turnips").classList.contains("hidden"))
      .toBe(true);
  });

  it("fills count and bar from the same log-derived window", () => {
    const { container, hud } = setup();
    hud.update(grownLog(playing(), 2));
    const chip = q(container, ".status-turnips");
    expect(chip.classList.contains("hidden")).toBe(false);
    expect(q(container, ".turnip-count").textContent).toBe("Turnips 2/4");
    expect(q(container, ".turnip-fill").style.width).toBe("50%");
  });

  it("shows the chip the moment a turnip is merely held", () => {
    const { container, hud } = setup();
    const g = playing();
    const p = { ...g.players[0], deck: [...g.players[0].deck, "grow-crops"] };
    hud.update({ ...g, players: [p, ...g.players.slice(1)] });
    expect(q(container, ".status-turnips").classList.contains("hidden"))
      .toBe(false);
    expect(q(container, ".turnip-count").textContent).toBe("Turnips 0/4");
  });

  it("prices the band x3 under unlimited turns", () => {
    const { container, hud } = setup();
    const g = pickFaction(
      chooseDeck(
        chooseRules(startGame(newGame(FACTIONS)), { turn: "unlimited" }),
        buildDeck(),
      ),
      "beta", seededRng(1),
    );
    hud.update(grownLog(g, 2));
    expect(q(container, ".turnip-count").textContent).toBe("Turnips 2/12");
  });

  it("renders boon labels as segments and greys a blocked slot with its reason", () => {
    const { container, hud } = setup();
    hud.update(playing());
    const onPick = vi.fn();
    hud.showHarvestChoice(
      [
        {
          effect: "wealth-1", eligible: true, reason: null,
          label: [t("Gain 1 wealth")],
        },
        {
          effect: "swap-common", eligible: false,
          reason: [t("no "), card("grow-crops"), t(" left to trade")],
          label: [t("Trade a "), card("grow-crops"), t(" for a random common card")],
        },
      ],
      { onPick, onCancel: vi.fn() },
    );
    expect(q(container, ".harvest-overlay").classList.contains("hidden"))
      .toBe(false);
    const options = [...container.querySelectorAll(".harvest-option")];
    expect(options).toHaveLength(2);
    // the card name is a hoverable segment node, never baked text
    expect(options[1].querySelector(".rt-card")?.textContent)
      .toBe("Grow turnips");
    expect((options[1] as HTMLButtonElement).disabled).toBe(true);
    expect(options[1].textContent).toContain("no Grow turnips left to trade");
    (options[0] as HTMLButtonElement).click();
    expect(onPick).toHaveBeenCalledWith("wealth-1");
  });

  it("Escape cancels whichever harvest overlay is up", () => {
    const { container, hud } = setup();
    hud.update(playing());
    const onCancel = vi.fn();
    hud.showHarvestChoice(
      [{
        effect: "wealth-1", eligible: true, reason: null,
        label: [t("Gain 1 wealth")],
      }],
      { onPick: vi.fn(), onCancel },
    );
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(onCancel).toHaveBeenCalledOnce();
    hud.hideHarvestUi();
    expect(q(container, ".harvest-overlay").classList.contains("hidden"))
      .toBe(true);
  });

  it("the card picker lists cards as segments and answers with the id", () => {
    const { container, hud } = setup();
    hud.update(playing());
    const onPick = vi.fn();
    hud.showCardPicker(["raid"], { onPick, onCancel: vi.fn() });
    const option = q(container, ".harvest-option");
    expect(option.querySelector(".rt-card")?.textContent).toBe("Raid");
    // the rules text is under the name, so the choice reads without a hover
    expect(option.textContent).toContain(CARDS.raid.text);
    option.click();
    expect(onPick).toHaveBeenCalledWith("raid");
  });

  it("a phase change tears the overlay down", () => {
    const { container, hud } = setup();
    hud.update(playing());
    hud.showCardPicker(["raid"], { onPick: vi.fn(), onCancel: vi.fn() });
    hud.update(newGame(FACTIONS));
    expect(q(container, ".harvest-overlay").classList.contains("hidden"))
      .toBe(true);
  });

  it("glows exactly the empowered card in hand", () => {
    const { container, hud } = setup();
    let g = withHand(playing(), 0, ["raid", "fortify"]);
    g = { ...g, empoweredCardId: "raid" };
    hud.update(g);
    const cards = [...container.querySelectorAll(".hand .card")];
    expect(cards[0].classList.contains("card-empowered")).toBe(true);
    expect(cards[1].classList.contains("card-empowered")).toBe(false);
  });

  it("suffixes an empowered play on its log line", () => {
    const { container, hud } = setup();
    const g = playing();
    hud.update({
      ...g,
      log: [...g.log, {
        turn: 1, playerId: 1, type: "play", cardId: "raid",
        targetFactionId: "alpha", amount: 4, empowered: true,
      }],
    });
    const lines = [...container.querySelectorAll(".log-entry")]
      .map((el) => el.textContent ?? "");
    expect(lines.some((line) => line.includes("- empowered"))).toBe(true);
  });
});
