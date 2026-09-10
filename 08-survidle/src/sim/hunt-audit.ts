import type { World } from "../world/gen";
import { cellAt, regionAt } from "../world/gen";
import { FOODS, type FoodId } from "./items";
import { survivalRunway } from "./runway";
import { regionState, startingPop } from "./regionstate";
import type { GameState, PerishableId, Species } from "./types";

type HuntFoodItem = FoodId | "rawFat" | "rack";

export type PopulationFlowKind = "birth" | "growth" | "immigration" | "emigration" | "naturalDeath" | "predation";

export interface HuntAttemptAudit {
  minute: number;
  species: Species;
  region: number;
  cell: number;
  x: number;
  y: number;
  populationBefore: number;
  capacity: number;
  odds: number;
  pressureFactor: number;
  success: boolean;
  minutes: number;
  foodRunwayDays: number;
  fatRunwayDays: number;
}

export interface PopulationAudit {
  region: number;
  regionName: string;
  areaKm2: number;
  species: Species;
  starting: number;
  births: number;
  growth: number;
  immigration: number;
  emigration: number;
  naturalDeaths: number;
  predationDeaths: number;
  huntDeaths: number;
  ending: number;
}

export interface HuntAuditReport {
  attempts: HuntAttemptAudit[];
  huntMinutes: number;
  populations: PopulationAudit[];
  fieldRecoveredKcal: number;
  hauledKcal: number;
  spoiledKcal: number;
  preservedKcal: number;
  eatenKcal: number;
  endingStoredKcal: number;
}

interface MutablePopulation extends Omit<PopulationAudit, "ending"> {}
interface AuditState {
  world: World;
  attempts: HuntAttemptAudit[];
  pursuitMinutes: number;
  populations: Map<string, MutablePopulation>;
  fieldRecoveredKcal: number;
  hauledKcal: number;
  spoiledKcal: number;
  preservedKcal: number;
  eatenKcal: number;
  huntFood: Partial<Record<HuntFoodItem, number>>;
}

const audits = new WeakMap<GameState, AuditState>();
const keyOf = (region: number, species: Species) => `${region}:${species}`;
const TRACKED_POPULATIONS = new Set<Species>(["deer", "reindeer", "elk", "bear"]);

export function enableHuntAudit(state: GameState, world: World): void {
  audits.set(state, {
    world, attempts: [], pursuitMinutes: 0, populations: new Map(), fieldRecoveredKcal: 0,
    hauledKcal: 0, spoiledKcal: 0, preservedKcal: 0, eatenKcal: 0, huntFood: {},
  });
}

function population(audit: AuditState, world: World, region: number, species: Species): MutablePopulation {
  const key = keyOf(region, species);
  let flow = audit.populations.get(key);
  if (!flow) {
    const r = regionAt(world, region);
    flow = {
      region, regionName: r.name, areaKm2: r.area, species,
      starting: startingPop(world, region)[species] ?? 0,
      births: 0, growth: 0, immigration: 0, emigration: 0,
      naturalDeaths: 0, predationDeaths: 0, huntDeaths: 0,
    };
    audit.populations.set(key, flow);
  }
  return flow;
}

export function notePopulationChange(state: GameState, world: World, region: number, species: Species, kind: PopulationFlowKind, amount: number): void {
  const audit = audits.get(state);
  if (!audit || amount <= 0 || !TRACKED_POPULATIONS.has(species)) return;
  const flow = population(audit, world, region, species);
  if (kind === "birth") flow.births += amount;
  else if (kind === "growth") flow.growth += amount;
  else if (kind === "immigration") flow.immigration += amount;
  else if (kind === "emigration") flow.emigration += amount;
  else if (kind === "naturalDeath") flow.naturalDeaths += amount;
  else flow.predationDeaths += amount;
}

export function noteHuntPursuit(state: GameState, minutes: number): void {
  const audit = audits.get(state);
  if (audit) audit.pursuitMinutes += minutes;
}

export function noteHuntAttempt(state: GameState, world: World, input: Omit<HuntAttemptAudit, "minute" | "x" | "y" | "capacity" | "foodRunwayDays" | "fatRunwayDays">): void {
  const audit = audits.get(state);
  if (!audit) return;
  const r = regionAt(world, input.region);
  const flow = population(audit, world, input.region, input.species);
  const runway = survivalRunway(state, world);
  const cell = cellAt(world, input.cell);
  audit.attempts.push({
    ...input,
    minute: state.minute,
    x: cell.x,
    y: cell.y,
    capacity: r.capacity[input.species] ?? 0,
    foodRunwayDays: runway.foodDays,
    fatRunwayDays: runway.fatDays,
  });
  audit.pursuitMinutes = 0;
  if (input.success) flow.huntDeaths++;
}

export function pendingHuntMinutes(state: GameState): number {
  return audits.get(state)?.pursuitMinutes ?? 0;
}

export function noteFieldRecovery(state: GameState, meatKg: number, fatKg: number): void {
  const audit = audits.get(state);
  if (audit) audit.fieldRecoveredKcal += meatKg * FOODS.rawMeat.kcalPerKg + fatKg * FOODS.fat.kcalPerKg;
}

export function noteHauledHuntFood(state: GameState, meatKg: number, fatKg: number): void {
  const audit = audits.get(state);
  if (!audit) return;
  audit.hauledKcal += meatKg * FOODS.rawMeat.kcalPerKg + fatKg * FOODS.fat.kcalPerKg;
  audit.huntFood.rawMeat = (audit.huntFood.rawMeat ?? 0) + meatKg;
  audit.huntFood.rawFat = (audit.huntFood.rawFat ?? 0) + fatKg;
}

function consumeTracked(audit: AuditState, item: HuntFoodItem, kg: number): number {
  const used = Math.min(kg, audit.huntFood[item] ?? 0);
  audit.huntFood[item] = Math.max(0, (audit.huntFood[item] ?? 0) - used);
  return used;
}

export function noteHuntFoodTransformed(state: GameState, from: HuntFoodItem, to: HuntFoodItem, kgIn: number, kgOut: number, preserved: boolean): void {
  const audit = audits.get(state);
  if (!audit) return;
  const trackedIn = consumeTracked(audit, from, kgIn);
  const trackedOut = kgIn > 0 ? trackedIn * kgOut / kgIn : 0;
  audit.huntFood[to] = (audit.huntFood[to] ?? 0) + trackedOut;
  if (preserved) audit.preservedKcal += trackedOut * (to === "rack" ? FOODS.rawMeat.kcalPerKg : to === "rawFat" ? FOODS.fat.kcalPerKg : FOODS[to].kcalPerKg);
}

export function noteHuntFoodLost(state: GameState, item: PerishableId, kg: number): void {
  const audit = audits.get(state);
  if (!audit) return;
  const tracked = consumeTracked(audit, item as HuntFoodItem, kg);
  if (tracked <= 0) return;
  const kcalPerKg = item === "rawFat" ? FOODS.fat.kcalPerKg : FOODS[item as FoodId]?.kcalPerKg ?? 0;
  audit.spoiledKcal += tracked * kcalPerKg;
}

export function noteHuntSpoiledKcal(state: GameState, kcal: number): void {
  const audit = audits.get(state);
  if (audit) audit.spoiledKcal += kcal;
}

export function noteHuntFoodEaten(state: GameState, item: FoodId, kg: number, creditedKcal: number): void {
  const audit = audits.get(state);
  if (!audit) return;
  const tracked = consumeTracked(audit, item, kg);
  if (kg > 0) audit.eatenKcal += creditedKcal * tracked / kg;
}

export function finishHuntAudit(state: GameState, world: World): HuntAuditReport {
  const audit = audits.get(state);
  if (!audit) throw new Error("hunt audit is not enabled");
  const populations = [...audit.populations.values()].map((flow) => ({
    ...flow,
    ending: regionState(state, world, flow.region).pop[flow.species] ?? 0,
  }));
  let endingStoredKcal = 0;
  for (const [item, kg] of Object.entries(audit.huntFood)) {
    if (!kg) continue;
    endingStoredKcal += kg * (item === "rack" ? FOODS.rawMeat.kcalPerKg : item === "rawFat" ? FOODS.fat.kcalPerKg : FOODS[item as FoodId].kcalPerKg);
  }
  return {
    attempts: [...audit.attempts], huntMinutes: audit.attempts.reduce((n, x) => n + x.minutes, 0) + audit.pursuitMinutes,
    populations, fieldRecoveredKcal: audit.fieldRecoveredKcal, hauledKcal: audit.hauledKcal,
    spoiledKcal: audit.spoiledKcal, preservedKcal: audit.preservedKcal,
    eatenKcal: audit.eatenKcal, endingStoredKcal,
  };
}
