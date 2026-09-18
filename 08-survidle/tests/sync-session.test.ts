import { describe, expect, it } from "vitest";
import { acquire, GRACE_MS, type Lease, mayAcquire, mayWrite, view } from "../src/sync/lease";
import { body, createSession, PUT_INTERVAL_MS, type Session, type SessionView, type Timers } from "../src/sync/session";
import type { SocketEvents, Store } from "../src/sync/store";

/**
 * The session against a store in memory that applies the real lease rules
 * on its own clock, so "held live" and "lapsed" mean what the Worker means.
 */

const VERSION = 10;
const save = (minute: number, savedAt: number, version = VERSION) => JSON.stringify({ version, worldVersion: 5, savedAt, state: { minute } });

interface FakeStore extends Store {
  data: { text: string | null; version: number; savedAt: number; lease: Lease | null };
  now: number;
  unreachable: boolean;
  puts: { text: string; savedAt: number; keepalive: boolean }[];
  leases: boolean[];
  socket: { token: string; events: SocketEvents } | null;
  heartbeats: number;
  /** Another device takes the world by force, as the Worker would: the lease moves and the old holder's socket hears it. */
  takeElsewhere(device: string, label: string): void;
}

function fakeStore(text: string | null, savedAt = 0, version = VERSION): FakeStore {
  const s: FakeStore = {
    data: { text, version: text ? version : 0, savedAt, lease: null },
    now: 1_000_000,
    unreachable: false,
    puts: [],
    leases: [],
    socket: null,
    heartbeats: 0,
    async fetchLatest() {
      if (s.unreachable) throw new Error("network");
      if (s.data.text === null) return null;
      return { text: s.data.text, version: s.data.version, savedAt: s.data.savedAt, lease: s.data.lease && view(s.data.lease) };
    },
    async headLatest() {
      if (s.unreachable) throw new Error("network");
      return { exists: s.data.text !== null, version: s.data.version, savedAt: s.data.savedAt, lease: s.data.lease && view(s.data.lease) };
    },
    async putSave(text, version, savedAt, token, keepalive) {
      if (s.unreachable) throw new Error("network");
      if (!mayWrite(s.data.lease, token)) return { kind: "held", lease: s.data.lease && view(s.data.lease) };
      if (version < s.data.version) return { kind: "newer", version: s.data.version };
      s.puts.push({ text, savedAt, keepalive });
      s.data = { ...s.data, text, version, savedAt };
      return { kind: "ok" };
    },
    async takeLease(force) {
      if (s.unreachable) throw new Error("network");
      s.leases.push(force);
      if (!mayAcquire(s.data.lease, "me", s.now, force)) return { kind: "held", lease: view(s.data.lease!) };
      s.data.lease = acquire("me", "desktop", s.now, `tok-${s.leases.length}`);
      return { kind: "granted", token: s.data.lease.token, lease: view(s.data.lease) };
    },
    openSocket(token, events) { s.socket = { token, events }; },
    sendHeartbeat() { s.heartbeats++; },
    closeSocket() { s.socket = null; },
    takeElsewhere(device, label) {
      const old = s.data.lease;
      s.data.lease = acquire(device, label, s.now, `tok-${device}`);
      if (s.socket && old && s.socket.token === old.token) s.socket.events.revoked(label, s.now);
    },
  };
  return s;
}

function fakeTimers(): Timers & { fire(ms: number): void } {
  const set = new Map<number, { fn: () => void; ms: number }>();
  let n = 0;
  return {
    set(fn, ms) { set.set(++n, { fn, ms }); return n; },
    clear(h) { set.delete(h as number); },
    fire(ms) { for (const t of set.values()) if (t.ms === ms) t.fn(); },
  };
}

function make(store: FakeStore, timers = fakeTimers()): { session: Session; changes: SessionView["state"][]; timers: typeof timers } {
  const changes: SessionView["state"][] = [];
  const session = createSession({
    store,
    device: "me",
    label: "desktop",
    version: VERSION,
    canRun: (text) => JSON.parse(text).version === VERSION,
    now: () => store.now,
    onChange: () => changes.push(session.view().state),
    timers,
  });
  return { session, changes, timers };
}

describe("boot", () => {
  it("takes a free lease, runs the store's save, and starts the socket and the timers", async () => {
    const store = fakeStore(save(100, 5000), 5000);
    const { session, changes } = make(store);
    const out = await session.boot(null);
    expect(out).toEqual({ kind: "run", text: save(100, 5000), savedAt: 5000 });
    expect(session.view().state).toBe("running");
    expect(changes).toEqual(["checking", "running"]);
    expect(store.leases).toEqual([false]);
    expect(store.socket?.token).toBe("tok-1");
    expect(store.puts).toEqual([]);
  });

  it("uploads the local save when the store is empty", async () => {
    const store = fakeStore(null);
    const { session } = make(store);
    const out = await session.boot({ text: save(7, 4000), savedAt: 4000 });
    expect(out).toEqual({ kind: "run", text: null, savedAt: 4000 });
    expect(store.puts.map((p) => p.savedAt)).toEqual([4000]);
    expect(store.data.text).toBe(save(7, 4000));
  });

  it("ends read-only against a live lease and never takes it", async () => {
    const store = fakeStore(save(100, 5000), 5000);
    store.data.lease = acquire("phone-1", "phone", store.now - 1000, "tok-phone");
    const { session } = make(store);
    const out = await session.boot(null);
    expect(out).toEqual({ kind: "readonly", text: save(100, 5000) });
    expect(session.view().state).toBe("readonly");
    expect(session.view().lease?.label).toBe("phone");
    expect(store.data.lease?.holder).toBe("phone-1");
    expect(store.socket).toBeNull();
  });

  it("takes a lease that lapsed past the grace period", async () => {
    const store = fakeStore(save(100, 5000), 5000);
    store.data.lease = acquire("phone-1", "phone", store.now - GRACE_MS - 1, "tok-phone");
    const { session } = make(store);
    expect((await session.boot(null)).kind).toBe("run");
    expect(store.data.lease?.holder).toBe("me");
  });

  it("is unreachable when the store does not answer, and shows nothing as runnable", async () => {
    const store = fakeStore(save(100, 5000), 5000);
    store.unreachable = true;
    const { session } = make(store);
    expect(await session.boot(null)).toEqual({ kind: "unreachable" });
    expect(session.view().state).toBe("unreachable");
    expect(store.leases).toEqual([]);
  });

  it("takes no lease on a save from a newer build, nor on one this build refuses", async () => {
    const newer = fakeStore(save(100, 5000, VERSION + 1), 5000, VERSION + 1);
    const a = make(newer);
    expect(await a.session.boot(null)).toEqual({ kind: "outdated", text: save(100, 5000, VERSION + 1), version: VERSION + 1 });
    expect(newer.leases).toEqual([]);

    const older = fakeStore(save(100, 5000, VERSION - 1), 5000, VERSION - 1);
    const b = make(older);
    expect((await b.session.boot(null)).kind).toBe("older");
    expect(older.leases).toEqual([]);

  });

  it("starts a new world on the code under a forced lease once the old save is refused", async () => {
    const store = fakeStore(save(100, 5000, VERSION - 1), 5000, VERSION - 1);
    const { session } = make(store);
    await session.boot(null);
    const out = await session.startNewWorld({ text: save(0, 6000), savedAt: 6000 });
    expect(out).toEqual({ kind: "run", text: null, savedAt: 6000 });
    expect(store.leases).toEqual([true]);
    expect(store.data.text).toBe(save(0, 6000));
    expect(store.data.version).toBe(VERSION);
  });
});

describe("running", () => {
  it("puts on the interval only when the state advanced", async () => {
    const store = fakeStore(save(100, 5000), 5000);
    const { session, timers } = make(store);
    await session.boot(null);
    // The same state written again with a new savedAt is not an advance.
    session.offer(save(100, 5100), 5100);
    timers.fire(PUT_INTERVAL_MS);
    await session.flush(false);
    expect(store.puts).toEqual([]);
    session.offer(save(101, 5200), 5200);
    timers.fire(PUT_INTERVAL_MS);
    await session.flush(false);
    expect(store.puts.map((p) => p.savedAt)).toEqual([5200]);
    expect(session.view().savedAt).toBe(5200);
    // And once put, the same state does not go again.
    timers.fire(PUT_INTERVAL_MS);
    await session.flush(false);
    expect(store.puts.length).toBe(1);
  });

  it("heartbeats on its timer", async () => {
    const store = fakeStore(save(100, 5000), 5000);
    const { session, timers } = make(store);
    await session.boot(null);
    timers.fire(20_000);
    timers.fire(20_000);
    expect(store.heartbeats).toBe(2);
  });

  it("keeps running when a put fails on the network, says so, and clears it when the next lands", async () => {
    const store = fakeStore(save(100, 5000), 5000);
    const { session } = make(store);
    await session.boot(null);
    store.unreachable = true;
    session.offer(save(101, 5200), 5200);
    await session.flush(false);
    expect(session.view().state).toBe("running");
    expect(session.view().lastPutFailedAt).toBe(store.now);
    store.unreachable = false;
    await session.flush(false);
    expect(store.puts.length).toBe(1);
    expect(session.view().lastPutFailedAt).toBeNull();
  });

  it("is revoked the moment the socket says so, and writes nothing more", async () => {
    const store = fakeStore(save(100, 5000), 5000);
    const { session, timers } = make(store);
    await session.boot(null);
    store.takeElsewhere("phone-1", "phone");
    expect(session.view().state).toBe("revoked");
    expect(session.view().revoked?.by).toBe("phone");
    expect(store.socket).toBeNull();
    session.offer(save(101, 5200), 5200);
    timers.fire(PUT_INTERVAL_MS);
    await session.flush(true);
    expect(store.puts).toEqual([]);
    timers.fire(20_000);
    expect(store.heartbeats).toBe(0);
  });

  it("is revoked by a put the store refuses for the lease", async () => {
    const store = fakeStore(save(100, 5000), 5000);
    const { session } = make(store);
    await session.boot(null);
    // The lease moved without the socket saying so (a dropped connection).
    store.data.lease = acquire("phone-1", "phone", store.now, "tok-phone");
    session.offer(save(101, 5200), 5200);
    await session.flush(false);
    expect(session.view().state).toBe("revoked");
    expect(session.view().lease?.holder).toBe("phone-1");
  });

  it("boots again from the store after a revoke, read-only while the other device is live", async () => {
    const store = fakeStore(save(100, 5000), 5000);
    const { session } = make(store);
    await session.boot(null);
    store.takeElsewhere("phone-1", "phone");
    store.data = { ...store.data, text: save(140, 9000), savedAt: 9000 };
    expect(await session.boot(null)).toEqual({ kind: "readonly", text: save(140, 9000) });
  });
});

describe("the resumed tab", () => {
  it("catches up when the lease is still its own and the store's latest is its own put", async () => {
    const store = fakeStore(save(100, 5000), 5000);
    const { session } = make(store);
    await session.boot(null);
    session.offer(save(101, 5200), 5200);
    await session.flush(true);
    expect(await session.resumeCheck()).toBe("run");
    expect(session.view().state).toBe("running");
  });

  it("never catches up when the store holds a newer save", async () => {
    const store = fakeStore(save(100, 5000), 5000);
    const { session } = make(store);
    await session.boot(null);
    // The phone took over while the laptop slept, and the lease has since lapsed back.
    store.data = { ...store.data, text: save(300, 9000), savedAt: 9000, lease: acquire("phone-1", "phone", store.now - GRACE_MS * 2, "tok-phone") };
    expect(await session.resumeCheck()).toBe("revoked");
    expect(session.view().state).toBe("revoked");
    session.offer(save(101, 5200), 5200);
    await session.flush(false);
    expect(store.puts).toEqual([]);
  });

  it("is unreachable, not running, when the store does not answer", async () => {
    const store = fakeStore(save(100, 5000), 5000);
    const { session } = make(store);
    await session.boot(null);
    store.unreachable = true;
    expect(await session.resumeCheck()).toBe("unreachable");
    expect(session.view().state).toBe("unreachable");
  });
});

describe("take over", () => {
  it("forces the lease and runs the save as it stands now", async () => {
    const store = fakeStore(save(100, 5000), 5000);
    store.data.lease = acquire("phone-1", "phone", store.now, "tok-phone");
    const { session } = make(store);
    expect((await session.boot(null)).kind).toBe("readonly");
    store.data = { ...store.data, text: save(120, 7000), savedAt: 7000 };
    expect(await session.takeOver()).toEqual({ kind: "run", text: save(120, 7000), savedAt: 7000 });
    expect(store.leases).toEqual([false, true]);
    expect(store.data.lease?.holder).toBe("me");
  });

  it("stops cleanly: no socket, no timers, state off", async () => {
    const store = fakeStore(save(100, 5000), 5000);
    const { session, timers } = make(store);
    await session.boot(null);
    session.stop();
    expect(session.view().state).toBe("off");
    expect(store.socket).toBeNull();
    timers.fire(20_000);
    expect(store.heartbeats).toBe(0);
  });
});

describe("the save body", () => {
  it("is the state alone, so a re-save of the same state is no advance", () => {
    expect(body(save(1, 100))).toBe(body(save(1, 200)));
    expect(body(save(1, 100))).not.toBe(body(save(2, 100)));
  });
});
