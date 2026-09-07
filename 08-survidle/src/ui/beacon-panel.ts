import type { Beacon } from "../beacon/beacon";
import type { GameState } from "../sim/types";

/**
 * The beacon's switch and its note: the id a tester quotes in the survey,
 * shown in a field the person may type a handle over (cleared, it shows
 * the id again), the cohort when the device was marked by a tester link,
 * and whether the application ids are filled in. Static markup, mounted
 * once.
 */
export function mountBeaconPanel(root: HTMLElement, beacon: Beacon, configured: boolean, getState: () => GameState, onToggle: (on: boolean) => void): void {
  const box = root.querySelector<HTMLInputElement>("[data-beacon=on]")!;
  const note = root.querySelector<HTMLElement>("[data-beacon=note]")!;
  const rec = beacon.record();
  box.checked = rec.on;
  note.innerHTML = `id <input data-beacon="name" maxlength="32" size="18" spellcheck="false" />${rec.tester ? `, tester: ${rec.cohort}` : ""}${configured ? "" : " (not configured)"}`;
  const name = note.querySelector<HTMLInputElement>("[data-beacon=name]")!;
  const showName = () => { name.value = beacon.record().name ?? rec.id; };
  showName();
  name.addEventListener("change", () => {
    beacon.setName(name.value, getState());
    showName();
  });
  name.addEventListener("keydown", (ev) => { if (ev.key === "Enter") name.blur(); });
  box.addEventListener("change", () => {
    // Turning on: the caller creates the sink first, or setOn's own settings
    // action has nothing to send through. Turning off: setOn first, so that
    // action leaves before the caller ends the vendor session under it.
    if (box.checked) {
      onToggle(true);
      beacon.setOn(true, getState());
    } else {
      beacon.setOn(false, getState());
      onToggle(false);
    }
  });
}
