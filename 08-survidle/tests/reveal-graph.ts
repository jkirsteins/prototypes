/**
 * The dependency walk that proves the REVEAL table is honest.
 *
 * This is a test helper and must never be imported by `src/`. The game's
 * reveal gate is two object lookups - `REVEAL[rowKey]` and
 * `isOpportunityDiscovered` - and that is the whole of what runs per draw.
 * Walking recipes and structures to see whether a row's needs are reachable
 * is a question about the table, asked once in vitest, not a question the
 * Do panel asks sixty times a second. `tests/reveal.test.ts` holds the
 * import rule so this file cannot quietly become runtime code.
 *
 * "Producing action" is deliberately the unit rather than "item". A block
 * that reads `needs a knife` is only a locked door if nothing revealed can
 * make a knife, so every requirement is resolved to the rows that yield it.
 */
import { MEND, RECIPE_IDS, RECIPES, STRUCTURES } from "../src/sim/items";
import { yieldItem } from "../src/sim/intent";
import { rowKey } from "../src/ui/purpose";
import type { DecayingId, ItemId, RecipeId, StructureId, TaskId } from "../src/sim/types";

/** Every task id `yieldItem` knows how to answer for, plus the craft rows keyed by recipe. */
const YIELDING_TASKS: TaskId[] = [
  "chop", "sticks", "bark", "stone", "berries", "eggs", "innerBark", "grindBark",
  "roots", "tapSap", "seaweed", "split", "splitWedges", "deadwood", "hunt", "fish",
  "cook", "fill", "melt", "hang", "emptyTrap",
] as TaskId[];

/**
 * What a carcass gives, which no task yields directly.
 *
 * `yieldItem` answers "rawMeat" for a hunt because that is the item an
 * "until camp has N" order counts. The hide, sinew and bone come off the
 * same animal and are what every clothing recipe wants, so a walk that
 * stopped at rawMeat would call the whole clothing branch unreachable.
 */
const FROM_CARCASS: ItemId[] = ["hide", "sinew", "bone", "fur", "crackedBone"] as ItemId[];

/** Which rows produce a given item. A row is `rowKey(id, arg)`, the same string REVEAL and HOME are keyed by. */
export function producers(): Map<ItemId, string[]> {
  const out = new Map<ItemId, string[]>();
  const add = (item: ItemId | null | undefined, row: string) => {
    if (!item) return;
    const rows = out.get(item) ?? [];
    if (!rows.includes(row)) rows.push(row);
    out.set(item, rows);
  };

  for (const task of YIELDING_TASKS) add(yieldItem(task), rowKey(task));
  // Cook is one task over many foods, and craft is one task over many recipes.
  for (const arg of ["rawMeat", "fish", "oilyFish", "rawFat", "roots"]) {
    add(yieldItem("cook" as TaskId, arg), rowKey("cook" as TaskId, arg));
  }
  for (const recipe of RECIPE_IDS) {
    add(RECIPES[recipe].out.item, rowKey("craft" as TaskId, recipe));
  }
  for (const item of FROM_CARCASS) add(item, rowKey("hunt" as TaskId, "any"));
  return out;
}

export interface Requirements {
  /** Materials the row consumes. */
  items: ItemId[];
  /** The tool the row must be holding, if any. */
  tools: ItemId[];
}

/** What a row needs before it can run, read off the definitions rather than off its displayed reason. */
export function requirementsOf(id: TaskId, arg?: string): Requirements {
  if (id === "craft" && arg) {
    const recipe = RECIPES[arg as RecipeId];
    if (!recipe) return { items: [], tools: [] };
    return {
      items: recipe.needs.flatMap((n) => [n.item, ...(n.alt ? [n.alt] : [])]),
      tools: recipe.tool ? [recipe.tool as ItemId] : [],
    };
  }
  if (id === "build" && arg) {
    const structure = STRUCTURES[arg as StructureId];
    if (!structure) return { items: [], tools: [] };
    return { items: structure.needs.map((n) => n.item), tools: [] };
  }
  if (id === "mend" && arg) {
    const mend = MEND[arg as DecayingId];
    if (!mend) return { items: [], tools: [] };
    return { items: mend.needs.map((n) => n.item), tools: [] };
  }
  return { items: [], tools: [] };
}
