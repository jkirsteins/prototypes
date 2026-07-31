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
 *  Three bands moved again on 2026-07-30 when Found a settlement replaced the
 *  grow-crops slot in DEFAULT_DECK: `flailing-full-deck` and
 *  `competent-full-deck` (both of which play that deck) and the `full-deck`
 *  world arm. The card adds 1 to the lead anyone needs against a realm, and
 *  defence gains from that more than offence does - a defender has one bar to
 *  raise, while an attacker must clear a separate bar per rival - so the
 *  measured effect is much larger than "+1" sounds. It is the brake the card
 *  exists to be, so the bands follow the behaviour. The numbers are in the
 *  2026-07-30 settlement-card spec, and the pacing cost is real: worlds run
 *  60% longer. Note what did NOT move: the two conquest arms, whose fixed decks
 *  hold no settlement card, measured identically before and after (110.0 and
 *  70.0), which is the evidence that the grip rule changes nothing until
 *  something is actually settled.
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
      medianFirstSubjugation: [4, 11],  // measured 6.00
      // Both moved on 2026-07-31 by the dead-end-vassalage changeset, and they
      // are no longer independent numbers. A potato deck holds no Seeds of
      // revolt, so the first subjugation is also the last thing that happens:
      // the run ends on that play rather than dragging to an incorporation
      // some fifteen turns later. defeatShare is therefore the same 1.00 that
      // subjugatedShare is, and medianDefeatTurn is the same 6.00 that
      // medianFirstSubjugation is - so both bands are set to the band of the
      // metric they now shadow, and a future change that separates them again
      // will show up as a MISS rather than passing quietly.
      //
      // This scenario's premise is untouched: falling is still how a new
      // player discovers the deck, and they still fall in every game. What
      // they no longer do is spend seventy turns paying tribute with nothing
      // legal to play. `new-player-with-seeds` below is the other half - the
      // same player who spent one slot on the escape does not end here.
      defeatShare: [0.85, 1],           // measured 1.00
      medianDefeatTurn: [4, 11],        // measured 6.00
    },
  },
  {
    id: "new-player-with-seeds",
    description:
      "The same new player, one slot spent on Seeds of revolt. Guards what " +
      "that slot buys: they still fall, but the fall is survivable.",
    humanPolicy: "naive",
    humanDeck: "potatoes-plus-seeds",
    arm: "shipped",
    games: 52,
    firstSeed: 1,
    turnCap: 80,
    expect: {
      // Paired with new-player-potatoes: same policy, same enemies, same
      // seeds, one card different. Read the two together, because the pair is
      // the measurement and neither number means much alone:
      //
      //                    potatoes   plus seeds
      //   subjugatedShare      1.00         1.00   they fall just as often
      //   medianFirstSubj      6.00         6.00   and just as early
      //   defeatShare          1.00         0.81   one in five now survives
      //   medianDefeatTurn     6.00        19.50   and the rest live 13 turns
      //
      // One deck slot buys thirteen turns of play and a fifth of the runs
      // outright. If defeatShare here ever climbs to meet the 1.00 next door,
      // the dead-end ending has started firing on players who DID carry the
      // escape, and it has stopped being a decision - which is the whole
      // premise of putting Seeds of revolt in STARTING_KNOWN_CARDS.
      subjugatedShare: [0.85, 1],       // measured 1.00
      medianFirstSubjugation: [4, 11],  // measured 6.00
      defeatShare: [0.65, 0.92],        // measured 0.81
      medianDefeatTurn: [13, 30],       // measured 19.50
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
      medianFirstSubjugation: [8, 22],  // measured 10.00
      // Same cause as new-player-potatoes above, and the same collapse: with
      // no Seeds of revolt in the deck the first subjugation ends the run, so
      // these two now shadow the two above them. Note what this arm still
      // shows, which is the reason it exists: unarmed enemies take four turns
      // longer to get there (10.00 against 6.00).
      defeatShare: [0.85, 1],           // measured 1.00
      medianDefeatTurn: [8, 22],        // measured 10.00
    },
  },
  {
    id: "flailing-full-deck",
    description:
      "A player holding every card but with no plan, playing whatever is " +
      "leftmost. Outlasts the potato player by a wide margin - Revolt " +
      "keeps landing in hand - without being safe.",
    humanPolicy: "naive",
    humanDeck: "full",
    arm: "shipped",
    games: 52,
    firstSeed: 1,
    turnCap: 80,
    expect: {
      // All three moved together on 2026-07-30 by the realm-tempo changeset
      // (convex Raid plus the passive garrison Fortify). One cause, pulling in
      // two directions, and both directions are the intended mechanic:
      //
      // Early game got SAFER. Raid's yield is now triangular in border width,
      // so the AI prefers targets it has several lands against. A one-land
      // naive player is the narrowest target on the map, so nobody spends a
      // Raid on them for a long while - hence first subjugation at turn 40
      // rather than 26.
      //
      // Late game got DEADLIER. Once an AI realm is large it out-accumulates a
      // player who is not growing, so when the blow finally lands it lands
      // hard: defeat in 62% of games rather than 27%.
      //
      // Attribution measured by disabling the passive and re-running: convex
      // Raid alone accounts for most of it (defeatShare 0.46 of the 0.62), the
      // passive adds the rest. See the realm-tempo plan.
      subjugatedShare: [0.64, 0.94],     // measured 0.79
      medianFirstSubjugation: [24, 60],  // measured 40.00
      defeatShare: [0.47, 0.77],         // measured 0.62
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
      // Moved from [0.03, 0.30] (measured 0.15) by the 2026-07-30 realm-tempo
      // changeset. This is the band that changeset cost the most, and it is
      // worth stating plainly rather than quietly widening: a competent player
      // is now subjugated in 50% of games instead of 15%.
      //
      // The cause is the intended one. A competent human runs the same policy
      // the enemies do but holds one seat of 26, and the whole point of the
      // change was to let a large realm out-accumulate a smaller one. The AI
      // realms grow; a single seat does not. Measured by disabling the passive
      // and re-running, convex Raid alone accounts for 0.38 of the 0.50.
      //
      // Note this is subjugation, not defeat - vassalage is escapable, and this
      // scenario has never asserted a defeatShare. The floor stays well above
      // zero for the original reason: a world where skill makes a player
      // untouchable fails this scenario as surely as a hyper-aggressive one.
      //
      // If this proves too punishing in play, PASSIVE_PER_LANDS = 6 measured
      // 0.42 here while still resolving 98% of worlds - the softer trade.
      //
      // Widened again from [0.35, 0.65] (measured 0.50) on 2026-07-31, by the
      // tribute split. Pay tribute used to be one card whose track the payer
      // chose, and both the AI and a competent human always chose their lord's
      // WEAKER track - the defensive pick, which holds the lord's best lead
      // still. It is now two cards, one per track, and a vassal pays whichever
      // it drew. Every lord's grip therefore grows faster, realms consolidate
      // sooner, and the single seat feels it: 18 of 26 runs instead of 13.
      //
      // Recorded rather than quietly re-banded because it is the change's
      // intended cost, not a side effect: the choice being removed was the
      // player optimizing their own tax, and a vassal paying what is demanded
      // of them is the point. What did NOT move is world health - 91.7% of
      // worlds still resolve, and both tribute cards see play (3.2% / 3.5%).
      subjugatedShare: [0.35, 0.75],    // measured 0.69
      // Moved from [3, 8] (measured 5.00) after the reclaim-cut and
      // AI-policy-coverage changeset. A competent human runs the same policy
      // the enemies do, so it now plays the emergency Alliance and Assassinate
      // ruler steps that Alliance and Assassinate ruler never had, and defends
      // itself with them. Being subjugated later is the whole point of that
      // work, so the band follows the behaviour rather than the behaviour being
      // filed down to fit the band. This is the only band in the file that the
      // changeset moved permanently: this scenario's subjugatedShare and
      // flailing-full-deck's both left their bands mid-changeset and came back
      // inside them once every policy step had landed.
      // Moved again on 2026-07-30: poaching now costs half the incumbent's grip
      // on top of the base bar, so the enemies spend longer building before
      // they can take anyone - including the human. Being subjugated later is
      // again the intent of the work rather than a band being filed to fit.
      medianFirstSubjugation: [22, 55],  // measured 37.00
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
      // Both moved on 2026-07-30 by the realm-tempo changeset. The lower
      // unifiedShare bound is deliberately tightened from 0.77 to 0.85: every
      // world arm now resolves 100% of the time, and the whole point of the
      // change was that worlds stop hanging, so a drift back toward 77% must
      // fail this test rather than pass it quietly.
      unifiedShare: [0.85, 1],      // measured 1.000
      medianEndTurn: [37, 94],      // measured 62.5
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
      // Only the share bound tightens here, for the reason given on
      // conquest-scaled; medianEndTurn still sits inside its old band.
      unifiedShare: [0.85, 1],      // measured 1.000
      medianEndTurn: [42, 105],     // measured 56.0
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
      // The arm this changeset exists for. Before it, 13.5% of these worlds
      // never resolved inside 300 turns, measured over 52 seeds; now none hang,
      // and the settlement card's pacing cost recorded above is absorbed rather
      // than merely tolerated. The median comes down with it: 105.5 against the
      // ~150-turn target, so the game is now slightly SHORTER than intended
      // rather than dragging past it. That is the accepted side of the trade,
      // and the lever for lengthening it again is the win threshold in
      // `victoryRealmSize`, not the accumulation rules.
      unifiedShare: [0.85, 1],      // measured 1.000
      medianEndTurn: [63, 158],     // measured 105.5
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
