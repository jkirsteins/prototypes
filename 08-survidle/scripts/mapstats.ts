/** Prints terrain shares and an ASCII dump of a few seeds, for tuning the generator. Run: npx vite-node scripts/mapstats.ts */
import { generateWorld, MAP_W, TERRAINS } from "../src/world/gen";

const GLYPH: Record<string, string> = { water: "~", fell: "^", rock: "n", bog: "\"", spruce: "A", pine: "T", birch: "Y", meadow: "." };
for (const seed of [42, 1, 7, 123]) {
  const w = generateWorld(seed);
  const counts: Record<string, number> = {};
  for (const c of w.cells) counts[c.terrain] = (counts[c.terrain] ?? 0) + 1;
  const line = TERRAINS.map((t) => `${t} ${((100 * (counts[t] ?? 0)) / w.cells.length).toFixed(0)}%`).join("  ");
  console.log(`seed ${seed}: ${line}; regions ${w.regions.length}, start ${w.regions[w.start].name} forest ${(w.regions[w.start].forest * 100).toFixed(0)}% rock ${(w.regions[w.start].rock * 100).toFixed(0)}%`);
  if (seed === 42) {
    for (let y = 0; y < w.h; y++) console.log(w.cells.slice(y * MAP_W, (y + 1) * MAP_W).map((c) => GLYPH[c.terrain]).join(""));
  }
}
