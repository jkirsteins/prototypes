import { describe, it, expect } from "vitest";
import {
  BUILD_ARMS, HUMAN_POLICIES, SIM_ADJACENCY, SIM_DEFENSE_MAX, SIM_ETHNICITIES,
  SIM_FACTION_IDS, aggregate, aggregateWorld, byFaction, mean, median,
  naiveHumanTurn, pairedDelta, runBatch, runGame, runWorld, runWorldBatch,
  seededRng, summarize, type BuildArm, type GameSummary, type WorldSummary,
} from "../src/sim";
import { CARDS } from "../src/cards";
import {
  chooseBuild, newGame, pickFaction, startGame, victoryRealmSize,
  type GameState,
} from "../src/game";
import { factionAdjacencyOf } from "../src/adjacency";

const HUMAN = SIM_FACTION_IDS[0];

function withHand(g: GameState, hand: string[]): GameState {
  const p = { ...g.players[0], hand };
  return { ...g, players: g.players.map((pl, i) => (i === 0 ? p : pl)) };
}

describe("sim map", () => {
  it("plays on the shipped 26 lands", () => {
    expect(SIM_FACTION_IDS).toHaveLength(26);
    expect(Object.keys(SIM_ADJACENCY)).toHaveLength(26);
  });

  it("derives adjacency that is symmetric and self-free", () => {
    for (const [id, neighbors] of Object.entries(SIM_ADJACENCY)) {
      expect(neighbors).not.toContain(id);
      for (const n of neighbors) expect(SIM_ADJACENCY[n]).toContain(id);
    }
  });

  it("relabels regions to factions", () => {
    const data = {
      regions: [
        { id: "r1", faction: "f1", adjacent: ["r2"] },
        { id: "r2", faction: "f2", adjacent: ["r1"] },
      ],
    } as never;
    expect(factionAdjacencyOf(data)).toEqual({ f1: ["f2"], f2: ["f1"] });
  });

  it("derives every land's defense ceiling, 20 (Pilsotas) to 180 (E. Aukstaitija)", () => {
    const values = Object.values(SIM_DEFENSE_MAX);
    expect(values).toHaveLength(26);
    // population / 500 on the shipped map: a simulated Pilsotas must fall in
    // one doubled Raid while Eastern Aukstaitija shrugs it off.
    expect(Math.min(...values)).toBe(20);
    expect(Math.max(...values)).toBe(180);
  });
});

describe("build arms", () => {
  it("names the mixed field and the two uniform builds", () => {
    expect(BUILD_ARMS).toEqual(["mixed", "all-warpath", "all-pestilence"]);
  });

  it("rejects an unknown arm by name, in both batch runners", () => {
    expect(() =>
      runBatch({ games: 1, turnCap: 5, firstSeed: 1, arm: "nope" as BuildArm }),
    ).toThrow(/unknown arm/);
    expect(() =>
      runWorldBatch({ games: 1, turnCap: 5, firstSeed: 1, arm: "nope" as BuildArm }),
    ).toThrow(/unknown world arm/);
  });
});

describe("naive human policy", () => {
  const playing = (): GameState =>
    pickFaction(
      chooseBuild(
        startGame(newGame(SIM_FACTION_IDS, SIM_ADJACENCY, SIM_ETHNICITIES)),
        "warpath",
      ),
      HUMAN,
      seededRng(1),
    );

  it("plays the first playable card", () => {
    const g = naiveHumanTurn(withHand(playing(), ["grow-crops"]), seededRng(1));
    expect(g.log.at(-1)).toMatchObject({ type: "play", cardId: "grow-crops" });
  });

  it("aims a targeted card at the first legal target - flailing, not stalling", () => {
    const g = naiveHumanTurn(withHand(playing(), ["raid"]), seededRng(1));
    const play = g.log.find((e) => e.type === "play");
    expect(play).toMatchObject({ cardId: "raid" });
    expect(play?.targetFactionId).toBeDefined();
    // The raid landed: an untargeted or refused play would have no damage.
    expect(g.log.some((e) => e.type === "march-resolved")).toBe(true);
  });

  it("plays forced tribute ahead of anything else", () => {
    const base = playing();
    const lord = SIM_FACTION_IDS[1];
    const vassal: GameState = {
      ...base,
      overlords: new Map([[HUMAN, lord]]),
    };
    const g = naiveHumanTurn(
      withHand(vassal, ["grow-crops", "pay-military-tribute"]),
      seededRng(1),
    );
    expect(g.log.at(-1)).toMatchObject({
      type: "tribute", overlordFactionId: lord,
    });
  });

  it("is one of the named human policies, beside the competent one", () => {
    expect(HUMAN_POLICIES.naive).toBe(naiveHumanTurn);
    expect(Object.keys(HUMAN_POLICIES)).toEqual(["naive", "competent"]);
  });
});

describe("runGame", () => {
  it("reproduces an identical summary for an identical seed", () => {
    const opts = { seed: 42, humanFaction: HUMAN, turnCap: 40 };
    expect(runGame(opts)).toEqual(runGame(opts));
  });

  it("gives different arms different games", () => {
    // The arm only changes strategies, and strategies only bite through the
    // harvest pool - so this needs enough turns for harvests to start
    // shaping decks, which by turn 60 they reliably have.
    const opts = { seed: 42, humanFaction: HUMAN, turnCap: 60 };
    const a = runGame({ ...opts, arm: "all-warpath" });
    const b = runGame({ ...opts, arm: "all-pestilence" });
    expect(a).not.toEqual(b);
  });

  it("reports a capped game rather than dropping it", () => {
    const g = runGame({ seed: 1, humanFaction: HUMAN, turnCap: 1 });
    expect(g.outcome).toBe("cap");
    expect(g.firstSubjugatedTurn).toBeNull();
    expect(g.defeatTurn).toBeNull();
  });

  it("ends in defeat with a conqueror and an earlier subjugation", () => {
    const g = runGame({ seed: 3, humanFaction: HUMAN, turnCap: 150 });
    expect(g.outcome).toBe("defeat");
    expect(g.conqueror).not.toBeNull();
    expect(g.firstSubjugatedTurn).not.toBeNull();
    expect(g.firstSubjugatedTurn!).toBeLessThanOrEqual(g.defeatTurn!);
  });
});

describe("runBatch", () => {
  it("rotates the starting land and walks the seeds", () => {
    const games = runBatch({ games: 3, turnCap: 3, firstSeed: 10, arm: "mixed" });
    expect(games.map((g) => g.seed)).toEqual([10, 11, 12]);
    expect(games.map((g) => g.humanFaction)).toEqual(SIM_FACTION_IDS.slice(0, 3));
  });
});

describe("summarize", () => {
  const state = (log: GameState["log"], phase: GameState["phase"]): GameState => ({
    ...newGame(SIM_FACTION_IDS, SIM_ADJACENCY),
    phase,
    turn: 9,
    log,
  });

  it("reads the first subjugation, the poaches and the defeat", () => {
    const s = summarize(
      state(
        [
          { turn: 4, playerId: 2, type: "subjugated", targetFactionId: HUMAN, overlordFactionId: "a" },
          { turn: 6, playerId: 3, type: "subjugated", targetFactionId: "other", overlordFactionId: "b" },
          { turn: 7, playerId: 3, type: "subjugated", targetFactionId: HUMAN, overlordFactionId: "b" },
          { turn: 9, playerId: 3, type: "defeat", targetFactionId: HUMAN, overlordFactionId: "b" },
        ],
        "defeat",
      ),
      5,
      HUMAN,
    );
    expect(s).toMatchObject({
      seed: 5,
      outcome: "defeat",
      firstSubjugatedTurn: 4,
      firstOverlord: "a",
      subjugatedCount: 2,
      defeatTurn: 9,
      conqueror: "b",
    });
  });

  it("counts a rival's unification as the human's defeat", () => {
    // A rival unifying the map sets phase to "defeat" but logs a "unified"
    // event rather than a "defeat" one, since the ending's target is the map,
    // not the human. From the human's seat it is still a loss.
    const s = summarize(
      state(
        [
          { turn: 4, playerId: 2, type: "subjugated", targetFactionId: HUMAN, overlordFactionId: "a" },
          { turn: 12, playerId: 3, type: "unified", overlordFactionId: "b" },
        ],
        "defeat",
      ),
      5,
      HUMAN,
    );
    expect(s).toMatchObject({
      outcome: "defeat",
      defeatTurn: 12,
      conqueror: "b",
    });
  });

  it("counts releases and independences apart - freed BY a fall versus freed itself", () => {
    const s = summarize(
      state(
        [
          { turn: 4, playerId: 2, type: "subjugated", targetFactionId: HUMAN, overlordFactionId: "a" },
          { turn: 8, playerId: 3, type: "released", targetFactionId: HUMAN, overlordFactionId: "a" },
          { turn: 10, playerId: 2, type: "subjugated", targetFactionId: HUMAN, overlordFactionId: "b" },
          { turn: 14, playerId: 1, type: "independence", targetFactionId: HUMAN, overlordFactionId: "b" },
        ],
        "playing",
      ),
      5,
      HUMAN,
    );
    expect(s.releasedCount).toBe(1);
    expect(s.independenceCount).toBe(1);
    expect(s.defeatTurn).toBeNull();
    expect(s.outcome).toBe("cap");
  });
});

describe("summarize finalRealmSize", () => {
  it("counts every land under the human, not just direct holdings", () => {
    const base = startGame(newGame(SIM_FACTION_IDS, SIM_ADJACENCY, SIM_ETHNICITIES));
    const state: GameState = {
      ...base,
      overlords: new Map([[SIM_FACTION_IDS[1], HUMAN]]),
      incorporated: { [SIM_FACTION_IDS[2]]: SIM_FACTION_IDS[1] },
    };
    // The human, their vassal, and the land that vassal annexed: three.
    expect(summarize(state, 1, HUMAN).finalRealmSize).toBe(3);
  });

  it("scores zero once the human has been incorporated", () => {
    const base = startGame(newGame(SIM_FACTION_IDS, SIM_ADJACENCY, SIM_ETHNICITIES));
    const state: GameState = {
      ...base,
      incorporated: { [HUMAN]: SIM_FACTION_IDS[1] },
    };
    expect(summarize(state, 1, HUMAN).finalRealmSize).toBe(0);
  });
});

describe("aggregation", () => {
  const game = (over: Partial<GameSummary>): GameSummary => ({
    seed: 1, humanFaction: HUMAN, outcome: "defeat", firstSubjugatedTurn: 10,
    firstOverlord: "a", subjugatedCount: 1, releasedCount: 0,
    independenceCount: 0, defeatTurn: 20, conqueror: "a", turns: 20,
    finalRealmSize: 10, ...over,
  });

  it("takes the median of an even and an odd run", () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 2, 3])).toBe(2.5);
    expect(median([])).toBeNull();
    expect(mean([2, 4])).toBe(3);
    expect(mean([])).toBeNull();
  });

  it("counts the never-subjugated instead of dropping them", () => {
    const stats = aggregate("x", [
      game({ firstSubjugatedTurn: 10 }),
      game({ firstSubjugatedTurn: 20 }),
      game({ firstSubjugatedTurn: null, defeatTurn: null, outcome: "cap" }),
    ]);
    expect(stats.neverSubjugated).toBe(1);
    expect(stats.subjugatedShare).toBeCloseTo(2 / 3);
    expect(stats.medianFirstSubjugation).toBe(15);
    expect(stats.capShare).toBeCloseTo(1 / 3);
  });

  it("means the escape counters, independence included", () => {
    const stats = aggregate("x", [
      game({ releasedCount: 1, independenceCount: 2 }),
      game({ releasedCount: 0, independenceCount: 0 }),
    ]);
    expect(stats.meanReleases).toBe(0.5);
    expect(stats.meanIndependences).toBe(1);
  });

  it("pairs on seed and land, and flags one-sided subjugations", () => {
    const ref = [
      game({ seed: 1, firstSubjugatedTurn: 10 }),
      game({ seed: 2, firstSubjugatedTurn: null }),
    ];
    const arm = [
      game({ seed: 1, firstSubjugatedTurn: 6 }),
      game({ seed: 2, firstSubjugatedTurn: 8 }),
    ];
    const d = pairedDelta(arm, ref);
    expect(d.meanTurnDelta).toBe(-4);
    expect(d.bothSubjugated).toBe(1);
    expect(d.onlyThisArm).toBe(1);
    expect(d.onlyReference).toBe(0);
  });

  it("sorts lands fastest-to-fall, survivors last", () => {
    const lands = byFaction([
      game({ humanFaction: "slow", firstSubjugatedTurn: 30 }),
      game({ humanFaction: "fast", firstSubjugatedTurn: 3 }),
      game({ humanFaction: "never", firstSubjugatedTurn: null }),
    ]);
    expect(lands.map((l) => l.factionId)).toEqual(["fast", "slow", "never"]);
    expect(lands[2].subjugatedShare).toBe(0);
  });
});

describe("runWorld", () => {
  it("reproduces an identical summary for an identical seed", () => {
    const opts = { seed: 7, arm: "mixed" as const, turnCap: 30 };
    expect(runWorld(opts)).toEqual(runWorld(opts));
  });

  it("reports a capped world rather than dropping it", () => {
    const w = runWorld({ seed: 1, arm: "mixed", turnCap: 1 });
    expect(w.outcome).toBe("cap");
    expect(w.winner).toBeNull();
    expect(w.turnsSinceLastIncorporation).toBeGreaterThanOrEqual(0);
  });

  it("measures the defense economy: damage dealt, harvest picks, tenures", () => {
    const w = runWorld({ seed: 3, arm: "mixed", turnCap: 60 });
    // 26 seats of five-Raid decks draw blood immediately.
    expect(w.damageDealt).toBeGreaterThan(0);
    expect(w.subjugations).toBeGreaterThan(0);
    expect(w.playsByCard.raid).toBeGreaterThan(0);
    // Harvests are the discovery route now - by turn 60 the growing decks
    // have picked, and every pick names a real card.
    expect(Object.keys(w.harvestPicksByCard).length).toBeGreaterThan(0);
    for (const id of Object.keys(w.harvestPicksByCard)) {
      expect(CARDS[id]).toBeDefined();
    }
    expect(w.harvestsSkipped).toBeGreaterThanOrEqual(0);
    for (const tenure of w.vassalTenures) {
      expect(tenure).toBeGreaterThanOrEqual(0);
    }
    expect(w.defenseHealed).toBeGreaterThanOrEqual(0);
    expect(w.independences).toBeGreaterThanOrEqual(0);
  });

  it("names the winner when the world resolves", () => {
    const w = runWorld({ seed: 3, arm: "mixed", turnCap: 300 });
    if (w.outcome === "unified") {
      expect(w.winner).not.toBeNull();
      expect(SIM_FACTION_IDS).toContain(w.winner);
      expect(w.largestRealm).toBeGreaterThanOrEqual(
        victoryRealmSize(SIM_FACTION_IDS.length),
      );
    } else {
      // A capped world is a legitimate result and the point of measuring;
      // it must still carry usable stall numbers.
      expect(w.turnsSinceLastIncorporation).toBeGreaterThanOrEqual(0);
    }
  });
});

describe("aggregateWorld", () => {
  const world = (over: Partial<WorldSummary>): WorldSummary => ({
    seed: 1, outcome: "unified", endTurn: 10, winner: "a", subjugations: 3,
    incorporations: 2, independences: 0, largestRealm: 15,
    turnsSinceLastIncorporation: 0, playsByCard: {}, harvestPicksByCard: {},
    harvestsSkipped: 0, targetedPlays: 0, firstLegalTargetPlays: 0,
    preventedAssassinations: 0, untestedGuards: 0, damageDealt: 0,
    defenseHealed: 0, vassalTenures: [], settlementsFounded: 0, ...over,
  });

  it("aggregates end turns over resolved worlds only", () => {
    const stats = aggregateWorld("x", [
      world({ seed: 1, outcome: "unified", endTurn: 10 }),
      world({
        seed: 2, outcome: "cap", endTurn: 99, winner: null,
        turnsSinceLastIncorporation: 99,
      }),
    ]);
    expect(stats.unifiedShare).toBe(0.5);
    expect(stats.capShare).toBe(0.5);
    expect(stats.medianEndTurn).toBe(10); // the capped run contributes no end
    expect(stats.medianStallTurns).toBe(99);
  });

  it("pools harvest picks into a play-share table of the growing deck", () => {
    const stats = aggregateWorld("x", [
      world({ harvestPicksByCard: { subjugate: 3, hillfort: 1 } }),
      world({ harvestPicksByCard: { subjugate: 1, plague: 3 } }),
    ]);
    expect(stats.harvestPickShareByCard.subjugate).toBeCloseTo(0.5);
    expect(stats.harvestPickShareByCard.hillfort).toBeCloseTo(0.125);
    expect(stats.harvestPickShareByCard.plague).toBeCloseTo(0.375);
    const total = Object.values(stats.harvestPickShareByCard)
      .reduce((a, b) => a + b, 0);
    expect(total).toBeCloseTo(1, 10);
  });

  it("means the two sides of the defense economy and pools tenures", () => {
    const stats = aggregateWorld("x", [
      world({ damageDealt: 1000, defenseHealed: 100, vassalTenures: [2, 4] }),
      world({ damageDealt: 3000, defenseHealed: 300, vassalTenures: [6] }),
    ]);
    expect(stats.meanDamageDealt).toBe(2000);
    expect(stats.meanDefenseHealed).toBe(200);
    expect(stats.medianVassalTenure).toBe(4);
    expect(stats.meanVassalTenure).toBe(4);
    expect(stats.meanIndependences).toBe(0);
  });
});
