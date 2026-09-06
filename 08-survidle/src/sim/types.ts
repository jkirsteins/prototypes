/**
 * Every quantity in the state is a real-world quantity: minutes, kilograms,
 * kilocalories, degrees Celsius, kilometres. The only unreal thing in the
 * game is how fast the clock runs, and that lives in units.ts.
 */
import type { DayLedger } from "./ledger";
import type { Species } from "./species";

export type Season = "spring" | "summer" | "autumn" | "winter";

export type Terrain =
  | "water" | "fell" | "rock" | "bog"
  | "spruce" | "pine" | "birch" | "meadow";

/** Whether a route may step onto water, and how: safe ice bears weight without risk, thin ice risks a fall. */
export type IceMode = "none" | "safe" | "thin";

export type { Habitat, Species } from "./species";

/** Items counted in pieces. A tool not in hand is one of these. */
export type CountItem =
  | "log" | "stick" | "bark" | "cordage" | "stone" | "bone" | "sinew"
  | "snare" | "arrow" | "torch" | "basketTrap" | "wedge"
  | ToolId;
/** Items measured in kilograms. */
export type KgItem =
  | "firewood" | "hide" | "fur" | "fat" | "rawMeat" | "cookedMeat" | "driedMeat"
  | "fish" | "cookedFish" | "berries" | "wetFirewood"
  /** Litres, at a kilo a litre; only ever in a pile. */
  | "water" | "ice";
export type ItemId = CountItem | KgItem;

/** Food that goes off. Each stack remembers how long it has been warm. */
export type PerishableId = "rawMeat" | "cookedMeat" | "fish" | "cookedFish" | "berries";
export const PERISHABLES: PerishableId[] = ["rawMeat", "cookedMeat", "fish", "cookedFish", "berries"];

export interface Stack { kg: number; age: number }

export interface Inventory {
  /** Counts for CountItem, kilograms for KgItem. Perishables are NOT here. */
  items: Partial<Record<ItemId, number>>;
  /** Perishable food, oldest first. */
  stacks: Partial<Record<PerishableId, Stack[]>>;
}

export type ToolId = "axe" | "stoneAxe" | "flakedAxe" | "whetstone" | "knife" | "bow" | "fishingSpear" | "fireDrill" | "needle" | "barkBucket" | "waterskin";
export interface Tool { id: ToolId; durability: number; /** water carried, vessels only */ litres?: number; frozen?: boolean }

export type ClothingId =
  | "woolCoat" | "woolTrousers" | "leatherBoots" | "woolHat"
  | "hideCoat" | "hideTrousers" | "hideBoots" | "furHat" | "furMittens"
  | "hideBlanket";
export type ClothingSlot = "coat" | "trousers" | "boots" | "hat" | "mittens" | "blanket";
export interface Garment { id: ClothingId; durability: number; /** 0 dry to 100 soaked */ wet?: number }

/** What an hour's watching told a survivor about one shore: which fish this water holds. Dies with the person. */
export interface Observation { minute: number; fish: Species[] }

export type StructureId = "firePit" | "leanTo" | "cabin" | "dryingRack" | "snare" | "boughBed" | "turfHut" | "waterStore" | "seep" | "snowShelter";
/** Structures the weather takes down unless they are mended. */
export type DecayingId = "leanTo" | "dryingRack" | "turfHut";

export type RecipeId =
  | "cordage" | "knife" | "fireDrill" | "bow" | "arrows" | "fishingSpear"
  | "snare" | "needle" | "stoneAxe" | "flakedAxe" | "torch" | "whetstone" | "wedges"
  | "hideCoat" | "hideTrousers" | "hideBoots" | "furHat" | "furMittens"
  | "hideBlanket" | "barkBucket" | "waterskin" | "basketTrap";

/** Where inside a region the player stands. Every region has a camp. */
export type SpotId = "camp" | "forest" | "outcrop" | "shore" | "heath";
export const SPOTS: SpotId[] = ["camp", "forest", "outcrop", "shore", "heath"];

/** How a fill gets its water: the order names one and never picks another. A missing method is the shore. */
export type FillMethod = "shore" | "hole" | "seep";
export const FILL_METHODS: FillMethod[] = ["shore", "hole", "seep"];

export type TaskId =
  | "chop" | "sticks" | "bark" | "stone" | "berries" | "split" | "deadwood" | "splitWedges"
  | "hunt" | "fish" | "cook" | "craft" | "repair" | "sharpen" | "hone" | "build" | "mend"
  | "light" | "lightTorch" | "melt" | "thaw" | "lightIndoors" | "fill" | "iceHole" | "hang"
  | "read" | "setTrap" | "emptyTrap"
  | "travel" | "walk" | "haul" | "night" | "wait" | "rest" | "sleep" | "makeCamp";

/** Every task, for tables that must cover them all. Keep in step with TaskId. */
export const TASK_IDS: TaskId[] = [
  "chop", "sticks", "bark", "stone", "berries", "split", "deadwood", "splitWedges",
  "hunt", "fish", "cook", "craft", "repair", "sharpen", "hone", "build", "mend",
  "light", "lightTorch", "melt", "thaw", "lightIndoors", "fill", "iceHole", "hang",
  "read", "setTrap", "emptyTrap",
  "travel", "walk", "haul", "night", "wait", "rest", "sleep", "makeCamp",
];

export interface Task {
  id: TaskId;
  /** Species for hunt and fish, recipe for craft, structure for build, region for travel, spot for walk, food for cook. */
  arg?: string;
  /** Minutes of work done. */
  progress: number;
  /** Minutes of work the task needs at full speed. */
  duration: number;
  repeat: boolean;
  /** Started as "hunt anything" or "fish for anything": the arg is the species drawn, and a repeat draws again. */
  any?: boolean;
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
  /** Cells this walk has left behind, the start cell first; `walked.concat(path)` is the route as first found. */
  walked: number[];
  label: string;
  /** Whether this walk may cross water, and how: matters when the ice under it later changes. */
  ice: IceMode;
  /** The last non-water cell stood on, where a fall through the ice crawls out. */
  lastLand: number;
}

/** When an intent is finished with. */
export type Until =
  | { kind: "once" }
  | { kind: "times"; n: number }
  | { kind: "campHas"; item: ItemId; qty: number }
  | { kind: "forever" };

/** Where an intent's work is done: the nearest suitable ground, a named spot, or one cell. */
export type Where = "nearest" | SpotId | { cell: number };

/** The row's chosen kind, before the yield item is filled in. */
export type UntilChoice =
  | { kind: "once" } | { kind: "times"; n: number } | { kind: "campHas"; qty: number } | { kind: "forever" };

/** A click on the Do panel, in the terms startIntent speaks. */
export interface IntentRequest {
  task: TaskId;
  arg?: string;
  until: UntilChoice;
  deliver: "leave" | "camp";
  where: Where;
}

/**
 * A standing order keeps a stock (keep) or grinds forever (grind); a job
 * finishes and drops off the list. All three rank together.
 */
export type OrderKind = "keep" | "grind" | "job";

export interface Order {
  /** Stable within the run; the live intent names its order by it. */
  id: number;
  kind: OrderKind;
  /** The click, as the row's chosen kind made it. Cells are resolved afresh at every start. */
  req: IntentRequest;
  /** Completions of the work and minutes spent in it, for the list and the away report. */
  done: number;
  minutes: number;
  /** Why the scheduler last skipped it, or "" when it could run. */
  skipped: string;
}

/** A body need the runner is serving; kept so a need whose exit is above its entry holds between the two. */
export type BodyNeed = "sleep" | "storm" | "cold" | "hungry" | "thirsty" | "snares" | "spent" | "home";

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
  /** The order this intent serves, or null for one started by hand. */
  orderId: number | null;
  /** The scheduler has chosen another order: deliver what is owed, then end. */
  windDown: boolean;
}

/** Where a seep's water comes from: saturated peat, or damp ground. */
export type SeepClass = "bog" | "damp";
/** A seep dug on a cell: its ground, the liquid and frozen litres in it (at most the pool between them), and the minute it was last dug. */
export interface Seep { class: SeepClass; litres: number; ice: number; dug: number }

export interface RegionState {
  /** Standing trees worth felling. */
  wood: number;
  /** Animals by species, only for species with capacity here. */
  pop: Partial<Record<Species, number>>;
  /** The cell the camp, fire and shelter stand on. */
  campCell: number;
  structures: { firePit: boolean; leanTo: boolean; cabin: boolean; dryingRack: boolean; snares: number; boughBed: boolean; hearth: boolean; turfHut: boolean; waterStore: boolean; snowShelter: boolean };
  /** Drying racks standing at the camp, 0 to MAX_RACKS; structures.dryingRack is true while any stands. */
  racks: number;
  /** Minutes since the bough bed was laid; boughs go flat and brown after four days. */
  boughBedAge: number;
  /** Days in a row with a mean above freezing; a snow shelter slumps at SNOW_MELT_DAYS. */
  meltDays: number;
  /** Minutes since each decaying structure was built or mended; each falls after its life span. */
  structureAge: Partial<Record<DecayingId, number>>;
  /** Build progress in minutes, per structure, kept between visits. */
  build: Partial<Record<StructureId, number>>;
  fire: { lit: boolean; fuelKg: number; wetKg: number; indoors: boolean; unattended: number };
  /** Raw meat on the rack and how many dry minutes it has had. */
  rack: { kg: number; dried: number };
  /** Hares hanging in snares, and the age of the oldest. */
  snareCatch: { count: number; age: number };
  /** Smoke thickness at camp, 0..100; rises with an indoor fire and no hearth. */
  smoke: number;
  /** Minutes since it last rained here; wood split while this is low comes out wet. */
  logsWet: number;
  /** This camp's ranked orders, top first. */
  orders: Order[];
  nextOrderId: number;
  /** An ice hole cut at the shore: where, and when. Cleared at the dawn tick, when it has skinned over. */
  iceHole: { cell: number; minute: number } | null;
  /** The basket trap set in this region's water: where, the live fish in it, the species that shore holds, and minutes since it was last emptied. */
  trap: { cell: number; kg: number; fish: Species[]; age: number } | null;
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
  /** Body fat reserve in kilocalories, 0..FAT_FULL: what an empty stomach draws on before health does. */
  fat: number;
  warmth: number;
  /** Fatigue from work, 0..100: what the day's tasks drain and rest and sleep restore. */
  energy: number;
  /** The homeostatic sleep pressure, 0..100: it rises with every waking minute and only sleep pays it. */
  sleepDebt: number;
  /**
   * The night under way, or null while the body is up. It is set when the
   * sleep need first fires and cleared only when the model ends the sleep, so
   * a night broken to feed the fire or by an order changing under the sleeper
   * is resumed rather than abandoned. `collapsed` marks a sleep begun on the
   * fatigue line, which holds until fatigue is back at RESTED_AT.
   */
  sleeping: { collapsed: boolean } | null;
  wetness: number;
  /** Minutes remaining. */
  sick: number;
  injured: number;
  clothing: Garment[];
  tools: Tool[];
  /** A torch in hand: lit, and the minutes of burn left. */
  torch: { lit: boolean; minutes: number };
  pack: Inventory;
  autoEat: boolean;
  autoFeed: boolean;
  /** Litres of water in the body, 0..3. */
  water: number;
  autoDrink: boolean;
  /** Minutes spent frostbitten in each extremity. */
  frostbite: { feet: number; hands: number };
  /** Lost to frostbite for good. */
  toes: boolean;
  fingers: boolean;
  /** Kilos of berries eaten today, for the gut's ceiling: full credit to 1.2, half to two, none past it. */
  berriesToday: { day: number; kg: number };
  /** Lean kcal eaten today, for the ceiling meat and fish feed nothing past. */
  leanToday: { day: number; kcal: number };
  /** Shores this survivor has read, by cell. */
  known: Record<number, Observation>;
}

export interface Weather {
  precip: "none" | "light" | "heavy";
  clear: boolean;
  /** Daily temperature anomaly, re-rolled at dawn. */
  offset: number;
  snowCm: number;
  /** The day index whose dawn roll has happened. */
  rolledDay: number;
  /** A storm window: from and until in minutes; warned records the one-hour warning was logged. */
  storm: { from: number; until: number; warned: boolean } | null;
  /** Days running with no precipitation, for the drought warning. */
  dryDays: number;
  wetDay: boolean;
  dryWarned: boolean;
  /** Ice thickness on standing water, in centimetres. */
  iceCm: number;
}

/** A log line; `away` marks one written while nobody was watching, which the panels render by name. */
export interface LogEntry { minute: number; text: string; kind?: "bad" | "good"; away?: true }

export type DeathCause = "starved" | "froze" | "wolves" | "sickness" | "thirst" | "smoke" | "drowned" | "gaveUp";

export interface WorldDate { year: number; doy: number }

export type ThresholdId = "berries" | "rut" | "firstFrost" | "lakeFreeze" | "firstSnow" | "dark" | "coldSnap" | "iceOut";

/** What a life record's line names, before the day and date it happened are attached. */
export type LifeEventBody =
  | { kind: "threshold"; id: ThresholdId }
  | { kind: "firstKill"; species: Species }
  | { kind: "built"; structure: StructureId }
  | { kind: "entered"; region: string }
  | { kind: "toolWorn"; tool: ToolId }
  | { kind: "toolLost"; tool: ToolId }
  | { kind: "frostbite"; part: "toes" | "fingers" }
  | { kind: "storm" }
  | { kind: "repaired"; structure: StructureId }
  | { kind: "abandoned" };

export type LifeEvent = LifeEventBody & { day: number; date: WorldDate };

export interface Died {
  day: number;
  date: WorldDate;
  cause: DeathCause;
  region: string;
  kmFromCamp: number;
  packFoodKg: number;
  campFoodKcal: number;
  campFirewoodKg: number;
  after: { threshold: ThresholdId; nights: number } | null;
}

export type Grade = -2 | -1 | 0 | 1 | 2;
export type QuirkId = "coastBorn" | "forestBorn" | "sleepsLight" | "bigEater" | "steadyByTheFire";
/** Who the survivor is: rolled per candidate, kept on the record, read through person.ts. */
export interface Person {
  sex: "f" | "m";
  axes: { strength: Grade; build: Grade; hands: Grade; eyes: Grade };
  /** One or two, never coastBorn with forestBorn. */
  quirks: QuirkId[];
  /** Seeds the face; the ancestor keeps their face in the cemetery. */
  face: number;
}
export interface Candidate { name: { first: string; last: string }; person: Person }

/** One survivor's whole life, kept after death: the journal, the epitaph and the away report read this, not the log. */
export interface LifeRecord {
  name: { first: string; last: string };
  person: Person;
  index: number;
  landed: WorldDate;
  gapDays: number;
  events: LifeEvent[];
  worst: { day: number; warmth: number; wolves: boolean } | null;
  forecast: (number | null)[];
  died: Died | null;
  /** Practice minutes per skill at death, what a heir carries a share of. */
  skills?: Partial<Record<SkillId, number>>;
}

/**
 * Set between "Begin again" and the landing being confirmed, and for a new
 * world before its first survivor: where the boat puts in, how long the
 * world sat empty, and the three people aboard.
 */
export interface Landing {
  cell: number;
  region: number;
  date: WorldDate;
  gapDays: number;
  /** The three people aboard this boat. */
  candidates: Candidate[];
  /** "Next boat" presses, from 0. */
  boat: number;
  /** Index into candidates: the highlighted card. */
  chosen: 0 | 1 | 2;
  /** The name in the field: the chosen candidate's until the player edits it. */
  name: { first: string; last: string };
  /** The camp cell the heir's distance and bearing are read against: the old survivor's, not wherever they died. Null for the first survivor. */
  oldCamp: number | null;
}

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
  /** Minutes carried from the ancestor at landing; the panel names the ancestor while these are the larger share. */
  carried?: number;
}

export interface GameState {
  seed: number;
  /** Day of year the run began on, 0-based; 1 April unless the harness or the browser says otherwise. */
  startDoy: number;
  /** Real hours the world runs on without the player before the catch-up caps it: the away dial, 1 to AWAY_HOURS_MAX, set per run. */
  awayHours: number;
  minute: number;
  rng: number;
  player: Player;
  /** State of every region touched so far, by region id. */
  regions: Record<number, RegionState>;
  /** Fog of war: 1 seen from next door, 2 visited, 3 dim (visited once, since forgotten). Absent means unknown. */
  discovered: Record<number, 1 | 2 | 3>;
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
  /** Seeps by the cell they are dug on. */
  seeps: Record<number, Seep>;
  route: Route | null;
  intent: Intent | null;
  /** One record per game day of kcal made, eaten and burned: the calibration ledger. */
  ledger: DayLedger[];
  /** Every survivor of this world, the living one last. */
  survivors: LifeRecord[];
  /** World year the current survivor landed in, 1 for the first. */
  year: number;
  /** Set between "Begin again" and the name being confirmed. */
  landing: Landing | null;
  /** The season spine's memory: the year each threshold last fired and was last announced. */
  spine: { fired: Partial<Record<ThresholdId, number>>; announced: Partial<Record<ThresholdId, number>> };
}
