import rawData from "./data/map.json";
import type { MapData } from "./types";
import { factionAdjacencyOf } from "./adjacency";
import { buildAiDeck, buildDeck, CARDS, DECK_SIZE, type Rng } from "./cards";
import {
  advance, chooseDeck, discardCard, newGame, pickFaction, playCard, startGame,
  viewOf, type GameState, type RaidRule, type TributeTrack,
} from "./game";
import { playableSet, validTargetsFor } from "./playability";
import { aiTakeTurn } from "./ai";

const data = rawData as MapData;

/** The map every simulated game is played on: the shipped 26 lands. */
export const SIM_FACTION_IDS: string[] = data.factions.map((f) => f.id);
export const SIM_ADJACENCY: Record<string, string[]> = factionAdjacencyOf(data);

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
  const defeat = state.log.find((e) => e.type === "defeat");
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
  raidRule?: RaidRule;
}

/** Plays one complete headless game. Throws rather than spinning if a turn
 *  fails to resolve - a stuck turn is a bug, not a data point. */
export function runGame(opts: RunOptions): GameSummary {
  const { seed, humanFaction, turnCap } = opts;
  const rng = seededRng(seed);
  let state = pickFaction(
    chooseDeck(
      startGame(newGame(SIM_FACTION_IDS, SIM_ADJACENCY)),
      opts.humanDeck ?? potatoDeck(),
    ),
    humanFaction,
    rng,
    opts.aiDeckFor ?? DECK_ARMS.shipped,
  );
  if (opts.raidRule !== undefined) {
    state = { ...state, raidRule: opts.raidRule };
  }
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
