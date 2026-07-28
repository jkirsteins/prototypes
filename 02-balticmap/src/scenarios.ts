import {
  DECK_ARMS, HUMAN_DECKS, HUMAN_POLICIES, aggregate, runGame,
  SIM_FACTION_IDS, type ArmStats, type GameSummary,
} from "./sim";

/** An inclusive [min, max] band a metric must stay inside. Bands are set from
 *  a measured run and then widened deliberately, so ordinary seed noise does
 *  not fail a check but a real shift in pacing does. */
export type Band = [number, number];

export interface Expectation {
  subjugatedShare?: Band;
  medianFirstSubjugation?: Band;
  meanFirstSubjugation?: Band;
  defeatShare?: Band;
  medianDefeatTurn?: Band;
}

export interface Scenario {
  id: string;
  /** What this scenario is protecting, in one line. */
  description: string;
  humanPolicy: keyof typeof HUMAN_POLICIES & string;
  humanDeck: keyof typeof HUMAN_DECKS & string;
  arm: keyof typeof DECK_ARMS & string;
  games: number;
  firstSeed: number;
  turnCap: number;
  expect: Expectation;
}

/** Add a scenario here and it is checked by `npm run simulate:check` and by
 *  the test suite. Bands come from the measured run recorded in the
 *  2026-07-29 new-player simulation spec. */
export const SCENARIOS: Scenario[] = [
  {
    id: "new-player-potatoes",
    description:
      "A new player who built nothing but Grow potatoes must fall fast - " +
      "falling is how they discover the rest of the deck.",
    humanPolicy: "naive",
    humanDeck: "potatoes",
    arm: "shipped",
    games: 52,
    firstSeed: 1,
    turnCap: 80,
    expect: {
      subjugatedShare: [0.95, 1],
      medianFirstSubjugation: [5, 13],
      defeatShare: [0.9, 1],
      medianDefeatTurn: [10, 24],
    },
  },
  {
    id: "potatoes-unarmed-enemies",
    description:
      "The same player against enemy decks with no guaranteed aggression - " +
      "the pre-2026-07-29 world. Kept so the guarantee's effect stays visible.",
    humanPolicy: "naive",
    humanDeck: "potatoes",
    arm: "unarmed",
    games: 52,
    firstSeed: 1,
    turnCap: 80,
    expect: {
      subjugatedShare: [0.9, 1],
      medianFirstSubjugation: [10, 24],
      defeatShare: [0.8, 1],
      medianDefeatTurn: [16, 40],
    },
  },
  {
    id: "flailing-full-deck",
    description:
      "A player holding every card but with no plan, playing whatever is " +
      "leftmost. Outlasts the potato player by a wide margin - Reclaim " +
      "independence and Revolt keep landing in hand - without being safe.",
    humanPolicy: "naive",
    humanDeck: "full",
    arm: "shipped",
    games: 52,
    firstSeed: 1,
    turnCap: 80,
    expect: {
      subjugatedShare: [0.42, 0.78],
      medianFirstSubjugation: [8, 22],
      defeatShare: [0.15, 0.45],
    },
  },
  {
    id: "competent-full-deck",
    description:
      "A player who plays as well as the enemies do. Guards the other end: " +
      "the world must not be so aggressive that skill stops mattering.",
    humanPolicy: "competent",
    humanDeck: "full",
    arm: "shipped",
    games: 26,
    firstSeed: 1,
    turnCap: 80,
    expect: {
      subjugatedShare: [0.4, 0.95],
      medianFirstSubjugation: [8, 40],
    },
  },
];

export interface Check {
  metric: keyof Expectation;
  value: number | null;
  band: Band;
  ok: boolean;
}

export interface ScenarioResult {
  scenario: Scenario;
  stats: ArmStats;
  checks: Check[];
  ok: boolean;
}

export function runScenario(s: Scenario): ScenarioResult {
  const aiDeckFor = DECK_ARMS[s.arm];
  const humanTurn = HUMAN_POLICIES[s.humanPolicy];
  const buildHumanDeck = HUMAN_DECKS[s.humanDeck];
  if (aiDeckFor === undefined) throw new Error(`${s.id}: unknown arm "${s.arm}"`);
  if (humanTurn === undefined) {
    throw new Error(`${s.id}: unknown human policy "${s.humanPolicy}"`);
  }
  if (buildHumanDeck === undefined) {
    throw new Error(`${s.id}: unknown human deck "${s.humanDeck}"`);
  }
  const games: GameSummary[] = Array.from({ length: s.games }, (_, i) =>
    runGame({
      seed: s.firstSeed + i,
      humanFaction: SIM_FACTION_IDS[i % SIM_FACTION_IDS.length],
      aiDeckFor,
      humanTurn,
      humanDeck: buildHumanDeck(),
      turnCap: s.turnCap,
    }),
  );
  const stats = aggregate(s.id, games);
  const checks = checksFor(s.expect, stats);
  return { scenario: s, stats, checks, ok: checks.every((c) => c.ok) };
}

export function checksFor(expect: Expectation, stats: ArmStats): Check[] {
  return (Object.keys(expect) as (keyof Expectation)[]).map((metric) => {
    const band = expect[metric]!;
    const value = stats[metric];
    return {
      metric,
      value,
      band,
      ok: value !== null && value >= band[0] && value <= band[1],
    };
  });
}
