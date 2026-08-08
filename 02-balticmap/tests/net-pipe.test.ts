import { describe, it, expect } from "vitest";
import {
  newGame, startGame, chooseDeck, pickFaction, advance, type GameState,
} from "../src/game";
import { aiTakeTurn, chooseAction } from "../src/ai";
import { buildDeck, type Rng } from "../src/cards";
import { seededRng } from "../src/rng";
import {
  cardSetHash, guestPhaseView, PROTOCOL_VERSION, seatOfFaction, wirePair,
  type NetMessage,
} from "../src/net-protocol";
import { createHostSession, type HostDeps } from "../src/net-host";
import { createGuestSession, type GuestDeps } from "../src/net-guest";
import { formatLead } from "../src/view";
import { leadOf } from "../src/relations";

const FACTIONS = ["alpha", "beta", "gamma", "delta"];

/** A host harness over one wire: real deps wired to a mutable game. */
function makeHost(rng: Rng) {
  const [hostWire, guestWire] = wirePair();
  let game: GameState = startGame(newGame(FACTIONS));
  game = chooseDeck(game, buildDeck());
  const picks: { deck: string[]; factionId: string }[] = [];
  const deps: HostDeps = {
    getGame: () => game,
    setGame: (g) => { game = g; },
    rng,
    name: "Hosta",
    rules: () => ({ turn: "standard" }),
    hostFactionId: () => "alpha",
    onGuestHello: () => {},
    onGuestPick: (p) => picks.push(p),
    onGuestAction: () => {},
    onClosed: () => {},
  };
  const session = createHostSession(hostWire, deps);
  return {
    session, guestWire, picks, deps,
    game: () => game, setGame: (g: GameState) => { game = g; },
  };
}

function collect(wire: { onMessage(fn: (m: NetMessage) => void): void }) {
  const got: NetMessage[] = [];
  wire.onMessage((m) => got.push(m));
  return got;
}

describe("host session", () => {
  it("answers hello with hello + lobby, and refuses a version mismatch", () => {
    const h = makeHost(seededRng(1));
    const got = collect(h.guestWire);
    h.guestWire.send({
      type: "hello", version: PROTOCOL_VERSION, cards: cardSetHash(),
      name: "Gusta",
    });
    expect(got.map((m) => m.type)).toEqual(["hello", "lobby-host"]);
    expect(h.session.guestName()).toBe("Gusta");

    const h2 = makeHost(seededRng(1));
    const got2 = collect(h2.guestWire);
    h2.guestWire.send({
      type: "hello", version: PROTOCOL_VERSION + 1, cards: cardSetHash(),
      name: "Gusta",
    });
    expect(got2.map((m) => m.type)).toEqual(["refuse"]);
  });

  it("rejects a guest pick of the host's own faction", () => {
    const h = makeHost(seededRng(1));
    const got = collect(h.guestWire);
    h.guestWire.send({
      type: "hello", version: PROTOCOL_VERSION, cards: cardSetHash(),
      name: "Gusta",
    });
    h.guestWire.send({ type: "lobby-guest", deck: buildDeck(), factionId: "alpha" });
    expect(got.some((m) => m.type === "reject")).toBe(true);
    expect(h.picks).toEqual([]);
  });

  it("applies a valid guest action, rejects an out-of-turn one, and streams updates", () => {
    const rng = seededRng(2);
    const h = makeHost(rng);
    const got = collect(h.guestWire);
    h.guestWire.send({
      type: "hello", version: PROTOCOL_VERSION, cards: cardSetHash(),
      name: "Gusta",
    });
    h.guestWire.send({ type: "lobby-guest", deck: buildDeck(), factionId: "gamma" });
    // Deal on the host exactly as main.ts will: guest deck override.
    const pick = h.picks[0];
    let g = pickFaction(h.game(), "alpha", rng,
      (r, fid) => (fid === pick.factionId ? pick.deck : buildDeck()));
    h.setGame(g);
    h.session.markStarted(pick.factionId);
    expect(got.at(-1)?.type).toBe("start");

    // Guest acts out of turn (current is seat 0): rejected.
    const guestSeat = seatOfFaction(h.game(), "gamma");
    h.guestWire.send({
      type: "action", turn: h.game().turn, seat: guestSeat,
      action: { type: "discard", cardIndex: 0, cardId: h.game().players[guestSeat].hand[0] },
    });
    expect(got.at(-1)?.type).toBe("reject");

    // Advance host-side to the guest's seat (host + one AI take turns).
    g = h.game();
    while (g.current !== guestSeat) {
      g = advance(aiTakeTurn(g, rng), rng);
    }
    h.setGame(g);
    h.session.pushUpdate();
    expect(got.at(-1)?.type).toBe("update");

    // Now a real action from the policy, with the honest cardId.
    const a = chooseAction(h.game());
    const hand = h.game().players[guestSeat].hand;
    h.guestWire.send({
      type: "action", turn: h.game().turn, seat: guestSeat,
      action: a.type === "play"
        ? { type: "play", cardIndex: a.cardIndex, cardId: hand[a.cardIndex],
            ...(a.targetId !== undefined ? { targetId: a.targetId } : {}) }
        : { type: "discard", cardIndex: a.cardIndex, cardId: hand[a.cardIndex] },
    });
    // A valid action produces an update (the state moved).
    expect(got.at(-1)?.type).toBe("update");
    expect(h.game().playedThisTurn).toBe(true);
  });

  it("greets a mid-game hello with a snapshot (rejoin)", () => {
    const rng = seededRng(3);
    const h = makeHost(rng);
    h.guestWire.send({
      type: "hello", version: PROTOCOL_VERSION, cards: cardSetHash(),
      name: "Gusta",
    });
    h.guestWire.send({ type: "lobby-guest", deck: buildDeck(), factionId: "beta" });
    const pick = h.picks[0];
    h.setGame(pickFaction(h.game(), "alpha", rng,
      (r, fid) => (fid === pick.factionId ? pick.deck : buildDeck())));
    h.session.markStarted(pick.factionId);
    // A second hello mid-game is the guest coming back.
    const got = collect(h.guestWire);
    h.guestWire.send({
      type: "hello", version: PROTOCOL_VERSION, cards: cardSetHash(),
      name: "Gusta",
    });
    const snap = got.find((m) => m.type === "snapshot");
    expect(snap).toBeDefined();
    if (snap?.type === "snapshot") {
      expect(snap.guestFactionId).toBe("beta");
      expect(snap.state.log.length).toBe(h.game().log.length);
    }
  });
});

describe("guest session", () => {
  it("sends hello on creation, surfaces the lobby, and replicates start + updates", () => {
    const rng = seededRng(4);
    const h = makeHost(rng);
    const states: GameState[] = [];
    let lobby: { rules: unknown; takenFactionId: string | null } | null = null;
    const deps: GuestDeps = {
      name: "Gusta",
      onHostHello: () => {},
      onLobby: (info) => { lobby = info; },
      onState: (g) => states.push(g),
      onReject: () => {},
      onRefused: () => {},
      onClosed: () => {},
    };
    const guest = createGuestSession(h.guestWire, deps);
    expect(h.session.guestName()).toBe("Gusta"); // hello crossed on creation
    expect(lobby).not.toBeNull();

    guest.sendPick(buildDeck(), "delta");
    const pick = h.picks[0];
    h.setGame(pickFaction(h.game(), "alpha", rng,
      (r, fid) => (fid === pick.factionId ? pick.deck : buildDeck())));
    h.session.markStarted(pick.factionId);
    expect(guest.guestFactionId()).toBe("delta");
    expect(states.length).toBe(1);
    expect(states[0]).toEqual(h.game());

    // Host moves on; guest's replica follows and stays deep-equal.
    let g = h.game();
    for (let i = 0; i < 5 && g.phase === "playing"; i++) {
      g = advance(aiTakeTurn(g, rng), rng);
    }
    h.setGame(g);
    h.session.pushUpdate();
    expect(guest.game()).toEqual(h.game());
  });
});

/** main.ts's resumeChain, distilled: run AI seats until a human
 *  (host seat 0 or guest) is on turn or the run ends. */
function runChain(
  g: GameState, rng: Rng, guestSeat: number,
): GameState {
  let out = g;
  while (
    out.phase === "playing" && out.current !== 0 && out.current !== guestSeat
  ) {
    out = advance(aiTakeTurn(out, rng), rng);
  }
  return out;
}

describe("a whole game over the pipe", () => {
  it("host and guest replicas agree for 15 rounds, and the guest's standings read from its own seat", () => {
    const rng = seededRng(11);
    const h = makeHost(rng);
    const states: GameState[] = [];
    const rejects: string[] = [];
    const guest = createGuestSession(h.guestWire, {
      name: "Gusta",
      onHostHello: () => {}, onLobby: () => {},
      onState: (g) => states.push(g),
      onReject: (r) => rejects.push(r),
      onRefused: () => {}, onClosed: () => {},
    });
    guest.sendPick(buildDeck(), "gamma");
    const pick = h.picks[0];
    h.setGame(pickFaction(h.game(), "alpha", rng,
      (r, fid) => (fid === pick.factionId ? pick.deck : buildDeck())));
    h.session.markStarted(pick.factionId);
    const guestSeat = seatOfFaction(h.game(), "gamma");

    for (let round = 0; round < 15 && h.game().phase === "playing"; round++) {
      // Host's turn: the policy plays it locally, then the chain runs
      // to the guest's seat, then push.
      if (h.game().current === 0) {
        h.setGame(advance(aiTakeTurn(h.game(), rng), rng));
      }
      h.setGame(runChain(h.game(), rng, guestSeat));
      h.session.pushUpdate();
      if (h.game().phase !== "playing") break;

      // Guest's turn: the guest decides FROM ITS OWN REPLICA, exactly
      // as the real client will.
      const rg = guest.game();
      expect(rg).toEqual(h.game());
      if (rg === null) throw new Error("no replica");
      const a = chooseAction(rg);
      const hand = rg.players[guestSeat].hand;
      guest.sendAction(a.type === "play"
        ? { type: "play", cardIndex: a.cardIndex, cardId: hand[a.cardIndex],
            ...(a.targetId !== undefined ? { targetId: a.targetId } : {}) }
        : { type: "discard", cardIndex: a.cardIndex, cardId: hand[a.cardIndex] });
      expect(rejects).toEqual([]); // every replica-derived action lands
      // Host continues the chain past the guest's committed turn.
      h.setGame(runChain(advance(h.game(), rng), rng, guestSeat));
      h.session.pushUpdate();
    }

    // Replicas agree to the end...
    expect(guest.game()).toEqual(h.game());
    // ...and the guest's standings are ITS signed lead, not the host's:
    const g = guest.game();
    if (g !== null && g.phase === "playing") {
      const other = "beta";
      const guestLead = leadOf(g.relations, "gamma", other);
      expect(formatLead("M", guestLead, null))
        .toBe(formatLead("M", leadOf(h.game().relations, "gamma", other), null));
      // The host's own view of the same pair may differ in sign; the
      // guest never renders that one.
    }
    // The guest's phase view maps the host-centric ending, if one came.
    if (g !== null && g.phase !== "playing") {
      expect(["victory", "defeat"]).toContain(guestPhaseView(g, "gamma"));
    }
  });

  it("a dropped guest rejoins over a fresh wire and resumes deep-equal", () => {
    const rng = seededRng(12);
    const h = makeHost(rng);
    const guest1 = createGuestSession(h.guestWire, {
      name: "Gusta", onHostHello: () => {}, onLobby: () => {},
      onState: () => {}, onReject: () => {}, onRefused: () => {},
      onClosed: () => {},
    });
    guest1.sendPick(buildDeck(), "beta");
    const pick = h.picks[0];
    h.setGame(pickFaction(h.game(), "alpha", rng,
      (r, fid) => (fid === pick.factionId ? pick.deck : buildDeck())));
    h.session.markStarted(pick.factionId);
    // Some turns pass, then the wire dies.
    const guestSeat = seatOfFaction(h.game(), "beta");
    h.setGame(runChain(advance(aiTakeTurn(h.game(), rng), rng), rng, guestSeat));
    h.guestWire.close();

    // main.ts re-wraps the guest's NEW connection into a NEW host
    // session over the same deps, resuming the started faction.
    const [hostWire2, guestWire2] = wirePair();
    createHostSession(hostWire2, h.deps, { guestFactionId: "beta" });
    const states: GameState[] = [];
    const guest2 = createGuestSession(guestWire2, {
      name: "Gusta", onHostHello: () => {}, onLobby: () => {},
      onState: (g) => states.push(g), onReject: () => {},
      onRefused: () => {}, onClosed: () => {},
    });
    expect(states.length).toBe(1); // the mid-game hello got a snapshot
    expect(guest2.game()).toEqual(h.game());
    expect(guest2.guestFactionId()).toBe("beta");
  });
});
