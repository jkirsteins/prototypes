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
import type { GameState, GoalId, GoalState, ItemId, Season, StructureId, TaskId } from "./types";

export type { GoalId } from "./types";

/** Something this survivor did. The only thing that moves a goal. */
export type Deed =
  | { kind: "task"; id: TaskId; arg?: string }
  | { kind: "delivered"; item: ItemId; kg: number }
  | { kind: "built"; structure: StructureId }
  /** The tinder caught. A light that failed is not a fire lit. */
  | { kind: "lit" }
  /** Meat actually went on the rack. A hang that racked nothing put nothing by. */
  | { kind: "stored" }
  | { kind: "season"; season: Season };

export interface GoalDef {
  id: GoalId;
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

/** The kilos of firewood in a delivery, wet or dry: the goal is the carrying. */
const firewoodKg = (d: Deed) => (d.kind === "delivered" && (d.item === "firewood" || d.item === "wetFirewood") ? d.kg : 0);

/** The firewood goal's target, in kilos: named once so the title can never drift from the number the bar checks. */
const FIREWOOD_KG = 10;

export const GOALS: GoalDef[] = [
  { id: "firewood", title: `Bring ${FIREWOOD_KG} kg of firewood back to camp`, target: FIREWOOD_KG, unit: "kg", credit: firewoodKg },
  { id: "fire", title: "Light a fire", target: 1, credit: (d) => (d.kind === "lit" ? 1 : 0) },
  { id: "cook", title: "Cook something over it", target: 1, credit: task("cook") },
  { id: "bed", title: "Get off the cold ground", target: 1, credit: built("boughBed") },
  { id: "roof", title: "Put a roof over your head", target: 1, credit: built("leanTo", "turfHut", "snowShelter") },
  { id: "water", title: "Keep water at camp", target: 1, credit: built("waterStore", "seep") },
  { id: "snare", title: "Set a snare", target: 1, credit: built("snare") },
  { id: "store", title: "Put food by for later", target: 1, credit: (d) => (d.kind === "stored" ? 1 : 0) },
  { id: "spring", title: "Live to see the spring", target: 1, credit: season("spring") },
  { id: "summer", title: "Live to see the summer", target: 1, credit: season("summer") },
  { id: "autumn", title: "Live to see the autumn", target: 1, credit: season("autumn") },
  { id: "winter", title: "Live to see the winter", target: 1, credit: season("winter") },
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
  return { done: {}, progress: {}, queue: [], lastSeason: s };
}

/**
 * How many goals are held out at once. One through the fire and food
 * chain, where the player has the fewest tools and the least idea what
 * matters; two from the point the goals stop being a chain, three once
 * they are wholly parallel jobs competing for the same materials.
 */
function width(firstOpen: number): number {
  if (firstOpen >= 5) return 3;
  if (firstOpen >= 3) return 2;
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
