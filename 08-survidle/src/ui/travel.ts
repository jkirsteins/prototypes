import { fmtDuration, fmtKm } from "../units";

export type TravelDisplay = "distance" | "time" | "both";
export const DEFAULT_TRAVEL_DISPLAY: TravelDisplay = "distance";
export const DISPLAY_SETTINGS_KEY = "survidle.display";

export function formatTravel(km: number, minutes: number, display: TravelDisplay): string {
  const distance = fmtKm(km);
  const time = fmtDuration(minutes);
  if (display === "time") return time;
  if (display === "both") return `${distance}, ${time}`;
  return distance;
}

export function loadTravelDisplay(storage: Storage = localStorage): TravelDisplay {
  try {
    const value = (JSON.parse(storage.getItem(DISPLAY_SETTINGS_KEY) ?? "{}") as { travel?: unknown }).travel;
    return value === "distance" || value === "time" || value === "both" ? value : DEFAULT_TRAVEL_DISPLAY;
  } catch {
    return DEFAULT_TRAVEL_DISPLAY;
  }
}

export function saveTravelDisplay(display: TravelDisplay, storage: Storage = localStorage): void {
  try {
    storage.setItem(DISPLAY_SETTINGS_KEY, JSON.stringify({ travel: display }));
  } catch {
    // The selection still lasts for this page when storage is unavailable.
  }
}
