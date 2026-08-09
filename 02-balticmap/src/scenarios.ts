import {
  BUILD_ARMS, HUMAN_POLICIES, aggregate, aggregateWorld,
  runGame, runWorldBatch, SIM_FACTION_IDS,
  type ArmStats, type BuildArm, type GameSummary, type WorldStats,
  type WorldSummary,
} from "./sim";
import type { Strategy } from "./cards";

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
  humanBuild: Strategy;
  arm: BuildArm;
  games: number;
  firstSeed: number;
  turnCap: number;
  expect: Expectation;
}

/** Add a scenario here and it is checked by `npm run simulate:check` and by
 *  the test suite.
 *
 *  Every band in this file was RE-CAPTURED against the defense-score rules
 *  (2026-08-08 design) on 2026-08-09: the Might-era bands measured a
 *  different game and were invalidated wholesale, exactly as that design
 *  says. These are post-flip baselines - measured, then widened the usual
 *  way (turn medians to [0.6x, 1.5x], shares by +/-0.15) - not targets: no
 *  tuning has been done against them. The headline worth knowing before a
 *  playtest: the defense economy resolves worlds FAST - median end turn
 *  30..43 across all three arms against the old game's ~105 - and a
 *  flailing player still falls (defeatShare 1.00), so pacing pressure is
 *  the first thing to judge at the table. */
export const SCENARIOS: Scenario[] = [
  {
    id: "new-player-flailing",
    description:
      "A new player who plays first-playable-card must still fall: falling " +
      "into vassalage is how the pressure of the gates is discovered.",
    humanPolicy: "naive",
    humanBuild: "warpath",
    arm: "mixed",
    games: 52,
    firstSeed: 1,
    turnCap: 80,
    expect: {
      subjugatedShare: [0.3, 0.62],       // measured 0.46
      medianFirstSubjugation: [12, 31],   // measured 20.5
      defeatShare: [0.85, 1],             // measured 1.00
      medianDefeatTurn: [19, 47],         // measured 31.5
    },
  },
  {
    id: "competent-warpath",
    description:
      "A player running the shipped policy on the warpath build against a " +
      "mixed field - the ordinary game. Guards overall pacing.",
    humanPolicy: "competent",
    humanBuild: "warpath",
    arm: "mixed",
    games: 52,
    firstSeed: 1,
    turnCap: 150,
    expect: {
      subjugatedShare: [0.5, 0.8],        // measured 0.65
      defeatShare: [0.79, 1],             // measured 0.94
      medianDefeatTurn: [20, 50],         // measured 33
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
  const humanTurn = HUMAN_POLICIES[s.humanPolicy];
  if (humanTurn === undefined) {
    throw new Error(`${s.id}: unknown human policy "${s.humanPolicy}"`);
  }
  if (!BUILD_ARMS.includes(s.arm)) {
    throw new Error(`${s.id}: unknown arm "${s.arm}"`);
  }
  const games: GameSummary[] = Array.from({ length: s.games }, (_, i) =>
    runGame({
      seed: s.firstSeed + i,
      humanFaction: SIM_FACTION_IDS[i % SIM_FACTION_IDS.length],
      arm: s.arm,
      humanTurn,
      humanBuild: s.humanBuild,
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

// -- world scenarios --------------------------------------------------------

/** `Scenario` is human-shaped: a human policy, a build, and expectations
 *  about the subjugation of one privileged seat. A world run has none of
 *  those - 26 equal seats, no human - so it gets its own expectation type. */
export interface WorldExpectation {
  unifiedShare?: Band;
  medianEndTurn?: Band;
  capShare?: Band;
}

export interface WorldScenario {
  id: string;
  /** What this scenario is protecting, in one line. */
  description: string;
  arm: BuildArm;
  games: number;
  firstSeed: number;
  turnCap: number;
  expect: WorldExpectation;
}

/** Post-flip baselines, like SCENARIOS above: measured on 2026-08-09 and
 *  widened, never tuned against. The three arms are the two uniform builds
 *  plus the mixed field the shipped game deals. Every arm resolved every
 *  world (unifiedShare 1.00 over 26 seeds at cap 300), so the lower share
 *  bound is deliberately tight: worlds stopping resolving is the failure
 *  the old game died of, and it must fail here rather than pass quietly. */
export const WORLD_SCENARIOS: WorldScenario[] = [
  {
    id: "world-mixed",
    description:
      "All 26 seats on seeded builds - the shipped world. Guards that games " +
      "resolve rather than stalemate under the defense economy.",
    arm: "mixed",
    games: 26,
    firstSeed: 1,
    turnCap: 300,
    expect: {
      unifiedShare: [0.85, 1],      // measured 1.00
      medianEndTurn: [19, 48],      // measured 32.0
    },
  },
  {
    id: "world-warpath",
    description:
      "All 26 seats on the warpath build: the pure attrition race.",
    arm: "all-warpath",
    games: 26,
    firstSeed: 1,
    turnCap: 300,
    expect: {
      unifiedShare: [0.85, 1],      // measured 1.00
      medianEndTurn: [18, 46],      // measured 30.5
    },
  },
  {
    id: "world-pestilence",
    description:
      "All 26 seats on the pestilence build: the stack-and-cash race.",
    arm: "all-pestilence",
    games: 26,
    firstSeed: 1,
    turnCap: 300,
    expect: {
      unifiedShare: [0.85, 1],      // measured 1.00
      medianEndTurn: [26, 64],      // measured 42.5
    },
  },
];

export interface WorldCheck {
  metric: keyof WorldExpectation;
  value: number | null;
  band: Band;
  ok: boolean;
}

export interface WorldScenarioResult {
  scenario: WorldScenario;
  stats: WorldStats;
  checks: WorldCheck[];
  ok: boolean;
}

export function worldChecksFor(
  expect: WorldExpectation,
  stats: WorldStats,
): WorldCheck[] {
  return (Object.keys(expect) as (keyof WorldExpectation)[]).map((metric) => {
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

export function runWorldScenario(s: WorldScenario): WorldScenarioResult {
  if (!BUILD_ARMS.includes(s.arm)) {
    throw new Error(`${s.id}: unknown arm "${s.arm}"`);
  }
  const games: WorldSummary[] = runWorldBatch({
    games: s.games,
    turnCap: s.turnCap,
    firstSeed: s.firstSeed,
    arm: s.arm,
  });
  const stats = aggregateWorld(s.id, games);
  const checks = worldChecksFor(s.expect, stats);
  return { scenario: s, stats, checks, ok: checks.every((c) => c.ok) };
}
