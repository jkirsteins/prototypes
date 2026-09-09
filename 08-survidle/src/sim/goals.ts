/**
 * The goal ladder: what the world is asked to reach, in order, one at a
 * time in the opening and more later. A goal names an outcome and never a
 * route - the player is told a fire is worth having and left to find out
 * that lighting one has parts, because finding that out is the game.
 *
 * Goals belong to the world and not to a life, and they advance on deeds
 * rather than on state. An heir who lands to a lit fire has not lit one.
 */
import type { Calendar } from "./calendar";
import { qty } from "./inventory";
import type { GameState, GoalId, GoalState, ItemId, Protection, Season, StructureId, TaskId } from "./types";

export type { GoalId } from "./types";

/** Something this survivor did. The only thing that moves a goal. */
export type Deed =
  | { kind: "task"; id: TaskId; arg?: string }
  /** Firewood as it leaves the ground or the block: the one moment that cannot be replayed by moving a pile's contents around. */
  | { kind: "gathered"; item: ItemId; kg: number }
  | { kind: "built"; structure: StructureId }
  | { kind: "sheltered"; protection: Protection }
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
  | { kind: "cooked"; kg: number }
  | { kind: "drank" }
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
}

const task = (...ids: TaskId[]) => (d: Deed) => (d.kind === "task" && ids.includes(d.id) ? 1 : 0);
const built = (...ids: StructureId[]) => (d: Deed) => (d.kind === "built" && ids.includes(d.structure) ? 1 : 0);
const season = (s: Season) => (d: Deed) => (d.kind === "season" && d.season === s ? 1 : 0);
const roof = (d: Deed) => d.kind === "sheltered"
  ? (d.protection >= 2 ? 1 : 0)
  : built("leanTo", "turfHut", "snowShelter", "cabin")(d);

/** The kilos of firewood a gather actually produced, wet or dry: the goal is the gathering. */
const firewoodKg = (d: Deed) => (d.kind === "gathered" && (d.item === "firewood" || d.item === "wetFirewood") ? d.kg : 0);

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
  { id: "site", phase: "firstWeek", title: "Choose where to live", target: 1, credit: task("makeCamp") },
  { id: "drink", phase: "firstWeek", title: "Drink water", target: 1, credit: (d) => (d.kind === "drank" ? 1 : 0) },
  { id: "firewood", phase: "firstWeek", title: `Gather ${FIREWOOD_KG} kg of firewood`, target: FIREWOOD_KG, unit: "kg", credit: firewoodKg },
  { id: "fire", phase: "firstWeek", title: "Light a fire", target: 1, credit: (d) => (d.kind === "lit" ? 1 : 0) },
  { id: "bed", phase: "firstWeek", title: "Get off the cold ground", target: 1, credit: built("boughBed") },
  { id: "roof", phase: "firstWeek", title: "Put a roof over your head", target: 1, credit: roof },
  { id: "cook", phase: "firstWeek", title: "Cook something over the fire", target: 1, credit: (d) => (d.kind === "cooked" && d.kg > 0 ? 1 : 0) },
  { id: "keptNight", phase: "firstWeek", title: "Keep the fire alive overnight", target: 1, credit: (d) => (d.kind === "keptNight" ? 1 : 0) },
  { id: "firstOrder", phase: "firstWeek", title: "Give a standing camp order", target: 1, credit: (d) => (d.kind === "ordered" && ["deadwood", "split", "splitWedges", "chop", "fill", "melt"].includes(d.task) ? 1 : 0) },
  { id: "water", phase: "firstMonth", title: "Keep water at camp", target: 1, credit: built("waterStore", "seep") },
  {
    id: "keptDays",
    phase: "firstMonth",
    title: "Keep a fire burning for three days",
    target: 1,
    credit: (d) => (d.kind === "keptFor" && d.minutes >= KEPT_DAYS * 24 * 60 ? 1 : 0),
  },
  { id: "foodSource", phase: "firstMonth", title: "Find a lasting food source", target: 1, credit: (d) => (d.kind === "foodSourced" ? 1 : 0) },
  { id: "store", phase: "firstMonth", title: "Put food by for later", target: 1, credit: (d) => (d.kind === "stored" ? 1 : 0) },
  { id: "fat", phase: "firstMonth", title: "Find food with fat", target: 1, credit: (d) => (d.kind === "ateFat" ? 1 : 0) },
  { id: "longOrder", phase: "firstMonth", title: "Try a longer order", target: 1, credit: (d) => (d.kind === "ordered" && d.long ? 1 : 0) },
  { id: "toolCare", phase: "firstMonth", title: "Keep a tool working", target: 1, credit: (d) => (d.kind === "toolCared" ? 1 : 0) },
  { id: "explore", phase: "firstSeason", title: "Explore another region", target: 1, credit: (d) => (d.kind === "explored" && d.anotherRegion ? 1 : 0) },
  { id: "secondCamp", phase: "firstSeason", title: "Establish a second camp", target: 1, credit: (d) => (d.kind === "campedAgain" ? 1 : 0) },
  { id: "seasonalFood", phase: "firstSeason", title: "Try a seasonal food", target: 1, credit: (d) => (d.kind === "seasonalFood" ? 1 : 0) },
  { id: "durableRoof", phase: "firstSeason", title: "Build lasting shelter", target: 1, credit: built("turfHut", "cabin") },
  { id: "winterStores", phase: "firstSeason", title: "Prepare stores for winter", target: 1, credit: (d) => (d.kind === "winterStocked" ? 1 : 0) },
  { id: "spring", phase: "longTerm", title: "Live to see the spring", target: 1, credit: season("spring") },
  { id: "summer", phase: "longTerm", title: "Live to see the summer", target: 1, credit: season("summer") },
  { id: "autumn", phase: "longTerm", title: "Live to see the autumn", target: 1, credit: season("autumn") },
  { id: "winter", phase: "longTerm", title: "Live to see the winter", target: 1, credit: season("winter") },
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
  return { done: {}, progress: {}, introduced: {}, queue: [], lastSeason: s };
}

/**
 * The first goal past the opening chain: everything up to and including
 * keeping a fire overnight is still one path with the fewest tools and
 * the least idea what matters, so it stays single-file. Named by id, not
 * by index, so inserting a goal ahead of "bed" widens the chain with it
 * instead of silently shifting a number that used to mean "bed".
 */
const WIDENS_TO_2: GoalId = "bed";
/**
 * The first goal where camp jobs stop being a chain and start competing
 * for the same materials in parallel. Same reasoning as WIDENS_TO_2.
 */
const WIDENS_TO_3: GoalId = "water";

/**
 * How many goals are held out at once, re-derived from the ladder itself
 * on every call rather than cached, since GOALS is a short constant array
 * and a stale cache is a worse risk than the lookup.
 */
function width(firstOpen: number): number {
  if (firstOpen >= GOALS.findIndex((g) => g.id === WIDENS_TO_3)) return 3;
  if (firstOpen >= GOALS.findIndex((g) => g.id === WIDENS_TO_2)) return 2;
  return 1;
}

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
 * What the panel holds out: the first N incomplete goals, with the whole
 * seasonal tail collapsed into one slot. Three lines saying "keep living"
 * is one line.
 */
export function activeGoals(state: GameState, cal: Calendar): GoalId[] {
  const open = GOALS.filter((g) => !state.goals.done[g.id]);
  if (open.length === 0) return [];
  const n = width(GOALS.findIndex((g) => g.id === open[0].id));
  const out: GoalId[] = [];
  let seasonTaken = false;
  for (const g of open) {
    if (out.length >= n) break;
    if (SEASON_ORDER.includes(g.id)) {
      if (seasonTaken) continue;
      seasonTaken = true;
      const s = nextSeason(state, cal);
      if (s) out.push(s);
      continue;
    }
    out.push(g.id);
  }
  return out;
}

export function unintroducedGoals(state: GameState, cal: Calendar): GoalId[] {
  return activeGoals(state, cal).filter((id) => !state.goals.introduced[id]);
}

export function introduceGoals(state: GameState, ids: GoalId[]): void {
  for (const id of ids) state.goals.introduced[id] = true;
}

/**
 * Credits a deed against every goal still open and returns the ones it
 * finished, queued for their congratulation. A goal reached before the
 * ladder got round to asking still counts: nobody should be told to build
 * a turf hut twice.
 */
export function goalDeed(state: GameState, d: Deed): GoalId[] {
  const finished: GoalId[] = [];
  for (const g of GOALS) {
    if (state.goals.done[g.id]) continue;
    const c = g.credit(d);
    if (c <= 0) continue;
    const at = (state.goals.progress[g.id] ?? 0) + c;
    state.goals.progress[g.id] = at;
    if (at + 1e-9 >= g.target) {
      state.goals.done[g.id] = true;
      state.goals.queue.push(g.id);
      finished.push(g.id);
    }
  }
  return finished;
}
