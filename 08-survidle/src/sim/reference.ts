/**
 * The reference player: the set-up a competent player writes on day one,
 * run headless. It is the baseline's gate (reaches 1 December on four
 * seeds) and, later, the survivor loop's instrument. The runner never
 * gathers a prerequisite on its own, so the list orders every dependency
 * before what needs it: water at the top, where it waits on its own
 * vessel; then everything a fire and a roof need, in the order they need
 * it, worked with the arrival axe alone; then the knife and what it
 * unlocks.
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

/**
 * The runner never gathers a prerequisite on its own, so the list is
 * ordered as a competent day one is: water at the top, where it waits for
 * its bucket; then everything a fire and a roof need, in dependency order,
 * with the arrival axe - stone, sticks, bark and cordage as raw stock; the
 * fire pit; the fire drill (needing no knife); the keep that lights the
 * fire and relights it; two trees split into firewood to feed it; and the
 * lean-to. Then the knife and what it unlocks come before the drill and
 * the vessel before the water keep can ever do anything with it. The
 * scheduler is greedy top-down, so a competent player ranks eating what is
 * already caught above catching more of it: the cook keeps sit above the
 * fish keep, and the rack job and the dried-meat keep sit above the hunt
 * keep, right after the cook keeps - both block harmlessly with nothing to
 * cook or hang. Tools the survivor holds are once jobs, since the first one
 * made is taken up and a keep would craft a second; the axe stays a keep
 * because the arrival axe wears out and the spare is the point. Auto-eat,
 * auto-feed and auto-drink stay on, as they are for every player.
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
  keep("chop", 3),
  keep("split", 40),
  job("build", { kind: "once" }, "leanTo"),
  job("craft", { kind: "once" }, "knife"),
  job("craft", { kind: "campHas", qty: 2 }, "barkBucket"),
  job("craft", { kind: "once" }, "fishingSpear"),
  keep("cook", 1, "fish"),
  keep("cook", 1),
  job("build", { kind: "once" }, "dryingRack"),
  keep("hang", 10),
  keep("fish", 1, "any"),
  keep("craft", 1, "snare"),
  job("build", { kind: "times", n: 5 }, "snare"),
  job("craft", { kind: "once" }, "bow"),
  keep("craft", 10, "arrows"),
  keep("hunt", 2, "any"),
  keep("craft", 1, "axe"),
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
  // One bucket in hand, empty: the fill task needs a vessel in hand, judged
  // at the shore where the camp pile is out of reach (spec 2.2). The second
  // sits at camp as capacity, same as a from-scratch camp would build up.
  p.tools.push(freshTool("barkBucket"));
  addItem(p.pack, "arrow", 10);
  addItem(p.pack, "driedMeat", 5);
  const camp = pile(state, st.campCell);
  addItem(camp, "barkBucket", 1);
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
