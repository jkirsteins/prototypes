export type PatchId = number;

export interface MetricPoint { xM: number; yM: number }

export interface FineWorldBounds { w: number; h: number }

export interface AggregateBounds { x0: number; y0: number; x1: number; y1: number }

export interface FineNeighbour {
  patch: PatchId;
  distanceM: number;
  diagonal: boolean;
  corners: PatchId[];
}

export const PATCH_M = 50;
export const PATCH_KM = PATCH_M / 1000;
export const FINE_PER_PARENT = 6;
export const WORLD_FINE_W = 10800;
export const WORLD_FINE_H = 7800;

const PARENT_W = WORLD_FINE_W / FINE_PER_PARENT;
const PARENT_H = WORLD_FINE_H / FINE_PER_PARENT;

function assertIntegerIn(value: number, min: number, max: number, name: string): void {
  if (!Number.isInteger(value) || value < min || value > max) throw new RangeError(`${name} is outside the world`);
}

function assertFineWorld(world: FineWorldBounds): void {
  assertIntegerIn(world.w, 1, WORLD_FINE_W, "world width");
  assertIntegerIn(world.h, 1, WORLD_FINE_H, "world height");
}

export function patchId(x: number, y: number): PatchId {
  assertIntegerIn(x, 0, WORLD_FINE_W - 1, "patch x");
  assertIntegerIn(y, 0, WORLD_FINE_H - 1, "patch y");
  return y * WORLD_FINE_W + x;
}

export function patchXY(id: PatchId): { x: number; y: number } {
  assertIntegerIn(id, 0, WORLD_FINE_W * WORLD_FINE_H - 1, "patch id");
  return { x: id % WORLD_FINE_W, y: Math.floor(id / WORLD_FINE_W) };
}

export function patchAtMetric(point: MetricPoint): PatchId {
  if (!Number.isFinite(point.xM) || !Number.isFinite(point.yM)) throw new RangeError("metric point must be finite");
  return patchId(Math.floor(point.xM / PATCH_M), Math.floor(point.yM / PATCH_M));
}

export function patchCenter(id: PatchId): MetricPoint {
  const { x, y } = patchXY(id);
  return { xM: (x + 0.5) * PATCH_M, yM: (y + 0.5) * PATCH_M };
}

export function parentXY(id: PatchId): { x: number; y: number } {
  const { x, y } = patchXY(id);
  return { x: Math.floor(x / FINE_PER_PARENT), y: Math.floor(y / FINE_PER_PARENT) };
}

export function parentKey(px: number, py: number): number {
  assertIntegerIn(px, 0, PARENT_W - 1, "parent x");
  assertIntegerIn(py, 0, PARENT_H - 1, "parent y");
  return py * PARENT_W + px;
}

export function aggregateBounds(gx: number, gy: number, finePerGlyph: number): AggregateBounds {
  if (!Number.isInteger(finePerGlyph) || finePerGlyph < 1) throw new RangeError("fine patches per glyph must be positive");
  const glyphW = Math.ceil(WORLD_FINE_W / finePerGlyph);
  const glyphH = Math.ceil(WORLD_FINE_H / finePerGlyph);
  assertIntegerIn(gx, 0, glyphW - 1, "glyph x");
  assertIntegerIn(gy, 0, glyphH - 1, "glyph y");
  const x0 = gx * finePerGlyph;
  const y0 = gy * finePerGlyph;
  return { x0, y0, x1: Math.min(x0 + finePerGlyph, WORLD_FINE_W), y1: Math.min(y0 + finePerGlyph, WORLD_FINE_H) };
}

export function fineNeighbours(world: FineWorldBounds, id: PatchId): FineNeighbour[] {
  assertFineWorld(world);
  const { x, y } = patchXY(id);
  if (x >= world.w || y >= world.h) throw new RangeError("patch id is outside the world");
  const out: FineNeighbour[] = [];
  const directions = [
    { x: 0, y: -1 }, { x: 1, y: -1 }, { x: 1, y: 0 }, { x: 1, y: 1 },
    { x: 0, y: 1 }, { x: -1, y: 1 }, { x: -1, y: 0 }, { x: -1, y: -1 },
  ];
  for (const direction of directions) {
    const nx = x + direction.x;
    const ny = y + direction.y;
    if (nx < 0 || ny < 0 || nx >= world.w || ny >= world.h) continue;
    const diagonal = direction.x !== 0 && direction.y !== 0;
    out.push({
      patch: patchId(nx, ny),
      distanceM: diagonal ? PATCH_M * Math.SQRT2 : PATCH_M,
      diagonal,
      corners: diagonal ? [patchId(nx, y), patchId(x, ny)] : [],
    });
  }
  return out;
}
