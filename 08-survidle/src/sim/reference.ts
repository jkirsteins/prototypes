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
import { CELL_KM } from "../units";
import { cellAt } from "../world/cells";
import { regionAt, spotOf, type World } from "../world/gen";
import { advance } from "./advance";
import { calendar, START_DOY, type Calendar } from "./calendar";
import { addItem, AXES, axeInHand, freshTool, listItems, pile, qty } from "./inventory";
import { FOODS, type FoodId, RECIPES, TOOLS } from "./items";
import { shoreFish } from "./knowledge";
import { beginAgain, land, oldCampRegion } from "./landing";
import { giveOrder, withinLadder } from "./ladder";
import { creditYield, type WeekAverage, weekBefore, YIELD_SOURCES } from "./ledger";
import { newGame, ARRIVAL_DRIED_MEAT_KG, START_KCAL } from "./newgame";
import { orderMet, ordersHere, removeOrder } from "./orders";
import { FAT_FULL } from "./player";
import { medianPerson } from "./person";
import { current } from "./record";
import { regionState } from "./regionstate";
import { RECOMMENDED, skillLevel } from "./skills";
import { LARGE_GAME } from "./species";
import { APRIL, BURN, coldBand, MIDSUMMER_DOY, SLEEP_HOURS, sourceBand, tableFor, verdict } from "./tables";
import { startTask } from "./tasks";
import { ICE_SHORE_CM } from "./water";
import type { DeathCause, GameState, IntentRequest, Inventory, LifeRecord, Order, OrderKind, RecipeId, WorldDate } from "./types";

const keep = (task: IntentRequest["task"], qty: number, arg?: string, deliver: "leave" | "camp" = "camp"): { req: IntentRequest; kind: OrderKind } =>
  ({ req: { task, arg, until: { kind: "campHas", qty }, deliver, where: "nearest" }, kind: "keep" });
const job = (task: IntentRequest["task"], until: IntentRequest["until"], arg?: string, deliver: "leave" | "camp" = "camp"): { req: IntentRequest; kind: OrderKind } =>
  ({ req: { task, arg, until, deliver, where: "nearest" }, kind: "job" });

/**
 * The runner never gathers a prerequisite on its own, so the list is
 * ordered as a competent day one is: water at the top, waiting for its
 * bucket; then the fire-and-roof chain, worked with the arrival axe alone
 * - stone for the ring, sticks, bark and cordage as raw stock (cordage
 * kept to eight, since arrows, snares and the bucket all draw on it), the
 * fire pit, the fire drill, the keep that lights the fire and relights it,
 * one tree felled, a day's firewood split from it, and the lean-to. Then the
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
 * keeps sit above the fish keep, and the rack job sits above the hunt-any
 * keep, right after the cook keeps - it blocks harmlessly with nothing yet
 * caught to dry. The trap follows the spear: the shore is read the day the
 * spear exists, the basket made and set, and from then on the fish keep's
 * own trips to the shore bring the trap's catch home, since a trap's fish
 * come out when you arrive at its cell as hares do at the snares - no
 * empty keep, and no trip made for the trap alone, which is what cost the
 * first month when the list had one. The basket is carried, not stocked:
 * the craft job leaves it in the pack rather than walking it to camp
 * first, so the trap can be set on the way to the shore. The hut and the
 * trough sit below the small-game hunt keep and above the surplus loop,
 * because the first month cannot afford their hours: that part of the
 * list is reached only when everything above it is met or blocked. Every
 * tool is a keep of one at camp: the first one made is taken up, a keep
 * then crafts a second, and the second is the point, since the arrival
 * tools wear out and a survivor at the shore with a spear in the camp
 * pile takes it up on the way out. The basket trap is the one craft that
 * is not, since it is set and not held. Stone is wanted twice for the
 * same reason and in two kinds. The opening keeps its once job for eight,
 * because it has to be met on day one: the fire pit needs six stones and
 * the knife two, and a keep at level 1 is given as a stand-in that has to
 * be given again, which happens only once camp is under half the target -
 * four stone, where the fire pit alone wants six. The restock is the keep,
 * far down beside the axe it feeds, where topping up under four is what a
 * restock should do: arrows take three stone per five and a stone axe
 * three, and the once job alone ran out and left every year seed with no
 * arrows, no axe and a felling grind for company. Auto-eat, auto-feed
 * and auto-drink stay on, as they are for every player. Two kilos of
 * berries at camp sit with the cook keeps: in season they are the
 * cheapest kcal there is, and out of it the keep blocks harmlessly on
 * nothing ripe. Once food, the roof and water are running, the sticks and
 * bark the hut needs, above what the opening keeps already hold, sit
 * right before it, the trough follows the hut it needs room to stand in,
 * and the top fill keep from the opening stays as it was, the trough's
 * own fill keep a second want for the greater capacity the trough gives
 * rather than a replacement. Right after the small-game hunt keep, which
 * is the want that brings hide to camp, sits the clothing block: the bone
 * needle as a keep of one like every other tool, since a needle that wears
 * out takes the mend grind with it, a mend grind, and the hide coat,
 * trousers and boots, the fur hat and the fur mittens as once jobs, since
 * a made garment is put on and the
 * old one left behind. The stone keep sits at the end of that block, right
 * above the axe keep, since the axe and the arrows are what spend stone.
 * The mend grind runs only while a piece is worn
 * enough for a patch (MEND_AT) and hide is at camp, so it does not starve
 * the hut group below it; without it every garment on every year seed was
 * a ghost at durability 0 by autumn, with 168 kg of hide lying at camp on
 * one of them. The hide set opens at Crafting 8 (wantOpen), the hat and
 * mittens at once. Below the hut group sits the surplus loop,
 * in this order: the hang grind, the two winter-stock keeps, and the three
 * named hunts as grinds. A roof and water outrank
 * days spent chasing an elk, which is why this loop sits below the hut
 * group rather than above it. The hang grind hangs whatever raw meat sits
 * at camp while the rack has room; it sits above the named hunts because
 * a keep measured in raw meat at camp can never read met while a grind
 * above it keeps taking that meat to the rack as fast as it comes in - so
 * hunting elk, reindeer or roe deer here is a grind, not a keep, the way
 * felling is a grind and not a firewood keep. Each named hunt opens only
 * at its species' recommended level (wantOpen), since a competent player
 * does not walk at an elk with a stone point at level 1: elk, reindeer
 * and roe deer, listed hardest first (8, 6, 4). The two winter-stock
 * keeps, 400 kg of firewood and the 150 logs that are the stock's unsplit
 * half, sit together between the hang grind and the named hunts: stocking
 * wood for winter earns its place ahead of chasing large game, but behind
 * the hang grind that clears the rack. Both open only from the season they
 * are stocked against (wantOpen), so a list that reaches them in April
 * waits for autumn rather than splitting 400 kg no winter yet needs. The
 * 150-log keep replaced a felling grind that ran last and forever, which
 * burned 400 kcal an hour for nothing whenever everything above it was
 * blocked; a runner with nothing left to do rests instead. It sits above
 * the named hunts and not below them because a grind is never met, and a
 * grind above a keep starves the keep: below them, camp logs never passed
 * five from 1 September and a level-20 camp froze in December beside 2.7
 * million kcal of food.
 */

/** 1 September: a competent player starts the winter woodpile when the nights first frost. */
export const WINTER_WOOD_FROM_DOY = 244;
/**
 * The day the woodpile want closes again: the thaw begins with April, so a
 * pile stacked after it is next winter's rather than this one's, and a
 * spring survivor should have a roof up before a winter pile. The list's
 * 60 kg keep, above this one, is what carries the summer.
 */
export const WINTER_WOOD_TO_DOY = 90;

/**
 * The winter stock: what a competent player has at camp on 1 December.
 * A hut at the winter mean burned 60 kg of firewood a day over the stocked
 * December camp's ninety days (measured on all four seeds, a mean air of
 * -12 C, 5,410 to 5,522 kg), so the wood is 6,600 kg with a fifth to
 * spare: 600 kg split and 300 logs to split, at 20 kg of firewood a log.
 * The food is 80 kg of dried meat and 20 kg of rendered fat. The fat is
 * not a garnish: the lean ceiling caps meat and fish at 1,600 kcal a day
 * whatever the larder holds, and a winter body burns over 3,000, so a
 * lean-only stock starves beside a quarter of a million kcal of it. The
 * ninety days drew 16 kg of fat at most, and a fifth spare is 20.
 * The stocked December camp starts with this; the list's winter keeps
 * stock the wood half of it.
 */
export const WINTER_STOCK = { driedMeatKg: 80, fatKg: 20, firewoodKg: 600, logs: 300 };

/** The winter-stock keeps, the 600 kg split keep and the 300-log keep, told from the list's summer keeps by their targets. */
export function winterStockWant(w: { req: IntentRequest; kind: OrderKind }): boolean {
  if (w.kind !== "keep" || w.req.until.kind !== "campHas") return false;
  const firewood = w.req.task === "split" || w.req.task === "splitWedges" || w.req.task === "deadwood";
  return (firewood && w.req.until.qty >= WINTER_STOCK.firewoodKg) || (w.req.task === "chop" && w.req.until.qty >= WINTER_STOCK.logs);
}

export const REFERENCE_ORDERS: { req: IntentRequest; kind: OrderKind }[] = [
  keep("fill", 2, "shore"),
  keep("fill", 2, "hole"),
  keep("melt", 2),
  job("stone", { kind: "campHas", qty: 8 }),
  keep("sticks", 10),
  keep("bark", 12),
  keep("craft", 8, "cordage"),
  job("build", { kind: "once" }, "firePit"),
  keep("craft", 1, "fireDrill"),
  keep("light", 1),
  keep("lightIndoors", 1),
  keep("chop", 4),
  keep("split", 60),
  keep("splitWedges", 60),
  keep("deadwood", 60),
  job("build", { kind: "once" }, "leanTo"),
  keep("build", 1, "boughBed"),
  job("build", { kind: "once" }, "snowShelter"),
  keep("craft", 1, "knife"),
  keep("craft", 1, "snare"),
  job("build", { kind: "times", n: 5 }, "snare"),
  job("craft", { kind: "campHas", qty: 2 }, "barkBucket"),
  keep("craft", 1, "fishingSpear"),
  job("read", { kind: "once" }),
  job("craft", { kind: "once" }, "basketTrap", "leave"),
  job("setTrap", { kind: "once" }),
  keep("cook", 1, "fish"),
  keep("cook", 1),
  keep("fish", 1, "any"),
  keep("berries", 2),
  keep("build", 20, "snare"),
  job("build", { kind: "once" }, "dryingRack"),
  keep("craft", 1, "bow"),
  keep("craft", 10, "arrows"),
  keep("hunt", 2, "any"),
  keep("craft", 1, "needle"),
  { req: { task: "repair", until: { kind: "forever" }, deliver: "leave", where: "nearest" }, kind: "grind" },
  job("craft", { kind: "once" }, "hideCoat"),
  job("craft", { kind: "once" }, "hideTrousers"),
  job("craft", { kind: "once" }, "hideBoots"),
  job("craft", { kind: "once" }, "furHat"),
  job("craft", { kind: "once" }, "furMittens"),
  keep("stone", 8),
  job("craft", { kind: "once" }, "whetstone"),
  { req: { task: "hone", until: { kind: "forever" }, deliver: "leave", where: "nearest" }, kind: "grind" },
  keep("craft", 2, "wedges"),
  keep("craft", 1, "stoneAxe"),
  keep("craft", 1, "flakedAxe"),
  job("sticks", { kind: "campHas", qty: 20 }),
  job("bark", { kind: "campHas", qty: 40 }),
  job("build", { kind: "once" }, "turfHut"),
  job("build", { kind: "once" }, "waterStore"),
  keep("build", 40, "snare"),
  keep("fill", 20, "shore"),
  keep("fill", 20, "hole"),
  keep("melt", 20),
  { req: { task: "hang", until: { kind: "forever" }, deliver: "leave", where: "nearest" }, kind: "grind" },
  keep("split", WINTER_STOCK.firewoodKg),
  keep("splitWedges", WINTER_STOCK.firewoodKg),
  keep("deadwood", WINTER_STOCK.firewoodKg),
  keep("chop", WINTER_STOCK.logs),
  { req: { task: "hunt", arg: "elk", until: { kind: "forever" }, deliver: "camp", where: "nearest" }, kind: "grind" },
  { req: { task: "hunt", arg: "reindeer", until: { kind: "forever" }, deliver: "camp", where: "nearest" }, kind: "grind" },
  { req: { task: "hunt", arg: "deer", until: { kind: "forever" }, deliver: "camp", where: "nearest" }, kind: "grind" },
];

/**
 * Whether a competent player would give this want today: a named hunt
 * waits for the species' recommended Hunting level, since walking at an
 * elk with a stone point at level 1 is not competence, and the
 * winter-stock keeps, 400 kg of firewood and 150 logs, wait for the
 * season they are stocked against, and a garment waits for its
 * recommended Crafting level.
 */
/** The home shore is under ice: a shore fetch is shut and the winter methods are the question. */
function shoreIced(state: GameState): boolean {
  return state.weather.iceCm >= ICE_SHORE_CM;
}

/** An axe in hand, in the pack or in the camp pile: what a competent player would carry to the shore in winter. */
function axeInReach(state: GameState, world: World): boolean {
  if (axeInHand(state.player)) return true;
  const st = regionState(state, world, state.player.region);
  return AXES.some((id) => qty(state.player.pack, id) >= 1 || qty(pile(state, st.campCell), id) >= 1);
}

export function wantOpen(state: GameState, world: World, w: { req: IntentRequest; kind: OrderKind }, cal: Calendar): boolean {
  // Water by method, chosen here in the open rather than by a fallback inside the
  // intent: the shore while it is open, the hole with an axe once it ices, the fire's
  // melt only when no axe is in reach.
  if (w.req.task === "fill" && w.req.arg === "shore") return !shoreIced(state);
  if (w.req.task === "fill" && w.req.arg === "hole") return shoreIced(state) && axeInReach(state, world);
  if (w.req.task === "melt") return shoreIced(state) && !axeInReach(state, world);
  // The fire by method: the pit until a hut or a hearth stands, the fire indoors after.
  if (w.req.task === "light" || w.req.task === "lightIndoors") {
    const st = regionState(state, world, state.player.region);
    const indoors = st.structures.turfHut || (st.structures.cabin && st.structures.hearth);
    return w.req.task === "lightIndoors" ? indoors : !indoors;
  }
  // The snow shelter closes once a hut or a cabin stands: warmer walls, and the same cell to camp on.
  if (w.req.task === "build" && w.req.arg === "snowShelter") {
    const st = regionState(state, world, state.player.region);
    return !(st.structures.turfHut || st.structures.cabin);
  }
  if (w.req.task === "hunt" && w.req.arg && w.req.arg !== "any") {
    const rec = RECOMMENDED[`hunt:${w.req.arg}`];
    if (rec && skillLevel(state, rec.skill) < rec.level) return false;
  }
  // Firewood by method: the axe while one is in reach, wedges and dead wood when none is; the
  // winter stock's rows open by the season on top of that.
  if (w.req.task === "split" || w.req.task === "splitWedges" || w.req.task === "deadwood") {
    const withAxe = axeInReach(state, world);
    if (w.req.task === "split" ? !withAxe : withAxe) return false;
  }
  // The spare axe by tier: the celt once Crafting reaches its level, a flaked one under it and only with no axe to hand.
  if (w.req.task === "craft" && w.req.arg === "stoneAxe") return skillLevel(state, "crafting") >= RECOMMENDED["craft:stoneAxe"].level;
  if (w.req.task === "craft" && w.req.arg === "flakedAxe") return skillLevel(state, "crafting") < RECOMMENDED["craft:stoneAxe"].level && !axeInReach(state, world);
  // A garment waits for its recommended level, the way a named hunt does: a
  // level-1 survivor with an elk's hide does not spoil six kilos of it on a
  // coat. Tools and kit are not gated here; the ladder's stand-ins carry them.
  if (w.req.task === "craft" && w.req.arg && RECIPES[w.req.arg as RecipeId]?.out.clothing) {
    const rec = RECOMMENDED[`craft:${w.req.arg}`];
    if (rec && skillLevel(state, rec.skill) < rec.level) return false;
  }
  if (winterStockWant(w)) return cal.dayOfYear >= WINTER_WOOD_FROM_DOY || cal.dayOfYear < WINTER_WOOD_TO_DOY;
  return true;
}

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
/** The food clause: kcal a day eaten over the week before a checkpoint that counts as a beginner's day of food, the middle of the April beginner band the gate day is derived from. */
export const FOOD_CLAUSE_KCAL = 500;
/** The day 1 December falls on from a 1 April start; kept as a late checkpoint, not a gate. */
export const DECEMBER_DAY = 245;

export type Gate = { kind: "day"; day: number } | { kind: "firstSnow" };

/** A spring start is measured on its target day; a start from July on is measured at the first snow (spec 7.3). */
export function gateFor(startDoy: number, kitted: boolean): Gate {
  if (startDoy >= MIDSUMMER_DOY) return { kind: "firstSnow" };
  return { kind: "day", day: kitted ? KITTED_TARGET_DAY : REFERENCE_TARGET_DAY };
}

/** kcal of food sitting in an inventory. */
export function campFoodKcalAt(inv: Inventory): number {
  let kcal = 0;
  for (const f of Object.keys(FOODS) as FoodId[]) kcal += qty(inv, f) * FOODS[f].kcalPerKg;
  return kcal;
}

/** kcal of food lying at this region's camp. */
export function campFoodKcal(state: GameState, world: World): number {
  return campFoodKcalAt(pile(state, regionState(state, world, state.player.region).campCell));
}

/** The food clause at a checkpoint: a beginner's day of food eaten on average over the week before it, so a body in deficit that eats what it catches reads fed and one living on its fat does not. */
export function fed(week: WeekAverage): boolean {
  return week.days > 0 && week.eaten >= FOOD_CLAUSE_KCAL;
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
 * The trap block a kitted camp and the horizon's built stages both want: a
 * trap set at the region's shore, known to hold whatever fish that shore
 * has, standing from the first minute rather than waiting on a read and a
 * setTrap job. A region with no shore, or a shore with nothing in the
 * water, leaves the trap unset - there is nothing for it to hold.
 */
export function kitTrap(state: GameState, world: World): void {
  const p = state.player;
  const st = regionState(state, world, p.region);
  const shore = spotOf(regionAt(world, p.region), "shore");
  if (!shore) return;
  const fish = shoreFish(world, regionAt(world, p.region), shore.cell);
  if (!fish.length) return;
  state.player.known[shore.cell] = { minute: 0, fish };
  st.trap = { cell: shore.cell, kg: 0, fish, age: 0 };
}

/**
 * The audit's kitted camp (spec 8, "Decisions confirmed with the author"): the
 * true arrival kit plus every tool and structure the from-scratch list spends
 * its first days building. A flag on the script, not a second gate - it asks
 * whether the seven fixes let an already-established camp hold, separately
 * from whether the from-scratch list can bootstrap one in time. `producers`
 * gates the hut, the trough and the trap: the horizon's earlier stages want
 * the arrival kit alone and set their own structures through `setUpStage`.
 */
export function kitOut(state: GameState, world: World, producers = true): void {
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
  if (producers) {
    st.structures.turfHut = true;
    st.structures.waterStore = true;
    kitTrap(state, world);
  }
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

  /** The day the walk home ended, once it has; null while it is still under way or when there was none. */
  reachedDay: number | null = null;

  /**
   * `home` is the region of the old camp for an heir: the first log line
   * gives the bearing, and a competent player walks there before anything
   * else, since the camp orders deliver to is the region's own and the old
   * one has the fire pit, the stone and the snares the list would otherwise
   * spend its first days on. The walk is the real travel task, paid in hours,
   * burn and nights on the way, and no order is given until the region is
   * reached. The first survivor has no home and starts on the list at once.
   */
  constructor(readonly wants: { req: IntentRequest; kind: OrderKind }[] = REFERENCE_ORDERS, private home: number | null = null) {}

  tick(state: GameState, world: World): void {
    if (this.home !== null) {
      if (state.player.region !== this.home) {
        if (!state.task) startTask(state, world, calendar(state.minute, state.startDoy), "travel", `region:${this.home}`);
        return;
      }
      this.reachedDay = calendar(state.minute, state.startDoy).day;
      this.home = null;
    }
    const cal = calendar(state.minute, state.startDoy);
    const list = ordersHere(state, world);
    for (const [i, g] of [...this.given]) {
      if (list.some((o) => o.id === g.id)) {
        // A want whose season has closed takes its standing order off the
        // list rather than leaving it to be worked out of season: the
        // woodpile given on 1 September would otherwise still be splitting
        // 400 kg through the following summer. It is withdrawn, not
        // finished, so the want is given again when the season reopens.
        if (!wantOpen(state, world, this.wants[i], cal)) {
          removeOrder(state, world, g.id);
          this.given.delete(i);
          this.trueKind.delete(i);
        }
        continue;
      }
      if (this.trueKind.get(i)) this.finished.add(i);
      else if (g.units) this.completed.set(i, (this.completed.get(i) ?? 0) + g.units);
      this.given.delete(i);
      this.trueKind.delete(i);
    }
    for (let i = 0; i < this.wants.length; i++) {
      if (this.finished.has(i) || this.given.has(i)) continue;
      const w = this.wants[i];
      if (!wantOpen(state, world, w, cal)) continue;
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
  /** Day, kcal, water, warmth, health, food, whether the week before read fed, and camp stocks at each checkpoint reached, with the week before it. */
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
  /** The day of the first hang and of the first large-game kill; null when never (year loop spec 1.1). */
  surplus: { hang: number | null; largeGame: number | null };
  /** The life record, for the selector: epitaph, entry and since read this. */
  record: LifeRecord;
}

function checkpoint(state: GameState, world: World, day: number): ReferenceReport["checkpoints"][number] {
  const p = state.player;
  const camp = pile(state, regionState(state, world, p.region).campCell);
  const stocks: Record<string, number> = {};
  for (const { item, qty } of listItems(camp)) stocks[item] = Math.round(qty * 10) / 10;
  const food = campFoodKcal(state, world);
  const week = weekBefore(state.ledger, day);
  return {
    day, dayOfYear: calendar(state.minute, state.startDoy).dayOfYear, kcal: Math.round(p.kcal), water: Math.round(p.water * 10) / 10, warmth: Math.round(p.warmth), health: Math.round(p.health),
    food: Math.round(food), fed: fed(week),
    stocks, tools: p.tools.map((t) => `${TOOLS[t.id].name} ${Math.round(t.durability)}`),
    week,
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
    `burn/day ${r0(total)} (${verdict(total, BURN.day)}) = base ${r0(b.base)} (${verdict(b.base, BURN.base)}) + work ${r0(work)} (${verdict(work, BURN.work)}: activity ${r0(b.activity)}, walk ${r0(b.walk)}) + cold ${r0(b.cold)} (${verdict(b.cold, coldBand(dayOfYear))}) + sick ${r0(b.sick)}`,
    `sleep/day ${sleepH.toFixed(1)} h (${verdict(sleepH, SLEEP_HOURS)}), work/day ${(week.workMin / 60).toFixed(1)} h`,
  ];
}

/** Runs the set-up a day at a time for `days` days or until death, whichever is first. */
export function measure(ref: { state: GameState; world: World; player: ReferencePlayer }, days: number, kitted = false): ReferenceReport {
  const { state, world } = ref;
  const gate = gateFor(state.startDoy, kitted);
  // A start late enough to open with snow already lying has no first snow to
  // wait for, and reading the check on day 1 would call the ground the fall.
  const openedBare = state.weather.snowCm === 0;
  const checkpoints: ReferenceReport["checkpoints"] = [];
  const seen = new Set<number>();
  let firstSnowDay: number | null = null;
  const surplus: ReferenceReport["surplus"] = { hang: null, largeGame: null };
  for (let d = 1; d <= days && !state.dead; d++) {
    stepReference(ref, 1440);
    const day = calendar(state.minute, state.startDoy).day;
    const home = regionState(state, world, state.player.region);
    if (surplus.hang === null && home.rack.kg > 0) surplus.hang = day;
    if (surplus.largeGame === null && current(state).events.some((e) => e.kind === "firstKill" && LARGE_GAME.includes(e.species))) surplus.largeGame = day;
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
  return { seed: state.seed, startRing: world.startRing, checkpoints, outcome, passed, gate, gateDay, firstSnowDay, surplus, record: current(state) };
}

export function runReference(seed: number, days: number, opts: { kitted?: boolean; startDoy?: number } = {}): ReferenceReport {
  return measure(setUpReference(seed, opts.kitted ?? false, opts.startDoy ?? START_DOY), days, opts.kitted ?? false);
}

export interface HeirReport {
  seed: number;
  first: ReferenceReport;
  gapDays: number;
  landed: WorldDate;
  found: { structures: string[]; campFoodKcal: number; campFirewoodKg: number; snares: number; kmToOldCamp: number; reachedCampDay: number | null; trapKg: number | null };
  heir: ReferenceReport;
}

/** What the heir finds at the old camp: `HeirReport["found"]` plus the log pile, which the trend report reads and `runHeir`'s callers do not. */
export type Found = { structures: string[]; campFoodKcal: number; campFirewoodKg: number; logs: number; snares: number; kmToOldCamp: number; trapKg: number | null };

export interface LifeReport {
  index: number;
  landed: WorldDate;
  gapDays: number;
  /** What stood at the old camp when this life landed; null for the first survivor. */
  found: Found | null;
  reachedCampDay: number | null;
  report: ReferenceReport;
}

export interface LineageReport {
  seed: number;
  lives: LifeReport[];
}

/** What the heir finds at the old camp, read after the gap has run and before the heir moves. */
function foundAtOldCamp(state: GameState, world: World, oldRegion: number, landCell: number, trapKg: number | null): Found {
  const oldSt = regionState(state, world, oldRegion);
  const camp = pile(state, oldSt.campCell);
  const structures = (["firePit", "leanTo", "cabin", "dryingRack", "boughBed", "hearth", "turfHut", "waterStore", "snowShelter"] as const).filter((s) => oldSt.structures[s]);
  const lc = cellAt(world, landCell);
  const cc = cellAt(world, oldSt.campCell);
  return {
    structures: [...structures],
    campFoodKcal: Math.round(campFoodKcalAt(camp)),
    campFirewoodKg: Math.round(qty(camp, "firewood")),
    logs: Math.round(qty(camp, "log")),
    snares: oldSt.structures.snares,
    kmToOldCamp: Math.round(Math.hypot(lc.x - cc.x, lc.y - cc.y) * CELL_KM * 10) / 10,
    trapKg,
  };
}

/**
 * Lives in one world, one after another (year loop spec 1.4): the from-scratch
 * reference run, then for each heir the gap, the landing near the old camp,
 * the walk home and a fresh reference run. A life still alive at the day cap
 * has no heir to raise, so the report ends there. Six lives is the lineage
 * gate's cap (tables audit spec 1.3): a seed passes when any of them reaches
 * a year.
 */
export function runLineage(seed: number, days: number, lives = 6): LineageReport {
  const ref = setUpReference(seed);
  const { state, world } = ref;
  const out: LifeReport[] = [];
  let first = measure(ref, days);
  out.push({ index: 1, landed: current(state).landed, gapDays: 0, found: null, reachedCampDay: null, report: first });
  for (let i = 2; i <= lives && state.dead; i++) {
    const oldRegion = oldCampRegion(state);
    const oldSt = regionState(state, world, oldRegion);
    const trapKg = oldSt.trap ? Math.round(oldSt.trap.kg * 10) / 10 : null;
    beginAgain(state, world);
    // The gates measure the list, not the boat: the heir is the median person under the first card's name.
    const l = state.landing!;
    const median = medianPerson(l.candidates[0].person.sex);
    // land() clears state.landing once it confirms the name, so the cell it chose
    // has to be read off the landing itself, not off the player it then places.
    const landCell = state.landing!.cell;
    land(state, world, undefined, median);
    const found = foundAtOldCamp(state, world, oldRegion, landCell, trapKg);
    const heirRef = { state, world, player: new ReferencePlayer(REFERENCE_ORDERS, oldRegion) };
    const report = measure(heirRef, days);
    out.push({ index: i, landed: current(state).landed, gapDays: current(state).gapDays, found, reachedCampDay: heirRef.player.reachedDay, report });
    first = report;
  }
  return { seed, lives: out };
}

/**
 * Two lives: the from-scratch reference run to death, then the gap, the
 * landing near the old camp, and a fresh reference run as the heir. A run
 * still alive at the day cap has no heir to raise, so it stands in for
 * both halves and the gap reads 0.
 */
export function runHeir(seed: number, days: number): HeirReport {
  const l = runLineage(seed, days, 2);
  const first = l.lives[0].report;
  if (l.lives.length === 1) {
    return { seed, first, gapDays: 0, landed: l.lives[0].landed, found: { structures: [], campFoodKcal: 0, campFirewoodKg: 0, snares: 0, kmToOldCamp: 0, reachedCampDay: null, trapKg: null }, heir: first };
  }
  const h = l.lives[1];
  const found = { structures: h.found!.structures, campFoodKcal: h.found!.campFoodKcal, campFirewoodKg: h.found!.campFirewoodKg, snares: h.found!.snares, kmToOldCamp: h.found!.kmToOldCamp, trapKg: h.found!.trapKg, reachedCampDay: h.reachedCampDay };
  return { seed, first, gapDays: h.gapDays, landed: h.landed, found, heir: h.report };
}
