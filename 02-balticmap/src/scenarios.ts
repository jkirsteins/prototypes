import {
  DECK_ARMS, HUMAN_DECKS, HUMAN_POLICIES, WORLD_ARMS, aggregate, aggregateWorld,
  runGame, runWorldBatch, SIM_FACTION_IDS,
  type ArmStats, type GameSummary, type WorldStats, type WorldSummary,
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
 *  the test suite. All four bands were re-derived from scratch on 2026-07-29
 *  against the scaling-Raid rules and recorded in the 2026-07-29 scaling-might
 *  spec; the `// measured x` comments say what each band was widened from.
 *
 *  `flailing-full-deck` and `competent-full-deck` were re-measured again on
 *  2026-07-29 (see the design doc's "Correction: the default deck did not
 *  carry Favourable omens" section) after `buildDeck()` was made explicit and
 *  Favourable omens replaced Extended diplomacy in the default deck. That is
 *  the only reason these two bands moved a second time in one day - the
 *  other two scenarios use potato decks and an unchanged AI deck, so they did
 *  not move. */
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
      subjugatedShare: [0.85, 1],       // measured 1.00
      medianFirstSubjugation: [4, 11],  // measured 7.00
      defeatShare: [0.81, 1],           // measured 0.96
      medianDefeatTurn: [7, 20],        // measured 13.00
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
      subjugatedShare: [0.85, 1],       // measured 1.00
      medianFirstSubjugation: [8, 22],  // measured 14.50
      defeatShare: [0.66, 0.96],        // measured 0.81
      medianDefeatTurn: [14, 36],       // measured 23.50
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
      subjugatedShare: [0.45, 0.75],   // measured 0.60
      medianFirstSubjugation: [3, 9],  // measured 6.00
      defeatShare: [0.33, 0.63],       // measured 0.48
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
      subjugatedShare: [0.47, 0.77],   // measured 0.62
      medianFirstSubjugation: [3, 8],  // measured 5.00
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

// -- world scenarios --------------------------------------------------------

/** `Scenario` is human-shaped: a human policy, a human deck, and expectations
 *  about the subjugation of one privileged seat. A world run has none of those
 *  - 26 equal seats, no human - so it gets its own expectation type rather
 *  than widening `Expectation` with fields meaningless on the other side. */
export interface WorldExpectation {
  unifiedShare?: Band;
  medianEndTurn?: Band;
  capShare?: Band;
}

export interface WorldScenario {
  id: string;
  /** What this scenario is protecting, in one line. */
  description: string;
  arm: keyof typeof WORLD_ARMS & string;
  games: number;
  firstSeed: number;
  turnCap: number;
  expect: WorldExpectation;
}

/** Bands come from the 26-world run recorded in the 2026-07-29 scaling-might
 *  spec, then widened - turn medians to [0.6x, 1.5x], shares by +/-0.15. A
 *  miss means pacing moved, not that a seed was unlucky: every scenario here
 *  is fixed-seed and every world is paired across the two remaining arms
 *  (`conquest-flat` was a third, temporary arm, retired once its numbers
 *  were recorded).
 *
 *  `conquest-scaled` and `conquest-omens` isolate the subjugation loop with a
 *  narrow deck (Raid, Subjugate, Incorporate plus filler) and, on their own,
 *  overstated how fast a real game resolves: measured with the full ten-card
 *  default deck, worlds only resolved 50.0% of the time at a median of 237
 *  turns - essentially the pre-fix baseline - because that default deck did
 *  not carry Favourable omens at all (see the design doc's correction
 *  section). `full-deck` runs the actual DEFAULT_DECK every human player is
 *  offered, so the conquest arms above can no longer be the only evidence
 *  that the fix works in a game someone would actually play. */
export const WORLD_SCENARIOS: WorldScenario[] = [
  {
    id: "conquest-scaled",
    description:
      "The same decks with Raid scaling on border. Guards the claim that " +
      "the scaling alone, with no extra card, resolves more worlds sooner.",
    arm: "conquest-scaled",
    games: 26,
    firstSeed: 1,
    turnCap: 300,
    expect: {
      unifiedShare: [0.77, 1],      // measured 0.923
      medianEndTurn: [66, 165],     // measured 110.0
    },
  },
  {
    id: "conquest-omens",
    description:
      "Scaling plus Favourable omens - the shipped world. Guards the whole " +
      "change: a later edit that returns this to a stalemate fails here.",
    arm: "conquest-omens",
    games: 26,
    firstSeed: 1,
    turnCap: 300,
    expect: {
      unifiedShare: [0.81, 1],      // measured 0.962
      medianEndTurn: [42, 105],     // measured 70.0
    },
  },
  {
    id: "full-deck",
    description:
      "The actual default deck (DEFAULT_DECK, including Favourable omens) " +
      "played by all 26 seats, not the narrow conquest-loop decks above. " +
      "The conquest arms isolate the subjugation loop but overstate how " +
      "fast a real game resolves; this arm guards the deck shape a player " +
      "actually plays.",
    arm: "full-deck",
    games: 26,
    firstSeed: 1,
    turnCap: 300,
    expect: {
      unifiedShare: [0.77, 1],      // measured 0.923
      medianEndTurn: [68, 172],     // measured 114.5
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
  if (!(s.arm in WORLD_ARMS)) throw new Error(`${s.id}: unknown arm "${s.arm}"`);
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
