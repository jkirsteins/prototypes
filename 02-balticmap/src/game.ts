import { buildDeck, shuffle, CARDS, type Rng } from "./cards";
import {
  bumpMight, bumpStatus, computeOverlords, getRel, validTargets,
  type Incorporated, type Overlords, type Relations,
} from "./relations";

export type GameEventType =
  | "draw" | "play" | "reshuffle"
  | "subjugated" | "released" | "incorporated" | "game-over";

export interface GameEvent {
  turn: number;
  playerId: number; // 1 = human
  type: GameEventType;
  cardId?: string; // present for draw and play
  targetFactionId?: string; // play target / affected faction
  overlordFactionId?: string; // subjugated, incorporated, game-over
}

export type GamePhase = "main-menu" | "pick-faction" | "playing" | "game-over";

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
  relations: Relations;
  incorporated: Incorporated;
  adjacency: Record<string, string[]>; // faction id -> adjacent faction ids
  log: GameEvent[];
}

export function newGame(
  factionIds: string[],
  adjacency?: Record<string, string[]>,
): GameState {
  return {
    phase: "main-menu",
    turn: 1,
    players: [],
    current: 0,
    playedThisTurn: false,
    factionIds,
    relations: {},
    incorporated: {},
    adjacency:
      adjacency ??
      Object.fromEntries(
        factionIds.map((id) => [id, factionIds.filter((o) => o !== id)]),
      ),
    log: [],
  };
}

export function overlordsOf(state: GameState): Overlords {
  return computeOverlords(state.relations, state.incorporated, state.factionIds);
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
  if (state.players.length === 0) return state;
  const p = state.players[state.current];
  let { deck, discard } = p;
  const log = [...state.log];
  if (deck.length === 0 && discard.length > 0) {
    deck = shuffle(discard, rng);
    discard = [];
    log.push({ turn: state.turn, playerId: p.id, type: "reshuffle" });
  }
  let hand = p.hand;
  if (deck.length > 0) {
    log.push({ turn: state.turn, playerId: p.id, type: "draw", cardId: deck[0] });
    hand = [...hand, deck[0]];
    deck = deck.slice(1);
  }
  const updated = { ...p, deck, hand, discard };
  const players = state.players.map((pl, i) =>
    i === state.current ? updated : pl,
  );
  return { ...state, players, log, playedThisTurn: false };
}

export function playCard(
  state: GameState,
  cardIndex: number,
  targetId?: string,
): GameState {
  if (state.phase !== "playing" || state.playedThisTurn) return state;
  const p = state.players[state.current];
  if (cardIndex < 0 || cardIndex >= p.hand.length) return state;
  const cardId = p.hand[cardIndex];
  const card = CARDS[cardId];
  const before = overlordsOf(state);

  let relations = state.relations;
  let incorporated = state.incorporated;
  if (card?.targeted) {
    const targets = validTargets(
      p.factionId, cardId, before, incorporated, state.adjacency, state.factionIds,
    );
    if (targetId === undefined || !targets.includes(targetId)) return state;
    if (cardId === "raid") {
      relations = bumpMight(relations, p.factionId, targetId);
    } else if (cardId === "shrewd-marriage") {
      relations = bumpStatus(relations, p.factionId, targetId);
    } else if (cardId === "incorporate") {
      incorporated = { ...incorporated, [targetId]: p.factionId };
    }
  }

  const updated = {
    ...p,
    hand: p.hand.filter((_, i) => i !== cardIndex),
    discard: [...p.discard, cardId],
  };
  const players = state.players.map((pl, i) =>
    i === state.current ? updated : pl,
  );

  const events: GameEvent[] = [
    {
      turn: state.turn, playerId: p.id, type: "play", cardId,
      ...(card?.targeted && targetId !== undefined
        ? { targetFactionId: targetId }
        : {}),
    },
  ];
  if (cardId === "incorporate" && targetId !== undefined) {
    events.push({
      turn: state.turn, playerId: p.id, type: "incorporated",
      targetFactionId: targetId, overlordFactionId: p.factionId,
    });
  }

  const after = computeOverlords(relations, incorporated, state.factionIds);
  for (const f of state.factionIds) {
    if (f in incorporated) continue; // annexation logged above, not a release
    const was = before.get(f);
    const is = after.get(f);
    if (was === is) continue;
    if (is !== undefined) {
      events.push({
        turn: state.turn, playerId: p.id, type: "subjugated",
        targetFactionId: f, overlordFactionId: is,
      });
    } else {
      events.push({
        turn: state.turn, playerId: p.id, type: "released", targetFactionId: f,
      });
    }
  }

  let phase: GamePhase = state.phase;
  const humanFaction = players[0]?.factionId;
  const humanOverlord =
    humanFaction !== undefined ? after.get(humanFaction) : undefined;
  if (humanOverlord !== undefined) {
    phase = "game-over";
    events.push({
      turn: state.turn, playerId: p.id, type: "game-over",
      targetFactionId: humanFaction, overlordFactionId: humanOverlord,
    });
  }

  return {
    ...state, phase, players, relations, incorporated,
    log: [...state.log, ...events], playedThisTurn: true,
  };
}

export function endTurn(state: GameState, rng: Rng): GameState {
  if (state.phase !== "playing") return state;
  const overlords = overlordsOf(state);
  const inert = (i: number): boolean => {
    const f = state.players[i].factionId;
    return overlords.has(f) || f in state.incorporated;
  };
  let current = state.current;
  let turn = state.turn;
  do {
    current = (current + 1) % state.players.length;
    if (current === 0) turn += 1;
  } while (current !== 0 && inert(current));
  return beginTurn({ ...state, current, turn }, rng);
}

/** Greedy, deterministic AI: incorporate a vassal; else the raid/marriage
 *  closest to a NEW subjugation (own vassals excluded); else grow crops;
 *  else the first playable card; else pass. */
export function aiTurn(state: GameState): GameState {
  if (state.phase !== "playing") return state;
  const p = state.players[state.current];
  if (p.hand.length === 0) return state;
  const overlords = overlordsOf(state);
  const targetsFor = (cardId: string): string[] =>
    validTargets(
      p.factionId, cardId, overlords, state.incorporated,
      state.adjacency, state.factionIds,
    );

  const vassals = state.factionIds.filter(
    (f) => overlords.get(f) === p.factionId,
  );
  if (p.hand.includes("incorporate") && vassals.length > 0) {
    return playCard(state, p.hand.indexOf("incorporate"), vassals[0]);
  }

  const tracks = [
    { cardId: "raid", field: "might" as const },
    { cardId: "shrewd-marriage", field: "status" as const },
  ];
  let best: { cardId: string; targetId: string; deficit: number; order: number } | null = null;
  for (const t of tracks) {
    if (!p.hand.includes(t.cardId)) continue;
    for (const targetId of targetsFor(t.cardId)) {
      if (overlords.get(targetId) === p.factionId) continue; // expand, not reinforce
      const mine = getRel(state.relations, p.factionId, targetId)[t.field];
      const theirs = getRel(state.relations, targetId, p.factionId)[t.field];
      const deficit = theirs - mine + 1;
      const order = state.factionIds.indexOf(targetId);
      if (
        best === null ||
        deficit < best.deficit ||
        (deficit === best.deficit && order < best.order)
      ) {
        best = { cardId: t.cardId, targetId, deficit, order };
      }
    }
  }
  if (best !== null) {
    return playCard(state, p.hand.indexOf(best.cardId), best.targetId);
  }

  if (p.hand.includes("grow-crops")) {
    return playCard(state, p.hand.indexOf("grow-crops"));
  }

  for (let i = 0; i < p.hand.length; i++) {
    const card = CARDS[p.hand[i]];
    if (!card?.targeted) return playCard(state, i);
    const targets = targetsFor(p.hand[i]);
    if (targets.length > 0) return playCard(state, i, targets[0]);
  }
  return state;
}

export function isHumanTurn(state: GameState): boolean {
  return state.phase === "playing" && state.current === 0;
}
