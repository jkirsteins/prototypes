/**
 * What the ground is at 50 m. The classifier is the hydrology spec's section
 * 3, the same rules the solve applies per 300 m cell (classify.ts), fed with
 * what the refined chunk measures: the fine surface's own slope and receiver,
 * the fine upslope area, and the coast distance and latitude of the patch
 * rather than of its parent. Water comes first and is the chunk's, not the
 * parent's; land is decided per patch, so a parent's ground can be two
 * classes and a shore or a river bank falls where the height says.
 *
 * The parent's class is never copied down. How often the two agree is
 * measured, not enforced.
 *
 * The determinism rule of the solve holds here as it does in refine.ts:
 * addition, subtraction, multiplication, division, comparison, square root
 * and the integer-hash noise, and nothing else.
 */
import { derive } from "../rng";
import { KIND, landTerrainIndex, moistureIndex, precipitationIndex, soilNoiseAtKm, solvedSoilScale, uniformAt, upslopeCellsOf, wetnessIndex } from "./classify";
import { accumulate, DIST8, DY8, flowDirections, NO_FLOW, receiverOf } from "./hydro";
import { valueNoiseMetres } from "./noise";
import type { FineWindow } from "./refine";
import { FINE_PER_PARENT, PATCH_M } from "./spatial";
import type { SolvedWorld } from "./solve";
import { coastKmAt, latitudeAt, TEMPLATE_H_KM, TEMPLATE_W_KM, TERRAIN_INDEX } from "./terrain";

/** Children to a parent: what one patch is worth as a share of a solved cell's area. */
const PATCH_CELLS = 1 / (FINE_PER_PARENT * FINE_PER_PARENT);

/**
 * How far the sub-cell noise moves a patch's draw on the soil distribution.
 * The rank transform makes a rock rate the real share of ground, and a
 * symmetric nudge of the draw leaves that share alone while breaking a 2 km
 * soil patch into the stone and moss of a hillside: a fifth of the range is
 * enough to mottle a band's edge without moving the band.
 */
const SOIL_BREAKUP = 0.05;

/** Fine variation from 100 m to 1.2 km, with the longest scale dominant. */
function fineNoise(xM: number, yM: number, seed: number): number {
  const wavelengths = [1_200, 600, 300, 150, 100];
  let sum = 0;
  let weight = 1;
  let total = 0;
  for (let i = 0; i < wavelengths.length; i++) {
    sum += weight * valueNoiseMetres(xM, yM, seed + i * 101, wavelengths[i]);
    total += weight;
    weight *= 0.5;
  }
  return sum / total;
}

/**
 * The upslope area of every patch of the window in solved cells: each patch
 * carries its own thirty-sixth of a cell down the fine flow directions, and
 * each parent on the window's rim hands over the catchment its discharge
 * implies, since everything above the rim is outside what the chunk can see.
 */
function upslopeCells(solved: SolvedWorld, win: FineWindow, dir: Uint8Array, filled: Float32Array): Float32Array {
  const n = win.ww * win.wh;
  const weight = new Float32Array(n).fill(PATCH_CELLS);
  for (let j = 0; j < win.ph; j++) {
    for (let i = 0; i < win.pw; i++) {
      if (i > 0 && j > 0 && i < win.pw - 1 && j < win.ph - 1) continue;
      const px = win.px0 + i;
      const py = win.py0 + j;
      const inherited = upslopeCellsOf(solved.discharge[py * solved.w + px], px, py, solved.w, solved.h) - 1;
      if (inherited <= 0) continue;
      // Where the rim cell's water gathers, which for a channel cell is its channel.
      let lowest = -1;
      for (let dy = 0; dy < FINE_PER_PARENT; dy++) {
        for (let dx = 0; dx < FINE_PER_PARENT; dx++) {
          const k = (j * FINE_PER_PARENT + dy) * win.ww + i * FINE_PER_PARENT + dx;
          if (lowest < 0 || filled[k] < filled[lowest]) lowest = k;
        }
      }
      weight[lowest] += inherited;
    }
  }
  return accumulate(dir, win.ww, win.wh, weight).flow;
}

/**
 * The ground of a chunk's patches, as TERRAIN_INDEX values in the chunk's own
 * 96 by 96 layout. Water first: the chunk's sea, lake and pond patches are
 * water and a river parent's channel patches are river (the kind the channel
 * pass left on them), which leaves the banks to be classified as the land
 * they are.
 */
export function classifyFine(
  seed: number, solved: SolvedWorld, win: FineWindow,
  x0: number, y0: number, w: number, h: number, stride: number,
  height: Float32Array, filled: Float32Array, kind: Uint8Array,
): Uint8Array {
  const out = new Uint8Array(stride * stride);
  const n = win.ww * win.wh;
  const standing = new Uint8Array(n);
  for (let i = 0; i < n; i++) if (kind[i] === KIND.sea || kind[i] === KIND.lake) standing[i] = 1;
  const dir = flowDirections(filled, win.ww, win.wh, standing);
  const area = upslopeCells(solved, win, dir, filled);
  const soilScale = solvedSoilScale(seed, solved);
  const breakupSeed = derive(seed, 28);
  const fineW = solved.w * FINE_PER_PARENT;
  const fineH = solved.h * FINE_PER_PARENT;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const fx = x0 + x;
      const fy = y0 + y;
      const i = (fy - win.fy0) * win.ww + fx - win.fx0;
      const local = y * stride + x;
      if (standing[i]) { out[local] = TERRAIN_INDEX.water; continue; }
      if (kind[i] === KIND.river) { out[local] = TERRAIN_INDEX.river; continue; }
      let slope = 0;
      let northFacing = 0.5;
      if (dir[i] !== NO_FLOW) {
        const r = receiverOf(i, dir[i], win.ww);
        slope = (filled[i] - filled[r]) / (DIST8[dir[i]] * PATCH_M);
        if (slope < 0) slope = 0;
        const dy = DY8[dir[i]];
        northFacing = dy < 0 ? 1 : dy > 0 ? 0 : 0.5;
      }
      const u = (fx + 0.5) / fineW;
      const v = (fy + 0.5) / fineH;
      const coastKm = coastKmAt(u, v);
      const lat = latitudeAt(fy + 0.5, fineH);
      const wetness = wetnessIndex(area[i] * FINE_PER_PARENT, slope);
      const p = precipitationIndex(coastKm);
      const m = moistureIndex(p, wetness, northFacing);
      const raw = soilNoiseAtKm(seed, u * TEMPLATE_W_KM, v * TEMPLATE_H_KM);
      let soil = uniformAt(soilScale, raw) + SOIL_BREAKUP * (fineNoise((fx + 0.5) * PATCH_M, (fy + 0.5) * PATCH_M, breakupSeed) - 0.5);
      if (soil < 0) soil = 0;
      if (soil > 1) soil = 1;
      out[local] = landTerrainIndex(height[i], slope, lat, coastKm, wetness, p, m, soil);
    }
  }
  return out;
}
