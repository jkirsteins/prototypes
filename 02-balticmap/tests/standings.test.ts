import { describe, it, expect } from "vitest";
import { scoreMovesOf, walkStandings, type WalkCtx } from "../src/standings";
import type { GameEvent, GameState } from "../src/game";
import {
  advance, chooseBuild, isHumanTurn, newGame, pickFaction, startGame,
} from "../src/game";
import { defenseOf, diseaseOn } from "../src/defense";
import { aiTakeTurn } from "../src/ai";
import {
  SIM_ADJACENCY, SIM_DEFENSE_MAX, SIM_ETHNICITIES, SIM_FACTION_IDS,
  SIM_SITE_CAPS, naiveHumanTurn, seededRng,
} from "../src/sim";
import { BASELINE_FACTION } from "./baseline-config";

const A = "selonians"; // playerId 2
const X = "selija"; // a polygon
const PLAYERS: Record<number, string> = { 1: "livs", 2: A, 3: "curonia" };

function ctx(over: Partial<WalkCtx> = {}): WalkCtx {
  return {
    factionOf: (playerId) => PLAYERS[playerId],
    defense: () => 600,
    diseaseOf: () => 0,
    ...over,
  };
}

function event(overrides: Partial<GameEvent>): GameEvent {
  return { turn: 1, playerId: 2, type: "damaged", ...overrides };
}

describe("scoreMovesOf", () => {
  it("damaged moves the polygon's defense down by amount", () => {
    const e = event({ cardId: "raid", targetFactionId: X, amount: 150 });
    expect(scoreMovesOf(e, ctx())).toEqual([
      { track: "defense", polygon: X, delta: -150 },
    ]);
  });

  it("plagued is the same track - the log distinguishes the vector, not the score", () => {
    const e = event({ type: "plagued", cardId: "plague", targetFactionId: X, amount: 200 });
    expect(scoreMovesOf(e, ctx())).toEqual([
      { track: "defense", polygon: X, delta: -200 },
    ]);
  });

  it("a zero-amount damaged or plagued moves nothing", () => {
    // Plague logs amount 0 where the stacks burned on a broken polygon - the
    // line still renders, but there is no before -> after to reconstruct.
    for (const type of ["damaged", "plagued"] as const) {
      const e = event({ type, targetFactionId: X, amount: 0 });
      expect(scoreMovesOf(e, ctx())).toEqual([]);
    }
  });

  it("healed moves the defense up", () => {
    const e = event({ type: "healed", cardId: "hillfort", targetFactionId: X, amount: 150 });
    expect(scoreMovesOf(e, ctx())).toEqual([
      { track: "defense", polygon: X, delta: 150 },
    ]);
  });

  it("disease-spread moves the ACTOR's stacks on the polygon", () => {
    const e = event({ type: "disease-spread", targetFactionId: X, amount: 1 });
    expect(scoreMovesOf(e, ctx())).toEqual([
      { track: "disease", polygon: X, owner: A, delta: 1 },
    ]);
  });

  it("winds-shifted carries the stacks the actor GAINED there", () => {
    const e = event({ type: "winds-shifted", targetFactionId: X, amount: 3 });
    expect(scoreMovesOf(e, ctx())).toEqual([
      { track: "disease", polygon: X, owner: A, delta: 3 },
    ]);
  });

  it("a disease event by an unknown seat resolves to nothing", () => {
    const e = event({ type: "disease-spread", playerId: 99, targetFactionId: X, amount: 1 });
    expect(scoreMovesOf(e, ctx())).toEqual([]);
  });

  it("an event missing its amount or target moves nothing", () => {
    expect(scoreMovesOf(event({ targetFactionId: X }), ctx())).toEqual([]);
    expect(scoreMovesOf(event({ amount: 100 }), ctx())).toEqual([]);
  });

  it("event types that move no walked score return no move", () => {
    for (const type of ["play", "tribute", "settled", "subjugated"] as const) {
      const e = event({ type, targetFactionId: X, amount: 1 });
      expect(scoreMovesOf(e, ctx()), type).toEqual([]);
    }
  });
});

describe("walkStandings", () => {
  it("chains two hits on one polygon backwards from the post-batch score", () => {
    const events: GameEvent[] = [
      event({ cardId: "raid", targetFactionId: X, amount: 100 }),
      event({ cardId: "raid", targetFactionId: X, amount: 50 }),
    ];
    const changes = walkStandings(events, ctx({ defense: () => 450 }));
    expect(changes[0]).toEqual([
      { polygon: X, track: "defense", before: 600, after: 500 },
    ]);
    expect(changes[1]).toEqual([
      { polygon: X, track: "defense", before: 500, after: 450 },
    ]);
  });

  it("a silent heal shifts the before of a later hit on the same polygon", () => {
    // A rival's heal is never a notice line, but the damaged line after it
    // must read from the healed score, not the pre-batch one.
    const events: GameEvent[] = [
      event({ playerId: 3, type: "healed", targetFactionId: X, amount: 100 }),
      event({ cardId: "raid", targetFactionId: X, amount: 150 }),
    ];
    const changes = walkStandings(events, ctx({ defense: () => 450 }));
    expect(changes[0]).toEqual([
      { polygon: X, track: "defense", before: 500, after: 600 },
    ]);
    expect(changes[1]).toEqual([
      { polygon: X, track: "defense", before: 600, after: 450 },
    ]);
  });

  it("defense and disease walk as independent keys on one polygon", () => {
    const events: GameEvent[] = [
      event({ type: "disease-spread", targetFactionId: X, amount: 1 }),
      event({ type: "plagued", targetFactionId: X, amount: 100 }),
    ];
    const changes = walkStandings(
      events,
      ctx({ defense: () => 500, diseaseOf: (_p, owner) => (owner === A ? 1 : 0) }),
    );
    expect(changes[0]).toEqual([
      { polygon: X, track: "disease", owner: A, before: 0, after: 1 },
    ]);
    expect(changes[1]).toEqual([
      { polygon: X, track: "defense", before: 600, after: 500 },
    ]);
  });

  it("two owners' stacks on one polygon are separate keys", () => {
    const events: GameEvent[] = [
      event({ type: "disease-spread", playerId: 2, targetFactionId: X, amount: 1 }),
      event({ type: "disease-spread", playerId: 3, targetFactionId: X, amount: 1 }),
    ];
    const changes = walkStandings(events, ctx({ diseaseOf: () => 1 }));
    expect(changes[0]).toEqual([
      { polygon: X, track: "disease", owner: A, before: 0, after: 1 },
    ]);
    expect(changes[1]).toEqual([
      { polygon: X, track: "disease", owner: "curonia", before: 0, after: 1 },
    ]);
  });

  it("walks every event, indexed in parallel, with empty slots for the quiet ones", () => {
    const events: GameEvent[] = [
      event({ type: "play", cardId: "raid", targetFactionId: X }),
      event({ cardId: "raid", targetFactionId: X, amount: 100 }),
    ];
    const changes = walkStandings(events, ctx({ defense: () => 500 }));
    expect(changes).toHaveLength(2);
    expect(changes[0]).toEqual([]);
    expect(changes[1]).toHaveLength(1);
  });
});

// The structural guard: scoreMovesOf is a hand-written mirror of the sites in
// game.ts that record `amount`. A new site added without recording its actual
// movement would silently drift every round summary. Rather than trust the
// unit tests above to cover every real shape, replay a seeded game and check
// the walk against the real defense and disease stores for every AI-round
// batch - the granularity buildRoundSummary uses in production.
describe("walkStandings matches the real stores across a seeded game", () => {
  it("holds for every AI-round batch", () => {
    const rng = seededRng(1);
    let state: GameState = pickFaction(
      chooseBuild(
        startGame(newGame(
          SIM_FACTION_IDS, SIM_ADJACENCY, SIM_ETHNICITIES, SIM_SITE_CAPS,
          SIM_DEFENSE_MAX,
        )),
        "warpath",
      ),
      BASELINE_FACTION,
      rng,
    );
    const defenseNow = (s: GameState, polygon: string): number =>
      defenseOf({ defense: s.defense, defenseMax: s.defenseMax }, polygon);
    let cursor = state.log.length;
    let preBatch = state;
    let batchesChecked = 0;
    let keysChecked = 0;

    const verifyBatch = (): void => {
      const batch = state.log.slice(cursor);
      if (batch.length === 0) return;
      const walkCtx: WalkCtx = {
        factionOf: (playerId) =>
          state.players.find((pl) => pl.id === playerId)?.factionId,
        defense: (polygon) => defenseNow(state, polygon),
        diseaseOf: (polygon, owner) => diseaseOn(state.disease, polygon, owner),
      };
      const changes = walkStandings(batch, walkCtx);
      // The first `before` per key must equal the PRE-batch store: that is
      // the assertion with teeth, since every recorded amount in between has
      // to sum to the store's actual movement.
      const firstBefore = new Map<string, { before: number; owner?: string; polygon: string; track: string }>();
      for (const perEvent of changes) {
        for (const c of perEvent) {
          const key = c.track === "defense"
            ? `defense|${c.polygon}`
            : `disease|${c.polygon}|${c.owner}`;
          if (!firstBefore.has(key)) firstBefore.set(key, c);
        }
      }
      batchesChecked++;
      for (const [key, c] of firstBefore) {
        keysChecked++;
        const truth = c.track === "defense"
          ? defenseNow(preBatch, c.polygon)
          : diseaseOn(preBatch.disease, c.polygon, c.owner ?? "");
        expect(c.before, `${key}, turn ${state.turn}`).toBe(truth);
      }
    };

    while (state.phase === "playing" && state.turn <= 120) {
      const isHuman = state.current === 0;
      const next = isHuman ? naiveHumanTurn(state, rng) : aiTakeTurn(state, rng);
      if (!next.playedThisTurn) {
        throw new Error(`stuck turn ${state.turn}`);
      }
      state = next.phase === "playing" ? advance(next, rng) : next;
      if (isHuman) {
        // The human's own action is revealed on its own, separately from the
        // AI round that follows - see afterHumanAction in main.ts.
        cursor = state.log.length;
        preBatch = state;
        continue;
      }
      if (state.phase !== "playing" || isHumanTurn(state)) {
        verifyBatch();
        cursor = state.log.length;
        preBatch = state;
      }
    }
    // Not vacuous: the game ran, and the walk reconciled real movement.
    expect(state.turn).toBeGreaterThan(1);
    expect(batchesChecked).toBeGreaterThan(0);
    expect(keysChecked).toBeGreaterThan(0);
  });
});
