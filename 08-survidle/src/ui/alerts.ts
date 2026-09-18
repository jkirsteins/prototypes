/**
 * The alert stack: what is wrong with the body and the camp right now,
 * worst on top, standing as long as it is true and gone the minute it is
 * not. RimWorld's right-edge alerts are the model: a condition you would
 * otherwise have to read off a bar, said in words where you cannot miss
 * it, before it costs you. Nothing here is stored; every alert is read off
 * the state's own lines - the collapse line, the thirsty line, the hunger
 * line, the low mark on the pit - so the stack and the bars never disagree.
 */
import { hungerLine } from "../sim/actions";
import { COLD_UNDER, SOAKED_WETNESS } from "../sim/body";
import type { Calendar } from "../sim/calendar";
import { FIRE_LOW_KG } from "../sim/items";
import { fuelTotal } from "../sim/fire";
import { FAT_RIBS, starvation } from "../sim/player";
import { regionState } from "../sim/regionstate";
import { RESTED_AT, SLEEP_AT, SLEEPY_AT, sleepiness, SPENT_AT } from "../sim/sleep";
import type { GameState } from "../sim/types";
import { THIRSTY_L } from "../sim/water";
import { stormComing } from "../sim/weather";
import type { World } from "../world/gen";
import { esc } from "./render";

export interface Alert {
  /** "bad" is happening now and costs the body; "warn" is next if nothing changes. */
  level: "bad" | "warn";
  title: string;
  detail: string;
}

export function alerts(state: GameState, world: World, cal: Calendar): Alert[] {
  const p = state.player;
  const out: Alert[] = [];
  const st = regionState(state, world, p.region);
  if (p.collapsed) out.push({ level: "bad", title: "Collapsed", detail: `resting to ${RESTED_AT} Stamina; work waits` });
  else if (p.energy < SPENT_AT) out.push({ level: "warn", title: "Tired", detail: `collapses at ${SLEEP_AT} Stamina, ${Math.round(p.energy)} now; a rest is due` });
  if (starvation(state) >= FAT_RIBS) out.push({ level: "bad", title: "Starving", detail: "the fat is gone; the body eats itself" });
  if (p.water < THIRSTY_L) out.push({ level: "bad", title: "Thirsty", detail: `${p.water.toFixed(1)} l in the body; drinks when water is in reach` });
  if (p.kcal < hungerLine(state)) out.push({ level: "bad", title: "Hungry", detail: "eats when food is in reach" });
  if (p.warmth < COLD_UNDER) out.push({ level: "bad", title: "Cold", detail: `warmth ${Math.round(p.warmth)}; a fire or shelter, now` });
  if (p.wetness > SOAKED_WETNESS) out.push({ level: "warn", title: "Soaked", detail: "wet clothing takes the warmth; dry by a fire" });
  if (sleepiness(p.sleepDebt, cal.hour) >= SLEEPY_AT) out.push({ level: "warn", title: "Sleepy", detail: "the body lies down at the onset line" });
  if (st.fire.lit && fuelTotal(st.fire) <= FIRE_LOW_KG) out.push({ level: "warn", title: "Fire burning low", detail: `${fuelTotal(st.fire).toFixed(1)} kg in the pit` });
  if (stormComing(state)) out.push({ level: "warn", title: "Storm coming", detail: "shelter and the fire before it lands" });
  return out.sort((a, b) => Number(b.level === "bad") - Number(a.level === "bad"));
}

export function alertsHtml(state: GameState, world: World, cal: Calendar): string {
  if (state.dead) return "";
  const rows = alerts(state, world, cal);
  if (!rows.length) return "";
  return `<div class="alerts" role="status" aria-live="polite">${rows.map((a) => `<div class="alert ${a.level}"><b>${esc(a.title)}</b><small>${esc(a.detail)}</small></div>`).join("")}</div>`;
}
