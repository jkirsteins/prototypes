/**
 * Water: a reserve in litres beside the kilocalories. You drink where the
 * water is, or from a vessel you filled there; a shore under ice gives
 * nothing, and snow is water only at a fire (tasks.ts, melt).
 */
import type { World } from "../world/gen";
import { berriesOverloaded } from "./berries";
import { addItem, carried, pile, qty, removeItem, takeUp } from "./inventory";
import { body } from "./person";
import { TOOLS, WATER_STORE_L } from "./items";
import { type Activity, activityOf } from "./player";
import { cellOf, watersideCell } from "./position";
import type { GameState, Inventory, Player, RegionState, ToolId } from "./types";

export const WATER_FULL = 3.0;
export const THIRSTY_L = 1.0;
/** Ice this thick closes the shore. */
export const ICE_SHORE_CM = 2;
export const THIRST_DRAIN_PER_HOUR = 4;
/** Vessels freeze below this ambient when the body is still and no fire is by. */
export const FREEZE_C = -5;

const LOSS_PER_HOUR: Record<Activity, number> = { sleep: 0.1, rest: 0.1, light: 0.15, walk: 0.25, heavy: 0.35 };

export function waterLossPerHour(state: GameState, felt: number): number {
  const p = state.player;
  let a = activityOf(state.task);
  if (a === "walk" && carried(p) > body(state).packComfortableKg) a = "heavy";
  let l = LOSS_PER_HOUR[a];
  // Cold dry air takes water from the breath whatever you do; a warm room
  // costs nothing at rest and 30 percent more at work. The Swedish handbook's
  // floor is 1.5 L a day lying still, whatever the room.
  const working = a === "light" || a === "walk" || a === "heavy";
  if (felt < -10 || (felt > 20 && working)) l *= 1.3;
  if (p.sick > 0 || berriesOverloaded(p, state.minute)) l *= 1.2;
  return l;
}

/** Lowers the reserve for dt minutes and returns the health drain for the same minutes: nothing until it is empty. */
export function stepWater(state: GameState, felt: number, dt: number): number {
  const p = state.player;
  p.water = Math.max(0, p.water - (waterLossPerHour(state, felt) / 60) * dt);
  return p.water <= 0 ? (THIRST_DRAIN_PER_HOUR / 60) * dt : 0;
}

/** The hole at this cell is open: cut today and not yet skinned over by the dawn tick. */
export function iceHoleOpen(state: GameState, cell: number): boolean {
  const st = state.regions[state.player.region];
  return st?.iceHole?.cell === cell;
}

/** Litres a source under foot could give: endless at open water or an open ice hole, the seep's liquid pool on its cell, nothing elsewhere. */
export function sourceLitres(state: GameState, world: World, cell = cellOf(state, world)): number {
  if (watersideCell(world, cell) && (state.weather.iceCm < ICE_SHORE_CM || iceHoleOpen(state, cell))) return Number.POSITIVE_INFINITY;
  const s = state.seeps[cell];
  return s ? s.litres : 0;
}

/** Water under foot to drink from or fill at. */
export function waterSource(state: GameState, world: World): boolean {
  return sourceLitres(state, world) > 1e-9;
}

/** Takes litres out of the source under foot; open water is not counted down. */
function drawSource(state: GameState, world: World, litres: number): void {
  const s = state.seeps[cellOf(state, world)];
  if (s) s.litres = Math.max(0, s.litres - litres);
}

export function vesselLitres(p: Player): number {
  let l = 0;
  for (const t of p.tools) if (!t.frozen) l += t.litres ?? 0;
  return l;
}

/** Litres every vessel in hand could hold, filled or not. */
export function vesselLitresCapacity(p: Player): number {
  let l = 0;
  for (const t of p.tools) l += TOOLS[t.id].litres ?? 0;
  return l;
}

/** What holds water when it is left at camp. */
export const VESSELS: ToolId[] = ["barkBucket", "waterskin"];
/**
 * The one vessel a fetch takes: in hand, in the pack or in the pile under
 * foot, the one with the most room. A partly full vessel is chosen only when
 * it is the only vessel there, which the room ordering gives for free. A
 * vessel of a kind already in hand is the one in hand, since tools are one
 * per kind and taking up another would drop it. Null when there is none.
 */
export function tripVessel(state: GameState, world: World): { id: ToolId; inHand: boolean; room: number } | null {
  const p = state.player;
  const here = pile(state, cellOf(state, world));
  let best: { id: ToolId; inHand: boolean; room: number } | null = null;
  for (const t of p.tools) {
    const holds = TOOLS[t.id].litres ?? 0;
    if (!holds) continue;
    const room = t.frozen ? 0 : holds - (t.litres ?? 0);
    if (!best || room > best.room) best = { id: t.id, inHand: true, room };
  }
  for (const v of VESSELS) {
    if (p.tools.some((t) => t.id === v)) continue;
    if (qty(p.pack, v) + qty(here, v) < 1) continue;
    const room = TOOLS[v].litres!;
    if (!best || room > best.room) best = { id: v, inHand: false, room };
  }
  return best;
}

/** Litres a fetch would add: the room in every vessel that will be in hand once the trip's vessel is taken up. */
export function tripLitres(state: GameState, world: World): number {
  const p = state.player;
  let l = 0;
  for (const t of p.tools) {
    const holds = TOOLS[t.id].litres ?? 0;
    if (holds && !t.frozen) l += holds - (t.litres ?? 0);
  }
  const v = tripVessel(state, world);
  if (v && !v.inHand) l += v.room;
  return l;
}

/** Takes the trip's vessel up when it is not in hand yet. */
export function takeUpTripVessel(state: GameState, world: World): void {
  const v = tripVessel(state, world);
  if (v && !v.inHand) takeUp(state, world, v.id);
}

/** Litres an hour a fed fire thaws at camp. */
export const THAW_L_PER_HOUR = 2;

/** Litres the vessels lying in this pile can hold between them, plus the trough when this camp has one. */
export function campWaterCapacity(inv: Inventory, st?: Pick<RegionState, "structures">): number {
  let l = 0;
  for (const v of VESSELS) l += qty(inv, v) * (TOOLS[v].litres ?? 0);
  if (st?.structures.waterStore) l += WATER_STORE_L;
  return l;
}

/** Room left in this pile's vessels and trough: capacity less the water and ice already in them. */
export function campWaterRoom(inv: Inventory, st?: Pick<RegionState, "structures">): number {
  return Math.max(0, campWaterCapacity(inv, st) - qty(inv, "water") - qty(inv, "ice"));
}

/** Empties the carried vessels into the pile's vessels and trough as far as they have room. Returns litres poured. */
export function pourVessels(p: Player, inv: Inventory, st?: Pick<RegionState, "structures">): number {
  let room = campWaterRoom(inv, st);
  let poured = 0;
  for (const t of p.tools) {
    if (room <= 1e-9) break;
    if (t.frozen || !(t.litres ?? 0)) continue;
    const put = Math.min(room, t.litres!);
    t.litres! -= put;
    room -= put;
    poured += put;
  }
  if (poured > 1e-9) addItem(inv, "water", poured);
  return poured;
}

/** This region's camp pile, when standing on its camp cell; null anywhere else. */
export function campPileHere(state: GameState, world: World): Inventory | null {
  const st = state.regions[state.player.region];
  if (!st || cellOf(state, world) !== st.campCell) return null;
  return pile(state, st.campCell);
}

/** Fills the body from a vessel first, then camp water underfoot, then the source under foot. False when nothing has water. */
export function drink(state: GameState, world: World): boolean {
  const p = state.player;
  let want = WATER_FULL - p.water;
  if (want <= 1e-9) return false;
  for (const t of p.tools) {
    if (want <= 1e-9) break;
    if (t.frozen || !(t.litres ?? 0)) continue;
    const take = Math.min(want, t.litres!);
    t.litres! -= take;
    want -= take;
  }
  const camp = want > 1e-9 ? campPileHere(state, world) : null;
  if (camp) {
    const take = Math.min(want, qty(camp, "water"));
    removeItem(camp, "water", take);
    want -= take;
  }
  if (want > 1e-9) {
    const take = Math.min(want, sourceLitres(state, world));
    if (take > 1e-9) {
      drawSource(state, world, take);
      want -= take;
    }
  }
  if (want === WATER_FULL - p.water) return false;
  p.water = WATER_FULL - want;
  return true;
}

/** Fills every vessel at a source, as far as the source goes. Returns litres added. */
export function fillVessels(state: GameState, world: World): number {
  let avail = sourceLitres(state, world);
  if (avail <= 1e-9) return 0;
  let added = 0;
  for (const t of state.player.tools) {
    const holds = TOOLS[t.id].litres ?? 0;
    if (!holds) continue;
    const put = Math.min(holds - (t.litres ?? 0), avail);
    if (put <= 1e-9) continue;
    t.litres = (t.litres ?? 0) + put;
    t.frozen = false;
    added += put;
    avail -= put;
  }
  drawSource(state, world, added);
  return added;
}

/** Drinks at the thirsty line when a vessel or the shore allows, like auto-eat. */
export function autoDrink(state: GameState, world: World): void {
  const p = state.player;
  if (!p.autoDrink || p.water >= THIRSTY_L) return;
  drink(state, world);
}
