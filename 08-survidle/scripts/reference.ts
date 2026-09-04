/**
 * The reference player's verdict: one block per seed, then passed N of M.
 * Run: npm run reference, or npx vite-node scripts/reference.ts 17 19 42 79 250
 * (seeds, then days). Exit code 1 when any seed fails. The gate is REFERENCE_TARGET_DAY.
 *
 * --kitted, anywhere in the args, also runs the audit's kitted camp (spec 8):
 * the arrival kit plus the from-scratch list's own tools and structures,
 * already in hand. It prints as a second block per seed, with no pass line
 * of its own and no effect on the exit code - the from-scratch run is still
 * the gate. It answers a different question (does an established camp
 * hold?) from the from-scratch run (can the list bootstrap one in time?),
 * so it stays a diagnostic, not a second gate (spec 13).
 */
import { REFERENCE_SEEDS, REFERENCE_TARGET_DAY, runReference, weekLines } from "../src/sim/reference";

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
    for (const line of weekLines(c.week, c.dayOfYear)) console.log(`    ${line}`);
  }
  const outcome = r.outcome.kind === "died" ? `died day ${r.outcome.day}, ${r.outcome.cause}` : `reached day ${r.outcome.day}`;
  // The kitted block is a diagnostic (spec 13): it prints the outcome with no pass line of its own.
  const passLine = !kit && r.passed ? `alive on day ${REFERENCE_TARGET_DAY}, ` : "";
  console.log(`  ${passLine}${outcome}`);
  console.log(`  (${((performance.now() - t0) / 1000).toFixed(1)} s)`);
  return r.passed;
}

let passed = 0;
for (const seed of seeds) if (runBlock(seed, false)) passed++;
console.log(`passed ${passed} of ${seeds.length}`);

if (kitted) {
  for (const seed of seeds) runBlock(seed, true);
}

process.exit(passed === seeds.length ? 0 : 1);
