import type { World } from "../world/gen";
import { CLOTHING, FREEZE_KEEP_C, ITEM_KG, itemLabel, type Need, SPOIL_HOURS, TOOLS } from "./items";
import { cellAt } from "../world/gen";
import { log } from "./log";
import { body } from "./person";
import { campCellOf, cellOf } from "./position";
import {
  type GameState, type Inventory, type ItemId, PERISHABLES, type PerishableId,
  type Player, type Tool, type ToolId,
} from "./types";

export function emptyInventory(): Inventory {
  return { items: {}, stacks: {} };
}

/**
 * Below this a quantity is a floating-point residue rather than stock:
 * `consume` stops at it and takes nothing, `removeItem` drops the stack and
 * `listItems` does not name it. So anything that reads a pile to decide
 * whether work is possible must compare against this and not against zero.
 * A task that reads a residue as stock is legal, consumes nothing and is
 * offered again the moment it finishes: a level-20 camp with 2e-13 kg of
 * roots left cooked them a minute at a time for six hours a day and starved
 * on day 82 with the whole list below the cook waiting.
 */
export const TRACE_KG = 1e-9;

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

export type PileCategory = "firewood" | "wetFirewood" | "perishable";

/**
 * A live index over state.piles: which cells currently hold dry firewood,
 * wet firewood, or a perishable stack. fire.ts's drying and wetting passes
 * and camp.ts's spoilage pass walk this instead of every cell state.piles
 * has ever recorded, most of which by the time a run is old hold nothing
 * but stone or bark that nobody is walking back for.
 *
 * Built once per GameState instance, lazily, the first time pileCells reads
 * any category for it - a full scan of state.piles that also makes a state
 * loaded from a save, or handed over freshly cloned for a forecast, correct
 * from its very first read rather than only from its first write onward.
 * From there it is kept current incrementally: addItem, removeItem and
 * ageStacks each re-derive one cell's membership right after they touch a
 * pile's inventory (a no-op for any inventory the index has not tagged as a
 * pile, chiefly the player's pack), tidyPiles drops a cell the moment its
 * pile is swept away empty, and pile() tags a cell's inventory the moment
 * anything asks for it. Every path that creates or changes a pile - produce,
 * transfer, hauling, dropping, a carcass dressed onto the ground, the away
 * catch-up loop - goes through addItem, removeItem or pile() here, so none
 * of those callers has to remember to maintain this on its own.
 */
type PileIndex = Record<PileCategory, Set<number>>;

const pileIndexes = new WeakMap<GameState, PileIndex>();
const pileOwner = new WeakMap<Inventory, { state: GameState; cell: number }>();

function classify(inv: Inventory): Record<PileCategory, boolean> {
  return {
    firewood: qty(inv, "firewood") > TRACE_KG,
    wetFirewood: qty(inv, "wetFirewood") > TRACE_KG,
    perishable: PERISHABLES.some((id) => inv.stacks[id]?.length),
  };
}

function applyClassification(idx: PileIndex, cell: number, has: Record<PileCategory, boolean>): void {
  for (const category of Object.keys(has) as PileCategory[]) {
    if (has[category]) idx[category].add(cell);
    else idx[category].delete(cell);
  }
}

function ensurePileIndex(state: GameState): PileIndex {
  let idx = pileIndexes.get(state);
  if (idx) return idx;
  idx = { firewood: new Set(), wetFirewood: new Set(), perishable: new Set() };
  for (const key of Object.keys(state.piles)) {
    const cell = Number(key);
    const inv = state.piles[cell];
    if (!inv) continue;
    pileOwner.set(inv, { state, cell });
    applyClassification(idx, cell, classify(inv));
  }
  pileIndexes.set(state, idx);
  return idx;
}

/** Re-derives one pile's membership in the live index after it may have changed. A no-op for any inventory the index has not tagged as a pile. */
function reindexPile(inv: Inventory): void {
  const owner = pileOwner.get(inv);
  if (!owner) return;
  applyClassification(ensurePileIndex(owner.state), owner.cell, classify(inv));
}

/** The cells in one live-index category, in the same ascending order Object.keys(state.piles) reads by default, so a caller that switches a scan to this loses nothing of the order its results or log lines come out in. */
export function pileCells(state: GameState, category: PileCategory): number[] {
  return [...ensurePileIndex(state)[category]].sort((a, b) => a - b);
}

/**
 * Test-only trip-wire: compares whichever live index already exists for
 * this state - built by an earlier pileCells read or mutation, untouched
 * here - against a fresh scan of state.piles, and throws naming the first
 * mismatch. A plain object cannot refuse a raw write straight onto
 * inv.stacks or inv.items, so a future bypass of addItem, removeItem,
 * addAgedStack, ageStacks or pile() cannot be made impossible; this is how
 * it is instead made to fail loudly the moment a test calls it, rather than
 * silently skipping a pile some loop should have visited. Does nothing if
 * no index has been built yet for this state - call pileCells, or make any
 * mutation, first, the same way real play would have.
 */
export function assertPileIndexConsistent(state: GameState): void {
  const idx = pileIndexes.get(state);
  if (!idx) return;
  for (const category of Object.keys(idx) as PileCategory[]) {
    const truth = new Set<number>();
    for (const key of Object.keys(state.piles)) {
      const cell = Number(key);
      const inv = state.piles[cell];
      if (inv && classify(inv)[category]) truth.add(cell);
    }
    const live = idx[category];
    const missing = [...truth].filter((cell) => !live.has(cell));
    const extra = [...live].filter((cell) => !truth.has(cell));
    if (missing.length || extra.length) {
      throw new Error(`pile index out of sync for "${category}": missing ${missing.join(", ") || "none"}, stale ${extra.join(", ") || "none"}`);
    }
  }
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
  if (p.torch.minutes > 0) kg += ITEM_KG.torch;
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
    reindexPile(inv);
    return;
  }
  inv.items[item] = (inv.items[item] ?? 0) + n;
  reindexPile(inv);
}

/**
 * Adds one perishable stack at a specific age rather than fresh: what a
 * transfer of already-ageing food (a pack laid down at death, a carcass
 * moved whole) has to preserve, since addItem always starts a stack at age
 * zero. This is the one other place, besides addItem, allowed to push
 * straight onto inv.stacks - every caller moving a pile's perishables
 * anywhere reaches for this or addItem rather than touching stacks
 * directly, so the live index never has to be reindexed by hand.
 */
export function addAgedStack(inv: Inventory, item: PerishableId, kg: number, age: number): void {
  if (kg <= 0) return;
  if (!inv.stacks[item]) inv.stacks[item] = [];
  inv.stacks[item].push({ kg, age });
  reindexPile(inv);
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
    reindexPile(inv);
    return n - left;
  }
  const have = inv.items[item] ?? 0;
  const take = Math.min(have, n);
  if (take >= have) delete inv.items[item];
  else inv.items[item] = have - take;
  reindexPile(inv);
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

/** The pile on one 50 m patch, created on first use. Empty piles are swept by tidyPiles. */
export function pile(state: GameState, cell: number): Inventory {
  let inv = state.piles[cell];
  if (!inv) {
    inv = emptyInventory();
    state.piles[cell] = inv;
  }
  if (!pileOwner.has(inv)) pileOwner.set(inv, { state, cell });
  return inv;
}

/**
 * What lies on a patch, read without raising a pile there - and nothing at all
 * for a patch that is null, which is how a region with no camp reads its camp
 * pile. The inventory handed back is a fresh empty one when there is no pile,
 * so nothing may be added through this call; use pile() to put something down.
 */
export function pileAt(state: GameState, cell: number | null): Inventory {
  return (cell === null ? undefined : state.piles[cell]) ?? emptyInventory();
}

/** The pile on the patch under the player's feet, and no other. */
export function herePile(state: GameState, world: World): Inventory {
  return pile(state, cellOf(state, world));
}

/** Pack plus the pile on the patch the player stands on: what a task may consume. A pile 50 m off is out of reach. */
export function reach(state: GameState, world: World): Inventory[] {
  return [state.player.pack, herePile(state, world)];
}

/** Drops empty piles so the map does not mark bare ground. */
export function tidyPiles(state: GameState): void {
  const idx = pileIndexes.get(state);
  for (const k of Object.keys(state.piles)) {
    const cell = Number(k);
    const inv = state.piles[cell];
    if (!inv || !isEmpty(inv)) continue;
    delete state.piles[cell];
    if (idx) for (const category of Object.keys(idx) as PileCategory[]) idx[category].delete(cell);
  }
}

/** Patches in a region that have something lying on them. */
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

/**
 * The needs these inventories cannot meet, and how much each is short by.
 *
 * A row that said "missing materials" beside a recipe list reading "2
 * stone, 4 sticks" was read as "missing 2 stone" by a tester holding four
 * of them: the list is what the thing costs, and nothing said what was
 * actually wanting. This says it.
 */
export function shortOf(invs: Inventory[], needs: Need[]): { item: ItemId; qty: number }[] {
  const out: { item: ItemId; qty: number }[] = [];
  for (const n of needs) {
    if (resolveNeed(invs, n) !== null) continue;
    const have = totalQty(invs, n.item) + (n.alt ? totalQty(invs, n.alt) : 0);
    out.push({ item: n.item, qty: Math.max(0, n.qty - have) });
  }
  return out;
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
 *
 * A yield that lands on the ground away from camp says so. Silence there is
 * how a gather order came home with nothing and the player was left to infer
 * a full pack from the absence of a result: the work happened, the yield
 * exists, and the only thing missing was the sentence. At camp it stays
 * quiet - the pile on the camp cell is the camp store, so landing in it is
 * where the goods were going anyway. A log is never pocketed by design and
 * makes its own pile at the tree; that is not a pack too full and gets no
 * line, or every felling would report a loss that never happened.
 */
export function produce(state: GameState, world: World, item: ItemId, n: number): "pack" | "pile" {
  const p = state.player;
  const addedKg = n * ITEM_KG[item];
  const pocketable = item !== "log" && item !== "water" && item !== "ice";
  if (pocketable && weight(p.pack) + addedKg <= body(state).packComfortableKg + 1e-9) {
    addItem(p.pack, item, n);
    return "pack";
  }
  const here = cellOf(state, world);
  addItem(herePile(state, world), item, n);
  if (pocketable && here !== campCellOf(state, world)) {
    log(state, `The pack is full: ${itemLabel(item, n)} {lies} where {you} {stand}.`, "bad");
  }
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
  // Frozen keeps; the cool tier between zero and the freeze rots at half speed.
  const rate = ambient < FREEZE_KEEP_C ? 0 : ambient <= 0 ? 0.5 : 1;
  if (rate === 0) return lost;
  for (const p of PERISHABLES) {
    const stacks = inv.stacks[p];
    if (!stacks?.length) continue;
    const limit = SPOIL_HOURS[p] * 60;
    for (const s of stacks) s.age += dt * rate;
    const keep = stacks.filter((s) => s.age < limit);
    if (keep.length !== stacks.length) {
      let gone = 0;
      for (const s of stacks) if (s.age >= limit) gone += s.kg;
      lost[p] = gone;
      inv.stacks[p] = keep;
    }
  }
  reindexPile(inv);
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

/** Every axe, best first: the iron one holds its edge longest and the flaked one shatters. */
export const AXES: ToolId[] = ["axe", "stoneAxe", "flakedAxe"];
/** How fast each head blunts against the iron axe's rate. */
export const AXE_WEAR: Partial<Record<ToolId, number>> = { axe: 1, stoneAxe: 1.5, flakedAxe: 4 };
/** The edge at or under which the log says the axe wants honing, once per honing. */
export const BLUNT_EDGE = 25;

/** The best axe held, or none. */
export function axeInHand(p: Player): Tool | undefined {
  for (const id of AXES) {
    const t = tool(p, id);
    if (t) return t;
  }
  return undefined;
}

/** An axe of any kind in hand or lying in reach. */
export function axeNear(p: Player, invs: Inventory[]): boolean {
  return AXES.some((id) => toolNear(p, id, invs));
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

/**
 * Wears a tool by n points; returns true if it broke. A spare in the pack is
 * taken up in the same breath. An axe's durability is its edge: the iron axe
 * and the celt blunt to 0 and stay, wanting a hone, and only the flaked axe
 * shatters.
 */
export function wearTool(state: GameState, id: ToolId, n: number): boolean {
  const p = state.player;
  const t = tool(p, id);
  if (!t) return false;
  const worn = n * (AXE_WEAR[id] ?? 1);
  if (id === "axe" || id === "stoneAxe") {
    const before = t.durability;
    t.durability = Math.max(0, t.durability - worn);
    if (before > BLUNT_EDGE && t.durability <= BLUNT_EDGE) log(state, "The axe is blunt; it wants honing.");
    return false;
  }
  t.durability -= worn;
  if (t.durability > 0) return false;
  p.tools = p.tools.filter((x) => x !== t);
  if (removeItem(p.pack, id, 1) >= 1) {
    p.tools.push(freshTool(id));
    log(state, `The ${TOOLS[id].name} has broken; {you} {take} up the spare.`);
  }
  return true;
}
