import { calendar } from "../sim/calendar";
import { burnPerHour, fuelTotal, hasEmbers } from "../sim/fire";
import { hungerLine } from "../sim/actions";
import { FIRE_MAX_KG, KCAL_FULL } from "../sim/items";
import { fatLandmarks, personOf } from "../sim/person";
import { FAT_KCAL_PER_KG } from "../sim/player";
import { regionState } from "../sim/regionstate";
import { levelShare, masteryMilestone, poolShare } from "../sim/skills";
import { garmentWet } from "../sim/clothing";
import type { GameState, SkillId } from "../sim/types";
import { WATER_FULL } from "../sim/water";
import { ambientTemperature } from "../sim/weather";
import { fmtDuration, fmtReal } from "../units";
import type { World } from "../world/gen";

/**
 * The named bar, wherever it is drawn.
 *
 * By name and not by id: the same reading can stand on two surfaces at once
 * - the work's own bar sits in the strip under the map and on its row in the
 * queue - and two elements sharing one id left this writing to whichever it
 * happened to find first.
 */
function setBar(id: string, frac: number, text?: string, root: ParentNode = document): void {
  const width = `${Math.max(0, Math.min(100, frac * 100)).toFixed(1)}%`;
  for (const fill of root.querySelectorAll<HTMLElement>(`[data-bar="${id}"]`)) fill.style.width = width;
  if (text === undefined) return;
  for (const val of root.querySelectorAll<HTMLElement>(`[data-val="${id}"]`)) {
    if (val.textContent !== text) val.textContent = text;
  }
}

/**
 * Last frame's reserve, for spotting a meal. The sim does not announce one
 * to the frame loop and does not need to: a reserve that rose since the last
 * frame is a meal, whoever ordered it.
 */
let lastKcal = Number.NaN;

/** Restarts the flash on a bar, even if one is already running on it. */
function flash(el: HTMLElement | null | undefined): void {
  if (!el) return;
  el.classList.remove("fed");
  void el.offsetWidth;
  el.classList.add("fed");
}

/** Every frame: the moving parts that the keyed panels leave alone. */
export function updateBars(state: GameState, world: World, root: ParentNode = document): void {
  const p = state.player;
  setBar("health", p.health / 100, `${Math.round(p.health)}`, root);
  setBar("kcal", p.kcal / KCAL_FULL, `${Math.round(p.kcal)} kcal`, root);
  // Under the meal line the bar reads as harm: the meal was due and did not
  // happen, and the fat bar under it is what is paying for the difference.
  const kcalBar = root.querySelector<HTMLElement>('[data-bar="kcal"]')?.parentElement;
  const line = hungerLine(state);
  kcalBar?.classList.toggle("low", p.kcal < line);
  // The mark itself moves with the same line - a lean reserve eats sooner,
  // a well-provisioned one later - so it is written here every frame rather
  // than baked into the markup (tests/churn.test.ts).
  const hungerMark = kcalBar?.querySelector<HTMLElement>('[data-mark="hunger"]');
  if (hungerMark) hungerMark.style.left = `${((line / KCAL_FULL) * 100).toFixed(1)}%`;
  // A meal is over in one simulated minute, and a bar that refills silently
  // is the whole of what the player could not see. The fill is left to flash
  // for a moment wherever the reserve rose.
  if (p.kcal > lastKcal + 1) flash(kcalBar);
  lastKcal = p.kcal;
  // No ceiling on the reserve itself, so the bar's full mark is the upper
  // landmark - the top of the well-provisioned zone - and a body past it
  // simply shows a full bar rather than an overflowing one.
  const fatUpper = fatLandmarks(personOf(state)).upper;
  setBar("fat", p.fat / fatUpper, `${(p.fat / FAT_KCAL_PER_KG).toFixed(1)} kg`, root);
  setBar("warmth", p.warmth / 100, `${Math.round(p.warmth)}`, root);
  // Never round upward across a decision line. In particular, a collapsed
  // body at 99.9 is still recovering, so the bar must not claim 100 while
  // the queue truthfully refuses work.
  setBar("energy", p.energy / 100, `${Math.floor(p.energy + 1e-9)}`, root);
  setBar("wet", p.wetness / 100, `${Math.round(p.wetness)}`, root);
  setBar("water", p.water / WATER_FULL, `${p.water.toFixed(1)} l`, root);

  const st = regionState(state, world, p.region);
  const total = fuelTotal(st.fire);
  const ambient = ambientTemperature(calendar(state.minute, state.startDoy), state.weather);
  const burnsFor = fmtDuration((total / burnPerHour(state.weather, ambient, st)) * 60);
  // Fuel is spent to zero the moment a fire falls to coals, so the plain
  // "0.0 kg" text below would read exactly like a dead fire. This is the one
  // place a per-minute count is safe to write: it lands on a named element
  // every frame rather than into a panel's diffed markup (tests/churn.test.ts).
  const fireText = hasEmbers(st.fire)
    ? `coals, ${fmtDuration(st.fire.embers)} left`
    : st.fire.wetKg > 0
      ? `${st.fire.fuelKg.toFixed(1)} kg dry, ${st.fire.wetKg.toFixed(1)} kg wet, ${burnsFor}`
      : `${st.fire.fuelKg.toFixed(1)} kg, ${burnsFor}`;
  setBar("fire", total / FIRE_MAX_KG, fireText, root);

  const t = state.task;
  if (t) {
    const frac = Math.min(1, t.progress / t.duration);
    const left = Math.max(0, t.duration - t.progress);
    // The time in the step, and nothing else. The bar used to name the step
    // as well, because "12 min left" beside nothing was read as the whole
    // order's - but the row it sits in names the step now, an inch to its
    // left, so saying it twice only made the row too long to read.
    setBar("task", frac, `${fmtDuration(left)} left (${fmtReal(left)})`, root);
    const share = `${Math.floor(frac * 100)}%`;
    for (const pct of root.querySelectorAll<HTMLElement>('[data-pct="task"]')) {
      if (pct.textContent !== share) pct.textContent = share;
    }
  }
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
