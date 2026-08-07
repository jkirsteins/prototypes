import { activeLabels, noteKeyboardInput, onControlsChange, resolveLabels } from "../input/scheme";
import type { SceneId } from "../scenes/scene";

interface ScenesState {
  active: SceneId;
  onPick: (s: SceneId) => void;
}

let st: ScenesState | null = null;

/** main.ts's pad path needs to know who owns the input. */
export function isScenesOpen(): boolean {
  return st !== null;
}

/** One body for both devices: the key handler and the pad path call this,
 *  so the two cannot drift (gamepad-support §6). */
export function handleScenesAction(
  a: "selLeft" | "selRight" | "selToggle" | "selConfirm" | "selPickFirst" | "selPickSecond",
): void {
  if (!st) return;
  switch (a) {
    case "selLeft": st.active = "duel"; break;
    case "selRight": st.active = "move"; break;
    case "selToggle": st.active = st.active === "duel" ? "move" : "duel"; break;
    case "selPickFirst": st.active = "duel"; break;
    case "selPickSecond": st.active = "move"; break;
    case "selConfirm": {
      const { active, onPick } = st;
      hideScenes();
      onPick(active);
      return;
    }
  }
  render();
}

// The hint follows the active scheme like every control reference.
onControlsChange(() => {
  if (st !== null) render();
});

export function showScenes(onPick: (s: SceneId) => void): void {
  st = { active: "duel", onPick };
  render();
  const el = document.getElementById("scenes");
  if (el) el.hidden = false;
  document.addEventListener("keydown", onKey);
}

export function hideScenes(): void {
  st = null;
  const el = document.getElementById("scenes");
  if (el) el.hidden = true;
  document.removeEventListener("keydown", onKey);
}

function onKey(e: KeyboardEvent): void {
  if (!st) return;
  if (!e.repeat) noteKeyboardInput();
  const k = e.key.toLowerCase();
  const action =
    k === "a" || k === "arrowleft" ? "selLeft"
    : k === "d" || k === "arrowright" ? "selRight"
    : k === "w" || k === "s" || k === "arrowup" || k === "arrowdown" ? "selToggle"
    : k === "1" ? "selPickFirst"
    : k === "2" ? "selPickSecond"
    : k === "enter" ? "selConfirm"
    : null;
  if (action === null) return;
  e.preventDefault();
  handleScenesAction(action);
}

function render(): void {
  if (!st) return;
  const hint = document.querySelector("#scenes .hint");
  if (hint) {
    hint.textContent = resolveLabels(
      "{selLeft} or {selRight} switch - {selPickFirst}/{selPickSecond} direct pick - {selConfirm} to start",
      activeLabels(),
    );
  }
  for (const id of ["duel", "move"] as const) {
    const col = document.querySelector(`#scenes .col[data-scene="${id}"]`);
    if (col) col.classList.toggle("active", st.active === id);
  }
}
