import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import {
  DECK_ARMS, SIM_ADJACENCY, SIM_FACTION_IDS, WORLD_ARMS, aggregate,
  aggregateWorld, byFaction, median, naiveHumanTurn, pairedDelta, potatoDeck,
  runBatch, runGame, runWorld, runWorldBatch, seededRng, summarize,
  type GameSummary,
} from "../src/sim";
import { buildAiDeck, CARDS, DECK_SIZE } from "../src/cards";
import {
  chooseDeck, newGame, pickFaction, startGame, type GameState,
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
});

describe("deck arms", () => {
  it("gives the shipped arm the game's own deck builder", () => {
    expect(DECK_ARMS.shipped(seededRng(7), "x")).toEqual(buildAiDeck(seededRng(7)));
  });

  it("always arms the shipped deck with Subjugate and Raid", () => {
    for (let seed = 1; seed <= 50; seed++) {
      const deck = DECK_ARMS.shipped(seededRng(seed), "x");
      expect(deck).toContain("subjugate");
      expect(deck).toContain("raid");
    }
  });

  it("leaves the unarmed arm free of guaranteed aggression", () => {
    const armed = [1, 2, 3, 4, 5, 6, 7, 8].filter((seed) => {
      const deck = DECK_ARMS.unarmed(seededRng(seed), "x");
      return deck.includes("subjugate") && deck.includes("raid");
    });
    expect(armed.length).toBeLessThan(8);
  });

  it("keeps every arm at deck size and within maxPerDeck", () => {
    for (const [arm, build] of Object.entries(DECK_ARMS)) {
      for (let seed = 1; seed <= 20; seed++) {
        const deck = build(seededRng(seed), "x");
        expect(deck, arm).toHaveLength(DECK_SIZE);
        const counts = new Map<string, number>();
        for (const id of deck) counts.set(id, (counts.get(id) ?? 0) + 1);
        for (const [id, n] of counts) {
          const max = CARDS[id].maxPerDeck;
          if (max !== null) expect(n, `${arm}/${id}`).toBeLessThanOrEqual(max);
        }
      }
    }
  });

  it("consumes the same rng draws whatever is guaranteed, so arms pair up", () => {
    const draws = (guaranteed: string[]): number => {
      let n = 0;
      const rng = seededRng(3);
      buildAiDeck(() => {
        n += 1;
        return rng();
      }, guaranteed);
      return n;
    };
    expect(draws(["subjugate", "raid"])).toBe(draws([]));
  });
});

describe("naive human policy", () => {
  const playing = (): GameState =>
    pickFaction(
      chooseDeck(startGame(newGame(SIM_FACTION_IDS, SIM_ADJACENCY)), potatoDeck()),
      HUMAN,
      seededRng(1),
    );

  it("plays potatoes when nothing is forced", () => {
    const g = naiveHumanTurn(withHand(playing(), ["grow-crops"]), seededRng(1));
    expect(g.log.at(-1)).toMatchObject({ type: "play", cardId: "grow-crops" });
  });

  it("plays forced tribute ahead of potatoes", () => {
    const base = playing();
    const lord = SIM_FACTION_IDS[1];
    const vassal: GameState = {
      ...base,
      overlords: new Map([[HUMAN, lord]]),
    };
    const g = naiveHumanTurn(
      withHand(vassal, ["grow-crops", "pay-tribute"]),
      seededRng(1),
    );
    expect(g.log.at(-1)).toMatchObject({ type: "tribute", overlordFactionId: lord });
  });
});

describe("runGame", () => {
  it("reproduces an identical summary for an identical seed", () => {
    const opts = { seed: 42, humanFaction: HUMAN, turnCap: 60 };
    expect(runGame(opts)).toEqual(runGame(opts));
  });

  it("gives different arms different games", () => {
    const opts = { seed: 42, humanFaction: HUMAN, turnCap: 60 };
    const a = runGame({ ...opts, aiDeckFor: DECK_ARMS.shipped });
    const b = runGame({ ...opts, aiDeckFor: DECK_ARMS.unarmed });
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
    const games = runBatch({ games: 3, turnCap: 5, firstSeed: 10, arm: "shipped" });
    expect(games.map((g) => g.seed)).toEqual([10, 11, 12]);
    expect(games.map((g) => g.humanFaction)).toEqual(SIM_FACTION_IDS.slice(0, 3));
  });

  it("rejects an unknown arm", () => {
    expect(() =>
      runBatch({ games: 1, turnCap: 5, firstSeed: 1, arm: "nope" }),
    ).toThrow(/unknown arm/);
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

  it("counts releases and leaves a survivor's turns null", () => {
    const s = summarize(
      state(
        [
          { turn: 4, playerId: 2, type: "subjugated", targetFactionId: HUMAN, overlordFactionId: "a" },
          { turn: 8, playerId: 3, type: "released", targetFactionId: HUMAN, overlordFactionId: "a" },
        ],
        "playing",
      ),
      5,
      HUMAN,
    );
    expect(s.releasedCount).toBe(1);
    expect(s.defeatTurn).toBeNull();
    expect(s.outcome).toBe("cap");
  });
});

describe("aggregation", () => {
  const game = (over: Partial<GameSummary>): GameSummary => ({
    seed: 1, humanFaction: HUMAN, outcome: "defeat", firstSubjugatedTurn: 10,
    firstOverlord: "a", subjugatedCount: 1, releasedCount: 0, defeatTurn: 20,
    conqueror: "a", turns: 20, ...over,
  });

  it("takes the median of an even and an odd run", () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 2, 3])).toBe(2.5);
    expect(median([])).toBeNull();
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
  const deck = [
    "raid", "subjugate", "incorporate",
    ...Array.from({ length: 7 }, () => "grow-crops"),
  ];

  it("reproduces an identical summary for an identical seed", () => {
    const opts = { seed: 7, deck, raidRule: "border" as const, turnCap: 80 };
    expect(runWorld(opts)).toEqual(runWorld(opts));
  });

  it("reports a capped world rather than dropping it", () => {
    const w = runWorld({ seed: 1, deck, raidRule: "border", turnCap: 1 });
    expect(w.outcome).toBe("cap");
    expect(w.winner).toBeNull();
  });

  it("names the winner when the world resolves", () => {
    const w = runWorld({ seed: 3, deck, raidRule: "border", turnCap: 400 });
    if (w.outcome === "unified") {
      expect(w.winner).not.toBeNull();
      expect(SIM_FACTION_IDS).toContain(w.winner);
      expect(w.largestRealm).toBeGreaterThanOrEqual(
        Math.ceil(0.55 * SIM_FACTION_IDS.length),
      );
    } else {
      // A capped world is a legitimate result and the point of measuring;
      // it must still carry usable stall numbers.
      expect(w.turnsSinceLastIncorporation).toBeGreaterThanOrEqual(0);
    }
  });

  it("gives the flat rule a different world from the border rule", () => {
    const opts = { seed: 11, deck, turnCap: 200 };
    expect(runWorld({ ...opts, raidRule: "flat" }))
      .not.toEqual(runWorld({ ...opts, raidRule: "border" }));
  });
});

describe("world arms", () => {
  it("holds exactly DECK_SIZE cards in every arm", () => {
    for (const arm of Object.values(WORLD_ARMS)) {
      expect(arm.deck).toHaveLength(DECK_SIZE);
    }
  });

  it("differs from conquest-scaled only by the rule", () => {
    expect(WORLD_ARMS["conquest-flat"].deck)
      .toEqual(WORLD_ARMS["conquest-scaled"].deck);
    expect(WORLD_ARMS["conquest-flat"].raidRule).toBe("flat");
    expect(WORLD_ARMS["conquest-scaled"].raidRule).toBe("border");
  });

  it("differs from conquest-omens only by one card", () => {
    expect(WORLD_ARMS["conquest-omens"].raidRule).toBe("border");
    expect(WORLD_ARMS["conquest-omens"].deck).toContain("favourable-omens");
    expect(WORLD_ARMS["conquest-omens"].deck.filter((c) => c !== "grow-crops"))
      .toEqual([
        ...WORLD_ARMS["conquest-scaled"].deck.filter((c) => c !== "grow-crops"),
        "favourable-omens",
      ]);
  });

  it("keeps the flat rule confined to one place in the source", () => {
    // The spec's guarantee that the temporary raidRule flag cannot be *set*
    // anywhere by accident. game.ts legitimately contains "flat" three times
    // (the RaidRule type alias, its doc comment, and the one playCard
    // comparison), and sim.ts legitimately contains it once (the single arm
    // that selects it below). A third file showing up here is the signal
    // this test exists to catch. Deleted along with the flag in a later task.
    const dir = new URL("../src/", import.meta.url);
    const hits = readdirSync(dir)
      .filter((f) => f.endsWith(".ts"))
      .filter((f) => readFileSync(new URL(f, dir), "utf8").includes('"flat"'));
    expect(hits.sort()).toEqual(["game.ts", "sim.ts"]);
  });

  it("rejects an unknown arm by name", () => {
    expect(() => runWorldBatch({ games: 1, turnCap: 5, firstSeed: 1, arm: "nope" }))
      .toThrow(/unknown world arm/);
  });

  it("pairs arms seed for seed", () => {
    const opts = { games: 3, turnCap: 30, firstSeed: 1 };
    const a = runWorldBatch({ ...opts, arm: "conquest-flat" });
    const b = runWorldBatch({ ...opts, arm: "conquest-scaled" });
    expect(a.map((g) => g.seed)).toEqual(b.map((g) => g.seed));
  });

  it("aggregates end turns over resolved worlds only", () => {
    const stats = aggregateWorld("x", [
      { seed: 1, outcome: "unified", endTurn: 10, winner: "a", subjugations: 3,
        incorporations: 2, largestRealm: 15, turnsSinceLastIncorporation: 0 },
      { seed: 2, outcome: "cap", endTurn: 99, winner: null, subjugations: 1,
        incorporations: 0, largestRealm: 3, turnsSinceLastIncorporation: 99 },
    ]);
    expect(stats.unifiedShare).toBe(0.5);
    expect(stats.capShare).toBe(0.5);
    expect(stats.medianEndTurn).toBe(10); // the capped run contributes no end
  });
});
