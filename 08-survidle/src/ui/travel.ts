import { fmtDuration, fmtKm } from "../units";
import { readDisplay, writeDisplay } from "./display-settings";

export type TravelDisplay = "distance" | "time" | "both";
export const DEFAULT_TRAVEL_DISPLAY: TravelDisplay = "distance";

export { DISPLAY_SETTINGS_KEY } from "./display-settings";

export function formatTravel(km: number, minutes: number, display: TravelDisplay): string {
  const distance = fmtKm(km);
  const time = fmtDuration(minutes);
  if (display === "time") return time;
  if (display === "both") return `${distance}, ${time}`;
  return distance;
}

export function loadTravelDisplay(storage: Storage = localStorage): TravelDisplay {
  const value = readDisplay(storage).travel;
  return value === "distance" || value === "time" || value === "both" ? value : DEFAULT_TRAVEL_DISPLAY;
}

export function saveTravelDisplay(display: TravelDisplay, storage: Storage = localStorage): void {
  writeDisplay({ travel: display }, storage);
}
