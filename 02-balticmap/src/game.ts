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
  defenseMaxOf, defenseOf, HARVEST_FEAST_HEAL, independenceGateLine,
  independenceGateOpen,
  MIN_RAID_SPEND,
  PLAGUE_DAMAGE_PER_STACK, LAND_GROWTH, SINGLE_LAND_HEAL,
  transferAllDiseaseTo, turnipThresholdFor, WAR_COUNCIL_LEADERSHIP,
  type Defense, type Disease,
} from "./defense";
import {
  aimsWithinOwnRealm, attackDamageFor, omensMultiplier, attackReach,
  ESCAPE_RESPITE_TURNS, foulWindsTargetsOf, freeArmiesFor, greatRaidMarches,
  marchSourcesAgainst,
  claimWouldLand, greatRaidPool, greatRaidSpends,
  handLimitFor, marchHopsTo, marchTargetsFrom, outbreakPolygons,
  MIN_HAND, plagueMultiplier, plagueTargetsOf,
  playableSet, spendCeilingOn,
  turnipThresholdOn, validTargetsFor, wealthIncomeFor,
  type Guards, type Omens, type RulesView,
} from "./playability";
import {
  addClaim, addMarch, axesOf, axisKeyOf, claimKeyOf, clearClaims,
  clearMarches,
  lapsedClaimsOf, lapsedMarchesOf, resolveAxis,
  type Armies, type Claims, type March, type Marches,
} from "./marches";
import {
  autoHarvestChoice, buildOffer, BURN_ORDER, harvestCard, removeCopies,
  SPEND_ORDER, type HarvestChoice,
} from "./harvest";
import {
  damageAfterTerrain, hasPassive, passivesOn, quietPassives,
  RESTLESS_RAID_CHANCE, seedTerrain, stripOnCapture, WILD_LANDS_HEAL,
  WILD_LANDS_HEAL_CHANCE, type Passives,
} from "./passives";
import {
  abilitiesByFaction, grantAbility, hasRuler, initialRulers, leadersByFaction,
  leadershipByFaction, replaceRuler, rulerNameOf, rulerOf, seatRuler,
  vacateRulers, type Rulers,
} from "./rulers";
import {
  absorbsDuelEnemy, actExitSize, ACTS, bossFor, boonsFor, BOON_GROWTH_AMOUNT,
  BOSS_CEILING_PER_ACT, BOSS_LEADERSHIP_PER_ACT, BOSS_RAIDS_PER_ACT,
  duelDecidedBy, duelStakes, duelStanding, gauntletAtRoundWrap, rewardFor,
  type Boon, type DuelOutcome, type Gauntlet,
} from "./gauntlet";
import { BUILD_ABILITIES, RAID_LEADERSHIP } from "./abilities";
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
  | "duel-won" | "duel-lost" | "duel-void"
  | "boss-foretold" | "boon-taken"
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
  /** tribute: the coins this payment moved from the vassal to its lord.
   *  duel-won: the coins a won duel paid into the winner's treasury, on the
   *  one reward of the three that moves no walked score. */
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
  /** Where the run is in the gauntlet cycle - picking a target, dueling one,
   *  or letting the world take its one turn. See src/gauntlet.ts, which owns
   *  the union and every transition it makes.
   *
   *  On the state and not in src/main.ts for the reason `playingOn` is: a
   *  guest holds a replica, and the scope the host's turn loop is applying is
   *  the scope the guest's screen has to draw. */
  gauntlet: Gauntlet;
  /** Which act the run is in, 1 to `ACTS`. A high-water mark: it moves only
   *  when the act's boss is BEATEN, never on the realm shrinking and never on
   *  a boss duel lost.
   *
   *  Reaching an act's exit size (`actExitSize`) SUMMONS that act's boss; it
   *  does not advance the act. The two were one number first, and the run then
   *  skipped its own boss the moment a duel won two lands at once.
   *
   *  A plain number, so it crosses `src/net-codec.ts` for free - and it has to
   *  cross, because a guest's screen draws the act the host's engine is
   *  applying, the same reason `playingOn` is state. */
  act: number;
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
  /** The faction ids that do NOT stand on the map: powers from beyond the
   *  frame, summoned for the run's last act.
   *
   *  A list rather than a flag on each faction, because everything that asks
   *  is asking about the ROSTER - how much of the map is there to hold - and a
   *  per-faction lookup would put that arithmetic at every call site.
   *
   *  The bar reads it (`winSizeFor`), and so does the scan for a rival about
   *  to unify: a power that holds no ground on the map must not move the
   *  number of lands a run is played for, and must not win the map by
   *  arithmetic it was never on. */
  foreign: string[];
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

/** What a round of a running duel costs BOTH of the lands it is about.
 *
 *  Pressure, and deliberately not a clock. `DUEL_TURNS` was removed because a
 *  duel should end on a fact about the board rather than on a number running
 *  out - and a duel that ends on nothing at all is the stalemate that number
 *  existed to prevent. This is the answer the plan named in advance: a fight
 *  neither side can move begins to wear the ground it is fought over, so the
 *  board itself converges on an answer.
 *
 *  Both ends, never one. A drain that only bled the stake would be a timer
 *  wearing the player's colours, and the player would be counting rounds again
 *  - which is the thing the clock's removal was for. Wearing both means the
 *  side that is AHEAD wins a long duel, which is what a siege should decide.
 *
 *  One point a round, so it is slow enough that a duel is still won by playing
 *  rather than by waiting, and steady enough that no duel runs forever.
 *  Measured before it existed: over three seeds a run settled one duel in
 *  eighty-nine turns and never closed an act.
 *
 *  It is logged as `levied`, the line that already means "this land lost
 *  defense to something other than an attack", so it walks the same standings
 *  every other score does and needs no table entry of its own. */
export const DUEL_ATTRITION = 1;

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
 *  guest's seat and not the seat the raised bar belongs to.
 *
 *  The count is `homeRoster`, never `factionIds`: a power summoned from beyond
 *  the frame joins the roster and holds no ground on the map, so counting it
 *  would move the bar from thirteen lands to fourteen at the exact moment the
 *  run's last act begins - a run getting harder because its own boss turned
 *  up, in a number the player has been reading all game. */
export function winSizeFor(
  board: Pick<
    GameState, "factionIds" | "foreign" | "players" | "humanSeats" | "playingOn"
  >,
  factionId: string,
): number {
  const roster = homeRoster(board);
  if (board.playingOn && factionId === humanFactionOf(board)) return roster;
  return victoryRealmSize(roster);
}

/** How many factions actually stand on the map: the roster less anything
 *  summoned from beyond the frame.
 *
 *  One reader per question rather than one number sprinkled about - the bar
 *  above, and the rival-unification scan in `endingFor`. Both are asking "how
 *  much of the map is there", and a power with no ground on it is not part of
 *  the answer. */
export function homeRoster(
  board: Pick<GameState, "factionIds" | "foreign">,
): number {
  return board.factionIds.length - board.foreign.length;
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
    // The first thing a run does is choose who to fight. Empty here because
    // nobody has been dealt a land yet and a realm with no ground borders
    // nothing; `pickFaction` reaches the round wrap the moment the seats are
    // dealt, and that is what fills the offer.
    gauntlet: { kind: "picking", candidates: [], boss: false },
    // Every run opens on the first act. Nothing seeds it higher: an act is
    // earned by beating the boss that closes the one before it.
    act: 1,
    turn: 1,
    players: [],
    current: 0,
    playedThisTurn: false,
    repeatGroup: null,
    rules: { ...DEFAULT_RULES },
    factionIds,
    // Nothing from beyond the frame until the last act summons it.
    foreign: [],
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
 *  gives the new holding something to stand on - but never enough to stand it
 *  back up ON its own independence line. Deterministic - no rng, so an AI
 *  seat's conquest replays identically.
 *
 *  The cap is the whole reason this is not a plain half. A conquest heals the
 *  garrison into the taken land, and the land's first `beginTurn` reads
 *  `independenceGateOpen` before anything else: a garrison at or above the
 *  line hands the new vassal its freedom at the first opportunity it gets, so
 *  the taker would be arming the escape it just prevented. The polygons this
 *  bites are the small ones - on a land whose ceiling is 2 the line is 2, and
 *  half of any healthy raider clears it - which is why the cap is derived from
 *  the destination's own line (`independenceGateLine`) rather than written as
 *  a number.
 *
 *  A PERSON is never capped here, because a person is not forced: the modal
 *  raised by `pendingTransfers` is the same question asked out loud, 0 is
 *  already one of its answers, and choosing to over-garrison a vassal is a
 *  play a player may want to make. This removes the asymmetry rather than
 *  adding a rule. */
export function autoTransfer(
  state: GameState, from: string, to: string,
): number {
  const v = { defense: state.defense, defenseMax: state.defenseMax };
  const held = defenseOf(v, from);
  const underGate = Math.max(
    0, independenceGateLine(v, to) - 1 - defenseOf(v, to),
  );
  return Math.min(
    Math.floor(held / 2), transferLimit(state, from, to), underGate,
  );
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

/** How many lands are seeded with NO chief - the grey middle. Everybody else
 *  gets a ruler and takes turns; these keep a seat and a deck and simply never
 *  play, per `keeps-to-itself` in src/passives.ts.
 *
 *  The seeding is stated as how many stay quiet rather than as how many act,
 *  because "quiet" is now the exception and a rule reads best from its
 *  exception. It used to be the other way round - five acting seats on a
 *  twenty-six land map - and the cost of that was measured: a duel enemy with
 *  no chief was supposed to be RARE and was 41.6% of duels, because
 *  `duelCandidates` can only prefer a chiefed land that the border actually
 *  offers, and a border made of quiet lands offers none.
 *
 *  **Waking the map is affordable now and was not before.** A wide acting set
 *  used to mean every seat playing every round, for the whole run. Under the
 *  gauntlet only the two duelling realms act while a duel is running
 *  (`duelStanding` in src/gauntlet.ts, read by `takesNoTurn`), so the width
 *  costs turns only during the one unscoped world-tick round per gauntlet.
 *  That is the reason the old constraint no longer binds, and if the duel
 *  scope is ever removed this number has to be revisited with it.
 *
 *  **Six, and not zero.** A grey middle is a designed feature and not a
 *  leftover: it is what the restless raid fires out of, it is what a young
 *  realm expands into, and the three-part chiefless-duel rule (prefer a
 *  chiefed candidate, fight a chiefless one fully, absorb it on defeat) needs
 *  something to fire on or it rots. Six of the Baltic's twenty-six is about a
 *  quarter of the map, which is a visible middle rather than a rounding error,
 *  and no realm on either map is walled in by it.
 *
 *  **What the number actually bought, measured rather than intended.** 156
 *  runs of the duel sweep, every faction as the human across six seeds: the
 *  chiefless share of duels went from 41.6% (438 of 1053) to 0.0% (0 of 3184).
 *  The curve is steep and there is no number that lands in between - 12 quiet
 *  lands still measures 0.6%, and the 41.6% came from having 21 of them. So
 *  "rare" here means the fallback is now the hemmed-in realm the shape of a
 *  map can still produce, pinned by tests/gauntlet.test.ts rather than met on
 *  every run. That is the honest reading and it is why the arm stays. */
export const QUIET_LANDS = 6;

/** The fewest lands that ever take turns, whatever `QUIET_LANDS` asks for.
 *  This is the old acting CEILING read as a floor: a six-land test map still
 *  seats five, and a three-land one seats everybody. */
export const MIN_ACTING = 5;

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

/** Which factions take turns: everybody `seatable`, less the handful drawn to
 *  stay quiet. The human's pick and any reserved pick (a multiplayer guest)
 *  are never drawn.
 *
 *  Every candidate is `seatable`, so a map that opens with realms on it offers
 *  seats to the realm roots and the free lands and to nothing else.
 *
 *  **There is no spacing rule any more, and that is a measured decision.** The
 *  draw used to keep the five acting seats off each other's borders. With most
 *  of the map seated there is no room for such a test to decide anything - the
 *  fallback pass placed nearly every seat regardless - so the rule was tried
 *  inverted onto the quiet draw, where "two quiet lands never touch" would
 *  stop a realm being walled in by chiefless neighbours. It was then measured
 *  over 156 sweep runs and moved the chiefless share of duels by ONE duel in
 *  3200. `QUIET_LANDS` alone does that job, and clumping is the only shape
 *  that still produces the hemmed-in border the chiefless-duel rule exists
 *  for, so keeping the test would have cost a scan per candidate to make a
 *  documented rule slightly less reachable.
 *
 *  One `shuffle` and no other rng, the same as before: the draw count per deal
 *  is a frozen contract (tests/rng-isolation.test.ts). */
function actingFactions(
  state: GameState, humanFactionId: string, reserved: string[], rng: Rng,
): string[] {
  const seated = [humanFactionId];
  for (const id of reserved) {
    if (id !== humanFactionId && seatable(state, id) && !seated.includes(id)) {
      seated.push(id);
    }
  }
  const seats = state.factionIds.filter((id) => seatable(state, id));
  const pool = shuffle(seats.filter((id) => !seated.includes(id)), rng);
  const want = Math.max(
    0,
    Math.min(QUIET_LANDS, seats.length - Math.max(MIN_ACTING, seated.length)),
  );
  return [...seated, ...pool.slice(want)];
}

/** What a newly seated ruler holds: whatever its own people's build brings,
 *  from the one table the build screen and `pickFaction` also read. A woken
 *  vassal is a seat like any other - a warpath people raid with `war-leader`
 *  behind them - because the alternative is a second class of ruler, and the
 *  whole design is that a status is the only difference between a land that
 *  plays and one that does not.
 *
 *  Its own people's build, never the taker's: the land keeps the deck it was
 *  dealt when it changes hands, and the abilities have to describe that deck.
 *
 *  A helper rather than a line inside `takeLand` because both doors an
 *  allegiance change comes through owe the same answer - an army walking in
 *  or a Subjugate claim landing (both `takeLand`), and a no-successor
 *  assassination handing the land to its killer (`landSubjugation`) - and
 *  two spellings would be two rules within a week. */
function seatingAbilities(
  players: readonly PlayerState[], factionId: string,
): readonly string[] {
  const pl = players.find((p) => p.factionId === factionId);
  return pl === undefined ? [] : BUILD_ABILITIES[pl.strategy] ?? [];
}

/** Every faction gets a seat and the same starting deck; all but
 *  `QUIET_LANDS` of them take turns, and the rest carry `keeps-to-itself`.
 *  Each AI seat rolls
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
  // Only the factions that act keep a leader at the DEAL. Everything else
  // about a quiet land follows from the vacancy: no ruler, so no turn, so no
  // cards - until somebody takes it, and `takeLand` seats a chief on the land
  // it took.
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
    // A duel settles at a round wrap, out of a batch that opens with no play
    // at all - the card that took the land was played a turn or twenty ago,
    // and a void one was decided by nothing being played. There is nothing
    // above any of the three to indent under. The prophecy is the same wrap's
    // work, and the boon is a modal answered on the player's own turn with no
    // card behind it.
    case "duel-won":
    case "duel-lost":
    case "duel-void":
    case "boss-foretold":
    case "boon-taken":
      return false;
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
  // The second allegiance store, and it moves in here for one reason: a duel
  // enemy that follows nobody is ABSORBED rather than sworn (`takeLand`
  // below). Local rather than read off the snapshot, because everything after
  // that point - the next arrow's arrival, the hand refill, the ending - has
  // to see the land inside the winner's realm.
  let incorporated = state.incorporated;
  let respites = state.respites;
  let players = state.players;
  // A conquest below seats a leader on the land it takes, so the turn's rulers
  // are not the ones it started with.
  let rulers = state.rulers;
  const lord = overlords.get(p.factionId);
  // `escapesVassalage` and not the gate directly: `takesNoTurn` asks the same
  // question one line earlier, to judge the duel scope against the realm this
  // seat is about to be in, and two spellings of it would disagree.
  if (lord !== undefined && escapesVassalage(state, p.factionId)) {
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
  // The ceiling moves in `beginTurn` for exactly one reason - a duel won on a
  // big land grows the winner's home, ceiling and score together, the way
  // Prosperous proliferation does. Raising one alone is the trap that rule
  // already names: both gates are shares OF the ceiling.
  let defenseMax = state.defenseMax;
  // Income adds to this near the end of the turn; the duel spoils add to it at
  // the round wrap, which is above that. A `let` from the top so the two
  // cannot each start from `state.wealth` and throw the other away.
  let wealth = state.wealth;
  let passives = state.passives;
  // The gauntlet moves in two places in this function and they are different
  // kinds of move. A conquest below may DECIDE a running duel the moment the
  // land changes hands; the round wrap further down is where the cycle
  // actually turns. Both write this one local, so the wrap reads a duel that
  // this very turn's arrivals have already settled.
  let gauntlet = state.gauntlet;
  // The act moves in one place - a boss duel WON, in `settleDuel` - and is
  // written back at the bottom with the gauntlet it belongs beside.
  let act = state.act;
  /** Set by `settleDuel` when an act's boss took the land that was staked on
   *  it. Read once, at the ending below: the phase is decided in one place in
   *  this function, and a second writer of it is a second answer to "is the
   *  run over" that the first would eventually disagree with. */
  let bossLost = false;
  // The five stores a summoned power joins. Locals from the top, the way every
  // other store this function writes is: `summonForeignPower` runs mid-wrap
  // and the round-wrap block below reads the roster it left behind.
  let factionIds = state.factionIds;
  let foreign = state.foreign;
  let adjacency = state.adjacency;
  let siteCaps = state.siteCaps;
  let ethnicities = state.ethnicities;
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
    // Before the move, because the question is which side the land was on -
    // one line later `overlords` no longer knows. Both of these ask it, so
    // both are asked here.
    const absorbed = absorbsDuelEnemy(
      gauntlet, humanFactionOf(state), land, by,
      !hasRuler(rulers, land), overlords, incorporated,
    );
    gauntlet = duelDecidedBy(
      gauntlet, humanFactionOf(state), land, by, overlords, incorporated,
    );
    if (absorbed) {
      // A people who follow nobody are taken outright rather than sworn -
      // see `absorbsDuelEnemy` for why that is the difference a chiefless
      // duel enemy makes, and why nothing outside a duel reads this way.
      //
      // The pyramid under it comes apart on Incorporate's own rule: fealty
      // was to a lord that has just stopped existing as a seat, and
      // re-parenting its vassals would make absorbing a mid-lord strictly
      // better than digesting one. Its OWN annexations follow it, because
      // they were never a fealty link to begin with.
      overlords.delete(land);
      for (const [vassal, lord] of [...overlords]) {
        if (lord === land) {
          overlords.delete(vassal);
          respites = {
            ...respites, [vassal]: state.turn + ESCAPE_RESPITE_TURNS,
          };
          players = updateFaction(players, vassal, stripTribute);
          events.push({
            turn: state.turn, playerId: p.id, type: "released",
            targetFactionId: vassal, overlordFactionId: land,
          });
        }
      }
      incorporated = { ...incorporated, [land]: by };
      for (const [annexed, owner] of Object.entries(incorporated)) {
        if (owner === land) incorporated = { ...incorporated, [annexed]: by };
      }
      passives = stripOnCapture(passives, land);
      players = updateFaction(players, land, stripTribute);
      // No chief is seated and no tribute is dealt: an annexed people has no
      // seat to sit in and no turn to spend a card on. No transfer question
      // either - defenders are moved into a land that will hold a border, and
      // an absorbed one is inside the realm rather than on the edge of it.
      events.push({
        turn: state.turn, playerId: p.id, type: "incorporated",
        targetFactionId: land, overlordFactionId: by,
      });
      return;
    }
    overlords.set(land, by);
    passives = stripOnCapture(passives, land);
    // The people wake up under their new lord: a land that has changed hands
    // has a chief, and a chief is the whole of what makes a seat take turns.
    // An occupied chair is handed straight back, so a land taken from a lord
    // who was already leading it keeps the leader it had.
    rulers = seatRuler(
      rulers, state.ethnicities, land, state.turn,
      seatingAbilities(players, land),
    );
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
    // A PERSON is asked, whichever seat they sit in; everybody else gets
    // `autoTransfer`'s capped amount on the spot (see its doc comment for why
    // the cap exists). Every conquest asks: a turn that takes three lands
    // queues three questions and they are answered in the order the lands
    // fell. It must NOT fall through to the automatic transfer - that moved
    // points out of a land the player was never asked about, which is the one
    // thing `pendingTransfers` exists to prevent.
    if (isHumanFaction(state, by)) {
      pendingTransfers[by] = [...(pendingTransfers[by] ?? []), { from, to: land }];
      return;
    }
    const moved = autoTransfer(
      { ...state, defense, defenseMax }, from, land,
    );
    if (moved > 0) {
      const v = { defense, defenseMax };
      defense = applyHeal(
        { defense: applyDamage(v, from, moved), defenseMax },
        land, moved,
      );
      events.push({
        turn: state.turn, playerId: p.id, type: "transferred",
        targetFactionId: land, sourceFactionId: from, amount: moved,
      });
    }
  };

  // Claims land before marches are declared and after they have resolved: a
  // demand that arrives to find the land still broken takes it. What the land
  // already has in the air is NOT called off here - see the note on
  // `resolveMarches`: an arrow is judged when it is declared and again when it
  // lands, and never in between.
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
    }
  };

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
      fullRealmOf(capture.by, overlords, incorporated).has(capture.land)
    ) {
      return { defense, taken: false };
    }
    takeLand(capture.land, capture.by, capture.from, {
      via: "conquest", cardId: capture.cardId,
    });
    return { defense, taken: true };
  };

  /** The last act's enemy, called onto the map's edge.
   *
   *  It is a FACTION and not a new kind of thing, for the reason a boss is a
   *  neighbour rather than a new kind of entity: `attackReach`,
   *  `marchTargetsFrom`, the arrow scene, the duel scope and the turn loop all
   *  work on faction ids, and a power that was anything else would need every
   *  one of them taught about it. What makes it foreign is one list -
   *  `GameState.foreign` - which the bar and the unification scan read so that
   *  a power holding no ground on the map cannot move either number.
   *
   *  It borrows its polygon from the map's baked neighbours (`ForeignPowerDef`
   *  in src/regions.ts). The ground was always drawn there; nothing in the
   *  game had ever heard of it.
   *
   *  Its adjacency is the `landings`, both ways. That is the whole geography
   *  of it: an army may march out to it only from a land that faces it, and
   *  its own raids reach only the lands it faces. `hopsBetween` then answers
   *  for it exactly as it answers for anywhere else, so one land behind a
   *  landing is two hops out and the three-hop rule needs nothing new.
   *
   *  Returns the state unchanged when the power is already standing, so a
   *  second summon - a retry after a lost expedition - cannot deal it a second
   *  seat. */
  const summonForeignPower = (): void => {
    const def = activeRegion().foreignPower;
    if (state.factionIds.includes(def.id)) return;
    factionIds = [...factionIds, def.id];
    foreign = [...foreign, def.id];
    // Both ways, and only the landings. A power reachable from a land that
    // does not face it would be an expedition setting out from the wrong coast.
    const nextAdjacency: Record<string, string[]> = { ...adjacency };
    const reachable = def.landings.filter((l) => factionIds.includes(l));
    nextAdjacency[def.id] = [...reachable];
    for (const land of reachable) {
      nextAdjacency[land] = [...(nextAdjacency[land] ?? []), def.id];
    }
    adjacency = nextAdjacency;
    defenseMax = { ...defenseMax, [def.id]: def.defenseMax };
    // No settlements, ever: it is not ground the player can build on, and a
    // site cap would put a Found a settlement target beyond the frame.
    siteCaps = { ...siteCaps, [def.id]: 0 };
    ethnicities = { ...ethnicities, [def.id]: def.id };
    // Its own seat, so it can answer. A warpath deck, because what it does is
    // send armies - and the AI already has a branch for every card in one.
    players = [...players, makePlayer(players.length, def.id, "warpath", rng)];
    rulers = seatRuler(
      rulers, ethnicities, def.id, state.turn,
      BUILD_ABILITIES.warpath ?? [],
    );
  };

  /** An act's champion, made ready to be beaten.
   *
   *  Four levers, and every one of them is something the game already does to
   *  a land - which is the whole design of a boss here. It is not a new kind
   *  of entity with rules of its own; it is a neighbour the map has raised up,
   *  and a player who has learned to read a ceiling, a chief and a deck can
   *  read this one too.
   *
   *  - The `regional-leader` status, which shrugs off a quarter of every blow
   *    and is what the land hover names.
   *  - A ceiling raised by the act, and a heal that takes it there. The
   *    ceiling is what the player can READ before committing, which is what
   *    makes the fight a decision rather than a surprise.
   *  - A chief who leads its raids in person: `war-leader` AND the leadership
   *    that makes the ability mean anything. Granting the ability alone was
   *    the first version, and the boss raided for exactly what its neighbours
   *    did - the ability adds the leader's leadership, and a chief seated by
   *    `seatRuler` holds 0 of it.
   *  - More of its own build's raids. A boss that only defends is a boss the
   *    player starves out, and extra copies of a card the AI already has a
   *    branch for is the cheapest way to make it answer.
   *
   *  A chiefless champion gets everything but the chief, and that is not a
   *  hole: `bossFor` prefers a led candidate, so this is the hemmed-in border
   *  the offer's own fallback covers, and beating such a land absorbs it
   *  outright (`absorbsDuelEnemy`) - which is a bigger prize, not a smaller
   *  one. */
  const elevateBoss = (
    boss: string, forAct: number,
  ): {
    passives: Passives;
    defense: Defense;
    defenseMax: Record<string, number>;
    rulers: Rulers;
    players: PlayerState[];
  } => {
    const held = passivesOn(passives, boss);
    const nextPassives = held.includes("regional-leader")
      ? passives
      : { ...passives, [boss]: [...held, "regional-leader"] };
    const nextMax = {
      ...defenseMax,
      [boss]:
        defenseMaxOf({ defense, defenseMax }, boss) +
        BOSS_CEILING_PER_ACT * forAct,
    };
    // To the ceiling, so the number the prophecy sends the player to look at
    // is the number they will have to get through.
    const nextDefense = applyHeal(
      { defense, defenseMax: nextMax }, boss,
      defenseMaxOf({ defense, defenseMax: nextMax }, boss),
    );
    let nextRulers = rulers;
    if (hasRuler(rulers, boss)) {
      nextRulers = grantAbility(nextRulers, [boss], RAID_LEADERSHIP);
      const chief = nextRulers[boss];
      if (chief !== undefined) {
        nextRulers = {
          ...nextRulers,
          [boss]: {
            ...chief,
            leadership: chief.leadership + BOSS_LEADERSHIP_PER_ACT * forAct,
          },
        };
      }
    }
    const extra = Array.from(
      { length: BOSS_RAIDS_PER_ACT * forAct }, () => "raid",
    );
    // The tribute-injection shape: shuffled in rather than stacked on top, so
    // the boss does not draw its whole reinforcement in one turn.
    const nextPlayers = updateFaction(players, boss, (pl) => ({
      ...pl, deck: shuffle([...pl.deck, ...extra], rng),
    }));
    return {
      passives: nextPassives,
      defense: nextDefense,
      defenseMax: nextMax,
      rulers: nextRulers,
      players: nextPlayers,
    };
  };

  /** The duel's settlement, written at the wrap that retires it: ONE event
   *  whichever way the fight went, and the spoils on the one arm that earns
   *  them.
   *
   *  Every ending is announced and not only the win. A duel is a promise the
   *  run makes and then settles, and the un-won ways it settles used to produce
   *  nothing at all - no event, no line, no sound - so a player learned it from
   *  the next offer appearing. `Gauntlet.decided` says which it was, written at
   *  the moment the ground moved, because the difference is the sentence.
   *
   *  A duel retiring with nothing recorded is a VOID one - the fight lost one
   *  of its two ends before either land could move (`duelVoided`). It is the
   *  only outcome derived here rather than read, and the derivation is
   *  exhaustive: the wrap retires a duel for exactly two reasons and `decided`
   *  covers the other.
   *
   *  What a won duel is worth is paid into the winner's realm here. Losing pays
   *  nothing and takes nothing extra either: the forfeit IS the staked land,
   *  and the enemy has already walked into it, so there is no second transfer
   *  to make here.
   *
   *  The spoils COME HOME - to the human's own land, whichever of the enemy's
   *  lands actually changed hands. Two reasons, and the second is the one that
   *  matters: the reward is promised in the picker against the ENEMY, before a
   *  single arrow is sent, so the land it derives from has to be the one the
   *  offer named; and the land that fell may be a vassal of a vassal the
   *  winner never aimed at. `rewardFor` is the whole of what the two surfaces
   *  share, which is what stops the offer promising what this does not pay.
   *
   *  One event, whatever the reward, carrying the defense it moved so the
   *  before -> after suffix comes off the same walk every other score does. */
  const settleDuel = (
    enemy: string, outcome: DuelOutcome, boss: boolean,
  ): void => {
    const home = humanFactionOf(state);
    if (home === null) return;
    const winner = players.find((pl) => pl.factionId === home);
    // Beating the act's boss is what carries the run forward, and it is the
    // ONLY thing that does: reaching an act's exit size summons the boss and
    // moves nothing. A losing boss duel leaves the act where it stands and the
    // boss is summoned again at the next wrap, which is the retry the run's
    // shape asks for - the escalation is the boss being elevated again rather
    // than a rule invented for the failure.
    if (outcome === "won" && boss) act = Math.min(ACTS, act + 1);
    // Losing to a BOSS ends the run, and losing to a neighbour does not. That
    // is the whole of what makes an act's last fight different to play: an
    // ordinary duel forfeits the land you staked and leaves you the ladder
    // this game has always had - vassalage, and the independence gate out of
    // it - and the fight that closes an act is the one you cannot walk away
    // from. A duel that settled NOTHING is not a loss and does not end
    // anything: the boss is summoned again at the next wrap.
    if (outcome === "lost" && boss) bossLost = true;
    if (outcome !== "won") {
      // The two un-won endings are separate types rather than one line with a
      // reason on it, because they are separate news: the staked land went the
      // other way, or the fight lost an end and settled nothing. Both move no
      // score here, so both carry only the two ends of the fight - a loss
      // already moved its score at the capture that caused it.
      events.push({
        turn: state.turn, playerId: winner?.id ?? p.id,
        type: outcome === "lost" ? "duel-lost" : "duel-void",
        targetFactionId: home, sourceFactionId: enemy,
      });
      return;
    }
    // Derived from the ENEMY, which is the land the offer named. Both inputs
    // are stable across a duel - `siteCaps` is map data and the defensive
    // terrains survive a capture (`strippedOnCapture: false`) - so what the
    // picker promised twenty rounds ago is what this pays.
    // The act as it stood when the duel OPENED, which is `state.act`: the
    // advance one line above has already moved the local `act` for a won boss
    // duel, and paying the next act's rate for this act's fight would break
    // the one thing the offer and the cashing must agree on.
    const reward = rewardFor(
      { siteCaps: state.siteCaps, passives }, enemy, state.act,
    );
    if (reward.kind === "wealth") {
      events.push({
        turn: state.turn, playerId: winner?.id ?? p.id, type: "duel-won",
        targetFactionId: home, sourceFactionId: enemy, wealth: reward.amount,
      });
      wealth = { ...wealth, [home]: (wealth[home] ?? 0) + reward.amount };
      return;
    }
    if (reward.kind === "growth") {
      defenseMax = {
        ...defenseMax,
        [home]: defenseMaxOf({ defense, defenseMax }, home) + reward.amount,
      };
    }
    // What actually moved, never the constant - the rule every heal site
    // keeps. A home already at its ceiling takes nothing, and an event
    // claiming the whole amount would drift the walk for the rest of the run.
    const before = defenseOf({ defense, defenseMax }, home);
    defense = applyHeal({ defense, defenseMax }, home, reward.amount);
    const moved = defenseOf({ defense, defenseMax }, home) - before;
    events.push({
      turn: state.turn, playerId: winner?.id ?? p.id, type: "duel-won",
      targetFactionId: home, sourceFactionId: enemy,
      ...(moved > 0 ? { amount: moved } : {}),
    });
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
    // The cycle turns HERE and nowhere else, so a round is never half scoped:
    // whoever the wrap decides may act is who acts for the whole of the round
    // that is beginning. First in the block, because the sweep below asks
    // `takesNoTurn` - a seat this wrap has just released from a duel scope is
    // a seat that will see a `beginTurn` of its own this round, and its
    // arrows must be left for it rather than landed here.
    //
    // `overlords` and not the snapshot: the escape at the top of this turn
    // and the arrivals below it have already moved the realms, and the offer
    // this reads out is the board as it now stands.
    const wrapped = gauntletAtRoundWrap(
      gauntlet, { ...viewOf(state), overlords, incorporated },
      humanFactionOf(state),
    );
    // The duel settled - announced, and paid where it is owed - at the moment
    // it retires and nowhere else.
    // Asked of the gauntlet as it stood BEFORE the wrap, because the wrap is
    // what throws the duel away: one line later there is no enemy left to name
    // and no `decided` left to read.
    if (gauntlet.kind === "duel" && wrapped.kind !== "duel") {
      settleDuel(gauntlet.enemy, gauntlet.decided ?? "void", gauntlet.boss);
    }
    gauntlet = wrapped;
    // The act's boss is summoned HERE and not inside `gauntletAtRoundWrap`,
    // because the question it asks - has the realm reached this act's share of
    // the bar - is `winSizeFor`'s, about a board src/gauntlet.ts is
    // deliberately not given. It runs after the wrap, so it reads the offer
    // the wrap just produced rather than the one it replaced.
    //
    // Only an ORDINARY offer is replaced. A boss already standing is left
    // alone, and so is a duel, a tick and a rest: summoning is what turns the
    // border offer into the act's last fight, and it happens once per attempt.
    if (gauntlet.kind === "picking" && !gauntlet.boss) {
      const home = humanFactionOf(state);
      const board = { ...state, overlords, incorporated };
      if (
        home !== null &&
        fullRealmOf(home, overlords, incorporated).size >=
          actExitSize(act, winSizeFor(board, home))
      ) {
        // The LAST act is fought beyond the frame, so its enemy has to be
        // called onto the map's edge before anybody can be offered it. Every
        // earlier act closes with a neighbour that was already standing.
        if (act >= ACTS) summonForeignPower();
        const beyond = activeRegion().foreignPower.id;
        const boss = bossFor(
          {
            ...viewOf(state), overlords, incorporated,
            factionIds, adjacency, defenseMax, passives,
            leaders: leadersByFaction(rulers),
          },
          home,
          act >= ACTS ? beyond : null,
        );
        // Null is a real answer: a realm bordering nothing it may fight cannot
        // be handed a boss, so the act does not close yet and the ordinary
        // picker keeps running until the border gives it somebody.
        if (boss !== null) {
          const seat = players.find((pl) => pl.factionId === home);
          // Made ready BEFORE the prophecy is written, so the modal that names
          // it is describing the land as it now stands. A boss elevated after
          // its own announcement would be a promise the board had not kept
          // yet, and the player would read a badge that was about to move.
          const raised = elevateBoss(boss, act);
          passives = raised.passives;
          defense = raised.defense;
          defenseMax = raised.defenseMax;
          rulers = raised.rulers;
          players = raised.players;
          gauntlet = {
            kind: "rest", boss,
            boons: boonsFor(
              seat !== undefined && buildOffer(seat).length > 0,
            ),
          };
          events.push({
            turn: state.turn, playerId: seat?.id ?? p.id, type: "boss-foretold",
            targetFactionId: boss, sourceFactionId: home, amount: act,
          });
        }
      }
    }
    // A duel wears the ground it is fought over. Both of the two lands the
    // fight is ABOUT, and nothing else: this is what makes a duel converge now
    // that there is no clock, and a drain that bled one side would be a timer
    // in the player's colours. It runs on the gauntlet as it stands AFTER the
    // wrap, so a duel that has just retired costs nothing more.
    //
    // Before the wild-lands heal below, so a land that is both wild and under
    // siege nets out the way the log reads it rather than mending the point it
    // has just lost inside one batch.
    // ORDINARY duels only. An act's champion presses on its own - its chief
    // leads its raids and its deck is thick with them - so a boss duel needs
    // no help converging. Wearing the wagered land through one as well was
    // measured and is strictly worse for the player: 22 of 24 seeded runs
    // ended at a boss duel with it on, against 17 with it off. The ground
    // wears where nobody is pressing.
    if (gauntlet.kind === "duel" && !gauntlet.boss) {
      for (const land of [gauntlet.staked, gauntlet.enemy]) {
        const before = defenseOf({ defense, defenseMax }, land);
        if (before <= 0) continue;
        defense = applyDamage(
          { defense, defenseMax }, land, DUEL_ATTRITION,
        );
        const moved = before - defenseOf({ defense, defenseMax }, land);
        if (moved <= 0) continue;
        // The land's OWN seat owns the line, the same turn-start-clock
        // convention the wild-lands heal below keeps: charging both to the
        // human would tag the enemy's loss `.log-mine` and put it through
        // every filter as something the player did.
        const owner = players.find((pl) => pl.factionId === land);
        events.push({
          turn: state.turn, playerId: owner?.id ?? p.id, type: "levied",
          targetFactionId: land, amount: moved,
        });
      }
    }
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
      const v = { defense, defenseMax };
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
        defenseOf({ defense, defenseMax }, polygon) - before;
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
    // Asked of the gauntlet this wrap just settled, never of the snapshot: a
    // duel that ended one line above hands its stilled factions their turns
    // back this round, and a sweep reading the old scope would land the
    // arrows of seats that are about to play them themselves.
    const dormant = state.factionIds.filter(
      // `incorporated` and not the snapshot: a land ABSORBED moments ago is
      // annexed, so it is a seat that will never see a `beginTurn` and its
      // arrows have to be landed here or stand on the map for the rest of the
      // run. The other stores stay on the snapshot, as they always have.
      (land) => takesNoTurn({ ...state, gauntlet, incorporated }, land),
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
        (to) => defenseOf({ defense, defenseMax }, to) > 0,
      );
      if (targets.length === 0) continue;
      const to = targets[Math.floor(rng() * targets.length)];
      // `marchTargetsFrom` above offered it, so the walk exists; asked again
      // here because the number of turns it takes is the same answer, and a
      // second spelling of it is how the arrow and the legality that allowed
      // it start to disagree.
      const hops = marchHopsTo(view, land, to);
      if (hops === null) continue;
      const id = nextMarchId++;
      const damage = attackDamageFor(view, land, "raid", MIN_RAID_SPEND).damage;
      defense = applyDamage({ defense, defenseMax }, land, MIN_RAID_SPEND);
      marches = addMarch(marches, {
        id,
        actor: land, from: land, to, cardId: "raid", damage,
        holdsArmy: true, declared: state.turn, expiry: state.turn + hops,
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
    { overlords, incorporated }, p.factionId,
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
  if (income > 0) {
    wealth = { ...wealth, [p.factionId]: (wealth[p.factionId] ?? 0) + income };
  }
  // A land can change hands here - a claim answering, an army walking into a
  // flattened land, a dormant land's raid - so the run can END here, and this
  // is the one place `beginTurn` may set the phase. Last, after every store
  // above it has settled, because it reads the board rather than the play.
  const phase = endingFor(
    { ...state, players, overlords, incorporated }, p.id, events,
    bossLost,
  ) ?? state.phase;
  return {
    ...state, phase, players, overlords, incorporated, wealth, marches,
    nextMarchId, claims,
    defense, defenseMax, passives, pendingTransfers, rulers, gauntlet, act,
    factionIds, foreign, adjacency, siteCaps, ethnicities,
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

/** Lands every march of this seat's whose arrival turn has come, and every
 *  counter standing against one of them.
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
 *  The pull-in is the OPPOSING end and never this end's own stragglers. An
 *  arrow of the actor's still walking toward the same land is not part of the
 *  clash it has not reached; it waits for the turn its own expiry names.
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

  // THE one place a march in flight is judged, and it runs on the turn the
  // march LANDS. A march whose ground moved under it while it was in flight is
  // dropped: the army has no land left to have marched out of, the land it was
  // aimed at is no longer something its actor may attack, or the actor has
  // knelt to whoever it was aimed at since. All three are the ordinary
  // consequence of somebody else's turn, so they are reported - an arrow that
  // vanishes with nothing said is the map lying about the board.
  //
  // Declared and landed, never in between. Two capture sites used to call the
  // same rule off the moment a pyramid changed shape, which was indisting-
  // uishable from this while every flight lasted one turn. An army now takes a
  // turn per land it crosses and allegiance moves under it several times on
  // the way, so a mid-flight test cancels arrows the player is still watching
  // fly - and cancels them on relations that may well have changed back before
  // the army would have arrived. What the board promises is that the arrow is
  // there until it lands; what it may not promise is that landing is legal.
  //
  // The source test is two questions, not one. A polygon stays in its own
  // `fullRealmOf` even after it is annexed - the id is the land's, and the
  // land is still there - so the second question is who HOLDS it now. An
  // annexed land answers to its annexer, and an army cannot march out of a
  // land its owner has lost.
  //
  // The third is the hostile keyword catching up with an arrow drawn before
  // the pyramid changed shape. A land that became your sibling while your
  // arrow was in the air is as much your own bloc as one that became your
  // lord, and the arrow lapses for it rather than landing.
  const alive: typeof lapsed = [];
  for (const entry of lapsed) {
    const realm = fullRealmOf(entry.march.actor, state.overlords, state.incorporated);
    const reach = attackReach(view, entry.march.actor);
    const holder = state.incorporated[entry.march.from] ?? entry.march.from;
    if (
      realm.has(entry.march.from) && realm.has(holder) &&
      reach.has(entry.march.to) &&
      !aimsWithinOwnRealm(view, entry.march.actor, entry.march.cardId, entry.march.to)
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

  // Only the axes the landing marches run along, and on each one only the
  // arrows that are actually in the fight: everything arriving out of the
  // landing end, plus the OPPOSING end whole.
  //
  // The opposing end whole is the counter rule - a counter still in flight is
  // spent answering the attack it was declared against rather than surviving
  // to strike an undefended land next turn, which is what makes a counter-raid
  // an answer rather than a trade. It is a rule about the two ENDS meeting,
  // and it says nothing about a second arrow of the actor's own.
  //
  // That distinction did not exist while every flight was one turn: nothing
  // un-lapsed could sit on a landing axis except the counter. With a turn per
  // land crossed, a source with two armies raiding one land on consecutive
  // turns puts two of its own arrows on one axis with different arrival turns,
  // and taking the axis whole landed tomorrow's blow today.
  const arriving = new Set(alive.map((e) => e.key));
  /** Axis key -> the source polygons whose arrows are landing on it. Every
   *  entry of `alive` shares one actor, and no faction may aim at its own
   *  home, so in practice this is one end - but it is read per end rather
   *  than assumed, so a future two-ended case filters both. */
  const landingFroms = new Map<string, Set<string>>();
  for (const e of alive) {
    const key = axisKeyOf(e.march.from, e.march.to);
    const set = landingFroms.get(key) ?? new Set<string>();
    set.add(e.march.from);
    landingFroms.set(key, set);
  }
  for (const axis of axesOf(marches)) {
    const landing = landingFroms.get(axisKeyOf(axis.a, axis.b));
    if (landing === undefined) continue;
    // The store is keyed by the march's own id, so this is its key.
    const inFight = (from: string, side: March[]): March[] =>
      landing.has(from)
        ? side.filter((m) => arriving.has(String(m.id)))
        : side;
    const fromA = inFight(axis.a, axis.fromA);
    const fromB = inFight(axis.b, axis.fromB);
    marches = clearMarches(
      marches, [...fromA, ...fromB].map((m) => String(m.id)),
    );
    // One pairing at a time, against the defense as the pairing before it left
    // it. That ordering is what lets two armies down one axis break a land and
    // then walk into it, the same way two armies down two axes already could.
    for (const eng of resolveAxis(axis.a, axis.b, fromA, fromB)) {
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

/** The player answers the pick: a duel opens against `enemyId`, with `stakeId`
 *  of their own lands put up against it.
 *
 *  Two answers and one call, because they are one decision - which fight, and
 *  what it is worth risking - and a run that could open a duel with the stake
 *  still owed would be a duel whose losing condition does not exist yet.
 *
 *  Shaped like `keepPlaying` and `transferDefense`: an identity return is what
 *  `commitDecision` reads as refused, so a pick naming a land the offer does
 *  not hold - a stale modal, a wire message, a hand-edited record - changes
 *  nothing rather than scoping the turn loop to a faction nobody may fight.
 *  The offer is the authority and not `attackReach`, because the offer is what
 *  the player was shown; it is re-read at every round wrap, so it is never
 *  more than a round behind the board.
 *
 *  The STAKE is checked against `duelStakes` for the same reason, and it is
 *  read fresh rather than carried on the offer: the candidates were computed
 *  at a wrap and a stake is about the player's own realm, which their own turn
 *  may have changed since.
 *
 *  **Every duel is staked, including the first one of a run.** It was optional
 *  on a one-land realm first, and that was wrong twice over: losing your home
 *  is vassalage rather than defeat, so the bet was never the run; and a duel
 *  with nothing staked can only be WON, which left the opening duel of every
 *  run with one ending. Measured on a real 44-turn run, that duel was still
 *  going at the end and no duel had ever settled.
 *
 *  It moves the gauntlet and nothing else. The duel takes effect from the next
 *  seat onward - the turn it was answered in is the player's own, and taking
 *  it off them would be answering a question by skipping the asker. */
export function pickDuel(
  state: GameState, enemyId: string, stakeId: string,
): GameState {
  if (state.phase !== "playing") return state;
  if (state.gauntlet.kind !== "picking") return state;
  if (!state.gauntlet.candidates.includes(enemyId)) return state;
  const home = humanFactionOf(state);
  if (home === null) return state;
  if (!duelStakes(viewOf(state), home, enemyId).includes(stakeId)) return state;
  // **Nothing is healed here, and that was measured rather than assumed.**
  // Making the wagered land ready as the duel opened - the mirror of
  // `elevateBoss` healing a champion when it is summoned - moved the win rate
  // not at all over 24 seeded runs, and it quietly overrode `defense=`: a boot
  // param that put a land at 1 found it back at its ceiling a line later,
  // because `duel=` is applied after it. A rule that buys nothing and breaks
  // the one surface a browser check is built on is a rule not worth having.
  return {
    ...state,
    gauntlet: {
      kind: "duel", enemy: enemyId, staked: stakeId, decided: null,
      // The offer says which fight this is. A boss offer holds exactly the
      // boss, so answering one opens the fight that closes the act.
      boss: state.gauntlet.boss,
    },
  };
}

/** The player answers the rest: one boon taken, and the act's boss offered.
 *
 *  The whole of the breath before a boss. It pays the boon, logs it, and turns
 *  the rest into a FROZEN one-candidate offer - so the fight the prophecy named
 *  is the fight the picker puts up, and the border moving in between cannot
 *  swap it.
 *
 *  Shaped like `pickDuel`: an identity return is what `commitDecision` reads as
 *  refused, so a boon the offer does not hold changes nothing.
 *
 *  It draws rng only on the card arm, and only to shuffle - the same one draw
 *  the harvest's own grant makes, in the same place, so a seeded run's stream
 *  depends on what was chosen rather than on what was offered. */
export function pickBoon(
  state: GameState, boon: Boon, rng: Rng,
): GameState {
  if (state.phase !== "playing") return state;
  if (state.gauntlet.kind !== "rest") return state;
  if (!state.gauntlet.boons.includes(boon)) return state;
  const home = humanFactionOf(state);
  if (home === null) return state;
  const seat = state.players.find((pl) => pl.factionId === home);
  const realm = fullRealmOf(home, state.overlords, state.incorporated);

  let defense = state.defense;
  let defenseMax = state.defenseMax;
  let players = state.players;
  const events: GameEvent[] = [];
  let granted: string | undefined;

  if (boon === "growth") {
    defenseMax = {
      ...defenseMax,
      [home]: defenseMaxOf({ defense, defenseMax }, home) + BOON_GROWTH_AMOUNT,
    };
  }
  // Mending walks the whole realm; growing touches the home land alone. Both
  // end in the same heal and the same line, because what the player is owed is
  // the number that MOVED - a land already at its ceiling takes nothing, and
  // an event claiming the whole amount would drift the walk that feeds the log
  // and the round summary for the rest of the run.
  const mended = boon === "mend" ? [...realm] : boon === "growth" ? [home] : [];
  for (const land of state.factionIds.filter((f) => mended.includes(f))) {
    const before = defenseOf({ defense, defenseMax }, land);
    defense = applyHeal(
      { defense, defenseMax },
      land,
      defenseMaxOf({ defense, defenseMax }, land),
    );
    const moved = defenseOf({ defense, defenseMax }, land) - before;
    if (moved <= 0) continue;
    events.push({
      turn: state.turn, playerId: seat?.id ?? 1, type: "healed",
      targetFactionId: land, amount: moved,
    });
  }
  if (boon === "card" && seat !== undefined) {
    // `buildOffer` and not a pool of this module's own: the rest hands out a
    // card from the player's own build, which is the harvest's question and
    // has one answer. First in build order, deterministically, so a seeded
    // replay grants the same card.
    const [cardId] = buildOffer(seat);
    if (cardId === undefined) return state;
    granted = cardId;
    players = updateFaction(players, home, (pl) => ({
      ...pl, deck: shuffle([...pl.deck, cardId], rng),
    }));
  }
  events.unshift({
    turn: state.turn, playerId: seat?.id ?? 1, type: "boon-taken",
    targetFactionId: home,
    ...(granted === undefined ? {} : { cardId: granted }),
  });
  return {
    ...state,
    defense,
    defenseMax,
    players,
    gauntlet: {
      kind: "picking", candidates: [state.gauntlet.boss], boss: true,
    },
    log: appendEvents(state, events),
  };
}

/** The player declines the whole offer. The border is not a to-do list, so
 *  passing is a real answer - and it costs the world tick that a finished duel
 *  costs, which is the price of a round spent not fighting anybody.
 *
 *  The same identity-return refusal as `pickDuel`, for the same reason. */
export function declineDuel(state: GameState): GameState {
  if (state.phase !== "playing") return state;
  if (state.gauntlet.kind !== "picking") return state;
  // A boss offer has no way past it. The act does not close until the fight
  // that closes it is fought, so a decline here would be a decline of the act
  // - and the offer would come straight back, which is a modal that reads as
  // broken rather than as a rule. The screen says so rather than showing a
  // button that does nothing.
  if (state.gauntlet.boss) return state;
  // `turn + 2`, and the 2 is the whole of the fix. A decline is answered
  // MID-ROUND, on the player's own turn, which is the turn just after the
  // wrap - so a tick ending at `turn + 1` is ended by the very next wrap and
  // buys nothing: the same four tiles came back on the player's next turn,
  // eleven turns running, and the world round a decline is supposed to cost
  // was never spent. At `turn + 2` the round that follows this one runs
  // unscoped in full and the offer returns at the wrap after it, which is the
  // same one round a retiring duel spends.
  return { ...state, gauntlet: { kind: "world-tick", until: state.turn + 2 } };
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

/** Whether this faction wins its independence the moment its own turn starts.
 *
 *  ONE spelling, because two readers must agree about it. `beginTurn` APPLIES
 *  the escape as the very first thing a turn does; `takesNoTurn` is asked one
 *  line earlier, by `advance`, and has to judge the duel scope against the
 *  realm the seat will be in once the escape has run. */
export function escapesVassalage(
  state: GameState, factionId: string,
): boolean {
  return state.overlords.has(factionId) &&
    independenceGateOpen(viewOf(state), factionId);
}

/** `state.overlords` with this faction's pending escape already applied, for
 *  the duel scope alone.
 *
 *  The escape moves a faction OUT of whichever realm was holding it, so a
 *  vassal about to win its freedom is about to leave the fight. Asked of the
 *  realm it is leaving, `advance` let it play a turn the scope forbids and
 *  then corrected itself at the next wrap - the two-readers-disagree shape,
 *  122 times over eight seeded 80-turn runs.
 *
 *  The consequence, stated rather than discovered: a vassal that has healed
 *  back to its gate does not escape WHILE a duel runs, because a seat that
 *  never sees a `beginTurn` never reaches the line that frees it. It escapes
 *  at its first turn after the duel retires. A realm does not come apart
 *  mid-fight, and the alternative - freeing it at the round wrap, the way a
 *  dormant seat's arrows are landed there - would also start freeing seeded
 *  leaderless vassals that have never escaped in this game's history.
 *
 *  Nothing outside a duel pays for this: the gate is a `viewOf` build and
 *  this is asked once per seat in `advance`'s loop, so the cheap questions
 *  come first. */
function overlordsAfterEscape(state: GameState, factionId: string): Overlords {
  if (state.gauntlet.kind !== "duel") return state.overlords;
  if (!escapesVassalage(state, factionId)) return state.overlords;
  const out = new Map(state.overlords);
  out.delete(factionId);
  return out;
}

/** Whether this faction will never see a `beginTurn` of its own. Four
 *  reasons, and they must be asked together, IN THIS ORDER:
 *
 *  An annexed people no longer has a seat to sit in, and that holds whoever
 *  was playing them - a person whose realm has been swallowed is out of the
 *  run, and exempting them here would leave everybody else waiting on a turn
 *  that can never be taken.
 *
 *  Otherwise a PERSON always gets their turn, whichever seat they sit in and
 *  whatever the run's shape says, because a player skipped forever is not a
 *  rule, it is a hung game. It is stated before the two board reasons below
 *  rather than folded into the leaderless one, which is where it used to sit:
 *  a duel scopes the map to two realms, and a second person playing a seat on
 *  neither side would otherwise be frozen out for twenty rounds by a fight
 *  they are not in. A leaderless person still takes no LAND; that gate is
 *  `hasRuler` at the capture sites and is untouched.
 *
 *  Then the duel scope, which answers in BOTH directions and is therefore two
 *  of the four. It is asked HERE, third: after the annexed arm, because an
 *  annexed seat is out of the run whatever the gauntlet says; after the human
 *  arm, for the reason just above; and BEFORE the leaderless arm, because a
 *  duel has to be able to still a faction that has a perfectly good chief -
 *  stilling the leaderless is what the last arm already does, and a scope
 *  asked after it would be a scope that never applied to anybody.
 *
 *  While a duel runs, a faction on NEITHER side takes no turn. And a faction
 *  on the ENEMY's side takes one whether or not anybody leads it: this is the
 *  only place in the game the leaderless arm below is bypassed. Outside a
 *  duel a land with no chief still takes no turn and the grey middle is still
 *  the grey middle. It is here because the offer cannot always find a
 *  neighbour with a chief - a realm hemmed in by quiet lands is a shape the
 *  map can still produce, rare as `QUIET_LANDS` now makes it - and an enemy
 *  that never answers is twenty rounds of the map standing still, with
 *  `duel-lost` unreachable. A leaderless enemy still takes no LAND; that gate is
 *  `hasRuler` at the capture sites and is untouched, which is why beating one
 *  ABSORBS it rather than swearing it (`absorbsDuelEnemy`).
 *
 *  Last, nobody leads it - and a land nobody has taken is the only kind that
 *  stays that way, because `takeLand` seats a chief on the land it takes and
 *  a woken vassal comes to the table.
 *
 *  ONE spelling, because two readers depend on the answer matching. `advance`
 *  passes over such a seat, and `beginTurn`'s round wrap lands the arrows it
 *  left behind; a sweep that covered less than the skip did left a march
 *  standing on the map for the rest of the run, holding an army out of a land
 *  somebody else now holds. The human arm belongs here for exactly that
 *  reason: spelled in `advance` alone, it exempted the first seat from the
 *  skip while the sweep still resolved a second person's marches at somebody
 *  else's turn start. The duel arm inherits that for free - a faction stilled
 *  by the scope has its arrows landed by the same sweep, so a duel does not
 *  freeze a third party's army in the air for twenty rounds.
 *
 *  The duel's own side is `humanFactionOf`, seat 0 - the run has one shape
 *  and two people cannot be in different duels, the same reason `playingOn`
 *  and `winSizeFor` read that seat. Who is ASKED and who is never skipped is
 *  still `isHumanFaction`, plural, one line above. */
export function takesNoTurn(state: GameState, factionId: string): boolean {
  if (factionId in state.incorporated) return true;
  if (isHumanFaction(state, factionId)) return false;
  const standing = duelStanding(
    state.gauntlet, humanFactionOf(state), factionId,
    overlordsAfterEscape(state, factionId), state.incorporated,
  );
  if (standing === "outside") return true;
  if (standing === "theirs") return false;
  return !hasRuler(state.rulers, factionId);
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
    "humanSeats" | "turn" | "playingOn" | "foreign"
  >,
  playerId: number,
  events: GameEvent[],
  /** An act's boss took the land staked against it. Passed in rather than read
   *  off the board, because it is a fact about a fight that has just RETIRED -
   *  one line later the gauntlet has moved on and the board shows only a land
   *  that changed hands, which is not the same thing. */
  bossLost = false,
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
  // Losing to an act's boss. Above the victory arm, the same order the
  // incorporation arm keeps: defeat before victory, and the two cannot
  // coincide.
  if (bossLost && humanFaction !== null) {
    events.push({
      turn: board.turn, playerId, type: "defeat",
      targetFactionId: humanFaction,
    });
    return "defeat";
  }
  const realm =
    humanFaction === null
      ? new Set<string>()
      : fullRealmOf(humanFaction, overlords, incorporated);
  // **The run is won by taking ground beyond the map, not by counting lands
  // on it.** Half the map used to end the run; it SUMMONS the last act's boss
  // now, and the only victory is the expedition that beats it - which is why
  // `winSizeFor` is read as an act boundary above rather than as an ending
  // here.
  //
  // The second arm is the safety valve and not a second win condition: a run
  // where nothing was ever summoned - a border that offered no boss, a boot
  // param that handed the player the map - would otherwise have no way to end
  // at all. A player holding every land on the map with nothing beyond it has
  // won by any reading.
  // Lands ON THE MAP, so a power taken from beyond the frame does not count
  // toward a bar measured in map lands - it would be one free land against a
  // number the player reads off the scoreboard.
  const homeHeld = [...realm].filter((f) => !board.foreign.includes(f)).length;
  const wonTheExpedition =
    board.foreign.length > 0 && board.foreign.every((f) => realm.has(f));
  const nothingLeftOnTheMap =
    board.foreign.length === 0 && homeHeld >= homeRoster(board);
  // A run played ON past its ending is the one case still measured in lands,
  // and through `winSizeFor` rather than a second reading of the roster - the
  // one-bar rule: the number the scoreboard shows and the number this applies
  // are the same call. The offer was taken, so the expedition is already won
  // and would otherwise re-fire the instant the board was handed back.
  const won = board.playingOn
    ? humanFaction !== null && homeHeld >= winSizeFor(board, humanFaction)
    : wonTheExpedition || nothingLeftOnTheMap;
  if (
    humanFaction !== null &&
    // Only a free faction wins: a vassal's realm is a strict subset of its
    // root's, so victory belongs to roots.
    !overlords.has(humanFaction) &&
    won
  ) {
    events.push({
      turn: board.turn, playerId, type: "victory",
      ...(board.playingOn ? { playOn: true } : {}),
    });
    return "victory";
  }
  // A power from beyond the frame is not racing anybody for the map and holds
  // no ground on it, so it is skipped: left in, it would "unify" the instant
  // it took enough lands to clear a bar it was never on.
  const unifier = board.factionIds.find(
    (f) =>
      f !== humanFaction &&
      !board.foreign.includes(f) &&
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
  // A play can take a land - the other of the two allegiance doors - and a
  // land moving between the duel's two realms decides the duel. The cycle
  // itself does not turn here: that is the round wrap in `beginTurn`.
  let gauntlet = state.gauntlet;

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
   *  damage on it is a promise about the turn it lands, not a score that
   *  moved; `march-resolved` is where the numbers go. Expiry is the
   *  src/timed.ts convention, a turn out per land the army crosses, which is
   *  one of this seat's own `beginTurn`s whichever seat it is. */
  const declareMarch = (
    from: string, to: string, spend: number, holdsArmy = true,
  ): void => {
    // How far the army has to walk, and whether it may. Refused before
    // anything is spent, which is the shape the play already had for a source
    // with no free army: `marchSourcesAgainst` turned the whole play down at
    // the top of `playCard`, so a pair out of range never reaches here and
    // this is the same answer read a second time rather than a second rule.
    const hops = marchHopsTo(view, from, to);
    if (hops === null) return;
    // The spend comes off the source THE MOMENT the arrow appears, not when it
    // lands. That is the whole shape of the card: what it cost is on the map
    // for a rival to read for as long as the arrow is in flight, and the
    // number printed on the arrow is a promise precisely because it was
    // already paid. A long march is therefore a long time spent soft.
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
      declared: state.turn, expiry: state.turn + hops,
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
    // Before the move, for the reason the same call gives at `takeLand`: one
    // line later `overlords` no longer knows which side the land was on.
    gauntlet = duelDecidedBy(
      gauntlet, humanFactionOf(state), target, p.factionId,
      overlords, incorporated,
    );
    // The target's own vassals come along: taking a lord takes its pyramid.
    overlords.set(target, p.factionId);
    // A land that has changed hands is no longer a land nobody holds, so the
    // statuses that said so go. What describes the ground - and the fact that
    // this land has no ambitions of its own - stays. Live at today's one
    // caller: `no-successor` is `strippedOnCapture`, so this line does
    // something every time landSubjugation runs.
    passives = stripOnCapture(passives, target);
    // The same rule as an army arriving: a land that has changed hands has a
    // chief. Spelled at both doors rather than inside `stripOnCapture`,
    // because stripping a status and seating a leader are two facts and one
    // of them is about to be a whole seat's behaviour - and the DOOR owns the
    // invariant rather than whichever caller happens to run first.
    //
    // Inert at today's one caller: the no-successor assassination branch
    // runs `replaceRuler` on this same target immediately above, which
    // always seats a successor, so the chair is already occupied by the time
    // this runs and `seatRuler` returns `rulers` unchanged. It stays anyway -
    // a comment saying this door need not seat would be true only as long as
    // `replaceRuler` keeps running first, and this codebase does not let a
    // rule live in caller ordering.
    rulers = seatRuler(
      rulers, state.ethnicities, target, state.turn,
      seatingAbilities(players, target),
    );
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
    // A land just taken keeps whatever it has in the air, including the arrows
    // now aimed at its own new bloc. They are judged when they LAND - see the
    // note on `resolveMarches` - and the ones that are still illegal then lapse
    // there, with the same line, out of the one place that decides it.
  };

  /** No `duelDecidedBy` here, and it is not an oversight: Incorporate aims at
   *  the actor's OWN vassal (`vassalCard` in src/playability.ts), so the land
   *  is already inside the actor's realm and is on the same side of a duel
   *  before and after. A card that could digest somebody else's land would be
   *  a third allegiance door and would owe the call. */
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
    // promises and what eventually lands cannot drift.
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
    // Hostile, and a Plague has no aim of its own - it lands wherever the
    // actor's stacks already sit, which may include a land that was a rival
    // when the stack was laid and is a lord or a sibling now. `plagueTargetsOf`
    // is the one list of where that stays true; legality and the hover preview
    // read the same list, so a card the player was told was playable, and told
    // would deal a given total, cannot land anywhere else or for any less.
    const targets = plagueTargetsOf(view, p.factionId);
    for (const polygon of targets) {
      const stacks = disease[polygon]?.[p.factionId] ?? 0;
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
    // Only what the damage loop just walked is spent; a stack the plague
    // could not strike keeps standing, or the card would cost the actor its
    // disease for nothing.
    const struck = new Set(targets);
    disease = clearDiseaseOf(disease, p.factionId, (polygon) => !struck.has(polygon));
  } else if (cardId === "foul-winds") {
    // One event per polygon whose ownership moved: the stacks the actor
    // GAINED there (the total held by others before the shift), plus the
    // per-loser breakdown the walk needs to zero each of THEIR counts too.
    // `foulWindsTargetsOf` is the same filtered list as the Plague loop above,
    // for the same reason - claiming the stacks standing on a peer's land is
    // how the NEXT plague would strike it, so a hostile card stops at the
    // realm here too, and legality already refused a play with nothing in it.
    const targets = foulWindsTargetsOf(view, p.factionId);
    for (const polygon of targets) {
      const owners = disease[polygon] ?? {};
      const losses = Object.fromEntries(
        Object.entries(owners).filter(([owner]) => owner !== p.factionId),
      );
      const gained = Object.values(losses).reduce((sum, n) => sum + n, 0);
      events.push({
        turn: state.turn, playerId: p.id, type: "winds-shifted", cardId,
        targetFactionId: polygon, amount: gained, losses,
      });
    }
    // Only what the event loop just walked changes hands.
    const claimed = new Set(targets);
    disease = transferAllDiseaseTo(
      disease, p.factionId, (polygon) => !claimed.has(polygon),
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
    gauntlet,
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
