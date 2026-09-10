import { regionAt, type World } from "../world/gen";
import { straightKm } from "./position";
import type { GameState } from "./types";

const PRESSURE_DAYS = 7;
const PRESSURE_RADIUS_KM = 2;

export function huntPressureFactor(state: GameState, world: World, cell: number): number {
  let local = 0;
  for (const [key, pressure] of Object.entries(state.huntPressure)) {
    const km = straightKm(world, Number(key), cell);
    if (km >= PRESSURE_RADIUS_KM) continue;
    local += pressure * (1 - km / PRESSURE_RADIUS_KM);
  }
  return 1 - 0.75 * Math.min(1, local);
}

/** Mean recent disturbance across this region, normalized to 0..1. */
export function regionHuntDisturbance(state: GameState, world: World, region: number): number {
  const cells = regionAt(world, region).cells;
  if (!cells.length) return 0;
  return cells.reduce((sum, cell) => sum + (1 - huntPressureFactor(state, world, cell)) / 0.75, 0) / cells.length;
}

export function disturbHuntingGround(state: GameState, world: World, cell: number, killed: boolean): void {
  state.huntPressure[cell] = Math.min(1, (state.huntPressure[cell] ?? 0) + (killed ? 0.45 : 0.12));
  for (const subject of state.wildlife.subjects) {
    if (!subject.active || straightKm(world, subject.active.cell, cell) >= PRESSURE_RADIUS_KM) continue;
    subject.active.alarm = 100;
    subject.active.intent = "flee";
    subject.active.target = null;
    subject.active.route = [];
  }
}

export function ageHuntPressure(state: GameState, dt: number): void {
  const pressureDrop = dt / (PRESSURE_DAYS * 1440);
  for (const key of Object.keys(state.huntPressure)) {
    const cell = Number(key);
    const next = (state.huntPressure[cell] ?? 0) - pressureDrop;
    if (next <= 1e-9) delete state.huntPressure[cell];
    else state.huntPressure[cell] = next;
  }
}
