/**
 * The reference player: the set-up a competent player writes on day one,
 * run headless. It is the baseline's gate (alive and fed on
 * REFERENCE_TARGET_DAY, derived from the reserve and the burn band, on
 * four seeds, from scratch, in April) and, later, the survivor loop's
 * instrument. The runner never gathers a prerequisite on its own, so the
 * list orders every dependency before what needs it: water at the top,
 * where it waits on its own vessel; then everything a fire and a roof
 * need, in the order they need it, worked with the arrival axe alone;
 * then the knife and what it unlocks. The list is the wants; the player
 * script below gives each as the best kind the skill has earned, since a
 * from-scratch survivor has only once jobs until a skill reaches 3 and no
 * keeps for weeks.
 */
import type { World } from "../world/gen";
import { advance } from "./advance";
import { calendar, START_DOY } from "./calendar";
import { addItem, freshTool, listItems, pile, qty } from "./inventory";
import { FOODS, type FoodId, TOOLS } from "./items";
import { giveOrder, withinLadder } from "./ladder";
import { creditYield, type WeekAverage, weekBefore, YIELD_SOURCES } from "./ledger";
import { newGame, ARRIVAL_DRIED_MEAT_KG, START_KCAL } from "./newgame";
import { orderMet, ordersHere } from "./orders";
import { FAT_FULL } from "./player";
import { regionState } from "./regionstate";
import { APRIL, BURN, MIDSUMMER_DOY, SLEEP_HOURS, sourceBand, tableFor, verdict } from "./tables";
import type { DeathCause, GameState, IntentRequest, Order, OrderKind } from "./types";

const keep = (task: IntentRequest["task"], qty: number, arg?: string, deliver: "leave" | "camp" = "camp"): { req: IntentRequest; kind: OrderKind } =>
  ({ req: { task, arg, until: { kind: "campHas", qty }, deliver, where: "nearest" }, kind: "keep" });
const job = (task: IntentRequest["task"], until: IntentRequest["until"], arg?: string, deliver: "leave" | "camp" = "camp"): { req: IntentRequest; kind: OrderKind } =>
  ({ req: { task, arg, until, deliver, where: "nearest" }, kind: "job" });

/**
 * The runner never gathers a prerequisite on its own, so the list is
 * ordered as a competent day one is: water at the top, waiting for its
 * bucket; then the fire-and-roof chain, worked with the arrival axe alone
 * - stone for the ring, sticks, bark and cordage as raw stock, the fire
 * pit, the fire drill, the keep that lights the fire and relights it, one
 * tree felled, a day's firewood split from it, and the lean-to. Then the
 * knife and the snares, right after the lean-to: a competent day two sets
 * snares before spending hours at anything else (the knife is two stone,
 * a stick and a cordage, each snare a stick and two cordage, and five
 * snares where hares live are the beginner's whole small-game band for a
 * few minutes of work), but a roof over the fire outranks them, since
 * shelter from the cold is what keeps a beginner alive long enough to set
 * a snare at all. A knife and a bucket ahead of the lean-to cost two seeds
 * a cold death on days 4 and 5 when measured: a roof by the second night
 * is what the opening cannot spare. Then what the knife unlocks beyond
 * the snares. The scheduler is greedy top-down, so a competent player
 * ranks eating what is already caught above catching more of it: the cook
 * keeps sit above the fish keep, and the rack job and the dried-meat keep
 * sit above the hunt keep, right after the cook keeps - both block
 * harmlessly with nothing to cook or hang. The fish keep sits right after
 * the cook keeps so the spear is used the day it exists. Tools the
 * survivor holds are once jobs, since the first one made is taken up and
 * a keep would craft a second; the axe stays a keep because the arrival
 * axe wears out and the spare is the point. Auto-eat, auto-feed and
 * auto-drink stay on, as they are for every player. The felling grind,
 * needing the axe kept just above it, runs last and forever. Two kilos
 * of berries at camp sit with the cook keeps:
 * in season they are the cheapest kcal there is, and out of it the keep
 * blocks harmlessly on nothing ripe.
 */
export const REFERENCE_ORDERS: { req: IntentRequest; kind: OrderKind }[] = [
  keep("fill", 2),
  job("stone", { kind: "campHas", qty: 8 }),
  keep("sticks", 10),
  keep("bark", 12),
  keep("craft", 4, "cordage"),
  job("build", { kind: "once" }, "firePit"),
  job("craft", { kind: "once" }, "fireDrill"),
  keep("light", 1),
  keep("chop", 4),
  keep("split", 60),
  job("build", { kind: "once" }, "leanTo"),
  job("craft", { kind: "once" }, "knife"),
  keep("craft", 1, "snare"),
  job("build", { kind: "times", n: 5 }, "snare"),
  job("craft", { kind: "campHas", qty: 2 }, "barkBucket"),
  job("craft", { kind: "once" }, "fishingSpear"),
  keep("cook", 1, "fish"),
  keep("cook", 1),
  keep("fish", 1, "any"),
  keep("berries", 2),
  job("build", { kind: "once" }, "dryingRack"),
  keep("hang", 10),
  job("craft", { kind: "once" }, "bow"),
  keep("craft", 10, "arrows"),
  keep("hunt", 2, "any"),
  keep("craft", 1, "axe"),
  { req: { task: "chop", until: { kind: "forever" }, deliver: "camp", where: "nearest" }, kind: "grind" },
];

/** The reference seeds. */
export const REFERENCE_SEEDS = [17, 19, 42, 79];
/**
 * The April gate (spec 7.1): the day a beginner who eats the least the
 * tables allow and burns the most runs out of fat. Derived, so it moves
 * when the burn band, the reserve or the kit moves and not otherwise.
 */
export const REFERENCE_TARGET_DAY = Math.floor(
  (FAT_FULL + START_KCAL + ARRIVAL_DRIED_MEAT_KG * FOODS.driedMeat.kcalPerKg) / (BURN.day.hi - APRIL.rows.total!.beginner.lo),
);
/** The kitted camp's gate: a month, until C's trap moves it to December. */
export const KITTED_TARGET_DAY = 30;
/** The food clause: kcal at camp that counts as a beginner's day of food, the middle of the April band. */
export const FOOD_CLAUSE_KCAL = 500;
/** The day 1 December falls on from a 1 April start; kept as a late checkpoint, not a gate. */
export const DECEMBER_DAY = 245;

export type Gate = { kind: "day"; day: number } | { kind: "firstSnow" };

/** A spring start is measured on its target day; a start from July on is measured at the first snow (spec 7.3). */
export function gateFor(startDoy: number, kitted: boolean): Gate {
  if (startDoy >= MIDSUMMER_DOY) return { kind: "firstSnow" };
  return { kind: "day", day: kitted ? KITTED_TARGET_DAY : REFERENCE_TARGET_DAY };
}

/** kcal of food lying at this region's camp. */
export function campFoodKcal(state: GameState, world: World): number {
  const camp = pile(state, regionState(state, world, state.player.region).campCell);
  let kcal = 0;
  for (const f of Object.keys(FOODS) as FoodId[]) kcal += qty(camp, f) * FOODS[f].kcalPerKg;
  return kcal;
}

/** The food clause at a checkpoint: the stomach above zero, or a beginner's day of food at camp. */
export function fed(kcal: number, food: number): boolean {
  return kcal > 0 || food >= FOOD_CLAUSE_KCAL;
}

function checkpointDays(gate: Gate): number[] {
  return gate.kind === "day" ? [gate.day, 90, DECEMBER_DAY] : [90, DECEMBER_DAY];
}

/**
 * The gate's pass criterion: not dead on or before the target day. A run
 * that dies after it still passed, since it was alive when the target
 * day rolled over; the report says where it dies after that. `deathDay`
 * is null for a run still alive when it stopped.
 */
export function passesGate(deathDay: number | null, targetDay: number): boolean {
  return deathDay === null || deathDay > targetDay;
}

/**
 * The audit's kitted camp (spec 8, "Decisions confirmed with the author"): the
 * true arrival kit plus every tool and structure the from-scratch list spends
 * its first days building. A flag on the script, not a second gate - it asks
 * whether the seven fixes let an already-established camp hold, separately
 * from whether the from-scratch list can bootstrap one in time.
 */
export function kitOut(state: GameState, world: World): void {
  const p = state.player;
  const st = regionState(state, world, p.region);
  for (const id of ["knife", "fireDrill", "fishingSpear", "bow"] as const) p.tools.push(freshTool(id));
  // One bucket in hand, empty: the fill task needs a vessel in hand, judged
  // at the shore where the camp pile is out of reach (spec 2.2). The second
  // sits at camp as capacity, same as a from-scratch camp would build up.
  p.tools.push(freshTool("barkBucket"));
  addItem(p.pack, "arrow", 10);
  addItem(p.pack, "driedMeat", 5);
  creditYield(state, "kit", 5 * FOODS.driedMeat.kcalPerKg);
  const camp = pile(state, st.campCell);
  addItem(camp, "barkBucket", 1);
  addItem(camp, "firewood", 20);
  st.structures.firePit = true;
}

/** How often the player script looks at the list: the cost of playing by hand is the idle time between looks. */
export const OPENING_TICK_MINUTES = 60;

/**
 * The player script (idle curve spec, section 2.5): the reference list is
 * what a competent player wants, and this gives each want as the best
 * kind the skill has earned, ranked where the want sits. A stand-in that
 * drops off is given again when the want is unmet; a want given as its
 * own kind that drops off is a finished job and is never given twice, or
 * the knife would be made again. A keep given as a keep stays for good.
 * A `times` want's own probe reads `done`, which a fresh probe never
 * carries, so a once-job stand-in's units are banked in `completed` when
 * it drops off and fed back as the probe's `done` - otherwise a five-times
 * build never reads as met and keeps being given past its count.
 */
export class ReferencePlayer {
  /** Order id and, for a count-based stand-in, the units it stands for - per want index, for the orders still on the list. */
  private given = new Map<number, { id: number; units?: number }>();
  /** Whether the standing order for a want is its own kind (true) or a stand-in (false). */
  private trueKind = new Map<number, boolean>();
  private finished = new Set<number>();
  /** Units a want's dropped once/times stand-ins have completed so far, per want index. */
  private completed = new Map<number, number>();

  constructor(readonly wants: { req: IntentRequest; kind: OrderKind }[] = REFERENCE_ORDERS) {}

  tick(state: GameState, world: World): void {
    const list = ordersHere(state, world);
    for (const [i, g] of [...this.given]) {
      if (list.some((o) => o.id === g.id)) continue;
      if (this.trueKind.get(i)) this.finished.add(i);
      else if (g.units) this.completed.set(i, (this.completed.get(i) ?? 0) + g.units);
      this.given.delete(i);
      this.trueKind.delete(i);
    }
    for (let i = 0; i < this.wants.length; i++) {
      if (this.finished.has(i) || this.given.has(i)) continue;
      const w = this.wants[i];
      const probe: Order = { id: -1, kind: w.kind, req: w.req, done: this.completed.get(i) ?? 0, minutes: 0, skipped: "" };
      if (orderMet(state, world, probe, false)) continue;
      const best = withinLadder(state, w.req, w.kind);
      const standIn = best.kind !== w.kind || best.req.until.kind !== w.req.until.kind;
      const units = !standIn ? undefined : best.req.until.kind === "once" ? 1 : best.req.until.kind === "times" ? best.req.until.n : undefined;
      const banked = this.completed.get(i) ?? 0;
      // A times want reaching its rung mid-count must not restart at n: what
      // it already banked from once-job stand-ins comes off the top, or the
      // fresh order over-builds by however much those stand-ins covered.
      const req = !standIn && best.req.until.kind === "times" && banked > 0 ? { ...best.req, until: { kind: "times" as const, n: best.req.until.n - banked } } : best.req;
      let rank = 0;
      for (const j of this.given.keys()) if (j < i) rank++;
      const o = giveOrder(state, world, req, best.kind, rank);
      this.given.set(i, { id: o.id, units });
      this.trueKind.set(i, !standIn);
    }
  }
}

export function setUpReference(seed: number, kitted = false, startDoy = START_DOY): { state: GameState; world: World; player: ReferencePlayer } {
  const g = newGame(seed, startDoy);
  if (kitted) kitOut(g.state, g.world);
  return { ...g, player: new ReferencePlayer() };
}

/** Advances `minutes`, the player looking at the list every OPENING_TICK_MINUTES. */
export function stepReference(ref: { state: GameState; world: World; player: ReferencePlayer }, minutes: number): void {
  let left = minutes;
  while (left > 0 && !ref.state.dead) {
    ref.player.tick(ref.state, ref.world);
    const dt = Math.min(OPENING_TICK_MINUTES, left);
    advance(ref.state, ref.world, dt);
    left -= dt;
  }
}

export interface ReferenceReport {
  seed: number;
  startRing: number;
  /** Day, kcal, water, warmth, health, food, fed and camp stocks at each checkpoint reached, with the week before it. */
  checkpoints: {
    day: number;
    dayOfYear: number;
    kcal: number;
    water: number;
    warmth: number;
    health: number;
    food: number;
    fed: boolean;
    stocks: Record<string, number>;
    tools: string[];
    week: WeekAverage;
  }[];
  outcome: { kind: "died"; day: number; cause: DeathCause } | { kind: "reached"; day: number };
  passed: boolean;
  /** The gate this run was measured against (spec 7.3). */
  gate: Gate;
  /** The gate's day, resolved: the target day for a "day" gate, the day of first snow for a "firstSnow" gate, or null if snow never fell. */
  gateDay: number | null;
  /** The day the first snow fell, if it did within `days`. */
  firstSnowDay: number | null;
}

function checkpoint(state: GameState, world: World, day: number): ReferenceReport["checkpoints"][number] {
  const p = state.player;
  const camp = pile(state, regionState(state, world, p.region).campCell);
  const stocks: Record<string, number> = {};
  for (const { item, qty } of listItems(camp)) stocks[item] = Math.round(qty * 10) / 10;
  const food = campFoodKcal(state, world);
  return {
    day, dayOfYear: calendar(state.minute, state.startDoy).dayOfYear, kcal: Math.round(p.kcal), water: Math.round(p.water * 10) / 10, warmth: Math.round(p.warmth), health: Math.round(p.health),
    food: Math.round(food), fed: fed(p.kcal, food),
    stocks, tools: p.tools.map((t) => `${TOOLS[t.id].name} ${Math.round(t.durability)}`),
    week: weekBefore(state.ledger, day),
  };
}

const r0 = (n: number) => String(Math.round(n));

/**
 * The week before a checkpoint against the table for its date (spec 2.2):
 * yield a day per source with its band, intake and the net of the two,
 * burn by bucket, and the hours. Four lines, indented by the caller.
 */
export function weekLines(week: WeekAverage, dayOfYear: number): string[] {
  if (week.days === 0) return ["week: no full day yet"];
  const table = tableFor(dayOfYear);
  const yields = YIELD_SOURCES.map((s) => {
    const b = sourceBand(table, s, "beginner");
    return `${s} ${r0(week.yield[s])}${b ? ` (${verdict(week.yield[s], b)})` : ""}`;
  }).join(", ");
  const made = YIELD_SOURCES.reduce((a, s) => a + week.yield[s], 0);
  const net = made - week.eaten;
  const b = week.burn;
  const work = b.activity + b.walk;
  const total = b.base + work + b.cold + b.sick;
  const sleepH = week.sleepMin / 60;
  return [
    `week (${week.days} d): yield/day ${yields}; vs ${table.name}`,
    `eaten/day ${r0(week.eaten)}, net ${net >= 0 ? "+" : ""}${r0(net)}`,
    `burn/day ${r0(total)} (${verdict(total, BURN.day)}) = base ${r0(b.base)} (${verdict(b.base, BURN.base)}) + work ${r0(work)} (${verdict(work, BURN.work)}: activity ${r0(b.activity)}, walk ${r0(b.walk)}) + cold ${r0(b.cold)} (${verdict(b.cold, BURN.cold)}) + sick ${r0(b.sick)}`,
    `sleep/day ${sleepH.toFixed(1)} h (${verdict(sleepH, SLEEP_HOURS)}), work/day ${(week.workMin / 60).toFixed(1)} h`,
  ];
}

/** Runs the set-up a day at a time for `days` days or until death, whichever is first. */
export function runReference(seed: number, days: number, opts: { kitted?: boolean; startDoy?: number } = {}): ReferenceReport {
  const kitted = opts.kitted ?? false;
  const startDoy = opts.startDoy ?? START_DOY;
  const ref = setUpReference(seed, kitted, startDoy);
  const { state, world } = ref;
  const gate = gateFor(startDoy, kitted);
  // A start late enough to open with snow already lying has no first snow to
  // wait for, and reading the check on day 1 would call the ground the fall.
  const openedBare = state.weather.snowCm === 0;
  const checkpoints: ReferenceReport["checkpoints"] = [];
  const seen = new Set<number>();
  let firstSnowDay: number | null = null;
  for (let d = 1; d <= days && !state.dead; d++) {
    stepReference(ref, 1440);
    const day = calendar(state.minute, state.startDoy).day;
    if (gate.kind === "firstSnow" && openedBare && firstSnowDay === null && state.weather.snowCm > 0) {
      firstSnowDay = day;
      seen.add(day);
      checkpoints.push(checkpoint(state, world, day));
    }
    for (const c of checkpointDays(gate)) {
      if (day >= c && !seen.has(c)) {
        seen.add(c);
        checkpoints.push(checkpoint(state, world, day));
      }
    }
  }
  const day = calendar(state.dead ? state.dead.minute : state.minute, state.startDoy).day;
  // The last day always gets a checkpoint, so a run capped alive reports a week
  // as a death does; one landing exactly on a checkpoint day is already recorded
  // by the loop above.
  if (checkpoints[checkpoints.length - 1]?.day !== day) checkpoints.push(checkpoint(state, world, day));
  const outcome: ReferenceReport["outcome"] = state.dead ? { kind: "died", day, cause: state.dead.cause } : { kind: "reached", day };
  const gateDay = gate.kind === "day" ? gate.day : firstSnowDay;
  // The checkpoint taken as the gate day rolled over is the first at or past it: a
  // death after the gate comes later in the list, and a death before it fails passesGate.
  const at = gateDay === null ? undefined : checkpoints.find((c) => c.day >= gateDay);
  const passed = gateDay !== null && passesGate(state.dead ? day : null, gateDay) && at?.fed === true;
  return { seed, startRing: world.startRing, checkpoints, outcome, passed, gate, gateDay, firstSnowDay };
}
