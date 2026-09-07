import type {
  ClothingId, ClothingSlot, DecayingId, ItemId, PerishableId, RecipeId,
  StructureId, ToolId,
} from "./types";

/** Unit weight in kg. Kilogram items weigh 1 per unit by definition. */
export const ITEM_KG: Record<ItemId, number> = {
  log: 20, stick: 0.5, bark: 0.2, cordage: 0.1, stone: 1.5, bone: 0.3, crackedBone: 0.3,
  sinew: 0.05, snare: 0.4, arrow: 0.05, torch: 0.4, basketTrap: 2, wedge: 0.3,
  firewood: 1, hide: 1, fur: 1, fat: 1, rawFat: 1, rawMeat: 1, cookedMeat: 1, driedMeat: 1,
  fish: 1, cookedFish: 1, oilyFish: 1, cookedOilyFish: 1, roe: 1, berries: 1, eggs: 1, wetFirewood: 1,
  freshBark: 1, driedBark: 1, barkFlour: 1, roots: 1, cookedRoots: 1, seaweed: 1,
  water: 1, ice: 1,
  axe: 1.5, stoneAxe: 1.4, flakedAxe: 1.2, whetstone: 0.5, knife: 0.2, bow: 0.8, fishingSpear: 1.0, fireDrill: 0.3,
  needle: 0.01, barkBucket: 0.3, waterskin: 0.4,
};

export const KG_ITEMS = new Set<ItemId>([
  "firewood", "hide", "fur", "fat", "rawFat", "rawMeat", "cookedMeat", "driedMeat", "fish", "cookedFish", "oilyFish", "cookedOilyFish", "roe", "berries", "eggs", "wetFirewood",
  "freshBark", "driedBark", "barkFlour", "roots", "cookedRoots", "seaweed",
  "water", "ice",
]);

export const ITEM_NAMES: Record<ItemId, string> = {
  log: "logs", stick: "sticks", bark: "bark", cordage: "cordage", stone: "stone",
  bone: "bone", crackedBone: "cracked bone", sinew: "sinew", snare: "snares", arrow: "arrows", torch: "torches", basketTrap: "basket traps", wedge: "wedges",
  firewood: "firewood", hide: "hide", fur: "fur", fat: "fat", rawFat: "raw fat", rawMeat: "raw meat", cookedMeat: "cooked meat",
  driedMeat: "dried meat", fish: "fish", cookedFish: "cooked fish", oilyFish: "oily fish", cookedOilyFish: "cooked oily fish", roe: "roe", berries: "berries", eggs: "eggs",
  wetFirewood: "wet firewood", freshBark: "fresh inner bark", driedBark: "dried inner bark", barkFlour: "bark flour", roots: "roots", cookedRoots: "cooked roots", seaweed: "seaweed", water: "water", ice: "ice",
  axe: "iron axes", stoneAxe: "stone axes", flakedAxe: "flaked axes", whetstone: "whetstones", knife: "knives", bow: "bows", fishingSpear: "fishing spears",
  fireDrill: "fire drills", needle: "bone needles", barkBucket: "bark buckets", waterskin: "waterskins",
};

export type FoodId = "rawMeat" | "cookedMeat" | "driedMeat" | "cookedFish" | "cookedOilyFish" | "roe" | "berries" | "eggs" | "barkFlour" | "fat" | "cookedRoots" | "seaweed";
/**
 * Every food: its kcal, its portion, its sick chance, and its lean share -
 * the part of its kcal that counts toward LEAN_KCAL_PER_DAY. The share is
 * the spec's table (fat and carbohydrate design, section 1): an
 * anti-overconsumption rule, not chemistry. Lean meat and lean fish are
 * all lean; fat and the plants none of it; the new foods sit between.
 */
/**
 * Lean wild meat: a kill's fat is its own item at 9,000, so the meat is
 * hare at about 1,000 kcal/kg (Kochanski) and venison at 1,100 to 1,200;
 * dried meat is three kilos to one, so 3,300 conserves the rack's kcal.
 * Berries are wild bilberry, 400 to 600 a kilo, at 450. Oily fish is one
 * class - herring, char, trout, salmon when it lands - about 1,500 kcal/kg
 * at 0.4 lean, since char, trout and herring in condition are 8 to 12
 * percent fat by weight and most of their calories come as fat; lean fish
 * (pike, perch, whitefish) at 0.9, a percent or two of fat by weight; roe
 * 1,600 at half lean, a tenth of a spawning catch, the spec's shortcut.
 */
export const FOODS: Record<FoodId, { kcalPerKg: number; portionKg: number; sickChance: number; leanShare: number }> = {
  rawMeat: { kcalPerKg: 1100, portionKg: 0.3, sickChance: 0.25, leanShare: 1 },
  cookedMeat: { kcalPerKg: 1100, portionKg: 0.3, sickChance: 0, leanShare: 1 },
  driedMeat: { kcalPerKg: 3300, portionKg: 0.15, sickChance: 0, leanShare: 1 },
  cookedFish: { kcalPerKg: 1000, portionKg: 0.3, sickChance: 0, leanShare: 0.9 },
  cookedOilyFish: { kcalPerKg: 1500, portionKg: 0.3, sickChance: 0, leanShare: 0.4 },
  roe: { kcalPerKg: 1600, portionKg: 0.2, sickChance: 0, leanShare: 0.5 },
  berries: { kcalPerKg: 450, portionKg: 0.2, sickChance: 0, leanShare: 0 },
  eggs: { kcalPerKg: 1500, portionKg: 0.2, sickChance: 0, leanShare: 0.4 },
  barkFlour: { kcalPerKg: 800, portionKg: 0.2, sickChance: 0, leanShare: 0 },
  fat: { kcalPerKg: 9000, portionKg: 0.1, sickChance: 0, leanShare: 0 },
  cookedRoots: { kcalPerKg: 850, portionKg: 0.3, sickChance: 0, leanShare: 0 },
  seaweed: { kcalPerKg: 200, portionKg: 0.3, sickChance: 0, leanShare: 0 },
};
/** A spawning catch's roe: a tenth of the fish's own weight, not a separate haul. */
export const ROE_SHARE = 0.1;
/**
 * The Swedish handbook: eggs and young birds are easy to get, and only in
 * a real emergency; May and June at this latitude, a clutch 0.4 kg, half
 * a kilo an hour while the nests last.
 */
export const EGG_CLUTCH_KG = 0.4;
export const EGG_KG_PER_HOUR = 0.5;
export const EGG_FROM_DOY = 120;
export const EGG_TO_DOY = 181;
/**
 * The Swedish handbook calls inner bark time-consuming and low in
 * nutrition, usable all year and easiest on young branches in spring;
 * Kochanski scrapes the cambium in late spring and early summer and dries
 * it. 0.7 kg fresh an hour, three to one dried, 800 kcal/kg of flour, half
 * a kilo a day at full credit and none past one, and a twentieth of a tree
 * per kilo off the felling stock, so a kilo a day is a tree every three
 * weeks against a stock of sixty a forest cell.
 */
export const BARK_FRESH_KG_PER_HOUR = 0.7;
export const BARK_DRY_RATIO = 3;
export const BARK_FLOUR_MINUTES_PER_KG = 20;
export const BARK_TREE_SHARE = 1 / 20;
export const BARK_FROM_DOY = 90;
export const BARK_TO_DOY = 212;
/**
 * The Swedish handbook: cattail rhizome at 210 g of starch a kilo, reed
 * root-shoots at 5 percent, dandelion root at 23 percent, fifteen pieces
 * for the 500 kcal ration; 0.3 kg an hour with a digging stick in season,
 * 0.1 through an ice hole in winter, 850 kcal/kg cooked.
 *
 * What a cell holds is a stand, not a ration: stand area x rhizome density
 * x the share a digging stick lifts. RHIZOME_KG_PER_M2 is the low end of
 * published below-ground biomass for a Phragmites or Typha stand, 1 to 3 kg
 * dry the square metre with fresh mass about three times dry. The stand
 * shares are coarse by design: a 10 m reed fringe along a 300 m water edge
 * is three hundredths of a cell, the open-water margins and wet hollows of
 * a wet cell a twentieth, and a meadow's dandelion, bistort and silverweed
 * are far sparser than a stand - a thirtieth of the density over a tenth of
 * the ground. ROOT_HARVEST_FRACTION is what comes up: the rest is too deep,
 * too small, or left standing, so nine hectares never reads as every
 * rhizome. A shore cell works out at about 810 kg, a wet one 1350, a meadow
 * 90, against a dig of 0.3 kg an hour.
 *
 * ROOT_REGROWTH_SHARE of what a cell is short comes back across each
 * growing season, 1 May to the end of September: perennial clonal rhizome
 * rebuilds from what is left in the ground, and a coarse annual recovery is
 * enough for ground dug by hand.
 */
export const ROOT_KG_PER_HOUR = 0.3;
export const ROOT_WINTER_KG_PER_HOUR = 0.1;
export const RHIZOME_KG_PER_M2 = 3;
export const STAND_SHARE_SHORE = 0.03;
export const STAND_SHARE_BOG = 0.05;
export const STAND_SHARE_MEADOW = 0.1;
export const MEADOW_ROOT_KG_PER_M2 = RHIZOME_KG_PER_M2 / 30;
export const ROOT_HARVEST_FRACTION = 0.1;
/** Under this share of what it holds a patch is dug over: it digs slower and the row says so. A coarse shape for a thinning stand, not a measurement. */
export const ROOT_POOR_SHARE = 0.5;
export const ROOT_REGROWTH_SHARE = 0.5;
export const ROOT_GROWTH_FROM_DOY = 121;
export const ROOT_GROWTH_TO_DOY = 273;
export const ROOT_FROM_DOY = 90;
export const ROOT_TO_DOY = 304;
/**
 * The Swedish handbook: birch sap runs about 20 g of sugar a litre, 2 to 3
 * litres from a birch in a couple of hours, and the rise is early May at
 * this latitude until the leaves open. Drunk on the spot, no boiling down.
 */
export const SAP_FROM_DOY = 121;
export const SAP_TO_DOY = 141;
export const SAP_LITRES = 2.5;
export const SAP_KCAL = 125;
export const SAP_TAPS_PER_DAY = 3;
/** The Swedish handbook: seaweed carries some carbohydrate and minerals, but is not calorie-dense. */
export const SEAWEED_KG_PER_HOUR = 2;
/**
 * The lean ceiling: Kochanski's rabbit starvation - on hare alone a body
 * shows starvation within a week however much it eats. Meat and fish past
 * this many kcal in a day feed nothing; about 1.5 kg of lean meat, the most
 * the body turns to energy before the protein goes to waste. Fat and
 * berries are never capped.
 */
export const LEAN_KCAL_PER_DAY = 1600;
/**
 * The gut's ceilings by food: full credit to the first line, half to the
 * second, none past it. Berries are the Swedish handbook's two litres a
 * day, about 1.2 kg; later foods add their own rows.
 */
export const GUT: Partial<Record<FoodId, { fullCreditKg: number; refuseKg: number }>> = {
  berries: { fullCreditKg: 1.2, refuseKg: 2 },
  barkFlour: { fullCreditKg: 0.5, refuseKg: 1 },
  seaweed: { fullCreditKg: 2, refuseKg: 2 },
};
/** Below this ambient a stack keeps: the Swedish handbook's freezing storage wants at least -10 to -15 C; between it and zero the rot runs at half speed. */
export const FREEZE_KEEP_C = -10;
/** Order autoEat prefers: the least valuable safe food first, so dried meat and fat are kept for winter. */
export const AUTO_EAT_ORDER: FoodId[] = ["berries", "seaweed", "cookedRoots", "barkFlour", "eggs", "roe", "cookedFish", "cookedOilyFish", "cookedMeat", "driedMeat", "fat"];
/** Kilos an hour's picking takes at a patch by hand, before the foraging pool's factor: a beginner picker, near the real kilo an hour at the top of the pool. */
export const BERRY_PICK_KG = 0.7;
/** The Swedish handbook tells of a prisoner who lived on frozen lingonberries dug from under the snow; a fifth of the summer rate, where the snow is shallow enough to reach them. */
export const BERRY_WINTER_SHARE = 0.2;

export const KCAL_FULL = 6000;

/** Hours above 0 C before a stack is thrown away. Raw fat keeps like cooked meat and no longer; rendered it keeps for the winter. */
export const SPOIL_HOURS: Record<PerishableId, number> = {
  rawMeat: 36, fish: 36, cookedMeat: 72, cookedFish: 72, berries: 72, rawFat: 72,
  oilyFish: 36, cookedOilyFish: 72, roe: 36, eggs: 240, cookedRoots: 72, seaweed: 72,
};

/** Kochanski: marrow from the larger bones. A tenth of a kilo a bone at a full animal; marrowFactor scales it by the season. */
export const MARROW_KG_PER_BONE = 0.1;

export const TOOLS: Record<ToolId, { name: string; kg: number; litres?: number }> = {
  axe: { name: "iron axe", kg: 1.5 },
  stoneAxe: { name: "stone axe", kg: 1.4 },
  flakedAxe: { name: "flaked axe", kg: 1.2 },
  whetstone: { name: "whetstone", kg: 0.5 },
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
  needle: { name: "bone needle", needs: [{ item: "bone", qty: 1, alt: "crackedBone" }], tool: "knife", minutes: 20, out: { item: "needle", qty: 1 } },
  // A flaked edge in an evening: it chops badly and shatters; the celt is a cobble pecked and ground on the whetstone over days, a real edge that hones like iron.
  flakedAxe: { name: "flaked axe", needs: [{ item: "stone", qty: 2 }, { item: "stick", qty: 1 }, { item: "cordage", qty: 2 }], tool: "knife", minutes: 90, out: { item: "flakedAxe", qty: 1 } },
  stoneAxe: { name: "stone axe", needs: [{ item: "stone", qty: 1 }, { item: "stick", qty: 1 }, { item: "cordage", qty: 2 }], tool: "whetstone", minutes: 1200, out: { item: "stoneAxe", qty: 1 } },
  torch: { name: "torch", needs: [{ item: "stick", qty: 1 }, { item: "bark", qty: 2 }], minutes: 20, out: { item: "torch", qty: 1 } },
  // A flat stone ground smooth on the outcrop: the edge's whole life, where a stone sharpen spends the stone.
  whetstone: { name: "whetstone", needs: [{ item: "stone", qty: 1 }], minutes: 30, out: { item: "whetstone", qty: 1 } },
  // Driven with a stick swung as a maul: the way a log splits with no iron.
  wedges: { name: "wedges x2", needs: [{ item: "stick", qty: 2 }], tool: "knife", minutes: 20, out: { item: "wedge", qty: 2 } },
  hideCoat: { name: "hide coat", needs: [{ item: "hide", qty: 6 }, { item: "sinew", qty: 2 }], tool: "needle", minutes: 480, out: { clothing: "hideCoat" } },
  hideTrousers: { name: "hide trousers", needs: [{ item: "hide", qty: 4 }, { item: "sinew", qty: 1 }], tool: "needle", minutes: 300, out: { clothing: "hideTrousers" } },
  hideBoots: { name: "hide boots", needs: [{ item: "hide", qty: 2 }, { item: "sinew", qty: 1 }], tool: "needle", minutes: 240, out: { clothing: "hideBoots" } },
  furHat: { name: "fur hat", needs: [{ item: "fur", qty: 1, alt: "hide" }, { item: "sinew", qty: 1 }], tool: "needle", minutes: 120, out: { clothing: "furHat" } },
  furMittens: { name: "fur mittens", needs: [{ item: "fur", qty: 1, alt: "hide" }, { item: "sinew", qty: 1 }], tool: "needle", minutes: 120, out: { clothing: "furMittens" } },
  hideBlanket: { name: "hide blanket", needs: [{ item: "hide", qty: 4, alt: "fur" }, { item: "sinew", qty: 2 }], tool: "needle", minutes: 240, out: { clothing: "hideBlanket" } },
  barkBucket: { name: "bark bucket", needs: [{ item: "bark", qty: 4 }, { item: "cordage", qty: 1 }], tool: "knife", minutes: 20, out: { item: "barkBucket", qty: 1 } },
  waterskin: { name: "waterskin", needs: [{ item: "hide", qty: 1 }, { item: "sinew", qty: 1 }], tool: "needle", minutes: 60, out: { item: "waterskin", qty: 1 } },
  basketTrap: { name: "basket trap", needs: [{ item: "stick", qty: 6 }, { item: "cordage", qty: 3 }], tool: "knife", minutes: 60, out: { item: "basketTrap", qty: 1 } },
};
export const RECIPE_IDS = Object.keys(RECIPES) as RecipeId[];

export interface StructureDef { name: string; needs: Need[]; minutes: number; desc: string }

export const STRUCTURES: Record<StructureId, StructureDef> = {
  firePit: { name: "fire pit", needs: [{ item: "stone", qty: 6 }], minutes: 30, desc: "A ring of stones. Holds a fire once you can light one." },
  leanTo: { name: "lean-to", needs: [{ item: "stick", qty: 8 }, { item: "log", qty: 4 }, { item: "cordage", qty: 2 }], minutes: 240, desc: "Poles and boughs. A little warmer, half as wet." },
  cabin: { name: "log cabin", needs: [{ item: "log", qty: 40 }, { item: "stone", qty: 12 }, { item: "cordage", qty: 8 }], minutes: 3600, desc: "Walls and a roof. Warm, dry, and a long job." },
  dryingRack: { name: "drying rack", needs: [{ item: "stick", qty: 6 }, { item: "cordage", qty: 2 }], minutes: 60, desc: "Holds 40 kg of raw meat. Two dry days turn 3 kg into 1 kg that keeps; four in rain. A second rack doubles it." },
  snare: { name: "set a snare", needs: [{ item: "snare", qty: 1 }], minutes: 6, desc: "Catches hares overnight where hares live. Up to forty per region." },
  boughBed: { name: "bough bed", needs: [{ item: "stick", qty: 12 }], minutes: 30, desc: "Spruce boughs off the cold ground. +4 C asleep here; goes flat after four days." },
  turfHut: { name: "turf hut", needs: [{ item: "log", qty: 4 }, { item: "stick", qty: 20 }, { item: "bark", qty: 40 }, { item: "cordage", qty: 4 }], minutes: 1200, desc: "Poles and a low earth wall under a bark roof, a smoke hole over the hearth. Warm, dry, and a fire inside is allowed." },
  seep: { name: "seep", needs: [{ item: "stick", qty: 4 }], minutes: 240, desc: "A knee-deep hole to groundwater on wet ground. Fills on its own; freezes without a fire beside it." },
  waterStore: { name: "water trough", needs: [{ item: "log", qty: 1 }, { item: "bark", qty: 8 }, { item: "cordage", qty: 2 }], minutes: 180, desc: "A hollowed log lined with bark. Holds 20 litres at camp." },
  snowShelter: { name: "snow shelter", needs: [], minutes: 300, desc: "A heaped and hollowed drift. Walls of snow hold -3 C whatever the night does; no fire inside." },
};
export const STRUCTURE_IDS = Object.keys(STRUCTURES) as StructureId[];
/**
 * Kochanski: pile snow, let it set, dig it out; the ground under a good
 * cover sits at -3 to -5 C whatever the air. The Swedish handbook: the
 * pile freezes together in four or five hours. Needs this much snow at
 * camp and no tools; slumps after this many warm days in a row.
 */
export const SNOW_SHELTER_CM = 40;
export const SNOW_MELT_DAYS = 3;
/**
 * A trap line, not five snares: the Swedish handbook's 3 to 5 km of marked
 * ground with a hundred snares after a few days, checked at dawn. Forty
 * per region, a few percent a night each, so the catch comes from more
 * snares checked rather than better odds per snare.
 */
export const MAX_SNARES = 40;
export const SNARE_ODDS_PER_NIGHT = 0.04;
/** Days a bough bed stays springy before it has to be laid again: Kochanski, a fresh layer every three or four days. */
export const BOUGH_BED_DAYS = 4;

/** Days a decaying structure stands before the weather takes it down: a bough roof fails in a year while its frame stands, a lashed pole rack lasts two, a turf roof a year and a half. */
export const STRUCTURE_LIFE_DAYS: Record<DecayingId, number> = { leanTo: 365, dryingRack: 730, turfHut: 540 };

/** What re-roofing, relashing or re-turfing a decaying structure takes, resetting its age. */
export const MEND: Record<DecayingId, { needs: Need[]; minutes: number }> = {
  leanTo: { needs: [{ item: "stick", qty: 2 }], minutes: 60 },
  dryingRack: { needs: [{ item: "cordage", qty: 1 }], minutes: 60 },
  turfHut: { needs: [{ item: "bark", qty: 20 }], minutes: 120 },
};
/** The structures the weather takes down, in the order the panel lists them. */
export const DECAYING: DecayingId[] = ["leanTo", "dryingRack", "turfHut"];
/** Live fish a basket trap holds before it stops catching. */
export const TRAP_HOLD_KG = 5;
/** A trap's draw against a fish's own odds: a basket in the shallows is half a spear in a good hand. */
export const TRAP_ODDS = 0.5;
/** Litres the water trough holds at camp. */
export const WATER_STORE_L = 20;

export const FIRE_MAX_KG = 36;
export const FIRE_LOW_KG = 3;
/** Raw meat one pole rack holds: strips a centimetre thick run 5 to 8 kg a metre of pole, four two-metre poles. */
export const RACK_MAX_KG = 40;
/** Racks a camp can stand; a third is a smokehouse's job. */
export const MAX_RACKS = 2;
/** Thin strips in dry moving air are hard in about two days; damp air roughly doubles that because the surface never dries. */
export const RACK_DRY_MINUTES = 48 * 60;
export const RACK_DRY_RAIN_MINUTES = 96 * 60;
export const SNARE_CATCH_MAX_AGE = 2 * 1440;
/** Minutes a torch burns once lit; there is no putting it out. */
export const TORCH_BURN_MINUTES = 60;
