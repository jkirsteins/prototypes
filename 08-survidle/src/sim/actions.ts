/**
 * Things that take no time: eating, throwing wood on the fire, picking up and
 * putting down. Tasks with a duration live in tasks.ts.
 */
import type { Rng } from "../rng";
import { clamp } from "../units";
import type { World } from "../world/gen";
import { feedFire, rackCapacity } from "./camp";
import { creditGut, creditLean, gutEatenToday, gutRefused, leanEatenToday, leanRefused } from "./gut";
import { herePile, qty, removeItem, totalQty, transfer, weight } from "./inventory";
import { AUTO_EAT_ORDER, FOODS, type FoodId, GUT, ITEM_KG, ITEM_NAMES, itemLabel, KCAL_FULL } from "./items";
import { creditEaten } from "./ledger";
import { atCamp } from "./position";
import { body, fatLandmarks } from "./person";
import { current } from "./record";
import { campSite, regionState } from "./regionstate";
import { log, warn } from "./log";
import type { GameState, ItemId } from "./types";

/** The gut's own word for a capped food, for its refusal message; later capped foods add their word here. */
const GUT_WORD: Partial<Record<FoodId, string>> = { berries: "berry", barkFlour: "bark", seaweed: "mouthful of seaweed" };

/** Why this food is refused right now, or null if it is not: a capped food past its refusal, or a lean food past the ceiling. The one place either check lives. */
export function refusalReason(state: GameState, food: FoodId): string | null {
  const p = state.player;
  if (gutRefused(p, state.minute, food)) return `not another ${GUT_WORD[food] ?? ITEM_NAMES[food]} today`;
  if (FOODS[food].leanShare > 0 && leanRefused(p, state.minute)) return "not more lean meat today";
  return null;
}

/** A food the body will take right now. */
export function edible(state: GameState, food: FoodId): boolean {
  return refusalReason(state, food) === null;
}

/** Eats one portion of a food from pack or the pile here. Returns false if none. */
/** Eats one portion. Returns the kilos taken, or nought when nothing was. */
export function eat(state: GameState, world: World, food: FoodId, rng: Rng): number {
  const p = state.player;
  const def = FOODS[food];
  if (!edible(state, food)) return 0;
  const invs = [p.pack, herePile(state, world)];
  const have = totalQty(invs, food);
  if (have <= 1e-9) return 0;
  const wasFull = gutEatenToday(p, state.minute, food) > (GUT[food]?.fullCreditKg ?? Number.POSITIVE_INFINITY) + 1e-9;
  const taken = creditGut(p, state.minute, food, Math.min(def.portionKg, have));
  const kg = taken.kg;
  if (kg <= 1e-9) return 0;
  let gain = kg * def.kcalPerKg * taken.credit;
  if (GUT[food]) {
    if (!wasFull && gutEatenToday(p, state.minute, food) > GUT[food]!.fullCreditKg + 1e-9) log(state, "{Your} stomach is turning.", "bad");
    if (gutRefused(p, state.minute, food)) log(state, `{You} cannot face another ${GUT_WORD[food] ?? ITEM_NAMES[food]}.`, "bad");
  }
  let leanPart = 0;
  if (def.leanShare > 0) {
    const wasRefused = leanRefused(p, state.minute);
    const before = leanEatenToday(p, state.minute);
    gain = creditLean(p, state.minute, gain, def.leanShare);
    leanPart = leanEatenToday(p, state.minute) - before;
    if (!wasRefused && leanRefused(p, state.minute)) log(state, "Lean meat is not filling {you}. {You} {need} fat.", "bad");
  }
  let left = kg;
  for (const inv of invs) {
    if (left <= 1e-9) break;
    left -= removeItem(inv, food, left);
  }
  // The stomach fills to its cap; the energy eaten goes to fat in full,
  // whether or not it fit. Fullness and the energy store are two separate
  // books, so a portion too small to reach the cap still banks its own gain.
  p.kcal = Math.min(KCAL_FULL, p.kcal + gain);
  p.fat += gain;
  creditEaten(state, gain, leanPart);
  if (def.sickChance && p.sick === 0 && rng.chance(def.sickChance)) {
    p.sick = 48 * 60;
    log(state, "The raw meat turns {your} stomach. A fever follows.", "bad");
  }
  // The kilos taken, so a caller can say what a meal cost. Nought means
  // nothing was eaten, which is what every early return says.
  return kg;
}

/**
 * The reserve under which a body in the settling zone eats on its own -
 * hungerLine(state) below carries this same value there and moves off it
 * only outside the zone. The walk below stops as soon as the line is passed
 * rather than filling the stomach, so this is not a floor the body bounces
 * off occasionally - it is where a fed body lives, and where the bar draws
 * its mark. tests/hunger.test.ts holds that resting band inside the upper
 * half of KCAL_FULL.
 */
export const HUNGRY_LINE = 1800;

/**
 * The reserve a meal is eaten up to, once it has started, for a body in the
 * settling zone - satietyTarget(state) below carries this same value there.
 * HUNGRY_LINE answers when eating begins; this answers when it stops, and
 * holding the two apart is what a meal is. What a meal should feel like:
 * filled well past the hunger line at 1800, short of a stomach stuffed to
 * the 3000 cap - the reserve someone eating to satisfaction, not to
 * bursting, stops at.
 */
export const SATIETY_BASE = 2600;

/**
 * How far hunger climbs when the reserve is spent, as a share of the gap
 * between the baseline and a full stomach. Leptin falls with the fat it is
 * secreted in proportion to, and a starving body's drive to regain what it
 * lost is the strong half of appetite - so this is the full share, taken
 * whole rather than damped.
 */
const HUNGER_RISE = 1;
/**
 * How far appetite falls once the reserve is past the upper landmark, as a
 * share of the same gap. A fraction of HUNGER_RISE: gaining fat has no
 * leptin-strength brake behind it, only a weak, separate mechanism, so a
 * body carrying a large reserve is nudged rather than driven off it - a good
 * autumn can still put weight on.
 */
const HUNGER_FALL = 0.25;
/** The reserve, in multiples of the settling zone's width above the upper landmark, at which the fall is fully in. */
const FALL_SPAN = 1;

/**
 * Where appetite sits for the reserve the body is carrying, as a share:
 * +1 fully hungry, 0 the settling zone, -1 fully sated. Flat across the
 * settling zone, steep below the lower landmark, gentle above the upper one.
 */
function appetite(state: GameState): number {
  const l = fatLandmarks(current(state).person);
  const fat = state.player.fat;
  if (fat < l.lower) {
    // Square it, so the drive is mild just under the landmark and fierce near the floor.
    const into = clamp((l.lower - fat) / (l.lower - l.floor), 0, 1);
    return into * into;
  }
  if (fat > l.upper) return -clamp((fat - l.upper) / ((l.upper - l.lower) * FALL_SPAN), 0, 1);
  return 0;
}

/** The reserve at which this body decides to eat. Drawn on the Food bar. */
export function hungerLine(state: GameState): number {
  const a = appetite(state);
  const span = KCAL_FULL - HUNGRY_LINE;
  return HUNGRY_LINE + span * (a >= 0 ? a * HUNGER_RISE : a * HUNGER_FALL);
}

/**
 * The reserve a meal is eaten up to. Mirrors hungerLine's shape on the same
 * span of headroom above SATIETY_BASE, so the two constants carry the same
 * asymmetry here as they do there - a satiety target computed off some other
 * width would let the fall arm outweigh the rise arm even though the rise is
 * meant to dominate.
 */
export function satietyTarget(state: GameState): number {
  const a = appetite(state);
  const span = KCAL_FULL - SATIETY_BASE;
  return SATIETY_BASE + span * (a >= 0 ? a * HUNGER_RISE : a * HUNGER_FALL);
}

/**
 * Eats when the reserve runs low: the order is least valuable first and fat
 * last, and the walk goes on until the satiety target is passed or nothing
 * is left that the body will take. A refused food (a capped one past its
 * line, lean food past the ceiling) is skipped, not a stop, so a body at the
 * lean wall with fat at hand eats the fat rather than starving beside it,
 * and a body with room under the ceiling eats the lean food and keeps the
 * fat.
 *
 * Entry is still gated on hungerLine(state): a body above the line does not
 * eat at all, no matter how far below satietyTarget(state) it sits. Once a
 * meal starts, it fills past the line it started at, up to the target - that
 * is what turns "just enough" into a surplus the body can store. Both move
 * with the reserve the body is carrying; HUNGRY_LINE and SATIETY_BASE are
 * only their settling-zone values.
 *
 * The meal speaks once, not once a portion: crossing the target takes
 * several portions and a line each would bury the log. Crossing the hungry
 * line with nothing to take speaks once too, and does not speak again until
 * a meal has cleared the latch - the news a player can still act on is that
 * the food ran out, and repeating it every minute is not more news.
 *
 * Whether the survivor stops to eat at all is the body row's question, asked
 * where the player ranks that row against the work.
 */
export function autoEat(state: GameState, world: World, rng: Rng): void {
  const p = state.player;
  const line = hungerLine(state);
  if (p.kcal >= line) {
    warn(state, "hungry", false, "");
    return;
  }
  const target = satietyTarget(state);
  const eaten = new Map<FoodId, number>();
  let guard = 0;
  while (p.kcal < target && guard++ < 200) {
    let ate = false;
    for (const food of AUTO_EAT_ORDER) {
      // eat reports the kilos it took, so the meal is measured where it
      // happens rather than by weighing the pack before and after - which
      // reads wrong the moment a portion comes out of two inventories.
      const kg = eat(state, world, food, rng);
      if (kg > 0) {
        eaten.set(food, (eaten.get(food) ?? 0) + kg);
        ate = true;
        break;
      }
    }
    if (!ate) break;
  }
  if (eaten.size > 0) {
    const parts = [...eaten].map(([food, kg]) => itemLabel(food, kg));
    log(state, `{You} {eat} ${listWords(parts)}.`);
  }
  // Still under the line after the walk means the meal did not happen: the
  // fat behind the stomach is what the next hours come out of, and this is
  // the last moment the player can still do something about it. The latch
  // clears itself the next time a meal carries the body back over.
  warn(state, "hungry", p.kcal < line, "Nothing left {you} can eat. {Your} body starts on its fat.");
}

/** "a, b and c" - the meal's foods in one line. */
function listWords(parts: string[]): string {
  if (parts.length <= 1) return parts[0] ?? "";
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

export function addFirewood(state: GameState, world: World, kg: number): number {
  const p = state.player;
  if (!atCamp(state, world)) return 0;
  const st = regionState(state, world, p.region);
  if (!st.fire.lit) return 0;
  return feedFire(state, world, p.region, kg);
}

/** Hangs raw meat on the rack at this camp. Returns kg hung. */
export function loadRack(state: GameState, world: World): number {
  const p = state.player;
  const st = regionState(state, world, p.region);
  const site = campSite(st);
  if (!atCamp(state, world) || !site?.structures.dryingRack) return 0;
  const invs = [p.pack, herePile(state, world)];
  const room = rackCapacity(site) - st.rack.kg;
  const kg = Math.min(room, totalQty(invs, "rawMeat"));
  if (kg <= 1e-9) return 0;
  let left = kg;
  for (const inv of invs) {
    if (left <= 1e-9) break;
    left -= removeItem(inv, "rawMeat", left);
  }
  st.rack.kg += kg;
  return kg;
}

/** Picks n of an item off the ground into the pack, as far as the hard limit allows. Water and ice live only in piles (spec 2.1) and are refused. */
export function take(state: GameState, world: World, item: ItemId, n: number): number {
  if (item === "water" || item === "ice") return 0;
  const p = state.player;
  const from = herePile(state, world);
  const room = body(state).packHardKg - weight(p.pack);
  const unit = ITEM_KG[item];
  const max = unit >= 1 ? Math.floor(room / unit + 1e-9) : room / unit;
  const want = Math.min(n, qty(from, item), Math.max(0, max));
  if (want <= 0) return 0;
  return transfer(from, p.pack, item, want);
}

export function drop(state: GameState, world: World, item: ItemId, n: number): number {
  const p = state.player;
  return transfer(p.pack, herePile(state, world), item, Math.min(n, qty(p.pack, item)));
}

export function dropAll(state: GameState, world: World): void {
  const p = state.player;
  const to = herePile(state, world);
  for (const k of Object.keys(ITEM_KG) as ItemId[]) {
    const q = qty(p.pack, k);
    if (q <= 0) continue;
    transfer(p.pack, to, k, q);
  }
}

export { itemLabel } from "./items";
