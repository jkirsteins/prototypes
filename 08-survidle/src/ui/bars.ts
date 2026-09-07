import { calendar } from "../sim/calendar";
import { burnPerHour, fuelTotal } from "../sim/fire";
import { FIRE_MAX_KG, KCAL_FULL } from "../sim/items";
import { regionState } from "../sim/regionstate";
import { levelShare, masteryMilestone, poolShare } from "../sim/skills";
import { garmentWet } from "../sim/clothing";
import type { GameState, SkillId } from "../sim/types";
import { plain } from "../sim/voice";
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
    // The bar names the step it is filling, not just the time left in it.
    // One order runs several steps - walk there, work, walk back - and a
    // bar that said only "12 min left" was read as the order's own, so
    // reaching the end of it looked like the order was done.
    const step = state.intent ? plain(state.intent.step) : "";
    setBar("task", frac, `${step ? `${step}, ` : ""}${fmtDuration(left)} left (${fmtReal(left)})`, root);
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
    case "masteryTo": {
      const [skill, key] = arg.split("|");
      return skill && key ? (masteryMilestone(state, skill as SkillId, key)?.share ?? null) : null;
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

/**
 * Puts the tooltip beside the pointer, clamped inside the board.
 *
 * Written straight onto the element for the same reason a bar's width is:
 * a pointer moves many times a second, and a coordinate in the panel's
 * markup would make that markup differ on every move, sending the whole
 * map through a parse and a diff to shift a box a few pixels. morphAttrs
 * leaves `style` alone precisely so this survives a redraw.
 */
export function placeTip(tip: HTMLElement, board: HTMLElement, x: number, y: number): void {
  const pad = 14;
  const w = tip.offsetWidth || 260;
  const h = tip.offsetHeight || 100;
  // Flip to the other side of the pointer rather than hanging off the edge.
  const left = x + pad + w > board.clientWidth ? Math.max(0, x - pad - w) : x + pad;
  const top = y + pad + h > board.clientHeight ? Math.max(0, y - pad - h) : y + pad;
  tip.style.left = `${Math.round(left)}px`;
  tip.style.top = `${Math.round(top)}px`;
}
