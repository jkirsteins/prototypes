/**
 * What the cell under foot offers to drink, and the region's water by kind:
 * the two readings that let a player weigh a shore against a seep against
 * a kilo of wood a litre. Plain text; panels.ts wraps it.
 */
import { regionAt, type World } from "../world/gen";
import { findRoute, routeMinutes } from "../world/route";
import type { Calendar } from "../sim/calendar";
import { pile, qty } from "../sim/inventory";
import { baseWalkSpeed } from "../sim/player";
import { cellOf, watersideCell } from "../sim/position";
import { regionState } from "../sim/regionstate";
import { SEEP, seepGround, seepStopped } from "../sim/seep";
import type { GameState } from "../sim/types";
import { campWaterCapacity, ICE_SHORE_CM, iceHoleOpen } from "../sim/water";
import { ambientTemperature, walkableIce } from "../sim/weather";

/** "+3 l/h", or "+0 l/h, frozen" and the like when the seep is stopped. */
function rateText(state: GameState, world: World, cell: number, cal: Calendar): string {
  const s = state.seeps[cell];
  const why = seepStopped(state, world, cell, ambientTemperature(cal, state.weather));
  return why ? `+0 l/h, ${why}` : `+${SEEP[s.class].refillLPerHour} l/h`;
}

function seepText(state: GameState, world: World, cell: number, cal: Calendar): string {
  const s = state.seeps[cell];
  const frozen = s.ice > 1e-9 ? `, ${s.ice.toFixed(1)} l frozen` : "";
  return `seep, ${s.litres.toFixed(1)} of ${SEEP[s.class].poolL} l, ${rateText(state, world, cell, cal)}${frozen}`;
}

/** The water line for the cell under foot: what is here, or "none" and whether a seep could be dug. */
export function waterLine(state: GameState, world: World, cal: Calendar): string {
  const cell = cellOf(state, world);
  const st = regionState(state, world, state.player.region);
  const parts: string[] = [];
  if (cell === st.campCell) {
    const camp = pile(state, st.campCell);
    const cap = campWaterCapacity(camp, st);
    if (cap > 0 || qty(camp, "water") > 1e-9) parts.push(`${qty(camp, "water").toFixed(1)} of ${cap.toFixed(1)} l at camp`);
  }
  if (watersideCell(world, cell)) {
    if (state.weather.iceCm < ICE_SHORE_CM) parts.push("shore, endless");
    else if (iceHoleOpen(state, cell)) parts.push("ice hole, open until morning");
    else parts.push("iced over; an axe opens an ice hole");
  } else if (state.seeps[cell]) {
    parts.push(seepText(state, world, cell, cal));
  } else {
    const cls = seepGround(world, cell);
    if (cls) parts.push(`${parts.length ? "" : "none; "}a seep is possible here, ${SEEP[cls].poolL} l, +${SEEP[cls].refillLPerHour} l/h`);
  }
  return parts.length ? parts.join("; ") : "none";
}

/** Minutes to walk from here to a cell over the ice a walk button would cross, or null with no way. */
function walkMinutes(state: GameState, world: World, cal: Calendar, to: number): number | null {
  const ice = walkableIce(state.weather);
  const route = findRoute(world, cellOf(state, world), to, ice);
  if (!route) return null;
  return Math.round(routeMinutes(world, route, baseWalkSpeed(state, cal, state.weather), ice));
}

/** The nearest cell of a set by walk, with its minutes; null when none can be walked to. */
function nearestByWalk(state: GameState, world: World, cal: Calendar, cells: number[]): { cell: number; minutes: number } | null {
  let best: { cell: number; minutes: number } | null = null;
  for (const cell of cells) {
    const minutes = walkMinutes(state, world, cal, cell);
    if (minutes !== null && (!best || minutes < best.minutes)) best = { cell, minutes };
  }
  return best;
}

/** The nearest of each kind of water in the region from where the survivor stands, with its walk; "no water in this region" when there is none. */
export function waterList(state: GameState, world: World, cal: Calendar): string {
  const here = cellOf(state, world);
  const r = regionAt(world, state.player.region);
  const st = regionState(state, world, state.player.region);
  const parts: string[] = [];
  const shore = nearestByWalk(state, world, cal, r.cells.filter((c) => watersideCell(world, c)));
  if (shore) {
    if (state.weather.iceCm < ICE_SHORE_CM) parts.push(`shore ${shore.minutes} min, endless`);
    else if (st.iceHole) parts.push(`ice hole ${walkMinutes(state, world, cal, st.iceHole.cell) ?? "?"} min, open until morning`);
    else parts.push(`shore ${shore.minutes} min, iced over`);
  }
  const seep = nearestByWalk(state, world, cal, Object.keys(state.seeps).map(Number).filter((c) => r.cells.includes(c)));
  if (seep) {
    const s = state.seeps[seep.cell];
    parts.push(`seep ${seep.minutes} min, ${s.litres.toFixed(1)} of ${SEEP[s.class].poolL} l`);
  }
  const campL = qty(pile(state, st.campCell), "water");
  if (campL > 1e-9) parts.push(`camp water ${campL.toFixed(1)} l, ${here === st.campCell ? 0 : (walkMinutes(state, world, cal, st.campCell) ?? "?")} min`);
  if (st.fire.lit && st.fire.fuelKg >= 1 && state.weather.snowCm >= 1) parts.push("snow at the fire, 1 l per 15 min and 1 kg wood");
  return parts.length ? parts.join("; ") : "no water in this region";
}
