/**
 * The world realism report: for each seed, solves (or reads the cached
 * solve) and prints the measures from the terrain-hydrology spec's
 * section 6 beside their real targets. Run: npm run terrain -- [seed]
 *
 * Stage timings from the original solve-budget spike stay behind --time:
 * npm run terrain -- --time [seed]
 */
import { installNodeWorldCache } from "../src/world/solvecache.node";
import { generateWorld, heightAt, terrainOf, waterKindOf } from "../src/world/gen";
import { coastKmOfCell } from "../src/world/classify";
import { leeScore } from "../src/sim/shelter";
import { FLAG_STREAM, KIND } from "../src/world/solve";
import { NO_FLOW, receiverOf } from "../src/world/hydro";
import { latitudeAt, TERRAINS, WORLD_H, WORLD_W } from "../src/world/terrain";

if (process.argv.includes("--time")) {
  const { coarseSize, coarseSurface, erode, ERODE_ITERATIONS, upsample } = await import("../src/world/erode");
  const { accumulate, flowDirections, priorityFlood } = await import("../src/world/hydro");
  const seedArg = process.argv.find((a) => /^\d+$/.test(a));
  const seed = Number(seedArg ?? 42);
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
  process.exit(0);
}

installNodeWorldCache();
const seeds = process.argv[2] ? [Number(process.argv[2])] : [42, 1, 7];
const pct = (a: number[], p: number) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor((s.length - 1) * p)]; };

for (const seed of seeds) {
  const t0 = performance.now();
  const world = generateWorld(seed);
  const s = world.solved;
  const W = WORLD_W, H = WORLD_H, n = W * H;
  console.log(`\n== seed ${seed} (world in ${((performance.now() - t0) / 1000).toFixed(1)} s)`);
  // Distance from land to running or standing water, by BFS from every water or stream cell.
  const d = new Int32Array(n).fill(-1);
  let q: number[] = [];
  for (let i = 0; i < n; i++) if (s.kind[i] !== KIND.land || (s.flags[i] & FLAG_STREAM)) { d[i] = 0; q.push(i); }
  while (q.length) { const nq: number[] = []; for (const c of q) { const x = c % W, y = (c - x) / W; for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue; const j = yy * W + xx; if (d[j] < 0) { d[j] = d[c] + 1; nq.push(j); } } } q = nq; }
  const dist: number[] = []; let land = 0, lake = 0, sea = 0, river = 0, streamCells = 0;
  for (let i = 0; i < n; i++) { if (s.kind[i] === KIND.land) { land++; dist.push(d[i] * 0.3); if (s.flags[i] & FLAG_STREAM) streamCells++; } else if (s.kind[i] === KIND.lake) lake++; else if (s.kind[i] === KIND.sea) sea++; else river++; }
  // Perennial channel density: total stream (plus river) length over land area, km per km2.
  // 0.5 to 1.5 is an estimate for perennial channels in Nordic terrain; total channel
  // density counting ephemeral runs higher, so this is a floor check, not the whole picture.
  const channelDensity = (streamCells * 0.3) / (land * 0.09);
  console.log(`land -> water km: p50 ${pct(dist, 0.5).toFixed(1)} p90 ${pct(dist, 0.9).toFixed(1)}   target p50 < 0.6, p90 < 2;  perennial channel density ${channelDensity.toFixed(2)} km/km2   target 0.5..1.5 (perennial only)`);
  console.log(`lake share of land+lake: ${(100 * lake / (land + lake)).toFixed(1)}%   target 5..10;  sea ${(100 * sea / n).toFixed(1)}% river cells ${river}`);
  // Largest catchments: discharge at sea-bound river mouths, converted back to km2 at inland runoff is not exact; report the top mouths in m3/s and the top catchments by cell count.
  const mouths: number[] = [];
  for (let i = 0; i < n; i++) if (s.kind[i] === KIND.river && s.flowDir[i] !== NO_FLOW && s.kind[receiverOf(i, s.flowDir[i], W)] === KIND.sea) mouths.push(s.discharge[i]);
  mouths.sort((a, b) => b - a);
  console.log(`largest river mouths m3/s: ${mouths.slice(0, 5).map((v) => v.toFixed(0)).join(" ")}   (Namsen 290, Ume 430, Lule 500)`);
  // Coastline: land cells with a western-sea 4-neighbour, times 0.3 km, over the straight coast length 667/0.9409.
  let coastEdges = 0;
  for (let i = 0; i < n; i++) { if (s.kind[i] === KIND.sea) continue; for (const j of [i - 1, i + 1, i - W, i + W]) { if (j < 0 || j >= n) continue; if (s.kind[j] === KIND.sea && coastKmOfCell(j % W, (j - j % W) / W, W, H) < 60) { coastEdges++; break; } } }
  console.log(`west coast length / straight: ${(coastEdges * 0.3 / (667 / 0.9409)).toFixed(1)}   target > 5`);
  // Exposed rock by band.
  const rock = { coast: [0, 0], steep: [0, 0], lowland: [0, 0] };
  for (let i = 0; i < n; i++) { if (s.kind[i] !== KIND.land) continue; const x = i % W, y = (i - x) / W; const t = TERRAINS[s.terrain[i]]; if (t === "fell") continue; const coast = coastKmOfCell(x, y, W, H); let slope = 0; if (s.flowDir[i] !== NO_FLOW) slope = (s.height[i] - s.height[receiverOf(i, s.flowDir[i], W)]) / 300; const band = coast < 1 ? rock.coast : slope > 0.36 ? rock.steep : rock.lowland; band[1]++; if (t === "rock") band[0]++; }
  console.log(`rock share: coast ${(100 * rock.coast[0] / Math.max(1, rock.coast[1])).toFixed(0)}% (30) steep ${(100 * rock.steep[0] / Math.max(1, rock.steep[1])).toFixed(0)}% (25) lowland ${(100 * rock.lowland[0] / Math.max(1, rock.lowland[1])).toFixed(1)}% (3..5)`);
  // Bog by latitude band and class shares per 100 m band.
  const bogBand = new Map<number, [number, number]>();
  for (let i = 0; i < n; i++) { if (s.kind[i] !== KIND.land) continue; const y = (i - i % W) / W; const band = Math.floor(latitudeAt(y, H)); const b = bogBand.get(band) ?? [0, 0]; b[1]++; if (TERRAINS[s.terrain[i]] === "bog") b[0]++; bogBand.set(band, b); }
  console.log(`bog by degree: ${[...bogBand.entries()].sort((a, b) => a[0] - b[0]).map(([k, [b, t]]) => `${k}N ${(100 * b / t).toFixed(0)}%`).join(" ")}   target rising 10 -> 20+`);
  const slopeBy = new Map<string, [number, number]>();
  for (let i = 0; i < n; i++) { if (s.kind[i] !== KIND.land) continue; const t = TERRAINS[s.terrain[i]]; let slope = 0; if (s.flowDir[i] !== NO_FLOW) slope = (s.height[i] - s.height[receiverOf(i, s.flowDir[i], W)]) / 300; const b = slopeBy.get(t) ?? [0, 0]; b[0] += slope; b[1]++; slopeBy.set(t, b); }
  console.log(`mean slope by class: ${[...slopeBy.entries()].map(([t, [sum, c]]) => `${t} ${(100 * sum / c).toFixed(1)}%`).join("  ")}`);
  // Valley bearings in the mountain belt: direction from a river cell to its receiver, binned to 8 winds.
  const winds = new Array(8).fill(0);
  for (let i = 0; i < n; i++) { if (s.kind[i] !== KIND.river || s.flowDir[i] === NO_FLOW) continue; const x = i % W, y = (i - x) / W; const c = coastKmOfCell(x, y, W, H); if (c < 0 || c > 150) continue; winds[s.flowDir[i]]++; }
  console.log(`river flow winds E SE S SW W NW N NE: ${winds.join(" ")}   (expected W and SW to dominate on the Atlantic side)`);
  // Lee share: land the wind is half blocked from by the ground and wood
  // upwind of it. No target beyond the shape of the thing - a landscape of
  // valleys and woods shelters tens of percent of its ground, and a number in
  // the low single digits would mean the rule had gone extinct again.
  const leeShare = (windBearingDeg: number) => {
    let lee = 0, cells = 0;
    for (let i = 0; i < n; i++) {
      if (s.kind[i] !== KIND.land) continue;
      cells++;
      if (leeScore(world, i, windBearingDeg).score >= 0.5) lee++;
    }
    return 100 * lee / Math.max(1, cells);
  };
  const leeWinds: [string, number][] = [["west", 270], ["north", 0], ["north-west", 315], ["south-west", 225]];
  console.log(`lee share of land: ${leeWinds.map(([name, deg]) => `${name} ${leeShare(deg).toFixed(1)}%`).join(" ")}   (no target; tens of percent is a sheltered landscape)`);
  const heights = [...s.height].filter((_, i) => s.kind[i] === KIND.land);
  console.log(`land height m: p50 ${pct(heights, 0.5)} p90 ${pct(heights, 0.9)} max ${pct(heights, 1)}`);
  console.log(`start ${world.startCell} at row ${Math.floor(world.startCell / W)} (${latitudeAt(Math.floor(world.startCell / W), H).toFixed(2)} N), height ${heightAt(world, world.startCell % W, Math.floor(world.startCell / W))} m, terrain ${terrainOf(world, world.startCell % W, Math.floor(world.startCell / W))}, shore ${waterKindOf(world, world.startCell + 1) ?? waterKindOf(world, world.startCell - 1) ?? "?"}`);
}
