/**
 * The year probe: npm run year, or npx vite-node scripts/year.ts 17 19 42 79.
 * A kitted camp with every producer, all skills at --level=N (default 20), the
 * reference list, from 1 April for a year. --fresh runs the arrival kit at
 * level 1 instead. --winter runs the stocked December camp to 1 March.
 * --start=<doy> opens on that day of year. Gates: alive on 1 April on 4
 * seeds (--level), alive on 1 March on 4 seeds (--winter). On demand, not
 * part of npm test. The exit code is 0 either way: a red gate is a reading
 * for the roadmap, not a failure of the script.
 *
 * Each seed's block prints a kills line (large game read against the
 * expert large-game band, spec 1.4) and, on its December, January and
 * February month lines, a deep-cold verdict beside the burn (spec 1.1) -
 * both diagnostics, gating nothing.
 *
 * --without=<source> (fat and carbohydrate design, section 7) shuts one
 * source of the without probe for the run: marrow, oilyFish, roe, eggs,
 * roots, bark, sap or seaweed, comma-separated for more than one. No
 * source's removal should take the year gate from its reading to 0 of 4.
 */
import { calendar, fmtDate, monthName } from "../src/sim/calendar";
import { DISABLED, PROBE_SOURCES, type ProbeSource } from "../src/sim/probe";
import { REFERENCE_SEEDS, weekLines } from "../src/sim/reference";
import { APRIL, BURN, verdict } from "../src/sim/tables";
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
const withoutSources: ProbeSource[] = flag("without") ? (flag("without")!.split(",") as ProbeSource[]) : [];
for (const s of withoutSources) {
  if (!PROBE_SOURCES.includes(s)) {
    console.error(`--without takes one of: ${PROBE_SOURCES.join(", ")}`);
    process.exit(2);
  }
  DISABLED.add(s);
}
const seeds = rawArgs.filter((a) => !a.startsWith("--")).map(Number).filter((n) => Number.isFinite(n));
const runSeeds = seeds.length ? seeds : REFERENCE_SEEDS;

function print(r: YearReport): void {
  const from = fmtDate(calendar(0, r.startDoy));
  const who = r.stocked ? `stocked winter camp (${r.stocked.driedMeatKg} kg dried meat, ${r.stocked.fatKg} kg fat, ${r.stocked.firewoodKg} kg firewood, ${r.stocked.logs} logs)` : r.kitted ? `kitted camp, skills ${r.level}` : "fresh survivor, arrival kit";
  const without = withoutSources.length ? `, without ${withoutSources.join(", ")}` : "";
  console.log(`seed ${r.seed} (${who}, from ${from}${without}):`);
  for (const m of r.months) {
    const food = Object.entries(m.stock.foodByKind).map(([k, v]) => `${k} ${v}`).join(", ") || "none";
    // December, January and February (deep-cold spec 1.1): the winter month lines carry the verdict, gating nothing.
    const deepCold = m.month === 11 || m.month === 0 || m.month === 1 ? `; deep-cold band ${verdict(m.burnPerDay, BURN.deepCold)}` : "";
    console.log(`  1 ${monthName(m.month)} (day ${m.day}): eaten ${m.eatenPerDay}/day, burned ${m.burnPerDay}/day; at camp ${m.stock.foodKcal} kcal (${food}), ${m.stock.firewoodKg} kg firewood, ${m.stock.logs} logs, snow ${m.snowCm} cm${deepCold}`);
  }
  console.log(`  surplus: first hang ${r.surplus.hang === null ? "never" : `day ${r.surplus.hang}`}, first large game ${r.surplus.largeGame === null ? "never" : `day ${r.surplus.largeGame}`}`);
  const daysRun = r.outcome.day;
  console.log(`  kills: ${Object.entries(r.kills).map(([s, n]) => `${s} ${n}`).join(", ") || "none"}; large game ${Math.round(r.killsKcal / daysRun)} kcal a day (${verdict(r.killsKcal / daysRun, APRIL.rows.largeGame!.experienced)})`);
  for (const line of weekLines(r.lastWeek, r.lastDayOfYear)) console.log(`    ${line}`);
  console.log(`  ${r.outcome.kind === "died" ? `died day ${r.outcome.day}, ${r.outcome.cause}` : `alive at day ${r.outcome.day}`}`);
  if (r.unexploited) console.log(`  ${r.unexploited}`);
}

let passed = 0;
for (const seed of runSeeds) {
  const r = winter ? runWinter(seed) : runYear(seed, { level, fresh, startDoy });
  print(r);
  if (r.outcome.kind === "reached") passed++;
}
console.log(`${winter ? "winter gate (alive on 1 March)" : "year gate (alive after a year)"}: passed ${passed} of ${runSeeds.length}`);
