/** The always-visible reading of the one material target the player chose. */
import type { Calendar } from "../sim/calendar";
import { itemLabel } from "../sim/actions";
import { itemName } from "../sim/items";
import { campCellOf, cellOf } from "../sim/position";
import { shoppingList, shoppingSourceSpots, type ShoppingNeed } from "../sim/shopping";
import type { GameState, ItemId, SpotId } from "../sim/types";
import type { World } from "../world/gen";
import { esc } from "./render";

function needLabel(row: ShoppingNeed): string {
  const main = itemLabel(row.item, row.need);
  return row.alt ? `${main} or ${itemLabel(row.alt, row.need)}` : main;
}

function heldLine(row: ShoppingNeed, hereIsCamp: boolean): string {
  const parts: string[] = [];
  const at = (primary: number, alternate: number, place: string) => {
    if (primary > 0) parts.push(`${itemLabel(row.item, primary)} ${place}`);
    if (row.alt && alternate > 0) parts.push(`${itemLabel(row.alt, alternate)} ${place}`);
  };
  at(row.pack, row.packAlt, "in pack");
  at(row.here, row.hereAlt, hereIsCamp ? "at camp" : "here");
  if (!hereIsCamp) at(row.camp, row.campAlt, "at camp");
  return parts.join(", ");
}

export function shoppingQuery(item: ItemId): string {
  return itemName(item, 1);
}

function shortage(row: ShoppingNeed): string {
  const main = itemLabel(row.item, row.shortPrimary);
  return row.alt && row.shortAlt !== undefined ? `${main} or ${itemLabel(row.alt, row.shortAlt)}` : main;
}

function findButtons(row: ShoppingNeed): string {
  const button = (item: ItemId, label: string) => `<button class="mini" data-act="shopping-find" data-item="${item}">${label}</button>`;
  if (!row.alt) return button(row.item, "show in Do");
  return `${button(row.item, `find ${esc(itemName(row.item, 1))}`)} ${button(row.alt, `find ${esc(itemName(row.alt, 1))}`)}`;
}

export function shoppingHtml(state: GameState, world: World, cal: Calendar): string {
  const list = shoppingList(state, world, cal);
  if (!list) return "";
  const here = cellOf(state, world);
  const camp = campCellOf(state, world);
  const hereIsCamp = camp !== null && here === camp;
  const rows = list.needs.map((row) => {
    const readyAt = list.cell === here ? "ready here" : list.cell === camp ? "ready at camp" : "ready at the work site";
    const stateLine = list.committed
      ? '<span class="good">materials laid out</span>'
      : row.short <= 1e-9
        ? `<span class="good">${readyAt}</span>`
        : `<span class="bad">short ${esc(shortage(row))}</span> ${findButtons(row)}`;
    const held = heldLine(row, hereIsCamp);
    return `<li data-shopping-item="${row.item}"><b>${esc(needLabel(row))}</b><small>${stateLine}${held ? `; ${esc(held)}` : ""}</small></li>`;
  }).join("");
  const tool = list.tool ? `<div class="shopping-tool">Also needs: ${esc(list.tool)}</div>` : "";
  return `<h2>Shopping list</h2><div class="shopping-head"><b>${esc(list.title)}</b><button class="mini" data-act="shopping-clear">stop tracking</button></div><ul>${rows}</ul>${tool}`;
}

/** A compact promise beside a known place that can answer one direct shortage. */
export function shoppingPlaceCueHtml(state: GameState, world: World, cal: Calendar, spot: SpotId): string {
  const list = shoppingList(state, world, cal);
  if (!list) return "";
  const names = list.needs.flatMap((need) => {
    if (need.short <= 1e-9) return [];
    const items: ItemId[] = shoppingSourceSpots(state, world, cal, need.item).includes(spot) ? [need.item] : [];
    if (need.alt && shoppingSourceSpots(state, world, cal, need.alt).includes(spot)) items.push(need.alt);
    return items.map((item) => itemName(item, need.need));
  });
  if (!names.length) return "";
  const materials = names.length === 1 ? names[0] : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
  const target = list.title.replace(/^(Make|Build) /, "");
  return `<small class="shopping-place">${esc(materials)} for ${esc(target)}</small>`;
}
