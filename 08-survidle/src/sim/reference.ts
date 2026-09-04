/**
 * The reference player: the set-up a competent player writes on day one,
 * run headless. It is the baseline's gate (reaches 1 December on four
 * seeds) and, later, the survivor loop's instrument. The list is ordered
 * food-first: the water keep at the top, then whatever a first cooked meal
 * needs, in the order it needs it - the runner never gathers a prerequisite
 * on its own, so the knife comes before the drill and the vessel before the
 * water keep can ever do anything with it.
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
 * Ordered food-first: the water keep stays first, then everything the
 * first cooked meal needs, in the order it needs it - stone, sticks, bark
 * and cordage as raw stock; the knife and fire drill as the tools that turn
 * stock into everything else; a fire pit to hold the fire; a small chop keep
 * feeding a small firewood keep so the fire is fed without either
 * outranking the food chain; the fishing spear; a small fish keep; and the
 * two cook keeps that turn a catch into something autoEat's AUTO_EAT_ORDER
 * will actually touch - a raw catch left in the pack or the pile is never
 * eaten on its own. Every keep in this stretch is sized small on purpose:
 * an uncapped water, fish or hunt keep runs live for most of a day at its
 * original target, holding every order below it off the schedule.
 *
 * Snares come right after: cheap protein once cordage and the knife exist,
 * needing nothing the fish chain does not already have. Crafting a snare
 * and setting it are two different tasks (craft yields the item, build
 * places it on the heath), so both are here.
 *
 * Everything after is the second-order kit - the bow and arrows for a
 * second meat source, the drying rack and dried-meat keep for a winter
 * reserve, the axe spare, the lean-to - and the felling grind is last, as
 * it was: the always-available fallback that soaks up whatever time
 * nothing above it needs.
 */
export const REFERENCE_ORDERS: { req: IntentRequest; kind: OrderKind }[] = [
  keep("fill", 2),
  job("stone", { kind: "campHas", qty: 8 }),
  keep("sticks", 10),
  keep("bark", 12),
  keep("craft", 4, "cordage"),
  job("craft", { kind: "once" }, "knife"),
  job("craft", { kind: "once" }, "fireDrill"),
  // A vessel, not "the second-order kit": with the shore iced (April, every
  // seed so far) the fill keep cannot even open an ice hole without one
  // ("needs a vessel" - check("fill") - the ice-hole step is inside the
  // fill task, gated on holds > 0), and thirstyStep's own direct-drink path
  // needs an already-open hole too. Ranked after cook instead, the water
  // keep sits on "needs a vessel" the whole run and starves for thirst by
  // day 3. Water stays first in rank; what it depends on has to be this
  // early too.
  job("craft", { kind: "campHas", qty: 2 }, "barkBucket"),
  job("build", { kind: "once" }, "firePit"),
  keep("chop", 3),
  keep("split", 40),
  job("craft", { kind: "once" }, "fishingSpear"),
  keep("fish", 1, "any"),
  keep("cook", 1, "fish"),
  keep("cook", 1),
  keep("craft", 1, "snare"),
  job("build", { kind: "times", n: 5 }, "snare"),
  job("craft", { kind: "once" }, "bow"),
  keep("craft", 10, "arrows"),
  keep("hunt", 2, "any"),
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
