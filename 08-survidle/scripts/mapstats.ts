/**
 * Prints a downsampled ASCII view of the whole world plus terrain shares, for
 * tuning the geography. Samples points rather than generating chunks, so it
 * is fast. Run: npx vite-node scripts/mapstats.ts [seed]
 */
import { generateWorld, regionAt, TERRAINS, WORLD_H, WORLD_W } from "../src/world/gen";
import { terrainAt } from "../src/world/terrain";

const GLYPH: Record<string, string> = { water: "~", fell: "^", rock: "n", bog: "\"", spruce: "A", pine: "T", birch: "Y", meadow: "." };
const seed = Number(process.argv[2] ?? 42);
const cols = 120;
const step = WORLD_W / cols;
const rows = Math.round(WORLD_H / step / 2); // glyphs are taller than wide
const counts: Record<string, number> = {};
let n = 0;
const t0 = performance.now();
for (let r = 0; r < rows; r++) {
  let line = "";
  for (let c = 0; c < cols; c++) {
    const x = Math.floor((c + 0.5) * step);
    const y = Math.floor((r + 0.5) * (WORLD_H / rows));
    const t = terrainAt(seed, x, y);
    counts[t] = (counts[t] ?? 0) + 1;
    n++;
    line += GLYPH[t];
  }
  console.log(line);
}
console.log(`seed ${seed}: ${TERRAINS.map((t) => `${t} ${((100 * (counts[t] ?? 0)) / n).toFixed(0)}%`).join("  ")}  (${(performance.now() - t0).toFixed(0)} ms for ${n} samples)`);
const t1 = performance.now();
const world = generateWorld(seed);
const start = regionAt(world, world.start);
console.log(`start ${start.name} at lattice ${world.start}: forest ${(start.forest * 100).toFixed(0)}% water ${(start.frac.water * 100).toFixed(0)}% cells ${start.cells.length} spots ${start.spots.map((s) => `${s.id} ${s.km}`).join(", ")} neighbours ${start.neighbours.length}; world+start in ${(performance.now() - t1).toFixed(0)} ms`);
