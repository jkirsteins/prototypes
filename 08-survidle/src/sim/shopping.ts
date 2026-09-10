import { localWeather } from "./weather";
/**
 * One player-chosen Make or Build outcome, reduced to the direct things it
 * consumes. It never expands a material into its own recipe: finding that
 * chain is play, while keeping the immediate list in view is navigation.
 */
import type { Calendar } from "./calendar";
import { absence, popOf } from "./animals";
import { pileAt, qty, totalQty } from "./inventory";
import { RECIPES, RECIPE_IDS, STRUCTURES, TOOLS, type Need } from "./items";
import { groundOf, resolveCell, yieldItems } from "./intent";
import { campCellOf, cellOf } from "./position";
import { campSite, regionState } from "./regionstate";
import { effectiveNeeds } from "./skills";
import { huntedLand, SPECIES_DEFS, type SpeciesDef } from "./species";
import type { GameState, ItemId, RecipeId, ShoppingTarget, SpotId, StructureId, TaskId } from "./types";
import { regionAt, type World } from "../world/gen";

export interface ShoppingNeed {
  item: ItemId;
  alt?: ItemId;
  need: number;
  /** Primary and alternate quantities stay separate so the UI never misnames one as the other. */
  pack: number;
  packAlt: number;
  /** Both acceptable materials loose under the survivor. */
  here: number;
  hereAlt: number;
  /** Both acceptable materials in this region's camp pile. */
  camp: number;
  campAlt: number;
  /** The better complete material choice available where the work will happen. */
  available: number;
  shortPrimary: number;
  shortAlt?: number;
  short: number;
}

export interface ShoppingList {
  target: ShoppingTarget;
  title: string;
  needs: ShoppingNeed[];
  tool: string | null;
  cell: number;
  committed: boolean;
  ready: boolean;
}

export interface ShoppingSource {
  task: TaskId;
  arg?: string;
  spot: SpotId | null;
}

/**
 * Candidate producers, simplest gathering first. The item and ground still
 * come from the task model, so this list says only which actions are sensible
 * first suggestions and does not duplicate what any action yields.
 */
const SOURCE_ACTIONS: { task: TaskId; arg?: string }[] = [
  { task: "stone" }, { task: "sticks" }, { task: "bark" }, { task: "chop" }, { task: "hunt", arg: "any" },
  ...RECIPE_IDS.map((arg) => ({ task: "craft" as TaskId, arg })),
];

/** The first action and kind of place that can produce an item. */
export function shoppingSource(item: ItemId): ShoppingSource | null {
  for (const source of SOURCE_ACTIONS) {
    const yields = yieldItems(source.task, source.arg);
    if (yields === "all" || !yields.includes(item)) continue;
    return { ...source, spot: source.task === "hunt" ? null : groundOf(source.task, source.arg) };
  }
  return null;
}

function animalYields(def: SpeciesDef, item: ItemId): boolean {
  const yields = def.yields;
  if (!yields) return false;
  switch (item) {
    case "rawMeat": return yields.meatKg > 0;
    case "hide": return (yields.hideKg ?? 0) > 0;
    case "fur": return (yields.furKg ?? 0) > 0;
    case "rawFat": return (yields.fatKg ?? 0) > 0;
    case "bone": return (yields.bone ?? 0) > 0;
    case "sinew": return (yields.sinew ?? 0) > 0;
    default: return false;
  }
}

/** Known place kinds in the current region where this material can actually be obtained now. */
export function shoppingSourceSpots(state: GameState, world: World, cal: Calendar, item: ItemId): SpotId[] {
  const source = shoppingSource(item);
  if (!source) return [];
  if (source.task !== "hunt") return source.spot ? [source.spot] : [];
  const region = regionAt(world, state.player.region);
  const st = regionState(state, world, state.player.region);
  const spots = huntedLand()
    .filter((species) => (region.capacity[species] ?? 0) > 0
      && popOf(st, species) >= 1
      && !absence(SPECIES_DEFS[species], cal, localWeather(state, world).iceCm)
      && animalYields(SPECIES_DEFS[species], item))
    .map((species) => SPECIES_DEFS[species].hunt!.spot);
  return [...new Set(spots)];
}

function targetNeeds(state: GameState, target: ShoppingTarget): Need[] {
  return target.task === "craft" ? effectiveNeeds(state, target.arg) : STRUCTURES[target.arg].needs;
}

/** A valid material-bearing target, or null for a stale id or a thing made from no materials. */
export function shoppingTarget(task: "craft" | "build", arg: string): ShoppingTarget | null {
  if (task === "craft") {
    const recipe = RECIPES[arg as RecipeId];
    return recipe?.needs.length ? { task, arg: arg as RecipeId } : null;
  }
  const structure = STRUCTURES[arg as StructureId];
  return structure?.needs.length ? { task, arg: arg as StructureId } : null;
}

/** Replaces the one list. Tracking is information only and never touches an order. */
export function trackShopping(state: GameState, task: "craft" | "build", arg: string): boolean {
  const target = shoppingTarget(task, arg);
  if (!target) return false;
  state.shopping = target;
  return true;
}

export function clearShopping(state: GameState): void {
  state.shopping = null;
}

/** The current reading of the target. Nothing here is persisted except its two-id address. */
export function shoppingList(state: GameState, world: World, cal: Calendar): ShoppingList | null {
  const target = state.shopping;
  if (!target) return null;
  const valid = shoppingTarget(target.task, target.arg);
  if (!valid) return null;

  const needs = targetNeeds(state, valid);
  const cell = resolveCell(state, world, cal, valid.task, valid.arg, "nearest").cell;
  const campCell = campCellOf(state, world);
  const materialCells = valid.task === "build" ? [cell, campCell] : [cell];
  const work = [state.player.pack, ...[...new Set(materialCells.filter((at): at is number => at !== null))].map((at) => pileAt(state, at))];
  const here = pileAt(state, cellOf(state, world));
  const camp = pileAt(state, campCell);
  const site = campSite(regionState(state, world, state.player.region));
  const committed = valid.task === "build" && (
    (state.task?.id === "build" && state.task.arg === valid.arg)
    || (site?.build[valid.arg] ?? 0) > 0
  );
  const rows = needs.map((need): ShoppingNeed => {
    const primary = totalQty(work, need.item);
    const alternate = need.alt ? totalQty(work, need.alt) : 0;
    const available = need.alt ? Math.max(primary, alternate) : primary;
    const shortPrimary = committed ? 0 : Math.max(0, need.qty - primary);
    const shortAlt = need.alt ? (committed ? 0 : Math.max(0, need.qty - alternate)) : undefined;
    return {
      item: need.item,
      ...(need.alt ? { alt: need.alt } : {}),
      need: need.qty,
      pack: qty(state.player.pack, need.item),
      packAlt: need.alt ? qty(state.player.pack, need.alt) : 0,
      here: qty(here, need.item),
      hereAlt: need.alt ? qty(here, need.alt) : 0,
      camp: qty(camp, need.item),
      campAlt: need.alt ? qty(camp, need.alt) : 0,
      available: committed ? need.qty : available,
      shortPrimary,
      ...(shortAlt === undefined ? {} : { shortAlt }),
      short: shortAlt === undefined ? shortPrimary : Math.min(shortPrimary, shortAlt),
    };
  });
  const name = valid.task === "craft" ? RECIPES[valid.arg].name : STRUCTURES[valid.arg].name;
  const toolId = valid.task === "craft" ? RECIPES[valid.arg].tool : undefined;
  const tool = toolId ? TOOLS[toolId].name : null;
  return {
    target: valid,
    title: `${valid.task === "craft" ? "Make" : "Build"} ${name}`,
    needs: rows,
    tool,
    cell,
    committed,
    ready: rows.every((row) => row.short <= 1e-9),
  };
}
