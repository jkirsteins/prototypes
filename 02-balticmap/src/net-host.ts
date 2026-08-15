import type { GameState } from "./game";
import type { Rng, Strategy } from "./cards";
import type { RuleSelections } from "./rules";
import { serializeGame } from "./net-codec";
import { regionFingerprint } from "./regions";
import { isUnheld } from "./relations";
import {
  applyNetAction, buildUpdate, cardRulesHash, PROTOCOL_VERSION,
  seatOfFaction, validateAction, type NetMessage, type Wire,
} from "./net-protocol";

export interface HostDeps {
  getGame(): GameState;
  setGame(g: GameState): void;
  rng: Rng;
  name: string;
  rules(): RuleSelections;
  hostFactionId(): string | null;
  onGuestHello(name: string): void;
  onGuestPick(pick: { build: Strategy; factionId: string }): void;
  onGuestAction(): void;
  onClosed(): void;
}

export interface HostSession {
  guestName(): string | null;
  guestPick(): { build: Strategy; factionId: string } | null;
  guestFactionId(): string | null;
  markStarted(guestFactionId: string): void;
  pushUpdate(): void;
  sendLobby(): void;
  close(): void;
}

export function createHostSession(
  wire: Wire,
  deps: HostDeps,
  resume?: { guestFactionId: string },
): HostSession {
  let guestName: string | null = null;
  let guestPick: { build: Strategy; factionId: string } | null = null;
  // rejoin - the game is already dealt and this is the guest's faction,
  // so the next hello gets a snapshot, not a lobby.
  let guestFactionId: string | null = resume?.guestFactionId ?? null;
  /** Log events the guest already has; buildUpdate slices from here. */
  let sentLog = 0;

  const sendLobby = (): void => {
    wire.send({
      type: "lobby-host",
      rules: deps.rules(),
      takenFactionId: deps.hostFactionId(),
    });
  };

  const handle = (msg: NetMessage): void => {
    const g = deps.getGame();
    switch (msg.type) {
      case "hello": {
        if (msg.version !== PROTOCOL_VERSION || msg.cards !== cardRulesHash()) {
          wire.send({
            type: "refuse",
            reason: "the two builds differ - reload both pages on the same version",
          });
          wire.close();
          return;
        }
        if (msg.region !== regionFingerprint()) {
          wire.send({
            type: "refuse",
            reason: "the two screens are on different regions - pick the same region on both and reload",
          });
          wire.close();
          return;
        }
        guestName = msg.name;
        wire.send({
          type: "hello", version: PROTOCOL_VERSION, cards: cardRulesHash(),
          region: regionFingerprint(), name: deps.name,
        });
        deps.onGuestHello(msg.name);
        if (g.phase === "playing" && guestFactionId !== null) {
          // The guest coming back mid-game: full state, log included.
          sentLog = g.log.length;
          wire.send({
            type: "snapshot", state: serializeGame(g), guestFactionId,
          });
        } else {
          sendLobby();
        }
        return;
      }
      case "lobby-guest": {
        if (!g.factionIds.includes(msg.factionId)) {
          wire.send({ type: "reject", reason: "unknown faction" });
          return;
        }
        if (msg.factionId === deps.hostFactionId()) {
          wire.send({ type: "reject", reason: "faction already taken" });
          return;
        }
        // A land already inside a realm on a map that opened with realms
        // standing. The guest's own screen greys it and drops the click, but a
        // pick crosses the wire and the host trusts nothing that arrives on it:
        // `actingFactions` would quietly drop such a reservation and deal the
        // guest a seat with no ruler, which is a person skipped for the rest of
        // the run - a stall, where a reject is a sentence they can act on.
        if (!isUnheld(msg.factionId, g.overlords, g.incorporated)) {
          wire.send({ type: "reject", reason: "faction answers to another" });
          return;
        }
        guestPick = { build: msg.build, factionId: msg.factionId };
        deps.onGuestPick(guestPick);
        return;
      }
      case "action": {
        const seat =
          guestFactionId === null ? -1 : seatOfFaction(g, guestFactionId);
        const err =
          msg.seat !== seat
            ? "not your seat"
            : validateAction(g, seat, msg.turn, msg.action);
        if (err !== null) {
          wire.send({ type: "reject", reason: err });
          return;
        }
        // The GUEST's seat, which `validateAction` has just pinned to the one
        // the message claims. Never `g.current` - see NET_ACTION_RULES.
        const next = applyNetAction(g, deps.rng, msg.action, seat);
        if (next === g) {
          wire.send({ type: "reject", reason: "the rules refused that move" });
          return;
        }
        deps.setGame(next);
        pushUpdate();
        deps.onGuestAction();
        return;
      }
      // The host never receives these; ping/pong die in the wire wrap.
      case "refuse": case "lobby-host": case "start": case "update":
      case "snapshot": case "reject": case "ping": case "pong":
        return;
    }
  };

  const pushUpdate = (): void => {
    const g = deps.getGame();
    wire.send(buildUpdate(g, sentLog));
    sentLog = g.log.length;
  };

  wire.onMessage(handle);
  wire.onClose(deps.onClosed);

  return {
    guestName: () => guestName,
    guestPick: () => guestPick,
    guestFactionId: () => guestFactionId,
    markStarted(fid) {
      guestFactionId = fid;
      const g = deps.getGame();
      sentLog = g.log.length;
      wire.send({ type: "start", state: serializeGame(g), guestFactionId: fid });
    },
    pushUpdate,
    sendLobby,
    close: () => wire.close(),
  };
}
