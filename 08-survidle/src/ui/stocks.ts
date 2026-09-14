/**
 * What the toolbar shows, and nothing about how it looks.
 *
 * An item no group names simply does not appear, so adding one to items.ts
 * can never break the bar and promoting one to it is a line in this table.
 * The caps here are the simulation's own: the roofs a camp has raised, the
 * litres its vessels hold, the kilos a back can carry. None is invented.
 */
import { kcalPerPersonDay, stockCauses } from "../sim/rates";
import { coveredWoodKg, woodOnHandKg } from "../sim/camp";
import { pileAt, qty, weight } from "../sim/inventory";
import { FOODS, type FoodId } from "../sim/items";
import { campSite, regionState } from "../sim/regionstate";
import type { GameState, ItemId, StockGroupId } from "../sim/types";
import { PACK_COMFORTABLE_KG } from "../units";
import { campWaterCapacity } from "../sim/water";
import type { World } from "../world/gen";
import type { Calendar } from "../sim/calendar";
import { esc } from "./render";
import type { UiState } from "./render";
import { formatRate } from "./rate";

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

/** A group's held figure in its own unit, with no false precision on a rate's worth of digits. */
function held(value: number, unit: StockGroup["unit"]): string {
  if (unit === "days") return `${value.toFixed(1)} days`;
  if (unit === "l") return `${value.toFixed(1)} l`;
  return value >= 10 ? `${Math.round(value)} kg` : `${value.toFixed(1)} kg`;
}

/**
 * The strip across the top: what the camp holds, what it can hold, and
 * which way each is going. One string, so setPanel morphs it and a still
 * minute rewrites nothing.
 *
 * Held reads in the group's own unit (`g.unit`); the rate reads in the
 * group's rate unit (`g.rateUnit`), which differs from the held unit only
 * for food - the larder is counted in person-days, but its rate stays
 * kcal/hour so a cold snap or a hard day of work shows up before it has
 * quietly cost a whole day.
 */
export function stocksHtml(state: GameState, world: World, cal: Calendar, ui: Pick<UiState, "rateDisplay">): string {
  const causes = stockCauses(state, world, cal);
  const cells = GROUPS.map((g) => {
    const cap = groupCap(state, world, g);
    const amount = held(groupHeld(state, world, g), g.unit);
    const of = cap === null ? "" : ` <span class="dim">of ${held(cap, g.unit)}</span>`;
    const perHour = causes[g.id].reduce((a, c) => a + c.perHour, 0);
    const rate = formatRate(perHour, g.rateUnit, ui.rateDisplay);
    const sign = perHour > 0 ? "good" : perHour < 0 ? "bad" : "dim";
    return `<button type="button" class="stock" data-stock="${g.id}" aria-expanded="false"><span class="lbl">${esc(g.label)}</span> <b>${amount}</b>${of} <span class="${sign}">${esc(rate)}</span></button>`;
  }).join("");
  return cells;
}
