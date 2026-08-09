import { describe, it, expect } from "vitest";
import {
  newGame, startGame, chooseBuild, pickFaction, advance, type GameState,
} from "../src/game";
import { aiTakeTurn, chooseAction } from "../src/ai";
import type { Rng, Strategy } from "../src/cards";
import { buildOffer } from "../src/harvest";
import { seededRng } from "../src/rng";
import {
  cardSetHash, guestPhaseView, PROTOCOL_VERSION, seatOfFaction, wirePair,
  type NetMessage,
} from "../src/net-protocol";
import { createHostSession, type HostDeps } from "../src/net-host";
import { createGuestSession, type GuestDeps } from "../src/net-guest";

const FACTIONS = ["alpha", "beta", "gamma", "delta"];

/** A host harness over one wire: real deps wired to a mutable game. */
function makeHost(rng: Rng) {
  const [hostWire, guestWire] = wirePair();
  let game: GameState = chooseBuild(
    startGame(newGame(FACTIONS)), "warpath", seededRng(1),
  );
  const picks: { build: Strategy; factionId: string }[] = [];
  const deps: HostDeps = {
    getGame: () => game,
    setGame: (g) => { game = g; },
    rng,
    name: "Hosta",
    rules: () => ({ turn: "standard", hand: "keep" }),
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

/** Deals exactly as main.ts's tryDeal: pickFaction rolls every AI seat a
 *  strategy (keeping the rng draw count a frozen contract), then the guest's
 *  chosen build is stamped over its seat. */
function deal(h: ReturnType<typeof makeHost>, rng: Rng): number {
  const pick = h.picks[0];
  let g = pickFaction(h.game(), "alpha", rng);
  const guestSeat = seatOfFaction(g, pick.factionId);
  g = {
    ...g,
    players: g.players.map((p, i) =>
      i === guestSeat ? { ...p, strategy: pick.build } : p,
    ),
  };
  h.setGame(g);
  h.session.markStarted(pick.factionId);
  return guestSeat;
}

function collect(wire: { onMessage(fn: (m: NetMessage) => void): void }) {
  const got: NetMessage[] = [];
  wire.onMessage((m) => got.push(m));
  return got;
}

describe("host session", () => {
  it("answers hello with hello + lobby carrying the rules and the taken land", () => {
    const h = makeHost(seededRng(1));
    const got = collect(h.guestWire);
    h.guestWire.send({
      type: "hello", version: PROTOCOL_VERSION, cards: cardSetHash(),
      name: "Gusta",
    });
    expect(got.map((m) => m.type)).toEqual(["hello", "lobby-host"]);
    const lobby = got[1];
    if (lobby.type === "lobby-host") {
      expect(lobby.rules).toEqual({ turn: "standard", hand: "keep" });
      expect(lobby.takenFactionId).toBe("alpha");
    }
    expect(h.session.guestName()).toBe("Gusta");
  });

  it("deals with the guest's build stamped over the rolled strategy", () => {
    const rng = seededRng(2);
    const h = makeHost(rng);
    const got = collect(h.guestWire);
    h.guestWire.send({
      type: "hello", version: PROTOCOL_VERSION, cards: cardSetHash(),
      name: "Gusta",
    });
    h.guestWire.send({
      type: "lobby-guest", build: "pestilence", factionId: "gamma",
    });
    expect(h.picks).toEqual([{ build: "pestilence", factionId: "gamma" }]);
    const guestSeat = deal(h, rng);
    expect(got.at(-1)?.type).toBe("start");
    // The stamp is the whole point: pickFaction rolled this seat like any AI
    // seat, and the guest's actual pick must overwrite the roll.
    expect(h.game().players[guestSeat].factionId).toBe("gamma");
    expect(h.game().players[guestSeat].strategy).toBe("pestilence");
    // The host's own seat keeps the host's build.
    expect(h.game().players[0].strategy).toBe("warpath");
  });

  it("applies a valid guest action, rejects an out-of-turn one, and streams updates", () => {
    const rng = seededRng(2);
    const h = makeHost(rng);
    const got = collect(h.guestWire);
    h.guestWire.send({
      type: "hello", version: PROTOCOL_VERSION, cards: cardSetHash(),
      name: "Gusta",
    });
    h.guestWire.send({
      type: "lobby-guest", build: "warpath", factionId: "gamma",
    });
    const guestSeat = deal(h, rng);
    expect(got.at(-1)?.type).toBe("start");

    // Guest acts out of turn (current is seat 0): rejected.
    h.guestWire.send({
      type: "action", turn: h.game().turn, seat: guestSeat,
      action: { type: "discard", cardIndex: 0, cardId: h.game().players[guestSeat].hand[0] },
    });
    expect(got.at(-1)?.type).toBe("reject");

    // Advance host-side to the guest's seat (host + one AI take turns).
    let g = h.game();
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
    h.guestWire.send({
      type: "lobby-guest", build: "warpath", factionId: "beta",
    });
    deal(h, rng);
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

    guest.sendPick("pestilence", "delta");
    deal(h, rng);
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
  it("host and guest replicas agree for 15 rounds", () => {
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
    guest.sendPick("pestilence", "gamma");
    const guestSeat = deal(h, rng);

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
      if (rg === null) throw new Error("no replica");
      expect(rg).toEqual(h.game());
      const a = chooseAction(rg);
      const hand = rg.players[guestSeat].hand;
      if (a.type === "play" && hand[a.cardIndex] === "turnip-harvest") {
        // A harvest play carries its pick on the action, chosen from the
        // guest's OWN replica pool - the real client's route.
        guest.sendAction({
          type: "play", cardIndex: a.cardIndex, cardId: hand[a.cardIndex],
          harvest: { kind: "build", cardId: buildOffer(rg.players[guestSeat])[0] },
        });
      } else {
        guest.sendAction(a.type === "play"
          ? { type: "play", cardIndex: a.cardIndex, cardId: hand[a.cardIndex],
              ...(a.targetId !== undefined ? { targetId: a.targetId } : {}) }
          : { type: "discard", cardIndex: a.cardIndex, cardId: hand[a.cardIndex] });
      }
      expect(rejects).toEqual([]); // every replica-derived action lands
      // Host continues the chain past the guest's committed turn.
      h.setGame(runChain(advance(h.game(), rng), rng, guestSeat));
      h.session.pushUpdate();
    }

    // Replicas agree to the end...
    expect(guest.game()).toEqual(h.game());
    const g = guest.game();
    // The guest's phase view maps the host-centric ending, if one came.
    if (g !== null && g.phase !== "playing") {
      expect(["victory", "defeat"]).toContain(guestPhaseView(g, "gamma"));
    }
  });

  it("a guest harvest play rides its pick over the wire and lands in the deck", () => {
    const rng = seededRng(13);
    const h = makeHost(rng);
    const rejects: string[] = [];
    const guest = createGuestSession(h.guestWire, {
      name: "Gusta", onHostHello: () => {}, onLobby: () => {},
      onState: () => {}, onReject: (r) => rejects.push(r),
      onRefused: () => {}, onClosed: () => {},
    });
    guest.sendPick("pestilence", "gamma");
    const guestSeat = deal(h, rng);
    // Bring the world to the guest's turn, then stage the harvest: the card
    // in hand on the host, and the replica synced so the guest sees it too.
    h.setGame(runChain(advance(aiTakeTurn(h.game(), rng), rng), rng, guestSeat));
    expect(h.game().current).toBe(guestSeat);
    h.setGame({
      ...h.game(),
      players: h.game().players.map((p, i) =>
        i === guestSeat ? { ...p, hand: ["turnip-harvest"] } : p,
      ),
    });
    h.session.pushUpdate();
    const rg = guest.game();
    if (rg === null) throw new Error("no replica");
    // Plague is in the guest's pool because the guest is on pestilence -
    // the build the deal stamped, not the one the seat rolled.
    expect(buildOffer(rg.players[guestSeat])).toContain("plague");
    guest.sendAction({
      type: "play", cardIndex: 0, cardId: "turnip-harvest",
      harvest: { kind: "build", cardId: "plague" },
    });
    expect(rejects).toEqual([]);
    expect(h.game().log.at(-1)).toMatchObject({
      type: "harvest-picked", cardId: "plague",
    });
    expect(h.game().players[guestSeat].deck).toContain("plague");
    // The update that answered the action keeps the replica deep-equal.
    expect(guest.game()).toEqual(h.game());
  });

  it("a dropped guest rejoins over a fresh wire and resumes deep-equal", () => {
    const rng = seededRng(12);
    const h = makeHost(rng);
    const guest1 = createGuestSession(h.guestWire, {
      name: "Gusta", onHostHello: () => {}, onLobby: () => {},
      onState: () => {}, onReject: () => {}, onRefused: () => {},
      onClosed: () => {},
    });
    guest1.sendPick("warpath", "beta");
    const guestSeat = deal(h, rng);
    // Some turns pass, then the wire dies.
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
