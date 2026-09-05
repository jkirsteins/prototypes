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
  // The id sits in its own element so a double-click selects just the id, not the whole note.
  note.innerHTML = `id <code data-beacon="id">${rec.id}</code>${rec.tester ? `, tester: ${rec.cohort}` : ""}${configured ? "" : " (not configured)"}`;
  box.addEventListener("change", () => {
    // Before setOn: turning on must let the caller create the sink first, or
    // setOn's own settings action has nothing to send through.
    onToggle(box.checked);
    beacon.setOn(box.checked, getState());
  });
}
