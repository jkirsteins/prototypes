# The Testing Infra Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A beacon behind a switch sends five game facts as Datadog RUM custom actions under a random id, a tester link marks a device and its cohort, and the round's operator has a page that says how each bar is read.

**Architecture:** Pure facts over the state (`src/beacon/facts.ts`), a local-storage record and the tester link (`src/beacon/storage.ts`), a beacon that owns the cadence and the record (`src/beacon/beacon.ts`) and talks to a `Sink`, one Datadog adapter that is the only file naming the SDK (`src/beacon/datadog.ts`, dynamic import, injectable loader), blank constants in `src/beacon/config.ts`, a settings panel, and the wiring in `src/main.ts`. Nothing in the sim changes.

**Tech Stack:** TypeScript, Vite, vitest with happy-dom, `@datadog/browser-rum` 7.12.0 as a dependency loaded by dynamic import.

**Spec:** `08-survidle/docs/superpowers/specs/2026-09-05-survidle-testing-infra-design.md`

## Global Constraints

- Work on `main` in the primary clone, pre-approved. Stage by explicit path under `08-survidle/`; never `git add -A`; never `git stash`. Other sessions commit docs concurrently.
- Storage key `survidle.beacon`; the id is sixteen lowercase hex characters; `on` defaults true; the cohort word is trimmed, lowercased, at most 32 characters, "default" when empty.
- Actions: `opened`, `heartbeat`, `died`, `beganAgain`, `settings`; every context carries `seed`, `survivor`, `day`, `tester`, `cohort`. A heartbeat is at most one per sixty seconds of wall clock, only while visible and running; the first tick after creation only arms the clock.
- The SDK is imported in `src/beacon/datadog.ts` only, by dynamic import, with replay 0, user interactions off, resources off, long tasks off, privacy level "mask". Blank ids mean no import and no request.
- No em dashes and no non-typable unicode anywhere; code comments explain, never chronicle.
- Every commit: `npm test` green from `08-survidle/`, `npx tsc --noEmit` clean, and for Task 3 onward `npm run build` succeeds. Never commit red. Commit messages end with:
  `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>` and
  `Claude-Session: https://claude.ai/code/session_01352zAHUpQPBdTDeXJ5SWVM`.

---

### Task 1: The facts, the record and the link

**Files:**
- Create: `src/beacon/facts.ts`, `src/beacon/storage.ts`
- Test: `tests/beacon.test.ts`

**Interfaces:**
- Consumes: `calendar` from `sim/calendar.ts`; `current` from `sim/record.ts`; `GameState`, `DeathCause` from `sim/types.ts`.
- Produces: `BeaconRecord`, `Common`, `common`, `monthNumber`, `openedFacts`, `diedFacts`, `beganAgainFacts` (facts.ts); `BEACON_KEY`, `newId`, `loadRecord`, `saveRecord`, `applyTesterLink` (storage.ts).

- [ ] **Step 1: Write the failing tests**

Create `tests/beacon.test.ts` (match the environment header other DOM tests use, e.g. `// @vitest-environment happy-dom` if `tests/ui.test.ts` carries one):

```ts
import { describe, expect, it } from "vitest";
import { beganAgainFacts, common, diedFacts, monthNumber, openedFacts } from "../src/beacon/facts";
import { applyTesterLink, BEACON_KEY, loadRecord, newId, saveRecord } from "../src/beacon/storage";
import { newGame } from "../src/sim/newgame";
import { current } from "../src/sim/record";

function memory(): Storage {
  const m = new Map<string, string>();
  return {
    get length() { return m.size; },
    clear: () => m.clear(), getItem: (k) => m.get(k) ?? null, key: (i) => [...m.keys()][i] ?? null,
    removeItem: (k) => { m.delete(k); }, setItem: (k, v) => { m.set(k, String(v)); },
  } as Storage;
}

describe("the beacon record", () => {
  it("newId is sixteen lowercase hex characters and differs between calls", () => {
    const a = newId();
    const b = newId();
    expect(a).toMatch(/^[0-9a-f]{16}$/);
    expect(a).not.toBe(b);
  });

  it("loadRecord creates and saves a fresh record, and fills a stored one's missing fields keeping its id", () => {
    const s = memory();
    const rec = loadRecord(s);
    expect(rec.on).toBe(true);
    expect(rec.tester).toBe(false);
    expect(rec.cohort).toBeNull();
    expect(rec.diedAt).toBeNull();
    expect(rec.attention).toEqual({ survivor: 0, minutes: 0 });
    expect(JSON.parse(s.getItem(BEACON_KEY)!).id).toBe(rec.id);
    s.setItem(BEACON_KEY, JSON.stringify({ id: "0123456789abcdef", on: false }));
    const again = loadRecord(s);
    expect(again.id).toBe("0123456789abcdef");
    expect(again.on).toBe(false);
    expect(again.tester).toBe(false);
    expect(again.attention).toEqual({ survivor: 0, minutes: 0 });
    saveRecord(s, { ...again, cohort: "wave1" });
    expect(JSON.parse(s.getItem(BEACON_KEY)!).cohort).toBe("wave1");
  });

  it("the tester link marks the device and its cohort, strips itself, and a later open without it keeps the mark", () => {
    const rec = loadRecord(memory());
    const none = applyTesterLink(rec, new URLSearchParams("seed=17"));
    expect(none.stripped).toBe(false);
    expect(none.rec.tester).toBe(false);
    const marked = applyTesterLink(rec, new URLSearchParams("tester=Wave1&seed=17"));
    expect(marked.stripped).toBe(true);
    expect(marked.rec.tester).toBe(true);
    expect(marked.rec.cohort).toBe("wave1");
    const blank = applyTesterLink(rec, new URLSearchParams("tester="));
    expect(blank.rec.cohort).toBe("default");
    const later = applyTesterLink(marked.rec, new URLSearchParams("seed=17"));
    expect(later.rec.tester).toBe(true);
    expect(later.rec.cohort).toBe("wave1");
    const long = applyTesterLink(rec, new URLSearchParams(`tester=${"x".repeat(40)}`));
    expect(long.rec.cohort!.length).toBe(32);
  });
});

describe("the facts", () => {
  it("common facts read the seed, the survivor, the day and the mark", () => {
    const { state } = newGame(17);
    const rec = { ...loadRecord(memory()), tester: true, cohort: "wave1" };
    expect(common(state, rec)).toEqual({ seed: 17, survivor: 1, day: 1, tester: true, cohort: "wave1" });
  });

  it("the month number is the last written forecast entry, or null", () => {
    const { state } = newGame(17);
    expect(monthNumber(state)).toBeNull();
    current(state).forecast.push(null, 7, null);
    expect(monthNumber(state)).toBe(7);
    expect(openedFacts(state, loadRecord(memory())).month).toBe(7);
  });

  it("death facts carry the cause, the days survived and the life's attention; begin-again facts the seconds since the death", () => {
    const { state } = newGame(17);
    const rec = { ...loadRecord(memory()), attention: { survivor: 1, minutes: 42 }, diedAt: 1_000_000 };
    state.dead = { cause: "froze", minute: state.minute };
    const d = diedFacts(state, rec);
    expect(d.cause).toBe("froze");
    expect(d.daysSurvived).toBe(1);
    expect(d.attentionMin).toBe(42);
    expect(diedFacts(state, { ...rec, attention: { survivor: 2, minutes: 42 } }).attentionMin).toBe(0);
    expect(beganAgainFacts(state, rec, 1_090_000).sinceDeathSec).toBe(90);
    expect(beganAgainFacts(state, { ...rec, diedAt: null }, 1_090_000).sinceDeathSec).toBeNull();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/beacon.test.ts`
Expected: FAIL, modules not found.

- [ ] **Step 3: Implement facts.ts**

```ts
/**
 * The game's facts the beacon sends, read from the state and the life
 * record: nothing here is a simulation change, and nothing here names
 * the vendor. Every action carries the common facts; the specific ones
 * add what their bar needs and no more.
 */
import { calendar } from "../sim/calendar";
import { current } from "../sim/record";
import type { DeathCause, GameState } from "../sim/types";

/** What the device remembers beside the save, outside the world so a new seed keeps it. */
export interface BeaconRecord {
  id: string;
  on: boolean;
  tester: boolean;
  cohort: string | null;
  /** Wall-clock milliseconds of the last death seen, for the time it took to begin again. */
  diedAt: number | null;
  /** Visible minutes in one life, and which life that count belongs to. */
  attention: { survivor: number; minutes: number };
}

export interface Common { seed: number; survivor: number; day: number; tester: boolean; cohort: string | null }

export function common(state: GameState, rec: BeaconRecord): Common {
  return { seed: state.seed, survivor: current(state).index, day: calendar(state.minute, state.startDoy).day, tester: rec.tester, cohort: rec.cohort };
}

/** The last month number the forecast wrote into this life, or null before the first. */
export function monthNumber(state: GameState): number | null {
  const f = current(state).forecast;
  for (let i = f.length - 1; i >= 0; i--) if (f[i] !== null) return f[i];
  return null;
}

export function openedFacts(state: GameState, rec: BeaconRecord): Common & { month: number | null } {
  return { ...common(state, rec), month: monthNumber(state) };
}

export function diedFacts(state: GameState, rec: BeaconRecord): Common & { cause: DeathCause; daysSurvived: number; attentionMin: number } {
  const c = common(state, rec);
  const died = current(state).died;
  const cause = died?.cause ?? state.dead?.cause ?? "gaveUp";
  const daysSurvived = died?.day ?? c.day;
  const attentionMin = rec.attention.survivor === c.survivor ? rec.attention.minutes : 0;
  return { ...c, cause, daysSurvived, attentionMin };
}

export function beganAgainFacts(state: GameState, rec: BeaconRecord, now: number): Common & { sinceDeathSec: number | null } {
  return { ...common(state, rec), sinceDeathSec: rec.diedAt === null ? null : Math.round((now - rec.diedAt) / 1000) };
}
```

Check `current(state).died`'s shape in `sim/types.ts` (`Died` has `day` and `cause`); if the record's `died` is set by the sim at death, the fallback to `state.dead` only covers a test that sets `state.dead` by hand, as the test above does.

- [ ] **Step 4: Implement storage.ts**

```ts
/**
 * The beacon's record in local storage, beside the save and outside the
 * world: the random id that is the RUM user, the switch, the tester mark
 * and its cohort, and the two counters the actions need. The tester link
 * writes the mark once and is dropped from the address by the caller.
 */
import type { BeaconRecord } from "./facts";

export const BEACON_KEY = "survidle.beacon";
const COHORT_MAX = 32;

/** Sixteen lowercase hex characters from the platform's random source. */
export function newId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

function fresh(id: string): BeaconRecord {
  return { id, on: true, tester: false, cohort: null, diedAt: null, attention: { survivor: 0, minutes: 0 } };
}

/** The stored record with any missing field filled, saved back when anything was missing; a new record with a new id when nothing is stored. */
export function loadRecord(storage: Storage, id: () => string = newId): BeaconRecord {
  let stored: Partial<BeaconRecord> | null = null;
  try { stored = JSON.parse(storage.getItem(BEACON_KEY) ?? "null"); } catch { stored = null; }
  const rec = { ...fresh(stored?.id ?? id()), ...(stored ?? {}) } as BeaconRecord;
  if (!rec.attention || typeof rec.attention.minutes !== "number") rec.attention = { survivor: 0, minutes: 0 };
  if (JSON.stringify(rec) !== storage.getItem(BEACON_KEY)) saveRecord(storage, rec);
  return rec;
}

export function saveRecord(storage: Storage, rec: BeaconRecord): void {
  storage.setItem(BEACON_KEY, JSON.stringify(rec));
}

/** `?tester=<cohort>` marks the device and names its cohort; the caller drops the parameter from the address. */
export function applyTesterLink(rec: BeaconRecord, params: URLSearchParams): { rec: BeaconRecord; stripped: boolean } {
  if (!params.has("tester")) return { rec, stripped: false };
  const word = (params.get("tester") ?? "").trim().toLowerCase().slice(0, COHORT_MAX);
  return { rec: { ...rec, tester: true, cohort: word || "default" }, stripped: true };
}
```

- [ ] **Step 5: Run the tests, the suite, tsc**

Run: `npx vitest run tests/beacon.test.ts && npm test && npx tsc --noEmit`
Expected: green. If `crypto` is missing in the test environment, vitest on Node 19+ has it globally; if not, report which Node the machine runs.

- [ ] **Step 6: Commit**

```bash
cd /Users/janis.kirsteins/Projects/prototypes
git add 08-survidle/src/beacon/facts.ts 08-survidle/src/beacon/storage.ts 08-survidle/tests/beacon.test.ts
git commit -m "feat(survidle): the beacon's facts, its record beside the save, and the tester link"
```

---

### Task 2: The beacon

**Files:**
- Create: `src/beacon/beacon.ts`
- Test: `tests/beacon.test.ts` (append)

**Interfaces:**
- Consumes: Task 1's facts and storage; `current` from `sim/record.ts`.
- Produces: `Sink`, `Beacon`, `HEARTBEAT_MS = 60000`, `createBeacon(storage, sink, rec)`.

- [ ] **Step 1: Write the failing tests**

Append to `tests/beacon.test.ts`:

```ts
import { createBeacon, HEARTBEAT_MS, type Sink } from "../src/beacon/beacon";

function recording(): Sink & { sent: { name: string; ctx: Record<string, unknown> }[] } {
  const sent: { name: string; ctx: Record<string, unknown> }[] = [];
  return { sent, emit: (name, ctx) => { sent.push({ name, ctx }); } };
}

describe("the beacon", () => {
  it("opened emits once with the facts; a heartbeat arms on the first tick, fires at sixty seconds, counts a minute, and skips hidden or stopped", () => {
    const { state } = newGame(17);
    const s = memory();
    const sink = recording();
    const b = createBeacon(s, sink, loadRecord(s));
    b.opened(state);
    expect(sink.sent.map((e) => e.name)).toEqual(["opened"]);
    expect(sink.sent[0].ctx.seed).toBe(17);
    b.tick(state, true, true, 1000);
    expect(sink.sent.length).toBe(1);
    b.tick(state, true, true, 1000 + HEARTBEAT_MS - 1);
    expect(sink.sent.length).toBe(1);
    b.tick(state, true, true, 1000 + HEARTBEAT_MS);
    expect(sink.sent.map((e) => e.name)).toEqual(["opened", "heartbeat"]);
    expect(b.record().attention).toEqual({ survivor: 1, minutes: 1 });
    b.tick(state, false, true, 1000 + 2 * HEARTBEAT_MS);
    b.tick(state, true, false, 1000 + 3 * HEARTBEAT_MS);
    expect(sink.sent.length).toBe(2);
    expect(JSON.parse(s.getItem(BEACON_KEY)!).attention.minutes).toBe(1);
  });

  it("died stores the time and emits; beganAgain emits the seconds since and resets the life's attention", () => {
    const { state } = newGame(17);
    const s = memory();
    const sink = recording();
    const b = createBeacon(s, sink, { ...loadRecord(s), attention: { survivor: 1, minutes: 5 } });
    state.dead = { cause: "starved", minute: state.minute };
    b.died(state, 50_000);
    expect(b.record().diedAt).toBe(50_000);
    expect(sink.sent.at(-1)).toMatchObject({ name: "died", ctx: { cause: "starved", attentionMin: 5 } });
    state.dead = null;
    state.survivors.push({ ...current(state), index: 2, forecast: [], events: [], died: null });
    b.beganAgain(state, 170_000);
    expect(sink.sent.at(-1)).toMatchObject({ name: "beganAgain", ctx: { survivor: 2, sinceDeathSec: 120 } });
    expect(b.record().attention).toEqual({ survivor: 2, minutes: 0 });
  });

  it("off, nothing is emitted but the count still moves; setOn emits the settings action whatever the new value, once", () => {
    const { state } = newGame(17);
    const s = memory();
    const sink = recording();
    const b = createBeacon(s, sink, { ...loadRecord(s), on: false });
    b.opened(state);
    b.tick(state, true, true, 0);
    b.tick(state, true, true, HEARTBEAT_MS);
    expect(sink.sent).toEqual([]);
    expect(b.record().attention.minutes).toBe(1);
    b.setOn(true, state);
    expect(sink.sent.map((e) => e.name)).toEqual(["settings"]);
    expect(sink.sent[0].ctx.on).toBe(true);
    b.opened(state);
    expect(sink.sent.map((e) => e.name)).toEqual(["settings", "opened"]);
    b.setOn(false, state);
    b.opened(state);
    expect(sink.sent.map((e) => e.name)).toEqual(["settings", "opened", "settings"]);
    expect(JSON.parse(s.getItem(BEACON_KEY)!).on).toBe(false);
  });

  it("without a sink every method is safe", () => {
    const { state } = newGame(17);
    const b = createBeacon(memory(), null, loadRecord(memory()));
    b.opened(state);
    b.tick(state, true, true, 0);
    b.setOn(false, state);
    expect(b.record().on).toBe(false);
  });
});
```

The `survivors.push` line builds a second life record from the first; if `LifeRecord` has required fields the spread does not cover, use `newRecord` from `sim/record.ts` with its real arguments instead (read its signature) and set `index` 2.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/beacon.test.ts`
Expected: FAIL, `../src/beacon/beacon` not found.

- [ ] **Step 3: Implement**

```ts
/**
 * The beacon: the cadence and the record. It knows the game's facts and
 * a sink with one method, and nothing about the vendor behind the sink.
 * Off, it keeps counting attention and the time of death, so a tester
 * who turns it back on is counted from the right place; the only emit
 * that ignores the switch is the switch itself, once per toggle.
 */
import { current } from "../sim/record";
import type { GameState } from "../sim/types";
import { type BeaconRecord, beganAgainFacts, common, diedFacts, openedFacts } from "./facts";
import { saveRecord } from "./storage";

export interface Sink { emit(name: string, context: Record<string, unknown>): void }

/** One heartbeat a real minute while the tab is visible and the game runs: the unit hours of attention are summed from. */
export const HEARTBEAT_MS = 60_000;

export interface Beacon {
  opened(state: GameState): void;
  died(state: GameState, now: number): void;
  beganAgain(state: GameState, now: number): void;
  tick(state: GameState, visible: boolean, running: boolean, now: number): void;
  setOn(on: boolean, state: GameState): void;
  setSink(sink: Sink | null): void;
  record(): BeaconRecord;
}

export function createBeacon(storage: Storage, sink: Sink | null, rec: BeaconRecord): Beacon {
  let lastBeat: number | null = null;
  const save = () => saveRecord(storage, rec);
  const send = (name: string, ctx: Record<string, unknown>) => { if (rec.on) sink?.emit(name, ctx); };
  return {
    opened(state) { send("opened", { ...openedFacts(state, rec) }); },
    died(state, now) {
      rec.diedAt = now;
      save();
      send("died", { ...diedFacts(state, rec) });
    },
    beganAgain(state, now) {
      send("beganAgain", { ...beganAgainFacts(state, rec, now) });
      rec.attention = { survivor: current(state).index, minutes: 0 };
      save();
    },
    tick(state, visible, running, now) {
      if (!visible || !running) return;
      if (lastBeat === null) { lastBeat = now; return; }
      if (now - lastBeat < HEARTBEAT_MS) return;
      lastBeat = now;
      const survivor = current(state).index;
      if (rec.attention.survivor !== survivor) rec.attention = { survivor, minutes: 0 };
      rec.attention.minutes += 1;
      save();
      send("heartbeat", { ...common(state, rec) });
    },
    setOn(on, state) {
      rec.on = on;
      save();
      sink?.emit("settings", { ...common(state, rec), on });
    },
    setSink(s) { sink = s; },
    record: () => rec,
  };
}
```

- [ ] **Step 4: Run the tests, the suite, tsc; commit**

Run: `npx vitest run tests/beacon.test.ts && npm test && npx tsc --noEmit`

```bash
cd /Users/janis.kirsteins/Projects/prototypes
git add 08-survidle/src/beacon/beacon.ts 08-survidle/tests/beacon.test.ts
git commit -m "feat(survidle): the beacon counts attention, marks the death and the return, and speaks only through a sink"
```

---

### Task 3: The Datadog sink and the dependency

**Files:**
- Create: `src/beacon/datadog.ts`, `src/beacon/config.ts`
- Modify: `package.json`, `package-lock.json` (the dependency)
- Test: `tests/beacon.test.ts` (append)

**Interfaces:**
- Consumes: `Sink` from Task 2.
- Produces: `BeaconConfig`, `BEACON` (config.ts); `RumLike`, `createDatadogSink(config, userId, global, load?)` (datadog.ts).

- [ ] **Step 1: Install the dependency**

From `08-survidle/`: `npm install @datadog/browser-rum@7.12.0`. Confirm `package.json` lists it under `dependencies` (not dev) and `node_modules/@datadog/browser-rum/package.json` reads 7.12.0. Read its `esm` entry's exported `datadogRum` methods to confirm `init`, `setUser`, `setGlobalContextProperty` and `addAction` exist in this version; if any name differs, use the version's name inside datadog.ts only and say so in the report.

- [ ] **Step 2: Write the failing tests**

Append to `tests/beacon.test.ts`:

```ts
import { createDatadogSink, type RumLike } from "../src/beacon/datadog";
import { BEACON } from "../src/beacon/config";

describe("the Datadog sink", () => {
  it("queues until the SDK loads, then inits with replay and interactions off, sets the user and the context, and drains in order", async () => {
    const calls: unknown[][] = [];
    const rum: RumLike = {
      init: (o) => calls.push(["init", o]), setUser: (u) => calls.push(["setUser", u]),
      setGlobalContextProperty: (k, v) => calls.push(["ctx", k, v]), addAction: (n, c) => calls.push(["action", n, c]),
    };
    let resolve!: (m: { datadogRum: RumLike }) => void;
    const load = () => new Promise<{ datadogRum: RumLike }>((r) => { resolve = r; });
    const sink = createDatadogSink({ ...BEACON, applicationId: "app", clientToken: "tok" }, "0123456789abcdef", { tester: true, cohort: "wave1" }, load);
    sink.emit("opened", { seed: 1 });
    sink.emit("heartbeat", { seed: 1 });
    expect(calls).toEqual([]);
    resolve({ datadogRum: rum });
    await new Promise((r) => setTimeout(r, 0));
    expect(calls[0][0]).toBe("init");
    const init = calls[0][1] as Record<string, unknown>;
    expect(init).toMatchObject({ applicationId: "app", clientToken: "tok", site: "datadoghq.eu", sessionReplaySampleRate: 0, trackUserInteractions: false, trackResources: false, trackLongTasks: false, defaultPrivacyLevel: "mask" });
    expect(calls[1]).toEqual(["setUser", { id: "0123456789abcdef" }]);
    expect(calls.slice(2, 4)).toEqual([["ctx", "tester", true], ["ctx", "cohort", "wave1"]]);
    expect(calls.slice(4)).toEqual([["action", "opened", { seed: 1 }], ["action", "heartbeat", { seed: 1 }]]);
    sink.emit("died", { seed: 1 });
    expect(calls.at(-1)).toEqual(["action", "died", { seed: 1 }]);
  });

  it("a failed load drops the queue and the game is unaffected", async () => {
    const sink = createDatadogSink(BEACON, "id", {}, () => Promise.reject(new Error("offline")));
    sink.emit("opened", {});
    await new Promise((r) => setTimeout(r, 0));
    sink.emit("heartbeat", {});
  });

  it("the shipped config is blank, so the beacon is inert until the author fills it", () => {
    expect(BEACON.applicationId).toBe("");
    expect(BEACON.clientToken).toBe("");
    expect(BEACON.site).toBe("datadoghq.eu");
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run tests/beacon.test.ts`
Expected: FAIL, modules not found.

- [ ] **Step 4: Implement**

`src/beacon/config.ts`:

```ts
import type { BeaconConfig } from "./datadog";

/**
 * The RUM application the beacon reports to. A client token is public
 * by design, so a constant is no leak; blank ids keep the beacon inert,
 * and the author fills them once the application exists in the org.
 */
export const BEACON: BeaconConfig = { applicationId: "", clientToken: "", site: "datadoghq.eu", service: "survidle", env: "pages" };
```

`src/beacon/datadog.ts`:

```ts
/**
 * The one file that names the vendor. The SDK is a dynamic import so the
 * page never waits for it; emits queue until it is ready and drain in
 * order. Replay, user interactions, resources and long tasks are off and
 * the privacy level masks everything: a game screen has nothing worth
 * recording beyond the actions the beacon sends on purpose.
 */
import type { Sink } from "./beacon";

export interface BeaconConfig { applicationId: string; clientToken: string; site: string; service: string; env: string }

/** The four calls the sink makes, so a test can stand in for the SDK. */
export interface RumLike {
  init(options: Record<string, unknown>): void;
  setUser(user: { id: string }): void;
  setGlobalContextProperty(key: string, value: unknown): void;
  addAction(name: string, context?: Record<string, unknown>): void;
}

const loadSdk = (): Promise<{ datadogRum: RumLike }> => import("@datadog/browser-rum") as unknown as Promise<{ datadogRum: RumLike }>;

export function createDatadogSink(config: BeaconConfig, userId: string, global: Record<string, unknown>, load: () => Promise<{ datadogRum: RumLike }> = loadSdk): Sink {
  let rum: RumLike | null = null;
  let queue: [string, Record<string, unknown>][] | null = [];
  load().then(({ datadogRum }) => {
    datadogRum.init({
      applicationId: config.applicationId, clientToken: config.clientToken, site: config.site, service: config.service, env: config.env,
      sessionSampleRate: 100, sessionReplaySampleRate: 0, trackUserInteractions: false, trackResources: false, trackLongTasks: false, defaultPrivacyLevel: "mask",
    });
    datadogRum.setUser({ id: userId });
    for (const [k, v] of Object.entries(global)) datadogRum.setGlobalContextProperty(k, v);
    rum = datadogRum;
    for (const [name, ctx] of queue ?? []) rum.addAction(name, ctx);
    queue = null;
  }).catch((err) => {
    queue = null;
    console.warn("beacon: the SDK did not load, nothing is sent", err);
  });
  return {
    emit(name, ctx) {
      if (rum) rum.addAction(name, ctx);
      else queue?.push([name, ctx]);
    },
  };
}
```

If tsc rejects the `import("@datadog/browser-rum")` cast because the package's `init` options type is stricter than `Record<string, unknown>`, keep `RumLike` as written and widen only the cast, never the interface.

- [ ] **Step 5: Run the tests, the suite, tsc, the build; commit**

Run: `npx vitest run tests/beacon.test.ts && npm test && npx tsc --noEmit && npm run build 2>&1 | tail -4`
Expected: green; the build succeeds (the SDK is not yet imported by anything reachable from main.ts, so no new chunk yet; that arrives with Task 4).

```bash
cd /Users/janis.kirsteins/Projects/prototypes
git add 08-survidle/package.json 08-survidle/package-lock.json 08-survidle/src/beacon/datadog.ts 08-survidle/src/beacon/config.ts 08-survidle/tests/beacon.test.ts
git commit -m "feat(survidle): the Datadog sink - one file names the SDK, loads it late, and masks everything but the actions"
```

---

### Task 4: The panel and the wiring

**Files:**
- Create: `src/ui/beacon-panel.ts`
- Modify: `index.html` (the `#beacon` panel), `src/main.ts`
- Test: `tests/beacon.test.ts` (append)

**Interfaces:**
- Consumes: Tasks 1 to 3.
- Produces: `mountBeaconPanel(root, beacon, configured, getState, onToggle)`.

- [ ] **Step 1: Write the failing test**

Append to `tests/beacon.test.ts`:

```ts
import { mountBeaconPanel } from "../src/ui/beacon-panel";

describe("the beacon panel", () => {
  it("reads the switch, shows the id, the cohort and the configured state, and toggles through the callback", () => {
    const { state } = newGame(17);
    const s = memory();
    const rec = { ...loadRecord(s), id: "0123456789abcdef", tester: true, cohort: "wave1" };
    const b = createBeacon(s, null, rec);
    const root = document.createElement("div");
    root.innerHTML = `<label><input type="checkbox" data-beacon="on" /> share anonymous play data</label><span class="dim" data-beacon="note"></span>`;
    const toggled: boolean[] = [];
    mountBeaconPanel(root, b, false, () => state, (on) => toggled.push(on));
    const box = root.querySelector<HTMLInputElement>("[data-beacon=on]")!;
    const note = root.querySelector<HTMLElement>("[data-beacon=note]")!;
    expect(box.checked).toBe(true);
    expect(note.textContent).toBe("id 0123456789abcdef, tester: wave1 (not configured)");
    box.checked = false;
    box.dispatchEvent(new Event("change"));
    expect(toggled).toEqual([false]);
    expect(b.record().on).toBe(false);
    const root2 = document.createElement("div");
    root2.innerHTML = root.innerHTML;
    mountBeaconPanel(root2, createBeacon(s, null, { ...rec, tester: false, cohort: null }), true, () => state, () => {});
    expect(root2.querySelector("[data-beacon=note]")!.textContent).toBe("id 0123456789abcdef");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/beacon.test.ts`
Expected: FAIL, `../src/ui/beacon-panel` not found.

- [ ] **Step 3: The panel**

`index.html`, after the `#away` panel:

```html
        <div id="beacon" class="panel">
          <label><input type="checkbox" data-beacon="on" /> share anonymous play data</label>
          <span class="dim" data-beacon="note"></span>
        </div>
```

`src/ui/beacon-panel.ts`:

```ts
import type { Beacon } from "../beacon/beacon";
import type { GameState } from "../sim/types";

/**
 * The beacon's switch and its note: the id a tester quotes in the survey,
 * the cohort when the device was marked by a tester link, and whether the
 * application ids are filled in. Static markup, mounted once.
 */
export function mountBeaconPanel(root: HTMLElement, beacon: Beacon, configured: boolean, getState: () => GameState, onToggle: (on: boolean) => void): void {
  const box = root.querySelector<HTMLInputElement>("[data-beacon=on]")!;
  const note = root.querySelector<HTMLElement>("[data-beacon=note]")!;
  const rec = beacon.record();
  box.checked = rec.on;
  note.textContent = `id ${rec.id}${rec.tester ? `, tester: ${rec.cohort}` : ""}${configured ? "" : " (not configured)"}`;
  box.addEventListener("change", () => {
    beacon.setOn(box.checked, getState());
    onToggle(box.checked);
  });
}
```

- [ ] **Step 4: The wiring in main.ts**

Read `src/main.ts` first. Then:

Imports: `createBeacon` from `./beacon/beacon`; `BEACON` from `./beacon/config`; `createDatadogSink` from `./beacon/datadog`; `applyTesterLink, loadRecord, saveRecord` from `./beacon/storage`; `mountBeaconPanel` from `./ui/beacon-panel`.

After `const params = new URLSearchParams(location.search);` and the other param reads:

```ts
// The tester link marks the device once and leaves the address; ?seed= and the rest stay.
let beaconRec = loadRecord(localStorage);
{
  const link = applyTesterLink(beaconRec, params);
  if (link.stripped) {
    beaconRec = link.rec;
    saveRecord(localStorage, beaconRec);
    params.delete("tester");
    const q = params.toString();
    history.replaceState(null, "", `${location.pathname}${q ? `?${q}` : ""}${location.hash}`);
  }
}
const beaconConfigured = Boolean(BEACON.applicationId && BEACON.clientToken);
const makeSink = () => createDatadogSink(BEACON, beaconRec.id, { tester: beaconRec.tester, cohort: beaconRec.cohort });
let sinkMade = beaconConfigured && beaconRec.on;
const beacon = createBeacon(localStorage, sinkMade ? makeSink() : null, beaconRec);
let wasDead = false;
```

Right after the call to `boot()` (find where boot() is invoked; the first statements after it run once the save is in): `beacon.opened(state); wasDead = Boolean(state.dead);`.

In `frame(now)`, after the advance/catch-up branch and before `render()`:

```ts
  if (state.dead && !wasDead) beacon.died(state, Date.now());
  wasDead = Boolean(state.dead);
  beacon.tick(state, document.visibilityState === "visible", !state.dead && !state.landing && !ui.away, now);
```

In `onClick`, case "land": after `land(state, world);` add `beacon.beganAgain(state, Date.now());`.

Beside `mountAwayDial(...)`:

```ts
mountBeaconPanel(document.getElementById("beacon")!, beacon, beaconConfigured, () => state, (on) => {
  if (on && beaconConfigured && !sinkMade) { beacon.setSink(makeSink()); sinkMade = true; }
});
```

Where `fresh()` replaces `state` (a new world), set `wasDead = false` after the assignment so a fresh world does not read as a death; where "leave-world-yes" runs, the record is untouched (it lives outside the world by design).

- [ ] **Step 5: Run the tests, the suite, tsc, the build; commit**

Run: `npx vitest run tests/beacon.test.ts && npm test && npx tsc --noEmit && npm run build 2>&1 | tail -6`
Expected: green; the build now lists a chunk for the SDK (a file named like `browser-rum-*.js` or `datadog-*.js` in `dist/assets`), loaded only by dynamic import. Name it in the report.

```bash
cd /Users/janis.kirsteins/Projects/prototypes
git add 08-survidle/index.html 08-survidle/src/ui/beacon-panel.ts 08-survidle/src/main.ts 08-survidle/tests/beacon.test.ts
git commit -m "feat(survidle): the beacon is wired - opened, heartbeat, died, began again, and the switch on the settings strip"
```

---

### Task 5: The docs

**Files:**
- Create: `docs/testing.md`
- Modify: `docs/README.md` (debug parameters: `?tester=`), `docs/superpowers/specs/2026-09-03-survidle-realism-roadmap.md` (the build-order sentence for the testing infra; a "Built" paragraph at the end of its section)

- [ ] **Step 1: docs/testing.md**

Write the page the spec's section 6 describes, in the README's voice: a heading "Testing the round"; "Before a tester is recruited" with the four author steps (create the RUM application in the EU org and paste its id and client token into `src/beacon/config.ts`; switch client IP collection off in the application's settings; confirm event retention past thirty days; confirm funnels take a time window, else the export-and-script fallback); "The tester link" (`?tester=<cohort>` marks the device beside the beacon id, disappears from the address, survives a new world; the cohort word is the invite's); "What is sent" (the five actions and their fields, verbatim from the spec's section 3, and what is never sent: no name, no email, no IP, no replay, no clicks); "The six bars" with, for each, the reading rule from the roadmap's gate table and, for the four beacon bars, the RUM query or funnel in words (re-run rate: users with a `beganAgain` within 24 h of a `died` over users with a `died`; first run: users with a `died` and a `beganAgain` inside 120 attention minutes of their first `opened`; hours of attention: median over testers of heartbeats after game day 1, divided by 60; day 30: users with an `opened` 30 days after their first, over users); the two survey bars naming the questions (would they pay ten dollars after a week; stories told unprompted) and that the form is keyed by the id the panel shows.

- [ ] **Step 2: The README**

Under "Debug URL parameters" add: `- \`?tester=<cohort>\` marks this device a tester for the round and names its cohort; the parameter is dropped from the address after one open, and the mark survives a new world. The settings strip shows the beacon id and the cohort. See docs/testing.md.`

- [ ] **Step 3: The roadmap**

In the build-order paragraph, change "then the testing infra (the section of that name below: the beacon on by default, the survey and the bars read from them)," to "then the testing infra (the section of that name below: the beacon on by default, the survey and the bars read from them; built, the application ids blank until the author fills them)," keeping the wrap. At the end of the "### The testing infra" section, before the sentence about the round not being part of the item, add a paragraph starting "**Built.**" that says what shipped (the five actions, the record beside the save, the tester link, the switch and the note, the sink with its privacy settings, docs/testing.md), that the ids are blank and the four author steps stand, and that the browser pass ran with the ids blank (the controller fills in the reading).

- [ ] **Step 4: Commit**

```bash
cd /Users/janis.kirsteins/Projects/prototypes
git add 08-survidle/docs/testing.md 08-survidle/docs/README.md 08-survidle/docs/superpowers/specs/2026-09-03-survidle-realism-roadmap.md
git commit -m "docs(survidle): the testing infra built - the operator's page, the tester link in the README, the roadmap's marker"
```
