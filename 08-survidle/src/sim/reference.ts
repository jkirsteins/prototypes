/**
 * The reference player: the set-up a competent player writes on day one,
 * run headless. It is the baseline's gate (reaches 1 December on four
 * seeds) and, later, the survivor loop's instrument. The list is ordered
 * as the tool chain is, because the runner never gathers a prerequisite on
 * its own: the knife before the drill, the buckets before the water keep
 * can be met, and the water keep at the top so it is served first.
 */
import type { World } from "../world/gen";
import { advance } from "./advance";
import { calendar } from "./calendar";
import { listItems, pile } from "./inventory";
import { TOOLS } from "./items";
import { newGame } from "./newgame";
import { addOrder } from "./orders";
import { regionState } from "./regionstate";
import type { DeathCause, GameState, IntentRequest, OrderKind } from "./types";

const keep = (task: IntentRequest["task"], qty: number, arg?: string, deliver: "leave" | "camp" = "camp"): { req: IntentRequest; kind: OrderKind } =>
  ({ req: { task, arg, until: { kind: "campHas", qty }, deliver, where: "nearest" }, kind: "keep" });
const job = (task: IntentRequest["task"], until: IntentRequest["until"], arg?: string, deliver: "leave" | "camp" = "camp"): { req: IntentRequest; kind: OrderKind } =>
  ({ req: { task, arg, until, deliver, where: "nearest" }, kind: "job" });

// A hunt keep needs a bow and a stock of arrows, or it blocks on "needs a bow"
// forever; both need the knife made above them (controller amendment to the
// brief, task-9-brief.md).
export const REFERENCE_ORDERS: { req: IntentRequest; kind: OrderKind }[] = [
  keep("fill", 4),
  job("stone", { kind: "campHas", qty: 8 }),
  keep("sticks", 20),
  job("bark", { kind: "campHas", qty: 12 }),
  job("craft", { kind: "campHas", qty: 6 }, "cordage"),
  keep("craft", 1, "knife"),
  keep("craft", 1, "fireDrill"),
  job("craft", { kind: "campHas", qty: 2 }, "barkBucket"),
  job("build", { kind: "once" }, "firePit"),
  keep("split", 40),
  keep("craft", 1, "fishingSpear"),
  keep("fish", 4, "any"),
  keep("craft", 1, "bow"),
  keep("craft", 10, "arrows"),
  keep("hunt", 6, "any"),
  keep("hang", 10),
  keep("craft", 1, "axe"),
  job("build", { kind: "once" }, "leanTo"),
  { req: { task: "chop", until: { kind: "forever" }, deliver: "camp", where: "nearest" }, kind: "grind" },
];

/** The reference seeds, and the day 1 December falls on from a 1 April start. */
export const REFERENCE_SEEDS = [17, 19, 42, 79];
export const DECEMBER_DAY = 245;
const CHECKPOINT_DAYS = [30, 90, DECEMBER_DAY];

export function setUpReference(seed: number): { state: GameState; world: World } {
  const g = newGame(seed);
  for (const o of REFERENCE_ORDERS) addOrder(g.state, g.world, o.req, o.kind);
  return g;
}

export interface ReferenceReport {
  seed: number;
  startRing: number;
  /** Day, kcal, water, warmth, health and camp stocks at each checkpoint reached. */
  checkpoints: { day: number; kcal: number; water: number; warmth: number; health: number; stocks: Record<string, number>; tools: string[] }[];
  outcome: { kind: "died"; day: number; cause: DeathCause } | { kind: "reached"; day: number };
  passed: boolean;
}

function checkpoint(state: GameState, world: World, day: number): ReferenceReport["checkpoints"][number] {
  const p = state.player;
  const camp = pile(state, regionState(state, world, p.region).campCell);
  const stocks: Record<string, number> = {};
  for (const { item, qty } of listItems(camp)) stocks[item] = Math.round(qty * 10) / 10;
  return {
    day, kcal: Math.round(p.kcal), water: Math.round(p.water * 10) / 10, warmth: Math.round(p.warmth), health: Math.round(p.health),
    stocks, tools: p.tools.map((t) => `${TOOLS[t.id].name} ${Math.round(t.durability)}`),
  };
}

/** Runs the set-up a day at a time for `days` days or until death, whichever is first. */
export function runReference(seed: number, days: number): ReferenceReport {
  const { state, world } = setUpReference(seed);
  const checkpoints: ReferenceReport["checkpoints"] = [];
  const seen = new Set<number>();
  for (let d = 1; d <= days && !state.dead; d++) {
    advance(state, world, 1440);
    const day = calendar(state.minute).day;
    for (const c of CHECKPOINT_DAYS) {
      if (day >= c && !seen.has(c)) {
        seen.add(c);
        checkpoints.push(checkpoint(state, world, day));
      }
    }
  }
  const day = calendar(state.dead ? state.dead.minute : state.minute).day;
  const outcome: ReferenceReport["outcome"] = state.dead ? { kind: "died", day, cause: state.dead.cause } : { kind: "reached", day };
  return { seed, startRing: world.startRing, checkpoints, outcome, passed: !state.dead && day >= DECEMBER_DAY };
}
