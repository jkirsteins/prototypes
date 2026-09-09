/**
 * Every quantity in the state is a real-world quantity: minutes, kilograms,
 * kilocalories, degrees Celsius, kilometres. The only unreal thing in the
 * game is how fast the clock runs, and that lives in units.ts.
 */
import type { FoodId } from "./items";
import type { DayLedger } from "./ledger";
import type { Species } from "./species";

export type Season = "spring" | "summer" | "autumn" | "winter";

export type Terrain =
  | "water" | "fell" | "rock" | "bog"
  | "spruce" | "pine" | "birch" | "meadow";

/** Whether a route may step onto water, and how: safe ice bears weight without risk, thin ice risks a fall. */
export type IceMode = "none" | "safe" | "thin";

export type { Habitat, Species } from "./species";

export type AgentSpecies = "deer" | "reindeer" | "elk" | "wolf" | "wolverine" | "bear";
export type WildlifeMode = "detailed" | "aggregate";
export type WildlifeIntent = "forage" | "drink" | "rest" | "flee" | "hunt" | "camp" | "den" | "wander";

export interface WildlifeCohort { sex: "f" | "m"; bornYear: number; count: number }
export interface WildlifeActive {
  cell: number;
  hunger: number;
  thirst: number;
  rest: number;
  alarm: number;
  intent: WildlifeIntent;
  target: number | null;
  route: number[];
}
export interface WildlifeSubject {
  id: number;
  species: AgentSpecies;
  form: "individual" | "pack" | "herd";
  region: number;
  cohorts: WildlifeCohort[];
  condition: number;
  reproductive: "none" | "pregnant" | "dependent";
  dependentUntilYear: number;
  name: string | null;
  nameKind: "proper" | "field";
  colour: number;
  lastKnownDay: number;
  /** Stable winter den site for bears, whether or not a survivor has found it. */
  denCell: number | null;
  active: WildlifeActive | null;
}
export interface WildlifeState {
  nextId: number;
  activeRegion: number | null;
  subjects: WildlifeSubject[];
  lastSpatialTick: number;
  familiarity: Record<number, { points: number; lastDay: number }>;
  inherited: Record<number, 3>;
  /** Subjects this survivor personally recognizes. Names themselves belong to the world. */
  recognized: Record<number, true>;
  /** Subjects inside line of sight on the previous spatial tick. */
  visible: number[];
  /** Den cells this lineage has identified. The site remains after its current occupant dies. */
  knownDens: Record<number, true>;
  recognitionQueue: number[];
}

/** Items counted in pieces. A tool not in hand is one of these. */
export type CountItem =
  | "log" | "stick" | "bark" | "cordage" | "stone" | "bone" | "sinew" | "crackedBone"
  | "snare" | "arrow" | "torch" | "basketTrap" | "wedge"
  | ToolId;
/** Items measured in kilograms. */
export type KgItem =
  | "firewood" | "hide" | "fur" | "fat" | "rawFat" | "rawMeat" | "cookedMeat" | "driedMeat"
  | "fish" | "cookedFish" | "oilyFish" | "cookedOilyFish" | "roe" | "berries" | "eggs" | "wetFirewood"
  | "freshBark" | "driedBark" | "barkFlour" | "roots" | "cookedRoots" | "seaweed"
  /** Litres, at a kilo a litre; only ever in a pile. */
  | "water" | "ice";
export type ItemId = CountItem | KgItem;

/** Food that goes off. Each stack remembers how long it has been warm. */
export type PerishableId = "rawMeat" | "cookedMeat" | "fish" | "cookedFish" | "oilyFish" | "cookedOilyFish" | "roe" | "berries" | "rawFat" | "eggs" | "cookedRoots" | "seaweed";
export const PERISHABLES: PerishableId[] = ["rawMeat", "cookedMeat", "fish", "cookedFish", "oilyFish", "cookedOilyFish", "roe", "berries", "rawFat", "eggs", "cookedRoots", "seaweed"];

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
  | "hunt" | "findDen" | "fish" | "cook" | "craft" | "repair" | "sharpen" | "hone" | "build" | "mend"
  | "light" | "lightTorch" | "melt" | "thaw" | "lightIndoors" | "fill" | "iceHole" | "hang"
  | "read" | "setTrap" | "emptyTrap" | "crack" | "eggs" | "innerBark" | "grindBark" | "roots" | "tapSap" | "seaweed"
  | "travel" | "walk" | "haul" | "night" | "rest" | "sleep" | "makeCamp" | "explore" | "searchHome";

/** Every task, for tables that must cover them all. Keep in step with TaskId. */
export const TASK_IDS: TaskId[] = [
  "chop", "sticks", "bark", "stone", "berries", "split", "deadwood", "splitWedges",
  "hunt", "findDen", "fish", "cook", "craft", "repair", "sharpen", "hone", "build", "mend",
  "light", "lightTorch", "melt", "thaw", "lightIndoors", "fill", "iceHole", "hang",
  "read", "setTrap", "emptyTrap", "crack", "eggs", "innerBark", "grindBark", "roots", "tapSap", "seaweed",
  "travel", "walk", "haul", "night", "rest", "sleep", "makeCamp", "explore", "searchHome",
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
  /** Persistent large-animal subject selected when a detailed hunt begins. */
  wildlifeSubject?: number;
  /** Started as "hunt anything" or "fish for anything": the arg is the species drawn, and a repeat draws again. */
  any?: boolean;
  /** The dark has already cost this task an attempt and been remarked on; the rest of them are silent. */
  darkSaid?: boolean;
  /** Cells an exploring sweep has already stood at, the starting cell included; pickVantage never picks one twice. */
  visited?: number[];
  /** The cell a searchHome sweep is trying to reach: fixed at the start, since the sweep's own region drifts as it crosses one to sight another. */
  home?: number;
  /** The real sub-action currently owned by a region survey. */
  surveyPhase?: "walk" | "read";
  /** Connected water systems this survey has completed or found temporarily unreadable. */
  surveyedWater?: number[];
  /** Canonical water-system cell and representative shore for the active read. */
  surveyWater?: number;
  surveyShore?: number;
  surveyProgress?: number;
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

/** The row's chosen kind, before the yield item is filled in. A daily count is cleared at the day roll and never drops off. */
export type UntilChoice =
  | { kind: "once" } | { kind: "times"; n: number } | { kind: "campHas"; qty: number } | { kind: "forever" }
  | { kind: "daily"; n: number };

/**
 * Conditions on a standing order, read every morning against the calendar
 * and the camp. A season is a day-of-year window, inclusive, wrapping the
 * new year when from is past to. A stock line opens the order only while
 * the camp pile holds the item in the range. A restart line makes a keep
 * that has read met at its target stay met until the stock falls under
 * it, so the keep does not flicker at its line. A "by" day makes a keep's
 * target rise to its figure across the season (or from the day the order
 * was given) and hold there after. "spend" says the figure is not held but
 * spent: past the due date the target falls back to nothing across the rest
 * of the season, which is what a store built for one season and burned
 * through it does. The ladder gates each part by rung.
 */
export interface OrderWhen {
  season?: { from: number; to: number };
  stock?: { item: ItemId; atLeast?: number; under?: number };
  restart?: number;
  by?: number;
  /**
   * Only on a keep that carries both a season and a `by`, and only at the
   * pace rung. The difference is a reserve from a buffer: 300 logs cut for
   * one winter are spent by the thaw and asking for them in March buys a
   * week of felling for wood the thaw leaves standing, while the 600 kg of
   * split firewood beside them is drawn on every day and refilled from
   * those logs, so it is held and not spent.
   */
  spend?: true;
}

/** A click on the Do panel, in the terms startIntent speaks. */
export interface IntentRequest {
  task: TaskId;
  arg?: string;
  until: UntilChoice;
  deliver: "leave" | "camp";
  where: Where;
  when?: OrderWhen;
}

/**
 * A standing order keeps a stock (keep) or grinds forever (grind); a job
 * finishes and drops off the list. All three rank together, and the two
 * care rows rank with them under kinds of their own: the body (sleep, food,
 * water, warmth, shelter and coming home before dark) and the camp (the
 * fire fed, the snares checked), a row each rather than a tier hidden under
 * the list. They are two rows and not one because they are two jobs: a
 * player who drops the camp down the list to travel hard is saying nothing
 * about sleep or thirst.
 */
export type OrderKind = "keep" | "grind" | "job" | "body" | "camp";

/** What an order may say: its kind, and past the keep, the conditions and the pace it may carry. Neither care kind is ever given, so neither is a rung to earn. */
export type Rung = Exclude<OrderKind, "body" | "camp"> | "condition" | "pace";

interface OrderBase {
  /** Stable within the run; the live intent names its order by it. */
  id: number;
  /** Completions of the work and minutes spent in it, for the list and the away report. */
  done: number;
  minutes: number;
  /** Why the scheduler last skipped it, or "" when it could run. */
  skipped: string;
  /** A keep with a restart line: whether it last read met at its target. */
  held?: boolean;
  /** The day of year the order was given, the rise's start for a "by" keep with no season. */
  givenDoy?: number;
  /** The day a daily count was last opened afresh. */
  dayOpened?: number;
  /**
   * The completions standing at that day's opening. A daily count is
   * `done - dayBase`, so `done` itself stays the run's whole tally the way
   * every other order's is, and the away report's "what it did while you
   * were gone" is the same subtraction for a daily order as for any other.
   */
  dayBase?: number;
  /** The player has said this row holds the list until it is met. */
  pinned?: boolean;
}

export interface WorkOrder extends OrderBase {
  kind: Exclude<OrderKind, "body" | "camp">;
  /** The click, as the row's chosen kind made it. Cells are resolved afresh at every start. */
  req: IntentRequest;
}

export type CareOrder =
  | (OrderBase & { kind: "body" })
  | (OrderBase & { kind: "camp" });

export type Order = WorkOrder | CareOrder;

export function isWorkOrder(o: Order): o is WorkOrder {
  return o.kind !== "body" && o.kind !== "camp";
}

/**
 * What the scheduler makes of one row this minute. `met` and `shut` are
 * silent pass-overs the row was always allowed: nothing is wrong, or the
 * row's own conditions are not open yet. `blocked` is a row that wants to
 * run and cannot - no tool, no route, no legal cell - and passes over too,
 * unless the row is pinned, since a request that cannot be met is not
 * grounds for holding up everything under it. `later` is a row whose
 * readiness the scheduler has not read this minute at all: it is not a
 * verdict any row earns today, but the judgement still has to carry it
 * without ever letting such a row become chosen or the blocking one, since
 * "not yet read" and "read and found wanting" must never be confused with
 * each other.
 */
export type Verdict =
  | { v: "met" }
  | { v: "shut"; why: string }
  | { v: "blocked"; why: string }
  | { v: "ready" }
  | { v: "later" };

/** A body need the runner is serving; kept so a need whose exit is above its entry holds between the two. */
export type BodyNeed = "sleep" | "storm" | "cold" | "hungry" | "thirsty" | "spent" | "home";

/** What the camp around the body asks for: fuel on the fire, a catch out of the snares. */
export type CampNeed = "fire" | "snares";

/** Either kind of want the scheduler serves from the need model, which is what the three phrase tables and bodyStep are keyed on. */
export type CareNeed = BodyNeed | CampNeed;

/**
 * What the player set out to do. The runner re-reads the world every minute
 * and starts one ordinary task at a time; nothing else is planned ahead.
 */
interface IntentBase {
  /** What the activity strip says this intent is doing now. */
  step: string;
  /** The order this intent serves, or null for work started by hand. */
  orderId: number | null;
}

interface WorkIntentBase extends IntentBase {
  /** Region whose queue owns orderId. Stable while a cross-region route changes player.region. */
  orderRegion?: number;
  /** The work underneath, in the terms startTask speaks. */
  task: TaskId;
  arg?: string;
  /** The cell the work is done in, resolved once when the intent starts. */
  cell: number;
  /** The home camp: where "bring it to camp" delivers. Fixed at start, and null when the region has no camp. */
  campCell: number | null;
  until: Until;
  deliver: "leave" | "camp";
  /** Completions of the work so far. */
  done: number;
  /** The scheduler has chosen another order: deliver what is owed, then end. */
  windDown: boolean;
}

/**
 * Work the player chose in the moment: a once order, or an intent started
 * by hand. It is the player's, the way a raw action under the advanced
 * toggle is: the runner walks to the work and does it, and the body never
 * takes it over or moves it anywhere. The body still speaks - the tags and
 * the log say tired, spent, sleepy, cold - and the player decides. What
 * keeps the body off it is where the click lands on the list, above the
 * care rows, and not this tag: the tag says whose the work is, and the
 * collapse floor in `runIntent` reads it.
 */
export interface HandIntent extends WorkIntentBase {
  mode: "hand";
}

/**
 * The runner's own: a standing or counted order, and the night out (whose
 * whole content is the body's sleep). A care row outranks
 * it wherever the player has left that row above the work - the body's
 * sleep, storm, cold, thirst, hunger, spent and home, the camp's fire and
 * snares.
 * Which need holds and whether cold has already spent a rest live on the
 * player rather than here: this intent comes and goes with every order the
 * scheduler swaps in, and a need's stickiness has to outlast that.
 */
export interface RunnerIntent extends WorkIntentBase {
  mode: "runner";
  /** Warmth when the current rest step began, so its gain can be judged when it completes. Unset outside a rest step. */
  restFromWarmth?: number;
}

/** A concrete need being served by one of the two permanent care rows. */
export interface CareIntent extends IntentBase {
  mode: "care";
  /** Care is a need, never a disguised work task. */
  task?: never;
  care: "body" | "camp";
  need: CareNeed;
  orderId: number;
  /** Work-only fields are absent, but named so readers of an Intent can inspect them safely. */
  cell?: undefined;
  campCell?: undefined;
  until?: undefined;
  deliver?: undefined;
  done?: undefined;
  windDown?: undefined;
  /** Warmth when a rest step began, so its gain can be judged on completion. */
  restFromWarmth?: number;
}

export type WorkIntent = HandIntent | RunnerIntent;
export type Intent = WorkIntent | CareIntent;

export function isWorkIntent(it: Intent | null | undefined): it is WorkIntent {
  return !!it && it.mode !== "care";
}

/** Where a seep's water comes from: saturated peat, or damp ground. */
export type SeepClass = "bog" | "damp";
/** A seep dug on a cell: its ground, the liquid and frozen litres in it (at most the pool between them), and the minute it was last dug. */
export interface Seep { class: SeepClass; litres: number; ice: number; dug: number }

/**
 * What stands on one cell. A site comes into being when something is built
 * there and outlives the camp moving away, so a lean-to left behind still
 * keeps the rain off whoever sleeps under it.
 */
export interface Site {
  structures: { firePit: boolean; leanTo: boolean; cabin: boolean; dryingRack: boolean; boughBed: boolean; hearth: boolean; turfHut: boolean; waterStore: boolean; snowShelter: boolean };
  /** Drying racks standing here, 0 to MAX_RACKS; structures.dryingRack is true while any stands. */
  racks: number;
  /** Minutes since the bough bed was laid; boughs go flat and brown after four days. */
  boughBedAge: number;
  /** Days in a row with a mean above freezing; a snow shelter slumps at SNOW_MELT_DAYS. */
  meltDays: number;
  /** Minutes since each decaying structure was built or mended; each falls after its life span. */
  structureAge: Partial<Record<DecayingId, number>>;
  /** Build progress in minutes, per structure, kept between visits. */
  build: Partial<Record<StructureId, number>>;
}

export interface RegionState {
  /** Standing trees worth felling. */
  wood: number;
  /** Animals by species, only for species with capacity here. */
  pop: Partial<Record<Species, number>>;
  /** The cell that is home: where the fire burns, the rack dries and the runner walks back to. Null until somebody makes camp here. */
  campCell: number | null;
  /** What stands on each built cell of this region, keyed by cell. */
  sites: Record<number, Site>;
  /** Snares set on this region's heath. They stand away from any camp, so they are the region's, not a site's. */
  snares: number;
  fire: {
    lit: boolean; fuelKg: number; wetKg: number; indoors: boolean; unattended: number;
    /** Minutes of ember life left once the flame is gone. Embers are not lit. */
    embers: number;
    /** Minute this fire was last lit from cold; null once the embers die. A run of keeping is measured from it. */
    litSince: number | null;
    /** Minutes of rain this fire has come through without dying. */
    rainHeld: number;
  };
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
  /** The basket trap set in this region's water: where, the live fish in it (oilyKg is the oily-species share of kg), the species that shore holds, and minutes since it was last emptied. */
  trap: { cell: number; kg: number; oilyKg: number; fish: Species[]; age: number } | null;
  /** Clutches this region's nesting birds hold, set on 1 May and gathered down to nothing by the "Gather eggs" task; cleared on 1 July. */
  nests: number;
  /** Kilos of rhizome left in each cell that has been dug, by cell index. A cell with no entry is at the full figure its ground holds. */
  rootCells: Record<number, number>;
  /** Taps drawn from this region's birches today, and the day number they were counted on; resets itself once the day moves on. */
  sapTaps: { day: number; n: number };
}

export interface Player {
  /** Position in cell units; the cell under foot is floor(x), floor(y). */
  x: number;
  y: number;
  /** The region of the cell under foot, kept current by every move. */
  region: number;
  health: number;
  /** The stomach's fullness, 0..KCAL_FULL: the signal that drives hunger, satiety and the Food bar. Eating fills it, time empties it; it holds no energy of its own. */
  kcal: number;
  /** The body's energy store, in kcal, no upper bound and no floor clamp: it rises by what is eaten and falls by what is burned, every minute, whether that leaves it above or below the essential-fat floor fatLandmarks() sets. A run that dies is read against that floor, not against zero. */
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
   * fatigue line, which holds until fatigue is full again.
   */
  sleeping: { collapsed: boolean } | null;
  /** The body need being served, or null. Sticky: a need's exit line is not its entry line. */
  bodyNeed: BodyNeed | null;
  /** A rest has already failed to raise warmth: cold does not hold again until warmth recovers on its own. */
  coldSpent: boolean;
  wetness: number;
  /** Minutes remaining. */
  sick: number;
  injured: number;
  clothing: Garment[];
  tools: Tool[];
  /** A torch in hand: lit or put out, and the minutes of burn left. Zero means none equipped. */
  torch: { lit: boolean; minutes: number };
  pack: Inventory;
  /** Litres of water in the body, 0..3. */
  water: number;
  /** Minutes spent frostbitten in each extremity. */
  frostbite: { feet: number; hands: number };
  /** Lost to frostbite for good. */
  toes: boolean;
  fingers: boolean;
  /** What the gut has taken today: kilos per capped food and the lean kcal, reset with the day. */
  gut: { day: number; kg: Partial<Record<FoodId, number>>; leanKcal: number };
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
  | { kind: "animalRecognized"; subject: number; name: string }
  | { kind: "built"; structure: StructureId }
  | { kind: "entered"; region: string }
  | { kind: "toolWorn"; tool: ToolId }
  | { kind: "toolLost"; tool: ToolId }
  | { kind: "frostbite"; part: "toes" | "fingers" }
  | { kind: "injury"; cause: "wayfinding" }
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

export interface RunStats {
  trees: number; animals: number; structures: number; km: number; kills: Partial<Record<Species, number>>;
  /** kcal of large game and bear kills, from the actual yield of each kill (raw meat plus raw fat, both at the season it fell). */
  killsKcal: number;
}

export type SkillId = "woodcraft" | "foraging" | "hunting" | "fishing" | "crafting" | "building" | "wayfinding";

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

export type GoalId =
  | "site" | "firewood" | "fire" | "cook" | "keptNight" | "bed" | "keptDays" | "roof" | "keptRain"
  | "water" | "snare" | "store" | "spring" | "summer" | "autumn" | "winter";

export interface GoalState {
  done: Partial<Record<GoalId, true>>;
  progress: Partial<Record<GoalId, number>>;
  /** Completions not yet shown, drained by the overlay one batch at a time. */
  queue: GoalId[];
  /** The season the last daily roll stood in: a turnover is this differing from now. */
  lastSeason: Season;
}

/** One player-chosen outcome whose direct materials stay visible while they travel. */
export type ShoppingTarget =
  | { task: "craft"; arg: RecipeId }
  | { task: "build"; arg: StructureId };

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
  /** Ground whose walking is known: 1 this life's, 3 the journal's. Absent means unknown. */
  mapped: Record<number, 1 | 3>;
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
  /** The manual has been opened unasked once in this world. */
  manualSeen: boolean;
  /**
   * The world's goals: what has been reached here, how far the counted ones
   * have got, and which completions are waiting to be congratulated. The
   * world's rather than a survivor's - an heir inherits the ladder's
   * position the way they inherit the camp - so newPerson and resetTeaching
   * leave it alone.
   */
  goals: GoalState;
  /** The one Make or Build outcome whose direct materials the player is tracking. */
  shopping: ShoppingTarget | null;
  /**
   * The rungs this survivor has been shown a moment for, and the ones
   * earned but not yet shown. Per survivor rather than per world: a moment
   * is about what this life can newly reach, so both are cleared on a
   * landing. A rung an heir lands already holding is marked taught without
   * being queued, and the welcome names those instead.
   */
  taught: Partial<Record<Rung, true>>;
  teachQueue: Rung[];
  /** Persistent identities and the one current-region spatial cohort. */
  wildlife: WildlifeState;
}
