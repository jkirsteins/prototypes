import {
  buildDeck, buildAiDeck, shuffle, isTributeCard, CARDS, DECK_SIZE,
  TRIBUTE_CARDS, type Rng, type TributeTrack,
} from "./cards";

export type { TributeTrack };
import {
  allianceKey, bumpMight, bumpMightAllBy, bumpMightBy, bumpStatus, bumpStatusBy,
  fullRealmOf, leadsOf, levelStatus,
  type Incorporated, type Overlords, type Relations,
} from "./relations";
import {
  loyaltyKey, incorporationChance, subjugationChance,
  isDoubled, passiveFortifyFor, playableSet, raidGainFor, validTargetsFor,
  type RulesView,
} from "./playability";
import { initialRulers, replaceRuler, rulerOf, type Rulers } from "./rulers";

export type GameEventType =
  | "draw" | "play" | "reshuffle" | "discard"
  | "subjugated" | "released" | "incorporated" | "reclaimed" | "tribute"
  | "settled" | "seeded" | "garrisoned"
  | "subjugate-failed" | "incorporate-failed"
  | "victory" | "defeat" | "unified" | "surrendered" | "stranded";

export interface GameEvent {
  turn: number;
  playerId: number; // 1 = human
  type: GameEventType;
  cardId?: string; // draw, play, discard, reclaimed (which card freed them)
  targetFactionId?: string;
  overlordFactionId?: string;
  formerOverlordFactionId?: string; // subjugated: prior lord of the target
  /** Which track `amount` moved. Absent where the event moves both tracks (a
   *  poach or revolt penalty is +1/+1 by rule) or moves nothing. */
  track?: "status" | "might";
  /** How far this event moved a relation counter, from the ACTOR's side (the
   *  playerId this event belongs to) - written at every site that bumps a
   *  relation, so src/standings.ts can reconstruct a before -> after standing
   *  without re-deriving the rules from state that has already moved on.
   *  Assassinate ruler is the exception: it levels rather than adds, and
   *  `amount` records the actor's Status LEAD over the target immediately
   *  before the levelling, so the "before" survives the reset that erased it.
   *  See the rule in AGENTS.md: a ninth site that forgets this drifts the
   *  round summary silently, which is why tests/standings.test.ts replays a
   *  full game and checks the walk against the real relations. */
  amount?: number;
  prevented?: boolean; // play: a nullified Assassinate ruler (Bodyguard)
  doubled?: boolean; // play, reclaimed: a card whose numbers a reading doubled
  /** This event was caused by the play it was logged with - the log indents it
   *  under that play's line. Set by `appendEvents` off the shape of the batch,
   *  never by a card branch; see the comment there. */
  consequence?: boolean;
  actorRuler?: string; // ruler of the acting faction when this was logged
  targetRuler?: string; // assassinate: the ruler in the crosshairs
  successorRuler?: string; // assassinate: set only when the killing landed
}

export type GamePhase =
  | "main-menu" | "deck-building" | "pick-faction" | "playing"
  | "victory" | "defeat";


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
  /** `${land}|${lord}` -> consecutive turns that lord has held that land.
   *  Ticked in `beginTurn`, read by the Incorporate odds. */
  loyalty: Record<string, number>;
  diplomacyBoost: string[]; // faction ids holding an unused Extended diplomacy
  bodyguards: string[]; // faction ids holding an unused Bodyguard guard
  omens: string[]; // faction ids holding an unspent Favourable omens reading
  /** Factions whose land has a site still free to settle - map-derived and
   *  static, like `adjacency`. Faction ids, not the map's region ids. A faction
   *  absent here can never be built in. */
  sites: string[];
  /** Factions whose land has been settled, in the order founded. */
  settled: string[];
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
    diplomacyBoost: state.diplomacyBoost,
    sites: state.sites,
    settled: state.settled,
    loyalty: state.loyalty,
    liveRevolts: state.players
      .filter((pl) =>
        pl.deck.includes("revolt") || pl.hand.includes("revolt") ||
        pl.discard.includes("revolt"))
      .map((pl) => pl.factionId),
  };
}

export function newGame(
  factionIds: string[],
  adjacency?: Record<string, string[]>,
  ethnicities: Record<string, string> = {},
  /** Faction ids whose land has a free site, from the map. Defaults to every
   *  faction, the same way `adjacency` defaults to a complete graph: tests get
   *  a world where Found a settlement is playable everywhere unless they say
   *  otherwise. */
  sites?: string[],
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
    loyalty: {},
    diplomacyBoost: [],
    bodyguards: [],
    omens: [],
    sites: sites ?? [...factionIds],
    settled: [],
    ethnicities,
    rulers: initialRulers(factionIds, ethnicities),
    humanSeat: 0,
    adjacency:
      adjacency ??
      Object.fromEntries(
        factionIds.map((id) => [id, factionIds.filter((o) => o !== id)]),
      ),
    humanDeck: buildDeck(),
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

/** Whether this kind of event, when a play caused it, reads as that play's
 *  sub-item in the log. Endings are the exception: a play can win or lose the
 *  run, but the run's last line is a headline, not something indented under a
 *  card.
 *
 *  An exhaustive switch with no `default`, like `eventSegments` in src/hud.ts:
 *  a new `GameEventType` stops compiling here until somebody decides which it
 *  is. */
function nestsUnderItsPlay(type: GameEventType): boolean {
  switch (type) {
    // Never a consequence: the play itself, and the pile bookkeeping that
    // begins or ends a turn rather than following from a card.
    case "play":
    case "draw":
    case "reshuffle":
    case "discard":
    // The run is over. See above.
    case "victory":
    case "defeat":
    case "unified":
    case "surrendered":
    case "stranded":
      return false;
    case "subjugated":
    case "released":
    case "incorporated":
    case "reclaimed":
    case "tribute":
    case "settled":
    case "seeded":
    case "garrisoned":
    case "subjugate-failed":
    case "incorporate-failed":
      return true;
  }
}

/** The one place `actorRuler` is filled, and the one place a consequence is
 *  tied to the play that caused it. Every append to the log goes through here,
 *  so a new event type cannot ship unstamped, and the name recorded is the one
 *  the actor's ruler held at the time.
 *
 *  `playCard` builds one batch per play with the `play` event first and pushes
 *  everything that play caused onto it, and no other caller starts a batch with
 *  a `play` - `beginTurn` starts with a draw or a reshuffle, `surrender` and
 *  `discardCard` append one event. So "caused by this play" is exactly "not
 *  first in a batch that starts with a play", and reading it off the batch's
 *  shape here is what keeps it out of all fourteen card branches, where it
 *  would drift. */
function appendEvents(state: GameState, events: GameEvent[]): GameEvent[] {
  const causedByPlay = events[0]?.type === "play";
  return [
    ...state.log,
    ...events.map((e, i) => ({
      ...e,
      actorRuler: actorRulerName(state, e.playerId),
      // Omitted rather than set false, so an event that is nobody's consequence
      // carries the shape it always did.
      ...(causedByPlay && i > 0 && nestsUnderItsPlay(e.type)
        ? { consequence: true }
        : {}),
    })),
  ];
}

function actorRulerName(state: GameState, playerId: number): string {
  const factionId = state.players.find((pl) => pl.id === playerId)?.factionId;
  return factionId === undefined ? "" : rulerOf(state.rulers, factionId).name;
}

/** Current player draws 1 (reshuffle rule); resets the play flag. */
/** One tick of the loyalty clock for the faction about to act. The pair it is
 *  currently held by rises; every other pair for that land decays toward 0, so
 *  an ex-lord's investment fades and a poacher starts from near nothing rather
 *  than inheriting the grip its rival built. Keys that reach 0 are deleted so
 *  the record stays the size of the vassalages actually in play. */
function tickLoyalty(state: GameState, land: string): Record<string, number> {
  const lord = state.overlords.get(land);
  const held = lord === undefined ? null : loyaltyKey(land, lord);
  const out: Record<string, number> = {};
  for (const [key, turns] of Object.entries(state.loyalty)) {
    if (!key.startsWith(`${land}|`) || key === held) {
      out[key] = turns;
    } else if (turns > 1) {
      out[key] = turns - 1;
    }
  }
  if (held !== null) out[held] = (state.loyalty[held] ?? 0) + 1;
  return out;
}

export function beginTurn(state: GameState, rng: Rng): GameState {
  if (state.players.length === 0) return state;
  const p = state.players[state.current];
  let { deck, discard } = p;
  const events: GameEvent[] = [];
  if (deck.length === 0 && discard.length > 0) {
    deck = shuffle(discard, rng);
    discard = [];
    events.push({ turn: state.turn, playerId: p.id, type: "reshuffle" });
  }
  let hand = p.hand;
  if (deck.length > 0) {
    events.push({ turn: state.turn, playerId: p.id, type: "draw", cardId: deck[0] });
    hand = [...hand, deck[0]];
    deck = deck.slice(1);
  }
  const updated = { ...p, deck, hand, discard };
  const players = state.players.map((pl, i) =>
    i === state.current ? updated : pl,
  );
  // Annexed lands earn their owner a standing Might gain against everyone.
  // Applied here rather than through the card path on purpose: that path
  // consults `mult`, and a garrison must never eat the Favourable omens reading
  // the player was saving for a Raid. One event carrying the whole amount, not
  // one per land, or a fourteen-land realm writes fourteen log lines a round.
  let relations = state.relations;
  const passive = passiveFortifyFor(viewOf(state), p.factionId);
  if (passive > 0) {
    const living = state.factionIds.filter(
      (f) => f !== p.factionId && !(f in state.incorporated),
    );
    relations = bumpMightAllBy(relations, p.factionId, living, passive);
    events.push({
      turn: state.turn, playerId: p.id, type: "garrisoned",
      targetFactionId: p.factionId, amount: passive,
    });
  }
  return {
    ...state, players, relations, loyalty: tickLoyalty(state, p.factionId),
    log: appendEvents(state, events), playedThisTurn: false,
  };
}

/** The player concedes. Terminal, and deliberately not reversible: an early
 *  position with nothing playable can drag for tens of turns, and the honest
 *  answer is to let it end rather than to make the player click through it.
 *
 *  Its own event type rather than reusing `defeat`, because `defeat` carries an
 *  `overlordFactionId` and the postmortem builds a killer-versus-you comparison
 *  out of it. Nobody killed you here. */
export function surrender(state: GameState): GameState {
  if (state.phase !== "playing") return state;
  const p = state.players[state.current];
  return {
    ...state,
    phase: "defeat",
    log: appendEvents(state, [
      { turn: state.turn, playerId: p?.id ?? 1, type: "surrendered" },
    ]),
  };
}

/** A pending Revolt never outlives the vassalage it was sown in, for the same
 *  reason the tribute cards do not: otherwise a freed or poached faction carries a
 *  live Revolt into its next vassalage and the pre-loaded escape is back. */
const stripRevolt = (p: PlayerState): PlayerState => ({
  ...p,
  deck: p.deck.filter((c) => c !== "revolt"),
  hand: p.hand.filter((c) => c !== "revolt"),
  discard: p.discard.filter((c) => c !== "revolt"),
});

/** Both injected cards leave together on every exit from vassalage. */
const stripVassalCards = (p: PlayerState): PlayerState =>
  stripRevolt(stripTribute(p));

const stripTribute = (p: PlayerState): PlayerState => ({
  ...p,
  deck: p.deck.filter((c) => !isTributeCard(c)),
  hand: p.hand.filter((c) => !isTributeCard(c)),
  discard: p.discard.filter((c) => !isTributeCard(c)),
});

/** A vassal holding neither a live Revolt nor a Seeds of revolt can never free
 *  itself by its own play: Revolt is the only card that ends a vassalage from
 *  below, and Seeds of revolt is the only route to a Revolt.
 *
 *  Scanning all three piles is enough because the piles only ever cycle: a
 *  played card goes to the discard and `beginTurn` reshuffles the discard back,
 *  and `stripVassalCards` directly above is the ONLY thing in the game that
 *  removes a card - and it removes tribute and Revolt, never Seeds of
 *  revolt. So a Seeds anywhere in the piles will come round again, and a player
 *  poached out of a live Revolt still holds the Seeds that sowed it.
 *
 *  Being freed by a third party toppling your lord is a real escape, but it is
 *  not one this player can reach for, and while they wait every turn is a
 *  forced tribute or a forced discard. The run is over; say so. */
export function isStranded(
  player: PlayerState,
  overlords: Overlords,
): boolean {
  if (!overlords.has(player.factionId)) return false;
  return ![...player.deck, ...player.hand, ...player.discard].some(
    (c) => c === "revolt" || c === "seeds-of-revolt",
  );
}

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

  let relations = state.relations;
  const overlords = new Map(state.overlords);
  let incorporated = state.incorporated;
  let alliances = state.alliances;
  let diplomacyBoost = state.diplomacyBoost;
  let bodyguards = state.bodyguards;
  let omens = state.omens;
  let settled = state.settled;
  let rulers = state.rulers;
  const doubled = isDoubled(state, p.factionId, cardId);
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
        players = updateFaction(players, vassal, stripVassalCards);
        events.push({
          turn: state.turn, playerId: p.id, type: "released",
          targetFactionId: vassal, overlordFactionId: lord,
        });
      }
    }
  };

  if (cardId === "raid" && targetId !== undefined) {
    // Through `raidGainFor` rather than `raidYield * mult`: the card tip and
    // the map preview quote the same call, so the promise and the resolution
    // cannot drift apart.
    const { gain } = raidGainFor(viewOf(state), p.factionId, targetId);
    relations = bumpMightBy(relations, p.factionId, targetId, gain);
    events[0] = { ...events[0], amount: gain, track: "might" };
  } else if (cardId === "shrewd-marriage" && targetId !== undefined) {
    relations = bumpStatusBy(relations, p.factionId, targetId, mult);
    events[0] = { ...events[0], amount: mult, track: "status" };
  } else if (cardId === "fortify") {
    const living = state.factionIds.filter(
      (f) => f !== p.factionId && !(f in incorporated),
    );
    relations = bumpMightAllBy(relations, p.factionId, living, mult);
    events[0] = { ...events[0], amount: mult, track: "might" };
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
      // Captured before assassinate() levels it away: the "before" of a
      // standings line has to come from somewhere once the reset erases it.
      const preStatusLead = leadsOf(relations, p.factionId, targetId).status;
      const out = assassinate(state, rulers, relations, p.factionId, targetId);
      relations = out.relations;
      rulers = out.rulers;
      events[0] = {
        ...events[0],
        targetRuler: out.killed,
        successorRuler: out.successor,
        amount: preStatusLead,
        track: "status",
      };
    }
  } else if (cardId === "found-settlement" && targetId !== undefined) {
    // The settlement belongs to the land, not to whoever founded it: a vassal's
    // land settled by its overlord keeps the settlement when the vassal leaves,
    // and takes the grip with it. That is the risk the card offers.
    settled = [...settled, targetId];
    events.push({
      turn: state.turn, playerId: p.id, type: "settled",
      targetFactionId: targetId,
    });
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
  } else if (
    cardId === "subjugate" && targetId !== undefined &&
    rng() >= subjugationChance(viewOf(state), targetId)
  ) {
    // A poach that missed. The card is spent and the turn is gone, but the
    // lead that justified it is untouched, so the next copy drawn can try
    // again. Taking a free faction never reaches this branch.
    events.push({
      turn: state.turn, playerId: p.id, type: "subjugate-failed",
      targetFactionId: targetId, overlordFactionId: p.factionId,
      formerOverlordFactionId: state.overlords.get(targetId),
    });
  } else if (cardId === "subjugate" && targetId !== undefined) {
    const formerLord = overlords.get(targetId);
    freeVassalsOf(targetId);
    overlords.set(targetId, p.factionId);
    players = updateFaction(players, targetId, (pl) => {
      const clean = stripVassalCards(pl);
      return {
        ...clean,
        deck: shuffle([...clean.deck, ...Object.keys(TRIBUTE_CARDS)], rng),
      };
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
  } else if (
    cardId === "incorporate" && targetId !== undefined &&
    rng() >= incorporationChance(state, p.factionId, targetId)
  ) {
    // The vassal is not digested yet. The card is spent and the turn is gone;
    // the vassalage survives and its loyalty clock keeps running, so the next
    // attempt is likelier. Spending the card is what makes a low roll a real
    // decision rather than a delay.
    events.push({
      turn: state.turn, playerId: p.id, type: "incorporate-failed",
      targetFactionId: targetId, overlordFactionId: p.factionId,
    });
  } else if (cardId === "incorporate" && targetId !== undefined) {
    overlords.delete(targetId);
    freeVassalsOf(targetId); // defensive: chains never exist
    incorporated = { ...incorporated, [targetId]: p.factionId };
    for (const [land, owner] of Object.entries(incorporated)) {
      if (owner === targetId) incorporated = { ...incorporated, [land]: p.factionId };
    }
    players = updateFaction(players, targetId, stripVassalCards);
    events.push({
      turn: state.turn, playerId: p.id, type: "incorporated",
      targetFactionId: targetId, overlordFactionId: p.factionId,
    });
  } else if (cardId === "seeds-of-revolt") {
    // Shuffle a live Revolt into the vassal's remaining deck. The wait for it
    // to surface is the whole point: the delay comes out of the deck rather
    // than out of a constant, and it differs every vassalage.
    players = updateFaction(players, p.factionId, (pl) => ({
      ...pl, deck: shuffle([...pl.deck, "revolt"], rng),
    }));
    events.push({
      turn: state.turn, playerId: p.id, type: "seeded", cardId,
      targetFactionId: p.factionId,
      overlordFactionId: state.overlords.get(p.factionId),
    });
  } else if (cardId === "revolt") {
    const former = overlords.get(p.factionId);
    if (former === undefined) return state;
    overlords.delete(p.factionId);
    players = updateFaction(players, p.factionId, stripVassalCards);
    // vassal-loss penalty (section 8): the revolting vassal gains +1/+1
    // over the former lord (relation counters only grow). A held reading
    // doubles this parting blow like any other Might/Status gain.
    relations = bumpStatusBy(
      bumpMightBy(relations, p.factionId, former, mult), p.factionId, former, mult,
    );
    events.push({
      turn: state.turn, playerId: p.id, type: "reclaimed", cardId,
      targetFactionId: p.factionId, overlordFactionId: former, amount: mult,
      ...(doubled ? { doubled: true } : {}),
    });
  } else if (isTributeCard(cardId)) {
    const lord = overlords.get(p.factionId);
    if (lord === undefined) return state;
    // Which track this card pays is the card's own business - see TRIBUTE_CARDS.
    const tributeTrack = TRIBUTE_CARDS[cardId];
    const beneficiaries = [
      lord,
      ...state.factionIds.filter((f) => incorporated[f] === lord),
    ];
    // Tribute is deliberately in the doubling set: holding a reading
    // while subjugated doubles what you pay, which is the cost of hoarding it.
    const bump = tributeTrack === "might" ? bumpMightBy : bumpStatusBy;
    for (const b of beneficiaries) {
      relations = bump(relations, b, p.factionId, mult);
    }
    events.push({
      turn: state.turn, playerId: p.id, type: "tribute",
      targetFactionId: p.factionId, overlordFactionId: lord,
      track: tributeTrack, amount: mult,
    });
  }

  if (prevented) events[0] = { ...events[0], prevented: true };
  if (doubled) events[0] = { ...events[0], doubled: true };

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
  } else if (seat !== null && isStranded(players[seat], overlords)) {
    // A vassalage with no way out is over even though the map has not moved.
    // Reading the LOCAL players and overlords rather than `state` matters: both
    // are the copies this play has already mutated, so the ending lands on the
    // Subjugate that caused it rather than one play later. This is also why
    // playCard is the only site that needs the check - it is the only place a
    // card is ever removed from a pile or an overlord ever recorded.
    // Deliberately human-only, like its neighbours: an AI vassal with no escape
    // keeps paying tribute, which is the world working as it always has.
    phase = "defeat";
    events.push({
      turn: state.turn, playerId: p.id, type: "stranded",
      targetFactionId: players[seat].factionId,
      overlordFactionId: overlords.get(players[seat].factionId),
    });
  } else if (
    humanFaction !== null &&
    // `fullRealmOf`, not `realmOf`: a land your vassal annexed is a land you
    // hold, and the map has always drawn it that way. It also keeps this branch
    // ahead of the unification one below by construction - the human's full
    // realm is a superset of any of its vassals', so a vassal can never unify
    // the Balts out from under the seat that owns it.
    fullRealmOf(humanFaction, overlords, incorporated).size >= winSize
  ) {
    phase = "victory";
    events.push({ turn: state.turn, playerId: p.id, type: "victory" });
  } else {
    const unifier = state.factionIds.find(
      (f) =>
        f !== humanFaction &&
        !(f in incorporated) &&
        fullRealmOf(f, overlords, incorporated).size >= winSize,
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
    alliances, diplomacyBoost, bodyguards, omens, settled, rulers,
    log: appendEvents(state, events), playedThisTurn: true,
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
    log: appendEvents(state, [
      { turn: state.turn, playerId: p.id, type: "discard", cardId },
    ]),
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
