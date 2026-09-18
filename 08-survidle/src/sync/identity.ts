/**
 * What this browser knows about the sync: the code, when sync is on, and
 * its own device id, drawn once and kept for as long as the storage is.
 * Both live beside the save in local storage and neither is inside it, so
 * "reset world data" and a landing after death leave them alone: the code
 * follows the player, not the survivor.
 */

export const CODE_KEY = "survidle.sync.code";
export const DEVICE_KEY = "survidle.sync.device";

export interface SyncIdentity { code: string | null; device: string }

export function loadIdentity(storage: Storage): SyncIdentity {
  let device = storage.getItem(DEVICE_KEY);
  if (!device) {
    device = randomDeviceId();
    storage.setItem(DEVICE_KEY, device);
  }
  return { code: storage.getItem(CODE_KEY), device };
}

export function saveCode(storage: Storage, code: string | null): void {
  if (code) storage.setItem(CODE_KEY, code);
  else storage.removeItem(CODE_KEY);
}

/** "phone" on a device whose pointer is a finger, "desktop" otherwise: only ever shown to the other device. */
export function deviceLabel(coarsePointer: boolean): string {
  return coarsePointer ? "phone" : "desktop";
}

function randomDeviceId(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}
