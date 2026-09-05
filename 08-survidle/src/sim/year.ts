/**
 * The year probe (year loop spec, section 1): the best survivor the sim can
 * hold, run headless for a year. A kitted camp with every producer, all six
 * skills at one level, the reference list. It is a diagnostic and not a
 * claim about players: the survivor ladder puts a full year at rows 4 to
 * 6, reached by a lineage. If this survivor cannot live a year, no lineage
 * can, and that is what the gate reads.
 */
import type { World } from "../world/gen";
import { calendar, START_DOY } from "./calendar";
import { addItem, listItems, pile, qty } from "./inventory";
import { FOODS, type FoodId } from "./items";
import { setSkillLevel } from "./horizon";
import { type DayLedger, emptyBurn, type WeekAverage, weekBefore } from "./ledger";
import { current } from "./record";
import { type ReferenceReport, type ReferencePlayer, setUpReference, stepReference } from "./reference";
import { regionState } from "./regionstate";
import { SKILL_IDS } from "./skills";
import type { GameState, Species } from "./types";

/** The species whose first kill marks the large-game surplus: the tables' large-game row. */
export const LARGE_GAME: Species[] = ["deer", "reindeer", "elk"];

/**
 * 1 December: the winter gate's start, a fortnight before the dark and a
 * month before the cold snap. Day of year is 0-based (1 April is 90, the
 * calendar's own START_DOY), so 1 December - 31 + 28 + 31 + 30 + 31 + 30 +
 * 31 + 31 + 30 + 31 + 30 days into the year - is 334, not 335.
 */
export const WINTER_START_DOY = 334;
/** Days from 1 December to 1 March. */
export const WINTER_DAYS = 90;
/** The winter stock (spec 1.3): a hut winter is about 3 tonnes of firewood, of which 400 kg split and 150 logs to split. */
export const WINTER_STOCK = { driedMeatKg: 80, firewoodKg: 400, logs: 150 };

export interface MonthLine {
  /** The month that just began, 1 to 12, and the day of the run it began on. */
  month: number;
  day: number;
  /** Averages over the days since the last line. */
  eatenPerDay: number;
  burnPerDay: number;
  stock: { foodKcal: number; foodByKind: Record<string, number>; firewoodKg: number; logs: number };
}

export interface YearReport {
  seed: number;
  level: number;
  kitted: boolean;
  startDoy: number;
  stocked: typeof WINTER_STOCK | null;
  months: MonthLine[];
  /** The day of the first hang and of the first large-game kill; null when never. */
  surplus: { hang: number | null; largeGame: number | null };
  outcome: ReferenceReport["outcome"];
  lastWeek: WeekAverage;
  lastDayOfYear: number;
}

export interface YearOptions {
  level?: number;
  fresh?: boolean;
  startDoy?: number;
  days?: number;
}

/** Averages of eaten and burn over the ledger rows in [from, to). */
function between(ledger: DayLedger[], from: number, to: number): { eaten: number; burn: number } {
  const rows = ledger.filter((d) => d.day >= from && d.day < to);
  if (!rows.length) return { eaten: 0, burn: 0 };
  let eaten = 0;
  let burn = 0;
  for (const r of rows) {
    eaten += r.eaten;
    const b = r.burn ?? emptyBurn();
    burn += b.base + b.activity + b.walk + b.cold + b.sick;
  }
  return { eaten: eaten / rows.length, burn: burn / rows.length };
}

function stockAt(state: GameState, world: World): MonthLine["stock"] {
  const st = regionState(state, world, state.player.region);
  const camp = pile(state, st.campCell);
  const foodByKind: Record<string, number> = {};
  let foodKcal = 0;
  for (const { item, qty: n } of listItems(camp)) {
    const f = FOODS[item as FoodId];
    if (!f) continue;
    foodByKind[item] = Math.round(n * f.kcalPerKg);
    foodKcal += n * f.kcalPerKg;
  }
  return { foodKcal: Math.round(foodKcal), foodByKind, firewoodKg: Math.round(qty(camp, "firewood")), logs: Math.round(qty(camp, "log")) };
}

/** Runs one life a day at a time, writing a month line on the first of each month and the surplus days as they happen. */
function runLife(ref: { state: GameState; world: World; player: ReferencePlayer }, days: number): Pick<YearReport, "months" | "surplus" | "outcome" | "lastWeek" | "lastDayOfYear"> {
  const { state, world } = ref;
  const months: MonthLine[] = [];
  const surplus: YearReport["surplus"] = { hang: null, largeGame: null };
  let lastLineDay = 1;
  for (let d = 1; d <= days && !state.dead; d++) {
    stepReference(ref, 1440);
    const cal = calendar(state.minute, state.startDoy);
    const st = regionState(state, world, state.player.region);
    if (surplus.hang === null && st.rack.kg > 0) surplus.hang = cal.day;
    if (surplus.largeGame === null && current(state).events.some((e) => e.kind === "firstKill" && LARGE_GAME.includes(e.species))) surplus.largeGame = cal.day;
    if (cal.dayOfMonth === 1 && cal.day > lastLineDay) {
      const avg = between(state.ledger, lastLineDay, cal.day);
      months.push({ month: cal.month, day: cal.day, eatenPerDay: Math.round(avg.eaten), burnPerDay: Math.round(avg.burn), stock: stockAt(state, world) });
      lastLineDay = cal.day;
    }
  }
  const day = calendar(state.dead ? state.dead.minute : state.minute, state.startDoy).day;
  const outcome: ReferenceReport["outcome"] = state.dead ? { kind: "died", day, cause: state.dead.cause } : { kind: "reached", day };
  return { months, surplus, outcome, lastWeek: weekBefore(state.ledger, day), lastDayOfYear: calendar(state.minute, state.startDoy).dayOfYear };
}

export function runYear(seed: number, opts: YearOptions = {}): YearReport {
  const fresh = opts.fresh ?? false;
  const level = fresh ? 1 : (opts.level ?? 20);
  const startDoy = opts.startDoy ?? START_DOY;
  const days = opts.days ?? 365;
  const ref = setUpReference(seed, !fresh, startDoy);
  if (!fresh) for (const s of SKILL_IDS) setSkillLevel(ref.state, s, level);
  const life = runLife(ref, days);
  return { seed, level, kitted: !fresh, startDoy, stocked: null, ...life };
}

/** The winter gate (spec 1.3): a kitted level-20 camp with the winter stock, 1 December to 1 March. */
export function runWinter(seed: number, days = WINTER_DAYS): YearReport {
  const ref = setUpReference(seed, true, WINTER_START_DOY);
  const { state, world } = ref;
  for (const s of SKILL_IDS) setSkillLevel(state, s, 20);
  const st = regionState(state, world, state.player.region);
  const camp = pile(state, st.campCell);
  addItem(camp, "driedMeat", WINTER_STOCK.driedMeatKg);
  addItem(camp, "firewood", WINTER_STOCK.firewoodKg);
  addItem(camp, "log", WINTER_STOCK.logs);
  const life = runLife(ref, days);
  return { seed, level: 20, kitted: true, startDoy: WINTER_START_DOY, stocked: { ...WINTER_STOCK }, ...life };
}
