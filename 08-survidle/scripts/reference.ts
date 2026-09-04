/**
 * The reference player's verdict: one block per seed, then passed N of M.
 * Run: npm run reference, or npx vite-node scripts/reference.ts 17 19 42 79 250
 * (seeds, then days). Exit code 1 when any seed fails. The gate is gateFor's
 * result for the run's start and kit: REFERENCE_TARGET_DAY in spring from
 * scratch, KITTED_TARGET_DAY in spring kitted, first snow from July on.
 *
 * --kitted, anywhere in the args, also runs the audit's kitted camp (spec 8):
 * the arrival kit plus the from-scratch list's own tools and structures,
 * already in hand. It prints as a second block per seed, with its own pass
 * line at its own gate (30 days) but no effect on the exit code - the
 * from-scratch run is still the gate. It answers a different question (does
 * an already-established camp hold?) from the from-scratch run (can the
 * list bootstrap one in time?), so it stays a diagnostic, not a second gate
 * (spec 13).
 *
 * --start=<doy>, anywhere in the args, opens the run on that day of year
 * instead of 1 April: 200 is 20 July, 235 is 24 August. It is a harness aid
 * for reading the tables against a summer or autumn start, not a second
 * gate; a start from July on (spec 7.3) is measured at the first snow.
 * That day is the morning the check ran, the day after the fall, and a
 * start that opens with snow already lying has no first snow to report.
 */
import { calendar, fmtDate } from "../src/sim/calendar";
import { REFERENCE_SEEDS, runReference, weekLines } from "../src/sim/reference";

const rawArgs = process.argv.slice(2);
const kitted = rawArgs.includes("--kitted");
const startArg = rawArgs.find((a) => a.startsWith("--start="));
const startDoy = startArg ? Number(startArg.slice("--start=".length)) : undefined;
if (startArg && !(Number.isInteger(startDoy) && startDoy! >= 0 && startDoy! < 365)) {
  console.error("--start takes a day of year, 0 to 364: 90 is 1 April, 200 is 20 July, 235 is 24 August");
  process.exit(2);
}
const args = rawArgs.filter((a) => !a.startsWith("--")).map(Number).filter((n) => Number.isFinite(n));
const days = args.length >= 2 ? args[args.length - 1] : 250;
const seeds = args.length >= 2 ? args.slice(0, -1) : args.length === 1 ? args : REFERENCE_SEEDS;

function runBlock(seed: number, kit: boolean): boolean {
  const t0 = performance.now();
  const r = runReference(seed, days, { kitted: kit, startDoy });
  const from = startDoy === undefined ? "" : ` (from ${fmtDate(calendar(0, startDoy))})`;
  console.log(`seed ${seed}${kit ? " (kitted)" : ""}${from}: start found at ring ${r.startRing}`);
  for (const c of r.checkpoints) {
    const stocks = Object.entries(c.stocks).map(([k, v]) => `${k} ${v}`).join(", ") || "nothing";
    console.log(`  day ${c.day}: kcal ${c.kcal}, water ${c.water} l, warmth ${c.warmth}, health ${c.health}, food at camp ${c.food} kcal, fed: ${c.fed ? "yes" : "no"}; camp: ${stocks}; tools: ${c.tools.join(", ") || "none"}`);
    for (const line of weekLines(c.week, c.dayOfYear)) console.log(`    ${line}`);
  }
  const outcome = r.outcome.kind === "died" ? `died day ${r.outcome.day}, ${r.outcome.cause}` : `reached day ${r.outcome.day}`;
  const gateText = r.gate.kind === "day" ? `day ${r.gate.day}` : r.firstSnowDay === null ? "first snow (none yet)" : `first snow, day ${r.firstSnowDay}`;
  const passLine = r.passed ? `alive and fed at ${gateText}, ` : `gate ${gateText}: failed, `;
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
