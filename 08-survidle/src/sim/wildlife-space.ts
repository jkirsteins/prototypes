import { Rng, derive } from "../rng";
import { CELL_KM } from "../units";
import type { World } from "../world/gen";
import type { GameState } from "./types";

export interface MetricPoint { xM: number; yM: number }

export type SpatialEstimate =
  | { kind: "exact"; point: MetricPoint }
  | { kind: "area"; key: string; min: MetricPoint; max: MetricPoint };

export interface EncounterGeometry {
  actor: MetricPoint;
  subject: MetricPoint;
  distanceM: number;
  bearingRad: number;
  uncertaintyM: number;
}

function invalid(message: string): null {
  if (!import.meta.env.PROD) console.assert(false, message);
  return null;
}

function finitePoint(point: MetricPoint): boolean {
  return Number.isFinite(point.xM) && Number.isFinite(point.yM);
}

function hash(value: string): number {
  let result = 2166136261;
  for (let i = 0; i < value.length; i++) {
    result = Math.imul(result ^ value.charCodeAt(i), 16777619);
  }
  return result >>> 0;
}

export function metricPointForPlayer(state: GameState, _world: World): MetricPoint | null {
  if (!Number.isFinite(state.player.x) || !Number.isFinite(state.player.y)) return invalid("wildlife player position must be finite");
  const metresPerCell = CELL_KM * 1000;
  return { xM: state.player.x * metresPerCell, yM: state.player.y * metresPerCell };
}

export function metricAreaForCell(world: World, cell: number): SpatialEstimate | null {
  if (!Number.isFinite(world.w) || !Number.isFinite(world.h) || !Number.isFinite(cell)) {
    return invalid("wildlife cell bounds must be finite");
  }
  const x = cell % world.w;
  const y = Math.floor(cell / world.w);
  const metresPerCell = CELL_KM * 1000;
  return {
    kind: "area",
    key: `cell:${x},${y}`,
    min: { xM: x * metresPerCell, yM: y * metresPerCell },
    max: { xM: (x + 1) * metresPerCell, yM: (y + 1) * metresPerCell },
  };
}

export function resolveSpatialEstimate(seed: number, subjectId: number, estimate: SpatialEstimate): MetricPoint | null {
  if (!Number.isFinite(seed) || !Number.isFinite(subjectId)) return invalid("wildlife spatial seed and subject must be finite");
  if (estimate.kind === "exact") return finitePoint(estimate.point) ? estimate.point : invalid("wildlife exact point must be finite");
  if (!finitePoint(estimate.min) || !finitePoint(estimate.max)) return invalid("wildlife area bounds must be finite");

  const salt = 81000 + subjectId * 2 + hash(estimate.key);
  if (!Number.isFinite(salt)) return invalid("wildlife spatial salt must be finite");
  const xFraction = new Rng(derive(seed, salt)).next();
  const yFraction = new Rng(derive(seed, salt + 1)).next();
  return {
    xM: estimate.min.xM + (estimate.max.xM - estimate.min.xM) * xFraction,
    yM: estimate.min.yM + (estimate.max.yM - estimate.min.yM) * yFraction,
  };
}

export function encounterGeometry(actor: MetricPoint, subject: MetricPoint, uncertaintyM = 0): EncounterGeometry | null {
  if (!finitePoint(actor) || !finitePoint(subject) || !Number.isFinite(uncertaintyM)) return invalid("wildlife encounter geometry must be finite");
  const dx = subject.xM - actor.xM;
  const dy = subject.yM - actor.yM;
  return {
    actor,
    subject,
    distanceM: Math.hypot(dx, dy),
    bearingRad: Math.atan2(dy, dx),
    uncertaintyM,
  };
}
