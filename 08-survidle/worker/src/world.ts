import { DurableObject } from "cloudflare:workers";
import { acquire, heartbeat, type Lease, mayAcquire, mayWrite, view } from "../../src/sync/lease";
import type { Env } from "./index";

/**
 * One world: its latest save and the lease on it. Storage and sockets
 * only; every rule about who may run comes from the lease module the
 * client also imports. Durable Object storage is strongly consistent,
 * which is the whole reason the store is not KV: "close the laptop, open
 * the phone" falls inside KV's eventual window.
 *
 * Storage keys: `save` (the text), `savedAt` (the client's save time),
 * `version` (the save file's version, so HEAD answers without parsing),
 * `lease` (Lease or null) and `devices` (id to label, for messages).
 */

/** A save above this is refused: a save that approaches it is a bug to trace, never a reason to raise the cap. */
const SAVE_CAP_BYTES = 1_048_576;

interface Stored { save?: string; savedAt?: number; version?: number; lease?: Lease | null; devices?: Record<string, string> }

export class WorldObject extends DurableObject<Env> {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const tail = url.pathname.split("/").pop();
    const device = request.headers.get("X-Device") ?? url.searchParams.get("device") ?? "";
    const label = request.headers.get("X-Device-Label") ?? "another device";
    if (!device) return new Response("X-Device required", { status: 400 });
    if (label !== "another device") await this.remember(device, label);

    if (tail === "ws") return this.upgrade(request, url);
    if (tail === "lease" && request.method === "POST") return this.lease(request, device, label);
    if (tail === "save") {
      if (request.method === "GET" || request.method === "HEAD") return this.read(request.method === "HEAD");
      if (request.method === "PUT") return this.write(request);
    }
    return new Response("method not allowed", { status: 405 });
  }

  private async remember(device: string, label: string): Promise<void> {
    const devices = (await this.ctx.storage.get<Record<string, string>>("devices")) ?? {};
    if (devices[device] === label) return;
    devices[device] = label;
    await this.ctx.storage.put("devices", devices);
  }

  private async envelope(): Promise<{ headers: Record<string, string>; exists: boolean }> {
    const s = (await this.ctx.storage.get(["savedAt", "version", "lease"])) as Map<string, unknown>;
    const lease = (s.get("lease") as Lease | null | undefined) ?? null;
    const headers: Record<string, string> = {
      "X-Saved-At": String(s.get("savedAt") ?? 0),
      "X-Save-Version": String(s.get("version") ?? 0),
      "X-Lease": JSON.stringify(lease ? view(lease) : null),
      "Cache-Control": "no-store",
    };
    return { headers, exists: s.get("savedAt") !== undefined };
  }

  private async read(headOnly: boolean): Promise<Response> {
    const { headers, exists } = await this.envelope();
    if (!exists) return new Response(headOnly ? null : "no save", { status: 404, headers });
    if (headOnly) return new Response(null, { status: 200, headers });
    const save = await this.ctx.storage.get<string>("save");
    return new Response(save ?? "", { status: 200, headers: { ...headers, "Content-Type": "application/json" } });
  }

  private async write(request: Request): Promise<Response> {
    const token = request.headers.get("X-Lease-Token") ?? "";
    const version = Number(request.headers.get("X-Save-Version"));
    const savedAt = Number(request.headers.get("X-Saved-At"));
    if (!Number.isFinite(version) || !Number.isFinite(savedAt)) return new Response("X-Save-Version and X-Saved-At required", { status: 400 });
    const declared = Number(request.headers.get("Content-Length"));
    if (declared > SAVE_CAP_BYTES) return new Response("save too large", { status: 413 });
    const text = await request.text();
    if (text.length > SAVE_CAP_BYTES) return new Response("save too large", { status: 413 });

    const lease = (await this.ctx.storage.get<Lease | null>("lease")) ?? null;
    if (!mayWrite(lease, token)) return json({ lease: lease ? view(lease) : null }, 409);
    const stored = (await this.ctx.storage.get<number>("version")) ?? 0;
    // A device on an older build never overwrites a newer world.
    if (version < stored) return json({ version: stored }, 409);

    const now = Date.now();
    const next: Stored = { save: text, savedAt, version, lease: heartbeat(lease, token, now) };
    await this.ctx.storage.put(next as Record<string, unknown>);
    return new Response(null, { status: 204, headers: { "X-Saved-At": String(savedAt), "X-Save-Version": String(version) } });
  }

  private async lease(request: Request, device: string, label: string): Promise<Response> {
    let force = false;
    try {
      const body = (await request.json()) as { force?: unknown };
      force = body.force === true;
    } catch {
      // No body, or not JSON: an ordinary, unforced take.
    }
    const now = Date.now();
    const current = (await this.ctx.storage.get<Lease | null>("lease")) ?? null;
    if (!mayAcquire(current, device, now, force)) return json({ lease: current ? view(current) : null }, 409);
    const next = acquire(device, label, now);
    await this.ctx.storage.put("lease", next);
    // The old holder learns it at once, then its sockets close.
    if (current && current.token !== next.token) {
      const notice = JSON.stringify({ type: "revoked", by: label, at: now });
      for (const ws of this.ctx.getWebSockets(current.token)) {
        try {
          ws.send(notice);
          ws.close(4000, "revoked");
        } catch {
          // A socket already gone has nothing to learn.
        }
      }
    }
    return json({ token: next.token, lease: view(next) }, 200);
  }

  private async upgrade(request: Request, url: URL): Promise<Response> {
    if (request.headers.get("Upgrade") !== "websocket") return new Response("expected websocket", { status: 426 });
    const token = url.searchParams.get("token") ?? "";
    const lease = (await this.ctx.storage.get<Lease | null>("lease")) ?? null;
    if (!mayWrite(lease, token)) return new Response("not the holder", { status: 403 });
    const pair = new WebSocketPair();
    const [client, server] = [pair[0], pair[1]];
    // Hibernation: an idle holder costs nothing. The socket is tagged with its
    // token so a forced take can find exactly the old holder's sockets.
    this.ctx.acceptWebSocket(server, [token]);
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    let msg: { type?: string };
    try {
      msg = JSON.parse(typeof message === "string" ? message : new TextDecoder().decode(message));
    } catch {
      return;
    }
    if (msg.type !== "heartbeat") return;
    const token = this.ctx.getTags(ws)[0] ?? "";
    const lease = (await this.ctx.storage.get<Lease | null>("lease")) ?? null;
    const next = heartbeat(lease, token, Date.now());
    if (next !== lease) await this.ctx.storage.put("lease", next);
  }

  async webSocketClose(): Promise<void> {
    // A socket closing releases nothing by itself; the grace period does that.
  }

  async webSocketError(): Promise<void> {}
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
}
