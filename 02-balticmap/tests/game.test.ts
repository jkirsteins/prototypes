import { describe, it, expect } from "vitest";
import {
  newGame, startGame, pickFaction, beginTurn, playCard, endTurn, aiTurn,
  isHumanTurn, type GameState,
} from "../src/game";
import { DECK_SIZE, type Rng } from "../src/cards";

function seededRng(seed: number): Rng {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const FACTIONS = ["alpha", "beta", "gamma", "delta"];

function playingState(): GameState {
  return pickFaction(startGame(newGame(FACTIONS)), "beta", seededRng(1));
}

describe("newGame / startGame", () => {
  it("starts at the main menu with no players", () => {
    const g = newGame(FACTIONS);
    expect(g.phase).toBe("main-menu");
    expect(g.turn).toBe(1);
    expect(g.players).toEqual([]);
  });

  it("startGame moves to pick-faction, and only from main-menu", () => {
    const g = startGame(newGame(FACTIONS));
    expect(g.phase).toBe("pick-faction");
    expect(startGame(g)).toBe(g);
  });
});

describe("beginTurn", () => {
  it("returns the same state reference when there are no players yet", () => {
    const g = newGame(FACTIONS);
    expect(beginTurn(g, seededRng(1))).toBe(g);
  });
});

describe("pickFaction", () => {
  it("assigns the human to the picked faction and AIs to the rest in order", () => {
    const g = playingState();
    expect(g.phase).toBe("playing");
    expect(g.players.map((p) => p.factionId)).toEqual(["beta", "alpha", "gamma", "delta"]);
    expect(g.players.map((p) => p.id)).toEqual([1, 2, 3, 4]);
  });

  it("begins player 1's turn: they have drawn 1 card", () => {
    const g = playingState();
    expect(g.current).toBe(0);
    expect(g.players[0].hand).toHaveLength(1);
    expect(g.players[0].deck).toHaveLength(DECK_SIZE - 1);
    expect(g.players[1].hand).toHaveLength(0);
  });

  it("ignores unknown factions and wrong phases", () => {
    const menu = newGame(FACTIONS);
    expect(pickFaction(menu, "beta", seededRng(1))).toBe(menu);
    const picking = startGame(menu);
    expect(pickFaction(picking, "nope", seededRng(1))).toBe(picking);
  });
});

describe("draw and reshuffle", () => {
  it("reshuffles the discard into the deck when the deck is empty", () => {
    let g = playingState();
    const p0 = {
      ...g.players[0],
      deck: [] as string[],
      hand: [] as string[],
      discard: ["grow-crops", "grow-crops", "grow-crops"],
    };
    g = { ...g, players: [p0, ...g.players.slice(1)] };
    const after = beginTurn(g, seededRng(2));
    expect(after.players[0].hand).toHaveLength(1);
    expect(after.players[0].deck).toHaveLength(2);
    expect(after.players[0].discard).toEqual([]);
  });

  it("skips the draw when deck and discard are both empty", () => {
    let g = playingState();
    const p0 = { ...g.players[0], deck: [] as string[], hand: [] as string[], discard: [] as string[] };
    g = { ...g, players: [p0, ...g.players.slice(1)] };
    const after = beginTurn(g, seededRng(2));
    expect(after.players[0].hand).toEqual([]);
    expect(after.players[0].deck).toEqual([]);
  });
});

describe("playCard", () => {
  it("moves the card from hand to discard and blocks a second play", () => {
    const g = playingState();
    const played = playCard(g, 0);
    expect(played.players[0].hand).toHaveLength(0);
    expect(played.players[0].discard).toEqual(["grow-crops"]);
    expect(played.playedThisTurn).toBe(true);
    expect(playCard(played, 0)).toBe(played);
  });

  it("ignores out-of-range indices and does not mutate input", () => {
    const g = playingState();
    const handBefore = [...g.players[0].hand];
    expect(playCard(g, 5)).toBe(g);
    expect(playCard(g, -1)).toBe(g);
    playCard(g, 0);
    expect(g.players[0].hand).toEqual(handBefore);
    expect(g.playedThisTurn).toBe(false);
  });
});

describe("endTurn / turn cycle", () => {
  it("advances to the next player and draws for them", () => {
    const g = endTurn(playingState(), seededRng(3));
    expect(g.current).toBe(1);
    expect(g.turn).toBe(1);
    expect(g.players[1].hand).toHaveLength(1);
    expect(g.playedThisTurn).toBe(false);
  });

  it("wraps to player 1 and increments the turn counter", () => {
    let g = playingState();
    for (let i = 0; i < FACTIONS.length; i++) g = endTurn(g, seededRng(4));
    expect(g.current).toBe(0);
    expect(g.turn).toBe(2);
    expect(g.players[0].hand).toHaveLength(2);
  });

  it("isHumanTurn is true only for players[0] in playing phase", () => {
    const g = playingState();
    expect(isHumanTurn(g)).toBe(true);
    expect(isHumanTurn(endTurn(g, seededRng(5)))).toBe(false);
    expect(isHumanTurn(newGame(FACTIONS))).toBe(false);
  });
});

describe("aiTurn", () => {
  it("plays the AI's first card", () => {
    const g = endTurn(playingState(), seededRng(6));
    const after = aiTurn(g);
    expect(after.players[1].hand).toHaveLength(0);
    expect(after.players[1].discard).toHaveLength(1);
  });

  it("does nothing when the AI hand is empty", () => {
    let g = endTurn(playingState(), seededRng(6));
    const p1 = { ...g.players[1], hand: [] as string[] };
    g = { ...g, players: [g.players[0], p1, ...g.players.slice(2)] };
    expect(aiTurn(g)).toBe(g);
  });

  it("the full cycle keeps decks cycling far past deck depletion", () => {
    let g = playingState();
    const rng = seededRng(9);
    // 4 players x 60 full rounds = every player draws and plays 60 times
    for (let round = 0; round < 60; round++) {
      for (let p = 0; p < FACTIONS.length; p++) {
        g = isHumanTurn(g) ? playCard(g, 0) : aiTurn(g);
        g = endTurn(g, rng);
      }
    }
    expect(g.turn).toBe(61);
    for (const p of g.players) {
      expect(p.deck.length + p.hand.length + p.discard.length).toBe(DECK_SIZE);
    }
  });
});
