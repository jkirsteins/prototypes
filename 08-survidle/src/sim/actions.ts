/**
 * Things that take no time: eating, throwing wood on the fire, picking up and
 * putting down. Tasks with a duration live in tasks.ts.
 */
import type { Rng } from "../rng";
import { clamp } from "../units";
import type { World } from "../world/gen";
import { feedFire, rackCapacity } from "./camp";
import { creditGut, creditLean, gutEatenToday, gutRefused, leanRefused } from "./gut";
import { herePile, qty, removeItem, totalQty, transfer, weight } from "./inventory";
import { AUTO_EAT_ORDER, FOODS, type FoodId, GUT, ITEM_KG, ITEM_NAMES, KCAL_FULL, KG_ITEMS } from "./items";
import { creditEaten } from "./ledger";
import { atCamp } from "./position";
import { body } from "./person";
import { regionState } from "./regionstate";
import { log } from "./log";
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
export function eat(state: GameState, world: World, food: FoodId, rng: Rng): boolean {
  const p = state.player;
  const def = FOODS[food];
  if (!edible(state, food)) return false;
  const invs = [p.pack, herePile(state, world)];
  const have = totalQty(invs, food);
  if (have <= 1e-9) return false;
  const wasFull = gutEatenToday(p, state.minute, food) > (GUT[food]?.fullCreditKg ?? Number.POSITIVE_INFINITY) + 1e-9;
  const taken = creditGut(p, state.minute, food, Math.min(def.portionKg, have));
  const kg = taken.kg;
  if (kg <= 1e-9) return false;
  let gain = kg * def.kcalPerKg * taken.credit;
  if (GUT[food]) {
    if (!wasFull && gutEatenToday(p, state.minute, food) > GUT[food]!.fullCreditKg + 1e-9) log(state, "{Your} stomach is turning.", "bad");
    if (gutRefused(p, state.minute, food)) log(state, `{You} cannot face another ${GUT_WORD[food] ?? ITEM_NAMES[food]}.`, "bad");
  }
  if (def.leanShare > 0) {
    const wasRefused = leanRefused(p, state.minute);
    gain = creditLean(p, state.minute, gain, def.leanShare);
    if (!wasRefused && leanRefused(p, state.minute)) log(state, "Lean meat is not filling {you}. {You} {need} fat.", "bad");
  }
  let left = kg;
  for (const inv of invs) {
    if (left <= 1e-9) break;
    left -= removeItem(inv, food, left);
  }
  // Past a full stomach the surplus is stored as fat, up to its own cap.
  const room = KCAL_FULL - p.kcal;
  if (gain <= room) {
    p.kcal += gain;
  } else {
    p.kcal = KCAL_FULL;
    p.fat = clamp(p.fat + (gain - room), 0, body(state).fatFull);
  }
  creditEaten(state, gain);
  if (def.sickChance && p.sick === 0 && rng.chance(def.sickChance)) {
    p.sick = 48 * 60;
    log(state, "The raw meat turns {your} stomach. A fever follows.", "bad");
  }
  return true;
}

/** The reserve under which the body eats on its own. */
export const HUNGRY_LINE = 1800;

/**
 * Eats when the reserve runs low: the order is least valuable first and fat
 * last, and the walk goes on until the line is passed or nothing is left
 * that the body will take. A refused food (a capped one past its line, lean
 * food past the ceiling) is skipped, not a stop, so a body at the lean wall
 * with fat at hand eats the fat rather than starving beside it, and a body
 * with room under the ceiling eats the lean food and keeps the fat.
 */
export function autoEat(state: GameState, world: World, rng: Rng, force = false): void {
  const p = state.player;
  if (!force && !p.autoEat) return;
  let guard = 0;
  while (p.kcal < HUNGRY_LINE && guard++ < 200) {
    let ate = false;
    for (const food of AUTO_EAT_ORDER) {
      if (eat(state, world, food, rng)) {
        ate = true;
        break;
      }
    }
    if (!ate) return;
  }
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
  if (!atCamp(state, world) || !st.structures.dryingRack) return 0;
  const invs = [p.pack, herePile(state, world)];
  const room = rackCapacity(st) - st.rack.kg;
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
    if (q > 0) transfer(p.pack, to, k, q);
  }
}

export function itemLabel(item: ItemId, q: number): string {
  if (item === "water" || item === "ice") return `${q.toFixed(1)} l ${ITEM_NAMES[item]}`;
  if (KG_ITEMS.has(item)) return `${q >= 10 ? Math.round(q) : q.toFixed(1)} kg ${ITEM_NAMES[item]}`;
  return `${Math.round(q)} ${ITEM_NAMES[item]}`;
}
