import { WEAPONS } from "../combat/weapons";
import type { WeaponId } from "../combat/types";

const IDS: WeaponId[] = ["longsword", "rapier"];

interface SelectState {
  p: WeaponId;
  e: WeaponId;
  activeCol: "p" | "e";
  onStart: (p: WeaponId, e: WeaponId) => void;
}

let sel: SelectState | null = null;

export function showSelect(current: { p: WeaponId; e: WeaponId }, onStart: SelectState["onStart"]): void {
  sel = { p: current.p, e: current.e, activeCol: "p", onStart };
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
  const k = e.key.toLowerCase();
  if (k === "a" || k === "arrowleft") sel.activeCol = "p";
  else if (k === "d" || k === "arrowright") sel.activeCol = "e";
  else if (k === "w" || k === "s" || k === "arrowup" || k === "arrowdown") toggle();
  else if (k === "1") set(IDS[0]);
  else if (k === "2") set(IDS[1]);
  else if (k === "enter") { const { p, e: ew, onStart } = sel; hideSelect(); onStart(p, ew); return; }
  else return;
  e.preventDefault();
  render();
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
      div.innerHTML = `<strong>${w.name}</strong><div class="bar" style="width:${w.reach * 0.8}px"></div>
        <small>reach ${w.reach} - ${cutLine}<br>${w.identity}</small>`;
      col.appendChild(div);
    }
  }
}
