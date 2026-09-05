import { PACK_COMFORTABLE_KG } from "../units";
import type { World } from "../world/gen";
import { CLOTHING, ITEM_KG, type Need, SPOIL_HOURS, TOOLS } from "./items";
import { cellAt } from "../world/gen";
import { log } from "./log";
import { cellOf } from "./position";
import {
  type GameState, type Inventory, type ItemId, PERISHABLES, type PerishableId,
  type Player, type Tool, type ToolId,
} from "./types";

export function emptyInventory(): Inventory {
  return { items: {}, stacks: {} };
}

function isPerishable(item: ItemId): item is PerishableId {
  return (PERISHABLES as string[]).includes(item);
}

export function qty(inv: Inventory, item: ItemId): number {
  if (isPerishable(item)) {
    let sum = 0;
    for (const s of inv.stacks[item] ?? []) sum += s.kg;
    return sum;
  }
  return inv.items[item] ?? 0;
}

export function weight(inv: Inventory): number {
  let kg = 0;
  for (const k of Object.keys(inv.items) as ItemId[]) kg += (inv.items[k] ?? 0) * ITEM_KG[k];
  for (const p of PERISHABLES) kg += qty(inv, p);
  return kg;
}

/** Weight of everything the player carries: pack, tools and worn clothing. */
export function carried(p: Player): number {
  let kg = weight(p.pack);
  for (const t of p.tools) kg += TOOLS[t.id].kg + (t.litres ?? 0);
  for (const g of p.clothing) kg += CLOTHING[g.id].kg;
  return kg;
}

export function addItem(inv: Inventory, item: ItemId, n: number): void {
  if (n <= 0) return;
  if (isPerishable(item)) {
    let stacks = inv.stacks[item];
    if (!stacks) {
      stacks = [];
      inv.stacks[item] = stacks;
    }
    const fresh = stacks.find((s) => s.age === 0);
    if (fresh) fresh.kg += n;
    else stacks.push({ kg: n, age: 0 });
    return;
  }
  inv.items[item] = (inv.items[item] ?? 0) + n;
}

/** Removes up to n, oldest first for perishables. Returns what was actually removed. */
export function removeItem(inv: Inventory, item: ItemId, n: number): number {
  if (n <= 0) return 0;
  if (isPerishable(item)) {
    const stacks = inv.stacks[item] ?? [];
    let left = n;
    while (left > 1e-9 && stacks.length) {
      const s = stacks[0];
      const take = Math.min(s.kg, left);
      s.kg -= take;
      left -= take;
      if (s.kg <= 1e-9) stacks.shift();
    }
    return n - left;
  }
  const have = inv.items[item] ?? 0;
  const take = Math.min(have, n);
  if (take >= have) delete inv.items[item];
  else inv.items[item] = have - take;
  return take;
}

export function isEmpty(inv: Inventory): boolean {
  return weight(inv) <= 1e-9;
}

/** Every item id present, counts first then perishables, stable order. */
export function listItems(inv: Inventory): { item: ItemId; qty: number }[] {
  const out: { item: ItemId; qty: number }[] = [];
  for (const k of Object.keys(ITEM_KG) as ItemId[]) {
    const q = qty(inv, k);
    if (q > 1e-9) out.push({ item: k, qty: q });
  }
  return out;
}

/** The pile on a cell, created on first use. Empty piles are swept by tidyPiles. */
export function pile(state: GameState, cell: number): Inventory {
  let inv = state.piles[cell];
  if (!inv) {
    inv = emptyInventory();
    state.piles[cell] = inv;
  }
  return inv;
}

/** The pile under the player's feet. */
export function herePile(state: GameState, world: World): Inventory {
  return pile(state, cellOf(state, world));
}

/** Pack plus the pile the player stands on: what a task may consume. */
export function reach(state: GameState, world: World): Inventory[] {
  return [state.player.pack, herePile(state, world)];
}

/** Drops empty piles so the map does not mark bare ground. */
export function tidyPiles(state: GameState): void {
  for (const k of Object.keys(state.piles)) {
    const inv = state.piles[Number(k)];
    if (inv && isEmpty(inv)) delete state.piles[Number(k)];
  }
}

/** Cells in a region that have something lying on them. */
export function pilesIn(state: GameState, world: World, region: number): { cell: number; inv: Inventory }[] {
  const out: { cell: number; inv: Inventory }[] = [];
  for (const k of Object.keys(state.piles)) {
    const cell = Number(k);
    const inv = state.piles[cell];
    if (inv && !isEmpty(inv) && cellAt(world, cell).region === region) out.push({ cell, inv });
  }
  return out;
}

export function totalQty(invs: Inventory[], item: ItemId): number {
  let n = 0;
  for (const inv of invs) n += qty(inv, item);
  return n;
}

/** Which item satisfies a need: the primary, else the substitute, else null. */
export function resolveNeed(invs: Inventory[], need: Need): ItemId | null {
  if (totalQty(invs, need.item) >= need.qty - 1e-9) return need.item;
  if (need.alt && totalQty(invs, need.alt) >= need.qty - 1e-9) return need.alt;
  return null;
}

export function canConsume(invs: Inventory[], needs: Need[]): boolean {
  return needs.every((n) => resolveNeed(invs, n) !== null);
}

/** Takes the needs out of the inventories, pack first. Caller checks canConsume. */
export function consume(invs: Inventory[], needs: Need[]): void {
  for (const need of needs) {
    const item = resolveNeed(invs, need) ?? need.item;
    let left = need.qty;
    for (const inv of invs) {
      if (left <= 1e-9) break;
      left -= removeItem(inv, item, left);
    }
  }
}

/**
 * Where something just made goes: the pack while it is under the comfortable
 * limit, otherwise the ground. Logs, water and ice are never pocketed.
 */
export function produce(state: GameState, world: World, item: ItemId, n: number): "pack" | "pile" {
  const p = state.player;
  const addedKg = n * ITEM_KG[item];
  if (item !== "log" && item !== "water" && item !== "ice" && weight(p.pack) + addedKg <= PACK_COMFORTABLE_KG + 1e-9) {
    addItem(p.pack, item, n);
    return "pack";
  }
  addItem(herePile(state, world), item, n);
  return "pile";
}

/** Moves up to n of an item between inventories. Returns what moved. */
export function transfer(from: Inventory, to: Inventory, item: ItemId, n: number): number {
  const moved = removeItem(from, item, n);
  addItem(to, item, moved);
  return moved;
}

/** Ages perishable stacks by dt minutes when it is warm, and throws away what has gone off. Returns kg lost per item. */
export function ageStacks(inv: Inventory, dt: number, ambient: number): Partial<Record<PerishableId, number>> {
  const lost: Partial<Record<PerishableId, number>> = {};
  if (ambient <= 0) return lost;
  for (const p of PERISHABLES) {
    const stacks = inv.stacks[p];
    if (!stacks?.length) continue;
    const limit = SPOIL_HOURS[p] * 60;
    for (const s of stacks) s.age += dt;
    const keep = stacks.filter((s) => s.age < limit);
    if (keep.length !== stacks.length) {
      let gone = 0;
      for (const s of stacks) if (s.age >= limit) gone += s.kg;
      lost[p] = gone;
      inv.stacks[p] = keep;
    }
  }
  return lost;
}

export function tool(p: Player, id: ToolId) {
  return p.tools.find((t) => t.id === id);
}

export function hasTool(p: Player, id: ToolId): boolean {
  return tool(p, id) !== undefined;
}

/** A tool in hand, or one lying in any of these inventories waiting to be taken up. */
export function toolNear(p: Player, id: ToolId, invs: Inventory[]): boolean {
  return hasTool(p, id) || totalQty(invs, id) > 0;
}

/** A fresh tool: full durability, and a vessel starts empty and thawed. */
export function freshTool(id: ToolId): Tool {
  return TOOLS[id].litres !== undefined ? { id, durability: 100, litres: 0, frozen: false } : { id, durability: 100 };
}

/**
 * Takes one of this tool out of the pack, else off the ground under foot,
 * into the hands at full durability. False when there is none in reach. A
 * tool in hand is never put down, so durability never lives in a pile.
 */
export function takeUp(state: GameState, world: World, id: ToolId): boolean {
  const p = state.player;
  for (const inv of [p.pack, herePile(state, world)]) {
    if (removeItem(inv, id, 1) < 1) continue;
    p.tools = p.tools.filter((t) => t.id !== id);
    p.tools.push(freshTool(id));
    return true;
  }
  return false;
}

/** Wears a tool by n points; returns true if it broke. A spare in the pack is taken up in the same breath. */
export function wearTool(state: GameState, id: ToolId, n: number): boolean {
  const p = state.player;
  const t = tool(p, id);
  if (!t) return false;
  t.durability -= n;
  if (t.durability > 0) return false;
  p.tools = p.tools.filter((x) => x !== t);
  if (removeItem(p.pack, id, 1) >= 1) {
    p.tools.push(freshTool(id));
    log(state, `The ${TOOLS[id].name} has broken; you take up the spare.`);
  }
  return true;
}
