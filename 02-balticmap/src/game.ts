import {
  CARDS, CONSUMED_CARDS, guardAgainst, isGuardCard, isMarchCard, keywordHas,
  isSingleLandHeal, isTributeCard, repeatGroupOf, startingDeck, shuffle,
  TRIBUTE_CARDS, upgradeCostOf, type Rng, type Strategy,
} from "./cards";

import {
  fullRealmOf, incorporatedRealmOf, isUnheld,
  type Incorporated, type Overlords,
} from "./relations";
import { activeRegion } from "./regions";
import {
  addDisease, applyDamage, applyHeal, capturesOnArrival, clearDiseaseOf,
  DEFAULT_DEFENSE_MAX,
  defenseMaxOf, defenseOf, HARVEST_FEAST_HEAL, independenceGateOpen,
  MIN_RAID_SPEND,
  PLAGUE_DAMAGE_PER_STACK, LAND_GROWTH, SINGLE_LAND_HEAL,
  transferAllDiseaseTo, turnipThresholdFor, WAR_COUNCIL_LEADERSHIP,
  type Defense, type Disease,
} from "./defense";
import {
  aimsUpOwnChain, attackDamageFor, omensMultiplier, attackReach,
  ESCAPE_RESPITE_TURNS, freeArmiesFor, greatRaidMarches, marchSourcesAgainst,
  claimWouldLand, greatRaidPool, greatRaidSpends,
  handLimitFor, marchTargetsFrom, outbreakPolygons,
  MIN_HAND, plagueMultiplier,
  playableSet, spendCeilingOn,
  turnipThresholdOn, validTargetsFor, wealthIncomeFor,
  type Guards, type Omens, type RulesView,
} from "./playability";
import {
  addClaim, addMarch, axesOf, axisKeyOf, claimKeyOf, clearClaims,
  clearMarches,
  lapsedClaimsOf, lapsedMarchesOf, resolveAxis,
  type Armies, type Claims, type Marches,
} from "./marches";
import {
  autoHarvestChoice, BURN_ORDER, harvestCard, removeCopies, SPEND_ORDER,
  type HarvestChoice,
} from "./harvest";
import {
  damageAfterTerrain, hasPassive, quietPassives,
  RESTLESS_RAID_CHANCE, seedTerrain, stripOnCapture, WILD_LANDS_HEAL,
  WILD_LANDS_HEAL_CHANCE, type Passives,
} from "./passives";
import {
  abilitiesByFaction, grantAbility, hasRuler, initialRulers, leadersByFaction,
  leadershipByFaction, replaceRuler, rulerNameOf, rulerOf, vacateRulers,
  type Rulers,
} from "./rulers";
import { BUILD_ABILITIES } from "./abilities";
import { DEFAULT_RULES, sweepsHandAtTurnEnd, type RuleSelections } from "./rules";
import { sweepLapsed } from "./timed";

export type GameEventType =
  | "draw" | "play" | "reshuffle" | "discard"
  | "subjugated" | "released" | "incorporated" | "independence" | "tribute"
  | "settled"
  | "healed" | "transferred" | "disease-spread" | "plagued" | "winds-shifted"
  | "levied"
  | "passive-fired"
  | "march-declared" | "march-resolved" | "march-lapsed"
  | "harvest-earned" | "harvest-picked" | "harvest-burned"
  | "victory" | "played-on" | "defeat" | "unified" | "surrendered";

/** How much defense a raid may tear out of `source`, given what the caller
 *  asked for. Clamped rather than refused - see `playCard`'s `spend` doc.
 *
 *  A land that cannot afford the minimum never reaches here: `marchSourcesFor`
 *  already refuses it, so `playCard`'s source check has turned the play away
 *  above. The `Math.min` with the ceiling is what a wire and a URL are held
 *  to. */
function clampSpend(
  view: RulesView, cardId: string, source: string, want: number | undefined,
): number {
  const ceiling = spendCeilingOn(view, cardId, source);
  return Math.max(
    MIN_RAID_SPEND,
    Math.min(ceiling, Math.floor(want ?? MIN_RAID_SPEND)),
  );
}

/** How a land changed hands.
 *
 *  One `subjugated` event covers every allegiance change, and for a long while
 *  it carried no trace of which one: the notice opened every line with a
 *  literal `card("subjugate")`, so a land taken by a raid was reported as a
 *  Subjugate - a card that is withdrawn from every pool and cannot be in
 *  anybody's hand.
 *
 *  So the cause is an ARGUMENT to the two functions that move an allegiance,
 *  not a field a branch may forget, and the notice renders it through a switch
 *  with no `default`. A new way to take a land therefore stops the build twice
 *  over: once where it must name its cause, and once where somebody must write
 *  the sentence for it. Neither gate can be passed by borrowing another
 *  route's. */
export type SubjugationCause =
  /** An army walked into a land with nothing left to fight. */
  | { via: "conquest"; cardId: string }
  /** A demand declared a turn ago came due and found the gate still open. */
  | { via: "claim"; cardId: string }
  /** A status handed the land over - `no-successor`, when the ruler is
   *  killed. The card that set it off is on the `passive-fired` line above,
   *  and the status is what the player needs named here. */
  | { via: "passive"; passiveId: string };

export type SubjugationVia = SubjugationCause["via"];

/** The causes that ARRIVE: an army or a demand crossing a border, a turn after
 *  the card that sent it. They own a landing line of their own, which is what
 *  `takeLand` pushes and what the submission indents under. A status handing a
 *  land over is not one of them - the `passive-fired` above it is already its
 *  cause line, so it takes the other door. */
type ArrivingCause = Extract<SubjugationCause, { via: "conquest" | "claim" }>;

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
  /** march-resolved, march-lapsed: which marches this event took OFF the
   *  board. Plural because a clash retires both sides and reports once, and
   *  because several arrows down one axis can resolve into a single landing.
   *  This is what lets a departed arrow be matched to the thing that explains
   *  it; without it, an arrow vanishing and an event arriving are two facts
   *  with nothing joining them.
   *
   *  Absent on two of `march-lapsed`'s five emitters, because those two lapse
   *  a CLAIM rather than a march - a Subjugate demand that broke before
   *  landing, or one broken by somebody else's declared march - and a claim
   *  has no `March.id` to name.
   *
   *  Never present on `march-declared` - a declaration puts an arrow ON the
   *  board, the opposite event, and names it through the singular `marchId`
   *  below. The two fields exist so "retired" and "declared" cannot be read
   *  off the same shape by accident. */
  marchIds?: number[];
  /** march-declared: the id this declaration just allocated - the arrow
   *  arriving on the board, matched against `marchIds` above (arrows leaving
   *  it) by a reader building one presentation timeline out of both. Singular
   *  because a declaration commits exactly one army, whichever card sent it. */
  marchId?: number;
  /** march-resolved: the strength aimed AT the loser, whichever end of the
   *  axis that turned out to be. Present on every `march-resolved` an ARMY
   *  caused - which is every one carrying `marchIds`, uncontested landings
   *  and arrivals that moved nothing included, since the arrow the
   *  presentation draws is reconstructed from this event alone and `amount`
   *  cannot stand in for it: `amount` is floored at what the land had
   *  standing, so a 3-strength blow on a 1-defense land reports 1. Absent
   *  exactly where `marchIds` is: the demand-coming-due arrival out of
   *  `landClaims` throws no strength and draws no resolution arrow. */
  incoming?: number;
  /** march-resolved: what the loser mustered against it. Present on a
   *  standoff, which carries no `amount` at all, and alongside `amount` on a
   *  contested landing that moved something. Absent on a `metNothing`
   *  arrival even when two armies met: a capture or spent arrow that landed
   *  nothing carries neither `amount` nor `counter`. */
  counter?: number;
  formerOverlordFactionId?: string; // subjugated: prior lord of the target
  /** subjugated: which route took the land, the discriminant of
   *  `SubjugationCause`. The rest of the cause rides in fields that already
   *  exist - `cardId` for the card it came out of, `passiveId` for the status,
   *  `sourceFactionId` for the land the army or the demand set out from. */
  via?: SubjugationVia;
  /** passive-fired: which status in `PASSIVES` acted, and on a `subjugated`
   *  taken `via: "passive"`, which status took the land. The line names it,
   *  and the name is a `passive()` segment whose hover carries the rule - so a
   *  status doing something is never a thing the player has to already know
   *  about to make sense of. */
  passiveId?: string;
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
  /** victory: this ending was taken with the bar raised to the WHOLE map,
   *  after the player chose to play on past a won run. Read by the log line
   *  and by nothing else.
   *
   *  On the EVENT and not off `GameState.playingOn`, though both are true by
   *  the time the second victory lands: the flag describes the run as it now
   *  stands, so a line reading it would retroactively relabel the FIRST
   *  victory - the one that was honestly won at half the map - as a
   *  whole-map conquest the moment the player carried on. Omitted rather
   *  than set false, the `consequence` convention. */
  playOn?: boolean;
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
  /** The player took the offer to play on past a won run, so their own bar is
   *  the whole map now. `winSizeFor` is the only reader.
   *
   *  A boolean and NOT a seventh `GamePhase`, because the phase genuinely is
   *  "playing" again: a second playing-phase would have to be answered by
   *  every reader of `phase` in the app, and every one of them would be
   *  answering it the same way.
   *
   *  On the state and not in src/main.ts because a guest holds a replica, and
   *  its scoreboard must quote the bar the host's win condition is actually
   *  applying.
   *
   *  One-way. Nothing clears it: the bar it raised is the run's now, and a
   *  player who could put it back would be choosing when to win. */
  playingOn: boolean;
  turn: number; // 1-based
  players: PlayerState[]; // index 0 = human
  current: number;
  /** True once this turn is complete: a standard turn's one play or discard,
   *  or an unlimited turn's explicit endTurn. `advance` refuses to move on
   *  until it is set. */
  playedThisTurn: boolean;
  /** The card a SPENT turn will still accept, or null.
   *
   *  Written by playing a card that declares `CardDef.repeatGroup`: that play
   *  spends the turn like any other and leaves this behind, so the turn goes
   *  on accepting more of the same card and nothing else. Cleared at the next
   *  turn start, and by anything else that ends a turn - only a play re-opens
   *  one.
   *
   *  A card ID rather than a flag because the rule is "another copy of THAT
   *  card", and it is the only thing about the mechanism the state remembers:
   *  how many copies may follow is not counted here, ordinary legality decides
   *  it. Nothing reads this against a card id of its own. */
  repeatGroup: string | null;
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
  /** Faction id -> settlements of that land already called on THIS TURN.
   *  Absent = 0, and `beginTurn` clears the whole map, so a commitment never
   *  outlives the turn that made it.
   *
   *  The settlement half of `freeArmiesOn`: a fortify calls on one settlement
   *  of the land it heals, which is what stops a repeating heal being bounded
   *  only by the hand. Written by the one branch in `playCard` that asks the
   *  card's class (`spendsSettlement`), never by a card literal. */
  settlementsSpent: Record<string, number>;
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
  /** Attacks declared but not yet landed, keyed by the march's own id. A Raid
   *  played on turn T lands at the start of the actor's turn T+1, resolved in
   *  `beginTurn`; until then it is an arrow on the map that anyone may answer.
   *  See src/marches.ts. */
  marches: Marches;
  /** The id the next declared march takes, then one more. Monotonic and
   *  never reused, so an id identifies one army for the length of the run.
   *  On the state rather than in a module because it must be deterministic
   *  and must cross the wire with everything else. */
  nextMarchId: number;
  /** Subjugations declared but not yet answered (src/marches.ts). A Subjugate
   *  is a demand made a turn ahead, like a raid: everyone sees it coming and
   *  the target has a turn to put its defenses back above the gate. */
  claims: Claims;
  /** Polygon id -> armies stationed there; absent = the land's own
   *  `armyCapOn`, the sparse-with-a-default convention `defense` uses. One
   *  march holds one army of its source until it lands, so armies are what
   *  caps how many attacks a realm can have in flight at once. Nothing but a
   *  boot override writes a key: the cap moves when the ceiling does. */
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
  /** Faction id -> a subjugation that faction has made and not yet answered
   *  for: how many defense points to move from the land it was taken with
   *  into the land taken. Absent means nothing to answer.
   *
   *  Held on the state rather than resolved inside the play because it is a
   *  question, and only a human is asked it - an AI seat moves its own points
   *  by `autoTransfer` on the spot. Nothing in the rules blocks on it: the
   *  points sit where they are until the player says, and `transferDefense`
   *  clamps at the moment it applies, so a board that moved underneath the
   *  modal cannot produce an impossible transfer.
   *
   *  Keyed by faction, because "only a human is asked" is more than one
   *  person now. It also decides WHO MAY ANSWER: a transfer crossing the
   *  wire is refused unless it names a conquest the sender actually made.
   *  A single slot would have let a guest that dropped with the modal open
   *  hold the question the host was waiting to be asked.
   *
   *  A QUEUE per faction, in the order the conquests landed, because a turn
   *  can take more than one land: three subjugations owe three questions, and
   *  the modal answers about one pair of lands at a time. A single slot kept
   *  the first question and dropped the rest, so two of the three conquests
   *  sent no defenders and the player was never told why. Answering pops the
   *  front (`transferDefense`), so the questions come in the order the lands
   *  were taken.
   *
   *  A dropped question must NOT fall through to the automatic half - that
   *  would move points out of a land the player was never asked about, the
   *  one thing this exists to prevent. */
  pendingTransfers: Record<string, { from: string; to: string }[]>;
  /** Faction id -> ethnicity id, for the ruler name pools. Map-derived, like
   *  `adjacency`; empty in tests, which then draw from the generic pool. */
  ethnicities: Record<string, string>;
  /** The seats a PERSON plays. Empty for a world simulation with no
   *  privileged seat.
   *
   *  Index 0 is the seat `phase` speaks for - seat 0, the host's, in every
   *  dealt game. There is one phase field and two people cannot hold
   *  different ones, so a second person's screen maps it for itself
   *  (`guestPhaseView` in src/net-protocol.ts).
   *
   *  Two questions ride on this and they are not the same question. "Is a
   *  person playing this faction" is `isHumanFaction`, and it is plural: it
   *  decides who is ASKED rather than automated, and whose chair stays warm
   *  without a chief. "Whose ending is on screen" is index 0 alone. Spelling
   *  them the same way is what gave the two humans different rules. */
  humanSeats: readonly number[];
  /** The build the human confirmed on the build screen; what `pickFaction`
   *  stamps on seat 0. */
  humanStrategy: Strategy;
  log: GameEvent[];
}

/** What a seat is dealt on the way in. `MIN_HAND` in src/playability.ts, so a
 *  faction on its first land opens at its refill target and draws nothing on
 *  turn 1; the 4th card arrives with the 3rd land. */
export const OPENING_HAND = MIN_HAND;

/** Grow turnips plays that earn one Turnip harvest in a world nobody handed a
 *  map to. The real threshold is a land's own, `turnipThresholdOn` in
 *  src/playability.ts: a faction's home ceiling divided by `DEFENSE_PER_ARMY`,
 *  so a big land musters more armies AND waits longer between harvests. This
 *  is only what `DEFAULT_DEFENSE_MAX` works out to, kept as a name for the
 *  boot-param clamp and the tests to quote. */
export const TURNIP_HARVEST_THRESHOLD = turnipThresholdFor(DEFAULT_DEFENSE_MAX);

/** Further settlements a land gets in a world nobody handed a map to. */
export const DEFAULT_SITE_CAP = 3;

/** The OPENING bar: half the roster, rounded up. Derived rather than hardcoded
 *  so it cannot rot when the map changes.
 *
 *  This is where every faction starts and not what any faction necessarily
 *  needs - a player who chose to play on past a won run is holding out for the
 *  whole map. `winSizeFor` is what applies to a faction, and nothing outside it
 *  may call this: a second caller is a second bar, and the two would disagree
 *  the moment somebody played on. */
export function victoryRealmSize(factionCount: number): number {
  return Math.ceil(0.5 * factionCount);
}

/** The faction whose ending `phase` speaks for - `humanSeats[0]`, the host's
 *  seat in every dealt game - or null in a world simulation with no
 *  privileged seat.
 *
 *  There is one `phase` field and two people cannot hold different ones, so
 *  index 0 alone answers "whose ending is on screen"; a second person's screen
 *  maps it for itself (`guestPhaseView` in src/net-protocol.ts). Spelled once
 *  because the ending and the bar are the same question about the same seat -
 *  see the seats rule in AGENTS.md. */
export function humanFactionOf(
  board: Pick<GameState, "players" | "humanSeats">,
): string | null {
  const seat = board.humanSeats[0];
  return seat === undefined ? null : board.players[seat]?.factionId ?? null;
}

/** Lands this faction's realm must hold to end the run.
 *
 *  The bar, stated once: the win condition, the scoreboard and the concede
 *  line all read it, so the number the player is shown and the number the
 *  engine applies cannot drift.
 *
 *  The whole map is the HUMAN'S OWN bar. Every rival's stays at the opening
 *  half, so a rival can still unify at 13 of 26 and end a play-on run in
 *  defeat - and that risk is the whole reason playing on is a decision rather
 *  than a formality.
 *
 *  It derives the human from the board rather than taking one, because the
 *  one caller that would get it wrong is the scoreboard: `renderScoreboard`
 *  reads its human from `localPlayerId`, which on a GUEST screen is the
 *  guest's seat and not the seat the raised bar belongs to. */
export function winSizeFor(
  board: Pick<
    GameState, "factionIds" | "players" | "humanSeats" | "playingOn"
  >,
  factionId: string,
): number {
  if (board.playingOn && factionId === humanFactionOf(board)) {
    return board.factionIds.length;
  }
  return victoryRealmSize(board.factionIds.length);
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
    settlementsSpent: state.settlementsSpent,
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
    leaderAbilities: abilitiesByFaction(state.rulers),
    leaders: leadersByFaction(state.rulers),
  };
}

/** The realms the active region says already stand, as the two stores hold
 *  them. A land seeded here is in every respect a land taken mid-game: it gets
 *  an `overlords` or `incorporated` entry and nothing else, so `quietPassives`
 *  passes it over (no `keeps-to-itself`, therefore no restless raid) and
 *  `vacateRulers` leaves its chair empty (therefore no turn, ever). That is
 *  exactly what `takeLand` leaves behind, which is why seeding a realm needed
 *  no rule of its own.
 *
 *  Both halves skip an entry naming a land or a holder this roster does not
 *  have - the filter `seedTerrain` already applies, and what lets `sim.ts` and
 *  every three-land test map read the shipped table and get nothing from it.
 *
 *  No rng: this is data, not a roll, so it consumes no draw and cannot shift
 *  the seeded contract tests/rng-isolation.test.ts pins. And no `TRIBUTE_CARDS`
 *  injection, unlike `takeLand`: a seeded vassal never gains a ruler, so it
 *  never takes the turn on which it could draw one, and a conqueror taking it
 *  later injects then. */
function seedRealms(
  factionIds: string[],
): { overlords: Overlords; incorporated: Incorporated } {
  const realms = activeRegion().startingRealms;
  const overlords: Overlords = new Map();
  const incorporated: Incorporated = {};
  if (realms === undefined) return { overlords, incorporated };
  const known = (land: string, holder: string): boolean =>
    factionIds.includes(land) && factionIds.includes(holder);
  for (const [land, holder] of Object.entries(realms.vassals)) {
    if (known(land, holder)) overlords.set(land, holder);
  }
  for (const [land, holder] of Object.entries(realms.incorporated)) {
    if (known(land, holder)) incorporated[land] = holder;
  }
  return { overlords, incorporated };
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
  const realms = seedRealms(factionIds);
  return {
    phase: "main-menu",
    // A run nobody has won yet, so nobody has declined to stop.
    playingOn: false,
    turn: 1,
    players: [],
    current: 0,
    playedThisTurn: false,
    repeatGroup: null,
    rules: { ...DEFAULT_RULES },
    factionIds,
    overlords: realms.overlords,
    incorporated: realms.incorporated,
    guards: {},
    omens: {},
    siteCaps:
      siteCaps ??
      Object.fromEntries(factionIds.map((id) => [id, DEFAULT_SITE_CAP])),
    settlements: {},
    settlementsSpent: {},
    defense: {},
    defenseMax:
      defenseMax ??
      Object.fromEntries(factionIds.map((id) => [id, DEFAULT_DEFENSE_MAX])),
    disease: {},
    miasma: {},
    turnips: {},
    marches: {},
    nextMarchId: 1,
    claims: {},
    armies: {},
    wealth: {},
    respites: {},
    ethnicities,
    passives: {},
    pendingTransfers: {},
    rulers: initialRulers(factionIds, ethnicities),
    humanSeats: [0],
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

/** Moves defense points between two lands and clears that faction's pending
 *  question. Clamped through `transferLimit`, so an amount from a modal the
 *  board moved under is trimmed rather than trusted. An amount of 0 is a real
 *  answer: the player keeping their own defenses where they are.
 *
 *  Named by faction and not by seat, because the question outlives neither -
 *  it is raised at a conquest and answered whenever the person gets to it,
 *  and a faction is what both ends of the wire agree on. */
/** Answers one conquest question: `amount` defenders march from `from` into
 *  `to`, and that conquest leaves the seat's queue.
 *
 *  The pair is NAMED rather than implied, and that is the whole of what makes
 *  a lost answer detectable. Spelled as "the front of whoever's queue", an
 *  answer applied to a board that moved underneath it lands on a different
 *  conquest, or on none - and landing on none returns `state`, which every
 *  caller reads as an ordinary "the rules refused". The question then stays
 *  owed with nobody able to tell that it does. Named, the mismatch is a
 *  refusal with a reason (`NET_ACTION_RULES.transfer`), and a caller can act
 *  on a reason.
 *
 *  Still the FRONT only, not any matching entry: three conquests are answered
 *  in the order the lands fell, and identity is here to detect a stale answer
 *  rather than to offer answering out of order. */
export function transferDefense(
  state: GameState, factionId: string, from: string, to: string,
  amount: number,
): GameState {
  const queue = state.pendingTransfers[factionId];
  const pending = queue?.[0];
  if (pending === undefined) return state;
  if (pending.from !== from || pending.to !== to) return state;
  // A turn that took three lands owes three answers, and the next one is
  // raised as soon as this one is applied.
  const left = queue.slice(1);
  const { [factionId]: _answered, ...rest } = state.pendingTransfers;
  return {
    ...applyTransfer(state, pending.from, pending.to, amount, factionId),
    pendingTransfers: left.length > 0 ? { ...rest, [factionId]: left } : rest,
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
  /** The faction answering, when one is named. `transferDefense` knows it;
   *  the automatic half inside a capture does not, and there the seat on
   *  turn IS the taker. Naming it stops the two from being the same fact by
   *  accident once a second person can be the one answering. */
  byFactionId?: string,
): GameState {
  const moved = Math.max(0, Math.min(amount, transferLimit(state, from, to)));
  if (moved === 0) return state;
  const v = { defense: state.defense, defenseMax: state.defenseMax };
  let defense = applyDamage(v, from, moved);
  defense = applyHeal({ defense, defenseMax: state.defenseMax }, to, moved);
  const actor = byFactionId === undefined
    ? state.players[state.current]
    : state.players.find((p) => p.factionId === byFactionId);
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
 *  with `startingDeck()` and grows it through harvests.
 *
 *  The ground is rolled here rather than in `pickFaction` because the screen
 *  this transition opens is the one where the player chooses a land: a status
 *  seeded after the pick is a status they picked blind. Only the ground - the
 *  quiet set waits for `pickFaction`, which is where "who acts" is decided.
 *
 *  So this takes the rng, and it draws before every draw `pickFaction` makes.
 *  tests/rng-isolation.test.ts is where that contract is written down. */
export function chooseBuild(
  state: GameState, build: Strategy, rng: Rng,
): GameState {
  if (state.phase !== "deck-building") return state;
  return {
    ...state,
    phase: "pick-faction",
    humanStrategy: build,
    passives: seedTerrain(state.factionIds, rng),
  };
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

/** Whether this land may hold a seat at all: it must answer to nobody.
 *
 *  A region may open with realms already standing (`seedRealms`), and a land
 *  inside one cannot act. Two reasons, and both are the rules already written
 *  down rather than a preference about seats: `endingFor` reads a human
 *  faction's own `incorporated` entry as DEFEAT, so an annexed land would end
 *  the run on the click that picked it; and defense starts at its ceiling, so
 *  `independenceGateOpen` is true of every seeded vassal and one given a turn
 *  would walk out of its lord's realm at its first turn start.
 *
 *  So a held land is a conquest target, never a seat - which is what it
 *  already is when a conquest makes one mid-game. */
function seatable(state: GameState, factionId: string): boolean {
  return (
    state.factionIds.includes(factionId) &&
    isUnheld(factionId, state.overlords, state.incorporated)
  );
}

/** Which factions take turns: the human's pick, any reserved pick (a
 *  multiplayer guest), then lands drawn from a seeded shuffle of the rest,
 *  skipping any that borders one already chosen.
 *
 *  Every candidate is `seatable`, so a map that opens with realms on it offers
 *  seats to the realm roots and the free lands and to nothing else.
 *
 *  The spacing pass can run out of room - a small or a chain-shaped map - so a
 *  second pass fills what is left without the test. Placement never fails, and
 *  that fallback is the only reason two acting lands may end up adjacent. */
function actingFactions(
  state: GameState, humanFactionId: string, reserved: string[], rng: Rng,
): string[] {
  const out = [humanFactionId];
  for (const id of reserved) {
    if (id !== humanFactionId && seatable(state, id) && !out.includes(id)) {
      out.push(id);
    }
  }
  const seats = state.factionIds.filter((id) => seatable(state, id));
  const cap = Math.max(out.length, Math.min(MAX_ACTIVE, seats.length));
  const pool = shuffle(seats.filter((id) => !out.includes(id)), rng);
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
 *  acting draw comes before the deal, and nothing here draws after it: the
 *  ground was rolled at `chooseBuild`, and the quiet set is not a roll. */
export function pickFaction(
  state: GameState,
  factionId: string,
  rng: Rng,
  /** Factions besides the human's that must take turns - a multiplayer
   *  guest's pick. Everything else is chosen at random. */
  opts?: { reservedFactionIds?: string[] },
): GameState {
  if (state.phase !== "pick-faction") return state;
  // The one door every pick comes through - the solo click, both of
  // `dealNetGame`'s picks and `faction=` in src/boot-params.ts - so `seatable`
  // is enforced once rather than at three call sites that could drift. A
  // refusal leaves the state at the faction prompt, which is the coherent
  // stop boot-params.ts already documents for a `faction=` it cannot honour.
  if (!seatable(state, factionId)) return state;
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
  // On top of the ground `chooseBuild` already rolled, never a re-roll: the
  // player picked their land off what the map said, and the map must not
  // change under the pick.
  const passives = quietPassives(
    state.passives, state.factionIds, acting,
    (land) => !isUnheld(land, state.overlords, state.incorporated),
  );
  // Only the factions that act keep a leader. Everything else about a quiet
  // land follows from the vacancy: no ruler, no turn, and no turn even after
  // somebody takes it.
  // What each build's chief brings, from the one table the build screen also
  // reads. Seeded off the build rather than written into the raid cards: the
  // Pestilence seats hold Raid too, and theirs deal what the card says. The
  // ability outlives an assassination - see `Ruler.abilities`.
  let rulers = vacateRulers(state.rulers, acting);
  for (const pl of players) {
    for (const id of BUILD_ABILITIES[pl.strategy] ?? []) {
      rulers = grantAbility(rulers, [pl.factionId], id);
    }
  }
  return beginTurn(
    { ...state, phase: "playing", players, current: 0, passives, rulers }, rng,
  );
}

/** Whether this kind of event, when something caused it, reads as that cause's
 *  sub-item in the log. Endings are the exception: a play can win or lose the
 *  run, but the run's last line is a headline, not something indented under a
 *  card.
 *
 *  An exhaustive switch with no `default`, like `eventSegments` in src/hud.ts:
 *  a new `GameEventType` stops compiling here until somebody decides which it
 *  is. */
function nestsUnderItsCause(type: GameEventType): boolean {
  switch (type) {
    // Never a consequence: the play itself, and the pile bookkeeping that
    // begins or ends a turn rather than following from a card.
    //
    // `play` is qualified in `appendEvents`: a play never nests under another
    // play, but the restless raid a quiet land sends IS its status acting and
    // does nest under the `passive-fired` that announced it.
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
    // And the one line that says it is NOT over: the player answering their
    // own ending, which no card caused and which nothing indents under.
    case "played-on":
    // A status firing is a CAUSE, and a cause states itself at the top level
    // of its batch. It may follow the play that set it off - a No successor
    // triggered by an assassination - but the line the player needs is "this
    // status did something", and burying that under the card would put the
    // reason a level below the thing it explains.
    case "passive-fired":
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
    // The arrow appearing is caused by the card that drew it. `isAdjacentCause`
    // admits only `passive-fired` and `march-resolved`, not `play`, so this
    // only actually nests on the card path, where `appendEvents` reads the
    // whole batch as opened by a play. The restless raid's declaration sits
    // right after that same status's own `play` line, not after the
    // `passive-fired` beside it, so it never meets either rule and stands
    // unindented next to it.
    case "march-declared":
    // What the arrow cost the land it set out from. Nests for exactly the
    // reason the declaration above it does, and stands beside it: the play
    // spent the defense, so the line saying so belongs under the play and not
    // in the flow of the round.
    case "levied":
    // The bar crossing follows the turnip play that crossed it; the pick
    // follows the harvest play it was made on.
    case "harvest-earned":
    case "harvest-picked":
    case "harvest-burned":
      return true;
  }
}

/** An arrow that arrived and found nothing: no defenders to break and no
 *  counter to meet, which is what an army walking into a flattened land is and
 *  what a demand coming due is. It is the only `march-resolved` with neither an
 *  `amount` nor a `counter` - a standoff always carries the `counter` it was -
 *  so the shape names itself and needs no field of its own.
 *
 *  One shape, two readers, the `SINGLE_LAND_HEAL` rule: the log gives it its
 *  own line ("reaches", not "falls on") and the round modal leaves it out,
 *  because the `subjugated` it caused names the same card and says what became
 *  of the land. Two lines for one arrival is the three-paragraph notice format
 *  coming back a line at a time. */
export function metNothing(e: GameEvent): boolean {
  return e.type === "march-resolved"
    && e.amount === undefined && e.counter === undefined;
}

/** A cause whose reach is the single line after it, the other half of the shape
 *  rule `appendEvents` reads. A status firing, and an arrow arriving: both are
 *  a thing that happened, and both can be followed by what it did to the map in
 *  a batch that opens with no play at all. */
function isAdjacentCause(type: GameEventType | undefined): boolean {
  return type === "passive-fired" || type === "march-resolved";
}

/** The one place `actorRuler` is filled, and the one place a consequence is
 *  tied to the cause that produced it. Every append to the log goes through
 *  here, so a new event type cannot ship unstamped.
 *
 *  There are two kinds of cause, and each has its own SHAPE rule - read off the
 *  batch, never set in a branch, because fourteen branches restating the same
 *  fact is exactly the drift the `amount` rule warns about:
 *
 *  - **A play.** `playCard` builds one batch per play with the `play` event
 *    first and pushes everything that play caused onto it, and no other caller
 *    starts a batch with a `play`. So "caused by this play" is exactly "not
 *    first in a batch that starts with a play".
 *
 *  - **A line standing immediately before it.** A `passive-fired` names what it
 *    did on THE LINE THAT FOLLOWS IT, and an arrow landing is followed by what
 *    the landing did - a land submitting, when the army found nothing left to
 *    fight. That one line is the whole of either one's reach. It has to be a
 *    reach of one, because a round wrap's batch is not one cause and its
 *    fallout - it is a dozen independent chains in a row, wild lands mending
 *    themselves and quiet lands picking fights and conquests changing hands,
 *    and a cause left open to the end of the batch would adopt every one of
 *    them. A status that does two things therefore says so twice, which is
 *    also the better line to read. */
function appendEvents(state: GameState, events: GameEvent[]): GameEvent[] {
  const causedByPlay = events[0]?.type === "play";
  return [
    ...state.log,
    ...events.map((e, i) => {
      const prev = events[i - 1]?.type;
      const afterPassive = prev === "passive-fired";
      const nests = e.type === "play"
        // A play never follows from another play, nor from an arrow landing; it
        // does follow from the status that sent it, which is what a restless
        // raid is.
        ? afterPassive
        : nestsUnderItsCause(e.type)
          && (isAdjacentCause(prev) || (causedByPlay && i > 0));
      return {
        ...e,
        actorRuler: actorRulerName(state, e.playerId),
        // Omitted rather than set false, so an event that is nobody's
        // consequence carries the shape it always did.
        ...(nests ? { consequence: true } : {}),
      };
    }),
  ];
}

/** The line that says a STATUS did this. Pushed immediately before the event it
 *  caused, which is the whole of the shape rule `appendEvents` reads back.
 *
 *  Every status that moves something on the board owes one. A land's defense
 *  climbing on its own, or an army leaving a land that takes no turns, is the
 *  game breaking its own stated rules as far as the player can tell - the rule
 *  that permits it is real, is on the land's hover, and was nowhere near the
 *  line that needed it. `PASSIVES[passiveId].name` is a hoverable segment on
 *  the line, so the rule arrives with the event rather than being something
 *  the player had to have looked up first.
 *
 *  A status that causes two logged events fires twice: `appendEvents` gives a
 *  cause a reach of exactly one line, and two things worth logging are two
 *  things worth saying. */
function firePassive(
  events: GameEvent[],
  turn: number,
  playerId: number,
  passiveId: string,
  polygon: string,
): void {
  events.push({
    turn, playerId, type: "passive-fired",
    targetFactionId: polygon, passiveId,
  });
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
  //
  // Resolved BELOW rather than here, once `applyArrival` exists to be handed
  // to it: arrivals land one at a time, each against the board the one before
  // it left, ownership included. Nothing between this comment and that call
  // executes - it is all declarations - so the move costs no ordering.
  let marches = state.marches;
  let nextMarchId = state.nextMarchId;
  let claims = state.claims;
  let defense = state.defense;
  let passives = state.passives;
  const pendingTransfers = { ...state.pendingTransfers };

  /** The line that says an arrow got where it was aimed. It is the cause the
   *  submission below it indents under (`isAdjacentCause`), so it is pushed
   *  immediately before, and by the CALLER rather than by `takeLand` - because
   *  an arrival is not the same event as a conquest. It happens whether or not
   *  the land changes hands: a blow the ruler gate then refuses still broke
   *  defenders, and a player owed that line either way.
   *
   *  `amount` is what the same blow moved, absent when the land was already
   *  flat. Absent with no `counter` is `metNothing`, the shape the log renders
   *  as "reaches" and the round modal leaves to the submission to report.
   *  `incoming` and `marchIds` ride along whenever a real march did the
   *  arriving - the claim-driven call out of `landClaims` passes neither,
   *  since a demand is not an army and clears no march. */
  const arrival = (
    playerId: number, cardId: string, land: string, from: string,
    moved?: {
      incoming: number; marchIds: number[]; amount?: number; counter?: number;
    },
  ): void => {
    events.push({
      turn: state.turn, playerId, type: "march-resolved",
      cardId, targetFactionId: land, sourceFactionId: from,
      ...(moved !== undefined
        ? {
            incoming: moved.incoming, marchIds: moved.marchIds,
            ...(moved.amount !== undefined ? { amount: moved.amount } : {}),
            ...(moved.counter !== undefined ? { counter: moved.counter } : {}),
          }
        : {}),
    });
  };

  /** A land walked into by an army, or subjugated any other way outside a
   *  play. The same allegiance move `landSubjugation` makes inside `playCard`,
   *  and the same question afterwards: how much defense to send with it.
   *
   *  `cause` is required rather than defaulted, and that is the point: this is
   *  one of the two doors an allegiance change can come through, and a new way
   *  to take a land does not compile until it says which.
   *
   *  Both arriving causes owe an `arrival` line immediately before this call.
   *  It is not pushed here because it is not conditional on the land changing
   *  hands - see `applyCaptures`. */
  const takeLand = (
    land: string, by: string, from: string, cause: ArrivingCause,
  ): void => {
    const formerLord = overlords.get(land);
    overlords.set(land, by);
    passives = stripOnCapture(passives, land);
    players = updateFaction(players, land, (pl) => {
      const clean = stripTribute(pl);
      return { ...clean, deck: shuffle([...clean.deck, ...TRIBUTE_CARDS], rng) };
    });
    events.push({
      turn: state.turn, playerId: p.id, type: "subjugated",
      targetFactionId: land, overlordFactionId: by, sourceFactionId: from,
      ...cause,
      ...(formerLord !== undefined ? { formerOverlordFactionId: formerLord } : {}),
    });
    // A PERSON is asked, whichever seat they sit in; everybody else moves half
    // on the spot. Every conquest asks: a turn that takes three lands queues
    // three questions and they are answered in the order the lands fell. It
    // must NOT fall through to the automatic half - that moved points out of a
    // land the player was never asked about, which is the one thing
    // `pendingTransfers` exists to prevent.
    if (isHumanFaction(state, by)) {
      pendingTransfers[by] = [...(pendingTransfers[by] ?? []), { from, to: land }];
      return;
    }
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
  };

  // Claims land before marches are declared and after they have resolved: a
  // demand that arrives to find the land still broken takes it, and a land
  // taken this way cannot send its armies at its new lord - those raids are
  // called off, while anything it aimed elsewhere flies on. Wars have not
  // stopped, only this one.
  const landClaims = (actor: string, playerId: number): void => {
    for (const { key, claim } of lapsedClaimsOf(claims, actor, state.turn)) {
      claims = clearClaims(claims, [key]);
      const view = {
        ...viewOf({ ...state, players }),
        overlords, defense, marches, claims, respites,
      };
      if (!claimWouldLand(view, claim.actor, claim.to)) {
        // The land put its defenses back up, somebody else took it first, or
        // it is no longer anybody the actor can reach.
        events.push({
          turn: state.turn, playerId, type: "march-lapsed",
          cardId: claim.cardId,
          targetFactionId: claim.to, sourceFactionId: claim.from,
        });
        continue;
      }
      // A demand coming due met no defenders and moved no score, so its
      // arrival is the bare shape.
      arrival(playerId, claim.cardId, claim.to, claim.from);
      takeLand(claim.to, claim.actor, claim.from, {
        via: "claim", cardId: claim.cardId,
      });
      callOffMarchesAgainstLord(claim.to, claim.actor, playerId);
    }
  };

  /** A land just taken cannot send its armies at its new lord, nor at anyone
   *  that lord answers to: those raids are called off, while anything it aimed
   *  elsewhere flies on. Wars have not stopped, only this one. Every route into
   *  `takeLand` owes this, which is why it is a function rather than a step of
   *  the claim path.
   *
   *  The chain, not just the direct lord: this is the hostile keyword's rule
   *  applied at the instant the pyramid changes shape, and `resolveMarches`
   *  applies the identical test to whatever is still in flight afterwards.
   *  Two spellings of one rule would be two rules within a week - which is
   *  precisely how this function came to hold the whole of it and the rest of
   *  the game held none. */
  function callOffMarchesAgainstLord(
    land: string, _lord: string, playerId: number,
  ): void {
    const view = { ...viewOf({ ...state, players }), overlords, marches, defense };
    for (const axis of axesOf(marches)) {
      for (const march of [...axis.fromA, ...axis.fromB]) {
        if (
          march.actor !== land ||
          !aimsUpOwnChain(view, march.actor, march.cardId, march.to)
        ) {
          continue;
        }
        marches = clearMarches(marches, [
          ...Object.entries(marches)
            .filter(([, m]) => m === march)
            .map(([key]) => key),
        ]);
        events.push({
          turn: state.turn, playerId, type: "march-lapsed",
          cardId: march.cardId,
          targetFactionId: march.to, sourceFactionId: march.from,
          marchIds: [march.id],
        });
      }
    }
  }

  /** Armies that got through, one land at a time: the arrival is reported, and
   *  then the two gates decide whether the land actually changes hands.
   *
   *  The line comes FIRST and unconditionally, because the blow landed
   *  regardless. A raid out of the leaderless middle that breaks a land's last
   *  defenders is a real thing that happened to that land, and reporting it
   *  only when a conquest followed left the arrow vanishing off the map with
   *  nothing in the log.
   *
   *  One function for both callers - this seat's own marches and the sweep over
   *  the seats that never get a turn - because the two gates below were written
   *  out twice and a third copy is how they start to differ. */
  const applyArrival = (
    capture: Capture, playerId: number, current: Defense,
  ): { defense: Defense; taken: boolean } => {
    // The running board is handed over for the length of this call: `takeLand`
    // and its automatic transfer read and write the closure's `defense`, and
    // the resolution that called in here holds its own copy.
    defense = current;
    arrival(
      playerId, capture.cardId, capture.land, capture.from,
      {
        incoming: capture.incoming, marchIds: capture.marchIds,
        ...(capture.amount !== undefined ? { amount: capture.amount } : {}),
        ...(capture.counter !== undefined ? { counter: capture.counter } : {}),
      },
    );
    // Only a faction with a LEADER takes land. A restless raid out of a land
    // nobody leads is a raid, not a conquest - without this the grey middle
    // quietly ate itself, and lands with no chief to answer for them ended up
    // holding vassals.
    if (!hasRuler(state.rulers, capture.by)) return { defense, taken: false };
    // The actor already holds this land, because an earlier arrival of its
    // own took it this same turn. The arrow is SPENT and lands nothing: an
    // army does not sack the land its own side has just moved defenders
    // into. It gets its arrival line above - the arrow is accounted for on
    // the surface the player reads - and no damage.
    if (
      fullRealmOf(capture.by, overlords, state.incorporated).has(capture.land)
    ) {
      return { defense, taken: false };
    }
    takeLand(capture.land, capture.by, capture.from, {
      via: "conquest", cardId: capture.cardId,
    });
    return { defense, taken: true };
  };

  // Marches land here - see the comment above the stores this fills. Arrivals
  // resolve ONE AT A TIME through `applyArrival`, so the second arrow down a
  // second axis meets the land as the first one left it: its defenses, and
  // its holder.
  {
    const landed = resolveMarches(
      { ...state, overlords, marches, defense }, p, events,
      (capture, current) => applyArrival(capture, p.id, current),
    );
    marches = landed.marches;
    defense = landed.defense;
  }

  // Claims answer AFTER the arrows, so a raid that flattens a land without
  // taking it still opens the gate a demand of the same turn walks through.
  landClaims(p.factionId, p.id);

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
    // `passives`, never `state.passives`. The snapshot this turn began with
    // still calls a land quiet that an army walked into twenty lines ago, and
    // a conquest is supposed to stop repairing itself the moment it is taken.
    for (const polygon of state.factionIds) {
      if (!hasPassive(passives, polygon, "wild-lands")) continue;
      if (struckThisRound.has(polygon)) continue;
      const v = { defense, defenseMax: state.defenseMax };
      if (defenseOf(v, polygon) >= defenseMaxOf(v, polygon)) continue;
      if (rng() >= WILD_LANDS_HEAL_CHANCE) continue;
      const before = defenseOf(v, polygon);
      defense = applyHeal(v, polygon, WILD_LANDS_HEAL);
      // What actually moved, never the constant. A land sitting at half a
      // point under its ceiling - a Great raid deals halves - takes only that
      // half, and an event claiming the whole point makes the walk that feeds
      // the log and the round summary drift from the store for the rest of the
      // run. `landHeal` in `playCard` keeps the same rule.
      const moved =
        defenseOf({ defense, defenseMax: state.defenseMax }, polygon) - before;
      if (moved <= 0) continue;
      // The land's OWN seat owns the line, never the seat whose turn happens to
      // be starting. The log tags an entry `.log-mine` off `playerId` and lets
      // it through every filter, so charging these to the human made a wild
      // land on the far side of the map read as something the player did, and
      // kept it on screen while the log was pinned to somebody else's realm.
      const owner = players.find((pl) => pl.factionId === polygon);
      firePassive(events, state.turn, owner?.id ?? p.id, "wild-lands", polygon);
      events.push({
        turn: state.turn, playerId: owner?.id ?? p.id, type: "healed",
        targetFactionId: polygon, amount: moved,
      });
    }
    // The restless middle of the map. A quiet land nobody holds sends the odd
    // raid at a neighbour, and BOTH halves happen here at the round wrap: a
    // march resolves in its actor's own `beginTurn`, so a land that never
    // takes a turn would otherwise leave its arrow standing for the rest of
    // the game. Landing first and declaring second, so an arrow stands for
    // exactly one round and can be answered in it.
    // Whose arrows land here: every seat that will never see a `beginTurn` of
    // its own, which is exactly what `advance` passes over. A march declared
    // by one would otherwise stand on the map for the rest of the game - never
    // resolving, never expiring, never explaining itself in the log. Two ways
    // in: taking a quiet land strips the status while its arrow is in flight,
    // and a vassal that was taking turns can be Incorporated out of its seat
    // with a march or a Subjugate already declared.
    const dormant = state.factionIds.filter(
      (land) => takesNoTurn(state, land),
    );
    for (const land of dormant) {
      const seat = players.find((pl) => pl.factionId === land);
      if (seat === undefined) continue;
      // Claims first, the same order the acting seat's own turn keeps.
      landClaims(land, seat.id);
      const out = resolveMarches(
        { ...state, overlords, marches, defense }, seat, events,
        (capture, current) => applyArrival(capture, seat.id, current),
      );
      marches = out.marches;
      defense = out.defense;
    }
    // The status IS the condition. A taken land loses it on capture, so
    // "unheld" needs no test of its own here - asking twice is how the two
    // answers start to differ.
    //
    // Asked of `passives`, the RUNNING copy, and never of `state.passives`, and
    // asked HERE rather than above the sweep. Every route into `takeLand` runs
    // earlier in this same function - a claim answering at this seat's turn
    // start, an army walking into a land this seat's own marches flattened, the
    // sweep just above - and the snapshot the turn began with knows about none
    // of them. Read from the snapshot, a land taken moments ago sent one last
    // raid at its brand-new lord, and the player watched an arrow leave a
    // polygon inside their own outline.
    const restless = state.factionIds.filter(
      (land) => hasPassive(passives, land, "keeps-to-itself"),
    );
    for (const land of restless) {
      if (rng() >= RESTLESS_RAID_CHANCE) continue;
      const seat = players.find((pl) => pl.factionId === land);
      if (seat === undefined) continue;
      const view = { ...viewOf({ ...state, players }), marches, defense };
      if (freeArmiesFor(view, land) === 0) continue;
      // A quiet land raids with the LEAST a raid may spend, not with its
      // ceiling. It raids every fourth round and never heals on purpose, so a
      // land spending deep would sink toward 0 while nobody watched - the grey
      // middle softening into a slow gift for whoever reaches it first. One
      // point is what this always cost, and the change belongs to the cards
      // the player holds.
      if (spendCeilingOn(view, "raid", land) < MIN_RAID_SPEND) continue;
      // Never at a land already flattened. An army walking into an empty land
      // TAKES it, and a land nobody leads is picking a fight, not building an
      // empire - grey conquering grey turned the middle of the map into a
      // land-grab nobody chose. With nothing standing left to hit, it sits
      // this round out.
      const targets = marchTargetsFrom(view, land, land).filter(
        (to) => defenseOf({ defense, defenseMax: state.defenseMax }, to) > 0,
      );
      if (targets.length === 0) continue;
      const to = targets[Math.floor(rng() * targets.length)];
      const id = nextMarchId++;
      const damage = attackDamageFor(view, land, "raid", MIN_RAID_SPEND).damage;
      defense = applyDamage({ defense, defenseMax: state.defenseMax }, land, MIN_RAID_SPEND);
      marches = addMarch(marches, {
        id,
        actor: land, from: land, to, cardId: "raid", damage,
        holdsArmy: true, expiry: state.turn + 1,
      });
      // Logged as the play it reads as on the map: an arrow with a strength on
      // it, answerable by a counter-raid like any other. No card leaves a deck
      // - this is the land's own restlessness, not a hand being played, and
      // the status line above it is what says so. Without it the log showed a
      // land with no ruler and no turn playing a card, which is the one thing
      // the rules say it cannot do.
      firePassive(events, state.turn, seat.id, "keeps-to-itself", land);
      events.push({
        turn: state.turn, playerId: seat.id, type: "play", cardId: "raid",
        targetFactionId: to, sourceFactionId: land,
      });
      // Pushed after the play above, so the declaration reads as something
      // that play did rather than as a line standing before its own cause.
      // The levy first, in the order a played raid pushes them: the land pays
      // before the arrow it paid for appears.
      events.push({
        turn: state.turn, playerId: seat.id, type: "levied",
        cardId: "raid", targetFactionId: land, amount: MIN_RAID_SPEND,
      });
      events.push({
        turn: state.turn, playerId: seat.id, type: "march-declared",
        cardId: "raid", targetFactionId: to, sourceFactionId: land,
        marchId: id, amount: damage,
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
  // Refill to a full hand, under BOTH turn rules. Drawing exactly one was a
  // rule written when a standard turn spent exactly one card, and the repeat
  // keyword broke that arithmetic without anybody noticing: a Raid that
  // re-opens the turn for more raids spends two, three, four cards for the one
  // card drawn back, so the hand a player who used the keyword woke up with
  // was smaller every round until they had nothing to play. What the `turn`
  // axis decides is how many cards a turn ACCEPTS - it was never meant to
  // decide the hand size, and a hand that refills is the only shape that
  // survives a card spending more than its share.
  //
  // What it refills TO is the realm's, `handLimitFor`. Read off the LOCAL
  // `overlords` and not off the snapshot, because the escape at the top of
  // this turn and the marches that landed below it have both already moved it:
  // a land taken moments ago is a land the hand it deals with should count. It
  // is a target and not a cap - a realm that has just been carved up holds
  // whatever it was holding and draws nothing until it has played back under
  // the new number. Hoisted, since nothing between one drawn card and the next
  // touches the realm.
  //
  // Each draw logs the same `draw` event the single-draw path logged, and a
  // deck that runs dry mid-refill reshuffles exactly as it does between turns.
  const handLimit = handLimitFor(
    { overlords, incorporated: state.incorporated }, p.factionId,
  );
  while (hand.length < handLimit && (deck.length > 0 || discard.length > 0)) {
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
  // A land can change hands here - a claim answering, an army walking into a
  // flattened land, a dormant land's raid - so the run can END here, and this
  // is the one place `beginTurn` may set the phase. Last, after every store
  // above it has settled, because it reads the board rather than the play.
  const phase = endingFor(
    { ...state, players, overlords }, p.id, events,
  ) ?? state.phase;
  return {
    ...state, phase, players, overlords, wealth, marches, nextMarchId, claims,
    defense, passives, pendingTransfers,
    // The lapsed half is discarded: a run-out respite moves nothing and the
    // badge already counted it down, so there is nothing to report.
    respites: sweepLapsed(respites, state.turn, (e) => e).kept,
    log: appendEvents(state, events),
    // The three per-turn facts, cleared together at the START of a turn rather
    // than the end of one. The settlements a fortify called on come back here
    // and nowhere else, so a commitment cannot outlive the turn that made it
    // however that turn ends.
    playedThisTurn: false, repeatGroup: null, settlementsSpent: {},
  };
}

/** Lands every march this seat declared a turn ago, and every counter standing
 *  against one of them.
 *
 *  Resolution is per AXIS: both directions of a clash come off the board
 *  together, and within the axis the armies pair off one for one, each pair
 *  landing its own difference on whichever of the two pushed less hard. That
 *  is why a counter still standing in flight is pulled in here even though its
 *  own expiry has not come round - "the earlier of the two turns" is what
 *  makes a counter-raid an answer rather than a trade, and leaving half a
 *  clash on the board would let the attacker's own resolution hit before the
 *  counter it provoked.
 *
 *  Pushes onto `events` and returns the moved stores; the caller owns the
 *  batch.
 *
 *  **Arrivals are applied ONE AT A TIME, through `onArrival`, at the moment
 *  each is decided.** They used to be collected and applied after every axis
 *  had landed, which meant a second arrow down a second axis was judged
 *  against a board where the first one had dealt its damage but not taken the
 *  land - so it read an enemy land that was already its own actor's, and a
 *  land whose new defenders had not arrived yet. Handing the running defense
 *  in and taking it back is what lets the caller's `takeLand` sit between two
 *  arrivals.
 *
 *  Consumes no rng of its own - `tests/rng-isolation.test.ts` can only catch
 *  nondeterminism, not an added draw, so the discipline has to be structural.
 *  `onArrival` may consume some (a conquest shuffles tribute into the taken
 *  land's deck), and it does so in the same order the old two-pass shape did:
 *  arrivals were collected in axis order and applied in that same order. */
function resolveMarches(
  state: GameState,
  p: PlayerState,
  events: GameEvent[],
  onArrival: (
    capture: Capture, defense: Defense,
  ) => { defense: Defense; taken: boolean },
): { marches: Marches; defense: Defense } {
  const lapsed = lapsedMarchesOf(state.marches, p.factionId, state.turn);
  if (lapsed.length === 0) {
    return { marches: state.marches, defense: state.defense };
  }
  const view = viewOf(state);
  let marches = state.marches;
  let defense = state.defense;
  /** Land -> the actor whose arrow took it during THIS resolution. What makes
   *  a second arrow of the same actor spent rather than a raid on a vassal. */
  const takenHere = new Map<string, string>();

  // A march whose ground moved under it while it was in flight is dropped:
  // the army has no land left to have marched out of, the land it was aimed at
  // is no longer something its actor may attack, or the actor has knelt to
  // whoever it was aimed at since. All three are the ordinary consequence of
  // somebody else's turn, so they are reported.
  //
  // The source test is two questions, not one. A polygon stays in its own
  // `fullRealmOf` even after it is annexed - the id is the land's, and the
  // land is still there - so the second question is who HOLDS it now. An
  // annexed land answers to its annexer, and an army cannot march out of a
  // land its owner has lost.
  //
  // The third is the hostile keyword catching up with an arrow drawn before
  // the pyramid changed shape. `callOffMarchesAgainstLord` answers the same
  // question at the instant of a capture, for the one land being taken; this
  // answers it for everybody else, every turn, which is what makes "never up
  // your own chain" a rule rather than a check performed once.
  const alive: typeof lapsed = [];
  for (const entry of lapsed) {
    const realm = fullRealmOf(entry.march.actor, state.overlords, state.incorporated);
    const reach = attackReach(view, entry.march.actor);
    const holder = state.incorporated[entry.march.from] ?? entry.march.from;
    if (
      realm.has(entry.march.from) && realm.has(holder) &&
      reach.has(entry.march.to) &&
      !aimsUpOwnChain(view, entry.march.actor, entry.march.cardId, entry.march.to)
    ) {
      alive.push(entry);
      continue;
    }
    marches = clearMarches(marches, [entry.key]);
    events.push({
      turn: state.turn, playerId: p.id, type: "march-lapsed",
      cardId: entry.march.cardId,
      targetFactionId: entry.march.to, sourceFactionId: entry.march.from,
      marchIds: [entry.march.id],
    });
  }
  if (alive.length === 0) return { marches, defense };

  // Only the axes the landing marches run along, but each taken WHOLE, so a
  // counter still in flight is spent answering the attack it was declared
  // against rather than surviving to strike an undefended land next turn.
  const landing = new Set(alive.map((e) => axisKeyOf(e.march.from, e.march.to)));
  for (const axis of axesOf(marches)) {
    if (!landing.has(axisKeyOf(axis.a, axis.b))) continue;
    marches = clearMarches(marches, axis.keys);
    // One pairing at a time, against the defense as the pairing before it left
    // it. That ordering is what lets two armies down one axis break a land and
    // then walk into it, the same way two armies down two axes already could.
    for (const eng of resolveAxis(axis.a, axis.b, axis.fromA, axis.fromB)) {
      const contested = eng.fromA !== null && eng.fromB !== null;
      const strengthA = eng.fromA?.damage ?? 0;
      const strengthB = eng.fromB?.damage ?? 0;
      // A standoff still gets a line. It moves no score, so it carries no
      // `amount` - but two armies met and both are spent, and a player whose
      // raid was answered exactly must not be left thinking their card did
      // nothing. `a` and `b` are the axis's own sorted ends, since neither side
      // is the winner and calling one of them the target would be a lie.
      //
      // The uncontested arm below - an even delta with only one side actually
      // in the field - is unreachable while every attack card's damage is
      // positive: an unanswered march always has `delta` equal to its own
      // damage, never 0. A future zero-damage attack would clear this march
      // with no `march-resolved` for it, and the departure invariant test in
      // tests/game.test.ts is what would catch an arrow retired with nothing
      // to explain it.
      if (eng.loser === null || eng.spear === null || eng.delta <= 0) {
        if (contested) {
          events.push({
            turn: state.turn, playerId: p.id, type: "march-resolved",
            cardId: eng.fromA!.cardId,
            targetFactionId: axis.a, sourceFactionId: axis.b,
            incoming: strengthB, counter: strengthA,
            marchIds: [eng.fromA!.id, eng.fromB!.id],
          });
        }
        continue;
      }
      const { loser } = eng;
      const winner = loser === axis.a ? axis.b : axis.a;
      // Whichever ends actually threw an army: filtered rather than the raw
      // pair, because an uncontested landing has only one.
      const marchIds = [eng.fromA?.id, eng.fromB?.id]
        .filter((id): id is number => id !== undefined);
      // `incoming` is always the strength aimed AT the loser and `counter`
      // what the loser mustered against it, whichever end of the axis that
      // turned out to be. The label the player reads is delta out of incoming.
      const clash = loser === axis.a
        ? { incoming: strengthB, counter: strengthA }
        : { incoming: strengthA, counter: strengthB };
      // This actor took this land moments ago, with an earlier arrow of this
      // same resolution. An army does not sack what its own side has just
      // moved defenders into, so this arrow is spent: it gets its arrival
      // line, and lands nothing.
      //
      // Asked of what was taken HERE and not of the actor's realm, because a
      // raid at a vassal you already held is a real play - keeping its
      // defenses under the independence gate is what vassal upkeep IS. Only
      // the land that changed hands between this arrow leaving and arriving
      // is exempt.
      if (takenHere.get(loser) === eng.spear.actor) {
        // Never an `amount` on a spent arrow, so never a `counter` either:
        // `counter` rides only alongside `amount`, or this reads as the
        // standoff it was not.
        defense = onArrival({
          land: loser, by: eng.spear.actor, from: eng.spear.from,
          cardId: eng.spear.cardId, marchIds, incoming: clash.incoming,
        }, defense).defense;
        continue;
      }
      // The ground has its say on the leftover that actually lands, not on what
      // either side set out with: a counter-raid is answered by armies, a hill
      // by whatever gets past them.
      const dealt = damageAfterTerrain(view, loser, eng.delta);
      const before = defenseOf({ defense, defenseMax: state.defenseMax }, loser);
      const moved = Math.min(before, dealt);
      // The damage lands whatever else the blow does, and it lands HERE rather
      // than at the capture site, because the next pairing on this axis reads
      // the defense as this one left it.
      if (moved > 0) {
        defense = applyDamage(
          { defense, defenseMax: state.defenseMax }, loser, dealt,
        );
      }
      // An army that deals more than the land has standing walks in over what
      // is left of it. A land already flat is the same rule and not a case of
      // its own: anything that reaches it deals at least 1, and 1 exceeds
      // nothing. Equal is a flattening - the land holds, at 0, and the next
      // arrival takes it.
      //
      // The line for this arrival is pushed by `onArrival`, not here: it has
      // to stand immediately before the submission it causes, and the caller
      // is what knows whether the land actually changes hands.
      if (capturesOnArrival(dealt, before)) {
        const landed = onArrival({
          land: loser, by: eng.spear.actor, from: eng.spear.from,
          cardId: eng.spear.cardId, marchIds, incoming: clash.incoming,
          // What the same blow moved on its way in, so the arrival can carry
          // it, and the loser's own mustered strength alongside it - `counter`
          // rides only inside this same spread, or a capture onto a land
          // already flat reads as the standoff it was not. Nothing moved on a
          // land that was already flat, and that shape - no `amount`, and
          // therefore no `counter` either - is `metNothing`.
          ...(moved > 0
            ? { amount: moved, ...(contested ? { counter: clash.counter } : {}) }
            : {}),
        }, defense);
        defense = landed.defense;
        if (landed.taken) takenHere.set(loser, eng.spear.actor);
        continue;
      }
      // Unreachable while `damageAfterTerrain` floors its output at 1 for any
      // positive `delta`: `moved` is `min(before, dealt)`, and having missed
      // the capture branch above already means `before` is at least 1. A
      // future zero-damage attack, or a terrain rule that let `damageAfterTerrain`
      // return 0, would clear this march with no `march-resolved` for it, and
      // the departure invariant test in tests/game.test.ts is what would
      // catch an arrow retired with nothing to explain it.
      if (moved <= 0) continue;
      events.push({
        turn: state.turn, playerId: p.id, type: "march-resolved",
        // The card of whichever side actually landed - the counter's, when a
        // counter won, since that is the play the damage came out of.
        cardId: eng.spear.cardId,
        targetFactionId: loser, sourceFactionId: winner, amount: moved, marchIds,
        incoming: clash.incoming, ...(contested ? { counter: clash.counter } : {}),
      });
    }
  }
  return { marches, defense };
}

/** A land taken by an army walking into it: which land, whose army, and the
 *  land the army came out of - the origin a defense transfer would move
 *  points from. */
interface Capture {
  land: string;
  by: string;
  from: string;
  /** The card the winning march was sent by. The `march-resolved` beside the
   *  push already reads it off the same march; a capture that dropped it left
   *  the land changing hands with no way back to the raid that did it. */
  cardId: string;
  /** Which marches this arrival retires - both ends of the axis when
   *  contested, filtered to whichever side actually threw an army when not. */
  marchIds: number[];
  /** What the blow moved on its way in, absent when the land was already flat
   *  and there was nothing to move. The arrival line carries it, so an army
   *  that broke the last defenders and walked in over them is ONE line with a
   *  `(Defense -1 -> 0)` on it rather than a damage line and an arrival. */
  amount?: number;
  /** The strength aimed at the loser. Present whether or not anything moved -
   *  mirrors `GameEvent.incoming` and rides along even into a `metNothing`
   *  arrival, because that is the only place the force thrown is recorded. */
  incoming: number;
  /** What the loser mustered against it, when the blow got through a counter.
   *  Rides only alongside `amount` on a real conquest: a counter with no
   *  amount is a standoff, which is the one thing a conquest is not. */
  counter?: number;
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

/** The player declines their own ending and holds out for the whole map. The
 *  mirror of `surrender`, and shaped like it: an identity return is what
 *  `commitDecision` reads as refused, so a run cannot be resumed out of a
 *  defeat or conjured off the main menu.
 *
 *  It touches `phase`, `playingOn` and the log, and NOTHING else - not
 *  `current`, not `playedThisTurn`. The ending was a verdict read off the
 *  board rather than a turn boundary, so the turn it interrupted is exactly
 *  the turn that resumes: a victory read in `playCard` goes back to a spent
 *  turn that `advance` will move on from, and one read in `beginTurn` goes
 *  back to a fresh open turn belonging to whoever's it already was. Resetting
 *  either field would hand out a second play or double-spend somebody's turn.
 *
 *  It logs, because a postmortem log reading `victory` -> twelve more turns ->
 *  `victory` with nothing in between says the game repeated itself. */
export function keepPlaying(state: GameState): GameState {
  if (state.phase !== "victory") return state;
  const p = state.players[state.current];
  return {
    ...state,
    phase: "playing",
    playingOn: true,
    log: appendEvents(state, [
      { turn: state.turn, playerId: p?.id ?? 1, type: "played-on" },
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

/** Whether the turn as it stands still accepts `cardId`.
 *
 *  An unspent turn accepts anything the ordinary rules allow. A spent one
 *  accepts only cards of the GROUP that re-opened it, and only because that
 *  card said it could - `repeatGroup` is written from `CardDef.repeatGroup`
 *  and read back here, so no rule anywhere has to know which cards those are.
 *  All three raids share one group, so a Raid buys a Strong raid or a Great
 *  raid just as readily as another Raid. What stops
 *  the run is legality: the reopened turn hands the question straight back to
 *  `playableSet`, which answers it the same way it would on any other turn.
 *
 *  A turn spent by a card that re-opened NOTHING carries a null group, and
 *  null is not a group a card can belong to. Comparing the two directly made
 *  "this card repeats nothing" equal "the turn was re-opened for nothing", so
 *  every card without a keyword could be played twice a turn. */
export function turnAccepts(state: GameState, cardId: string): boolean {
  if (!state.playedThisTurn) return true;
  return state.repeatGroup !== null
    && repeatGroupOf(cardId) === state.repeatGroup;
}

/** The card a spent turn is narrowed to, in the shape `playableSet` asks for:
 *  null while the turn is open (it accepts anything) or closed for good (it
 *  accepts nothing, which `turnAccepts` has already said). */
export function repeatOnlyOf(state: GameState): string | null {
  return state.playedThisTurn ? state.repeatGroup : null;
}

/** Whether the turn still accepts a card AT ALL - unspent, or spent by a play
 *  that re-opened it. This is what the screen and the AI ask instead of
 *  `playedThisTurn`, which stopped being the whole answer the moment a card
 *  could declare `CardDef.repeatGroup`.
 *
 *  It says nothing about WHICH card the turn would accept: that is
 *  `turnAccepts` one card at a time, and `playableSet` with `repeatOnly` for a
 *  whole hand. A re-opened turn holding no legal repeat is still open by this
 *  measure - the hand renders live and every card in it greys itself, which is
 *  the state that reads "end your turn". */
export function turnOpen(state: GameState): boolean {
  return !state.playedThisTurn || state.repeatGroup !== null;
}

/** Whether a person plays this faction. The ONE spelling, and both readers
 *  need the same answer: `takeLand` asks it to decide who is asked about a
 *  conquest's defenders, and `takesNoTurn` asks it to decide whose chair
 *  stays warm without a chief. Two answers that differed would be a person
 *  asked a question at a seat the turn loop had already skipped. */
export function isHumanFaction(state: GameState, factionId: string): boolean {
  return state.humanSeats.some(
    (seat) => state.players[seat]?.factionId === factionId,
  );
}

/** Whether this faction will never see a `beginTurn` of its own. Three
 *  reasons, and they must be asked together, IN THIS ORDER:
 *
 *  An annexed people no longer has a seat to sit in, and that holds whoever
 *  was playing them - a person whose realm has been swallowed is out of the
 *  run, and exempting them here would leave everybody else waiting on a turn
 *  that can never be taken.
 *
 *  Otherwise nobody leads it. A conquest does not wake a land up - taking a
 *  land wins the land, not its people's allegiance to a chief who does not
 *  exist - UNLESS a person is sitting there, because a player skipped forever
 *  is not a rule, it is a hung game. A leaderless person still takes no LAND;
 *  that gate is `hasRuler` at the capture sites and is untouched.
 *
 *  ONE spelling, because two readers depend on the answer matching. `advance`
 *  passes over such a seat, and `beginTurn`'s round wrap lands the arrows it
 *  left behind; a sweep that covered less than the skip did left a march
 *  standing on the map for the rest of the run, holding an army out of a land
 *  somebody else now holds. The human arm belongs here for exactly that
 *  reason: spelled in `advance` alone, it exempted the first seat from the
 *  skip while the sweep still resolved a second person's marches at somebody
 *  else's turn start. */
export function takesNoTurn(state: GameState, factionId: string): boolean {
  if (factionId in state.incorporated) return true;
  if (hasRuler(state.rulers, factionId)) return false;
  return !isHumanFaction(state, factionId);
}

/** Whether this board ends the run, and how. Pushes the ending event onto
 *  `events` and returns the phase, or null when the run goes on.
 *
 *  Shared, because a land changes hands in BOTH halves of a turn now: a claim
 *  answering, an army walking into a flattened land and a dormant land's raid
 *  all resolve in `beginTurn`, and a run won there sat unnoticed until
 *  somebody's next play - the board saying one thing and the screen another
 *  for a whole round.
 *
 *  Defeat before victory; the two cannot coincide. A rival unification last,
 *  so a turn that wins for the human is never mistaken for one that loses to
 *  somebody else. No rng: an ending is READ off the board, never rolled.
 *
 *  Every threshold here is `winSizeFor`, per faction, because the human's own
 *  bar moves when they play on and nobody else's does. The defeat arm is
 *  deliberately outside all of that: a player who has already won and carried
 *  on is incorporated on the same terms as anyone else. */
function endingFor(
  board: Pick<
    GameState, "factionIds" | "overlords" | "incorporated" | "players" |
    "humanSeats" | "turn" | "playingOn"
  >,
  playerId: number,
  events: GameEvent[],
): GamePhase | null {
  const { overlords, incorporated } = board;
  const humanFaction = humanFactionOf(board);
  if (humanFaction !== null && incorporated[humanFaction] !== undefined) {
    events.push({
      turn: board.turn, playerId, type: "defeat",
      targetFactionId: humanFaction,
      overlordFactionId: incorporated[humanFaction],
    });
    return "defeat";
  }
  if (
    humanFaction !== null &&
    // Only a free faction wins: a vassal's realm is a strict subset of its
    // root's, so victory belongs to roots.
    !overlords.has(humanFaction) &&
    fullRealmOf(humanFaction, overlords, incorporated).size >=
      winSizeFor(board, humanFaction)
  ) {
    events.push({
      turn: board.turn, playerId, type: "victory",
      ...(board.playingOn ? { playOn: true } : {}),
    });
    return "victory";
  }
  const unifier = board.factionIds.find(
    (f) =>
      f !== humanFaction &&
      !(f in incorporated) &&
      !overlords.has(f) &&
      fullRealmOf(f, overlords, incorporated).size >= winSizeFor(board, f),
  );
  if (unifier !== undefined) {
    events.push({
      turn: board.turn, playerId, type: "unified", overlordFactionId: unifier,
    });
    return "defeat";
  }
  return null;
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
   *  target is: an arrow with no tail is not a play.
   *
   *  `spend` is how much defense the raid tears out of that source - the
   *  arrow's whole strength. CLAMPED into `[MIN_RAID_SPEND, ceiling]` rather
   *  than refused when it is missing or out of range, because the callers who
   *  name none all mean the same thing by it: an AI seat on an older build, a
   *  replayed URL, the sim. "As little as the card allows" is the safe
   *  reading, and a wire is the same attack surface as a hand-edited record.
   *
   *  For Great raid it is the POOL, divided between the fan by
   *  `greatRaidSpends`. */
  opts?: { harvest?: HarvestChoice; sourceId?: string; spend?: number },
): GameState {
  if (state.phase !== "playing") return state;
  const p = state.players[state.current];
  const cardId = p.hand[cardIndex];
  if (cardId === undefined) return state;
  // The turn-spent gate. A spent turn is not simply closed: the play that
  // spent it may have re-opened it for more of its own kind, and this is the
  // one question that decides which. It never names a card - `repeatGroup`
  // carries the KEYWORD whose class was declared repeatable.
  if (!turnAccepts(state, cardId)) return state;
  const set = playableSet(
    viewOf(state), p.factionId, p.hand, { repeatOnly: repeatOnlyOf(state) },
  );
  if (set.mode !== "play" || !set.cardIndexes.includes(cardIndex)) return state;
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
  let settlementsSpent = state.settlementsSpent;
  let defense = state.defense;
  let disease = state.disease;
  let turnips = state.turnips;
  let respites = state.respites;
  let rulers = state.rulers;
  let wealth = state.wealth;
  let marches = state.marches;
  let nextMarchId = state.nextMarchId;
  let claims = state.claims;
  const armies = state.armies;
  let passives = state.passives;
  let defenseMax = state.defenseMax;

  // The reserve spends, computed against the PRE-play state. An attack play
  // cashes the whole omens stack at once; a Plague cashes the miasma stack.
  const doubled = omensMultiplier(view, p.factionId, cardId) > 1;
  const attackReadings = doubled ? (state.omens[p.factionId] ?? 0) : 0;
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

  /** One attack card committing one army. Emits `march-declared`, marking the
   *  moment the arrow appears and carrying the id the arrow is keyed on - the
   *  damage on it is a promise about next turn, not a score that moved;
   *  `march-resolved` is where the numbers go. Expiry is the src/timed.ts
   *  convention, one turn out, which is this seat's next `beginTurn` whichever
   *  seat it is. */
  const declareMarch = (
    from: string, to: string, spend: number, holdsArmy = true,
  ): void => {
    // The spend comes off the source THE MOMENT the arrow appears, not when it
    // lands. That is the whole shape of the card: what it cost is on the map
    // for a rival to read for the turn the arrow is in flight, and the number
    // printed on the arrow is a promise precisely because it was already paid.
    defense = applyDamage({ defense, defenseMax }, from, spend);
    events.push({
      turn: state.turn, playerId: p.id, type: "levied",
      cardId, targetFactionId: from, amount: spend,
    });
    const damage = attackDamageFor(view, p.factionId, cardId, spend).damage;
    const id = nextMarchId++;
    marches = addMarch(marches, {
      id,
      actor: p.factionId, from, to, cardId, damage, holdsArmy,
      expiry: state.turn + 1,
    });
    events.push({
      turn: state.turn, playerId: p.id, type: "march-declared",
      cardId, targetFactionId: to, sourceFactionId: from,
      marchId: id, amount: damage,
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
        cardId: claim.cardId,
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

  /** The other door an allegiance change comes through: one that resolves on
   *  the table rather than arriving. `cause` is required here for the same
   *  reason it is on `takeLand`. */
  const landSubjugation = (target: string, cause: SubjugationCause): void => {
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
      ...cause,
      ...(formerLord !== undefined ? { formerOverlordFactionId: formerLord } : {}),
    });
    // A land just taken cannot send its armies at its new lord, nor at anyone
    // that lord answers to. The claim path in `beginTurn` says the same thing
    // through the same predicate; both routes into a capture owe it, or which
    // route took the land decides whether its raids fly on.
    const chainView = { ...view, overlords, incorporated };
    for (const [key, march] of Object.entries(marches)) {
      if (
        march.actor !== target ||
        !aimsUpOwnChain(chainView, march.actor, march.cardId, march.to)
      ) {
        continue;
      }
      marches = clearMarches(marches, [key]);
      events.push({
        turn: state.turn, playerId: p.id, type: "march-lapsed",
        cardId: march.cardId,
        targetFactionId: march.to, sourceFactionId: march.from,
        marchIds: [march.id],
      });
    }
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
    // Declared, not landed. `declareMarch` runs the spend through
    // `attackDamageFor`, the same call the card tip quotes, so what the arrow
    // promises and what lands next turn cannot drift.
    declareMarch(sourceId, targetId, clampSpend(view, cardId, sourceId, opts?.spend));
  } else if (cardId === "great-raid" && targetId !== undefined) {
    // `greatRaidSpends` is the one list: legality asked its fan, the slider
    // tallied with it, and it is in faction order, so a seeded run declares
    // the same arrows every time. Each one holds its own land's army and lands
    // on its own axis - the card is several Raids, not one big one, and now
    // they share one purse.
    //
    // The no-opinion default is ONE POINT PER ARROW and not one point, which
    // is the difference between "as little as the card allows" and "not the
    // card at all": a pool of 1 across a fan of three sends a single arrow,
    // which is a Raid played at a Great raid's price. A caller with nothing to
    // say - the sim, a fast-forward, an older build - means the card it named.
    const fanSize = greatRaidMarches(view, p.factionId, targetId).length;
    const pool = Math.max(
      MIN_RAID_SPEND * fanSize,
      Math.min(
        greatRaidPool(view, p.factionId, targetId),
        Math.floor(opts?.spend ?? 0),
      ),
    );
    for (const m of greatRaidSpends(view, p.factionId, targetId, pool)) {
      // A land the pool left nothing for sends no arrow. The minimum is 1
      // everywhere, so a 0 STR arrow cannot exist here either - and dropping
      // the land drops its army commitment with it.
      if (m.spend < MIN_RAID_SPEND) continue;
      declareMarch(m.from, m.to, m.spend, m.holdsArmy);
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
      // Hostile, and a Plague has no aim of its own - it lands wherever the
      // actor's stacks already sit, which may include a land seeded before the
      // actor knelt to anybody. The stacks stay where they are and burn
      // nothing: a card whose keyword says it cannot strike upward must not
      // find a back door through a stack laid last week.
      if (aimsUpOwnChain(view, p.factionId, cardId, polygon)) continue;
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
    // The same predicate the damage loop skipped on: a land the plague could
    // not strike keeps its stacks, or the card would cost the actor its
    // disease for nothing.
    disease = clearDiseaseOf(
      disease, p.factionId,
      (polygon) => aimsUpOwnChain(view, p.factionId, cardId, polygon),
    );
  } else if (cardId === "foul-winds") {
    // One event per polygon whose ownership moved: the stacks the actor
    // GAINED there (the total held by others before the shift), plus the
    // per-loser breakdown the walk needs to zero each of THEIR counts too.
    for (const polygon of state.factionIds) {
      const owners = disease[polygon];
      if (owners === undefined) continue;
      // The same clause as the Plague above, for the same reason: claiming the
      // stacks standing on a lord's land is how the NEXT plague would strike
      // it, so a hostile card stops at the pyramid here too.
      if (aimsUpOwnChain(view, p.factionId, cardId, polygon)) continue;
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
    // The same predicate the event loop above skipped on, so the store and the
    // log cannot disagree about which polygons the winds reached.
    disease = transferAllDiseaseTo(
      disease, p.factionId,
      (polygon) => aimsUpOwnChain(view, p.factionId, cardId, polygon),
    );
  } else if (isSingleLandHeal(cardId) && targetId !== undefined) {
    // One branch for the whole class: which card it is decides only how much,
    // and that number is the table the hover quoted before the click.
    // Through the multiplier, so a held omens reading doubles a heal exactly
    // as it doubles a raid - and the reading is spent above by the same test.
    landHeal(
      targetId,
      SINGLE_LAND_HEAL[cardId] * omensMultiplier(view, p.factionId, cardId),
    );
    // What the heal is called on. Asked of the card's CLASS, so a Hillfort -
    // which is a single-land heal and no fortify - costs nothing, and a future
    // fortify card is bounded without touching this branch. One settlement
    // whatever the card restores: the bound is a fortify per settlement per
    // turn, not a settlement per point.
    if (keywordHas(cardId, "spendsSettlement")) {
      settlementsSpent = {
        ...settlementsSpent,
        [targetId]: (settlementsSpent[targetId] ?? 0) + 1,
      };
    }
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
    // No successor: a land with nobody to take up the crown falls to whoever
    // killed its ruler, gate and respite alike bypassed - the killing IS the
    // taking. A guarded play never reaches this branch, so a bodyguard stops
    // it without a second check here.
    if (
      hasPassive(passives, targetId, "no-successor") &&
      !fullRealmOf(p.factionId, overlords, incorporated).has(targetId)
    ) {
      firePassive(events, state.turn, p.id, "no-successor", targetId);
      landSubjugation(targetId, { via: "passive", passiveId: "no-successor" });
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
      actor: p.factionId, from: p.factionId, to: targetId, cardId,
      expiry: state.turn + 1,
    });
  } else if (cardId === "incorporate" && targetId !== undefined) {
    landIncorporation(targetId);
  } else if (cardId === "turnip-harvest") {
    // Choiceless callers - the sim, a `turns=` fast-forward, an AI seat -
    // decide for themselves. The app asks the player first and hands the
    // answer in through `opts`.
    const choice = opts?.harvest ?? autoHarvestChoice(players[state.current]);
    // Burning a card is one of two harvests that take something away, and the
    // only one the player asks for by itself.
    if (choice.kind === "destroy") {
      players = updateFaction(players, p.factionId, (pl) =>
        removeCopies(pl, choice.cardId, 1, BURN_ORDER).player);
      events.push({
        turn: state.turn, playerId: p.id, type: "harvest-burned",
        cardId: choice.cardId,
      });
    }
    const gained = harvestCard(players[state.current], choice, rng);
    // The other harvest that takes something away: a priced card is bought with
    // copies of a lesser card, and they leave the game the way a burn does.
    //
    // Charged only against a grant that resolved, and only AFTER it resolved.
    // `harvestCard` asks `buildOffer` whether the pick is affordable, and a
    // payment taken first is a payment that can make its own pick unaffordable
    // - a seat holding exactly two Raids would have handed both over and been
    // told it could not afford the card it had just paid for.
    if (choice.kind === "build" && gained !== null) {
      const cost = upgradeCostOf(gained);
      if (cost !== null) {
        players = updateFaction(players, p.factionId, (pl) =>
          removeCopies(pl, cost.from, cost.count, SPEND_ORDER).player);
        // One line per copy. The log reads as the trade it is: two Raids burned
        // under the play, then the Strong raid kept.
        for (let i = 0; i < cost.count; i++) {
          events.push({
            turn: state.turn, playerId: p.id, type: "harvest-burned",
            cardId: cost.from,
          });
        }
      }
    }
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

  phase = endingFor(
    { ...state, players, overlords, incorporated }, p.id, events,
  ) ?? phase;

  return {
    ...state, phase, players, overlords, incorporated, guards, omens, miasma,
    settlements, settlementsSpent, defense, defenseMax, disease, turnips,
    wealth, respites, rulers, marches, nextMarchId, claims, armies, passives,
    log: appendEvents(state, events),
    // A standard turn is spent by its one play. An unlimited turn stays open
    // until the player says otherwise, even with an empty hand: a turn that
    // ended itself the moment the last card left made the round hand over
    // while the player was still reading what their play had done.
    playedThisTurn: state.rules.turn !== "unlimited",
    // And the played card says whether the spent turn accepts more of its own
    // CLASS. Overwritten rather than accumulated: the run is a run of one
    // keyword, so the last play is the whole of the answer.
    repeatGroup: repeatGroupOf(cardId),
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
    // Closed, and closed for good: only a play re-opens a turn. See `endTurn`.
    playedThisTurn: true, repeatGroup: null,
  };
}

/** Closes an unlimited-rules turn. The only writer of `playedThisTurn` that
 *  moves nothing else: no event and no log line, because the log already
 *  carries every play the turn made.
 *
 *  It clears the repeat as well, because giving the turn up has to be final:
 *  a turn left carrying the card that re-opened it would come back the moment
 *  it was closed, and the player who clicked End turn would be handed their
 *  turn again. */
export function endTurn(state: GameState): GameState {
  if (state.phase !== "playing") return state;
  // A turn a card re-opened can be given up under ANY rule set: a repeat
  // grants another play, never an obligation to make one. Without this the
  // standard branch below refuses, `advance` refuses in turn - it asks
  // `turnOpen` now - and a seat holding a raid it cannot aim anywhere sits
  // there forever.
  if (state.repeatGroup !== null) {
    return { ...state, playedThisTurn: true, repeatGroup: null };
  }
  if (state.rules.turn !== "unlimited") return state;
  if (state.playedThisTurn) return state;
  return { ...state, playedThisTurn: true, repeatGroup: null };
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
  // `turnOpen`, never `playedThisTurn`: a card that re-opened the turn for
  // another copy of itself has spent the allowance and still has a play
  // coming. Asking the flag here is what let a network guest's second Raid be
  // advanced out from under it while the local seat kept its turn.
  if (rawState.phase !== "playing" || turnOpen(rawState)) return rawState;
  const state = sweepHand(rawState);
  let current = state.current;
  let turn = state.turn;
  for (let tried = 0; tried < state.players.length; tried++) {
    current = (current + 1) % state.players.length;
    if (current === 0) turn += 1;
    // No exemption for a person's seat here. `takesNoTurn` already keeps a
    // leaderless person's chair warm and already gives up an annexed one, and
    // it is the same call `beginTurn`'s round-wrap sweep makes - which is why
    // the question is asked there rather than answered twice.
    if (!takesNoTurn(state, state.players[current].factionId)) {
      return beginTurn({ ...state, current, turn }, rng);
    }
  }
  // Unreachable while a game is playing: a unification ends the run long
  // before every seat is incorporated. Throwing beats spinning.
  throw new Error("advance: no living seat to move to");
}

/** Whether the SOLO human is on turn. Seat 0 by name, because the one caller
 *  is the boot path's fast-forward, which stops when the player's own turn
 *  comes back. A net screen asks a different question - whether the seat on
 *  turn is the one THIS screen plays - and must not reach for this. */
export function isHumanTurn(state: GameState): boolean {
  return state.phase === "playing" && state.current === 0;
}
