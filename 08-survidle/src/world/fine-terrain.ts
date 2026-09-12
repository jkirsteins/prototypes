import { derive } from "../rng";
import type { Terrain } from "../sim/types";
import { fbmMetres, valueNoiseMetres } from "./noise";
import { PATCH_M, type MetricPoint, type PatchId, patchCenter, WORLD_FINE_H, WORLD_FINE_W } from "./spatial";

/** The template is drawn across the whole fine lattice, so both extents follow its constants. */
const WORLD_W_M = WORLD_FINE_W * PATCH_M;
const WORLD_H_M = WORLD_FINE_H * PATCH_M;
const REGION_LATTICE_M = 4_200;
const REGION_LATTICE_W = Math.ceil(WORLD_W_M / REGION_LATTICE_M);
const REGION_LATTICE_H = Math.ceil(WORLD_H_M / REGION_LATTICE_M);
const ELEVATION_SCALE_M = 1_200;

interface Seeds {
  coast: number;
  fjord: number;
  elevation: number;
  moisture: number;
  lake: number;
  detail: number;
}

export interface PhysicalFields {
  elevationM: number;
  moisture: number;
  exposure: number;
  drainage: number;
  sea: boolean;
  inlandWater: boolean;
  coast: number;
}

const seedCache = new Map<number, Seeds>();

function seedsFor(seed: number): Seeds {
  let fields = seedCache.get(seed);
  if (!fields) {
    fields = {
      coast: derive(seed, 11),
      fjord: derive(seed, 12),
      elevation: derive(seed, 13),
      moisture: derive(seed, 14),
      lake: derive(seed, 15),
      detail: derive(seed, 16),
    };
    seedCache.set(seed, fields);
  }
  return fields;
}

function clamp(value: number): number {
  return Math.max(0, Math.min(1, value));
}

/** Distance in world proportions from the southwest-to-northeast fell spine. */
function ridgeDistance(u: number, v: number): number {
  const aspect = WORLD_H_M / WORLD_W_M;
  const ax = 0.2;
  const ay = 0.88 * aspect;
  const bx = 0.66;
  const by = 0.28 * aspect;
  const py = v * aspect;
  const dx = bx - ax;
  const dy = by - ay;
  const t = Math.max(0, Math.min(1, ((u - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(u - (ax + t * dx), py - (ay + t * dy));
}

/** Fine variation from 100 m to 1.2 km, with the longest scale dominant. */
function fineNoise(point: MetricPoint, seed: number): number {
  const wavelengths = [1_200, 600, 300, 150, 100];
  let sum = 0;
  let weight = 1;
  let total = 0;
  for (let i = 0; i < wavelengths.length; i++) {
    sum += weight * valueNoiseMetres(point.xM, point.yM, seed + i * 101, wavelengths[i]);
    total += weight;
    weight *= 0.5;
  }
  return sum / total;
}

export function fieldsAtMetric(seed: number, point: MetricPoint): PhysicalFields {
  const seeds = seedsFor(seed);
  const u = point.xM / WORLD_W_M;
  const v = point.yM / WORLD_H_M;
  const coast = v * 1.25 + u * 0.85 - 0.62
    + 0.30 * (fbmMetres(point.xM, point.yM, seeds.coast, 54_000, 3) - 0.5)
    + 0.10 * (fbmMetres(point.xM, point.yM, seeds.fjord, 4_200, 3) - 0.5);
  const sea = coast < 0;
  const ridge = Math.exp(-((ridgeDistance(u, v) / 0.075) ** 2));
  const elevationDetail = fineNoise(point, seeds.detail) - 0.5;
  let elevation = 0.42 + 0.48 * ridge
    + (fbmMetres(point.xM, point.yM, seeds.elevation, 3_300, 4, 2_700) - 0.5) * 0.45
    + elevationDetail * 0.11;
  if (!sea) elevation -= 0.12 * Math.exp(-coast / 0.04);
  const lake = fbmMetres(point.xM + 150_000, point.yM + 150_000, seeds.lake, 7_800, 3, 6_600)
    + (fineNoise(point, seeds.lake + 503) - 0.5) * 0.06;
  const inlandWater = !sea && coast > 0.05 && ridge < 0.5 && lake < 0.31;
  if (inlandWater) elevation = Math.min(elevation, 0.25);
  const moisture = clamp(
    fbmMetres(point.xM + 11_100, point.yM + 3_300, seeds.moisture, 3_000, 4, 2_700)
    + 0.12 * (u - 0.5) - 0.25 * ridge + (fineNoise(point, seeds.moisture + 907) - 0.5) * 0.12,
  );
  const exposure = clamp(0.18 + ridge * 0.54 + elevation * 0.26 + (fineNoise(point, seeds.detail + 307) - 0.5) * 0.28);
  const drainage = clamp(0.48 + elevation * 0.36 - moisture * 0.38 + (fineNoise(point, seeds.detail + 613) - 0.5) * 0.22);
  return { elevationM: elevation * ELEVATION_SCALE_M, moisture, exposure, drainage, sea, inlandWater, coast };
}

export function fieldsAtPatch(seed: number, patch: PatchId): PhysicalFields {
  return fieldsAtMetric(seed, patchCenter(patch));
}

function nearbyFields(seed: number, patch: PatchId): PhysicalFields[] {
  const center = patchCenter(patch);
  return [
    fieldsAtMetric(seed, { xM: center.xM - PATCH_M, yM: center.yM }),
    fieldsAtMetric(seed, { xM: center.xM + PATCH_M, yM: center.yM }),
    fieldsAtMetric(seed, { xM: center.xM, yM: center.yM - PATCH_M }),
    fieldsAtMetric(seed, { xM: center.xM, yM: center.yM + PATCH_M }),
  ];
}

export function terrainAtPatch(seed: number, patch: PatchId): Terrain {
  const fields = fieldsAtPatch(seed, patch);
  const nearby = nearbyFields(seed, patch);
  const waterNeighbors = nearby.filter((other) => other.sea || other.inlandWater).length;
  const localElevationM = (fields.elevationM + nearby.reduce((sum, other) => sum + other.elevationM, 0)) / 5;
  const localMoisture = (fields.moisture + nearby.reduce((sum, other) => sum + other.moisture, 0)) / 5;

  if (fields.sea || fields.inlandWater || (waterNeighbors >= 3 && fields.coast < 0.03)) return "water";
  if (fields.elevationM > 1_008 && fields.exposure > 0.42) return "fell";
  if (fields.elevationM > 912 || (fields.exposure > 0.72 && localElevationM > 840)) return "rock";
  if (localMoisture > 0.62 && fields.drainage < 0.5 && fields.elevationM < 600) return "bog";
  if (fields.moisture > 0.52 && fields.exposure < 0.7) return "spruce";
  if (fields.moisture > 0.4 && fields.exposure < 0.78) return "pine";
  if (fields.elevationM < 600 && fields.exposure < 0.68) return "birch";
  return "meadow";
}

function hash2(seed: number, a: number, b: number): number {
  let hash = Math.imul(a + 1, 0x27d4eb2d) ^ Math.imul(b + 1, 0x165667b1) ^ Math.imul(seed, 0x9e3779b9);
  hash = Math.imul(hash ^ (hash >>> 15), 0x85ebca6b);
  hash = Math.imul(hash ^ (hash >>> 13), 0xc2b2ae35);
  return ((hash ^ (hash >>> 16)) >>> 0) / 4_294_967_296;
}

function latticeSeed(seed: number, lx: number, ly: number): MetricPoint {
  const xJitter = hash2(seed, lx, ly) - 0.5;
  const yJitter = hash2(seed, ly * 7_919, lx * 104_729) - 0.5;
  return {
    xM: Math.min(WORLD_W_M - 1, Math.max(0, (lx + 0.5) * REGION_LATTICE_M + xJitter * 0.8 * REGION_LATTICE_M)),
    yM: Math.min(WORLD_H_M - 1, Math.max(0, (ly + 0.5) * REGION_LATTICE_M + yJitter * 0.8 * REGION_LATTICE_M)),
  };
}

export function regionAtPatch(seed: number, patch: PatchId): number {
  const point = patchCenter(patch);
  const lx0 = Math.floor(point.xM / REGION_LATTICE_M);
  const ly0 = Math.floor(point.yM / REGION_LATTICE_M);
  let region = -1;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (let ly = ly0 - 1; ly <= ly0 + 1; ly++) {
    if (ly < 0 || ly >= REGION_LATTICE_H) continue;
    for (let lx = lx0 - 1; lx <= lx0 + 1; lx++) {
      if (lx < 0 || lx >= REGION_LATTICE_W) continue;
      const candidate = latticeSeed(seed, lx, ly);
      const distance = (point.xM - candidate.xM) ** 2 + (point.yM - candidate.yM) ** 2;
      if (distance < bestDistance) {
        bestDistance = distance;
        region = ly * REGION_LATTICE_W + lx;
      }
    }
  }
  return region;
}
