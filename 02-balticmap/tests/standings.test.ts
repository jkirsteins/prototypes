import { describe, it, expect } from "vitest";
import { leadMovesOf, walkStandings, type WalkCtx } from "../src/standings";
import type { GameEvent } from "../src/game";
import {
  pickFaction, chooseDeck, startGame, newGame, advance, isHumanTurn,
  type GameState,
} from "../src/game";
import { aiTakeTurn } from "../src/ai";
import { leadsOf } from "../src/relations";
import {
  SIM_FACTION_IDS, SIM_ADJACENCY, SIM_ETHNICITIES, seededRng, potatoDeck,
  naiveHumanTurn, DECK_ARMS,
} from "../src/sim";
import { BASELINE_SEEDS, BASELINE_FACTION, BASELINE_TURN_CAP } from "./baseline-config";

// A minimal ctx: leadMovesOf never reads `leads`, only `humanFactionId` and
// `factionOf`, so these unit tests can stub it out.
function ctx(humanFactionId: string, playerFactions: Record<number, string>): WalkCtx {
  return {
    humanFactionId,
    factionOf: (playerId) => playerFactions[playerId],
    leads: () => ({ might: 0, status: 0 }),
  };
}

const H = "livs"; // playerId 1
const RIVAL = "selonians"; // playerId 2
const THIRD = "curonia"; // playerId 3
const PLAYERS = { 1: H, 2: RIVAL, 3: THIRD };

function playEvent(overrides: Partial<GameEvent>): GameEvent {
  return { turn: 1, playerId: 2, type: "play", ...overrides };
}

describe("leadMovesOf", () => {
  it("raid by the human adds to the target's track", () => {
    const e = playEvent({
      playerId: 1, cardId: "raid", targetFactionId: RIVAL, amount: 3, track: "might",
    });
    expect(leadMovesOf(e, ctx(H, PLAYERS))).toEqual([
      { kind: "add", factionId: RIVAL, track: "might", delta: 3 },
    ]);
  });

  it("raid against the human adds to the actor's track, sign-flipped", () => {
    const e = playEvent({
      playerId: 2, cardId: "raid", targetFactionId: H, amount: 3, track: "might",
    });
    expect(leadMovesOf(e, ctx(H, PLAYERS))).toEqual([
      { kind: "add", factionId: RIVAL, track: "might", delta: -3 },
    ]);
  });

  it("raid between two non-human factions moves nothing for the human", () => {
    const e = playEvent({
      playerId: 2, cardId: "raid", targetFactionId: THIRD, amount: 3, track: "might",
    });
    expect(leadMovesOf(e, ctx(H, PLAYERS))).toEqual([]);
  });

  it("shrewd marriage behaves like raid, on the status track", () => {
    const e = playEvent({
      playerId: 2, cardId: "shrewd-marriage", targetFactionId: H, amount: 1, track: "status",
    });
    expect(leadMovesOf(e, ctx(H, PLAYERS))).toEqual([
      { kind: "add", factionId: RIVAL, track: "status", delta: -1 },
    ]);
  });

  it("a third party's fortify still resolves - it is one pair, the actor against the human", () => {
    const e = playEvent({ playerId: 2, cardId: "fortify", amount: 1, track: "might" });
    expect(leadMovesOf(e, ctx(H, PLAYERS))).toEqual([
      { kind: "add", factionId: RIVAL, track: "might", delta: -1 },
    ]);
  });

  it("a human-authored fortify returns no move - it never reaches this walk in production", () => {
    const e = playEvent({ playerId: 1, cardId: "fortify", amount: 1, track: "might" });
    expect(leadMovesOf(e, ctx(H, PLAYERS))).toEqual([]);
  });

  it("a landed assassination by the human levels the target's status to 0", () => {
    const e = playEvent({
      playerId: 1, cardId: "assassinate-ruler", targetFactionId: RIVAL, amount: 2,
    });
    expect(leadMovesOf(e, ctx(H, PLAYERS))).toEqual([
      { kind: "set", factionId: RIVAL, track: "status", from: 2 },
    ]);
  });

  it("a landed assassination against the human levels it from the human's own perspective", () => {
    const e = playEvent({
      playerId: 2, cardId: "assassinate-ruler", targetFactionId: H, amount: 2,
    });
    expect(leadMovesOf(e, ctx(H, PLAYERS))).toEqual([
      { kind: "set", factionId: RIVAL, track: "status", from: -2 },
    ]);
  });

  it("a prevented assassination moves nothing - it carries no amount", () => {
    const e = playEvent({
      playerId: 2, cardId: "assassinate-ruler", targetFactionId: H, prevented: true,
    });
    expect(leadMovesOf(e, ctx(H, PLAYERS))).toEqual([]);
  });

  it("tribute paid by the human adds to the lord's track", () => {
    const e: GameEvent = {
      turn: 1, playerId: 1, type: "tribute",
      targetFactionId: H, overlordFactionId: RIVAL, amount: 1, track: "might",
    };
    expect(leadMovesOf(e, ctx(H, PLAYERS))).toEqual([
      { kind: "add", factionId: RIVAL, track: "might", delta: -1 },
    ]);
  });

  it("tribute paid to the human adds to the payer's track", () => {
    const e: GameEvent = {
      turn: 1, playerId: 1, type: "tribute",
      targetFactionId: RIVAL, overlordFactionId: H, amount: 1, track: "status",
    };
    expect(leadMovesOf(e, ctx(H, PLAYERS))).toEqual([
      { kind: "add", factionId: RIVAL, track: "status", delta: 1 },
    ]);
  });

  it("a poach that takes the human's vassal grants +1/+1 over the poacher", () => {
    const e: GameEvent = {
      turn: 1, playerId: 2, type: "subjugated",
      targetFactionId: THIRD, overlordFactionId: RIVAL, formerOverlordFactionId: H,
    };
    expect(leadMovesOf(e, ctx(H, PLAYERS))).toEqual(
      expect.arrayContaining([
        { kind: "add", factionId: THIRD, track: "might", delta: -1 },
        { kind: "add", factionId: THIRD, track: "status", delta: -1 },
      ]),
    );
  });

  it("a poach that takes the human from a rival grants +1/+1 over the ex-lord", () => {
    const e: GameEvent = {
      turn: 1, playerId: 2, type: "subjugated",
      targetFactionId: H, overlordFactionId: RIVAL, formerOverlordFactionId: THIRD,
    };
    expect(leadMovesOf(e, ctx(H, PLAYERS))).toEqual(
      expect.arrayContaining([
        { kind: "add", factionId: THIRD, track: "might", delta: 1 },
        { kind: "add", factionId: THIRD, track: "status", delta: 1 },
      ]),
    );
  });

  it("a rival casting off the human as overlord costs the human -mult/-mult against them", () => {
    const e: GameEvent = {
      turn: 1, playerId: 2, type: "reclaimed", cardId: "revolt",
      targetFactionId: RIVAL, overlordFactionId: H, amount: 1,
    };
    expect(leadMovesOf(e, ctx(H, PLAYERS))).toEqual(
      expect.arrayContaining([
        { kind: "add", factionId: RIVAL, track: "might", delta: -1 },
        { kind: "add", factionId: RIVAL, track: "status", delta: -1 },
      ]),
    );
  });

  it("the human casting off a rival overlord grants the human +mult/+mult over them", () => {
    const e: GameEvent = {
      turn: 1, playerId: 1, type: "reclaimed", cardId: "revolt",
      targetFactionId: H, overlordFactionId: RIVAL, amount: 2,
    };
    // game.ts's revolt effect is bumpMightBy(relations, rebel, exLord, mult) -
    // the rebel (the human, here) gains over the ex-lord, so the human's OWN
    // lead over RIVAL rises.
    expect(leadMovesOf(e, ctx(H, PLAYERS))).toEqual(
      expect.arrayContaining([
        { kind: "add", factionId: RIVAL, track: "might", delta: 2 },
        { kind: "add", factionId: RIVAL, track: "status", delta: 2 },
      ]),
    );
  });

  it("a rival's garrison adds to the actor's might track, sign-flipped", () => {
    const e: GameEvent = {
      turn: 1, playerId: 2, type: "garrisoned", targetFactionId: RIVAL, amount: 2,
    };
    expect(leadMovesOf(e, ctx(H, PLAYERS))).toEqual([
      { kind: "add", factionId: RIVAL, track: "might", delta: -2 },
    ]);
  });

  it("the human's own garrison returns no move here - walkStandings fans it out", () => {
    const e: GameEvent = {
      turn: 1, playerId: 1, type: "garrisoned", targetFactionId: H, amount: 2,
    };
    expect(leadMovesOf(e, ctx(H, PLAYERS))).toEqual([]);
  });

  it("an event type that never moves a relation returns no move", () => {
    const e: GameEvent = { turn: 1, playerId: 1, type: "settled", targetFactionId: H };
    expect(leadMovesOf(e, ctx(H, PLAYERS))).toEqual([]);
  });
});

describe("walkStandings", () => {
  function walkCtx(leads: Record<string, { might: number; status: number }>): WalkCtx {
    return {
      humanFactionId: H,
      factionOf: (playerId) => (PLAYERS as Record<number, string>)[playerId],
      leads: (f) => leads[f] ?? { might: 0, status: 0 },
    };
  }

  it("chains two events against the same pair in one round", () => {
    const events: GameEvent[] = [
      playEvent({ playerId: 2, cardId: "raid", targetFactionId: H, amount: 2, track: "might" }),
      playEvent({
        turn: 2, playerId: 2, cardId: "shrewd-marriage", targetFactionId: H,
        amount: 1, track: "status",
      }),
    ];
    // post-batch: rival leads Might by 2, Status by 1 (both purely from this batch)
    const changes = walkStandings(events, walkCtx({ [RIVAL]: { might: -2, status: -1 } }));
    expect(changes[0]).toEqual([
      { factionId: RIVAL, track: "might", before: 0, after: -2 },
    ]);
    expect(changes[1]).toEqual([
      { factionId: RIVAL, track: "status", before: 0, after: -1 },
    ]);
  });

  it("a silent fortify shifts the before of a later raid from the same actor", () => {
    const events: GameEvent[] = [
      playEvent({ playerId: 2, cardId: "fortify", amount: 1, track: "might" }),
      playEvent({
        turn: 2, playerId: 2, cardId: "raid", targetFactionId: H, amount: 3, track: "might",
      }),
    ];
    // post-batch might lead vs rival: -1 (fortify) + -3 (raid) = -4
    const changes = walkStandings(events, walkCtx({ [RIVAL]: { might: -4, status: 0 } }));
    // the raid line (the only notice-worthy one) must read from -1, not 0 -
    // the fortify already moved the "before" even though it produces no line
    expect(changes[1]).toEqual([
      { factionId: RIVAL, track: "might", before: -1, after: -4 },
    ]);
  });

  it("the human's own trailing garrison fans out to every faction this batch already mentions", () => {
    const events: GameEvent[] = [
      playEvent({ playerId: 2, cardId: "raid", targetFactionId: H, amount: 2, track: "might" }),
      { turn: 1, playerId: 1, type: "garrisoned", targetFactionId: H, amount: 1 },
    ];
    // post-batch: -2 (raid) + 1 (garrison) = -1
    const changes = walkStandings(events, walkCtx({ [RIVAL]: { might: -1, status: 0 } }));
    expect(changes[0]).toEqual([
      { factionId: RIVAL, track: "might", before: 0, after: -2 },
    ]);
    expect(changes[1]).toEqual([
      { factionId: RIVAL, track: "might", before: -2, after: -1 },
    ]);
  });

  it("a faction with no event in the batch is untouched", () => {
    const events: GameEvent[] = [
      playEvent({ playerId: 2, cardId: "raid", targetFactionId: H, amount: 2, track: "might" }),
    ];
    const changes = walkStandings(events, walkCtx({ [RIVAL]: { might: -2, status: 0 } }));
    expect(changes).toHaveLength(1);
    expect(changes[0]).toHaveLength(1);
  });
});

// The structural guard: leadMovesOf/walkStandings is a hand-written mirror of
// the eight relation-bump sites in game.ts. A ninth site added later without
// recording its amount would silently drift every round summary. Rather than
// trust the unit tests above to have covered every real shape, replay actual
// seeded games and check the walk against the real relations for every
// AI-round batch - exactly the granularity buildRoundSummary uses in
// production (see notices.ts): the fresh events between one human turn
// finishing and the next one starting.
describe("walkStandings matches real relations across seeded games", () => {
  it("holds for every AI-round batch, across the baseline seeds", () => {
    for (const seed of BASELINE_SEEDS) {
      const rng = seededRng(seed);
      let state: GameState = pickFaction(
        chooseDeck(
          startGame(newGame(SIM_FACTION_IDS, SIM_ADJACENCY, SIM_ETHNICITIES)),
          potatoDeck(),
        ),
        BASELINE_FACTION,
        rng,
        DECK_ARMS.shipped,
      );
      const humanFactionId = state.players[0].factionId;
      let cursor = state.log.length;
      let preBatchState = state;

      const verifyBatch = (): void => {
        const batch = state.log.slice(cursor);
        if (batch.length === 0) return;
        const ctxForBatch: WalkCtx = {
          humanFactionId,
          factionOf: (playerId) => state.players.find((pl) => pl.id === playerId)?.factionId,
          leads: (f) => leadsOf(state.relations, humanFactionId, f),
        };
        const changes = walkStandings(batch, ctxForBatch);
        const firstBefore = new Map<string, number>();
        for (const perEvent of changes) {
          for (const c of perEvent) {
            const key = `${c.factionId}:${c.track}`;
            if (!firstBefore.has(key)) firstBefore.set(key, c.before);
          }
        }
        for (const [key, before] of firstBefore) {
          const [factionId, track] = key.split(":") as [string, "might" | "status"];
          const groundTruth =
            leadsOf(preBatchState.relations, humanFactionId, factionId)[track];
          // `|| 0` normalizes -0 to 0: a lead of zero from either direction is
          // the same standing, and Object.is (what .toBe uses) disagrees.
          expect(before || 0, `seed ${seed}, turn ${state.turn}, ${key}`)
            .toBe(groundTruth || 0);
        }
      };

      while (state.phase === "playing" && state.turn <= BASELINE_TURN_CAP) {
        const actor = state.players[state.current].factionId;
        const isHuman = state.current === 0;
        const next = isHuman ? naiveHumanTurn(state, rng) : aiTakeTurn(state, rng);
        if (!next.playedThisTurn) {
          throw new Error(
            `stuck turn: seed ${seed}, turn ${state.turn}, actor ${actor}`,
          );
        }
        state = next.phase === "playing" ? advance(next, rng) : next;

        if (isHuman) {
          // The human's own action is revealed on its own, separately from
          // the AI round that follows - see afterHumanAction in main.ts.
          cursor = state.log.length;
          preBatchState = state;
          continue;
        }
        if (state.phase !== "playing" || isHumanTurn(state)) {
          verifyBatch();
          cursor = state.log.length;
          preBatchState = state;
        }
      }
    }
  });
});
