/**
 * Prints a downsampled ASCII view of the whole world plus terrain shares, for
 * tuning the geography. Samples points rather than generating chunks, so it
 * is fast. Run: npx vite-node scripts/mapstats.ts [seed]
 */
import { generateWorld, regionAt, TERRAINS, terrainOf, WORLD_H, WORLD_W } from "../src/world/gen";
import { FLAG_STREAM, KIND } from "../src/world/solve";
import { installNodeWorldCache } from "../src/world/solvecache.node";

installNodeWorldCache();

const GLYPH: Record<string, string> = { water: "~", fell: "^", rock: "n", bog: "\"", spruce: "A", pine: "T", birch: "Y", meadow: ".", river: "=" };
const seed = Number(process.argv[2] ?? 42);
const cols = 120;
const step = WORLD_W / cols;
const rows = Math.round(WORLD_H / step / 2); // glyphs are taller than wide
const counts: Record<string, number> = {};
let n = 0;
const world = generateWorld(seed);
const t0 = performance.now();
for (let r = 0; r < rows; r++) {
  let line = "";
  for (let c = 0; c < cols; c++) {
    const x = Math.floor((c + 0.5) * step);
    const y = Math.floor((r + 0.5) * (WORLD_H / rows));
    const t = terrainOf(world, x, y);
    counts[t] = (counts[t] ?? 0) + 1;
    n++;
    line += GLYPH[t];
  }
  console.log(line);
}
console.log(`seed ${seed}: ${TERRAINS.map((t) => `${t} ${((100 * (counts[t] ?? 0)) / n).toFixed(0)}%`).join("  ")}  (${(performance.now() - t0).toFixed(0)} ms for ${n} samples)`);

// Full-resolution fields, not the downsample above: water kinds, stream density,
// exposed rock share and a height histogram, for judging the solved world itself.
const s = world.solved;
const cellCount = s.w * s.h;
let sea = 0, lake = 0, river = 0, land = 0, rock = 0, streams = 0;
const heightBand = new Map<number, number>();
for (let i = 0; i < cellCount; i++) {
  if (s.kind[i] === KIND.sea) sea++;
  else if (s.kind[i] === KIND.lake) lake++;
  else if (s.kind[i] === KIND.river) river++;
  else {
    land++;
    if (TERRAINS[s.terrain[i]] === "rock") rock++;
    if (s.flags[i] & FLAG_STREAM) streams++;
    const band = Math.floor(s.height[i] / 200) * 200;
    heightBand.set(band, (heightBand.get(band) ?? 0) + 1);
  }
}
console.log(`water kinds: sea ${(100 * sea / cellCount).toFixed(1)}% lake ${(100 * lake / cellCount).toFixed(1)}% river cells ${river}; stream cells ${streams}; rock share of land ${(100 * rock / land).toFixed(1)}%`);
console.log(`land height histogram (200 m bands): ${[...heightBand.entries()].sort((a, b) => a[0] - b[0]).map(([band, c]) => `${band}-${band + 200}m ${(100 * c / land).toFixed(1)}%`).join("  ")}`);

const t1 = performance.now();
const start = regionAt(world, world.start);
console.log(`start ${start.name} at lattice ${world.start}: forest ${(start.forest * 100).toFixed(0)}% water ${(start.frac.water * 100).toFixed(0)}% cells ${start.cells.length} spots ${start.spots.map((s) => `${s.id} ${s.km}`).join(", ")} neighbours ${start.neighbours.length}; start in ${(performance.now() - t1).toFixed(0)} ms`);
