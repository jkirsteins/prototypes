/**
 * The Sound control: a static element outside the panels, so a redraw of
 * the clock never drops the slider mid-drag. Reads and writes the engine's
 * settings and nothing else.
 */
import type { AudioEngine } from "./engine";

export function mountControl(root: HTMLElement, engine: AudioEngine): void {
  const mute = root.querySelector<HTMLButtonElement>("[data-sound=mute]")!;
  const volume = root.querySelector<HTMLInputElement>("[data-sound=volume]")!;
  const ambience = root.querySelector<HTMLInputElement>("[data-sound=ambience]")!;
  const note = root.querySelector<HTMLElement>("[data-sound=note]")!;

  const show = (): void => {
    const s = engine.settings();
    mute.classList.toggle("off", s.muted);
    mute.textContent = s.muted ? "Sound off" : "Sound";
    if (document.activeElement !== volume) volume.value = String(Math.round(s.volume * 100));
    ambience.checked = s.ambience;
    note.textContent = engine.ready() ? "" : "click anywhere to start";
  };

  mute.addEventListener("click", () => {
    engine.update({ muted: !engine.settings().muted });
    show();
  });
  volume.addEventListener("input", () => {
    engine.update({ volume: Number(volume.value) / 100 });
    show();
  });
  ambience.addEventListener("change", () => {
    engine.update({ ambience: ambience.checked });
    show();
  });
  document.addEventListener("click", show, { capture: true });
  document.addEventListener("keydown", show, { capture: true });
  show();
}
