import type { Rng, Strategy } from "./cards";
import {
  discardCard, endTurn, pickFaction, playCard, transferDefense, viewOf,
  type GameEvent, type GamePhase, type GameState,
} from "./game";
import { marchSourcesAgainst } from "./playability";
import { buildOffer, destroyOffer, type HarvestChoice } from "./harvest";
import type { RuleSelections } from "./rules";
import {
  deserializeGame, serializeGame, type SerializedGameState,
} from "./net-codec";

export const PROTOCOL_VERSION = 5;

/** Fingerprint of everything two deploys must agree about a card. The hello
 *  handshake compares this and refuses politely on a mismatch.
 *
 *  Re-exported rather than defined here: `cardRulesHash` lives with the cards
 *  it fingerprints, so a card author adding a behaviour table sees the rule
 *  beside the tables rather than in a network module. */
export { cardRulesHash } from "./cards";

/** The guest's move, the AiAction shape plus end-turn. `cardId` rides
 *  beside `cardIndex` so the host can refuse a hand-order mismatch
 *  instead of silently playing the wrong card. `harvest` rides the play
 *  the same way the pick rides `playCard`'s opts locally: every seat can
 *  hold a Turnip harvest now, so a guest's pick must cross the wire.
 *
 *  `sourceId` is Raid's tail, riding the play for the same reason the
 *  target does: the guest chose it and the host cannot infer it. Note
 *  what is NOT here - a counter-raid is an ordinary Raid played on the
 *  defender's own turn, so telegraphed attacks need no out-of-turn
 *  action and the "not this seat's turn" refusal stands untouched. */
export type NetAction =
  | {
      type: "play"; cardIndex: number; cardId: string; targetId?: string;
      sourceId?: string; harvest?: HarvestChoice;
    }
  | { type: "discard"; cardIndex: number; cardId: string }
  /** The conquest question's answer: how many defenders march over with the
   *  land. It rides the wire rather than resolving locally because a guest's
   *  state is a replica - a `transferDefense` applied to it moves points on
   *  one screen and nowhere else. No `from`/`to`: the host holds the
   *  question, and naming it again is only a second chance to disagree. */
  | { type: "transfer"; amount: number }
  | { type: "end-turn" };

export type NetMessage =
  /** Both directions on connect: refuse politely at the lobby, never
   *  desync mid-game. `name` is the sender's display name. `region` is the
   *  sender's `regionFingerprint()` - two screens on different maps must
   *  never be allowed to think they are sharing one. */
  | {
      type: "hello"; version: number; cards: string; region: string;
      name: string;
    }
  | { type: "refuse"; reason: string }
  /** Host -> guest, on connect and whenever the host's pick changes. */
  | { type: "lobby-host"; rules: RuleSelections; takenFactionId: string | null }
  /** Guest -> host: its build and chosen faction. Decks retired with the
   *  meta system - the host deals every seat the same starting deck. */
  | { type: "lobby-guest"; build: Strategy; factionId: string }
  | { type: "start"; state: SerializedGameState; guestFactionId: string }
  | { type: "action"; turn: number; seat: number; action: NetAction }
  /** The log never re-crosses the wire: `state.log` is empty and the guest
   *  splices `newEvents` into its own copy at `logFrom`, which is where they
   *  sat in the host's. The index rather than a bare append, so a message
   *  delivered twice cannot leave the guest holding two of each event. */
  | {
      type: "update"; state: SerializedGameState;
      logFrom: number; newEvents: GameEvent[];
    }
  /** Full state including the whole log: on start and on rejoin. */
  | { type: "snapshot"; state: SerializedGameState; guestFactionId: string }
  | { type: "reject"; reason: string }
  | { type: "ping" }
  | { type: "pong" };

export function seatOfFaction(state: GameState, factionId: string): number {
  return state.players.findIndex((p) => p.factionId === factionId);
}

/** Deals a game two humans are sitting at. One spelling, because the app
 *  deals and the tests deal, and a guest seated one way in the app and
 *  another in a test is a guest whose bugs no test can see.
 *
 *  Every seat gets the same starting deck, so the guest's pick carries only
 *  its BUILD: the deal rolls its seat a strategy like any AI seat, keeping
 *  the rng draw count a frozen contract, and the chosen build is stamped
 *  over it after.
 *
 *  The guest's land is RESERVED, because only the acting factions keep a
 *  leader and a land without one takes no turn: dealt like any other rival
 *  it would be drawn into the acting set or not, and a guest whose land was
 *  not drawn would sit through the whole game unable to play. */
export function dealNetGame(
  state: GameState,
  rng: Rng,
  picks: { hostFactionId: string; guestFactionId: string; guestBuild: Strategy },
): { state: GameState; guestSeat: number } {
  const dealt = pickFaction(state, picks.hostFactionId, rng, {
    reservedFactionIds: [picks.guestFactionId],
  });
  const guestSeat = seatOfFaction(dealt, picks.guestFactionId);
  return {
    state: {
      ...dealt,
      players: dealt.players.map((p, i) =>
        i === guestSeat ? { ...p, strategy: picks.guestBuild } : p,
      ),
    },
    guestSeat,
  };
}

/** Every action kind says how it is checked and how it is applied.
 *
 *  An exhaustive `Record`, the `NOTICE_RULES` shape: a new kind does not
 *  compile until both halves are written. `validateAction` used to be an
 *  if-chain that returned `null` for anything it did not recognise, so a new
 *  kind was checked by nobody and found that out on somebody's board.
 *
 *  The SHARED checks - in play, a real seat, this seat's turn, a live turn
 *  stamp - stay in `validateAction`. This is the per-kind half. */
export const NET_ACTION_RULES: {
  [K in NetAction["type"]]: {
    validate(
      state: GameState, seat: number, action: Extract<NetAction, { type: K }>,
    ): string | null;
    apply(
      state: GameState, rng: Rng, action: Extract<NetAction, { type: K }>,
    ): GameState;
  };
} = {
  play: {
    validate(state, seat, action) {
      const held = state.players[seat].hand[action.cardIndex];
      if (held !== action.cardId) {
        return "hand mismatch: card is not at that index";
      }
      // Every pick must come from the chooser's own offer - the host can
      // recompute both, so a stale or fabricated one is refused rather than
      // shuffled in or burned. Same trust model as the rest of the protocol:
      // races and bugs, not malice.
      //
      // BOTH arms that name a card, not only the build one. `destroyOffer`
      // holds back the cards a seat may not burn - a forced tribute among
      // them - and it was consulted by the screen alone, so the rule about
      // what may be destroyed lived nowhere the wire could see it.
      const pick = action.harvest;
      if (pick?.kind === "build" &&
          !buildOffer(state.players[seat]).includes(pick.cardId)) {
        return "harvest pick is not in your build";
      }
      if (pick?.kind === "destroy" &&
          !destroyOffer(state.players[seat]).includes(pick.cardId)) {
        return "that card cannot be burned";
      }
      // The source is checked on the same footing, and for the same reason.
      // Refusing beats redirecting here - a redirect would expose a land the
      // sender never chose to expose to the counter-raid.
      if (
        action.sourceId !== undefined && action.targetId !== undefined &&
        !marchSourcesAgainst(
          viewOf(state), state.players[seat].factionId, action.targetId,
        ).includes(action.sourceId)
      ) {
        return "no free army of yours borders that land";
      }
      return null;
    },
    apply: (state, rng, action) =>
      playCard(state, action.cardIndex, rng, action.targetId, {
        ...(action.harvest !== undefined ? { harvest: action.harvest } : {}),
        ...(action.sourceId !== undefined ? { sourceId: action.sourceId } : {}),
      }),
  },
  discard: {
    validate: (state, seat, action) =>
      state.players[seat].hand[action.cardIndex] === action.cardId
        ? null
        : "hand mismatch: card is not at that index",
    apply: (state, _rng, action) => discardCard(state, action.cardIndex),
  },
  transfer: {
    validate(state, seat, action) {
      // The sender's OWN conquest, recomputed here: a seat answering a
      // question it did not raise is exactly the bug this action exists to
      // stop. The upper bound is deliberately NOT checked - `transferDefense`
      // clamps through `transferLimit` at the moment it applies, and a second
      // limit computed now would disagree with it the first time the board
      // moved between the modal opening and the answer arriving.
      // An empty queue is the same answer as no queue: the sender has no
      // conquest waiting, whichever way the record got that way.
      const waiting = state.pendingTransfers[state.players[seat].factionId];
      if (waiting === undefined || waiting.length === 0) {
        return "no conquest of yours is waiting for defenders";
      }
      if (!Number.isInteger(action.amount) || action.amount < 0) {
        return "that is not a number of defenders";
      }
      return null;
    },
    // The faction is read off the state rather than taken on trust: the
    // shared checks have already pinned the sender to the seat on turn.
    apply: (state, _rng, action) => transferDefense(
      state, state.players[state.current].factionId, action.amount,
    ),
  },
  "end-turn": {
    validate: () => null,
    apply: (state) => endTurn(state),
  },
};

/** Races and bugs, not malice (trusted friends): is it this seat's turn, and
 *  is the named card really at that index. Card legality itself stays with
 *  playCard/discardCard, which return the state unchanged on a refused
 *  move. The per-kind half is `NET_ACTION_RULES`. */
export function validateAction(
  state: GameState, seat: number, turn: number, action: NetAction,
): string | null {
  if (state.phase !== "playing") return "the game is not in play";
  if (seat < 0 || seat >= state.players.length) return "no such seat";
  if (state.current !== seat) return "not this seat's turn";
  if (turn !== state.turn) return "stale turn stamp";
  const rule = NET_ACTION_RULES[action.type] as {
    validate(s: GameState, seat: number, a: NetAction): string | null;
  };
  return rule.validate(state, seat, action);
}

export function applyNetAction(
  state: GameState, rng: Rng, action: NetAction,
): GameState {
  const rule = NET_ACTION_RULES[action.type] as {
    apply(s: GameState, rng: Rng, a: NetAction): GameState;
  };
  return rule.apply(state, rng, action);
}

export function buildUpdate(
  state: GameState, sentLog: number,
): Extract<NetMessage, { type: "update" }> {
  return {
    type: "update",
    state: serializeGame({ ...state, log: [] }),
    logFrom: sentLog,
    newEvents: state.log.slice(sentLog),
  };
}

/** The state arrives whole; only the log is a delta, and `logFrom` is where
 *  the delta belongs. Spliced at that index rather than appended, which makes
 *  a re-delivered update idempotent: it overwrites the entries it carried the
 *  first time instead of adding a second copy of them.
 *
 *  That matters beyond a tidy log. The milestone drawer and the round
 *  summary are DERIVED from the log rather than stored, so a doubled entry is
 *  a doubled plague count on one screen and not the other. */
export function applyUpdate(
  prev: GameState | null,
  msg: Extract<NetMessage, { type: "update" }>,
): GameState {
  const bare = deserializeGame(msg.state);
  const kept = (prev?.log ?? []).slice(0, msg.logFrom);
  return { ...bare, log: [...kept, ...msg.newEvents] };
}

/** There is one `phase` field and it speaks for `humanSeats[0]`, the host.
 *  The guest maps it for presentation: the host's victory is the guest's
 *  defeat, and a host `defeat` the guest itself brought about is the guest's
 *  victory.
 *
 *  Two ways the guest can be the cause, and both read off the same field.
 *  `unified` names the faction that swallowed the map. `defeat` names the
 *  faction that incorporated the host - and if that was the guest, telling it
 *  that it lost is telling it the opposite of what it just did.
 *
 *  And one ending the engine cannot phrase at all: a guest annexed while the
 *  host plays on. The run legitimately continues for everybody else, so the
 *  guest's screen reads the board instead of the phase - `incorporated` is
 *  incorporated whoever is looking. It is checked FIRST, because a guest that
 *  is out of the run is out of it whatever the host's phase later says. */
export function guestPhaseView(
  state: GameState, guestFactionId: string,
): GamePhase {
  if (state.incorporated[guestFactionId] !== undefined) return "defeat";
  if (state.phase === "victory") return "defeat";
  if (state.phase === "defeat") {
    const ending = state.log[state.log.length - 1];
    if (
      (ending?.type === "unified" || ending?.type === "defeat") &&
      ending.overlordFactionId === guestFactionId
    ) {
      return "victory";
    }
  }
  return state.phase;
}

/** One duplex message channel. src/net.ts wraps a PeerJS
 *  DataConnection into this; wirePair below is the in-memory version
 *  the protocol tests run on, so no test ever imports peerjs. */
export interface Wire {
  send(msg: NetMessage): void;
  onMessage(fn: (msg: NetMessage) => void): void;
  onClose(fn: () => void): void;
  close(): void;
}

/** Two connected Wires with synchronous delivery. Close on either side
 *  closes both, like a real connection. */
export function wirePair(): [Wire, Wire] {
  const msgFns: ((m: NetMessage) => void)[][] = [[], []];
  const closeFns: (() => void)[][] = [[], []];
  let open = true;
  const side = (mine: number, theirs: number): Wire => ({
    send(m) {
      if (open) for (const fn of msgFns[theirs]) fn(m);
    },
    onMessage(fn) {
      msgFns[mine].push(fn);
    },
    onClose(fn) {
      closeFns[mine].push(fn);
    },
    close() {
      if (!open) return;
      open = false;
      for (const fns of closeFns) for (const fn of fns) fn();
    },
  });
  return [side(0, 1), side(1, 0)];
}
