/**
 * The horizon checks: how long a stocked camp holds at each stage of the
 * ladder, on the reference seeds. Run: npm run horizon, or
 * npx vite-node scripts/horizon.ts 17 19 42 79 30 (seeds, then max days).
 * A stage outside its band is a finding, not a failure: the bands are
 * provisional until the calibration pass, so the exit code is always 0.
 *
 * --start=<doy>, anywhere in the args, opens each stage's camp on that day
 * of year instead of 1 April: 200 is 20 July, 235 is 24 August.
 */
import { HORIZON_STAGES, runStage } from "../src/sim/horizon";
import { REFERENCE_SEEDS, weekLines } from "../src/sim/reference";

const rawArgs = process.argv.slice(2);
const startArg = rawArgs.find((a) => a.startsWith("--start="));
const startDoy = startArg ? Number(startArg.slice("--start=".length)) : undefined;
if (startArg && !(Number.isInteger(startDoy) && startDoy! >= 0 && startDoy! < 365)) {
  console.error("--start takes a day of year, 0 to 364: 90 is 1 April, 200 is 20 July, 235 is 24 August");
  process.exit(2);
}
const args = rawArgs.filter((a) => !a.startsWith("--")).map(Number).filter((n) => Number.isFinite(n));
const maxDays = args.length >= 2 ? args[args.length - 1] : 30;
const seeds = args.length >= 2 ? args.slice(0, -1) : args.length === 1 ? args : REFERENCE_SEEDS;

console.log("stage                              seed  held      cause                 band   verdict");
for (const stage of HORIZON_STAGES) {
  for (const seed of seeds) {
    const r = runStage(seed, stage, maxDays, startDoy);
    const held = r.capped ? `${r.days}+ d` : `${r.days} d`;
    const cause = r.cause ?? "alive";
    const verdict = r.inBand ? "in band" : r.days < stage.band[0] ? "under" : "over";
    console.log(`${stage.label.padEnd(34)} ${String(seed).padEnd(5)} ${held.padEnd(9)} ${cause.padEnd(21)} ${`${stage.band[0]}-${stage.band[1]}`.padEnd(6)} ${verdict}`);
    if (r.week) for (const line of weekLines(r.week, r.dayOfYear)) console.log(`    ${line}`);
  }
}
console.log("(provisional until the calibration pass)");
