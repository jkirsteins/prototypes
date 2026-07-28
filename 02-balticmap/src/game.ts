import { buildDeck, buildAiDeck, shuffle, CARDS, DECK_SIZE, type Rng } from "./cards";
import {
  allianceKey, bumpMight, bumpMightAll, bumpStatus, levelStatus, realmOf,
  type Incorporated, type Overlords, type Relations,
} from "./relations";
import { playableSet, validTargetsFor, type RulesView } from "./playability";

export type GameEventType =
  | "draw" | "play" | "reshuffle" | "discard"
  | "subjugated" | "released" | "incorporated" | "reclaimed" | "tribute"
  | "victory" | "defeat";

export interface GameEvent {
  turn: number;
  playerId: number; // 1 = human
  type: GameEventType;
  cardId?: string; // draw, play, discard
  targetFactionId?: string;
  overlordFactionId?: string;
  formerOverlordFactionId?: string; // subjugated: prior lord of the target
  track?: "status" | "might"; // tribute
  prevented?: boolean; // play: a nullified Assassinate ruler (Bodyguard)
}

export type GamePhase =
  | "main-menu" | "deck-building" | "pick-faction" | "playing"
  | "victory" | "defeat";

export type TributeTrack = "status" | "might";

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
  current: number;
  playedThisTurn: boolean;
  factionIds: string[];
  relations: Relations;
  overlords: Overlords; // STORED vassal -> overlord map
  incorporated: Incorporated;
  adjacency: Record<string, string[]>;
  alliances: Record<string, number>; // sorted-pair key -> expiry turn
  diplomacyBoost: string[]; // faction ids holding an unused Extended diplomacy
  bodyguards: string[]; // faction ids holding an unused Bodyguard guard
  humanDeck: string[];
  seenThisRun: string[]; // non-basic enemy cards witnessed (learning loop)
  log: GameEvent[];
}

export const OPENING_HAND = 3;
export const VICTORY_REALM_SIZE = 11;

export function viewOf(state: GameState): RulesView {
  return {
    relations: state.relations,
    overlords: state.overlords,
    incorporated: state.incorporated,
    adjacency: state.adjacency,
    factionIds: state.factionIds,
    alliances: state.alliances,
    turn: state.turn,
    bodyguards: state.bodyguards,
  };
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
    overlords: new Map(),
    incorporated: {},
    alliances: {},
    diplomacyBoost: [],
    bodyguards: [],
    adjacency:
      adjacency ??
      Object.fromEntries(
        factionIds.map((id) => [id, factionIds.filter((o) => o !== id)]),
      ),
    humanDeck: buildDeck(),
    seenThisRun: [],
    log: [],
  };
}

export function startGame(state: GameState): GameState {
  if (state.phase !== "main-menu") return state;
  return { ...state, phase: "deck-building" };
}

/** Locks in the human deck and proceeds to faction picking. */
export function chooseDeck(state: GameState, deckCards: string[]): GameState {
  if (state.phase !== "deck-building") return state;
  if (deckCards.length !== DECK_SIZE) return state;
  return { ...state, phase: "pick-faction", humanDeck: [...deckCards] };
}

function makePlayer(
  id: number,
  factionId: string,
  rng: Rng,
  deckCards: string[] = buildDeck(),
): PlayerState {
  const deck = shuffle(deckCards, rng);
  // opening hand: dealt silently (no log events)
  return {
    id,
    factionId,
    hand: deck.slice(0, OPENING_HAND),
    deck: deck.slice(OPENING_HAND),
    discard: [],
  };
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
    makePlayer(1, factionId, rng, state.humanDeck),
    ...others.map((id, i) => makePlayer(i + 2, id, rng, buildAiDeck(rng))),
  ];
  return beginTurn({ ...state, phase: "playing", players, current: 0 }, rng);
}

/** Current player draws 1 (reshuffle rule); resets the play flag. */
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

const stripTribute = (p: PlayerState): PlayerState => ({
  ...p,
  deck: p.deck.filter((c) => c !== "pay-tribute"),
  hand: p.hand.filter((c) => c !== "pay-tribute"),
  discard: p.discard.filter((c) => c !== "pay-tribute"),
});

function updateFaction(
  players: PlayerState[],
  factionId: string,
  fn: (p: PlayerState) => PlayerState,
): PlayerState[] {
  return players.map((p) => (p.factionId === factionId ? fn(p) : p));
}

export function playCard(
  state: GameState,
  cardIndex: number,
  rng: Rng,
  targetId?: string,
  tributeTrack?: TributeTrack,
): GameState {
  if (state.phase !== "playing") return state;
  if (state.playedThisTurn) return state;
  const p = state.players[state.current];
  const set = playableSet(viewOf(state), p.factionId, p.hand);
  if (set.mode !== "play" || !set.cardIndexes.includes(cardIndex)) return state;
  const cardId = p.hand[cardIndex];
  const card = CARDS[cardId];
  if (card === undefined) return state;
  if (card.targeted) {
    const targets = validTargetsFor(viewOf(state), p.factionId, cardId);
    if (targetId === undefined || !targets.includes(targetId)) return state;
  }
  if (cardId === "pay-tribute" && tributeTrack === undefined) return state;

  let relations = state.relations;
  const overlords = new Map(state.overlords);
  let incorporated = state.incorporated;
  let alliances = state.alliances;
  let diplomacyBoost = state.diplomacyBoost;
  let bodyguards = state.bodyguards;
  let phase: GamePhase = state.phase;
  let prevented = false;
  const events: GameEvent[] = [
    {
      turn: state.turn, playerId: p.id, type: "play", cardId,
      ...(card.targeted && targetId !== undefined
        ? { targetFactionId: targetId }
        : {}),
    },
  ];

  // move the played card out of hand first, then apply effects to players
  let players = state.players.map((pl, i) =>
    i === state.current
      ? {
          ...pl,
          hand: pl.hand.filter((_, j) => j !== cardIndex),
          discard: [...pl.discard, cardId],
        }
      : pl,
  );

  const freeVassalsOf = (lord: string): void => {
    for (const [vassal, l] of [...overlords]) {
      if (l === lord) {
        overlords.delete(vassal);
        players = updateFaction(players, vassal, stripTribute);
        events.push({
          turn: state.turn, playerId: p.id, type: "released",
          targetFactionId: vassal, overlordFactionId: lord,
        });
      }
    }
  };

  if (cardId === "raid" && targetId !== undefined) {
    relations = bumpMight(relations, p.factionId, targetId);
  } else if (cardId === "shrewd-marriage" && targetId !== undefined) {
    relations = bumpStatus(relations, p.factionId, targetId);
  } else if (cardId === "fortify") {
    const living = state.factionIds.filter(
      (f) => f !== p.factionId && !(f in incorporated),
    );
    relations = bumpMightAll(relations, p.factionId, living);
  } else if (cardId === "assassinate-ruler" && targetId !== undefined) {
    if (bodyguards.includes(targetId)) {
      bodyguards = bodyguards.filter((f) => f !== targetId);
      prevented = true;
    } else {
      relations = levelStatus(relations, p.factionId, targetId);
    }
  } else if (cardId === "bodyguard") {
    if (!bodyguards.includes(p.factionId)) {
      bodyguards = [...bodyguards, p.factionId];
    }
  } else if (cardId === "alliance" && targetId !== undefined) {
    const boosted = diplomacyBoost.includes(p.factionId);
    alliances = {
      ...alliances,
      [allianceKey(p.factionId, targetId)]: state.turn + (boosted ? 10 : 5),
    };
    if (boosted) diplomacyBoost = diplomacyBoost.filter((f) => f !== p.factionId);
  } else if (cardId === "extended-diplomacy") {
    if (!diplomacyBoost.includes(p.factionId)) {
      diplomacyBoost = [...diplomacyBoost, p.factionId];
    }
  } else if (cardId === "subjugate" && targetId !== undefined) {
    const formerLord = overlords.get(targetId);
    freeVassalsOf(targetId);
    overlords.set(targetId, p.factionId);
    players = updateFaction(players, targetId, (pl) => {
      const clean = stripTribute(pl);
      return { ...clean, deck: shuffle([...clean.deck, "pay-tribute", "pay-tribute"], rng) };
    });
    if (formerLord !== undefined) {
      // vassal-loss penalty (section 8): the poached vassal gains +1/+1
      // over the former lord (relation counters only grow).
      relations = bumpStatus(bumpMight(relations, targetId, formerLord), targetId, formerLord);
    }
    events.push({
      turn: state.turn, playerId: p.id, type: "subjugated",
      targetFactionId: targetId, overlordFactionId: p.factionId,
      ...(formerLord !== undefined ? { formerOverlordFactionId: formerLord } : {}),
    });
  } else if (cardId === "incorporate" && targetId !== undefined) {
    overlords.delete(targetId);
    freeVassalsOf(targetId); // defensive: chains never exist
    incorporated = { ...incorporated, [targetId]: p.factionId };
    for (const [land, owner] of Object.entries(incorporated)) {
      if (owner === targetId) incorporated = { ...incorporated, [land]: p.factionId };
    }
    players = updateFaction(players, targetId, stripTribute);
    events.push({
      turn: state.turn, playerId: p.id, type: "incorporated",
      targetFactionId: targetId, overlordFactionId: p.factionId,
    });
  } else if (cardId === "reclaim-independence") {
    const former = overlords.get(p.factionId);
    if (former === undefined) return state;
    overlords.delete(p.factionId);
    players = updateFaction(players, p.factionId, stripTribute);
    events.push({
      turn: state.turn, playerId: p.id, type: "reclaimed",
      targetFactionId: p.factionId, overlordFactionId: former,
    });
  } else if (cardId === "revolt") {
    const former = overlords.get(p.factionId);
    if (former === undefined) return state;
    overlords.delete(p.factionId);
    players = updateFaction(players, p.factionId, stripTribute);
    // vassal-loss penalty (section 8): the revolting vassal gains +1/+1
    // over the former lord (relation counters only grow).
    relations = bumpStatus(bumpMight(relations, p.factionId, former), p.factionId, former);
    events.push({
      turn: state.turn, playerId: p.id, type: "reclaimed",
      targetFactionId: p.factionId, overlordFactionId: former,
    });
  } else if (cardId === "pay-tribute") {
    const lord = overlords.get(p.factionId);
    if (lord === undefined || tributeTrack === undefined) return state;
    const beneficiaries = [
      lord,
      ...state.factionIds.filter((f) => incorporated[f] === lord),
    ];
    const bump = tributeTrack === "might" ? bumpMight : bumpStatus;
    for (const b of beneficiaries) {
      relations = bump(relations, b, p.factionId);
    }
    events.push({
      turn: state.turn, playerId: p.id, type: "tribute",
      targetFactionId: p.factionId, overlordFactionId: lord,
      track: tributeTrack,
    });
  }

  if (prevented) events[0] = { ...events[0], prevented: true };

  // learning hook: enemy non-basic cards witnessed by the human
  let seenThisRun = state.seenThisRun;
  const human = players[0];
  if (
    p.id !== 1 &&
    card.deckBuildable &&
    card.maxPerDeck !== null &&
    !seenThisRun.includes(cardId)
  ) {
    const humanRealm = realmOf(human.factionId, overlords, incorporated);
    const humanRealmBefore = realmOf(human.factionId, state.overlords, state.incorporated);
    let seen = false;
    if (card.targeted && targetId !== undefined) {
      seen = humanRealm.includes(targetId) || humanRealmBefore.includes(targetId);
    } else if (!card.targeted) {
      const actorRealm = realmOf(p.factionId, overlords, incorporated);
      const humanSet = new Set(humanRealm);
      seen = actorRealm.some((m) =>
        (state.adjacency[m] ?? []).some((a) => humanSet.has(a)),
      );
    }
    if (seen) seenThisRun = [...seenThisRun, cardId];
  }

  // endings
  // defeat is checked before victory; the spec notes the two cannot coincide
  if (incorporated[human.factionId] !== undefined) {
    phase = "defeat";
    events.push({
      turn: state.turn, playerId: p.id, type: "defeat",
      targetFactionId: human.factionId,
      overlordFactionId: incorporated[human.factionId],
    });
  } else if (
    realmOf(human.factionId, overlords, incorporated).length >=
    VICTORY_REALM_SIZE
  ) {
    phase = "victory";
    events.push({ turn: state.turn, playerId: p.id, type: "victory" });
  }

  return {
    ...state, phase, players, relations, overlords, incorporated,
    alliances, diplomacyBoost, bodyguards, seenThisRun,
    log: [...state.log, ...events], playedThisTurn: true,
  };
}

/** Forced discard when nothing in hand is playable. */
export function discardCard(state: GameState, cardIndex: number): GameState {
  if (state.phase !== "playing") return state;
  if (state.playedThisTurn) return state;
  const p = state.players[state.current];
  const set = playableSet(viewOf(state), p.factionId, p.hand);
  if (set.mode !== "discard" || !set.cardIndexes.includes(cardIndex)) return state;
  const cardId = p.hand[cardIndex];
  const players = state.players.map((pl, i) =>
    i === state.current
      ? {
          ...pl,
          hand: pl.hand.filter((_, j) => j !== cardIndex),
          discard: [...pl.discard, cardId],
        }
      : pl,
  );
  return {
    ...state,
    players,
    log: [
      ...state.log,
      { turn: state.turn, playerId: p.id, type: "discard", cardId },
    ],
    playedThisTurn: true,
  };
}

/** Moves to the next non-incorporated player after a completed turn.
 *  The human (index 0) is never skipped; the turn counter bumps on wrap. */
export function advance(state: GameState, rng: Rng): GameState {
  if (state.phase !== "playing" || !state.playedThisTurn) return state;
  const inert = (i: number): boolean =>
    state.players[i].factionId in state.incorporated;
  let current = state.current;
  let turn = state.turn;
  do {
    current = (current + 1) % state.players.length;
    if (current === 0) turn += 1;
  } while (current !== 0 && inert(current));
  return beginTurn({ ...state, current, turn }, rng);
}

export function isHumanTurn(state: GameState): boolean {
  return state.phase === "playing" && state.current === 0;
}
