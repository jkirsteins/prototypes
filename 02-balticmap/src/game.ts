import {
  CARDS, guardAgainst, isGuardCard, isTributeCard, startingDeck, shuffle,
  TRIBUTE_CARDS, type Rng, type Strategy,
} from "./cards";

import {
  fullRealmOf, incorporatedRealmOf,
  type Incorporated, type Overlords,
} from "./relations";
import {
  addDisease, applyDamage, applyHeal, clearDiseaseOf, DEFAULT_DEFENSE_MAX,
  defenseOf, HARVEST_FEAST_HEAL, HILLFORT_HEAL, independenceGateOpen,
  PLAGUE_DAMAGE_PER_STACK, transferAllDiseaseTo, WAR_COUNCIL_LEADERSHIP,
  type Defense, type Disease,
} from "./defense";
import {
  attackDamageFor, attackMultiplier, borderPolygonsOf, ESCAPE_RESPITE_TURNS,
  outbreakPolygons, plagueMultiplier, playableSet, validTargetsFor,
  wealthIncomeFor, type Guards, type Omens, type RulesView,
} from "./playability";
import { autoHarvestChoice, type HarvestChoice } from "./harvest";
import { initialRulers, leadershipByFaction, replaceRuler, rulerOf, type Rulers } from "./rulers";
import { allowsDiscards, DEFAULT_RULES, type RuleSelections } from "./rules";
import { sweepLapsed } from "./timed";

export type GameEventType =
  | "draw" | "play" | "reshuffle" | "discard"
  | "subjugated" | "released" | "incorporated" | "independence" | "tribute"
  | "settled"
  | "damaged" | "healed" | "disease-spread" | "plagued" | "winds-shifted"
  | "harvest-earned" | "harvest-picked"
  | "victory" | "defeat" | "unified" | "surrendered";

export interface GameEvent {
  turn: number;
  playerId: number; // 1 = human
  type: GameEventType;
  cardId?: string; // draw, play, discard, harvest-earned/-picked (the card)
  /** The faction or POLYGON this event names: the play's aim, the damaged or
   *  healed polygon, the vassal freed or taken. Polygon ids are faction ids -
   *  regions and factions are 1:1 - so one field serves both. */
  targetFactionId?: string;
  /** Usually the lord an event happened under. */
  overlordFactionId?: string;
  formerOverlordFactionId?: string; // subjugated: prior lord of the target
  /** How far this event moved the counter it names, written at every site
   *  that moves one, so src/standings.ts can reconstruct a before -> after
   *  without re-deriving the rules from state that has already moved on:
   *  - damaged/plagued: defense LOST by `targetFactionId`'s polygon (the
   *    actual movement, floored at the score, not the raw card damage);
   *  - healed: defense restored;
   *  - disease-spread/winds-shifted: stacks the ACTOR gained on the polygon;
   *  - play (war-council): leadership gained.
   *  See the rule in AGENTS.md: a site that forgets this drifts the round
   *  summary silently, which is why tests/standings.test.ts replays a full
   *  game and checks the walk against the real stores. */
  amount?: number;
  /** tribute: the coins this payment moved from the vassal to its lord. */
  wealth?: number;
  /** play: the card was turned aside by the target's guard (see `GUARDS` in
   *  src/cards.ts) and did nothing. Also what `revealedSecrets` reads to decide
   *  that the guard which stopped it is no longer a secret. */
  prevented?: boolean;
  /** play: how many reserve readings this play cashed - Favourable omens on
   *  an attack, Miasma on a Plague - so the log can say by how much. A count
   *  because readings stack: two quadruple, and "doubled" could not tell
   *  that from one. Absent when no reading was spent. */
  readings?: number;
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
  strategy: Strategy;
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
  overlords: Overlords; // STORED vassal -> overlord map
  incorporated: Incorporated;
  adjacency: Record<string, string[]>;
  guards: Guards; // guard card id -> faction ids holding it unspent
  omens: Omens; // faction id -> unspent Favourable omens readings held
  /** Faction id -> how many FURTHER settlements the map authors for that land
   *  (its locked dots). Map-derived and static, like `adjacency`. */
  siteCaps: Record<string, number>;
  /** Faction id -> settlements FOUNDED in that land this game. Absent = 0.
   *  The one settlement every land starts with is deliberately not counted;
   *  `settlementsIn` in src/playability.ts adds it back for the allowance. */
  settlements: Record<string, number>;
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
   *  earned. Stored rather than log-derived because EVERY seat counts now.
   *  Reset to 0 at the threshold. */
  turnips: Record<string, number>;
  /** Faction id -> treasury. Absent = 0, never negative, uncapped. Earned in
   *  `beginTurn` - 1 plus 1 per settlement founded in the faction's own
   *  realm, via `wealthIncomeFor` - silently: income moves no score, and one
   *  log line per faction per round is exactly the noise the log filter
   *  exists to remove. Spent in `playCard` on costed cards and on tribute. */
  wealth: Record<string, number>;
  /** Faction id -> the turn its post-escape respite expires. Set the moment a
   *  faction ESCAPES vassalage - the independence gate, or freed because its
   *  lord fell - never when it is merely poached, and while it runs nobody
   *  may Subjugate it (see `ESCAPE_RESPITE_TURNS`). Bare expiry on the
   *  src/timed.ts clock; swept silently in `beginTurn`. */
  respites: Record<string, number>;
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
  /** The build the human confirmed on the build screen; what `pickFaction`
   *  stamps on seat 0. */
  humanStrategy: Strategy;
  log: GameEvent[];
}

export const OPENING_HAND = 3;

/** The hand the unlimited turn structure refills to at turn start: the hand a
 *  standard-rules player decides with, i.e. the opening hand plus the one
 *  turn-start draw. */
export const HAND_REFILL = OPENING_HAND + 1;

/** Grow turnips plays that earn one Turnip harvest. Static - the counter
 *  resets and counts the same 5 again, forever. The pacing knob the design
 *  doc names, deliberately one constant. */
export const TURNIP_HARVEST_THRESHOLD = 5;

/** Further settlements a land gets in a world nobody handed a map to. */
export const DEFAULT_SITE_CAP = 3;

/** Lands needed to win: a 55 percent majority of the roster, rounded up.
 *  Derived rather than hardcoded so it cannot rot when the map changes. */
export function victoryRealmSize(factionCount: number): number {
  return Math.ceil(0.55 * factionCount);
}

export function viewOf(state: GameState): RulesView {
  return {
    overlords: state.overlords,
    incorporated: state.incorporated,
    adjacency: state.adjacency,
    factionIds: state.factionIds,
    turn: state.turn,
    guards: state.guards,
    omens: state.omens,
    siteCaps: state.siteCaps,
    settlements: state.settlements,
    wealth: state.wealth,
    respites: state.respites,
    defense: state.defense,
    defenseMax: state.defenseMax,
    disease: state.disease,
    miasma: state.miasma,
    turnips: state.turnips,
    leadership: leadershipByFaction(state.rulers),
  };
}

export function newGame(
  factionIds: string[],
  adjacency?: Record<string, string[]>,
  ethnicities: Record<string, string> = {},
  /** Faction id -> further settlements the map authors for that land.
   *  Defaults to `DEFAULT_SITE_CAP` for every faction, the same way
   *  `adjacency` defaults to a complete graph. */
  siteCaps?: Record<string, number>,
  /** Faction id -> the polygon's defense ceiling, `population / 50` on the
   *  real map. Defaults every faction to `DEFAULT_DEFENSE_MAX`: tests get
   *  polygons both gates are reachable on. */
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
    overlords: new Map(),
    incorporated: {},
    guards: {},
    omens: {},
    siteCaps:
      siteCaps ??
      Object.fromEntries(factionIds.map((id) => [id, DEFAULT_SITE_CAP])),
    settlements: {},
    defense: {},
    defenseMax:
      defenseMax ??
      Object.fromEntries(factionIds.map((id) => [id, DEFAULT_DEFENSE_MAX])),
    disease: {},
    miasma: {},
    turnips: {},
    wealth: {},
    respites: {},
    ethnicities,
    rulers: initialRulers(factionIds, ethnicities),
    humanSeat: 0,
    humanStrategy: "warpath",
    adjacency:
      adjacency ??
      Object.fromEntries(
        factionIds.map((id) => [id, factionIds.filter((o) => o !== id)]),
      ),
    log: [],
  };
}

export function startGame(state: GameState): GameState {
  if (state.phase !== "main-menu") return state;
  return { ...state, phase: "deck-building" };
}

/** Locks in the human's build and proceeds to faction picking. The successor
 *  of `chooseDeck`: the deck itself is no longer chosen - every seat starts
 *  with `startingDeck()` and grows it through harvests. */
export function chooseBuild(state: GameState, build: Strategy): GameState {
  if (state.phase !== "deck-building") return state;
  return { ...state, phase: "pick-faction", humanStrategy: build };
}

/** Locks in the rule picks. Legal only while deck-building, like the build
 *  itself: everything after `pickFaction` may branch on an axis, so a mid-run
 *  swap could contradict what the player has already seen happen. */
export function chooseRules(
  state: GameState, rules: RuleSelections,
): GameState {
  if (state.phase !== "deck-building") return state;
  return { ...state, rules: { ...rules } };
}

function makePlayer(
  id: number,
  factionId: string,
  strategy: Strategy,
  rng: Rng,
): PlayerState {
  const deck = shuffle(startingDeck(), rng);
  // opening hand: dealt silently (no log events)
  return {
    id,
    factionId,
    strategy,
    hand: deck.slice(0, OPENING_HAND),
    deck: deck.slice(OPENING_HAND),
    discard: [],
  };
}

/** Every seat gets the same starting deck; each AI seat rolls its build,
 *  seeded - one rng draw per AI seat, in seat order, BEFORE its deck is
 *  shuffled, so the draw count per seat is a frozen contract the same way
 *  the old deck builder's was (tests/rng-isolation.test.ts pins it). */
export function pickFaction(
  state: GameState,
  factionId: string,
  rng: Rng,
): GameState {
  if (state.phase !== "pick-faction") return state;
  if (!state.factionIds.includes(factionId)) return state;
  const others = state.factionIds.filter((id) => id !== factionId);
  const players = [
    makePlayer(1, factionId, state.humanStrategy, rng),
    ...others.map((id, i) =>
      makePlayer(
        i + 2, id, rng() < 0.5 ? "warpath" : "pestilence", rng,
      ),
    ),
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
    // The independence gate is checked at the vassal's own turn start, in
    // `beginTurn` - a clock tick, not something a card did. Logged from a
    // batch that never opens with a play, so this is unreachable today, but
    // it is the honest answer if a heal ever frees mid-play.
    case "independence":
    // The run is over. See above.
    case "victory":
    case "defeat":
    case "unified":
    case "surrendered":
      return false;
    case "subjugated":
    case "released":
    case "incorporated":
    case "tribute":
    case "settled":
    case "damaged":
    case "healed":
    case "disease-spread":
    case "plagued":
    case "winds-shifted":
    // The bar crossing follows the turnip play that crossed it; the pick
    // follows the harvest play it was made on.
    case "harvest-earned":
    case "harvest-picked":
      return true;
  }
}

/** The one place `actorRuler` is filled, and the one place a consequence is
 *  tied to the play that caused it. Every append to the log goes through here,
 *  so a new event type cannot ship unstamped.
 *
 *  `playCard` builds one batch per play with the `play` event first and pushes
 *  everything that play caused onto it, and no other caller starts a batch with
 *  a `play`. So "caused by this play" is exactly "not first in a batch that
 *  starts with a play". */
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

/** Current player draws 1 (reshuffle rule); resets the play flag. Checks the
 *  independence gate FIRST: a vassal whose home polygon has climbed back to
 *  75% of its max regains independence at the start of its own turn, with
 *  the same 2-turn respite every escape grants. The consequence is
 *  deliberate - an overlord must keep beating its vassals down or lose them;
 *  vassalage is upkeep now. */
export function beginTurn(state: GameState, rng: Rng): GameState {
  if (state.players.length === 0) return state;
  const p = state.players[state.current];
  const events: GameEvent[] = [];
  const overlords = new Map(state.overlords);
  let respites = state.respites;
  let players = state.players;
  const lord = overlords.get(p.factionId);
  if (
    lord !== undefined &&
    independenceGateOpen(viewOf(state), p.factionId)
  ) {
    overlords.delete(p.factionId);
    respites = { ...respites, [p.factionId]: state.turn + ESCAPE_RESPITE_TURNS };
    players = players.map((pl) =>
      pl.factionId === p.factionId ? stripTribute(pl) : pl,
    );
    events.push({
      turn: state.turn, playerId: p.id, type: "independence",
      targetFactionId: p.factionId, overlordFactionId: lord,
    });
  }
  const self = players[state.current];
  let { deck, discard } = self;
  if (deck.length === 0 && discard.length > 0) {
    deck = shuffle(discard, rng);
    discard = [];
    events.push({ turn: state.turn, playerId: p.id, type: "reshuffle" });
  }
  let hand = self.hand;
  if (state.rules.turn === "unlimited") {
    // Refill rather than draw one. Each draw logs the same `draw` event the
    // single-draw path logs, and a deck that runs dry mid-refill reshuffles
    // exactly as it does between turns.
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
  const updated = { ...self, deck, hand, discard };
  players = players.map((pl, i) => (i === state.current ? updated : pl));
  // Settlement income: a start-of-turn fact of holding land, not a play.
  // Silent - see the doc on `GameState.wealth` for why no event is logged.
  const income = wealthIncomeFor(viewOf(state), p.factionId);
  const wealth = income > 0
    ? {
        ...state.wealth,
        [p.factionId]: (state.wealth[p.factionId] ?? 0) + income,
      }
    : state.wealth;
  return {
    ...state, players, overlords, wealth,
    // The lapsed half is discarded: a run-out respite moves nothing and the
    // badge already counted it down, so there is nothing to report.
    respites: sweepLapsed(respites, state.turn, (e) => e).kept,
    log: appendEvents(state, events), playedThisTurn: false,
  };
}

/** The player concedes. Terminal, and deliberately not reversible. Its own
 *  event type rather than reusing `defeat`, because `defeat` carries an
 *  `overlordFactionId` and the postmortem builds a killer-versus-you
 *  comparison out of it. Nobody killed you here. */
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

/** The injected tribute cards leave on every exit from vassalage, so a freed
 *  or poached faction never carries a stale demand into its next life. */
const stripTribute = (p: PlayerState): PlayerState => ({
  ...p,
  deck: p.deck.filter((c) => !isTributeCard(c)),
  hand: p.hand.filter((c) => !isTributeCard(c)),
  discard: p.discard.filter((c) => !isTributeCard(c)),
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
  /** `harvest` is the resolved Turnip harvest pick. The app rolls the offer
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

  const view = viewOf(state);
  const overlords = new Map(state.overlords);
  let incorporated = state.incorporated;
  let guards = state.guards;
  let omens = state.omens;
  let miasma = state.miasma;
  let settlements = state.settlements;
  let defense = state.defense;
  let disease = state.disease;
  let turnips = state.turnips;
  let respites = state.respites;
  let rulers = state.rulers;
  let wealth = state.wealth;

  // The reserve spends, computed against the PRE-play state. An attack play
  // cashes the whole omens stack at once; a Plague cashes the miasma stack.
  const isAttack = attackMultiplier(view, p.factionId, cardId) > 1;
  const attackReadings = isAttack ? (state.omens[p.factionId] ?? 0) : 0;
  if (attackReadings > 0) {
    const spent = { ...omens };
    delete spent[p.factionId];
    omens = spent;
  }
  const plagueReadings =
    cardId === "plague" && plagueMultiplier(view, p.factionId) > 1
      ? (state.miasma[p.factionId] ?? 0)
      : 0;
  if (plagueReadings > 0) {
    const spent = { ...miasma };
    delete spent[p.factionId];
    miasma = spent;
  }
  const readings = attackReadings + plagueReadings;

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

  const freeVassalsOf = (lordId: string): void => {
    for (const [vassal, l] of [...overlords]) {
      if (l === lordId) {
        overlords.delete(vassal);
        respites = { ...respites, [vassal]: state.turn + ESCAPE_RESPITE_TURNS };
        players = updateFaction(players, vassal, stripTribute);
        events.push({
          turn: state.turn, playerId: p.id, type: "released",
          targetFactionId: vassal, overlordFactionId: lordId,
        });
      }
    }
  };

  /** One attack card's landing on one polygon: the defense moved is what the
   *  event records - the actual movement, not the raw card damage, so the
   *  walk in src/standings.ts can replay it against the store. A polygon
   *  already at 0 records nothing; the spec is explicit that nothing special
   *  happens at 0. */
  const landDamage = (polygon: string, damage: number): void => {
    const before = defenseOf({ defense, defenseMax: state.defenseMax }, polygon);
    const moved = Math.min(before, damage);
    if (moved <= 0) return;
    defense = applyDamage({ defense, defenseMax: state.defenseMax }, polygon, damage);
    events.push({
      turn: state.turn, playerId: p.id, type: "damaged", cardId,
      targetFactionId: polygon, amount: moved,
    });
  };

  const landHeal = (polygon: string, amount: number): void => {
    const v = { defense, defenseMax: state.defenseMax };
    const before = defenseOf(v, polygon);
    const healed = applyHeal(v, polygon, amount);
    const after = defenseOf({ defense: healed, defenseMax: state.defenseMax }, polygon);
    if (after <= before) return;
    defense = healed;
    events.push({
      turn: state.turn, playerId: p.id, type: "healed", cardId,
      targetFactionId: polygon, amount: after - before,
    });
  };

  const landSubjugation = (target: string): void => {
    const formerLord = overlords.get(target);
    // The target's own vassals come along: taking a lord takes its pyramid.
    overlords.set(target, p.factionId);
    players = updateFaction(players, target, (pl) => {
      const clean = stripTribute(pl);
      return {
        ...clean,
        deck: shuffle([...clean.deck, ...TRIBUTE_CARDS], rng),
      };
    });
    events.push({
      turn: state.turn, playerId: p.id, type: "subjugated",
      targetFactionId: target, overlordFactionId: p.factionId,
      ...(formerLord !== undefined ? { formerOverlordFactionId: formerLord } : {}),
    });
  };

  const landIncorporation = (target: string): void => {
    overlords.delete(target);
    // A real rule, not defense: digesting a mid-lord frees its vassals.
    // Fealty was to the lord that just vanished, and re-parenting them would
    // make Incorporate strictly better than the pyramid it consumes.
    freeVassalsOf(target);
    incorporated = { ...incorporated, [target]: p.factionId };
    for (const [land, owner] of Object.entries(incorporated)) {
      if (owner === target) incorporated = { ...incorporated, [land]: p.factionId };
    }
    players = updateFaction(players, target, stripTribute);
    events.push({
      turn: state.turn, playerId: p.id, type: "incorporated",
      targetFactionId: target, overlordFactionId: p.factionId,
    });
  };

  // One prevented branch for every guard, read off `GUARDS` rather than
  // written per card. A guard is consumed by the aim, not by the effect.
  const guardId = targetId === undefined ? undefined : guardAgainst(cardId);
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
    // Through `attackDamageFor` rather than a local formula: the card tip
    // quotes the same call, so the promise and the resolution cannot drift.
    landDamage(targetId, attackDamageFor(view, p.factionId, cardId).damage);
  } else if (cardId === "great-raid") {
    const { damage } = attackDamageFor(view, p.factionId, cardId);
    // In faction order, not Set order, so a seeded run logs deterministically.
    const border = borderPolygonsOf(view, p.factionId);
    for (const polygon of state.factionIds.filter((f) => border.has(f))) {
      landDamage(polygon, damage);
    }
  } else if (cardId === "favourable-omens") {
    omens = { ...omens, [p.factionId]: (omens[p.factionId] ?? 0) + 1 };
  } else if (cardId === "miasma") {
    miasma = { ...miasma, [p.factionId]: (miasma[p.factionId] ?? 0) + 1 };
  } else if (cardId === "war-council") {
    // The ACTING faction's CURRENT ruler. The stack dies with him:
    // replaceRuler seats the successor at leadership 0.
    const ruler = rulerOf(rulers, p.factionId);
    rulers = {
      ...rulers,
      [p.factionId]: {
        ...ruler, leadership: ruler.leadership + WAR_COUNCIL_LEADERSHIP,
      },
    };
    events[0] = { ...events[0], amount: WAR_COUNCIL_LEADERSHIP };
  } else if (cardId === "spread-disease" && targetId !== undefined) {
    disease = addDisease(disease, targetId, p.factionId, 1);
    events.push({
      turn: state.turn, playerId: p.id, type: "disease-spread", cardId,
      targetFactionId: targetId, amount: 1,
    });
  } else if (cardId === "localized-outbreak" && targetId !== undefined) {
    for (const polygon of outbreakPolygons(view, p.factionId, targetId)) {
      disease = addDisease(disease, polygon, p.factionId, 1);
      events.push({
        turn: state.turn, playerId: p.id, type: "disease-spread", cardId,
        targetFactionId: polygon, amount: 1,
      });
    }
  } else if (cardId === "plague") {
    const mult = plagueMultiplier(view, p.factionId);
    for (const polygon of state.factionIds) {
      const stacks = disease[polygon]?.[p.factionId] ?? 0;
      if (stacks === 0) continue;
      const damage = stacks * PLAGUE_DAMAGE_PER_STACK * mult;
      const before = defenseOf({ defense, defenseMax: state.defenseMax }, polygon);
      const moved = Math.min(before, damage);
      defense = applyDamage({ defense, defenseMax: state.defenseMax }, polygon, damage);
      // `plagued`, not `damaged`, even when the polygon was already at 0:
      // the stacks burned there either way, and the log must say where they
      // went. `amount` is the defense moved, 0 included.
      events.push({
        turn: state.turn, playerId: p.id, type: "plagued", cardId,
        targetFactionId: polygon, amount: moved,
      });
    }
    disease = clearDiseaseOf(disease, p.factionId);
  } else if (cardId === "foul-winds") {
    // One event per polygon whose ownership moved: the stacks the actor
    // GAINED there, which is the total held by others before the shift.
    for (const polygon of state.factionIds) {
      const owners = disease[polygon];
      if (owners === undefined) continue;
      const gained = Object.entries(owners)
        .filter(([owner]) => owner !== p.factionId)
        .reduce((sum, [, n]) => sum + n, 0);
      if (gained === 0) continue;
      events.push({
        turn: state.turn, playerId: p.id, type: "winds-shifted", cardId,
        targetFactionId: polygon, amount: gained,
      });
    }
    disease = transferAllDiseaseTo(disease, p.factionId);
  } else if (cardId === "hillfort" && targetId !== undefined) {
    landHeal(targetId, HILLFORT_HEAL);
  } else if (cardId === "harvest-feast") {
    const realm = fullRealmOf(p.factionId, overlords, incorporated);
    for (const polygon of state.factionIds.filter((f) => realm.has(f))) {
      landHeal(polygon, HARVEST_FEAST_HEAL);
    }
  } else if (cardId === "assassinate-ruler" && targetId !== undefined) {
    const out = replaceRuler(rulers, state.ethnicities, targetId, state.turn);
    rulers = out.rulers;
    events[0] = {
      ...events[0],
      targetRuler: out.killed,
      successorRuler: out.successor,
    };
  } else if (cardId === "found-settlement" && targetId !== undefined) {
    // The settlement belongs to the land, not to whoever founded it: a
    // vassal's land settled by its overlord keeps the settlement when the
    // vassal leaves. That is the risk the card offers.
    settlements = {
      ...settlements,
      [targetId]: (settlements[targetId] ?? 0) + 1,
    };
    events.push({
      turn: state.turn, playerId: p.id, type: "settled",
      targetFactionId: targetId,
    });
  } else if (isGuardCard(cardId)) {
    // Posting a guard. Legality already refuses a second copy while one is
    // unspent (`already-held`), so this cannot stack.
    const holders = guards[cardId] ?? [];
    if (!holders.includes(p.factionId)) {
      guards = { ...guards, [cardId]: [...holders, p.factionId] };
    }
  } else if (cardId === "subjugate" && targetId !== undefined) {
    landSubjugation(targetId);
  } else if (cardId === "incorporate" && targetId !== undefined) {
    landIncorporation(targetId);
  } else if (cardId === "turnip-harvest") {
    // Choiceless callers - the sim, a `turns=` fast-forward, an AI seat -
    // auto-resolve with the same roll the modal would have shown. The app
    // rolls pre-play in main.ts and hands the pick in through `opts`.
    const choice = opts?.harvest ?? autoHarvestChoice(players[state.current], rng);
    if (!("skip" in choice)) {
      players = updateFaction(players, p.factionId, (pl) => ({
        ...pl, deck: shuffle([...pl.deck, choice.cardId], rng),
      }));
      events.push({
        turn: state.turn, playerId: p.id, type: "harvest-picked",
        cardId: choice.cardId,
      });
    }
  } else if (isTributeCard(cardId)) {
    const lordId = overlords.get(p.factionId);
    if (lordId === undefined) return state;
    // Coins only: 1 per land of the payer's own realm - the exact set its
    // income sums over - covered as far as the treasury reaches, and the
    // rest forgiven. The Might arm this replaced died with the Might bar.
    const owed = incorporatedRealmOf(p.factionId, state.incorporated).size;
    const coins = Math.min(owed, state.wealth[p.factionId] ?? 0);
    if (coins > 0) {
      wealth = {
        ...wealth,
        [p.factionId]: (wealth[p.factionId] ?? 0) - coins,
        [lordId]: (wealth[lordId] ?? 0) + coins,
      };
    }
    events.push({
      turn: state.turn, playerId: p.id, type: "tribute",
      targetFactionId: p.factionId, overlordFactionId: lordId,
      ...(coins > 0 ? { wealth: coins } : {}),
    });
  }

  // The turnip bar: EVERY seat counts now - harvests are how every deck
  // grows. At the threshold the counter resets and a Turnip harvest is
  // shuffled into the deck, the injection shape tribute uses.
  if (cardId === "grow-crops") {
    const grown = (turnips[p.factionId] ?? 0) + 1;
    if (grown >= TURNIP_HARVEST_THRESHOLD) {
      turnips = { ...turnips, [p.factionId]: 0 };
      players = updateFaction(players, p.factionId, (pl) => ({
        ...pl, deck: shuffle([...pl.deck, "turnip-harvest"], rng),
      }));
      events.push({
        turn: state.turn, playerId: p.id, type: "harvest-earned",
        cardId: "turnip-harvest",
      });
    } else {
      turnips = { ...turnips, [p.factionId]: grown };
    }
  }

  if (prevented) events[0] = { ...events[0], prevented: true };
  if (readings > 0 && !prevented) events[0] = { ...events[0], readings };

  // endings
  // Defeat is checked before victory; the two cannot coincide. A rival
  // unification is checked last, so a play that wins for the human is never
  // mistaken for one that loses to somebody else.
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
    // Only a free faction wins: a vassal's realm is a strict subset of its
    // root's, so victory belongs to roots.
    !overlords.has(humanFaction) &&
    fullRealmOf(humanFaction, overlords, incorporated).size >= winSize
  ) {
    phase = "victory";
    events.push({ turn: state.turn, playerId: p.id, type: "victory" });
  } else {
    const unifier = state.factionIds.find(
      (f) =>
        f !== humanFaction &&
        !(f in incorporated) &&
        !overlords.has(f) &&
        fullRealmOf(f, overlords, incorporated).size >= winSize,
    );
    if (unifier !== undefined) {
      phase = "defeat";
      events.push({
        turn: state.turn, playerId: p.id, type: "unified",
        overlordFactionId: unifier,
      });
    }
  }

  return {
    ...state, phase, players, overlords, incorporated, guards, omens, miasma,
    settlements, defense, disease, turnips, wealth, respites, rulers,
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
 *  carries every play the turn made. */
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
