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

export const PROTOCOL_VERSION = 7;

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
 *  target does: the guest chose it and the host cannot infer it. `spend`
 *  is how much of that land's defense the guest chose to tear out, riding
 *  the same way and for the same reason - and CLAMPED rather than refused
 *  on arrival, since "as little as the card allows" is the safe reading of
 *  a number a build sends that this one does not expect. Note
 *  what is NOT here - a counter-raid is an ordinary Raid played on the
 *  defender's own turn, so telegraphed attacks need no out-of-turn
 *  action and the "not this seat's turn" refusal stands untouched. */
export type NetAction =
  | {
      type: "play"; cardIndex: number; cardId: string; targetId?: string;
      sourceId?: string; spend?: number; harvest?: HarvestChoice;
    }
  | { type: "discard"; cardIndex: number; cardId: string }
  /** The conquest question's answer: how many defenders march over with the
   *  land. It rides the wire rather than resolving locally because a guest's
   *  state is a replica - a `transferDefense` applied to it moves points on
   *  one screen and nowhere else.
   *
   *  `from`/`to` name the conquest being answered. This used to say that
   *  naming it was "only a second chance to disagree", and the reverse is
   *  true: unnamed, an answer means "the front of somebody's queue", so one
   *  applied to a board that has moved lands on a different conquest or on
   *  none, and landing on none is indistinguishable from a rule refusing the
   *  move. The chance to disagree is the point - a disagreement that can be
   *  seen is one the screen can recover from, and the alternative is a
   *  question that stays owed with nothing able to notice. */
  | { type: "transfer"; from: string; to: string; amount: number }
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
 *  The WIRE checks - in play, a real seat, a live turn stamp - stay in
 *  `validateAction`; "whose turn is it" is a rule rather than a wire guard and
 *  lives in `validateRules`, applied per `onTurn` below. This is the per-kind
 *  half.
 *
 *  Both halves take the ACTING SEAT, and neither may re-derive it from
 *  `state.current`. The two agree on every ordinary path, which is exactly why
 *  a rule that reads the state instead reads correctly for months: a conquest
 *  is queued at its taker's own turn start, and a play is made on its own
 *  turn. They come apart the moment an answer outlives the board it was asked
 *  about - see `transfer` below, and the note on `decide` in src/main.ts. */
export const NET_ACTION_RULES: {
  [K in NetAction["type"]]: {
    /** Whether this is a move made ON one's turn.
     *
     *  Three of the four are, and their `apply` reaches the engine through
     *  `playCard`/`discardCard`/`endTurn`, which act on `state.current` and
     *  take no seat. `onTurn` is what makes that safe rather than assumed:
     *  `validateRules` refuses those kinds unless the acting seat IS
     *  `state.current`, so by the time the engine reads the board the two
     *  cannot differ.
     *
     *  The conquest transfer is the one that is not. It answers a modal, and
     *  a modal outlives the board it was raised over - refusing the answer
     *  because the turn moved is refusing the player their own decision. It
     *  is applied for the seat that was ASKED, which is why its rule takes
     *  the seat and the other four do not need to. */
    onTurn: boolean;
    validate(
      state: GameState, seat: number, action: Extract<NetAction, { type: K }>,
    ): string | null;
    apply(
      state: GameState, rng: Rng, action: Extract<NetAction, { type: K }>,
      seat: number,
    ): GameState;
  };
} = {
  play: {
    onTurn: true,
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
        ...(action.spend !== undefined ? { spend: action.spend } : {}),
      }),
  },
  discard: {
    onTurn: true,
    validate: (state, seat, action) =>
      state.players[seat].hand[action.cardIndex] === action.cardId
        ? null
        : "hand mismatch: card is not at that index",
    apply: (state, _rng, action) => discardCard(state, action.cardIndex),
  },
  transfer: {
    onTurn: false,
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
      const front = waiting?.[0];
      if (front === undefined) {
        return "no conquest of yours is waiting for defenders";
      }
      // The pair the sender was SHOWN. A mismatch means the board moved under
      // the modal - somebody answered this conquest already, or a different
      // one is in front of it now - and that has to come back as a reason
      // rather than as an engine call that quietly changes nothing. It is the
      // whole point of naming the conquest: `transferDefense` returning its
      // input is indistinguishable from a rule refusing the move, and a
      // screen that cannot tell those apart cannot re-raise the question.
      if (front.from !== action.from || front.to !== action.to) {
        return "that is not the conquest waiting for an answer";
      }
      if (!Number.isInteger(action.amount) || action.amount < 0) {
        return "that is not a number of defenders";
      }
      return null;
    },
    // The SENDER's faction, and never `state.players[state.current]`: the
    // question was raised for one seat and has to be answered for that same
    // seat. `onTurn: false` above is why the two can legitimately differ here
    // and nowhere else.
    apply: (state, _rng, action, seat) => transferDefense(
      state, state.players[seat].factionId, action.from, action.to,
      action.amount,
    ),
  },
  "end-turn": {
    onTurn: true,
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
  if (turn !== state.turn) return "stale turn stamp";
  return validateRules(state, seat, action);
}

/** The per-kind half ALONE - what the rules say about this move, with none of
 *  the wire's race guards.
 *
 *  Separated because the two answer different questions and only one of them
 *  travels. "Is it your turn" and "is your turn stamp current" are about a
 *  message that crossed a wire and may have been overtaken; "does this seat
 *  own a conquest that is waiting" is a rule, and it is just as true on a solo
 *  screen. `commitDecision` ran neither locally, so a local answer the rules
 *  would not take came back as the generic `RULES_REFUSED` - or, where the
 *  engine clamps rather than refuses, was simply taken. The turn checks are
 *  deliberately NOT included here: a conquest question is answered against the
 *  board as it stands when the player answers it, which is not always still
 *  the asker's turn. */
export function validateRules(
  state: GameState, seat: number, action: NetAction,
): string | null {
  if (seat < 0 || seat >= state.players.length) return "no such seat";
  const rule = NET_ACTION_RULES[action.type] as {
    onTurn: boolean;
    validate(s: GameState, seat: number, a: NetAction): string | null;
  };
  // "Whose turn is it" is a RULE for the three kinds made on a turn, not a
  // wire guard, and it lives here rather than in `validateAction` for two
  // reasons. It is what lets those kinds' `apply` keep reading `state.current`
  // safely - see `onTurn`. And applying it to all four refused the conquest
  // answer whenever the board moved under its modal, which is the one kind for
  // which that is normal.
  if (rule.onTurn && state.current !== seat) return "not this seat's turn";
  return rule.validate(state, seat, action);
}

/** `seat` is who is ACTING, and it is required rather than derived: see the
 *  note on `NET_ACTION_RULES`. The host passes the guest's seat when it
 *  applies a guest's action, and its own when it plays. */
export function applyNetAction(
  state: GameState, rng: Rng, action: NetAction, seat: number,
): GameState {
  const rule = NET_ACTION_RULES[action.type] as {
    apply(s: GameState, rng: Rng, a: NetAction, seat: number): GameState;
  };
  return rule.apply(state, rng, action, seat);
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
