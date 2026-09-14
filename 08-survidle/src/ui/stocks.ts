/**
 * What the toolbar shows, and nothing about how it looks.
 *
 * An item no group names simply does not appear, so adding one to items.ts
 * can never break the bar and promoting one to it is a line in this table.
 * The caps here are the simulation's own: the roofs a camp has raised, the
 * litres its vessels hold, the kilos a back can carry. None is invented.
 */
import { kcalPerPersonDay } from "../sim/rates";
import { coveredWoodKg, woodOnHandKg } from "../sim/camp";
import { pileAt, qty, weight } from "../sim/inventory";
import { FOODS, type FoodId } from "../sim/items";
import { campSite, regionState } from "../sim/regionstate";
import type { GameState, ItemId, StockGroupId } from "../sim/types";
import { PACK_COMFORTABLE_KG } from "../units";
import { campWaterCapacity } from "../sim/water";
import type { World } from "../world/gen";

const FOOD_IDS = Object.keys(FOODS) as FoodId[];

export interface StockGroup {
  id: StockGroupId;
  label: string;
  members: ItemId[];
  /** The unit the HELD figure is counted in. */
  unit: "kg" | "l" | "days";
  /**
   * The unit the RATE is counted in. Equal to `unit` for every group but
   * food: food is held in person-days but rated in kcal/hour, because a
   * cold snap or a hard day of work shortens the larder in days without
   * anything being eaten, and pre-dividing the rate into days would throw
   * that away before it ever reached the strip.
   */
  rateUnit: "kg" | "l" | "kcal";
}

export const GROUPS: StockGroup[] = [
  { id: "wood", label: "Wood", members: ["firewood", "wetFirewood", "stick", "log"], unit: "kg", rateUnit: "kg" },
  { id: "food", label: "Food", members: FOOD_IDS, unit: "days", rateUnit: "kcal" },
  { id: "water", label: "Water", members: ["water", "ice"], unit: "l", rateUnit: "l" },
  { id: "pack", label: "Pack", members: [], unit: "kg", rateUnit: "kg" },
];

/** What the camp holds of a group, in the group's own unit. */
export function groupHeld(state: GameState, world: World, g: StockGroup): number {
  const st = regionState(state, world, state.player.region);
  const inv = pileAt(state, st.campCell);
  if (g.id === "pack") return weight(state.player.pack);
  if (g.id === "wood") return woodOnHandKg(inv);
  if (g.id === "water") return qty(inv, "water") + qty(inv, "ice");
  // Food is person-days rather than kilos, because a kilo of fat and a kilo
  // of berries are not the same larder. The divisor is the survivor's own
  // burn, the one kcalPerPersonDay reads off the ledger.
  let kcal = 0;
  for (const item of g.members) kcal += qty(inv, item) * (FOODS[item as FoodId]?.kcalPerKg ?? 0);
  return kcal / kcalPerPersonDay(state);
}

/** The cap, where the simulation has a real one, and null where it has none. */
export function groupCap(state: GameState, world: World, g: StockGroup): number | null {
  const st = regionState(state, world, state.player.region);
  const site = campSite(st);
  if (g.id === "wood") return coveredWoodKg(site);
  if (g.id === "water") return campWaterCapacity(pileAt(state, st.campCell), site);
  if (g.id === "pack") return PACK_COMFORTABLE_KG;
  return null;
}

/** Why a group is at its cap, and the one thing that raises it. Empty when it is not. */
export function capReason(state: GameState, world: World, g: StockGroup): string {
  const cap = groupCap(state, world, g);
  if (cap === null || groupHeld(state, world, g) < cap) return "";
  if (g.id === "wood") return "over cover it takes the rain; a vedbod holds 1,050 kg more";
  if (g.id === "water") return "the vessels are full; a water trough holds 20 l more";
  return "the pack is at what a back carries comfortably";
}
