# Survidle: the testing infra

The roadmap's item of that name: the instrument the gate table reads.
Four of the six bars come from a beacon, two from a survey. The beacon is
Datadog RUM, on by default behind a switch, with a random id as the user,
the tester link that marks a device and its cohort, and the game's facts
as custom actions read from the life record and the save. Nothing in the
simulation changes.

The package is `@datadog/browser-rum`, 7.12.0 on the registry at the
time of writing, 1.5 MB unpacked; it is loaded by a dynamic import so the
page's first paint does not wait for it, and it is never loaded at all
when the switch is off or the application ids are blank.

## Decisions taken by the author's pre-approval

The author pre-approved the spec and asked for the work to proceed
without questions. The calls below are the ones a brainstorm would have
asked; each names the alternative it passed over.

- **The application ids are committed constants, blank until the author
  fills them.** `src/beacon/config.ts` holds the RUM application id, the
  client token, the site (`datadoghq.eu`), the service name and the env.
  A client token is public by design (it ships to every browser), so a
  constant is no leak, and the Pages build has no environment to read a
  variable from. Blank ids make the beacon inert: no import, no request,
  the switch shows "not configured". Passed over: Vite env variables,
  which would need repository variables in the deploy workflow for a
  value that is public anyway.
- **One local-storage record beside the save.** `survidle.beacon` holds
  `{ id, on, tester, cohort, diedAt, attention }`: the random id (sixteen
  hex characters from `crypto.getRandomValues`), the switch, the tester
  flag and its cohort word, the wall-clock time of the last death (for
  "began again, N seconds after"), and the heartbeat count of the current
  life (for hours of attention per life). It lives outside the world, so
  "leave this world" and a new seed keep it. Passed over: fields on the
  save, which "leave this world" clears.
- **The tester link strips itself.** `?tester=<cohort>` on any open writes
  the flag and the cohort, then `history.replaceState` removes the
  parameter from the address bar, so a copied link does not re-mark a
  second device by accident. `?seed=` keeps its meaning and is untouched.
  Passed over: leaving the parameter in place, which the roadmap rules
  out.
- **Five actions.** `opened` on every load once the save is in;
  `heartbeat` once a real minute while the tab is visible and the game is
  running (not dead, not landing, not the away report); `died` the frame
  a death is first seen; `beganAgain` when the next survivor lands;
  `settings` when the switch is toggled (so an opt-out is the last thing
  seen from that id). Every action carries the world seed, the survivor
  index, the game day, the tester flag and the cohort. `opened` adds the
  month number (the last written entry of the life record's forecast
  series, or null). `died` adds the cause, the days survived and the
  minutes of attention in that life. `beganAgain` adds the seconds since
  the death. Passed over: sending the whole life record, which the
  epitaph section's anonymous posture rules out and which no bar needs.
- **Hours of attention are heartbeats.** One heartbeat is one visible
  minute; the count per life is kept in the storage record and reset when
  a survivor lands, so a reload mid-life continues the count. Passed
  over: session duration from the SDK, which counts a tab left open in
  the background.
- **The adapter is one file and the SDK is only ever named there.**
  `src/beacon/datadog.ts` exports `createDatadogSink(config)` returning
  `{ emit(name, context) }` and does the dynamic import and the init with
  replay off, user interactions off, resources off, long tasks off, the
  privacy level "mask". `src/beacon/beacon.ts` knows nothing of Datadog:
  it takes a sink and the storage, and every fact it sends is computed by
  pure functions in `src/beacon/facts.ts` over the state. Passed over:
  calling the SDK from main.ts, which would tie the game to the vendor
  the roadmap says it must be able to leave.
- **Client IP collection is an org-side setting, listed as the author's
  step.** The RUM application's settings page has the toggle; the SDK has
  no switch for it. It is one of four steps only the author can take,
  written in `docs/testing.md` with the retention and funnel-window
  checks. Passed over: pretending the SDK could do it.
- **The bars are queries, written down.** `docs/testing.md` states each
  beacon bar as the RUM query or funnel that reads it, the expected
  reading under the roadmap's gate table, and the short script fallback
  where a window is not available. Passed over: a bars script in the
  repo, which the roadmap deferred exactly so nothing is built that the
  dashboards already do.

## 1. The facts

`src/beacon/facts.ts`, pure over `GameState` and the storage record:

```ts
export interface BeaconRecord {
  id: string; on: boolean; tester: boolean; cohort: string | null;
  /** Wall-clock ms of the last death seen, for the time to begin again. */
  diedAt: number | null;
  /** Visible minutes in the current life, and which life that is. */
  attention: { survivor: number; minutes: number };
}
export interface Common { seed: number; survivor: number; day: number; tester: boolean; cohort: string | null }
export function common(state: GameState, rec: BeaconRecord): Common;
export function monthNumber(state: GameState): number | null;   // the last non-null entry of current(state).forecast
export function openedFacts(state, rec): Common & { month: number | null };
export function diedFacts(state, rec): Common & { cause: DeathCause; daysSurvived: number; attentionMin: number };
export function beganAgainFacts(state, rec, now: number): Common & { sinceDeathSec: number | null };
```

`day` is `calendar(state.minute, state.startDoy).day`; `survivor` is
`current(state).index`; `daysSurvived` is `state.dead!.day`
(`Died.day` on the record, the day of the life the death fell on).

## 2. The record and the link

`src/beacon/storage.ts`:

```ts
export const BEACON_KEY = "survidle.beacon";
export function loadRecord(storage: Storage, random: () => string): BeaconRecord;  // creates and saves a fresh record with a new id when none is stored; fills missing fields
export function saveRecord(storage: Storage, rec: BeaconRecord): void;
export function newId(): string;  // sixteen lowercase hex characters from crypto.getRandomValues
export function applyTesterLink(rec: BeaconRecord, params: URLSearchParams): { rec: BeaconRecord; stripped: boolean };  // ?tester=<cohort> sets tester true and the cohort (lowercased, trimmed, at most 32 characters, or "default" when empty); returns whether the param was present
```

`main.ts` reads the params it already has; if `applyTesterLink` reports
the parameter, it deletes `tester` from the params and calls
`history.replaceState(null, "", url)` with the remaining query (kept
intact, so `?seed=` survives) and the same hash.

## 3. The beacon

`src/beacon/beacon.ts`:

```ts
export interface Sink { emit(name: string, context: Record<string, unknown>): void }
export interface Beacon {
  opened(state): void; died(state, now: number): void; beganAgain(state, now: number): void;
  /** Once a real minute while visible and running: counts a minute of attention and emits a heartbeat. */
  tick(state, visible: boolean, running: boolean, now: number): void;
  setOn(on: boolean, state): void;
  setSink(sink: Sink | null): void;
  record(): BeaconRecord;
}
export function createBeacon(storage: Storage, sink: Sink | null, rec: BeaconRecord): Beacon;
```

Every method reads `rec.on`; off means the record is still kept (the
attention count, `diedAt`) but nothing is emitted. `tick` emits at most
once per sixty seconds of wall clock, only when `visible && running`, and
increments `attention.minutes` for `current(state).index`, resetting the
count when the survivor index changes. `died` stores `diedAt = now` and
emits; `beganAgain` emits with `sinceDeathSec` from `diedAt` (null when
unknown) and resets the attention count for the new survivor. `setOn`
saves and emits `settings` with `{ on }` through the sink regardless of
the new value, so the opt-out is recorded once (this is the one emit that
ignores `rec.on`; it is the only way to know a tester turned it off).

`main.ts` wiring: the record is loaded before the game boots; the sink is
`createDatadogSink(BEACON)` when `rec.on && BEACON.applicationId &&
BEACON.clientToken`, else null. `opened` fires once after the save is
loaded and any tester param applied. `tick` is called from `frame` with
`document.visibilityState === "visible"` and the running condition. The
death transition is detected in `frame`: `wasDead` false and `state.dead`
set fires `died`. `beganAgain` is called in the `land` handler after
`land(state, world)`. The switch's change handler calls `setOn`, and when
turning on with no sink yet, creates the sink then.

## 4. The Datadog sink

`src/beacon/datadog.ts`:

```ts
export interface BeaconConfig { applicationId: string; clientToken: string; site: string; service: string; env: string }
export function createDatadogSink(config: BeaconConfig, userId: string, global: Record<string, unknown>): Sink;
```

The sink queues emits until the dynamic `import("@datadog/browser-rum")`
resolves, then calls `datadogRum.init({ applicationId, clientToken,
site, service, env, sessionSampleRate: 100, sessionReplaySampleRate: 0,
trackUserInteractions: false, trackResources: false, trackLongTasks:
false, defaultPrivacyLevel: "mask" })`, `datadogRum.setUser({ id:
userId })`, `datadogRum.setGlobalContextProperty("tester", ...)` and
`("cohort", ...)`, then drains the queue through
`datadogRum.addAction(name, context)`. A failed import (offline, blocked)
drops the queue and logs one console warning; the game is unaffected.
The SDK's method names are checked against 7.12.0 at install; if one has
moved, this file absorbs the change and nothing else knows.

`src/beacon/config.ts`:

```ts
export const BEACON: BeaconConfig = { applicationId: "", clientToken: "", site: "datadoghq.eu", service: "survidle", env: "pages" };
```

## 5. The settings panel

`index.html` gains, beside the away dial, a `#beacon` panel:

```html
<div id="beacon" class="panel">
  <label><input type="checkbox" data-beacon="on" /> share anonymous play data</label>
  <span class="dim" data-beacon="note"></span>
</div>
```

`src/ui/beacon-panel.ts` exports `mountBeaconPanel(root, beacon, configured: boolean)`: sets the checkbox from the record, writes the note as "id <id>" plus ", tester: <cohort>" when marked, plus " (not configured)" when the ids are blank, and wires the change event to `beacon.setOn`. Static markup, mounted once like the dial and the sound controls.

## 6. docs/testing.md

A page for the round's operator, with:

- The four steps only the author takes before a tester is recruited: create the RUM application in the EU org and paste its ids into `config.ts`; switch client IP collection off in the application's settings; confirm event retention covers more than a month; confirm a funnel can take a time window, and if not, the export-and-script fallback for the re-run bar.
- The six bars, each with its reading rule from the roadmap's gate table and, for the four beacon bars, the RUM query or funnel: re-run rate (users with `beganAgain` within 24 h of a `died`, over users with a `died`); first run (users with a `died` and a `beganAgain` inside 120 attention minutes of their first `opened`); hours of attention (median over testers of heartbeats past game day 1, divided by 60); day 30 (users with an `opened` 30 days after their first, over users). The two survey bars name the form's two questions and that the form is keyed by the id the panel shows.
- The tester link's shape and what it does; the cohort word convention.
- What is and is not sent, verbatim from section 3.

## 7. Tests

`tests/beacon.test.ts` (happy-dom, under a second):

- `newId` gives sixteen lowercase hex characters, different on two calls.
- `loadRecord` on empty storage creates and saves a record with `on: true`, `tester: false`, `cohort: null`, `diedAt: null`, attention at zero; on a stored record with fields missing it fills them and keeps the id.
- `applyTesterLink`: `?tester=wave1` marks the device and reports stripped; `?tester=` gives "default"; no param changes nothing and reports not stripped; a second load without the param keeps the mark.
- `common`, `openedFacts`, `diedFacts`, `beganAgainFacts` on a seeded game: the seed, the survivor index 1, the day, the month number null with no forecast entry and 7 after `current(state).forecast.push(7)`; the death facts after `state.dead` is set; `sinceDeathSec` from `diedAt`.
- The beacon with a recording fake sink: `opened` emits once with the facts; `tick` emits nothing before sixty seconds, once at sixty, counts a minute of attention, emits nothing while hidden or not running, resets the count when the survivor index changes; `died` stores `diedAt` and emits; `beganAgain` emits `sinceDeathSec`; with `on: false` nothing emits but the count still moves; `setOn(false)` emits `settings { on: false }` and then nothing else.
- The panel: mounted on a div with the markup, the checkbox reads the record, the note shows the id, the tester cohort when marked and "(not configured)" when the ids are blank; changing the checkbox calls `setOn`.
- The sink is not unit tested: it is the browser pass's, with the ids blank (no import, no request) and, once the author fills them, with the network panel showing `browser-intake-datadoghq.eu`.

## 8. The browser pass

Chrome, ids blank: the panel shows the id and "(not configured)", no request to any Datadog host in the network panel, the switch persists across reload, `?tester=wave1` marks the device and disappears from the address bar, `?seed=` still restarts. With ids filled in by the author later: the `opened` action appears in RUM within a minute, a `heartbeat` a minute after, and the user id in the RUM explorer is the panel's id with no IP.

## 9. What this does not do

- Recruit the round or write the survey form.
- Draw the bars in the game or build a bars script.
- Change the simulation, the save shape or the life record.
