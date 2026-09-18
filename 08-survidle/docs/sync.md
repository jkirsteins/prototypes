# The save sync

The save follows the player between devices, with one device running the
world at a time. Design and rules:
`docs/superpowers/specs/2026-09-11-survidle-save-sync-design.md`. This
page is the runbook: what to deploy once, how to turn it on, and how to
check it.

Off by default. Without a sync code the game is exactly as before: no
network call, no new UI beyond the settings block that turns it on. With
a blank store URL the block says so in one line and nothing is fetched.

## Deploy the store, once

The store is a Cloudflare Worker with one Durable Object per sync code,
under `worker/`. Its dependencies are its own (`worker/package.json`), so
the Pages build never installs wrangler.

```bash
cd 08-survidle/worker
npm install
npx wrangler login        # once per machine; opens the browser
npm run deploy            # prints https://survidle-sync.<account>.workers.dev
```

Paste the URL the deploy prints into `SYNC_URL` in `src/sync/config.ts`
and commit. A production build reads that constant; a development build
ignores it and talks to `wrangler dev` on `127.0.0.1:8787`; `VITE_SYNC_URL`
in the environment overrides both. The Durable Object uses SQLite storage
(`new_sqlite_classes` in `worker/wrangler.toml`), which the free plan
allows.

`ALLOWED_ORIGINS` in `wrangler.toml` lists the origin prefixes the store
answers: the Pages origin, which covers branch previews, and the two dev
server origins. A new origin goes there, and `npm run deploy` again.

## Turn it on

Settings > Sync across devices > `turn on`. The page draws a code of
three words (`heron-birch-ember`), uploads the local save, takes the
lease, and from then on this device runs the world and puts its save
every minute it advances, and as the tab hides or closes.

`copy link` copies the page URL with `?sync=<code>`. Opened on the phone,
the link stores the code and drops it from the address bar; if the phone
already has a survivor of its own, it asks once before replacing it. The
phone then shows the desktop's save read-only under a banner, "The
desktop has the world, saved 12 s ago", with `take over` and `refresh`.
Take over moves the world to the phone at once and the desktop's banner
says so without a reload; refresh re-reads the store, and takes the world
without a tap once the desktop has been quiet past the grace period (60 s
with no heartbeat, which a closed lid or a tab in the background produces
within a couple of minutes). The read-only device re-reads on its own
every minute.

Anyone with the code can read and take the world. There are no accounts;
`turn off` forgets the code on this device and leaves the store as it is.

## Check it

- `npm test` covers the lease rules (`tests/lease.test.ts`), the session
  state machine against a store in memory (`tests/sync-session.test.ts`),
  the code's vocabulary (`tests/sync-code.test.ts`) and the banner and
  settings block (`tests/sync-panel.test.ts`). None of it needs wrangler.
- `npm run worker:typecheck` type-checks the Worker against
  `@cloudflare/workers-types`; the prototype's own `tsc` never sees it.
- `npm run worker:dev` in one terminal and `npm run worker:smoke` in
  another drive the deployed routes end to end: a world is created, a
  save put, the lease taken by force from a second device, and the first
  device's socket must hear `revoked` inside one second. `SYNC_URL` in the
  environment points the smoke test at a deployed store instead.
- The browser pass, at 1440 by 900 and at 390 wide with touch emulation
  and a second Chrome profile for the second device: turn sync on, open
  the link on the phone, see the held banner, take over, see the desktop's
  revoked banner appear without a reload, reload the desktop from the
  phone's save, then put the desktop tab to sleep past the grace period,
  take over on the phone, wake the desktop and confirm it does not catch
  up. Not yet run against a deployed store; run it once `SYNC_URL` is
  filled in.

## What to expect on a phone

The world is never synced; the phone solves the same seed, about 5 s on a
desktop and an expected 15 s on a phone, once, and again if Safari drops
the cache after seven days without a visit. The save itself is 8 to 14 KB
and the store caps it at 1 MB; a save that approaches the cap is a bug to
trace. The phone gets the responsive page as it stands; the check-in page
shaped for a phone, with no map and no Do catalog, is the roadmap's next
half and waits for item P's camp view.
