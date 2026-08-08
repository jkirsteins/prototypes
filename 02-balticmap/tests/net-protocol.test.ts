import { describe, it, expect } from "vitest";
import {
  newGame, startGame, chooseDeck, pickFaction, advance, type GameState,
} from "../src/game";
import { aiTakeTurn } from "../src/ai";
import { buildDeck, type Rng } from "../src/cards";
import { seededRng } from "../src/rng";
import {
  applyNetAction, applyUpdate, buildUpdate, guestPhaseView, seatOfFaction,
  validateAction, wirePair, type NetMessage,
} from "../src/net-protocol";

const FACTIONS = ["alpha", "beta", "gamma", "delta"];

function freshGame(rng: Rng): GameState {
  let g = startGame(newGame(FACTIONS));
  g = chooseDeck(g, buildDeck());
  return pickFaction(g, "alpha", rng);
}

describe("action validation", () => {
  it("accepts the current seat's play of the card actually at that index", () => {
    const rng = seededRng(3);
    const g = freshGame(rng); // current = 0 (alpha)
    const cardId = g.players[0].hand[0];
    expect(validateAction(g, 0, g.turn, {
      type: "play", cardIndex: 0, cardId,
    })).toBeNull();
  });

  it("rejects an out-of-turn action", () => {
    const rng = seededRng(3);
    const g = freshGame(rng);
    const seat = seatOfFaction(g, "gamma");
    const cardId = g.players[seat].hand[0];
    expect(validateAction(g, seat, g.turn, {
      type: "play", cardIndex: 0, cardId,
    })).toMatch(/turn/);
  });

  it("rejects a stale turn stamp", () => {
    const rng = seededRng(3);
    const g = freshGame(rng);
    const cardId = g.players[0].hand[0];
    expect(validateAction(g, 0, g.turn - 1, {
      type: "play", cardIndex: 0, cardId,
    })).toMatch(/turn/);
  });

  it("rejects a cardId that disagrees with cardIndex", () => {
    const rng = seededRng(3);
    const g = freshGame(rng);
    expect(validateAction(g, 0, g.turn, {
      type: "play", cardIndex: 0, cardId: "not-the-card-at-0",
    })).toMatch(/hand/);
  });
});

describe("updates", () => {
  it("carries the state without the log and the log tail separately, and the guest reassembles both", () => {
    const rng = seededRng(9);
    let host = freshGame(rng);
    // Guest baseline: the start snapshot (here, the same immutable
    // state value - the engine never mutates in place).
    let guest: GameState | null = host;
    let sentLog = host.log.length;
    // A few AI turns move the host on; the guest catches up per update.
    for (let i = 0; i < 6 && host.phase === "playing"; i++) {
      host = advance(aiTakeTurn(host, rng), rng);
      const msg = buildUpdate(host, sentLog);
      expect(msg.type).toBe("update");
      if (msg.type === "update") {
        expect(msg.state.log).toEqual([]); // the log never re-crosses the wire
        guest = applyUpdate(guest, msg);
        sentLog = host.log.length;
      }
    }
    expect(guest).toEqual(host);
  });
});

describe("applyNetAction", () => {
  it("routes end-turn to endTurn only under unlimited rules (standard refuses)", () => {
    const rng = seededRng(5);
    const g = freshGame(rng);
    expect(applyNetAction(g, rng, { type: "end-turn" })).toBe(g);
  });
});

describe("guestPhaseView", () => {
  it("maps the host's victory to the guest's defeat", () => {
    const rng = seededRng(5);
    const g = { ...freshGame(rng), phase: "victory" as const };
    expect(guestPhaseView(g, "beta")).toBe("defeat");
  });

  it("maps a unification by the guest's own faction to victory", () => {
    const rng = seededRng(5);
    const base = freshGame(rng);
    const g: GameState = {
      ...base,
      phase: "defeat",
      log: [...base.log, {
        turn: base.turn, playerId: 2, type: "unified",
        overlordFactionId: "beta",
      }],
    };
    expect(guestPhaseView(g, "beta")).toBe("victory");
    expect(guestPhaseView(g, "gamma")).toBe("defeat");
  });

  // The engine's `defeat` means the HOST was incorporated. If the faction
  // that did it was the guest's own, the guest just won the game - telling
  // it that it lost states the opposite of what it watched happen.
  it("maps a host defeat the guest caused to victory", () => {
    const rng = seededRng(5);
    const base = freshGame(rng);
    const g: GameState = {
      ...base,
      phase: "defeat",
      log: [...base.log, {
        turn: base.turn, playerId: 2, type: "defeat",
        targetFactionId: "alpha", overlordFactionId: "beta",
      }],
    };
    expect(guestPhaseView(g, "beta")).toBe("victory");
    // Somebody else took the host: both humans lost this one.
    expect(guestPhaseView(g, "gamma")).toBe("defeat");
  });

  // A dead-end vassalage is nobody's act this turn - the overlord on a
  // `stranded` event is a standing relationship, not a blow struck.
  it("leaves a stranded host as a defeat for the guest that holds it", () => {
    const rng = seededRng(5);
    const base = freshGame(rng);
    const g: GameState = {
      ...base,
      phase: "defeat",
      log: [...base.log, {
        turn: base.turn, playerId: 2, type: "stranded",
        targetFactionId: "alpha", overlordFactionId: "beta",
      }],
    };
    expect(guestPhaseView(g, "beta")).toBe("defeat");
  });
});

describe("wirePair", () => {
  it("delivers messages both ways and reports close to both sides", () => {
    const [a, b] = wirePair();
    const got: NetMessage[] = [];
    b.onMessage((m) => got.push(m));
    a.send({ type: "ping" });
    expect(got).toEqual([{ type: "ping" }]);
    let closed = 0;
    a.onClose(() => closed++);
    b.onClose(() => closed++);
    a.close();
    expect(closed).toBe(2);
    a.send({ type: "ping" }); // after close: dropped, no throw
    expect(got.length).toBe(1);
  });
});
