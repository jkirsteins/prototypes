import {
  CARDS, CONSUMED_CARDS, guardAgainst, isGuardCard, isMarchCard, isTributeCard,
  startingDeck, shuffle, TRIBUTE_CARDS, type Rng, type Strategy,
} from "./cards";

import {
  fullRealmOf, incorporatedRealmOf,
  type Incorporated, type Overlords,
} from "./relations";
import {
  addDisease, applyDamage, applyHeal, clearDiseaseOf, DEFAULT_DEFENSE_MAX,
  defenseMaxOf, defenseOf, FORTIFY_HEAL, HARVEST_FEAST_HEAL, HILLFORT_HEAL,
  independenceGateOpen, PLAGUE_DAMAGE_PER_STACK, LAND_GROWTH, STRONG_BONUS,
  subjugationGateOpen,
  transferAllDiseaseTo, turnipThresholdFor, WAR_COUNCIL_LEADERSHIP,
  type Defense, type Disease,
} from "./defense";
import {
  armyCapOn, attackDamageFor, attackMultiplier, attackReach,
  ESCAPE_RESPITE_TURNS, freeArmiesFor, greatRaidMarches, marchSourcesAgainst,
  respiteExpiry,
  marchTargetsFrom, outbreakPolygons, plagueMultiplier, playableSet,
  turnipThresholdOn, validTargetsFor, wealthIncomeFor,
  type Guards, type Omens, type RulesView,
} from "./playability";
import {
  addArmy, addClaim, addMarch, axesOf, axisKeyOf, claimKeyOf, clearClaims,
  clearMarches,
  lapsedClaimsOf, lapsedMarchesOf, resolveAxis,
  type Armies, type Claims, type Marches,
} from "./marches";
import {
  autoHarvestChoice, harvestCard, type HarvestChoice,
} from "./harvest";
import {
  damageAfterTerrain, hasPassive, playsTurns, RESTLESS_RAID_CHANCE,
  seedPassives, stripOnCapture, WILD_LANDS_HEAL, WILD_LANDS_HEAL_CHANCE,
  type Passives,
} from "./passives";
import {
  hasRuler, initialRulers, leadersByFaction, leadershipByFaction, replaceRuler,
  rulerNameOf, rulerOf, vacateRulers, type Rulers,
} from "./rulers";
import { DEFAULT_RULES, sweepsHandAtTurnEnd, type RuleSelections } from "./rules";
import { sweepLapsed } from "./timed";

export type GameEventType =
  | "draw" | "play" | "reshuffle" | "discard"
  | "subjugated" | "released" | "incorporated" | "independence" | "tribute"
  | "settled"
  | "healed" | "transferred" | "disease-spread" | "plagued" | "winds-shifted"
  | "march-resolved" | "march-lapsed"
  | "harvest-earned" | "harvest-picked" | "harvest-burned"
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
  /** The OTHER end of a march: the land the army marched out of, when
   *  `targetFactionId` is the land it hit, and the land it was aimed at when a
   *  counter threw it back onto its own source. Also stamped on the `play`
   *  event that declares a march, so the arrow's tail survives a reload of the
   *  log alone. */
  sourceFactionId?: string;
  /** march-resolved: what the two sides of the clash were worth, attacker
   *  first. `amount` is only the leftover that landed; these are what it was
   *  the leftover OF, which is the whole story of a counter-raid and cannot be
   *  reconstructed once the marches are gone. Absent on an uncontested
   *  landing, where the leftover is the whole strength. */
  clash?: { incoming: number; counter: number };
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
  /** plagued: the actor's OWN disease stacks cleared from this polygon by
   *  the same play - `clearDiseaseOf` empties every polygon at once, and
   *  this is the one place each polygon's share of that clear is recorded,
   *  so a `disease-spread` earlier in the same batch has a `plagued` to
   *  walk back through rather than reading a store already zeroed by a
   *  clear the walk was never told about. Absent (never 0): a polygon with
   *  no stacks of the actor's own never gets a `plagued` event at all. */
  stacksSpent?: number;
  /** winds-shifted: every OTHER owner's stacks this polygon lost to the
   *  actor's claim, by faction id. The event's own `amount` already carries
   *  the actor's gain (their sum); this is the breakdown the walk needs to
   *  zero each loser's own count, or an earlier `disease-spread` for that
   *  loser in the same batch would walk back through a store the claim had
   *  already emptied. Absent when nobody else held a stack there. */
  losses?: Readonly<Record<string, number>>;
  /** tribute: the coins this payment moved from the vassal to its lord. */
  wealth?: number;
  /** harvest-picked: this card came WITH the harvest rather than being the
   *  one chosen from the offer. Two identical "kept X" lines read as the
   *  player having picked twice. */
  bonus?: boolean;
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
  /** Attacks declared but not yet landed, keyed by direction. A Raid played on
   *  turn T lands at the start of the actor's turn T+1, resolved in
   *  `beginTurn`; until then it is an arrow on the map that anyone may answer.
   *  See src/marches.ts. */
  marches: Marches;
  /** Subjugations declared but not yet answered (src/marches.ts). A Subjugate
   *  is a demand made a turn ahead, like a raid: everyone sees it coming and
   *  the target has a turn to put its defenses back above the gate. */
  claims: Claims;
  /** Polygon id -> armies stationed there; absent = ARMIES_PER_POLYGON, the
   *  sparse-with-a-default convention `defense` uses. One march holds one
   *  army of its source until it lands, so armies are what caps how many
   *  attacks a realm can have in flight at once. */
  armies: Armies;
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
  /** Polygon id -> the passive statuses it carries (src/passives.ts). Seeded
   *  at the deal in `pickFaction`; the writers after that are capture, which
   *  strips what said nobody held the land, and any future card that grants
   *  or removes one. */
  passives: Passives;
  /** A subjugation the LOCAL player has just made and not yet answered for:
   *  how many defense points to move from the land it was taken with into the
   *  land taken. Null when there is nothing to answer.
   *
   *  Held on the state rather than resolved inside the play because it is a
   *  question, and only a human is asked it - an AI seat moves its own points
   *  by `autoTransfer` on the spot. Nothing in the rules blocks on it: the
   *  points sit where they are until the player says, and `transferDefense`
   *  clamps at the moment it applies, so a board that moved underneath the
   *  modal cannot produce an impossible transfer. */
  pendingTransfer: { from: string; to: string } | null;
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

/** Grow turnips plays that earn one Turnip harvest in a world nobody handed a
 *  map to. The real threshold is a land's own, `turnipThresholdOn` in
 *  src/playability.ts: a faction's home ceiling divided by `DEFENSE_PER_ARMY`,
 *  so a big land musters more armies AND waits longer between harvests. This
 *  is only what `DEFAULT_DEFENSE_MAX` works out to, kept as a name for the
 *  boot-param clamp and the tests to quote. */
export const TURNIP_HARVEST_THRESHOLD = turnipThresholdFor(DEFAULT_DEFENSE_MAX);

/** Further settlements a land gets in a world nobody handed a map to. */
export const DEFAULT_SITE_CAP = 3;

/** Lands needed to win: half the roster, rounded up. Derived rather than
 *  hardcoded so it cannot rot when the map changes. */
export function victoryRealmSize(factionCount: number): number {
  return Math.ceil(0.5 * factionCount);
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
    marches: state.marches,
    claims: state.claims,
    armies: state.armies,
    passives: state.passives,
    leadership: leadershipByFaction(state.rulers),
    leaders: leadersByFaction(state.rulers),
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
    marches: {},
    claims: {},
    armies: {},
    wealth: {},
    respites: {},
    ethnicities,
    passives: {},
    pendingTransfer: null,
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

/** The most defense a transfer may move from `from` into `to`: what the
 *  origin actually has, and what the destination has room for. Both halves
 *  matter - a land cannot give away points it does not hold, and points poured
 *  past a ceiling would vanish. */
export function transferLimit(
  state: GameState, from: string, to: string,
): number {
  const v = { defense: state.defense, defenseMax: state.defenseMax };
  const room = defenseMaxOf(v, to) - defenseOf(v, to);
  return Math.max(0, Math.min(defenseOf(v, from), room));
}

/** What a seat nobody can ask moves into a land it has just taken: half of
 *  what the origin holds, which leaves the origin able to defend itself and
 *  gives the new holding something to stand on. Deterministic - no rng, so an
 *  AI seat's conquest replays identically. */
export function autoTransfer(
  state: GameState, from: string, to: string,
): number {
  const held = defenseOf(
    { defense: state.defense, defenseMax: state.defenseMax }, from,
  );
  return Math.min(Math.floor(held / 2), transferLimit(state, from, to));
}

/** Moves defense points between two lands and clears the pending question.
 *  Clamped through `transferLimit`, so an amount from a modal the board moved
 *  under is trimmed rather than trusted. An amount of 0 is a real answer: the
 *  player keeping their own defenses where they are. */
export function transferDefense(
  state: GameState, amount: number,
): GameState {
  const pending = state.pendingTransfer;
  if (pending === null) return state;
  return {
    ...applyTransfer(state, pending.from, pending.to, amount),
    pendingTransfer: null,
  };
}

/** The move itself, on any two lands. ONE event, its own type: the points
 *  leave one land and arrive at another, and a pair of heal/damage lines
 *  would say two unrelated things happened. `scoreMovesOf` walks both ends off
 *  this single event, so the log, the summary and the badges cannot disagree.
 *
 *  `targetFactionId` is the land that GAINED and `sourceFactionId` the one
 *  that gave, the same way a march names the land it hit and the land it left
 *  from. */
function applyTransfer(
  state: GameState, from: string, to: string, amount: number,
): GameState {
  const moved = Math.max(0, Math.min(amount, transferLimit(state, from, to)));
  if (moved === 0) return state;
  const v = { defense: state.defense, defenseMax: state.defenseMax };
  let defense = applyDamage(v, from, moved);
  defense = applyHeal({ defense, defenseMax: state.defenseMax }, to, moved);
  const actor = state.players[state.current];
  return {
    ...state,
    defense,
    log: appendEvents(state, [{
      turn: state.turn, playerId: actor?.id ?? 1, type: "transferred",
      targetFactionId: to, sourceFactionId: from, amount: moved,
    }]),
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
  const deck = shuffle(startingDeck(strategy), rng);
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

/** How many factions take turns on a map. Everybody else keeps a seat and a
 *  deck and simply never plays - see `keeps-to-itself` in src/passives.ts.
 *  Clamped to the land count, so a three-land test map has everybody acting. */
export const MAX_ACTIVE = 5;

/** Which factions take turns: the human's pick, any reserved pick (a
 *  multiplayer guest), then lands drawn from a seeded shuffle of the rest,
 *  skipping any that borders one already chosen.
 *
 *  The spacing pass can run out of room - a small or a chain-shaped map - so a
 *  second pass fills what is left without the test. Placement never fails, and
 *  that fallback is the only reason two acting lands may end up adjacent. */
function actingFactions(
  state: GameState, humanFactionId: string, reserved: string[], rng: Rng,
): string[] {
  const out = [humanFactionId];
  for (const id of reserved) {
    if (id !== humanFactionId && state.factionIds.includes(id) && !out.includes(id)) {
      out.push(id);
    }
  }
  const cap = Math.max(out.length, Math.min(MAX_ACTIVE, state.factionIds.length));
  const pool = shuffle(state.factionIds.filter((id) => !out.includes(id)), rng);
  const spaced = (id: string): boolean =>
    out.every((placed) => !(state.adjacency[placed] ?? []).includes(id));
  for (const id of pool) {
    if (out.length >= cap) break;
    if (spaced(id)) out.push(id);
  }
  for (const id of pool) {
    if (out.length >= cap) break;
    if (!out.includes(id)) out.push(id);
  }
  return out;
}

/** Every faction gets a seat and the same starting deck; only `MAX_ACTIVE` of
 *  them take turns, and the rest carry `keeps-to-itself`. Each AI seat rolls
 *  its build, seeded - one rng draw per AI seat, in seat order, BEFORE its
 *  deck is shuffled, so the draw count per seat is a frozen contract the same
 *  way the old deck builder's was (tests/rng-isolation.test.ts pins it). The
 *  acting draw comes before the deal and the status roll after it. */
export function pickFaction(
  state: GameState,
  factionId: string,
  rng: Rng,
  /** Factions besides the human's that must take turns - a multiplayer
   *  guest's pick. Everything else is chosen at random. */
  opts?: { reservedFactionIds?: string[] },
): GameState {
  if (state.phase !== "pick-faction") return state;
  if (!state.factionIds.includes(factionId)) return state;
  const acting = actingFactions(
    state, factionId, opts?.reservedFactionIds ?? [], rng,
  );
  // Half the ACTING rivals play Pestilence, randomly which - a coin per seat
  // gave runs where every rival raided and the disease half of the game was
  // never seen. Which halves they are is still a draw, so two runs of the same
  // map are not the same match-up; only how many is fixed.
  const rivals = acting.filter((id) => id !== factionId);
  const pestilent = new Set(
    shuffle([...rivals], rng).slice(0, Math.floor(rivals.length / 2)),
  );
  const others = state.factionIds.filter((id) => id !== factionId);
  const players = [
    makePlayer(1, factionId, state.humanStrategy, rng),
    ...others.map((id, i) =>
      makePlayer(
        i + 2, id, pestilent.has(id) ? "pestilence" : "warpath", rng,
      ),
    ),
  ];
  const passives = seedPassives(state.factionIds, acting, rng);
  // Only the factions that act keep a leader. Everything else about a quiet
  // land follows from the vacancy: no ruler, no turn, and no turn even after
  // somebody takes it.
  const rulers = vacateRulers(state.rulers, acting);
  return beginTurn(
    { ...state, phase: "playing", players, current: 0, passives, rulers }, rng,
  );
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
    // A march lands at the start of its actor's NEXT turn, a turn after the
    // Raid that declared it and from a batch that opens with no play. The
    // causing card is a turn in the past and is named on the line itself, so
    // there is nothing here to indent under.
    case "march-resolved":
    case "march-lapsed":
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
    case "healed":
    case "transferred":
    case "disease-spread":
    case "plagued":
    case "winds-shifted":
    // The bar crossing follows the turnip play that crossed it; the pick
    // follows the harvest play it was made on.
    case "harvest-earned":
    case "harvest-picked":
    case "harvest-burned":
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
  // Vacant seats have no name to stamp - a raid out of a land nobody leads is
  // still logged, it just has nobody to credit it to.
  return factionId === undefined
    ? ""
    : rulerNameOf(state.rulers, factionId) ?? "";
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
  // Marches land next, after the gate and before the draw. After the gate,
  // because the gate answers for the defenses as they stood when the vassal's
  // turn came round - letting its overlord's own pending raid land first would
  // retroactively deny an escape that had already been earned. Before the
  // draw, so the hand this seat decides with reflects the damage.
  const landed = resolveMarches({ ...state, overlords }, p, events);
  let marches = landed.marches;
  let claims = state.claims;
  let defense = landed.defense;
  let passives = state.passives;
  let pendingTransfer = state.pendingTransfer;

  /** A land walked into by an army, or subjugated any other way outside a
   *  play. The same allegiance move `landSubjugation` makes inside `playCard`,
   *  and the same question afterwards: how much defense to send with it. */
  const takeLand = (land: string, by: string, from: string): void => {
    const formerLord = overlords.get(land);
    overlords.set(land, by);
    passives = stripOnCapture(passives, land);
    players = updateFaction(players, land, (pl) => {
      const clean = stripTribute(pl);
      return { ...clean, deck: shuffle([...clean.deck, ...TRIBUTE_CARDS], rng) };
    });
    events.push({
      turn: state.turn, playerId: p.id, type: "subjugated",
      targetFactionId: land, overlordFactionId: by,
      ...(formerLord !== undefined ? { formerOverlordFactionId: formerLord } : {}),
    });
    // The human is asked; everybody else moves half on the spot. Only one
    // question can be pending at a time - a second capture in the same batch
    // keeps the first, because the modal answers about one pair of lands.
    const seat = state.players.findIndex((pl) => pl.factionId === by);
    if (seat === state.humanSeat && pendingTransfer === null) {
      pendingTransfer = { from, to: land };
    } else {
      const moved = autoTransfer(
        { ...state, defense, defenseMax: state.defenseMax }, from, land,
      );
      if (moved > 0) {
        const v = { defense, defenseMax: state.defenseMax };
        defense = applyHeal(
          { defense: applyDamage(v, from, moved), defenseMax: state.defenseMax },
          land, moved,
        );
        events.push({
          turn: state.turn, playerId: p.id, type: "transferred",
          targetFactionId: land, sourceFactionId: from, amount: moved,
        });
      }
    }
  };

  // Claims land before marches are declared and after they have resolved: a
  // demand that arrives to find the land still broken takes it, and a land
  // taken this way cannot send its armies at its new lord - those raids are
  // called off, while anything it aimed elsewhere flies on. Wars have not
  // stopped, only this one.
  for (const { key, claim } of lapsedClaimsOf(claims, p.factionId, state.turn)) {
    claims = clearClaims(claims, [key]);
    const stillOpen =
      subjugationGateOpen(
        { defense, defenseMax: state.defenseMax }, claim.to,
      ) &&
      respiteExpiry({ respites, turn: state.turn }, claim.to) === undefined &&
      !fullRealmOf(claim.actor, overlords, state.incorporated).has(claim.to);
    if (!stillOpen) {
      // The land put its defenses back up, or somebody else took it first.
      events.push({
        turn: state.turn, playerId: p.id, type: "march-lapsed",
        cardId: "subjugate",
        targetFactionId: claim.to, sourceFactionId: claim.from,
      });
      continue;
    }
    takeLand(claim.to, claim.actor, claim.from);
    const lordRealm = fullRealmOf(claim.actor, overlords, state.incorporated);
    for (const axis of axesOf(marches)) {
      for (const march of [...axis.fromA, ...axis.fromB]) {
        if (march.actor !== claim.to || !lordRealm.has(march.to)) continue;
        marches = clearMarches(marches, [
          ...Object.entries(marches)
            .filter(([, m]) => m === march)
            .map(([key]) => key),
        ]);
        events.push({
          turn: state.turn, playerId: p.id, type: "march-lapsed",
          cardId: march.cardId,
          targetFactionId: march.to, sourceFactionId: march.from,
        });
      }
    }
  }

  for (const capture of landed.captures) {
    // Only a faction with a LEADER takes land. A restless raid out of a land
    // nobody leads is a raid, not a conquest - without this the grey middle
    // quietly ate itself, and lands with no chief to answer for them ended up
    // holding vassals.
    if (!hasRuler(state.rulers, capture.by)) continue;
    if (fullRealmOf(capture.by, overlords, state.incorporated).has(capture.land)) {
      continue;
    }
    takeLand(capture.land, capture.by, capture.from);
  }

  // Wild lands: a land nobody tends grows its defenses back on its own. Rolled
  // once a ROUND - at the wrap onto the first seat - and not once a turn, so
  // five acting factions do not make it a five-times-faster recovery. It moves
  // a defense score, so it is logged and walked; the seat whose turn is
  // beginning owns the line, the same turn-start-clock convention the
  // independence gate above already keeps.
  if (state.current === 0) {
    // A land that was hit THIS round does not also grow back in it. The heal
    // ran after the marches landed, so a raid arriving on a wild land could be
    // undone in the same batch: the log said the raid landed for 1 and the
    // badge never moved, which reads as an attack that did nothing.
    const struckThisRound = new Set(
      events
        .filter((e) => e.type === "march-resolved" || e.type === "plagued")
        .map((e) => e.targetFactionId),
    );
    for (const polygon of state.factionIds) {
      if (!hasPassive(state.passives, polygon, "wild-lands")) continue;
      if (struckThisRound.has(polygon)) continue;
      const v = { defense, defenseMax: state.defenseMax };
      if (defenseOf(v, polygon) >= defenseMaxOf(v, polygon)) continue;
      if (rng() >= WILD_LANDS_HEAL_CHANCE) continue;
      defense = applyHeal(v, polygon, WILD_LANDS_HEAL);
      // The land's OWN seat owns the line, never the seat whose turn happens to
      // be starting. The log tags an entry `.log-mine` off `playerId` and lets
      // it through every filter, so charging these to the human made a wild
      // land on the far side of the map read as something the player did, and
      // kept it on screen while the log was pinned to somebody else's realm.
      const owner = players.find((pl) => pl.factionId === polygon);
      events.push({
        turn: state.turn, playerId: owner?.id ?? p.id, type: "healed",
        targetFactionId: polygon, amount: WILD_LANDS_HEAL,
      });
    }
    // The restless middle of the map. A quiet land nobody holds sends the odd
    // raid at a neighbour, and BOTH halves happen here at the round wrap: a
    // march resolves in its actor's own `beginTurn`, so a land that never
    // takes a turn would otherwise leave its arrow standing for the rest of
    // the game. Landing first and declaring second, so an arrow stands for
    // exactly one round and can be answered in it.
    // The status IS the condition. A taken land loses it on capture, so
    // "unheld" needs no test of its own here - asking twice is how the two
    // answers start to differ.
    const restless = state.factionIds.filter(
      (land) => hasPassive(state.passives, land, "keeps-to-itself"),
    );
    // Whose arrows land here: every seat that will never see a `beginTurn` of
    // its own. `advance` skips a leaderless seat, so a march declared by one
    // would otherwise stand on the map for the rest of the game - never
    // resolving, never expiring, and never explaining itself in the log. That
    // is not only the restless lands: taking a quiet land strips the status
    // while its arrow is still in flight, and the vacancy is what outlives it.
    const dormant = state.factionIds.filter(
      (land) => !hasRuler(state.rulers, land),
    );
    for (const land of dormant) {
      const seat = players.find((pl) => pl.factionId === land);
      if (seat === undefined) continue;
      const out = resolveMarches(
        { ...state, overlords, marches, defense }, seat, events,
      );
      marches = out.marches;
      defense = out.defense;
      for (const capture of out.captures) {
        if (!hasRuler(state.rulers, capture.by)) continue;
        if (
          fullRealmOf(capture.by, overlords, state.incorporated).has(capture.land)
        ) {
          continue;
        }
        takeLand(capture.land, capture.by, capture.from);
      }
    }
    for (const land of restless) {
      if (rng() >= RESTLESS_RAID_CHANCE) continue;
      const seat = players.find((pl) => pl.factionId === land);
      if (seat === undefined) continue;
      const view = { ...viewOf({ ...state, players }), marches, defense };
      if (freeArmiesFor(view, land) === 0) continue;
      const targets = marchTargetsFrom(view, land, land);
      if (targets.length === 0) continue;
      const to = targets[Math.floor(rng() * targets.length)];
      marches = addMarch(marches, {
        actor: land, from: land, to, cardId: "raid",
        damage: attackDamageFor(view, land, "raid").damage,
        holdsArmy: true, expiry: state.turn + 1,
      });
      // Logged as the play it reads as on the map: an arrow with a strength on
      // it, answerable by a counter-raid like any other. No card leaves a deck
      // - this is the land's own restlessness, not a hand being played.
      events.push({
        turn: state.turn, playerId: seat.id, type: "play", cardId: "raid",
        targetFactionId: to, sourceFactionId: land,
      });
    }
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
    ...state, players, overlords, wealth, marches, claims, defense, passives,
    pendingTransfer,
    // The lapsed half is discarded: a run-out respite moves nothing and the
    // badge already counted it down, so there is nothing to report.
    respites: sweepLapsed(respites, state.turn, (e) => e).kept,
    log: appendEvents(state, events), playedThisTurn: false,
  };
}

/** Lands every march this seat declared a turn ago, and every counter standing
 *  against one of them.
 *
 *  Resolution is per AXIS, not per march: both directions of a clash come off
 *  the board together and only the difference between the two sides lands, on
 *  whichever side pushed less hard. That is why a counter still standing in
 *  flight is pulled in here even though its own expiry has not come round -
 *  "the earlier of the two turns" is what makes a counter-raid an answer
 *  rather than a trade, and leaving half a clash on the board would let the
 *  attacker's own resolution hit before the counter it provoked.
 *
 *  Pushes onto `events` and returns the moved stores; the caller owns the
 *  batch. Consumes no rng, deliberately - `tests/rng-isolation.test.ts` can
 *  only catch nondeterminism, not an added draw, so the discipline has to be
 *  structural. */
function resolveMarches(
  state: GameState,
  p: PlayerState,
  events: GameEvent[],
): { marches: Marches; defense: Defense; captures: Capture[] } {
  const captures: Capture[] = [];
  const lapsed = lapsedMarchesOf(state.marches, p.factionId, state.turn);
  if (lapsed.length === 0) {
    return { marches: state.marches, defense: state.defense, captures };
  }
  const view = viewOf(state);
  let marches = state.marches;
  let defense = state.defense;

  // A march whose ground moved under it while it was in flight is dropped:
  // the army has no land left to have marched out of, or the land it was
  // aimed at is no longer something its actor may attack. Both are the
  // ordinary consequence of somebody else's turn, so they are reported.
  //
  // The source test is two questions, not one. A polygon stays in its own
  // `fullRealmOf` even after it is annexed - the id is the land's, and the
  // land is still there - so the second question is who HOLDS it now. An
  // annexed land answers to its annexer, and an army cannot march out of a
  // land its owner has lost.
  const alive: typeof lapsed = [];
  for (const entry of lapsed) {
    const realm = fullRealmOf(entry.march.actor, state.overlords, state.incorporated);
    const reach = attackReach(view, entry.march.actor);
    const holder = state.incorporated[entry.march.from] ?? entry.march.from;
    if (
      realm.has(entry.march.from) && realm.has(holder) &&
      reach.has(entry.march.to)
    ) {
      alive.push(entry);
      continue;
    }
    marches = clearMarches(marches, [entry.key]);
    events.push({
      turn: state.turn, playerId: p.id, type: "march-lapsed",
      cardId: entry.march.cardId,
      targetFactionId: entry.march.to, sourceFactionId: entry.march.from,
    });
  }
  if (alive.length === 0) return { marches, defense, captures };

  // Only the axes the landing marches run along, but each taken WHOLE, so a
  // counter still in flight is spent answering the attack it was declared
  // against rather than surviving to strike an undefended land next turn.
  const landing = new Set(alive.map((e) => axisKeyOf(e.march.from, e.march.to)));
  for (const axis of axesOf(marches)) {
    if (!landing.has(axisKeyOf(axis.a, axis.b))) continue;
    marches = clearMarches(marches, axis.keys);
    const { loser, delta, totalA, totalB } = resolveAxis(
      axis.a, axis.b, axis.fromA, axis.fromB,
    );
    const contested = axis.fromA.length > 0 && axis.fromB.length > 0;
    // A standoff still gets a line. It moves no score, so it carries no
    // `amount` - but two armies met and both are spent, and a player whose
    // raid was answered exactly must not be left thinking their card did
    // nothing. `a` and `b` are the axis's own sorted ends, since neither side
    // is the winner and calling one of them the target would be a lie.
    if (loser === null || delta <= 0) {
      if (contested) {
        events.push({
          turn: state.turn, playerId: p.id, type: "march-resolved",
          cardId: axis.fromA[0].cardId,
          targetFactionId: axis.a, sourceFactionId: axis.b,
          clash: { incoming: totalB, counter: totalA },
        });
      }
      continue;
    }
    const winner = loser === axis.a ? axis.b : axis.a;
    // The ground has its say on the leftover that actually lands, not on what
    // either side set out with: a counter-raid is answered by armies, a hill
    // by whatever gets past them.
    const dealt = damageAfterTerrain(view, loser, delta);
    const before = defenseOf({ defense, defenseMax: state.defenseMax }, loser);
    const moved = Math.min(before, dealt);
    // An army arriving at a land with nothing left to fight takes it instead.
    // This is what makes two raids on a broken land worth timing: the first
    // flattens it and the second walks in, and neither needs a Subjugate.
    if (before === 0) {
      const spear = (loser === axis.a ? axis.fromB : axis.fromA)[0];
      if (spear !== undefined) {
        captures.push({ land: loser, by: spear.actor, from: spear.from });
      }
      continue;
    }
    if (moved <= 0) continue;
    defense = applyDamage(
      { defense, defenseMax: state.defenseMax }, loser, dealt,
    );
    events.push({
      turn: state.turn, playerId: p.id, type: "march-resolved",
      // The card of whichever side actually landed - the counter's, when a
      // counter won, since that is the play the damage came out of.
      cardId: (loser === axis.a ? axis.fromB : axis.fromA)[0].cardId,
      targetFactionId: loser, sourceFactionId: winner, amount: moved,
      // `incoming` is always the strength aimed AT the loser and `counter`
      // what the loser mustered against it, whichever end of the axis that
      // turned out to be. The label the player reads is delta out of incoming.
      ...(contested
        ? {
            clash: loser === axis.a
              ? { incoming: totalB, counter: totalA }
              : { incoming: totalA, counter: totalB },
          }
        : {}),
    });
  }
  return { marches, defense, captures };
}

/** A land taken by an army walking into it: which land, whose army, and the
 *  land the army came out of - the origin a defense transfer would move
 *  points from. */
interface Capture {
  land: string;
  by: string;
  from: string;
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
   *  a fast-forward, an AI seat) gets `autoHarvestChoice`.
   *
   *  `sourceId` is the land a Raid's army marches out of - the tail of the
   *  arrow. Only Raid reads it; Great raid assigns its own sources through
   *  `greatRaidMarches`, and every other card ignores it. A Raid that names
   *  no legal source is refused, the same way a targeted card naming no legal
   *  target is: an arrow with no tail is not a play. */
  opts?: { harvest?: HarvestChoice; sourceId?: string },
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
  // A named source is checked on the same footing as the target and refused
  // when illegal. An UNnamed one defaults to the first legal source in faction
  // order, which is the difference between the two: every caller has always
  // had to name a target, while a source is new, and the sim, a fast-forward
  // and a lobby guest on an older build all have a legitimate no-opinion.
  let sourceId: string | undefined;
  if (isMarchCard(cardId) && targetId !== undefined) {
    const sources = marchSourcesAgainst(viewOf(state), p.factionId, targetId);
    if (sources.length === 0) return state;
    if (opts?.sourceId !== undefined && !sources.includes(opts.sourceId)) {
      return state;
    }
    sourceId = opts?.sourceId ?? sources[0];
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
  let marches = state.marches;
  let claims = state.claims;
  const armies = state.armies;
  let passives = state.passives;
  let defenseMax = state.defenseMax;

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
      // The tail of the arrow this play just drew, so the log line can name
      // where the army left from without holding on to the march itself.
      ...(sourceId !== undefined ? { sourceFactionId: sourceId } : {}),
    },
  ];

  // Move the played card out of hand first, then apply effects to players. A
  // consumed card (src/cards.ts) skips the discard entirely and is simply gone
  // - a deck this small reshuffles its discard back every few turns, so a card
  // whose effect is permanent has to leave or it compounds.
  let players = state.players.map((pl, i) =>
    i === state.current
      ? {
          ...pl,
          hand: pl.hand.filter((_, j) => j !== cardIndex),
          discard: CONSUMED_CARDS.has(cardId)
            ? pl.discard
            : [...pl.discard, cardId],
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

  /** One attack card committing one army. No event: the `play` event carries
   *  both ends of the arrow already, and the damage is a promise about next
   *  turn, not a score that moved - `march-resolved` is where the numbers go.
   *  Expiry is the src/timed.ts convention, one turn out, which is this seat's
   *  next `beginTurn` whichever seat it is. */
  const declareMarch = (
    from: string, to: string, damage: number, holdsArmy = true,
  ): void => {
    marches = addMarch(marches, {
      actor: p.factionId, from, to, cardId, damage, holdsArmy,
      expiry: state.turn + 1,
    });
    // An army on the road breaks somebody else's demand of fealty. A land
    // being fought over is a land not submitting to anybody, and this is what
    // makes a raid an answer to a Subjugate rather than a race beside it. Only
    // OTHER factions' claims: your own raid clearing your own claim would make
    // the two cards refuse to be played together.
    for (const { key, claim } of Object.values(claims).map((claim) => ({
      key: claimKeyOf(claim.actor, claim.to), claim,
    }))) {
      if (claim.to !== to || claim.actor === p.factionId) continue;
      claims = clearClaims(claims, [key]);
      events.push({
        turn: state.turn, playerId: p.id, type: "march-lapsed",
        cardId: "subjugate",
        targetFactionId: claim.to, sourceFactionId: claim.from,
      });
    }
  };

  const landHeal = (polygon: string, amount: number): void => {
    // `defenseMax` and not `state.defenseMax`: Prosperous proliferation lifts the
    // ceiling and then heals to it in the same play, and a heal measured
    // against the OLD ceiling would stop one raise short of the new one.
    const v = { defense, defenseMax };
    const before = defenseOf(v, polygon);
    const healed = applyHeal(v, polygon, amount);
    const after = defenseOf({ defense: healed, defenseMax }, polygon);
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
    // A land that has changed hands is no longer a land nobody holds, so the
    // statuses that said so go. What describes the ground - and the fact that
    // this land has no ambitions of its own - stays.
    passives = stripOnCapture(passives, target);
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
  } else if (isMarchCard(cardId) && targetId !== undefined && sourceId !== undefined) {
    // Declared, not landed. Through `attackDamageFor` rather than a local
    // formula: the card tip quotes the same call, so what the arrow promises
    // and what lands next turn cannot drift.
    declareMarch(sourceId, targetId, attackDamageFor(view, p.factionId, cardId).damage);
  } else if (cardId === "great-raid") {
    const { damage } = attackDamageFor(view, p.factionId, cardId);
    // `greatRaidMarches` is the one list: legality asked it, the card tip
    // quotes it, and it is already in faction order with its sources assigned
    // deterministically, so a seeded run declares the same fan every time.
    for (const { from, to, holdsArmy } of greatRaidMarches(view, p.factionId)) {
      declareMarch(from, to, damage, holdsArmy);
    }
  } else if (cardId === "prosperous-proliferation" && targetId !== undefined) {
    // The ceiling and the score move together. Raising one alone would be a
    // trap: both gates are shares OF the ceiling, so a land whose ceiling grew
    // while its score stood still would sit closer to its own subjugation gate
    // for having been improved.
    defenseMax = {
      ...defenseMax,
      [targetId]: defenseMaxOf(
        { defense, defenseMax }, targetId,
      ) + LAND_GROWTH,
    };
    landHeal(targetId, LAND_GROWTH);
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
      const damage = damageAfterTerrain(
        view, polygon, stacks * PLAGUE_DAMAGE_PER_STACK * mult,
      );
      const before = defenseOf({ defense, defenseMax: state.defenseMax }, polygon);
      const moved = Math.min(before, damage);
      defense = applyDamage({ defense, defenseMax: state.defenseMax }, polygon, damage);
      // `plagued`, not `damaged`, even when the polygon was already at 0:
      // the stacks burned there either way, and the log must say where they
      // went. `amount` is the defense moved, 0 included.
      events.push({
        turn: state.turn, playerId: p.id, type: "plagued", cardId,
        targetFactionId: polygon, amount: moved, stacksSpent: stacks,
      });
    }
    disease = clearDiseaseOf(disease, p.factionId);
  } else if (cardId === "foul-winds") {
    // One event per polygon whose ownership moved: the stacks the actor
    // GAINED there (the total held by others before the shift), plus the
    // per-loser breakdown the walk needs to zero each of THEIR counts too.
    for (const polygon of state.factionIds) {
      const owners = disease[polygon];
      if (owners === undefined) continue;
      const losses = Object.fromEntries(
        Object.entries(owners).filter(([owner]) => owner !== p.factionId),
      );
      const gained = Object.values(losses).reduce((sum, n) => sum + n, 0);
      if (gained === 0) continue;
      events.push({
        turn: state.turn, playerId: p.id, type: "winds-shifted", cardId,
        targetFactionId: polygon, amount: gained, losses,
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
  } else if (cardId === "fortify" && targetId !== undefined) {
    landHeal(targetId, FORTIFY_HEAL);
  } else if (cardId === "strong-fortify" && targetId !== undefined) {
    landHeal(targetId, FORTIFY_HEAL + STRONG_BONUS);
  } else if (cardId === "assassinate-ruler" && targetId !== undefined) {
    const out = replaceRuler(rulers, state.ethnicities, targetId, state.turn);
    rulers = out.rulers;
    events[0] = {
      ...events[0],
      targetRuler: out.killed,
      successorRuler: out.successor,
    };
    // No successor: a land with nobody to take up the crown falls to whoever
    // killed its ruler, gate and respite alike bypassed - the killing IS the
    // taking. A guarded play never reaches this branch, so a bodyguard stops
    // it without a second check here.
    if (
      hasPassive(passives, targetId, "no-successor") &&
      !fullRealmOf(p.factionId, overlords, incorporated).has(targetId)
    ) {
      landSubjugation(targetId);
    }
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
    // Declared, not landed - the Raid rule, for the same reason: an
    // allegiance that changed the instant a card hit the table gave the land
    // no chance to answer, and gave everyone else no chance to see it coming.
    // It is made out of the actor's HOME, which is the land whose defenders
    // can march over with it when it lands.
    claims = addClaim(claims, {
      actor: p.factionId, from: p.factionId, to: targetId,
      expiry: state.turn + 1,
    });
  } else if (cardId === "incorporate" && targetId !== undefined) {
    landIncorporation(targetId);
  } else if (cardId === "turnip-harvest") {
    // Choiceless callers - the sim, a `turns=` fast-forward, an AI seat -
    // decide for themselves. The app asks the player first and hands the
    // answer in through `opts`.
    const choice = opts?.harvest ?? autoHarvestChoice(players[state.current]);
    // Burning a card is the one harvest that takes something away. The first
    // copy found, deck before hand before discard: they are the same card, and
    // hunting for a particular copy would be a distinction the player cannot
    // see.
    if (choice.kind === "destroy") {
      players = updateFaction(players, p.factionId, (pl) => {
        const fromDeck = pl.deck.indexOf(choice.cardId);
        if (fromDeck >= 0) {
          return { ...pl, deck: pl.deck.filter((_, i) => i !== fromDeck) };
        }
        const fromHand = pl.hand.indexOf(choice.cardId);
        if (fromHand >= 0) {
          return { ...pl, hand: pl.hand.filter((_, i) => i !== fromHand) };
        }
        const fromDiscard = pl.discard.indexOf(choice.cardId);
        return fromDiscard < 0
          ? pl
          : { ...pl, discard: pl.discard.filter((_, i) => i !== fromDiscard) };
      });
      events.push({
        turn: state.turn, playerId: p.id, type: "harvest-burned",
        cardId: choice.cardId,
      });
    }
    const gained = harvestCard(players[state.current], choice, rng);
    if (gained !== null) {
      players = updateFaction(players, p.factionId, (pl) => ({
        ...pl, deck: shuffle([...pl.deck, gained], rng),
      }));
      events.push({
        turn: state.turn, playerId: p.id, type: "harvest-picked",
        cardId: gained,
        // A card nobody chose by name is worth saying so: "found in the
        // harvest" reads differently from "kept", and the random option is
        // the whole reason the distinction exists.
        ...(choice.kind === "random" ? { bonus: true } : {}),
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
    if (grown >= turnipThresholdOn(view, p.factionId)) {
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
    settlements, defense, defenseMax, disease, turnips, wealth, respites,
    rulers, marches, claims, armies, passives,
    log: appendEvents(state, events),
    // A standard turn is spent by its one play. An unlimited turn stays open
    // until the player says otherwise, even with an empty hand: a turn that
    // ended itself the moment the last card left made the round hand over
    // while the player was still reading what their play had done.
    playedThisTurn: state.rules.turn !== "unlimited",
  };
}

/** Forced discard when nothing in hand is playable. Under rules that refuse
 *  discards, `playableSet` never returns "discard" mode, so this simply never
 *  finds a set to act on and falls through to the no-op return below. */
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
/** The `hand: "sweep"` rule: what the finished turn did not play is discarded.
 *
 *  Done here rather than in `playCard` or `endTurn` because this is the one
 *  place a turn actually ends, whatever ended it - a standard turn's single
 *  play, a forced discard, an unlimited turn's End turn click, or an AI seat
 *  running out of things to do. Silent: it fires identically for every seat
 *  every turn, so a line per card would be the loudest thing in the log while
 *  saying the least, and the player's own hand emptying is on screen. */
function sweepHand(state: GameState): GameState {
  if (!sweepsHandAtTurnEnd(state.rules)) return state;
  const p = state.players[state.current];
  if (p === undefined || p.hand.length === 0) return state;
  return {
    ...state,
    players: state.players.map((pl, i) =>
      i === state.current
        ? { ...pl, hand: [], discard: [...pl.discard, ...pl.hand] }
        : pl,
    ),
  };
}

export function advance(rawState: GameState, rng: Rng): GameState {
  if (rawState.phase !== "playing" || !rawState.playedThisTurn) return rawState;
  const state = sweepHand(rawState);
  // A faction with no leader takes no turn at all, so the loop passes over it
  // exactly as it passes over one that has been incorporated. A conquest does
  // not wake up: taking a land wins the land, not its people's allegiance to
  // a chief who does not exist.
  const inert = (i: number): boolean =>
    state.players[i].factionId in state.incorporated ||
    !hasRuler(state.rulers, state.players[i].factionId);
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
