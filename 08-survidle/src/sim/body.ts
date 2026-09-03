/**
 * The body tier of an intent: sleep, cold and hunger, in that order, and
 * what to do about each. Every step is an ordinary task; the fire steps are
 * guarded by check, so a missing drill or an under-level pit is skipped,
 * never an error.
 */
import type { Rng } from "../rng";
import { PACK_COMFORTABLE_KG } from "../units";
import { regionAt, type World } from "../world/gen";
import { eat } from "./actions";
import type { Calendar } from "./calendar";
import { hasTool, pile, qty, transfer, weight } from "./inventory";
import { AUTO_EAT_ORDER, type FoodId, ITEM_KG } from "./items";
import { log } from "./log";
import { cellOf } from "./position";
import { regionState } from "./regionstate";
import { isRunning, type Step, walkStep } from "./steps";
import { check } from "./tasks";
import type { BodyNeed, GameState, Intent } from "./types";

export const SLEEP_AT = 20;
export const NIGHT_SLEEP_UNDER = 60;
export const COLD_UNDER = 30;
export const WARM_AT = 45;
export const HUNGRY_UNDER = 1800;
export const PROVISION_KG = 2;
/** Densest first, so two kilos carry the most days. */
const PROVISIONS: FoodId[] = ["driedMeat", "cookedMeat", "cookedFish", "berries"];

/** The need that holds now, sleep first. A need already being served keeps holding until its own exit. */
export function currentNeed(state: GameState, world: World, cal: Calendar, it: Intent): BodyNeed | null {
  const p = state.player;
  const sleep = it.need === "sleep"
    || p.energy <= SLEEP_AT
    || (cal.isNight && p.energy < NIGHT_SLEEP_UNDER)
    || (it.task === "night" && it.done < 1);
  if (sleep) return "sleep";
  const cold = p.warmth < COLD_UNDER || (it.need === "cold" && p.warmth < WARM_AT);
  if (cold && campCanWarm(state, world, cal)) return "cold";
  if (p.kcal < HUNGRY_UNDER) return "hungry";
  return null;
}

/** The step a need calls for, or null when there is nothing to start for it. */
export function bodyStep(state: GameState, world: World, cal: Calendar, rng: Rng, need: BodyNeed): Step | null {
  if (need === "hungry") return hungryStep(state, world, cal, rng);
  return campStep(state, world, cal, need);
}

/**
 * The fire step waiting at a cell: build the pit, split fuel for it, or
 * light it. Null once the fire is already lit or nothing more can be done
 * there. Judged at a given cell (rather than wherever the player stands) so
 * a body already at camp and one still deciding whether the walk is worth
 * it never disagree about what camp offers.
 */
function fireStep(state: GameState, world: World, cal: Calendar, at: number): Step | null {
  const p = state.player;
  const st = regionState(state, world, p.region);
  if (st.fire.lit) return null;
  if (!st.structures.firePit) {
    return check(state, world, cal, "build", "firePit", at).ok ? { id: "build", arg: "firePit", step: "laying a fire pit" } : null;
  }
  if (check(state, world, cal, "light", undefined, at).ok) return { id: "light", step: "lighting the fire" };
  const firewood = qty(state.player.pack, "firewood") + qty(pile(state, at), "firewood");
  if (hasTool(p, "fireDrill") && firewood < 1 && check(state, world, cal, "split", undefined, at).ok) {
    return { id: "split", step: "splitting a log for the fire" };
  }
  return null;
}

/**
 * Whether this region's camp can actually warm a cold body: a fire already
 * lit, a roof over it, or a fire step still waiting there. A camp with none
 * of these cannot help; the cold need does not send the runner to a rest
 * that only makes it colder than working would have.
 */
function campCanWarm(state: GameState, world: World, cal: Calendar): boolean {
  const st = regionState(state, world, state.player.region);
  if (st.fire.lit || st.structures.leanTo || st.structures.cabin) return true;
  return fireStep(state, world, cal, st.campCell) !== null;
}

/** Walk to this region's camp, make a fire if the means are here, then sleep or rest. */
function campStep(state: GameState, world: World, cal: Calendar, need: "sleep" | "cold"): Step {
  const p = state.player;
  const st = regionState(state, world, p.region);
  const here = cellOf(state, world);
  const it = state.intent!;
  if (here !== st.campCell) {
    const why = need === "sleep" ? " for the night" : " to warm up";
    if (check(state, world, cal, "walk", `cell:${st.campCell}`).ok) return walkStep(state, world, st.campCell, why);
    const s: Step = need === "sleep"
      ? { id: "sleep", step: "sleeping where you stand; no way to camp" }
      : { id: "rest", step: "resting to warm up; no way to camp" };
    if (!isRunning(state, s) && need === "sleep") log(state, "No way to camp from here. You sleep where you are.", "bad");
    return s;
  }
  const fs = fireStep(state, world, cal, st.campCell);
  if (fs) return fs;
  if (need === "sleep") {
    const s: Step = { id: "sleep", step: "sleeping" };
    if (!isRunning(state, s) && st.campCell !== it.campCell) log(state, `You turn in at camp in ${regionAt(world, p.region).name}.`);
    return s;
  }
  return { id: "rest", step: st.fire.lit ? "warming up by the fire" : "resting to warm up" };
}

/** Eat what is in reach; else go where the food is; else nothing. */
function hungryStep(state: GameState, world: World, cal: Calendar, rng: Rng): Step | null {
  const it = state.intent!;
  for (const food of AUTO_EAT_ORDER) {
    if (eat(state, world, food, rng)) return null;
  }
  if (cellOf(state, world) === it.campCell) return null;
  const camp = pile(state, it.campCell);
  if (!AUTO_EAT_ORDER.some((f) => qty(camp, f) > 1e-9)) return null;
  if (!check(state, world, cal, "walk", `cell:${it.campCell}`).ok) return null;
  return walkStep(state, world, it.campCell, " to eat");
}

/**
 * Lunch for the day: at the home camp, pocket safe food from the pile up to
 * PROVISION_KG in the pack, never past the comfortable load.
 */
export function provision(state: GameState, world: World): void {
  const it = state.intent;
  if (!it || cellOf(state, world) !== it.campCell) return;
  const pack = state.player.pack;
  const camp = pile(state, it.campCell);
  let want = PROVISION_KG - PROVISIONS.reduce((a, f) => a + qty(pack, f), 0);
  let room = PACK_COMFORTABLE_KG - weight(pack);
  for (const f of PROVISIONS) {
    if (want <= 1e-9 || room <= 1e-9) return;
    const kg = Math.min(want, room, qty(camp, f)) / ITEM_KG[f];
    if (kg <= 1e-9) continue;
    const moved = transfer(camp, pack, f, kg);
    want -= moved;
    room -= moved;
  }
}
