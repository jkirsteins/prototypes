/**
 * What the toolbar shows, and nothing about how it looks.
 *
 * An item no group names simply does not appear, so adding one to items.ts
 * can never break the bar and promoting one to it is a line in this table.
 * The caps here are the simulation's own: the roofs a camp has raised, the
 * litres its vessels hold, the kilos a back can carry. None is invented.
 */
import { kcalPerPersonDay, stockCauses, TASK_YIELD } from "../sim/rates";
import { coveredWoodKg, woodOnHandKg } from "../sim/camp";
import { pileAt, qty, TRACE_KG, weight } from "../sim/inventory";
import { COVER_M3, FOODS, type FoodId, itemLabel, STACKED_KG_PER_M3 } from "../sim/items";
import { cellOf } from "../sim/position";
import { campSite, regionState } from "../sim/regionstate";
import { woodLeft, woodPatchFull, woodPatchLeft } from "../sim/stocks";
import type { GameState, ItemId, StockGroupId } from "../sim/types";
import { fmtKg, PACK_COMFORTABLE_KG } from "../units";
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
  if (g.id === "wood") return `wood beyond what is covered gets rained on; a vedbod raises the cover by ${(COVER_M3.vedbod! * STACKED_KG_PER_M3).toLocaleString("en-US")} kg`;
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
 *
 * `aria-expanded` follows `ui.stockOpen` rather than a hardcoded "false":
 * a button's own group can be the one whose panel is open. The field is
 * optional here so a caller that never opens a group - a test rendering
 * the strip alone - need not carry it.
 */
export function stocksHtml(state: GameState, world: World, cal: Calendar, ui: Pick<UiState, "rateDisplay"> & Partial<Pick<UiState, "stockOpen">>): string {
  const causes = stockCauses(state, world, cal);
  // Every group but the pack reads the pile at camp, so before there is a
  // camp there is no store for them to describe. Saying "0.0 days" then is
  // not a dull reading, it is a false one: a survivor who has just landed is
  // carrying a kilo of dried meat and two litres of water. The groups stay
  // on the strip rather than vanishing, because a gauge that comes and goes
  // never teaches anyone it is there - the Do panel has opportunities to
  // introduce its rows, and the strip has nothing.
  const noCamp = regionState(state, world, state.player.region).campCell === null;
  const cells = GROUPS.map((g) => {
    if (noCamp && g.id !== "pack") {
      return `<button type="button" class="stock" data-stock="${g.id}" aria-expanded="false"><span class="lbl">${esc(g.label)}</span> <span class="dim">no camp yet</span></button>`;
    }
    const cap = groupCap(state, world, g);
    const amount = held(groupHeld(state, world, g), g.unit);
    const of = cap === null ? "" : ` <span class="dim">of ${held(cap, g.unit)}</span>`;
    const perHour = causes[g.id].reduce((a, c) => a + c.perHour, 0);
    const rate = formatRate(perHour, g.rateUnit, ui.rateDisplay);
    const sign = perHour > 0 ? "good" : perHour < 0 ? "bad" : "dim";
    const open = g.id === ui.stockOpen;
    return `<button type="button" class="stock" data-stock="${g.id}" aria-expanded="${open}"><span class="lbl">${esc(g.label)}</span> <b>${amount}</b>${of} <span class="${sign}">${esc(rate)}</span></button>`;
  }).join("");
  return cells;
}

/**
 * One group, opened. The members it is made of, the signed causes behind
 * its rate, what the work in hand has not banked yet, and - for wood - the
 * stand the store is coming out of.
 *
 * The last line names what the sum counted, because a projection that does
 * not say what it left out is a number to trust rather than a reading to use.
 */
export function stockPanelHtml(state: GameState, world: World, cal: Calendar, ui: Pick<UiState, "rateDisplay">, id: StockGroupId): string {
  const g = GROUPS.find((x) => x.id === id)!;
  const st = regionState(state, world, state.player.region);
  const inv = pileAt(state, st.campCell);

  const members = g.members
    .filter((item) => qty(inv, item) > TRACE_KG)
    .map((item) => esc(itemLabel(item, qty(inv, item))))
    .join(", ");

  const causes = stockCauses(state, world, cal)[id];
  const rows = causes
    .map((c) => `<div class="cause"><span>${esc(c.label)}</span><span>${esc(formatRate(c.perHour, g.rateUnit, ui.rateDisplay))}</span>${c.note ? `<small class="dim">${esc(c.note)}</small>` : ""}</div>`)
    .join("");
  const sum = causes.reduce((a, c) => a + c.perHour, 0);

  // What the work in hand will bank when it ends: the task's own yield less
  // the share of it already run. Felling banks four logs at the end of an
  // hour, so this is the task bar read in kilograms.
  const t = state.task;
  const yielder = t && id === "wood" ? TASK_YIELD[t.id] : undefined;
  const left = t && yielder ? yielder(state, world).kg * (1 - Math.min(1, t.progress / Math.max(1, t.duration))) : 0;
  const coming = left > TRACE_KG ? `<div class="dim">${esc(fmtKg(left))} coming from the work in hand</div>` : "";

  // Felling draws one patch down and succeeds the ground to a clearing when
  // it is empty. The store going up and the stand going down are one act.
  const here = cellOf(state, world);
  const stand = id === "wood"
    ? `<div class="dim">this patch: ${Math.round(woodPatchLeft(st, world, here))} stems left of ${Math.round(woodPatchFull(world, here))}. This region: ${Math.round(woodLeft(st, world, state.player.region))}.</div>`
    : "";

  const reason = capReason(state, world, g);
  const at = reason ? `<div class="bad">at its cap: ${esc(reason)}</div>` : "";

  return `<div class="stockpanel" data-stockpanel="${id}">
<div><b>${esc(g.label)}</b> ${members ? esc(members) : '<span class="dim">nothing here</span>'}</div>
${at}${rows}
<div class="sum"><b>${esc(formatRate(sum, g.rateUnit, ui.rateDisplay))}</b></div>
${coming}${stand}
<small class="dim">Counts the work in hand, the fire, the producers, the body and the weather. Nothing else.</small>
</div>`;
}
