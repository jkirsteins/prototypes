/**
 * Things that take no time: eating, throwing wood on the fire, picking up and
 * putting down. Tasks with a duration live in tasks.ts.
 */
import type { Rng } from "../rng";
import { clamp } from "../units";
import type { World } from "../world/gen";
import { berriesRefused } from "./berries";
import { dayNumber } from "./calendar";
import { feedFire, rackCapacity } from "./camp";
import { herePile, qty, removeItem, totalQty, transfer, weight } from "./inventory";
import { creditEaten } from "./ledger";
import { creditLean, leanRefused } from "./lean";
import { atCamp } from "./position";
import { body } from "./person";
import { regionState } from "./regionstate";
import { AUTO_EAT_ORDER, FOODS, type FoodId, ITEM_KG, ITEM_NAMES, KCAL_FULL, KG_ITEMS, LEAN_FOODS } from "./items";
import { log } from "./log";
import { BERRY } from "./tables";
import type { GameState, ItemId } from "./types";

/** A food the body will take right now: berries and lean foods each past their day's ceiling are refused. */
export function edible(state: GameState, food: FoodId): boolean {
  if (food === "berries") return !berriesRefused(state.player, state.minute);
  if (LEAN_FOODS.has(food)) return !leanRefused(state.player, state.minute);
  return true;
}

/** Eats one portion of a food from pack or the pile here. Returns false if none. */
export function eat(state: GameState, world: World, food: FoodId, rng: Rng): boolean {
  const p = state.player;
  const def = FOODS[food];
  if (!edible(state, food)) return false;
  const invs = [p.pack, herePile(state, world)];
  const have = totalQty(invs, food);
  if (have <= 1e-9) return false;
  let kg = Math.min(def.portionKg, have);
  let gain = kg * def.kcalPerKg;
  if (food === "berries") {
    const day = dayNumber(state.minute);
    if (p.berriesToday.day !== day) p.berriesToday = { day, kg: 0 };
    const before = p.berriesToday.kg;
    kg = Math.min(kg, BERRY.refuseKg - before);
    // Past two kilos the gut absorbs half; past four it will not take another.
    const full = Math.max(0, Math.min(kg, BERRY.fullCreditKg - before));
    gain = (full + (kg - full) / 2) * def.kcalPerKg;
    const after = before + kg;
    p.berriesToday.kg = after;
    if (before <= BERRY.fullCreditKg + 1e-9 && after > BERRY.fullCreditKg + 1e-9) log(state, "{Your} stomach is turning.", "bad");
    if (after >= BERRY.refuseKg - 1e-9) log(state, "{You} cannot face another berry.", "bad");
  }
  if (LEAN_FOODS.has(food)) {
    const wasRefused = leanRefused(p, state.minute);
    gain = creditLean(p, state.minute, gain);
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

/** Eats the least valuable safe food when the reserve runs low. */
export function autoEat(state: GameState, world: World, rng: Rng): void {
  const p = state.player;
  if (!p.autoEat || p.kcal >= 1800) return;
  for (const food of AUTO_EAT_ORDER) {
    if (eat(state, world, food, rng)) return;
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
