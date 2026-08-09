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
 *  tuning has been done against them.
 *
 *  Three directed changes have moved them since, each followed by a full
 *  re-measure. Raid damage was cut 15x (150/75 -> 10/5), which lengthened
 *  worlds less than the factor suggests: with the bases this small, War
 *  council leadership and Plague's 100-per-stack carry the tempo and a plain
 *  raid is close to a token. Then every constant was scaled by 1/10 and
 *  Fortify was reintroduced, which lengthened everything again and softened
 *  the naive player's fall - a starting deck holding five Fortify heals a
 *  flailing player back over the subjugation gate often enough to have
 *  dropped `defeatShare` from 0.92 to 0.62.
 *
 *  Then raids became marches: declared on the turn they are played, landing
 *  at the start of the declarer's next turn, and cancellable by a counter
 *  down the same axis. Worlds lengthened by roughly a tenth (medians 81/75/92
 *  -> 89.5/82/91.5) and still resolve on every arm; total damage barely moved
 *  (1979 per world against 2041), so the delay costs tempo rather than
 *  output. The visible second-order effect is standoffs: two seats raiding
 *  each other now cancel, which is why `new-player-flailing` needed a longer
 *  horizon - see the comment on its `turnCap`. */
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
    // 150, matching competent-warpath. It was 80, and telegraphed raids
    // pushed the median world past that: with `medianDefeatTurn` sitting at
    // 78 against an 80-turn horizon, the share of naive players who fall was
    // measuring the cap rather than the question the scenario asks. The
    // question is whether a flailing player falls, not whether they fall
    // inside a fixed number of turns.
    turnCap: 150,
    expect: {
      subjugatedShare: [0.60, 0.90],      // measured 0.75
      medianFirstSubjugation: [34, 86],   // measured 57
      defeatShare: [0.79, 1],             // measured 0.94
      medianDefeatTurn: [54, 135],        // measured 90
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
      subjugatedShare: [0.64, 0.94],      // measured 0.79
      defeatShare: [0.83, 1],             // measured 0.98
      medianDefeatTurn: [55, 137],        // measured 91
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
      medianEndTurn: [54, 134],     // measured 89.5
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
      medianEndTurn: [49, 123],     // measured 82
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
      medianEndTurn: [55, 137],     // measured 91.5
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
