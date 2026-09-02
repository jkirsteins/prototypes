/**
 * Every quantity in the state is a real-world quantity: minutes, kilograms,
 * kilocalories, degrees Celsius, kilometres. The only unreal thing in the
 * game is how fast the clock runs, and that lives in units.ts.
 */

export type Season = "spring" | "summer" | "autumn" | "winter";

export type Terrain =
  | "water" | "fell" | "rock" | "bog"
  | "spruce" | "pine" | "birch" | "meadow";

export type Species = "hare" | "grouse" | "deer" | "elk" | "fish";
export const SPECIES: Species[] = ["hare", "grouse", "deer", "elk", "fish"];

/** Items counted in pieces. */
export type CountItem =
  | "log" | "stick" | "bark" | "cordage" | "stone" | "bone" | "sinew"
  | "snare" | "arrow";
/** Items measured in kilograms. */
export type KgItem =
  | "firewood" | "hide" | "rawMeat" | "cookedMeat" | "driedMeat"
  | "fish" | "cookedFish" | "berries";
export type ItemId = CountItem | KgItem;

/** Food that goes off. Each stack remembers how long it has been warm. */
export type PerishableId = "rawMeat" | "cookedMeat" | "fish" | "cookedFish";
export const PERISHABLES: PerishableId[] = ["rawMeat", "cookedMeat", "fish", "cookedFish"];

export interface Stack { kg: number; age: number }

export interface Inventory {
  /** Counts for CountItem, kilograms for KgItem. Perishables are NOT here. */
  items: Partial<Record<ItemId, number>>;
  /** Perishable food, oldest first. */
  stacks: Partial<Record<PerishableId, Stack[]>>;
}

export type ToolId = "axe" | "knife" | "bow" | "fishingSpear" | "fireDrill" | "needle";
export interface Tool { id: ToolId; durability: number }

export type ClothingId =
  | "woolCoat" | "woolTrousers" | "leatherBoots" | "woolHat"
  | "hideCoat" | "hideTrousers" | "hideBoots" | "furHat" | "furMittens";
export type ClothingSlot = "coat" | "trousers" | "boots" | "hat" | "mittens";
export interface Garment { id: ClothingId; durability: number }

export type StructureId = "firePit" | "leanTo" | "cabin" | "dryingRack" | "snare";

export type RecipeId =
  | "cordage" | "knife" | "fireDrill" | "bow" | "arrows" | "fishingSpear"
  | "snare" | "needle" | "axe"
  | "hideCoat" | "hideTrousers" | "hideBoots" | "furHat" | "furMittens";

/** Where inside a region the player stands. Every region has a camp. */
export type SpotId = "camp" | "forest" | "outcrop" | "shore" | "heath";
export const SPOTS: SpotId[] = ["camp", "forest", "outcrop", "shore", "heath"];

export type TaskId =
  | "chop" | "sticks" | "bark" | "stone" | "berries" | "split"
  | "hunt" | "fish" | "cook" | "craft" | "repair" | "sharpen" | "build"
  | "light" | "travel" | "walk" | "haul" | "rest" | "sleep";

export interface Task {
  id: TaskId;
  /** Species for hunt, recipe for craft, structure for build, region for travel, spot for walk, food for cook. */
  arg?: string;
  /** Minutes of work done. */
  progress: number;
  /** Minutes of work the task needs at full speed. */
  duration: number;
  repeat: boolean;
}

export interface RegionState {
  /** Standing trees worth felling. */
  wood: number;
  pop: Record<Species, number>;
  /** What lies on the ground at each spot. */
  piles: Partial<Record<SpotId, Inventory>>;
  structures: { firePit: boolean; leanTo: boolean; cabin: boolean; dryingRack: boolean; snares: number };
  /** Build progress in minutes, per structure, kept between visits. */
  build: Partial<Record<StructureId, number>>;
  fire: { lit: boolean; fuelKg: number };
  /** Raw meat on the rack and how many dry minutes it has had. */
  rack: { kg: number; dried: number };
  /** Hares hanging in snares, and the age of the oldest. */
  snareCatch: { count: number; age: number };
}

export interface Player {
  region: number;
  spot: SpotId;
  health: number;
  /** Kilocalorie reserve, 0..6000. */
  kcal: number;
  warmth: number;
  energy: number;
  wetness: number;
  /** Minutes remaining. */
  sick: number;
  injured: number;
  clothing: Garment[];
  tools: Tool[];
  pack: Inventory;
  autoEat: boolean;
  autoFeed: boolean;
}

export interface Weather {
  precip: "none" | "light" | "heavy";
  clear: boolean;
  /** Daily temperature anomaly, re-rolled at dawn. */
  offset: number;
  snowCm: number;
  /** The day index whose dawn roll has happened. */
  rolledDay: number;
}

export interface LogEntry { minute: number; text: string; kind?: "bad" | "good" }

export type DeathCause = "starved" | "froze" | "wolves" | "sickness";

export interface RunStats { trees: number; animals: number; structures: number; km: number }

export interface GameState {
  seed: number;
  minute: number;
  rng: number;
  player: Player;
  regions: RegionState[];
  weather: Weather;
  task: Task | null;
  log: LogEntry[];
  dead: { cause: DeathCause; minute: number } | null;
  stats: RunStats;
  /** The last game hour and day index that had their periodic roll. */
  lastHour: number;
  lastDay: number;
}
