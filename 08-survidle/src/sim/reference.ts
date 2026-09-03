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
import { addItem, freshTool, listItems, pile } from "./inventory";
import { TOOLS } from "./items";
import { newGame } from "./newgame";
import { addOrder } from "./orders";
import { regionState } from "./regionstate";
import type { DeathCause, GameState, IntentRequest, OrderKind } from "./types";

const keep = (task: IntentRequest["task"], qty: number, arg?: string, deliver: "leave" | "camp" = "camp"): { req: IntentRequest; kind: OrderKind } =>
  ({ req: { task, arg, until: { kind: "campHas", qty }, deliver, where: "nearest" }, kind: "keep" });
const job = (task: IntentRequest["task"], until: IntentRequest["until"], arg?: string, deliver: "leave" | "camp" = "camp"): { req: IntentRequest; kind: OrderKind } =>
  ({ req: { task, arg, until, deliver, where: "nearest" }, kind: "job" });

export const REFERENCE_ORDERS: { req: IntentRequest; kind: OrderKind }[] = [
  keep("fill", 2),
  job("stone", { kind: "campHas", qty: 8 }),
  keep("sticks", 20),
  // Bark and cordage are consumed the whole run through, by every "keep camp
  // at 1" tool taken up and every spare that replaces it: a one-time job
  // starves the chain once its batch is spent and never resumes (evidence in
  // task-9-report.md). A keep re-fires below half its target, the way sticks
  // and firewood already do.
  keep("bark", 20),
  keep("craft", 8, "cordage"),
  keep("craft", 1, "knife"),
  keep("craft", 1, "fireDrill"),
  job("craft", { kind: "campHas", qty: 2 }, "barkBucket"),
  job("build", { kind: "once" }, "firePit"),
  // Split needs logs already at hand, and only the grind at the very end of
  // this list fells trees; ranked below fishingSpear, fish and hunt, that
  // grind never gets a turn while those slower keeps stay live, so split
  // sits on "no logs here" and no fire is ever lit (evidence in
  // task-9-report.md). A one-time job seeded logs once but split then ran
  // them out again with nothing ranked to refill them; a keep here supplies
  // logs the whole run through, the way the bark keep feeds cordage, while
  // staying below fill/stone/sticks/bark/cordage/knife/fireDrill/buckets so
  // it never itself displaces the tool chain.
  keep("chop", 4),
  keep("split", 40),
  keep("craft", 1, "fishingSpear"),
  // A cast is an hour and often comes up empty ("nothing bites" in the log far
  // more than a catch does), so a 4 kg target can run live for most of a day
  // straight, holding every order below it off the schedule entirely - the
  // same trap the water keep was in before its target came down (evidence
  // in task-9-report.md).
  keep("fish", 1, "any"),
  // Raw catches are never eaten: autoEat's AUTO_EAT_ORDER wants berries, cooked
  // fish or meat, dried meat, or fat, never a raw kg sitting in the pile. Without
  // a cook keep the fish and hunt keeps below fill camp with food nothing ever
  // touches, and the reference player starves beside a full larder (evidence in
  // task-9-report.md).
  keep("cook", 3, "fish"),
  keep("craft", 1, "bow"),
  keep("craft", 10, "arrows"),
  keep("hunt", 2, "any"),
  keep("cook", 3),
  job("build", { kind: "once" }, "dryingRack"),
  keep("hang", 10),
  keep("craft", 1, "axe"),
  job("build", { kind: "once" }, "leanTo"),
  { req: { task: "chop", until: { kind: "forever" }, deliver: "camp", where: "nearest" }, kind: "grind" },
];

/** The reference seeds, and the day 1 December falls on from a 1 April start. */
export const REFERENCE_SEEDS = [17, 19, 42, 79];
export const DECEMBER_DAY = 245;
const CHECKPOINT_DAYS = [30, 90, DECEMBER_DAY];

/**
 * The audit's kitted camp (spec 8, "Decisions confirmed with the author"): the
 * true arrival kit plus every tool and structure the from-scratch list spends
 * its first days building. A flag on the script, not a second gate - it asks
 * whether the seven fixes let an already-established camp hold, separately
 * from whether the from-scratch list can bootstrap one in time.
 */
function kitOut(state: GameState, world: World): void {
  const p = state.player;
  const st = regionState(state, world, p.region);
  for (const id of ["knife", "fireDrill", "fishingSpear", "bow"] as const) p.tools.push(freshTool(id));
  addItem(p.pack, "arrow", 10);
  addItem(p.pack, "driedMeat", 5);
  const camp = pile(state, st.campCell);
  addItem(camp, "barkBucket", 2);
  addItem(camp, "firewood", 20);
  st.structures.firePit = true;
}

export function setUpReference(seed: number, kitted = false): { state: GameState; world: World } {
  const g = newGame(seed);
  if (kitted) kitOut(g.state, g.world);
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
export function runReference(seed: number, days: number, kitted = false): ReferenceReport {
  const { state, world } = setUpReference(seed, kitted);
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
