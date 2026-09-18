import { HEARTBEAT_MS, type LeaseView } from "./lease";
import type { Store } from "./store";

/**
 * The sync session: the part of the sync that knows about the game. It
 * owns the lease token, the heartbeat, the periodic put, and the one rule
 * that sits in front of every catch-up and every live frame - never
 * advance the world from a save that is not the store's latest. It is
 * written against `Store` alone, so the tests drive it with a fake in
 * memory and the page drives it with `client.ts`.
 *
 * States, and what the page does in each:
 *
 * - `off`: no code, or turned off. The game is exactly as without sync.
 * - `checking`: a fetch or a lease is in flight. The frame does not advance.
 * - `running`: this device holds the lease and its save is the latest.
 * - `readonly`: another device holds the world live. The latest save is
 *   shown and nothing may be ordered against it.
 * - `revoked`: another device took the world over while this one ran it.
 *   The loop stops and nothing is written anywhere until a reload.
 * - `unreachable`: the store did not answer. The local save is shown
 *   read-only; the game never guesses that it may run.
 * - `outdated`: the store's save is from a newer build than this one.
 * - `older`: the store's save is from an older build, or one this build
 *   refuses; no lease is taken, and the page offers a new world on the code.
 */
export type SyncState = "off" | "checking" | "running" | "readonly" | "revoked" | "unreachable" | "outdated" | "older";

export interface SessionView {
  state: SyncState;
  /** The lease as last seen, the other device's when this one is not the holder. */
  lease: LeaseView | null;
  /** The store's latest save time as last known. */
  savedAt: number | null;
  storeVersion: number | null;
  /** Set while a put has been failing on the network; cleared by the next put that lands. */
  lastPutFailedAt: number | null;
  /** Who took the world over, once `revoked`. */
  revoked: { by: string; at: number } | null;
}

export type BootOutcome =
  /** Run the world from `text`, or from the local save when the store had none (it has been uploaded). */
  | { kind: "run"; text: string | null; savedAt: number }
  | { kind: "readonly"; text: string | null }
  | { kind: "unreachable" }
  | { kind: "outdated"; text: string; version: number }
  | { kind: "older"; text: string; version: number };

export interface LocalSave { text: string; savedAt: number }

export interface SessionDeps {
  store: Store;
  device: string;
  label: string;
  /** This build's save version; the store's is read against it. */
  version: number;
  /** Whether this build can load the text at all (the envelope check), beyond the version number. */
  canRun(text: string): boolean;
  now(): number;
  /** Called after every state change, so the page redraws its banner. */
  onChange(): void;
  timers?: Timers;
}

export interface Timers {
  set(fn: () => void, ms: number): unknown;
  clear(handle: unknown): void;
}

/** A save that has advanced goes up this often while the tab is visible; a crash loses at most this much. */
export const PUT_INTERVAL_MS = 60_000;

export interface Session {
  view(): SessionView;
  /** The boot check: fetch, version, lease. `local` is uploaded when the store is empty. */
  boot(local: LocalSave | null): Promise<BootOutcome>;
  /** Takes the world by force and re-fetches its save, which may have moved. */
  takeOver(): Promise<BootOutcome>;
  /** For the `older` state: puts a new world on this code under a forced lease. */
  startNewWorld(local: LocalSave): Promise<BootOutcome>;
  /** The rule in front of a resumed tab's catch-up. */
  resumeCheck(): Promise<"run" | "revoked" | "unreachable">;
  /** The latest save, as the page wrote it locally. Goes up on the next periodic put if it changed. */
  offer(text: string, savedAt: number): void;
  /** Puts the offered save now; `keepalive` for pagehide. */
  flush(keepalive: boolean): Promise<void>;
  /** Marks that the frame loop has just finished a catch-up: the world advanced without an offer. */
  stop(): void;
}

export function createSession(deps: SessionDeps): Session {
  const timers: Timers = deps.timers ?? {
    set: (fn, ms) => setInterval(fn, ms),
    clear: (h) => clearInterval(h as ReturnType<typeof setInterval>),
  };
  const v: SessionView = { state: "off", lease: null, savedAt: null, storeVersion: null, lastPutFailedAt: null, revoked: null };
  let token = "";
  let mine: LeaseView | null = null;
  let pending: LocalSave | null = null;
  let lastPutBody = "";
  let attemptedSavedAt: number | null = null;
  let heartbeatTimer: unknown = null;
  let putTimer: unknown = null;
  let putting: Promise<void> | null = null;

  function set(state: SyncState): void {
    v.state = state;
    deps.onChange();
  }

  function stopTimers(): void {
    if (heartbeatTimer !== null) timers.clear(heartbeatTimer);
    if (putTimer !== null) timers.clear(putTimer);
    heartbeatTimer = null;
    putTimer = null;
  }

  function revoke(lease: LeaseView | null, by: string | null, at: number): void {
    stopTimers();
    deps.store.closeSocket();
    token = "";
    mine = null;
    pending = null;
    v.lease = lease;
    v.revoked = { by: by ?? lease?.label ?? "another device", at };
    set("revoked");
  }

  /** This device holds the world: the socket, the heartbeat and the periodic put start. */
  function start(granted: { token: string; lease: LeaseView }): void {
    token = granted.token;
    mine = granted.lease;
    v.lease = granted.lease;
    v.revoked = null;
    v.lastPutFailedAt = null;
    deps.store.openSocket(token, {
      revoked: (by, at) => revoke(null, by, at),
      open: () => {},
      dropped: () => {},
    });
    stopTimers();
    heartbeatTimer = timers.set(() => deps.store.sendHeartbeat(), HEARTBEAT_MS);
    putTimer = timers.set(() => { void put(false); }, PUT_INTERVAL_MS);
    set("running");
  }

  /** Reads the store's latest against this build. Returns the outcome that ends the boot, or null to go on to the lease. */
  function judge(latest: { text: string; version: number; savedAt: number; lease: LeaseView | null }): BootOutcome | null {
    v.storeVersion = latest.version;
    v.savedAt = latest.savedAt;
    v.lease = latest.lease;
    if (latest.version > deps.version) {
      set("outdated");
      return { kind: "outdated", text: latest.text, version: latest.version };
    }
    if (latest.version < deps.version || !deps.canRun(latest.text)) {
      set("older");
      return { kind: "older", text: latest.text, version: latest.version };
    }
    return null;
  }

  async function put(keepalive: boolean): Promise<void> {
    if (putting) return putting;
    putting = (async () => {
      if (!pending || v.state !== "running") return;
      const save = pending;
      if (body(save.text) === lastPutBody) return;
      attemptedSavedAt = save.savedAt;
      let r: Awaited<ReturnType<Store["putSave"]>>;
      try {
        r = await deps.store.putSave(save.text, deps.version, save.savedAt, token, keepalive);
      } catch {
        v.lastPutFailedAt = deps.now();
        deps.onChange();
        return;
      }
      if (v.state !== "running") return;
      switch (r.kind) {
        case "ok":
          lastPutBody = body(save.text);
          v.savedAt = save.savedAt;
          if (v.lastPutFailedAt !== null) {
            v.lastPutFailedAt = null;
            deps.onChange();
          }
          return;
        case "held":
          revoke(r.lease, null, deps.now());
          return;
        case "newer":
          stopTimers();
          deps.store.closeSocket();
          v.storeVersion = r.version;
          set("outdated");
          return;
        case "toolarge":
          // Kept running: the lease is still this device's. The save is a bug to trace, and the banner says a put is failing.
          v.lastPutFailedAt = deps.now();
          deps.onChange();
          return;
      }
    })().finally(() => { putting = null; });
    return putting;
  }

  async function acquire(force: boolean, local: LocalSave | null): Promise<BootOutcome> {
    let latest: Awaited<ReturnType<Store["fetchLatest"]>>;
    try {
      latest = await deps.store.fetchLatest();
    } catch {
      set("unreachable");
      return { kind: "unreachable" };
    }
    if (latest) {
      const verdict = judge(latest);
      if (verdict) return verdict;
    } else {
      v.storeVersion = null;
      v.savedAt = null;
    }
    let r: Awaited<ReturnType<Store["takeLease"]>>;
    try {
      r = await deps.store.takeLease(force);
    } catch {
      set("unreachable");
      return { kind: "unreachable" };
    }
    if (r.kind === "held") {
      v.lease = r.lease;
      set("readonly");
      return { kind: "readonly", text: latest?.text ?? null };
    }
    if (latest) {
      lastPutBody = body(latest.text);
      pending = null;
      start(r);
      return { kind: "run", text: latest.text, savedAt: latest.savedAt };
    }
    // An empty store: the local save is the world, and goes up before anything runs on it.
    lastPutBody = "";
    pending = local;
    start(r);
    if (local) await put(false);
    return { kind: "run", text: null, savedAt: local?.savedAt ?? 0 };
  }

  return {
    view: () => v,

    async boot(local) {
      stopTimers();
      deps.store.closeSocket();
      token = "";
      v.revoked = null;
      set("checking");
      return acquire(false, local);
    },

    async takeOver() {
      stopTimers();
      deps.store.closeSocket();
      token = "";
      v.revoked = null;
      set("checking");
      return acquire(true, null);
    },

    async startNewWorld(local) {
      stopTimers();
      deps.store.closeSocket();
      token = "";
      v.revoked = null;
      set("checking");
      let r: Awaited<ReturnType<Store["takeLease"]>>;
      try {
        r = await deps.store.takeLease(true);
      } catch {
        set("unreachable");
        return { kind: "unreachable" };
      }
      if (r.kind === "held") {
        // Cannot happen on a forced take; the store says otherwise, so believe it.
        v.lease = r.lease;
        set("readonly");
        return { kind: "readonly", text: null };
      }
      lastPutBody = "";
      pending = local;
      v.storeVersion = deps.version;
      start(r);
      await put(false);
      return { kind: "run", text: null, savedAt: local.savedAt };
    },

    async resumeCheck() {
      if (v.state !== "running") return v.state === "unreachable" ? "unreachable" : "revoked";
      set("checking");
      let head: Awaited<ReturnType<Store["headLatest"]>>;
      try {
        head = await deps.store.headLatest();
      } catch {
        stopTimers();
        deps.store.closeSocket();
        set("unreachable");
        return "unreachable";
      }
      const stillMine = head.lease !== null && mine !== null && head.lease.holder === deps.device && head.lease.since === mine.since;
      // The store's latest is ours when it is what we last put, or what we last
      // tried to put: a keepalive put fired as the tab hid may land after the
      // tab has already woken and asked.
      const latestIsOurs = head.savedAt === v.savedAt || head.savedAt === attemptedSavedAt;
      if (stillMine && latestIsOurs) {
        set("running");
        return "run";
      }
      revoke(head.lease, null, deps.now());
      return "revoked";
    },

    offer(text, savedAt) {
      if (v.state !== "running") return;
      pending = { text, savedAt };
    },

    flush: (keepalive) => put(keepalive),

    stop() {
      stopTimers();
      deps.store.closeSocket();
      token = "";
      mine = null;
      pending = null;
      v.lease = null;
      v.revoked = null;
      v.lastPutFailedAt = null;
      set("off");
    },
  };
}

/**
 * A save's body without its `savedAt`: the envelope changes on every write
 * and the state does not, and the periodic put is for a state that moved.
 */
export function body(text: string): string {
  const i = text.indexOf('"state"');
  return i < 0 ? text : text.slice(i);
}
