import rawData from "./data/map.json";
import type { MapData } from "./types";
import { factionAdjacencyOf } from "./adjacency";
import {
  buildAiDeck, buildDeck, CARDS, DECK_SIZE, DEFAULT_DECK, type Rng,
} from "./cards";
import {
  advance, chooseDeck, discardCard, newGame, pickFaction, playCard, startGame,
  viewOf, type GameState, type TributeTrack,
} from "./game";
import { playableSet, validTargetsFor } from "./playability";
import { aiTakeTurn, chooseAction } from "./ai";
import { realmOf } from "./relations";

const data = rawData as MapData;

/** The map every simulated game is played on: the shipped 26 lands. */
export const SIM_FACTION_IDS: string[] = data.factions.map((f) => f.id);
export const SIM_ADJACENCY: Record<string, string[]> = factionAdjacencyOf(data);
export const SIM_ETHNICITIES: Record<string, string> = Object.fromEntries(
  data.factions.map((f) => [f.id, f.ethnicity]),
);

/** A deck of nothing but Grow potatoes - the new player's opening mistake. */
export function potatoDeck(): string[] {
  return Array.from({ length: DECK_SIZE }, () => "grow-crops");
}

/** Linear congruential rng; same generator the tests use, so a seed here
 *  means the same stream everywhere. */
export function seededRng(seed: number): Rng {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

export type AiDeckFor = (rng: Rng, factionId: string) => string[];

/** Enemy deck variants. `shipped` is what the game builds today; the other two
 *  exist to attribute a difference to the guaranteed cards rather than to deck
 *  density, and to keep the pre-2026-07-29 world measurable. */
export const DECK_ARMS: Record<string, AiDeckFor> = {
  shipped: (rng) => buildAiDeck(rng),
  unarmed: (rng) => buildAiDeck(rng, []),
  defensive: (rng) => buildAiDeck(rng, ["alliance", "bodyguard"]),
};

/** The new player: no plan, just plays whatever the rules allow, first come.
 *  With a potato deck that is Grow potatoes, or forced Pay tribute as a
 *  vassal. Returns the state after their single action. */
export function naiveHumanTurn(state: GameState, rng: Rng): GameState {
  const p = state.players[state.current];
  const set = playableSet(viewOf(state), p.factionId, p.hand);
  if (set.mode === "discard") return discardCard(state, set.cardIndexes[0]);
  const i = set.cardIndexes[0];
  const cardId = p.hand[i];
  const targetId = CARDS[cardId]?.targeted
    ? validTargetsFor(viewOf(state), p.factionId, cardId)[0]
    : undefined;
  const track: TributeTrack | undefined =
    cardId === "pay-tribute" ? (rng() < 0.5 ? "might" : "status") : undefined;
  return playCard(state, i, rng, targetId, track);
}

/** How the human seat plays. `naive` is the new player; `competent` runs the
 *  same policy the enemies use, standing in for a player who knows the rules. */
export type HumanTurn = (state: GameState, rng: Rng) => GameState;

export const HUMAN_POLICIES: Record<string, HumanTurn> = {
  naive: naiveHumanTurn,
  competent: aiTakeTurn,
};

/** Human deck variants. `potatoes` is the new player's opening mistake;
 *  `full` is the default build offered by the deck screen. */
export const HUMAN_DECKS: Record<string, () => string[]> = {
  potatoes: potatoDeck,
  full: buildDeck,
};

export type Outcome = "defeat" | "victory" | "cap";

export interface GameSummary {
  seed: number;
  humanFaction: string;
  outcome: Outcome;
  /** Turn the human first became someone's vassal; null if it never happened. */
  firstSubjugatedTurn: number | null;
  /** Faction that first took the human as a vassal. */
  firstOverlord: string | null;
  /** How often the human was taken as a vassal, counting poaches. */
  subjugatedCount: number;
  /** How often the human was freed by their overlord being subjugated. */
  releasedCount: number;
  /** Turn the human was incorporated (game over); null if they survived. */
  defeatTurn: number | null;
  conqueror: string | null;
  /** Turns the game actually ran, capped by turnCap. */
  turns: number;
}

export function summarize(
  state: GameState,
  seed: number,
  humanFaction: string,
): GameSummary {
  const mine = state.log.filter((e) => e.targetFactionId === humanFaction);
  const subjugations = mine.filter((e) => e.type === "subjugated");
  const releases = mine.filter((e) => e.type === "released");
  // A rival unifying the map logs "unified", not "defeat", because its target
  // is the map rather than the human's faction - but it still sets phase to
  // "defeat", and from the human's seat losing the map to someone else is a
  // loss just the same. Count either event so defeatTurn/conqueror line up
  // with outcome instead of silently going null while outcome says "defeat".
  const defeat = state.log.find(
    (e) => e.type === "defeat" || e.type === "unified",
  );
  const outcome: Outcome =
    state.phase === "defeat" ? "defeat"
      : state.phase === "victory" ? "victory"
        : "cap";
  return {
    seed,
    humanFaction,
    outcome,
    firstSubjugatedTurn: subjugations[0]?.turn ?? null,
    firstOverlord: subjugations[0]?.overlordFactionId ?? null,
    subjugatedCount: subjugations.length,
    releasedCount: releases.length,
    defeatTurn: defeat?.turn ?? null,
    conqueror: defeat?.overlordFactionId ?? null,
    turns: state.turn,
  };
}

export interface RunOptions {
  seed: number;
  humanFaction: string;
  aiDeckFor?: AiDeckFor;
  turnCap: number;
  humanDeck?: string[];
  humanTurn?: HumanTurn;
}

/** Plays one complete headless game. Throws rather than spinning if a turn
 *  fails to resolve - a stuck turn is a bug, not a data point. */
export function runGame(opts: RunOptions): GameSummary {
  const { seed, humanFaction, turnCap } = opts;
  const rng = seededRng(seed);
  let state = pickFaction(
    chooseDeck(
      startGame(newGame(SIM_FACTION_IDS, SIM_ADJACENCY, SIM_ETHNICITIES)),
      opts.humanDeck ?? potatoDeck(),
    ),
    humanFaction,
    rng,
    opts.aiDeckFor ?? DECK_ARMS.shipped,
  );
  const humanTurn = opts.humanTurn ?? naiveHumanTurn;
  while (state.phase === "playing" && state.turn <= turnCap) {
    const actor = state.players[state.current].factionId;
    const next =
      state.current === 0 ? humanTurn(state, rng) : aiTakeTurn(state, rng);
    if (!next.playedThisTurn) {
      throw new Error(
        `stuck turn: seed ${seed}, turn ${state.turn}, actor ${actor}, ` +
          `hand [${state.players[state.current].hand.join(", ")}]`,
      );
    }
    state = next.phase === "playing" ? advance(next, rng) : next;
  }
  return summarize(state, seed, humanFaction);
}

export interface BatchOptions {
  games: number;
  turnCap: number;
  firstSeed: number;
  arm: string;
}

/** Runs `games` games for one arm. Game i always uses seed firstSeed+i and
 *  faction i mod 26, so arms line up game for game. */
export function runBatch(opts: BatchOptions): GameSummary[] {
  const aiDeckFor = DECK_ARMS[opts.arm];
  if (aiDeckFor === undefined) {
    throw new Error(
      `unknown arm "${opts.arm}"; known: ${Object.keys(DECK_ARMS).join(", ")}`,
    );
  }
  return Array.from({ length: opts.games }, (_, i) =>
    runGame({
      seed: opts.firstSeed + i,
      humanFaction: SIM_FACTION_IDS[i % SIM_FACTION_IDS.length],
      aiDeckFor,
      turnCap: opts.turnCap,
    }),
  );
}

// -- aggregation ------------------------------------------------------------

export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 1 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

export function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

export interface ArmStats {
  arm: string;
  games: number;
  subjugatedShare: number;
  neverSubjugated: number;
  medianFirstSubjugation: number | null;
  meanFirstSubjugation: number | null;
  defeatShare: number;
  medianDefeatTurn: number | null;
  meanSubjugations: number | null;
  meanReleases: number | null;
  capShare: number;
  victoryShare: number;
}

export function aggregate(arm: string, games: GameSummary[]): ArmStats {
  const subjugated = games
    .map((g) => g.firstSubjugatedTurn)
    .filter((t): t is number => t !== null);
  const defeats = games
    .map((g) => g.defeatTurn)
    .filter((t): t is number => t !== null);
  const share = (n: number): number => (games.length === 0 ? 0 : n / games.length);
  return {
    arm,
    games: games.length,
    subjugatedShare: share(subjugated.length),
    neverSubjugated: games.length - subjugated.length,
    medianFirstSubjugation: median(subjugated),
    meanFirstSubjugation: mean(subjugated),
    defeatShare: share(defeats.length),
    medianDefeatTurn: median(defeats),
    meanSubjugations: mean(games.map((g) => g.subjugatedCount)),
    meanReleases: mean(games.map((g) => g.releasedCount)),
    capShare: share(games.filter((g) => g.outcome === "cap").length),
    victoryShare: share(games.filter((g) => g.outcome === "victory").length),
  };
}

/** Mean per-seed difference in first-subjugation turn against a reference arm,
 *  over the games where both arms subjugated the human. Negative means this
 *  arm gets there sooner. `bothSubjugated` says how many games it covers, and
 *  the flip counts say how often one arm subjugated where the other never did. */
export interface PairedDelta {
  meanTurnDelta: number | null;
  bothSubjugated: number;
  onlyThisArm: number;
  onlyReference: number;
}

export function pairedDelta(
  armGames: GameSummary[],
  reference: GameSummary[],
): PairedDelta {
  const byKey = new Map(reference.map((g) => [`${g.seed}:${g.humanFaction}`, g]));
  const deltas: number[] = [];
  let onlyThisArm = 0;
  let onlyReference = 0;
  for (const g of armGames) {
    const ref = byKey.get(`${g.seed}:${g.humanFaction}`);
    if (ref === undefined) continue;
    if (g.firstSubjugatedTurn !== null && ref.firstSubjugatedTurn !== null) {
      deltas.push(g.firstSubjugatedTurn - ref.firstSubjugatedTurn);
    } else if (g.firstSubjugatedTurn !== null) {
      onlyThisArm += 1;
    } else if (ref.firstSubjugatedTurn !== null) {
      onlyReference += 1;
    }
  }
  return {
    meanTurnDelta: mean(deltas),
    bothSubjugated: deltas.length,
    onlyThisArm,
    onlyReference,
  };
}

export interface FactionStat {
  factionId: string;
  games: number;
  subjugatedShare: number;
  medianFirstSubjugation: number | null;
}

/** Per-starting-land breakdown, sorted fastest-to-fall first. Lands never
 *  subjugated sort last. */
export function byFaction(games: GameSummary[]): FactionStat[] {
  const groups = new Map<string, GameSummary[]>();
  for (const g of games) {
    const list = groups.get(g.humanFaction) ?? [];
    list.push(g);
    groups.set(g.humanFaction, list);
  }
  return [...groups]
    .map(([factionId, list]) => {
      const turns = list
        .map((g) => g.firstSubjugatedTurn)
        .filter((t): t is number => t !== null);
      return {
        factionId,
        games: list.length,
        subjugatedShare: turns.length / list.length,
        medianFirstSubjugation: median(turns),
      };
    })
    .sort(
      (a, b) =>
        (a.medianFirstSubjugation ?? Infinity) -
        (b.medianFirstSubjugation ?? Infinity),
    );
}

// -- world runs -------------------------------------------------------------

export interface WorldOptions {
  seed: number;
  /** The deck every one of the 26 seats plays. Must hold exactly DECK_SIZE. */
  deck: string[];
  turnCap: number;
}

export interface WorldSummary {
  seed: number;
  outcome: "unified" | "cap";
  endTurn: number;
  winner: string | null;
  subjugations: number;
  incorporations: number;
  /** The biggest realm any faction reached at any point. */
  largestRealm: number;
  /** Turns between the last incorporation and the end of the run. */
  turnsSinceLastIncorporation: number;
  /** Play counts per card id. Shows a card ignored, or played as filler. */
  playsByCard: Record<string, number>;
  /** Targeted plays made while 2 or more targets were legal, and how many of
   *  those took the first in faction order. A share near 1 is the arbitrary
   *  targeting defect: it was 1.00 for Alliance and Assassinate ruler by
   *  construction before either had a policy branch. */
  targetedPlays: number;
  firstLegalTargetPlays: number;
  /** Assassinate ruler spent into a Bodyguard. */
  preventedAssassinations: number;
  /** Guards posted that no assassination ever tested. */
  untestedGuards: number;
  /** Extended diplomacy plays whose boost was never spent on an Alliance. */
  unusedBoosts: number;
  /** Pacts sealed with a faction the actor could have subjugated instead. */
  alliancesOnOwnTargets: number;
  /** Revolts sown. Zero across a batch means Seeds of revolt is ignored; sown
   *  far above `revoltsPlayed` means the escape is being prepared and never
   *  reached, which would make the card a dead turn rather than a plan. */
  revoltsSown: number;
  revoltsPlayed: number;
  /** Poach attempts and how many the 50% roll turned away. A share far from
   *  half means the roll is not being reached the way the rules intend. */
  poachAttempts: number;
  poachesFailed: number;
  /** Incorporate plays and how many the loyalty roll turned away. A share near
   *  1 means the ramp is too slow and the card is a wasted turn; near 0 means
   *  the gate never bites and vassalage is a waypoint again. */
  incorporateAttempts: number;
  incorporationsFailed: number;
  /** Turns each vassalage lasted, so the whole point of the change - that
   *  subjugation is a state rather than a one-round waypoint - is a number. */
  vassalTenures: number[];
  /** Settlements founded. Zero across a batch means the card is ignored. */
  settlementsFounded: number;
  /** Of those, ones founded in a land the founder did not hold itself - a
   *  vassal's land or one it had annexed. A share near 1 would mean the policy
   *  prefers other people's land, which is the bias worth catching. */
  settlementsOnHeldLands: number;
  /** Settlements founded in a land that had left the founder's realm by the
   *  end of the run: the turn was spent raising somebody else's bar. */
  settlementsWalkedOff: number;
}

const biggestRealm = (s: GameState): number =>
  Math.max(
    ...s.factionIds.map((f) => realmOf(f, s.overlords, s.incorporated).length),
  );

/** One headless game with no privileged seat: all 26 lands hold the same deck
 *  and play the same policy, and the run ends when somebody unifies the Balts
 *  or the cap is reached.
 *
 *  The last three summary fields exist to tell a slow game from a stalemate.
 *  A capped run whose largest realm is 3 and which has not seen an
 *  incorporation in 60 turns is the failure this whole change is aimed at, and
 *  it should be a number rather than an undifferentiated "cap". */
export function runWorld(opts: WorldOptions): WorldSummary {
  // chooseDeck silently no-ops on a wrong-length deck, which would leave the
  // human seat on the default build while every AI seat runs opts.deck - a
  // world that looks symmetric but is not. Fail loudly instead.
  if (opts.deck.length !== DECK_SIZE) {
    throw new Error(
      `runWorld: deck must hold exactly ${DECK_SIZE} cards, got ${opts.deck.length}`,
    );
  }
  const rng = seededRng(opts.seed);
  const seeded: GameState = {
    ...newGame(SIM_FACTION_IDS, SIM_ADJACENCY, SIM_ETHNICITIES),
    humanSeat: null,
  };
  let state = pickFaction(
    chooseDeck(startGame(seeded), opts.deck),
    SIM_FACTION_IDS[0],
    rng,
    () => opts.deck,
  );
  let largestRealm = biggestRealm(state);
  const playsByCard: Record<string, number> = {};
  let targetedPlays = 0;
  let firstLegalTargetPlays = 0;
  let boostedAlliances = 0;
  let alliancesOnOwnTargets = 0;
  while (state.phase === "playing" && state.turn <= opts.turnCap) {
    const p = state.players[state.current];
    const actor = p.factionId;
    // Three of the metrics need the alternatives the policy had at decision
    // time, which the log does not record, so the action is inspected before it
    // is applied. `aiTakeTurn` is exactly `chooseAction` followed by one of
    // discardCard/playCard, so rng consumption is unchanged - the
    // identical-seeds test is the guard on that.
    const action = chooseAction(state);
    if (action.type === "play") {
      const cardId = p.hand[action.cardIndex];
      playsByCard[cardId] = (playsByCard[cardId] ?? 0) + 1;
      if (CARDS[cardId]?.targeted === true) {
        const legal = validTargetsFor(viewOf(state), actor, cardId);
        if (legal.length > 1) {
          targetedPlays++;
          if (action.targetId === legal[0]) firstLegalTargetPlays++;
        }
      }
      if (cardId === "alliance") {
        if (state.diplomacyBoost.includes(actor)) boostedAlliances++;
        if (
          action.targetId !== undefined &&
          validTargetsFor(viewOf(state), actor, "subjugate").includes(action.targetId)
        ) {
          alliancesOnOwnTargets++;
        }
      }
    }
    const next =
      action.type === "discard"
        ? discardCard(state, action.cardIndex)
        : playCard(state, action.cardIndex, rng, action.targetId, action.tributeTrack);
    if (!next.playedThisTurn) {
      throw new Error(
        `stuck turn: seed ${opts.seed}, turn ${state.turn}, actor ${actor}, ` +
          `hand [${p.hand.join(", ")}]`,
      );
    }
    state = next.phase === "playing" ? advance(next, rng) : next;
    largestRealm = Math.max(largestRealm, biggestRealm(state));
  }
  // Settlements: founded where, and how many walked off with a vassal. The log
  // carries the founder as a player id, so the faction is resolved through the
  // seat rather than assumed to be the land itself.
  const settledEvents = state.log.filter((e) => e.type === "settled");
  const factionOfPlayer = new Map(state.players.map((pl) => [pl.id, pl.factionId]));
  let settlementsOnHeldLands = 0;
  let settlementsWalkedOff = 0;
  for (const e of settledEvents) {
    const founder = factionOfPlayer.get(e.playerId);
    const land = e.targetFactionId;
    if (founder === undefined || land === undefined) continue;
    if (land !== founder) settlementsOnHeldLands++;
    if (!realmOf(founder, state.overlords, state.incorporated).includes(land)) {
      settlementsWalkedOff++;
    }
  }
  const unified = state.log.find((e) => e.type === "unified");
  const lastIncorporation = [...state.log]
    .reverse()
    .find((e) => e.type === "incorporated");
  const plays = state.log.filter((e) => e.type === "play");
  // A poach attempt is any Subjugate aimed at a faction that already had a
  // lord, whether the roll then landed or not - counted from the log rather
  // than re-derived, so the number cannot drift from what actually happened.
  const poachAttempts =
    state.log.filter(
      (e) =>
        (e.type === "subjugated" && e.formerOverlordFactionId !== undefined) ||
        e.type === "subjugate-failed",
    ).length;
  // How long each vassalage lasted, in turns. A vassalage still standing at
  // the end counts from its start to the final turn.
  const vassalTenures: number[] = [];
  const openVassalage = new Map<string, number>();
  for (const e of state.log) {
    const land = e.targetFactionId;
    if (land === undefined) continue;
    if (e.type === "subjugated") {
      const prior = openVassalage.get(land);
      if (prior !== undefined) vassalTenures.push(e.turn - prior);
      openVassalage.set(land, e.turn);
    } else if (
      e.type === "released" || e.type === "incorporated" ||
      (e.type === "reclaimed" && e.cardId === "revolt")
    ) {
      const start = openVassalage.get(land);
      if (start !== undefined) {
        vassalTenures.push(e.turn - start);
        openVassalage.delete(land);
      }
    }
  }
  for (const start of openVassalage.values()) {
    vassalTenures.push(state.turn - start);
  }
  const preventedAssassinations = plays.filter(
    (e) => e.cardId === "assassinate-ruler" && e.prevented === true,
  ).length;
  // Both waste counters are "tokens posted, never cashed", so both floor at 0.
  // A negative value would mean a token was spent twice, which is a bug worth
  // failing loudly for rather than reporting as a tidy zero.
  const untestedGuards = (playsByCard["bodyguard"] ?? 0) - preventedAssassinations;
  const unusedBoosts = (playsByCard["extended-diplomacy"] ?? 0) - boostedAlliances;
  if (untestedGuards < 0 || unusedBoosts < 0) {
    throw new Error(
      `token cashed twice: seed ${opts.seed}, guards ${untestedGuards}, ` +
        `boosts ${unusedBoosts}`,
    );
  }
  return {
    seed: opts.seed,
    outcome: unified === undefined ? "cap" : "unified",
    endTurn: state.turn,
    winner: unified?.overlordFactionId ?? null,
    subjugations: state.log.filter((e) => e.type === "subjugated").length,
    incorporations: state.log.filter((e) => e.type === "incorporated").length,
    largestRealm,
    turnsSinceLastIncorporation: state.turn - (lastIncorporation?.turn ?? 0),
    playsByCard,
    targetedPlays,
    firstLegalTargetPlays,
    preventedAssassinations,
    untestedGuards,
    unusedBoosts,
    alliancesOnOwnTargets,
    revoltsSown: state.log.filter((e) => e.type === "seeded").length,
    revoltsPlayed: plays.filter((e) => e.cardId === "revolt").length,
    poachAttempts,
    poachesFailed: state.log.filter((e) => e.type === "subjugate-failed").length,
    incorporateAttempts: playsByCard["incorporate"] ?? 0,
    incorporationsFailed:
      state.log.filter((e) => e.type === "incorporate-failed").length,
    vassalTenures,
    settlementsFounded: settledEvents.length,
    settlementsOnHeldLands,
    settlementsWalkedOff,
  };
}

/** Three lands worth of conquest and nothing else, so the measurement is about
 *  the subjugation loop rather than about Alliance or Bodyguard. */
export const CONQUEST_DECK: string[] = [
  "raid", "subjugate", "incorporate",
  ...Array.from({ length: DECK_SIZE - 3 }, () => "grow-crops"),
];

export const CONQUEST_OMENS_DECK: string[] = [
  "raid", "subjugate", "incorporate", "favourable-omens",
  ...Array.from({ length: DECK_SIZE - 4 }, () => "grow-crops"),
];

/** Same three live cards as `conquest-scaled` plus a fourth card that never
 *  does anything in this arm - Bodyguard only matters against Assassinate
 *  ruler, which no deck in this deck holds. A control for Finding 2: if a
 *  fourth card by itself (whether or not it does anything) sped worlds up,
 *  this arm would move the same way `conquest-omens` does. It doesn't - see
 *  the design doc's Finding 2 control table. */
export const CONQUEST_INERT_DECK: string[] = [
  "raid", "subjugate", "incorporate", "bodyguard",
  ...Array.from({ length: DECK_SIZE - 4 }, () => "grow-crops"),
];

/** `conquest-scaled` exists to attribute a result. Without it, a shorter game
 *  under `conquest-omens` cannot be told apart from "the deck simply holds one
 *  more non-potato card" - the same reasoning that put the `defensive` arm in
 *  the 2026-07-29 new-player spec. `conquest-inert` is a further control: it
 *  swaps that fourth card for one that is strategically inert in this deck,
 *  to show that card count alone (not what the card does) is not what moves
 *  the result. It intentionally has no committed scenario band - it exists
 *  for a reader to rerun, not to guard pacing.
 *
 *  `full-deck` exists because the conquest arms above isolate the
 *  subjugation loop (Raid/Subjugate/Incorporate plus filler) and, in doing
 *  so, overstate how fast a real game resolves: a full ten-card deck also
 *  carries Fortify, Alliance and Revolt, all of which can stall or reverse
 *  a conquest. It runs the same DEFAULT_DECK every human player is offered,
 *  so the committed evidence covers the deck shape a player actually plays,
 *  not only the narrow shape that isolates one loop. */
export const WORLD_ARMS: Record<string, string[]> = {
  "conquest-scaled": CONQUEST_DECK,
  "conquest-omens": CONQUEST_OMENS_DECK,
  "conquest-inert": CONQUEST_INERT_DECK,
  "full-deck": DEFAULT_DECK,
};

export interface WorldBatchOptions {
  games: number;
  turnCap: number;
  firstSeed: number;
  arm: string;
}

export function runWorldBatch(opts: WorldBatchOptions): WorldSummary[] {
  const deck = WORLD_ARMS[opts.arm];
  if (deck === undefined) {
    throw new Error(
      `unknown world arm "${opts.arm}"; known: ${Object.keys(WORLD_ARMS).join(", ")}`,
    );
  }
  return Array.from({ length: opts.games }, (_, i) =>
    runWorld({
      seed: opts.firstSeed + i,
      deck,
      turnCap: opts.turnCap,
    }),
  );
}

export interface WorldStats {
  arm: string;
  games: number;
  unifiedShare: number;
  capShare: number;
  /** Over resolved worlds only; null when none resolved. */
  medianEndTurn: number | null;
  meanEndTurn: number | null;
  meanSubjugations: number | null;
  meanIncorporations: number | null;
  medianLargestRealm: number | null;
  /** Median turns of silence before a capped world gave up. Null when every
   *  world resolved. This is the stalemate number. */
  medianStallTurns: number | null;
  /** Pooled share of targeted plays that took the first legal target while 2 or
   *  more were legal. Pooled rather than a mean of per-game ratios, so a
   *  40-turn game does not weigh the same as a 300-turn one. Null when no game
   *  ever offered a real choice of target. */
  firstLegalTargetShare: number | null;
  /** Pooled denominator behind firstLegalTargetShare: targeted plays made with
   *  2 or more legal targets. A share is meaningless without it. */
  targetedPlaysSeen: number;
  /** Pooled share of all plays, per card id. */
  playShareByCard: Record<string, number>;
  meanPreventedAssassinations: number | null;
  meanUntestedGuards: number | null;
  meanUnusedBoosts: number | null;
  meanAlliancesOnOwnTargets: number | null;
  /** The same defect as a share of the pacts actually sealed, which is what it
   *  was always about. The per-world mean above conflates targeting quality
   *  with game length - it tripled when Found a settlement lengthened worlds
   *  while the share stayed under 1% - so the share is the one to assert on. */
  alliancesOnOwnTargetsShare: number | null;
  meanSettlementsFounded: number | null;
  /** Share of founded settlements placed in a land the founder did not hold
   *  itself. Pooled over the batch, so it needs the count below to read. */
  settlementsOnHeldLandsShare: number | null;
  settlementsFoundedTotal: number;
  /** Seeds of revolt: sown, and how many reached an actual Revolt. */
  revoltsSownTotal: number;
  revoltsPlayedTotal: number;
  /** Share of poach attempts the 50% roll turned away. */
  poachFailShare: number;
  /** Share of Incorporate plays the loyalty roll turned away. */
  incorporateFailShare: number;
  /** The headline of this whole change: how long a vassalage lasts. */
  medianVassalTenure: number | null;
  meanVassalTenure: number | null;
  /** Share of founded settlements that had left the founder's realm by the end
   *  - the wasted-play counter for this card. */
  settlementsWalkedOffShare: number | null;
}

export function aggregateWorld(arm: string, games: WorldSummary[]): WorldStats {
  const unified = games.filter((g) => g.outcome === "unified");
  const capped = games.filter((g) => g.outcome === "cap");
  const share = (n: number): number => (games.length === 0 ? 0 : n / games.length);
  const sum = (pick: (g: WorldSummary) => number): number =>
    games.reduce((a, g) => a + pick(g), 0);
  const targeted = sum((g) => g.targetedPlays);
  const firstLegal = sum((g) => g.firstLegalTargetPlays);
  const founded = sum((g) => g.settlementsFounded);
  const alliancePlays = sum((g) => g.playsByCard["alliance"] ?? 0);
  const playShareByCard: Record<string, number> = {};
  for (const g of games) {
    for (const [id, n] of Object.entries(g.playsByCard)) {
      playShareByCard[id] = (playShareByCard[id] ?? 0) + n;
    }
  }
  const totalPlays = Object.values(playShareByCard).reduce((a, b) => a + b, 0);
  for (const id of Object.keys(playShareByCard)) {
    playShareByCard[id] = totalPlays === 0 ? 0 : playShareByCard[id] / totalPlays;
  }
  return {
    arm,
    games: games.length,
    unifiedShare: share(unified.length),
    capShare: share(capped.length),
    medianEndTurn: median(unified.map((g) => g.endTurn)),
    meanEndTurn: mean(unified.map((g) => g.endTurn)),
    meanSubjugations: mean(games.map((g) => g.subjugations)),
    meanIncorporations: mean(games.map((g) => g.incorporations)),
    medianLargestRealm: median(games.map((g) => g.largestRealm)),
    medianStallTurns: median(capped.map((g) => g.turnsSinceLastIncorporation)),
    firstLegalTargetShare: targeted === 0 ? null : firstLegal / targeted,
    targetedPlaysSeen: targeted,
    playShareByCard,
    meanPreventedAssassinations: mean(games.map((g) => g.preventedAssassinations)),
    meanUntestedGuards: mean(games.map((g) => g.untestedGuards)),
    meanUnusedBoosts: mean(games.map((g) => g.unusedBoosts)),
    meanAlliancesOnOwnTargets: mean(games.map((g) => g.alliancesOnOwnTargets)),
    alliancesOnOwnTargetsShare:
      alliancePlays === 0
        ? null
        : sum((g) => g.alliancesOnOwnTargets) / alliancePlays,
    meanSettlementsFounded: mean(games.map((g) => g.settlementsFounded)),
    settlementsFoundedTotal: founded,
    revoltsSownTotal: sum((g) => g.revoltsSown),
    revoltsPlayedTotal: sum((g) => g.revoltsPlayed),
    poachFailShare:
      sum((g) => g.poachAttempts) === 0
        ? 0
        : sum((g) => g.poachesFailed) / sum((g) => g.poachAttempts),
    incorporateFailShare:
      sum((g) => g.incorporateAttempts) === 0
        ? 0
        : sum((g) => g.incorporationsFailed) / sum((g) => g.incorporateAttempts),
    medianVassalTenure: median(games.flatMap((g) => g.vassalTenures)),
    meanVassalTenure: mean(games.flatMap((g) => g.vassalTenures)),
    settlementsOnHeldLandsShare:
      founded === 0
        ? null
        : games.reduce((n, g) => n + g.settlementsOnHeldLands, 0) / founded,
    settlementsWalkedOffShare:
      founded === 0
        ? null
        : games.reduce((n, g) => n + g.settlementsWalkedOff, 0) / founded,
  };
}
