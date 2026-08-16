/** Two people, one game, driven through the app's OWN wiring - the real host
 *  session, the real guest session, the real deal and the real decision
 *  router. Nothing here re-implements what src/main.ts does.
 *
 *  That is the whole point of the file. The multiplayer suites that came
 *  before it kept hand-written copies of the deal and the AI chain, so they
 *  went on passing across forty commits during which the app's wiring quietly
 *  stopped matching them, and every defect this file pins was invisible.
 */
import { describe, it, expect } from "vitest";
import {
  newGame, startGame, chooseBuild, advance, viewOf,
  type GameState,
} from "../src/game";
import {
  marchSourcesAgainst, spendCeilingOn, validTargetsFor,
} from "../src/playability";
import { defenseOf, MIN_RAID_SPEND } from "../src/defense";
import { aiTakeTurn } from "../src/ai";
import type { Rng } from "../src/cards";
import { autoHarvestChoice, buildOffer } from "../src/harvest";
import { seededRng } from "../src/rng";
import {
  dealNetGame, guestPhaseView, wirePair, type NetAction,
} from "../src/net-protocol";
import { createHostSession } from "../src/net-host";
import { createGuestSession } from "../src/net-guest";
import {
  commitDecision, decidedHere, runAiSeats,
  DECISION_ROUTES,
  type Decision, type DecisionKind, type DecisionResult,
} from "../src/decisions";

const FACTIONS = ["alpha", "beta", "gamma", "delta"];

interface Seat {
  decide(d: Decision): DecisionResult;
  sent: NetAction[];
}

/** Both seats of one game. The host holds the only real state; the guest
 *  holds a replica it is never allowed to write, which is asserted rather
 *  than assumed - `apply` throws. */
function twoSeats(seed: number, guestFactionId = "gamma") {
  const rng: Rng = seededRng(seed);
  const [hostWire, guestWire] = wirePair();
  let game: GameState = chooseBuild(
    startGame(newGame(FACTIONS)), "warpath", seededRng(1),
  );
  let replica: GameState | null = null;
  const rejects: string[] = [];

  const session = createHostSession(hostWire, {
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
  });
  const guest = createGuestSession(guestWire, {
    name: "Gusta",
    onHostHello: () => {}, onLobby: () => {},
    onState: (g) => { replica = g; },
    onReject: (r) => rejects.push(r),
    onRefused: () => {}, onClosed: () => {},
  });

  guest.sendPick("warpath", guestFactionId);
  const dealt = dealNetGame(game, rng, {
    hostFactionId: "alpha", guestFactionId, guestBuild: "warpath",
  });
  game = dealt.state;
  session.markStarted(guestFactionId);
  const guestSeat = dealt.guestSeat;
  const seats = { localSeat: 0, remoteSeat: guestSeat };

  const hostSent: NetAction[] = [];
  const guestSent: NetAction[] = [];
  return {
    guestSeat,
    rejects,
    state: () => game,
    replica: (): GameState => {
      if (replica === null) throw new Error("no replica yet");
      return replica;
    },
    setState: (g: GameState) => { game = g; session.pushUpdate(); },
    /** Runs the seats nobody sits at, exactly as the host screen does. */
    runAi: () => { game = runAiSeats(game, rng, seats); session.pushUpdate(); },
    /** Plays the seat on turn with the policy, whoever sits there. Used only
     *  to wind the board to the seat a test is about - a turn cannot simply
     *  be handed on, because `advance` refuses one still open. */
    policyTurn: () => {
      game = advance(aiTakeTurn(game, rng), rng);
      session.pushUpdate();
    },
    host: {
      sent: hostSent,
      decide: (d: Decision) => commitDecision({
        role: "host", localSeat: 0, state: game, rng,
        send: (a) => hostSent.push(a),
        apply: (next) => { game = next; },
        pushUpdate: () => session.pushUpdate(),
      }, d),
    } satisfies Seat,
    guest: {
      sent: guestSent,
      decide: (d: Decision) => commitDecision({
        role: "guest", localSeat: guestSeat,
        state: replica ?? game, rng,
        send: (a) => { guestSent.push(a); guest.sendAction(a); },
        // A guest that writes its own replica is the bug, not a step on the
        // way to one. Failing here names the moment rather than leaving a
        // deep-equality assertion three lines later to imply it.
        apply: () => { throw new Error("a guest wrote its own replica"); },
        pushUpdate: () => { throw new Error("a guest pushed an update"); },
      }, d),
    } satisfies Seat,
  };
}

/** Winds the board to the named seat's turn, playing everybody else. */
function until(t: ReturnType<typeof twoSeats>, seat: number): void {
  for (let i = 0; i < 40; i++) {
    if (t.state().phase !== "playing") throw new Error("run ended");
    // The real chain first, so this file exercises the app's own loop rather
    // than only its own; then the policy for whichever person is in the way.
    t.runAi();
    if (t.state().current === seat) return;
    t.policyTurn();
    if (t.state().current === seat) return;
  }
  throw new Error("never reached that seat");
}

function withHand(g: GameState, seat: number, hand: string[]): GameState {
  return {
    ...g,
    players: g.players.map((p, i) => (i === seat ? { ...p, hand } : p)),
  };
}

describe("two seats, one router", () => {
  it("carries a guest's play to the host and leaves the replica to the update", () => {
    const t = twoSeats(11);
    until(t, t.guestSeat);
    // Staged rather than fished out of the dealt hand: a test that quietly
    // returns when the seed did not offer the card is a test that can stop
    // running without anybody noticing.
    t.setState(withHand(t.state(), t.guestSeat, ["grow-crops"]));
    expect(t.state().playedThisTurn).toBe(false);
    const r = t.guest.decide({
      kind: "play", cardIndex: 0, cardId: "grow-crops",
    });
    expect(r.outcome).toBe("sent");
    expect(t.state().playedThisTurn).toBe(true);
    expect(t.replica()).toEqual(t.state());
    expect(t.rejects).toEqual([]);
  });

  it("refuses a move locally rather than sending it to be refused", () => {
    // The guest holds the same rules, so it can answer this itself - and a
    // move that never leaves the machine cannot race the host's board.
    const t = twoSeats(11);
    until(t, 0); // the HOST's turn, so the guest is out of turn
    const hand = t.replica().players[t.guestSeat].hand;
    const r = t.guest.decide({
      kind: "play", cardIndex: 0, cardId: hand[0],
    });
    expect(r).toMatchObject({ outcome: "refused" });
    expect(t.guest.sent).toEqual([]);
    expect(t.rejects).toEqual([]);
  });
});

describe("the harvest belongs to whoever earned it", () => {
  it("is offered to a guest at all", () => {
    // The regression: `openHarvestModal` sat below a guest early-return, so
    // this answered false in practice and the host picked for them.
    expect(decidedHere("harvest", "guest")).toBe(true);
    expect(decidedHere("harvest", "host")).toBe(true);
  });

  it("lands the guest's own pick, not the automatic one", () => {
    const t = twoSeats(11);
    until(t, t.guestSeat);
    t.setState(withHand(t.state(), t.guestSeat, ["turnip-harvest"]));

    const player = t.replica().players[t.guestSeat];
    const offer = buildOffer(player);
    expect(offer.length).toBeGreaterThan(0);
    const auto = autoHarvestChoice(player);
    // A pick that DIFFERS from what the host would have chosen, or the test
    // passes by coincidence and proves nothing.
    const mine = offer.find(
      (id) => !(auto.kind === "build" && auto.cardId === id),
    );
    expect(mine).toBeDefined();

    const r = t.guest.decide({
      kind: "harvest", cardIndex: 0, cardId: "turnip-harvest",
      choice: { kind: "build", cardId: mine! },
    });
    expect(r.outcome).toBe("sent");
    expect(t.rejects).toEqual([]);
    const picked = t.state().log.filter((e) => e.type === "harvest-picked");
    expect(picked.at(-1)?.cardId).toBe(mine);
  });
});

describe("a card with one legal target", () => {
  it("is aimed for a guest the same way it is aimed for the host", () => {
    // autoAimIfOnlyOne carried a guest branch its only caller could not
    // reach, so a guest still had to click a map that had one answer on it.
    const t = twoSeats(11);
    until(t, t.guestSeat);
    const g = t.replica();
    const me = g.players[t.guestSeat].factionId;
    const single = ["found-settlement", "raid", "plague"].find(
      (id) => validTargetsFor(viewOf(g), me, id).length >= 1,
    );
    expect(single).toBeDefined();
    t.setState(withHand(t.state(), t.guestSeat, [single!]));
    const targets = validTargetsFor(viewOf(t.replica()), me, single!);
    const r = t.guest.decide({
      kind: "play", cardIndex: 0, cardId: single!, targetId: targets[0],
    });
    expect(r.outcome).toBe("sent");
    expect(t.rejects).toEqual([]);
    expect(t.state().playedThisTurn).toBe(true);
  });
});

describe("a raid's spend", () => {
  it("crosses the wire with the guest's play and lands on the host's board", () => {
    // The amount is a field on the `play` decision rather than a decision of
    // its own, so this is the test that would notice it failing to cross:
    // a guest raiding for 3 and a host declaring an arrow of 1.
    const t = twoSeats(11);
    until(t, t.guestSeat);
    const g = t.replica();
    const me = g.players[t.guestSeat].factionId;
    const v = viewOf(g);
    const target = validTargetsFor(v, me, "raid")
      .find((to) => marchSourcesAgainst(v, me, to).length > 0);
    expect(target).toBeDefined();
    const from = marchSourcesAgainst(v, me, target!)[0];
    const ceiling = spendCeilingOn(v, "raid", from);
    expect(ceiling).toBeGreaterThan(MIN_RAID_SPEND);
    const had = defenseOf(v, from);

    t.setState(withHand(t.state(), t.guestSeat, ["raid"]));
    const r = t.guest.decide({
      kind: "play", cardIndex: 0, cardId: "raid",
      targetId: target!, sourceId: from, spend: ceiling,
    });
    expect(r.outcome).toBe("sent");
    expect(t.rejects).toEqual([]);
    const after = t.state();
    // The newest arrow: rival seats have their own out on the board already.
    const mine = Object.values(after.marches).sort((a, b) => b.id - a.id)[0];
    expect(mine).toMatchObject({ from, to: target, damage: ceiling });
    // And the guest's own land paid for it on the HOST's board, which is the
    // only board there is.
    expect(defenseOf(viewOf(after), from)).toBe(had - ceiling);
  });

  it("is clamped by the host rather than taken on the sender's word", () => {
    // A wire is the same attack surface as a hand-edited record, so a number
    // past the ceiling is cut down to it rather than refused - "as much as
    // the card allows" is the safe reading of a build that disagrees.
    const t = twoSeats(11);
    until(t, t.guestSeat);
    const g = t.replica();
    const me = g.players[t.guestSeat].factionId;
    const v = viewOf(g);
    const target = validTargetsFor(v, me, "raid")
      .find((to) => marchSourcesAgainst(v, me, to).length > 0)!;
    const from = marchSourcesAgainst(v, me, target)[0];
    const ceiling = spendCeilingOn(v, "raid", from);

    t.setState(withHand(t.state(), t.guestSeat, ["raid"]));
    t.guest.decide({
      kind: "play", cardIndex: 0, cardId: "raid",
      targetId: target, sourceId: from, spend: 9999,
    });
    expect(t.rejects).toEqual([]);
    const mine = Object.values(t.state().marches).sort((a, b) => b.id - a.id)[0];
    expect(mine).toMatchObject({ from, to: target, damage: ceiling });
  });
});

describe("what only the host answers", () => {
  it("refuses a guest with the table's own written reason", () => {
    const t = twoSeats(11);
    until(t, t.guestSeat);
    const r = t.guest.decide({ kind: "surrender" });
    expect(r).toMatchObject({ outcome: "refused" });
    if (r.outcome === "refused") {
      // A reason a person could read, not a role name. The table is where it
      // is written, so the refusal and the documentation cannot disagree.
      expect(r.reason.length).toBeGreaterThan(40);
      expect(r.reason).not.toMatch(/net\.role/);
    }
    expect(t.guest.sent).toEqual([]);
  });

  it("refuses a guest the host's own second thoughts about winning", () => {
    const t = twoSeats(11);
    until(t, t.guestSeat);
    const r = t.guest.decide({ kind: "keep-playing" });
    expect(r).toMatchObject({ outcome: "refused" });
    if (r.outcome === "refused") {
      expect(r.reason.length).toBeGreaterThan(40);
      expect(r.reason).not.toMatch(/net\.role/);
    }
    expect(t.guest.sent).toEqual([]);
  });

  it("hands the guest back a run the host declined to end", () => {
    // The host's victory is the guest's defeat, and the guest's screen reads
    // that off the phase. Playing on has to put BOTH of them back in the run:
    // pinning the guest at an ending would leave the chain waiting on a seat
    // whose screen has no controls left.
    const t = twoSeats(11);
    const host = t.state().players[0].factionId;
    t.setState({
      ...t.state(),
      phase: "victory",
      incorporated: Object.fromEntries(
        t.state().factionIds
          .filter((f) => f !== host && f !== t.state().players[t.guestSeat].factionId)
          .map((f) => [f, host]),
      ),
    });
    expect(guestPhaseView(
      t.replica(), t.state().players[t.guestSeat].factionId,
    )).toBe("defeat");

    const r = t.host.decide({ kind: "keep-playing" });
    expect(r).toMatchObject({ outcome: "applied" });
    expect(t.state().playingOn).toBe(true);
    // The replica followed, field for field, and the guest's own view with it.
    expect(t.replica().phase).toBe("playing");
    expect(t.replica().playingOn).toBe(true);
    expect(guestPhaseView(
      t.replica(), t.state().players[t.guestSeat].factionId,
    )).toBe("playing");
  });

  it("agrees with decidedHere about which decisions those are", () => {
    // The table and the gate are the same fact. A decision routed to the wire
    // but hidden from a guest, or offered to a guest with nowhere to send it,
    // is the drift this pairing exists to prevent.
    for (const kind of Object.keys(DECISION_ROUTES) as DecisionKind[]) {
      const routed = "wire" in DECISION_ROUTES[kind];
      expect(decidedHere(kind, "guest")).toBe(routed);
      expect(decidedHere(kind, "host")).toBe(true);
      expect(decidedHere(kind, "solo")).toBe(true);
    }
  });

  it("names every decision, so a new one cannot slip past this file", () => {
    // Exhaustive Record, spelled out: adding a Decision variant fails to
    // compile here until it is listed, which is what stops the next question
    // from being one nobody checked either seat could answer.
    const named: Record<DecisionKind, true> = {
      play: true, harvest: true, discard: true,
      "end-turn": true, transfer: true, surrender: true,
      "pick-duel": true, "keep-playing": true,
    };
    expect(Object.keys(DECISION_ROUTES).sort()).toEqual(
      Object.keys(named).sort(),
    );
  });
});

describe("the conquest question", () => {
  it("is raised for the seat that made the conquest, and answered over the wire", () => {
    const t = twoSeats(11);
    until(t, t.guestSeat);
    const me = t.state().players[t.guestSeat].factionId;
    // Stage the question directly: how a land is taken is game.test.ts's
    // subject, and what this file is about is who gets asked and how the
    // answer travels.
    t.setState({
      ...t.state(),
      defenseMax: { ...t.state().defenseMax, [me]: 40, beta: 40 },
      defense: { ...t.state().defense, [me]: 40, beta: 0 },
      pendingTransfers: { [me]: [{ from: me, to: "beta" }] },
    });
    expect(t.replica().pendingTransfers[me]).toEqual([{ from: me, to: "beta" }]);

    const r = t.guest.decide({
      kind: "transfer", from: me, to: "beta", amount: 10,
    });
    expect(r.outcome).toBe("sent");
    expect(t.rejects).toEqual([]);
    expect(t.state().pendingTransfers).toEqual({});
    expect(t.state().defense[me]).toBe(30);
    expect(t.state().defense.beta).toBe(10);
    expect(t.replica()).toEqual(t.state());
  });

  it("is refused when it is not the sender's question", () => {
    const t = twoSeats(11);
    until(t, t.guestSeat);
    t.setState({
      ...t.state(),
      pendingTransfers: { alpha: [{ from: "alpha", to: "beta" }] },
    });
    const r = t.guest.decide({
      kind: "transfer", from: "alpha", to: "beta", amount: 10,
    });
    expect(r).toMatchObject({ outcome: "refused" });
    expect(t.guest.sent).toEqual([]);
  });
});

describe("a person whose chief was killed", () => {
  it("keeps their turn, at whichever seat they sit", () => {
    // The guest's seat is not seat 0, and the exemption that keeps a
    // leaderless player playing used to be written for seat 0 alone - so an
    // assassinated guest was passed over for the rest of the run, with no
    // ending and no explanation.
    const t = twoSeats(11);
    until(t, t.guestSeat);
    const me = t.state().players[t.guestSeat].factionId;
    const { [me]: _gone, ...rulers } = t.state().rulers;
    t.setState({
      ...t.state(), humanSeats: [0, t.guestSeat], rulers,
    });
    t.policyTurn();
    // Round the table and back: the seat is still dealt into the order.
    for (let i = 0; i < 8 && t.state().current !== t.guestSeat; i++) {
      t.policyTurn();
    }
    expect(t.state().current).toBe(t.guestSeat);
  });
});
