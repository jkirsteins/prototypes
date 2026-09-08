import type { Calendar } from "../sim/calendar";
import { check } from "../sim/tasks";
import type { GameState } from "../sim/types";
import type { World } from "../world/gen";
import { fmtDuration } from "../units";
import { esc } from "./render";

export interface ActiveEquipmentRow {
  id: string;
  label: string;
  state: string;
  remaining: number;
  maximum: number;
  action: "torch-out" | "task";
  actionLabel: string;
  disabled: boolean;
  reason: string;
}

/** Active equipment with a changing capacity. Empty equipment has no row. */
export function activeEquipment(state: GameState, world: World, cal: Calendar): ActiveEquipmentRow[] {
  const torch = state.player.torch;
  if (torch.minutes <= 0) return [];
  const relight = check(state, world, cal, "lightTorch");
  return [{
    id: "torch",
    label: "Torch",
    state: torch.lit ? "lit" : "out",
    remaining: torch.minutes,
    maximum: 60,
    action: torch.lit ? "torch-out" : "task",
    actionLabel: torch.lit ? "put out" : "relight",
    disabled: !torch.lit && !relight.ok,
    reason: !torch.lit && !relight.ok ? relight.why : "",
  }];
}

export function activeEquipmentHtml(state: GameState, world: World, cal: Calendar): string {
  return activeEquipment(state, world, cal).map((row) => {
    const pct = Math.max(0, Math.min(100, (row.remaining / row.maximum) * 100));
    const attrs = row.action === "task" ? 'data-act="task" data-id="lightTorch"' : 'data-act="torch-out"';
    const control = `<button class="mini" ${attrs}${row.disabled ? " disabled" : ""}>${row.actionLabel}</button>`;
    const why = row.reason ? `<small class="bad">${esc(row.reason)}</small>` : "";
    return `<div class="active-equipment" data-equipment="${row.id}"><div><b>${row.label}</b> <span class="dim">${row.state}, ${fmtDuration(row.remaining)}</span><span class="r">${control}</span></div><div class="bar compact fuel"><div class="fill" style="width:${pct.toFixed(1)}%"></div></div>${why}</div>`;
  }).join("");
}

export function compactEquipmentHtml(state: GameState, world: World, cal: Calendar): string {
  return activeEquipment(state, world, cal).map((row) => {
    const pct = Math.max(0, Math.min(100, (row.remaining / row.maximum) * 100));
    return `<div class="map-equipment"><b>${row.label}:</b> ${row.state}, ${fmtDuration(row.remaining)}<span class="microbar"><i style="width:${pct.toFixed(1)}%"></i></span></div>`;
  }).join("");
}
