/**
 * From drainage to discharge and to the glacial shape of the western
 * valleys; and (below) from the solved fields to what each cell is. The
 * rules here are the geology and ecology of the setting, in real units.
 */
import { CELL_KM } from "../units";
import { NO_FLOW, receiverOf } from "./hydro";
import { coastKmAt, runoffLsKm2 } from "./terrain";

const CELL_KM2 = CELL_KM * CELL_KM;

/** What each cell adds to the river below it, cubic metres a second: its area times the row's runoff. */
export function runoffWeights(w: number, h: number): Float32Array {
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    const v = (y + 0.5) / h;
    for (let x = 0; x < w; x++) out[y * w + x] = CELL_KM2 * runoffLsKm2(coastKmAt((x + 0.5) / w, v)) / 1000;
  }
  return out;
}

/** Signed coast distance of a cell, km, positive inland. */
export function coastKmOfCell(x: number, y: number, w: number, h: number): number {
  return coastKmAt((x + 0.5) / w, (y + 0.5) / h);
}

const TROUGH_MAX_DEPTH_M = 700;
const TROUGH_MAX_HALF_KM = 4;
const TROUGH_REACH_KM = 150;
const DROWN_REACH_KM = 40;
const DROWN_M = 300;
/** A valley is carved once its catchment reaches this. */
const TROUGH_MIN_KM2 = 5;

/**
 * Ice sat in the western valleys and over-deepened them: along every
 * drainage line that reaches the Atlantic within 150 km, the floor is
 * lowered by a parabolic trough whose depth and width grow with the
 * catchment, and within 40 km of the coast an extra drop drowns it so the
 * sea can enter. Applied in place; the caller re-reads the sea afterwards.
 */
export function carveGlacial(height: Float32Array, w: number, h: number, dir: Uint8Array, count: Uint32Array, order: Int32Array, seaBefore: Uint8Array): void {
  const n = w * h;
  // A cell drains west if its receiver does, or it is Atlantic sea itself.
  // The actual shoreline sits inland of the template coast line (the coastal
  // flank starts below sea level and the relief noise pushes it further), so
  // coastKm below 0 alone matches nothing; 100 catches the real Atlantic
  // shore while staying short of the Bothnian bay, which lies beyond 200 km.
  const drainsWest = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    if (!seaBefore[i]) continue;
    const x = i % w;
    const y = (i - x) / w;
    if (coastKmOfCell(x, y, w, h) < 100) drainsWest[i] = 1;
  }
  for (let k = n - 1; k >= 0; k--) {
    const c = order[k];
    if (dir[c] === NO_FLOW) continue;
    if (drainsWest[receiverOf(c, dir[c], w)]) drainsWest[c] = 1;
  }
  const lower = new Float32Array(n);
  for (let c = 0; c < n; c++) {
    if (seaBefore[c] || !drainsWest[c]) continue;
    const x = c % w;
    const y = (c - x) / w;
    const coastKm = coastKmOfCell(x, y, w, h);
    if (coastKm >= TROUGH_REACH_KM) continue;
    const km2 = count[c] * CELL_KM2;
    if (km2 < TROUGH_MIN_KM2) continue;
    const root = Math.sqrt(km2);
    let depth = 40 * root;
    if (depth > TROUGH_MAX_DEPTH_M) depth = TROUGH_MAX_DEPTH_M;
    if (coastKm < DROWN_REACH_KM) depth += DROWN_M * (1 - coastKm / DROWN_REACH_KM);
    let halfKm = 0.15 * root;
    if (halfKm > TROUGH_MAX_HALF_KM) halfKm = TROUGH_MAX_HALF_KM;
    const halfCells = halfKm / CELL_KM;
    const reach = Math.ceil(halfCells);
    for (let dy = -reach; dy <= reach; dy++) {
      const yy = y + dy;
      if (yy < 0 || yy >= h) continue;
      for (let dx = -reach; dx <= reach; dx++) {
        const xx = x + dx;
        if (xx < 0 || xx >= w) continue;
        const r2 = (dx * dx + dy * dy) / (halfCells * halfCells);
        if (r2 >= 1) continue;
        const d = depth * (1 - r2);
        const j = yy * w + xx;
        if (d > lower[j]) lower[j] = d;
      }
    }
  }
  for (let i = 0; i < n; i++) if (!seaBefore[i]) height[i] -= lower[i];
}
