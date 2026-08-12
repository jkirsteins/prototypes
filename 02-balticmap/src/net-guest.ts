import type { GameEvent, GameState } from "./game";
import type { Strategy } from "./cards";
import type { RuleSelections } from "./rules";
import { deserializeGame } from "./net-codec";
import { regionFingerprint } from "./regions";
import {
  applyUpdate, cardRulesHash, PROTOCOL_VERSION, seatOfFaction,
  type NetAction, type NetMessage, type Wire,
} from "./net-protocol";

export interface GuestDeps {
  name: string;
  onHostHello(name: string): void;
  onLobby(info: { rules: RuleSelections; takenFactionId: string | null }): void;
  /** A new state from the host. `source` says which message carried it,
   *  because the screen has to render them differently: an `update` is one
   *  step the guest can watch land, while a `start` or a `snapshot` is a
   *  whole game arriving at once - flying every card of a rejoined game's
   *  log, and raising a round summary over it, is not a replay anybody
   *  asked for.
   *
   *  `newEvents` is what an `update` appended, straight off the message, and
   *  is absent for the two that arrive whole. The screen must not re-derive
   *  it by slicing the log: `applyUpdate` splices at the host's `logFrom`, so
   *  an update delivered twice, or one overlapping what this guest already
   *  holds, grows the log by less than it carried - and the tail a slice
   *  produces is then short by exactly the events it must not skip. */
  onState(
    g: GameState, guestFactionId: string,
    source: "start" | "snapshot" | "update",
    newEvents?: GameEvent[],
  ): void;
  onReject(reason: string): void;
  onRefused(reason: string): void;
  onClosed(): void;
}

export interface GuestSession {
  hostName(): string | null;
  guestFactionId(): string | null;
  game(): GameState | null;
  sendPick(build: Strategy, factionId: string): void;
  sendAction(a: NetAction): void;
  close(): void;
}

export function createGuestSession(wire: Wire, deps: GuestDeps): GuestSession {
  let hostName: string | null = null;
  let guestFactionId: string | null = null;
  let game: GameState | null = null;

  const handle = (msg: NetMessage): void => {
    switch (msg.type) {
      case "hello":
        // The host is authoritative and already refused a mismatch on its
        // own hello, but checking here too means a host that got that
        // wrong leaves this screen closing the wire rather than silently
        // rendering the other region's map.
        if (msg.region !== regionFingerprint()) {
          deps.onRefused(
            "the two screens are on different regions - pick the same region on both and reload",
          );
          wire.close();
          return;
        }
        hostName = msg.name;
        deps.onHostHello(msg.name);
        return;
      case "refuse":
        deps.onRefused(msg.reason);
        return;
      case "lobby-host":
        deps.onLobby({ rules: msg.rules, takenFactionId: msg.takenFactionId });
        return;
      case "start":
      case "snapshot":
        guestFactionId = msg.guestFactionId;
        game = deserializeGame(msg.state);
        deps.onState(game, guestFactionId, msg.type);
        return;
      case "update":
        if (guestFactionId === null) return; // update before start: drop
        game = applyUpdate(game, msg);
        deps.onState(game, guestFactionId, "update", msg.newEvents);
        return;
      case "reject":
        deps.onReject(msg.reason);
        return;
      // Guest never receives these; ping/pong die in the wire wrap.
      case "lobby-guest": case "action": case "ping": case "pong":
        return;
    }
  };

  wire.onMessage(handle);
  wire.onClose(deps.onClosed);
  wire.send({
    type: "hello", version: PROTOCOL_VERSION, cards: cardRulesHash(),
    region: regionFingerprint(), name: deps.name,
  });

  return {
    hostName: () => hostName,
    guestFactionId: () => guestFactionId,
    game: () => game,
    sendPick(build, factionId) {
      wire.send({ type: "lobby-guest", build, factionId });
    },
    sendAction(a) {
      if (game === null || guestFactionId === null) return;
      wire.send({
        type: "action", turn: game.turn,
        seat: seatOfFaction(game, guestFactionId), action: a,
      });
    },
    close: () => wire.close(),
  };
}
