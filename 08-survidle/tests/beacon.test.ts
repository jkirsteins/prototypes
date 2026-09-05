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
    expect(rec.attention).toEqual({ seed: 0, survivor: 0, minutes: 0 });
    expect(JSON.parse(s.getItem(BEACON_KEY)!).id).toBe(rec.id);
    s.setItem(BEACON_KEY, JSON.stringify({ id: "0123456789abcdef", on: false }));
    const again = loadRecord(s);
    expect(again.id).toBe("0123456789abcdef");
    expect(again.on).toBe(false);
    expect(again.tester).toBe(false);
    expect(again.attention).toEqual({ seed: 0, survivor: 0, minutes: 0 });
    saveRecord(s, { ...again, cohort: "wave1" });
    expect(JSON.parse(s.getItem(BEACON_KEY)!).cohort).toBe("wave1");
    s.setItem(BEACON_KEY, JSON.stringify({ id: "0123456789abcdef", attention: { minutes: 10 } }));
    const partial = loadRecord(s);
    expect(partial.attention).toEqual({ seed: 0, survivor: 0, minutes: 0 });
    s.setItem(BEACON_KEY, JSON.stringify({ id: 42 }));
    const badId = loadRecord(s);
    expect(badId.id).toMatch(/^[0-9a-f]{16}$/);
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

  it("the cohort word keeps only letters, digits and hyphens, so it can never carry a name or an email", () => {
    const rec = loadRecord(memory());
    const email = applyTesterLink(rec, new URLSearchParams("tester=Alice@Example.com"));
    expect(email.rec.cohort).toBe("aliceexamplecom");
    const hyphenated = applyTesterLink(rec, new URLSearchParams("tester=wave-1"));
    expect(hyphenated.rec.cohort).toBe("wave-1");
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
    const rec = { ...loadRecord(memory()), attention: { seed: 17, survivor: 1, minutes: 42 }, diedAt: 1_000_000 };
    state.dead = { cause: "froze", minute: state.minute };
    const d = diedFacts(state, rec);
    expect(d.cause).toBe("froze");
    expect(d.daysSurvived).toBe(1);
    expect(d.attentionMin).toBe(42);
    expect(diedFacts(state, { ...rec, attention: { seed: 17, survivor: 2, minutes: 42 } }).attentionMin).toBe(0);
    expect(beganAgainFacts(state, rec, 1_090_000).sinceDeathSec).toBe(90);
    expect(beganAgainFacts(state, { ...rec, diedAt: null }, 1_090_000).sinceDeathSec).toBeNull();
  });

  it("attention does not bleed across worlds: the same survivor number in a different seed's world carries none of it", () => {
    const { state } = newGame(19);
    const rec = { ...loadRecord(memory()), attention: { seed: 17, survivor: 1, minutes: 42 } };
    state.dead = { cause: "froze", minute: state.minute };
    expect(diedFacts(state, rec).attentionMin).toBe(0);
  });
});

import { createBeacon, deathTransition, HEARTBEAT_MS, type Sink } from "../src/beacon/beacon";

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
    expect(b.record().attention).toEqual({ seed: 17, survivor: 1, minutes: 1 });
    b.tick(state, false, true, 1000 + 2 * HEARTBEAT_MS);
    b.tick(state, true, false, 1000 + 3 * HEARTBEAT_MS);
    expect(sink.sent.length).toBe(2);
    expect(JSON.parse(s.getItem(BEACON_KEY)!).attention.minutes).toBe(1);
  });

  it("hidden time never banks a heartbeat: the arm resets while unwatched, so visible again needs a fresh sixty seconds", () => {
    const { state } = newGame(17);
    const s = memory();
    const sink = recording();
    const b = createBeacon(s, sink, loadRecord(s));
    b.tick(state, true, true, 0); // arms
    b.tick(state, false, true, 10 * 60_000); // hidden for ten minutes: the arm must not fire from this gap
    expect(sink.sent).toEqual([]);
    b.tick(state, true, true, 10 * 60_000 + 1_000); // visible again: this only re-arms, it does not fire
    expect(sink.sent).toEqual([]);
    b.tick(state, true, true, 10 * 60_000 + 1_000 + HEARTBEAT_MS - 1);
    expect(sink.sent).toEqual([]);
    b.tick(state, true, true, 10 * 60_000 + 1_000 + HEARTBEAT_MS);
    expect(sink.sent.map((e) => e.name)).toEqual(["heartbeat"]);
  });

  it("died stores the time and emits; beganAgain emits the seconds since and resets the life's attention", () => {
    const { state } = newGame(17);
    const s = memory();
    const sink = recording();
    const b = createBeacon(s, sink, { ...loadRecord(s), attention: { seed: 17, survivor: 1, minutes: 5 } });
    state.dead = { cause: "starved", minute: state.minute };
    b.died(state, 50_000);
    expect(b.record().diedAt).toBe(50_000);
    expect(sink.sent.at(-1)).toMatchObject({ name: "died", ctx: { cause: "starved", attentionMin: 5 } });
    state.dead = null;
    state.survivors.push({ ...current(state), index: 2, forecast: [], events: [], died: null });
    b.beganAgain(state, 170_000);
    expect(sink.sent.at(-1)).toMatchObject({ name: "beganAgain", ctx: { survivor: 2, sinceDeathSec: 120 } });
    expect(b.record().attention).toEqual({ seed: 17, survivor: 2, minutes: 0 });
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

describe("deathTransition", () => {
  it("fires only the frame that first crosses into dead, whether that death was dealt by play or by a reload's catch-up", () => {
    expect(deathTransition(false, true)).toBe(true);
    expect(deathTransition(true, true)).toBe(false);
    expect(deathTransition(false, false)).toBe(false);
    expect(deathTransition(true, false)).toBe(false);
  });
});

import { createDatadogSink, type RumLike } from "../src/beacon/datadog";
import { BEACON } from "../src/beacon/config";

describe("the Datadog sink", () => {
  it("queues until the SDK loads, then inits with replay and interactions off, sets the user and the context, and drains in order", async () => {
    const calls: unknown[][] = [];
    const rum: RumLike = {
      init: (o) => calls.push(["init", o]), setUser: (u) => calls.push(["setUser", u]),
      setGlobalContextProperty: (k, v) => calls.push(["ctx", k, v]), addAction: (n, c) => calls.push(["action", n, c]),
      stopSession: () => calls.push(["stop"]),
    };
    let resolve!: (m: { datadogRum: RumLike }) => void;
    const load = () => new Promise<{ datadogRum: RumLike }>((r) => { resolve = r; });
    const sink = createDatadogSink({ ...BEACON, applicationId: "app", clientToken: "tok" }, "0123456789abcdef", { tester: true, cohort: "wave1" }, () => true, load);
    sink.stop?.();
    expect(calls).toEqual([]); // no-op before the SDK has finished loading
    sink.emit("opened", { seed: 1 });
    sink.emit("heartbeat", { seed: 1 });
    expect(calls).toEqual([]);
    resolve({ datadogRum: rum });
    await new Promise((r) => setTimeout(r, 0));
    expect(calls[0][0]).toBe("init");
    const init = calls[0][1] as Record<string, unknown>;
    expect(init).toMatchObject({
      applicationId: "app", clientToken: "tok", site: "datadoghq.eu", sessionSampleRate: 100, sessionReplaySampleRate: 0,
      trackUserInteractions: false, trackResources: false, trackLongTasks: false, defaultPrivacyLevel: "mask", trackAnonymousUser: false,
    });
    expect(calls[1]).toEqual(["setUser", { id: "0123456789abcdef" }]);
    expect(calls.slice(2, 4)).toEqual([["ctx", "tester", true], ["ctx", "cohort", "wave1"]]);
    expect(calls.slice(4)).toEqual([["action", "opened", { seed: 1 }], ["action", "heartbeat", { seed: 1 }]]);
    sink.emit("died", { seed: 1 });
    expect(calls.at(-1)).toEqual(["action", "died", { seed: 1 }]);
    sink.stop?.();
    expect(calls.at(-1)).toEqual(["stop"]);
  });

  it("beforeSend drops an event once the switch reads off, and otherwise blanks the referrer and keeps it", async () => {
    let beforeSend!: (event: unknown) => boolean;
    const rum: RumLike = {
      init: (o) => { beforeSend = (o as Record<string, unknown>).beforeSend as (event: unknown) => boolean; },
      setUser: () => {}, setGlobalContextProperty: () => {}, addAction: () => {},
    };
    let on = true;
    const sink = createDatadogSink(BEACON, "id", {}, () => on, () => Promise.resolve({ datadogRum: rum }));
    sink.emit("opened", {});
    await new Promise((r) => setTimeout(r, 0));
    const event = { view: { referrer: "https://example.com/page" } };
    expect(beforeSend(event)).toBe(true);
    expect(event.view.referrer).toBe("");
    on = false;
    expect(beforeSend({ view: { referrer: "x" } })).toBe(false);
  });

  it("a failed load drops the queue and the game is unaffected", async () => {
    const sink = createDatadogSink(BEACON, "id", {}, () => true, () => Promise.reject(new Error("offline")));
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
    // The id sits in its own element so a double-click can select just it.
    expect(note.querySelector("code[data-beacon=id]")!.textContent).toBe("0123456789abcdef");
    box.checked = false;
    box.dispatchEvent(new Event("change"));
    expect(toggled).toEqual([false]);
    expect(b.record().on).toBe(false);
    const root2 = document.createElement("div");
    root2.innerHTML = root.innerHTML;
    mountBeaconPanel(root2, createBeacon(s, null, { ...rec, tester: false, cohort: null }), true, () => state, () => {});
    expect(root2.querySelector("[data-beacon=note]")!.textContent).toBe("id 0123456789abcdef");
  });

  it("turning on calls onToggle before setOn, so a sink the callback creates still receives the settings action", () => {
    const { state } = newGame(17);
    const s = memory();
    const rec = { ...loadRecord(s), on: false };
    const b = createBeacon(s, null, rec);
    const sink = recording();
    const root = document.createElement("div");
    root.innerHTML = `<label><input type="checkbox" data-beacon="on" /> share anonymous play data</label><span class="dim" data-beacon="note"></span>`;
    mountBeaconPanel(root, b, true, () => state, (on) => {
      if (on) b.setSink(sink);
    });
    const box = root.querySelector<HTMLInputElement>("[data-beacon=on]")!;
    box.checked = true;
    box.dispatchEvent(new Event("change"));
    expect(sink.sent.map((e) => e.name)).toEqual(["settings"]);
  });
});
