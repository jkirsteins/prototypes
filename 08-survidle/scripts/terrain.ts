/**
 * Stage timings for the world solve at full size, and (from Task 11) the
 * realism report. Run: npm run terrain -- [seed]
 */
import { coarseSize, coarseSurface, erode, ERODE_ITERATIONS, upsample } from "../src/world/erode";
import { accumulate, flowDirections, priorityFlood } from "../src/world/hydro";
import { WORLD_H, WORLD_W } from "../src/world/terrain";

const seed = Number(process.argv[2] ?? 42);
const t = (label: string, f: () => void) => {
  const t0 = performance.now();
  f();
  console.log(`${label.padEnd(28)} ${((performance.now() - t0) / 1000).toFixed(2)} s`);
};
const { cw, ch } = coarseSize(WORLD_W, WORLD_H);
let c!: ReturnType<typeof coarseSurface>;
t("coarse surface", () => { c = coarseSurface(seed, cw, ch); });
t(`erosion x${ERODE_ITERATIONS}`, () => erode(c.height, cw, ch, c.uplift, c.sea, ERODE_ITERATIONS));
let fine!: Float32Array;
t("upsample", () => { fine = upsample(c.height, cw, ch, WORLD_W, WORLD_H, seed); });
const sea = new Uint8Array(WORLD_W * WORLD_H);
for (let i = 0; i < sea.length; i++) sea[i] = fine[i] <= 0 ? 1 : 0;
let filled!: Float32Array;
t("priority flood (full)", () => { filled = priorityFlood(fine, WORLD_W, WORLD_H, sea); });
let dir!: Uint8Array;
t("flow directions (full)", () => { dir = flowDirections(filled, WORLD_W, WORLD_H, sea); });
t("accumulate (full)", () => accumulate(dir, WORLD_W, WORLD_H, null));
