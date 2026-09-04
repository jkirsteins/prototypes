import type {
  ClothingId, ClothingSlot, ItemId, PerishableId, RecipeId,
  StructureId, ToolId,
} from "./types";

/** Unit weight in kg. Kilogram items weigh 1 per unit by definition. */
export const ITEM_KG: Record<ItemId, number> = {
  log: 20, stick: 0.5, bark: 0.2, cordage: 0.1, stone: 1.5, bone: 0.3,
  sinew: 0.05, snare: 0.4, arrow: 0.05, torch: 0.4,
  firewood: 1, hide: 1, fur: 1, fat: 1, rawMeat: 1, cookedMeat: 1, driedMeat: 1,
  fish: 1, cookedFish: 1, berries: 1, wetFirewood: 1,
  water: 1, ice: 1,
  axe: 1.5, knife: 0.2, bow: 0.8, fishingSpear: 1.0, fireDrill: 0.3,
  needle: 0.01, barkBucket: 0.3, waterskin: 0.4,
};

export const KG_ITEMS = new Set<ItemId>([
  "firewood", "hide", "fur", "fat", "rawMeat", "cookedMeat", "driedMeat", "fish", "cookedFish", "berries", "wetFirewood",
  "water", "ice",
]);

export const ITEM_NAMES: Record<ItemId, string> = {
  log: "logs", stick: "sticks", bark: "bark", cordage: "cordage", stone: "stone",
  bone: "bone", sinew: "sinew", snare: "snares", arrow: "arrows", torch: "torches",
  firewood: "firewood", hide: "hide", fur: "fur", fat: "fat", rawMeat: "raw meat", cookedMeat: "cooked meat",
  driedMeat: "dried meat", fish: "fish", cookedFish: "cooked fish", berries: "berries",
  wetFirewood: "wet firewood", water: "water", ice: "ice",
  axe: "axes", knife: "knives", bow: "bows", fishingSpear: "fishing spears",
  fireDrill: "fire drills", needle: "bone needles", barkBucket: "bark buckets", waterskin: "waterskins",
};

export type FoodId = "rawMeat" | "cookedMeat" | "driedMeat" | "cookedFish" | "berries" | "fat";
export const FOODS: Record<FoodId, { kcalPerKg: number; portionKg: number; sickChance: number }> = {
  rawMeat: { kcalPerKg: 1500, portionKg: 0.3, sickChance: 0.25 },
  cookedMeat: { kcalPerKg: 1500, portionKg: 0.3, sickChance: 0 },
  driedMeat: { kcalPerKg: 3500, portionKg: 0.15, sickChance: 0 },
  cookedFish: { kcalPerKg: 1000, portionKg: 0.3, sickChance: 0 },
  berries: { kcalPerKg: 500, portionKg: 0.2, sickChance: 0 },
  fat: { kcalPerKg: 9000, portionKg: 0.1, sickChance: 0 },
};
/** Order autoEat prefers: the least valuable safe food first, so dried meat and fat are kept for winter. */
export const AUTO_EAT_ORDER: FoodId[] = ["berries", "cookedFish", "cookedMeat", "driedMeat", "fat"];

export const KCAL_FULL = 6000;

/** Hours above 0 C before a stack is thrown away. */
export const SPOIL_HOURS: Record<PerishableId, number> = {
  rawMeat: 36, fish: 36, cookedMeat: 72, cookedFish: 72,
};

export const TOOLS: Record<ToolId, { name: string; kg: number; litres?: number }> = {
  axe: { name: "axe", kg: 1.5 },
  knife: { name: "knife", kg: 0.2 },
  bow: { name: "bow", kg: 0.8 },
  fishingSpear: { name: "fishing spear", kg: 1.0 },
  fireDrill: { name: "fire drill", kg: 0.3 },
  needle: { name: "bone needle", kg: 0.01 },
  barkBucket: { name: "bark bucket", kg: 0.3, litres: 2 },
  waterskin: { name: "waterskin", kg: 0.4, litres: 3 },
};
export const TOOL_IDS = Object.keys(TOOLS) as ToolId[];

/**
 * `insulation` is worn all day; `sleep` counts only while asleep or resting,
 * for what you wrap round yourself when you lie down.
 */
export const CLOTHING: Record<ClothingId, { name: string; slot: ClothingSlot; insulation: number; sleep?: number; kg: number; material: "wool" | "hide" }> = {
  woolCoat: { name: "wool coat", slot: "coat", insulation: 8, kg: 1.5, material: "wool" },
  woolTrousers: { name: "wool trousers", slot: "trousers", insulation: 4, kg: 0.8, material: "wool" },
  leatherBoots: { name: "leather boots", slot: "boots", insulation: 3, kg: 1.2, material: "hide" },
  woolHat: { name: "wool hat", slot: "hat", insulation: 2, kg: 0.2, material: "wool" },
  hideCoat: { name: "hide coat", slot: "coat", insulation: 12, kg: 3, material: "hide" },
  hideTrousers: { name: "hide trousers", slot: "trousers", insulation: 6, kg: 1.8, material: "hide" },
  hideBoots: { name: "hide boots", slot: "boots", insulation: 4, kg: 1.4, material: "hide" },
  furHat: { name: "fur hat", slot: "hat", insulation: 3, kg: 0.4, material: "hide" },
  furMittens: { name: "fur mittens", slot: "mittens", insulation: 2, kg: 0.3, material: "hide" },
  hideBlanket: { name: "hide blanket", slot: "blanket", insulation: 0, sleep: 8, kg: 3, material: "hide" },
};

export interface Need { item: ItemId; qty: number; /** an acceptable substitute */ alt?: ItemId }

export interface Recipe {
  name: string;
  needs: Need[];
  tool?: ToolId;
  minutes: number;
  out: { clothing?: ClothingId; item?: ItemId; qty?: number };
}

export const RECIPES: Record<RecipeId, Recipe> = {
  cordage: { name: "cordage", needs: [{ item: "bark", qty: 3 }], minutes: 20, out: { item: "cordage", qty: 1 } },
  knife: { name: "stone knife", needs: [{ item: "stone", qty: 2 }, { item: "stick", qty: 1 }, { item: "cordage", qty: 1 }], minutes: 45, out: { item: "knife", qty: 1 } },
  // A hand drill is a stick spun on a board; the arrival axe notches the board, so no knife is needed to make one.
  fireDrill: { name: "fire drill", needs: [{ item: "stick", qty: 2 }, { item: "cordage", qty: 1 }], minutes: 30, out: { item: "fireDrill", qty: 1 } },
  bow: { name: "bow", needs: [{ item: "log", qty: 1 }, { item: "cordage", qty: 2 }], tool: "knife", minutes: 180, out: { item: "bow", qty: 1 } },
  arrows: { name: "arrows x5", needs: [{ item: "stick", qty: 5 }, { item: "stone", qty: 3 }, { item: "sinew", qty: 1, alt: "cordage" }], tool: "knife", minutes: 60, out: { item: "arrow", qty: 5 } },
  fishingSpear: { name: "fishing spear", needs: [{ item: "stick", qty: 1 }, { item: "stone", qty: 1 }, { item: "cordage", qty: 1 }], tool: "knife", minutes: 30, out: { item: "fishingSpear", qty: 1 } },
  snare: { name: "snare", needs: [{ item: "stick", qty: 1 }, { item: "cordage", qty: 2 }], tool: "knife", minutes: 20, out: { item: "snare", qty: 1 } },
  needle: { name: "bone needle", needs: [{ item: "bone", qty: 1 }], tool: "knife", minutes: 20, out: { item: "needle", qty: 1 } },
  axe: { name: "stone axe", needs: [{ item: "stone", qty: 3 }, { item: "stick", qty: 1 }, { item: "cordage", qty: 2 }], tool: "knife", minutes: 90, out: { item: "axe", qty: 1 } },
  torch: { name: "torch", needs: [{ item: "stick", qty: 1 }, { item: "bark", qty: 2 }], minutes: 20, out: { item: "torch", qty: 1 } },
  hideCoat: { name: "hide coat", needs: [{ item: "hide", qty: 6 }, { item: "sinew", qty: 2 }], tool: "needle", minutes: 480, out: { clothing: "hideCoat" } },
  hideTrousers: { name: "hide trousers", needs: [{ item: "hide", qty: 4 }, { item: "sinew", qty: 1 }], tool: "needle", minutes: 300, out: { clothing: "hideTrousers" } },
  hideBoots: { name: "hide boots", needs: [{ item: "hide", qty: 2 }, { item: "sinew", qty: 1 }], tool: "needle", minutes: 240, out: { clothing: "hideBoots" } },
  furHat: { name: "fur hat", needs: [{ item: "fur", qty: 1, alt: "hide" }, { item: "sinew", qty: 1 }], tool: "needle", minutes: 120, out: { clothing: "furHat" } },
  furMittens: { name: "fur mittens", needs: [{ item: "fur", qty: 1, alt: "hide" }, { item: "sinew", qty: 1 }], tool: "needle", minutes: 120, out: { clothing: "furMittens" } },
  hideBlanket: { name: "hide blanket", needs: [{ item: "hide", qty: 4, alt: "fur" }, { item: "sinew", qty: 2 }], tool: "needle", minutes: 240, out: { clothing: "hideBlanket" } },
  barkBucket: { name: "bark bucket", needs: [{ item: "bark", qty: 4 }, { item: "cordage", qty: 1 }], tool: "knife", minutes: 20, out: { item: "barkBucket", qty: 1 } },
  waterskin: { name: "waterskin", needs: [{ item: "hide", qty: 1 }, { item: "sinew", qty: 1 }], tool: "needle", minutes: 60, out: { item: "waterskin", qty: 1 } },
};
export const RECIPE_IDS = Object.keys(RECIPES) as RecipeId[];

export interface StructureDef { name: string; needs: Need[]; minutes: number; desc: string }

export const STRUCTURES: Record<StructureId, StructureDef> = {
  firePit: { name: "fire pit", needs: [{ item: "stone", qty: 6 }], minutes: 30, desc: "A ring of stones. Holds a fire once you can light one." },
  leanTo: { name: "lean-to", needs: [{ item: "stick", qty: 8 }, { item: "log", qty: 4 }, { item: "cordage", qty: 2 }], minutes: 240, desc: "Poles and boughs. A little warmer, half as wet." },
  cabin: { name: "log cabin", needs: [{ item: "log", qty: 40 }, { item: "stone", qty: 12 }, { item: "cordage", qty: 8 }], minutes: 3600, desc: "Walls and a roof. Warm, dry, and a long job." },
  dryingRack: { name: "drying rack", needs: [{ item: "stick", qty: 6 }, { item: "cordage", qty: 2 }], minutes: 60, desc: "Holds 6 kg of raw meat. Two dry days turn 3 kg into 1 kg that keeps." },
  snare: { name: "set a snare", needs: [{ item: "snare", qty: 1 }], minutes: 6, desc: "Catches hares overnight where hares live. Up to five per region." },
  boughBed: { name: "bough bed", needs: [{ item: "stick", qty: 12 }], minutes: 30, desc: "Spruce boughs off the cold ground. +4 C asleep here; goes flat in a fortnight." },
};
export const STRUCTURE_IDS = Object.keys(STRUCTURES) as StructureId[];
export const MAX_SNARES = 5;
/** Days a bough bed stays springy before it has to be laid again. */
export const BOUGH_BED_DAYS = 14;

export const FIRE_MAX_KG = 36;
export const FIRE_LOW_KG = 3;
export const RACK_MAX_KG = 6;
export const RACK_DRY_MINUTES = 48 * 60;
export const SNARE_CATCH_MAX_AGE = 2 * 1440;
/** Minutes a torch burns once lit; there is no putting it out. */
export const TORCH_BURN_MINUTES = 60;
