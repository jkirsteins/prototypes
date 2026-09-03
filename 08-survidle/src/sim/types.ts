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
  | "hideCoat" | "hideTrousers" | "hideBoots" | "furHat" | "furMittens"
  | "hideBlanket";
export type ClothingSlot = "coat" | "trousers" | "boots" | "hat" | "mittens" | "blanket";
export interface Garment { id: ClothingId; durability: number }

export type StructureId = "firePit" | "leanTo" | "cabin" | "dryingRack" | "snare" | "boughBed";

export type RecipeId =
  | "cordage" | "knife" | "fireDrill" | "bow" | "arrows" | "fishingSpear"
  | "snare" | "needle" | "axe"
  | "hideCoat" | "hideTrousers" | "hideBoots" | "furHat" | "furMittens"
  | "hideBlanket";

/** Where inside a region the player stands. Every region has a camp. */
export type SpotId = "camp" | "forest" | "outcrop" | "shore" | "heath";
export const SPOTS: SpotId[] = ["camp", "forest", "outcrop", "shore", "heath"];

export type TaskId =
  | "chop" | "sticks" | "bark" | "stone" | "berries" | "split"
  | "hunt" | "fish" | "cook" | "craft" | "repair" | "sharpen" | "build"
  | "light" | "travel" | "walk" | "haul" | "night" | "rest" | "sleep";

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

/**
 * Work set aside with its share done. A felled-halfway tree stays halfway
 * at its forest; a half-made knife travels in your hands. The key says which.
 */
export interface PausedTask {
  id: TaskId;
  arg?: string;
  /** Share of the work done, 0..1. */
  fraction: number;
  /** The cell it was set aside in; -1 for carried work. */
  cell: number;
}

/** A walk under way: the cells still to step through, and what it is for. */
export interface Route {
  target: number;
  path: number[];
  label: string;
}

/** When an intent is finished with. */
export type Until =
  | { kind: "once" }
  | { kind: "times"; n: number }
  | { kind: "campHas"; item: ItemId; qty: number }
  | { kind: "forever" };

/** A body need the runner is serving; kept so a need whose exit is above its entry holds between the two. */
export type BodyNeed = "sleep" | "cold" | "hungry";

/**
 * What the player set out to do. The runner re-reads the world every minute
 * and starts one ordinary task at a time; nothing else is planned ahead.
 */
export interface Intent {
  /** The work underneath, in the terms startTask speaks. */
  task: TaskId;
  arg?: string;
  /** The cell the work is done in, resolved once when the intent starts. */
  cell: number;
  /** The home camp: where "bring it to camp" delivers. Fixed at start. */
  campCell: number;
  until: Until;
  deliver: "leave" | "camp";
  /** Completions of the work so far. */
  done: number;
  /** What the runner is doing right now, for the Doing panel. */
  step: string;
  need: BodyNeed | null;
  /** Warmth when the current rest step began, so its gain can be judged when it completes. Unset outside a rest step. */
  restFromWarmth?: number;
  /** A rest has already been tried and failed to raise warmth: the cold need does not hold again until warmth recovers on its own. */
  coldSpent?: boolean;
}

export interface RegionState {
  /** Standing trees worth felling. */
  wood: number;
  pop: Record<Species, number>;
  /** The cell the camp, fire and shelter stand on. */
  campCell: number;
  structures: { firePit: boolean; leanTo: boolean; cabin: boolean; dryingRack: boolean; snares: number; boughBed: boolean };
  /** Minutes since the bough bed was laid; boughs go flat and brown after a fortnight. */
  boughBedAge: number;
  /** Build progress in minutes, per structure, kept between visits. */
  build: Partial<Record<StructureId, number>>;
  fire: { lit: boolean; fuelKg: number };
  /** Raw meat on the rack and how many dry minutes it has had. */
  rack: { kg: number; dried: number };
  /** Hares hanging in snares, and the age of the oldest. */
  snareCatch: { count: number; age: number };
}

export interface Player {
  /** Position in cell units; the cell under foot is floor(x), floor(y). */
  x: number;
  y: number;
  /** The region of the cell under foot, kept current by every move. */
  region: number;
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

export type SkillId = "woodcraft" | "foraging" | "hunting" | "fishing" | "crafting" | "building";

/** Practice, in minutes. A level is a count of hours behind the tool. */
export interface SkillState {
  /** Minutes of work at the skill's tasks. */
  xp: number;
  /** Minutes of work per mastery key ("chop:spruce", "hunt:elk", "craft:bow"). */
  mastery: Record<string, number>;
  /** Minutes in the mastery pool, capped at the skill's capacity. */
  pool: number;
}

export interface GameState {
  seed: number;
  minute: number;
  rng: number;
  player: Player;
  /** State of every region touched so far, by region id. */
  regions: Record<number, RegionState>;
  /** Fog of war: 1 seen from next door, 2 visited. Absent means unknown. */
  discovered: Record<number, 1 | 2>;
  weather: Weather;
  task: Task | null;
  log: LogEntry[];
  dead: { cause: DeathCause; minute: number } | null;
  stats: RunStats;
  skills: Record<SkillId, SkillState>;
  /** The last game hour and day index that had their periodic roll. */
  lastHour: number;
  lastDay: number;
  /** Tasks set aside, by pauseKey. */
  paused: Record<string, PausedTask>;
  /** What lies on the ground, by cell index. */
  piles: Record<number, Inventory>;
  route: Route | null;
  intent: Intent | null;
}
