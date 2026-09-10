export const DEFAULT_CLOUD_SHADOWS = true;
export const CLOUD_SHADOWS_KEY = "survidle.map.cloud-shadows";

export function loadCloudShadows(storage: Storage = localStorage): boolean {
  try {
    const value = JSON.parse(storage.getItem(CLOUD_SHADOWS_KEY) ?? "true") as unknown;
    return typeof value === "boolean" ? value : DEFAULT_CLOUD_SHADOWS;
  } catch {
    return DEFAULT_CLOUD_SHADOWS;
  }
}

export function saveCloudShadows(enabled: boolean, storage: Storage = localStorage): void {
  try {
    storage.setItem(CLOUD_SHADOWS_KEY, JSON.stringify(enabled));
  } catch {
    // The choice still lasts for this page when storage is unavailable.
  }
}
