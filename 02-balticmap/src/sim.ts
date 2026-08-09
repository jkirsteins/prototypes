import rawData from "./data/map.json";
import type { MapData } from "./types";
import { defenseMaxOf, factionAdjacencyOf, siteCapsOf } from "./adjacency";
import { CARDS, GUARDS, guardAgainst, type Rng, type Strategy } from "./cards";
import {
  advance, chooseBuild, discardCard, endTurn, newGame, pickFaction, playCard,
  repeatOnlyOf, startGame, turnOpen, viewOf, type GameState,
} from "./game";
import { playableSet, validTargetsFor } from "./playability";
import { seededRng } from "./rng";
import { aiTakeTurn, chooseAction, MAX_AI_PLAYS } from "./ai";
import { fullRealmOf } from "./relations";

const data = rawData as MapData;

/** The map every simulated game is played on: the shipped 26 lands. */
export const SIM_FACTION_IDS: string[] = data.factions.map((f) => f.id);
export const SIM_ADJACENCY: Record<string, string[]> = factionAdjacencyOf(data);
export const SIM_ETHNICITIES: Record<string, string> = Object.fromEntries(
  data.factions.map((f) => [f.id, f.ethnicity]),
);
/** The shipped map's settlement slots. Passed explicitly rather than left to
 *  `newGame`'s default, so a simulated Zemaitija can be built up eight times
 *  and a simulated Saaremaa once, exactly as in the game. */
export const SIM_SITE_CAPS: Record<string, number> = siteCapsOf(data);
/** The shipped map's defense ceilings - population / 50, 200..1800. Explicit
 *  for the same reason as the site caps: a simulated Pilsotas must fall in
 *  one doubled Raid while Eastern Aukstaitija shrugs it off. */
export const SIM_DEFENSE_MAX: Record<string, number> = defenseMaxOf(data);

/** Re-exported from `./rng`, where it now lives: tests and scripts reach for a
 *  seed through the harness, and the app must not import the harness. */
export { seededRng };

/** How a batch assigns builds. `mixed` keeps `pickFaction`'s own seeded roll;
 *  the uniform arms stamp one strategy over every seat after the deal, which
 *  moves no rng draw (the roll is consumed either way, the frozen-contract
 *  rule). */
export type BuildArm = "mixed" | "all-warpath" | "all-pestilence";

export const BUILD_ARMS: readonly BuildArm[] = [
  "mixed", "all-warpath", "all-pestilence",
];

function applyBuildArm(state: GameState, arm: BuildArm): GameState {
  if (arm === "mixed") return state;
  const strategy: Strategy = arm === "all-warpath" ? "warpath" : "pestilence";
  return {
    ...state,
    players: state.players.map((p) => ({ ...p, strategy })),
  };
}

/** The new player: no plan, just plays whatever the rules allow, first come.
 *
 *  Plays until the turn is spent, which under standard rules is one card
 *  unless that card re-opened the turn for another of its own kind. Modelling
 *  that as one action per turn both under-counted repeat plays in a balance
 *  run and, worse, left the turn open - and `advance` refuses an open turn, so
 *  the harness stalled on it. Ends the turn whatever happens: a naive player
 *  who runs out of legal plays hands over rather than sitting there. */
export function naiveHumanTurn(state: GameState, rng: Rng): GameState {
  let g = state;
  for (let plays = 0; g.phase === "playing" && plays < MAX_NAIVE_PLAYS; plays++) {
    const p = g.players[g.current];
    const set = playableSet(
      viewOf(g), p.factionId, p.hand, { repeatOnly: repeatOnlyOf(g) },
    );
    const next = set.mode === "discard"
      ? discardCard(g, set.cardIndexes[0])
      : playFirstPlayable(g, set.cardIndexes[0], rng);
    if (next === g) break;
    g = next;
    if (!turnOpen(g)) break;
  }
  return endTurn(g);
}

/** The bound on one naive turn. A repeat needs a free army and a card in hand,
 *  so the rules stop this long before the number does; it is here so a rules
 *  bug cannot hang a balance run. */
const MAX_NAIVE_PLAYS = 8;

function playFirstPlayable(
  state: GameState, cardIndex: number | undefined, rng: Rng,
): GameState {
  if (cardIndex === undefined) return state;
  const p = state.players[state.current];
  const cardId = p.hand[cardIndex];
  const targetId = CARDS[cardId]?.targeted
    ? validTargetsFor(viewOf(state), p.factionId, cardId)[0]
    : undefined;
  return playCard(state, cardIndex, rng, targetId);
}

/** How the human seat plays. `naive` is the new player; `competent` runs the
 *  same policy the enemies use, standing in for a player who knows the rules. */
export type HumanTurn = (state: GameState, rng: Rng) => GameState;

export const HUMAN_POLICIES: Record<string, HumanTurn> = {
  naive: naiveHumanTurn,
  competent: aiTakeTurn,
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
  /** How often the human freed itself through the independence gate. */
  independenceCount: number;
  /** Turn the human was incorporated (game over); null if they survived. */
  defeatTurn: number | null;
  conqueror: string | null;
  /** Turns the game actually ran, capped by turnCap. */
  turns: number;
  /** Lands under the human when the game ended, by `fullRealmOf` - the
   *  "how much of the map is theirs" question, per the two-realm-sizes rule
   *  in CLAUDE.md. Zero once the human has been incorporated. */
  finalRealmSize: number;
}

export function summarize(
  state: GameState,
  seed: number,
  humanFaction: string,
): GameSummary {
  const mine = state.log.filter((e) => e.targetFactionId === humanFaction);
  const subjugations = mine.filter((e) => e.type === "subjugated");
  const releases = mine.filter((e) => e.type === "released");
  const independences = mine.filter((e) => e.type === "independence");
  // A rival unifying the map logs "unified", not "defeat", because its target
  // is the map rather than the human's faction - but it still sets phase to
  // "defeat", and from the human's seat losing the map to someone else is a
  // loss just the same.
  const defeat = state.log.find(
    (e) => e.type === "defeat" || e.type === "unified",
  );
  const outcome: Outcome =
    state.phase === "defeat" ? "defeat"
      : state.phase === "victory" ? "victory"
        : "cap";
  // Their land belongs to the conqueror, so nothing is theirs.
  const conquered = state.incorporated[humanFaction] !== undefined;
  return {
    seed,
    humanFaction,
    outcome,
    firstSubjugatedTurn: subjugations[0]?.turn ?? null,
    firstOverlord: subjugations[0]?.overlordFactionId ?? null,
    subjugatedCount: subjugations.length,
    releasedCount: releases.length,
    independenceCount: independences.length,
    defeatTurn: defeat?.turn ?? null,
    conqueror: defeat?.overlordFactionId ?? null,
    turns: state.turn,
    finalRealmSize: conquered
      ? 0
      : fullRealmOf(humanFaction, state.overlords, state.incorporated).size,
  };
}

export interface RunOptions {
  seed: number;
  humanFaction: string;
  turnCap: number;
  humanBuild?: Strategy;
  arm?: BuildArm;
  humanTurn?: HumanTurn;
}

function newSimGame(): GameState {
  return newGame(
    SIM_FACTION_IDS, SIM_ADJACENCY, SIM_ETHNICITIES, SIM_SITE_CAPS,
    SIM_DEFENSE_MAX,
  );
}

/** Plays one complete headless game. Throws rather than spinning if a turn
 *  fails to resolve - a stuck turn is a bug, not a data point. */
export function runGame(opts: RunOptions): GameSummary {
  const { seed, humanFaction, turnCap } = opts;
  const rng = seededRng(seed);
  let state = pickFaction(
    chooseBuild(startGame(newSimGame()), opts.humanBuild ?? "warpath", rng),
    humanFaction,
    rng,
  );
  state = applyBuildArm(state, opts.arm ?? "mixed");
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
  arm: BuildArm;
}

/** Runs `games` games for one arm. Game i always uses seed firstSeed+i and
 *  faction i mod 26, so arms line up game for game. */
export function runBatch(opts: BatchOptions): GameSummary[] {
  if (!BUILD_ARMS.includes(opts.arm)) {
    throw new Error(
      `unknown arm "${opts.arm}"; known: ${BUILD_ARMS.join(", ")}`,
    );
  }
  return Array.from({ length: opts.games }, (_, i) =>
    runGame({
      seed: opts.firstSeed + i,
      humanFaction: SIM_FACTION_IDS[i % SIM_FACTION_IDS.length],
      arm: opts.arm,
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
  meanIndependences: number | null;
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
    meanIndependences: mean(games.map((g) => g.independenceCount)),
    capShare: share(games.filter((g) => g.outcome === "cap").length),
    victoryShare: share(games.filter((g) => g.outcome === "victory").length),
  };
}

/** Mean per-seed difference in first-subjugation turn against a reference arm,
 *  over the games where both arms subjugated the human. Negative means this
 *  arm gets there sooner. */
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
  /** The build assignment for all 26 seats. */
  arm: BuildArm;
  turnCap: number;
}

export interface WorldSummary {
  seed: number;
  outcome: "unified" | "cap";
  endTurn: number;
  winner: string | null;
  subjugations: number;
  incorporations: number;
  independences: number;
  /** The biggest realm any faction reached at any point. */
  largestRealm: number;
  /** Turns between the last incorporation and the end of the run. */
  turnsSinceLastIncorporation: number;
  /** Play counts per card id. Shows a card ignored, or played as filler. */
  playsByCard: Record<string, number>;
  /** Harvest picks per card id - which cards the growing decks actually
   *  reach for. The offer is the discovery route now, so a card never picked
   *  is a card the game effectively does not have. */
  harvestPicksByCard: Record<string, number>;
  harvestsSkipped: number;
  /** Targeted plays made while 2 or more targets were legal, and how many of
   *  those took the first in faction order. A share near 1 is the arbitrary
   *  targeting defect. */
  targetedPlays: number;
  firstLegalTargetPlays: number;
  /** Assassinate ruler spent into a Bodyguard. */
  preventedAssassinations: number;
  /** Guards posted that no assassination ever tested. */
  untestedGuards: number;
  /** Total defense damage dealt (the actual movement, not raw card damage)
   *  and total defense healed - the two sides of the new economy. */
  damageDealt: number;
  defenseHealed: number;
  /** Turns each vassalage lasted, so "subjugation is a state rather than a
   *  waypoint" stays a number under the new gates. */
  vassalTenures: number[];
  /** Settlements founded. Zero across a batch means the card is ignored. */
  settlementsFounded: number;
}

/** Read against the win threshold to tell a slow game from a stalemate, so it
 *  counts lands the way the win condition does - `fullRealmOf`, not `realmOf`. */
const biggestRealm = (s: GameState): number =>
  Math.max(
    ...s.factionIds.map((f) => fullRealmOf(f, s.overlords, s.incorporated).size),
  );

/** One headless game with no privileged seat: all 26 lands play the same
 *  policy under the arm's build assignment, and the run ends when somebody
 *  unifies the Balts or the cap is reached. */
export function runWorld(opts: WorldOptions): WorldSummary {
  const rng = seededRng(opts.seed);
  const seeded: GameState = {
    ...newSimGame(),
    humanSeat: null,
  };
  let state = applyBuildArm(
    pickFaction(
      chooseBuild(startGame(seeded), "warpath", rng),
      SIM_FACTION_IDS[0],
      rng,
    ),
    opts.arm,
  );
  let largestRealm = biggestRealm(state);
  const playsByCard: Record<string, number> = {};
  let targetedPlays = 0;
  let firstLegalTargetPlays = 0;
  while (state.phase === "playing" && state.turn <= opts.turnCap) {
    const p = state.players[state.current];
    const actor = p.factionId;
    // The seat's WHOLE turn, walked the way `aiTakeTurn` walks it: a card
    // carrying `playsAgain` leaves the turn open for another of its own kind,
    // and a harness that stopped after one play would count a seat's raids as
    // one raid. The loop is inlined rather than delegated because the
    // targeting metrics need the alternatives the policy had at decision
    // time, which the log does not record - so each action is inspected
    // before it is applied. `aiTakeTurn`'s other arm is the unlimited rule
    // set, which the sim never runs.
    let acted = state;
    for (let plays = 0; acted.phase === "playing" && plays < MAX_AI_PLAYS; plays++) {
      // The state before the play, kept so the metrics below read the board
      // the policy decided on. A GameState is immutable, so asking it after
      // the play still answers "what else was legal at the time".
      const before = acted;
      const action = chooseAction(before);
      const next =
        action.type === "discard"
          ? discardCard(before, action.cardIndex)
          : playCard(before, action.cardIndex, rng, action.targetId, {
              ...(action.sourceId !== undefined
                ? { sourceId: action.sourceId }
                : {}),
            });
      // A refused play returns the state unchanged. Counting it would inflate
      // the play share with a card that never left the hand.
      if (next === before) break;
      if (action.type === "play") {
        const cardId = before.players[before.current].hand[action.cardIndex];
        playsByCard[cardId] = (playsByCard[cardId] ?? 0) + 1;
        if (CARDS[cardId]?.targeted === true) {
          const legal = validTargetsFor(viewOf(before), actor, cardId);
          if (legal.length > 1) {
            targetedPlays++;
            if (action.targetId === legal[0]) firstLegalTargetPlays++;
          }
        }
      }
      acted = next;
      if (!turnOpen(acted)) break;
    }
    if (!acted.playedThisTurn) {
      throw new Error(
        `stuck turn: seed ${opts.seed}, turn ${state.turn}, actor ${actor}, ` +
          `hand [${p.hand.join(", ")}]`,
      );
    }
    state = acted.phase === "playing" ? advance(acted, rng) : acted;
    largestRealm = Math.max(largestRealm, biggestRealm(state));
  }
  const unified = state.log.find((e) => e.type === "unified");
  const lastIncorporation = [...state.log]
    .reverse()
    .find((e) => e.type === "incorporated");
  const plays = state.log.filter((e) => e.type === "play");
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
      e.type === "independence"
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
  // Every guard, not only Bodyguard, in case the set grows again. `prevented`
  // is stamped on the play the guard turned aside, so the cashed count is
  // that play's card mapped back to its guard.
  const preventedByGuard = (guardCardId: string): number =>
    plays.filter(
      (e) =>
        e.prevented === true && e.cardId !== undefined &&
        guardAgainst(e.cardId) === guardCardId,
    ).length;
  const preventedAssassinations = preventedByGuard("bodyguard");
  const untestedGuards = Object.keys(GUARDS).reduce(
    (sum, id) => sum + (playsByCard[id] ?? 0) - preventedByGuard(id),
    0,
  );
  if (untestedGuards < 0) {
    throw new Error(
      `guard cashed twice: seed ${opts.seed}, guards ${untestedGuards}`,
    );
  }
  const harvestPicksByCard: Record<string, number> = {};
  for (const e of state.log) {
    if (e.type !== "harvest-picked" || e.cardId === undefined) continue;
    harvestPicksByCard[e.cardId] = (harvestPicksByCard[e.cardId] ?? 0) + 1;
  }
  const harvestPlays = playsByCard["turnip-harvest"] ?? 0;
  const harvestPicks = Object.values(harvestPicksByCard)
    .reduce((a, b) => a + b, 0);
  const sumAmounts = (types: string[]): number =>
    state.log.reduce(
      (sum, e) => sum + (types.includes(e.type) ? (e.amount ?? 0) : 0),
      0,
    );
  return {
    seed: opts.seed,
    outcome: unified === undefined ? "cap" : "unified",
    endTurn: state.turn,
    winner: unified?.overlordFactionId ?? null,
    subjugations: state.log.filter((e) => e.type === "subjugated").length,
    incorporations: state.log.filter((e) => e.type === "incorporated").length,
    independences: state.log.filter((e) => e.type === "independence").length,
    largestRealm,
    turnsSinceLastIncorporation: state.turn - (lastIncorporation?.turn ?? 0),
    playsByCard,
    harvestPicksByCard,
    harvestsSkipped: Math.max(0, harvestPlays - harvestPicks),
    targetedPlays,
    firstLegalTargetPlays,
    preventedAssassinations,
    untestedGuards,
    damageDealt: sumAmounts(["march-resolved", "plagued"]),
    defenseHealed: sumAmounts(["healed"]),
    vassalTenures,
    settlementsFounded: state.log.filter((e) => e.type === "settled").length,
  };
}

export interface WorldBatchOptions {
  games: number;
  turnCap: number;
  firstSeed: number;
  arm: BuildArm;
}

export function runWorldBatch(opts: WorldBatchOptions): WorldSummary[] {
  if (!BUILD_ARMS.includes(opts.arm)) {
    throw new Error(
      `unknown world arm "${opts.arm}"; known: ${BUILD_ARMS.join(", ")}`,
    );
  }
  return Array.from({ length: opts.games }, (_, i) =>
    runWorld({
      seed: opts.firstSeed + i,
      arm: opts.arm,
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
  meanIndependences: number | null;
  medianLargestRealm: number | null;
  /** Median turns of silence before a capped world gave up. Null when every
   *  world resolved. This is the stalemate number. */
  medianStallTurns: number | null;
  /** Pooled share of targeted plays that took the first legal target while 2
   *  or more were legal. Null when no game ever offered a real choice. */
  firstLegalTargetShare: number | null;
  targetedPlaysSeen: number;
  /** Pooled share of all plays, per card id. */
  playShareByCard: Record<string, number>;
  /** Pooled share of harvest picks, per card id - the growing deck's own
   *  play-share table. */
  harvestPickShareByCard: Record<string, number>;
  harvestsSkippedTotal: number;
  meanPreventedAssassinations: number | null;
  meanUntestedGuards: number | null;
  meanDamageDealt: number | null;
  meanDefenseHealed: number | null;
  meanSettlementsFounded: number | null;
  /** The headline: how long a vassalage lasts under the two gates. */
  medianVassalTenure: number | null;
  meanVassalTenure: number | null;
}

export function aggregateWorld(arm: string, games: WorldSummary[]): WorldStats {
  const unified = games.filter((g) => g.outcome === "unified");
  const capped = games.filter((g) => g.outcome === "cap");
  const share = (n: number): number => (games.length === 0 ? 0 : n / games.length);
  const sum = (pick: (g: WorldSummary) => number): number =>
    games.reduce((a, g) => a + pick(g), 0);
  const targeted = sum((g) => g.targetedPlays);
  const firstLegal = sum((g) => g.firstLegalTargetPlays);
  const pooledShare = (
    pick: (g: WorldSummary) => Record<string, number>,
  ): Record<string, number> => {
    const out: Record<string, number> = {};
    for (const g of games) {
      for (const [id, n] of Object.entries(pick(g))) {
        out[id] = (out[id] ?? 0) + n;
      }
    }
    const total = Object.values(out).reduce((a, b) => a + b, 0);
    for (const id of Object.keys(out)) {
      out[id] = total === 0 ? 0 : out[id] / total;
    }
    return out;
  };
  return {
    arm,
    games: games.length,
    unifiedShare: share(unified.length),
    capShare: share(capped.length),
    medianEndTurn: median(unified.map((g) => g.endTurn)),
    meanEndTurn: mean(unified.map((g) => g.endTurn)),
    meanSubjugations: mean(games.map((g) => g.subjugations)),
    meanIncorporations: mean(games.map((g) => g.incorporations)),
    meanIndependences: mean(games.map((g) => g.independences)),
    medianLargestRealm: median(games.map((g) => g.largestRealm)),
    medianStallTurns: median(capped.map((g) => g.turnsSinceLastIncorporation)),
    firstLegalTargetShare: targeted === 0 ? null : firstLegal / targeted,
    targetedPlaysSeen: targeted,
    playShareByCard: pooledShare((g) => g.playsByCard),
    harvestPickShareByCard: pooledShare((g) => g.harvestPicksByCard),
    harvestsSkippedTotal: sum((g) => g.harvestsSkipped),
    meanPreventedAssassinations: mean(games.map((g) => g.preventedAssassinations)),
    meanUntestedGuards: mean(games.map((g) => g.untestedGuards)),
    meanDamageDealt: mean(games.map((g) => g.damageDealt)),
    meanDefenseHealed: mean(games.map((g) => g.defenseHealed)),
    meanSettlementsFounded: mean(games.map((g) => g.settlementsFounded)),
    medianVassalTenure: median(games.flatMap((g) => g.vassalTenures)),
    meanVassalTenure: mean(games.flatMap((g) => g.vassalTenures)),
  };
}
