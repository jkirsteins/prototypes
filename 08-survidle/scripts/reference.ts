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
 *
 * --heir, anywhere in the args, runs a lineage of up to six lives per seed
 * (the day cap raised to 366 if given lower) after the from-scratch (and,
 * if given, kitted) blocks: the reference run to death, then for each heir
 * the gap, the landing near the old camp, the walk home before it gives an
 * order, and a fresh reference run - stopping early at the first life that
 * reaches the day cap. It prints each life's landing, what it found at the
 * old camp, the day it got there, the surplus days (first hang, first
 * large-game kill), the life's checkpoints and pass line, then a trend
 * line for the seed, the seed's days ("52, 94, 172, 366"), a
 * "trend gate: N of M seeds" line - whether each life in the lineage died
 * at or past the one before it - and a "lineage gate: N of M seeds reached
 * a year within six lives" line. Like --kitted, it is a diagnostic and
 * never touches the exit code - the from-scratch run from scratch is still
 * the gate.
 */
import { calendar, fmtDate } from "../src/sim/calendar";
import { fmtWorldDate } from "../src/sim/epitaph";
import { REFERENCE_SEEDS, type ReferenceReport, runLineage, runReference, weekLines } from "../src/sim/reference";

const rawArgs = process.argv.slice(2);
const kitted = rawArgs.includes("--kitted");
const heir = rawArgs.includes("--heir");
const startArg = rawArgs.find((a) => a.startsWith("--start="));
const startDoy = startArg ? Number(startArg.slice("--start=".length)) : undefined;
if (startArg && !(Number.isInteger(startDoy) && startDoy! >= 0 && startDoy! < 365)) {
  console.error("--start takes a day of year, 0 to 364: 90 is 1 April, 200 is 20 July, 235 is 24 August");
  process.exit(2);
}
const args = rawArgs.filter((a) => !a.startsWith("--")).map(Number).filter((n) => Number.isFinite(n));
const days = args.length >= 2 ? args[args.length - 1] : 250;
const seeds = args.length >= 2 ? args.slice(0, -1) : args.length === 1 ? args : REFERENCE_SEEDS;

function outcomeText(r: ReferenceReport): string {
  return r.outcome.kind === "died" ? `died day ${r.outcome.day}, ${r.outcome.cause}` : `reached day ${r.outcome.day}`;
}

function printCheckpoints(r: ReferenceReport): void {
  for (const c of r.checkpoints) {
    const stocks = Object.entries(c.stocks).map(([k, v]) => `${k} ${v}`).join(", ") || "nothing";
    console.log(`  day ${c.day}: kcal ${c.kcal}, water ${c.water} l, warmth ${c.warmth}, health ${c.health}, food at camp ${c.food} kcal, fed: ${c.fed ? "yes" : "no"}; camp: ${stocks}; tools: ${c.tools.join(", ") || "none"}`);
    for (const line of weekLines(c.week, c.dayOfYear)) console.log(`    ${line}`);
  }
}

function passLine(r: ReferenceReport): string {
  const gateText = r.gate.kind === "day" ? `day ${r.gate.day}` : r.firstSnowDay === null ? "first snow (none yet)" : `first snow, day ${r.firstSnowDay}`;
  const verdict = r.passed ? `alive and fed at ${gateText}, ` : `gate ${gateText}: failed, `;
  return `${verdict}${outcomeText(r)}`;
}

function runBlock(seed: number, kit: boolean): boolean {
  const t0 = performance.now();
  const r = runReference(seed, days, { kitted: kit, startDoy });
  const from = startDoy === undefined ? "" : ` (from ${fmtDate(calendar(0, startDoy))})`;
  console.log(`seed ${seed}${kit ? " (kitted)" : ""}${from}: start found at ring ${r.startRing}`);
  printCheckpoints(r);
  console.log(`  ${passLine(r)}`);
  if (r.unexploited) console.log(`  ${r.unexploited}`);
  console.log(`  (${((performance.now() - t0) / 1000).toFixed(1)} s)`);
  return r.passed;
}

let passed = 0;
for (const seed of seeds) if (runBlock(seed, false)) passed++;
console.log(`passed ${passed} of ${seeds.length}`);

if (kitted) {
  for (const seed of seeds) runBlock(seed, true);
}

if (heir) {
  let trend = 0;
  let reached = 0;
  for (const seed of seeds) {
    const l = runLineage(seed, Math.max(days, 366), 6);
    console.log(`seed ${seed} (lineage):`);
    let lastDeath: number | null = null;
    let climbs = true;
    for (const life of l.lives) {
      const r = life.report;
      const landed = `${fmtWorldDate(life.landed)}${life.gapDays ? `, ${life.gapDays} days after the death` : ""}`;
      console.log(` life ${life.index}: landed ${landed}`);
      if (life.found) {
        const f = life.found;
        const trap = f.trapKg === null ? "no trap" : `trap with ${f.trapKg.toFixed(1)} kg`;
        console.log(`  found: ${f.structures.join(", ") || "nothing standing"}; ${f.snares} snares; ${trap}; ${f.campFoodKcal} kcal, ${f.campFirewoodKg} kg of firewood and ${f.logs} logs at camp, ${f.kmToOldCamp} km away`);
        console.log(life.reachedCampDay === null ? "  never reached the old camp" : `  reached the old camp on day ${life.reachedCampDay}`);
      }
      console.log(`  surplus: first hang ${r.surplus.hang === null ? "never" : `day ${r.surplus.hang}`}, first large game ${r.surplus.largeGame === null ? "never" : `day ${r.surplus.largeGame}`}`);
      printCheckpoints(r);
      console.log(`  ${passLine(r)}`);
  if (r.unexploited) console.log(`  ${r.unexploited}`);
      if (r.outcome.kind === "died") {
        if (lastDeath !== null && r.outcome.day < lastDeath) climbs = false;
        lastDeath = r.outcome.day;
      }
    }
    if (climbs && l.lives.length > 1) trend++;
    console.log(` trend: ${climbs ? "each life at or past the one before" : "a life died sooner than the one before"}`);
    console.log(` days: ${l.lives.map((x) => x.report.outcome.kind === "died" ? x.report.outcome.day : `${x.report.outcome.day}+`).join(", ")}`);
    if (l.lives.some((x) => x.report.outcome.kind === "reached")) reached++;
  }
  console.log(`trend gate: ${trend} of ${seeds.length} seeds (gate is 3 of 4)`);
  console.log(`lineage gate: ${reached} of ${seeds.length} seeds reached a year within six lives`);
}

process.exit(passed === seeds.length ? 0 : 1);
