/**
 * A seep: a knee-deep hole dug to groundwater on wet ground. It holds a pool
 * and refills at the ground's own rate; drinking and filling draw only what
 * is in it (water.ts). It freezes in place in frost unless a fed fire burns
 * on its own cell, stops in a long dry spell, and silts up after a year
 * unless re-dug. One per cell, kept in state.seeps by cell like the piles.
 */
import { cellAt, neighbours, type World } from "../world/gen";
import { straightKm } from "./position";
import type { GameState, Seep, SeepClass } from "./types";
import { FREEZE_C, THAW_L_PER_HOUR } from "./water";

/** Pool and sustained yield of a hole half a metre across, knee deep: saturated peat, and damp forest soil. */
export const SEEP: Record<SeepClass, { poolL: number; refillLPerHour: number }> = {
  bog: { poolL: 10, refillLPerHour: 3 },
  damp: { poolL: 10, refillLPerHour: 1 },
};
/** Days without rain before the water table drops under a hand-dug hole; the fire's tinder count is too short for a water table. */
export const SEEP_DRY_DAYS = 14;
/** The walls slump in the thaw and the hole silts up: a year, then a re-dig. */
export const SEEP_LIFE_DAYS = 365;

/** The ground class a seep would have here, or null where none can be dug: dry ground, rock, fell, water, or a shore cell where the shore is the water. */
export function seepGround(world: World, cell: number): SeepClass | null {
  const c = cellAt(world, cell);
  if (c.terrain === "water" || c.terrain === "rock" || c.terrain === "fell" || c.terrain === "pine") return null;
  const nb = neighbours(world, cell).map((n) => cellAt(world, n).terrain);
  if (nb.includes("water")) return null;
  if (c.terrain === "bog") return "bog";
  if (c.terrain === "spruce") return "damp";
  if ((c.terrain === "meadow" || c.terrain === "birch") && nb.includes("bog")) return "damp";
  return null;
}

/** A fed fire burning on this very cell: the one thing that keeps a seep open in frost. */
function fireOnCell(state: GameState, world: World, cell: number): boolean {
  const st = state.regions[cellAt(world, cell).region];
  return !!st && st.campCell === cell && st.fire.lit && st.fire.fuelKg > 0;
}

/** Why a seep is not refilling right now, or null when it is. */
export function seepStopped(state: GameState, world: World, cell: number, ambient: number): "frozen" | "drought" | "silted" | null {
  const s = state.seeps[cell];
  if (!s) return null;
  if (state.minute - s.dug >= SEEP_LIFE_DAYS * 1440) return "silted";
  if (ambient < FREEZE_C && !fireOnCell(state, world, cell)) return "frozen";
  if (state.weather.dryDays >= SEEP_DRY_DAYS) return "drought";
  return null;
}

/** Past two thirds of its life the re-dig row shows, as a lean-to's re-roofing does. */
export function seepNeedsRedig(state: GameState, s: Seep): boolean {
  return state.minute - s.dug >= (SEEP_LIFE_DAYS * 1440 * 2) / 3;
}

/** Every seep's minute: refill, or freeze in place, or thaw by the fire or the spring air. */
export function stepSeeps(state: GameState, world: World, ambient: number, dt: number): void {
  for (const k of Object.keys(state.seeps)) {
    const cell = Number(k);
    const s = state.seeps[cell];
    const why = seepStopped(state, world, cell, ambient);
    if (why === "frozen") {
      s.ice += s.litres;
      s.litres = 0;
      continue;
    }
    if (s.ice > 1e-9 && (ambient > 0 || fireOnCell(state, world, cell))) {
      const melt = Math.min(s.ice, (THAW_L_PER_HOUR / 60) * dt);
      s.ice -= melt;
      s.litres += melt;
    }
    if (why !== null) continue;
    const pool = SEEP[s.class].poolL;
    s.litres = Math.min(pool - s.ice, s.litres + (SEEP[s.class].refillLPerHour / 60) * dt);
  }
}

/** The nearest seep in the survivor's region passing pred, by straight line; null when none does. */
export function nearestSeep(state: GameState, world: World, from: number, pred: (s: Seep, cell: number) => boolean): number | null {
  const region = state.player.region;
  let best: number | null = null;
  let bestKm = Number.POSITIVE_INFINITY;
  for (const k of Object.keys(state.seeps)) {
    const cell = Number(k);
    if (cellAt(world, cell).region !== region || !pred(state.seeps[cell], cell)) continue;
    const km = straightKm(world, from, cell);
    if (km < bestKm) {
      bestKm = km;
      best = cell;
    }
  }
  return best;
}
