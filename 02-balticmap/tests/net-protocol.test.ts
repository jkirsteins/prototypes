import { describe, it, expect } from "vitest";
import {
  newGame, startGame, chooseBuild, pickFaction, advance, type GameState,
} from "../src/game";
import { aiTakeTurn } from "../src/ai";
import { CARDS } from "../src/cards";
import { destroyOffer } from "../src/harvest";
import type { Rng } from "../src/cards";
import { seededRng } from "../src/rng";
import {
  applyNetAction, applyUpdate, buildUpdate, cardRulesHash, guestPhaseView,
  NET_ACTION_RULES, PROTOCOL_VERSION, seatOfFaction, validateAction, wirePair,
  type NetAction, type NetMessage,
} from "../src/net-protocol";
import { createHostSession, type HostDeps } from "../src/net-host";
import { createGuestSession, type GuestDeps } from "../src/net-guest";
import { regionFingerprint } from "../src/regions";

const FACTIONS = ["alpha", "beta", "gamma", "delta"];

function freshGame(rng: Rng): GameState {
  let g = startGame(newGame(FACTIONS));
  g = chooseBuild(g, "warpath", seededRng(1));
  return pickFaction(g, "alpha", rng);
}

function withHand(g: GameState, seat: number, hand: string[]): GameState {
  return {
    ...g,
    players: g.players.map((p, i) => (i === seat ? { ...p, hand } : p)),
  };
}

/** The smallest host over one wire: enough deps to test the handshake and
 *  the lobby shapes without the whole net-pipe harness. */
function smallHost(rng: Rng) {
  const [hostWire, guestWire] = wirePair();
  let game = freshGame(rng);
  const deps: HostDeps = {
    getGame: () => game,
    setGame: (g) => { game = g; },
    rng,
    name: "Hosta",
    rules: () => ({ turn: "standard", hand: "keep" }),
    hostFactionId: () => "alpha",
    onGuestHello: () => {},
    onGuestPick: () => {},
    onGuestAction: () => {},
    onClosed: () => {},
  };
  const session = createHostSession(hostWire, deps);
  const got: NetMessage[] = [];
  let closed = false;
  guestWire.onMessage((m) => got.push(m));
  guestWire.onClose(() => { closed = true; });
  return {
    session, guestWire, got, isClosed: () => closed,
    // The board the host is answering from, for a test that needs it to be
    // something other than a fresh deal - a map with realms already on it.
    getGame: () => game, setGame: (g: GameState) => { game = g; },
  };
}

describe("handshake", () => {
  it("speaks protocol version 6 - the two-humans wire", () => {
    // Bumped when the message set changes shape; v2 put `build` on
    // lobby-guest and `harvest` on the play action, v3 put `sourceId` there
    // too, v4 adds the `transfer` action and renames the state's
    // `humanSeat` to a set of them, v5 adds `region` to hello, and v6 adds
    // the `march-declared` event type to the log. Two deploys on different
    // versions must refuse, not desync.
    expect(PROTOCOL_VERSION).toBe(6);
  });

  it("refuses a hello from a different protocol version at the lobby", () => {
    const h = smallHost(seededRng(1));
    h.guestWire.send({
      type: "hello", version: PROTOCOL_VERSION + 1, cards: cardRulesHash(),
      region: regionFingerprint(), name: "Gusta",
    });
    expect(h.got.map((m) => m.type)).toEqual(["refuse"]);
    expect(h.isClosed()).toBe(true);
  });

  it("refuses a hello whose region does not match the host's", () => {
    const h = smallHost(seededRng(1));
    h.guestWire.send({
      type: "hello", version: PROTOCOL_VERSION, cards: cardRulesHash(),
      region: "iberia@0", name: "x",
    });
    expect(h.got).toHaveLength(1);
    expect(h.got[0]).toMatchObject({ type: "refuse" });
    if (h.got[0].type === "refuse") {
      expect(h.got[0].reason).toMatch(/region/);
    }
    expect(h.isClosed()).toBe(true);
  });

  it("shakes hands when both ends agree on the real region fingerprint", () => {
    const h = smallHost(seededRng(1));
    h.guestWire.send({
      type: "hello", version: PROTOCOL_VERSION, cards: cardRulesHash(),
      region: regionFingerprint(), name: "Gusta",
    });
    expect(h.got.map((m) => m.type)).toContain("hello");
    expect(h.isClosed()).toBe(false);
  });

  it("has the guest refuse a host hello on the wrong region too - a host bug must not leave a guest silently rendering the wrong map", () => {
    const [hostWire, guestWire] = wirePair();
    let refused: string | null = null;
    let closed = false;
    guestWire.onClose(() => { closed = true; });
    const deps: GuestDeps = {
      name: "Gusta",
      onHostHello: () => {},
      onLobby: () => {},
      onState: () => {},
      onReject: () => {},
      onRefused: (reason) => { refused = reason; },
      onClosed: () => {},
    };
    createGuestSession(guestWire, deps);
    // Stand in for the host: a hello whose region disagrees with this
    // process's own, the same shape a buggy or stale host might send.
    hostWire.send({
      type: "hello", version: PROTOCOL_VERSION, cards: cardRulesHash(),
      region: "iberia@0", name: "Hosta",
    });
    expect(refused).toMatch(/region/);
    expect(closed).toBe(true);
  });
});

describe("lobby-guest", () => {
  it("carries the guest's BUILD and faction - the deck retired with the meta system", () => {
    const h = smallHost(seededRng(1));
    h.guestWire.send({
      type: "hello", version: PROTOCOL_VERSION, cards: cardRulesHash(),
      region: regionFingerprint(), name: "Gusta",
    });
    h.guestWire.send({
      type: "lobby-guest", build: "pestilence", factionId: "gamma",
    });
    expect(h.session.guestPick())
      .toEqual({ build: "pestilence", factionId: "gamma" });
  });

  it("rejects an unknown faction and the host's own faction", () => {
    const h = smallHost(seededRng(1));
    h.guestWire.send({
      type: "hello", version: PROTOCOL_VERSION, cards: cardRulesHash(),
      region: regionFingerprint(), name: "Gusta",
    });
    h.guestWire.send({
      type: "lobby-guest", build: "warpath", factionId: "atlantis",
    });
    h.guestWire.send({
      type: "lobby-guest", build: "warpath", factionId: "alpha",
    });
    expect(h.got.filter((m) => m.type === "reject")).toHaveLength(2);
    expect(h.session.guestPick()).toBeNull();
  });

  /** A region may open with realms already standing, and the guest's own
   *  screen greys those lands and drops the click - but a pick crosses the
   *  wire, so the host checks it too. Silently dropping it is the bad
   *  outcome: `actingFactions` would leave the reservation out, and the guest
   *  would be dealt a seat with no ruler and skipped for the whole run. */
  it("rejects a faction that already answers to another", () => {
    const rng = seededRng(1);
    const h = smallHost(rng);
    h.setGame({ ...h.getGame(), overlords: new Map([["gamma", "delta"]]) });
    h.guestWire.send({
      type: "hello", version: PROTOCOL_VERSION, cards: cardRulesHash(),
      region: regionFingerprint(), name: "Gusta",
    });
    h.guestWire.send({
      type: "lobby-guest", build: "warpath", factionId: "gamma",
    });
    expect(h.got.filter((m) => m.type === "reject")).toHaveLength(1);
    expect(h.session.guestPick()).toBeNull();
    // A free land is still a perfectly good pick.
    h.guestWire.send({
      type: "lobby-guest", build: "warpath", factionId: "beta",
    });
    expect(h.session.guestPick())
      .toEqual({ build: "warpath", factionId: "beta" });
  });
});

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

  it("refuses a harvest pick from outside the chooser's own pool", () => {
    // The host can recompute buildOffer, so a stale or fabricated pick is
    // refused rather than shuffled in. Seat 0 is on the warpath build:
    // spread-disease belongs to the other build's pool.
    const rng = seededRng(3);
    const g = withHand(freshGame(rng), 0, ["turnip-harvest"]);
    expect(validateAction(g, 0, g.turn, {
      type: "play", cardIndex: 0, cardId: "turnip-harvest",
      harvest: { kind: "build", cardId: "spread-disease" },
    })).toMatch(/build/);
    // A pick from the pool, and a skip, both pass.
    expect(validateAction(g, 0, g.turn, {
      type: "play", cardIndex: 0, cardId: "turnip-harvest",
      harvest: { kind: "build", cardId: "war-council" },
    })).toBeNull();
    expect(validateAction(g, 0, g.turn, {
      type: "play", cardIndex: 0, cardId: "turnip-harvest",
      harvest: { kind: "skip" },
    })).toBeNull();
  });

  it("refuses an upgrade the guest cannot pay for", () => {
    // The price is part of the offer, so the same recomputation that catches a
    // fabricated card catches a fabricated purse. A guest holding no Strong
    // raid cannot name a Great raid, and one holding the price can.
    const rng = seededRng(3);
    const g = withHand(freshGame(rng), 0, ["turnip-harvest"]);
    expect(validateAction(g, 0, g.turn, {
      type: "play", cardIndex: 0, cardId: "turnip-harvest",
      harvest: { kind: "build", cardId: "great-raid" },
    })).toMatch(/build/);
    const rich = {
      ...g,
      players: g.players.map((pl, i) => (i === 0
        ? { ...pl, deck: [...pl.deck, "strong-raid", "strong-raid"] }
        : pl)),
    };
    expect(validateAction(rich, 0, rich.turn, {
      type: "play", cardIndex: 0, cardId: "turnip-harvest",
      harvest: { kind: "build", cardId: "great-raid" },
    })).toBeNull();
  });

  it("refuses a raid source no free army of the guest's borders", () => {
    // Refused, not redirected: silently marching out of another land would
    // expose a land the guest never chose to expose to the counter-raid.
    const g = withHand(freshGame(seededRng(3)), 0, ["raid"]);
    expect(validateAction(g, 0, g.turn, {
      type: "play", cardIndex: 0, cardId: "raid",
      targetId: "beta", sourceId: "gamma",
    })).toMatch(/army/);
    // The seat's own land is the legal tail, and naming none is still fine -
    // playCard takes the first legal source for a caller with no opinion.
    expect(validateAction(g, 0, g.turn, {
      type: "play", cardIndex: 0, cardId: "raid",
      targetId: "beta", sourceId: "alpha",
    })).toBeNull();
    expect(validateAction(g, 0, g.turn, {
      type: "play", cardIndex: 0, cardId: "raid", targetId: "beta",
    })).toBeNull();
  });

  it("refuses a transfer from a seat with no conquest waiting", () => {
    // The structural half of the fix: the store replicates whole, so before
    // this arm existed a screen could read the OTHER person's open question
    // and answer it. Refusing it here makes that unrepresentable on the wire
    // rather than merely avoided by a UI check.
    const g = freshGame(seededRng(3));
    expect(validateAction(g, 0, g.turn, { type: "transfer", amount: 3 }))
      .toMatch(/conquest/);
    const asked: GameState = {
      ...g, pendingTransfers: { alpha: [{ from: "alpha", to: "beta" }] },
    };
    expect(validateAction(asked, 0, asked.turn, { type: "transfer", amount: 3 }))
      .toBeNull();
    // 0 is a real answer. The UPPER bound is deliberately not checked here -
    // transferDefense clamps at the moment it applies, and a second limit
    // computed now would disagree the first time the board moved underneath.
    expect(validateAction(asked, 0, asked.turn, { type: "transfer", amount: 0 }))
      .toBeNull();
    expect(validateAction(asked, 0, asked.turn, { type: "transfer", amount: -1 }))
      .toMatch(/number/);
    expect(
      validateAction(asked, 0, asked.turn, { type: "transfer", amount: 1.5 }),
    ).toMatch(/number/);
  });
});

describe("every action kind", () => {
  /** One sample per kind, as an exhaustive Record: a new NetAction fails to
   *  compile here until it is sampled, so the shared checks below cannot be
   *  the ones nobody thought to apply to it. */
  const SAMPLES: Record<NetAction["type"], (g: GameState) => NetAction> = {
    play: (g) => ({
      type: "play", cardIndex: 0, cardId: g.players[0].hand[0],
    }),
    discard: (g) => ({
      type: "discard", cardIndex: 0, cardId: g.players[0].hand[0],
    }),
    transfer: () => ({ type: "transfer", amount: 1 }),
    "end-turn": () => ({ type: "end-turn" }),
  };

  const kinds = Object.keys(SAMPLES) as NetAction["type"][];

  it("names the same kinds the rules table does", () => {
    expect(kinds.sort()).toEqual(Object.keys(NET_ACTION_RULES).sort());
  });

  it("is refused when the game is not in play", () => {
    const g = { ...freshGame(seededRng(7)), phase: "victory" as const };
    for (const kind of kinds) {
      expect(validateAction(g, 0, g.turn, SAMPLES[kind](g))).toMatch(/not in play/);
    }
  });

  it("is refused out of turn", () => {
    const g = { ...freshGame(seededRng(7)), current: 1 };
    for (const kind of kinds) {
      expect(validateAction(g, 0, g.turn, SAMPLES[kind](g))).toMatch(/seat's turn/);
    }
  });

  it("is refused on a stale turn stamp", () => {
    const g = freshGame(seededRng(7));
    for (const kind of kinds) {
      expect(validateAction(g, 0, g.turn - 1, SAMPLES[kind](g)))
        .toMatch(/stale/);
    }
  });

  it("is refused from a seat that does not exist", () => {
    const g = freshGame(seededRng(7));
    for (const kind of kinds) {
      expect(validateAction(g, 99, g.turn, SAMPLES[kind](g)))
        .toMatch(/no such seat/);
    }
  });
});

describe("applyNetAction", () => {
  it("refuses a harvest that burns a card the seat may not burn", () => {
    // `destroyOffer` holds back the forced cards - a tribute among them, and
    // burning one is how a vassal would duck a demand the rules mean to be
    // forced. That rule was consulted by the screen alone, so it was written
    // nowhere the wire could see it.
    const rng = seededRng(3);
    const base = withHand(freshGame(rng), 0, ["turnip-harvest"]);
    const forced = Object.values(CARDS).find((c) => c.forced === true);
    expect(forced).toBeDefined();
    const g: GameState = {
      ...base,
      players: base.players.map((p, i) =>
        i === 0 ? { ...p, deck: [...p.deck, forced!.id] } : p,
      ),
    };
    expect(validateAction(g, 0, g.turn, {
      type: "play", cardIndex: 0, cardId: "turnip-harvest",
      harvest: { kind: "destroy", cardId: forced!.id },
    })).toMatch(/burned/);
    // A card the seat really holds and really may burn is fine.
    const burnable = destroyOffer(g.players[0])[0];
    expect(burnable).toBeDefined();
    expect(validateAction(g, 0, g.turn, {
      type: "play", cardIndex: 0, cardId: "turnip-harvest",
      harvest: { kind: "destroy", cardId: burnable },
    })).toBeNull();
  });

  it("answers the sender's own conquest, off the state and not the message", () => {
    const rng = seededRng(5);
    const base = freshGame(rng);
    const g: GameState = {
      ...base,
      defenseMax: { alpha: 40, beta: 40 },
      defense: { alpha: 40, beta: 0 },
      pendingTransfers: { alpha: [{ from: "alpha", to: "beta" }] },
    };
    const after = applyNetAction(g, rng, { type: "transfer", amount: 10 }, 0);
    expect(after.defense.alpha).toBe(30);
    expect(after.defense.beta).toBe(10);
    expect(after.pendingTransfers).toEqual({});
  });

  it("answers the SENDING seat's conquest, not the seat holding the turn", () => {
    // The two are the same on every ordinary path - a conquest is queued at
    // its taker's own turn start - which is why reading the faction off
    // `state.current` survived. They diverge the moment the board moves
    // between the modal opening and the answer landing, and then the pop names
    // a faction with no queue, `transferDefense` hands the state back
    // untouched, and `commitDecision` reads that as "the rules refused". The
    // question stays owed, `transferAsked` suppresses it for good, and
    // `localTransferPending` swallows every click with nothing on screen.
    const rng = seededRng(5);
    const base = freshGame(rng);
    const g: GameState = {
      ...base,
      current: 1,
      defenseMax: { alpha: 40, beta: 40 },
      defense: { alpha: 40, beta: 0 },
      pendingTransfers: { alpha: [{ from: "alpha", to: "beta" }] },
    };
    const after = applyNetAction(g, rng, { type: "transfer", amount: 10 }, 0);
    expect(after).not.toBe(g);
    expect(after.pendingTransfers).toEqual({});
    expect(after.defense.alpha).toBe(30);
    expect(after.defense.beta).toBe(10);
  });

  it("pops one entry per answer, so the second conquest is still owed", () => {
    // A turn that took two lands owes two answers. The second is raised by the
    // transition the FIRST answer creates, so an answer that pops nothing does
    // not merely lose itself - it takes every question behind it as well.
    const rng = seededRng(5);
    const base = freshGame(rng);
    const g: GameState = {
      ...base,
      current: 1,
      defenseMax: { alpha: 40, beta: 40, gamma: 40, delta: 40 },
      defense: { alpha: 40, beta: 0, gamma: 40, delta: 0 },
      pendingTransfers: {
        alpha: [{ from: "alpha", to: "beta" }, { from: "gamma", to: "delta" }],
      },
    };
    const after = applyNetAction(g, rng, { type: "transfer", amount: 10 }, 0);
    expect(after.pendingTransfers.alpha)
      .toEqual([{ from: "gamma", to: "delta" }]);
  });

  it("routes end-turn to endTurn only under unlimited rules (standard refuses)", () => {
    const rng = seededRng(5);
    const g = freshGame(rng);
    expect(applyNetAction(g, rng, { type: "end-turn" }, 0)).toBe(g);
  });

  it("passes the harvest pick through to playCard", () => {
    const rng = seededRng(5);
    const g = withHand(freshGame(rng), 0, ["turnip-harvest"]);
    const next = applyNetAction(g, rng, {
      type: "play", cardIndex: 0, cardId: "turnip-harvest",
      harvest: { kind: "build", cardId: "war-council" },
    }, 0);
    expect(next).not.toBe(g);
    expect(next.log.at(-1)).toMatchObject({
      type: "harvest-picked", cardId: "war-council",
    });
    expect(next.players[0].deck).toContain("war-council");
  });

  it("honours a skip - no pick, no card gained", () => {
    const rng = seededRng(5);
    const g = withHand(freshGame(rng), 0, ["turnip-harvest"]);
    const next = applyNetAction(g, rng, {
      type: "play", cardIndex: 0, cardId: "turnip-harvest",
      harvest: { kind: "skip" },
    }, 0);
    expect(next).not.toBe(g);
    expect(next.log.at(-1)).toMatchObject({
      type: "play", cardId: "turnip-harvest",
    });
    expect(next.log.some((e) => e.type === "harvest-picked")).toBe(false);
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

  it("is idempotent: an update delivered twice leaves one of each event", () => {
    // The spec asked for this case and it was never written. A bare append
    // doubled the log, and the milestone drawer and the round summary are
    // DERIVED from the log - so one screen counted a plague twice.
    const rng = seededRng(9);
    const host = advance(aiTakeTurn(freshGame(rng), rng), rng);
    const msg = buildUpdate(host, 0);
    const once = applyUpdate(null, msg);
    const twice = applyUpdate(once, msg);
    expect(twice.log).toEqual(once.log);
    expect(twice).toEqual(once);
  });

  it("splices at the index the events came from, not at the end", () => {
    const rng = seededRng(9);
    const first = advance(aiTakeTurn(freshGame(rng), rng), rng);
    const guest = applyUpdate(null, buildUpdate(first, 0));
    const second = advance(aiTakeTurn(first, rng), rng);
    const msg = buildUpdate(second, first.log.length);
    expect(msg.type === "update" && msg.logFrom).toBe(first.log.length);
    expect(applyUpdate(guest, msg).log).toEqual(second.log);
    // And out of order twice over: replaying the FIRST message after the
    // second rewinds the log rather than corrupting it.
    const rewound = applyUpdate(applyUpdate(guest, msg), buildUpdate(first, 0));
    expect(rewound.log).toEqual(first.log);
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

  // The one ending the engine cannot phrase: the run goes on for everybody
  // else, so `phase` stays "playing" and the guest's own loss is written
  // nowhere but the board. Without this the guest sat at a live screen, its
  // seat skipped every round, and was never told why.
  it("reads a guest's own annexation off the board while the host plays on", () => {
    const rng = seededRng(5);
    const base = freshGame(rng);
    const g: GameState = { ...base, incorporated: { beta: "gamma" } };
    expect(g.phase).toBe("playing");
    expect(guestPhaseView(g, "beta")).toBe("defeat");
    // Everybody still in the run sees the run.
    expect(guestPhaseView(g, "delta")).toBe("playing");
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
