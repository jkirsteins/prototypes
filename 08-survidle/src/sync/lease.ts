/**
 * Who may run the world. One device holds the lease and advances the
 * simulation; every other device shows the latest save read-only. These
 * rules are pure and shared: the Worker's Durable Object and the client's
 * session both import this file, so there is no second copy of "who may
 * run" to drift from the first.
 *
 * Design: `docs/superpowers/specs/2026-09-11-survidle-save-sync-design.md`.
 */

export interface Lease {
  /** The device id that holds the world. */
  holder: string;
  /** The label the holder last sent ("phone", "desktop"), for the other device's messages. */
  label: string;
  /** The secret the holder presents on every write and on its socket. */
  token: string;
  /** When the lease was taken, in ms since the epoch on the store's clock. */
  since: number;
  /** The last heartbeat, on the store's clock. */
  lastSeen: number;
}

/** What the other device is shown: the lease without its token. */
export interface LeaseView { holder: string; label: string; since: number; lastSeen: number }

/**
 * How long a silent holder keeps the world. The client heartbeats every
 * HEARTBEAT_MS, so a laptop lid closing lets the lease lapse in under two
 * minutes without anyone sending a message, and a phone dropping off wifi
 * for ten seconds is not a hand-over.
 */
export const GRACE_MS = 60_000;
export const HEARTBEAT_MS = 20_000;

/** The holder has not been heard from inside the grace period. */
export function lapsed(lease: Lease | LeaseView, now: number): boolean {
  return now - lease.lastSeen > GRACE_MS;
}

/**
 * Whether `device` may take the world now: nobody holds it, the holder is
 * this same device, the holder has gone quiet past the grace period, or
 * the device is taking it over on purpose.
 */
export function mayAcquire(lease: Lease | null, device: string, now: number, force: boolean): boolean {
  if (!lease) return true;
  if (lease.holder === device) return true;
  if (lapsed(lease, now)) return true;
  return force;
}

/** A fresh lease for `device`, taken now. The token is drawn here unless the caller supplies one (tests do). */
export function acquire(device: string, label: string, now: number, token = randomToken()): Lease {
  return { holder: device, label, token, since: now, lastSeen: now };
}

/** The lease with its holder heard from now, or the lease untouched when the token is not the holder's. */
export function heartbeat(lease: Lease | null, token: string, now: number): Lease | null {
  if (!lease || lease.token !== token) return lease;
  return { ...lease, lastSeen: now };
}

/** A write is the holder's when it carries the holder's token. */
export function mayWrite(lease: Lease | null, token: string): boolean {
  return lease !== null && token !== "" && lease.token === token;
}

/** What is safe to tell a device that is not the holder. */
export function view(lease: Lease): LeaseView {
  return { holder: lease.holder, label: lease.label, since: lease.since, lastSeen: lease.lastSeen };
}

/** 128 random bits as hex, from the platform's own generator (browser, Worker and Node all have it). */
export function randomToken(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}
