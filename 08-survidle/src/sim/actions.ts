/**
 * Things that take no time: eating, throwing wood on the fire, picking up and
 * putting down. Tasks with a duration live in tasks.ts.
 */
import type { Rng } from "../rng";
import { PACK_HARD_KG } from "../units";
import type { World } from "../world/gen";
import { feedFire } from "./camp";
import { herePile, qty, removeItem, totalQty, transfer, weight } from "./inventory";
import { atCamp } from "./position";
import { regionState } from "./regionstate";
import { AUTO_EAT_ORDER, FOODS, type FoodId, ITEM_KG, ITEM_NAMES, KCAL_FULL, RACK_MAX_KG } from "./items";
import { log } from "./log";
import type { GameState, ItemId } from "./types";

/** Eats one portion of a food from pack or the pile here. Returns false if none. */
export function eat(state: GameState, world: World, food: FoodId, rng: Rng): boolean {
  const p = state.player;
  const def = FOODS[food];
  const invs = [p.pack, herePile(state, world)];
  const have = totalQty(invs, food);
  if (have <= 1e-9) return false;
  const kg = Math.min(def.portionKg, have);
  let left = kg;
  for (const inv of invs) {
    if (left <= 1e-9) break;
    left -= removeItem(inv, food, left);
  }
  p.kcal = Math.min(KCAL_FULL, p.kcal + kg * def.kcalPerKg);
  if (def.sickChance && p.sick === 0 && rng.chance(def.sickChance)) {
    p.sick = 48 * 60;
    log(state, "The raw meat turns your stomach. A fever follows.", "bad");
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
  const room = RACK_MAX_KG - st.rack.kg;
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

/** Picks n of an item off the ground into the pack, as far as the hard limit allows. */
export function take(state: GameState, world: World, item: ItemId, n: number): number {
  const p = state.player;
  const from = herePile(state, world);
  const room = PACK_HARD_KG - weight(p.pack);
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
  if (ITEM_KG[item] === 1) return `${q >= 10 ? Math.round(q) : q.toFixed(1)} kg ${ITEM_NAMES[item]}`;
  return `${Math.round(q)} ${ITEM_NAMES[item]}`;
}
