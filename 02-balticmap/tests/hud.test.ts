// @vitest-environment happy-dom
import { describe, it, expect, vi } from "vitest";
import { createHud, type Hud, type HudCallbacks } from "../src/hud";
import {
  newGame, startGame, chooseBuild, pickFaction, advance, playCard, beginTurn,
  chooseRules,
  type GameState, type GameEvent,
} from "../src/game";
import { aiTakeTurn } from "../src/ai";
import { CARDS, type Rng } from "../src/cards";
import { DEFAULT_RULES } from "../src/rules";
import { rulerOf } from "../src/rulers";
import type { TargetExplanation } from "../src/target-explanations";
import { memoryStorage, type MetaStorage } from "../src/meta";
import { ROUND_SUMMARY_TITLE } from "../src/notices";

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
  localPlayerId?: () => number;
  playerNameOf?: (factionId: string) => string | null;
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
    ...(opts?.localPlayerId ? { localPlayerId: opts.localPlayerId } : {}),
    ...(opts?.playerNameOf ? { playerNameOf: opts.playerNameOf } : {}),
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

/** The human is beta everywhere in this file. */
function newPlaying(factionIds = FACTIONS): GameState {
  return pickFaction(
    chooseBuild(startGame(newGame(factionIds)), "warpath"), "beta", seededRng(1),
  );
}

describe("createHud", () => {
  const playing = () => newPlaying();

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
    hud.update(chooseBuild(startGame(newGame(FACTIONS)), "warpath"));
    expect(q(container, ".menu-overlay").classList.contains("hidden")).toBe(true);
    expect(q(container, ".status-bar").classList.contains("hidden")).toBe(false);
    expect(q(container, ".status-text").textContent).toBe("Choose your faction");
  });

  it("renders the human turn: status, piles, fanned hand", () => {
    const { container, cb, hud } = setup();
    const g = withHand(playing(), 0, ["grow-crops"]);
    hud.update(g);
    expect(q(container, ".status-text").textContent).toBe("Turn 1 - play a card");
    // The 6-card starting deck: 3 dealt to hand, 1 drawn at turn start.
    expect(q(container, ".pile-deck .pile-count").textContent).toBe("2");
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
    const g = withHand(playing(), 0, ["grow-crops", "grow-crops", "grow-crops"]);
    hud.update(g);
    const cards = [...container.querySelectorAll(".card")] as HTMLElement[];
    expect(cards).toHaveLength(3);
    expect(cards[0].style.transform).toContain("rotate(-5deg)");
    expect(cards[1].style.transform).toContain("rotate(0deg)");
    expect(cards[2].style.transform).toContain("rotate(5deg)");
  });

  it("disables held cards during AI turns and shows the waiting label", () => {
    const { container, cb, hud } = setup();
    let g = playing();
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
    let g = playing();
    g = withHand(g, 0, ["grow-crops", "grow-crops"]);
    g = playCard(g, 0, seededRng(1)); // 1 card left, playedThisTurn = true
    hud.update(g);
    const card = q(container, ".card") as HTMLButtonElement;
    expect(card.disabled).toBe(true);
    card.click();
    expect(cb.onPlayCard).not.toHaveBeenCalled();
  });

  it("shows the treasury and its income rate", () => {
    const { container, hud } = setup();
    hud.update(playing()); // beginTurn banked the first turn's income of 1
    expect(q(container, ".status-wealth").textContent).toBe("Wealth 1 (+1/turn)");
  });

  it("shows the leadership chip only once a War council has bought a stack", () => {
    const { container, hud } = setup();
    let g = playing();
    hud.update(g);
    expect(q(container, ".status-prowess").classList.contains("hidden")).toBe(true);
    g = withHand(g, 0, ["war-council"]);
    g = playCard(g, 0, seededRng(1));
    hud.update(g);
    expect(q(container, ".status-prowess").classList.contains("hidden")).toBe(false);
    expect(q(container, ".status-prowess").textContent).toBe(
      "Leadership 50 (added to every attack)",
    );
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
    const g = withHand(newPlaying(), 0, ["grow-crops"]);
    hud.update(g); // deck 2, discard 0
    expect(container.querySelectorAll(".pile-deck .card-back")).toHaveLength(1);
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
  const playing = () => newPlaying();

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
    g = advance(g, seededRng(2)); // player 2 draws - never logged
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

  it("states what your raid did, on its consequence line, in the badges' form", () => {
    const { container, hud } = setup();
    let g = playing(); // you are beta; adjacency defaults to a complete graph
    g = withHand(g, 0, ["raid"]);
    g = playCard(g, 0, seededRng(1), "alpha");
    hud.update(g);
    const entries = [...container.querySelectorAll(".log-entry")] as HTMLElement[];
    const texts = entries.map((el) => el.textContent);
    // The play line carries no suffix - the damage rides on the consequence
    // line, which is where the number belongs.
    expect(texts).toContain("You played Raid on Alpha");
    expect(texts).toContain("The defenses of Alpha are battered (Defense -150 -> 450)");
    const damaged = entries.find((el) =>
      el.textContent?.startsWith("The defenses of Alpha"))!;
    expect(damaged.classList.contains("log-consequence")).toBe(true);
    // The number the log quotes is the number on the map, not a second
    // reckoning of its own.
    expect(g.defense.alpha).toBe(450);
  });

  it("colours a hit red and a heal green, by the polygon's own movement", () => {
    const { container, hud } = setup();
    let g: GameState = { ...playing(), defense: { beta: 400 } };
    g = withHand(g, 0, ["hillfort"]);
    g = playCard(g, 0, seededRng(1), "beta");
    g = {
      ...g,
      log: [
        ...g.log,
        {
          turn: 1, playerId: 2, type: "damaged", cardId: "raid",
          targetFactionId: "gamma", amount: 150,
        },
      ],
      defense: { ...g.defense, gamma: 450 },
    };
    hud.update(g);
    const changes = [...container.querySelectorAll(".log-change")];
    expect(changes[0].className).toBe("log-change lead-good"); // your heal
    expect(changes[0].textContent).toBe(" (Defense +150 -> 550)");
    expect(changes[1].className).toBe("log-change lead-bad"); // the hit
    expect(changes[1].textContent).toBe(" (Defense -150 -> 450)");
  });

  it("suffixes a disease stack by owner count, red - pressure on the land", () => {
    const { container, hud } = setup();
    let g = playing();
    g = withHand(g, 0, ["spread-disease"]);
    g = playCard(g, 0, seededRng(1), "alpha");
    hud.update(g);
    const entry = [...container.querySelectorAll(".log-entry")].find((el) =>
      el.textContent?.startsWith("Disease takes root in Alpha"))!;
    expect(entry.querySelector(".log-change")!.textContent).toBe(" (Disease +1 -> 1)");
    expect(entry.querySelector(".log-change")!.className).toBe("log-change lead-bad");
  });

  it("quotes a War council's leadership off the event, on the play line", () => {
    const { container, hud } = setup();
    let g = playing();
    g = withHand(g, 0, ["war-council"]);
    g = playCard(g, 0, seededRng(1));
    hud.update(g);
    const entry = [...container.querySelectorAll(".log-entry")].find((el) =>
      el.textContent?.startsWith("You played War council"))!;
    expect(entry.textContent).toBe("You played War council (Leadership +50)");
    expect(entry.querySelector(".log-change")!.className).toBe("log-change lead-good");
  });

  it("quotes a tribute's coins off the event, tone even", () => {
    const { container, hud } = setup();
    const g = playing();
    hud.update({
      ...g,
      log: [...g.log, {
        turn: 1, playerId: 1, type: "tribute",
        targetFactionId: "beta", overlordFactionId: "alpha", wealth: 2,
      }],
    });
    const entry = [...container.querySelectorAll(".log-entry")].find((el) =>
      el.textContent?.includes("pays tribute"))!;
    expect(entry.textContent).toBe("Beta pays tribute to Alpha (2 wealth)");
    expect(entry.querySelector(".log-change")!.className).toBe("log-change lead-even");
  });

  it("leaves a card that moves no score without a suffix", () => {
    const { container, hud } = setup();
    let g = playing();
    g = withHand(g, 0, ["grow-crops"]);
    g = playCard(g, 0, seededRng(1));
    hud.update(g);
    const texts = [...container.querySelectorAll(".log-entry")].map(
      (el) => el.textContent,
    );
    expect(texts).toContain("You played Grow turnips");
    expect(container.querySelectorAll(".log-change")).toHaveLength(0);
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

describe("log lines for the new event types", () => {
  /** Raw events pushed onto a playing state, read back off the log panel.
   *  The exact-sentence pins live here; the naming-convention sweep holds the
   *  same lines to the segment rule. */
  const textsFor = (events: GameEvent[]): string[] => {
    const { container, hud } = setup();
    const g = newPlaying();
    hud.update({ ...g, log: [...g.log, ...events] });
    return [...container.querySelectorAll(".log-entry")].map(
      (el) => el.textContent ?? "",
    );
  };

  it("renders one line per new event type, subject first", () => {
    const texts = textsFor([
      { turn: 1, playerId: 2, type: "healed", cardId: "hillfort", targetFactionId: "alpha", amount: 0 },
      { turn: 1, playerId: 2, type: "plagued", cardId: "plague", targetFactionId: "gamma", amount: 0 },
      { turn: 1, playerId: 2, type: "winds-shifted", cardId: "foul-winds", targetFactionId: "gamma", amount: 0 },
      { turn: 1, playerId: 2, type: "independence", targetFactionId: "alpha", overlordFactionId: "gamma" },
      { turn: 1, playerId: 2, type: "settled", targetFactionId: "alpha" },
      { turn: 1, playerId: 2, type: "incorporated", targetFactionId: "alpha", overlordFactionId: "gamma" },
    ]);
    // startsWith: a line whose event moved a score carries the impact suffix.
    const starts = (prefix: string) =>
      texts.some((t) => t.startsWith(prefix));
    expect(starts("The defenses of Alpha are restored")).toBe(true);
    expect(starts("Plague ravages Gamma")).toBe(true);
    expect(starts("The disease on Gamma changes hands")).toBe(true);
    expect(texts).toContain("Alpha reclaims independence from Gamma");
    expect(texts).toContain("Alpha founds a new settlement");
    expect(texts).toContain("Alpha is incorporated into Gamma");
  });

  it("renders the harvest pair as your own doing, the card as a segment", () => {
    const texts = textsFor([
      { turn: 1, playerId: 1, type: "harvest-earned", cardId: "turnip-harvest" },
      { turn: 1, playerId: 1, type: "harvest-picked", cardId: "hillfort" },
    ]);
    expect(texts).toContain("You earned a Turnip harvest");
    expect(texts).toContain("You kept Hillfort from the harvest");
  });
});

describe("activity log filters", () => {
  const playing = () => newPlaying();

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

  it("tags a hit on your realm notice-worthy, and an AI-vs-AI hit not", () => {
    const { container, hud } = setup();
    let g = playing();
    g = {
      ...g,
      defense: { beta: 450, gamma: 450 },
      log: [
        ...g.log,
        { turn: 1, playerId: 2, type: "damaged", cardId: "raid", targetFactionId: "beta", amount: 150 },
        { turn: 1, playerId: 2, type: "damaged", cardId: "raid", targetFactionId: "gamma", amount: 150 },
      ],
    };
    hud.update(g);
    q(container, ".notice-continue").click(); // dismiss the round summary the hit raised
    const entries = [...container.querySelectorAll(".activity-log .log-entry")];
    const hitOnYou = entries.find(
      (el) => el.textContent?.startsWith("The defenses of Beta"),
    )!;
    const hitOnGamma = entries.find(
      (el) => el.textContent?.startsWith("The defenses of Gamma"),
    )!;
    expect(hitOnYou.classList.contains("notice-worthy")).toBe(true);
    expect(hitOnGamma.classList.contains("notice-worthy")).toBe(false);
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
    // Nothing you play is ever notice-worthy: .log-mine is the only thing
    // keeping this on screen under the filter.
    expect(mine.classList.contains("notice-worthy")).toBe(false);
    expect(mine.classList.contains("log-mine")).toBe(true);
  });

  it("leaves the independence gate out of your own doing - the clock, not you", () => {
    const { container, hud } = setup();
    const g = playing();
    hud.update({
      ...g,
      log: [...g.log, {
        turn: 1, playerId: 1, type: "independence",
        targetFactionId: "beta", overlordFactionId: "alpha",
      }],
    });
    const entry = [...container.querySelectorAll(".log-entry")].find(
      (el) => el.textContent?.includes("reclaims independence"),
    )!;
    expect(entry.classList.contains("log-mine")).toBe(false);
  });

  it("leaves the reshuffle out of your own doing", () => {
    const { container, hud } = setup();
    const g = playing();
    hud.update({
      ...g,
      log: [...g.log, { turn: 1, playerId: 1, type: "reshuffle" }],
    });
    const entry = [...container.querySelectorAll(".log-entry")].find(
      (el) => el.textContent?.includes("reshuffled"),
    )!;
    expect(entry.classList.contains("log-mine")).toBe(false);
  });

  it("checking Targeting me hides everything but notice-worthy entries, instantly", () => {
    const { container, hud } = setup();
    let g = playing();
    g = {
      ...g,
      defense: { beta: 450 },
      log: [
        ...g.log,
        { turn: 1, playerId: 2, type: "damaged", cardId: "raid", targetFactionId: "beta", amount: 150 },
      ],
    };
    hud.update(g);
    q(container, ".notice-continue").click();
    filterCheckbox(container).click();
    expect(q(container, ".activity-log").classList.contains("filter-targeting-me")).toBe(true);
  });

  /** Both surfaces walk the same batch through the same context (walkCtxOf),
   *  so a hit cannot read one way in the modal and another in the log. */
  it("quotes the same numbers in the log as in the round summary", () => {
    const { container, hud } = setup();
    const base = playing();
    const g = {
      ...base,
      defense: { beta: 450 },
      log: [
        ...base.log,
        { turn: 1, playerId: 2, type: "damaged" as const, cardId: "raid", targetFactionId: "beta", amount: 150 },
      ],
    };
    hud.update(g);
    const noticed = q(container, ".notice-change").textContent;
    q(container, ".notice-continue").click();
    const logged = [...container.querySelectorAll(".log-entry")]
      .find((el) => el.textContent?.startsWith("The defenses of Beta"))!
      .querySelector(".log-change")!.textContent;
    expect(logged).toBe(noticed);
    expect(logged).toBe(" (Defense -150 -> 450)");
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
      defense: { beta: 450 },
      log: [
        ...g.log,
        { turn: 1, playerId: 2, type: "damaged", cardId: "raid", targetFactionId: "beta", amount: 150 },
      ],
    };
    hud.update(g);
    expect(q(container, ".notice-overlay").classList.contains("hidden")).toBe(true);
    const texts = [...container.querySelectorAll(".log-entry")].map((el) => el.textContent);
    expect(texts).toContain("The defenses of Beta are battered (Defense -150 -> 450)");
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
      defense: { beta: 450 },
      overlords: new Map([["beta", "alpha"]]),
      log: [
        ...g.log,
        { turn: 1, playerId: 2, type: "damaged", cardId: "raid", targetFactionId: "beta", amount: 150 },
        { turn: 1, playerId: 2, type: "subjugated", targetFactionId: "beta", overlordFactionId: "alpha" },
      ],
    };
    hud.update(g);
    expect(q(container, ".notice-overlay").classList.contains("hidden")).toBe(false);
    expect(q(container, ".notice-title").textContent).toBe("You were subjugated");
    const lines = [...container.querySelectorAll(".notice-line")].map((el) => el.textContent);
    // Only the subjugation rides through the mute; the hit stays in the log.
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatch(/fealty/i);
    const logTexts = [...container.querySelectorAll(".log-entry")].map((el) => el.textContent);
    expect(logTexts).toContain("The defenses of Beta are battered (Defense -150 -> 450)");
  });

  /** The other half of the mute's narrow gap: your agency survives a poach, but
   *  your realm does not. It interrupts under its own title, not the alarming
   *  one. */
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

  /** The independence gate fires from beginTurn with the freed seat's OWN
   *  playerId - the human's freeing carries playerId 1 and must not be
   *  swallowed as their own act: they played nothing. */
  it("still interrupts for your own independence with popups muted", () => {
    const { container, hud } = setup();
    popupsCheckbox(container).click(); // off
    let g = playing();
    g = {
      ...g,
      log: [
        ...g.log,
        {
          turn: 1, playerId: 1, type: "independence",
          targetFactionId: "beta", overlordFactionId: "alpha",
        },
      ],
    };
    hud.update(g);
    expect(q(container, ".notice-overlay").classList.contains("hidden")).toBe(false);
    expect(q(container, ".notice-title").textContent).toBe("You are free");
  });

  it("still interrupts when a hit leaves your home gate open, with popups muted", () => {
    const { container, hud } = setup();
    popupsCheckbox(container).click(); // off
    let g = playing();
    g = {
      ...g,
      defense: { beta: 100 }, // 100 <= floor(0.25 * 600): the gate stands open
      log: [
        ...g.log,
        { turn: 1, playerId: 2, type: "damaged", cardId: "raid", targetFactionId: "beta", amount: 150 },
      ],
    };
    hud.update(g);
    expect(q(container, ".notice-overlay").classList.contains("hidden")).toBe(false);
    expect(q(container, ".notice-title").textContent).toBe("Your defenses are broken");
    const notes = [...container.querySelectorAll(".notice-footnote")].map((el) => el.textContent);
    expect(notes.join(" ")).toMatch(/any rival in reach can subjugate you/);
  });
});

describe("card animations", () => {
  const playing = () => newPlaying();

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
    g = advance(g, seededRng(2)); // AI draw event
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
  const playing = () => newPlaying();

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

  /** A play whose card flew and which a guard then turned aside. Appended to
   *  the batch rather than driven for real: the point under test is the ORDER
   *  of the modal against the flight, and driving the rules to a genuine
   *  prevented play would make the test about deck construction instead. */
  function withOwnFizzle(g: GameState): GameState {
    return {
      ...g,
      log: [...g.log, {
        turn: g.turn, playerId: 1, type: "play",
        cardId: "assassinate-ruler", targetFactionId: "gamma",
        prevented: true,
      }],
    };
  }

  function playedWithFizzle() {
    let g = newPlaying();
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
    expect(q(container, ".notice-title").textContent).toBe("A bodyguard stopped you");
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
    let g = newPlaying();
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

describe("targeted plays in the log and the hand tips", () => {
  const playing = () => newPlaying();

  it("renders a subjugation's play and consequence with faction names", () => {
    const { container, hud } = setup();
    // The gate is on the target's HOME defense now: open it, then play the
    // explicit Subjugate card to raise the event.
    let g: GameState = { ...playing(), defense: { alpha: 100 } };
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
    let g: GameState = { ...playing(), defense: { alpha: 100 } };
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
          "Their home defenses stand at 480; subjugation opens at 150 or less.",
        ],
      }],
    });
    hud.update(withHand(playing(), 0, ["subjugate"]));

    const card = q(container, ".card") as HTMLButtonElement;
    expect(card.disabled).toBe(false);
    expect(card.getAttribute("aria-disabled")).toBe("true");
    expect(q(container, ".card-tip").textContent).toContain("Potential targets");
    expect(q(container, ".card-tip").textContent)
      .toContain("subjugation opens at 150 or less");

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
  const playing = () => newPlaying();

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

  it("defeat shows the post-mortem with cause, build-up and log", () => {
    const { container, cb, hud } = setup();
    // An 8-faction roster keeps the win line (55% = 5 lands) above gamma's
    // 4-land realm below, so the incorporation under test does not double as
    // a unification. The realm hangs alpha and delta under beta - the target
    // - so gamma's full realm meets the Incorporate gate of 4.
    let g = pickFaction(
      chooseBuild(
        startGame(newGame([...FACTIONS, "delta", "e1", "e2", "e3", "e4"])),
        "warpath",
      ),
      "beta", seededRng(1),
    );
    g = {
      ...g,
      current: 2,
      overlords: new Map([
        ["beta", "gamma"], ["alpha", "beta"], ["delta", "beta"],
      ]),
    };
    g = withHand(g, 2, ["raid"]);
    g = playCard(g, 0, seededRng(1), "beta"); // gamma raids you (seen)
    g = { ...g, playedThisTurn: false };
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
    // No XP or pack progress anywhere: the meta loop retired with the flip.
    expect(container.querySelector(".pm-xp")).toBeNull();
    expect(container.querySelector(".pm-xp-track")).toBeNull();
    (pm.querySelector(".menu-new-game") as HTMLElement).click();
    expect(cb.onNewGame).toHaveBeenCalledOnce();
  });

  it("victory names the realm size", () => {
    const { container, hud } = setup();
    const many = Array.from({ length: 20 }, (_, i) => `f${i}`);
    let g = pickFaction(
      chooseBuild(startGame(newGame(many)), "warpath"), "f0", seededRng(1),
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

  it("omits the reset control without the callback, arms it with one", () => {
    const bare = setup();
    bare.hud.update(newGame(FACTIONS));
    expect(bare.container.querySelector(".menu-reset")).toBeNull();

    const onResetProgress = vi.fn();
    const { container, hud } = setup({ onResetProgress });
    hud.update(newGame(FACTIONS));
    const reset = q(container, ".menu-reset");
    expect(reset.textContent).toBe("Reset progress");
    reset.click();
    expect(onResetProgress).not.toHaveBeenCalled();
    expect(reset.textContent).toBe("Really reset?");
    reset.click();
    expect(onResetProgress).toHaveBeenCalledOnce();
  });
});

describe("End turn button", () => {
  function unlimitedHudPlaying(): GameState {
    const g = chooseRules(startGame(newGame(FACTIONS)), {
      ...DEFAULT_RULES, turn: "unlimited",
    });
    return pickFaction(chooseBuild(g, "warpath"), "alpha", seededRng(1));
  }

  it("is hidden under standard rules", () => {
    const { container, hud } = setup({ onEndTurn: vi.fn() });
    hud.update(newPlaying(), { animate: false });
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

describe("notice modal", () => {
  const playing = () => newPlaying();

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
      "Subjugate by Alpha took your vassal Gamma",
    ]);
    // A poach carries no footnote of its own - the tribute injection is the
    // vassal's problem now, not the old lord's.
    expect(q(container, ".notice-footnotes").classList.contains("hidden")).toBe(true);
  });

  it("shows a modal when a vassal of yours walks through the independence gate", () => {
    const { container, hud } = setup();
    hud.update(withEvents(playing(), [{
      turn: 1, playerId: 3, type: "independence",
      targetFactionId: "gamma", overlordFactionId: "beta",
    }]));
    expect(lineTexts(container)).toEqual([
      "The defenses of Gamma recovered - they leave your service, and none " +
        "may subjugate them until turn 3",
    ]);
    expect(footnoteTexts(container).join(" ")).toMatch(/three quarters/);
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

  it("lists 2 hits in one update as 2 lines in a single modal, chained backwards", () => {
    const { container, hud } = setup();
    const g = { ...playing(), defense: { beta: 300 } };
    hud.update(withEvents(g, [
      { turn: 1, playerId: 2, type: "damaged", cardId: "raid", targetFactionId: "beta", amount: 150 },
      { turn: 1, playerId: 3, type: "damaged", cardId: "raid", targetFactionId: "beta", amount: 150 },
    ]));
    expect(q(container, ".notice-overlay").classList.contains("hidden")).toBe(false);
    expect(lineTexts(container)).toEqual([
      "Raid by Alpha battered your home defenses (Defense -150 -> 450)",
      "Raid by Gamma battered your home defenses (Defense -150 -> 300)",
    ]);
    q(container, ".notice-continue").click();
    expect(q(container, ".notice-overlay").classList.contains("hidden")).toBe(true);
  });

  it("shows a rival's stack landing on your home, with the plague footnote", () => {
    const { container, hud } = setup();
    const g = { ...playing(), disease: { beta: { alpha: 1 } } };
    hud.update(withEvents(g, [{
      turn: 1, playerId: 2, type: "disease-spread", cardId: "spread-disease",
      targetFactionId: "beta", amount: 1,
    }]));
    expect(lineTexts(container)).toEqual([
      "Spread disease by Alpha set disease on your home (Disease +1 -> 1)",
    ]);
    expect(footnoteTexts(container).join(" ")).toContain("100 damage each");
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
      targetFactionId: "beta", targetRuler: "Kaupo", successorRuler: "Dabrelis",
    }]));
    expect(lineTexts(container)).toEqual([
      "Assassinate ruler took Kaupo; Dabrelis now leads you - by Alpha",
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
      { turn: 1, playerId: 2, type: "damaged", cardId: "raid", targetFactionId: "gamma", amount: 150 },
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
  // Four factions so a line can name neither the human nor the faction under
  // test: with three, every pair that excludes the human is the same pair.
  const FOUR = ["alpha", "beta", "gamma", "delta"];

  /** The human is beta. */
  const playing = () => newPlaying(FOUR);

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
  const playing = () => newPlaying();

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
  const playing = () => newPlaying(FOUR);

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

  it("a foreign independence noticed by its own clock is not yours, and hides", () => {
    const { container, hud } = setup();
    const g = playing();
    hud.update(withEvents(g, [
      // The freed seat's own turn-start clock is what fired this.
      { turn: 1, playerId: seatOf(g, "alpha"), type: "independence",
        targetFactionId: "alpha", overlordFactionId: "delta" },
    ]));
    hud.setPinned("gamma");
    const entry = entries(container).find((el) =>
      (el.textContent ?? "").includes("reclaims independence"))!;
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
 *  src/playability.ts refuses to read `view.guards` so the Assassinate
 *  ruler warning cannot become a detector - and the activity log naming the
 *  card was that detector by another route. */
describe("secret cards in the activity log", () => {
  // beta is the human seat, as everywhere else in this file; alpha is
  // player 2 and gamma player 3.
  const playing = () => newPlaying();

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
        targetFactionId: "gamma",
      }],
    });
    expect(texts(container).some((t) => /played Raid on Gamma/.test(t))).toBe(true);
  });

  it("prints no score suffix beside a secret line", () => {
    // The guard rail behind `CardDef.secret`: `impactText` renders the
    // before -> after from the walk and nothing here hides it, so a secret
    // card that moved a score would be named in all but words.
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
        successorRuler: "Somesuccessor",
      }],
    });
    expect(texts(container).some((t) => /a secret card/.test(t))).toBe(true);
    expect(texts(container).some((t) => /Bodyguard/.test(t))).toBe(false);
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

describe("localPlayerId", () => {
  // Picking alpha as the seat-picker's faction leaves alpha at id 1, so beta
  // lands at id 2 (seat 1) - the guest-perspective case the callback exists
  // for, where the local player is not the array's first player.
  const FOUR = ["alpha", "beta", "gamma", "delta"];

  function playing(): GameState {
    return pickFaction(
      chooseBuild(startGame(newGame(FOUR)), "warpath"), "alpha", seededRng(1),
    );
  }

  // bodyguard is the one card in the secret set CARDS/GUARDS pin as an
  // identity in tests/cards.test.ts - not a guess.
  const secretId = "bodyguard";

  const withEvents = (g: GameState, events: GameEvent[]): GameState =>
    ({ ...g, log: [...g.log, ...events] });

  const yourPlay: GameEvent = {
    turn: 1, playerId: 2, type: "play", cardId: "raid", targetFactionId: "gamma",
  };
  const rivalSecretPlay: GameEvent = {
    turn: 1, playerId: 1, type: "play", cardId: secretId,
  };

  it("a hud for player 2 says You for player 2 and hides player 1's secret plays", () => {
    const { container, hud } = setup({ localPlayerId: () => 2 });
    hud.update(withEvents(playing(), [yourPlay, rivalSecretPlay]));
    const logText = q(container, ".activity-log").textContent!;
    expect(logText).toContain("You"); // player 2's own play
    expect(logText).toContain("a secret card"); // player 1's play hidden
    expect(logText).not.toContain(CARDS[secretId].name);
  });

  it("defaults to player 1 when the callback is absent", () => {
    const { container, hud } = setup();
    hud.update(withEvents(playing(), [yourPlay, rivalSecretPlay]));
    // Same state, but with no localPlayerId the default (1) makes player 1's
    // secret play the local player's own, so it renders by its real name.
    const logText = q(container, ".activity-log").textContent!;
    expect(logText).toContain(CARDS[secretId].name);
  });

  // Every faction name the HUD renders is a segment, and the segment renderer
  // is where the controlling player's name is appended - so the log, the round
  // summary, the postmortem and the scoreboard all carry it from one wiring.
  // The log is checked here because it is the surface the requirement named:
  // "Raid played against you by Osilians (Bela)".
  it("names the human behind a faction wherever the faction is named", () => {
    const state = withEvents(playing(), [yourPlay]); // player 2 (beta) raids gamma
    const named = setup({ playerNameOf: (id) => (id === "gamma" ? "Bela" : null) });
    named.hud.update(state);
    const withName = q(named.container, ".activity-log").textContent!;
    expect(withName).toContain("Gamma (Bela)");
    // Only the faction the callback answers for gets one. Beta is named on the
    // very same line as the raider, and stays bare.
    expect(withName).toContain("Beta");
    expect(withName).not.toContain("Beta (");

    // The same state with no callback is the solo game, unchanged.
    const plain = setup();
    plain.hud.update(state);
    expect(q(plain.container, ".activity-log").textContent!).not.toContain("(Bela)");
  });

  // Only the host seat can surrender, so on a guest's screen this run ended
  // by somebody else's choice. "You conceded" over a game the player was
  // still playing is a lie about what they just did.
  it("says who conceded, rather than blaming the reader", () => {
    const conceded: GameEvent[] = [
      { turn: 3, playerId: 1, type: "surrendered" },
    ];
    const ended = (g: GameState): GameState =>
      ({ ...g, phase: "defeat" as const });

    const theirs = setup({ localPlayerId: () => 2 });
    theirs.hud.update(ended(withEvents(playing(), conceded)));
    expect(q(theirs.container, ".pm-cause").textContent).toContain(
      "Your opponent conceded",
    );

    const ours = setup();
    ours.hud.update(ended(withEvents(playing(), conceded)));
    expect(q(ours.container, ".pm-cause").textContent).toContain("You conceded");
  });
});

describe("the turnip bar chip and the harvest offer", () => {
  const playing = () => newPlaying();

  it("hides the chip for a run that holds no turnips and grew none", () => {
    const { container, hud } = setup();
    // The starting deck carries a Grow turnips, so a hidden chip needs a
    // player stripped of every copy.
    const g = playing();
    const strip = (cards: string[]) => cards.filter((c) => c !== "grow-crops");
    const p = {
      ...g.players[0],
      deck: strip(g.players[0].deck),
      hand: strip(g.players[0].hand),
      discard: strip(g.players[0].discard),
    };
    hud.update({ ...g, players: [p, ...g.players.slice(1)] });
    expect(q(container, ".status-turnips").classList.contains("hidden"))
      .toBe(true);
  });

  it("fills count and bar from the stored counter, over the threshold of 5", () => {
    const { container, hud } = setup();
    hud.update({ ...playing(), turnips: { beta: 2 } });
    const chip = q(container, ".status-turnips");
    expect(chip.classList.contains("hidden")).toBe(false);
    expect(q(container, ".turnip-count").textContent).toBe("Turnips 2/5");
    expect(q(container, ".turnip-fill").style.width).toBe("40%");
  });

  it("shows the chip the moment a turnip is merely held", () => {
    const { container, hud } = setup();
    hud.update(playing()); // the starting deck holds a Grow turnips
    expect(q(container, ".status-turnips").classList.contains("hidden"))
      .toBe(false);
    expect(q(container, ".turnip-count").textContent).toBe("Turnips 0/5");
  });

  it("offers the rolled cards with their rules text, and answers with the id", () => {
    const { container, hud } = setup();
    hud.update(playing());
    const onPick = vi.fn();
    const onSkip = vi.fn();
    hud.showHarvestOffer(["hillfort", "subjugate"], {
      onPick, onSkip, onCancel: vi.fn(),
    });
    expect(q(container, ".harvest-overlay").classList.contains("hidden"))
      .toBe(false);
    const options = [...container.querySelectorAll(".harvest-option")];
    // Two rolled cards plus the skip button, which is an option in its own
    // right: skipping commits the play and keeps nothing.
    expect(options).toHaveLength(3);
    // The card name is a hoverable segment node, never baked text, and the
    // rules text is under it so the choice reads without a hover.
    expect(options[0].querySelector(".rt-card")?.textContent).toBe("Hillfort");
    expect(options[0].textContent).toContain(CARDS.hillfort.text);
    expect(options[2].textContent).toContain("Keep nothing");
    (options[0] as HTMLButtonElement).click();
    expect(onPick).toHaveBeenCalledWith("hillfort");
    (options[2] as HTMLButtonElement).click();
    expect(onSkip).toHaveBeenCalledOnce();
  });

  it("Escape cancels the offer - backing out, not skipping", () => {
    const { container, hud } = setup();
    hud.update(playing());
    const onCancel = vi.fn();
    const onSkip = vi.fn();
    hud.showHarvestOffer(["hillfort"], { onPick: vi.fn(), onSkip, onCancel });
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(onCancel).toHaveBeenCalledOnce();
    expect(onSkip).not.toHaveBeenCalled();
    hud.hideHarvestUi();
    expect(q(container, ".harvest-overlay").classList.contains("hidden"))
      .toBe(true);
  });

  it("a phase change tears the overlay down", () => {
    const { container, hud } = setup();
    hud.update(playing());
    hud.showHarvestOffer(["hillfort"], {
      onPick: vi.fn(), onSkip: vi.fn(), onCancel: vi.fn(),
    });
    hud.update(newGame(FACTIONS));
    expect(q(container, ".harvest-overlay").classList.contains("hidden"))
      .toBe(true);
  });
});

describe("scoreboard", () => {
  const playing = () => newPlaying();

  it("is hidden outside play", () => {
    const { container, hud } = setup();
    hud.update(newGame(FACTIONS));
    expect(q(container, ".scoreboard").classList.contains("hidden")).toBe(true);
  });

  it("names the frontrunner and the human's own standing", () => {
    const { container, hud } = setup();
    // alpha absorbs gamma: 2 lands of the 2 needed on a 3-faction map.
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
    // The passive-rate column retired with the Might bar.
    expect(container.querySelector(".sb-passive")).toBeNull();
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
    const g = newPlaying([...FACTIONS, "delta"]);
    hud.update({
      ...g,
      overlords: new Map([["gamma", "beta"]]),
      incorporated: { alpha: "gamma" },
    });
    const you = q(container, ".sb-row.sb-you");
    // beta + gamma + alpha. One level out stops at 2.
    expect(you.querySelector(".sb-lands")!.textContent).toBe("3/3 lands");
  });
});

describe("surrender", () => {
  const playing = () => newPlaying();

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

describe("hand tips", () => {
  const playing = () => newPlaying();

  it("hand cards carry a name span and a rules tip", () => {
    const { container, hud } = setup();
    const g = withHand(playing(), 0, ["great-raid"]);
    hud.update(g);
    const card = q(container, ".hand .card");
    expect(card.querySelector(".card-name")!.textContent).toBe("Great raid");
    expect(card.querySelector(".card-tip")!.textContent).toBe(CARDS["great-raid"].text);
  });

  it("shows an active modifier above the card description", () => {
    const { container, hud } = setup({
      cardModifiers: () => ["Favourable omens: this attack counts double."],
    });
    hud.update(withHand(playing(), 0, ["raid"]));
    const tip = q(container, ".card-tip");
    expect(tip.firstElementChild!.className).toBe("card-tip-modifier");
    expect(tip.textContent).toContain("Favourable omens: this attack counts double.");
    expect(tip.textContent).toContain("in reach"); // description still there
  });
});
