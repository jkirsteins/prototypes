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
    s.setItem(BEACON_KEY, JSON.stringify({ id: "0123456789abcdef", attention: { minutes: 10 } }));
    const partial = loadRecord(s);
    expect(partial.attention).toEqual({ survivor: 0, minutes: 0 });
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
