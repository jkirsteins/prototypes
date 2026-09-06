/**
 * The year probe: npm run year, or npx vite-node scripts/year.ts 17 19 42 79.
 * A kitted camp with every producer, all skills at --level=N (default 20), the
 * reference list, from 1 April for a year. --fresh runs the arrival kit at
 * level 1 instead. --winter runs the stocked December camp to 1 March.
 * --start=<doy> opens on that day of year. Gates: alive on 1 April on 4
 * seeds (--level), alive on 1 March on 4 seeds (--winter). On demand, not
 * part of npm test. The exit code is 0 either way: a red gate is a reading
 * for the roadmap, not a failure of the script.
 */
import { calendar, fmtDate, monthName } from "../src/sim/calendar";
import { REFERENCE_SEEDS, weekLines } from "../src/sim/reference";
import { runWinter, runYear, type YearReport } from "../src/sim/year";

const rawArgs = process.argv.slice(2);
const flag = (name: string) => rawArgs.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const fresh = rawArgs.includes("--fresh");
const winter = rawArgs.includes("--winter");
const level = flag("level") ? Number(flag("level")) : undefined;
const startDoy = flag("start") ? Number(flag("start")) : undefined;
if (level !== undefined && !(Number.isInteger(level) && level >= 1 && level <= 50)) {
  console.error("--level takes a whole number, 1 to 50");
  process.exit(2);
}
if (startDoy !== undefined && !(Number.isInteger(startDoy) && startDoy >= 0 && startDoy < 365)) {
  console.error("--start takes a day of year, 0 to 364: 90 is 1 April, 334 is 1 December");
  process.exit(2);
}
const seeds = rawArgs.filter((a) => !a.startsWith("--")).map(Number).filter((n) => Number.isFinite(n));
const runSeeds = seeds.length ? seeds : REFERENCE_SEEDS;

function print(r: YearReport): void {
  const from = fmtDate(calendar(0, r.startDoy));
  const who = r.stocked ? `stocked winter camp (${r.stocked.driedMeatKg} kg dried meat, ${r.stocked.firewoodKg} kg firewood, ${r.stocked.logs} logs)` : r.kitted ? `kitted camp, skills ${r.level}` : "fresh survivor, arrival kit";
  console.log(`seed ${r.seed} (${who}, from ${from}):`);
  for (const m of r.months) {
    const food = Object.entries(m.stock.foodByKind).map(([k, v]) => `${k} ${v}`).join(", ") || "none";
    console.log(`  1 ${monthName(m.month)} (day ${m.day}): eaten ${m.eatenPerDay}/day, burned ${m.burnPerDay}/day; at camp ${m.stock.foodKcal} kcal (${food}), ${m.stock.firewoodKg} kg firewood, ${m.stock.logs} logs, snow ${m.snowCm} cm`);
  }
  console.log(`  surplus: first hang ${r.surplus.hang === null ? "never" : `day ${r.surplus.hang}`}, first large game ${r.surplus.largeGame === null ? "never" : `day ${r.surplus.largeGame}`}`);
  for (const line of weekLines(r.lastWeek, r.lastDayOfYear)) console.log(`    ${line}`);
  console.log(`  ${r.outcome.kind === "died" ? `died day ${r.outcome.day}, ${r.outcome.cause}` : `alive at day ${r.outcome.day}`}`);
}

let passed = 0;
for (const seed of runSeeds) {
  const r = winter ? runWinter(seed) : runYear(seed, { level, fresh, startDoy });
  print(r);
  if (r.outcome.kind === "reached") passed++;
}
console.log(`${winter ? "winter gate (alive on 1 March)" : "year gate (alive after a year)"}: passed ${passed} of ${runSeeds.length}`);
