/**
 * The reference player's verdict: one block per seed, then passed N of M.
 * Run: npm run reference, or npx vite-node scripts/reference.ts 17 19 42 79 250
 * (seeds, then days). Exit code 1 when any seed fails.
 */
import { DECEMBER_DAY, REFERENCE_SEEDS, runReference } from "../src/sim/reference";

const args = process.argv.slice(2).map(Number).filter((n) => Number.isFinite(n));
const days = args.length >= 2 ? args[args.length - 1] : 250;
const seeds = args.length >= 2 ? args.slice(0, -1) : args.length === 1 ? args : REFERENCE_SEEDS;

let passed = 0;
for (const seed of seeds) {
  const t0 = performance.now();
  const r = runReference(seed, days);
  console.log(`seed ${seed}: start found at ring ${r.startRing}`);
  for (const c of r.checkpoints) {
    const stocks = Object.entries(c.stocks).map(([k, v]) => `${k} ${v}`).join(", ") || "nothing";
    console.log(`  day ${c.day}: kcal ${c.kcal}, water ${c.water} l, warmth ${c.warmth}, health ${c.health}; camp: ${stocks}; tools: ${c.tools.join(", ") || "none"}`);
  }
  if (r.outcome.kind === "died") console.log(`  died day ${r.outcome.day}, ${r.outcome.cause}`);
  else console.log(`  reached ${r.outcome.day >= DECEMBER_DAY ? "1 December" : `day ${r.outcome.day}`}, day ${r.outcome.day}`);
  console.log(`  (${((performance.now() - t0) / 1000).toFixed(1)} s)`);
  if (r.passed) passed++;
}
console.log(`passed ${passed} of ${seeds.length}`);
process.exit(passed === seeds.length ? 0 : 1);
