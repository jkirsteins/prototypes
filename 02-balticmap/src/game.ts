import { buildDeck, shuffle, type Rng } from "./cards";

export type GamePhase = "main-menu" | "pick-faction" | "playing";

export interface PlayerState {
  id: number; // 1 = human, 2..N = AI
  factionId: string;
  deck: string[];
  hand: string[];
  discard: string[];
}

export interface GameState {
  phase: GamePhase;
  turn: number; // 1-based
  players: PlayerState[]; // index 0 = human
  current: number; // index into players
  playedThisTurn: boolean;
  factionIds: string[];
}

export function newGame(factionIds: string[]): GameState {
  return {
    phase: "main-menu",
    turn: 1,
    players: [],
    current: 0,
    playedThisTurn: false,
    factionIds,
  };
}

export function startGame(state: GameState): GameState {
  if (state.phase !== "main-menu") return state;
  return { ...state, phase: "pick-faction" };
}

function makePlayer(id: number, factionId: string, rng: Rng): PlayerState {
  return { id, factionId, deck: shuffle(buildDeck(), rng), hand: [], discard: [] };
}

export function pickFaction(
  state: GameState,
  factionId: string,
  rng: Rng,
): GameState {
  if (state.phase !== "pick-faction") return state;
  if (!state.factionIds.includes(factionId)) return state;
  const others = state.factionIds.filter((id) => id !== factionId);
  const players = [
    makePlayer(1, factionId, rng),
    ...others.map((id, i) => makePlayer(i + 2, id, rng)),
  ];
  return beginTurn(
    { ...state, phase: "playing", players, current: 0 },
    rng,
  );
}

/** Current player draws 1: reshuffle discard into deck if the deck is empty;
 *  skip the draw entirely if both are empty. Resets the play-per-turn flag. */
export function beginTurn(state: GameState, rng: Rng): GameState {
  const p = state.players[state.current];
  let { deck, discard } = p;
  if (deck.length === 0 && discard.length > 0) {
    deck = shuffle(discard, rng);
    discard = [];
  }
  let hand = p.hand;
  if (deck.length > 0) {
    hand = [...hand, deck[0]];
    deck = deck.slice(1);
  }
  const updated = { ...p, deck, hand, discard };
  const players = state.players.map((pl, i) =>
    i === state.current ? updated : pl,
  );
  return { ...state, players, playedThisTurn: false };
}

export function playCard(state: GameState, cardIndex: number): GameState {
  if (state.phase !== "playing" || state.playedThisTurn) return state;
  const p = state.players[state.current];
  if (cardIndex < 0 || cardIndex >= p.hand.length) return state;
  const updated = {
    ...p,
    hand: p.hand.filter((_, i) => i !== cardIndex),
    discard: [...p.discard, p.hand[cardIndex]],
  };
  const players = state.players.map((pl, i) =>
    i === state.current ? updated : pl,
  );
  return { ...state, players, playedThisTurn: true };
}

export function endTurn(state: GameState, rng: Rng): GameState {
  if (state.phase !== "playing") return state;
  const current = (state.current + 1) % state.players.length;
  const turn = current === 0 ? state.turn + 1 : state.turn;
  return beginTurn({ ...state, current, turn }, rng);
}

/** The current (AI) player plays their first card, if any.
 *  Their draw already happened in beginTurn via endTurn. */
export function aiTurn(state: GameState): GameState {
  return playCard(state, 0);
}

export function isHumanTurn(state: GameState): boolean {
  return state.phase === "playing" && state.current === 0;
}
