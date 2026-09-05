import { calendar } from "../sim/calendar";
import { burnPerHour, fuelTotal } from "../sim/fire";
import { FIRE_MAX_KG, KCAL_FULL } from "../sim/items";
import { regionState } from "../sim/regionstate";
import type { GameState } from "../sim/types";
import { WATER_FULL } from "../sim/water";
import { ambientTemperature } from "../sim/weather";
import { fmtDuration, fmtReal } from "../units";
import type { World } from "../world/gen";

function setBar(id: string, frac: number, text?: string, root: ParentNode = document): void {
  const fill = root.querySelector<HTMLElement>(`#bar-${id}`);
  if (fill) fill.style.width = `${Math.max(0, Math.min(100, frac * 100)).toFixed(1)}%`;
  if (text !== undefined) {
    const val = root.querySelector<HTMLElement>(`#val-${id}`);
    if (val && val.textContent !== text) val.textContent = text;
  }
}

/** Every frame: the moving parts that the keyed panels leave alone. */
export function updateBars(state: GameState, world: World, root: ParentNode = document): void {
  const p = state.player;
  setBar("health", p.health / 100, `${Math.round(p.health)}`, root);
  setBar("kcal", p.kcal / KCAL_FULL, `${Math.round(p.kcal)} kcal`, root);
  setBar("warmth", p.warmth / 100, `${Math.round(p.warmth)}`, root);
  setBar("energy", p.energy / 100, `${Math.round(p.energy)}`, root);
  setBar("wet", p.wetness / 100, `${Math.round(p.wetness)}`, root);
  setBar("water", p.water / WATER_FULL, `${p.water.toFixed(1)} l`, root);

  const st = regionState(state, world, p.region);
  const total = fuelTotal(st.fire);
  const ambient = ambientTemperature(calendar(state.minute, state.startDoy), state.weather);
  const burnsFor = fmtDuration((total / burnPerHour(state.weather, ambient, st)) * 60);
  const fireText = st.fire.wetKg > 0
    ? `${st.fire.fuelKg.toFixed(1)} kg dry, ${st.fire.wetKg.toFixed(1)} kg wet, ${burnsFor}`
    : `${st.fire.fuelKg.toFixed(1)} kg, ${burnsFor}`;
  setBar("fire", total / FIRE_MAX_KG, fireText, root);

  const t = state.task;
  if (t) {
    const frac = Math.min(1, t.progress / t.duration);
    const left = Math.max(0, t.duration - t.progress);
    setBar("task", frac, `${fmtDuration(left)} left (${fmtReal(left)})`, root);
    const pct = root.querySelector<HTMLElement>("#task-pct");
    if (pct) pct.textContent = `${Math.floor(frac * 100)}%`;
  }
}
