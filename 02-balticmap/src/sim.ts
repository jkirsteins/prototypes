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
import { aiTakeTurn } from "./ai";
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
  while (state.phase === "playing" && state.turn <= opts.turnCap) {
    const actor = state.players[state.current].factionId;
    const next = aiTakeTurn(state, rng);
    if (!next.playedThisTurn) {
      throw new Error(
        `stuck turn: seed ${opts.seed}, turn ${state.turn}, actor ${actor}, ` +
          `hand [${state.players[state.current].hand.join(", ")}]`,
      );
    }
    state = next.phase === "playing" ? advance(next, rng) : next;
    largestRealm = Math.max(largestRealm, biggestRealm(state));
  }
  const unified = state.log.find((e) => e.type === "unified");
  const lastIncorporation = [...state.log]
    .reverse()
    .find((e) => e.type === "incorporated");
  return {
    seed: opts.seed,
    outcome: unified === undefined ? "cap" : "unified",
    endTurn: state.turn,
    winner: unified?.overlordFactionId ?? null,
    subjugations: state.log.filter((e) => e.type === "subjugated").length,
    incorporations: state.log.filter((e) => e.type === "incorporated").length,
    largestRealm,
    turnsSinceLastIncorporation: state.turn - (lastIncorporation?.turn ?? 0),
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
}

export function aggregateWorld(arm: string, games: WorldSummary[]): WorldStats {
  const unified = games.filter((g) => g.outcome === "unified");
  const capped = games.filter((g) => g.outcome === "cap");
  const share = (n: number): number => (games.length === 0 ? 0 : n / games.length);
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
  };
}
