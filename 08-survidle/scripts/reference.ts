/**
 * The reference player's verdict: one block per seed, then passed N of M.
 * Run: npm run reference, or npx vite-node scripts/reference.ts 17 19 42 79 250
 * (seeds, then days). Exit code 1 when any seed fails.
 *
 * --kitted, anywhere in the args, also runs the audit's kitted camp (spec 8):
 * the arrival kit plus the from-scratch list's own tools and structures,
 * already in hand. It prints as a second block per seed and a second verdict
 * line, and never affects the exit code - the from-scratch run is still the
 * gate. It answers a different question (does an established camp hold?)
 * from the from-scratch run (can the list bootstrap one in time?), so it is
 * a flag, not a second gate.
 */
import { DECEMBER_DAY, REFERENCE_SEEDS, runReference } from "../src/sim/reference";

const rawArgs = process.argv.slice(2);
const kitted = rawArgs.includes("--kitted");
const args = rawArgs.map(Number).filter((n) => Number.isFinite(n));
const days = args.length >= 2 ? args[args.length - 1] : 250;
const seeds = args.length >= 2 ? args.slice(0, -1) : args.length === 1 ? args : REFERENCE_SEEDS;

function runBlock(seed: number, kit: boolean): boolean {
  const t0 = performance.now();
  const r = runReference(seed, days, kit);
  console.log(`seed ${seed}${kit ? " (kitted)" : ""}: start found at ring ${r.startRing}`);
  for (const c of r.checkpoints) {
    const stocks = Object.entries(c.stocks).map(([k, v]) => `${k} ${v}`).join(", ") || "nothing";
    console.log(`  day ${c.day}: kcal ${c.kcal}, water ${c.water} l, warmth ${c.warmth}, health ${c.health}; camp: ${stocks}; tools: ${c.tools.join(", ") || "none"}`);
  }
  if (r.outcome.kind === "died") console.log(`  died day ${r.outcome.day}, ${r.outcome.cause}`);
  else console.log(`  reached ${r.outcome.day >= DECEMBER_DAY ? "1 December" : `day ${r.outcome.day}`}, day ${r.outcome.day}`);
  console.log(`  (${((performance.now() - t0) / 1000).toFixed(1)} s)`);
  return r.passed;
}

let passed = 0;
for (const seed of seeds) if (runBlock(seed, false)) passed++;
console.log(`passed ${passed} of ${seeds.length}`);

if (kitted) {
  let kitPassed = 0;
  for (const seed of seeds) if (runBlock(seed, true)) kitPassed++;
  console.log(`kitted: passed ${kitPassed} of ${seeds.length}`);
}

process.exit(passed === seeds.length ? 0 : 1);
