/**
 * The goal journey: what the world is asked to reach, in authored stages.
 * Titles name outcomes. Checklists name only the major parts worth tracking,
 * never recipes, ingredient quantities, or the UI route to use.
 *
 * Goals belong to the world and not to a life, and they advance on deeds
 * rather than on state. An heir who lands to a lit fire has not lit one.
 */
import type { Calendar } from "./calendar";
import { qty } from "./inventory";
import type { FoodId } from "./items";
import type { GameState, GoalId, GoalState, ItemId, RecipeId, Season, StructureId, TaskId } from "./types";

export type { GoalId } from "./types";

/** Something this survivor did. The only thing that moves a goal. */
export type Deed =
  | { kind: "task"; id: TaskId; arg?: string }
  | { kind: "crafted"; recipe: RecipeId }
  /** Firewood as it leaves the ground or the block: the one moment that cannot be replayed by moving a pile's contents around. */
  | { kind: "gathered"; item: ItemId; kg: number }
  | { kind: "built"; structure: StructureId }
  /** The tinder caught. A light that failed is not a fire lit. */
  | { kind: "lit" }
  /** A fire alive at dusk, lit or embers, is still alive at the dawn roll. */
  | { kind: "keptNight" }
  /** How long, in minutes, the current run of keeping has lasted: the span since the fire was last lit from cold. */
  | { kind: "keptFor"; minutes: number }
  /** Minutes of rain the fire has been alive through, added up over its whole run and reset only when it dies: separate showers on the same fire all count. */
  | { kind: "keptRain"; minutes: number }
  /** Meat actually went on the rack. A hang that racked nothing put nothing by. */
  | { kind: "stored" }
  /** A real animal left evidence this survivor noticed. */
  | { kind: "foundSign" }
  /** Meat recovered from a carcass reached this survivor's camp. */
  | { kind: "recoveredAtCamp" }
  | { kind: "cooked"; kg: number; item?: ItemId }
  | { kind: "drank" }
  | { kind: "foodAcquired"; method: FoodMethod }
  | { kind: "ate"; item: FoodId | "sap" }
  | { kind: "preserved" }
  | { kind: "fuelled" }
  | { kind: "ordered"; task: TaskId; long: boolean }
  | { kind: "foodSourced" }
  | { kind: "ateFat" }
  | { kind: "toolCared" }
  | { kind: "explored"; anotherRegion: boolean }
  | { kind: "campedAgain"; region: number }
  | { kind: "seasonalFood" }
  | { kind: "winterStocked" }
  | { kind: "season"; season: Season };

export type GoalPhase = "firstWeek" | "firstMonth" | "firstSeason" | "longTerm";
export type FoodMethod = "forage" | "hunt" | "fish" | "snare" | "trap";

export interface GoalStepDef {
  id: string;
  label: string;
  target: number;
  unit?: string;
  credit: (d: Deed) => number;
  final?: boolean;
}

export interface GoalStepView {
  id: string;
  label: string;
  at: number;
  target: number;
  unit?: string;
  done: boolean;
}

export interface GoalDef {
  id: GoalId;
  phase: GoalPhase;
  /** The whole of what the player is told. There is deliberately no second line. */
  title: string;
  /** 1 for a one-shot; the count or the kilos for a counted goal. */
  target: number;
  /** What a counted goal prints beside its figure; absent on a one-shot, which draws no bar. */
  unit?: string;
  /** What this deed contributes, in the goal's own unit. 0 when unrelated. */
  credit: (d: Deed) => number;
  /** Stored, deed-driven checklist. The last final step cannot advance until every earlier step is complete. */
  steps: GoalStepDef[];
}

const task = (...ids: TaskId[]) => (d: Deed) => (d.kind === "task" && ids.includes(d.id) ? 1 : 0);
const built = (...ids: StructureId[]) => (d: Deed) => (d.kind === "built" && ids.includes(d.structure) ? 1 : 0);
const season = (s: Season) => (d: Deed) => (d.kind === "season" && d.season === s ? 1 : 0);

/** The kilos of firewood a gather actually produced, wet or dry: the goal is the gathering. */
const firewoodKg = (d: Deed) => (d.kind === "gathered" && (d.item === "firewood" || d.item === "wetFirewood") ? d.kg : 0);

const one = (id: string, label: string, credit: GoalDef["credit"], target = 1, unit?: string): GoalStepDef[] => [
  { id, label, credit, target, unit, final: true },
];
const step = (id: string, label: string, credit: GoalDef["credit"], target = 1, unit?: string): GoalStepDef => ({ id, label, credit, target, unit });
const crafted = (recipe: RecipeId) => (d: Deed) => (d.kind === "crafted" && d.recipe === recipe ? 1 : 0);
const acquired = (method?: FoodMethod) => (d: Deed) => (d.kind === "foodAcquired" && (!method || d.method === method) ? 1 : 0);
const ate = (...items: (FoodId | "sap")[]) => (d: Deed) => (d.kind === "ate" && items.includes(d.item) ? 1 : 0);
const preparedMeal = ate("berries", "cookedRoots", "seaweed", "eggs", "barkFlour", "cookedMeat", "cookedFish", "cookedOilyFish", "fat", "roe", "driedMeat", "sap");
const gatheredMeal = ate("berries", "cookedRoots", "seaweed", "eggs", "barkFlour", "sap");
const cookedMeat = ate("cookedMeat");
const cookedFish = ate("cookedFish", "cookedOilyFish");

/** The firewood goal's target, in kilos: named once so the title can never drift from the number the bar checks. */
const FIREWOOD_KG = 10;

export const WINTER_DRIED_MEAT_KG = 80;
export const WINTER_FAT_KG = 20;
export const WINTER_FIREWOOD_KG = 600;
export const WINTER_LOGS = 300;

export function winterStoreProgress(state: GameState): { food: boolean; fuel: boolean } {
  const st = state.regions[state.player.region];
  const inv = st?.campCell === null || st?.campCell === undefined ? undefined : state.piles[st.campCell];
  const food = Boolean(inv && qty(inv, "driedMeat") >= WINTER_DRIED_MEAT_KG && qty(inv, "fat") >= WINTER_FAT_KG);
  const fuel = Boolean(inv && qty(inv, "firewood") + (st?.fire.fuelKg ?? 0) >= WINTER_FIREWOOD_KG && qty(inv, "log") >= WINTER_LOGS);
  return { food, fuel };
}

export function checkWinterStores(state: GameState): void {
  const progress = winterStoreProgress(state);
  if (progress.food && progress.fuel) goalDeed(state, { kind: "winterStocked" });
}

/** The keeping goal's target, in days: named once so the title can never drift from the number the credit checks. */
export const KEPT_DAYS = 3;

export const GOALS: GoalDef[] = [
  { id: "site", phase: "firstWeek", title: "Choose where to live", target: 1, credit: task("makeCamp"), steps: one("camp", "Make camp", task("makeCamp")) },
  { id: "drink", phase: "firstWeek", title: "Drink water", target: 1, credit: (d) => (d.kind === "drank" ? 1 : 0), steps: one("drink", "Drink", (d) => (d.kind === "drank" ? 1 : 0)) },
  { id: "firewood", phase: "firstWeek", title: `Gather ${FIREWOOD_KG} kg of firewood`, target: FIREWOOD_KG, unit: "kg", credit: firewoodKg, steps: one("wood", `Gather ${FIREWOOD_KG} kg`, firewoodKg, FIREWOOD_KG, "kg") },
  {
    id: "fire", phase: "firstWeek", title: "Light a fire", target: 1, credit: (d) => (d.kind === "lit" ? 1 : 0),
    steps: [
      step("site", "Establish a fire site", built("firePit")),
      step("fuel", "Provide fuel", (d) => (d.kind === "fuelled" ? 1 : 0)),
      step("ignition", "Provide ignition", crafted("fireDrill")),
      { ...step("light", "Light the fire", (d) => (d.kind === "lit" ? 1 : 0)), final: true },
    ],
  },
  { id: "bed", phase: "firstWeek", title: "Get off the cold ground", target: 1, credit: built("boughBed"), steps: one("bed", "Build a bed", built("boughBed")) },
  { id: "roof", phase: "firstWeek", title: "Put a roof over your head", target: 1, credit: built("leanTo", "turfHut", "snowShelter", "cabin"), steps: one("roof", "Build a roof", built("leanTo", "turfHut", "snowShelter", "cabin")) },
  {
    id: "forageMeal", phase: "firstWeek", title: "Forage and eat a meal", target: 1, credit: gatheredMeal,
    steps: [step("gather", "Gather edible food", acquired("forage")), { ...step("eat", "Eat gathered food", gatheredMeal), final: true }],
  },
  { id: "cook", phase: "firstWeek", title: "Prepare and eat a hot meal", target: 1, credit: preparedMeal, steps: [step("cook", "Cook food", (d) => (d.kind === "cooked" && d.kg > 0 ? 1 : 0)), { ...step("eat", "Eat the meal", preparedMeal), final: true }] },
  { id: "keptNight", phase: "firstWeek", title: "Keep the fire alive overnight", target: 1, credit: (d) => (d.kind === "keptNight" ? 1 : 0), steps: one("night", "Keep the fire alive until dawn", (d) => (d.kind === "keptNight" ? 1 : 0)) },
  {
    id: "snareMeal", phase: "firstMonth", title: "Eat from a snare", target: 1, credit: cookedMeat,
    steps: [step("make", "Make a snare", crafted("snare")), step("set", "Set a snare", built("snare")), step("catch", "Collect its catch", acquired("snare")), { ...step("eat", "Eat cooked meat", cookedMeat), final: true }],
  },
  {
    id: "huntMeal", phase: "firstMonth", title: "Hunt, cook, and eat meat", target: 1, credit: cookedMeat,
    steps: [
      step("bow", "Make a bow", crafted("bow")),
      step("arrows", "Make arrows", crafted("arrows")),
      step("sign", "Find fresh animal sign", (d) => (d.kind === "foundSign" ? 1 : 0)),
      step("recover", "Bring meat back to camp", (d) => (d.kind === "recoveredAtCamp" ? 1 : 0)),
      { ...step("eat", "Eat cooked meat", cookedMeat), final: true },
    ],
  },
  {
    id: "fishMeal", phase: "firstMonth", title: "Catch, cook, and eat fish", target: 1, credit: cookedFish,
    steps: [step("spear", "Make a fishing spear", crafted("fishingSpear")), step("catch", "Catch fish", acquired("fish")), { ...step("eat", "Eat cooked fish", cookedFish), final: true }],
  },
  {
    id: "trapMeal", phase: "firstMonth", title: "Eat from a basket trap", target: 1, credit: cookedFish,
    steps: [step("make", "Make a basket trap", crafted("basketTrap")), step("set", "Set the trap", task("setTrap")), step("catch", "Collect fish", acquired("trap")), { ...step("eat", "Eat cooked fish", cookedFish), final: true }],
  },
  { id: "firstOrder", phase: "firstWeek", title: "Give a standing camp order", target: 1, credit: (d) => (d.kind === "ordered" && ["deadwood", "split", "splitWedges", "chop", "fill", "melt"].includes(d.task) ? 1 : 0), steps: one("order", "Give a standing order", (d) => (d.kind === "ordered" && ["deadwood", "split", "splitWedges", "chop", "fill", "melt"].includes(d.task) ? 1 : 0)) },
  { id: "water", phase: "firstMonth", title: "Keep water at camp", target: 1, credit: built("waterStore", "seep"), steps: one("source", "Establish storage or a camp source", built("waterStore", "seep")) },
  {
    id: "keptDays",
    phase: "firstMonth",
    title: "Keep a fire burning for three days",
    target: 1,
    credit: (d) => (d.kind === "keptFor" && d.minutes >= KEPT_DAYS * 24 * 60 ? 1 : 0),
    steps: one("fire", "Keep one fire alive for three days", (d) => (d.kind === "keptFor" && d.minutes >= KEPT_DAYS * 24 * 60 ? 1 : 0)),
  },
  { id: "foodSource", phase: "firstMonth", title: "Find a lasting food source", target: 1, credit: preparedMeal, steps: [step("source", "Establish a repeatable or passive source", acquired()), { ...step("eat", "Eat from that source", preparedMeal), final: true }] },
  { id: "store", phase: "firstMonth", title: "Put food by for later", target: 1, credit: ate("driedMeat"), steps: [step("preserve", "Preserve food", (d) => (d.kind === "preserved" ? 1 : 0)), { ...step("eat", "Eat preserved food", ate("driedMeat")), final: true }] },
  { id: "fat", phase: "firstMonth", title: "Find food with fat", target: 1, credit: (d) => (d.kind === "ateFat" ? 1 : 0), steps: one("fat", "Eat food containing fat", (d) => (d.kind === "ateFat" ? 1 : 0)) },
  { id: "longOrder", phase: "firstMonth", title: "Try a longer order", target: 1, credit: (d) => (d.kind === "ordered" && d.long ? 1 : 0), steps: one("order", "Give a grind or keep order", (d) => (d.kind === "ordered" && d.long ? 1 : 0)) },
  { id: "toolCare", phase: "firstMonth", title: "Keep a tool working", target: 1, credit: (d) => (d.kind === "toolCared" ? 1 : 0), steps: one("care", "Restore or replace a tool", (d) => (d.kind === "toolCared" ? 1 : 0)) },
  { id: "explore", phase: "firstSeason", title: "Explore another region", target: 1, credit: (d) => (d.kind === "explored" && d.anotherRegion ? 1 : 0), steps: one("explore", "Explore another region", (d) => (d.kind === "explored" && d.anotherRegion ? 1 : 0)) },
  { id: "secondCamp", phase: "firstSeason", title: "Establish a second camp", target: 1, credit: (d) => (d.kind === "campedAgain" ? 1 : 0), steps: one("camp", "Make camp in another region", (d) => (d.kind === "campedAgain" ? 1 : 0)) },
  { id: "seasonalFood", phase: "firstSeason", title: "Try a seasonal food", target: 1, credit: preparedMeal, steps: [step("gather", "Gather seasonal food", (d) => (d.kind === "seasonalFood" ? 1 : 0)), { ...step("eat", "Eat seasonal food", preparedMeal), final: true }] },
  { id: "durableRoof", phase: "firstSeason", title: "Build lasting shelter", target: 1, credit: built("turfHut", "cabin"), steps: one("roof", "Build a turf hut or cabin", built("turfHut", "cabin")) },
  { id: "winterStores", phase: "firstSeason", title: "Prepare stores for winter", target: 1, credit: (d) => (d.kind === "winterStocked" ? 1 : 0), steps: one("stores", "Store food and fuel", (d) => (d.kind === "winterStocked" ? 1 : 0)) },
  { id: "spring", phase: "longTerm", title: "Live to see the spring", target: 1, credit: season("spring"), steps: one("season", "Live into spring", season("spring")) },
  { id: "summer", phase: "longTerm", title: "Live to see the summer", target: 1, credit: season("summer"), steps: one("season", "Live into summer", season("summer")) },
  { id: "autumn", phase: "longTerm", title: "Live to see the autumn", target: 1, credit: season("autumn"), steps: one("season", "Live into autumn", season("autumn")) },
  { id: "winter", phase: "longTerm", title: "Live to see the winter", target: 1, credit: season("winter"), steps: one("season", "Live into winter", season("winter")) },
];

/** The seasons in the order they arrive, which is how the tail takes its turn. */
export const SEASON_ORDER: GoalId[] = ["spring", "summer", "autumn", "winter"];

const BY_ID = new Map(GOALS.map((g) => [g.id, g]));

export function goalDef(id: GoalId): GoalDef {
  const g = BY_ID.get(id);
  if (!g) throw new Error(`no such goal: ${id}`);
  return g;
}

export function newGoals(s: Season): GoalState {
  return { done: {}, progress: {}, stepProgress: {}, introduced: {}, queue: [], lastSeason: s };
}

/**
 * Goals open in authored groups. A group is a small set of jobs that make
 * sense together; the next group stays hidden until every job here is done.
 */
export const GOAL_STAGES: GoalId[][] = [
  ["site"],
  ["drink"],
  ["firewood"],
  ["fire"],
  ["bed", "roof", "keptNight"],
  ["forageMeal", "cook"],
  ["snareMeal", "huntMeal", "fishMeal"],
  ["trapMeal", "foodSource", "store"],
  ["fat"],
  ["firstOrder", "water", "keptDays"],
  ["longOrder", "toolCare"],
  ["explore"],
  ["secondCamp", "seasonalFood", "durableRoof"],
  ["winterStores"],
];

/** The next season to arrive that has not been seen here, or null when all four have. */
function nextSeason(state: GameState, cal: Calendar): GoalId | null {
  const now = SEASON_ORDER.indexOf(cal.season as GoalId);
  for (let i = 1; i <= SEASON_ORDER.length; i++) {
    const id = SEASON_ORDER[(now + i) % SEASON_ORDER.length];
    if (!state.goals.done[id]) return id;
  }
  return null;
}

/**
 * What the panel holds out: the unfinished goals in the first unfinished
 * authored stage. Once those are done, the seasonal tail exposes only the
 * next season due.
 */
export function activeGoals(state: GameState, cal: Calendar): GoalId[] {
  for (const stage of GOAL_STAGES) {
    const open = stage.filter((id) => !state.goals.done[id]);
    if (open.length > 0) return open;
  }
  const due = nextSeason(state, cal);
  return due ? [due] : [];
}

export function unintroducedGoals(state: GameState, cal: Calendar): GoalId[] {
  return activeGoals(state, cal).filter((id) => !state.goals.introduced[id]);
}

export function introduceGoals(state: GameState, ids: GoalId[]): void {
  for (const id of ids) state.goals.introduced[id] = true;
}

/**
 * Credits a deed against announced goals and returns the ones it finished.
 * Earlier deeds are never replayed. Every non-final checklist item may be
 * done in any order, while the final item waits for the rest of its goal.
 */
export function goalDeed(state: GameState, d: Deed): GoalId[] {
  const finished: GoalId[] = [];
  let specificMealTaken = false;
  const specificMeals = new Set<GoalId>(["forageMeal", "snareMeal", "huntMeal", "fishMeal", "trapMeal"]);
  for (const g of GOALS) {
    if (state.goals.done[g.id] || !state.goals.introduced[g.id]) continue;
    const progress = state.goals.stepProgress[g.id] ?? {};
    state.goals.stepProgress[g.id] = progress;
    const earlierDone = g.steps.filter((s) => !s.final).every((s) => (progress[s.id] ?? 0) + 1e-9 >= s.target);
    let changed = false;
    for (const s of g.steps) {
      const at = progress[s.id] ?? 0;
      if (at + 1e-9 >= s.target) continue;
      if (s.final && !earlierDone) continue;
      if (s.final && d.kind === "ate" && specificMeals.has(g.id) && specificMealTaken) continue;
      const credit = s.credit(d);
      if (credit <= 0) continue;
      progress[s.id] = Math.min(s.target, at + credit);
      changed = true;
      if (s.final && d.kind === "ate" && specificMeals.has(g.id)) specificMealTaken = true;
    }
    if (!changed) continue;
    const complete = g.steps.every((s) => (progress[s.id] ?? 0) + 1e-9 >= s.target);
    state.goals.progress[g.id] = complete ? g.target : Math.min(g.target, progress[g.steps[0].id] ?? 0);
    if (complete) {
      state.goals.done[g.id] = true;
      state.goals.queue.push(g.id);
      finished.push(g.id);
    }
  }
  return finished;
}

export function goalSteps(state: GameState, id: GoalId): GoalStepView[] {
  const g = goalDef(id);
  const progress = state.goals.stepProgress[id] ?? {};
  return g.steps.map((s) => {
    const at = Math.min(s.target, progress[s.id] ?? (state.goals.done[id] ? s.target : 0));
    return { id: s.id, label: s.label, at, target: s.target, unit: s.unit, done: at + 1e-9 >= s.target };
  });
}
