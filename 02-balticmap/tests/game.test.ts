import { describe, it, expect } from "vitest";
import {
  newGame, startGame, pickFaction, beginTurn, playCard, endTurn, aiTurn,
  isHumanTurn, overlordsOf, type GameState,
} from "../src/game";
import { DECK_SIZE, type Rng } from "../src/cards";
import { getRel, bumpMight } from "../src/relations";

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

function withHand(g: GameState, playerIdx: number, hand: string[]): GameState {
  const p = { ...g.players[playerIdx], hand };
  return { ...g, players: g.players.map((pl, i) => (i === playerIdx ? p : pl)) };
}

/** Neutralize deck randomness for tests about cycling, not card identity. */
function allGrowCrops(g: GameState): GameState {
  return {
    ...g,
    players: g.players.map((p) => ({
      ...p,
      deck: p.deck.map(() => "grow-crops"),
      hand: p.hand.map(() => "grow-crops"),
      discard: p.discard.map(() => "grow-crops"),
    })),
  };
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
    const g = withHand(playingState(), 0, ["grow-crops"]);
    const played = playCard(g, 0);
    expect(played.players[0].hand).toHaveLength(0);
    expect(played.players[0].discard).toEqual(["grow-crops"]);
    expect(played.playedThisTurn).toBe(true);
    expect(playCard(played, 0)).toBe(played);
  });

  it("ignores out-of-range indices and does not mutate input", () => {
    const g = withHand(playingState(), 0, ["grow-crops"]);
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
    const g = withHand(endTurn(playingState(), seededRng(6)), 1, ["grow-crops"]);
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
    let g = allGrowCrops(playingState());
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

describe("event log", () => {
  it("starts empty and records the opening draw", () => {
    expect(newGame(FACTIONS).log).toEqual([]);
    const g = playingState();
    expect(g.log).toEqual([
      { turn: 1, playerId: 1, type: "draw", cardId: g.players[0].hand[0] },
    ]);
  });

  it("records plays with the card id", () => {
    const g = withHand(playingState(), 0, ["grow-crops"]);
    const played = playCard(g, 0);
    expect(played.log.at(-1)).toEqual({
      turn: 1, playerId: 1, type: "play", cardId: "grow-crops",
    });
  });

  it("records AI draws on endTurn", () => {
    const g = endTurn(playingState(), seededRng(3));
    expect(g.log.at(-1)).toEqual({
      turn: 1, playerId: 2, type: "draw", cardId: g.players[1].hand.at(-1),
    });
  });

  it("records a reshuffle before the draw when the deck is empty", () => {
    let g = playingState();
    const p0 = {
      ...g.players[0],
      deck: [] as string[],
      hand: [] as string[],
      discard: ["grow-crops", "grow-crops"],
    };
    g = { ...g, players: [p0, ...g.players.slice(1)] };
    const after = beginTurn(g, seededRng(2));
    expect(after.log.slice(-2)).toEqual([
      { turn: 1, playerId: 1, type: "reshuffle" },
      { turn: 1, playerId: 1, type: "draw", cardId: "grow-crops" },
    ]);
  });

  it("records no event when deck and discard are both empty", () => {
    let g = playingState();
    const p0 = {
      ...g.players[0],
      deck: [] as string[],
      hand: [] as string[],
      discard: [] as string[],
    };
    g = { ...g, players: [p0, ...g.players.slice(1)] };
    const before = g.log.length;
    expect(beginTurn(g, seededRng(2)).log).toHaveLength(before);
  });

  it("does not mutate the input state's log", () => {
    const g = playingState();
    const len = g.log.length;
    playCard(g, 0);
    endTurn(g, seededRng(5));
    expect(g.log).toHaveLength(len);
  });
});

describe("targeted card play", () => {
  const LINE_ADJ = {
    alpha: ["beta"],
    beta: ["alpha", "gamma"],
    gamma: ["beta", "delta"],
    delta: ["gamma"],
  };

  function lineState(): GameState {
    return pickFaction(
      startGame(newGame(FACTIONS, LINE_ADJ)), "beta", seededRng(1),
    );
  }

  it("raid bumps might and subjugates on a positive lead", () => {
    const g = withHand(lineState(), 0, ["raid"]);
    const after = playCard(g, 0, "alpha");
    expect(getRel(after.relations, "beta", "alpha").might).toBe(1);
    expect(overlordsOf(after).get("alpha")).toBe("beta");
    expect(after.log.at(-2)).toMatchObject({
      type: "play", cardId: "raid", targetFactionId: "alpha",
    });
    expect(after.log.at(-1)).toMatchObject({
      type: "subjugated", targetFactionId: "alpha", overlordFactionId: "beta",
    });
  });

  it("shrewd marriage bumps status the same way", () => {
    const g = withHand(lineState(), 0, ["shrewd-marriage"]);
    const after = playCard(g, 0, "gamma");
    expect(getRel(after.relations, "beta", "gamma").status).toBe(1);
    expect(overlordsOf(after).get("gamma")).toBe("beta");
  });

  it("rejects a targeted card without a target or out of reach", () => {
    const g = withHand(lineState(), 0, ["raid"]);
    expect(playCard(g, 0)).toBe(g);
    expect(playCard(g, 0, "delta")).toBe(g); // not adjacent to beta's realm
    expect(playCard(g, 0, "beta")).toBe(g); // never self
  });

  it("incorporate annexes a vassal permanently, with a log entry", () => {
    let g = lineState();
    g = { ...g, relations: bumpMight(g.relations, "beta", "alpha") };
    g = withHand(g, 0, ["incorporate"]);
    const after = playCard(g, 0, "alpha");
    expect(after.incorporated).toEqual({ alpha: "beta" });
    expect(overlordsOf(after).has("alpha")).toBe(false);
    const types = after.log.map((e) => e.type);
    expect(types).toContain("incorporated");
    expect(types.filter((t) => t === "released")).toHaveLength(0);
  });

  it("incorporate rejects non-vassals", () => {
    const g = withHand(lineState(), 0, ["incorporate"]);
    expect(playCard(g, 0, "alpha")).toBe(g);
  });

  it("poaching logs a subjugated event with the new overlord", () => {
    let g = lineState();
    // gamma starts as alpha's vassal (relations can be seeded directly;
    // adjacency only constrains card play, not stored numbers)
    g = { ...g, relations: bumpMight(g.relations, "alpha", "gamma") };
    g = withHand(g, 0, ["raid"]);
    let after = playCard(g, 0, "gamma"); // beta 1 vs alpha 1: alpha keeps (order)
    expect(overlordsOf(after).get("gamma")).toBe("alpha");
    after = { ...after, playedThisTurn: false };
    after = withHand(after, 0, ["raid"]);
    after = playCard(after, 0, "gamma"); // beta lead 2 beats alpha lead 1
    expect(overlordsOf(after).get("gamma")).toBe("beta");
    expect(after.log.at(-1)).toMatchObject({
      type: "subjugated", targetFactionId: "gamma", overlordFactionId: "beta",
    });
  });

  it("subjugating the human ends the game", () => {
    let g = lineState();
    g = { ...g, current: 2 }; // player 3 = gamma
    g = withHand(g, 2, ["raid"]);
    const after = playCard(g, 0, "beta");
    expect(after.phase).toBe("game-over");
    expect(after.log.at(-1)).toMatchObject({
      type: "game-over", targetFactionId: "beta", overlordFactionId: "gamma",
    });
  });

  it("newGame without adjacency connects everyone (test default)", () => {
    const g = newGame(FACTIONS);
    expect(g.adjacency["alpha"].sort()).toEqual(["beta", "delta", "gamma"]);
    expect(g.relations).toEqual({});
    expect(g.incorporated).toEqual({});
  });
});

describe("turn skipping", () => {
  it("skips subjugated players and still increments the turn on wrap", () => {
    let g = playingState(); // players: beta(you), alpha, gamma, delta
    g = { ...g, relations: bumpMight(g.relations, "gamma", "alpha") };
    const after = endTurn(g, seededRng(7)); // alpha (index 1) is a vassal
    expect(after.current).toBe(2); // gamma acts next
    expect(after.players[1].hand).toHaveLength(0); // no draw for alpha
    let wrapped = endTurn(after, seededRng(7)); // delta
    wrapped = endTurn(wrapped, seededRng(7)); // back to you
    expect(wrapped.current).toBe(0);
    expect(wrapped.turn).toBe(2);
  });

  it("skips incorporated players", () => {
    let g = playingState();
    g = { ...g, incorporated: { alpha: "beta" } };
    const after = endTurn(g, seededRng(7));
    expect(after.current).toBe(2);
  });

  it("wraps to the human even when every AI is inert", () => {
    let g = playingState();
    let rel = g.relations;
    rel = bumpMight(rel, "beta", "alpha");
    rel = bumpMight(rel, "beta", "gamma");
    rel = bumpMight(rel, "beta", "delta");
    g = { ...g, relations: rel };
    const after = endTurn(g, seededRng(7));
    expect(after.current).toBe(0);
    expect(after.turn).toBe(2);
  });
});
