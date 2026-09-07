import { calendar } from "../sim/calendar";
import { burnPerHour, fuelTotal } from "../sim/fire";
import { FIRE_MAX_KG, KCAL_FULL } from "../sim/items";
import { regionState } from "../sim/regionstate";
import { levelShare, masteryProgress, poolShare } from "../sim/skills";
import { garmentWet } from "../sim/clothing";
import type { GameState, SkillId } from "../sim/types";
import { WATER_FULL } from "../sim/water";
import { ambientTemperature } from "../sim/weather";
import { fmtDuration, fmtReal } from "../units";
import type { World } from "../world/gen";
import { type HurryState, pulseLeft } from "./hurry";

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

/** Every frame: the pulse's bar on the live row, so the list's markup does not churn while it drains. */
export function updateHurryBar(h: HurryState, root: ParentNode = document): void {
  setBar("hurry", pulseLeft(h), undefined, root);
}

/**
 * The share a named fill draws, 0 to 1, or null when nothing in the state
 * answers to the name. Every name is a lookup, so a fill can be written from
 * the state alone without the panel that drew it being rebuilt.
 */
export function fillShare(state: GameState, spec: string): number | null {
  const at = spec.indexOf(":");
  if (at < 0) return null;
  const arg = spec.slice(at + 1);
  switch (spec.slice(0, at)) {
    case "garment": {
      const g = state.player.clothing.find((c) => c.id === arg);
      return g ? g.durability / 100 : null;
    }
    case "garmentWet": {
      const g = state.player.clothing.find((c) => c.id === arg);
      return g ? garmentWet(g) / 100 : null;
    }
    case "tool": {
      const t = state.player.tools.find((x) => x.id === arg);
      return t ? t.durability / 100 : null;
    }
    case "skill":
      return levelShare(state, arg as SkillId);
    case "pool":
      return poolShare(state, arg as SkillId);
    case "mastery": {
      const [skill, key] = arg.split("|");
      return skill && key ? masteryProgress(state, skill as SkillId, key).share : null;
    }
    default:
      return null;
  }
}

/**
 * Every frame: every bar whose fill names where its value comes from.
 *
 * A width that moves every frame would make its panel's markup differ every
 * frame, and the panel would be reparsed and rediffed at that rate to shift
 * one bar. So no fill carries a width. It carries the name of what it draws
 * and is written here, one property on one element, while the markup around
 * it holds still. tests/churn.test.ts holds the line.
 */
export function updateFills(state: GameState, root: ParentNode = document): void {
  for (const fill of root.querySelectorAll<HTMLElement>("[data-fill]")) {
    const share = fillShare(state, fill.dataset.fill ?? "");
    if (share === null) continue;
    fill.style.width = `${Math.max(0, Math.min(100, share * 100)).toFixed(1)}%`;
  }
}
