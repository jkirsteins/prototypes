# Survidle Save Sync and Lease Design

**Status:** specced 2026-09-11, not built, postponed to its roadmap slot:
after the first tester round, and only if the round's testers ask for the
phone. The round is recruited as single-device so that the asking is a
finding. The phone check-in page that builds on this waits further, for
roadmap item P's camp view and camp sheet. See "The save sync" in
`2026-09-03-survidle-realism-roadmap.md`.

Before building, re-read the two catch-up sites in `src/main.ts` named
under "The rule in front of every catch-up". Item P restructures the page,
and the code this spec names by behaviour may have moved.

## Purpose

The save is local storage, so a phone is a different world from the
desktop. This spec makes the save follow the player between devices, with
one device running the world at a time.

It is the first of two sub-projects behind the phone companion decided in
the 2026-09-11 brainstorm. The second, a phone entry page organized by the
decisions a check-in serves and carrying no map and no Do catalog, gets its
own spec. This sub-project is useful alone: when it lands, a player can
close the desktop, open the phone, and find the same survivor, on the
responsive layout the page already has.

Decisions taken in the brainstorm and not reopened here:

- The phone is a companion to a desktop run. It runs the same engine bundle
  and advances the world on open like any tab, when it holds the lease.
- The store is a Cloudflare Worker with one Durable Object per sync code.
  Durable Object storage is strongly consistent; KV is not, and the whole
  use case is "close the laptop, open the phone" inside KV's window.
- One world, one runner. Two devices never both advance the world. The
  roadmap's "last writer wins" is withdrawn: with permadeath it would let
  the survivor die on one device and live on the other.
- A device that loses the lease learns it at once, over a WebSocket, not at
  its next poll.
- No push, no reminders. Web push on iPhone needs a home-screen install,
  a service worker and a push server. Not for a proof of concept.
- No accounts. Whoever holds the code holds the world.

## Principles

- **Off by default.** Without a sync code the game is exactly today: no
  network call, no new UI beyond the settings block that turns it on.
- **Never advance from a stale save.** A device runs the world forward only
  when it holds the lease and its save is the store's latest. This check
  sits in front of every catch-up and every live frame.
- **The store is the truth for latest.** Local storage stays as the cache
  the page reads first and the only save when sync is off.
- **Loud and safe on failure.** When the store cannot be reached, the game
  shows the last save read-only and says so. It never guesses that it may
  run.
- **The lease rules are one pure module.** The Worker and the client tests
  import the same function. There is no second copy of "who may run".

## The store

### Layout

The Worker lives in the prototype at `worker/`:

- `worker/wrangler.toml`: the Worker name `survidle-sync`, the Durable
  Object binding `WORLD` to class `WorldObject`, a migration declaring the
  class, and the `ALLOWED_ORIGINS` var.
- `worker/src/index.ts`: the fetch handler. Parses `/w/:code/...`, checks
  the origin, and forwards to the object named by the code.
- `worker/src/world.ts`: the `WorldObject` Durable Object class. Storage
  and sockets only; every rule it applies comes from the lease module.
- `worker/tsconfig.json`: extends nothing, includes `worker/src` and
  `src/sync/lease.ts`, with `@cloudflare/workers-types`.
- `src/sync/lease.ts`: the pure lease rules, in the prototype's own tree so
  `tsc`, Biome and vitest already cover it. The Worker imports it by
  relative path; wrangler bundles it.

`package.json` gains `wrangler` and `@cloudflare/workers-types` as dev
dependencies and three scripts:

- `worker:dev`: `wrangler dev --config worker/wrangler.toml --port 8787`.
- `worker:deploy`: `wrangler deploy --config worker/wrangler.toml`.
- `worker:smoke`: `node worker/smoke.mjs`, the route-level smoke test
  described under Testing.

The prototype's `tsconfig.json` keeps `include: ["src", "tests"]`, so
`npm run build` and the pre-commit hook never compile the Worker. The
Worker is type-checked by `wrangler deploy` and by `worker:dev`.

### The sync code

Three words from a 1024-word list, joined by dashes, for example
`heron-birch-ember`. Thirty bits. The client draws it with
`crypto.getRandomValues` when the player turns sync on. The Durable Object
id is `idFromName(code)`, so the code is the world's address and there is
no registry to consult. Anyone with the code can read and take the world;
the settings block says so in one line.

### Routes

All under `/w/:code`. Every request carries `X-Device`, the device id
described under The client. Responses carry CORS headers for the request
origin when it matches `ALLOWED_ORIGINS`, a comma-separated list of origin
prefixes. Production lists `https://jkirsteins.github.io`; development
adds `http://127.0.0.1:5173` and `http://localhost:5173`. A prefix match
on the Pages origin covers branch previews, which share the origin.

| Route | Purpose |
|---|---|
| `GET /save` | Headers `X-Saved-At` and `X-Lease` (JSON: holder, since, lastSeen), body the save text, or 404 when the object has no save yet. |
| `HEAD /save` | The same headers, no body. The cheap "is my save still the latest and is the lease still mine" check. |
| `PUT /save` | Body the save text. Requires `X-Lease-Token` matching the current lease. 409 with the lease JSON when it does not. 413 above 1 MB (a save measures 8 to 14 KB). |
| `POST /lease` | Body `{ force: boolean }`. Returns `{ token, lease }` when granted. 409 with the lease JSON when another device holds it live and `force` is false. |
| `GET /ws` | WebSocket upgrade with `?token=`. Refused unless the token is the current lease's. |

### Durable Object storage

Four keys: `save` (string), `savedAt` (number, the client's save time),
`lease` (`{ holder, token, since, lastSeen }` or null), and `devices`
(a map of device id to the label it last sent, for messages).

### The lease rules

`src/sync/lease.ts` exports pure functions over a `Lease | null` and a
`now`:

- `mayAcquire(lease, device, now, force)`: true when there is no lease,
  when the holder is the same device, when `now - lastSeen` exceeds the
  grace period, or when `force` is set.
- `acquire(device, now)`: a fresh lease with a random token.
- `heartbeat(lease, token, now)`: the lease with `lastSeen` moved, or the
  lease unchanged when the token does not match.
- `mayWrite(lease, token)`: the token matches the current lease.

The grace period is 60 seconds. The client heartbeats every 20 seconds, so
a laptop lid closing lets the lease lapse in under two minutes without
anyone sending a message.

### Sockets

The object uses the WebSocket hibernation API so an idle holder costs
nothing. The client sends `{ type: "heartbeat" }` every 20 seconds; the
object answers by moving `lastSeen`. A socket closing releases nothing by
itself; the grace period does that, because a phone dropping off wifi for
ten seconds is not a hand-over.

On a forced acquire the object writes the new lease, then sends
`{ type: "revoked", by: <label>, at: now }` down every socket that
belongs to the old token and closes them. That is the immediate notice.

## The client

### Modules

- `src/sync/client.ts`: the store client. `fetchLatest`, `headLatest`,
  `putSave`, `takeLease`, `openSocket`, `closeSocket`. No DOM, no game
  state. Its base URL comes from `import.meta.env.VITE_SYNC_URL`, which
  defaults to `http://127.0.0.1:8787` in development and to the deployed
  `workers.dev` URL in a production build.
- `src/sync/session.ts`: the sync session state machine, the part that
  knows about the game. States: `off`, `checking`, `running`,
  `readonly`, `revoked`, `unreachable`. It owns the lease token, the
  heartbeat timer, the periodic put, and the "never advance from a stale
  save" check. It is written against a `Store` interface that
  `client.ts` implements and the tests fake.
- `src/ui/sync-panel.ts`: the settings block and the banner markup.

### Identity on the device

`localStorage` holds `survidle.sync.code` and `survidle.sync.device`. The
device id is random, drawn once. Its label is "phone" when the device has
a coarse pointer and "desktop" otherwise, and it is sent as
`X-Device-Label` for the other device's messages only.

### The settings block

A "Sync across devices" block on the settings panel, under the beacon:

- **Off:** one line, "This survivor lives in this browser", and a
  `turn on` button. Turning on draws a code, uploads the local save, takes
  the lease, opens the socket, and shows the on state.
- **On:** the code, a `copy link` button that copies the page URL with
  `?sync=<code>`, the line "Anyone with the code can take this world", and
  a `turn off` button. Turning off forgets the code and the device's lease
  locally and leaves the store as it is; the world stays reachable by the
  code.

### Joining from a link

Opening the page with `?sync=<code>` stores the code and strips the
parameter from the URL. When this browser already has a local save that is
not the store's, the page asks once: "Join this world? The survivor saved
in this browser is replaced." A yes replaces it; a no leaves the code
unset and the page as it was.

### Boot

With a code set, `boot()` becomes:

1. `fetchLatest`. Unreachable: state `unreachable`, render the local save
   read-only with the unreachable banner (below).
2. Take the lease with `force: false`. Held live by another device: state
   `readonly`, render the store's save read-only with the held banner.
3. Granted: the store's save becomes the state. The existing catch-up runs
   exactly as today from the store's `savedAt`. Open the socket, start the
   heartbeat and the periodic put. State `running`.

Without a code, `boot()` is unchanged.

### Read-only

In `readonly` and `unreachable` the frame loop does not advance:
`simulationPaused` reads the session state. The app root carries the class
`sync-readonly`, which sets `pointer-events: none` on everything but the
banner and the settings button, so no order can be given against a world
this device does not run. The panels render the save as usual, so the
status is all there.

The held banner reads "The <label> has the world, saved <N> s ago", with
`take over` and `refresh` buttons. `refresh` re-fetches; the banner also
re-fetches on its own every 60 seconds. `take over` takes the lease with
`force: true`, re-fetches the save (it may have moved in the meantime),
and continues as boot step 3.

The unreachable banner reads "The sync store cannot be reached", with
`retry` and `play offline`. `play offline` turns sync off on this device,
as the settings button does, and boots from the local save.

### Revoked

On the socket's `revoked` message, or on a 409 from any put, the session
enters `revoked`: the loop stops, `persistGame` writes nothing more to the
store or to local storage, and a banner reads "The <label> took over at
<time>" with one button, `reload from its save`, which runs boot again.
The local save is left as it was; nothing reads it again, but nothing
destroys a save that was the truth a minute ago either.

### Saving

`persistGame` keeps writing local storage. With a session `running` it
also puts the save. On `pagehide` and on visibility hidden the put uses
`fetch` with `keepalive: true`; the save is well under the keepalive
body limit. While running and visible, a put goes every 60 seconds if the
state has advanced since the last put, so a crash loses at most a minute.

A put that fails on the network keeps the game running, sets the session's
`lastPutFailedAt` for the banner line "Sync unreachable since <time>", and
retries on the next put; the state stays `running`. It does not stop the world: the device still
holds the lease, and a lease held is a lease the store will not give away
inside the grace period.

### The rule in front of every catch-up

`main.ts` has two catch-ups: `boot()` for a reload, and the frame loop's
`dtSec > 30` branch for a tab that was in the background. Boot is covered
above. The resumed-tab branch changes as follows with a session:

1. The loop enters state `checking` and does not advance.
2. The session calls `headLatest`. When the lease is still this device's
   token and `X-Saved-At` equals the device's last put, the catch-up runs
   as today and the loop resumes.
3. Otherwise the session enters `revoked` (the lease moved) or, when the
   store is unreachable, `unreachable` with the local save read-only.

This is the one place a sleeping laptop, woken after the phone has taken
over, would otherwise advance a stale world and put it back.

### New world with sync on

"reset world data" and a landing after death both produce a new state on
the running device. Both are saves like any other and go up by the next
put. The code follows the player, not the survivor.

## Testing

- `tests/lease.test.ts`: the pure rules. Free, held live, lapsed past
  grace, same device, force, heartbeat with a wrong token, write with a
  stale token.
- `tests/sync-session.test.ts` against a fake `Store` in memory: boot with
  a free lease takes it and calls the catch-up; boot against a live lease
  ends read-only and never calls the catch-up; a lapsed lease is taken; a
  `revoked` message freezes the session and blocks `persistGame`'s store
  write; the resumed-tab check with a newer store save never calls the
  catch-up; the periodic put fires only after the state advanced.
- `worker/smoke.mjs`, run by hand against `worker:dev`: creates a world,
  puts a save, takes the lease from a second device with force, and
  asserts the first device's socket received `revoked` inside one second.
  Not part of `npm test`, which must not need wrangler.
- The browser pass, at 1440 by 900 and at 390 wide with touch emulation
  and a second Chrome profile for the second device: turn sync on, open
  the link on the phone, see the held banner, take over, see the desktop's
  revoked banner appear without a reload, reload the desktop from the
  phone's save, and finally put the desktop tab to sleep past the grace
  period, take over on the phone, wake the desktop and confirm it does not
  catch up.

## Out of scope

- The phone entry page (sub-project 2).
- Push or local reminders.
- Accounts, code recovery, and encryption of the save at rest.
- Sending orders from a read-only device to the holder.
- Merging two diverged saves. There is no such state by construction.
- The beacon counting one player on two devices as two. The device id
  makes that fixable later; it is not fixed here.
