import { level, levelMinutes, RUNG_LEVEL } from "../src/sim/skills";

/**
 * The idle curve spec's pacing tables are derived from the code's level
 * curve, never typed. This test regenerates them and asserts the spec
 * contains each block verbatim, so a curve that moves fails here until the
 * spec is regenerated (`npx vite-node scripts/curve-table.ts` prints
 * the blocks). Every number that says when a tier arrives comes from
 * these two assumptions and `level()`:
 */
/** Hours at work a game day; the calibration pass measured 9.6 at the April gate and the working day rests the body after ten. */
export const WORK_HOURS_PER_DAY = 10;
/** The share of the working day a survivor puts into its main skill; the rest spreads over the other five. */
export const MAIN_SKILL_SHARE = 0.4;
/** One game minute is one real second, so a game day is 24 real minutes. */
const REAL_MINUTES_PER_GAME_DAY = 1440 / 60;

const hoursForLevel = (l: number) => levelMinutes(l) / 60;
const levelAtHours = (h: number) => level(h * 60);
const mainHoursPerDay = WORK_HOURS_PER_DAY * MAIN_SKILL_SHARE;
const sideHoursPerDay = (WORK_HOURS_PER_DAY * (1 - MAIN_SKILL_SHARE)) / 5;
const daysFor = (hours: number, perDay: number) => Math.ceil(hours / perDay);
const realTime = (gameDays: number) => {
  const min = gameDays * REAL_MINUTES_PER_GAME_DAY;
  return min < 90 ? `${Math.round(min)} min` : `${Math.round(min / 60)} h`;
};

/** Section 2.1: what each rung costs, in hours, in game days at the main-skill share, and in real time. */
export function rungTable(): string {
  const rows = [
    `| rung | level | practice hours | game days at ${mainHoursPerDay} h a day | real time | genre analogue |`,
    "|---|---|---|---|---|---|",
    "| once jobs | 1 | 0 | 0 | 0 | the opening clicks |",
  ];
  const analogue = { job: "first builder, first session", grind: "dumb automation, first day", keep: "the manager, the second survivor" };
  const name = { job: "jobs with a count or a target", grind: "grinds", keep: "keeps" };
  for (const kind of ["job", "grind", "keep"] as const) {
    const l = RUNG_LEVEL[kind];
    const h = hoursForLevel(l);
    const d = daysFor(h, mainHoursPerDay);
    rows.push(`| ${name[kind]} | ${l} | ${h} | ${d} | ${realTime(d)} | ${analogue[kind]} |`);
  }
  return rows.join("\n");
}

/** Section 5.1: the level one life reaches in its main skill, and in a side skill, at each survivor milestone. */
export const MILESTONES: [string, number][] = [["20 days", 20], ["100 days", 100], ["245 days", 245], ["a year", 365], ["two years", 730]];

export function wallTable(): string {
  const rows = [
    "| survivor lives | hours in the main skill | level reached | hours in a side skill | level reached |",
    "|---|---|---|---|---|",
  ];
  for (const [name, days] of MILESTONES) {
    const main = Math.round(days * mainHoursPerDay);
    const side = Math.round(days * sideHoursPerDay);
    rows.push(`| ${name} | ${main} | ${levelAtHours(main)} | ${side} | ${levelAtHours(side)} |`);
  }
  return rows.join("\n");
}

/** Section 5.4: what each tier costs and which survivor's main skill reaches it, from the survivor ladder's day bands. */
export const TIERS = [3, 5, 10, 15, 20, 30];
const LADDER_DAYS: [string, number][] = [["1", 20], ["2", 150], ["3", 245], ["4 to 6", 365]];

export function tierTable(): string {
  const rows = ["| tier | practice hours | game days in the main skill | reached by survivor | in a side skill by day |", "|---|---|---|---|---|"];
  for (const t of TIERS) {
    const h = hoursForLevel(t);
    const d = daysFor(h, mainHoursPerDay);
    const row = LADDER_DAYS.find(([, band]) => d <= band);
    const side = daysFor(h, sideHoursPerDay);
    rows.push(`| ${t} | ${h} | ${d} | ${row ? row[0] : "a second year or the tree"} | ${side <= 730 ? side : "never in two years"} |`);
  }
  return rows.join("\n");
}

/** Section 5.3: what the rate ladder as sized reaches, main skill, one doubling per survivor, capped at four. */
export function rateReach(): number[] {
  const rates = [1, 2, 4, 4];
  return LADDER_DAYS.map(([, days], i) => levelAtHours(days * mainHoursPerDay * rates[i]));
}

// Run directly (`npx vite-node scripts/curve-table.ts`) it prints the blocks; under vitest it is only imported.
if (!process.env.VITEST) {
  console.log(`${rungTable()}\n\n${wallTable()}\n\n${tierTable()}\n\nrate reach: ${rateReach().join(", ")}`);
}
