/**
 * The body tier of an intent: sleep, cold and hunger, in that order, and
 * what to do about each. Every step is an ordinary task; the fire steps are
 * guarded by check, so a missing drill or an under-level pit is skipped,
 * never an error.
 */
import type { Rng } from "../rng";
import { PACK_COMFORTABLE_KG } from "../units";
import { findRoute, routeMinutes } from "../world/route";
import { regionAt, type World } from "../world/gen";
import { eat } from "./actions";
import type { Calendar } from "./calendar";
import { feedFire } from "./camp";
import { fireWarms, fuelTotal, SPREAD_FUEL_KG } from "./fire";
import { hasTool, pile, qty, transfer, weight } from "./inventory";
import { AUTO_EAT_ORDER, type FoodId, ITEM_KG } from "./items";
import { log } from "./log";
import { baseWalkSpeed } from "./player";
import { cellOf, straightKm, watersideCell } from "./position";
import { regionState } from "./regionstate";
import { isRunning, type Step, walkStep } from "./steps";
import { check } from "./tasks";
import type { BodyNeed, GameState, Intent } from "./types";
import { drink, fillVessels, ICE_SHORE_CM, THIRSTY_L, vesselLitres, waterSource } from "./water";
import { stormComing, stormNow, walkableIce } from "./weather";

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
  if (stormComing(state.weather, state.minute) || stormNow(state.weather, state.minute)) return "storm";
  // Warm again: whatever a spent rest gave up on is worth trying afresh next time it turns cold.
  if (p.warmth >= WARM_AT) it.coldSpent = false;
  const cold = !it.coldSpent && (p.warmth < COLD_UNDER || (it.need === "cold" && p.warmth < WARM_AT));
  if (cold && campCanWarm(state, world, cal)) return "cold";
  if (p.kcal < HUNGRY_UNDER) return "hungry";
  if (p.water < THIRSTY_L && canQuench(state, world, cal)) return "thirsty";
  if (homeBeforeDark(state, world, cal, it)) return "home";
  return null;
}

/** Minutes to this region's camp on foot right now, or null when there is no way there. Zero already there. */
export function minutesToCamp(state: GameState, world: World, cal: Calendar): number | null {
  const st = regionState(state, world, state.player.region);
  const here = cellOf(state, world);
  if (here === st.campCell) return 0;
  const ice = walkableIce(state.weather);
  const route = findRoute(world, here, st.campCell, ice);
  if (!route) return null;
  return routeMinutes(world, route, baseWalkSpeed(state, cal, state.weather), ice);
}

/**
 * Winter days are short: leave the work so as to reach camp by sunset.
 * Sticky once it holds, until night actually falls, so the boundary the
 * walk time sets does not flicker the need in and out and send the runner
 * back out for one more minute of work between crossings.
 */
function homeBeforeDark(state: GameState, world: World, cal: Calendar, it: Intent): boolean {
  if (cal.season !== "winter" || cal.isNight) return false;
  if (it.need === "home") return true;
  const st = regionState(state, world, state.player.region);
  // Already at camp: nothing to walk home for. The old 15-minutes-to-sunset
  // check fired here too and only ever idled the evening away at rest.
  if (cellOf(state, world) === st.campCell) return false;
  const minutes = minutesToCamp(state, world, cal);
  if (minutes === null) return false;
  return (cal.sunset - cal.hour) * 60 <= minutes + 15;
}

/** The step a need calls for, or null when there is nothing to start for it. */
export function bodyStep(state: GameState, world: World, cal: Calendar, rng: Rng, it: Intent, need: BodyNeed): Step | null {
  switch (need) {
    case "hungry": return hungryStep(state, world, cal, rng, it);
    case "thirsty": return thirstyStep(state, world, cal);
    case "storm": return stormStep(state, world, cal);
    case "home": return homeStep(state, world, cal);
    default: return campStep(state, world, cal, it, need);
  }
}

/** The nearest waterside cell in this region to fetch water from, not this cell, not iced over, and a walk there can start. Null otherwise. */
function shoreForWater(state: GameState, world: World, cal: Calendar): number | null {
  if (state.weather.iceCm >= ICE_SHORE_CM) return null;
  const here = cellOf(state, world);
  const r = regionAt(world, state.player.region);
  const candidates = r.cells
    .filter((c) => c !== here && watersideCell(world, c))
    .sort((a, b) => straightKm(world, here, a) - straightKm(world, here, b));
  for (const cell of candidates) {
    if (check(state, world, cal, "walk", `cell:${cell}`).ok) return cell;
  }
  return null;
}

/** Whether this region's camp can melt snow for water right now: a lit fire, snow on the ground, and camp in reach. */
function campMeltReady(state: GameState, world: World, cal: Calendar): boolean {
  const st = regionState(state, world, state.player.region);
  if (!st.fire.lit || state.weather.snowCm < 1) return false;
  return cellOf(state, world) === st.campCell
    ? check(state, world, cal, "melt").ok
    : check(state, world, cal, "walk", `cell:${st.campCell}`).ok;
}

/** Whether thirst can actually be done anything about here and now; gates the need the way campCanWarm gates cold. */
function canQuench(state: GameState, world: World, cal: Calendar): boolean {
  return vesselLitres(state.player) > 0
    || waterSource(state, world)
    || shoreForWater(state, world, cal) !== null
    || campMeltReady(state, world, cal);
}

/** Drink in reach; else walk to the region's shore when it is not iced over; else walk to camp and melt snow at the fire; else nothing. */
function thirstyStep(state: GameState, world: World, cal: Calendar): Step | null {
  if (drink(state, world)) return null;
  const shoreCell = shoreForWater(state, world, cal);
  if (shoreCell !== null) return walkStep(state, world, shoreCell, " for water");
  if (campMeltReady(state, world, cal)) {
    const st = regionState(state, world, state.player.region);
    return cellOf(state, world) === st.campCell
      ? { id: "melt", step: "melting snow" }
      : walkStep(state, world, st.campCell, " for water");
  }
  return null;
}

/** Walk to this region's camp, light a fire there if a cold pit allows it, keep it fed against the wind with dry wood, then wait the storm out. */
function stormStep(state: GameState, world: World, cal: Calendar): Step | null {
  const st = regionState(state, world, state.player.region);
  const here = cellOf(state, world);
  if (here !== st.campCell) {
    return check(state, world, cal, "walk", `cell:${st.campCell}`).ok ? walkStep(state, world, st.campCell, " before the storm") : null;
  }
  const fs = fireStep(state, world, cal, st.campCell);
  if (fs) return fs;
  if (st.fire.lit && fuelTotal(st.fire) < SPREAD_FUEL_KG) feedFire(state, world, state.player.region, SPREAD_FUEL_KG - fuelTotal(st.fire), true);
  return { id: "rest", step: "waiting out the storm" };
}

/** Walk to this region's camp and settle in before dark. */
function homeStep(state: GameState, world: World, cal: Calendar): Step | null {
  const st = regionState(state, world, state.player.region);
  if (cellOf(state, world) !== st.campCell) {
    return check(state, world, cal, "walk", `cell:${st.campCell}`).ok ? walkStep(state, world, st.campCell, " before dark") : null;
  }
  return { id: "rest", step: "in before dark" };
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
  if (fireWarms(st) || st.structures.leanTo || st.structures.cabin) return true;
  return fireStep(state, world, cal, st.campCell) !== null;
}

/** Walk to this region's camp, make a fire if the means are here, then sleep or rest. */
function campStep(state: GameState, world: World, cal: Calendar, it: Intent, need: "sleep" | "cold"): Step {
  const p = state.player;
  const st = regionState(state, world, p.region);
  const here = cellOf(state, world);
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
function hungryStep(state: GameState, world: World, cal: Calendar, rng: Rng, it: Intent): Step | null {
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
 * PROVISION_KG in the pack, never past the comfortable load. `want` and `kg`
 * below read `qty` as kilos directly: every item in PROVISIONS has
 * ITEM_KG === 1, so a count and its weight are the same number.
 */
export function provision(state: GameState, world: World): void {
  const it = state.intent;
  if (!it || cellOf(state, world) !== it.campCell) return;
  const pack = state.player.pack;
  const camp = pile(state, it.campCell);
  let want = PROVISION_KG - PROVISIONS.reduce((a, f) => a + qty(pack, f), 0);
  let room = PACK_COMFORTABLE_KG - weight(pack);
  for (const f of PROVISIONS) {
    if (want <= 1e-9 || room <= 1e-9) break;
    const kg = Math.min(want, room, qty(camp, f)) / ITEM_KG[f];
    if (kg <= 1e-9) continue;
    const moved = transfer(camp, pack, f, kg);
    want -= moved;
    room -= moved;
  }
  // A waterside camp tops off every vessel along with lunch, the same errand.
  if (waterSource(state, world)) fillVessels(state, world);
}
