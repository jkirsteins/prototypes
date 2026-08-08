import { CARDS, type Rng, type Strategy } from "./cards";
import {
  discardCard, endTurn, playCard,
  type GameEvent, type GamePhase, type GameState,
} from "./game";
import { harvestPool, type HarvestChoice } from "./harvest";
import type { RuleSelections } from "./rules";
import {
  deserializeGame, serializeGame, type SerializedGameState,
} from "./net-codec";

export const PROTOCOL_VERSION = 2;

/** Fingerprint of the build's card set. Two deploys whose CARDS differ
 *  cannot share a game - hand indexes and rules text would disagree -
 *  so the hello handshake compares this and refuses politely. */
export function cardSetHash(): string {
  return Object.keys(CARDS).sort().join(",");
}

/** The guest's move, the AiAction shape plus end-turn. `cardId` rides
 *  beside `cardIndex` so the host can refuse a hand-order mismatch
 *  instead of silently playing the wrong card. `harvest` rides the play
 *  the same way the pick rides `playCard`'s opts locally: every seat can
 *  hold a Turnip harvest now, so a guest's pick must cross the wire. */
export type NetAction =
  | {
      type: "play"; cardIndex: number; cardId: string; targetId?: string;
      harvest?: HarvestChoice;
    }
  | { type: "discard"; cardIndex: number; cardId: string }
  | { type: "end-turn" };

export type NetMessage =
  /** Both directions on connect: refuse politely at the lobby, never
   *  desync mid-game. `name` is the sender's display name. */
  | { type: "hello"; version: number; cards: string; name: string }
  | { type: "refuse"; reason: string }
  /** Host -> guest, on connect and whenever the host's pick changes. */
  | { type: "lobby-host"; rules: RuleSelections; takenFactionId: string | null }
  /** Guest -> host: its build and chosen faction. Decks retired with the
   *  meta system - the host deals every seat the same starting deck. */
  | { type: "lobby-guest"; build: Strategy; factionId: string }
  | { type: "start"; state: SerializedGameState; guestFactionId: string }
  | { type: "action"; turn: number; seat: number; action: NetAction }
  /** The log never re-crosses the wire: `state.log` is empty and the
   *  guest appends `newEvents` to its own copy. */
  | { type: "update"; state: SerializedGameState; newEvents: GameEvent[] }
  /** Full state including the whole log: on start and on rejoin. */
  | { type: "snapshot"; state: SerializedGameState; guestFactionId: string }
  | { type: "reject"; reason: string }
  | { type: "ping" }
  | { type: "pong" };

export function seatOfFaction(state: GameState, factionId: string): number {
  return state.players.findIndex((p) => p.factionId === factionId);
}

/** Races and bugs, not malice (trusted friends): is it this seat's
 *  turn, and is the named card really at that index. Card legality
 *  itself stays with playCard/discardCard, which return the state
 *  unchanged on a refused move. */
export function validateAction(
  state: GameState, seat: number, turn: number, action: NetAction,
): string | null {
  if (state.phase !== "playing") return "the game is not in play";
  if (seat < 0 || seat >= state.players.length) return "no such seat";
  if (state.current !== seat) return "not this seat's turn";
  if (turn !== state.turn) return "stale turn stamp";
  if (action.type === "end-turn") return null;
  if (state.players[seat].hand[action.cardIndex] !== action.cardId) {
    return "hand mismatch: card is not at that index";
  }
  // The harvest pick must come from the chooser's own pool - the host can
  // recompute it, so a stale or fabricated pick is refused rather than
  // shuffled in. Same trust model as the rest of the protocol: races and
  // bugs, not malice.
  if (
    action.type === "play" && action.harvest !== undefined &&
    !("skip" in action.harvest) &&
    !harvestPool(state.players[seat]).includes(action.harvest.cardId)
  ) {
    return "harvest pick is not in your pool";
  }
  return null;
}

export function applyNetAction(
  state: GameState, rng: Rng, action: NetAction,
): GameState {
  switch (action.type) {
    case "play":
      return playCard(state, action.cardIndex, rng, action.targetId, {
        ...(action.harvest !== undefined ? { harvest: action.harvest } : {}),
      });
    case "discard":
      return discardCard(state, action.cardIndex);
    case "end-turn":
      return endTurn(state);
  }
}

export function buildUpdate(
  state: GameState, sentLog: number,
): Extract<NetMessage, { type: "update" }> {
  return {
    type: "update",
    state: serializeGame({ ...state, log: [] }),
    newEvents: state.log.slice(sentLog),
  };
}

export function applyUpdate(
  prev: GameState | null,
  msg: Extract<NetMessage, { type: "update" }>,
): GameState {
  const bare = deserializeGame(msg.state);
  return { ...bare, log: [...(prev?.log ?? []), ...msg.newEvents] };
}

/** The engine's endings are host-centric (they pivot on humanSeat, the
 *  host's seat 0). The guest maps the phase for presentation: the
 *  host's victory is the guest's defeat, and a host `defeat` the guest
 *  itself brought about is the guest's victory. See the spec's
 *  host-seat privileges section.
 *
 *  Two ways the guest can be the cause, and both read off the same
 *  field. `unified` names the faction that swallowed the map. `defeat`
 *  names the faction that incorporated the host - and if that was the
 *  guest, telling it that it lost is telling it the opposite of what it
 *  just did. */
export function guestPhaseView(
  state: GameState, guestFactionId: string,
): GamePhase {
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
