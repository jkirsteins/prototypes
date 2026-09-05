import type { Beacon } from "../beacon/beacon";
import type { GameState } from "../sim/types";

/**
 * The beacon's switch and its note: the id a tester quotes in the survey,
 * the cohort when the device was marked by a tester link, and whether the
 * application ids are filled in. Static markup, mounted once.
 */
export function mountBeaconPanel(root: HTMLElement, beacon: Beacon, configured: boolean, getState: () => GameState, onToggle: (on: boolean) => void): void {
  const box = root.querySelector<HTMLInputElement>("[data-beacon=on]")!;
  const note = root.querySelector<HTMLElement>("[data-beacon=note]")!;
  const rec = beacon.record();
  box.checked = rec.on;
  note.textContent = `id ${rec.id}${rec.tester ? `, tester: ${rec.cohort}` : ""}${configured ? "" : " (not configured)"}`;
  box.addEventListener("change", () => {
    beacon.setOn(box.checked, getState());
    onToggle(box.checked);
  });
}
