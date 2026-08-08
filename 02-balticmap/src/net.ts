import Peer, { type DataConnection } from "peerjs";
import type { NetMessage, Wire } from "./net-protocol";

/** WebRTC connections can half-die without firing close, so the wire
 *  pings and declares death on silence. Both numbers are generous for
 *  a turn-based game. */
const PING_EVERY_MS = 5000;
const DEAD_AFTER_MS = 15000;

function wrap(conn: DataConnection): Wire {
  const msgFns: ((m: NetMessage) => void)[] = [];
  const closeFns: (() => void)[] = [];
  let lastSeen = Date.now();
  let closed = false;
  const shutdown = (): void => {
    if (closed) return;
    closed = true;
    clearInterval(timer);
    try {
      conn.close();
    } catch {
      // already closing; nothing to do
    }
    for (const fn of closeFns) fn();
  };
  const timer = setInterval(() => {
    if (Date.now() - lastSeen > DEAD_AFTER_MS) {
      shutdown();
      return;
    }
    if (conn.open) conn.send({ type: "ping" } satisfies NetMessage);
  }, PING_EVERY_MS);
  conn.on("data", (raw) => {
    lastSeen = Date.now();
    const msg = raw as NetMessage;
    if (msg.type === "ping") {
      if (conn.open) conn.send({ type: "pong" } satisfies NetMessage);
      return;
    }
    if (msg.type === "pong") return;
    for (const fn of msgFns) fn(msg);
  });
  conn.on("close", shutdown);
  conn.on("error", shutdown);
  return {
    send(m) {
      if (conn.open) conn.send(m);
    },
    onMessage(fn) {
      msgFns.push(fn);
    },
    onClose(fn) {
      closeFns.push(fn);
    },
    close: shutdown,
  };
}

/** Opens a Peer on the public PeerJS cloud broker and reports its id
 *  (the join link's payload). Every incoming connection is wrapped and
 *  handed over - mid-game that is the guest rejoining, and the session
 *  layer decides what that means. The Peer stays open for the whole
 *  session so the link keeps working. */
export function hostPeer(cb: {
  onOpen(id: string): void;
  onWire(wire: Wire): void;
  onError(reason: string): void;
}): { close(): void } {
  const peer = new Peer();
  peer.on("open", (id) => cb.onOpen(id));
  peer.on("connection", (conn) => {
    conn.on("open", () => cb.onWire(wrap(conn)));
  });
  peer.on("error", (err) => cb.onError(String(err)));
  return { close: () => peer.destroy() };
}

export function joinPeer(hostId: string, cb: {
  onWire(wire: Wire): void;
  onError(reason: string): void;
}): { close(): void } {
  const peer = new Peer();
  peer.on("open", () => {
    const conn = peer.connect(hostId, { reliable: true });
    conn.on("open", () => cb.onWire(wrap(conn)));
    conn.on("error", (err) => cb.onError(String(err)));
  });
  peer.on("error", (err) => cb.onError(String(err)));
  return { close: () => peer.destroy() };
}
