/**
 * A solved world costs a worker pass (about five seconds); IndexedDB lets a
 * returning seed skip it. One record per key, typed arrays cloned as-is.
 * Any failure here (no IndexedDB, quota, a version error) is a cache miss
 * or a no-op write, never an error the caller has to handle.
 */
import { GENERATOR_VERSION, type SolvedWorld } from "./solve";

const DB_NAME = "survidle-worlds";
const STORE_NAME = "worlds";
const DB_VERSION = 1;

export function worldKey(seed: number, w: number, h: number): string {
  return `${seed}-${w}x${h}-v${GENERATOR_VERSION}`;
}

/** The record shape stored under `key`: the seven arrays a SolvedWorld is made of, plus the key itself as keyPath. */
export interface WorldRecord {
  key: string;
  w: number;
  h: number;
  height: Int16Array;
  flowDir: Uint8Array;
  discharge: Float32Array;
  kind: Uint8Array;
  flags: Uint8Array;
  terrain: Uint8Array;
  moisture: Uint8Array;
}

/** The two calls the module needs from a store; IndexedDB is the real one, tests inject a fake. */
export interface WorldStore {
  get(key: string): Promise<WorldRecord | undefined>;
  put(record: WorldRecord): Promise<void>;
}

let storeOverride: WorldStore | null = null;

/** Test seam: inject a fake store, or pass null to go back to IndexedDB. */
export function setWorldStore(store: WorldStore | null): void {
  storeOverride = store;
  dbStorePromise = null;
  sweepDone = false;
}

let dbStorePromise: Promise<WorldStore | null> | null = null;
let sweepDone = false;

function openDb(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    if (typeof indexedDB === "undefined") {
      resolve(null);
      return;
    }
    let req: IDBOpenDBRequest;
    try {
      req = indexedDB.open(DB_NAME, DB_VERSION);
    } catch {
      resolve(null);
      return;
    }
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME, { keyPath: "key" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve(null);
    req.onblocked = () => resolve(null);
  });
}

/** Keeps the store to the current generator: any record whose key does not end in the live version is stale and gone. */
function sweepOldVersions(db: IDBDatabase): Promise<void> {
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      const req = store.getAllKeys();
      req.onsuccess = () => {
        const suffix = `-v${GENERATOR_VERSION}`;
        for (const k of req.result) if (typeof k === "string" && !k.endsWith(suffix)) store.delete(k);
      };
      req.onerror = () => resolve();
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
      tx.onabort = () => resolve();
    } catch {
      resolve();
    }
  });
}

function realStore(db: IDBDatabase): WorldStore {
  return {
    get(key) {
      return new Promise((resolve) => {
        try {
          const req = db.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME).get(key);
          req.onsuccess = () => resolve(req.result as WorldRecord | undefined);
          req.onerror = () => resolve(undefined);
        } catch {
          resolve(undefined);
        }
      });
    },
    put(record) {
      return new Promise((resolve) => {
        try {
          const tx = db.transaction(STORE_NAME, "readwrite");
          tx.objectStore(STORE_NAME).put(record);
          tx.oncomplete = () => resolve();
          tx.onerror = () => resolve();
          tx.onabort = () => resolve();
        } catch {
          resolve();
        }
      });
    },
  };
}

function getStore(): Promise<WorldStore | null> {
  if (storeOverride) return Promise.resolve(storeOverride);
  if (!dbStorePromise) {
    dbStorePromise = openDb().then(async (db) => {
      if (!db) return null;
      if (!sweepDone) {
        sweepDone = true;
        await sweepOldVersions(db);
      }
      return realStore(db);
    });
  }
  return dbStorePromise;
}

export async function readSolved(key: string): Promise<SolvedWorld | null> {
  try {
    const store = await getStore();
    if (!store) return null;
    const record = await store.get(key);
    if (!record) return null;
    return {
      w: record.w, h: record.h,
      height: record.height, flowDir: record.flowDir, discharge: record.discharge,
      kind: record.kind, flags: record.flags, terrain: record.terrain, moisture: record.moisture,
    };
  } catch {
    return null;
  }
}

export async function writeSolved(key: string, solved: SolvedWorld): Promise<void> {
  try {
    const store = await getStore();
    if (!store) return;
    await store.put({
      key, w: solved.w, h: solved.h,
      height: solved.height, flowDir: solved.flowDir, discharge: solved.discharge,
      kind: solved.kind, flags: solved.flags, terrain: solved.terrain, moisture: solved.moisture,
    });
  } catch {
    // A quota failure or a broken store is a silent miss, not a caller-visible error.
  }
}
