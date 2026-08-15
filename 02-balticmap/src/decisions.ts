/** Who answers for a seat, and the loop that plays the ones nobody does.
 *
 *  Not a `net-` module on purpose: the questions here have the same answers
 *  in a solo game, where every seat but one is an AI and there is no wire at
 *  all. `src/net-protocol.ts` owns what crosses between two machines; this
 *  owns what a screen does with the seats in front of it, and it is pure so
 *  a test can drive it without a DOM.
 */
import { aiTakeTurn } from "./ai";
import type { Rng } from "./cards";
import { advance, keepPlaying, surrender, type GameState } from "./game";
import type { HarvestChoice } from "./harvest";
import {
  applyNetAction, validateAction, type NetAction,
} from "./net-protocol";

/** The seats a screen can tell apart. `remoteSeat` is the other human's, and
 *  it is null in a solo game and on a guest - a guest runs no seat but its
 *  own, so the host's seat is not a thing it is ever waiting on locally. */
export interface Seats {
  localSeat: number;
  remoteSeat: number | null;
}

export type Controller = "local" | "remote" | "ai";

/** Who decides this seat's turn. The one reader of "is this mine", so a
 *  surface asking whether to lock input, to run the AI chain or to draw a
 *  waiting line all get the same answer from one place. */
export function controllerOf(seat: number, seats: Seats): Controller {
  if (seat === seats.localSeat) return "local";
  if (seats.remoteSeat !== null && seat === seats.remoteSeat) return "remote";
  return "ai";
}

/** A stalled chain is a hung game, and a hung game says nothing about why.
 *  The bound is far above any real turn order - it exists so a rule that
 *  stopped advancing shows up in the console instead of freezing the tab. */
export const MAX_AI_TURNS = 1000;

/** Plays the ONE seat nobody is sitting at that holds the turn, or answers
 *  null when a person holds it or the run has ended.
 *
 *  The unit the screen steps through. A round used to resolve in a single
 *  statement and then be replayed out of a state that had already run to the
 *  end of it, which put arrows on the map that belonged to turns after the
 *  one being shown. Stepping seat by seat means what is drawn while a seat's
 *  turn is animated is the board as that seat left it. */
export function oneAiSeat(
  state: GameState, rng: Rng, seats: Seats,
): GameState | null {
  if (state.phase !== "playing" || controllerOf(state.current, seats) !== "ai") {
    return null;
  }
  return advance(aiTakeTurn(state, rng), rng);
}

/** Plays every seat nobody is sitting at, until a human is on turn or the
 *  run ends. Handed the state rather than reading one, so the screen's
 *  animation and status work stays in `src/main.ts` and the turn-order half
 *  is testable on its own.
 *
 *  Built on `oneAiSeat` rather than beside it: the screen walks the chain one
 *  seat at a time so it can animate between them, and two spellings of "whose
 *  turn is it and what does a turn do" is how those two start to differ. */
export function runAiSeats(
  state: GameState, rng: Rng, seats: Seats,
): GameState {
  let out = state;
  let turns = 0;
  for (;;) {
    const next = oneAiSeat(out, rng, seats);
    if (next === null) return out;
    out = next;
    if (++turns > MAX_AI_TURNS) {
      console.error("AI chain stalled - breaking");
      return out;
    }
  }
}

/** Everything the local player can decide while a game is in play. One
 *  variant per QUESTION the screen asks, not one per call site: a raid aimed
 *  by dragging and one aimed by two clicks are the same decision, and they
 *  must not be able to reach the rules by two different routes. */
export type Decision =
  | {
      kind: "play"; cardIndex: number; cardId: string;
      targetId?: string; sourceId?: string;
      /** How much defense a raid tears out of its source - the arrow's whole
       *  strength. A field on `play` and not a kind of its own, unlike the
       *  harvest boon below: the amount is settled at the same moment the
       *  target is, before anything is committed, so it is part of playing
       *  the card rather than a question raised about a play that happened. */
      spend?: number;
    }
  /** Its own kind and not a field on `play`, because the boon is settled
   *  BEFORE the card is committed - and because a question that is not a row
   *  in the table below is a question a second person never gets asked. */
  | { kind: "harvest"; cardIndex: number; cardId: string; choice: HarvestChoice }
  | { kind: "discard"; cardIndex: number; cardId: string }
  | { kind: "end-turn" }
  | { kind: "transfer"; amount: number }
  | { kind: "surrender" }
  /** Its own kind and not a variant of anything: it is the one decision taken
   *  after an ending rather than in play, and the only one that puts a phase
   *  BACK. */
  | { kind: "keep-playing" };

export type DecisionKind = Decision["kind"];

/** What the screen owes once the decision has landed. Per KIND rather than
 *  per call site: a play flies a card and then lets the world move behind it,
 *  an action just lets the world move, and an answer only repaints. */
export type Settle = "play" | "action" | "repaint";

/** A decision either names the `NetAction` it crosses the wire as, or says in
 *  a sentence why it is the host's alone. There is no third option, which is
 *  the point: a new decision does not compile until somebody has decided. */
export type Route<D> =
  | { settle: Settle; wire(d: D): NetAction }
  | {
      settle: Settle;
      hostOnly: string;
      apply(state: GameState, rng: Rng, d: D): GameState;
    };

/** The table. Exhaustive `Record`, the `NOTICE_RULES` shape. */
export const DECISION_ROUTES: {
  [K in DecisionKind]: Route<Extract<Decision, { kind: K }>>;
} = {
  play: {
    settle: "play",
    wire: (d) => ({
      type: "play", cardIndex: d.cardIndex, cardId: d.cardId,
      ...(d.targetId !== undefined ? { targetId: d.targetId } : {}),
      ...(d.sourceId !== undefined ? { sourceId: d.sourceId } : {}),
      ...(d.spend !== undefined ? { spend: d.spend } : {}),
    }),
  },
  harvest: {
    settle: "play",
    wire: (d) => ({
      type: "play", cardIndex: d.cardIndex, cardId: d.cardId,
      harvest: d.choice,
    }),
  },
  discard: {
    settle: "action",
    wire: (d) => ({
      type: "discard", cardIndex: d.cardIndex, cardId: d.cardId,
    }),
  },
  "end-turn": { settle: "action", wire: () => ({ type: "end-turn" }) },
  transfer: {
    settle: "repaint",
    wire: (d) => ({ type: "transfer", amount: d.amount }),
  },
  surrender: {
    settle: "repaint",
    hostOnly:
      "Giving up ends the run for both people, and `phase` speaks for the " +
      "host's seat: a second person conceding would be conceding somebody " +
      "else's game. Their way out is closing the tab.",
    apply: (state) => surrender(state),
  },
  "keep-playing": {
    // `action` and not `repaint`, and this is load-bearing rather than tidy.
    // The ending may have been read at a turn START - a claim answering, an
    // arrival, a restless raid at the round wrap - so the seat on turn can be
    // an AI's with its turn still open. `advance` no-ops on an open turn, so
    // settling as an action falls through to the AI chain and that seat
    // plays; a repaint would hand the board back with nobody to move it.
    settle: "action",
    hostOnly:
      "The victory being withdrawn is the host's, and `phase` speaks for the " +
      "host's seat. Unlike conceding this takes nothing from the second " +
      "person - it hands back a run they were still standing in - but it is " +
      "not theirs to decide.",
    apply: (state) => keepPlaying(state),
  },
};

/** Whether this screen's player answers this question at all. The ONE reader
 *  of the host-only half, so the surface that RAISES a question is gated by
 *  the same table that routes the answer - and a person is never shown a
 *  question whose answer has nowhere to go. */
export function decidedHere(kind: DecisionKind, role: Role): boolean {
  return role !== "guest" || "wire" in DECISION_ROUTES[kind];
}

export type Role = "solo" | "host" | "guest";

export interface DecisionDeps {
  role: Role;
  localSeat: number;
  state: GameState;
  rng: Rng;
  /** Guest -> host. */
  send(action: NetAction): void;
  /** Host and solo: the state the decision produced. */
  apply(next: GameState): void;
  /** Host: the other screen is owed this now. Called from here, in order,
   *  right after `apply`, so a call site cannot forget it. */
  pushUpdate(): void;
}

export type DecisionResult =
  | { outcome: "sent" }
  | { outcome: "applied"; settle: Settle }
  | { outcome: "refused"; reason: string };

const RULES_REFUSED = "the rules refused that move";

/** The one place a decision turns into a state change.
 *
 *  Every seat's play goes through `applyNetAction` - the same call a guest's
 *  action arrives at on the host. One engine call, two transports, so an opt
 *  a play carries cannot reach one person's route and not the other's.
 *
 *  A guest checks the move against its own replica before sending. The host
 *  would refuse the same move for the same reason, so asking here costs a
 *  round trip and tells the player why on the spot. */
export function commitDecision(
  deps: DecisionDeps, d: Decision,
): DecisionResult {
  const route = DECISION_ROUTES[d.kind] as Route<Decision>;
  if (!("wire" in route)) {
    if (deps.role === "guest") {
      return { outcome: "refused", reason: route.hostOnly };
    }
    const next = route.apply(deps.state, deps.rng, d);
    if (next === deps.state) return { outcome: "refused", reason: RULES_REFUSED };
    deps.apply(next);
    deps.pushUpdate();
    return { outcome: "applied", settle: route.settle };
  }
  const action = route.wire(d);
  if (deps.role === "guest") {
    const err = validateAction(
      deps.state, deps.localSeat, deps.state.turn, action,
    );
    if (err !== null) return { outcome: "refused", reason: err };
    deps.send(action);
    return { outcome: "sent" };
  }
  const next = applyNetAction(deps.state, deps.rng, action);
  if (next === deps.state) return { outcome: "refused", reason: RULES_REFUSED };
  deps.apply(next);
  deps.pushUpdate();
  return { outcome: "applied", settle: route.settle };
}
