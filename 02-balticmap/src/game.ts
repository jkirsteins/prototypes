import {
  buildDeck, buildAiDeck, shuffle, guardAgainst, isGuardCard, isTributeCard,
  AI_DECK_GUARANTEED, CARDS, DECK_SIZE, FAN_OUT_CARDS, TRIBUTE_CARDS,
  type Rng,
} from "./cards";

import {
  allianceKey, bumpMight, bumpMightAllBy, bumpMightBy,
  fullRealmOf, getRel, incorporatedRealmOf, leadOf, levelMight, resetMight,
  type Alliances, type Incorporated, type Overlords, type Relations,
} from "./relations";
import {
  ESCAPE_RESPITE_TURNS, HOSTAGE_RETURN_TRIBUTES,
  leadsIn, PACT_MIGHT_BONUS, sharedNeighboursOf,
  type Guards, type Omens, omenMultiplier, passiveFortifyFor,
  playableSet, raidGainFor, seatOf, validTargetsFor, wealthIncomeFor,
  type RulesView,
} from "./playability";
import {
  autoHarvestChoice, empowerableCards, harvestSubjugateTargets,
  harvestSwapPool, type HarvestChoice,
} from "./harvest";
import { DEFAULT_DEFENSE_MAX, type Defense, type Disease } from "./defense";
import { initialRulers, leadershipByFaction, replaceRuler, rulerOf, type Rulers } from "./rulers";
import { allowsDiscards, copiesAllowed, DEFAULT_RULES, type RuleSelections } from "./rules";
import { sweepLapsed } from "./timed";
import { harvestMultiplier, harvestsEarned, runTurnips } from "./xp";

export type GameEventType =
  | "draw" | "play" | "reshuffle" | "discard"
  | "subjugated" | "released" | "incorporated" | "reclaimed" | "tribute"
  | "settled" | "seeded" | "garrisoned" | "pact-lapsed"
  | "seat-moved" | "seat-lost"
  | "hostage-taken" | "hostage-returned"
  | "harvest-earned" | "harvest-traded" | "harvest-might" | "harvest-wealth"
  | "empowered"
  | "victory" | "defeat" | "unified" | "surrendered" | "stranded";

export interface GameEvent {
  turn: number;
  playerId: number; // 1 = human
  type: GameEventType;
  cardId?: string; // draw, play, discard, reclaimed (which card freed them)
  targetFactionId?: string;
  /** Usually the lord an event happened under. On the fan-out events (a
   *  Fortify `play`, `garrisoned`) it is the actor's DIRECT overlord the
   *  fan-out SKIPPED - frozen on the event because the standings walk runs
   *  after the batch, when the overlord may already have changed (the same
   *  reason `pactAgainst` is frozen). Absent when the actor was free. */
  overlordFactionId?: string;
  formerOverlordFactionId?: string; // subjugated: prior lord of the target
  /** How far this event moved the Might counter, from the ACTOR's side (the
   *  playerId this event belongs to) - written at every site that bumps a
   *  relation, so src/standings.ts can reconstruct a before -> after standing
   *  without re-deriving the rules from state that has already moved on.
   *  Absent where the event moved no counter (the poach penalty is +1 by
   *  rule and carried by no field).
   *  Two exceptions move the store without adding. Assassinate ruler levels,
   *  and `amount` records the actor's visible Might LEAD over the target
   *  (pact terms included, via `leadsIn`) immediately before the levelling,
   *  so the "before" survives the reset that erased it. `subjugated` clears
   *  the new vassal's counter against its new lord (`resetMight`), and
   *  `amount` is the cleared value - which is exactly how far the actor's
   *  lead over the vassal rose - beside the un-carried +1 poach penalty.
   *  See the rule in AGENTS.md: a ninth site that forgets this drifts the
   *  round summary silently, which is why tests/standings.test.ts replays a
   *  full game and checks the walk against the real relations. */
  amount?: number;
  /** tribute: the coins this payment moved from the vassal to its lord.
   *  Deliberately not `amount` - that means "moved the Might counter", which
   *  the coins never do - so a fully-covered payment carries `wealth` alone,
   *  and a part-covered one carries `wealth` beside the `amount` of its
   *  uncovered remainder. The log suffix renders it; the standings walk
   *  reads only `amount` and so never sees it. */
  wealth?: number;
  /** play: the card was turned aside by the target's guard (see `GUARDS` in
   *  src/cards.ts) and did nothing. Also what `revealedSecrets` reads to decide
   *  that the guard which stopped it is no longer a secret. */
  prevented?: boolean;
  /** play (alliance) and pact-lapsed: the factions the pact buys BOTH allies a
   *  Might lead over, frozen when it was sealed. The two allies are the actor
   *  and `targetFactionId` on the play, and the actor and `targetFactionId` on
   *  the lapse.
   *
   *  Carried on the event rather than looked up, because a lapse deletes the
   *  pact it is reporting - and because it is what lets `leadMovesOf` resolve a
   *  fan-out exactly in BOTH directions, which Fortify's cannot: this list says
   *  who was affected, so the walk never has to guess who was alive. */
  pactAgainst?: string[];
  /** play, reclaimed: how many Favourable omens readings this play cashed, so
   *  the log can say by how much. A count rather than the boolean it replaced,
   *  because readings stack: two of them quadruple, and "doubled" could not
   *  tell that from one. Absent when no reading was spent. */
  readings?: number;
  /** play: this card was empowered (the harvest boon) and its effect resolved
   *  twice. The log suffix; `amount`, where the branch records one, already
   *  carries the doubled total. */
  empowered?: boolean;
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
  /** The build this seat plays and harvests from. The human picks on the
   *  build screen; AI seats roll theirs, seeded, in `pickFaction`. */
  strategy: "warpath" | "pestilence";
  deck: string[];
  hand: string[];
  discard: string[];
}

export interface GameState {
  phase: GamePhase;
  turn: number; // 1-based
  players: PlayerState[]; // index 0 = human
  current: number;
  /** True once this turn is complete: a standard turn's one play or discard,
   *  or an unlimited turn's explicit endTurn. `advance` refuses to move on
   *  until it is set. */
  playedThisTurn: boolean;
  /** One pick per rule axis, stamped before the game starts and immutable for
   *  the run. `chooseRules` is the only writer. See src/rules.ts. */
  rules: RuleSelections;
  factionIds: string[];
  relations: Relations;
  overlords: Overlords; // STORED vassal -> overlord map
  incorporated: Incorporated;
  adjacency: Record<string, string[]>;
  alliances: Alliances; // sorted-pair key -> the pact between that pair
  diplomacyBoost: string[]; // faction ids holding an unused Extended diplomacy
  guards: Guards; // guard card id -> faction ids holding it unspent
  omens: Omens; // faction id -> unspent Favourable omens readings held
  /** Faction id -> how many FURTHER settlements the map authors for that land
   *  (its locked dots, i.e. `maxSettlements - 1`). Map-derived and static, like
   *  `adjacency`; faction ids, not the map's region ids. Absent or 0 means the
   *  land can never be built in again. */
  siteCaps: Record<string, number>;
  /** Faction id -> settlements FOUNDED in that land this game. Absent = 0.
   *
   *  The one settlement every land starts with is deliberately not counted:
   *  it would add the same +1 to every land's Might bar, which is no rule at
   *  all. `settlementsIn` in src/playability.ts is where the standing one is
   *  added back, and only for the allowance check. */
  settlements: Record<string, number>;
  /** Faction id -> unspent Population boom readings, each one allowing a
   *  settlement past what the land would otherwise support. Absent = 0, and
   *  shaped like `omens` for the same reason: they stack. */
  booms: Record<string, number>;
  /** Vassal faction id -> tribute payments still owed before the hostage taken
   *  from it goes home. See `RulesView.hostages` for the shape's reasoning;
   *  `playCard` is the only writer, and every exit from vassalage deletes the
   *  entry so it can never outlive the vassalage that justified it. */
  hostages: Record<string, number>;
  /** Faction id -> treasury. Absent = 0, never negative, uncapped. Earned in
   *  `beginTurn` - 1 per settlement standing in the faction's own realm, via
   *  `wealthIncomeFor` - silently: income moves no relation counter, so no
   *  walk needs it, and one log line per faction per round is exactly the
   *  noise the log filter exists to remove. The HUD's own-faction readout is
   *  where the number lives. Spent in `playCard`, on costed cards
   *  (`CardDef.wealthCost`) and on tribute. */
  wealth: Record<string, number>;
  /** Faction id -> the turn its post-escape respite expires. Set the moment a
   *  faction ESCAPES vassalage - Revolt, or freed because its lord fell -
   *  never when it is merely poached, and while it runs nobody may Subjugate
   *  it (see `ESCAPE_RESPITE_TURNS`). Bare expiry on the src/timed.ts clock;
   *  swept silently in `beginTurn`, because a lapse moves no relation counter
   *  and the badge already counted it down. `respiteExpiry` is the only
   *  reader, so the sweep is hygiene rather than correctness. */
  respites: Record<string, number>;
  /** Owner faction id -> the land its ruler's seat stands on (Seat of power).
   *  Written by the seat-of-power branch in `playCard`; read only through
   *  `seatOf` in src/playability.ts, which also says when an entry is inert.
   *  Swept in `beginTurn` with a `seat-lost` event, so the log agrees with
   *  the vanished map marker. Permanent until moved or lost - deliberately
   *  not on the src/timed.ts clock. */
  seats: Record<string, string>;
  /** The card the harvest's empower boon marked, or null. Its next play by
   *  the human resolves twice (see `playCard`), which consumes the mark.
   *  Human-only by construction: only the empower boon writes it, and only
   *  the human seat ever earns a harvest. */
  empoweredCardId: string | null;
  /** Polygon id -> current defense, present only while damaged (absent = at
   *  `defenseMax`). See src/defense.ts for the store's conventions. */
  defense: Defense;
  /** Polygon id -> static ceiling, `population / 50` on the real map.
   *  Map-derived like `adjacency` and `siteCaps`; `DEFAULT_DEFENSE_MAX` for
   *  every faction in a world nobody handed a map to. */
  defenseMax: Record<string, number>;
  /** Polygon id -> owner faction id -> disease stacks. Owned per rival, so
   *  two factions can sicken the same polygon without touching each other's
   *  counts. */
  disease: Disease;
  /** Faction id -> unspent Miasma readings - the Plague reserve, shaped like
   *  `omens` for the same stacking reason. */
  miasma: Readonly<Record<string, number>>;
  /** Faction id -> Grow turnips plays since the last Turnip harvest was
   *  earned. Stored rather than log-derived because EVERY seat counts now,
   *  and a per-play log walk per seat buys nothing. Reset to 0 at the
   *  threshold. */
  turnips: Record<string, number>;
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

/** The hand the unlimited turn structure refills to at turn start: the hand a
 *  standard-rules player decides with, i.e. the opening hand plus the one
 *  turn-start draw. */
export const HAND_REFILL = OPENING_HAND + 1;

/** Further settlements a land gets in a world nobody handed a map to. Three, so
 *  a defaulted test world can exercise the base allowance AND a boom past it -
 *  a cap of 1 would have made every Population boom test unreachable without
 *  passing a map in. The real map hands `siteCaps` in from `maxSettlements`,
 *  where the smallest land offers 1 and the largest 8. */
export const DEFAULT_SITE_CAP = 3;

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
    guards: state.guards,
    omens: state.omens,
    diplomacyBoost: state.diplomacyBoost,
    siteCaps: state.siteCaps,
    settlements: state.settlements,
    booms: state.booms,
    hostages: state.hostages,
    wealth: state.wealth,
    respites: state.respites,
    seats: state.seats,
    defense: state.defense,
    defenseMax: state.defenseMax,
    disease: state.disease,
    miasma: state.miasma,
    turnips: state.turnips,
    leadership: leadershipByFaction(state.rulers),
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
  /** Faction id -> further settlements the map authors for that land, i.e. its
   *  locked dots. Defaults to `DEFAULT_SITE_CAP` for every faction, the same
   *  way `adjacency` defaults to a complete graph: tests get a world where
   *  Found a settlement is playable everywhere unless they say otherwise, and
   *  where a boom has something to spend itself on. */
  siteCaps?: Record<string, number>,
  /** Faction id -> the polygon's defense ceiling, `population / 50` on the
   *  real map. Defaults every faction to `DEFAULT_DEFENSE_MAX`, the same way
   *  `siteCaps` defaults: tests get polygons both gates are reachable on. */
  defenseMax?: Record<string, number>,
): GameState {
  return {
    phase: "main-menu",
    turn: 1,
    players: [],
    current: 0,
    playedThisTurn: false,
    rules: { ...DEFAULT_RULES },
    factionIds,
    relations: {},
    overlords: new Map(),
    incorporated: {},
    alliances: {},
    diplomacyBoost: [],
    guards: {},
    omens: {},
    siteCaps:
      siteCaps ??
      Object.fromEntries(factionIds.map((id) => [id, DEFAULT_SITE_CAP])),
    settlements: {},
    booms: {},
    defense: {},
    defenseMax:
      defenseMax ??
      Object.fromEntries(factionIds.map((id) => [id, DEFAULT_DEFENSE_MAX])),
    disease: {},
    miasma: {},
    turnips: {},
    hostages: {},
    wealth: {},
    respites: {},
    seats: {},
    empoweredCardId: null,
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

/** Locks in the rule picks. Legal only while deck-building, like the deck
 *  itself: everything after `pickFaction` - the AI chain, the log, the
 *  animations - may branch on an axis, so a mid-run swap could contradict
 *  what the player has already seen happen. */
export function chooseRules(
  state: GameState, rules: RuleSelections,
): GameState {
  if (state.phase !== "deck-building") return state;
  return { ...state, rules: { ...rules } };
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
    strategy: "warpath",
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
  aiDeckFor: (rng: Rng, factionId: string) => string[] = (r) =>
    buildAiDeck(r, AI_DECK_GUARANTEED, copiesAllowed(state.rules)),
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
    // A pact lapsing is the clock running out, not something a card did. It is
    // logged in `beginTurn`, which never opens a batch with a play, so this is
    // unreachable today - but it is the honest answer if that ever changes.
    case "pact-lapsed":
    // The seat sweep is the same kind of clock tick: `seatOf` stopped
    // validating the entry, and the seat whose turn was starting noticed.
    case "seat-lost":
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
    case "seat-moved":
    // The taking follows its play; the return follows the tribute play that
    // paid the debt off.
    case "hostage-taken":
    case "hostage-returned":
    // The bar crossing follows the turnip play that crossed it; the boons and
    // the empower mark follow the harvest play the player picked them on.
    case "harvest-earned":
    case "harvest-traded":
    case "harvest-might":
    case "harvest-wealth":
    case "empowered":
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

/** Pacts the clock has run out on, removed from the record and reported.
 *
 *  It has to be reported at all because a pact carries a Might bonus for both
 *  allies against the neighbours they share (see `Pact`), so a lapse MOVES
 *  leads. An unrecorded move is exactly what drifts the standings walk - the
 *  `amount` rule in CLAUDE.md - and it is also news: hostile cards between the
 *  two of them are legal again. The delete-and-report dedup itself lives on
 *  `sweepLapsed` in src/timed.ts; only the event mapping is pact business.
 *
 *  `playerId` is the seat whose turn is starting, which is whose clock tick
 *  noticed it, and is nobody's doing. The notice reads the two allies off
 *  `targetFactionId` and `overlordFactionId` instead. */
function sweepLapsedPacts(
  state: GameState,
  playerId: number,
): { alliances: Alliances; events: GameEvent[] } {
  const { kept, lapsed } = sweepLapsed(state.alliances, state.turn, (p) => p.expiry);
  const events: GameEvent[] = lapsed.map(([key, pact]) => {
    const [a, b] = key.split("|");
    return {
      turn: state.turn, playerId, type: "pact-lapsed",
      targetFactionId: a, overlordFactionId: b,
      amount: 1, pactAgainst: pact.against,
    };
  });
  return { alliances: kept, events };
}

/** Seat entries `seatOf` no longer validates - the land left its owner's
 *  direct holdings, or the owner was vassalized - removed from the record and
 *  reported, once, as `seat-lost`. Reported at all because the map marker
 *  vanishes with the entry and a log that never said so would contradict what
 *  the player plainly saw. Same delete-and-report shape as
 *  `sweepLapsedPacts`, and the same `playerId` doctrine: the seat whose clock
 *  tick noticed it, nobody's doing. The owner is `targetFactionId`. */
function sweepLapsedSeats(
  state: GameState,
  playerId: number,
): { seats: Record<string, string>; events: GameEvent[] } {
  const view = viewOf(state);
  const lapsed = Object.keys(state.seats).filter(
    (owner) => seatOf(view, owner) === undefined,
  );
  if (lapsed.length === 0) return { seats: state.seats, events: [] };
  const seats = { ...state.seats };
  for (const owner of lapsed) delete seats[owner];
  return {
    seats,
    events: lapsed.map((owner) => ({
      turn: state.turn, playerId, type: "seat-lost", targetFactionId: owner,
    })),
  };
}

/** Current player draws 1 (reshuffle rule); resets the play flag. */
export function beginTurn(state: GameState, rng: Rng): GameState {
  if (state.players.length === 0) return state;
  const p = state.players[state.current];
  let { deck, discard } = p;
  const lapsed = sweepLapsedPacts(state, p.id);
  const lapsedSeats = sweepLapsedSeats(state, p.id);
  const events: GameEvent[] = [...lapsed.events, ...lapsedSeats.events];
  if (deck.length === 0 && discard.length > 0) {
    deck = shuffle(discard, rng);
    discard = [];
    events.push({ turn: state.turn, playerId: p.id, type: "reshuffle" });
  }
  let hand = p.hand;
  if (state.rules.turn === "unlimited") {
    // Refill rather than draw one. Each draw logs the same `draw` event the
    // single-draw path logs, and a deck that runs dry mid-refill reshuffles
    // exactly as it does between turns, so the log needs no new vocabulary.
    while (
      hand.length < HAND_REFILL &&
      (deck.length > 0 || discard.length > 0)
    ) {
      if (deck.length === 0) {
        deck = shuffle(discard, rng);
        discard = [];
        events.push({ turn: state.turn, playerId: p.id, type: "reshuffle" });
      }
      events.push({
        turn: state.turn, playerId: p.id, type: "draw", cardId: deck[0],
      });
      hand = [...hand, deck[0]];
      deck = deck.slice(1);
    }
  } else if (deck.length > 0) {
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
  // consults `mult`, and a garrison must never eat the Favourable omens
  // readings the player was saving for a Raid - a stack of two is two turns of
  // setup, so eating it here would be a silent loss. One event carrying the
  // whole amount, not
  // one per land, or a fourteen-land realm writes fourteen log lines a round.
  let relations = state.relations;
  const passive = passiveFortifyFor(viewOf(state), p.factionId);
  if (passive > 0) {
    // The DIRECT overlord is skipped, exactly as the Fortify fan-out skips
    // it: the revolt gate reads the vassal's lead over its lord, and a tick
    // that reached the lord would open the gate by itself, a turn at a time.
    // The skipped lord rides on the event for the standings walk.
    const lord = state.overlords.get(p.factionId);
    const living = state.factionIds.filter(
      (f) => f !== p.factionId && f !== lord && !(f in state.incorporated),
    );
    relations = bumpMightAllBy(relations, p.factionId, living, passive);
    events.push({
      turn: state.turn, playerId: p.id, type: "garrisoned",
      targetFactionId: p.factionId, amount: passive,
      ...(lord !== undefined ? { overlordFactionId: lord } : {}),
    });
  }
  // Settlement income, beside the garrison tick for the same reason it lives
  // here: a start-of-turn fact of holding land, not a play. Silent - see the
  // doc on `GameState.wealth` for why no event is logged.
  const income = wealthIncomeFor(viewOf(state), p.factionId);
  const wealth = income > 0
    ? {
        ...state.wealth,
        [p.factionId]: (state.wealth[p.factionId] ?? 0) + income,
      }
    : state.wealth;
  return {
    ...state, players, relations, wealth, alliances: lapsed.alliances,
    seats: lapsedSeats.seats,
    // The lapsed half is discarded: a run-out respite moves nothing and the
    // badge already counted it down, so there is nothing to report.
    respites: sweepLapsed(state.respites, state.turn, (e) => e).kept,
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
 *  forced tribute or a forced discard. The run is over; say so.
 *
 *  A held Revolt behind a closed lead gate (`revoltRequirement`) is NOT
 *  stranded: the requirement falls with every land the lord's realm takes,
 *  so the card is an escape the board is still moving toward, where a missing
 *  card is one nothing the player does can conjure. */
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

/** Levelling Might and seating a successor are one step, so no future edit
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
    relations: levelMight(relations, actorFactionId, targetId),
    ...succession,
  };
}

export function playCard(
  state: GameState,
  cardIndex: number,
  rng: Rng,
  targetId?: string,
  /** `harvest` is the resolved Turnip harvest pick. The app rolls the modal
   *  pre-play and hands the pick in; a caller that passes nothing (the sim,
   *  a fast-forward, an AI seat) gets `autoHarvestChoice`. */
  opts?: { harvest?: HarvestChoice },
): GameState {
  if (state.phase !== "playing") return state;
  if (state.playedThisTurn) return state;
  const p = state.players[state.current];
  const set = playableSet(viewOf(state), p.factionId, p.hand, {
    discards: allowsDiscards(state.rules),
  });
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
  let guards = state.guards;
  let omens = state.omens;
  let settlements = state.settlements;
  let booms = state.booms;
  let hostages = state.hostages;
  let respites = state.respites;
  let rulers = state.rulers;
  let wealth = state.wealth;
  let seats = state.seats;
  let empoweredCardId = state.empoweredCardId;
  // A tribute owes 1 per land of the payer's own realm - the exact set its
  // income sums over, so you pay 1 per land you earn from - and the treasury
  // covers what it can before any counter moves. Computed here, before the
  // readings are spent, because a fully-covered payment is flat coin and must
  // leave the omens stack held; only an uncovered remainder is a Might bump,
  // and only a Might bump cashes readings.
  const tributeOwed = isTributeCard(cardId)
    ? incorporatedRealmOf(p.factionId, state.incorporated).size
    : 0;
  const tributeCoins = Math.min(tributeOwed, state.wealth[p.factionId] ?? 0);
  const tributeShortfall = tributeOwed - tributeCoins;
  // A doublable card cashes the whole stack at once, rather than peeling one
  // reading per play. One rule, and no special case for a play made for you:
  // a forced tribute paid short therefore pays the full multiplier on the
  // shortfall and clears everything, which is the cost of hoarding readings
  // while somebody's vassal.
  const mult = omenMultiplier(state, p.factionId, cardId);
  const readings =
    mult > 1 && !(isTributeCard(cardId) && tributeShortfall === 0)
      ? (state.omens[p.factionId] ?? 0)
      : 0;
  if (readings > 0) {
    const spent = { ...omens };
    delete spent[p.factionId];
    omens = spent;
  }
  // The cost of a costed card (`CardDef.wealthCost`), spent at the moment of
  // play, unconditionally: the card is spent, the turn is gone, the cost is
  // gone. Legality (`cannot-afford`) has already refused a play the treasury
  // cannot cover, so the floor is defensive.
  const cardCost = card.wealthCost ?? 0;
  if (cardCost > 0) {
    wealth = {
      ...wealth,
      [p.factionId]: Math.max(0, (wealth[p.factionId] ?? 0) - cardCost),
    };
  }
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

  // A hostage never outlives the vassalage it was taken under: the debt was
  // owed to that lord, and a freed or poached vassal starting its next
  // vassalage pre-locked would be the same stale-escape bug stripRevolt
  // exists to prevent, inverted. Deleted silently - the release or poach line
  // is the story, and a "returned" line beside it would imply the tribute
  // clock ran out. The `hostage-returned` event belongs to the tribute path
  // alone.
  const dropHostageOf = (vassal: string): void => {
    if (!(vassal in hostages)) return;
    const { [vassal]: _gone, ...rest } = hostages;
    hostages = rest;
  };

  const freeVassalsOf = (lord: string): void => {
    for (const [vassal, l] of [...overlords]) {
      if (l === lord) {
        overlords.delete(vassal);
        dropHostageOf(vassal);
        respites = { ...respites, [vassal]: state.turn + ESCAPE_RESPITE_TURNS };
        players = updateFaction(players, vassal, stripVassalCards);
        events.push({
          turn: state.turn, playerId: p.id, type: "released",
          targetFactionId: vassal, overlordFactionId: lord,
        });
      }
    }
  };

  // The landing halves of Subjugate and Incorporate. Subjugate's is shared
  // verbatim with the harvest boon that hands it out: the boon waives one
  // legality rule (the lead bar) but lands the same way, so a boon that
  // lands and a card that lands cannot drift apart in what landing means.
  const landSubjugation = (target: string): void => {
    const formerLord = overlords.get(target);
    // The target's own vassals come along: taking a lord takes its pyramid,
    // which is why the bar in src/playability.ts prices the full realm. Its
    // hostages of them survive too - those vassalages are untouched.
    dropHostageOf(target); // the poached vassal's debt was to its former lord
    overlords.set(target, p.factionId);
    players = updateFaction(players, target, (pl) => {
      const clean = stripVassalCards(pl);
      return {
        ...clean,
        deck: shuffle([...clean.deck, ...TRIBUTE_CARDS], rng),
      };
    });
    // Whatever the new vassal had built against this lord is forfeit: the
    // revolt gate reads that direction, and a vassalage must open with the
    // gate at the lord's realm size alone. One direction only - the lord's
    // own counter (the grip `poachSurchargeOn` prices) survives. The cleared
    // value rides on the event, or the standings walk could not replay it.
    const resetAmount = getRel(relations, target, p.factionId);
    relations = resetMight(relations, target, p.factionId);
    if (formerLord !== undefined) {
      // vassal-loss penalty (section 8): the poached vassal gains +1 Might
      // over the former lord.
      relations = bumpMight(relations, target, formerLord);
    }
    events.push({
      turn: state.turn, playerId: p.id, type: "subjugated",
      targetFactionId: target, overlordFactionId: p.factionId,
      ...(formerLord !== undefined ? { formerOverlordFactionId: formerLord } : {}),
      ...(resetAmount > 0 ? { amount: resetAmount } : {}),
    });
  };

  const landIncorporation = (target: string): void => {
    overlords.delete(target);
    dropHostageOf(target); // an absorbed people has no camp to return to
    // A real rule, not defense: digesting a mid-lord frees its vassals.
    // Fealty was to the lord that just vanished, and re-parenting them would
    // make Incorporate strictly better than the pyramid it consumes. The
    // trade is deliberate - the freed subtree leaves your full realm in
    // exchange for one permanent land - and the AI prices it (src/ai.ts).
    freeVassalsOf(target);
    incorporated = { ...incorporated, [target]: p.factionId };
    for (const [land, owner] of Object.entries(incorporated)) {
      if (owner === target) incorporated = { ...incorporated, [land]: p.factionId };
    }
    players = updateFaction(players, target, stripVassalCards);
    events.push({
      turn: state.turn, playerId: p.id, type: "incorporated",
      targetFactionId: target, overlordFactionId: p.factionId,
    });
  };

  // One prevented branch for every guard, read off `GUARDS` rather than written
  // per card. A guard is consumed by the aim, not by the effect: the card is
  // spent, the turn is gone, and the target's guard is gone too. Card-specific
  // stamps that survive a prevention (Assassinate ruler's `targetRuler`) sit in
  // their own branch below, guarded by `prevented`.
  //
  // The whole effect chain lives in a closure so the empower boon can run it
  // twice. "refuse" is the two dead-play exits (a Revolt with no overlord, a
  // tribute with no lord) that must hand the caller back an unchanged state.
  const guardId = targetId === undefined ? undefined : guardAgainst(cardId);
  const resolveEffect = (): "ok" | "refuse" => {
    if (
      guardId !== undefined && targetId !== undefined &&
      (guards[guardId] ?? []).includes(targetId)
    ) {
      guards = {
        ...guards,
        [guardId]: guards[guardId].filter((f) => f !== targetId),
      };
      prevented = true;
      if (cardId === "assassinate-ruler") {
        events[0] = { ...events[0], targetRuler: rulerOf(rulers, targetId).name };
      }
    } else if (cardId === "raid" && targetId !== undefined) {
      // Through `raidGainFor` rather than `raidYield * mult`: the card tip and
      // the map preview quote the same call, so the promise and the resolution
      // cannot drift apart.
      const { gain } = raidGainFor(viewOf(state), p.factionId, targetId);
      relations = bumpMightBy(relations, p.factionId, targetId, gain);
      // Accumulated, not assigned: an empowered play resolves twice and the
      // event's one `amount` must carry the sum, or the standings walk loses
      // the second swing.
      events[0] = { ...events[0], amount: (events[0].amount ?? 0) + gain };
    } else if (FAN_OUT_CARDS.has(cardId)) {
      // One branch keyed on the fan-out SHAPE, not the card - see FAN_OUT_CARDS
      // in src/cards.ts. The actor's DIRECT overlord is skipped: the revolt
      // gate reads the vassal's lead over its lord, and a fan-out that reached
      // the lord would let every vassal grind its way out. The skipped lord is
      // frozen on the event for the standings walk, which runs after the batch,
      // when the overlord may already have changed. The amount is accumulated,
      // not assigned: an empowered play resolves twice and the event's one
      // `amount` must carry the sum.
      const lord = overlords.get(p.factionId);
      const living = state.factionIds.filter(
        (f) => f !== p.factionId && f !== lord && !(f in incorporated),
      );
      relations = bumpMightAllBy(relations, p.factionId, living, mult);
      events[0] = {
        ...events[0], amount: (events[0].amount ?? 0) + mult,
        ...(lord !== undefined ? { overlordFactionId: lord } : {}),
      };
    } else if (cardId === "favourable-omens") {
      omens = { ...omens, [p.factionId]: (omens[p.factionId] ?? 0) + 1 };
    } else if (cardId === "population-boom") {
      booms = { ...booms, [p.factionId]: (booms[p.factionId] ?? 0) + 1 };
    } else if (cardId === "mighty-ruler") {
      // The ACTING faction's CURRENT ruler. The level dies with him: replaceRuler
      // seats the successor at prowess 0. No `amount` on the event - no Might
      // counter moved, so the log line carries no standings suffix.
      const ruler = rulerOf(rulers, p.factionId);
      rulers = {
        ...rulers,
        [p.factionId]: { ...ruler, leadership: ruler.leadership + 1 },
      };
    } else if (cardId === "assassinate-ruler" && targetId !== undefined) {
      // Captured before assassinate() levels it away: the "before" of a
      // standings line has to come from somewhere once the reset erases it.
      // Through `leadsIn`, not raw `leadsOf`: pacts buy Might, the levelling
      // only zeroes the store, so the visible after-lead is the live pact terms
      // and the standings walk's "after" must start from the visible before.
      const preMightLead = leadsIn(
        { relations, alliances, turn: state.turn }, p.factionId, targetId,
      );
      const out = assassinate(state, rulers, relations, p.factionId, targetId);
      relations = out.relations;
      rulers = out.rulers;
      events[0] = {
        ...events[0],
        targetRuler: out.killed,
        successorRuler: out.successor,
        // First-stamp only: an empowered second swing reads an already-levelled
        // store, and its near-zero lead would overwrite the "before" the walk
        // needs. The rulers named are the LAST swing's - the final story.
        ...(events[0].amount === undefined ? { amount: preMightLead } : {}),
      };
    } else if (cardId === "found-settlement" && targetId !== undefined) {
      // The settlement belongs to the land, not to whoever founded it: a vassal's
      // land settled by its overlord keeps the settlement when the vassal leaves,
      // and takes the grip with it. That is the risk the card offers.
      settlements = {
        ...settlements,
        [targetId]: (settlements[targetId] ?? 0) + 1,
      };
      // Every founding spends a boom, floored at none - including one that only
      // reached the second settlement a land supports unaided. That is the price
      // of the allowance being an "up to" rather than a step: a boom saved for a
      // big land is a boom not spent on a small one.
      const held = booms[p.factionId] ?? 0;
      if (held > 0) booms = { ...booms, [p.factionId]: held - 1 };
      events.push({
        turn: state.turn, playerId: p.id, type: "settled",
        targetFactionId: targetId,
      });
    } else if (cardId === "seat-of-power" && targetId !== undefined) {
      // One entry per owner is the whole "only one seat" rule: a Record cannot
      // hold two, so a replay overwrites - the move - and nothing else needs to
      // check. The bar and raid effects live on `seatOf` reads, not here.
      seats = { ...seats, [p.factionId]: targetId };
      events.push({
        turn: state.turn, playerId: p.id, type: "seat-moved",
        targetFactionId: targetId,
      });
    } else if (isGuardCard(cardId)) {
      // Posting any of the three guards. Legality already refuses a second copy
      // while one is unspent (`already-held`), so this cannot stack.
      const holders = guards[cardId] ?? [];
      if (!holders.includes(p.factionId)) {
        guards = { ...guards, [cardId]: [...holders, p.factionId] };
      }
    } else if (cardId === "alliance" && targetId !== undefined) {
      const boosted = diplomacyBoost.includes(p.factionId);
      // Frozen here and never recomputed - see `Pact` in src/relations.ts for why
      // a live set would silently drift the standings walk.
      const against = sharedNeighboursOf(viewOf(state), p.factionId, targetId);
      // Re-sealing on a live ally extends the pact rather than restarting it:
      // the new 5 (or 10) turns stack on whatever the old pact still had. A
      // lapsed pact not yet swept by lapsePacts earns no credit - Math.max
      // floors the base at the current turn.
      const prior = alliances[allianceKey(p.factionId, targetId)];
      const base = Math.max(prior?.expiry ?? state.turn, state.turn);
      alliances = {
        ...alliances,
        [allianceKey(p.factionId, targetId)]: {
          expiry: base + (boosted ? 10 : 5),
          against,
        },
      };
      if (boosted) diplomacyBoost = diplomacyBoost.filter((f) => f !== p.factionId);
      // The pact's Might bonus is not a bump: it is a term `leadsIn` adds while
      // the pact is live and drops when it lapses. It still MOVES leads, so it is
      // recorded like one - `amount` for the size, `pactAgainst` for
      // the pairs, which is what lets the walk resolve both sides of the fan-out.
      events[0] = {
        ...events[0], amount: PACT_MIGHT_BONUS,
        pactAgainst: against,
      };
    } else if (cardId === "extended-diplomacy") {
      if (!diplomacyBoost.includes(p.factionId)) {
        diplomacyBoost = [...diplomacyBoost, p.factionId];
      }
    } else if (cardId === "subjugate" && targetId !== undefined) {
      landSubjugation(targetId);
    } else if (cardId === "incorporate" && targetId !== undefined) {
      landIncorporation(targetId);
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
      if (former === undefined) return "refuse";
      overlords.delete(p.factionId);
      dropHostageOf(p.factionId); // defensive: legality refuses Revolt while one is held
      respites = { ...respites, [p.factionId]: state.turn + ESCAPE_RESPITE_TURNS };
      players = updateFaction(players, p.factionId, stripVassalCards);
      // vassal-loss penalty (section 8): the revolting vassal gains +1 Might
      // over the former lord. Held readings multiply this parting blow like
      // any other Might gain.
      relations = bumpMightBy(relations, p.factionId, former, mult);
      events.push({
        turn: state.turn, playerId: p.id, type: "reclaimed", cardId,
        targetFactionId: p.factionId, overlordFactionId: former, amount: mult,
        ...(readings > 0 ? { readings } : {}),
      });
    } else if (cardId === "take-hostage" && targetId !== undefined) {
      // Legality already guarantees the target is this actor's vassal with a
      // live Revolt and no hostage held, so the branch only records the debt.
      // The Revolt itself is untouched: locking is `cardBlockReason`'s reading
      // of this entry, so the card stays in the piles and `isStranded` still
      // counts it as an escape.
      hostages = { ...hostages, [targetId]: HOSTAGE_RETURN_TRIBUTES };
      events.push({
        turn: state.turn, playerId: p.id, type: "hostage-taken",
        targetFactionId: targetId, overlordFactionId: p.factionId,
      });
    } else if (cardId === "turnip-harvest") {
      // Choiceless callers - the sim's naive human, a `turns=` fast-forward,
      // an AI seat that somehow held one - auto-resolve with the same roll the
      // modal would have shown. The app rolls pre-play in main.ts and hands
      // the pick in through `opts`.
      const choice = opts?.harvest ?? autoHarvestChoice(viewOf(state), p, rng);
      const living = state.factionIds.filter(
        (f) => f !== p.factionId && !(f in incorporated),
      );
      switch (choice.effect) {
        case "swap-common":
        case "swap-known": {
          const self = players[state.current];
          const held =
            self.deck.includes("grow-crops") ||
            self.discard.includes("grow-crops") ||
            self.hand.includes("grow-crops");
          // Both guards are defensive: the boon is only offered live while a
          // turnip exists, and the named card came off the roll. Guarded
          // anyway so a stale pick cannot burn an rng draw on nothing.
          if (held && (choice.effect === "swap-common" || choice.cardId in CARDS)) {
            // The named-card trade draws nothing here: `rollHarvest` already
            // drew the card, and this spends exactly what the roll named.
            const gained =
              choice.effect === "swap-common"
                ? harvestSwapPool()[
                    Math.floor(rng() * harvestSwapPool().length)]
                : choice.cardId;
            const removeOne = (arr: string[]): string[] | null => {
              const i = arr.indexOf("grow-crops");
              return i === -1 ? null : arr.filter((_, j) => j !== i);
            };
            // One turnip leaves - deck first, then discard, then hand - and
            // the gained card is shuffled into the DECK wherever the turnip
            // came from: the trade is a future draw, never a free play.
            players = updateFaction(players, p.factionId, (pl) => {
              const fromDeck = removeOne(pl.deck);
              if (fromDeck !== null) {
                return { ...pl, deck: shuffle([...fromDeck, gained], rng) };
              }
              const fromDiscard = removeOne(pl.discard);
              if (fromDiscard !== null) {
                return {
                  ...pl, discard: fromDiscard,
                  deck: shuffle([...pl.deck, gained], rng),
                };
              }
              const fromHand = removeOne(pl.hand);
              if (fromHand !== null) {
                return {
                  ...pl, hand: fromHand,
                  deck: shuffle([...pl.deck, gained], rng),
                };
              }
              return pl;
            });
            events.push({
              turn: state.turn, playerId: p.id, type: "harvest-traded",
              cardId: gained,
            });
          }
          break;
        }
        case "might-reset": {
          // Levels the STORE only, the `levelMight` precedent: a lead bought
          // by a live pact is not the boon's to erase. Reads the threaded
          // `relations` - an earlier effect of this same play may already
          // have moved it. One event per trailing rival, each with its own
          // deficit as `amount`, so the standings walk resolves this
          // human-authored fan-out through the ordinary single-target arm.
          for (const rival of living) {
            const lead = leadOf(relations, p.factionId, rival);
            if (lead >= 0) continue;
            relations = bumpMightBy(relations, p.factionId, rival, -lead);
            events.push({
              turn: state.turn, playerId: p.id, type: "harvest-might",
              targetFactionId: rival, amount: -lead,
            });
          }
          break;
        }
        case "wealth-1":
        case "wealth-income": {
          const coins =
            choice.effect === "wealth-1"
              ? 1
              : 5 * wealthIncomeFor(viewOf(state), p.factionId);
          wealth = {
            ...wealth,
            [p.factionId]: (wealth[p.factionId] ?? 0) + coins,
          };
          events.push({
            turn: state.turn, playerId: p.id, type: "harvest-wealth",
            wealth: coins,
          });
          break;
        }
        case "subjugate": {
          // The boon lands roll-free - a boon that whiffed would read as a
          // bug - but only on a target the boon's own rule allows.
          if (
            harvestSubjugateTargets(viewOf(state), p.factionId)
              .includes(choice.targetId)
          ) {
            landSubjugation(choice.targetId);
          }
          break;
        }
        case "empower": {
          if (empowerableCards(players[state.current]).includes(choice.cardId)) {
            empoweredCardId = choice.cardId;
            events.push({
              turn: state.turn, playerId: p.id, type: "empowered",
              cardId: choice.cardId,
            });
          }
          break;
        }
      }
    } else if (isTributeCard(cardId)) {
      const lord = overlords.get(p.factionId);
      if (lord === undefined) return "refuse";
      // Wealth first: the coins move vassal -> direct lord and no counter with
      // them. Only the DIRECT lord - the per-pair fan-out below exists because
      // relation counters are per-pair, and a treasury is one pot; a chain's
      // root is still fed, because each link's own tribute plays pay from the
      // treasury these coins landed in. (The per-hop cascade this replaced is
      // recorded, reversed, in the 2026-08-02 vassal-chains design.)
      if (tributeCoins > 0) {
        wealth = {
          ...wealth,
          [p.factionId]: (wealth[p.factionId] ?? 0) - tributeCoins,
          [lord]: (wealth[lord] ?? 0) + tributeCoins,
        };
      }
      // What the treasury could not cover lands as the Might bump, multiplied by
      // the readings the shortfall cashed - see the spend above. The lord's
      // incorporated lands gain alongside it, as every bump toward a dead land's
      // owner always has.
      const shortfallAmount = tributeShortfall * mult;
      if (shortfallAmount > 0) {
        const beneficiaries = [
          lord,
          ...state.factionIds.filter((f) => incorporated[f] === lord),
        ];
        for (const b of beneficiaries) {
          relations = bumpMightBy(relations, b, p.factionId, shortfallAmount);
        }
      }
      events.push({
        turn: state.turn, playerId: p.id, type: "tribute",
        targetFactionId: p.factionId, overlordFactionId: lord,
        ...(tributeCoins > 0 ? { wealth: tributeCoins } : {}),
        ...(shortfallAmount > 0 ? { amount: shortfallAmount } : {}),
      });
      // Each payment works off one unit of the hostage debt, whatever the omens
      // multiplied the tribute itself to - the card promises "pay tribute
      // twice", counted in plays. At zero the hostage goes home and the Revolt
      // block lifts with the entry.
      const owed = hostages[p.factionId];
      if (owed !== undefined) {
        if (owed <= 1) {
          dropHostageOf(p.factionId);
          events.push({
            turn: state.turn, playerId: p.id, type: "hostage-returned",
            targetFactionId: p.factionId, overlordFactionId: lord,
          });
        } else {
          hostages = { ...hostages, [p.factionId]: owed - 1 };
        }
      }
    }
    return "ok";
  };

  // The empower mark is checked against the state BEFORE this play, and only
  // for the human: only the human ever earns a harvest, so only the human's
  // state ever carries a mark, and the seat check keeps a sim's symmetric
  // world honest about that.
  const empowered =
    state.humanSeat !== null && state.current === state.humanSeat &&
    state.empoweredCardId === cardId;
  if (resolveEffect() === "refuse") return state;
  if (empowered && !prevented) {
    // The second resolution. Its own dead-play refusals (a Revolt whose lord
    // is already gone) just stop the second swing - the first already
    // committed. A play a guard turned aside keeps the mark: nothing
    // resolved, so nothing was doubled and nothing is spent.
    resolveEffect();
    events[0] = { ...events[0], empowered: true };
    empoweredCardId = null;
  }

  // The turnip bar. A human turnip play that crosses a threshold shuffles a
  // Turnip harvest into the deck - the seeds-of-revolt injection shape. The
  // count is log-derived (`runTurnips`, this play is the +1), the thresholds
  // escalate (`harvestThreshold`), and the gate is the human SEAT, not player
  // id 1: `runWorld`'s symmetric simulations carry `humanSeat: null` and must
  // stay a world where no seat is privileged.
  if (
    cardId === "grow-crops" &&
    state.humanSeat !== null && state.current === state.humanSeat
  ) {
    const m = harvestMultiplier(state.rules);
    const grown = runTurnips(state.log);
    if (harvestsEarned(grown + 1, m) > harvestsEarned(grown, m)) {
      players = updateFaction(players, p.factionId, (pl) => ({
        ...pl, deck: shuffle([...pl.deck, "turnip-harvest"], rng),
      }));
      events.push({
        turn: state.turn, playerId: p.id, type: "harvest-earned",
        cardId: "turnip-harvest",
      });
    }
  }

  if (prevented) events[0] = { ...events[0], prevented: true };
  if (readings > 0) events[0] = { ...events[0], readings };

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
    // Only a free faction wins: a vassal's realm is a strict subset of its
    // root's, so victory belongs to roots - a human mid-lord must revolt
    // free before their pyramid counts as theirs.
    !overlords.has(humanFaction) &&
    // `fullRealmOf`, not `realmOf`: a land your vassal annexed is a land you
    // hold, and the map has always drawn it that way.
    fullRealmOf(humanFaction, overlords, incorporated).size >= winSize
  ) {
    phase = "victory";
    events.push({ turn: state.turn, playerId: p.id, type: "victory" });
  } else {
    // Vassals are skipped for the same reason the human branch requires
    // freedom: a vassal subtree crossing the threshold sits inside its
    // root's realm, and when both cross on the same play the root is the
    // unifier the headline names.
    const unifier = state.factionIds.find(
      (f) =>
        f !== humanFaction &&
        !(f in incorporated) &&
        !overlords.has(f) &&
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
    alliances, diplomacyBoost, guards, omens, settlements, booms, hostages,
    wealth, respites, rulers, seats, empoweredCardId,
    log: appendEvents(state, events),
    // An unlimited turn stays open while cards remain; an emptied hand has
    // nothing left to play or hold for, so the last play closes the turn
    // without an End turn click. A dead hand (unplayable cards) still waits.
    playedThisTurn:
      state.rules.turn !== "unlimited" ||
      players[state.current].hand.length === 0,
  };
}

/** Forced discard when nothing in hand is playable. Under rules that refuse
 *  discards, `playableSet` never returns "discard" mode, so this simply never
 *  finds a set to act on and falls through to the no-op return below. */
export function discardCard(state: GameState, cardIndex: number): GameState {
  if (state.phase !== "playing") return state;
  if (state.playedThisTurn) return state;
  const p = state.players[state.current];
  const set = playableSet(viewOf(state), p.factionId, p.hand, {
    discards: allowsDiscards(state.rules),
  });
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

/** Closes an unlimited-rules turn. The only writer of `playedThisTurn` that
 *  moves nothing else: no event and no log line, because the log already
 *  carries every play the turn made. Standard turns close through playCard
 *  and discardCard instead, so this refuses them. */
export function endTurn(state: GameState): GameState {
  if (state.phase !== "playing") return state;
  if (state.rules.turn !== "unlimited") return state;
  if (state.playedThisTurn) return state;
  return { ...state, playedThisTurn: true };
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
