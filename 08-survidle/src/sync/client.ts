import type { LeaseView } from "./lease";
import type { Head, Latest, LeaseResult, PutResult, SocketEvents, Store } from "./store";

/**
 * The store client: the one module that knows the Worker's routes. No DOM,
 * no game state. Every request carries the device id, and the lease
 * token travels as a header on a put and as a query parameter on the
 * socket, since a browser cannot set headers on a WebSocket upgrade.
 *
 * Routes: `docs/superpowers/specs/2026-09-11-survidle-save-sync-design.md`.
 */

export interface ClientOptions {
  baseUrl: string;
  code: string;
  device: string;
  label: string;
  fetch?: typeof fetch;
  WebSocket?: typeof WebSocket;
}

/** The store answered with a status the client has no reading for. */
export class StoreError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

/** Reconnect delays after a socket drop, in ms: quick at first, then no faster than every half minute. */
const RECONNECT_MS = [1000, 2000, 5000, 10000, 30000];

export function createStoreClient(o: ClientOptions): Store {
  const doFetch = o.fetch ?? ((input, init) => fetch(input, init));
  const base = o.baseUrl.replace(/\/+$/, "");
  const url = (tail: string) => `${base}/w/${o.code}/${tail}`;
  const headers = (extra: Record<string, string> = {}) => ({ "X-Device": o.device, "X-Device-Label": o.label, ...extra });

  let socket: WebSocket | null = null;
  let socketToken: string | null = null;
  let socketEvents: SocketEvents | null = null;
  let drops = 0;
  let reconnect: ReturnType<typeof setTimeout> | null = null;

  function connect(): void {
    if (!socketToken || !socketEvents) return;
    const WS = o.WebSocket ?? WebSocket;
    const wsUrl = `${url("ws").replace(/^http/, "ws")}?token=${encodeURIComponent(socketToken)}&device=${encodeURIComponent(o.device)}`;
    const ws = new WS(wsUrl);
    const token = socketToken;
    const events = socketEvents;
    let revoked = false;
    ws.addEventListener("open", () => {
      drops = 0;
      events.open();
    });
    ws.addEventListener("message", (ev) => {
      let msg: { type?: string; by?: string; at?: number };
      try {
        msg = JSON.parse(String(ev.data));
      } catch {
        return;
      }
      if (msg.type === "revoked") {
        revoked = true;
        events.revoked(String(msg.by ?? "another device"), Number(msg.at) || Date.now());
      }
    });
    ws.addEventListener("close", () => {
      if (socket === ws) socket = null;
      // Closed by us, or by a revoke the message already delivered: not a drop.
      if (revoked || socketToken !== token) return;
      events.dropped();
      const wait = RECONNECT_MS[Math.min(drops, RECONNECT_MS.length - 1)];
      drops++;
      reconnect = setTimeout(() => { reconnect = null; connect(); }, wait);
    });
    socket = ws;
  }

  return {
    async fetchLatest(): Promise<Latest | null> {
      const res = await doFetch(url("save"), { headers: headers() });
      if (res.status === 404) return null;
      if (!res.ok) throw new StoreError(res.status, `GET save: ${res.status}`);
      return { text: await res.text(), ...envelope(res.headers) };
    },
    async headLatest(): Promise<Head> {
      const res = await doFetch(url("save"), { method: "HEAD", headers: headers() });
      if (res.status === 404) return { exists: false, ...envelope(res.headers) };
      if (!res.ok) throw new StoreError(res.status, `HEAD save: ${res.status}`);
      return { exists: true, ...envelope(res.headers) };
    },
    async putSave(text, version, savedAt, token, keepalive): Promise<PutResult> {
      const res = await doFetch(url("save"), {
        method: "PUT",
        body: text,
        keepalive,
        headers: headers({ "Content-Type": "application/json", "X-Save-Version": String(version), "X-Saved-At": String(savedAt), "X-Lease-Token": token }),
      });
      if (res.ok) return { kind: "ok" };
      if (res.status === 413) return { kind: "toolarge" };
      if (res.status === 409) {
        const body = (await res.json().catch(() => ({}))) as { lease?: LeaseView | null; version?: number };
        if (typeof body.version === "number") return { kind: "newer", version: body.version };
        return { kind: "held", lease: body.lease ?? null };
      }
      throw new StoreError(res.status, `PUT save: ${res.status}`);
    },
    async takeLease(force): Promise<LeaseResult> {
      const res = await doFetch(url("lease"), { method: "POST", body: JSON.stringify({ force }), headers: headers({ "Content-Type": "application/json" }) });
      if (res.status === 409) {
        const body = (await res.json()) as { lease: LeaseView };
        return { kind: "held", lease: body.lease };
      }
      if (!res.ok) throw new StoreError(res.status, `POST lease: ${res.status}`);
      const body = (await res.json()) as { token: string; lease: LeaseView };
      return { kind: "granted", token: body.token, lease: body.lease };
    },
    openSocket(token, events): void {
      this.closeSocket();
      socketToken = token;
      socketEvents = events;
      drops = 0;
      connect();
    },
    sendHeartbeat(): void {
      if (socket && socket.readyState === socket.OPEN) socket.send(JSON.stringify({ type: "heartbeat" }));
    },
    closeSocket(): void {
      socketToken = null;
      socketEvents = null;
      if (reconnect) {
        clearTimeout(reconnect);
        reconnect = null;
      }
      const ws = socket;
      socket = null;
      ws?.close();
    },
  };
}

function envelope(h: Headers): { version: number; savedAt: number; lease: LeaseView | null } {
  let lease: LeaseView | null = null;
  const raw = h.get("X-Lease");
  if (raw) {
    try {
      lease = JSON.parse(raw) as LeaseView;
    } catch {
      lease = null;
    }
  }
  return { version: Number(h.get("X-Save-Version")) || 0, savedAt: Number(h.get("X-Saved-At")) || 0, lease };
}
