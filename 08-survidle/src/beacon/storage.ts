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
  return { id, on: true, tester: false, cohort: null, diedAt: null, attention: { seed: 0, survivor: 0, minutes: 0 } };
}

/**
 * The stored record with any missing field filled, saved back when anything
 * was missing; a new record with a new id when nothing is stored. Blocked
 * site data (a private window with storage denied, an exhausted quota) is
 * read as if nothing were stored, so a beacon that cannot persist still
 * boots the game.
 */
export function loadRecord(storage: Storage, id: () => string = newId): BeaconRecord {
  try {
    let stored: Partial<BeaconRecord> | null = null;
    try { stored = JSON.parse(storage.getItem(BEACON_KEY) ?? "null"); } catch { stored = null; }
    const idVal = typeof stored?.id === "string" && stored.id ? stored.id : id();
    const rec = { ...fresh(idVal), ...(stored ?? {}), id: idVal } as BeaconRecord;
    if (!rec.attention || typeof rec.attention.seed !== "number" || typeof rec.attention.survivor !== "number" || typeof rec.attention.minutes !== "number") {
      rec.attention = { seed: 0, survivor: 0, minutes: 0 };
    }
    if (JSON.stringify(rec) !== storage.getItem(BEACON_KEY)) saveRecord(storage, rec);
    return rec;
  } catch {
    return fresh(id());
  }
}

/** Never throws: a write that storage refuses leaves the record unsaved rather than blocking the caller. */
export function saveRecord(storage: Storage, rec: BeaconRecord): void {
  try { storage.setItem(BEACON_KEY, JSON.stringify(rec)); } catch { /* blocked site data: nothing to persist to */ }
}

/** `?tester=<cohort>` marks the device and names its cohort, keeping only letters, digits and hyphens so the word can never carry a name or email; the caller drops the parameter from the address. */
export function applyTesterLink(rec: BeaconRecord, params: URLSearchParams): { rec: BeaconRecord; stripped: boolean } {
  if (!params.has("tester")) return { rec, stripped: false };
  const word = (params.get("tester") ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "")
    .slice(0, COHORT_MAX);
  return { rec: { ...rec, tester: true, cohort: word || "default" }, stripped: true };
}
