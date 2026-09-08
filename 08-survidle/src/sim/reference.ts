/**
 * The reference player: the set-up a competent player writes on day one,
 * run headless. It is the baseline's gate (alive and fed on
 * REFERENCE_TARGET_DAY, derived from the reserve and the burn band, on
 * four seeds, from scratch, in April) and, later, the survivor loop's
 * instrument. The runner never gathers a prerequisite on its own, so the
 * list orders every dependency before what needs it: water at the top,
 * where it waits on its own vessel; then everything a fire and a roof
 * need, in the order they need it, worked with the arrival axe alone;
 * then the knife and what it unlocks. The list is the wants, each with the
 * windows, stock lines, band and pace a competent player would write on it;
 * the player script below gives each as the best kind and the most of those
 * conditions the skill has earned, since a from-scratch survivor has only
 * once jobs until a skill reaches 3, no keeps for weeks and no conditions
 * for longer, and stands in by hand for the rest.
 */
import { Rng } from "../rng";
import { CELL_KM } from "../units";
import { cellAt } from "../world/cells";
import { regionAt, spotOf, type World } from "../world/gen";
import { advance } from "./advance";
import { bodyAsks } from "./body";
import { calendar, dayNumber, START_DOY, type Calendar } from "./calendar";
import { addItem, AXES, axeInHand, freshTool, listItems, pile, pileAt, qty, TRACE_KG } from "./inventory";
import { nearestCell, startIntent } from "./intent";
import {
  BARK_FROM_DOY, BARK_TO_DOY, EGG_FROM_DOY, EGG_TO_DOY, FOODS, type FoodId, LEAN_KCAL_PER_DAY, MEAT_DRY_RATIO, RECIPES,
  ROOT_FROM_DOY, ROOT_TO_DOY, SAP_FROM_DOY, SAP_TAPS_PER_DAY, SAP_TO_DOY, SPOIL_HOURS, TOOLS,
} from "./items";
import { shoreFish } from "./knowledge";
import { beginAgain, land, oldCampRegion } from "./landing";
import { giveOrder, withinLadder } from "./ladder";
import { creditYield, type WeekAverage, weekBefore, type YieldSource, YIELD_SOURCES } from "./ledger";
import { knownShare, mapRegion } from "./mapped";
import { newGame, ARRIVAL_DRIED_MEAT_KG, START_KCAL } from "./newgame";
import { conditionOpen, keepBand, keepStock, keepTargetToday, orderMet, ordersHere, removeOrder } from "./orders";
import { FAT_FULL } from "./player";
import { medianPerson } from "./person";
import { heathCell, watersideCell } from "./position";
import { current } from "./record";
import { campSite, regionState, siteFor } from "./regionstate";
import { RECOMMENDED, skillLevel } from "./skills";
import { inSpawn, LARGE_GAME, SPECIES_DEFS } from "./species";
import { nestsFor, rootKgLeft } from "./stocks";
import { APRIL, BURN, coldBand, MIDSUMMER_DOY, PLANT_HOURS_PER_DAY, SLEEP_HOURS, sourceBand, tableFor, verdict } from "./tables";
import { seaweedAvailable, setAside, startTask } from "./tasks";
import { ICE_SHORE_CM } from "./water";
import type { DeathCause, GameState, IntentRequest, Inventory, LifeRecord, Order, OrderKind, OrderWhen, RecipeId, WorldDate } from "./types";

type Want = { req: IntentRequest; kind: OrderKind };

const keep = (task: IntentRequest["task"], qty: number, arg?: string, deliver: "leave" | "camp" = "camp", when?: OrderWhen): Want =>
  ({ req: { task, arg, until: { kind: "campHas", qty }, deliver, where: "nearest", when }, kind: "keep" });
const job = (task: IntentRequest["task"], until: IntentRequest["until"], arg?: string, deliver: "leave" | "camp" = "camp", when?: OrderWhen): Want =>
  ({ req: { task, arg, until, deliver, where: "nearest", when }, kind: "job" });

/**
 * The raw meat a camp hangs rather than eats: what the body cannot get
 * through before the stack rots. Raw meat keeps SPOIL_HOURS.rawMeat and the
 * ceiling lets LEAN_KCAL_PER_DAY of lean food through in a day, so the kilos
 * a survivor can eat off a fresh kill are those hours' worth of the ceiling
 * at raw meat's own kcal a kilo. Everything past that is meat that will be
 * lost if it is not on the rack, which is when the grind is worth its five
 * minutes a kilo and not before. Derived, so it moves with the spoil hours
 * and the ceiling and with nothing else.
 */
export const HANG_ABOVE_KG = (SPOIL_HOURS.rawMeat / 24) * (LEAN_KCAL_PER_DAY / FOODS.rawMeat.kcalPerKg);

/**
 * The plant band: work the list asks for by the day and not until a target
 * is met. Every other food want is a keep measured in food at camp, and such
 * a keep can never read met while the body eats what it brings home - it
 * takes the whole day and the rows below it never get a turn. That is what
 * the plant block did: a cook-roots keep emptied the roots keep, auto-eat
 * emptied the flour, and four level-20 seeds spent four and a half to seven
 * and a half hours a day on plants and killed nothing all summer.
 *
 * So each of these rows asks for a count a day and no more: a daily job,
 * whose count the day roll clears and which never drops off the list. A
 * count is completions of a task that takes an hour, so it is whole hours
 * or it is nothing: half a dig is not a dig. PLANT_HOURS_PER_DAY is the
 * handbook's budget for plant work as a whole and the rows divide it in
 * whole hours - the windowed rows take one each and the root row, the one
 * that stands all year, takes the rest. The winter dig is the root row in
 * the months the summer one is shut, not a further row. The seaweed row is
 * a sea camp's, given by a runner rule, so an inland camp asks for two
 * hours of roots and, for six weeks, an hour of eggs; a sea camp asks for
 * an hour of seaweed on top, an hour over the budget on a coast no gate
 * reaches. Dividing the budget by a row the camp does not have leaves an
 * hour unspent every day of the year instead: a level-20 camp on seed 45
 * dug 273 kcal a day, under the band, and starved on the lean wall on day
 * 200 with 19 tonnes of rhizome in reach. Berries are not here - the gut
 * refuses a third kilo in a day, which is the same cap by another route,
 * and the handbook sets its own two litres.
 */
export const PLANT_HOURS_WINDOW_ROW = 1;
export const PLANT_HOURS_ROOTS = PLANT_HOURS_PER_DAY - PLANT_HOURS_WINDOW_ROW;

/**
 * The runner never gathers a prerequisite on its own, so the list is
 * ordered as a competent day one is: water at the top, waiting for its
 * bucket. Above the fetch itself sits the thaw grind, because a vessel
 * that froze full is not a vessel: the fill task tops off what room a
 * vessel has, a frozen one has none, and the pour at camp passes it over,
 * so a fetch with the whole camp's vessels frozen runs all day and draws
 * nothing while every want under it waits. A level-20 camp did exactly
 * that for twenty days from 30 January - the bucket froze full on a night
 * the fire went out - and froze to death on 19 February with 109 logs
 * lying at camp. The grind is blocked with "nothing is frozen" the rest of
 * the year, which is what a want at the head of the list has to be. Then
 * the fire-and-roof chain, worked with the arrival axe alone
 * - the fire site first, since it asks for nothing but the ground, then
 * stone, sticks, bark and cordage as raw stock (cordage kept to eight,
 * since arrows, snares and the bucket all draw on it), the fire drill,
 * the keep that lights the fire and relights it,
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
 * keeps sit above the fish keep, and the rack job just under them, with the
 * crack grind between - the rack waits on raw meat at camp, so a camp with
 * nothing yet caught to dry never spends the hour. The trap follows the spear: the shore is read the day the
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
 * because it has to be met on day one: the knife needs two and the
 * whetstone the edge wants soon after another, and a keep at level 1 is
 * given as a stand-in that has to be given again, which happens only once
 * camp is under half the target - four stone. The restock is the keep,
 * far down beside the axe it feeds, where topping up under four is what a
 * restock should do: arrows take three stone per five and a stone axe
 * three, and the once job alone ran out and left every year seed with no
 * arrows, no axe and a felling grind for company. Two kilos of
 * berries at camp sit under the fish keep, at the foot of the food block:
 * in season they are the cheapest kcal there is, and out of it the keep
 * blocks harmlessly on nothing ripe. Once food, the roof and water are running, the sticks and
 * bark the hut needs, above what the opening keeps already hold, sit
 * right before it, the trough follows the hut it needs room to stand in,
 * and the top fill keep from the opening stays as it was, the trough's
 * own fill keep a second want for the greater capacity the trough gives
 * rather than a replacement. Right after the arrows, the last of the
 * ranged kit the hunt that brings hide to camp is worked with, sits the
 * clothing block: the bone
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
 * mittens at once. Below the hut group sits the surplus loop, in this
 * order: the two winter-stock keeps and the three named hunts as grinds. A
 * roof and water outrank days spent chasing an elk, which is why this loop
 * sits below the hut group rather than above it. Hunting elk, reindeer or
 * roe deer here is a grind and not a keep, the way felling is a grind and
 * not a firewood keep: a keep measured in raw meat at camp can never read
 * met while the hang grind takes that meat to the rack as fast as it comes
 * in. Each named hunt opens only
 * at its species' recommended level (wantOpen), since a competent player
 * does not walk at an elk with a stone point at level 1: elk, reindeer
 * and roe deer, listed hardest first (8, 6, 4). A grind is never met, and a
 * grind above a keep starves the keep: with the log keep below the hunts,
 * camp logs never passed five from 1 September and a level-20 camp froze in
 * December beside 2.7 million kcal of food. A survivor with a full rack and
 * no woodpile cuts wood.
 *
 * The winter stock's own four keeps - the split pile in its three methods
 * and the logs that are the stock's unsplit half - sit above the hunt keep
 * rather than in this loop, since what they promise is the winter itself and
 * a hunt is the one thing that can wait for it. All four carry the window
 * they are stocked against, midsummer to the thaw, and the same date, so a
 * list that reaches these rows in April or May asks for nothing at all. Only
 * the log row is spent by the season's close: the reserve is what the autumn
 * builds and the winter burns through, while the split buffer above it holds
 * its figure to the thaw because the fire draws on it every day of the winter.
 *
 * Inner bark is not on the list. At the handbook's own yield it is the
 * worst hour a survivor can spend: about 275 kcal an hour against fishing's
 * 420 and root digging's 414 at level 20, so the strip and its grind took
 * an hour and a half a day off two better sources, and shutting them
 * lengthened the level-20 year by 38 days on seed 17 and 52 on seed 79.
 * The task, its season and its wantOpen branch all stay for a player who
 * wants the fallback by hand; what is missing is only the standing want.
 * Whether the yield or the strip season is what is wrong is the author's
 * question and not the list's.
 *
 * The catch is two items and wants two cook keeps: raw oily fish is not in
 * the auto-eat order and rots in a day and a half, so with only the lean
 * keep on the list a char or a trout was landed, carried home and thrown
 * away, and every reference seed died with an oily species standing in its
 * shore's read.
 *
 * Fat before meat: the render keep sits above the cook keeps because raw
 * fat rots in three days and is the calories the ceiling does not touch;
 * the crack grind takes the bones the hunts leave at camp; each of the
 * three says on its own row what stock it waits for, and the gathering rows
 * say their windows the same way. Seaweed is the one gather still decided
 * off the screen, since a camp on an inland lake never has the want at all.
 *
 * The hunt keep sits above the gathering block for its own reason. It is a
 * promise about raw meat at camp, and a large kill meets it for days, so it
 * is not the treadmill a fish keep is - the body eats a catch the day it
 * lands and the keep re-opens by supper. Under the block it got nine
 * minutes to an hour and twenty a day and three of four level-20 seeds
 * killed nothing all summer; a hunter who takes one elk in June has its
 * nine kilos of fat and a rack of dried meat, which no number of hours at
 * the shore will match. The bow and the arrows stay below the fish keep,
 * where they cost a beginner nothing: lifted with the hunt keep they took
 * seed 19 the woodpile and a cold death on day 22 of the April gate.
 *
 * What tells the hunter when to stop is the keep's own figure and its
 * restart line: the winter stock's dried meat in the raw kilos it dried
 * from, met at that, and open again only under four fifths of it. Without
 * a line a keep on food at camp is never met at all - the body eats what
 * it brings home - so the row takes the day and the woodpile beneath it
 * never runs; seed 19 froze on day 305 with ten elk behind it, 829,835
 * kcal at camp and three logs. The fish keep says the same thing the other
 * way round: it shuts while the winter's dried meat is already at camp,
 * since a shore trip for another kilo of lean is the worst hour a stocked
 * camp can spend.
 *
 * The rack and the twenty-snare line sit above that gathering block, not
 * below it, because both are work that finishes and then feeds the camp
 * without being asked again: an hour builds the rack, a few minutes sets a
 * snare, and every kilo after that is free. The gathering keeps are the
 * opposite - a keep measured in food at camp can never read met while the
 * body eats what it brings home, so it takes the whole day and everything
 * under it waits. With the block above them, a level-20 camp set three
 * snares in a hundred days, never built a rack, never dried a kilo and
 * starved in July on four seeds out of four while digging rhizomes three
 * hours a day.
 */

/**
 * Midsummer: from the day the light starts going, a competent player is
 * cutting for the winter, a window sized against the measured 6.6-tonne
 * stock. From midsummer, a level-20 camp stands at 385 and 381 kg of
 * firewood with 152 and 151 logs on 1 September.
 */
export const WINTER_WOOD_FROM_DOY = MIDSUMMER_DOY;
/**
 * The day the woodpile want closes again: the thaw begins with April, so a
 * pile stacked after it is next winter's rather than this one's, and a
 * spring survivor should have a roof up before a winter pile. The list's
 * 60 kg keep, above this one, is what carries the summer.
 */
export const WINTER_WOOD_TO_DOY = 90;
/**
 * The day the winter stock is due in full: 1 December, the day "what a
 * competent player has at camp" is measured on and the day the winter gate
 * starts its own reading from. All four wood keeps rise to their figures by
 * it, so the cutting is spread across the autumn and the rows under them keep
 * their share of every day until it is. Only the log reserve falls away again
 * across the winter it is spent in, so what it asks for in March is what March
 * has left to burn; the split buffer holds. See WINTER_BUFFER_WHEN.
 */
export const WOOD_DUE_DOY = 334;

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

/**
 * The window the winter pile is stocked in, said once for the four rows that
 * stock it. A season is inclusive of its last day and WINTER_WOOD_TO_DOY is the
 * day the want shuts, so the last day the pile is asked for is the one before
 * it: a survivor standing on the first day of the thaw has this winter's pile
 * behind them and next winter's is a summer away.
 */
const WINTER_WOOD_SEASON = { from: WINTER_WOOD_FROM_DOY, to: WINTER_WOOD_TO_DOY - 1 };

/**
 * The three firewood rows: the window and a due date, held after it. What
 * they promise is the split pile the camp burns out of, a working buffer and
 * not a store - the fire draws it down every day and the reserve beside it
 * fills it back up - so 1 March wants as much of it as 1 December. It rises
 * rather than standing at 600 kg from midsummer because a beginner cannot
 * split 600 kg and a row that never reads met takes the whole day from the
 * food rows under it: flat, it was a splitting treadmill that cost three
 * lineages their year, the heirs dying at 2,600 to 4,000 kcal a day of camp
 * activity with the logs they were splitting stacked beside them.
 */
const WINTER_BUFFER_WHEN: OrderWhen = { season: WINTER_WOOD_SEASON, by: WOOD_DUE_DOY };

/**
 * The log reserve: the same window and date, and spent by the season's close.
 * This is the row the spending belongs to, and the only one. Standing timber
 * cut and stacked is the store the winter is burned out of, so it rises to
 * its figure across the autumn and falls away again as the winter spends it,
 * reaching nothing at the thaw - a pile stacked in March is next winter's,
 * and asking for it costs a week of felling in deep snow. Seed 17 froze on
 * day 342 owing 257 logs with 593 kg of firewood already at camp.
 */
const WINTER_RESERVE_WHEN: OrderWhen = { season: WINTER_WOOD_SEASON, by: WOOD_DUE_DOY, spend: true };

/** The winter-stock keeps, the 600 kg split keep and the 300-log keep, told from the list's summer keeps by their targets. */
export function winterStockWant(w: { req: IntentRequest; kind: OrderKind }): boolean {
  if (w.kind !== "keep" || w.req.until.kind !== "campHas") return false;
  const firewood = w.req.task === "split" || w.req.task === "splitWedges" || w.req.task === "deadwood";
  return (firewood && w.req.until.qty >= WINTER_STOCK.firewoodKg) || (w.req.task === "chop" && w.req.until.qty >= WINTER_STOCK.logs);
}

export const REFERENCE_ORDERS: Want[] = [
  { req: { task: "thaw", until: { kind: "forever" }, deliver: "leave", where: "nearest" }, kind: "grind" },
  keep("fill", 2, "shore"),
  keep("fill", 2, "hole"),
  keep("melt", 2),
  // The fire site first: it asks for nothing but the ground, so there is no
  // reason to spend a morning at the outcrop before there is anywhere to burn
  // what the morning is for. The stone that follows is the axe's and the
  // whetstone's, not the fire's.
  job("build", { kind: "once" }, "firePit"),
  job("stone", { kind: "campHas", qty: 8 }),
  keep("sticks", 10),
  keep("bark", 12),
  keep("craft", 8, "cordage"),
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
  // A keep and not a camp-has job: a job drops off when it is met and is never
  // given again, and a bark bucket bursts when the water in it freezes, so the
  // camp that lost its last one to the ice had no vessel for the rest of its
  // life and the water keep above read "needs a vessel" from that day on. The
  // count is the camp pile's, which is the pile campWaterCapacity reads: the
  // one in hand is a tool and is neither camp's capacity nor this keep's stock.
  keep("craft", 2, "barkBucket"),
  keep("craft", 1, "fishingSpear"),
  job("read", { kind: "once" }),
  job("craft", { kind: "once" }, "basketTrap", "leave"),
  job("setTrap", { kind: "once" }),
  { req: { task: "cook", arg: "rawFat", until: { kind: "forever" }, deliver: "leave", where: "nearest", when: { stock: { item: "rawFat", atLeast: TRACE_KG } } }, kind: "grind" },
  keep("cook", 1, "fish"),
  keep("cook", 1, "oilyFish"),
  keep("cook", 1),
  { req: { task: "crack", until: { kind: "forever" }, deliver: "leave", where: "nearest", when: { stock: { item: "bone", atLeast: 1 } } }, kind: "grind" },
  job("build", { kind: "once" }, "dryingRack", "camp", { stock: { item: "rawMeat", atLeast: TRACE_KG } }),
  keep("build", 20, "snare"),
  { req: { task: "hang", until: { kind: "forever" }, deliver: "leave", where: "nearest", when: { stock: { item: "rawMeat", atLeast: HANG_ABOVE_KG } } }, kind: "grind" },
  keep("split", WINTER_STOCK.firewoodKg, undefined, "camp", WINTER_BUFFER_WHEN),
  keep("splitWedges", WINTER_STOCK.firewoodKg, undefined, "camp", WINTER_BUFFER_WHEN),
  keep("deadwood", WINTER_STOCK.firewoodKg, undefined, "camp", WINTER_BUFFER_WHEN),
  keep("chop", WINTER_STOCK.logs, undefined, "camp", WINTER_RESERVE_WHEN),
  keep("hunt", WINTER_STOCK.driedMeatKg * MEAT_DRY_RATIO, "any", "camp", { restart: (WINTER_STOCK.driedMeatKg * MEAT_DRY_RATIO * 4) / 5 }),
  job("eggs", { kind: "daily", n: PLANT_HOURS_WINDOW_ROW }, undefined, "camp", { season: { from: EGG_FROM_DOY, to: EGG_TO_DOY } }),
  job("roots", { kind: "daily", n: PLANT_HOURS_ROOTS }, undefined, "camp", { season: { from: ROOT_FROM_DOY, to: ROOT_TO_DOY } }),
  job("roots", { kind: "daily", n: PLANT_HOURS_ROOTS }, undefined, "camp", { season: { from: ROOT_TO_DOY + 1, to: ROOT_FROM_DOY - 1 } }),
  keep("cook", 1, "roots"),
  job("tapSap", { kind: "daily", n: SAP_TAPS_PER_DAY }, undefined, "camp", { season: { from: SAP_FROM_DOY, to: SAP_TO_DOY } }),
  job("seaweed", { kind: "daily", n: PLANT_HOURS_WINDOW_ROW }),
  keep("fish", 1, "any", "camp", { stock: { item: "driedMeat", under: WINTER_STOCK.driedMeatKg } }),
  // Midsummer to the turn of May: the summer window, and after it the frozen lingon dug
  // from under the snow at a fifth of the rate. The two months the row is shut are the
  // ones with neither ripe fruit on the heath nor snow to dig it out of.
  keep("berries", 2, undefined, "camp", { season: { from: MIDSUMMER_DOY, to: 120 } }),
  keep("craft", 1, "bow"),
  keep("craft", 10, "arrows"),
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
  { req: { task: "hunt", arg: "elk", until: { kind: "forever" }, deliver: "camp", where: "nearest" }, kind: "grind" },
  { req: { task: "hunt", arg: "reindeer", until: { kind: "forever" }, deliver: "camp", where: "nearest" }, kind: "grind" },
  { req: { task: "hunt", arg: "deer", until: { kind: "forever" }, deliver: "camp", where: "nearest" }, kind: "grind" },
];

/** The home shore is under ice: a shore fetch is shut and the winter methods are the question. */
function shoreIced(state: GameState): boolean {
  return state.weather.iceCm >= ICE_SHORE_CM;
}

/** An axe in hand, in the pack or in the camp pile: what a competent player would carry to the shore in winter. */
function axeInReach(state: GameState, world: World): boolean {
  if (axeInHand(state.player)) return true;
  const st = regionState(state, world, state.player.region);
  return AXES.some((id) => qty(state.player.pack, id) >= 1 || qty(pileAt(state, st.campCell), id) >= 1);
}

/**
 * The decisions the runner keeps for itself, each one a thing a player
 * reads off the screen on the morning it changes rather than anything an
 * order can be told to watch: the water and the fire by their method, the
 * snow shelter until walls stand, the firewood by whether an axe is in
 * reach, a named hunt, a garment and the spare axe by the level their kit
 * recommends, the winter dig by the axe that keeps an ice hole open, and
 * seaweed by whether the camp is on the sea at all. Every other reading
 * this once did is a condition the want carries, read on the order by the
 * scheduler or, under the rung that writes it, by the runner's own hand.
 * Each flip of an answer here costs the player a morning and is counted as
 * one.
 */
export function wantOpen(state: GameState, world: World, w: Want): boolean {
  // Water by method, chosen here in the open rather than by a fallback inside the
  // intent: the shore while it is open, the hole with an axe once it ices, the fire's
  // melt only when no axe is in reach.
  if (w.req.task === "fill" && w.req.arg === "shore") return !shoreIced(state);
  if (w.req.task === "fill" && w.req.arg === "hole") return shoreIced(state) && axeInReach(state, world);
  if (w.req.task === "melt") return shoreIced(state) && !axeInReach(state, world);
  // The fire by method: the pit until a hut or a hearth stands, the fire indoors after.
  if (w.req.task === "light" || w.req.task === "lightIndoors") {
    const site = campSite(regionState(state, world, state.player.region));
    const indoors = site?.structures.turfHut || (site?.structures.cabin && site.structures.hearth);
    return w.req.task === "lightIndoors" ? indoors === true : !indoors;
  }
  // The snow shelter closes once a hut or a cabin stands: warmer walls, and the same cell to camp on.
  if (w.req.task === "build" && w.req.arg === "snowShelter") {
    const site = campSite(regionState(state, world, state.player.region));
    return !(site?.structures.turfHut || site?.structures.cabin);
  }
  if (w.req.task === "hunt" && w.req.arg && w.req.arg !== "any") {
    const rec = RECOMMENDED[`hunt:${w.req.arg}`];
    if (rec && skillLevel(state, rec.skill) < rec.level) return false;
  }
  // Firewood by method: the axe while one is in reach, wedges and dead wood when none is.
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
  // The summer row digs by hand and says so with its own window; the winter row reaches the
  // rhizomes only through an ice hole, and an axe in reach is what keeps one open, so the axe
  // is what opens that row. resolveCell sends the winter dig to the hole rather than to the
  // frozen bog. The two rows are told apart by the window each carries.
  if (w.req.task === "roots" && w.req.when?.season?.from !== ROOT_FROM_DOY) return axeInReach(state, world);
  // Seaweed grows only on a sea shore: a camp on an inland lake never has this want to give.
  if (w.req.task === "seaweed") return regionAt(world, state.player.region).sea > 0;
  return true;
}

/**
 * The reference seeds. The first four are inland lake camps with no birch
 * in the home region, so a seed that exercises the sap window was chosen
 * by scanning seeds 1 to 300 for a proper start (not the ring-39 fallback)
 * with birch at home: 45 is the first that passes the April gate, and its
 * shore reads no large game, which the other four never test. No landing
 * in those 300 seeds is coastal, so seaweed and the sea shore are still
 * outside the instrument.
 */
export const REFERENCE_SEEDS = [17, 19, 42, 79, 45];
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
  return campFoodKcalAt(pileAt(state, regionState(state, world, state.player.region).campCell));
}

/** The food clause at a checkpoint: a beginner's day of food eaten on average over the week before it, so a body in deficit that eats what it catches reads fed and one living on its fat does not. */
export function fed(week: WeekAverage): boolean {
  return week.days > 0 && week.eaten >= FOOD_CLAUSE_KCAL;
}

const kcalFmt = (n: number) => `${Math.round(n).toLocaleString("en-US")} kcal`;

export interface UnexploitedItem {
  name: string;
  amount: string;
  /** What `weekBefore` credited from the source this item reads off, in the week before the death (or now, alive): "N kcal a day taken" or "none taken" (order ladder spec section 5). */
  taken: string;
}

/**
 * The non-lean calories accessible at a starvation death and not taken
 * (fat and carbohydrate design, section 1): fat, roe and eggs at camp or
 * in the pack, raw fat unrendered, bones uncracked at camp, a nest or
 * root stock above zero in its season, pine ground in the strip season,
 * an oily or spawning species already read at a shore, sap on birch
 * ground in its window, seaweed on a sea shore. Read from the state at
 * the death, not from the without probe's disabled sources - the probe
 * asks a different question (section 7).
 */
export function unexploited(state: GameState, world: World): UnexploitedItem[] {
  const out: UnexploitedItem[] = [];
  const cal = calendar(state.minute, state.startDoy);
  const region = state.player.region;
  const st = regionState(state, world, region);
  const camp = pileAt(state, st.campCell);
  const pack = state.player.pack;

  const day = state.dead ? dayNumber(state.dead.minute) : dayNumber(state.minute);
  const week = weekBefore(state.ledger, day);
  // Each item reads the ledger source its own kcal is booked under by
  // creditYield in tasks.ts: fat, rendered or raw, is credited at the kill
  // under "hunt"; a cracked bone's marrow is its own "marrow" credit; a
  // nest is the eggs job's own stock, so it reads "eggs", the source
  // gathering it would book to; an oily or spawning read is not itself a
  // catch, so it reads "fish", the source the catch it promises would book
  // to, rather than "roe" (the roe itself is a separate, later credit).
  const taken = (source: YieldSource) => (week.yield[source] > 1e-9 ? `${kcalFmt(week.yield[source])} a day taken` : "none taken");

  const atCampOrPack = (food: FoodId, campName: string, packName: string, source: YieldSource) => {
    const t = taken(source);
    const c = qty(camp, food);
    if (c > 1e-9) out.push({ name: campName, amount: kcalFmt(c * FOODS[food].kcalPerKg), taken: t });
    const k = qty(pack, food);
    if (k > 1e-9) out.push({ name: packName, amount: kcalFmt(k * FOODS[food].kcalPerKg), taken: t });
  };
  atCampOrPack("fat", "fat at camp", "fat in the pack", "hunt");
  atCampOrPack("roe", "roe at camp", "roe in the pack", "roe");
  atCampOrPack("eggs", "eggs at camp", "eggs in the pack", "eggs");

  const rawFat = qty(camp, "rawFat") + qty(pack, "rawFat");
  if (rawFat > 1e-9) out.push({ name: "raw fat unrendered", amount: `${rawFat.toFixed(1)} kg`, taken: taken("hunt") });

  const bones = qty(camp, "bone");
  if (bones > 1e-9) out.push({ name: "bones uncracked", amount: `${Math.round(bones)}`, taken: taken("marrow") });

  // Above zero and in season: nestsFor confirms the region structurally supports
  // the stock, beside the run's own depleting count. The roots need no such
  // second reading - what is left is counted off the ground itself, cell by cell.
  if (cal.dayOfYear >= EGG_FROM_DOY && cal.dayOfYear <= EGG_TO_DOY && st.nests > 1e-9 && nestsFor(world, st, region) > 1e-9) {
    out.push({ name: "nests", amount: `${st.nests.toFixed(1)} clutches`, taken: taken("eggs") });
  }

  const rootGround = (c: number) => heathCell(world, c) || watersideCell(world, c);
  const rootsLeft = rootKgLeft(st, world, region);
  if (cal.dayOfYear >= ROOT_FROM_DOY && cal.dayOfYear <= ROOT_TO_DOY && rootsLeft > 1e-9 && rootGround(nearestCell(state, world, rootGround))) {
    out.push({ name: "roots", amount: `${rootsLeft.toFixed(1)} kg`, taken: taken("roots") });
  }

  if (cal.dayOfYear >= BARK_FROM_DOY && cal.dayOfYear <= BARK_TO_DOY) {
    const pineGround = (c: number) => cellAt(world, c).terrain === "pine";
    if (pineGround(nearestCell(state, world, pineGround))) out.push({ name: "pine ground", amount: "reachable", taken: taken("bark") });
  }

  let oilyRead = false;
  let spawnRead = false;
  for (const [cellStr, obs] of Object.entries(state.player.known)) {
    if (cellAt(world, Number(cellStr)).region !== region) continue;
    for (const s of obs.fish) {
      if (SPECIES_DEFS[s].oily) oilyRead = true;
      if (inSpawn(s, cal.month)) spawnRead = true;
    }
  }
  if (oilyRead) out.push({ name: "oily fish read", amount: "at the shore", taken: taken("fish") });
  if (spawnRead) out.push({ name: "spawning fish read", amount: "roe at the shore", taken: taken("fish") });

  if (cal.dayOfYear >= SAP_FROM_DOY && cal.dayOfYear <= SAP_TO_DOY) {
    const birchGround = (c: number) => cellAt(world, c).terrain === "birch";
    if (birchGround(nearestCell(state, world, birchGround))) out.push({ name: "birch sap", amount: "in its window", taken: taken("sap") });
  }

  // seaweedAvailable is the seaweed task's own check (position and ice together), shared here so the two cannot drift.
  const seaGround = (c: number) => seaweedAvailable(state, world, c);
  if (seaGround(nearestCell(state, world, seaGround))) out.push({ name: "seaweed", amount: "on the sea shore", taken: taken("seaweed") });

  return out;
}

/** The unexploited line a starvation death's report carries: what sat accessible and was not taken, or "none" for luck or strategy (spec section 7). */
export function starvationCause(state: GameState, world: World): string {
  const u = unexploited(state, world);
  return u.length ? `unexploited: ${u.map((x) => `${x.name} ${x.amount}, ${x.taken}`).join(", ")}` : "unexploited: none";
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
  st.trap = { cell: shore.cell, kg: 0, oilyKg: 0, fish, age: 0 };
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
  // The kit stands somewhere: a camp on the region's own generated cell, the ground a
  // from-scratch run would most likely have sited one on. Every structure below is put
  // up there, so the camp has to exist before any of it does.
  const campCell = st.campCell ?? regionAt(world, p.region).campCell;
  st.campCell = campCell;
  for (const id of ["knife", "fireDrill", "fishingSpear", "bow"] as const) p.tools.push(freshTool(id));
  // One bucket in hand, empty: the fill task needs a vessel in hand, judged
  // at the shore where the camp pile is out of reach (spec 2.2). The second
  // sits at camp as capacity, same as a from-scratch camp would build up.
  p.tools.push(freshTool("barkBucket"));
  addItem(p.pack, "arrow", 10);
  addItem(p.pack, "driedMeat", 5);
  creditYield(state, "kit", 5 * FOODS.driedMeat.kcalPerKg);
  const camp = pile(state, campCell);
  addItem(camp, "barkBucket", 1);
  addItem(camp, "firewood", 20);
  const site = siteFor(st, campCell);
  site.structures.firePit = true;
  if (producers) {
    site.structures.turfHut = true;
    site.structures.waterStore = true;
    kitTrap(state, world);
  }
  // A camp this built is one somebody has lived at, so its own country is
  // known ground: the water and the wood are where the survivor has already
  // been. Without this the kit stands in a valley nobody has walked, and the
  // run dies of thirst beside a shore it may not route to.
  mapRegion(state, world, p.region);
}

/** How often the player script looks at the list: the cost of playing by hand is the idle time between looks. */
export const OPENING_TICK_MINUTES = 60;

/**
 * How often a player who is standing in for a due date comes back to move
 * the target, in either direction. A pile due in December is a plan a player
 * looks at about once a week, and a keep re-given every morning at a target
 * an eighth of a kilo apart is not a plan at all. It is the runner's habit
 * and no rule of the world's, so it lives here and nothing in the sim reads
 * it; the cadence itself is what its test asserts against.
 */
export const REGIVE_DAYS = 7;

/** Whether the ladder took the due date off this want, leaving the runner to pace it by hand. */
function pacedByHand(w: Want, best: Want): boolean {
  return w.req.when?.by !== undefined && best.req.when?.by === undefined;
}

/**
 * The player script (idle curve spec, section 2.5): the reference list is
 * what a competent player wants, and this gives each want as the best kind
 * and the most of its conditions the skill has earned, ranked where the
 * want sits.
 *
 * What the ladder strips off a want, the runner does by hand, which is what
 * a player who comes back each morning does with a plan they cannot yet
 * write down: a stripped season opens the want at its window's start and
 * withdraws it at the end; a stripped stock line opens and shuts it on what
 * the pile holds; a stripped restart line is read as a band, met at the
 * target and open again under the line; a stripped daily count is given
 * afresh each morning; and a stripped due date is a plain keep at today's
 * target, re-given as the target moves either way and no oftener than
 * REGIVE_DAYS - a player who cannot write the date down still reads the pile
 * they have against the winter left, and lowers the ask as readily as they
 * raised it.
 * Every one of those gives and withdrawals past the opening list is a
 * morning the player spent on the list, and so is a flip of a named runner
 * rule; `interventions` counts them and `attention` reads them back. At the
 * rung the order says it all itself and the count falls to nothing, which
 * is what the two upper rungs are worth.
 *
 * A stand-in that drops off is given again when the want is unmet; a want
 * given as its own kind that drops off is a finished job and is never given
 * twice, or the knife would be made again. Work that is wanted again
 * tomorrow says so on the want, with a count a day: a tap drunk on the spot
 * leaves nothing behind for a later look to read, so nothing but its own
 * daily count can bring it back. A keep given as a keep stays for good.
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
  /** The day a daily want was last started afresh, per want index: its count and its finished mark are cleared once a day and not again. */
  private dayOpened = new Map<number, number>();
  /** A restart line read by hand: whether the want last read met at its target, per want index. */
  private held = new Map<number, boolean>();
  /** A due date paced by hand: the day of year the want was first given on, the target it was last given at, and the day of that give. */
  private paced = new Map<number, { doy: number; qty: number; day: number }>();
  /** The day the list was first given, once it has been: that morning's gives are the plan rather than attention. */
  private openingDay: number | null = null;

  /** Every give and every withdrawal past the opening list, by day: what the plan cost the player in mornings. */
  readonly interventions = new Map<number, number>();

  /** The day the walk home ended, once it has; null while it is still under way or when there was none. */
  reachedDay: number | null = null;

  /** Whether the rest live now is `HAND_REST`, serving a hand move's need, rather than a real task the board is showing. */
  private servingHandRest = false;

  /**
   * `home` is the region of the old camp for an heir: the first log line
   * gives the bearing, and a competent player walks there before anything
   * else, since the camp orders deliver to is the region's own and the old
   * one has the fire site, the stone and the snares the list would otherwise
   * spend its first days on. The walk is the real travel task, paid in hours,
   * burn and nights on the way, and no order is given until the region is
   * reached. The first survivor has no home and starts on the list at once.
   */
  constructor(readonly wants: Want[] = REFERENCE_ORDERS, private home: number | null = null) {}

  /** The mornings between two days, inclusive, on which the list changed, and how many days were asked about. */
  attention(fromDay: number, toDay: number): { mornings: number; days: number } {
    let mornings = 0;
    for (let d = fromDay; d <= toDay; d++) if ((this.interventions.get(d) ?? 0) > 0) mornings++;
    return { mornings, days: toDay - fromDay + 1 };
  }

  /** The first morning this player's list stood, once it has: where a run's own attention count starts from. Day 1 before that first tick. */
  get startDay(): number {
    return this.openingDay ?? 1;
  }

  /** One act of attention, unless it is the opening list itself. */
  private note(cal: Calendar): void {
    if (this.openingDay === null || cal.day === this.openingDay) return;
    this.interventions.set(cal.day, (this.interventions.get(cal.day) ?? 0) + 1);
  }

  /** The want as an order to read off: the runner's own probe, never on any list. */
  private probe(i: number, done = 0): Order {
    const w = this.wants[i];
    return { id: -1, kind: w.kind, req: w.req, done, minutes: 0, skipped: "", held: this.held.get(i), givenDoy: this.paced.get(i)?.doy };
  }

  /**
   * Whether the want is one to have standing this morning, by the conditions
   * the skill cannot yet write on an order. A season and a stock line read
   * exactly as the scheduler would read them on the order itself; a restart
   * line is the same band, its mark kept here instead of on the order.
   */
  private byHand(state: GameState, world: World, cal: Calendar, i: number, best: Want): boolean {
    const want = this.wants[i].req.when;
    if (!want) return true;
    const given = best.req.when;
    const lost: OrderWhen = {};
    if (want.season && !given?.season) lost.season = want.season;
    if (want.stock && !given?.stock) lost.stock = want.stock;
    const p = this.probe(i);
    if ((lost.season || lost.stock) && conditionOpen(state, world, cal, { ...p, req: { ...p.req, when: lost } })) return false;
    if (want.restart !== undefined && given?.restart === undefined) {
      const held = keepBand(keepStock(state, world, p), keepTargetToday(cal, p), want.restart, this.held.get(i));
      this.held.set(i, held);
      if (held) return false;
    }
    return true;
  }

  /** Today's figure for a keep whose due date the runner is pacing by hand. */
  private pacedTarget(cal: Calendar, i: number): number {
    return keepTargetToday(cal, this.probe(i));
  }

  private withdraw(state: GameState, world: World, cal: Calendar, i: number, id: number): void {
    removeOrder(state, world, id);
    this.given.delete(i);
    this.trueKind.delete(i);
    this.note(cal);
  }

  private give(state: GameState, world: World, cal: Calendar, i: number, best: Want): void {
    const w = this.wants[i];
    const standIn = best.kind !== w.kind || best.req.until.kind !== w.req.until.kind;
    const units = !standIn ? undefined : best.req.until.kind === "once" ? 1 : best.req.until.kind === "times" ? best.req.until.n : undefined;
    const banked = this.completed.get(i) ?? 0;
    // A times want reaching its rung mid-count must not restart at n: what
    // it already banked from once-job stand-ins comes off the top, or the
    // fresh order over-builds by however much those stand-ins covered.
    let req = !standIn && best.req.until.kind === "times" && banked > 0 ? { ...best.req, until: { kind: "times" as const, n: best.req.until.n - banked } } : best.req;
    const pacing = pacedByHand(w, best);
    if (pacing && req.until.kind === "campHas") req = { ...req, until: { kind: "campHas" as const, qty: this.pacedTarget(cal, i) } };
    let rank = 0;
    for (const j of this.given.keys()) if (j < i) rank++;
    const o = giveOrder(state, world, req, best.kind, rank);
    this.given.set(i, { id: o.id, units });
    this.trueKind.set(i, !standIn);
    if (pacing) this.paced.set(i, { doy: this.paced.get(i)?.doy ?? cal.dayOfYear, qty: req.until.kind === "campHas" ? req.until.qty : 0, day: cal.day });
    this.note(cal);
  }

  tick(state: GameState, world: World): void {
    const cal = calendar(state.minute, state.startDoy);
    if (this.home !== null) {
      if (state.player.region !== this.home) {
        if (!this.handMoveBusy(state, world, cal) && handsFree(state)) {
          // A direct route may already be known; only when it is not does the
          // walk become a search - the same move a survivor cut off from a
          // known camp reaches for, pointed at this other region instead of
          // its own. Its own loop reads for an opened route after every leg,
          // not once an hour, so a bearing hop is left the moment a corridor
          // through it appears rather than swept whole for its own sake.
          if (!startTask(state, world, cal, "travel", `region:${this.home}`)) startTask(state, world, cal, "searchHome", `region:${this.home}`);
        }
        return;
      }
      this.reachedDay = cal.day;
      this.home = null;
    }
    // A sweep already under way is left running, or paused the moment the
    // body asks for something - the same order the runner already gives a
    // chosen order between the two, since exploring is watched the same way.
    if (this.handMoveBusy(state, world, cal)) return;
    // Nothing on the list can be done in a region with no camp: the fire site, the
    // deliveries and the night all address one. Siting it is the opening act.
    if (regionState(state, world, state.player.region).campCell === null) {
      if (handsFree(state)) startTask(state, world, cal, "makeCamp");
      return;
    }
    this.openingDay ??= cal.day;
    // Each morning a daily want starts over: yesterday's spent count is not this
    // morning's, and the finished mark that stopped it yesterday comes off. Both
    // the true counted job and the stand-in a skill under the rung gives instead
    // are stopped by that count, so both are cleared here.
    for (let i = 0; i < this.wants.length; i++) {
      if (this.wants[i].req.until.kind !== "daily" || this.dayOpened.get(i) === cal.day) continue;
      this.dayOpened.set(i, cal.day);
      this.finished.delete(i);
      this.completed.delete(i);
    }
    const list = ordersHere(state, world);
    for (const [i, g] of [...this.given]) {
      const w = this.wants[i];
      if (list.some((o) => o.id === g.id)) {
        const best = withinLadder(state, w.req, w.kind);
        // A want the morning has closed takes its standing order off the list
        // rather than leaving it to be worked out of season or against a pile
        // that already holds what it asked for: the woodpile given in September
        // would otherwise still be splitting through the following summer. It is
        // withdrawn, not finished, so it is given again when it reopens.
        if (!wantOpen(state, world, w) || !this.byHand(state, world, cal, i, best)) {
          this.withdraw(state, world, cal, i, g.id);
          continue;
        }
        // A keep standing in for a due date is replaced when the date has moved
        // the target, up in the autumn or down through the winter, which a
        // player does on their weekly look and not daily. Following the ask
        // down is the same act as following it up and costs the same morning:
        // a survivor who reads their own pile against the winter left stops
        // felling for a reserve the thaw will leave standing, rung or no rung.
        const p = this.paced.get(i);
        if (p && pacedByHand(w, best) && cal.day - p.day >= REGIVE_DAYS && Math.abs(this.pacedTarget(cal, i) - p.qty) > 1e-9) {
          this.withdraw(state, world, cal, i, g.id);
          this.give(state, world, cal, i, best);
        }
        continue;
      }
      // A completed want given as its own kind is a finished job for good, or the knife
      // would be made again. Work wanted again tomorrow says so with a count a day,
      // which the morning clear above reopens.
      if (this.trueKind.get(i)) this.finished.add(i);
      else if (g.units) this.completed.set(i, (this.completed.get(i) ?? 0) + g.units);
      this.given.delete(i);
      this.trueKind.delete(i);
    }
    for (let i = 0; i < this.wants.length; i++) {
      if (this.finished.has(i) || this.given.has(i)) continue;
      const w = this.wants[i];
      if (!wantOpen(state, world, w)) continue;
      const best = withinLadder(state, w.req, w.kind);
      if (!this.byHand(state, world, cal, i, best)) continue;
      if (orderMet(state, world, cal, this.probe(i, this.completed.get(i) ?? 0), false)) continue;
      // A want is given whether or not it can start: the list is a plan, and
      // a row's materials are cut by the rows above it.
      this.give(state, world, cal, i, best);
    }
    // A want the scheduler skipped with this exact reading is not short of
    // materials or a season; it is ground the survivor has not walked or
    // seen close enough to read (tasks.ts's own words for the same refusal,
    // read back here the way the panel already reads it off an order's own
    // skip line). Free hands between orders, with nothing the body wants
    // first, then go look, the way a person new to a valley walks it before
    // they know where the wood is - every want lives in this one region
    // (`where: "nearest"` never reaches past it), so mapping it whole is
    // what unblocks all of them at once, and knownShare reaching 1 is what
    // stops the sweep rather than a share picked by hand.
    if (
      handsFree(state) && !bodyAsks(state, world, cal) &&
      knownShare(state, world, state.player.region) < 1 &&
      ordersHere(state, world).some((o) => o.skipped === NO_KNOWN_WAY)
    ) {
      startTask(state, world, cal, "explore", `region:${state.player.region}`);
    }
  }

  /**
   * A sweep or a walk toward ground not yet known, watched the way the
   * click that started it would be: left running while nothing is owed,
   * paused the moment the body asks for something, and picked back up once
   * it has nothing left to ask. A plain "wait" is not what serves that
   * pause: runOrders claims any bare wait intent (no order behind it) as
   * its own and tears it down the moment its own order list is empty
   * (spec 2.3) - exactly the heir's list, every hour, which would undo the
   * serving before it ever drank. `HAND_REST` is a task runOrders has no
   * claim on, left running while the body's row does the serving. `servingHandRest` is what
   * tells that rest apart from a hand move still under way, so an ordinary
   * "nothing to do" is never read as one. True whenever a hand move, or
   * the rest serving one, is why nothing else happened this tick.
   */
  private handMoveBusy(state: GameState, world: World, cal: Calendar): boolean {
    if (this.servingHandRest) {
      if (bodyAsks(state, world, cal)) return true;
      this.servingHandRest = false;
      state.intent = null;
      return false;
    }
    if (state.task?.id !== "explore" && state.task?.id !== "travel" && state.task?.id !== "searchHome") return false;
    if (!bodyAsks(state, world, cal)) return true;
    setAside(state, world);
    const r = new Rng(state.rng);
    startIntent(state, world, cal, r, HAND_REST);
    state.rng = r.s;
    this.servingHandRest = true;
    return true;
  }
}

/** tasks.ts's own refusal for a walk with no route through known ground. */
const NO_KNOWN_WAY = "{you} {know} no way there";

/**
 * Free enough to send off exploring: nothing running at all, or nothing but
 * a filler rest, the runner's own word (or `handMoveBusy`'s) for "nothing
 * better to do" and not a want on any list. Real sleep is left alone - the
 * body's own need, not idle time to spend looking at the ground.
 */
function handsFree(state: GameState): boolean {
  return !state.task || state.task.id === "rest";
}

/** A rest with no order behind it, read as `handMoveBusy` serving a hand move rather than the list's own wait. */
const HAND_REST: IntentRequest = { task: "rest", until: { kind: "forever" }, deliver: "leave", where: "nearest" };

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
  /** For a starvation death, the unexploited line read at the moment it fell; null for any other outcome (spec 7). */
  unexploited: string | null;
  /** Mornings the list changed over the whole run, of the days it ran (order ladder spec section 4-5). */
  attention: { mornings: number; days: number };
}

function checkpoint(state: GameState, world: World, day: number): ReferenceReport["checkpoints"][number] {
  const p = state.player;
  const camp = pileAt(state, regionState(state, world, p.region).campCell);
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
    `sleep/day ${sleepH.toFixed(1)} h (${verdict(sleepH, SLEEP_HOURS)}), work/day ${(week.workMin / 60).toFixed(1)} h, lean-wall days ${week.leanWallDays} of ${week.days}`,
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
  const unexploitedLine = state.dead?.cause === "starved" ? starvationCause(state, world) : null;
  const attention = ref.player.attention(ref.player.startDay, day);
  return { seed: state.seed, startRing: world.startRing, checkpoints, outcome, passed, gate, gateDay, firstSnowDay, surplus, record: current(state), unexploited: unexploitedLine, attention };
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
  const oldSite = campSite(oldSt);
  const camp = pileAt(state, oldSt.campCell);
  const structures = (["firePit", "leanTo", "cabin", "dryingRack", "boughBed", "hearth", "turfHut", "waterStore", "snowShelter"] as const).filter((s) => oldSite?.structures[s]);
  const lc = cellAt(world, landCell);
  // Nobody made camp in the life before: there is no old camp to be any distance from.
  const cc = oldSt.campCell === null ? lc : cellAt(world, oldSt.campCell);
  return {
    structures: [...structures],
    campFoodKcal: Math.round(campFoodKcalAt(camp)),
    campFirewoodKg: Math.round(qty(camp, "firewood")),
    logs: Math.round(qty(camp, "log")),
    snares: oldSt.snares,
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
