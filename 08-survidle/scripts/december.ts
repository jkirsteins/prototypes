/**
 * The December probe: npm run december, or npx vite-node scripts/december.ts 17 42.
 * Thirty days of the stocked December camp per seed, stepped a minute at a
 * time, reading what the sleep model does with the shortest days of the year:
 * hours asleep a day, hours of work by light and by dark with the dark morning
 * split from the dark evening, the median hour the body falls asleep and wakes,
 * and how many sleeps begin in daylight. --days=N runs another span,
 * --level=N another skill level.
 *
 * The night is what the sleep design was written for, so it has a probe of its
 * own: no other script prints work hours against the sun. On demand, not part
 * of npm test; it takes about a minute. The exit code is always 0, since every
 * line is a reading rather than a gate.
 */
import { calendar, fmtClock } from "../src/sim/calendar";
import { setSkillLevel } from "../src/sim/horizon";
import { addItem, pile } from "../src/sim/inventory";
import { regionState } from "../src/sim/regionstate";
import { OPENING_TICK_MINUTES, REFERENCE_SEEDS, setUpReference, WINTER_STOCK } from "../src/sim/reference";
import { SKILL_IDS } from "../src/sim/skills";
import type { TaskId } from "../src/sim/types";
import { WINTER_START_DOY } from "../src/sim/year";

/** Awake hours that are not work, the same set the ledger counts as idle. */
const IDLE = new Set<TaskId>(["rest", "wait", "sleep", "night"]);

const rawArgs = process.argv.slice(2);
const flag = (name: string) => rawArgs.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const days = flag("days") ? Number(flag("days")) : 30;
const level = flag("level") ? Number(flag("level")) : 20;
if (!(Number.isInteger(days) && days >= 1 && days <= 365)) {
  console.error("--days takes a whole number, 1 to 365");
  process.exit(2);
}
if (!(Number.isInteger(level) && level >= 1 && level <= 50)) {
  console.error("--level takes a whole number, 1 to 50");
  process.exit(2);
}
const seeds = rawArgs.filter((a) => !a.startsWith("--")).map(Number).filter((n) => Number.isFinite(n));
const runSeeds = seeds.length ? seeds : REFERENCE_SEEDS;

/** The middle reading of a list, or NaN when it is empty. */
function median(xs: number[]): number {
  return xs.length ? [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] : Number.NaN;
}

/**
 * Bedtimes straddle midnight, so they are read on a clock cut at noon: an
 * evening hour and a small-hours one are then neighbours rather than a day
 * apart, and their middle is a real bedtime instead of lunchtime.
 */
function medianClockHour(hours: number[]): number {
  return median(hours.map((h) => (h < 12 ? h + 24 : h))) % 24;
}

// The advance import is deferred so the argument checks above can exit first.
const { advance } = await import("../src/sim/advance");

for (const seed of runSeeds) {
  const ref = setUpReference(seed, true, WINTER_START_DOY);
  const { state, world } = ref;
  for (const s of SKILL_IDS) setSkillLevel(state, s, level);
  const camp = pile(state, regionState(state, world, state.player.region).campCell);
  addItem(camp, "driedMeat", WINTER_STOCK.driedMeatKg);
  addItem(camp, "firewood", WINTER_STOCK.firewoodKg);
  addItem(camp, "log", WINTER_STOCK.logs);

  let light = 0;
  let morning = 0;
  let evening = 0;
  let sleep = 0;
  let lived = 0;
  let wasSleeping = false;
  let byDay = 0;
  const bed: number[] = [];
  const woke: number[] = [];
  for (let m = 0; m < days * 1440 && !state.dead; m++) {
    if (state.minute % OPENING_TICK_MINUTES === 0) ref.player.tick(state, world);
    const cal = calendar(state.minute, state.startDoy);
    const task = state.task?.id;
    if (task && !IDLE.has(task)) {
      if (!cal.isNight) light++;
      else if (cal.hour < cal.sunrise) morning++;
      else evening++;
    }
    const sleeping = task === "sleep" || task === "night";
    if (sleeping) sleep++;
    if (sleeping && !wasSleeping) {
      bed.push(cal.hour);
      if (!cal.isNight) byDay++;
    }
    if (!sleeping && wasSleeping) woke.push(cal.hour);
    wasSleeping = sleeping;
    advance(state, world, 1);
    lived = m + 1;
  }
  const d = Math.max(1, lived / 1440);
  const h = (minutes: number) => (minutes / d / 60).toFixed(1);
  console.log(
    `seed ${seed}: ${(lived / 1440).toFixed(0)} days, sleep ${h(sleep)} h/day, work ${h(light + morning + evening)} h/day`
    + ` (light ${h(light)}, dark morning ${h(morning)}, dark evening ${h(evening)}),`
    + ` median asleep ${fmtClock(medianClockHour(bed))}, median awake ${fmtClock(median(woke))},`
    + ` sleeps ${bed.length} of which ${byDay} begun by day${state.dead ? `, died ${state.dead.cause}` : ""}`,
  );
}
