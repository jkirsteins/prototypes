import { WorldObject } from "./world";

/**
 * The fetch handler: parses `/w/:code/...`, checks the origin, and forwards
 * to the Durable Object named by the code. Nothing here reads or writes a
 * save; the object does that, and the lease rules it applies are the
 * client's own `src/sync/lease.ts`.
 */

export { WorldObject };

export interface Env {
  WORLD: DurableObjectNamespace<WorldObject>;
  ALLOWED_ORIGINS: string;
}

const CODE = /^[a-z]+-[a-z]+-[a-z]+$/;
const ROUTE = /^\/w\/([a-z-]+)\/(save|lease|ws)$/;

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const origin = request.headers.get("Origin");
    const cors = corsHeaders(origin, env.ALLOWED_ORIGINS);
    if (origin && !cors) return new Response("origin not allowed", { status: 403 });
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors ?? {} });

    const url = new URL(request.url);
    const m = ROUTE.exec(url.pathname);
    if (!m) return withCors(new Response("not found", { status: 404 }), cors);
    const code = m[1];
    if (!CODE.test(code)) return withCors(new Response("bad code", { status: 400 }), cors);

    const stub = env.WORLD.get(env.WORLD.idFromName(code));
    const res = await stub.fetch(request);
    // A WebSocket upgrade is handed back as it is: headers on a 101 are the socket's.
    if (res.status === 101) return res;
    return withCors(res, cors);
  },
};

function corsHeaders(origin: string | null, allowed: string): Record<string, string> | null {
  if (!origin) return null;
  const ok = allowed.split(",").map((s) => s.trim()).filter(Boolean).some((prefix) => origin.startsWith(prefix));
  if (!ok) return null;
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, HEAD, PUT, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-Device, X-Device-Label, X-Save-Version, X-Saved-At, X-Lease-Token",
    "Access-Control-Expose-Headers": "X-Saved-At, X-Save-Version, X-Lease",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

function withCors(res: Response, cors: Record<string, string> | null): Response {
  if (!cors) return res;
  const out = new Response(res.body, res);
  for (const [k, v] of Object.entries(cors)) out.headers.set(k, v);
  return out;
}
