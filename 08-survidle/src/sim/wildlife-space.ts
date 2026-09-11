import { Rng, derive } from "../rng";
import { type MetricPoint, PATCH_M } from "../world/spatial";
import { WORLD_H, WORLD_W } from "../world/gen";
import type { World } from "../world/gen";
import type { GameState, WildlifeSubject } from "./types";

/** The one metric point, defined by the lattice; wildlife shares the survivor's space. */
export type { MetricPoint };

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
  // biome-ignore lint/suspicious/noConsole: expose corrupted spatial state during development without crashing production saves
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
  // The survivor's position is already the metric point; nothing to convert.
  if (!finitePoint(state.player)) return invalid("wildlife player position must be finite");
  return { xM: state.player.xM, yM: state.player.yM };
}

export function metricAreaForCell(world: World, cell: number): SpatialEstimate | null {
  if (!Number.isFinite(world.w) || !Number.isFinite(world.h) || !Number.isFinite(cell)) {
    return invalid("wildlife cell bounds must be finite");
  }
  const x = cell % world.w;
  const y = Math.floor(cell / world.w);
  return {
    kind: "area",
    key: `cell:${x},${y}`,
    min: { xM: x * PATCH_M, yM: y * PATCH_M },
    max: { xM: (x + 1) * PATCH_M, yM: (y + 1) * PATCH_M },
  };
}

/** Stable fallback used while loading saves written before exact wildlife positions. */
export function metricPointForStoredCell(seed: number, subjectId: number, cell: number): MetricPoint | null {
  if (!Number.isInteger(cell) || cell < 0 || cell >= WORLD_W * WORLD_H) return invalid("wildlife stored cell must be valid");
  const x = cell % WORLD_W;
  const y = Math.floor(cell / WORLD_W);
  return resolveSpatialEstimate(seed, subjectId, {
    kind: "area", key: `cell:${x},${y}`,
    min: { xM: x * PATCH_M, yM: y * PATCH_M },
    max: { xM: (x + 1) * PATCH_M, yM: (y + 1) * PATCH_M },
  });
}

export function metricPointForWildlife(state: GameState, world: World, subject: WildlifeSubject): MetricPoint | null {
  const active = subject.active;
  if (!active) return null;
  if (active.position && finitePoint(active.position) && cellForMetricPoint(world, active.position) === active.cell) return active.position;
  const area = metricAreaForCell(world, active.cell);
  const point = area ? resolveSpatialEstimate(state.seed, subject.id, area) : null;
  if (point) active.position = point;
  return point;
}

/** Grid conversion stays at this adapter boundary; callers reason in metres. */
export function cellForMetricPoint(world: World, point: MetricPoint): number | null {
  if (!finitePoint(point)) return invalid("wildlife metric position must be finite");
  const x = Math.floor(point.xM / PATCH_M);
  const y = Math.floor(point.yM / PATCH_M);
  if (x < 0 || y < 0 || x >= world.w || y >= world.h) return null;
  return y * world.w + x;
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
