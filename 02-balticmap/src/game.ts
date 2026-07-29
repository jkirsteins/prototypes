import { buildDeck, buildAiDeck, shuffle, CARDS, DECK_SIZE, DOUBLABLE_CARDS, type Rng } from "./cards";
import {
  allianceKey, bumpMight, bumpMightAll, bumpMightAllBy, bumpMightBy, bumpStatus, bumpStatusBy,
  levelStatus, realmOf,
  type Incorporated, type Overlords, type Relations,
} from "./relations";
import { borderStrength, playableSet, validTargetsFor, type RulesView } from "./playability";
import { initialRulers, replaceRuler, rulerOf, type Rulers } from "./rulers";

export type GameEventType =
  | "draw" | "play" | "reshuffle" | "discard"
  | "subjugated" | "released" | "incorporated" | "reclaimed" | "tribute"
  | "victory" | "defeat" | "unified";

export interface GameEvent {
  turn: number;
  playerId: number; // 1 = human
  type: GameEventType;
  cardId?: string; // draw, play, discard, reclaimed (which card freed them)
  targetFactionId?: string;
  overlordFactionId?: string;
  formerOverlordFactionId?: string; // subjugated: prior lord of the target
  track?: "status" | "might"; // tribute
  prevented?: boolean; // play: a nullified Assassinate ruler (Bodyguard)
  doubled?: boolean; // play, reclaimed: a card whose numbers a reading doubled
  actorRuler?: string; // ruler of the acting faction when this was logged
  targetRuler?: string; // assassinate: the ruler in the crosshairs
  successorRuler?: string; // assassinate: set only when the killing landed
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
  omens: string[]; // faction ids holding an unspent Favourable omens reading
  /** One ruler per faction id, total. Read through `rulerOf`, written only
   *  by `replaceRuler`. */
  rulers: Rulers;
  /** Faction id -> ethnicity id, for the ruler name pools. Map-derived, like
   *  `adjacency`; empty in tests, which then draw from the generic pool. */
  ethnicities: Record<string, string>;
  /** Index of the seat treated as the player, or null for a world simulation
   *  with no privileged seat. Only the endings block and `advance` consult it;
   *  the rest of the app still addresses the human as index 0 / player id 1. */
  humanSeat: number | null;
  humanDeck: string[];
  seenThisRun: string[]; // non-basic enemy cards witnessed (learning loop)
  log: GameEvent[];
}

export const OPENING_HAND = 3;

/** Lands needed to win: a 55 percent majority of the roster, rounded up.
 *  Derived rather than hardcoded so it cannot rot when the map changes. */
export function victoryRealmSize(factionCount: number): number {
  return Math.ceil(0.55 * factionCount);
}

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
    omens: state.omens,
  };
}

export function newGame(
  factionIds: string[],
  adjacency?: Record<string, string[]>,
  ethnicities: Record<string, string> = {},
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
    omens: [],
    ethnicities,
    rulers: initialRulers(factionIds, ethnicities),
    humanSeat: 0,
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

/** `aiDeckFor` overrides how enemy decks are built; the app leaves it out and
 *  gets the standard randomized deck. Simulations pass a variant builder. */
export function pickFaction(
  state: GameState,
  factionId: string,
  rng: Rng,
  aiDeckFor: (rng: Rng, factionId: string) => string[] = (r) => buildAiDeck(r),
): GameState {
  if (state.phase !== "pick-faction") return state;
  if (!state.factionIds.includes(factionId)) return state;
  const others = state.factionIds.filter((id) => id !== factionId);
  const players = [
    makePlayer(1, factionId, rng, state.humanDeck),
    ...others.map((id, i) => makePlayer(i + 2, id, rng, aiDeckFor(rng, id))),
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

/** Levelling Status and seating a successor are one step, so no future edit
 *  can apply the assassination's effect while forgetting the succession. */
function assassinate(
  state: GameState,
  rulers: Rulers,
  relations: Relations,
  actorFactionId: string,
  targetId: string,
): { relations: Relations; rulers: Rulers; killed: string; successor: string } {
  const succession = replaceRuler(rulers, state.ethnicities, targetId, state.turn);
  return {
    relations: levelStatus(relations, actorFactionId, targetId),
    ...succession,
  };
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
  let omens = state.omens;
  let rulers = state.rulers;
  const doubled = omens.includes(p.factionId) && DOUBLABLE_CARDS.has(cardId);
  const mult = doubled ? 2 : 1;
  if (doubled) omens = omens.filter((f) => f !== p.factionId);
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
    const gain = borderStrength(viewOf(state), p.factionId, targetId);
    relations = bumpMightBy(relations, p.factionId, targetId, gain * mult);
  } else if (cardId === "shrewd-marriage" && targetId !== undefined) {
    relations = bumpStatusBy(relations, p.factionId, targetId, mult);
  } else if (cardId === "fortify") {
    const living = state.factionIds.filter(
      (f) => f !== p.factionId && !(f in incorporated),
    );
    relations = bumpMightAllBy(relations, p.factionId, living, mult);
  } else if (cardId === "favourable-omens") {
    if (!omens.includes(p.factionId)) omens = [...omens, p.factionId];
  } else if (cardId === "assassinate-ruler" && targetId !== undefined) {
    if (bodyguards.includes(targetId)) {
      bodyguards = bodyguards.filter((f) => f !== targetId);
      prevented = true;
      events[0] = {
        ...events[0],
        targetRuler: rulerOf(rulers, targetId).name,
      };
    } else {
      const out = assassinate(state, rulers, relations, p.factionId, targetId);
      relations = out.relations;
      rulers = out.rulers;
      events[0] = {
        ...events[0],
        targetRuler: out.killed,
        successorRuler: out.successor,
      };
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
      turn: state.turn, playerId: p.id, type: "reclaimed", cardId,
      targetFactionId: p.factionId, overlordFactionId: former,
    });
  } else if (cardId === "revolt") {
    const former = overlords.get(p.factionId);
    if (former === undefined) return state;
    overlords.delete(p.factionId);
    players = updateFaction(players, p.factionId, stripTribute);
    // vassal-loss penalty (section 8): the revolting vassal gains +1/+1
    // over the former lord (relation counters only grow). A held reading
    // doubles this parting blow like any other Might/Status gain.
    relations = bumpStatusBy(
      bumpMightBy(relations, p.factionId, former, mult), p.factionId, former, mult,
    );
    events.push({
      turn: state.turn, playerId: p.id, type: "reclaimed", cardId,
      targetFactionId: p.factionId, overlordFactionId: former,
      ...(doubled ? { doubled: true } : {}),
    });
  } else if (cardId === "pay-tribute") {
    const lord = overlords.get(p.factionId);
    if (lord === undefined || tributeTrack === undefined) return state;
    const beneficiaries = [
      lord,
      ...state.factionIds.filter((f) => incorporated[f] === lord),
    ];
    // Pay tribute is deliberately in the doubling set: holding a reading
    // while subjugated doubles what you pay, which is the cost of hoarding it.
    const bump = tributeTrack === "might" ? bumpMightBy : bumpStatusBy;
    for (const b of beneficiaries) {
      relations = bump(relations, b, p.factionId, mult);
    }
    events.push({
      turn: state.turn, playerId: p.id, type: "tribute",
      targetFactionId: p.factionId, overlordFactionId: lord,
      track: tributeTrack,
    });
  }

  if (prevented) events[0] = { ...events[0], prevented: true };
  if (doubled) events[0] = { ...events[0], doubled: true };

  // learning hook: enemy non-basic cards witnessed by the human
  let seenThisRun = state.seenThisRun;
  const human = players[0];
  if (
    state.humanSeat !== null &&
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
  // Defeat is checked before victory; the spec notes the two cannot coincide.
  // A rival unification is checked last, so a play that wins for the human is
  // never mistaken for one that loses to somebody else.
  const seat = state.humanSeat;
  const humanFaction = seat === null ? null : players[seat].factionId;
  const winSize = victoryRealmSize(state.factionIds.length);
  if (humanFaction !== null && incorporated[humanFaction] !== undefined) {
    phase = "defeat";
    events.push({
      turn: state.turn, playerId: p.id, type: "defeat",
      targetFactionId: humanFaction,
      overlordFactionId: incorporated[humanFaction],
    });
  } else if (
    humanFaction !== null &&
    realmOf(humanFaction, overlords, incorporated).length >= winSize
  ) {
    phase = "victory";
    events.push({ turn: state.turn, playerId: p.id, type: "victory" });
  } else {
    const unifier = state.factionIds.find(
      (f) =>
        f !== humanFaction &&
        !(f in incorporated) &&
        realmOf(f, overlords, incorporated).length >= winSize,
    );
    if (unifier !== undefined) {
      // "defeat" is simply the terminal non-victory phase. With no human seat
      // no screen renders it; with one, the human has lost the map.
      phase = "defeat";
      events.push({
        turn: state.turn, playerId: p.id, type: "unified",
        overlordFactionId: unifier,
      });
    }
  }

  return {
    ...state, phase, players, relations, overlords, incorporated,
    alliances, diplomacyBoost, bodyguards, omens, rulers, seenThisRun,
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

/** Moves to the next living player after a completed turn. An incorporated
 *  seat is skipped, except the human seat, which always gets its turn - in the
 *  shipped game it is never incorporated without the game ending anyway. The
 *  turn counter bumps on wrap. */
export function advance(state: GameState, rng: Rng): GameState {
  if (state.phase !== "playing" || !state.playedThisTurn) return state;
  const inert = (i: number): boolean =>
    state.players[i].factionId in state.incorporated;
  let current = state.current;
  let turn = state.turn;
  for (let tried = 0; tried < state.players.length; tried++) {
    current = (current + 1) % state.players.length;
    if (current === 0) turn += 1;
    if (current === state.humanSeat || !inert(current)) {
      return beginTurn({ ...state, current, turn }, rng);
    }
  }
  // Unreachable while a game is playing: a unification ends the run long
  // before every seat is incorporated. Throwing beats spinning.
  throw new Error("advance: no living seat to move to");
}

export function isHumanTurn(state: GameState): boolean {
  return state.phase === "playing" && state.current === 0;
}
