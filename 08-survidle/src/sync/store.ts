import type { LeaseView } from "./lease";

/**
 * What the client asks of the store, and what the tests fake. `client.ts`
 * is the one implementation that talks HTTP; `session.ts` is written
 * against this interface alone and never sees a URL.
 *
 * Every method that reaches the network throws on a network failure. A
 * response the store did send, whatever its status, is a result.
 */

/** The store's latest save, with the envelope the store keeps beside it. */
export interface Latest { text: string; version: number; savedAt: number; lease: LeaseView | null }

/** The envelope alone, for the cheap "is my save still the latest" check. `exists` is false when the code has no save yet. */
export interface Head { exists: boolean; version: number; savedAt: number; lease: LeaseView | null }

export type PutResult =
  | { kind: "ok" }
  /** Another device holds the lease, or the token is stale. */
  | { kind: "held"; lease: LeaseView | null }
  /** The store's save is from a newer build than the one putting. */
  | { kind: "newer"; version: number }
  | { kind: "toolarge" };

export type LeaseResult =
  | { kind: "granted"; token: string; lease: LeaseView }
  | { kind: "held"; lease: LeaseView };

export interface SocketEvents {
  /** Another device took the world over by force. */
  revoked(by: string, at: number): void;
  /** The socket opened, or reopened after a drop. */
  open(): void;
  /** The socket closed for a reason other than a revoke or `closeSocket`. */
  dropped(): void;
}

export interface Store {
  fetchLatest(): Promise<Latest | null>;
  headLatest(): Promise<Head>;
  putSave(text: string, version: number, savedAt: number, token: string, keepalive: boolean): Promise<PutResult>;
  takeLease(force: boolean): Promise<LeaseResult>;
  /** Opens the holder's socket. Reconnects on its own after a drop while the token stands. */
  openSocket(token: string, events: SocketEvents): void;
  /** Tells the store the holder is still here; a no-op while the socket is down. */
  sendHeartbeat(): void;
  closeSocket(): void;
}
