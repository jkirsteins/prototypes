import { WEAPONS } from "../combat/weapons";
import { activeLabels, noteKeyboardInput, onControlsChange, resolveLabels } from "../input/scheme";
import type { WeaponId } from "../combat/types";

const IDS: WeaponId[] = ["longsword", "rapier"];

interface SelectState {
  p: WeaponId;
  e: WeaponId;
  activeCol: "p" | "e";
  onStart: (p: WeaponId, e: WeaponId) => void;
  onBack: () => void;
}

let sel: SelectState | null = null;

/** main.ts's pad path needs to know who owns the input. */
export function isSelectOpen(): boolean {
  return sel !== null;
}

/** One body for both devices: the key handler and the pad path call this,
 *  so the two cannot drift (gamepad-support §6). */
export function handleSelectAction(
  a: "selLeft" | "selRight" | "selToggle" | "selConfirm" | "selPickFirst" | "selPickSecond" | "selBack",
): void {
  if (!sel) return;
  switch (a) {
    case "selLeft": sel.activeCol = "p"; break;
    case "selRight": sel.activeCol = "e"; break;
    case "selToggle": toggle(); break;
    case "selPickFirst": set(IDS[0]); break;
    case "selPickSecond": set(IDS[1]); break;
    case "selConfirm": {
      const { p, e: ew, onStart } = sel;
      hideSelect();
      onStart(p, ew);
      return;
    }
    case "selBack": {
      const cb = sel.onBack;
      hideSelect();
      cb();
      return;
    }
  }
  render();
}

// The hint follows the active scheme like every control reference.
onControlsChange(() => {
  if (sel !== null) render();
});

export function showSelect(
  current: { p: WeaponId; e: WeaponId },
  onStart: SelectState["onStart"],
  onBack: SelectState["onBack"],
): void {
  sel = { p: current.p, e: current.e, activeCol: "p", onStart, onBack };
  render();
  const el = document.getElementById("select");
  if (el) el.hidden = false;
  document.addEventListener("keydown", onKey);
}

export function hideSelect(): void {
  sel = null;
  const el = document.getElementById("select");
  if (el) el.hidden = true;
  document.removeEventListener("keydown", onKey);
}

function onKey(e: KeyboardEvent): void {
  if (!sel) return;
  if (!e.repeat) noteKeyboardInput();
  const k = e.key.toLowerCase();
  const action =
    k === "a" || k === "arrowleft" ? "selLeft"
    : k === "d" || k === "arrowright" ? "selRight"
    : k === "w" || k === "s" || k === "arrowup" || k === "arrowdown" ? "selToggle"
    : k === "1" ? "selPickFirst"
    : k === "2" ? "selPickSecond"
    : k === "enter" ? "selConfirm"
    : k === "escape" ? "selBack"
    : null;
  if (action === null) return;
  e.preventDefault();
  handleSelectAction(action);
}

function toggle(): void {
  if (!sel) return;
  const cur = sel[sel.activeCol];
  set(cur === "longsword" ? "rapier" : "longsword");
}

function set(id: WeaponId): void {
  if (sel) sel[sel.activeCol] = id;
}

function render(): void {
  if (!sel) return;
  const hint = document.querySelector("#select .hint");
  if (hint) {
    // The direct-pick clause stays under both schemes: the keyboard is
    // always live, so 1/2 keep working while the pad drives the labels.
    hint.textContent = resolveLabels(
      "{selLeft} or {selRight} switch column - {selToggle} switch sword - {selPickFirst}/{selPickSecond} direct pick - {selConfirm} to duel",
      activeLabels(),
    );
  }
  for (const colKey of ["p", "e"] as const) {
    const col = document.querySelector(`#select .col[data-col="${colKey}"]`);
    if (!col) continue;
    col.classList.toggle("active", sel.activeCol === colKey);
    for (const old of col.querySelectorAll(".option")) old.remove();
    for (const id of IDS) {
      const w = WEAPONS[id];
      const div = document.createElement("div");
      div.className = `option${sel[colKey] === id ? " picked" : ""}`;
      const cutLine = id === "longsword" ? "cut: 2 tempi, thrust: 1 tempo" : "thrust: 1 tempo, cut: poor";
      div.innerHTML = `<strong>${w.name}</strong><div class="bar" style="width:${w.reach * 0.4}px"></div>
        <small>effective reach ${w.reach} cm - ${cutLine}<br>${w.identity}</small>`;
      col.appendChild(div);
    }
  }
}
