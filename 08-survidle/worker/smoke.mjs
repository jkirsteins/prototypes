// The route-level smoke test, run by hand against `npm run worker:dev`:
// creates a world, puts a save, takes the lease from a second device with
// force, and asserts the first device's socket received `revoked` inside one
// second. Not part of `npm test`, which must not need wrangler.
//
//   npm run worker:dev        (in one terminal)
//   npm run worker:smoke      (in another; SYNC_URL overrides the default)

import assert from "node:assert/strict";

const base = process.env.SYNC_URL ?? "http://127.0.0.1:8787";
const code = `smoke-test-${Date.now().toString(36)}`.replace(/[^a-z-]/g, "a");
const url = (tail) => `${base}/w/${code}/${tail}`;
const headers = (device, extra = {}) => ({ "X-Device": device, "X-Device-Label": device === "a" ? "desktop" : "phone", ...extra });
const save = (n) => JSON.stringify({ version: 10, worldVersion: 5, savedAt: n, state: { minute: n } });

// An empty world.
let res = await fetch(url("save"), { headers: headers("a") });
assert.equal(res.status, 404, "an unknown code has no save");

// Device A takes the lease and puts a save.
res = await fetch(url("lease"), { method: "POST", body: JSON.stringify({ force: false }), headers: headers("a", { "Content-Type": "application/json" }) });
assert.equal(res.status, 200);
const a = await res.json();
assert.ok(a.token && a.lease.holder === "a");

res = await fetch(url("save"), { method: "PUT", body: save(1000), headers: headers("a", { "X-Save-Version": "10", "X-Saved-At": "1000", "X-Lease-Token": a.token }) });
assert.equal(res.status, 204, "the holder may put");

// A put without the token is refused, and so is a lower version.
res = await fetch(url("save"), { method: "PUT", body: save(1001), headers: headers("b", { "X-Save-Version": "10", "X-Saved-At": "1001", "X-Lease-Token": "nope" }) });
assert.equal(res.status, 409);
assert.equal((await res.json()).lease.holder, "a");
res = await fetch(url("save"), { method: "PUT", body: save(1002), headers: headers("a", { "X-Save-Version": "9", "X-Saved-At": "1002", "X-Lease-Token": a.token }) });
assert.equal(res.status, 409);
assert.equal((await res.json()).version, 10);

// Device B reads the save and its envelope, and cannot take the live lease without force.
res = await fetch(url("save"), { headers: headers("b") });
assert.equal(res.status, 200);
assert.equal(res.headers.get("X-Saved-At"), "1000");
assert.equal(res.headers.get("X-Save-Version"), "10");
assert.equal(JSON.parse(res.headers.get("X-Lease")).holder, "a");
assert.equal(await res.text(), save(1000));
res = await fetch(url("lease"), { method: "POST", body: JSON.stringify({ force: false }), headers: headers("b", { "Content-Type": "application/json" }) });
assert.equal(res.status, 409, "a live lease is not given away");

// A opens its socket; B takes over by force; A hears it inside a second.
const ws = new WebSocket(`${url("ws").replace(/^http/, "ws")}?token=${a.token}&device=a`);
await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
const revoked = new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error("no revoked message inside one second")), 1000);
  ws.onmessage = (ev) => { clearTimeout(timer); resolve(JSON.parse(ev.data)); };
});
res = await fetch(url("lease"), { method: "POST", body: JSON.stringify({ force: true }), headers: headers("b", { "Content-Type": "application/json" }) });
assert.equal(res.status, 200);
const b = await res.json();
const msg = await revoked;
assert.equal(msg.type, "revoked");
assert.equal(msg.by, "phone");

// A's token is dead; B's puts land.
res = await fetch(url("save"), { method: "PUT", body: save(1003), headers: headers("a", { "X-Save-Version": "10", "X-Saved-At": "1003", "X-Lease-Token": a.token }) });
assert.equal(res.status, 409);
res = await fetch(url("save"), { method: "PUT", body: save(1004), headers: headers("b", { "X-Save-Version": "10", "X-Saved-At": "1004", "X-Lease-Token": b.token }) });
assert.equal(res.status, 204);
res = await fetch(url("save"), { method: "HEAD", headers: headers("a") });
assert.equal(res.headers.get("X-Saved-At"), "1004");

// A save over the cap is refused.
res = await fetch(url("save"), { method: "PUT", body: "x".repeat(1_048_577), headers: headers("b", { "X-Save-Version": "10", "X-Saved-At": "1005", "X-Lease-Token": b.token }) });
assert.equal(res.status, 413);

process.stdout.write(`smoke ok: ${code}\n`);
process.exit(0);
