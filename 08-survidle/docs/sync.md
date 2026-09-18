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

The URL the deploy prints is `SYNC_URL` in `src/sync/config.ts`
(`https://survidle-sync.janis-kirsteins.workers.dev`, deployed
2026-09-18); a new deploy under another name goes there. A production
build reads that constant; a development build ignores it and talks to
`wrangler dev` on `127.0.0.1:8787`; `VITE_SYNC_URL` in the environment
overrides both. The Durable Object uses SQLite storage
(`new_sqlite_classes` in `worker/wrangler.toml`), which the free plan
allows.

`ALLOWED_ORIGINS` in `wrangler.toml` lists the origin prefixes the store
answers: the Pages origin, which covers branch previews, and the two dev
server origins. A new origin goes there, and `npm run deploy` again.

## Always on: the world is in the address

There is nothing to turn on. `?w=heron-pine-ember` on the page's address
names the world, and the page keeps the parameter there, so a bookmark, a
tab handed to the phone (Safari's Handoff, "send to device"), or an
address typed in brings the same world with nothing to copy. Opened
without one, the page goes to the world this browser last had, or draws a
new one, and rewrites the address to carry it. Each visitor gets a world
of their own that way; a tester's two devices share one by sharing the
address.

The device that opens the world takes the lease and runs it, putting its
save every minute it advances and as the tab hides or closes. A second
device on the same address shows the save read-only under a banner, "The
desktop has the world, saved 12 s ago", with `take over` and `refresh`.
Take over moves the world at once and the first device's banner says so
without a reload; refresh re-reads the store, and takes the world without
a tap once the holder has been quiet past the grace period (60 s with no
heartbeat, which a closed lid or a tab in the background produces within
a couple of minutes). A read-only device re-reads on its own every
minute.

Anyone with the address can read and take the world. There are no
accounts. Settings names the world and offers `new world`: a new address,
the old world left where it was. The test aids (`?seed=`, `?day=`) are
runs of their own and never sync. When the store cannot be reached the
page shows the local save read-only and offers `play offline`, which runs
it without the store for this session; the address keeps its world and
the next load asks again. In development that means running
`npm run worker:dev` beside `npm run dev`, or playing offline.

## Check it

- `npm test` covers the lease rules (`tests/lease.test.ts`), the session
  state machine against a store in memory (`tests/sync-session.test.ts`),
  the code's vocabulary (`tests/sync-code.test.ts`), the world in the
  address (`tests/sync-address.test.ts`) and the banner and settings
  block (`tests/sync-panel.test.ts`). None of it needs wrangler.
- `npm run worker:typecheck` type-checks the Worker against
  `@cloudflare/workers-types`; the prototype's own `tsc` never sees it.
- `npm run worker:dev` in one terminal and `npm run worker:smoke` in
  another drive the deployed routes end to end: a world is created, a
  save put, the lease taken by force from a second device, and the first
  device's socket must hear `revoked` inside one second. `SYNC_URL` in the
  environment points the smoke test at a deployed store instead.
- `npm run sync-pass` is the browser pass, scripted: two headless
  Chromium instances with their own profiles, a desktop at 1440 by 900
  and a phone at 390 wide with touch emulation, against the dev server
  and a store (`SYNC_URL`, default `wrangler dev`). It plays the spec's
  pass in order and reads every step from the page as the player sees it
  and from the store's own headers: the desktop opens the plain address
  and gets a world in it; the phone opens that address and sees the held
  banner, read-only, the page under it taking no pointer, the take-over
  button thumb height; take over by a real touch and see the desktop's
  revoked banner appear without a reload and its clock stop; reload the
  desktop from the phone's save and take the world back; freeze the
  desktop tab past the grace period, take the lapsed lease on the phone
  without force, put from the phone as its tab hides, wake the desktop
  and confirm it does not catch up; start a new world on the phone and
  see it at a new address with the old world left in the store.
  Screenshots in `docs/sync-shots/`.

  Run 2026-09-18 against `wrangler dev`: every check passed, at both
  widths; the desktop heard the phone's take-over in 749 to 901 ms; the
  woken desktop's minute was the minute it fell asleep on. The deployed
  store could not be reached from the session that ran it (the sandbox's
  egress policy refuses `workers.dev`), so the same pass against the
  deployed URL is still owed: `SYNC_URL=https://survidle-sync.janis-kirsteins.workers.dev
  npm run sync-pass` with `VITE_SYNC_URL` set the same on the dev server.
  Two things the pass taught: a headless tab that has been frozen and
  woken no longer takes dispatched touch events, so the last step clicks;
  and a browser left over from a killed run answers on the debugging port
  and gets driven instead of a fresh one, so the script refuses a port in
  use.

## What to expect on a phone

The world is never synced; the phone solves the same seed, about 5 s on a
desktop and an expected 15 s on a phone, once, and again if Safari drops
the cache after seven days without a visit. The save itself is 8 to 14 KB
and the store caps it at 1 MB; a save that approaches the cap is a bug to
trace. The phone gets the responsive page as it stands; the check-in page
shaped for a phone, with no map and no Do catalog, is the roadmap's next
half and waits for item P's camp view.
